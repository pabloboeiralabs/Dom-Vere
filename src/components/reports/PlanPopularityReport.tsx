import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Crown, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanStat { plan_id: string; plan_name: string; client_count: number; }

const rankIcons = [Crown, Medal, Award];
const rankColors = ["text-yellow-500", "text-muted-foreground", "text-orange-400"];

export default function PlanPopularityReport() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanStat[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data } = await supabase.rpc("get_plan_popularity", { p_user_id: user.id });
        if (data) setPlans(data.map((r: any) => ({
          plan_id: r.plan_id, plan_name: r.plan_name, client_count: Number(r.client_count),
        })));
      } catch (e) { console.error(e); }
    };
    load();
  }, [user]);

  const top3 = plans.slice(0, 3);
  const rest = plans.slice(3);
  const totalClients = plans.reduce((s, p) => s + p.client_count, 0);

  if (plans.length === 0) {
    return (
      <Card className="border-border/50"><CardHeader><CardTitle className="text-foreground">Planos mais populares</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm text-center py-6">Nenhum plano ativo encontrado</p></CardContent></Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          Planos mais populares
          <Badge variant="secondary" className="text-xs font-normal">{totalClients} cliente{totalClients !== 1 ? "s" : ""} ativos</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {top3.map((plan, i) => {
          const Icon = rankIcons[i];
          const pct = totalClients > 0 ? (plan.client_count / totalClients) * 100 : 0;
          return (
            <div key={plan.plan_id} className="flex items-center gap-3">
              <Icon className={cn("h-5 w-5 shrink-0", rankColors[i])} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate">{plan.plan_name}</span>
                  <span className="text-sm text-muted-foreground ml-2 shrink-0">{plan.client_count} cliente{plan.client_count !== 1 ? "s" : ""}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} /></div>
              </div>
            </div>
          );
        })}
        {rest.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline w-full justify-center pt-2">
              {open ? "Ocultar" : `Ver todos (${plans.length})`}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {rest.map((plan, i) => {
                const pct = totalClients > 0 ? (plan.client_count / totalClients) * 100 : 0;
                return (
                  <div key={plan.plan_id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{i + 4}º</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{plan.plan_name}</span>
                        <span className="text-sm text-muted-foreground ml-2 shrink-0">{plan.client_count} cliente{plan.client_count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
