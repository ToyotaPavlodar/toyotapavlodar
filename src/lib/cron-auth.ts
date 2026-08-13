/**
 * Защита публичных cron/hook эндпоинтов.
 *
 * Принимает `Authorization: Bearer <secret>` или `?key=<secret>`, где secret —
 * либо переменная окружения CRON_SECRET, либо внутренний токен из таблицы
 * public.cron_secret (её использует pg_cron, поэтому значение не нужно
 * дублировать в окружении). Если ни один секрет недоступен — fail-closed.
 */
export async function assertCronSecret(request: Request): Promise<Response | null> {
  const envSecret = process.env.CRON_SECRET;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const provided = bearer || key;

  if (!provided) return new Response("unauthorized", { status: 401 });
  if (envSecret && provided === envSecret) return null;

  let dbSecret: string | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("cron_secret").select("token").eq("id", 1).maybeSingle();
    dbSecret = data?.token ?? null;
  } catch {
    dbSecret = null;
  }

  if (!envSecret && !dbSecret) return new Response("cron not configured", { status: 500 });
  if (dbSecret && provided === dbSecret) return null;
  return new Response("unauthorized", { status: 401 });
}
