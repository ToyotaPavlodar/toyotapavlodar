import { createFileRoute } from "@tanstack/react-router";

// Cron: sync Meta ad spend for the last 3 days (to catch late attributions)
// and backfill Lead Ads for the last 2 days as a safety net in case the
// realtime webhook missed anything. Called by pg_cron with the Supabase
// anon key in the `apikey` header; /api/public/* bypasses edge auth.
export const Route = createFileRoute("/api/public/hooks/sync-meta-spend")({
  server: {
    handlers: {
      POST: async () => {
        const { syncMetaSpendRange, syncMetaLeadsRange } = await import("@/lib/meta-sync.server");
        const to = new Date();
        const spendFrom = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);
        const leadsFrom = new Date(to.getTime() - 2 * 24 * 60 * 60 * 1000);
        const [spend, leads] = await Promise.all([
          syncMetaSpendRange(spendFrom, to),
          syncMetaLeadsRange(leadsFrom, to),
        ]);
        return Response.json({
          ok: !spend.error,
          spend_rows: spend.rows,
          spend_error: spend.error ?? null,
          leads_rows: leads.rows,
          leads_errors: leads.errors,
        });
      },
    },
  },
});
