import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Shift {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

interface DaySchedule {
  dayIndex: number;
  manha: Shift;
  tarde: Shift;
  noturno: Shift;
}

interface ScheduleRow {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const DEFAULT_SHIFTS: Omit<DaySchedule, "dayIndex"> = {
  manha: { enabled: false, start_time: "08:00", end_time: "12:00" },
  tarde: { enabled: false, start_time: "13:00", end_time: "18:00" },
  noturno: { enabled: false, start_time: "18:00", end_time: "22:00" },
};

function rowsToDay(dayIndex: number, rows: ScheduleRow[]): DaySchedule {
  const dayRows = rows.filter((r) => r.day_of_week === dayIndex && r.active);
  const day: DaySchedule = {
    dayIndex,
    manha: { ...DEFAULT_SHIFTS.manha },
    tarde: { ...DEFAULT_SHIFTS.tarde },
    noturno: { ...DEFAULT_SHIFTS.noturno },
  };
  for (const r of dayRows) {
    const start = r.start_time.substring(0, 5);
    const end = r.end_time.substring(0, 5);
    if (start < "12:00" && end <= "13:00") {
      day.manha = { enabled: true, start_time: start, end_time: end };
    } else if (start >= "12:00" && start < "18:00" && end <= "19:00") {
      day.tarde = { enabled: true, start_time: start, end_time: end };
    } else if (start >= "17:00") {
      day.noturno = { enabled: true, start_time: start, end_time: end };
    }
  }
  return day;
}

function dayToRows(profId: string, day: DaySchedule): Omit<ScheduleRow, "id">[] {
  const rows: Omit<ScheduleRow, "id">[] = [];
  for (const s of [day.manha, day.tarde, day.noturno]) {
    if (s.enabled) {
      rows.push({
        professional_id: profId,
        day_of_week: day.dayIndex,
        start_time: s.start_time,
        end_time: s.end_time,
        active: true,
      });
    }
  }
  return rows;
}

interface Props {
  professionalId: string;
  hideSaveButton?: boolean;
  triggerSave?: number;
}

export function ScheduleEditor({ professionalId, hideSaveButton, triggerSave }: Props) {
  const saveRef = useRef<() => void>(() => {});
  const [days, setDays] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("professional_schedules")
        .select("id, professional_id, day_of_week, start_time, end_time, active")
        .eq("professional_id", professionalId)
        .order("day_of_week");
      if (!mounted) return;
      const rows = (data || []) as ScheduleRow[];
      const built = DAYS.map((_, i) => rowsToDay(i, rows));
      if (rows.length === 0) {
        for (let i = 1; i <= 6; i++) {
          built[i].manha = { enabled: true, start_time: "08:00", end_time: "12:00" };
          built[i].tarde = { enabled: true, start_time: "13:00", end_time: "18:00" };
        }
      }
      setDays(built);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [professionalId]);

  const updateShift = (
    dayIdx: number,
    shift: "manha" | "tarde" | "noturno",
    field: keyof Shift,
    value: any,
  ) => {
    setDays((prev) =>
      prev.map((d, i) => (i === dayIdx ? { ...d, [shift]: { ...d[shift], [field]: value } } : d)),
    );
  };

  // Trigger save from parent (bottom bar button)
  useEffect(() => { if (triggerSave && triggerSave > 0) save(); }, [triggerSave]);

  const save = async () => {
    saveRef.current = save;
    // ... rest of save
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from("professional_schedules")
        .delete()
        .eq("professional_id", professionalId);
      if (delErr) throw delErr;
      const allRows = days.flatMap((d) => dayToRows(professionalId, d));
      if (allRows.length > 0) {
        const { error } = await supabase.from("professional_schedules").insert(allRows);
        if (error) throw error;
      }
      toast.success("Disponibilidade salva");
      (window as any).__scheduleSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {!hideSaveButton && (
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Horários de trabalho</h3>
          <span className="text-[10px] text-slate-400">Ative os turnos e defina os horários</span>
        </div>
      )}
      {days.map((d, idx) => {
        const hasAnyShift = d.manha.enabled || d.tarde.enabled || d.noturno.enabled;
        return (
          <div
            key={d.dayIndex}
            className={`rounded-2xl border overflow-hidden transition-all ${
              hasAnyShift
                ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                : "border-white/[0.05] bg-white/[0.01]"
            }`}
          >
            <div className="py-2.5 px-3.5 space-y-2">
              <p className={`text-xs font-bold uppercase tracking-wider ${hasAnyShift ? "text-emerald-400" : "text-slate-500"}`}>
                {DAYS[d.dayIndex]}
              </p>
              {(["manha", "tarde", "noturno"] as const).map((shift) => {
                const enabled = d[shift].enabled;
                return (
                  <div
                    key={shift}
                    className={`flex items-center gap-1.5 rounded-xl transition-all ${
                      enabled ? "" : "opacity-30"
                    }`}
                  >
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => updateShift(idx, shift, "enabled", v)}
                      className="scale-75 shrink-0"
                    />
                    <span className="text-[11px] font-medium capitalize w-12 shrink-0 text-slate-300">
                      {shift}
                    </span>
                    <input
                      type="time"
                      value={d[shift].start_time}
                      onChange={(e) => updateShift(idx, shift, "start_time", e.target.value)}
                      disabled={!enabled}
                      className="h-7 px-2 rounded-lg text-[11px] font-mono bg-[#0E1322] border border-white/[0.08] text-white w-[88px] shrink-0 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] disabled:opacity-40 transition-all"
                    />
                    <span className="text-[10px] text-slate-500 shrink-0">até</span>
                    <input
                      type="time"
                      value={d[shift].end_time}
                      onChange={(e) => updateShift(idx, shift, "end_time", e.target.value)}
                      disabled={!enabled}
                      className="h-7 px-2 rounded-lg text-[11px] font-mono bg-[#0E1322] border border-white/[0.08] text-white w-[88px] shrink-0 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] disabled:opacity-40 transition-all"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!hideSaveButton && (
        <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-xl pt-3 pb-6">
          <Button onClick={save} disabled={saving} className="w-full h-12 rounded-2xl text-sm font-semibold shadow-lg shadow-primary/20">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar disponibilidade"}
          </Button>
        </div>
      )}
    </div>
  );
}
