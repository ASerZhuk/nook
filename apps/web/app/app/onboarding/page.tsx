"use client";

import Image from "next/image";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { InstallAppSheet } from "@/components/InstallAppSheet";
import { LinkCard } from "@/components/admin/LinkCard";
import { useMaster } from "@/components/admin/MasterShell";
import { PushSetup } from "@/components/admin/PushSetup";
import { MonthCalendar } from "@/components/admin/MonthCalendar";
import { MODE_OPTIONS, Segmented, SlotGrid } from "@/components/admin/ScheduleControls";
import { Field, PasswordInput } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { formatDuration, formatPrice, localToday, slugify } from "@/lib/format";
import { isStandalone } from "@/lib/push";
import type { AdminService } from "@/lib/types";

const STEPS = ["О вас", "Услуги", "Расписание", "Ссылка"];
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DURATIONS = [30, 60, 90, 120];

export default function OnboardingPage() {
  const { me } = useMaster();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState({ name: me.name, specialty: me.specialty, address: me.address });
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(me.has_password);
  const [services, setServices] = useState<AdminService[]>([]);
  const [draft, setDraft] = useState({ name: "", duration_minutes: 60, price: "" });
  const [adding, setAdding] = useState(false);
  const [days, setDays] = useState([true, true, true, true, true, false, false]);
  const [hours, setHours] = useState({ start: "10:00", end: "19:00" });
  const [timeMode, setTimeMode] = useState<"range" | "slots">("range");
  const [slots, setSlots] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<"weekly" | "dates">("weekly");
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(localToday);
  const [slug, setSlug] = useState(me.slug.startsWith("m-") ? "" : me.slug);
  const [done, setDone] = useState(false);
  const [install, setInstall] = useState(false);

  useEffect(() => {
    api<AdminService[]>("/master/services").then(setServices).catch(() => undefined);
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/master/me", { method: "PUT", body: JSON.stringify(profile) });
      if (!passwordSet) {
        await api("/master/password", { method: "PUT", body: JSON.stringify({ password }) });
        setPasswordSet(true);
      }
      if (!slug) setSlug(slugify(profile.name));
      setStep(1);
    });
  };

  async function createService() {
    const created = await api<AdminService>("/master/services", {
      method: "POST",
      body: JSON.stringify({ name: draft.name, duration_minutes: draft.duration_minutes, price: Number(draft.price) || 0 }),
    });
    setServices((list) => [...list, created]);
    setDraft({ name: "", duration_minutes: 60, price: "" });
    setAdding(false);
  }

  const addService = (e: FormEvent) => {
    e.preventDefault();
    run(createService);
  };

  // «Далее» не теряет заполненную форму: сначала сохраняем услугу, потом идём дальше
  const nextFromServices = () =>
    run(async () => {
      if (adding && draft.name.trim()) await createService();
      setStep(2);
    });

  const saveSchedule = () =>
    run(async () => {
      const range = timeMode === "range";
      if (scheduleType === "dates") {
        await api("/master/schedule/dates", {
          method: "PUT",
          body: JSON.stringify(
            range ? { dates: pickedDates, mode: "range", start_time: hours.start, end_time: hours.end } : { dates: pickedDates, mode: "slots", slots },
          ),
        });
      } else {
        const weekdays = days.flatMap((on, weekday) => (on ? [weekday] : []));
        await api("/master/schedule", {
          method: "PUT",
          body: JSON.stringify({
            working_hours: range ? weekdays.map((weekday) => ({ weekday, start_time: hours.start, end_time: hours.end })) : [],
            working_slots: range ? [] : weekdays.flatMap((weekday) => slots.map((start_time) => ({ weekday, start_time }))),
          }),
        });
      }
      setStep(3);
    });

  // шаг можно пропустить: расписание заполняется, только если выбраны и дни, и время
  const scheduleReady =
    (scheduleType === "weekly" ? days.some(Boolean) : pickedDates.length > 0) && (timeMode === "range" ? hours.start < hours.end : slots.length > 0);

  const saveSlug = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/master/me", { method: "PUT", body: JSON.stringify({ slug, onboarded: true }) });
      setDone(true);
      if (!isStandalone()) setInstall(true); // сразу предлагаем поставить приложение на телефон
    });
  };

  return (
    <div className="pt-4">
      <Image src="/logo.png" alt="nook" width={474} height={128} className="h-7 w-auto" priority />

      <ol className="mt-6 grid grid-cols-4 gap-1.5" aria-label="Шаги">
        {STEPS.map((label, i) => (
          <li key={label}>
            <span className={`block h-1 rounded-full ${i <= step ? "bg-primary" : "bg-hairline"}`} />
            <span className={`mt-1.5 block text-[11px] font-medium ${i === step ? "text-ink" : "text-muted"}`}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form onSubmit={saveProfile} className="mt-8 space-y-4">
          <h1 className="text-[28px] font-bold leading-tight">Как вас представить клиентам?</h1>
          <Field label="Имя">
            <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Анна Соколова" autoComplete="name" required autoFocus />
          </Field>
          <Field label="Чем вы занимаетесь">
            <input className="input" value={profile.specialty} onChange={(e) => setProfile({ ...profile, specialty: e.target.value })} placeholder="Мастер маникюра" />
          </Field>
          <Field label="Адрес (необязательно)">
            <input className="input" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Улица, дом — или «выезд на дом»" />
          </Field>
          {!passwordSet && (
            <div>
              <input className="sr-only" type="text" name="username" autoComplete="username" value={me.phone} readOnly tabIndex={-1} aria-hidden />
              <span className="label">Пароль для входа</span>
              <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
              <p className="mt-1.5 text-xs text-muted">Минимум 6 символов — чтобы в следующий раз входить без звонка</p>
            </div>
          )}
          <Footer error={error}>
            <button className="btn-primary w-full" disabled={busy || !profile.name.trim() || (!passwordSet && password.length < 6)}>Далее</button>
          </Footer>
        </form>
      )}

      {step === 1 && (
        <div className="mt-8">
          <h1 className="text-[28px] font-bold leading-tight">Что вы делаете и сколько стоит?</h1>
          <p className="mt-2 text-muted">Это то, на что записываются клиенты. Хватит одной услуги — остальные добавите потом.</p>

          {services.length > 0 && (
            <ul className="mt-5 divide-y divide-hairline rounded-md border border-hairline">
              {services.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block text-sm text-muted">{formatDuration(s.duration_minutes)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatPrice(s.price)}</span>
                </li>
              ))}
            </ul>
          )}

          {adding ? (
            <form onSubmit={addService} className="mt-5 space-y-4 rounded-md bg-surface-soft p-4">
              <Field label="Название">
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Маникюр с покрытием" autoFocus required />
              </Field>
              <div>
                <span className="label">Сколько длится</span>
                <div className="grid grid-cols-4 gap-2">
                  {DURATIONS.map((m) => (
                    <button type="button" key={m} onClick={() => setDraft({ ...draft, duration_minutes: m })} className={`chip px-2 ${draft.duration_minutes === m ? "chip-active" : ""}`}>
                      {formatDuration(m)}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Цена, ₽">
                <input className="input" type="number" inputMode="numeric" min={0} step={50} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="2000" />
              </Field>
              <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => setAdding(false)}>Отмена</button>
                <button className="btn-primary flex-1" disabled={busy || !draft.name.trim()}>Сохранить</button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline py-5 font-semibold active:bg-surface-soft"
            >
              <Plus className="h-5 w-5" aria-hidden />
              {services.length ? "Добавить ещё услугу" : "Добавить услугу"}
            </button>
          )}

          <Footer error={error} onBack={() => setStep(0)}>
            <button type="button" className="btn-primary flex-1" disabled={busy} onClick={nextFromServices}>
              {services.length || (adding && draft.name.trim()) ? "Далее" : "Пропустить"}
            </button>
          </Footer>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8">
          <h1 className="text-[28px] font-bold leading-tight">Когда вы принимаете?</h1>
          <p className="mt-2 text-muted">Постоянный — одинаково каждую неделю. По дням — отмечаете рабочие дни в календаре. Тип графика выбирается один раз.</p>
          <div className="mt-5 flex rounded-full bg-surface-strong p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Тип графика">
            {(
              [
                ["weekly", "Постоянный"],
                ["dates", "По дням"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scheduleType === value}
                onClick={() => setScheduleType(value)}
                className={`flex-1 rounded-full py-2 transition-colors ${scheduleType === value ? "bg-primary text-white shadow-float" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {scheduleType === "dates" ? (
            <>
              <span className="label mt-6">Рабочие дни</span>
              <div className="rounded-md border border-hairline p-4">
                <MonthCalendar
                  value=""
                  multiple={pickedDates}
                  onChange={(d) => setPickedDates((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort()))}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  minDate={localToday()}
                />
              </div>
            </>
          ) : (
            <>
          <span className="label mt-6">Рабочие дни</span>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK.map((label, i) => (
              <button
                type="button"
                key={label}
                onClick={() => setDays(days.map((on, j) => (j === i ? !on : on)))}
                aria-pressed={days[i]}
                className={`h-11 rounded-sm border text-sm font-semibold ${days[i] ? "border-primary bg-primary text-white" : "border-hairline text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
            </>
          )}
          <span className="label mt-6">Время приёма</span>
          <Segmented options={MODE_OPTIONS} value={timeMode} onChange={setTimeMode} full />
          {timeMode === "range" ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="С">
                <input className="input" type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} />
              </Field>
              <Field label="До">
                <input className="input" type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} />
              </Field>
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-3 text-sm text-muted">Отметьте время, на которое клиенты смогут записаться.</p>
              <SlotGrid selected={slots} onChange={setSlots} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Одинаково для всех рабочих дней. Разное время по дням можно задать потом в «Расписании».</p>
          <Footer error={error} onBack={() => setStep(1)}>
            <button type="button" className="btn-primary flex-1" disabled={busy} onClick={scheduleReady ? saveSchedule : () => setStep(3)}>
              {scheduleReady ? "Далее" : "Пропустить"}
            </button>
          </Footer>
        </div>
      )}

      {step === 3 && !done && (
        <form onSubmit={saveSlug} className="mt-8">
          <h1 className="text-[28px] font-bold leading-tight">Ваша ссылка для записи</h1>
          <p className="mt-2 text-muted">Отправьте её клиентам или поставьте в профиль соцсетей — по ней записываются сами.</p>
          <label className="mt-6 block">
            <span className="label">Адрес ссылки</span>
            <span className="flex h-14 items-center rounded-sm border border-hairline px-3 focus-within:border-primary focus-within:shadow-[inset_0_0_0_1px_var(--color-primary)]">
              <span className="shrink-0 text-muted">{window.location.host}/</span>
              <input
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="anna"
                minLength={3}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </span>
          </label>
          <p className="mt-2 text-xs text-muted">Латинские буквы, цифры и дефис, от 3 символов</p>
          <Footer error={error} onBack={() => setStep(2)}>
            <button className="btn-primary flex-1" disabled={busy || slug.length < 3}>Готово</button>
          </Footer>
        </form>
      )}

      {install && <InstallAppSheet onClose={() => setInstall(false)} description="Иконка на экране телефона, быстрый вход и уведомления о новых записях." />}

      {step === 3 && done && (
        <div className="mt-8 space-y-5">
          <h1 className="text-[28px] font-bold leading-tight">Всё готово!</h1>
          <LinkCard slug={slug} />
          <button type="button" className="btn-secondary w-full" onClick={() => setInstall(true)}>Установить приложение</button>
          <PushSetup
            title="Уведомления о новых записях"
            description="Включите, чтобы сразу узнавать, когда клиент записался или отменил запись."
            subscribePath="/master/push/subscribe"
            testPath="/master/push/test"
          />
          <button type="button" className="btn-primary w-full" onClick={() => (window.location.href = "/app")}>
            Перейти к записям
          </button>
        </div>
      )}
    </div>
  );
}

function Footer({ error, onBack, children }: { error: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      <div className="flex gap-3">
        {onBack && (
          <button type="button" className="icon-btn h-12 w-12 shrink-0" onClick={onBack} aria-label="Назад"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
        )}
        {children}
      </div>
    </div>
  );
}
