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
// card({ id, ko, name, en, price, priceLabel, daily, counts, req, stat, asOf, icon }) → SVG text
export function cardSvg(c) {
  const t = c.ko
    ? { tag: '자유시장 시세', site: '글클메 실시간 시세', trend: '최근 14일', none: '아직 거래 기록이 적어요' }
    : { tag: 'Free Market price', site: 'Live MapleStory Classic prices', trend: 'Last 14 days', none: 'Not enough trades yet' };
  const nameSize = c.name.length > 14 ? 50 : c.name.length > 9 ? 60 : 70;
  const chips = [c.req ? `Lv.${c.req}` : null, c.stat].filter(Boolean);
  let cx = 92;
  const chipSvg = chips.map((s) => { const w = 34 + s.length * (c.ko ? 21 : 16); const g = `<rect x="${cx}" y="470" width="${w}" height="46" rx="23" fill="#fff3dc" stroke="#e7b46a" stroke-width="3"/><text x="${cx + w / 2}" y="502" font-size="24" font-weight="700" fill="#7a4a12" text-anchor="middle">${esc(s)}</text>`; cx += w + 12; return g; }).join('');
  const priceText = c.price ? `${money(c.price, c.ko)}${c.ko ? ' 메소' : ' mesos'}` : '—';
  const priceSize = priceText.length > 12 ? 74 : 88;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9bf"/><stop offset="1" stop-color="#ffd38a"/></linearGradient>
 <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a3c" stop-opacity="0.45"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0.02"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g fill="#ffffff" opacity="0.35">${[[80, 40, 6], [1110, 70, 9], [1020, 150, 5], [140, 600, 7], [620, 30, 5]].map(([x, y, r]) => `<rect x="${x}" y="${y}" width="${r * 3}" height="${r * 3}" transform="rotate(45 ${x} ${y})"/>`).join('')}</g>
<rect x="40" y="34" width="${W - 80}" height="${H - 110}" rx="34" fill="#fffaf0" stroke="#e2a24f" stroke-width="6"/>
<rect x="40" y="34" width="${W - 80}" height="64" rx="30" fill="#f6b04e"/><rect x="40" y="70" width="${W - 80}" height="28" fill="#f6b04e"/>
<text x="76" y="78" font-size="30" font-weight="900" fill="#4a2a05">GMS Hub</text>
<text x="${W - 76}" y="78" font-size="26" font-weight="700" fill="#4a2a05" text-anchor="end">${esc(t.site)}</text>
<rect x="76" y="126" width="330" height="330" rx="28" fill="#ffffff" stroke="#efc98f" stroke-width="5"/>
${c.icon ? `<image href="${c.icon}" x="121" y="171" width="240" height="240" image-rendering="optimizeSpeed" preserveAspectRatio="xMidYMid meet"/>` : ''}
${chipSvg}
<text x="450" y="160" font-size="28" font-weight="900" fill="#d9540b">${esc(t.tag)}</text>
<text x="450" y="${160 + nameSize + 8}" font-size="${nameSize}" font-weight="900" fill="#2b1a05">${esc(c.name)}</text>
${c.en && c.en !== c.name ? `<text x="452" y="${160 + nameSize + 50}" font-size="26" font-weight="700" fill="#9a7445">${esc(c.en)}</text>` : ''}
<text x="450" y="${c.en && c.en !== c.name ? 372 : 352}" font-size="${priceSize}" font-weight="900" fill="#ff6a00">${esc(priceText)}</text>
<text x="452" y="${c.en && c.en !== c.name ? 410 : 390}" font-size="24" font-weight="700" fill="#8a6a3a">${esc(c.priceLabel || '')}</text>
${c.daily.length >= 2 ? `<text x="1122" y="410" font-size="22" font-weight="700" fill="#8a6a3a" text-anchor="end">${esc(t.trend)}${trendPct(c.daily, c.ko)}</text>${spark(c.daily, 700, 422, 422, 92)}` : `<text x="1122" y="470" font-size="24" font-weight="700" fill="#b08a5a" text-anchor="end">${esc(t.none)}</text>`}
<rect x="0" y="${H - 64}" width="${W}" height="64" fill="#3d2a12"/>
<text x="56" y="${H - 22}" font-size="25" font-weight="700" fill="#ffe9bf">${esc(c.counts)}</text>
<text x="${W - 56}" y="${H - 22}" font-size="28" font-weight="900" fill="#ffb347" text-anchor="end">gms-hub.com</text>
</svg>`;
}

export async function renderCard(c) {
  await init();
  if (c.iconUrl) c.icon = await dataUri(c.iconUrl).catch(() => null);
  const svg = cardSvg(c);
  const text = [...new Set(svg.replace(/<[^>]+>/g, ' ').replace(/data:[^"]+/g, '').replace(/&[a-z]+;/g, ' ') + '0123456789,.+—·-')].join('');
  const [bold, black] = await Promise.all([fontFor(text, 700), fontFor(text, 900)]);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontBuffers: [bold, black], defaultFontFamily: 'Noto Sans KR', loadSystemFonts: false } }).render().asPng();
  return png;
}
