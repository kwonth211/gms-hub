// Item share cards (owner 2026-11-21): a link to an item page pasted in KakaoTalk, Discord or X shows the item's icon,
// today's price, a 14-day price line and the listing counts, like a shop sign. Drawn as SVG here and turned into a PNG
// with resvg. Text uses Noto Sans KR, fetched from Google Fonts subset to the card's own characters (TrueType, so resvg can
// read it). One render per item, language and day; the edge keeps it six hours.
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';

let ready = null;
const init = () => (ready ||= initWasm(wasm));
const W = 1200, H = 630;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = (n) => Number(n).toLocaleString('en-US');
export const money = (n, ko) => (ko
  ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${nf(Math.round(n / 1e4))}만` : nf(n))
  : (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e8 ? 0 : 2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : nf(n)));

// Google Fonts CSS API answers a non-browser client (Wget) with TrueType links; `text=` keeps the file to the glyphs on this card.
async function fontFor(text, weight) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`, {
    headers: { 'User-Agent': 'Wget/1.21' },
    cf: { cacheTtl: 86400, cacheEverything: true },
  }).then((r) => r.text());
  const url = css.match(/url\((https:[^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error('font css');
  return new Uint8Array(await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } }).then((r) => r.arrayBuffer()));
}
async function dataUri(url) {
  const r = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) return null;
  const b = new Uint8Array(await r.arrayBuffer()); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return `data:${r.headers.get('content-type') || 'image/png'};base64,${btoa(s)}`;
}

// The price line: daily medians, scaled into the box, with a soft area under it.
function spark(points, x, y, w, h) {
  if (points.length < 2) return '';
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || hi * 0.1 || 1;
  const P = points.map((v, i) => [x + (w * i) / (points.length - 1), y + h - ((v - lo) / span) * (h - 16) - 8]);
  const line = P.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const [lx, ly] = P[P.length - 1];
  return `<polygon points="${x},${y + h} ${line} ${x + w},${y + h}" fill="url(#area)"/>
<polyline points="${line}" fill="none" stroke="#ff7a1a" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${lx}" cy="${ly}" r="9" fill="#ff7a1a" stroke="#fff" stroke-width="4"/>`;
}

// 14-day change, coloured the Korean way (up red, down blue)
function trendPct(d, ko) {
  const a = d[0], b = d[d.length - 1]; if (!a || !b) return '';
  const p = Math.round(((b - a) / a) * 100); if (!p) return ko ? ' · 보합' : ' · flat';
  return ` · <tspan fill="${p > 0 ? '#e03b24' : '#2563eb'}">${p > 0 ? '▲' : '▼'}${Math.abs(p)}%</tspan>`;
}
// card({ ko, name, en, price, priceLabel, daily, counts, req, stat, icon, bg, logo }) → SVG text. Same look as the site's
// share cards: the autumn landscape (assets/og-item-bg.png), a cream panel with the mushroom logo, the item on the halo.
export function cardSvg(c) {
  const t = c.ko
    ? { tag: '자유시장 시세', site: '글로벌 메이플스토리 클래식 월드', trend: '최근 14일', none: '아직 거래 기록이 적어요' }
    : { tag: 'Free Market price', site: 'Global MapleStory Classic World', trend: 'Last 14 days', none: 'Not enough trades yet' };
  const hasEn = c.en && c.en !== c.name;
  const nameSize = c.name.length > 16 ? 44 : c.name.length > 10 ? 54 : 64;
  const priceText = c.price ? `${money(c.price, c.ko)}${c.ko ? ' 메소' : ' mesos'}` : '—';
  const priceSize = priceText.length > 12 ? 70 : 84;
  const nameY = 200 + nameSize, enY = nameY + 40, priceY = (hasEn ? enY : nameY) + 18 + priceSize, labelY = priceY + 36;
  const chips = [c.req ? `Lv.${c.req}` : null, c.stat].filter(Boolean);
  const chipW = (s) => 30 + s.length * (c.ko ? 20 : 15);
  let cx = 975 - (chips.reduce((a, s) => a + chipW(s), 0) + (chips.length - 1) * 10) / 2;
  const chipSvg = chips.map((s) => { const w = chipW(s); const g = `<rect x="${cx}" y="388" width="${w}" height="44" rx="22" fill="#fff7ed" stroke="#e9c48f" stroke-width="3" filter="url(#sh)"/><text x="${cx + w / 2}" y="419" font-size="23" font-weight="700" fill="#7a4a1f" text-anchor="middle">${esc(s)}</text>`; cx += w + 10; return g; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
 <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a3c" stop-opacity="0.42"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0.02"/></linearGradient>
 <filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#291923" flood-opacity="0.28"/></filter>
 <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#2a1608" flood-opacity="0.45"/></filter>
</defs>
${c.bg ? `<image href="${c.bg}" x="0" y="0" width="${W}" height="${H}"/>` : `<rect width="${W}" height="${H}" fill="#5a3f4a"/>`}
<rect x="48" y="52" width="716" height="526" rx="26" fill="#fff7ed" stroke="#ffe5b6" stroke-width="2" filter="url(#sh)"/>
${c.logo ? `<image href="${c.logo}" x="82" y="84" width="48" height="48" image-rendering="optimizeSpeed"/>` : ''}
<text x="${c.logo ? 142 : 84}" y="121" font-size="31" font-weight="900" fill="#302a2b">GMS Hub</text>
<text x="728" y="119" font-size="17" font-weight="700" fill="#92613f" text-anchor="end">${esc(t.site)}</text>
<rect x="84" y="150" width="${c.ko ? 150 : 222}" height="38" rx="19" fill="#ffe7c2"/>
<text x="${84 + (c.ko ? 75 : 111)}" y="176" font-size="21" font-weight="900" fill="#c2410c" text-anchor="middle">${esc(t.tag)}</text>
<text x="82" y="${nameY}" font-size="${nameSize}" font-weight="900" fill="#302a2b">${esc(c.name)}</text>
${hasEn ? `<text x="84" y="${enY}" font-size="24" font-weight="700" fill="#92613f">${esc(c.en)}</text>` : ''}
<text x="80" y="${priceY}" font-size="${priceSize}" font-weight="900" fill="#ff6a00">${esc(priceText)}</text>
<text x="84" y="${labelY}" font-size="21" font-weight="700" fill="#89603e">${esc(c.priceLabel || '')}</text>
${c.daily.length >= 3 ? `<text x="728" y="${labelY}" font-size="20" font-weight="700" fill="#89603e" text-anchor="end">${esc(t.trend)}${trendPct(c.daily, c.ko)}</text>${spark(c.daily, 476, labelY + 12, 252, Math.max(40, 506 - labelY - 12))}` : `<text x="728" y="${labelY}" font-size="20" font-weight="700" fill="#b08a5a" text-anchor="end">${esc(t.none)}</text>`}
<line x1="84" y1="520" x2="728" y2="520" stroke="#dcc7ae" stroke-width="2"/>
<circle cx="90" cy="547" r="5" fill="#be8545"/>
<text x="104" y="554" font-size="20" font-weight="700" fill="#89603e">${esc(c.counts)}</text>
<text x="728" y="554" font-size="22" font-weight="900" fill="#c2410c" text-anchor="end">gms-hub.com</text>
${c.icon ? `<image href="${c.icon}" x="865" y="132" width="220" height="220" image-rendering="optimizeSpeed" preserveAspectRatio="xMidYMid meet" filter="url(#glow)"/>` : ''}
${chipSvg}
</svg>`;
}

export async function renderCard(c) {
  await init();
  [c.icon, c.bg, c.logo] = await Promise.all([c.iconUrl && dataUri(c.iconUrl), dataUri('https://gms-hub.com/assets/og-item-bg.png'), dataUri('https://gms-hub.com/assets/og-mushroom.png')].map((p) => Promise.resolve(p).catch(() => null)));
  const svg = cardSvg(c);
  const text = [...new Set(svg.replace(/<[^>]+>/g, ' ').replace(/data:[^"]+/g, '').replace(/&[a-z]+;/g, ' ') + '0123456789,.+—·-')].join('');
  const [bold, black] = await Promise.all([fontFor(text, 700), fontFor(text, 900)]);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontBuffers: [bold, black], defaultFontFamily: 'Noto Sans KR', loadSystemFonts: false } }).render().asPng();
  return png;
}
