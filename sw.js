// Bump VERSION whenever any file below changes, so phones pick up the new copy.
const VERSION = 'sg-v3';
const FILES = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/curriculum.js', 'SYLLABUS.md', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'js/content/web-request.js', 'js/content/transport.js', 'js/content/oop.js', 'js/content/perf-terms.js',
  'js/content/estimation.js', 'js/content/solid-1.js', 'js/content/solid-2.js', 'js/content/scale-basics.js',
  'js/content/lb-algos.js', 'js/content/proxies.js', 'js/content/creational.js', 'js/content/cache-layers.js',
  'js/content/eviction.js',
  'js/content/realtime.js', 'js/content/brokers.js', 'js/content/ratelimit.js', 'js/content/cachewrite.js',
  'js/content/dbchoice.js', 'js/content/scaling.js', 'js/content/behavioral.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first: the app must open instantly with no or slow internet.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
