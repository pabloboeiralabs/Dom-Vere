import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
}

export function ScheduleEditor({ professionalId }: Props) {
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

  const save = async () => {
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
    <div className="space-y-3">
      {days.map((d, idx) => (
        <Card key={d.dayIndex} className="border-border/50">
          <CardContent className="py-3 px-4 space-y-3">
            <div className="font-semibold text-foreground">{DAYS[d.dayIndex]}</div>
            {(["manha", "tarde", "noturno"] as const).map((shift) => (
              <div key={shift} className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 w-24">
                  <Switch
                    checked={d[shift].enabled}
                    onCheckedChange={(v) => updateShift(idx, shift, "enabled", v)}
                  />
                  <Label className="capitalize text-sm">{shift}</Label>
                </div>
                <Input
                  type="time"
                  value={d[shift].start_time}
                  onChange={(e) => updateShift(idx, shift, "start_time", e.target.value)}
                  disabled={!d[shift].enabled}
                  className="w-28"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <Input
                  type="time"
                  value={d[shift].end_time}
                  onChange={(e) => updateShift(idx, shift, "end_time", e.target.value)}
                  disabled={!d[shift].enabled}
                  className="w-28"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <div className="sticky bottom-0 bg-background pt-3 pb-1">
        <Button onClick={save} disabled={saving} className="w-full">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar disponibilidade
        </Button>
      </div>
    </div>
  );
}
