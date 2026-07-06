import { createFileRoute } from "@tanstack/react-router";

// Cron: sync Meta ad spend for the last 3 days (to catch late attributions)
// and backfill Lead Ads for the last 7 days as a safety net in case the
// realtime webhook missed anything. Triggered by Vercel Cron (GET) every 10 min.
async function runMetaSync() {
  const { syncMetaSpendRange, syncMetaLeadsRange } = await import("@/lib/meta-sync.server");
  const to = new Date();
  const spendFrom = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);
  const leadsFrom = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [spend, leads] = await Promise.all([
    syncMetaSpendRange(spendFrom, to),
    syncMetaLeadsRange(leadsFrom, to),
  ]);
  return {
    ok: !spend.error,
    spend_rows: spend.rows,
    spend_error: spend.error ?? null,
    leads_rows: leads.rows,
    leads_errors: leads.errors,
  };
}

export const Route = createFileRoute("/api/public/hooks/sync-meta-spend")({
  server: {
    handlers: {
      GET: async () => Response.json(await runMetaSync()),
      POST: async () => Response.json(await runMetaSync()),
    },
  },
});
