import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SplitPaymentForm } from "@/components/SplitPaymentForm";
import { supabase } from "@/integrations/supabase/client";
import type { SplitPaymentInput } from "@/types/cash-register";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AppointmentPaymentDialog({ appointmentId, customerName, onClose, onSaved }: {
  appointmentId: string;
  customerName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [booking, setBooking] = useState<{ ids: string[]; names: string; subtotal: number } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [discount, setDiscount] = useState("");
  const [splits, setSplits] = useState<SplitPaymentInput[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from("appointments")
        .select("service_id,service_ids,service_names,service_total_price,service:services(name,price)")
        .eq("id", appointmentId).single();
      if (!active) return;
      if (error || !data) {
        setLoadError("Não foi possível carregar os serviços do agendamento.");
        return;
      }
      const ids = data.service_ids?.length ? data.service_ids : data.service_id ? [data.service_id] : [];
      const price = data.service_total_price ?? data.service?.price;
      if (!ids.length || price == null) {
        setLoadError("Adicione um serviço ao agendamento antes de finalizar.");
        return;
      }
      setBooking({ ids, names: data.service_names ?? data.service?.name ?? "Serviços do agendamento", subtotal: Math.round(Number(price) * 100) });
    };
    void load();
    return () => { active = false; };
  }, [appointmentId]);

  const discountValue = Number(discount);
  const discountCents = Math.round(discountValue * 100);
  const validDiscount = booking !== null && Number.isFinite(discountValue) &&
    discountValue >= 0 && Math.abs(discountValue * 100 - discountCents) < 0.000001 && discountCents <= booking.subtotal;
  const total = validDiscount ? booking.subtotal - discountCents : 0;

  const save = async () => {
    if (!booking || !validDiscount || saving) return;
    const payments: SplitPaymentInput[] = splits.length ? splits : [{ payment_method: "pix", amount: total / 100 }];
    if (payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) !== total) {
      toast.error("A soma dos pagamentos deve ser igual ao valor a cobrar.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("complete_panel_appointment", {
        p_appointment_id: appointmentId,
        p_service_ids: booking.ids,
        p_discount: discountCents / 100,
        p_splits: payments.map(payment => ({
          payment_method: payment.payment_method,
          amount: payment.amount,
          cash_received: payment.cash_received ?? null,
        })),
      });
      if (error) throw error;
      toast.success("Presença confirmada e pagamento registrado.");
      onSaved();
      onClose();
    } catch (error: unknown) {
      toast.error(error && typeof error === "object" && "message" in error ? String(error.message) : "Não foi possível finalizar o atendimento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar comparecimento</DialogTitle>
          <DialogDescription>{customerName || "Confira os serviços e registre o pagamento."}</DialogDescription>
        </DialogHeader>
        {booking ? (
          <div className="space-y-4">
            <div className="flex justify-between gap-4 text-sm">
              <span>{booking.names}</span><span>{currency.format(booking.subtotal / 100)}</span>
            </div>
            <label className="block space-y-1 text-sm font-medium">
              Desconto (R$)
              <Input type="number" min="0" max={booking.subtotal / 100} step="0.01" value={discount}
                disabled={saving} placeholder="0,00"
                onChange={event => { setDiscount(event.target.value); setSplits([]); }} />
            </label>
            {!validDiscount && <p role="alert" className="text-sm text-destructive">Informe um desconto válido, até o valor dos serviços.</p>}
            <div className="flex justify-between font-semibold">
              <span>Valor a cobrar</span><span>{validDiscount ? currency.format(total / 100) : "—"}</span>
            </div>
            {validDiscount && (
              <fieldset disabled={saving} className="rounded-lg bg-slate-950 p-3 text-white">
                <SplitPaymentForm key={discount} totalAmount={total / 100} onChange={setSplits} />
              </fieldset>
            )}
          </div>
        ) : <p role="status" className="text-sm">{loadError || "Carregando os serviços…"}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
          <Button disabled={!validDiscount || saving} onClick={() => void save()}>
            {saving ? "Finalizando…" : "Confirmar e registrar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
