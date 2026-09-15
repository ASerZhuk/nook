import base64
import datetime as dt
import hashlib
import hmac
import secrets
import uuid

import jwt

from app.config import settings

SESSION_COOKIE = "nook_session"
SESSION_TTL = 60 * 60 * 24 * 90


def create_session(master_id: str) -> str:
    exp = dt.datetime.now(dt.UTC) + dt.timedelta(seconds=SESSION_TTL)
    return jwt.encode({"sub": master_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def decode_session(token: str) -> str | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"]).get("sub")
    except jwt.PyJWTError:
        return None


def hash_code(phone: str, code: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_client_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(24)
    return token, hash_token(token)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(kind: str, raw: bytes) -> bytes:
    return hmac.new(settings.jwt_secret.encode(), kind.encode() + raw, hashlib.sha256).digest()[:12]


def sign_id(kind: str, object_id: str) -> str:
    """Короткий подписанный токен объекта (~39 символов): не хранится в БД, пересчитывается из id."""
    raw = uuid.UUID(object_id).bytes
    return f"{_b64(raw)}.{_b64(_signature(kind, raw))}"


def unsign_id(kind: str, token: str) -> str | None:
    try:
        raw_part, sig_part = token.split(".")
        raw, sig = _unb64(raw_part), _unb64(sig_part)
    except ValueError:  # в т.ч. binascii.Error
        return None
    if len(raw) != 16 or not hmac.compare_digest(sig, _signature(kind, raw)):
        return None
    return str(uuid.UUID(bytes=raw))


_PBKDF2_ITERATIONS = 390_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS).hex()
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        _, iterations, salt, digest = (stored or "").split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
    return hmac.compare_digest(candidate, digest)
