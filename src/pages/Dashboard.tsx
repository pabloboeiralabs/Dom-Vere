import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { DollarSign, Users, Scissors, CreditCard } from "lucide-react";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";

const chartConfig: ChartConfig = {
  total: { label: "Vendas (R$)", color: "hsl(var(--primary))" },
};

interface Metrics { revenue: number; activeClients: number; totalCuts: number; pendingCredits: number; }
interface ChartData { day: string; total: number; }

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

export default function Dashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>({ revenue: 0, activeClients: 0, totalCuts: 0, pendingCredits: 0 });
  const [chartData, setChartData] = useState<ChartData[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: m } = await supabase.rpc("get_dashboard_metrics", { p_user_id: user.id });
        if (m && m.length > 0) {
          setMetrics({
            revenue: Number(m[0].revenue || 0),
            activeClients: Number(m[0].active_clients || 0),
            totalCuts: Number(m[0].total_cuts || 0),
            pendingCredits: Number(m[0].pending_credits || 0),
          });
        }

        const fromDate = format(subDays(new Date(), 7), "yyyy-MM-dd");
        const toDate = format(new Date(), "yyyy-MM-dd") + " 23:59:59";
        const { data: chart } = await supabase.rpc("get_sales_chart", {
          p_user_id: user.id, p_from: fromDate, p_to: toDate,
        });
        if (chart) {
          setChartData(chart.map((r: any) => ({
            day: new Date(r.day).toLocaleDateString("pt-BR", { weekday: "short" }),
            total: Number(r.total),
          })));
        }
      } catch (e) { console.error("Dashboard load error:", e); }
    };
    load();
  }, [user]);

  const cards = [
    { title: "Faturamento", value: `R$ ${metrics.revenue.toFixed(2)}`, icon: DollarSign },
    { title: "Clientes Ativos", value: metrics.activeClients.toString(), icon: Users },
    { title: "Cortes Realizados", value: metrics.totalCuts.toString(), icon: Scissors },
    { title: "Créditos Pendentes", value: metrics.pendingCredits.toString(), icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" variants={container} initial="hidden" animate="show">
        {cards.map((c) => (
          <motion.div key={c.title} variants={item}>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-foreground">{c.value}</div></CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-foreground">Vendas - Últimos 7 dias</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart data={chartData}><XAxis dataKey="day" /><YAxis /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} /></BarChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma venda nos últimos 7 dias</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
