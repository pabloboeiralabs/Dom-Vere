import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PaymentMethod, SplitPaymentInput } from "@/types/cash-register";
import { PAYMENT_METHODS } from "@/types/cash-register";
import { Plus, X } from "lucide-react";

interface Props {
  totalAmount: number;
  onChange: (splits: SplitPaymentInput[]) => void;
  initialSplits?: SplitPaymentInput[];
}

export function SplitPaymentForm({ totalAmount, onChange, initialSplits }: Props) {
  const [splits, setSplits] = useState<SplitPaymentInput[]>(initialSplits || [
    { payment_method: "pix", amount: totalAmount },
  ]);

  const usedMethods = splits.map(s => s.payment_method);

  const updateSplit = (index: number, field: keyof SplitPaymentInput, value: any) => {
    const updated = splits.map((s, i) => {
      if (i !== index) return s;
      const newSplit = { ...s, [field]: value };
      // Auto-calculate change for cash
      if (field === "cash_received" && s.payment_method === "dinheiro") {
        newSplit.cash_change = Math.max(0, Number(value) - s.amount);
      }
      if (field === "amount" && s.payment_method === "dinheiro" && s.cash_received) {
        newSplit.cash_change = Math.max(0, Number(s.cash_received) - Number(value));
      }
      return newSplit;
    });
    setSplits(updated);
    onChange(updated);
  };

  const addSplit = () => {
    const remaining = getRemaining();
    if (remaining <= 0) return;
    const available = PAYMENT_METHODS.find(m => !usedMethods.includes(m.value));
    const method = available?.value || "outro";
    setSplits([...splits, { payment_method: method, amount: remaining }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length <= 1) return;
    const updated = splits.filter((_, i) => i !== index);
    setSplits(updated);
    onChange(updated);
  };

  const getRemaining = () => {
    const allocated = splits.reduce((sum, s) => sum + s.amount, 0);
    return Math.max(0, totalAmount - allocated);
  };

  const remaining = getRemaining();

  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold text-slate-400">Forma de Pagamento</Label>

      {splits.map((split, i) => (
        <div key={i} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-2">
          <div className="flex items-center gap-2">
            {/* Payment method selector */}
            <select
              value={split.payment_method}
              onChange={(e) => updateSplit(i, "payment_method", e.target.value)}
              className="flex-1 h-8 px-2 rounded-lg border border-white/[0.08] bg-[#131B2E] text-white text-xs"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value} disabled={usedMethods.includes(m.value) && m.value !== split.payment_method}>
                  {m.icon} {m.label}
                </option>
              ))}
            </select>

            {/* Amount */}
            <div className="w-28 relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">R$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={split.amount || ""}
                onChange={(e) => updateSplit(i, "amount", Number(e.target.value))}
                className="h-8 pl-8 pr-2 text-xs bg-[#131B2E] border-white/[0.08] text-white"
              />
            </div>

            {splits.length > 1 && (
              <button onClick={() => removeSplit(i)} className="text-slate-500 hover:text-red-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Cash received input (only for dinheiro) */}
          {split.payment_method === "dinheiro" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-24">Valor recebido:</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Quanto o cliente deu?"
                  value={split.cash_received || ""}
                  onChange={(e) => updateSplit(i, "cash_received", Number(e.target.value))}
                  className="h-7 pl-8 pr-2 text-xs bg-[#131B2E] border-white/[0.08] text-white"
                />
              </div>
              {(split.cash_change || 0) > 0 && (
                <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
                  Troco: R$ {split.cash_change?.toFixed(2)}
                </Badge>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Remaining amount warning */}
      {Math.abs(remaining) > 0.01 && (
        <p className={`text-[10px] ${remaining > 0 ? "text-amber-400" : "text-red-400"}`}>
          {remaining > 0
            ? `Falta alocar R$ ${remaining.toFixed(2)}`
            : `Excedeu R$ ${Math.abs(remaining).toFixed(2)}`}
        </p>
      )}

      {/* Add payment method button */}
      {splits.length < PAYMENT_METHODS.length && remaining > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addSplit}
          className="w-full h-8 text-xs text-[#D4AF37] hover:text-[#F3C06B] hover:bg-[#D4AF37]/5"
        >
          <Plus className="h-3 w-3 mr-1" /> Adicionar forma de pagamento
        </Button>
      )}
    </div>
  );
}
