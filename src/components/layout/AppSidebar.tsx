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
import { Users, Settings, Shield, Scissors, BarChart2, Clock, CreditCard, MessageSquare, Bot, CalendarClock, Megaphone, UserCheck, Kanban, Smartphone, Package, ShoppingCart } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const generalItems = [
  { title: "Relatórios", url: "/reports", icon: BarChart2 },
  { title: "Agendas", url: "/scheduling", icon: CalendarClock },
  { title: "Vencimentos", url: "/expirations", icon: Clock },
];

const salesItems = [
  { title: "Vendas", url: "/sales", icon: ShoppingCart },
  { title: "Produtos", url: "/products", icon: Package },
];

const managementItems = [
  { title: "Clientes", url: "/clients", icon: Users },
  { title: "Profissionais", url: "/professionals", icon: UserCheck },
  { title: "Assinaturas", url: "/subscriptions", icon: CreditCard },
];

const automationItems = [
  { title: "WhatsApp", url: "/whatsapp", icon: MessageSquare },
  { title: "CRM", url: "/crm", icon: Kanban },
  { title: "Campanhas", url: "/campaigns", icon: Megaphone },
];

const settingsItems = [
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Página do Cliente", url: "/client-preview", icon: Smartphone },
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
              {!collapsed && "Geral"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {generalItems.map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>
              {!collapsed && "Vendas & Estoque"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {salesItems.map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>
              {!collapsed && "Gestão"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managementItems.map(renderItem)}
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

          <SidebarGroup>
            <SidebarGroupLabel>
              {!collapsed && "Configurações"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsItems.map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

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
