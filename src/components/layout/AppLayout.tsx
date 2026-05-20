import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRef, useCallback } from "react";

function MainContent() {
  const { user, logout } = useAuth();
  const { state, setOpen, isMobile } = useSidebar();
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleMainClick = useCallback(() => {
    if (!isMobile && state === "expanded") {
      setOpen(false);
    }
  }, [isMobile, state, setOpen]);

  return (
    <div className="min-h-screen flex w-full overflow-hidden">
      <div ref={sidebarRef}>
        <AppSidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0" onClick={handleMainClick}>
        <header className="h-14 flex items-center justify-between border-b border-border px-4 shrink-0 sticky top-0 z-20 bg-background">
          <div className="flex items-center gap-1">
            <SidebarTrigger className="ml-0" onClick={(e) => e.stopPropagation()} />
            <div onClick={(e) => e.stopPropagation()}>
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); logout(); }} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-3 md:p-6 overflow-auto">
          <div className="max-w-full">
            <Outlet />
          </div>
        </main>
      </div>
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
