import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Package, ArrowUpCircle, ArrowDownCircle, History, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost_price: number;
  stock_quantity: number;
  commission_percent: number | null;
  active: boolean;
}

interface InventoryTransaction {
  id: string;
  product_name: string;
  quantity: number;
  type: 'in' | 'out';
  reason: string;
  created_at: string;
}

export default function Products() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<InventoryTransaction[]>([]);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "0",
    cost_price: "0",
    commission_percent: "",
    stock_quantity: "0"
  });

  const [stockForm, setStockForm] = useState({
    quantity: "1",
    type: "in" as "in" | "out",
    reason: "Ajuste manual"
  });

  const loadProducts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
      if (error) throw error;
      setProducts((data || []) as Product[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    try {
      const productData = {
        user_id: user.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        commission_percent: form.commission_percent ? parseFloat(form.commission_percent) : null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { data: newProd, error } = await supabase
          .from("products")
          .insert({ ...productData, stock_quantity: parseInt(form.stock_quantity) || 0 })
          .select().single();
        if (error) throw error;
        
        // If initial stock > 0, create a transaction record
        if (parseInt(form.stock_quantity) > 0 && newProd) {
          await supabase.from("inventory_transactions").insert({
            user_id: user.id,
            product_id: newProd.id,
            quantity: parseInt(form.stock_quantity),
            type: 'in',
            reason: 'Estoque inicial'
          });
        }
        toast.success("Produto cadastrado!");
      }
      setDialogOpen(false);
      loadProducts();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", user.id!);
      if (error) throw error;
      toast.success("Produto excluído!");
      loadProducts();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStockUpdate = async () => {
    if (!user || !selectedProduct) return;
    try {
      const { error } = await supabase.from("inventory_transactions").insert({
        user_id: user.id,
        product_id: selectedProduct.id,
        quantity: parseInt(stockForm.quantity),
        type: stockForm.type,
        reason: stockForm.reason
      });
      if (error) throw error;
      toast.success("Estoque atualizado!");
      setStockDialogOpen(false);
      loadProducts();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadHistory = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select(`
          id,
          quantity,
          type,
          reason,
          created_at,
          products(name)
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setHistory(data.map((h: any) => ({
        ...h,
        product_name: h.products.name
      })));
      setHistoryDialogOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openNew = () => {
    setEditingProduct(null);
    setForm({
      name: "",
      description: "",
      price: "0",
      cost_price: "0",
      commission_percent: "",
      stock_quantity: "0"
    });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      description: p.description || "",
      price: String(p.price),
      cost_price: String(p.cost_price),
      commission_percent: p.commission_percent ? String(p.commission_percent) : "",
      stock_quantity: String(p.stock_quantity)
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Produtos</h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Produto
        </Button>
      </div>

      <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Buscar produtos..." 
          className="bg-transparent border-none outline-none text-sm w-full"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden md:table-cell">Preço</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-right w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</TableCell></TableRow>
              ) : filteredProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-foreground">R$ {Number(p.price).toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={p.stock_quantity <= 0 ? "destructive" : p.stock_quantity < 5 ? "secondary" : "default"}>
                      {p.stock_quantity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedProduct(p); setStockDialogOpen(true); }} title="Ajustar estoque">
                        <Package className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => loadHistory(p.id)} title="Histórico">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Editar">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Novo/Editar Produto */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Produto</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input id="description" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Preço de Venda (R$)</Label>
                <Input id="price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost_price">Preço de Custo (R$)</Label>
                <Input id="cost_price" type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({...form, cost_price: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="commission">Comissão (%) - opcional</Label>
                <Input id="commission" type="number" placeholder="Padrão barber" value={form.commission_percent} onChange={(e) => setForm({...form, commission_percent: e.target.value})} />
              </div>
              {!editingProduct && (
                <div className="grid gap-2">
                  <Label htmlFor="stock">Estoque Inicial</Label>
                  <Input id="stock" type="number" value={form.stock_quantity} onChange={(e) => setForm({...form, stock_quantity: e.target.value})} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ajuste de Estoque */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar Estoque: {selectedProduct?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tipo de Movimentação</Label>
              <div className="flex gap-4">
                <Button 
                  variant={stockForm.type === 'in' ? 'default' : 'outline'} 
                  className="flex-1 gap-2"
                  onClick={() => setStockForm({...stockForm, type: 'in'})}
                >
                  <ArrowUpCircle className="h-4 w-4" /> Entrada
                </Button>
                <Button 
                  variant={stockForm.type === 'out' ? 'destructive' : 'outline'} 
                  className="flex-1 gap-2"
                  onClick={() => setStockForm({...stockForm, type: 'out'})}
                >
                  <ArrowDownCircle className="h-4 w-4" /> Saída
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qty">Quantidade</Label>
              <Input id="qty" type="number" min="1" value={stockForm.quantity} onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reason">Motivo</Label>
              <Input id="reason" placeholder="Ex: Compra, Ajuste, Brinde..." value={stockForm.reason} onChange={(e) => setStockForm({...stockForm, reason: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleStockUpdate}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Histórico */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Histórico de Movimentações</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{new Date(h.created_at).toLocaleDateString()} {new Date(h.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</TableCell>
                    <TableCell>
                      <Badge variant={h.type === 'in' ? 'default' : 'destructive'} className="text-[10px]">
                        {h.type === 'in' ? 'Entrada' : 'Saída'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{h.quantity}</TableCell>
                    <TableCell className="text-xs">{h.reason}</TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Sem movimentações</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
