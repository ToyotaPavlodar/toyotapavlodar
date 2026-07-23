import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/dashboard.functions";
import { syncMetaMonth } from "@/lib/sync.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
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
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatKzt, formatUsd, formatPct } from "@/lib/format";
import { monthLabelRu, monthShortRu, type DatePeriod, thisMonthPeriod, isFullMonthPeriod } from "@/lib/month-range";
import { PeriodPicker } from "@/components/PeriodPicker";
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

function monthLabel(key: string): string {
  return monthLabelRu(key);
}
function monthShort(key: string): string {
  return monthShortRu(key);
}
function kztShort(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".0", "") + " млн";
  if (v >= 1_000) return Math.round(v / 1_000) + "к";
  return String(Math.round(v));
}

function deltaLabel(pct: number, compareLabel = "к пред. периоду"): string | null {
  if (!Number.isFinite(pct) || pct === 0) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Math.round(pct)}% ${compareLabel}`;
}

function DashboardPage() {
  const [period, setPeriod] = useState<DatePeriod>(() => thisMonthPeriod());
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const call = useServerFn(getDashboard);
  const doSync = useServerFn(syncMetaMonth);
  const syncMonth = isFullMonthPeriod(period.from, period.to) ? period.from.slice(0, 7) : null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await call({ data: { from: period.from, to: period.to } });
      setData(res);
      setLastUpdated(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    if (!syncMonth) {
      toast.message("Синхронизация Meta доступна только за полный календарный месяц");
      return;
    }
    setSyncing(true);
    try {
      const res = await doSync({ data: { month: syncMonth } });
      if (!res) {
        toast.error("Синхронизация не вернула результат. Проверьте настройки Meta.");
        return;
      }
      if (res.spend_error && /not configured/i.test(res.spend_error)) {
        toast.error("Meta не подключён. Откройте «Настройки → Facebook / Meta» и вставьте User Access Token.");
        return;
      }
      const parts: string[] = [`Расходы: ${res.spend_rows ?? 0} строк`];
      if (res.spend_error) parts.push(`⚠ ${res.spend_error}`);
      parts.push(`Лиды: ${res.leads_rows ?? 0}`);
      if (res.messaging_rows != null) parts.push(`WhatsApp: ${res.messaging_rows}`);
      if (res.messaging_error) parts.push(`⚠ ${res.messaging_error}`);
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
  }, [period.from, period.to]);

  const periodSubtitle = data?.period.label ?? "за выбранный период";
  const compareLabel = data?.period.is_full_month ? "к прошл. мес." : "к пред. периоду";

  return (
    <div className="mx-auto w-full max-w-none space-y-6 px-5 py-8 xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.scope.brand_name
              ? `Аналитика бренда «${data.scope.brand_name}»`
              : "Аналитика лидов, расходов и качества рекламы."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl border border-border/70 bg-card shadow-xs"
            onClick={load}
            disabled={loading}
            title="Пересчитать"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="brand"
            onClick={syncNow}
            disabled={syncing || !syncMonth}
            title={
              syncMonth
                ? "Подтянуть расходы и лиды из Meta за выбранный месяц"
                : "Выберите полный месяц для синхронизации Meta"
            }
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
            Средний курс за период: <b className="text-foreground">{data.avg_rate.toFixed(2)}</b>
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
          <SectionTitle title="Ключевые метрики" subtitle={`Итоги — ${periodSubtitle}`} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              title="Расходы на рекламу"
              main={formatKzt(data.totals.spend_kzt)}
              sub={[formatUsd(data.totals.spend_usd), deltaLabel(data.mom.spend_delta_pct, compareLabel)].filter(Boolean).join(" · ")}
            />
            <StatCard
              icon={Users}
              title="Всего лидов"
              main={String(data.totals.leads)}
              sub={[
                `Lead Ads: ${data.totals.table_leads}`,
                data.totals.messaging_leads > 0
                  ? `WhatsApp: ${data.totals.messaging_leads}`
                  : null,
                deltaLabel(data.mom.leads_delta_pct, compareLabel),
              ].filter(Boolean).join(" · ")}
              tone="brand"
            />
            <StatCard
              icon={Coins}
              title="CPL — цена лида"
              main={formatKzt(data.totals.cpl_kzt)}
              sub={["по всем заявкам", deltaLabel(data.mom.cpl_delta_pct, compareLabel)].filter(Boolean).join(" · ")}
            />
            <StatCard
              icon={Send}
              title="Передано в 1С"
              main={String(data.totals.sent_to_1c)}
              sub={`${formatPct(data.totals.lead_to_1c_pct)} сквозная от заявок`}
              tone="success"
            />
          </div>

          <SectionTitle
            title="Аналитика: лиды → 1С"
            subtitle="Общая конверсия и стоимость — итого и по каждому бренду"
          />
          <OneCAnalyticsSummary data={data} />

          <SectionTitle title="Обработка заявок" subtitle="Работа отдела продаж" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={PhoneCall}
              title="Дозвонились"
              main={String(data.totals.called)}
              sub={`${formatPct(data.totals.lead_to_call_pct)} заявка → дозвон · не дозвон: ${data.totals.not_called}`}
            />
            <StatCard
              icon={BadgeCheck}
              title="Квалифицированы"
              main={String(data.totals.qualified)}
              sub={`${formatPct(data.totals.lead_to_qual_pct)} сквозная · ${formatPct(data.totals.call_to_qual_pct)} дозвон→квал`}
            />
            <StatCard
              icon={Gauge}
              title="Качество обработки"
              main={formatPct(data.totals.call_to_qual_pct)}
              sub="Дозвон → Квал"
              tone="success"
            />
            <StatCard
              icon={Target}
              title="Сквозная в 1С"
              main={formatPct(data.totals.lead_to_1c_pct)}
              sub={
                data.totals.messaging_leads > 0
                  ? `${formatPct(data.totals.lead_to_1c_all_pct)} от всех ${data.totals.leads}`
                  : "Заявка → 1С"
              }
              tone="warning"
            />
          </div>

          <SectionTitle
            title="Эффективность ответственных"
            subtitle={`Сделки, конверсии и оценка по каждому менеджеру — ${periodSubtitle}`}
          />
          <AssigneePerformanceSummary data={data} />

          <SectionTitle title="Эффективность рекламы" subtitle="Стоимость на каждом этапе воронки" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              icon={Coins}
              title="CPL — цена лида"
              main={data.totals.cpl_kzt > 0 ? formatKzt(data.totals.cpl_kzt) : "—"}
              sub={`${data.totals.leads} лидов · ${formatKzt(data.totals.spend_kzt)} расход`}
            />
            <StatCard
              icon={BadgeCheck}
              title="CPQL — цена квал. лида"
              main={data.totals.cpql_kzt > 0 ? formatKzt(data.totals.cpql_kzt) : "—"}
              sub={`${data.totals.qualified} квал. · ${formatPct(data.totals.lead_to_qual_pct)} от заявок`}
              tone="success"
            />
            <StatCard
              icon={Target}
              title="Цена сделки в 1С"
              main={data.totals.cps1c_kzt > 0 ? formatKzt(data.totals.cps1c_kzt) : "—"}
              sub={`${data.totals.sent_to_1c} в 1С · ${formatPct(data.totals.lead_to_1c_pct)} конверсия`}
              tone="warning"
            />
          </div>

          <SectionTitle title="Воронка продаж" subtitle="Lead Ads · WhatsApp не входит" />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Пошаговые конверсии</CardTitle>
              <p className="text-sm text-muted-foreground">
                Маркетинг (заявка → дозвон) и менеджеры (дозвон → квал → 1С).
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-7 md:items-stretch">
                {(
                  [
                    {
                      label: "Заявки",
                      value: data.funnel.table_leads,
                      stepPct: null as number | null,
                      cumPct: 100,
                      hint: "Вход в воронку",
                    },
                    {
                      label: "Дозвон",
                      value: data.funnel.called,
                      stepPct: data.funnel.lead_to_call_pct,
                      cumPct: data.funnel.lead_to_call_pct,
                      hint: "Маркетинг + первый контакт",
                    },
                    {
                      label: "Квал",
                      value: data.funnel.qualified,
                      stepPct: data.funnel.call_to_qual_pct,
                      cumPct: data.funnel.lead_to_qual_pct,
                      hint: "Работа менеджера",
                    },
                    {
                      label: "В 1С",
                      value: data.funnel.sent_to_1c,
                      stepPct: data.funnel.qual_to_1c_pct,
                      cumPct: data.funnel.lead_to_1c_pct,
                      hint: "Передача в учёт",
                    },
                  ] as const
                ).map((step, i, arr) => (
                  <div key={step.label} className="contents">
                    <div className="rounded-xl border border-border/70 bg-card p-4 md:col-span-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {step.label}
                      </div>
                      <div className="mt-2 text-2xl font-bold">{step.value}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatPct(step.cumPct)} от заявок
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{step.hint}</div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${Math.min(100, step.cumPct)}%` }}
                        />
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex flex-col items-center justify-center px-1 py-2 md:col-span-1">
                        <div className="hidden text-lg text-muted-foreground md:block">→</div>
                        <div className="rounded-full bg-secondary px-2.5 py-1 text-center text-xs font-semibold text-foreground">
                          {formatPct(
                            i === 0
                              ? data.funnel.lead_to_call_pct
                              : i === 1
                                ? data.funnel.call_to_qual_pct
                                : data.funnel.qual_to_1c_pct,
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">шаг</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <FunnelSplitSummary data={data} />
            </CardContent>
          </Card>

          <SectionTitle title="По брендам" subtitle={`Сводка — ${periodSubtitle}`} />
          <BrandSummaryTable data={data} />

          <SectionTitle title="Динамика" subtitle="Лиды и расходы по месяцам с июля 2026" />
          <Card>
            <CardContent className="p-4">
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

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-border/60 pb-2 pt-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function InsightRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-right">
        <div className="text-base font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

function FunnelSplitSummary({ data }: { data: Dash }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="text-sm font-semibold">Маркетинг</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Реклама и первый контакт с клиентом</p>
        <div className="mt-4 space-y-3">
          <InsightRow
            label="Дозвонились из заявок"
            value={formatPct(data.funnel.lead_to_call_pct)}
            hint={`${data.funnel.called} из ${data.funnel.table_leads}`}
          />
          <InsightRow
            label="Не удалось дозвониться"
            value={String(data.funnel.not_called)}
            hint={`${formatPct(100 - data.funnel.lead_to_call_pct)} от заявок`}
          />
          <InsightRow
            label="Цена одной заявки"
            value={data.totals.cpl_kzt > 0 ? formatKzt(data.totals.cpl_kzt) : "—"}
            hint={`Расход ${formatKzt(data.totals.spend_kzt)}`}
          />
          <InsightRow
            label="Дошли до 1С из всех заявок"
            value={formatPct(data.funnel.lead_to_1c_pct)}
            hint={`${data.funnel.sent_to_1c} сделок`}
          />
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="text-sm font-semibold">Отдел продаж</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Работа менеджеров после дозвона</p>
        <div className="mt-4 space-y-3">
          <InsightRow
            label="Квалифицировали после дозвона"
            value={formatPct(data.funnel.call_to_qual_pct)}
            hint={`${data.funnel.qualified} квал. лидов`}
          />
          <InsightRow
            label="Передали в 1С после квала"
            value={formatPct(data.funnel.qual_to_1c_pct)}
            hint={`${data.funnel.sent_to_1c} в 1С`}
          />
          <InsightRow
            label="Цена квал. лида"
            value={data.totals.cpql_kzt > 0 ? formatKzt(data.totals.cpql_kzt) : "—"}
            hint="CPQL"
          />
          <InsightRow
            label="Цена сделки в 1С"
            value={data.totals.cps1c_kzt > 0 ? formatKzt(data.totals.cps1c_kzt) : "—"}
            hint={
              data.funnel.sent_to_1c > 0
                ? `расход ÷ ${data.funnel.sent_to_1c} сделок`
                : "нет сделок в 1С"
            }
          />
        </div>
      </div>
    </div>
  );
}

function BrandSummaryTable({ data }: { data: Dash }) {
  const headClass =
    "bg-secondary/80 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
  const brands = data.by_brand.filter(
    (b) => b.table_leads + b.messaging_leads > 0 || b.spend_kzt > 0,
  );
  const totalLeads = data.totals.leads;

  if (brands.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Нет данных по брендам за выбранный месяц
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <Table className="w-full min-w-[960px] table-fixed">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Бренд</TableHead>
                <TableHead className={`${headClass} text-right`}>Лиды</TableHead>
                <TableHead className={`${headClass} text-right`}>Расход</TableHead>
                <TableHead className={`${headClass} text-right`}>Цена лида</TableHead>
                <TableHead className={`${headClass} text-right`}>Дозвон</TableHead>
                <TableHead className={`${headClass} text-right`}>Квал</TableHead>
                <TableHead className={`${headClass} text-right`}>В 1С</TableHead>
                <TableHead className={`${headClass} text-right`}>Конверсия в 1С</TableHead>
                <TableHead className={`${headClass} text-right`}>Цена сделки</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((b) => {
                const brandTotal = b.table_leads + b.messaging_leads;
                const sharePct = totalLeads > 0 ? Math.round((brandTotal / totalLeads) * 100) : 0;
                const isWaOnly = b.messaging_leads > 0 && b.table_leads === 0;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: b.color }}
                        />
                        <div>
                          <div className="font-medium">{b.name}</div>
                          <div className="text-[10px] text-muted-foreground">{sharePct}% от всех</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-semibold">{brandTotal}</div>
                      {b.messaging_leads > 0 && b.table_leads > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {b.table_leads} + {b.messaging_leads} WA
                        </div>
                      )}
                      {isWaOnly && (
                        <div className="text-[10px] text-muted-foreground">WhatsApp</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatKzt(b.spend_kzt)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {brandTotal > 0 ? formatKzt(b.cpl_kzt) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.table_leads > 0 ? formatPct(b.lead_to_call_pct) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.table_leads > 0 ? b.qualified : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.table_leads > 0 ? (
                        <span className={b.sent_to_1c > 0 ? "font-semibold text-success" : ""}>
                          {b.sent_to_1c}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.table_leads > 0 ? formatPct(b.lead_to_1c_pct) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.sent_to_1c > 0 ? formatKzt(b.cps1c_kzt) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const RATING_STYLES = {
  excellent: "bg-success/15 text-success border-success/30",
  good: "bg-brand/10 text-brand border-brand/30",
  average: "bg-secondary text-muted-foreground border-border",
  low: "bg-destructive/10 text-destructive border-destructive/30",
  insufficient: "bg-muted text-muted-foreground border-border",
} as const;

function AssigneePerformanceSummary({ data }: { data: Dash }) {
  const headClass =
    "bg-secondary/80 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  if (data.by_assignee.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <UserCheck className="h-5 w-5 shrink-0 opacity-60" />
          <div>
            <p className="font-medium text-foreground">Нет данных по ответственным</p>
            <p className="mt-1 text-xs">
              Назначьте ответственных в разделе «Заявки» или добавьте их в «Настройки → Ответственные».
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const assigned = data.by_assignee.filter((a) => a.id !== null);
  const teamDeals = assigned.reduce((sum, a) => sum + a.sent_to_1c, 0);
  const teamLeads = assigned.reduce((sum, a) => sum + a.leads, 0);
  const teamAvg1c = teamLeads > 0 ? (teamDeals / teamLeads) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Ответственный</TableHead>
                <TableHead className={`${headClass} text-right`}>Лидов</TableHead>
                <TableHead className={`${headClass} text-right`}>Дозвон</TableHead>
                <TableHead className={`${headClass} text-right`}>Квал</TableHead>
                <TableHead className={`${headClass} text-right`}>В 1С</TableHead>
                <TableHead className={`${headClass} text-right`}>Конверсия</TableHead>
                <TableHead className={`${headClass} text-right`}>Эффективность</TableHead>
                <TableHead className={`${headClass} text-center`}>Оценка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_assignee.map((a) => (
                <TableRow key={a.id ?? "__none__"}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: a.brand_color }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium">{a.name}</div>
                        {a.brand_name !== "—" && (
                          <div className="text-[10px] text-muted-foreground">{a.brand_name}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{a.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{a.called}</div>
                    <div className="text-[10px] text-muted-foreground">{formatPct(a.lead_to_call_pct)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{a.qualified}</div>
                    <div className="text-[10px] text-muted-foreground">{formatPct(a.lead_to_qual_pct)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={a.sent_to_1c > 0 ? "font-semibold text-success" : ""}>{a.sent_to_1c}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="font-medium">{formatPct(a.lead_to_1c_pct)}</span>
                    {a.leads >= 2 && a.vs_avg_1c_pp !== 0 && (
                      <div
                        className={`text-[10px] ${a.vs_avg_1c_pp > 0 ? "text-success" : "text-destructive"}`}
                      >
                        {a.vs_avg_1c_pp > 0 ? "+" : ""}
                        {a.vs_avg_1c_pp.toFixed(1)} п.п. к ср.
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="font-medium">{Math.round(a.effectiveness_score)}</div>
                    <div className="mx-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${Math.min(100, a.effectiveness_score)}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${RATING_STYLES[a.rating]}`}
                    >
                      {a.rating_label}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border/60 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
          Средняя конверсия назначенных лидов в 1С: <b className="text-foreground">{formatPct(teamAvg1c)}</b>
          {" · "}
          Всего сделок в 1С: <b className="text-foreground">{teamDeals}</b> из{" "}
          <b className="text-foreground">{teamLeads}</b> назначенных лидов. Оценка сравнивает менеджера со
          средним по команде (дозвон 20%, дозвон→квал 25%, заявка→1С 55%).
        </div>
      </CardContent>
    </Card>
  );
}

function OneCAnalyticsSummary({ data }: { data: Dash }) {
  const brandsWithLeads = data.by_brand.filter((b) => b.table_leads > 0 || b.messaging_leads > 0);
  const headClass =
    "bg-secondary/80 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Бренд</TableHead>
                <TableHead className={`${headClass} text-right`}>Лиды</TableHead>
                <TableHead className={`${headClass} text-right`}>В 1С</TableHead>
                <TableHead className={`${headClass} text-right`}>Конверсия</TableHead>
                <TableHead className={`${headClass} text-right`}>Расход</TableHead>
                <TableHead className={`${headClass} text-right`}>CPL</TableHead>
                <TableHead className={`${headClass} text-right`}>Цена 1С</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-brand/5 font-semibold hover:bg-brand/5">
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-brand">
                      Σ
                    </span>
                    Всего
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {data.totals.leads}
                  {data.totals.messaging_leads > 0 && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      Lead Ads: {data.totals.table_leads}
                      {data.totals.messaging_leads > 0 && ` · WA: ${data.totals.messaging_leads}`}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-success">{data.totals.sent_to_1c}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="font-semibold text-warning">{formatPct(data.totals.lead_to_1c_pct)}</span>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    от Lead Ads
                    {data.totals.messaging_leads > 0 && (
                      <> · {formatPct(data.totals.lead_to_1c_all_pct)} от всех</>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatKzt(data.totals.spend_kzt)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {data.totals.cpl_kzt > 0 ? formatKzt(data.totals.cpl_kzt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {data.totals.cps1c_kzt > 0 ? formatKzt(data.totals.cps1c_kzt) : "—"}
                </TableCell>
              </TableRow>
              {brandsWithLeads.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="font-medium">{b.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.total_leads}
                    {b.messaging_leads > 0 && b.table_leads > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        Lead Ads: {b.table_leads} · WA: {b.messaging_leads}
                      </div>
                    )}
                    {b.messaging_leads > 0 && b.table_leads === 0 && (
                      <div className="text-[10px] text-muted-foreground">WhatsApp</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.table_leads > 0 ? (
                      <span className={b.sent_to_1c > 0 ? "text-success font-medium" : ""}>
                        {b.sent_to_1c}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.table_leads > 0 ? (
                      <>
                        <span className="font-medium">{formatPct(b.lead_to_1c_pct)}</span>
                        {b.qualified > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            квал→1С: {formatPct(b.qual_to_1c_pct)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatKzt(b.spend_kzt)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.cpl_kzt > 0 ? formatKzt(b.cpl_kzt) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.cps1c_kzt > 0 ? formatKzt(b.cps1c_kzt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border/60 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
          Конверсия в 1С считается от Lead Ads (заявки в CRM). WhatsApp-диалоги учитываются в лидах и CPL, но не
          проходят воронку 1С.
        </div>
      </CardContent>
    </Card>
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
