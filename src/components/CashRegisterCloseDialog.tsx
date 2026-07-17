import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CashRegisterSession } from "@/types/cash-register";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CashRegisterSession;
  onConfirm: (actualBalance: number, notes?: string) => Promise<void>;
}

export function CashRegisterCloseDialog({ open, onOpenChange, session, onConfirm }: Props) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const countedNum = Number(counted) || 0;
  const expected = session.expected_closing_balance || 0;
  const diff = countedNum - expected;

  const handleConfirm = async () => {
    if (!counted) return;
    setLoading(true);
    try {
      await onConfirm(countedNum, notes || undefined);
      onOpenChange(false);
    } catch (e: any) {
      // error handled by parent
    } finally {
      setLoading(false);
    }
  };

  const diffColor = diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fechar Caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Expected balance */}
          <div className="p-4 rounded-xl bg-muted/30 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo esperado:</span>
              <span className="font-bold text-foreground">R$ {expected.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo inicial:</span>
              <span>R$ {session.opening_balance.toFixed(2)}</span>
            </div>
          </div>

          {/* Physical count */}
          <div>
            <Label>Valor contado no caixa (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Quanto tem fisicamente?"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
            />
          </div>

          {/* Difference */}
          {counted && (
            <div className={`p-3 rounded-xl text-center font-bold text-lg ${diffColor} ${
              diff > 0 ? "bg-emerald-500/10" : diff < 0 ? "bg-red-500/10" : "bg-muted/30"
            }`}>
              {diff > 0 ? `+ R$ ${diff.toFixed(2)}` : diff < 0 ? `- R$ ${Math.abs(diff).toFixed(2)}` : "R$ 0,00"}
              <p className="text-[10px] font-normal opacity-70 mt-0.5">
                {diff > 0 ? "Sobra no caixa" : diff < 0 ? "Falta no caixa" : "Caixa bateu!"}
              </p>
            </div>
          )}

          <div>
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Ex: R$ 20 separado para troco..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-16 resize-none"
            />
          </div>

          <Button onClick={handleConfirm} disabled={loading || !counted} className="w-full">
            {loading ? "Fechando..." : "Confirmar Fechamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
