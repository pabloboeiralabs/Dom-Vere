import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { repairPlanTransactions } from "@/lib/repairPlanTransactions";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "barbearia" | "profissional";
  subscription_type: "basico" | "premium";
  professional_id?: string | null;
  owner_id?: string | null;
  must_change_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

// @ts-ignore - preserve context across HMR
const AuthContext = (globalThis.__AuthContext ??= createContext<AuthContextType | null>(null)) as React.Context<AuthContextType | null>;
// @ts-ignore
globalThis.__AuthContext = AuthContext;

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const repairedUsers = useRef(new Set<string>());

  const fetchProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<User | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, role, subscription_type, professional_id, owner_id, must_change_password")
      .eq("id", supabaseUser.id)
      .maybeSingle();
    
    console.log("FetchProfile for ID:", supabaseUser.id, "Data:", data, "Error:", error);

    if (error || !data) return null;
    return data as User;
  }, []);

  const repairInBackground = useCallback((userId: string) => {
    if (repairedUsers.current.has(userId)) return;
    repairedUsers.current.add(userId);
    repairPlanTransactions(userId).catch((e) =>
      console.error("Background repair error:", e)
    );
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          console.log("Auth state change: session found for", session.user.email);
          const profile = await fetchProfile(session.user);
          if (profile) {
            console.log("Profile loaded:", profile.email, "Role:", profile.role);
            setUser(profile);
            repairInBackground(profile.id);
          } else {
            console.error("Profile not found for user ID:", session.user.id);
          }
          setLoading(false);
        } else {
          console.log("Auth state change: no session");
          setUser(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        console.log("Initial session found for", session.user.email);
        fetchProfile(session.user).then((profile) => {
          if (profile) {
            console.log("Initial profile loaded:", profile.email);
            setUser(profile);
            repairInBackground(profile.id);
          } else {
            console.error("Initial profile not found for user ID:", session.user.id);
          }
          setLoading(false);
        });
      } else {
        console.log("No initial session");
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, repairInBackground]);

  const login = useCallback(async (email: string, password: string) => {
    console.log("Context: login attempt for", email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });
    if (error) {
      console.error("Context: login error", error.message);
      throw new Error(error.message);
    }
    console.log("Context: login response data:", data);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw new Error(error.message);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
