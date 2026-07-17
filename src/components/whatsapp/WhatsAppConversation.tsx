import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UazapiChat, UazapiMessage } from "@/hooks/useUazapi";

interface Props {
  chat: UazapiChat;
  messages: UazapiMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onBack?: () => void;
  sending: boolean;
}

function formatMsgTime(ts: number) {
  if (!ts) return "";
  const ms = ts > 9999999999 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppConversation({ chat, messages, onSendMessage, onBack, sending }: Props) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<{ id: string; trigger_word: string; response_text: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const handleSend = async () => {
    if (!text.trim()) return;
    const msg = text;
    setText("");
    await onSendMessage(msg);
  };

  const handleEditBotMsg = async (msgText: string) => {
    if (!user) return;
    // Busca a trigger_response que tem esse texto
    const { data } = await supabase
      .from("bot_trigger_responses")
      .select("id, trigger_word, response_text")
      .eq("user_id", user.id)
      .eq("response_text", msgText)
      .limit(1);

    if (data && data.length > 0) {
      setEditingResponse(data[0]);
      setEditText(data[0].response_text);
      setEditDialogOpen(true);
    } else {
      toast.error("Resposta não encontrada nas regras cadastradas");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingResponse || !editText.trim()) return;
    setSavingEdit(true);
    try {
      await supabase
        .from("bot_trigger_responses")
        .update({ response_text: editText.trim() })
        .eq("id", editingResponse.id);
      toast.success("Resposta atualizada!");
      setEditDialogOpen(false);
      setEditingResponse(null);
    } catch (e: any) {
      toast.error("Erro ao atualizar: " + (e?.message || ""));
    } finally {
      setSavingEdit(false);
    }
  };

  const name = chat.customerName || chat.name || chat.wa_contactName || chat.wa_name || chat.phone || chat.wa_chatid;
  const avatarUrl = chat.profilePicUrl || chat.imagePreview || chat.image;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border" style={{ backgroundColor: "hsl(var(--muted))" }}>
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover rounded-full" onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }} />
          ) : null}
          <span className={`text-sm font-medium text-muted-foreground ${avatarUrl ? 'hidden' : ''}`}>{name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{name}</p>
          {chat.customerName && chat.customerName !== chat.name && (
            <p className="text-[10px] text-muted-foreground truncate">{chat.name}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto flex flex-col-reverse p-4 space-y-2 space-y-reverse"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
        {[...messages].reverse().map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.wa_fromMe ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm relative group ${
                msg.wa_fromMe
                  ? "bg-[#dcf8c6] dark:bg-green-900/50 text-foreground"
                  : "bg-card text-foreground"
              }`}
            >
              {msg.wa_type === "carousel" ? (
                <div className="space-y-3 py-1">
                  <p className="font-medium text-xs mb-1">Escolha uma opção:</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {(() => {
                      try {
                        const content = typeof msg.wa_text === 'string' ? JSON.parse(msg.wa_text) : msg.wa_text;
                        const cards = Array.isArray(content) ? content : (content?.cards || []);
                        return cards.map((card: any, idx: number) => (
                          <div key={idx} className="min-w-[200px] flex-shrink-0 bg-background rounded-md border border-border overflow-hidden snap-center shadow-sm">
                            {card.image_url && (
                              <img src={card.image_url} alt="" className="w-full h-24 object-cover" />
                            )}
                            <div className="p-2 space-y-1">
                              <p className="font-bold text-xs truncate">{card.title}</p>
                              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{card.description}</p>
                              <div className="pt-1 flex flex-col gap-1">
                                {(card.buttons || []).map((btn: any, bIdx: number) => (
                                  <Button
                                    key={bIdx}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] w-full py-0"
                                    onClick={() => onSendMessage(btn.text || btn.title)}
                                  >
                                    {btn.title || btn.text}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ));
                      } catch (e) {
                        return <p className="text-xs text-destructive italic">Erro ao carregar carrossel</p>;
                      }
                    })()}
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.wa_text || `[${msg.wa_type}]`}</p>
              )}

              {/* Bot edit button - aparece ao passar mouse */}
              {msg.msg_type === "bot" && msg.wa_text && (
                <button
                  onClick={() => handleEditBotMsg(msg.wa_text)}
                  className="absolute -top-2 -right-2 h-5 w-5 bg-green-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-green-700"
                  title="Editar resposta do bot"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}

              <div className="flex items-center justify-end gap-1 mt-1">
                {msg.msg_type === "bot" && (
                  <span className="text-[9px] bg-green-600/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-sm font-medium">Bot</span>
                )}
                <p className={`text-[10px] text-right ${msg.wa_fromMe ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                  {formatMsgTime(msg.wa_timestamp)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-border bg-muted/30">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Digite uma mensagem"
          className="flex-1"
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <Button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          size="icon"
          style={{ backgroundColor: "#25D366" }}
          className="text-white hover:opacity-90"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { setEditDialogOpen(o); if (!o) setEditingResponse(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar resposta automática</DialogTitle>
          </DialogHeader>
          {editingResponse && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Palavra-chave</Label>
                <p className="text-sm font-medium">{editingResponse.trigger_word}</p>
              </div>
              <div className="space-y-1">
                <Label>Resposta</Label>
                <Textarea
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingResponse(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit || !editText.trim()}>
              {savingEdit ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
