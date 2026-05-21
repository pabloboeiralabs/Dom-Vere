import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Users, Settings, Shield, Scissors, BarChart2, Clock, CreditCard, MessageSquare, Bot, CalendarClock, Megaphone, UserCheck, Kanban, Smartphone, Package } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const mainItems = [
  { title: "Relatórios", url: "/reports", icon: BarChart2 },
  { title: "Clientes", url: "/clients", icon: Users },
  { title: "Profissionais", url: "/professionals", icon: UserCheck },
  { title: "Vencimentos", url: "/expirations", icon: Clock },
  { title: "Produtos", url: "/products", icon: Package },
  { title: "Assinaturas", url: "/subscriptions", icon: CreditCard },
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Página do Cliente", url: "/client-preview", icon: Smartphone },
];

const automationItems = [
  { title: "WhatsApp", url: "/whatsapp", icon: MessageSquare },
  { title: "CRM", url: "/crm", icon: Kanban },
  { title: "Agendamento", url: "/scheduling", icon: CalendarClock },
  { title: "Campanhas", url: "/campaigns", icon: Megaphone },
];

const adminItems = [
  { title: "Admin", url: "/admin", icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();

  const renderItem = (item: { title: string; url: string; icon: React.ElementType }) => (
    <SidebarMenuItem key={item.title}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton asChild>
            <NavLink
              to={item.url}
              className="hover:bg-accent/50"
              activeClassName="bg-accent text-accent-foreground font-medium"
            >
              <item.icon className="mr-2 h-4 w-4" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.title}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4" />
                    {!collapsed && <span>Barber Credits</span>}
                  </div>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">Barber Credits</TooltipContent>}
              </Tooltip>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainItems.map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {(user?.subscription_type === "premium" || user?.role === "admin") && (
            <SidebarGroup>
              <SidebarGroupLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      {!collapsed && <span>Automação</span>}
                    </div>
                  </TooltipTrigger>
                  {collapsed && <TooltipContent side="right">Automação</TooltipContent>}
                </Tooltip>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {automationItems.map(renderItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {user?.role === "admin" && (
            <SidebarGroup>
              <SidebarGroupLabel>
                {!collapsed && "Administração"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map(renderItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
