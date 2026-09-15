"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, formatDay, localToday, parseDay } from "@/lib/format";

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Props = {
  value: string;
  onChange: (iso: string) => void;
  month: string;
  onMonthChange: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
  markers?: Record<string, number>;
  multiple?: string[]; // выбор нескольких дней (график по дням)
};

export function MonthCalendar({ value, onChange, month, onMonthChange, minDate, maxDate, markers, multiple }: Props) {
  const today = localToday();
  const first = `${month.slice(0, 7)}-01`;
  const offset = (parseDay(first).getUTCDay() + 6) % 7;
  const total = parseDay(addDays(addMonths(first, 1), -1)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => addDays(first, i)),
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="icon-btn h-9 w-9" onClick={() => onMonthChange(addMonths(first, -1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
        <span className="font-semibold first-letter:uppercase">{formatDay(first, { month: "long", year: "numeric" })}</span>
        <button type="button" className="icon-btn h-9 w-9" onClick={() => onMonthChange(addMonths(first, 1))} aria-label="Следующий месяц"><ChevronRight className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEK.map((w) => (
          <span key={w} className="pb-2 text-xs text-muted">{w}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`empty-${i}`} />;
          const disabled = Boolean((minDate && d < minDate) || (maxDate && d > maxDate));
          const selected = d === value || Boolean(multiple?.includes(d));
          const count = markers?.[d] ?? 0;
          return (
            <button
              type="button"
              key={d}
              disabled={disabled}
              onClick={() => onChange(d)}
              className="flex flex-col items-center py-0.5 disabled:cursor-not-allowed"
              aria-pressed={selected}
              title={count ? `Записей: ${count}` : undefined}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm transition-shadow ${
                  selected
                    ? "bg-primary font-semibold text-white"
                    : disabled
                      ? "text-muted-soft"
                      : `hover:shadow-[inset_0_0_0_1px_var(--color-primary)] ${d === today ? "font-bold text-primary" : "text-ink"}`
                }`}
              >
                {parseDay(d).getUTCDate()}
              </span>
              <span className={`mt-0.5 h-1 w-1 rounded-full ${count ? "bg-primary" : ""}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
