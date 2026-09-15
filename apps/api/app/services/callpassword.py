"""Вход по звонку (smsint Call Password): робот звонит, код — последние 4 цифры номера, с которого поступил звонок."""
import logging
import secrets

import httpx

from app.config import settings

log = logging.getLogger(__name__)

API_URL = "https://lcab.smsint.ru/json/v1.0/callpassword/send"


class CallPasswordError(RuntimeError):
    pass


async def start_call(phone: str, *, validate: bool = False) -> str:
    """Запускает звонок и возвращает ожидаемый код. Без токена — dev-режим: звонка нет, код случайный.

    validate=True — проверка запроса без звонка и списания денег (код в ответе не приходит).
    """
    if not settings.smsint_api_token:
        code = f"{secrets.randbelow(10_000):04d}"
        log.info("DEV call password for %s: %s", phone, code)
        return code

    try:
        # при реальном звонке smsint отвечает только после набора номера — ждём ответ дольше обычного
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10)) as client:
            response = await client.post(
                API_URL,
                headers={"X-Token": settings.smsint_api_token},
                json={"recipient": phone.lstrip("+"), "validate": validate},
            )
    except httpx.HTTPError as exc:
        raise CallPasswordError(f"smsint request failed: {exc!r}") from exc
    try:
        data = response.json()
    except ValueError as exc:
        raise CallPasswordError(f"smsint bad response: HTTP {response.status_code} {response.text[:300]!r}") from exc

    if not data.get("success"):
        raise CallPasswordError(f"smsint error: {data.get('error')}")
    code = (data.get("result") or {}).get("code", "")
    if not code and not validate:
        raise CallPasswordError(f"smsint returned no code: {data}")
    return code
