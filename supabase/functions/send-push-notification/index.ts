import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_SUBJECT = "mailto:painel@zlabs.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushSubscription {
  id: string;
  customer_id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, customer_ids, title, body, url, icon, appointment_id } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: "user_id, title, body required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get Supabase client with service_role to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query push subscriptions
    let query = supabase.from("push_subscriptions").select("*").eq("user_id", user_id);
    if (customer_ids && customer_ids.length > 0) {
      query = query.in("customer_id", customer_ids);
    } else {
      // By default, if no customer_ids are specified, only notify staff (where customer_id is null)
      query = query.is("customer_id", null);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    // Always create in-app notifications (sino), even without push subscriptions
    if (customer_ids && customer_ids.length > 0) {
      for (const cid of customer_ids) {
        try {
          await supabase.from("client_notifications").insert({
            customer_id: cid, user_id,
            title, body, url: url || null,
          });
        } catch (_) {}
      }
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, in_app: customer_ids?.length || 0, message: "No push subscriptions, but in-app notifications created" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Configure web-push with VAPID keys
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({
      title,
      body,
      icon: icon || "https://agendar.zlabs.com.br/barber-icon-192.png",
      badge: "https://cliente.zlabs.com.br/badge.png",
      data: {
        url: url || "https://agendar.zlabs.com.br",
        appointmentId: appointment_id || undefined,
        reagendarUrl: url || "https://agendar.zlabs.com.br",
      },
      actions: appointment_id
        ? [{ action: "confirmar", title: "✅ Sim" }, { action: "cancelar", title: "❌ Não" }]
        : undefined,
      vibrate: [200, 100, 200, 100, 200],
      tag: "zlabs-notificacao",
      renotify: true,
      requireInteraction: true,
      silent: false,
    });

    // Send to all subscriptions
    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions as PushSubscription[]) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          payload,
          { urgency: "high", TTL: 86400 }
        );
        sent++;
      } catch (e: any) {
        console.error("[Push] Failed:", e);
        failed++;
        // Auto-cleanup expired/unsubscribed endpoints
        if (e?.body?.includes?.("unsubscribed") || e?.body?.includes?.("expired") || e?.statusCode === 410) {
          try { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); } catch (_) {}
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed, total: subscriptions.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
