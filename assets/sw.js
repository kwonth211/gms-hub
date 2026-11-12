// GMS Hub service worker: price alerts only (no fetch handler, nothing cached). A push carries no payload; on each push
// this worker asks the API for its unseen alert hits and shows them. A click opens that item's market panel.
const API = '__API__';
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
