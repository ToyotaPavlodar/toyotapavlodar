/** Meta Lead Ads — общая логика парсинга полей и фильтра тестовых заявок. */

export type LeadFieldTarget = "ignore" | "name" | "phone" | "interest" | "city" | "comment";

export type ParsedMetaLeadFields = {
  name: string | null;
  phone: string | null;
  interest: string | null;
  city: string | null;
  comment: string | null;
};

type FieldRow = { name: string; values: string[] };

export function isMetaTestLead(fields: Partial<ParsedMetaLeadFields>): boolean {
  const blob = [fields.name, fields.phone, fields.interest, fields.city, fields.comment]
    .filter(Boolean)
    .join(" ");
  return /<test\s*lead:/i.test(blob) || /dummy data for/i.test(blob);
}

export function parseMetaLeadFields(
  fieldData: FieldRow[] | undefined,
  fieldMap?: Record<string, LeadFieldTarget>,
): ParsedMetaLeadFields {
  let name: string | null = null;
  let phone: string | null = null;
  let interest: string | null = null;
  let city: string | null = null;
  const commentParts: string[] = [];

  if (fieldMap && Object.keys(fieldMap).length > 0) {
    for (const f of fieldData ?? []) {
      const target = fieldMap[f.name];
      const v = f.values?.[0] ?? "";
      if (!v || !target || target === "ignore") continue;
      if (target === "name") name = v;
      else if (target === "phone") phone = v.replace(/[^\d+]/g, "");
      else if (target === "interest") interest = v;
      else if (target === "city") city = v;
      else if (target === "comment") commentParts.push(`${f.name}: ${v}`);
    }
  } else {
    const map: Record<string, string> = {};
    for (const f of fieldData ?? []) map[f.name.toLowerCase()] = f.values?.[0] ?? "";
    name = map["full_name"] || map["name"] || `${map["first_name"] ?? ""} ${map["last_name"] ?? ""}`.trim() || null;
    phone = (map["phone_number"] || map["phone"] || "").replace(/[^\d+]/g, "") || null;
    interest = map["vehicle"] || map["model"] || map["car_model"] || map["interest"] || null;
    city = map["city"] || map["город"] || map["қала"] || null;
  }

  return {
    name,
    phone,
    interest,
    city,
    comment: commentParts.length > 0 ? commentParts.join("\n") : null,
  };
}
