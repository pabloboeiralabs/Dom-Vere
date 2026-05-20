import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, GripVertical } from "lucide-react";

interface Stage {
  id?: string;
  user_id: string;
  stage_order: number;
  name: string;
  instruction: string;
  active: boolean;
  skip_if_registered: boolean;
}

const DEFAULT_STAGES = [
  { name: "Saudação", instruction: "Cumprimente o cliente pelo nome (se disponível) e pergunte como pode ajudar.", active: true, skip_if_registered: false },
  { name: "Cadastro", instruction: "Peça o nome completo e data de nascimento do cliente. Use register_customer quando informar.", active: true, skip_if_registered: true },
  { name: "Necessidade", instruction: "Identifique o que o cliente precisa: agendar, preços, horários, etc.", active: true, skip_if_registered: false },
  { name: "Preferência", instruction: "Pergunte preferência de profissional e envie o carrossel.", active: true, skip_if_registered: false },
  { name: "Agendamento", instruction: "Com profissional, serviço, data e horário, crie o agendamento.", active: true, skip_if_registered: false },
  { name: "Confirmação", instruction: "Confirme os detalhes do agendamento e se despeça.", active: true, skip_if_registered: false },
];

export function WhatsAppBotStages() {
  const { user } = useAuth();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadStages();
  }, [user]);

  const loadStages = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bot_conversation_stages")
      .select("*")
      .eq("user_id", user.id)
      .order("stage_order");
    setStages((data || []) as Stage[]);
    setLoading(false);
  };

  const saveStages = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Delete existing
      await supabase.from("bot_conversation_stages").delete().eq("user_id", user.id);
      // Insert all
      const inserts = stages.map((s, i) => ({
        user_id: user.id,
        stage_order: i + 1,
        name: s.name,
        instruction: s.instruction,
        active: s.active,
        skip_if_registered: s.skip_if_registered,
      }));
      if (inserts.length > 0) {
        const { error } = await supabase.from("bot_conversation_stages").insert(inserts);
        if (error) throw error;
      }
      toast.success("Etapas salvas!");
      loadStages();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const restoreDefaults = () => {
    if (!user) return;
    setStages(DEFAULT_STAGES.map((s, i) => ({
      ...s,
      user_id: user.id,
      stage_order: i + 1,
    })));
    toast.info("Padrões restaurados. Clique em Salvar para aplicar.");
  };

  const addStage = () => {
    if (!user) return;
    setStages(prev => [...prev, {
      user_id: user.id,
      stage_order: prev.length + 1,
      name: "",
      instruction: "",
      active: true,
      skip_if_registered: false,
    }]);
  };

  const removeStage = (idx: number) => {
    setStages(prev => prev.filter((_, i) => i !== idx));
  };

  const updateStage = (idx: number, field: keyof Stage, value: any) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  if (loading) return <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Etapas do Bot</h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={restoreDefaults} className="gap-1">
            <RotateCcw className="h-3 w-3" /> Padrões
          </Button>
          <Button variant="outline" size="sm" onClick={addStage} className="gap-1">
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {stages.map((stage, idx) => (
          <Card key={idx} className={!stage.active ? "opacity-50" : ""}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                <Input
                  value={stage.name}
                  onChange={e => updateStage(idx, "name", e.target.value)}
                  placeholder="Nome da etapa"
                  className="h-8 text-sm flex-1"
                />
                <div className="flex items-center gap-1">
                  <Switch checked={stage.active} onCheckedChange={v => updateStage(idx, "active", v)} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStage(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={stage.instruction}
                onChange={e => updateStage(idx, "instruction", e.target.value)}
                placeholder="Instrução para a IA nesta etapa..."
                className="text-xs min-h-[60px]"
              />
              <div className="flex items-center gap-2">
                <Switch checked={stage.skip_if_registered} onCheckedChange={v => updateStage(idx, "skip_if_registered", v)} />
                <Label className="text-xs text-muted-foreground">Pular se cliente já cadastrado</Label>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stages.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">
          Nenhuma etapa configurada. Clique em "Padrões" para restaurar.
        </p>
      )}

      <Button onClick={saveStages} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Salvar Etapas"}
      </Button>
    </div>
  );
}
