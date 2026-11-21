// Option-capture coverage from the collector log: of the item megaphones whose items carry options
// (equipment, scrolls), how many got complete options, partial options, or nothing.
// Usage: node mega-coverage.mjs [fromISO] [toISO]     (times compare with each message's seen= time, UTC)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [from = '0', to = '9'] = process.argv.slice(2);
const log = fs.readFileSync(path.join(os.homedir(), 'gms-hub-samples', 'mega-collector.log'), 'utf8').split('\n');
const jobs = new Map(); // key -> {state, reasons:Set, mode}
const key = (nick, item, seen) => `${seen}|${nick}|${item}`;
for (const line of log) {
  let m = line.match(/^options (partial )?(\S+) \[([^\]]+)\] \{.*\(\d+ms[^)]*\) mode=(\S+) seen=(\S+)/);
  if (m) {
    const [, partial, nick, item, mode, seen] = m;
    if (seen < from || seen > to) continue;
    const j = jobs.get(key(nick, item, seen)) || { state: 'none', reasons: new Set(), mode };
    if (!partial) j.state = 'complete';
    else if (j.state !== 'complete') j.state = 'partial';
    j.mode = mode;
    jobs.set(key(nick, item, seen), j);
    continue;
  }
  m = line.match(/^options skipped (\S+) \[([^\]]+)\]: (.*?) \(\d+ms[^)]*\) mode=(\S+) seen=(\S+)/);
  if (m) {
    const [, nick, item, reason, mode, seen] = m;
    if (seen < from || seen > to) continue;
    const j = jobs.get(key(nick, item, seen)) || { state: 'none', reasons: new Set(), mode };
    j.reasons.add(reason);
    if (mode !== '?') j.mode = mode;
    jobs.set(key(nick, item, seen), j);
    continue;
  }
  m = line.match(/^options unfinished (\S+) \[([^\]]+)\]: (.*?); attempts=\d+; seen=(\S+)/);
  if (m) {
    const [, nick, item, reason, seen] = m;
    if (seen < from || seen > to) continue;
    const j = jobs.get(key(nick, item, seen)) || { state: 'none', reasons: new Set(), mode: '?' };
    j.reasons.add(reason);
    j.unfinished = true;
    jobs.set(key(nick, item, seen), j);
  }
}
const all = [...jobs.values()].filter(j => j.state !== 'none' || j.unfinished);
const count = s => all.filter(j => j.state === s).length;
const n = all.length || 1;
console.log(`jobs ${all.length}: complete ${count('complete')} (${(100 * count('complete') / n).toFixed(1)}%), partial ${count('partial')}, nothing ${count('none')}`);
const why = new Map();
for (const j of all.filter(j => j.state !== 'complete')) for (const r of j.reasons) why.set(r, (why.get(r) || 0) + 1);
for (const [r, c] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  ${c}  ${r}`);
for (const [k, j] of jobs) if (j.state !== 'complete' && (j.unfinished || j.state === 'partial')) console.log(`  - ${j.state} ${k} :: ${[...j.reasons].join(' / ')}`);
