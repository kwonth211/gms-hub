// Merge filled-in translations from i18n/.missing/<code>.json into the memory i18n/<code>.json.
// Usage: node scripts/build.mjs → fill the empty values in i18n/.missing/<code>.json → node scripts/i18n-merge.mjs <code> → rebuild.
// Keep every {t0}/{n0}/{e0}/{name} placeholder exactly once; game names (items, monsters, maps, skills) stay in English.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validTranslation } from './i18n.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = process.argv[2];
if (!code) throw new Error('Usage: node scripts/i18n-merge.mjs <locale code>');
const memoryFile = path.join(root, 'i18n', `${code}.json`);
const filled = JSON.parse(fs.readFileSync(path.join(root, 'i18n', '.missing', `${code}.json`), 'utf8'));
const memory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
let added = 0;
for (const [key, value] of Object.entries(filled)) {
  if (!value) continue;
  if (!validTranslation(key, value) || vars(key) !== vars(value)) {
    console.warn(`Skipped (placeholders differ): ${key}`);
    continue;
  }
  memory[key] = value;
  added++;
}
fs.writeFileSync(memoryFile, `${JSON.stringify(Object.fromEntries(Object.entries(memory).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 1)}\n`);
console.log(`${code}: merged ${added} translations`);
