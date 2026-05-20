// Provisiona automaticamente uma instância uazapi para a empresa autenticada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_UAZAPI_HOST = "https://ipazua.uazapi.com";

function normalizeUazapiHost(value?: string | null) {
  const raw = (value || DEFAULT_UAZAPI_HOST).trim().replace(/\/$/, "");
  try {
    const parsed = new URL(raw);
    const invalidInternalUrl = parsed.hostname.includes("supabase.co") || parsed.pathname.includes("/functions/v1/");
    return invalidInternalUrl ? DEFAULT_UAZAPI_HOST : raw;
  } catch {
    return DEFAULT_UAZAPI_HOST;
  }
}

const UAZAPI_HOST = normalizeUazapiHost(Deno.env.get("UAZAPI_HOST"));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function readJsonSafe(response: Response) {
  const rawText = await response.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN")?.trim();

    if (!ADMIN_TOKEN) return json({ error: "UAZAPI_ADMIN_TOKEN não configurado" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ error: "Sessão inválida" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "provision"; // provision | qrcode | reset

    // Busca config atual
    const { data: existing } = await admin
      .from("whatsapp_config")
      .select("api_url, instance_token")
      .eq("user_id", userId)
      .maybeSingle();

    let apiUrl = normalizeUazapiHost(existing?.api_url) || UAZAPI_HOST;
    let instanceToken = existing?.instance_token as string | undefined;
    const existingConfigIsInvalid = !!existing && (apiUrl !== existing.api_url || instanceToken === "Barber-pay");

    // Reset: apaga config e cria nova
    if (action === "reset" || existingConfigIsInvalid) {
      await admin.from("whatsapp_config").delete().eq("user_id", userId);
      instanceToken = undefined;
      apiUrl = UAZAPI_HOST;
    }

    // Cria a instância via proxy de provisionamento (revendedor uazapi)
    if (!instanceToken) {
      const instanceName = `barber-${userId.slice(0, 8)}-${Date.now()}`;
      const PROVISION_URL = "https://grlwciflaotripbumhve.supabase.co/functions/v1/create-instance-url";
      const initPayload = { token: ADMIN_TOKEN, name: instanceName, deviceName: "BarberLeo" };
      const initRes = await fetch(PROVISION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initPayload),
      });
      const initData: any = await readJsonSafe(initRes);

      console.log("[provision] init status", initRes.status, "tokenPrefix", ADMIN_TOKEN.slice(0, 4), "len", ADMIN_TOKEN.length);
      if (!initRes.ok) {
        const authFailed = initRes.status === 401 || initRes.status === 403;
        return json(
          {
            error: authFailed ? "Token admin rejeitado pelo proxy de provisionamento" : "Falha ao criar instância",
            status: initRes.status,
            detail: initData,
            needs_admin_token: authFailed,
            hint: authFailed
              ? "Verifique UAZAPI_ADMIN_TOKEN — o proxy create-instance-url recusou o token."
              : "O proxy recusou a criação da instância. Tente novamente em instantes.",
          },
          authFailed ? 200 : 500,
        );
      }
      instanceToken =
        initData?.["Instance Token"] ||
        initData?.instanceToken ||
        initData?.instance?.token ||
        initData?.data?.token ||
        (initData?.token && initData.token !== "Barber-pay" ? initData.token : undefined);
      const returnedHost = initData?.server_url || initData?.api_url || initData?.host || initData?.url || initData?.server;
      if (typeof returnedHost === "string" && returnedHost.startsWith("http")) {
        apiUrl = normalizeUazapiHost(returnedHost);
      }
      if (!instanceToken || instanceToken === ADMIN_TOKEN || instanceToken === "Barber-pay") {
        return json({ error: "Token da instância não retornado", detail: initData }, 500);
      }
      apiUrl = UAZAPI_HOST;

      await admin.from("whatsapp_config").insert({
        user_id: userId,
        api_url: apiUrl,
        instance_token: instanceToken,
      });

      // Configura webhook (best-effort)
      try {
        const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?user_id=${userId}`;
        await fetch(`${apiUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: instanceToken },
          body: JSON.stringify({
            url: webhookUrl,
            webhook_url: webhookUrl,
            enabled: true,
            webhook_enabled: true,
            addUrlEvents: true,
            addUrlTypesMessages: true,
            excludeMessages: ["wasSentByApi", "isGroupYes"],
            events: ["connection", "messages", "messages_update", "presence", "chats"],
          }),
        });
      } catch (e) {
        console.error("[provision] webhook setup failed", e);
      }
    }

    // Conecta / pega QR Code
    const connectRes = await fetch(`${apiUrl}/instance/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({}),
    });
    const connectData = await connectRes.json().catch(() => ({}));

    return json({
      api_url: apiUrl,
      instance_token: instanceToken,
      connected: !!connectData?.connected || connectData?.instance?.status === "connected",
      qrcode: pickFirstString(
        connectData?.instance?.qrcode,
        connectData?.instance?.qrCode,
        connectData?.instance?.qr,
        connectData?.instance?.code,
        connectData?.qrcode,
        connectData?.qrCode,
        connectData?.qr,
        connectData?.code,
      ),
      paircode: pickFirstString(connectData?.instance?.paircode, connectData?.instance?.pairCode, connectData?.paircode, connectData?.pairCode),
      status: connectData?.instance?.status || (connectData?.connected ? "connected" : "connecting"),
    });
  } catch (e: any) {
    console.error("[whatsapp-provision] error", e);
    return json({ error: e?.message || "Erro inesperado" }, 500);
  }
});
