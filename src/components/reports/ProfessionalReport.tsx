import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { UserCheck, DollarSign, Scissors, TrendingUp } from "lucide-react";

interface ProfStats {
  professional_id: string;
  name: string;
  total_appointments: number;
  completed: number;
  revenue: number;
  commission: number;
}

const chartConfig: ChartConfig = {
  revenue: { label: "Faturamento (R$)", color: "hsl(var(--primary))" },
  commission: { label: "Comissão (R$)", color: "hsl(var(--chart-2, 210 80% 56%))" },
};

export default function ProfessionalReport() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_professional_stats", { p_user_id: user.id, p_days: parseInt(period) });
      if (data) {
        setStats(data.map((r: any) => ({
          ...r,
          total_appointments: Number(r.total_appointments),
          completed: Number(r.completed),
          revenue: Number(r.revenue),
          commission: Number(r.revenue) * Number(r.commission_percent) / 100,
        })));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalRevenue = stats.reduce((s, r) => s + r.revenue, 0);
  const totalCommission = stats.reduce((s, r) => s + r.commission, 0);
  const totalCompleted = stats.reduce((s, r) => s + r.completed, 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-foreground flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary" />Relatório por Profissional</CardTitle>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : stats.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Nenhum profissional cadastrado</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="h-4 w-4" /> Faturamento Total</div>
                <div className="text-xl font-bold text-foreground mt-1">R$ {totalRevenue.toFixed(2)}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4" /> Comissões Total</div>
                <div className="text-xl font-bold text-foreground mt-1">R$ {totalCommission.toFixed(2)}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Scissors className="h-4 w-4" /> Atendimentos</div>
                <div className="text-xl font-bold text-foreground mt-1">{totalCompleted}</div>
              </div>
            </div>
            {stats.some((s) => s.revenue > 0) && (
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart data={stats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="commission" fill="var(--color-commission)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Atendimentos</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Faturamento</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.professional_id} className="border-t border-border">
                      <td className="p-3 font-medium text-foreground">{s.name}</td>
                      <td className="p-3 text-center text-muted-foreground">{s.completed} / {s.total_appointments}</td>
                      <td className="p-3 text-right text-foreground">R$ {s.revenue.toFixed(2)}</td>
                      <td className="p-3 text-right text-foreground">R$ {s.commission.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
