"use client";

import { ChevronDown, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { MonthCalendar } from "@/components/admin/MonthCalendar";
import { MODE_OPTIONS, Segmented, SlotGrid } from "@/components/admin/ScheduleControls";
import { useDialogs } from "@/components/DialogProvider";
import { Empty, ErrorText, Field, Loading, PageHeader, Sheet } from "@/components/admin/ui";
import { api, useLoad } from "@/lib/api";
import { formatDay, localToday, parseDay, plural } from "@/lib/format";
import type { Schedule, ScheduleType, TimeOff } from "@/lib/types";

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const hm = (time: string) => time.slice(0, 5);

type Mode = "range" | "slots";
type DayMode = Mode | "off";
type Day = { enabled: boolean; mode: Mode; start: string; end: string; slots: string[] };
type OnSaved = (schedule: Schedule) => void;
type Editor = { kind: "weekly" } | { kind: "dates"; dates: string[] } | { kind: "timeoff" } | null;

const TYPE_OPTIONS = [
  ["weekly", "Постоянный"],
  ["dates", "По дням"],
] as const;
const DAY_MODE_OPTIONS = [
  ["range", "С — до"],
  ["slots", "Окошки"],
  ["off", "Выходной"],
] as const;

export default function SchedulePage() {
  const { data, error, setData } = useLoad<Schedule>("/master/schedule");
  const [chosen, setChosen] = useState<ScheduleType>("weekly");
  const [editor, setEditor] = useState<Editor>(null);

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const type = data.schedule_type;
  const close = () => setEditor(null);
  const saved = (schedule: Schedule) => {
    setData(schedule);
    setEditor(null);
  };

  return (
    <>
      <PageHeader title="Расписание" subtitle={type ? undefined : "Когда клиенты могут к вам записаться"} />
      {type && (
        <p className="-mt-4 mb-5 flex items-center gap-1.5 text-sm text-muted">
          <Lock className="h-4 w-4" aria-hidden />
          {type === "weekly" ? "Постоянный график" : "График по дням"}
        </p>
      )}

      {!type && (
        <section className="rounded-md border border-hairline p-5">
          <h2 className="font-semibold">Как вы работаете?</h2>
          <div className="mt-4">
            <Segmented options={TYPE_OPTIONS} value={chosen} onChange={setChosen} full />
          </div>
          <p className="mt-3 text-sm text-body">
            {chosen === "weekly"
              ? "Одинаковое время каждую неделю — например, пн–пт с 10 до 19."
              : "Отмечаете рабочие дни в календаре — удобно, если график плавающий."}
          </p>
          <p className="mt-2 text-xs text-muted">Тип графика выбирается один раз — после сохранения сменить его нельзя.</p>
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            onClick={() => setEditor(chosen === "weekly" ? { kind: "weekly" } : { kind: "dates", dates: [] })}
          >
            Настроить график
          </button>
        </section>
      )}

      {type === "weekly" && (
        <>
          <WeeklyView data={data} />
          <button type="button" className="btn-secondary mt-4 w-full" onClick={() => setEditor({ kind: "weekly" })}>
            Изменить график
          </button>
        </>
      )}

      {type === "dates" && <DatesView data={data} onEdit={(dates) => setEditor({ kind: "dates", dates })} />}

      {(type || data.time_off.length > 0) && <TimeOffView data={data} onChanged={setData} onAdd={() => setEditor({ kind: "timeoff" })} />}

      {type && <DeleteSchedule onDeleted={setData} />}

      {editor?.kind === "weekly" && <WeeklyEditorSheet data={data} onClose={close} onSaved={saved} />}
      {editor?.kind === "dates" && <DatesEditorSheet data={data} initialDates={editor.dates} onClose={close} onSaved={saved} />}
      {editor?.kind === "timeoff" && <TimeOffSheet data={data} onClose={close} onSaved={saved} />}
    </>
  );
}

/* ---------- Постоянный график ---------- */

function toDays(data: Schedule): Day[] {
  return WEEKDAYS.map((_, weekday): Day => {
    const slots = data.working_slots.filter((s) => s.weekday === weekday).map((s) => hm(s.start_time)).sort();
    const hours = data.working_hours.find((h) => h.weekday === weekday);
    if (slots.length) return { enabled: true, mode: "slots", start: "10:00", end: "20:00", slots };
    if (hours) return { enabled: true, mode: "range", start: hm(hours.start_time), end: hm(hours.end_time), slots: [] };
    return { enabled: false, mode: "range", start: "10:00", end: "20:00", slots: [] };
  });
}

function WeeklyView({ data }: { data: Schedule }) {
  const days = toDays(data);
  return (
    <ul className="divide-y divide-hairline rounded-md border border-hairline">
      {days.map((d, i) => (
        <li key={i} className="flex items-start justify-between gap-4 px-4 py-3">
          <span className="font-medium">{WEEKDAYS[i]}</span>
          {!d.enabled ? (
            <span className="text-[15px] text-muted">Выходной</span>
          ) : d.mode === "range" ? (
            <span className="text-[15px]">{d.start}–{d.end}</span>
          ) : (
            <span className="text-right text-[15px]">
              {d.slots.join(", ")}
              <span className="block text-xs text-muted">окошки</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function WeeklyEditorSheet({ data, onClose, onSaved }: { data: Schedule; onClose: () => void; onSaved: OnSaved }) {
  const [days, setDays] = useState<Day[]>(() => toDays(data));
  const [picking, setPicking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateDay = (i: number, patch: Partial<Day>) => setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function save() {
    setError("");
    const emptyDay = days.findIndex((d) => d.enabled && d.mode === "slots" && !d.slots.length);
    if (emptyDay >= 0) {
      setError(`${WEEKDAYS[emptyDay]}: выберите хотя бы одно окошко`);
      return;
    }
    setSaving(true);
    try {
      onSaved(
        await api<Schedule>("/master/schedule", {
          method: "PUT",
          body: JSON.stringify({
            working_hours: days.flatMap((d, weekday) => (d.enabled && d.mode === "range" ? [{ weekday, start_time: d.start, end_time: d.end }] : [])),
            working_slots: days.flatMap((d, weekday) => (d.enabled && d.mode === "slots" ? d.slots.map((start_time) => ({ weekday, start_time })) : [])),
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  // выбор окошек — внутри той же шторки, без второго окна поверх
  if (picking !== null) {
    const day = days[picking];
    return (
      <Sheet title="Окошки для записи" subtitle={WEEKDAYS[picking]} onClose={() => setPicking(null)}>
        <p className="mb-4 text-sm text-muted">Отметьте время, на которое клиенты смогут записаться. Длительность услуги и занятое время учитываются автоматически.</p>
        <SlotGrid selected={day.slots} onChange={(slots) => updateDay(picking, { slots })} />
        <SheetFooter>
          <button type="button" className="btn-primary w-full" onClick={() => setPicking(null)}>
            {day.slots.length ? `Готово · ${day.slots.length} ${plural(day.slots.length, ["окошко", "окошка", "окошек"])}` : "Готово"}
          </button>
        </SheetFooter>
      </Sheet>
    );
  }

  return (
    <Sheet title="Постоянный график" subtitle={data.schedule_type ? undefined : "Тип графика выбирается один раз"} onClose={onClose}>
      <div className="divide-y divide-hairline rounded-md border border-hairline">
        {days.map((d, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex min-h-10 items-center justify-between gap-3">
              <label className="flex items-center gap-3 font-medium">
                <input type="checkbox" className="h-5 w-5 accent-primary" checked={d.enabled} onChange={(e) => updateDay(i, { enabled: e.target.checked })} />
                {WEEKDAYS[i]}
              </label>
              {d.enabled ? (
                <Segmented options={MODE_OPTIONS} value={d.mode} onChange={(mode) => updateDay(i, { mode })} />
              ) : (
                <span className="text-sm text-muted">Выходной</span>
              )}
            </div>
            {d.enabled && d.mode === "range" && (
              <div className="mt-2 flex items-center gap-2 pl-8">
                <input type="time" className="input-sm flex-1" value={d.start} onChange={(e) => updateDay(i, { start: e.target.value })} aria-label="С" />
                <span className="text-muted">—</span>
                <input type="time" className="input-sm flex-1" value={d.end} onChange={(e) => updateDay(i, { end: e.target.value })} aria-label="До" />
              </div>
            )}
            {d.enabled && d.mode === "slots" && (
              <div className="mt-2 pl-8">
                <button
                  type="button"
                  onClick={() => setPicking(i)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border border-hairline px-3 py-2 text-left text-[15px] active:bg-surface-soft"
                >
                  <span className={d.slots.length ? "text-ink" : "text-muted"}>{d.slots.length ? d.slots.join(", ") : "Выберите время"}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <SheetFooter>
        <button type="button" className="btn-primary w-full" onClick={save} disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </SheetFooter>
    </Sheet>
  );
}

/* ---------- График по дням ---------- */

function dateLabels(data: Schedule) {
  const labels = new Map<string, string>();
  for (const h of data.date_hours) labels.set(h.date, `${hm(h.start_time)}–${hm(h.end_time)}`);
  const slots = new Map<string, string[]>();
  for (const s of data.date_slots) slots.set(s.date, [...(slots.get(s.date) ?? []), hm(s.start_time)]);
  for (const [date, times] of slots) labels.set(date, `Окошки: ${times.sort().join(", ")}`);
  return new Map([...labels].sort(([a], [b]) => a.localeCompare(b)));
}

function DatesView({ data, onEdit }: { data: Schedule; onEdit: (dates: string[]) => void }) {
  const today = localToday();
  const [month, setMonth] = useState(today);
  const labels = useMemo(() => dateLabels(data), [data]);
  const markers = useMemo(() => Object.fromEntries([...labels.keys()].map((d) => [d, 1])), [labels]);

  return (
    <>
      <div className="rounded-md border border-hairline p-4">
        <MonthCalendar value="" onChange={(d) => onEdit([d])} month={month} onMonthChange={setMonth} minDate={today} markers={markers} />
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          рабочий день · нажмите на день, чтобы изменить
        </p>
      </div>
      <button type="button" className="btn-primary mt-4 w-full" onClick={() => onEdit([])}>
        <Plus className="h-5 w-5" aria-hidden />
        Добавить рабочие дни
      </button>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Ближайшие рабочие дни</h2>
        {labels.size ? (
          <ul className="mt-3 divide-y divide-hairline rounded-md border border-hairline">
            {[...labels].map(([date, label]) => (
              <li key={date}>
                <button type="button" onClick={() => onEdit([date])} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-surface-soft">
                  <span className="min-w-0">
                    <span className="block font-medium first-letter:uppercase">{formatDay(date)}</span>
                    <span className="block truncate text-sm text-muted">{label}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <Empty>Рабочие дни не отмечены — клиенты пока не могут записаться</Empty>
          </div>
        )}
      </section>
    </>
  );
}

type DayConfig = { mode: DayMode; start: string; end: string; slots: string[] };
const DEFAULT_DAY: DayConfig = { mode: "range", start: "10:00", end: "19:00", slots: [] };

function configFor(data: Schedule, date: string | undefined): DayConfig {
  const slots = data.date_slots.filter((s) => s.date === date).map((s) => hm(s.start_time)).sort();
  const hours = data.date_hours.find((h) => h.date === date);
  if (slots.length) return { ...DEFAULT_DAY, mode: "slots", slots };
  if (hours) return { ...DEFAULT_DAY, start: hm(hours.start_time), end: hm(hours.end_time) };
  return DEFAULT_DAY;
}

const isValidConfig = (c: DayConfig) => (c.mode !== "range" || c.start < c.end) && (c.mode !== "slots" || c.slots.length > 0);

function describeConfig(c: DayConfig) {
  if (c.mode === "off") return "Выходной";
  if (c.mode === "range") return c.start < c.end ? `${c.start}–${c.end}` : "Проверьте время";
  return c.slots.length ? `Окошки: ${c.slots.join(", ")}` : "Выберите окошки";
}

function DayConfigFields({ value, onChange }: { value: DayConfig; onChange: (config: DayConfig) => void }) {
  return (
    <>
      <Segmented options={DAY_MODE_OPTIONS} value={value.mode} onChange={(mode) => onChange({ ...value, mode })} full />
      <div className="mt-4">
        {value.mode === "range" && (
          <div className="flex items-center gap-2">
            <input type="time" className="input-sm flex-1" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} aria-label="С" />
            <span className="text-muted">—</span>
            <input type="time" className="input-sm flex-1" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} aria-label="До" />
          </div>
        )}
        {value.mode === "slots" && <SlotGrid selected={value.slots} onChange={(slots) => onChange({ ...value, slots })} />}
        {value.mode === "off" && <p className="rounded-sm bg-surface-soft p-3 text-sm text-muted">Клиенты не смогут записаться.</p>}
      </div>
    </>
  );
}

function DatesEditorSheet({
  data,
  initialDates,
  onClose,
  onSaved,
}: {
  data: Schedule;
  initialDates: string[];
  onClose: () => void;
  onSaved: OnSaved;
}) {
  const today = localToday();
  const labels = useMemo(() => dateLabels(data), [data]);
  const markers = useMemo(() => Object.fromEntries([...labels.keys()].map((d) => [d, 1])), [labels]);

  const [dates, setDates] = useState<string[]>(initialDates);
  const [month, setMonth] = useState(initialDates[0] ?? today);
  const [shared, setShared] = useState<DayConfig>(() => configFor(data, initialDates.length === 1 ? initialDates[0] : undefined));
  const [same, setSame] = useState(true);
  const [perDay, setPerDay] = useState<Record<string, DayConfig>>({});
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const individual = !same && dates.length > 1;
  // свой день: что задали здесь → что уже было в графике → общее время
  const dayConfig = (date: string) => perDay[date] ?? (labels.has(date) ? configFor(data, date) : shared);
  const items = dates.map((date) => ({ date, config: individual ? dayConfig(date) : shared }));
  const valid = items.length > 0 && items.every((item) => isValidConfig(item.config));

  const toggle = (date: string) => setDates((list) => (list.includes(date) ? list.filter((d) => d !== date) : [...list, date].sort()));
  const subtitle = !dates.length
    ? "Выберите дни в календаре"
    : dates.length === 1
      ? formatDay(dates[0])
      : `${dates.length} ${plural(dates.length, ["день", "дня", "дней"])}: ${dates.map((d) => parseDay(d).getUTCDate()).join(", ")}`;

  async function save() {
    setSaving(true);
    setError("");
    try {
      onSaved(
        await api<Schedule>("/master/schedule/days", {
          method: "PUT",
          body: JSON.stringify({
            days: items.map(({ date, config: c }) => ({
              date,
              mode: c.mode,
              start_time: c.mode === "range" ? c.start : null,
              end_time: c.mode === "range" ? c.end : null,
              slots: c.mode === "slots" ? c.slots : [],
            })),
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Sheet title={initialDates.length === 1 && labels.has(initialDates[0]) ? "Изменить день" : "Рабочие дни"} subtitle={subtitle} onClose={onClose}>
      <MonthCalendar value="" multiple={dates} onChange={toggle} month={month} onMonthChange={setMonth} minDate={today} markers={markers} />
      <div className="mt-4 border-t border-hairline pt-4">
        {dates.length > 1 && (
          <label className="mb-4 flex items-center justify-between gap-3 text-[15px]">
            <span>
              Одинаковое время для всех дней
              <span className="block text-xs text-muted">Выключите, чтобы задать каждому дню своё время или окошки</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-primary"
              checked={same}
              onChange={(e) => {
                setSame(e.target.checked);
                setOpenDay(null);
              }}
            />
          </label>
        )}

        {individual ? (
          <ul className="divide-y divide-hairline rounded-md border border-hairline">
            {dates.map((date) => {
              const config = dayConfig(date);
              const expanded = openDay === date;
              return (
                <li key={date}>
                  <button
                    type="button"
                    onClick={() => setOpenDay(expanded ? null : date)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-surface-soft"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium first-letter:uppercase">{formatDay(date, { weekday: "short", day: "numeric", month: "long" })}</span>
                      <span className={`block truncate text-sm ${isValidConfig(config) ? "text-muted" : "text-error"}`}>{describeConfig(config)}</span>
                    </span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-muted-soft transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4">
                      <DayConfigFields value={config} onChange={(c) => setPerDay((map) => ({ ...map, [date]: c }))} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <DayConfigFields value={shared} onChange={setShared} />
        )}
      </div>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <SheetFooter>
        <button type="button" className="btn-primary w-full" disabled={saving || !valid} onClick={save}>
          {saving ? "Сохраняем…" : dates.length ? `Сохранить · ${dates.length} ${plural(dates.length, ["день", "дня", "дней"])}` : "Сохранить"}
        </button>
      </SheetFooter>
    </Sheet>
  );
}

/* ---------- Выходные и перерывы (для обоих типов) ---------- */

function TimeOffView({ data, onChanged, onAdd }: { data: Schedule; onChanged: OnSaved; onAdd: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove(index: number) {
    setBusy(true);
    setError("");
    try {
      const next = data.time_off.filter((_, i) => i !== index);
      onChanged(await api<Schedule>("/master/schedule/time-off", { method: "PUT", body: JSON.stringify({ time_off: next }) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="whitespace-nowrap text-lg font-semibold">Выходные и перерывы</h2>
        <button type="button" className="btn-ghost -mr-3 shrink-0 gap-1" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          Добавить
        </button>
      </div>
      <p className="text-sm text-muted">В это время клиенты не смогут записаться.</p>
      <ErrorText>{error}</ErrorText>

      {data.time_off.length ? (
        <ul className="mt-3 divide-y divide-hairline rounded-md border border-hairline">
          {data.time_off.map((o, i) => (
            <li key={`${o.date}-${o.start_time}-${i}`} className="flex items-center gap-3 py-3 pl-4 pr-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium first-letter:uppercase">{formatDay(o.date)}</p>
                <p className="truncate text-sm text-muted">
                  {o.start_time && o.end_time ? `Перерыв ${hm(o.start_time)}–${hm(o.end_time)}` : "Весь день"}
                  {o.reason && ` · ${o.reason}`}
                </p>
              </div>
              <button type="button" className="icon-btn h-10 w-10 shrink-0 border-transparent text-error" disabled={busy} onClick={() => remove(i)} aria-label="Удалить">
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <Empty>Нет запланированных выходных</Empty>
        </div>
      )}
    </section>
  );
}

function TimeOffSheet({ data, onClose, onSaved }: { data: Schedule; onClose: () => void; onSaved: OnSaved }) {
  const [form, setForm] = useState({ date: "", allDay: true, start: "13:00", end: "14:00", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const off: TimeOff = {
      date: form.date,
      start_time: form.allDay ? null : form.start,
      end_time: form.allDay ? null : form.end,
      reason: form.reason.trim() || null,
    };
    try {
      onSaved(await api<Schedule>("/master/schedule/time-off", { method: "PUT", body: JSON.stringify({ time_off: [...data.time_off, off] }) }));
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Выходной или перерыв" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Дата">
          <input type="date" className="input-sm" min={localToday()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <div>
          <label className="mb-2 flex items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
            Весь день
          </label>
          {!form.allDay && (
            <div className="flex items-center gap-2">
              <input type="time" className="input-sm flex-1" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="С" />
              <span className="text-muted">—</span>
              <input type="time" className="input-sm flex-1" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-label="До" />
            </div>
          )}
        </div>
        <Field label="Причина (необязательно)">
          <input className="input-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Отпуск, обучение…" />
        </Field>
        {error && <p className="text-sm text-error">{error}</p>}
        <button className="btn-primary w-full" disabled={saving || !form.date || (!form.allDay && form.start >= form.end)}>
          {saving ? "Сохраняем…" : "Добавить"}
        </button>
      </form>
    </Sheet>
  );
}

/* ---------- Удаление графика ---------- */

function DeleteSchedule({ onDeleted }: { onDeleted: OnSaved }) {
  const { confirm } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    const ok = await confirm({
      title: "Удалить график?",
      message: "Клиенты не смогут записаться, пока вы не настроите новый. Уже созданные записи, выходные и перерывы останутся.",
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      onDeleted(await api<Schedule>("/master/schedule", { method: "DELETE" }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 border-t border-hairline pt-4 text-center">
      <button type="button" className="btn-ghost w-full gap-1.5 text-error" onClick={remove} disabled={busy}>
        <Trash2 className="h-4 w-4" aria-hidden />
        {busy ? "Удаляем…" : "Удалить график"}
      </button>
      <p className="text-xs text-muted">После удаления можно будет заново выбрать тип графика</p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/* ---------- Общие элементы ---------- */

function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-5 bg-white px-5 pt-3">{children}</div>;
}
