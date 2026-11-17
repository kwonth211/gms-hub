import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/src/index.js';
import { sameSecret, bodyTooLarge } from '../worker/src/secure.js';
import { refreshRank } from '../worker/src/rank.js';

const noDb = { DB: { prepare() { throw new Error('the database must not be reached'); } }, VOTE_SALT: 'local-test-only' };
const post = (path, { origin, body = '{}', method = 'POST', headers = {} } = {}) =>
  worker.fetch(new Request('https://test.invalid' + path, { method, headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json', ...headers }, body: method === 'DELETE' ? undefined : body }), noDb);

test('secrets are compared by digest: equal only when identical, never for empty or missing values', async () => {
  assert.equal(await sameSecret('Bearer abc', 'Bearer abc'), true);
  assert.equal(await sameSecret('Bearer abd', 'Bearer abc'), false);
  assert.equal(await sameSecret('', ''), false);
  assert.equal(await sameSecret(undefined, 'Bearer abc'), false);
  assert.equal(await sameSecret('x'.repeat(600), 'x'.repeat(600)), false);
});

test('free megaphone and price-alert writes are refused from any page that is not the site', async () => {
  for (const [path, method] of [['/free-megas', 'POST'], ['/free-megas/report', 'POST'], ['/free-megas?id=1&key=k', 'DELETE'], ['/alerts', 'POST'], ['/alerts?endpoint=x&item=1', 'DELETE']]) {
    for (const origin of [undefined, 'https://evil.example', 'https://gms-hub.com.evil.example']) {
      const r = await post(path, { origin, method });
      assert.equal(r.status, 403, `${method} ${path} from ${origin}`);
    }
  }
});

test('an oversized public form is refused before it is read, and answers are marked nosniff', async () => {
  assert.equal(bodyTooLarge(new Request('https://t.invalid', { method: 'POST', headers: { 'Content-Length': '70000' }, body: 'x' })), true);
  const r = await post('/listings', { origin: 'https://gms-hub.com', headers: { 'Content-Length': '70000' } });
  assert.equal(r.status, 413);
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('the unused chat socket is closed and a flood of live-count joins from one address is refused', async () => {
  assert.equal((await worker.fetch(new Request('https://test.invalid/chat', { headers: { Upgrade: 'websocket', Origin: 'https://gms-hub.com' } }), noDb)).status, 404);
  let asked = null;
  const env = { ...noDb, RL_READ: { limit: async (o) => { asked = o.key; return { success: false }; } } };
  const r = await worker.fetch(new Request('https://test.invalid/presence?p=/', { headers: { Upgrade: 'websocket', Origin: 'https://gms-hub.com', 'CF-Connecting-IP': '203.0.113.9' } }), env);
  assert.equal(r.status, 429);
  assert.equal(asked, 'ws:203.0.113.9');
});

test('ranking rows from the other site are forced to numbers, short strings and an https picture', async () => {
  const store = new Map();
  const env = { DB: { prepare: (sql) => ({ bind(...a) { this.a = a; return this; }, async first() { return null; }, async run() { store.set('rank', this.a[0]); return {}; } }) } };
  const evil = { name: 'Char1', level: '<img src=x onerror=alert(1)>', job: 'Hunter', job_tier: 2, family: 'Bowman', fame: '"><script>', overall_rank: '1', job_rank: null, photo: 'javascript:alert(1)', verified: 1, last_checked: 'x' };
  const fetcher = async (u) => (u.includes('/stats') ? Response.json({ data: {} }) : Response.json({ data: Array.from({ length: 50 }, () => evil), meta: {} }));
  await refreshRank(env, Date.now(), fetcher, async () => {});
  const row = JSON.parse(store.get('rank')).rows[0];
  assert.equal(row.level, null); assert.equal(row.fame, null); assert.equal(row.rank, 1); assert.equal(row.jobRank, null); assert.equal(row.photo, '');
});

test('the owner pages load no third-party script', () => {
  const build = fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.equal((build.match(/noindex: true, bare: true/g) || []).length, 2);
});
