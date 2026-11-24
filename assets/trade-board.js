// /trade/: the buy and sell board. The composer picks an item, sets a price with a slider around the market price
// (and says how dear it is), and posts a 무료 고확 (worker/src/free-mega.js); the board lists the buy and sell posts
// of the last 24 hours. Posts made on the megaphone page show here and the other way round.
import { makeMarketIndex } from './market-catalog.js';
import { uniqueListings, sellCurve, bandAt, sellAdvice, rankAmong, medianPrice } from './trade-math.js';
import { ko, tr, esc, nf, icon, money, mesos, pct, pips, track, getJson, moneyInput, picker, priceSlider, versus, ago } from './trade-ui.js';

const root = document.getElementById('tb-page');
const $ = (id) => document.getElementById(id);
const api = root.dataset.api;
const NICK_KEY = 'gms-free-nick', CH_KEY = 'gms-free-ch', KEYS = 'gms-free-keys';
const myKeys = () => { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch { return {}; } };

let byId = new Map(), summary = new Map(), refs = new Map();
let intent = 'sell', item = null, price = null, list = [], open = [], curve = [], ref = null, priceBox, slide;
let posts = [], lastId = 0, filter = 'all';

// ---------- the composer ----------
const tone = (rate) => (rate >= 0.5 ? 'good' : rate >= 0.2 ? 'mid' : 'bad');
function drawMeter() {
  const box = $('tb-meter');
  if (!item) { box.innerHTML = `<p class="muted">${tr('아이템을 고르면 시세보다 얼마나 비싼지 나와요.', 'Pick an item to see how it stands against the market.')}</p>`; return; }
  if (!ref) { box.innerHTML = `<p class="trd-big-line">${tr('시세 기록이 없어요', 'No market price yet')}</p><p>${tr('최근 7일 동안 올라온 매물이 없어요. 내가 받고 싶은 값을 적으세요.', 'Nothing was listed in the last 7 days. Type the price you want.')}</p>`; return; }
  if (!price) { box.innerHTML = `<p class="trd-big-line">${tr('값을 적거나 막대를 미세요', 'Type a price or move the slider')}</p><p>${tr(`시세는 ${money(ref)} 메소예요.`, `The market price is ${money(ref)} mesos.`)}</p>`; return; }
  const v = versus(price, ref);
  // Selling dear is the risk; buying cheap is the risk.
  const risk = intent === 'sell' ? v.side === 'dear' : v.side === 'cheap';
  const cls = v.side === 'same' ? 'even' : risk ? (Math.abs(v.diff) >= 15 ? 'bad' : 'mid') : 'good';
  const lines = [];
  if (intent === 'sell') {
    if (curve.length) { const b = bandAt(curve, price); lines.push(`<li>${pips(b.rate, tone(b.rate))}<span>${tr(`이 값대 매물 ${nf.format(b.n)}개 중 <b>${nf.format(b.sold)}개</b>가 팔렸어요 (${pct(b.rate)})`, `<b>${nf.format(b.sold)}</b> of ${nf.format(b.n)} listings in this band sold (${pct(b.rate)})`)}</span></li>`); }
    if (open.length) { const r = rankAmong(open, price); lines.push(`<li><span>${r.cheaper ? tr(`지금 자시에 더 싼 매물이 <b>${nf.format(r.cheaper)}개</b> 있어요`, `<b>${nf.format(r.cheaper)}</b> cheaper listings are on sale now`) : tr('지금 자시 매물 중 <b>제일 싼 값</b>이에요', '<b>The cheapest</b> among what is on sale now')}</span></li>`); }
  } else if (open.length) {
    const can = open.filter((r) => r.price <= price).length, low = Math.min(...open.map((r) => r.price));
    lines.push(`<li><span>${can ? tr(`지금 자시에 이 값 이하 매물이 <b>${nf.format(can)}개</b> 있어요. 바로 사도 돼요.`, `<b>${nf.format(can)}</b> listings at or under this price are on sale now. You can buy right away.`) : tr(`지금 자시 최저가는 <b>${money(low)}</b> 메소예요. 이 값에 파는 사람을 기다려야 해요.`, `The cheapest on sale now is <b>${money(low)}</b> mesos. You wait for a seller at your price.`)}</span></li>`);
  }
  const tip = intent === 'sell'
    ? (cls === 'bad' ? tr('이 값으로는 오래 걸려요. 막대를 왼쪽으로 미세요.', 'This will take long. Slide left.') : cls === 'good' ? tr('싸게 내놓는 값이에요. 금방 연락이 와요.', 'A low price. Expect whispers soon.') : tr('시세 근처예요. 그대로 올리세요.', 'Close to the market. Post it.'))
    : (cls === 'bad' ? tr('이 값에는 잘 안 팔아요. 막대를 오른쪽으로 미세요.', 'Few sell at this price. Slide right.') : cls === 'good' ? tr('넉넉하게 부르는 값이에요. 금방 연락이 와요.', 'A generous price. Expect whispers soon.') : tr('시세 근처예요. 그대로 올리세요.', 'Close to the market. Post it.'));
  box.innerHTML = `<p class="trd-meter-big ${cls}">${v.text}</p><p class="muted small">${tr(`시세 ${money(ref)} 메소 · 내 값 ${money(price)} 메소`, `Market ${money(ref)} · yours ${money(price)}`)}</p>${lines.length ? `<ul class="trd-meter-lines">${lines.join('')}</ul>` : ''}<p class="trd-meter-tip">${tip}</p>${item.cat === 'Equip' ? `<p class="muted small">${tr('장비는 옵션에 따라 값이 달라요. 시세는 옵션을 안 가린 값이에요.', 'Gear prices depend on the stats. This market price mixes every roll.')}</p>` : ''}`;
}
function setPrice(n, from) {
  price = n;
  if (from !== 'box') priceBox.set(n);
  if (from !== 'slide') slide.set(n);
  drawMeter();
}
function setIntent(v) {
  intent = v;
  for (const b of document.querySelectorAll('.trd-intent button')) b.setAttribute('aria-pressed', String(b.dataset.intent === v));
  $('tb-price-label').textContent = v === 'sell' ? tr('팔 값 (한 개)', 'Price for one') : tr('살 값 (한 개)', 'Price for one');
  $('tb-send-label').textContent = v === 'sell' ? tr('팝니다 올리기', 'Post selling line') : tr('삽니다 올리기', 'Post buying line');
  $('tb-form').classList.toggle('buy', v === 'buy');
  drawMeter();
}
async function choose(it, wantPrice) {
  item = it; list = []; open = []; curve = []; ref = null;
  const s = summary.get(it.id);
  $('tb-picked').hidden = false;
  $('tb-picked').innerHTML = `${icon(it.id, 36)}<div><b>${esc(it.name)}</b><small>${s ? tr(`지금 매물 ${nf.format(s.open || 0)}개 · 7일 동안 팔린 매물 ${nf.format(s.sold || 0)}개`, `${nf.format(s.open || 0)} on sale · ${nf.format(s.sold || 0)} sold in 7 days`) : tr('최근 7일 매물 없음', 'no listings in 7 days')}</small></div><a href="${root.dataset.market}?item=${it.id}">${tr('시세 보기', 'Market')}</a>`;
  $('tb-meter').innerHTML = ''; $('tb-meter').setAttribute('aria-busy', 'true');
  let data = { rows: [], profile: [] };
  try { data = await getJson(`${api}/market/history?id=${it.id}`); } catch {}
  if (item !== it) return;
  $('tb-meter').removeAttribute('aria-busy');
  list = uniqueListings(data.rows); open = uniqueListings(data.profile);
  // Gear of one name mixes clean and scrolled pieces: no sold share for it, only the plain market price.
  curve = it.cat === 'Equip' ? [] : sellCurve(list);
  const sold = list.filter((r) => r.sold);
  ref = (sold.length >= 3 ? medianPrice(sold) : medianPrice(list)) || s?.median || null;
  slide.setRef(ref);
  $('tb-ref').textContent = ref ? money(ref) : '';
  setPrice(wantPrice || ref || null);
}

// ---------- the board ----------
const mine = (id) => Object.hasOwn(myKeys(), id);
function drawBoard() {
  const box = $('tb-list');
  box.removeAttribute('aria-busy');
  const q = $('tb-search').value.trim().toLowerCase().replace(/\s+/g, '');
  const name = (r) => byId.get(r.item)?.name || (ko ? r.ko || r.en : r.en) || '';
  const rows = posts.filter((r) => (filter === 'all' || r.intent === filter) && (!q || `${name(r)}${r.nick}`.toLowerCase().replace(/\s+/g, '').includes(q)));
  $('tb-count').textContent = posts.length ? tr(`24시간 동안 올라온 글 ${nf.format(posts.length)}개 · 팝니다 ${nf.format(posts.filter((r) => r.intent === 'sell').length)} · 삽니다 ${nf.format(posts.filter((r) => r.intent === 'buy').length)}`, `${nf.format(posts.length)} posts in 24 hours · ${nf.format(posts.filter((r) => r.intent === 'sell').length)} selling · ${nf.format(posts.filter((r) => r.intent === 'buy').length)} buying`) : '';
  $('tb-none').hidden = !!rows.length;
  if (!rows.length) $('tb-none').textContent = posts.length ? tr('찾는 글이 없어요. 검색어를 지우거나 다른 종류를 누르세요.', 'Nothing matches. Clear the search or pick another kind.') : tr('아직 올라온 글이 없어요. 위에서 첫 글을 올려 보세요.', 'No posts yet. Be the first with the form above.');
  box.innerHTML = rows.map((r) => {
    const m = refs.get(r.item), v = r.price && m ? versus(r.price, m) : null;
    const risk = v && (r.intent === 'sell' ? v.side === 'dear' : v.side === 'cheap');
    return `<li class="trd-post-card ${r.intent}${mine(r.id) ? ' mine' : ''}" id="p-${r.id}"><span class="trd-post-ico">${icon(r.item, 36)}</span>
<div class="trd-post-body"><p class="trd-post-top"><span class="trd-kind ${r.intent}">${r.intent === 'sell' ? tr('팝니다', 'Selling') : tr('삽니다', 'Buying')}</span><a class="trd-post-item" href="${root.dataset.market}?item=${r.item}">${esc(name(r))}</a>${mine(r.id) ? `<span class="trd-mine">${tr('내 글', 'mine')}</span>` : ''}</p>
<p class="trd-post-price">${r.price ? `<b>${mesos(r.price)}</b>` : `<b>${tr('값 협의', 'Price on request')}</b>`}${v ? `<span class="trd-vs ${v.side === 'same' ? 'same' : risk ? 'risk' : 'fair'}">${v.text}</span>` : ''}</p>
${r.text ? `<p class="trd-post-note">${esc(r.text)}</p>` : ''}
<p class="trd-post-meta"><b translate="no">${esc(r.nick)}</b>${r.channel ? ` · CH ${r.channel}` : ''} · <time datetime="${esc(r.at.replace(' ', 'T'))}Z">${ago(r.at)}</time></p></div>
<div class="trd-post-acts"><button type="button" class="btn ghost small-btn" data-whisper="${esc(r.nick)}">${tr('귓말', 'Whisper')}</button>${mine(r.id) ? `<button type="button" class="btn ghost small-btn" data-del="${r.id}">${tr('지우기', 'Delete')}</button>` : `<button type="button" class="trd-report" data-report="${r.id}">${tr('신고', 'Report')}</button>`}</div></li>`;
  }).join('');
}
async function loadRefs(rows) {
  const ids = [...new Set(rows.map((r) => r.item))].filter((id) => !refs.has(id)).slice(0, 60);
  if (!ids.length) return;
  try { const d = await getJson(`${api}/prices?ids=${ids.join(',')}`); for (const id of ids) refs.set(id, d[id]?.median || null); } catch {}
}
function addPosts(rows) {
  const fresh = rows.filter((r) => (r.intent === 'sell' || r.intent === 'buy') && r.item && !posts.some((x) => x.id === r.id));
  lastId = Math.max(lastId, ...rows.map((r) => r.id));
  if (!fresh.length) return false;
  posts = fresh.concat(posts).sort((a, b) => b.id - a.id).slice(0, 200);
  loadRefs(fresh).then(drawBoard);
  return true;
}
async function poll() {
  try { const d = await getJson(`${api}/free-megas?limit=100${lastId ? `&after=${lastId}` : ''}`); if (addPosts(d.rows || []) || $('tb-list').hasAttribute('aria-busy')) drawBoard(); } catch { if ($('tb-list').hasAttribute('aria-busy')) drawBoard(); }
}

const ERR = {
  nick: () => tr('내 닉네임에 귓말 받을 이름을 2~20자로 적으세요. @와 링크는 안 돼요.', 'Enter the name to whisper (2 to 20 characters, no @ or links).'),
  item: () => tr('아이템을 목록에서 다시 고르세요.', 'Pick the item from the list again.'),
  price: () => tr('값은 180만, 1.5억, 3m처럼 적으세요.', 'Write the price like 3m, 500k or 1.5b.'),
  length: () => tr('한마디는 80자까지예요.', 'Keep the note to 80 characters.'),
  link: () => tr('링크는 올릴 수 없어요.', 'Links are not allowed.'),
  rmt: () => tr('현금 거래나 연락처는 올릴 수 없어요.', 'No real-money trades or contact handles.'),
  channel: () => tr('채널은 1~40 사이예요.', 'Channels are 1 to 40.'),
  slow: () => tr('2분에 한 번 올릴 수 있어요. 조금만 기다리세요.', 'One post every 2 minutes. Please wait a moment.'),
  daily: () => tr('하루 10번까지 올릴 수 있어요. 내일 다시 올리세요.', 'Up to 10 posts a day. Try again tomorrow.'),
  paused: () => tr('지금은 잠시 쉬는 중이에요. 잠시 뒤 다시 올리세요.', 'Taking a short break. Please try again soon.'),
};
async function submit(e) {
  e.preventDefault();
  const status = $('tb-status'), nick = $('tb-nick').value.replace(/\s+/g, ' ').trim();
  status.className = 'trd-post-status';
  const fail = (msg, el) => { status.textContent = msg; status.classList.add('bad'); el?.focus(); };
  if (!item) return fail(tr('아이템을 먼저 고르세요.', 'Pick an item first.'), $('trd-q'));
  if (!price) return fail(tr('값을 적으세요.', 'Type a price.'), $('tb-price'));
  if (nick.length < 2 || nick.length > 20 || /[@<>`]/.test(nick)) return fail(ERR.nick(), $('tb-nick'));
  const body = { nick, intent, item: item.id, price, text: $('tb-note').value.replace(/\s+/g, ' ').trim(), channel: $('tb-ch').value ? Number($('tb-ch').value) : null };
  $('tb-send').disabled = true; status.textContent = '';
  try {
    const r = await fetch(`${api}/free-megas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.row) return fail((ERR[out.error] || (() => (r.status === 503 ? ERR.paused() : tr('올리지 못했어요. 잠시 뒤 다시 올리세요.', 'Could not post. Please try again.'))))());
    const keys = myKeys(); keys[out.row.id] = out.key;
    try { localStorage.setItem(KEYS, JSON.stringify(Object.fromEntries(Object.entries(keys).slice(-30)))); localStorage.setItem(NICK_KEY, nick); localStorage.setItem(CH_KEY, $('tb-ch').value); } catch {}
    addPosts([out.row]); drawBoard();
    dispatchEvent(new CustomEvent('gms-free', { detail: [out.row] }));
    $('tb-note').value = '';
    status.textContent = tr('올렸어요! 아래 목록과 실시간 확성기에 떴어요.', 'Posted! It is on the list below and on the megaphone page.');
    status.classList.add('ok');
    document.getElementById(`p-${out.row.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    track('trade_post', { page_type: 'trade', intent, item_id: item.id });
  } catch { fail(tr('올리지 못했어요. 잠시 뒤 다시 올리세요.', 'Could not post. Please try again.')); } finally { $('tb-send').disabled = false; }
}
async function onBoardClick(e) {
  const w = e.target.closest('[data-whisper]'), del = e.target.closest('[data-del]'), rep = e.target.closest('[data-report]');
  if (w) {
    try { await navigator.clipboard.writeText(`/w ${w.dataset.whisper} `); const old = w.textContent; w.textContent = tr('복사됨', 'Copied'); setTimeout(() => (w.textContent = old), 1200); } catch {}
    track('trade_whisper', { page_type: 'trade' });
  } else if (del) {
    const id = Number(del.dataset.del), keys = myKeys();
    del.disabled = true;
    try {
      const r = await fetch(`${api}/free-megas?id=${id}&key=${encodeURIComponent(keys[id] || '')}`, { method: 'DELETE' });
      if (r.ok || r.status === 404) { delete keys[id]; try { localStorage.setItem(KEYS, JSON.stringify(keys)); } catch {} posts = posts.filter((x) => x.id !== id); drawBoard(); } else del.disabled = false;
    } catch { del.disabled = false; }
  } else if (rep) {
    rep.disabled = true;
    try { await fetch(`${api}/free-megas/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(rep.dataset.report) }) }); rep.textContent = tr('신고했어요', 'Reported'); } catch { rep.disabled = false; }
  }
}

async function boot() {
  priceBox = moneyInput($('tb-price'), (n) => setPrice(n, 'box'));
  slide = priceSlider($('tb-slide'), (n) => setPrice(n, 'slide'));
  try { $('tb-nick').value = localStorage.getItem(NICK_KEY) || ''; $('tb-ch').value = localStorage.getItem(CH_KEY) || ''; } catch {}
  document.querySelector('.trd-intent').addEventListener('click', (e) => { const b = e.target.closest('[data-intent]'); if (b) setIntent(b.dataset.intent); });
  $('tb-form').addEventListener('submit', submit);
  $('tb-list').addEventListener('click', onBoardClick);
  $('tb-search').addEventListener('input', drawBoard);
  $('tb-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; filter = b.dataset.v; for (const x of $('tb-filter').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); drawBoard(); });
  addEventListener('gms-free-gone', (e) => { posts = posts.filter((r) => r.id !== e.detail); drawBoard(); });
  poll(); setInterval(poll, 60000);
  setInterval(() => { for (const t of document.querySelectorAll('#tb-list time')) { const r = posts.find((x) => `p-${x.id}` === t.closest('li')?.id); if (r) t.textContent = ago(r.at); } }, 60000);
  let rows, catalog;
  try { [rows, catalog] = await Promise.all([getJson(root.dataset.items), getJson(`${api}/market/catalog`).catch(() => ({ items: [] }))]); } catch { return; }
  summary = new Map(catalog.items.map((r) => [r.item, r]));
  const index = makeMarketIndex(rows, ko ? 'ko' : 'en');
  byId = new Map(index.map((it) => [it.id, it]));
  picker({ input: $('trd-q'), list: $('trd-opts'), index, allow: () => true, onPick: (it) => choose(it), first: (it) => summary.has(it.id),
    note: (it) => { const s = summary.get(it.id); return s?.median ? money(s.median) : ''; } });
  drawBoard();
  const p = new URLSearchParams(location.search), first = byId.get(Number(p.get('item')));
  if (p.get('kind') === 'buy') setIntent('buy');
  if (first) { $('trd-q').value = first.name; choose(first, Number(p.get('price')) > 0 ? Number(p.get('price')) : undefined); }
}
boot();
