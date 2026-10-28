// Renders assets/og-{ko,en}.png (1200x630 link previews). Needs Chrome + playwright-core:
//   npm i --no-save playwright-core && node scripts/og.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { heroScene, spriteSvg } from './sprites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sites = JSON.parse(fs.readFileSync(path.join(root, 'data/sites.json'), 'utf8'));
const count = sites.categories.reduce((n, c) => n + c.sites.length, 0);
const copy = {
  ko: { title: '클래식 월드 사이트,<br>여기서 다 찾으세요', sub: `시세 · 보스 타이머 · 빌드 플래너 · 커뮤니티 ${count}곳`, badge: '메이플스토리 클래식 월드' },
  en: { title: 'Every Classic World site,<br>in one place', sub: `Prices · Boss timers · Build planners · ${count} sites`, badge: 'MapleStory Classic World' }
};
const css = fs.readFileSync(path.join(root, 'assets/style.css'), 'utf8');

const browser = await chromium.launch({ channel: 'chrome' });
for (const [lang, c] of Object.entries(copy)) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${css} body{margin:0;width:1200px;height:630px;overflow:hidden}
.og{position:relative;width:1200px;height:630px}.og .hero-scene{position:absolute;inset:0;width:100%;height:100%}
.og-card{position:absolute;left:64px;top:64px;width:700px;background:rgba(15,20,32,.92);border:1px solid #2a3550;border-radius:24px;padding:44px}
.og-card h1{font-size:60px;margin:14px 0 16px;font-weight:800;line-height:1.15}.og-card p{font-size:26px;color:#9aa7bf;margin:0}
.og-brand{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800}</style></head>
<body><div class="og">${heroScene()}<div class="og-card"><div class="og-brand">${spriteSvg('mushroom', 56)}GMS Hub</div>
<h1>${c.title}</h1><p>${c.sub}</p><p style="margin-top:14px;color:#ffb15c;font-weight:800">${c.badge}</p></div></div></body></html>`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(root, `assets/og-${lang}.png`) });
  await page.close();
}
await browser.close();
console.log('og images written');
