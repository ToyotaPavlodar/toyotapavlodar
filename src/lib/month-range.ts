/** Календарные периоды для CRM. Даты — YYYY-MM-DD без сдвига TZ. */

export type DatePeriod = { from: string; to: string };

/** Бизнес-таймзона дилера (Павлодар). */
export const BUSINESS_TZ = "Asia/Almaty";

/** Сегодняшняя календарная дата в Asia/Almaty → YYYY-MM-DD. */
export function todayBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function ymdParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Границы календарного месяца YYYY-MM в UTC (для запросов к БД). */
export function monthBoundsUtc(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const toInclusive = new Date(Date.UTC(y, m, 0));
  const toExclusive = new Date(Date.UTC(y, m, 1));
  const toDate = `${month}-${pad2(toInclusive.getUTCDate())}`;
  return {
    from,
    toExclusive,
    toInclusive,
    fromIso: from.toISOString(),
    toExclusiveIso: toExclusive.toISOString(),
    fromDate: `${month}-01`,
    toDate,
    dayCount: Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000),
  };
}

/** Границы произвольного периода (даты inclusive, как календарные дни UTC). */
export function dateBoundsUtc(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const toInclusive = new Date(`${toDate}T00:00:00.000Z`);
  const toExclusive = new Date(
    Date.UTC(toInclusive.getUTCFullYear(), toInclusive.getUTCMonth(), toInclusive.getUTCDate() + 1),
  );
  return {
    from,
    toInclusive,
    toExclusive,
    fromIso: from.toISOString(),
    toExclusiveIso: toExclusive.toISOString(),
    fromDate,
    toDate,
    dayCount: Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000),
  };
}

/** @deprecated use todayBusinessDate */
export function todayUtcDate(): string {
  return todayBusinessDate();
}

export function thisMonthPeriod(now = new Date()): DatePeriod {
  const today = todayBusinessDate(now);
  const { y, m } = ymdParts(today);
  const month = `${y}-${pad2(m)}`;
  const b = monthBoundsUtc(month);
  return { from: b.fromDate, to: b.toDate };
}

export function lastMonthPeriod(now = new Date()): DatePeriod {
  const today = todayBusinessDate(now);
  const { y, m } = ymdParts(today);
  const key = shiftMonthKey(`${y}-${pad2(m)}`, -1);
  const b = monthBoundsUtc(key);
  return { from: b.fromDate, to: b.toDate };
}

export function todayPeriod(now = new Date()): DatePeriod {
  const d = todayBusinessDate(now);
  return { from: d, to: d };
}

export function yesterdayPeriod(now = new Date()): DatePeriod {
  const today = todayBusinessDate(now);
  const { y, m, d } = ymdParts(today);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const iso = `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`;
  return { from: iso, to: iso };
}

/** Список ключей YYYY-MM, пересекающих период. */
export function monthsInRange(fromDate: string, toDate: string): string[] {
  const start = fromDate.slice(0, 7);
  const end = toDate.slice(0, 7);
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = shiftMonthKey(cur, 1);
  }
  return out;
}

export function isFullMonthPeriod(fromDate: string, toDate: string): boolean {
  const month = fromDate.slice(0, 7);
  const b = monthBoundsUtc(month);
  return fromDate === b.fromDate && toDate === b.toDate;
}

/** Предыдущий период той же длины, сразу перед текущим. */
export function previousPeriod(fromDate: string, toDate: string): DatePeriod {
  const bounds = dateBoundsUtc(fromDate, toDate);
  const prevTo = new Date(bounds.from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (bounds.dayCount - 1) * 86_400_000);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

/** Сдвинуть период на его длину вперёд/назад. */
export function shiftPeriodByLength(fromDate: string, toDate: string, direction: -1 | 1): DatePeriod {
  const bounds = dateBoundsUtc(fromDate, toDate);
  const shiftMs = bounds.dayCount * 86_400_000 * direction;
  const newFrom = new Date(bounds.from.getTime() + shiftMs);
  const newTo = new Date(bounds.toInclusive.getTime() + shiftMs);
  return {
    from: newFrom.toISOString().slice(0, 10),
    to: newTo.toISOString().slice(0, 10),
  };
}

export function periodLabelRu(fromDate: string, toDate: string): string {
  if (fromDate === toDate) {
    return new Date(`${fromDate}T12:00:00.000Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (isFullMonthPeriod(fromDate, toDate)) {
    return monthLabelRu(fromDate.slice(0, 7));
  }
  const fromD = new Date(`${fromDate}T12:00:00.000Z`);
  const toD = new Date(`${toDate}T12:00:00.000Z`);
  const sameYear = fromD.getUTCFullYear() === toD.getUTCFullYear();
  const sameMonth = sameYear && fromD.getUTCMonth() === toD.getUTCMonth();
  if (sameMonth) {
    const monthPart = fromD.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${fromD.getUTCDate()}–${toD.getUTCDate()} ${monthPart}`;
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: sameYear ? undefined : "numeric",
      timeZone: "UTC",
    });
  return `${fmt(fromD)} – ${fmt(toD)}`;
}

export function monthKeyFromDate(d: Date): string {
  // Для «текущего месяца» используем бизнес-дату, не UTC-компоненты Date.
  const today = todayBusinessDate(d);
  return today.slice(0, 7);
}

/** Ключ месяца из YYYY-MM-DD или Date в UTC-компонентах (для трендов/сдвигов). */
export function monthKeyFromUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

export function monthLabelRu(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthShortRu(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15))
    .toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Локальная полуночь для DayPicker (без UTC-сдвига дня). */
export function parseCalendarDate(iso: string): Date {
  const { y, m, d } = ymdParts(iso);
  return new Date(y, m - 1, d);
}

/** YYYY-MM-DD из Date DayPicker (локальные компоненты). */
export function formatCalendarDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
