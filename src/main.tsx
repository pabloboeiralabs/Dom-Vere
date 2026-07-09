import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ─── PWA: Forçar atualização automática, nunca travar em cache antigo ───
if ("serviceWorker" in navigator) {
  const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0";

  // 1. Limpar service workers ÓRFÃOS (de versões antigas com scope errado)
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const currentScope = self.location.origin + "/";
    for (const reg of registrations) {
      // Remove SWs que não são do scope atual (ex: /cliente → /)
      if (reg.scope !== currentScope && !reg.scope.startsWith(currentScope)) {
        console.log("[PWA] Unregistering old SW:", reg.scope);
        reg.unregister();
      }
    }
  });

  // 2. Quando um NOVO SW é detectado, força ativação imediata
  navigator.serviceWorker.ready.then((reg) => {
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      console.log("[PWA] New SW found, forcing activation...");
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          console.log("[PWA] New SW installed, skipWaiting...");
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  });

  // 3. Recarregar quando novo SW assume controle
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    console.log("[PWA] New version activated, reloading...");
    window.location.reload();
  });

  // 4. Verificar atualizações a cada 60 segundos
  setInterval(() => {
    navigator.serviceWorker.ready.then((reg) => {
      reg.update().catch(() => {});
    });
  }, 60_000);

  // 5. Ouvir mensagens do SW (ex: NOTIFICATION_CLICK redirect)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "NOTIFICATION_CLICK" && event.data?.url) {
      console.log("[PWA] Redirecting to:", event.data.url);
      window.location.href = event.data.url;
    }
  });

  // 6. Cache busting: registrar SW com versão dinâmica p/ furar cache Cloudflare
  const bustCache = () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) {
        // Registrar com versão dinâmica se ainda não registrado
        navigator.serviceWorker.register("/sw.js?v=" + APP_VERSION);
      }
    });
  };
  // Tentar logo após o load
  if (document.readyState === "complete") bustCache();
  else window.addEventListener("load", bustCache);
}

console.log("%c🚀 DomVere v" + (import.meta.env.VITE_APP_VERSION || "1.0"), "color: #7c3aed; font-size: 16px; font-weight: bold;");
createRoot(document.getElementById("root")!).render(<App />);
