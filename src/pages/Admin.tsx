import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Users, DollarSign, Store, MoreHorizontal, UserPlus, Pencil, PowerOff, Trash2, ShieldCheck, ShieldOff, Save, Loader2, Scissors, Bot, CheckCircle2, MessageSquare, Crown, CalendarIcon, Plus, X, ListChecks, KeyRound, icons } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  created_at: string;
  subscription_type: string;
  subscription_expires_at: string | null;
}

type DialogMode = "new" | "edit" | null;

export default function Admin() { // refreshed
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalRevenue: 0, totalShops: 0 });

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [formTarget, setFormTarget] = useState<UserRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("barbearia");
  const [formPassword, setFormPassword] = useState("");
  const [formSubscription, setFormSubscription] = useState("basico");
  const [formExpiresAt, setFormExpiresAt] = useState<Date | undefined>(undefined);
  const [savingUser, setSavingUser] = useState(false);

  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [priceNormal, setPriceNormal] = useState("");
  const [priceBot, setPriceBot] = useState("");
  const [savingPrices, setSavingPrices] = useState(false);

  const [featuresNormal, setFeaturesNormal] = useState<string[]>([]);
  const [featuresBot, setFeaturesBot] = useState<string[]>([]);
  const [newFeatureNormal, setNewFeatureNormal] = useState("");
  const [newFeatureBot, setNewFeatureBot] = useState("");
  const [savingFeatures, setSavingFeatures] = useState(false);

  const [iconNormal, setIconNormal] = useState("Scissors");
  const [iconBot, setIconBot] = useState("Bot");
  const [subtitleNormal, setSubtitleNormal] = useState("Gestão completa de créditos");
  const [subtitleBot, setSubtitleBot] = useState("Automação via WhatsApp");

  const [waConfigUser, setWaConfigUser] = useState<string>("");
  const [waUrl, setWaUrl] = useState("https://ipazua.uazapi.com");
  const [waToken, setWaToken] = useState("");
  const [savingWa, setSavingWa] = useState(false);
  const [validatingWa, setValidatingWa] = useState(false);
  const [waConfigs, setWaConfigs] = useState<Record<string, { api_url: string; instance_token: string }>>({});

  const loadData = useCallback(async () => {
    try {
      const [profilesRes, statsRes] = await Promise.all([
        supabase.from("profiles").select("id, email, name, role, active, created_at, subscription_type, subscription_expires_at").order("created_at", { ascending: false }),
        supabase.rpc("get_admin_stats"),
      ]);
      setUsers((profilesRes.data || []) as UserRow[]);
      const s = (statsRes.data || [])[0];
      setStats({
        totalUsers: Number(s?.total_users || 0),
        totalRevenue: Number(s?.total_revenue || 0),
        totalShops: Number(s?.total_shops || 0),
      });
    } catch (e) { console.error(e); }
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const { data } = await supabase.from("subscription_pricing").select("type, price, features, icon, subtitle");
      for (const r of (data || []) as { type: string; price: number; features: string[]; icon: string; subtitle: string }[]) {
        if (r.type === "normal") { setPriceNormal(String(r.price)); setFeaturesNormal(Array.isArray(r.features) ? r.features : []); setIconNormal(r.icon || "Scissors"); setSubtitleNormal(r.subtitle || ""); }
        if (r.type === "com_bot") { setPriceBot(String(r.price)); setFeaturesBot(Array.isArray(r.features) ? r.features : []); setIconBot(r.icon || "Bot"); setSubtitleBot(r.subtitle || ""); }
      }
    } catch (e) { console.error(e); }
  }, []);

  const loadWaConfig = useCallback(async () => {
    try {
      const { data } = await supabase.from("whatsapp_config").select("user_id, api_url, instance_token");
      const map: Record<string, { api_url: string; instance_token: string }> = {};
      for (const r of (data || []) as { user_id: string; api_url: string; instance_token: string }[]) {
        map[r.user_id] = { api_url: r.api_url, instance_token: r.instance_token };
      }
      setWaConfigs(map);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadData(); loadPrices(); loadWaConfig(); }, [loadData, loadPrices, loadWaConfig]);

  const openNew = () => {
    setFormTarget(null); setFormName(""); setFormEmail(""); setFormRole("barbearia"); setFormPassword("");
    setFormSubscription("basico"); setFormExpiresAt(undefined);
    setDialogMode("new");
  };

  const openEdit = (u: UserRow) => {
    setFormTarget(u); setFormName(u.name); setFormEmail(u.email); setFormRole(u.role); setFormPassword("");
    setFormSubscription(u.subscription_type || "basico");
    setFormExpiresAt(u.subscription_expires_at ? new Date(u.subscription_expires_at + "T12:00:00") : undefined);
    setDialogMode("edit");
  };

  const handleSave = async () => {
    if (!formName || !formEmail) { toast.error("Nome e e-mail são obrigatórios"); return; }
    if (savingUser) return;

    const normalizeCreateError = (message?: string) => {
      const text = (message || "").toLowerCase();
      if (
        text.includes("already been registered") ||
        text.includes("email_exists") ||
        text.includes("duplicate key value")
      ) {
        return "Este e-mail já está cadastrado.";
      }
      if (text.includes("database error creating new user")) {
        return "Não foi possível criar o usuário agora. Tente novamente em instantes.";
      }
      return message || "Erro ao salvar usuário";
    };

    setSavingUser(true);
    try {
      if (dialogMode === "new") {
        if (!formPassword) { toast.error("Senha é obrigatória para novo usuário"); return; }

        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            name: formName.trim(),
            email: formEmail.toLowerCase().trim(),
            password: formPassword,
            role: formRole,
          },
        });

        if (error) {
          let backendMessage = error.message || "Erro ao criar usuário";
          const response = (error as { context?: { clone?: () => Response; json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
          const readableResponse = response?.clone?.() ?? response;
          if (readableResponse?.json) {
            const payload = await readableResponse.json().catch(() => null) as { error?: string } | null;
            backendMessage = payload?.error || backendMessage;
          } else if (readableResponse?.text) {
            backendMessage = await readableResponse.text().catch(() => backendMessage);
          }
          throw new Error(normalizeCreateError(backendMessage));
        }

        if (data?.error) throw new Error(normalizeCreateError(data.error));
        if (!data?.userId) throw new Error(data?.error || "Erro ao criar usuário");

        toast.success("Usuário criado com sucesso");
      } else if (formTarget) {
        const updateData: any = {
          name: formName,
          email: formEmail,
          role: formRole,
        };
        if (formRole === "barbearia") {
          updateData.subscription_type = formSubscription;
          updateData.subscription_expires_at = formExpiresAt ? format(formExpiresAt, "yyyy-MM-dd") : null;
        }
        const { error } = await supabase.from("profiles").update(updateData).eq("id", formTarget.id);
        if (error) throw error;
        toast.success("Usuário atualizado");
      }
      setDialogMode(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar usuário");
    } finally {
      setSavingUser(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      const { error } = await supabase.from("profiles").update({ active: !deactivateTarget.active }).eq("id", deactivateTarget.id);
      if (error) throw error;
      toast.success(deactivateTarget.active ? "Usuário desativado" : "Usuário ativado");
      setDeactivateTarget(null); loadData();
    } catch (err: any) { toast.error(err.message); setDeactivateTarget(null); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`${deleteTarget.name} excluído`);
      setDeleteTarget(null); loadData();
    } catch (err: any) { toast.error(err.message); setDeleteTarget(null); }
  };

  const confirmRoleChange = async () => {
    if (!roleTarget) return;
    const newRole = roleTarget.role === "admin" ? "barbearia" : "admin";
    try {
      const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", roleTarget.id);
      if (error) throw error;
      toast.success(newRole === "admin" ? `${roleTarget.name} promovido a Admin` : `${roleTarget.name} rebaixado para Barbearia`);
      setRoleTarget(null); loadData();
    } catch (err: any) { toast.error(err.message); setRoleTarget(null); }
  };

  const handleSetUserPassword = async () => {
    if (!passwordTarget) return;
    if (!newUserPassword || newUserPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setSavingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-user-password", {
        body: {
          user_id: passwordTarget.id,
          password: newUserPassword,
        },
      });

      if (error) {
        let backendMessage = error.message || "Erro ao alterar senha";
        const response = (error as { context?: Response }).context;
        if (response instanceof Response) {
          const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
          backendMessage = payload?.error || backendMessage;
        }
        throw new Error(backendMessage);
      }

      if (data?.error) throw new Error(data.error);

      toast.success("Senha alterada com sucesso");
      setPasswordTarget(null);
      setNewUserPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePrices = async () => {
    setSavingPrices(true);
    try {
      await supabase.from("subscription_pricing").update({ price: parseFloat(priceNormal) || 0, updated_at: new Date().toISOString() }).eq("type", "normal");
      await supabase.from("subscription_pricing").update({ price: parseFloat(priceBot) || 0, updated_at: new Date().toISOString() }).eq("type", "com_bot");
      toast.success("Valores das mensalidades atualizados!");
    } catch (err: any) { toast.error(err.message); } finally { setSavingPrices(false); }
  };

  const cards = [
    { title: "Total Usuários", value: stats.totalUsers, icon: Users },
    { title: "Barbearias", value: stats.totalShops, icon: Store },
    { title: "Faturamento Global", value: `R$ ${stats.totalRevenue.toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Administração</h1>

      <motion.div className="grid grid-cols-1 sm:grid-cols-3 gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {cards.map((c) => (
          <Card key={c.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-foreground">{c.value}</div></CardContent>
          </Card>
        ))}
      </motion.div>

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="usuarios" className="flex-1 sm:flex-none">Usuários</TabsTrigger>
          <TabsTrigger value="assinaturas" className="flex-1 sm:flex-none">Mensalidades e Planos</TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex-1 sm:flex-none">WhatsApp</TabsTrigger>
          <TabsTrigger value="credenciais" className="flex-1 sm:flex-none">Credenciais</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNew} className="gap-2"><UserPlus className="h-4 w-4" /> Novo Usuário</Button>
          </div>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground">Usuários</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Tipo</TableHead>
                     <TableHead>Plano</TableHead>
                     <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-foreground">
                        {u.name}
                        <span className="block text-xs text-muted-foreground md:hidden">{u.email}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{u.email}</TableCell>
                      <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                       <TableCell>
                         {u.role === "barbearia" ? (
                           <div>
                             <Badge variant={u.subscription_type === "premium" ? "default" : "outline"} className={u.subscription_type === "premium" ? "bg-amber-600 hover:bg-amber-700" : ""}>
                               {u.subscription_type === "premium" ? "Premium" : "Básico"}
                             </Badge>
                             {u.subscription_expires_at && (
                               <span className={cn("block text-[10px] mt-0.5", new Date(u.subscription_expires_at) < new Date() ? "text-destructive" : "text-muted-foreground")}>
                                 {new Date(u.subscription_expires_at) < new Date() ? "Vencido " : "Até "}
                                 {format(new Date(u.subscription_expires_at + "T12:00:00"), "dd/MM/yyyy")}
                               </span>
                             )}
                           </div>
                         ) : <span className="text-xs text-muted-foreground">—</span>}
                       </TableCell>
                       <TableCell><Badge variant={u.active ? "default" : "destructive"}>{u.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(u)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                            {u.id !== currentUser?.id && (
                               <DropdownMenuItem onClick={() => setRoleTarget(u)}>
                                 {u.role === "admin" ? <><ShieldOff className="h-4 w-4 mr-2" /> Rebaixar para Barbearia</> : <><ShieldCheck className="h-4 w-4 mr-2" /> Promover a Admin</>}
                               </DropdownMenuItem>
                             )}
                            <DropdownMenuItem onClick={() => { setPasswordTarget(u); setNewUserPassword(""); }}>
                              <KeyRound className="h-4 w-4 mr-2" /> Alterar senha
                            </DropdownMenuItem>
                            {u.id !== currentUser?.id && (
                              <>
                                <DropdownMenuItem onClick={() => setDeactivateTarget(u)}><PowerOff className="h-4 w-4 mr-2" />{u.active ? "Desativar" : "Ativar"}</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(u)}><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assinaturas" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground">Valores das Mensalidades</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">Defina os valores cobrados mensalmente de cada barbearia cadastrada.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Mensalidade Básico</Label>
                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span><Input type="number" step="0.01" min="0" value={priceNormal} onChange={(e) => setPriceNormal(e.target.value)} className="pl-10" placeholder="0.00" /></div>
                  <p className="text-xs text-muted-foreground">Valor para o plano básico sem automação.</p>
                </div>
                <div className="space-y-2">
                  <Label>Mensalidade Premium</Label>
                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span><Input type="number" step="0.01" min="0" value={priceBot} onChange={(e) => setPriceBot(e.target.value)} className="pl-10" placeholder="0.00" /></div>
                  <p className="text-xs text-muted-foreground">Valor para o plano premium com automação via WhatsApp Bot.</p>
                </div>
              </div>
              <Button onClick={handleSavePrices} disabled={savingPrices} className="gap-2">
                {savingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Valores
              </Button>
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-4">Pré-visualização (como o cliente verá)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                  <div className="relative rounded-xl border border-border bg-card p-6 flex flex-col shadow-sm">
                    <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{(() => { const I = icons[iconNormal as keyof typeof icons]; return I ? <I className="h-5 w-5 text-primary" /> : <Scissors className="h-5 w-5 text-primary" />; })()}</div><div><h3 className="font-semibold text-foreground">Plano Básico</h3><p className="text-xs text-muted-foreground">{subtitleNormal || "Gestão completa de créditos"}</p></div></div>
                    <div className="flex items-baseline gap-1 mt-4"><span className="text-3xl font-bold text-foreground">R$ {parseFloat(priceNormal || "0").toFixed(2).replace(".", ",")}</span><span className="text-sm text-muted-foreground">/mês</span></div>
                    <ul className="space-y-2 text-sm text-muted-foreground mt-4 flex-1">{featuresNormal.map((f, i) => (<li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {f}</li>))}</ul>
                    <Button className="w-full mt-4" variant="outline" disabled>Plano Atual</Button>
                  </div>
                  <div className="relative rounded-xl border-2 border-primary bg-card p-6 flex flex-col shadow-md">
                    <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-xs">Recomendado</Badge>
                    <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{(() => { const I = icons[iconBot as keyof typeof icons]; return I ? <I className="h-5 w-5 text-primary" /> : <Bot className="h-5 w-5 text-primary" />; })()}</div><div><h3 className="font-semibold text-foreground">Plano Premium</h3><p className="text-xs text-muted-foreground">{subtitleBot || "Automação via WhatsApp"}</p></div></div>
                    <div className="flex items-baseline gap-1 mt-4"><span className="text-3xl font-bold text-foreground">R$ {parseFloat(priceBot || "0").toFixed(2).replace(".", ",")}</span><span className="text-sm text-muted-foreground">/mês</span></div>
                    <ul className="space-y-2 text-sm text-muted-foreground mt-4 flex-1">{featuresBot.map((f, i) => (<li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {f}</li>))}</ul>
                    <Button className="w-full mt-4" disabled>Contratar</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-foreground"><ListChecks className="h-5 w-5" /> Benefícios dos Planos</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">Configure ícone, subtítulo e benefícios de cada plano na página de Assinaturas.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Básico */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground flex items-center gap-2"><Scissors className="h-4 w-4 text-primary" /> Plano Básico</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Ícone (nome Lucide)</Label>
                    <Input value={iconNormal} onChange={e => setIconNormal(e.target.value)} placeholder="Scissors" className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Subtítulo</Label>
                    <Input value={subtitleNormal} onChange={e => setSubtitleNormal(e.target.value)} placeholder="Gestão completa de créditos" className="text-sm" />
                  </div>
                  <Label className="text-xs">Benefícios</Label>
                  <ul className="space-y-2">
                    {featuresNormal.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1">{f}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setFeaturesNormal(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Input value={newFeatureNormal} onChange={e => setNewFeatureNormal(e.target.value)} placeholder="Novo benefício..." className="flex-1" onKeyDown={e => { if (e.key === "Enter" && newFeatureNormal.trim()) { setFeaturesNormal(prev => [...prev, newFeatureNormal.trim()]); setNewFeatureNormal(""); } }} />
                    <Button variant="outline" size="icon" disabled={!newFeatureNormal.trim()} onClick={() => { setFeaturesNormal(prev => [...prev, newFeatureNormal.trim()]); setNewFeatureNormal(""); }}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
                {/* Premium */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Plano Premium</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Ícone (nome Lucide)</Label>
                    <Input value={iconBot} onChange={e => setIconBot(e.target.value)} placeholder="Bot" className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Subtítulo</Label>
                    <Input value={subtitleBot} onChange={e => setSubtitleBot(e.target.value)} placeholder="Automação via WhatsApp" className="text-sm" />
                  </div>
                  <Label className="text-xs">Benefícios</Label>
                  <ul className="space-y-2">
                    {featuresBot.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1">{f}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setFeaturesBot(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Input value={newFeatureBot} onChange={e => setNewFeatureBot(e.target.value)} placeholder="Novo benefício..." className="flex-1" onKeyDown={e => { if (e.key === "Enter" && newFeatureBot.trim()) { setFeaturesBot(prev => [...prev, newFeatureBot.trim()]); setNewFeatureBot(""); } }} />
                    <Button variant="outline" size="icon" disabled={!newFeatureBot.trim()} onClick={() => { setFeaturesBot(prev => [...prev, newFeatureBot.trim()]); setNewFeatureBot(""); }}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
              <Button onClick={async () => {
                setSavingFeatures(true);
                try {
                  await Promise.all([
                    supabase.from("subscription_pricing").update({ features: featuresNormal as any, icon: iconNormal, subtitle: subtitleNormal, updated_at: new Date().toISOString() } as any).eq("type", "normal"),
                    supabase.from("subscription_pricing").update({ features: featuresBot as any, icon: iconBot, subtitle: subtitleBot, updated_at: new Date().toISOString() } as any).eq("type", "com_bot"),
                  ]);
                  toast.success("Planos atualizados!");
                } catch (err: any) { toast.error(err.message); } finally { setSavingFeatures(false); }
              }} disabled={savingFeatures} className="gap-2">
                {savingFeatures ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Planos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-foreground"><MessageSquare className="h-5 w-5" /> Configuração WhatsApp por Usuário</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Configure a URL e o token da instância do WhatsApp (uazapi) para cada usuário.</p>
              <div className="space-y-2">
                <Label>Selecionar Usuário</Label>
                <Select value={waConfigUser} onValueChange={(uid) => {
                  setWaConfigUser(uid);
                  const existing = waConfigs[uid];
                  setWaUrl(existing?.api_url || "https://ipazua.uazapi.com");
                  setWaToken(existing?.instance_token || "");
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (<SelectItem key={u.id} value={u.id}>{u.name} ({u.email}){waConfigs[u.id] ? " ✓" : ""}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {waConfigUser && (
                <>
                  <div className="space-y-2"><Label>URL do Servidor</Label><Input value={waUrl} onChange={e => setWaUrl(e.target.value)} placeholder="https://api.uazapi.com" /></div>
                  <div className="space-y-2"><Label>Token da Instância</Label><Input value={waToken} onChange={e => setWaToken(e.target.value)} placeholder="Seu token aqui" type="password" /></div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        setValidatingWa(true);
                        try {
                          const normalizedUrl = waUrl.trim().replace(/\/$/, "").replace("free.uazapi.com", "ipazua.uazapi.com").replace("free.uazapi.dev", "ipazua.uazapi.com");
                          const proxyPath = `/api/uazapi/instance/status`;
                          const url = new URL(proxyPath, window.location.origin);
                          url.searchParams.set("token", waToken.trim());
                          const controller = new AbortController();
                          const timeout = setTimeout(() => controller.abort(), 10000);
                          const res = await fetch(url.toString(), { method: "GET", signal: controller.signal, headers: { "Content-Type": "application/json", token: waToken.trim(), Authorization: `Bearer ${waToken.trim()}`, "X-Target-Api-Url": normalizedUrl } });
                          clearTimeout(timeout);
                          if (res.ok) { const data = await res.json().catch(() => null); toast.success(`Token válido! Status: ${data?.status || "desconhecido"}${data?.profileName ? ` (${data.profileName})` : ""}`); }
                          else if (res.status === 401) { toast.error(`Token inválido para o servidor ${normalizedUrl}`); }
                          else { toast.error(`Erro ${res.status} — servidor ${normalizedUrl} pode estar offline`); }
                        } catch (err: any) { toast.error(err?.name === "AbortError" ? "Timeout — servidor não respondeu em 10s. Verifique a URL." : (err.message || "Erro de conexão ao validar")); }
                        finally { setValidatingWa(false); }
                      }}
                      disabled={validatingWa || !waToken.trim()} variant="outline" className="flex-1 gap-2"
                    >
                      {validatingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Validar Token
                    </Button>
                    <Button
                      onClick={async () => {
                        setSavingWa(true);
                        try {
                          const normalizedUrl = waUrl.trim().replace(/\/$/, "").replace("free.uazapi.com", "ipazua.uazapi.com").replace("free.uazapi.dev", "ipazua.uazapi.com");
                          const { data: existing } = await supabase.from("whatsapp_config").select("id").eq("user_id", waConfigUser).maybeSingle();
                          if (existing) {
                            await supabase.from("whatsapp_config").update({ api_url: normalizedUrl, instance_token: waToken.trim() }).eq("user_id", waConfigUser);
                          } else {
                            await supabase.from("whatsapp_config").insert({ user_id: waConfigUser, api_url: normalizedUrl, instance_token: waToken.trim() });
                          }
                          toast.success("Configuração do WhatsApp salva!");
                          await loadWaConfig();
                        } catch (err: any) { toast.error(err.message || "Erro ao salvar"); }
                        finally { setSavingWa(false); }
                      }}
                      disabled={savingWa || !waToken.trim()} className="flex-1 gap-2"
                    >
                      {savingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credenciais" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" /> Credenciais do Backend
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Acesse URLs, chaves de API, segredos e estrutura do banco de dados do projeto.
              </p>
              <Button onClick={() => navigate("/admin-credentials")}>
                <KeyRound className="h-4 w-4 mr-2" /> Abrir painel de credenciais
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Novo / Editar */}
      <Dialog open={!!dialogMode} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogMode === "new" ? "Novo Usuário" : "Editar Usuário"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Nome</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome completo" /></div>
            <div className="space-y-1"><Label>E-mail</Label><Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
            <div className="space-y-1"><Label>Tipo</Label><Select value={formRole} onValueChange={setFormRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="barbearia">Barbearia</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
            {dialogMode === "new" && (<div className="space-y-1"><Label>Senha</Label><Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="••••••••" /></div>)}
            {formRole === "barbearia" && (
              <>
                <div className="space-y-1">
                  <Label>Plano de Assinatura</Label>
                  <Select value={formSubscription} onValueChange={setFormSubscription}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basico">Básico</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Data de Expiração</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formExpiresAt && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formExpiresAt ? format(formExpiresAt, "dd/MM/yyyy") : "Sem data de expiração"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formExpiresAt}
                        onSelect={setFormExpiresAt}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {formExpiresAt && (
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-6 px-2" onClick={() => setFormExpiresAt(undefined)}>
                      Remover data
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={savingUser} className="gap-2">
              {savingUser && <Loader2 className="h-4 w-4 animate-spin" />}
              {savingUser ? "Salvando..." : dialogMode === "new" ? "Criar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordTarget} onOpenChange={(open) => {
        if (!open) {
          setPasswordTarget(null);
          setNewUserPassword("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Usuário</Label>
              <div className="text-sm text-muted-foreground">
                {passwordTarget?.name} {passwordTarget?.email ? `(${passwordTarget.email})` : ""}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasswordTarget(null); setNewUserPassword(""); }}>Cancelar</Button>
            <Button onClick={handleSetUserPassword} disabled={savingPassword} className="gap-2">
              {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              {savingPassword ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{roleTarget?.role === "admin" ? "Rebaixar usuário?" : "Promover para Admin?"}</AlertDialogTitle><AlertDialogDescription>{roleTarget?.role === "admin" ? `"${roleTarget?.name}" perderá o acesso de administrador.` : `"${roleTarget?.name}" terá acesso total ao painel de administração.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmRoleChange}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deactivateTarget?.active ? "Desativar usuário?" : "Ativar usuário?"}</AlertDialogTitle><AlertDialogDescription>{deactivateTarget?.active ? `"${deactivateTarget?.name}" não conseguirá mais acessar o sistema.` : `"${deactivateTarget?.name}" voltará a ter acesso ao sistema.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDeactivate}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir usuário?</AlertDialogTitle><AlertDialogDescription>Esta ação é irreversível. "{deleteTarget?.name}" será removido permanentemente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
