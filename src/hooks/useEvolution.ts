import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface EvolutionConfig {
  api_url: string;
  instance_token: string;
}

interface EvolutionStatus {
  status: string;
  qrcode?: string;
  paircode?: string;
  profileName?: string;
  profilePicUrl?: string;
  chatbot_enabled?: boolean;
  chatbot_ignoreGroups?: boolean;
  chatbot_stopConversation?: string;
  chatbot_stopMinutes?: number;
  chatbot_stopWhenYouSendMsg?: number;
  chatbot_prompt?: string;
  openai_prompt?: string;
  openai_apikey?: string;
}

export interface EvolutionChat {
  wa_chatid: string;
  name: string;
  wa_contactName: string;
  wa_name: string;
  image: string;
  imagePreview: string;
  wa_lastMessageTextVote: string;
  wa_lastMsgTimestamp: number;
  wa_unreadCount: number;
  wa_isGroup: boolean;
  phone: string;
}

export interface EvolutionMessage {
  id: string;
  wa_chatid: string;
  wa_fromMe: boolean;
  wa_text: string;
  wa_type: string;
  wa_timestamp: number;
  wa_pushName?: string;
}

export function useEvolution() {
  const { user } = useAuth();

  const [config, setConfig] = useState<EvolutionConfig | null>(null);
  const [instanceStatus, setInstanceStatus] = useState<EvolutionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const configRef = useRef<EvolutionConfig | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);

  const loadConfig = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data: rows } = await supabase.from("whatsapp_config").select("api_url, instance_token").eq("user_id", user.id);
      const arr = (rows || []) as EvolutionConfig[];
      if (arr.length > 0) {
        setConfig(arr[0]);
      }
    } catch (e) {
      console.error("Failed to load whatsapp config", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const apiCall = useCallback(async (method: string, path: string, body?: any) => {
    const c = configRef.current;
    if (!c) throw new Error("WhatsApp não configurado");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "apikey": c.instance_token,
    };

    const directUrl = new URL(path.replace(/^\//, ""), c.api_url + "/");
    directUrl.searchParams.set("token", c.instance_token);

    const opts: RequestInit = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(directUrl.toString(), opts);
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = res.status === 401
        ? `Token rejeitado pelo servidor ${c.api_url}. Verifique o token e a URL configurada.`
        : (payload?.error || payload?.message || `API error ${res.status}`);
      throw new Error(message);
    }
    return payload;
  }, []);

  const saveConfig = useCallback(async (apiUrl: string, token: string, targetUserId?: string) => {
    if (!user) throw new Error("Usuário não autenticado");
    const uid = targetUserId || user.id;
    const normalizedUrl = apiUrl.trim().replace(/\/$/, "");
    const normalizedToken = token.trim();

    if (!normalizedUrl) throw new Error("Informe a URL do servidor");
    if (!normalizedToken) throw new Error("Informe o token da instância");

    const { data: existing } = await supabase.from("whatsapp_config").select("id").eq("user_id", uid).maybeSingle();
    if (existing) {
      await supabase.from("whatsapp_config").update({ api_url: normalizedUrl, instance_token: normalizedToken }).eq("user_id", uid);
    } else {
      await supabase.from("whatsapp_config").insert({ user_id: uid, api_url: normalizedUrl, instance_token: normalizedToken });
    }

    if (!targetUserId || targetUserId === user.id) {
      const newConfig = { api_url: normalizedUrl, instance_token: normalizedToken };
      setConfig(newConfig);
      configRef.current = newConfig;
      return newConfig;
    }
    return { api_url: normalizedUrl, instance_token: normalizedToken };
  }, [user]);

  const getStatus = useCallback(async (): Promise<EvolutionStatus> => {
    const data = await apiCall("GET", "/instance/status");

    const isConnected = !!(data?.instance?.state === "open" || data?.data?.LoggedIn);
    let qrcodeBase64 = undefined;
    let paircode = undefined;

    if (!isConnected) {
      try {
        const qrData = await apiCall("GET", "/instance/qr");
        qrcodeBase64 = qrData?.data?.Qrcode || qrData?.data?.Code || undefined;
        paircode = qrData?.data?.Paircode || undefined;
      } catch (e) {
        console.warn("Falha ao buscar QR code", e);
      }
    }

    const normalized: EvolutionStatus = {
      status: isConnected ? "connected" : "disconnected",
      qrcode: qrcodeBase64,
      paircode: paircode,
      profileName: data?.data?.Name || data?.instance?.profileName || undefined,
      profilePicUrl: data?.instance?.profilePicUrl || undefined,
      chatbot_enabled: data?.instance?.chatbot_enabled ?? data?.chatbot_enabled,
      chatbot_ignoreGroups: data?.instance?.chatbot_ignoreGroups ?? data?.chatbot_ignoreGroups,
      chatbot_stopConversation: data?.instance?.chatbot_stopConversation || data?.chatbot_stopConversation,
      chatbot_stopMinutes: data?.instance?.chatbot_stopMinutes ?? data?.chatbot_stopMinutes,
      chatbot_stopWhenYouSendMsg: data?.instance?.chatbot_stopWhenYouSendMsg ?? data?.chatbot_stopWhenYouSendMsg,
      chatbot_prompt: data?.instance?.chatbot_prompt || data?.chatbot_prompt,
      openai_prompt: data?.instance?.openai_prompt || data?.openai_prompt,
      openai_apikey: data?.instance?.openai_apikey || data?.openai_apikey,
    };
    setInstanceStatus(normalized);
    return normalized;
  }, [apiCall]);

  useEffect(() => {
    if (config && !instanceStatus) {
      getStatus().catch(() => {});
    }
  }, [config, getStatus]);

  const connect = useCallback(async (phone?: string) => {
    const body = phone ? { phone } : {};
    return apiCall("POST", "/instance/connect", body);
  }, [apiCall]);

  const disconnect = useCallback(async () => {
    return apiCall("POST", "/instance/disconnect");
  }, [apiCall]);

  const deleteInstance = useCallback(async () => {
    if (!user) throw new Error("Usuário não autenticado");

    const { data, error } = await supabase.functions.invoke("whatsapp-provision", {
      body: { action: "delete" },
    });
    if (error) throw new Error(error.message || "Falha ao deletar instância no provedor");
    if (data?.error) throw new Error(data.error);

    await supabase.from("whatsapp_config").delete().eq("user_id", user.id);
    setConfig(null);
    configRef.current = null;
    setInstanceStatus(null);
    return { providerDeleted: true };
  }, [user]);

  const getChats = useCallback(async (): Promise<EvolutionChat[]> => {
    if (!user) return [];
    const { data: msgs, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("wa_timestamp", { ascending: false });

    if (error) {
      console.error("Falha ao buscar chats da tabela whatsapp_messages", error);
      return [];
    }

    const chatsMap = new Map<string, EvolutionChat>();
    for (const m of msgs || []) {
      if (!m.wa_chatid) continue;
      if (!chatsMap.has(m.wa_chatid)) {
        const phone = m.wa_chatid.split("@")[0] || "";
        chatsMap.set(m.wa_chatid, {
          wa_chatid: m.wa_chatid,
          name: m.push_name || phone,
          wa_contactName: m.push_name || phone,
          wa_name: m.push_name || phone,
          image: "",
          imagePreview: "",
          wa_lastMessageTextVote: m.text || "",
          wa_lastMsgTimestamp: Number(m.wa_timestamp) || 0,
          wa_unreadCount: 0,
          wa_isGroup: m.wa_chatid.endsWith("@g.us"),
          phone: phone,
        });
      }
    }
    return Array.from(chatsMap.values());
  }, [user]);

  const getMessages = useCallback(async (chatid: string, limit = 50): Promise<EvolutionMessage[]> => {
    if (!user) return [];
    const { data: msgs, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("wa_chatid", chatid)
      .order("wa_timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Falha ao buscar mensagens da tabela whatsapp_messages", error);
      return [];
    }

    const normalized = (msgs || []).map((m: any) => ({
      id: m.id || m.wa_message_id || "",
      wa_chatid: m.wa_chatid,
      wa_fromMe: m.from_me ?? false,
      wa_text: m.text || "",
      wa_type: m.msg_type || "text",
      wa_timestamp: Number(m.wa_timestamp) || 0,
      wa_pushName: m.push_name || "",
    }));
    normalized.sort((a: any, b: any) => a.wa_timestamp - b.wa_timestamp);
    return normalized;
  }, [user]);

  const sendText = useCallback(async (number: string, text: string) => {
    return apiCall("POST", "/send/text", { number, text });
  }, [apiCall]);

  const updateChatbotSettings = useCallback(async (settings: Record<string, any>) => {
    return apiCall("POST", "/instance/updatechatbotsettings", settings);
  }, [apiCall]);

  const getAgents = useCallback(async () => {
    return apiCall("GET", "/agent/list");
  }, [apiCall]);

  const updateAgent = useCallback(async (agentData: Record<string, any>) => {
    return apiCall("POST", "/agent/edit", agentData);
  }, [apiCall]);

  const saveBotConfig = useCallback(async (settings: Record<string, any>, agentPrompt?: string) => {
    console.log("[saveBotConfig] Step 1: updating chatbot settings...", Object.keys(settings));
    const settingsResult = await updateChatbotSettings(settings);
    console.log("[saveBotConfig] Settings result:", settingsResult);

    let agentResult: any = null;
    let agentWarning: string | null = null;
    if (agentPrompt) {
      try {
        let existingAgent: any = null;
        try {
          const agentsData = await getAgents();
          const agents = Array.isArray(agentsData) ? agentsData : (agentsData?.agents || []);
          existingAgent = agents[0];
        } catch (e: any) {
          if (e?.message?.includes("ADMIN_TOKEN_MISSING")) {
            agentWarning = "Configuração do agente IA ignorada: admin token não disponível. O chatbot funcionará usando o prompt enviado via configurações da instância.";
            console.info("[saveBotConfig]", agentWarning);
          } else {
            console.warn("[saveBotConfig] Could not fetch agents:", e);
          }
        }

        if (!agentWarning) {
          const payload = {
            id: existingAgent?.id || "",
            delete: false,
            name: existingAgent?.name || "Atendimento AI",
            provider: "openai",
            model: "gpt-4o-mini",
            systemPrompt: agentPrompt,
            temperature: 70,
            maxTokens: 800,
          };
          agentResult = await updateAgent(payload);
          console.log("[saveBotConfig] Agent saved:", agentResult);
        }
      } catch (agentErr: any) {
        if (agentErr?.message?.includes("ADMIN_TOKEN_MISSING")) {
          agentWarning = "Configuração do agente IA ignorada: admin token não disponível. O chatbot funcionará usando o prompt enviado via configurações da instância.";
          console.info("[saveBotConfig]", agentWarning);
        } else {
          console.warn("[saveBotConfig] Agent config failed (non-critical):", agentErr);
          agentWarning = "Não foi possível configurar o agente remoto, mas o chatbot funcionará normalmente com o prompt salvo nas configurações.";
        }
      }
    }
    return { settingsResult, agentResult, agentWarning };
  }, [updateChatbotSettings, getAgents, updateAgent]);

  const getWebhook = useCallback(async () => {
    return apiCall("GET", "/webhook");
  }, [apiCall]);

  const provisionInstance = useCallback(async (reset = false) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-provision", {
      body: { action: reset ? "reset" : "provision" },
    });
    if (error) throw new Error(error.message || "Falha ao provisionar instância");
    if (data?.needs_admin_token) {
      return data as {
        needs_admin_token: true;
        error: string;
        hint?: string;
        status?: number;
      };
    }
    if (data?.error) throw new Error(data.hint || data.error);
    if (data?.api_url && data?.instance_token) {
      const newConfig = { api_url: data.api_url, instance_token: data.instance_token };
      setConfig(newConfig);
      configRef.current = newConfig;
    }
    return data as {
      needs_admin_token?: false;
      api_url: string;
      instance_token: string;
      connected: boolean;
      qrcode: string | null;
      paircode: string | null;
      status: string;
    };
  }, []);

  const setWebhook = useCallback(async (url: string, enabled = true) => {
    return apiCall("POST", "/instance/connect", {
      webhookUrl: url,
      immediate: true,
      subscribe: ["MESSAGE", "CONNECTION"],
    });
  }, [apiCall]);

  return {
    config,
    instanceStatus,
    loading,
    saveConfig,
    getStatus,
    connect,
    disconnect,
    deleteInstance,
    getChats,
    getMessages,
    sendText,
    updateChatbotSettings,
    saveBotConfig,
    getAgents,
    updateAgent,
    getWebhook,
    setWebhook,
    loadConfig,
    apiCall,
    provisionInstance,
  };
}
