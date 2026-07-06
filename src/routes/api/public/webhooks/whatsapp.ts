import { createFileRoute } from "@tanstack/react-router";
import {
  chatIdToPhone,
  extractGreenApiMessageText,
  loadGreenApiConfig,
  type GreenApiNotification,
} from "@/lib/green-api.server";

/** Вебхук входящих сообщений WhatsApp через Green API. */
export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),

      POST: async ({ request }) => {
        const wa = await loadGreenApiConfig();
        const expectedToken = wa?.webhookUrlToken;
        if (expectedToken) {
          const auth = request.headers.get("authorization") ?? "";
          const provided = auth.replace(/^Bearer\s+/i, "").trim();
          if (provided !== expectedToken) {
            return new Response("forbidden", { status: 403 });
          }
        }

        const body = (await request.json().catch(() => null)) as GreenApiNotification | null;
        if (!body || body.typeWebhook !== "incomingMessageReceived") {
          return new Response("ok");
        }

        const chatId = body.senderData?.chatId ?? body.senderData?.sender ?? "";
        const phone = chatId ? chatIdToPhone(chatId) : null;
        if (!phone) return new Response("ok");

        const name = body.senderData?.senderContactName || body.senderData?.senderName || null;
        const text = extractGreenApiMessageText(body);
        const sourceRef = `wa:${phone}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("source", "whatsapp")
          .eq("source_ref", sourceRef)
          .maybeSingle();
        if (existing) return new Response("ok");

        await supabaseAdmin.from("leads").insert({
          source: "whatsapp",
          source_ref: sourceRef,
          name,
          phone,
          interest: text || null,
          brand_id: wa?.defaultBrandId ?? null,
          raw_payload: JSON.parse(JSON.stringify(body)),
          created_at: body.timestamp
            ? new Date(body.timestamp * 1000).toISOString()
            : new Date().toISOString(),
        });

        return new Response("ok");
      },
    },
  },
});
