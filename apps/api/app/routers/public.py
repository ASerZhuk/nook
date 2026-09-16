import datetime as dt

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import PublicMasterDep, SessionDep
from app.models import Booking, ClientAccount, Master, Service
from app.schemas import PublicBookingIn, PublicBookingOut, PublicMaster, PublicPage, ServiceOut, Slot
from app.security import hash_token, new_client_token
from app.services.booking import free_slots, normalize_phone, to_local, upsert_client
from app.services.notify import fmt_when, push

router = APIRouter(prefix="/api/p/{slug}", tags=["public"])


async def active_service(session: AsyncSession, master: Master, service_id: str) -> Service:
    service = await session.get(Service, service_id)
    if not service or service.master_id != master.id or not service.is_active:
        raise HTTPException(404, "Услуга не найдена")
    return service


@router.get("", response_model=PublicPage)
async def master_page(master: PublicMasterDep, session: SessionDep) -> PublicPage:
    services = await session.scalars(
        select(Service).where(Service.master_id == master.id, Service.is_active.is_(True)).order_by(Service.name)
    )
    return PublicPage(
        master=PublicMaster(
            slug=master.slug, name=master.name, specialty=master.specialty,
            address=master.address, phone=master.phone if master.show_phone else "",
            timezone=settings.timezone, avatar_url=master.avatar_url,
        ),
        services=[ServiceOut.model_validate(s) for s in services],
    )


@router.get("/availability", response_model=list[Slot])
async def availability(master: PublicMasterDep, session: SessionDep, date: dt.date, service_id: str) -> list[Slot]:
    service = await active_service(session, master, service_id)
    slots = await free_slots(session, master.id, service.duration_minutes, date)
    return [Slot(start_at=s, end_at=e) for s, e in slots]


@router.post("/bookings", response_model=PublicBookingOut, status_code=201)
async def create_booking(data: PublicBookingIn, master: PublicMasterDep, session: SessionDep) -> PublicBookingOut:
    service = await active_service(session, master, data.service_id)
    start = to_local(data.start_at)
    slots = await free_slots(session, master.id, service.duration_minutes, start.date())
    if not any(s == start for s, _ in slots):
        raise HTTPException(409, "Это время уже занято. Выберите другое.")

    name, phone = data.client_name.strip(), normalize_phone(data.client_phone)
    token = data.client_token
    account = await session.scalar(select(ClientAccount).where(ClientAccount.token_hash == hash_token(token))) if token else None
    if account:
        account.name, account.phone = name, phone
    else:
        token, token_hash = new_client_token()
        account = ClientAccount(token_hash=token_hash, name=name, phone=phone)
        session.add(account)
        await session.flush()

    booking = Booking(
        master_id=master.id, service_id=service.id, account_id=account.id,
        client_name=name, client_phone=phone,
        start_at=start, end_at=start + dt.timedelta(minutes=service.duration_minutes),
    )
    session.add(booking)
    await upsert_client(session, master.id, name, phone)
    await session.commit()

    await push(
        session, "master", master.id,
        title="Новая запись",
        body=f"{name} · {service.name} · {fmt_when(start)}",
        url=f"/app?date={start.date()}",
    )
    return PublicBookingOut(booking_id=booking.id, client_token=token)
