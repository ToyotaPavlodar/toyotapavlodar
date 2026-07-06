import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { monthBoundsUtc, shiftMonthKey } from "@/lib/month-range";

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
  .inputValidator((d: unknown) => z.object({ month: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDashboard(context);
    const bounds = monthBoundsUtc(data.month);
    const { from, toExclusive, toInclusive, fromIso, toExclusiveIso, fromDate, toDate } = bounds;

    const [{ data: leads }, { data: spend }, { data: brands }, avgRate, { data: latestFx }] = await Promise.all([
      context.supabase.from("leads")
        .select("brand_id, called, qualified, sent_to_1c")
        .gte("created_at", fromIso).lt("created_at", toExclusiveIso),
      context.supabase.from("ad_spend_daily")
        .select("brand_id, spend_usd")
        .not("brand_id", "is", null)
        .gte("date", fromDate).lt("date", toExclusive.toISOString().slice(0, 10)),
      context.supabase.from("brands").select("id, code, name, color, sort_order").order("sort_order"),
      monthAvgUsdKzt(context, from, toExclusive),
      context.supabase.from("fx_rates").select("date, usd_kzt").order("date", { ascending: false }).limit(1),
    ]);

    const { fetchMessagingConversationsByBrand } = await import("@/lib/meta-sync.server");
    const messagingByBrand = await fetchMessagingConversationsByBrand(from, toInclusive);

    const leadRows = leads ?? [];
    const tableLeads = leadRows.length;
    const metaConversations = Array.from(messagingByBrand.values()).reduce((a, n) => a + n, 0);
    const calledYes = leadRows.filter((l) => l.called === true).length;
    const qualified = leadRows.filter((l) => l.qualified === true).length;
    const sent1c = leadRows.filter((l) => l.sent_to_1c).length;
    const unbrandedLeads = leadRows.filter((l) => !l.brand_id).length;

    const totalSpendUsd = (spend ?? []).reduce((a, r) => a + Number(r.spend_usd), 0);
    const totalSpendKzt = totalSpendUsd * avgRate;

    const byBrand = (brands ?? []).map((b) => {
      const bTableLeads = leadRows.filter((l) => l.brand_id === b.id).length;
      const bMetaConv = messagingByBrand.get(b.id) ?? 0;
      const bLeads = bTableLeads + bMetaConv;
      const bSpendUsd = (spend ?? []).filter((s) => s.brand_id === b.id).reduce((a, r) => a + Number(r.spend_usd), 0);
      const bSpendKzt = bSpendUsd * avgRate;
      const bCalled = leadRows.filter((l) => l.brand_id === b.id && l.called === true).length;
      const bQualified = leadRows.filter((l) => l.brand_id === b.id && l.qualified === true).length;
      return {
        id: b.id, code: b.code, name: b.name, color: b.color,
        leads: bLeads,
        table_leads: bTableLeads,
        messaging_leads: bMetaConv,
        spend_usd: bSpendUsd,
        spend_kzt: bSpendKzt,
        cpl_kzt: bLeads > 0 ? bSpendKzt / bLeads : 0,
        cpql_kzt: bQualified > 0 ? bSpendKzt / bQualified : 0,
        called: bCalled,
        qualified: bQualified,
        called_pct: bTableLeads > 0 ? (bCalled / bTableLeads) * 100 : 0,
      };
    });

    const brandMessagingSum = byBrand.reduce((a, b) => a + b.messaging_leads, 0);
    const totalLeads = tableLeads + brandMessagingSum;

    // Сравнение с прошлым месяцем
    const prevMonth = shiftMonthKey(data.month, -1);
    const prevBounds = monthBoundsUtc(prevMonth);
    const [{ count: prevTableLeads }, { data: prevSpend }, prevRate] = await Promise.all([
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
    ]);
    const prevMessagingMap = await fetchMessagingConversationsByBrand(prevBounds.from, prevBounds.toInclusive);
    const prevMessaging = Array.from(prevMessagingMap.values()).reduce((a, n) => a + n, 0);
    const prevLeadsTotal = (prevTableLeads ?? 0) + prevMessaging;
    const prevSpendKzt = (prevSpend ?? []).reduce((a, r) => a + Number(r.spend_usd), 0) * prevRate;
    const prevCpl = prevLeadsTotal > 0 ? prevSpendKzt / prevLeadsTotal : 0;

    const pctDelta = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    const funnel = {
      leads: totalLeads,
      table_leads: tableLeads,
      called: calledYes,
      qualified,
      sent_to_1c: sent1c,
      called_pct: tableLeads > 0 ? (calledYes / tableLeads) * 100 : 0,
      qualified_pct: tableLeads > 0 ? (qualified / tableLeads) * 100 : 0,
      sent_pct: tableLeads > 0 ? (sent1c / tableLeads) * 100 : 0,
    };

    const TREND_START = startOfMonth(new Date(Date.UTC(2026, 6, 1)));
    const trend = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const m = addMonths(TREND_START, i);
        const mFrom = startOfMonth(m);
        const mLast = endOfMonth(m);
        const mToExclusive = new Date(Date.UTC(mLast.getUTCFullYear(), mLast.getUTCMonth(), mLast.getUTCDate() + 1));
        const monthKey = mFrom.toISOString().slice(0, 7);
        const [{ count: lc }, { data: sp }, rate, messagingMap] = await Promise.all([
          context.supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("created_at", mFrom.toISOString())
            .lt("created_at", mToExclusive.toISOString()),
          context.supabase
            .from("ad_spend_daily")
            .select("spend_usd")
            .not("brand_id", "is", null)
            .gte("date", mFrom.toISOString().slice(0, 10))
            .lt("date", mToExclusive.toISOString().slice(0, 10)),
          monthAvgUsdKzt(context, mFrom, mToExclusive),
          fetchMessagingConversationsByBrand(mFrom, mLast),
        ]);
        const spUsd = (sp ?? []).reduce((a, r) => a + Number(r.spend_usd), 0);
        const metaConv = Array.from(messagingMap.values()).reduce((a, n) => a + n, 0);
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
        /** Lead Ads + WhatsApp за выбранный месяц (= строки в CRM + диалоги Meta). */
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
        conversion_pct: tableLeads > 0 ? (sent1c / tableLeads) * 100 : 0,
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
