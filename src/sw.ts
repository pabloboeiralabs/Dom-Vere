/// <reference lib="webworker" />

import { clientsClaim, skipWaiting } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Immediately take control of all pages
skipWaiting();
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
    badge: data.icon || '/icon-192.png',
    tag: data.tag || 'domvere-reminder',
    data: data.data || { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: true,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click Handler ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = (event.notification.data as { url?: string })?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing tab if available
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// Notify the page when a new SW is waiting (for auto-update UX)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
