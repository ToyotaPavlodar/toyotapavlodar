import { createFileRoute } from "@tanstack/react-router";

// Cron: sync Meta ad spend for the last 7 days across all configured ad accounts.
export const Route = createFileRoute("/api/public/hooks/sync-meta-spend")({
  server: {
    handlers: {
      POST: async () => {
        const { syncMetaSpendRange } = await import("@/lib/meta-sync.server");
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        const res = await syncMetaSpendRange(from, to);
        return Response.json({ ok: !res.error, ...res });
      },
    },
  },
});
