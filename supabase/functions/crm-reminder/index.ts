import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_SUBJECT = "mailto:painel@zlabs.com.br";

// Minimal push sender for reminders
async function sendPushToCustomer(supabase: any, customerId: string, userId: string, title: string, body: string, appointmentId?: string) {
  try {
    const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("customer_id", customerId).eq("user_id", userId);
    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify({
      title, body,
      icon: "https://agendar.zlabs.com.br/barber-icon-192.png",
      badge: "https://cliente.zlabs.com.br/badge.png",
      data: { url: "https://cliente.zlabs.com.br", appointmentId, reagendarUrl: "https://agendar.zlabs.com.br" },
      actions: appointmentId ? [{ action: "confirmar", title: "✅ Confirmar" }, { action: "reagendar", title: "📅 Reagendar" }] : undefined,
      vibrate: [200, 100, 200, 100, 200],
      tag: "zlabs-notificacao",
      renotify: true,
      requireInteraction: true,
    });

    for (const sub of subs) {
      try {
        const encoder = new TextEncoder();
        // Generate VAPID JWT
        const jwtHeader = { alg: "ES256", typ: "JWT" };
        const jwtPayload = { aud: new URL(sub.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 86400, sub: VAPID_SUBJECT };
        const token = btoa(JSON.stringify(jwtHeader)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") +
          "." + btoa(JSON.stringify(jwtPayload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

        // Import VAPID key for signing
        const keyBytes = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const key = await crypto.subtle.importKey("raw", keyBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(token));
        const vapidJwt = token + "." + btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

        // Encrypt and send (simplified web-push)
        const plaintext = encoder.encode(payload);
        const subKey = await crypto.subtle.importKey("raw", Uint8Array.from(atob((sub.p256dh_key || "").replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)), { name: "ECDH", namedCurve: "P-256" }, false, []);
        const serverKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
        const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: subKey }, serverKeyPair.privateKey, 256);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const authKeyBytes = Uint8Array.from(atob((sub.auth_key || "").replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const prk = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const ikm = new Uint8Array(sharedSecret);
        const combined = new Uint8Array(ikm.length + authKeyBytes.length);
        combined.set(ikm, 0); combined.set(authKeyBytes, ikm.length);
        const prkRaw = new Uint8Array(await crypto.subtle.sign("HMAC", prk, combined));

        const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));
        const cekInfo = new Uint8Array([...encoder.encode("Content-Encoding: aes128gcm\0"), 0, 65, ...serverPubRaw, 0, 65, ...new Uint8Array(await crypto.subtle.exportKey("raw", subKey))]);
        const nonceInfo = new Uint8Array([...encoder.encode("Content-Encoding: nonce\0"), 0, 65, ...serverPubRaw, 0, 65, ...new Uint8Array(await crypto.subtle.exportKey("raw", subKey))]);
        const cekKey = await crypto.subtle.importKey("raw", prkRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const cek = new Uint8Array(await crypto.subtle.sign("HMAC", cekKey, new Uint8Array([...cekInfo, 1]))).slice(0, 16);
        const nonce = new Uint8Array(await crypto.subtle.sign("HMAC", cekKey, new Uint8Array([...nonceInfo, 1]))).slice(0, 12);
        const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
        const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext));
        const body = new Uint8Array(serverPubRaw.length + salt.length + encrypted.length);
        body.set(serverPubRaw, 0); body.set(salt, serverPubRaw.length); body.set(encrypted, serverPubRaw.length + salt.length);

        await fetch(sub.endpoint, {
          method: "POST",
          headers: { "Content-Encoding": "aes128gcm", "Authorization": `vapid t=${vapidJwt}`, "TTL": "86400" },
          body,
        });
      } catch (_) { /* push fail shouldn't block reminder */ }
    }
  } catch (_) { /* ignore push errors */ }
}

function normalizePhone(raw: string): string {
  const cleaned = (raw || "").replace(/\D/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    const isBusinessHours = brtHour >= 9 && brtHour < 18;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // No-show check disabled — was too aggressive

    // Find leads with stage=agendado, reminder_sent=false (or all if force), with appointment_id
    let query = supabase
      .from("crm_leads")
      .select("id, user_id, name, phone, appointment_id")
      .eq("stage", "agendado")
      .not("appointment_id", "is", null);
    if (!force) query = query.eq("reminder_sent", false);
    const { data: leads } = await query;

    let sent = 0;
    if (leads && leads.length > 0) {
      for (const lead of leads) {
      if (!lead.phone) continue;

      // Get appointment details
      const { data: appt } = await supabase
        .from("appointments")
        .select("id, user_id, date, start_time, customer_id, professional_id")
        .eq("id", lead.appointment_id)
        .single();

      if (!appt) continue;

      // Get default reminder hours from settings
      let defaultReminderHours = 24;
      const { data: shopSettings } = await supabase
        .from("settings")
        .select("reminder_hours")
        .eq("user_id", lead.user_id)
        .maybeSingle();
      if (shopSettings?.reminder_hours !== undefined && shopSettings?.reminder_hours !== null) {
        defaultReminderHours = Number(shopSettings.reminder_hours);
      }

      // Get customer's reminder_hours preference
      let reminderHours = defaultReminderHours;
      if (appt.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("reminder_hours")
          .eq("id", appt.customer_id)
          .maybeSingle();
        if (customer?.reminder_hours !== undefined && customer?.reminder_hours !== null) {
          reminderHours = Number(customer.reminder_hours);
        }
      }

      // Calculate if it's time to send the reminder
      const apptDateStr = appt.date;
      const apptTimeStr = appt.start_time.slice(0, 5);
      const apptDateTime = new Date(`${apptDateStr}T${apptTimeStr}:00-03:00`);
      const now = new Date();
      const msUntilAppt = apptDateTime.getTime() - now.getTime();
      const hoursUntilAppt = msUntilAppt / (1000 * 60 * 60);

      // Send reminder if within the window, or if force mode
      if (!force) {
        // Send if hoursUntilAppt is less than or equal to reminderHours, and not past the appointment
        if (hoursUntilAppt > reminderHours || hoursUntilAppt < 0) continue;
      }

      // Check if we already sent an appointment reminder today to avoid duplicates
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartTs = todayStart.getTime();

      const normalizedPhone = normalizePhone(lead.phone);
      const suffix = "@s.whatsapp.net";
      const waChatId = `${normalizedPhone}${suffix}`;

      const { data: sentReminders } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("user_id", appt.user_id)
        .eq("wa_chatid", waChatId)
        .eq("from_me", true)
        .ilike("text", "%Seu agendamento%")
        .gt("wa_timestamp", todayStartTs)
        .limit(1);

      if (sentReminders && sentReminders.length > 0) {
        console.log(`[crm-reminder] Appointment reminder already sent today to ${lead.phone}, skipping.`);
        // Mark as sent in crm_leads to stay in sync
        await supabase.from("crm_leads").update({ reminder_sent: true }).eq("id", lead.id);
        continue;
      }

      // Get professional name
      let profName = "";
      if (appt.professional_id) {
        const { data: prof } = await supabase
          .from("professionals")
          .select("name")
          .eq("id", appt.professional_id)
          .single();
        profName = prof?.name || "";
      }

      const dd = appt.date.slice(8, 10);
      const mm = appt.date.slice(5, 7);
      const hhmm = apptTimeStr;
      const reminderMsg = `Olá ${lead.name}! 😊\n\n📅 *Seu agendamento:*\nDia: ${dd}/${mm}\nHorário: ${hhmm}${profName ? `\nProfissional: ${profName}` : ""}\n\nResponda:\n✅ *SIM* para confirmar\n❌ *NÃO* para cancelar`;

      // 1. Send WhatsApp reminder
      let waSent = false;
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("api_url, instance_token")
        .eq("user_id", appt.user_id)
        .maybeSingle();

      if (config) {
        const apiUrl = config.api_url.replace(/\/$/, "");
        const normalizedPhone = normalizePhone(lead.phone);
        try {
          const res = await fetch(`${apiUrl}/send/text?token=${config.instance_token}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": config.instance_token,
              "token": config.instance_token,
              "Authorization": `Bearer ${config.instance_token}`,
            },
            body: JSON.stringify({ number: normalizedPhone, text: reminderMsg }),
          });
          if (res.ok) {
            waSent = true;
          } else {
            const errText = await res.text().catch(() => "");
            console.error(`[crm-reminder] Failed to send WhatsApp to ${lead.phone}. Status: ${res.status}. Body: ${errText}`);
          }
        } catch (waErr) {
          console.error(`[crm-reminder] WhatsApp fetch error:`, waErr);
        }
      }

      // 2. Send Push Notification (pop-up)
      let pushSent = false;
      if (appt.customer_id) {
        try {
          const pushRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id: appt.user_id,
              customer_ids: [appt.customer_id],
              title: "⏰ Lembrete de Agendamento",
              body: `Olá! Seu horário agendado está chegando: ${dd}/${mm} às ${hhmm}${profName ? ` com ${profName}` : ""}. Confirme sua presença!`,
              url: "https://cliente.zlabs.com.br",
              appointment_id: appt.id,
            }),
          });
          if (pushRes.ok) {
            pushSent = true;
          }
        } catch (pushErr) {
          console.error(`[crm-reminder] Push error:`, pushErr);
        }
      }

      // Mark as sent if either WhatsApp or Push succeeded (or if no WhatsApp config exists, mark it so we don't loop forever)
      if (waSent || pushSent || !config) {
        const { error: updateErr } = await supabase
          .from("crm_leads")
          .update({ reminder_sent: true })
          .eq("id", lead.id);
        if (updateErr) {
          console.error(`[crm-reminder] Failed to update crm_leads reminder_sent for lead ${lead.id}:`, updateErr);
        } else {
          console.log(`[crm-reminder] Successfully set reminder_sent = true for lead ${lead.id}`);
        }
        sent++;
      }
    }
  }

    // Second: Check for appointments starting in exactly 30 minutes to send client push reminders
    try {
      const todayStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: upcomingAppts } = await supabase
        .from("appointments")
        .select("id, user_id, customer_id, professional_id, start_time, date")
        .eq("date", todayStr)
        .in("status", ["agendado", "confirmado"]);

      if (upcomingAppts && upcomingAppts.length > 0) {
        const now = new Date();
        for (const appt of upcomingAppts) {
          if (!appt.customer_id) continue;

          // Calculate time until appointment
          const apptTimeStr = appt.start_time.slice(0, 5);
          const apptDateTime = new Date(`${appt.date}T${apptTimeStr}:00-03:00`);
          const msUntilAppt = apptDateTime.getTime() - now.getTime();
          const minutesUntilAppt = msUntilAppt / (1000 * 60);

          // If appointment is starting in 25-35 minutes (approximately 30 minutes)
          if (minutesUntilAppt >= 0 && minutesUntilAppt <= 35) {
            // Check if we already sent a push reminder in the last 2 hours
            const { data: existingNotif } = await supabase
              .from("client_notifications")
              .select("id")
              .eq("customer_id", appt.customer_id)
              .eq("title", "⏰ Seu horário é daqui a pouco!")
              .gt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (existingNotif && existingNotif.length > 0) {
              continue; // Already sent, skip
            }

            // Get professional name
            let profName = "";
            if (appt.professional_id) {
              const { data: prof } = await supabase
                .from("professionals")
                .select("name")
                .eq("id", appt.professional_id)
                .maybeSingle();
              profName = prof?.name || "";
            }

            const bodyText = `Olá! Lembra que você tem um horário agendado hoje às ${apptTimeStr}${profName ? ` com ${profName}` : ""}? Te esperamos! 💈`;

            // Insert in-app notification
            await supabase.from("client_notifications").insert({
              customer_id: appt.customer_id,
              user_id: appt.user_id,
              title: "⏰ Seu horário é daqui a pouco!",
              body: bodyText,
              url: "https://cliente.zlabs.com.br",
            });

            // Send Push Notification
            try {
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  user_id: appt.user_id,
                  customer_ids: [appt.customer_id],
                  title: "⏰ Seu horário é daqui a pouco!",
                  body: bodyText,
                  url: "https://cliente.zlabs.com.br",
                  appointment_id: appt.id,
                }),
              });
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.error("[crm-reminder] 30m push reminder logic error:", e);
    }

    // ══════════════════════════════════════════════════════════
    // BLOCO 3: Lembretes de RETORNO para clientes com plano
    // ══════════════════════════════════════════════════════════
    let returnSent = 0;
    if (isBusinessHours || force) {
      try {
        // Busca todos os user_ids que têm whatsapp_config configurado
        const { data: waConfigs } = await supabase
          .from("whatsapp_config")
          .select("user_id, api_url, instance_token");

        if (waConfigs && waConfigs.length > 0) {
          for (const waCfg of waConfigs) {
            const { data: targets } = await supabase.rpc("get_plan_notification_targets", {
              p_user_id: waCfg.user_id,
              p_notif_type: "return",
              p_expiry_days_threshold: 1,
            });

            if (!targets || targets.length === 0) continue;

            const apiUrl = waCfg.api_url.replace(/\/$/, "");

            for (const t of targets) {
              const phone = normalizePhone(t.customer_phone);
              if (!phone) continue;

              // Check if we already sent a plan return reminder today
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const todayStartTs = todayStart.getTime();

              const { data: sentPlans } = await supabase
                .from("whatsapp_messages")
                .select("id")
                .eq("user_id", waCfg.user_id)
                .eq("wa_chatid", phone)
                .eq("from_me", true)
                .ilike("text", "%dia do seu retorno%")
                .gt("wa_timestamp", todayStartTs)
                .limit(1);

              if (sentPlans && sentPlans.length > 0) {
                console.log(`[crm-reminder] Plan return reminder already sent today to ${phone}, skipping.`);
                // Insert into plan_notifications to stay in sync
                await supabase.from("plan_notifications").insert({
                  customer_plan_id: t.customer_plan_id,
                  type: "return",
                });
                continue;
              }

              const msg = `Olá ${t.customer_name}! 😊

💈 Passando para lembrar que amanhã é o dia do seu retorno!

Você tem o plano *${t.plan_name}* ativo.

Agende seu horário agora para garantir o melhor atendimento amanhã:
👉 https://agendar.zlabs.com.br`;

              try {
                const res = await fetch(`${apiUrl}/send/text?token=${waCfg.instance_token}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "apikey": waCfg.instance_token,
                  },
                  body: JSON.stringify({ number: phone, text: msg }),
                });

                if (res.ok) {
                  // Registra para não reenviar hoje
                  const { error: insertErr } = await supabase.from("plan_notifications").insert({
                    customer_plan_id: t.customer_plan_id,
                    type: "return",
                  });
                  if (insertErr) {
                    console.error(`[crm-reminder] Failed to insert plan_notification for return to ${t.customer_name}:`, insertErr);
                  } else {
                    console.log(`[crm-reminder] Registered return notification for ${t.customer_name}`);
                  }
                  returnSent++;
                  console.log(`[crm-reminder] Return notif sent to ${t.customer_name} (${phone})`);
                } else {
                  const errText = await res.text().catch(() => "");
                  console.error(`[crm-reminder] Return notif failed for ${t.customer_name}: ${res.status} ${errText}`);
                }
              } catch (waErr) {
                console.error(`[crm-reminder] Return notif fetch error for ${t.customer_name}:`, waErr);
              }
            }
          }
        }
      } catch (e) {
        console.error("[crm-reminder] Return notification block error:", e);
      }
    }

    // ══════════════════════════════════════════════════════════
    // BLOCO 4: Avisos de VENCIMENTO de plano (1 dia antes)
    // ══════════════════════════════════════════════════════════
    let expirySent = 0;
    if (isBusinessHours || force) {
      try {
        const { data: waConfigs2 } = await supabase
          .from("whatsapp_config")
          .select("user_id, api_url, instance_token");

        if (waConfigs2 && waConfigs2.length > 0) {
          for (const waCfg of waConfigs2) {
            const { data: targets } = await supabase.rpc("get_plan_notification_targets", {
              p_user_id: waCfg.user_id,
              p_notif_type: "expiry",
              p_expiry_days_threshold: 1,
            });

            if (!targets || targets.length === 0) continue;

            const apiUrl = waCfg.api_url.replace(/\/$/, "");

            for (const t of targets) {
              const phone = normalizePhone(t.customer_phone);
              if (!phone) continue;

              // Check if we already sent a plan expiry reminder today
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const todayStartTs = todayStart.getTime();

              const { data: sentExpirations } = await supabase
                .from("whatsapp_messages")
                .select("id")
                .eq("user_id", waCfg.user_id)
                .eq("wa_chatid", phone)
                .eq("from_me", true)
                .ilike("text", "%vence amanhã%")
                .gt("wa_timestamp", todayStartTs)
                .limit(1);

              if (sentExpirations && sentExpirations.length > 0) {
                console.log(`[crm-reminder] Plan expiry reminder already sent today to ${phone}, skipping.`);
                // Insert into plan_notifications to stay in sync
                await supabase.from("plan_notifications").insert({
                  customer_plan_id: t.customer_plan_id,
                  type: "expiry",
                });
                continue;
              }

              const expiresDate = new Date(t.expires_at + "T12:00:00");
              const dd = String(expiresDate.getDate()).padStart(2, "0");
              const mm = String(expiresDate.getMonth() + 1).padStart(2, "0");

              const msg = `Olá ${t.customer_name}! ⚠️

Passando para lembrar que seu plano *${t.plan_name}* vence amanhã (${dd}/${mm}).

Renove hoje para continuar aproveitando todos os seus benefícios! 💈

Fale conosco para realizar a renovação.`;

              try {
                const res = await fetch(`${apiUrl}/send/text?token=${waCfg.instance_token}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "apikey": waCfg.instance_token,
                  },
                  body: JSON.stringify({ number: phone, text: msg }),
                });

                if (res.ok) {
                  const { error: insertErr } = await supabase.from("plan_notifications").insert({
                    customer_plan_id: t.customer_plan_id,
                    type: "expiry",
                  });
                  if (insertErr) {
                    console.error(`[crm-reminder] Failed to insert plan_notification for expiry to ${t.customer_name}:`, insertErr);
                  } else {
                    console.log(`[crm-reminder] Registered expiry notification for ${t.customer_name}`);
                  }
                  expirySent++;
                  console.log(`[crm-reminder] Expiry notif sent to ${t.customer_name} (${phone})`);
                } else {
                  const errText = await res.text().catch(() => "");
                  console.error(`[crm-reminder] Expiry notif failed for ${t.customer_name}: ${res.status} ${errText}`);
                }
              } catch (waErr) {
                console.error(`[crm-reminder] Expiry notif fetch error for ${t.customer_name}:`, waErr);
              }
            }
          }
        }
      } catch (e) {
        console.error("[crm-reminder] Expiry notification block error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, reminders: sent, return_notifs: returnSent, expiry_notifs: expirySent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[crm-reminder] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
