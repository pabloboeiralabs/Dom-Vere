import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (type: "sangria" | "suprimento", amount: number, description?: string) => Promise<void>;
}

export function CashMovementDialog({ open, onOpenChange, onConfirm }: Props) {
  const [movType, setMovType] = useState<"sangria" | "suprimento">("sangria");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!amount || Number(amount) <= 0) return;
    setLoading(true);
    try {
      await onConfirm(movType, Number(amount), description || undefined);
      onOpenChange(false);
      setAmount("");
      setDescription("");
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
          <DialogTitle>{movType === "sangria" ? "Registrar Sangria" : "Registrar Suprimento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Type toggle */}
          <div className="flex gap-2">
            <Button
              variant={movType === "sangria" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setMovType("sangria")}
              className="flex-1"
            >
              💸 Sangria (Retirada)
            </Button>
            <Button
              variant={movType === "suprimento" ? "default" : "outline"}
              size="sm"
              onClick={() => setMovType("suprimento")}
              className="flex-1"
            >
              💰 Suprimento (Entrada)
            </Button>
          </div>

          <div>
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <Label>Motivo (opcional)</Label>
            <Textarea
              placeholder={movType === "sangria" ? "Ex: Compra de suprimentos..." : "Ex: Troco inicial..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-16 resize-none"
            />
          </div>

          <Button onClick={handleConfirm} disabled={loading || !amount || Number(amount) <= 0} className="w-full">
            {loading ? "Registrando..." : movType === "sangria" ? "Registrar Sangria" : "Registrar Suprimento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
