import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR", "USER",
  "LANG", "TERM", "DENO_REGION", "DENO_DEPLOYMENT_ID", "PWD", "SHLVL", "_",
]);

const KNOWN_FUNCTIONS = [
  "admin-create-user",
  "admin-set-user-password",
  "create-professional-account",
  "crm-analyze-chat",
  "crm-reminder",
  "crm-send-message",
  "notify-professional",
  "reset-professional-password",
  "whatsapp-webhook",
  "admin-credentials",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const roleList = (roles || []).map((r: any) => r.role);
    let isAllowed = roleList.includes("admin") || roleList.includes("desenvolvedor");

    if (!isAllowed) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profile?.role === "admin") isAllowed = true;
    }

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All env vars
    const allEnv = Deno.env.toObject();
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(allEnv)) {
      if (SYSTEM_VARS.has(k)) continue;
      if (k.startsWith("XDG")) continue;
      filtered[k] = v;
    }

    const project_url = filtered["SUPABASE_URL"] ?? null;
    const anon_key = filtered["SUPABASE_ANON_KEY"] ?? null;
    const service_role_key = filtered["SUPABASE_SERVICE_ROLE_KEY"] ?? null;

    // Extra secrets (excluding the 3 main credentials)
    const secrets: Record<string, string> = {};
    for (const [k, v] of Object.entries(filtered)) {
      if (k === "SUPABASE_URL" || k === "SUPABASE_ANON_KEY" || k === "SUPABASE_SERVICE_ROLE_KEY") continue;
      secrets[k] = v;
    }

    // Edge functions probe
    const probes = await Promise.allSettled(
      KNOWN_FUNCTIONS.map(async (name) => {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
          method: "OPTIONS",
        });
        return { name, ok: res.status < 500 };
      })
    );
    const edge_functions = probes
      .filter((p) => p.status === "fulfilled" && (p as any).value.ok)
      .map((p) => (p as any).value.name);

    // Database tables via exec_sql
    let database_tables: any[] = [];
    try {
      const { data: tablesData } = await adminClient.rpc("exec_sql", {
        sql_query: `SELECT t.tablename as name, COALESCE(s.n_live_tup, 0)::int as row_count,
  (SELECT count(*)::int FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename) as column_count,
  (SELECT string_agg(c.column_name,',') FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name LIKE '%encrypted%') as encrypted_columns,
  EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='user_id') as has_user_id
FROM pg_tables t LEFT JOIN pg_stat_user_tables s ON s.relname=t.tablename
WHERE t.schemaname='public' ORDER BY t.tablename`,
      });
      database_tables = tablesData || [];
    } catch (e) {
      console.error("exec_sql error:", e);
    }

    return new Response(
      JSON.stringify({
        project_url,
        anon_key,
        service_role_key,
        secrets,
        edge_functions,
        edge_functions_count: edge_functions.length,
        database_tables,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("admin-credentials error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
