import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, icons } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export default function Subscriptions() {
   const { user } = useAuth();
   const [priceBasico, setPriceBasico] = useState(0);
   const [pricePremium, setPricePremium] = useState(0);
   const [featuresBasico, setFeaturesBasico] = useState<string[]>([]);
    const [featuresPremium, setFeaturesPremium] = useState<string[]>([]);
    const [iconBasico, setIconBasico] = useState("Scissors");
    const [iconPremium, setIconPremium] = useState("Bot");
    const [subtitleBasico, setSubtitleBasico] = useState("Gestão completa de créditos");
    const [subtitlePremium, setSubtitlePremium] = useState("Automação via WhatsApp");
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const isPremium = user?.subscription_type === "premium";

  const loadData = useCallback(async () => {
    try {
      const [pricesRes, profileRes] = await Promise.all([
        supabase.from("subscription_pricing").select("type, price, features, icon, subtitle"),
        user?.id ? supabase.from("profiles").select("subscription_expires_at").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      for (const r of (pricesRes.data || []) as { type: string; price: number; features: string[]; icon: string; subtitle: string }[]) {
        if (r.type === "normal") { setPriceBasico(Number(r.price)); setFeaturesBasico(Array.isArray(r.features) ? r.features : []); setIconBasico(r.icon || "Scissors"); setSubtitleBasico(r.subtitle || ""); }
        if (r.type === "com_bot") { setPricePremium(Number(r.price)); setFeaturesPremium(Array.isArray(r.features) ? r.features : []); setIconPremium(r.icon || "Bot"); setSubtitlePremium(r.subtitle || ""); }
      }
      setExpiresAt((profileRes.data as any)?.subscription_expires_at || null);
    } catch (e) { console.error(e); }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
        <p className="text-muted-foreground text-sm mt-1">Escolha o plano ideal para o seu negócio</p>
      </div>

      {expiresAt && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${isExpired ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-primary/10 border-primary/30 text-foreground"}`}>
          {isExpired ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
          {isExpired
            ? `Sua assinatura expirou em ${format(new Date(expiresAt + "T12:00:00"), "dd/MM/yyyy")}. Entre em contato para renovar.`
            : `Assinatura válida até ${format(new Date(expiresAt + "T12:00:00"), "dd/MM/yyyy")}.`
          }
        </div>
      )}

      <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl items-stretch" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="relative rounded-xl border border-border bg-card p-6 flex flex-col shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{(() => { const I = icons[iconBasico as keyof typeof icons]; return I ? <I className="h-5 w-5 text-primary" /> : null; })()}</div>
            <div><h3 className="font-semibold text-foreground">Plano Básico</h3><p className="text-xs text-muted-foreground">{subtitleBasico}</p></div>
          </div>
          <div className="flex items-baseline gap-1 mt-4"><span className="text-3xl font-bold text-foreground">R$ {priceBasico.toFixed(2).replace(".", ",")}</span><span className="text-sm text-muted-foreground">/mês</span></div>
          <ul className="space-y-2 text-sm text-muted-foreground mt-4 flex-1">
            {featuresBasico.map((f, i) => (
              <li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {f}</li>
            ))}
          </ul>
          <Button className="w-full mt-4" variant={!isPremium ? "default" : "outline"} disabled={!isPremium}>{!isPremium ? "Plano Atual" : "Básico"}</Button>
        </div>
        <div className="relative rounded-xl border-2 border-primary bg-card p-6 flex flex-col shadow-md">
          <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-xs">Recomendado</Badge>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{(() => { const I = icons[iconPremium as keyof typeof icons]; return I ? <I className="h-5 w-5 text-primary" /> : null; })()}</div>
            <div><h3 className="font-semibold text-foreground">Plano Premium</h3><p className="text-xs text-muted-foreground">{subtitlePremium}</p></div>
          </div>
          <div className="flex items-baseline gap-1 mt-4"><span className="text-3xl font-bold text-foreground">R$ {pricePremium.toFixed(2).replace(".", ",")}</span><span className="text-sm text-muted-foreground">/mês</span></div>
          <ul className="space-y-2 text-sm text-muted-foreground mt-4 flex-1">
            {featuresPremium.map((f, i) => (
              <li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {f}</li>
            ))}
          </ul>
          <Button className="w-full mt-4" variant={isPremium ? "default" : "outline"} disabled={isPremium}>{isPremium ? "Plano Atual" : "Contratar"}</Button>
        </div>
      </motion.div>
    </div>
  );
}
