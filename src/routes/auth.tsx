import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Table2, BarChart3, MessageCircle, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Вход — Автодом Павлодар" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/leads" });
    });
  }, [navigate]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Добро пожаловать!");
    navigate({ to: "/leads" });
  }

  const features = [
    {
      icon: Table2,
      title: "Все лиды в одной таблице",
      body: "Заявки из Meta Ads и WhatsApp попадают в CRM автоматически, в реальном времени.",
    },
    {
      icon: MessageCircle,
      title: "Быстрая работа оператора",
      body: "Дозвон, квалификация и передача в 1С — в один клик, прямо из карточки лида.",
    },
    {
      icon: BarChart3,
      title: "Прозрачная аналитика",
      body: "Расходы, стоимость лида и конверсия по каждому бренду — Toyota, Lexus, АСП, Сервис.",
    },
  ];

  return (
    <div className="relative grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.07]" />
        <div className="pointer-events-none absolute -left-20 top-1/4 h-96 w-96 rounded-full bg-brand/30 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-brand/20 blur-[120px]" />

        <div className="relative flex items-center gap-3">
          <img src={logo} alt="Автодом Павлодар" className="h-14 w-auto brightness-0 invert" />
        </div>

        <div className="relative max-w-lg space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> CRM автодилера «Автодом Павлодар»
          </span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            Единый пульт заявок для кол-центра и маркетинга
          </h1>
          <p className="text-base leading-relaxed text-primary-foreground/70">
            Система собирает лиды из рекламных кампаний Toyota, Lexus, АСП и Сервиса в одну таблицу,
            помогает операторам вести обработку заявок и показывает маркетологу стоимость лида,
            качество и конверсию в реальном времени.
          </p>
          <div className="space-y-4 pt-2">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-foreground ring-1 ring-white/10">
                  <f.icon className="h-5 w-5 text-white" />
                </span>
                <div>
                  <div className="font-semibold">{f.title}</div>
                  <div className="text-sm leading-snug text-primary-foreground/60">{f.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-primary-foreground/50">
          <ShieldCheck className="h-4 w-4" /> Доступ по ролям · данные под защитой
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex items-center justify-center overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 lg:hidden" />
        <div className="pointer-events-none absolute inset-0 bg-hero-glow lg:hidden" />
        <div className="relative w-full max-w-md animate-in-up">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img src={logo} alt="Автодом Павлодар" className="h-40 w-auto sm:h-48" />
            <p className="mt-2 text-sm text-muted-foreground">
              CRM учёта и контроля лидов автодилера «Автодом Павлодар»
            </p>
          </div>

          <Card className="border-border/70 shadow-float">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Вход в систему</CardTitle>
              <p className="text-sm text-muted-foreground">
                Войдите под корпоративной учётной записью, выданной администратором.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSignIn} className="space-y-4 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@autodom.kz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  variant="brand"
                  className="w-full"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? "Входим..." : "Войти"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              ← На главную
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
