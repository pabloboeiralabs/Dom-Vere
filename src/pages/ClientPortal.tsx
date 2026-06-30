import ReminderPreference from "@/components/ReminderPreference";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Scissors, ChevronRight, ChevronLeft, Check, Plus, ArrowRight,
  Home, CalendarDays, Clock, User, Phone, Award, CreditCard,
  Calendar, History, LogOut, Sparkles, Package, AlertCircle,
  X, MapPin, Bell,
} from "lucide-react";

/* ===================================================================
   TYPES
   =================================================================== */

type Session = {
  customer_id: string;
  user_id: string;
  name: string;
  phone: string;
  credit_balance: number;
  shop_name: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_usage_count: number | null;
  plan_usage_limit: number | null;
  plan_expires_at: string | null;
};

type Appointment = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  service_name: string;
  professional_name: string;
  professional_photo?: string | null;
  notes: string | null;
  reminder_hours: number | null;
  reminder_sent: boolean;
};

type HistoryItem = {
  record_type: string;
  record_date: string;
  description: string;
  amount: number;
};

type TabId = "inicio" | "agendar" | "agenda" | "perfil";

interface Professional { id: string; name: string; photo_url: string | null; }
interface Service { id: string; name: string; price: number; }
interface Schedule { day_of_week: number; start_time: string; end_time: string; active: boolean; }
interface SlotInfo { time: string; available: boolean; }

/* ===================================================================
   CONSTANTS
   =================================================================== */

const STORAGE_KEY = "client_portal_session";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "agendar", label: "Agendar", icon: CalendarDays },
  { id: "agenda",  label: "Agenda",  icon: Clock },
  { id: "perfil",  label: "Perfil",  icon: User },
];

const STATUS_STYLE: Record<string, string> = {
  agendado:   "bg-blue-500/15 text-blue-600 border-blue-500/30",
  confirmado: "bg-green-500/15 text-green-600 border-green-500/30",
  concluido:  "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cancelado:  "bg-red-500/15 text-red-600 border-red-500/30",
};
const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", confirmado: "Confirmado", concluído: "Concluído", cancelado: "Cancelado",
};

// Safe date parsing helpers for Safari (iOS) compatibility
const safeParseDateTime = (dateStr: string, timeStr: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!timeStr) return new Date(year, month - 1, day);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes || 0);
};

const safeParseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const cleanDateStr = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.includes(" ") ? dateStr.split(" ")[0] : dateStr;
  const [year, month, day] = cleanDateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const safeParseIsoString = (isoStr: string | null | undefined): Date => {
  if (!isoStr) return new Date();
  try {
    const cleanStr = isoStr.replace("Z", "");
    const parts = cleanStr.split("T");
    const datePart = parts[0];
    const timePart = parts[1] || "00:00:00";
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes, seconds] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
  } catch (e) {
    return new Date(isoStr);
  }
};

const STEP_META: Record<string, { icon: any; title: string }> = {
  type:         { icon: Award,        title: "Tipo de Agendamento" },
  professional: { icon: User,         title: "Escolha o Profissional" },
  service:      { icon: Sparkles,     title: "Escolha o Serviço" },
  datetime:     { icon: CalendarDays, title: "Data e Horário" },
  info:         { icon: User,         title: "Confirmar" },
};

/* ===================================================================
   LOGIN SCREEN
   =================================================================== */

function LoginScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!phone || !birthDate) { setError("Preencha telefone e data de nascimento"); return; }
    setBusy(true);
    const { data, error: err } = await (supabase as any).rpc("client_portal_login", {
      p_phone: phone,
      p_birth_date: birthDate,
    });
    setBusy(false);
    if (err) { setError("Erro ao buscar seus dados"); return; }
    if (!data || (data as any[]).length === 0) { setError("Cadastro não encontrado. Verifique os dados."); return; }
    const session = (data as any[])[0] as Session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    onLogin(session);
    toast.success(`Bem-vindo(a), ${session.name}!`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <div className="text-center mb-8 space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 14 }}
            className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-2xl shadow-primary/30"
          >
            <Scissors className="h-10 w-10 text-primary-foreground" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold">Área do Cliente</h1>
            <p className="text-sm text-muted-foreground mt-1">Acesse com seu telefone e data de nascimento</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone" type="tel" inputMode="tel"
                  placeholder="(11) 99999-9999"
                  value={phone} onChange={(e) => { setPhone(e.target.value); setError(""); }}
                  className="h-12 rounded-xl text-base"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth">Data de nascimento</Label>
                <Input
                  id="birth" type="date"
                  value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setError(""); }}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive flex items-center gap-1"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                </motion.p>
              )}
              <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={busy}>
                {busy ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full"
                  />
                ) : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

/* ===================================================================
   HOME SCREEN
   =================================================================== */

function HomeScreen({ session, appointments, onTabChange }: {
  session: Session; appointments: Appointment[]; onTabChange: (t: TabId) => void;
}) {
  const nextAppt = useMemo(() => {
    const up = appointments
      .filter((a) => safeParseDateTime(a.date, a.start_time) >= new Date() && a.status !== "cancelado")
      .sort((a, b) => safeParseDateTime(a.date, a.start_time).getTime() - safeParseDateTime(b.date, b.start_time).getTime());
    return up[0];
  }, [appointments]);

  const todayCount = appointments.filter((a) => {
    const d = safeParseDateTime(a.date, a.start_time);
    return a.date === format(new Date(), "yyyy-MM-dd") && d >= new Date() && a.status !== "cancelado";
  }).length;

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <p className="text-xs text-muted-foreground">Olá,</p>
          <h2 className="text-xl font-bold">{session.name.split(" ")[0]}! 👋</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{session.shop_name}</p>
          {session.plan_name && (
            <Badge variant="secondary" className="mt-1 text-[10px]">
              <Award className="h-3 w-3 mr-0.5" />{session.plan_name}
            </Badge>
          )}
        </div>
      </motion.div>

      {/* Next appointment */}
      {nextAppt ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground shadow-lg shadow-primary/30"
        >
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-white/5" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" />
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {nextAppt.date === format(new Date(), "yyyy-MM-dd") ? "HOJE" : "PRÓXIMO AGENDAMENTO"}
              </span>
            </div>
            <h3 className="text-lg font-bold">{nextAppt.service_name}</h3>
            <p className="text-sm opacity-80">com {nextAppt.professional_name}</p>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {format(safeParseLocalDate(nextAppt.date), "dd 'de' MMMM", { locale: ptBR })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {nextAppt.start_time.slice(0, 5)}h
              </span>
            </div>
            {nextAppt.reminder_hours ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-white/70">
                <Bell className="h-3 w-3" />
                <span>Lembrete: {nextAppt.reminder_hours < 1
                  ? Math.round(nextAppt.reminder_hours * 60) + "min"
                  : nextAppt.reminder_hours + "h"} antes
                  {nextAppt.reminder_sent ? " ✅ Enviado" : " ⏳ Pendente"}
                </span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-white/50">
                <Bell className="h-3 w-3" />
                <span>Sem lembrete</span>
              </div>
            )}
            <Button
              size="sm" variant="secondary"
              className="mt-4 rounded-xl bg-white/20 text-white hover:bg-white/30 border-0"
              onClick={() => onTabChange("agenda")}
            >
              Ver agenda <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-center"
        >
          <CalendarDays className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Nenhum agendamento futuro</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Que tal agendar um horário?</p>
          <Button size="sm" className="mt-3 rounded-xl" onClick={() => onTabChange("agendar")}>
            <Plus className="h-4 w-4 mr-1" /> Agendar agora
          </Button>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: CreditCard, label: "Créditos", value: String(session.credit_balance), delay: 0.2 },
          { icon: Package, label: session.plan_name ? "Usos do plano" : "Plano",
            value: session.plan_name ? `${session.plan_usage_count}/${session.plan_usage_limit}` : "—",
            delay: 0.24 },
          { icon: Calendar, label: "Agendamentos", value: String(appointments.length), delay: 0.28 },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: s.delay }}
            className="bg-card rounded-xl border border-border/40 p-3 text-center"
          >
            <s.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Ações rápidas
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Plus,   label: "Agendar",    desc: "Novo horário",      color: "bg-primary/10 text-primary",      tab: "agendar" as TabId },
            { icon: Clock,  label: "Agenda",     desc: "Meus horários",     color: "bg-blue-500/10 text-blue-600",    tab: "agenda" as TabId },
            ...(session.plan_name
              ? [{ icon: Package, label: "Meu Plano", desc: "Ver detalhes", color: "bg-emerald-500/10 text-emerald-600", tab: "perfil" as TabId }]
              : []),
            { icon: Phone,  label: "WhatsApp",   desc: "Falar conosco",     color: "bg-green-500/10 text-green-600",  tab: null as TabId | null },
          ].map((act) => (
            <button
              key={act.label}
              onClick={() => act.tab ? onTabChange(act.tab) : window.open(`https://wa.me/55${session.phone?.replace(/\D/g, "")}`, "_blank")}
              className="flex items-center gap-3 bg-card border border-border/40 rounded-xl p-4 hover:border-primary/30 transition-colors text-left"
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${act.color}`}>
                <act.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">{act.label}</p>
                <p className="text-[10px] text-muted-foreground">{act.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================================================================
   BOOK SCREEN  (full integrated booking flow)
   =================================================================== */

function BookScreen({ session, onDone }: { session: Session; onDone: () => void }) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [schedules, setSchedules] = useState<Record<string, Schedule[]>>({});
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [selProf, setSelProf] = useState("");
  const [selSvcs, setSelSvcs] = useState<string[]>([]);
  const [bookingType, setBookingType] = useState<"plan" | "avulso">("avulso");
  const [selDate, setSelDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [selSlot, setSelSlot] = useState("");
  const [customerName, setCustomerName] = useState(session.name);
  const [customerPhone, setCustomerPhone] = useState(session.phone);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastCustomerId, setLastCustomerId] = useState<string>("");

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);
  
  const steps = useMemo(() => {
    const s: string[] = [];
    if (session.plan_id) {
      s.push("type");
    }
    s.push("professional", "service", "datetime", "info");
    return s;
  }, [session.plan_id]);

  const currentStep = steps[step];

  /* Load data */
  useEffect(() => {
    (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          supabase.from("professionals").select("id,name,photo_url").eq("user_id", session.user_id).eq("active", true).order("name"),
          supabase.from("services").select("id,name,price").eq("user_id", session.user_id).eq("active", true).order("name"),
        ]);
        const profs = (pRes.data || []) as Professional[];
        setProfessionals(profs);
        setServices((sRes.data || []) as Service[]);
        if (profs.length) {
          const { data: sch } = await supabase
            .from("professional_schedules")
            .select("professional_id,day_of_week,start_time,end_time,active")
            .in("professional_id", profs.map((p) => p.id));
          const map: Record<string, Schedule[]> = {};
          for (const r of (sch || []) as any[]) {
            if (!map[r.professional_id]) map[r.professional_id] = [];
            map[r.professional_id].push(r);
          }
          setSchedules(map);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [session.user_id]);

  /* Slots */
  useEffect(() => {
    if (!selProf) { setSlots([]); return; }
    const daySch = schedules[selProf]?.find((s) => s.day_of_week === selDate.getDay());
    if (!daySch?.active) { setSlots([]); return; }
    (async () => {
      const ds = format(selDate, "yyyy-MM-dd");
      const { data: existing } = await supabase
        .from("appointments").select("start_time,end_time")
        .eq("professional_id", selProf).eq("date", ds).neq("status", "cancelado");

      const occ = new Set<number>();
      for (const a of existing || []) {
        let c = Number(a.start_time.slice(0, 2)) * 60 + Number(a.start_time.slice(3, 5));
        const end = Number(a.end_time.slice(0, 2)) * 60 + Number(a.end_time.slice(3, 5));
        while (c < end) { occ.add(c); c += 30; }
      }
      const result: SlotInfo[] = [];
      let cur = Number(daySch.start_time.slice(0, 2)) * 60 + Number(daySch.start_time.slice(3, 5));
      const endMin = Number(daySch.end_time.slice(0, 2)) * 60 + Number(daySch.end_time.slice(3, 5));
      const now = new Date();
      const today = isSameDay(selDate, now);
      while (cur < endMin) {
        const h = Math.floor(cur / 60);
        const m = cur % 60;
        const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const past = today && (h * 60 + m <= now.getHours() * 60 + now.getMinutes());
        result.push({ time: t, available: !occ.has(cur) && !past });
        cur += 30;
      }
      setSlots(result);
      setSelSlot("");
    })();
  }, [selProf, selDate, schedules]);

  const nextStep = () => { setDir(1); setStep((s) => Math.min(s + 1, steps.length - 1)); };
  const prevStep = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };
  const canNext = () => {
    switch (currentStep) {
      case "type":         return !!bookingType;
      case "professional": return !!selProf;
      case "service":      return selSvcs.length > 0;
      case "datetime":     return !!selSlot;
      case "info":         return true;
      default:             return false;
    }
  };

  /* Confirm booking */
  const handleConfirm = async () => {
    if (!session.user_id || !selProf || !selSlot || !customerName.trim() || selSvcs.length === 0) {
      toast.error("Preencha todos os campos e selecione pelo menos 1 serviço"); return;
    }
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("customers").select("id").eq("user_id", session.user_id).eq("phone", customerPhone.trim()).limit(1);
      let customerId: string;
      if (existing?.length) {
        customerId = existing[0].id;
      } else {
        const { data: nc, error: ec } = await supabase
          .from("customers").insert({ user_id: session.user_id, name: customerName.trim(), phone: customerPhone.trim() })
          .select("id").single();
        if (ec) throw ec;
        customerId = nc!.id;
      }

      const [sh, sm] = selSlot.split(":").map(Number);
      const endMin = sh * 60 + sm + 30;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

      let notesContent = "Agendamento via App do Cliente";
      if (bookingType === "plan") {
        notesContent = `Agendamento via Plano (${session.plan_name})`;
      }
      if (selSvcs.length > 1) {
        notesContent += "\nServiços: " + selSvcs.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(", ");
      }

      const { data: newAppt, error } = await supabase.from("appointments").insert({
        user_id: session.user_id, professional_id: selProf, customer_id: customerId,
        service_id: selSvcs[0] || null, date: format(selDate, "yyyy-MM-dd"),
        start_time: selSlot, end_time: endTime,
        notes: notesContent,
      }).select("id").single();
      if (error) throw error;

      if (bookingType === "plan" && session.plan_id) {
        // 1. Criar registro de uso do plano
        const { error: usageError } = await supabase.from("plan_usage_records").insert({
          customer_plan_id: session.plan_id,
          professional_id: selProf,
          appointment_id: newAppt.id,
        });
        if (usageError) throw usageError;

        // 2. Incrementar uso no plano do cliente
        const currentCount = session.plan_usage_count || 0;
        const { error: updateError } = await supabase
          .from("customer_plans")
          .update({ usage_count: currentCount + 1 })
          .eq("id", session.plan_id);
        if (updateError) throw updateError;

        // 3. Sincronizar o localStorage para que o app renderize o limite restante na hora
        const updatedSess = {
          ...session,
          plan_usage_count: currentCount + 1
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSess));
      }

      const svcNames = selSvcs.map(id => services.find((s) => s.id === id)?.name).filter(Boolean).join(", ");
      supabase.functions.invoke("notify-professional", {
        body: {
          professional_id: selProf, user_id: session.user_id,
          customer_name: customerName.trim(),
          service_name: svcNames,
          date: format(selDate, "yyyy-MM-dd"), start_time: selSlot,
        },
      }).catch(() => {});

      setLastCustomerId(customerId);
      setDone(true);
      toast.success("Agendamento confirmado!");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  /* ── Loading ── */
  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-24">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="h-8 w-8 border-[3px] border-primary border-t-transparent rounded-full"
      />
    </div>
  );

  /* ── Success ── */
  if (done) {
    const prof = professionals.find((p) => p.id === selProf);
    const selectedSvcNames = selSvcs.map(id => services.find((s) => s.id === id)?.name).filter(Boolean).join(", ");
    const totalPrice = selSvcs.reduce((acc, id) => acc + (services.find((s) => s.id === id)?.price || 0), 0);
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", damping: 16 }}
            className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto"
          >
            <Check className="h-10 w-10 text-green-500" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold">Confirmado! 🎉</h2>
            <p className="text-muted-foreground mt-1">Seu horário foi reservado</p>
          </div>
          <div className="bg-card rounded-2xl border border-border/40 p-5 space-y-3 text-left">
            {prof && (
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={prof.photo_url || undefined} />
                  <AvatarFallback className="text-[10px]">{prof.name[0]}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{prof.name}</span>
              </div>
            )}
            {selSvcs.length > 0 && (
              <div className="flex items-center gap-3">
                <Scissors className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="font-medium">
                  {selectedSvcNames} {bookingType === "plan" ? "— Plano" : `— R$ ${totalPrice.toFixed(2)}`}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="font-medium">{format(selDate, "dd 'de' MMMM, EEEE", { locale: ptBR })}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="font-medium">{selSlot}h</span>
            </div>
          </div>
          <div className="space-y-3 pt-2">
            <ReminderPreference customerId={lastCustomerId} onSave={() => {}} />
          </div>
          <Button
            onClick={() => {
              setDone(false);
              setStep(0);
              setSelProf("");
              setSelSvcs([]);
              setSelSlot("");
              setSelDate(new Date());
              setLastCustomerId("");
              setBookingType("avulso");
            }}
            variant="outline" className="rounded-xl"
          >
            Novo agendamento
          </Button>
        </motion.div>
      </div>
    );
  }

  /* ── Main booking flow ── */
  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Steps indicator */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          {steps.map((s, i) => {
            const Icon = STEP_META[s].icon;
            return (
              <div
                key={s}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                  i <= step ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
            );
          })}
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step header */}
      <div className="px-4 pb-3 flex-shrink-0">
        <h3 className="text-base font-bold">{STEP_META[currentStep].title}</h3>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-3">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={currentStep}
              custom={dir}
              initial={{ x: dir > 0 ? 200 : -200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir > 0 ? -200 : 200, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step: Type (Plan vs Avulso) */}
              {currentStep === "type" && (
                <div className="space-y-4 py-4">
                  <button
                    onClick={() => { setBookingType("plan"); nextStep(); }}
                    className={`w-full rounded-2xl border-2 p-5 text-left transition-all group ${
                      bookingType === "plan" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-lg">📦 Usar Meu Plano</p>
                      <Badge variant="secondary" className="bg-primary/10 text-primary">Ativo</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">
                      {session.plan_name}
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      Saldo de usos: {session.plan_usage_count || 0} de {session.plan_usage_limit || 0}
                    </p>
                    <p className="text-xs text-primary mt-3 group-hover:translate-x-1 transition-transform">Agendar pelo plano →</p>
                  </button>

                  <button
                    onClick={() => { setBookingType("avulso"); nextStep(); }}
                    className={`w-full rounded-2xl border-2 p-5 text-left transition-all group ${
                      bookingType === "avulso" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <p className="font-bold text-lg">💰 Agendamento Avulso</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Agendamento comum fora do plano.
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      Pague no local ou com seus créditos avulsos.
                    </p>
                    <p className="text-xs text-primary mt-3 group-hover:translate-x-1 transition-transform">Agendar avulso →</p>
                  </button>
                </div>
              )}

              {/* Step: Professional */}
              {currentStep === "professional" && (
                <div className="grid grid-cols-2 gap-3">
                  {professionals.map((p, i) => (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                      onClick={() => { setSelProf(p.id); nextStep(); }}
                      className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
                        selProf === p.id ? "border-primary shadow-lg shadow-primary/20" : "border-border/40"
                      }`}
                    >
                      <div className="aspect-[4/5] relative bg-muted">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <span className="text-4xl font-bold text-primary/40">
                              {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-white font-semibold text-sm">{p.name}</p>
                        </div>
                        {selProf === p.id && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                            <Check className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Step: Service */}
              {currentStep === "service" && (
                <div className="space-y-2">
                  {services.map((svc, i) => {
                    const isSelected = selSvcs.includes(svc.id);
                    return (
                      <motion.button
                        key={svc.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => {
                          if (isSelected) {
                            setSelSvcs(prev => prev.filter(id => id !== svc.id));
                          } else {
                            setSelSvcs(prev => [...prev, svc.id]);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                          isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/40 bg-card"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}>
                            <Scissors className="h-5 w-5" />
                          </div>
                          <span className="font-medium">{svc.name}</span>
                        </div>
                        <Badge variant="secondary" className={isSelected ? "bg-primary/15 text-primary" : ""}>
                          R$ {Number(svc.price).toFixed(2)}
                        </Badge>
                      </motion.button>
                    );
                  })}
                  {services.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum serviço disponível no momento</p>
                    </div>
                  )}

                </div>
              )}

              {/* Step: Date & Time */}
              {currentStep === "datetime" && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3">Escolha o dia</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 snap-x no-scrollbar">
                      {days.map((d, i) => {
                        const sch = schedules[selProf]?.find((s) => s.day_of_week === d.getDay());
                        const off = !sch?.active;
                        const sel = isSameDay(d, selDate);
                        return (
                          <motion.button
                            key={d.toISOString()}
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.03 }}
                            disabled={off}
                            onClick={() => setSelDate(d)}
                            className={`snap-start flex-shrink-0 flex flex-col items-center py-3 px-3.5 rounded-2xl border-2 transition-all min-w-[60px] ${
                              off ? "opacity-25 border-transparent" :
                              sel ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30" :
                              "border-border/40 bg-card"
                            }`}
                          >
                            <span className={`text-[10px] uppercase font-semibold ${
                              sel ? "text-primary-foreground/70" : "text-muted-foreground"
                            }`}>{format(d, "EEE", { locale: ptBR })}</span>
                            <span className="text-xl font-bold leading-tight">{format(d, "dd")}</span>
                            <span className={`text-[10px] ${
                              sel ? "text-primary-foreground/70" : "text-muted-foreground"
                            }`}>{format(d, "MMM", { locale: ptBR })}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3">Horários disponíveis</p>
                    {slots.length > 0 ? (
                      <div className="grid grid-cols-4 gap-2">
                        {slots.map((s, i) => (
                          <motion.button
                            key={s.time}
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.02 }}
                            disabled={!s.available}
                            onClick={() => setSelSlot(s.time)}
                            className={`py-2.5 px-2 rounded-xl text-sm font-medium border-2 transition-all ${
                              !s.available
                                ? "opacity-20 border-transparent bg-muted line-through"
                                : selSlot === s.time
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-border/40 bg-card hover:border-primary/50"
                            }`}
                          >
                            {s.time}
                          </motion.button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground bg-card rounded-2xl border border-dashed border-border/40">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sem horários disponíveis neste dia</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step: Confirm */}
              {currentStep === "info" && (
                <div className="space-y-4">
                  <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Resumo</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium">{professionals.find((p) => p.id === selProf)?.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{selSvcs.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(", ")}</span>
                      </div>
                      {bookingType === "plan" && (
                        <div className="flex items-center gap-2 text-primary">
                          <Award className="h-4 w-4 flex-shrink-0" />
                          <span className="font-semibold">Descontado do plano ({session.plan_name})</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{format(selDate, "dd 'de' MMMM", { locale: ptBR })} às {selSlot}h</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block">Nome *</label>
                      <Input
                        value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Seu nome" className="rounded-xl h-12 text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1.5 block">Telefone</label>
                      <Input
                        value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(00) 00000-0000" className="rounded-xl h-12 text-base"
                      />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

      {/* Bottom nav for booking — always visible */}
      <div className="flex-shrink-0 bg-background/95 backdrop-blur-xl border-t border-border/40 pb-6 pt-3 px-4 safe-area-bottom">
        <div className="flex gap-3 max-w-lg mx-auto">
          {step > 0 && (
            <Button variant="outline" onClick={prevStep} className="rounded-xl h-11 px-4 border-border/50">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {currentStep === "info" ? (
            <Button
              onClick={handleConfirm}
              disabled={busy || !customerName.trim()}
              className="flex-1 rounded-xl h-11 text-sm font-semibold bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/30"
            >
              {busy ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full mx-auto"
                />
              ) : (
                <><Check className="h-4 w-4 mr-1.5" /> Confirmar Agendamento</>
              )}
            </Button>
          ) : (
            <Button onClick={nextStep} disabled={!canNext()} className="flex-1 rounded-xl h-11 text-sm font-semibold">
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================================================================
   APPOINTMENTS SCREEN
   =================================================================== */

function AppointmentsScreen({ session }: { session: Session }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "past" | "history">("upcoming");

  useEffect(() => {
    (async () => {
      const cli = supabase as any;
      const [a, h] = await Promise.all([
        cli.rpc("client_portal_appointments", { p_customer_id: session.customer_id }),
        cli.rpc("client_portal_history", { p_customer_id: session.customer_id }),
      ]);
      if (a.data) setAppointments(a.data as Appointment[]);
      if (h.data) setHistory(h.data as HistoryItem[]);
      setLoading(false);
    })();
  }, [session.customer_id]);

  const upcoming = useMemo(() => appointments
    .filter((a) => safeParseDateTime(a.date, a.start_time) >= new Date() && a.status !== "cancelado")
    .sort((a, b) => safeParseDateTime(a.date, a.start_time).getTime() - safeParseDateTime(b.date, b.start_time).getTime()),
    [appointments]);

  const past = useMemo(() => appointments
    .filter((a) => safeParseDateTime(a.date, a.start_time) < new Date() || a.status === "cancelado")
    .sort((a, b) => safeParseDateTime(b.date, b.start_time).getTime() - safeParseDateTime(a.date, a.start_time).getTime()),
    [appointments]);

  const handleCancel = async (id: string) => {
    const { error } = await supabase.from("appointments").update({ status: "cancelado" }).eq("id", id);
    if (error) { toast.error("Erro ao cancelar"); return; }
    toast.success("Agendamento cancelado");
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status: "cancelado" } : a));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="h-8 w-8 border-[3px] border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const FilterTab = ({ id, label }: { id: typeof filter; label: string }) => (
    <button
      onClick={() => setFilter(id)}
      className={`flex-1 py-2 text-sm rounded-md transition-all ${filter === id ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="px-4 pt-4 pb-6">
      {/* Filter */}
      <div className="flex gap-2 mb-4 p-1 bg-muted rounded-lg">
        <FilterTab id="upcoming" label="Próximos" />
        <FilterTab id="past" label="Anteriores" />
        <FilterTab id="history" label="Histórico" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={filter}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {/* History */}
          {filter === "history" && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-30 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">Sem histórico ainda</p>
                </div>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="bg-card rounded-xl border border-border/40 p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{h.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(safeParseIsoString(h.record_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    {h.amount > 0 && <p className="text-sm font-semibold ml-2">R$ {Number(h.amount).toFixed(2)}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Upcoming */}
          {filter === "upcoming" && (
            <div className="space-y-3">
              {upcoming.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium">Nenhum agendamento futuro</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Você ainda não tem horários marcados</p>
                </div>
              ) : (
                upcoming.map((a, i) => (
                  <div key={a.id} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold">{a.service_name}</p>
                          <p className="text-xs text-muted-foreground">com {a.professional_name}</p>
                        </div>
                        <Badge variant="outline" className={`${STATUS_STYLE[a.status]} text-[10px]`}>
                          {STATUS_LABEL[a.status] || a.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(safeParseLocalDate(a.date), "dd 'de' MMM", { locale: ptBR })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {a.start_time.slice(0, 5)}h
                        </span>
                      </div>
                      {a.status === "agendado" && (
                        <Button
                          variant="ghost" size="sm"
                          className="mt-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl text-xs"
                          onClick={() => handleCancel(a.id)}
                        >
                          Cancelar agendamento
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Past */}
          {filter === "past" && (
            <div className="space-y-2">
              {past.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-30 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">Nenhum agendamento anterior</p>
                </div>
              ) : (
                past.map((a, i) => (
                  <div key={a.id} className="bg-card rounded-xl border border-border/40 p-3 opacity-70">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{a.service_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(safeParseLocalDate(a.date), "dd/MM/yyyy", { locale: ptBR })} · {a.start_time.slice(0, 5)}h · {a.professional_name}
                        </p>
                      </div>
                      <Badge variant="outline" className={`${STATUS_STYLE[a.status]} text-[10px]`}>
                        {STATUS_LABEL[a.status] || a.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ===================================================================
   PROFILE SCREEN
   =================================================================== */

function ProfileScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* Avatar & name */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border/40 p-5"
      >
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-2xl font-bold text-primary-foreground">
              {session.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold truncate">{session.name}</h2>
            <p className="text-sm text-muted-foreground">{session.phone}</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{session.shop_name}</p>
          </div>
        </div>
      </motion.div>

      {/* Plan */}
      {session.plan_name && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border/40 p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{session.plan_name}</h3>
            </div>
            <Badge variant="secondary" className="text-[10px]">Ativo</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Uso do plano</span>
              <span className="font-medium">{session.plan_usage_count}/{session.plan_usage_limit}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(((session.plan_usage_count || 0) / (session.plan_usage_limit || 1)) * 100, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
              />
            </div>
            {session.plan_expires_at && (
              <p className="text-xs text-muted-foreground">
                Vence em {format(safeParseIsoString(session.plan_expires_at), "dd 'de' MMMM", { locale: ptBR })}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Credits */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="bg-card rounded-2xl border border-border/40 p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Créditos</p>
            <p className="text-xl font-bold">{session.credit_balance}</p>
          </div>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="bg-card rounded-2xl border border-border/40 divide-y divide-border/40 overflow-hidden"
      >
        <button
          onClick={() => window.open(`https://wa.me/55${session.phone?.replace(/\D/g, "")}`, "_blank")}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium">Falar no WhatsApp</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-red-500"
        >
          <div className="flex items-center gap-3">
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Sair</span>
          </div>
          <ChevronRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}

/* ===================================================================
   MAIN — CLIENT PORTAL
   =================================================================== */

export default function ClientPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("inicio");

  /* Restore session */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSession(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  /* Fetch appointments */
  const fetchAppts = useMemo(() => async () => {
    if (!session) return;
    const { data } = await (supabase as any).rpc("client_portal_appointments", { p_customer_id: session.customer_id });
    if (data) setAppointments(data as Appointment[]);
  }, [session]);

  useEffect(() => { fetchAppts(); }, [fetchAppts]);

  const handleLogin = (s: Session) => setSession(s);
  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setActiveTab("inicio");
    toast.success("Você saiu da sua conta");
  };

  if (!session) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Scissors className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-tight">{session.shop_name}</p>
              <p className="text-xs font-semibold leading-tight">Cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] gap-1">
              <CreditCard className="h-3 w-3" /> {session.credit_balance}
            </Badge>
            <button
              onClick={handleLogout}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "inicio" && <HomeScreen session={session} appointments={appointments} onTabChange={setActiveTab} />}
            {activeTab === "agendar" && <BookScreen session={session} onDone={fetchAppts} />}
            {activeTab === "agenda" && <AppointmentsScreen session={session} />}
            {activeTab === "perfil" && <ProfileScreen session={session} onLogout={handleLogout} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom tab bar — visible unless booking */}
      {activeTab !== "agendar" && (
        <nav className="sticky bottom-0 z-20 bg-background/80 backdrop-blur-xl border-t border-border/40 pb-1 safe-area-bottom">
          <div className="max-w-lg mx-auto flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-all relative ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <div className="absolute -top-px left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
                  )}
                  <Icon className={`h-5 w-5 mb-0.5 ${isActive ? "scale-110" : ""}`} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
