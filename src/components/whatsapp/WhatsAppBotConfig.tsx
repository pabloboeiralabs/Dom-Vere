import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wand2, Copy, ExternalLink, Webhook, CheckCircle2, XCircle, AlertTriangle, TestTube2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";


interface Props {
  instanceStatus: any;
  onUpdateSettings: (settings: Record<string, any>) => Promise<void>;
  onSaveBotConfig: (settings: Record<string, any>, agentPrompt?: string) => Promise<any>;
  onSetWebhook?: (url: string, enabled?: boolean) => Promise<any>;
  onGetWebhook?: () => Promise<any>;
  onGetStatus?: () => Promise<any>;
  onGetAgents?: () => Promise<any>;
}

interface DiagResult {
  status?: string;
  chatbotEnabled?: boolean;
  apiKeySet?: boolean;
  agent?: { name: string; model: string; provider: string; promptPreview: string; maxTokens?: number } | null;
  instancePromptPreview?: string;
  promptSource?: "agent" | "instance" | "none";
  agentWarning?: string;
  webhookActive?: boolean;
  webhookUrl?: string;
  error?: string;
}

export function WhatsAppBotConfig({ instanceStatus, onUpdateSettings, onSaveBotConfig, onSetWebhook, onGetWebhook, onGetStatus, onGetAgents }: Props) {
  const { user } = useAuth();
  
  const [enabled, setEnabled] = useState(false);
  const [ignoreGroups, setIgnoreGroups] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [stopWord, setStopWord] = useState("parar");
  const [stopMinutes, setStopMinutes] = useState(60);
  const [manualPauseMinutes, setManualPauseMinutes] = useState(30);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shopName, setShopName] = useState("Barbearia");
  const [webhookStatus, setWebhookStatus] = useState<"unknown" | "active" | "inactive">("unknown");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const lastServerPromptRef = useRef("");

  const handleTestConfig = async () => {
    setDiagnosing(true);
    setDiagResult(null);
    setDiagOpen(true);
    try {
      const [statusRes, agentsRes, webhookRes] = await Promise.allSettled([
        onGetStatus ? onGetStatus() : Promise.reject("no handler"),
        onGetAgents ? onGetAgents() : Promise.reject("no handler"),
        onGetWebhook ? onGetWebhook() : Promise.reject("no handler"),
      ]);

      const statusData = statusRes.status === "fulfilled" ? statusRes.value : null;
      const agentsData = agentsRes.status === "fulfilled" ? agentsRes.value : null;
      const webhookData = webhookRes.status === "fulfilled" ? webhookRes.value : null;

      const inst = statusData?.instance || statusData || {};
      const agents = Array.isArray(agentsData) ? agentsData : (agentsData?.agents || []);
      const firstAgent = agents[0] || null;
      const instancePrompt = (inst.chatbot_prompt || inst.openai_prompt || "").trim();
      const agentPrompt = (firstAgent?.systemPrompt || firstAgent?.agent?.systemPrompt || "").trim();
      const agentsError = agentsRes.status === "rejected"
        ? String((agentsRes.reason as any)?.message || agentsRes.reason || "")
        : "";

      const whUrl = webhookData?.webhook_url || webhookData?.url || "";
      const whActive = !!(webhookData?.webhook_enabled || webhookData?.enabled);

      setWebhookStatus(whActive ? "active" : "inactive");
      setWebhookUrl(whUrl);

      setDiagResult({
        status: inst.status || (statusData?.status?.connected ? "connected" : "disconnected"),
        chatbotEnabled: !!inst.chatbot_enabled,
        apiKeySet: !!(inst.openai_apikey),
        agent: firstAgent ? {
          name: firstAgent.name || "Sem nome",
          model: firstAgent.model || firstAgent.agent?.model || "N/A",
          provider: firstAgent.provider || firstAgent.agent?.provider || "N/A",
          promptPreview: agentPrompt.slice(0, 150),
          maxTokens: firstAgent.maxTokens || firstAgent.agent?.maxTokens || undefined,
        } : null,
        instancePromptPreview: instancePrompt.slice(0, 150),
        promptSource: agentPrompt ? "agent" : instancePrompt ? "instance" : "none",
        agentWarning: agentsError.includes("ADMIN_TOKEN_MISSING") || agentsError.includes("UAZAPI_ADMIN_TOKEN")
          ? "Admin token não configurado; usando apenas o prompt salvo na instância nativa da uazapi."
          : undefined,
        webhookActive: whActive,
        webhookUrl: whUrl,
      });
    } catch (e: any) {
      setDiagResult({ error: e?.message || "Erro ao consultar status" });
    }
    setDiagnosing(false);
  };

  useEffect(() => {
    if (instanceStatus) {
      const serverPrompt = instanceStatus.chatbot_prompt || instanceStatus.openai_prompt || "";
      setEnabled(!!instanceStatus.chatbot_enabled);
      setIgnoreGroups(instanceStatus.chatbot_ignoreGroups ?? true);
      setApiKey(instanceStatus.openai_apikey || "");
      setStopWord(instanceStatus.chatbot_stopConversation || "parar");
      setStopMinutes(instanceStatus.chatbot_stopMinutes || 60);
      setManualPauseMinutes(instanceStatus.chatbot_stopWhenYouSendMsg || 30);

      const currentPrompt = prompt.trim();
      const normalizedServerPrompt = serverPrompt.trim();
      const lastServerPrompt = lastServerPromptRef.current.trim();

      if (normalizedServerPrompt) {
        lastServerPromptRef.current = serverPrompt;
        if (!currentPrompt || currentPrompt === lastServerPrompt) {
          setPrompt(serverPrompt);
        }
      } else if (!currentPrompt) {
        setPrompt("");
      }
    }
  }, [instanceStatus, prompt]);

  // Load shop name
  useEffect(() => {
    if (!user) return;
    supabase.from("settings").select("shop_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.shop_name) setShopName(data.shop_name); });
  }, [user]);

  const bookingUrl = user ? `${window.location.origin}/booking/${user.id}` : "";
  const webhookFunctionUrl = `https://cjkzhxlmtwzbscqiiqin.supabase.co/functions/v1/whatsapp-webhook`;
  const hasAutoGenerated = useRef(false);
  const hasAutoSaved = useRef(false);
  const [savedToServer, setSavedToServer] = useState(true);

  // Load webhook status
  useEffect(() => {
    if (!onGetWebhook) return;
    onGetWebhook().then((data: any) => {
      const url = data?.webhook_url || data?.url || "";
      setWebhookUrl(url);
      setWebhookStatus(data?.webhook_enabled || data?.enabled ? "active" : "inactive");
    }).catch(() => setWebhookStatus("unknown"));
  }, [onGetWebhook]);

  const generatePrompt = useCallback(async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const [servicesRes, professionalsRes, schedulesRes, settingsRes] = await Promise.all([
        supabase.from("services").select("name, price").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.from("professionals").select("id, name").eq("user_id", user.id).eq("active", true).order("name"),
        supabase.from("professional_schedules").select("professional_id, day_of_week, start_time, end_time, active").eq("active", true),
        supabase.from("settings").select("shop_name, credit_price, min_purchase, validity_days").eq("user_id", user.id).maybeSingle(),
      ]);

      const services = servicesRes.data || [];
      const professionals = professionalsRes.data || [];
      const allSchedules = schedulesRes.data || [];
      const settings = settingsRes.data || {};
      const currentShopName = (settings as any)?.shop_name || shopName;

      // Get professional names for schedules
      const profMap: Record<string, string> = {};
      for (const p of professionals) profMap[p.id] = p.name;

      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

      let servicesText = "Nenhum serviço cadastrado ainda.";
      if (services.length > 0) {
        servicesText = services.map((s: any) => `• ${s.name} — R$ ${Number(s.price).toFixed(2)}`).join("\n");
      }

      let profsText = "Nenhum profissional cadastrado ainda.";
      if (professionals.length > 0) {
        const schedByProf: Record<string, string[]> = {};
        for (const s of allSchedules as any[]) {
          const profName = profMap[s.professional_id];
          if (!profName) continue;
          if (!schedByProf[profName]) schedByProf[profName] = [];
          schedByProf[profName].push(`${dayNames[s.day_of_week]} ${String(s.start_time).slice(0,5)}-${String(s.end_time).slice(0,5)}`);
        }
        profsText = professionals.map((p: any) => {
          const horarios = schedByProf[p.name];
          return `• ${p.name}${horarios ? `\n  Horários: ${horarios.join(", ")}` : " (sem horários definidos)"}`;
        }).join("\n");
      }

      const generated = `Você é o assistente virtual da *${currentShopName}*. Seja simpático, profissional e objetivo. Use emojis com moderação para tornar a conversa agradável. 😊

📋 *NOSSOS SERVIÇOS E PREÇOS:*
${servicesText}

💈 *NOSSOS PROFISSIONAIS E HORÁRIOS DE ATENDIMENTO:*
${profsText}

💳 *PACOTES DE CRÉDITOS:*
${(settings as any)?.credit_price ? `• Valor por crédito: R$ ${Number((settings as any).credit_price).toFixed(2)}\n• Compra mínima: ${(settings as any).min_purchase || 5} créditos\n• Validade: ${(settings as any).validity_days || 90} dias` : "Consulte nossos pacotes especiais!"}

📅 *COMO AGENDAR:*
O agendamento é feito pelo nosso link exclusivo:
${bookingUrl}

No link, o cliente pode:
1. Escolher o profissional de preferência
2. Selecionar o serviço desejado
3. Ver os dias e horários disponíveis
4. Confirmar o agendamento na hora

🤖 *FLUXO DE ATENDIMENTO — SIGA ESTA ORDEM:*

1. *Saudação*: Cumprimente o cliente pelo nome (se disponível) e pergunte como pode ajudar.

2. *Identificação da necessidade*: Entenda o que o cliente deseja:
   - Agendar um horário
   - Saber preços e serviços
   - Informações sobre horários de funcionamento
   - Consultar pacotes de créditos
   - Outras dúvidas

3. *Se quiser AGENDAR*:
   - Pergunte qual serviço deseja
   - Pergunte se tem preferência de profissional
   - Envie o link de agendamento: ${bookingUrl}
   - Explique que pelo link ele escolhe dia, horário e confirma na hora
   - Diga: "Pelo link você consegue ver todos os horários disponíveis em tempo real! 📅"

4. *Se quiser saber PREÇOS*:
   - Liste os serviços e preços disponíveis
   - Ofereça para agendar em seguida

5. *Se quiser saber HORÁRIOS*:
   - Informe os horários dos profissionais
   - Sugira o agendamento online

6. *Se quiser saber sobre PACOTES/CRÉDITOS*:
   - Explique o sistema de créditos e valores
   - Diga que a compra é feita presencialmente ou pelo sistema

⚠️ *REGRAS IMPORTANTES:*
1. NUNCA invente informações que não estão neste prompt
2. Responda APENAS sobre assuntos relacionados à ${currentShopName}
3. Se perguntarem algo que você não sabe, diga: "Vou transferir você para um de nossos atendentes para te ajudar melhor! 😊"
4. SEMPRE sugira o agendamento online quando o cliente quiser marcar horário
5. Não faça agendamentos pela conversa — sempre direcione para o link
6. Se o cliente insistir em agendar pelo chat, explique que o link é mais rápido e ele pode ver os horários disponíveis em tempo real
7. Seja breve nas respostas — máximo 3-4 linhas por mensagem quando possível
8. Quando o cliente digitar "${stopWord}", encerre o atendimento automático e diga que um atendente humano irá assumir

💡 *EXEMPLOS DE RESPOSTAS:*

Cliente: "Quero cortar cabelo"
Você: "Ótimo! 💈 Temos os seguintes serviços disponíveis:\n[lista serviços]\nQual você prefere? E tem algum profissional de preferência?"

Cliente: "Quanto custa?"
Você: "Nossos preços são:\n[lista preços]\nGostaria de agendar um horário? 📅"

Cliente: "Quero agendar"
Você: "Perfeito! 📅 Acesse nosso link de agendamento e escolha o melhor horário pra você:\n${bookingUrl}\nLá você vê os horários disponíveis em tempo real!"`;

      setPrompt(generated);
      toast.success("Prompt completo gerado com sucesso!");
    } catch (e: any) {
      toast.error("Erro ao gerar prompt: " + e.message);
    } finally {
      setGenerating(false);
    }
  }, [user, shopName, bookingUrl, stopWord]);

  // Auto-generate prompt when it's empty after instanceStatus loads, then auto-save
  useEffect(() => {
    if (instanceStatus && !prompt && !hasAutoGenerated.current && user) {
      hasAutoGenerated.current = true;
      generatePrompt();
    }
  }, [instanceStatus, prompt, user, generatePrompt]);

  // Auto-save after prompt is auto-generated (if bot is enabled and API key exists)
  useEffect(() => {
    if (hasAutoGenerated.current && !hasAutoSaved.current && prompt && enabled && apiKey) {
      hasAutoSaved.current = true;
      console.log("[WhatsAppBotConfig] Auto-saving generated prompt to server...");
      setSavedToServer(false);
      const settings = {
        chatbot_enabled: enabled,
        chatbot_ignoreGroups: ignoreGroups,
        openai_apikey: apiKey,
        chatbot_stopConversation: stopWord,
        chatbot_stopMinutes: stopMinutes,
        chatbot_stopWhenYouSendMsg: manualPauseMinutes,
        chatbot_prompt: prompt,
        openai_prompt: prompt,
      };
      onSaveBotConfig(settings, prompt)
        .then(() => {
          setSavedToServer(true);
          toast.success("Bot configurado automaticamente com seus dados!");
        })
        .catch((e) => {
          console.error("[WhatsAppBotConfig] Auto-save failed:", e);
          toast.error("Erro ao salvar bot automaticamente. Clique em 'Salvar' manualmente.");
        });
    }
  }, [prompt, enabled, apiKey, ignoreGroups, stopWord, stopMinutes, manualPauseMinutes, onSaveBotConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedPrompt = prompt.trim();
      const settings = {
        chatbot_enabled: enabled,
        chatbot_ignoreGroups: ignoreGroups,
        openai_apikey: apiKey,
        chatbot_stopConversation: stopWord,
        chatbot_stopMinutes: stopMinutes,
        chatbot_stopWhenYouSendMsg: manualPauseMinutes,
        chatbot_prompt: trimmedPrompt,
        openai_prompt: trimmedPrompt,
      };

      const result = await onSaveBotConfig(settings, trimmedPrompt || undefined);
      console.log("[WhatsAppBotConfig] Save result:", result);
      lastServerPromptRef.current = trimmedPrompt;
      setSavedToServer(true);
      if (onGetStatus) {
        await onGetStatus();
      }
      if (onGetStatus || onGetAgents || onGetWebhook) {
        await handleTestConfig();
      }

      if (result?.agentWarning) {
        toast.success("Configurações salvas na instância da uazapi. O agente remoto foi ignorado, mas o bot pode responder com o prompt salvo.");
      } else {
        toast.success("Configurações do bot salvas com sucesso!");
      }
    } catch (e: any) {
      console.error("Bot save error:", e);
      if (e.message?.includes("ADMIN_TOKEN_MISSING")) {
        toast.error("⚠️ O admin token da Uazapi não está configurado. As configurações gerais foram salvas, mas o agente IA não pôde ser criado. Solicite ao administrador configurar o secret UAZAPI_ADMIN_TOKEN.", { duration: 10000 });
      } else {
        toast.error("Erro ao salvar configurações: " + (e.message || ""));
      }
    }
    setSaving(false);
  };

  const copyBookingLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    toast.success("Link copiado!");
  };

  return (
    <div className="space-y-6 p-6">
      <h3 className="font-semibold text-foreground">Configurações do Bot</h3>

      {/* Status Diagnostics */}
      <div className="flex flex-wrap gap-2">
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? "✅ Bot Ativo" : "⏸️ Bot Inativo"}
        </Badge>
        <Badge variant={apiKey ? "default" : "destructive"}>
          {apiKey ? "🔑 API Key OK" : "❌ Sem API Key"}
        </Badge>
        <Badge variant={prompt ? "default" : "destructive"}>
          {prompt ? "📝 Prompt OK" : "❌ Sem Prompt"}
        </Badge>
        <Badge variant={webhookStatus === "active" ? "default" : "secondary"}>
          {webhookStatus === "active" ? "📡 Webhook Ativo" : "📡 Webhook Inativo"}
        </Badge>
        {!savedToServer && (
          <Badge variant="destructive">
            ⚠️ Não Salvo
          </Badge>
        )}
        {diagResult?.agent && (
          <>
            <Badge variant="outline" className="gap-1">
              🤖 {diagResult.agent.model}
            </Badge>
            {diagResult.agent.maxTokens && (
              <Badge variant="outline" className="gap-1">
                📊 {diagResult.agent.maxTokens} tokens
              </Badge>
            )}
          </>
        )}
      </div>

      {/* Testar Configuração */}
      {(onGetStatus || onGetAgents) && (
        <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={(e) => {
                if (!diagOpen) {
                  e.preventDefault();
                  handleTestConfig();
                }
              }}
              disabled={diagnosing}
            >
              {diagnosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
              Testar Configuração
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {diagResult && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-sm">
                {diagResult.error ? (
                  <p className="text-destructive">{diagResult.error}</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Instância</span>
                      <Badge variant={diagResult.status === "connected" ? "default" : "destructive"}>
                        {diagResult.status === "connected" ? "✅ Conectada" : "❌ Desconectada"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Chatbot</span>
                      <Badge variant={diagResult.chatbotEnabled ? "default" : "secondary"}>
                        {diagResult.chatbotEnabled ? "✅ Ativado" : "⏸️ Desativado"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">API Key</span>
                      <Badge variant={diagResult.apiKeySet ? "default" : "destructive"}>
                        {diagResult.apiKeySet ? "✅ Configurada" : "❌ Não configurada"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Webhook</span>
                      <Badge variant={diagResult.webhookActive ? "default" : "secondary"}>
                        {diagResult.webhookActive ? "✅ Ativo" : "⏸️ Inativo"}
                      </Badge>
                    </div>
                    {diagResult.webhookUrl && (
                      <div>
                        <span className="text-muted-foreground text-xs">URL: </span>
                        <span className="text-xs font-mono break-all">{diagResult.webhookUrl}</span>
                      </div>
                    )}
                    <div className="border-t border-border pt-2">
                      <span className="text-muted-foreground font-medium">Configuração IA</span>
                      {diagResult.agentWarning && (
                        <Alert className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            {diagResult.agentWarning}
                          </AlertDescription>
                        </Alert>
                      )}
                      {diagResult.agent ? (
                        <div className="mt-1 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground text-xs">Nome</span>
                            <span className="text-xs">{diagResult.agent.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground text-xs">Modelo</span>
                            <span className="text-xs">{diagResult.agent.model}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground text-xs">Provider</span>
                            <span className="text-xs">{diagResult.agent.provider}</span>
                          </div>
                          {diagResult.agent.promptPreview ? (
                            <div className="mt-1">
                              <span className="text-muted-foreground text-xs">Prompt: </span>
                              <span className="text-xs italic">"{diagResult.agent.promptPreview}..."</span>
                            </div>
                          ) : diagResult.instancePromptPreview ? (
                            <div className="mt-1">
                              <span className="text-muted-foreground text-xs">Prompt salvo na instância: </span>
                              <span className="text-xs italic">"{diagResult.instancePromptPreview}..."</span>
                            </div>
                          ) : (
                            <Alert variant="destructive" className="mt-2">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                ⚠️ Agente existe mas está SEM PROMPT! O bot não responderá. Clique em "Salvar Configurações" abaixo.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      ) : diagResult.instancePromptPreview ? (
                        <Alert className="mt-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <AlertDescription className="text-xs space-y-1">
                            <p>✅ Nenhum agente remoto configurado, mas as instruções já estão salvas na instância nativa da uazapi.</p>
                            <p className="italic">"{diagResult.instancePromptPreview}..."</p>
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="mt-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            ℹ️ Nenhum agente IA configurado na uazapi. O bot de palavras-chave via webhook continuará respondendo automaticamente.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {enabled && webhookStatus !== "active" && (!apiKey || !prompt) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {!apiKey && !prompt
              ? "O bot está ativado mas falta a API Key e o Prompt, e o webhook está inativo. Sem isso o bot não responderá."
              : !apiKey
              ? "O bot está ativado mas falta a API Key da OpenAI e o webhook está inativo. O bot não responderá nesse cenário."
              : "O bot está ativado mas falta o Prompt/Instruções e o webhook está inativo. O bot não responderá nesse cenário."}
          </AlertDescription>
        </Alert>
      )}

      {enabled && webhookStatus === "active" && (!apiKey || !prompt) && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Webhook ativo: API Key e Prompt são opcionais (só necessários para o modo IA nativo da uazapi).
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <Label>Chatbot Ativado</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="flex items-center justify-between">
        <Label>Ignorar Grupos</Label>
        <Switch checked={ignoreGroups} onCheckedChange={setIgnoreGroups} />
      </div>

      <div className="space-y-2">
        <Label>API Key OpenAI</Label>
        <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." type="password" />
      </div>

      {/* Prompt / Instruções do Bot */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Instruções do Bot (Prompt)</Label>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const maskKey = (key: string) => {
                  if (!key) return "(não configurada)";
                  if (key.length <= 8) return "****";
                  return key.slice(0, 3) + "..." + key.slice(-4);
                };
                const boolStr = (v: boolean) => v ? "Sim" : "Não";
                const lines = [
                  `=== Configuração Técnica do Bot WhatsApp ===`,
                  `Data: ${new Date().toISOString().slice(0, 10)}`,
                  ``,
                  `[Geral]`,
                  `Bot ativo: ${boolStr(enabled)}`,
                  `Ignorar grupos: ${boolStr(ignoreGroups)}`,
                  `Palavra de parada: ${stopWord || "(nenhuma)"}`,
                  `Pausa após parada: ${stopMinutes} min`,
                  `Pausa ao enviar msg manual: ${manualPauseMinutes} min`,
                  ``,
                  `[API]`,
                  `API Key OpenAI: ${maskKey(apiKey)}`,
                  ``,
                  `[Webhook]`,
                  `URL: ${webhookUrl || "(não configurado)"}`,
                  `Status: ${webhookStatus === "active" ? "Ativo" : webhookStatus === "inactive" ? "Inativo" : "Desconhecido"}`,
                  ``,
                ];
                if (diagResult?.agent) {
                  lines.push(`[Agente IA]`);
                  lines.push(`Nome: ${diagResult.agent.name}`);
                  lines.push(`Provider: ${diagResult.agent.provider}`);
                  lines.push(`Modelo: ${diagResult.agent.model}`);
                  if (diagResult.agent.maxTokens) lines.push(`Max Tokens: ${diagResult.agent.maxTokens}`);
                  lines.push(``);
                }
                lines.push(`[Prompt / Instruções]`);
                lines.push(prompt.trim() || "(vazio)");
                lines.push(``);
                
                // ── Tool Definitions (JSON técnico) ──
                lines.push(`${"=".repeat(50)}`);
                lines.push(`DEFINIÇÕES TÉCNICAS (Tools / JSON)`);
                lines.push(`${"=".repeat(50)}`);
                lines.push(``);

                lines.push(`[Tool: check_availability]`);
                lines.push(JSON.stringify({
                  type: "function",
                  function: {
                    name: "check_availability",
                    description: "Verifica se um horário está disponível e retorna o horário mais próximo se não estiver.",
                    parameters: {
                      type: "object",
                      properties: {
                        professional_name: { type: "string", description: "Nome do profissional escolhido" },
                        date: { type: "string", description: "Data no formato YYYY-MM-DD" },
                        time: { type: "string", description: "Horário no formato HH:MM" },
                      },
                      required: ["date", "time"],
                    },
                  },
                }, null, 2));
                lines.push(``);

                lines.push(`[Tool: create_appointment]`);
                lines.push(JSON.stringify({
                  type: "function",
                  function: {
                    name: "create_appointment",
                    description: "Cria um agendamento quando o cliente confirmou nome, profissional, serviço, data e horário.",
                    parameters: {
                      type: "object",
                      properties: {
                        customer_name: { type: "string", description: "Nome do cliente" },
                        customer_phone: { type: "string", description: "Telefone 5527999..." },
                        professional_name: { type: "string", description: "Nome exato do profissional" },
                        service_name: { type: "string", description: "Nome exato do serviço" },
                        date: { type: "string", description: "Data YYYY-MM-DD" },
                        time: { type: "string", description: "Horário HH:MM" },
                      },
                      required: ["customer_name", "professional_name", "service_name", "date", "time"],
                    },
                  },
                }, null, 2));
                lines.push(``);

                lines.push(`[Tool: send_professional_carousel]`);
                lines.push(JSON.stringify({
                  type: "function",
                  function: {
                    name: "send_professional_carousel",
                    description: "Envia carrossel interativo com fotos dos profissionais.",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                }, null, 2));
                lines.push(``);

                lines.push(`[Tool: register_customer]`);
                lines.push(JSON.stringify({
                  type: "function",
                  function: {
                    name: "register_customer",
                    description: "Cadastra novo cliente com nome e data de nascimento.",
                    parameters: {
                      type: "object",
                      properties: {
                        full_name: { type: "string", description: "Nome completo" },
                        birth_date: { type: "string", description: "Data nascimento YYYY-MM-DD" },
                      },
                      required: ["full_name"],
                    },
                  },
                }, null, 2));
                lines.push(``);

                lines.push(`[Tool: update_customer]`);
                lines.push(JSON.stringify({
                  type: "function",
                  function: {
                    name: "update_customer",
                    description: "Atualiza dados de cliente cadastrado.",
                    parameters: {
                      type: "object",
                      properties: {
                        new_name: { type: "string", description: "Novo nome completo" },
                        new_birth_date: { type: "string", description: "Nova data nascimento YYYY-MM-DD" },
                      },
                      required: [],
                    },
                  },
                }, null, 2));
                lines.push(``);

                lines.push(`[Tool: check_all_availability]`);
                lines.push(JSON.stringify({
                  type: "function",
                  function: {
                    name: "check_all_availability",
                    description: "Verifica quais profissionais têm horário disponível.",
                    parameters: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "Data YYYY-MM-DD (padrão: hoje)" },
                        time: { type: "string", description: "Horário HH:MM" },
                      },
                      required: ["time"],
                    },
                  },
                }, null, 2));
                lines.push(``);

                lines.push(`[Payload: Envio de Carrossel]`);
                lines.push(`Endpoint: POST {api_url}/send/carousel?token={token}`);
                lines.push(JSON.stringify({
                  number: "{telefone_cliente}",
                  text: "Escolha o profissional de sua preferência:",
                  carousel: [
                    {
                      text: "💈 *Nome do Profissional*",
                      image: "{url_foto_ou_fallback}",
                      buttons: [{ id: "PROF_{nome}", text: "Escolher {nome}", type: "REPLY" }],
                    },
                  ],
                  readchat: true,
                }, null, 2));
                lines.push(``);

                lines.push(`[Payload: Envio de Texto]`);
                lines.push(`Endpoint: POST {api_url}/send/text?token={token}`);
                lines.push(JSON.stringify({ number: "{telefone_cliente}", text: "{mensagem}" }, null, 2));
                
                const content = lines.join("\n");
                const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bot-config-tecnica-${new Date().toISOString().slice(0, 10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Configuração técnica completa baixada!");
              }}
              disabled={!prompt.trim()}
              className="gap-1"
            >
              <Download className="h-3 w-3" />
              Baixar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={generatePrompt}
              disabled={generating}
              className="gap-1"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              Gerar com meus dados
            </Button>
          </div>
        </div>
        <Textarea
          value={prompt}
          onChange={e => {
            setPrompt(e.target.value);
            setSavedToServer(false);
          }}
          placeholder="Descreva como o bot deve se comportar, quais serviços oferecer, como agendar..."
          rows={12}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Clique em "Gerar com meus dados" para criar um prompt automático com seus serviços, profissionais e link de agendamento.
        </p>
      </div>

      {/* Link de agendamento */}
      <div className="space-y-2">
        <Label>Link de Agendamento Online</Label>
        <div className="flex gap-2">
          <Input value={bookingUrl} readOnly className="text-xs" />
          <Button variant="outline" size="icon" onClick={copyBookingLink} title="Copiar link">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" asChild title="Abrir link">
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Palavra de parada</Label>
        <Input value={stopWord} onChange={e => setStopWord(e.target.value)} placeholder="parar" />
        <p className="text-xs text-muted-foreground">O cliente digita essa palavra para pausar o bot</p>
      </div>

      <div className="space-y-2">
        <Label>Pausa após palavra de parada (min)</Label>
        <Input type="number" value={stopMinutes} onChange={e => setStopMinutes(Number(e.target.value))} />
      </div>

      <div className="space-y-2">
        <Label>Pausa ao enviar msg manual (min)</Label>
        <Input type="number" value={manualPauseMinutes} onChange={e => setManualPauseMinutes(Number(e.target.value))} />
        <p className="text-xs text-muted-foreground">Tempo que o bot fica inativo quando você responde manualmente</p>
      </div>

      {/* Webhook Configuration */}
      {onSetWebhook && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            <Label className="font-semibold">Webhook (Tempo Real)</Label>
            {webhookStatus === "active" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {webhookStatus === "inactive" && <XCircle className="h-4 w-4 text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            Configure o webhook para receber mensagens em tempo real no sistema.
          </p>
          {webhookUrl && (
            <div className="space-y-1">
              <Label className="text-xs">URL atual</Label>
              <Input value={webhookUrl} readOnly className="text-xs font-mono" />
            </div>
          )}
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={settingWebhook || !webhookFunctionUrl}
            onClick={async () => {
              setSettingWebhook(true);
              try {
                await onSetWebhook(webhookFunctionUrl, true);
                setWebhookStatus("active");
                setWebhookUrl(webhookFunctionUrl);
                toast.success("Webhook configurado com sucesso!");
              } catch (e: any) {
                toast.error("Erro ao configurar webhook: " + (e.message || ""));
              }
              setSettingWebhook(false);
            }}
          >
            {settingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
            {webhookStatus === "active" ? "Atualizar Webhook" : "Ativar Webhook"}
          </Button>
          {webhookStatus === "active" && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={async () => {
                try {
                  await onSetWebhook("", false);
                  setWebhookStatus("inactive");
                  setWebhookUrl("");
                  toast.success("Webhook desativado");
                } catch {}
              }}
            >
              Desativar Webhook
            </Button>
          )}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Salvar Configurações
      </Button>
    </div>
  );
}
