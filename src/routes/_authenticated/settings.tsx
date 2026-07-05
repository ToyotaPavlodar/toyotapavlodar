import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers, setDashboardAccess, setUserRole,
  createEmployee, deleteEmployee,
  getMetaIntegration, saveMetaToken,
  listMetaPages, listMetaFormsForPages, saveSelectedForms,
  getWhatsAppConfig, saveWhatsAppConfig,
  listCampaignMap, upsertCampaignMap, deleteCampaignMap,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSessionProfile } from "@/lib/auth-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, ExternalLink, Facebook, MessageCircle, Trash2, Users, UserPlus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Brand = Database["public"]["Tables"]["brands"]["Row"];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Настройки — Автодом Павлодар" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, loading } = useSessionProfile();
  if (loading) return <div className="container mx-auto p-6 text-muted-foreground">Загрузка…</div>;
  if (!profile?.roles.includes("admin")) {
    return <div className="container mx-auto p-6 text-destructive">Раздел доступен только администратору.</div>;
  }
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-sm text-muted-foreground">Пользователи, интеграции, соответствия кампаний.</p>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" />Пользователи</TabsTrigger>
          <TabsTrigger value="meta"><Facebook className="h-4 w-4 mr-1" />Facebook / Meta</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</TabsTrigger>
          <TabsTrigger value="campaigns">Кампании → Бренды</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="meta"><MetaTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================= USERS ============================= */
function UsersTab() {
  const { profile } = useSessionProfile();
  const call = useServerFn(listUsers);
  const setAccess = useServerFn(setDashboardAccess);
  const setRole = useServerFn(setUserRole);
  const create = useServerFn(createEmployee);
  const del = useServerFn(deleteEmployee);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "manager" as "admin" | "marketer" | "manager" });
  const [creating, setCreating] = useState(false);

  async function load() { setRows(await call()); }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await create({ data: form });
      toast.success("Сотрудник создан");
      setForm({ email: "", password: "", full_name: "", role: "manager" });
      load();
    } catch (err) { toast.error((err as Error).message); }
    finally { setCreating(false); }
  }

  async function onDelete(id: string, email: string) {
    if (!confirm(`Удалить пользователя ${email}?`)) return;
    try { await del({ data: { user_id: id } }); toast.success("Удалено"); load(); }
    catch (err) { toast.error((err as Error).message); }
  }

  const roleLabels: Record<string, string> = { admin: "Админ", marketer: "Маркетолог", manager: "Менеджер" };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Добавить сотрудника</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div><Label>Имя</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Пароль</Label><Input required minLength={8} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>Роль</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Админ</SelectItem>
                  <SelectItem value="marketer">Маркетолог</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={creating}>{creating ? "Создаём…" : "Создать"}</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Админ — полный доступ. Маркетолог — просматривает лиды и дашборд. Менеджер — только таблица лидов.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Сотрудники</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Менеджер</TableHead>
              <TableHead>Маркетолог</TableHead>
              <TableHead>Админ</TableHead>
              <TableHead>Аналитика</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.full_name || u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email} · {u.roles.map((r) => roleLabels[r] ?? r).join(", ") || "—"}</div>
                  </TableCell>
                  {(["manager", "marketer", "admin"] as const).map((role) => (
                    <TableCell key={role}>
                      <Switch
                        checked={u.roles.includes(role)}
                        onCheckedChange={async (v) => {
                          await setRole({ data: { user_id: u.id, role, enabled: v } });
                          toast.success("Роль обновлена"); load();
                        }}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Switch
                      checked={u.dashboard_access}
                      onCheckedChange={async (v) => {
                        await setAccess({ data: { user_id: u.id, value: v } });
                        toast.success("Доступ обновлён"); load();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {profile?.user.id !== u.id && (
                      <Button variant="ghost" size="icon" onClick={() => onDelete(u.id, u.email ?? "")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================= META ============================= */
function MetaTab() {
  const getIntg = useServerFn(getMetaIntegration);
  const saveToken = useServerFn(saveMetaToken);
  const listForms = useServerFn(listMetaForms);
  const saveForms = useServerFn(saveSelectedForms);

  const [intg, setIntg] = useState<Awaited<ReturnType<typeof getMetaIntegration>>>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [forms, setForms] = useState<Awaited<ReturnType<typeof listMetaForms>>>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);

  async function load() {
    const i = await getIntg();
    setIntg(i);
    const { data: br } = await supabase.from("brands").select("*").order("sort_order");
    setBrands(br ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submitToken(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await saveToken({ data: { access_token: token } }); toast.success("Meta подключён"); setToken(""); load(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  }

  async function loadForms() {
    if (!selectedAccount) return;
    setLoadingForms(true);
    try {
      const list = await listForms({ data: { ad_account_id: selectedAccount } });
      setForms(list);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingForms(false); }
  }

  const accounts = (intg?.ad_accounts as Array<{ id: string; name: string; currency?: string }> | null) ?? [];
  const savedSelected = (intg?.selected_forms as Array<{ form_id: string; brand_id: string | null; form_name?: string }> | null) ?? [];
  const [selection, setSelection] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const s of savedSelected) if (s.brand_id) map[s.form_id] = s.brand_id;
    setSelection(map);
  }, [intg]);

  async function saveSelection() {
    const payload = Object.entries(selection).map(([form_id, brand_id]) => {
      const f = forms.find((x) => x.id === form_id);
      return { form_id, brand_id, form_name: f?.name };
    });
    await saveForms({ data: { forms: payload } });
    toast.success("Формы сохранены");
    load();
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Facebook / Meta — подключение</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {intg?.connected_at && (
            <div className="text-sm text-success">
              ✓ Подключено {new Date(intg.connected_at).toLocaleString("ru-RU")}, Meta User ID: {intg.meta_user_id}
            </div>
          )}
          <form onSubmit={submitToken} className="space-y-2">
            <Label>Долгоживущий User Access Token</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
            <p className="text-xs text-muted-foreground">Нужны права <code>leads_retrieval</code>, <code>ads_read</code>, <code>pages_show_list</code>, <code>pages_manage_metadata</code>.</p>
            <Button type="submit" disabled={saving}>{saving ? "Проверка…" : intg?.access_token ? "Обновить токен" : "Подключить"}</Button>
          </form>
          <div className="rounded-md bg-secondary p-3 text-xs space-y-1">
            <div className="font-medium">URL вебхука для Meta Lead Ads:</div>
            <CopyRow value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/public/webhooks/meta-leads`} />
            <div className="text-muted-foreground">Verify token задаётся секретом <code>META_WEBHOOK_VERIFY_TOKEN</code>.</div>
          </div>
        </CardContent>
      </Card>

      {intg?.access_token && (
        <Card>
          <CardHeader><CardTitle>Выбор лид-форм</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="w-[320px]"><SelectValue placeholder="Рекламный кабинет" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.id})</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={loadForms} disabled={!selectedAccount || loadingForms}>{loadingForms ? "Загрузка…" : "Загрузить формы"}</Button>
            </div>
            {forms.length > 0 && (
              <>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Форма</TableHead><TableHead>Страница</TableHead><TableHead>Статус</TableHead><TableHead>Бренд</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {forms.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell><div className="font-medium">{f.name}</div><div className="text-xs text-muted-foreground">{f.id}</div></TableCell>
                        <TableCell>{f.page_name}</TableCell>
                        <TableCell><span className="text-xs">{f.status}</span></TableCell>
                        <TableCell>
                          <Select value={selection[f.id] ?? "none"} onValueChange={(v) => setSelection((s) => ({ ...s, [f.id]: v === "none" ? "" : v }))}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— не собирать —</SelectItem>
                              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button onClick={saveSelection}>Сохранить формы</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================= WHATSAPP ============================= */
function WhatsAppTab() {
  const get = useServerFn(getWhatsAppConfig);
  const save = useServerFn(saveWhatsAppConfig);
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getWhatsAppConfig>>>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [form, setForm] = useState({
    phone_number_id: "", waba_id: "", access_token: "", verify_token: "", default_brand_id: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const c = await get();
    setCfg(c);
    if (c) setForm({
      phone_number_id: c.phone_number_id ?? "",
      waba_id: c.waba_id ?? "",
      access_token: c.access_token ?? "",
      verify_token: c.verify_token ?? "",
      default_brand_id: c.default_brand_id ?? "",
    });
    const { data: br } = await supabase.from("brands").select("*").order("sort_order");
    setBrands(br ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ data: {
        phone_number_id: form.phone_number_id,
        waba_id: form.waba_id,
        access_token: form.access_token,
        verify_token: form.verify_token,
        default_brand_id: form.default_brand_id || null,
      }});
      toast.success("WhatsApp сохранён"); load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>WhatsApp Cloud API (Meta)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {cfg?.connected_at && <div className="text-sm text-success">✓ Настроено {new Date(cfg.connected_at).toLocaleString("ru-RU")}</div>}
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Phone Number ID</Label><Input required value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} /></div>
            <div><Label>WABA ID</Label><Input required value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>System User Access Token</Label><Input required value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} /></div>
            <div><Label>Verify token (задаёте сами)</Label><Input required value={form.verify_token} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} /></div>
            <div>
              <Label>Бренд по умолчанию (для сообщений без ctwa)</Label>
              <Select value={form.default_brand_id || "none"} onValueChange={(v) => setForm({ ...form, default_brand_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— не выбран —</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</Button>
            </div>
          </form>
          <div className="rounded-md bg-secondary p-3 text-xs space-y-1">
            <div className="font-medium">Callback URL для Meta:</div>
            <CopyRow value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/public/webhooks/whatsapp`} />
            <div className="text-muted-foreground">В Meta App → WhatsApp → Configuration → Webhook: вставьте URL и Verify Token.</div>
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Документация Meta <ExternalLink className="h-3 w-3" /></a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================= CAMPAIGNS ============================= */
function CampaignsTab() {
  const list = useServerFn(listCampaignMap);
  const upsert = useServerFn(upsertCampaignMap);
  const del = useServerFn(deleteCampaignMap);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCampaignMap>>>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [f, setF] = useState({ meta_account_id: "", campaign_id: "", campaign_name: "", brand_id: "" });

  async function load() {
    setRows(await list());
    const { data: br } = await supabase.from("brands").select("*").order("sort_order");
    setBrands(br ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Кампания → Бренд</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!f.brand_id) { toast.error("Выберите бренд"); return; }
              await upsert({ data: { meta_account_id: f.meta_account_id, campaign_id: f.campaign_id, campaign_name: f.campaign_name, brand_id: f.brand_id } });
              toast.success("Сохранено");
              setF({ meta_account_id: "", campaign_id: "", campaign_name: "", brand_id: "" });
              load();
            }}
          >
            <div><Label>Ad account (act_…)</Label><Input required value={f.meta_account_id} onChange={(e) => setF({ ...f, meta_account_id: e.target.value })} /></div>
            <div><Label>Campaign ID</Label><Input required value={f.campaign_id} onChange={(e) => setF({ ...f, campaign_id: e.target.value })} /></div>
            <div><Label>Название (опционально)</Label><Input value={f.campaign_name} onChange={(e) => setF({ ...f, campaign_name: e.target.value })} /></div>
            <div>
              <Label>Бренд</Label>
              <Select value={f.brand_id} onValueChange={(v) => setF({ ...f, brand_id: v })}>
                <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
                <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit">Добавить</Button>
          </form>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ad account</TableHead><TableHead>Campaign ID</TableHead><TableHead>Название</TableHead><TableHead>Бренд</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.meta_account_id}</TableCell>
                  <TableCell className="font-mono text-xs">{r.campaign_id}</TableCell>
                  <TableCell>{r.campaign_name || "—"}</TableCell>
                  <TableCell>{(r as { brands?: { name?: string } | null }).brands?.name ?? "—"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={async () => { await del({ data: { id: r.id } }); load(); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Соответствий пока нет</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyRow({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate">{value}</code>
      <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(value); toast.success("Скопировано"); }}><Copy className="h-3 w-3" /></Button>
    </div>
  );
}
