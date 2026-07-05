import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfMonth, endOfMonth, addMonths, formatISO } from "date-fns";

async function assertDashboard(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const [{ data: roles }, { data: profile }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("profiles").select("dashboard_access").eq("id", context.userId).maybeSingle(),
  ]);
  const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
  if (!isAdmin && !profile?.dashboard_access) throw new Error("Нет доступа к аналитике");
  return { isAdmin };
}

async function monthAvgUsdKzt(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database> }, from: Date, to: Date): Promise<number> {
  const { data } = await context.supabase.from("fx_rates")
    .select("usd_kzt").gte("date", formatISO(from, { representation: "date" }))
    .lt("date", formatISO(to, { representation: "date" }));
  if (!data || data.length === 0) {
    const { data: latest } = await context.supabase.from("fx_rates")
      .select("usd_kzt").order("date", { ascending: false }).limit(1);
    return Number(latest?.[0]?.usd_kzt ?? 475);
  }
  const sum = data.reduce((a, r) => a + Number(r.usd_kzt), 0);
  return sum / data.length;
}

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDashboard(context);
    const monthDate = new Date(data.month + "-01T00:00:00Z");
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);
    const nextTo = new Date(to.getTime() + 1);

    const fromIso = from.toISOString();
    const toIso = nextTo.toISOString();
    const fromDate = formatISO(from, { representation: "date" });
    const toDate = formatISO(nextTo, { representation: "date" });

    const [{ data: leads }, { data: spend }, { data: brands }, avgRate, { data: latestFx }] = await Promise.all([
      context.supabase.from("leads")
        .select("brand_id, called, qualified, sent_to_1c")
        .gte("created_at", fromIso).lt("created_at", toIso),
      // Only campaigns mapped to one of our brands count toward totals —
      // the Meta token can see many unrelated ad accounts we don't want to sum.
      context.supabase.from("ad_spend_daily")
        .select("brand_id, spend_usd")
        .not("brand_id", "is", null)
        .gte("date", fromDate).lt("date", toDate),
      context.supabase.from("brands").select("id, code, name, color, sort_order").order("sort_order"),
      monthAvgUsdKzt(context, from, nextTo),
      context.supabase.from("fx_rates").select("date, usd_kzt").order("date", { ascending: false }).limit(1),
    ]);

    const totalSpendUsd = (spend ?? []).reduce((a, r) => a + Number(r.spend_usd), 0);
    const totalSpendKzt = totalSpendUsd * avgRate;
    const totalLeads = leads?.length ?? 0;
    const calledYes = leads?.filter((l) => l.called === true).length ?? 0;
    const qualified = leads?.filter((l) => l.qualified === true).length ?? 0;
    const sent1c = leads?.filter((l) => l.sent_to_1c).length ?? 0;

    const byBrand = (brands ?? []).map((b) => {
      const bLeads = (leads ?? []).filter((l) => l.brand_id === b.id).length;
      const bSpendUsd = (spend ?? []).filter((s) => s.brand_id === b.id).reduce((a, r) => a + Number(r.spend_usd), 0);
      const bSpendKzt = bSpendUsd * avgRate;
      return {
        id: b.id, code: b.code, name: b.name, color: b.color,
        leads: bLeads,
        spend_usd: bSpendUsd,
        spend_kzt: bSpendKzt,
        cpl_kzt: bLeads > 0 ? bSpendKzt / bLeads : 0,
      };
    });

    // Trend: 6 месяцев начиная с запуска системы (Июль 2026).
    // Считаем все месяцы параллельно — заметно быстрее последовательного цикла.
    const TREND_START = startOfMonth(new Date(2026, 6, 1)); // Июль 2026
    const trend = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const m = addMonths(TREND_START, i);
        const mFrom = startOfMonth(m);
        const mTo = new Date(endOfMonth(m).getTime() + 1);
        const [{ count: lc }, { data: sp }, rate] = await Promise.all([
          context.supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("created_at", mFrom.toISOString())
            .lt("created_at", mTo.toISOString()),
          context.supabase
            .from("ad_spend_daily")
            .select("spend_usd")
            .not("brand_id", "is", null)
            .gte("date", formatISO(mFrom, { representation: "date" }))
            .lt("date", formatISO(mTo, { representation: "date" })),
          monthAvgUsdKzt(context, mFrom, mTo),
        ]);
        const spUsd = (sp ?? []).reduce((a, r) => a + Number(r.spend_usd), 0);
        return {
          month: mFrom.toISOString().slice(0, 7),
          leads: lc ?? 0,
          spend_kzt: spUsd * rate,
        };
      }),
    );

    return {
      month: data.month,
      avg_rate: avgRate,
      latest_rate: latestFx?.[0] ? { date: latestFx[0].date, usd_kzt: Number(latestFx[0].usd_kzt) } : null,
      totals: {
        spend_usd: totalSpendUsd,
        spend_kzt: totalSpendKzt,
        leads: totalLeads,
        called: calledYes,
        qualified,
        sent_to_1c: sent1c,
        cpl_kzt: totalLeads > 0 ? totalSpendKzt / totalLeads : 0,
        quality_pct: calledYes > 0 ? (qualified / calledYes) * 100 : 0,
        conversion_pct: totalLeads > 0 ? (sent1c / totalLeads) * 100 : 0,
      },
      by_brand: byBrand,
      trend,
    };
  });
