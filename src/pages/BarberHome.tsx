import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, CalendarDays, Clock, DollarSign, Scissors, Home, User, LogOut, X, Sparkles, Trash2, Plus, ChevronDown } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ScheduleEditor } from "@/components/ScheduleEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── Helpers ──
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

async function enrichAppointments(appts: any[]) {
  const cIds = [...new Set(appts.map(a => a.customer_id).filter(Boolean))];
  const sIds = [...new Set(appts.map(a => a.service_id).filter(Boolean))];
  const [cR, sR] = await Promise.all([
    cIds.length ? supabase.from("customers").select("id,name").in("id", cIds) : { data: [] },
    sIds.length ? supabase.from("services").select("id,name,price").in("id", sIds) : { data: [] },
  ]);
  const cm = new Map((cR.data||[]).map((c:any) => [c.id, c.name]));
  const sm = new Map((sR.data||[]).map((s:any) => [s.id, { name: s.name, price: s.price }]));
  return appts.map(a => {
    const svc = sm.get(a.service_id);
    return {
      ...a,
      customer_name: cm.get(a.customer_id)||"—",
      service_name: svc?.name||"—",
      service_price: svc?.price || 0
    };
  });
}

const STATUS_COLORS: Record<string, string> = {
  agendado: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  confirmado: "bg-[#D4AF37]/10 text-[#F3C06B] border-[#D4AF37]/20",
  concluido: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelado: "bg-red-500/10 text-red-400 border-red-500/20",
  no_show: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const TABS = [
  { id: "home" as const, icon: Home, label: "Início" },
  { id: "hoje" as const, icon: CalendarDays, label: "Agendamentos" },
  { id: "semana" as const, icon: Clock, label: "Semana" },
  { id: "perfil" as const, icon: User, label: "Perfil" },
];

const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: any; icon: any; color: string }) => (
  <motion.div whileTap={{ scale: 0.97 }} className="bg-[#131B2E]/60 rounded-2xl border border-white/[0.06] p-4 text-center hover:border-[#D4AF37]/35 transition-all duration-200 shadow-sm relative overflow-hidden group">
    <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-white/[0.02] to-transparent rounded-bl-full" />
    <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mx-auto mb-2`}>
      <Icon className="h-5 w-5" />
    </div>
    <p className="text-xl font-bold tracking-tight text-[#F3C06B]">{value}</p>
    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{label}</p>
  </motion.div>
);

const ApptCard = ({ a, onUpdateStatus, onAddService, onCheckout }: { a: any; onUpdateStatus: (id: string, status: string) => Promise<void>; onAddService: (appt: any) => void; onCheckout: (appt: any) => void }) => (
  <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", damping: 20, stiffness: 200 }} className="flex gap-4 items-start relative pb-2 group">
    {/* Left timeline side */}
    <div className="flex flex-col items-center min-w-[50px] pt-1 relative self-stretch">
      <p className="text-sm font-bold text-[#F3C06B] tracking-tight">{a.start_time?.slice(0, 5)}</p>
      <p className="text-[10px] text-slate-400 font-medium">{a.end_time?.slice(0, 5)}</p>
      <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] mt-2 shadow-[0_0_8px_#D4AF37] z-10" />
      <div className="w-[1.5px] bg-white/[0.06] absolute top-12 bottom-0 left-1/2 -translate-x-1/2 group-last:hidden" />
    </div>

    {/* Right card side */}
    <div className="flex-1 bg-[#131B2E]/60 backdrop-blur-md rounded-2xl border border-white/[0.06] p-4 hover:border-[#D4AF37]/25 transition-all shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-white leading-tight">{a.customer_name}</p>
          <p className="text-xs text-slate-400 mt-1">{a.service_name}</p>
        </div>
        <Badge variant="outline" className={`text-[10px] font-semibold border ${STATUS_COLORS[a.status] || ""}`}>
          {a.status === "agendado" ? "Pendente" : a.status === "confirmado" ? "Confirmado" : a.status}
        </Badge>
      </div>

      {(a.status === "agendado" || a.status === "confirmado") && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-white/[0.04]">
          <div className="flex gap-2">
            <Button
              onClick={async (e) => {
                e.stopPropagation();
                await onUpdateStatus(a.id, "no_show");
              }}
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl h-8 text-xs text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:text-red-300 transition-all"
            >
              Faltou
            </Button>
            <Button
              onClick={async (e) => {
                e.stopPropagation();
                onCheckout(a);
              }}
              size="sm"
              className="flex-1 rounded-xl h-8 text-xs font-semibold bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B] transition-all hover:shadow-lg hover:shadow-[#D4AF37]/10"
            >
              Compareceu
            </Button>
          </div>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onAddService(a);
            }}
            variant="outline"
            size="sm"
            className="w-full rounded-xl h-8 text-xs text-slate-300 border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:text-white transition-all gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Serviço Extra
          </Button>
        </div>
      )}
    </div>
  </motion.div>
);

const NotifItem = ({
  n,
  onMarkRead,
  onDelete,
}: {
  n: any;
  onMarkRead: (id: string, url?: string) => Promise<void>;
  onDelete: (id: string, read: boolean) => Promise<void>;
}) => {
  const [swipeX, setSwipeX] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const swipeXRef = useRef(0);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(n.id, n.read);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl mb-1 border border-white/[0.04]">
      {swipeX > 10 && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-end pr-4 rounded-2xl animate-in fade-in duration-100" style={{ opacity: Math.min(swipeX / 80, 1) }}>
          <Trash2 className="h-4 w-4 text-red-500" />
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
        className={`p-3 cursor-pointer transition-colors ${n.read ? "bg-white/[0.01] hover:bg-white/[0.04]" : "bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10"}`}
        onClick={async () => {
          if (swipeX > 0) { setSwipeX(0); return; }
          await onMarkRead(n.id, n.url);
        }}
      >
        <div className="flex items-start gap-3">
          {!n.read && <div className="h-2 w-2 rounded-full bg-[#D4AF37] mt-1.5 flex-shrink-0 animate-pulse" />}
          <div className={`flex-1 min-w-0 ${n.read ? "ml-5" : ""}`}>
            <p className="text-[13px] font-bold leading-snug text-white">{n.title}</p>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
            <p className="text-[10px] text-slate-500 mt-1.5 font-medium">{format(new Date(n.created_at), "dd/MM 'às' HH:mm")}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Component ──
export default function BarberHome() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"home"|"hoje"|"semana"|"perfil">(() =>
    (localStorage.getItem("barber_tab") as any) || "home"
  );
  const [professional, setProfessional] = useState<any>(null);
  const [appts, setAppts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agendaDate, setAgendaDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  
  const agendaDays = useMemo(() => {
    const list = [];
    const start = new Date();
    for (let i = -2; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      list.push({
        dateStr: format(d, "yyyy-MM-dd"),
        dayNum: format(d, "dd"),
        dayName: format(d, "EEE", { locale: ptBR }),
        isToday: isSameDay(d, new Date()),
      });
    }
    return list;
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayAppts = useMemo(() => appts.filter(a => a.date === today).sort((a,b)=>a.start_time.localeCompare(b.start_time)), [appts, today]);

  const agendaAppts = useMemo(() => {
    return appts.filter(a => a.date === agendaDate).sort((a,b)=>a.start_time.localeCompare(b.start_time));
  }, [appts, agendaDate]);

  const nextAppt = useMemo(() => {
    const now = new Date();
    const currentTimeStr = format(now, "HH:mm:ss");
    const future = todayAppts.filter(a => a.status === "agendado" || a.status === "confirmado");
    const upcoming = future.filter(a => a.start_time >= currentTimeStr);
    if (upcoming.length > 0) return upcoming[0];
    return future[0] || null;
  }, [todayAppts]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [scheduleSaveTrigger, setScheduleSaveTrigger] = useState(0);
  const triggerSave = () => setScheduleSaveTrigger(c => c + 1);


  const [services, setServices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedApptForService, setSelectedApptForService] = useState<any | null>(null);
  const [productSaleDialogOpen, setProductSaleDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [professionals, setProfessionals] = useState<any[]>([]);

  // Dialog states for Novo Agendamento
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [selectedCustId, setSelectedCustId] = useState("");
  const [selectedProfId, setSelectedProfId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("08:00");
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustBirthDate, setNewCustBirthDate] = useState("");

  // Available time slots for booking dialog
  const [bookingSlots, setBookingSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Dialog states for Checkout
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [checkoutAppt, setCheckoutAppt] = useState<any | null>(null);
  const [checkoutPrice, setCheckoutPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [additionalSelected, setAdditionalSelected] = useState<Set<string>>(new Set());
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  usePushSubscription(undefined, user?.id, !!user);
  const { pullDistance, refreshing } = usePullToRefresh({ onRefresh: () => window.location.reload() });

  const goTab = (t: typeof tab) => { setTab(t); localStorage.setItem("barber_tab", t); };

  const forcePush = async () => {
    if (!user?.id) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      // Desinscreve qualquer inscrição antiga para garantir chave VAPID fresca
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try {
          await existing.unsubscribe();
        } catch (unsubErr) {
          console.warn("[Barber Push] Error unsubscribing:", unsubErr);
        }
        await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id);
      }

      if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) throw new Error("Chave VAPID não configurada");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      });

      const j = sub.toJSON();
      console.log("[PUSH DEBUG] Subscription created:", {
        endpoint: j.endpoint?.slice(0, 80) + "...",
        p256dh: (j.keys as any)?.p256dh?.slice(0, 20) + "...",
        auth: (j.keys as any)?.auth?.slice(0, 20) + "...",
        vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY?.slice(0, 40) + "...",
      });
      if (j.endpoint) {
        // Upsert (update or insert) — não duplica
        const { error } = await (supabase as any).from("push_subscriptions").upsert({
          user_id: user.id,
          endpoint: j.endpoint,
          p256dh_key: (j.keys as any)?.p256dh || "",
          auth_key: (j.keys as any)?.auth || "",
        }, { onConflict: "endpoint" });
        if (error) throw new Error(error.message);
        toast.success("Notificações ativadas");
      }
    } catch (e: any) {
      console.error("[Barber Push]", e);
      const msg = e.name === "NotAllowedError" ? "Permissão negada. Ative nas configurações do Chrome."
        : e.name === "InvalidStateError" ? "Service Worker não pronto. Recarregue a página e tente de novo."
        : e.message || "Erro ao ativar";
      toast.error(msg);
    }
  };

  const loadData = async () => {
    let ownerUserId = "";
    let currentProfId = user?.professional_id || "";

    if (user?.professional_id) {
      const { data: prof, error: profErr } = await supabase.from("professionals").select("*").eq("id", user.professional_id).maybeSingle();
      if (profErr) {
        console.error("Erro ao buscar profissional do perfil:", profErr);
        toast.error(`Erro ao obter profissional: ${profErr.message}`);
      }
      if (prof) {
        setProfessional(prof);
        ownerUserId = prof.user_id;
        if (!selectedProfId) {
          setSelectedProfId(prof.id);
        }
      } else {
        console.warn("Nenhum profissional encontrado com ID:", user.professional_id);
      }
    } else if (user?.id) {
      // Admin/Barbearia logged in without professional_id
      ownerUserId = user.id;
      // Get first active professional in the shop
      const { data: firstProf, error: firstProfErr } = await supabase.from("professionals").select("*").eq("user_id", user.id).eq("active", true).order("name").limit(1).maybeSingle();
      if (firstProfErr) {
        console.error("Erro ao buscar profissionais da loja:", firstProfErr);
        toast.error(`Erro profissionais: ${firstProfErr.message}`);
      }
      if (firstProf) {
        setProfessional(firstProf);
        currentProfId = firstProf.id;
        if (!selectedProfId) {
          setSelectedProfId(firstProf.id);
        }
      }
    }

    if (!ownerUserId) {
      console.warn("Carregamento abortado: ownerUserId nulo. user:", user);
      return;
    }

    const profToFetch = selectedProfId || currentProfId;

    const [aR, hR] = await Promise.all([
      profToFetch
        ? supabase.from("appointments").select("id,date,start_time,end_time,status,customer_id,service_id").eq("professional_id", profToFetch).in("status",["agendado","confirmado"]).order("date").order("start_time")
        : Promise.resolve({ data: [], error: null }),
      profToFetch
        ? supabase.from("cuts").select("created_at,professional_id,customer_id").eq("professional_id", profToFetch).order("created_at",{ascending:false}).limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (aR.error) {
      console.error("Erro ao carregar agendamentos:", aR.error);
      toast.error(`Erro agendamentos: ${aR.error.message}`);
    }

    if (hR.error) {
      console.error("Erro ao carregar histórico de cortes:", hR.error);
    }

    // Fetch services, products, customers, and professionals for this store owner
    const [sR, pProdR, cR, profsR] = await Promise.all([
      supabase.from("services").select("id, name, duration_minutes, price").eq("user_id", ownerUserId).eq("active", true).order("name"),
      supabase.from("products").select("id, name, price, commission_percent").eq("user_id", ownerUserId).eq("active", true).order("name"),
      supabase.from("customers").select("id, name, phone").eq("user_id", ownerUserId).order("name"),
      supabase.from("professionals").select("id, name, active").eq("user_id", ownerUserId).eq("active", true).order("name"),
    ]);

    if (sR.error) {
      console.error("Erro ao carregar serviços:", sR.error);
      toast.error(`Erro nos serviços: ${sR.error.message}`);
    } else if (sR.data) {
      setServices(sR.data);
    }

    if (pProdR.error) {
      console.error("Erro ao carregar produtos:", pProdR.error);
      toast.error(`Erro nos produtos: ${pProdR.error.message}`);
    } else if (pProdR.data) {
      setProducts(pProdR.data);
    }

    if (cR.error) {
      console.error("Erro ao carregar clientes:", cR.error);
      toast.error(`Erro nos clientes: ${cR.error.message}`);
    } else if (cR.data) {
      setCustomers(cR.data);
    }

    if (profsR.error) {
      console.error("Erro ao carregar profissionais da loja:", profsR.error);
      toast.error(`Erro profissionais loja: ${profsR.error.message}`);
    } else if (profsR.data) {
      setProfessionals(profsR.data);
    }

    if (aR.data) setAppts(await enrichAppointments(aR.data));
    setHistory(hR.data || []);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      toast.success(newStatus === "concluido" ? "Marcado como compareceu!" : "Marcado como faltou!");
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar status");
    }
  };

  const handleOpenCheckout = (appt: any) => {
    setCheckoutAppt(appt);
    setCheckoutPrice(String(appt.service_price || 0));
    setPaymentMethod("pix");
    setAdditionalSelected(new Set());
    setCheckoutDialogOpen(true);
  };

  const handleConfirmCheckout = async () => {
    if (!checkoutAppt || !professional) return;
    setCheckoutLoading(true);
    try {
      const mainPriceNum = Number(checkoutPrice) || 0;
      const additionalServices = services.filter(s => additionalSelected.has(s.id));
      const additionalTotal = additionalServices.reduce((sum, s) => sum + Number(s.price), 0);
      const total = mainPriceNum + additionalTotal;

      const mainServiceName = checkoutAppt.service_name;
      const additionalNames = additionalServices.map(s => `${s.name} (R$ ${Number(s.price).toFixed(2)})`).join(", ");
      
      let description = `Serviço: ${mainServiceName} (R$ ${mainPriceNum.toFixed(2)})`;
      if (additionalNames) {
        description += ` + Adicionais: ${additionalNames}`;
      }
      description += ` | Cliente: ${checkoutAppt.customer_name} | Profissional: ${professional.name}`;

      // 1. Update appointment status to 'concluido'
      const { error: statusErr } = await supabase
        .from("appointments")
        .update({ status: "concluido" })
        .eq("id", checkoutAppt.id);
      if (statusErr) throw statusErr;

      // 2. Update financial entry generated by trigger
      const { error: entryErr } = await supabase
        .from("financial_entries")
        .update({
          amount: total,
          payment_method: paymentMethod,
          description: description
        })
        .eq("appointment_id", checkoutAppt.id);
      if (entryErr) {
        console.warn("Could not update financial entry directly. Retrying in 1s...", entryErr);
        // Retry logic in case of minor trigger delay
        await new Promise(r => setTimeout(r, 1000));
        await supabase
          .from("financial_entries")
          .update({
            amount: total,
            payment_method: paymentMethod,
            description: description
          })
          .eq("appointment_id", checkoutAppt.id);
      }

      toast.success("Atendimento concluído com sucesso!");
      setCheckoutDialogOpen(false);
      setCheckoutAppt(null);
      setAdditionalSelected(new Set());
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao concluir atendimento");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCreateAppointment = async () => {
    if (!professional) return;
    setCheckoutLoading(true);
    try {
      let finalCustId = selectedCustId;
      if (isNewCustomer) {
        if (!newCustName.trim()) throw new Error("Informe o nome do novo cliente");
        const { data: nc, error: nce } = await supabase
          .from("customers")
          .insert({
            user_id: professional.user_id,
            name: newCustName.trim(),
            phone: newCustPhone.trim() || null,
            birth_date: newCustBirthDate || null
          })
          .select("id")
          .single();
        if (nce) throw nce;
        finalCustId = nc.id;
      }

      if (!finalCustId) throw new Error("Selecione ou cadastre um cliente");
      if (!selectedProfId) throw new Error("Selecione o profissional");
      if (!selectedServiceId) throw new Error("Selecione o serviço");
      if (!startTime) throw new Error("Selecione o horário");

      const svc = services.find(s => s.id === selectedServiceId);
      if (!svc) throw new Error("Serviço não encontrado");

      const [h, m] = startTime.split(":").map(Number);
      const dateObj = new Date();
      dateObj.setHours(h, m, 0, 0);
      const endObj = new Date(dateObj.getTime() + Number(svc.duration_minutes) * 60000);
      const endTimeStr = format(endObj, "HH:mm:ss");

      const { error: apptErr } = await supabase.from("appointments").insert({
        user_id: professional.user_id,
        professional_id: selectedProfId,
        customer_id: finalCustId,
        service_id: selectedServiceId,
        date: selectedDate,
        start_time: startTime + ":00",
        end_time: endTimeStr,
        status: "agendado"
      });
      if (apptErr) throw apptErr;

      toast.success("Agendamento criado com sucesso!");
      setBookingDialogOpen(false);
      
      // Reset form states
      setSelectedCustId("");
      setIsNewCustomer(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustBirthDate("");
      setBookingSlots([]);
      setStartTime("");
      setSelectedServiceId("");
      setStartTime("08:00");
      
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao agendar");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("client_notifications").select("id",{count:"exact"}).eq("user_id",user.id).eq("read",false);
    if (data) setUnread(data.length);
  };

  // ── Compute booking slots whenever prof or date changes ──
  useEffect(() => {
    if (!selectedProfId || !selectedDate || !bookingDialogOpen) {
      setBookingSlots([]);
      return;
    }
    const computeSlots = async () => {
      setLoadingSlots(true);
      setStartTime("");
      try {
        const dateObj = new Date(selectedDate + "T00:00:00");
        const dayOfWeek = dateObj.getDay();

        const { data: schData } = await supabase
          .from("professional_schedules")
          .select("start_time, end_time, day_of_week, active")
          .eq("professional_id", selectedProfId);

        let daySchedules = (schData || []).filter(
          (s: any) => s.day_of_week === dayOfWeek && s.active
        );

        // Fallback to 08:00-18:00 if no schedules at all
        if (daySchedules.length === 0) {
          const all = schData || [];
          if (all.length === 0) {
            daySchedules = [{ day_of_week: dayOfWeek, start_time: "08:00", end_time: "18:00", active: true }];
          } else {
            setBookingSlots([]);
            setLoadingSlots(false);
            return;
          }
        }

        const { data: existingAppts } = await supabase
          .from("appointments")
          .select("start_time, end_time")
          .eq("professional_id", selectedProfId)
          .eq("date", selectedDate)
          .neq("status", "cancelado");

        const occupiedMinutes = new Set<number>();
        for (const a of existingAppts || []) {
          const [sh, sm] = (a.start_time || "").split(":").map(Number);
          const [eh, em] = (a.end_time || "").split(":").map(Number);
          let c = sh * 60 + (sm || 0);
          const end = eh * 60 + (em || 0);
          while (c < end) { occupiedMinutes.add(c); c += 30; }
        }

        const now = new Date();
        const isToday = isSameDay(dateObj, now);
        const slots: { time: string; available: boolean }[] = [];

        for (const ds of daySchedules) {
          const [sh, sm] = ds.start_time.split(":").map(Number);
          const [eh, em] = ds.end_time.split(":").map(Number);
          let current = sh * 60 + (sm || 0);
          const endMin = eh * 60 + (em || 0);
          while (current < endMin) {
            const h = Math.floor(current / 60);
            const m = current % 60;
            const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            const isPast = isToday && current <= now.getHours() * 60 + now.getMinutes();
            slots.push({ time: timeStr, available: !occupiedMinutes.has(current) && !isPast });
            current += 30;
          }
        }
        setBookingSlots(slots);
      } catch (e) {
        console.error("Error computing slots:", e);
        setBookingSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    computeSlots();
  }, [selectedProfId, selectedDate, bookingDialogOpen]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      await loadData();
      setLoading(false);
    })();
  }, [user?.id, user?.professional_id]);

  useEffect(() => {
    if (!user?.id) return;
    loadUnreadCount();
    const i = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(i);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const filter = user.professional_id 
      ? `professional_id=eq.${user.professional_id}`
      : `user_id=eq.${user.id}`;

    const channel = supabase
      .channel("barber-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter,
        },
        () => {
          loadData().catch(console.error);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUnreadCount().catch(console.error);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.professional_id, user?.id]);

  const openNotifs = async () => {
    const { data } = await supabase.from("client_notifications").select("*").eq("user_id",user!.id).order("created_at",{ascending:false}).limit(50);
    setNotifs(data||[]); setNotifOpen(true);
  };

  const markRead = async () => {
    await supabase.from("client_notifications").update({read:true}).eq("user_id",user!.id).eq("read",false);
    setUnread(0); setNotifs(p => p.map(n=>({...n,read:true})));
  };

  const handleMarkNotifRead = async (id: string, url?: string) => {
    await supabase.rpc("client_mark_read", { p_notification_id: id });
    setNotifs(p => p.map(x => x.id === id ? { ...x, read: true } : x));
    setUnread(c => Math.max(0, c - 1));
    if (url) window.location.href = url;
  };

  const handleMarkNotifDelete = async (id: string, read: boolean) => {
    await supabase.rpc("client_delete_notification", { p_notification_id: id });
    setNotifs(p => p.filter(x => x.id !== id));
    if (!read) {
      setUnread(c => Math.max(0, c - 1));
    }
  };

  const handleAddExtraService = async (service: any) => {
    if (!selectedApptForService) return;
    try {
      const startTime = selectedApptForService.end_time;
      const [sh, sm] = startTime.split(":").map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = startMinutes + service.duration_minutes;
      const eh = Math.floor(endMinutes / 60) % 24;
      const em = endMinutes % 60;
      const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;

      const { error } = await supabase.from("appointments").insert({
        user_id: professional.user_id,
        customer_id: selectedApptForService.customer_id,
        professional_id: user!.professional_id,
        service_id: service.id,
        date: selectedApptForService.date,
        start_time: startTime,
        end_time: endTime,
        status: "agendado",
      });

      if (error) throw error;
      toast.success(`Serviço extra "${service.name}" adicionado com sucesso!`);
      setSelectedApptForService(null);
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao adicionar serviço extra");
    }
  };

  const handleRecordProductSale = async () => {
    if (!selectedProductId) {
      toast.error("Selecione um produto");
      return;
    }
    const qty = parseInt(saleQuantity) || 1;
    if (qty < 1) {
      toast.error("Quantidade deve ser pelo menos 1");
      return;
    }

    try {
      const product = products.find((p) => p.id === selectedProductId);
      if (!product) throw new Error("Produto não encontrado");

      const totalPrice = product.price * qty;
      const commPercent = product.commission_percent !== null ? product.commission_percent : (professional?.commission_percent || 0);
      const commissionAmount = (totalPrice * commPercent) / 100;

      const { error } = await supabase.from("product_sales").insert({
        user_id: professional.user_id,
        product_id: selectedProductId,
        professional_id: user!.professional_id,
        customer_id: selectedCustomerId || null,
        quantity: qty,
        unit_price: product.price,
        total_price: totalPrice,
        commission_amount: commissionAmount,
        sale_type: "venda",
      });

      if (error) throw error;
      toast.success(`Venda registrada! Total: R$ ${totalPrice.toFixed(2)}`);
      setProductSaleDialogOpen(false);
      setSelectedProductId("");
      setSaleQuantity("1");
      setSelectedCustomerId("");
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar venda");
    }
  };


  const weekAppts = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 6);
    return appts.filter(a => a.date >= format(now, "yyyy-MM-dd") && a.date <= format(weekEnd, "yyyy-MM-dd"))
      .sort((a,b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  }, [appts]);

  const weekByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const a of weekAppts) { if (!map[a.date]) map[a.date] = []; map[a.date].push(a); }
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b));
  }, [weekAppts]);

  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set([today]));

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  const stats = { hoje: todayAppts.length, semana: appts.length, cortes: history.length, comissao: professional ? (appts.length*(professional.commission_percent||0)*30/100).toFixed(0):"0" };


  if (loading) return (
    <div className="h-dvh flex items-center justify-center bg-[#090D16]">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="h-8 w-8 border-[3px] border-[#D4AF37] border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="h-dvh bg-[#090D16] text-[#F3F4F6] flex flex-col overflow-hidden theme-client relative">
      {/* Background ambient glows */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-amber-500/5 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      {/* Pull indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div className="flex items-center justify-center" style={{ height: `${pullDistance}px`, opacity: Math.min(pullDistance / 70, 1) }}>
          <motion.div animate={{ rotate: refreshing ? 360 : 0 }} transition={{ repeat: refreshing ? Infinity : 0, duration: 1, ease: "linear" }}
            className="h-5 w-5 border-2 border-[#D4AF37] border-t-transparent rounded-full" />
        </div>
      )}

      {/* ── Header ── */}
      <header className="shrink-0 bg-[#0E1322]/80 backdrop-blur-2xl border-b border-white/[0.06] px-4 z-30">
        <div className="h-14 flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 ring-2 ring-[#D4AF37]/30">
              {professional?.photo_url ? <AvatarImage src={professional.photo_url} className="object-cover" /> : null}
              <AvatarFallback className="bg-white/[0.04] text-white text-[11px] font-bold">
                {professional?.name?.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-bold leading-tight text-white">{professional?.name || "Barbeiro"}</p>
              <p className="text-[10px] text-slate-400 leading-tight">Profissional</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={openNotifs} className="relative h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#F3C06B] hover:bg-white/[0.04] transition-all">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full ring-2 ring-[#0E1322]">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            <button 
              onClick={async () => {
                if (confirm("Deseja realmente sair da sua conta?")) {
                  await logout();
                  toast.success("Sessão encerrada");
                }
              }} 
              className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto ptr-scroll-check z-10">
        <div className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ type: "spring", damping: 22, stiffness: 250 }}>

              {tab === "home" && (
                <div className="space-y-5">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Hoje" value={stats.hoje} icon={CalendarDays} color="bg-blue-500/10 text-blue-400" />
                    <StatCard label="Semana" value={stats.semana} icon={Clock} color="bg-amber-500/10 text-amber-400" />
                    <StatCard label="Cortes" value={stats.cortes} icon={Scissors} color="bg-emerald-500/10 text-emerald-400" />
                    <StatCard label="Comissão" value={`R$${stats.comissao}`} icon={DollarSign} color="bg-green-500/10 text-green-400" />
                  </div>
                  
                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => setBookingDialogOpen(true)}
                      className="h-11 rounded-2xl bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B] font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md shadow-[#D4AF37]/10"
                    >
                      <Plus className="h-4 w-4" /> Novo Agendamento
                    </Button>
                    <Button
                      onClick={() => setProductSaleDialogOpen(true)}
                      variant="outline"
                      className="h-11 rounded-2xl bg-[#131B2E]/60 text-[#F3C06B] border border-white/[0.08] hover:border-[#D4AF37]/35 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm"
                    >
                      <Scissors className="h-4 w-4" /> Vender Produto
                    </Button>
                  </div>

                  {/* Highlight: Next client */}
                  {nextAppt && (
                    <div className="bg-gradient-to-r from-[#1E294B] to-[#131B2E] rounded-3xl border border-[#D4AF37]/25 p-5 relative overflow-hidden shadow-lg">
                      <div className="absolute top-0 right-0 p-3 opacity-5">
                        <Scissors className="h-24 w-24 text-white" />
                      </div>
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <Badge className="bg-[#D4AF37] text-[#090D16] font-bold hover:bg-[#F3C06B] text-[10px] rounded-full px-2.5 py-0.5">
                            Próximo Cliente
                          </Badge>
                          <h3 className="text-xl font-bold text-white leading-tight">{nextAppt.customer_name}</h3>
                          <p className="text-xs text-slate-300">{nextAppt.service_name}</p>
                        </div>
                        <div className="text-right">
                          <div className="bg-[#090D16]/50 rounded-2xl px-3 py-2 border border-white/[0.04] inline-block">
                            <p className="text-[10px] text-[#F3C06B] font-bold uppercase tracking-wider">Horário</p>
                            <p className="text-lg font-bold text-white mt-0.5">{nextAppt.start_time?.slice(0, 5)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4 pt-4 border-t border-white/[0.04]">
                        <Button
                          onClick={async () => {
                            await updateStatus(nextAppt.id, "no_show");
                          }}
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-xl h-9 text-xs text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:text-red-300 transition-all"
                        >
                          Faltou
                        </Button>
                        <Button
                          onClick={() => {
                            handleOpenCheckout(nextAppt);
                          }}
                          size="sm"
                          className="flex-1 rounded-xl h-9 text-xs font-semibold bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B] transition-all"
                        >
                          Atender
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* List header */}
                  {todayAppts.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-[#D4AF37] animate-pulse" />
                        <p className="text-sm font-bold text-white uppercase tracking-wider">Próximos hoje</p>
                      </div>
                      <div className="space-y-1">
                        {todayAppts.map(a => (
                          <ApptCard
                            key={a.id}
                            a={a}
                            onUpdateStatus={updateStatus}
                            onAddService={setSelectedApptForService}
                            onCheckout={handleOpenCheckout}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {appts.length === 0 && (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 rounded-2xl bg-[#131B2E]/60 border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="h-8 w-8 text-slate-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-300">Nenhum agendamento</p>
                      <p className="text-xs text-slate-500 mt-1">Seus agendamentos aparecerão aqui</p>
                    </div>
                  )}
                </div>
              )}

              {tab === "hoje" && (
                <div className="space-y-5">
                  {/* Horizontal date selector strip */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Agenda</p>
                    <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-4 px-4 scroll-smooth">
                      {agendaDays.map((d) => {
                        const active = agendaDate === d.dateStr;
                        return (
                          <button
                            key={d.dateStr}
                            onClick={() => setAgendaDate(d.dateStr)}
                            className={`flex-shrink-0 w-12 h-16 rounded-2xl flex flex-col items-center justify-center transition-all ${
                              active
                                ? "bg-[#D4AF37] text-[#090D16] font-bold shadow-[0_4px_12px_rgba(212,175,55,0.3)] scale-105"
                                : "bg-[#131B2E]/60 border border-white/[0.06] text-slate-400 hover:border-white/[0.15]"
                            }`}
                          >
                            <span className="text-[9px] uppercase font-bold opacity-80">{d.dayName.slice(0, 3)}</span>
                            <span className="text-base font-bold tracking-tight mt-0.5">{d.dayNum}</span>
                            {d.isToday && !active && <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* List filter by selected date */}
                  <div className="space-y-4 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-400">
                        {agendaAppts.length} agendamento(s) para esta data
                      </p>
                    </div>
                    
                    {agendaAppts.length === 0 ? (
                      <div className="text-center py-16 border border-dashed border-white/[0.06] rounded-3xl bg-[#131B2E]/10">
                        <div className="w-14 h-14 rounded-2xl bg-[#131B2E]/60 border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                          <CalendarDays className="h-6 w-6 text-slate-500" />
                        </div>
                        <p className="text-sm font-semibold text-slate-300">Folga!</p>
                        <p className="text-xs text-slate-500 mt-1">Nenhum horário agendado para este dia</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {agendaAppts.map(a => (
                          <ApptCard
                            key={a.id}
                            a={a}
                            onUpdateStatus={updateStatus}
                            onAddService={setSelectedApptForService}
                            onCheckout={handleOpenCheckout}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "semana" && (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Esta Semana</p>
                  
                  {weekAppts.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-white/[0.06] rounded-3xl bg-[#131B2E]/10">
                      <div className="w-16 h-16 rounded-2xl bg-[#131B2E]/60 border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                        <Clock className="h-8 w-8 text-slate-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-300">Nenhum agendamento esta semana</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-400 font-semibold mb-2">
                        {weekAppts.length} agendamento(s) nos próximos 7 dias
                      </p>
                      {weekByDay.map(([date, dayAppts]) => {
                        const isOpen = expandedDays.has(date);
                        const dayName = format(new Date(date + "T00:00:00"), "EEEE, dd/MM", { locale: ptBR });
                        return (
                          <div key={date} className="bg-[#131B2E]/50 rounded-2xl border border-white/[0.06] overflow-hidden">
                            <button
                              onClick={() => toggleDay(date)}
                              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${date === today ? "bg-[#D4AF37]" : "bg-white/20"}`} />
                                <span className="text-sm font-bold text-white capitalize">{dayName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="text-[10px] font-bold bg-white/[0.05] border-white/[0.08] text-[#F3C06B]">{dayAppts.length}</Badge>
                                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-4 pb-4 space-y-2 border-t border-white/[0.04] pt-4">
                                {dayAppts.map((a: any) => (
                                  <ApptCard
                                    key={a.id}
                                    a={a}
                                    onUpdateStatus={updateStatus}
                                    onAddService={setSelectedApptForService}
                                    onCheckout={handleOpenCheckout}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {tab === "perfil" && professional && (
                <div className="space-y-5">
                  <div className="bg-[#131B2E]/60 rounded-3xl border border-white/[0.06] overflow-hidden shadow-lg relative">
                    <div className="h-24 bg-gradient-to-br from-[#D4AF37]/20 via-primary/5 to-transparent" />
                    <div className="px-5 pb-5 -mt-10 text-center relative z-10">
                      <div className="h-20 w-20 rounded-full ring-4 ring-[#090D16] overflow-hidden bg-[#131B2E] mx-auto">
                        {professional.photo_url ? (
                          <img src={professional.photo_url} alt={professional.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-white/[0.04] text-white text-2xl font-bold">
                            {professional.name?.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <h2 className="text-lg font-bold text-white mt-3">{professional.name}</h2>
                      <p className="text-xs text-slate-400 mt-1">Comissão: {professional.commission_percent || 0}%</p>
                      <div className="flex items-center justify-center gap-2 mt-4">
                        <div className="px-3 py-1 bg-white/[0.04] border border-white/[0.06] rounded-full text-xs font-semibold text-slate-300">{stats.semana} atendimentos</div>
                        <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-semibold text-emerald-400">{stats.cortes} cortes</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-left space-y-3">
                    <p className="text-sm font-bold text-white uppercase tracking-wider">Meus Horários</p>
                    <div className="bg-[#131B2E]/40 border border-white/[0.06] rounded-3xl p-4">
                      <ScheduleEditor professionalId={professional.id} hideSaveButton triggerSave={scheduleSaveTrigger} />
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full h-12 rounded-2xl text-sm border-white/[0.08] bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white transition-all font-semibold" onClick={forcePush}>
                    <Bell className="h-4 w-4 mr-2" /> Ativar notificações
                  </Button>
                  <p className="text-center text-[10px] text-slate-600 font-semibold mt-4">
                    Dom Vere · v{import.meta.env.VITE_APP_VERSION || "1.0"}
                  </p>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Floating Bottom Navigation ── */}
      <nav className="fixed bottom-4 left-4 right-4 mx-auto max-w-md z-40 rounded-2xl bg-[#131B2E]/85 backdrop-blur-lg border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.5)] px-4 py-2 safe-area-bottom">
        <div className="flex justify-around items-center">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => goTab(t.id)}
                className={`flex-1 flex flex-col items-center py-1 transition-all ${active ? "text-[#F3C06B]" : "text-slate-500 hover:text-slate-300"}`}>
                <t.icon className={`h-5 w-5 mb-0.5 transition-all duration-200 ${active ? "scale-110 drop-shadow-[0_0_8px_rgba(243,192,107,0.4)]" : ""}`} />
                <span className="text-[10px] font-semibold tracking-tight">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Notifications Modal ── */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-200" onClick={() => setNotifOpen(false)}>
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-card w-full sm:max-w-md sm:rounded-3xl max-h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Notificações</h3>
                {unread > 0 && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{unread}</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && <button onClick={markRead} className="text-xs text-primary font-medium hover:underline">Ler todas</button>}
                <button onClick={() => setNotifOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2">
              {notifs.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Bell className="h-7 w-7 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Tudo em dia</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">Nenhuma notificação no momento</p>
                </div>
              ) : notifs.map(n => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onMarkRead={handleMarkNotifRead}
                  onDelete={handleMarkNotifDelete}
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}
      {/* ── Dialog: Adicionar Serviço Extra ── */}
      <Dialog open={!!selectedApptForService} onOpenChange={(open) => !open && setSelectedApptForService(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-[#0E1322] border border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white">Adicionar Serviço Extra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-400">
              Selecione o serviço adicional que o cliente <strong>{selectedApptForService?.customer_name}</strong> vai realizar. Isso criará um agendamento adjacente na agenda para bloquear o tempo e computar sua comissão.
            </p>
            <div className="max-h-[40vh] overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAddExtraService(s)}
                  className="w-full text-left p-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-[#D4AF37]/30 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold group-hover:text-[#F3C06B] transition-colors">{s.name}</p>
                    <p className="text-[11px] text-slate-400 font-medium">{s.duration_minutes} min · R$ {Number(s.price).toFixed(2)}</p>
                  </div>
                  <Plus className="h-4 w-4 text-slate-400 group-hover:text-[#F3C06B] transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Vender Produto ── */}
      <Dialog open={productSaleDialogOpen} onOpenChange={setProductSaleDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-[#0E1322] border border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white">Registrar Venda de Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Produto *</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="" className="bg-[#0e1322]">Selecione um produto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0e1322]">
                    {p.name} — R$ {Number(p.price).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Quantidade *</label>
              <input
                type="number"
                min="1"
                value={saleQuantity}
                onChange={(e) => setSaleQuantity(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Cliente (Opcional)</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="" className="bg-[#0e1322]">Selecione um cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0e1322]">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleRecordProductSale} className="w-full h-10 rounded-xl mt-2 font-bold bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B]">
              Confirmar Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Novo Agendamento ── */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-[#0E1322] border border-white/[0.08] text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white">Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Customer select or create */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-400">Cliente *</label>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#F3C06B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNewCustomer}
                    onChange={(e) => setIsNewCustomer(e.target.checked)}
                    className="rounded border-white/[0.08] text-[#D4AF37] bg-[#131B2E] focus:ring-[#D4AF37]"
                  />
                  <span>Novo Cliente</span>
                </label>
              </div>

              {isNewCustomer ? (
                <div className="space-y-2 border border-white/[0.06] rounded-2xl p-3 bg-white/[0.01]">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nome *</label>
                    <input
                      type="text"
                      placeholder="Nome do cliente"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-[#131B2E] text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Telefone (DDD + Número)</label>
                    <input
                      type="tel"
                      placeholder="Ex: 11999999999"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-[#131B2E] text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Data de Aniversário</label>
                    <input
                      type="date"
                      value={newCustBirthDate}
                      onChange={(e) => setNewCustBirthDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-[#131B2E] text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                </div>
              ) : (
                <select
                  value={selectedCustId}
                  onChange={(e) => setSelectedCustId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                >
                  <option value="" className="bg-[#0e1322]">Selecione um cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0e1322]">
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Professional Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Profissional *</label>
              <select
                value={selectedProfId}
                onChange={(e) => setSelectedProfId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="" className="bg-[#0e1322]">Selecione o profissional</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0e1322]">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Service cards */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Serviço *</label>
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto overscroll-contain pr-1 touch-pan-y no-scrollbar">
                {services.map((s) => {
                  const isSelected = selectedServiceId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedServiceId(s.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#F3C06B]"
                          : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.15] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div>
                        <p className={`text-xs font-bold ${isSelected ? "text-[#F3C06B]" : "text-white"}`}>{s.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{s.duration_minutes} min</p>
                      </div>
                      <span className={`text-xs font-bold ${isSelected ? "text-[#F3C06B]" : "text-white"}`}>
                        R$ {Number(s.price).toFixed(2)}
                      </span>
                    </button>
                  );
                })}
                {services.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-3">Nenhum serviço cadastrado</p>
                )}
              </div>
            </div>

            {/* Date Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Data *</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>

            {/* Time Slot Grid */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">
                Horário *{startTime && <span className="ml-2 font-bold text-[#F3C06B]">{startTime} selecionado</span>}
              </label>
              {!selectedProfId ? (
                <p className="text-xs text-slate-500 text-center py-3 border border-dashed border-white/[0.06] rounded-xl bg-white/[0.01]">
                  Selecione um profissional para ver os horários
                </p>
              ) : loadingSlots ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-4 w-4 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
                  <span className="text-xs text-slate-400 ml-2">Carregando horários...</span>
                </div>
              ) : bookingSlots.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-3 border border-dashed border-white/[0.06] rounded-xl bg-white/[0.01]">
                  Nenhum horário disponível para este dia
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-0.5 no-scrollbar">
                  {bookingSlots.map((slot) => {
                    const isSelected = startTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setStartTime(slot.time)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          !slot.available
                            ? "bg-white/[0.02] text-slate-600 cursor-not-allowed line-through"
                            : isSelected
                            ? "bg-[#D4AF37] text-[#090D16] shadow-md shadow-[#D4AF37]/10"
                            : "bg-[#131B2E] text-slate-300 hover:bg-[#D4AF37]/10 hover:text-[#F3C06B] border border-white/[0.04]"
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button onClick={handleCreateAppointment} disabled={checkoutLoading} className="w-full h-11 rounded-2xl mt-2 font-bold bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B]">
              {checkoutLoading ? "Criando agendamento..." : "Salvar Agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar Presença e Finalizar (Checkout) ── */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-[#0E1322] border border-white/[0.08] text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white">Finalizar Atendimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-[#131B2E] rounded-2xl border border-white/[0.06] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-white/[0.02] to-transparent rounded-bl-full" />
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cliente</p>
              <p className="text-base font-bold text-white mt-1">{checkoutAppt?.customer_name}</p>
              <p className="text-xs text-slate-400 mt-1.5">Serviço Principal: <span className="text-white font-medium">{checkoutAppt?.service_name}</span></p>
            </div>

            {/* Price Edit */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Valor Cobrado pelo Serviço (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={checkoutPrice}
                onChange={(e) => setCheckoutPrice(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-white/[0.08] bg-[#131B2E] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="pix" className="bg-[#0e1322]">Pix</option>
                <option value="dinheiro" className="bg-[#0e1322]">Dinheiro</option>
                <option value="cartao_credito" className="bg-[#0e1322]">Cartão de Crédito</option>
                <option value="cartao_debito" className="bg-[#0e1322]">Cartão de Débito</option>
                <option value="outro" className="bg-[#0e1322]">Outro</option>
              </select>
            </div>

            {/* Additional Services Checkbox list */}
            {services.length > 1 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Serviços Adicionais Realizados</label>
                <div className="max-h-36 overflow-y-auto border border-white/[0.08] rounded-2xl p-3 space-y-2 bg-[#131B2E]/40 no-scrollbar">
                  {services
                    .filter(s => s.id !== checkoutAppt?.service_id)
                    .map(s => {
                      const selected = additionalSelected.has(s.id);
                      return (
                        <label key={s.id} className="flex items-center justify-between cursor-pointer py-1 select-none">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                  setAdditionalSelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                                    return next;
                                  });
                              }}
                              className="rounded border-white/[0.08] text-[#D4AF37] bg-[#131B2E] focus:ring-[#D4AF37]"
                            />
                            <span className="text-xs font-semibold text-slate-300">{s.name}</span>
                          </div>
                          <span className="text-xs text-[#F3C06B] font-bold">R$ {Number(s.price).toFixed(2)}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Receipt Summary - Styled as modern fiscal receipt */}
            <div className="rounded-2xl border border-dashed border-white/20 p-4 space-y-2.5 bg-white/[0.01] relative">
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-4 bg-[#0E1322] rounded-r-full" />
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-4 bg-[#0E1322] rounded-l-full" />
              
              <div className="flex justify-between text-xs text-slate-400 font-medium">
                <span>{checkoutAppt?.service_name}</span>
                <span>R$ {Number(checkoutPrice || 0).toFixed(2)}</span>
              </div>
              
              {services.filter(s => additionalSelected.has(s.id)).map(s => (
                <div key={s.id} className="flex justify-between text-xs text-slate-400 font-medium">
                  <span>+ {s.name} (Adicional)</span>
                  <span>R$ {Number(s.price).toFixed(2)}</span>
                </div>
              ))}

              <div className="flex justify-between text-sm font-bold text-white border-t border-white/10 pt-2.5 mt-2.5">
                <span>Valor Total</span>
                <span className="text-[#F3C06B]">R$ {(
                  (Number(checkoutPrice) || 0) + 
                  services.filter(s => additionalSelected.has(s.id)).reduce((sum, s) => sum + Number(s.price), 0)
                ).toFixed(2)}</span>
              </div>
            </div>

            <Button onClick={handleConfirmCheckout} disabled={checkoutLoading} className="w-full h-11 rounded-2xl mt-2 font-bold bg-[#D4AF37] text-[#090D16] hover:bg-[#F3C06B]">
              {checkoutLoading ? "Finalizando..." : "Confirmar Presença e Finalizar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
