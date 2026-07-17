import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (initialBalance: number) => Promise<void>;
}

export function CashRegisterOpenDialog({ open, onOpenChange, onConfirm }: Props) {
  const [amount, setAmount] = useState("0");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(Number(amount) || 0);
      onOpenChange(false);
    } catch (e: any) {
      // error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir Caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Valor inicial em caixa (R$)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Informe quanto dinheiro físico há no caixa neste momento
            </p>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button onClick={handleConfirm} disabled={loading} className="w-full">
            {loading ? "Abrindo..." : "Abrir Caixa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
