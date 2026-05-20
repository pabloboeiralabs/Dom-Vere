import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone } from "lucide-react";

export default function Campaigns() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Campanhas</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Campanhas de Mensagens
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Crie e gerencie campanhas de mensagens em massa para promoções, novidades e comunicados para seus clientes.
          </p>
          <div className="mt-6 p-8 rounded-lg border border-dashed border-border text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma campanha criada</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
