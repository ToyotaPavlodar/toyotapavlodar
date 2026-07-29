import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { monthBoundsUtc, clampToToday, monthKeyFromDate } from "@/lib/month-range";

async function assertAdmin(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!data?.some((r) => r.role === "admin")) throw new Error("Только для администратора");
}

// Pulls Meta ad spend + Lead Ads leads for a given YYYY-MM into the database.
export const syncMetaMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { syncMetaSpendRange, syncMetaLeadsRange, syncMetaMessagingMonth } = await import("@/lib/meta-sync.server");

    const bounds = monthBoundsUtc(data.month);
    const from = bounds.from;
    // Для текущего месяца until = сегодня (Meta ещё нет будущих дней).
    const toDate = data.month === monthKeyFromDate(new Date())
      ? clampToToday(bounds.toDate)
      : bounds.toDate;
    const to = new Date(`${toDate}T00:00:00.000Z`);
    const leadsTo = new Date(Date.UTC(
      to.getUTCFullYear(),
      to.getUTCMonth(),
      to.getUTCDate() + 1,
    ));

    // Leads first — they populate campaign_brand_map so spend rows can be mapped to a brand.
    const leads = await syncMetaLeadsRange(from, leadsTo);
    const spend = await syncMetaSpendRange(from, to);
    const messaging = await syncMetaMessagingMonth(data.month);

    return {
      month: data.month,
      spend_rows: spend.rows,
      spend_error: spend.error ?? null,
      leads_rows: leads.rows,
      leads_errors: leads.errors,
      messaging_rows: messaging.rows,
      messaging_error: messaging.error ?? null,
      synced_until: toDate,
    };
  });

// Быстрый подтяг лидов Meta за последние N часов (по умолчанию 48). Auth-only:
// используется на странице /leads вместо публичного /api/public/hooks/*.
export const syncRecentMetaLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ hours: z.number().int().min(1).max(168).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { syncMetaLeadsRange } = await import("@/lib/meta-sync.server");
    const to = new Date();
    const from = new Date(to.getTime() - (data.hours ?? 48) * 60 * 60 * 1000);
    const res = await syncMetaLeadsRange(from, to);
    return { ok: res.errors.length === 0, ...res };
  });
