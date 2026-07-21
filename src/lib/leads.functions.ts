import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

const EDIT_ROLES = new Set(["admin", "manager", "operator"]);

async function assertCanEditLeads(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r) => EDIT_ROLES.has(r.role))) {
    throw new Error("Недостаточно прав для изменения лидов");
  }
}

async function updateLeadRow(id: string, patch: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Не удалось сохранить: лид не найден");
  return { ok: true as const };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    called: z.boolean().nullable().optional(),
    event_created: z.boolean().nullable().optional(),
    qualified: z.boolean().nullable().optional(),
    sent_to_1c: z.boolean().optional(),
    comment: z.string().max(2000).nullable().optional(),
    brand_id: z.string().uuid().nullable().optional(),
    name: z.string().max(200).nullable().optional(),
    interest: z.string().max(500).nullable().optional(),
    city: z.string().max(200).nullable().optional(),
  }),
});

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanEditLeads(context);

    const patch = { ...data.patch };
    if (patch.called === true || patch.qualified === true) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("leads")
        .select("event_created, called")
        .eq("id", data.id)
        .maybeSingle();
      if (patch.called === true) {
        const finalEvent = patch.event_created !== undefined ? patch.event_created : row?.event_created;
        if (finalEvent !== true) {
          throw new Error("Нельзя ставить «Дозвон» без «Событие».");
        }
      }
      if (patch.qualified === true) {
        const finalCalled = patch.called !== undefined ? patch.called : row?.called;
        if (finalCalled !== true) {
          throw new Error("Нельзя ставить «Квал» без «Дозвон = да».");
        }
      }
    }

    return updateLeadRow(data.id, patch);
  });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(3).max(30),
  interest: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  brand_id: z.string().uuid().optional(),
  comment: z.string().max(2000).optional(),
});

export const createManualLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanEditLeads(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("leads")
      .insert({ ...data, source: "manual" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const exportLeadsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    from: z.string(),
    to: z.string(),
    brand_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("leads")
      .select("created_at, name, phone, interest, city, brand_id, source, event_created, called, qualified, sent_to_1c, comment, brands(name)")
      .gte("created_at", data.from).lt("created_at", data.to)
      .order("created_at", { ascending: false });
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const header = ["Дата","Имя","Телефон","Интерес","Город","Бренд","Источник","Событие","Дозвон","Квал","В 1С","Комментарий"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const boolLabel = (v: boolean | null | undefined) =>
      v === true ? "Да" : v === false ? "Нет" : "—";
    const lines = [header.join(";")];
    // Оборачиваем телефон в ="..." чтобы Excel не превратил +7... в дату/число.
    const phoneCell = (v: unknown) => (v ? `="${String(v).replace(/"/g, '""')}"` : "");
    for (const r of rows ?? []) {
      lines.push([
        r.created_at, r.name, phoneCell(r.phone), r.interest, r.city,
        (r as { brands?: { name?: string } | null }).brands?.name ?? "",
        r.source, boolLabel(r.event_created), boolLabel(r.called), boolLabel(r.qualified),
        r.sent_to_1c ? "Да" : "Нет", r.comment ?? "",
      ].map((v, i) => (i === 2 ? String(v) : escape(v))).join(";"));
    }
    return { csv: "\uFEFF" + lines.join("\n") };
  });
