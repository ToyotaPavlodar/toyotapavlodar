// Server-only helpers for pulling data from Meta Marketing API.
// Called from admin server functions and from cron webhook routes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMetaTestLead, parseMetaLeadFields } from "@/lib/meta-lead-parsing";
import { upsertMetaLeadPreservingComment } from "@/lib/meta-leads.server";
import { clampToToday, monthBoundsUtc, monthKeyFromDate } from "@/lib/month-range";

type SavedForm = {
  form_id: string;
  page_id: string;
  page_name?: string;
  form_name?: string;
  brand_id: string | null;
  field_map?: Record<string, "ignore" | "name" | "phone" | "interest" | "city" | "comment">;
};

export const META_LEADS_BACKFILL_HOURS = 168;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** until для Meta: конец месяца, но не дальше сегодня для текущего месяца. */
function metaUntilForMonth(month: string): string {
  const bounds = monthBoundsUtc(month);
  if (month === monthKeyFromDate(new Date())) {
    return clampToToday(bounds.toDate);
  }
  return bounds.toDate;
}

type MetaAction = { action_type: string; value: string };

/** Click-to-WhatsApp / messaging campaigns report starts via actions[], not Lead Ads. */
function parseMessagingStarts(actions?: MetaAction[]): number {
  if (!actions?.length) return 0;
  const byType = new Map(actions.map((a) => [a.action_type, Number(a.value) || 0]));
  // Порядок как в Meta Ads Manager: «Messaging conversations started»
  for (const key of [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_first_reply",
    "onsite_conversion.total_messaging_connection",
  ]) {
    const v = byType.get(key);
    if (v && v > 0) return v;
  }
  return 0;
}

type MetaAdAccountRow = {
  id: string;
  name?: string;
  currency?: string;
  default_brand_id?: string | null;
  /** false = не тянуть расходы в CRM (чужие кабинеты на токене). */
  sync_enabled?: boolean;
  pages?: Array<{ id: string; name: string; default_brand_id?: string | null }>;
};

/** Кабинет учитывается в CRM только если явно включён и есть бренд. */
export function isCrmSpendAccount(acc: MetaAdAccountRow): boolean {
  if (acc.sync_enabled === false) return false;
  const hasBrand = !!acc.default_brand_id || (acc.pages ?? []).some((p) => !!p.default_brand_id);
  if (!hasBrand) return false;
  // sync_enabled === undefined: включаем только если бренд уже настроен (обратная совместимость)
  return true;
}

/** Кабинеты, где WhatsApp-диалоги Meta = заявки бренда «Сервис».
 *  Только кабинеты с default_brand_id = Сервис (напр. АВТОСЕРВИС).
 *  Нельзя брать Тойота Центр только из‑за страницы «Автосервис» — там общий messaging по всем брендам.
 */
export async function resolveWhatsAppLeadAccountIds(): Promise<string[]> {
  const { data: brands } = await supabaseAdmin.from("brands").select("id, code");
  const serviceBrandIds = new Set(
    (brands ?? []).filter((b) => b.code === "service").map((b) => b.id),
  );
  const { data: intg } = await supabaseAdmin
    .from("meta_integration")
    .select("ad_accounts")
    .eq("id", 1)
    .maybeSingle();
  const accounts = (intg?.ad_accounts as MetaAdAccountRow[] | null) ?? [];
  return accounts
    .filter((a) => a.default_brand_id && serviceBrandIds.has(a.default_brand_id))
    .map((a) => a.id);
}

function resolveAccountBrandId(acc: MetaAdAccountRow): string | null {
  let brandId = acc.default_brand_id ?? null;
  if (!brandId && acc.pages?.length === 1) brandId = acc.pages[0].default_brand_id ?? null;
  if (!brandId && acc.pages?.length) {
    brandId = acc.pages.find((p) => p.default_brand_id)?.default_brand_id ?? null;
  }
  return brandId;
}

type MessagingAccountPull = { accountId: string; brandId: string; conversations: number };

/** Per-account Meta messaging starts (кабинеты бренда «Сервис»). */
export async function pullMessagingAccountsFromMeta(
  month: string,
): Promise<MessagingAccountPull[]> {
  const bounds = monthBoundsUtc(month);
  const until = metaUntilForMonth(month);
  const waAccountIds = new Set(await resolveWhatsAppLeadAccountIds());
  const { data: intg } = await supabaseAdmin
    .from("meta_integration")
    .select("access_token, ad_accounts")
    .eq("id", 1)
    .maybeSingle();
  const token = intg?.access_token;
  const accounts = (intg?.ad_accounts as MetaAdAccountRow[] | null) ?? [];
  const out: MessagingAccountPull[] = [];
  if (!token || accounts.length === 0) return out;

  for (const acc of accounts) {
    if (!waAccountIds.has(acc.id)) continue;
    const brandId = resolveAccountBrandId(acc);
    if (!brandId) continue;

    const url = `https://graph.facebook.com/v21.0/${acc.id}/insights?fields=actions&time_range={"since":"${bounds.fromDate}","until":"${until}"}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("messaging pull err", acc.id, await res.text());
      continue;
    }
    const json = (await res.json()) as { data?: Array<{ actions?: MetaAction[] }> };
    const n = parseMessagingStarts(json.data?.[0]?.actions);
    out.push({ accountId: acc.id, brandId, conversations: n });
  }
  return out;
}

/** Account-level Meta API → сумма по brand_id (для live fallback на дашборде). */
export async function pullMessagingFromMeta(month: string): Promise<Map<string, number>> {
  const rows = await pullMessagingAccountsFromMeta(month);
  const out = new Map<string, number>();
  for (const row of rows) {
    out.set(row.brandId, (out.get(row.brandId) ?? 0) + row.conversations);
  }
  return out;
}

/** Account-level Meta messaging starts → meta_messaging_monthly (источник правды для дашборда). */
export async function syncMetaMessagingMonth(
  month: string,
): Promise<{ rows: number; error?: string }> {
  const pulled = await pullMessagingAccountsFromMeta(month);

  let upserted = 0;
  for (const row of pulled) {
    const { error } = await supabaseAdmin.from("meta_messaging_monthly").upsert(
      {
        month,
        meta_account_id: row.accountId,
        brand_id: row.brandId,
        conversations_started: row.conversations,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "month,meta_account_id" },
    );
    if (error) {
      console.error("meta_messaging_monthly upsert", row.accountId, error.message);
      return { rows: upserted, error: error.message };
    }
    upserted++;
  }

  if (upserted > 0) {
    await supabaseAdmin.from("sync_log").insert({
      kind: "meta_messaging_monthly",
      status: "ok",
      message: `month ${month}: ${upserted} account(s)`,
    });
  }
  return { rows: upserted };
}

/** Подписать все Facebook-страницы кабинетов на webhook leadgen (мгновенные лиды). */
export async function subscribePagesToLeadgenWebhook(): Promise<{
  subscribed: number;
  pages: string[];
  errors: string[];
}> {
  const { data: intg } = await supabaseAdmin
    .from("meta_integration")
    .select("access_token, ad_accounts")
    .eq("id", 1)
    .maybeSingle();
  const userToken = intg?.access_token;
  const accounts = (intg?.ad_accounts as MetaAdAccountRow[] | null) ?? [];
  if (!userToken) return { subscribed: 0, pages: [], errors: ["meta not configured"] };

  const pageIds = new Map<string, string>();
  for (const acc of accounts) {
    for (const page of acc.pages ?? []) pageIds.set(page.id, page.name);
  }
  if (pageIds.size === 0) {
    for (const acc of accounts) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${acc.id}/promote_pages?fields=id,name&limit=200&access_token=${encodeURIComponent(userToken)}`,
      );
      const json = (await res.json()) as { data?: Array<{ id: string; name: string }> };
      for (const p of json.data ?? []) pageIds.set(p.id, p.name);
    }
  }

  const errors: string[] = [];
  const subscribed: string[] = [];

  for (const [pageId, pageName] of pageIds) {
    const pgRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    const pg = (await pgRes.json()) as { access_token?: string; error?: { message: string } };
    const pageToken = pg.access_token;
    if (!pageToken) {
      errors.push(`${pageName}: нет page access token`);
      continue;
    }
    const subRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: "leadgen", access_token: pageToken }),
    });
    const subJson = (await subRes.json()) as { success?: boolean; error?: { message: string } };
    if (!subRes.ok || subJson.error) {
      errors.push(`${pageName}: ${subJson.error?.message ?? String(subRes.status)}`);
    } else {
      subscribed.push(pageName);
    }
  }

  await supabaseAdmin.from("sync_log").insert({
    kind: "meta_webhook_subscribe",
    status: errors.length === 0 ? "ok" : subscribed.length > 0 ? "partial" : "error",
    message: subscribed.length
      ? `subscribed: ${subscribed.join(", ")}${errors.length ? "; err: " + errors.join(" | ") : ""}`
      : errors.join(" | ") || "no pages",
  });

  return { subscribed: subscribed.length, pages: subscribed, errors };
}

function buildPageBrandMap(accounts: MetaAdAccountRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const acc of accounts) {
    for (const page of acc.pages ?? []) {
      if (page.default_brand_id) map.set(page.id, page.default_brand_id);
    }
  }
  return map;
}

async function buildCampaignPageMap(
  accountId: string,
  token: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let url: string | null =
    `https://graph.facebook.com/v21.0/${accountId}/adsets?fields=campaign_id,promoted_object&limit=500&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) break;
    const json = (await res.json()) as {
      data?: Array<{ campaign_id?: string; promoted_object?: { page_id?: string } }>;
      paging?: { next?: string };
    };
    for (const row of json.data ?? []) {
      const pageId = row.promoted_object?.page_id;
      if (row.campaign_id && pageId) map.set(row.campaign_id, String(pageId));
    }
    url = json.paging?.next ?? null;
  }
  return map;
}

function resolveCampaignBrandId(
  campaignId: string,
  accountId: string,
  brandByCampaign: Map<string, string>,
  campaignPageMap: Map<string, string>,
  pageBrandMap: Map<string, string>,
  defaultBrandByAccount: Map<string, string | null>,
): string | null {
  const explicit = brandByCampaign.get(campaignId);
  if (explicit) return explicit;
  const pageId = campaignPageMap.get(campaignId);
  if (pageId) {
    const pageBrand = pageBrandMap.get(pageId);
    if (pageBrand) return pageBrand;
  }
  return defaultBrandByAccount.get(accountId) ?? null;
}

/** Кабинеты, где WhatsApp-диалоги = заявки — см. resolveWhatsAppLeadAccountIds(). */

async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

// ---- Ad spend ----
export async function syncMetaSpendRange(
  from: Date,
  to: Date,
): Promise<{ rows: number; error?: string }> {
  const { data: intg } = await supabaseAdmin
    .from("meta_integration")
    .select("access_token, ad_accounts")
    .eq("id", 1)
    .maybeSingle();
  const token = intg?.access_token;
  const accounts = (intg?.ad_accounts as MetaAdAccountRow[] | null) ?? [];
  if (!token || accounts.length === 0) return { rows: 0, error: "meta not configured" };

  const defaultBrandByAccount = new Map(accounts.map((a) => [a.id, a.default_brand_id ?? null]));
  const pageBrandMap = buildPageBrandMap(accounts);
  const { data: cbmRows } = await supabaseAdmin
    .from("campaign_brand_map")
    .select("campaign_id, brand_id");
  const brandByCampaign = new Map((cbmRows ?? []).map((r) => [r.campaign_id, r.brand_id]));

  // Meta insights returns `spend` in the ad account's billing currency, not USD.
  const { data: fxLatest } = await supabaseAdmin
    .from("fx_rates")
    .select("usd_kzt")
    .order("date", { ascending: false })
    .limit(1);
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
  const waAccountIds = new Set(await resolveWhatsAppLeadAccountIds());
  const crmAccounts = accounts.filter(isCrmSpendAccount);
  const skipped = accounts.filter((a) => !isCrmSpendAccount(a)).map((a) => a.name || a.id);
  if (skipped.length > 0) {
    console.info("[meta-spend] skip unmapped accounts:", skipped.join(", "));
  }
  const since = isoDate(from);
  const until = clampToToday(isoDate(to));
  if (since > until) return { rows: 0 };

  for (const acc of crmAccounts) {
    const currency = acc.currency || "USD";
    const campaignPageMap = await buildCampaignPageMap(acc.id, token);
    let url: string | null =
      `https://graph.facebook.com/v21.0/${acc.id}/insights?level=campaign&time_increment=1&time_range={"since":"${since}","until":"${until}"}&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency&limit=500&access_token=${encodeURIComponent(token)}`;
    while (url) {
      const res = await fetch(url);
      if (!res.ok) {
        console.error("insights err", acc.id, await res.text());
        break;
      }
      const json = (await res.json()) as {
        data?: Array<{
          date_start: string;
          campaign_id: string;
          campaign_name: string;
          spend: string;
          impressions?: string;
          clicks?: string;
          account_currency?: string;
          actions?: MetaAction[];
        }>;
        paging?: { next?: string };
      };
      for (const row of json.data ?? []) {
        const native = Number(row.spend) || 0;
        const cur = row.account_currency || currency;
        const conv = waAccountIds.has(acc.id) ? parseMessagingStarts(row.actions) : 0;
        const baseRow = {
          date: row.date_start,
          meta_account_id: acc.id,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          brand_id: resolveCampaignBrandId(
            row.campaign_id,
            acc.id,
            brandByCampaign,
            campaignPageMap,
            pageBrandMap,
            defaultBrandByAccount,
          ),
          spend_usd: toUsd(native, cur),
          impressions: row.impressions ? Number(row.impressions) : 0,
          clicks: row.clicks ? Number(row.clicks) : 0,
        };
        const withConv = { ...baseRow, conversations_started: conv };
        let { error } = await supabaseAdmin
          .from("ad_spend_daily")
          .upsert(withConv, { onConflict: "date,campaign_id" });
        if (error?.message?.includes("conversations_started")) {
          ({ error } = await supabaseAdmin
            .from("ad_spend_daily")
            .upsert(baseRow, { onConflict: "date,campaign_id" }));
        }
        if (error) console.error("ad_spend upsert", row.campaign_id, error.message);
        inserted++;
      }
      url = json.paging?.next ?? null;
    }
  }
  await supabaseAdmin
    .from("sync_log")
    .insert({ kind: "meta_spend", status: "ok", message: `rows: ${inserted}` });
  return { rows: inserted };
}

// ---- Lead Ads backfill ----

/** Все страницы токена вместе с их page access token (одним запросом). */
export async function listPageTokens(userToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let url: string | null =
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&limit=200&access_token=${encodeURIComponent(userToken)}`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) break;
    const json = (await res.json()) as {
      data?: Array<{ id: string; access_token?: string }>;
      paging?: { next?: string };
    };
    for (const p of json.data ?? []) if (p.access_token) map.set(String(p.id), p.access_token);
    url = json.paging?.next ?? null;
  }
  return map;
}

async function listPageForms(
  pageId: string,
  pageToken: string,
): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = [];
  const errors: string[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id&limit=200&access_token=${encodeURIComponent(pageToken)}`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      errors.push(`page ${pageId} forms: ${res.status} ${text.slice(0, 160)}`);
      break;
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (json.error) {
      errors.push(`page ${pageId} forms: ${json.error.message ?? "Meta API error"}`);
      break;
    }
    for (const f of json.data ?? []) ids.push(String(f.id));
    url = json.paging?.next ?? null;
  }
  return { ids, errors };
}

export async function syncMetaLeadsRange(
  from: Date,
  to: Date,
): Promise<{
  rows: number;
  inserted: number;
  skipped_test: number;
  pages: number;
  forms: number;
  scanned: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let inserted = 0;
  let created = 0;
  let skippedTest = 0;
  const { data: intg } = await supabaseAdmin
    .from("meta_integration")
    .select("access_token, selected_forms, ad_accounts")
    .eq("id", 1)
    .maybeSingle();
  const userToken = intg?.access_token;
  const selected = (intg?.selected_forms as SavedForm[] | null) ?? [];
  const accounts = (intg?.ad_accounts as MetaAdAccountRow[] | null) ?? [];
  if (!userToken) {
    return {
      rows: 0,
      inserted: 0,
      skipped_test: 0,
      pages: 0,
      forms: 0,
      scanned: 0,
      errors: ["meta not configured"],
    };
  }

  const selectedByForm = new Map(selected.map((s) => [s.form_id, s]));
  const pageBrandMap = buildPageBrandMap(accounts);

  const { data: cbmRows } = await supabaseAdmin
    .from("campaign_brand_map")
    .select("campaign_id, brand_id");
  const brandByCampaign = new Map((cbmRows ?? []).map((r) => [r.campaign_id, r.brand_id]));

  // Страницы: все из токена + те, что уже сохранены в выбранных формах.
  const pageTokens = await listPageTokens(userToken);
  for (const acc of accounts) {
    for (const page of acc.pages ?? []) {
      if (!pageTokens.has(page.id)) {
        const t = await getPageToken(page.id, userToken);
        if (t) pageTokens.set(page.id, t);
      }
    }
  }
  for (const s of selected) {
    if (!pageTokens.has(s.page_id)) {
      const t = await getPageToken(s.page_id, userToken);
      if (t) pageTokens.set(s.page_id, t);
    }
  }
  if (pageTokens.size === 0) {
    return {
      rows: 0,
      inserted: 0,
      skipped_test: 0,
      pages: 0,
      forms: 0,
      scanned: 0,
      errors: ["no page access tokens available"],
    };
  }

  const sinceUnix = Math.floor(from.getTime() / 1000);
  const untilUnix = Math.floor(to.getTime() / 1000);
  let processed = 0;
  let formsScanned = 0;

  for (const [pageId, pageToken] of pageTokens) {
    // Берём ВСЕ формы страницы, а не только сохранённые — иначе лиды теряются.
    const pageForms = await listPageForms(pageId, pageToken);
    errors.push(...pageForms.errors);
    const formIds = new Set(pageForms.ids);
    for (const s of selected) if (s.page_id === pageId) formIds.add(s.form_id);
    if (formIds.size === 0) continue;

    for (const formId of formIds) {
      formsScanned++;
      const cfg = selectedByForm.get(formId);
      const filtering = encodeURIComponent(
        JSON.stringify([
          { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
          { field: "time_created", operator: "LESS_THAN", value: untilUnix },
        ]),
      );
      let url: string | null =
        `https://graph.facebook.com/v21.0/${formId}/leads?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id&limit=200&filtering=${filtering}&access_token=${encodeURIComponent(pageToken)}`;

      while (url) {
        const res = await fetch(url);
        if (!res.ok) {
          const t = await res.text();
          errors.push(`form ${formId}: ${res.status} ${t.slice(0, 160)}`);
          break;
        }
        const json = (await res.json()) as {
          data?: Array<{
            id: string;
            created_time: string;
            ad_id?: string;
            adset_id?: string;
            campaign_id?: string;
            form_id?: string;
            field_data?: Array<{ name: string; values: string[] }>;
          }>;
          paging?: { next?: string };
        };

        for (const lead of json.data ?? []) {
          processed++;
          const parsed = parseMetaLeadFields(lead.field_data, cfg?.field_map);
          if (isMetaTestLead(parsed)) {
            skippedTest++;
            continue;
          }

          let brandId: string | null = cfg?.brand_id ?? null;
          if (!brandId && lead.campaign_id) brandId = brandByCampaign.get(lead.campaign_id) ?? null;
          if (!brandId) brandId = pageBrandMap.get(pageId) ?? null;

          // Learn campaign→brand mapping so ad spend can be attributed
          if (brandId && lead.campaign_id) brandByCampaign.set(lead.campaign_id, brandId);

          const upsert = await upsertMetaLeadPreservingComment({
            source: "meta_lead_form",
            source_ref: lead.id,
            name: parsed.name,
            phone: parsed.phone,
            interest: parsed.interest,
            city: parsed.city,
            comment: parsed.comment,
            brand_id: brandId,
            meta_form_id: lead.form_id ?? formId,
            meta_campaign_id: lead.campaign_id,
            meta_adset_id: lead.adset_id,
            meta_ad_id: lead.ad_id,
            raw_payload: JSON.parse(JSON.stringify(lead)),
            created_at: lead.created_time
              ? new Date(lead.created_time).toISOString()
              : new Date().toISOString(),
          });
          if (upsert.error) {
            errors.push(`lead ${lead.id}: ${upsert.error.slice(0, 120)}`);
            console.error("meta lead upsert", lead.id, upsert.error);
          } else {
            if (upsert.created) created++;
            inserted++;
          }
        }
        url = json.paging?.next ?? null;
      }
    }
  }

  // Backfill brand_id on existing spend rows using what we learned from leads
  for (const [campaignId, brandId] of brandByCampaign) {
    if (!brandId) continue;
    await supabaseAdmin
      .from("ad_spend_daily")
      .update({ brand_id: brandId })
      .eq("campaign_id", campaignId)
      .is("brand_id", null);
  }

  // Пишем в журнал только если что-то реально изменилось — иначе лог засоряется
  // повторами при частом опросе со страницы лидов.
  if (created > 0 || errors.length > 0) {
    await supabaseAdmin.from("sync_log").insert({
      kind: "meta_leads_backfill",
      status: errors.length === 0 ? "ok" : "partial",
      message: `new: ${created}, refreshed: ${inserted - created}, pages: ${pageTokens.size}, forms: ${formsScanned}, scanned: ${processed}, skipped_test: ${skippedTest}${errors.length ? "; errors: " + errors.slice(0, 3).join(" | ") : ""}`,
    });
  }
  return {
    rows: created,
    inserted,
    skipped_test: skippedTest,
    pages: pageTokens.size,
    forms: formsScanned,
    scanned: processed,
    errors,
  };
}
