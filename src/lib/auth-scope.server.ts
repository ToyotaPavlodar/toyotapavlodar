import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UserScope = {
  userId: string;
  roles: string[];
  isAdmin: boolean;
  brandId: string | null;
  brandName: string | null;
  login: string | null;
  canSeeAllBrands: boolean;
  /** Если пользователь — ответственный из справочника */
  assigneeId: string | null;
  assigneeName: string | null;
};

export async function getUserScope(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserScope> {
  const [{ data: roleRows }, { data: profile }, { data: assignee }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("profiles")
      .select("brand_id, login, brands(name)")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("lead_assignees")
      .select("id, name, brand_id, brands(name)")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role);
  const isAdmin = roles.includes("admin");

  // Бренд: у assignee всегда из справочника; иначе из профиля; админ — всё.
  let brandId: string | null = null;
  let brandName: string | null = null;
  if (isAdmin) {
    brandId = null;
    brandName = null;
  } else if (assignee?.brand_id) {
    brandId = assignee.brand_id;
    brandName =
      assignee.brands && typeof assignee.brands === "object" && "name" in assignee.brands
        ? String((assignee.brands as { name: string }).name)
        : null;
  } else {
    brandId = profile?.brand_id ?? null;
    brandName =
      profile?.brands && typeof profile.brands === "object" && "name" in profile.brands
        ? String((profile.brands as { name: string }).name)
        : null;
  }

  return {
    userId,
    roles,
    isAdmin,
    brandId,
    brandName,
    login: profile?.login ?? null,
    canSeeAllBrands: isAdmin || (!assignee && brandId === null),
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
  };
}

export function assertBrandAccess(scope: UserScope, brandId: string | null | undefined): void {
  if (scope.canSeeAllBrands) return;
  if (!brandId || brandId !== scope.brandId) {
    throw new Error("Нет доступа к этому бренду");
  }
}
