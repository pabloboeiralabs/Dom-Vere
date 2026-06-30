import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find leads with stage=agendado, reminder_sent=false, with appointment_id
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, user_id, name, phone, appointment_id")
      .eq("stage", "agendado")
      .eq("reminder_sent", false)
      .not("appointment_id", "is", null);

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminders: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    for (const lead of leads) {
      if (!lead.phone) continue;

      // Get appointment details
      const { data: appt } = await supabase
        .from("appointments")
        .select("date, start_time, customer_id, professional_id")
        .eq("id", lead.appointment_id)
        .single();

      if (!appt) continue;

      // Get customer's reminder_hours preference
      let reminderHours = 24; // default: 1 day before
      if (appt.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("reminder_hours")
          .eq("id", appt.customer_id)
          .maybeSingle();
        if (customer?.reminder_hours) {
          reminderHours = customer.reminder_hours;
        }
      }

      // Calculate if it's time to send the reminder
      const apptDateStr = appt.date;
      const apptTimeStr = appt.start_time.slice(0, 5);
      const apptDateTime = new Date(`${apptDateStr}T${apptTimeStr}:00`);
      const now = new Date();
      const msUntilAppt = apptDateTime.getTime() - now.getTime();
      const hoursUntilAppt = msUntilAppt / (1000 * 60 * 60);

      // Send reminder if within the window (± 5min for small reminders, ± 1h otherwise)
      const reminderWindow = reminderHours < 1 ? 5 / 60 : Math.min(reminderHours * 0.5, 1);
      if (hoursUntilAppt > reminderHours + reminderWindow || hoursUntilAppt < reminderHours - reminderWindow) continue;

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
      const reminderMsg = `Olá ${lead.name}! 😊 Lembrando do seu agendamento hoje ${dd}/${mm} às ${hhmm}${profName ? ` com ${profName}` : ""}. Te esperamos! 💈`;

      // Get WhatsApp config
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("api_url, instance_token")
        .eq("user_id", lead.user_id)
        .maybeSingle();

      if (config) {
        const apiUrl = config.api_url.replace(/\/$/, "");
        const res = await fetch(`${apiUrl}/send/text?token=${config.instance_token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": config.instance_token,
            "Authorization": `Bearer ${config.instance_token}`,
          },
          body: JSON.stringify({ number: lead.phone, text: reminderMsg }),
        });

        if (res.ok) {
          await supabase.from("crm_leads").update({ reminder_sent: true }).eq("id", lead.id);
          sent++;
        } else {
          const errText = await res.text().catch(() => "");
          console.error(`[crm-reminder] Failed to send message to ${lead.phone}. Status: ${res.status}. Body: ${errText}`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, reminders: sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[crm-reminder] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
