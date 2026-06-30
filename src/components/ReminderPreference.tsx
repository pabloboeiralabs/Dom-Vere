import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface Props {
  customerId: string;
  appointmentDate?: string;
  appointmentTime?: string;
  onSave?: () => void;
}

export default function ReminderPreference({ customerId, appointmentDate, appointmentTime, onSave }: Props) {
  const [remindDate, setRemindDate] = useState(appointmentDate || format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [remindHour, setRemindHour] = useState("10");
  const [remindMinute, setRemindMinute] = useState("00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!customerId) return;
    setSaving(true);

    // Calcular horas antes do agendamento
    const apptDt = new Date(`${appointmentDate || remindDate}T${appointmentTime || "12:00"}:00`);
    const remindDt = new Date(`${remindDate}T${String(remindHour).padStart(2, "0")}:${String(remindMinute).padStart(2, "0")}:00`);
    const apptTime = apptDt.getTime();
    const remindTime = remindDt.getTime();
    if (isNaN(apptTime) || isNaN(remindTime)) {
      toast.error("Data inválida"); setSaving(false); return;
    }
    const diffMs = apptTime - remindTime;
    const hoursBefore = Math.max(0.1, Math.round((diffMs / 3600000) * 10) / 10);

    const { error } = await supabase
      .from("customers")
      .update({ reminder_hours: hoursBefore })
      .eq("id", customerId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + (error?.message || "desconhecido"));
      return;
    }
    setSaved(true);
    const formattedDate = format(new Date(remindDate), "dd/MM");
    toast.success(`🔔 Lembrete agendado para ${formattedDate} às ${remindHour}h${remindMinute}!`);
    onSave?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{saved ? "Lembrete salvo! ✅" : "🔔 Definir Lembrete"}</span>
      </div>
      {!saved && (
        <>
          <p className="text-xs text-muted-foreground">
            Escolha quando quer ser lembrado:
          </p>
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Data</Label>
              <Input type="date" value={remindDate} onChange={e => setRemindDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
                className="h-10 text-sm rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Hora</Label>
                <Input type="number" min={0} max={23} value={remindHour}
                  onChange={e => setRemindHour(String(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))))}
                  className="h-10 text-sm text-center rounded-xl" placeholder="10" />
              </div>
              <div>
                <Label className="text-[10px]">Minuto</Label>
                <Input type="number" min={0} max={59} value={remindMinute}
                  onChange={e => setRemindMinute(String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))))}
                  className="h-10 text-sm text-center rounded-xl" placeholder="00" />
              </div>
            </div>
          </div>
          {customerId && (
            <Button size="sm" onClick={handleSave} disabled={saving || !remindDate} className="w-full rounded-xl">
              {saving ? "Salvando..." : "✅ Agendar lembrete"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
