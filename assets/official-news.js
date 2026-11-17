// Home "game notices": the game's own maintenance, update, event and Cash Shop notices (worker GET /news).
// The build renders the list from the snapshot it fetched (data/official-news.json) with newsInner(); on the page the
// same function redraws it from the live list, so a notice posted after the last build still shows within minutes.
// Each row opens (details) to a few lines on what the notice says, with a link to the notice itself.
// A maintenance that has not ended gets a line with its start and end: Korea time on Korean pages, the viewer's own
// time elsewhere (UTC in the built HTML until the page redraws it).
export const NEWS_ROWS = 5;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const parts = (iso, loc, opts) => Object.fromEntries(new Intl.DateTimeFormat(loc, opts).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));

function maintLine(x, ko, tr, now, tz) {
  const start = Date.parse(x.maint.start), end = Date.parse(x.maint.end);
  if (!(now < end)) return '';
  let when;
  if (ko) {
    const o = { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    const a = parts(x.maint.start, 'ko', o), b = parts(x.maint.end, 'ko', o);
    const hm = (p) => `${p.hour}:${p.minute}`;
    when = `${a.month}월 ${a.day}일(${a.weekday}) ${hm(a)} ~ ${a.day === b.day ? '' : `${b.day}일(${b.weekday}) `}${hm(b)} <small>한국 시간</small>`;
  } else {
    const o = { ...(tz ? { timeZone: tz } : {}), hour: 'numeric', minute: '2-digit' };
    const sameDay = parts(x.maint.start, 'en', { ...o, day: 'numeric' }).day === parts(x.maint.end, 'en', { ...o, day: 'numeric' }).day;
    const day = { weekday: 'short', month: 'short', day: 'numeric' };
    when = `${new Intl.DateTimeFormat('en', { ...o, ...day }).format(new Date(start))} – ${new Intl.DateTimeFormat('en', { ...o, ...(sameDay ? {} : day), timeZoneName: 'short' }).format(new Date(end))}`;
  }
  const label = now >= start ? tr('점검 중', 'Maintenance now') : tr('점검 예정', 'Maintenance');
  return `<a class="gn-maint${now >= start ? ' is-live' : ''}" data-until="${esc(x.maint.end)}" data-news="${x.id}" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${label}</b><span translate="no">${when}</span></a>`;
}

export function newsInner(data, { ko, tr, now = Date.now(), tz, site } = {}) {
  const items = (data?.items || []).slice(0, NEWS_ROWS);
  if (!items.length) return '';
  const cat = { maintenance: tr('점검', 'Maintenance'), update: tr('업데이트', 'Update'), events: tr('이벤트', 'Event'), sale: tr('캐시샵', 'Cash Shop'), general: tr('공지', 'Notice') };
  const date = (iso) => {
    const p = parts(iso, 'en', { timeZone: ko ? 'Asia/Seoul' : 'UTC', month: 'numeric', day: 'numeric' });
    return ko ? `${p.month}/${p.day}` : `${p.month.padStart(2, '0')}/${p.day.padStart(2, '0')}`;
  };
  const maint = (data.items || []).filter((x) => x.maint).map((x) => maintLine(x, ko, tr, now, tz)).join('');
  return `<div class="home-updates-head"><h2>${tr('게임 공지', 'Game notices')} <small>${tr('점검 · 패치 · 이벤트', 'maintenance, patches, events')}</small></h2><a class="home-updates-all" href="https://www.nexon.com/maplestory/news" target="_blank" rel="noopener">${tr('공식 공지 전체 보기', 'All official news')}</a></div>
${maint}<ol class="upd-list gn-list">${items.map((x) => {
    const pts = (ko ? x.sum?.ko : x.sum?.en) || [];
    const more = site && x.link ? `<a class="gn-more" href="${esc(site(x.link))}">${tr('공략 보기', 'Open the guide')} →</a>` : '';
    return `<li><details data-news="${x.id}"><summary><time datetime="${esc(x.date)}" translate="no">${date(x.date)}</time><span class="gn-cat" data-cat="${esc(x.cat)}">${cat[x.cat] || cat.general}</span>${now - Date.parse(x.date) < 2 * 86400000 ? '<span class="upd-new" translate="no">NEW</span>' : ''}<span class="gn-title" translate="no">${esc(ko ? x.ko : x.en)}</span></summary>
<div class="gn-body">${pts.length ? `<ul translate="no">${pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}<p>${more}<a class="gn-src" href="${esc(x.url)}" target="_blank" rel="noopener" data-news="${x.id}">${tr('공식 공지 원문 보기', 'Read the official notice')} →</a></p></div></details></li>`;
  }).join('')}</ol>`;
}

if (typeof document !== 'undefined') {
  const box = document.querySelector('[data-game-news]');
  if (box) {
    const tx = globalThis.tx || ((s) => s);
    const ko = document.documentElement.lang === 'ko';
    const tr = (k, e) => (ko ? k : tx(e));
    // A finished maintenance leaves the built page at once, even when the live list cannot be read.
    const prune = () => box.querySelectorAll('[data-until]').forEach((n) => { if (Date.parse(n.dataset.until) <= Date.now()) n.remove(); });
    prune();
    const site = (p) => `${box.dataset.base}${p}`;
    fetch(`${box.dataset.api}/news`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const html = d?.items?.length ? newsInner(d, { ko, tr, site }) : '';
      if (!html) return;
      // Notices the reader already opened stay open through the redraw.
      const open = [...box.querySelectorAll('details[open]')].map((n) => n.dataset.news);
      box.innerHTML = html; box.hidden = false;
      for (const id of open) box.querySelector(`details[data-news="${id}"]`)?.setAttribute('open', '');
    }).catch(() => {});
    box.addEventListener('click', (e) => { const a = e.target.closest('a[data-news]'); if (a) window.track?.('game_news_click', { news_id: Number(a.dataset.news) }); });
    box.addEventListener('toggle', (e) => { if (e.target.open && e.isTrusted) window.track?.('game_news_open', { news_id: Number(e.target.dataset.news) }); }, true);
  }
}
