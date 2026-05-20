import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MessageSquare } from "lucide-react";

interface QuickMessage {
  id: string;
  title: string;
  body: string;
}

const DEFAULT_MESSAGES: Omit<QuickMessage, "id">[] = [
  { title: "Lembrete de vencimento", body: "Olá {nome}! Seus {creditos} créditos vencem em {dias} dias ({vencimento}). Agende seu horário!" },
  { title: "Créditos vencidos", body: "Olá {nome}, seus {creditos} créditos venceram em {vencimento}. Entre em contato para renovar!" },
  { title: "Promoção de renovação", body: "Oi {nome}! Renove seus créditos antes do vencimento ({vencimento}) e ganhe condições especiais!" },
];

export default function WhatsAppTemplatesTab() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<QuickMessage[]>([]);
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

  useEffect(() => { loadMessages(); }, [loadMessages]);

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
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#25D366]" />
            Mensagens WhatsApp
          </CardTitle>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Nova Mensagem
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Gerencie os modelos de mensagens rápidas enviadas pelo WhatsApp na tela de Vencimentos.
            Use as variáveis: <code className="bg-muted px-1 rounded text-xs">{"{nome}"}</code>{" "}
            <code className="bg-muted px-1 rounded text-xs">{"{creditos}"}</code>{" "}
            <code className="bg-muted px-1 rounded text-xs">{"{dias}"}</code>{" "}
            <code className="bg-muted px-1 rounded text-xs">{"{vencimento}"}</code>
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((msg) => (
                <TableRow key={msg.id}>
                  <TableCell className="font-medium text-foreground whitespace-nowrap">{msg.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-md">
                    <p className="line-clamp-2">{msg.body}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(msg)}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(msg)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {messages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhuma mensagem cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMsg ? "Editar Mensagem" : "Nova Mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input placeholder="Ex: Lembrete de vencimento" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Use {nome}, {creditos}, {dias}, {vencimento}"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={4}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Preview: {formBody
                .replace(/\{nome\}/g, "João")
                .replace(/\{creditos\}/g, "5")
                .replace(/\{dias\}/g, "7")
                .replace(/\{vencimento\}/g, "01/04/2026") || "..."}
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
