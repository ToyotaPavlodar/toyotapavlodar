import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

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
        const sig = request.headers.get("x-hub-signature-256");
        if (appSecret && sig?.startsWith("sha256=")) {
          const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
          const a = Buffer.from(sig); const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("bad signature", { status: 401 });
          }
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

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const leadgenId = change.value?.leadgen_id;
            const formId = change.value?.form_id;
            if (!leadgenId || !token) continue;
            const cfg = formId ? selectedMap.get(formId) : undefined;
            if (selected.length > 0 && !cfg) continue;

            const leadRes = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${encodeURIComponent(token)}&fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id`);
            if (!leadRes.ok) { console.error("meta lead fetch failed", await leadRes.text()); continue; }
            const lead = await leadRes.json() as {
              id: string; created_time: string; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string;
              field_data?: Array<{ name: string; values: string[] }>;
            };

            // Apply explicit field_map when present; otherwise fall back to heuristics
            let name: string | null = null;
            let phone: string | null = null;
            let interest: string | null = null;
            let city: string | null = null;
            const commentParts: string[] = [];
            const fmap = cfg?.field_map;
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

            let brandId: string | null = cfg?.brand_id ?? null;
            if (!brandId && lead.campaign_id) {
              const { data: cbm } = await supabaseAdmin
                .from("campaign_brand_map").select("brand_id").eq("campaign_id", lead.campaign_id).maybeSingle();
              brandId = cbm?.brand_id ?? null;
            }

            await supabaseAdmin.from("leads").upsert({
              source: "meta_lead_form",
              source_ref: lead.id,
              name, phone, interest, city,
              comment: commentParts.length > 0 ? commentParts.join("\n") : null,
              brand_id: brandId,
              meta_form_id: lead.form_id,
              meta_campaign_id: lead.campaign_id,
              meta_adset_id: lead.adset_id,
              meta_ad_id: lead.ad_id,
              raw_payload: JSON.parse(JSON.stringify(lead)),
              created_at: lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString(),
            }, { onConflict: "source,source_ref" });
          }
        }

        return new Response("ok");
      },
    },
  },
});
