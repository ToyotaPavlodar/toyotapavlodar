/**
 * Защита публичных cron/hook эндпоинтов.
 *
 * Проверяет заголовок `Authorization: Bearer <CRON_SECRET>` или `?key=<CRON_SECRET>`.
 * Если секрет не задан в окружении — запрос отклоняется (fail-closed),
 * чтобы никто не мог запустить дорогостоящую синхронизацию из внешки.
 */
export function assertCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("cron not configured", { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  if (bearer !== secret && key !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}
