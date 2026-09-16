import datetime as dt
import enum
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class BookingStatus(str, enum.Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"


class Master(Base):
    __tablename__ = "masters"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    phone: Mapped[str] = mapped_column(String(20), unique=True)  # логин (SMS-код)
    slug: Mapped[str] = mapped_column(String(40), unique=True)  # ссылка для клиентов: /{slug}
    name: Mapped[str] = mapped_column(String(120), default="")
    specialty: Mapped[str] = mapped_column(String(120), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    show_phone: Mapped[bool] = mapped_column(Boolean, default=True)  # показывать номер на странице записи
    password_hash: Mapped[str | None] = mapped_column(String(255))  # вход без звонка
    avatar_url: Mapped[str | None] = mapped_column(String(255))  # /api/media/avatars/...
    schedule_type: Mapped[str | None] = mapped_column(String(10))  # weekly | dates; выбирается один раз
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)


class AuthCode(Base):
    __tablename__ = "auth_codes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class Service(Base):
    __tablename__ = "services"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class WorkingHours(Base):
    __tablename__ = "working_hours"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 0 = понедельник
    start_time: Mapped[dt.time] = mapped_column(Time)
    end_time: Mapped[dt.time] = mapped_column(Time)


class WorkingSlot(Base):
    """Режим «окошки»: фиксированное время начала записи. Если у дня есть окошки — интервалы WorkingHours не используются."""

    __tablename__ = "working_slots"
    __table_args__ = (UniqueConstraint("master_id", "weekday", "start_time"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 0 = понедельник
    start_time: Mapped[dt.time] = mapped_column(Time)


class DateHours(Base):
    """График по дням: время работы в конкретную дату."""

    __tablename__ = "date_hours"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date)
    start_time: Mapped[dt.time] = mapped_column(Time)
    end_time: Mapped[dt.time] = mapped_column(Time)


class DateSlot(Base):
    """График по дням: окошки в конкретную дату."""

    __tablename__ = "date_slots"
    __table_args__ = (UniqueConstraint("master_id", "date", "start_time"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date)
    start_time: Mapped[dt.time] = mapped_column(Time)


class TimeOff(Base):
    __tablename__ = "time_off"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date)
    start_time: Mapped[dt.time | None] = mapped_column(Time)
    end_time: Mapped[dt.time | None] = mapped_column(Time)
    reason: Mapped[str | None] = mapped_column(String(255))


class ClientAccount(Base):
    """Клиент без регистрации: идентифицируется секретным токеном из ссылки /c/{token} (храним только хеш)."""

    __tablename__ = "client_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"))
    account_id: Mapped[str | None] = mapped_column(ForeignKey("client_accounts.id", ondelete="SET NULL"), index=True)
    client_name: Mapped[str] = mapped_column(String(120))
    client_phone: Mapped[str] = mapped_column(String(20))
    start_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    end_at: Mapped[dt.datetime] = mapped_column(DateTime)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status", native_enum=False, length=20), default=BookingStatus.confirmed
    )
    cancelled_by: Mapped[str | None] = mapped_column(String(10))  # master | client
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Client(Base):
    """Карточка клиента в «блокноте» мастера."""

    __tablename__ = "clients"
    __table_args__ = (UniqueConstraint("master_id", "phone"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    master_id: Mapped[str] = mapped_column(ForeignKey("masters.id", ondelete="CASCADE"), index=True)
    phone: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_type: Mapped[str] = mapped_column(String(10))  # master | client
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    endpoint: Mapped[str] = mapped_column(String(500), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
