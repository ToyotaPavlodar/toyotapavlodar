/**
 * Единый источник правды для подсчёта лидов на дашборде.
 *
 * Lead Ads  — строки в `leads` за месяц (UTC, как в разделе «Заявки»).
 * WhatsApp  — `meta_messaging_monthly` (снимок account-level Meta при синке).
 * Всего     — table_leads + messaging_leads (только кабинет бренда «Сервис»).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { monthBoundsUtc } from "@/lib/month-range";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Db = SupabaseClient<Database>;
type LeadRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "brand_id" | "called" | "qualified" | "sent_to_1c"
>;

export type BrandLeadSlice = {
  id: string;
  code: string;
  name: string;
  color: string;
  table_leads: number;
  messaging_leads: number;
  total_leads: number;
};

export type MonthLeadStats = {
  month: string;
  table_leads: number;
  messaging_leads: number;
  total_leads: number;
  unbranded_leads: number;
  messaging_by_brand: Map<string, number>;
  lead_rows: LeadRow[];
};

/** Загрузить Lead Ads из CRM за календарный месяц (UTC). */
export async function fetchLeadAdsForMonth(
  supabase: Db,
  month: string,
): Promise<{ rows: LeadRow[]; count: number }> {
  const { fromIso, toExclusiveIso } = monthBoundsUtc(month);
  const { data, error } = await supabase
    .from("leads")
    .select("brand_id, called, qualified, sent_to_1c")
    .gte("created_at", fromIso)
    .lt("created_at", toExclusiveIso);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { rows, count: rows.length };
}

/** WhatsApp Meta за месяц из БД (без live API). */
export async function fetchMessagingFromDb(
  supabase: Db,
  month: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("meta_messaging_monthly")
    .select("brand_id, conversations_started")
    .eq("month", month);
  if (error) {
    if (error.code === "42P01" || error.message.includes("meta_messaging_monthly")) {
      return new Map();
    }
    throw new Error(error.message);
  }
  const out = new Map<string, number>();
  for (const row of data ?? []) {
    out.set(row.brand_id, row.conversations_started);
  }
  return out;
}

export async function ensureMessagingSnapshot(month: string): Promise<Map<string, number>> {
  const fromDb = await fetchMessagingFromDb(supabaseAdmin, month);
  if (fromDb.size > 0) return fromDb;

  const { syncMetaMessagingMonth, pullMessagingFromMeta } = await import("@/lib/meta-sync.server");
  const sync = await syncMetaMessagingMonth(month);
  if (!sync.error) {
    const fresh = await fetchMessagingFromDb(supabaseAdmin, month);
    if (fresh.size > 0) return fresh;
  }
  return pullMessagingFromMeta(month);
}

/** Пакетная загрузка WhatsApp Meta за несколько месяцев. */
export async function fetchMessagingFromDbBatch(
  supabase: Db,
  months: string[],
): Promise<Map<string, Map<string, number>>> {
  if (months.length === 0) return new Map();
  const { data } = await supabase
    .from("meta_messaging_monthly")
    .select("month, brand_id, conversations_started")
    .in("month", months);
  const out = new Map<string, Map<string, number>>();
  for (const m of months) out.set(m, new Map());
  for (const row of data ?? []) {
    const bucket = out.get(row.month) ?? new Map<string, number>();
    bucket.set(row.brand_id, row.conversations_started);
    out.set(row.month, bucket);
  }
  return out;
}

function sumMapValues(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

/** Агрегат за месяц: Lead Ads + WhatsApp (из БД). При отсутствии снимка — подтягивает Meta один раз. */
export async function loadMonthLeadStats(
  supabase: Db,
  month: string,
  options?: { refreshMessagingIfMissing?: boolean },
): Promise<MonthLeadStats> {
  const { rows, count: tableLeads } = await fetchLeadAdsForMonth(supabase, month);
  let messagingByBrand = await fetchMessagingFromDb(supabase, month);

  if (
    options?.refreshMessagingIfMissing !== false &&
    messagingByBrand.size === 0
  ) {
    messagingByBrand = await ensureMessagingSnapshot(month);
  }

  const messagingLeads = sumMapValues(messagingByBrand);
  const unbranded = rows.filter((l) => !l.brand_id).length;

  return {
    month,
    table_leads: tableLeads,
    messaging_leads: messagingLeads,
    total_leads: tableLeads + messagingLeads,
    unbranded_leads: unbranded,
    messaging_by_brand: messagingByBrand,
    lead_rows: rows,
  };
}

/** Разбивка по брендам — сумма total_leads по брендам + unbranded = total (для Lead Ads). */
export function buildBrandLeadSlices(
  brands: Array<{ id: string; code: string; name: string; color: string }>,
  stats: MonthLeadStats,
): BrandLeadSlice[] {
  return brands.map((b) => {
    const table = stats.lead_rows.filter((l) => l.brand_id === b.id).length;
    const messaging = stats.messaging_by_brand.get(b.id) ?? 0;
    return {
      id: b.id,
      code: b.code,
      name: b.name,
      color: b.color,
      table_leads: table,
      messaging_leads: messaging,
      total_leads: table + messaging,
    };
  });
}

/** Проверка: карточки брендов + без бренда = Lead Ads в CRM. */
export function assertLeadAdsIntegrity(
  stats: MonthLeadStats,
  brandSlices: BrandLeadSlice[],
): void {
  const brandedSum = brandSlices.reduce((a, b) => a + b.table_leads, 0);
  const expected = brandedSum + stats.unbranded_leads;
  if (expected !== stats.table_leads) {
    console.warn(
      `[lead-stats] Lead Ads mismatch ${stats.month}: brands(${brandedSum}) + unbranded(${stats.unbranded_leads}) !== total(${stats.table_leads})`,
    );
  }
  const messagingSum = brandSlices.reduce((a, b) => a + b.messaging_leads, 0);
  if (messagingSum !== stats.messaging_leads) {
    console.warn(
      `[lead-stats] WhatsApp mismatch ${stats.month}: brands(${messagingSum}) !== total(${stats.messaging_leads})`,
    );
  }
}
