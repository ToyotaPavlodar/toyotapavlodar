import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("whatsapp_integration").select("verify_token").eq("id", 1).maybeSingle();
        if (mode === "subscribe" && data?.verify_token && token === data.verify_token) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const appSecret = process.env.WHATSAPP_APP_SECRET;
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
          entry?: Array<{ changes?: Array<{ value?: {
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              text?: { body: string };
              type: string;
              referral?: { source_url?: string; source_id?: string; ctwa_clid?: string; headline?: string; body?: string };
            }>;
            contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
          } }> }>;
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: wa } = await supabaseAdmin.from("whatsapp_integration").select("default_brand_id").eq("id", 1).maybeSingle();
        const defaultBrand = wa?.default_brand_id ?? null;

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const messages = change.value?.messages ?? [];
            const contacts = change.value?.contacts ?? [];
            for (const m of messages) {
              const contact = contacts.find((c) => c.wa_id === m.from);
              const phone = m.from.startsWith("+") ? m.from : "+" + m.from;
              const text = m.text?.body ?? "";
              const name = contact?.profile?.name ?? null;
              const ctwa = m.referral?.ctwa_clid ?? null;
              const sourceRef = ctwa ?? `wa:${m.from}`;

              const { data: existing } = await supabaseAdmin.from("leads")
                .select("id").eq("source", "whatsapp").eq("source_ref", sourceRef).maybeSingle();
              if (existing) continue;

              const brandId = defaultBrand;

              await supabaseAdmin.from("leads").insert({
                source: "whatsapp",
                source_ref: sourceRef,
                name, phone,
                interest: text || m.referral?.headline || null,
                brand_id: brandId,
                ctwa_clid: ctwa,
                raw_payload: JSON.parse(JSON.stringify(m)),
                created_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
              });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
