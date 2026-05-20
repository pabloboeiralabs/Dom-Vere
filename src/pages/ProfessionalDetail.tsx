import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, UserCheck, CalendarDays, Scissors, CreditCard, Package, Search, DollarSign, ClipboardList } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface Professional {
  id: string;
  name: string;
  phone: string;
  commission_percent: number;
  active: boolean;
  photo_url: string | null;
}

interface HistoryRecord {
  record_type: string;
  record_date: string;
  customer_name: string;
  service_name: string;
  amount: number;
  notes: string;
}

const TYPE_LABELS: Record<string, { label: string; icon: typeof Scissors; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  appointment: { label: "Agendamento", icon: CalendarDays, variant: "default" },
  cut: { label: "Corte", icon: Scissors, variant: "secondary" },
  plan_usage: { label: "Uso de Plano", icon: Package, variant: "outline" },
  transaction: { label: "Transação", icon: CreditCard, variant: "destructive" },
};

export default function ProfessionalDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadData = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const [profRes, histRes] = await Promise.all([
        supabase.from("professionals").select("id, name, phone, commission_percent, active, photo_url").eq("id", id).eq("user_id", user.id).maybeSingle(),
        supabase.rpc("get_professional_history", { p_user_id: user.id, p_professional_id: id } as any),
      ]);
      setProfessional(profRes.data as Professional | null);
      setHistory((histRes.data || []) as HistoryRecord[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return history.filter((h) => {
      if (typeFilter !== "all" && h.record_type !== typeFilter) return false;
      if (q && !h.customer_name?.toLowerCase().includes(q) && !h.service_name?.toLowerCase().includes(q) && !h.notes?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [history, search, typeFilter]);

  const stats = useMemo(() => {
    const totalAppointments = history.filter(h => h.record_type === "appointment").length;
    const totalCuts = history.filter(h => h.record_type === "cut").length;
    const totalPlanUsage = history.filter(h => h.record_type === "plan_usage").length;
    const totalTransactions = history.filter(h => h.record_type === "transaction").length;
    const totalRevenue = history.filter(h => h.record_type === "transaction" || h.record_type === "plan_usage").reduce((s, h) => s + Number(h.amount || 0), 0);
    const totalServices = totalAppointments + totalCuts + totalPlanUsage + totalTransactions;
    const commission = professional ? (totalRevenue * (professional.commission_percent / 100)) : 0;
    return { totalAppointments, totalCuts, totalPlanUsage, totalRevenue, totalServices, commission };
  }, [history, professional]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!professional) return <div className="text-center text-muted-foreground py-8">Profissional não encontrado</div>;

  const statCards = [
    { title: "Atendimentos", value: stats.totalServices, icon: ClipboardList },
    { title: "Agendamentos", value: stats.totalAppointments, icon: CalendarDays },
    { title: "Faturamento", value: `R$ ${stats.totalRevenue.toFixed(2)}`, icon: DollarSign },
    { title: `Comissão (${professional.commission_percent}%)`, value: `R$ ${stats.commission.toFixed(2)}`, icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/professionals")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>

      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {professional.photo_url ? (
            <AvatarImage src={professional.photo_url} alt={professional.name} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-xl">
            {professional.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{professional.name}</h1>
          <p className="text-muted-foreground text-sm">
            {professional.phone || "Sem telefone"} · Comissão: {professional.commission_percent}%
            <Badge variant={professional.active ? "default" : "secondary"} className="ml-2">{professional.active ? "Ativo" : "Inativo"}</Badge>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <Card key={c.title} className="border-border/50">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <c.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{c.title}</span>
              </div>
              <div className="text-lg font-bold text-foreground">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">Histórico Detalhado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, serviço ou observação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="appointment">Agendamentos</SelectItem>
                <SelectItem value="cut">Cortes</SelectItem>
                <SelectItem value="plan_usage">Uso de Plano</SelectItem>
                <SelectItem value="transaction">Transações</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Nenhum registro encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden sm:table-cell">Serviço</TableHead>
                    <TableHead className="hidden sm:table-cell">Valor</TableHead>
                    <TableHead className="hidden md:table-cell">Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((h, i) => {
                    const meta = TYPE_LABELS[h.record_type] || TYPE_LABELS.cut;
                    const Icon = meta.icon;
                    const dt = h.record_date ? new Date(h.record_date) : null;
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant={meta.variant} className="gap-1 text-xs">
                            <Icon className="h-3 w-3" /> {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-foreground whitespace-nowrap">
                          {dt ? (
                            <>
                              {dt.toLocaleDateString("pt-BR")}
                              <span className="text-muted-foreground ml-1">{dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            </>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{h.customer_name || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{h.service_name || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-foreground">
                          {Number(h.amount) > 0 ? `R$ ${Number(h.amount).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">{h.notes || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-right">{filtered.length} registro(s)</p>
        </CardContent>
      </Card>
    </div>
  );
}