import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { CheckCircle, Clock } from "lucide-react";

interface PlanService {
  service_id: string;
  service_name: string;
  quantity: number;
}

interface PendingService {
  id: string;
  usage_record_id: string;
  service_id: string;
  service_name: string;
  completed: boolean;
  created_at: string;
}

interface Professional {
  id: string;
  name: string;
}

interface PlanUsageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerPlanId: string;
  planId: string;
  onUsageRegistered: () => void;
}

export default function PlanUsageDialog({ open, onOpenChange, customerPlanId, planId, onUsageRegistered }: PlanUsageDialogProps) {
  const { user } = useAuth();
  const [planServices, setPlanServices] = useState<PlanService[]>([]);
  const [pendingServices, setPendingServices] = useState<PendingService[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [usageDate, setUsageDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!open || !user) return;
    const load = async () => {
      try {
        const [servicesRes, pendingRes, profsRes] = await Promise.all([
          supabase.rpc("get_plan_services_with_names", { p_plan_ids: [planId] }),
          supabase.rpc("get_usage_pending_services", { p_customer_plan_id: customerPlanId }),
          supabase.from("professionals").select("id, name").eq("user_id", user.id).eq("active", true).order("name"),
        ]);
        const services = (servicesRes.data || []) as any[];
        const pending = (pendingRes.data || []) as PendingService[];
        const profs = (profsRes.data || []) as Professional[];
        setPlanServices(services.map(s => ({ service_id: s.service_id, service_name: s.service_name, quantity: s.quantity })));
        setPendingServices(pending);
        setProfessionals(profs);
        setSelectedServices(new Set(services.map((s: any) => s.service_id)));
        setSelectedProfessional("");
        setUsageDate(new Date().toISOString().split("T")[0]);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [open, planId, customerPlanId, user]);

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  };

  const completePendingService = async (pendingId: string) => {
    try {
      const { error } = await supabase.from("plan_usage_services").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", pendingId);
      if (error) throw error;
      setPendingServices(prev => prev.filter(p => p.id !== pendingId));
      toast.success("Serviço pendente concluído!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRegisterUsage = async () => {
    if (!selectedProfessional) {
      toast.error("Selecione o profissional");
      return;
    }
    if (planServices.length > 0 && selectedServices.size === 0) {
      toast.error("Selecione pelo menos um serviço");
      return;
    }
    setLoading(true);
    try {
      const { data: cpData } = await supabase.from("customer_plans").select("usage_count, usage_limit, expires_at, active, paid_amount, total_price").eq("id", customerPlanId).single();
      if (!cpData) throw new Error("Plano não encontrado");
      if (!cpData.active) { toast.error("Plano inativo"); setLoading(false); return; }
      if (new Date(cpData.expires_at) < new Date()) { toast.error("Plano vencido"); setLoading(false); return; }
      if ((cpData.usage_count || 0) >= cpData.usage_limit) { toast.error("Limite de uso atingido"); setLoading(false); return; }

      // Check proportional payment limit
      const paidAmt = Number(cpData.paid_amount) || 0;
      const totalPrice = Number(cpData.total_price) || 0;
      const hasPendingPayment = totalPrice > 0 && paidAmt < totalPrice;
      const allowedUsages = totalPrice > 0 ? Math.floor((paidAmt / totalPrice) * cpData.usage_limit) : 0;
      if (hasPendingPayment && (cpData.usage_count || 0) >= allowedUsages) {
        const pendingAmt = totalPrice - paidAmt;
        toast.error(`Limite de usos para o valor pago atingido. Registre o pagamento de R$ ${pendingAmt.toFixed(2)} para liberar mais usos.`);
        setLoading(false);
        return;
      }

      // Resolve usage timestamp (allow retroactive date, but cap at "now")
      const effectiveDateStr = usageDate || todayStr;
      const usageTimestamp = (() => {
        const now = new Date();
        // If selected date is today, use current time; otherwise noon of that date
        if (effectiveDateStr === todayStr) return now.toISOString();
        const dt = new Date(`${effectiveDateStr}T12:00:00`);
        if (dt > now) return now.toISOString();
        return dt.toISOString();
      })();

      await supabase.from("customer_plans").update({ usage_count: (cpData.usage_count || 0) + 1 }).eq("id", customerPlanId);

      const newUsageCount = (cpData.usage_count || 0) + 1;
      if (newUsageCount >= cpData.usage_limit) {
        const { data: cpFull } = await supabase.from("customer_plans").select("plan_id").eq("id", customerPlanId).single();
        const { data: planData } = await supabase.from("plans").select("validity_days").eq("id", cpFull?.plan_id || "").single();
        const validityDays = planData?.validity_days || 30;
        const startsBase = new Date(`${effectiveDateStr}T12:00:00`);
        const expiresDate = new Date(startsBase);
        expiresDate.setDate(expiresDate.getDate() + validityDays);
        await supabase.from("customer_plans").update({
          usage_count: 0,
          paid_amount: 0,
          starts_at: effectiveDateStr,
          expires_at: expiresDate.toISOString().split("T")[0],
        }).eq("id", customerPlanId);
      }

      const { data: record, error: recErr } = await supabase.from("plan_usage_records").insert({
        customer_plan_id: customerPlanId,
        professional_id: selectedProfessional || null,
        created_at: usageTimestamp,
      }).select("id").single();
      if (recErr) throw recErr;

      for (const svc of planServices) {
        const completed = selectedServices.has(svc.service_id);
        await supabase.from("plan_usage_services").insert({
          usage_record_id: record.id,
          service_id: svc.service_id,
          service_name: svc.service_name,
          completed,
          completed_at: completed ? usageTimestamp : null,
        });
      }

      const notDone = planServices.filter(s => !selectedServices.has(s.service_id));
      // Check if after this usage the proportional limit is now reached
      const newAllowedCheck = totalPrice > 0 ? Math.floor((paidAmt / totalPrice) * cpData.usage_limit) : cpData.usage_limit;
      const reachedPaidLimit = hasPendingPayment && newUsageCount >= newAllowedCheck && newUsageCount < cpData.usage_limit;

      if (newUsageCount >= cpData.usage_limit) {
        toast.success("Último uso registrado! Plano renovado — registre o pagamento para liberar novos usos.");
      } else if (reachedPaidLimit) {
        const pendingAmt = totalPrice - paidAmt;
        toast.warning(`Último uso liberado para o valor pago! Pague R$ ${pendingAmt.toFixed(2)} para continuar usando.`);
      } else if (notDone.length > 0) {
        toast.success(`Uso registrado! ${notDone.length} serviço(s) ficaram pendentes.`);
      } else {
        toast.success("Uso registrado com todos os serviços!");
      }

      onUsageRegistered();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Uso do Plano</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Profissional <span className="text-destructive">*</span></Label>
            <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
              <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
              <SelectContent>
                {professionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Data do uso</Label>
            <Input
              type="date"
              value={usageDate}
              max={todayStr}
              onChange={(e) => setUsageDate(e.target.value)}
            />
            {usageDate && usageDate !== todayStr && (
              <p className="text-xs text-amber-500 mt-1">
                ⚠ Registro retroativo — o vencimento da renovação será calculado a partir desta data.
              </p>
            )}
          </div>

          {/* Pending services from previous usages */}
          {pendingServices.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground flex items-center gap-1">
                <Clock className="h-4 w-4 text-amber-500" /> Serviços Pendentes
              </p>
              <div className="space-y-2 border border-amber-500/30 rounded-lg p-3 bg-amber-500/5">
                {pendingServices.map((ps) => (
                  <div key={ps.id} className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-foreground">{ps.service_name}</span>
                      <span className="text-muted-foreground text-xs ml-2">
                        {new Date(ps.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => completePendingService(ps.id)}>
                      <CheckCircle className="mr-1 h-3 w-3" /> Concluir
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Services for new usage */}
          {planServices.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Serviços realizados neste uso:</p>
              <div className="space-y-2 border border-border rounded-lg p-3">
                {planServices.map((svc) => (
                  <label key={svc.service_id} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={selectedServices.has(svc.service_id)}
                      onCheckedChange={() => toggleService(svc.service_id)}
                    />
                    <span className="text-sm text-foreground">{svc.service_name}</span>
                    {svc.quantity > 1 && (
                      <Badge variant="secondary" className="text-xs">x{svc.quantity}</Badge>
                    )}
                  </label>
                ))}
              </div>
              {selectedServices.size < planServices.length && (
                <p className="text-xs text-amber-500">
                  ⚠ {planServices.length - selectedServices.size} serviço(s) ficarão pendentes
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhum serviço vinculado a este plano
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleRegisterUsage} disabled={loading}>
            {loading ? "Registrando..." : "Registrar Uso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
