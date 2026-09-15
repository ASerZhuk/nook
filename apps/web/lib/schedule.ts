import { parseDay } from "./format";
import type { Schedule } from "./types";

export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Рабочее время на дату с учётом типа графика: интервалы [начало, конец] и окошки (минуты от полуночи) */
export function dayPlan(schedule: Schedule, date: string) {
  if (schedule.schedule_type === "dates") {
    return {
      hours: schedule.date_hours.filter((h) => h.date === date).map((h) => [toMinutes(h.start_time), toMinutes(h.end_time)] as const),
      slots: schedule.date_slots.filter((s) => s.date === date).map((s) => toMinutes(s.start_time)),
    };
  }
  const weekday = (parseDay(date).getUTCDay() + 6) % 7;
  return {
    hours: schedule.working_hours.filter((h) => h.weekday === weekday).map((h) => [toMinutes(h.start_time), toMinutes(h.end_time)] as const),
    slots: schedule.working_slots.filter((s) => s.weekday === weekday).map((s) => toMinutes(s.start_time)),
  };
}
