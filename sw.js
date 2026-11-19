/* sw.js – KKYKC-app (B4, 19/11/2026). Service worker: bewaart ENKEL de app-bestanden (pagina's, scripts, iconen) zodat de app snel opent
   en installeerbaar is. NOOIT gegevens: aanroepen naar de API (script.google.com) en de Google-aanmelding gaan altijd rechtstreeks naar het net
   en worden niet bewaard (andere oorsprong → deze service worker komt er niet aan).
   VERSIE en BESTANDEN vult bouw_app.py in: elke wijziging aan een app-bestand geeft een nieuwe versie → melding "Nieuwe versie beschikbaar". */
'use strict';
var VERSIE = '62f34e83fe', CACHE = 'kkykc-app-' + VERSIE, BESTANDEN = ["api.js", "apple-touch-icon.png", "dashboard.html", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "index.html", "manifest.webmanifest", "mijn.html", "planner.html", "privacy.html", "trainers.html", "xlsx.full.min.js"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BESTANDEN.map(function (f) { return new Request(f, { cache: 'reload' }); })); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (n) { return n.indexOf('kkykc-app-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'nu') self.skipWaiting(); });   /* knop Vernieuwen */
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;   /* API en Google: altijd het net, nooit bewaard */
  var pad = u.pathname.split('/').pop() || 'index.html';
  if (BESTANDEN.indexOf(pad) < 0) return;
  e.respondWith(caches.open(CACHE).then(function (c) { return c.match(pad).then(function (m) { return m || fetch(r); }); }));
});
