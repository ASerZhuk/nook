import datetime as dt

from icalendar import Alarm, Calendar, Event

from app.config import TZ
from app.models import Booking, Master, Service


def _utc(value: dt.datetime) -> dt.datetime:
    return value.replace(tzinfo=TZ).astimezone(dt.UTC)


def build_ics(booking: Booking, service: Service, master: Master) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//nook//Booking//RU")
    cal.add("version", "2.0")
    cal.add("method", "PUBLISH")

    event = Event()
    event.add("uid", f"{booking.id}@nook")
    event.add("dtstamp", dt.datetime.now(dt.UTC))
    event.add("dtstart", _utc(booking.start_at))
    event.add("dtend", _utc(booking.end_at))
    event.add("summary", f"{service.name} — {master.name}")
    event.add("description", f"Запись к мастеру {master.name}. Телефон: {master.phone}")

    for trigger, text in ((dt.timedelta(days=-1), "Завтра у вас запись"), (dt.timedelta(hours=-1), "Через час у вас запись")):
        alarm = Alarm()
        alarm.add("action", "DISPLAY")
        alarm.add("description", f"{text}: {service.name}")
        alarm.add("trigger", trigger)
        event.add_component(alarm)

    cal.add_component(event)
    return cal.to_ical()
