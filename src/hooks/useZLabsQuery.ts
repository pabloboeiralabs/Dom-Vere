import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QueryResult<T = any> {
  data: T[] | null;
  error: string | null;
  loading: boolean;
  execute: (query: string, params?: any[]) => Promise<T[]>;
}

export function useZLabsQuery<T = any>(): QueryResult<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (query: string, params: any[] = []): Promise<T[]> => {
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Não autenticado");

        const res = await supabase.functions.invoke("sql-proxy", {
          body: { query, params },
        });

        if (res.error) throw new Error(res.error.message);

        const result = res.data;
        if (result.error) throw new Error(result.error);

        const rows = result.rows ?? result.data ?? result ?? [];
        setData(rows);
        return rows;
      } catch (err: any) {
        const msg = err.message || "Erro ao executar query";
        setError(msg);
        setData(null);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { data, error, loading, execute };
}
