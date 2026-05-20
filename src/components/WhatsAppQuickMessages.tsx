import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { MessageSquare, Plus, Pencil, Trash2, Send } from "lucide-react";

interface QuickMessage {
  id: string;
  title: string;
  body: string;
}

interface Props {
  customerName: string;
  customerPhone: string;
  creditBalance: number;
  daysRemaining: number;
  expiresAt: string;
}

const DEFAULT_MESSAGES: Omit<QuickMessage, "id">[] = [
  { title: "Lembrete de vencimento", body: "Olá {nome}! Seus {creditos} créditos vencem em {dias} dias ({vencimento}). Agende seu horário!" },
  { title: "Créditos vencidos", body: "Olá {nome}, seus {creditos} créditos venceram em {vencimento}. Entre em contato para renovar!" },
  { title: "Promoção de renovação", body: "Oi {nome}! Renove seus créditos antes do vencimento ({vencimento}) e ganhe condições especiais!" },
];

function replaceVars(body: string, props: Props) {
  return body
    .replace(/\{nome\}/g, props.customerName)
    .replace(/\{creditos\}/g, String(props.creditBalance))
    .replace(/\{dias\}/g, String(props.daysRemaining))
    .replace(/\{vencimento\}/g, new Date(props.expiresAt).toLocaleDateString("pt-BR"));
}

export default function WhatsAppQuickMessages(props: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuickMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<QuickMessage | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");

  const loadMessages = useCallback(async () => {
    if (!user) return;
    try {
      const { data: rows } = await supabase.from("whatsapp_templates").select("id, title, body").eq("user_id", user.id).order("created_at", { ascending: true });
      if ((rows || []).length > 0) {
        setMessages(rows as QuickMessage[]);
      } else {
        const seeded: QuickMessage[] = [];
        for (const msg of DEFAULT_MESSAGES) {
          const { data: row } = await supabase.from("whatsapp_templates").insert({ user_id: user.id, title: msg.title, body: msg.body }).select("id, title, body").single();
          if (row) seeded.push(row as QuickMessage);
        }
        setMessages(seeded);
      }
    } catch {
      setMessages(DEFAULT_MESSAGES.map((m, i) => ({ ...m, id: `local-${i}` })));
    }
  }, [user]);

  useEffect(() => {
    if (open) loadMessages();
  }, [open, loadMessages]);

  const sendWhatsApp = (body: string) => {
    if (!props.customerPhone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    const cleaned = props.customerPhone.replace(/\D/g, "");
    const phone = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
    const text = encodeURIComponent(replaceVars(body, props));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
    setOpen(false);
  };

  const openCreate = () => {
    setEditingMsg(null);
    setFormTitle("");
    setFormBody("");
    setEditDialog(true);
  };

  const openEdit = (msg: QuickMessage) => {
    setEditingMsg(msg);
    setFormTitle(msg.title);
    setFormBody(msg.body);
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    if (!user) return;
    try {
      if (editingMsg && !editingMsg.id.startsWith("local-")) {
        await supabase.from("whatsapp_templates").update({ title: formTitle, body: formBody }).eq("id", editingMsg.id).eq("user_id", user.id);
        setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, title: formTitle, body: formBody } : m));
        toast.success("Mensagem atualizada");
      } else {
        const { data: created } = await supabase.from("whatsapp_templates").insert({ user_id: user.id, title: formTitle, body: formBody }).select("id, title, body").single();
        if (created) setMessages(prev => [...prev, created as QuickMessage]);
        toast.success("Mensagem criada");
      }
      setEditDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      if (!deleteTarget.id.startsWith("local-")) {
        await supabase.from("whatsapp_templates").delete().eq("id", deleteTarget.id).eq("user_id", user.id);
      }
      setMessages(prev => prev.filter(m => m.id !== deleteTarget.id));
      toast.success("Mensagem removida");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10"
            title="WhatsApp"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Mensagens Rápidas</span>
            <Button variant="ghost" size="sm" onClick={openCreate} className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" /> Nova
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="group flex items-start gap-2 p-3 hover:bg-accent/50 border-b border-border/50 last:border-0"
              >
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => sendWhatsApp(msg.body)}>
                  <p className="text-sm font-medium text-foreground truncate">{msg.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {replaceVars(msg.body, props)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sendWhatsApp(msg.body)}>
                    <Send className="h-3 w-3 text-[#25D366]" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(msg)}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(msg)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-6">Nenhuma mensagem cadastrada</p>
            )}
          </div>
          <div className="p-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center">
              Variáveis: {"{nome}"} {"{creditos}"} {"{dias}"} {"{vencimento}"}
            </p>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMsg ? "Editar Mensagem" : "Nova Mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Título da mensagem"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            <Textarea
              placeholder="Corpo da mensagem. Use {nome}, {creditos}, {dias}, {vencimento}"
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Preview: {replaceVars(formBody || "...", props)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover a mensagem &quot;{deleteTarget?.title}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
