import datetime as dt
import hmac
import logging
import secrets
import time

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.deps import SessionDep
from app.models import AuthCode, Master, utcnow
from app.schemas import CodeRequested, PasswordLoginIn, PhoneIn, PhoneStatus, VerifyIn, VerifyOut
from app.security import SESSION_COOKIE, SESSION_TTL, create_session, hash_code, verify_password
from app.services.booking import is_valid_phone, normalize_phone
from app.services.callpassword import CallPasswordError, start_call

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger(__name__)

CODE_TTL = dt.timedelta(minutes=5)
RESEND_SECONDS = 60
MAX_ATTEMPTS = 5


def valid_phone(raw: str) -> str:
    phone = normalize_phone(raw)
    if not is_valid_phone(phone):
        raise HTTPException(422, "Проверьте номер телефона")
    return phone


async def unique_slug(session: AsyncSession) -> str:
    while True:
        slug = f"m-{secrets.token_hex(3)}"
        if not await session.scalar(select(Master.id).where(Master.slug == slug)):
            return slug


@router.post("/request-code", response_model=CodeRequested)
async def request_code(data: PhoneIn, session: SessionDep) -> CodeRequested:
    phone = valid_phone(data.phone)
    now = utcnow()
    last = await session.scalar(select(AuthCode).where(AuthCode.phone == phone).order_by(AuthCode.created_at.desc()).limit(1))
    if last and (wait := RESEND_SECONDS - int((now - last.created_at).total_seconds())) > 0:
        raise HTTPException(429, f"Новый код можно запросить через {wait} с")

    try:
        code = await start_call(phone)  # код = последние 4 цифры номера, с которого звонит робот
    except CallPasswordError as exc:
        log.warning("Call password failed for %s: %s", phone, exc)
        raise HTTPException(502, "Не удалось позвонить на этот номер. Проверьте номер или попробуйте чуть позже.") from exc

    await session.execute(delete(AuthCode).where(AuthCode.phone == phone))
    session.add(AuthCode(phone=phone, code_hash=hash_code(phone, code), expires_at=now + CODE_TTL, created_at=now))
    await session.commit()
    return CodeRequested(retry_in=RESEND_SECONDS, dev_code=None if settings.smsint_api_token else code)


@router.post("/verify", response_model=VerifyOut)
async def verify(data: VerifyIn, response: Response, session: SessionDep) -> VerifyOut:
    phone = valid_phone(data.phone)
    auth = await session.scalar(select(AuthCode).where(AuthCode.phone == phone).order_by(AuthCode.created_at.desc()).limit(1))
    if not auth or auth.expires_at < utcnow():
        raise HTTPException(400, "Код устарел — запросите новый")
    if auth.attempts >= MAX_ATTEMPTS:
        raise HTTPException(429, "Слишком много попыток — запросите новый код")
    if not hmac.compare_digest(auth.code_hash, hash_code(phone, data.code.strip())):
        auth.attempts += 1
        await session.commit()
        raise HTTPException(400, "Неверный код")

    await session.delete(auth)
    master = await session.scalar(select(Master).where(Master.phone == phone))
    if not master:
        master = Master(phone=phone, slug=await unique_slug(session))
        session.add(master)
    await session.commit()

    set_session(response, master)
    return VerifyOut(onboarded=master.onboarded, has_password=master.has_password)


def set_session(response: Response, master: Master) -> None:
    response.set_cookie(SESSION_COOKIE, create_session(master.id), max_age=SESSION_TTL, httponly=True, samesite="lax", secure=settings.cookie_secure)


# --- вход по паролю (без звонка) ---

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILS = 5
_failed_logins: dict[str, list[float]] = {}  # один воркер uvicorn — хватает памяти процесса


@router.post("/start", response_model=PhoneStatus)
async def start(data: PhoneIn, session: SessionDep) -> PhoneStatus:
    """Есть ли у номера пароль: да — спрашиваем пароль, нет — звоним."""
    phone = valid_phone(data.phone)
    master = await session.scalar(select(Master).where(Master.phone == phone))
    return PhoneStatus(has_password=bool(master and master.has_password))


@router.post("/login", response_model=VerifyOut)
async def login(data: PasswordLoginIn, response: Response, session: SessionDep) -> VerifyOut:
    phone = valid_phone(data.phone)
    now = time.monotonic()
    fails = [t for t in _failed_logins.get(phone, []) if now - t < LOGIN_WINDOW_SECONDS]
    if len(fails) >= LOGIN_MAX_FAILS:
        raise HTTPException(429, "Слишком много попыток. Войдите по звонку или попробуйте позже.")

    master = await session.scalar(select(Master).where(Master.phone == phone))
    if not master or not await run_in_threadpool(verify_password, data.password, master.password_hash):
        _failed_logins[phone] = [*fails, now]
        raise HTTPException(400, "Неверный номер или пароль")

    _failed_logins.pop(phone, None)
    set_session(response, master)
    return VerifyOut(onboarded=master.onboarded, has_password=True)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE)
