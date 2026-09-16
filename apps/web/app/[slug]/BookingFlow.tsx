"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/admin/MonthCalendar";
import { CLIENT_TOKEN_KEY } from "@/lib/api";
import { DAY_PARTS } from "@/lib/dayParts";
import { addDays, formatDay, formatDuration, formatPrice, hhmm } from "@/lib/format";
import type { Service, Slot } from "@/lib/types";

const STEPS = ["Услуга", "Время", "Контакты"];
const TITLES = ["Выберите услугу", "Когда вам удобно?", "Ваши контакты"];
const HORIZON_DAYS = 60;

type Props = { slug: string; services: Service[]; today: string; initialServiceId: string | null };

export function BookingFlow({ slug, services, today, initialServiceId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(initialServiceId ? 1 : 0);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const canNext = [Boolean(service), Boolean(slot), Boolean(name.trim()) && phone.replace(/\D/g, "").length >= 10];

  useEffect(() => {
    if (!serviceId) return;
    let ignore = false;
    setSlots(null);
    setSlot(null);
    fetch(`/api/p/${slug}/availability?date=${date}&service_id=${serviceId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Slot[]) => !ignore && setSlots(data))
      .catch(() => !ignore && setSlots([]));
    return () => {
      ignore = true;
    };
  }, [slug, date, serviceId, reloadKey]);

  function goTo(next: number) {
    setStep(next);
    setError("");
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step !== 2 || !service || !slot || !canNext[2]) return;
    setSubmitting(true);
    setError("");
    let clientToken: string | null = null;
    try {
      clientToken = localStorage.getItem(CLIENT_TOKEN_KEY);
    } catch {}

    const res = await fetch(`/api/p/${slug}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: service.id, client_name: name.trim(), client_phone: phone.trim(), start_at: slot.start_at, client_token: clientToken }),
    }).catch(() => null);

    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setSubmitting(false);
      if (res?.status === 409) {
        goTo(1);
        setReloadKey((k) => k + 1);
      }
      setError(typeof data?.detail === "string" ? data.detail : "Не удалось записаться. Попробуйте ещё раз.");
      return;
    }
    const data: { booking_id: string; client_token: string } = await res.json();
    try {
      localStorage.setItem(CLIENT_TOKEN_KEY, data.client_token);
    } catch {}
    router.push(`/c/${data.client_token}?booked=${data.booking_id}`);
  }

  if (!services.length) {
    return <p className="mt-8 rounded-md bg-surface-soft p-5 text-sm text-muted">Мастер пока не добавил услуги. Позвоните, чтобы записаться.</p>;
  }

  return (
    <form id="booking" onSubmit={submit} className="mt-8 scroll-mt-4">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" disabled={i >= step} onClick={() => goTo(i)} className="w-full text-left disabled:cursor-default">
              <span className={`block h-1 rounded-full ${i <= step ? "bg-primary" : "bg-hairline"}`} />
              <span className={`mt-1.5 block text-xs font-medium ${i === step ? "text-ink" : "text-muted"}`}>{i + 1}. {label}</span>
            </button>
          </li>
        ))}
      </ol>

      <h2 className="mb-4 mt-6 text-[22px] font-medium leading-tight tracking-[-0.44px]">{TITLES[step]}</h2>

      {step === 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline">
          {services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  goTo(1);
                }}
                className="flex w-full items-center gap-4 p-4 text-left active:bg-surface-soft"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">{formatDuration(s.duration_minutes)}</span>
                </span>
                <span className="shrink-0 font-semibold">{formatPrice(s.price)}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === 1 && service && (
        <>
          <p className="mb-4 text-sm text-muted">
            {service.name} · {formatDuration(service.duration_minutes)} ·{" "}
            <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={() => goTo(0)}>изменить</button>
          </p>
          <div className="rounded-md border border-hairline p-4">
            <MonthCalendar value={date} onChange={setDate} month={month} onMonthChange={setMonth} minDate={today} maxDate={addDays(today, HORIZON_DAYS)} />
          </div>
          <p className="mb-3 mt-5 font-semibold first-letter:uppercase">{formatDay(date)}</p>
          {slots === null ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="h-10 w-[72px] animate-pulse rounded-full bg-surface-strong" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">На этот день свободного времени нет — выберите другую дату.</p>
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
                        onClick={() => {
                          setSlot(s);
                          goTo(2);
                        }}
                        className={`chip ${slot?.start_at === s.start_at ? "chip-active" : ""}`}
                      >
                        {hhmm(s.start_at)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {step === 2 && service && slot && (
        <>
          <div className="mb-5 rounded-md bg-surface-soft p-4 text-sm">
            <p className="font-semibold">{service.name}</p>
            <p className="mt-1 text-body first-letter:uppercase">
              {formatDay(slot.start_at)}, {hhmm(slot.start_at)}–{hhmm(slot.end_at)} · {formatPrice(service.price)}
            </p>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="label">Имя</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required autoFocus />
            </label>
            <label className="block">
              <span className="label">Телефон</span>
              <input className="input" type="tel" inputMode="tel" placeholder="+7 900 000-00-00" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={32} required />
            </label>
          </div>
          <p className="mt-3 text-sm text-muted">Без регистрации. После записи предложим приложение — в нём придёт уведомление, если время изменится.</p>
        </>
      )}

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-hairline bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button type="button" className="icon-btn h-12 w-12 shrink-0" onClick={() => goTo(step - 1)} aria-label="Назад"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          )}
          <div className="min-w-0 flex-1 text-sm">
            {service ? (
              <>
                <p className="truncate font-semibold">{formatPrice(service.price)}</p>
                <p className="truncate text-muted">
                  {slot ? `${formatDay(slot.start_at, { day: "numeric", month: "short" })}, ${hhmm(slot.start_at)}` : formatDuration(service.duration_minutes)}
                </p>
              </>
            ) : (
              <p className="text-muted">Шаг 1 из 3</p>
            )}
          </div>
          <div className="w-40 shrink-0">
            {step < 2 ? (
              <button type="button" className="btn-primary w-full" disabled={!canNext[step]} onClick={() => goTo(step + 1)}>Далее</button>
            ) : (
              <button type="submit" className="btn-primary w-full" disabled={!canNext[2] || submitting}>{submitting ? "Записываем…" : "Записаться"}</button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
