import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, PhoneCall, Table2 } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <header className="border-b border-border/50 bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="font-bold text-lg">Автодом Павлодар</div>
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Войти</Link></Button>
            <Button asChild><Link to="/auth">Начать</Link></Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            Meta Lead Ads · WhatsApp · Meta Ads Insights
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Единый пульт заявок для кол-центра и маркетинга
          </h1>
          <p className="text-lg text-muted-foreground">
            Все лиды из рекламных кампаний Toyota, Lexus, АСП и Сервиса — в одной таблице. Стоимость лида, качество и конверсия — в реальном времени.
          </p>
          <div className="flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">Войти в CRM <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-6 mt-20 max-w-5xl mx-auto">
          {[
            { icon: Table2, title: "Таблица лидов", body: "Все заявки автоматически, real-time, с фильтрами и статусами." },
            { icon: PhoneCall, title: "Работа оператора", body: "Дозвон, квалификация, передача в 1С — в один клик." },
            { icon: BarChart3, title: "Аналитика", body: "CPL, качество и конверсия по каждому бренду и месяцу." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="font-semibold">{f.title}</div>
              <div className="text-sm text-muted-foreground">{f.body}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
