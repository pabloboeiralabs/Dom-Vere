import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { format, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  Scissors,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  CalendarDays,
  Sparkles,
  History,
  Info,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import ReminderPreference from "@/components/ReminderPreference";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface Professional {
  id: string;
  name: string;
  photo_url: string | null;
}
interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}
interface Schedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}
interface SlotInfo {
  time: string;
  available: boolean;
}

const STEPS = ["login", "professional", "service", "datetime", "info", "history"] as const;
type Step = (typeof STEPS)[number];

const stepMeta: Record<Step, { icon: any; title: string; subtitle: string }> = {
  login: {
    icon: User,
    title: "Bem-vindo!",
    subtitle: "Você já tem cadastro na Dom Vere?",
  },
  professional: {
    icon: Scissors,
    title: "Escolha o Profissional",
    subtitle: "Quem você prefere?",
  },
  service: {
    icon: Sparkles,
    title: "Escolha o Serviço",
    subtitle: "O que deseja fazer?",
  },
  datetime: {
    icon: CalendarDays,
    title: "Data e Horário",
    subtitle: "Quando fica melhor pra você?",
  },
  info: {
    icon: User,
    title: "Seus Dados",
    subtitle: "Informe nome e telefone. Se já tem cadastro, seus dados serao carregados!",
  },
  history: {
    icon: History,
    title: "Seu Histórico",
    subtitle: "Veja seus agendamentos anteriores",
  },
};

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -300 : 300,
    opacity: 0,
    scale: 0.95,
  }),
};

export default function Booking({ userId: propUserId }: { userId?: string } = {}) {
  const { userId: paramUserId } = useParams<{ userId: string }>();
  const userId = propUserId || paramUserId;

  // Validate UUID format early
  const isValidUserId = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  const [shopName, setShopName] = useState("Barbearia");
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [schedules, setSchedules] = useState<Record<string, Schedule[]>>({});
  const [selectedProf, setSelectedProf] = useState(() => localStorage.getItem("booking_selectedProf") || "");
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("booking_selectedServices") || "[]"); } catch { return []; }
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const s = localStorage.getItem("booking_selectedDate");
    return s ? new Date(s) : new Date();
  });
  const [availableSlots, setAvailableSlots] = useState<SlotInfo[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(() => localStorage.getItem("booking_selectedSlot") || "");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerBirthDate, setCustomerBirthDate] = useState(() => localStorage.getItem("booking_birthDate") || "");
  const [loginMode, setLoginMode] = useState<"" | "login" | "register" | "guest">(() => (localStorage.getItem("booking_loginMode") as "" | "login" | "register" | "guest") || "");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [bookedCustomerId, setBookedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [step, setStep] = useState(() => {
    const s = parseInt(localStorage.getItem("booking_step") || "0", 10);
    return Number.isNaN(s) ? 0 : Math.min(Math.max(s, 0), STEPS.length - 1);
  });
  const [direction, setDirection] = useState(1);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)),
    []
  );

  useEffect(() => {
    const savedName = localStorage.getItem("customerName");
    const savedPhone = localStorage.getItem("customerPhone");
    if (savedName) setCustomerName(savedName);
    if (savedPhone) setCustomerPhone(savedPhone);
  }, []);

  // Persistir o progresso do agendamento (sobrevive a reload)
  useEffect(() => {
    localStorage.setItem("booking_step", String(step));
    localStorage.setItem("booking_loginMode", loginMode);
    localStorage.setItem("booking_selectedProf", selectedProf);
    localStorage.setItem("booking_selectedServices", JSON.stringify(selectedServices));
    localStorage.setItem("booking_selectedDate", selectedDate.toISOString());
    localStorage.setItem("booking_selectedSlot", selectedSlot);
    localStorage.setItem("booking_birthDate", customerBirthDate);
  }, [step, loginMode, selectedProf, selectedServices, selectedDate, selectedSlot, customerBirthDate]);

  const currentStep = STEPS[step];

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);
    if (!userId) { setLoading(false); clearTimeout(timeout); return; }
    const load = async () => {
      try {
        const [settingsRes, profsRes, servsRes] = await Promise.all([
          supabase
            .from("settings")
            .select("shop_name")
            .eq("user_id", userId)
            .single(),
          supabase
            .from("professionals")
            .select("id, name, photo_url")
            .eq("user_id", userId)
            .eq("active", true)
            .order("name"),
          supabase
            .from("services")
            .select("id, name, price")
            .eq("user_id", userId)
            .eq("active", true)
            .order("name"),
        ]);

        if (settingsRes.data?.shop_name) setShopName(settingsRes.data.shop_name);
        const profs = profsRes.data || [];
        setProfessionals(profs as Professional[]);
        setServices((servsRes.data || []) as Service[]);

        if (profs.length > 0) {
          const profIds = profs.map((p: any) => p.id);
          const { data: schRows } = await supabase
            .from("professional_schedules")
            .select(
              "professional_id, day_of_week, start_time, end_time, active"
            )
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
        clearTimeout(timeout);
        setLoading(false);
      }
    };
    load();
    return () => clearTimeout(timeout);
  }, [userId]);

  useEffect(() => {
    if (!selectedProf) {
      setAvailableSlots([]);
      return;
    }
    let daySchedules = (schedules[selectedProf] || []).filter(
      (s) => s.day_of_week === selectedDate.getDay() && s.active
    );
    // Fallback: if no schedules configured at all, use default 08:00-18:00
    if (daySchedules.length === 0) {
      const allSchedules = schedules[selectedProf] || [];
      if (allSchedules.length === 0) {
        daySchedules = [{ day_of_week: selectedDate.getDay(), start_time: "08:00", end_time: "18:00", active: true }];
      } else {
        setAvailableSlots([]);
        return;
      }
    }

    const loadSlots = async () => {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const { data: existingAppts } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("professional_id", selectedProf)
        .eq("date", dateStr)
        .neq("status", "cancelado");

      const occupiedMinutes = new Set<number>();
      for (const a of existingAppts || []) {
        const [sh, sm] = (a.start_time || "").split(":").map(Number);
        const [eh, em] = (a.end_time || "").split(":").map(Number);
        let c = sh * 60 + (sm || 0);
        const end = eh * 60 + (em || 0);
        while (c < end) {
          occupiedMinutes.add(c);
          c += 30;
        }
      }

      const slots: SlotInfo[] = [];
      const now = new Date();
      const isToday = isSameDay(selectedDate, now);
      // Iterate ALL schedule blocks for this day
      for (const daySchedule of daySchedules) {
        const [sh, sm] = daySchedule.start_time.split(":").map(Number);
        const [eh, em] = daySchedule.end_time.split(":").map(Number);
        let current = sh * 60 + (sm || 0);
        const endMin = eh * 60 + (em || 0);
        while (current < endMin) {
          const h = Math.floor(current / 60);
          const m = current % 60;
          const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          const isPast = isToday && h * 60 + m <= now.getHours() * 60 + now.getMinutes();
          slots.push({ time: timeStr, available: !occupiedMinutes.has(current) && !isPast });
          current += 30;
        }
      }
      setAvailableSlots(slots);
      setSelectedSlot("");
    };
    loadSlots();
  }, [selectedProf, selectedDate, schedules]);

  const loadUserHistory = async () => {
    if (!customerPhone.trim() || !userId) return;
    setLoadingHistory(true);
    try {
      const { data: customerData } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", userId)
        .eq("phone", customerPhone.trim())
        .maybeSingle();

      if (customerData) {
        const { data: appointments } = await supabase
          .from("appointments")
          .select("*, professionals(name, photo_url), services(name)")
          .eq("customer_id", customerData.id)
          .order("date", { ascending: false })
          .limit(10);
        setUserHistory(appointments || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (currentStep === "history") {
      loadUserHistory();
    }
  }, [currentStep]);

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const canProceed = () => {
    switch (currentStep) {
      case "login":
        return !!loginMode;
      case "professional":
        return !!selectedProf;
      case "service":
        return selectedServices.length > 0;
      case "datetime":
        return !!selectedSlot;
      case "info":
        return !!customerName.trim();
    }
  };

  const handleBook = async () => {
    console.log("[booking] handleBook called", { userId, selectedProf, selectedSlot, customerName, selectedServices });
    if (!userId || !selectedProf || !selectedSlot || !customerName.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setBooking(true);
    try {
      // Normaliza telefone (remove máscara) para casar com o que está no banco
      const normalizedPhone = customerPhone.replace(/\D/g, "");

      let customerId: string;
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", userId)
        .eq("phone", normalizedPhone)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        customerId = existing[0].id;
      } else {
        const { data: newC, error } = await supabase
          .from("customers")
          .insert({
            user_id: userId,
            name: customerName.trim(),
            phone: normalizedPhone,
          })
          .select("id")
          .single();
        if (error) throw error;
        customerId = newC!.id;
      }

      const [sh, sm] = selectedSlot.split(":").map(Number);
      // Calculate total duration from selected services (use max duration)
      const totalDuration = selectedServices.reduce((max, id) => {
        const svc = services.find(s => s.id === id);
        return Math.max(max, svc?.duration_minutes || 30);
      }, 30);
      const endMin = sh * 60 + sm + totalDuration;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

      const { error } = await supabase.from("appointments").insert({
        user_id: userId,
        professional_id: selectedProf,
        customer_id: customerId,
        service_id: selectedServices[0] || null,
        date: format(selectedDate, "yyyy-MM-dd"),
        start_time: selectedSlot,
        end_time: endTime,
        notes: selectedServices.length > 1 ? "Agendamento online - Serviços: " + selectedServices.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(", ") : "Agendamento online",
      });
      if (error) throw error;
      console.log("[booking] setBookedCustomerId:", customerId); setBookedCustomerId(customerId);

      // Notify professional via WhatsApp (fire and forget)
      const svcName = selectedServices.map(id => services.find((s: any) => s.id === id)?.name).filter(Boolean).join(", ");
      supabase.functions.invoke("notify-professional", {
        body: {
          professional_id: selectedProf,
          user_id: userId,
          customer_name: customerName.trim(),
          service_name: svcName,
          date: format(selectedDate, "yyyy-MM-dd"),
          start_time: selectedSlot,
        },
      }).catch(() => {});

      localStorage.setItem("customerName", customerName.trim());
      localStorage.setItem("customerPhone", customerPhone.trim());
      // Limpa o progresso do agendamento (novo agendamento começa do zero)
      ["booking_step", "booking_loginMode", "booking_selectedProf", "booking_selectedServices", "booking_selectedDate", "booking_selectedSlot", "booking_birthDate"].forEach(k => localStorage.removeItem(k));
      setBooked(true);
      toast.success("Agendamento realizado com sucesso!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBooking(false);
    }
  };

  const { pullDistance, refreshing } = usePullToRefresh({
    onRefresh: () => window.location.reload(),
    disabled: booked,
  });

  // Invalid or missing user ID
  if (!isValidUserId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔗</span>
          </div>
          <h1 className="text-xl font-bold mb-2">Link inválido</h1>
          <p className="text-muted-foreground text-sm">
            O link de agendamento está incorreto ou incompleto. Peça um novo link para a barbearia.
          </p>
        </div>
      </div>
    );
  }

  if (booked) {
    const selectedProfObj = professionals.find((p) => p.id === selectedProf);
    return (
      <div className="min-h-screen overflow-y-auto bg-gradient-to-br from-background via-background to-primary/5 p-4 pt-8">
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || refreshing) && (
          <div
            className="flex items-center justify-center text-primary"
            style={{ height: `${pullDistance}px`, opacity: pullDistance / 70 }}
          >
            <motion.div
              animate={{ rotate: refreshing ? 360 : 0 }}
              transition={{ repeat: refreshing ? Infinity : 0, duration: 1, ease: "linear" }}
              className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full"
            />
          </div>
        )}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20 }}
          className="max-w-md w-full mx-auto rounded-3xl bg-card border border-border/50 shadow-2xl p-6 sm:p-8 text-center space-y-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 15 }}
            className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto"
          >
            <Check className="h-10 w-10 text-green-500" />
          </motion.div>
          <div className="space-y-1">
            <h2 className="text-3xl font-bold text-foreground">Confirmado!</h2>
            <p className="text-muted-foreground">Seu agendamento está pronto</p>
          </div>
          <div className="bg-muted/50 rounded-2xl p-5 space-y-3 text-left">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="text-foreground font-medium">
                {format(selectedDate, "dd 'de' MMMM, EEEE", { locale: ptBR })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="text-foreground font-medium">{selectedSlot}</span>
            </div>
            {selectedProfObj && (
              <div className="flex items-center gap-3">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={selectedProfObj.photo_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {selectedProfObj.name[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-foreground font-medium">
                  {selectedProfObj.name}
                </span>
              </div>
            )}
            {selectedServices.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Scissors className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-foreground font-medium text-sm">
                    {selectedServices.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(", ")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Reminder Preference */}
          {bookedCustomerId && (
            <div className="bg-muted/30 rounded-2xl p-5">
              <ReminderPreference customerId={bookedCustomerId}
                appointmentDate={format(selectedDate, "yyyy-MM-dd")}
                appointmentTime={selectedSlot} />
            </div>
          )}

          <Button
            onClick={() => {
              setBooked(false);
              setSelectedSlot("");
              setStep(0);
            }}
            variant="outline"
            className="rounded-xl"
          >
            Fazer outro agendamento
          </Button>
        </motion.div>
      </div>
    );
  }

  const progress = ((step) / (STEPS.length - 1)) * 100;
  const StepIcon = stepMeta[currentStep].icon;

  return (
    <div className="h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Header */}
      <div className="pt-8 pb-4 px-4 flex items-center justify-between">
        <div className="w-10" /> {/* Spacer */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="space-y-1 text-center"
        >
          <Scissors className="h-8 w-8 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{shopName}</h1>
        </motion.div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setStep(4)}
            className={`rounded-full ${step === 4 ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
          >
            <History className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pb-2">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => {
            const Icon = stepMeta[s].icon;
            return (
              <motion.div
                key={s}
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 ${
                  i <= step
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}
                animate={{ scale: i === step ? 1.15 : 1 }}
              >
                <Icon className="h-4 w-4" />
              </motion.div>
            );
          })}
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Step title */}
      <div className="px-6 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-0.5"
          >
            <h2 className="text-xl font-bold text-foreground">
              {stepMeta[currentStep].title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {stepMeta[currentStep].subtitle}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 px-4 pb-4 overflow-x-hidden overflow-y-auto relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full"
          >
            {currentStep === "login" && !loginMode && (
              <div className="space-y-4 py-6">
                <button onClick={() => window.location.href = "/cliente"}
                  className="w-full rounded-2xl border-2 border-primary/30 p-5 text-left hover:border-primary hover:bg-primary/5 transition-all group">
                  <p className="font-bold text-lg">🔑 Já tenho cadastro</p>
                  <p className="text-sm text-muted-foreground mt-1 group-hover:text-foreground transition-colors">Fazer login no App do Cliente →</p>
                </button>
                <button onClick={() => setLoginMode("register")}
                  className="w-full rounded-2xl border-2 border-border p-5 text-left hover:border-primary/50 hover:bg-muted/50 transition-all group">
                  <p className="font-bold text-lg">📝 Novo por aqui</p>
                  <p className="text-sm text-muted-foreground mt-1 group-hover:text-foreground transition-colors">Criar meu cadastro →</p>
                </button>
                <button onClick={() => { setLoginMode("guest"); goNext(); }}
                  className="w-full rounded-2xl border-2 border-border p-5 text-left hover:border-primary/50 hover:bg-muted/50 transition-all group">
                  <p className="font-bold text-lg">👤 Sem cadastro</p>
                  <p className="text-sm text-muted-foreground mt-1 group-hover:text-foreground transition-colors">Agendar como visitante →</p>
                </button>
              </div>
            )}
            {currentStep === "login" && loginMode === "register" && (
              <div className="space-y-5 py-6">
                <div className="rounded-2xl border-2 border-border p-6 space-y-4 bg-card shadow-sm">
                  <p className="font-medium text-base">📝 Criar Cadastro</p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Nome completo *</label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Seu nome" className="rounded-xl h-12 text-base" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Telefone (WhatsApp) *</label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" className="rounded-xl h-12 text-base" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Data de nascimento</label>
                    <Input type="date" value={customerBirthDate} onChange={e => setCustomerBirthDate(e.target.value)} className="rounded-xl h-12 text-base" />
                  </div>
                  {loginError && <p className="text-sm text-destructive bg-destructive/5 p-3 rounded-xl">{loginError}</p>}
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => { setLoginMode(""); setLoginError(""); }} className="flex-1 rounded-xl h-12 text-sm">Voltar</Button>
                    <Button disabled={!customerName || !customerPhone || loggingIn} onClick={async () => {
                      setLoggingIn(true); setLoginError("");
                      const { data: existing } = await supabase.from("customers").select("id").eq("user_id", userId).eq("phone", customerPhone.trim()).maybeSingle();
                      if (existing) setLoginError("Este telefone já está cadastrado!");
                      else {
                        const { data: newC, error } = await supabase.from("customers").insert({ user_id: userId, name: customerName.trim(), phone: customerPhone.trim(), birth_date: customerBirthDate || null }).select("id, name, phone").single();
                        if (newC) { setCustomerName(newC.name); setCustomerPhone(newC.phone); toast.success("Cadastro criado com sucesso!"); goNext(); }
                        else setLoginError(error?.message || "Erro ao cadastrar.");
                      }
                      setLoggingIn(false);
                    }} className="flex-1 rounded-xl h-12 text-sm">Cadastrar e Continuar</Button>
                  </div>
                </div>
              </div>
            )}
            {currentStep === "professional" && (
              <div className="grid grid-cols-2 gap-3">
                {professionals.map((p, i) => (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => {
                      setSelectedProf(p.id);
                      setTimeout(goNext, 300);
                    }}
                    className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-200 ${
                      selectedProf === p.id
                        ? "border-primary shadow-lg shadow-primary/20 scale-[1.02]"
                        : "border-border/50 hover:border-primary/50"
                    }`}
                  >
                    <div className="aspect-[3/4] relative bg-muted">
                      {p.photo_url ? (
                        <img
                          src={p.photo_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                          <span className="text-4xl font-bold text-primary/40">
                            {p.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        </div>
                      )}
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      {/* Name at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white font-semibold text-sm text-left">
                          {p.name}
                        </p>
                      </div>
                      {/* Selected badge */}
                      {selectedProf === p.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg"
                        >
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </motion.div>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {currentStep === "service" && (
              <div className="space-y-2">
                {services.map((s, i) => (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => {
                      if (selectedServices.includes(s.id)) {
                        setSelectedServices(prev => prev.filter(id => id !== s.id));
                      } else {
                        setSelectedServices(prev => [...prev, s.id]);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                      selectedServices.includes(s.id)
                        ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                        : "border-border/50 bg-card hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          selectedServices.includes(s.id)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Scissors className="h-5 w-5" />
                      </div>
                      <span
                        className={`font-medium ${
                          selectedServices.includes(s.id)
                            ? "text-foreground"
                            : "text-foreground/80"
                        }`}
                      >
                        {s.name}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-sm px-3 py-1"
                    >
                      R$ {Number(s.price).toFixed(2)}
                    </Badge>
                  </motion.button>
                ))}
                {selectedServices.length > 0 && services.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={goNext}
                    className="w-full mt-4 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/30"
                  >
                    Continuar ({selectedServices.length} serviço{selectedServices.length > 1 ? "s" : ""}) →
                  </motion.button>
                )}
              </div>
            )}

            {currentStep === "datetime" && (
              <div className="space-y-5">
                {/* Date picker carousel */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    Escolha o dia
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                    {days.map((d, i) => {
                      const sch = schedules[selectedProf]?.find(
                        (s) => s.day_of_week === d.getDay()
                      );
                      const isOff = !sch || !sch.active;
                      const isSelected = isSameDay(d, selectedDate);
                      return (
                        <motion.button
                          key={d.toISOString()}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          disabled={isOff}
                          onClick={() => setSelectedDate(d)}
                          className={`snap-start flex-shrink-0 flex flex-col items-center py-3 px-3.5 rounded-2xl border-2 transition-all min-w-[60px] ${
                            isOff
                              ? "opacity-30 border-transparent"
                              : isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                              : "border-border/50 bg-card hover:border-primary/50"
                          }`}
                        >
                          <span
                            className={`text-[10px] uppercase font-semibold ${
                              isSelected
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {format(d, "EEE", { locale: ptBR })}
                          </span>
                          <span className="text-xl font-bold leading-tight">
                            {format(d, "dd")}
                          </span>
                          <span
                            className={`text-[10px] ${
                              isSelected
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {format(d, "MMM", { locale: ptBR })}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Time slots */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    Horários disponíveis
                  </p>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots.map((s, i) => (
                        <motion.button
                          key={s.time}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.02 }}
                          disabled={!s.available}
                          onClick={() => setSelectedSlot(s.time)}
                          className={`py-2.5 px-2 rounded-xl text-sm font-medium border-2 transition-all ${
                            !s.available
                              ? "opacity-20 border-transparent bg-muted line-through text-muted-foreground"
                              : selectedSlot === s.time
                              ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                              : "border-border/50 bg-card hover:border-primary/50 text-foreground"
                          }`}
                        >
                          {s.time}
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">
                        Sem horários disponíveis neste dia
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === "info" && (
              <div className="space-y-4">
                {/* Summary card */}
                <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Resumo
                  </p>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={
                          professionals.find((p) => p.id === selectedProf)
                            ?.photo_url || undefined
                        }
                      />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {professionals
                          .find((p) => p.id === selectedProf)
                          ?.name[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {professionals.find((p) => p.id === selectedProf)?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedServices.map(id => services.find((s) => s.id === id)?.name).filter(Boolean).join(", ") ||
                          "Serviço"}{" "}
                        •{" "}
                        {format(selectedDate, "dd/MM", { locale: ptBR })} às{" "}
                        {selectedSlot}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      Nome completo *
                    </label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Como podemos te chamar?"
                      className="rounded-xl h-12 text-base"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      Telefone
                    </label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="rounded-xl h-12 text-base"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === "history" && (
              <div className="space-y-4">
                {loadingHistory ? (
                  <div className="flex justify-center py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full"
                    />
                  </div>
                ) : userHistory.length > 0 ? (
                  <div className="space-y-3">
                    {userHistory.map((appt, i) => (
                      <motion.div
                        key={appt.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-card rounded-2xl border border-border/50 p-4 space-y-2 shadow-sm"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-foreground">
                              {appt.services?.name || "Serviço"}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <CalendarDays className="h-3 w-3" />
                              {format(new Date(appt.date + "T12:00:00"), "dd/MM/yyyy")}
                              <span className="mx-1">•</span>
                              <Clock className="h-3 w-3" />
                              {appt.start_time.slice(0, 5)}
                            </div>
                          </div>
                          <Badge
                            className={`text-[10px] ${
                              appt.status === "concluido"
                                ? "bg-green-500/10 text-green-500 border-green-500/20"
                                : appt.status === "cancelado"
                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                : "bg-primary/10 text-primary border-primary/20"
                            }`}
                          >
                            {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 pt-1 border-t border-border/30 mt-1">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={appt.professionals?.photo_url} />
                            <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                              {appt.professionals?.name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Profissional: {appt.professionals?.name}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border/50">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="text-muted-foreground font-medium">
                      Nenhum agendamento encontrado
                    </p>
                    <p className="text-xs text-muted-foreground/60 px-6 mt-1">
                      Certifique-se de usar o mesmo telefone informado nos agendamentos.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/50 p-4 pb-6 safe-area-bottom">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={goBack}
              className="rounded-xl h-12 px-4"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {currentStep === "info" ? (
            <Button
              onClick={handleBook}
              disabled={booking || !customerName.trim()}
              className="flex-1 rounded-xl h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/30"
            >
              {booking ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full"
                />
              ) : (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  Confirmar Agendamento
                </>
              )}
            </Button>
          ) : currentStep === "history" ? (
            <Button
              onClick={() => setStep(0)}
              className="flex-1 rounded-xl h-12 text-base font-semibold"
            >
              Novo Agendamento
              <Plus className="h-5 w-5 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!canProceed()}
              className="flex-1 rounded-xl h-12 text-base font-semibold"
            >
              Continuar
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
