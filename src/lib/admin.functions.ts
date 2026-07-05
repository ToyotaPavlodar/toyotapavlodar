import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!data?.some((r) => r.role === "admin")) throw new Error("Только для администратора");
}

// ---- Users ----
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, dashboard_access, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
    }));
  });

export const setDashboardAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ dashboard_access: data.value }).eq("id", data.user_id);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(["admin", "marketer", "manager", "operator"]),
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enabled) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
    }
    return { ok: true };
  });

// ---- Employee create/delete ----
export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    full_name: z.string().trim().min(1).max(120),
    role: z.enum(["admin", "marketer", "manager"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message || "Не удалось создать пользователя");
    const uid = created.user.id;
    // trigger handle_new_user creates profile + operator role; add requested role
    await supabaseAdmin.from("profiles").upsert({ id: uid, email: data.email, full_name: data.full_name });
    // reset default roles: keep only the chosen one (+ admin implies dashboard_access)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (data.role === "admin" || data.role === "marketer") {
      await supabaseAdmin.from("profiles").update({ dashboard_access: true }).eq("id", uid);
    }
    return { ok: true, id: uid };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Нельзя удалить самого себя");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Meta / Facebook ----
export const getMetaIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("meta_integration").select("*").eq("id", 1).maybeSingle();
    return data;
  });

export const saveMetaToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ access_token: z.string().min(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Validate token & load ad accounts
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(data.access_token)}`);
    if (!meRes.ok) throw new Error("Токен недействителен");
    const me = await meRes.json() as { id: string; name?: string };

    const accRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,currency&limit=100&access_token=${encodeURIComponent(data.access_token)}`);
    const accJson = await accRes.json() as { data?: Array<{ id: string; account_id: string; name: string; currency: string }> };

    await context.supabase.from("meta_integration").update({
      access_token: data.access_token,
      meta_user_id: me.id,
      connected_at: new Date().toISOString(),
      ad_accounts: accJson.data ?? [],
    }).eq("id", 1);
    return { ok: true, user: me, accounts: accJson.data ?? [] };
  });

// Legacy — оставлено для совместимости; UI использует listMetaPages / listMetaFormsForPages
export const listMetaForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ad_account_id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: intg } = await context.supabase.from("meta_integration").select("access_token").eq("id", 1).maybeSingle();
    if (!intg?.access_token) throw new Error("Meta не подключён");
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/${data.ad_account_id}/promote_pages?access_token=${encodeURIComponent(intg.access_token)}`);
    const pagesJson = await pagesRes.json() as { data?: Array<{ id: string; name: string }> };
    const forms: Array<{ id: string; name: string; page_id: string; page_name: string; status: string }> = [];
    for (const p of pagesJson.data ?? []) {
      const fRes = await fetch(`https://graph.facebook.com/v21.0/${p.id}/leadgen_forms?fields=id,name,status&limit=100&access_token=${encodeURIComponent(intg.access_token)}`);
      const fJson = await fRes.json() as { data?: Array<{ id: string; name: string; status: string }> };
      for (const f of fJson.data ?? []) forms.push({ id: f.id, name: f.name, page_id: p.id, page_name: p.name, status: f.status });
    }
    return forms;
  });

// Список страниц, связанных с рекламным кабинетом
export const listMetaPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ad_account_id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: intg } = await context.supabase.from("meta_integration").select("access_token").eq("id", 1).maybeSingle();
    if (!intg?.access_token) throw new Error("Meta не подключён");
    const res = await fetch(`https://graph.facebook.com/v21.0/${data.ad_account_id}/promote_pages?fields=id,name&limit=200&access_token=${encodeURIComponent(intg.access_token)}`);
    const json = await res.json() as { data?: Array<{ id: string; name: string }>; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.data ?? [];
  });

// Формы с полями (questions) для выбранных страниц
export const listMetaFormsForPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ page_ids: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: intg } = await context.supabase.from("meta_integration").select("access_token").eq("id", 1).maybeSingle();
    if (!intg?.access_token) throw new Error("Meta не подключён");
    const forms: Array<{
      id: string; name: string; status: string;
      page_id: string; page_name: string;
      questions: Array<{ key: string; label: string; type?: string }>;
    }> = [];
    const errors: string[] = [];
    for (const pid of data.page_ids) {
      const pgRes = await fetch(`https://graph.facebook.com/v21.0/${pid}?fields=name,access_token&access_token=${encodeURIComponent(intg.access_token)}`);
      const pg = await pgRes.json() as { name?: string; access_token?: string; error?: { message: string } };
      if (pg.error) { errors.push(`page ${pid}: ${pg.error.message}`); continue; }
      // Leadgen forms требуют Page Access Token, не user token
      const pageToken = pg.access_token ?? intg.access_token;
      const fRes = await fetch(`https://graph.facebook.com/v21.0/${pid}/leadgen_forms?fields=id,name,status,questions{key,label,type}&limit=100&access_token=${encodeURIComponent(pageToken)}`);
      const fJson = await fRes.json() as { data?: Array<{ id: string; name: string; status: string; questions?: Array<{ key: string; label: string; type?: string }> }>; error?: { message: string } };
      if (fJson.error) { errors.push(`${pg.name ?? pid}: ${fJson.error.message}`); continue; }
      for (const f of fJson.data ?? []) {
        forms.push({
          id: f.id, name: f.name, status: f.status,
          page_id: pid, page_name: pg.name ?? pid,
          questions: (f.questions ?? []).map((q) => ({ key: q.key, label: q.label, type: q.type })),
        });
      }
    }
    if (forms.length === 0 && errors.length > 0) throw new Error(errors.join("; "));
    return { forms, errors };
  });

export const saveSelectedForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    forms: z.array(z.object({
      form_id: z.string(),
      form_name: z.string().optional(),
      page_id: z.string().optional(),
      page_name: z.string().optional(),
      brand_id: z.string().uuid().nullable(),
      field_map: z.record(z.string(), z.enum(["ignore", "name", "phone", "interest", "city", "comment"])).optional(),
    })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("meta_integration").update({ selected_forms: data.forms }).eq("id", 1);
    return { ok: true };
  });

// ---- WhatsApp (Green API) ----
// Поля Green API переиспользуют существующие колонки whatsapp_integration:
//   phone_number_id = idInstance, access_token = apiTokenInstance,
//   waba_id = apiUrl (хост), verify_token = webhookUrlToken (необязательно).
const waSchema = z.object({
  phone_number_id: z.string().min(3), // idInstance
  waba_id: z.string().url(), // apiUrl / хост Green API
  access_token: z.string().min(10), // apiTokenInstance
  verify_token: z.string().max(200).optional().default(""), // webhookUrlToken (необязательно)
  default_brand_id: z.string().uuid().nullable().optional(),
});

export const saveWhatsAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => waSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("whatsapp_integration").update({
      ...data,
      connected_at: new Date().toISOString(),
    }).eq("id", 1);
    return { ok: true };
  });

export const getWhatsAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("whatsapp_integration").select("*").eq("id", 1).maybeSingle();
    return data;
  });

// ---- Campaign brand map ----
export const listCampaignMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("campaign_brand_map").select("*, brands(name, color)").order("created_at", { ascending: false });
    return data ?? [];
  });

// Campaigns seen in ad_spend_daily that have no brand mapping yet.
// Lets admins attribute pure-traffic / awareness campaigns (no leads) to a brand.
export const listUnmappedCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // "Our" ad accounts = those that already have at least one campaign attributed to a brand
    // (either through leads or through a manual campaign_brand_map row). Everything else is a
    // client/other cabinet we don't want to show here.
    const [{ data: mappedSpend }, { data: cbm }] = await Promise.all([
      context.supabase.from("ad_spend_daily").select("meta_account_id").not("brand_id", "is", null),
      context.supabase.from("campaign_brand_map").select("meta_account_id"),
    ]);
    const ourAccounts = new Set<string>();
    for (const r of mappedSpend ?? []) if (r.meta_account_id) ourAccounts.add(r.meta_account_id);
    for (const r of cbm ?? []) if (r.meta_account_id) ourAccounts.add(r.meta_account_id);

    if (ourAccounts.size === 0) return [];

    const { data } = await context.supabase.from("ad_spend_daily")
      .select("campaign_id, campaign_name, meta_account_id, spend_usd")
      .is("brand_id", null)
      .in("meta_account_id", Array.from(ourAccounts))
      .gte("date", since);

    const map = new Map<string, { campaign_id: string; campaign_name: string; meta_account_id: string; spend_usd: number }>();
    for (const r of data ?? []) {
      const key = r.campaign_id;
      const prev = map.get(key);
      if (prev) {
        prev.spend_usd += Number(r.spend_usd);
        if (!prev.campaign_name && r.campaign_name) prev.campaign_name = r.campaign_name;
      } else {
        map.set(key, {
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name ?? "",
          meta_account_id: r.meta_account_id,
          spend_usd: Number(r.spend_usd),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.spend_usd - a.spend_usd);
  });

export const upsertCampaignMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    meta_account_id: z.string().min(1),
    campaign_id: z.string().min(1),
    campaign_name: z.string().optional(),
    brand_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("campaign_brand_map")
      .upsert(data, { onConflict: "meta_account_id,campaign_id" });
    if (error) throw new Error(error.message);
    // Backfill existing spend rows so the dashboard reflects this immediately.
    await context.supabase.from("ad_spend_daily")
      .update({ brand_id: data.brand_id })
      .eq("campaign_id", data.campaign_id);
    return { ok: true };
  });

export const deleteCampaignMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("campaign_brand_map").delete().eq("id", data.id);
    return { ok: true };
  });

// ---- Brands ----
export const upsertBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    code: z.string().min(1).max(30),
    name: z.string().min(1).max(80),
    color: z.string().min(3),
    sort_order: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id) {
      await context.supabase.from("brands").update(data).eq("id", data.id);
    } else {
      await context.supabase.from("brands").insert({
        code: data.code, name: data.name, color: data.color, sort_order: data.sort_order ?? 99,
      });
    }
    return { ok: true };
  });
