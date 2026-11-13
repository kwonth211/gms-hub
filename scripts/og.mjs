// Generate 1200x630 share cards from the current hero artwork.
// HTML previews (no dependencies): node scripts/og.mjs --html-only /path/to/previews
// PNGs: npm i --no-save playwright-core && node scripts/og.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroScene, spriteSvg } from './sprites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copy = {
  ko: { title: '글클메의 모든 여정,<br>여기서 시작하세요.', sub: '아이템·실시간 시세·사냥터·공략', badge: '글로벌 메이플스토리 클래식 월드' },
  en: { title: 'Your Maple journey<br>starts here.', sub: 'Items · Live prices · Training · Guides', badge: 'Global MapleStory Classic World' },
  zh: { title: '你的楓之谷旅程，<br>從這裡開始。', sub: '道具・即時價格・練功地點・攻略', badge: '全球楓之谷經典世界' },
  ja: { title: 'メイプルの冒険は、<br>ここから。', sub: 'アイテム・リアルタイム相場・狩場・攻略', badge: 'グローバル メイプルストーリー クラシックワールド' },
};
const css = fs.readFileSync(path.join(root, 'assets/style.css'), 'utf8');
// Read the same pixel silhouette as the live animation, so share cards cannot drift to another logo.
const storm = fs.readFileSync(path.join(root, 'assets/hero-storm.js'), 'utf8');
const rows = storm.match(/const MAPLE = \[([\s\S]*?)\];/)?.[1].match(/[01]{17}/g);
if (rows?.length !== 17) throw new Error('Cannot read the live maple silhouette');
const pixels = rows.flatMap((row, y) => [...row].flatMap((v, x) => v === '1' ? [`<rect x="${x * 14}" y="${y * 14}" width="14" height="14"/>`] : [])).join('');
const crest = `<svg class="crest" viewBox="0 0 460 440" aria-hidden="true"><defs>
<linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="36" y2="238"><stop stop-color="#fff0ba"/><stop offset=".45" stop-color="#ffd17b"/><stop offset="1" stop-color="#e78a3e"/></linearGradient>
<radialGradient id="halo"><stop stop-color="#ffcd7a" stop-opacity=".32"/><stop offset="1" stop-color="#ffcd7a" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="230" cy="215" rx="226" ry="210" fill="url(#halo)"/>
<g fill="none" stroke="#ffd28a"><ellipse cx="230" cy="230" rx="197" ry="76" transform="rotate(-23 230 230)" opacity=".45"/><ellipse cx="230" cy="230" rx="185" ry="69" transform="rotate(21 230 230)" opacity=".25"/><circle cx="230" cy="214" r="156" opacity=".13"/></g>
<g transform="translate(117 103)" fill="#95522d" shape-rendering="crispEdges">${pixels}</g>
<g transform="translate(111 94)" fill="url(#gold)" shape-rendering="crispEdges">${pixels}</g>
${Array.from({length:18},(_,i)=>{const a=i*2.399;const x=230+Math.cos(a)*(174+(i%3)*14),y=220+Math.sin(a)*(112+(i%4)*13);return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${i*29}) scale(${.028+(i%3)*.012})" opacity="${.45+(i%4)*.12}" fill="#ffd38a">${pixels}</g>`;}).join('')}
<path d="M340 108v22m-11-11h22M101 296v14m-7-7h14" stroke="#fff0c3" stroke-width="2"/></svg>`;

function html(lang, c) {
  return `<!doctype html><html lang="${lang}" data-theme="light"><head><meta charset="utf-8"><title>GMS Hub · ${lang} share preview</title>
<style>${css}
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Hiragino Sans","PingFang TC",sans-serif}
.og{position:relative;width:1200px;height:630px;overflow:hidden}.og .hero-scene{position:absolute;inset:0;width:100%;height:100%}.og .hero-scene *{animation:none!important}
.og:after{content:"";position:absolute;inset:0;border:1px solid #ffffff18;pointer-events:none}
.og-card{position:absolute;left:54px;top:86px;width:665px;padding:38px 38px 34px;background:#fff7ed;border:1px solid #ffe5b6;border-radius:24px;box-shadow:0 18px 55px #2919232b;color:#302a2b}
.og-brand{display:flex;align-items:center;gap:13px;font-size:30px;font-weight:850;letter-spacing:-1px}.og-brand svg{flex:none}.og-badge{margin:17px 0 0;font-size:16px;font-weight:700;letter-spacing:.6px;color:#92613f}
.og-card h1{font-size:49px;line-height:1.25;letter-spacing:-2px;font-weight:850;margin:20px 0 21px;word-break:keep-all}.og-card p.og-sub{font-size:23px;letter-spacing:-.7px;color:#69574b;margin:0;white-space:nowrap}
.og-bottom{margin-top:28px;border-top:1px solid #dcc7ae;padding-top:18px;display:flex;align-items:center;gap:9px;font-size:16px;font-weight:700;color:#89603e}.og-bottom i{width:7px;height:7px;background:#be8545;border-radius:50%}
.crest{position:absolute;left:714px;top:36px;width:460px;height:440px}
html[lang=ja] .og-badge{font-size:13px}html[lang=ja] .og-sub{font-size:20px}html[lang=zh] .og-card h1{letter-spacing:0}
</style></head><body><main class="og">${heroScene()}${crest}<section class="og-card"><div class="og-brand">${spriteSvg('mushroom',48)}GMS Hub</div><p class="og-badge">${c.badge}</p><h1>${c.title}</h1><p class="og-sub">${c.sub}</p><div class="og-bottom"><i></i>gms-hub.com</div></section></main></body></html>`;
}
if (process.argv.includes('--html-only')) {
  const destination = path.resolve(process.argv[process.argv.indexOf('--html-only') + 1] || '/tmp/gms-og-preview');
  fs.mkdirSync(destination, {recursive:true});
  for (const [lang,c] of Object.entries(copy)) fs.writeFileSync(path.join(destination, `og-${lang}.html`),html(lang,c));
  console.log(destination);
} else {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    for (const [lang,c] of Object.entries(copy)) {
      await page.setContent(html(lang,c));
      await page.screenshot({path:path.join(root,`assets/og-${lang}.png`)});
    }
  } finally { await browser.close(); }
  console.log('Four autumn share images written');
}
