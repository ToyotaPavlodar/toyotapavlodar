import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useState, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { updateLead, createManualLead, exportLeadsCsv } from "@/lib/leads.functions";
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
import { Search, Download, Plus, MessageCircle, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];
type StatusFilter = "all" | "not_called" | "called" | "qualified" | "sent_1c";
type PatchFields = Partial<
  Pick<
    LeadRow,
    "called" | "qualified" | "sent_to_1c" | "comment" | "brand_id" | "name" | "interest" | "city"
  >
>;

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Лиды — Автодом Павлодар" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);

  // Deferred search keeps typing snappy even with hundreds of rows.
  const deferredSearch = useDeferredValue(search);

  const doUpdate = useServerFn(updateLead);
  const doCreate = useServerFn(createManualLead);
  const doExport = useServerFn(exportLeadsCsv);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [{ data: br }, { data: ld }] = await Promise.all([
        supabase.from("brands").select("*").order("sort_order"),
        supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      if (!mounted) return;
      setBrands(br ?? []);
      setLeads(ld ?? []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("leads-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLeads((prev) => {
          if (payload.eventType === "INSERT") {
            return [payload.new as LeadRow, ...prev];
          }
          if (payload.eventType === "UPDATE") {
            return prev.map((l) =>
              l.id === (payload.new as LeadRow).id ? (payload.new as LeadRow) : l,
            );
          }
          if (payload.eventType === "DELETE") {
            return prev.filter((l) => l.id !== (payload.old as LeadRow).id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b] as const)), [brands]);

  // Leads limited to the active brand tab (used for the summary counters).
  const brandScoped = useMemo(
    () => (brandFilter === "all" ? leads : leads.filter((l) => l.brand_id === brandFilter)),
    [leads, brandFilter],
  );

  const stats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let called = 0,
      notCalled = 0,
      qualified = 0,
      sent = 0,
      today = 0;
    for (const l of brandScoped) {
      if (l.called === true) called++;
      else notCalled++;
      if (l.qualified === true) qualified++;
      if (l.sent_to_1c) sent++;
      if (new Date(l.created_at) >= start) today++;
    }
    return { total: brandScoped.length, called, notCalled, qualified, sent, today };
  }, [brandScoped]);

  const filtered = useMemo(() => {
    const s = deferredSearch.trim().toLowerCase();
    return brandScoped.filter((l) => {
      if (statusFilter === "not_called" && l.called === true) return false;
      if (statusFilter === "called" && l.called !== true) return false;
      if (statusFilter === "qualified" && l.qualified !== true) return false;
      if (statusFilter === "sent_1c" && !l.sent_to_1c) return false;
      if (s) {
        if (!(l.name?.toLowerCase().includes(s) || l.phone?.toLowerCase().includes(s)))
          return false;
      }
      return true;
    });
  }, [brandScoped, statusFilter, deferredSearch]);

  // Stable callback so memoized rows don't re-render on every parent update.
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

  async function onExport() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const res = await doExport({
      data: { from, to, brand_id: brandFilter === "all" ? undefined : brandFilter },
    });
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleStatus(v: StatusFilter) {
    setStatusFilter((cur) => (cur === v ? "all" : v));
  }

  const hasFilters = statusFilter !== "all" || search.trim() !== "";

  return (
    <div className="container mx-auto space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
            Лиды
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Новые заявки появляются сверху автоматически, без обновления страницы.
          </p>
        </div>
        <div className="flex gap-2">
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
            <NewLeadDialog brands={brands} onClose={() => setOpenNew(false)} doCreate={doCreate} />
          </Dialog>
        </div>
      </div>

      {/* Clickable summary — doubles as quick status filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatChip
          label="Всего"
          value={stats.total}
          hint={`сегодня +${stats.today}`}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
          tone="neutral"
        />
        <StatChip
          label="Не дозвон"
          value={stats.notCalled}
          active={statusFilter === "not_called"}
          onClick={() => toggleStatus("not_called")}
          tone="warning"
        />
        <StatChip
          label="Дозвон"
          value={stats.called}
          active={statusFilter === "called"}
          onClick={() => toggleStatus("called")}
          tone="brand"
        />
        <StatChip
          label="Квалифиц."
          value={stats.qualified}
          active={statusFilter === "qualified"}
          onClick={() => toggleStatus("qualified")}
          tone="success"
        />
        <StatChip
          label="В 1С"
          value={stats.sent}
          active={statusFilter === "sent_1c"}
          onClick={() => toggleStatus("sent_1c")}
          tone="success"
        />
        <StatChip
          label="Конверсия"
          value={stats.total ? `${Math.round((stats.sent / stats.total) * 100)}%` : "—"}
          hint="1С ÷ всего"
          tone="neutral"
        />
      </div>

      <Card className="p-4">
        <Tabs value={brandFilter} onValueChange={setBrandFilter}>
          <TabsList className="h-auto flex-wrap gap-1">
            <TabsTrigger value="all">Все</TabsTrigger>
            {brands.map((b) => (
              <TabsTrigger key={b.id} value={b.id} className="gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                {b.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Показано <b className="text-foreground">{filtered.length}</b> из {stats.total}
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("all");
                setSearch("");
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="[&>div]:max-h-[calc(100vh-330px)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 w-[130px] bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Дата
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Имя
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Телефон
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Интерес
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Город
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Бренд
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-center text-xs font-semibold uppercase tracking-wide">
                  Дозвон
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-center text-xs font-semibold uppercase tracking-wide">
                  Квал
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-secondary text-center text-xs font-semibold uppercase tracking-wide">
                  В 1С
                </TableHead>
                <TableHead className="sticky top-0 z-10 min-w-[220px] bg-secondary text-xs font-semibold uppercase tracking-wide">
                  Комментарий
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-14 text-center">
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
                  onPatch={patch}
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
        clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-card" : "cursor-default"
      } ${active ? "border-brand ring-1 ring-brand/40" : "border-border/70"}`}
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
  onPatch,
}: {
  lead: LeadRow;
  brand: Brand | null;
  onPatch: (id: string, patch: PatchFields) => void;
}) {
  const phone = l.phone ?? "";
  return (
    <TableRow className="transition-colors hover:bg-accent/40">
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(l.created_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <TableCell className="font-medium">
        {l.name || <span className="text-muted-foreground italic">без имени</span>}
      </TableCell>
      <TableCell>
        {phone ? (
          <div className="flex items-center gap-1.5">
            <a
              href={`tel:${phone}`}
              className="font-medium tabular-nums hover:text-brand hover:underline"
            >
              {phone}
            </a>
            <a
              href={`tel:${phone}`}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Позвонить"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
            <a
              href={`https://wa.me/${phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-6 w-6 items-center justify-center rounded-md text-success transition-colors hover:bg-success/10"
              title="Написать в WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="max-w-[220px] truncate" title={l.interest ?? ""}>
        {l.interest || "—"}
      </TableCell>
      <TableCell className="max-w-[140px] truncate" title={l.city ?? ""}>
        {l.city || "—"}
      </TableCell>
      <TableCell>
        {brand ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              borderColor: `${brand.color}55`,
              backgroundColor: `${brand.color}12`,
              color: brand.color,
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color }} />
            {brand.name}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={l.called === true}
          onCheckedChange={(v) => onPatch(l.id, { called: v, qualified: v ? l.qualified : null })}
        />
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={l.qualified === true}
          disabled={l.called !== true}
          onCheckedChange={(v) => onPatch(l.id, { qualified: v })}
        />
      </TableCell>
      <TableCell className="text-center">
        <Switch checked={l.sent_to_1c} onCheckedChange={(v) => onPatch(l.id, { sent_to_1c: v })} />
      </TableCell>
      <TableCell>
        <InlineComment value={l.comment ?? ""} onSave={(v) => onPatch(l.id, { comment: v })} />
      </TableCell>
    </TableRow>
  );
});

function InlineComment({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      rows={1}
      className="min-h-[36px] text-sm resize-none"
      placeholder="…"
    />
  );
}

function NewLeadDialog({
  brands,
  onClose,
  doCreate,
}: {
  brands: Brand[];
  onClose: () => void;
  doCreate: ReturnType<typeof useServerFn<typeof createManualLead>>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [city, setCity] = useState("");
  const [brandId, setBrandId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await doCreate({
        data: { name, phone: normalizePhone(phone), interest, city, brand_id: brandId },
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
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение…" : "Создать"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
