import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { monthBoundsUtc, shiftMonthKey, monthKeyFromDate, dateBoundsUtc, previousPeriod, periodLabelRu, isFullMonthPeriod } from "@/lib/month-range";
import { getUserScope } from "@/lib/auth-scope.server";
import {
  loadPeriodLeadStats,
  buildBrandLeadSlices,
  assertLeadAdsIntegrity,
  assertQualityIntegrity,
  computeCrmFunnel,
  computeBrandCrmFunnel,
  computeCostMetrics,
  fetchMessagingTotalsByMonth,
  buildAssigneePerformance,
  fetchMessagingFromDbBatch,
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

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .refine(({ from, to }) => from <= to, { message: "from must be <= to" })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertDashboard(context);
    const scope = await getUserScope(context.supabase, context.userId);
    const brandScope = scope.brandId;
    const bounds = dateBoundsUtc(data.from, data.to);
    const { from, toExclusive, fromDate, toDate } = bounds;

    const [leadStats, { data: spend }, { data: brands }, assigneeRes, avgRate, { data: latestFx }] = await Promise.all([
      loadPeriodLeadStats(context.supabase, data.from, data.to, { brandId: brandScope }),
      context.supabase.from("ad_spend_daily")
        .select("brand_id, spend_usd")
        .not("brand_id", "is", null)
        .gte("date", fromDate).lt("date", toExclusive.toISOString().slice(0, 10)),
      context.supabase.from("brands").select("id, code, name, color, sort_order").order("sort_order"),
      context.supabase.from("lead_assignees")
        .select("id, name, brand_id, brands(name, color)")
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      monthAvgUsdKzt(context, from, toExclusive),
      context.supabase.from("fx_rates").select("date, usd_kzt").order("date", { ascending: false }).limit(1),
    ]);
    const assigneeRows = assigneeRes.error ? [] : assigneeRes.data ?? [];
    if (assigneeRes.error) {
      console.warn("[dashboard] lead_assignees:", assigneeRes.error.message);
    }

    const spendRows = brandScope
      ? (spend ?? []).filter((r) => r.brand_id === brandScope)
      : (spend ?? []);
    const brandsList = brandScope
      ? (brands ?? []).filter((b) => b.id === brandScope)
      : (brands ?? []);

    const { lead_rows: leadRows, table_leads: tableLeads, messaging_leads: brandMessagingSum, total_leads: totalLeads, unbranded_leads: unbrandedLeads } = leadStats;
    const funnelMetrics = computeCrmFunnel(leadRows, tableLeads, totalLeads);
    assertQualityIntegrity(`${data.from}_${data.to}`, tableLeads, funnelMetrics);

    const totalSpendUsd = spendRows.reduce((a, r) => a + Number(r.spend_usd), 0);
    const totalSpendKzt = totalSpendUsd * avgRate;
    const costs = computeCostMetrics(totalSpendKzt, totalLeads, funnelMetrics.qualified, funnelMetrics.sent_to_1c);

    const brandSlices = buildBrandLeadSlices(brandsList, leadStats);
    assertLeadAdsIntegrity(leadStats, brandSlices);

    const scopedAssignees = brandScope
      ? assigneeRows.filter((a) => a.brand_id === brandScope)
      : assigneeRows;
    const assigneeRefs = scopedAssignees.map((a) => ({
      id: a.id,
      name: a.name,
      brand_id: a.brand_id,
      brand_name: a.brands?.name ?? "—",
      brand_color: a.brands?.color ?? "#888",
    }));
    const byAssignee = buildAssigneePerformance(leadRows, assigneeRefs);

    const byBrand = brandSlices
      .filter((slice) => !brandScope || slice.id === brandScope)
      .map((slice) => {
      const bSpendUsd = spendRows.filter((s) => s.brand_id === slice.id).reduce((a, r) => a + Number(r.spend_usd), 0);
      const bSpendKzt = bSpendUsd * avgRate;
      const bFunnel = computeBrandCrmFunnel(leadRows, slice.id, slice.table_leads);
      const bCosts = computeCostMetrics(bSpendKzt, slice.total_leads, bFunnel.qualified, bFunnel.sent_to_1c);
      return {
        id: slice.id, code: slice.code, name: slice.name, color: slice.color,
        leads: slice.table_leads,
        table_leads: slice.table_leads,
        messaging_leads: slice.messaging_leads,
        leads_with_messaging: slice.total_leads,
        total_leads: slice.total_leads,
        spend_usd: bSpendUsd,
        spend_kzt: bSpendKzt,
        cpl_kzt: bCosts.cpl_kzt,
        cpql_kzt: bCosts.cpql_kzt,
        cps1c_kzt: bCosts.cps1c_kzt,
        called: bFunnel.called,
        not_called: bFunnel.not_called,
        qualified: bFunnel.qualified,
        sent_to_1c: bFunnel.sent_to_1c,
        lead_to_call_pct: bFunnel.lead_to_call_pct,
        lead_to_qual_pct: bFunnel.lead_to_qual_pct,
        lead_to_1c_pct: bFunnel.lead_to_1c_pct,
        call_to_qual_pct: bFunnel.call_to_qual_pct,
        qual_to_1c_pct: bFunnel.qual_to_1c_pct,
        call_to_1c_pct: bFunnel.call_to_1c_pct,
      };
    });

    const prevPeriod = previousPeriod(data.from, data.to);
    const prevBounds = dateBoundsUtc(prevPeriod.from, prevPeriod.to);
    const [prevStats, { data: prevSpendRaw }, prevRate] = await Promise.all([
      loadPeriodLeadStats(context.supabase, prevPeriod.from, prevPeriod.to, {
        refreshMessagingIfMissing: false,
        brandId: brandScope,
      }),
      context.supabase
        .from("ad_spend_daily")
        .select("brand_id, spend_usd")
        .not("brand_id", "is", null)
        .gte("date", prevBounds.fromDate)
        .lt("date", prevBounds.toExclusive.toISOString().slice(0, 10)),
      monthAvgUsdKzt(context, prevBounds.from, prevBounds.toExclusive),
    ]);
    const prevSpendFiltered = brandScope
      ? (prevSpendRaw ?? []).filter((r) => r.brand_id === brandScope)
      : (prevSpendRaw ?? []);
    const prevMessaging = prevStats.messaging_leads;
    const prevLeadsTotal = prevStats.table_leads + prevMessaging;
    const prevSpendKzt = prevSpendFiltered.reduce((a, r) => a + Number(r.spend_usd), 0) * prevRate;
    const prevCpl = prevLeadsTotal > 0 ? prevSpendKzt / prevLeadsTotal : 0;

    const pctDelta = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    const funnel = {
      table_leads: tableLeads,
      ...funnelMetrics,
    };

    const TREND_START = startOfMonth(new Date(Date.UTC(2026, 6, 1)));
    const trendMonthKeys = Array.from({ length: 6 }, (_, i) =>
      monthKeyFromDate(addMonths(TREND_START, i)),
    );
    const trendMessagingTotals = await fetchMessagingTotalsByMonth(
      context.supabase,
      trendMonthKeys,
      { refreshIfMissing: false },
    );
    const trendMessagingByBrand = brandScope
      ? await fetchMessagingFromDbBatch(context.supabase, trendMonthKeys)
      : null;

    const trend = await Promise.all(
      trendMonthKeys.map(async (monthKey) => {
        const mBounds = monthBoundsUtc(monthKey);
        let leadsQuery = context.supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .gte("created_at", mBounds.fromIso)
          .lt("created_at", mBounds.toExclusiveIso);
        if (brandScope) leadsQuery = leadsQuery.eq("brand_id", brandScope);
        const [{ count: lc }, { data: sp }, rate] = await Promise.all([
          leadsQuery,
          context.supabase
            .from("ad_spend_daily")
            .select("brand_id, spend_usd")
            .not("brand_id", "is", null)
            .gte("date", mBounds.fromDate)
            .lt("date", mBounds.toExclusive.toISOString().slice(0, 10)),
          monthAvgUsdKzt(context, mBounds.from, mBounds.toExclusive),
        ]);
        const metaConv =
          brandScope && trendMessagingByBrand
            ? (trendMessagingByBrand.get(monthKey)?.get(brandScope) ?? 0)
            : (trendMessagingTotals.get(monthKey) ?? 0);
        const spFiltered = brandScope
          ? (sp ?? []).filter((r) => r.brand_id === brandScope)
          : (sp ?? []);
        const spUsd = spFiltered.reduce((a, r) => a + Number(r.spend_usd), 0);
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
      period: {
        from: data.from,
        to: data.to,
        label: periodLabelRu(data.from, data.to),
        is_full_month: isFullMonthPeriod(data.from, data.to),
        days: bounds.dayCount,
      },
      month: isFullMonthPeriod(data.from, data.to)
        ? monthKeyFromDate(new Date(`${data.from}T00:00:00.000Z`))
        : null,
      scope: {
        brand_id: brandScope,
        brand_name: scope.brandName,
        can_see_all_brands: scope.canSeeAllBrands,
      },
      avg_rate: avgRate,
      latest_rate: latestFx?.[0] ? { date: latestFx[0].date, usd_kzt: Number(latestFx[0].usd_kzt) } : null,
      totals: {
        spend_usd: totalSpendUsd,
        spend_kzt: totalSpendKzt,
        leads: totalLeads,
        table_leads: tableLeads,
        messaging_leads: brandMessagingSum,
        unbranded_leads: unbrandedLeads,
        called: funnelMetrics.called,
        not_called: funnelMetrics.not_called,
        qualified: funnelMetrics.qualified,
        sent_to_1c: funnelMetrics.sent_to_1c,
        ...costs,
        lead_to_call_pct: funnelMetrics.lead_to_call_pct,
        lead_to_qual_pct: funnelMetrics.lead_to_qual_pct,
        lead_to_1c_pct: funnelMetrics.lead_to_1c_pct,
        call_to_qual_pct: funnelMetrics.call_to_qual_pct,
        qual_to_1c_pct: funnelMetrics.qual_to_1c_pct,
        call_to_1c_pct: funnelMetrics.call_to_1c_pct,
        lead_to_1c_all_pct: funnelMetrics.lead_to_1c_all_pct,
        /** aliases */
        called_pct: funnelMetrics.lead_to_call_pct,
        qualified_pct: funnelMetrics.lead_to_qual_pct,
        quality_pct: funnelMetrics.call_to_qual_pct,
        sent_pct: funnelMetrics.lead_to_1c_pct,
        conversion_pct: funnelMetrics.lead_to_1c_pct,
        conversion_all_pct: funnelMetrics.lead_to_1c_all_pct,
      },
      by_brand: byBrand,
      by_assignee: byAssignee,
      trend,
      funnel,
      mom: {
        from: prevPeriod.from,
        to: prevPeriod.to,
        label: periodLabelRu(prevPeriod.from, prevPeriod.to),
        leads: prevLeadsTotal,
        spend_kzt: prevSpendKzt,
        cpl_kzt: prevCpl,
        leads_delta_pct: pctDelta(totalLeads, prevLeadsTotal),
        spend_delta_pct: pctDelta(totalSpendKzt, prevSpendKzt),
        cpl_delta_pct: pctDelta(costs.cpl_kzt, prevCpl),
      },
    };
  });
