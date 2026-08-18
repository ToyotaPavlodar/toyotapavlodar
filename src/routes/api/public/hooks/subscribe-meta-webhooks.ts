import { createFileRoute } from "@tanstack/react-router";
import { assertCronSecret } from "@/lib/cron-auth";

/** Подписать страницы Meta на leadgen + подтянуть лиды за 7 дней. Только для cron. */
async function run() {
  const { META_LEADS_BACKFILL_HOURS, subscribePagesToLeadgenWebhook, syncMetaLeadsRange } =
    await import("@/lib/meta-sync.server");
  const to = new Date();
  const from = new Date(to.getTime() - META_LEADS_BACKFILL_HOURS * 60 * 60 * 1000);
  const [webhook, leads] = await Promise.all([
    subscribePagesToLeadgenWebhook(),
    syncMetaLeadsRange(from, to),
  ]);
  return { ok: leads.errors.length === 0, webhook, leads };
}

export const Route = createFileRoute("/api/public/hooks/subscribe-meta-webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => (await assertCronSecret(request)) ?? Response.json(await run()),
      POST: async ({ request }) => (await assertCronSecret(request)) ?? Response.json(await run()),
    },
  },
});
