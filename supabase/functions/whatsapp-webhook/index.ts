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

function extractEventType(body: any, url?: string): string {
  // If it has a clear EventType, use it
  let raw = body?.EventType || body?.eventType || body?.type || body?.event;
  if (typeof raw === "object" && raw?.Type) raw = raw.Type; // Handle nested event object
  
  if (typeof raw === "string") {
    const et = raw.toLowerCase();
    // Ignore status updates
    if (["delivered", "read", "sent", "messages_update", "message_update"].includes(et)) return "status_update";
    if (body?.event?.Type?.toLowerCase() === "delivered") return "status_update";
    return et;
  }
  
  if (url) {
    const urlObj = new URL(url);
    const path = (urlObj.pathname + urlObj.search).toLowerCase();
    if (path.includes("messages/text")) return "text_message";
    if (path.includes("messages_update")) return "status_update";
    if (path.includes("chats")) return "status_update";
  }
  
  // Fallback: if it has message content, it's probably a message
  if (body?.message || body?.data?.message || body?.wa_text || body?.text) return "message";
  
  return "";
}

function extractMessageId(body: any): string {
  const id = (
    body?.data?.Info?.ID ||
    body?.data?.key?.id ||
    body?.key?.id ||
    body?.message?.id ||
    body?.message?.messageid ||
    body?.wa_message_id ||
    body?.event?.MessageIDs?.[0] ||
    body?.event?.id ||
    body?.id ||
    ""
  ).toString().trim();
  return id;
}

function extractMessageTimestamp(body: any): number {
  const raw =
    body?.data?.Info?.Timestamp ||
    body?.message?.messageTimestamp ||
    body?.message?.wa_timestamp ||
    body?.data?.messageTimestamp ||
    body?.event?.Timestamp ||
    Date.now();

  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return parsed;
  }

  const ts = Number(raw);
  if (!Number.isFinite(ts)) return Date.now();
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

function extractMessageText(body: any): string {
  const msg = body?.data?.Message || body?.data?.message || body?.message || body;
  const text =
    msg?.extendedTextMessage?.text ||
    msg?.conversation ||
    msg?.content?.text ||
    body?.data?.message?.conversation ||
    body?.data?.message?.extendedTextMessage?.text ||
    body?.wa_text ||
    msg?.wa_text ||
    msg?.text ||
    msg?.text ||
    // Fallback for button/carousel clicks (TemplateButtonReplyMessage)
    msg?.content?.selectedDisplayText ||
    msg?.selectedDisplayText ||
    msg?.buttonOrListid ||
    "";
  return text.trim();
}

function extractButtonId(body: any): string {
  const msg = body?.data?.Message || body?.data?.message || body?.message || body;
  return (msg?.buttonOrListid || msg?.content?.buttonOrListid || "").trim();
}

function extractPushName(body: any): string {
  return (
    body?.data?.Info?.PushName ||
    body?.data?.pushName ||
    body?.pushName ||
    body?.message?.pushName ||
    ""
  ).toString().trim();
}

function wantsProfessionalCarousel(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return /\b(profissionais?|barbeir[oa]s?|equipe|quem corta|com quem|qual profissional)\b/i.test(normalized);
}

function extractSender(body: any): string {
  const key = body?.data?.key || body?.key || {};
  const remoteJid =
    body?.data?.Info?.Chat ||
    body?.data?.Info?.Sender ||
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
  const t = body?.token || body?.Token || body?.data?.token || body?.data?.Token;
  if (t) return String(t).trim();

  if (body?.instance && typeof body.instance === "string") return body.instance.trim();
  if (body?.instance?.token) return String(body.instance.token).trim();
  if (body?.instanceId) return String(body.instanceId).trim();
  return "";
}

async function findWhatsappConfig(supabase: any, payloadToken: string, requestUrl: string, _ownerNumber = "") {
  let urlUserId = "";
  try {
    const url = new URL(requestUrl);
    urlUserId = url.searchParams.get("user_id") || "";
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

  if (payloadToken) {
    const { data: byToken, error: tokenErr } = await supabase
      .from("whatsapp_config")
      .select("api_url, instance_token, user_id")
      .eq("instance_token", payloadToken)
      .limit(10);
    if (tokenErr) console.error("[webhook] config lookup by token error:", tokenErr.message);
    if (byToken?.length === 1) return byToken[0];
  }

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
    body?.data?.Info?.IsFromMe ||
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
    body?.data?.Info?.Chat ||
    body?.data?.Info?.Sender ||
    key.remoteJid ||
    body?.message?.chatid ||
    body?.chat?.wa_chatid ||
    body?.data?.remoteJid ||
    body?.remoteJid ||
    body?.wa_chatid ||
    body?.event?.Chat ||
    "";
  return (
    body?.data?.Info?.IsGroup ||
    String(remoteJid).endsWith("@g.us") ||
    !!body?.chat?.wa_isGroup ||
    !!body?.event?.IsGroup
  );
}

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

// Normalize date strings from AI: YYYY-MM-DD, DD/MM/YYYY, DD/MM, DD-MM, "amanha", "hoje"
function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const today = getBrasiliaTodayUtc();
  if (s === "hoje" || s === "today") return formatUtcDate(today);
  if (s === "amanha" || s === "amanhã" || s === "tomorrow") return formatUtcDate(addUtcDays(today, 1));
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // DD/MM or DD-MM → use current year (or next year if date already passed)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const y = today.getUTCFullYear();
    const candidate = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return candidate < formatUtcDate(today) ? `${y + 1}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : candidate;
  }
  return null;
}

// Normalize time strings: "11", "11h", "11h00", "11:00", "11:00:00", "11.00"
function normalizeTime(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  let m = s.match(/^(\d{1,2})[:h.]?(\d{0,2})(?::\d{1,2})?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (isNaN(h) || h < 0 || h > 23 || isNaN(min) || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Check availability directly against the DB (schedule range + appointment overlap)
async function isSlotAvailable(
  supabase: any,
  userId: string,
  dateISO: string,
  timeHHMM: string,
  professionalName?: string,
  professionals?: any[]
): Promise<{ available: boolean; reason?: string; professional_id?: string }> {
  const day = new Date(`${dateISO}T12:00:00Z`);
  const dow = day.getUTCDay();
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const minute = hh * 60 + mm;

  // Determine which professionals to check
  let profsToCheck = professionals || [];
  if (professionalName) {
    const filt = profsToCheck.filter((p: any) => p.name.toLowerCase() === professionalName.toLowerCase());
    if (filt.length > 0) profsToCheck = filt;
  }
  if (profsToCheck.length === 0) {
    const { data } = await supabase.from("professionals").select("id, name").eq("user_id", userId).eq("active", true);
    profsToCheck = data || [];
  }
  const profIds = profsToCheck.map((p: any) => p.id);
  if (profIds.length === 0) return { available: false, reason: "no_professionals" };

  const { data: schedRows } = await supabase
    .from("professional_schedules")
    .select("professional_id, start_time, end_time, active, day_of_week")
    .in("professional_id", profIds);

  const profsWithSchedule = new Set((schedRows || []).map((r: any) => r.professional_id));
  const todaySched = (schedRows || []).filter((r: any) => r.day_of_week === dow);

  // Fallback default schedule for professionals without any registered schedule
  // (mon-sat 08:00-18:00, matching DB defaults)
  const DEFAULT_START = 8 * 60;
  const DEFAULT_END = 18 * 60;
  const isWorkDayDefault = dow >= 1 && dow <= 6;

  const candidateProfs: string[] = [];
  for (const profId of profIds) {
    if (profsWithSchedule.has(profId)) {
      const ok = todaySched.some((r: any) => {
        if (r.professional_id !== profId || r.active === false) return false;
        const [sh, sm] = (r.start_time || "00:00").split(":").map(Number);
        const [eh, em] = (r.end_time || "00:00").split(":").map(Number);
        return minute >= sh * 60 + (sm || 0) && minute < eh * 60 + (em || 0);
      });
      if (ok) candidateProfs.push(profId);
    } else {
      // No schedule configured → use default
      if (isWorkDayDefault && minute >= DEFAULT_START && minute < DEFAULT_END) {
        candidateProfs.push(profId);
      }
    }
  }

  if (candidateProfs.length === 0) return { available: false, reason: "out_of_schedule" };

  // Check existing appointments overlap
  const { data: appts } = await supabase
    .from("appointments")
    .select("professional_id, start_time, end_time")
    .eq("user_id", userId)
    .eq("date", dateISO)
    .in("professional_id", candidateProfs)
    .neq("status", "cancelado");

  for (const profId of candidateProfs) {
    const conflict = (appts || []).some((a: any) => {
      if (a.professional_id !== profId) return false;
      const [sh, sm] = (a.start_time || "00:00").split(":").map(Number);
      const [eh, em] = (a.end_time || "00:00").split(":").map(Number);
      const startM = sh * 60 + (sm || 0);
      const endM = eh * 60 + (em || 0);
      return minute >= startM && minute < endM;
    });
    if (!conflict) return { available: true, professional_id: profId };
  }
  return { available: false, reason: "occupied" };
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

async function callAI(
  messages: Array<{ role: string; content: string }>,
  tools: any[]
): Promise<any> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
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

function resolveRelativeDate(dateKeyword: string): string | null {
  const today = getBrasiliaTodayUtc();
  const keyword = dateKeyword.toLowerCase().trim();
  if (keyword === "hoje") return formatUtcDate(today);
  if (keyword === "amanhã" || keyword === "amanha") return formatUtcDate(addUtcDays(today, 1));
  if (keyword === "depois de amanhã" || keyword === "depois de amanha") return formatUtcDate(addUtcDays(today, 2));
  
  const dayMap: Record<string, number> = {
    domingo: 0, segunda: 1, "terça": 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, "sábado": 6, sabado: 6,
  };
  if (dayMap[keyword] !== undefined) {
    const target = dayMap[keyword];
    const currentDay = today.getUTCDay();
    let diff = target - currentDay;
    if (diff <= 0) diff += 7;
    return formatUtcDate(addUtcDays(today, diff));
  }
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

interface ExtractedContext {
  summary: string;
  detectedService: string | null;
  detectedTime: string | null;
  detectedDate: string | null;
  resolvedDate: string | null;
  detectedProf: string | null;
}

function extractContextFromHistory(history: Array<{ text?: string | null; from_me?: boolean | null }>): ExtractedContext {
  const found: string[] = [];
  const servicePatterns = ["corte", "barba", "combo", "sobrancelha", "pigmentação", "luzes", "pezinho"];
  const timeRegex = /\b(\d{1,2})\s*[:h]\s*(\d{0,2})\b/i;
  const timeAsRegex = /\b(?:[àa]s|@)\s*(\d{1,2})(?:\s*[:h]\s*(\d{0,2}))?\b/i;
  const dateKeywords = ["hoje", "amanhã", "amanha", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
  const dateRegex = /\b(\d{1,2})\/(\d{1,2})\b/;

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
          detectedTime = `${String(hNum).padStart(2, "0")}:${(tm[2] || "00").padStart(2, "0")}`;
        }
      }
    }
    if (!detectedDate) {
      for (const dk of dateKeywords) { if (t.includes(dk)) { detectedDate = dk; break; } }
      if (!detectedDate) { const dm = t.match(dateRegex); if (dm) detectedDate = `${dm[1]}/${dm[2]}`; }
    }
  };

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.from_me || !msg.text) continue;
    scanMsg(msg.text.toLowerCase());
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

  return {
    summary: found.length === 0 ? "Nenhum dado detectado." : `[Dados informados: ${found.join(", ")}]`,
    detectedService, detectedTime, detectedDate,
    resolvedDate: detectedDate ? resolveRelativeDate(detectedDate) : null,
    detectedProf
  };
}

function buildSystemPrompt(shopName: string, bookingUrl: string, professionals: any[], services: any[], slots: AvailableSlot[], customerInfo?: any, stages?: Array<{ name: string; instruction: string; skip_if_registered: boolean }>): string {
  const profList = professionals.map((p: any) => `- ${p.name}`).join("\n");
  const svcList = services.map((s: any) => `- ${s.name}: R$ ${Number(s.price || 0).toFixed(2)}`).join("\n");
  const todayStr = formatUtcDate(getBrasiliaTodayUtc());

  const grouped: Record<string, Record<string, string[]>> = {};
  for (const s of slots) {
    if (!grouped[s.date]) grouped[s.date] = {};
    if (!grouped[s.date][s.professional_name]) grouped[s.date][s.professional_name] = [];
    grouped[s.date][s.professional_name].push(s.time);
  }
  const availLines: string[] = [];
  for (const date of Object.keys(grouped).sort().slice(0, 5)) {
    for (const prof of Object.keys(grouped[date])) {
      const times = grouped[date][prof].slice(0, 12).join(", ");
      availLines.push(`- ${date} ${prof}: ${times}`);
    }
  }
  const availability = availLines.length > 0
    ? `DISPONIBILIDADE (próximos dias):\n${availLines.join("\n")}\n`
    : "";

  const isRegistered = !!customerInfo?.id;
  const activeStages = (stages || []).filter(s => !(s.skip_if_registered && isRegistered));
  const stagesBlock = activeStages.length > 0
    ? `\n========================================\nETAPAS DA CONVERSA (OBRIGATÓRIO seguir nesta ordem):\n${activeStages.map((s, i) => `${i + 1}. [${s.name}]\n   ${s.instruction}`).join("\n\n")}\n========================================\nIDENTIFIQUE pelo histórico em qual etapa está. Se for a primeira mensagem do cliente, EXECUTE a ETAPA 1 EXATAMENTE como descrito (incluindo qualquer informação da barbearia, nome do cliente, etc.). NÃO pule etapas. NÃO use saudações genéricas se a etapa 1 pede algo específico.\n`
    : "";

  const customerBlock = isRegistered
    ? `\nCLIENTE JÁ CADASTRADO: ${customerInfo.name}${customerInfo.birth_date ? ` (nasc. ${customerInfo.birth_date})` : ""}. Use o PRIMEIRO NOME (${String(customerInfo.name).split(" ")[0]}) ao se dirigir a ele(a). NÃO peça cadastro novamente.\n`
    : "";

  return `Você é a atendente virtual da *${shopName}*. Seu nome é Lia.
Seu objetivo é ter uma conversa NATURAL e ACOLHEDORA com o cliente, entendendo as necessidades dele aos poucos.

DATA ATUAL: ${todayStr}.
NOME DA BARBEARIA: ${shopName}.
${customerBlock}${stagesBlock}
SERVIÇOS:
${svcList}
PROFISSIONAIS:
${profList}
${availability}LINK: ${bookingUrl}

🪜 *FLUXO DA CONVERSA (siga naturalmente, um passo por vez):*
1. CUMPRIMENTE o cliente com uma saudação calorosa. Pergunte como pode ajudar.
2. ESCUTE o que o cliente precisa. Deixe ele falar primeiro.
3. Se ele quiser agendar, pergunte UM item de cada vez: serviço, profissional, dia, horário.
4. Só use ferramentas (check_availability, create_appointment) quando tiver TODOS os dados.
5. Se ele perguntar valores, responda com os preços dos serviços.

⚠️ *REGRAS IMPORTANTES:*
- Use send_professional_carousel quando o cliente demonstrar interesse em agendar, mas SEMPRE depois de cumprimentar primeiro.
- NÃO envie carrossel na primeira mensagem. Primeiro converse, entenda a necessidade.
- NÃO pergunte tudo de uma vez. Faça uma pergunta por vez.
- Seja breve: 2-3 frases por mensagem, com no máximo 1 emoji.
- Use formato YYYY-MM-DD e HH:MM ao chamar ferramentas.
- Ao finalizar, pergunte se precisa de mais algo.
- Se o cliente já for cadastrado, trate pelo nome e NÃO peça cadastro novamente.`;
}

async function handleSendCarousel(
  apiUrl: string,
  token: string,
  sender: string,
  professionals: any[],
  bookingUrl: string,
  _config?: any
): Promise<string> {
  const defaultFallback = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=600&length=2&background=333&color=fff&format=png`;
  const safeImage = (p: any) => {
    const url = String(p.photo_url || "").trim();
    if (!url) return defaultFallback(p.name);
    return /.(png|jpe?g)(\?|$)/i.test(url) ? url : defaultFallback(p.name);
  };

  const cards = professionals.map((p: any) => ({
    header: { title: p.name, imageUrl: safeImage(p) },
    body: { text: `💈 *${p.name}*` },
    buttons: [
      { type: "REPLY", displayText: `Escolher ${p.name.split(" ")[0]}`, id: `PROF_${p.name}` },
    ],
  }));

  try {
    const res = await fetch(`${apiUrl}/send/carousel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": token,
      },
      body: JSON.stringify({
        number: sender,
        body: "Escolha o profissional de sua preferência:",
        cards,
      }),
    });
    const data = await res.json();
    console.log("[webhook] carousel sent:", res.status, data);
    if (res.status === 200) return "CAROUSEL_SENT";
    throw new Error(`Carousel failed: ${res.status}`);
  } catch (err: any) {
    console.error("[webhook] carousel send error:", err.message);
    return `Escolha um profissional:\n\n${professionals.map((p, i) => `${i + 1}️⃣ ${p.name}`).join("\n")}\n\nOu agende pelo link: ${bookingUrl}`;
  }
}
  const customerName = args.customer_name || "Cliente";

  const dateISO = normalizeDate(args.date);
  const timeHHMM = normalizeTime(args.time);
  console.log("[webhook] create_appointment normalized:", { raw: args, dateISO, timeHHMM });
  if (!dateISO || !timeHHMM) return "Não consegui entender a data ou horário. Pode repetir? 😊";

  // Validate against schedule + existing appointments
  const check = await isSlotAvailable(supabase, userId, dateISO, timeHHMM, prof.name, professionals);
  if (!check.available) {
    if (check.reason === "out_of_schedule") return "Esse horário está fora do expediente. Quer tentar outro? 😊";
    if (check.reason === "occupied") return "Esse horário já está ocupado. Quer tentar outro? 😊";
    return "Não consegui validar esse horário. Quer tentar outro? 😊";
  }

  const { data: cust } = await supabase.from("customers").select("id").eq("user_id", userId).eq("phone", senderPhone).maybeSingle();
  let customerId = cust?.id;
  if (!customerId) {
    const { data: nCust } = await supabase.from("customers").insert({ user_id: userId, name: customerName, phone: senderPhone }).select("id").single();
    customerId = nCust.id;
  }

  // Compute end_time = start + 30min default
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const endMin = hh * 60 + mm + 30;
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

  const { error } = await supabase.from("appointments").insert({
    user_id: userId,
    professional_id: prof.id,
    service_id: svc?.id,
    customer_id: customerId,
    date: dateISO,
    start_time: timeHHMM,
    end_time: endTime,
    status: "agendado",
  });

  if (error) {
    console.error("[webhook] appointment insert error:", JSON.stringify(error));
    return "Erro ao agendar.";
  }
  return `✅ Confirmado! ${dateISO} às ${timeHHMM} com ${prof.name}.`;
}

async function sendWhatsappMessage(apiUrl: string, token: string, number: string, text: string) {
  const url = `${apiUrl}/send/text`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": token,
  };
  const body = { number, text };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[sendWhatsappMessage] Failed to send message. Status: ${res.status}, Response: ${errText}`);
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  return await res.json().catch(() => ({}));
}
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[sendWhatsappMessage] Failed to send message. Status: ${res.status}, Response: ${errText}`);
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  return await res.json().catch(() => ({}));
}

const checkAvailabilityTool = { type: "function", function: { name: "check_availability", parameters: { type: "object", properties: { date: { type: "string" }, time: { type: "string" }, professional_name: { type: "string" } }, required: ["date", "time"] } } };
const appointmentTool = { type: "function", function: { name: "create_appointment", parameters: { type: "object", properties: { date: { type: "string" }, time: { type: "string" }, professional_name: { type: "string" }, service_name: { type: "string" } }, required: ["date", "time", "professional_name"] } } };
const sendCarouselTool = { type: "function", function: { name: "send_professional_carousel", parameters: { type: "object", properties: {} } } };

Deno.serve(async (req) => {
  console.log("[webhook] Request received:", req.method, req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response("Online");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json();
    console.log("[webhook] Body keys:", Object.keys(body));
    console.log("[webhook] Full body:", JSON.stringify(body));


    const eventType = extractEventType(body, req.url);
    console.log("[webhook] EventType:", eventType);
    
    // Whitelist event types - extended to be more permissive
    const allowedEvents = ["messages", "message", "messages.upsert", "message.upsert", "text_message", "message.text"];
    if (eventType === "status_update") return new Response(JSON.stringify({ ok: true, ignored: "status_update" }));
    
    if (eventType && !allowedEvents.includes(eventType)) {
      console.log("[webhook] Ignored event type:", eventType);
      return new Response(JSON.stringify({ ok: true, ignored: "event_type", type: eventType }));
    }

    const text = extractMessageText(body);
    const sender = extractSender(body);
    const messageId = extractMessageId(body);
    const isMe = isFromMe(body);

    console.log("[webhook] Parsed:", { messageId, sender, text: text?.slice(0, 20), isMe });

    if (!messageId && !text) {
      console.log("[webhook] No message ID and no text, ignoring.");
      return new Response(JSON.stringify({ ok: true, ignored: "no_data" }));
    }

    const payloadToken = extractPayloadToken(body);
    const buttonId = extractButtonId(body);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cfg = await findWhatsappConfig(supabase, payloadToken, req.url);
    if (!cfg) return new Response(JSON.stringify({ error: "No config" }));

    // Persistent deduplication using DB
    const { data: existingMsg } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("user_id", cfg.user_id)
      .eq("wa_message_id", messageId)
      .maybeSingle();

    if (existingMsg) {
      console.log("[webhook] Duplicate message detected (DB):", messageId);
      return new Response(JSON.stringify({ ok: true, ignored: "duplicate" }));
    }

    const isGroup = isGroupMessage(body);
    const suffix = isGroup ? "@g.us" : "@s.whatsapp.net";
    const pushName = extractPushName(body);

    // Save inbound/outbound message immediately to prevent race conditions
    await supabase.from("whatsapp_messages").insert({
      user_id: cfg.user_id,
      wa_chatid: `${sender}${suffix}`,
      wa_message_id: messageId,
      text: text || `[Button: ${buttonId}]`,
      from_me: isMe,
      wa_timestamp: Date.now(),
      push_name: isMe ? "Você" : pushName || null
    });

    const phoneDigits = sender.replace(/\D/g, "");
    const [settingsRes, profsRes, servsRes, historyRes, stagesRes, customerRes] = await Promise.all([
      supabase.from("settings").select("*").eq("user_id", cfg.user_id).maybeSingle(),
      supabase.from("professionals").select("*").eq("user_id", cfg.user_id).eq("active", true),
      supabase.from("services").select("*").eq("user_id", cfg.user_id).eq("active", true),
      supabase.from("whatsapp_messages").select("*").eq("user_id", cfg.user_id).eq("wa_chatid", `${sender}${suffix}`).order("wa_timestamp", { ascending: false }).limit(10),
      supabase.from("bot_conversation_stages").select("name, instruction, stage_order, skip_if_registered").eq("user_id", cfg.user_id).eq("active", true).order("stage_order"),
      supabase.from("customers").select("id, name, birth_date, phone").eq("user_id", cfg.user_id).ilike("phone", `%${phoneDigits.slice(-8)}%`).maybeSingle(),
    ]);

    const shopName = settingsRes.data?.shop_name || "Barbearia";
    const professionals = profsRes.data || [];
    const services = servsRes.data || [];
    const history = (historyRes.data || []).reverse();
    const stages = stagesRes.data || [];
    const customerInfo = customerRes.data || null;

    if (isMe) {
      console.log("[webhook] Message is from me, saving but skipping AI reply.");
      return new Response(JSON.stringify({ ok: true, message: "Outbound message stored." }));
    }

    if (isGroup) {
      console.log("[webhook] Message is in a group, saving but skipping AI reply.");
      return new Response(JSON.stringify({ ok: true, message: "Group message stored." }));
    }

    const isBotEnabled = !!(settingsRes.data?.bot_enabled);
    if (!isBotEnabled) {
      console.log("[webhook] Bot is disabled for user, saving message but skipping AI reply.");
      return new Response(JSON.stringify({ ok: true, message: "Bot disabled, message stored." }));
    }
    const bookingUrl = `https://domvere.zlabs.com.br/booking/${cfg.user_id}`;
    const apiUrl = cfg.api_url.replace(/\/$/, "");
    const token = cfg.instance_token;

    let replyText = "";
    let carouselAlreadySent = false;

    // Check trigger responses first (Mensagens Prontas mode)
    if (botMode === "menu" && triggerResponses.length > 0 && text) {
      const lowerText = text.toLowerCase().trim();
      const matched = triggerResponses.find(r => {
        const words = r.trigger_word.toLowerCase().split(",").map(w => w.trim());
        return words.some(w => lowerText === w || lowerText.includes(w));
      });
      if (matched) {
        replyText = matched.response_text;
        console.log("[webhook] Trigger response matched:", matched.trigger_word);
      }
    }

    if (!replyText) {
    if (buttonId.startsWith("PROF_")) {
      const profName = buttonId.replace("PROF_", "");
      replyText = `Ótimo! Escolheu ${profName}. Qual dia e horário você prefere? 😊`;
    } else if (wantsProfessionalCarousel(text || "")) {
      console.log("[webhook] direct carousel intent detected");
      const carouselResult = await handleSendCarousel(apiUrl, token, sender, professionals, bookingUrl);
      if (carouselResult === "CAROUSEL_SENT") {
        carouselAlreadySent = true;
        replyText = "";
      } else {
        replyText = carouselResult;
      }
    } else {
      const slots = await getAvailableSlots(supabase, cfg.user_id, professionals, 7);
      const systemPrompt = buildSystemPrompt(shopName, bookingUrl, professionals, services, slots, customerInfo, stages);
      const aiMessages = [{ role: "system", content: systemPrompt }, ...history.map(m => ({ role: m.from_me ? "assistant" : "user", content: m.text }))];
      
      // Ensure current message is in context if not in history yet
      if (!history.some(m => m.wa_message_id === messageId)) {
        aiMessages.push({ role: "user", content: text || `[Button: ${buttonId}]` });
      }

      const aiResponse = await callAI(aiMessages, [checkAvailabilityTool, appointmentTool, sendCarouselTool]);
      const message = aiResponse.choices?.[0]?.message;

      if (message?.tool_calls?.length > 0) {
        const tc = message.tool_calls[0];
        const args = JSON.parse(tc.function.arguments);
        if (tc.function.name === "check_availability") {
          const dateISO = normalizeDate(args.date);
          const timeHHMM = normalizeTime(args.time);
          console.log("[webhook] check_availability normalized:", { raw: args, dateISO, timeHHMM });
          if (!dateISO || !timeHHMM) {
            replyText = "Não entendi a data/horário. Pode mandar de novo? 😊";
          } else {
            const check = await isSlotAvailable(supabase, cfg.user_id, dateISO, timeHHMM, args.professional_name, professionals);
            console.log("[webhook] check_availability result:", check);
            if (check.available) {
              replyText = `Horário disponível! Quer confirmar ${dateISO} às ${timeHHMM}? 😊`;
            } else if (check.reason === "out_of_schedule") {
              replyText = "Esse horário está fora do expediente. Quer tentar outro? 😊";
            } else if (check.reason === "occupied") {
              replyText = "Esse horário já está ocupado. Quer tentar outro? 😊";
            } else {
              replyText = "Horário indisponível. Quer tentar outro? 😊";
            }
          }
        } else if (tc.function.name === "create_appointment") {
          replyText = await handleToolCall(supabase, cfg.user_id, args, sender, professionals, services);
        } else if (tc.function.name === "send_professional_carousel") {
          const carouselResult = await handleSendCarousel(apiUrl, token, sender, professionals, bookingUrl);
          if (carouselResult === "CAROUSEL_SENT") {
            carouselAlreadySent = true;
            replyText = ""; // não envia texto por cima do carrossel
          } else {
            replyText = carouselResult;
          }
        }
      } else {
        replyText = message?.content || "Como posso ajudar?";
        // Fallback: se a IA está perguntando sobre profissional, dispara carrossel automaticamente
        const askingProf = /profissional|barbeir|com quem|preferência de|prefere atender|qual barbeiro/i.test(replyText);
        const userWantsBooking = /agend|marca|cortar|corte|hor[aá]rio/i.test(text || "");
        if ((askingProf || userWantsBooking) && professionals.length > 0 && !carouselAlreadySent) {
          // envia o texto primeiro
          if (replyText) {
            await sendWhatsappMessage(apiUrl, token, sender, replyText);
            await supabase.from("whatsapp_messages").insert({ user_id: cfg.user_id, wa_chatid: `${sender}${suffix}`, text: replyText, from_me: true, wa_timestamp: Date.now() });
          }
          const carouselResult = await handleSendCarousel(apiUrl, token, sender, professionals, bookingUrl);
          if (carouselResult === "CAROUSEL_SENT") {
            carouselAlreadySent = true;
            replyText = "";
          }
        }
      }
    }
      }

    console.log("[webhook] Sending reply:", { sender, replyText: replyText?.slice(0, 50), carouselAlreadySent });
    if (replyText && !carouselAlreadySent) {
      // Avoid duplicated AI replies for the same messageId
      const { data: existingReply } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("user_id", cfg.user_id)
        .eq("wa_chatid", `${sender}${suffix}`)
        .eq("text", replyText)
        .gt("created_at", new Date(Date.now() - 5000).toISOString())
        .maybeSingle();

      if (existingReply) {
        console.log("[webhook] Preventing duplicate bot reply");
        return new Response(JSON.stringify({ ok: true, ignored: "duplicate_reply" }));
      }

      // Auto-create CRM lead
      try {
        const { data: existingLead } = await supabase.from("crm_leads").select("id").eq("user_id", cfg.user_id).eq("wa_chatid", `${sender}${suffix}`).maybeSingle();
        if (!existingLead) {
          await supabase.from("crm_leads").insert({
            user_id: cfg.user_id,
            wa_chatid: `${sender}${suffix}`,
            phone: sender,
            name: "Novo Lead",
            stage: "novo",
            last_interaction_at: new Date().toISOString(),
          });
        } else {
          await supabase.from("crm_leads").update({ last_interaction_at: new Date().toISOString() }).eq("id", existingLead.id);
        }
      } catch (e) {
        console.warn("[webhook] CRM lead error:", e);
      }

      await sendWhatsappMessage(apiUrl, token, sender, replyText);
      await supabase.from("whatsapp_messages").insert({ user_id: cfg.user_id, wa_chatid: `${sender}${suffix}`, text: replyText, from_me: true, wa_timestamp: Date.now() });
    }

    return new Response(JSON.stringify({ ok: true }));
  } catch (err: any) {
    console.error(err);
    return new Response(err.message, { status: 500 });
  }
});
