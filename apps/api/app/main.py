import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, booking_link, client, master, public, system

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="nook API")
for module in (auth, master, public, client, booking_link, system):
    app.include_router(module.router)

# загрузки (аватары) — под /api, чтобы проходили через прокси Next и Caddy
Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
app.mount("/api/media", StaticFiles(directory=settings.media_dir), name="media")
