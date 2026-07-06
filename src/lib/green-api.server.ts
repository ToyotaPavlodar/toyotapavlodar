/**
 * Green API — подготовка к подключению WhatsApp-лидов.
 * Сейчас: конфиг из Supabase + типы уведомлений.
 * Позже: registerWebhook(), sendMessage(), syncProfileName().
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { webhookUrl } from "@/lib/app-url";

export type GreenApiConfig = {
  idInstance: string;
  apiUrl: string;
  apiToken: string;
  webhookUrlToken: string | null;
  defaultBrandId: string | null;
  connectedAt: string | null;
};

export type GreenApiNotification = {
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

export function greenApiWebhookEndpoint(): string {
  return webhookUrl("/api/public/webhooks/whatsapp");
}

export function isGreenApiConfigured(cfg: GreenApiConfig | null): boolean {
  return Boolean(cfg?.idInstance && cfg?.apiUrl && cfg?.apiToken);
}

/** Загрузить конфиг Green API из whatsapp_integration (id=1). */
export async function loadGreenApiConfig(): Promise<GreenApiConfig | null> {
  const { data } = await supabaseAdmin
    .from("whatsapp_integration")
    .select("phone_number_id, waba_id, access_token, verify_token, default_brand_id, connected_at")
    .eq("id", 1)
    .maybeSingle();
  if (!data?.phone_number_id || !data.waba_id || !data.access_token) return null;
  return {
    idInstance: data.phone_number_id,
    apiUrl: data.waba_id.replace(/\/$/, ""),
    apiToken: data.access_token,
    webhookUrlToken: data.verify_token?.trim() || null,
    defaultBrandId: data.default_brand_id,
    connectedAt: data.connected_at,
  };
}

export function extractGreenApiMessageText(m: GreenApiNotification): string {
  return (
    m.messageData?.textMessageData?.textMessage ??
    m.messageData?.extendedTextMessageData?.text ??
    m.messageData?.extendedTextMessageData?.title ??
    ""
  );
}

/** Личный чат @c.us → E.164 телефон. Группы @g.us игнорируем. */
export function chatIdToPhone(chatId: string): string | null {
  if (!chatId.endsWith("@c.us")) return null;
  const digits = chatId.replace(/@c\.us$/, "").replace(/\D/g, "");
  if (!digits) return null;
  return "+" + digits;
}

/** Базовый URL REST API Green API для будущих вызовов. */
export function greenApiRestBase(cfg: GreenApiConfig): string {
  return `${cfg.apiUrl}/waInstance${cfg.idInstance}`;
}

/**
 * Зарегистрировать вебхук в Green API (вызвать после сохранения настроек в CRM).
 * POST /setSettings — см. docs.green-api.com
 */
export async function registerGreenApiWebhook(cfg: GreenApiConfig): Promise<{ ok: boolean; error?: string }> {
  const url = `${greenApiRestBase(cfg)}/setSettings/${cfg.apiToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl: greenApiWebhookEndpoint(),
      webhookUrlToken: cfg.webhookUrlToken ?? "",
      incomingWebhook: "yes",
      outgoingWebhook: "no",
      stateWebhook: "no",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 200) };
  }
  return { ok: true };
}
