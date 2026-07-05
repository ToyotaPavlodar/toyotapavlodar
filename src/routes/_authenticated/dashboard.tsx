import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/dashboard.functions";
import { syncMetaMonth } from "@/lib/sync.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { formatKzt, formatUsd, formatPct } from "@/lib/format";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Дашборд — Автодом Павлодар" }] }),
  component: DashboardPage,
});

type Dash = Awaited<ReturnType<typeof getDashboard>>;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function DashboardPage() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const call = useServerFn(getDashboard);
  const doSync = useServerFn(syncMetaMonth);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await call({ data: { month } });
      setData(res);
      setLastUpdated(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await doSync({ data: { month } });
      if (!res) {
        toast.error("Синхронизация не вернула результат. Проверьте настройки Meta.");
        return;
      }
      const parts: string[] = [];
      parts.push(`Расходы: ${res.spend_rows ?? 0} строк`);
      if (res.spend_error) parts.push(`⚠ ${res.spend_error}`);
      parts.push(`Лиды: ${res.leads_rows ?? 0}`);
      if (res.leads_errors && res.leads_errors.length > 0) toast.warning(res.leads_errors.slice(0, 2).join("; "));
      toast.success(parts.join(" · "));
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncing(false); }
  }

  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Дашборд</h1>
          <p className="text-sm text-muted-foreground">Аналитика лидов, расходов и качества рекламы.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[180px] text-center font-medium capitalize">{monthLabel(month)}</div>
          <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} title="Пересчитать">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={syncNow} disabled={syncing} title="Подтянуть расходы и лиды из Meta за выбранный месяц">
            <DownloadCloud className={`h-4 w-4 mr-1 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Синхронизация…" : "Синхронизировать Meta"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {data?.latest_rate && <span>Курс USD/KZT: <b className="text-foreground">{data.latest_rate.usd_kzt.toFixed(2)}</b> ({data.latest_rate.date})</span>}
        {data && <span>Средний курс за месяц: <b className="text-foreground">{data.avg_rate.toFixed(2)}</b></span>}
        {lastUpdated && <span>Обновлено: {lastUpdated.toLocaleTimeString("ru-RU")}</span>}
      </div>

      {error && <Card className="p-4 text-destructive">{error}</Card>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Расходы на рекламу" main={formatKzt(data.totals.spend_kzt)} sub={formatUsd(data.totals.spend_usd)} />
            <StatCard title="Всего лидов" main={String(data.totals.leads)} />
            <StatCard title="Стоимость лида (CPL)" main={formatKzt(data.totals.cpl_kzt)} />
            <StatCard title="Передано в 1С" main={String(data.totals.sent_to_1c)} sub={`конверсия ${formatPct(data.totals.conversion_pct)}`} />
            <StatCard title="Дозвонились" main={String(data.totals.called)} sub={`из ${data.totals.leads}`} />
            <StatCard title="Квалифицированы" main={String(data.totals.qualified)} />
            <StatCard title="Качество рекламы" main={formatPct(data.totals.quality_pct)} sub="Квал ÷ Дозвон" tone="success" />
            <StatCard title="Конверсия в 1С" main={formatPct(data.totals.conversion_pct)} sub="1С ÷ Все лиды" tone="warning" />
          </div>

          <Card>
            <CardHeader><CardTitle>По брендам</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.by_brand.map((b) => (
                <div key={b.id} className="border border-border rounded-lg p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="font-semibold">{b.name}</span>
                  </div>
                  <div className="text-2xl font-bold">{b.leads} <span className="text-sm text-muted-foreground font-normal">лидов</span></div>
                  <div className="text-sm text-muted-foreground">Расход: {formatKzt(b.spend_kzt)}</div>
                  <div className="text-sm">CPL: <b>{b.leads > 0 ? formatKzt(b.cpl_kzt) : "—"}</b></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Тренд 6 месяцев</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend}>
                    <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                    <Line type="monotone" dataKey="leads" stroke="var(--chart-1)" strokeWidth={2} name="Лиды" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ title, main, sub, tone }: { title: string; main: string; sub?: string; tone?: "success" | "warning" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-5 space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className={`text-3xl font-bold ${toneCls}`}>{main}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
