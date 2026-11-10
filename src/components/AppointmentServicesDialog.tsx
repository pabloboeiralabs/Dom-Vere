import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type RecordedService = { service_id: string; service_name: string };

export default function AppointmentServicesDialog({ appointmentId, customerName, services, onClose }: {
  appointmentId: string;
  customerName?: string;
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [recorded, setRecorded] = useState<RecordedService[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.from("appointment_performed_services")
      .select("service_id,service_name").eq("appointment_id", appointmentId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadFailed(true);
        else setRecorded(data ?? []);
      });
    return () => { active = false; };
  }, [appointmentId]);

  const available = services.filter(service => !recorded?.some(item => item.service_id === service.id));

  const save = async () => {
    if (!selected.length || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("add_appointment_performed_services", {
        p_appointment_id: appointmentId,
        p_service_ids: selected,
      });
      if (error) throw error;
      toast.success("Serviços adicionados ao histórico do cliente.");
      onClose();
    } catch {
      toast.error("Não foi possível registrar os serviços.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar serviços realizados</DialogTitle>
          <DialogDescription>
            {customerName ? `Registre os serviços feitos para ${customerName}.` : "Registre os serviços feitos neste atendimento."}
          </DialogDescription>
        </DialogHeader>
        {recorded && recorded.length > 0 && (
          <p className="text-sm text-muted-foreground">Já registrados · {recorded.map(service => service.service_name).join(", ")}</p>
        )}
        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {!recorded ? (
            <p role="status" className="text-sm">{loadFailed ? "Não foi possível carregar os serviços registrados." : "Carregando serviços…"}</p>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum serviço disponível para adicionar.</p>
          ) : available.map(service => (
            <label key={service.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <input type="checkbox" checked={selected.includes(service.id)} disabled={saving}
                onChange={event => {
                  const checked = event.currentTarget.checked;
                  setSelected(current => checked ? [...current, service.id] : current.filter(id => id !== service.id));
                }} />
              {service.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Voltar</Button>
          <Button disabled={!selected.length || saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar no histórico"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
