import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Bot, ArrowLeft, Save, Loader2, MessageSquare, Search, Zap, Brain, Globe, Wrench, Webhook, CheckCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type TriggerResp = { id?: string; trigger_word: string; response_text: string; active: boolean };

// ─── Trigger Node ───────────────────────
const TriggerNode = memo(({ data, selected }: NodeProps) => (
  <div className={`rounded-2xl border-2 shadow-lg w-64 backdrop-blur-sm ${selected ? "border-orange-500 shadow-orange-500/30" : "border-orange-400/40 dark:border-orange-600/40 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20"}`}>
    <Handle type="target" position={Position.Top} id="t" className="w-3.5 h-3.5 !bg-orange-500 border-[3px] border-background shadow-md" />
    <Handle type="target" position={Position.Left} id="l" className="w-3 h-3 !bg-orange-400 border-2 border-background" />
    <Handle type="source" position={Position.Right} id="r" className="w-3 h-3 !bg-orange-400 border-2 border-background" />
    <Handle type="source" position={Position.Bottom} id="b" className="w-3.5 h-3.5 !bg-orange-500 border-[3px] border-background shadow-md" />
    <div className="bg-orange-500 rounded-t-2xl px-4 py-2 flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center"><Search className="h-3.5 w-3.5 text-white" /></div>
      <div><span className="text-white text-[11px] font-bold uppercase tracking-[0.2em]">SE</span><p className="text-white/70 text-[9px] -mt-0.5">Condição</p></div>
    </div>
    <div className="px-4 py-3 space-y-2">
      <p className="text-[9px] text-orange-600 dark:text-orange-400 uppercase tracking-wider font-semibold flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> Palavra-chave</p>
      <Input value={data.trigger_word || ""} onChange={(e) => data.onUpdate?.({ trigger_word: e.target.value })}
        className="h-9 text-sm font-mono border-orange-300 dark:border-orange-700 focus-visible:ring-2 focus-visible:ring-orange-500 bg-white/80 dark:bg-black/20 shadow-inner" placeholder="ex: preco, horario" />
    </div>
    <div className="px-4 pb-3 flex gap-1.5">
      <span className="text-[8px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full font-mono">in:↑←</span>
      <span className="text-[8px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full font-mono">out:↓→</span>
    </div>
  </div>
));

// ─── Response Node ──────────────────────
const ResponseNode = memo(({ data, selected }: NodeProps) => (
  <div className={`rounded-2xl border-2 shadow-lg w-80 backdrop-blur-sm ${selected ? "border-green-500 shadow-green-500/30" : "border-green-400/40 dark:border-green-600/40 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20"}`}>
    <Handle type="target" position={Position.Top} id="t" className="w-3.5 h-3.5 !bg-green-500 border-[3px] border-background shadow-md" />
    <Handle type="target" position={Position.Left} id="l" className="w-3 h-3 !bg-green-400 border-2 border-background" />
    <Handle type="source" position={Position.Right} id="r" className="w-3 h-3 !bg-green-400 border-2 border-background" />
    <Handle type="source" position={Position.Bottom} id="b" className="w-3.5 h-3.5 !bg-green-500 border-[3px] border-background shadow-md" />
    <div className="bg-green-500 rounded-t-2xl px-4 py-2 flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center"><MessageSquare className="h-3.5 w-3.5 text-white" /></div>
      <div><span className="text-white text-[11px] font-bold uppercase tracking-[0.2em]">ENTÃO</span><p className="text-white/70 text-[9px] -mt-0.5">Resposta</p></div>
    </div>
    <div className="px-4 py-3 space-y-2">
      <p className="text-[9px] text-green-600 dark:text-green-400 uppercase tracking-wider font-semibold flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> Mensagem</p>
      <Textarea value={data.response_text || ""} onChange={(e) => data.onUpdate?.({ response_text: e.target.value })}
        className="h-28 text-sm border-green-300 dark:border-green-700 focus-visible:ring-2 focus-visible:ring-green-500 bg-white/80 dark:bg-black/20 shadow-inner" placeholder="mensagem que o bot vai enviar..." />
    </div>
    <div className="px-4 pb-3 flex gap-1.5">
      <span className="text-[8px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-mono">in:↑←</span>
      <span className="text-[8px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-mono">out:↓→</span>
    </div>
  </div>
));

// ─── Action Node ────────────────────────
const ActionNode = memo(({ data, selected }: NodeProps) => (
  <div className={`rounded-2xl border-2 shadow-lg w-44 backdrop-blur-sm ${selected ? "border-red-500 shadow-red-500/30" : "border-red-300/40 dark:border-red-700/40 bg-gradient-to-br from-red-50 to-red-100/30 dark:from-red-950/20 dark:to-red-900/10"}`}>
    <Handle type="target" position={Position.Top} id="t" className="w-3 h-3 !bg-red-400 border-2 border-background" />
    <Handle type="target" position={Position.Left} id="l" className="w-2.5 h-2.5 !bg-red-400 border-2 border-background" />
    <div className="bg-red-500/80 rounded-t-2xl px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2"><Trash2 className="h-3.5 w-3.5 text-red-100" /><span className="text-red-100 text-[10px] font-medium">{data.label || "Regra"}</span></div>
      <button onClick={() => data.onDelete?.()} className="text-red-200 hover:text-white hover:bg-red-600/50 rounded-lg p-1 transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  </div>
));

const nodeTypes = { trigger: TriggerNode, response: ResponseNode, action: ActionNode };

// ─── Static AI Flow Nodes ──────────────
const AiFlowNode = memo(({ data }: NodeProps) => {
  const colorMap: Record<string, string> = {
    inbox: "from-blue-500 to-blue-600",
    process: "from-purple-500 to-purple-600",
    brain: "from-violet-500 to-violet-600",
    tool: "from-amber-500 to-amber-600",
    check: "from-emerald-500 to-emerald-600",
    output: "from-green-500 to-green-600",
  };
  const gradient = colorMap[data.variant || "process"] || "from-slate-500 to-slate-600";
  return (
    <div className="rounded-2xl border-2 border-white/10 shadow-lg w-72 backdrop-blur-sm bg-gradient-to-br dark:from-white/5 dark:to-white/10 from-black/5 to-black/10">
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-slate-400 border-2 border-background" />
      <div className={`bg-gradient-to-r ${gradient} rounded-t-2xl px-4 py-2.5 flex items-center gap-2.5`}>
        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">{data.icon}</div>
        <div><span className="text-white text-xs font-bold">{data.title}</span></div>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{data.description}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-slate-400 border-2 border-background" />
    </div>
  );
});

const aiNodeTypes = { aiNode: AiFlowNode };

// ─── Helper: Connector SVG ─────────────
function ConnectorLine() {
  return (
    <div className="flex justify-center py-1">
      <svg width="16" height="20" viewBox="0 0 16 20" className="text-muted-foreground/40">
        <line x1="8" y1="0" x2="8" y2="14" stroke="currentColor" strokeWidth="2" strokeDasharray="3,3" />
        <polygon points="4,12 8,18 12,12" fill="currentColor" />
      </svg>
    </div>
  );
}

// ─── Main Component ────────────────────
interface Props { onBack?: () => void }

export default function WhatsAppBotFlow({ onBack }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"mensagens" | "humanizado">("mensagens");

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/80 backdrop-blur-md z-20 shadow-sm">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold">Editor de Fluxo</h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5">Visualize e edite as regras do bot</p>
            </div>
          </div>
        </div>
        {/* Tab buttons */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
          <button onClick={() => setTab("mensagens")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${tab === "mensagens" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            📋 Mensagens Prontas
          </button>
          <button onClick={() => setTab("humanizado")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${tab === "humanizado" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            🧠 Humanizado (IA)
          </button>
        </div>
      </div>

      {tab === "mensagens" ? <MensagensFlowTab user={user} /> : <HumanizadoFlowTab />}
    </div>
  );
}

// ─── Mensagens Prontas Tab ─────────────
function MensagensFlowTab({ user }: { user: any }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const updatesRef = useRef<Map<string, Partial<TriggerResp>>>(new Map());

  const handleNodeUpdate = useCallback((nodeId: string, patch: Partial<TriggerResp>) => {
    const existing = updatesRef.current.get(nodeId) || {};
    updatesRef.current.set(nodeId, { ...existing, ...patch });
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
  }, [setNodes]);

  const handleDeleteRule = useCallback(async (triggerId: string) => {
    if (!user) return;
    try { await supabase.from("bot_trigger_responses").delete().eq("id", triggerId); toast.success("Regra removida"); setRefreshKey(k => k + 1); }
    catch (e: any) { toast.error("Erro: " + (e?.message || "")); }
  }, [user]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, animated: true, type: "smoothstep", style: { stroke: "#888", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#888" } }, eds));
  }, [setEdges]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const { data: rules } = await supabase.from("bot_trigger_responses").select("*").eq("user_id", user.id).order("created_at");
      const allRules = (rules || []) as TriggerResp[];
      const flowNodes: Node[] = [];
      const flowEdges: Edge[] = [];

      allRules.forEach((rule, idx) => {
        const rowY = idx * 220;
        const triggerId = `trigger-${rule.id}`;
        const responseId = `response-${rule.id}`;
        const actionId = `action-${rule.id}`;

        flowNodes.push({ id: triggerId, type: "trigger", position: { x: 0, y: rowY }, data: { trigger_word: rule.trigger_word, onUpdate: (patch: Partial<TriggerResp>) => handleNodeUpdate(triggerId, patch) } });
        flowNodes.push({ id: responseId, type: "response", position: { x: 290, y: rowY }, data: { response_text: rule.response_text, onUpdate: (patch: Partial<TriggerResp>) => handleNodeUpdate(responseId, patch) } });
        flowNodes.push({ id: actionId, type: "action", position: { x: 640, y: rowY + 20 }, data: { label: rule.trigger_word, onDelete: () => handleDeleteRule(rule.id!) } });

        flowEdges.push({ id: `edge-${rule.id}`, source: triggerId, sourceHandle: "r", target: responseId, targetHandle: "l", type: "smoothstep", animated: true, style: { stroke: "#f97316", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" } });
        flowEdges.push({ id: `edge-action-${rule.id}`, source: responseId, sourceHandle: "r", target: actionId, targetHandle: "l", type: "smoothstep", style: { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "5,4" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" } });
      });

      for (let i = 0; i < allRules.length - 1; i++) {
        flowEdges.push({ id: `cross-${i}`, source: `action-${allRules[i].id}`, sourceHandle: "t", target: `trigger-${allRules[i + 1].id}`, targetHandle: "t", type: "smoothstep", style: { stroke: "#555", strokeWidth: 1, strokeDasharray: "3,5" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#555" } });
      }

      setNodes(flowNodes);
      setEdges(flowEdges);
      setLoading(false);
    })();
  }, [user, refreshKey, handleNodeUpdate, handleDeleteRule, setNodes, setEdges]);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTrigger, setNewTrigger] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddRule = async () => {
    if (!user || !newTrigger.trim() || !newResponse.trim()) return;
    setAdding(true);
    try {
      await supabase.from("bot_trigger_responses").insert({ user_id: user.id, trigger_word: newTrigger.trim().toLowerCase(), response_text: newResponse.trim(), active: true });
      setNewTrigger(""); setNewResponse(""); setShowNewForm(false); toast.success("Nova regra adicionada!"); setRefreshKey(k => k + 1);
    } catch (e: any) { toast.error("Erro: " + (e?.message || "")); }
    finally { setAdding(false); }
  };

  const handleSaveAll = async () => {
    if (!user || updatesRef.current.size === 0) return;
    setSaving(true);
    try {
      for (const [nodeId, patch] of updatesRef.current.entries()) {
        const ruleId = nodeId.replace(/^(trigger|response)-/, "");
        if (!ruleId) continue;
        const updateData: any = {};
        if (patch.trigger_word !== undefined) updateData.trigger_word = patch.trigger_word.trim().toLowerCase();
        if (patch.response_text !== undefined) updateData.response_text = patch.response_text.trim();
        if (Object.keys(updateData).length > 0) await supabase.from("bot_trigger_responses").update(updateData).eq("id", ruleId);
      }
      updatesRef.current.clear();
      toast.success("Todas as alterações salvas!");
    } catch (e: any) { toast.error("Erro ao salvar: " + (e?.message || "")); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/20">
        <p className="text-xs text-muted-foreground">Regras de <span className="font-medium text-foreground">palavra-chave → resposta</span>. Arraste os nós para reorganizar.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl" onClick={() => setShowNewForm(true)}><Plus className="h-3.5 w-3.5 mr-1.5" /> Nova Regra</Button>
          <Button variant="default" size="sm" className="h-8 text-xs rounded-xl bg-green-600 hover:bg-green-700" onClick={handleSaveAll} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />} Salvar
          </Button>
        </div>
      </div>

      {showNewForm && (
        <div className="px-5 py-2 border-b border-border bg-muted/30">
          <div className="max-w-3xl mx-auto flex items-start gap-3">
            <div className="flex-1 space-y-1.5">
              <Input value={newTrigger} onChange={e => setNewTrigger(e.target.value)} placeholder="Palavra-chave (ex: preco)" className="h-8 text-sm border-orange-300 rounded-xl" />
              <Textarea value={newResponse} onChange={e => setNewResponse(e.target.value)} placeholder="Resposta do bot..." className="h-12 text-sm border-green-300 rounded-xl" />
            </div>
            <div className="flex gap-1 pt-0.5">
              <Button size="sm" className="h-8 text-xs rounded-xl" onClick={handleAddRule} disabled={adding || !newTrigger.trim() || !newResponse.trim()}>
                {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />} Adicionar
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs rounded-xl" onClick={() => { setShowNewForm(false); setNewTrigger(""); setNewResponse(""); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4 shadow-inner"><Bot className="h-8 w-8 text-muted-foreground/50" /></div>
              <p className="text-base text-muted-foreground font-medium">Nenhuma regra encontrada</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Nova Regra" para começar</p>
            </div>
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2.5}
            defaultEdgeOptions={{ type: "smoothstep", animated: true, style: { stroke: "#666", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#666" } }}
            connectionLineStyle={{ stroke: "#888", strokeWidth: 2, strokeDasharray: "5,5" }}
          >
            <Background color="#94a3b8" gap={24} size={1.5} />
            <Controls className="rounded-xl border border-border shadow-lg bg-card/90 backdrop-blur-sm" showInteractive={false} />
            <MiniMap nodeStrokeColor="#666" nodeColor={(node) => node.type === "trigger" ? "#f97316" : node.type === "response" ? "#22c55e" : "#ef4444"}
              maskColor="rgba(0,0,0,0.15)" className="rounded-xl border border-border shadow-lg" style={{ width: 160, height: 110 }} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

// ─── Humanizado (IA) Flow Tab ─────────
function HumanizadoFlowTab() {
  const [aiNodes, setAiNodes] = useNodesState([]);
  const [aiEdges, setAiEdges] = useEdgesState([]);

  useEffect(() => {
    const nodes: Node[] = [
      { id: "msg-in", type: "aiNode", position: { x: 0, y: 0 }, data: { variant: "inbox", icon: <Smartphone className="h-4 w-4 text-white" />, title: "Cliente envia mensagem", description: "O cliente envia uma mensagem no WhatsApp. O webhook recebe e processa o evento." } },
      { id: "load-data", type: "aiNode", position: { x: 0, y: 140 }, data: { variant: "process", icon: <Globe className="h-4 w-4 text-white" />, title: "Carrega dados do sistema", description: "Busca configurações, profissionais, serviços, histórico, etapas, cliente e disponibilidade no banco de dados." } },
      { id: "build-prompt", type: "aiNode", position: { x: 0, y: 280 }, data: { variant: "brain", icon: <Brain className="h-4 w-4 text-white" />, title: "Monta prompt do sistema", description: "Gera prompt com nome da barbearia, serviços, profissionais, horários disponíveis, dados do cliente e etapa atual da conversa." } },
      { id: "call-ai", type: "aiNode", position: { x: 0, y: 420 }, data: { variant: "brain", icon: <Bot className="h-4 w-4 text-white" />, title: "Chama IA (Groq Llama 70B)", description: "Envia o prompt + histórico da conversa para a IA. A IA decide se responde ou usa uma ferramenta." } },
      { id: "tools", type: "aiNode", position: { x: 350, y: 420 }, data: { variant: "tool", icon: <Wrench className="h-4 w-4 text-white" />, title: "Ferramentas disponíveis", description: "• check_availability\n• create_appointment\n• send_professional_carousel\n• advance_stage (se houver etapas)" } },
      { id: "check-avail", type: "aiNode", position: { x: 350, y: 600 }, data: { variant: "tool", icon: <Wrench className="h-4 w-4 text-white" />, title: "check_availability", description: "Verifica se horário está disponível no banco (profissional, data, hora). Retorna disponível ou motivo da indisponibilidade." } },
      { id: "create-appt", type: "aiNode", position: { x: 350, y: 740 }, data: { variant: "tool", icon: <Wrench className="h-4 w-4 text-white" />, title: "create_appointment", description: "Cria o agendamento no banco de dados. Insere cliente se necessário. Retorna confirmação." } },
      { id: "send-carousel", type: "aiNode", position: { x: 350, y: 880 }, data: { variant: "tool", icon: <Wrench className="h-4 w-4 text-white" />, title: "send_professional_carousel", description: "Envia carrossel interativo com fotos dos profissionais e botões de escolha via Evolution API." } },
      { id: "stages", type: "aiNode", position: { x: 0, y: 560 }, data: { variant: "process", icon: <CheckCircle className="h-4 w-4 text-white" />, title: "Etapas da conversa", description: "Se configurado, a IA segue etapas (funil):\n1. Saudação\n2. Cadastro\n3. Necessidade\n4. Profissional\n5. Agendamento\n6. Confirmação\n\nCada etapa tem instrução específica." } },
      { id: "advance-stage", type: "aiNode", position: { x: 0, y: 740 }, data: { variant: "check", icon: <CheckCircle className="h-4 w-4 text-white" />, title: "advance_stage", description: "Quando a IA completa uma etapa, chama advance_stage. O sistema avança current_stage no CRM lead e a IA recebe a próxima etapa." } },
      { id: "crm", type: "aiNode", position: { x: 0, y: 880 }, data: { variant: "check", icon: <CheckCircle className="h-4 w-4 text-white" />, title: "Atualiza CRM Lead", description: "Lead é criado/atualizado com:\n• current_stage (etapa atual)\n• last_interaction_at\n• bot_msg_count (contador)" } },
      { id: "respond", type: "aiNode", position: { x: 0, y: 1020 }, data: { variant: "output", icon: <MessageSquare className="h-4 w-4 text-white" />, title: "Bot responde", description: "Mensagem é enviada ao cliente via Evolution API. Resposta fica visível na conversa com badge 🟢 Bot." } },
    ];

    const edges: Edge[] = [
      { id: "e1", source: "msg-in", target: "load-data" },
      { id: "e2", source: "load-data", target: "build-prompt" },
      { id: "e3", source: "build-prompt", target: "call-ai" },
      { id: "e4", source: "call-ai", target: "tools", style: { stroke: "#8b5cf6", strokeDasharray: "5,5" } },
      { id: "e5", source: "tools", target: "check-avail" },
      { id: "e6", source: "tools", target: "create-appt" },
      { id: "e7", source: "tools", target: "send-carousel" },
      { id: "e8", source: "call-ai", target: "stages" },
      { id: "e9", source: "stages", target: "advance-stage" },
      { id: "e10", source: "advance-stage", target: "crm" },
      { id: "e11", source: "crm", target: "respond" },
      { id: "e12", source: "check-avail", target: "respond", style: { stroke: "#8b5cf6", strokeDasharray: "5,5" } },
      { id: "e13", source: "create-appt", target: "respond", style: { stroke: "#8b5cf6", strokeDasharray: "5,5" } },
      { id: "e14", source: "send-carousel", target: "respond", style: { stroke: "#8b5cf6", strokeDasharray: "5,5" } },
    ];

    setAiNodes(nodes);
    setAiEdges(edges);
  }, [setAiNodes, setAiEdges]);

  return (
    <div className="flex-1">
      <ReactFlow nodes={aiNodes} edges={aiEdges} nodeTypes={aiNodeTypes} fitView minZoom={0.2} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        defaultEdgeOptions={{ animated: true, type: "smoothstep", style: { stroke: "#888", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#888" } }}
      >
        <Background color="#94a3b8" gap={24} size={1.5} />
        <Controls className="rounded-xl border border-border shadow-lg bg-card/90 backdrop-blur-sm" showInteractive={false} />
        <MiniMap nodeStrokeColor="#666" nodeColor="#8b5cf6" maskColor="rgba(0,0,0,0.15)"
          className="rounded-xl border border-border shadow-lg" style={{ width: 160, height: 110 }} />
      </ReactFlow>
    </div>
  );
}
