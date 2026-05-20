import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";

export function PremiumRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const hasAccess = user?.role === "admin" || user?.subscription_type === "premium";

  useEffect(() => {
    if (user && !hasAccess) {
      toast.error("Recurso disponível apenas para assinantes Premium");
    }
  }, [user, hasAccess]);

  if (user && !hasAccess) return <Navigate to="/reports" replace />;
  return <>{children}</>;
}
