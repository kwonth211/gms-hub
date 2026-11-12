// GMS Hub service worker. Two jobs: the site's own files are served from a cache (below), and price alerts arrive as
// pushes. A push carries no payload; on each push this worker asks the API for its unseen alert hits and shows them.
// A click opens that item's market panel.
const API = '__API__';

// Files under /assets/ that carry ?v=<content hash> never change, so they are answered from the cache first and fetched
// once. The few unhashed ones (common.js, items.json, mobs.json, item-tips.json, pictures) are answered from the cache at
// once and refreshed behind, so the next page has the new copy. Pages themselves and the API always go to the network.
const CACHE = 'gms-assets-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  // Old hashed versions pile up across builds; keep the cache to a few hundred entries.
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  for (const req of keys.slice(0, Math.max(0, keys.length - 300))) await cache.delete(req);
  await clients.claim();
})()));
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/assets/')) return;
  const hashed = url.searchParams.has('v');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const fresh = () => fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()).catch(() => {}); return res; });
    if (hit) { if (!hashed) fresh().catch(() => {}); return hit; }
    return fresh();
  })());
});
const T = {
  ko: (h) => [`${h.name} ${h.price.toLocaleString('ko')} 메소`, `CH ${h.channel}${h.room ? ` · 방 ${h.room}` : ''} · ${h.seller} · 원하는 가격 이하로 올라왔어요`],
  en: (h) => [`${h.name} at ${h.price.toLocaleString('en-US')} mesos`, `CH ${h.channel}${h.room ? ` · room ${h.room}` : ''} · ${h.seller} · at or under your price`],
};
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    let hits = [];
    try {
      const r = await fetch(`${API}/alerts/hits?endpoint=${encodeURIComponent(sub?.endpoint || '')}`);
      hits = (await r.json()).hits || [];
    } catch {}
    if (!hits.length) return self.registration.showNotification('GMS Hub', { body: 'Price alert', tag: 'gms-alert', icon: '/assets/icon-192.png' });
    for (const h of hits.slice(0, 3)) {
      const [title, body] = (T[h.lang] || T.en)(h);
      await self.registration.showNotification(title, { body, tag: `gms-alert-${h.item}`, icon: `https://maplestory.io/api/MCW/1/item/${h.item}/icon`, badge: '/assets/icon-192.png', data: { url: `/${['ko', 'en', 'zh', 'ja'].includes(h.lang) ? h.lang : 'en'}/tools/market/?item=${h.item}&src=alert` } });
    }
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes('/tools/market/'));
    return open ? open.navigate(url).then((c) => c?.focus()) : clients.openWindow(url);
  }));
});
