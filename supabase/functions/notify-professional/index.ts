import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Config incompleta" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { professional_id, user_id, customer_name, service_name, date, start_time } = body;

    if (!professional_id || !user_id) {
      return new Response(JSON.stringify({ error: "Dados insuficientes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get professional phone
    const { data: prof } = await adminClient
      .from("professionals")
      .select("name, phone")
      .eq("id", professional_id)
      .maybeSingle();

    if (!prof?.phone) {
      return new Response(JSON.stringify({ sent: false, reason: "Profissional sem telefone cadastrado" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get WhatsApp config for the shop owner
    const { data: waConfig } = await adminClient
      .from("whatsapp_config")
      .select("api_url, instance_token")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!waConfig?.instance_token) {
      return new Response(JSON.stringify({ sent: false, reason: "WhatsApp não configurado" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format phone for WhatsApp
    const phone = prof.phone.replace(/\D/g, "");
    const chatId = phone.length <= 11 ? `55${phone}@c.us` : `${phone}@c.us`;

    // Build message
    const dateFormatted = date ? new Date(date + "T00:00:00").toLocaleDateString("pt-BR") : "hoje";
    const timeFormatted = start_time ? start_time.slice(0, 5) : "";
    const message = `📅 *Novo Agendamento!*\n\n👤 Cliente: ${customer_name || "Não informado"}\n💇 Serviço: ${service_name || "Não informado"}\n📆 Data: ${dateFormatted}\n🕐 Horário: ${timeFormatted}\n\nAcesse seu painel para mais detalhes.`;

    // Send via uazapi
    const apiUrl = waConfig.api_url.replace(/\/$/, "");
    const sendUrl = `${apiUrl}/sendText`;

    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": waConfig.instance_token,
        "Authorization": `Bearer ${waConfig.instance_token}`,
      },
      body: JSON.stringify({
        chatId,
        text: message,
      }),
    });

    const result = await response.json().catch(() => ({}));

    return new Response(JSON.stringify({ sent: response.ok, result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
