import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Loader2, Wand2, Save, Download, AlertTriangle, CheckCircle2, XCircle,
  ArrowUp, ArrowDown, Plus, Trash2, Pencil, X, Copy, ExternalLink,
  TestTube2, Webhook, KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEvolution } from "@/hooks/useEvolution";

type Stage = {
  id?: string;
  stage_order: number;
  name: string;
  instruction: string;
  active: boolean;
  skip_if_registered: boolean;
  _new?: boolean;
  _dirty?: boolean;
  _delete?: boolean;
};

type TriggerResp = {
  id?: string;
  trigger_word: string;
  response_text: string;
  active: boolean;
};

const DEFAULT_STAGES: Omit<Stage, "_new">[] = [
  { stage_order: 1, name: "Saudação", instruction: "Cumprimente o cliente de forma acolhedora e pergunte como pode ajudar. Se não souber o nome, pergunte.", active: true, skip_if_registered: false },
  { stage_order: 2, name: "Cadastro", instruction: "Colete o nome completo e a data de nascimento do cliente. Use a ferramenta register_customer quando tiver os dados.", active: true, skip_if_registered: true },
  { stage_order: 3, name: "Necessidade", instruction: "Pergunte qual procedimento ou serviço o cliente deseja. Liste as opções disponíveis se necessário.", active: true, skip_if_registered: false },
  { stage_order: 4, name: "Profissional", instruction: "Envie o carrossel de profissionais para o cliente escolher. Use send_professional_carousel.", active: true, skip_if_registered: false },
  { stage_order: 5, name: "Agendamento", instruction: "Pergunte data e horário desejados. Verifique disponibilidade com check_availability e ofereça alternativas se necessário.", active: true, skip_if_registered: false },
  { stage_order: 6, name: "Confirmação", instruction: "Confirme todos os dados (profissional, serviço, data, horário) e crie o agendamento com create_appointment.", active: true, skip_if_registered: false },
];

const TOOLS_JSON = [
  { type: "function", function: { name: "check_availability", description: "Verifica se um horário está disponível.", parameters: { type: "object", properties: { professional_name: { type: "string" }, date: { type: "string" }, time: { type: "string" } }, required: ["date", "time"] } } },
  { type: "function", function: { name: "check_all_availability", description: "Verifica disponibilidade de todos profissionais.", parameters: { type: "object", properties: { date: { type: "string" }, time: { type: "string" } }, required: ["time"] } } },
  { type: "function", function: { name: "create_appointment", description: "Cria um agendamento.", parameters: { type: "object", properties: { customer_name: { type: "string" }, customer_phone: { type: "string" }, professional_name: { type: "string" }, service_name: { type: "string" }, date: { type: "string" }, time: { type: "string" } }, required: ["customer_name", "professional_name", "service_name", "date", "time"] } } },
  { type: "function", function: { name: "send_professional_carousel", description: "Envia carrossel com profissionais.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "register_customer", description: "Cadastra novo cliente.", parameters: { type: "object", properties: { full_name: { type: "string" }, birth_date: { type: "string" } }, required: ["full_name"] } } },
  { type: "function", function: { name: "update_customer", description: "Atualiza dados de cliente.", parameters: { type: "object", properties: { new_name: { type: "string" }, new_birth_date: { type: "string" } }, required: [] } } },
];

export function WhatsAppBotConfigTabs({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const { config, instanceStatus, getStatus, saveBotConfig, getWebhook, setWebhook, apiCall } = useEvolution();

  const bookingUrl = user ? `${window.location.origin}/booking/${user.id}` : "";
  const webhookFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  // ---- Geral
  const [botEnabled, setBotEnabled] = useState(false);
  const [botMode, setBotMode] = useState<"ai" | "menu">("ai");
  const [ignoreGroups, setIgnoreGroups] = useState(true);
  const [stopWord, setStopWord] = useState("parar");
  const [stopMinutes, setStopMinutes] = useState(60);
  const [stopOnManual, setStopOnManual] = useState(30);

  // ---- Instruções
  const [prompt, setPrompt] = useState("");
  const [shopName, setShopName] = useState("Minha Barbearia");
  const [generating, setGenerating] = useState(false);

  // ---- Controles
  const [msgLimit, setMsgLimit] = useState(10);
  const [transferMsg, setTransferMsg] = useState("Vou te transferir para um atendente humano! Aguarde um momento 👋");
  const [triggerWords, setTriggerWords] = useState<string[]>([]);
  const [twInput, setTwInput] = useState("");

  // ---- Etapas
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesLoaded, setStagesLoaded] = useState(false);

  // ---- Respostas
  const [responses, setResponses] = useState<TriggerResp[]>([]);
  const [respModalOpen, setRespModalOpen] = useState(false);
  const [editingResp, setEditingResp] = useState<TriggerResp | null>(null);

  // ---- Avançado
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState<"on" | "off" | "loading">("loading");
  const [openaiKey, setOpenaiKey] = useState("");

  // ---- Lembretes automáticos
  const [autoRemindersEnabled, setAutoRemindersEnabled] = useState(true);
  const [returnTpl, setReturnTpl] = useState("");
  const [expiryTpl, setExpiryTpl] = useState("");
  const [testingReminders, setTestingReminders] = useState(false);
  // ---- State management
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialLoad = useRef(false);

  const markDirty = useCallback(() => setDirty(true), []);

  // Load everything on mount
  useEffect(() => {
    if (!user || initialLoad.current) return;
    initialLoad.current = true;
    (async () => {
      try {
        // settings
        const { data: s } = await supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle();
        if (s) {
          setBotEnabled(!!(s as any).bot_enabled);
          setBotMode((s as any).bot_mode === "menu" ? "menu" : "ai");
          setPrompt((s as any).bot_prompt || "");
          setMsgLimit((s as any).bot_msg_limit ?? 10);
          setTransferMsg((s as any).bot_human_transfer_msg || "Vou te transferir para um atendente humano! Aguarde um momento 👋");
          setTriggerWords((s as any).bot_trigger_words || []);
          if (s.shop_name) setShopName(s.shop_name);
          setAutoRemindersEnabled((s as any).auto_reminder_enabled ?? true);
          setReturnTpl((s as any).auto_reminder_return_template || "");
          setExpiryTpl((s as any).auto_reminder_expiry_template || "");
        }

        // provider settings (from instanceStatus)
        if (instanceStatus) {
          if (instanceStatus.chatbot_ignoreGroups != null) setIgnoreGroups(!!instanceStatus.chatbot_ignoreGroups);
          if (instanceStatus.chatbot_stopConversation) setStopWord(instanceStatus.chatbot_stopConversation);
          if (instanceStatus.chatbot_stopMinutes) setStopMinutes(instanceStatus.chatbot_stopMinutes);
          if (instanceStatus.chatbot_stopWhenYouSendMsg) setStopOnManual(instanceStatus.chatbot_stopWhenYouSendMsg);
          if (instanceStatus.openai_apikey) setOpenaiKey(instanceStatus.openai_apikey);
        }

        // stages
        const { data: stData } = await supabase.from("bot_conversation_stages").select("*").eq("user_id", user.id).order("stage_order");
        if (stData && stData.length > 0) {
          setStages(stData as Stage[]);
        } else {
          // seed defaults
          const seed = DEFAULT_STAGES.map(s => ({
            user_id: user.id,
            stage_order: s.stage_order,
            name: s.name,
            instruction: s.instruction,
            active: s.active,
            skip_if_registered: s.skip_if_registered,
          }));
          const { data: inserted } = await supabase.from("bot_conversation_stages").insert(seed).select();
          setStages((inserted || seed) as Stage[]);
        }
        setStagesLoaded(true);

        // responses
        const { data: rData } = await supabase.from("bot_trigger_responses").select("*").eq("user_id", user.id).order("created_at");
        setResponses((rData || []) as TriggerResp[]);

        // webhook
        try {
          const wh: any = await getWebhook();
          const url = wh?.webhook_url || wh?.url || "";
          const en = !!(wh?.webhook_enabled || wh?.enabled);
          setWebhookUrl(url);
          setWebhookEnabled(en && url.includes("whatsapp-webhook") ? "on" : "off");
        } catch {
          setWebhookEnabled("off");
        }
      } catch (e: any) {
        toast.error("Erro ao carregar configuração: " + (e?.message || ""));
      }
    })();
  }, [user, instanceStatus, getWebhook]);

  // ---- Status badges
  const promptOk = !!prompt.trim();
  const conn = instanceStatus?.status === "connected";

  // ---- Trigger words handlers
  const addTrigger = () => {
    const v = twInput.trim().toLowerCase();
    if (!v) return;
    if (triggerWords.includes(v)) { setTwInput(""); return; }
    setTriggerWords([...triggerWords, v]);
    setTwInput("");
    markDirty();
  };
  const removeTrigger = (w: string) => { setTriggerWords(triggerWords.filter(x => x !== w)); markDirty(); };

  // ---- Stages handlers
  const updateStage = (idx: number, patch: Partial<Stage>) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, ...patch, _dirty: true } : s));
    markDirty();
  };
  const moveStage = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[idx], next[j]] = [next[j], next[idx]];
    next.forEach((s, i) => { s.stage_order = i + 1; s._dirty = true; });
    setStages(next);
    markDirty();
  };
  const addStage = () => {
    setStages([...stages, { stage_order: stages.length + 1, name: "Nova etapa", instruction: "", active: true, skip_if_registered: false, _new: true, _dirty: true }]);
    markDirty();
  };
  const deleteStage = (idx: number) => {
    const s = stages[idx];
    if (s.id) {
      setStages(prev => prev.map((x, i) => i === idx ? { ...x, _delete: true } : x));
    } else {
      setStages(prev => prev.filter((_, i) => i !== idx));
    }
    markDirty();
  };

  // ---- Responses handlers
  const saveResponse = async (r: TriggerResp) => {
    if (!user) return;
    const trigger = r.trigger_word.trim().toLowerCase();
    if (!trigger || !r.response_text.trim()) { toast.error("Preencha palavra-chave e resposta"); return; }
    try {
      if (r.id) {
        await supabase.from("bot_trigger_responses").update({ trigger_word: trigger, response_text: r.response_text, active: r.active }).eq("id", r.id);
        setResponses(prev => prev.map(x => x.id === r.id ? { ...r, trigger_word: trigger } : x));
      } else {
        const { data } = await supabase.from("bot_trigger_responses").insert({ user_id: user.id, trigger_word: trigger, response_text: r.response_text, active: r.active }).select().single();
        if (data) setResponses(prev => [...prev, data as TriggerResp]);
      }
      // ensure trigger word in list
      if (!triggerWords.includes(trigger)) {
        const updated = [...triggerWords, trigger];
        setTriggerWords(updated);
        await supabase.from("settings").update({ bot_trigger_words: updated }).eq("user_id", user.id);
      }
      toast.success("Resposta salva");
      setRespModalOpen(false);
      setEditingResp(null);
    } catch (e: any) {
      toast.error("Erro ao salvar resposta: " + (e?.message || ""));
    }
  };
  const deleteResponse = async (id: string) => {
    await supabase.from("bot_trigger_responses").delete().eq("id", id);
    setResponses(prev => prev.filter(x => x.id !== id));
  };

  // ---- Generate prompt
  const generatePrompt = useCallback(async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const [servicesRes, professionalsRes, schedulesRes, settingsRes] = await Promise.all([
        supabase.from("services").select("name, price").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.from("professionals").select("id, name").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.from("professional_schedules").select("professional_id, day_of_week, start_time, end_time, active").eq("active", true),
        supabase.from("settings").select("shop_name").eq("user_id", user.id).maybeSingle(),
      ]);
      const services = servicesRes.data || [];
      const professionals = professionalsRes.data || [];
      const allSchedules = schedulesRes.data || [];
      const currentShopName = settingsRes.data?.shop_name || shopName;
      const profMap: Record<string, string> = {};
      for (const p of professionals as any[]) profMap[p.id] = p.name;
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const servicesText = services.length
        ? (services as any[]).map(s => `• ${s.name} — R$ ${Number(s.price).toFixed(2)}`).join("\n")
        : "Nenhum serviço cadastrado.";
      const schedByProf: Record<string, string[]> = {};
      for (const s of allSchedules as any[]) {
        const n = profMap[s.professional_id]; if (!n) continue;
        (schedByProf[n] ||= []).push(`${dayNames[s.day_of_week]} ${String(s.start_time).slice(0,5)}-${String(s.end_time).slice(0,5)}`);
      }
      const profsText = professionals.length
        ? (professionals as any[]).map(p => `• ${p.name}${schedByProf[p.name] ? `\n  Horários: ${schedByProf[p.name].join(", ")}` : ""}`).join("\n")
        : "Nenhum profissional cadastrado.";

      const generated = `Você é o assistente virtual da *${currentShopName}*. Seja simpático, empático e use respostas curtas (3-4 linhas), com 1-2 emojis.

📋 *NOSSOS SERVIÇOS:*
${servicesText}

💈 *PROFISSIONAIS E HORÁRIOS:*
${profsText}

📅 *AGENDAMENTO ONLINE:*
${bookingUrl}

🗣️ *FLUXO DA CONVERSA:*
1. Saudação acolhedora.
2. Entenda a necessidade (agendar, valores, dúvida).
3. Direcione para o link de agendamento ou ofereça horários.
4. Se for emergência ou pedido fora do escopo, transfira para um humano.

⚠️ *REGRAS:*
- Não invente informações fora deste prompt.
- Se o cliente digitar "${stopWord}", responda confirmando a pausa e pare.
- Se não souber, diga que vai chamar um atendente humano.

💬 *EXEMPLOS:*
Cliente: "Oi, quero cortar cabelo"
Bot: "Olá! 😊 Que ótimo! Acesse ${bookingUrl} para escolher profissional e horário."`;

      setPrompt(generated);
      markDirty();
      toast.success("Prompt gerado a partir dos seus dados!");
    } catch (e: any) {
      toast.error("Erro ao gerar prompt: " + (e?.message || ""));
    } finally {
      setGenerating(false);
    }
  }, [user, shopName, bookingUrl, stopWord, markDirty]);

  // ---- Save all
  const handleSaveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // 1. Save settings (DB)
      await supabase.from("settings").update({
        bot_enabled: botEnabled,
        bot_mode: botMode,
        bot_prompt: prompt,
        bot_msg_limit: msgLimit,
        bot_human_transfer_msg: transferMsg,
        bot_trigger_words: triggerWords,
        auto_reminder_enabled: autoRemindersEnabled,
        auto_reminder_return_template: returnTpl,
        auto_reminder_expiry_template: expiryTpl,
      } as any).eq("user_id", user.id);

      // 2. Save provider config — only if connected
      if (config && conn) {
        try {
          await saveBotConfig({
            chatbot_enabled: botEnabled,
            chatbot_ignoreGroups: ignoreGroups,
            chatbot_stopConversation: stopWord,
            chatbot_stopMinutes: stopMinutes,
            chatbot_stopWhenYouSendMsg: stopOnManual,
            chatbot_prompt: prompt,
            openai_prompt: prompt,
            ...(openaiKey ? { openai_apikey: openaiKey } : {}),
          }, prompt || undefined);
        } catch (e: any) {
          console.warn("Provider save warning:", e);
          toast.warning("Config salvo no app, mas não no provedor: " + (e?.message || ""));
        }
      }

      // 3. Save stages (upserts + deletes)
      for (const st of stages) {
        if (st._delete && st.id) {
          await supabase.from("bot_conversation_stages").delete().eq("id", st.id);
        } else if (st._new && !st._delete) {
          const { data } = await supabase.from("bot_conversation_stages").insert({
            user_id: user.id,
            stage_order: st.stage_order, name: st.name, instruction: st.instruction,
            active: st.active, skip_if_registered: st.skip_if_registered,
          }).select().single();
          if (data) st.id = (data as any).id;
        } else if (st.id && st._dirty) {
          await supabase.from("bot_conversation_stages").update({
            stage_order: st.stage_order, name: st.name, instruction: st.instruction,
            active: st.active, skip_if_registered: st.skip_if_registered,
          }).eq("id", st.id);
        }
      }
      setStages(prev => prev.filter(s => !s._delete).map(s => ({ ...s, _new: false, _dirty: false })));

      setDirty(false);
      toast.success("Tudo salvo!");
      if (conn) await getStatus().catch(() => {});
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  // ---- Webhook
  const handleConfigureWebhook = async () => {
    if (!user) return;
    try {
      const url = `${webhookFnUrl}?user_id=${user.id}`;
      await setWebhook(url, true);
      setWebhookUrl(url);
      setWebhookEnabled("on");
      toast.success("Webhook configurado!");
    } catch (e: any) {
      toast.error("Erro ao configurar webhook: " + (e?.message || ""));
    }
  };

  // ---- Diagnostics
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const runDiag = async () => {
    setDiagLoading(true);
    try {
      const [statusRes, webhookRes] = await Promise.allSettled([getStatus(), getWebhook()]);
      const st: any = statusRes.status === "fulfilled" ? statusRes.value : null;
      const wh: any = webhookRes.status === "fulfilled" ? webhookRes.value : null;
      const url = wh?.webhook_url || wh?.url || "";
      const enabled = !!(wh?.webhook_enabled || wh?.enabled);
      setDiag({
        connection: st?.status || "unknown",
        chatbotEnabled: !!st?.chatbot_enabled,
        promptPreview: (prompt || "").slice(0, 150),
        promptOk: !!prompt.trim(),
        webhookUrl: url,
        webhookOk: enabled && url.includes("whatsapp-webhook"),
      });
    } catch (e: any) {
      setDiag({ error: e?.message || "Erro" });
    } finally {
      setDiagLoading(false);
    }
  };

  // ---- Download config
  const handleDownload = () => {
    const mask = (k?: string) => !k ? "(não configurada)" : k.length <= 8 ? "****" : k.slice(0, 3) + "..." + k.slice(-4);
    const lines = [
      "=== Configuração do Bot WhatsApp ===",
      `Data: ${new Date().toISOString()}`,
      "",
      "[Geral]",
      `bot_enabled: ${botEnabled}`,
      `ignoreGroups: ${ignoreGroups}`,
      `stopWord: ${stopWord}`,
      `stopMinutes: ${stopMinutes}`,
      `stopOnManual: ${stopOnManual}`,
      `bookingUrl: ${bookingUrl}`,
      "",
      "[API]",
      `OpenAI key: ${mask(openaiKey)}`,
      "",
      "[Webhook]",
      `URL: ${webhookUrl || "(não configurada)"}`,
      `Status: ${webhookEnabled}`,
      "",
      "[Controles]",
      `msgLimit: ${msgLimit}`,
      `transferMsg: ${transferMsg}`,
      `triggerWords: ${triggerWords.join(", ") || "(nenhuma)"}`,
      "",
      "[Etapas]",
      ...stages.filter(s => !s._delete).map(s => `${s.stage_order}. ${s.name}${s.active ? "" : " (inativa)"}\n   ${s.instruction}`),
      "",
      "[Respostas por palavra-chave]",
      ...responses.map(r => `- ${r.trigger_word} → ${r.response_text}`),
      "",
      "[Prompt / Instruções]",
      prompt || "(vazio)",
      "",
      "[Tools]",
      JSON.stringify(TOOLS_JSON, null, 2),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bot-whatsapp-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Configuração baixada");
  };

  return (
    <div className="max-w-3xl mx-auto bg-card rounded-lg border border-border p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} title="Voltar">
              <X className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-lg sm:text-xl font-bold">Configurações do Bot</h2>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant={botEnabled ? "default" : "secondary"}>{botEnabled ? "Bot Ativo" : "Bot Inativo"}</Badge>
        {botMode === "ai" && (
          <Badge variant={promptOk ? "default" : "outline"} className={promptOk ? "" : "text-amber-500 border-amber-500/30"}>
            {promptOk ? "Prompt OK" : "Sem Prompt"}
          </Badge>
        )}
        {botMode === "ai" && <Badge variant="outline" className="text-[10px]">🧠 Humanizado</Badge>}
        {botMode === "menu" && <Badge variant="outline" className="text-[10px]">📋 Mensagens Prontas</Badge>}
        {botMode === "menu" && (
          <Badge variant={responses.length > 0 ? "default" : "outline"} className={responses.length > 0 ? "" : "text-amber-500 border-amber-500/30"}>
            {responses.length > 0 ? `${responses.length} regra(s)` : "Sem regras"}
          </Badge>
        )}
        <Badge variant={webhookEnabled === "on" ? "default" : webhookEnabled === "loading" ? "secondary" : "outline"}>
          {webhookEnabled === "on" ? "Webhook Ativo" : webhookEnabled === "loading" ? "Verificando" : "Webhook Inativo"}
        </Badge>
        {dirty && <Badge variant="destructive">Não Salvo</Badge>}
      </div>

      {botEnabled && botMode === "ai" && !promptOk && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>O bot está ativado no modo Humanizado mas falta o Prompt/Instruções.</AlertDescription>
        </Alert>
      )}
      {botEnabled && botMode === "menu" && responses.length === 0 && (
        <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>O bot está ativado no modo Mensagens Prontas mas nenhuma regra de resposta foi cadastrada.</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="geral" className="w-full">
        <TabsList className={`grid w-full h-auto ${botMode === "ai" ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-5"}`}>
          <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
          {botMode === "ai" && (
            <>
              <TabsTrigger value="etapas" className="text-xs">Etapas</TabsTrigger>
              <TabsTrigger value="instrucoes" className="text-xs">Instruções</TabsTrigger>
            </>
          )}
          <TabsTrigger value="controles" className="text-xs">Controles</TabsTrigger>
          {botMode === "menu" && (
            <TabsTrigger value="respostas" className="text-xs">Respostas</TabsTrigger>
          )}
          <TabsTrigger value="lembretes" className="text-xs">Lembretes</TabsTrigger>
          <TabsTrigger value="avancado" className="text-xs">Avançado</TabsTrigger>
        </TabsList>

        {/* GERAL */}
        <TabsContent value="geral" className="space-y-4 pt-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="space-y-0.5">
              <Label>Automação do Sistema</Label>
              <p className="text-xs text-muted-foreground">Controla se o bot responde mensagens automaticamente.</p>
            </div>
            <Switch checked={botEnabled} onCheckedChange={(v) => { setBotEnabled(v); markDirty(); }} />
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="flex items-center justify-between p-3 pb-2">
              <div className="space-y-0.5">
                <Label>Modo de Atendimento</Label>
                <p className="text-xs text-muted-foreground">Escolha como o bot deve responder seus clientes</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <Button
                type="button"
                variant={botMode === "ai" ? "default" : "outline"}
                className={`h-auto py-4 flex-col items-start gap-1 ${botMode === "ai" ? "" : "hover:bg-accent"}`}
                onClick={() => setBotMode("ai")}
              >
                <span className="text-base">🧠 Humanizado</span>
                <span className="text-[10px] font-normal opacity-80 text-left leading-tight">
                  IA com etapas e instruções personalizadas. Conversa natural e contexto completo.
                </span>
              </Button>
              <Button
                type="button"
                variant={botMode === "menu" ? "default" : "outline"}
                className={`h-auto py-4 flex-col items-start gap-1 ${botMode === "menu" ? "" : "hover:bg-accent"}`}
                onClick={() => setBotMode("menu")}
              >
                <span className="text-base">📋 Mensagens Prontas</span>
                <span className="text-[10px] font-normal opacity-80 text-left leading-tight">
                  Respostas fixas por palavra-chave. Simples e direto, sem IA.
                </span>
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="space-y-0.5">
              <Label>Ignorar Grupos</Label>
              <p className="text-xs text-muted-foreground">O bot não responde em grupos do WhatsApp.</p>
            </div>
            <Switch checked={ignoreGroups} onCheckedChange={(v) => { setIgnoreGroups(v); markDirty(); }} />
          </div>
          <div className="space-y-2">
            <Label>Link de Agendamento Online</Label>
            <div className="flex gap-2">
              <Input readOnly value={bookingUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(bookingUrl); toast.success("Copiado"); }}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => window.open(bookingUrl, "_blank")}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Palavra de parada</Label>
            <Input value={stopWord} onChange={(e) => { setStopWord(e.target.value); markDirty(); }} />
            <p className="text-xs text-muted-foreground">O cliente digita essa palavra para pausar o bot.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pausa após palavra (min)</Label>
              <Input type="number" value={stopMinutes} onChange={(e) => { setStopMinutes(Number(e.target.value) || 0); markDirty(); }} />
            </div>
            <div className="space-y-2">
              <Label>Pausa ao enviar manual (min)</Label>
              <Input type="number" value={stopOnManual} onChange={(e) => { setStopOnManual(Number(e.target.value) || 0); markDirty(); }} />
              <p className="text-xs text-muted-foreground">Tempo que o bot fica inativo quando você responde manualmente.</p>
            </div>
          </div>
        </TabsContent>

        {/* ETAPAS */}
        <TabsContent value="etapas" className="space-y-3 pt-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">🧠 Modo Humanizado</span>
            <span className="text-xs text-muted-foreground">Etapas que o bot segue na conversa (funil). Reordene com as setas.</span>
          </div>
          {!stagesLoaded && <Loader2 className="h-5 w-5 animate-spin" />}
          {stages.filter(s => !s._delete).map((st, idx) => {
            const realIdx = stages.indexOf(st);
            return (
              <div key={st.id || `new-${idx}`} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-6">#{st.stage_order}</span>
                  <Input value={st.name} onChange={(e) => updateStage(realIdx, { name: e.target.value })} className="flex-1" />
                  <Button variant="ghost" size="icon" onClick={() => moveStage(realIdx, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => moveStage(realIdx, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteStage(realIdx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <Textarea value={st.instruction} onChange={(e) => updateStage(realIdx, { instruction: e.target.value })} rows={2} placeholder="Instrução para a IA nesta etapa" />
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <Switch checked={st.active} onCheckedChange={(v) => updateStage(realIdx, { active: v })} />
                    Ativa
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch checked={st.skip_if_registered} onCheckedChange={(v) => updateStage(realIdx, { skip_if_registered: v })} />
                    Pular se já cadastrado
                  </label>
                </div>
              </div>
            );
          })}
          <Button variant="outline" onClick={addStage} className="w-full"><Plus className="h-4 w-4 mr-1" /> Adicionar etapa</Button>
        </TabsContent>

        {/* INSTRUÇÕES */}
        <TabsContent value="instrucoes" className="space-y-3 pt-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">🧠 Modo Humanizado</span>
            <span className="text-xs text-muted-foreground">Clique em "Gerar com meus dados" para criar um prompt automático.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={generatePrompt} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
              Gerar com meus dados
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" /> Baixar
            </Button>
          </div>
          <Textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); markDirty(); }} rows={16} placeholder="Prompt mestre da IA…" className="font-mono text-xs" />
        </TabsContent>

        {/* CONTROLES */}
        <TabsContent value="controles" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Limite de mensagens por lead</Label>
            <Input type="number" value={msgLimit} onChange={(e) => { setMsgLimit(Number(e.target.value) || 0); markDirty(); }} />
            <p className="text-xs text-muted-foreground">0 = ilimitado. Ao atingir, o bot envia a mensagem de transferência e pausa.</p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem de transferência humana</Label>
            <Textarea rows={2} value={transferMsg} onChange={(e) => { setTransferMsg(e.target.value); markDirty(); }} />
          </div>
          <div className="space-y-2">
            <Label>Palavras-gatilho</Label>
            <p className="text-xs text-muted-foreground">Vazio = responde a tudo. Caso contrário, na 1ª mensagem o bot só responde se contiver alguma destas.</p>
            <div className="flex gap-2">
              <Input value={twInput} onChange={(e) => setTwInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTrigger(); } }} placeholder="Digite e Enter" />
              <Button variant="outline" onClick={addTrigger}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {triggerWords.map(w => (
                <Badge key={w} variant="secondary" className="gap-1">
                  {w}
                  <button onClick={() => removeTrigger(w)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {triggerWords.length === 0 && <span className="text-xs text-muted-foreground">(vazio)</span>}
            </div>
          </div>
        </TabsContent>

        {/* RESPOSTAS */}
        <TabsContent value="respostas" className="space-y-3 pt-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">📋 Modo Mensagens Prontas</span>
            <span className="text-xs text-muted-foreground">Palavras-chave e respostas fixas.</span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex-1">
              {botMode === "menu"
                ? "Quando o cliente enviar uma mensagem com a palavra-chave, o bot responde automaticamente com o texto definido abaixo."
                : "Quando o cliente enviar mensagem com a palavra-chave, a IA usa o texto como base para gerar resposta humanizada."}
            </p>
            <Button size="sm" onClick={() => { setEditingResp({ trigger_word: "", response_text: "", active: true }); setRespModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Regra
            </Button>
          </div>
          {responses.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {botMode === "menu"
                ? "Nenhuma regra cadastrada — cadastre palavras-chave e respostas para o bot funcionar."
                : "Nenhuma regra cadastrada — o bot usará a IA para todas as respostas."}
            </p>
          ) : (
            <div className="space-y-2">
              {responses.map(r => (
                <div key={r.id} className="rounded-md border border-border p-3 flex items-start gap-3">
                  <Badge variant="secondary" className="mt-0.5">{r.trigger_word}</Badge>
                  <p className="flex-1 text-sm text-foreground line-clamp-2">{r.response_text}</p>
                  <Button variant="ghost" size="icon" onClick={() => { setEditingResp(r); setRespModalOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => r.id && deleteResponse(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}

          <Dialog open={respModalOpen} onOpenChange={(o) => { setRespModalOpen(o); if (!o) setEditingResp(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingResp?.id ? "Editar regra" : "Nova regra"}</DialogTitle></DialogHeader>
              {editingResp && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Palavra-chave</Label>
                    <Input value={editingResp.trigger_word} onChange={(e) => setEditingResp({ ...editingResp, trigger_word: e.target.value })} placeholder="ex: preço" />
                  </div>
                  <div className="space-y-2">
                    <Label>Resposta base</Label>
                    <Textarea rows={4} value={editingResp.response_text} onChange={(e) => setEditingResp({ ...editingResp, response_text: e.target.value })} />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRespModalOpen(false); setEditingResp(null); }}>Cancelar</Button>
                <Button onClick={() => editingResp && saveResponse(editingResp)}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* LEMBRETES AUTOMÁTICOS */}
        <TabsContent value="lembretes" className="space-y-4 pt-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="space-y-0.5">
              <Label>Lembretes automáticos</Label>
              <p className="text-xs text-muted-foreground">
                O bot envia mensagens 1 dia antes do retorno e do vencimento do plano de cada cliente.
              </p>
            </div>
            <Switch checked={autoRemindersEnabled} onCheckedChange={(v) => { setAutoRemindersEnabled(v); markDirty(); }} />
          </div>

          <div className="space-y-2">
            <Label>Mensagem de retorno (1 dia antes)</Label>
            <Textarea
              rows={6}
              value={returnTpl}
              onChange={(e) => { setReturnTpl(e.target.value); markDirty(); }}
              placeholder="Mensagem enviada na véspera do próximo retorno do cliente"
            />
            <p className="text-[10px] text-muted-foreground">
              Variáveis: {"{nome}"} {"{barbearia}"} {"{data_retorno}"} {"{creditos}"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mensagem de vencimento (1 dia antes)</Label>
            <Textarea
              rows={6}
              value={expiryTpl}
              onChange={(e) => { setExpiryTpl(e.target.value); markDirty(); }}
              placeholder="Mensagem enviada na véspera do vencimento do plano"
            />
            <p className="text-[10px] text-muted-foreground">
              Variáveis: {"{nome}"} {"{barbearia}"} {"{data_vencimento}"} {"{creditos}"}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={testingReminders}
            onClick={async () => {
              setTestingReminders(true);
              try {
                const { data, error } = await supabase.functions.invoke("send-auto-reminders", { body: {} });
                if (error) throw error;
                toast.success(`Execução manual: ${data?.sent ?? 0} enviada(s) de ${data?.processed ?? 0} processada(s)`);
              } catch (e: any) {
                toast.error("Erro: " + (e?.message || ""));
              } finally {
                setTestingReminders(false);
              }
            }}
          >
            {testingReminders ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube2 className="h-4 w-4 mr-1" />}
            Executar agora (teste)
          </Button>
        </TabsContent>

        {/* AVANÇADO */}
        <TabsContent value="avancado" className="space-y-4 pt-4">
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook className={`h-4 w-4 ${webhookEnabled === "on" ? "text-emerald-500" : "text-muted-foreground"}`} />
                <Label>Webhook (tempo real)</Label>
              </div>
              <Badge variant={webhookEnabled === "on" ? "default" : "outline"}>{webhookEnabled}</Badge>
            </div>
            <Input readOnly value={webhookUrl} className="font-mono text-xs" placeholder="(não configurado)" />
            <Button variant="outline" size="sm" onClick={handleConfigureWebhook} className="w-full">
              <Webhook className="h-4 w-4 mr-1" /> Configurar Webhook
            </Button>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <Label>Diagnóstico</Label>
            <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full" onClick={runDiag}>
                  <TestTube2 className="h-4 w-4 mr-1" /> Testar configuração
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Diagnóstico</DialogTitle></DialogHeader>
                {diagLoading ? (
                  <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : diag ? (
                  diag.error ? (
                    <Alert variant="destructive"><AlertDescription>{diag.error}</AlertDescription></Alert>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <DiagRow label="Conexão WhatsApp" ok={diag.connection === "connected"} value={diag.connection} />
                      <DiagRow label="Chatbot habilitado no provedor" ok={diag.chatbotEnabled} value={diag.chatbotEnabled ? "sim" : "não"} />
                      <DiagRow label="Prompt" ok={diag.promptOk} value={diag.promptOk ? `"${diag.promptPreview}…"` : "vazio"} />
                      <DiagRow label="Webhook" ok={diag.webhookOk} value={diag.webhookUrl || "(sem URL)"} />
                    </div>
                  )
                ) : null}
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <Label>API Key OpenAI (opcional)</Label>
            </div>
            <Input type="password" value={openaiKey} onChange={(e) => { setOpenaiKey(e.target.value); markDirty(); }} placeholder="sk-…" />
            <p className="text-xs text-muted-foreground">Se vazio, será usada a IA padrão do sistema.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer save */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-card border-t border-border flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{dirty ? "Mudanças não salvas" : "Tudo salvo"}</span>
        <Button onClick={handleSaveAll} disabled={saving || !dirty} size="lg">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

function DiagRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
        <span className="text-foreground">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}
