// /tools/sell/: pick an item, type a price, see what share of listings at that price sold over the last 7 days and
// where the price would stand among what is on sale now. Rules live in trade-math.js; this file draws.
import { makeMarketIndex } from './market-catalog.js';
import { uniqueListings, sellCurve, bandAt, sellAdvice, rankAmong, optionGroups, inGroup, medianPrice } from './trade-math.js';
import { ko, tr, esc, nf, icon, money, mesos, pct, pips, track, getJson, moneyInput, picker, priceSlider, versus } from './trade-ui.js';

const root = document.getElementById('sl-page');
const $ = (id) => document.getElementById(id);
const api = root.dataset.api;
const STAT = { PAD: tr('공격력', 'ATT'), MAD: tr('마력', 'M.ATT') };
let byId = new Map(), summary = new Map();
let item = null, all = [], openAll = [], groups = [], group = null, list = [], open = [], curve = [], price = null, priceBox, slide, ref = null;

const groupLabel = (g) => {
  if (!g.ups) return tr(`노작 · 남은 횟수 ${g.slots}`, `Clean · ${g.slots} slots left`);
  const stat = g.stat ? `${STAT[g.stat]} ${g.value}` : tr(`${g.ups}번 성공`, `${g.ups} passed`);
  return tr(`${stat} · 남은 횟수 ${g.slots}`, `${stat} · ${g.slots} slots left`);
};
const tone = (rate) => (rate >= 0.5 ? 'good' : rate >= 0.2 ? 'mid' : 'bad');
// "10개 중 4개", and for thin shares "100개 중 3개".
const outOf = (rate) => {
  if (rate <= 0) return tr('하나도 안 팔렸어요', 'none sold');
  if (rate >= 0.095) return tr(`10개 중 ${Math.min(10, Math.round(rate * 10))}개가 팔렸어요`, `${Math.min(10, Math.round(rate * 10))} in 10 sold`);
  return tr(`100개 중 ${Math.max(1, Math.round(rate * 100))}개가 팔렸어요`, `${Math.max(1, Math.round(rate * 100))} in 100 sold`);
};
const bandName = (b, i) => (curve.length === 1 ? `${money(b.lo)}~${money(b.hi)}` : i === 0 ? tr(`${money(b.hi)} 이하`, `${money(b.hi)} or less`) : i === curve.length - 1 ? tr(`${money(b.lo)} 이상`, `${money(b.lo)} or more`) : b.lo === b.hi ? money(b.lo) : `${money(b.lo)}~${money(b.hi)}`);

function setUrl() {
  const p = new URLSearchParams();
  if (item) p.set('item', item.id);
  if (group) p.set('g', group);
  if (price) p.set('price', price);
  history.replaceState(null, '', location.pathname + (p.size ? `?${p}` : ''));
}

function drawVerdict() {
  const box = $('sl-verdict');
  box.removeAttribute('aria-busy');
  const sold = list.filter((r) => r.sold).length;
  if (!curve.length) {
    box.className = 'trd-verdict-body thin';
    box.innerHTML = `<p class="trd-big-line">${tr('비율을 내기엔 매물이 적어요', 'Too few listings for a share')}</p><p>${list.length ? tr(`최근 7일 매물 ${nf.format(list.length)}개, 그중 팔린 매물 ${nf.format(sold)}개예요. 아래 최근 매물의 값과 판매 완료 표시를 보고 정하세요.`, `${nf.format(list.length)} listings in 7 days, ${nf.format(sold)} of them sold. Go by the prices and sold marks in the recent listings below.`) : tr('최근 7일 동안 올라온 매물이 없어요.', 'No listings in the last 7 days.')}</p>`;
    return;
  }
  if (!price) { box.className = 'trd-verdict-body thin'; box.innerHTML = `<p class="trd-big-line">${tr('올릴 값을 적으세요', 'Type your price')}</p>`; return; }
  const b = bandAt(curve, price), t = tone(b.rate);
  const range = bandName(b, b.index);
  const where = b.edge === 'below' ? tr(`이 값은 최근 7일 매물 어느 것보다도 싸요. 제일 싼 값대(${range})는 `, `Cheaper than every listing in 7 days. In the cheapest band (${range}), `)
    : b.edge === 'above' ? tr(`이 값은 최근 7일 매물 어느 것보다도 비싸요. 제일 비싼 값대(${range})는 `, `Dearer than every listing in 7 days. In the dearest band (${range}), `)
      : tr(`최근 7일 동안 ${range}에 올라온 `, `In 7 days, of the listings at ${range}, `);
  box.className = `trd-verdict-body ${t}`;
  box.innerHTML = `<div class="trd-gauge"><strong>${pct(b.rate)}</strong>${pips(b.rate, t)}</div>
<p class="trd-big-line">${outOf(b.rate)}</p>
<p>${where}${tr(`매물 ${nf.format(b.n)}개 중 ${nf.format(b.sold)}개가 팔렸어요.`, `${nf.format(b.sold)} of ${nf.format(b.n)} sold.`)}</p>
<p class="trd-verdict-tip">${t === 'good' ? tr('이 값이면 잘 나가요. 그대로 올리세요.', 'This price moves. List it.') : t === 'mid' ? tr('팔리긴 하는데 기다려야 해요. 급하면 아래 막대에서 더 싼 값대를 누르세요.', 'It sells, with a wait. In a hurry, tap a cheaper band below.') : tr('이 값으로는 거의 안 팔려요. 아래 막대에서 더 싼 값대를 누르세요.', 'Almost nothing sells here. Tap a cheaper band below.')}</p>`;
}

function drawRank() {
  const box = $('sl-rank');
  box.removeAttribute('aria-busy');
  if (!open.length) { box.innerHTML = `<p class="trd-big-line">${tr('지금 팔고 있는 매물이 없어요', 'Nothing on sale right now')}</p><p>${list.some((r) => r.sold) ? tr('올리면 내 매물이 하나뿐이에요. 값은 최근에 팔린 값을 보고 정하세요.', 'Yours would be the only one. Price it from what sold recently.') : tr('올리면 내 매물이 하나뿐이에요.', 'Yours would be the only one.')}</p>`; return; }
  const cheap = [...open].sort((a, b) => a.price - b.price);
  if (!price) { box.innerHTML = `<p class="trd-big-line">${tr(`지금 매물 ${nf.format(open.length)}개`, `${nf.format(open.length)} on sale now`)}</p>`; return; }
  const r = rankAmong(open, price), pos = Math.min(100, (r.cheaper / Math.max(1, r.total)) * 100);
  const top = cheap.slice(0, 3).map((x) => `<li><b>${money(x.price)}</b><span>${esc(x.seller || '')}</span></li>`).join('');
  box.innerHTML = `<p class="trd-big-line">${r.cheaper === 0 ? tr('지금 제일 싼 값이에요', 'The cheapest on sale') : tr(`${nf.format(r.total + 1)}개 중 ${nf.format(r.place)}번째로 싸요`, `${nf.format(r.place)}${ord(r.place)} cheapest of ${nf.format(r.total + 1)}`)}</p>
<div class="trd-line" role="img" aria-label="${esc(tr(`나보다 싼 매물 ${r.cheaper}개, 비싼 매물 ${r.total - r.cheaper - r.same}개`, `${r.cheaper} cheaper, ${r.total - r.cheaper - r.same} dearer`))}"><span class="trd-line-fill" style="width:${pos}%"></span><span class="trd-line-me" style="left:${pos}%"></span></div>
<p class="trd-line-ends"><span>${tr('싼 쪽', 'cheap')} ${money(cheap[0].price)}</span><span>${money(cheap[cheap.length - 1].price)} ${tr('비싼 쪽', 'dear')}</span></p>
<p>${r.cheaper ? tr(`나보다 싼 매물이 <strong>${nf.format(r.cheaper)}개</strong> 있어요.`, `<strong>${nf.format(r.cheaper)}</strong> listings are cheaper than yours.`) : tr('나보다 싼 매물이 없어요.', 'No listing is cheaper than yours.')}${r.same ? tr(` 같은 값은 ${nf.format(r.same)}개예요.`, ` ${nf.format(r.same)} ask the same.`) : ''}</p>
<h3>${tr('지금 제일 싼 매물', 'Cheapest right now')}</h3><ol class="trd-cheap">${top}</ol>`;
}
const ord = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function drawBars() {
  const box = $('sl-bars');
  box.removeAttribute('aria-busy');
  const panel = box.closest('.trd-curve');
  panel.hidden = !curve.length;
  if (!curve.length) return;
  const at = price ? bandAt(curve, price).index : -1;
  $('sl-curve-note').textContent = tr(`최근 7일 매물 ${nf.format(list.length)}개를 싼 값부터 나눴어요. 막대를 누르면 그 값대로 바뀌어요.`, `${nf.format(list.length)} listings from the last 7 days, cheapest band first. Tap a bar to use that price.`);
  box.innerHTML = curve.map((b, i) => `<li><button type="button" class="trd-bar ${tone(b.rate)}" data-i="${i}"${i === at ? ' aria-current="true"' : ''}>
<span class="trd-bar-name">${bandName(b, i)}</span><span class="trd-bar-track"><span class="trd-bar-fill" style="width:${Math.max(1.5, b.rate * 100)}%"></span></span><strong>${pct(b.rate)}</strong><span class="trd-bar-n">${tr(`${nf.format(b.n)}개 중 ${nf.format(b.sold)}개`, `${nf.format(b.sold)} of ${nf.format(b.n)}`)}</span>${i === at ? `<span class="trd-bar-me">${tr('내 값', 'you')}</span>` : ''}</button></li>`).join('');
}

function drawAdvice() {
  const box = $('sl-advice');
  if (!curve.length) { box.innerHTML = ''; return; }
  const a = sellAdvice(curve, list);
  const tile = (cls, sprite, label, value, text, to) => `<button type="button" class="trd-tile ${cls}"${to ? ` data-price="${to}"` : ' disabled'}><span class="trd-tile-label">${label}</span><strong>${value}</strong><span>${text}</span></button>`;
  box.innerHTML = [
    a.quick != null
      ? tile('good', 'coin', tr('빨리 팔 값', 'Quick-sale price'), tr(`${money(a.quick)} 이하`, `${money(a.quick)} or less`), tr('여기까지는 절반 넘게 팔렸어요.', 'More than half sold up to here.'), a.quick)
      : tile('mid', 'coin', tr('제일 잘 팔린 값대', 'Best-selling band'), tr(`${money(a.best.hi)} 이하`, `${money(a.best.hi)} or less`), tr(`매물 ${nf.format(a.best.n)}개 중 ${nf.format(a.best.sold)}개가 팔렸어요. 절반 넘게 팔린 값대는 없어요.`, `${nf.format(a.best.sold)} of ${nf.format(a.best.n)} sold. No band sold more than half.`), a.best.hi),
    tile('', 'star', tr('팔린 값의 중간', 'Middle of what sold'), money(a.soldMedian), tr(`팔린 매물 ${nf.format(list.filter((r) => r.sold).length)}개의 한가운데 값이에요.`, `The middle of ${nf.format(list.filter((r) => r.sold).length)} sold listings.`), a.soldMedian),
    a.slow != null
      ? tile('bad', 'clock', tr('여기부터는 안 팔려요', 'Rarely sells from here'), tr(`${money(a.slow)} 이상`, `${money(a.slow)} or more`), tr('10개 중 2개도 안 팔렸어요.', 'Fewer than 2 in 10 sold.'), null)
      : tile('good', 'clock', tr('안 팔리는 값대', 'Bands that do not sell'), tr('없어요', 'None'), tr('어느 값대든 10개 중 2개 넘게 팔렸어요.', 'Every band sold more than 2 in 10.'), null)
  ].join('');
}

function drawRecent() {
  const panel = $('sl-recent-panel');
  panel.hidden = !!curve.length || !list.length;
  if (panel.hidden) return;
  const rows = [...list].sort((a, b) => (a.seen < b.seen ? 1 : -1)).slice(0, 15);
  $('sl-recent').innerHTML = `<ol class="trd-recent-list">${rows.map((r) => `<li><b>${mesos(r.price)}</b>${r.sold ? `<span class="trd-sold">${tr('판매 완료', 'Sold')}</span>` : `<span class="trd-open">${tr('판매 중', 'On sale')}</span>`}<time>${esc(r.seen.slice(5, 10).replace('-', '/'))}</time></li>`).join('')}</ol>`;
}

function drawPresets() {
  const a = curve.length ? sellAdvice(curve, list) : null;
  const low = open.length ? Math.min(...open.map((r) => r.price)) : null;
  const sets = [[tr('지금 최저가', 'Lowest now'), low], [tr('팔린 값 중간', 'Sold middle'), a?.soldMedian ?? medianPrice(list.filter((r) => r.sold))], [tr('빨리 팔 값', 'Quick sale'), a?.quick]].filter(([, v]) => v);
  $('sl-presets').innerHTML = sets.map(([l, v]) => `<button type="button" class="trd-preset" data-price="${v}">${l} <b>${money(v)}</b></button>`).join('');
}

// Under the slider: how far the price is from the middle of what sold.
function drawVersus() {
  const v = versus(price, ref), el = $('sl-versus');
  el.textContent = v ? v.text : '';
  el.className = `trd-versus ${v ? (v.side === 'dear' ? (v.diff >= 15 ? 'bad' : 'mid') : v.side === 'cheap' ? 'good' : '') : ''}`;
}
function draw() { drawVerdict(); drawRank(); drawBars(); drawAdvice(); drawRecent(); drawVersus(); setUrl(); }
function setPrice(n, fill = true, from) { price = n; if (fill) priceBox.set(n); if (from !== 'slide') slide.set(n); draw(); }

function useGroup(key, keepPrice) {
  group = key;
  const sub = item.sub || '';
  list = key ? inGroup(all, key, sub) : all;
  open = key ? inGroup(openAll, key, sub) : openAll;
  curve = sellCurve(list);
  $('sl-groups').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.g || '') === (key || ''))));
  drawPresets();
  const a = curve.length ? sellAdvice(curve, list) : null;
  const sold = list.filter((r) => r.sold);
  ref = (sold.length >= 3 ? medianPrice(sold) : medianPrice(list)) || null;
  slide.setRef(ref);
  $('sl-ref').textContent = ref ? money(ref) : '';
  const start = keepPrice || ref || medianPrice(open) || null;
  setPrice(start);
}

async function choose(it, want = {}) {
  item = it;
  $('sl-start').hidden = true; $('sl-result').hidden = false;
  const s = summary.get(it.id);
  $('sl-item').innerHTML = `<span class="trd-item-ico">${icon(it.id, 48)}</span><div><h2>${esc(it.name)}</h2><p class="muted small">${s ? tr(`지금 매물 ${nf.format(s.open || 0)}개 · 7일 동안 팔린 매물 ${nf.format(s.sold || 0)}개`, `${nf.format(s.open || 0)} on sale · ${nf.format(s.sold || 0)} sold in 7 days`) : ''}</p></div>`;
  $('sl-market').href = `${root.dataset.market}?item=${it.id}`;
  for (const id of ['sl-verdict', 'sl-rank', 'sl-bars']) { $(id).innerHTML = ''; $(id).setAttribute('aria-busy', 'true'); }
  $('sl-advice').innerHTML = ''; $('sl-groups').hidden = true; $('sl-recent-panel').hidden = true; $('sl-presets').innerHTML = '';
  if (!want.quiet) $('sl-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  let data;
  try { data = await getJson(`${api}/market/history?id=${it.id}`); } catch {
    if (item !== it) return;
    for (const id of ['sl-rank', 'sl-bars']) { $(id).removeAttribute('aria-busy'); $(id).innerHTML = ''; }
    $('sl-verdict').removeAttribute('aria-busy');
    $('sl-verdict').innerHTML = `<p class="trd-big-line">${tr('매물을 불러오지 못했어요', 'Could not load the listings')}</p><p><button type="button" class="btn small-btn" id="sl-retry">${tr('다시 불러오기', 'Try again')}</button></p>`;
    $('sl-retry').addEventListener('click', () => choose(it, want));
    return;
  }
  if (item !== it) return;
  all = uniqueListings(data.rows);
  openAll = uniqueListings(data.profile);
  groups = it.cat === 'Equip' ? optionGroups(all, it.sub || '') : [];
  const box = $('sl-groups');
  box.hidden = !groups.length;
  if (groups.length) {
    const shown = groups.slice(0, 12);
    box.innerHTML = `<span class="trd-groups-label">${tr('내 장비와 같은 옵션을 누르세요', 'Tap the options your piece has')}</span>${shown.map((g) => `<button type="button" data-g="${esc(g.key)}" aria-pressed="false">${esc(groupLabel(g))}<i>${nf.format(g.n)}</i></button>`).join('')}<button type="button" data-g="" aria-pressed="false">${tr('옵션 안 가림', 'Any options')}<i>${nf.format(all.length)}</i></button>`;
  }
  const g = groups.length ? (groups.some((x) => x.key === want.g) ? want.g : want.g === '' ? null : groups[0].key) : null;
  useGroup(g, want.price);
  track('sell_check', { page_type: 'sell', item_id: it.id });
}

async function boot() {
  priceBox = moneyInput($('sl-price'), (n) => setPrice(n, false));
  slide = priceSlider($('sl-slide'), (n) => setPrice(n, true, 'slide'));
  root.addEventListener('click', (e) => {
    const p = e.target.closest('[data-price]');
    if (p) return setPrice(Number(p.dataset.price));
    const bar = e.target.closest('.trd-bar');
    if (bar) { const b = curve[Number(bar.dataset.i)], i = Number(bar.dataset.i); return setPrice(i === curve.length - 1 && curve.length > 1 ? b.lo : b.hi); }
    const g = e.target.closest('#sl-groups button');
    if (g) useGroup(g.dataset.g || null);
  });
  let rows, catalog;
  try { [rows, catalog] = await Promise.all([getJson(root.dataset.items), getJson(`${api}/market/catalog`)]); } catch {
    $('trd-quick').removeAttribute('aria-busy');
    $('trd-quick').innerHTML = `<span class="muted small">${tr('아이템 목록을 불러오지 못했어요. 새로고침해 주세요.', 'Could not load the item list. Please reload.')}</span>`;
    return;
  }
  summary = new Map(catalog.items.map((r) => [r.item, r]));
  // Every tradeable item can be picked; the ones with listings this week come first in the list.
  const index = makeMarketIndex(rows, ko ? 'ko' : 'en').filter((it) => it.cat !== 'Cash' || summary.has(it.id));
  byId = new Map(index.map((it) => [it.id, it]));
  picker({ input: $('trd-q'), list: $('trd-opts'), index, allow: () => true, onPick: (it) => choose(it), first: (it) => summary.has(it.id),
    note: (it) => { const s = summary.get(it.id); return s ? (s.median ? money(s.median) : '') : tr('매물 없음', 'no listings'); } });
  const hot = [...summary.values()].filter((r) => byId.has(r.item) && byId.get(r.item).cat !== 'Equip').sort((a, b) => (b.sold || 0) * (b.soldMedian || b.median || 0) - (a.sold || 0) * (a.soldMedian || a.median || 0)).slice(0, 8);
  $('trd-quick').removeAttribute('aria-busy');
  $('trd-quick').innerHTML = hot.map((r) => `<button type="button" class="trd-chip" data-id="${r.item}">${icon(r.item, 22)}<span>${esc(byId.get(r.item).name)}</span></button>`).join('');
  $('trd-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { const it = byId.get(Number(b.dataset.id)); $('trd-q').value = it.name; choose(it); } });
  const p = new URLSearchParams(location.search), first = byId.get(Number(p.get('item')));
  if (first) { $('trd-q').value = first.name; choose(first, { quiet: true, g: p.has('g') ? p.get('g') : undefined, price: Number(p.get('price')) > 0 ? Number(p.get('price')) : undefined }); }
}
boot();
