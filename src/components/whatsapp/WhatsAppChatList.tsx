import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import type { UazapiChat } from "@/hooks/useUazapi";

interface Props {
  chats: UazapiChat[];
  activeChatId: string | null;
  onSelectChat: (chat: UazapiChat) => void;
  selectionMode?: boolean;
  selectedChats?: Set<string>;
  onToggleSelect?: (chatId: string) => void;
}

function formatTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function WhatsAppChatList({ chats, activeChatId, onSelectChat, selectionMode, selectedChats, onToggleSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = chats
    .filter(c => {
      const name = c.customerName || c.name || c.wa_contactName || c.wa_name || c.phone || "";
      return name.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => (b.wa_lastMsgTimestamp || 0) - (a.wa_lastMsgTimestamp || 0));

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar ou começar uma nova conversa"
            className="pl-9 bg-muted/50 border-0 text-sm"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(chat => {
          const name = chat.customerName || chat.name || chat.wa_contactName || chat.wa_name || chat.phone || chat.wa_chatid;
          const avatarUrl = chat.profilePicUrl || chat.imagePreview || chat.image;
          const isActive = chat.wa_chatid === activeChatId;
          const isSelected = selectedChats?.has(chat.wa_chatid);

          return (
            <div
              key={chat.wa_chatid}
              onClick={() => selectionMode ? onToggleSelect?.(chat.wa_chatid) : onSelectChat(chat)}
              className={`flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-border/50 hover:bg-muted/50 transition-colors ${isActive && !selectionMode ? "bg-muted" : ""} ${isSelected ? "bg-primary/10" : ""}`}
            >
              {selectionMode && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect?.(chat.wa_chatid)}
                    className="flex-shrink-0"
                  />
                </div>
              )}
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover rounded-full" onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }} />
                ) : null}
                <span className={`text-lg font-medium text-muted-foreground ${avatarUrl ? 'hidden' : ''}`}>
                  {name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-foreground truncate">{name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatTime(chat.wa_lastMsgTimestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">
                    {chat.wa_lastMessageTextVote || ""}
                  </span>
                  {chat.wa_unreadCount > 0 && (
                    <span className="ml-2 flex-shrink-0 h-5 min-w-[20px] px-1 rounded-full text-[11px] font-medium flex items-center justify-center text-white" style={{ backgroundColor: "#25D366" }}>
                      {chat.wa_unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center p-4">Nenhuma conversa encontrada</p>
        )}
      </div>
    </div>
  );
}
