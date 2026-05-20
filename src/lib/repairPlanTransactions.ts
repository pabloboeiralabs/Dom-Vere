import { supabase } from "@/integrations/supabase/client";

export async function repairPlanTransactions(userId: string) {
  const { data, error } = await supabase.rpc("repair_plan_transactions", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data ?? 0;
}
