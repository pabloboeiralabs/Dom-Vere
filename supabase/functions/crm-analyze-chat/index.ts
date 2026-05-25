import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing messages array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const chatText = messages
      .map((m: any) => `${m.from_me ? "Bot" : "Cliente"}: ${m.text || ""}`)
      .join("\n");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Analise esta conversa de WhatsApp e classifique o lead. Use a ferramenta classify_lead para retornar o resultado.`,
          },
          { role: "user", content: chatText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_lead",
            description: "Classifica o lead baseado na conversa",
            parameters: {
              type: "object",
              properties: {
                stage: {
                  type: "string",
                  enum: ["novo", "em_andamento", "qualificado", "agendado", "confirmado", "compareceu", "nao_compareceu", "perdido", "pos_venda"],
                  description: "Estágio sugerido do lead",
                },
                notes: { type: "string", description: "Resumo da conversa e observações" },
                confidence: { type: "number", description: "Confiança de 0 a 1" },
              },
              required: ["stage", "notes", "confidence"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_lead" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ stage: "novo", notes: "Não foi possível analisar", confidence: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[crm-analyze-chat] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
