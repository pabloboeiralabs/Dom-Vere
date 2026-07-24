import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Bell, Clock } from "lucide-react";
import WhatsAppTemplatesTab from "@/components/settings/WhatsAppTemplatesTab";

interface Service { id: string; name: string; price: number; duration_minutes: number; active: boolean; }
interface Plan { id: string; name: string; price: number; period: string; usage_limit: number; validity_days: number; active: boolean; services?: PlanService[]; }
interface PlanService { service_id: string; service_name: string; quantity: number; }

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("servicos");
  const [loading, setLoading] = useState(false);

  // Services state
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("0");
  const [newServiceDuration, setNewServiceDuration] = useState("30");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServicePrice, setEditServicePrice] = useState("");
  const [editServiceDuration, setEditServiceDuration] = useState("30");

  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});
  const [newPlanPeriod, setNewPlanPeriod] = useState("mensal");
  const [newPlanUsageLimit, setNewPlanUsageLimit] = useState("4");

  const PERIOD_TO_DAYS: Record<string, number> = {
    semanal: 7,
    quinzenal: 15,
    mensal: 30,
    trimestral: 90,
  };
  // Derived — never set manually by user
  const derivedValidityDays = PERIOD_TO_DAYS[newPlanPeriod] ?? 30;
  const intervalDays = Math.round(derivedValidityDays / Math.max(1, parseInt(newPlanUsageLimit) || 1));
  const frequencyLabel = intervalDays === 7 ? "1x por semana" : intervalDays === 15 ? "1x a cada 15 dias" : intervalDays === 30 ? "1x por mês" : `a cada ${intervalDays} dias`;

  // Reminder state
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHours, setReminderHours] = useState("24");
  const [reminderLoaded, setReminderLoaded] = useState(false);

  const seedAndLoadServices = useCallback(async () => {
    if (!user || servicesLoaded) return;
    try {
      const { count } = await supabase.from("services").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      if (count === 0) {
        await supabase.from("services").insert([
          { user_id: user.id, name: "Corte", price: 0, duration_minutes: 30 },
          { user_id: user.id, name: "Barba", price: 0, duration_minutes: 20 },
          { user_id: user.id, name: "Corte + Barba", price: 0, duration_minutes: 45 },
          { user_id: user.id, name: "Hidratação", price: 0, duration_minutes: 30 },
          { user_id: user.id, name: "Sobrancelha", price: 0, duration_minutes: 15 },
        ]);
      }
      setServicesLoaded(true);
    } catch (e) { /* silent */ }
  }, [user, servicesLoaded]);

  const loadServices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("services").select("*").eq("user_id", user.id).order("name");
    if (data) setServices(data as Service[]);
  }, [user]);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    const { data: plansData } = await supabase.from("plans").select("*").eq("user_id", user.id).order("name");
    const data = (plansData || []) as Plan[];
    const planIds = data.map(p => p.id);
    let planSvcs: any[] = [];
    if (planIds.length) {
      const { data: pss } = await supabase.rpc("get_plan_services_with_names", { p_plan_ids: planIds });
      planSvcs = pss || [];
    }
    for (const p of data) p.services = planSvcs.filter((ps: any) => ps.plan_id === p.id);
    setPlans(data);
    setPlansLoaded(true);
  }, [user]);

  useEffect(() => { if (user) { seedAndLoadServices(); loadServices(); loadPlans(); } }, [user, seedAndLoadServices, loadServices, loadPlans]);

  // Load reminder settings
  useEffect(() => {
    if (!user || reminderLoaded) return;
    (async () => {
      const { data } = await supabase.from("settings").select("auto_reminder_enabled, reminder_hours").eq("user_id", user.id).single();
      if (data) {
        setReminderEnabled(data.auto_reminder_enabled ?? false);
        setReminderHours(String(data.reminder_hours ?? 24));
      }
      setReminderLoaded(true);
    })();
  }, [user, reminderLoaded]);

  const saveReminder = async () => {
    if (!user) return;
    setLoading(true);
    const hours = parseInt(reminderHours) || 24;
    const { error } = await supabase.from("settings").update({
      auto_reminder_enabled: reminderEnabled,
      reminder_hours: Math.max(1, Math.min(168, hours)),
    }).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Configurações de lembretes salvas!");
    setLoading(false);
  };

  const handleAddService = async () => {
    if (!user || !newServiceName.trim()) return;
    setLoading(true);
    const price = parseFloat(newServicePrice) || 0;
    const duration = parseInt(newServiceDuration) || 30;
    const { error } = await supabase.from("services").insert({ user_id: user.id, name: newServiceName.trim(), price, duration_minutes: duration });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setNewServiceName(""); setNewServicePrice("0"); setNewServiceDuration("30");
    loadServices();
    toast.success("Serviço adicionado!");
  };

  const handleToggleService = async (service: Service) => {
    await supabase.from("services").update({ active: !service.active }).eq("id", service.id);
    loadServices();
  };

  const handleDeleteService = async (id: string) => {
    await supabase.from("services").delete().eq("id", id);
    loadServices();
  };

  const startEditService = (s: Service) => {
    setEditingService(s); setEditServiceName(s.name); setEditServicePrice(String(s.price)); setEditServiceDuration(String(s.duration_minutes || 30));
  };

  const saveEditService = async () => {
    if (!editingService) return;
    const price = parseFloat(editServicePrice) || 0;
    const duration = parseInt(editServiceDuration) || 30;
    await supabase.from("services").update({ name: editServiceName.trim(), price, duration_minutes: duration }).eq("id", editingService.id);
    setEditingService(null); loadServices();
    toast.success("Serviço atualizado!");
  };

  const openPlanDialog = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setNewPlanName(plan.name); setNewPlanPrice(String(plan.price));
      setNewPlanPeriod(plan.period); setNewPlanUsageLimit(String(plan.usage_limit));
      const svcs: Record<string, number> = {};
      for (const ps of (plan.services || [])) svcs[ps.service_id] = ps.quantity;
      setSelectedServices(svcs);
    } else {
      setEditingPlan(null); setNewPlanName(""); setNewPlanPrice("");
      setNewPlanPeriod("mensal"); setNewPlanUsageLimit("4");
      setSelectedServices({});
    }
    setPlanDialogOpen(true);
  };

  const savePlan = async () => {
    if (!user || !newPlanName.trim()) return;
    setLoading(true);
    const planData = {
      user_id: user.id, name: newPlanName.trim(), price: parseFloat(newPlanPrice) || 0,
      period: newPlanPeriod, usage_limit: parseInt(newPlanUsageLimit) || 1,
      validity_days: derivedValidityDays,
    };
    let planId: string;
    if (editingPlan) {
      const { error } = await supabase.from("plans").update(planData).eq("id", editingPlan.id);
      if (error) { toast.error(error.message); setLoading(false); return; }
      planId = editingPlan.id;
      await supabase.from("plan_services").delete().eq("plan_id", planId);
    } else {
      const { data, error } = await supabase.from("plans").insert(planData).select("id").single();
      if (error || !data) { toast.error(error?.message || "Erro"); setLoading(false); return; }
      planId = data.id;
    }
    const svcEntries = Object.entries(selectedServices).filter(([_, qty]) => qty > 0);
    if (svcEntries.length) {
      await supabase.from("plan_services").insert(svcEntries.map(([service_id, quantity]) => ({ plan_id: planId, service_id, quantity })));
    }
    setLoading(false); setPlanDialogOpen(false); loadPlans();
    toast.success(editingPlan ? "Plano atualizado!" : "Plano criado!");
  };

  const togglePlanActive = async (plan: Plan) => {
    await supabase.from("plans").update({ active: !plan.active }).eq("id", plan.id);
    loadPlans();
  };

  const deletePlan = async (id: string) => {
    await supabase.from("plans").delete().eq("id", id);
    loadPlans();
  };

  return (
    <div className="space-y-6 w-full">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto flex-wrap">
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="lembretes">
            <Bell className="h-4 w-4 mr-1" /> Lembretes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servicos">
          {/* ... existing services tab ... */}
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground">Serviços</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="space-y-2 flex-1 min-w-0">
                  <Label>Nome do serviço</Label>
                  <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="Ex: Corte, Barba..." />
                </div>
                <div className="space-y-2 w-full sm:w-24">
                  <Label>Duração (min)</Label>
                  <Input type="number" min="5" step="5" value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} />
                </div>
                <div className="space-y-2 w-full sm:w-28">
                  <Label>Preço (R$)</Label>
                  <Input type="number" step="0.01" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} />
                </div>
                <Button onClick={handleAddService} disabled={loading || !newServiceName.trim()} className="w-full sm:w-auto">
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-center w-20">Duração</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-center w-20">Ativo</TableHead>
                    <TableHead className="text-right w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{s.duration_minutes || 30} min</TableCell>
                      <TableCell className="text-right">R$ {Number(s.price).toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={s.active} onCheckedChange={() => handleToggleService(s)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => startEditService(s)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteService(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Edit Service Dialog */}
              <Dialog open={!!editingService} onOpenChange={(o) => !o && setEditingService(null)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Editar Serviço</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Nome</Label><Input value={editServiceName} onChange={(e) => setEditServiceName(e.target.value)} /></div>
                    <div><Label>Duração (minutos)</Label><Input type="number" min="5" step="5" value={editServiceDuration} onChange={(e) => setEditServiceDuration(e.target.value)} /></div>
                    <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={editServicePrice} onChange={(e) => setEditServicePrice(e.target.value)} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingService(null)}>Cancelar</Button>
                    <Button onClick={saveEditService}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planos">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Planos</CardTitle>
              <Button size="sm" onClick={() => openPlanDialog()}><Plus className="h-4 w-4 mr-1" /> Novo Plano</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-center">Período</TableHead>
                    <TableHead className="text-center">Usos</TableHead>
                    <TableHead className="text-center">Ativo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">R$ {Number(p.price).toFixed(2)}</TableCell>
                      <TableCell className="text-center">{p.period}</TableCell>
                      <TableCell className="text-center">{p.usage_limit}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={p.active} onCheckedChange={() => togglePlanActive(p)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openPlanDialog(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deletePlan(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppTemplatesTab />
        </TabsContent>

        <TabsContent value="lembretes">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Bell className="h-5 w-5" /> Lembretes Automáticos</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Lembretes automáticos</Label>
                  <p className="text-sm text-muted-foreground">Enviar notificações para clientes sobre agendamentos</p>
                </div>
                <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Enviar lembrete quanto tempo antes?
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    value={reminderHours}
                    onChange={(e) => setReminderHours(e.target.value)}
                    className="w-24 text-center"
                  />
                  <span className="text-sm text-muted-foreground">horas antes do agendamento</span>
                </div>
                <p className="text-xs text-muted-foreground">Mínimo 1 hora, máximo 168 horas (7 dias)</p>
              </div>

              <Button onClick={saveReminder} disabled={loading}>
                {loading ? "Salvando..." : "Salvar configurações"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome do plano</Label><Input value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} placeholder="Ex: Corte e Barba 4x" /></div>
            <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={newPlanPrice} onChange={(e) => setNewPlanPrice(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Período</Label>
                <select value={newPlanPeriod} onChange={(e) => setNewPlanPeriod(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="semanal">Semanal (7 dias)</option>
                  <option value="quinzenal">Quinzenal (15 dias)</option>
                  <option value="mensal">Mensal (30 dias)</option>
                  <option value="trimestral">Trimestral (90 dias)</option>
                </select>
              </div>
              <div>
                <Label>Nº de usos no período</Label>
                <Input type="number" min={1} value={newPlanUsageLimit} onChange={(e) => setNewPlanUsageLimit(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p>📅 <strong>Validade:</strong> {derivedValidityDays} dias (automático pelo período)</p>
              <p>🔄 <strong>Frequência de retorno:</strong> {frequencyLabel}</p>
            </div>
            {services.length > 0 && (
              <div>
                <Label>Serviços inclusos</Label>
                <div className="space-y-2 mt-1">
                  {services.filter(s => s.active).map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={!!selectedServices[s.id]}
                        onCheckedChange={(checked) => setSelectedServices(prev => {
                          const next = { ...prev };
                          if (checked) next[s.id] = 1;
                          else delete next[s.id];
                          return next;
                        })}
                      />
                      <span className="text-sm flex-1">{s.name}</span>
                      {selectedServices[s.id] && (
                        <Input
                          type="number" min={1}
                          className="w-16 h-8 text-center text-xs"
                          value={selectedServices[s.id]}
                          onChange={(e) => setSelectedServices(prev => ({ ...prev, [s.id]: parseInt(e.target.value) || 1 }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
            <Button onClick={savePlan} disabled={loading || !newPlanName.trim()}>{loading ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
