// /trade/: the buy and sell board. The composer picks an item, sets a price with a slider around the market price
// (and says how dear it is), and posts a 무료 고확 (worker/src/free-mega.js); the board lists the buy and sell posts
// until their writers delete them. Posts made on the megaphone page show here and the other way round.
// 거래 신청 (owner 2026-11-25): a post written with Discord connected takes requests. A visitor types their game name,
// the worker DMs the writer on Discord (POST /free-megas/request), and the writer whispers them in game.
import { makeMarketIndex } from './market-catalog.js';
import { uniqueListings, sellCurve, bandAt, sellAdvice, rankAmong, medianPrice } from './trade-math.js';
import { ko, tr, esc, nf, icon, money, mesos, pct, pips, track, getJson, moneyInput, picker, priceSlider, versus, ago } from './trade-ui.js';
import { optionSummary } from './mega-option-text.js';
import { itemAttrs } from './item-attrs.js';

const root = document.getElementById('tb-page');
const $ = (id) => document.getElementById(id);
const api = root.dataset.api;
const NICK_KEY = 'gms-free-nick', CH_KEY = 'gms-free-ch', KEYS = 'gms-free-keys', ASKED = 'gms-trade-asked', DM_OFF = 'gms-trade-dm-off', DRAFT = 'gms-trade-draft';
const myKeys = () => { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch { return {}; } };
const stored = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
// The Discord login every page shares (assets/account.js): { token, name, … } or null.
const acct = () => { try { const a = JSON.parse(localStorage.getItem('gms-account') || 'null'); return a?.token ? a : null; } catch { return null; } };
const asked = () => { try { return JSON.parse(localStorage.getItem(ASKED) || '[]') || []; } catch { return []; } };
// The Discord mark, written into the page by the build (scripts/trade-pages.mjs).
const DC = document.getElementById('tb-dc')?.innerHTML || '';
const CHANNELS = `<option value="">${tr('안 정함', 'Any')}</option>${Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">CH ${i + 1}</option>`).join('')}`;

let byId = new Map(), summary = new Map(), refs = new Map();
let intent = 'sell', item = null, price = null, list = [], open = [], curve = [], ref = null, priceBox, slide;
let posts = [], lastId = 0, filter = 'all';
// dmReady: the worker answers with `dm` on each post (it does once 거래 신청 is live). ask: the open request form.
let dmReady = false, ask = null, jumped = false;

// ---------- Discord for the writer ----------
let dmShown = null;
function drawDm() {
  const box = $('tb-dm');
  if (!dmReady) { box.hidden = true; return; }
  const a = acct();
  // Redrawn only when the login changed (it can end in this tab, in the header or in another tab).
  if (dmShown === (a?.token || '')) return;
  dmShown = a?.token || '';
  box.hidden = false;
  box.className = `trd-dm${a ? ' on' : ''}`;
  box.innerHTML = a
    ? `<label><input type="checkbox" id="tb-dm-on"${stored(DM_OFF) === '1' ? '' : ' checked'}><span><b>${tr('거래 신청이 오면 디스코드 DM으로 받기', 'Get trade requests as a Discord DM')}</b><small>${tr(`${esc(a.name || '')} 계정으로 DM이 가요. 게임을 꺼 둔 동안에도 받아요.`, `Sent to ${esc(a.name || 'your account')}, also while the game is closed.`)}</small></span></label>`
    : `<p><b>${tr('거래 신청을 디스코드 DM으로 받으세요', 'Get trade requests as a Discord DM')}</b><small>${tr('디스코드를 연결하고 올리면, 누가 내 글에 거래 신청을 누를 때 바로 DM이 와요. 적던 글은 그대로 남아요.', 'Connect Discord, then post: a DM arrives the moment someone asks to trade. What you typed stays.')}</small></p><a class="btn small-btn trd-dc" id="tb-dm-login" href="${esc(`${api}/discord/oauth/start?${new URLSearchParams({ intent: 'login', lang: ko ? 'ko' : 'en', ret: `${location.pathname}?post=1` })}`)}">${DC}${tr('디스코드 연결', 'Connect Discord')}</a>`;
}
// The form as typed, kept while the visitor goes to Discord and back (15 minutes).
function saveDraft() {
  try { sessionStorage.setItem(DRAFT, JSON.stringify({ t: Date.now(), intent, item: item?.id || null, price, nick: $('tb-nick').value, ch: $('tb-ch').value, note: $('tb-note').value })); } catch {}
}
function readDraft() {
  try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); return d && Date.now() - d.t < 15 * 60000 ? d : null; } catch { return null; }
}
const dropDraft = () => { try { sessionStorage.removeItem(DRAFT); } catch {} };

// ---------- the composer ----------
const tone = (rate) => (rate >= 0.5 ? 'good' : rate >= 0.2 ? 'mid' : 'bad');
function drawMeter() {
  const box = $('tb-meter');
  if (!item) { box.innerHTML = `<p class="muted">${tr('아이템을 고르면 정가보다 얼마나 비싼지 나와요.', 'Pick an item to see how it stands against the market.')}</p>`; return; }
  if (!ref) { box.innerHTML = `<p class="trd-big-line">${tr('정가가 아직 없어요', 'No market price yet')}</p><p>${tr('최근 7일 동안 올라온 매물이 없어요. 내가 받고 싶은 값을 적으세요.', 'Nothing was listed in the last 7 days. Type the price you want.')}</p>`; return; }
  if (!price) { box.innerHTML = `<p class="trd-big-line">${tr('값을 적거나 막대를 미세요', 'Type a price or move the slider')}</p><p>${tr(`정가는 ${money(ref)} 메소예요.`, `The market price is ${money(ref)} mesos.`)}</p>`; return; }
  const v = against(price, ref);
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
    ? (cls === 'bad' ? tr('이 값으로는 오래 걸려요. 막대를 왼쪽으로 미세요.', 'This will take long. Slide left.') : cls === 'good' ? tr('싸게 내놓는 값이에요. 금방 연락이 와요.', 'A low price. Expect whispers soon.') : tr('정가 근처예요. 그대로 올리세요.', 'Close to the market. Post it.'))
    : (cls === 'bad' ? tr('이 값에는 잘 안 팔아요. 막대를 오른쪽으로 미세요.', 'Few sell at this price. Slide right.') : cls === 'good' ? tr('넉넉하게 부르는 값이에요. 금방 연락이 와요.', 'A generous price. Expect whispers soon.') : tr('정가 근처예요. 그대로 올리세요.', 'Close to the market. Post it.'));
  box.innerHTML = `<p class="trd-meter-big ${cls}">${v.text}</p><p class="muted small">${tr(`정가 ${money(ref)} 메소 · 내 값 ${money(price)} 메소`, `Market ${money(ref)} · yours ${money(price)}`)}</p>${lines.length ? `<ul class="trd-meter-lines">${lines.join('')}</ul>` : ''}<p class="trd-meter-tip">${tip}</p>${item.cat === 'Equip' ? `<p class="muted small">${tr('장비는 옵션에 따라 값이 달라요. 정가는 옵션을 안 가린 값이에요.', 'Gear prices depend on the stats. This market price mixes every roll.')}</p>` : ''}`;
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
  try { [data] = await Promise.all([getJson(`${api}/market/history?id=${it.id}`), loadRefs([{ item: it.id }])]); } catch {}
  if (item !== it) return;
  $('tb-meter').removeAttribute('aria-busy');
  list = uniqueListings(data.rows); open = uniqueListings(data.profile);
  // Gear of one name mixes clean and scrolled pieces: no sold share for it, only the plain market price.
  curve = it.cat === 'Equip' ? [] : sellCurve(list);
  // The same market price the rows of the list are measured against (/prices); the week's listings when it has none.
  const sold = list.filter((r) => r.sold);
  ref = refs.get(it.id) || (sold.length >= 3 ? medianPrice(sold) : medianPrice(list)) || s?.median || null;
  slide.setRef(ref);
  $('tb-ref').textContent = ref ? money(ref) : '';
  setPrice(wantPrice || ref || null);
}

// ---------- the list ----------
// On this page the price a post is measured against is called 정가 (owner 2026-11-25); other pages keep 시세.
const against = (p, m) => { const v = versus(p, m); return v && ko ? { ...v, text: v.text.replace('시세', '정가') } : v; };
const mine = (id) => Object.hasOwn(myKeys(), id);
const nameOf = (r) => byId.get(r.item)?.name || (ko ? r.ko || r.en : r.en) || '';
const gap = (r) => { const m = refs.get(r.item); return r.price && m ? r.price / m - 1 : null; };
// Posts and Shop Scan items share the list, so "newest" goes by time (UTC 'YYYY-MM-DD HH:MM:SS' on both), then post id.
const idNum = (r) => (typeof r.id === 'number' ? r.id : 0);
const byNew = (a, b) => (b.at || '').localeCompare(a.at || '') || idNum(b) - idNum(a);
const SORT = {
  new: byNew,
  low: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || byNew(a, b),
  high: (a, b) => (b.price ?? -1) - (a.price ?? -1) || byNew(a, b),
  deal: (a, b) => (gap(a) ?? Infinity) - (gap(b) ?? Infinity) || byNew(a, b),
  item: (a, b) => nameOf(a).localeCompare(nameOf(b)) || (a.price ?? Infinity) - (b.price ?? Infinity),
};
function drawBoard() {
  const box = $('tb-list');
  box.removeAttribute('aria-busy');
  for (const [key, n] of [['all', posts.length], ['sell', posts.filter((r) => r.intent === 'sell').length], ['buy', posts.filter((r) => r.intent === 'buy').length]]) { const el = $(`tb-stat-${key}`); el.removeAttribute('aria-busy'); el.textContent = nf.format(n); }
  const q = $('tb-search').value.trim().toLowerCase().replace(/\s+/g, '');
  // Items still on sale in Shop Scan shops are listed as selling rows too (owner 2026-11-26), marked 상점, time = last scan.
  const rows = posts.concat(shopRows()).filter((r) => (filter === 'all' || (filter === 'shop' ? r.shop !== undefined : r.intent === filter)) && (!q || `${nameOf(r)}${r.nick}`.toLowerCase().replace(/\s+/g, '').includes(q))).sort(SORT[$('tb-sort').value] || SORT.new);
  $('tb-count').textContent = rows.length ? tr(`${nf.format(rows.length)}줄 · 팔렸으면 내 글의 지우기를 눌러 내려 주세요`, `${nf.format(rows.length)} rows · once it sells, press Delete on your post`) : '';
  $('tb-none').hidden = !!rows.length;
  if (!rows.length) $('tb-none').textContent = posts.length ? tr('찾는 글이 없어요. 검색어를 지우거나 다른 종류를 누르세요.', 'Nothing matches. Clear the search or pick another kind.') : tr('아직 올라온 글이 없어요. 올리기를 눌러 첫 글을 올려 보세요.', 'No posts yet. Press Post and be the first.');
  const did = new Set(asked());
  // A redraw (new posts every minute) must not take the caret out of the request form.
  const active = document.activeElement, held = active?.closest?.('.trd-req') && active.name ? { name: active.name, at: active.selectionStart } : null;
  box.innerHTML = rows.map((r) => {
    if (r.shop !== undefined) return shopRowHtml(r);
    const m = refs.get(r.item), v = r.price && m ? against(r.price, m) : null;
    const risk = v && (r.intent === 'sell' ? v.side === 'dear' : v.side === 'cheap');
    const short = v ? (v.side === 'same' ? tr('정가', 'at market') : `${v.diff > 0 ? '+' : '−'}${Math.abs(v.diff) >= 10 ? Math.round(Math.abs(v.diff)) : Math.round(Math.abs(v.diff) * 10) / 10}%`) : '';
    return `<div class="trd-line-row ${r.intent}${mine(r.id) ? ' mine' : ''}${r.dm && !mine(r.id) ? ' asks' : ''}" id="p-${r.id}" role="row">
<span class="trd-c-kind" role="cell"><span class="trd-kind ${r.intent}">${r.intent === 'sell' ? tr('팝니다', 'Selling') : tr('삽니다', 'Buying')}</span></span>
<span class="trd-c-item" role="cell">${icon(r.item, 32)}<span><a class="trd-post-item" href="${root.dataset.market}?item=${r.item}">${esc(nameOf(r))}</a>${mine(r.id) ? `<em class="trd-mine">${tr('내 글', 'mine')}</em>` : ''}${r.text ? `<small>${esc(r.text)}</small>` : ''}</span></span>
<span class="trd-c-price" role="cell">${r.price ? `<b>${money(r.price)}</b><small>${nf.format(r.price)}</small>` : `<b class="trd-ask">${tr('값 협의', 'on request')}</b>`}</span>
<span class="trd-c-vs" role="cell">${v ? `<span class="trd-vs ${v.side === 'same' ? 'same' : risk ? 'risk' : 'fair'}" title="${esc(`${v.text} · ${tr('정가', 'market')} ${money(m)}`)}">${short}</span>` : '<span class="trd-vs none">–</span>'}</span>
<span class="trd-c-who" role="cell"><b translate="no">${esc(r.nick)}</b>${r.channel ? `<small>CH ${r.channel}</small>` : ''}${r.dm ? `<em class="trd-dm-badge" title="${tr('거래 신청을 누르면 글쓴이에게 디스코드 DM이 가요', 'Asking to trade sends the writer a Discord DM')}">${DC}${tr('DM 받음', 'takes DMs')}</em>` : ''}</span>
<span class="trd-c-when" role="cell"><time datetime="${esc(r.at.replace(' ', 'T'))}Z">${ago(r.at)}</time></span>
<span class="trd-c-act" role="cell">${r.dm && !mine(r.id) ? (did.has(r.id) ? `<button type="button" class="btn small-btn trd-dc" disabled>${tr('신청함', 'Asked')}</button>` : `<button type="button" class="btn small-btn trd-dc" data-ask="${r.id}" aria-expanded="${ask?.id === r.id}">${DC}${tr('거래 신청', 'Ask to trade')}</button>`) : ''}<button type="button" class="${r.dm && !mine(r.id) ? 'trd-report' : 'btn ghost small-btn'}" data-whisper="${esc(r.nick)}">${tr('귓말', 'Whisper')}</button>${mine(r.id) ? `<button type="button" class="trd-report" data-del="${r.id}">${tr('지우기', 'Delete')}</button>` : `<button type="button" class="trd-report" data-report="${r.id}">${tr('신고', 'Report')}</button>`}</span></div>${ask?.id === r.id ? askHtml(r) : ''}`;
  }).join('');
  if (held) { const el = box.querySelector(`.trd-req [name="${held.name}"]`); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(held.at, held.at); } catch {} } }
  // A link from the writer's DM (#p-<id>) lands on that row.
  if (!jumped && rows.length) { jumped = true; const hit = /^#p-\d+$/.test(location.hash) && document.getElementById(location.hash.slice(1)); if (hit) { hit.classList.add('hit'); hit.scrollIntoView({ block: 'center' }); } }
}
// Shop Scan items as board rows: kind 상점, the seller with channel and room, the time of the last scan, and a button
// that opens the shop window. Gear gets no 정가 badge (its options decide the price).
function shopRows() {
  return shops.flatMap((s, i) => onSale(s).map(([id, price, qty], k) => ({ id: `s${i}-${k}`, shop: i, intent: 'sell', item: id, price, qty, nick: s.seller, channel: s.ch, room: s.room, at: s.at })));
}
function shopRowHtml(r) {
  const m = refs.get(r.item), v = r.price && m && byId.get(r.item)?.cat !== 'Equip' ? against(r.price, m) : null;
  const short = v ? (v.side === 'same' ? tr('정가', 'at market') : `${v.diff > 0 ? '+' : '−'}${Math.abs(v.diff) >= 10 ? Math.round(Math.abs(v.diff)) : Math.round(Math.abs(v.diff) * 10) / 10}%`) : '';
  return `<div class="trd-line-row sell shoprow" id="p-${r.id}" role="row">
<span class="trd-c-kind" role="cell"><span class="trd-kind shop">${tr('상점', 'Shop')}</span></span>
<span class="trd-c-item" role="cell">${icon(r.item, 32)}<span><a class="trd-post-item" href="${root.dataset.market}?item=${r.item}">${esc(nameOf(r))}</a>${r.qty > 1 ? `<small>${tr(`${nf.format(r.qty)}개 · 개당 값`, `${nf.format(r.qty)} · price each`)}</small>` : ''}</span></span>
<span class="trd-c-price" role="cell"><b>${money(r.price)}</b><small>${nf.format(r.price)}</small></span>
<span class="trd-c-vs" role="cell">${v ? `<span class="trd-vs ${v.side === 'same' ? 'same' : v.side === 'dear' ? 'risk' : 'fair'}" title="${esc(`${v.text} · ${tr('정가', 'market')} ${money(m)}`)}">${short}</span>` : '<span class="trd-vs none">–</span>'}</span>
<span class="trd-c-who" role="cell"><b translate="no">${esc(r.nick)}</b><small>CH ${r.channel} · ${tr(`자유시장 ${r.room}`, `FM ${r.room}`)}</small></span>
<span class="trd-c-when" role="cell"><time datetime="${esc(String(r.at).replace(' ', 'T'))}Z">${ago(r.at)}</time></span>
<span class="trd-c-act" role="cell"><button type="button" class="btn small-btn ghost" data-open-shop="${r.shop}">${tr('상점 보기', 'View shop')}</button></span></div>`;
}
// The request form under a row: the asker's game name (no login), sent on to the writer by DM.
function askHtml(r) {
  if (ask.done) return `<div class="trd-req ${ask.cls || ''}" role="row"><p class="trd-req-done" role="status"><b>${ask.done}</b></p><button type="button" class="btn ghost small-btn" data-whisper="${esc(r.nick)}">${tr('귓말 복사', 'Copy whisper')}</button><button type="button" class="trd-report" data-ask-close>${tr('닫기', 'Close')}</button></div>`;
  return `<form class="trd-req" data-ask-form="${r.id}" role="row" autocomplete="off"><p><b>${tr(`${esc(r.nick)} 님에게 거래 신청`, `Ask ${esc(r.nick)} to trade`)}</b><small>${tr('내 게임 닉네임을 적으면 글쓴이에게 디스코드 DM이 가요. 글쓴이가 게임에서 귓말을 보내요.', 'Type your game name: the writer gets a Discord DM and whispers you in game.')}</small></p>
<label class="trd-field">${tr('내 닉네임', 'My game name')}<input name="nick" maxlength="20" spellcheck="false" autocapitalize="off" value="${esc(ask.nick)}" placeholder="${tr('귓말 받을 이름', 'Name to whisper')}" required></label>
<label class="trd-field">${tr('채널', 'Channel')}<select name="ch">${CHANNELS.replace(`value="${ask.ch}"`, `value="${ask.ch}" selected`)}</select></label>
<button type="submit" class="btn small-btn trd-dc"${ask.busy ? ' disabled' : ''}>${DC}${tr('신청 보내기', 'Send request')}</button><button type="button" class="trd-report" data-ask-close>${tr('닫기', 'Close')}</button>
<span class="trd-post-status${ask.msg ? ' bad' : ''}" role="status" aria-live="polite">${ask.msg || ''}</span></form>`;
}
// The composer opens above the list; the page starts as the list.
function openForm(focus = true) {
  $('tb-form').hidden = false;
  $('tb-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (focus) (item ? $('tb-price') : $('trd-q')).focus({ preventScroll: true });
}
async function loadRefs(rows) {
  const all = [...new Set(rows.map((r) => r.item))].filter((id) => !refs.has(id));
  // /prices takes up to 60 ids a call.
  for (let i = 0; i < all.length; i += 60) {
    const ids = all.slice(i, i + 60);
    try { const d = await getJson(`${api}/prices?ids=${ids.join(',')}`); for (const id of ids) refs.set(id, d[id]?.median || null); } catch {}
  }
}
// A post stays on the market until its writer deletes it (owner, 2026-11-24); the list holds the newest 100.
function addPosts(rows) {
  if (!dmReady && rows.some((r) => 'dm' in r)) { dmReady = true; drawDm(); }
  const fresh = rows.filter((r) => (r.intent === 'sell' || r.intent === 'buy') && r.item && !posts.some((x) => x.id === r.id));
  lastId = Math.max(lastId, ...rows.map((r) => r.id));
  if (!fresh.length) return false;
  posts = fresh.concat(posts).sort((a, b) => b.id - a.id).slice(0, 100);
  loadRefs(fresh).then(drawBoard);
  return true;
}
async function poll() {
  try { const d = await getJson(`${api}/free-megas?limit=100${lastId ? `&after=${lastId}` : ''}`); if (addPosts(d.rows || []) || $('tb-list').hasAttribute('aria-busy')) drawBoard(); } catch { if ($('tb-list').hasAttribute('aria-busy')) drawBoard(); }
}

// ---------- shops from Shop Scan (owner 2026-11-26) ----------
// The shops people uploaded with Shop Scan in the last day (worker /market/scan-shops): a row of shop cards at the top,
// each opening a window like the game's personal shop with what it sells, how many and for how much.
let shops = [], shopsAll = false;
const SHOW_SHOPS = 8;
const onSale = (s) => s.items.filter((i) => !i[3]);
const face = (s, size) => (s.face?.photo
  ? `<img class="trd-shop-face" src="${esc(s.face.photo)}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="trd-shop-face none" aria-hidden="true">${esc((s.seller || '?').slice(0, 1).toUpperCase())}</span>`);
// Booth wood colour per seller, steady across visits (the game's booths come in several colours).
const WOODS = ['wood-gold', 'wood-pink', 'wood-sky', 'wood-mint'];
const wood = (s) => WOODS[[...String(s.seller)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % WOODS.length];
const COIN = new URL('nav/coin.webp?v=n1', import.meta.url).href;
const where = (s) => tr(`CH ${s.ch} · 자유시장 ${s.room}`, `CH ${s.ch} · FM ${s.room}`);
function drawShops() {
  const box = $('tb-shop-list');
  box.removeAttribute('aria-busy');
  $('tb-shops').hidden = !shops.length;
  if (!shops.length) return;
  $('tb-shops-n').textContent = tr(`열린 상점 ${nf.format(shops.length)}곳`, `${nf.format(shops.length)} open`);
  const list = shopsAll ? shops : shops.slice(0, SHOW_SHOPS);
  box.innerHTML = list.map((s) => {
    const items = onSale(s), more = items.length - 3;
    const first = byId.get(items[0]?.[0])?.name || '';
    // The sign shows the shop's own title when Shop Scan read it, as in game; otherwise what it sells.
    const title = s.title || (items.length > 1 ? tr(`${first} 외 ${nf.format(items.length - 1)}개`, `${first} +${nf.format(items.length - 1)} more`) : first);
    // Built like the game's hired-merchant booth: thatched roof, the sign board with the shop's goods, the bar with a coin,
    // the owner between two posts behind the counter, and the black name tag under it.
    return `<button type="button" class="trd-shop ${wood(s)}" data-shop="${shops.indexOf(s)}" aria-label="${esc(tr(`${s.seller}의 상점, ${items.length}개 판매 중`, `${s.seller}'s shop, ${items.length} on sale`))}">
<span class="trd-booth"><span class="trd-booth-roof" aria-hidden="true"></span><span class="trd-booth-board"${s.title ? ' translate="no"' : ''}>${esc(title)}</span>
<span class="trd-booth-bar"><img class="trd-booth-coin" src="${COIN}" width="16" height="16" alt=""><span class="trd-shop-icons">${items.slice(0, 3).map((i) => icon(i[0], 18)).join('')}${more > 0 ? `<em>+${more}</em>` : ''}</span></span>
<span class="trd-booth-body">${face(s, 96)}<span class="trd-booth-counter" aria-hidden="true"></span></span></span>
<span class="trd-booth-name">${esc(s.seller)}</span>
<span class="trd-shop-where">${esc(where(s))}${s.face?.level ? ` · Lv.${s.face.level}` : ''}</span>
<span class="trd-shop-foot">${tr(`${nf.format(items.length)}개 판매 중`, `${nf.format(items.length)} on sale`)} · ${tr(`${ago(s.at)} 확인`, `seen ${ago(s.at)}`)}</span></button>`;
  }).join('');
  const rest = shops.length - SHOW_SHOPS;
  $('tb-shops-more').hidden = rest <= 0;
  $('tb-shops-more').textContent = shopsAll ? tr('접기', 'Show fewer') : tr(`상점 ${nf.format(rest)}곳 더 보기`, `Show ${nf.format(rest)} more`);
  $('tb-shops-credit').hidden = !shops.some((s) => s.face?.photo);
}
async function openShop(s) {
  const dlg = $('tb-shopdlg'), body = $('tb-shopdlg-body');
  const draw = () => {
    const rows = s.items.map(([id, price, qty, sold, opts]) => {
      // Gear prices depend on the piece's options, so the plain market price says nothing about it: no badge for equipment.
      const m = refs.get(id), v = !sold && m && byId.get(id)?.cat !== 'Equip' ? versus(price, m) : null;
      const extra = opts ? optionSummary(opts, ko) : '';
      const short = v ? (v.side === 'same' ? tr('시세', 'market') : `${v.diff > 0 ? '+' : '−'}${Math.round(Math.abs(v.diff))}%`) : '';
      return `<li class="trd-si${sold ? ' sold' : ''}"><span class="trd-si-icon"${itemAttrs(id, opts, 'listing')}>${icon(id, 32)}${qty > 1 ? `<b>${nf.format(qty)}</b>` : ''}</span>
<span class="trd-si-name"><a href="${root.dataset.market}?item=${id}"${itemAttrs(id, opts, 'listing')}>${esc(byId.get(id)?.name || `#${id}`)}</a>${extra ? `<small>${esc(extra)}</small>` : ''}</span>
<span class="trd-si-price">${sold ? `<em>${tr('판매 완료', 'Sold')}</em>` : `<b>${money(price)}</b><small>${qty > 1 ? tr('개당', 'each') : mesos(price)}</small>`}</span>
<span class="trd-si-vs">${v ? `<span class="trd-vs ${v.side === 'same' ? 'same' : v.side === 'dear' ? 'risk' : 'fair'}" title="${esc(`${v.text} · ${tr('시세', 'market')} ${money(m)}`)}">${short}</span>` : ''}</span></li>`;
    }).join('');
    dlg.className = `trd-shopdlg ${wood(s)}`;
    body.innerHTML = `<div class="trd-shopdlg-head">${face(s, 56)}<div><h2 id="tb-shopdlg-h">${esc(tr(`${s.seller}의 상점`, `${s.seller}'s shop`))}</h2>
${s.title ? `<p class="trd-shopdlg-sign" translate="no">“${esc(s.title)}”</p>` : ''}<p>${esc(where(s))}${s.face?.job ? ` · ${esc(s.face.job)}` : ''}${s.face?.level ? ` · Lv.${s.face.level}` : ''} · ${tr(`마지막 확인 ${ago(s.at)}`, `last seen ${ago(s.at)}`)}</p></div>
<button type="button" class="trd-shopdlg-x" data-close aria-label="${tr('닫기', 'Close')}">×</button></div>
<ul class="trd-silist">${rows}</ul>
<div class="trd-shopdlg-foot"><button type="button" class="btn small-btn" data-whisper="${esc(s.seller)}">${tr('귓말 복사', 'Copy whisper')}</button>
<span class="muted small">${tr('값 옆 %는 시세보다 얼마나 비싸고 싼지예요. 게임에서 사기 전에 다시 확인하세요.', 'The % is how far each price is from the market. Check again in game before you buy.')}</span></div>`;
  };
  draw();
  if (!dlg.open) dlg.showModal();
  track('trade_shop_open', { page_type: 'trade', items: onSale(s).length });
  await loadRefs(s.items.map(([item]) => ({ item })));
  if (dlg.open) draw();
}
async function loadShops() {
  let failed = false;
  try { shops = (await getJson(`${api}/market/scan-shops`)).shops || []; } catch { shops = []; failed = true; }
  // Open shops = checked with Shop Scan in the last 24 hours and still holding unsold items (the same list as the cards).
  const st = $('tb-stat-shops');
  if (st) { st.removeAttribute('aria-busy'); st.textContent = failed ? '–' : nf.format(shops.length); }
  shops.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  drawShops();
  drawBoard();
  loadRefs(shopRows()).then(drawBoard);
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
const ASK_ERR = {
  nick: () => tr('내 닉네임을 2~20자로 적으세요. @와 링크는 안 돼요.', 'Enter your game name (2 to 20 characters, no @ or links).'),
  channel: ERR.channel,
  again: () => tr('이미 신청한 글이에요.', 'You already asked on this post.'),
  slow: () => tr('20초에 한 번 신청할 수 있어요. 조금만 기다리세요.', 'One request every 20 seconds. Please wait a moment.'),
  daily: () => tr('하루 20번까지 신청할 수 있어요. 내일 다시 신청하세요.', 'Up to 20 requests a day. Try again tomorrow.'),
  busy: () => tr('오늘 이 글에 신청이 많이 몰렸어요. 귓말로 직접 말을 거세요.', 'This post got many requests today. Whisper the writer instead.'),
  gone: () => tr('글이 내려갔어요.', 'The post is gone.'),
  nodm: () => tr('이 글은 DM을 받지 않아요. 귓말로 직접 말을 거세요.', 'This post does not take DMs. Whisper the writer instead.'),
};
async function sendAsk(form) {
  const id = Number(form.dataset.askForm), r = posts.find((x) => x.id === id);
  if (!ask || ask.id !== id || ask.busy || !r) return;
  const nick = form.nick.value.replace(/\s+/g, ' ').trim();
  ask.nick = nick; ask.ch = form.ch.value;
  if (nick.length < 2 || nick.length > 20 || /[@<>`]/.test(nick)) { ask.msg = ASK_ERR.nick(); drawBoard(); document.querySelector('.trd-req [name="nick"]')?.focus(); return; }
  ask.busy = true; ask.msg = ''; drawBoard();
  let out = {}, status = 0;
  try {
    const res = await fetch(`${api}/free-megas/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, nick, channel: ask.ch ? Number(ask.ch) : null }) });
    status = res.status; out = await res.json().catch(() => ({}));
  } catch {}
  if (!ask || ask.id !== id) return;
  ask.busy = false;
  if (out.ok || out.error === 'again') {
    try { localStorage.setItem(ASKED, JSON.stringify([...new Set([...asked(), id])].slice(-200))); localStorage.setItem(NICK_KEY, nick); } catch {}
    ask.cls = out.ok && out.dm ? 'ok' : 'warn';
    ask.done = out.error === 'again' ? ASK_ERR.again() : out.dm
      ? tr(`신청을 보냈어요. ${r.nick} 님이 게임에서 ${nick} 님에게 귓말을 보낼 거예요.`, `Sent. ${r.nick} will whisper ${nick} in game.`)
      : tr('글쓴이에게 DM이 닿지 않았어요. 귓말로 직접 말을 거세요.', 'The DM did not reach the writer. Whisper them instead.');
    track('trade_ask', { page_type: 'trade', intent: r.intent, item_id: r.item, result: out.ok ? (out.dm ? 'ok' : 'nodm') : 'again' });
  } else {
    ask.msg = (ASK_ERR[out.error] || (() => (status === 503 ? ERR.paused() : tr('신청을 보내지 못했어요. 잠시 뒤 다시 누르세요.', 'Could not send. Please try again.'))))();
    if (out.error === 'gone') posts = posts.filter((x) => x.id !== id);
  }
  drawBoard();
}
async function submit(e) {
  e.preventDefault();
  const status = $('tb-status'), nick = $('tb-nick').value.replace(/\s+/g, ' ').trim();
  status.className = 'trd-post-status';
  const fail = (msg, el) => { status.textContent = msg; status.classList.add('bad'); el?.focus(); };
  if (!item) return fail(tr('아이템을 먼저 고르세요.', 'Pick an item first.'), $('trd-q'));
  if (!price) return fail(tr('값을 적으세요.', 'Type a price.'), $('tb-price'));
  if (nick.length < 2 || nick.length > 20 || /[@<>`]/.test(nick)) return fail(ERR.nick(), $('tb-nick'));
  const body = { nick, intent, item: item.id, price, text: $('tb-note').value.replace(/\s+/g, ' ').trim(), channel: $('tb-ch').value ? Number($('tb-ch').value) : null, lang: ko ? 'ko' : 'en' };
  // Discord connected and the box ticked: the post remembers its writer, so trade requests reach them by DM.
  const a = dmReady ? acct() : null, wantDm = !!a && document.querySelector('#tb-dm-on')?.checked !== false;
  $('tb-send').disabled = true; status.textContent = '';
  try {
    const r = await fetch(`${api}/free-megas`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(wantDm ? { Authorization: `Bearer ${a.token}` } : {}) }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.row) return fail((ERR[out.error] || (() => (r.status === 503 ? ERR.paused() : tr('올리지 못했어요. 잠시 뒤 다시 올리세요.', 'Could not post. Please try again.'))))());
    const keys = myKeys(); keys[out.row.id] = out.key;
    try { localStorage.setItem(KEYS, JSON.stringify(Object.fromEntries(Object.entries(keys).slice(-30)))); localStorage.setItem(NICK_KEY, nick); localStorage.setItem(CH_KEY, $('tb-ch').value); if (a) localStorage.setItem(DM_OFF, wantDm ? '0' : '1'); } catch {}
    dropDraft();
    addPosts([out.row]); drawBoard();
    dispatchEvent(new CustomEvent('gms-free', { detail: [out.row] }));
    $('tb-note').value = '';
    status.textContent = out.row.dm ? tr('올렸어요! 거래 신청이 오면 디스코드 DM으로 알려 드려요.', 'Posted! A Discord DM will tell you when someone asks to trade.')
      : wantDm ? tr('올렸어요. 디스코드 연결이 풀려서 DM은 꺼져 있어요. 위 계정 버튼으로 다시 연결하세요.', 'Posted. The Discord login expired, so DMs are off. Log in again from the account button.')
      : dmReady && !a ? tr('올렸어요! 디스코드를 연결하면 다음 글부터 거래 신청을 DM으로 받아요.', 'Posted! Connect Discord and your next post gets trade requests by DM.')
      : tr('올렸어요! 아래 목록과 실시간 확성기에 떴어요.', 'Posted! It is on the list below and on the megaphone page.');
    status.classList.add('ok');
    $('tb-sort').value = 'new'; filter = 'all'; for (const x of $('tb-filter').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.v === 'all')); drawBoard();
    document.getElementById(`p-${out.row.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    track('trade_post', { page_type: 'trade', intent, item_id: item.id, dm: out.row.dm ? 1 : 0 });
  } catch { fail(tr('올리지 못했어요. 잠시 뒤 다시 올리세요.', 'Could not post. Please try again.')); } finally { $('tb-send').disabled = false; }
}
async function onBoardClick(e) {
  const w = e.target.closest('[data-whisper]'), del = e.target.closest('[data-del]'), rep = e.target.closest('[data-report]'), open = e.target.closest('[data-ask]');
  if (open) {
    const id = Number(open.dataset.ask);
    ask = ask?.id === id ? null : { id, nick: stored(NICK_KEY), ch: '', msg: '' };
    drawBoard();
    if (ask) { document.querySelector('.trd-req [name="nick"]')?.focus({ preventScroll: true }); track('trade_ask_open', { page_type: 'trade' }); }
  } else if (e.target.closest('[data-ask-close]')) { ask = null; drawBoard(); }
  else if (w) {
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
  $('tb-shop-list').addEventListener('click', (e) => { const b = e.target.closest('[data-shop]'); if (b) openShop(shops[Number(b.dataset.shop)]); });
  $('tb-list').addEventListener('click', (e) => { const b = e.target.closest('[data-open-shop]'); if (b) openShop(shops[Number(b.dataset.openShop)]); });
  $('tb-shops-more').addEventListener('click', () => { shopsAll = !shopsAll; drawShops(); });
  $('tb-shopdlg').addEventListener('click', (e) => {
    if (e.target === e.currentTarget || e.target.closest('[data-close]')) { e.currentTarget.close(); return; }
    const w = e.target.closest('[data-whisper]');
    if (w) navigator.clipboard?.writeText(`/w ${w.dataset.whisper} `).then(() => { const old = w.textContent; w.textContent = tr('복사됨', 'Copied'); setTimeout(() => (w.textContent = old), 1200); }).catch(() => {});
  });
  $('tb-list').addEventListener('submit', (e) => { const f = e.target.closest('[data-ask-form]'); if (f) { e.preventDefault(); sendAsk(f); } });
  $('tb-list').addEventListener('input', (e) => { if (ask && e.target.closest('.trd-req')) { if (e.target.name === 'nick') ask.nick = e.target.value; if (e.target.name === 'ch') ask.ch = e.target.value; } });
  $('tb-dm').addEventListener('click', (e) => { if (e.target.closest('#tb-dm-login')) { saveDraft(); track('trade_dm_login', { page_type: 'trade' }); } });
  // Logged in or out in the header (or in another tab): the Discord row follows.
  addEventListener('storage', (e) => { if (e.key === 'gms-account') drawDm(); });
  addEventListener('focus', drawDm);
  $('tb-form').addEventListener('focusin', drawDm);
  setTimeout(drawDm, 2500);
  $('tb-search').addEventListener('input', drawBoard);
  $('tb-sort').addEventListener('change', drawBoard);
  for (const b of document.querySelectorAll('[data-tb-open]')) b.addEventListener('click', () => openForm());
  $('tb-close').addEventListener('click', () => { $('tb-form').hidden = true; dropDraft(); });
  $('tb-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; filter = b.dataset.v; for (const x of $('tb-filter').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); drawBoard(); });
  addEventListener('gms-free-gone', (e) => { posts = posts.filter((r) => r.id !== e.detail); drawBoard(); });
  poll(); setInterval(poll, 60000);
  // Shops: the worker rebuilds the list every 5 minutes; a page left open follows it.
  setInterval(loadShops, 5 * 60000);
  setInterval(() => { for (const t of document.querySelectorAll('#tb-list time')) { const r = posts.find((x) => `p-${x.id}` === t.closest('.trd-line-row')?.id); if (r) t.textContent = ago(r.at); } }, 60000);
  let rows, catalog;
  try { [rows, catalog] = await Promise.all([getJson(root.dataset.items), getJson(`${api}/market/catalog`).catch(() => ({ items: [] }))]); } catch { return; }
  summary = new Map(catalog.items.map((r) => [r.item, r]));
  const index = makeMarketIndex(rows, ko ? 'ko' : 'en');
  byId = new Map(index.map((it) => [it.id, it]));
  picker({ input: $('trd-q'), list: $('trd-opts'), index, allow: () => true, onPick: (it) => choose(it), first: (it) => summary.has(it.id),
    note: (it) => { const s = summary.get(it.id); return s?.median ? money(s.median) : ''; } });
  drawBoard();
  loadShops();
  const p = new URLSearchParams(location.search), first = byId.get(Number(p.get('item')));
  if (p.get('kind') === 'buy') setIntent('buy');
  // Back from connecting Discord: the form as it was left.
  const draft = readDraft();
  if (draft && !first) {
    setIntent(draft.intent === 'buy' ? 'buy' : 'sell');
    $('tb-nick').value = draft.nick || $('tb-nick').value; $('tb-ch').value = draft.ch || ''; $('tb-note').value = draft.note || '';
    const it = byId.get(draft.item);
    if (it) { $('trd-q').value = it.name; choose(it, draft.price || undefined); }
    openForm(false);
  } else if (first) { $('trd-q').value = first.name; $('tb-form').hidden = false; choose(first, Number(p.get('price')) > 0 ? Number(p.get('price')) : undefined); }
  else if (location.hash === '#post' || p.has('kind') || p.has('post')) openForm(false);
}
boot();
