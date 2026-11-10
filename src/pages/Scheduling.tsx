import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppointmentPaymentDialog } from "@/components/AppointmentPaymentDialog";
import AppointmentServicesDialog from "@/components/AppointmentServicesDialog";
import AgendaBoard, { type AgendaAppointment } from "@/components/AgendaBoard";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Plus, Share2, Copy, Check } from "lucide-react";

/** Parse a date string like "2025-03-28" as local (not UTC) */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateForInput(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return [d, m, y].filter(Boolean).join("/");
}

function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function dateInputToIso(value: string): string | null {
  const [d, m, y] = value.split("/");
  if (d?.length !== 2 || m?.length !== 2 || y?.length !== 4) return null;
  return `${y}-${m}-${d}`;
}

function maskTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

interface Professional { id: string; name: string; }
interface Customer { id: string; name: string; }
interface Service { id: string; name: string; price: number; duration_minutes: number; }
interface Schedule { day_of_week: number; start_time: string; end_time: string; active: boolean; }
interface Appointment {
  id: string;
  professional_id: string;
  customer_id: string;
  customer_name?: string;
  service_id: string;
  service_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string;
}

function generateTimeSlots(start: string, end: string, interval = 30): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let current = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  while (current < endMin) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += interval;
  }
  return slots;
}

type ViewMode = "weekly" | "daily";

export default function Scheduling() {
  const { user } = useAuth();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceAppointment, setServiceAppointment] = useState<AgendaAppointment | null>(null);
  const [paymentAppointment, setPaymentAppointment] = useState<AgendaAppointment | null>(null);
  const [schedules, setSchedules] = useState<Record<string, Schedule[]>>({});
  const [lastServices,setLastServices]=useState<AgendaAppointment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [linkCopied, setLinkCopied] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const filteredCustomers = useMemo(() =>
    customerSearch.trim()
      ? customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
      : customers,
    [customers, customerSearch]
  );
  const [bookingDaysStart, setBookingDaysStart] = useState(() => new Date());
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const lastBookingDay = format(addDays(new Date(), 730), "yyyy-MM-dd");
  const [form, setForm] = useState({
    professional_id: "",
    customer_id: "",
    service_ids: [] as string[],
    date: format(new Date(), "yyyy-MM-dd"),
    date_input: formatDateForInput(format(new Date(), "yyyy-MM-dd")),
    start_time: "",
    notes: "",
    reminder_enabled: false,
    reminder_hours: "24",
  });

  const { professional_id: bookingProfessional, date: bookingDate, service_ids: bookingServices } = form;
  const slotsKey = JSON.stringify([bookingProfessional, bookingDate, bookingServices]);
  const [slotResult, setSlotResult] = useState<{ key: string; times: string[]; error: boolean } | null>(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const currentSlots = slotResult?.key === slotsKey ? slotResult : null;
  const selectedServices = bookingServices.map(id => services.find(service => service.id === id)).filter((service): service is Service => !!service);
  const duration = selectedServices.reduce((sum, service) => sum + Math.max(5, service.duration_minutes ?? 30), 0);
  const serviceTotal = selectedServices.reduce((sum, service) => sum + Number(service.price), 0);
  const canBook = dateInputToIso(form.date_input) === bookingDate &&
    currentSlots?.times.includes(form.start_time) && selectedServices.length === bookingServices.length;

  useEffect(() => {
    setSlotResult(null);
    if (!dialogOpen || !bookingProfessional || !bookingDate || !bookingServices.length) return;
    let active = true;
    void supabase.rpc("public_booking_slots", {
      p_professional: bookingProfessional, p_date: bookingDate, p_services: bookingServices,
    }).then(({ data, error }) => {
      if (!active) return;
      const times = Array.isArray(data) ? data.flatMap(slot =>
        slot && typeof slot === "object" && !Array.isArray(slot) && slot.available === true &&
        typeof slot.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) ? [slot.time] : []
      ) : [];
      setSlotResult({ key: slotsKey, times: [...new Set(times)], error: !!error });
    });
    return () => { active = false; };
  }, [dialogOpen, bookingProfessional, bookingDate, bookingServices, slotsKey, appointments]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dayName = useMemo(() => {
    if (!form.date) return null;
    try {
      return format(parseLocalDate(form.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch { return null; }
  }, [form.date]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const fromDate = viewMode === "daily"
        ? format(selectedDate, "yyyy-MM-dd")
        : format(weekStart, "yyyy-MM-dd");
      const toDate = viewMode === "daily"
        ? format(selectedDate, "yyyy-MM-dd")
        : format(addDays(weekStart, 6), "yyyy-MM-dd");

      const [profsRes, custsRes, servsRes, apptsRes] = await Promise.all([
        supabase.from("professionals").select("id, name").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.from("customers").select("id, name").eq("user_id", user.id).order("name"),
        supabase.from("services").select("id, name, price, duration_minutes").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.rpc("get_appointments_with_details", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
      ]);

      const profs = (profsRes.data || []) as Professional[];
      setProfessionals(profs);
      setCustomers((custsRes.data || []) as Customer[]);
      setServices((servsRes.data || []) as Service[]);
      setAppointments((apptsRes.data || []) as Appointment[]);
      const latest = await Promise.all(profs.map(async (prof) => {
        const { data, error } = await supabase.from("appointments")
          .select("id,professional_id,date,start_time,end_time,status,service_names,customer:customers(name),service:services(name)")
          .eq("user_id", user.id)
          .eq("professional_id", prof.id)
          .eq("status", "concluido")
          .order("date", { ascending: false })
          .order("start_time", { ascending: false })
          .limit(1)
          .overrideTypes<Array<AgendaAppointment & {
            service_names: string | null;
            customer: { name: string } | null;
            service: { name: string } | null;
          }>, { merge: false }>();
        if (error) return [];
        return (data || []).map((row) => ({
          ...row,
          customer_name: row.customer?.name,
          service_name: row.service_names || row.service?.name,
        }));
      }));
      setLastServices(latest.flat());

      if (profs.length > 0) {
        const profIds = profs.map((p) => p.id);
        const { data: schRows } = await supabase
          .from("professional_schedules")
          .select("professional_id, day_of_week, start_time, end_time, active")
          .in("professional_id", profIds);
        const schMap: Record<string, Schedule[]> = {};
        for (const r of (schRows || []) as any[]) {
          if (!schMap[r.professional_id]) schMap[r.professional_id] = [];
          schMap[r.professional_id].push(r);
        }
        setSchedules(schMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user, weekStart, selectedDate, viewMode]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateAppointment = async () => {
    if (!user || !canBook || savingAppointment) return;
    const [hours, minutes] = form.start_time.split(":").map(Number);
    const end = hours * 60 + minutes + duration;
    if (end >= 1440) { toast.error("Os serviços ultrapassam o final do dia."); return; }
    const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    setSavingAppointment(true);
    try {
      const { error } = await supabase.from("appointments").insert({
        user_id: user.id,
        professional_id: form.professional_id,
        customer_id: form.customer_id || null,
        service_id: bookingServices[0],
        service_ids: bookingServices,
        date: form.date,
        start_time: form.start_time,
        end_time: endTime,
        notes: form.notes,
      });
      if (error) throw error;
      // Set reminder if enabled
      if (form.reminder_enabled && form.customer_id && form.reminder_hours) {
        await supabase.from("customers").update({ reminder_hours: parseFloat(form.reminder_hours) }).eq("id", form.customer_id);
      }
      toast.success("Agendamento criado");
      setDialogOpen(false);
      loadData();

      // Notify professional via WhatsApp and push (fire and forget with error logging)
      const customer = customers.find(c => c.id === form.customer_id);
      const prof = professionals.find(p => p.id === form.professional_id);
      supabase.functions.invoke("notify-professional", {
        body: {
          professional_id: form.professional_id,
          user_id: user.id,
          customer_name: customer?.name || "Não informado",
          service_name: selectedServices.map(service => service.name).join(" + "),
          date: form.date,
          start_time: form.start_time,
        },
      }).then(({ error: notifyErr }) => {
        if (notifyErr) console.error("[Scheduling] Erro ao notificar profissional:", notifyErr);
        else console.log("[Scheduling] Profissional notificado:", prof?.name);
      }).catch((err) => {
        console.error("[Scheduling] Falha ao chamar notify-professional:", err);
      });
    } catch (e: unknown) {
      toast.error((typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e)));
    } finally {
      setSavingAppointment(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!user) return;
    const request = supabase.from("appointments").update({ status }).eq("id", id).eq("user_id", user.id);
    if (status === "no_show") request.in("status", ["agendado", "confirmado"]);
    const { data, error } = await request.select("id").maybeSingle();
    if (error || !data) {
      toast.error("Não foi possível alterar o status. Confira a situação atual do agendamento.");
      await loadData();
      return;
    }
    toast.success("Status atualizado");
    await loadData();
  };

  const openNewAppointment = (profId?: string, day?: Date, time?: string) => {
    const date = day ? format(day, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const firstDay = date < todayKey || date > lastBookingDay ? todayKey : date;
    setBookingDaysStart(parseLocalDate(firstDay));
    setForm({
      professional_id: profId || "",
      customer_id: "",
      service_ids: [] as string[],
      date,
      date_input: formatDateForInput(date),
      start_time: time ?? "",
      notes: "",
      reminder_enabled: false,
      reminder_hours: "24",
    });
    setDialogOpen(true);
  };

  const copyBookingLink = () => {
    if (!user) return;
    const link = `${window.location.origin}/booking/${user.id}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-foreground">Agenda da equipe</h1><p className="text-sm text-muted-foreground mt-1">Horários, clientes e serviços organizados por profissional.</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="weekly">Semanal</TabsTrigger>
              <TabsTrigger value="daily">Diário</TabsTrigger>
            </TabsList>
          </Tabs>

          {viewMode === "weekly" ? (
            <>
              <Button variant="outline" size="icon" onClick={() => setWeekStart((d) => addDays(d, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-foreground min-w-[200px] text-center">
                {format(weekStart, "dd/MM", { locale: ptBR })} — {format(addDays(weekStart, 6), "dd/MM/yyyy", { locale: ptBR })}
              </span>
              <Button variant="outline" size="icon" onClick={() => {
                setWeekStart((d) => {
                  const next = addDays(d, 7);
                  const limit = addDays(new Date(), 28);
                  return next <= limit ? next : d;
                });
              }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} variant="outline" size="sm">
                Hoje
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => addDays(d, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-foreground min-w-[200px] text-center capitalize">
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
              <Button variant="outline" size="icon" onClick={() => {
                const maxDate = addDays(new Date(), 28);
                setSelectedDate((d) => {
                  const next = addDays(d, 1);
                  return next <= maxDate ? next : d;
                });
              }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => setSelectedDate(new Date())} variant="outline" size="sm">
                Hoje
              </Button>
            </>
          )}

          <Button variant="outline" size="sm" onClick={copyBookingLink} className="gap-1">
            {linkCopied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{linkCopied ? "Copiado!" : "Link Online"}</span>
          </Button>
          <Button size="sm" onClick={() => openNewAppointment()} className="gap-1">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Agendar</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <Button variant={professionalFilter === "all" ? "default" : "outline"} onClick={()=>{ setProfessionalFilter("all"); setViewMode("daily"); }}>Ver agenda geral da barbearia</Button>
        <Label htmlFor="agenda-professional">Profissional</Label>
        <select id="agenda-professional" value={professionalFilter} onChange={e=>setProfessionalFilter(e.target.value)} className="rounded-lg border bg-background text-foreground px-3 py-2 text-sm">
          <option value="all">Toda a equipe</option>{professionals.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{professionalFilter === "all" ? "Agenda geral da equipe" : `Agenda de ${professionals.find(p=>p.id === professionalFilter)?.name || "profissional"}`}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : professionals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-muted-foreground">Cadastre profissionais primeiro para usar o agendamento</p>
          </CardContent>
        </Card>
      ) : (
        <AgendaBoard professionals={professionals.filter(p => professionalFilter === "all" || p.id === professionalFilter)}
          days={viewMode === "weekly" ? weekDays : [selectedDate]} schedules={schedules} lastServices={lastServices}
          appointments={appointments.filter(a => professionalFilter === "all" || a.professional_id === professionalFilter)}
          openNewAppointment={openNewAppointment} updateStatus={updateStatus} onAddServices={setServiceAppointment} onCheckout={setPaymentAppointment}
          onViewProfessional={id=>{ setProfessionalFilter(id); setWeekStart(startOfWeek(selectedDate, { weekStartsOn: 1 })); setViewMode("weekly"); }}
          onDayClick={day => { setSelectedDate(day); setViewMode("daily"); }} />
      )}

      {paymentAppointment && (
        <AppointmentPaymentDialog key={paymentAppointment.id} appointmentId={paymentAppointment.id}
          customerName={paymentAppointment.customer_name} onSaved={() => void loadData()} onClose={() => setPaymentAppointment(null)} />
      )}
      {serviceAppointment && (
        <AppointmentServicesDialog key={serviceAppointment.id} appointmentId={serviceAppointment.id}
          customerName={serviceAppointment.customer_name} services={services} onSaved={() => void loadData()} onClose={() => setServiceAppointment(null)} />
      )}

      {/* Create Appointment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!savingAppointment) setDialogOpen(open); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-2">
            <div>
              <Label>Profissional *</Label>
              <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v, start_time: "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Input
                placeholder="🔍 Buscar cliente..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="mb-1.5 h-8 text-sm"
              />
              <Select value={form.customer_id} onValueChange={(v) => { setForm({ ...form, customer_id: v }); setCustomerSearch(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {filteredCustomers.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2 px-2 text-center">Nenhum cliente encontrado</div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Serviços *</legend>
              <Popover modal>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between gap-2"
                    aria-label="Selecionar serviços">
                    <span className="truncate">{selectedServices.map(service => service.name).join(" + ") || "Selecione os serviços"}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" aria-label="Serviços disponíveis"
                  className="max-h-[min(16rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] space-y-2 overflow-y-auto overscroll-contain p-2">
                {services.map(service => (
                  <label key={service.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <input type="checkbox" checked={bookingServices.includes(service.id)}
                      disabled={bookingServices.length >= 10 && !bookingServices.includes(service.id)}
                      onChange={event => {
                        const checked = event.currentTarget.checked;
                        setForm(current => ({
                          ...current,
                          service_ids: checked ? [...current.service_ids, service.id] : current.service_ids.filter(id => id !== service.id),
                          start_time: "",
                        }));
                      }} />
                    <span>{service.name} · {Math.max(5, service.duration_minutes ?? 30)} min · {Number(service.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </label>
                ))}
                {!services.length && <p className="text-sm text-muted-foreground">Nenhum serviço ativo cadastrado.</p>}
                </PopoverContent>
              </Popover>
              {bookingServices.length > 0 && (
                <p className="text-sm font-medium">Total · {duration} min · {serviceTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
              )}
            </fieldset>
            <div>
              <Label>Data *</Label>
              <Input
                placeholder="dd/mm/aaaa"
                value={form.date_input}
                onChange={(e) => {
                  const masked = maskDateInput(e.target.value);
                  const iso = dateInputToIso(masked);
                  setForm({
                    ...form,
                    date_input: masked,
                    date: iso || form.date,
                    start_time: "",
                  });
                }}
                onBlur={() => {
                  const iso = dateInputToIso(form.date_input);
                  if (!iso || iso < todayKey || iso > lastBookingDay) return;
                  const day = parseLocalDate(iso);
                  if (!Number.isNaN(day.getTime()) && format(day, "yyyy-MM-dd") === iso &&
                    (iso < format(bookingDaysStart, "yyyy-MM-dd") || iso > format(addDays(bookingDaysStart, 6), "yyyy-MM-dd"))) {
                    setBookingDaysStart(day);
                  }
                }}
              />
              {dayName && (
                <p className="text-sm font-medium text-primary mt-1.5 capitalize">{dayName}</p>
              )}
            </div>
            {form.professional_id && schedules[form.professional_id] && (
              <div>
                <Label className="mb-1.5 block">Escolha o dia</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0"
                    aria-label="Dias anteriores" disabled={format(bookingDaysStart, "yyyy-MM-dd") <= todayKey}
                    onClick={() => setBookingDaysStart(start => {
                      const previous = addDays(start, -7);
                      return format(previous, "yyyy-MM-dd") < todayKey ? parseLocalDate(todayKey) : previous;
                    })}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1">
                    {Array.from({ length: 7 }, (_, offset) => addDays(bookingDaysStart, offset)).map(day => {
                      const iso = format(day, "yyyy-MM-dd");
                      const works = schedules[form.professional_id].some(schedule =>
                        schedule.active && schedule.day_of_week === day.getDay()
                      );
                      const selected = form.date === iso;
                      return (
                        <Button key={iso} type="button" size="sm" variant={selected ? "default" : "outline"}
                          className="h-10 min-w-9 flex-1 flex-col gap-0 px-1 text-[10px] capitalize"
                          aria-pressed={selected} disabled={!works || iso > lastBookingDay}
                          aria-label={format(day, "EEEE, dd/MM/yyyy", { locale: ptBR })}
                          onClick={() => setForm(current => ({
                            ...current, date: iso, date_input: formatDateForInput(iso), start_time: "",
                          }))}>
                          <span>{format(day, "EEE", { locale: ptBR })}</span>
                          <span>{format(day, "dd/MM")}</span>
                        </Button>
                      );
                    })}
                  </div>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0"
                    aria-label="Próximos dias"
                    disabled={format(addDays(bookingDaysStart, 7), "yyyy-MM-dd") > lastBookingDay}
                    onClick={() => setBookingDaysStart(start => addDays(start, 7))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {/* Horários disponíveis */}
            {form.professional_id && form.date && (
              <div>
                <Label className="mb-2 block">
                  Horários disponíveis — {professionals.find(p => p.id === form.professional_id)?.name}
                </Label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-[180px] overflow-y-auto p-1">
                  {!bookingServices.length ? (
                    <p className="col-span-full py-4 text-xs text-muted-foreground">Selecione os serviços para consultar os horários.</p>
                  ) : !currentSlots ? (
                    <p className="col-span-full py-4 text-xs text-muted-foreground" role="status">Consultando horários…</p>
                  ) : currentSlots.error || !currentSlots.times.length ? (
                    <p className="col-span-full py-4 text-xs text-muted-foreground">
                      {currentSlots.error ? "Não foi possível consultar os horários." : "Sem horários disponíveis para esses serviços."}
                    </p>
                  ) : currentSlots.times.map(time => (
                    <button key={time} type="button" aria-pressed={form.start_time === time}
                      onClick={() => setForm(current => ({ ...current, start_time: time }))}
                      className={`rounded-lg border px-2 py-1.5 text-xs ${form.start_time === time
                        ? "border-primary bg-primary font-medium text-primary-foreground"
                        : "border-border/30 bg-card hover:border-primary/40 hover:bg-primary/5"}`}>
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações (opcional)" />
            </div>
            {/* Reminder */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
              <input
                type="checkbox"
                id="reminder_cb"
                checked={form.reminder_enabled}
                onChange={(e) => setForm({ ...form, reminder_enabled: e.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
              <div className="flex-1">
                <Label htmlFor="reminder_cb" className="text-sm cursor-pointer">🔔 Enviar lembrete</Label>
              </div>
              {form.reminder_enabled && (
                <Select value={form.reminder_hours} onValueChange={(v) => setForm({ ...form, reminder_hours: v })}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.166">10 min antes</SelectItem>
                    <SelectItem value="0.5">30 min antes</SelectItem>
                    <SelectItem value="1">1 hora antes</SelectItem>
                    <SelectItem value="3">3 horas antes</SelectItem>
                    <SelectItem value="24">1 dia antes</SelectItem>
                    <SelectItem value="48">2 dias antes</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <Button onClick={handleCreateAppointment} disabled={!canBook || savingAppointment} className="w-full shrink-0">
            {savingAppointment ? "Agendando…" : "Agendar"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
