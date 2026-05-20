import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, MessageSquare, PauseCircle, PlayCircle, Trash2, Phone, Clock, Users, TrendingUp, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Lead {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  wa_chatid: string | null;
  stage: string;
  notes: string | null;
  bot_paused: boolean;
  bot_msg_count: number;
  last_interaction_at: string | null;
  created_at: string | null;
  appointment_id: string | null;
}

const STAGES = [
  { key: "novo", label: "Novo", color: "bg-slate-500" },
  { key: "em_andamento", label: "Em Andamento", color: "bg-blue-500" },
  { key: "qualificado", label: "Qualificado", color: "bg-purple-500" },
  { key: "agendado", label: "Agendado", color: "bg-cyan-500" },
  { key: "confirmado", label: "Confirmado", color: "bg-teal-500" },
  { key: "compareceu", label: "Compareceu", color: "bg-green-500" },
  { key: "nao_compareceu", label: "Não Compareceu", color: "bg-orange-500" },
  { key: "perdido", label: "Perdido", color: "bg-red-500" },
  { key: "pos_venda", label: "Pós Venda", color: "bg-emerald-500" },
];

export default function CrmKanban() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "" });
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);

  const loadLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("crm_leads")
      .select("*")
      .eq("user_id", user.id)
      .order("last_interaction_at", { ascending: false });
    setLeads((data || []) as Lead[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Auto-scroll horizontal até a primeira coluna que tem leads
  useEffect(() => {
    if (loading || didAutoScrollRef.current || leads.length === 0 || !boardRef.current) return;
    const firstStageWithLeads = STAGES.findIndex(s => leads.some(l => l.stage === s.key));
    if (firstStageWithLeads > 0) {
      const cols = boardRef.current.querySelectorAll<HTMLElement>("[data-kanban-col]");
      const target = cols[firstStageWithLeads];
      if (target) {
        boardRef.current.scrollTo({ left: target.offsetLeft - 8, behavior: "smooth" });
        didAutoScrollRef.current = true;
      }
    }
  }, [leads, loading]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("crm_leads_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_leads", filter: `user_id=eq.${user.id}` }, () => {
        loadLeads();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadLeads]);

  const moveLead = async (leadId: string, newStage: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.stage === newStage) return;

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));

    try {
      const { error } = await supabase.functions.invoke("crm-send-message", {
        body: { user_id: user!.id, lead_id: leadId, new_stage: newStage, phone: lead.phone },
      });
      if (error) throw error;
    } catch (e: any) {
      toast.error("Erro ao mover lead");
      loadLeads();
    }
  };

  const togglePause = async (lead: Lead) => {
    const newVal = !lead.bot_paused;
    await supabase.from("crm_leads").update({ bot_paused: newVal }).eq("id", lead.id);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, bot_paused: newVal } : l));
    toast.success(newVal ? "Bot pausado" : "Bot retomado");
  };

  const deleteLead = async (id: string) => {
    await supabase.from("crm_leads").delete().eq("id", id);
    setLeads(prev => prev.filter(l => l.id !== id));
    toast.success("Lead removido");
  };

  const addLead = async () => {
    if (!user || !newLead.name.trim()) return;
    const { error } = await supabase.from("crm_leads").insert({
      user_id: user.id,
      name: newLead.name.trim(),
      phone: newLead.phone.trim() || null,
      stage: "novo",
    });
    if (error) { toast.error(error.message); return; }
    setNewLead({ name: "", phone: "" });
    setAddDialogOpen(false);
    loadLeads();
    toast.success("Lead adicionado");
  };

  // Metrics
  const total = leads.length;
  const scheduled = leads.filter(l => ["agendado", "confirmado", "compareceu", "pos_venda"].includes(l.stage)).length;
  const converted = leads.filter(l => ["compareceu", "pos_venda"].includes(l.stage)).length;

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLead(leadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    if (draggedLead) {
      moveLead(draggedLead, stageKey);
      setDraggedLead(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">CRM</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-4 w-4" /> {total} leads
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-4 w-4" /> {total > 0 ? Math.round((scheduled / total) * 100) : 0}% agendaram
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> {total > 0 ? Math.round((converted / total) * 100) : 0}% convertidos
            </span>
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Adicionar Lead
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div ref={boardRef} className="overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 220}px` }}>
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.key);
            return (
              <div
                key={stage.key}
                data-kanban-col
                className="flex-1 min-w-[200px] max-w-[280px]"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                  <span className="text-xs font-medium text-foreground truncate">{stage.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stageLeads.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px] bg-muted/30 rounded-lg p-2">
                  {stageLeads.map(lead => (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-foreground truncate flex-1">{lead.name}</p>
                          {lead.bot_paused && <Badge variant="destructive" className="text-[9px] px-1">Pausado</Badge>}
                        </div>
                        {lead.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </p>
                        )}
                        {lead.last_interaction_at && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(lead.last_interaction_at), { locale: ptBR, addSuffix: true })}
                          </p>
                        )}
                        <div className="flex items-center gap-1 pt-1">
                          {lead.wa_chatid && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Abrir WhatsApp"
                              onClick={() => window.open(`/whatsapp`, "_self")}>
                              <MessageSquare className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" title={lead.bot_paused ? "Retomar bot" : "Pausar bot"}
                            onClick={() => togglePause(lead)}>
                            {lead.bot_paused ? <PlayCircle className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover lead?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteLead(lead.id)} className="bg-destructive text-destructive-foreground">Remover</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nome" value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Telefone (opcional)" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} />
            <Button onClick={addLead} className="w-full">Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
