import datetime as dt
import logging
import re
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import local_now
from app.deps import MasterDep, SessionDep
from app.models import Booking, BookingStatus, Client, DateHours, DateSlot, Master, Service, TimeOff, WorkingHours, WorkingSlot
from app.schemas import (
    BookingOut,
    ClientOut,
    ClientUpdate,
    DateHoursItem,
    DateSlotItem,
    DatesScheduleIn,
    DayScheduleItem,
    DaysScheduleIn,
    MasterBookingIn,
    MasterProfile,
    PasswordIn,
    ProfileUpdate,
    PushSubscribeIn,
    QuickBookingDraft,
    QuickParseIn,
    RescheduleIn,
    Schedule,
    ServiceIn,
    ServiceOut,
    Slot,
    TimeOffIn,
    TimeOffItem,
    WeeklyScheduleIn,
    WorkingHoursItem,
    WorkingSlotItem,
)
from app.security import hash_password, sign_id
from app.services.booking import free_slots, has_conflict, is_valid_phone, linked_account, normalize_phone, to_local, upsert_client
from app.services.notify import fmt_when, push, save_subscription, subscribed_owners
from app.services.media import MediaError, process_avatar, remove_media, save_avatar
from app.services.quick_booking import QuickParseError, ask_llm, build_draft

router = APIRouter(prefix="/api/master", tags=["master"])
log = logging.getLogger(__name__)

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$")
RESERVED_SLUGS = {"app", "api", "c", "login", "logout", "admin", "static", "manifest", "sw", "icon", "nook", "help", "about"}


def day_bounds(start: dt.date, end: dt.date) -> tuple[dt.datetime, dt.datetime]:
    return dt.datetime.combine(start, dt.time.min), dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min)


def booking_out(booking: Booking, service: Service, notified: set[str]) -> BookingOut:
    return BookingOut(
        id=booking.id,
        service_id=service.id,
        service_name=service.name,
        price=float(service.price),
        client_name=booking.client_name,
        client_phone=booking.client_phone,
        start_at=booking.start_at,
        end_at=booking.end_at,
        status=booking.status.value,
        cancelled_by=booking.cancelled_by,
        client_notified=bool(booking.account_id and booking.account_id in notified),
        share_url=f"/r/{sign_id('booking', booking.id)}",
    )


async def own_service(session: AsyncSession, master: Master, service_id: str) -> Service:
    service = await session.get(Service, service_id)
    if not service or service.master_id != master.id:
        raise HTTPException(404, "Услуга не найдена")
    return service


async def own_booking(session: AsyncSession, master: Master, booking_id: str) -> tuple[Booking, Service]:
    booking = await session.get(Booking, booking_id)
    if not booking or booking.master_id != master.id:
        raise HTTPException(404, "Запись не найдена")
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(409, "Запись уже отменена")
    return booking, await session.get(Service, booking.service_id)


# --- профиль ---

@router.get("/me", response_model=MasterProfile)
async def me(master: MasterDep) -> Master:
    return master


@router.put("/me", response_model=MasterProfile)
async def update_me(data: ProfileUpdate, master: MasterDep, session: SessionDep) -> Master:
    values = {k: v.strip() if isinstance(v, str) else v for k, v in data.model_dump(exclude_unset=True).items()}
    if "slug" in values:
        slug = values["slug"].lower()
        if not SLUG_RE.match(slug) or slug in RESERVED_SLUGS:
            raise HTTPException(422, "Ссылка: 3–30 символов — латинские буквы, цифры и дефис")
        if await session.scalar(select(Master.id).where(Master.slug == slug, Master.id != master.id)):
            raise HTTPException(409, "Эта ссылка уже занята — попробуйте другую")
        values["slug"] = slug
    if values.get("onboarded") and not values.get("name", master.name):
        raise HTTPException(422, "Укажите имя")
    for key, value in values.items():
        setattr(master, key, value)
    await session.commit()
    return master


@router.put("/password", status_code=204)
async def set_password(data: PasswordIn, master: MasterDep, session: SessionDep) -> None:
    """Задать или сменить пароль. Сессия подтверждает владельца номера (в т.ч. после входа по звонку)."""
    master.password_hash = await run_in_threadpool(hash_password, data.password)
    await session.commit()


AVATAR_MAX_BYTES = 10 * 1024 * 1024


@router.post("/avatar", response_model=MasterProfile)
async def upload_avatar(file: Annotated[UploadFile, File()], master: MasterDep, session: SessionDep) -> Master:
    data = await file.read(AVATAR_MAX_BYTES + 1)
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(413, "Фото слишком большое — до 10 МБ")
    try:
        image = await run_in_threadpool(process_avatar, data)
    except MediaError as exc:
        raise HTTPException(422, "Не удалось открыть фото — выберите JPG, PNG или WebP") from exc
    master.avatar_url = await run_in_threadpool(save_avatar, master.id, image, master.avatar_url)
    await session.commit()
    return master


@router.delete("/avatar", response_model=MasterProfile)
async def delete_avatar(master: MasterDep, session: SessionDep) -> Master:
    await run_in_threadpool(remove_media, master.avatar_url)
    master.avatar_url = None
    await session.commit()
    return master


# --- расписание ---

@router.get("/schedule", response_model=Schedule)
async def get_schedule(master: MasterDep, session: SessionDep) -> Schedule:
    today = local_now().date()
    hours = await session.scalars(
        select(WorkingHours).where(WorkingHours.master_id == master.id).order_by(WorkingHours.weekday, WorkingHours.start_time)
    )
    working_hours = [WorkingHoursItem.model_validate(h) for h in hours]
    slots = await session.scalars(
        select(WorkingSlot).where(WorkingSlot.master_id == master.id).order_by(WorkingSlot.weekday, WorkingSlot.start_time)
    )
    working_slots = [WorkingSlotItem.model_validate(s) for s in slots]
    day_hours = await session.scalars(
        select(DateHours).where(DateHours.master_id == master.id, DateHours.date >= today).order_by(DateHours.date, DateHours.start_time)
    )
    date_hours = [DateHoursItem.model_validate(h) for h in day_hours]
    day_slots = await session.scalars(
        select(DateSlot).where(DateSlot.master_id == master.id, DateSlot.date >= today).order_by(DateSlot.date, DateSlot.start_time)
    )
    date_slots = [DateSlotItem.model_validate(s) for s in day_slots]
    offs = await session.scalars(select(TimeOff).where(TimeOff.master_id == master.id, TimeOff.date >= today).order_by(TimeOff.date))
    return Schedule(
        schedule_type=master.schedule_type,
        working_hours=working_hours,
        working_slots=working_slots,
        date_hours=date_hours,
        date_slots=date_slots,
        time_off=[TimeOffItem.model_validate(o) for o in offs],
    )


@router.put("/schedule", response_model=Schedule)
async def update_schedule(data: WeeklyScheduleIn, master: MasterDep, session: SessionDep) -> Schedule:
    """Постоянный график (по дням недели). Тип графика выбирается один раз."""
    if master.schedule_type == "dates":
        raise HTTPException(409, "У вас график по дням — тип графика сменить нельзя")
    if any(h.start_time >= h.end_time for h in data.working_hours):
        raise HTTPException(422, "Время начала должно быть раньше окончания")

    await session.execute(delete(WorkingHours).where(WorkingHours.master_id == master.id))
    await session.execute(delete(WorkingSlot).where(WorkingSlot.master_id == master.id))
    session.add_all(WorkingHours(master_id=master.id, **h.model_dump()) for h in data.working_hours)
    unique_slots = sorted({(s.weekday, s.start_time) for s in data.working_slots})
    session.add_all(WorkingSlot(master_id=master.id, weekday=wd, start_time=t) for wd, t in unique_slots)
    master.schedule_type = "weekly"
    await session.commit()
    return await get_schedule(master, session)


async def save_days(session: AsyncSession, master: Master, items: list[DayScheduleItem]) -> None:
    """График по дням: сначала проверяем все дни, потом перезаписываем только их (атомарно)."""
    if master.schedule_type == "weekly":
        raise HTTPException(409, "У вас постоянный график — тип графика сменить нельзя")
    today = local_now().date()
    if len({item.date for item in items}) != len(items):
        raise HTTPException(422, "Каждый день можно указать только один раз")
    for item in items:
        label = f"{item.date:%d.%m}"
        if item.date < today:
            raise HTTPException(422, "Прошедшие дни менять нельзя")
        if item.mode == "range" and (not item.start_time or not item.end_time or item.start_time >= item.end_time):
            raise HTTPException(422, f"{label}: укажите время работы — начало раньше окончания")
        if item.mode == "slots" and not item.slots:
            raise HTTPException(422, f"{label}: выберите хотя бы одно окошко")

    dates = [item.date for item in items]
    await session.execute(delete(DateHours).where(DateHours.master_id == master.id, DateHours.date.in_(dates)))
    await session.execute(delete(DateSlot).where(DateSlot.master_id == master.id, DateSlot.date.in_(dates)))
    for item in items:
        if item.mode == "range":
            session.add(DateHours(master_id=master.id, date=item.date, start_time=item.start_time, end_time=item.end_time))
        elif item.mode == "slots":
            session.add_all(DateSlot(master_id=master.id, date=item.date, start_time=t) for t in sorted(set(item.slots)))
    master.schedule_type = "dates"
    await session.commit()


@router.put("/schedule/dates", response_model=Schedule)
async def update_schedule_dates(data: DatesScheduleIn, master: MasterDep, session: SessionDep) -> Schedule:
    """График по дням: одинаковое время работы для всех выбранных дат."""
    items = [
        DayScheduleItem(date=d, mode=data.mode, start_time=data.start_time, end_time=data.end_time, slots=data.slots)
        for d in sorted(set(data.dates))
    ]
    await save_days(session, master, items)
    return await get_schedule(master, session)


@router.put("/schedule/days", response_model=Schedule)
async def update_schedule_days(data: DaysScheduleIn, master: MasterDep, session: SessionDep) -> Schedule:
    """График по дням: у каждого дня своё время (интервал, окошки или выходной)."""
    await save_days(session, master, data.days)
    return await get_schedule(master, session)


@router.delete("/schedule", response_model=Schedule)
async def delete_schedule(master: MasterDep, session: SessionDep) -> Schedule:
    """Удалить график: сбрасывает тип (можно выбрать заново). Записи клиентов, выходные и перерывы остаются."""
    for model in (WorkingHours, WorkingSlot, DateHours, DateSlot):
        await session.execute(delete(model).where(model.master_id == master.id))
    master.schedule_type = None
    await session.commit()
    return await get_schedule(master, session)


@router.put("/schedule/time-off", response_model=Schedule)
async def update_time_off(data: TimeOffIn, master: MasterDep, session: SessionDep) -> Schedule:
    """Выходные и перерывы — работают при любом типе графика."""
    if any((o.start_time is None) != (o.end_time is None) or (o.start_time and o.start_time >= o.end_time) for o in data.time_off):
        raise HTTPException(422, "Укажите корректный интервал перерыва")
    today = local_now().date()
    await session.execute(delete(TimeOff).where(TimeOff.master_id == master.id, TimeOff.date >= today))
    session.add_all(TimeOff(master_id=master.id, **o.model_dump()) for o in data.time_off if o.date >= today)
    await session.commit()
    return await get_schedule(master, session)


# --- услуги ---

@router.get("/services", response_model=list[ServiceOut])
async def list_services(master: MasterDep, session: SessionDep) -> list[Service]:
    rows = await session.scalars(select(Service).where(Service.master_id == master.id).order_by(Service.is_active.desc(), Service.name))
    return list(rows)


@router.post("/services", response_model=ServiceOut, status_code=201)
async def create_service(data: ServiceIn, master: MasterDep, session: SessionDep) -> Service:
    service = Service(master_id=master.id, **data.model_dump())
    session.add(service)
    await session.commit()
    return service


@router.put("/services/{service_id}", response_model=ServiceOut)
async def update_service(service_id: str, data: ServiceIn, master: MasterDep, session: SessionDep) -> Service:
    service = await own_service(session, master, service_id)
    for key, value in data.model_dump().items():
        setattr(service, key, value)
    await session.commit()
    return service


@router.delete("/services/{service_id}", status_code=204)
async def delete_service(service_id: str, master: MasterDep, session: SessionDep) -> None:
    service = await own_service(session, master, service_id)
    if await session.scalar(select(Booking.id).where(Booking.service_id == service.id).limit(1)):
        service.is_active = False  # сохраняем историю записей
    else:
        await session.delete(service)
    await session.commit()


# --- записи ---

@router.get("/availability", response_model=list[Slot])
async def availability(master: MasterDep, session: SessionDep, date: dt.date, service_id: str, exclude: str | None = None) -> list[Slot]:
    service = await own_service(session, master, service_id)
    slots = await free_slots(session, master.id, service.duration_minutes, date, exclude_id=exclude)
    return [Slot(start_at=s, end_at=e) for s, e in slots]


@router.get("/bookings", response_model=list[BookingOut])
async def list_bookings(
    master: MasterDep,
    session: SessionDep,
    from_: dt.date | None = Query(None, alias="from"),
    to: dt.date | None = None,
) -> list[BookingOut]:
    start = from_ or local_now().date()
    lower, upper = day_bounds(start, to or start + dt.timedelta(days=6))
    rows = (
        await session.execute(
            select(Booking, Service)
            .join(Service, Service.id == Booking.service_id)
            .where(Booking.master_id == master.id, Booking.start_at >= lower, Booking.start_at < upper)
            .order_by(Booking.start_at)
        )
    ).all()
    notified = await subscribed_owners(session, "client", {b.account_id for b, _ in rows if b.account_id})
    return [booking_out(b, s, notified) for b, s in rows]


@router.post("/quick-parse", response_model=QuickBookingDraft)
async def quick_parse(data: QuickParseIn, master: MasterDep, session: SessionDep) -> QuickBookingDraft:
    """Быстрая запись одной строкой: ИИ разбирает текст в черновик, мастер проверяет и записывает."""
    services = list(
        await session.scalars(select(Service).where(Service.master_id == master.id, Service.is_active.is_(True)).order_by(Service.name))
    )
    if not services:
        raise HTTPException(422, "Сначала добавьте услуги в профиле")
    now = local_now()
    try:
        raw = await ask_llm(data.text, services, now)
    except QuickParseError as exc:
        log.warning("Quick parse failed: %s", exc)
        raise HTTPException(502, "Не получилось разобрать запись. Попробуйте ещё раз или запишите через «+».") from exc
    return await build_draft(session, master, services, raw, now)


@router.post("/bookings", response_model=BookingOut, status_code=201)
async def create_booking(data: MasterBookingIn, master: MasterDep, session: SessionDep) -> BookingOut:
    service = await own_service(session, master, data.service_id)
    start = to_local(data.start_at)
    end = start + dt.timedelta(minutes=service.duration_minutes)
    if await has_conflict(session, master.id, start, end):
        raise HTTPException(409, "На это время уже есть запись")

    phone = normalize_phone(data.client_phone)  # "" — номер не указан
    if phone and not is_valid_phone(phone):
        raise HTTPException(422, "Проверьте номер телефона")
    name = data.client_name.strip()
    account = await linked_account(session, master.id, phone) if phone else None
    booking = Booking(
        master_id=master.id, service_id=service.id, account_id=account.id if account else None,
        client_name=name, client_phone=phone, start_at=start, end_at=end,
    )
    session.add(booking)
    if phone:  # без номера в «блокнот» клиентов не добавляем — не с чем сопоставить и нечем связаться
        await upsert_client(session, master.id, name, phone)
    await session.commit()

    sent = 0
    if account:  # клиент уже пользуется nook — запись сразу в его приложении
        sent = await push(
            session, "client", account.id,
            title="Вы записаны",
            body=f"{master.name}: {service.name}, {fmt_when(start)}",
            url="/c",
        )
    return booking_out(booking, service, {account.id} if sent and account else set())


@router.put("/bookings/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(booking_id: str, master: MasterDep, session: SessionDep) -> BookingOut:
    booking, service = await own_booking(session, master, booking_id)
    booking.status = BookingStatus.cancelled
    booking.cancelled_by = "master"
    await session.commit()

    sent = 0
    if booking.account_id:
        sent = await push(
            session, "client", booking.account_id,
            title="Запись отменена",
            body=f"{master.name}: {service.name}, {fmt_when(booking.start_at)}",
            url="/c",
        )
    return booking_out(booking, service, {booking.account_id} if sent and booking.account_id else set())


@router.put("/bookings/{booking_id}/reschedule", response_model=BookingOut)
async def reschedule_booking(booking_id: str, data: RescheduleIn, master: MasterDep, session: SessionDep) -> BookingOut:
    booking, service = await own_booking(session, master, booking_id)
    start = to_local(data.start_at)
    end = start + dt.timedelta(minutes=service.duration_minutes)
    if await has_conflict(session, master.id, start, end, exclude_id=booking.id):
        raise HTTPException(409, "На это время уже есть запись")

    previous = booking.start_at
    booking.start_at, booking.end_at = start, end
    await session.commit()

    sent = 0
    if booking.account_id:
        sent = await push(
            session, "client", booking.account_id,
            title="Запись перенесена",
            body=f"{master.name}: {service.name} — {fmt_when(start)} (было {fmt_when(previous)})",
            url="/c",
        )
    return booking_out(booking, service, {booking.account_id} if sent and booking.account_id else set())


# --- клиенты ---

@router.get("/clients", response_model=list[ClientOut])
async def list_clients(master: MasterDep, session: SessionDep) -> list[ClientOut]:
    visit_rows = await session.execute(
        select(Booking.client_phone, func.count())
        .where(Booking.master_id == master.id, Booking.status == BookingStatus.confirmed)
        .group_by(Booking.client_phone)
    )
    visits = {phone: count for phone, count in visit_rows}
    clients = await session.scalars(select(Client).where(Client.master_id == master.id).order_by(Client.name))
    return [ClientOut.model_validate(c).model_copy(update={"visits": visits.get(c.phone, 0)}) for c in clients]


@router.get("/clients/{client_id}/bookings", response_model=list[BookingOut])
async def client_bookings(client_id: str, master: MasterDep, session: SessionDep) -> list[BookingOut]:
    """История визитов клиента — от новых к старым."""
    client = await session.get(Client, client_id)
    if not client or client.master_id != master.id:
        raise HTTPException(404, "Клиент не найден")
    rows = (
        await session.execute(
            select(Booking, Service)
            .join(Service, Service.id == Booking.service_id)
            .where(Booking.master_id == master.id, Booking.client_phone == client.phone)
            .order_by(Booking.start_at.desc())
            .limit(50)
        )
    ).all()
    notified = await subscribed_owners(session, "client", {b.account_id for b, _ in rows if b.account_id})
    return [booking_out(b, s, notified) for b, s in rows]


@router.put("/clients/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, data: ClientUpdate, master: MasterDep, session: SessionDep) -> Client:
    client = await session.get(Client, client_id)
    if not client or client.master_id != master.id:
        raise HTTPException(404, "Клиент не найден")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    await session.commit()
    return client


# --- уведомления ---

@router.post("/push/subscribe", status_code=204)
async def push_subscribe(data: PushSubscribeIn, master: MasterDep, session: SessionDep) -> None:
    await save_subscription(session, "master", master.id, data.endpoint, data.keys.p256dh, data.keys.auth)


@router.post("/push/test", status_code=204)
async def push_test(master: MasterDep, session: SessionDep) -> None:
    if not await push(session, "master", master.id, title="nook", body="Уведомления работают", url="/app"):
        raise HTTPException(409, "Нет активных подписок — включите уведомления ещё раз")
