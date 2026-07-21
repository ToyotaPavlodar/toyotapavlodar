/** Внутренний домен для Supabase Auth (пользователь вводит только логин). */
export const AUTH_LOGIN_DOMAIN = "crm.toyotapavlodar.internal";

const LOGIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}$/;

export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLogin(login: string): boolean {
  return LOGIN_RE.test(login);
}

export function loginToAuthEmail(login: string): string {
  return `${normalizeLogin(login)}@${AUTH_LOGIN_DOMAIN}`;
}

/** Логин или legacy email → email для signInWithPassword. */
export function resolveAuthEmail(loginOrEmail: string): string {
  const v = loginOrEmail.trim();
  if (v.includes("@")) return v;
  return loginToAuthEmail(v);
}

/** Показать пользователю: login или часть email до @. */
export function displayLoginFromProfile(login: string | null | undefined, email: string | null | undefined): string {
  if (login?.trim()) return login.trim();
  if (email?.includes("@")) {
    const local = email.split("@")[0] ?? email;
    if (local && !email.endsWith(`@${AUTH_LOGIN_DOMAIN}`)) return email;
    return local;
  }
  return email ?? "—";
}
