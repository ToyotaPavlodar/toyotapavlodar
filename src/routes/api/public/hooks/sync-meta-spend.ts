import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// Cron: sync Meta ad spend for the last 7 days across all configured ad accounts.
export const Route = createFileRoute("/api/public/hooks/sync-meta-spend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("cron not configured", { status: 500 });
        const header = request.headers.get("authorization") ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        const a = Buffer.from(token);
        const b = Buffer.from(secret);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("unauthorized", { status: 401 });
        }
        const { syncMetaSpendRange } = await import("@/lib/meta-sync.server");
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        const res = await syncMetaSpendRange(from, to);
        return Response.json({ ok: !res.error, ...res });
      },
    },
  },
});
