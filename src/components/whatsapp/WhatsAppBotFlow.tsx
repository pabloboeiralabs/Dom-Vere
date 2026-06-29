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

