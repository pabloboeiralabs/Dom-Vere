import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PASSWORD = "123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const ownerId = userData.user.id;

    const { data: ownerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", ownerId)
      .maybeSingle();

    if (!ownerProfile || !["admin", "barbearia"].includes(ownerProfile.role)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { professional_id } = await req.json();
    if (!professional_id) {
      return new Response(JSON.stringify({ error: "professional_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the professional belongs to this owner
    const { data: prof } = await adminClient
      .from("professionals")
      .select("id, user_id")
      .eq("id", professional_id)
      .maybeSingle();

    if (!prof || prof.user_id !== ownerId) {
      return new Response(JSON.stringify({ error: "Profissional não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the profile linked to this professional
    const { data: profProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("professional_id", professional_id)
      .maybeSingle();

    if (!profProfile) {
      return new Response(JSON.stringify({ error: "Este profissional não possui conta" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reset password
    const { error: resetError } = await adminClient.auth.admin.updateUserById(profProfile.id, {
      password: DEFAULT_PASSWORD,
    });

    if (resetError) {
      return new Response(JSON.stringify({ error: resetError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set must_change_password = true
    await adminClient
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", profProfile.id);

    return new Response(JSON.stringify({
      message: `Senha resetada para ${DEFAULT_PASSWORD}. O profissional será obrigado a alterar no próximo acesso.`,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
