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

const NAME_RE =
  /(full[_\s-]?name|first[_\s-]?name|last[_\s-]?name|^name$|полное[_\s-]?имя|ваше[_\s-]?имя|фамилия|имя|аты|тегі)/i;
const PHONE_RE = /(phone|номер|телефон|тел|whats|ұялы|нөмір)/i;
const CITY_RE = /(city|город|қала|населённ|населен)/i;
const INTEREST_RE =
  /(model|vehicle|interest|модель|марка|интересует|комплектац|авто|подбор|услуг|что[_\s-]?вас)/i;
const IGNORE_RE = /(inbox_url|lead_id|^id$|utm|consent|соглас)/i;

const cleanPhone = (v: string) => v.replace(/[^\d+]/g, "");
const looksLikePhone = (v: string) => cleanPhone(v).replace(/\D/g, "").length >= 9;
const prettify = (v: string) => v.replace(/_/g, " ").trim();

/**
 * Парсит поля формы Meta. Сначала применяется ручной маппинг (field_map),
 * затем незаполненные поля определяются эвристикой по названию поля и значению —
 * иначе лиды с формами на русском/казахском приходят без имени и телефона.
 */
export function parseMetaLeadFields(
  fieldData: FieldRow[] | undefined,
  fieldMap?: Record<string, LeadFieldTarget>,
): ParsedMetaLeadFields {
  let name: string | null = null;
  let phone: string | null = null;
  let interest: string | null = null;
  let city: string | null = null;
  const commentParts: string[] = [];
  const nameParts: string[] = [];

  const rows = (fieldData ?? []).filter(
    (f) => (f.values?.[0] ?? "") !== "" && !IGNORE_RE.test(f.name),
  );

  // 1) Ручной маппинг — приоритет.
  const handled = new Set<FieldRow>();
  if (fieldMap && Object.keys(fieldMap).length > 0) {
    for (const f of rows) {
      const target = fieldMap[f.name];
      if (!target) continue;
      handled.add(f);
      const v = f.values[0]!;
      if (target === "ignore") continue;
      if (target === "name") name = v;
      else if (target === "phone") phone = cleanPhone(v);
      else if (target === "interest") interest = v;
      else if (target === "city") city = v;
      else if (target === "comment") commentParts.push(`${prettify(f.name)}: ${prettify(v)}`);
    }
  }

  // 2) Эвристика по названию поля.
  for (const f of rows) {
    if (handled.has(f)) continue;
    const key = f.name.toLowerCase();
    const v = f.values[0]!;
    if (!phone && (PHONE_RE.test(key) || looksLikePhone(v))) {
      phone = cleanPhone(v);
      handled.add(f);
    } else if (NAME_RE.test(key)) {
      nameParts.push(v.trim());
      handled.add(f);
    } else if (!city && CITY_RE.test(key)) {
      city = v;
      handled.add(f);
    } else if (!interest && INTEREST_RE.test(key)) {
      interest = prettify(v);
      handled.add(f);
    }
  }
  if (!name && nameParts.length > 0) name = nameParts.join(" ").trim() || null;

  // 3) Остальное — в комментарий, чтобы данные не пропадали.
  for (const f of rows) {
    if (handled.has(f)) continue;
    commentParts.push(`${prettify(f.name)}: ${prettify(f.values[0]!)}`);
  }

  return {
    name,
    phone: phone || null,
    interest,
    city,
    comment: commentParts.length > 0 ? commentParts.join("\n") : null,
  };
}
