// Live megaphones. Megaphones are polled from the worker every 5 seconds; each line is sorted into
// selling or buying, its items are matched to our catalogue and compared with the market, and Korean readers get a plain
// reading of the trade shorthand.
import { koMesos, GLOSS, plain, intentOf, priceOf } from './mega-text.js';
import { optBadge, loadTips as loadOptTips } from './opt-grade.js';
import { optionParts } from './mega-option-text.js';
import { marketSharePath } from './market-share.js';
import { indexEntry, searchEntries } from './search-index.js';
export { intentOf, priceOf };

const root = document.getElementById('mg-page');
const ko = document.documentElement.lang === 'ko';
const lang = document.documentElement.lang;
const api = document.body.dataset.priceApi;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (k, e, vars = {}) => (ko ? k : tx(e, vars)).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
// New megaphones arrive pushed over the presence socket; this poll is the fallback (and the catch-up after a hidden tab).
const POLL_MS = 30000;

// ?m=<id> (from the header ticker) scrolls to that megaphone once and marks it.
// ?f=<id> does the same for a 무료 고확 (site post), whose ids are kept as 'f<id>'.
const qs = new URLSearchParams(location.search);
let focusId = Number(qs.get('f')) ? `f${Number(qs.get('f'))}` : Number(qs.get('m')) || 0;
let focused = false;
// The header ticker asks for a megaphone that is on this page already: mark it and scroll to it without a reload.
addEventListener('mega-focus', (e) => { focusId = e.detail.id; focused = false; e.preventDefault(); render(); });
let rows = [], lastId = 0, lastFree = 0, names = [], byName = new Map(), byId = new Map(), prices = new Map();
// Which lines to show: source (all, free = site posts, game) and intent (all, sell, buy).
const view = { src: 'all', intent: 'all' };

// ---------- reading a megaphone ----------
// "[Shoes Speed Scroll: Intermediate]" is an exact item megaphone; otherwise the longest catalogue name in the text.
// Show the linked piece's actual stats, remaining enhancements and upgrade grade under its message.
function optLine(r, it) {
  const b = it && (r.opts?.ups > 0 || r.opts?.clean === true || r.opts?.used === 0) && optBadge(it.id, r.opts);
  const parts = optionParts(r.opts, ko);
  return b || parts.length ? `<p class="mb-opts mg-opts">${b ? `<span class="mb-opt grade ${b.cls}">${esc(b.text)}</span>` : ''}${parts.map((t) => `<span class="mb-opt">${esc(t)}</span>`).join('')}</p>` : '';
}
function itemsOf(text) {
  const found = [];
  const bracket = /\[([^\]]{3,60})\]/.exec(text);
  if (bracket) return byName.has(bracket[1].toLowerCase()) ? [byName.get(bracket[1].toLowerCase())] : [];
  if (!found.length) {
    const low = text.toLowerCase();
    const hit = names.find((n) => low.includes(n));
    if (hit) found.push(byName.get(hit));
  }
  return found;
}
const mesos = (n) => (ko ? koMesos(n) : n >= 1e9 ? `${+(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));

// ---------- AI translation (Chrome's built-in, on-device Translator API) ----------
// Trade shorthand is spelled out first so the model sees plain English, and known item names are swapped for this
// language's names (Korean) or kept as the game's English names. Translations are cached per text for the session.
const itemPrefix = (text, items) => {
  const b = /^\s*\[([^\]]*)\]/.exec(text);
  if (!b) return '';
  const it = items[0];
  return `[${it && it.en.toLowerCase() === b[1].toLowerCase() && ko && it.ko ? it.ko : b[1]}] `;
};
const AI_LANG = { ko: 'ko', zh: 'zh', ja: 'ja' }[lang];
let translator = null, aiState = 'off';
const aiCache = new Map();
async function setupAi() {
  if (!AI_LANG || !('Translator' in self)) return;
  try {
    const avail = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: AI_LANG });
    if (avail === 'unavailable') return;
    // There is no button: the translator is used only when its model is already on the device (a download needs a
    // user gesture, and the page shows the plain Korean reading of the trade shorthand without it).
    if (avail !== 'available') return;
    translator = await self.Translator.create({ sourceLanguage: 'en', targetLanguage: AI_LANG });
    aiState = 'on'; render();
    track('mega_ai_translate', { lang: AI_LANG });
  } catch (e) { aiState = 'off'; }
}
async function aiTranslate(text) {
  if (aiCache.has(text)) return aiCache.get(text);
  const p = translator.translate(text).catch(() => '');
  aiCache.set(text, p);
  return p;
}
// Fill the translation line of each card on screen, newest first.
async function fillAi() {
  if (!translator) return;
  for (const el of document.querySelectorAll('#mg-feed .mg-ai:not([data-done])')) {
    el.dataset.done = '1';
    const out = await aiTranslate(el.dataset.src);
    if (out) { el.textContent = (el.dataset.prefix || '') + out; el.hidden = false; el.closest('.mg-msg')?.querySelector('.mg-gloss')?.setAttribute('hidden', ''); }
  }
}

function gloss(text, items) {
  let out = text;
  for (const it of items) if (it.ko) out = out.split(new RegExp(it.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join(it.ko);
  for (const [re, to] of GLOSS) out = out.replace(re, to);
  return out === text ? '' : out;
}

const seenAt = (seen) => Date.parse(`${seen.replace(' ', 'T')}Z`);
const clock = (seen) => new Date(seenAt(seen)).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

// The whisper button copies "/w <nick> " for pasting into the game's chat.
const WHISPER = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5V11H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><span>${tr('귓속말', 'Whisper')}</span>`;

function ago(seen) {
  const s = Math.max(0, (Date.now() - seenAt(seen)) / 1000);
  const f = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  return s < 60 ? f.format(0, 'second') : s < 3600 ? f.format(-Math.floor(s / 60), 'minute') : f.format(-Math.floor(s / 3600), 'hour');
}

const KIND = { super: () => tr('고확', 'Super'), item: () => tr('아이템 고확', 'Item'), double: () => tr('더블 아이템 고확', 'Double item'), mega: () => tr('확성기', 'Megaphone') };
// A 무료 고확 arrives structured (intent, item id, price, a short line); the page keeps it in the same shape as a game
// megaphone: id 'f<id>', kind 'free', colour band F.
const freeRow = (r) => ({ id: `f${r.id}`, fid: r.id, free: true, kind: 'free', color: 'F', seen: r.at, nick: r.nick, channel: r.channel,
  intent: r.intent === 'talk' ? null : r.intent, talk: r.intent === 'talk', item: r.item, price: r.price, text: r.text || '' });
const atOf = (r) => seenAt(r.seen);
const bySeen = (a, b) => atOf(b) - atOf(a);
function myKeys() { try { return JSON.parse(localStorage.getItem('gms-free-keys') || '{}'); } catch (e) { return {}; } }
function freeCard(r) {
  const it = r.item ? byId.get(r.item) : null, market = it && prices.get(it.id);
  const raw = r.price && market?.median ? Math.round(((r.price - market.median) / market.median) * 100) : null;
  const diff = raw != null && Math.abs(raw) <= 300 ? raw : null;
  const tag = r.intent ? `<span class="mg-intent ${r.intent}">${r.intent === 'sell' ? tr('팝니다', 'Selling') : tr('삽니다', 'Buying')}</span>` : '';
  const name = it ? `<a class="mg-item" href="${root.dataset.market}?item=${it.id}">[${esc(ko && it.ko ? it.ko : it.en)}]</a> ` : '';
  const cost = r.price ? `<b class="fm-price">${esc(mesos(r.price))}</b> ` : '';
  const cmp = it && market?.median ? `<a class="mg-price" href="${root.dataset.market}?item=${it.id}">${tr('시세', 'Market')} ${mesos(market.median)}${diff != null ? ` · <b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${diff}%</b>` : ''}</a>` : '';
  const mine = myKeys()[r.fid];
  const act = mine ? `<button type="button" class="fm-act" data-del="${r.fid}">${tr('내 글 지우기', 'Delete mine')}</button>` : `<button type="button" class="fm-act" data-report="${r.fid}">${tr('신고', 'Report')}</button>`;
  return `<li class="mg-msg mg-F mg-k-free${r.id === focusId ? ` mg-focus${focused ? '' : ' mg-pulse'}` : ''}" id="m-${esc(r.id)}">
<div class="mg-who"><strong class="mg-nick"${r.id === focusId ? ` data-pick="${esc(tr('선택한 고확', 'Selected'))}"` : ''}>${esc(r.nick)}</strong><span class="mg-meta">${Number(r.channel) ? `<span class="mg-ch">CH${String(Number(r.channel)).padStart(2, '0')}</span>` : ''}<time datetime="${new Date(atOf(r)).toISOString()}" title="${ago(r.seen)}">${clock(r.seen)}</time></span><span class="mg-kind">${tr('무료 고확', 'Free mega')}</span></div>
<div class="mg-body"><p class="mg-text">${tag}${name}${cost}${esc(r.text)}</p>${cmp}${act}</div>
<button type="button" class="mg-copy" data-nick="${esc(r.nick)}" title="${esc(tr('귓말 명령어 복사', 'Copy whisper command'))}" aria-label="${esc(tr('귓말 명령어 복사', 'Copy whisper command'))}">${WHISPER}</button></li>`;
}
function card(r) {
  if (r.free) return freeCard(r);
  const items = itemsOf(r.text), it = items[0], price = priceOf(r.text), market = it && prices.get(it.id);
  // Far-off differences usually mean a scrolled or bundled item, not a cheap or pricey one, so they are not shown.
  const raw = price && market?.median ? Math.round(((price - market.median) / market.median) * 100) : null;
  const diff = raw != null && Math.abs(raw) <= 300 ? raw : null;
  const itemHref = it && marketSharePath({marketPath:root.dataset.market,id:it.id,opts:r.opts});
  const text = esc(r.text).replace(/\[([^\]]+)\]/, (m, n) => (it ? `<a class="mg-item" href="${esc(itemHref)}"${r.opts ? ` data-item-id="${it.id}" data-opts="${esc(JSON.stringify(r.opts))}"` : ''}>[${esc(ko && it.ko ? it.ko : n)}]</a>` : m));
  const g = ko ? gloss(r.text, items) : '';
  const tag = r.intent ? `<span class="mg-intent ${r.intent}">${r.intent === 'sell' ? tr('팝니다', 'Selling') : tr('삽니다', 'Buying')}</span>` : '';
  const cmp = it && market?.median ? `<a class="mg-price" href="${esc(itemHref)}">${tr('시세', 'Market')} ${mesos(market.median)}${diff != null ? ` · <b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${diff}%</b>` : ''}</a>` : '';
  // One compact row: who and where on the left, the message and its reading in the middle, the whisper copy on the right.
  return `<li class="mg-msg mg-${esc(r.color || 'Y')} mg-k-${esc(r.kind)}${r.id === focusId ? ` mg-focus${focused ? '' : ' mg-pulse'}` : ''}" id="m-${esc(r.id)}">
<div class="mg-who"><strong class="mg-nick"${r.id === focusId ? ` data-pick="${esc(tr('선택한 고확', 'Selected'))}"` : ''}>${esc(r.nick)}</strong><span class="mg-meta">${Number(r.channel) ? `<span class="mg-ch">CH${String(Number(r.channel)).padStart(2, '0')}</span>` : ''}<time datetime="${new Date(seenAt(r.seen)).toISOString()}" title="${ago(r.seen)}">${clock(r.seen)}</time></span><span class="mg-kind">${KIND[r.kind]?.() || ''}</span></div>
<div class="mg-body"><p class="mg-text">${tag}${text}</p>${optLine(r, it)}${translator && plain(r.text) ? `<p class="mg-ai" data-src="${esc(plain(r.text))}" data-prefix="${esc(itemPrefix(r.text, items))}" hidden></p>` : ''}${g ? `<p class="mg-gloss">${esc(g)}</p>` : ''}${cmp}</div>
<button type="button" class="mg-copy" data-nick="${esc(r.nick)}" title="${esc(tr('귓말 명령어 복사', 'Copy whisper command'))}" aria-label="${esc(tr('귓말 명령어 복사', 'Copy whisper command'))}">${WHISPER}</button></li>`;
}

const haystack = (r) => (r.hay ||= (r.free ? `${r.nick} ${r.text} ${byId.get(r.item)?.ko || ''} ${byId.get(r.item)?.en || ''}` : `${r.nick} ${r.text} ${itemsOf(r.text).map((i) => i.ko || '').join(' ')}`).toLowerCase());
const shown = (r) => (view.src === 'all' || (view.src === 'free') === !!r.free) && (view.intent === 'all' || r.intent === view.intent);
const filtering = () => view.src !== 'all' || view.intent !== 'all' || $('mg-search').value.trim();
// Mark search words in the text (not inside links or buttons' attributes).
function highlight(feed, words) {
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  for (const el of feed.querySelectorAll('.mg-text, .mg-gloss, .mg-nick')) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      if (!re.test(n.data)) continue;
      re.lastIndex = 0;
      const span = document.createElement('span');
      span.innerHTML = esc(n.data).replace(re, '<mark>$1</mark>');
      n.replaceWith(...span.childNodes);
    }
  }
}

function render() {
  // No filter row any more: only the search box, and repeats of the same line are always folded.
  const ch = 0, q = $('mg-search').value.trim().toLowerCase(), once = true;
  const seen = new Set();
  const list = rows.filter((r) => {
    if (ch && r.channel !== ch) return false;
    if (!shown(r)) return false;
    // Search covers the nick, the text, and the Korean names of the items it mentions, every word anywhere.
    if (q && !q.split(/\s+/).every((w) => haystack(r).includes(w))) return false;
    if (r.id === focusId) return true;
    if (once) { const k = `${r.nick}|${r.text.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); }
    return true;
  });
  const feed = $('mg-feed');
  // Keep the reader's place: if they have scrolled down into older megaphones, new ones arriving at the top don't move them.
  const fromBottom = feed.scrollHeight - feed.scrollTop;
  feed.innerHTML = list.slice(0, 300).map(card).join('');
  if (feed.scrollTop > 0) feed.scrollTop = feed.scrollHeight - fromBottom;
  if (q) highlight(feed, q.split(/\s+/));
  const target = focusId && !focused && document.getElementById(`m-${focusId}`);
  if (target) {
    target.scrollIntoView({ block: 'center' });
    target.querySelector('.mg-copy')?.focus({ preventScroll: true });
    focused = true;
  }
  fillAi();
  $('mg-count').textContent = q || ch || filtering() ? tr('{n}개 찾음', '{n} found', { n: list.length }) : tr('최근 {n}개', 'Latest {n}', { n: list.length });
  $('mg-empty').hidden = rows.length > 0;
}

async function loadItems() {
  try {
    const list = await fetch(root.dataset.items).then((r) => r.json());
    for (const [id, koName, en] of list) {
      if (en) byId.set(id, { id, ko: koName, en });
      if (en && en.length >= 5) byName.set(en.toLowerCase(), { id, ko: koName, en });
    }
    names = [...byName.keys()].sort((a, b) => b.length - a.length);
  } catch (e) {}
}

async function loadPrices(newRows) {
  if (newRows.some((r) => r.opts)) await loadOptTips();
  const ids = [...new Set(newRows.flatMap((r) => (r.free ? (r.item ? [r.item] : []) : itemsOf(r.text).map((i) => i.id))))].filter((id) => !prices.has(id)).slice(0, 60);
  if (!ids.length) return;
  try { const p = await fetch(`${api}/prices?ids=${ids.join(',')}`).then((r) => r.json()); for (const id of ids) prices.set(id, p[id] || null); } catch (e) {}
}

// New megaphones pushed over the presence socket (assets/common.js) appear at once; polling stays as the fallback.
addEventListener('gms-megaphones', async (e) => {
  const fresh = e.detail.filter((r) => r.id > lastId).map((r) => ({ ...r, intent: intentOf(r.text) })).sort((a, b) => b.id - a.id);
  if (!fresh.length) return;
  lastId = Math.max(lastId, ...fresh.map((r) => r.id));
  const seen = new Set(rows.map((r) => `${r.nick}|${r.text.toLowerCase()}`));
  rows = fresh.concat(rows).sort(bySeen).slice(0, 400);
  await loadPrices(fresh).catch(() => null);
  // With a search or filter open the filtered list is redrawn; otherwise the new cards slide in at the top and the rest
  // stay put (a reader scrolled down keeps their place).
  if (filtering()) return render();
  const feed = $('mg-feed');
  const cards = fresh.filter((r) => !seen.has(`${r.nick}|${r.text.toLowerCase()}`)).map((r) => card(r).replace('class="mg-msg ', 'class="mg-msg mg-new ')).join('');
  if (!cards) return;
  const h0 = feed.scrollHeight, top = feed.scrollTop;
  feed.insertAdjacentHTML('afterbegin', cards);
  if (top > 0) feed.scrollTop = top + (feed.scrollHeight - h0);
  while (feed.children.length > 300) feed.lastElementChild.remove();
  fillAi();
  $('mg-count').textContent = tr('최근 {n}개', 'Latest {n}', { n: feed.children.length });
  $('mg-empty').hidden = true;
});
async function poll() {
  if (document.hidden) return;
  try {
    const data = await fetch(`${api}/megaphones${lastId ? `?after=${lastId}` : ''}`).then((r) => r.json());
    const fresh = (data.rows || []).map((r) => ({ ...r, intent: intentOf(r.text) }));
    if (fresh.length) {
      lastId = Math.max(lastId, ...fresh.map((r) => r.id));
      rows = fresh.concat(rows).sort(bySeen).slice(0, 400);
      await loadPrices(fresh);
      render();
    } else if (!rows.length) render();
  } catch (e) {}
  await pollFree();
}

// ---------- 무료 고확 ----------
// Site posts come over the same socket ('gms-free'); this poll is their fallback too.
function addFree(list, slide) {
  const fresh = list.filter((r) => r.id > lastFree && !rows.some((x) => x.fid === r.id)).map(freeRow);
  if (!fresh.length) return false;
  lastFree = Math.max(lastFree, ...fresh.map((r) => r.fid));
  rows = fresh.concat(rows).sort(bySeen).slice(0, 400);
  loadPrices(fresh).catch(() => null).then(() => {
    if (!slide || filtering()) return render();
    const feed = $('mg-feed');
    feed.insertAdjacentHTML('afterbegin', fresh.map((r) => card(r).replace('class="mg-msg ', 'class="mg-msg mg-new ')).join(''));
    $('mg-empty').hidden = true;
  });
  return true;
}
async function pollFree() {
  try {
    const data = await fetch(`${api}/free-megas${lastFree ? `?after=${lastFree}` : ''}`).then((r) => r.json());
    if (addFree(data.rows || [], false)) render();
  } catch (e) {}
}
addEventListener('gms-free', (e) => addFree(e.detail, true));
addEventListener('gms-free-gone', (e) => { const before = rows.length; rows = rows.filter((r) => r.fid !== e.detail); if (rows.length !== before) render(); });

$('mg-search').addEventListener('input', render);
$('mg-feed').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]'), rep = e.target.closest('[data-report]');
  if (del || rep) {
    const id = Number((del || rep).dataset.del || (del || rep).dataset.report);
    const btn = del || rep;
    btn.disabled = true;
    try {
      if (del) {
        const keys = myKeys();
        const r = await fetch(`${api}/free-megas?id=${id}&key=${encodeURIComponent(keys[id] || '')}`, { method: 'DELETE' });
        if (r.ok || r.status === 404) { delete keys[id]; try { localStorage.setItem('gms-free-keys', JSON.stringify(keys)); } catch (x) {} rows = rows.filter((x) => x.fid !== id); render(); track('free_mega_delete'); }
      } else {
        await fetch(`${api}/free-megas/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        btn.textContent = tr('신고했어요', 'Reported');
        track('free_mega_report');
      }
    } catch (x) { btn.disabled = false; }
    return;
  }
  const b = e.target.closest('.mg-copy');
  if (!b) return;
  try { await navigator.clipboard.writeText(`/w ${b.dataset.nick} `); b.innerHTML = `<span>${tr('복사됨', 'Copied')}</span>`; setTimeout(() => (b.innerHTML = WHISPER), 1200); } catch (x) {}
  track('mega_whisper_copy');
});

loadItems().then(() => { poll(); setInterval(poll, POLL_MS); setupAi(); });
// The "n minutes ago" tooltips tick over in place; the list itself is only redrawn when its contents change.
setInterval(() => { for (const t of document.querySelectorAll('#mg-feed time')) { const r = rows.find((x) => `m-${x.id}` === t.closest('.mg-msg')?.id); if (r) t.title = ago(r.seen); } }, 30000);

// ---------- filters: source and intent chips ----------
document.querySelectorAll('[data-mg-view]').forEach((group) => group.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  view[group.dataset.mgView] = b.dataset.v;
  for (const x of group.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  render();
  track('mega_filter', { [group.dataset.mgView]: b.dataset.v });
}));

// ---------- the 무료 고확 composer ----------
// One slim chat-like bar: 내 닉네임, 팝니다 / 삽니다 / 한마디, one line of text, the channel, 쏘기.
// In the one line, typing an item (장공, initials, English) opens the item list; picking one puts "[name] " at the front.
// A price written anywhere in the line (180만, 1.5억, 3m) is read out of it, so the post still gets a market comparison.
(() => {
  const form = $('fm-form');
  if (!form) return;
  const NICK_KEY = 'gms-free-nick', CH_KEY = 'gms-free-ch';
  const f = { text: $('fm-text'), nick: $('fm-nick'), ch: $('fm-ch'), list: $('fm-suggest'), status: $('fm-status'), send: $('fm-send') };
  let intent = 'sell', picked = null, pick = -1, options = [];
  try { f.nick.value = localStorage.getItem(NICK_KEY) || ''; f.ch.value = localStorage.getItem(CH_KEY) || ''; } catch (e) {}
  const PH = {
    sell: () => tr('예: 장공 180만 급처', 'e.g. gloves att 1.8m'),
    buy: () => tr('예: 일비 30만에 구해요', 'e.g. ilbi 300k'),
    talk: () => tr('하고 싶은 말 (예: 장공 시세 왜 이래요?)', 'Say something (e.g. who is buying gloves?)'),
  };
  const setIntent = (v) => {
    intent = v;
    for (const b of form.querySelectorAll('button[data-intent]')) b.setAttribute('aria-pressed', String(b.dataset.intent === v));
    f.text.placeholder = PH[v]();
    if (v === 'talk') close();
  };
  setIntent('sell');
  form.addEventListener('click', (e) => { const b = e.target.closest('button[data-intent]'); if (b) { setIntent(b.dataset.intent); f.text.focus(); } });

  // Item search: the site search's matching (Korean shorthand, initials, English names); at most 8.
  let entries = null;
  const matches = (q) => {
    if (!q.trim()) return [];
    entries ||= [...byId.values()].map((it) => indexEntry({ type: 'item', id: it.id, names: [it.ko, it.en] }));
    return searchEntries(entries, q).slice(0, 8).map((e) => byId.get(e.id)).filter(Boolean);
  };
  const label = (it) => (ko && it.ko ? it.ko : it.en);
  const PRICE = /(\d+(?:[.,]\d+)?\s*(?:억(?:\s*\d+(?:\.\d+)?\s*천?\s*만?)?|천\s*만|만|k|m|b)(?![a-z]))/i;
  // What the item search sees: the line before any price or note, without a picked item.
  const query = () => (picked ? '' : f.text.value.split(PRICE)[0].trim());
  function close() { f.list.hidden = true; f.text.setAttribute('aria-expanded', 'false'); f.text.removeAttribute('aria-activedescendant'); pick = -1; }
  const draw = () => {
    f.list.innerHTML = options.map((it, i) => `<li role="option" id="fm-opt-${i}" data-i="${i}" aria-selected="${i === pick}">${esc(label(it))}${ko && it.ko && it.ko !== it.en ? ` <small>${esc(it.en)}</small>` : ''}</li>`).join('');
    f.list.hidden = !options.length;
    f.text.setAttribute('aria-expanded', String(!!options.length));
    if (pick >= 0) f.text.setAttribute('aria-activedescendant', `fm-opt-${pick}`); else f.text.removeAttribute('aria-activedescendant');
  };
  const choose = async (it) => {
    picked = it;
    const rest = f.text.value.slice(f.text.value.split(PRICE)[0].length).trim();
    f.text.value = `[${label(it)}] ${rest}`;
    close();
    f.text.focus();
    f.text.setSelectionRange(f.text.value.length, f.text.value.length);
    await loadPrices([{ free: true, item: it.id }]).catch(() => null);
    const m = prices.get(it.id);
    f.status.textContent = m?.median ? tr('지금 시세 {p}. 가격도 같이 적어 주세요.', 'Market price {p}. Add your price too.', { p: mesos(m.median) }) : '';
  };
  f.text.addEventListener('input', () => {
    // Removing the [item] part forgets the picked item.
    if (picked && !f.text.value.includes(`[${label(picked)}]`)) picked = null;
    if (intent === 'talk' || picked) { close(); return; }
    options = query().length >= 1 ? matches(query()) : [];
    pick = -1;
    draw();
  });
  f.text.addEventListener('keydown', (e) => {
    if (f.list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick = (pick + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length; draw(); }
    else if (e.key === 'Enter' && options.length) { e.preventDefault(); choose(options[Math.max(0, pick)]); }
    else if (e.key === 'Escape') close();
  });
  f.list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(options[Number(li.dataset.i)]); } });
  f.text.addEventListener('blur', () => setTimeout(close, 120));

  const ERR = {
    nick: () => tr('내 닉네임에 귓말 받을 이름을 2~20자로 넣어 주세요. @와 링크는 안 돼요.', 'Enter the name to whisper (2 to 20 characters, no @ or links).'),
    item: () => tr('아이템을 목록에서 다시 골라 주세요.', 'Pick the item from the list again.'),
    price: () => tr('가격은 180만, 1.5억, 3m처럼 써 주세요.', 'Write the price like 3m, 500k or 1.5b.'),
    length: () => tr('80자까지 쓸 수 있어요.', 'Keep it to 80 characters.'),
    link: () => tr('링크는 올릴 수 없어요.', 'Links are not allowed.'),
    rmt: () => tr('현금 거래나 연락처는 올릴 수 없어요. 메소 가격은 180만처럼 써 주세요.', 'No real-money trades or contact handles.'),
    empty: () => tr('아이템을 고르거나 한마디를 써 주세요.', 'Pick an item or write a few words.'),
    channel: () => tr('채널은 1~40 사이예요.', 'Channels are 1 to 40.'),
    slow: () => tr('무료 고확은 2분에 한 번 쏠 수 있어요. 조금만 기다려 주세요.', 'One free megaphone every 2 minutes. Please wait a moment.'),
    daily: () => tr('무료 고확은 하루 10번까지예요. 내일 다시 쏴 주세요.', 'Up to 10 free megaphones a day. Try again tomorrow.'),
    paused: () => tr('지금은 잠시 쉬는 중이에요. 잠시 뒤 다시 시도해 주세요.', 'Taking a short break. Please try again soon.'),
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    close();
    { const n = f.nick.value.replace(/\s+/g, ' ').trim(); if (n.length < 2 || n.length > 20 || /[@<>`]/.test(n)) { f.status.textContent = ERR.nick(); f.nick.focus(); return; } }
    // Split the line: the picked [item], the first price, and the rest as the note.
    let line = f.text.value.trim(), item = null, price = null;
    if (intent !== 'talk') {
      if (picked && line.includes(`[${label(picked)}]`)) { item = picked.id; line = line.replace(`[${label(picked)}]`, ' '); }
      const m = PRICE.exec(line);
      if (m) { price = m[1].replace(/\s+/g, ''); line = line.replace(m[1], ' '); }
      if (!item && line.trim()) { const hit = matches(line.split(PRICE)[0])[0]; if (hit && line.trim() === label(hit)) { item = hit.id; line = ''; } }
    }
    const body = { nick: f.nick.value.trim(), intent, item, price, text: line.replace(/\s+/g, ' ').trim(), channel: f.ch.value ? Number(f.ch.value) : null };
    f.send.disabled = true;
    f.status.textContent = '';
    try {
      const r = await fetch(`${api}/free-megas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.row) { f.status.textContent = (ERR[out.error] || (() => (r.status === 503 ? ERR.paused() : tr('올리지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'Could not post. Please try again.'))))(); return; }
      const keys = myKeys(); keys[out.row.id] = out.key;
      try { localStorage.setItem('gms-free-keys', JSON.stringify(Object.fromEntries(Object.entries(keys).slice(-30)))); localStorage.setItem(NICK_KEY, body.nick); localStorage.setItem(CH_KEY, f.ch.value); } catch (x) {}
      addFree([out.row], true);
      dispatchEvent(new CustomEvent('gms-free', { detail: [out.row] }));
      f.text.value = ''; picked = null;
      f.status.textContent = tr('무료 고확을 쐈어요! 이제 모두에게 보여요.', 'Sent! Everyone can see it now.');
      track('free_mega_post', { intent, item: body.item ? 1 : 0, price: body.price ? 1 : 0 });
    } catch (x) {
      f.status.textContent = tr('올리지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'Could not post. Please try again.');
    } finally { f.send.disabled = false; }
  });
})();
