import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PremiumRoute } from "@/components/layout/PremiumRoute";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Sales = lazy(() => import("@/pages/Sales"));
const Finance = lazy(() => import("@/pages/Finance"));
const Products = lazy(() => import("@/pages/Products"));
const Expirations = lazy(() => import("@/pages/Expirations"));
const Settings = lazy(() => import("@/pages/Settings"));
const Admin = lazy(() => import("@/pages/Admin"));
const Reports = lazy(() => import("@/pages/Reports"));
const WhatsApp = lazy(() => import("@/pages/WhatsApp"));
const WhatsAppBotFlow = lazy(() => import("@/components/whatsapp/WhatsAppBotFlow"));
const Scheduling = lazy(() => import("@/pages/Scheduling"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Professionals = lazy(() => import("@/pages/Professionals"));
const ProfessionalDetail = lazy(() => import("@/pages/ProfessionalDetail"));
const Booking = lazy(() => import("@/pages/Booking"));
const BarberLogin = lazy(() => import("@/pages/BarberLogin"));
const BarberHome = lazy(() => import("@/pages/BarberHome"));
const CrmKanban = lazy(() => import("@/pages/CrmKanban"));
const ProfessionalDashboard = lazy(() => import("@/pages/ProfessionalDashboard"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const AdminCredentials = lazy(() => import("@/pages/AdminCredentials"));
const ClientLayoutPreview = lazy(() => import("@/pages/ClientLayoutPreview"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const Reminders = lazy(() => import("@/pages/Reminders"));

const SuspenseWrap = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="flex-1 flex items-center justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
    {children}
  </Suspense>
);

const PwaThemeSync = () => {
  const location = useLocation();

  useEffect(() => {
    let isBarber = false;
    // Domain-based: cliente/agendar→Client, barber/painel→Barber/Admin
    if (window.location.hostname.includes('cliente') || window.location.hostname.includes('agendar')) {
      isBarber = false;
    } else if (window.location.hostname.includes('barber') || window.location.hostname.includes('painel')) {
      isBarber = true;
    } else {
      // Fallback para localhost/desenvolvimento
      isBarber = !location.pathname.startsWith('/cliente') && !location.pathname.startsWith('/booking');
    }
    const isClient = !isBarber;

    const manifestHref = isClient ? '/manifest-client.webmanifest' : '/manifest-barber.webmanifest';
    const iconHref = isClient ? '/client-icon-192.png' : '/barber-icon-192.png';
    const faviconHref = isClient ? '/client-favicon.png' : '/barber-favicon.png';
    const themeColor = isClient ? '#10162e' : '#ffffff';

    // Update Manifest
    let linkManifest = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (linkManifest) {
      linkManifest.href = manifestHref;
    } else {
      linkManifest = document.createElement('link');
      linkManifest.rel = 'manifest';
      linkManifest.href = manifestHref;
      document.head.appendChild(linkManifest);
    }

    // Update Apple Touch Icon
    let linkApple = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (linkApple) {
      linkApple.href = iconHref;
    } else {
      linkApple = document.createElement('link');
      linkApple.rel = 'apple-touch-icon';
      linkApple.href = iconHref;
      document.head.appendChild(linkApple);
    }

    // Update Favicon
    let linkFavicon = document.querySelector('link[rel="icon"][type="image/png"]') as HTMLLinkElement;
    if (linkFavicon) {
      linkFavicon.href = faviconHref;
    } else {
      linkFavicon = document.createElement('link');
      linkFavicon.rel = 'icon';
      linkFavicon.type = 'image/png';
      linkFavicon.href = faviconHref;
      document.head.appendChild(linkFavicon);
    }

    // Update theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeColor);
    }
  }, [location]);

  return null;
};

const BookingRedirect = () => {
  // Agendar link — renderiza Booking direto na / sem redirect
  const SHOP_USER_ID = "3ec3d3cd-4788-4d8d-bd70-837fc4eff887";
  return <SuspenseWrap><Booking userId={SHOP_USER_ID} /></SuspenseWrap>;
};

// Redirect to appropriate login based on domain
const LoginRouter = () => {
  const isBarberDomain = window.location.hostname.includes('barber');
  return isBarberDomain ? <SuspenseWrap><BarberLogin /></SuspenseWrap> : <Login />;
};

const RootRedirect = () => {
  // Domain-based routing
  const isAgendar = window.location.hostname.includes('agendar');
  const isClientDomain = window.location.hostname.includes('cliente');
  const isBarberDomain = window.location.hostname.includes('barber');
  const isPainel = window.location.hostname.includes('painel');

  if (isAgendar) {
    return <BookingRedirect />;
  }
  if (isClientDomain) {
    return <Navigate to="/cliente" replace />;
  }
  if (isBarberDomain) {
    return <Navigate to="/barber-panel" replace />;
  }
  if (isPainel) {
    return <Navigate to="/reports" replace />;
  }

  // Fallback para localhost baseado no caminho
  const isLocalClient = window.location.pathname.startsWith('/cliente') || window.location.pathname.startsWith('/booking');
  if (isLocalClient) {
    return <Navigate to="/cliente" replace />;
  }
  return <Navigate to="/reports" replace />;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <PwaThemeSync />
          <Routes>
            <Route path="/login" element={<LoginRouter />} />
            <Route path="/change-password" element={<SuspenseWrap><ChangePassword /></SuspenseWrap>} />
            <Route path="/reset-password" element={<SuspenseWrap><ResetPassword /></SuspenseWrap>} />
            <Route path="/booking/:userId" element={<SuspenseWrap><Booking /></SuspenseWrap>} />
            <Route path="/cliente" element={<SuspenseWrap><ClientPortal /></SuspenseWrap>} />
            <Route path="/barber-panel" element={<ProtectedRoute><SuspenseWrap><BarberHome /></SuspenseWrap></ProtectedRoute>} />
            <Route path="/professional-panel" element={<ProtectedRoute requiredRole="profissional"><SuspenseWrap><ProfessionalDashboard /></SuspenseWrap></ProtectedRoute>} />
            <Route path="/" element={<RootRedirect />} />
            <Route path="/home" element={<RootRedirect />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<SuspenseWrap><Dashboard /></SuspenseWrap>} />
              <Route path="/clients" element={<SuspenseWrap><Clients /></SuspenseWrap>} />
              <Route path="/clients/:id" element={<SuspenseWrap><ClientDetail /></SuspenseWrap>} />
              <Route path="/sales" element={<SuspenseWrap><Sales /></SuspenseWrap>} />
              <Route path="/finance" element={<SuspenseWrap><Finance /></SuspenseWrap>} />
              <Route path="/products" element={<SuspenseWrap><Products /></SuspenseWrap>} />
              <Route path="/expirations" element={<SuspenseWrap><Expirations /></SuspenseWrap>} />
              <Route path="/reminders" element={<SuspenseWrap><Reminders /></SuspenseWrap>} />
              <Route path="/reports" element={<SuspenseWrap><Reports /></SuspenseWrap>} />
              <Route path="/whatsapp" element={<PremiumRoute><SuspenseWrap><WhatsApp /></SuspenseWrap></PremiumRoute>} />
              <Route path="/whatsapp/flow" element={<PremiumRoute><SuspenseWrap><WhatsAppBotFlow /></SuspenseWrap></PremiumRoute>} />
               <Route path="/scheduling" element={<PremiumRoute><SuspenseWrap><Scheduling /></SuspenseWrap></PremiumRoute>} />
               <Route path="/campaigns" element={<PremiumRoute><SuspenseWrap><Campaigns /></SuspenseWrap></PremiumRoute>} />
               <Route path="/crm" element={<PremiumRoute><SuspenseWrap><CrmKanban /></SuspenseWrap></PremiumRoute>} />
              <Route path="/professionals" element={<SuspenseWrap><Professionals /></SuspenseWrap>} />
              <Route path="/professionals/:id" element={<SuspenseWrap><ProfessionalDetail /></SuspenseWrap>} />
              <Route path="/settings" element={<SuspenseWrap><Settings /></SuspenseWrap>} />
              <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><SuspenseWrap><Admin /></SuspenseWrap></ProtectedRoute>} />
              <Route path="/admin-credentials" element={<SuspenseWrap><AdminCredentials /></SuspenseWrap>} />
              <Route path="/client-preview" element={<SuspenseWrap><ClientLayoutPreview /></SuspenseWrap>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
