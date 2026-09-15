import datetime as dt
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import TZ, local_now
from app.models import Booking, BookingStatus, Client, ClientAccount, DateHours, DateSlot, Master, TimeOff, WorkingHours, WorkingSlot

SLOT_STEP = dt.timedelta(minutes=30)


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return f"+{digits}" if digits else ""


def is_valid_phone(phone: str) -> bool:
    return 11 <= len(phone.lstrip("+")) <= 15


def to_local(value: dt.datetime) -> dt.datetime:
    if value.tzinfo:
        value = value.astimezone(TZ).replace(tzinfo=None)
    return value.replace(second=0, microsecond=0)


def _overlaps(a0: dt.datetime, a1: dt.datetime, b0: dt.datetime, b1: dt.datetime) -> bool:
    return a0 < b1 and b0 < a1


async def free_slots(
    session: AsyncSession, master_id: str, duration_minutes: int, day: dt.date, exclude_id: str | None = None
) -> list[tuple[dt.datetime, dt.datetime]]:
    """Свободные слоты с учётом длительности услуги, перерывов и подтверждённых записей.

    Режим дня: «окошки» (фиксированные времена начала) — если они заданы, иначе нарезка рабочих интервалов шагом SLOT_STEP.
    """
    master = await session.get(Master, master_id)
    if master and master.schedule_type == "dates":  # график по дням — время задано на конкретную дату
        hours = (
            await session.scalars(
                select(DateHours).where(DateHours.master_id == master_id, DateHours.date == day).order_by(DateHours.start_time)
            )
        ).all()
        slot_times = (
            await session.scalars(
                select(DateSlot.start_time).where(DateSlot.master_id == master_id, DateSlot.date == day).order_by(DateSlot.start_time)
            )
        ).all()
    else:
        hours = (
            await session.scalars(
                select(WorkingHours)
                .where(WorkingHours.master_id == master_id, WorkingHours.weekday == day.weekday())
                .order_by(WorkingHours.start_time)
            )
        ).all()
        slot_times = (
            await session.scalars(
                select(WorkingSlot.start_time)
                .where(WorkingSlot.master_id == master_id, WorkingSlot.weekday == day.weekday())
                .order_by(WorkingSlot.start_time)
            )
        ).all()
    if not hours and not slot_times:
        return []

    offs = (await session.scalars(select(TimeOff).where(TimeOff.master_id == master_id, TimeOff.date == day))).all()
    if any(o.start_time is None for o in offs):
        return []

    day_start = dt.datetime.combine(day, dt.time.min)
    query = select(Booking).where(
        Booking.master_id == master_id,
        Booking.status == BookingStatus.confirmed,
        Booking.start_at < day_start + dt.timedelta(days=1),
        Booking.end_at > day_start,
    )
    if exclude_id:
        query = query.where(Booking.id != exclude_id)
    busy = [(b.start_at, b.end_at) for b in await session.scalars(query)]
    busy += [(dt.datetime.combine(day, o.start_time), dt.datetime.combine(day, o.end_time or dt.time.max)) for o in offs]

    now = local_now()
    duration = dt.timedelta(minutes=duration_minutes)
    if slot_times:
        candidates = [dt.datetime.combine(day, t) for t in slot_times]
    else:
        candidates = []
        for h in hours:
            cursor = dt.datetime.combine(day, h.start_time)
            end = dt.datetime.combine(day, h.end_time)
            while cursor + duration <= end:
                candidates.append(cursor)
                cursor += SLOT_STEP
    return [
        (start, start + duration)
        for start in candidates
        if start > now and not any(_overlaps(start, start + duration, b0, b1) for b0, b1 in busy)
    ]


async def has_conflict(
    session: AsyncSession, master_id: str, start: dt.datetime, end: dt.datetime, exclude_id: str | None = None
) -> bool:
    query = select(Booking.id).where(
        Booking.master_id == master_id,
        Booking.status == BookingStatus.confirmed,
        Booking.start_at < end,
        Booking.end_at > start,
    )
    if exclude_id:
        query = query.where(Booking.id != exclude_id)
    return await session.scalar(query.limit(1)) is not None


async def linked_account(session: AsyncSession, master_id: str, phone: str) -> ClientAccount | None:
    """Приложение клиента с этим номером, если клиент уже записывался к этому мастеру через nook.

    Номер при записи не подтверждается — без связи с мастером чужим аккаунтам записи не привязываем.
    """
    return await session.scalar(
        select(ClientAccount)
        .join(Booking, Booking.account_id == ClientAccount.id)
        .where(ClientAccount.phone == phone, Booking.master_id == master_id)
        .order_by(Booking.created_at.desc())
        .limit(1)
    )


async def upsert_client(session: AsyncSession, master_id: str, name: str, phone: str) -> None:
    client = await session.scalar(select(Client).where(Client.master_id == master_id, Client.phone == phone))
    if client:
        client.name = name
        return
    session.add(Client(master_id=master_id, name=name, phone=phone))
