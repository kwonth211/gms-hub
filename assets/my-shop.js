import { placeLabel } from './place.js';
// My shop vs the market: a seller's open listings, each against the item's market median and today's cheapest competing
// listing. The name stays in this browser (gms-my-shop) so a returning seller gets the report straight away.
const tx = globalThis.tx || ((s) => s);
const root = document.getElementById('my-shop');
const KEY = 'gms-my-shop';

if (root) {
  const ko = document.documentElement.lang === 'ko';
  const tr = (k, e, v) => (ko ? k : tx(e, v));
  const form = document.getElementById('my-shop-form');
  const status = document.getElementById('my-shop-status');
  const out = document.getElementById('my-shop-result');
  const cta = document.getElementById('my-shop-cta');
  const api = root.dataset.api;
  const nf = new Intl.NumberFormat(ko ? 'ko' : 'en-US');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let names = null;
  const loadNames = () => (names ||= fetch(root.dataset.items).then((r) => r.json()).then((rows) => new Map(rows.map(([id, k, e]) => [id, ko && k ? k : e]))).catch(() => new Map()));
  const get = (path) => fetch(`${api}${path}`).then((r) => (r.ok ? r.json() : null));
  const pct = (a, b) => Math.round(((a - b) / b) * 100);

  function verdict(mine, low, median, rank, open) {
    if (rank === 1 && open > 1) return ['good', tr('지금 가장 싸요', 'Cheapest right now')];
    if (rank === 1) return ['good', tr('지금 이 물건을 파는 곳은 여기뿐이에요', 'The only shop selling this now')];
    const overLow = pct(mine, low);
    if (median && pct(mine, median) >= 20) return ['bad', tr(`시세보다 ${pct(mine, median)}% 비싸요`, '{p}% above the market', { p: pct(mine, median) })];
    if (overLow >= 10) return ['warn', tr(`최저가보다 ${overLow}% 비싸요`, '{p}% above the cheapest', { p: overLow })];
    if (median && pct(mine, median) <= -20) return ['warn', tr(`시세보다 ${-pct(mine, median)}% 싸요. 더 받아도 돼요`, '{p}% below the market; room to raise', { p: -pct(mine, median) })];
    return ['ok', tr('시세 수준이에요', 'In line with the market')];
  }

  async function run(seller, user) {
    status.textContent = tr('상점을 찾는 중…', 'Looking for the shop…');
    out.innerHTML = '';
    const mine = await get(`/market/listings?seller=${encodeURIComponent(seller)}&exact=1&state=open&limit=100`);
    const rows = mine?.rows || [];
    if (user && window.track) window.track('my_shop_search', { found: rows.length });
    if (!rows.length) {
      status.textContent = tr(`최근 하루 안에 '${seller}' 상점이 수집되지 않았어요.`, "No shop named '{s}' was seen in the last 24 hours.", { s: seller });
      cta.hidden = false;
      return;
    }
    const ids = [...new Set(rows.map((r) => r.item))];
    const [market, prices, nameMap] = await Promise.all([
      get(`/market/listings?ids=${ids.join(',')}&state=open&sort=price&limit=100`),
      get(`/prices?ids=${ids.join(',')}`),
      loadNames()
    ]);
    const others = (market?.rows || []).filter((r) => r.seller.toLowerCase() !== seller.toLowerCase());
    let total = 0;
    let warn = 0;
    const lines = rows.sort((a, b) => a.item - b.item).map((r) => {
      const comp = others.filter((o) => o.item === r.item).map((o) => o.price);
      const low = Math.min(r.price, ...comp);
      const rank = 1 + comp.filter((p) => p < r.price).length;
      const median = prices?.[r.item]?.median || null;
      const [cls, text] = verdict(r.price, low, median, rank, comp.length + 1);
      if (cls !== 'good' && cls !== 'ok') warn++;
      total += r.price * (r.qty || 1);
      const name = nameMap.get(r.item) || `#${r.item}`;
      return `<tr class="ms-${cls}">
<th scope="row"><a href="${root.dataset.market}?item=${r.item}"><img src="https://maplestory.io/api/MCW/1/item/${r.item}/icon" width="28" height="28" alt="" loading="lazy"><span>${esc(name)}</span></a></th>
<td class="num">${nf.format(r.price)}${r.qty > 1 ? ` <small>×${r.qty}</small>` : ''}</td>
<td class="num">${median ? nf.format(median) : '—'}</td>
<td class="num">${comp.length ? nf.format(Math.min(...comp)) : '—'}</td>
<td class="num">${rank} / ${comp.length + 1}</td>
<td><span class="ms-verdict">${esc(text)}</span></td></tr>`;
    });
    const where = [...new Set(rows.map((r) => `CH ${r.channel} · ${placeLabel(r.room, document.documentElement.lang === 'ko')}`))].join(', ');
    status.textContent = '';
    out.innerHTML = `<section class="panel my-shop-summary"><h2>${esc(seller)} <small>${esc(where)}</small></h2>
<dl><div><dt>${tr('판매 중', 'Listed')}</dt><dd>${rows.length}${tr('개', '')}</dd></div><div><dt>${tr('합계', 'Total')}</dt><dd>${nf.format(total)}</dd></div><div><dt>${tr('가격 확인 필요', 'Worth a look')}</dt><dd>${warn}${tr('개', '')}</dd></div></dl></section>
<div class="table-wrap"><table class="data my-shop-table"><thead><tr><th scope="col">${tr('물건', 'Item')}</th><th scope="col">${tr('내 가격', 'My price')}</th><th scope="col">${tr('시세 중앙값', 'Market median')}</th><th scope="col">${tr('다른 상점 최저가', 'Cheapest elsewhere')}</th><th scope="col">${tr('싼 순위', 'Price rank')}</th><th scope="col">${tr('판단', 'Verdict')}</th></tr></thead><tbody>${lines.join('')}</tbody></table></div>
<p class="muted small">${tr('시세 중앙값은 최근 14일 기록, 최저가와 순위는 최근 하루 안에 본 판매 중 매물 기준이에요. 다른 상점이 더 있을 수 있어요.', 'Median: last 14 days of records. Cheapest and rank: open listings seen in the last 24 hours; there may be shops we have not seen.')}</p>`;
    cta.hidden = true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const seller = form.seller.value.trim();
    if (!/^[A-Za-z0-9]{2,13}$/.test(seller)) return;
    try { localStorage.setItem(KEY, seller); } catch (err) {}
    history.replaceState(null, '', `?seller=${encodeURIComponent(seller)}`);
    run(seller, true);
  });
  const start = new URLSearchParams(location.search).get('seller') || (() => { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
  if (start && /^[A-Za-z0-9]{2,13}$/.test(start)) {
    form.seller.value = start;
    run(start, false);
  }
}
