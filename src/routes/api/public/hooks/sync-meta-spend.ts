import { createFileRoute } from "@tanstack/react-router";

// Syncs Meta Ads spend for the last 7 days across all configured ad accounts
export const Route = createFileRoute("/api/public/hooks/sync-meta-spend")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: intg } = await supabaseAdmin.from("meta_integration").select("access_token, ad_accounts").eq("id", 1).maybeSingle();
        const token = intg?.access_token;
        const accounts = (intg?.ad_accounts as Array<{ id: string }> | null) ?? [];
        if (!token || accounts.length === 0) {
          return Response.json({ ok: false, message: "meta not configured" });
        }

        const { data: cbmRows } = await supabaseAdmin.from("campaign_brand_map").select("campaign_id, brand_id");
        const brandByCampaign = new Map((cbmRows ?? []).map((r) => [r.campaign_id, r.brand_id]));

        const today = new Date();
        const since = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const isoDate = (d: Date) => d.toISOString().slice(0, 10);

        let inserted = 0;
        for (const acc of accounts) {
          const url = `https://graph.facebook.com/v21.0/${acc.id}/insights?level=campaign&time_increment=1&time_range={"since":"${isoDate(since)}","until":"${isoDate(today)}"}&fields=campaign_id,campaign_name,spend,impressions,clicks&limit=500&access_token=${encodeURIComponent(token)}`;
          const res = await fetch(url);
          if (!res.ok) { console.error("insights err", acc.id, await res.text()); continue; }
          const json = await res.json() as { data?: Array<{ date_start: string; campaign_id: string; campaign_name: string; spend: string; impressions?: string; clicks?: string }> };
          for (const row of json.data ?? []) {
            await supabaseAdmin.from("ad_spend_daily").upsert({
              date: row.date_start,
              meta_account_id: acc.id,
              campaign_id: row.campaign_id,
              campaign_name: row.campaign_name,
              brand_id: brandByCampaign.get(row.campaign_id) ?? null,
              spend_usd: Number(row.spend) || 0,
              impressions: row.impressions ? Number(row.impressions) : 0,
              clicks: row.clicks ? Number(row.clicks) : 0,
            }, { onConflict: "date,campaign_id" });
            inserted++;
          }
        }
        await supabaseAdmin.from("sync_log").insert({ kind: "meta_spend", status: "ok", message: `rows: ${inserted}` });
        return Response.json({ ok: true, rows: inserted });
      },
    },
  },
});
