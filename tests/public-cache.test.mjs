import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPublicResponse } from '../worker/src/public-cache.js';

async function withCache(check) {
  const entries = new Map();
  globalThis.caches = { default: {
    match: async req => entries.get(req.url)?.clone(),
    put: async (req, res) => entries.set(req.url, res.clone())
  } };
  try { await check(); } finally { delete globalThis.caches; }
}

test('ignored query parameters and trailing duplicate values cannot create extra backend reads', async () => {
  await withCache(async () => {
    let reads = 0;
    const get = async query => {
      const req = new Request('https://test/market/listings' + query);
      return cachedPublicResponse(req, async () => {
        reads++;
        return Response.json({ page: new URL(req.url).searchParams.get('page') }, { headers: { 'Cache-Control': 'public, max-age=60' } });
      });
    };
    for (const query of ['?page=2', '?page=2&unused=1', '?unused=2&page=2', '?page=2&page=999', '?page=2&__gms_cors=forged'])
      assert.deepEqual(await (await get(query)).json(), { page: '2' });
    assert.equal(reads, 1);
    assert.deepEqual(await (await get('?page=3')).json(), { page: '3' });
    assert.equal(reads, 2);
  });
});

test('listing filters, report kinds and item-specific data never share the wrong cached response', async () => {
  await withCache(async () => {
    const pairs = [
      ['/market/listings?item=2040801', '/market/listings?item=2040802'],
      ['/market/listings?ids=2040801', '/market/listings?ids=2040802'],
      ['/market/listings?seller=Seller&exact=1', '/market/listings?seller=Seller&exact=0'],
      ['/market/listings?channel=1&room=1', '/market/listings?channel=1&room=2'],
      ['/market/listings?state=open&sort=price', '/market/listings?state=sold&sort=price'],
      ['/market/listings?min=1&max=100', '/market/listings?min=1&max=200'],
      ['/market/listings?stat=PAD&val=48', '/market/listings?stat=PAD&val=49'],
      ['/market/listings?days=7&limit=50', '/market/listings?days=30&limit=50'],
      ['/market/listings?since=2026-11-20T00:00:00Z', '/market/listings?since=2026-11-20T01:00:00Z'],
      ['/market/reports?kind=buying', '/market/reports?kind=selling'],
      ['/prices?ids=2040801', '/prices?ids=2040802'],
      ['/market/item?id=2040801', '/market/item?id=2040802'],
      ['/market/history?id=2040801', '/market/history?id=2040802'],
      ['/megaphones?item=2040801', '/megaphones?item=2040802'],
      ['/megaphones?after=5&limit=30', '/megaphones?after=6&limit=30'],
      ['/free-megas?after=5', '/free-megas?after=6'],
      ['/rank/lookup?name=Alice', '/rank/lookup?name=Bob'],
    ];
    for (const paths of pairs) for (const path of paths) {
      const res = await cachedPublicResponse(new Request('https://test' + path), async () =>
        Response.json({ path }, { headers: { 'Cache-Control': 'public, max-age=60' } }));
      assert.deepEqual(await res.json(), { path });
    }
  });
});

test('endpoints without query options share a cached response across tracking parameters', async () => {
  await withCache(async () => {
    for (const path of ['/market/catalog', '/market/top', '/prices/all', '/report/raw', '/news']) {
      let reads = 0;
      for (const suffix of ['', '?_t=1', '?_t=2&utm_source=test']) {
        await cachedPublicResponse(new Request('https://test' + path + suffix), async () => {
          reads++;
          return Response.json({}, { headers: { 'Cache-Control': 'public, max-age=60' } });
        });
      }
      assert.equal(reads, 1, path);
    }
  });
});

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
