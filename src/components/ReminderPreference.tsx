import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { toast } from "sonner";

interface Props {
  customerId: string;
  initialHours?: number | null;
  onSave?: () => void;
  compact?: boolean;
}

const OPTIONS = [
  { label: "1h", value: 1 },
  { label: "2h", value: 2 },
  { label: "6h", value: 6 },
  { label: "12h", value: 12 },
  { label: "24h", value: 24 },
  { label: "48h", value: 48 },
];

export default function ReminderPreference({ customerId, initialHours, onSave }: Props) {
  const [selected, setSelected] = useState<number>(initialHours ?? 24);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!customerId) return;
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({ reminder_hours: selected })
      .eq("id", customerId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar preferência");
      return;
    }
    setSaved(true);
    toast.success("Você será lembrado " + selected + "h antes!");
    onSave?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{saved ? "Preferência salva! ✅" : "Lembrete"}</span>
      </div>
      {!saved && (
        <>
          <p className="text-xs text-muted-foreground">
            Quer ser avisado antes? Escolha quanto tempo antes:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                className={"py-2 rounded-xl text-sm font-medium border-2 transition-all " + (
                  selected === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/40 bg-card text-muted-foreground hover:border-primary/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {customerId && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="w-full rounded-xl">
              {saving ? "Salvando..." : "Salvar preferência"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
