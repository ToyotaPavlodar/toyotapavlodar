import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const updateSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    called: z.boolean().nullable().optional(),
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
    // Enforce: cannot set qualified=true if called!=true
    const patch = { ...data.patch };
    if (patch.qualified === true) {
      const { data: row } = await context.supabase
        .from("leads").select("called").eq("id", data.id).maybeSingle();
      const finalCalled = patch.called !== undefined ? patch.called : row?.called;
      if (finalCalled !== true) {
        throw new Error("Нельзя ставить «Квал» без «Дозвон = да».");
      }
    }
    const { error } = await context.supabase
      .from("leads").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({ ...data, source: "manual" })
      .select("id").single();
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
      .select("created_at, name, phone, interest, city, brand_id, source, called, qualified, sent_to_1c, comment, brands(name)")
      .gte("created_at", data.from).lt("created_at", data.to)
      .order("created_at", { ascending: false });
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const header = ["Дата","Имя","Телефон","Интерес","Город","Бренд","Источник","Дозвон","Квал","В 1С","Комментарий"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const boolLabel = (v: boolean | null | undefined) =>
      v === true ? "Да" : v === false ? "Нет" : "—";
    const lines = [header.join(";")];
    for (const r of rows ?? []) {
      lines.push([
        r.created_at, r.name, r.phone, r.interest, r.city,
        (r as { brands?: { name?: string } | null }).brands?.name ?? "",
        r.source, boolLabel(r.called), boolLabel(r.qualified),
        r.sent_to_1c ? "Да" : "Нет", r.comment ?? "",
      ].map(escape).join(";"));
    }
    return { csv: "\uFEFF" + lines.join("\n") };
  });
