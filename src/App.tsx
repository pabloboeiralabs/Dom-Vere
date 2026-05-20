import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
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
const Expirations = lazy(() => import("@/pages/Expirations"));
const Settings = lazy(() => import("@/pages/Settings"));
const Admin = lazy(() => import("@/pages/Admin"));
const Reports = lazy(() => import("@/pages/Reports"));
const Subscriptions = lazy(() => import("@/pages/Subscriptions"));
const WhatsApp = lazy(() => import("@/pages/WhatsApp"));
const Scheduling = lazy(() => import("@/pages/Scheduling"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Professionals = lazy(() => import("@/pages/Professionals"));
const ProfessionalDetail = lazy(() => import("@/pages/ProfessionalDetail"));
const Booking = lazy(() => import("@/pages/Booking"));
const CrmKanban = lazy(() => import("@/pages/CrmKanban"));
const ProfessionalDashboard = lazy(() => import("@/pages/ProfessionalDashboard"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const AdminCredentials = lazy(() => import("@/pages/AdminCredentials"));

const SuspenseWrap = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="flex-1 flex items-center justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
    {children}
  </Suspense>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<SuspenseWrap><ChangePassword /></SuspenseWrap>} />
            <Route path="/reset-password" element={<SuspenseWrap><ResetPassword /></SuspenseWrap>} />
            <Route path="/booking/:userId" element={<SuspenseWrap><Booking /></SuspenseWrap>} />
            <Route path="/professional-panel" element={<ProtectedRoute requiredRole="profissional"><SuspenseWrap><ProfessionalDashboard /></SuspenseWrap></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/reports" replace />} />
            <Route path="/dashboard" element={<Navigate to="/reports" replace />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<SuspenseWrap><Dashboard /></SuspenseWrap>} />
              <Route path="/clients" element={<SuspenseWrap><Clients /></SuspenseWrap>} />
              <Route path="/clients/:id" element={<SuspenseWrap><ClientDetail /></SuspenseWrap>} />
              <Route path="/sales" element={<SuspenseWrap><Sales /></SuspenseWrap>} />
              <Route path="/expirations" element={<SuspenseWrap><Expirations /></SuspenseWrap>} />
              <Route path="/reports" element={<SuspenseWrap><Reports /></SuspenseWrap>} />
              <Route path="/subscriptions" element={<SuspenseWrap><Subscriptions /></SuspenseWrap>} />
              <Route path="/whatsapp" element={<PremiumRoute><SuspenseWrap><WhatsApp /></SuspenseWrap></PremiumRoute>} />
               <Route path="/scheduling" element={<PremiumRoute><SuspenseWrap><Scheduling /></SuspenseWrap></PremiumRoute>} />
               <Route path="/campaigns" element={<PremiumRoute><SuspenseWrap><Campaigns /></SuspenseWrap></PremiumRoute>} />
               <Route path="/crm" element={<PremiumRoute><SuspenseWrap><CrmKanban /></SuspenseWrap></PremiumRoute>} />
              <Route path="/professionals" element={<SuspenseWrap><Professionals /></SuspenseWrap>} />
              <Route path="/professionals/:id" element={<SuspenseWrap><ProfessionalDetail /></SuspenseWrap>} />
              <Route path="/settings" element={<SuspenseWrap><Settings /></SuspenseWrap>} />
              <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><SuspenseWrap><Admin /></SuspenseWrap></ProtectedRoute>} />
              <Route path="/admin-credentials" element={<SuspenseWrap><AdminCredentials /></SuspenseWrap>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
