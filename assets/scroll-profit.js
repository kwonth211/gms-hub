// /tools/scroll-profit/: pick a piece of gear, tap scrolls into its upgrade slots (one tap, one slot; different %
// scrolls of one stat can be mixed) and say how many pieces. The page then reads like a receipt: what you spend, what
// comes out (how many of each result), and what is left after selling it all. Rules live in trade-math.js.
import { makeMarketIndex } from './market-catalog.js';
import { uniqueListings, planCases, batchSpread, finishedPieces, cleanRange, fairPrice, inGroup, parseMesos } from './trade-math.js';
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
// plan: the scrolls for one piece, in the order they are used (at most one per upgrade slot).
let item = null, plan = [], qty = 10, listings = [], onSale = [], live = {};
// What the visitor typed over the market prices: the piece, each scroll by id, each result by "passes|gain".
let typed = { item: null, scrolls: {}, values: {} };

const statOf = (s) => STAT_ORDER.find((k) => s.inc[k]) || Object.keys(s.inc)[0];
const scrollName = (s) => (ko ? s.short || s.name : s.name);
const tier = (s) => (s.destroy ? tr('혼돈', 'Chaos') : `${s.success}%`);
const fits = () => scrolls.filter((s) => s.cat === item.cat);
// How many pieces: 12, 3.5, 0.8, 0.02.
const count = (x) => (x >= 100 ? nf.format(Math.round(x)) : x >= 0.095 ? String(Math.round(x * 10) / 10) : x >= 0.005 ? x.toFixed(2) : '<0.01');
const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
const marketScroll = (s) => live[s.id]?.median ?? s.price ?? null;
const priceOf = (s) => typed.scrolls[s.id] ?? marketScroll(s);
const keyOf = (o) => `${o.k}|${o.add}`;

function setUrl() {
  const p = new URLSearchParams();
  if (item) p.set('item', item.id);
  if (plan.length) p.set('plan', plan.map((s) => s.id).join('.'));
  if (qty !== 10) p.set('n', qty);
  history.replaceState(null, '', location.pathname + (p.size ? `?${p}` : ''));
}

// ---------- the slots and the scroll shelf ----------
function drawPlan() {
  const stat = plan.length ? statOf(plan[0]) : null;
  $('sp-slots').innerHTML = Array.from({ length: item.slots }, (_, i) => {
    const s = plan[i];
    return s
      ? `<li><button type="button" class="trd-slot on${s.destroy ? ' chaos' : ''}" data-slot="${i}" title="${esc(tr(`${s.full} 빼기`, `Remove ${s.full}`))}">${icon(s.id, 26)}<b>${tier(s)}</b><em>+${s.inc[stat]}</em></button></li>`
      : `<li><span class="trd-slot" aria-label="${esc(tr(`${i + 1}번 칸 비어 있음`, `Slot ${i + 1} empty`))}"><i>${i + 1}</i></span></li>`;
  }).join('');
  const full = plan.length >= item.slots;
  $('sp-fill').disabled = full || !plan.length;
  $('sp-clear').disabled = !plan.length;
  $('sp-fill').textContent = plan.length && !full ? tr(`남은 ${item.slots - plan.length}칸을 ${tier(plan[plan.length - 1])}로 채우기`, `Fill the other ${item.slots - plan.length} with ${tier(plan[plan.length - 1])}`) : tr('남은 칸 채우기', 'Fill the rest');
  const box = $('sp-scrolls');
  box.removeAttribute('aria-busy');
  const fit = fits();
  if (!fit.length) { box.innerHTML = `<p>${tr('이 장비에 바르는 주문서가 없어요.', 'No scroll fits this piece.')}</p>`; return; }
  // One row per stat: 100% / 60% / 10% / Chaos side by side. A plan sticks to one stat, so the other rows wait.
  const byStat = new Map();
  for (const s of fit) { const k = statOf(s); byStat.set(k, [...(byStat.get(k) || []), s]); }
  const order = [...byStat.keys()].sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b));
  box.innerHTML = order.map((k) => `<div class="trd-scroll-row${stat && stat !== k ? ' off' : ''}"><span class="trd-scroll-stat">${esc(STAT[k] || k)}</span>${byStat.get(k).sort((a, b) => b.success - a.success || a.destroy - b.destroy).map((s) => {
    const p = marketScroll(s), n = plan.filter((x) => x === s).length;
    return `<button type="button" class="trd-scroll${s.destroy ? ' chaos' : ''}${n ? ' on' : ''}" data-scroll="${s.id}" title="${esc(s.full)}"${(stat && stat !== k) || full ? ' disabled' : ''}>${icon(s.id, 26)}<span><b>${tier(s)}</b><em>+${s.inc[k]}</em></span><small>${p ? money(p) : tr('시세 없음', 'no price')}</small>${n ? `<i class="trd-scroll-n">×${n}</i>` : ''}</button>`;
  }).join('')}</div>`).join('');
  $('sp-slots-note').textContent = full ? tr('칸을 다 채웠어요. 바꾸려면 채운 칸을 눌러 빼세요.', 'Every slot is filled. Tap a filled slot to change it.')
    : stat ? tr(`${STAT[stat] || stat} 주문서만 섞을 수 있어요. 다른 능력치로 바꾸려면 다 비우기를 누르세요.`, `Only ${STAT[stat] || stat} scrolls mix in. Press Clear to switch to another stat.`)
      : tr('주문서를 누를 때마다 한 칸씩 채워져요. 채운 칸을 누르면 빠져요. 다른 % 주문서를 섞어도 돼요.', 'Each tap on a scroll fills one slot; tap a filled slot to empty it. Different % scrolls can be mixed.');
}

// ---------- the receipt ----------
function draw() {
  drawPlan();
  const sum = $('sp-sum'), table = $('sp-table');
  sum.removeAttribute('aria-busy'); table.removeAttribute('aria-busy');
  for (const b of document.querySelectorAll('.trd-qty-presets button')) b.setAttribute('aria-pressed', String(Number(b.dataset.qty) === qty));
  setUrl();
  if (!plan.length) {
    sum.className = 'trd-sum thin';
    sum.innerHTML = `<p class="trd-big-line">${tr('위에서 주문서를 눌러 칸을 채우세요', 'Tap scrolls above to fill the slots')}</p>`;
    table.innerHTML = ''; $('sp-spend').innerHTML = ''; $('sp-need').textContent = '';
    for (const id of ['sp-item-note', 'sp-scroll-note', 'sp-table-note']) $(id).textContent = '';
    $('sp-reset').hidden = true;
    return;
  }
  const stat = statOf(plan[0]), base = item.inc[stat] || 0, left = item.slots - plan.length;
  const cr = cleanRange(listings, stat, base);
  const { outcomes, booms, reach } = planCases(plan.map((s) => ({ success: s.success, destroy: s.destroy, gain: s.inc[stat] })));
  const boom = booms.reduce((s, b) => s + b.p, 0);
  // A result's sale price, best source first: pieces that ended exactly like it; pieces with the same stat and slots
  // left whatever their number of passes (a buyer pays for the stat); else the price of the nearest lower result that
  // has one, a floor ("worth at least this"); else 0. So there is always an answer, and each row says where its price
  // came from.
  const anyPasses = (o) => listings.filter((r) => r.opts && r.opts.slots === left && (r.opts.ups || 0) > 0 && (() => { const v = Number.isInteger(r.opts.stats?.[stat]) ? r.opts.stats[stat] : 0; return v >= cr.lo + o.add && v <= cr.hi + o.add; })());
  const found = new Map();
  for (const o of outcomes) {
    const exact = fairPrice(finishedPieces(listings, { stat, k: o.k, add: o.add, left, baseLo: cr.lo, baseHi: cr.hi }));
    const loose = exact || (o.k > 0 ? fairPrice(anyPasses(o)) : null);
    if (loose) found.set(keyOf(o), { ...loose, how: exact ? 'exact' : 'stat' });
  }
  for (const o of outcomes) {
    if (found.has(keyOf(o))) continue;
    const below = outcomes.filter((x) => x.add < o.add && found.get(keyOf(x))?.how !== 'floor' && found.has(keyOf(x))).sort((a, b) => b.add - a.add)[0];
    found.set(keyOf(o), below && o.k > 0 ? { price: found.get(keyOf(below)).price, how: 'floor', from: below } : { price: 0, how: 'zero' });
  }
  // The clean piece is something you buy: what the cheapest ones on sale now ask (the third cheapest, so one mispriced
  // listing does not set the cost). With none on sale, the week's listings.
  const cleanKey = `c:${item.slots}`, cheap = inGroup(onSale, cleanKey, item.sub).map((r) => r.price).sort((a, b) => a - b);
  const clean = cheap.length ? { price: cheap[Math.min(2, cheap.length - 1)], basis: 'now', n: cheap.length } : fairPrice(inGroup(listings, cleanKey, item.sub));
  const itemPrice = typed.item ?? clean?.price ?? null;
  const kinds = [...new Set(plan)];
  const ready = itemPrice != null && kinds.every((s) => priceOf(s) != null);
  // Gear whose clean stat is one number shows the finished number (공격력 8); gear that rolls a range (weapons) shows
  // what the scrolls add (공격력 +10) with the range underneath.
  const fixed = cr.lo === cr.hi, name = STAT[stat] || stat;
  const label = (o) => (fixed ? `${name} ${cr.lo + o.add}` : `${name} +${o.add}`);
  const span = (o) => (fixed ? '' : ` · ${cr.lo + o.add}~${cr.hi + o.add}`);
  // A piece on which every scroll failed has no buyers: 0 unless one is listed or the visitor says otherwise.
  const valueOf = (o) => typed.values[keyOf(o)] ?? found.get(keyOf(o)).price;
  const live1 = outcomes.filter((o) => o.p > 1e-12);
  const floors = live1.filter((o) => typed.values[keyOf(o)] == null && found.get(keyOf(o)).how === 'floor').length;
  const missing = live1.filter((o) => valueOf(o) == null && o.p > 1e-9);
  // Scrolls really spent per piece: a destroyed piece uses no more.
  const usedOf = (s) => plan.reduce((n, x, i) => n + (x === s ? reach[i] : 0), 0);
  const spend = ready ? (itemPrice + kinds.reduce((n, s) => n + priceOf(s) * usedOf(s), 0)) * qty : null;
  const one = ready ? itemPrice + plan.reduce((n, s) => n + priceOf(s), 0) : null;
  const back = live1.reduce((s, o) => s + o.p * (valueOf(o) ?? 0), 0) * qty;
  const known = ready && !missing.length;
  const spentTo = (used) => itemPrice + plan.slice(0, used).reduce((n, s) => n + priceOf(s), 0);
  const cases = known ? [...live1.map((o) => ({ p: o.p, net: valueOf(o) - one })), ...booms.map((b) => ({ p: b.p, net: -spentTo(b.used) }))] : null;
  const spread = cases ? batchSpread(cases, qty) : null;
  // The cheapest result that sells for more than one piece cost.
  const needs = ready ? [...live1].reverse().find((o) => valueOf(o) != null && valueOf(o) > one) : null;
  const planText = kinds.map((s) => `${scrollName(s)} ${plan.filter((x) => x === s).length}${tr('장', '')}`).join(' + ');

  $('sp-need').innerHTML = tr(`${esc(item.name)} <b>${nf.format(qty)}개</b>에 한 개마다 ${esc(planText)}을 발라요.${left ? ` ${left}칸은 비워 둬요.` : ''}${boom > 0 ? ' 장비가 터지면 남은 주문서는 안 써요.' : ''}`, `<b>${nf.format(qty)}</b> × ${esc(item.name)}, each with ${esc(planText)}.${left ? ` ${left} slots stay empty.` : ''}${boom > 0 ? ' A destroyed piece uses no more scrolls.' : ''}`);

  // ---- the answer: sale − spend = left ----
  const box = (cls, labelText, value, sub) => `<div class="trd-sum-box ${cls}"><span>${labelText}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  if (!ready) {
    sum.className = 'trd-sum thin';
    sum.innerHTML = `<p class="trd-big-line">${tr('아래 쓰는 돈의 빈 칸에 값을 적으세요', 'Fill the empty prices under "What you spend"')}</p>`;
  } else if (!known) {
    // With one empty box: the price that result must reach for the batch to break even.
    const need1 = missing.length === 1 ? Math.max(0, (spend - back) / (missing[0].p * qty)) : null;
    sum.className = 'trd-sum thin';
    sum.innerHTML = `<div class="trd-eq">${box('', tr('다 팔면', 'Sell it all'), '?', tr('팔 값이 빈 결과가 있어요', 'some results have no price'))}<i>−</i>${box('', tr('쓰는 돈', 'You spend'), money(spend))}<i>=</i>${box('', tr('남는 돈', 'Left'), '?')}</div>
<p class="trd-big-line">${missing.length <= 2 ? tr(`${missing.map(label).join(', ')} 값을 적으면 남는 돈이 나와요`, `Type a price for ${missing.map(label).join(', ')} to see what is left`) : tr(`팔 값이 빈 결과가 ${missing.length}개 있어요`, `${missing.length} results have no sale price`)}</p>
<p>${back > 0 ? tr(`값이 있는 결과만 팔면 ${money(back)} 메소예요. `, `The priced results sell for ${money(back)} mesos. `) : ''}${need1 != null ? tr(`${label(missing[0])} 장비가 개당 <strong>${money(need1)}</strong> 메소 넘게 팔려야 본전이에요.`, `${label(missing[0])} has to sell above <strong>${money(need1)}</strong> mesos each to break even.`) : tr('아래 나오는 장비의 빈 칸에 내가 팔 값을 적으세요.', 'Fill the empty price boxes under "What comes out".')}</p>`;
  } else {
    const rest = back - spend, gain = rest >= 0, t = gain ? 'good' : 'bad';
    const batch = qty === 1 ? tr('한 개 작 하면', 'One piece') : tr(`${nf.format(qty)}개 작 하면`, `${nf.format(qty)} pieces`);
    sum.className = `trd-sum ${t}`;
    sum.innerHTML = `<div class="trd-eq">${box('', tr('다 팔면', 'Sell it all'), money(back), tr('평균', 'on average'))}<i>−</i>${box('', tr('쓰는 돈', 'You spend'), money(spend), boom > 0 ? tr('평균', 'on average') : '')}<i>=</i>${box(t, gain ? tr('남는 돈', 'Left') : tr('잃는 돈', 'Lost'), signed(rest), tr('메소', 'mesos'))}</div>
<p class="trd-big-line">${gain ? tr(`${batch} 평균 ${money(rest)} 메소 남아요`, `${batch}: ${money(rest)} mesos ahead on average`) : tr(`${batch} 평균 ${money(-rest)} 메소 잃어요`, `${batch}: ${money(-rest)} mesos behind on average`)}</p>
<dl class="trd-stats"><div><dt>${tr('이득으로 끝날 확률', 'Chance to end ahead')}</dt><dd>${pct(spread.win)}${pips(spread.win, spread.win >= 0.5 ? 'good' : spread.win >= 0.2 ? 'mid' : 'bad')}</dd></div>
<div><dt>${tr('운이 나쁘면', 'With bad luck')}</dt><dd class="${spread.lo >= 0 ? 'gain' : 'loss'}">${signed(spread.lo)}</dd></div>
<div><dt>${tr('운이 좋으면', 'With good luck')}</dt><dd class="${spread.hi >= 0 ? 'gain' : 'loss'}">${signed(spread.hi)}</dd></div>
<div><dt>${tr('본전 넘기는 결과', 'Result that pays one piece back')}</dt><dd>${needs ? tr(`${label(needs)}부터`, `${label(needs)} and up`) : tr('없어요', 'None')}</dd></div></dl>
${floors ? `<p class="muted small">${tr(`매물이 없는 결과 ${floors}개는 바로 아래 결과의 값으로 쳤어요. 실제로는 더 받을 수 있어요. 아래 표에서 값을 고치세요.`, `${floors} results with no listing are priced as the next result down; they are worth more. Edit them in the table below.`)}</p>` : ''}
<p class="trd-sum-tip">${!needs ? tr('다 붙어도 한 개에 쓴 돈이 안 나와요. 주문서는 팔고 완성품을 사세요.', 'Even every pass does not pay one piece back. Sell the scrolls and buy a finished piece.') : gain ? tr('지금 시세면 많이 할수록 남아요. 운이 나쁠 때의 숫자를 버틸 수 있는 만큼만 하세요.', 'At today\'s prices more pieces leave more. Do as many as the bad-luck number lets you afford.') : tr('지금 시세면 많이 할수록 잃어요. 주문서 값이 내리거나 완성품 값이 오를 때 하세요.', 'At today\'s prices more pieces lose more. Wait for cheaper scrolls or dearer finished pieces.')}</p>`;
  }

  // ---- what you spend ----
  const cost = (key, labelText, sub, amount, unit, own, per) => `<div class="trd-row trd-row-cost"><span class="trd-res"><b>${labelText}</b><small>${sub}</small></span>
<label class="trd-val"><input data-cost="${key}" inputmode="decimal" autocomplete="off" value="${unit != null ? nf.format(unit) : ''}" placeholder="${tr('값', 'price')}" aria-label="${esc(labelText)}"${own ? ' class="own"' : ''}><small>${per}</small></label>
<span class="trd-diff">${unit != null ? money(unit * amount) : '–'}</span></div>`;
  $('sp-spend').innerHTML = `${cost('item', tr('깨끗한 장비', 'Clean piece'), tr(`${nf.format(qty)}개`, `× ${nf.format(qty)}`), qty, itemPrice, typed.item != null, tr('개당', 'each'))}
${kinds.map((s) => { const u = usedOf(s) * qty, n = plan.filter((x) => x === s).length * qty; return cost(s.id, esc(scrollName(s)), Math.abs(u - n) > 0.5 ? tr(`평균 ${nf.format(Math.round(u))}장`, `about ${nf.format(Math.round(u))}`) : tr(`${nf.format(n)}장`, `× ${nf.format(n)}`), u, priceOf(s), typed.scrolls[s.id] != null, tr('장당', 'per scroll')); }).join('')}
<div class="trd-row trd-row-total"><span class="trd-res"><b>${tr('쓰는 돈', 'You spend')}</b></span><span></span><span class="trd-diff">${ready ? money(spend) : '–'}</span></div>`;
  $('sp-item-note').textContent = typed.item != null ? tr('장비 값은 직접 적은 값이에요.', 'The piece price is your own.')
    : clean ? (clean.basis === 'now' ? (clean.n >= 3 ? tr(`장비 값: 지금 팔고 있는 노작 매물 ${nf.format(clean.n)}개 중 세 번째로 싼 값이에요.`, `Piece: third cheapest of ${nf.format(clean.n)} clean pieces on sale now.`) : tr(`장비 값: 지금 팔고 있는 노작 매물 ${nf.format(clean.n)}개 중 제일 싼 값이에요.`, `Piece: cheapest of ${nf.format(clean.n)} clean pieces on sale now.`)) : clean.basis === 'sold' ? tr(`장비 값: 노작 매물 ${nf.format(clean.n)}개 중 팔린 ${nf.format(clean.sold)}개의 중간 값이에요.`, `Piece: middle of ${nf.format(clean.sold)} sold out of ${nf.format(clean.n)} clean listings.`) : tr(`장비 값: 노작 매물 ${nf.format(clean.n)}개 중 싼 쪽 값이에요.`, `Piece: cheap end of ${nf.format(clean.n)} clean listings.`))
      : tr('노작 매물이 없어요. 장비 값에 내가 산 값을 적으세요.', 'No clean piece is listed. Type what you paid for the piece.');
  $('sp-scroll-note').textContent = kinds.some((s) => priceOf(s) == null) ? tr('시세가 없는 주문서는 내가 산 값을 적으세요.', 'Where a scroll has no market price, type what you paid.') : tr('주문서 값: 실시간 시세의 최근 하루 값이에요.', 'Scrolls: the live market price of the last day.');
  $('sp-reset').hidden = typed.item == null && !Object.keys(typed.scrolls).length && !Object.keys(typed.values).length;

  // ---- what comes out ----
  $('sp-out-title').textContent = qty === 1 ? tr('나올 수 있는 결과', 'What can come out') : tr(`나오는 장비 (${nf.format(qty)}개 했을 때 평균)`, `What comes out (average of ${nf.format(qty)})`);
  $('sp-table-note').textContent = qty === 1 ? tr('한 개를 작 하면 이 중 하나가 나와요. 오른쪽 숫자는 그 결과를 팔았을 때 남는 돈이에요. 팔 값은 직접 고칠 수 있어요.', 'One piece ends as one of these. The number on the right is what that result leaves after selling. Every sale price can be edited.') : tr('결과마다 평균 몇 개가 나오는지와 개당 팔 값이에요. 팔 값은 직접 고칠 수 있어요.', 'How many of each result on average, and what each sells for. Every sale price can be edited.');
  const maxP = Math.max(...live1.map((o) => o.p), boom);
  const many = (pr) => (qty === 1 ? `<b>${pct(pr)}</b>` : `<b>${tr(`${count(pr * qty)}개`, `× ${count(pr * qty)}`)}</b><small>${pct(pr)}</small>`);
  table.innerHTML = `${live1.map((o) => {
    const f = found.get(keyOf(o)), v = valueOf(o), own = typed.values[keyOf(o)] != null;
    const note = own ? tr('직접 적은 값', 'your own price') : f.how === 'zero' ? tr('매물 없음 · 0으로 계산', 'none listed · counted as 0') : f.how === 'floor' ? tr(`매물 없음 · ${label(f.from)} 값으로 계산`, `none listed · priced as ${label(f.from)}`) : f.basis === 'sold' ? tr(`팔린 값 · 매물 ${f.n}개 중 ${f.sold}개 팔림`, `sold price · ${f.sold} of ${f.n} sold`) : tr(`싼 쪽 매물 값 · 매물 ${f.n}개`, `cheap end of ${f.n} listed`);
    const even = needs && keyOf(needs) === keyOf(o);
    return `<div class="trd-row${even ? ' is-even' : ''}"><span class="trd-res"><b>${esc(label(o))}</b><small>${o.k === plan.length ? tr('전부 성공', 'all passed') : o.k === 0 ? tr('전부 실패', 'all failed') : tr(`${o.k}번 성공`, `${o.k} passed`)}${span(o)}${even ? `<em class="trd-even">${tr('여기부터 본전', 'pays back from here')}</em>` : ''}</small></span>
<span class="trd-prob"><span class="trd-prob-track"><span class="trd-prob-fill" style="width:${Math.max(1, (o.p / maxP) * 100)}%"></span></span><span class="trd-many">${many(o.p)}</span></span>
<label class="trd-val"><input data-k="${keyOf(o)}" inputmode="decimal" autocomplete="off" value="${v != null ? nf.format(v) : ''}" placeholder="${tr('개당 팔 값', 'price each')}" aria-label="${esc(`${label(o)} ${tr('개당 팔 값', 'sale price each')}`)}"${own ? ' class="own"' : ''}><small>${note}</small></label>
${qty === 1 ? `<span class="trd-diff ${v == null || !ready ? '' : v - one >= 0 ? 'gain' : 'loss'}">${v != null && ready ? signed(v - one) : '–'}</span>` : `<span class="trd-diff">${v != null ? money(v * o.p * qty) : '–'}</span>`}</div>`;
  }).join('')}
${boom > 0 ? `<div class="trd-row trd-row-boom"><span class="trd-res"><b>${tr('장비 파괴', 'Destroyed')}</b><small>${tr('혼돈 주문서 실패', 'failed Chaos scroll')}</small></span><span class="trd-prob"><span class="trd-prob-track"><span class="trd-prob-fill" style="width:${(boom / maxP) * 100}%"></span></span><span class="trd-many">${many(boom)}</span></span><span class="trd-val"><b>0</b><small>${tr('장비가 사라져요', 'the piece is gone')}</small></span><span class="trd-diff${qty === 1 ? ' loss' : ''}">${qty === 1 ? tr('쓴 만큼 잃어요', 'all spent is lost') : '0'}</span></div>` : ''}
<div class="trd-row trd-row-total"><span class="trd-res"><b>${qty === 1 ? tr('팔면 평균', 'Sells for, on average') : tr('다 팔면', 'Sell it all')}</b></span><span></span><span></span><span class="trd-diff">${missing.length ? '?' : money(back)}</span></div>`;
}

// Typing in a price box redraws everything, then puts the caret back where it was in that box.
function onPrice(e) {
  const input = e.target.closest('input[data-k], input[data-cost]');
  if (!input) return;
  const raw = input.value.trim();
  const n = raw === '' ? null : /^0+$/.test(raw) ? 0 : parseMesos(raw);
  input.classList.toggle('bad', raw !== '' && n == null);
  if (raw !== '' && n == null) return;
  const set = (bag, key) => { if (n == null) delete bag[key]; else bag[key] = n; };
  const sel = input.dataset.cost ? `input[data-cost="${input.dataset.cost}"]` : `input[data-k="${input.dataset.k}"]`;
  if (input.dataset.cost === 'item') typed.item = n; else if (input.dataset.cost) set(typed.scrolls, Number(input.dataset.cost)); else set(typed.values, input.dataset.k);
  const pos = input.selectionStart;
  draw();
  const again = root.querySelector(sel);
  if (again) { again.value = raw; again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
}
// Leaving a box tidies it: the number gets its commas, an emptied box gets the market price back.
function onLeave(e) {
  const input = e.target.closest('input[data-k], input[data-cost]');
  // Moving straight to another price box keeps that box alive (a redraw would replace it under the caret).
  if (input && item && !e.relatedTarget?.matches?.('input[data-k], input[data-cost]')) draw();
}

function setQty(n, fill = true) {
  qty = Math.min(MAX_QTY, Math.max(1, Math.round(n) || 1));
  if (fill) $('sp-qty').value = qty;
  if (item) draw();
}
// A tap on a scroll fills the next empty slot; the results typed for the old plan no longer fit.
function addScroll(s) {
  if (plan.length >= item.slots || (plan.length && statOf(plan[0]) !== statOf(s))) return;
  plan.push(s); typed.values = {}; draw();
  track('scroll_profit_add', { page_type: 'scroll_profit' });
}
function removeSlot(i) { plan.splice(i, 1); typed.values = {}; draw(); }

async function choose(it, wantPlan, scrollTo = true) {
  item = it; plan = []; typed = { item: null, scrolls: {}, values: {} };
  $('sp-start').hidden = true; $('sp-result').hidden = false;
  const baseText = Object.entries(it.inc).filter(([k]) => STAT[k]).sort((a, b) => STAT_ORDER.indexOf(a[0]) - STAT_ORDER.indexOf(b[0])).slice(0, 4).map(([k, v]) => `${STAT[k]} ${v}`).join(' · ');
  $('sp-item').innerHTML = `<span class="trd-item-ico">${icon(it.id, 48)}</span><div><h2>${esc(it.name)}</h2><p class="muted small">${tr(`업그레이드 가능 횟수 ${it.slots}`, `${it.slots} upgrade slots`)}${baseText ? ` · ${esc(baseText)}` : ''}</p></div>`;
  $('sp-market').href = `${root.dataset.market}?item=${it.id}`;
  for (const id of ['sp-scrolls', 'sp-sum', 'sp-table']) { $(id).innerHTML = ''; $(id).setAttribute('aria-busy', 'true'); }
  $('sp-sum').className = 'trd-sum';
  for (const id of ['sp-spend', 'sp-need', 'sp-slots']) $(id).innerHTML = '';
  for (const id of ['sp-item-note', 'sp-scroll-note', 'sp-table-note']) $(id).textContent = '';
  if (scrollTo) $('sp-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const fit = fits();
  let data = { rows: [], profile: [] }, failed = false;
  try {
    const [h, p] = await Promise.all([getJson(`${api}/market/history?id=${it.id}`), fit.length ? getJson(`${api}/prices?ids=${fit.map((s) => s.id).join(',')}`).catch(() => ({})) : {}]);
    data = h; live = p;
  } catch { failed = true; }
  if (item !== it) return;
  listings = uniqueListings(data.rows);
  onSale = uniqueListings(data.profile);
  if (fit.length) {
    // A shared link carries its plan. Otherwise start with every slot on the scroll players use most: 60% attack
    // (magic for wands and staves), else the first 60%, so the answer is on screen before the first tap.
    const wanted = (wantPlan || []).map((id) => fit.find((s) => s.id === id)).filter(Boolean).slice(0, it.slots);
    const main = MAGIC.has(it.sub) ? 'MAD' : 'PAD';
    const first = fit.find((s) => statOf(s) === main && s.success === 60) || fit.find((s) => s.success === 60) || fit[0];
    plan = wanted.length && wanted.every((s) => statOf(s) === statOf(wanted[0])) ? wanted : Array.from({ length: it.slots }, () => first);
  }
  draw();
  if (!fit.length) { $('sp-sum').className = 'trd-sum thin'; $('sp-sum').innerHTML = `<p class="trd-big-line">${tr('이 장비에 바르는 주문서가 없어요', 'No scroll fits this piece')}</p>`; }
  if (failed) $('sp-table-note').textContent = tr('시세를 불러오지 못했어요. 값을 직접 적으면 계산돼요.', 'Could not load market prices. Type the prices and it still works.');
  track('scroll_profit', { page_type: 'scroll_profit', item_id: it.id });
}

async function boot() {
  $('sp-reset').addEventListener('click', () => { typed = { item: null, scrolls: {}, values: {} }; draw(); });
  $('sp-scrolls').addEventListener('click', (e) => { const b = e.target.closest('[data-scroll]'); if (b && !b.disabled) addScroll(scrolls.find((s) => s.id === Number(b.dataset.scroll))); });
  $('sp-slots').addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (b) removeSlot(Number(b.dataset.slot)); });
  $('sp-clear').addEventListener('click', () => { plan = []; typed.values = {}; draw(); });
  $('sp-fill').addEventListener('click', () => { const last = plan[plan.length - 1]; if (!last) return; while (plan.length < item.slots) plan.push(last); typed.values = {}; draw(); });
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
  // Old links carried one scroll for every slot (?scroll=); new ones carry the plan (?plan=a.b.c).
  const wantPlan = p.get('plan') ? p.get('plan').split('.').map(Number) : Number(p.get('scroll')) && first ? Array.from({ length: first.slots }, () => Number(p.get('scroll'))) : null;
  if (first) { $('trd-q').value = first.name; choose(first, wantPlan, false); }
}
boot();
