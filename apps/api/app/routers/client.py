from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.config import local_now
from app.deps import ClientDep, SessionDep
from app.models import Booking, BookingStatus, Master, Service
from app.schemas import ClientBookingMaster, ClientBookingOut, ClientMe, PushSubscribeIn
from app.services.ics import build_ics
from app.services.notify import fmt_when, push, save_subscription

router = APIRouter(prefix="/api/client", tags=["client"])


def client_booking_out(booking: Booking, service: Service, master: Master) -> ClientBookingOut:
    return ClientBookingOut(
        id=booking.id,
        status=booking.status.value,
        cancelled_by=booking.cancelled_by,
        start_at=booking.start_at,
        end_at=booking.end_at,
        service_name=service.name,
        price=float(service.price),
        master=ClientBookingMaster(
            slug=master.slug, name=master.name, specialty=master.specialty,
            address=master.address, phone=master.phone, avatar_url=master.avatar_url,
        ),
    )


async def own_booking(session: SessionDep, account_id: str, booking_id: str) -> tuple[Booking, Service, Master]:
    booking = await session.get(Booking, booking_id)
    if not booking or booking.account_id != account_id:
        raise HTTPException(404, "Запись не найдена")
    return booking, await session.get(Service, booking.service_id), await session.get(Master, booking.master_id)


@router.get("/me", response_model=ClientMe)
async def me(account: ClientDep, session: SessionDep) -> ClientMe:
    rows = await session.execute(
        select(Booking, Service, Master)
        .join(Service, Service.id == Booking.service_id)
        .join(Master, Master.id == Booking.master_id)
        .where(Booking.account_id == account.id)
        .order_by(Booking.start_at.desc())
    )
    return ClientMe(name=account.name, phone=account.phone, bookings=[client_booking_out(b, s, m) for b, s, m in rows])


@router.post("/bookings/{booking_id}/cancel", response_model=ClientBookingOut)
async def cancel(booking_id: str, account: ClientDep, session: SessionDep) -> ClientBookingOut:
    booking, service, master = await own_booking(session, account.id, booking_id)
    return await cancel_as_client(session, booking, service, master)


async def cancel_as_client(session: SessionDep, booking: Booking, service: Service, master: Master) -> ClientBookingOut:
    """Отмена клиентом (из приложения или по ссылке на запись) + уведомление мастеру."""
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(409, "Запись уже отменена")
    if booking.start_at <= local_now():
        raise HTTPException(409, "Прошедшую запись отменить нельзя")
    booking.status = BookingStatus.cancelled
    booking.cancelled_by = "client"
    await session.commit()

    await push(
        session, "master", master.id,
        title="Клиент отменил запись",
        body=f"{booking.client_name} · {service.name} · {fmt_when(booking.start_at)}",
        url=f"/app?date={booking.start_at.date()}",
    )
    return client_booking_out(booking, service, master)


@router.get("/bookings/{booking_id}/ics")
async def booking_ics(booking_id: str, account: ClientDep, session: SessionDep) -> Response:
    booking, service, master = await own_booking(session, account.id, booking_id)
    return Response(
        content=build_ics(booking, service, master),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="booking.ics"'},
    )


@router.post("/push/subscribe", status_code=204)
async def push_subscribe(data: PushSubscribeIn, account: ClientDep, session: SessionDep) -> None:
    await save_subscription(session, "client", account.id, data.endpoint, data.keys.p256dh, data.keys.auth)
