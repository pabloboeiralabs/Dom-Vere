import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGIN_DOMAIN = "barber.local";
const DEFAULT_PASSWORD = "123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuração incompleta" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Valida apenas a assinatura do JWT (não depende de sessão ativa no banco)
    const { data: claimsData, error: claimsError } = await adminClient.auth.getClaims(token);
    const ownerId = claimsData?.claims?.sub;
    if (claimsError || !ownerId) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const body = await req.json();
    const { professional_id, login } = body;

    if (!professional_id || !login) {
      return new Response(JSON.stringify({ error: "professional_id e login são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize login: lowercase, trim, remove spaces
    const loginClean = login.toLowerCase().trim().replace(/\s+/g, ".");
    if (loginClean.length < 3) {
      return new Response(JSON.stringify({ error: "Login deve ter pelo menos 3 caracteres" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build fake email for Supabase auth
    const fakeEmail = `${loginClean}@${LOGIN_DOMAIN}`;

    // Verify the professional belongs to this owner
    const { data: prof } = await adminClient
      .from("professionals")
      .select("id, name, user_id")
      .eq("id", professional_id)
      .maybeSingle();

    if (!prof || prof.user_id !== ownerId) {
      return new Response(JSON.stringify({ error: "Profissional não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this professional already has an account
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("professional_id", professional_id)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ error: "Este profissional já possui uma conta" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if login is already used
    const { data: existingEmail } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", fakeEmail)
      .maybeSingle();

    if (existingEmail) {
      return new Response(JSON.stringify({ error: "Este login já está em uso" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with default password 123456
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: fakeEmail,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: prof.name,
        role: "profissional",
      },
    });

    if (createError || !created.user?.id) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Erro ao criar conta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: normalizeError } = await adminClient.rpc("normalize_auth_user_tokens", { p_user_id: created.user.id });
    if (normalizeError) {
      return new Response(JSON.stringify({ error: `Migração de autenticação pendente: ${normalizeError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile with professional_id, owner_id and must_change_password
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: created.user.id,
        name: prof.name,
        email: fakeEmail,
        role: "profissional",
        professional_id: professional_id,
        owner_id: ownerId,
        active: true,
        must_change_password: true,
      }, { onConflict: "id" });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      userId: created.user.id,
      login: loginClean,
      message: `Conta criada! Login: ${loginClean} / Senha padrão: ${DEFAULT_PASSWORD}. O profissional será obrigado a alterar a senha no primeiro acesso.`,
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
