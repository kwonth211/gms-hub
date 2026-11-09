// Public, anonymous GETs only. Mutations and collector credentials never enter this cache.
const paths = new Set(['/votes','/prices','/prices/recent','/listings/recent','/market/top','/market/item',
  '/market/catalog','/market/listings','/market/reports','/market/history']);
export async function cachedPublicResponse(req, load, ctx) {
  const url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('Authorization') || !paths.has(url.pathname) || !globalThis.caches?.default) return load();
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
