// Live megaphones. Megaphones are polled from the worker every 5 seconds; each line is sorted into
// selling or buying, its items are matched to our catalogue and compared with the market, and Korean readers get a plain
// reading of the trade shorthand.
import { koMesos, GLOSS, plain, intentOf, priceOf } from './mega-text.js';
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
let focusId = Number(new URLSearchParams(location.search).get('m')) || 0;
let focused = false;
// The header ticker asks for a megaphone that is on this page already: mark it and scroll to it without a reload.
addEventListener('mega-focus', (e) => { focusId = e.detail.id; focused = false; e.preventDefault(); render(); });
let rows = [], lastId = 0, names = [], byName = new Map(), prices = new Map();

// ---------- reading a megaphone ----------
// "[Shoes Speed Scroll: Intermediate]" is an exact item megaphone; otherwise the longest catalogue name in the text.
function itemsOf(text) {
  const found = [];
  const bracket = /\[([^\]]{3,60})\]/.exec(text);
  if (bracket && byName.has(bracket[1].toLowerCase())) found.push(byName.get(bracket[1].toLowerCase()));
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
function card(r) {
  const items = itemsOf(r.text), it = items[0], price = priceOf(r.text), market = it && prices.get(it.id);
  // Far-off differences usually mean a scrolled or bundled item, not a cheap or pricey one, so they are not shown.
  const raw = price && market?.median ? Math.round(((price - market.median) / market.median) * 100) : null;
  const diff = raw != null && Math.abs(raw) <= 300 ? raw : null;
  const text = esc(r.text).replace(/\[([^\]]+)\]/, (m, n) => (it ? `<a class="mg-item" href="${root.dataset.market}?item=${it.id}">[${esc(ko && it.ko ? it.ko : n)}]</a>` : m));
  const g = ko ? gloss(r.text, items) : '';
  const tag = r.intent ? `<span class="mg-intent ${r.intent}">${r.intent === 'sell' ? tr('팝니다', 'Selling') : tr('삽니다', 'Buying')}</span>` : '';
  const cmp = it && market?.median ? `<a class="mg-price" href="${root.dataset.market}?item=${it.id}">${tr('시세', 'Market')} ${mesos(market.median)}${diff != null ? ` · <b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${diff}%</b>` : ''}</a>` : '';
  // One compact row: who and where on the left, the message and its reading in the middle, the whisper copy on the right.
  return `<li class="mg-msg mg-${r.color || 'Y'} mg-k-${r.kind}${r.id === focusId ? ` mg-focus${focused ? '' : ' mg-pulse'}` : ''}" id="m-${r.id}">
<div class="mg-who"><strong class="mg-nick"${r.id === focusId ? ` data-pick="${esc(tr('선택한 고확', 'Selected'))}"` : ''}>${esc(r.nick)}</strong><span class="mg-meta">${r.channel ? `<span class="mg-ch">CH${String(r.channel).padStart(2, '0')}</span>` : ''}<time datetime="${new Date(seenAt(r.seen)).toISOString()}" title="${ago(r.seen)}">${clock(r.seen)}</time></span><span class="mg-kind">${KIND[r.kind]?.() || ''}</span></div>
<div class="mg-body"><p class="mg-text">${tag}${text}</p>${translator && plain(r.text) ? `<p class="mg-ai" data-src="${esc(plain(r.text))}" data-prefix="${esc(itemPrefix(r.text, items))}" hidden></p>` : ''}${g ? `<p class="mg-gloss">${esc(g)}</p>` : ''}${cmp}</div>
<button type="button" class="mg-copy" data-nick="${esc(r.nick)}" title="${esc(tr('귓말 명령어 복사', 'Copy whisper command'))}" aria-label="${esc(tr('귓말 명령어 복사', 'Copy whisper command'))}">${WHISPER}</button></li>`;
}

const haystack = (r) => (r.hay ||= `${r.nick} ${r.text} ${itemsOf(r.text).map((i) => i.ko || '').join(' ')}`.toLowerCase());
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
  $('mg-count').textContent = q || ch ? tr('{n}개 찾음', '{n} found', { n: list.length }) : tr('최근 {n}개', 'Latest {n}', { n: list.length });
  $('mg-empty').hidden = rows.length > 0;
}

async function loadItems() {
  try {
    const list = await fetch(root.dataset.items).then((r) => r.json());
    for (const [id, koName, en] of list) if (en && en.length >= 5) byName.set(en.toLowerCase(), { id, ko: koName, en });
    names = [...byName.keys()].sort((a, b) => b.length - a.length);
  } catch (e) {}
}

async function loadPrices(newRows) {
  const ids = [...new Set(newRows.flatMap((r) => itemsOf(r.text).map((i) => i.id)))].filter((id) => !prices.has(id)).slice(0, 60);
  if (!ids.length) return;
  try { const p = await fetch(`${api}/prices?ids=${ids.join(',')}`).then((r) => r.json()); for (const id of ids) prices.set(id, p[id] || null); } catch (e) {}
}

// New megaphones pushed over the presence socket (assets/common.js) appear at once; polling stays as the fallback.
addEventListener('gms-megaphones', async (e) => {
  const fresh = e.detail.filter((r) => r.id > lastId).map((r) => ({ ...r, intent: intentOf(r.text) }));
  if (!fresh.length) return;
  lastId = Math.max(lastId, ...fresh.map((r) => r.id));
  rows = fresh.sort((a, b) => b.id - a.id).concat(rows).slice(0, 400);
  await loadPrices(fresh).catch(() => null);
  render();
});
async function poll() {
  if (document.hidden) return;
  try {
    const data = await fetch(`${api}/megaphones${lastId ? `?after=${lastId}` : ''}`).then((r) => r.json());
    const fresh = (data.rows || []).map((r) => ({ ...r, intent: intentOf(r.text) }));
    if (fresh.length) {
      lastId = Math.max(lastId, ...fresh.map((r) => r.id));
      rows = fresh.concat(rows).slice(0, 400);
      await loadPrices(fresh);
    }
    render();
  } catch (e) {}
}

$('mg-search').addEventListener('input', render);
$('mg-feed').addEventListener('click', async (e) => {
  const b = e.target.closest('.mg-copy');
  if (!b) return;
  try { await navigator.clipboard.writeText(`/w ${b.dataset.nick} `); b.innerHTML = `<span>${tr('복사됨', 'Copied')}</span>`; setTimeout(() => (b.innerHTML = WHISPER), 1200); } catch (x) {}
  track('mega_whisper_copy');
});

loadItems().then(() => { poll(); setInterval(poll, POLL_MS); setupAi(); });
setInterval(() => document.querySelectorAll('#mg-feed time').length && render(), 30000);
