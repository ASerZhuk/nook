"use client";

import { ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookingModal } from "@/components/admin/BookingModal";
import { useMaster } from "@/components/admin/MasterShell";
import { useDialogs } from "@/components/DialogProvider";
import { MonthCalendar } from "@/components/admin/MonthCalendar";
import { NotifyClientSheet, type NotifyKind } from "@/components/admin/NotifyClientSheet";
import { QuickBookingSheet } from "@/components/admin/QuickBookingSheet";
import { NEW_BOOKING_EVENT } from "@/components/admin/TabBar";
import { Empty, ErrorText, Loading, Sheet } from "@/components/admin/ui";
import { api, useLoad } from "@/lib/api";
import { dayPlan } from "@/lib/schedule";
import { addDays, addMonths, formatDay, formatPrice, hhmm, localToday, maskPhone, parseDay, plural } from "@/lib/format";
import type { AdminService, Booking, Schedule, Slot } from "@/lib/types";

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Главный экран мастера — «блокнот»: день списком, записи и свободные окна */
export default function BookingsPage() {
  const [date, setDate] = useState(localToday);
  const [month, setMonth] = useState(date);
  const [showMonth, setShowMonth] = useState(false);
  const [modal, setModal] = useState<{ date: string; time?: string } | null>(null);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [moving, setMoving] = useState<Booking | null>(null);
  const [notice, setNotice] = useState("");
  const [notify, setNotify] = useState<{ kind: NotifyKind; booking: Booking } | null>(null);
  const [quick, setQuick] = useState(false);
  const { me } = useMaster();
  const { confirm, toast } = useDialogs();
  const dateRef = useRef(date);
  dateRef.current = date;

  const monthStart = `${month.slice(0, 7)}-01`;
  const monthBookings = useLoad<Booking[]>(`/master/bookings?from=${monthStart}&to=${addDays(addMonths(monthStart, 1), -1)}`);
  const day = useLoad<Booking[]>(`/master/bookings?from=${date}&to=${date}`);
  const schedule = useLoad<Schedule>("/master/schedule");
  const services = useLoad<AdminService[]>("/master/services");

  // ?date= из push-уведомления, ?new=1 из «+» на другой вкладке
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromPush = params.get("date");
    if (fromPush && /^\d{4}-\d{2}-\d{2}$/.test(fromPush)) {
      setDate(fromPush);
      setMonth(fromPush);
      dateRef.current = fromPush;
    }
    if (params.has("new")) setModal({ date: dateRef.current });
    if (window.location.search) window.history.replaceState(null, "", "/app");
    const open = () => setModal({ date: dateRef.current });
    window.addEventListener(NEW_BOOKING_EVENT, open);
    return () => window.removeEventListener(NEW_BOOKING_EVENT, open);
  }, []);

  const markers = useMemo(() => {
    const result: Record<string, number> = {};
    for (const b of monthBookings.data ?? []) {
      if (b.status === "confirmed") result[b.start_at.slice(0, 10)] = (result[b.start_at.slice(0, 10)] ?? 0) + 1;
    }
    return result;
  }, [monthBookings.data]);

  const confirmed = day.data?.filter((b) => b.status === "confirmed") ?? [];
  const cancelled = day.data?.filter((b) => b.status === "cancelled") ?? [];
  const revenue = confirmed.reduce((sum, b) => sum + b.price, 0); // примерная выручка: цены услуг подтверждённых записей

  function selectDate(d: string) {
    setDate(d);
    if (d.slice(0, 7) !== month.slice(0, 7)) setMonth(d);
  }

  const reload = () => {
    day.reload();
    monthBookings.reload();
  };

  const closeModal = useCallback(() => setModal(null), []);

  // клиент с приложением nook уже получил push; остальным — предлагаем SMS / «Поделиться»
  function report(action: string, kind: NotifyKind, b: Booking) {
    if (b.client_notified) {
      setNotice(`${action} — клиент получил уведомление в nook.`);
      return;
    }
    if (!b.client_phone) {
      setNotice(`${action}. Номер телефона не указан — вы не сможете предупредить клиента.`);
      return;
    }
    setNotice("");
    setNotify({ kind, booking: b });
  }

  async function cancel(b: Booking) {
    const ok = await confirm({
      title: "Отменить запись?",
      message: `${b.client_name}, ${formatDay(b.start_at, { day: "numeric", month: "long" })} в ${hhmm(b.start_at)}. Время освободится для других клиентов.`,
      confirmText: "Отменить запись",
      cancelText: "Не отменять",
      danger: true,
    });
    if (!ok) return;
    try {
      const updated = await api<Booking>(`/master/bookings/${b.id}/cancel`, { method: "PUT" });
      setSelected(null);
      report("Запись отменена", "cancelled", updated);
      reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-white px-4 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setShowMonth((v) => !v)} className="flex items-center gap-1.5 py-1 text-[22px] font-semibold tracking-[-0.44px]" aria-expanded={showMonth}>
            <span className="first-letter:uppercase">{formatDay(date, { month: "long" })}</span>
            <ChevronDown className={`h-5 w-5 text-muted transition-transform ${showMonth ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <button type="button" className="btn-ghost -mr-3" onClick={() => selectDate(localToday())}>Сегодня</button>
        </div>
        {showMonth ? (
          <div className="pb-2">
            <MonthCalendar
              value={date}
              onChange={(d) => {
                selectDate(d);
                setShowMonth(false);
              }}
              month={month}
              onMonthChange={setMonth}
              markers={markers}
            />
          </div>
        ) : (
          <WeekStrip date={date} onChange={selectDate} markers={markers} />
        )}
      </header>

      <section className="pt-4">
        {services.data && schedule.data && (!services.data.length || !schedule.data.schedule_type) && (
          <Link
            href={!services.data.length ? "/app/services" : "/app/schedule"}
            className="mb-4 flex items-center justify-between gap-3 rounded-md bg-surface-soft px-4 py-3 text-sm text-body"
          >
            <span>
              <b className="text-ink">{!services.data.length ? "Добавьте услуги" : "Заполните расписание"}</b> — без этого клиенты не смогут записаться
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setQuick(true)}
          disabled={!services.data}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-hairline bg-white px-4 py-3 text-[15px] text-muted shadow-float active:bg-surface-soft"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate">Быстрая запись</span>
        </button>
        <div className="mb-3 flex items-baseline justify-between gap-3 text-sm text-muted">
          <p className="min-w-0 first-letter:uppercase">
            {formatDay(date)}
            {day.data && ` · ${confirmed.length} ${plural(confirmed.length, ["запись", "записи", "записей"])}`}
          </p>
          {confirmed.length > 0 && (
            <p className="shrink-0" title="Примерная выручка за день">
              ≈ <span className="font-semibold text-ink">{formatPrice(revenue)}</span>
            </p>
          )}
        </div>

        {notice && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-sm bg-surface-soft p-3 text-sm text-body">
            <span>{notice}</span>
            <button type="button" className="shrink-0 text-muted" onClick={() => setNotice("")} aria-label="Скрыть"><X className="h-4 w-4" aria-hidden /></button>
          </div>
        )}

        <ErrorText>{day.error || schedule.error}</ErrorText>
        {!day.data || !schedule.data ? (
          <Loading />
        ) : (
          <DayNotebook date={date} bookings={confirmed} schedule={schedule.data} onPick={(time) => setModal({ date, time })} onSelect={setSelected} />
        )}

        {cancelled.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-muted">Отменённые</p>
            <ul className="space-y-1 text-sm text-muted">
              {cancelled.map((b) => (
                <li key={b.id}>
                  <span className="line-through">{hhmm(b.start_at)} · {b.client_name} · {b.service_name}</span>
                  {b.cancelled_by === "client" && " — отменил клиент"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {selected && (
        <BookingSheet
          booking={selected}
          onClose={() => setSelected(null)}
          onCancel={cancel}
          onMove={() => {
            setMoving(selected);
            setSelected(null);
          }}
          onNotify={() => {
            setNotify({ kind: "created", booking: selected });
            setSelected(null);
          }}
        />
      )}

      {notify && (
        <NotifyClientSheet kind={notify.kind} booking={notify.booking} masterName={me.name} masterSlug={me.slug} onClose={() => setNotify(null)} />
      )}

      {moving && (
        <MoveSheet
          booking={moving}
          onClose={() => setMoving(null)}
          onDone={(updated) => {
            setMoving(null);
            report("Запись перенесена", "moved", updated);
            selectDate(updated.start_at.slice(0, 10));
            reload();
          }}
        />
      )}

      {quick && services.data && (
        <QuickBookingSheet
          services={services.data.filter((s) => s.is_active)}
          onClose={() => setQuick(false)}
          onCreated={(created) => {
            setQuick(false);
            selectDate(created.start_at.slice(0, 10));
            reload();
            // время мог подобрать сервер («на утро») — называем его в уведомлении
            report(`Записали на ${formatDay(created.start_at, { day: "numeric", month: "long" })}, ${hhmm(created.start_at)}`, "created", created);
          }}
        />
      )}

      {modal && services.data && (
        <BookingModal
          services={services.data.filter((s) => s.is_active)}
          initialDate={modal.date}
          initialTime={modal.time}
          onClose={closeModal}
          onCreated={(created) => {
            setModal(null);
            selectDate(created.start_at.slice(0, 10));
            reload();
            report("Клиент записан", "created", created);
          }}
        />
      )}
    </>
  );
}

function WeekStrip({ date, onChange, markers }: { date: string; onChange: (d: string) => void; markers: Record<string, number> }) {
  const monday = addDays(date, -((parseDay(date).getUTCDay() + 6) % 7));
  const today = localToday();
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="icon-btn h-9 w-9 shrink-0" onClick={() => onChange(addDays(date, -7))} aria-label="Предыдущая неделя"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
      <div className="grid flex-1 grid-cols-7">
        {WEEK.map((label, i) => {
          const d = addDays(monday, i);
          const active = d === date;
          return (
            <button type="button" key={d} onClick={() => onChange(d)} className="flex flex-col items-center gap-0.5 py-1" aria-pressed={active}>
              <span className="text-[11px] text-muted">{label}</span>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                  active ? "bg-primary font-semibold text-white" : d === today ? "font-bold text-primary" : "text-ink"
                }`}
              >
                {parseDay(d).getUTCDate()}
              </span>
              <span className={`h-1 w-1 rounded-full ${markers[d] ? "bg-primary" : ""}`} />
            </button>
          );
        })}
      </div>
      <button type="button" className="icon-btn h-9 w-9 shrink-0" onClick={() => onChange(addDays(date, 7))} aria-label="Следующая неделя"><ChevronRight className="h-5 w-5" aria-hidden /></button>
    </div>
  );
}

type Entry =
  | { kind: "booking"; start: number; booking: Booking }
  | { kind: "gap" | "break"; start: number; end: number }
  | { kind: "window"; start: number };

function DayNotebook({
  date,
  bookings,
  schedule,
  onPick,
  onSelect,
}: {
  date: string;
  bookings: Booking[];
  schedule: Schedule;
  onPick: (time: string) => void;
  onSelect: (b: Booking) => void;
}) {
  const { hours, slots: daySlots } = dayPlan(schedule, date);
  const offs = schedule.time_off.filter((o) => o.date === date);
  const dayOff = offs.find((o) => !o.start_time);
  const breaks = offs.flatMap((o) => (o.start_time && o.end_time ? [[toMin(o.start_time), toMin(o.end_time)] as const] : []));
  const today = localToday();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // свободные окна = рабочие часы − записи − перерывы (для сегодня — начиная с текущего времени)
  const busy = [...bookings.map((b) => [toMin(hhmm(b.start_at)), toMin(hhmm(b.end_at))] as const), ...breaks].sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  if (!dayOff && date >= today && !daySlots.length) {
    for (const [from, to] of hours) {
      let cursor = date === today ? Math.max(from, Math.ceil(nowMin / 15) * 15) : from;
      for (const [bs, be] of busy) {
        if (be <= cursor || bs >= to) continue;
        if (bs > cursor) gaps.push([cursor, bs]);
        cursor = Math.max(cursor, be);
      }
      if (cursor < to) gaps.push([cursor, to]);
    }
  }

  // режим «окошки»: свободные окошки = заданные времена, не попадающие в записи/перерывы и не прошедшие
  const windows =
    !dayOff && date >= today
      ? daySlots.filter((s) => (date > today || s >= nowMin) && !busy.some(([bs, be]) => s >= bs && s < be))
      : [];

  const entries: Entry[] = [
    ...bookings.map((b) => ({ kind: "booking" as const, start: toMin(hhmm(b.start_at)), booking: b })),
    ...windows.map((start) => ({ kind: "window" as const, start })),
    ...gaps.filter(([s, e]) => e - s >= 15).map(([start, end]) => ({ kind: "gap" as const, start, end })),
    ...breaks.map(([start, end]) => ({ kind: "break" as const, start, end })),
  ].sort((a, b) => a.start - b.start);

  if (!entries.length) {
    const text = dayOff
      ? `Выходной${dayOff.reason ? ` · ${dayOff.reason}` : ""}`
      : date < today
        ? "Записей не было"
        : !hours.length && !daySlots.length
          ? "Нерабочий день. Запись можно добавить кнопкой «+»"
          : "Свободного времени не осталось";
    return <Empty>{text}</Empty>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) =>
        e.kind === "booking" ? (
          <li key={e.booking.id}>
            <button type="button" onClick={() => onSelect(e.booking)} className="flex w-full items-stretch gap-3 rounded-md border border-hairline bg-white p-3 text-left active:bg-surface-soft">
              <span className="w-12 shrink-0">
                <span className="block text-base font-semibold leading-tight">{hhmm(e.booking.start_at)}</span>
                <span className="block text-xs text-muted">{hhmm(e.booking.end_at)}</span>
              </span>
              <span className="w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.booking.client_name}</span>
                <span className="block truncate text-sm text-muted">{e.booking.service_name}</span>
              </span>
              <span className="shrink-0 self-center text-sm font-medium">{formatPrice(e.booking.price)}</span>
            </button>
          </li>
        ) : e.kind === "window" ? (
          <li key={`window-${e.start}`}>
            <button type="button" onClick={() => onPick(fmt(e.start))} className="flex w-full items-center gap-3 rounded-md border border-dashed border-hairline px-3 py-3 text-left text-sm text-muted active:bg-surface-soft">
              <span className="w-12 shrink-0 font-medium text-ink">{fmt(e.start)}</span>
              <span className="w-[3px] shrink-0" aria-hidden />
              <span className="flex-1">Свободное окошко</span>
              <Plus className="h-5 w-5 text-primary" aria-hidden />
            </button>
          </li>
        ) : e.kind === "gap" ? (
          <li key={`gap-${e.start}`}>
            <button type="button" onClick={() => onPick(fmt(e.start))} className="flex w-full items-center gap-3 rounded-md border border-dashed border-hairline px-3 py-3 text-left text-sm text-muted active:bg-surface-soft">
              <span className="w-12 shrink-0 font-medium text-ink">{fmt(e.start)}</span>
              <span className="w-[3px] shrink-0" aria-hidden />
              <span className="flex-1">Свободно до {fmt(e.end)}</span>
              <Plus className="h-5 w-5 text-primary" aria-hidden />
            </button>
          </li>
        ) : (
          <li key={`break-${e.start}`} className="flex items-center gap-3 rounded-md bg-surface-soft px-3 py-3 text-sm text-muted">
            <span className="w-12 shrink-0">{fmt(e.start)}</span>
            <span className="w-[3px] shrink-0" aria-hidden />
            Перерыв до {fmt(e.end)}
          </li>
        ),
      )}
    </ul>
  );
}

function BookingSheet({
  booking: b,
  onClose,
  onCancel,
  onMove,
  onNotify,
}: {
  booking: Booking;
  onClose: () => void;
  onCancel: (b: Booking) => void;
  onMove: () => void;
  onNotify: () => void;
}) {
  return (
    <Sheet title={`${hhmm(b.start_at)}–${hhmm(b.end_at)}`} subtitle={formatDay(b.start_at)} onClose={onClose}>
      <dl className="divide-y divide-hairline-soft text-sm">
        {[
          ["Клиент", b.client_name],
          ["Телефон", b.client_phone ? maskPhone(b.client_phone) : "не указан"],
          ["Услуга", b.service_name],
          ["Стоимость", formatPrice(b.price)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 rounded-sm bg-surface-soft p-3 text-sm text-body">
        {b.client_notified
          ? "У клиента есть приложение nook — о переносе или отмене он получит уведомление."
          : b.client_phone
            ? "У клиента нет приложения nook — при изменениях сообщите ему сами."
            : "Номер телефона не указан — предупредить клиента о записи и изменениях не получится."}
      </p>
      <div className={`mt-5 grid gap-2 ${b.client_phone ? "grid-cols-3" : "grid-cols-2"}`}>
        {b.client_phone && <a href={`tel:${b.client_phone}`} className="btn-secondary px-2">Позвонить</a>}
        <button type="button" className="btn-secondary px-2" onClick={onMove}>Перенести</button>
        <button type="button" className="btn-secondary border-error px-2 text-error" onClick={() => onCancel(b)}>Отменить</button>
      </div>
      {b.client_phone && (
        <button type="button" className="btn-ghost mt-2 w-full" onClick={onNotify}>
          <MessageSquare className="h-4 w-4" aria-hidden />
          Отправить клиенту SMS с записью
        </button>
      )}
    </Sheet>
  );
}

function MoveSheet({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: (b: Booking) => void }) {
  const today = localToday();
  const initial = booking.start_at.slice(0, 10) < today ? today : booking.start_at.slice(0, 10);
  const [date, setDate] = useState(initial);
  const [month, setMonth] = useState(initial);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    setSlots(null);
    setSlot(null);
    api<Slot[]>(`/master/availability?date=${date}&service_id=${booking.service_id}&exclude=${booking.id}`)
      .then((data) => !ignore && setSlots(data))
      .catch((e: Error) => {
        if (ignore) return;
        setSlots([]);
        setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [date, booking]);

  async function save() {
    if (!slot) return;
    setSaving(true);
    setError("");
    try {
      onDone(await api<Booking>(`/master/bookings/${booking.id}/reschedule`, { method: "PUT", body: JSON.stringify({ start_at: slot.start_at }) }));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Перенести запись" subtitle={`${booking.client_name} · ${booking.service_name}`} onClose={onClose}>
      <MonthCalendar value={date} onChange={setDate} month={month} onMonthChange={setMonth} minDate={today} />
      <div className="mt-4 border-t border-hairline pt-4">
        <p className="mb-3 text-sm font-semibold first-letter:uppercase">{formatDay(date)}</p>
        {slots === null ? (
          <Loading />
        ) : slots.length === 0 ? (
          <p className="rounded-sm bg-surface-soft p-3 text-sm text-muted">Нет свободного времени под эту услугу — выберите другой день.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button type="button" key={s.start_at} onClick={() => setSlot(s)} className={`chip ${slot?.start_at === s.start_at ? "chip-active" : ""}`}>
                {hhmm(s.start_at)}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <button type="button" className="btn-primary mt-5 w-full" disabled={!slot || saving} onClick={save}>
        {saving ? "Переносим…" : slot ? `Перенести на ${hhmm(slot.start_at)}` : "Выберите время"}
      </button>
    </Sheet>
  );
}
