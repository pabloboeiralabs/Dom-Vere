import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2 } from "lucide-react";

interface WhatsAppQrCodeProps {
  value: string;
  className?: string;
}

function looksLikeImageBase64(value: string) {
  return /^(iVBORw0KGgo|\/9j\/|R0lGOD|PHN2Z)/.test(value.trim());
}

export function WhatsAppQrCode({ value, className = "w-64 h-64" }: WhatsAppQrCodeProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raw = value.trim();

    if (!raw) {
      setSrc(null);
      return;
    }

    if (raw.startsWith("data:image") || raw.startsWith("http://") || raw.startsWith("https://")) {
      setSrc(raw);
      return;
    }

    if (looksLikeImageBase64(raw)) {
      setSrc(raw.startsWith("PHN2Z") ? `data:image/svg+xml;base64,${raw}` : `data:image/png;base64,${raw}`);
      return;
    }

    QRCode.toDataURL(raw, { margin: 1, width: 256 })
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center rounded-md border border-border bg-muted`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <img src={src} alt="QR Code do WhatsApp" className={`${className} rounded-md bg-background p-2`} />;
}