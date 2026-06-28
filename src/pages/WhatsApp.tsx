import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUazapi, type UazapiChat, type UazapiMessage } from "@/hooks/useUazapi";
import { WhatsAppConnect } from "@/components/whatsapp/WhatsAppConnect";
import { WhatsAppChatList } from "@/components/whatsapp/WhatsAppChatList";
import { WhatsAppConversation } from "@/components/whatsapp/WhatsAppConversation";
import { WhatsAppBotWizard } from "@/components/whatsapp/WhatsAppBotWizard";
import { WhatsAppBotConfigTabs } from "@/components/whatsapp/WhatsAppBotConfigTabs";
import { WhatsAppJsonConfigs } from "@/components/whatsapp/WhatsAppJsonConfigs";
import { WhatsAppAdminSidebar } from "@/components/whatsapp/WhatsAppAdminSidebar";
import { WhatsAppBotResponses } from "@/components/whatsapp/WhatsAppBotResponses";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { MessageSquare, Settings2, Wifi, WifiOff, Loader2, LayoutDashboard, Trash2, CheckSquare, X, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function WhatsApp() {
  const { user } = useAuth();
  const {
    config, instanceStatus, loading,
    getStatus, connect, disconnect, deleteInstance,
    getChats, getMessages, sendText, updateChatbotSettings, saveBotConfig, getAgents, apiCall,
    setWebhook, getWebhook,
  } = useUazapi();

  const [chats, setChats] = useState<UazapiChat[]>([]);
  const [activeChat, setActiveChat] = useState<UazapiChat | null>(null);
  const [messages, setMessages] = useState<UazapiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showAdminSidebar, setShowAdminSidebar] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [chatTab, setChatTab] = useState<"conversas" | "leads" | "espera">("conversas");
  const [crmLeads, setCrmLeads] = useState<any[]>([]);
  const [hiddenChats, setHiddenChats] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("wa_hidden_chats");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [hideAllChats, setHideAllChats] = useState<boolean>(() => {
    try {
      return localStorage.getItem("wa_hide_all_chats") === "1";
    } catch {
      return false;
    }
  });

  const hiddenChatsRef = useRef<Set<string>>(hiddenChats);
  const hideAllChatsRef = useRef<boolean>(hideAllChats);
  const readChatsRef = useRef<Set<string>>(new Set());
  const chatPollRef = useRef<ReturnType<typeof setInterval>>();
  const msgPollRef = useRef<ReturnType<typeof setInterval>>();

  const isConnected = instanceStatus?.status === "connected";

  // Load CRM leads for tabs
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("crm_leads").select("id, wa_chatid, bot_paused, bot_msg_count, name, phone").eq("user_id", user.id);
      setCrmLeads(data || []);
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const leadsCount = useMemo(() => crmLeads.filter(l => l.bot_msg_count > 0).length, [crmLeads]);
  const waitingCount = useMemo(() => crmLeads.filter(l => l.bot_paused).length, [crmLeads]);

  // Filter chats based on tab
  const filteredChats = useMemo(() => {
    const visible = hideAllChats ? [] : chats.filter(chat => !hiddenChats.has(chat.wa_chatid));
    if (chatTab === "leads") {
      const leadChatIds = new Set(crmLeads.filter(l => l.bot_msg_count > 0).map(l => l.wa_chatid));
      return visible.filter(c => leadChatIds.has(c.wa_chatid));
    }
    if (chatTab === "espera") {
      const pausedChatIds = new Set(crmLeads.filter(l => l.bot_paused).map(l => l.wa_chatid));
      return visible.filter(c => pausedChatIds.has(c.wa_chatid));
    }
    return visible;
  }, [chats, hiddenChats, hideAllChats, chatTab, crmLeads]);

  // Keep refs/storage in sync
  useEffect(() => {
    hiddenChatsRef.current = hiddenChats;
    try {
      localStorage.setItem("wa_hidden_chats", JSON.stringify([...hiddenChats]));
    } catch {}
  }, [hiddenChats]);

  useEffect(() => {
    hideAllChatsRef.current = hideAllChats;
    try {
      localStorage.setItem("wa_hide_all_chats", hideAllChats ? "1" : "0");
    } catch {}
  }, [hideAllChats]);

  // Poll chats
  useEffect(() => {
    if (!isConnected) return;
    const load = async () => {
      try {
        const nextChats = await getChats();

        if (hideAllChatsRef.current) {
          const withNewMessages = nextChats.filter(c => c.wa_unreadCount > 0);
          if (withNewMessages.length > 0) {
            setHideAllChats(false);
            setHiddenChats((prev) => {
              const next = new Set(prev);
              for (const c of withNewMessages) next.delete(c.wa_chatid);
              return next;
            });
          } else {
            setHiddenChats((prev) => {
              const next = new Set(prev);
              let changed = false;
              for (const c of nextChats) {
                if (!next.has(c.wa_chatid)) {
                  next.add(c.wa_chatid);
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
            setChats([]);
            return;
          }
        }

        // Reexibir chats ocultos que receberam novas mensagens
        setHiddenChats((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const c of nextChats) {
            if (next.has(c.wa_chatid) && c.wa_unreadCount > 0) {
              next.delete(c.wa_chatid);
              changed = true;
            }
          }
          return changed ? next : prev;
        });

        const filtered = nextChats
          .filter((chat) => !hiddenChatsRef.current.has(chat.wa_chatid))
          .map((chat) => {
            if (readChatsRef.current.has(chat.wa_chatid)) {
              return { ...chat, wa_unreadCount: 0 };
            }
            return chat;
          });

        setChats(filtered);
      } catch {}
    };
    load();
    chatPollRef.current = setInterval(load, 5000);
    return () => {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
    };
  }, [isConnected, getChats]);

  // Poll messages (faster while chat is open)
  useEffect(() => {
    if (!activeChat || !isConnected) return;
    const load = async () => {
      try { setMessages(await getMessages(activeChat.wa_chatid, 50)); } catch {}
    };
    load();
    msgPollRef.current = setInterval(load, 2000);
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [activeChat, isConnected, getMessages]);

  const handleSelectChat = useCallback((chat: UazapiChat) => {
    setActiveChat(chat);
    setMessages([]);
    setShowMobileChat(true);
    // Mark as read locally and persist across polls
    readChatsRef.current.add(chat.wa_chatid);
    if (chat.wa_unreadCount > 0) {
      const rawNumber = (chat.phone || chat.wa_chatid).replace(/[@\s\-+]|s\.whatsapp\.net|g\.us/g, "").replace(/\D/g, "");
      if (rawNumber) apiCall("POST", "/chat/markasread", { number: rawNumber }).catch(() => {});
      setChats(prev => prev.map(c => c.wa_chatid === chat.wa_chatid ? { ...c, wa_unreadCount: 0 } : c));
    }
  }, [apiCall]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!activeChat) return;
    setSending(true);
    // Optimistic UI: show message instantly
    const optimisticMsg: UazapiMessage = {
      id: `optimistic-${Date.now()}`,
      wa_chatid: activeChat.wa_chatid,
      wa_fromMe: true,
      wa_text: text,
      wa_type: "text",
      wa_timestamp: Math.floor(Date.now() / 1000),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    try {
      const number = activeChat.phone || activeChat.wa_chatid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      await sendText(number, text);
      // Refresh in background (don't block UI)
      getMessages(activeChat.wa_chatid, 50).then(setMessages).catch(() => {});
    } catch {}
    setSending(false);
  }, [activeChat, sendText, getMessages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not configured or not connected - show wizard
  if (!config || !isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] py-4">
        <WhatsAppBotWizard />
      </div>
    );
  }

  // Connected - WhatsApp Web layout
  return (
    <div className="flex h-[calc(100vh-4rem)] border border-border rounded-lg overflow-hidden bg-card -mx-3 md:mx-0">
      <ResizablePanelGroup direction="horizontal">
        {/* Left panel - Chat list */}
        <ResizablePanel defaultSize={35} minSize={30} maxSize={50} className={`flex flex-col ${showMobileChat ? "hidden md:flex" : "flex"}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50 flex-shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              {instanceStatus?.profilePicUrl && (
                <img src={instanceStatus.profilePicUrl} alt="" className="h-8 w-8 rounded-full" />
              )}
              <span className="font-medium text-sm text-foreground">
                {instanceStatus?.profileName || "WhatsApp"}
              </span>
              <Wifi className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-1">
              {selectionMode ? (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={selectedChats.size === 0} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4 mr-1" /> Apagar ({selectedChats.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar {selectedChats.size} conversa{selectedChats.size > 1 ? "s" : ""}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          As conversas selecionadas serão removidas. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          try {
                            for (const chatId of selectedChats) {
                              const chat = chats.find(c => c.wa_chatid === chatId);
                              const number = chat?.phone || chatId.replace("@s.whatsapp.net", "").replace("@g.us", "");
                              await apiCall("POST", "/chat/delete", { number, chatid: chatId });
                            }
                            const deletedIds = new Set(selectedChats);
                            setHiddenChats(prev => new Set([...prev, ...deletedIds]));
                            setChats(prev => prev.filter(c => !deletedIds.has(c.wa_chatid)));
                            if (activeChat && deletedIds.has(activeChat.wa_chatid)) {
                              setActiveChat(null);
                              setMessages([]);
                            }
                            toast.success(`${selectedChats.size} conversa${selectedChats.size > 1 ? "s" : ""} apagada${selectedChats.size > 1 ? "s" : ""}`);
                            setSelectedChats(new Set());
                            setSelectionMode(false);
                          } catch (e: any) {
                            toast.error(e?.message || "Erro ao apagar conversas");
                          }
                        }}>Apagar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const allIds = chats.map(c => c.wa_chatid);
                    if (selectedChats.size === allIds.length) {
                      setSelectedChats(new Set());
                    } else {
                      setSelectedChats(new Set(allIds));
                    }
                  }}>
                    {selectedChats.size === chats.length ? "Desmarcar" : "Selecionar tudo"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setSelectionMode(false); setSelectedChats(new Set()); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  {/* 1. Regras do Bot */}
                  <WhatsAppBotResponses />
                  {/* 3. Configurações */}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" title="Configurações">
                        <Settings2 className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="overflow-y-auto w-screen max-w-none sm:max-w-none p-4 md:p-6">
                      <Tabs defaultValue="connection">
                        <TabsList className="w-full">
                          <TabsTrigger value="connection" className="flex-1">Conexão</TabsTrigger>
                          <TabsTrigger value="bot" className="flex-1">Bot</TabsTrigger>
                          <TabsTrigger value="json" className="flex-1">JSONs</TabsTrigger>
                        </TabsList>
                        <TabsContent value="connection">
                          <WhatsAppConnect
                            config={config}
                            instanceStatus={instanceStatus}
                            onConnect={connect}
                            onDisconnect={disconnect}
                            onGetStatus={getStatus}
                          />
                        </TabsContent>
                        <TabsContent value="bot">
                          <WhatsAppBotConfigTabs />
                        </TabsContent>
                        <TabsContent value="json">
                          <WhatsAppJsonConfigs />
                        </TabsContent>
                      </Tabs>
                    </SheetContent>
                  </Sheet>
                  {/* 2. Business */}
                  <Button variant="ghost" size="icon" onClick={() => setShowAdminSidebar(!showAdminSidebar)} title="Ferramentas Business">
                    <LayoutDashboard className="h-5 w-5" />
                  </Button>
                  {/* 3. Seletor */}
                  <Button variant="ghost" size="icon" title="Selecionar conversas" onClick={() => setSelectionMode(true)}>
                    <CheckSquare className="h-4 w-4" />
                  </Button>
                  {/* 4. Lixeiro (apagar todas) */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Apagar todas as conversas" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar todas as conversas?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Todas as conversas serão removidas da lista. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          try {
                            for (const chat of chats) {
                              const number = chat.phone || chat.wa_chatid.replace("@s.whatsapp.net", "").replace("@g.us", "");
                              await apiCall("POST", "/chat/delete", { number, chatid: chat.wa_chatid });
                            }
                            const deletedIds = new Set(chats.map(chat => chat.wa_chatid));
                            setHiddenChats(prev => new Set([...prev, ...deletedIds]));
                            setHideAllChats(true);
                            setChats([]);
                            setActiveChat(null);
                            setMessages([]);
                            toast.success("Todas as conversas foram apagadas e ocultadas permanentemente");
                          } catch (e: any) {
                            toast.error(e?.message || "Erro ao apagar conversas");
                          }
                        }}>Apagar tudo</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {/* 5. Desconectar */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Desconectar">
                        <WifiOff className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Desconectar e excluir instância?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A instância do WhatsApp será desconectada e excluída do provedor para evitar cobranças. Para usar novamente, será necessário criar uma nova instância.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          try {
                            await deleteInstance();
                            toast.success("WhatsApp desconectado e instância excluída");
                            window.location.reload();
                          } catch (e: any) {
                            toast.error(e?.message || "Erro ao desconectar");
                          }
                        }}>Desconectar e excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>
          {/* Summary bar + Tabs */}
          <div className="px-3 py-2 border-b border-border space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" /> {leadsCount} leads</span>
              <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {waitingCount} espera</span>
            </div>
            <Tabs value={chatTab} onValueChange={(v) => setChatTab(v as any)}>
              <TabsList className="w-full h-8">
                <TabsTrigger value="conversas" className="flex-1 text-xs">Conversas</TabsTrigger>
                <TabsTrigger value="leads" className="flex-1 text-xs">Leads {leadsCount > 0 && <Badge variant="secondary" className="ml-1 text-[9px] px-1">{leadsCount}</Badge>}</TabsTrigger>
                <TabsTrigger value="espera" className="flex-1 text-xs">Espera {waitingCount > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1">{waitingCount}</Badge>}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <WhatsAppChatList
            chats={filteredChats}
            activeChatId={activeChat?.wa_chatid || null}
            onSelectChat={handleSelectChat}
            selectionMode={selectionMode}
            selectedChats={selectedChats}
            onToggleSelect={(chatId) => {
              setSelectedChats(prev => {
                const next = new Set(prev);
                if (next.has(chatId)) next.delete(chatId);
                else next.add(chatId);
                return next;
              });
            }}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel - Conversation */}
        <ResizablePanel defaultSize={70} minSize={40} className={`flex flex-col ${!showMobileChat && !activeChat ? "hidden md:flex" : ""} ${showMobileChat ? "flex" : "hidden md:flex"}`}>
          {activeChat ? (
            <WhatsAppConversation
              chat={activeChat}
              messages={messages}
              onSendMessage={handleSendMessage}
              onBack={() => { setShowMobileChat(false); }}
              sending={sending}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/20">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">WhatsApp Web</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">Selecione uma conversa para começar</p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Admin Sidebar */}
      <WhatsAppAdminSidebar
        open={showAdminSidebar}
        onClose={() => setShowAdminSidebar(false)}
        onApiCall={apiCall}
        instanceStatus={instanceStatus}
      />
    </div>
  );
}
