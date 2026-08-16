import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, memo, type MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { updateLead, createManualLead, exportLeadsCsv } from "@/lib/leads.functions";
import { listAssignees } from "@/lib/assignees.functions";
import { syncRecentMetaLeads } from "@/lib/sync.functions";
import { useSessionProfile, canSeeAllBrands } from "@/lib/auth-hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Download, Plus, X, Check, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/format";
import {
  dateBoundsUtc,
  type DatePeriod,
  thisMonthPeriod,
  todayUtcDate,
  periodLabelRu,
} from "@/lib/month-range";
import { PeriodPicker } from "@/components/PeriodPicker";
import type { Database } from "@/integrations/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];
type Assignee = Awaited<ReturnType<typeof listAssignees>>[number];
type StatusFilter = "all" | "no_event" | "event" | "not_called" | "called" | "qualified" | "sent_1c";

function periodRange(period: DatePeriod): { fromISO: string; toISO: string } {
  const b = dateBoundsUtc(period.from, period.to);
  return { fromISO: b.fromIso, toISO: b.toExclusiveIso };
}

function periodIncludesToday(period: DatePeriod): boolean {
  const today = todayUtcDate();
  return period.from <= today && period.to >= today;
}

/** Meta lead form values often arrive as snake_case — show them readably. */
function formatInterest(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
type PatchFields = Partial<
  Pick<
    LeadRow,
    | "assigned_to"
    | "event_created"
    | "called"
    | "qualified"
    | "sent_to_1c"
    | "brand_id"
    | "name"
    | "interest"
    | "city"
  >
>;

const LEADS_GRID =
  "grid w-full grid-cols-[minmax(72px,0.75fr)_minmax(0,1.55fr)_minmax(0,1.15fr)_minmax(0,1.25fr)_minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,1.05fr)_minmax(150px,1.35fr)_minmax(0,2fr)] gap-x-4";
const HEAD =
  "px-1 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
const HEAD_CENTER = `${HEAD} text-center`;
const CELL = "min-w-0 px-1 py-2.5 text-xs leading-snug";
const CELL_CENTER = "min-w-0 px-1 py-2.5 text-center";

function LeadFunnelSwitches({
  lead: l,
  canEdit,
  onPatch,
  size = "compact",
}: {
  lead: LeadRow;
  canEdit: boolean;
  onPatch: (patch: PatchFields) => void;
  size?: "compact" | "comfortable";
}) {
  const steps = [
    {
      key: "event",
      title: "Событие",
      checked: l.event_created === true,
      disabled: !canEdit,
      onChange: (v: boolean) =>
        onPatch({
          event_created: v,
          called: v ? l.called : null,
          qualified: v ? l.qualified : null,
          sent_to_1c: v ? l.sent_to_1c : false,
        }),
    },
    {
      key: "call",
      title: "Дозвон",
      checked: l.called === true,
      disabled: !canEdit || l.event_created !== true,
      onChange: (v: boolean) =>
        onPatch({
          called: v,
          qualified: v ? l.qualified : null,
          sent_to_1c: v ? l.sent_to_1c : false,
        }),
    },
    {
      key: "qual",
      title: "Квал",
      checked: l.qualified === true,
      disabled: !canEdit || l.called !== true,
      onChange: (v: boolean) => onPatch({ qualified: v, sent_to_1c: v ? l.sent_to_1c : false }),
    },
    {
      key: "1c",
      title: "РЛ",
      checked: l.sent_to_1c,
      disabled: !canEdit || l.qualified !== true,
      onChange: (v: boolean) => onPatch({ sent_to_1c: v }),
    },
  ] as const;

  const comfortable = size === "comfortable";
  return (
    <div className={comfortable ? "w-full" : CELL_CENTER}>
      <div className={`flex w-full items-start justify-between ${comfortable ? "gap-1" : "gap-2"}`}>
        {steps.map((step) => (
          <div key={step.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Switch
              className={comfortable ? "scale-100" : "scale-[0.82]"}
              checked={step.checked}
              disabled={step.disabled}
              onCheckedChange={step.onChange}
              title={step.title}
            />
            <span
              className={`truncate leading-none text-muted-foreground ${comfortable ? "text-[10px] font-medium" : "text-[9px]"}`}
            >
              {step.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Preserve row object identity when refetch data is unchanged — avoids re-rendering 1000+ rows. */
function leadRowEqual(a: LeadRow, b: LeadRow): boolean {
  return (
    a.id === b.id &&
    a.created_at === b.created_at &&
    a.name === b.name &&
    a.phone === b.phone &&
    a.interest === b.interest &&
    a.city === b.city &&
    a.brand_id === b.brand_id &&
    a.assigned_to === b.assigned_to &&
    a.source === b.source &&
    a.event_created === b.event_created &&
    a.called === b.called &&
    a.qualified === b.qualified &&
    a.sent_to_1c === b.sent_to_1c &&
    a.comment === b.comment
  );
}

function mergeLeadRows(prev: LeadRow[], incoming: LeadRow[]): LeadRow[] {
  if (prev.length === 0) return incoming;
  const prevById = new Map(prev.map((l) => [l.id, l]));
  return incoming.map((row) => {
    const old = prevById.get(row.id);
    return old && leadRowEqual(old, row) ? old : row;
  });
}

/** Все лиды периода без потерь: Supabase отдаёт максимум 1000 строк за запрос. */
async function fetchLeadsRange(fromISO: string, toISO: string): Promise<LeadRow[]> {
  const pageSize = 1000;
  const out: LeadRow[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .gte("created_at", fromISO)
      .lt("created_at", toISO)
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) break;
    const rows = (data ?? []) as LeadRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}



function assigneeLabel(a: Assignee): string {
  return `${a.name} · ${a.brand_name}`;
}

/** Для админа — все; иначе только по бренду лида (если есть совпадения). */
function assigneesForSelect(
  assignees: Assignee[],
  brandId: string | null | undefined,
  showAll: boolean,
): Assignee[] {
  if (showAll || !brandId) {
    return [...assignees].sort((a, b) => {
      if (brandId) {
        const aMatch = a.brand_id === brandId ? 0 : 1;
        const bMatch = b.brand_id === brandId ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return a.name.localeCompare(b.name, "ru");
    });
  }
  const matched = assignees.filter((a) => a.brand_id === brandId);
  return matched.length > 0 ? matched : assignees;
}

function AssigneeSelect({
  value,
  assignees,
  brandId,
  disabled,
  onChange,
  compact = false,
  showAll = false,
}: {
  value: string | null | undefined;
  assignees: Assignee[];
  brandId?: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
  compact?: boolean;
  /** Админ видит полный список ответственных по всем брендам */
  showAll?: boolean;
}) {
  const options = assigneesForSelect(assignees, brandId, showAll);
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger
        className={
          compact ? "h-7 w-full min-w-0 bg-background text-[10px] shadow-sm [&>span]:truncate" : undefined
        }
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {assigneeLabel(a)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Лиды — Автодом Павлодар" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const { profile } = useSessionProfile();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [period, setPeriod] = useState<DatePeriod>(() => thisMonthPeriod());
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [assigneeFilterReady, setAssigneeFilterReady] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  /** Lead ids with an active comment field — pauses background refetch to avoid table freeze. */
  const editingCommentsRef = useRef(new Set<string>());
  /**
   * Незакреплённые изменения тумблеров: фоновая перезагрузка/realtime могут
   * вернуть строку из БД до того, как сохранение доедет, и тумблер «отскакивал».
   * Здесь держим локальные значения, пока сервер не подтвердит их же.
   */
  const pendingPatchRef = useRef(new Map<string, { patch: PatchFields; ts: number }>());
  const applyPending = useCallback((rows: LeadRow[]): LeadRow[] => {
    const pending = pendingPatchRef.current;
    if (pending.size === 0) return rows;
    const now = Date.now();
    return rows.map((row) => {
      const entry = pending.get(row.id);
      if (!entry) return row;
      if (now - entry.ts > 20000) {
        pending.delete(row.id);
        return row;
      }
      const confirmed = Object.entries(entry.patch).every(
        ([k, v]) => (row as Record<string, unknown>)[k] === v,
      );
      if (confirmed) {
        pending.delete(row.id);
        return row;
      }
      return { ...row, ...entry.patch } as LeadRow;
    });
  }, []);


  // Deferred search keeps typing snappy even with hundreds of rows.
  const deferredSearch = useDeferredValue(search);

  const doUpdate = useServerFn(updateLead);
  const doCreate = useServerFn(createManualLead);
  const doExport = useServerFn(exportLeadsCsv);
  const doPullRecent = useServerFn(syncRecentMetaLeads);
  const doListAssignees = useServerFn(listAssignees);

  const canEditLeads =
    profile?.roles.some((r) => r === "admin" || r === "manager" || r === "operator") ?? false;

  const seeAllBrands = canSeeAllBrands(profile);
  const scopedBrandId = profile?.brandId ?? null;
  const myAssigneeId = profile?.assigneeId ?? null;
  const visibleBrands = seeAllBrands ? brands : brands.filter((b) => b.id === scopedBrandId);

  useEffect(() => {
    if (scopedBrandId && !seeAllBrands) {
      setBrandFilter(scopedBrandId);
    }
  }, [scopedBrandId, seeAllBrands]);

  // Ответственный по умолчанию видит только свои назначенные сделки
  useEffect(() => {
    if (!profile || assigneeFilterReady) return;
    if (myAssigneeId && !seeAllBrands) {
      setAssigneeFilter(myAssigneeId);
    }
    setAssigneeFilterReady(true);
  }, [profile, myAssigneeId, seeAllBrands, assigneeFilterReady]);

  const isLivePeriod = periodIncludesToday(period);
  const periodLabel = periodLabelRu(period.from, period.to);

  // Brands + assignees — load once.
  useEffect(() => {
    let mounted = true;
    Promise.all([
      supabase.from("brands").select("*").order("sort_order"),
      doListAssignees(),
    ]).then(([{ data: brandRows }, assigneeRows]) => {
      if (!mounted) return;
      setBrands(brandRows ?? []);
      setAssignees(assigneeRows);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Pull new Meta leads into DB while this page is open (Vercel Hobby = 1 cron/day max).
  useEffect(() => {
    if (!isLivePeriod) return;
    let cancelled = false;

    async function pullMetaLeads(hours = 12) {
      try {
        await doPullRecent({ data: { hours } });
        if (cancelled) return;
        const { fromISO, toISO } = periodRange(period);
        const data = await fetchLeadsRange(fromISO, toISO);
        if (!cancelled) {
          if (editingCommentsRef.current.size > 0) return;
          setLeads((prev) => applyPending(mergeLeadRows(prev, data ?? [])));
          setLastSync(new Date());
        }
      } catch {
        /* ignore — realtime + периодический refetch ниже покроют */
      }
    }

    // При открытии страницы — окно 48 ч, дальше короткие опросы раз в 10 минут,
    // чтобы не упираться в лимиты Meta API.
    void pullMetaLeads(48);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void pullMetaLeads(12);
    }, 10 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pullMetaLeads();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isLivePeriod, period.from, period.to]);

  // Leads — reload per selected month and keep them fresh.
  // Realtime is the fast path; a periodic refetch + refetch-on-focus is a
  // reliable fallback in case the realtime socket is unavailable or drops.
  useEffect(() => {
    let mounted = true;
    const { fromISO, toISO } = periodRange(period);
    const inPeriod = (l: LeadRow) => l.created_at >= fromISO && l.created_at < toISO;

    async function loadLeads(initial = false) {
      if (!initial && editingCommentsRef.current.size > 0) return;
      if (initial) setLoading(true);
      const data = await fetchLeadsRange(fromISO, toISO);
      if (!mounted) return;
      setLeads((prev) => applyPending(mergeLeadRows(prev, data ?? [])));
      setLastSync(new Date());
      if (initial) setLoading(false);
    }

    loadLeads(true);

    const channel = supabase
      .channel(`leads-live-${period.from}_${period.to}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLastSync(new Date());
        setLeads((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as LeadRow;
            if (!inPeriod(row) || prev.some((l) => l.id === row.id)) return prev;
            return [row, ...prev];
          }
          if (payload.eventType === "UPDATE") {
            const incoming = payload.new as LeadRow;
            const [row] = applyPending([incoming]);
            const exists = prev.some((l) => l.id === incoming.id);
            if (!exists) return inPeriod(row!) ? [row!, ...prev] : prev;
            return prev.map((l) => {
              if (l.id !== incoming.id) return l;
              if (editingCommentsRef.current.has(incoming.id)) {
                const merged = { ...row!, comment: l.comment };
                return leadRowEqual(l, merged) ? l : merged;
              }
              return leadRowEqual(l, row!) ? l : row!;
            });
          }

          if (payload.eventType === "DELETE") {
            return prev.filter((l) => l.id !== (payload.old as LeadRow).id);
          }
          return prev;
        });
      })
      .subscribe();

    // Fallback: refetch every 20s while the tab is visible, and on refocus.
    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") loadLeads();
    }, 20000);
    const onFocus = () => loadLeads();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [period.from, period.to]);

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b] as const)), [brands]);

  // Leads limited to the active brand tab (used for the summary counters).
  const brandScoped = useMemo(
    () => (brandFilter === "all" ? leads : leads.filter((l) => l.brand_id === brandFilter)),
    [leads, brandFilter],
  );

  const stats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let events = 0,
      called = 0,
      notCalled = 0,
      qualified = 0,
      sent = 0,
      today = 0;
    for (const l of brandScoped) {
      if (l.event_created === true) events++;
      if (l.called === true) called++;
      else notCalled++;
      if (l.qualified === true) qualified++;
      if (l.sent_to_1c) sent++;
      if (new Date(l.created_at) >= start) today++;
    }
    return { total: brandScoped.length, events, called, notCalled, qualified, sent, today };
  }, [brandScoped]);

  const filtered = useMemo(() => {
    const s = deferredSearch.trim().toLowerCase();
    return brandScoped.filter((l) => {
      if (statusFilter === "no_event" && l.event_created === true) return false;
      if (statusFilter === "event" && l.event_created !== true) return false;
      if (statusFilter === "not_called" && l.called === true) return false;
      if (statusFilter === "called" && l.called !== true) return false;
      if (statusFilter === "qualified" && l.qualified !== true) return false;
      if (statusFilter === "sent_1c" && !l.sent_to_1c) return false;
      if (assigneeFilter === "__none__") {
        if (l.assigned_to) return false;
      } else if (assigneeFilter !== "all" && l.assigned_to !== assigneeFilter) {
        return false;
      }
      if (s) {
        if (!(l.name?.toLowerCase().includes(s) || l.phone?.toLowerCase().includes(s)))
          return false;
      }
      return true;
    });
  }, [brandScoped, statusFilter, deferredSearch, assigneeFilter]);

  const hasFilters =
    statusFilter !== "all" || assigneeFilter !== "all" || search.trim() !== "";
  const patch = useCallback(
    async (id: string, patchData: PatchFields) => {
      setLeads((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patchData } as LeadRow) : l)));
      try {
        await doUpdate({ data: { id, patch: patchData } });
      } catch (e) {
        toast.error((e as Error).message);
        const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
        if (data) setLeads((prev) => prev.map((l) => (l.id === id ? data : l)));
      }
    },
    [doUpdate],
  );

  const saveComment = useCallback(
    async (id: string, comment: string) => {
      try {
        await doUpdate({ data: { id, patch: { comment } } });
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== id) return l;
            return l.comment === comment ? l : ({ ...l, comment } as LeadRow);
          }),
        );
        toast.success("Комментарий сохранён");
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    [doUpdate],
  );

  async function onExport() {
    const { fromISO, toISO } = periodRange(period);
    const res = await doExport({
      data: { from: fromISO, to: toISO, brand_id: brandFilter === "all" ? undefined : brandFilter },
    });
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${period.from}_${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleStatus(v: StatusFilter) {
    setStatusFilter((cur) => (cur === v ? "all" : v));
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-8 xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
            Лиды
            {isLivePeriod && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Заявки за выбранный период: <b className="text-foreground">{periodLabel}</b>
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <PeriodPicker value={period} onChange={setPeriod} className="w-full min-w-0 sm:w-auto" />
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={onExport}>
              <Download className="mr-1 h-4 w-4" />
              CSV
            </Button>
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button variant="brand" className="flex-1 sm:flex-none">
                  <Plus className="mr-1 h-4 w-4" />
                  Добавить
                </Button>
              </DialogTrigger>
            <NewLeadDialog
              brands={visibleBrands.length ? visibleBrands : brands}
              assignees={assignees}
              showAllAssignees={seeAllBrands}
              onClose={() => setOpenNew(false)}
              doCreate={doCreate}
            />
            </Dialog>
          </div>
        </div>
      </div>

      {/* Clickable summary — doubles as quick status filter */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <StatChip
          label="Всего"
          value={stats.total}
          hint={`сегодня +${stats.today}`}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
          tone="neutral"
        />
        <StatChip
          label="Событие"
          value={stats.events}
          active={statusFilter === "event"}
          onClick={() => toggleStatus("event")}
          tone="brand"
        />
        <StatChip
          label="Дозвон"
          value={stats.called}
          active={statusFilter === "called"}
          onClick={() => toggleStatus("called")}
          tone="brand"
        />
        <StatChip
          label="Квал"
          value={stats.qualified}
          active={statusFilter === "qualified"}
          onClick={() => toggleStatus("qualified")}
          tone="success"
        />
        <StatChip
          label="РЛ"
          value={stats.sent}
          active={statusFilter === "sent_1c"}
          onClick={() => toggleStatus("sent_1c")}
          tone="success"
        />
        <StatChip
          label="Без событ."
          value={stats.total - stats.events}
          active={statusFilter === "no_event"}
          onClick={() => toggleStatus("no_event")}
          tone="warning"
        />
        <StatChip
          label="Конверсия"
          value={stats.total ? `${Math.round((stats.sent / stats.total) * 100)}%` : "—"}
          hint="РЛ ÷ всего"
          tone="neutral"
        />
      </div>



      <Card className="p-4">
        {seeAllBrands ? (
          <Tabs value={brandFilter} onValueChange={setBrandFilter}>
            <TabsList className="h-auto flex-wrap gap-1">
              <TabsTrigger value="all">Все</TabsTrigger>
              {visibleBrands.map((b) => (
                <TabsTrigger key={b.id} value={b.id} className="gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                  {b.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          profile?.brandName && (
            <div className="flex items-center gap-2 text-sm font-medium">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: visibleBrands[0]?.color ?? "#888" }}
              />
              {profile.brandName}
              <span className="text-xs font-normal text-muted-foreground">· только ваш бренд</span>
            </div>
          )
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или номеру"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-9 w-full shrink-0 text-xs sm:w-[170px]">
              <SelectValue placeholder="Ответственный" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ответственные</SelectItem>
              <SelectItem value="__none__">Без ответственного</SelectItem>
              {myAssigneeId && (
                <SelectItem value={myAssigneeId}>
                  Мои заявки{profile?.assigneeName ? ` · ${profile.assigneeName}` : ""}
                </SelectItem>
              )}
              {assignees
                .filter((a) => a.id !== myAssigneeId)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {assigneeLabel(a)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Показано <b className="text-foreground">{filtered.length}</b> из {stats.total}
            {lastSync && (
              <span className="ml-2 hidden text-xs opacity-70 sm:inline">
                · обновлено {lastSync.toLocaleTimeString("ru-RU")}
              </span>
            )}
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("all");
                setAssigneeFilter("all");
                setSearch("");
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      <Card className="w-full overflow-hidden p-0 shadow-sm">
        <div className="max-h-[min(70vh,calc(100dvh-16rem))] w-full overflow-y-auto md:max-h-[calc(100vh-330px)]">
          <div className="w-full min-w-0 px-2 sm:px-3">
            <div
              className={`${LEADS_GRID} sticky top-0 z-10 hidden border-b border-border/80 bg-secondary/95 backdrop-blur-sm md:grid`}
            >
              <div className={HEAD}>Дата</div>
              <div className={HEAD}>Имя</div>
              <div className={HEAD}>Телефон</div>
              <div className={HEAD}>Интерес</div>
              <div className={HEAD}>Город</div>
              <div className={HEAD}>Бренд</div>
              <div className={HEAD}>Ответств.</div>
              <div className={HEAD_CENTER}>Воронка</div>
              <div className={HEAD}>Комментарий</div>
            </div>

            {loading && (
              <div className="py-12 text-center text-sm text-muted-foreground">Загрузка…</div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="py-14 text-center">
                <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-muted-foreground">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                    <Search className="h-5 w-5" />
                  </span>
                  <span className="font-medium text-foreground">
                    {hasFilters ? "Ничего не найдено" : "Лидов пока нет"}
                  </span>
                  <span className="text-sm">
                    {hasFilters
                      ? "Попробуйте изменить фильтры или поиск."
                      : "Заявки появятся здесь автоматически или добавьте вручную."}
                  </span>
                </div>
              </div>
            )}

            {filtered.map((l, i) => (
              <LeadItem
                key={l.id}
                lead={l}
                brand={l.brand_id ? (brandById.get(l.brand_id) ?? null) : null}
                assignees={assignees}
                canEdit={canEditLeads}
                showAllAssignees={seeAllBrands}
                onPatch={patch}
                onSaveComment={saveComment}
                editingCommentsRef={editingCommentsRef}
                striped={i % 2 === 1}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

const TONES = {
  neutral: "text-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
} as const;

function StatChip({
  label,
  value,
  hint,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  tone: keyof typeof TONES;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`rounded-xl border bg-card p-3 text-left transition-all ${
        clickable ? "cursor-pointer hover:border-brand/30 hover:shadow-sm" : "cursor-default"
      } ${active ? "border-brand bg-brand/5 ring-1 ring-brand/30" : "border-border/60"}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight ${TONES[tone]}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </button>
  );
}

const LeadItem = memo(function LeadItem({
  lead: l,
  brand,
  assignees,
  canEdit,
  showAllAssignees = false,
  onPatch,
  onSaveComment,
  editingCommentsRef,
  striped,
}: {
  lead: LeadRow;
  brand: Brand | null;
  assignees: Assignee[];
  canEdit: boolean;
  showAllAssignees?: boolean;
  onPatch: (id: string, patch: PatchFields) => void;
  onSaveComment: (id: string, comment: string) => void;
  editingCommentsRef: MutableRefObject<Set<string>>;
  striped?: boolean;
}) {
  const phone = l.phone ?? "";
  const interestLabel = formatInterest(l.interest);
  const handleSaveComment = useCallback(
    (comment: string) => onSaveComment(l.id, comment),
    [l.id, onSaveComment],
  );
  const dateShort = new Date(l.created_at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const brandBadge = brand ? (
    <span
      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        borderColor: `${brand.color}44`,
        backgroundColor: `${brand.color}14`,
        color: brand.color,
      }}
      title={brand.name}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: brand.color }} />
      <span className="truncate">{brand.name}</span>
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

  return (
    <>
      {/* Mobile card */}
      <div className="border-b border-border/50 py-3 md:hidden">
        <div className="rounded-xl border border-border/60 bg-card p-3 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {brandBadge}
                <span className="text-[11px] tabular-nums text-muted-foreground">{dateShort}</span>
              </div>
              <div className="mt-1.5 text-base font-semibold leading-snug">
                {l.name?.trim() || <span className="text-muted-foreground">Без имени</span>}
              </div>
              {interestLabel !== "—" && (
                <div className="mt-0.5 text-xs text-muted-foreground">{interestLabel}</div>
              )}
              {l.city?.trim() && (
                <div className="mt-0.5 text-xs text-muted-foreground">{l.city}</div>
              )}
            </div>
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm active:scale-95"
                aria-label={`Позвонить ${phone}`}
              >
                <Phone className="h-5 w-5" />
              </a>
            ) : null}
          </div>

          {phone ? (
            <a href={`tel:${phone}`} className="mt-2 block font-mono text-sm font-medium text-brand">
              {phone}
            </a>
          ) : null}

          <div className="mt-3 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ответственный
            </div>
            <AssigneeSelect
              assignees={assignees}
              brandId={l.brand_id}
              showAll={showAllAssignees}
              value={l.assigned_to}
              disabled={!canEdit}
              onChange={(id) => onPatch(l.id, { assigned_to: id })}
            />
          </div>

          <div className="mt-3 rounded-lg bg-secondary/40 px-2 py-2.5">
            <LeadFunnelSwitches
              lead={l}
              canEdit={canEdit}
              size="comfortable"
              onPatch={(patch) => onPatch(l.id, patch)}
            />
          </div>

          <div className="mt-3">
            <InlineComment
              leadId={l.id}
              initialValue={l.comment ?? ""}
              canEdit={canEdit}
              onSave={handleSaveComment}
              editingRef={editingCommentsRef}
            />
          </div>
        </div>
      </div>

      {/* Desktop grid row */}
      <div
        className={`${LEADS_GRID} hidden border-b border-border/40 transition-colors hover:bg-accent/30 md:grid ${striped ? "bg-muted/15" : ""}`}
      >
        <div className={`${CELL} text-[11px] tabular-nums text-muted-foreground`}>
          <div className="leading-tight">
            <div>{new Date(l.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>
            <div>{new Date(l.created_at).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
        <div className={`${CELL} font-medium`} title={l.name ?? undefined}>
          {l.name ? (
            <span className="line-clamp-2 break-words">{l.name}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className={CELL}>
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="block truncate font-medium tabular-nums text-brand hover:underline"
              title={phone}
            >
              {phone}
            </a>
          ) : (
            "—"
          )}
        </div>
        <div className={`${CELL} truncate text-muted-foreground`} title={interestLabel}>
          {interestLabel}
        </div>
        <div className={`${CELL} break-words`} title={l.city ?? undefined}>
          {l.city?.trim() || "—"}
        </div>
        <div className={CELL}>{brandBadge}</div>
        <div className={CELL}>
          <AssigneeSelect
            compact
            assignees={assignees}
            brandId={l.brand_id}
            showAll={showAllAssignees}
            value={l.assigned_to}
            disabled={!canEdit}
            onChange={(id) => onPatch(l.id, { assigned_to: id })}
          />
        </div>
        <LeadFunnelSwitches
          lead={l}
          canEdit={canEdit}
          onPatch={(patch) => onPatch(l.id, patch)}
        />
        <div className={CELL}>
          <InlineComment
            leadId={l.id}
            initialValue={l.comment ?? ""}
            canEdit={canEdit}
            onSave={handleSaveComment}
            editingRef={editingCommentsRef}
          />
        </div>
      </div>
    </>
  );
});

function InlineComment({
  leadId,
  initialValue,
  canEdit,
  onSave,
  editingRef,
}: {
  leadId: string;
  initialValue: string;
  canEdit: boolean;
  onSave: (comment: string) => void | Promise<void>;
  editingRef: MutableRefObject<Set<string>>;
}) {
  const [v, setV] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(initialValue);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!editing && initialValue !== savedRef.current) {
      savedRef.current = initialValue;
      setV(initialValue);
    }
  }, [initialValue, editing]);

  const cancel = useCallback(() => {
    editingRef.current.delete(leadId);
    setV(savedRef.current);
    setEditing(false);
  }, [leadId, editingRef]);

  const save = useCallback(async () => {
    const pending = v.trim();
    const normalized = pending === "" ? "" : pending;
    if (normalized === savedRef.current) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onSaveRef.current(normalized);
      savedRef.current = normalized;
      setV(normalized);
      editingRef.current.delete(leadId);
      setEditing(false);
    } catch {
      /* toast in saveComment */
    } finally {
      setSaving(false);
    }
  }, [v, cancel, leadId, editingRef]);

  if (!canEdit) {
    return (
      <div className="min-h-[32px] px-1.5 py-1 text-xs leading-relaxed text-foreground">
        {initialValue.trim() ? (
          <span className="line-clamp-3 whitespace-pre-wrap break-words">{initialValue}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="min-h-[32px] w-full rounded-md border border-transparent px-1.5 py-1 text-left hover:border-border/80 hover:bg-background"
        onClick={() => {
          editingRef.current.add(leadId);
          setEditing(true);
        }}
      >
        {v.trim() ? (
          <span className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
            {v}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">+ комментарий</span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        autoFocus
        value={v}
        disabled={saving}
        onFocus={() => editingRef.current.add(leadId)}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") cancel();
        }}
        rows={2}
        className="min-h-[52px] w-full resize-y rounded-md border-border/80 bg-background px-2 py-1.5 text-xs leading-relaxed shadow-sm"
        placeholder="Комментарий…"
      />
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="brand"
          className="h-7 px-2.5 text-[11px]"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          Сохранить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          disabled={saving}
          onClick={cancel}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}

function NewLeadDialog({
  brands,
  assignees,
  showAllAssignees = false,
  onClose,
  doCreate,
}: {
  brands: Brand[];
  assignees: Assignee[];
  showAllAssignees?: boolean;
  onClose: () => void;
  doCreate: ReturnType<typeof useServerFn<typeof createManualLead>>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [city, setCity] = useState("");
  const [brandId, setBrandId] = useState<string | undefined>();
  const [assignedTo, setAssignedTo] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const brandAssignees = useMemo(
    () => assigneesForSelect(assignees, brandId, showAllAssignees),
    [assignees, brandId, showAllAssignees],
  );

  useEffect(() => {
    if (assignedTo && !brandAssignees.some((a) => a.id === assignedTo)) {
      setAssignedTo(undefined);
    }
    if (!assignedTo && brandAssignees.length === 1) {
      setAssignedTo(brandAssignees[0].id);
    }
  }, [brandAssignees, assignedTo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await doCreate({
        data: {
          name,
          phone: normalizePhone(phone),
          interest,
          city,
          brand_id: brandId,
          assigned_to: assignedTo ?? null,
        },
      });
      toast.success("Лид добавлен");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Новый лид (вручную)</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Имя</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Телефон</Label>
          <Input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 777 000 00 00"
          />
        </div>
        <div>
          <Label>Что интересует</Label>
          <Input value={interest} onChange={(e) => setInterest(e.target.value)} />
        </div>
        <div>
          <Label>Город</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Павлодар" />
        </div>
        <div>
          <Label>Бренд</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger>
              <SelectValue placeholder="Выбрать" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Ответственный</Label>
          <AssigneeSelect
            assignees={assignees}
            brandId={brandId}
            showAll={showAllAssignees}
            value={assignedTo}
            onChange={(id) => setAssignedTo(id ?? undefined)}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение…" : "Создать"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
