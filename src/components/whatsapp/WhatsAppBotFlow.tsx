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
} from "@xyflow/react";
import type { Node, Edge, Connection, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Bot, ArrowLeft, Save, Loader2, MessageSquare, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type TriggerResp = {
  id?: string;
  trigger_word: string;
  response_text: string;
  active: boolean;
};

// ─── Trigger Node ──────────────────────────────────────────
const TriggerNode = memo(({ data, selected }: NodeProps) => (
  <div className={`rounded-2xl border-2 shadow-lg w-64 backdrop-blur-sm ${selected ? "border-orange-500 shadow-orange-500/30" : "border-orange-400/40 dark:border-orange-600/40 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20"}`}>
    {/* Multiple handles */}
    <Handle type="target" position={Position.Top} id="t" className="w-3.5 h-3.5 !bg-orange-500 border-[3px] border-background shadow-md" />
    <Handle type="target" position={Position.Left} id="l" className="w-3 h-3 !bg-orange-400 border-2 border-background" />
    <Handle type="source" position={Position.Right} id="r" className="w-3 h-3 !bg-orange-400 border-2 border-background" />
    <Handle type="source" position={Position.Bottom} id="b" className="w-3.5 h-3.5 !bg-orange-500 border-[3px] border-background shadow-md" />

    <div className="bg-orange-500 rounded-t-2xl px-4 py-2 flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
        <Search className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <span className="text-white text-[11px] font-bold uppercase tracking-[0.2em]">SE</span>
        <p className="text-white/70 text-[9px] -mt-0.5">Condição</p>
      </div>
    </div>

    <div className="px-4 py-3 space-y-2">
      <p className="text-[9px] text-orange-600 dark:text-orange-400 uppercase tracking-wider font-semibold flex items-center gap-1">
        <Zap className="h-2.5 w-2.5" /> Palavra-chave
      </p>
      <Input
        value={data.trigger_word || ""}
        onChange={(e) => data.onUpdate?.({ trigger_word: e.target.value })}
        className="h-9 text-sm font-mono border-orange-300 dark:border-orange-700 focus-visible:ring-2 focus-visible:ring-orange-500 bg-white/80 dark:bg-black/20 shadow-inner"
        placeholder="ex: preco, horario"
      />
    </div>

    <div className="px-4 pb-3 flex gap-1.5">
      <span className="text-[8px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full font-mono">in:↑←</span>
      <span className="text-[8px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full font-mono">out:↓→</span>
    </div>
  </div>
));

// ─── Response Node ─────────────────────────────────────────
const ResponseNode = memo(({ data, selected }: NodeProps) => (
  <div className={`rounded-2xl border-2 shadow-lg w-80 backdrop-blur-sm ${selected ? "border-green-500 shadow-green-500/30" : "border-green-400/40 dark:border-green-600/40 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20"}`}>
    {/* Multiple handles */}
    <Handle type="target" position={Position.Top} id="t" className="w-3.5 h-3.5 !bg-green-500 border-[3px] border-background shadow-md" />
    <Handle type="target" position={Position.Left} id="l" className="w-3 h-3 !bg-green-400 border-2 border-background" />
    <Handle type="source" position={Position.Right} id="r" className="w-3 h-3 !bg-green-400 border-2 border-background" />
    <Handle type="source" position={Position.Bottom} id="b" className="w-3.5 h-3.5 !bg-green-500 border-[3px] border-background shadow-md" />

    <div className="bg-green-500 rounded-t-2xl px-4 py-2 flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
        <MessageSquare className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <span className="text-white text-[11px] font-bold uppercase tracking-[0.2em]">ENTÃO</span>
        <p className="text-white/70 text-[9px] -mt-0.5">Resposta</p>
      </div>
    </div>

    <div className="px-4 py-3 space-y-2">
      <p className="text-[9px] text-green-600 dark:text-green-400 uppercase tracking-wider font-semibold flex items-center gap-1">
        <Zap className="h-2.5 w-2.5" /> Mensagem
      </p>
      <Textarea
        value={data.response_text || ""}
        onChange={(e) => data.onUpdate?.({ response_text: e.target.value })}
        className="h-28 text-sm border-green-300 dark:border-green-700 focus-visible:ring-2 focus-visible:ring-green-500 bg-white/80 dark:bg-black/20 shadow-inner"
        placeholder="mensagem que o bot vai enviar..."
      />
    </div>

    <div className="px-4 pb-3 flex gap-1.5">
      <span className="text-[8px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-mono">in:↑←</span>
      <span className="text-[8px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-mono">out:↓→</span>
    </div>
  </div>
));

// ─── Action Node ───────────────────────────────────────────
const ActionNode = memo(({ data, selected }: NodeProps) => (
  <div className={`rounded-2xl border-2 shadow-lg w-44 backdrop-blur-sm ${selected ? "border-red-500 shadow-red-500/30" : "border-red-300/40 dark:border-red-700/40 bg-gradient-to-br from-red-50 to-red-100/30 dark:from-red-950/20 dark:to-red-900/10"}`}>
    <Handle type="target" position={Position.Top} id="t" className="w-3 h-3 !bg-red-400 border-2 border-background" />
    <Handle type="target" position={Position.Left} id="l" className="w-2.5 h-2.5 !bg-red-400 border-2 border-background" />

    <div className="bg-red-500/80 rounded-t-2xl px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Trash2 className="h-3.5 w-3.5 text-red-100" />
        <span className="text-red-100 text-[10px] font-medium">{data.label || "Regra"}</span>
      </div>
      <button
        onClick={() => data.onDelete?.()}
        className="text-red-200 hover:text-white hover:bg-red-600/50 rounded-lg p-1 transition-all"
        title="Excluir regra"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
));

const nodeTypes = {
  trigger: TriggerNode,
  response: ResponseNode,
  action: ActionNode,
};

interface Props {
  onBack?: () => void;
}

export default function WhatsAppBotFlow({ onBack }: Props) {
  const { user } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const updatesRef = useRef<Map<string, Partial<TriggerResp>>>(new Map());

  const handleNodeUpdate = useCallback((nodeId: string, patch: Partial<TriggerResp>) => {
    const existing = updatesRef.current.get(nodeId) || {};
    updatesRef.current.set(nodeId, { ...existing, ...patch });
    setNodes((nds) =>
      nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)
    );
  }, [setNodes]);

  const handleDeleteRule = useCallback(async (triggerId: string) => {
    if (!user) return;
    try {
      await supabase.from("bot_trigger_responses").delete().eq("id", triggerId);
      toast.success("Regra removida");
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    }
  }, [user]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({
      ...connection,
      animated: true,
      style: { stroke: "#888", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#888" },
    }, eds));
  }, [setEdges]);

  // Load data and build nodes/edges
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const { data: rules } = await supabase
        .from("bot_trigger_responses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at");

      const allRules = (rules || []) as TriggerResp[];
      const flowNodes: Node[] = [];
      const flowEdges: Edge[] = [];

      // Layout vertical sequencial: cada regra em uma linha, descendo
      allRules.forEach((rule, idx) => {
        const rowY = idx * 220;
        const triggerX = 0;
        const responseX = 290;
        const actionX = 640;

        const triggerId = `trigger-${rule.id}`;
        const responseId = `response-${rule.id}`;
        const actionId = `action-${rule.id}`;

        // Trigger node
        flowNodes.push({
          id: triggerId,
          type: "trigger",
          position: { x: triggerX, y: rowY },
          data: {
            trigger_word: rule.trigger_word,
            onUpdate: (patch: Partial<TriggerResp>) => handleNodeUpdate(triggerId, patch),
          },
        });

        // Response node
        flowNodes.push({
          id: responseId,
          type: "response",
          position: { x: responseX, y: rowY },
          data: {
            response_text: rule.response_text,
            onUpdate: (patch: Partial<TriggerResp>) => handleNodeUpdate(responseId, patch),
          },
        });

        // Action node (delete)
        flowNodes.push({
          id: actionId,
          type: "action",
          position: { x: actionX, y: rowY + 20 },
          data: {
            label: rule.trigger_word,
            onDelete: () => handleDeleteRule(rule.id!),
          },
        });

        // Edges: trigger → response
        flowEdges.push({
          id: `edge-${rule.id}`,
          source: triggerId,
          sourceHandle: "r",
          target: responseId,
          targetHandle: "l",
          type: "smoothstep",
          animated: true,
          style: { stroke: "#f97316", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
        });

        // Edges: response → action
        flowEdges.push({
          id: `edge-action-${rule.id}`,
          source: responseId,
          sourceHandle: "r",
          target: actionId,
          targetHandle: "l",
          type: "smoothstep",
          style: { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "5,4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        });
      });

      // Connect rules verticalmente: bottom do action → top do proximo trigger
      for (let i = 0; i < allRules.length - 1; i++) {
        const currentActionId = `action-${allRules[i].id}`;
        const nextTriggerId = `trigger-${allRules[i + 1].id}`;
        flowEdges.push({
          id: `cross-${i}`,
          source: currentActionId,
          sourceHandle: "t",
          target: nextTriggerId,
          targetHandle: "t",
          type: "smoothstep",
          style: { stroke: "#555", strokeWidth: 1, strokeDasharray: "3,5" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#555" },
        });
      }

      setNodes(flowNodes);
      setEdges(flowEdges);
      setLoading(false);
    })();
  }, [user, refreshKey, handleNodeUpdate, handleDeleteRule, setNodes, setEdges]);

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
        if (Object.keys(updateData).length > 0) {
          await supabase.from("bot_trigger_responses").update(updateData).eq("id", ruleId);
        }
      }
      updatesRef.current.clear();
      toast.success("Todas as alterações salvas!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTrigger, setNewTrigger] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddRule = async () => {
    if (!user || !newTrigger.trim() || !newResponse.trim()) return;
    setAdding(true);
    try {
      await supabase.from("bot_trigger_responses").insert({
        user_id: user.id,
        trigger_word: newTrigger.trim().toLowerCase(),
        response_text: newResponse.trim(),
        active: true,
      });
      setNewTrigger("");
      setNewResponse("");
      setShowNewForm(false);
      toast.success("Nova regra adicionada!");
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    } finally {
      setAdding(false);
    }
  };

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
              <p className="text-[10px] text-muted-foreground -mt-0.5">Arraste, conecte e edite as regras do bot</p>
            </div>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">n8n-style</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl" onClick={() => setShowNewForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova Regra
          </Button>
          <Button variant="default" size="sm" className="h-9 text-xs rounded-xl bg-green-600 hover:bg-green-700" onClick={handleSaveAll} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* New rule form */}
      {showNewForm && (
        <div className="px-5 py-3 border-b border-border bg-muted/40 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Input value={newTrigger} onChange={e => setNewTrigger(e.target.value)} placeholder="Palavra-chave (ex: preco)" className="h-9 text-sm border-orange-300 dark:border-orange-700 rounded-xl" />
              <Textarea value={newResponse} onChange={e => setNewResponse(e.target.value)} placeholder="Resposta do bot..." className="h-14 text-sm border-green-300 dark:border-green-700 rounded-xl" />
            </div>
            <div className="flex gap-1 pt-0.5">
              <Button size="sm" className="h-9 text-xs rounded-xl" onClick={handleAddRule} disabled={adding || !newTrigger.trim() || !newResponse.trim()}>
                {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />} Adicionar
              </Button>
              <Button variant="ghost" size="sm" className="h-9 text-xs rounded-xl" onClick={() => { setShowNewForm(false); setNewTrigger(""); setNewResponse(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Bot className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-base text-muted-foreground font-medium">Nenhuma regra encontrada</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Nova Regra" para começar a construir seu fluxo</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2.5}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "#666", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#666" },
            }}
            connectionLineStyle={{ stroke: "#888", strokeWidth: 2, strokeDasharray: "5,5" }}
          >
            <Background color="#94a3b8" gap={24} size={1.5} />
            <Controls className="rounded-xl border border-border shadow-lg bg-card/90 backdrop-blur-sm" showInteractive={false} />
            <MiniMap
              nodeStrokeColor="#666"
              nodeColor={(node) =>
                node.type === "trigger" ? "#f97316" :
                node.type === "response" ? "#22c55e" :
                "#ef4444"
              }
              maskColor="rgba(0,0,0,0.15)"
              className="rounded-xl border border-border shadow-lg"
              style={{ width: 160, height: 110 }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
