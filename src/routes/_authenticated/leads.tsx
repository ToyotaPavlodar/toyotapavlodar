import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { updateLead, createManualLead, exportLeadsCsv } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Лиды — Автодом Павлодар" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);

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

    const channel = supabase.channel("leads-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLeads((prev) => {
          if (payload.eventType === "INSERT") {
            return [payload.new as LeadRow, ...prev];
          }
          if (payload.eventType === "UPDATE") {
            return prev.map((l) => l.id === (payload.new as LeadRow).id ? (payload.new as LeadRow) : l);
          }
          if (payload.eventType === "DELETE") {
            return prev.filter((l) => l.id !== (payload.old as LeadRow).id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (brandFilter !== "all" && l.brand_id !== brandFilter) return false;
      if (statusFilter === "not_called" && l.called === true) return false;
      if (statusFilter === "called" && l.called !== true) return false;
      if (statusFilter === "qualified" && l.qualified !== true) return false;
      if (statusFilter === "sent_1c" && !l.sent_to_1c) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(l.name?.toLowerCase().includes(s) || l.phone?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [leads, brandFilter, statusFilter, search]);

  async function patch(id: string, patch: Partial<Pick<LeadRow, "called" | "qualified" | "sent_to_1c" | "comment" | "brand_id" | "name" | "interest" | "city">>) {
    // optimistic
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } as LeadRow : l));
    try {
      await doUpdate({ data: { id, patch } });
    } catch (e) {
      toast.error((e as Error).message);
      // refetch
      const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      if (data) setLeads((prev) => prev.map((l) => l.id === id ? data : l));
    }
  }

  async function onExport() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const res = await doExport({ data: { from, to, brand_id: brandFilter === "all" ? undefined : brandFilter } });
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${now.toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b] as const)), [brands]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Лиды</h1>
          <p className="text-sm text-muted-foreground">Real-time. Новые заявки появляются сверху автоматически.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-1" />Экспорт CSV</Button>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Добавить лид</Button></DialogTrigger>
            <NewLeadDialog brands={brands} onClose={() => setOpenNew(false)} doCreate={doCreate} />
          </Dialog>
        </div>
      </div>

      <Card className="p-4">
        <Tabs value={brandFilter} onValueChange={setBrandFilter}>
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            {brands.map((b) => (
              <TabsTrigger key={b.id} value={b.id}>{b.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Поиск по имени или номеру" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="not_called">Не дозвонились</SelectItem>
              <SelectItem value="called">Дозвонились</SelectItem>
              <SelectItem value="qualified">Квалифицированы</SelectItem>
              <SelectItem value="sent_1c">Переданы в 1С</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Дата</TableHead>
              <TableHead>Имя</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Интерес</TableHead>
              <TableHead>Город</TableHead>
              <TableHead>Бренд</TableHead>
              <TableHead className="text-center">Дозвон</TableHead>
              <TableHead className="text-center">Квал</TableHead>
              <TableHead className="text-center">В 1С</TableHead>
              <TableHead>Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Загрузка…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Лидов пока нет</TableCell></TableRow>
            )}
            {filtered.map((l) => {
              const brand = l.brand_id ? brandById.get(l.brand_id) : null;
              const phone = l.phone ?? "";
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="font-medium">{l.name || <span className="text-muted-foreground italic">без имени</span>}</TableCell>
                  <TableCell>
                    {phone ? (
                      <a href={`tel:${phone}`} className="hover:underline whitespace-nowrap">{phone}</a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={l.interest ?? ""}>{l.interest || "—"}</TableCell>
                  <TableCell className="max-w-[140px] truncate" title={l.city ?? ""}>{l.city || "—"}</TableCell>
                  <TableCell>
                    {brand ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color }} />
                        {brand.name}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={l.called === true} onCheckedChange={(v) => patch(l.id, { called: v, qualified: v ? l.qualified : null })} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={l.qualified === true} disabled={l.called !== true} onCheckedChange={(v) => patch(l.id, { qualified: v })} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={l.sent_to_1c} onCheckedChange={(v) => patch(l.id, { sent_to_1c: v })} />
                  </TableCell>
                  <TableCell>
                    <InlineComment value={l.comment ?? ""} onSave={(v) => patch(l.id, { comment: v })} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function TriSelect({ value, onChange, disabled }: { value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  const current = value === true ? "yes" : value === false ? "no" : "none";
  const triggerCls = value === true
    ? "bg-success text-success-foreground border-success"
    : value === false
      ? "bg-destructive/10 text-destructive border-destructive/40"
      : "bg-secondary text-muted-foreground";
  return (
    <Select
      value={current}
      disabled={disabled}
      onValueChange={(v) => onChange(v === "yes" ? true : v === "no" ? false : null)}
    >
      <SelectTrigger className={`h-8 w-[80px] mx-auto justify-center gap-1 text-xs font-medium ${triggerCls} ${disabled ? "opacity-40" : ""}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[80px]">
        <SelectItem value="yes">Да</SelectItem>
        <SelectItem value="no">Нет</SelectItem>
        <SelectItem value="none">—</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InlineComment({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      rows={1}
      className="min-h-[36px] text-sm resize-none"
      placeholder="…"
    />
  );
}

function NewLeadDialog({ brands, onClose, doCreate }: { brands: Brand[]; onClose: () => void; doCreate: ReturnType<typeof useServerFn<typeof createManualLead>> }) {
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
      await doCreate({ data: { name, phone: normalizePhone(phone), interest, city, brand_id: brandId } });
      toast.success("Лид добавлен");
      onClose();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новый лид (вручную)</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Имя</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Телефон</Label><Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 777 000 00 00" /></div>
        <div><Label>Что интересует</Label><Input value={interest} onChange={(e) => setInterest(e.target.value)} /></div>
        <div><Label>Город</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Павлодар" /></div>
        <div>
          <Label>Бренд</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
            <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>{saving ? "Сохранение…" : "Создать"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
