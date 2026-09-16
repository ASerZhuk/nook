import datetime as dt
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import TZ, local_now
from app.models import Booking, BookingStatus, Client, ClientAccount, DateHours, DateSlot, Master, TimeOff, WorkingHours, WorkingSlot

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


async def day_schedule(session: AsyncSession, master_id: str, day: dt.date) -> tuple[list, list[dt.time]]:
    """Рабочее время на дату по типу графика: интервалы «с — до» и времена окошек."""
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
    return list(hours), list(slot_times)


async def within_schedule(session: AsyncSession, master_id: str, start: dt.datetime, end: dt.datetime) -> bool:
    """Помещается ли запись целиком в рабочее время дня (с учётом длительности услуги)."""
    day = start.date()
    hours, slot_times = await day_schedule(session, master_id, day)
    offs = (await session.scalars(select(TimeOff).where(TimeOff.master_id == master_id, TimeOff.date == day))).all()
    if any(o.start_time is None for o in offs):
        return False  # выходной
    if any(
        _overlaps(start, end, dt.datetime.combine(day, o.start_time), dt.datetime.combine(day, o.end_time or dt.time.max))
        for o in offs
        if o.start_time
    ):
        return False  # перерыв
    if slot_times:  # режим «окошки»: начало должно совпасть с окошком
        return start.time() in slot_times
    return any(
        dt.datetime.combine(day, h.start_time) <= start and end <= dt.datetime.combine(day, h.end_time) for h in hours
    )


async def free_slots(
    session: AsyncSession, master_id: str, duration_minutes: int, day: dt.date, exclude_id: str | None = None
) -> list[tuple[dt.datetime, dt.datetime]]:
    """Свободные слоты с учётом длительности услуги, перерывов и подтверждённых записей.

    Режим дня: «окошки» (фиксированные времена начала) — если они заданы, иначе рабочие интервалы подряд по длительности услуги.
    """
    hours, slot_times = await day_schedule(session, master_id, day)
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
        return [
            (start, start + duration)
            for start in candidates
            if start > now and not any(_overlaps(start, start + duration, b0, b1) for b0, b1 in busy)
        ]

    # «с — до»: время идёт подряд по длительности услуги (услуга 2 ч → 10:00, 12:00, 14:00),
    # после занятого времени отсчёт начинается заново — чтобы день не рассыпался на неудобные обрезки
    busy.sort()
    candidates = []
    for h in hours:
        cursor = dt.datetime.combine(day, h.start_time)
        end = dt.datetime.combine(day, h.end_time)
        while cursor + duration <= end:
            taken = next((b1 for b0, b1 in busy if _overlaps(cursor, cursor + duration, b0, b1)), None)
            if taken:
                cursor = taken
                continue
            candidates.append(cursor)
            cursor += duration
    return [(start, start + duration) for start in candidates if start > now]


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
