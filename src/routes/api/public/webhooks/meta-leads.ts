import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { isMetaTestLead, parseMetaLeadFields } from "@/lib/meta-lead-parsing";

// Meta Lead Ads webhook
export const Route = createFileRoute("/api/public/webhooks/meta-leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (mode === "subscribe" && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) {
          return new Response("webhook not configured", { status: 500 });
        }
        const sig = request.headers.get("x-hub-signature-256");
        if (!sig?.startsWith("sha256=")) {
          return new Response("missing signature", { status: 401 });
        }
        const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
        const a = Buffer.from(sig); const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("bad signature", { status: 401 });
        }

        const body = JSON.parse(raw) as {
          entry?: Array<{ changes?: Array<{ value?: { leadgen_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; page_id?: string; created_time?: number } }> }>;
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: intg } = await supabaseAdmin.from("meta_integration").select("access_token, selected_forms").eq("id", 1).maybeSingle();
        const token = intg?.access_token;
        type SelectedForm = { form_id: string; brand_id: string | null; field_map?: Record<string, "ignore" | "name" | "phone" | "interest" | "city" | "comment"> };
        const selected = (intg?.selected_forms as SelectedForm[] | null) ?? [];
        const selectedMap = new Map(selected.map((s) => [s.form_id, s]));

        let saved = 0;
        let skippedTest = 0;
        let skippedForm = 0;
        let failed = 0;

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const leadgenId = change.value?.leadgen_id;
            const formId = change.value?.form_id;
            if (!leadgenId || !token) continue;
            const cfg = formId ? selectedMap.get(formId) : undefined;
            if (selected.length > 0 && !cfg) {
              skippedForm++;
              continue;
            }

            const leadRes = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${encodeURIComponent(token)}&fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id`);
            if (!leadRes.ok) {
              failed++;
              console.error("meta lead fetch failed", await leadRes.text());
              continue;
            }
            const lead = await leadRes.json() as {
              id: string; created_time: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string;
              field_data?: Array<{ name: string; values: string[] }>;
            };

            const fmap = cfg?.field_map;
            const parsed = parseMetaLeadFields(lead.field_data, fmap);
            if (isMetaTestLead(parsed)) {
              skippedTest++;
              continue;
            }

            let brandId: string | null = cfg?.brand_id ?? null;
            if (!brandId && lead.campaign_id) {
              const { data: cbm } = await supabaseAdmin
                .from("campaign_brand_map").select("brand_id").eq("campaign_id", lead.campaign_id).maybeSingle();
              brandId = cbm?.brand_id ?? null;
            }

            const { error } = await supabaseAdmin.from("leads").upsert({
              source: "meta_lead_form",
              source_ref: lead.id,
              name: parsed.name,
              phone: parsed.phone,
              interest: parsed.interest,
              city: parsed.city,
              comment: parsed.comment,
              brand_id: brandId,
              meta_form_id: lead.form_id,
              meta_campaign_id: lead.campaign_id,
              meta_adset_id: lead.adset_id,
              meta_ad_id: lead.ad_id,
              raw_payload: JSON.parse(JSON.stringify(lead)),
              created_at: lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString(),
            }, { onConflict: "source,source_ref" });
            if (error) {
              failed++;
              console.error("meta lead upsert", error.message);
            } else {
              saved++;
            }
          }
        }

        if (saved + skippedTest + skippedForm + failed > 0) {
          await supabaseAdmin.from("sync_log").insert({
            kind: "meta_leads_webhook",
            status: failed > 0 ? "partial" : "ok",
            message: `saved: ${saved}, skipped_test: ${skippedTest}, skipped_form: ${skippedForm}, failed: ${failed}`,
          });
        }

        return new Response("ok");
      },
    },
  },
});
