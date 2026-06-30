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
}

export default function Reminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select(`
          id, date, start_time,
          services(name),
          professionals(name),
          customers!inner(id, name, phone, reminder_hours)
        `)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(50);

      if (data) {
        const formatted: Reminder[] = await Promise.all((data as any[]).map(async (a: any) => {
          const { data: lead } = await supabase
            .from("crm_leads")
            .select("reminder_sent")
            .eq("appointment_id", a.id)
            .maybeSingle();
          return {
            id: a.id,
            date: a.date,
            start_time: a.start_time,
            service_name: a.services?.name || "—",
            professional_name: a.professionals?.name || "—",
            reminder_hours: a.customers?.reminder_hours || null,
            reminder_sent: lead?.reminder_sent || false,
            customer_name: a.customers?.name || "—",
            customer_phone: a.customers?.phone || "—",
          };
        }));
        setReminders(formatted);
      }
      setLoading(false);
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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum agendamento encontrado</div>
      ) : (
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
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      <Bell className="h-3 w-3 text-primary" />
                      {r.reminder_hours < 1
                        ? Math.round(r.reminder_hours * 60) + "min"
                        : r.reminder_hours + "h"} antes
                    </div>
                    {r.reminder_sent ? (
                      <div className="flex items-center gap-1 text-[10px] text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Enviado
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-amber-600">
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
