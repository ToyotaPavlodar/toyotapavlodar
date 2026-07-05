import { createFileRoute } from "@tanstack/react-router";

/**
 * Вебхук входящих сообщений WhatsApp через Green API.
 *
 * Green API POST-ит уведомления на этот URL. Нас интересует
 * typeWebhook === "incomingMessageReceived" — по нему создаём лид.
 *
 * Конфигурация берётся из таблицы whatsapp_integration:
 *   verify_token     = webhookUrlToken (необязательная авторизация)
 *   default_brand_id = бренд по умолчанию для входящих
 */
type GreenApiNotification = {
  typeWebhook?: string;
  idMessage?: string;
  timestamp?: number;
  senderData?: {
    chatId?: string;
    sender?: string;
    chatName?: string;
    senderName?: string;
    senderContactName?: string;
  };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string; title?: string; description?: string };
  };
};

function extractText(m: GreenApiNotification): string {
  return (
    m.messageData?.textMessageData?.textMessage ??
    m.messageData?.extendedTextMessageData?.text ??
    m.messageData?.extendedTextMessageData?.title ??
    ""
  );
}

function chatIdToPhone(chatId: string): string | null {
  // Групповые чаты (@g.us) игнорируем, обрабатываем только личные (@c.us)
  if (!chatId.endsWith("@c.us")) return null;
  const digits = chatId.replace(/@c\.us$/, "").replace(/\D/g, "");
  if (!digits) return null;
  return "+" + digits;
}

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      // Green API не требует проверочного GET-запроса — отвечаем для health-check.
      GET: async () => new Response("ok", { status: 200 }),

      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: wa } = await supabaseAdmin
          .from("whatsapp_integration")
          .select("default_brand_id, verify_token")
          .eq("id", 1)
          .maybeSingle();

        // Необязательная проверка токена вебхука (webhookUrlToken)
        const expectedToken = wa?.verify_token?.trim();
        if (expectedToken) {
          const auth = request.headers.get("authorization") ?? "";
          const provided = auth.replace(/^Bearer\s+/i, "").trim();
          if (provided !== expectedToken) {
            return new Response("forbidden", { status: 403 });
          }
        }

        const body = (await request.json().catch(() => null)) as GreenApiNotification | null;
        if (!body || body.typeWebhook !== "incomingMessageReceived") {
          // Прочие типы уведомлений (статусы, исходящие и т.п.) просто подтверждаем.
          return new Response("ok");
        }

        const chatId = body.senderData?.chatId ?? body.senderData?.sender ?? "";
        const phone = chatId ? chatIdToPhone(chatId) : null;
        if (!phone) return new Response("ok");

        const name = body.senderData?.senderContactName || body.senderData?.senderName || null;
        const text = extractText(body);
        const sourceRef = `wa:${phone}`;

        // Один лид на разговор: не дублируем, если уже есть по этому номеру
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
          brand_id: wa?.default_brand_id ?? null,
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
