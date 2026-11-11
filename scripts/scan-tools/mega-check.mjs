// Quality check for the megaphone collector: scores the recent log lines and lists the ones that look misread.
// Run: node mega-check.mjs [lines=300]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const N = Number(process.argv[2]) || 300;
const log = fs.readFileSync(path.join(os.homedir(), 'gms-hub-samples', 'mega-collector.log'), 'utf8').split('\n');
const rows = log.map((l) => /^(\d\d:\d\d:\d\d) (\w+)\s+CH\s?(\d+) (\S+): (.*)$/.exec(l)).filter(Boolean).slice(-N)
  .map(([, at, kind, ch, nick, text]) => ({ at, kind, ch: Number(ch), nick, text }));
const items = new Set(JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'assets', 'items-names.json'), 'utf8')));

// Signs of a misread: symbols the game font can't make, long runs of the same mark, a mostly-symbol message, a nick
// that is only a few capitals, or a bracketed item name that matches nothing in the catalogue.
const flags = (r) => {
  const out = [];
  if (/[£©®°¢¥§«»€¬±]/.test(r.text)) out.push('symbol');
  if (/(.)\1{5,}/.test(r.text.replace(/[!?.~ @]/g, ''))) out.push('run');
  const odd = r.text.replace(/[A-Za-z0-9\s]/g, '').length / Math.max(1, r.text.length);
  if (odd > 0.25) out.push('noisy');
  if (/^[A-Z]{1,4}$/.test(r.nick) || r.nick.length < 3) out.push('nick');
  const b = /\[([^\]]+)\]/.exec(r.text);
  if (b && !items.has(b[1].toLowerCase())) out.push('item?');
  if (r.text.length < 3) out.push('short');
  return out;
};
const bad = rows.map((r) => ({ ...r, flags: flags(r) })).filter((r) => r.flags.length);
const withItem = rows.filter((r) => /\[[^\]]+\]/.test(r.text)).length;
const itemMiss = bad.filter((r) => r.flags.includes('item?')).length;
console.log(`최근 ${rows.length}개 확성기 · 의심 ${bad.length}개 (${rows.length ? Math.round((bad.length / rows.length) * 100) : 0}%)`);
console.log(`아이템 이름 인식: ${withItem - itemMiss}/${withItem} 일치`);
const byFlag = {};
for (const r of bad) for (const f of r.flags) byFlag[f] = (byFlag[f] || 0) + 1;
console.log('유형별:', JSON.stringify(byFlag));
for (const r of bad.slice(-15)) console.log(`  [${r.flags.join(',')}] ${r.at} CH${r.ch} ${r.nick}: ${r.text}`);
