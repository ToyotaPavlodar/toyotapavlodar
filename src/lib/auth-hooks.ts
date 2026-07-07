import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Role = "admin" | "marketer" | "manager" | "operator";

export interface SessionProfile {
  user: User;
  roles: Role[];
  dashboardAccess: boolean;
  fullName: string | null;
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
        supabase.from("profiles").select("dashboard_access, full_name").eq("id", userData.user.id).maybeSingle(),
      ]);
      if (!mounted) return;
      setState({
        loading: false,
        profile: {
          user: userData.user,
          roles: (roleRows?.map((r) => r.role) ?? []) as Role[],
          dashboardAccess: profileRow?.dashboard_access ?? false,
          fullName: profileRow?.full_name ?? null,
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
