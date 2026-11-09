import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPublicResponse } from '../worker/src/public-cache.js';

test('repeated public market requests use edge cache and preserve origin-specific CORS', async () => {
  const entries = new Map(); let reads = 0;
  globalThis.caches = { default: {
    match: async req => entries.get(req.url)?.clone(),
    put: async (req, res) => entries.set(req.url, res.clone())
  } };
  const request = origin => new Request('https://test/market/listings?limit=50&state=open', { headers: { Origin: origin } });
  const get = origin => cachedPublicResponse(request(origin), async () => {
    reads++; return Response.json({ rows: [] }, { headers: { 'Cache-Control': 'public, max-age=20', 'Access-Control-Allow-Origin': origin } });
  });
  try {
    assert.equal((await get('https://gms-hub.com')).headers.get('X-GMS-Cache'), 'MISS');
    const cached = await get('https://gms-hub.com');
    assert.equal(cached.headers.get('X-GMS-Cache'), 'HIT'); assert.equal(reads, 1);
    assert.equal(cached.headers.get('Access-Control-Allow-Origin'), 'https://gms-hub.com');
    await get('https://www.gms-hub.com'); assert.equal(reads, 2);
  } finally { delete globalThis.caches; }
});

test('credentials, writes, private endpoints, and errors never enter the public cache', async () => {
  let cached = 0;
  globalThis.caches = { default: { match: async () => null, put: async () => { cached++; } } };
  try {
    for (const req of [
      new Request('https://test/internal/market-batch'),
      new Request('https://test/market/listings', { headers: { Authorization: 'Bearer private' } }),
      new Request('https://test/listings', { method: 'POST', body: '{}' })
    ]) await cachedPublicResponse(req, async () => new Response('{}', { headers: { 'Cache-Control': 'public, max-age=20' } }));
    await cachedPublicResponse(new Request('https://test/market/listings'), async () => new Response('unavailable', { status: 503 }));
    assert.equal(cached, 0);
  } finally { delete globalThis.caches; }
});
