// Shared by the two 거래 tools (assets/sell.js, assets/scroll-profit.js): money text, item icons and the item picker.
import { matchingIds } from './market-catalog.js';
import { parseMesos } from './trade-math.js';

export const ko = document.documentElement.lang === 'ko';
export const tr = (k, e) => (ko ? k : e);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const nf = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US');
export const icon = (id, size = 32) => `<img src="https://maplestory.io/api/MCW/1.2/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy">`;
const trim = (n, d) => n.toFixed(d).replace(/\.?0+$/, '');
// Short money the way players write it: 1.45억, 145만, 1.4만, 8,800 (English: 145m, 1.45m, 14.4k).
export function money(n) {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (ko) return sign + (a >= 1e8 ? `${trim(a / 1e8, 2)}억` : a >= 1e6 ? `${nf.format(Math.round(a / 1e4))}만` : a >= 1e4 ? `${trim(a / 1e4, 1)}만` : nf.format(Math.round(a)));
  return sign + (a >= 1e9 ? `${trim(a / 1e9, 2)}b` : a >= 1e6 ? `${trim(a / 1e6, 2)}m` : a >= 1e4 ? `${trim(a / 1e3, 1)}k` : nf.format(Math.round(a)));
}
export const mesos = (n) => (n == null ? '–' : `${nf.format(Math.round(n))} ${tr('메소', 'mesos')}`);
// 0.4 -> "40%", 0.078 -> "7.8%", 0.0002 -> "0.02%".
export function pct(x) {
  const v = x * 100;
  if (v <= 0) return '0%';
  if (v >= 99.95) return '100%';
  return `${v >= 10 ? Math.round(v) : v >= 1 ? trim(v, 1) : v >= 0.01 ? trim(v, 2) : '<0.01'}%`;
}
// Ten blocks, some filled: a share you can count.
export const pips = (rate, cls = '') => `<span class="trd-pips ${cls}" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < Math.round(rate * 10) ? ' class="on"' : ''}></i>`).join('')}</span>`;
export const track = (name, p) => window.track?.(name, p);
export const getJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${r.status}`);
  return r.json();
};

// A money box: shows "1,450,000", reads "145만", "1.45m" and the like, tells `onChange(n | null)` on every edit.
export function moneyInput(el, onChange) {
  const read = () => parseMesos(el.value);
  el.addEventListener('input', () => { const n = read(); el.classList.toggle('bad', el.value.trim() !== '' && n == null); onChange(n); });
  el.addEventListener('blur', () => { const n = read(); if (n != null) el.value = nf.format(n); });
  el.addEventListener('focus', () => el.select());
  return { set: (n) => { el.value = n == null ? '' : nf.format(Math.round(n)); el.classList.remove('bad'); }, get: read };
}

// The item picker: type a name, pick from the list (mouse, touch, arrows + Enter). `index` is the market search index
// (market-catalog.js), `allow(it)` keeps the items this tool can work with, `note(it)` is the small text on the right.
// `first(it)` lifts the items it is true for to the top (items with listings before items without).
export function picker({ input, list, index, allow, note, onPick, first, max = 8 }) {
  let rows = [], at = -1;
  const byId = new Map(index.map((it) => [it.id, it]));
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); at = -1; };
  const mark = () => {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === at ? 'true' : 'false'));
    if (at >= 0) { input.setAttribute('aria-activedescendant', list.children[at].id); list.children[at].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };
  const draw = () => {
    const q = input.value.trim();
    if (!q) return close();
    const hits = (matchingIds(index, q) || []).map((id) => byId.get(id)).filter((it) => it && allow(it));
    rows = (first ? [...hits.filter(first), ...hits.filter((it) => !first(it))] : hits).slice(0, max);
    list.innerHTML = rows.length
      ? rows.map((it, i) => `<li id="${list.id}-${i}" role="option" data-id="${it.id}" aria-selected="false">${icon(it.id, 28)}<span class="trd-opt-name">${esc(it.name)}</span><span class="trd-opt-note">${esc(note(it) || '')}</span></li>`).join('')
      : `<li class="trd-opt-none" role="option" aria-disabled="true">${tr('맞는 아이템이 없어요. 이름을 조금만 적어 보세요.', 'Nothing matches. Try part of the name.')}</li>`;
    at = rows.length ? 0 : -1;
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    mark();
  };
  const pick = (it) => { input.value = it.name; close(); onPick(it); };
  input.addEventListener('input', draw);
  input.addEventListener('focus', () => { if (input.value.trim()) draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden) return draw();
      if (!rows.length) return;
      e.preventDefault();
      at = (at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length; mark();
    } else if (e.key === 'Enter') { if (!list.hidden && rows[at]) { e.preventDefault(); pick(rows[at]); } } else if (e.key === 'Escape') close();
  });
  // pointerdown, so the pick lands before the input loses focus.
  list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-id]'); if (li) { e.preventDefault(); pick(byId.get(Number(li.dataset.id))); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
  return { close };
}
