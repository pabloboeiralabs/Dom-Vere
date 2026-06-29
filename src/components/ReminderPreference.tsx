import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  customerId: string;
  initialHours?: number | null;
  onSave?: () => void;
  compact?: boolean;
}

const PRESETS = [
  { label: "30min", value: 0.5 },
  { label: "1h", value: 1 },
  { label: "2h", value: 2 },
  { label: "6h", value: 6 },
  { label: "12h", value: 12 },
  { label: "1 dia", value: 24 },
  { label: "2 dias", value: 48 },
  { label: "7 dias", value: 168 },
];

export default function ReminderPreference({ customerId, initialHours, onSave }: Props) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selected, setSelected] = useState<number>(initialHours ?? 24);
  const [customDays, setCustomDays] = useState(1);
  const [customHours, setCustomHours] = useState(10);
  const [customMinutes, setCustomMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const customTotalHours = customDays * 24 + customHours + customMinutes / 60;

  const handleSave = async () => {
    if (!customerId) return;
    setSaving(true);
    const value = mode === "custom" ? customTotalHours : selected;
    const { error } = await supabase
      .from("customers")
      .update({ reminder_hours: value })
      .eq("id", customerId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar preferência");
      return;
    }
    setSaved(true);
    if (mode === "custom") {
      toast.success(`Lembrete definido: ${customDays}d ${customHours}h ${customMinutes}min antes!`);
    } else {
      const label = PRESETS.find(p => p.value === selected)?.label || selected + "h";
      toast.success(`Você será lembrado ${label} antes!`);
    }
    onSave?.();
  };

  const displayValue = () => {
    if (mode === "custom") {
      const parts = [];
      if (customDays > 0) parts.push(`${customDays}d`);
      if (customHours > 0) parts.push(`${customHours}h`);
      if (customMinutes > 0) parts.push(`${customMinutes}min`);
      return parts.join(" ") || "0min";
    }
    return PRESETS.find(p => p.value === selected)?.label || selected + "h";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{saved ? "Preferência salva! ✅" : "🔔 Lembrete"}</span>
      </div>
      {!saved && (
        <>
          <p className="text-xs text-muted-foreground">
            {mode === "preset"
              ? "Quando quer ser lembrado?"
              : "Defina o lembrete personalizado:"}
          </p>

          {mode === "preset" ? (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelected(opt.value)}
                    className={`py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${
                      selected === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/40 bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setMode("custom")} className="text-xs text-primary hover:underline">
                Personalizar →
              </button>
            </>
          ) : (
            <div className="space-y-3 bg-muted/30 rounded-xl p-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px]">Dias</Label>
                  <Input type="number" min={0} max={30} value={customDays}
                    onChange={e => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-9 text-sm text-center" />
                </div>
                <div>
                  <Label className="text-[10px]">Horas</Label>
                  <Input type="number" min={0} max={23} value={customHours}
                    onChange={e => setCustomHours(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="h-9 text-sm text-center" />
                </div>
                <div>
                  <Label className="text-[10px]">Minutos</Label>
                  <Input type="number" min={0} max={59} value={customMinutes}
                    onChange={e => setCustomMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="h-9 text-sm text-center" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                ⏰ Lembrete: <strong>{displayValue()}</strong> antes do horário
              </p>
              <button onClick={() => setMode("preset")} className="text-xs text-primary hover:underline">
                ← Opções rápidas
              </button>
            </div>
          )}

          {customerId && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="w-full rounded-xl mt-1">
              {saving ? "Salvando..." : "✅ Salvar preferência"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
