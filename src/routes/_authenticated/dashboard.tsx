import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/dashboard.functions";
import { syncMetaMonth } from "@/lib/sync.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  DownloadCloud,
  Wallet,
  Users,
  Coins,
  Send,
  PhoneCall,
  BadgeCheck,
  Gauge,
  Target,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatKzt, formatUsd, formatPct } from "@/lib/format";
import {
  ComposedChart,
  Area,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

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
function monthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function kztShort(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".0", "") + " млн";
  if (v >= 1_000) return Math.round(v / 1_000) + "к";
  return String(Math.round(v));
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
    setLoading(true);
    setError(null);
    try {
      const res = await call({ data: { month } });
      setData(res);
      setLastUpdated(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await doSync({ data: { month } });
      if (!res) {
        toast.error("Синхронизация не вернула результат. Проверьте настройки Meta.");
        return;
      }
      const parts: string[] = [`Расходы: ${res.spend_rows ?? 0} строк`];
      if (res.spend_error) parts.push(`⚠ ${res.spend_error}`);
      parts.push(`Лиды: ${res.leads_rows ?? 0}`);
      if (res.leads_errors && res.leads_errors.length > 0)
        toast.warning(res.leads_errors.slice(0, 2).join("; "));
      toast.success(parts.join(" · "));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [month]);

  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  }

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Аналитика лидов, расходов и качества рекламы.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card p-1.5 shadow-xs">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[170px] text-center text-sm font-semibold capitalize">
              {monthLabel(month)}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={load}
              disabled={loading}
              title="Пересчитать"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <Button
            variant="brand"
            onClick={syncNow}
            disabled={syncing}
            title="Подтянуть расходы и лиды из Meta за выбранный месяц"
          >
            <DownloadCloud className={`h-4 w-4 mr-1 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Синхронизация…" : "Синхронизировать Meta"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {data?.latest_rate && (
          <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-muted-foreground shadow-xs">
            Курс USD/KZT: <b className="text-foreground">{data.latest_rate.usd_kzt.toFixed(2)}</b>{" "}
            <span className="opacity-70">({data.latest_rate.date})</span>
          </span>
        )}
        {data && (
          <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-muted-foreground shadow-xs">
            Средний курс за месяц: <b className="text-foreground">{data.avg_rate.toFixed(2)}</b>
          </span>
        )}
        {lastUpdated && (
          <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-muted-foreground shadow-xs">
            Обновлено: {lastUpdated.toLocaleTimeString("ru-RU")}
          </span>
        )}
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {!data && loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-xl border border-border/60 bg-muted/50"
            />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              title="Расходы на рекламу"
              main={formatKzt(data.totals.spend_kzt)}
              sub={formatUsd(data.totals.spend_usd)}
            />
            <StatCard
              icon={Users}
              title="Всего лидов"
              main={String(data.totals.leads)}
              tone="brand"
            />
            <StatCard
              icon={Coins}
              title="Стоимость лида (CPL)"
              main={formatKzt(data.totals.cpl_kzt)}
            />
            <StatCard
              icon={Send}
              title="Передано в 1С"
              main={String(data.totals.sent_to_1c)}
              sub={`конверсия ${formatPct(data.totals.conversion_pct)}`}
            />
            <StatCard
              icon={PhoneCall}
              title="Дозвонились"
              main={String(data.totals.called)}
              sub={`из ${data.totals.leads}`}
            />
            <StatCard
              icon={BadgeCheck}
              title="Квалифицированы"
              main={String(data.totals.qualified)}
            />
            <StatCard
              icon={Gauge}
              title="Качество рекламы"
              main={formatPct(data.totals.quality_pct)}
              sub="Квал ÷ Дозвон"
              tone="success"
            />
            <StatCard
              icon={Target}
              title="Конверсия в 1С"
              main={formatPct(data.totals.conversion_pct)}
              sub="1С ÷ Все лиды"
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">По брендам</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {data.by_brand.map((b) => (
                <div
                  key={b.id}
                  className="group relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-card to-secondary/30 p-4 transition-shadow hover:shadow-card"
                >
                  <span
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: b.color }}
                  />
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full ring-2 ring-white/60"
                      style={{ backgroundColor: b.color }}
                    />
                    <span className="font-semibold">{b.name}</span>
                  </div>
                  <div className="mt-3 text-3xl font-bold">
                    {b.leads}{" "}
                    <span className="text-sm font-normal text-muted-foreground">лидов</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{
                        width: `${data.totals.leads > 0 ? Math.round((b.leads / data.totals.leads) * 100) : 0}%`,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {data.totals.leads > 0 ? Math.round((b.leads / data.totals.leads) * 100) : 0}% от
                    всех лидов
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Расход: {formatKzt(b.spend_kzt)}
                  </div>
                  <div className="text-sm">
                    CPL: <b>{b.leads > 0 ? formatKzt(b.cpl_kzt) : "—"}</b>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Динамика с июля 2026</CardTitle>
              <p className="text-sm text-muted-foreground">Лиды и расходы на рекламу по месяцам.</p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.trend}
                    margin={{ top: 8, right: 4, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={monthShort}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={4}
                    />
                    <YAxis
                      yAxisId="leads"
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="spend"
                      orientation="right"
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={kztShort}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.6rem",
                        boxShadow: "var(--shadow-md)",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "var(--muted-foreground)", fontWeight: 600 }}
                      labelFormatter={(l) => monthLabel(String(l))}
                      formatter={(value, name) =>
                        name === "Расход"
                          ? [formatKzt(Number(value)), name]
                          : [String(value), name]
                      }
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "12px" }}
                    />
                    <Area
                      yAxisId="leads"
                      type="monotone"
                      dataKey="leads"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      fill="url(#leadsFill)"
                      name="Лиды"
                      dot={{ r: 3, fill: "var(--chart-1)" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      yAxisId="spend"
                      type="monotone"
                      dataKey="spend_kzt"
                      stroke="var(--chart-3)"
                      strokeWidth={2}
                      name="Расход"
                      dot={{ r: 2.5, fill: "var(--chart-3)" }}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  main,
  sub,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  main: string;
  sub?: string;
  tone?: "brand" | "success" | "warning";
}) {
  const toneCfg = {
    brand: { text: "text-brand", chip: "bg-brand/10 text-brand" },
    success: { text: "text-success", chip: "bg-success/10 text-success" },
    warning: { text: "text-warning", chip: "bg-warning/15 text-warning" },
    default: { text: "text-foreground", chip: "bg-secondary text-muted-foreground" },
  }[tone ?? "default"];
  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneCfg.chip}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <div className={`mt-3 text-3xl font-bold tracking-tight ${toneCfg.text}`}>{main}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
