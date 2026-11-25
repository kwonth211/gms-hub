// Build-time snapshots for pages whose live part is drawn by the browser, so the page a crawler or a no-JS reader gets
// still has real content: the rank page's top characters and class split, and the megaphone page's most-shouted items.
// The deploy workflow runs this before each build; a failed fetch keeps the committed files.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const get = async (path) => {
  const r = await fetch(`${config.voteApi}${path}`, { headers: process.env.GMS_READ_KEY ? { 'X-Gms-Key': process.env.GMS_READ_KEY } : {}, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};
const save = (name, data) => writeFileSync(new URL(`../data/${name}`, import.meta.url), `${JSON.stringify(data)}\n`);

try {
  const rank = await get('/rank');
  const rows = rank.rows || [];
  const count = (key) => Object.entries(rows.reduce((o, r) => ((o[r[key]] = (o[r[key]] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]);
  save('rank-snapshot.json', {
    at: rank.at, stats: { characters: rank.stats?.characters, highest_level: rank.stats?.highest_level },
    top: rows.slice(0, 30).map((r) => ({ rank: r.rank, name: r.name, job: r.job, family: r.family, level: r.level, fame: r.fame })),
    jobs: count('job'), families: count('family'),
    levels: rows.length ? { min: rows.at(-1).level, max: rows[0].level, median: rows[Math.floor(rows.length / 2)].level } : null
  });
  console.log(`rank snapshot: ${rows.length} rows`);
} catch (e) { console.warn(`rank snapshot kept: ${e.message}`); }

try {
  const s = await get('/megaphones/stats');
  save('mega-snapshot.json', { at: s.at, today: s.today, items: (s.items || []).slice(0, 12) });
  console.log(`megaphone snapshot: ${(s.items || []).length} items`);
} catch (e) { console.warn(`megaphone snapshot kept: ${e.message}`); }
