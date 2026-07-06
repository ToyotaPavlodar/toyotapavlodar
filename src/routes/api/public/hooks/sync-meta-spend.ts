import { createFileRoute } from "@tanstack/react-router";

// Cron: sync Meta ad spend for the last 3 days (to catch late attributions)
// and backfill Lead Ads for the last 7 days as a safety net in case the
// realtime webhook missed anything. Triggered by Vercel Cron (GET) every 10 min.
async function runMetaSync() {
  const { syncMetaSpendRange, syncMetaLeadsRange, syncMetaMessagingMonth, subscribePagesToLeadgenWebhook } = await import("@/lib/meta-sync.server");
  const { monthKeyFromDate } = await import("@/lib/month-range");
  const to = new Date();
  const spendFrom = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);
  const leadsFrom = new Date(to.getTime() - 48 * 60 * 60 * 1000);
  const [webhook, spend, leads, messaging] = await Promise.all([
    subscribePagesToLeadgenWebhook(),
    syncMetaSpendRange(spendFrom, to),
    syncMetaLeadsRange(leadsFrom, to),
    syncMetaMessagingMonth(monthKeyFromDate(to)),
  ]);
  return {
    ok: !spend.error,
    webhook_subscribed: webhook.subscribed,
    webhook_errors: webhook.errors,
    spend_rows: spend.rows,
    spend_error: spend.error ?? null,
    leads_rows: leads.inserted ?? leads.rows,
    leads_skipped_test: leads.skipped_test ?? 0,
    leads_errors: leads.errors,
    messaging_rows: messaging.rows,
    messaging_error: messaging.error ?? null,
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
