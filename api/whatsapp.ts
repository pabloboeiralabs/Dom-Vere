import type { VercelRequest, VercelResponse } from "@vercel/node";

const UAZAPI_API_URL = (process.env.UAZAPI_API_URL || "").replace(/\/$/, "");
const UAZAPI_INSTANCE_TOKEN = process.env.UAZAPI_INSTANCE_TOKEN || "";
const SHOP_NAME = process.env.SHOP_NAME || "nossa barbearia";
const BOOKING_USER_ID = process.env.BOOKING_USER_ID || "";

function extractMessageText(body: any): string {
  const msg = body?.data?.message || body?.message || body;
  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.wa_text ||
    msg?.text ||
    ""
  ).trim().toLowerCase();
}

function extractSender(body: any): string {
  const key = body?.data?.key || body?.key || {};
  const remoteJid = key.remoteJid || body?.data?.remoteJid || body?.remoteJid || body?.wa_chatid || "";
  return remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
}

function isFromMe(body: any): boolean {
  const key = body?.data?.key || body?.key || {};
  return !!(key.fromMe || body?.wa_fromMe);
}

const bookingUrl = BOOKING_USER_ID
  ? `https://barberpay.vercel.app/booking/${BOOKING_USER_ID}`
  : "https://barberpay.vercel.app";

const replies = [
  {
    keywords: ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "hey", "eai", "e aí", "eae"],
    reply: `Olá! 😊 Bem-vindo(a) à *${SHOP_NAME}*!\n\nComo posso te ajudar?\n1️⃣ Agendar um horário\n2️⃣ Ver preços e serviços\n3️⃣ Falar com um atendente`,
  },
  {
    keywords: ["agendar", "marcar", "horário", "horario", "reservar", "agendamento", "1"],
    reply: `📅 Agende pelo nosso link:\n${bookingUrl}\n\nLá você escolhe o profissional, serviço e horário disponível em tempo real! 💈`,
  },
  {
    keywords: ["preço", "preco", "precos", "preços", "valor", "valores", "quanto custa", "tabela", "serviço", "servico", "serviços", "servicos", "2"],
    reply: `💈 *Nossos serviços e preços:*\n\n• Corte — R$ 35,00\n• Barba — R$ 25,00\n• Combo (Corte + Barba) — R$ 55,00\n• Sobrancelha — R$ 15,00\n\n📅 Agende pelo link: ${bookingUrl}`,
  },
  {
    keywords: ["atendente", "humano", "pessoa", "falar", "3", "parar"],
    reply: `Certo! 👋 Vou encaminhar você para um atendente humano. Aguarde um momento, por favor!`,
  },
  {
    keywords: ["obrigado", "obrigada", "valeu", "vlw", "thanks"],
    reply: `Por nada! 😊 Qualquer coisa é só chamar. Até mais! 👋`,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return res.status(200).send("Robô Online!");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!UAZAPI_API_URL || !UAZAPI_INSTANCE_TOKEN) {
    console.error("[webhook] Missing UAZAPI_API_URL or UAZAPI_INSTANCE_TOKEN env vars");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const body = req.body;

    if (isFromMe(body)) {
      return res.status(200).json({ ok: true, ignored: "fromMe" });
    }

    const text = extractMessageText(body);
    const sender = extractSender(body);

    if (!text || !sender) {
      return res.status(200).json({ ok: true, ignored: "no text or sender" });
    }

    // Find matching reply
    let replyText: string | null = null;
    for (const entry of replies) {
      if (entry.keywords.some(kw => text.includes(kw))) {
        replyText = entry.reply;
        break;
      }
    }

    if (!replyText) {
      return res.status(200).json({ ok: true, ignored: "no keyword match" });
    }

    // Send reply directly to uazapi
    const sendRes = await fetch(`${UAZAPI_API_URL}/send/text?token=${UAZAPI_INSTANCE_TOKEN}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: UAZAPI_INSTANCE_TOKEN,
        Authorization: `Bearer ${UAZAPI_INSTANCE_TOKEN}`,
      },
      body: JSON.stringify({ number: sender, text: replyText }),
    });

    const sendData = await sendRes.json().catch(() => null);
    console.log("[webhook] reply sent:", sendRes.status, sendData);

    return res.status(200).json({ ok: true, replied: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
