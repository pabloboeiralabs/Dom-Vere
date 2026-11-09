import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function ContactBotButton({ owner, chat }: { owner: string; chat: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    void supabase.from("crm_leads")
      .select("bot_enabled_when_global_off")
      .eq("user_id", owner)
      .eq("wa_chatid", chat)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!current) return;
        if (error) toast.error("Não foi possível consultar o bot deste número.");
        else setEnabled(data?.bot_enabled_when_global_off === true);
      });
    return () => { current = false; };
  }, [owner, chat]);

  const toggle = async () => {
    if (enabled === null || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_contact_bot_override", {
        p_chat: chat,
        p_enabled: !enabled,
      });
      if (error) throw error;
      setEnabled(!enabled);
      toast.success(enabled ? "Exceção removida deste número." : "Bot liberado para este número.");
    } catch {
      toast.error("Não foi possível alterar o bot deste número.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
      <p className="text-xs text-muted-foreground">Permitir resposta mesmo com o bot geral desligado</p>
      <Button size="sm" variant="outline" aria-pressed={enabled === true}
        disabled={enabled === null || busy} onClick={() => void toggle()}>
        {enabled ? "Remover exceção deste número" : "Ativar bot para este número"}
      </Button>
    </div>
  );
}
