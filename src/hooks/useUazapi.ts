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
  profilePicUrl?: string;
  customerName?: string;
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
  msg_type?: string;
  media_url?: string;
  media_type?: string;
  media_mimetype?: string;
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
    const isEvolution = apiUrl.includes("evolution");

    let url: string;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    let instanceName = c.instance_token;
    let apikey = c.instance_token;
    if (c.instance_token.includes(":")) {
      const parts = c.instance_token.split(":");
      instanceName = parts[0];
      apikey = parts[1];
    }

    if (isEvolution) {
      headers["apikey"] = apikey;
    } else {
      headers["token"] = c.instance_token;
      headers["Authorization"] = `Bearer ${c.instance_token}`;
    }

    if (isDev) {
      const proxyUrl = new URL(`/api/uazapi${path}`, window.location.origin);
      proxyUrl.searchParams.set("token", c.instance_token);
      headers["X-Target-Api-Url"] = apiUrl;
      url = proxyUrl.toString();
    } else {
      const directUrl = new URL(path.replace(/^\//, ""), apiUrl + "/");
      directUrl.searchParams.set("token", c.instance_token);
      url = directUrl.toString();
    }

    const opts: RequestInit = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
    }

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
    const isEvolution = configRef.current?.api_url.includes("evolution");
    const data = await apiCall("GET", "/instance/status");

    if (isEvolution) {
      const isConnected = data?.data?.LoggedIn === true;
      let qrcodeBase64 = undefined;
      let paircode = undefined;

      if (!isConnected) {
        try {
          const qrData = await apiCall("GET", "/instance/qr");
          qrcodeBase64 = qrData?.data?.Qrcode || qrData?.data?.Code || undefined;
          paircode = qrData?.data?.Paircode || undefined;
        } catch (e) {
          console.warn("Falha ao buscar QR code secundário da Evolution", e);
        }
      }

      const normalized: UazapiStatus = {
        status: isConnected ? "connected" : "disconnected",
        qrcode: qrcodeBase64,
        paircode: paircode,
        profileName: data?.data?.Name || undefined,
        profilePicUrl: data?.data?.profilePicUrl || data?.data?.profilePictureUrl || undefined,
      };
      setInstanceStatus(normalized);
      return normalized;
    }

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
    const isEvolution = configRef.current?.api_url.includes("evolution");

    if (isEvolution) {
      const { data, error } = await supabase.functions.invoke("whatsapp-provision", {
        body: { action: "delete" },
      });
      if (error) throw new Error(error.message || "Falha ao deletar instância no provedor");
      if (data?.error) throw new Error(data.error);
    } else {
      // Best-effort: desconecta e deleta a instância no provedor para parar de cobrar
      try { await apiCall("POST", "/instance/disconnect"); } catch (e) { console.warn("[deleteInstance] disconnect falhou", e); }
      const endpoints: Array<{ method: string; path: string }> = [
        { method: "DELETE", path: "/instance" },
        { method: "POST", path: "/instance/delete" },
        { method: "DELETE", path: "/instance/delete" },
      ];
      for (const ep of endpoints) {
        try {
          await apiCall(ep.method, ep.path);
          break;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (!/404|not.?found/i.test(msg)) {
            console.warn("[deleteInstance] endpoint falhou", ep, e);
          }
        }
      }
    }

    await supabase.from("whatsapp_config").delete().eq("user_id", user.id);
    setConfig(null);
    configRef.current = null;
    setInstanceStatus(null);
    return { providerDeleted: isEvolution };
  }, [apiCall, user]);

  // Enrich chats with customer names and profile photos
  const enrichChatsWithCustomerData = useCallback(async (chats: UazapiChat[]): Promise<UazapiChat[]> => {
    if (!user || chats.length === 0) return chats;
    try {
      // Build a map of phone -> customer data
      const phones = chats.map(c => c.phone).filter(Boolean);
      if (phones.length === 0) return chats;

      // Query customers matching any of the phone numbers
      const { data: customers } = await supabase
        .from("customers")
        .select("name, phone, photo_url")
        .eq("user_id", user.id);

      const customerMap = new Map<string, { name: string; photo_url?: string }>();
      for (const cust of (customers || [])) {
        if (!cust.phone) continue;
        const normalizedPhone = cust.phone.replace(/\D/g, "");
        // Store by raw digits for matching
        customerMap.set(normalizedPhone, { name: cust.name, photo_url: cust.photo_url });
        // Also store with 55 prefix
        customerMap.set("55" + normalizedPhone, { name: cust.name, photo_url: cust.photo_url });
        // Also store without 55 prefix
        if (normalizedPhone.startsWith("55") && normalizedPhone.length > 11) {
          customerMap.set(normalizedPhone.slice(2), { name: cust.name, photo_url: cust.photo_url });
        }
      }

      // Try to fetch profile pictures from Evolution API (bulk)
      const isEvolution = configRef.current?.api_url.includes("evolution");

      return chats.map(chat => {
        const cleanPhone = chat.phone.replace(/\D/g, "");
        const customer = customerMap.get(cleanPhone);
        // Update with customer data if available
        if (customer) {
          chat.customerName = customer.name;
          // Use customer's photo_url if available and chat has no image
          if (!chat.profilePicUrl && customer.photo_url) {
            chat.profilePicUrl = customer.photo_url;
          }
        }
        return chat;
      });
    } catch (e) {
      console.error("Erro ao enriquecer chats com dados de clientes:", e);
      return chats;
    }
  }, [user]);

  const getChats = useCallback(async (): Promise<UazapiChat[]> => {
    const isEvolution = configRef.current?.api_url.includes("evolution");
    if (isEvolution) {
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

      const chatsMap = new Map<string, UazapiChat>();
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
            profilePicUrl: undefined,
            customerName: undefined,
            wa_lastMessageTextVote: m.text || "",
            wa_lastMsgTimestamp: Number(m.wa_timestamp) || 0,
            wa_unreadCount: 0,
            wa_isGroup: m.wa_chatid.endsWith("@g.us"),
            phone: phone,
          });
        }
      }
      const chats = Array.from(chatsMap.values());
      return await enrichChatsWithCustomerData(chats);
    }

    const data = await apiCall("POST", "/chat/find", {});
    const arr = Array.isArray(data) ? data : (data?.chats || []);

    const chats = arr.map((c: any) => {
      const phone = (c.wa_chatid || c.chatId || "").replace("@s.whatsapp.net", "").replace("@g.us", "");
      return {
        wa_chatid: c.wa_chatid || c.chatId || "",
        name: c.pushName || c.name || c.wa_name || phone,
        wa_contactName: c.pushName || c.name || c.wa_name || phone,
        wa_name: c.pushName || c.name || c.wa_name || phone,
        image: c.profilePicUrl || c.image || "",
        imagePreview: c.profilePicUrl || c.imagePreview || c.image || "",
        profilePicUrl: c.profilePicUrl || c.image || "",
        customerName: undefined,
        wa_lastMessageTextVote: c.wa_lastMessageTextVote || c.lastMessage || "",
        wa_lastMsgTimestamp: Number(c.wa_lastMsgTimestamp || c.lastMsgTimestamp || 0),
        wa_unreadCount: c.wa_unreadCount || c.unreadCount || 0,
        wa_isGroup: (c.wa_chatid || c.chatId || "").endsWith("@g.us"),
        phone: phone,
      } as UazapiChat;
    }).filter((c: UazapiChat) => {
      if (!c.wa_chatid) return false;
      const isValidType = c.wa_chatid.endsWith("@s.whatsapp.net") || c.wa_chatid.endsWith("@g.us");
      const baseId = c.wa_chatid.replace("@s.whatsapp.net", "").replace("@g.us", "").trim();
      return isValidType && !!baseId && baseId !== "0";
    });

    return await enrichChatsWithCustomerData(chats);
  }, [apiCall, user, enrichChatsWithCustomerData]);

  const getMessages = useCallback(async (chatid: string, limit = 50): Promise<UazapiMessage[]> => {
    const isEvolution = configRef.current?.api_url.includes("evolution");
    if (isEvolution) {
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
        wa_type: m.msg_type || m.media_type || "text",
        msg_type: m.msg_type || undefined,
        wa_timestamp: Number(m.wa_timestamp) || 0,
        wa_pushName: m.push_name || "",
        media_url: m.media_url || null,
        media_type: m.media_type || null,
        media_mimetype: m.media_mimetype || null,
      }));
      normalized.sort((a: any, b: any) => a.wa_timestamp - b.wa_timestamp);
      return normalized;
    }

    const data = await apiCall("POST", "/message/find", { chatid, limit });
    const arr = Array.isArray(data) ? data : (data?.messages || []);

    const normalized = arr.map((m: any) => {
      return {
        id: m.id || m.messageid || "",
        wa_chatid: m.wa_chatid || m.chatid || "",
        wa_fromMe: m.wa_fromMe ?? m.fromMe ?? false,
        wa_text: m.wa_text || m.text || m.content?.text || (m.type === "carousel" ? m.carousel : ""),
        wa_type: m.wa_type || m.messageType || m.type || "",
        wa_timestamp: m.wa_timestamp || m.messageTimestamp || 0,
        wa_pushName: m.wa_pushName || m.senderName || "",
      };
    });
    normalized.sort((a: any, b: any) => a.wa_timestamp - b.wa_timestamp);
    return normalized;
  }, [apiCall, user]);

  const sendText = useCallback(async (number: string, text: string) => {
    return apiCall("POST", "/send/text", { number, text });
  }, [apiCall]);

  const sendMedia = useCallback(async (number: string, mediaUrl: string, mediaType: string, caption?: string, mimetype?: string) => {
    const isEvolution = configRef.current?.api_url.includes("evolution");
    if (isEvolution) {
      // Evolution API: POST /message/sendMedia
      return apiCall("POST", "/message/sendMedia", {
        number,
        mediatype: mediaType,
        media: mediaUrl,
        caption: caption || undefined,
        mimetype: mimetype || undefined,
      });
    }
    // Standard Uazapi
    return apiCall("POST", "/message/sendMedia", {
      number,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption || undefined,
      mimetype: mimetype || undefined,
    });
  }, [apiCall]);

  const sendAudio = useCallback(async (number: string, audioUrl: string) => {
    const isEvolution = configRef.current?.api_url.includes("evolution");
    if (isEvolution) {
      return apiCall("POST", "/message/sendWhatsAppAudio", { number, audio: audioUrl });
    }
    return apiCall("POST", "/message/sendWhatsAppAudio", { number, audio: audioUrl });
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
    const isEvolution = configRef.current?.api_url.includes("evolution");
    if (isEvolution) {
      return apiCall("POST", "/instance/connect", {
        webhookUrl: url,
        immediate: true,
        subscribe: ["MESSAGE", "CONNECTION"]
      });
    }

    // Send both field formats for uazapi compatibility
    return apiCall("POST", "/webhook", {
      url,
      webhook_url: url,
      enabled,
      webhook_enabled: enabled,
    });
  }, [apiCall]);

  // Fetch profile picture for a contact (Evolution API or Standard)
  const fetchProfilePicture = useCallback(async (chatId: string): Promise<string | null> => {
    try {
      const isEvolution = configRef.current?.api_url.includes("evolution");
      const phone = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "");
      if (!phone) return null;

      if (isEvolution) {
        // Evolution API: POST /chat/fetchProfilePictureUrl/{number}
        const data = await apiCall("POST", `/chat/fetchProfilePictureUrl/${phone}`, { number: phone });
        // Response: { profilePicUrl: "..." } or { data: { profilePicUrl: "..." } }
        if (typeof data === "string" && data.startsWith("http")) return data;
        if (data?.profilePicUrl) return data.profilePicUrl;
        if (data?.data?.profilePicUrl) return data.data.profilePicUrl;
        if (data?.url) return data.url;
        return null;
      }

      // Standard Uazapi
      const data = await apiCall("POST", `/chat/fetchProfilePictureUrl/${phone}`, { number: phone });
      if (typeof data === "string" && data.startsWith("http")) return data;
      if (data?.profilePicUrl) return data.profilePicUrl;
      if (data?.image) return data.image;
      if (data?.url) return data.url;
      return null;
    } catch {
      return null;
    }
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
    sendMedia,
    sendAudio,
    updateChatbotSettings,
    saveBotConfig,
    getAgents,
    updateAgent,
    getWebhook,
    setWebhook,
    loadConfig,
    apiCall,
    provisionInstance,
    fetchProfilePicture,
  };
}
