import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfMonth, endOfMonth } from "date-fns";

async function assertAdmin(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!data?.some((r) => r.role === "admin")) throw new Error("Только для администратора");
}

// Pulls Meta ad spend + Lead Ads leads for a given YYYY-MM into the database.
export const syncMetaMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { syncMetaSpendRange, syncMetaLeadsRange } = await import("@/lib/meta-sync.server");

    const monthDate = new Date(data.month + "-01T00:00:00Z");
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);
    // Include the last day fully for the leads window
    const leadsTo = new Date(to.getTime() + 24 * 60 * 60 * 1000);

    // Leads first — they populate campaign_brand_map so spend rows can be mapped to a brand.
    const leads = await syncMetaLeadsRange(from, leadsTo);
    const spend = await syncMetaSpendRange(from, to);

    return {
      month: data.month,
      spend_rows: spend.rows,
      spend_error: spend.error ?? null,
      leads_rows: leads.rows,
      leads_errors: leads.errors,
    };
  });
