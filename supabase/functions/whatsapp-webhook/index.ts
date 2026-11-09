import type {Database} from '../_shared/database-schema.ts';
import type {DatabaseClient} from '../_shared/database-client.ts';
import {slotSelectionId,sendSlotSelection,nativeTimeReply,type SlotSelection} from '../_shared/secretary-slot-selection.ts';
import {secretaryOpening} from '../_shared/secretary-opening.ts';
import {shopLinks} from "../_shared/tenant-links.ts";
import { withTypingPresence } from "../_shared/typing-presence.ts";
import {appointmentThanks} from "../_shared/appointment-messages.ts";
import {completeGroq,TemporaryAIError} from "../_shared/groq-chat.ts";
import { secretaryReply } from "../_shared/human-secretary.ts";
import { notifyManualMessage } from "../_shared/chat-notifications.ts";
import { handleChatEvent } from "../_shared/chat-events.ts";
import { resolveMenuResponse, buildNumericMenu } from "../_shared/trigger-responses.ts";
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
  const selected=slotSelectionId(body);if(selected)return selected;
  const msg = body?.data?.Message || body?.data?.message || body?.message || body;
  const text =
    (msg?.locationMessage ? `${msg.locationMessage.name || "Localização"}\n${msg.locationMessage.address || ""}`.trim() : "") ||
    msg?.extendedTextMessage?.text ||
    msg?.conversation ||
    msg?.content?.text ||
    body?.data?.message?.conversation ||
    body?.data?.message?.extendedTextMessage?.text ||
    body?.wa_text ||
    msg?.wa_text ||
    msg?.text ||
    // Caption from media messages
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    msg?.audioMessage?.caption ||
    // Fallback for button/carousel clicks
    msg?.content?.selectedDisplayText ||
    msg?.selectedDisplayText ||
    msg?.buttonOrListid ||
    "";
  return text.trim();
}

function extractMediaInfo(body: any): { media_url?: string; media_type?: string; media_mimetype?: string } {
  const msg = body?.data?.Message || body?.data?.message || body?.message || body;

  if (msg?.locationMessage) {
    const loc = msg.locationMessage;
    return { media_type: "location", media_url: `https://www.google.com/maps?q=${Number(loc.degreesLatitude)},${Number(loc.degreesLongitude)}` };
  }
  if(msg.pollCreationMessage||msg.pollCreationMessageV2||msg.pollCreationMessageV3)return{media_type:"poll"};
  // Image
  if (msg?.imageMessage) {
    return {
      media_url: msg.imageMessage.url || msg.imageMessage.jpegThumbnail || "",
      media_type: "image",
      media_mimetype: msg.imageMessage.mimetype || "image/jpeg",
    };
  }
  // Video
  if (msg?.videoMessage) {
    return {
      media_url: msg.videoMessage.url || "",
      media_type: "video",
      media_mimetype: msg.videoMessage.mimetype || "video/mp4",
    };
  }
  // Audio (voice note)
  if (msg?.audioMessage || msg?.pttMessage) {
    const audio = msg.audioMessage || msg.pttMessage || {};
    return {
      media_url: audio.url || "",
      media_type: "audio",
      media_mimetype: audio.mimetype || "audio/ogg",
    };
  }
  // Document
  if (msg?.documentMessage) {
    return {
      media_url: msg.documentMessage.url || "",
      media_type: "document",
      media_mimetype: msg.documentMessage.mimetype || "application/octet-stream",
    };
  }
  // Sticker
  if (msg?.stickerMessage) {
    return {
      media_url: msg.stickerMessage.url || "",
      media_type: "sticker",
      media_mimetype: msg.stickerMessage.mimetype || "image/webp",
    };
  }
  return {};
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
  // Outgoing Sender/SenderAlt identify our account, not the recipient.
  // RecipientAlt is the phone-number counterpart of an outgoing LID chat.
  const info = body?.data?.Info || body?.event || {};
  const alternatives = isFromMe(body)
    ? [info.RecipientAlt, info.DeviceSentMeta?.DestinationJID, key.remoteJidAlt]
    : [info.SenderAlt, key.remoteJidAlt];
  const peer = String(remoteJid);
  if (peer.endsWith("@lid")) {
    const phone = alternatives.find(value => /^\d+(?::\d+)?@s\.whatsapp\.net$/.test(String(value || "")));
    if (phone) return String(phone).replace(/:\d+@/, "@");
    return peer;
  }
  return peer.replace(/:\d+@/, "@");
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

async function findWhatsappConfig(supabase: DatabaseClient, payloadToken: string, requestUrl: string, _ownerNumber = "") {
  let urlUserId = "";
  try {
    const url = new URL(requestUrl);
    urlUserId = url.searchParams.get("user_id") || "";
    if (urlUserId.includes("/")) {
      urlUserId = urlUserId.split("/")[0];
    }
  } catch (e) {
    console.error("[webhook] invalid request URL");
  }

  const hookSecret = new URL(requestUrl).searchParams.get("hook_token") || "";
  const authorized = (config:any) => !!config && ((payloadToken && [config.instance_token,config.instance_token?.split(":").pop()].includes(payloadToken)) || (config.webhook_secret && hookSecret === config.webhook_secret));

  if (payloadToken) {
    const { data: byToken, error: tokenErr } = await supabase
      .from("whatsapp_config")
      .select("api_url, instance_token, user_id, webhook_secret, secretary_queue_enabled")
      .eq("instance_token", payloadToken)
      .limit(10);
    if (tokenErr) console.error("[webhook] config lookup by token error:", tokenErr.message);
    if (byToken?.length === 1 && authorized(byToken[0])) return byToken[0];
  }

  if (urlUserId) {
    const { data, error } = await supabase
      .from("whatsapp_config")
      .select("api_url, instance_token, user_id, webhook_secret, secretary_queue_enabled")
      .eq("user_id", urlUserId)
      .maybeSingle();
    if (error) console.error("[webhook] config lookup by user_id error:", error.message);
    if (authorized(data)) return data;
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
  const m = s.match(/^(\d{1,2})[:h.]?(\d{0,2})(?::\d{1,2})?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (isNaN(h) || h < 0 || h > 23 || isNaN(min) || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Check availability directly against the DB (schedule range + appointment overlap)
async function isSlotAvailable(
  supabase: DatabaseClient,
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

  const profsWithSchedule = new Set((schedRows || []).map((r) => r.professional_id));
  const todaySched = (schedRows || []).filter((r) => r.day_of_week === dow);

  // Fallback default schedule for professionals without any registered schedule
  // (mon-sat 08:00-18:00, matching DB defaults)
  const DEFAULT_START = 8 * 60;
  const DEFAULT_END = 18 * 60;
  const isWorkDayDefault = dow >= 1 && dow <= 6;

  const candidateProfs: string[] = [];
  for (const profId of profIds) {
    if (profsWithSchedule.has(profId)) {
      const ok = todaySched.some((r) => {
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
    const conflict = (appts || []).some((a) => {
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
  supabase: DatabaseClient,
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
    if (!r.active||!r.professional_id) continue;
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
    if(!a.professional_id)continue;
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
  const db=createClient<Database>(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return completeGroq(messages,tools,Deno.env.get("GROQ_API_KEY")||"",Deno.env.get("GROQ_CHAT_MODEL")||"openai/gpt-oss-120b",fetch,async()=>{
    const {data,error}=await db.rpc("reserve_secretary_groq_call");
    if(error)throw new TemporaryAIError();
    if(data>0)await new Promise(resolve=>setTimeout(resolve,data));
  });
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
    const year = today.getUTCFullYear();
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
Informal, simpática, natural. Frases curtas.
DATA ATUAL: ${todayStr}.
NOME DA BARBEARIA: ${shopName} (mencione quando a etapa pedir).
${customerBlock}${stagesBlock}
SERVIÇOS:
${svcList}
PROFISSIONAIS:
${profList}
${availability}LINK: ${bookingUrl}

🪜 *FLUXO DA CONVERSA (siga naturalmente, um passo por vez):*
1. CUMPRIMENTE o cliente com uma saudação calorosa. Pergunte como pode ajudar.
2. ESCUTE o que ele precisa. Deixe o cliente falar primeiro.
3. Se o cliente quiser agendar, pergunte o serviço desejado e informe os profissionais disponíveis.
4. Só use check_availability ou create_appointment quando tiver TODOS os dados (profissional, serviço, data, horário).
5. Se ele perguntar valores, responda com os preços.
6. Seja breve: 2-3 frases, no máximo 1 emoji.
7. Ao finalizar, pergunte se precisa de mais algo.
8. Use formato YYYY-MM-DD e HH:MM ao chamar ferramentas.
9. Se o cliente já for cadastrado, trate pelo nome e NÃO peça cadastro novamente.`;
}

async function handleToolCall(supabase: DatabaseClient, userId: string, args: any, senderPhone: string, professionals: any[], services: any[], templateConfigs?: any[]): Promise<string> {
  const prof = professionals.find(p => p.name.toLowerCase() === (args.professional_name || "").toLowerCase());
  if (!prof) return "Profissional não encontrado.";
  const svc = services.find(s => s.name.toLowerCase() === (args.service_name || "").toLowerCase()) || services[0];
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
    if(!nCust)throw Error('Não foi possível criar o cadastro do cliente.');customerId = nCust.id;
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
    "apikey": token.split(":").pop()!,
    "token":token,
    "User-Agent":"Mozilla/5.0",
  };
  const body = { number, text };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[sendWhatsappMessage] Delivery failed",res.status);
    throw new Error(`WhatsApp API error: ${res.status}`);
  }
  return await res.json().catch(() => ({}));
}

const checkAvailabilityTool = { type: "function", function: { name: "check_availability", parameters: { type: "object", properties: { date: { type: "string" }, time: { type: "string" }, professional_name: { type: "string" } }, required: ["date", "time"] } } };
const appointmentTool = { type: "function", function: { name: "create_appointment", parameters: { type: "object", properties: { date: { type: "string" }, time: { type: "string" }, professional_name: { type: "string" }, service_name: { type: "string" } }, required: ["date", "time", "professional_name"] } } };

Deno.serve(async (req) => {
  console.log("[webhook] Request received:", req.method);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response("Online");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    let body = await req.json();
    let queueJob:any=null;
    const queueId=req.headers.get("x-secretary-queue-id"),queueLease=req.headers.get("x-secretary-queue-lease");
    if(queueId&&!queueLease)return new Response("Missing queue lease",{status:401});
    if(queueId){
      if(req.headers.get("authorization")!==`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`)return new Response("Unauthorized queue",{status:401});
      const db=createClient<Database>(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const {data,error}=await db.from("secretary_queue").select("id,user_id,payload,delivery_started").eq("id",queueId).eq("lease_token",queueLease||'').eq("state","processing").gt("locked_until",new Date().toISOString()).maybeSingle();
      if(error||!data||data.delivery_started)return new Response("Invalid queue lease",{status:409});
      queueJob=data;body=data.payload;
    }
    console.log("[webhook] Body keys:", Object.keys(body));
    // Do not log message contents or provider tokens.


    const eventType = extractEventType(body, req.url);
    console.log("[webhook] EventType:", eventType);
    
    // Groups are excluded before storage, CRM, notifications or bot processing.
    if (isGroupMessage(body)) return new Response(JSON.stringify({ok:true,ignored:"group"}));
    const peerChat=body.data?.Info?.Chat||body.data?.Chat||body.key?.remoteJid||body.data?.key?.remoteJid||body.remoteJid;
    if(typeof peerChat==="string"&&peerChat.includes("@")&&!peerChat.endsWith("@s.whatsapp.net")&&!peerChat.endsWith("@lid")) return new Response(JSON.stringify({ok:true,ignored:"non_individual"}));
    const evtData=body.data || (typeof body.event === "object" ? body.event : body);
    const evtMessage=evtData.Message||evtData.message||body.message||{};
    if (["receipt","status_update","messages.update","messages_update","chatpresence","historysync"].includes(eventType) || evtMessage.reactionMessage || evtMessage.protocolMessage || evtMessage.pollUpdateMessage) {
      const db=createClient<Database>(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const config=await findWhatsappConfig(db,extractPayloadToken(body),req.url);
      if(config) await handleChatEvent(db,config.user_id,body,eventType);
      return new Response(JSON.stringify({ok:true,processed:"chat_event"}));
    }
    // Whitelist event types - extended to be more permissive
    const allowedEvents = ["messages", "message", "messages.upsert", "message.upsert", "text_message", "message.text"];
    if (eventType === "status_update") return new Response(JSON.stringify({ ok: true, ignored: "status_update" }));
    
    if (eventType && !allowedEvents.includes(eventType)) {
      console.log("[webhook] Ignored event type:", eventType);
      return new Response(JSON.stringify({ ok: true, ignored: "event_type", type: eventType }));
    }

    const text = extractMessageText(body);
    let peer = extractSender(body);
    const messageId = extractMessageId(body);
    const isMe = isFromMe(body);

    console.log("[webhook] Parsed message:", { hasId:!!messageId, fromMe:isMe });

    if (!messageId && !text) {
      console.log("[webhook] No message ID and no text, ignoring.");
      return new Response(JSON.stringify({ ok: true, ignored: "no_data" }));
    }

    const payloadToken = extractPayloadToken(body);
    const buttonId = extractButtonId(body);

    const supabase = createClient<Database>(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cfg = queueJob?(await supabase.from("whatsapp_config").select("api_url,instance_token,user_id,secretary_queue_enabled").eq("user_id",queueJob.user_id).maybeSingle()).data:await findWhatsappConfig(supabase, payloadToken, req.url);
    if (!cfg) return new Response(JSON.stringify({ error: "Unauthorized webhook" }),{status:401});

    const apiUrl = cfg.api_url.replace(/\/$/, "");
    const [{data:operational,error:operationalError},{data:licensedTier,error:tierError}]=await Promise.all([supabase.rpc('tenant_operational_access',{p_owner:cfg.user_id}),supabase.rpc('tenant_effective_tier',{p_owner:cfg.user_id})]);
    if(operationalError||tierError)throw new Error('Falha ao validar licença do atendimento');
    if(!operational||licensedTier!=='premium')return new Response(JSON.stringify({ok:true,ignored:'tenant_access_blocked'}));
    const token = cfg.instance_token;
    if (peer.endsWith("@lid")) {
      const { data: mapping } = await supabase.from("whatsapp_lid_phone_map").select("phone").eq("lid", normalizeWaNumber(peer)).maybeSingle();
      if (mapping?.phone) peer = `${mapping.phone}@s.whatsapp.net`;
    }
    const unresolvedLid = peer.endsWith("@lid");
    const sender = normalizeWaNumber(peer);
    const suffix = unresolvedLid ? "@lid" : "@s.whatsapp.net";
    const links=await shopLinks(supabase,cfg.user_id);
    const bookingUrl=links.booking;

    if(cfg.secretary_queue_enabled&&!queueJob&&!isMe&&!unresolvedLid&&messageId){
      const {data,error}=await supabase.rpc("enqueue_secretary_message",{p_owner:cfg.user_id,p_chat:`${sender}${suffix}`,p_message_id:messageId,p_payload:JSON.parse(JSON.stringify(body,(key,value)=>(["token","apikey","api_key","instance_token","instanceid","authorization"].includes(key.toLowerCase())||(key==="instance"&&typeof value==="string"))?undefined:value))});
      if(error)throw error;
      return new Response(JSON.stringify({ok:true,queued:!!data}));
    }
    const markDelivery = async()=>{
      if(!queueJob)return;
      const {data,error}=await supabase.from("secretary_queue").update({delivery_started:true}).eq("id",queueJob.id).eq("lease_token",queueLease||'').eq("state","processing").gt("locked_until",new Date().toISOString()).select("id").maybeSingle();
      if(error||!data)throw new Error("Queue lease lost before delivery");
    };

    // Persistent deduplication using DB
    const { data: existingMsg } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("user_id", cfg.user_id)
      .eq("wa_message_id", messageId)
      .maybeSingle();

    if (existingMsg && !queueJob) {
      console.log("[webhook] Duplicate message detected (DB):", messageId);
      return new Response(JSON.stringify({ ok: true, ignored: "duplicate" }));
    }

    const isGroup = isGroupMessage(body);
    const pushName = extractPushName(body);
    const mediaInfo = extractMediaInfo(body);
    const rawContent=body.data?.Message||body.data?.message||body.message||{};
    const displayedText=slotSelectionId(body)?String(rawContent.listResponseMessage?.title||rawContent.buttonsResponseMessage?.selectedDisplayText||'Horário selecionado').slice(0,120):text;
    const isViewOnce=!!(body.data?.IsViewOnce||rawContent.viewOnceMessage||rawContent.viewOnceMessageV2||rawContent.viewOnceMessageV2Extension);
    if(isViewOnce){mediaInfo.media_type="view_once";mediaInfo.media_url="";}
    const quotedContext=(rawContent.extendedTextMessage||rawContent.imageMessage||rawContent.videoMessage||rawContent.audioMessage||rawContent.documentMessage)?.contextInfo;
    const quotedMessage=quotedContext?.quotedMessage;

    // Save inbound/outbound message immediately to prevent race conditions
    const { error: incomingError } = existingMsg ? {error:null} : await supabase.from("whatsapp_messages").insert({
      user_id: cfg.user_id,
      wa_chatid: `${sender}${suffix}`,
      wa_message_id: messageId,
      text: isViewOnce ? "Conteúdo de visualização única. Abra no WhatsApp oficial da barbearia." : mediaInfo.media_type === "poll" ? (()=>{const msg=body.data?.Message||body.data?.message||body.message;const poll=msg?.pollCreationMessage||msg?.pollCreationMessageV2||msg?.pollCreationMessageV3;return [poll?.name,...(poll?.options||[]).map((o:any)=>o.optionName)].filter(Boolean).join("\n");})() : displayedText || (buttonId ? `[Button: ${buttonId}]` : ""),
      from_me: isMe,
      wa_timestamp: extractMessageTimestamp(body),
      push_name: isMe ? "Você" : pushName || null,
      media_url: mediaInfo.media_url || null,
      media_type: mediaInfo.media_type || null,
      media_mimetype: mediaInfo.media_mimetype || null,
      delivery_status: isMe ? "sent" : null,
      media_payload: mediaInfo.media_type && !isViewOnce && mediaInfo.media_type !== "location" ? (body.data?.Message || body.data?.message || body.message) : null,
      media_filename: (body.data?.Message || body.data?.message || body.message)?.documentMessage?.fileName || null,
      quoted_message_id: quotedContext?.stanzaId || null,
      quoted_text: quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || quotedMessage?.imageMessage?.caption || (quotedMessage ? "Arquivo citado" : null),
    });

    if (incomingError?.code === "23505") {
      return new Response(JSON.stringify({ ok: true, ignored: "duplicate" }));
    }
    if (incomingError) throw incomingError;
    // Preserve unknown LIDs for reconciliation; never send bot replies to a guessed phone.
    if (unresolvedLid) return new Response(JSON.stringify({ok:true,skipped:"pending_phone_mapping"}));
    if (isMe) {
      const { error } = await supabase.rpc("ensure_whatsapp_lead", {p_user_id:cfg.user_id,p_chat:`${sender}${suffix}`,p_phone:sender});
      if (error) throw error;
      return new Response(JSON.stringify({ok:true,message:"Outbound message stored."}));
    }
    const chatId = `${sender}${suffix}`;
    const contactBotEnabled = async () => {
      const { data, error } = await supabase.from("crm_leads")
        .select("bot_enabled_when_global_off,bot_paused")
        .eq("user_id", cfg.user_id).eq("wa_chatid", chatId).maybeSingle();
      if (error) throw error;
      return data?.bot_enabled_when_global_off === true && !data.bot_paused;
    };
    let manualPaused=false;
    if(!isMe){
      const {data:currentLead,error:currentLeadError}=await supabase.rpc("ensure_whatsapp_lead",{p_user_id:cfg.user_id,p_chat:`${sender}${suffix}`,p_phone:sender});
      if(currentLeadError)throw currentLeadError;
      try { await notifyManualMessage(supabase,cfg.user_id,`${sender}${suffix}`,displayedText,isMe); } catch { console.warn("[webhook] Manual chat notification unavailable"); }
      if(currentLead?.[0]?.bot_paused){
        const {data:closed}=await supabase.from("crm_leads").select("manual_finished_at").eq("user_id",cfg.user_id).eq("wa_chatid",`${sender}${suffix}`).maybeSingle();
        if(closed?.manual_finished_at)await supabase.from("crm_leads").update({manual_finished_at:null,manual_started_at:null,assigned_staff_id:null}).eq("user_id",cfg.user_id).eq("wa_chatid",`${sender}${suffix}`);
      }
      manualPaused=!!currentLead?.[0]?.bot_paused;
    }
    if(isViewOnce) return new Response(JSON.stringify({ok:true,skipped:"view_once"}));
    if(mediaInfo.media_type === "poll") return new Response(JSON.stringify({ok:true,skipped:"poll"}));


    // ─── Reminder confirmation: SIM / NÃO (always check, even if bot disabled) ──
    let replyText = "";
    let locationReply: any = null;
    let slotSelection: SlotSelection | null = null;
    let handoffRequested = false;
    const lowerText = (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^a-z0-9]/g, "");
    const isSim = ["sim", "s", "1", "ok", "yes", "confirmo", "confirmar", "quero", "claro", "pode", "podesim", "podeconfirmar", "simpodeconfirmar", "confirmado", "taconfirmado", "estaconfirmado", "comcerteza"].includes(lowerText);
    const isNao = ["nao", "não", "n", "2", "no", "cancelar", "cancelo", "podecancelar", "naopossovir", "naovoupoder"].includes(lowerText);
    let secretaryPending=false;
    if((isSim||isNao)&&!manualPaused){
      const[{data:pending},{data:mode}]=await Promise.all([supabase.from("secretary_memory").select("pending,pending_at,awaiting_reminder").eq("user_id",cfg.user_id).eq("chat",`${sender}${suffix}`).maybeSingle(),supabase.from("settings").select("bot_mode,bot_enabled").eq("user_id",cfg.user_id).maybeSingle()]);
      secretaryPending=!!(pending?.awaiting_reminder||(pending?.pending&&new Date(pending.pending_at||'').getTime()>Date.now()-15*60000))&&mode?.bot_mode==='ai'&&(mode.bot_enabled===true||await contactBotEnabled());
    }
    if (!secretaryPending && (isSim || isNao) && lowerText.length <= 35) {
      const {data:pendingLead,error:confirmationError}=await supabase.rpc('respond_whatsapp_reminder',{p_owner:cfg.user_id,p_chat:`${sender}${suffix}`,p_confirm:isSim});
      if(confirmationError)throw confirmationError;
      if (pendingLead) {
        if(typeof pendingLead!=='object'||Array.isArray(pendingLead)||typeof pendingLead.name!=='string')throw Error('Confirmação inválida do lembrete.');replyText=appointmentThanks(pendingLead.name,isSim);

        await markDelivery();
        const sentReminder = await sendWhatsappMessage(apiUrl, token, sender, replyText);
        const reminderMessageId = sentReminder?.data?.Info?.ID || sentReminder?.data?.key?.id || sentReminder?.key?.id || sentReminder?.messageid || sentReminder?.id || null;
        await supabase.from("whatsapp_messages").insert({ wa_message_id: reminderMessageId, user_id: cfg.user_id, wa_chatid: `${sender}${suffix}`, text: replyText, msg_type: "bot", from_me: true, wa_timestamp: Date.now() });
        return new Response(JSON.stringify({ ok: true, handled: "reminder_confirmation", confirmed: isSim }));
      }
    }
    if(manualPaused)return new Response(JSON.stringify({ok:true,skipped:"manual_service"}));
    // ─── Fim reminder confirmation ──────────────────────────────────────
    const phoneDigits = sender.replace(/\D/g, "");
    const [settingsRes, profsRes, servsRes, historyRes, stagesRes, customerRes, responsesRes] = await Promise.all([
      supabase.from("settings").select("*").eq("user_id", cfg.user_id).maybeSingle(),
      supabase.from("professionals").select("*").eq("user_id", cfg.user_id).eq("active", true),
      supabase.from("services").select("*").eq("user_id", cfg.user_id).eq("active", true),
      supabase.from("whatsapp_messages").select("text,from_me,wa_message_id,wa_timestamp").eq("user_id", cfg.user_id).eq("wa_chatid", `${sender}${suffix}`).order("wa_timestamp", { ascending: false }).limit(24),
      supabase.from("bot_conversation_stages").select("name, instruction, stage_order, skip_if_registered").eq("user_id", cfg.user_id).eq("active", true).order("stage_order"),
      supabase.from("customers").select("id, name, birth_date, phone").eq("user_id", cfg.user_id).ilike("phone", `%${phoneDigits.slice(-8)}%`).maybeSingle(),
      supabase.from("bot_trigger_responses").select("trigger_word, response_text, active").eq("user_id", cfg.user_id).eq("active", true),
    ]);

    const shopName = settingsRes.data?.shop_name || "Barbearia";
    const professionals = profsRes.data || [];
    const services = servsRes.data || [];
    const history = (historyRes.data || []).reverse();
    const stages = stagesRes.data || [];
    const customerInfo = customerRes.data || null;
    const botMode = (settingsRes.data)?.bot_mode || "ai";
    const triggerResponses = (responsesRes?.data || []) as Array<{ trigger_word: string; response_text: string; active: boolean }>;

    if (isMe) {
      console.log("[webhook] Message is from me, saving but skipping AI reply.");
      return new Response(JSON.stringify({ ok: true, message: "Outbound message stored." }));
    }

    if (isGroup) {
      console.log("[webhook] Message is in a group, saving but skipping AI reply.");
      return new Response(JSON.stringify({ ok: true, message: "Group message stored." }));
    }

    const isBotEnabled = settingsRes.data?.bot_enabled === true || await contactBotEnabled();
    if (!isBotEnabled) {
      console.log("[webhook] Bot is disabled for user, saving message but skipping AI reply.");
      return new Response(JSON.stringify({ ok: true, message: "Bot disabled, message stored." }));
    }

    const msgTimestamp = extractMessageTimestamp(body);
    const isStale = (Date.now() - msgTimestamp) > 90 * 1000;
    if (isStale && !queueJob) {
      console.log("[webhook] Message is stale (>90s old), stored but skipping bot reply:", messageId);
      return new Response(JSON.stringify({ ok: true, ignored: "stale_message" }));
    }

    const cleanLower = (text || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[!.,?]/g, "").trim();
    const isGreetingOnly = /^(oi+|ola+|oie+|bom dia|boa tarde|boa noite|e ai|opa|hello|hi)$/i.test(cleanLower);

    if (isGreetingOnly) {
      const lastIncoming = (history || []).filter(m => !m.from_me).at(-1);
      const lastIncomingIsContent = lastIncoming && !/^(oi+|ola+|oie+|bom dia|boa tarde|boa noite|e ai|opa|hello|hi)$/i.test(
        (lastIncoming.text || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[!.,?]/g, "").trim()
      );
      if (lastIncomingIsContent && (Date.now() - Number(lastIncoming.wa_timestamp || 0)) < 20000) {
        console.log("[webhook] Greeting superseded by recent content message, skipping separate greeting:", messageId);
        return new Response(JSON.stringify({ ok: true, ignored: "greeting_superseded" }));
      }
    }
    
    // Check trigger responses (Mensagens Prontas mode)
    if (botMode === "menu" && triggerResponses.length > 0 && text) {
      const matched = resolveMenuResponse(text, triggerResponses);
      if (matched) {
        handoffRequested = /\b(atendente|humano)\b/i.test(matched.trigger_word);
        const rawText = matched.response_text;
        const locMatch = rawText.match(/^\[LOCATION\](\{.*\})/);
        if (locMatch) {
          locationReply = JSON.parse(locMatch[1]);
          const lat = Number(locationReply.lat), lng = Number(locationReply.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            throw new Error("Coordenadas inválidas na regra de endereço");
          }
          locationReply.lat = lat; locationReply.lng = lng;
        } else {
          replyText = rawText;
        }
        console.log("[webhook] Trigger response matched:", matched.trigger_word);
      }
    }

    if (!replyText && !locationReply) {
      // If in menu mode and no trigger matched, send menu message
      if (botMode === "menu") {
        replyText = buildNumericMenu(triggerResponses);
      } else
    {try {
      const{data:away}=await supabase.from("whatsapp_shop_tools").select("away_enabled,away_message").eq("user_id",cfg.user_id).maybeSingle();
      if(away?.away_enabled&&away.away_message?.trim())replyText=away.away_message.trim();else{
      const result=await withTypingPresence(apiUrl,token,sender,()=>secretaryReply({db:supabase,owner:cfg.user_id,chat:`${sender}${suffix}`,phone:sender,text:text||`[Button: ${buttonId}]`,settings:{...(settingsRes.data||{}),booking_url:bookingUrl},professionals,services,history},callAI),result=>result.text||" ");
      const display=nativeTimeReply(result,Deno.env.get('WHATSAPP_NATIVE_TIME_OPTIONS')==='true');replyText=display.text;slotSelection=display.slotSelection||null;handoffRequested=!!result.handoff;}
    }catch(error){
      if(error instanceof TemporaryAIError){if(queueJob)throw error;replyText=`Estou com uma instabilidade temporária na conversa. Você pode escolher seu serviço e horário por aqui: ${bookingUrl}. Se preferir, me envie sua mensagem novamente em instantes.`;handoffRequested=false;}
      else{console.warn("[secretary] Operation failed",error instanceof Error?error.message:"unknown");replyText="Estou com dificuldade para consultar o sistema agora. Vou chamar um atendente para te ajudar.";handoffRequested=true;}
    }}


    }

    console.log("[webhook] Reply prepared");
    // Persisted Business messages share the same outgoing response; no extra duplicate sends.
    if (!isMe && !isGroup && !handoffRequested && (replyText || locationReply)) {
      const {data:tools}=await supabase.from("whatsapp_shop_tools").select("greeting,greeting_enabled,away_message,away_enabled").eq("user_id",cfg.user_id).maybeSingle();
      if(tools?.away_enabled && tools.away_message?.trim()){replyText=tools.away_message.trim();locationReply=null;slotSelection=null;}
      else if(tools?.greeting_enabled && tools.greeting?.trim() && !history.some((m)=>m.from_me)) replyText=tools.greeting.trim()+(replyText?"\n\n"+replyText:"");
    }
    let opening:any=null;
    if(!isMe&&!isGroup&&(replyText||locationReply)){
      const {data:openingMemory,error:openingError}=await supabase.from('secretary_memory').select('introduction_at,introduction_identity,customer_name').eq('user_id',cfg.user_id).eq('chat',`${sender}${suffix}`).maybeSingle();
      if(openingError)throw openingError;
      opening=secretaryOpening({text,reply:replyText||(locationReply?'Vou te enviar a localização da barbearia.':''),settings:settingsRes.data||{},customerName:customerInfo?.name||openingMemory?.customer_name||'',history,memory:openingMemory});
      if(!locationReply)replyText=opening.text;
    }
    if (replyText || locationReply) {
      const storedReplyText = locationReply ? `${locationReply.name || "Localização"}\n${locationReply.address || ""}`.trim() : slotSelection ? replyText+"\n\n"+slotSelection.fallbackText : replyText;
      // Avoid duplicated AI replies for the same messageId
      const { data: existingReply } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("user_id", cfg.user_id)
        .eq("wa_chatid", `${sender}${suffix}`)
        .eq("text", storedReplyText)
        .eq("from_me", true)
        .gt("created_at", new Date(Date.now() - 5000).toISOString())
        .maybeSingle();

      if (existingReply && !slotSelection) {
        console.log("[webhook] Preventing duplicate bot reply");
        return new Response(JSON.stringify({ ok: true, ignored: "duplicate_reply" }));
      }

      // Check if bot is paused for this lead
      let botPaused = false;
      const { data: leadRows, error: leadError } = await supabase.rpc("ensure_whatsapp_lead", {
        p_user_id: cfg.user_id, p_chat: `${sender}${suffix}`, p_phone: sender,
      });
      if (leadError) throw leadError;
      botPaused = !!leadRows?.[0]?.bot_paused;

      // If bot is paused for this lead, do not respond
      if (botPaused) {
        console.log("[webhook] Bot paused for lead, skipping response");
        return new Response(JSON.stringify({ ok: true, ignored: "bot_paused" }));
      }

      if (settingsRes.data?.bot_enabled !== true && !await contactBotEnabled()) {
        return new Response(JSON.stringify({ ok: true, ignored: "contact_bot_disabled" }));
      }

      if (isGreetingOnly) {
        const { data: newerIncoming } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("user_id", cfg.user_id)
          .eq("wa_chatid", `${sender}${suffix}`)
          .eq("from_me", false)
          .gt("created_at", new Date(Date.now() - 10000).toISOString())
          .neq("wa_message_id", messageId)
          .limit(1);

        if (newerIncoming && newerIncoming.length > 0) {
          console.log("[webhook] Discarding greeting reply because client already sent another message:", messageId);
          return new Response(JSON.stringify({ ok: true, ignored: "greeting_discarded_newer_arrived" }));
        }
      }

      let sent: any;
      const replyStartedAt=Date.now();
      if (locationReply) {
        await markDelivery();
        if(opening?.introduced)await sendWhatsappMessage(apiUrl,token,sender,opening.text);
        const res = await fetch(`${apiUrl}/send/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": token },
          body: JSON.stringify({ number: sender, name: locationReply.name || "Localização", address: locationReply.address || "", latitude: locationReply.lat, longitude: locationReply.lng }),
        });
        if (!res.ok) throw new Error(`WhatsApp location API error: ${res.status}`);
        sent = await res.json().catch(() => ({}));
      } else {
        await markDelivery();
        sent = slotSelection ? await sendSlotSelection(apiUrl,token,sender,replyText,slotSelection,fallback=>sendWhatsappMessage(apiUrl,token,sender,fallback)) : await sendWhatsappMessage(apiUrl, token, sender, replyText);
      }
      const sentId = sent?.data?.Info?.ID || sent?.data?.key?.id || sent?.key?.id || sent?.messageid || sent?.id || null;
      const { error: outgoingError } = await supabase.from("whatsapp_messages").insert({
        user_id: cfg.user_id, wa_chatid: `${sender}${suffix}`, wa_message_id: sentId,
        text: storedReplyText, msg_type: "bot", from_me: true, wa_timestamp: Date.now(),
        ...(locationReply ? { media_type: "location", media_url: `https://www.google.com/maps?q=${locationReply.lat},${locationReply.lng}` } : {}),
      });
      if (outgoingError && outgoingError.code !== "23505") throw outgoingError;
      if(sentId)await supabase.from("whatsapp_messages").update({msg_type:"bot"}).eq("user_id",cfg.user_id).eq("wa_message_id",sentId);
      if(opening?.introduced){
        const {error:identityError}=await supabase.from('secretary_memory').upsert({user_id:cfg.user_id,chat:`${sender}${suffix}`,phone:sender,introduction_at:new Date(replyStartedAt).toISOString(),introduction_identity:opening.identity},{onConflict:'user_id,chat'});
        // Delivery already succeeded. Never retry the message because an identity marker failed.
        if(identityError)console.warn('[secretary] Introduction marker unavailable');
      }
      if (handoffRequested) {
        const { error: pauseError } = await supabase.from("crm_leads")
          .update({ bot_paused: true, manual_started_at: null, manual_finished_at: null, assigned_staff_id: null, last_interaction_at: new Date().toISOString() })
          .eq("user_id", cfg.user_id).eq("wa_chatid", `${sender}${suffix}`);
        if (pauseError) throw pauseError;
        // Notificar somente dispositivos da equipe; nunca os clientes.
        try {
          const { data: staff } = await supabase.from("profiles").select("id")
            .eq("owner_id", cfg.user_id).eq("role", "profissional").eq("active", true);
          const recipients = [...new Set([cfg.user_id, ...(staff || []).map((profile) => profile.id)])];
          for (const recipient of recipients) {
          const serviceUrl = `${recipient === cfg.user_id ? links.panel+"/whatsapp" : links.professional+"/barber-panel"}?chat=${encodeURIComponent(sender + suffix)}`;
          await supabase.from("client_notifications").insert({ user_id: recipient, customer_id: null,
            title: "Cliente precisa de atendimento", body: "Um cliente escolheu falar com atendente no WhatsApp.", url: serviceUrl });
          const push = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({ user_id: recipient, title: "Cliente precisa de atendimento", body: "Um cliente escolheu falar com atendente no WhatsApp. Abra a fila de espera para atender.", url: serviceUrl }),
          });
          if (!push.ok) console.warn("[webhook] Staff push unavailable:", push.status);
          }
        } catch { console.warn("[webhook] Staff push unavailable; request remains in queue"); }
      }


    }

    return new Response(JSON.stringify({ ok: true }));
  } catch (err: unknown) {
    if(err instanceof TemporaryAIError)return new Response("AI retry scheduled",{status:503,headers:{"Retry-After":String((typeof err === 'object' && err !== null && 'retryAfterSeconds' in err ? err.retryAfterSeconds : undefined))}});
    console.error("[webhook] Processing failed");
    return new Response("Message processing failed", { status: 500 });
  }
});
