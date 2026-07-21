import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

/** Row payload from Meta Lead Ads webhook / sync. */
export type MetaLeadUpsert = {
  source: string;
  source_ref: string;
  name: string | null;
  phone: string | null;
  interest: string | null;
  city: string | null;
  /** From Meta form only — never overwrites CRM comment on update. */
  comment: string | null;
  brand_id: string | null;
  meta_form_id?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  raw_payload?: Json;
  created_at?: string;
};

/**
 * Insert new Meta lead or refresh Meta fields on existing row.
 * CRM comment is set only on INSERT — sync must not wipe operator notes.
 */
export async function upsertMetaLeadPreservingComment(row: MetaLeadUpsert): Promise<{ error: string | null }> {
  const { comment, ...fields } = row;
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("source", row.source)
    .eq("source_ref", row.source_ref)
    .maybeSingle();
  if (readErr) return { error: readErr.message };

  if (existing) {
    const { error } = await supabaseAdmin.from("leads").update(fields).eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabaseAdmin.from("leads").insert({ ...fields, comment });
  return { error: error?.message ?? null };
}
