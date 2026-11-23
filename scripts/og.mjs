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
// Page cards (2026-11-18): the main pages get their own share card, so a link pasted in KakaoTalk or Discord says what
// it opens. Same artwork, the page's own title and line. Keys match SHARE_PAGES in scripts/build.mjs. No numbers that
// go stale (chat apps cache previews for days).
export const PAGE_CARDS = {
  market: { ko: { title: '글클메 실시간<br>자유시장 시세', sub: '지금 가장 싼 상점의 채널·방까지' }, en: { title: 'Live Free Market<br>prices', sub: 'The cheapest shop now, with channel and room' } },
  training: { ko: { title: '직업·레벨별<br>사냥터 추천', sub: '어디서 사냥할지, 물약값과 다음 이동까지' }, en: { title: 'Where to train,<br>by class and level', sub: 'Spots, potion costs and where to go next' } },
  quests: { ko: { title: '글클메 퀘스트<br>단계별 공략', sub: 'NPC 위치·사냥터·재료 시세까지' }, en: { title: 'Step-by-step<br>quest guides', sub: 'NPC spots, where to hunt, item prices' } },
  'best-meso': { ko: { title: '돈 버는<br>퀘스트 순위', sub: '오늘 시세로 계산한 순이익 순서' }, en: { title: 'Quests that make<br>the most mesos', sub: 'Ranked by profit at today\'s prices' } },
  megaphone: { ko: { title: '실시간 확성기', sub: '검색·시세 비교·귓말 복사' }, en: { title: 'Live megaphones', sub: 'Search, price check, one-tap whisper' } },
  newbie: { ko: { title: '글클메<br>뉴비 가이드', sub: '고확·자시·떡작 뜻부터 2차 전직까지' }, en: { title: 'Classic World<br>beginner guide', sub: 'Shorthand explained, day one to 2nd job' } }
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

// Right-hand art for page cards: each page shows what it is (a shop list, monsters and an EXP bar, a quest log, a
// podium of mesos, megaphone bubbles, glossary words). Item and NPC icons come from the game data API; monsters are the
// site's own pictures. Illustrations only: no live prices or counts.
const ICON = (id) => `https://maplestory.io/api/MCW/1.2/item/${id}/icon`;
const MOB = (id) => `data:image/gif;base64,${fs.readFileSync(path.join(root, 'assets/monsters', `${id}.gif`)).toString('base64')}`;
function art(key, lang) {
  const ko = lang === 'ko';
  if (key === 'market') {
    const rows = [[2070005, ko ? '뇌전 수리검' : 'Steely Throwing-Knives', 'CH 3 · FM 7', 'up'], [2040801, ko ? '장갑 공격력 60%' : 'Gloves Att 60%', 'CH 12 · FM 2', 'dn'], [1452005, ko ? '레드 바이퍼' : 'Red Viper', 'CH 8 · FM 15', 'up'], [1032007, ko ? '에메랄드 귀고리' : 'Emerald Earrings', 'CH 1 · FM 4', 'dn']];
    return `<div class="art"><svg style="position:absolute;left:10px;top:330px" width="410" height="120" viewBox="0 0 410 120"><polyline points="0,95 50,80 95,88 140,60 190,68 235,40 285,52 330,25 380,32 410,12" fill="none" stroke="#ffd17b" stroke-width="5" stroke-linejoin="round"/><polyline points="0,95 50,80 95,88 140,60 190,68 235,40 285,52 330,25 380,32 410,12 410,120 0,120" fill="#ffd17b33" stroke="none"/></svg>
<div class="pnl" style="left:18px;top:30px;width:392px;padding:18px 20px"><h3>${spriteSvg('coin', 26)}${ko ? '지금 파는 상점' : 'Shops selling now'}</h3>${rows.map(([id, n, at, t]) => `<div class="row"><img src="${ICON(id)}"><span class="nm">${n}</span><span class="chip">${at}</span><span class="${t}">${t === 'up' ? '▲' : '▼'}</span></div>`).join('')}</div>
<div style="position:absolute;left:320px;top:-6px">${spriteSvg('coin', 64)}</div><div style="position:absolute;left:372px;top:22px">${spriteSvg('coin', 44)}</div></div>`;
  }
  if (key === 'training') {
    const mobs = [[9, 2], [29, 2], [31, 1.6], [45, 1.25]];
    return `<div class="art"><div class="pnl" style="left:30px;top:20px;width:370px;padding:16px 20px"><h3>${spriteSvg('sword', 26)}${ko ? '사냥터 추천' : 'Training spots'}<span class="chip" style="margin-left:auto">Lv 31 → 40</span></h3>
<div style="font-size:15px;font-weight:800;color:#7a4a1f;margin:6px 0 6px">EXP</div><div style="height:22px;border-radius:999px;background:#f0dcc0;overflow:hidden"><div style="width:72%;height:100%;background:linear-gradient(90deg,#ffd76a,#ff9f43)"></div></div></div>
<div style="position:absolute;left:0;right:0;top:190px;height:240px;display:flex;align-items:flex-end;justify-content:space-around">${mobs.map(([id, k]) => `<img src="${MOB(id)}" style="transform:scale(${k});transform-origin:bottom center;margin:0 6px">`).join('')}</div>
<div style="position:absolute;left:24px;right:24px;top:432px;height:14px;border-radius:7px;background:#8a5a33"></div></div>`;
  }
  if (key === 'quests') {
    const steps = ko ? [['NPC와 대화', 1], ['몬스터 30마리 처치', 1], ['재료 모으기', 0], ['보상 받기', 0]] : [['Talk to the NPC', 1], ['Hunt 30 monsters', 1], ['Collect the items', 0], ['Claim the reward', 0]];
    return `<div class="art"><div style="position:absolute;left:318px;top:14px;width:76px;height:76px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3a6,#ffcf33 55%,#e09a12);border:4px solid #8a5a12;display:flex;align-items:center;justify-content:center;font:900 54px/1 -apple-system,sans-serif;color:#5b3a12;box-shadow:0 10px 24px #0005;z-index:2">!</div>
<div class="pnl" style="left:24px;top:52px;width:330px;padding:18px 20px"><h3>${spriteSvg('scroll', 26)}${ko ? '퀘스트 진행' : 'Quest log'}</h3>${steps.map(([t, d], i) => `<div class="row"><span style="width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;${d ? 'background:#16a34a;color:#fff' : 'border:2px solid #d8b78c;color:#a07a50'}">${d ? '✓' : i + 1}</span><span class="nm" style="${d ? 'color:#8a7b70;text-decoration:line-through' : ''}">${t}</span></div>`).join('')}</div>
<img src="${MOB(23)}" style="position:absolute;left:300px;top:330px;transform:scale(1.7)"><img src="${ICON(2040801)}" style="position:absolute;left:40px;top:372px;width:64px;height:64px"></div>`;
  }
  if (key === 'best-meso') {
    const pod = [[2, 2040805, 120], [1, 2040801, 170], [3, 1452005, 90]];
    return `<div class="art"><div style="position:absolute;left:20px;right:20px;bottom:40px;display:flex;align-items:flex-end;gap:14px;justify-content:center">${pod.map(([r, id, h]) => `<div style="width:118px;text-align:center"><img src="${ICON(id)}" style="width:56px;height:56px"><div style="margin-top:8px;height:${h}px;border-radius:14px 14px 0 0;background:${r === 1 ? 'linear-gradient(#ffe08a,#f5b942)' : r === 2 ? 'linear-gradient(#f1f1f1,#c9c9c9)' : 'linear-gradient(#f3c39a,#c9875a)'};display:flex;align-items:flex-start;justify-content:center;padding-top:12px;font:900 40px/1 sans-serif;color:#5b3a1f;box-shadow:0 10px 24px #2919232e">${r}</div></div>`).join('')}</div>
<div style="position:absolute;left:150px;top:10px">${spriteSvg('bag', 96)}</div>${[[60, 60, 46], [300, 40, 52], [360, 140, 38], [30, 160, 36]].map(([x, y, sz]) => `<div style="position:absolute;left:${x}px;top:${y}px">${spriteSvg('coin', sz)}</div>`).join('')}
<div class="chip" style="position:absolute;left:140px;top:120px;font-size:18px;padding:6px 14px">${ko ? '순이익 순' : 'By profit'}</div></div>`;
  }
  if (key === 'megaphone') {
    return `<div class="art"><div style="position:absolute;left:20px;top:250px;transform:rotate(-12deg)">${spriteSvg('megaphone', 170)}</div>
<div class="bub" style="left:120px;top:20px;background:#ffc6dd;border-color:#ffc6dd">S&gt; Steely 1 set, w me</div>
<div class="bub" style="left:170px;top:110px;background:#ffe39a;border-color:#ffe39a">B&gt; Gloves Att 60%</div>
<div class="bub" style="left:130px;top:200px;background:#a8ece3;border-color:#a8ece3">T&gt; Red Viper ↔ Emerald Earrings</div>
<div class="chip" style="position:absolute;left:220px;top:330px;font-size:17px;padding:7px 14px">${ko ? '실시간 · 시세 비교' : 'Live · price check'}</div></div>`;
  }
  if (key === 'newbie') {
    const words = ko ? [['고확', 40, 30], ['자시', 250, 10], ['떡작', 300, 120], ['커파', 30, 150], ['겹사', 220, 230], ['정옵', 60, 280]] : [['S>', 40, 30], ['B>', 260, 10], ['C/O', 300, 120], ['A/W', 30, 150], ['clean', 210, 230], ['7 slots', 40, 280]];
    return `<div class="art">${words.map(([w, x, y], i) => `<div class="tag" style="left:${x}px;top:${y}px;transform:rotate(${[-6, 4, -3, 5, -4, 3][i]}deg)">${w}</div>`).join('')}
<div style="position:absolute;left:130px;top:330px">${spriteSvg('book', 130)}</div><div style="position:absolute;left:290px;top:360px">${spriteSvg('mushroom', 70)}</div>
<div class="bub" style="left:300px;top:300px;background:#fff7ed;border-color:#fff7ed;font-size:26px;padding:6px 14px">?</div></div>`;
  }
  return crest;
}

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
.og-tint{position:absolute;inset:0;pointer-events:none}
.og-market .og-tint{background:radial-gradient(circle at 78% 42%,#ffd46a66,transparent 58%)}.og-training .og-tint{background:radial-gradient(circle at 78% 42%,#7fdc8a5c,transparent 58%)}
.og-quests .og-tint{background:radial-gradient(circle at 78% 42%,#86b0ff5c,transparent 58%)}.og-best-meso .og-tint{background:radial-gradient(circle at 78% 42%,#ffb54766,transparent 58%)}
.og-megaphone .og-tint{background:radial-gradient(circle at 78% 42%,#ff86bf5c,transparent 58%)}.og-newbie .og-tint{background:radial-gradient(circle at 78% 42%,#72dccd5c,transparent 58%)}
.art{position:absolute;left:742px;top:44px;width:430px;height:480px}.art img{image-rendering:pixelated}
.pnl{position:absolute;background:#fff7ed;border:1px solid #ffe5b6;border-radius:18px;box-shadow:0 14px 40px #2919233a;color:#302a2b}
.pnl h3{margin:0 0 10px;font-size:19px;font-weight:850;letter-spacing:-.5px;display:flex;align-items:center;gap:8px}
.row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #f0dcc0;font-size:17px;font-weight:700;letter-spacing:-.4px}.row:first-of-type{border-top:0}
.row img{width:40px;height:40px;object-fit:contain}.row .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:14px;font-weight:800;background:#ffe7c2;color:#7a4a1f;white-space:nowrap}
.up{color:#16a34a;font-weight:900}.dn{color:#dc2626;font-weight:900}
.bub{position:absolute;padding:12px 16px;border-radius:16px;font-size:18px;font-weight:800;letter-spacing:-.3px;color:#2b2326;box-shadow:0 10px 26px #2919233a;white-space:nowrap}
.bub:after{content:"";position:absolute;left:22px;bottom:-10px;border:10px solid transparent;border-bottom:0;border-top-color:inherit}
.tag{position:absolute;padding:9px 16px;border-radius:14px;background:#fff7ed;border:2px solid #e9c48f;font-size:26px;font-weight:900;color:#5b3a1f;box-shadow:0 10px 24px #2919232e;letter-spacing:-.5px}
html[lang=ja] .og-badge{font-size:13px}html[lang=ja] .og-sub{font-size:20px}html[lang=zh] .og-card h1{letter-spacing:0}
</style></head><body><main class="og${c.key ? ` og-page og-${c.key}` : ''}">${heroScene()}${c.key ? `<div class="og-tint"></div>${art(c.key, lang)}` : crest}<section class="og-card"><div class="og-brand">${spriteSvg('mushroom',48)}GMS Hub</div><p class="og-badge">${c.badge}</p><h1>${c.title}</h1><p class="og-sub">${c.sub}</p><div class="og-bottom"><i></i>gms-hub.com</div></section></main></body></html>`;
}
if (process.argv.includes('--html-only')) {
  const destination = path.resolve(process.argv[process.argv.indexOf('--html-only') + 1] || '/tmp/gms-og-preview');
  fs.mkdirSync(destination, {recursive:true});
  for (const [lang,c] of Object.entries(copy)) fs.writeFileSync(path.join(destination, `og-${lang}.html`),html(lang,c));
  for (const [key, card] of Object.entries(PAGE_CARDS)) for (const lang of ['ko', 'en']) fs.writeFileSync(path.join(destination, `og-${key}-${lang}.html`), html(lang, { ...copy[lang], ...card[lang], key }));
  console.log(destination);
} else {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    const only = process.argv.includes('--pages');
    if (!only) for (const [lang,c] of Object.entries(copy)) {
      await page.setContent(html(lang,c));
      await page.screenshot({path:path.join(root,`assets/og-${lang}.png`)});
    }
    for (const [key, card] of Object.entries(PAGE_CARDS)) for (const lang of ['ko', 'en']) {
      await page.setContent(html(lang, { ...copy[lang], ...card[lang], key }), { waitUntil: 'networkidle' });
      await page.screenshot({path:path.join(root,`assets/og-${key}-${lang}.png`)});
    }
  } finally { await browser.close(); }
  console.log('Share images written');
}
