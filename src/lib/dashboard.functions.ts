import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { monthBoundsUtc, shiftMonthKey, monthKeyFromDate } from "@/lib/month-range";
import {
  loadMonthLeadStats,
  buildBrandLeadSlices,
  assertLeadAdsIntegrity,
} from "@/lib/lead-stats.server";

async function assertDashboard(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const [{ data: roles }, { data: profile }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("profiles").select("dashboard_access").eq("id", context.userId).maybeSingle(),
  ]);
  const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
  if (!isAdmin && !profile?.dashboard_access) throw new Error("Нет доступа к аналитике");
  return { isAdmin };
}

async function monthAvgUsdKzt(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database> }, from: Date, toExclusive: Date): Promise<number> {
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = toExclusive.toISOString().slice(0, 10);
  const { data } = await context.supabase.from("fx_rates")
    .select("usd_kzt").gte("date", fromDate).lt("date", toDate);
  if (!data || data.length === 0) {
    const { data: latest } = await context.supabase.from("fx_rates")
      .select("usd_kzt").order("date", { ascending: false }).limit(1);
    return Number(latest?.[0]?.usd_kzt ?? 475);
  }
  const sum = data.reduce((a, r) => a + Number(r.usd_kzt), 0);
  return sum / data.length;
}

function sumMapValues(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDashboard(context);
    const bounds = monthBoundsUtc(data.month);
    const { from, toExclusive, fromDate } = bounds;

    const [leadStats, { data: spend }, { data: brands }, avgRate, { data: latestFx }] = await Promise.all([
      loadMonthLeadStats(context.supabase, data.month),
      context.supabase.from("ad_spend_daily")
        .select("brand_id, spend_usd")
        .not("brand_id", "is", null)
        .gte("date", fromDate).lt("date", toExclusive.toISOString().slice(0, 10)),
      context.supabase.from("brands").select("id, code, name, color, sort_order").order("sort_order"),
      monthAvgUsdKzt(context, from, toExclusive),
      context.supabase.from("fx_rates").select("date, usd_kzt").order("date", { ascending: false }).limit(1),
    ]);

    const { lead_rows: leadRows, table_leads: tableLeads, messaging_leads: brandMessagingSum, total_leads: totalLeads, unbranded_leads: unbrandedLeads } = leadStats;
    const calledYes = leadRows.filter((l) => l.called === true).length;
    const qualified = leadRows.filter((l) => l.qualified === true).length;
    const sent1c = leadRows.filter((l) => l.sent_to_1c).length;

    const totalSpendUsd = (spend ?? []).reduce((a, r) => a + Number(r.spend_usd), 0);
    const totalSpendKzt = totalSpendUsd * avgRate;

    const brandSlices = buildBrandLeadSlices(brands ?? [], leadStats);
    assertLeadAdsIntegrity(leadStats, brandSlices);

    const byBrand = brandSlices.map((slice) => {
      const bSpendUsd = (spend ?? []).filter((s) => s.brand_id === slice.id).reduce((a, r) => a + Number(r.spend_usd), 0);
      const bSpendKzt = bSpendUsd * avgRate;
      const bCalled = leadRows.filter((l) => l.brand_id === slice.id && l.called === true).length;
      const bQualified = leadRows.filter((l) => l.brand_id === slice.id && l.qualified === true).length;
      const bLeadsForCpl = slice.total_leads;
      return {
        id: slice.id, code: slice.code, name: slice.name, color: slice.color,
        leads: slice.table_leads,
        table_leads: slice.table_leads,
        messaging_leads: slice.messaging_leads,
        leads_with_messaging: bLeadsForCpl,
        spend_usd: bSpendUsd,
        spend_kzt: bSpendKzt,
        cpl_kzt: bLeadsForCpl > 0 ? bSpendKzt / bLeadsForCpl : slice.table_leads > 0 ? bSpendKzt / slice.table_leads : 0,
        cpql_kzt: bQualified > 0 ? bSpendKzt / bQualified : 0,
        called: bCalled,
        qualified: bQualified,
        called_pct: slice.table_leads > 0 ? (bCalled / slice.table_leads) * 100 : 0,
      };
    });

    const prevMonth = shiftMonthKey(data.month, -1);
    const prevBounds = monthBoundsUtc(prevMonth);
    const [{ count: prevTableLeads }, { data: prevSpend }, prevRate, prevMessagingMap] = await Promise.all([
      context.supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", prevBounds.fromIso)
        .lt("created_at", prevBounds.toExclusiveIso),
      context.supabase
        .from("ad_spend_daily")
        .select("spend_usd")
        .not("brand_id", "is", null)
        .gte("date", prevBounds.fromDate)
        .lt("date", prevBounds.toExclusive.toISOString().slice(0, 10)),
      monthAvgUsdKzt(context, prevBounds.from, prevBounds.toExclusive),
      fetchMessagingFromDbBatch(context.supabase, [prevMonth]).then((m) => m.get(prevMonth) ?? new Map()),
    ]);
    const prevMessaging = sumMapValues(prevMessagingMap);
    const prevLeadsTotal = (prevTableLeads ?? 0) + prevMessaging;
    const prevSpendKzt = (prevSpend ?? []).reduce((a, r) => a + Number(r.spend_usd), 0) * prevRate;
    const prevCpl = prevLeadsTotal > 0 ? prevSpendKzt / prevLeadsTotal : 0;

    const pctDelta = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    const funnel = {
      leads: tableLeads,
      table_leads: tableLeads,
      called: calledYes,
      qualified,
      sent_to_1c: sent1c,
      called_pct: tableLeads > 0 ? (calledYes / tableLeads) * 100 : 0,
      qualified_pct: tableLeads > 0 ? (qualified / tableLeads) * 100 : 0,
      sent_pct: tableLeads > 0 ? (sent1c / tableLeads) * 100 : 0,
    };

    const TREND_START = startOfMonth(new Date(Date.UTC(2026, 6, 1)));
    const trendMonthKeys = Array.from({ length: 6 }, (_, i) =>
      monthKeyFromDate(addMonths(TREND_START, i)),
    );
    const trendMessagingBatch = await fetchMessagingFromDbBatch(context.supabase, trendMonthKeys);

    const trend = await Promise.all(
      trendMonthKeys.map(async (monthKey) => {
        const mBounds = monthBoundsUtc(monthKey);
        const [{ count: lc }, { data: sp }, rate] = await Promise.all([
          context.supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("created_at", mBounds.fromIso)
            .lt("created_at", mBounds.toExclusiveIso),
          context.supabase
            .from("ad_spend_daily")
            .select("spend_usd")
            .not("brand_id", "is", null)
            .gte("date", mBounds.fromDate)
            .lt("date", mBounds.toExclusive.toISOString().slice(0, 10)),
          monthAvgUsdKzt(context, mBounds.from, mBounds.toExclusive),
        ]);
        const messagingMap = trendMessagingBatch.get(monthKey) ?? new Map();
        const metaConv = sumMapValues(messagingMap);
        const spUsd = (sp ?? []).reduce((a, r) => a + Number(r.spend_usd), 0);
        return {
          month: monthKey,
          leads: (lc ?? 0) + metaConv,
          table_leads: lc ?? 0,
          messaging_leads: metaConv,
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
        table_leads: tableLeads,
        messaging_leads: brandMessagingSum,
        unbranded_leads: unbrandedLeads,
        called: calledYes,
        qualified,
        sent_to_1c: sent1c,
        cpl_kzt: totalLeads > 0 ? totalSpendKzt / totalLeads : 0,
        cpql_kzt: qualified > 0 ? totalSpendKzt / qualified : 0,
        cps1c_kzt: sent1c > 0 ? totalSpendKzt / sent1c : 0,
        quality_pct: calledYes > 0 ? (qualified / calledYes) * 100 : 0,
        called_pct: tableLeads > 0 ? (calledYes / tableLeads) * 100 : 0,
        conversion_pct: totalLeads > 0 ? (sent1c / totalLeads) * 100 : 0,
      },
      by_brand: byBrand,
      trend,
      funnel,
      mom: {
        month: prevMonth,
        leads: prevLeadsTotal,
        spend_kzt: prevSpendKzt,
        cpl_kzt: prevCpl,
        leads_delta_pct: pctDelta(totalLeads, prevLeadsTotal),
        spend_delta_pct: pctDelta(totalSpendKzt, prevSpendKzt),
        cpl_delta_pct: pctDelta(totalLeads > 0 ? totalSpendKzt / totalLeads : 0, prevCpl),
      },
    };
  });
