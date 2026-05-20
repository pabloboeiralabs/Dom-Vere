import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Package } from "lucide-react";

interface Transaction {
  id: string;
  customer_name: string;
  amount: number;
  total: number;
  notes: string;
  created_at: string;
}

export default function Sales() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase.rpc("get_sales_history", { p_user_id: user.id });
      setTransactions((data || []) as Transaction[]);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const isFromPlan = (t: Transaction) => t.notes?.startsWith("Créditos do plano:");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Histórico de Créditos</h1>
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-foreground">Transações Recentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden sm:table-cell">Origem</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-center">Créditos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={isFromPlan(t) ? "secondary" : "default"}>
                      {isFromPlan(t) ? (<><Package className="mr-1 h-3 w-3" /> Plano</>) : (<><CreditCard className="mr-1 h-3 w-3" /> Venda</>)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{t.customer_name}</TableCell>
                  <TableCell className="text-center text-foreground">{t.amount}</TableCell>
                  <TableCell className="text-right text-foreground">
                    {Number(t.total) > 0 ? `R$ ${Number(t.total).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")} {new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma transação registrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
