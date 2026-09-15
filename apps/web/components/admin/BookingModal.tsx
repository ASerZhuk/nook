"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatDay, formatDuration, formatPrice, hhmm, localToday } from "@/lib/format";
import type { AdminService, Booking, Slot } from "@/lib/types";
import { MonthCalendar } from "./MonthCalendar";

const STEPS = ["Услуга", "Дата и время", "Клиент"];
const DAY_PARTS = [
  ["Утро", 0, 12],
  ["День", 12, 17],
  ["Вечер", 17, 24],
] as const;

type Props = {
  services: AdminService[];
  initialDate: string;
  initialTime?: string;
  onClose: () => void;
  onCreated: (booking: Booking) => void;
};

export function BookingModal({ services, initialDate, initialTime, onClose, onCreated }: Props) {
  const today = localToday();
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState(initialDate < today ? today : initialDate);
  const [month, setMonth] = useState(date);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const preferredTime = useRef(initialTime);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const canNext = [Boolean(service), Boolean(slot), Boolean(name.trim()) && phone.replace(/\D/g, "").length >= 5];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Свободные слоты считает API: рабочие часы, перерывы, занятые записи и длительность выбранной услуги
  useEffect(() => {
    if (!serviceId) return;
    let ignore = false;
    setSlots(null);
    setSlot(null);
    api<Slot[]>(`/master/availability?date=${date}&service_id=${serviceId}`)
      .then((data) => {
        if (ignore) return;
        setSlots(data);
        const match = data.find((s) => hhmm(s.start_at) === preferredTime.current);
        if (match) setSlot(match);
        preferredTime.current = undefined;
      })
      .catch((e: Error) => {
        if (ignore) return;
        setSlots([]);
        setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [serviceId, date, reloadKey]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!service || !slot || !canNext[2]) return;
    setSaving(true);
    setError("");
    try {
      const created = await api<Booking>("/master/bookings", {
        method: "POST",
        body: JSON.stringify({ service_id: service.id, client_name: name.trim(), client_phone: phone.trim(), start_at: slot.start_at }),
      });
      onCreated(created);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      if ((err as { status?: number }).status === 409) {
        setStep(1);
        setReloadKey((k) => k + 1);
      }
    }
  }

  function pickService(id: string) {
    setServiceId(id);
    setError("");
    setStep(1);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="booking-modal-title" className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-lg bg-white shadow-float">
        <header className="border-b border-hairline px-6 pb-4 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted">Новая запись · шаг {step + 1} из {STEPS.length}</p>
              <h2 id="booking-modal-title" className="text-xl font-semibold">{STEPS[step]}</h2>
            </div>
            <button type="button" className="icon-btn h-9 w-9" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {STEPS.map((label, i) => (
              <span key={label} className={`h-1 rounded-full ${i <= step ? "bg-primary" : "bg-hairline"}`} />
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-2">
              {services.length === 0 && <p className="text-sm text-muted">Нет активных услуг — добавьте их в разделе «Услуги».</p>}
              {services.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => pickService(s.id)}
                  className={`flex w-full items-center justify-between gap-4 rounded-md border p-4 text-left transition-shadow ${
                    s.id === serviceId ? "border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-hairline hover:shadow-float"
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{s.name}</span>
                    <span className="mt-0.5 block text-sm text-muted">{formatDuration(s.duration_minutes)}</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold">{formatPrice(s.price)}</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && service && (
            <>
              <MonthCalendar value={date} onChange={setDate} month={month} onMonthChange={setMonth} minDate={today} />
              <div className="mt-5 border-t border-hairline pt-5">
                <p className="mb-4 text-sm">
                  <span className="font-semibold first-letter:uppercase">{formatDay(date)}</span>
                  <span className="text-muted"> · {service.name}, {formatDuration(service.duration_minutes)}</span>
                </p>
                {slots === null ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <span key={i} className="h-10 w-[72px] animate-pulse rounded-full bg-surface-strong" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">
                    Нет свободного времени под эту услугу — выберите другой день.
                  </p>
                ) : (
                  DAY_PARTS.map(([label, from, to]) => {
                    const items = slots.filter((s) => {
                      const h = Number(s.start_at.slice(11, 13));
                      return h >= from && h < to;
                    });
                    if (!items.length) return null;
                    return (
                      <div key={label} className="mb-4 last:mb-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                        <div className="flex flex-wrap gap-2">
                          {items.map((s) => (
                            <button
                              type="button"
                              key={s.start_at}
                              onClick={() => setSlot(s)}
                              className={`chip ${slot?.start_at === s.start_at ? "chip-active" : ""}`}
                              title={`${hhmm(s.start_at)}–${hhmm(s.end_at)}`}
                            >
                              {hhmm(s.start_at)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {step === 2 && service && slot && (
            <form id="booking-client-form" onSubmit={submit} className="space-y-4">
              <div className="rounded-md bg-surface-soft p-4 text-sm">
                <p className="font-semibold">{service.name}</p>
                <p className="mt-1 text-body first-letter:uppercase">
                  {formatDay(slot.start_at)}, {hhmm(slot.start_at)}–{hhmm(slot.end_at)} · {formatPrice(service.price)}
                </p>
              </div>
              <label className="block">
                <span className="label">Имя клиента</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus required />
              </label>
              <label className="block">
                <span className="label">Телефон</span>
                <input className="input" type="tel" inputMode="tel" placeholder="+7 900 000-00-00" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} required />
              </label>
            </form>
          )}

          {error && <p className="mt-4 text-sm text-error">{error}</p>}
        </div>

        <footer className="flex gap-3 border-t border-hairline px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {step > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>Назад</button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary flex-1" disabled={!canNext[step]} onClick={() => setStep(step + 1)}>
              Далее
            </button>
          ) : (
            <button type="submit" form="booking-client-form" className="btn-primary flex-1" disabled={!canNext[2] || saving}>
              {saving ? "Сохраняем…" : "Записать клиента"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
