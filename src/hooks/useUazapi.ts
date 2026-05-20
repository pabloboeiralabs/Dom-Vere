import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";


interface UazapiConfig {
  api_url: string;
  instance_token: string;
}

interface UazapiStatus {
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

export interface UazapiChat {
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

export interface UazapiMessage {
  id: string;
  wa_chatid: string;
  wa_fromMe: boolean;
  wa_text: string;
  wa_type: string;
  wa_timestamp: number;
  wa_pushName?: string;
}

function normalizeUazapiUrl(url: string): string {
  return url.trim().replace(/\/$/, "").replace("free.uazapi.com", "ipazua.uazapi.com").replace("free.uazapi.dev", "ipazua.uazapi.com");
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function useUazapi() {
  const { user } = useAuth();
  
  const [config, setConfig] = useState<UazapiConfig | null>(null);
  const [instanceStatus, setInstanceStatus] = useState<UazapiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const configRef = useRef<UazapiConfig | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);

  const loadConfig = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data: rows } = await supabase.from("whatsapp_config").select("api_url, instance_token").eq("user_id", user.id);
      const arr = (rows || []) as UazapiConfig[];
      if (arr.length > 0) {
        const normalized = { ...arr[0], api_url: normalizeUazapiUrl(arr[0].api_url) };
        setConfig(normalized);
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

    const apiUrl = normalizeUazapiUrl(c.api_url);
    const isDev = import.meta.env.DEV;

    let url: string;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      token: c.instance_token,
      "Authorization": `Bearer ${c.instance_token}`,
    };

    if (isDev) {
      const proxyUrl = new URL(`/api/uazapi${path}`, window.location.origin);
      proxyUrl.searchParams.set("token", c.instance_token);
      headers["X-Target-Api-Url"] = apiUrl;
      url = proxyUrl.toString();
    } else {
      const directUrl = new URL(path, apiUrl + "/");
      directUrl.searchParams.set("token", c.instance_token);
      url = directUrl.toString();
    }

    const opts: RequestInit = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = res.status === 401
        ? `Token rejeitado pelo servidor ${apiUrl}. Verifique o token e a URL configurada.`
        : (payload?.error || payload?.message || `API error ${res.status}`);
      throw new Error(message);
    }
    return payload;
  }, []);

  const saveConfig = useCallback(async (apiUrl: string, token: string, targetUserId?: string) => {
    if (!user) throw new Error("Usuário não autenticado");
    const uid = targetUserId || user.id;
    const normalizedUrl = apiUrl
      .trim()
      .replace(/\/$/, "")
      .replace("free.uazapi.com", "ipazua.uazapi.com").replace("free.uazapi.dev", "ipazua.uazapi.com");
    const normalizedToken = token.trim();

    if (!normalizedUrl) throw new Error("Informe a URL do servidor");
    if (!normalizedToken) throw new Error("Informe o token da instância");

    // Upsert: try update first, then insert
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

  const getStatus = useCallback(async (): Promise<UazapiStatus> => {
    const data = await apiCall("GET", "/instance/status");
    const normalized: UazapiStatus = {
      status: data?.instance?.status || (data?.status?.connected ? "connected" : "disconnected"),
      qrcode: pickFirstString(data?.instance?.qrcode, data?.instance?.qrCode, data?.instance?.qr, data?.instance?.code, data?.qrcode, data?.qrCode, data?.qr, data?.code),
      paircode: pickFirstString(data?.instance?.paircode, data?.instance?.pairCode, data?.paircode, data?.pairCode),
      profileName: data?.instance?.profileName || data?.profileName,
      profilePicUrl: data?.instance?.profilePicUrl || data?.profilePicUrl,
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
    // Best-effort: desconecta e deleta a instância no provedor para parar de cobrar
    try { await apiCall("POST", "/instance/disconnect"); } catch (e) { console.warn("[deleteInstance] disconnect falhou", e); }
    const endpoints: Array<{ method: string; path: string }> = [
      { method: "DELETE", path: "/instance" },
      { method: "POST", path: "/instance/delete" },
      { method: "DELETE", path: "/instance/delete" },
];
    let providerDeleted = false;
    for (const ep of endpoints) {
      try {
        await apiCall(ep.method, ep.path);
        providerDeleted = true;
        break;
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (!/404|not.?found/i.test(msg)) {
          console.warn("[deleteInstance] endpoint falhou", ep, e);
        }
      }
    }
    await supabase.from("whatsapp_config").delete().eq("user_id", user.id);
    setConfig(null);
    configRef.current = null;
    setInstanceStatus(null);
    return { providerDeleted };
  }, [apiCall, user]);

  const getChats = useCallback(async (): Promise<UazapiChat[]> => {
    const data = await apiCall("POST", "/chat/find", {});
    const arr = Array.isArray(data) ? data : (data?.chats || []);
    return arr.filter((c: any) => {
      const chatId = c.wa_chatid;
      if (!chatId) return false;
      const isValidType = chatId.endsWith("@s.whatsapp.net") || chatId.endsWith("@g.us");
      const baseId = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "").trim();
      return isValidType && !!baseId && baseId !== "0";
    });
  }, [apiCall]);

  const getMessages = useCallback(async (chatid: string, limit = 50): Promise<UazapiMessage[]> => {
    const data = await apiCall("POST", "/message/find", { chatid, limit });
    const arr = Array.isArray(data) ? data : (data?.messages || []);
    const normalized = arr.map((m: any) => ({
      id: m.id || m.messageid || "",
      wa_chatid: m.wa_chatid || m.chatid || "",
      wa_fromMe: m.wa_fromMe ?? m.fromMe ?? false,
      wa_text: m.wa_text || m.text || m.content?.text || "",
      wa_type: m.wa_type || m.messageType || "",
      wa_timestamp: m.wa_timestamp || m.messageTimestamp || 0,
      wa_pushName: m.wa_pushName || m.senderName || "",
    }));
    normalized.sort((a: any, b: any) => a.wa_timestamp - b.wa_timestamp);
    return normalized;
  }, [apiCall]);

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
          if (e?.message?.includes("ADMIN_TOKEN_MISSING") || e?.message?.includes("UAZAPI_ADMIN_TOKEN")) {
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
        if (agentErr?.message?.includes("ADMIN_TOKEN_MISSING") || agentErr?.message?.includes("UAZAPI_ADMIN_TOKEN")) {
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
    // Send both field formats for uazapi compatibility
    return apiCall("POST", "/webhook", {
      url,
      webhook_url: url,
      enabled,
      webhook_enabled: enabled,
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
