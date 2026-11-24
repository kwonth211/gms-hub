// /tools/scroll-profit/: pick a piece of gear, a scroll and how many pieces to scroll. The page then reads like a
// receipt: what you spend, what comes out (how many of each result), and what is left after selling it all.
// Rules live in trade-math.js; this file draws.
import { makeMarketIndex } from './market-catalog.js';
import { uniqueListings, scrollOdds, scrollCases, batchSpread, finishedPieces, cleanRange, fairPrice, inGroup, parseMesos } from './trade-math.js';
import { ko, tr, esc, nf, icon, money, pct, pips, track, getJson, picker } from './trade-ui.js';

const root = document.getElementById('sp-page');
const $ = (id) => document.getElementById(id);
const api = root.dataset.api;
const STAT_ORDER = ['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'Speed', 'Jump', 'CRT', 'CRD', 'MHP', 'MMP', 'PDD', 'MDD'];
const STAT = { PAD: tr('공격력', 'ATT'), MAD: tr('마력', 'M.ATT'), STR: tr('힘', 'STR'), DEX: tr('덱스', 'DEX'), INT: tr('인트', 'INT'), LUK: tr('럭', 'LUK'), ACC: tr('명중', 'ACC'), EVA: tr('회피', 'AVOID'),
  Speed: tr('이속', 'SPEED'), Jump: tr('점프', 'JUMP'), CRT: tr('크리 확률', 'CRIT'), CRD: tr('크리 데미지', 'CRIT DMG'), MHP: 'HP', MMP: 'MP', PDD: tr('물방', 'DEF'), MDD: tr('마방', 'M.DEF') };
const MAGIC = new Set(['Wand', 'Staff']);
const MAX_QTY = 1000;

let gear = new Map(), scrolls = [], byId = new Map(), summary = new Map();
let item = null, scroll = null, qty = 10, listings = [], onSale = [], live = {};
// What the visitor typed over the market prices: the piece, the scroll, and each result by number of passes.
let typed = { item: null, scroll: null, values: {} };

const statOf = (s) => STAT_ORDER.find((k) => s.inc[k]) || Object.keys(s.inc)[0];
const scrollName = (s) => (ko ? s.short || s.name : s.name);
// How many pieces: 12, 3.5, 0.8, 0.02.
const count = (x) => (x >= 100 ? nf.format(Math.round(x)) : x >= 0.095 ? String(Math.round(x * 10) / 10) : x >= 0.005 ? x.toFixed(2) : '<0.01');
const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

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
  if (qty !== 10) p.set('n', qty);
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
  const m = market(), n = item.slots;
  const itemPrice = typed.item ?? m.itemPrice, scrollPrice = typed.scroll ?? m.scrollPrice;
  const ready = itemPrice != null && scrollPrice != null;
  // Gear whose clean stat is one number shows the finished number (공격력 8); gear that rolls a range (weapons) shows
  // what the scrolls add (공격력 +10) with the range underneath.
  const fixed = m.cr.lo === m.cr.hi, name = STAT[m.stat] || m.stat;
  const label = (k) => (fixed ? `${name} ${m.cr.lo + k * m.gain}` : `${name} +${k * m.gain}`);
  const span = (k) => (fixed ? '' : ` · ${m.cr.lo + k * m.gain}~${m.cr.hi + k * m.gain}`);
  // A piece on which every scroll failed has no buyers: 0 unless one is listed or the visitor says otherwise.
  const values = m.odds.passes.map((_, k) => typed.values[k] ?? m.found[k]?.price ?? (k === 0 ? 0 : null));
  const missing = m.odds.passes.map((pr, k) => (values[k] == null && pr > 1e-9 ? k : -1)).filter((k) => k >= 0);
  const scrollsUsed = m.odds.used * qty, spend = ready ? itemPrice * qty + scrollPrice * scrollsUsed : null;
  const back = m.odds.passes.reduce((s, pr, k) => s + pr * (values[k] ?? 0), 0) * qty;
  const known = ready && !missing.length;
  const cases = known ? scrollCases(n, scroll.success, scroll.destroy).map((c) => ({ p: c.p, net: (c.boom ? 0 : values[c.k]) - itemPrice - scrollPrice * c.used })) : null;
  const spread = cases ? batchSpread(cases, qty) : null;
  // The fewest passes whose piece sells for more than one piece cost.
  const one = ready ? itemPrice + scrollPrice * n : null;
  const needs = ready ? m.odds.passes.findIndex((pr, k) => pr > 1e-9 && values[k] != null && values[k] > one) : -1;

  for (const b of document.querySelectorAll('.trd-qty-presets button')) b.setAttribute('aria-pressed', String(Number(b.dataset.qty) === qty));
  $('sp-need').innerHTML = scroll.destroy
    ? tr(`${esc(item.name)} <b>${nf.format(qty)}개</b>에 ${esc(scrollName(scroll))}를 발라요. 장비가 터지면 남은 주문서는 안 쓰니까 평균 <b>${nf.format(Math.round(scrollsUsed))}장</b>이 들어요.`, `${esc(scrollName(scroll))} on <b>${nf.format(qty)}</b> × ${esc(item.name)}. A destroyed piece uses no more scrolls, so about <b>${nf.format(Math.round(scrollsUsed))}</b> scrolls go on average.`)
    : tr(`${esc(item.name)} <b>${nf.format(qty)}개</b>에 ${esc(scrollName(scroll))}를 ${n}장씩, 모두 <b>${nf.format(n * qty)}장</b> 발라요.`, `${esc(scrollName(scroll))} on <b>${nf.format(qty)}</b> × ${esc(item.name)}, ${n} each: <b>${nf.format(n * qty)}</b> scrolls.`);

  // ---- the answer: sale − spend = left ----
  const sum = $('sp-sum');
  sum.removeAttribute('aria-busy');
  const box = (cls, labelText, value, sub) => `<div class="trd-sum-box ${cls}"><span>${labelText}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  if (!ready) {
    sum.className = 'trd-sum thin';
    sum.innerHTML = `<p class="trd-big-line">${tr('아래 쓰는 돈에 장비 값과 주문서 값을 적으세요', 'Type the price of the piece and the scroll under "What you spend"')}</p>`;
  } else if (!known) {
    const few = missing.length <= 2;
    // With one empty box: the price that result must reach for the batch to break even.
    const need1 = missing.length === 1 ? Math.max(0, (spend - back) / (m.odds.passes[missing[0]] * qty)) : null;
    sum.className = 'trd-sum thin';
    sum.innerHTML = `<div class="trd-eq">${box('', tr('다 팔면', 'Sell it all'), '?', tr('팔 값이 빈 결과가 있어요', 'some results have no price'))}<i>−</i>${box('', tr('쓰는 돈', 'You spend'), money(spend))}<i>=</i>${box('', tr('남는 돈', 'Left'), '?')}</div>
<p class="trd-big-line">${few ? tr(`${missing.map(label).join(', ')} 값을 적으면 남는 돈이 나와요`, `Type a price for ${missing.map(label).join(', ')} to see what is left`) : tr(`팔 값이 빈 결과가 ${missing.length}개 있어요`, `${missing.length} results have no sale price`)}</p>
<p>${back > 0 ? tr(`값이 있는 결과만 팔면 ${money(back)} 메소예요. `, `The priced results sell for ${money(back)} mesos. `) : ''}${need1 != null ? tr(`${label(missing[0])} 장비가 개당 <strong>${money(need1)}</strong> 메소 넘게 팔려야 본전이에요.`, `${label(missing[0])} has to sell above <strong>${money(need1)}</strong> mesos each to break even.`) : tr('아래 나오는 장비의 빈 칸에 내가 팔 값을 적으세요.', 'Fill the empty price boxes under "What comes out".')}</p>`;
  } else {
    const left = back - spend, gain = left >= 0, t = gain ? 'good' : 'bad';
    const batch = qty === 1 ? tr('한 개 작 하면', 'One piece') : tr(`${nf.format(qty)}개 작 하면`, `${nf.format(qty)} pieces`);
    sum.className = `trd-sum ${t}`;
    sum.innerHTML = `<div class="trd-eq">${box('', tr('다 팔면', 'Sell it all'), money(back), tr('평균', 'on average'))}<i>−</i>${box('', tr('쓰는 돈', 'You spend'), money(spend), scroll.destroy ? tr('평균', 'on average') : '')}<i>=</i>${box(t, gain ? tr('남는 돈', 'Left') : tr('잃는 돈', 'Lost'), signed(left), tr('메소', 'mesos'))}</div>
<p class="trd-big-line">${gain ? tr(`${batch} 평균 ${money(left)} 메소 남아요`, `${batch}: ${money(left)} mesos ahead on average`) : tr(`${batch} 평균 ${money(-left)} 메소 잃어요`, `${batch}: ${money(-left)} mesos behind on average`)}</p>
<dl class="trd-stats"><div><dt>${tr('이득으로 끝날 확률', 'Chance to end ahead')}</dt><dd>${pct(spread.win)}${pips(spread.win, spread.win >= 0.5 ? 'good' : spread.win >= 0.2 ? 'mid' : 'bad')}</dd></div>
<div><dt>${tr('운이 나쁘면', 'With bad luck')}</dt><dd class="${spread.lo >= 0 ? 'gain' : 'loss'}">${signed(spread.lo)}</dd></div>
<div><dt>${tr('운이 좋으면', 'With good luck')}</dt><dd class="${spread.hi >= 0 ? 'gain' : 'loss'}">${signed(spread.hi)}</dd></div>
<div><dt>${tr('본전 넘기는 결과', 'Result that pays one piece back')}</dt><dd>${needs >= 0 ? tr(`${label(needs)}부터`, `${label(needs)} and up`) : tr('없어요', 'None')}</dd></div></dl>
<p class="trd-sum-tip">${needs < 0 ? tr('다 붙어도 한 개에 쓴 돈이 안 나와요. 주문서는 팔고 완성품을 사세요.', 'Even every pass does not pay one piece back. Sell the scrolls and buy a finished piece.') : gain ? tr('지금 시세면 많이 할수록 남아요. 운이 나쁠 때의 숫자를 버틸 수 있는 만큼만 하세요.', 'At today\'s prices more pieces leave more. Do as many as the bad-luck number lets you afford.') : tr('지금 시세면 많이 할수록 잃어요. 주문서 값이 내리거나 완성품 값이 오를 때 하세요.', 'At today\'s prices more pieces lose more. Wait for cheaper scrolls or dearer finished pieces.')}</p>`;
  }

  // ---- what you spend ----
  const cost = (key, labelText, sub, amount, unit, own) => `<div class="trd-row trd-row-cost"><span class="trd-res"><b>${labelText}</b><small>${sub}</small></span>
<label class="trd-val"><input data-cost="${key}" inputmode="decimal" autocomplete="off" value="${unit != null ? nf.format(unit) : ''}" placeholder="${tr('값', 'price')}" aria-label="${esc(labelText)}"${own ? ' class="own"' : ''}><small>${key === 'item' ? tr('개당', 'each') : tr('장당', 'per scroll')}</small></label>
<span class="trd-diff">${unit != null ? money(unit * amount) : '–'}</span></div>`;
  $('sp-spend').innerHTML = `${cost('item', tr('깨끗한 장비', 'Clean piece'), tr(`${nf.format(qty)}개`, `× ${nf.format(qty)}`), qty, itemPrice, typed.item != null)}
${cost('scroll', esc(scrollName(scroll)), scroll.destroy ? tr(`평균 ${nf.format(Math.round(scrollsUsed))}장`, `about ${nf.format(Math.round(scrollsUsed))}`) : tr(`${nf.format(n * qty)}장`, `× ${nf.format(n * qty)}`), scrollsUsed, scrollPrice, typed.scroll != null)}
<div class="trd-row trd-row-total"><span class="trd-res"><b>${tr('쓰는 돈', 'You spend')}</b></span><span></span><span class="trd-diff">${ready ? money(spend) : '–'}</span></div>`;
  $('sp-item-note').textContent = typed.item != null ? tr('장비 값은 직접 적은 값이에요.', 'The piece price is your own.')
    : m.clean ? (m.clean.basis === 'now' ? (m.clean.n >= 3 ? tr(`장비 값: 지금 팔고 있는 노작 매물 ${nf.format(m.clean.n)}개 중 세 번째로 싼 값이에요.`, `Piece: third cheapest of ${nf.format(m.clean.n)} clean pieces on sale now.`) : tr(`장비 값: 지금 팔고 있는 노작 매물 ${nf.format(m.clean.n)}개 중 제일 싼 값이에요.`, `Piece: cheapest of ${nf.format(m.clean.n)} clean pieces on sale now.`)) : m.clean.basis === 'sold' ? tr(`장비 값: 노작 매물 ${nf.format(m.clean.n)}개 중 팔린 ${nf.format(m.clean.sold)}개의 중간 값이에요.`, `Piece: middle of ${nf.format(m.clean.sold)} sold out of ${nf.format(m.clean.n)} clean listings.`) : tr(`장비 값: 노작 매물 ${nf.format(m.clean.n)}개 중 싼 쪽 값이에요.`, `Piece: cheap end of ${nf.format(m.clean.n)} clean listings.`))
      : tr('노작 매물이 없어요. 장비 값에 내가 산 값을 적으세요.', 'No clean piece is listed. Type what you paid for the piece.');
  $('sp-scroll-note').textContent = typed.scroll != null ? tr('주문서 값은 직접 적은 값이에요.', 'The scroll price is your own.')
    : m.scrollInfo?.sold?.n ? tr(`주문서 값: 하루 동안 팔린 ${nf.format(m.scrollInfo.sold.n)}장의 중간 값이에요.`, `Scroll: middle of ${nf.format(m.scrollInfo.sold.n)} sold in the last day.`)
      : m.scrollPrice ? tr('주문서 값: 지금 올라온 매물의 중간 값이에요.', 'Scroll: middle of what is listed now.') : tr('주문서 시세가 없어요. 내가 산 값을 적으세요.', 'No market price for the scroll. Type what you paid.');
  $('sp-reset').hidden = typed.item == null && typed.scroll == null && !Object.keys(typed.values).length;

  // ---- what comes out ----
  const table = $('sp-table');
  table.removeAttribute('aria-busy');
  $('sp-out-title').textContent = qty === 1 ? tr('나올 수 있는 결과', 'What can come out') : tr(`나오는 장비 (${nf.format(qty)}개 했을 때 평균)`, `What comes out (average of ${nf.format(qty)})`);
  $('sp-table-note').textContent = qty === 1 ? tr('한 개를 작 하면 이 중 하나가 나와요. 오른쪽 숫자는 그 결과를 팔았을 때 남는 돈이에요. 팔 값은 직접 고칠 수 있어요.', 'One piece ends as one of these. The number on the right is what that result leaves after selling. Every sale price can be edited.') : tr('결과마다 평균 몇 개가 나오는지와 개당 팔 값이에요. 팔 값은 직접 고칠 수 있어요.', 'How many of each result on average, and what each sells for. Every sale price can be edited.');
  const maxP = Math.max(...m.odds.passes, m.odds.boom);
  const rows = m.odds.passes.map((pr, k) => ({ k, pr })).reverse().filter((x) => x.pr > 1e-12);
  const many = (pr) => (qty === 1 ? `<b>${pct(pr)}</b>` : `<b>${tr(`${count(pr * qty)}개`, `× ${count(pr * qty)}`)}</b><small>${pct(pr)}</small>`);
  table.innerHTML = `${rows.map(({ k, pr }) => {
    const f = m.found[k], v = values[k], own = typed.values[k] != null;
    const note = own ? tr('직접 적은 값', 'your own price') : f ? (f.basis === 'sold' ? tr(`팔린 값 · 매물 ${f.n}개 중 ${f.sold}개 팔림`, `sold price · ${f.sold} of ${f.n} sold`) : tr(`싼 쪽 매물 값 · 매물 ${f.n}개`, `cheap end of ${f.n} listed`)) : k === 0 ? tr('매물 없음 · 0으로 계산', 'none listed · counted as 0') : tr('매물 없음 · 값을 적으세요', 'none listed · type a price');
    return `<div class="trd-row${needs === k ? ' is-even' : ''}"><span class="trd-res"><b>${esc(label(k))}</b><small>${k === n ? tr('전부 성공', 'all passed') : k === 0 ? tr('전부 실패', 'all failed') : tr(`${k}번 성공`, `${k} passed`)}${span(k)}${needs === k ? `<em class="trd-even">${tr('여기부터 본전', 'pays back from here')}</em>` : ''}</small></span>
<span class="trd-prob"><span class="trd-prob-track"><span class="trd-prob-fill" style="width:${Math.max(1, (pr / maxP) * 100)}%"></span></span><span class="trd-many">${many(pr)}</span></span>
<label class="trd-val"><input data-k="${k}" inputmode="decimal" autocomplete="off" value="${v != null ? nf.format(v) : ''}" placeholder="${tr('개당 팔 값', 'price each')}" aria-label="${esc(`${label(k)} ${tr('개당 팔 값', 'sale price each')}`)}"${own ? ' class="own"' : ''}><small>${note}</small></label>
${qty === 1 ? `<span class="trd-diff ${v == null || !ready ? '' : v - one >= 0 ? 'gain' : 'loss'}">${v != null && ready ? signed(v - one) : '–'}</span>` : `<span class="trd-diff">${v != null ? money(v * pr * qty) : '–'}</span>`}</div>`;
  }).join('')}
${m.odds.boom > 0 ? `<div class="trd-row trd-row-boom"><span class="trd-res"><b>${tr('장비 파괴', 'Destroyed')}</b><small>${tr('혼돈 주문서 실패', 'failed Chaos scroll')}</small></span><span class="trd-prob"><span class="trd-prob-track"><span class="trd-prob-fill" style="width:${(m.odds.boom / maxP) * 100}%"></span></span><span class="trd-many">${many(m.odds.boom)}</span></span><span class="trd-val"><b>0</b><small>${tr('장비가 사라져요', 'the piece is gone')}</small></span><span class="trd-diff${qty === 1 ? ' loss' : ''}">${qty === 1 ? tr('쓴 만큼 잃어요', 'all spent is lost') : '0'}</span></div>` : ''}
<div class="trd-row trd-row-total"><span class="trd-res"><b>${qty === 1 ? tr('팔면 평균', 'Sells for, on average') : tr('다 팔면', 'Sell it all')}</b></span><span></span><span></span><span class="trd-diff">${missing.length ? '?' : money(back)}</span></div>`;
  setUrl();
}

// Typing in a price box redraws everything, then puts the caret back where it was in that box.
function onPrice(e) {
  const input = e.target.closest('input[data-k], input[data-cost]');
  if (!input) return;
  const raw = input.value.trim();
  const n = raw === '' ? null : /^0+$/.test(raw) ? 0 : parseMesos(raw);
  input.classList.toggle('bad', raw !== '' && n == null);
  if (raw !== '' && n == null) return;
  const sel = input.dataset.cost ? `input[data-cost="${input.dataset.cost}"]` : `input[data-k="${input.dataset.k}"]`;
  if (input.dataset.cost) typed[input.dataset.cost] = n; else if (n == null) delete typed.values[Number(input.dataset.k)]; else typed.values[Number(input.dataset.k)] = n;
  const pos = input.selectionStart;
  draw();
  const again = root.querySelector(sel);
  if (again) { again.value = raw; again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
}
// Leaving a box tidies it: the number gets its commas, an emptied box gets the market price back.
function onLeave(e) {
  const input = e.target.closest('input[data-k], input[data-cost]');
  // Moving straight to another price box keeps that box alive (a redraw would replace it under the caret).
  if (input && item && scroll && !e.relatedTarget?.matches?.('input[data-k], input[data-cost]')) draw();
}

function setQty(n, fill = true) {
  qty = Math.min(MAX_QTY, Math.max(1, Math.round(n) || 1));
  if (fill) $('sp-qty').value = qty;
  if (item && scroll) draw();
}
function pickScroll(s) { scroll = s; typed.scroll = null; typed.values = {}; drawScrolls(); draw(); }

async function choose(it, wantScroll, scrollTo = true) {
  item = it; scroll = null; typed = { item: null, scroll: null, values: {} };
  $('sp-start').hidden = true; $('sp-result').hidden = false;
  const baseText = Object.entries(it.inc).filter(([k]) => STAT[k]).sort((a, b) => STAT_ORDER.indexOf(a[0]) - STAT_ORDER.indexOf(b[0])).slice(0, 4).map(([k, v]) => `${STAT[k]} ${v}`).join(' · ');
  $('sp-item').innerHTML = `<span class="trd-item-ico">${icon(it.id, 48)}</span><div><h2>${esc(it.name)}</h2><p class="muted small">${tr(`업그레이드 가능 횟수 ${it.slots}`, `${it.slots} upgrade slots`)}${baseText ? ` · ${esc(baseText)}` : ''}</p></div>`;
  $('sp-market').href = `${root.dataset.market}?item=${it.id}`;
  for (const id of ['sp-scrolls', 'sp-sum', 'sp-table']) { $(id).innerHTML = ''; $(id).setAttribute('aria-busy', 'true'); }
  $('sp-sum').className = 'trd-sum';
  for (const id of ['sp-spend', 'sp-need']) $(id).innerHTML = '';
  for (const id of ['sp-item-note', 'sp-scroll-note', 'sp-table-note']) $(id).textContent = '';
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
    for (const id of ['sp-sum', 'sp-table']) { $(id).removeAttribute('aria-busy'); $(id).innerHTML = ''; }
    $('sp-sum').className = 'trd-sum thin';
    $('sp-sum').innerHTML = `<p class="trd-big-line">${tr('이 장비에 바르는 주문서가 없어요', 'No scroll fits this piece')}</p>`;
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
  $('sp-reset').addEventListener('click', () => { typed = { item: null, scroll: null, values: {} }; draw(); });
  $('sp-scrolls').addEventListener('click', (e) => { const b = e.target.closest('[data-scroll]'); if (b) pickScroll(scrolls.find((s) => s.id === Number(b.dataset.scroll))); });
  root.addEventListener('input', onPrice);
  root.addEventListener('focusout', onLeave);
  $('sp-qty').addEventListener('input', () => { const n = Number($('sp-qty').value.replace(/[^\d]/g, '')); if (n >= 1) setQty(n, false); });
  $('sp-qty').addEventListener('blur', () => setQty(qty));
  $('sp-qty').addEventListener('focus', () => $('sp-qty').select());
  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]'), preset = e.target.closest('[data-qty]');
    if (step) setQty(qty + Number(step.dataset.step));
    else if (preset) setQty(Number(preset.dataset.qty));
  });
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
  if (Number(p.get('n')) >= 1) setQty(Number(p.get('n')));
  if (first) { $('trd-q').value = first.name; choose(first, Number(p.get('scroll')), false); }
}
boot();
