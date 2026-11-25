// Saves the weekly report's raw data to data/weekly-raw.json: 15 days of per-item daily prices and sold counts, the daily
// megaphone and ranking rollups (worker /report/raw), plus the current megaphone stats. The deploy workflow runs this
// before each build; a failed fetch keeps the committed file. scripts/weekly-report.mjs turns it into the page.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const file = new URL('../data/weekly-raw.json', import.meta.url);
const get = async (path) => {
  const r = await fetch(`${config.voteApi}${path}`, { headers: process.env.GMS_READ_KEY ? { 'X-Gms-Key': process.env.GMS_READ_KEY } : {}, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

try {
  const [raw, megaStats] = await Promise.all([get('/report/raw'), get('/megaphones/stats')]);
  writeFileSync(file, `${JSON.stringify({ ...raw, megaStats })}\n`);
  console.log(`weekly raw: ${Object.keys(raw.items).length} items over ${raw.days.length} days, ${raw.mega.length} megaphone days, ${raw.rank.length} ranking days`);
} catch (e) {
  console.warn(`weekly raw: kept the committed file (${e.message})`);
}
