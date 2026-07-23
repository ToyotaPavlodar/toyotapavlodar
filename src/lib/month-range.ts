import { endOfMonth, startOfMonth, subDays } from "date-fns";

export type DatePeriod = { from: string; to: string };

/** Границы календарного месяца в UTC (совпадает с ключом YYYY-MM). */
export function monthBoundsUtc(month: string) {
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  const from = startOfMonth(monthDate);
  const lastDay = endOfMonth(monthDate);
  const toExclusive = new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate() + 1));
  return {
    from,
    toExclusive,
    /** Последний день месяца — для Meta Insights (until inclusive). */
    toInclusive: lastDay,
    fromIso: from.toISOString(),
    toExclusiveIso: toExclusive.toISOString(),
    fromDate: from.toISOString().slice(0, 10),
    toDate: lastDay.toISOString().slice(0, 10),
    dayCount: Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000),
  };
}

/** Границы произвольного периода (даты inclusive, UTC). */
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

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonthPeriod(): DatePeriod {
  const b = monthBoundsUtc(monthKeyFromDate(new Date()));
  return { from: b.fromDate, to: b.toDate };
}

export function lastMonthPeriod(): DatePeriod {
  const key = shiftMonthKey(monthKeyFromDate(new Date()), -1);
  const b = monthBoundsUtc(key);
  return { from: b.fromDate, to: b.toDate };
}

export function todayPeriod(): DatePeriod {
  const d = todayUtcDate();
  return { from: d, to: d };
}

export function yesterdayPeriod(): DatePeriod {
  const d = subDays(new Date(), 1).toISOString().slice(0, 10);
  return { from: d, to: d };
}

/** Список ключей YYYY-MM, пересекающих период. */
export function monthsInRange(fromDate: string, toDate: string): string[] {
  const start = monthKeyFromDate(new Date(`${fromDate}T00:00:00.000Z`));
  const end = monthKeyFromDate(new Date(`${toDate}T00:00:00.000Z`));
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = shiftMonthKey(cur, 1);
  }
  return out;
}

export function isFullMonthPeriod(fromDate: string, toDate: string): boolean {
  const b = monthBoundsUtc(monthKeyFromDate(new Date(`${fromDate}T00:00:00.000Z`)));
  return fromDate === b.fromDate && toDate === b.toDate;
}

/** Предыдущий период той же длины, сразу перед текущим. */
export function previousPeriod(fromDate: string, toDate: string): DatePeriod {
  const bounds = dateBoundsUtc(fromDate, toDate);
  const prevTo = subDays(bounds.from, 1);
  const prevFrom = subDays(prevTo, bounds.dayCount - 1);
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
    return new Date(`${fromDate}T00:00:00.000Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (isFullMonthPeriod(fromDate, toDate)) {
    return monthLabelRu(monthKeyFromDate(new Date(`${fromDate}T00:00:00.000Z`)));
  }
  const fromD = new Date(`${fromDate}T00:00:00.000Z`);
  const toD = new Date(`${toDate}T00:00:00.000Z`);
  const sameYear = fromD.getUTCFullYear() === toD.getUTCFullYear();
  const sameMonth = sameYear && fromD.getUTCMonth() === toD.getUTCMonth();
  if (sameMonth) {
    const monthPart = fromD.toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
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
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthKeyFromDate(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

export function monthLabelRu(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthShortRu(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
