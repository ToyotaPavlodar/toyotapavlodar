/** Публичные реквизиты для юридических страниц (Meta App, политики). */
export const LEGAL_SITE = {
  companyName: "Тойота Центр Павлодар",
  legalEntity: "официальный дилер Toyota, Lexus (Автодом Павлодар)",
  city: "г. Павлодар, Республика Казахстан",
  address: "проезд «И», дом 1/5",
  email: "info@toyota-pavlodar.kz",
  phone: "+7 (7182) 33-34-44",
  phoneHref: "tel:+77182333444",
  lastUpdated: "6 июля 2026 г.",
} as const;

export const LEGAL_LINKS = [
  { to: "/privacy" as const, label: "Политика конфиденциальности" },
  { to: "/terms" as const, label: "Пользовательское соглашение" },
  { to: "/data-deletion" as const, label: "Удаление данных" },
] as const;
