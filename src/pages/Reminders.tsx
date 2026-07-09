import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, CalendarDays, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Reminder {
  id: string;
  date: string;
  start_time: string;
  service_name: string;
  professional_name: string;
  reminder_hours: number | null;
  reminder_sent: boolean;
  customer_name: string;
  customer_phone: string;
  reminder_at: string | null;
}

function calcReminderAt(date: string, time: string, hoursBefore: number): string {
  // Normalize time: take only HH:MM portion (ignore seconds, timezone, etc)
  const cleanTime = (time || "00:00").slice(0, 5);
  const appt = new Date(`${date}T${cleanTime}:00`);
  if (isNaN(appt.getTime())) return "—";
  const remind = new Date(appt.getTime() - hoursBefore * 60 * 60 * 1000);
  return format(remind, "dd/MM 'às' HH:mm");
}

export default function Reminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); setError("Usuário não autenticado"); return; }
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data, error: rpcError } = await (supabase as any).rpc("get_reminders", { p_user_id: user.id });
        if (rpcError) { setError(rpcError.message || "Erro na consulta"); setLoading(false); return; }
        const formatted: Reminder[] = (data || [])
          .filter((r: any) => r.status !== "cancelado")
          .map((r: any) => {
            try {
              return {
                id: r.id, date: r.date, start_time: r.start_time,
                service_name: r.service_name, professional_name: r.professional_name,
                reminder_hours: r.reminder_hours, reminder_sent: r.reminder_sent,
                customer_name: r.customer_name, customer_phone: r.customer_phone,
                reminder_at: r.reminder_hours ? calcReminderAt(r.date, r.start_time, r.reminder_hours) : null,
              };
            } catch { return null; }
          })
          .filter(Boolean) as Reminder[];
        setReminders(formatted);
      } catch (e: any) {
        setError(e.message || "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Lembretes</h1>
        <Badge variant="secondary" className="text-xs">{reminders.filter(r => r.reminder_hours).length} configurados</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Acompanhe os lembretes de agendamentos dos clientes.</p>

      {error && (
        <div className="text-center py-8 text-destructive bg-destructive/5 rounded-xl">
          <p className="text-sm font-medium">Erro ao carregar</p>
          <p className="text-xs mt-1 opacity-70">{error}</p>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : !error && reminders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nenhum agendamento encontrado</p>
          {user && <p className="text-[10px] mt-1 opacity-50">User: {user.id?.slice(0,8)}...</p>}
        </div>
      ) : !error && (
        <div className="space-y-2">
          {reminders.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4 flex items-center justify-between bg-card">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-sm">
                    {format(new Date(r.date + "T12:00:00"), "dd/MM", { locale: ptBR })} às {r.start_time.slice(0, 5)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{r.service_name}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.customer_name} · {r.professional_name}</p>
              </div>
              <div className="flex items-center gap-3 ml-4">
                {r.reminder_hours ? (
                  <div className="text-right min-w-[140px]">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      <Bell className="h-3 w-3 text-primary flex-shrink-0" />
                      <span>
                        {r.reminder_at && <span className="text-muted-foreground font-normal">{r.reminder_at}</span>}
                      </span>
                    </div>
                    {r.reminder_sent ? (
                      <div className="flex items-center justify-end gap-1 text-[10px] text-green-600 mt-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Enviado
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 text-[10px] text-amber-600 mt-0.5">
                        <Clock className="h-3 w-3" /> Pendente
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem lembrete</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
