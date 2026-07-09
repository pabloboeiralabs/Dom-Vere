import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Cake, Pencil, Plus, Search, Trash2, Upload, UserX, Send, MessageCircle } from "lucide-react";
import { useUazapi } from "@/hooks/useUazapi";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import ServiceSaleDialog from "@/components/ServiceSaleDialog";

interface Customer {
  id: string;
  name: string;
  phone: string;
  birth_date: string;
  credit_balance: number;
  plan_name?: string;
}

interface ImportRow {
  name: string;
  phone: string;
}

type PlanFilter = "all" | "with_plan" | "no_plan";

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBirth, setNewBirth] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState("");

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [anonSaleOpen, setAnonSaleOpen] = useState(false);
  const [anonCustomerId, setAnonCustomerId] = useState<string | null>(null);
  const [sendingBirthday, setSendingBirthday] = useState<Set<string>>(new Set());
  // Push notification
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [notifyUrl, setNotifyUrl] = useState("");
  const [sendingPush, setSendingPush] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleSendPush = async () => {
    if (!user || !notifyTitle || !notifyBody) return;
    setSendingPush(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          user_id: user.id,
          customer_ids: selectedIds.size > 0 ? [...selectedIds] : undefined,
          title: notifyTitle,
          body: notifyBody,
          url: notifyUrl || "https://agendar.zlabs.com.br",
        },
      });
      if (error) { toast.error("Erro ao enviar notificação"); return; }
      const count = (data as any)?.in_app || (data as any)?.sent || 0;
      toast.success(`🔔 Notificação enviada!${count > 0 ? ` (${count} cliente(s))` : ""}`);
      setNotifyOpen(false);
      setNotifyTitle(""); setNotifyBody(""); setNotifyUrl("");
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e.message || "desconhecido"));
    } finally {
      setSendingPush(false);
    }
  };
  const [selectedBirthdayMsg, setSelectedBirthdayMsg] = useState(0);

  const { sendText, config: waConfig } = useUazapi();

  const birthdayMessages = [
    { title: "🎂 Clássica", body: "Feliz aniversário, {nome}! 🎉🎂 Toda a equipe deseja um dia incrível pra você! Aproveite muito!" },
    { title: "✂️ Promocional", body: "Parabéns, {nome}! 🎉 Pra comemorar seu aniversário, temos uma surpresa especial esperando por você na barbearia! Vem nos visitar! 🎁" },
    { title: "🎈 Descontraída", body: "E aí, {nome}! Hoje é seu dia! 🥳🎂 Passa aqui na barbearia pra gente te dar os parabéns pessoalmente! Feliz aniversário! 🎉" },
  ];

  const sendBirthdayMessage = useCallback(async (client: Customer) => {
    if (!client.phone) {
      toast.error(`${client.name} não tem telefone cadastrado`);
      return;
    }
    if (!waConfig) {
      toast.error("WhatsApp não configurado");
      return;
    }
    const msg = birthdayMessages[selectedBirthdayMsg].body.replace("{nome}", client.name.split(" ")[0]);
    const phone = client.phone.replace(/\D/g, "");
    setSendingBirthday((prev) => new Set(prev).add(client.id));
    try {
      await sendText(phone, msg);
      toast.success(`Parabéns enviado para ${client.name}! 🎂`);
    } catch (e: any) {
      toast.error(`Erro ao enviar para ${client.name}: ${e.message}`);
    } finally {
      setSendingBirthday((prev) => {
        const next = new Set(prev);
        next.delete(client.id);
        return next;
      });
    }
  }, [waConfig, sendText, selectedBirthdayMsg]);


  const loadCustomers = useCallback(async () => {
    if (!user) return;
    try {
      const { data: rows, error } = await supabase.rpc("get_clients_with_plans", { p_user_id: user.id });
      if (error) throw error;
      setCustomers((rows || []) as Customer[]);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { error } = await supabase.from("customers").insert({
        user_id: user.id,
        name: newName.trim(),
        phone: newPhone.trim() || null,
        birth_date: newBirth || null,
      });
      if (error) throw error;
      toast.success("Cliente adicionado!");
      setNewName(""); setNewPhone(""); setNewBirth("");
      setDialogOpen(false);
      loadCustomers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const deleteCustomer = async () => {
    if (!user || !deleteTarget) return;
    try {
      await supabase.from("cuts").delete().eq("customer_id", deleteTarget.id);
      await supabase.from("transactions").delete().eq("customer_id", deleteTarget.id);
      const { error } = await supabase.from("customers").delete().eq("id", deleteTarget.id).eq("user_id", user.id);
      if (error) throw error;
      toast.success("Cliente excluído!");
      setDeleteTarget(null);
      loadCustomers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setEditName(c.name);
    setEditPhone(c.phone || "");
    setEditBirth(c.birth_date || "");
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editTarget) return;
    try {
      const { error } = await supabase.from("customers").update({
        name: editName.trim(),
        phone: editPhone.trim() || null,
        birth_date: editBirth || null,
      }).eq("id", editTarget.id).eq("user_id", user.id);
      if (error) throw error;
      toast.success("Cliente atualizado!");
      setEditTarget(null);
      loadCustomers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const parseSheetData = (data: Uint8Array) => {
    const wb = XLSX.read(data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (json.length === 0) {
      toast.error("Planilha vazia");
      return;
    }

    const headers = Object.keys(json[0]);
    const nameCol = headers.find(h => ["nome", "name"].includes(normalizeHeader(h)));
    const phoneCol = headers.find(h => ["telefone", "phone", "celular", "tel", "whatsapp"].includes(normalizeHeader(h)));

    if (!nameCol) {
      toast.error("Coluna 'Nome' não encontrada na planilha");
      return;
    }

    const rows: ImportRow[] = json
      .map(r => ({
        name: String(r[nameCol] || "").trim(),
        phone: phoneCol ? String(r[phoneCol] || "").trim() : "",
      }))
      .filter(r => r.name.length > 0);

    setImportRows(rows);
  };

  const handleGoogleSheetUrl = async () => {
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      toast.error("Link inválido. Cole o link de compartilhamento do Google Sheets.");
      return;
    }
    const sheetId = match[1];
    setLoadingLink(true);
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);
      if (!res.ok) throw new Error("Não foi possível acessar a planilha. Verifique se ela está compartilhada como pública.");
      const text = await res.text();
      const data = new Uint8Array(new TextEncoder().encode(text));
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (json.length === 0) {
        toast.error("Planilha vazia");
        return;
      }

      const headers = Object.keys(json[0]);
      const nameCol = headers.find(h => ["nome", "name"].includes(normalizeHeader(h)));
      const phoneCol = headers.find(h => ["telefone", "phone", "celular", "tel", "whatsapp"].includes(normalizeHeader(h)));

      if (!nameCol) {
        toast.error("Coluna 'Nome' não encontrada na planilha");
        return;
      }

      const rows: ImportRow[] = json
        .map(r => ({
          name: String(r[nameCol] || "").trim(),
          phone: phoneCol ? String(r[phoneCol] || "").trim() : "",
        }))
        .filter(r => r.name.length > 0);

      setImportRows(rows);
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar do Google Sheets");
    } finally {
      setLoadingLink(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        parseSheetData(data);
      } catch {
        toast.error("Erro ao ler arquivo");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = async () => {
    if (!user || importRows.length === 0) return;
    setImporting(true);
    let ok = 0, fail = 0;
    for (const row of importRows) {
      try {
        const { error } = await supabase.from("customers").insert({
          user_id: user.id,
          name: row.name,
          phone: row.phone || null,
        });
        if (error) throw error;
        ok++;
      } catch {
        fail++;
      }
    }
    toast.success(`${ok} clientes importados${fail > 0 ? `, ${fail} erros` : ""}`);
    setImportRows([]);
    setImportOpen(false);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
    loadCustomers();
  };

  const isBirthdayThisWeek = useCallback((birthDate: string | null) => {
    if (!birthDate) return false;
    const today = new Date();
    const [, m, day] = birthDate.split("-");
    const bMonth = parseInt(m);
    const bDay = parseInt(day);
    for (let i = 0; i <= 6; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (bMonth === d.getMonth() + 1 && bDay === d.getDate()) return true;
    }
    return false;
  }, []);

  const birthdayClients = useMemo(
    () => customers.filter((c) => isBirthdayThisWeek(c.birth_date)),
    [customers, isBirthdayThisWeek]
  );

  const birthdayIds = useMemo(
    () => new Set(birthdayClients.map((c) => c.id)),
    [birthdayClients]
  );

  const sendToAllBirthdays = useCallback(async () => {
    const withPhone = birthdayClients.filter((c) => c.phone);
    if (withPhone.length === 0) {
      toast.error("Nenhum aniversariante tem telefone cadastrado");
      return;
    }
    for (const c of withPhone) {
      await sendBirthdayMessage(c);
    }
  }, [birthdayClients, sendBirthdayMessage]);

  const filtered = customers.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchPlan =
      planFilter === "all" ||
      (planFilter === "with_plan" && !!c.plan_name) ||
      (planFilter === "no_plan" && !c.plan_name);
    return matchSearch && matchPlan;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) { setImportRows([]); setSheetUrl(""); if (fileRef.current) fileRef.current.value = ""; } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Upload className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Importar Planilha</span></Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Importar Planilha</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Envie um arquivo ou cole o link de uma planilha pública do Google Sheets com colunas <strong>Nome</strong> e <strong>Telefone</strong>.
              </p>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                  />
                  <Button type="button" onClick={handleGoogleSheetUrl} disabled={loadingLink || !sheetUrl.trim()} variant="outline">
                    {loadingLink ? "Carregando..." : "Importar"}
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex-1 border-t border-border" />
                  ou envie um arquivo
                  <span className="flex-1 border-t border-border" />
                </div>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                />
              </div>
              {importRows.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">{importRows.length} registros encontrados:</p>
                  <div className="max-h-60 overflow-auto rounded border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-foreground">{r.name}</TableCell>
                            <TableCell className="text-muted-foreground">{r.phone || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button onClick={confirmImport} disabled={importing} className="w-full">
                    {importing ? "Importando..." : `Importar ${importRows.length} clientes`}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={async () => {
            if (!user) return;
            try {
              const { data: existing } = await supabase
                .from("customers")
                .select("id")
                .eq("user_id", user.id)
                .eq("name", "Cliente Anônimo")
                .limit(1);
              let customerId: string;
              if (existing && existing.length > 0) {
                customerId = existing[0].id;
              } else {
                const { data: created, error } = await supabase
                  .from("customers")
                  .insert({ user_id: user.id, name: "Cliente Anônimo" })
                  .select("id")
                  .single();
                if (error) throw error;
                customerId = created.id;
              }
              setAnonCustomerId(customerId);
              setAnonSaleOpen(true);
            } catch (err: any) {
              toast.error(err.message);
            }
          }}>
            <UserX className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Anônimo</span>
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Novo Cliente</span></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Cliente</DialogTitle>
              </DialogHeader>
              <form onSubmit={addCustomer} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de nascimento</Label>
                  <Input type="date" value={newBirth} onChange={(e) => setNewBirth(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Birthday badge */}
      {birthdayClients.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg border border-pink-500/30 bg-pink-500/10 px-4 py-2.5 text-sm font-medium text-pink-400 hover:bg-pink-500/20 transition-colors w-full sm:w-auto">
              <Cake className="h-4 w-4" />
              {birthdayClients.length} aniversariante{birthdayClients.length > 1 ? "s" : ""} esta semana
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Cake className="h-4 w-4 text-pink-400" /> Aniversariantes da Semana
              </p>
            </div>
            {/* Message selector */}
            <div className="p-3 border-b border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Mensagem de parabéns:</p>
              <div className="flex gap-1.5 flex-wrap">
                {birthdayMessages.map((msg, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedBirthdayMsg(i)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${selectedBirthdayMsg === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                  >
                    {msg.title}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                {birthdayMessages[selectedBirthdayMsg].body.replace("{nome}", "João")}
              </p>
            </div>
            <div className="max-h-48 overflow-auto">
              {birthdayClients.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors"
                >
                  <button className="text-left flex-1 min-w-0" onClick={() => navigate(`/clients/${c.id}`)}>
                    <span className="text-sm font-medium text-pink-400 truncate block">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.birth_date ? new Date(c.birth_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}
                    </span>
                  </button>
                  <button
                    onClick={() => sendBirthdayMessage(c)}
                    disabled={sendingBirthday.has(c.id) || !c.phone}
                    className="ml-2 p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                    title={!c.phone ? "Sem telefone" : "Enviar parabéns"}
                  >
                    <MessageCircle className={`h-4 w-4 ${sendingBirthday.has(c.id) ? "animate-pulse" : ""}`} />
                  </button>
                </div>
              ))}
            </div>
            {/* Send to all */}
            <div className="p-2 border-t border-border">
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={sendToAllBirthdays}
                disabled={!waConfig}
              >
                <Send className="h-3.5 w-3.5" />
                Enviar para todos ({birthdayClients.filter((c) => c.phone).length})
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as PlanFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            <SelectItem value="with_plan">Com plano</SelectItem>
            <SelectItem value="no_plan">Sem plano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={selectedIds.size > 0 && selectedIds.size === filtered.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead className="hidden sm:table-cell text-center">Plano</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className={`cursor-pointer hover:bg-accent/50 ${selectedIds.has(c.id) ? "bg-primary/5" : ""}`}
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                  </TableCell>
                  <TableCell className={`font-medium ${birthdayIds.has(c.id) ? "text-pink-400" : "text-foreground"}`}>
                    <span className="flex items-center gap-1.5">
                      {birthdayIds.has(c.id) && <Cake className="h-3.5 w-3.5 text-pink-400 shrink-0" />}
                      {c.name}
                    </span>
                    {c.phone && <span className="block text-xs text-muted-foreground md:hidden">{c.phone}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    {c.plan_name ? (
                      <Badge variant="secondary">{c.plan_name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Floating action bar — aparece quando há itens selecionados */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-xl rounded-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
          <Button size="sm" onClick={() => { setNotifyOpen(true); }}>
            <Bell className="h-4 w-4 mr-1" /> Enviar push
          </Button>
        </div>
      )}

      {/* Send notification dialog */}
      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar notificação push</DialogTitle>
            <DialogDescription>
              {selectedIds.size > 0
                ? `Enviar para ${selectedIds.size} cliente(s) selecionado(s)`
                : "Enviar para TODOS os clientes (marque clientes para enviar individualmente)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Título" value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} />
            <Input placeholder="Mensagem" value={notifyBody} onChange={e => setNotifyBody(e.target.value)} />
            <Input placeholder="Link (opcional)" value={notifyUrl} onChange={e => setNotifyUrl(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyOpen(false)}>Cancelar</Button>
            <Button onClick={handleSendPush} disabled={sendingPush || !notifyTitle || !notifyBody}>
              {sendingPush ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de nascimento</Label>
              <Input type="date" value={editBirth} onChange={(e) => setEditBirth(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Todos os cortes e transações serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCustomer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Serviço Anônimo */}
      {user && anonCustomerId && (
        <ServiceSaleDialog
          open={anonSaleOpen}
          onOpenChange={setAnonSaleOpen}
          userId={user.id}
          customerId={anonCustomerId}
          onSaleRegistered={() => {}}
        />
      )}
    </div>
  );
}
