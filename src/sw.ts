/// <reference lib="webworker" />

import { clientsClaim, skipWaiting } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Take control of all pages (only after user allows via SKIP_WAITING message)
clientsClaim();

// Precache all static assets (self.__WB_MANIFEST is injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback: serve index.html for all navigation requests
registerRoute(new NavigationRoute(async () => {
  return await fetch('/index.html');
}));

// Clean up old caches from previous SW versions
import { cleanupOutdatedCaches } from 'workbox-precaching';
cleanupOutdatedCaches();

// ─── Push Notification Handler ───────────────────────────────────────
self.addEventListener('push', (event) => {
  let data: Record<string, string> = {};

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    // If payload is not JSON, use raw text as body
    const text = event.data?.text() ?? '';
    data = { body: text };
  }

  const title = data.title || 'Dom Vere';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    // Badge: monochrome status bar icon (Android). Use dedicated badge if available
    badge: data.badge || '/badge.png',
    // Image: hero image for expanded notification (Android)
    image: data.image || undefined,
    tag: data.tag || 'zlabs-notificacao',
    renotify: true,
    data: data.data || { url: data.url || '/' },
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    silent: false,
    actions: data.actions || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click Handler ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const action = event.action;

  // Helper: focus or open PWA at URL
  const navigateTo = async (url: string) => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if (c.url.includes(self.location.origin) && 'focus' in c) {
        await c.focus();
        if ('navigate' in c) return c.navigate(url);
        c.postMessage({ type: 'NOTIFICATION_CLICK', url });
        return;
      }
    }
    return self.clients.openWindow(url);
  };

  event.waitUntil(
    (async () => {
      // ── Action: Confirmar Presença (silent background) ──
      if (action === 'confirmar') {
        event.notification.close();
        const apptId = data.appointmentId;
        if (apptId) {
          try {
            const apiUrl = self.location.origin + '/rest/v1/rpc/client_confirm_appointment';
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_appointment_id: apptId }),
            });
            if (res.ok) {
              // Show success notification
              await self.registration.showNotification('✅ Presença confirmada!', {
                body: 'Seu horário está garantido. Te esperamos! 💈',
                icon: '/icon-192.png',
                badge: '/badge.png',
                tag: 'confirmacao',
                vibrate: [100, 50, 100],
              });
            }
          } catch (_) { /* silent fail */ }
        }
        return;
      }

      // ── Action: Cancelar Presença (silent background) ──
      if (action === 'cancelar') {
        event.notification.close();
        const apptId = data.appointmentId;
        if (apptId) {
          try {
            const apiUrl = self.location.origin + '/rest/v1/rpc/client_portal_cancel_appointment';
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_appointment_id: apptId }),
            });
            if (res.ok) {
              // Show cancellation success notification
              await self.registration.showNotification('❌ Horário cancelado', {
                body: 'Seu agendamento foi cancelado com sucesso.',
                icon: '/icon-192.png',
                badge: '/badge.png',
                tag: 'cancelamento-confirmado',
                vibrate: [100, 50, 100],
              });
            }
          } catch (_) { /* silent fail */ }
        }
        return;
      }

      // ── Action: Reagendar ──
      if (action === 'reagendar') {
        event.notification.close();
        const reagendarUrl = data.reagendarUrl || data.url || '/';
        return navigateTo(reagendarUrl);
      }

      // ── Default: clicou no corpo da notificação ──
      event.notification.close();
      const urlToOpen = data.url || '/';
      return navigateTo(urlToOpen);
    })()
  );
});

// Notify the page when a new SW is waiting (for auto-update UX)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
