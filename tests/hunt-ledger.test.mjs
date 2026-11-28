import test from 'node:test';
import assert from 'node:assert/strict';
import { amount, settleHunt, savedSettlement, rankHunts } from '../assets/hunt-ledger.js';
import { huntLedgerBody, huntRecommendationsBody } from '../scripts/hunt-ledger.mjs';

const input = { start: '100000', end: '150000', potions: [{ name: 'Blue Potion', used: '100', price: '200' }] };
const row = (id, extra = {}) => ({ id, at: id + 600000, durationMs: 600000, activeMs: 600000, job: 'thief', level: 25, party: 1, gained: 10000, spot: 'Subway', settlement: { version: 1, sampleEnd: id + 600000, input }, ...extra });
const person = { job: 'thief', level: 25, party: 1 };

test('wallet gain less consumed supplies, with elapsed time for the hourly rate', () => {
  assert.deepEqual(settleHunt(input, 1800000), { ok: true, earned: 50000, supplyCost: 20000, net: 30000, perHour: 60000 });
});
test('mid-hunt purchases are not charged twice; unconsumed stock is not expensed', () => {
  // Start 100k; earn 50k; buy 40k of supplies; consume 20k; end 110k. Profit is 30k.
  assert.equal(settleHunt({ ...input, end: '110000', purchased: '40000' }, 600000).net, 30000);
});
test('unrelated transfers are removed and later drop sales are added once', () => {
  assert.equal(settleHunt({ ...input, end: '170000', otherIn: '30000', otherOut: '10000', soldAfter: '5000' }, 600000).net, 35000);
});
test('zero balances, free supplies and losses remain valid', () => {
  assert.equal(settleHunt({ start: '0', end: '0', noPotions: true }, 600000).net, 0);
  assert.equal(settleHunt({ ...input, end: '100000' }, 600000).net, -20000);
  assert.equal(settleHunt({ ...input, potions: [{ name: 'Free potion', used: 1, price: 0 }] }, 600000).supplyCost, 0);
});
test('blank balances, malformed numbers and partial supplies never become zero-profit records', () => {
  for (const v of ['', null, 'abc', '-1', '1.2', Infinity, true, [], '1e4', '1000000000001']) assert.equal(amount(v), null);
  for (const patch of [{ start: '' }, { end: '' }, { purchased: '-1' }, { potions: [] }, { potions: [{ name: 'Potion', used: '', price: '5' }] }]) assert.equal(settleHunt({ ...input, ...patch }, 600000).ok, false);
  assert.equal(settleHunt({ ...input, potions: [{ name: 'Potion', used: '1000000000000', price: '1000000000000' }] }, 600000).ok, false);
});
test('untimed drafts have a net amount but no hourly rate', () => {
  for (const duration of [undefined, NaN, 0, -1]) assert.equal(settleHunt(input, duration).perHour, null);
});
test('old records and settlements for an earlier endpoint are not silently reused', () => {
  assert.equal(savedSettlement({ mins: 20, perHour: 10000 }), null);
  assert.equal(savedSettlement(row(1, { at: 999999 })), null);
  assert.equal(savedSettlement(row(1)).net, 30000);
});
test('recommendations filter class, five-level window, party, short runs and unknown locations', () => {
  const records = [row(1), row(2, { job: 'mage' }), row(3, { level: 31 }), row(4, { party: 2 }), row(5, { durationMs: 599999 }), row(6, { spot: '' }), row(7, { settlement: null }), row(8, { gained: 0 })];
  const ranked = rankHunts(records, person);
  assert.equal(ranked.length, 1); assert.equal(ranked[0].n, 1);
  assert.equal(rankHunts(records, {}).length, 0);
});
test('rates weight elapsed time rather than averaging the session rates', () => {
  const a = row(1), b = row(2, { durationMs: 1800000, gained: 60000 });
  const [g] = rankHunts([a, b, a], person);
  assert.equal(g.n, 2); assert.equal(g.expPerHour, 105000); assert.equal(g.netPerHour, 90000);
});
test('party and gear settings stay separate, and all-negative results stay negative', () => {
  const a = row(1, { settlement: { version: 1, sampleEnd: 600001, input: { ...input, end: '100000', gear: '6 ATT' } } });
  const b = row(2, { party: 2 });
  const c = row(3);
  assert.equal(rankHunts([a, b, c], { job: 'thief', level: 25 }).length, 3);
  assert.equal(rankHunts([a], person)[0].netPerHour, -120000);
});
test('different maps within the same suggested route are not pooled', () => {
  const groups = rankHunts([row(1, { route: 'kerning', spot: 'Subway 1' }), row(2, { route: 'kerning', spot: 'Subway 2' })], person);
  assert.equal(groups.length, 2);
});
test('the settlement is optional and collapsed, with hidden empty recommendations in both languages', () => {
  for (const lang of ['ko', 'en']) {
    const html = huntLedgerBody(lang);
    assert.match(html, /<details class="panel hunt-ledger" id="hunt-ledger">/);
    assert.match(html, /id="hunt-personal" hidden/);
    assert.match(huntRecommendationsBody(lang, true), /data-hunt-finder/);
    for (const id of ['start', 'end', 'noPotions', 'purchased', 'otherIn', 'otherOut', 'soldAfter']) assert.ok(html.includes(`id="hl-${id}"`));
  }
});

test('supply prices reject missing data instead of silently charging zero', async () => {
  const { supplyQuote } = await import('../assets/hunt-supplies.js');
  assert.deepEqual(supplyQuote({ median: 210 }), { price: 210, basis: 'market' });
  assert.equal(supplyQuote({ median: null }), null);
  assert.equal(supplyQuote({ median: 0 }), null);
  assert.equal(supplyQuote({ median: -10 }), null);
  assert.equal(supplyQuote({ median: Infinity }), null);
  assert.equal(supplyQuote({ median: 350, basis: 'typical' }).basis, 'typical');
});
test('automatic contributions contain catalog IDs and numeric rates, never wallets or notes', async () => {
  const { contribution } = await import('../assets/hunt-contribution.js');
  const r = row(123456, { route: 'tree-slime', spot: 'private spot note', durationMs: 1200000, gained: 20000 });
  const body = contribution(r, 'client-12345', 'ko');
  assert.equal(body.perHour, 60000); assert.equal(body.netPerHour, 90000);
  for (const key of ['start','end','potions','gear','spot','input','settlement']) assert.equal(key in body, false);
  assert.equal(contribution({ ...r, route: null }, 'client-12345', 'ko'), null);
  assert.equal(contribution({ ...r, durationMs: 599999 }, 'client-12345', 'ko'), null);
  assert.equal(contribution({ ...r, settlement: null }, 'client-12345', 'ko').netPerHour, null);
});
test('supply search shows the traded potion instead of duplicate event copies', async () => {
  const { supplyRows } = await import('../assets/hunt-supplies.js');
  const rows = supplyRows([[2000008,'파란 포션','Blue Potion','Use','Potion',0,0],[2000003,'파란 포션','Blue Potion','Use','Potion',0,210],[2040001,'주문서','Scroll','Use','Scroll',0,100],[2000000,'빨간 포션','Red Potion','Use','Potion',0,0]]);
  assert.deepEqual(rows.map(r=>r[0]),[2000003,2000000]);
});
