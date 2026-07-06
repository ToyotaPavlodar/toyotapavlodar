import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, PhoneCall, Table2, ShieldCheck, Zap } from "lucide-react";
import logo from "@/assets/logo.png";
import { LEGAL_LINKS } from "@/lib/legal-site";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/leads" });
    });
  }, [navigate]);

  const features = [
    {
      icon: Table2,
      title: "Таблица лидов",
      body: "Все заявки автоматически, real-time, с фильтрами по бренду и статусам.",
    },
    {
      icon: PhoneCall,
      title: "Работа оператора",
      body: "Дозвон, квалификация и передача в 1С — в один клик, без лишних шагов.",
    },
    {
      icon: BarChart3,
      title: "Аналитика",
      body: "CPL, качество и конверсия по каждому бренду и месяцу в реальном времени.",
    },
  ];

  const badges = ["Meta Lead Ads", "WhatsApp Cloud API", "Meta Ads Insights", "1С"];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

      <div className="relative">
        <header className="glass sticky top-0 z-20 border-b border-border/60">
          <div className="container mx-auto flex h-16 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2.5">
              <img src={logo} alt="Автодом Павлодар" className="h-10 w-auto" />
            </Link>
            <div className="flex gap-2">
              <Button asChild variant="ghost">
                <Link to="/auth">Войти</Link>
              </Button>
              <Button asChild variant="brand">
                <Link to="/auth">Начать</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 pb-24 pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
              <span className="flex h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              Единая CRM для лидов автодилера
            </div>
            <h1 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Единый пульт заявок для <span className="text-gradient">кол-центра и маркетинга</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
              Все лиды из рекламных кампаний Toyota, Lexus, АСП и Сервиса — в одной таблице.
              Стоимость лида, качество и конверсия — в реальном времени.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button size="xl" variant="brand" asChild>
                <Link to="/auth">
                  Войти в CRM <ArrowRight className="ml-1 h-5 w-5" />
                </Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-border/60 bg-secondary/50 px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-20 grid max-w-5xl gap-5 md:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/70 bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                  <f.icon className="h-6 w-6" />
                </div>
                <div className="text-lg font-semibold">{f.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-8 grid max-w-5xl gap-5 sm:grid-cols-2">
            <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Real-time без обновления</div>
                <div className="text-sm text-muted-foreground">
                  Новые заявки прилетают в таблицу мгновенно.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Роли и доступы</div>
                <div className="text-sm text-muted-foreground">
                  Менеджер, маркетолог и админ видят только своё.
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="relative border-t border-border/60 py-8">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            <nav className="mb-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {LEGAL_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="hover:text-foreground underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              ))}
            </nav>
            © {new Date().getFullYear()} Автодом Павлодар · CRM учёта и контроля лидов
          </div>
        </footer>
      </div>
    </div>
  );
}
