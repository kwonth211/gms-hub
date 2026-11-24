// /tools/scroll-profit/: pick a piece of gear and a scroll, see what using every slot costs at today's prices, the odds
// and sale price of each result, and the average profit. Rules live in trade-math.js; this file draws.
import { makeMarketIndex } from './market-catalog.js';
import { uniqueListings, scrollOdds, scrollProfit, finishedPieces, cleanRange, fairPrice, inGroup, parseMesos } from './trade-math.js';
import { ko, tr, esc, nf, icon, money, mesos, pct, pips, track, getJson, moneyInput, picker } from './trade-ui.js';

const root = document.getElementById('sp-page');
const $ = (id) => document.getElementById(id);
const api = root.dataset.api;
const STAT_ORDER = ['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'Speed', 'Jump', 'CRT', 'CRD', 'MHP', 'MMP', 'PDD', 'MDD'];
const STAT = { PAD: tr('공격력', 'ATT'), MAD: tr('마력', 'M.ATT'), STR: tr('힘', 'STR'), DEX: tr('덱스', 'DEX'), INT: tr('인트', 'INT'), LUK: tr('럭', 'LUK'), ACC: tr('명중', 'ACC'), EVA: tr('회피', 'AVOID'),
  Speed: tr('이속', 'SPEED'), Jump: tr('점프', 'JUMP'), CRT: tr('크리 확률', 'CRIT'), CRD: tr('크리 데미지', 'CRIT DMG'), MHP: 'HP', MMP: 'MP', PDD: tr('물방', 'DEF'), MDD: tr('마방', 'M.DEF') };
const MAGIC = new Set(['Wand', 'Staff']);

let gear = new Map(), scrolls = [], byId = new Map(), summary = new Map();
let item = null, scroll = null, listings = [], onSale = [], live = {}, itemBox, scrollBox;
// What the visitor typed over the market prices: the piece, the scroll, and each result by number of passes.
let typed = { item: null, scroll: null, values: {} };

const statOf = (s) => STAT_ORDER.find((k) => s.inc[k]) || Object.keys(s.inc)[0];
const scrollName = (s) => (ko ? s.short || s.name : s.name);

function market() {
  const stat = statOf(scroll), gain = scroll.inc[stat], base = item.inc[stat] || 0;
  const cr = cleanRange(listings, stat, base);
  const odds = scrollOdds(item.slots, scroll.success, scroll.destroy);
  const found = odds.passes.map((_, k) => fairPrice(finishedPieces(listings, { stat, gain, k, baseLo: cr.lo, baseHi: cr.hi })));
  // The clean piece is something you buy: what the cheapest ones on sale now ask. With none on sale, the week's listings.
  const key = `c:${item.slots}`, now = inGroup(onSale, key, item.sub);
  const cheap = now.map((r) => r.price).sort((a, b) => a - b);
  // The third cheapest, so one mispriced listing does not set the cost.
  const clean = cheap.length ? { price: cheap[Math.min(2, cheap.length - 1)], basis: 'now', n: cheap.length } : fairPrice(inGroup(listings, key, item.sub));
  const sp = live[scroll.id];
  return { stat, gain, cr, odds, found, clean, itemPrice: clean?.price ?? null, scrollPrice: sp?.median ?? scroll.price ?? null, scrollInfo: sp };
}

function setUrl() {
  const p = new URLSearchParams();
  if (item) p.set('item', item.id);
  if (scroll) p.set('scroll', scroll.id);
  history.replaceState(null, '', location.pathname + (p.size ? `?${p}` : ''));
}

function drawScrolls() {
  const box = $('sp-scrolls');
  box.removeAttribute('aria-busy');
  const fit = scrolls.filter((s) => s.cat === item.cat);
  if (!fit.length) { box.innerHTML = `<p>${tr('이 장비에 바르는 주문서가 없어요.', 'No scroll fits this piece.')}</p>`; return; }
  // One row per stat: 100% / 60% / 10% / Chaos side by side.
  const byStat = new Map();
  for (const s of fit) { const k = statOf(s); byStat.set(k, [...(byStat.get(k) || []), s]); }
  const order = [...byStat.keys()].sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b));
  box.innerHTML = order.map((k) => `<div class="trd-scroll-row"><span class="trd-scroll-stat">${esc(STAT[k] || k)}</span>${byStat.get(k).sort((a, b) => b.success - a.success || a.destroy - b.destroy).map((s) => {
    const p = live[s.id]?.median ?? s.price;
    return `<button type="button" class="trd-scroll${s.destroy ? ' chaos' : ''}" data-scroll="${s.id}" aria-pressed="${s === scroll}" title="${esc(s.full)}">${icon(s.id, 26)}<span><b>${s.destroy ? tr('혼돈', 'Chaos') : `${s.success}%`}</b><em>+${s.inc[k]}</em></span><small>${p ? money(p) : tr('시세 없음', 'no price')}</small></button>`;
  }).join('')}</div>`).join('');
}

function draw() {
  const m = market();
  const itemPrice = typed.item ?? m.itemPrice, scrollPrice = typed.scroll ?? m.scrollPrice;
  // Notes under the two money boxes: where the number came from.
  $('sp-item-note').textContent = typed.item != null ? tr('직접 적은 값이에요.', 'Your own price.')
    : m.clean ? (m.clean.basis === 'now' ? (m.clean.n >= 3 ? tr(`지금 팔고 있는 노작 매물 ${nf.format(m.clean.n)}개 중 세 번째로 싼 값이에요.`, `Third cheapest of ${nf.format(m.clean.n)} clean pieces on sale now.`) : tr(`지금 팔고 있는 노작 매물 ${nf.format(m.clean.n)}개 중 제일 싼 값이에요.`, `Cheapest of ${nf.format(m.clean.n)} clean pieces on sale now.`)) : m.clean.basis === 'sold' ? tr(`노작 매물 ${nf.format(m.clean.n)}개 중 팔린 ${nf.format(m.clean.sold)}개의 중간 값이에요.`, `Middle of ${nf.format(m.clean.sold)} sold out of ${nf.format(m.clean.n)} clean listings.`) : tr(`노작 매물 ${nf.format(m.clean.n)}개 중 싼 쪽 값이에요.`, `Cheap end of ${nf.format(m.clean.n)} clean listings.`))
      : tr('노작 매물이 없어요. 내가 산 값을 적으세요.', 'No clean piece is listed. Type what you paid.');
  $('sp-scroll-note').textContent = typed.scroll != null ? tr('직접 적은 값이에요.', 'Your own price.')
    : m.scrollInfo?.sold?.n ? tr(`하루 동안 팔린 ${nf.format(m.scrollInfo.sold.n)}장의 중간 값이에요.`, `Middle of ${nf.format(m.scrollInfo.sold.n)} sold in the last day.`)
      : m.scrollPrice ? tr('지금 올라온 매물의 중간 값이에요.', 'Middle of what is listed now.') : tr('시세가 없어요. 내가 산 값을 적으세요.', 'No market price. Type what you paid.');
  if (typed.item == null) itemBox.set(m.itemPrice);
  if (typed.scroll == null) scrollBox.set(m.scrollPrice);
  $('sp-reset').hidden = typed.item == null && typed.scroll == null && !Object.keys(typed.values).length;

  const n = item.slots, box = $('sp-verdict'), table = $('sp-table');
  box.removeAttribute('aria-busy'); table.removeAttribute('aria-busy');
  // Gear whose clean stat is one number shows the finished number (공격력 8); gear that rolls a range (weapons) shows
  // what the scrolls add (공격력 +10) with the range underneath.
  const fixed = m.cr.lo === m.cr.hi, name = STAT[m.stat] || m.stat;
  const label = (k) => (fixed ? `${name} ${m.cr.lo + k * m.gain}` : `${name} +${k * m.gain}`);
  const span = (k) => (fixed ? '' : ` · ${m.cr.lo + k * m.gain}~${m.cr.hi + k * m.gain}`);
  // A piece on which every scroll failed has no buyers: 0 unless one is listed or the visitor says otherwise.
  const values = m.odds.passes.map((_, k) => typed.values[k] ?? m.found[k]?.price ?? (k === 0 ? 0 : null));
  const ready = itemPrice != null && scrollPrice != null;
  const r = ready ? scrollProfit({ item: itemPrice, scroll: scrollPrice, odds: m.odds, values }) : null;

  $('sp-total').innerHTML = ready
    ? (scroll.destroy
      ? tr(`평균 <strong>${money(r.cost)}</strong> 메소 들어요. 끝까지 살아남으면 ${money(r.full)}.`, `<strong>${money(r.cost)}</strong> mesos on average; ${money(r.full)} when the piece survives every scroll.`)
      : tr(`장비 ${money(itemPrice)} + 주문서 ${n}장 ${money(scrollPrice * n)} = <strong>${money(r.full)}</strong> 메소`, `Piece ${money(itemPrice)} + ${n} scrolls ${money(scrollPrice * n)} = <strong>${money(r.full)}</strong> mesos`))
    : tr('두 값을 적으면 든 돈이 나와요.', 'Type both prices to get the cost.');

  if (!ready) {
    box.className = 'trd-verdict-body thin';
    box.innerHTML = `<p class="trd-big-line">${tr('장비 값과 주문서 값을 적으세요', 'Type the price of the piece and the scroll')}</p>`;
  } else {
    const stats = `<dl class="trd-stats"><div><dt>${tr('든 돈', 'Cost')}</dt><dd>${money(r.cost)}</dd></div>
<div><dt>${tr('평균으로 건지는 돈', 'Average return')}</dt><dd>${r.ev != null ? money(r.ev) : '–'}</dd></div>
<div><dt>${tr('본전 넘길 확률', 'Chance to come out ahead')}</dt><dd>${r.missing.length ? '–' : `${pct(r.win)}${pips(r.win, r.win >= 0.5 ? 'good' : r.win >= 0.2 ? 'mid' : 'bad')}`}</dd></div>
<div><dt>${tr('본전 넘기는 결과', 'Result that pays it back')}</dt><dd>${r.needs != null ? tr(`${label(r.needs)}부터`, `${label(r.needs)} and up`) : r.missing.length ? '–' : tr('없어요', 'None')}</dd></div></dl>`;
    if (r.profit == null) {
      const few = r.missing.length <= 2;
      box.className = 'trd-verdict-body thin';
      box.innerHTML = `<p class="trd-big-line">${few ? tr(`${r.missing.map(label).join(', ')} 값을 적으면 평균 손익이 나와요`, `Type a price for ${r.missing.map(label).join(', ')} to get the average`) : tr(`팔 값이 빈 결과가 ${r.missing.length}개 있어요`, `${r.missing.length} results have no sale price`)}</p>
<p>${r.partial > 0 ? tr(`값이 있는 결과만 더하면 평균 ${money(r.partial)} 메소예요. `, `The priced results add up to ${money(r.partial)} mesos on average. `) : ''}${r.breakEven != null ? tr(`${label(r.missing[0])} 결과가 <strong>${money(r.breakEven)}</strong> 메소 넘게 팔려야 평균이 본전이에요.`, `${label(r.missing[0])} has to sell above <strong>${money(r.breakEven)}</strong> mesos for the average to break even.`) : tr('아래 표의 빈 칸에 내가 팔 값을 적으세요.', 'Fill the empty price boxes in the table below.')}</p>${stats}`;
    } else {
      const gain = r.profit >= 0, t = gain ? 'good' : 'bad';
      box.className = `trd-verdict-body ${t}`;
      box.innerHTML = `<div class="trd-gauge"><strong>${gain ? '+' : '−'}${money(Math.abs(r.profit))}</strong><span class="trd-gauge-unit">${tr('메소', 'mesos')}</span></div>
<p class="trd-big-line">${gain ? tr('평균으로 남아요', 'Ahead on average') : tr('평균으로 손해예요', 'Behind on average')}</p>
<p>${gain ? tr(`여러 번 하면 한 번에 평균 ${money(r.profit)} 메소 남아요.`, `Over many runs, each one leaves ${money(r.profit)} mesos on average.`) : tr(`여러 번 하면 한 번에 평균 ${money(-r.profit)} 메소씩 잃어요.`, `Over many runs, each one loses ${money(-r.profit)} mesos on average.`)} ${r.needs != null ? tr(`${label(r.needs)}부터 본전을 넘겨요.`, `${label(r.needs)} and up pays it back.`) : tr('다 붙어도 든 돈이 안 나와요. 이 주문서는 팔고 완성품을 사세요.', 'Even every pass does not pay it back. Sell the scrolls and buy a finished piece.')}</p>${stats}`;
    }
  }

  $('sp-table-note').textContent = tr(`${item.name}에 ${scrollName(scroll)}를 ${n}장 다 발랐을 때예요. 시세 칸은 직접 고칠 수 있어요.`, `${item.name} with ${n} × ${scrollName(scroll)}. Every price box can be edited.`);
  const maxP = Math.max(...m.odds.passes, m.odds.boom);
  const rows = m.odds.passes.map((pr, k) => ({ k, pr })).reverse().filter((x) => x.pr > 1e-12);
  table.innerHTML = `<div class="trd-row trd-row-head" aria-hidden="true"><span>${tr('결과', 'Result')}</span><span>${tr('확률', 'Odds')}</span><span>${tr('팔 값', 'Sale price')}</span><span>${tr('손익', 'Profit')}</span></div>
${rows.map(({ k, pr }) => {
    const f = m.found[k], v = values[k], own = typed.values[k] != null;
    const note = own ? tr('직접 적은 값', 'your own price') : f ? (f.basis === 'sold' ? tr(`팔린 값 · 매물 ${f.n}개 중 ${f.sold}개 팔림`, `sold price · ${f.sold} of ${f.n} sold`) : tr(`싼 쪽 매물 값 · 매물 ${f.n}개`, `cheap end of ${f.n} listed`)) : k === 0 ? tr('매물 없음 · 0으로 계산', 'none listed · counted as 0') : tr('매물 없음 · 값을 적으세요', 'none listed · type a price');
    const diff = ready && v != null ? v - r.full : null;
    return `<div class="trd-row${r && r.needs === k ? ' is-even' : ''}"><span class="trd-res"><b>${esc(label(k))}</b><small>${k === n ? tr('전부 성공', 'all passed') : k === 0 ? tr('전부 실패', 'all failed') : tr(`${k}번 성공`, `${k} passed`)}${span(k)}${r && r.needs === k ? `<em class="trd-even">${tr('여기부터 본전', 'pays back from here')}</em>` : ''}</small></span>
<span class="trd-prob"><span class="trd-prob-track"><span class="trd-prob-fill" style="width:${Math.max(1, (pr / maxP) * 100)}%"></span></span><b>${pct(pr)}</b></span>
<label class="trd-val"><input data-k="${k}" inputmode="decimal" autocomplete="off" value="${v != null ? nf.format(v) : ''}" placeholder="${tr('팔 값', 'price')}" aria-label="${esc(`${label(k)} ${tr('팔 값', 'sale price')}`)}"${own ? ' class="own"' : ''}><small>${note}</small></label>
<span class="trd-diff ${diff == null ? '' : diff >= 0 ? 'gain' : 'loss'}">${diff == null ? '–' : `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}`}</span></div>`;
  }).join('')}
${m.odds.boom > 0 ? `<div class="trd-row trd-row-boom"><span class="trd-res"><b>${tr('장비 파괴', 'Destroyed')}</b><small>${tr('혼돈 주문서 실패', 'failed Chaos scroll')}</small></span><span class="trd-prob"><span class="trd-prob-track"><span class="trd-prob-fill" style="width:${(m.odds.boom / maxP) * 100}%"></span></span><b>${pct(m.odds.boom)}</b></span><span class="trd-val"><b>0</b><small>${tr('장비가 사라져요', 'the piece is gone')}</small></span><span class="trd-diff loss">${ready ? `−${money(itemPrice + scrollPrice)}~` : '–'}</span></div>` : ''}`;
  setUrl();
}

// Typing in a result's price box redraws everything but that box, so the caret stays put.
function onValue(e) {
  const input = e.target.closest('input[data-k]');
  if (!input) return;
  const k = Number(input.dataset.k), raw = input.value.trim();
  const n = raw === '' ? null : /^0+$/.test(raw) ? 0 : parseMesos(raw);
  input.classList.toggle('bad', raw !== '' && n == null);
  if (raw !== '' && n == null) return;
  if (n == null) delete typed.values[k]; else typed.values[k] = n;
  const pos = input.selectionStart;
  draw();
  const again = $('sp-table').querySelector(`input[data-k="${k}"]`);
  if (again) { again.value = raw; again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
}

function pickScroll(s) { scroll = s; typed.scroll = null; typed.values = {}; drawScrolls(); draw(); }

async function choose(it, wantScroll, scrollTo = true) {
  item = it; scroll = null; typed = { item: null, scroll: null, values: {} };
  $('sp-start').hidden = true; $('sp-result').hidden = false;
  const baseText = Object.entries(it.inc).filter(([k]) => STAT[k]).sort((a, b) => STAT_ORDER.indexOf(a[0]) - STAT_ORDER.indexOf(b[0])).slice(0, 4).map(([k, v]) => `${STAT[k]} ${v}`).join(' · ');
  $('sp-item').innerHTML = `<span class="trd-item-ico">${icon(it.id, 48)}</span><div><h2>${esc(it.name)}</h2><p class="muted small">${tr(`업그레이드 가능 횟수 ${it.slots}`, `${it.slots} upgrade slots`)}${baseText ? ` · ${esc(baseText)}` : ''}</p></div>`;
  $('sp-market').href = `${root.dataset.market}?item=${it.id}`;
  for (const id of ['sp-scrolls', 'sp-verdict', 'sp-table']) { $(id).innerHTML = ''; $(id).setAttribute('aria-busy', 'true'); }
  $('sp-total').textContent = ''; $('sp-item-note').textContent = ''; $('sp-scroll-note').textContent = ''; $('sp-table-note').textContent = '';
  if (scrollTo) $('sp-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const fit = scrolls.filter((s) => s.cat === it.cat);
  let data = { rows: [], profile: [] }, failed = false;
  try {
    const [h, p] = await Promise.all([getJson(`${api}/market/history?id=${it.id}`), fit.length ? getJson(`${api}/prices?ids=${fit.map((s) => s.id).join(',')}`).catch(() => ({})) : {}]);
    data = h; live = p;
  } catch { failed = true; }
  if (item !== it) return;
  listings = uniqueListings(data.rows);
  onSale = uniqueListings(data.profile);
  if (!fit.length) {
    drawScrolls();
    for (const id of ['sp-verdict', 'sp-table']) { $(id).removeAttribute('aria-busy'); $(id).innerHTML = ''; }
    $('sp-verdict').innerHTML = `<p class="trd-big-line">${tr('이 장비에 바르는 주문서가 없어요', 'No scroll fits this piece')}</p>`;
    return;
  }
  // Start on the scroll players use most: 60% attack (magic for wands and staves), else the first 60%.
  const want = fit.find((s) => s.id === wantScroll);
  const main = MAGIC.has(it.sub) ? 'MAD' : 'PAD';
  scroll = want || fit.find((s) => statOf(s) === main && s.success === 60) || fit.find((s) => s.success === 60) || fit[0];
  drawScrolls();
  draw();
  if (failed) $('sp-table-note').textContent = tr('시세를 불러오지 못했어요. 값을 직접 적으면 계산돼요.', 'Could not load market prices. Type the prices and it still works.');
  track('scroll_profit', { page_type: 'scroll_profit', item_id: it.id });
}

async function boot() {
  itemBox = moneyInput($('sp-item-price'), (n) => { typed.item = n; if (item && scroll) draw(); });
  scrollBox = moneyInput($('sp-scroll-price'), (n) => { typed.scroll = n; if (item && scroll) draw(); });
  // An emptied box goes back to the market price on blur.
  for (const [el, key] of [[$('sp-item-price'), 'item'], [$('sp-scroll-price'), 'scroll']]) el.addEventListener('blur', () => { if (el.value.trim() === '' && item && scroll) { typed[key] = null; draw(); } });
  $('sp-reset').addEventListener('click', () => { typed = { item: null, scroll: null, values: {} }; draw(); });
  $('sp-scrolls').addEventListener('click', (e) => { const b = e.target.closest('[data-scroll]'); if (b) pickScroll(scrolls.find((s) => s.id === Number(b.dataset.scroll))); });
  $('sp-table').addEventListener('input', onValue);
  let rows, data, catalog;
  try { [rows, data, catalog] = await Promise.all([getJson(root.dataset.items), getJson(root.dataset.data), getJson(`${api}/market/catalog`).catch(() => ({ items: [] }))]); } catch {
    $('trd-quick').removeAttribute('aria-busy');
    $('trd-quick').innerHTML = `<span class="muted small">${tr('장비 목록을 불러오지 못했어요. 새로고침해 주세요.', 'Could not load the gear list. Please reload.')}</span>`;
    return;
  }
  summary = new Map(catalog.items.map((r) => [r.item, r]));
  scrolls = data.scrolls.map(([id, k, e, short, cat, success, destroy, inc, price]) => ({ id, name: ko ? k || e : e, full: ko ? k || e : e, short, cat, success, destroy, inc, price }));
  const meta = new Map(rows.map((r) => [r[0], r]));
  gear = new Map(data.equips.filter((e) => e[5] > 0).map(([id, k, e, cat, lv, slots, inc]) => [id, { id, name: ko ? k || e : e, cat, lv, slots, inc: inc || {}, sub: meta.get(id)?.[4] || '' }]));
  const index = makeMarketIndex(rows, ko ? 'ko' : 'en').filter((it) => gear.has(it.id));
  byId = new Map(index.map((it) => [it.id, it]));
  picker({ input: $('trd-q'), list: $('trd-opts'), index, allow: () => true, onPick: (it) => choose(gear.get(it.id)),
    note: (it) => tr(`횟수 ${gear.get(it.id).slots}`, `${gear.get(it.id).slots} slots`) });
  const hot = [...gear.values()].filter((g) => summary.has(g.id) && scrolls.some((s) => s.cat === g.cat)).sort((a, b) => (summary.get(b.id).records || 0) - (summary.get(a.id).records || 0)).slice(0, 8);
  $('trd-quick').removeAttribute('aria-busy');
  $('trd-quick').innerHTML = hot.map((g) => `<button type="button" class="trd-chip" data-id="${g.id}">${icon(g.id, 22)}<span>${esc(g.name)}</span></button>`).join('');
  $('trd-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { const g = gear.get(Number(b.dataset.id)); $('trd-q').value = g.name; choose(g); } });
  const p = new URLSearchParams(location.search), first = gear.get(Number(p.get('item')));
  if (first) { $('trd-q').value = first.name; choose(first, Number(p.get('scroll')), false); }
}
boot();
