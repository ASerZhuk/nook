"use client";

import { useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
// сетка окошек: 07:00–22:00 с шагом 30 минут
const TIME_GRID = Array.from({ length: 31 }, (_, i) => {
  const m = 7 * 60 + i * 30;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
});

export const MODE_OPTIONS = [
  ["range", "С — до"],
  ["slots", "Окошки"],
] as const;
export const DAY_MODE_OPTIONS = [
  ["range", "С — до"],
  ["slots", "Окошки"],
  ["off", "Выходной"],
] as const;

export type Mode = "range" | "slots";
export type DayMode = Mode | "off";
export type DayConfig = { mode: DayMode; start: string; end: string; slots: string[] };
export const DEFAULT_DAY: DayConfig = { mode: "range", start: "10:00", end: "19:00", slots: [] };

export const isValidConfig = (c: DayConfig) => (c.mode !== "range" || c.start < c.end) && (c.mode !== "slots" || c.slots.length > 0);

export function describeConfig(c: DayConfig) {
  if (c.mode === "off") return "Выходной";
  if (c.mode === "range") return c.start < c.end ? `${c.start}–${c.end}` : "Проверьте время";
  return c.slots.length ? `Окошки: ${c.slots.join(", ")}` : "Выберите окошки";
}

/** Настройка одного дня: интервал, окошки или выходной */
export function DayConfigFields({ value, onChange }: { value: DayConfig; onChange: (config: DayConfig) => void }) {
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

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  full,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  full?: boolean;
}) {
  return (
    <div className={`${full ? "flex w-full" : "inline-flex shrink-0"} rounded-full bg-surface-strong p-0.5 text-xs font-semibold`} role="radiogroup">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`${full ? "flex-1 py-2" : "py-1.5"} rounded-full px-3 transition-colors ${value === option ? "bg-primary text-white shadow-float" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SlotGrid({ selected, onChange }: { selected: string[]; onChange: (slots: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const options = [...new Set([...TIME_GRID, ...selected])].sort();
  const toggle = (time: string) => onChange(selected.includes(time) ? selected.filter((t) => t !== time) : [...selected, time].sort());

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {options.map((time) => (
          <button type="button" key={time} onClick={() => toggle(time)} aria-pressed={selected.includes(time)} className={`chip px-0 ${selected.includes(time) ? "chip-active" : ""}`}>
            {time}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input type="time" className="input-sm flex-1" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Другое время" />
        <button
          type="button"
          className="btn-secondary h-11 px-4"
          disabled={!custom}
          onClick={() => {
            if (!selected.includes(custom)) toggle(custom);
            setCustom("");
          }}
        >
          Добавить
        </button>
      </div>
    </>
  );
}
