const CACHE = "mc-v3";
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

// cache-first for images/fonts only; code (js/css) and pages go network-first so updates land
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isAsset = /\.(png|jpe?g|webp|gif|svg|woff2?)$/i.test(url.pathname);

  e.respondWith(
    isAsset
      ? caches.open(CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; })))
      : fetch(e.request).catch(() => caches.match(e.request))
  );
});

// phone notifications sent by the server (api/_push.js)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Music Club NITW", {
    body: d.body || "", icon: "assets/logo.png", badge: "assets/logo.png", tag: d.tag, data: { url: d.url || "/portal" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/portal", self.location.origin).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.startsWith(self.location.origin));
    return w ? w.focus().then(x => x.navigate(url)) : clients.openWindow(url);
  }));
});
