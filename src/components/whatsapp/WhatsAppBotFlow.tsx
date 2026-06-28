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
import { Plus, Trash2, Bot, ArrowLeft, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type TriggerResp = {
  id?: string;
  trigger_word: string;
  response_text: string;
  active: boolean;
};

// ─── Custom Trigger Node ───────────────────────────────────
const TriggerNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`rounded-xl border-2 overflow-hidden shadow-sm w-64 ${selected ? "border-orange-500 shadow-orange-500/20" : "border-orange-300 dark:border-orange-700"}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-orange-500 border-2 border-background" />
      <div className="bg-orange-500 px-3 py-1.5 flex items-center gap-2">
        <span className="text-white text-xs font-bold uppercase tracking-wider">SE</span>
      </div>
      <div className="px-3 py-2 bg-card">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Palavra-chave</p>
        <Input
          value={data.trigger_word || ""}
          onChange={(e) => data.onUpdate?.({ trigger_word: e.target.value })}
          className="h-8 text-sm font-mono border-orange-200 dark:border-orange-800 focus-visible:ring-orange-500"
          placeholder="ex: preco"
        />
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-orange-500 border-2 border-background" />
    </div>
  );
});

// ─── Custom Response Node ───────────────────────────────────
const ResponseNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`rounded-xl border-2 overflow-hidden shadow-sm w-80 ${selected ? "border-green-500 shadow-green-500/20" : "border-green-300 dark:border-green-700"}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-green-500 border-2 border-background" />
      <div className="bg-green-500 px-3 py-1.5 flex items-center gap-2">
        <span className="text-white text-xs font-bold uppercase tracking-wider">ENTÃO</span>
      </div>
      <div className="px-3 py-2 bg-card">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Resposta do bot</p>
        <Textarea
          value={data.response_text || ""}
          onChange={(e) => data.onUpdate?.({ response_text: e.target.value })}
          className="h-24 text-sm border-green-200 dark:border-green-800 focus-visible:ring-green-500"
          placeholder="mensagem que o bot vai enviar..."
        />
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-green-500 border-2 border-background" />
    </div>
  );
});

// ─── Action Node (delete rule) ────────────────────────────
const ActionNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`rounded-xl border-2 overflow-hidden shadow-sm w-48 ${selected ? "border-red-500 shadow-red-500/20" : "border-border"}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-red-400 border-2 border-background" />
      <div className="bg-card px-3 py-2 flex items-center justify-center gap-2">
        <span className="text-xs text-muted-foreground">{data.label || ""}</span>
        <button
          onClick={() => data.onDelete?.()}
          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 rounded p-1 transition-colors"
          title="Excluir regra"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

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
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
      )
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

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        animated: true,
        style: { stroke: "#666", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#666" },
      }, eds));
    },
    [setEdges]
  );

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

      allRules.forEach((rule, idx) => {
        const baseY = idx * 280;
        const triggerId = `trigger-${rule.id}`;
        const responseId = `response-${rule.id}`;
        const actionId = `action-${rule.id}`;

        // Trigger node
        flowNodes.push({
          id: triggerId,
          type: "trigger",
          position: { x: 50, y: baseY },
          data: {
            trigger_word: rule.trigger_word,
            onUpdate: (patch: Partial<TriggerResp>) =>
              handleNodeUpdate(triggerId, patch),
          },
        });

        // Response node
        flowNodes.push({
          id: responseId,
          type: "response",
          position: { x: 50, y: baseY + 120 },
          data: {
            response_text: rule.response_text,
            onUpdate: (patch: Partial<TriggerResp>) =>
              handleNodeUpdate(responseId, patch),
          },
        });

        // Action (delete) node
        flowNodes.push({
          id: actionId,
          type: "action",
          position: { x: 400, y: baseY + 50 },
          data: {
            label: rule.trigger_word,
            onDelete: () => handleDeleteRule(rule.id!),
          },
        });

        // Connect trigger → response
        flowEdges.push({
          id: `edge-${rule.id}`,
          source: triggerId,
          target: responseId,
          animated: true,
          style: { stroke: "#f97316", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
        });

        // Connect response → action
        flowEdges.push({
          id: `edge-action-${rule.id}`,
          source: responseId,
          target: actionId,
          style: { stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "5,5" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        });
      });

      setNodes(flowNodes);
      setEdges(flowEdges);
      setLoading(false);
    })();
  }, [user, refreshKey, handleNodeUpdate, handleDeleteRule, setNodes, setEdges]);

  // Save all pending updates
  const handleSaveAll = async () => {
    if (!user || updatesRef.current.size === 0) return;
    setSaving(true);
    try {
      for (const [nodeId, patch] of updatesRef.current.entries()) {
        // Extract rule ID from node ID format "trigger-{id}" or "response-{id}"
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

  // Add new rule
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
    <div className="flex flex-col h-[calc(100vh)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card z-20">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Bot className="h-5 w-5 text-green-600" />
          <h1 className="text-base font-bold">Editor de Fluxo do Bot</h1>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">🧠 n8n-style</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="h-3 w-3 mr-1" /> Nova regra
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Salvar alterações
          </Button>
        </div>
      </div>

      {/* New rule form */}
      {showNewForm && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="max-w-2xl mx-auto flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Input
                value={newTrigger}
                onChange={e => setNewTrigger(e.target.value)}
                placeholder="Palavra-chave (ex: preco)"
                className="h-8 text-sm border-orange-300 dark:border-orange-700"
              />
              <Textarea
                value={newResponse}
                onChange={e => setNewResponse(e.target.value)}
                placeholder="Resposta do bot..."
                className="h-16 text-sm border-green-300 dark:border-green-700"
              />
            </div>
            <div className="flex gap-1 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleAddRule}
                disabled={adding || !newTrigger.trim() || !newResponse.trim()}
              >
                {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                Adicionar
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setShowNewForm(false); setNewTrigger(""); setNewResponse(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* React Flow canvas */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma regra encontrada</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Nova regra" para começar</p>
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
            minZoom={0.3}
            maxZoom={2}
          >
            <Background color="#94a3b8" gap={20} size={1} />
            <Controls className="rounded-lg border border-border shadow-sm" />
            <MiniMap
              nodeStrokeColor="#666"
              nodeColor={(node) =>
                node.type === "trigger" ? "#f97316" :
                node.type === "response" ? "#22c55e" :
                "#94a3b8"
              }
              maskColor="rgba(0,0,0,0.1)"
              className="rounded-lg border border-border shadow-sm"
              style={{ width: 150, height: 100 }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
