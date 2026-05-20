import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateUserBody = {
  name?: string;
  email?: string;
  password?: string;
  role?: "admin" | "barbearia";
};

const isDuplicateEmailError = (message?: string | null) => {
  const text = (message ?? "").toLowerCase();
  return (
    text.includes("already been registered") ||
    text.includes("email_exists") ||
    text.includes("duplicate key value") ||
    text.includes("users_email_partial_key") ||
    text.includes("database error creating new user")
  );
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do backend incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestUserClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: requesterData, error: requesterError } = await requestUserClient.auth.getUser(token);
    if (requesterError || !requesterData?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: requesterProfile, error: requesterProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", requesterData.user.id)
      .maybeSingle();

    if (requesterProfileError) {
      return new Response(
        JSON.stringify({ error: requesterProfileError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!requesterProfile || requesterProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem criar usuários" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as CreateUserBody;
    const name = body?.name?.trim();
    const email = body?.email?.toLowerCase().trim();
    const password = body?.password;
    const role = body?.role === "admin" ? "admin" : "barbearia";

    if (!name || !email || !password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos. Verifique nome, e-mail e senha (mín. 6 caracteres)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check auth.users directly to avoid ghost users without profiles
    const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1 });
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({ perPage: 50 });
    const existingAuthUser = existingUsers?.users?.find(u => u.email === email);

    if (existingAuthUser) {
      // User exists in auth — check if profile exists too
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", existingAuthUser.id)
        .maybeSingle();

      if (existingProfile) {
        return new Response(
          JSON.stringify({ error: "Um usuário com este e-mail já está registrado" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auth user exists but no profile — create the profile
      const { error: profileUpsertError } = await adminClient
        .from("profiles")
        .upsert({
          id: existingAuthUser.id,
          name,
          email,
          role,
          active: true,
        }, { onConflict: "id" });

      if (profileUpsertError) {
        return new Response(
          JSON.stringify({ error: profileUpsertError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ userId: existingAuthUser.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        role,
      },
    });

    if (createUserError || !createdUserData.user?.id) {
      if (isDuplicateEmailError(createUserError?.message)) {
        return new Response(
          JSON.stringify({ error: "A user with this email address has already been registered" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: createUserError?.message ?? "Falha ao criar usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert({
        id: createdUserData.user.id,
        name,
        email,
        role,
        active: true,
      }, { onConflict: "id" });

    if (profileUpsertError) {
      return new Response(
        JSON.stringify({ error: profileUpsertError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ userId: createdUserData.user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
