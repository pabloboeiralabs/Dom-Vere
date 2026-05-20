import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Smartphone, Monitor } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function ClientLayoutPreview() {
  const { user } = useAuth();
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const bookingUrl = user ? `${baseUrl}/booking/${user.id}` : "";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(bookingUrl);
    toast.success("Link copiado para a área de transferência!");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Visualização do Cliente (PWA)</h1>
          <p className="text-muted-foreground">Veja como seus clientes visualizam e realizam agendamentos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyToClipboard} className="gap-2">
            <Copy className="h-4 w-4" /> Copiar Link
          </Button>
          <Button onClick={() => window.open(bookingUrl, "_blank")} className="gap-2">
            <ExternalLink className="h-4 w-4" /> Abrir em Nova Aba
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" /> Como funciona?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Este é o link que você deve enviar para seus clientes ou colocar na bio do seu Instagram.
              </p>
              <div className="bg-muted p-3 rounded-lg break-all font-mono text-[10px] border border-border">
                {bookingUrl}
              </div>
              <ul className="list-disc pl-4 space-y-2">
                <li>O cliente escolhe o profissional e o serviço.</li>
                <li>Escolhe a data e horário disponíveis.</li>
                <li>Informa o nome e telefone.</li>
                <li>O agendamento cai direto no seu painel!</li>
              </ul>
              <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 text-primary-foreground">
                <p className="text-xs font-semibold text-primary mb-1">Dica de Ouro:</p>
                <p className="text-xs text-primary/80">
                  Instrua seus clientes a "Adicionar à Tela de Início" no celular para que o link vire um aplicativo (PWA).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="border-border/50 overflow-hidden bg-muted/30">
            <CardHeader className="bg-background border-b border-border/50 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> Pré-visualização ao vivo
                </CardTitle>
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                  <div className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex justify-center bg-muted/10 min-h-[600px] items-start pt-8 pb-8">
              {/* Phone Frame Simulator */}
              <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-xl">
                <div className="h-[32px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -left-[17px] top-[72px] rounded-l-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -left-[17px] top-[124px] rounded-l-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -left-[17px] top-[178px] rounded-l-lg"></div>
                <div className="h-[64px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -right-[17px] top-[142px] rounded-r-lg"></div>
                <div className="rounded-[2rem] overflow-hidden w-full h-full bg-white">
                  {bookingUrl ? (
                    <iframe
                      src={bookingUrl}
                      className="w-full h-full border-none"
                      title="Client View Preview"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-muted-foreground text-xs">Carregando...</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
