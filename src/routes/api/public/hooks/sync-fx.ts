import { createFileRoute } from "@tanstack/react-router";

// Fetches latest USD/KZT from National Bank of Kazakhstan.
// Called by pg_cron with the Supabase anon key in the `apikey` header
// (auth is bypassed on /api/public/*); no additional secret is required.
export const Route = createFileRoute("/api/public/hooks/sync-fx")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const dd = String(now.getUTCDate()).padStart(2, "0");
        const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = now.getUTCFullYear();
        const url = `https://nationalbank.kz/rss/get_rates.cfm?fdate=${dd}.${mm}.${yyyy}`;
        let usdKzt: number | null = null;
        try {
          const res = await fetch(url);
          const xml = await res.text();
          const usdBlock = xml.match(/<item>[\s\S]*?<title>USD<\/title>[\s\S]*?<description>([\d.,]+)<\/description>[\s\S]*?<\/item>/);
          if (usdBlock) usdKzt = Number(usdBlock[1].replace(",", "."));
        } catch (e) {
          console.error("fx fetch error", e);
        }
        if (!usdKzt || !isFinite(usdKzt)) {
          await supabaseAdmin.from("sync_log").insert({ kind: "fx", status: "error", message: "no rate parsed" });
          return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "content-type": "application/json" } });
        }
        const date = `${yyyy}-${mm}-${dd}`;
        await supabaseAdmin.from("fx_rates").upsert({ date, usd_kzt: usdKzt, source: "nbrk" }, { onConflict: "date" });
        await supabaseAdmin.from("sync_log").insert({ kind: "fx", status: "ok", message: `USD/KZT ${usdKzt}`, meta: { date, usd_kzt: usdKzt } });
        return Response.json({ ok: true, date, usd_kzt: usdKzt });
      },
    },
  },
});
