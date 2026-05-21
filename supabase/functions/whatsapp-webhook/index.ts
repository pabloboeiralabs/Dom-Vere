import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const recentMessageKeys = new Map<string, number>();
const MESSAGE_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function normalizeWaNumber(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^\+/, "")
    .replace("@s.whatsapp.net", "")
    .replace("@g.us", "")
    .replace("@lid", "");
}

function isDuplicateMessage(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentMessageKeys.entries()) {
    if (now - ts > MESSAGE_DEDUPE_WINDOW_MS) recentMessageKeys.delete(k);
  }
  if (recentMessageKeys.has(key)) return true;
  recentMessageKeys.set(key, now);
  return false;
}

function extractEventType(body: any): string {
  const raw = body?.EventType || body?.eventType || body?.type || body?.event;
  if (typeof raw === "string") return raw.toLowerCase();
  if (typeof body?.event?.Type === "string") return body.event.Type.toLowerCase();
  return "";
}

function extractMessageId(body: any): string {
  return (
    body?.data?.key?.id ||
    body?.key?.id ||
    body?.message?.id ||
    body?.message?.messageid ||
    body?.wa_message_id ||
    body?.event?.MessageIDs?.[0] ||
    ""
  )
    .toString()
    .trim();
}

function extractMessageTimestamp(body: any): number {
  const raw =
    body?.message?.messageTimestamp ||
    body?.message?.wa_timestamp ||
    body?.data?.messageTimestamp ||
    body?.event?.Timestamp ||
    Date.now();

  const ts = Number(raw);
  if (!Number.isFinite(ts)) return Date.now();
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

function extractMessageText(body: any): string {
  const msg = body?.data?.message || body?.message || body;
  const text =
    msg?.content?.text ||
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    body?.data?.message?.conversation ||
    body?.data?.message?.extendedTextMessage?.text ||
    body?.wa_text ||
    msg?.wa_text ||
    msg?.text ||
    body?.text ||
    // Fallback for button/carousel clicks (TemplateButtonReplyMessage)
    msg?.content?.selectedDisplayText ||
    msg?.selectedDisplayText ||
    msg?.buttonOrListid ||
    "";
  return text.trim();
}

function extractButtonId(body: any): string {
  const msg = body?.data?.message || body?.message || body;
  return (msg?.buttonOrListid || msg?.content?.buttonOrListid || "").trim();
}

function extractSender(body: any): string {
  const key = body?.data?.key || body?.key || {};
  const remoteJid =
    key.remoteJid ||
    body?.message?.chatid ||
    body?.chat?.wa_chatid ||
    body?.data?.remoteJid ||
    body?.remoteJid ||
    body?.wa_chatid ||
    body?.data?.wa_chatid ||
    body?.chatid ||
    body?.data?.chatid ||
    body?.event?.Chat ||
    "";
  return normalizeWaNumber(remoteJid);
}

function extractMessageSenderNumber(body: any): string {
  const raw =
    body?.message?.sender ||
    body?.event?.Sender ||
    body?.chat?.wa_lastMessageSender ||
    body?.wa_lastMessageSender ||
    "";
  return normalizeWaNumber(raw);
}

function extractOwnerNumber(body: any): string {
  return normalizeWaNumber(body?.owner || body?.chat?.owner || body?.instance?.owner || "");
}

function extractPayloadToken(body: any): string {
  return String(
    body?.token ||
      body?.Token ||
      body?.instance?.token ||
      body?.instance?.Token ||
      body?.data?.token ||
      body?.data?.Token ||
      ""
  ).trim();
}

async function findWhatsappConfig(supabase: any, payloadToken: string, requestUrl: string, ownerNumber = "") {
  let urlUserId = "";
  try {
    const url = new URL(requestUrl);
    urlUserId = url.searchParams.get("user_id") || "";
    // Clean up user_id if it contains path segments (some providers might append them)
    if (urlUserId.includes("/")) {
      urlUserId = urlUserId.split("/")[0];
    }
  } catch (e) {
    console.error("[webhook] invalid request URL", requestUrl);
  }

  console.log("[webhook] findConfig", {
    urlUserId,
    tokenPrefix: payloadToken?.slice(0, 8),
    tokenLen: payloadToken?.length || 0,
  });

  // 1) Try token first (most reliable identifier from uazapi)
  if (payloadToken) {
    const { data: byToken, error: tokenErr } = await supabase
      .from("whatsapp_config")
      .select("api_url, instance_token, user_id")
      .eq("instance_token", payloadToken)
      .limit(10);
    if (tokenErr) console.error("[webhook] config lookup by token error:", tokenErr.message);
    if (byToken?.length === 1) return byToken[0];
    if (byToken && byToken.length > 1) {
      console.error("[webhook] duplicate whatsapp_config token; refusing ambiguous routing");
      return null;
    }
  }

  // 2) Fallback to URL user_id
  if (urlUserId) {
    const { data, error } = await supabase
      .from("whatsapp_config")
      .select("api_url, instance_token, user_id")
      .eq("user_id", urlUserId)
      .maybeSingle();
    if (error) console.error("[webhook] config lookup by user_id error:", error.message);
    if (data) return data;
  }

  return null;
}

function isFromMe(body: any): boolean {
  const key = body?.data?.key || body?.key || {};
  return !!(
    key.fromMe ||
    body?.fromMe ||
    body?.wa_fromMe ||
    body?.data?.wa_fromMe ||
    body?.message?.wa_fromMe ||
    body?.message?.fromMe ||
    body?.event?.IsFromMe
  );
}

function isGroupMessage(body: any): boolean {
  const key = body?.data?.key || body?.key || {};
  const remoteJid =
    key.remoteJid ||
    body?.message?.chatid ||
    body?.chat?.wa_chatid ||
    body?.data?.remoteJid ||
    body?.remoteJid ||
    body?.wa_chatid ||
    body?.event?.Chat ||
    "";
  return (
    String(remoteJid).endsWith("@g.us") ||
    !!body?.chat?.wa_isGroup ||
    !!body?.event?.IsGroup
  );
}

// ─── Slot availability logic (server-side) ──────────────────────────────────

interface AvailableSlot {
  professional_name: string;
  professional_id: string;
  date: string;
  date_label: string;
  time: string;
}

const BRASILIA_OFFSET_HOURS = -3;

function getBrasiliaNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + BRASILIA_OFFSET_HOURS * 60 * 60 * 1000);
}

function getBrasiliaTodayUtc(): Date {
  const brNow = getBrasiliaNow();
  return new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getAvailableSlots(
  supabase: any,
  userId: string,
  professionals: any[],
  daysAhead = 3
): Promise<AvailableSlot[]> {
  const profIds = professionals.map((p: any) => p.id);

  const { data: schedRows } = await supabase
    .from("professional_schedules")
    .select("professional_id, day_of_week, start_time, end_time, active")
    .in("professional_id", profIds);

  const schedMap: Record<string, any[]> = {};
  for (const r of schedRows || []) {
    if (!r.active) continue;
    if (!schedMap[r.professional_id]) schedMap[r.professional_id] = [];
    schedMap[r.professional_id].push(r);
  }

  const brNow = getBrasiliaNow();
  const today = getBrasiliaTodayUtc();
  const dates: Date[] = [];
  for (let i = 0; i < daysAhead; i++) {
    dates.push(addUtcDays(today, i));
  }

  const dateStrings = dates.map(formatUtcDate);

  const { data: existingAppts } = await supabase
    .from("appointments")
    .select("professional_id, date, start_time, end_time")
    .eq("user_id", userId)
    .in("date", dateStrings)
    .neq("status", "cancelado");

  const occupiedKey = (profId: string, date: string, minute: number) =>
    `${profId}:${date}:${minute}`;

  const occupied = new Set<string>();
  for (const a of existingAppts || []) {
    const [sh, sm] = (a.start_time || "").split(":").map(Number);
    const [eh, em] = (a.end_time || "").split(":").map(Number);
    let c = sh * 60 + (sm || 0);
    const end = eh * 60 + (em || 0);
    while (c < end) {
      occupied.add(occupiedKey(a.professional_id, a.date, c));
      c += 30;
    }
  }

  const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const todayStr = formatUtcDate(today);
  const nowMinutes = brNow.getUTCHours() * 60 + brNow.getUTCMinutes();

  const slots: AvailableSlot[] = [];

  for (const prof of professionals) {
    const profScheds = schedMap[prof.id] || [];
    for (const d of dates) {
      const dow = d.getUTCDay();
      const daySchedAll = profScheds.filter((s: any) => s.day_of_week === dow);
      if (daySchedAll.length === 0) continue;

      const dateStr = formatUtcDate(d);
      const isToday = dateStr === todayStr;
      const dedupe = new Set<number>();

      for (const daySched of daySchedAll) {
        const [sh, sm] = daySched.start_time.split(":").map(Number);
        const [eh, em] = daySched.end_time.split(":").map(Number);
        let current = sh * 60 + (sm || 0);
        const endMin = eh * 60 + (em || 0);

        while (current < endMin) {
          if (isToday && current <= nowMinutes) {
            current += 30;
            continue;
          }
          if (dedupe.has(current)) {
            current += 30;
            continue;
          }
          if (!occupied.has(occupiedKey(prof.id, dateStr, current))) {
            dedupe.add(current);
            const h = Math.floor(current / 60);
            const m = current % 60;
            const dd = d.getUTCDate();
            const mm = d.getUTCMonth() + 1;
            slots.push({
              professional_name: prof.name,
              professional_id: prof.id,
              date: dateStr,
              date_label: isToday
                ? "hoje"
                : `${dayNames[dow]} ${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}`,
              time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
            });
          }
          current += 30;
        }
      }
    }
  }
  return slots;
}

// ─── AI Integration ─────────────────────────────────────────────────────────

async function callAI(
  messages: Array<{ role: string; content: string }>,
  tools: any[]
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      tools,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text();
    console.error("[AI] error:", status, text);
    throw new Error(`AI error ${status}`);
  }

  return await response.json();
}

function findClosestSlot(
  slots: AvailableSlot[],
  requestedDate: string,
  requestedTime: string,
  professionalName?: string
): AvailableSlot | null {
  const targetMin = (() => {
    const [h, m] = requestedTime.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  })();

  let candidates = slots;
  if (professionalName) {
    const filtered = slots.filter(
      (s) => s.professional_name.toLowerCase() === professionalName.toLowerCase()
    );
    if (filtered.length > 0) candidates = filtered;
  }

  // Prefer same date first
  const sameDate = candidates.filter((s) => s.date === requestedDate);
  if (sameDate.length > 0) {
    sameDate.sort((a, b) => {
      const [ah, am] = a.time.split(":").map(Number);
      const [bh, bm] = b.time.split(":").map(Number);
      return Math.abs(ah * 60 + am - targetMin) - Math.abs(bh * 60 + bm - targetMin);
    });
    return sameDate[0];
  }

  // Otherwise closest date+time
  if (candidates.length > 0) return candidates[0];
  return null;
}

// Build a combined unavailability message: closest slot with same prof + other profs with the exact requested time
function buildUnavailableMessage(
  slots: AvailableSlot[],
  requestedDate: string,
  requestedTime: string,
  professionalName: string,
): string {
  const hasProf = !!professionalName;
  const closestSame = hasProf ? findClosestSlot(slots, requestedDate, requestedTime, professionalName) : null;
  const sameTimeOthers = slots.filter(
    (s) =>
      s.date === requestedDate &&
      s.time === requestedTime &&
      (!hasProf || s.professional_name.toLowerCase() !== professionalName.toLowerCase()),
  );

  const parts: string[] = [
    hasProf
      ? `Esse horário não tá disponível com ${professionalName} 😕`
      : `Esse horário não tá disponível 😕`,
  ];

  if (hasProf && closestSame && !(closestSame.date === requestedDate && closestSame.time === requestedTime)) {
    parts.push(`Com ${professionalName} o mais próximo é ${closestSame.date_label} às ${closestSame.time}.`);
  }

  if (sameTimeOthers.length > 0) {
    const names = Array.from(new Set(sameTimeOthers.map((s) => s.professional_name)));
    const list = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
    parts.push(`Às ${requestedTime} ${names.length === 1 ? "tem" : "têm"} ${list} disponível.`);
  }

  if (!closestSame && sameTimeOthers.length === 0) {
    if (hasProf) {
      return `Infelizmente não tem horário disponível pra ${professionalName} nesse dia. Quer tentar outro dia? 😊`;
    }
    return `Infelizmente não tem ninguém disponível nesse horário. Quer tentar outro? 😊`;
  }

  parts.push("Qual prefere? 😊");
  return parts.join("\n\n");
}

function getProfessionalsAvailableAt(
  slots: AvailableSlot[],
  professionals: any[],
  requestedDate?: string,
  requestedTime?: string,
): any[] {
  if (!requestedDate || !requestedTime) return professionals;

  const availableIds = new Set(
    slots
      .filter((s) => s.date === requestedDate && s.time === requestedTime)
      .map((s) => s.professional_id),
  );

  return professionals.filter((p: any) => availableIds.has(p.id));
}

interface ExtractedContext {
  summary: string;
  detectedService: string | null;
  detectedTime: string | null;
  detectedDate: string | null;
  resolvedDate: string | null; // ISO date string
  detectedProf: string | null;
}

function resolveRelativeDate(dateKeyword: string): string | null {
  const today = getBrasiliaTodayUtc();

  const keyword = dateKeyword.toLowerCase().trim();
  if (keyword === "hoje") {
    return formatUtcDate(today);
  }
  if (keyword === "amanhã" || keyword === "amanha") {
    return formatUtcDate(addUtcDays(today, 1));
  }
  if (keyword === "depois de amanhã" || keyword === "depois de amanha") {
    return formatUtcDate(addUtcDays(today, 2));
  }
  const dayMap: Record<string, number> = {
    domingo: 0, segunda: 1, "terça": 2, terca: 2, quarta: 3,
    quinta: 4, sexta: 5, "sábado": 6, sabado: 6,
  };
  if (dayMap[keyword] !== undefined) {
    const target = dayMap[keyword];
    const currentDay = today.getUTCDay();
    let diff = target - currentDay;
    if (diff <= 0) diff += 7;
    return formatUtcDate(addUtcDays(today, diff));
  }
  // dd/mm format
  const ddmm = keyword.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (ddmm) {
    const day = parseInt(ddmm[1]), month = parseInt(ddmm[2]) - 1;
    let year = today.getUTCFullYear();
    const d = new Date(Date.UTC(year, month, day));
    if (d < today) d.setUTCFullYear(year + 1);
    return formatUtcDate(d);
  }
  return null;
}

function extractContextFromHistory(history: Array<{ text?: string | null; from_me?: boolean | null }>): ExtractedContext {
  const found: string[] = [];
  
  const servicePatterns = [
    "corte", "barba", "combo", "sobrancelha", "pigmentação", "pigmentacao",
    "luzes", "platinado", "relaxamento", "hidratação", "hidratacao", "pezinho"
  ];
  const timeRegex = /\b(\d{1,2})\s*[:h]\s*(\d{0,2})\b/i;
  // Also catch "às 16", "as 16", "@16" (bare hour after preposition)
  const timeAsRegex = /\b(?:[àa]s|@)\s*(\d{1,2})(?:\s*[:h]\s*(\d{0,2}))?\b/i;
  const dateKeywords = [
    "hoje", "amanhã", "amanha", "depois de amanhã", "depois de amanha",
    "segunda", "terça", "terca", "quarta", "quinta", "sexta", "sábado", "sabado", "domingo"
  ];
  const dateRegex = /\b(\d{1,2})\/(\d{1,2})\b/;
  const diaRegex = /\bdia\s+(\d{1,2})(?:\s*\/\s*(\d{1,2}))?\b/i;
  
  let detectedService: string | null = null;
  let detectedTime: string | null = null;
  let detectedDate: string | null = null;
  
  const scanMsg = (t: string) => {
    if (!detectedService) {
      for (const svc of servicePatterns) {
        if (t.includes(svc)) { detectedService = svc; break; }
      }
    }
    if (!detectedTime) {
      const tm = t.match(timeRegex) || t.match(timeAsRegex);
      if (tm) {
        const hNum = parseInt(tm[1], 10);
        if (hNum >= 0 && hNum <= 23) {
          const h = String(hNum).padStart(2, "0");
          const m = (tm[2] || "00").padStart(2, "0");
          detectedTime = `${h}:${m}`;
        }
      }
    }
    if (!detectedDate) {
      for (const dk of dateKeywords) {
        if (t.includes(dk)) { detectedDate = dk; break; }
      }
      if (!detectedDate) {
        const dm = t.match(dateRegex);
        if (dm) detectedDate = `${dm[1]}/${dm[2]}`;
      }
      if (!detectedDate) {
        const dim = t.match(diaRegex);
        if (dim) {
          const dd = dim[1];
          const mm = dim[2] || String(new Date().getMonth() + 1);
          detectedDate = `${dd}/${mm}`;
        }
      }
    }
  };

  // Iterate from MOST RECENT to oldest so the latest mention wins
  // (otherwise an old "22/02 às 19:30" overrides a fresh "11h hoje").
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.from_me || !msg.text) continue;
    scanMsg(msg.text.toLowerCase());
    if (detectedDate && detectedTime && detectedService) break;
  }
  if (!detectedDate || !detectedTime) {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg.from_me || !msg.text) continue;
      scanMsg(msg.text.toLowerCase());
      if (detectedDate && detectedTime) break;
    }
  }
  
  let detectedProf: string | null = null;
  for (const msg of history) {
    if (msg.text?.startsWith("[Selecionou profissional:")) {
      detectedProf = msg.text.replace("[Selecionou profissional:", "").replace("]", "").trim();
    }
  }
  
  if (detectedService) found.push(`serviço=${detectedService}`);
  if (detectedDate) found.push(`dia=${detectedDate}`);
  if (detectedTime) found.push(`horário=${detectedTime}`);
  if (detectedProf) found.push(`profissional=${detectedProf}`);
  
  const resolvedDate = detectedDate ? resolveRelativeDate(detectedDate) : null;
  
  const summary = found.length === 0
    ? "Nenhum dado de agendamento detectado no histórico ainda."
    : `[Dados já informados pelo cliente: ${found.join(", ")}]`;

  return { summary, detectedService, detectedTime, detectedDate, resolvedDate, detectedProf };
}


  function buildSystemPrompt(
  shopName: string,
  bookingUrl: string,
  professionals: any[],
  services: any[],
  _slots: AvailableSlot[],
  customerInfo?: { name: string; birth_date?: string | null } | null
): string {
  const profList = professionals
    .map((p: any) => `- ${p.name}`)
    .join("\n");

  const svcList = services
    .map((s: any) => `- ${s.name}: R$ ${Number(s.price || 0).toFixed(2)}`)
    .join("\n");

  const customerBlock = customerInfo
    ? `\nCLIENTE IDENTIFICADO:\n- Nome: ${customerInfo.name}\n- Data de nascimento: ${customerInfo.birth_date || "não informada"}\n- IMPORTANTE: Você já sabe o nome deste cliente. Use o nome dele(a) naturalmente na conversa. NÃO peça o nome novamente. NÃO peça cadastro.\n- Se o cliente pedir para trocar/corrigir o nome ou atualizar a data de nascimento, use a ferramenta update_customer.\n`
    : `\nCLIENTE NÃO CADASTRADO:\n- Este cliente está entrando em contato pela primeira vez.\n- ANTES de qualquer coisa, faça um breve cadastro: peça o nome completo e a data de nascimento.\n- Use a ferramenta register_customer assim que o cliente informar o nome completo e a data de nascimento.\n- Depois do cadastro, prossiga normalmente.\n`;

  const dayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const today = getBrasiliaTodayUtc();
  const todayStr = formatUtcDate(today);
  const tomorrowStr = formatUtcDate(addUtcDays(today, 1));
  const dayAfterStr = formatUtcDate(addUtcDays(today, 2));

  const dateBlock = `\nDATA ATUAL: Hoje é ${todayStr} (${dayNames[today.getUTCDay()]}).
- "hoje" = ${todayStr}
- "amanhã" = ${tomorrowStr}
- "depois de amanhã" = ${dayAfterStr}
- Sempre converta datas relativas para o formato YYYY-MM-DD ao usar ferramentas.\n`;

  return `Você é a atendente virtual da *${shopName}*. Seu nome é Lia.
Fale como uma pessoa real digitando no WhatsApp — informal, simpática, natural.
Use frases curtas e diretas. Máximo 1-2 emojis por mensagem.
${customerBlock}${dateBlock}
COMO SER HUMANIZADA:
- Converse como se fosse um atendente de verdade. Nada de respostas genéricas.
- Antes de enviar qualquer coisa automática (carrossel, link), avise primeiro de forma natural. Ex: "Vou mandar aqui pra você escolher o profissional 😊"
- Use o nome do cliente quando souber. Trate por "você".
- Respostas curtas, máximo 2-3 linhas. Sem textão.
- NUNCA diga "vou verificar", "deixa eu ver", "um momento". Responda com a ação imediata.

INFORMAÇÕES NECESSÁRIAS PARA AGENDAR (só pergunte o que falta):
1. Nome do cliente (se não cadastrado)
2. Serviço desejado
3. Dia
4. Horário
5. Profissional

REGRA DE OURO — LEIA O HISTÓRICO:
- Leia TODAS as mensagens anteriores da conversa.
- Se o cliente já disse o nome, serviço, dia ou horário em qualquer mensagem anterior, USE essa informação. NÃO pergunte de novo.
- Só pergunte o que REALMENTE falta entre as 5 informações acima.
- NUNCA repita uma pergunta que já foi respondida no histórico.
- Se a sua última mensagem já perguntou dia/horário e o cliente respondeu, o próximo passo é verificar disponibilidade, NÃO perguntar de novo.

REGRAS DE FLUXO:
- NUNCA liste profissionais em texto. Use send_professional_carousel ou check_all_availability.
- Quando o cliente quer agendar e AINDA NÃO escolheu profissional: se ele já informou dia e horário, use check_all_availability para mostrar SOMENTE os profissionais disponíveis naquele horário; só use send_professional_carousel com todos quando ainda não houver dia/horário definidos.
- Se o cliente JÁ escolheu profissional (veja "[Selecionou profissional: X]" no histórico): NÃO envie carrossel novamente. Continue o fluxo.
- Quando tiver profissional + data + horário: use check_availability e crie o agendamento direto. NÃO peça confirmação extra.
- Se o cliente mencionar um serviço, use-o. Se não mencionar, assuma o serviço mais comum (primeiro da lista).
- Se o cliente perguntar preço, responda o valor e já ofereça agendar.
- Link de agendamento (só se pedirem): ${bookingUrl}
- Se o cliente disser "atendente", "humano" ou "parar", diga apenas: "Vou te transferir para um atendente! 👋"

PROFISSIONAIS:
${profList || "Nenhum cadastrado"}

SERVIÇOS:
${svcList || "Nenhum cadastrado"}`;
}

const checkAvailabilityTool = {
  type: "function" as const,
  function: {
    name: "check_availability",
    description:
      "Verifica se um horário está disponível e retorna o horário mais próximo se não estiver. Use quando o cliente informar data e horário desejados.",
    parameters: {
      type: "object",
      properties: {
        professional_name: {
          type: "string",
          description: "Nome do profissional escolhido",
        },
        date: {
          type: "string",
          description: "Data no formato YYYY-MM-DD",
        },
        time: {
          type: "string",
          description: "Horário no formato HH:MM",
        },
      },
      required: ["date", "time"],
    },
  },
};

const appointmentTool = {
  type: "function" as const,
  function: {
    name: "create_appointment",
    description:
      "Cria um agendamento quando o cliente confirmou nome, profissional, serviço, data e horário.",
    parameters: {
      type: "object",
      properties: {
        customer_name: {
          type: "string",
          description: "Nome do cliente",
        },
        customer_phone: {
          type: "string",
          description: "Telefone do cliente no formato 5527999...",
        },
        professional_name: {
          type: "string",
          description: "Nome exato do profissional escolhido",
        },
        service_name: {
          type: "string",
          description: "Nome exato do serviço escolhido",
        },
        date: {
          type: "string",
          description: "Data no formato YYYY-MM-DD",
        },
        time: {
          type: "string",
          description: "Horário no formato HH:MM",
        },
      },
      required: [
        "customer_name",
        "professional_name",
        "service_name",
        "date",
        "time",
      ],
    },
  },
};

const sendCarouselTool = {
  type: "function" as const,
  function: {
    name: "send_professional_carousel",
    description:
      "Envia um carrossel interativo com fotos dos profissionais para o cliente escolher. Use somente quando o cliente ainda não informou data e horário. Se já informou data e horário, use check_all_availability para enviar apenas quem está disponível naquele horário.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const registerCustomerTool = {
  type: "function" as const,
  function: {
    name: "register_customer",
    description:
      "Cadastra um novo cliente quando ele informa o nome completo e data de nascimento pela primeira vez. Use APENAS para clientes não cadastrados.",
    parameters: {
      type: "object",
      properties: {
        full_name: {
          type: "string",
          description: "Nome completo do cliente",
        },
        birth_date: {
          type: "string",
          description: "Data de nascimento no formato YYYY-MM-DD",
        },
      },
      required: ["full_name"],
    },
  },
};

const updateCustomerTool = {
  type: "function" as const,
  function: {
    name: "update_customer",
    description:
      "Atualiza os dados de um cliente já cadastrado. Use quando o cliente pedir para trocar o nome, corrigir o nome, atualizar data de nascimento, etc.",
    parameters: {
      type: "object",
      properties: {
        new_name: {
          type: "string",
          description: "Novo nome completo do cliente (se quiser atualizar)",
        },
        new_birth_date: {
          type: "string",
          description: "Nova data de nascimento no formato YYYY-MM-DD (se quiser atualizar)",
        },
      },
      required: [],
    },
  },
};

const checkAllAvailabilityTool = {
  type: "function" as const,
  function: {
    name: "check_all_availability",
    description:
      "Verifica quais profissionais têm um horário específico disponível. Use quando o cliente perguntar se tem horário disponível para determinada hora/data sem especificar profissional. Retorna a lista de profissionais disponíveis naquele horário.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Data no formato YYYY-MM-DD. Se não informado, usa hoje.",
        },
        time: {
          type: "string",
          description: "Horário no formato HH:MM",
        },
      },
      required: ["time"],
    },
  },
};

async function handleSendCarousel(
  apiUrl: string,
  token: string,
  sender: string,
  professionals: any[],
  bookingUrl: string,
  customCarouselConfig?: any
): Promise<string> {
  const defaultFallback = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=600&length=2&background=333&color=fff&format=png`;

  // Use custom carousel JSON if provided, otherwise build default
  let carouselPayload: any;
  if (customCarouselConfig?.json_content?.carousel) {
    // Custom config: use as template but inject real professionals
    const template = customCarouselConfig.json_content;
    const carousel = professionals.map((p: any) => {
      const templateCard = template.carousel[0] || {};
      return {
        text: (templateCard.text || "💈 *{{name}}*").replace(/\{\{name\}\}/g, p.name),
        image: p.photo_url || (templateCard.image || defaultFallback(p.name)),
        buttons: (templateCard.buttons || [{ id: "PROF_{{name}}", text: "Escolher {{first_name}}", type: "REPLY" }]).map((btn: any) => ({
          ...btn,
          id: (btn.id || "").replace(/\{\{name\}\}/g, p.name),
          text: (btn.text || "").replace(/\{\{name\}\}/g, p.name).replace(/\{\{first_name\}\}/g, p.name.split(" ")[0]),
        })),
      };
    });
    carouselPayload = {
      number: sender,
      text: template.text || "Escolha o profissional de sua preferência:",
      carousel,
      readchat: template.readchat ?? true,
    };
  } else {
    const carousel = professionals.map((p: any) => ({
      text: `💈 *${p.name}*`,
      image: p.photo_url || defaultFallback(p.name),
      buttons: [
        {
          id: `PROF_${p.name}`,
          text: `Escolher ${p.name.split(" ")[0]}`,
          type: "REPLY",
        },
      ],
    }));
    carouselPayload = {
      number: sender,
      text: "Escolha o profissional de sua preferência:",
      carousel,
      readchat: true,
    };
  }

  try {
    const res = await fetch(`${apiUrl}/send/carousel?token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(carouselPayload),
    });
    const data = await res.json().catch(() => null);
    console.log("[webhook] carousel sent:", res.status, data);
    return "CAROUSEL_SENT";
  } catch (err: any) {
    console.error("[webhook] carousel send error:", err.message);
    const fallbackText = professionals
      .map((p: any, i: number) => `${i + 1}️⃣ ${p.name}`)
      .join("\n");
    return `Escolha um profissional:\n\n${fallbackText}\n\nOu agende pelo link: ${bookingUrl}`;
  }
}

async function handleToolCall(
  supabase: any,
  userId: string,
  args: any,
  senderPhone: string,
  professionals: any[],
  services: any[],
  templateConfigs?: any[]
): Promise<string> {
  const prof = professionals.find(
    (p: any) => p.name.toLowerCase() === (args.professional_name || "").toLowerCase()
  );
  if (!prof) return "Desculpe, não encontrei esse profissional. Pode repetir o nome?";

  const svc = services.find(
    (s: any) => s.name.toLowerCase() === (args.service_name || "").toLowerCase()
  );

  const customerName = args.customer_name || "Cliente WhatsApp";
  const customerPhone = args.customer_phone || senderPhone;

  // Find or create customer
  let customerId: string;
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", customerPhone)
    .limit(1);

  if (existing && existing.length > 0) {
    customerId = existing[0].id;
  } else {
    const { data: newC, error } = await supabase
      .from("customers")
      .insert({
        user_id: userId,
        name: customerName,
        phone: customerPhone,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[tool] customer create error:", error);
      return "Ops, tive um probleminha pra salvar seus dados. Tenta de novo? 😅";
    }
    customerId = newC.id;
  }

  const [sh, sm] = (args.time || "09:00").split(":").map(Number);
  const endMin = sh * 60 + (sm || 0) + 30;
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

  const { error: apptError } = await supabase.from("appointments").insert({
    user_id: userId,
    professional_id: prof.id,
    customer_id: customerId,
    service_id: svc?.id || null,
    date: args.date,
    start_time: args.time,
    end_time: endTime,
    notes: "Agendamento via WhatsApp",
  });

  if (apptError) {
    console.error("[tool] appointment create error:", apptError);
    return "Não consegui criar o agendamento agora. Tenta pelo link? 😅";
  }

  const dd = args.date.slice(8, 10);
  const mm = args.date.slice(5, 7);

  // Check for custom template with trigger "agendamento_confirmado"
  const confirmTemplate = (templateConfigs || []).find(
    (t: any) => t.type === "template" && t.json_content?.trigger === "agendamento_confirmado"
  );

  if (confirmTemplate?.json_content?.message) {
    const tplMsg = confirmTemplate.json_content.message
      .replace(/\{\{date\}\}/g, `${dd}/${mm}`)
      .replace(/\{\{time\}\}/g, args.time)
      .replace(/\{\{professional\}\}/g, prof.name)
      .replace(/\{\{service\}\}/g, svc?.name || "Serviço")
      .replace(/\{\{customer\}\}/g, customerName)
      .replace(/\{\{customer_name\}\}/g, customerName);
    console.log("[webhook] Using custom template for appointment confirmation");
    return tplMsg;
  }

  return `✅ Agendamento confirmado!\n\n📅 *${dd}/${mm}* às *${args.time}*\n💇 ${svc?.name || "Serviço"} com *${prof.name}*\n👤 ${customerName}\n\nTe esperamos! 😊`;
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return new Response("Robô Online!", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    console.log("[webhook] received body:", JSON.stringify(body).slice(0, 2000));

    const eventType = extractEventType(body);
    if (
      eventType &&
      eventType !== "messages" &&
      eventType !== "message" &&
      eventType !== "messages.upsert"
    ) {
      return new Response(
        JSON.stringify({ ok: true, ignored: "non-message event", eventType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isFromMe(body)) {
      return new Response(JSON.stringify({ ok: true, ignored: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isGroupMessage(body)) {
      return new Response(JSON.stringify({ ok: true, ignored: "group" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = extractMessageText(body);
    const sender = extractSender(body);
    const messageId = extractMessageId(body);
    const messageTs = extractMessageTimestamp(body);
    const messageSender = extractMessageSenderNumber(body);
    const ownerNumber = extractOwnerNumber(body);
    const buttonId = extractButtonId(body);

    console.log(
      "[webhook] parsed",
      JSON.stringify({ text, sender, messageId, messageSender, ownerNumber, buttonId })
    );

    if (!sender) {
      return new Response(
        JSON.stringify({ ok: true, ignored: "no sender" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract instance token from uazapi payload to route to correct user
    const payloadToken = extractPayloadToken(body);

    // If no text AND no buttonId, send fallback instead of ignoring
    if (!text && !buttonId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const cfg = await findWhatsappConfig(supabase, payloadToken, req.url, ownerNumber);
      if (cfg) {
        const apiUrl = cfg.api_url.replace(/\/$/, "");
        await fetch(`${apiUrl}/send/text?token=${cfg.instance_token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: cfg.instance_token, Authorization: `Bearer ${cfg.instance_token}` },
          body: JSON.stringify({ number: sender, text: "Como posso te ajudar? 😊" }),
        });
      }
      return new Response(
        JSON.stringify({ ok: true, replied: !!cfg, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hard stop for self-loop
    if (ownerNumber && messageSender && ownerNumber === messageSender) {
      return new Response(
        JSON.stringify({ ok: true, ignored: "owner-self-message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dedupeKey = `${sender}:${messageId || text}:${Math.floor(messageTs / 15000)}`;
    if (isDuplicateMessage(dedupeKey)) {
      return new Response(JSON.stringify({ ok: true, ignored: "duplicate-memory" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up config by webhook token, falling back to the URL user_id when Uazapi omits token on message events.
    const cfg = await findWhatsappConfig(supabase, payloadToken, req.url, ownerNumber);
    if (!cfg) {
      console.error("[webhook] No whatsapp_config found for token:", payloadToken?.slice(0, 8));
      return new Response(JSON.stringify({ error: "No WhatsApp config for token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persistent dedupe + save inbound message
    if (messageId) {
      const { data: existing } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("user_id", cfg.user_id)
        .eq("wa_message_id", messageId)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ ok: true, ignored: "duplicate-db" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const inboundChatId =
        body?.message?.chatid || body?.chat?.wa_chatid || `${sender}@s.whatsapp.net`;
      const { error: saveInboundError } = await supabase
        .from("whatsapp_messages")
        .insert({
          user_id: cfg.user_id,
          from_me: false,
          wa_timestamp: Math.floor(messageTs),
          wa_chatid: inboundChatId,
          wa_message_id: messageId,
          text,
          msg_type: "text",
          push_name: body?.chat?.wa_name || body?.chat?.name || null,
        });

      if (saveInboundError) {
        const duplicateCode = (saveInboundError as any)?.code;
        if (duplicateCode === "23505") {
          return new Response(
            JSON.stringify({ ok: true, ignored: "duplicate-db-race" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.warn("[webhook] inbound save warning:", saveInboundError.message);
      }

      // Auto-create CRM lead for new contacts
      try {
        const leadChatId =
          body?.message?.chatid || body?.chat?.wa_chatid || `${sender}@s.whatsapp.net`;
        const pushName = body?.chat?.wa_name || body?.chat?.name || null;

        const { data: existingLead } = await supabase
          .from("crm_leads")
          .select("id, name")
          .eq("user_id", cfg.user_id)
          .eq("wa_chatid", leadChatId)
          .maybeSingle();

        if (!existingLead) {
          await supabase.from("crm_leads").insert({
            user_id: cfg.user_id,
            wa_chatid: leadChatId,
            phone: sender,
            name: pushName || "Novo Lead",
            stage: "novo",
            last_interaction_at: new Date().toISOString(),
          });
          console.log("[webhook] Auto-created CRM lead for", leadChatId);
        } else {
          // Update name if we only had placeholder and now we have a pushName
          const updates: Record<string, unknown> = {
            last_interaction_at: new Date().toISOString(),
          };
          if (pushName && (existingLead.name === "Novo Lead" || !existingLead.name)) {
            updates.name = pushName;
          }
          await supabase.from("crm_leads").update(updates).eq("id", existingLead.id);
        }
      } catch (leadErr) {
        console.warn("[webhook] auto-lead error:", (leadErr as Error)?.message);
      }
    }

    const apiUrl = cfg.api_url.replace(/\/$/, "");
    const token = cfg.instance_token;
    const bookingUserId = cfg.user_id;
    const bookingUrl = `https://id-preview--6fbee7ce-8c51-44fe-b921-82d1cee25e67.lovable.app/booking/${bookingUserId}`;

    // ─── Load context for AI ───────────────────────────────────────────────

    const chatId =
      body?.message?.chatid || body?.chat?.wa_chatid || `${sender}@s.whatsapp.net`;

    const [settingsRes, profsRes, servsRes, historyRes, customerRes, jsonConfigsRes] = await Promise.all([
      supabase
        .from("settings")
        .select("shop_name")
        .eq("user_id", cfg.user_id)
        .maybeSingle(),
      supabase
        .from("professionals")
        .select("id, name, photo_url")
        .eq("user_id", cfg.user_id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("services")
        .select("id, name, price")
        .eq("user_id", cfg.user_id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("whatsapp_messages")
        .select("text, from_me, wa_timestamp")
        .eq("user_id", cfg.user_id)
        .eq("wa_chatid", chatId)
        .order("wa_timestamp", { ascending: false })
        .limit(20),
      supabase
        .from("customers")
        .select("id, name, phone, birth_date")
        .eq("user_id", cfg.user_id)
        .eq("phone", sender)
        .limit(1),
      supabase
        .from("whatsapp_json_configs")
        .select("name, type, json_content")
        .eq("user_id", cfg.user_id)
        .eq("active", true),
    ]);

    const shopName = settingsRes.data?.shop_name || "nossa barbearia";
    const professionals = profsRes.data || [];
    const services = servsRes.data || [];
    const history = (historyRes.data || []).reverse();
    const existingCustomer = customerRes.data?.[0] || null;

    // ─── Custom JSON configs from DB ──────────────────────────────────────
    const customJsonConfigs = (jsonConfigsRes.data || []) as { name: string; type: string; json_content: any }[];
    const customTools = customJsonConfigs
      .filter((c: any) => c.type === "tool" && c.json_content?.type === "function")
      .map((c: any) => c.json_content);
    const customCarouselConfig = customJsonConfigs.find((c: any) => c.type === "carousel");
    const customTemplates = customJsonConfigs.filter((c: any) => c.type === "template");
    console.log(`[webhook] Loaded ${customJsonConfigs.length} custom JSON configs (${customTools.length} tools, ${customTemplates.length} templates)`);

    // Get available slots (used for validation, not shown in prompt)
    const slots = await getAvailableSlots(supabase, cfg.user_id, professionals, 7);

    // ─── PROF_ button click detection (carousel selection) ──────────────
    if (buttonId.startsWith("PROF_")) {
      const profName = buttonId.replace("PROF_", "");

      // Save inbound as professional selection context
      await supabase.from("whatsapp_messages").insert({
        user_id: cfg.user_id,
        from_me: false,
        wa_timestamp: Date.now(),
        wa_chatid: chatId,
        wa_message_id: messageId || `btn-${Date.now()}`,
        text: `[Selecionou profissional: ${profName}]`,
        msg_type: "text",
      }).then(() => {});

      // Build AI context with full history so it knows if date/time were already mentioned
      const profSystemPrompt = buildSystemPrompt(shopName, bookingUrl, professionals, services, slots, existingCustomer);
      const profAiMessages: Array<{ role: string; content: string }> = [
        { role: "system", content: profSystemPrompt },
      ];
      for (const msg of history) {
        if (!msg.text) continue;
        if (msg.text.startsWith("[") && msg.from_me) continue;
        profAiMessages.push({ role: msg.from_me ? "assistant" : "user", content: msg.text });
      }
      // Extract context from history to help AI
      const ctx = extractContextFromHistory(history);
      // Add selection context as latest user message with extracted info
      profAiMessages.push({
        role: "user",
        content: `[Cliente selecionou o profissional: ${profName}]. ${ctx.summary} Continue o agendamento. IMPORTANTE: NÃO diga que vai verificar — USE a tool check_availability DIRETAMENTE agora. NUNCA responda com texto prometendo uma ação futura. Se já tem data/hora/serviço, use check_availability ou create_appointment IMEDIATAMENTE. Se falta algo, pergunte APENAS o que falta de forma natural.`,
      });

      let profReply: string;
      let profCarouselSent = false;
      try {
        const allToolsProf = [checkAvailabilityTool, appointmentTool, sendCarouselTool, checkAllAvailabilityTool, registerCustomerTool, updateCustomerTool, ...customTools];
        const profAiResponse = await callAI(profAiMessages, allToolsProf);
        const profChoice = profAiResponse.choices?.[0];
        const profMessage = profChoice?.message;

        if (profMessage?.tool_calls && profMessage.tool_calls.length > 0) {
          const tc = profMessage.tool_calls[0];
          let tcArgs: any;
          try { tcArgs = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch { tcArgs = {}; }

          if (tc.function?.name === "check_availability") {
            // Force professional name if not set
            if (!tcArgs.professional_name) tcArgs.professional_name = profName;
            // Lock date/time from context — the AI must not "drift" to a different time
            if (ctx.detectedTime && tcArgs.time !== ctx.detectedTime) {
              console.log(`[webhook] PROF_ overriding tcArgs.time ${tcArgs.time} → ${ctx.detectedTime}`);
              tcArgs.time = ctx.detectedTime;
            }
            if (ctx.resolvedDate && tcArgs.date !== ctx.resolvedDate) {
              console.log(`[webhook] PROF_ overriding tcArgs.date ${tcArgs.date} → ${ctx.resolvedDate}`);
              tcArgs.date = ctx.resolvedDate;
            }
            const exact = slots.find(
              (s) => s.date === tcArgs.date && s.time === tcArgs.time &&
                s.professional_name.toLowerCase() === (tcArgs.professional_name || profName).toLowerCase()
            );
            if (exact) {
              profAiMessages.push({ role: "assistant", content: "", tool_calls: profMessage.tool_calls } as any);
              profAiMessages.push({ role: "tool" as any, tool_call_id: tc.id, content: JSON.stringify({ available: true, date: exact.date, time: exact.time, professional: exact.professional_name }) } as any);
              const followUp = await callAI(profAiMessages, [checkAvailabilityTool, appointmentTool, sendCarouselTool]);
              const followMsg = followUp.choices?.[0]?.message;
              if (followMsg?.tool_calls?.length > 0 && followMsg.tool_calls[0].function?.name === "create_appointment") {
                let apptArgs: any;
                try { apptArgs = typeof followMsg.tool_calls[0].function.arguments === "string" ? JSON.parse(followMsg.tool_calls[0].function.arguments) : followMsg.tool_calls[0].function.arguments; } catch { apptArgs = {}; }
                if (!apptArgs.customer_phone) apptArgs.customer_phone = sender;
                if (!apptArgs.professional_name) apptArgs.professional_name = profName;
                // Lock to confirmed exact slot
                apptArgs.date = exact.date;
                apptArgs.time = exact.time;
                profReply = await handleToolCall(supabase, cfg.user_id, apptArgs, sender, professionals, services, customTemplates);
              } else {
                profReply = followMsg?.content || "Esse horário está disponível! Quer confirmar? 😊";
              }
            } else {
              profReply = buildUnavailableMessage(slots, tcArgs.date, tcArgs.time, tcArgs.professional_name || profName);
            }
          } else if (tc.function?.name === "create_appointment") {
            if (!tcArgs.customer_phone) tcArgs.customer_phone = sender;
            if (!tcArgs.professional_name) tcArgs.professional_name = profName;
            // Lock date/time from context to prevent AI from drifting to a different time
            if (ctx.detectedTime && tcArgs.time !== ctx.detectedTime) {
              console.log(`[webhook] PROF_ create_appointment overriding time ${tcArgs.time} → ${ctx.detectedTime}`);
              tcArgs.time = ctx.detectedTime;
            }
            if (ctx.resolvedDate && tcArgs.date !== ctx.resolvedDate) {
              console.log(`[webhook] PROF_ create_appointment overriding date ${tcArgs.date} → ${ctx.resolvedDate}`);
              tcArgs.date = ctx.resolvedDate;
            }
            // Validate against available slots before booking
            const validSlot = slots.find(
              (s) => s.date === tcArgs.date && s.time === tcArgs.time &&
                s.professional_name.toLowerCase() === (tcArgs.professional_name || profName).toLowerCase()
            );
            if (!validSlot) {
              profReply = buildUnavailableMessage(slots, tcArgs.date, tcArgs.time, profName);
            } else {
              profReply = await handleToolCall(supabase, cfg.user_id, tcArgs, sender, professionals, services, customTemplates);
            }
          } else {
            profReply = profMessage?.content || `${profName.split(" ")[0]} selecionado! 💈 Qual dia e horário você prefere?`;
          }
        } else {
          profReply = profMessage?.content || `${profName.split(" ")[0]} selecionado! 💈 Qual dia e horário você prefere?`;

          // ── Follow-up: AI promised to check but didn't use tool ──
          if (profReply.match(/verificar|disponibilidade|checar|consultar|vou ver|deixa eu/i) && ctx.resolvedDate && ctx.detectedTime) {
            console.log("[webhook] PROF_ follow-up: AI promised but didn't act. Forcing check_availability.");
            // Send the "checking" message first
            await fetch(`${apiUrl}/send/text?token=${token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
              body: JSON.stringify({ number: sender, text: profReply }),
            });
            await new Promise(r => setTimeout(r, 1500));

            // Force a second AI call with explicit tool instruction
            profAiMessages.push({ role: "assistant", content: profReply });
            profAiMessages.push({
              role: "user",
              content: `[Sistema: O cliente está aguardando. Execute check_availability AGORA com date=${ctx.resolvedDate}, time=${ctx.detectedTime}, professional_name=${profName}. NÃO responda com texto, USE A TOOL.]`,
            });

            const followUpResponse = await callAI(profAiMessages, allToolsProf);
            const followUpMsg = followUpResponse.choices?.[0]?.message;

            if (followUpMsg?.tool_calls?.length > 0) {
              const tc2 = followUpMsg.tool_calls[0];
              let tc2Args: any;
              try { tc2Args = typeof tc2.function.arguments === "string" ? JSON.parse(tc2.function.arguments) : tc2.function.arguments; } catch { tc2Args = {}; }

              if (tc2.function?.name === "check_availability") {
                if (!tc2Args.professional_name) tc2Args.professional_name = profName;
                if (!tc2Args.date) tc2Args.date = ctx.resolvedDate;
                if (!tc2Args.time) tc2Args.time = ctx.detectedTime;
                const exact2 = slots.find(
                  (s) => s.date === tc2Args.date && s.time === tc2Args.time &&
                    s.professional_name.toLowerCase() === (tc2Args.professional_name || profName).toLowerCase()
                );
                if (exact2) {
                  profAiMessages.push({ role: "assistant", content: "", tool_calls: followUpMsg.tool_calls } as any);
                  profAiMessages.push({ role: "tool" as any, tool_call_id: tc2.id, content: JSON.stringify({ available: true, date: exact2.date, time: exact2.time, professional: exact2.professional_name }) } as any);
                  const finalResp = await callAI(profAiMessages, [checkAvailabilityTool, appointmentTool, sendCarouselTool]);
                  const finalMsg = finalResp.choices?.[0]?.message;
                  if (finalMsg?.tool_calls?.length > 0 && finalMsg.tool_calls[0].function?.name === "create_appointment") {
                    let apptArgs: any;
                    try { apptArgs = typeof finalMsg.tool_calls[0].function.arguments === "string" ? JSON.parse(finalMsg.tool_calls[0].function.arguments) : finalMsg.tool_calls[0].function.arguments; } catch { apptArgs = {}; }
                    if (!apptArgs.customer_phone) apptArgs.customer_phone = sender;
                    if (!apptArgs.professional_name) apptArgs.professional_name = profName;
                    profReply = await handleToolCall(supabase, cfg.user_id, apptArgs, sender, professionals, services, customTemplates);
                  } else {
                    profReply = finalMsg?.content || "Esse horário está disponível! Quer confirmar? 😊";
                  }
                } else {
                  profReply = buildUnavailableMessage(slots, tc2Args.date, tc2Args.time, tc2Args.professional_name || profName);
                }
              } else if (tc2.function?.name === "create_appointment") {
                if (!tc2Args.customer_phone) tc2Args.customer_phone = sender;
                if (!tc2Args.professional_name) tc2Args.professional_name = profName;
                profReply = await handleToolCall(supabase, cfg.user_id, tc2Args, sender, professionals, services, customTemplates);
              } else {
                profReply = followUpMsg?.content || "Não encontrei horários disponíveis. Quer tentar outro horário? 😊";
              }
            } else {
              // Even follow-up didn't use tool — do manual check
              const manualSlot = slots.find(
                (s) => s.date === ctx.resolvedDate && s.time === ctx.detectedTime &&
                  s.professional_name.toLowerCase() === profName.toLowerCase()
              );
              if (manualSlot) {
                profReply = `Horário disponível! ${manualSlot.date_label} às ${manualSlot.time} com ${profName}. Quer que eu confirme? 😊`;
              } else {
                profReply = buildUnavailableMessage(slots, ctx.resolvedDate!, ctx.detectedTime!, profName);
              }
            }
            // Already sent the "checking" message, so mark to skip second send
            profCarouselSent = true;
          }
        }
      } catch (e) {
        console.error("[webhook] PROF_ AI error:", e);
        profReply = `${profName.split(" ")[0]} selecionado! 💈 Qual dia e horário você prefere?`;
      }

      // ─── Safety net: AI hallucinated a confirmation without creating appointment ───
      const confirmRegex = /(confirmad|agendad|marcad|reservad|est[áa]\s+marcad|aguardamos\s+voc[êe]|seu\s+hor[áa]rio\s+est[áa])/i;
      const looksConfirmed = confirmRegex.test(profReply);
      const apptInReply = /Não consegui criar|tive um probleminha/i.test(profReply);
      if (looksConfirmed && !apptInReply && ctx.resolvedDate && ctx.detectedTime) {
        const alreadyExists = slots.find(
          (s) => s.date === ctx.resolvedDate && s.time === ctx.detectedTime &&
            s.professional_name.toLowerCase() === profName.toLowerCase()
        );
        if (alreadyExists) {
          // Check if appointment already created in this turn
          const { data: existingAppt } = await supabase
            .from("appointments")
            .select("id")
            .eq("user_id", cfg.user_id)
            .eq("professional_id", alreadyExists.professional_id || professionals.find((p:any)=>p.name.toLowerCase()===profName.toLowerCase())?.id)
            .eq("date", ctx.resolvedDate)
            .eq("start_time", ctx.detectedTime)
            .limit(1);
          if (!existingAppt || existingAppt.length === 0) {
            console.log("[webhook] PROF_ safety net: forcing create_appointment");
            try {
              await handleToolCall(supabase, cfg.user_id, {
                professional_name: profName,
                service_name: ctx.detectedService || "",
                date: ctx.resolvedDate,
                time: ctx.detectedTime,
                customer_phone: sender,
                customer_name: existingCustomer?.name || "Cliente WhatsApp",
              }, sender, professionals, services, customTemplates);
            } catch (e) {
              console.error("[webhook] PROF_ safety net error:", e);
            }
          }
        }
      }

      // Send reply (skip if already sent via follow-up)
      if (!profCarouselSent) {
        const sendRes = await fetch(`${apiUrl}/send/text?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ number: sender, text: profReply }),
        });
        console.log("[webhook] PROF_ reply sent:", sendRes.status);
      } else {
        // Follow-up reply
        const sendRes = await fetch(`${apiUrl}/send/text?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ number: sender, text: profReply }),
        });
        console.log("[webhook] PROF_ follow-up reply sent:", sendRes.status);
      }

      // Save bot reply
      await supabase.from("whatsapp_messages").insert({
        user_id: cfg.user_id,
        from_me: true,
        wa_timestamp: Date.now(),
        wa_chatid: chatId,
        wa_message_id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: profReply,
        msg_type: "text",
      });

      return new Response(JSON.stringify({ ok: true, replied: true, profSelected: profName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Keyword-based carousel detection (BEFORE AI) ─────────────────
    const professionalKeywords = [
      "profissional", "profissionais", "barbeiro", "barbeiros",
      "quem corta", "quem atende", "disponível", "disponivel", "escolher profissional",
      // Scheduling / booking keywords
      "agendar", "agendamento", "agendar horário", "agendar horario",
      "marcar", "marcar horário", "marcar horario", "marcar um horário", "marcar um horario",
      "reservar", "reservar horário", "reservar horario",
      "quero cortar", "quero agendar", "quero marcar",
      "horário", "horario", "hora disponível", "hora disponivel",
      "tem vaga", "tem horário", "tem horario",
      "cortar cabelo", "cortar o cabelo", "fazer a barba",
      "quero ir", "posso ir",
    ];
    const lowerText = text.toLowerCase();
    const wantsProfessionalCarousel = professionalKeywords.some((k) => lowerText.includes(k));

    // Check if a professional was already selected in recent history — if so, skip carousel
    const profAlreadySelected = history.some(
      (msg) => msg.text && msg.text.startsWith("[Selecionou profissional:")
    );

    const ctxForCarousel = extractContextFromHistory(history);

    if (wantsProfessionalCarousel && professionals.length > 0 && !profAlreadySelected) {
      const availableAtRequestedTime = getProfessionalsAvailableAt(
        slots,
        professionals,
        ctxForCarousel.resolvedDate || undefined,
        ctxForCarousel.detectedTime || undefined,
      );
      const carouselProfessionals = ctxForCarousel.resolvedDate && ctxForCarousel.detectedTime
        ? availableAtRequestedTime
        : professionals;

      if (ctxForCarousel.resolvedDate && ctxForCarousel.detectedTime && carouselProfessionals.length === 0) {
        const closest = findClosestSlot(slots, ctxForCarousel.resolvedDate, ctxForCarousel.detectedTime);
        const replyText = closest
          ? `Infelizmente nenhum profissional tem horário às *${ctxForCarousel.detectedTime}*. 😕\n\nO horário mais próximo disponível é ${closest.date_label} às *${closest.time}* com *${closest.professional_name}*. Quer esse? 😊`
          : `Infelizmente não temos horários disponíveis nesse período. Quer tentar outro horário? 😊`;

        await supabase.from("whatsapp_messages").insert({
          user_id: cfg.user_id,
          from_me: true,
          wa_timestamp: Date.now(),
          wa_chatid: chatId,
          wa_message_id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: replyText,
          msg_type: "text",
        });

        await fetch(`${apiUrl}/send/text?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ number: sender, text: replyText }),
        });

        return new Response(JSON.stringify({ ok: true, replied: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enviar mensagem humanizada antes do carrossel
      const transitionText = ctxForCarousel.resolvedDate && ctxForCarousel.detectedTime
        ? `Esse horário tem disponibilidade com esses profissionais 👇`
        : "Vou mandar aqui pra você escolher o profissional! 👇";
      await fetch(`${apiUrl}/send/text?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ number: sender, text: transitionText }),
      });
      await new Promise(r => setTimeout(r, 1200));

      const carouselResult = await handleSendCarousel(apiUrl, token, sender, carouselProfessionals, bookingUrl, customCarouselConfig);
      if (carouselResult === "CAROUSEL_SENT") {
        // Save carousel message
        await supabase.from("whatsapp_messages").insert({
          user_id: cfg.user_id,
          from_me: true,
          wa_timestamp: Date.now(),
          wa_chatid: chatId,
          wa_message_id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: "[Carrossel de profissionais enviado]",
          msg_type: "text",
        });
        return new Response(JSON.stringify({ ok: true, replied: true, carousel: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build AI messages with customer context
    const systemPrompt = buildSystemPrompt(
      shopName,
      bookingUrl,
      professionals,
      services,
      slots,
      existingCustomer
    );

    const aiMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of history) {
      if (!msg.text) continue;
      // Skip technical markers in AI context
      if (msg.text.startsWith("[") && msg.from_me) continue;
      aiMessages.push({
        role: msg.from_me ? "assistant" : "user",
        content: msg.text,
      });
    }

    // Make sure the current message is the last user message
    const lastMsg = aiMessages[aiMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== text) {
      aiMessages.push({ role: "user", content: text });
    }

    let replyText: string;
    let carouselAlreadySent = false;

    try {
      console.log("[webhook] Calling AI with", aiMessages.length, "messages");
      // If client already picked a professional in history, don't offer carousel again
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
          args =
            typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
        } catch {
          args = {};
        }

        if (toolCall.function?.name === "check_availability") {
          const exact = slots.find(
            (s) =>
              s.date === args.date &&
              s.time === args.time &&
              (!args.professional_name ||
                s.professional_name.toLowerCase() === args.professional_name.toLowerCase())
          );

          if (exact) {
            aiMessages.push({ role: "assistant", content: "", tool_calls: message.tool_calls } as any);
            aiMessages.push({
              role: "tool" as any,
              tool_call_id: toolCall.id,
              content: JSON.stringify({ available: true, date: exact.date, time: exact.time, professional: exact.professional_name }),
            } as any);
            const followUp = await callAI(aiMessages, [checkAvailabilityTool, appointmentTool, sendCarouselTool]);
            const followMsg = followUp.choices?.[0]?.message;
            if (followMsg?.tool_calls?.length > 0 && followMsg.tool_calls[0].function?.name === "create_appointment") {
              let apptArgs: any;
              try {
                apptArgs = typeof followMsg.tool_calls[0].function.arguments === "string"
                  ? JSON.parse(followMsg.tool_calls[0].function.arguments)
                  : followMsg.tool_calls[0].function.arguments;
              } catch { apptArgs = {}; }
              if (!apptArgs.customer_phone) apptArgs.customer_phone = sender;
              replyText = await handleToolCall(supabase, cfg.user_id, apptArgs, sender, professionals, services, customTemplates);
            } else {
              replyText = followMsg?.content || "Esse horário está disponível! Quer confirmar? 😊";
            }
          } else {
            replyText = buildUnavailableMessage(slots, args.date, args.time, args.professional_name || (slots[0]?.professional_name ?? ""));
          }
        } else if (toolCall.function?.name === "create_appointment") {
          if (!args.customer_phone) args.customer_phone = sender;
          // Lock date/time from context to prevent AI from drifting to a different time
          const ctxMain = extractContextFromHistory(history);
          if (ctxMain.detectedTime && args.time !== ctxMain.detectedTime) {
            console.log(`[webhook] main create_appointment overriding time ${args.time} → ${ctxMain.detectedTime}`);
            args.time = ctxMain.detectedTime;
          }
          if (ctxMain.resolvedDate && args.date !== ctxMain.resolvedDate) {
            console.log(`[webhook] main create_appointment overriding date ${args.date} → ${ctxMain.resolvedDate}`);
            args.date = ctxMain.resolvedDate;
          }
          // Validate against available slots before booking
          const validSlot = args.professional_name && slots.find(
            (s) => s.date === args.date && s.time === args.time &&
              s.professional_name.toLowerCase() === args.professional_name.toLowerCase()
          );
          if (args.professional_name && !validSlot) {
            replyText = buildUnavailableMessage(slots, args.date, args.time, args.professional_name);
          } else {
            replyText = await handleToolCall(supabase, cfg.user_id, args, sender, professionals, services, customTemplates);
          }
        } else if (toolCall.function?.name === "send_professional_carousel") {
          const ctxToolCarousel = extractContextFromHistory(history);
          const filterDate = args.date || ctxToolCarousel.resolvedDate || undefined;
          const filterTime = args.time || ctxToolCarousel.detectedTime || undefined;

          // ── GUARDA: já escolheu profissional recentemente? Não reenvie carrossel ──
          const recentProfPick = [...history].reverse().find(m =>
            !m.from_me === false && m.text?.startsWith("[Selecionou profissional:")
          ) || history.slice(-15).reverse().find(m => m.text?.includes("[Selecionou profissional:"));
          const lastCarouselIdx = history.map((m, i) => ({ m, i })).reverse().find(({ m }) =>
            m.from_me && (m.text?.includes("Carrossel") || m.text?.includes("Escolha o profissional") || m.text?.includes("escolher o profissional"))
          )?.i ?? -1;
          const msgsSinceCarousel = lastCarouselIdx >= 0 ? history.length - 1 - lastCarouselIdx : 999;

          if (recentProfPick) {
            // Já escolheu profissional: nunca reenviar carrossel — avançar para disponibilidade
            const profName = recentProfPick.text?.replace(/.*\[Selecionou profissional:\s*/, "").replace(/\].*/, "").trim() || "o profissional";
            const profObj = professionals.find((p: any) => p.name.toLowerCase() === profName.toLowerCase());
            if (filterDate && filterTime && profObj) {
              const exact = slots.find(
                (s) => s.date === filterDate && s.time === filterTime &&
                  s.professional_name.toLowerCase() === profName.toLowerCase()
              );
              if (exact) {
                replyText = `Perfeito! *${profName.split(" ")[0]}* tem ${exact.date_label} às *${exact.time}* disponível. Quer que eu confirme? 😊`;
              } else {
                replyText = buildUnavailableMessage(slots, filterDate, filterTime, profName);
              }
            } else if (profObj) {
              // Mostrar próximos horários do profissional escolhido
              const profSlots = slots.filter(s => s.professional_name.toLowerCase() === profName.toLowerCase()).slice(0, 6);
              if (profSlots.length > 0) {
                const list = profSlots.map(s => `• ${s.date_label} às ${s.time}`).join("\n");
                replyText = `Com *${profName.split(" ")[0]}* temos esses horários:\n\n${list}\n\nQual prefere? 😊`;
              } else {
                replyText = `*${profName.split(" ")[0]}* não tem horário disponível nos próximos dias. Quer tentar outro profissional? 😊`;
              }
            } else {
              replyText = `Você já escolheu *${profName}*. Me diga o dia e horário que prefere! 😊`;
            }
          } else if (msgsSinceCarousel < 4 && (!filterDate || !filterTime)) {
            replyText = `Me diga o dia e horário que você prefere que eu já confiro! 😊`;
          } else {
          const availableAtRequestedTime = getProfessionalsAvailableAt(
            slots,
            professionals,
            filterDate,
            filterTime,
          );
          const carouselProfessionals = filterDate && filterTime
            ? availableAtRequestedTime
            : professionals;

          if (filterDate && filterTime && carouselProfessionals.length === 0) {
            const closest = findClosestSlot(slots, filterDate, filterTime);
            replyText = closest
              ? `Infelizmente nenhum profissional tem horário às *${filterTime}*. 😕\n\nO horário mais próximo disponível é ${closest.date_label} às *${closest.time}* com *${closest.professional_name}*. Quer esse? 😊`
              : `Infelizmente não temos horários disponíveis nesse período. Quer tentar outro horário? 😊`;
            carouselAlreadySent = false;
          } else {
          const transitionText = filterDate && filterTime
            ? `Esse horário tem disponibilidade com esses profissionais 👇`
            : (message?.content || "Vou mandar aqui pra você escolher o profissional! 👇");
          if (transitionText) {
            await fetch(`${apiUrl}/send/text?token=${token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
              body: JSON.stringify({ number: sender, text: transitionText }),
            });
            await new Promise(r => setTimeout(r, 1200));
          }
          const carouselResult = await handleSendCarousel(apiUrl, token, sender, carouselProfessionals, bookingUrl, customCarouselConfig);
          if (carouselResult === "CAROUSEL_SENT") {
            carouselAlreadySent = true;
            replyText = filterDate && filterTime
              ? `Escolha quem você prefere para esse horário 😊`
              : (message?.content || "");
          } else {
            replyText = carouselResult;
          }
          }
          }
        } else if (toolCall.function?.name === "check_all_availability") {
          // Check which professionals have the requested time available
          const requestedTime = args.time || "";
          const today = formatUtcDate(getBrasiliaTodayUtc());
          const requestedDate = args.date || today;

          const [rh, rm] = requestedTime.split(":").map(Number);
          const requestedMin = (rh || 0) * 60 + (rm || 0);

          // Find all professionals available at that exact time
          const availableProfs = new Map<string, { name: string; id: string; photo_url: string | null }>();
          for (const slot of slots) {
            const [sh, sm] = slot.time.split(":").map(Number);
            const slotMin = sh * 60 + sm;
            if (slot.date === requestedDate && slotMin === requestedMin) {
              const prof = professionals.find((p: any) => p.id === slot.professional_id);
              if (prof && !availableProfs.has(prof.id)) {
                availableProfs.set(prof.id, prof);
              }
            }
          }

          const availableList = Array.from(availableProfs.values());

          if (availableList.length > 0) {
            // Send carousel with ONLY the available professionals
            const carouselResult = await handleSendCarousel(apiUrl, token, sender, availableList, bookingUrl, customCarouselConfig);
            if (carouselResult === "CAROUSEL_SENT") {
              carouselAlreadySent = true;
              const names = availableList.map((p: any) => p.name.split(" ")[0]).join(", ");
              replyText = `Temos horário às *${requestedTime}* disponível! 😊\n\nEscolha o profissional de sua preferência 👆`;

              // Save carousel message
              await supabase.from("whatsapp_messages").insert({
                user_id: cfg.user_id,
                from_me: true,
                wa_timestamp: Date.now(),
                wa_chatid: chatId,
                wa_message_id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: "[Carrossel de profissionais disponíveis enviado]",
                msg_type: "text",
              });
            } else {
              replyText = carouselResult;
            }
          } else {
            // No one available at that exact time - find closest
            const closest = findClosestSlot(slots, requestedDate, requestedTime);
            if (closest) {
              replyText = `Infelizmente nenhum profissional tem horário às *${requestedTime}*. 😕\n\nO horário mais próximo disponível é às *${closest.time}* (${closest.date_label}) com *${closest.professional_name}*.\n\nDeseja agendar nesse horário? 😊`;
            } else {
              replyText = `Infelizmente não temos horários disponíveis nesse período. 😕\n\nVocê pode tentar outro horário ou agendar pelo link:\n${bookingUrl}`;
            }
          }
        } else if (toolCall.function?.name === "register_customer") {
          // Register new customer
          const customerName = args.full_name || "Cliente";
          const birthDate = args.birth_date || null;

          // Check if already exists
          const { data: alreadyExists } = await supabase
            .from("customers")
            .select("id")
            .eq("user_id", cfg.user_id)
            .eq("phone", sender)
            .limit(1);

          if (alreadyExists && alreadyExists.length > 0) {
            // Update name/birth if needed
            await supabase
              .from("customers")
              .update({ name: customerName, birth_date: birthDate })
              .eq("id", alreadyExists[0].id);
            replyText = message?.content || `Pronto, ${customerName.split(" ")[0]}! Cadastro atualizado. Como posso te ajudar? 😊`;
          } else {
            const { error: insertErr } = await supabase
              .from("customers")
              .insert({
                user_id: cfg.user_id,
                name: customerName,
                phone: sender,
                birth_date: birthDate,
              });
            if (insertErr) {
              console.error("[webhook] register_customer error:", insertErr);
              replyText = "Ops, tive um probleminha no cadastro. Pode repetir seus dados? 😅";
            } else {
              // Ask AI for a nice follow-up response after registration
              aiMessages.push({ role: "assistant", content: "", tool_calls: message.tool_calls } as any);
              aiMessages.push({
                role: "tool" as any,
                tool_call_id: toolCall.id,
                content: JSON.stringify({ success: true, customer_name: customerName }),
              } as any);
              const followUp = await callAI(aiMessages, allTools);
              replyText = followUp.choices?.[0]?.message?.content || `Pronto, ${customerName.split(" ")[0]}! Cadastro feito com sucesso! ✅ Como posso te ajudar? 😊`;
            }
          }
        } else if (toolCall.function?.name === "update_customer") {
          // Update existing customer data
          const { data: custData } = await supabase
            .from("customers")
            .select("id, name, birth_date")
            .eq("user_id", cfg.user_id)
            .eq("phone", sender)
            .limit(1);

          if (!custData || custData.length === 0) {
            replyText = "Não encontrei seu cadastro. Pode me informar seu nome completo para eu te cadastrar? 😊";
          } else {
            const updates: Record<string, any> = {};
            if (args.new_name) updates.name = args.new_name;
            if (args.new_birth_date) updates.birth_date = args.new_birth_date;

            if (Object.keys(updates).length === 0) {
              replyText = message?.content || "O que você gostaria de atualizar? Nome ou data de nascimento? 😊";
            } else {
              const { error: updateErr } = await supabase
                .from("customers")
                .update(updates)
                .eq("id", custData[0].id);

              if (updateErr) {
                console.error("[webhook] update_customer error:", updateErr);
                replyText = "Ops, não consegui atualizar seus dados. Tenta de novo? 😅";
              } else {
                const newName = args.new_name || custData[0].name;
                aiMessages.push({ role: "assistant", content: "", tool_calls: message.tool_calls } as any);
                aiMessages.push({
                  role: "tool" as any,
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ success: true, updated: updates, customer_name: newName }),
                } as any);
                const followUp = await callAI(aiMessages, allTools);
                replyText = followUp.choices?.[0]?.message?.content || `Pronto, ${newName.split(" ")[0]}! Dados atualizados com sucesso! ✅`;
              }
            }
          }
        } else {
          replyText = message?.content || "Como posso te ajudar? 😊";
        }
      } else {
        // Check if response mentions professionals by name — force carousel instead
        const responseText = message?.content || "";
        const mentionsProfessionals = professionals.length > 0 && professionals.some(
          (p: any) => responseText.toLowerCase().includes(p.name.toLowerCase())
        );
        if (mentionsProfessionals) {
          const ctxMentionCarousel = extractContextFromHistory(history);
          const availableAtRequestedTime = getProfessionalsAvailableAt(
            slots,
            professionals,
            ctxMentionCarousel.resolvedDate || undefined,
            ctxMentionCarousel.detectedTime || undefined,
          );
          const carouselProfessionals = ctxMentionCarousel.resolvedDate && ctxMentionCarousel.detectedTime
            ? availableAtRequestedTime
            : professionals;
          const carouselResult = await handleSendCarousel(apiUrl, token, sender, carouselProfessionals, bookingUrl, customCarouselConfig);
          if (carouselResult === "CAROUSEL_SENT") {
            carouselAlreadySent = true;
            // Strip professional names from the text to avoid duplication
            replyText = ctxMentionCarousel.resolvedDate && ctxMentionCarousel.detectedTime
              ? "Escolha quem você prefere para esse horário 👆"
              : "Escolha o profissional que preferir! 👆";
          } else {
            replyText = carouselResult;
          }
        } else {
          // Check if AI promised to verify availability but didn't use a tool
          const ctx = extractContextFromHistory(history);
          if (responseText.match(/verificar|disponibilidade|checar|consultar|vou ver|deixa eu/i) && ctx.resolvedDate && ctx.detectedTime) {
            console.log("[webhook] Regular flow follow-up: AI promised but didn't act. Forcing check_availability.");
            // Send the "checking" message first
            await fetch(`${apiUrl}/send/text?token=${token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
              body: JSON.stringify({ number: sender, text: responseText }),
            });
            await new Promise(r => setTimeout(r, 1500));

            // Detect professional from context
            const profFromCtx = ctx.detectedProf || (professionals.length === 1 ? professionals[0].name : null);

            // Force a second AI call
            aiMessages.push({ role: "assistant", content: responseText });
            aiMessages.push({
              role: "user",
              content: `[Sistema: O cliente está aguardando. Execute check_availability AGORA com date=${ctx.resolvedDate}, time=${ctx.detectedTime}${profFromCtx ? `, professional_name=${profFromCtx}` : ""}. NÃO responda com texto, USE A TOOL.]`,
            });

            try {
              const followUpResp = await callAI(aiMessages, allTools);
              const followUpMsg2 = followUpResp.choices?.[0]?.message;

              if (followUpMsg2?.tool_calls?.length > 0) {
                const tc3 = followUpMsg2.tool_calls[0];
                let tc3Args: any;
                try { tc3Args = typeof tc3.function.arguments === "string" ? JSON.parse(tc3.function.arguments) : tc3.function.arguments; } catch { tc3Args = {}; }

                if (tc3.function?.name === "check_availability") {
                  if (!tc3Args.date) tc3Args.date = ctx.resolvedDate;
                  if (!tc3Args.time) tc3Args.time = ctx.detectedTime;
                  const exactSlot = slots.find(
                    (s) => s.date === tc3Args.date && s.time === tc3Args.time &&
                      (!tc3Args.professional_name || s.professional_name.toLowerCase() === tc3Args.professional_name.toLowerCase())
                  );
                  if (exactSlot) {
                    replyText = `Horário disponível! ${exactSlot.date_label} às ${exactSlot.time} com ${exactSlot.professional_name}. Quer que eu confirme? 😊`;
                  } else {
                    const closestSlot = findClosestSlot(slots, tc3Args.date, tc3Args.time, tc3Args.professional_name);
                    replyText = closestSlot
                      ? `Esse horário não está disponível 😕 Mas tem vaga ${closestSlot.date_label} às ${closestSlot.time} com ${closestSlot.professional_name}. Quer esse? 😊`
                      : `Infelizmente não temos horários disponíveis nesse período. Quer tentar outro? 😊`;
                  }
                } else if (tc3.function?.name === "create_appointment") {
                  if (!tc3Args.customer_phone) tc3Args.customer_phone = sender;
                  replyText = await handleToolCall(supabase, cfg.user_id, tc3Args, sender, professionals, services, customTemplates);
                } else {
                  replyText = followUpMsg2?.content || responseText;
                }
              } else {
                // Manual fallback
                const manualSlot = slots.find(
                  (s) => s.date === ctx.resolvedDate && s.time === ctx.detectedTime &&
                    (!profFromCtx || s.professional_name.toLowerCase() === profFromCtx.toLowerCase())
                );
                if (manualSlot) {
                  replyText = `Horário disponível! ${manualSlot.date_label} às ${manualSlot.time} com ${manualSlot.professional_name}. Quer que eu confirme? 😊`;
                } else {
                  const closestManual = findClosestSlot(slots, ctx.resolvedDate!, ctx.detectedTime!, profFromCtx || undefined);
                  replyText = closestManual
                    ? `Esse horário não está disponível 😕 Mas tem vaga ${closestManual.date_label} às ${closestManual.time} com ${closestManual.professional_name}. Quer esse? 😊`
                    : `Infelizmente não temos horários disponíveis nesse período. Quer tentar outro? 😊`;
                }
              }
            } catch (followErr: any) {
              console.error("[webhook] Regular flow follow-up error:", followErr.message);
              // Manual fallback on error
              const manualSlot = slots.find(
                (s) => s.date === ctx.resolvedDate && s.time === ctx.detectedTime
              );
              replyText = manualSlot
                ? `Horário disponível! ${manualSlot.date_label} às ${manualSlot.time} com ${manualSlot.professional_name}. Quer que eu confirme? 😊`
                : `Infelizmente não encontrei esse horário disponível. Quer tentar outro? 😊`;
            }
            // Mark that we already sent the "checking" text
            carouselAlreadySent = true;
          } else {
            replyText = responseText || "Como posso te ajudar? 😊";
          }
        }
      }
    } catch (aiErr: any) {
      console.error("[webhook] AI error, using fallback:", aiErr.message);
      replyText = `Oi! 😊 Estou com um probleminha técnico agora. Mas você pode agendar pelo nosso link:\n${bookingUrl}\n\nOu tente novamente em alguns minutos! 💈`;
    }

    // Save bot reply to whatsapp_messages for context
    const replyChatId = chatId;
    if (replyText) {
      await supabase.from("whatsapp_messages").insert({
        user_id: cfg.user_id,
        from_me: true,
        wa_timestamp: Date.now(),
        wa_chatid: replyChatId,
        wa_message_id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: carouselAlreadySent ? `[Carrossel de profissionais enviado] ${replyText}` : replyText,
        msg_type: "text",
      });
    }

    // Send text reply via uazapi (skip if carousel was already sent and no extra text)
    if (!carouselAlreadySent || (replyText && replyText.trim().length > 0)) {
      if (carouselAlreadySent) {
        // Carousel already sent the visual part — only send text if meaningful
        if (replyText && replyText.trim().length > 5) {
          const sendRes = await fetch(`${apiUrl}/send/text?token=${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ number: sender, text: replyText }),
          });
          const sendData = await sendRes.json().catch(() => null);
          console.log("[webhook] reply sent:", sendRes.status, sendData);
        }
      } else {
        const sendRes = await fetch(`${apiUrl}/send/text?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ number: sender, text: replyText }),
        });
        const sendData = await sendRes.json().catch(() => null);
        console.log("[webhook] reply sent:", sendRes.status, sendData);
      }
    }

    return new Response(JSON.stringify({ ok: true, replied: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
