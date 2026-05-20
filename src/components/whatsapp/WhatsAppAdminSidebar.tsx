import { useState } from "react";
import {
  User, MessageCircle, Clock, Tag, ShoppingBag, Reply,
  ChevronRight, X, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type AdminSection = "menu" | "profile" | "greeting" | "away" | "quick_replies" | "labels" | "catalog";

interface Props {
  open: boolean;
  onClose: () => void;
  onApiCall: (method: string, path: string, body?: any) => Promise<any>;
  instanceStatus: any;
}

const menuItems = [
  { id: "profile" as const, icon: Building2, label: "Perfil Comercial", desc: "Nome, foto, descrição, endereço" },
  { id: "greeting" as const, icon: MessageCircle, label: "Mensagem de Saudação", desc: "Boas-vindas automáticas" },
  { id: "away" as const, icon: Clock, label: "Mensagem de Ausência", desc: "Resposta fora do horário" },
  { id: "quick_replies" as const, icon: Reply, label: "Respostas Rápidas", desc: "Atalhos de mensagens frequentes" },
  { id: "labels" as const, icon: Tag, label: "Etiquetas", desc: "Organizar conversas por categoria" },
  { id: "catalog" as const, icon: ShoppingBag, label: "Catálogo", desc: "Produtos e serviços" },
];

export function WhatsAppAdminSidebar({ open, onClose, onApiCall, instanceStatus }: Props) {
  const [section, setSection] = useState<AdminSection>("menu");

  // Profile state
  const [bizName, setBizName] = useState(instanceStatus?.profileName || "");
  const [bizDesc, setBizDesc] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [bizCategory, setBizCategory] = useState("");
  const [bizHours, setBizHours] = useState("");

  // Greeting state
  const [greetingEnabled, setGreetingEnabled] = useState(false);
  const [greetingMsg, setGreetingMsg] = useState("Olá! Bem-vindo. Como posso ajudar?");

  // Away state
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [awayMsg, setAwayMsg] = useState("No momento não estamos disponíveis. Retornaremos em breve!");

  // Quick replies state
  const [quickReplies, setQuickReplies] = useState<{ shortcut: string; message: string }[]>([
    { shortcut: "/obrigado", message: "Obrigado pelo contato! Qualquer dúvida, estamos à disposição." },
    { shortcut: "/horario", message: "Nosso horário de funcionamento é de segunda a sábado, das 9h às 19h." },
  ]);
  const [newShortcut, setNewShortcut] = useState("");
  const [newReplyMsg, setNewReplyMsg] = useState("");

  // Labels state
  const [labels, setLabels] = useState([
    { name: "Novo Cliente", color: "#25D366" },
    { name: "Pagamento Pendente", color: "#FF9800" },
    { name: "Agendado", color: "#2196F3" },
    { name: "Finalizado", color: "#9E9E9E" },
  ]);
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#25D366");

  if (!open) return null;

  const tryEndpoints = async (paths: string[], body: any) => {
    let lastErr: any = null;
    for (const path of paths) {
      try {
        return await onApiCall("POST", path, body);
      } catch (e: any) {
        lastErr = e;
        // Only fall through on 404/not found style errors
        const msg = String(e?.message || "");
        if (!/404|not found|não encontrad|unknown|invalid path/i.test(msg)) throw e;
      }
    }
    throw lastErr;
  };

  const handleSaveProfile = async () => {
    try {
      // Update business profile (description / address / category / hours) — Business endpoints
      await tryEndpoints(
        ["/business/updateBusinessProfile", "/business/profile/update", "/business/profile"],
        {
          description: bizDesc,
          address: bizAddress,
          email: "",
          category: bizCategory,
          business_hours: bizHours,
          websites: [],
        }
      );
      // Update display name via Profile endpoints
      if (bizName?.trim()) {
        await tryEndpoints(
          ["/profile/setName", "/profile/updateName", "/instance/updateName"],
          { name: bizName }
        );
      }
      toast.success("Perfil comercial atualizado!");
    } catch (e: any) {
      console.error("[updateProfile] error:", e);
      toast.error(`Erro ao atualizar perfil: ${e?.message || "desconhecido"}`);
    }
  };

  const handleSaveGreeting = async () => {
    try {
      await onApiCall("POST", "/instance/updatechatbotsettings", {
        greeting_enabled: greetingEnabled,
        greeting_message: greetingMsg,
      });
      toast.success("Mensagem de saudação salva!");
    } catch (e: any) {
      console.error("[saveGreeting] error:", e);
      toast.error(`Erro ao salvar saudação: ${e?.message || "desconhecido"}`);
    }
  };

  const handleSaveAway = async () => {
    try {
      await onApiCall("POST", "/instance/updatechatbotsettings", {
        away_enabled: awayEnabled,
        away_message: awayMsg,
      });
      toast.success("Mensagem de ausência salva!");
    } catch (e: any) {
      console.error("[saveAway] error:", e);
      toast.error(`Erro ao salvar ausência: ${e?.message || "desconhecido"}`);
    }
  };

  const addQuickReply = () => {
    if (!newShortcut.trim() || !newReplyMsg.trim()) return;
    setQuickReplies(prev => [...prev, { shortcut: newShortcut, message: newReplyMsg }]);
    setNewShortcut("");
    setNewReplyMsg("");
    toast.success("Resposta rápida adicionada!");
  };

  const removeQuickReply = (index: number) => {
    setQuickReplies(prev => prev.filter((_, i) => i !== index));
  };

  const addLabel = () => {
    if (!newLabel.trim()) return;
    setLabels(prev => [...prev, { name: newLabel, color: newLabelColor }]);
    setNewLabel("");
    toast.success("Etiqueta criada!");
  };

  const removeLabel = (index: number) => {
    setLabels(prev => prev.filter((_, i) => i !== index));
  };

  const renderContent = () => {
    switch (section) {
      case "menu":
        return (
          <div className="space-y-1">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/60 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        );

      case "profile":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Comercial</Label>
              <Input value={bizName} onChange={e => setBizName(e.target.value)} placeholder="Nome da barbearia" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={bizDesc} onChange={e => setBizDesc(e.target.value)} placeholder="Descreva seu negócio..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={bizAddress} onChange={e => setBizAddress(e.target.value)} placeholder="Rua, número, bairro..." />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input value={bizCategory} onChange={e => setBizCategory(e.target.value)} placeholder="Ex: Barbearia, Salão..." />
            </div>
            <div className="space-y-2">
              <Label>Horário de Funcionamento</Label>
              <Input value={bizHours} onChange={e => setBizHours(e.target.value)} placeholder="Seg-Sáb: 9h-19h" />
            </div>
            <Button onClick={handleSaveProfile} className="w-full" style={{ backgroundColor: "#25D366" }}>
              Salvar Perfil
            </Button>
          </div>
        );

      case "greeting":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Mensagem de Saudação</Label>
              <Switch checked={greetingEnabled} onCheckedChange={setGreetingEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">
              Envie uma mensagem automática quando alguém iniciar uma conversa
            </p>
            <Textarea
              value={greetingMsg}
              onChange={e => setGreetingMsg(e.target.value)}
              rows={4}
              placeholder="Olá! Bem-vindo..."
            />
            <Button onClick={handleSaveGreeting} className="w-full" style={{ backgroundColor: "#25D366" }}>
              Salvar Saudação
            </Button>
          </div>
        );

      case "away":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Mensagem de Ausência</Label>
              <Switch checked={awayEnabled} onCheckedChange={setAwayEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">
              Responda automaticamente quando estiver indisponível
            </p>
            <Textarea
              value={awayMsg}
              onChange={e => setAwayMsg(e.target.value)}
              rows={4}
              placeholder="No momento não estamos disponíveis..."
            />
            <Button onClick={handleSaveAway} className="w-full" style={{ backgroundColor: "#25D366" }}>
              Salvar Ausência
            </Button>
          </div>
        );

      case "quick_replies":
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Crie atalhos para mensagens que você envia com frequência
            </p>
            <div className="space-y-2">
              {quickReplies.map((qr, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-medium text-primary">{qr.shortcut}</p>
                    <p className="text-xs text-muted-foreground truncate">{qr.message}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => removeQuickReply(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <Input value={newShortcut} onChange={e => setNewShortcut(e.target.value)} placeholder="/atalho" className="font-mono text-sm" />
              <Textarea value={newReplyMsg} onChange={e => setNewReplyMsg(e.target.value)} placeholder="Mensagem..." rows={2} />
              <Button onClick={addQuickReply} variant="outline" className="w-full" disabled={!newShortcut.trim() || !newReplyMsg.trim()}>
                Adicionar Resposta Rápida
              </Button>
            </div>
          </div>
        );

      case "labels":
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Use etiquetas para organizar e encontrar conversas facilmente
            </p>
            <div className="flex flex-wrap gap-2">
              {labels.map((label, i) => (
                <Badge
                  key={i}
                  className="cursor-pointer hover:opacity-80 gap-1 pr-1"
                  style={{ backgroundColor: label.color, color: "#fff" }}
                  onClick={() => removeLabel(i)}
                >
                  {label.name}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Nome da etiqueta" className="flex-1" />
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={e => setNewLabelColor(e.target.value)}
                  className="h-9 w-9 rounded border border-border cursor-pointer"
                />
              </div>
              <Button onClick={addLabel} variant="outline" className="w-full" disabled={!newLabel.trim()}>
                Criar Etiqueta
              </Button>
            </div>
          </div>
        );

      case "catalog":
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Gerencie seu catálogo de produtos e serviços do WhatsApp Business
            </p>
            <div className="p-6 rounded-lg border border-dashed border-border text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum produto cadastrado</p>
              <Button variant="outline" className="mt-3" size="sm">
                Adicionar Produto
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-[320px] border-l border-border bg-card flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          {section !== "menu" && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSection("menu")}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
          )}
          <span className="font-medium text-sm text-foreground">
            {section === "menu" ? "Ferramentas Business" : menuItems.find(m => m.id === section)?.label}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {renderContent()}
        </div>
      </ScrollArea>
    </div>
  );
}
