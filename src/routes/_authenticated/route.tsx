import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSessionProfile, profileDisplayName } from "@/lib/auth-hooks";
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

  const navItems = [
    { to: "/leads", icon: Table2, label: "Лиды", show: true },
    { to: "/dashboard", icon: BarChart3, label: "Дашборд", show: canDashboard },
    { to: "/settings", icon: SettingsIcon, label: "Настройки", show: isAdmin },
  ].filter((i) => i.show);

  const NavLink = ({
    to,
    icon: Icon,
    label,
    compact,
  }: {
    to: string;
    icon: typeof Table2;
    label: string;
    compact?: boolean;
  }) => {
    const active = path === to || path.startsWith(to + "/");
    if (compact) {
      return (
        <Link
          to={to}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-all ${
            active
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground active:bg-accent"
          }`}
        >
          <Icon className="h-5 w-5" />
          <span className="truncate">{label}</span>
        </Link>
      );
    }
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

  const displayName = profileDisplayName(profile);
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="glass sticky top-0 z-30 border-b border-border/70">
        <div className="container mx-auto flex h-14 items-center justify-between gap-3 px-3 sm:h-16 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 md:gap-7">
            <Link to="/leads" className="flex shrink-0 items-center gap-2.5">
              <img src={logo} alt="Автодом Павлодар" className="h-9 w-auto sm:h-11" />
              <span className="hidden h-6 w-px bg-border sm:block" />
              <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:block">
                CRM<span className="text-brand">.</span>
              </span>
            </Link>
            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 rounded-xl border border-border/60 bg-secondary/40 p-1 md:flex">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            {!loading && profile && (
              <div className="hidden items-center gap-3 rounded-full border border-border/70 bg-card/60 py-1 pl-1.5 pr-3.5 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground">
                  {initials || "?"}
                </span>
                <div className="leading-tight">
                  <div className="max-w-[160px] truncate text-sm font-medium text-foreground">
                    {displayName}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-brand">
                    {profile.roles.map((r) => roleLabels[r] ?? r).join(" · ") || "—"}
                    {profile.brandName ? ` · ${profile.brandName}` : ""}
                  </div>
                </div>
              </div>
            )}
            {/* Mobile: avatar initials only */}
            {!loading && profile && (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground sm:hidden">
                {initials || "?"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 px-0 sm:w-auto sm:px-3"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 animate-in-up pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav — большой тач-таргет под большой палец */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-md md:hidden"
        aria-label="Навигация"
      >
        <div className="mx-auto flex max-w-lg items-stretch gap-1 p-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} icon={item.icon} label={item.label} compact />
          ))}
        </div>
      </nav>
    </div>
  );
}
