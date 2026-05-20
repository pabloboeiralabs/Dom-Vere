import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Wifi, WifiOff, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppQrCode } from "./WhatsAppQrCode";

interface Props {
  config: { api_url: string; instance_token: string } | null;
  instanceStatus: any;
  onConnect: (phone?: string) => Promise<any>;
  onDisconnect: () => Promise<void>;
  onGetStatus: () => Promise<any>;
}

export function WhatsAppConnect({ config, instanceStatus, onConnect, onDisconnect, onGetStatus }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [connectMode, setConnectMode] = useState<"qr" | "paircode">("qr");
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const errorCountRef = useRef(0);

  const status = instanceStatus?.status || "disconnected";

  useEffect(() => {
    if (config && status !== "connected") {
      errorCountRef.current = 0;
      const poll = async () => {
        try {
          const s = await onGetStatus();
          errorCountRef.current = 0;
          if (s?.qrcode) setQrCode(s.qrcode);
          if (s?.paircode) setPairCode(s.paircode);
          if (s?.status === "connected") {
            setQrCode(null);
            setPairCode(null);
          }
        } catch (error: any) {
          errorCountRef.current++;
          console.error("Erro ao consultar status do WhatsApp", error);
          if (errorCountRef.current >= 5) {
            // Stop polling after 5 consecutive errors
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      };
      pollRef.current = setInterval(poll, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [config, status, onGetStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = connectMode === "paircode" && phone
        ? await onConnect(phone)
        : await onConnect();
      if (result?.qrcode) setQrCode(result.qrcode);
      if (result?.paircode) setPairCode(result.paircode);
      toast.success("Solicitação de conexão enviada");
    } catch (error: any) {
      console.error("Erro ao conectar WhatsApp", error);
      toast.error(error?.message || "Erro ao conectar WhatsApp");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await onDisconnect();
      setQrCode(null);
      setPairCode(null);
      await onGetStatus();
      toast.success("WhatsApp desconectado");
    } catch (error: any) {
      console.error("Erro ao desconectar WhatsApp", error);
      toast.error(error?.message || "Erro ao desconectar WhatsApp");
    }
  };

  const statusTone = status === "connected" ? "text-primary" : status === "connecting" ? "text-foreground" : "text-destructive";
  const statusLabel = status === "connected" ? "Conectado" : status === "connecting" ? "Conectando..." : "Desconectado";

  if (!config) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <WifiOff className="h-6 w-6 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-foreground">WhatsApp não configurado</h3>
            <p className="text-sm text-muted-foreground">Solicite ao administrador que configure a instância do WhatsApp.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        {status === "connected" ? <Wifi className={`h-6 w-6 ${statusTone}`} /> : <WifiOff className={`h-6 w-6 ${statusTone}`} />}
        <div>
          <h3 className="font-semibold text-foreground">Status da Conexão</h3>
          <p className={`text-sm font-medium ${statusTone}`}>{statusLabel}</p>
        </div>
      </div>

      {status !== "connected" && (
        <div className="space-y-3 rounded-lg border border-border p-4 bg-card">
          <h4 className="text-sm font-medium text-foreground">Conectar WhatsApp</h4>
          <div className="flex gap-2">
            <Button variant={connectMode === "qr" ? "default" : "outline"} size="sm" onClick={() => setConnectMode("qr")}>
              <QrCode className="h-4 w-4 mr-1" /> QR Code
            </Button>
            <Button variant={connectMode === "paircode" ? "default" : "outline"} size="sm" onClick={() => setConnectMode("paircode")}>
              <Smartphone className="h-4 w-4 mr-1" /> Paircode
            </Button>
          </div>
          {connectMode === "paircode" && (
            <div className="space-y-2">
              <Label>Número com DDI (ex: 5511999999999)</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
            </div>
          )}
          <Button onClick={handleConnect} disabled={connecting} className="w-full" variant="default">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Conectar
          </Button>

          {qrCode && connectMode === "qr" && (
            <div className="flex flex-col items-center gap-2 p-4 bg-background rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">Escaneie o QR Code com seu WhatsApp</p>
              <WhatsAppQrCode value={qrCode} />
            </div>
          )}

          {pairCode && connectMode === "paircode" && (
            <div className="flex flex-col items-center gap-2 p-4 bg-background rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">Digite este código no seu WhatsApp</p>
              <span className="text-3xl font-mono font-bold tracking-widest text-foreground">{pairCode}</span>
            </div>
          )}
        </div>
      )}

      {status === "connected" && (
        <div className="space-y-3">
          {instanceStatus?.profileName && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              {instanceStatus.profilePicUrl && (
                <img src={instanceStatus.profilePicUrl} alt="" className="h-10 w-10 rounded-full" />
              )}
              <div>
                <p className="font-medium text-foreground">{instanceStatus.profileName}</p>
                <p className="text-xs text-muted-foreground">Conectado</p>
              </div>
            </div>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">Desconectar</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  Você será desconectado da instância do WhatsApp. Para usar novamente, será necessário reconectar.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDisconnect}>Desconectar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
