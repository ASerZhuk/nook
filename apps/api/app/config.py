import datetime as dt
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./app.db"
    jwt_secret: str = "dev-secret-change-me"
    timezone: str = "Europe/Moscow"  # все времена хранятся как локальное время мастера
    cookie_secure: bool = False
    smsint_api_token: str = ""  # smsint Call Password; пусто — dev-режим: звонка нет, код возвращается в ответе API
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_file: str = "vapid.json"  # если ключи не заданы — генерируются и сохраняются сюда
    vapid_subject: str = "mailto:admin@nook.local"
    # быстрая запись одной строкой: OpenAI-совместимый API
    vsellm_base_url: str = "https://api.vsellm.ru/v1"
    vsellm_token: str = ""
    vsellm_model: str = "openai/gpt-5.4-nano"
    media_dir: str = "media"  # загрузки (аватары); раздаются по /api/media/


settings = Settings()
TZ = ZoneInfo(settings.timezone)


def local_now() -> dt.datetime:
    return dt.datetime.now(TZ).replace(tzinfo=None)
