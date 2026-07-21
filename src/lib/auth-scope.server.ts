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
};

export async function getUserScope(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserScope> {
  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("profiles")
      .select("brand_id, login, brands(name)")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role);
  const isAdmin = roles.includes("admin");
  const brandId = isAdmin ? null : (profile?.brand_id ?? null);
  const brandName =
    profile?.brands && typeof profile.brands === "object" && "name" in profile.brands
      ? String((profile.brands as { name: string }).name)
      : null;

  return {
    userId,
    roles,
    isAdmin,
    brandId,
    brandName,
    login: profile?.login ?? null,
    canSeeAllBrands: isAdmin || brandId === null,
  };
}

export function assertBrandAccess(scope: UserScope, brandId: string | null | undefined): void {
  if (scope.canSeeAllBrands) return;
  if (!brandId || brandId !== scope.brandId) {
    throw new Error("Нет доступа к этому бренду");
  }
}
