import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, Trash2, Save, Bot, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type TriggerResp = {
  id?: string;
  trigger_word: string;
  response_text: string;
  active: boolean;
};

export function WhatsAppBotResponses() {
  const { user } = useAuth();
  const [responses, setResponses] = useState<TriggerResp[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newTrigger, setNewTrigger] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTrigger, setEditTrigger] = useState("");
  const [editResponse, setEditResponse] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadResponses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("bot_trigger_responses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at");
    setResponses((data || []) as TriggerResp[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (open) loadResponses();
  }, [open, loadResponses]);

  const startEdit = (r: TriggerResp) => {
    setEditingId(r.id || null);
    setEditTrigger(r.trigger_word);
    setEditResponse(r.response_text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTrigger("");
    setEditResponse("");
  };

  const handleSave = async (r: TriggerResp) => {
    if (!user || !r.id) return;
    setSaving(r.id);
    try {
      await supabase
        .from("bot_trigger_responses")
        .update({ trigger_word: editTrigger.trim().toLowerCase(), response_text: editResponse.trim() })
        .eq("id", r.id);
      setResponses(prev => prev.map(x => x.id === r.id ? { ...x, trigger_word: editTrigger.trim().toLowerCase(), response_text: editResponse.trim() } : x));
      toast.success("Regra atualizada");
      cancelEdit();
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await supabase.from("bot_trigger_responses").delete().eq("id", id);
      setResponses(prev => prev.filter(x => x.id !== id));
      toast.success("Regra removida");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    }
  };

  const handleAdd = async () => {
    if (!user || !newTrigger.trim() || !newResponse.trim()) return;
    try {
      const { data } = await supabase
        .from("bot_trigger_responses")
        .insert({ user_id: user.id, trigger_word: newTrigger.trim().toLowerCase(), response_text: newResponse.trim(), active: true })
        .select()
        .single();
      if (data) {
        setResponses(prev => [...prev, data as TriggerResp]);
        setNewTrigger("");
        setNewResponse("");
        toast.success("Nova regra adicionada");
      }
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Regras do Bot">
          <Bot className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-screen max-w-lg sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border sticky top-0 bg-card z-10">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-green-600" />
            Regras do Bot
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Visualize e edite as respostas automáticas. As regras funcionam como um fluxo:
            <span className="font-medium text-foreground"> palavra-chave → resposta</span>
          </p>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : responses.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Adicione regras abaixo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map(r => (
                <div key={r.id} className="rounded-lg border border-border overflow-hidden">
                  {/* Input (trigger) */}
                  <div className="bg-muted/30 px-3 py-2 border-b border-border flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">
                      SE
                    </Badge>
                    {editingId === r.id ? (
                      <Input
                        value={editTrigger}
                        onChange={e => setEditTrigger(e.target.value)}
                        className="h-7 text-xs flex-1"
                        placeholder="palavra-chave"
                      />
                    ) : (
                      <span className="text-xs font-mono bg-orange-500/10 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded font-semibold">
                        {r.trigger_word}
                      </span>
                    )}
                    {editingId !== r.id && (
                      <span className="text-[10px] text-muted-foreground ml-auto">palavra-chave</span>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center py-1">
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>

                  {/* Output (response) */}
                  <div className="bg-green-500/5 px-3 py-2 border-t border-border flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 mt-0.5">
                      ENTÃO
                    </Badge>
                    <div className="flex-1 min-w-0">
                      {editingId === r.id ? (
                        <Textarea
                          value={editResponse}
                          onChange={e => setEditResponse(e.target.value)}
                          className="h-16 text-xs"
                          placeholder="resposta do bot"
                        />
                      ) : (
                        <p className="text-xs text-foreground whitespace-pre-wrap break-words">{r.response_text}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1 px-3 py-1.5 bg-muted/20 border-t border-border">
                    {editingId === r.id ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => handleSave(r)}
                          disabled={saving === r.id}
                        >
                          {saving === r.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                          Salvar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => startEdit(r)}>
                          ✏️ Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-destructive hover:text-destructive"
                          onClick={() => r.id && handleDelete(r.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Excluir
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new rule */}
          <div className="rounded-lg border-2 border-dashed border-border p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Plus className="h-3 w-3" /> Nova regra
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/20 flex-shrink-0">
                  SE
                </Badge>
                <Input
                  value={newTrigger}
                  onChange={e => setNewTrigger(e.target.value)}
                  placeholder="palavra-chave (ex: preco)"
                  className="h-8 text-xs"
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20 mt-1 flex-shrink-0">
                  ENTÃO
                </Badge>
                <Textarea
                  value={newResponse}
                  onChange={e => setNewResponse(e.target.value)}
                  placeholder="resposta que o bot vai enviar..."
                  className="h-16 text-xs"
                />
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={handleAdd}
              disabled={!newTrigger.trim() || !newResponse.trim()}
            >
              <Plus className="h-3 w-3 mr-1" /> Adicionar regra
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
