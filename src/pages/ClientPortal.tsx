import ReminderPreference from "@/components/ReminderPreference";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { usePushSubscription } from "@/hooks/usePushSubscription";
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
  X, MapPin, Bell, Trash2,
} from "lucide-react";

/* ===================================================================
   TYPES
   =================================================================== */

type Session = {
  customer_id: string;
  user_id: string;
  name: string;
  phone: string;
  shop_name: string;
  credit_balance: number;
  plan_id: string | null;
  customer_plan_id: string | null;
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

type StatItem = { icon: any; label: string; value: string; sub?: string; delay: number };
type TabId = "inicio" | "agendar" | "agenda" | "perfil";

interface Professional { id: string; name: string; photo_url: string | null; }
interface Service { id: string; name: string; price: number; duration_minutes: number; }
interface Schedule { day_of_week: number; start_time: string; end_time: string; active: boolean; }
interface SlotInfo { time: string; available: boolean; }

/* ===================================================================
   CONSTANTS
   =================================================================== */

const STORAGE_KEY = "client_portal_session";
const PUSH_ENABLED_KEY = "client_portal_push_enabled";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0";

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
   NOTIFICATION ITEM (swipe-to-delete)
   =================================================================== */

function NotifItem({ n, setNotifications, setUnreadCount }: { n: any; setNotifications: any; setUnreadCount: any }) {
  const [swipeX, setSwipeX] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const swipeXRef = useRef(0);

  const handleDelete = async () => {
    setDeleting(true);
    await (supabase as any).rpc("client_delete_notification", { p_notification_id: n.id });
    setNotifications((prev: any[]) => prev.filter((x: any) => x.id !== n.id));
    if (!n.read) setUnreadCount((c: number) => Math.max(0, c - 1));
  };

  return (
    <div className="relative overflow-hidden rounded-xl mb-1">
      {swipeX > 10 && (
        <div className="absolute inset-0 bg-red-500/30 flex items-center justify-end pr-4 rounded-xl" style={{ opacity: Math.min(swipeX / 80, 1) }}>
          <Trash2 className="h-5 w-5 text-red-500" />
        </div>
      )}
      <motion.div
        animate={deleting ? { x: "120%", opacity: 0 } : { x: swipeX }}
        transition={deleting ? { duration: 0.2 } : { type: "spring", stiffness: 400, damping: 30 }}
        onTouchStart={e => {
          startX.current = e.touches[0].clientX;
          startY.current = e.touches[0].clientY;
          swiping.current = false;
        }}
        onTouchMove={e => {
          const dx = e.touches[0].clientX - startX.current;
          const dy = e.touches[0].clientY - startY.current;
          // Only start horizontal swipe if horizontal > vertical movement
          if (!swiping.current && Math.abs(dx) > Math.abs(dy) && dx > 5) {
            swiping.current = true;
          }
          if (swiping.current && dx > 0) {
            const val = Math.min(dx, 120);
            swipeXRef.current = val;
            setSwipeX(val);
          }
        }}
        onTouchEnd={() => {
          swiping.current = false;
          if (swipeXRef.current > 70) { handleDelete(); }
          else setSwipeX(0);
        }}
        onTouchCancel={() => { swiping.current = false; setSwipeX(0); }}
        className={`p-3 cursor-pointer transition-colors ${n.read ? "bg-card" : "bg-primary/5 hover:bg-primary/10"}`}
        onClick={async () => {
          if (swipeX > 0) { setSwipeX(0); return; }
          await (supabase as any).rpc("client_mark_read", { p_notification_id: n.id });
          setNotifications((prev: any[]) => prev.map((x: any) => x.id === n.id ? { ...x, read: true } : x));
          setUnreadCount((c: number) => Math.max(0, c - 1));
          if (n.url) window.location.href = n.url;
        }}
      >
        <div className="flex items-start gap-3">
          <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${n.read ? "bg-transparent" : "bg-primary"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{n.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              {format(new Date(n.created_at), "dd/MM HH:mm")}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/[0.02] to-background p-4 relative overflow-hidden theme-client">
      {/* Decorative blurs */}
      <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-primary/10 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Brand */}
        <div className="text-center mb-8 space-y-4">
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: "spring", damping: 12, stiffness: 200 }}
            className="mx-auto h-24 w-24 rounded-3xl overflow-hidden shadow-2xl shadow-primary/15 border border-border/40 bg-card p-1"
          >
            <div className="h-full w-full rounded-[1.25rem] overflow-hidden">
              <img src="/dv.jpg" alt="Logo Dom Vere" className="h-full w-full object-cover" />
            </div>
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Área do Cliente</h1>
            <p className="text-sm text-muted-foreground mt-1">Acesse com seu telefone e data de nascimento</p>
          </div>
        </div>

        <Card className="border-border/20 shadow-xl shadow-black/5 bg-card/80 backdrop-blur-xl">
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
    <div className="px-4 pt-3 pb-4 space-y-4">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.03] via-primary/[0.07] to-transparent border border-primary/10 p-4"
      >
        <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-primary/5" />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Seja bem-vindo</p>
            <h2 className="text-lg font-extrabold tracking-tight mt-0.5">{session.name.split(" ")[0]}! 👋</h2>
          </div>
          <div className="flex items-center gap-3 text-right">
            {session.plan_name && (
              <div>
                <Badge variant="secondary" className="text-[9px] font-bold rounded-full px-2 py-0.5 border-none bg-primary/10 text-primary">
                  <Award className="h-2.5 w-2.5 mr-0.5 shrink-0" />{session.plan_name}
                </Badge>
              </div>
            )}
            <div className="h-10 w-10 rounded-xl overflow-hidden border border-border/50 shadow-sm shrink-0 bg-card">
              <img src="/dv.jpg" alt="Logo Dom Vere" className="h-full w-full object-cover" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Next appointment */}
      {nextAppt ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground shadow-xl shadow-primary/20"
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
      <div className="grid grid-cols-3 gap-2">
        {(session.plan_name
          ? ([
              { icon: Package, label: "Usos",
                value: `${session.plan_usage_count || 0}/${session.plan_usage_limit || 0}`,
                sub: `${(session.plan_usage_limit || 0) - (session.plan_usage_count || 0)} rest.`,
                delay: 0.2 },
              { icon: Calendar, label: "Vencimento",
                value: session.plan_expires_at
                  ? format(new Date(session.plan_expires_at + "T00:00:00"), "dd/MM/yy")
                  : "—",
                sub: session.plan_expires_at
                  ? (new Date(session.plan_expires_at + "T00:00:00") < new Date() ? "⚠️ Exp." :
                     Math.ceil((new Date(session.plan_expires_at + "T00:00:00").getTime() - Date.now()) / 86400000) + "d")
                  : undefined,
                delay: 0.24 },
              { icon: Clock, label: "Agendados", value: String(appointments.length), delay: 0.28 },
            ] as StatItem[])
          : ([
              { icon: CreditCard, label: "Créditos", value: String(session.credit_balance), delay: 0.2 },
              { icon: Calendar, label: "Agendados", value: String(appointments.length), delay: 0.24 },
              { icon: Clock, label: "Histórico", value: String(history.length), delay: 0.28 },
            ] as StatItem[])
        ).map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: s.delay, type: "spring", damping: 18, stiffness: 200 }}
            className="bg-card rounded-xl border border-border/30 p-2.5 text-center hover:border-primary/20 transition-all"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1.5 ${
              i === 0 ? "bg-primary/10 text-primary" :
              i === 1 ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400" :
              "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            }`}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-base font-bold tracking-tight">{s.value}</p>
            <p className="text-[10px] text-muted-foreground font-semibold leading-tight">{s.label}</p>
            {s.sub && <p className="text-[9px] font-bold text-primary/70 mt-0.5 leading-tight">{s.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Ações rápidas
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Plus,   label: "Agendar",    desc: "Novo horário",      color: "bg-primary/10 text-primary",      tab: "agendar" as TabId },
            { icon: Clock,  label: "Agenda",     desc: "Meus horários",     color: "bg-primary/10 text-primary",    tab: "agenda" as TabId },
            ...(session.plan_name
              ? [{ icon: Package, label: "Meu Plano", desc: "Ver detalhes", color: "bg-emerald-500/10 text-emerald-600", tab: "perfil" as TabId }]
              : []),
            { icon: Phone,  label: "WhatsApp",   desc: "Falar conosco",     color: "bg-green-500/10 text-green-600",  tab: null as TabId | null },
          ].map((act) => (
            <button
              key={act.label}
              onClick={() => act.tab ? onTabChange(act.tab) : window.open(`https://wa.me/55${session.phone?.replace(/\D/g, "")}`, "_blank")}
              className="flex items-center gap-2.5 bg-card border border-border/40 rounded-xl p-3 hover:border-primary/30 transition-colors text-left"
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${act.color}`}>
                <act.icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold leading-tight">{act.label}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{act.desc}</p>
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

function BookScreen({ session, onDone, onCancel, onDoneChange }: { session: Session; onDone: () => void; onCancel: () => void; onDoneChange: (done: boolean) => void }) {
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
  const [planServiceIds, setPlanServiceIds] = useState<Set<string>>(new Set());

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);

  // Load plan services for filtering (via RPC to bypass RLS)
  useEffect(() => {
    if (!session.plan_id) return;
    (async () => {
      const { data } = await (supabase as any).rpc("client_plan_services", { p_plan_id: session.plan_id });
      if (data) setPlanServiceIds(new Set(data.map((r: any) => r.service_id)));
    })();
  }, [session.plan_id]);

  // Clear selected services when switching booking type
  useEffect(() => { setSelSvcs([]); }, [bookingType]);
  
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
    // Get ALL active schedules for this day (supports multiple blocks)
    let daySchedules = (schedules[selProf] || []).filter((s) => s.day_of_week === selDate.getDay() && s.active);
    // Fallback: if no schedules configured, use default 08:00-18:00
    if (daySchedules.length === 0) {
      const allSchedules = schedules[selProf] || [];
      if (allSchedules.length === 0) {
        // No schedules at all for this professional → use default
        daySchedules = [{ day_of_week: selDate.getDay(), start_time: "08:00", end_time: "18:00", active: true }];
      } else {
        // Has schedules but none for this day → day is off
        setSlots([]); return;
      }
    }
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
      const now = new Date();
      const today = isSameDay(selDate, now);
      // Iterate ALL schedule blocks for this day
      for (const daySch of daySchedules) {
        let cur = Number(daySch.start_time.slice(0, 2)) * 60 + Number(daySch.start_time.slice(3, 5));
        const endMin = Number(daySch.end_time.slice(0, 2)) * 60 + Number(daySch.end_time.slice(3, 5));
        while (cur < endMin) {
          const h = Math.floor(cur / 60);
          const m = cur % 60;
          const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          const past = today && (h * 60 + m <= now.getHours() * 60 + now.getMinutes());
          result.push({ time: t, available: !occ.has(cur) && !past });
          cur += 30;
        }
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
      const totalDuration = selSvcs.reduce((max, id) => {
        const svc = services.find(s => s.id === id);
        return Math.max(max, svc?.duration_minutes || 30);
      }, 30);
      const endMin = sh * 60 + sm + totalDuration;
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

      if (bookingType === "plan" && session.customer_plan_id) {
        // Plan credit is now deducted only when barber marks "concluído"
        // The plan_usage_record will be created by the database trigger at that time
        notesContent += `\n[PLAN_ID:${session.customer_plan_id}]`;
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
      onDoneChange(true);
      toast.success("Agendamento confirmado!");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  /* ── Loading ── */
  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 gap-3">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="h-9 w-9 rounded-xl overflow-hidden border border-primary/20 bg-card p-0.5"
      >
        <img src="/dv.jpg" alt="Carregando" className="h-full w-full object-cover rounded-lg" />
      </motion.div>
      <p className="text-[10px] text-muted-foreground/60 font-semibold tracking-wider uppercase animate-pulse">Carregando horários...</p>
    </div>
  );

  /* ── Success ── */
  if (done) {
    const prof = professionals.find((p) => p.id === selProf);
    const selectedSvcNames = selSvcs.map(id => services.find((s) => s.id === id)?.name).filter(Boolean).join(", ");
    const totalPrice = selSvcs.reduce((acc, id) => acc + (services.find((s) => s.id === id)?.price || 0), 0);
    return (
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 pt-8">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm text-center space-y-5"
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
            <ReminderPreference
              customerId={lastCustomerId}
              appointmentDate={format(selDate, "yyyy-MM-dd")}
              appointmentTime={selSlot}
              onSave={() => {}}
            />
          </div>
          <Button
            onClick={() => {
              setDone(false);
              onDoneChange(false);
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
                  {/* Filter: plan = only plan services, avulso = all */}
                  {services
                    .filter(svc => {
                      if (bookingType === "plan") return planServiceIds.has(svc.id);
                      return true; // avulso: show all
                    })
                    .map((svc, i) => {
                    const isSelected = selSvcs.includes(svc.id);
                    const isInPlan = planServiceIds.has(svc.id);
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
                        } ${bookingType === "avulso" && isInPlan ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}>
                            <Scissors className="h-5 w-5" />
                          </div>
                          <div>
                            <span className="font-medium">{svc.name}</span>
                            {bookingType === "avulso" && isInPlan && (
                              <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Incluso no plano</span>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className={isSelected ? "bg-primary/15 text-primary" : ""}>
                          R$ {Number(svc.price).toFixed(2)}
                        </Badge>
                      </motion.button>
                    );
                  })}
                  {services.filter(svc => bookingType !== "plan" || planServiceIds.has(svc.id)).length === 0 && (
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
                        const hasActiveSch = (schedules[selProf] || []).some((s) => s.day_of_week === d.getDay() && s.active);
                        const off = !hasActiveSch;
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
          {step === 0 ? (
            <Button variant="outline" onClick={onCancel} className="rounded-xl h-11 px-4 border-border/50 text-muted-foreground hover:text-foreground">
              Cancelar
            </Button>
          ) : (
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
    const { data: updated, error } = await (supabase as any).rpc("client_portal_cancel_appointment", { p_appointment_id: id });
    if (error) { toast.error("Erro ao cancelar agendamento"); return; }
    if (!updated) { toast.error("Agendamento já estava cancelado"); return; }
    toast.success("Agendamento cancelado");
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status: "cancelado" } : a));
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="h-9 w-9 rounded-xl overflow-hidden border border-primary/20 bg-card p-0.5"
        >
          <img src="/dv.jpg" alt="Carregando" className="h-full w-full object-cover rounded-lg" />
        </motion.div>
        <p className="text-[10px] text-muted-foreground/60 font-semibold tracking-wider uppercase animate-pulse">Buscando agendamentos...</p>
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
                  <div key={a.id} className="bg-card rounded-2xl border border-border/20 overflow-hidden hover:border-border/40 hover:shadow-sm transition-all duration-200">
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

function ProfileScreen({ session, onLogout, pushEnabled, onTogglePush, onForcePush }: { session: Session; onLogout: () => void; pushEnabled: boolean; onTogglePush: () => Promise<void>; onForcePush: () => Promise<void> }) {
  return (
    <div className="px-4 pt-2 pb-6 space-y-4">
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

        {/* Push notifications toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border/40 p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Notificações</p>
              <p className="text-xs text-muted-foreground">Receber lembretes e avisos</p>
            </div>
          </div>
          <button
            onClick={onTogglePush}
            className={`relative w-12 h-7 rounded-full transition-colors ${pushEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${pushEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <Button size="sm" variant="outline" onClick={onForcePush} className="h-7 text-[10px] px-2 ml-2 rounded-lg">
            Reinscrever
          </Button>
        </motion.div>

        {/* App version */}
        <p className="text-center text-[10px] text-muted-foreground/50 pt-2">
          v{APP_VERSION}
        </p>

      </motion.div>
    </div>
  );
}

/* ===================================================================
   MAIN — CLIENT PORTAL
   =================================================================== */

export default function ClientPortal() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.user_id && parsed.customer_id && parsed.name) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("inicio");
  const [bookDone, setBookDone] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmAppt, setConfirmAppt] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);

  /* Detect confirm_appt in URL */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const confirmApptId = params.get("confirm_appt");
    if (confirmApptId) {
      window.history.replaceState({}, document.title, window.location.pathname);
      (async () => {
        const { data } = await supabase
          .from("appointments")
          .select("id, date, start_time, status, service:services(name), professional:professionals(name)")
          .eq("id", confirmApptId)
          .maybeSingle();
        if (data) {
          setConfirmAppt(data);
        }
      })();
    }
  }, []);

  /* Listen to notification click messages when app is already open */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICK" && event.data?.url) {
        const urlObj = new URL(event.data.url);
        const confirmApptId = urlObj.searchParams.get("confirm_appt");
        if (confirmApptId) {
          (async () => {
            const { data } = await supabase
              .from("appointments")
              .select("id, date, start_time, status, service:services(name), professional:professionals(name)")
              .eq("id", confirmApptId)
              .maybeSingle();
            if (data) {
              setConfirmAppt(data);
            }
          })();
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", handleMessage);
  }, []);
  const [pushEnabled, setPushEnabled] = useState(() => {
    // Only auto-enable if permission was already granted
    if (typeof Notification === "undefined") return false;
    return Notification.permission === "granted";
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  /* Restore session */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate required fields to avoid crashes with stale sessions
        if (parsed && parsed.user_id && parsed.customer_id && parsed.name) {
          setSession(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Force SW update on load
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.update());
      });
    }
  }, []);

  /* Fetch appointments */
  const refreshAll = useCallback(async () => {
    if (!session) return;
    const [aRes, sRes] = await Promise.all([
      (supabase as any).rpc("client_portal_appointments", { p_customer_id: session.customer_id }),
      (supabase as any).rpc("client_portal_refresh", { p_customer_id: session.customer_id }),
    ]);
    if (aRes.data) setAppointments(aRes.data as Appointment[]);
    if (sRes.data?.[0]) {
      setSession(sRes.data[0] as Session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sRes.data[0]));
    }
  }, [session]);

  const fetchAppts = useMemo(() => () => refreshAll(), [refreshAll]);

  useEffect(() => { fetchAppts(); }, [fetchAppts]);

  const { pullDistance, refreshing } = usePullToRefresh({
    onRefresh: refreshAll,
    disabled: activeTab === "agendar",
  });

  // Fetch unread notification count
  useEffect(() => {
    if (!session?.customer_id) return;
    const fetch = async () => {
      const { data } = await (supabase as any).rpc("client_unread_count", { p_customer_id: session.customer_id });
      if (typeof data === "number") setUnreadCount(data);
    };
    fetch();
    const interval = setInterval(fetch, 30000); // every 30s
    return () => clearInterval(interval);
  }, [session?.customer_id]);

  // Lock body scroll when notification dialog is open
  useEffect(() => {
    if (notifOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [notifOpen]);

  const forceSubscribe = async () => {
    if (!session?.customer_id || !session?.user_id) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      // Unsubscribe old
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        // Delete ALL old subscriptions for this customer from DB
        await (supabase as any).from("push_subscriptions").delete().eq("customer_id", session.customer_id);
      } else {
        // Clean up any orphaned subscriptions
        await (supabase as any).from("push_subscriptions").delete().eq("customer_id", session.customer_id);
      }
      // Subscribe fresh
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: (() => { const k = import.meta.env.VITE_VAPID_PUBLIC_KEY || ""; const p = "=".repeat((4 - k.length % 4) % 4); const b = (k + p).replace(/-/g, "+").replace(/_/g, "/"); const r = atob(b); return new Uint8Array(r.length).map((_, i) => r.charCodeAt(i)); })(),
      });
      const json = sub.toJSON();
      console.log("[PUSH DEBUG] Subscription created:", {
        endpoint: json.endpoint?.slice(0, 80) + "...",
        p256dh: (json.keys as any)?.p256dh?.slice(0, 20) + "...",
        auth: (json.keys as any)?.auth?.slice(0, 20) + "...",
        vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY?.slice(0, 40) + "...",
      });
      await (supabase as any).from("push_subscriptions").insert({
        customer_id: session.customer_id,
        user_id: session.user_id,
        endpoint: json.endpoint,
        p256dh_key: (json.keys as any)?.p256dh || "",
        auth_key: (json.keys as any)?.auth || "",
      });
      toast.success("✅ Push ativado! Você receberá notificações.");
    } catch (e: any) {
      toast.error(e.name === "NotAllowedError" ? "Permissão negada. Ative nas configurações." : "Erro: " + e.message);
    }
  };

  const openNotifications = async () => {
    if (!session?.customer_id) return;
    const { data } = await (supabase as any).rpc("client_notifications_list", { p_customer_id: session.customer_id });
    if (data) setNotifications(data);
    setNotifOpen(true);
  };

  const markAllRead = async () => {
    if (!session?.customer_id) return;
    await (supabase as any).rpc("client_mark_all_read", { p_customer_id: session.customer_id });
    setUnreadCount(0);
    setNotifications((prev: any[]) => prev.map((n: any) => ({ ...n, read: true })));
  };

  // Push notifications — auto-subscribe when logged in
  const pushSub = usePushSubscription(
    session?.customer_id,
    session?.user_id,
    !!session && pushEnabled
  );

  const handleLogin = (s: Session) => setSession(s);
  const handleLogout = () => {
    pushSub.unsubscribe();
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setActiveTab("inicio");
    toast.success("Você saiu da sua conta");
  };

  if (confirmAppt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-card w-full max-w-md rounded-3xl border border-border/50 p-6 shadow-2xl relative overflow-hidden"
        >
          {/* Premium bar header */}
          <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
          
          <h3 className="text-xl font-bold text-center tracking-tight mb-2">
            Confirmar Presença
          </h3>
          
          <p className="text-sm text-muted-foreground text-center mb-6">
            Por favor, confirme se você comparecerá ao seu horário.
          </p>

          {/* Info Card */}
          <div className="bg-muted/40 border border-border/30 rounded-2xl p-4 mb-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Profissional</span>
              <span className="font-semibold">{confirmAppt.professional?.name || "Qualquer"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Serviço</span>
              <span className="font-semibold">{confirmAppt.service?.name || "Corte"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Data e Hora</span>
              <span className="font-semibold text-primary">
                {format(new Date(confirmAppt.date + "T00:00:00"), "dd/MM/yyyy")} às {confirmAppt.start_time.slice(0, 5)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status Atual</span>
              <Badge variant={confirmAppt.status === "confirmado" ? "default" : "secondary"}>
                {confirmAppt.status === "confirmado" ? "Confirmado" : 
                 confirmAppt.status === "cancelado" ? "Cancelado" : "Pendente"}
              </Badge>
            </div>
          </div>

          {confirmAppt.status === "cancelado" ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-destructive font-medium">Este agendamento já foi cancelado.</p>
              <Button onClick={() => setConfirmAppt(null)} className="w-full rounded-2xl h-11">
                Ir para o Portal
              </Button>
            </div>
          ) : confirmAppt.status === "confirmado" ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-emerald-500 font-medium">Este agendamento já está confirmado!</p>
              <Button onClick={() => setConfirmAppt(null)} className="w-full rounded-2xl h-11">
                Ir para o Portal
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                onClick={async () => {
                  setConfirming(true);
                  const { data, error } = await (supabase as any).rpc("client_portal_cancel_appointment", { p_appointment_id: confirmAppt.id });
                  setConfirming(false);
                  if (error) {
                    toast.error("Erro ao cancelar agendamento");
                  } else {
                    toast.success("Agendamento cancelado com sucesso");
                    setConfirmAppt({ ...confirmAppt, status: "cancelado" });
                  }
                }}
                variant="outline"
                disabled={confirming}
                className="flex-1 rounded-2xl h-12 text-destructive border-destructive/20 hover:bg-destructive/5"
              >
                Não vou
              </Button>
              
              <Button
                onClick={async () => {
                  setConfirming(true);
                  const { data, error } = await (supabase as any).rpc("client_confirm_appointment", { p_appointment_id: confirmAppt.id });
                  setConfirming(false);
                  if (error || !data) {
                    toast.error("Erro ao confirmar agendamento");
                  } else {
                    toast.success("Presença confirmada!");
                    setConfirmAppt({ ...confirmAppt, status: "confirmado" });
                  }
                }}
                disabled={confirming}
                className="flex-1 rounded-2xl h-12 font-semibold"
              >
                Confirmar
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (!session) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden theme-client">
      {/* Header */}
      <header className="flex-shrink-0 bg-background/60 backdrop-blur-2xl border-b border-border/20 z-20">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg overflow-hidden border border-border/40 shadow-sm shrink-0 bg-card">
              <img src="/dv.jpg" alt="Logo Dom Vere" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none text-foreground">{session.shop_name}</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Área do Cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <Badge variant="outline" className="text-[10px] gap-1 h-6 rounded-lg border-border/30">
              <CreditCard className="h-3 w-3" /> {session.credit_balance}
            </Badge>
            <button onClick={openNotifications} className="relative h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold min-w-[15px] h-[15px] flex items-center justify-center rounded-full ring-2 ring-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button onClick={handleLogout} className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Notification permission prompt */}
      {session && typeof Notification !== "undefined" && Notification.permission === "default" && (
        <div className="flex-shrink-0 bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-b border-purple-500/10">
          <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-3 cursor-pointer" onClick={async () => {
            const result = await Notification.requestPermission();
            if (result === "granted") {
              setPushEnabled(true);
              localStorage.setItem(PUSH_ENABLED_KEY, "true");
              toast.success("Notificações ativadas! 🔔");
            }
          }}>
            <Bell className="h-4 w-4 text-purple-500 shrink-0" />
            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 flex-1">Toque aqui para receber notificações</p>
            <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-medium">Ativar</span>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={`flex-1 max-w-lg mx-auto w-full min-h-0 flex flex-col ${activeTab !== "agendar" ? "overflow-y-auto" : ""}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
            className={activeTab === "agendar" ? "flex-1 flex flex-col min-h-0" : ""}
          >
            {/* Pull-to-refresh indicator */}
            {(pullDistance > 0 || refreshing) && (
              <div
                className="flex items-center justify-center text-primary flex-shrink-0"
                style={{ height: `${pullDistance}px`, opacity: pullDistance / 70 }}
              >
                <motion.div
                  animate={{ rotate: refreshing ? 360 : 0 }}
                  transition={{ repeat: refreshing ? Infinity : 0, duration: 1, ease: "linear" }}
                  className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full"
                />
              </div>
            )}
            {activeTab === "inicio" && <HomeScreen key={`home-${refreshKey}`} session={session} appointments={appointments} onTabChange={setActiveTab} />}
            {activeTab === "agendar" && <BookScreen session={session} onDone={fetchAppts} onCancel={() => setActiveTab("inicio")} onDoneChange={setBookDone} />}
            {activeTab === "agenda" && <AppointmentsScreen key={`appts-${refreshKey}`} session={session} />}
            {activeTab === "perfil" && <ProfileScreen session={session} onLogout={handleLogout} pushEnabled={pushEnabled} onForcePush={forceSubscribe} onTogglePush={async () => {
              if (!pushEnabled) {
                const result = await Notification.requestPermission();
                if (result === "granted") {
                  setPushEnabled(true);
                  localStorage.setItem(PUSH_ENABLED_KEY, "true");
                  toast.success("Notificações ativadas! 🔔");
                } else if (result === "denied") {
                  toast.error("Permissão negada. Ative nas configurações do navegador.");
                }
              } else {
                setPushEnabled(false);
                localStorage.setItem(PUSH_ENABLED_KEY, "false");
                toast.info("Notificações desativadas");
              }
            }} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom tab bar — visible unless actively booking (hidden only during booking steps, shown on success screen) */}
      {!(activeTab === "agendar" && !bookDone) && (
        <nav className="shrink-0 bg-background/60 backdrop-blur-2xl border-t border-border/20 safe-area-bottom">
          <div className="max-w-lg mx-auto flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center py-2 transition-all ${
                    active ? "text-primary" : "text-muted-foreground/40"
                  }`}
                >
                  <Icon className={`h-5 w-5 mb-0.5 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
                  <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Notifications dialog */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center overflow-hidden" onClick={() => setNotifOpen(false)}>
          <div className="bg-card w-full sm:max-w-md sm:rounded-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-8 overflow-hidden overscroll-contain" onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <h3 className="font-semibold">Notificações</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary font-medium">Marcar tudo como lido</button>
                )}
                <button onClick={() => setNotifOpen(false)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((n: any) => (
                  <NotifItem key={n.id} n={n} setNotifications={setNotifications} setUnreadCount={setUnreadCount} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
