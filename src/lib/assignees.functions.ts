import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isValidLogin, loginToAuthEmail, normalizeLogin } from "@/lib/auth-login";
import { getUserScope } from "@/lib/auth-scope.server";

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
  user_id: string | null;
  login: string | null;
  has_login: boolean;
};

function mapAssigneeRows(
  rows: Array<{
    id: string;
    name: string;
    brand_id: string;
    is_active: boolean;
    sort_order: number;
    user_id: string | null;
    brands: { name: string; color: string } | null;
    profiles: { login: string | null; email: string | null } | null;
  }>,
): LeadAssigneeRow[] {
  return rows.map((r) => {
    let login = r.profiles?.login ?? null;
    if (!login && r.profiles?.email?.includes("@")) {
      login = r.profiles.email.split("@")[0] ?? null;
    }
    return {
      id: r.id,
      name: r.name,
      brand_id: r.brand_id,
      brand_name: r.brands?.name ?? "—",
      brand_color: r.brands?.color ?? "#888",
      is_active: r.is_active,
      sort_order: r.sort_order,
      user_id: r.user_id,
      login,
      has_login: !!r.user_id,
    };
  });
}

const SELECT_FIELDS =
  "id, name, brand_id, is_active, sort_order, user_id, brands(name, color), profiles(login, email)";

const USER_ID_HINT =
  "В Supabase выполните SQL из файла supabase/SQL_RUN_assignee_login.sql (колонка lead_assignees.user_id).";

function friendlyDbError(message: string): string {
  if (/user_id|column .* does not exist/i.test(message)) {
    return `${message} — ${USER_ID_HINT}`;
  }
  return message;
}

/** Список для страницы лидов — активные, с учётом brand scope. */
export const listAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await getUserScope(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("lead_assignees")
      .select(SELECT_FIELDS)
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    if (!scope.canSeeAllBrands && scope.brandId) {
      q = q.eq("brand_id", scope.brandId);
    }
    const { data, error } = await q;
    if (error) throw new Error(friendlyDbError(error.message));
    return mapAssigneeRows((data ?? []) as Parameters<typeof mapAssigneeRows>[0]);
  });

/** Полный список для настроек (включая неактивных). */
export const listAssigneesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lead_assignees")
      .select(SELECT_FIELDS)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(friendlyDbError(error.message));
    return mapAssigneeRows((data ?? []) as Parameters<typeof mapAssigneeRows>[0]);
  });

async function ensureUniqueLogin(
  supabaseAdmin: SupabaseClient<Database>,
  login: string,
  exceptUserId?: string,
) {
  let q = supabaseAdmin.from("profiles").select("id").ilike("login", login);
  if (exceptUserId) q = q.neq("id", exceptUserId);
  const { data: dup } = await q.maybeSingle();
  if (dup) throw new Error("Такой логин уже занят");
}

async function writeProfileCredentials(
  supabaseAdmin: SupabaseClient<Database>,
  uid: string,
  opts: { login: string; authEmail: string; full_name: string; brand_id: string },
) {
  const { error } = await supabaseAdmin.from("profiles").upsert({
    id: uid,
    email: opts.authEmail,
    login: opts.login,
    full_name: opts.full_name,
    brand_id: opts.brand_id,
    dashboard_access: true,
  });
  if (error) throw new Error(`Профиль не сохранён: ${error.message}`);

  const { data: check } = await supabaseAdmin
    .from("profiles")
    .select("login")
    .eq("id", uid)
    .maybeSingle();
  if (!check?.login || check.login.toLowerCase() !== opts.login) {
    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({
        login: opts.login,
        email: opts.authEmail,
        full_name: opts.full_name,
        brand_id: opts.brand_id,
        dashboard_access: true,
      })
      .eq("id", uid);
    if (updErr) throw new Error(`Профиль login не обновлён: ${updErr.message}`);
  }
}

async function ensureManagerRole(supabaseAdmin: SupabaseClient<Database>, uid: string) {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid);
  if (!roles?.some((r) => r.role === "manager" || r.role === "admin")) {
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "manager" });
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(`Роль не назначена: ${error.message}`);
    }
  }
}

async function createAssigneeAuthUser(
  supabaseAdmin: SupabaseClient<Database>,
  opts: { login: string; password: string; full_name: string; brand_id: string },
): Promise<string> {
  await ensureUniqueLogin(supabaseAdmin, opts.login);
  const authEmail = loginToAuthEmail(opts.login);

  // Если Auth-пользователь уже есть (обломок прошлой попытки) — обновляем пароль.
  const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = listed?.users?.find((u) => u.email?.toLowerCase() === authEmail.toLowerCase());
  if (existing) {
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: opts.password,
      email_confirm: true,
      user_metadata: { full_name: opts.full_name, login: opts.login },
    });
    if (updErr) throw new Error(updErr.message);
    await writeProfileCredentials(supabaseAdmin, existing.id, {
      login: opts.login,
      authEmail,
      full_name: opts.full_name,
      brand_id: opts.brand_id,
    });
    await ensureManagerRole(supabaseAdmin, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password: opts.password,
    email_confirm: true,
    user_metadata: { full_name: opts.full_name, login: opts.login },
  });
  if (error || !created.user) throw new Error(error?.message || "Не удалось создать пользователя");
  const uid = created.user.id;

  try {
    await writeProfileCredentials(supabaseAdmin, uid, {
      login: opts.login,
      authEmail,
      full_name: opts.full_name,
      brand_id: opts.brand_id,
    });
    await ensureManagerRole(supabaseAdmin, uid);
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => undefined);
    throw err;
  }
  return uid;
}

export const createAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120),
        brand_id: z.string().uuid(),
        login: z.string().trim().min(3).max(40),
        password: z.string().min(8).max(128),
      })
      .parse(d);
    const login = normalizeLogin(parsed.login);
    if (!isValidLogin(login)) {
      throw new Error("Логин: 3–40 символов, латиница, цифры, _ . -");
    }
    return { ...parsed, login };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = await createAssigneeAuthUser(supabaseAdmin, {
      login: data.login,
      password: data.password,
      full_name: data.name.trim(),
      brand_id: data.brand_id,
    });
    const { data: row, error } = await supabaseAdmin
      .from("lead_assignees")
      .insert({
        name: data.name.trim(),
        brand_id: data.brand_id,
        user_id: uid,
      })
      .select("id")
      .single();
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => undefined);
      throw new Error(friendlyDbError(error.message));
    }
    return {
      id: row.id,
      user_id: uid,
      login: data.login,
      password_once: data.password,
    };
  });

export const updateAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        brand_id: z.string().uuid().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: loadErr } = await supabaseAdmin
      .from("lead_assignees")
      .select("id, user_id, name, brand_id")
      .eq("id", id)
      .single();
    if (loadErr || !existing) throw new Error(loadErr?.message || "Не найден");

    const { error } = await supabaseAdmin.from("lead_assignees").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    if (existing.user_id) {
      const profilePatch: { full_name?: string; brand_id?: string } = {};
      if (patch.name) profilePatch.full_name = patch.name;
      if (patch.brand_id) profilePatch.brand_id = patch.brand_id;
      if (Object.keys(profilePatch).length > 0) {
        await supabaseAdmin.from("profiles").update(profilePatch).eq("id", existing.user_id);
      }
    }
    return { ok: true as const };
  });

/** Выдать / сменить логин и пароль существующему ответственному. */
export const setAssigneeCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = z
      .object({
        id: z.string().uuid(),
        login: z.string().trim().min(3).max(40),
        password: z.string().min(8).max(128),
      })
      .parse(d);
    const login = normalizeLogin(parsed.login);
    if (!isValidLogin(login)) {
      throw new Error("Логин: 3–40 символов, латиница, цифры, _ . -");
    }
    return { ...parsed, login };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("lead_assignees")
      .select("id, name, brand_id, user_id")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(friendlyDbError(error?.message || "Не найден"));

    if (row.user_id) {
      await ensureUniqueLogin(supabaseAdmin, data.login, row.user_id);
      const authEmail = loginToAuthEmail(data.login);
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
        email: authEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: row.name, login: data.login },
      });
      if (updErr) throw new Error(updErr.message);
      await writeProfileCredentials(supabaseAdmin, row.user_id, {
        login: data.login,
        authEmail,
        full_name: row.name,
        brand_id: row.brand_id,
      });
      await ensureManagerRole(supabaseAdmin, row.user_id);
      return {
        ok: true as const,
        user_id: row.user_id,
        login: data.login,
        password_once: data.password,
      };
    }

    const uid = await createAssigneeAuthUser(supabaseAdmin, {
      login: data.login,
      password: data.password,
      full_name: row.name,
      brand_id: row.brand_id,
    });
    const { error: linkErr } = await supabaseAdmin
      .from("lead_assignees")
      .update({ user_id: uid })
      .eq("id", row.id);
    if (linkErr) {
      throw new Error(friendlyDbError(linkErr.message));
    }
    return {
      ok: true as const,
      user_id: uid,
      login: data.login,
      password_once: data.password,
    };
  });

export const deleteAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("lead_assignees")
      .select("user_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("lead_assignees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(row.user_id).catch(() => undefined);
    }
    return { ok: true as const };
  });
