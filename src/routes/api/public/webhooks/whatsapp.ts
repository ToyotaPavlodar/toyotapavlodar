import { createFileRoute } from "@tanstack/react-router";

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
        const body = await request.json() as {
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

              // Only create if this is a new conversation (not existing lead by this phone recently)
              const { data: existing } = await supabaseAdmin.from("leads")
                .select("id").eq("source", "whatsapp").eq("source_ref", sourceRef).maybeSingle();
              if (existing) continue;

              // Try match brand via ctwa referral source_url → campaign map (best effort)
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
