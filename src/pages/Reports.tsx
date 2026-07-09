import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Users, CalendarIcon, TrendingDown, Percent, Scissors } from "lucide-react";
import PlanPopularityReport from "@/components/reports/PlanPopularityReport";
import ProfessionalReport from "@/components/reports/ProfessionalReport";

type Period = "7d" | "30d" | "90d" | "custom";

const flowConfig: ChartConfig = {
  receita: { label: "Receita (R$)", color: "#10b981" },
  despesa: { label: "Despesa (R$)", color: "#f43f5e" }
};
const cutsConfig: ChartConfig = { cuts: { label: "Cortes", color: "hsl(var(--chart-2, 210 80% 56%))" } };
const clientsConfig: ChartConfig = { new_clients: { label: "Novos Clientes", color: "hsl(var(--chart-3, 160 60% 45%))" } };

const periodLabel: Record<Exclude<Period, "custom">, string> = { "7d": "7 dias", "30d": "30 dias", "90d": "90 dias" };

interface CutsRow { day: string; cuts: number }
interface ClientRow { day: string; new_clients: number }
interface FlowRow { day: string; rawDate: string; receita: number; despesa: number }
interface CategoryBreakdown { name: string; total: number; type: string }

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

function fmt(date: string, period: Period) {
  const d = new Date(date + 'T12:00:00');
  if (period === "7d") return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  
  const [flowData, setFlowData] = useState<FlowRow[]>([]);
  const [cutsData, setCutsData] = useState<CutsRow[]>([]);
  const [clientsData, setClientsData] = useState<ClientRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryBreakdown[]>([]);
  
  const [summary, setSummary] = useState({ revenue: 0, cuts: 0, clients: 0, avg: 0 });
  const [financialSummary, setFinancialSummary] = useState({ revenue: 0, expenses: 0, profit: 0, margin: 0 });
  
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

        const [cutsRes, clientsRes, summaryRes, entriesRes] = await Promise.all([
          supabase.rpc("get_cuts_chart", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
          supabase.rpc("get_new_clients_chart", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
          supabase.rpc("get_report_summary", { p_user_id: user.id, p_from: fromDate, p_to: toDate }),
          supabase
            .from("financial_entries")
            .select("type, amount, category, date")
            .eq("user_id", user.id)
            .gte("date", fromDate.slice(0, 10))
            .lte("date", toDate.slice(0, 10))
        ]);

        // Group flowData by date
        const groupedFlow: Record<string, { day: string; rawDate: string; receita: number; despesa: number }> = {};
        
        // Initialize flow points from entries or just default to matching days
        (entriesRes.data || []).forEach((e: any) => {
          const dStr = e.date;
          if (!groupedFlow[dStr]) {
            groupedFlow[dStr] = { day: fmt(dStr, period), rawDate: dStr, receita: 0, despesa: 0 };
          }
          if (e.type === 'entrada') {
            groupedFlow[dStr].receita += Number(e.amount);
          } else {
            groupedFlow[dStr].despesa += Number(e.amount);
          }
        });
        
        const sortedFlow = Object.values(groupedFlow).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
        setFlowData(sortedFlow);

        // Group category breakdown
        const groupedCat: Record<string, { name: string; total: number; type: string }> = {};
        (entriesRes.data || []).forEach((e: any) => {
          if (!groupedCat[e.category]) {
            groupedCat[e.category] = { name: e.category, total: 0, type: e.type };
          }
          groupedCat[e.category].total += Number(e.amount);
        });
        setCategoryData(Object.values(groupedCat).sort((a, b) => b.total - a.total));

        setCutsData((cutsRes.data || []).map((r: any) => ({ day: fmt(r.day, period), cuts: Number(r.cuts) })));
        setClientsData((clientsRes.data || []).map((r: any) => ({ day: fmt(r.day, period), new_clients: Number(r.new_clients) })));

        // Summary calculations
        const s = (summaryRes.data || [])[0];
        const revenue = Number(s?.revenue || 0);
        const txCount = Number(s?.tx_count || 0);
        setSummary({
          revenue,
          cuts: Number(s?.cuts || 0),
          clients: Number(s?.clients || 0),
          avg: txCount > 0 ? revenue / txCount : 0,
        });

        // Financial calculations from entries
        const finInflow = (entriesRes.data || [])
          .filter((e: any) => e.type === 'entrada')
          .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
        const finOutflow = (entriesRes.data || [])
          .filter((e: any) => e.type === 'saida')
          .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
        
        const finProfit = finInflow - finOutflow;
        const finMargin = finInflow > 0 ? (finProfit / finInflow) * 100 : 0;

        setFinancialSummary({
          revenue: finInflow,
          expenses: finOutflow,
          profit: finProfit,
          margin: finMargin
        });

      } catch (e) {
        console.error("Reports load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, period, dateFrom, dateTo]);

  // Financial statistics card config
  const summaryCards = [
    { title: "Faturamento (Receitas)", value: `R$ ${financialSummary.revenue.toFixed(2)}`, icon: DollarSign, colorClass: "text-emerald-500" },
    { title: "Despesas Operacionais", value: `R$ ${financialSummary.expenses.toFixed(2)}`, icon: TrendingDown, colorClass: "text-red-500" },
    { title: "Lucro Líquido", value: `R$ ${financialSummary.profit.toFixed(2)}`, icon: TrendingUp, colorClass: financialSummary.profit >= 0 ? "text-emerald-500" : "text-red-500" },
    { title: "Margem Operacional", value: `${financialSummary.margin.toFixed(1)}%`, icon: Percent, colorClass: "text-blue-500" },
  ];

  // Secondary metrics card config (operational data)
  const secondaryCards = [
    { title: "Cortes Realizados", value: summary.cuts.toString(), icon: Scissors },
    { title: "Ticket Médio", value: `R$ ${summary.avg.toFixed(2)}`, icon: DollarSign },
    { title: "Novos Clientes", value: summary.clients.toString(), icon: Users },
  ];

  const periodTitle =
    period === "custom"
      ? `${format(dateFrom, "dd/MM/yyyy")} – ${format(dateTo, "dd/MM/yyyy")}`
      : `últimos ${periodLabel[period as Exclude<Period, "custom">]}`;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório Financeiro e Operacional</h1>
          <p className="text-sm text-muted-foreground">Monitore o desempenho do seu negócio e sua rentabilidade.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={period === "custom" ? "" : period} onValueChange={(v) => { if (v) setPeriod(v as Period); }}>
            <TabsList className="rounded-xl border border-border/30">
              {(["7d", "30d", "90d"] as Exclude<Period, "custom">[]).map((p) => (
                <TabsTrigger key={p} value={p} className="rounded-lg">{periodLabel[p]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={period === "custom" ? "default" : "outline"}
                  size="sm"
                  className={cn("gap-1 text-xs rounded-xl h-10", period === "custom" && "ring-2 ring-primary")}
                  onClick={() => setPeriod("custom")}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {period === "custom"
                    ? `${format(dateFrom, "dd/MM")} – ${format(dateTo, "dd/MM")}`
                    : "Intervalo"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl border-border/40 shadow-xl" align="end">
                <div className="flex flex-col sm:flex-row">
                  <div className="p-3 border-b sm:border-b-0 sm:border-r border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 text-center uppercase tracking-wider">De</p>
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={(d) => { if (d) { setDateFrom(d); setPeriod("custom"); } }}
                      className={cn("p-0 pointer-events-auto")}
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 text-center uppercase tracking-wider">Até</p>
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

      {/* Main Financial Cards Grid */}
      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" variants={container} initial="hidden" animate="show" key={period + String(dateFrom) + String(dateTo)}>
        {summaryCards.map((c) => (
          <motion.div key={c.title} variants={item}>
            <Card className="border-border/40 bg-gradient-to-br from-muted/5 via-transparent to-transparent shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">{c.title}</CardTitle>
                <c.icon className={`h-4 w-4 ${c.colorClass}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-extrabold tracking-tight ${loading ? "animate-pulse text-muted-foreground" : c.colorClass}`}>
                  {loading ? "..." : c.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Financial Chart (Receitas vs Despesas) */}
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Comparativo Financeiro: Fluxo de Caixa</CardTitle>
          <CardDescription>Receitas vs. Despesas consolidadas — {periodTitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {flowData.length > 0 ? (
            <ChartContainer config={flowConfig} className="h-[250px] sm:h-[300px] w-full">
              <AreaChart data={flowData} margin={{ left: 10, right: 10 }}>
                <defs>
                  <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="despGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" name="Receita" dataKey="receita" stroke="#10b981" fill="url(#recGrad)" strokeWidth={2} />
                <Area type="monotone" name="Despesa" dataKey="despesa" stroke="#f43f5e" fill="url(#despGrad)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-12">Nenhuma movimentação registrada no período</p>
          )}
        </CardContent>
      </Card>

      {/* Operational Stats Grid (Metrics Cards & Category Breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Operational Cards & Category Breakdown List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Resumo Operacional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {secondaryCards.map((c) => (
                <div key={c.title} className="flex items-center justify-between border-b border-border/30 pb-2 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center text-muted-foreground">
                      <c.icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">{c.title}</span>
                  </div>
                  <span className="font-extrabold text-foreground text-sm">{loading ? "..." : c.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Breakdown of revenue by category list */}
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Lançamentos por Categoria</CardTitle>
              <CardDescription className="text-[11px]">Total acumulado por área de receita/despesa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[190px] overflow-y-auto pr-1">
              {categoryData.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs border-b border-border/10 pb-1.5 last:border-none">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.type === 'entrada' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-foreground truncate max-w-[120px]">{c.name}</span>
                  </div>
                  <span className={`font-bold ${c.type === 'entrada' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {formatCurrency(c.total)}
                  </span>
                </div>
              ))}
              {categoryData.length === 0 && (
                <p className="text-muted-foreground text-[11px] text-center py-6">Sem registros de categoria</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Operational Charts (Cuts & Clients) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cuts Chart */}
            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                  Cortes por dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cutsData.length > 0 ? (
                  <ChartContainer config={cutsConfig} className="h-[180px] w-full">
                    <BarChart data={cutsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="cuts" fill="var(--color-cuts)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-xs text-center py-12">Sem dados de cortes</p>
                )}
              </CardContent>
            </Card>

            {/* Clients Chart */}
            <Card className="border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Novos Clientes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clientsData.length > 0 ? (
                  <ChartContainer config={clientsConfig} className="h-[180px] w-full">
                    <LineChart data={clientsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="new_clients" stroke="var(--color-new_clients)" strokeWidth={1.5} dot={{ r: 2 }} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-xs text-center py-12">Sem novos clientes</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Plans and Professional detailed tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PlanPopularityReport />
        <ProfessionalReport />
      </div>
    </div>
  );
}
