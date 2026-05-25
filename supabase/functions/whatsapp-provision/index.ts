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

async function deleteEvolutionInstanceByName(apiUrl: string, adminToken: string, name: string) {
  try {
    const listRes = await fetch(`${apiUrl}/instance/all`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": adminToken,
      },
    });
    const listData = await listRes.json().catch(() => ({}));
    const instances = listData?.data || [];
    const target = instances.find((inst: any) => inst.name === name);
    if (target && target.id) {
      console.log(`[provision] Deleting instance ${name} with UUID ${target.id}`);
      const deleteRes = await fetch(`${apiUrl}/instance/delete/${target.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "apikey": adminToken,
        },
      });
      const deleteData = await deleteRes.json().catch(() => ({}));
      console.log(`[provision] Delete result for ${name}:`, deleteRes.status, deleteData);
    } else {
      console.log(`[provision] Instance ${name} not found on Evolution to delete`);
    }
  } catch (e) {
    console.error(`[provision] Failed to delete instance ${name}`, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const PUBLIC_URL = Deno.env.get("API_EXTERNAL_URL") || Deno.env.get("SUPABASE_PUBLIC_URL") || SUPABASE_URL;
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

    let apiUrl = existing?.api_url ? normalizeUazapiHost(existing.api_url) : UAZAPI_HOST;
    let instanceToken = existing?.instance_token as string | undefined;
    const existingConfigIsInvalid = !!existing && (apiUrl !== existing.api_url || instanceToken === "Barber-pay");
    const isEvolution = apiUrl.includes("evolution");

    if (action === "delete") {
      if (isEvolution && instanceToken) {
        await deleteEvolutionInstanceByName(apiUrl, ADMIN_TOKEN, instanceToken);
      }
      await admin.from("whatsapp_config").delete().eq("user_id", userId);
      return json({ success: true, message: "Instância deletada com sucesso" });
    }

    // Verify if instance exists on Evolution backend if it is configured
    let instanceExistsOnBackend = true;
    if (instanceToken && isEvolution) {
      try {
        const checkRes = await fetch(`${apiUrl}/instance/status?token=${instanceToken}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "apikey": instanceToken },
        });
        if (checkRes.status === 401 || checkRes.status === 404) {
          console.log("[provision] Instance not found on Evolution backend (status 401/404). Will recreate.");
          instanceExistsOnBackend = false;
        }
      } catch (e) {
        console.warn("[provision] Failed to check instance existence on backend", e);
      }
    }

    // Reset: apaga config e cria nova
    if (action === "reset" || existingConfigIsInvalid || !instanceExistsOnBackend) {
      if (isEvolution && instanceToken) {
        await deleteEvolutionInstanceByName(apiUrl, ADMIN_TOKEN, instanceToken);
      }
      await admin.from("whatsapp_config").delete().eq("user_id", userId);
      instanceToken = undefined;
      apiUrl = UAZAPI_HOST;
    }

    // Cria a instância via Evolution API ou Uazapi
    if (!instanceToken) {
      const instanceName = `barber-${userId.slice(0, 8)}`;
      
      if (isEvolution) {
        const createBody = {
          name: instanceName,
          instanceName: instanceName,
          token: instanceName,
          qrcode: true
        };
        console.log("[provision] Creating evolution instance. URL:", `${apiUrl}/instance/create`, "Body:", JSON.stringify(createBody), "ADMIN_TOKEN:", ADMIN_TOKEN);
        
        const createRes = await fetch(`${apiUrl}/instance/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": ADMIN_TOKEN
          },
          body: JSON.stringify(createBody),
        });

        const createData = await createRes.json().catch(() => ({}));
        console.log("[provision] evolution create status", createRes.status, createData);

        const alreadyExists = !createRes.ok && (
          createRes.status === 500 && (String(createData?.error || "").includes("already exists") || String(createData?.message || "").includes("already exists"))
        );

        if (!createRes.ok && createRes.status !== 400 && !alreadyExists) {
          return json({ error: "Falha ao criar instância na Evolution API", detail: createData }, 500);
        }

        instanceToken = instanceName;

        const { data: existingRow } = await admin.from("whatsapp_config").select("id").eq("user_id", userId).maybeSingle();
        if (existingRow) {
          await admin.from("whatsapp_config").update({
            api_url: apiUrl,
            instance_token: instanceToken,
          }).eq("user_id", userId);
        } else {
          await admin.from("whatsapp_config").insert({
            user_id: userId,
            api_url: apiUrl,
            instance_token: instanceToken,
          });
        }

        // Webhook configurado dinamicamente durante a etapa de conexão abaixo

      } else {
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

        // Configura webhook
        try {
          const webhookUrl = `${PUBLIC_URL}/functions/v1/whatsapp-webhook?user_id=${userId}`;
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
    }

    // Conecta / pega QR Code
    let isConnected = false;
    let qrcodeBase64 = null;
    let paircode = null;

    if (isEvolution) {
      try {
        const statusRes = await fetch(`${apiUrl}/instance/status?token=${instanceToken}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "apikey": instanceToken },
        });
        const statusData = await statusRes.json().catch(() => ({}));
        isConnected = !!(statusData?.data?.LoggedIn);

        if (!isConnected) {
          const webhookUrl = `${PUBLIC_URL}/functions/v1/whatsapp-webhook?user_id=${userId}`;
          const connectRes = await fetch(`${apiUrl}/instance/connect?token=${instanceToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": instanceToken },
            body: JSON.stringify({
              webhookUrl: webhookUrl,
              immediate: true,
              subscribe: ["MESSAGE", "CONNECTION"]
            }),
          });
          const connectData = await connectRes.json().catch(() => ({}));
          isConnected = !!(connectData?.data?.LoggedIn);

          const qrRes = await fetch(`${apiUrl}/instance/qr?token=${instanceToken}`, {
            method: "GET",
            headers: { "Content-Type": "application/json", "apikey": instanceToken },
          });
          const qrData = await qrRes.json().catch(() => ({}));
          qrcodeBase64 = qrData?.data?.Qrcode || qrData?.data?.Code || null;
          paircode = qrData?.data?.Paircode || null;
        }
      } catch (e) {
        console.error("[provision] evolution status/connect check failed", e);
      }
    } else {
      const connectRes = await fetch(`${apiUrl}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instanceToken },
        body: JSON.stringify({}),
      });
      const connectData = await connectRes.json().catch(() => ({}));
      isConnected = !!(connectData?.connected || connectData?.data?.connected || connectData?.instance?.status === "connected");
      qrcodeBase64 = pickFirstString(
        connectData?.data?.Qrcode,
        connectData?.data?.Code,
        connectData?.instance?.qrcode,
        connectData?.instance?.qrCode,
        connectData?.instance?.qr,
        connectData?.instance?.code,
        connectData?.qrcode,
        connectData?.qrCode,
        connectData?.qr,
        connectData?.code,
        connectData?.base64,
        connectData?.qrcode?.base64,
        connectData?.qrcode?.code,
      );
      paircode = pickFirstString(connectData?.data?.Paircode, connectData?.instance?.paircode, connectData?.instance?.pairCode, connectData?.paircode, connectData?.pairCode);
    }

    return json({
      api_url: apiUrl,
      instance_token: instanceToken,
      connected: isConnected,
      qrcode: qrcodeBase64,
      paircode: paircode,
      status: isConnected ? "connected" : "connecting",
    });
  } catch (e: any) {
    console.error("[whatsapp-provision] error", e);
    return json({ error: e?.message || "Erro inesperado" }, 500);
  }
});
