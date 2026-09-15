export const formatPrice = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

// Даты API — локальное время мастера без зоны ("2026-09-15T10:00:00"); считаем их в UTC, чтобы не зависеть от зоны браузера/сервера
export const parseDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const hhmm = (iso: string) => iso.slice(11, 16);

export function addDays(iso: string, days: number) {
  const d = parseDay(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number) {
  const d = parseDay(`${iso.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function formatDay(
  iso: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...options }).format(parseDay(iso));
}

export const todayIn = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

const pad = (n: number) => String(n).padStart(2, "0");

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localNowIso() {
  const d = new Date();
  return `${localToday()}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Маска российского номера: «89777628690» → «+7 (977) 762-86-90» */
export function maskPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  const d = digits.slice(1, 11);
  let out = "+7";
  if (d.length) out += ` (${d.slice(0, 3)}`;
  if (d.length > 3) out += `) ${d.slice(3, 6)}`; // скобку ставим только после 4-й цифры, иначе её нельзя стереть
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** «Анна Соколова» → «anna-sokolova» (для ссылки мастера) */
export function slugify(text: string) {
  const slug = [...text.toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return slug.length >= 3 ? slug : "";
}
