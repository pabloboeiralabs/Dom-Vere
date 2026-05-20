import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Percent } from "lucide-react";

interface Service {
  id: string;
  name: string;
  price: number;
}

interface Professional {
  id: string;
  name: string;
}

interface ServiceSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  customerId: string;
  onSaleRegistered: () => void;
}

export default function ServiceSaleDialog({ open, onOpenChange, userId, customerId, onSaleRegistered }: ServiceSaleDialogProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [discount, setDiscount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setDiscount("");
    setSelectedProfessional("");
    Promise.all([
      supabase.from("services").select("id, name, price").eq("user_id", userId).eq("active", true).order("name"),
      supabase.from("professionals").select("id, name").eq("user_id", userId).eq("active", true).order("name"),
    ]).then(([servRes, profRes]) => {
      setServices((servRes.data || []) as Service[]);
      setProfessionals((profRes.data || []) as Professional[]);
    }).catch(console.error);
  }, [open, userId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedServices = services.filter((s) => selected.has(s.id));
  const subtotal = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const discountValue = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const total = subtotal - discountValue;

  const handleConfirm = async () => {
    if (selected.size === 0) { toast.error("Selecione pelo menos um serviço"); return; }
    if (professionals.length > 0 && !selectedProfessional) { toast.error("Selecione o profissional"); return; }
    setLoading(true);
    try {
      const serviceNames = selectedServices.map((s) => s.name).join(", ");
      const profName = professionals.find((p) => p.id === selectedProfessional)?.name;
      const notes = [
        `Serviços: ${serviceNames}`,
        profName ? `Profissional: ${profName}` : "",
        discountValue > 0 ? `Desconto: R$ ${discountValue.toFixed(2)}` : "",
      ].filter(Boolean).join(" · ");

      const { error } = await supabase.from("transactions").insert({
        user_id: userId,
        customer_id: customerId,
        type: "purchase",
        amount: selected.size,
        unit_price: 0,
        total,
        notes,
        professional_id: selectedProfessional || null,
      });
      if (error) throw error;
      toast.success(`Venda registrada! R$ ${total.toFixed(2)}`);
      onSaleRegistered();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Serviços</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Professional selector */}
          {professionals.length > 0 && (
            <div>
              <Label>Profissional</Label>
              <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecione o profissional (opcional)" /></SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">Nenhum serviço cadastrado</p>
          ) : (
            <div className="space-y-2 border border-border rounded-lg p-3 max-h-60 overflow-y-auto">
              {services.map((svc) => (
                <label key={svc.id} className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selected.has(svc.id)}
                      onCheckedChange={() => toggle(svc.id)}
                    />
                    <span className="text-sm text-foreground">{svc.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    R$ {Number(svc.price).toFixed(2)}
                  </Badge>
                </label>
              ))}
            </div>
          )}

          {selected.size > 0 && (
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({selected.size} serviço{selected.size > 1 ? "s" : ""})</span>
                <span className="text-foreground font-medium">R$ {subtotal.toFixed(2)}</span>
              </div>

              <div>
                <label className="text-muted-foreground text-xs flex items-center gap-1">
                  <Percent className="h-3 w-3" /> Desconto (R$)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={subtotal}
                  step={0.01}
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="mt-1"
                />
              </div>

              {discountValue > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="text-destructive font-medium">- R$ {discountValue.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="text-foreground font-semibold">Total</span>
                <span className="text-foreground font-semibold">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={loading || selected.size === 0}>
            {loading ? "Registrando..." : `Cobrar R$ ${total.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
