// Which pages differ from the live site: compares dist/page-hashes.json with the copy the live site published.
// Usage (before deploy): node scripts/changed-pages.mjs <live-hashes.json> > changed-urls.txt
// Only sitemap URLs are listed, so noindex pages and redirects never reach IndexNow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const next = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'page-hashes.json'), 'utf8'));
let prev = {};
try {
  prev = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
} catch {}
const sitemap = new Set([...fs.readFileSync(path.join(root, 'dist', 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const changed = Object.entries(next)
  .filter(([p, h]) => prev[p] !== h)
  .map(([p]) => `${config.baseUrl}${p}`)
  .filter((u) => sitemap.has(u));
process.stdout.write(changed.join('\n') + (changed.length ? '\n' : ''));
console.error(`${changed.length} changed of ${Object.keys(next).length} pages`);
