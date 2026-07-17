import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CashRegisterSession, CashMovement } from "@/types/cash-register";

export function useCashRegister() {
  const { user } = useAuth();
  const [session, setSession] = useState<CashRegisterSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [sessionHistory, setSessionHistory] = useState<CashRegisterSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error: err } = await supabase
        .from("cash_register_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "open")
        .maybeSingle();

      if (err) throw err;
      setSession((data as CashRegisterSession) || null);

      // Also load session history (last 30 closed)
      const { data: hist } = await supabase
        .from("cash_register_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(30);
      setSessionHistory((hist || []) as CashRegisterSession[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMovements = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("cash_movements")
      .select("*")
      .eq("cash_register_id", session.id)
      .order("created_at", { ascending: false });
    setMovements((data || []) as CashMovement[]);
  }, [session]);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => { loadMovements(); }, [loadMovements]);

  // Realtime subscription for movements
  useEffect(() => {
    if (!session?.id || !user) return;
    const channel = supabase
      .channel("cash-movements")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_movements", filter: `cash_register_id=eq.${session.id}` },
        () => { loadMovements(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, user, loadMovements]);

  const openRegister = useCallback(async (initialBalance: number) => {
    if (!user) throw new Error("Usuário não autenticado");
    const { error: err } = await supabase.rpc("open_cash_register", { p_initial_balance: initialBalance });
    if (err) throw err;
    await loadSession();
  }, [user, loadSession]);

  const closeRegister = useCallback(async (actualBalance: number, notes?: string) => {
    if (!session) throw new Error("Nenhum caixa aberto");
    const { error: err } = await supabase.rpc("close_cash_register", {
      p_session_id: session.id,
      p_actual_balance: actualBalance,
      p_notes: notes || null,
    });
    if (err) throw err;
    await loadSession();
  }, [session, loadSession]);

  const addMovement = useCallback(async (
    category: CashMovement["category"],
    amount: number,
    description?: string,
    financialEntryId?: string
  ) => {
    if (!session) throw new Error("Nenhum caixa aberto");
    if (amount <= 0) throw new Error("Valor deve ser positivo");

    const isExit = category === "troco" || category === "sangria";
    const type = isExit ? "saida" : "entrada";

    const { error: err } = await supabase.from("cash_movements").insert({
      cash_register_id: session.id,
      user_id: user!.id,
      type,
      category,
      amount,
      description: description || null,
      financial_entry_id: financialEntryId || null,
    });
    if (err) throw err;

    // Recalculate expected balance
    await supabase.rpc("recalculate_expected_balance", { p_session_id: session.id });
    await loadSession();
    await loadMovements();
  }, [session, user, loadSession, loadMovements]);

  const recalculateBalance = useCallback(async () => {
    if (!session) return;
    await supabase.rpc("recalculate_expected_balance", { p_session_id: session.id });
    await loadSession();
  }, [session, loadSession]);

  const netCashChange = movements
    .filter(m => m.type === "entrada")
    .reduce((s, m) => s + m.amount, 0) -
    movements
    .filter(m => m.type === "saida")
    .reduce((s, m) => s + m.amount, 0);

  return {
    session,
    loading,
    error,
    openRegister,
    closeRegister,
    movements,
    addMovement,
    recalculateBalance,
    sessionHistory,
    netCashChange,
    hasOpenSession: !!session,
  };
}
