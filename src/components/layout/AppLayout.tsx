import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, LogOut, X, Trash2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRef, useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

function MainContent() {
  const { user, logout } = useAuth();
  const { state, setOpen, isMobile } = useSidebar();
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Push subscription for professional/barber
  const pushSub = usePushSubscription(undefined, user?.id, !!user);

  // Pull-to-refresh (native app feel)
  const { pullDistance, refreshing } = usePullToRefresh({
    onRefresh: () => window.location.reload(),
  });

  // Notification bell
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchUnread = async () => {
      const { data, error } = await supabase
        .from("client_notifications")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("read", false);
      if (!error) setUnreadCount(data?.length || 0);
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const openNotifications = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("client_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications(data || []);
    setNotifOpen(true);
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    await supabase
      .from("client_notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleMainClick = useCallback(() => {
    if (!isMobile && state === "expanded") {
      setOpen(false);
    }
  }, [isMobile, state, setOpen]);

  return (
    <div className="h-dvh flex w-full overflow-hidden bg-background">
      <div ref={sidebarRef}>
        <AppSidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0 h-full" onClick={handleMainClick}>
        <header className="h-14 flex items-center justify-between border-b border-border/30 px-4 shrink-0 sticky top-0 z-20 bg-background/70 backdrop-blur-2xl">
          <div className="flex items-center gap-1">
            <SidebarTrigger className="ml-0 hover:bg-muted/50 rounded-lg transition-colors" onClick={(e) => e.stopPropagation()} />
            <div onClick={(e) => e.stopPropagation()}>
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={openNotifications} className="relative h-9 w-9 rounded-xl hover:bg-muted/50 transition-all" title="Notificações">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold min-w-[15px] h-[15px] flex items-center justify-center rounded-full ring-2 ring-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
            <span className="text-[13px] text-muted-foreground hidden sm:inline font-medium">
              {user?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); logout(); }} className="h-9 w-9 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground/50 hover:text-red-500 transition-all" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-3 md:p-6 overflow-auto">
          {/* Pull-to-refresh indicator */}
          {(pullDistance > 0 || refreshing) && (
            <div className="flex items-center justify-center" style={{ height: `${pullDistance}px`, opacity: Math.min(pullDistance / 70, 1) }}>
              <motion.div
                animate={{ rotate: refreshing ? 360 : 0 }}
                transition={{ repeat: refreshing ? Infinity : 0, duration: 1, ease: "linear" }}
                className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full"
              />
            </div>
          )}
          <div className="max-w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Notifications dialog */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center overflow-hidden" onClick={() => setNotifOpen(false)}>
          <div className="bg-card w-full sm:max-w-md sm:rounded-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Notificações</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary font-medium">Marcar tudo como lido</button>
                )}
                <button onClick={() => setNotifOpen(false)} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((n: any) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl mb-1 cursor-pointer group relative ${n.read ? "bg-transparent hover:bg-muted/30" : "bg-primary/5 hover:bg-primary/10"}`}
                    onClick={async () => {
                      await supabase.from("client_notifications").update({ read: true }).eq("id", n.id);
                      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                      setUnreadCount(c => Math.max(0, c - 1));
                      if (n.url) window.location.href = n.url;
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${n.read ? "bg-transparent" : "bg-primary"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          {format(new Date(n.created_at), "dd/MM HH:mm")}
                        </p>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await supabase.rpc("client_delete_notification", { p_notification_id: n.id });
                          setNotifications(prev => prev.filter(x => x.id !== n.id));
                          if (!n.read) setUnreadCount(c => Math.max(0, c - 1));
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-md flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
                        title="Excluir notificação"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  

  return (
    <SidebarProvider>
      <MainContent />
    </SidebarProvider>
  );
}
