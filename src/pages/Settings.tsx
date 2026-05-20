import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import WhatsAppTemplatesTab from "@/components/settings/WhatsAppTemplatesTab";

interface Service { id: string; name: string; price: number; active: boolean; }
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
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServicePrice, setEditServicePrice] = useState("");

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
  const [newPlanValidityDays, setNewPlanValidityDays] = useState("30");

  const seedAndLoadServices = useCallback(async () => {
    if (!user || servicesLoaded) return;
    try {
      const { count } = await supabase.from("services").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      if (count === 0) {
        const defaults = [
          { name: "Corte equipe", price: 46.99 }, { name: "Barba equipe", price: 43.99 },
          { name: "Barba express", price: 25.00 }, { name: "Pezinho", price: 12.99 },
          { name: "Sobrancelha na navalha", price: 12.99 }, { name: "Sobrancelha pinça", price: 35.00 },
          { name: "Esfoliação", price: 25.00 }, { name: "Depilação nariz", price: 23.99 },
          { name: "Depilação orelha", price: 23.99 }, { name: "Hidratação", price: 24.75 },
          { name: "Relaxamento", price: 55.00 },
        ];
        for (const s of defaults) {
          await supabase.from("services").insert({ user_id: user.id, name: s.name, price: s.price });
        }
      }
      const { data } = await supabase.from("services").select("*").eq("user_id", user.id).order("name");
      setServices((data || []) as Service[]);
      setServicesLoaded(true);
    } catch (e) { console.error(e); }
  }, [user, servicesLoaded]);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    try {
      const { data: rows } = await supabase.from("plans").select("*").eq("user_id", user.id).order("name");
      if (!rows || rows.length === 0) { setPlans([]); setPlansLoaded(true); return; }
      const planIds = rows.map(p => p.id);
      const { data: allServices } = await supabase.rpc("get_plan_services_with_names", { p_plan_ids: planIds });
      const servicesByPlan: Record<string, PlanService[]> = {};
      for (const s of (allServices || []) as any[]) {
        if (!servicesByPlan[s.plan_id]) servicesByPlan[s.plan_id] = [];
        servicesByPlan[s.plan_id].push({ service_id: s.service_id, service_name: s.service_name, quantity: s.quantity });
      }
      setPlans(rows.map(p => ({ ...p, services: servicesByPlan[p.id] || [] })) as Plan[]);
      setPlansLoaded(true);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => {
    if (activeTab === "servicos" && !servicesLoaded) seedAndLoadServices();
    else if (activeTab === "planos") {
      if (!servicesLoaded) seedAndLoadServices();
      if (!plansLoaded) loadPlans();
    }
  }, [activeTab, servicesLoaded, plansLoaded, seedAndLoadServices, loadPlans]);

  const reloadServices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("services").select("*").eq("user_id", user.id).order("name");
    setServices((data || []) as Service[]);
  }, [user]);

  const handleAddService = async () => {
    if (!user || !newServiceName.trim()) return;
    setLoading(true);
    try {
      const { data: created, error } = await supabase.from("services")
        .insert({ user_id: user.id, name: newServiceName.trim(), price: parseFloat(newServicePrice) || 0 })
        .select().single();
      if (error) throw error;
      toast.success("Serviço adicionado!");
      setNewServiceName(""); setNewServicePrice("0");
      if (created) setServices(prev => [...prev, created as Service].sort((a, b) => a.name.localeCompare(b.name)));
      else reloadServices();
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  };

  const handleDeleteService = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("services").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Serviço removido!");
    setServices(prev => prev.filter(s => s.id !== id));
  };

  const openEditService = (s: Service) => { setEditingService(s); setEditServiceName(s.name); setEditServicePrice(String(s.price)); };

  const handleEditService = async () => {
    if (!user || !editingService || !editServiceName.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("services").update({ name: editServiceName.trim(), price: parseFloat(editServicePrice) || 0 }).eq("id", editingService.id).eq("user_id", user.id);
      if (error) throw error;
      toast.success("Serviço atualizado!");
      setEditingService(null);
      reloadServices();
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  };

  const resetPlanForm = () => {
    setNewPlanName(""); setNewPlanPrice(""); setSelectedServices({});
    setNewPlanPeriod("mensal"); setNewPlanUsageLimit("4"); setNewPlanValidityDays("30");
    setEditingPlan(null);
  };

  const openEditPlan = (p: Plan) => {
    setEditingPlan(p); setNewPlanName(p.name); setNewPlanPrice(String(p.price));
    setNewPlanPeriod(p.period || "mensal"); setNewPlanUsageLimit(String(p.usage_limit || 4));
    setNewPlanValidityDays(String(p.validity_days || 30));
    const svcMap: Record<string, number> = {};
    if (p.services) for (const s of p.services) svcMap[s.service_id] = s.quantity;
    setSelectedServices(svcMap); setPlanDialogOpen(true);
  };

  const handleCreateOrUpdatePlan = async () => {
    if (!user || !newPlanName.trim() || !newPlanPrice) return;
    setLoading(true);
    try {
      if (editingPlan) {
        await supabase.from("plans").update({
          name: newPlanName.trim(), price: parseFloat(newPlanPrice), period: newPlanPeriod,
          usage_limit: parseInt(newPlanUsageLimit), validity_days: parseInt(newPlanValidityDays),
        }).eq("id", editingPlan.id).eq("user_id", user.id);
        await supabase.from("plan_services").delete().eq("plan_id", editingPlan.id);
        for (const [serviceId, qty] of Object.entries(selectedServices)) {
          if (qty > 0) await supabase.from("plan_services").insert({ plan_id: editingPlan.id, service_id: serviceId, quantity: qty });
        }
        toast.success("Plano atualizado!");
      } else {
        const { data: plan, error } = await supabase.from("plans")
          .insert({ user_id: user.id, name: newPlanName.trim(), price: parseFloat(newPlanPrice), period: newPlanPeriod, usage_limit: parseInt(newPlanUsageLimit), validity_days: parseInt(newPlanValidityDays) })
          .select("id").single();
        if (error) throw error;
        for (const [serviceId, qty] of Object.entries(selectedServices)) {
          if (qty > 0) await supabase.from("plan_services").insert({ plan_id: plan.id, service_id: serviceId, quantity: qty });
        }
        toast.success("Plano criado!");
      }
      setPlanDialogOpen(false); resetPlanForm(); setPlansLoaded(false);
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  };

  const handleDeletePlan = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("plans").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Plano removido!");
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const toggleService = (serviceId: string, checked: boolean) => {
    setSelectedServices(prev => {
      if (checked) return { ...prev, [serviceId]: prev[serviceId] || 1 };
      const copy = { ...prev }; delete copy[serviceId]; return copy;
    });
  };

  return (
    <div className="space-y-6 w-full">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="servicos" className="flex-1 sm:flex-none">Serviços</TabsTrigger>
          <TabsTrigger value="planos" className="flex-1 sm:flex-none">Planos</TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex-1 sm:flex-none">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground">Serviços</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="space-y-2 flex-1 min-w-0">
                  <Label>Nome do serviço</Label>
                  <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="Ex: Corte, Barba..." />
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
                <TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead className="text-right">Preço</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                      <TableCell className="text-right text-foreground">R$ {Number(s.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(s)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteService(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {services.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhum serviço cadastrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planos">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Planos</CardTitle>
              <Button onClick={() => { resetPlanForm(); setPlanDialogOpen(true); }} disabled={services.length === 0}>
                <Plus className="mr-1 h-4 w-4" /> Novo Plano
              </Button>
            </CardHeader>
            <CardContent>
              {services.length === 0 && <p className="text-sm text-muted-foreground mb-4">Cadastre serviços primeiro para criar planos.</p>}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead className="hidden md:table-cell">Periodicidade</TableHead>
                    <TableHead className="hidden md:table-cell">Serviços inclusos</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm capitalize">
                        {p.period || "mensal"} · {p.usage_limit || 4}x · {p.validity_days || 30} dias
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {p.services?.map(s => `${s.quantity}x ${s.service_name}`).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right text-foreground">R$ {Number(p.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditPlan(p)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePlan(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {plans.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum plano cadastrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp"><WhatsAppTemplatesTab /></TabsContent>
      </Tabs>

      {/* Dialog Editar Serviço */}
      <Dialog open={!!editingService} onOpenChange={(open) => !open && setEditingService(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Serviço</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={editServiceName} onChange={(e) => setEditServiceName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Preço (R$)</Label><Input type="number" step="0.01" value={editServicePrice} onChange={(e) => setEditServicePrice(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingService(null)}>Cancelar</Button>
            <Button onClick={handleEditService} disabled={loading || !editServiceName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo/Editar Plano */}
      <Dialog open={planDialogOpen} onOpenChange={(open) => { if (!open) { setPlanDialogOpen(false); resetPlanForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2"><Label>Nome do plano</Label><Input value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} placeholder="Ex: Plano Básico" /></div>
            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <RadioGroup value={newPlanPeriod} onValueChange={setNewPlanPeriod} className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="mensal" id="mensal" /><Label htmlFor="mensal" className="cursor-pointer">Mensal</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="quinzenal" id="quinzenal" /><Label htmlFor="quinzenal" className="cursor-pointer">Quinzenal</Label></div>
              </RadioGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label className="text-xs">Limite de uso</Label><Input type="number" min="1" value={newPlanUsageLimit} onChange={(e) => setNewPlanUsageLimit(e.target.value)} /><p className="text-[10px] text-muted-foreground">{newPlanPeriod === "mensal" ? "por mês" : "por quinzena"}</p></div>
              <div className="space-y-2"><Label className="text-xs">Vencimento (dias)</Label><Input type="number" min="1" value={newPlanValidityDays} onChange={(e) => setNewPlanValidityDays(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Serviços inclusos</Label>
              <div className="space-y-3 max-h-48 overflow-y-auto border rounded-md p-3">
                {services.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <Checkbox checked={s.id in selectedServices} onCheckedChange={(checked) => toggleService(s.id, !!checked)} />
                    <span className="flex-1 text-sm text-foreground">{s.name} <span className="text-muted-foreground">(R$ {Number(s.price).toFixed(2)})</span></span>
                    {s.id in selectedServices && (
                      <Input type="number" min="1" className="w-20 h-8" value={selectedServices[s.id]} onChange={(e) => setSelectedServices(prev => ({ ...prev, [s.id]: parseInt(e.target.value) || 1 }))} />
                    )}
                  </div>
                ))}
              </div>
              {Object.keys(selectedServices).length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Valor dos serviços ({newPlanUsageLimit}x uso): <span className="font-semibold text-foreground">R$ {(services.reduce((sum, s) => {
                    const qty = selectedServices[s.id];
                    return qty ? sum + Number(s.price) * qty : sum;
                  }, 0) * (parseInt(newPlanUsageLimit) || 1)).toFixed(2)}</span>
                </p>
              )}
            </div>
            <div className="space-y-2"><Label>Preço do plano (R$)</Label><Input type="number" step="0.01" value={newPlanPrice} onChange={(e) => setNewPlanPrice(e.target.value)} placeholder="Preço do combo" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPlanDialogOpen(false); resetPlanForm(); }}>Cancelar</Button>
            <Button onClick={handleCreateOrUpdatePlan} disabled={loading || !newPlanName.trim() || !newPlanPrice}>{editingPlan ? "Salvar" : "Criar Plano"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
