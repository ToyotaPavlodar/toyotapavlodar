import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/dashboard.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { formatKzt, formatPct } from "@/lib/format";

type Dash = Awaited<ReturnType<typeof getDashboard>>;

export function AdEfficiencyPanel({ month }: { month: string }) {
  const call = useServerFn(getDashboard);
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    call({ data: { month } })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, call]);

  if (error) return null; // тихо скрываем для ролей без доступа к аналитике

  const t = data?.totals;
  const mom = data?.mom;

  const spendDelta = mom?.spend_delta_pct ?? 0;
  const cplDelta = mom?.cpl_delta_pct ?? 0;

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-brand/5 via-transparent to-transparent px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Эффективность рекламы</div>
            <div className="text-xs text-muted-foreground">
              {loading ? "Загрузка…" : "За выбранный месяц · Meta Ads → CRM"}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="p-4">
          {loading && !t && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary/60" />
              ))}
            </div>
          )}

          {t && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label="Расход"
                  value={formatKzt(t.spend_kzt)}
                  delta={spendDelta}
                  invert
                />
                <Metric
                  label="CPL"
                  value={t.cpl_kzt > 0 ? formatKzt(t.cpl_kzt) : "—"}
                  delta={cplDelta}
                  invert
                />
                <Metric
                  label="CPQL"
                  value={t.cpql_kzt > 0 ? formatKzt(t.cpql_kzt) : "—"}
                  hint="цена квал. лида"
                />
                <Metric
                  label="Цена в 1С"
                  value={t.cps1c_kzt > 0 ? formatKzt(t.cps1c_kzt) : "—"}
                  hint="1С ÷ расход"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Лидов" value={t.leads} />
                <MiniStat label="Дозвон" value={`${formatPct(t.lead_to_call_pct)}`} />
                <MiniStat label="Квал ÷ дозвон" value={formatPct(t.call_to_qual_pct)} />
                <MiniStat label="Конверсия в 1С" value={formatPct(t.lead_to_1c_pct)} />
              </div>

              {data && data.by_brand.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-secondary/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Бренд</th>
                        <th className="px-3 py-2 text-right font-semibold">Расход</th>
                        <th className="px-3 py-2 text-right font-semibold">Лиды</th>
                        <th className="px-3 py-2 text-right font-semibold">CPL</th>
                        <th className="px-3 py-2 text-right font-semibold">Квал</th>
                        <th className="px-3 py-2 text-right font-semibold">В 1С</th>
                        <th className="px-3 py-2 text-right font-semibold">Конв.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_brand.map((b) => {
                        const conv = b.leads > 0 ? (b.sent_to_1c / b.leads) * 100 : 0;
                        return (
                          <tr
                            key={b.id}
                            className="border-t border-border/50 transition-colors hover:bg-accent/40"
                          >
                            <td className="px-3 py-2">
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                                style={{
                                  borderColor: `${b.color}55`,
                                  backgroundColor: `${b.color}12`,
                                  color: b.color,
                                }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: b.color }}
                                />
                                {b.name}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {b.spend_kzt > 0 ? formatKzt(b.spend_kzt) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.leads}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {b.cpl_kzt > 0 ? formatKzt(b.cpl_kzt) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.qualified}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.sent_to_1c}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-success">
                              {formatPct(conv)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  delta,
  invert,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  invert?: boolean;
  hint?: string;
}) {
  const showDelta = typeof delta === "number" && Math.abs(delta) > 0.5;
  // invert=true — рост это плохо (CPL, расход); зелёный при снижении
  const good = showDelta ? (invert ? delta! < 0 : delta! > 0) : false;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px]">
        {showDelta ? (
          <span
            className={`inline-flex items-center gap-0.5 font-medium ${
              good ? "text-success" : "text-warning"
            }`}
          >
            {delta! > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(delta!).toFixed(0)}% к прошл. мес.
          </span>
        ) : (
          <span className="text-muted-foreground">{hint ?? "\u00A0"}</span>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
