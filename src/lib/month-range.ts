import { endOfMonth, startOfMonth } from "date-fns";

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
  };
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
