// The site's Korean writing must say things straight (docs/writing-rules.md, owner 2026-11-23). This counts the hedging
// words per source file. A file may not carry more of them than tests/voice-baseline.json records; files not listed
// there must carry none. Rewriting a file lowers its number in the baseline; nobody raises one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HEDGES = ['비교해요', '비교하세요', '비교한 뒤', '비교해 보', '견줘', '시험해요', '시험하세요', '시험해 보', '후보', '검토', '관측', '기준점', '조건부', '가정하', '라고 가정', '근거를 '];
const strip = (html) => html.replace(/<[^>]+>/g, ' ');
const koStrings = (o, out = []) => {
  if (Array.isArray(o)) o.forEach((x) => koStrings(x, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) (k === 'ko' && typeof v === 'string' ? out.push(v) : koStrings(v, out));
  return out;
};
const sources = () => {
  const out = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'data/guides')).filter((f) => f.endsWith('.ko.html'))) out[`data/guides/${f}`] = strip(fs.readFileSync(path.join(ROOT, 'data/guides', f), 'utf8'));
  for (const f of fs.readdirSync(path.join(ROOT, 'data/quest-guides')).filter((f) => f.endsWith('.json'))) out[`data/quest-guides/${f}`] = koStrings(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quest-guides', f), 'utf8'))).map(strip).join('\n');
  out['data/training.json'] = koStrings(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/training.json'), 'utf8'))).join('\n');
  return out;
};
export const countHedges = (text) => HEDGES.reduce((n, w) => n + text.split(w).length - 1, 0);

test('Korean writing does not hedge more than the recorded baseline (docs/writing-rules.md)', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/voice-baseline.json'), 'utf8')).files;
  const over = [];
  for (const [file, text] of Object.entries(sources())) {
    const n = countHedges(text), allowed = baseline[file] ?? 0;
    if (n > allowed) {
      const found = HEDGES.filter((w) => text.includes(w)).join(', ');
      over.push(`${file}: ${n} (allowed ${allowed}) — ${found}`);
    }
  }
  assert.deepEqual(over, [], `Hedging words went up. Say where to go or what to do instead ("~로 가요", "~에 잡혀야 해요"); see docs/writing-rules.md.\n${over.join('\n')}`);
});

test('the baseline only lists files that still carry hedging words, at their real count', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/voice-baseline.json'), 'utf8')).files;
  const src = sources();
  const stale = Object.entries(baseline).filter(([file, n]) => !(file in src) || countHedges(src[file]) < n).map(([file, n]) => `${file}: baseline ${n}, now ${file in src ? countHedges(src[file]) : 'missing'}`);
  assert.deepEqual(stale, [], `Lower these numbers in tests/voice-baseline.json (the writing got better):\n${stale.join('\n')}`);
});
