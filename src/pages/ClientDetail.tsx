import { useEffect, useState, useCallback } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useParams, useNavigate } from "react-router-dom";
import PlanUsageDialog from "@/components/PlanUsageDialog";
import ServiceSaleDialog from "@/components/ServiceSaleDialog";
import TricolorProgressBar from "@/components/TricolorProgressBar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CreditCard, Scissors, Plus, CalendarDays, Package, Trash2, Clock, CheckCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Customer {
  id: string;
  name: string;
  phone: string;
  birth_date: string;
  credit_balance: number;
}

interface HistoryItem {
  type: string;
  amount: number;
  total: number;
  notes: string;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  usage_limit: number;
  validity_days: number;
}

interface CustomerPlan {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  usage_count: number;
  usage_limit: number;
  period: string;
  total_price: number;
  paid_amount: number;
  starts_at: string;
  expires_at: string;
  active: boolean;
}

interface PendingService {
  id: string;
  customer_plan_id: string;
  service_name: string;
  created_at: string;
}

export default function ClientDetail() {
  const getTodayDateString = () => new Date().toISOString().split("T")[0];
  const addDaysToDateString = (dateString: string, days: number) => {
    const baseDate = new Date(`${dateString}T12:00:00`);
    baseDate.setDate(baseDate.getDate() + days);
    return baseDate.toISOString().split("T")[0];
  };

  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [customerPlans, setCustomerPlans] = useState<CustomerPlan[]>([]);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(getTodayDateString());
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageTarget, setUsageTarget] = useState<{ customerPlanId: string; planId: string } | null>(null);
  const [pendingServices, setPendingServices] = useState<PendingService[]>([]);
  const [removePlanTarget, setRemovePlanTarget] = useState<{ id: string; name: string } | null>(null);
  const [removeAlsoTransaction, setRemoveAlsoTransaction] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<CustomerPlan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [serviceSaleOpen, setServiceSaleOpen] = useState(false);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);

  const loadCustomerPlans = useCallback(async () => {
    if (!user || !id) return;
    try {
      const [planRes, pendingRes] = await Promise.all([
        supabase.rpc("get_customer_plan_details", { p_user_id: user.id, p_customer_id: id }),
        supabase.rpc("get_pending_services", { p_user_id: user.id, p_customer_id: id }),
      ]);
      setCustomerPlans((planRes.data || []) as CustomerPlan[]);
      setPendingServices((pendingRes.data || []) as PendingService[]);
    } catch (e) {
      console.error(e);
    }
  }, [user, id]);

  const loadAvailablePlans = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("plans")
        .select("id, name, price, period, usage_limit, validity_days")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("name");
      setAvailablePlans((data || []) as Plan[]);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user || !id) return;
    try {
      const { data } = await supabase.rpc("get_customer_history", { p_user_id: user.id, p_customer_id: id });
      setHistory((data || []) as HistoryItem[]);
    } catch (e) {
      console.error(e);
    }
  }, [user, id]);

  useEffect(() => {
    if (!user || !id) return;
    const loadCustomer = async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      setCustomer(data as Customer);
    };
    Promise.all([loadCustomer(), loadCustomerPlans(), loadAvailablePlans(), loadHistory()]);
  }, [user, id, loadCustomerPlans, loadAvailablePlans, loadHistory]);

  const assignPlan = async () => {
    if (!user || !id || !selectedPlanId) return;
    const plan = availablePlans.find(p => p.id === selectedPlanId);
    if (!plan) return;

    const planPrice = Number(plan.price);
    const paid = paidAmount === "" ? planPrice : Math.min(Math.max(0, Number(paidAmount)), planPrice);

    try {
      const startsAt = assignStartDate || getTodayDateString();
      const expiresAt = addDaysToDateString(startsAt, plan.validity_days || 30);

      await supabase.from("customer_plans").insert({
        user_id: user.id,
        customer_id: id,
        plan_id: plan.id,
        usage_limit: plan.usage_limit,
        period: plan.period,
        starts_at: startsAt,
        total_price: planPrice,
        paid_amount: paid,
        expires_at: expiresAt,
      });

      await supabase.from("customers").update({
        credit_balance: (customer?.credit_balance || 0) + plan.usage_limit,
      }).eq("id", id);

      const unitPrice = paid / plan.usage_limit;
      const notes = paid < planPrice
        ? `Pagamento parcial — R$ ${paid.toFixed(2)} de R$ ${planPrice.toFixed(2)} · ${plan.name}`
        : `Créditos do plano: ${plan.name}`;

      await supabase.from("transactions").insert({
        user_id: user.id,
        customer_id: id,
        type: "purchase",
        amount: plan.usage_limit,
        unit_price: unitPrice,
        total: paid,
        notes,
      });

      toast.success(`Plano associado! ${plan.usage_limit} créditos adicionados.`);
      setAssignDialogOpen(false);
      setSelectedPlanId("");
      setPaidAmount("");
      setAssignStartDate(getTodayDateString());
      loadCustomerPlans();
      loadHistory();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openUsageDialog = (customerPlanId: string, planId: string) => {
    setUsageTarget({ customerPlanId, planId });
    setUsageDialogOpen(true);
  };

  const completePendingService = async (pendingId: string) => {
    try {
      await supabase.from("plan_usage_services").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", pendingId);
      toast.success("Serviço concluído!");
      loadCustomerPlans();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openPaymentDialog = (cp: CustomerPlan) => {
    setPaymentTarget(cp);
    const pending = Number(cp.total_price) - Number(cp.paid_amount);
    setPaymentAmount(pending.toFixed(2));
    setPaymentDialogOpen(true);
  };

  const handleRegisterPayment = async () => {
    if (!user || !id || !paymentTarget) return;
    const totalPrice = Number(paymentTarget.total_price);
    const currentPaid = Number(paymentTarget.paid_amount);
    const pending = totalPrice - currentPaid;
    const amount = Math.min(Math.max(0, Number(paymentAmount)), pending);
    if (amount <= 0) { toast.error("Informe um valor válido"); return; }
    try {
      await supabase.from("customer_plans").update({ paid_amount: currentPaid + amount }).eq("id", paymentTarget.id);
      const newPaid = currentPaid + amount;
      const notes = newPaid >= totalPrice
        ? `Pagamento restante — R$ ${amount.toFixed(2)} · ${paymentTarget.plan_name}`
        : `Pagamento parcial — R$ ${amount.toFixed(2)} de R$ ${pending.toFixed(2)} pendente · ${paymentTarget.plan_name}`;

      await supabase.from("transactions").insert({
        user_id: user.id,
        customer_id: id,
        type: "purchase",
        amount: 0,
        unit_price: 0,
        total: amount,
        notes,
      });

      toast.success(`Pagamento de R$ ${amount.toFixed(2)} registrado!`);
      setPaymentDialogOpen(false);
      setPaymentTarget(null);
      setPaymentAmount("");
      loadCustomerPlans();
      loadHistory();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const renewPlan = async (cp: CustomerPlan) => {
    if (!user || !id) return;
    try {
      const { data: plan } = await supabase.from("plans").select("validity_days").eq("id", cp.plan_id).maybeSingle();
      const validityDays = plan?.validity_days || 30;
      const newExpires = new Date();
      newExpires.setDate(newExpires.getDate() + validityDays);

      await supabase.from("customer_plans").update({
        usage_count: 0,
        paid_amount: 0,
        starts_at: new Date().toISOString().split("T")[0],
        expires_at: newExpires.toISOString().split("T")[0],
        active: true,
      }).eq("id", cp.id);

      toast.success("Plano renovado! Registre o pagamento para liberar o uso.");
      loadCustomerPlans();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const removePlan = (customerPlanId: string, planName: string) => {
    setRemovePlanTarget({ id: customerPlanId, name: planName });
    setRemoveAlsoTransaction(false);
  };

  const confirmRemovePlan = async () => {
    if (!user || !id || !removePlanTarget) return;
    try {
      if (removeAlsoTransaction) {
        await supabase.from("transactions")
          .delete()
          .eq("customer_id", id)
          .eq("user_id", user.id)
          .ilike("notes", `%${removePlanTarget.name}%`);
      }
      await supabase.from("customer_plans").delete().eq("id", removePlanTarget.id);
      toast.success(removeAlsoTransaction ? "Plano e lançamento contábil removidos!" : "Plano removido!");
      setRemovePlanTarget(null);
      loadCustomerPlans();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleClearHistory = async () => {
    if (!user || !id) return;
    try {
      // 1. Deletar transações do cliente
      await supabase.from("transactions").delete().eq("user_id", user.id).eq("customer_id", id);
      // 2. Deletar cortes
      await supabase.from("cuts").delete().eq("user_id", user.id).eq("customer_id", id);
      // 3. Deletar registros de uso de planos (via customer_plans do cliente)
      const { data: cps } = await supabase
        .from("customer_plans")
        .select("id")
        .eq("user_id", user.id)
        .eq("customer_id", id);
      const cpIds = (cps || []).map((c) => c.id);
      if (cpIds.length > 0) {
        await supabase.from("plan_usage_records").delete().in("customer_plan_id", cpIds);
      }
      toast.success("Histórico apagado!");
      setClearHistoryOpen(false);
      loadHistory();
      loadCustomerPlans();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getPlanStatus = (cp: CustomerPlan) => {
    const now = new Date();
    const expires = new Date(cp.expires_at);
    if (!cp.active) return { label: "Inativo", variant: "secondary" as const };
    if (expires < now) return { label: "Vencido", variant: "destructive" as const };
    if (cp.usage_count >= cp.usage_limit) return { label: "Esgotado", variant: "outline" as const };
    if (Number(cp.paid_amount) < Number(cp.total_price)) return { label: "Pgto pendente", variant: "destructive" as const };
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 5) return { label: `${daysLeft}d restantes`, variant: "secondary" as const };
    return { label: "Ativo", variant: "default" as const };
  };

  if (!customer) return <div className="text-center text-muted-foreground py-8">Carregando...</div>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/clients")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
        <p className="text-muted-foreground">{customer.phone || "Sem telefone"}</p>
      </div>

      {/* Serviços Avulsos */}
      <Button onClick={() => setServiceSaleOpen(true)} className="w-full sm:w-auto">
        <Sparkles className="mr-2 h-4 w-4" /> Registrar Serviços Avulsos
      </Button>

      {/* Planos do Cliente */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" /> Planos
          </CardTitle>
          <Button size="sm" onClick={() => {
            setSelectedPlanId("");
            setPaidAmount("");
            setAssignStartDate(getTodayDateString());
            setAssignDialogOpen(true);
          }} disabled={availablePlans.length === 0}>
            <Plus className="mr-1 h-4 w-4" /> Associar Plano
          </Button>
        </CardHeader>
        <CardContent>
          {customerPlans.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">Nenhum plano associado</p>
          ) : (
            <div className="space-y-3">
              {customerPlans.map((cp) => {
                const status = getPlanStatus(cp);
                const totalPrice = Number(cp.total_price) || Number(cp.plan_price);
                const paidAmt = Number(cp.paid_amount) || 0;
                const pendingAmt = totalPrice - paidAmt;
                const usagePercent = cp.usage_limit > 0 ? (cp.usage_count / cp.usage_limit) * 100 : 0;
                const paidPercent = totalPrice > 0 ? (paidAmt / totalPrice) * 100 : 0;
                const greenBar = Math.min(usagePercent, paidPercent);
                const yellowBar = Math.max(0, paidPercent - greenBar);
                const redBar = Math.max(0, 100 - greenBar - yellowBar);
                const hasPendingPayment = pendingAmt > 0;
                const isExpiredOrExhausted = new Date(cp.expires_at) < new Date() || cp.usage_count >= cp.usage_limit;
                const allowedUsages = totalPrice > 0
                  ? Math.floor((paidAmt / totalPrice) * cp.usage_limit)
                  : 0;
                const needsPaymentToContinue = hasPendingPayment && cp.usage_count >= allowedUsages;
                const remainingUsages = cp.usage_limit - allowedUsages;
                const isUsable = cp.active && !isExpiredOrExhausted && !needsPaymentToContinue;
                const planPending = pendingServices.filter(ps => ps.customer_plan_id === cp.id);

                return (
                  <div key={cp.id} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <span className="font-semibold text-foreground">{cp.plan_name}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          R$ {totalPrice.toFixed(2)} · {cp.period}
                        </span>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Uso: {cp.usage_count}/{cp.usage_limit}</span>
                        <span className="text-muted-foreground">
                          Pago: R$ {paidAmt.toFixed(2)} · Pendente: R$ {pendingAmt.toFixed(2)}
                        </span>
                      </div>
                      <TricolorProgressBar usagePercent={greenBar} paidPercent={yellowBar} pendingPercent={redBar} />
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Usado</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Pago</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Pendente</span>
                      </div>
                      {/* Indicador de usos liberados */}
                      {cp.active && !isExpiredOrExhausted && (
                        <div className="flex items-center justify-between text-xs mt-1 px-1">
                          <span className="text-muted-foreground">
                            Usos liberados: <span className={`font-semibold ${(allowedUsages - cp.usage_count) > 0 ? 'text-green-500' : 'text-destructive'}`}>
                              {Math.max(0, allowedUsages - cp.usage_count)}
                            </span> de {allowedUsages}
                          </span>
                          {hasPendingPayment && (
                            <span className="text-muted-foreground">
                              +{remainingUsages} ao pagar R$ {pendingAmt.toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Serviços Pendentes */}
                    {planPending.length > 0 && (
                      <div className="border border-amber-500/30 rounded-md p-3 bg-amber-500/5 space-y-2">
                        <p className="text-xs font-medium text-foreground flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-amber-500" />
                          {planPending.length} serviço(s) pendente(s)
                        </p>
                        {planPending.map((ps) => (
                          <div key={ps.id} className="flex items-center justify-between">
                            <div className="text-sm">
                              <span className="text-foreground">{ps.service_name}</span>
                              <span className="text-muted-foreground text-xs ml-2">
                                {new Date(ps.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => completePendingService(ps.id)}>
                              <CheckCircle className="mr-1 h-3 w-3" /> Concluir
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Alerta de pagamento necessário */}
                    {needsPaymentToContinue && cp.active && !isExpiredOrExhausted && (
                      <div className="border border-destructive/50 rounded-md p-3 bg-destructive/10 space-y-1">
                        <p className="text-sm font-medium text-destructive flex items-center gap-1">
                          ⚠️ Usos esgotados para o valor pago
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Pague R$ {pendingAmt.toFixed(2)} para liberar mais {remainingUsages} uso(s).
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {new Date(cp.starts_at).toLocaleDateString("pt-BR")} — {new Date(cp.expires_at).toLocaleDateString("pt-BR")}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {hasPendingPayment && cp.active && !isExpiredOrExhausted && (
                          <Button size="sm" variant="default" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => openPaymentDialog(cp)}>
                            <CreditCard className="mr-1 h-3 w-3" /><span className="hidden sm:inline">Registrar</span> pgto
                          </Button>
                        )}
                        {isUsable && cp.usage_count < cp.usage_limit && (
                          <Button size="sm" variant="outline" onClick={() => openUsageDialog(cp.id, cp.plan_id)}>
                            <Scissors className="mr-1 h-3 w-3" /><span className="hidden sm:inline">Registrar</span> uso
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removePlan(cp.id, cp.plan_name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground">Histórico</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setClearHistoryOpen(true)}
            disabled={history.length === 0}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Apagar Histórico
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Quantidade</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="hidden sm:table-cell">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant={h.type === "purchase" ? "default" : h.type === "uso" ? "outline" : "secondary"}>
                      {h.type === "purchase" ? (
                        <><CreditCard className="mr-1 h-3 w-3" /> Compra</>
                      ) : h.type === "uso" ? (
                        <><Scissors className="mr-1 h-3 w-3" /> Uso</>
                      ) : (
                        <><Scissors className="mr-1 h-3 w-3" /> Corte</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-foreground">{h.amount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.type === "purchase" && Number(h.total) > 0 ? `R$ ${Number(h.total).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum registro
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Associar Plano */}
      <Dialog open={assignDialogOpen} onOpenChange={(open) => {
        setAssignDialogOpen(open);
        if (!open) {
          setSelectedPlanId("");
          setPaidAmount("");
          setAssignStartDate(getTodayDateString());
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associar Plano</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {availablePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — R$ {Number(p.price).toFixed(2)} ({p.period}, {p.usage_limit}x, {p.validity_days} dias)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedPlanId && (() => {
              const plan = availablePlans.find(p => p.id === selectedPlanId);
              if (!plan) return null;
              const planPrice = Number(plan.price);
              const paid = paidAmount === "" ? planPrice : Number(paidAmount);
              const pending = Math.max(0, planPrice - paid);
              return (
                <div className="rounded-md border border-border p-3 space-y-2 text-sm">
                  <p className="text-foreground font-medium">{plan.name}</p>
                  <p className="text-muted-foreground">Periodicidade: <span className="capitalize">{plan.period}</span></p>
                  <p className="text-muted-foreground">Limite de uso: {plan.usage_limit}x por período</p>
                  <p className="text-muted-foreground">Vencimento: {plan.validity_days} dias</p>
                  <p className="text-muted-foreground">Preço: <span className="font-semibold text-foreground">R$ {planPrice.toFixed(2)}</span></p>
                  <div>
                    <label className="text-muted-foreground text-xs">Data de início</label>
                    <Input
                      type="date"
                      value={assignStartDate}
                      onChange={(e) => setAssignStartDate(e.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vencimento previsto: {new Date(`${addDaysToDateString(assignStartDate || getTodayDateString(), plan.validity_days || 30)}T12:00:00`).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div>
                    <label className="text-muted-foreground text-xs">Valor pago (R$)</label>
                    <Input
                      type="number"
                      min={0}
                      max={planPrice}
                      step={0.01}
                      placeholder={planPrice.toFixed(2)}
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {pending > 0 && (
                    <p className="text-destructive text-xs font-medium">Pendente: R$ {pending.toFixed(2)}</p>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancelar</Button>
            <Button onClick={assignPlan} disabled={!selectedPlanId}>Associar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Registrar Uso */}
      {usageTarget && (
        <PlanUsageDialog
          open={usageDialogOpen}
          onOpenChange={setUsageDialogOpen}
          customerPlanId={usageTarget.customerPlanId}
          planId={usageTarget.planId}
          onUsageRegistered={() => { loadCustomerPlans(); loadHistory(); }}
        />
      )}
      {/* Dialog Confirmar Remoção de Plano */}
      <AlertDialog open={!!removePlanTarget} onOpenChange={(open) => !open && setRemovePlanTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover plano</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover o plano <strong>"{removePlanTarget?.name}"</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="remove-transaction"
              checked={removeAlsoTransaction}
              onCheckedChange={(v) => setRemoveAlsoTransaction(!!v)}
            />
            <label htmlFor="remove-transaction" className="text-sm text-foreground cursor-pointer">
              Excluir também o lançamento contábil (transação financeira)
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemovePlan} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Serviços Avulsos */}
      {user && (
        <ServiceSaleDialog
          open={serviceSaleOpen}
          onOpenChange={setServiceSaleOpen}
          userId={user.id}
          customerId={id!}
          onSaleRegistered={() => loadHistory()}
        />
      )}

      {/* Dialog Registrar Pagamento */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          {paymentTarget && (() => {
            const totalPrice = Number(paymentTarget.total_price);
            const currentPaid = Number(paymentTarget.paid_amount);
            const pending = totalPrice - currentPaid;
            return (
              <div className="space-y-4">
                <div className="rounded-md border border-border p-3 space-y-1 text-sm">
                  <p className="text-foreground font-medium">{paymentTarget.plan_name}</p>
                  <p className="text-muted-foreground">Total: R$ {totalPrice.toFixed(2)}</p>
                  <p className="text-muted-foreground">Já pago: R$ {currentPaid.toFixed(2)}</p>
                  <p className="text-destructive font-medium">Pendente: R$ {pending.toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-muted-foreground text-xs">Valor do pagamento (R$)</label>
                  <Input
                    type="number"
                    min={0}
                    max={pending}
                    step={0.01}
                    placeholder={pending.toFixed(2)}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegisterPayment} disabled={!paymentAmount || Number(paymentAmount) <= 0}>
              Registrar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Apagar Histórico */}
      <AlertDialog open={clearHistoryOpen} onOpenChange={setClearHistoryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove todas as compras, usos de plano e cortes deste cliente. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
