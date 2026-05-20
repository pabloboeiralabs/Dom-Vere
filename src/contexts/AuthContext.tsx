import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { repairPlanTransactions } from "@/lib/repairPlanTransactions";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "barbearia" | "profissional";
  subscription_type: "basico" | "premium" | null;
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
    
    console.log("FetchProfile result for", supabaseUser.email, ":", { data, error });

    if (error || !data) {
      console.warn("Returning null from fetchProfile - user might not have a profile yet");
      return null;
    }
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
    const handleSession = async (session: Session | null) => {
      console.log("Handling session:", session?.user?.email);
      if (session?.user) {
        const profile = await fetchProfile(session.user);
        if (profile) {
          console.log("Setting user profile:", profile.email);
          setUser(profile);
          repairInBackground(profile.id);
        } else {
          console.error("No profile found for logged in user");
        }
      } else {
        console.log("No session, clearing user");
        setUser(null);
      }
      setLoading(false);
    };

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth event:", event);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          handleSession(session);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile, repairInBackground]);

  const login = useCallback(async (email: string, password: string) => {
    console.log("Context: login attempt for", email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });
    console.log("Supabase Auth sign in result:", { user: data.user, session: !!data.session, error });
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
    console.log("Context: logging out...");
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
