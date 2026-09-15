"""Идемпотентный сид: демо-мастер для локальной разработки (вход по телефону +7 999 000-11-22)."""
import asyncio
import datetime as dt

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Master, Service, WorkingHours

SERVICES = [
    ("Маникюр с покрытием гель-лак", 90, 2500),
    ("Маникюр без покрытия", 60, 1500),
    ("Педикюр с покрытием", 120, 3200),
    ("Снятие покрытия", 30, 500),
]


async def seed() -> None:
    async with SessionLocal() as session:
        if await session.scalar(select(Master.id).limit(1)):
            return
        master = Master(
            phone="+79990001122", slug="anna", name="Анна Соколова",
            specialty="Мастер маникюра", address="Москва, ул. Пятницкая, 12", onboarded=True,
        )
        session.add(master)
        await session.flush()
        session.add_all(Service(master_id=master.id, name=n, duration_minutes=d, price=p) for n, d, p in SERVICES)
        session.add_all(WorkingHours(master_id=master.id, weekday=wd, start_time=dt.time(10), end_time=dt.time(20)) for wd in range(6))
        await session.commit()
        print("Seeded demo master: /anna, phone +79990001122")


if __name__ == "__main__":
    asyncio.run(seed())
