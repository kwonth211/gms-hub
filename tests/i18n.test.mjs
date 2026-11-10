import test from 'node:test';
import assert from 'node:assert/strict';
import { entityMatcher, localizePage, mask, validTranslation } from '../scripts/i18n.mjs';

const loc = { code: 'zh', hreflang: 'zh-Hant', og: 'zh_TW', name: '繁體中文' };
const ctx = (memory) => ({ memory, missing: new Set(), keep: new Set(['English']), entities: entityMatcher(['Zombie Mushroom', 'Mushroom']), baseUrl: 'https://gms-hub.com', basePath: '' });

test('masking turns tags, numbers and game names into placeholders', () => {
  assert.equal(mask('Hits <b>Zombie Mushroom</b> 3 times', entityMatcher(['Zombie Mushroom', 'Mushroom'])).key, 'Hits {t0}{e0}{t1} {n0} times');
  assert.ok(validTranslation('{n0} hits', '{n0} 下'));
  assert.ok(!validTranslation('{n0} hits', '下'));
});

test('a page is translated and its links move to the locale', () => {
  const html = '<!doctype html><html lang="en"><head><title>Monsters | GMS Hub</title></head><body><a href="/en/monsters/">Monsters</a><p>Level 30 for <b>Mushroom</b>.</p><a href="/en/" hreflang="en">English</a></body></html>';
  const c = ctx({ 'Monsters | GMS Hub': '怪物 | GMS Hub', Monsters: '怪物', 'Level {n0} for {t0}{e0}{t1}.': '{t0}{e0}{t1} 需要 {n0} 等。' });
  const out = localizePage(html, loc, c);
  assert.match(out, /<html lang="zh-Hant">/);
  assert.match(out, /<title>怪物 \| GMS Hub<\/title>/);
  assert.match(out, /<a href="\/zh\/monsters\/">怪物<\/a>/);
  assert.match(out, /<p><b>Mushroom<\/b> 需要 30 等。<\/p>/);
  assert.match(out, /<a href="\/en\/" hreflang="en">English<\/a>/);
  assert.equal(c.missing.size, 0);
});

test('untranslated text stays English and is reported', () => {
  const c = ctx({});
  const out = localizePage('<html lang="en"><head></head><body><p>New sentence here</p></body></html>', loc, c);
  assert.match(out, /New sentence here/);
  assert.deepEqual([...c.missing], ['New sentence here']);
});
