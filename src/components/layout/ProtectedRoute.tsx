import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "barbearia" | "profissional";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  console.log("ProtectedRoute check:", { hasUser: !!user, loading, role: user?.role, requiredRole });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (requiredRole && user.role !== requiredRole) {
    const fallback = user.role === "profissional" ? "/professional-panel" : "/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
