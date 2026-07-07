import { createFileRoute } from "@tanstack/react-router";
import { assertCronSecret } from "@/lib/cron-auth";

/** Подписать страницы Meta на leadgen + подтянуть лиды за 48 ч. Только для cron. */
async function run() {
  const { subscribePagesToLeadgenWebhook, syncMetaLeadsRange } = await import("@/lib/meta-sync.server");
  const to = new Date();
  const from = new Date(to.getTime() - 48 * 60 * 60 * 1000);
  const [webhook, leads] = await Promise.all([
    subscribePagesToLeadgenWebhook(),
    syncMetaLeadsRange(from, to),
  ]);
  return { ok: leads.errors.length === 0, webhook, leads };
}

export const Route = createFileRoute("/api/public/hooks/subscribe-meta-webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => assertCronSecret(request) ?? Response.json(await run()),
      POST: async ({ request }) => assertCronSecret(request) ?? Response.json(await run()),
    },
  },
});
