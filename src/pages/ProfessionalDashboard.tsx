import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Scissors, CreditCard, Package, Search, DollarSign, ClipboardList, Clock, LogOut, CheckCircle2, XCircle } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScheduleEditor } from "@/components/ScheduleEditor";
import { format, startOfWeek, endOfWeek, addDays, isToday, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface HistoryRecord {
  record_type: string;
  record_date: string;
  customer_name: string;
  service_name: string;
  amount: number;
  notes: string;
}

interface Appointment {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  customer_name: string;
  service_name: string;
  notes: string;
}

const TYPE_LABELS: Record<string, { label: string; icon: typeof Scissors; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  appointment: { label: "Agendamento", icon: CalendarDays, variant: "default" },
  cut: { label: "Corte", icon: Scissors, variant: "secondary" },
  plan_usage: { label: "Uso de Plano", icon: Package, variant: "outline" },
  transaction: { label: "Transação", icon: CreditCard, variant: "destructive" },
};

const STATUS_COLORS: Record<string, string> = {
  agendado: "bg-blue-500/20 text-blue-400",
  confirmado: "bg-emerald-500/20 text-emerald-400",
  concluido: "bg-green-500/20 text-green-400",
  cancelado: "bg-red-500/20 text-red-400",
};

export default function ProfessionalDashboard() {
  const { user, logout } = useAuth();
  const [professional, setProfessional] = useState<any>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [weekOffset, setWeekOffset] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const ownerId = user?.owner_id;
  const professionalId = user?.professional_id;

  const loadData = useCallback(async () => {
    if (!ownerId || !professionalId) return;
    setLoading(true);
    try {
      const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });

      const [profRes, histRes, apptRes] = await Promise.all([
        supabase.from("professionals").select("id, name, phone, commission_percent, active, photo_url").eq("id", professionalId).maybeSingle(),
        supabase.rpc("get_professional_history", { p_user_id: ownerId, p_professional_id: professionalId } as any),
        supabase.rpc("get_appointments_with_details", {
          p_user_id: ownerId,
          p_from: format(weekStart, "yyyy-MM-dd"),
          p_to: format(weekEnd, "yyyy-MM-dd"),
        } as any),
      ]);
      setProfessional(profRes.data);
      setHistory((histRes.data || []) as HistoryRecord[]);
      const allAppts = (apptRes.data || []) as Appointment[];
      setAppointments(allAppts.filter((a: any) => a.professional_id === professionalId));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [ownerId, professionalId, weekOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateAppointmentStatus = useCallback(async (appointmentId: string, newStatus: string) => {
    setUpdatingId(appointmentId);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", appointmentId);
      if (error) throw error;
      toast.success(newStatus === "concluido" ? "Agendamento concluído!" : "Status atualizado!");
      setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: newStatus } : a));
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  }, []);

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

  const todayAppointments = useMemo(() => {
    const today = new Date();
    return appointments.filter(a => isSameDay(new Date(a.date + "T00:00:00"), today)).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [appointments]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekOffset]);

  if (loading && !initialLoaded) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const statCards = [
    { title: "Atendimentos", value: stats.totalServices, icon: ClipboardList },
    { title: "Agendamentos", value: stats.totalAppointments, icon: CalendarDays },
    { title: "Faturamento", value: `R$ ${stats.totalRevenue.toFixed(2)}`, icon: DollarSign },
    { title: `Comissão (${professional?.commission_percent || 0}%)`, value: `R$ ${stats.commission.toFixed(2)}`, icon: CreditCard },
  ];

  const renderStatusActions = (a: Appointment) => {
    const isUpdating = updatingId === a.id;
    if (a.status === "concluido" || a.status === "cancelado") {
      return <Badge className={STATUS_COLORS[a.status] || "bg-muted text-muted-foreground"}>{a.status}</Badge>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
          disabled={isUpdating}
          onClick={(e) => { e.stopPropagation(); updateAppointmentStatus(a.id, "concluido"); }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Concluir</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
          disabled={isUpdating}
          onClick={(e) => { e.stopPropagation(); updateAppointmentStatus(a.id, "cancelado"); }}
        >
          <XCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Cancelar</span>
        </Button>
        <Badge className={`text-xs ${STATUS_COLORS[a.status] || "bg-muted text-muted-foreground"}`}>
          {a.status}
        </Badge>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {professional?.photo_url ? (
                <AvatarImage src={professional.photo_url} alt={professional.name} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                {professional?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-bold text-foreground">{professional?.name}</h1>
              <p className="text-xs text-muted-foreground">Painel do Profissional</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">
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

        <Tabs defaultValue="hoje" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="hoje" className="flex-1">Hoje ({todayAppointments.length})</TabsTrigger>
            <TabsTrigger value="semana" className="flex-1">Semana</TabsTrigger>
            <TabsTrigger value="agenda" className="flex-1">Agenda</TabsTrigger>
            <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="agenda" className="mt-4">
            {professionalId ? (
              <ScheduleEditor professionalId={professionalId} />
            ) : (
              <p className="text-center text-muted-foreground py-6">Carregando...</p>
            )}
          </TabsContent>

          {/* Today */}
          <TabsContent value="hoje" className="space-y-3 mt-4">
            {todayAppointments.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhum agendamento para hoje
                </CardContent>
              </Card>
            ) : (
              todayAppointments.map((a) => (
                <Card key={a.id} className="border-border/50">
                  <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-lg font-bold text-foreground">{a.start_time?.slice(0, 5)}</div>
                        <div className="text-xs text-muted-foreground">{a.end_time?.slice(0, 5)}</div>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{a.customer_name || "Cliente"}</p>
                        <p className="text-sm text-muted-foreground">{a.service_name || "Serviço"}</p>
                      </div>
                    </div>
                    {renderStatusActions(a)}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Week */}
          <TabsContent value="semana" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>← Anterior</Button>
              <span className="text-sm text-muted-foreground">
                {format(weekDays[0], "dd/MM", { locale: ptBR })} — {format(weekDays[6], "dd/MM", { locale: ptBR })}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 3}>Próxima →</Button>
            </div>
            {weekDays.map((day) => {
              const dayAppts = appointments.filter(a => isSameDay(new Date(a.date + "T00:00:00"), day)).sort((a, b) => a.start_time.localeCompare(b.start_time));
              return (
                <Card key={day.toISOString()} className={`border-border/50 ${isToday(day) ? "ring-1 ring-primary" : ""}`}>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span className={isToday(day) ? "text-primary font-bold" : "text-foreground"}>
                        {format(day, "EEEE, dd/MM", { locale: ptBR })}
                      </span>
                      {isToday(day) && <Badge variant="outline" className="text-xs">Hoje</Badge>}
                      <span className="text-muted-foreground ml-auto">{dayAppts.length} agendamento(s)</span>
                    </CardTitle>
                  </CardHeader>
                  {dayAppts.length > 0 && (
                    <CardContent className="py-2 px-4 space-y-2">
                      {dayAppts.map((a) => (
                        <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 gap-2 flex-wrap">
                          <div className="flex items-center gap-3">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{a.start_time?.slice(0, 5)}</span>
                            <span className="text-sm text-foreground">{a.customer_name || "Cliente"}</span>
                            <span className="text-xs text-muted-foreground">{a.service_name}</span>
                          </div>
                          {renderStatusActions(a)}
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </TabsContent>

          {/* History */}
          <TabsContent value="historico" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="appointment">Agendamentos</SelectItem>
                  <SelectItem value="cut">Cortes</SelectItem>
                  <SelectItem value="plan_usage">Uso de Plano</SelectItem>
                  <SelectItem value="transaction">Transações</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Nenhum registro</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden sm:table-cell">Serviço</TableHead>
                      <TableHead className="hidden sm:table-cell">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 100).map((h, i) => {
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
                          <TableCell className="text-sm whitespace-nowrap">
                            {dt ? `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{h.customer_name || "—"}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{h.service_name || "—"}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            {Number(h.amount) > 0 ? `R$ ${Number(h.amount).toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-right">{filtered.length} registro(s)</p>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
