import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Search, SlidersHorizontal } from "lucide-react";
import WhatsAppQuickMessages from "@/components/WhatsAppQuickMessages";
import TricolorProgressBar from "@/components/TricolorProgressBar";

interface ExpiringCredit {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  credit_balance: number;
  expires_at: string;
  days_remaining: number;
  total_price: number;
  paid_amount: number;
  usage_count: number;
  usage_limit: number;
  plan_name: string;
  status: "expired" | "critical" | "warning" | "on_time";
  payment_status: "paid" | "pending";
  return_date: string;
  return_status: "overdue" | "today" | "soon" | "on_time";
  last_usage_at: string | null;
}

type StatusFilter = "all" | "expired" | "critical" | "warning" | "on_time" | "payment_pending" | "return_due";

export default function Expirations() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<ExpiringCredit[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpiringCredit | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: rows, error } = await supabase.rpc("get_expirations", { p_user_id: user.id });
      if (error) throw error;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const mapped: ExpiringCredit[] = (rows || []).map((row: any) => {
        const expiresAt = new Date(row.plan_expires_at);
        const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const totalPrice = Number(row.total_price) || 0;
        const paidAmount = Number(row.paid_amount) || 0;
        let status: ExpiringCredit["status"] = "on_time";
        if (daysRemaining < 0) status = "expired";
        else if (daysRemaining <= 7) status = "critical";
        else if (daysRemaining <= 30) status = "warning";

        // --- Cálculo do retorno ---
        // intervalDays: how many days between visits.
        // Use Math.floor so 30/4 = 7 (weekly) not 8.
        const validityDays = Number(row.validity_days) || 30;
        const usageLimit = Number(row.usage_limit) || 1;
        const intervalDays = Math.floor(validityDays / Math.max(1, usageLimit));

        // Primary: base off last usage (most accurate — preserves the exact weekday)
        // Fallback: base off starts_at when no usage recorded yet
        // IMPORTANT: last_usage_at is a UTC timestamp. Convert to BRT (UTC-3) before extracting date.
        let baseDate: Date;
        if (row.last_usage_at) {
          const utcMs = new Date(row.last_usage_at).getTime();
          const brtMs = utcMs - 3 * 60 * 60 * 1000; // BRT = UTC-3
          const brt = new Date(brtMs);
          baseDate = new Date(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate());
        } else {
          const startStr = row.plan_starts_at ? row.plan_starts_at + "T12:00:00" : null;
          baseDate = startStr ? new Date(startStr) : new Date();
          baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
        }

        // Next return = baseDate + intervalDays
        // If still in the past (client missed a visit), keep advancing
        const returnDate = new Date(baseDate);
        returnDate.setDate(returnDate.getDate() + intervalDays);
        while (returnDate < today) {
          returnDate.setDate(returnDate.getDate() + intervalDays);
        }

        const diffDays = Math.round((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let returnStatus: ExpiringCredit["return_status"] = "on_time";
        if (diffDays < 0) returnStatus = "overdue";
        else if (diffDays === 0) returnStatus = "today";
        else if (diffDays <= 2) returnStatus = "soon";

        return {
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone || "",
          credit_balance: row.credit_balance,
          expires_at: expiresAt.toISOString(),
          days_remaining: daysRemaining,
          total_price: totalPrice,
          paid_amount: paidAmount,
          usage_count: Number(row.usage_count) || 0,
          usage_limit: Number(row.usage_limit) || 0,
          plan_name: row.plan_name,
          status,
          payment_status: paidAmount < totalPrice ? "pending" : "paid",
          return_date: returnDate.toISOString(),
          return_status: returnStatus,
          last_usage_at: row.last_usage_at || null,
        };
      });

      setCredits(mapped);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      const { error } = await supabase.from("customers").delete().eq("id", deleteTarget.customer_id).eq("user_id", user.id);
      if (error) throw error;
      toast.success(`${deleteTarget.customer_name} removido`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const statusBadge = (item: ExpiringCredit) => {
    if (item.status === "expired") return <Badge variant="destructive">VENCIDO</Badge>;
    if (item.status === "critical") return <Badge variant="outline" className="border-destructive/50 text-destructive">CRÍTICO</Badge>;
    if (item.status === "warning") return <Badge variant="secondary">AVISO</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100">NO PRAZO</Badge>;
  };

  const returnBadge = (item: ExpiringCredit) => {
    if (item.return_status === "overdue") return <Badge variant="destructive" className="text-[10px]">ATRASADO</Badge>;
    if (item.return_status === "today") return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-100 text-[10px]">HOJE</Badge>;
    if (item.return_status === "soon") return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 text-[10px]">EM BREVE</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 text-[10px]">NO PRAZO</Badge>;
  };

  const filtered = credits
    .filter((c) => {
      if (statusFilter === "payment_pending" && c.payment_status !== "pending") return false;
      if (statusFilter === "return_due" && !(c.return_status === "overdue" || c.return_status === "today")) return false;
      if (statusFilter !== "all" && statusFilter !== "payment_pending" && statusFilter !== "return_due" && c.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.customer_name.toLowerCase().includes(q) || c.customer_phone.includes(q);
      }
      return true;
    });

  const pendingCount = credits.filter(c => c.payment_status === "pending").length;
  const returnDueCount = credits.filter(c => c.return_status === "overdue" || c.return_status === "today").length;

  const filterOptions: { label: string; value: StatusFilter }[] = [
    { label: "Todos", value: "all" },
    { label: "No Prazo", value: "on_time" },
    { label: "Aviso (≤30d)", value: "warning" },
    { label: "Críticos (≤7d)", value: "critical" },
    { label: `Retorno hoje/atrasado (${returnDueCount})`, value: "return_due" },
    { label: `Pgto Pendente (${pendingCount})`, value: "payment_pending" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vencimentos</h1>
          <p className="text-muted-foreground text-sm">Gerencie prazos e fale com seus clientes.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros Avançados
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={statusFilter === opt.value ? "default" : "outline"}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell text-center">Plano</TableHead>
                <TableHead className="hidden md:table-cell text-center">Pagamento</TableHead>
                <TableHead className="hidden md:table-cell text-center">Retorno</TableHead>
                <TableHead className="hidden sm:table-cell text-center">Vencimento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item, idx) => {
                const totalPrice = item.total_price;
                const paidAmt = item.paid_amount;
                const pendingAmt = totalPrice - paidAmt;
                const usagePercent = item.usage_limit > 0 ? (item.usage_count / item.usage_limit) * 100 : 0;
                const paidPercent = totalPrice > 0 ? (paidAmt / totalPrice) * 100 : 0;
                const greenBar = Math.min(usagePercent, paidPercent);
                const yellowBar = Math.max(0, paidPercent - greenBar);
                const redBar = Math.max(0, 100 - greenBar - yellowBar);

                return (
                  <TableRow key={`${item.customer_id}-${idx}`}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-foreground">{item.customer_name}</span>
                        {item.customer_phone && (
                          <span className="block text-xs text-muted-foreground">{item.customer_phone}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center text-foreground text-sm">{item.plan_name}</TableCell>
                    <TableCell className="hidden md:table-cell min-w-[180px]">
                      <div className="space-y-1">
                        <TricolorProgressBar usagePercent={greenBar} paidPercent={yellowBar} pendingPercent={redBar} />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Pago: R$ {paidAmt.toFixed(2)}</span>
                          {pendingAmt > 0 && (
                            <span className="text-destructive font-medium">Pend: R$ {pendingAmt.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-muted-foreground text-sm">
                          {new Date(item.return_date).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        </span>
                        {returnBadge(item)}
                        <span className="text-[10px] text-muted-foreground/60">
                          a cada {Math.round((Number(item.usage_limit) > 0 ? 30 / Number(item.usage_limit) : 30))} dias
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-center text-muted-foreground">
                      {new Date(item.expires_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <WhatsAppQuickMessages
                          customerName={item.customer_name}
                          customerPhone={item.customer_phone}
                          creditBalance={item.credit_balance}
                          daysRemaining={item.days_remaining}
                          expiresAt={item.expires_at}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(item)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum resultado encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.customer_name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
