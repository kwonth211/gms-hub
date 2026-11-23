// /discord-bot/: the Discord-style example replies, filled from the same live data the bot answers with (worker API +
// the item hover-card data for names and base stats). Each window keeps its placeholder until its data arrives and shows
// a short note if the API cannot be reached, so the page never shows made-up numbers.
import { optBadge, loadTips } from './opt-grade.js';

const root = document.querySelector('.bot-page');
const api = root?.dataset.api;
const ko = root?.dataset.lang === 'ko';
const tr = (k, e) => (ko ? k : e);
const nf = new Intl.NumberFormat('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Same short money format as the bot (worker/src/discord-bot.js money()).
const money = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
const ago = (seen) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(`${String(seen).replace(' ', 'T')}Z`)) / 60000));
  return m < 60 ? tr(`${m}분 전`, `${m}m ago`) : m < 1440 ? tr(`${Math.round(m / 60)}시간 전`, `${Math.round(m / 60)}h ago`) : tr(`${Math.round(m / 1440)}일 전`, `${Math.round(m / 1440)}d ago`);
};
const get = (p) => fetch(`${api}${p}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const slot = (k) => root?.querySelector(`[data-bot-demo="${k}"]`);
const fill = (k, html) => {
  const el = slot(k);
  if (!el) return;
  el.innerHTML = html;
  el.style.minHeight = '';
  el.classList.add('is-in');
};
const footer = '<div class="dc-foot">GMS Hub · gms-hub.com</div>';
const offline = tr('지금은 예시 데이터를 불러오지 못했어요.', 'The live example could not be loaded right now.');
const RED_VIPER = 1452005, ILBI = 2070006;

async function run() {
  if (!root || !api) return;
  const tips = await loadTips();
  const name = (id) => {
    const t = tips?.items?.[id];
    return t ? (ko && t[0] ? t[0] : t[1]) : String(id);
  };
  const icon = (id) => `<img class="dc-thumb" src="https://maplestory.io/api/MCW/1.2/item/${id}/icon?resize=2" alt="" width="40" height="40" loading="lazy">`;

  // /시세: the most traded item right now.
  get('/market/top').then(async (top) => {
    const id = top?.items?.find((r) => tips?.items?.[r.item])?.item;
    if (!id) return fill('price', `<p class="dc-note">${offline}</p>`);
    const arg = slot('price')?.closest('.dc-win')?.querySelector('.dc-arg');
    if (arg) arg.lastChild.textContent = name(id);
    const p = (await get(`/prices?ids=${id}`))?.[id];
    if (!p?.median) return fill('price', `<p class="dc-note">${offline}</p>`);
    const fields = [[tr('가격', 'Price'), `<b>${money(p.median)}</b> ${tr('메소', 'mesos')}`]];
    if (p.low && p.high && p.low !== p.high) fields.push([tr('범위', 'Range'), `${money(p.low)} – ${money(p.high)}`]);
    if (p.n) fields.push([tr('기록 수', 'Records'), nf.format(p.n)]);
    fill('price', `${icon(id)}<div class="dc-title">${esc(name(id))}</div><div class="dc-fields">${fields.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('')}</div><a class="dc-link" href="${esc(root.dataset.market)}?item=${id}">${tr('시세 그래프와 판매 중인 상점 보기', 'Price chart and open shops')}</a>${footer}`);
  });

  // /매물: Red Viper, cheapest first, with roll words.
  get(`/market/listings?item=${RED_VIPER}&state=open&sort=price&limit=5&days=7`).then((res) => {
    if (!res?.rows?.length) return fill('listings', `<p class="dc-note">${offline}</p>`);
    const rows = res.rows.map((r) => {
      const b = r.opts ? optBadge(RED_VIPER, r.opts, tips) : null;
      return `<li><b>${nf.format(r.price)}</b><span class="dc-roll${b ? ` ${b.cls}` : ' none'}">${b ? esc(b.text) : ''}</span><span class="dc-seller">${esc(r.seller)}</span><span class="dc-where">CH ${r.channel} FM ${r.room}</span><span class="dc-ago">${ago(r.seen)}</span></li>`;
    }).join('');
    fill('listings', `${icon(RED_VIPER)}<div class="dc-title">${esc(name(RED_VIPER))} · ${tr('판매 중 매물', 'On sale now')}</div><ul class="dc-list">${rows}</ul><div class="dc-small">${tr(`싼 순 ${res.rows.length}건 / 전체 ${nf.format(res.total)}건`, `Cheapest ${res.rows.length} of ${nf.format(res.total)}`)}</div>${footer}`);
  });

  // /급등락: the same filter as the bot (8+ open listings, swings over 300% left out).
  get('/market/catalog').then((cat) => {
    const rows = (cat?.items || []).filter((r) => r.typicalDay != null && r.open >= 8 && Math.abs(r.typicalDay) <= 300 && tips?.items?.[r.item]);
    if (!rows.length) return fill('movers', `<p class="dc-note">${offline}</p>`);
    const line = (r) => `<li><span class="dc-move ${r.typicalDay > 0 ? 'up' : 'down'}">${r.typicalDay > 0 ? '▲' : '▼'} ${r.typicalDay > 0 ? '+' : ''}${r.typicalDay}%</span><b>${esc(name(r.item))}</b><span class="dc-ago">${money(r.typical)}</span></li>`;
    const up = rows.filter((r) => r.typicalDay > 0).sort((a, b) => b.typicalDay - a.typicalDay).slice(0, 3);
    const down = rows.filter((r) => r.typicalDay < 0).sort((a, b) => a.typicalDay - b.typicalDay).slice(0, 3);
    fill('movers', `<div class="dc-title">${tr('하루 사이 시세 급등락', 'Biggest price moves in a day')}</div><div class="dc-label">${tr('오른 아이템', 'Up')}</div><ul class="dc-list dc-moves">${up.map(line).join('')}</ul><div class="dc-label">${tr('내린 아이템', 'Down')}</div><ul class="dc-list dc-moves">${down.map(line).join('')}</ul>${footer}`);
  });

  // /알림 추가: the bot's own confirmation text, with today's price of the item.
  get(`/prices?ids=${ILBI}`).then((p) => {
    const now = p?.[ILBI];
    const nowLine = now?.median ? `<div class="dc-small">${tr(`지금 시세: ${money(now.median)}${now.low ? ` (최저 ${money(now.low)})` : ''}`, `Price now: ${money(now.median)}${now.low ? ` (lowest ${money(now.low)})` : ''}`)}</div>` : '';
    fill('alert', `<p class="dc-plain">🔔 ${tr(`<b>${esc(name(ILBI))}</b> 알림을 켰어요. <b>3M 이하</b>로 상점 매물이나 확성기가 뜨면 여기로 알려 드려요.`, `Watching <b>${esc(name(ILBI))}</b>. When a shop or megaphone sells it for <b>3M or less</b>, you get a message here.`)}</p>${nowLine}`);
  });
}
run();
