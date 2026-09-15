"""Web Push (VAPID) для мастера и клиента."""
import base64
import datetime as dt
import json
import logging
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models import PushSubscription

log = logging.getLogger(__name__)

MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def fmt_when(value: dt.datetime) -> str:
    return f"{value.day} {MONTHS[value.month - 1]}, {value:%H:%M}"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _load_vapid() -> tuple[str, str]:
    if settings.vapid_public_key and settings.vapid_private_key:
        return settings.vapid_public_key, settings.vapid_private_key
    path = Path(settings.vapid_file)
    if path.exists():
        keys = json.loads(path.read_text())
        return keys["public"], keys["private"]
    key = ec.generate_private_key(ec.SECP256R1())
    private = _b64url(key.private_numbers().private_value.to_bytes(32, "big"))
    public = _b64url(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    path.write_text(json.dumps({"public": public, "private": private}))
    log.warning("Generated new VAPID keys in %s", path)
    return public, private


VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY = _load_vapid()


def _send(sub: PushSubscription, payload: str) -> None:
    webpush(
        subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
        data=payload,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": settings.vapid_subject},  # pywebpush дополняет dict — создаём новый на каждый вызов
        ttl=24 * 60 * 60,
    )


async def push(session: AsyncSession, owner_type: str, owner_id: str, *, title: str, body: str, url: str) -> int:
    """Отправляет уведомление на все устройства владельца. Возвращает число доставленных в push-сервис."""
    subs = (
        await session.scalars(
            select(PushSubscription).where(PushSubscription.owner_type == owner_type, PushSubscription.owner_id == owner_id)
        )
    ).all()
    payload = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False)
    sent, dead = 0, []
    for sub in subs:
        try:
            await run_in_threadpool(_send, sub, payload)
            sent += 1
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                dead.append(sub.id)  # подписка отозвана
            else:
                log.warning("Push failed (%s) for %s %s", status, owner_type, owner_id)
        except Exception:
            log.exception("Push failed for %s %s", owner_type, owner_id)
    if dead:
        await session.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead)))
        await session.commit()
    return sent


async def save_subscription(session: AsyncSession, owner_type: str, owner_id: str, endpoint: str, p256dh: str, auth: str) -> None:
    sub = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if not sub:
        sub = PushSubscription(endpoint=endpoint)
        session.add(sub)
    sub.owner_type, sub.owner_id, sub.p256dh, sub.auth = owner_type, owner_id, p256dh, auth
    await session.commit()


async def subscribed_owners(session: AsyncSession, owner_type: str, owner_ids: set[str]) -> set[str]:
    if not owner_ids:
        return set()
    rows = await session.scalars(
        select(PushSubscription.owner_id).where(PushSubscription.owner_type == owner_type, PushSubscription.owner_id.in_(owner_ids))
    )
    return set(rows)
