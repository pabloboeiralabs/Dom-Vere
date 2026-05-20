import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Wifi, WifiOff, Wand2, Save, TestTube2, Download, Trash2, CheckCircle2, XCircle, AlertTriangle, QrCode, Sparkles, MessageSquare, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUazapi } from "@/hooks/useUazapi";
import { WhatsAppQrCode } from "./WhatsAppQrCode";

type ConnState = "disconnected" | "connecting" | "connected";

interface DiagResult {
  conn?: ConnState;
  apiKeyOk?: boolean;
  agent?: { name: string; model: string; provider: string; maxTokens?: number; promptPreview: string } | null;
  webhookOk?: boolean;
  webhookUrl?: string;
  promptOk?: boolean;
  error?: string;
}

function StepHeader({ n, title, status, children }: { n: number; title: string; status?: "ok" | "warn" | "err" | "idle"; children?: React.ReactNode }) {
  const color = status === "ok" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
    : status === "warn" ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
    : status === "err" ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-muted text-muted-foreground border-border";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`h-7 w-7 rounded-full border flex items-center justify-center text-xs font-semibold ${color}`}>{n}</div>
        <h3 className="font-semibold text-sm sm:text-base text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function WhatsAppBotWizard() {
  const { user } = useAuth();
  const {
    config, instanceStatus, getStatus, disconnect, deleteInstance, provisionInstance,
    saveBotConfig, getAgents, getWebhook, setWebhook,
  } = useUazapi();

  const conn: ConnState = instanceStatus?.status === "connected"
    ? "connected"
    : (instanceStatus?.qrcode || instanceStatus?.status === "connecting")
      ? "connecting"
      : "disconnected";

  // ─── Step 1: Connection ───
  const [provisioning, setProvisioning] = useState(false);
  const [provisionQr, setProvisionQr] = useState<string | null>(null);
  const [provisionIssue, setProvisionIssue] = useState<string | null>(null);
  const [connectRequested, setConnectRequested] = useState(false);

  const handleProvision = useCallback(async (reset = false) => {
    setProvisioning(true);
    setProvisionIssue(null);
    setProvisionQr(null);
    setConnectRequested(true);
    try {
      const result = await provisionInstance(reset);
      if ((result as any).needs_admin_token) {
        const message = (result as any).hint || (result as any).error || "Token admin inválido.";
        setProvisionIssue(message);
        toast.error(message, { duration: 8000 });
        return;
      }
      if ("qrcode" in result && result.qrcode) setProvisionQr(result.qrcode);
      toast.success("Instância criada! Escaneie o QR Code.");
    } catch (e: any) {
      const msg = e?.message || "Erro ao criar instância";
      setProvisionIssue(msg);
      toast.error(msg);
    } finally {
      setProvisioning(false);
    }
  }, [provisionInstance]);

  // QR polling while connecting (only after user pressed Conectar)
  useEffect(() => {
    if (!config || conn === "connected" || !connectRequested) return;
    const id = setInterval(() => { getStatus().catch(() => {}); }, 4000);
    return () => clearInterval(id);
  }, [config, conn, getStatus, connectRequested]);

  // Update displayed QR from instanceStatus
  useEffect(() => {
    if (instanceStatus?.qrcode && conn !== "connected" && connectRequested) {
      setProvisionQr(instanceStatus.qrcode);
    }
    if (conn === "connected") {
      setProvisionQr(null);
      setConnectRequested(false);
    }
  }, [instanceStatus, conn, connectRequested]);

  const handleDisconnect = useCallback(async () => {
    try {
      await deleteInstance();
      toast.success("Instância desconectada e excluída");
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao desconectar");
    }
  }, [deleteInstance]);

  const handleDeleteInstance = useCallback(async () => {
    if (!user) return;
    try {
      try { await disconnect(); } catch {}
      await supabase.from("whatsapp_config").delete().eq("user_id", user.id);
      toast.success("Instância deletada. Crie uma nova quando quiser.");
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao deletar instância");
    }
  }, [user, disconnect]);

  // ─── Step 2/3: Prompt ───
  const [prompt, setPrompt] = useState("");
  const [shopName, setShopName] = useState("Barbearia");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToServer, setSavedToServer] = useState(true);
  const hasAutoGen = useRef(false);
  const lastServerPromptRef = useRef("");
  const bookingUrl = user ? `${window.location.origin}/booking/${user.id}` : "";

  // Sync prompt from server
  useEffect(() => {
    if (!instanceStatus) return;
    const serverPrompt = (instanceStatus.chatbot_prompt || instanceStatus.openai_prompt || "").trim();
    if (serverPrompt && (!prompt.trim() || prompt.trim() === lastServerPromptRef.current.trim())) {
      lastServerPromptRef.current = serverPrompt;
      setPrompt(serverPrompt);
      setSavedToServer(true);
    }
  }, [instanceStatus, prompt]);

  useEffect(() => {
    if (!user) return;
    supabase.from("settings").select("shop_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.shop_name) setShopName(data.shop_name); });
  }, [user]);

  const generatePrompt = useCallback(async () => {
    if (!user) return "";
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
      const settings: any = settingsRes.data || {};
      const currentShopName = settings?.shop_name || shopName;
      const profMap: Record<string, string> = {};
      for (const p of professionals) profMap[p.id] = p.name;
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const servicesText = services.length
        ? services.map((s: any) => `• ${s.name} — R$ ${Number(s.price).toFixed(2)}`).join("\n")
        : "Nenhum serviço cadastrado ainda.";
      let profsText = "Nenhum profissional cadastrado ainda.";
      if (professionals.length) {
        const schedByProf: Record<string, string[]> = {};
        for (const s of allSchedules as any[]) {
          const profName = profMap[s.professional_id];
          if (!profName) continue;
          (schedByProf[profName] ||= []).push(`${dayNames[s.day_of_week]} ${String(s.start_time).slice(0,5)}-${String(s.end_time).slice(0,5)}`);
        }
        profsText = professionals.map((p: any) => {
          const h = schedByProf[p.name];
          return `• ${p.name}${h ? `\n  Horários: ${h.join(", ")}` : " (sem horários definidos)"}`;
        }).join("\n");
      }
      const generated = `Você é o assistente virtual da *${currentShopName}*. Seja simpático, profissional e objetivo. Use emojis com moderação 😊

📋 *NOSSOS SERVIÇOS:*
${servicesText}

💈 *PROFISSIONAIS E HORÁRIOS:*
${profsText}

💳 *CRÉDITOS:*
${settings?.credit_price ? `• Valor: R$ ${Number(settings.credit_price).toFixed(2)}\n• Mínimo: ${settings.min_purchase || 5} créditos\n• Validade: ${settings.validity_days || 90} dias` : "Consulte nossos pacotes!"}

📅 *AGENDAMENTO:*
Direcione sempre para o link: ${bookingUrl}

⚠️ Regras:
1. Não invente informações fora deste prompt
2. Responda apenas sobre a ${currentShopName}
3. Sempre direcione agendamentos para o link acima
4. Se não souber, diga que vai transferir para um atendente humano
5. Respostas curtas (3-4 linhas)`;
      setPrompt(generated);
      setSavedToServer(false);
      toast.success("Prompt gerado a partir dos seus dados!");
      return generated;
    } catch (e: any) {
      toast.error("Erro ao gerar prompt: " + e.message);
      return "";
    } finally {
      setGenerating(false);
    }
  }, [user, shopName, bookingUrl]);

  // Auto-generate on first connection
  useEffect(() => {
    if (conn === "connected" && instanceStatus && !hasAutoGen.current && user) {
      const serverPrompt = (instanceStatus.chatbot_prompt || instanceStatus.openai_prompt || "").trim();
      if (!serverPrompt) {
        hasAutoGen.current = true;
        generatePrompt().then(async (generated) => {
          if (generated) {
            try {
              await saveBotConfig({
                chatbot_enabled: true,
                chatbot_ignoreGroups: true,
                chatbot_prompt: generated,
                openai_prompt: generated,
              }, generated);
              setSavedToServer(true);
              lastServerPromptRef.current = generated;
            } catch {}
          }
        });
      } else {
        hasAutoGen.current = true;
      }
    }
  }, [conn, instanceStatus, user, generatePrompt, saveBotConfig]);

  const handleSavePrompt = async () => {
    setSaving(true);
    try {
      const trimmed = prompt.trim();
      await saveBotConfig({
        chatbot_enabled: true,
        chatbot_ignoreGroups: instanceStatus?.chatbot_ignoreGroups ?? true,
        chatbot_prompt: trimmed,
        openai_prompt: trimmed,
      }, trimmed || undefined);
      lastServerPromptRef.current = trimmed;
      setSavedToServer(true);
      await getStatus();
      toast.success("Prompt salvo!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 4: Diagnostics ───
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const webhookFnUrl = `https://cjkzhxlmtwzbscqiiqin.supabase.co/functions/v1/whatsapp-webhook`;

  const handleTest = async () => {
    setDiagnosing(true);
    try {
      const [statusRes, agentsRes, webhookRes] = await Promise.allSettled([
        getStatus(), getAgents(), getWebhook(),
      ]);
      const statusData = statusRes.status === "fulfilled" ? statusRes.value : null;
      const agentsData = agentsRes.status === "fulfilled" ? agentsRes.value : null;
      const webhookData: any = webhookRes.status === "fulfilled" ? webhookRes.value : null;
      const agents = Array.isArray(agentsData) ? agentsData : ((agentsData as any)?.agents || []);
      const firstAgent = agents[0] || null;
      const agentPrompt = (firstAgent?.systemPrompt || firstAgent?.agent?.systemPrompt || "").trim();
      const whUrl = webhookData?.webhook_url || webhookData?.url || "";
      const whEnabled = !!(webhookData?.webhook_enabled || webhookData?.enabled);
      const cs: ConnState = statusData?.status === "connected" ? "connected" : "disconnected";

      setDiagResult({
        conn: cs,
        apiKeyOk: !!instanceStatus?.openai_apikey || true,
        agent: firstAgent ? {
          name: firstAgent.name || "—",
          model: firstAgent.model || firstAgent.agent?.model || "—",
          provider: firstAgent.provider || firstAgent.agent?.provider || "—",
          maxTokens: firstAgent.maxTokens || firstAgent.agent?.maxTokens,
          promptPreview: agentPrompt.slice(0, 120),
        } : null,
        webhookOk: whEnabled && whUrl.includes("whatsapp-webhook"),
        webhookUrl: whUrl,
        promptOk: !!(prompt.trim() || agentPrompt),
      });
    } catch (e: any) {
      setDiagResult({ error: e?.message || "Erro no diagnóstico" });
    } finally {
      setDiagnosing(false);
    }
  };

  const handleFixWebhook = async () => {
    try {
      await setWebhook(`${webhookFnUrl}?user_id=${user?.id}`, true);
      toast.success("Webhook reconfigurado");
      await handleTest();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao configurar webhook");
    }
  };

  // ─── Step 5: Export ───
  const handleDownload = () => {
    const mask = (k?: string) => !k ? "(não configurada)" : k.length <= 8 ? "****" : k.slice(0, 3) + "..." + k.slice(-4);
    const lines = [
      "=== Configuração Técnica do Bot WhatsApp ===",
      `Data: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
      "",
      "[Instância]",
      `API URL: ${config?.api_url || "—"}`,
      `Token: ${mask(config?.instance_token)}`,
      `Status: ${conn}`,
      `Perfil: ${instanceStatus?.profileName || "—"}`,
      "",
      "[Webhook]",
      `URL: ${diagResult?.webhookUrl || webhookFnUrl}`,
      `Ativo: ${diagResult?.webhookOk ? "Sim" : "Não/Desconhecido"}`,
      "",
      "[Agente IA]",
      diagResult?.agent
        ? `Nome: ${diagResult.agent.name}\nProvider: ${diagResult.agent.provider}\nModelo: ${diagResult.agent.model}\nMax Tokens: ${diagResult.agent.maxTokens || "—"}`
        : "(sem agente remoto — usando prompt nativo da instância)",
      "",
      "[Prompt]",
      prompt.trim() || "(vazio)",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bot-whatsapp-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Configuração baixada!");
  };

  // ─── Render ───
  const step1Status: "ok" | "warn" | "err" | "idle" = conn === "connected" ? "ok" : conn === "connecting" ? "warn" : "idle";
  const step2Status: "ok" | "warn" | "err" | "idle" = !prompt.trim() ? "idle" : !savedToServer ? "warn" : "ok";

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="text-center space-y-1 mb-2">
        <div className="h-12 w-12 rounded-full mx-auto flex items-center justify-center bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Conectar WhatsApp</h2>
        <p className="text-xs text-muted-foreground">Após conectar, ajuste tudo nas configurações do bot.</p>
      </div>

      {/* Step 1 — Conectar instância */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <StepHeader n={1} title="Conectar instância" status={step1Status}>
          <Badge variant={conn === "connected" ? "default" : conn === "connecting" ? "secondary" : "outline"} className="gap-1">
            {conn === "connected" && <Wifi className="h-3 w-3" />}
            {conn === "connecting" && <Loader2 className="h-3 w-3 animate-spin" />}
            {conn === "disconnected" && <WifiOff className="h-3 w-3" />}
            {conn === "connected" ? "Conectado" : conn === "connecting" ? "Conectando" : "Desconectado"}
          </Badge>
        </StepHeader>

        {!config && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">Vamos provisionar uma instância exclusiva para você.</p>
            <Button onClick={() => handleProvision(false)} disabled={provisioning} className="w-full" size="lg">
              {provisioning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <QrCode className="h-4 w-4 mr-2" /> Criar acesso
            </Button>
            {provisionIssue && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{provisionIssue}</p>
            )}
          </div>
        )}

        {config && conn !== "connected" && (
          <div className="space-y-3 text-center">
            {!connectRequested ? (
              <>
                <p className="text-sm text-muted-foreground">Sua instância está pronta. Clique em conectar para gerar o QR Code.</p>
                <Button onClick={() => handleProvision(false)} disabled={provisioning} className="w-full" size="lg">
                  {provisioning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <QrCode className="h-4 w-4 mr-2" /> Conectar
                </Button>
              </>
            ) : provisionQr ? (
              <div className="flex flex-col items-center gap-2 p-3 bg-background rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">Escaneie com seu WhatsApp (Configurações → Aparelhos conectados)</p>
                <WhatsAppQrCode value={provisionQr} />
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Aguardando QR Code…</span>
              </div>
            )}
            {connectRequested && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => handleProvision(true)} disabled={provisioning}>
                {provisioning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Recriar instância
              </Button>
            )}
          </div>
        )}

        {conn === "connected" && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              {instanceStatus?.profilePicUrl && <img src={instanceStatus.profilePicUrl} alt="" className="h-8 w-8 rounded-full" />}
              <span className="text-muted-foreground">{instanceStatus?.profileName || "WhatsApp"}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>Desconectar</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Deletar instância">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deletar instância?</AlertDialogTitle>
                    <AlertDialogDescription>Sua instância será removida e você precisará criar uma nova para reconectar.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteInstance}>Deletar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
