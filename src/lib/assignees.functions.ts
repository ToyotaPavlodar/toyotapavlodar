import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function assertAdmin(context: AuthContext) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!data?.some((r) => r.role === "admin")) throw new Error("Только для администратора");
}

export type LeadAssigneeRow = {
  id: string;
  name: string;
  brand_id: string;
  brand_name: string;
  brand_color: string;
  is_active: boolean;
  sort_order: number;
};

function mapAssigneeRows(
  rows: Array<{
    id: string;
    name: string;
    brand_id: string;
    is_active: boolean;
    sort_order: number;
    brands: { name: string; color: string } | null;
  }>,
): LeadAssigneeRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand_id: r.brand_id,
    brand_name: r.brands?.name ?? "—",
    brand_color: r.brands?.color ?? "#888",
    is_active: r.is_active,
    sort_order: r.sort_order,
  }));
}

/** Список для страницы лидов — только активные. */
export const listAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lead_assignees")
      .select("id, name, brand_id, is_active, sort_order, brands(name, color)")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return mapAssigneeRows(data ?? []);
  });

/** Полный список для настроек (включая неактивных). */
export const listAssigneesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lead_assignees")
      .select("id, name, brand_id, is_active, sort_order, brands(name, color)")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return mapAssigneeRows(data ?? []);
  });

export const createAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      brand_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("lead_assignees")
      .insert({ name: data.name.trim(), brand_id: data.brand_id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120).optional(),
      brand_id: z.string().uuid().optional(),
      is_active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lead_assignees").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lead_assignees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
