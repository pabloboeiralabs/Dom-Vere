import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type RecordedServices = { service_id: string | null; service_ids: string[] | null; service_names: string | null };

export default function AppointmentServicesDialog({ appointmentId, customerName, services, onClose, onSaved }: {
  appointmentId: string;
  customerName?: string;
  services: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [recorded, setRecorded] = useState<RecordedServices | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.from("appointments")
      .select("service_id,service_ids,service_names").eq("id", appointmentId).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadFailed(true);
        else setRecorded(data);
      });
    return () => { active = false; };
  }, [appointmentId]);

  const bookedIds = recorded?.service_ids ?? (recorded?.service_id ? [recorded.service_id] : []);
  const bookedNames = recorded?.service_names || services.find(service => service.id === recorded?.service_id)?.name;
  const available = services.filter(service => !bookedIds.includes(service.id));

  const save = async () => {
    if (!selected.length || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("add_appointment_performed_services", {
        p_appointment_id: appointmentId,
        p_service_ids: selected,
      });
      if (error) throw error;
      toast.success("Serviços adicionados ao agendamento.");
      onSaved();
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
          <DialogTitle>Adicionar serviços ao agendamento</DialogTitle>
          <DialogDescription>
            {customerName ? `Selecione os serviços adicionais de ${customerName}.` : "Selecione os serviços adicionais deste agendamento."}
          </DialogDescription>
        </DialogHeader>
        {bookedNames && (
          <p className="text-sm text-muted-foreground">Neste agendamento · {bookedNames}</p>
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
            {saving ? "Salvando…" : "Salvar no agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
