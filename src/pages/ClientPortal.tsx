import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calendar, Clock, CreditCard, History, LogOut, Scissors, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  notes: string | null;
};

type HistoryItem = {
  record_type: string;
  record_date: string;
  description: string;
  amount: number;
};

const STORAGE_KEY = "client_portal_session";

const statusColors: Record<string, string> = {
  agendado: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  confirmado: "bg-green-500/15 text-green-500 border-green-500/30",
  concluido: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  cancelado: "bg-red-500/15 text-red-500 border-red-500/30",
};

export default function ClientPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"agendamentos" | "historico">("agendamentos");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setSession(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const client = supabase as any;
      const [appts, hist] = await Promise.all([
        client.rpc("client_portal_appointments", { p_customer_id: session.customer_id }),
        client.rpc("client_portal_history", { p_customer_id: session.customer_id }),
      ]);
      if (appts.data) setAppointments(appts.data as Appointment[]);
      if (hist.data) setHistory(hist.data as HistoryItem[]);
    })();
  }, [session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !birthDate) {
      toast.error("Preencha telefone e data de nascimento");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("client_portal_login", {
      p_phone: phone,
      p_birth_date: birthDate,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao buscar seus dados");
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Não encontramos seu cadastro. Verifique os dados.");
      return;
    }
    const s = data[0] as Session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
    toast.success(`Olá, ${s.name}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setPhone("");
    setBirthDate("");
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Scissors className="h-7 w-7 text-primary" />
            </div>
            <CardTitle>Área do Cliente</CardTitle>
            <p className="text-sm text-muted-foreground">Acesse com seu telefone e data de nascimento</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth">Data de nascimento</Label>
                <Input
                  id="birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Acessando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const upcoming = appointments.filter((a) => {
    const d = new Date(`${a.date}T${a.start_time}`);
    return d >= new Date() && a.status !== "cancelado";
  });

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="bg-gradient-to-br from-primary/10 to-primary/5 border-b">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{session.shop_name}</p>
                <p className="font-semibold leading-tight">{session.name}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <CreditCard className="h-3.5 w-3.5" /> Créditos
                </div>
                <p className="text-2xl font-bold">{session.credit_balance}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Scissors className="h-3.5 w-3.5" /> Plano
                </div>
                {session.plan_name ? (
                  <>
                    <p className="font-semibold text-sm truncate">{session.plan_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.plan_usage_count}/{session.plan_usage_limit} usos
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem plano ativo</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg mb-4">
          <button
            onClick={() => setTab("agendamentos")}
            className={`py-2 text-sm rounded-md transition ${tab === "agendamentos" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Agendamentos
          </button>
          <button
            onClick={() => setTab("historico")}
            className={`py-2 text-sm rounded-md transition ${tab === "historico" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Histórico
          </button>
        </div>

        {tab === "agendamentos" && (
          <div className="space-y-3">
            {upcoming.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhum agendamento futuro
                </CardContent>
              </Card>
            )}
            {upcoming.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold">{a.service_name}</p>
                      <p className="text-xs text-muted-foreground">com {a.professional_name}</p>
                    </div>
                    <Badge variant="outline" className={statusColors[a.status]}>
                      {a.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(a.date + "T00:00:00"), "dd 'de' MMM", { locale: ptBR })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {a.start_time.slice(0, 5)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {appointments.filter((a) => !upcoming.includes(a)).length > 0 && (
              <>
                <p className="text-xs uppercase tracking-wider text-muted-foreground pt-4 pb-1">Anteriores</p>
                {appointments.filter((a) => !upcoming.includes(a)).slice(0, 10).map((a) => (
                  <Card key={a.id} className="opacity-70">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{a.service_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(a.date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })} · {a.start_time.slice(0, 5)}
                          </p>
                        </div>
                        <Badge variant="outline" className={statusColors[a.status]}>
                          {a.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "historico" && (
          <div className="space-y-2">
            {history.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Sem histórico ainda
                </CardContent>
              </Card>
            )}
            {history.map((h, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{h.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(h.record_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  {h.amount > 0 && (
                    <p className="text-sm font-semibold whitespace-nowrap">
                      R$ {Number(h.amount).toFixed(2)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
