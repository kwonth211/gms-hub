// "내 장비 세트" (owner 2026-11-21): on the home "my character" panel the player puts one item in each slot (weapon, hat,
// top or overall, bottom, shoes, gloves, cape, earrings, shield), sees the character wearing them and what each piece and
// the whole set sell for now. Saved in this browser under gms-char-set (synced with the account copy like gms-char).
import { optionFilter, encodeOptionFilter } from './option-filter.js';

const KEY = 'gms-char-set';
// Options per slot (exact values, the same filter as the market's "same options" prices): { slot: { stats: {PAD: 22}, ups: 3 } }.
const OPT_KEY = 'gms-char-set-opts';

export const SLOTS = ['weapon', 'hat', 'top', 'bottom', 'shoes', 'glove', 'cape', 'earrings', 'shield'];
const WEAPON_SUBS = ['One-Handed Sword', 'Two-Handed Sword', 'One-Handed Axe', 'Two-Handed Axe', 'One-Handed Blunt Weapon', 'Two-Handed Blunt',
  'Spear', 'Pole Arm', 'Wand', 'Staff', 'Bow', 'Crossbow', 'Claw', 'Dagger'];
// Weapons held in both hands: no shield with them.
export const TWO_HANDED = new Set(['Two-Handed Sword', 'Two-Handed Axe', 'Two-Handed Blunt', 'Spear', 'Pole Arm', 'Bow', 'Crossbow', 'Claw']);
const SUBS = { weapon: WEAPON_SUBS, hat: ['Hat'], top: ['Top', 'Overall'], bottom: ['Bottom'], shoes: ['Shoes'], glove: ['Glove'], cape: ['Cape'],
  earrings: ['Earrings'], shield: ['Shield'] };
export const slotOf = (sub) => SLOTS.find((s) => SUBS[s].includes(sub)) || null;

export function loadSet() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? Object.fromEntries(SLOTS.filter((s) => Number.isInteger(v[s])).map((s) => [s, v[s]])) : {};
  } catch (e) { return {}; }
}
function saveSet(set) { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) {} }
export function loadOpts() {
  try {
    const v = JSON.parse(localStorage.getItem(OPT_KEY) || '{}');
    return Object.fromEntries(SLOTS.map((s) => [s, optionFilter(v?.[s])]).filter(([, f]) => f));
  } catch (e) { return {}; }
}
function saveOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch (e) {} }
// Option fields shown per slot; empty means "any".
export const OPT_FIELDS = { weapon: ['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC'], other: ['STR', 'DEX', 'INT', 'LUK', 'PAD', 'MAD', 'ACC', 'EVA', 'Speed', 'Jump', 'PDD', 'MHP'] };
// The price for one listing set: open asks first (their median), otherwise every matching record of the last 30 days.
export function optionPrice(history) {
  const s = history?.summary;
  if (s?.median) return { price: s.median, n: s.open || 0, kind: 'open' };
  const prices = (history?.rows || []).map((r) => r.price).filter((x) => x > 0).sort((a, b) => a - b);
  if (!prices.length) return { price: null, n: 0, kind: 'none' };
  return { price: prices[Math.floor(prices.length / 2)], n: prices.length, kind: 'recent' };
}

// Puts an item in its slot and takes off what cannot be worn with it: an overall takes the bottom's place, a bottom takes
// off an overall, a two-handed weapon takes off the shield and a shield takes off a two-handed weapon.
export function wear(set, item, subOf) {
  const sub = subOf(item), slot = slotOf(sub);
  if (!slot) return set;
  const next = { ...set, [slot]: item };
  if (sub === 'Overall') delete next.bottom;
  if (slot === 'bottom' && next.top && subOf(next.top) === 'Overall') delete next.top;
  if (TWO_HANDED.has(sub)) delete next.shield;
  if (slot === 'shield' && next.weapon && TWO_HANDED.has(subOf(next.weapon))) delete next.weapon;
  return next;
}
// Sum of the prices that are known, and how many pieces have none.
export function setTotal(set, priceOf) {
  let sum = 0, missing = 0;
  for (const id of Object.values(set)) { const p = priceOf(id); if (p) sum += p; else missing += 1; }
  return { sum, missing, n: Object.keys(set).length };
}

// The picture: the game's default face and hair on a plain body, wearing the set (maplestory.io renders it).
export const renderUrl = (set, subOf) => {
  const ids = SLOTS.map((s) => set[s]).filter(Boolean);
  const pose = set.weapon && TWO_HANDED.has(subOf(set.weapon)) ? 'stand2' : 'stand1';
  return `https://maplestory.io/api/MCW/1/character/2000/12000,20000,30000,${ids.join(',')}/${pose}/0?resize=2`;
};

export function makeSet({ korean, market, api, track, esc, mesos }) {
  const t = korean
    ? { h: '내 장비 세트', p: '부위마다 장비를 넣어 보면 입은 모습과 지금 시세, 세트 전체 값을 바로 보여 줘요.', total: '세트 합계', add: '추가', change: '변경', remove: '빼기',
      search: '아이템 이름으로 찾기', close: '닫기', noPrice: '시세 없음', cant: '지금 못 낌', missing: (n) => `시세 없는 ${n}개 제외`, empty: '아직 넣은 장비가 없어요. 부위의 + 를 눌러 넣어 보세요.',
      none: '찾는 장비가 없어요.', worn: '한벌옷 착용 중', two: '두손무기 착용 중', reset: '세트 비우기', live: '실시간 시세',
      slot: { weapon: '무기', hat: '모자', top: '상의·한벌옷', bottom: '하의', shoes: '신발', glove: '장갑', cape: '망토', earrings: '귀고리', shield: '방패' },
      opt: '옵션', optHint: '아는 값만 적으세요. 비운 칸은 상관없음이에요. 같은 옵션으로 팔린·판매 중인 매물로 시세를 계산해요.', apply: '적용', clearOpt: '옵션 지우기',
      ups: '강화 성공', slots: '남은 업횟', optOpen: (n) => `같은 옵션 판매 중 ${n}건`, optRecent: (n) => `같은 옵션 최근 30일 ${n}건`, optNone: '같은 옵션 기록 없음', optLoading: '옵션 시세 찾는 중…',
      base: '기본(노작)', anyOpt: '옵션 상관없이',
      stat: { PAD: '공격력', MAD: '마력', STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK', ACC: '명중', EVA: '회피', Speed: '이동속도', Jump: '점프', PDD: '방어력', MDD: '마법방어', MHP: 'HP', MMP: 'MP', CRT: '크리티컬', CRD: '크리 데미지' } }
    : { h: 'My gear set', p: 'Put a piece in each slot to see your character wearing it, what each piece sells for now and the whole set.', total: 'Set total', add: 'Add', change: 'Change', remove: 'Remove',
      search: 'Find an item by name', close: 'Close', noPrice: 'No price', cant: 'Not wearable yet', missing: (n) => `${n} without a price left out`, empty: 'No gear yet. Tap + on a slot to add one.',
      none: 'No matching gear.', worn: 'Wearing an overall', two: 'Two-handed weapon', reset: 'Clear the set', live: 'Live prices',
      slot: { weapon: 'Weapon', hat: 'Hat', top: 'Top / overall', bottom: 'Bottom', shoes: 'Shoes', glove: 'Gloves', cape: 'Cape', earrings: 'Earrings', shield: 'Shield' },
      opt: 'Options', optHint: 'Fill in only what you know; empty means any. The price comes from listings with the same options.', apply: 'Apply', clearOpt: 'Clear options',
      ups: 'Upgrades passed', slots: 'Slots left', optOpen: (n) => `${n} for sale with these options`, optRecent: (n) => `${n} in 30 days with these options`, optNone: 'No listings with these options', optLoading: 'Finding the option price…',
      base: 'Base (clean)', anyOpt: 'Any options',
      stat: { PAD: 'Attack', MAD: 'Magic', STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK', ACC: 'Accuracy', EVA: 'Avoid', Speed: 'Speed', Jump: 'Jump', PDD: 'Defense', MDD: 'M. Defense', MHP: 'HP', MMP: 'MP', CRT: 'Critical', CRD: 'Crit damage' } };
  let gear = [], byId = new Map(), live = {}, open = null, query = '', liveFor = '', editing = null;
  const optLive = {}; // `${id}|${filter}` -> { price, n, kind } (null while loading)
  const optKey = (id, f) => `${id}|${encodeOptionFilter(f)}`;
  const subOf = (id) => byId.get(id)?.[3];
  // Live price from the worker when it answered, the price in the daily build otherwise.
  const priceOf = (id) => live[id]?.median || byId.get(id)?.[8] || null;
  const nameOf = (id) => { const g = byId.get(id); return g ? (korean ? g[1] : g[2]) : `#${id}`; };
  const icon = (id, s = 32) => `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${s}" height="${s}" loading="lazy">`;
  const fitsChar = (g, c, bit) => g[4] <= c.lv && (!g[5] || (g[5] & bit));
  // A clean piece: its base stats, every upgrade slot left, none passed. Picking an item starts from this.
  const baseOf = (id) => { const g = byId.get(id); return g ? optionFilter({ stats: g[9] || {}, ...(Number.isInteger(g[10]) ? { slots: g[10] } : {}), ups: 0 }) : null; };
  // A slot with options is priced from listings with the same options only, never from the item-wide price.
  const priceIn = (slot, id, opts) => (opts[slot] ? optLive[optKey(id, opts[slot])]?.price || null : priceOf(id));
  const optText = (f) => [...Object.entries(f.stats || {}).map(([k, v]) => `${t.stat[k] || k} ${v}`),
    ...(f.ups !== undefined ? [`${t.ups} ${f.ups}`] : []), ...(f.slots !== undefined ? [`${t.slots} ${f.slots}`] : [])].join(' · ');

  const refreshLive = async (set, redraw) => {
    if (!api) return;
    const opts = loadOpts();
    for (const [slot, f] of Object.entries(opts)) {
      const id = set[slot], k = id && optKey(id, f);
      if (!k || k in optLive) continue;
      optLive[k] = null;
      fetch(`${api}/market/history?${new URLSearchParams({ id, opts: encodeOptionFilter(f) })}`).then((r) => (r.ok ? r.json() : null))
        .then((h) => { optLive[k] = optionPrice(h); redraw(); }).catch(() => { optLive[k] = { price: null, n: 0, kind: 'none' }; redraw(); });
    }
    const ids = Object.values(set).sort().join(',');
    if (!ids || ids === liveFor) return;
    liveFor = ids;
    try {
      const r = await fetch(`${api}/prices?ids=${ids}`);
      if (r.ok) { live = { ...live, ...(await r.json()) }; redraw(); }
    } catch (e) {}
  };
  const editor = (slot, f) => {
    const id = loadSet()[slot], base = baseOf(id);
    const fields = [...new Set([...Object.keys(base?.stats || {}), ...Object.keys(f?.stats || {}), ...OPT_FIELDS[slot === 'weapon' ? 'weapon' : 'other']])];
    const num = (name, label, val) => `<label><span>${esc(label)}</span><input type="number" inputmode="numeric" name="${name}" value="${val ?? ''}" min="-99" max="999" placeholder="—"></label>`;
    return `<form class="cset-opt" data-cset-optform="${slot}"><p class="muted">${esc(t.optHint)}</p><div class="cset-opt-grid">
${fields.map((k) => num(`s_${k}`, t.stat[k], f?.stats?.[k])).join('')}${num('ups', t.ups, f?.ups)}${num('slots', t.slots, f?.slots)}</div>
<div class="cset-opt-acts"><button type="submit" class="btn">${esc(t.apply)}</button>${base ? `<button type="button" class="btn ghost" data-cset="base-opt">${esc(t.base)}</button>` : ''}${f ? `<button type="button" class="btn ghost" data-cset="clear-opt">${esc(t.anyOpt)}</button>` : ''}<button type="button" class="btn ghost" data-cset="close">${esc(t.close)}</button></div></form>`;
  };

  const picker = (slot, c, bit) => {
    const q = query.trim().toLowerCase();
    const list = gear.filter((g) => SUBS[slot].includes(g[3]) && (!q || g[1].toLowerCase().includes(q) || g[2].toLowerCase().includes(q)))
      .sort((a, b) => fitsChar(b, c, bit) - fitsChar(a, c, bit) || b[4] - a[4] || (b[8] || 0) - (a[8] || 0)).slice(0, 40);
    return `<div class="cset-pick" data-cset-pick="${slot}"><div class="cset-pick-head"><input type="search" data-cset-q placeholder="${esc(t.search)}" value="${esc(query)}" autocomplete="off" aria-label="${esc(t.search)}">
<button type="button" class="btn ghost" data-cset="close">${esc(t.close)}</button></div>
<ul class="cset-pick-list">${list.length ? list.map((g) => {
      const ok = fitsChar(g, c, bit), p = priceOf(g[0]);
      return `<li><button type="button" data-cset-wear="${g[0]}"${ok ? '' : ' class="is-off"'}>${icon(g[0], 28)}<span><strong>${esc(korean ? g[1] : g[2])}</strong><small>Lv. ${g[4]}${ok ? '' : ` · ${esc(t.cant)}`}</small></span><b${p ? '' : ' class="muted"'}>${esc(p ? mesos(p) : t.noPrice)}</b></button></li>`;
    }).join('') : `<li class="muted">${esc(t.none)}</li>`}</ul></div>`;
  };

  const html = (c, bit) => {
    const set = loadSet(), opts = loadOpts();
    const bySlot = Object.fromEntries(Object.entries(set).map(([slot, id]) => [id, slot]));
    const tot = setTotal(set, (id) => priceIn(bySlot[id], id, opts));
    const blocked = (slot) => (slot === 'bottom' && set.top && subOf(set.top) === 'Overall' ? t.worn
      : slot === 'shield' && set.weapon && TWO_HANDED.has(subOf(set.weapon)) ? t.two : '');
    const rows = SLOTS.map((slot) => {
      const id = set[slot], why = blocked(slot), f = id && opts[slot], p = id && priceIn(slot, id, opts);
      const ol = f ? optLive[optKey(id, f)] : undefined;
      const sub = f ? (ol === null || ol === undefined ? t.optLoading : ol.kind === 'open' ? t.optOpen(ol.n) : ol.kind === 'recent' ? t.optRecent(ol.n) : t.optNone) : '';
      const href = `${market}?item=${id}${f ? `&opts=${encodeURIComponent(encodeOptionFilter(f))}` : ''}&src=char-set`;
      const main = id
        ? `<a class="cset-item" href="${esc(href)}" data-char-link="set" data-item="${id}">${icon(id)}<span><strong>${esc(nameOf(id))}</strong><small>${esc(f ? optText(f) : t.slot[slot])}</small></span></a>
<b class="cset-price${p ? '' : ' muted'}">${esc(p ? mesos(p) : f ? '—' : t.noPrice)}${sub ? `<small>${esc(sub)}</small>` : ''}</b>
<span class="cset-acts"><button type="button" class="btn ghost${f ? ' is-on' : ''}" data-cset-edit="${slot}" aria-expanded="${editing === slot}">${esc(t.opt)}</button><button type="button" class="btn ghost" data-cset-open="${slot}">${esc(t.change)}</button><button type="button" class="btn ghost" data-cset-remove="${slot}" aria-label="${esc(`${t.slot[slot]} ${t.remove}`)}">×</button></span>`
        : `<span class="cset-item is-empty"><i aria-hidden="true">${esc(t.slot[slot].slice(0, 1))}</i><span><strong>${esc(t.slot[slot])}</strong><small>${esc(why || '—')}</small></span></span>
<span class="cset-acts">${why ? '' : `<button type="button" class="btn ghost cset-add" data-cset-open="${slot}" aria-label="${esc(`${t.slot[slot]} ${t.add}`)}">+ ${esc(t.add)}</button>`}</span>`;
      return `<li class="cset-row${open === slot || (editing === slot && id) ? ' is-open' : ''}" data-slot="${slot}">${main}${open === slot ? picker(slot, c, bit) : ''}${editing === slot && id ? editor(slot, f) : ''}</li>`;
    }).join('');
    return `<div class="char-card cset" data-kind="set"><div class="cset-top"><h3>${esc(t.h)}</h3><p class="muted">${esc(t.p)}</p></div>
<div class="cset-grid"><figure class="cset-figure"><img src="${esc(renderUrl(set, subOf))}" alt="${esc(t.h)}" data-cset-img loading="lazy">
<figcaption><span>${esc(t.total)}</span><strong>${tot.n ? esc(mesos(tot.sum)) : '—'}</strong>${tot.missing ? `<small class="muted">${esc(t.missing(tot.missing))}</small>` : ''}<small class="muted">${esc(t.live)}</small>
${tot.n ? `<button type="button" class="cset-reset" data-cset="reset">${esc(t.reset)}</button>` : ''}</figcaption></figure>
<ul class="cset-slots">${rows}</ul></div>${tot.n ? '' : `<p class="muted cset-empty">${esc(t.empty)}</p>`}</div>`;
  };

  // Events on the panel element (delegated once); redraw() rebuilds only the set card.
  const bind = (el, getChar, bitOf) => {
    const redraw = (focusSearch) => {
      const box = el.querySelector('[data-kind="set"]'), c = getChar();
      if (!box || !c) return;
      box.outerHTML = html(c, bitOf(c));
      if (focusSearch) { const q = el.querySelector('[data-cset-q]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
      refreshLive(loadSet(), () => redraw(false));
    };
    el.addEventListener('click', (e) => {
      const o = e.target.closest('[data-cset-open]');
      if (o) { open = open === o.dataset.csetOpen ? null : o.dataset.csetOpen; editing = null; query = ''; redraw(!!open); return; }
      const ed = e.target.closest('[data-cset-edit]');
      if (ed) { editing = editing === ed.dataset.csetEdit ? null : ed.dataset.csetEdit; open = null; redraw(false); if (editing) el.querySelector('.cset-opt input')?.focus(); return; }
      const w = e.target.closest('[data-cset-wear]');
      if (w) {
        const id = Number(w.dataset.csetWear), slot = slotOf(subOf(id)), had = loadSet()[slot];
        const next = wear(loadSet(), id, subOf), o2 = loadOpts();
        for (const k of Object.keys(o2)) if (next[k] !== loadSet()[k]) delete o2[k];
        const base = baseOf(id);
        if (base) o2[slot] = base;
        saveSet(next); saveOpts(o2);
        track('my_char_set', { action: had ? 'change' : 'add', slot, item_id: id });
        open = null; query = ''; editing = baseOf(id) ? slot : null; redraw(false); return;
      }
      const r = e.target.closest('[data-cset-remove]');
      if (r) {
        const set = loadSet(), slot = r.dataset.csetRemove, id = set[slot];
        delete set[slot]; saveSet(set);
        const o2 = loadOpts(); delete o2[slot]; saveOpts(o2); if (editing === slot) editing = null;
        track('my_char_set', { action: 'remove', slot, item_id: id });
        redraw(false); return;
      }
      const b = e.target.closest('[data-cset]');
      if (b?.dataset.cset === 'close') { open = null; editing = null; query = ''; redraw(false); }
      if (b?.dataset.cset === 'reset') { saveSet({}); saveOpts({}); track('my_char_set', { action: 'reset' }); open = null; editing = null; redraw(false); }
      if (b?.dataset.cset === 'base-opt' && editing) {
        const o2 = loadOpts(), base = baseOf(loadSet()[editing]);
        if (base) o2[editing] = base; saveOpts(o2);
        editing = editing; redraw(false); return;
      }
      if (b?.dataset.cset === 'clear-opt' && editing) {
        const o2 = loadOpts(); delete o2[editing]; saveOpts(o2);
        track('my_char_set', { action: 'options_clear', slot: editing, item_id: loadSet()[editing] });
        editing = null; redraw(false);
      }
    });
    el.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-cset-optform]');
      if (!form) return;
      e.preventDefault(); e.stopPropagation();
      const slot = form.dataset.csetOptform, stats = {}, raw = {};
      for (const inp of form.querySelectorAll('input')) {
        if (inp.value === '') continue;
        const v = Math.round(Number(inp.value));
        if (!Number.isFinite(v)) continue;
        if (inp.name.startsWith('s_')) stats[inp.name.slice(2)] = v; else raw[inp.name] = v;
      }
      const f = optionFilter({ stats, ...raw }), o2 = loadOpts();
      if (f) o2[slot] = f; else delete o2[slot];
      saveOpts(o2);
      track('my_char_set', { action: f ? 'options' : 'options_clear', slot, item_id: loadSet()[slot] });
      editing = null; redraw(false);
    }, true);
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-cset-q]')) return;
      query = e.target.value;
      const list = el.querySelector('.cset-pick-list'), c = getChar();
      if (!list || !c || !open) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = picker(open, c, bitOf(c));
      list.replaceWith(tmp.querySelector('.cset-pick-list'));
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (open || editing)) { open = null; editing = null; query = ''; redraw(false); } });
  };

  return {
    setGear(list) { gear = list || []; byId = new Map(gear.map((g) => [g[0], g])); },
    html, bind, refreshLive: (redraw) => refreshLive(loadSet(), redraw)
  };
}
