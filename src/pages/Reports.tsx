import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { motion } from "framer-motion";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Users, CalendarIcon } from "lucide-react";
import PlanPopularityReport from "@/components/reports/PlanPopularityReport";
import ProfessionalReport from "@/components/reports/ProfessionalReport";

type Period = "7d" | "30d" | "90d" | "custom";

const salesConfig: ChartConfig = { total: { label: "Faturamento (R$)", color: "hsl(var(--primary))" } };
const cutsConfig: ChartConfig = { cuts: { label: "Cortes", color: "hsl(var(--chart-2, 210 80% 56%))" } };
const clientsConfig: ChartConfig = { new_clients: { label: "Novos Clientes", color: "hsl(var(--chart-3, 160 60% 45%))" } };

const periodLabel: Record<Exclude<Period, "custom">, string> = { "7d": "7 dias", "30d": "30 dias", "90d": "90 dias" };

interface SalesRow { day: string; total: number }
interface CutsRow { day: string; cuts: number }
interface ClientRow { day: string; new_clients: number }

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

function fmt(date: string, period: Period) {
  const d = new Date(date);
  if (period === "7d") return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [salesData, setSalesData] = useState<SalesRow[]>([]);
  const [cutsData, setCutsData] = useState<CutsRow[]>([]);
  const [clientsData, setClientsData] = useState<ClientRow[]>([]);
  const [summary, setSummary] = useState({ revenue: 0, cuts: 0, clients: 0, avg: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        let fromDate: string;
        let toDate: string;

        if (period === "custom") {
          fromDate = format(dateFrom, "yyyy-MM-dd");
          toDate = format(dateTo, "yyyy-MM-dd") + " 23:59:59";
        } else {
          const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
          fromDate = format(subDays(new Date(), days), "yyyy-MM-dd");
          toDate = format(new Date(), "yyyy-MM-dd") + " 23:59:59";
        }

        const [salesRes, cutsRes, clientsRes, summaryRes] = await Promise.all([
          supabase.rpc("get_sales_chart", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
          supabase.rpc("get_cuts_chart", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
          supabase.rpc("get_new_clients_chart", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
          supabase.rpc("get_report_summary", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
        ]);

        setSalesData((salesRes.data || []).map((r: any) => ({ day: fmt(r.day, period), total: Number(r.total) })));
        setCutsData((cutsRes.data || []).map((r: any) => ({ day: fmt(r.day, period), cuts: Number(r.cuts) })));
        setClientsData((clientsRes.data || []).map((r: any) => ({ day: fmt(r.day, period), new_clients: Number(r.new_clients) })));

        const s = (summaryRes.data || [])[0];
        const revenue = Number(s?.revenue || 0);
        const txCount = Number(s?.tx_count || 0);
        setSummary({
          revenue,
          cuts: Number(s?.cuts || 0),
          clients: Number(s?.clients || 0),
          avg: txCount > 0 ? revenue / txCount : 0,
        });
      } catch (e) {
        console.error("Reports load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, period, dateFrom, dateTo]);

  const summaryCards = [
    { title: "Faturamento", value: `R$ ${summary.revenue.toFixed(2)}`, icon: DollarSign },
    { title: "Ticket Médio", value: `R$ ${summary.avg.toFixed(2)}`, icon: TrendingUp },
    { title: "Cortes", value: summary.cuts.toString(), icon: ShoppingCart },
    { title: "Novos Clientes", value: summary.clients.toString(), icon: Users },
  ];

  const periodTitle =
    period === "custom"
      ? `${format(dateFrom, "dd/MM/yyyy")} – ${format(dateTo, "dd/MM/yyyy")}`
      : `últimos ${periodLabel[period as Exclude<Period, "custom">]}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>

        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={period === "custom" ? "" : period} onValueChange={(v) => { if (v) setPeriod(v as Period); }}>
            <TabsList>
              {(["7d", "30d", "90d"] as Exclude<Period, "custom">[]).map((p) => (
                <TabsTrigger key={p} value={p}>{periodLabel[p]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={period === "custom" ? "default" : "outline"}
                  size="sm"
                  className={cn("gap-1 text-xs", period === "custom" && "ring-2 ring-primary")}
                  onClick={() => setPeriod("custom")}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {period === "custom"
                    ? `${format(dateFrom, "dd/MM")} – ${format(dateTo, "dd/MM")}`
                    : "Intervalo"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex flex-col sm:flex-row">
                  <div className="p-3 border-b sm:border-b-0 sm:border-r border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1 text-center">De</p>
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={(d) => { if (d) { setDateFrom(d); setPeriod("custom"); } }}
                      className={cn("p-0 pointer-events-auto")}
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1 text-center">Até</p>
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={(d) => { if (d) { setDateTo(d); setPeriod("custom"); } }}
                      disabled={(d) => d < dateFrom}
                      className={cn("p-0 pointer-events-auto")}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" variants={container} initial="hidden" animate="show" key={period + String(dateFrom) + String(dateTo)}>
        {summaryCards.map((c) => (
          <motion.div key={c.title} variants={item}>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{loading ? "..." : c.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-foreground">Faturamento — {periodTitle}</CardTitle></CardHeader>
        <CardContent>
          {salesData.length > 0 ? (
            <ChartContainer config={salesConfig} className="h-[200px] sm:h-[260px] w-full">
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="total" stroke="var(--color-total)" fill="url(#salesGrad)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma venda no período selecionado</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-foreground">Cortes por dia</CardTitle></CardHeader>
          <CardContent>
            {cutsData.length > 0 ? (
              <ChartContainer config={cutsConfig} className="h-[220px] w-full">
                <BarChart data={cutsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="cuts" fill="var(--color-cuts)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Sem dados no período</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-foreground">Novos clientes por dia</CardTitle></CardHeader>
          <CardContent>
            {clientsData.length > 0 ? (
              <ChartContainer config={clientsConfig} className="h-[220px] w-full">
                <LineChart data={clientsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="new_clients" stroke="var(--color-new_clients)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Sem dados no período</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PlanPopularityReport />
      <ProfessionalReport />
    </div>
  );
}
