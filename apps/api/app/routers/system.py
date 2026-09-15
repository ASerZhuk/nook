from fastapi import APIRouter

from app.schemas import VapidKey
from app.services.notify import VAPID_PUBLIC_KEY

router = APIRouter(tags=["system"])


@router.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/push/vapid-key", response_model=VapidKey)
async def vapid_key() -> VapidKey:
    return VapidKey(public_key=VAPID_PUBLIC_KEY)
