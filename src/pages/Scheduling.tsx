import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Share2, Copy, Check } from "lucide-react";

/** Parse a date string like "2025-03-28" as local (not UTC) */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface Professional { id: string; name: string; }
interface Customer { id: string; name: string; }
interface Service { id: string; name: string; price: number; }
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

const STATUS_COLORS: Record<string, string> = {
  agendado: "bg-blue-500/20 text-blue-700 border-blue-500/30",
  concluido: "bg-green-500/20 text-green-700 border-green-500/30",
  cancelado: "bg-red-500/20 text-red-700 border-red-500/30",
  no_show: "bg-yellow-500/20 text-yellow-700 border-yellow-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  no_show: "Não compareceu",
};

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
  const [schedules, setSchedules] = useState<Record<string, Schedule[]>>({});
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [linkCopied, setLinkCopied] = useState(false);
  const [form, setForm] = useState({
    professional_id: "",
    customer_id: "",
    service_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "09:30",
    notes: "",
  });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

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
        supabase.from("services").select("id, name, price").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.rpc("get_appointments_with_details", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
      ]);

      const profs = (profsRes.data || []) as Professional[];
      setProfessionals(profs);
      setCustomers((custsRes.data || []) as Customer[]);
      setServices((servsRes.data || []) as Service[]);
      setAppointments((apptsRes.data || []) as Appointment[]);

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
    if (!user || !form.professional_id || !form.date || !form.start_time) return;
    try {
      const { error } = await supabase.from("appointments").insert({
        user_id: user.id,
        professional_id: form.professional_id,
        customer_id: form.customer_id || null,
        service_id: form.service_id || null,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        notes: form.notes,
      });
      if (error) throw error;
      toast.success("Agendamento criado");
      setDialogOpen(false);
      loadData();

      // Notify professional via WhatsApp (fire and forget)
      const customer = customers.find(c => c.id === form.customer_id);
      const service = services.find(s => s.id === form.service_id);
      supabase.functions.invoke("notify-professional", {
        body: {
          professional_id: form.professional_id,
          user_id: user.id,
          customer_name: customer?.name || "Não informado",
          service_name: service?.name || "Não informado",
          date: form.date,
          start_time: form.start_time,
        },
      }).catch(() => {/* silent */});
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!user) return;
    await supabase.from("appointments").update({ status }).eq("id", id).eq("user_id", user.id);
    loadData();
  };

  const getAppointmentsForCell = (profId: string, day: Date) =>
    appointments.filter((a) => a.professional_id === profId && isSameDay(parseLocalDate(a.date), day));

  const openNewAppointment = (profId?: string, day?: Date, time?: string) => {
    const endTime = time
      ? `${String(Math.floor((parseInt(time.split(":")[0]) * 60 + parseInt(time.split(":")[1]) + 30) / 60)).padStart(2, "0")}:${String((parseInt(time.split(":")[0]) * 60 + parseInt(time.split(":")[1]) + 30) % 60).padStart(2, "0")}`
      : "09:30";
    setForm({
      professional_id: profId || "",
      customer_id: "",
      service_id: "",
      date: day ? format(day, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      start_time: time || "09:00",
      end_time: endTime,
      notes: "",
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

  // Daily view helpers
  const getDaySchedulesForProf = (profId: string, day: Date) =>
    schedules[profId]?.filter((s) => s.day_of_week === day.getDay() && s.active) || [];

  const getDayScheduleForProf = (profId: string, day: Date) => {
    const daySchedules = getDaySchedulesForProf(profId, day);
    if (daySchedules.length === 0) return undefined;

    return {
      ...daySchedules[0],
      start_time: daySchedules.reduce((min, s) => (s.start_time < min ? s.start_time : min), "23:59:00"),
      end_time: daySchedules.reduce((max, s) => (s.end_time > max ? s.end_time : max), "00:00:00"),
      active: true,
    };
  };

  const isWithinSchedule = (profId: string, day: Date, time: string) =>
    getDaySchedulesForProf(profId, day).some(
      (s) => time >= s.start_time.substring(0, 5) && time < s.end_time.substring(0, 5)
    );

  const getAppointmentAtSlot = (profId: string, day: Date, time: string) => {
    return appointments.find(
      (a) =>
        a.professional_id === profId &&
        isSameDay(parseLocalDate(a.date), day) &&
        a.start_time?.substring(0, 5) === time
    );
  };

  const isSlotOccupied = (profId: string, day: Date, time: string) => {
    const [th, tm] = time.split(":").map(Number);
    const slotMin = th * 60 + tm;
    return appointments.some((a) => {
      if (a.professional_id !== profId || !isSameDay(parseLocalDate(a.date), day)) return false;
      const [sh, sm] = (a.start_time || "").split(":").map(Number);
      const [eh, em] = (a.end_time || "").split(":").map(Number);
      const startMin = sh * 60 + (sm || 0);
      const endMin = eh * 60 + (em || 0);
      return slotMin >= startMin && slotMin < endMin;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Agendamento</h1>
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
      ) : viewMode === "weekly" ? (
        <WeeklyView
          professionals={professionals}
          weekDays={weekDays}
          schedules={schedules}
          appointments={appointments}
          getAppointmentsForCell={getAppointmentsForCell}
          openNewAppointment={openNewAppointment}
          updateStatus={updateStatus}
          onDayClick={(day) => { setSelectedDate(day); setViewMode("daily"); }}
        />
      ) : (
        <DailyView
          professionals={professionals}
          selectedDate={selectedDate}
          schedules={schedules}
          appointments={appointments}
          getAppointmentAtSlot={getAppointmentAtSlot}
          isSlotOccupied={isSlotOccupied}
          getDayScheduleForProf={getDayScheduleForProf}
          isWithinSchedule={isWithinSchedule}
          openNewAppointment={openNewAppointment}
          updateStatus={updateStatus}
        />
      )}

      {/* Create Appointment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Profissional *</Label>
              <Select value={form.professional_id} onValueChange={(v) => setForm({ ...form, professional_id: v })}>
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
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Serviço</Label>
              <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — R$ {Number(s.price).toFixed(2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>Início *</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações (opcional)" />
            </div>
            <Button onClick={handleCreateAppointment} className="w-full">Agendar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Weekly View Component ───
interface WeeklyViewProps {
  professionals: Professional[];
  weekDays: Date[];
  schedules: Record<string, Schedule[]>;
  appointments: Appointment[];
  getAppointmentsForCell: (profId: string, day: Date) => Appointment[];
  openNewAppointment: (profId?: string, day?: Date) => void;
  updateStatus: (id: string, status: string) => void;
  onDayClick: (day: Date) => void;
}

function WeeklyView({ professionals, weekDays, schedules, getAppointmentsForCell, openNewAppointment, updateStatus, onDayClick }: WeeklyViewProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${weekDays.length}, 1fr)` }}>
          <div className="p-2 text-sm font-bold text-muted-foreground sticky left-0 bg-background z-10">Profissional</div>
          {weekDays.map((d) => (
            <div
              key={d.toISOString()}
              className={`p-2 text-center text-sm font-medium rounded-t-lg cursor-pointer hover:bg-accent/30 transition-colors ${isSameDay(d, new Date()) ? "bg-primary/10 text-primary" : "text-foreground"}`}
              onClick={() => onDayClick(d)}
            >
              <div className="capitalize">{format(d, "EEE", { locale: ptBR })}</div>
              <div className="text-lg font-bold">{format(d, "dd")}</div>
            </div>
          ))}
        </div>

        {professionals.map((prof) => (
          <div key={prof.id} className="grid gap-1 border-t border-border" style={{ gridTemplateColumns: `120px repeat(${weekDays.length}, 1fr)` }}>
            <div className="p-2 text-sm font-medium text-foreground flex items-center sticky left-0 bg-background z-10">
              {prof.name}
            </div>
            {weekDays.map((day) => {
              const dayAppts = getAppointmentsForCell(prof.id, day);
              const daySchedule = schedules[prof.id]?.find((s) => s.day_of_week === day.getDay());
              const isOff = !daySchedule || !daySchedule.active;

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[80px] p-1 rounded-lg border border-border/50 ${isOff && dayAppts.length === 0 ? "bg-muted/30" : "bg-card cursor-pointer hover:bg-accent/20"} ${isSameDay(day, new Date()) ? "ring-1 ring-primary/30" : ""}`}
                  onClick={() => (!isOff || dayAppts.length > 0) && onDayClick(day)}
                >
                  {dayAppts.length > 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-1">
                      <span className="text-lg font-bold text-primary">{dayAppts.length}</span>
                      <span className="text-[10px] text-muted-foreground">{dayAppts.length === 1 ? "serviço" : "serviços"}</span>
                    </div>
                  ) : isOff ? (
                    <span className="text-[10px] text-muted-foreground">Folga</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground opacity-50">—</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Daily View Component ───
interface DailyViewProps {
  professionals: Professional[];
  selectedDate: Date;
  schedules: Record<string, Schedule[]>;
  appointments: Appointment[];
  getAppointmentAtSlot: (profId: string, day: Date, time: string) => Appointment | undefined;
  isSlotOccupied: (profId: string, day: Date, time: string) => boolean;
  getDayScheduleForProf: (profId: string, day: Date) => Schedule | undefined;
  isWithinSchedule: (profId: string, day: Date, time: string) => boolean;
  openNewAppointment: (profId?: string, day?: Date, time?: string) => void;
  updateStatus: (id: string, status: string) => void;
}

function DailyView({ professionals, selectedDate, appointments, getDayScheduleForProf, getAppointmentAtSlot, isSlotOccupied, isWithinSchedule, openNewAppointment, updateStatus }: DailyViewProps) {
  const allSchedules = professionals.map((p) => getDayScheduleForProf(p.id, selectedDate)).filter(Boolean) as Schedule[];
  const dayAppointments = appointments.filter((a) => isSameDay(parseLocalDate(a.date), selectedDate));

  if (allSchedules.length === 0 && dayAppointments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Nenhum profissional trabalha neste dia</p>
        </CardContent>
      </Card>
    );
  }

  const scheduleStarts = allSchedules.map((s) => s.start_time.substring(0, 5));
  const scheduleEnds = allSchedules.map((s) => s.end_time.substring(0, 5));
  const appointmentStarts = dayAppointments.map((a) => a.start_time?.substring(0, 5)).filter(Boolean) as string[];
  const appointmentEnds = dayAppointments.map((a) => a.end_time?.substring(0, 5)).filter(Boolean) as string[];
  const earliestStart = [...scheduleStarts, ...appointmentStarts].reduce((min, time) => (time < min ? time : min), "23:59");
  const latestEnd = [...scheduleEnds, ...appointmentEnds].reduce((max, time) => (time > max ? time : max), "00:00");
  const timeSlots = generateTimeSlots(earliestStart, latestEnd, 30);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="grid gap-px bg-border" style={{ gridTemplateColumns: `70px repeat(${professionals.length}, 1fr)` }}>
          <div className="p-2 text-xs font-bold text-muted-foreground bg-background">Horário</div>
          {professionals.map((p) => {
            const sch = getDayScheduleForProf(p.id, selectedDate);
            return (
              <div key={p.id} className={`p-2 text-center text-sm font-medium bg-background ${!sch?.active ? "opacity-50" : ""}`}>
                {p.name}
                {sch?.active && (
                  <div className="text-[10px] text-muted-foreground">
                    {sch.start_time?.substring(0, 5)} - {sch.end_time?.substring(0, 5)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {timeSlots.map((time) => (
          <div
            key={time}
            className="grid gap-px bg-border"
            style={{ gridTemplateColumns: `70px repeat(${professionals.length}, 1fr)` }}
          >
            <div className="p-1 text-xs text-muted-foreground bg-background flex items-center justify-center font-mono">
              {time}
            </div>
            {professionals.map((prof) => {
              const sch = getDayScheduleForProf(prof.id, selectedDate);
              const appt = getAppointmentAtSlot(prof.id, selectedDate, time);
              const isOutOfHours = !sch?.active || !isWithinSchedule(prof.id, selectedDate, time);
              const occupied = !appt && isSlotOccupied(prof.id, selectedDate, time);

              if (isOutOfHours && !appt) {
                return <div key={prof.id} className="min-h-[40px] bg-muted/30" />;
              }

              if (appt) {
                return (
                  <div
                    key={prof.id}
                    className={`min-h-[40px] p-1 bg-background border-l-2 ${STATUS_COLORS[appt.status] || ""} cursor-pointer`}
                    onClick={() => {
                      const next = appt.status === "agendado" ? "concluido" : appt.status === "concluido" ? "agendado" : appt.status;
                      updateStatus(appt.id, next);
                    }}
                  >
                    <div className="text-xs font-medium truncate">{appt.customer_name || "Cliente"}</div>
                    <div className="text-[10px] truncate opacity-75">{appt.service_name}</div>
                  </div>
                );
              }

              if (occupied) {
                return <div key={prof.id} className="min-h-[40px] bg-background" />;
              }

              return (
                <div
                  key={prof.id}
                  className="min-h-[40px] bg-background hover:bg-accent/20 cursor-pointer transition-colors"
                  onClick={() => openNewAppointment(prof.id, selectedDate, time)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
