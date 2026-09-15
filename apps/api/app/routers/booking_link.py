"""Ссылка на одну запись (/r/{token}) — мастер отправляет клиенту по SMS или в мессенджер после ручной записи."""
from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.deps import SessionDep
from app.models import Booking, ClientAccount, Master, Service
from app.routers.client import cancel_as_client, client_booking_out
from app.schemas import BookingLinkOut, ClaimIn, ClaimOut, ClientBookingOut
from app.security import hash_token, new_client_token, unsign_id
from app.services.ics import build_ics

router = APIRouter(prefix="/api/r/{token}", tags=["booking-link"])


async def load_booking(session: SessionDep, token: str) -> tuple[Booking, Service, Master]:
    booking_id = unsign_id("booking", token)
    booking = await session.get(Booking, booking_id) if booking_id else None
    if not booking:
        raise HTTPException(404, "Запись не найдена")
    return booking, await session.get(Service, booking.service_id), await session.get(Master, booking.master_id)


@router.get("", response_model=BookingLinkOut)
async def view(token: str, session: SessionDep) -> BookingLinkOut:
    booking, service, master = await load_booking(session, token)
    return BookingLinkOut(booking=client_booking_out(booking, service, master), in_app=booking.account_id is not None)


@router.get("/ics")
async def ics(token: str, session: SessionDep) -> Response:
    booking, service, master = await load_booking(session, token)
    return Response(
        content=build_ics(booking, service, master),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="booking.ics"'},
    )


@router.post("/cancel", response_model=ClientBookingOut)
async def cancel(token: str, session: SessionDep) -> ClientBookingOut:
    booking, service, master = await load_booking(session, token)
    return await cancel_as_client(session, booking, service, master)


@router.post("/claim", response_model=ClaimOut)
async def claim(token: str, data: ClaimIn, session: SessionDep) -> ClaimOut:
    """«Сохранить в nook»: привязать запись к приложению на этом устройстве (или создать его)."""
    booking, _, _ = await load_booking(session, token)
    device = (
        await session.scalar(select(ClientAccount).where(ClientAccount.token_hash == hash_token(data.client_token)))
        if data.client_token
        else None
    )
    if booking.account_id:
        if device and device.id == booking.account_id:
            return ClaimOut(client_token=data.client_token)
        # не выдаём доступ к чужому приложению по ссылке на запись
        raise HTTPException(409, "Эта запись уже добавлена в приложение nook на другом устройстве")

    client_token = data.client_token if device else None
    if not device:
        client_token, token_hash = new_client_token()
        device = ClientAccount(token_hash=token_hash, name=booking.client_name, phone=booking.client_phone)
        session.add(device)
        await session.flush()
    booking.account_id = device.id
    await session.commit()
    return ClaimOut(client_token=client_token)
