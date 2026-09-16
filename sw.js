const CACHE = "mc-v1";
const PRECACHE = [
  "assets/logo.png",
  "assets/photo-band-strip.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// ponytail: cache-first for assets, network-first for pages
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isAsset = /\.(png|jpe?g|webp|gif|svg|css|js|woff2?)$/i.test(url.pathname);

  e.respondWith(
    isAsset
      ? caches.open(CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; })))
      : fetch(e.request).catch(() => caches.match(e.request))
  );
});
