import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Trash2,
  Filter,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Layers,
  CreditCard,
  RefreshCw
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface FinancialEntry {
  id: string;
  type: 'entrada' | 'saida';
  category: string;
  amount: number;
  description: string | null;
  payment_method: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'outro';
  date: string;
  professional_id: string | null;
  appointment_id: string | null;
  product_sale_id: string | null;
  credit_transaction_id: string | null;
  created_at: string;
  professionals?: { name: string } | null;
}

interface Professional {
  id: string;
  name: string;
}

const CATEGORIES = [
  "Serviço",
  "Produto",
  "Planos/Créditos",
  "Aluguel",
  "Suprimentos",
  "Comissão",
  "Marketing",
  "Retirada (Sangria)",
  "Salários",
  "Investimento",
  "Outros"
];

const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "outro", label: "Outro" }
];

const COLORS = ["#10b981", "#3b82f6", "#eab308", "#a855f7", "#f43f5e"];

export default function Finance() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Filters state
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState("");

  // New entry form state
  const [formType, setFormType] = useState<'entrada' | 'saida'>('saida');
  const [formCategory, setFormCategory] = useState<string>('Suprimentos');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formMethod, setFormMethod] = useState<string>('pix');
  const [formDate, setFormDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [formProfId, setFormProfId] = useState<string>('none');

  // Edit entry state
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);
  const [editMethod, setEditMethod] = useState<string>('pix');

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load professionals for select option
      const { data: profs } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("name");
      setProfessionals(profs || []);

      // Load financial entries for current filters/dates
      const { data: records, error } = await supabase
        .from("financial_entries")
        .select(`
          *,
          professionals:professional_id (name)
        `)
        .eq("user_id", user.id)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries((records || []) as any[]);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao carregar dados: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateEntry = async () => {
    if (!user || !formAmount || parseFloat(formAmount) <= 0) {
      toast.error("Por favor, insira um valor válido.");
      return;
    }

    try {
      const { error } = await supabase.from("financial_entries").insert({
        user_id: user.id,
        type: formType,
        category: formCategory,
        amount: parseFloat(formAmount),
        description: formDescription.trim() || null,
        payment_method: formMethod as any,
        date: formDate,
        professional_id: formProfId === 'none' ? null : formProfId
      });

      if (error) throw error;

      toast.success("Lançamento registrado com sucesso!");
      setDialogOpen(false);
      
      // Reset form
      setFormAmount('');
      setFormDescription('');
      setFormMethod('pix');
      setFormProfId('none');
      
      loadData();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  const handleUpdatePaymentMethod = async () => {
    if (!selectedEntry) return;
    try {
      const { error } = await supabase
        .from("financial_entries")
        .update({ payment_method: editMethod as any })
        .eq("id", selectedEntry.id);

      if (error) throw error;

      toast.success("Forma de pagamento atualizada!");
      setEditDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + err.message);
    }
  };

  const handleDeleteEntry = async (id: string, isAuto: boolean) => {
    if (isAuto) {
      toast.error("Lançamentos automáticos não podem ser deletados diretamente daqui. Delete a venda ou agendamento de origem.");
      return;
    }

    if (!confirm("Deseja realmente excluir este lançamento?")) return;

    try {
      const { error } = await supabase
        .from("financial_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Lançamento excluído!");
      loadData();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const openEditDialog = (entry: FinancialEntry) => {
    setSelectedEntry(entry);
    setEditMethod(entry.payment_method);
    setEditDialogOpen(true);
  };

  // Calculations
  const filteredEntries = entries.filter(e => {
    const matchesSearch = e.description?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          e.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || e.type === filterType;
    const matchesCategory = filterCategory === "all" || e.category === filterCategory;
    const matchesMethod = filterMethod === "all" || e.payment_method === filterMethod;
    return matchesSearch && matchesType && matchesCategory && matchesMethod;
  });

  const totalInflow = filteredEntries
    .filter(e => e.type === 'entrada')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalOutflow = filteredEntries
    .filter(e => e.type === 'saida')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const netBalance = totalInflow - totalOutflow;

  // Chart data 1: Payment methods distribution
  const methodTotals = filteredEntries.reduce((acc, e) => {
    if (e.type === 'entrada') {
      acc[e.payment_method] = (acc[e.payment_method] || 0) + Number(e.amount);
    }
    return acc;
  }, {} as Record<string, number>);

  const methodChartData = Object.entries(methodTotals).map(([method, total]) => {
    const label = PAYMENT_METHODS.find(m => m.value === method)?.label || method;
    return { name: label, value: total };
  });

  // Chart data 2: Categories breakdown
  const categoryTotals = filteredEntries.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {} as Record<string, number>);

  const categoryChartData = Object.entries(categoryTotals)
    .map(([category, total]) => ({ name: category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const getMethodBadge = (method: string) => {
    const label = PAYMENT_METHODS.find(m => m.value === method)?.label || method;
    return <Badge variant="outline" className="capitalize text-[11px] rounded-lg">{label}</Badge>;
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">Monitore as movimentações de entrada e saída da sua barbearia.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData} title="Recarregar dados" className="rounded-xl h-10 w-10">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl h-10">
            <Plus className="h-4 w-4" /> Registrar Lançamento
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card Saldo */}
        <Card className={`border-border/40 relative overflow-hidden transition-all duration-300 ${netBalance >= 0 ? 'bg-gradient-to-br from-emerald-500/5 to-transparent' : 'bg-gradient-to-br from-red-500/5 to-transparent'}`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between">
              Saldo Líquido no Período
              <CreditCard className="h-4 w-4 text-muted-foreground/60" />
            </CardDescription>
            <CardTitle className={`text-3xl font-extrabold tracking-tight mt-1 ${netBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(netBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Fórmula de fluxo de caixa simples: entradas - saídas.
            </p>
          </CardContent>
        </Card>

        {/* Card Receitas */}
        <Card className="border-border/40 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between">
              Receitas (Entradas)
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold tracking-tight mt-1 text-emerald-500">
              {formatCurrency(totalInflow)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              Soma de todos os ganhos e pagamentos.
            </p>
          </CardContent>
        </Card>

        {/* Card Despesas */}
        <Card className="border-border/40 bg-gradient-to-br from-red-500/5 via-transparent to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between">
              Despesas (Saídas)
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold tracking-tight mt-1 text-red-500">
              {formatCurrency(totalOutflow)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowDownRight className="h-3 w-3 text-red-500" />
              Custos, suprimentos e comissões pagas.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts & Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Payment Methods */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Formas de Recebimento</CardTitle>
            <CardDescription>Distribuição dos valores recebidos por tipo de pagamento</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
            {methodChartData.length > 0 ? (
              <div className="w-full h-full flex flex-col md:flex-row items-center justify-around">
                <div className="h-44 w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={methodChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {methodChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 mt-4 md:mt-0 text-xs">
                  {methodChartData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="font-medium text-muted-foreground">{item.name}:</span>
                      <span className="font-semibold text-foreground">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center">Nenhum faturamento registrado no período</p>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Category Breakdown */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Lançamentos por Categoria</CardTitle>
            <CardDescription>Principais fontes de receita e despesas</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border)/0.2)" />
                  <XAxis type="number" tickFormatter={(v) => `R$${v}`} className="text-[10px]" />
                  <YAxis dataKey="name" type="category" className="text-[11px]" width={80} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-12">Nenhum lançamento no período</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Ledger & Filters */}
      <Card className="border-border/40">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-lg font-bold">Livro Caixa</CardTitle>
              <CardDescription>Histórico detalhado de lançamentos de caixa.</CardDescription>
            </div>
            {/* Date interval selectors */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1.5 rounded-xl border border-border/30">
                <span className="text-muted-foreground">De</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent border-none outline-none text-foreground font-medium w-[110px]"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1.5 rounded-xl border border-border/30">
                <span className="text-muted-foreground">Até</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent border-none outline-none text-foreground font-medium w-[110px]"
                />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 rounded-xl bg-muted/20 border-border/50 text-sm"
              />
            </div>

            {/* Filter Type */}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-10 rounded-xl bg-muted/20 border-border/50 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Filter className="h-3 w-3" />
                  {filterType === "all" ? "Todos os Tipos" : filterType === "entrada" ? "Receitas" : "Despesas"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="entrada">Receitas (Entradas)</SelectItem>
                <SelectItem value="saida">Despesas (Saídas)</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter Category */}
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-10 rounded-xl bg-muted/20 border-border/50 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  {filterCategory === "all" ? "Categorias" : filterCategory}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filter Method */}
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="h-10 rounded-xl bg-muted/20 border-border/50 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CreditCard className="h-3 w-3" />
                  {filterMethod === "all" ? "Formas de Pagamento" : PAYMENT_METHODS.find(pm => pm.value === filterMethod)?.label}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Formas</SelectItem>
                {PAYMENT_METHODS.map(pm => (
                  <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Inflows/Outflows counters */}
            <div className="flex items-center justify-end px-1 text-xs text-muted-foreground gap-2 font-medium h-10 border border-transparent">
              <span>{filteredEntries.length} itens filtrados</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center"></TableHead>
                <TableHead>Lançamento</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="hidden lg:table-cell">Profissional</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Data</TableHead>
                <TableHead className="w-20 text-center"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((e) => {
                const isAuto = !!(e.appointment_id || e.product_sale_id || e.credit_transaction_id);
                return (
                  <TableRow key={e.id} className="hover:bg-muted/10 transition-colors">
                    {/* Icon Type */}
                    <TableCell className="text-center py-3">
                      {e.type === 'entrada' ? (
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto" title="Entrada">
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto" title="Saída">
                          <ArrowDownRight className="h-4 w-4" />
                        </div>
                      )}
                    </TableCell>

                    {/* Description */}
                    <TableCell className="font-medium text-foreground">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[250px] sm:max-w-xs">{e.description || "Sem descrição"}</span>
                        {isAuto && (
                          <span className="text-[10px] text-muted-foreground/80 flex items-center gap-1 mt-0.5 font-normal">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                            Gerado automaticamente
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Category */}
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="font-normal rounded-lg">{e.category}</Badge>
                    </TableCell>

                    {/* Payment Method */}
                    <TableCell>
                      <button
                        onClick={() => openEditDialog(e)}
                        className="hover:underline text-left"
                        title="Clique para editar a forma de pagamento"
                      >
                        {getMethodBadge(e.payment_method)}
                      </button>
                    </TableCell>

                    {/* Professional */}
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {e.professionals?.name || "—"}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className={`text-right font-bold ${e.type === 'entrada' ? 'text-emerald-500' : 'text-red-500'}`}>
                      {e.type === 'entrada' ? '+' : '-'} {formatCurrency(Number(e.amount))}
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {format(new Date(e.date + 'T12:00:00'), "dd/MM/yyyy")}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteEntry(e.id, isAuto)}
                        className="h-8 w-8 rounded-lg hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 text-muted-foreground/40 transition-colors"
                        disabled={isAuto}
                        title={isAuto ? "Lançamentos automáticos não podem ser excluídos" : "Excluir lançamento manual"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    Nenhum lançamento financeiro encontrado no período filtrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: Registrar Lançamento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Registrar Lançamento Financeiro</DialogTitle>
            <DialogDescription>Insira as informações de receita ou despesa manual.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Type Toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl border border-border/30">
              <button
                type="button"
                onClick={() => { setFormType('entrada'); setFormCategory('Outros'); }}
                className={`py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${formType === 'entrada' ? 'bg-background text-emerald-500 shadow-sm border border-border/20' : 'text-muted-foreground/80'}`}
              >
                <ArrowUpRight className="h-4 w-4" /> Receita
              </button>
              <button
                type="button"
                onClick={() => { setFormType('saida'); setFormCategory('Suprimentos'); }}
                className={`py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${formType === 'saida' ? 'bg-background text-red-500 shadow-sm border border-border/20' : 'text-muted-foreground/80'}`}
              >
                <ArrowDownRight className="h-4 w-4" /> Despesa
              </button>
            </div>

            {/* Value */}
            <div className="grid gap-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="R$ 0,00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-11 rounded-xl text-base font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Category */}
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Method */}
              <div className="grid gap-2">
                <Label>Forma de Pagamento</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(pm => (
                      <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div className="grid gap-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              {/* Professional */}
              <div className="grid gap-2">
                <Label>Profissional</Label>
                <Select value={formProfId} onValueChange={setFormProfId}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {professionals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Ex: Compra de toalhas, pagamento de aluguel, etc..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleCreateEntry} className="rounded-xl">Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Forma de Pagamento */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar Forma de Pagamento</DialogTitle>
            <DialogDescription>Ajuste o método de pagamento usado para este lançamento.</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="text-sm border p-3 rounded-xl bg-muted/20">
              <p className="font-semibold text-foreground truncate">{selectedEntry?.description || "Sem descrição"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedEntry?.category} · {selectedEntry ? formatCurrency(Number(selectedEntry.amount)) : ""}</p>
            </div>

            <div className="grid gap-2">
              <Label>Forma de Pagamento</Label>
              <Select value={editMethod} onValueChange={setEditMethod}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(pm => (
                    <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleUpdatePaymentMethod} className="rounded-xl">Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
