// Server-only helpers for pulling data from Meta Marketing API.
// Called from admin server functions and from cron webhook routes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SavedForm = {
  form_id: string;
  page_id: string;
  page_name?: string;
  form_name?: string;
  brand_id: string | null;
  field_map?: Record<string, "ignore" | "name" | "phone" | "interest" | "city" | "comment">;
};

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`);
  if (!res.ok) return null;
  const j = await res.json() as { access_token?: string };
  return j.access_token ?? null;
}

// ---- Ad spend ----
export async function syncMetaSpendRange(from: Date, to: Date): Promise<{ rows: number; error?: string }> {
  const { data: intg } = await supabaseAdmin.from("meta_integration").select("access_token, ad_accounts").eq("id", 1).maybeSingle();
  const token = intg?.access_token;
  const accounts = (intg?.ad_accounts as Array<{ id: string; currency?: string }> | null) ?? [];
  if (!token || accounts.length === 0) return { rows: 0, error: "meta not configured" };

  const { data: cbmRows } = await supabaseAdmin.from("campaign_brand_map").select("campaign_id, brand_id");
  const brandByCampaign = new Map((cbmRows ?? []).map((r) => [r.campaign_id, r.brand_id]));

  // Meta insights returns `spend` in the ad account's billing currency, not USD.
  const { data: fxLatest } = await supabaseAdmin.from("fx_rates").select("usd_kzt").order("date", { ascending: false }).limit(1);
  const usdKzt = Number(fxLatest?.[0]?.usd_kzt ?? 475);
  const toUsd = (native: number, currency: string): number => {
    const c = (currency || "USD").toUpperCase();
    if (c === "USD") return native;
    if (c === "KZT") return usdKzt > 0 ? native / usdKzt : native;
    if (c === "AED") return native * 0.2723;
    if (c === "EUR") return native * 1.08;
    if (c === "RUB") return native / 90;
    return native;
  };

  let inserted = 0;
  for (const acc of accounts) {
    const currency = acc.currency || "USD";
    let url: string | null = `https://graph.facebook.com/v21.0/${acc.id}/insights?level=campaign&time_increment=1&time_range={"since":"${isoDate(from)}","until":"${isoDate(to)}"}&fields=campaign_id,campaign_name,spend,impressions,clicks,account_currency&limit=500&access_token=${encodeURIComponent(token)}`;
    while (url) {
      const res = await fetch(url);
      if (!res.ok) { console.error("insights err", acc.id, await res.text()); break; }
      const json = await res.json() as {
        data?: Array<{ date_start: string; campaign_id: string; campaign_name: string; spend: string; impressions?: string; clicks?: string; account_currency?: string }>;
        paging?: { next?: string };
      };
      for (const row of json.data ?? []) {
        const native = Number(row.spend) || 0;
        const cur = row.account_currency || currency;
        await supabaseAdmin.from("ad_spend_daily").upsert({
          date: row.date_start,
          meta_account_id: acc.id,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          brand_id: brandByCampaign.get(row.campaign_id) ?? null,
          spend_usd: toUsd(native, cur),
          impressions: row.impressions ? Number(row.impressions) : 0,
          clicks: row.clicks ? Number(row.clicks) : 0,
        }, { onConflict: "date,campaign_id" });
        inserted++;
      }
      url = json.paging?.next ?? null;
    }
  }
  await supabaseAdmin.from("sync_log").insert({ kind: "meta_spend", status: "ok", message: `rows: ${inserted}` });
  return { rows: inserted };
}

// ---- Lead Ads backfill ----
export async function syncMetaLeadsRange(from: Date, to: Date): Promise<{ rows: number; errors: string[] }> {
  const errors: string[] = [];
  const { data: intg } = await supabaseAdmin.from("meta_integration").select("access_token, selected_forms").eq("id", 1).maybeSingle();
  const userToken = intg?.access_token;
  const selected = (intg?.selected_forms as SavedForm[] | null) ?? [];
  if (!userToken || selected.length === 0) return { rows: 0, errors: ["meta not configured or no forms selected"] };

  const { data: cbmRows } = await supabaseAdmin.from("campaign_brand_map").select("campaign_id, brand_id");
  const brandByCampaign = new Map((cbmRows ?? []).map((r) => [r.campaign_id, r.brand_id]));

  // Group forms by page so we fetch each page token once
  const byPage = new Map<string, SavedForm[]>();
  for (const s of selected) {
    if (!byPage.has(s.page_id)) byPage.set(s.page_id, []);
    byPage.get(s.page_id)!.push(s);
  }

  const sinceUnix = Math.floor(from.getTime() / 1000);
  const untilUnix = Math.floor(to.getTime() / 1000);
  let inserted = 0;

  for (const [pageId, forms] of byPage) {
    const pageToken = await getPageToken(pageId, userToken);
    if (!pageToken) { errors.push(`page ${pageId}: cannot get page access token`); continue; }

    for (const cfg of forms) {
      const filtering = encodeURIComponent(JSON.stringify([
        { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
        { field: "time_created", operator: "LESS_THAN", value: untilUnix },
      ]));
      let url: string | null = `https://graph.facebook.com/v21.0/${cfg.form_id}/leads?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id&limit=200&filtering=${filtering}&access_token=${pageToken}`;

      while (url) {
        const res = await fetch(url);
        if (!res.ok) {
          const t = await res.text();
          errors.push(`form ${cfg.form_id}: ${res.status} ${t.slice(0, 200)}`);
          break;
        }
        const json = await res.json() as {
          data?: Array<{
            id: string; created_time: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string;
            field_data?: Array<{ name: string; values: string[] }>;
          }>;
          paging?: { next?: string };
        };

        for (const lead of json.data ?? []) {
          // Field mapping (same logic as webhook)
          let name: string | null = null;
          let phone: string | null = null;
          let interest: string | null = null;
          let city: string | null = null;
          const commentParts: string[] = [];
          const fmap = cfg.field_map;
          if (fmap && Object.keys(fmap).length > 0) {
            for (const f of lead.field_data ?? []) {
              const target = fmap[f.name];
              const v = f.values?.[0] ?? "";
              if (!v || !target || target === "ignore") continue;
              if (target === "name") name = v;
              else if (target === "phone") phone = v.replace(/[^\d+]/g, "");
              else if (target === "interest") interest = v;
              else if (target === "city") city = v;
              else if (target === "comment") commentParts.push(`${f.name}: ${v}`);
            }
          } else {
            const map: Record<string, string> = {};
            for (const f of lead.field_data ?? []) map[f.name.toLowerCase()] = f.values?.[0] ?? "";
            name = map["full_name"] || map["name"] || `${map["first_name"] ?? ""} ${map["last_name"] ?? ""}`.trim() || null;
            phone = (map["phone_number"] || map["phone"] || "").replace(/[^\d+]/g, "") || null;
            interest = map["vehicle"] || map["model"] || map["car_model"] || map["interest"] || null;
            city = map["city"] || map["город"] || map["қала"] || null;
          }

          let brandId: string | null = cfg.brand_id ?? null;
          if (!brandId && lead.campaign_id) {
            brandId = brandByCampaign.get(lead.campaign_id) ?? null;
          }

          await supabaseAdmin.from("leads").upsert({
            source: "meta_lead_form",
            source_ref: lead.id,
            name, phone, interest, city,
            comment: commentParts.length > 0 ? commentParts.join("\n") : null,
            brand_id: brandId,
            meta_form_id: lead.form_id ?? cfg.form_id,
            meta_campaign_id: lead.campaign_id,
            meta_adset_id: lead.adset_id,
            meta_ad_id: lead.ad_id,
            raw_payload: JSON.parse(JSON.stringify(lead)),
            created_at: lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString(),
          }, { onConflict: "source,source_ref" });
          inserted++;
        }
        url = json.paging?.next ?? null;
      }
    }
  }

  await supabaseAdmin.from("sync_log").insert({
    kind: "meta_leads_backfill",
    status: errors.length === 0 ? "ok" : "partial",
    message: `rows: ${inserted}${errors.length ? "; errors: " + errors.slice(0, 3).join(" | ") : ""}`,
  });
  return { rows: inserted, errors };
}
