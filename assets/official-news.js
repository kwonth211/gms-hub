// Home "game notices": the game's own maintenance, update, event and Cash Shop notices (worker GET /news).
// The build renders the list from the snapshot it fetched (data/official-news.json) with newsInner(); on the page the
// same function redraws it from the live list, so a notice posted after the last build still shows within minutes.
// Each row opens (details) to a few lines on what the notice says, with a link to the notice itself.
// A maintenance that has not ended gets a line with its start and end: Korea time on Korean pages, the viewer's own
// time elsewhere (UTC in the built HTML until the page redraws it).
export const NEWS_ROWS = 5;
// Notices that came from the official Discord carry its mark in front of the title.
const DISCORD_MARK = '<span class="gn-dc" title="Discord" role="img" aria-label="Discord"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 2.9l-.6 1.2a18.3 18.3 0 0 0-5.5 0L8.6 2.9a19.7 19.7 0 0 0-4.9 1.5C.6 9 .1 13.6.4 18a19.9 19.9 0 0 0 6 3l1.300-1.800a13 13 0 0 1-2-1l.5-.4a14.200 14.200 0 0 0 12.200 0l.5.4a13 13 0 0 1-2 1l1.300 1.800a19.900 19.900 0 0 0 6-3c.4-5.200-.700-9.700-3.300-13.600ZM8.300 15.300c-1.200 0-2.200-1.100-2.200-2.400s1-2.400 2.200-2.400 2.200 1.100 2.200 2.400-1 2.400-2.200 2.400Zm7.400 0c-1.200 0-2.200-1.100-2.200-2.400s1-2.400 2.200-2.400 2.200 1.100 2.200 2.400-1 2.400-2.200 2.400Z"/></svg>Discord</span>';
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
    return `<li><details data-news="${x.id}"><summary><time datetime="${esc(x.date)}" translate="no">${date(x.date)}</time><span class="gn-cat" data-cat="${esc(x.cat)}">${cat[x.cat] || cat.general}</span>${now - Date.parse(x.date) < 2 * 86400000 ? '<span class="upd-new" translate="no">NEW</span>' : ''}${x.src === 'discord' ? DISCORD_MARK : ''}<span class="gn-title" translate="no">${esc(ko ? x.ko : x.en)}</span></summary>
<div class="gn-body">${pts.length ? `<ul translate="no">${pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}<p>${more}<a class="gn-src" href="${esc(x.url)}" target="_blank" rel="noopener" data-news="${x.id}">${x.src === 'discord' ? tr('디스코드에서 보기', 'See it on Discord') : tr('공식 공지 원문 보기', 'Read the official notice')} →</a></p></div></details></li>`;
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
    box.addEventListener('click', (e) => { const a = e.target.closest('a[data-news]'); if (a) window.track?.('game_news_click', { news_id: String(a.dataset.news) }); });
    box.addEventListener('toggle', (e) => { if (e.target.open && e.isTrusted) window.track?.('game_news_open', { news_id: String(e.target.dataset.news) }); }, true);
  }
}
