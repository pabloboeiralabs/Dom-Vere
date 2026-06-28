import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Plus, Trash2, Save, Bot, MessageSquare, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type TriggerResp = {
  id?: string;
  trigger_word: string;
  response_text: string;
  active: boolean;
};

function Node({ icon, label, color, children, active }: { icon: string; label: string; color: string; children: React.ReactNode; active?: boolean }) {
  return (
    <div className="relative">
      {/* Connection dot top */}
      <div className="flex justify-center">
        <div className={`w-2.5 h-2.5 rounded-full border-2 ${active ? "bg-green-500 border-green-500" : "bg-background border-border"}`} />
      </div>
      {/* Node body */}
      <div className={`mt-1 rounded-xl border-2 overflow-hidden shadow-sm transition-all ${active ? "border-green-500/50 shadow-green-500/10" : "border-border"}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs text-white ${color}`}>
          <span>{icon}</span>
          <span className="font-semibold uppercase tracking-wider">{label}</span>
        </div>
        {/* Content */}
        <div className="px-3 py-2 bg-card">
          {children}
        </div>
      </div>
      {/* Connection dot bottom */}
      <div className="flex justify-center mt-1">
        <div className={`w-2.5 h-2.5 rounded-full border-2 ${active ? "bg-green-500 border-green-500" : "bg-background border-border"}`} />
      </div>
    </div>
  );
}

function ConnectorLine() {
  return (
    <div className="flex justify-center py-0.5">
      <svg width="20" height="16" viewBox="0 0 20 16" className="text-muted-foreground/40">
        <line x1="10" y1="0" x2="10" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="3,3" />
        <polygon points="6,10 10,16 14,10" fill="currentColor" />
      </svg>
    </div>
  );
}

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
        <Button variant="ghost" size="icon" title="Fluxo do Bot (n8n)">
          <Bot className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-screen max-w-lg sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border sticky top-0 bg-card z-10">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-green-600" />
            Fluxo do Bot
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Cada regra funciona como um nó no fluxo:
            <span className="font-medium text-foreground"> cliente digita → bot responde</span>
          </p>
        </SheetHeader>

        <div className="p-5 space-y-6">
          {/* Start node */}
          <div className="flex justify-center">
            <div className="bg-green-600/10 text-green-700 dark:text-green-400 border border-green-600/20 rounded-full px-4 py-1 text-xs font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" />
              Cliente envia mensagem
            </div>
          </div>

          <ConnectorLine />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : responses.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Adicione regras abaixo para criar o fluxo</p>
            </div>
          ) : (
            <div className="space-y-0">
              {responses.map((r, idx) => (
                <div key={r.id}>
                  {/* Trigger node */}
                  <Node icon="🔍" label="SE" color="bg-orange-600" active={editingId === r.id}>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Palavra-chave</p>
                      {editingId === r.id ? (
                        <Input
                          value={editTrigger}
                          onChange={e => setEditTrigger(e.target.value)}
                          className="h-8 text-sm font-mono"
                          placeholder="palavra-chave"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
                            {r.trigger_word}
                          </span>
                          <span className="text-[10px] text-muted-foreground">no texto do cliente</span>
                        </div>
                      )}
                    </div>
                  </Node>

                  <ConnectorLine />

                  {/* Response node */}
                  <Node icon="💬" label="ENTÃO" color="bg-green-600" active={editingId === r.id}>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Resposta</p>
                      {editingId === r.id ? (
                        <Textarea
                          value={editResponse}
                          onChange={e => setEditResponse(e.target.value)}
                          className="h-20 text-sm"
                          placeholder="mensagem que o bot vai enviar"
                        />
                      ) : (
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {r.response_text}
                        </p>
                      )}
                    </div>
                  </Node>

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-2 py-2">
                    {editingId === r.id ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleSave(r)}
                          disabled={saving === r.id}
                        >
                          {saving === r.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                          Salvar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950" onClick={() => startEdit(r)}>
                          ✏️ Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => r.id && handleDelete(r.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </div>

                  {idx < responses.length - 1 && (
                    <div className="flex justify-center py-1">
                      <svg width="16" height="20" viewBox="0 0 16 20" className="text-muted-foreground/30">
                        <line x1="8" y1="0" x2="8" y2="16" stroke="currentColor" strokeWidth="2" strokeDasharray="3,3" />
                        <polygon points="4,14 8,20 12,14" fill="currentColor" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* End node */}
          {responses.length > 0 && (
            <>
              <ConnectorLine />
              <div className="flex justify-center">
                <div className="bg-blue-600/10 text-blue-700 dark:text-blue-400 border border-blue-600/20 rounded-full px-4 py-1 text-xs font-medium flex items-center gap-1.5">
                  🤖 Bot responde com a mensagem
                </div>
              </div>
            </>
          )}

          {/* Add new rule - n8n style */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Novo nó</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* New trigger */}
            <Node icon="🔍" label="SE" color="bg-orange-600">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Palavra-chave</p>
                <Input
                  value={newTrigger}
                  onChange={e => setNewTrigger(e.target.value)}
                  placeholder="ex: preco, horario, endereco"
                  className="h-8 text-sm"
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
              </div>
            </Node>

            <ConnectorLine />

            {/* New response */}
            <Node icon="💬" label="ENTÃO" color="bg-green-600">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Resposta</p>
                <Textarea
                  value={newResponse}
                  onChange={e => setNewResponse(e.target.value)}
                  placeholder="mensagem que o bot vai enviar quando detectar a palavra..."
                  className="h-20 text-sm"
                />
              </div>
            </Node>

            <div className="flex justify-center mt-2">
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs"
                onClick={handleAdd}
                disabled={!newTrigger.trim() || !newResponse.trim()}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar ao fluxo
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
