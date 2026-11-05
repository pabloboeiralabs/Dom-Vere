/// <reference lib="webworker" />

import { clientsClaim, skipWaiting } from 'workbox-core';
import { precacheAndRoute, matchPrecache } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {__WB_MANIFEST:{url:string;revision:string}[]};

// Take control of all pages immediately
clientsClaim();
skipWaiting();

// Precache all static assets (self.__WB_MANIFEST is injected by the application PWA build at build time)
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback: serve index.html for all navigation requests
registerRoute(new NavigationRoute(async () => {
  try { const response=await fetch('/index.html'); if(response.ok)return response; } catch { /* Best-effort fallback: the caller keeps the last valid state. */ }
  const cached=await matchPrecache('/index.html'); if(cached)return cached;
  return new Response('Sem conexão. Abra o aplicativo com internet uma vez para salvar os arquivos.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}));

// Clean up old caches from previous SW versions
import { cleanupOutdatedCaches } from 'workbox-precaching';
cleanupOutdatedCaches();

// ─── Push Notification Handler ───────────────────────────────────────
self.addEventListener('push', (event) => {
  let data: {title?:string;body?:string;icon?:string;badge?:string;image?:string;tag?:string;url?:string;data?:Record<string,unknown>;actions?:{action:string;title:string;icon?:string}[]} = {};

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
  const options: NotificationOptions & {image?:string;renotify?:boolean;vibrate?:number[];actions?:{action:string;title:string;icon?:string}[]} = {
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

  event.waitUntil((async()=>{
    const notificationId=(data.data)?.notificationId;
    if(notificationId){
      const current=await self.registration.getNotifications({tag:options.tag});
      if(current.some(notification=>notification.data?.notificationId===notificationId))return;
    }
    await self.registration.showNotification(title, options);
  })());
});

// ─── Notification Click Handler ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const action = event.action;

  // Helper: focus or open PWA at URL
  const navigateTo = async (url: string) => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      const target=new URL(url,self.location.origin),candidate=new URL(c.url);
      const scope=target.pathname.match(/^\/t\/[^/]+\//)?.[0];
      if (candidate.origin===target.origin && (scope?candidate.pathname.startsWith(scope):!candidate.pathname.startsWith('/t/')) && 'focus' in c) {
        await c.focus();
        if (typeof c.navigate === 'function') return c.navigate(url);
        c.postMessage({ type: 'NOTIFICATION_CLICK', url });
        return;
      }
    }
    return self.clients.openWindow(url);
  };

  event.waitUntil(
    (async () => {
      // Account changes require the authenticated PWA session, never just an appointment ID.
      if(action==='confirmar'||action==='cancelar'){
        event.notification.close();
        return navigateTo(data.url||('/cliente?confirm_appt='+encodeURIComponent(data.appointmentId||'')));
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

// Android/Web Share Target: receive the file locally; user chooses chat and confirms send.
self.addEventListener('fetch',(event)=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='POST'||url.pathname!=='/share-target')return;
 event.respondWith((async()=>{
  const form=await event.request.formData();const files=form.getAll('files').filter((value):value is File=>value instanceof File);
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('domvere-chat',1);request.onupgradeneeded=()=>{request.result.createObjectStore('cache');request.result.createObjectStore('shares',{autoIncrement:true});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('shares','readwrite');for(const file of files.slice(0,1))if(file.size<=20*1024*1024)transaction.objectStore('shares').add({file,name:file.name,type:file.type});transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});db.close();
  return Response.redirect(new URL('/barber-panel?shared=1',self.location.origin).href,303);
 })());
});

// Recover stale login screens after the API public key rotation (20261016).
self.addEventListener('activate', event => {
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   const url=new URL(client.url);
   if(url.origin===self.location.origin && /\/login\/?$/.test(url.pathname)){
    url.searchParams.set('app_update','login-20261016');
    await client.navigate(url.href);
   }
  }
 })());
});
