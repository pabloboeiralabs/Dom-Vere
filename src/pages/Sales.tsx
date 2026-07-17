import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Package, ShoppingCart, Plus, User, Search, UserCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Transaction {
  id: string;
  customer_name: string;
  amount: number;
  total: number;
  notes: string;
  created_at: string;
}

interface ProductSale {
  id: string;
  product_name: string;
  professional_name: string | null;
  customer_name: string | null;
  quantity: number;
  total_price: number;
  commission_amount: number;
  sale_type: 'venda' | 'consumo_colaborador';
  created_at: string;
}

interface Product { id: string; name: string; price: number; stock_quantity: number; commission_percent: number | null; }
interface Professional { id: string; name: string; commission_percent: number; }
interface Customer { id: string; name: string; }

export default function Sales() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [productSales, setProductSales] = useState<ProductSale[]>([]);
  const [activeTab, setActiveTab] = useState("creditos");
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  
  // Sale form state
  const [products, setProducts] = useState<Product[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedProf, setSelectedProf] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saleType, setSaleType] = useState<'venda' | 'consumo_colaborador'>('venda');
  const [salePaymentMethod, setSalePaymentMethod] = useState<string>('pix');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      // Load credits history
      const { data: credits } = await supabase.rpc("get_sales_history", { p_user_id: user.id });
      setTransactions((credits || []) as Transaction[]);

      // Load product sales history
      const { data: sales, error: salesError } = await supabase
        .from("product_sales")
        .select(`
          id,
          quantity,
          total_price,
          commission_amount,
          sale_type,
          created_at,
          products(name),
          professionals(name),
          customers(name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (!salesError) {
        setProductSales(sales.map((s: any) => ({
          id: s.id,
          quantity: s.quantity,
          total_price: s.total_price,
          commission_amount: s.commission_amount,
          sale_type: s.sale_type,
          created_at: s.created_at,
          product_name: s.products?.name || "Produto removido",
          professional_name: s.professionals?.name || null,
          customer_name: s.customers?.name || null
        })));
      }
    } catch (e) { console.error(e); }
  }, [user]);

  const loadFormOptions = async () => {
    if (!user) return;
    const [pRes, profRes, cRes] = await Promise.all([
      supabase.from("products").select("id, name, price, stock_quantity, commission_percent").eq("user_id", user.id).eq("active", true),
      supabase.from("professionals").select("id, name, commission_percent").eq("user_id", user.id).eq("active", true),
      supabase.from("customers").select("id, name").eq("user_id", user.id).order("name")
    ]);
    setProducts(pRes.data || []);
    setProfessionals(profRes.data || []);
    setCustomers(cRes.data || []);
  };

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenSale = () => {
    loadFormOptions();
    setSaleDialogOpen(true);
  };

  const handleCreateSale = async () => {
    if (!user || !selectedProduct || !quantity) return;
    setLoading(true);
    try {
      const product = products.find(p => p.id === selectedProduct);
      const professional = professionals.find(p => p.id === selectedProf);
      
      if (!product) throw new Error("Produto não encontrado");
      if (product.stock_quantity < parseInt(quantity)) {
        throw new Error(`Estoque insuficiente. Disponível: ${product.stock_quantity}`);
      }

      const qty = parseInt(quantity);
      const totalPrice = saleType === 'venda' ? (product.price * qty) : 0; // Consumption might be free for the barber, or charged differently. Defaulting to 0 for tracking usage.
      
      // Calculate commission (only for actual sales)
      let commissionAmount = 0;
      if (saleType === 'venda') {
        const commPercent = product.commission_percent !== null ? product.commission_percent : (professional?.commission_percent || 0);
        commissionAmount = (totalPrice * commPercent) / 100;
      }

      const { error } = await supabase.from("product_sales").insert({
        user_id: user.id,
        product_id: selectedProduct,
        professional_id: selectedProf || null,
        customer_id: selectedCustomer || null,
        quantity: qty,
        unit_price: product.price,
        total_price: totalPrice,
        commission_amount: commissionAmount,
        sale_type: saleType,
        payment_method: saleType === 'venda' ? salePaymentMethod : 'pix',
      });

      if (error) throw error;
      
      toast.success(saleType === 'venda' ? "Venda registrada!" : "Consumo registrado!");
      setSaleDialogOpen(false);
      loadData();
      
      // Reset form
      setSelectedProduct("");
      setSelectedProf("");
      setSelectedCustomer("");
      setQuantity("1");
      setSaleType('venda');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isFromPlan = (t: Transaction) => t.notes?.startsWith("Créditos do plano:");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Vendas e Créditos</h1>
        <Button onClick={handleOpenSale} className="gap-2">
          <ShoppingCart className="h-4 w-4" /> Registrar Saída
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="creditos">Créditos / Planos</TabsTrigger>
          <TabsTrigger value="produtos">Produtos / Consumo</TabsTrigger>
        </TabsList>

        <TabsContent value="creditos">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground">Histórico de Créditos</CardTitle></CardHeader>
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
                        {new Date(t.created_at).toLocaleDateString("pt-BR")}
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
        </TabsContent>

        <TabsContent value="produtos">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-foreground">Saídas de Produtos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto / Tipo</TableHead>
                    <TableHead className="hidden md:table-cell">Profissional / Cliente</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{s.product_name}</div>
                        <Badge variant={s.sale_type === 'venda' ? "default" : "outline"} className="text-[10px] px-1 py-0">
                          {s.sale_type === 'venda' ? 'Venda' : 'Consumo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        <div className="flex flex-col">
                          {s.professional_name && <span className="flex items-center gap-1"><UserCircle className="h-3 w-3" /> {s.professional_name}</span>}
                          {s.customer_name && <span className="text-xs">Cli: {s.customer_name}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-foreground">{s.quantity}</TableCell>
                      <TableCell className="text-right text-foreground font-medium">R$ {Number(s.total_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">R$ {Number(s.commission_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {productSales.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma saída registrada</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Nova Venda/Consumo */}
      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Registrar Saída de Produto</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tipo de Saída</Label>
              <RadioGroup value={saleType} onValueChange={(v: any) => setSaleType(v)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="venda" id="venda" />
                  <Label htmlFor="venda" className="cursor-pointer">Venda</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="consumo_colaborador" id="consumo" />
                  <Label htmlFor="consumo" className="cursor-pointer">Consumo Colaborador</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <Label>Produto</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                      {p.name} - R$ {Number(p.price).toFixed(2)} ({p.stock_quantity} em estoque)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quantidade</Label>
                <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{saleType === 'venda' ? 'Vendedor (Barbeiro)' : 'Colaborador'}</Label>
                <Select value={selectedProf} onValueChange={setSelectedProf}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {saleType === 'venda' && (
              <div className="grid gap-2">
                <Label>Cliente</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {saleType === 'venda' && (
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={salePaymentMethod} onValueChange={setSalePaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">📱 Pix</SelectItem>
                    <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                    <SelectItem value="cartao_credito">💳 Cartão de Crédito</SelectItem>
                    <SelectItem value="cartao_debito">🏧 Cartão de Débito</SelectItem>
                    <SelectItem value="outro">📋 Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSale} disabled={loading || !selectedProduct}>
              {loading ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
