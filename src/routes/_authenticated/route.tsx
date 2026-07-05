import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
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

  const NavLink = ({
    to,
    icon: Icon,
    label,
  }: {
    to: string;
    icon: typeof Table2;
    label: string;
  }) => {
    const active = path === to || path.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" /> {label}
      </Link>
    );
  };

  const displayName = profile?.fullName ?? profile?.user.email ?? "";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const roleLabels: Record<string, string> = {
    admin: "Админ",
    marketer: "Маркетолог",
    manager: "Менеджер",
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="glass sticky top-0 z-30 border-b border-border/70">
        <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3 md:gap-7">
            <Link to="/leads" className="flex items-center gap-2.5">
              <img src={logo} alt="Автодом Павлодар" className="h-11 w-auto" />
              <span className="hidden h-6 w-px bg-border sm:block" />
              <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:block">
                CRM<span className="text-brand">.</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 rounded-xl border border-border/60 bg-secondary/40 p-1">
              <NavLink to="/leads" icon={Table2} label="Лиды" />
              {canDashboard && <NavLink to="/dashboard" icon={BarChart3} label="Дашборд" />}
              {isAdmin && <NavLink to="/settings" icon={SettingsIcon} label="Настройки" />}
            </nav>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {!loading && profile && (
              <div className="hidden items-center gap-3 rounded-full border border-border/70 bg-card/60 py-1 pl-1.5 pr-3.5 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground">
                  {initials || "?"}
                </span>
                <div className="leading-tight">
                  <div className="max-w-[160px] truncate text-sm font-medium text-foreground">
                    {profile.fullName ?? profile.user.email}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-brand">
                    {profile.roles.map((r) => roleLabels[r] ?? r).join(" · ") || "—"}
                  </div>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 animate-in-up">
        <Outlet />
      </main>
    </div>
  );
}
