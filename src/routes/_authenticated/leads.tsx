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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/format";
import { monthBoundsUtc, monthKeyFromDate, monthLabelRu, shiftMonthKey } from "@/lib/month-range";
import type { Database } from "@/integrations/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];
type Assignee = Awaited<ReturnType<typeof listAssignees>>[number];
type StatusFilter = "all" | "no_event" | "event" | "not_called" | "called" | "qualified" | "sent_1c";

function monthKey(d: Date): string {
  return monthKeyFromDate(d);
}
function monthLabel(key: string): string {
  return monthLabelRu(key);
}
function monthRange(key: string): { fromISO: string; toISO: string } {
  const b = monthBoundsUtc(key);
  return { fromISO: b.fromIso, toISO: b.toExclusiveIso };
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

const HEAD =
  "sticky top-0 z-10 bg-secondary/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm";
const HEAD_TOGGLE = `${HEAD} px-1 text-center`;
const CELL = "px-2 py-2 align-top text-xs leading-snug";
const CELL_TOGGLE = "w-11 px-1 py-2 text-center align-middle";

function LeadFunnelSwitches({
  lead: l,
  canEdit,
  onPatch,
}: {
  lead: LeadRow;
  canEdit: boolean;
  onPatch: (patch: PatchFields) => void;
}) {
  return (
    <>
      <TableCell className={CELL_TOGGLE}>
        <Switch
          className="scale-[0.85]"
          checked={l.event_created === true}
          disabled={!canEdit}
          onCheckedChange={(v) =>
            onPatch({
              event_created: v,
              called: v ? l.called : null,
              qualified: v ? l.qualified : null,
              sent_to_1c: v ? l.sent_to_1c : false,
            })
          }
        />
      </TableCell>
      <TableCell className={CELL_TOGGLE}>
        <Switch
          className="scale-[0.85]"
          checked={l.called === true}
          disabled={!canEdit || l.event_created !== true}
          onCheckedChange={(v) =>
            onPatch({
              called: v,
              qualified: v ? l.qualified : null,
              sent_to_1c: v ? l.sent_to_1c : false,
            })
          }
        />
      </TableCell>
      <TableCell className={CELL_TOGGLE}>
        <Switch
          className="scale-[0.85]"
          checked={l.qualified === true}
          disabled={!canEdit || l.called !== true}
          onCheckedChange={(v) => onPatch({ qualified: v, sent_to_1c: v ? l.sent_to_1c : false })}
        />
      </TableCell>
      <TableCell className={CELL_TOGGLE}>
        <Switch
          className="scale-[0.85]"
          checked={l.sent_to_1c}
          disabled={!canEdit || l.qualified !== true}
          onCheckedChange={(v) => onPatch({ sent_to_1c: v })}
        />
      </TableCell>
    </>
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

function assigneeLabel(a: Assignee): string {
  return `${a.name} · ${a.brand_name}`;
}

function assigneesForBrand(assignees: Assignee[], brandId: string | null | undefined): Assignee[] {
  if (!brandId) return assignees;
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
}: {
  value: string | null | undefined;
  assignees: Assignee[];
  brandId?: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const options = assigneesForBrand(assignees, brandId);
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
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  /** Lead ids with an active comment field — pauses background refetch to avoid table freeze. */
  const editingCommentsRef = useRef(new Set<string>());

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
  const visibleBrands = seeAllBrands ? brands : brands.filter((b) => b.id === scopedBrandId);

  useEffect(() => {
    if (scopedBrandId && !seeAllBrands) {
      setBrandFilter(scopedBrandId);
    }
  }, [scopedBrandId, seeAllBrands]);

  const isCurrentMonth = month === monthKey(new Date());

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
    if (!isCurrentMonth) return;
    let cancelled = false;

    async function pullMetaLeads() {
      try {
        await doPullRecent({ data: { hours: 48 } });
        if (cancelled) return;
        const { fromISO, toISO } = monthRange(month);
        const { data } = await supabase
          .from("leads")
          .select("*")
          .gte("created_at", fromISO)
          .lt("created_at", toISO)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (!cancelled) {
          if (editingCommentsRef.current.size > 0) return;
          setLeads((prev) => mergeLeadRows(prev, data ?? []));
          setLastSync(new Date());
        }
      } catch {
        /* ignore — realtime + периодический refetch ниже покроют */
      }
    }

    void pullMetaLeads();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void pullMetaLeads();
    }, 3 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pullMetaLeads();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isCurrentMonth, month]);

  // Leads — reload per selected month and keep them fresh.
  // Realtime is the fast path; a periodic refetch + refetch-on-focus is a
  // reliable fallback in case the realtime socket is unavailable or drops.
  useEffect(() => {
    let mounted = true;
    const { fromISO, toISO } = monthRange(month);
    const inMonth = (l: LeadRow) => l.created_at >= fromISO && l.created_at < toISO;

    async function loadLeads(initial = false) {
      if (!initial && editingCommentsRef.current.size > 0) return;
      if (initial) setLoading(true);
      const { data } = await supabase
        .from("leads")
        .select("*")
        .gte("created_at", fromISO)
        .lt("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!mounted) return;
      setLeads((prev) => mergeLeadRows(prev, data ?? []));
      setLastSync(new Date());
      if (initial) setLoading(false);
    }

    loadLeads(true);

    const channel = supabase
      .channel(`leads-live-${month}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLastSync(new Date());
        setLeads((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as LeadRow;
            if (!inMonth(row) || prev.some((l) => l.id === row.id)) return prev;
            return [row, ...prev];
          }
          if (payload.eventType === "UPDATE") {
            const row = payload.new as LeadRow;
            const exists = prev.some((l) => l.id === row.id);
            if (!exists) return inMonth(row) ? [row, ...prev] : prev;
            return prev.map((l) => {
              if (l.id !== row.id) return l;
              if (editingCommentsRef.current.has(row.id)) {
                const merged = { ...row, comment: l.comment };
                return leadRowEqual(l, merged) ? l : merged;
              }
              return leadRowEqual(l, row) ? l : row;
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
  }, [month]);

  function shiftMonth(delta: number) {
    setMonth(shiftMonthKey(month, delta));
  }

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
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    [doUpdate],
  );

  async function onExport() {
    const { fromISO, toISO } = monthRange(month);
    const res = await doExport({
      data: { from: fromISO, to: toISO, brand_id: brandFilter === "all" ? undefined : brandFilter },
    });
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleStatus(v: StatusFilter) {
    setStatusFilter((cur) => (cur === v ? "all" : v));
  }

  return (
    <div className="container mx-auto space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
            Лиды
            {isCurrentMonth && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Заявки за выбранный месяц. Каждый месяц список начинается заново с 1-го числа.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card p-1.5 shadow-xs">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[150px] text-center text-sm font-semibold capitalize">
              {monthLabel(month)}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => shiftMonth(1)}
              disabled={isCurrentMonth}
              title={isCurrentMonth ? "Это текущий месяц" : "Следующий месяц"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4 mr-1" />
            Экспорт CSV
          </Button>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button variant="brand">
                <Plus className="h-4 w-4 mr-1" />
                Добавить лид
              </Button>
            </DialogTrigger>
            <NewLeadDialog
              brands={brands}
              assignees={assignees}
              onClose={() => setOpenNew(false)}
              doCreate={doCreate}
            />
          </Dialog>
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
          label="1С"
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
          hint="1С ÷ всего"
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
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
            <SelectTrigger className="h-9 w-[170px] shrink-0 text-xs">
              <SelectValue placeholder="Ответственный" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ответственные</SelectItem>
              <SelectItem value="__none__">Без ответственного</SelectItem>
              {assignees.map((a) => (
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

      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto [&>div]:max-h-[calc(100vh-330px)]">
          <Table className="w-full table-fixed">
            <colgroup>
              <col className="w-[76px]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[44px]" />
              <col className="w-[44px]" />
              <col className="w-[44px]" />
              <col className="w-[44px]" />
              <col />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/80">
                <TableHead className={`${HEAD} whitespace-nowrap`}>Дата</TableHead>
                <TableHead className={HEAD}>Имя</TableHead>
                <TableHead className={HEAD}>Телефон</TableHead>
                <TableHead className={HEAD}>Интерес</TableHead>
                <TableHead className={HEAD}>Город</TableHead>
                <TableHead className={HEAD}>Бренд</TableHead>
                <TableHead className={HEAD}>Ответств.</TableHead>
                <TableHead className={HEAD_TOGGLE} title="Событие">
                  Соб
                </TableHead>
                <TableHead className={HEAD_TOGGLE} title="Дозвон">
                  Дозв
                </TableHead>
                <TableHead className={HEAD_TOGGLE} title="Квалификация">
                  Квал
                </TableHead>
                <TableHead className={HEAD_TOGGLE} title="В 1С">
                  1С
                </TableHead>
                <TableHead className={HEAD}>Комментарий</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={12} className="py-12 text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="py-14 text-center">
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
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((l) => (
                <LeadItem
                  key={l.id}
                  lead={l}
                  brand={l.brand_id ? (brandById.get(l.brand_id) ?? null) : null}
                  assignees={assignees}
                  canEdit={canEditLeads}
                  onPatch={patch}
                  onSaveComment={saveComment}
                  editingCommentsRef={editingCommentsRef}
                />
              ))}
            </TableBody>
          </Table>
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
  onPatch,
  onSaveComment,
  editingCommentsRef,
}: {
  lead: LeadRow;
  brand: Brand | null;
  assignees: Assignee[];
  canEdit: boolean;
  onPatch: (id: string, patch: PatchFields) => void;
  onSaveComment: (id: string, comment: string) => void;
  editingCommentsRef: MutableRefObject<Set<string>>;
}) {
  const phone = l.phone ?? "";
  const interestLabel = formatInterest(l.interest);
  const handleSaveComment = useCallback(
    (comment: string) => onSaveComment(l.id, comment),
    [l.id, onSaveComment],
  );
  return (
    <TableRow className="border-b border-border/40 transition-colors even:bg-muted/15 hover:bg-accent/30">
      <TableCell className={`${CELL} whitespace-nowrap text-xs tabular-nums text-muted-foreground`}>
        {new Date(l.created_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <TableCell className={`${CELL} truncate font-medium`} title={l.name ?? undefined}>
        {l.name || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className={`${CELL} truncate`}>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="font-medium tabular-nums text-brand hover:underline"
            title={phone}
          >
            {phone}
          </a>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className={`${CELL} truncate text-muted-foreground`} title={interestLabel}>
        {interestLabel}
      </TableCell>
      <TableCell className={`${CELL} truncate`} title={l.city ?? undefined}>
        {l.city?.trim() || "—"}
      </TableCell>
      <TableCell className={`${CELL} truncate`}>
        {brand ? (
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
          "—"
        )}
      </TableCell>
      <TableCell className={`${CELL} min-w-0`}>
        <AssigneeSelect
          compact
          assignees={assignees}
          brandId={l.brand_id}
          value={l.assigned_to}
          disabled={!canEdit}
          onChange={(id) => onPatch(l.id, { assigned_to: id })}
        />
      </TableCell>
      <LeadFunnelSwitches
        lead={l}
        canEdit={canEdit}
        onPatch={(patch) => onPatch(l.id, patch)}
      />
      <TableCell className={`${CELL} min-w-0`}>
        <InlineComment
          leadId={l.id}
          initialValue={l.comment ?? ""}
          onSave={handleSaveComment}
          editingRef={editingCommentsRef}
        />
      </TableCell>
    </TableRow>
  );
});

function InlineComment({
  leadId,
  initialValue,
  onSave,
  editingRef,
}: {
  leadId: string;
  initialValue: string;
  onSave: (comment: string) => void | Promise<void>;
  editingRef: MutableRefObject<Set<string>>;
}) {
  const [v, setV] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const savedRef = useRef(initialValue);
  const onSaveRef = useRef(onSave);
  const vRef = useRef(v);
  onSaveRef.current = onSave;
  vRef.current = v;

  useEffect(() => {
    if (!editing && initialValue !== savedRef.current) {
      savedRef.current = initialValue;
      setV(initialValue);
    }
  }, [initialValue, editing]);

  const flush = useCallback(async () => {
    const pending = vRef.current;
    if (pending === savedRef.current) return;
    const previous = savedRef.current;
    savedRef.current = pending;
    try {
      await onSaveRef.current(pending);
    } catch {
      savedRef.current = previous;
      setV(previous);
    }
  }, []);

  useEffect(() => {
    return () => {
      editingRef.current.delete(leadId);
      const pending = vRef.current;
      if (pending !== savedRef.current) {
        savedRef.current = pending;
        void onSaveRef.current(pending);
      }
    };
  }, [leadId, editingRef]);

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
    <Textarea
      autoFocus
      value={v}
      onFocus={() => editingRef.current.add(leadId)}
      onChange={(e) => {
        setV(e.target.value);
        vRef.current = e.target.value;
      }}
      onBlur={() => {
        editingRef.current.delete(leadId);
        void flush().finally(() => setEditing(false));
      }}
      rows={2}
      className="min-h-[52px] w-full resize-y rounded-md border-border/80 bg-background px-2 py-1.5 text-xs leading-relaxed shadow-sm"
      placeholder="Комментарий…"
    />
  );
}

function NewLeadDialog({
  brands,
  assignees,
  onClose,
  doCreate,
}: {
  brands: Brand[];
  assignees: Assignee[];
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
    () => assigneesForBrand(assignees, brandId),
    [assignees, brandId],
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
