import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sellBody, scrollProfitBody, tradeBoardBody } from '../scripts/trade-pages.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const args = { api: 'https://api.test', itemsUrl: '/assets/items.json', dataUrl: '/assets/forge-data.json', marketUrl: '/ko/tools/market/', megaphoneUrl: '/ko/megaphone/', sellUrl: '/ko/tools/sell/', scamUrl: '/ko/scam/', forgeUrl: '/ko/tools/forge/', scrollUrl: '/ko/tools/scroll/' };
const ids = (html) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

test('the two trade pages carry every element their script fills', () => {
  for (const [body, script] of [[sellBody, 'assets/sell.js'], [scrollProfitBody, 'assets/scroll-profit.js'], [tradeBoardBody, 'assets/trade-board.js']]) {
    const js = read(script);
    const wanted = new Set([...js.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]).filter((id) => !/-retry$/.test(id)));
    for (const m of js.matchAll(/getElementById\('([a-z0-9-]+)'\)/g)) wanted.add(m[1]);
    assert.ok(wanted.size > 8);
    for (const lang of ['ko', 'en']) {
      const html = body({ ...args, lang });
      const have = ids(html);
      for (const id of wanted) assert.ok(have.has(id), `${script} uses #${id}, missing in the ${lang} page`);
      assert.equal(have.size, [...html.matchAll(/ id="/g)].length, 'no id twice');
      assert.match(html, /<h1>[^<]+<\/h1>/);
      assert.ok((html.match(/<details>/g) || []).length >= 4, 'FAQ written into the page');
      assert.match(html, /<noscript>/);
    }
  }
});

test('trade pages: Korean and English say the same things', () => {
  for (const body of [sellBody, scrollProfitBody, tradeBoardBody]) {
    const ko = body({ ...args, lang: 'ko' }), en = body({ ...args, lang: 'en' });
    assert.deepEqual([...ids(ko)].sort(), [...ids(en)].sort());
    assert.equal((ko.match(/<li/g) || []).length, (en.match(/<li/g) || []).length);
    assert.equal((ko.match(/<details>/g) || []).length, (en.match(/<details>/g) || []).length);
    assert.doesNotMatch(en, /[가-힣]/, 'no Korean left in the English page');
  }
});

test('trade tools keep their class names clear of the traffic dashboard (td-)', () => {
  for (const f of ['assets/sell.js', 'assets/scroll-profit.js', 'assets/trade-board.js', 'assets/trade-ui.js', 'scripts/trade-pages.mjs']) assert.doesNotMatch(read(f), /[^r]td-/, f);
});

test('header: six menus, calculators moved into the menu they are used with, both new tools under Trade', () => {
  const build = read('scripts/build.mjs');
  const block = (name) => build.slice(build.indexOf(`const ${name} = [`), build.indexOf('];', build.indexOf(`const ${name} = [`)));
  const paths = (name) => [...block(name).matchAll(/\['(\/[^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(paths('marketItems'), ['/tools/market/', '/tools/market/?view=listings', '/tools/market/today/']);
  assert.deepEqual(paths('tradeItems'), ['/trade/', '/tools/scan/', '/tools/sell/', '/tools/scroll-profit/', '/tools/scroll/', '/tools/forge/']);
  assert.deepEqual(paths('megaItems'), ['/megaphone/', '/scam/']);
  for (const p of ['/tools/damage/', '/tools/exp/', '/tools/drop-rate/', '/monsters/']) assert.ok(paths('huntItems').includes(p), p);
  assert.ok(!paths('huntItems').includes('/forgotten-hollow/'));
  assert.ok(paths('guideItems').includes('/forgotten-hollow/'));
  assert.doesNotMatch(build, /toolMenu|toolItems/);
});
