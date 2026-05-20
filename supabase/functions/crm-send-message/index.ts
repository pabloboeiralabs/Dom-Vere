import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isBusinessHours(): boolean {
  const now = new Date();
  const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const day = brTime.getDay();
  const hour = brTime.getHours();
  if (day === 0) return false; // domingo
  if (day === 6) return hour >= 8 && hour < 14; // sábado 8-14
  return hour >= 8 && hour < 18; // seg-sex 8-18
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, lead_id, new_stage, phone, message } = await req.json();
    if (!user_id || !lead_id) {
      return new Response(JSON.stringify({ error: "Missing user_id or lead_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Update lead stage
    const updateData: any = { stage: new_stage, last_interaction_at: new Date().toISOString() };
    await supabase.from("crm_leads").update(updateData).eq("id", lead_id).eq("user_id", user_id);

    // Send message if provided and within business hours
    let messageSent = false;
    let finalMessage = message;

    if (new_stage === "pos_venda" && !message) {
      // Auto pós-venda message
      const { data: lead } = await supabase.from("crm_leads").select("name").eq("id", lead_id).single();
      finalMessage = `Olá ${lead?.name || ""}! 😊 Obrigado pela sua visita! Esperamos que tenha gostado. Qualquer coisa é só chamar! 💈`;
    }

    if (finalMessage && phone) {
      if (!isBusinessHours()) {
        console.log("[crm-send-message] Outside business hours, skipping send");
      } else {
        const { data: config } = await supabase
          .from("whatsapp_config")
          .select("api_url, instance_token")
          .eq("user_id", user_id)
          .maybeSingle();

        if (config) {
          const apiUrl = config.api_url.replace(/\/$/, "");
          const res = await fetch(`${apiUrl}/send/text?token=${config.instance_token}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: config.instance_token,
              Authorization: `Bearer ${config.instance_token}`,
            },
            body: JSON.stringify({ number: phone, text: finalMessage }),
          });
          messageSent = res.ok;

          // Save sent message
          if (messageSent) {
            await supabase.from("whatsapp_messages").insert({
              user_id,
              from_me: true,
              wa_timestamp: Date.now(),
              wa_chatid: `${phone}@s.whatsapp.net`,
              wa_message_id: `crm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              text: finalMessage,
              msg_type: "text",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, messageSent, stage: new_stage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[crm-send-message] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
