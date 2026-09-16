import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth ---

class PhoneIn(BaseModel):
    phone: str = Field(min_length=5, max_length=32)


class CodeRequested(BaseModel):
    retry_in: int
    dev_code: str | None = None


class VerifyIn(PhoneIn):
    code: str = Field(min_length=4, max_length=8)


class VerifyOut(BaseModel):
    onboarded: bool
    has_password: bool


class PhoneStatus(BaseModel):
    exists: bool
    has_password: bool


class RegisterIn(PhoneIn):
    password: str = Field(min_length=6, max_length=128)


class PasswordLoginIn(PhoneIn):
    password: str = Field(min_length=1, max_length=128)


class PasswordIn(BaseModel):
    password: str = Field(min_length=6, max_length=128)


# --- мастер ---

class MasterProfile(ORM):
    id: str
    phone: str
    slug: str
    name: str
    specialty: str
    address: str
    onboarded: bool
    has_password: bool
    show_phone: bool
    avatar_url: str | None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    specialty: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    slug: str | None = Field(default=None, max_length=30)
    show_phone: bool | None = None
    onboarded: bool | None = None


class PublicMaster(BaseModel):
    slug: str
    name: str
    specialty: str
    address: str
    phone: str  # "" — мастер скрыл номер
    timezone: str
    avatar_url: str | None = None


class ServiceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    duration_minutes: int = Field(gt=0, le=720)
    price: float = Field(ge=0)
    is_active: bool = True


class ServiceOut(ORM):
    id: str
    name: str
    duration_minutes: int
    price: float
    is_active: bool


class PublicPage(BaseModel):
    master: PublicMaster
    services: list[ServiceOut]


class Slot(BaseModel):
    start_at: dt.datetime
    end_at: dt.datetime


class BookingIn(BaseModel):
    service_id: str
    client_name: str = Field(min_length=1, max_length=120)
    client_phone: str = Field(min_length=5, max_length=32)
    start_at: dt.datetime


class MasterBookingIn(BaseModel):
    """Запись мастером: номер клиента можно не указывать (тогда предупредить клиента не получится)."""

    service_id: str
    client_name: str = Field(min_length=1, max_length=120)
    client_phone: str = Field(default="", max_length=32)
    start_at: dt.datetime


class PublicBookingIn(BookingIn):
    client_token: str | None = Field(default=None, max_length=64)


class PublicBookingOut(BaseModel):
    booking_id: str
    client_token: str


class RescheduleIn(BaseModel):
    start_at: dt.datetime


class BookingOut(BaseModel):
    id: str
    service_id: str
    service_name: str
    price: float
    client_name: str
    client_phone: str
    start_at: dt.datetime
    end_at: dt.datetime
    status: str
    cancelled_by: str | None
    client_notified: bool  # у клиента есть приложение с включёнными уведомлениями
    share_url: str  # ссылка на запись для клиента: /r/{token}


class WorkingHoursItem(ORM):
    weekday: int = Field(ge=0, le=6)
    start_time: dt.time
    end_time: dt.time


class TimeOffItem(ORM):
    date: dt.date
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    reason: str | None = Field(default=None, max_length=255)


class WorkingSlotItem(ORM):
    weekday: int = Field(ge=0, le=6)
    start_time: dt.time


class DateHoursItem(ORM):
    date: dt.date
    start_time: dt.time
    end_time: dt.time


class DateSlotItem(ORM):
    date: dt.date
    start_time: dt.time


class Schedule(BaseModel):
    schedule_type: Literal["weekly", "dates"] | None = None
    working_hours: list[WorkingHoursItem] = Field(default_factory=list)
    working_slots: list[WorkingSlotItem] = Field(default_factory=list)
    date_hours: list[DateHoursItem] = Field(default_factory=list)
    date_slots: list[DateSlotItem] = Field(default_factory=list)
    time_off: list[TimeOffItem] = Field(default_factory=list)


class WeeklyScheduleIn(BaseModel):
    working_hours: list[WorkingHoursItem]
    working_slots: list[WorkingSlotItem] = Field(default_factory=list)


class DatesScheduleIn(BaseModel):
    dates: list[dt.date] = Field(min_length=1, max_length=93)
    mode: Literal["range", "slots", "off"]
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    slots: list[dt.time] = Field(default_factory=list)


class DayScheduleItem(BaseModel):
    date: dt.date
    mode: Literal["range", "slots", "off"]
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    slots: list[dt.time] = Field(default_factory=list)


class DaysScheduleIn(BaseModel):
    """График по дням: у каждого дня своё время работы."""

    days: list[DayScheduleItem] = Field(min_length=1, max_length=93)


class TimeOffIn(BaseModel):
    time_off: list[TimeOffItem]


class ClientOut(ORM):
    id: str
    name: str
    phone: str
    notes: str | None
    created_at: dt.datetime
    visits: int = 0


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = None


# --- клиентское приложение ---

class ClientBookingMaster(BaseModel):
    slug: str
    name: str
    specialty: str
    address: str
    phone: str  # "" — мастер скрыл номер
    avatar_url: str | None = None


class ClientBookingOut(BaseModel):
    id: str
    status: str
    cancelled_by: str | None
    start_at: dt.datetime
    end_at: dt.datetime
    service_name: str
    price: float
    master: ClientBookingMaster


class ClientMe(BaseModel):
    name: str
    phone: str
    bookings: list[ClientBookingOut]


class BookingLinkOut(BaseModel):
    booking: ClientBookingOut
    in_app: bool  # запись уже привязана к приложению клиента


class ClaimIn(BaseModel):
    client_token: str | None = Field(default=None, max_length=64)


class ClaimOut(BaseModel):
    client_token: str


# --- быстрая запись ---

class QuickParseIn(BaseModel):
    text: str = Field(min_length=3, max_length=500)


class QuickBookingDraft(BaseModel):
    client_name: str
    client_phone: str
    service_id: str | None
    date: dt.date | None
    time: str | None  # HH:MM
    warnings: list[str]
    notes: list[str] = []  # пояснения, а не ошибки: например, время подобрано по «на утро»
    known_client: bool  # телефон найден в клиентах мастера


# --- push ---

class PushKeys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(max_length=500)
    keys: PushKeys


class VapidKey(BaseModel):
    public_key: str
