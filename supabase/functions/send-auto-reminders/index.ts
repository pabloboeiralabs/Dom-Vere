// Edge function: scans active customer plans and sends WhatsApp reminders
// for return (next service) and expiry, 1 day before each event.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function normalizePhone(raw: string) {
  const cleaned = (raw || "").replace(/\D/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
}

async function sendUazapi(apiUrl: string, token: string, number: string, text: string) {
  const url = `${apiUrl.replace(/\/$/, "")}/send/text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`uazapi ${res.status}: ${body.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYmd = ymd(tomorrow);

  const summary: any = { processed: 0, sent: 0, skipped: 0, errors: [] as string[] };

  try {
    // Get all users with auto_reminder_enabled and a connected whatsapp_config
    const { data: settingsRows, error: setErr } = await supabase
      .from("settings")
      .select("user_id, shop_name, auto_reminder_enabled, auto_reminder_return_template, auto_reminder_expiry_template")
      .eq("auto_reminder_enabled", true);
    if (setErr) throw setErr;

    for (const s of settingsRows || []) {
      const userId = (s as any).user_id;
      const shopName = (s as any).shop_name || "nossa barbearia";
      const returnTpl = (s as any).auto_reminder_return_template || "";
      const expiryTpl = (s as any).auto_reminder_expiry_template || "";

      const { data: cfg } = await supabase
        .from("whatsapp_config")
        .select("api_url, instance_token")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cfg?.instance_token || !cfg?.api_url) {
        summary.skipped++;
        continue;
      }

      // Fetch active customer plans + customer info + plan validity
      const { data: plans, error: plansErr } = await supabase
        .from("customer_plans")
        .select("id, starts_at, expires_at, usage_limit, customer_id, plan_id, customers!inner(id, name, phone, credit_balance), plans!inner(name, validity_days)")
        .eq("user_id", userId)
        .eq("active", true);
      if (plansErr) {
        summary.errors.push(`user ${userId}: ${plansErr.message}`);
        continue;
      }

      for (const row of (plans as any[]) || []) {
        summary.processed++;

        const customer = row.customers || {};
        const plan = row.plans || {};
        if (!customer.phone) continue;
        const phone = normalizePhone(customer.phone);
        if (!phone) continue;

        // Get last usage
        const { data: lastUsage } = await supabase
          .from("plan_usage_records")
          .select("created_at")
          .eq("customer_plan_id", row.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Compute return date (same logic as Expirations.tsx)
        const validityDays = Number(plan.validity_days) || 30;
        const usageLimit = Number(row.usage_limit) || 1;
        const intervalDays = Math.max(1, Math.floor(validityDays / Math.max(1, usageLimit)));
        const baseStr: string | null = lastUsage?.created_at || row.starts_at;
        const baseDate = baseStr ? new Date(baseStr) : new Date();
        const returnDate = new Date(baseDate);
        returnDate.setDate(returnDate.getDate() + intervalDays);
        returnDate.setHours(0, 0, 0, 0);

        const expiresAt = new Date(row.expires_at);
        expiresAt.setHours(0, 0, 0, 0);

        const reminders: { type: string; tpl: string; eventDate: Date }[] = [];
        if (returnTpl && ymd(returnDate) === tomorrowYmd) {
          reminders.push({ type: "return", tpl: returnTpl, eventDate: returnDate });
        }
        if (expiryTpl && ymd(expiresAt) === tomorrowYmd) {
          reminders.push({ type: "expiry", tpl: expiryTpl, eventDate: expiresAt });
        }

        for (const rem of reminders) {
          // Check if already sent
          const { data: existing } = await supabase
            .from("reminder_logs")
            .select("id")
            .eq("customer_plan_id", row.id)
            .eq("reminder_type", rem.type)
            .eq("reminder_for", ymd(rem.eventDate))
            .maybeSingle();
          if (existing) continue;

          const text = rem.tpl
            .replace(/\{nome\}/g, customer.name || "")
            .replace(/\{barbearia\}/g, shopName)
            .replace(/\{data_retorno\}/g, fmtDate(returnDate))
            .replace(/\{data_vencimento\}/g, fmtDate(expiresAt))
            .replace(/\{creditos\}/g, String(customer.credit_balance ?? ""));

          try {
            await sendUazapi(cfg.api_url, cfg.instance_token, phone, text);
            await supabase.from("reminder_logs").insert({
              user_id: userId,
              customer_id: customer.id,
              customer_plan_id: row.id,
              reminder_type: rem.type,
              reminder_for: ymd(rem.eventDate),
            });
            summary.sent++;
          } catch (e: any) {
            summary.errors.push(`user ${userId} customer ${customer.id}: ${e.message}`);
          }
        }
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
