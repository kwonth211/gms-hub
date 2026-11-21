// Background for the live item share cards (worker/src/og-card.js): the site's autumn pixel landscape with the crest's
// golden halo on the right, where the card puts the item. No text; the worker draws the panel, item and prices on top.
// Also writes the mushroom logo as a PNG for the card's brand row.
// Run: node scripts/og-item-bg.mjs <dir with playwright-core>   → assets/og-item-bg.png, assets/og-mushroom.png
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { heroScene, spriteDataPng } from './sprites.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'assets/style.css'), 'utf8');
const halo = `<svg style="position:absolute;left:760px;top:40px;width:420px;height:420px" viewBox="0 0 460 440"><defs><radialGradient id="h"><stop stop-color="#ffcd7a" stop-opacity=".42"/><stop offset="1" stop-color="#ffcd7a" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="230" cy="215" rx="226" ry="210" fill="url(#h)"/><g fill="none" stroke="#ffd28a"><ellipse cx="230" cy="230" rx="197" ry="76" transform="rotate(-23 230 230)" opacity=".45"/><ellipse cx="230" cy="230" rx="185" ry="69" transform="rotate(21 230 230)" opacity=".25"/></g>
<path d="M360 108v22m-11-11h22M91 296v14m-7-7h14M120 90v12m-6-6h12" stroke="#fff0c3" stroke-width="2"/></svg>`;
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${css}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}.og{position:relative;width:1200px;height:630px;overflow:hidden}.og .hero-scene{position:absolute;inset:0;width:100%;height:100%}.og .hero-scene *{animation:none!important}</style></head>
<body><main class="og">${heroScene()}${halo}</main></body></html>`;
const require = createRequire(path.join(process.argv[2] || root, 'package.json'));
const { chromium } = require('playwright-core');
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(root, 'assets/og-item-bg.png') });
await b.close();
fs.writeFileSync(path.join(root, 'assets/og-mushroom.png'), Buffer.from(spriteDataPng('mushroom', 6).split(',')[1], 'base64'));
console.log('ok');
