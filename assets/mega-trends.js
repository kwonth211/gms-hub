// Megaphone patterns from the worker's hourly snapshot (/megaphones/stats): the items named most in the last 24 hours
// (with the change against the day before and how many sell vs buy), the items more wanted than offered, the busiest
// callers and the megaphones-per-hour curve. Fills every [data-mega-trends] box on a page; "compact" boxes (the home)
// show the first two lists only. Item names come from the site's item index.
const tx = globalThis.tx || ((s) => s);
const boxes = [...document.querySelectorAll('[data-mega-trends]')];
if (boxes.length) {
  const ko = document.documentElement.lang === 'ko';
  const tr = (k, e, v) => (ko ? k : tx(e, v)).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const api = document.body.dataset.priceApi;
  const first = boxes[0];
  const icon = (id) => `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" width="24" height="24" alt="" loading="lazy">`;
  (async () => {
    let stats, names;
    try {
      [stats, names] = await Promise.all([
        fetch(`${api}/megaphones/stats`).then((r) => r.json()),
        fetch(first.dataset.items).then((r) => r.json()).then((rows) => new Map(rows.map(([id, k, e]) => [id, ko && k ? k : e]))),
      ]);
    } catch (e) { return; }
    if (!stats?.items?.length) return;
    const name = (id) => names.get(id) || `#${id}`;
    const market = first.dataset.market, mega = first.dataset.megaphone;
    const change = (r) => {
      if (!r.before) return `<i class="mt-new">${tr('새로', 'new')}</i>`;
      const d = Math.round(((r.n - r.before) / r.before) * 100);
      return d > 10 ? `<i class="mt-up">▲ ${d}%</i>` : d < -10 ? `<i class="mt-down">▼ ${-d}%</i>` : `<i class="mt-flat">—</i>`;
    };
    const itemRow = (r, i) => `<li><span class="mt-rank">${i + 1}</span><a href="${market}?item=${r.item}" data-item="${r.item}">${icon(r.item)}<span>${esc(name(r.item))}</span></a><small>${tr('S {s} · B {b}', 'S {s} · B {b}', { s: r.sell, b: r.buy })}</small>${change(r)}</li>`;
    const hot = stats.items.slice(0, 10);
    const wanted = stats.wanted.slice(0, 5);
    const hours = stats.hourly.slice(-24);
    const max = Math.max(1, ...hours.map((h) => h.n));
    // Hours are the viewer's own (Korea time on Korean pages): the bar is labelled every 6 hours, and the peak shows its count.
    const hourLabel = (h) => new Date(`${h}:00:00Z`).toLocaleTimeString(ko ? 'ko' : 'en', { hour: 'numeric', ...(ko ? { timeZone: 'Asia/Seoul' } : {}) });
    const peak = hours.reduce((a, h) => (h.n > (a?.n || 0) ? h : a), null);
    const curve = hours.map((h, i) => `<span class="mt-bar"${h === peak ? ' data-peak' : ''}><i style="height:${Math.max(4, Math.round((h.n / max) * 100))}%" title="${hourLabel(h.h)} · ${h.n}"></i>${h === peak ? `<b>${h.n}</b>` : ''}${(i % 6 === 0 && i < hours.length - 3) || i === hours.length - 1 ? `<small>${hourLabel(h.h)}</small>` : ''}</span>`).join('');
    for (const box of boxes) {
      const compact = box.dataset.megaTrends === 'compact';
      box.innerHTML = `<div class="mt-head"><h3>${tr('지금 뜨는 아이템', 'Trending in megaphones')} <small>${tr('최근 24시간 고확 {n}건', '{n} megaphones in 24h', { n: stats.today.n.toLocaleString() })}</small></h3><a href="${mega}">${tr('실시간 확성기', 'Live megaphones')} →</a></div>
<div class="mt-grid${compact ? ' compact' : ''}">
<ol class="mt-list">${hot.slice(0, compact ? 5 : 10).map(itemRow).join('')}</ol>
${wanted.length ? `<div class="mt-side"><h4>${tr('사려는 사람이 더 많은 아이템', 'More buyers than sellers')}</h4><ol class="mt-list mt-wanted">${wanted.map((r, i) => `<li><span class="mt-rank">${i + 1}</span><a href="${market}?item=${r.item}" data-item="${r.item}">${icon(r.item)}<span>${esc(name(r.item))}</span></a><small>${tr('S {s} · B {b}', 'S {s} · B {b}', { s: r.sell, b: r.buy })}</small></li>`).join('')}</ol></div>` : ''}
${compact ? '' : `<div class="mt-side"><h4>${tr('오늘의 고확왕', "Today's top callers")}</h4><ol class="mt-callers">${stats.callers.slice(0, 5).map((c) => `<li><a href="${mega}?q=${encodeURIComponent(c.nick)}"><b>${esc(c.nick)}</b></a><small>${tr('{n}건 · 아이템 {i}종', '{n} megaphones · {i} items', { n: c.n, i: c.items })}</small></li>`).join('')}</ol>
<h4>${tr('시간대별 고확', 'Megaphones by hour')} <small>${tr('최근 24시간', 'last 24h')}</small></h4><div class="mt-curve">${curve}</div></div>`}
</div>`;
      box.hidden = false;
    }
    first.addEventListener('click', (e) => { const a = e.target.closest('a[data-item]'); if (a) window.track?.('mega_trend_click', { item_id: Number(a.dataset.item) }); });
  })();
}
