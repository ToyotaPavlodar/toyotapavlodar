/** Production URL for webhooks (Meta / Green API must point here, not preview). */
export const PRODUCTION_APP_URL = "https://toyotapavlodar.vercel.app";

/** Verify token for Meta Lead Ads webhook — set the same value in Meta Developer Console. */
export const META_WEBHOOK_VERIFY_TOKEN = "toyotapavlodar_meta_wh_2026";

export function webhookUrl(path: string): string {
  const base =
    typeof window !== "undefined" && window.location.hostname === "localhost"
      ? window.location.origin
      : PRODUCTION_APP_URL;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
