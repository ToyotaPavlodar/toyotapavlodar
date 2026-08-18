import { createFileRoute } from "@tanstack/react-router";
import { assertCronSecret } from "@/lib/cron-auth";

/** Быстрый подтяг лидов Meta за последние 7 дней. Только для cron. */
async function runLeadsSync() {
  const { META_LEADS_BACKFILL_HOURS, syncMetaLeadsRange } = await import("@/lib/meta-sync.server");
  const to = new Date();
  const from = new Date(to.getTime() - META_LEADS_BACKFILL_HOURS * 60 * 60 * 1000);
  const leads = await syncMetaLeadsRange(from, to);
  return {
    ok: leads.errors.length === 0,
    ...leads,
  };
}

export const Route = createFileRoute("/api/public/hooks/sync-meta-leads")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await assertCronSecret(request)) ?? Response.json(await runLeadsSync()),
      POST: async ({ request }) =>
        (await assertCronSecret(request)) ?? Response.json(await runLeadsSync()),
    },
  },
});
