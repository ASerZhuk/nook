"""Быстрая запись одной строкой: ИИ (OpenAI-совместимый API) разбирает текст мастера в черновик записи."""
import datetime as dt
import json
import logging
import re
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Client, Master, Service
from app.schemas import QuickBookingDraft
from app.services.booking import free_slots, has_conflict, is_valid_phone, normalize_phone

log = logging.getLogger(__name__)

WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]

SYSTEM_PROMPT = """Ты помогаешь частному мастеру записывать клиентов. Мастер пишет запись одной строкой, как в блокноте: в любом порядке, с сокращениями, сленгом и опечатками.
Верни ТОЛЬКО JSON-объект:
{"client_name": string|null, "client_phone": string|null, "service_id": string|null, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "time_of_day": "morning"|"afternoon"|"evening"|null}

Правила:
- service_id — id самой подходящей по смыслу услуги из списка мастера. Учитывай сленг: «шилак», «шеллак», «гель», «гелька» — покрытие гель-лак; «педик» — педикюр; «снятие» — снятие покрытия. Если ни одна не подходит — null.
- date: понимай «сегодня», «завтра», «послезавтра», дни недели (ближайший будущий), форматы 16.09, 16/09, 16-09, «16 сентября». Год текущий; если такая дата в этом году уже прошла — следующий год.
- time: 24-часовой формат HH:MM, только если в тексте есть конкретный час. «13.30», «13-30», «в 13» → 13:30 / 13:00. Время без уточнения от 1 до 7 («в 3», «полчетвёртого») считай дневным (15:00, 15:30).
- time_of_day — когда час не назван, а есть только часть дня: «утро», «с утра», «утречком», «первая половина дня», «до обеда», «пораньше» → morning; «день», «днём», «после обеда», «вторая половина дня», «в обед» → afternoon; «вечер», «вечерком», «после работы», «поздно», «попозже» → evening. Точное время подберём сами. Если назван конкретный час — time_of_day = null.
- client_phone: цифры номера ровно как в тексте (с + если есть), ничего не добавляй и не исправляй.
- client_name: имя клиента в именительном падеже («Анну» → «Анна»), с фамилией, если она есть.
- Ничего не выдумывай: если данных нет в тексте — null."""

# части дня для «на утро», «после обеда» — границы и подпись для мастера
TIME_OF_DAY = {
    "morning": (dt.time(0), dt.time(12), "утром"),
    "afternoon": (dt.time(12), dt.time(18), "днём"),
    "evening": (dt.time(18), dt.time.max, "вечером"),
}


class QuickParseError(RuntimeError):
    pass


async def ask_llm(text: str, services: list[Service], now: dt.datetime) -> dict[str, Any]:
    if not settings.vsellm_token:
        raise QuickParseError("VSELLM_TOKEN is not set")
    service_lines = "\n".join(f"- id={s.id}: {s.name} ({s.duration_minutes} мин)" for s in services)
    user_message = f"Сейчас: {now:%Y-%m-%d %H:%M}, {WEEKDAYS[now.weekday()]}.\nУслуги мастера:\n{service_lines}\n\nЗапись мастера: {text}"

    payload = {
        "model": settings.vsellm_model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_message}],
        "response_format": {"type": "json_object"},
    }
    last_error = QuickParseError("LLM request failed")
    for attempt in range(2):  # один повтор: сервис изредка отвечает сбоем
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(40, connect=10)) as client:
                response = await client.post(
                    f"{settings.vsellm_base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.vsellm_token}"},
                    json=payload,
                )
            if response.status_code == 429 or response.status_code >= 500:
                last_error = QuickParseError(f"LLM HTTP {response.status_code}: {response.text[:300]}")
                log.warning("Quick parse attempt %s failed: %s", attempt + 1, last_error)
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"] or ""
            break
        except httpx.HTTPStatusError as exc:
            raise QuickParseError(f"LLM HTTP {exc.response.status_code}: {exc.response.text[:300]}") from exc
        except httpx.HTTPError as exc:
            last_error = QuickParseError(f"LLM request failed: {exc!r}")
            log.warning("Quick parse attempt %s failed: %s", attempt + 1, last_error)
        except (KeyError, IndexError, ValueError) as exc:
            raise QuickParseError(f"LLM bad response: {exc!r}") from exc
    else:
        raise last_error

    match = re.search(r"\{.*\}", content, re.S)
    try:
        data = json.loads(match.group(0) if match else content)
    except ValueError as exc:
        raise QuickParseError(f"LLM returned non-JSON: {content[:300]!r}") from exc
    if not isinstance(data, dict):
        raise QuickParseError(f"LLM returned unexpected JSON: {data!r}")
    return data


def _date(value: Any) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


def _time(value: Any) -> str | None:
    match = re.fullmatch(r"(\d{1,2})[:.](\d{2})", str(value or "").strip())
    if not match or int(match[1]) > 23 or int(match[2]) > 59:
        return None
    return f"{int(match[1]):02d}:{match[2]}"


async def build_draft(
    session: AsyncSession, master: Master, services: list[Service], raw: dict[str, Any], now: dt.datetime
) -> QuickBookingDraft:
    """Проверяет ответ ИИ: услуга только из списка мастера, телефон по имени из клиентов, свободно ли время."""
    service = next((s for s in services if s.id == raw.get("service_id")), None)
    if not service and len(services) == 1:  # одна услуга у мастера — указывать её не нужно
        service = services[0]
    name = str(raw.get("client_name") or "").strip()[:120]
    raw_digits = re.sub(r"\D", "", str(raw.get("client_phone") or ""))
    phone = normalize_phone(raw_digits) if raw_digits else ""
    known_client = False

    if name and not phone:  # «Анну на завтра в 15» — постоянный клиент без номера
        key = name.casefold()
        clients = (await session.scalars(select(Client).where(Client.master_id == master.id))).all()
        matches = [c for c in clients if c.name.casefold() == key or (c.name.casefold().split() or [""])[0] == key]
        if len(matches) == 1:
            name, phone, known_client = matches[0].name, matches[0].phone, True
    elif phone:
        known_client = await session.scalar(select(Client.id).where(Client.master_id == master.id, Client.phone == phone)) is not None

    date, time = _date(raw.get("date")), _time(raw.get("time"))
    warnings: list[str] = []
    notes: list[str] = []

    # «на утро», «первая половина дня» — точного часа нет, подбираем ближайшее свободное окно
    period = TIME_OF_DAY.get(str(raw.get("time_of_day") or "").strip().lower())
    no_free_time = False
    if period and not time and date and service:
        since, until, label = period
        slots = await free_slots(session, master.id, service.duration_minutes, date)
        slot = next((start for start, _ in slots if since <= start.time() < until and start > now), None)
        if slot:
            time = f"{slot:%H:%M}"
            notes.append(f"Взяли ближайшее свободное время {label}")
        else:
            no_free_time = True
            warnings.append(f"Свободного времени {label} нет — выберите другое")

    if not service:
        warnings.append("Не удалось определить услугу — выберите её")
    if not name:
        warnings.append("Укажите имя клиента")
    # без номера записываем (мастер увидит предупреждение), а неполный номер — на проверку
    if phone and (len(raw_digits) == 10 and raw_digits.startswith("8") or not is_valid_phone(phone)):
        warnings.append("Проверьте номер — похоже, пропущена цифра")
    if not date or not time:
        if not no_free_time:  # про занятую часть дня уже сказали выше
            warnings.append("Укажите дату и время")
    elif service:
        start = dt.datetime.combine(date, dt.time.fromisoformat(time))
        if start <= now:
            warnings.append("Это время уже прошло")
        elif await has_conflict(session, master.id, start, start + dt.timedelta(minutes=service.duration_minutes)):
            warnings.append("На это время уже есть запись")

    return QuickBookingDraft(
        client_name=name,
        client_phone=raw_digits if len(raw_digits) == 10 and raw_digits.startswith("8") else phone,
        service_id=service.id if service else None,
        date=date,
        time=time,
        warnings=warnings,
        notes=notes,
        known_client=known_client,
    )
