import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft } from "lucide-react";
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
  // Handle both seconds and milliseconds timestamps
  const ms = ts > 9999999999 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppConversation({ chat, messages, onSendMessage, onBack, sending }: Props) {
  const [text, setText] = useState("");
  

  // With flex-col-reverse, scroll is naturally at the bottom

  const handleSend = async () => {
    if (!text.trim()) return;
    const msg = text;
    setText("");
    await onSendMessage(msg);
  };

  const name = chat.name || chat.wa_contactName || chat.wa_name || chat.phone || chat.wa_chatid;

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
          {chat.imagePreview || chat.image ? (
            <img src={chat.imagePreview || chat.image} alt="" className="h-full w-full object-cover rounded-full" />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">{name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{name}</p>
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
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${
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
              <p className={`text-[10px] mt-1 text-right ${msg.wa_fromMe ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                {formatMsgTime(msg.wa_timestamp)}
              </p>
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
    </div>
  );
}
