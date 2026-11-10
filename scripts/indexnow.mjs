// Tell IndexNow search engines (Bing, Naver, Yandex, Seznam) which URLs changed.
// Run after a deploy is live: node scripts/indexnow.mjs [changed-urls.txt]
// With a file (CI: scripts/changed-pages.mjs output) only those URLs are sent; without one, every sitemap URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const urlList = process.argv[2]
  ? fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)
  : [...fs.readFileSync(path.join(root, 'dist', 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) {
  console.log('No changed URLs; nothing to send.');
  process.exit(0);
}
const host = new URL(config.baseUrl).host;

const keyUrl = `${config.baseUrl}/${config.indexNowKey}.txt`;
const live = await fetch(keyUrl).then((r) => (r.ok ? r.text() : ''));
if (live.trim() !== config.indexNowKey) {
  console.error(`Key file not live yet at ${keyUrl}; deploy first.`);
  process.exit(1);
}

for (const endpoint of ['https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow']) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: config.indexNowKey, keyLocation: keyUrl, urlList })
  });
  console.log(`${endpoint}: ${res.status} (${urlList.length} URLs)`);
}
