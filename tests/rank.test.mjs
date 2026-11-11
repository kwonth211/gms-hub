import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshRank, lookupCharacter } from '../worker/src/rank.js';

const row = (i) => ({ name: `Char${i}`, level: 92 - (i % 10), job: 'Hunter', job_tier: 2, family: 'Bowman', fame: 1, overall_rank: i, job_rank: 1, photo: 'x', verified: true, last_checked: '2026-11-11T00:00:00Z', extra: 'ignored' });
function db() {
  const store = new Map();
  return { store, prepare(sql) { return { bind(...a) { this.a = a; return this; }, async first() { return store.has('rank') && sql.includes('SELECT at') ? { at: store.get('rank').at } : null; },
    async run() { store.set('rank', { json: this.a[0], at: '2026-11-11 00:00:00' }); return {}; } }; } };
}

test('a ranking refresh reads 20 pages of 50, keeps only shown fields, and skips within the hour', async () => {
  const env = { DB: db() };
  let calls = 0;
  const fetcher = async (u) => { calls++;
    if (u.includes('/stats')) return Response.json({ data: { characters: 325000, highest_level: 92 } });
    const page = Number(new URL(u).searchParams.get('page'));
    return Response.json({ data: Array.from({ length: 50 }, (_, i) => row((page - 1) * 50 + i + 1)), meta: { next: page < 20 ? 'more' : null } });
  };
  const r = await refreshRank(env, Date.now(), fetcher, async () => {});
  assert.equal(r.stored, 1000); assert.equal(calls, 21);
  const data = JSON.parse(env.DB.store.get('rank').json);
  assert.equal(data.rows[0].name, 'Char1'); assert.equal(data.rows[0].extra, undefined); assert.equal(data.stats.characters, 325000);
  assert.equal((await refreshRank(env, Date.parse('2026-11-11T00:30:00Z'), fetcher, async () => {})).skipped, 'recent');
});

test('character lookup validates names and passes through not-found', async () => {
  assert.equal((await lookupCharacter('bad name!')).status, 400);
  const nf = await lookupCharacter('Nobody', async () => new Response('', { status: 404 }));
  assert.equal(nf.status, 404);
  const ok = await lookupCharacter('Char1', async () => Response.json({ data: row(1) }));
  assert.equal(ok.body.data.rank, 1); assert.equal(ok.body.data.extra, undefined);
});
