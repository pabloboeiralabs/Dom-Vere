import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  instance: {
    instanceName: string;
  };
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
    };
    message: {
      conversation: string;
      extendedTextMessage: {
        text: string;
      };
    };
    pushName: string;
  };
}

async function callAI(messages: any[], tools: any[]) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    }),
  });
  return await response.json();
}

function extractContextFromHistory(history: any[]) {
  let detectedProf = null;
  let resolvedDate = null;
  let detectedTime = null;
  for (const m of history) {
    if (m.text?.includes("[Selecionou profissional:")) {
      detectedProf = m.text.replace(/.*\[Selecionou profissional:\s*/, "").replace(/\].*/, "").trim();
    }
    if (m.text?.includes("[Data:")) {
      resolvedDate = m.text.replace(/.*\[Data:\s*/, "").replace(/\].*/, "").trim();
    }
    if (m.text?.includes("[Hora:")) {
      detectedTime = m.text.replace(/.*\[Hora:\s*/, "").replace(/\].*/, "").trim();
    }
  }
  return { detectedProf, resolvedDate, detectedTime };
}

function buildUnavailableMessage(slots: any[], date: string, time: string, profName: string) {
  const profSlots = slots.filter(s => s.professional_name.toLowerCase() === profName.toLowerCase());
  const closest = profSlots.find(s => s.date >= date) || profSlots[0];
  return closest 
    ? `Esse horário não está disponível 😕 Mas tem vaga ${closest.date_label} às ${closest.time} com ${closest.professional_name}. Quer esse? 😊`
    : `Infelizmente não temos horários disponíveis com ${profName.split(" ")[0]}. Quer tentar outro profissional? 😊`;
}

function findClosestSlot(slots: any[], date: string, time: string, profName?: string) {
  let filtered = slots;
  if (profName) filtered = filtered.filter(s => s.professional_name.toLowerCase() === profName.toLowerCase());
  return filtered.find(s => s.date >= date) || filtered[0];
}

async function handleSendCarousel(apiUrl: string, token: string, sender: string, professionals: any[], bookingUrl: string, config: any) {
  const cards = professionals.map(p => ({
    title: p.name,
    description: "Profissional qualificado",
    image_url: p.photo_url || "https://via.placeholder.com/150",
    buttons: [{ title: "Escolher", text: `[Selecionou profissional: ${p.name}]` }]
  }));
  
  const response = await fetch(`${apiUrl}/send/carousel?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      number: sender,
      title: "Escolha seu profissional",
      description: "Clique abaixo para selecionar",
      cards
    }),
  });
  return response.ok ? "CAROUSEL_SENT" : "Não consegui enviar o carrossel, mas pode agendar aqui: " + bookingUrl;
}

async function handleToolCall(supabase: any, userId: string, args: any, sender: string, professionals: any[], services: any[], templates: any[]) {
  if (args.professional_name) {
    const prof = professionals.find(p => p.name.toLowerCase().includes(args.professional_name.toLowerCase()));
    if (prof) args.professional_id = prof.id;
  }
  if (args.service_name) {
    const svc = services.find(s => s.name.toLowerCase().includes(args.service_name.toLowerCase()));
    if (svc) args.service_id = svc.id;
  }
  
  const { data, error } = await supabase.from("appointments").insert({
    user_id: userId,
    professional_id: args.professional_id,
    service_id: args.service_id,
    date: args.date,
    start_time: args.time,
    notes: `Agendamento via Bot. Cliente: ${args.customer_name || "WhatsApp"}`,
    status: "agendado"
  });
  
  if (error) return "Erro ao criar agendamento: " + error.message;
  return `Agendamento confirmado para ${args.date} às ${args.time}! 🎉`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("Missing user_id", { status: 400 });

  const payload: WebhookPayload = await req.json();
  const sender = payload.data.key.remoteJid;
  const text = payload.data.message.conversation || payload.data.message.extendedTextMessage?.text || "";
  
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  
  const { data: cfg } = await supabase.from("whatsapp_config").select("*").eq("user_id", userId).single();
  const { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).single();
  const { data: professionals } = await supabase.from("professionals").select("*").eq("user_id", userId).eq("active", true);
  const { data: services } = await supabase.from("services").select("*").eq("user_id", userId).eq("active", true);
  const { data: slots } = await supabase.rpc("get_available_slots", { p_user_id: userId });
  
  const apiUrl = cfg.api_url;
  const token = cfg.instance_token;
  const bookingUrl = `${Deno.env.get("APP_URL")}/booking/${userId}`;

  const { data: history } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("wa_chatid", sender)
    .order("wa_timestamp", { ascending: false })
    .limit(10);

  const aiMessages = [
    { role: "system", content: settings.bot_prompt || "Você é um assistente de barbearia." },
    ...(history || []).reverse().map(m => ({ role: m.from_me ? "assistant" : "user", content: m.text }))
  ];

  const checkAvailabilityTool = { type: "function", function: { name: "check_availability", description: "Verifica disponibilidade", parameters: { type: "object", properties: { date: { type: "string" }, time: { type: "string" } } } } };
  const appointmentTool = { type: "function", function: { name: "create_appointment", description: "Cria agendamento", parameters: { type: "object", properties: { customer_name: { type: "string" }, professional_name: { type: "string" }, service_name: { type: "string" }, date: { type: "string" }, time: { type: "string" } } } } };
  const checkAllAvailabilityTool = { type: "function", function: { name: "check_all_availability", description: "Verifica todos", parameters: { type: "object", properties: { date: { type: "string" } } } } };
  const registerCustomerTool = { type: "function", function: { name: "register_customer", description: "Cadastra cliente", parameters: { type: "object", properties: { full_name: { type: "string" } } } } };
  const updateCustomerTool = { type: "function", function: { name: "update_customer", description: "Atualiza cliente", parameters: { type: "object", properties: { new_name: { type: "string" } } } } };
  const sendCarouselTool = { type: "function", function: { name: "send_professional_carousel", description: "Envia carrossel", parameters: { type: "object", properties: {} } } };
  const customTools: any[] = [];

  let replyText = "";
  let carouselAlreadySent = false;

  try {
    console.log("[webhook] Calling AI with", aiMessages.length, "messages");
    const ctxMain0 = extractContextFromHistory(history);
    const baseTools = [checkAvailabilityTool, appointmentTool, checkAllAvailabilityTool, registerCustomerTool, updateCustomerTool, ...customTools];
    const allTools = ctxMain0.detectedProf
      ? baseTools
      : [...baseTools, sendCarouselTool];
    if (ctxMain0.detectedProf) {
      aiMessages.push({
        role: "system",
        content: `O cliente já escolheu o profissional *${ctxMain0.detectedProf}*. NÃO envie carrossel nem peça para escolher de novo. Foque em coletar dia/horário e use check_availability ou create_appointment com professional_name="${ctxMain0.detectedProf}".`,
      });
    }

    const aiResponse = await callAI(aiMessages, allTools);
    const choice = aiResponse.choices?.[0];
    const message = choice?.message;
    console.log("[webhook] AI response:", JSON.stringify(message).slice(0, 500));

    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      let args: any;
      try {
        args = typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
      } catch {
        args = {};
      }

      if (toolCall.function?.name === "check_availability") {
        const filterDate = args.date;
        const filterTime = args.time;
        const recentProfPick = history.find(m => m.text?.startsWith("[Selecionou profissional:")) || history.slice(-15).reverse().find(m => m.text?.includes("[Selecionou profissional:"));
        
        if (recentProfPick) {
          const profName = recentProfPick.text?.replace(/.*\[Selecionou profissional:\s*/, "").replace(/\].*/, "").trim() || "o profissional";
          const profObj = professionals.find((p: any) => p.name.toLowerCase() === profName.toLowerCase());
          if (filterDate && filterTime && profObj) {
            const exact = slots.find((s: any) => s.date === filterDate && s.time === filterTime && s.professional_name.toLowerCase() === profName.toLowerCase());
            if (exact) {
              replyText = `Perfeito! *${profName.split(" ")[0]}* tem ${exact.date_label} às *${exact.time}* disponível. Quer que eu confirme? 😊`;
            } else {
              replyText = buildUnavailableMessage(slots, filterDate, filterTime, profName);
            }
          } else if (profObj) {
            const profSlots = slots.filter((s: any) => s.professional_name.toLowerCase() === profName.toLowerCase()).slice(0, 6);
            if (profSlots.length > 0) {
              const list = profSlots.map((s: any) => `• ${s.date_label} às ${s.time}`).join("\n");
              replyText = `Com *${profName.split(" ")[0]}* temos esses horários:\n\n${list}\n\nQual prefere? 😊`;
            } else {
              replyText = `*${profName.split(" ")[0]}* não tem horário disponível nos próximos dias. Quer tentar outro profissional? 😊`;
            }
          } else {
            replyText = `Você já escolheu *${profName}*. Me diga o dia e horário que prefere! 😊`;
          }
        } else {
          const carouselProfessionals = professionals;
          const transitionText = filterDate && filterTime ? `Esse horário tem disponibilidade com esses profissionais 👇` : "Vou mandar aqui pra você escolher o profissional! 👇";
          await fetch(`${apiUrl}/send/text?token=${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ number: sender, text: transitionText }),
          });
          await new Promise(r => setTimeout(r, 1200));
          const carouselResult = await handleSendCarousel(apiUrl, token, sender, carouselProfessionals, bookingUrl, {});
          if (carouselResult === "CAROUSEL_SENT") {
            carouselAlreadySent = true;
            replyText = "Escolha quem você prefere 😊";
          } else {
            replyText = carouselResult;
          }
        }
      } else if (toolCall.function?.name === "create_appointment") {
        if (!args.customer_phone) args.customer_phone = sender;
        replyText = await handleToolCall(supabase, userId, args, sender, professionals, services, []);
      } else if (toolCall.function?.name === "send_professional_carousel" || toolCall.function?.name === "check_all_availability") {
        const carouselResult = await handleSendCarousel(apiUrl, token, sender, professionals, bookingUrl, {});
        if (carouselResult === "CAROUSEL_SENT") {
          carouselAlreadySent = true;
          replyText = "Escolha o profissional que preferir! 👆";
        } else {
          replyText = carouselResult;
        }
      } else {
        replyText = message?.content || "Como posso te ajudar? 😊";
      }
    } else {
      const responseText = message?.content || "";
      const mentionsProfessionals = professionals.length > 0 && professionals.some((p: any) => responseText.toLowerCase().includes(p.name.toLowerCase()));
      
      if (mentionsProfessionals && !carouselAlreadySent) {
        const carouselResult = await handleSendCarousel(apiUrl, token, sender, professionals, bookingUrl, {});
        if (carouselResult === "CAROUSEL_SENT") {
          carouselAlreadySent = true;
          replyText = "Vou mandar o carrossel pra você escolher o profissional! 👆";
        } else {
          replyText = responseText;
        }
      } else {
        const ctx = extractContextFromHistory(history);
        if (responseText.match(/verificar|disponibilidade|checar|consultar|vou ver|deixa eu/i) && ctx.resolvedDate && ctx.detectedTime) {
          const profFromCtx = ctx.detectedProf || (professionals.length === 1 ? professionals[0].name : null);
          const manualSlot = slots.find((s: any) => s.date === ctx.resolvedDate && s.time === ctx.detectedTime && (!profFromCtx || s.professional_name.toLowerCase() === profFromCtx.toLowerCase()));
          if (manualSlot) {
            replyText = `Horário disponível! ${manualSlot.date_label} às ${manualSlot.time} com ${manualSlot.professional_name}. Quer que eu confirme? 😊`;
          } else {
            const closestManual = findClosestSlot(slots, ctx.resolvedDate!, ctx.detectedTime!, profFromCtx || undefined);
            replyText = closestManual
              ? `Esse horário não está disponível 😕 Mas tem vaga ${closestManual.date_label} às ${closestManual.time} com ${closestManual.professional_name}. Quer esse? 😊`
              : `Infelizmente não temos horários disponíveis nesse período. Quer tentar outro? 😊`;
          }
        } else {
          replyText = responseText || "Como posso te ajudar? 😊";
        }
      }
    }
  } catch (aiErr: any) {
    console.error("[webhook] AI error, using fallback:", aiErr.message);
    replyText = `Oi! 😊 Estou com um probleminha técnico agora. Mas você pode agendar pelo nosso link:\n${bookingUrl}`;
  }

  if (replyText) {
    await supabase.from("whatsapp_messages").insert({
      user_id: userId,
      wa_chatid: sender,
      from_me: true,
      text: replyText,
      wa_timestamp: Math.floor(Date.now() / 1000)
    });
    await fetch(`${apiUrl}/send/text?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ number: sender, text: replyText }),
    });
  }

  return new Response("OK", { status: 200 });
});
