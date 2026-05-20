import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, Trash2, Upload, Download, Copy, ChevronDown, FileJson, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface JsonConfig {
  id: string;
  name: string;
  type: string;
  json_content: any;
  active: boolean;
  created_at: string;
}

const CONFIG_TYPES = [
  { value: "carousel", label: "Carrossel" },
  { value: "interactive", label: "Mensagem Interativa (Lista/Botões)" },
  { value: "template", label: "Template de Mensagem" },
  { value: "tool", label: "Tool da IA (Function Calling)" },
];

const EXAMPLES: Record<string, { name: string; json: any }> = {
  carousel: {
    name: "Exemplo: Carrossel de Profissionais",
    json: {
      text: "Escolha o profissional de sua preferência:",
      carousel: [
        {
          text: "💈 *João*",
          image: "https://ui-avatars.com/api/?name=Joao&size=600&background=333&color=fff",
          buttons: [{ id: "PROF_João", text: "Escolher João", type: "REPLY" }],
        },
        {
          text: "💈 *Pedro*",
          image: "https://ui-avatars.com/api/?name=Pedro&size=600&background=333&color=fff",
          buttons: [{ id: "PROF_Pedro", text: "Escolher Pedro", type: "REPLY" }],
        },
      ],
      readchat: true,
    },
  },
  interactive: {
    name: "Exemplo: Lista de Serviços",
    json: {
      type: "list",
      title: "Nossos Serviços",
      description: "Selecione o serviço desejado",
      buttonText: "Ver Serviços",
      sections: [
        {
          title: "Cortes",
          rows: [
            { id: "svc_corte", title: "Corte Masculino", description: "R$ 45,00" },
            { id: "svc_barba", title: "Barba", description: "R$ 30,00" },
          ],
        },
      ],
    },
  },
  template: {
    name: "Exemplo: Confirmação de Agendamento",
    json: {
      trigger: "agendamento_confirmado",
      message: "✅ *Agendamento Confirmado!*\n\n📅 Data: {{date}}\n⏰ Horário: {{time}}\n💈 Profissional: {{professional}}\n✂️ Serviço: {{service}}\n👤 Cliente: {{customer}}\n\nTe esperamos! 😊",
      variables: ["date", "time", "professional", "service", "customer"],
    },
  },
  tool: {
    name: "Exemplo: Tool Personalizada",
    json: {
      type: "function",
      function: {
        name: "custom_tool_name",
        description: "Descrição do que a tool faz. A IA usará essa descrição para decidir quando chamar.",
        parameters: {
          type: "object",
          properties: {
            param1: { type: "string", description: "Descrição do parâmetro 1" },
            param2: { type: "number", description: "Descrição do parâmetro 2" },
          },
          required: ["param1"],
        },
      },
    },
  },
};

export function WhatsAppJsonConfigs() {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<JsonConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("carousel");
  const [formJson, setFormJson] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("whatsapp_json_configs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setConfigs((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const validateJson = (text: string): boolean => {
    try {
      JSON.parse(text);
      setJsonError(null);
      return true;
    } catch (e: any) {
      setJsonError(e.message);
      return false;
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormType("carousel");
    setFormJson("");
    setFormActive(true);
    setJsonError(null);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!formName.trim()) { toast.error("Informe um nome"); return; }
    if (!formJson.trim()) { toast.error("Informe o JSON"); return; }
    if (!validateJson(formJson)) { toast.error("JSON inválido"); return; }

    setSaving(true);
    const payload = {
      user_id: user.id,
      name: formName.trim(),
      type: formType,
      json_content: JSON.parse(formJson),
      active: formActive,
    };

    if (editingId) {
      const { error } = await supabase.from("whatsapp_json_configs").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar: " + error.message); }
      else { toast.success("Configuração atualizada!"); resetForm(); }
    } else {
      const { error } = await supabase.from("whatsapp_json_configs").insert(payload);
      if (error) { toast.error("Erro ao salvar: " + error.message); }
      else { toast.success("Configuração salva!"); resetForm(); }
    }
    setSaving(false);
    loadConfigs();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("whatsapp_json_configs").delete().eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Removido!"); loadConfigs(); }
  };

  const handleEdit = (config: JsonConfig) => {
    setEditingId(config.id);
    setFormName(config.name);
    setFormType(config.type);
    setFormJson(JSON.stringify(config.json_content, null, 2));
    setFormActive(config.active);
    setJsonError(null);
    setShowForm(true);
  };

  const handleToggleActive = async (config: JsonConfig) => {
    await supabase.from("whatsapp_json_configs").update({ active: !config.active }).eq("id", config.id);
    loadConfigs();
  };

  const loadExample = (type: string) => {
    const ex = EXAMPLES[type];
    if (ex) {
      setFormName(ex.name);
      setFormJson(JSON.stringify(ex.json, null, 2));
      setJsonError(null);
    }
  };

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.txt";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        try {
          const parsed = JSON.parse(text);
          setFormJson(JSON.stringify(parsed, null, 2));
          setJsonError(null);
          if (!formName) setFormName(file.name.replace(/\.(json|txt)$/i, ""));
          toast.success("Arquivo carregado!");
        } catch {
          setFormJson(text);
          setJsonError("O arquivo não contém JSON válido");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportAll = () => {
    if (configs.length === 0) { toast.info("Nenhuma configuração para exportar"); return; }
    const exportData = configs.map(c => ({
      name: c.name,
      type: c.type,
      active: c.active,
      json_content: c.json_content,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatsapp-json-configs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Configurações exportadas!");
  };

  const handleImportBulk = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const arr = JSON.parse(ev.target?.result as string);
          if (!Array.isArray(arr)) { toast.error("O arquivo deve conter um array de configurações"); return; }
          let count = 0;
          for (const item of arr) {
            if (!item.name || !item.json_content) continue;
            await supabase.from("whatsapp_json_configs").insert({
              user_id: user.id,
              name: item.name,
              type: item.type || "carousel",
              json_content: item.json_content,
              active: item.active ?? true,
            });
            count++;
          }
          toast.success(`${count} configuração(ões) importada(s)!`);
          loadConfigs();
        } catch {
          toast.error("Arquivo inválido");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Configurações JSON</h3>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={handleImportBulk} className="gap-1">
            <Upload className="h-3 w-3" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll} className="gap-1" disabled={configs.length === 0}>
            <Download className="h-3 w-3" /> Exportar
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Crie e gerencie JSONs para carrosséis, mensagens interativas, templates e tools da IA. 
        O webhook usará automaticamente as configs ativas.
      </p>

      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="w-full gap-2" variant="outline">
          <Plus className="h-4 w-4" /> Nova Configuração JSON
        </Button>
      ) : (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{editingId ? "Editar" : "Nova"} Configuração</h4>
            <Button variant="ghost" size="sm" onClick={resetForm}>Cancelar</Button>
          </div>

          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Carrossel principal" />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONFIG_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-1 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => loadExample(formType)} className="gap-1 text-xs">
              <FileJson className="h-3 w-3" /> Carregar exemplo
            </Button>
            <Button variant="outline" size="sm" onClick={handleUpload} className="gap-1 text-xs">
              <Upload className="h-3 w-3" /> Upload .json
            </Button>
          </div>

          <div className="space-y-2">
            <Label>JSON</Label>
            <Textarea
              value={formJson}
              onChange={e => {
                setFormJson(e.target.value);
                if (e.target.value.trim()) validateJson(e.target.value);
                else setJsonError(null);
              }}
              placeholder='{"key": "value"}'
              rows={10}
              className="font-mono text-xs"
            />
            {jsonError && (
              <p className="text-xs text-destructive">❌ JSON inválido: {jsonError}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label>Ativo</Label>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editingId ? "Atualizar" : "Salvar"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : configs.length === 0 ? (
        <Alert>
          <AlertDescription className="text-xs">
            Nenhuma configuração JSON criada ainda. Clique em "Nova Configuração" ou "Importar" para começar.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-2">
          {configs.map(config => (
            <Collapsible key={config.id}>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-muted/20">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="p-1 h-auto">
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </CollapsibleTrigger>
                    <FileJson className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{config.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {CONFIG_TYPES.find(t => t.value === config.type)?.label || config.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto"
                      onClick={() => handleToggleActive(config)}
                      title={config.active ? "Desativar" : "Ativar"}
                    >
                      {config.active ? <Eye className="h-3.5 w-3.5 text-green-500" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="p-1 h-auto" onClick={() => handleEdit(config)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="p-1 h-auto text-destructive" onClick={() => handleDelete(config.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CollapsibleContent>
                  <pre className="p-3 text-xs font-mono overflow-auto max-h-48 bg-background border-t border-border">
                    {JSON.stringify(config.json_content, null, 2)}
                  </pre>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
