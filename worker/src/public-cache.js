// Public, anonymous GETs only. Mutations and collector credentials never enter this cache.
// Keep every parameter used by the handler, and discard unrelated cache-busting parameters.
// Handlers use URLSearchParams.get(), so only the first value of a repeated key affects the response.
const parameters = new Map([
  ['/votes', []], ['/prices', ['ids']], ['/prices/all', []], ['/prices/recent', []],
  ['/listings/recent', ['limit']], ['/market/top', []], ['/market/item', ['id']],
  ['/market/catalog', []],
  ['/market/listings', ['days', 'limit', 'page', 'state', 'sort', 'since', 'channel', 'room', 'item', 'ids', 'seller', 'exact', 'min', 'max', 'stat', 'val', 'opts']],
  ['/market/reports', ['limit', 'page', 'days', 'item', 'kind', 'ids']],
  ['/market/history', ['id', 'opts', 'stat', 'val']], ['/market/status', []], ['/rank', []], ['/rank/lookup', ['name']],
  ['/megaphones', ['after', 'limit', 'item']], ['/megaphones/stats', []], ['/scam', []],
  ['/free-megas', ['after', 'limit']], ['/market/scan-shops', []], ['/report/raw', []], ['/news', []]
]);
export async function cachedPublicResponse(req, load, ctx) {
  const url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('Authorization') || !parameters.has(url.pathname) || !globalThis.caches?.default) return load();
  const query = new URLSearchParams(url.search);
  url.search = '';
  for (const name of parameters.get(url.pathname)) {
    if (query.has(name)) url.searchParams.set(name, query.get(name));
  }
  // Old history keys omitted option filters and may contain another option's prices.
  if (url.pathname === '/market/history') url.searchParams.set('__gms_history', 'options-v1');
  // Isolate the small allowlist of CORS origins without trusting arbitrary Origin values.
  const origin = req.headers.get('Origin') || '';
  const origins = ['https://gms-hub.com','https://www.gms-hub.com','http://localhost:8790','http://127.0.0.1:8790'];
  url.searchParams.set('__gms_cors', origins.includes(origin) ? origin : 'public');
  url.searchParams.sort();
  const key = new Request(url, { method: 'GET' });
  const cache = caches.default;
  const hit = await cache.match(key).catch(() => null);
  if (hit) { const response = new Response(hit.body, hit); response.headers.set('X-GMS-Cache', 'HIT'); return response; }
  const response = await load();
  if (response.ok && /\bpublic\b/.test(response.headers.get('Cache-Control') || '')) {
    const write = cache.put(key, response.clone()).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(write); else await write;
  }
  response.headers.set('X-GMS-Cache', 'MISS');
  return response;
}
