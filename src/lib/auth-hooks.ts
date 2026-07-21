import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { displayLoginFromProfile } from "@/lib/auth-login";

export type Role = "admin" | "marketer" | "manager" | "operator";

export interface SessionProfile {
  user: User;
  roles: Role[];
  dashboardAccess: boolean;
  fullName: string | null;
  login: string | null;
  brandId: string | null;
  brandName: string | null;
}

export function useSessionProfile() {
  const [state, setState] = useState<{
    loading: boolean;
    profile: SessionProfile | null;
  }>({ loading: true, profile: null });

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!userData.user) {
        setState({ loading: false, profile: null });
        return;
      }
      const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
        supabase
          .from("profiles")
          .select("dashboard_access, full_name, login, brand_id, brands(name)")
          .eq("id", userData.user.id)
          .maybeSingle(),
      ]);
      if (!mounted) return;
      const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
      const brandId = isAdmin ? null : (profileRow?.brand_id ?? null);
      const brandName =
        profileRow?.brands && typeof profileRow.brands === "object" && "name" in profileRow.brands
          ? String((profileRow.brands as { name: string }).name)
          : null;
      setState({
        loading: false,
        profile: {
          user: userData.user,
          roles: (roleRows?.map((r) => r.role) ?? []) as Role[],
          dashboardAccess: profileRow?.dashboard_access ?? false,
          fullName: profileRow?.full_name ?? null,
          login: profileRow?.login ?? null,
          brandId,
          brandName,
        },
      });
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function hasRole(profile: SessionProfile | null, role: Role): boolean {
  return !!profile?.roles.includes(role);
}

export function canSeeAllBrands(profile: SessionProfile | null): boolean {
  if (!profile) return false;
  if (profile.roles.includes("admin")) return true;
  return profile.brandId === null;
}

export function profileDisplayName(profile: SessionProfile | null): string {
  if (!profile) return "";
  return profile.fullName || displayLoginFromProfile(profile.login, profile.user.email ?? null);
}
