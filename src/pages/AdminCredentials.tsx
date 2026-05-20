import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download,
  Loader2, Code2, Database, AlertTriangle, Info,
} from "lucide-react";

interface TableRaw {
  name: string;
  row_count: number;
  column_count: number;
  encrypted_columns: string | null;
  has_user_id: boolean;
}
interface CredentialsData {
  project_url: string | null;
  anon_key: string | null;
  service_role_key: string | null;
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database_tables?: TableRaw[];
}

const mask = (v: string) => {
  if (!v) return "";
  if (v.length <= 24) return "•".repeat(v.length);
  return `${v.slice(0, 12)}•••••${v.slice(-8)}`;
};

const classifyTable = (t: TableRaw): { label: string; color: string; reason: string } => {
  const n = t.name.toLowerCase();
  if (/_log|_history|migration|audit/.test(n) || t.encrypted_columns) {
    return {
      label: "Ignorar",
      color: "bg-muted text-muted-foreground",
      reason: t.encrypted_columns
        ? `Contém colunas criptografadas: ${t.encrypted_columns}`
        : "Tabela de log/histórico/auditoria",
    };
  }
  if (/payment|sale|transaction|order/.test(n)) {
    return { label: "Histórico", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", reason: "Tabela de histórico transacional" };
  }
  if (/settings|config|role/.test(n) || (n === "profiles" && t.has_user_id)) {
    return { label: "Essencial", color: "bg-green-500/15 text-green-400 border-green-500/30", reason: "Configuração ou perfil essencial do sistema" };
  }
  if (t.has_user_id && t.row_count < 100 && /credit|subscription/.test(n)) {
    return { label: "Essencial", color: "bg-green-500/15 text-green-400 border-green-500/30", reason: "Dados essenciais de cliente" };
  }
  return { label: "Histórico", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", reason: "Dados operacionais gerais" };
};

export default function AdminCredentials() {
  const [data, setData] = useState<CredentialsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Sem sessão");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-credentials`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro");
      setData(json);
      toast({ title: "Credenciais reveladas", description: `${json.edge_functions_count} funções, ${json.database_tables?.length || 0} tabelas` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (k: string) => setRevealed((r) => ({ ...r, [k]: !r[k] }));

  const copyOne = async (k: string, v: string) => {
    await navigator.clipboard.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyAll = async () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════");
    lines.push("       CREDENCIAIS DO PROJETO");
    lines.push("═══════════════════════════════════════");
    lines.push(`SUPABASE_URL=${data.project_url || ""}`);
    lines.push(`SUPABASE_ANON_KEY=${data.anon_key || ""}`);
    lines.push(`SUPABASE_SERVICE_ROLE_KEY=${data.service_role_key || ""}`);
    lines.push("");
    lines.push("═══════════════════════════════════════");
    lines.push("              SECRETS");
    lines.push("═══════════════════════════════════════");
    for (const [k, v] of Object.entries(data.secrets)) lines.push(`${k}=${v}`);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Copiado", description: "Todas as credenciais copiadas" });
  };

  const downloadSecretsTs = () => {
    if (!data) return;
    const date = new Date().toLocaleDateString("pt-BR");
    const all: Record<string, string> = {};
    if (data.project_url) all.SUPABASE_URL = data.project_url;
    if (data.anon_key) all.SUPABASE_ANON_KEY = data.anon_key;
    if (data.service_role_key) all.SUPABASE_SERVICE_ROLE_KEY = data.service_role_key;
    Object.assign(all, data.secrets);
    const body = Object.entries(all)
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
      .join("\n");
    const content = `// Secrets do projeto - Gerado em ${date}\nexport const SECRETS = {\n${body}\n} as const;\n\nexport type SecretKey = keyof typeof SECRETS;\n`;
    const blob = new Blob([content], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "secrets.ts"; a.click();
    URL.revokeObjectURL(url);
  };

  const edgeSources = useMemo(() => {
    const modules = import.meta.glob("/supabase/functions/*/index.ts", {
      query: "?raw", import: "default", eager: true,
    }) as Record<string, string>;
    return modules;
  }, []);

  const downloadEdgeTs = () => {
    const entries = Object.entries(edgeSources);
    if (!entries.length) {
      toast({ title: "Nenhuma função encontrada", variant: "destructive" });
      return;
    }
    const parts: string[] = [];
    parts.push(`// Edge Functions consolidadas - Gerado em ${new Date().toLocaleDateString("pt-BR")}\n`);
    for (const [path, source] of entries) {
      const name = path.split("/").slice(-2)[0];
      parts.push(`\n// ═══════════════════════════════════════`);
      parts.push(`// FUNCTION: ${name}`);
      parts.push(`// ═══════════════════════════════════════\n`);
      parts.push(source);
    }
    const blob = new Blob([parts.join("\n")], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "edge-functions.ts"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Download iniciado", description: `${entries.length} funções exportadas` });
  };

  const credentialRows = data
    ? [
        { k: "SUPABASE_URL", v: data.project_url || "" },
        { k: "SUPABASE_ANON_KEY", v: data.anon_key || "" },
        { k: "SUPABASE_SERVICE_ROLE_KEY", v: data.service_role_key || "" },
      ].filter((r) => r.v)
    : [];

  const credCount = credentialRows.length;
  const secretCount = data ? Object.keys(data.secrets).length : 0;
  const fnCount = data?.edge_functions_count ?? 0;
  const tblCount = data?.database_tables?.length ?? 0;

  const hasUserTables = data?.database_tables?.some((t) =>
    ["profiles", "user_roles"].includes(t.name.toLowerCase())
  );

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Credenciais do Projeto</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito a admin/desenvolvedor</p>
          </div>
          <div className="flex gap-2">
            {data && (
              <>
                <Button variant="outline" onClick={copyAll}><Copy className="h-4 w-4" />Copiar Tudo</Button>
                <Button variant="outline" onClick={downloadSecretsTs}><Download className="h-4 w-4" />Download .ts</Button>
              </>
            )}
            <Button onClick={reveal} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Revelar Tudo
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-destructive" />
              <div><div className="text-2xl font-bold">{credCount}</div><div className="text-xs text-muted-foreground">Credenciais</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Key className="h-8 w-8 text-primary" />
              <div><div className="text-2xl font-bold">{secretCount}</div><div className="text-xs text-muted-foreground">Secrets</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Code2 className="h-8 w-8 text-blue-400" />
              <div><div className="text-2xl font-bold">{fnCount}</div><div className="text-xs text-muted-foreground">Edge Functions</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Database className="h-8 w-8 text-green-400" />
              <div><div className="text-2xl font-bold">{tblCount}</div><div className="text-xs text-muted-foreground">Tabelas</div></div>
            </CardContent>
          </Card>
        </div>

        {hasUserTables && (
          <Card className="border-yellow-500/40 bg-yellow-500/5">
            <CardContent className="p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>Aviso sobre senhas:</strong> Usuários migrados precisam redefinir a senha via "Esqueci minha senha". Emails e metadados são copiados, mas senhas são hashes irreversíveis.
              </div>
            </CardContent>
          </Card>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Credenciais */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" />Credenciais</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {credentialRows.map(({ k, v }) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className="font-mono text-xs truncate">{revealed[k] ? v : mask(v)}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => toggle(k)}>
                      {revealed[k] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => copyOne(k, v)}>
                      {copied === k ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Secrets */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="h-5 w-5 text-primary" />Secrets ({secretCount})</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {Object.entries(data.secrets).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className="font-mono text-xs truncate">{revealed[k] ? v : mask(v)}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => toggle(k)}>
                      {revealed[k] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => copyOne(k, v)}>
                      {copied === k ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Edge Functions */}
            <Card className="md:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Code2 className="h-5 w-5 text-blue-400" />Edge Functions ({fnCount})</CardTitle>
                <Button size="sm" variant="outline" onClick={downloadEdgeTs}><Download className="h-4 w-4" />Download .ts</Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.edge_functions.map((fn) => (
                    <Badge key={fn} variant="secondary" className="font-mono text-xs">{fn}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tabelas */}
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="h-5 w-5 text-green-400" />Tabelas do Banco ({tblCount})</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(data.database_tables || []).map((t) => {
                    const c = classifyTable(t);
                    return (
                      <div key={t.name} className="flex items-center justify-between p-2 border rounded-md text-sm">
                        <div className="min-w-0">
                          <div className="font-mono text-xs truncate">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.row_count} linhas · {t.column_count} cols</div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`${c.color} cursor-help`}>
                              <Info className="h-3 w-3 mr-1" />{c.label}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent><p className="max-w-xs">{c.reason}</p></TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
