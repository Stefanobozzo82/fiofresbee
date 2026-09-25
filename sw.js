// Service worker di Fio Fresbee.
// Serve a due cose: rende il gioco "installabile" (Chrome/Edge/Android lo richiedono per mostrare
// il pulsante 📲) e lo fa funzionare anche senza internet, tenendo in cache i file del gioco.
//
// Strategia:
//  - pagina principale: prima la rete (così un aggiornamento pubblicato arriva subito), cache se offline
//  - file del gioco e libreria Supabase: risposta immediata dalla cache, aggiornata in background
//  - classifica, salvataggi e sfida online (API Supabase): mai in cache, sempre dal vivo
//
// Quando cambi i file del gioco, aumenta VERSION: la vecchia cache viene cancellata.
const VERSION = 'fiofresbee-v2';
const CORE = [
  './',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'css/style.css',
  'js/config.js',
  'js/core.js',
  'js/missions.js',
  'js/leaderboard.js',
  'js/save.js',
  'js/pwa.js',
  'js/audio.js',
  'js/ui.js',
  'js/game.js',
  'js/render.js',
  'js/multiplayer.js',
  'js/bot.js',
  'js/main.js'
];
const CDN = 'https://cdn.jsdelivr.net/';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !req.url.startsWith(CDN)) return;   // API Supabase & co: sempre dalla rete

  if (req.mode === 'navigate'){
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(req).then(cached => {
        const fresh = fetch(req)
          .then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || fresh;
      })
    )
  );
});
