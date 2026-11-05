import {tenantBase} from "./lib/tenant";
import { preventPullToRefresh } from "./lib/preventPullToRefresh";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Bloquear atualização pelo gesto sem impedir rolagem interna.
if ("ontouchstart" in window) preventPullToRefresh();

// ─── PWA: Forçar atualização automática, nunca travar em cache antigo ───
if ("serviceWorker" in navigator && (window.location.hostname!=="barbearias.zlabs.com.br"||!!tenantBase()) && window.location.pathname!=="/acesso-barbearias") {
  const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0";

  // 1. Limpar service workers ÓRFÃOS (scope errado ou versão desatualizada)
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const currentScope = self.location.origin + (tenantBase()?tenantBase()+"/":"/");
    for (const reg of registrations) {
      const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
      const wrongScope = false; // Never remove another shop's worker.
      // Registros antigos sem versão ou com versão antiga que não corresponde à ativa
      const staleVersion = reg.scope===currentScope && (!scriptUrl.includes("?v=") || !scriptUrl.includes("?v="+APP_VERSION));
      if (wrongScope || staleVersion) {
        console.log("[PWA] Unregistering old/stale SW:", scriptUrl || reg.scope);
        reg.unregister();
      }
    }
  });

  // 2. Força atualização imediata quando um novo SW é detectado
  navigator.serviceWorker.ready.then((reg) => {
    reg.update().catch(() => {}); // verifica update logo ao carregar
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  });

  // 3. Recarrega quando o novo SW assume controle (uma vez por deploy)
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Preserve the client's active screen when a worker updates in the background.
    // The next normal opening loads the new application bundle.
    const clientPortal = window.location.pathname.startsWith("/cliente") || /^(agendar|cliente|client)\./.test(window.location.hostname);
    if (refreshing || clientPortal || document.querySelector("[data-native-scroll]")) return;
    refreshing = true;
    window.location.reload();
  });

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
      const activeUrl = (tenantBase()?"/tenant-sw.js?v=":"/sw.js?v=")+APP_VERSION;
      const scriptUrl = reg?.active?.scriptURL || reg?.installing?.scriptURL || reg?.waiting?.scriptURL || "";
      if (!reg || reg.scope!==location.origin+(tenantBase()?tenantBase()+"/":"/") || !scriptUrl.includes("?v="+APP_VERSION)) {
        // Registrar com versão dinâmica se ainda não registrado ou se versão antiga
        navigator.serviceWorker.register(activeUrl,{scope:tenantBase()?tenantBase()+"/":"/"});
      }
    });
  };
  // Tentar logo após o load
  if (document.readyState === "complete") bustCache();
  else window.addEventListener("load", bustCache);
}

console.log("%c🚀 DomVere v" + (import.meta.env.VITE_APP_VERSION || "1.0"), "color: #7c3aed; font-size: 16px; font-weight: bold;");
createRoot(document.getElementById("root")!).render(<App />);
