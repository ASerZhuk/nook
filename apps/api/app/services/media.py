"""Загрузки: аватар мастера → квадрат 512×512 WebP в settings.media_dir, раздаётся по /api/media/..."""
import io
import secrets
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

MEDIA_URL_PREFIX = "/api/media/"
AVATAR_SIZE = 512


class MediaError(ValueError):
    pass


def media_root() -> Path:
    return Path(settings.media_dir)


def process_avatar(data: bytes) -> bytes:
    """Поворот по EXIF (фото с телефона), обрезка по центру в квадрат, WebP."""
    try:
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.fit(ImageOps.exif_transpose(source).convert("RGB"), (AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise MediaError("not an image") from exc
    out = io.BytesIO()
    image.save(out, "WEBP", quality=85)
    return out.getvalue()


def save_avatar(master_id: str, data: bytes, old_url: str | None) -> str:
    folder = media_root() / "avatars"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{master_id}-{secrets.token_hex(4)}.webp"  # новое имя — браузер не покажет старое фото из кэша
    (folder / name).write_bytes(data)
    remove_media(old_url)
    return f"{MEDIA_URL_PREFIX}avatars/{name}"


def remove_media(url: str | None) -> None:
    if not url or not url.startswith(MEDIA_URL_PREFIX):
        return
    root = media_root().resolve()
    path = (root / url[len(MEDIA_URL_PREFIX):]).resolve()
    if root in path.parents and path.is_file():
        path.unlink()
