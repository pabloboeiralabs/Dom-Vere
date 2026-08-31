import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ─── Prevenir pull-to-refresh (Android Chrome ignora overscroll-behavior no body overflow:hidden) ───
if ("ontouchstart" in window) {
  let touchStartY = 0;
  window.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const deltaY = e.touches[0].clientY - touchStartY;
    if (deltaY <= 0) return; // só interessa swipe para baixo

    const el = e.target as Element | null;
    const scrollable = el && typeof el.closest === "function"
      ? (el.closest(".overflow-y-auto, .overflow-auto, .overflow-scroll") as HTMLElement | null)
      : null;
    const atTop = scrollable ? scrollable.scrollTop <= 0 : window.scrollY <= 0;
    if (atTop) e.preventDefault();
  }, { passive: false });
}

// ─── PWA: Forçar atualização automática, nunca travar em cache antigo ───
if ("serviceWorker" in navigator) {
  const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0";

  // 1. Limpar service workers ÓRFÃOS (scope errado ou URL sem versão)
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const currentScope = self.location.origin + "/";
    for (const reg of registrations) {
      const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
      const wrongScope = reg.scope !== currentScope && !reg.scope.startsWith(currentScope);
      // Registros antigos (ex: /sw.js sem ?v=) do registerSW.js removido
      const staleUnversioned = scriptUrl.startsWith(currentScope) && !scriptUrl.includes("?v=");
      if (wrongScope || staleUnversioned) {
        console.log("[PWA] Unregistering old SW:", scriptUrl || reg.scope);
        reg.unregister();
      }
    }
  });

  // (Atualização automática + reload removidos: causavam reload loop no PWA.
  //  O SW é registrado abaixo e atualiza silenciosamente no próximo load.)

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
