import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSessionProfile } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import { LogOut, Table2, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { profile, loading } = useSessionProfile();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Вы вышли");
    navigate({ to: "/auth" });
  }

  const isAdmin = profile?.roles.includes("admin") ?? false;
  const isMarketer = profile?.roles.includes("marketer") ?? false;
  const canDashboard = isAdmin || isMarketer || (profile?.dashboardAccess ?? false);

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: typeof Table2; label: string }) => {
    const active = path === to || path.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
          active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" /> {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-20">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-6">
            <Link to="/leads" className="font-bold">Автодом Павлодар</Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/leads" icon={Table2} label="Лиды" />
              {canDashboard && <NavLink to="/dashboard" icon={BarChart3} label="Дашборд" />}
              {isAdmin && <NavLink to="/settings" icon={SettingsIcon} label="Настройки" />}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {!loading && profile && (
              <div className="text-sm text-muted-foreground">
                {profile.fullName ?? profile.user.email}
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-secondary">
                  {profile.roles.join(", ") || "—"}
                </span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Выйти
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  );
}
