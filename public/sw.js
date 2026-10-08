'use strict';
// Service Worker: Statische Dateien (JS/CSS/Schriften/Bilder) kommen aus dem Cache und werden
// im Hintergrund erneuert. Seiten, API und Uploads gehen IMMER ans Netz (nie veraltete Spielstände).
const CACHE = 'tp-static-v2';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/img/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (!/^\/(js|css|fonts|img|vendor)\//.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    // Netz zuerst (immer aktuelle Version nach einem Update), Cache nur als Offline-Rückfall
    try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch (err) { const hit = await c.match(req); if (hit) return hit; throw err; }
  }));
});

/* ---------- Web-Push: Benachrichtigungen aus dem Spiel (Briefe, Chat-Erwähnungen, Angebote …) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Turning Point', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
    // Ist das Spiel gerade sichtbar im Vordergrund, zeigt die Glocke im Spiel den Hinweis – keine doppelte Meldung
    if (cl.some((c) => c.visibilityState === 'visible' && c.focused)) return null;
    return self.registration.showNotification(String(d.title || 'Turning Point'), {
      body: String(d.body || ''), tag: String(d.tag || 'tp'), renotify: true,
      icon: '/img/icon-192.png', badge: '/img/icon-192.png', data: { url: String(d.url || '/play#/social'), tab: d.tab || '' },
    });
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const raw = (e.notification.data && e.notification.data.url) || '/play#/social';
  const url = new URL(raw, self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/play')) return; // nur interne Ziele
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (cl) => {
    const open = cl.find((c) => new URL(c.url).pathname.startsWith('/play'));
    if (open) { try { await open.focus(); if (open.navigate) return open.navigate(url.href); } catch (err) { /* neu öffnen */ } }
    return self.clients.openWindow(url.href);
  }));
});
