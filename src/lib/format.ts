export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return "+7" + digits.slice(1);
  }
  if (digits.length === 10) return "+7" + digits;
  return "+" + digits;
}

export function formatKzt(v: number): string {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(v);
}
export function formatUsd(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}
export function formatPct(v: number): string {
  return `${v.toFixed(1)}%`;
}
