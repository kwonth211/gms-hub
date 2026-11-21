// "내 상점 페이지" (owner 2026-11-19): one shareable page per seller, /<lang>/shop/?n=<name>. It lists what that seller is
// selling now (open listings from scans and the collector), where the shop is, each price next to the market price,
// and gives the seller a link and a ready-made line to paste into Discord or a community post. Read-only; no login.
import { itemAttrs } from './item-attrs.js';
import { optBadge, loadTips } from './opt-grade.js';
import { placeLabel } from './place.js';

const root = document.getElementById('shop-page');
const api = document.body.dataset.priceApi;
const ko = document.documentElement.lang === 'ko';
const tr = (k, e) => (ko ? k : e);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US');
const won = (n) => (ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf.format(n)) : nf.format(n));
const SELLER = /^[A-Za-z0-9]{4,13}$/;
const parseUtc = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
const ago = (s) => {
  const m = Math.max(0, Math.round((Date.now() - parseUtc(s)) / 60000));
  return m < 1 ? tr('방금', 'just now') : m < 60 ? tr(`${m}분 전`, `${m} min ago`) : m < 1440 ? tr(`${Math.round(m / 60)}시간 전`, `${Math.round(m / 60)} h ago`) : tr(`${Math.round(m / 1440)}일 전`, `${Math.round(m / 1440)} d ago`);
};
const place = (ch, room) => `CH ${ch} · ${placeLabel(Number(room), ko)}`;
const track = (name, params) => window.track?.(name, params);

function askName(msg = '') {
  root.querySelector('[data-shop-body]').innerHTML = `<form class="shop-ask" data-shop-form>
<label>${tr('캐릭터 이름', 'Character name')}<input name="n" maxlength="13" autocomplete="off" placeholder="${tr('예: hookstk', 'e.g. hookstk')}" required></label>
<button class="btn" type="submit">${tr('상점 보기', 'Open shop')}</button>${msg ? `<p class="shop-msg">${esc(msg)}</p>` : ''}
</form>`;
  root.querySelector('[data-shop-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!SELLER.test(n)) return askName(tr('영문·숫자 4~13자로 적어 주세요.', 'Use 4 to 13 letters or digits.'));
    location.search = `?n=${encodeURIComponent(n)}`;
  });
}

async function show(name) {
  const body = root.querySelector('[data-shop-body]');
  body.innerHTML = `<div aria-busy="true" aria-label="${tr('상점을 불러오는 중…', 'Loading the shop…')}"></div>`;
  let data;
  try {
    const r = await fetch(`${api}/market/listings?${new URLSearchParams({ seller: name, exact: 1, state: 'open', sort: 'price', limit: 100 })}`);
    data = r.ok ? await r.json() : null;
  } catch (e) { data = null; }
  if (!data) { body.innerHTML = `<p class="shop-msg">${tr('지금은 상점을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.', 'The shop could not be loaded right now. Try again shortly.')}</p>`; return; }
  const rows = data.rows || [];
  track('shop_page_view', { seller_found: rows.length ? 1 : 0, listings: rows.length });
  if (!rows.length) {
    body.innerHTML = `<div class="shop-empty"><p><strong>${esc(name)}</strong>${tr('의 상점에서 최근 24시간 안에 확인된 매물이 없어요.', ' has no listings seen in the last 24 hours.')}</p>
<p>${tr('상점 스캔으로 내 상점을 올리면 바로 여기에 보여요.', 'Scan your shop and it shows up here right away.')}</p>
<p><a class="btn" href="../tools/scan/">${tr('내 상점 올리기', 'Upload my shop')}</a></p></div>`;
    return;
  }
  // The shop is where its newest listing was seen; listings elsewhere (an older spot) are listed under it.
  const newest = [...rows].sort((a, b) => parseUtc(b.seen) - parseUtc(a.seen))[0];
  const here = rows.filter((r) => r.channel === newest.channel && r.room === newest.room);
  const tips = await loadTips();
  const ids = [...new Set(rows.map((r) => r.item))];
  let prices = {};
  try { prices = await fetch(`${api}/prices?ids=${ids.slice(0, 100).join(',')}`).then((r) => (r.ok ? r.json() : {})); } catch (e) {}
  const nameOf = (id) => { const t = tips?.items?.[id]; return t ? (ko && t[0] ? t[0] : t[1]) : `#${id}`; };
  // The short link gives chat apps a preview of what is on sale (worker src/shop-preview.js).
  const url = `${location.origin}/s/${encodeURIComponent(name)}${ko ? '' : '?lang=en'}`;
  const line = tr(`🛒 ${name} 상점 · ${place(newest.channel, newest.room)} · ${here.length}개 판매 중 → ${url}`, `🛒 ${name}'s shop · ${place(newest.channel, newest.room)} · ${here.length} items → ${url}`);
  const card = (r) => {
    const m = prices?.[r.item]?.median;
    const diff = m ? Math.round(((r.price - m) / m) * 100) : null;
    const tag = diff == null ? '' : diff <= -10 ? `<b class="shop-tag cheap">${tr(`시세보다 ${-diff}% 쌈`, `${-diff}% under market`)}</b>` : diff >= 10 ? `<b class="shop-tag pricey">${tr(`시세보다 ${diff}% 비쌈`, `${diff}% over market`)}</b>` : `<b class="shop-tag fair">${tr('시세 수준', 'At market')}</b>`;
    const opt = r.opts ? optBadge(r.item, r.opts, tips) : null;
    const elsewhere = r.channel !== newest.channel || r.room !== newest.room;
    return `<li class="shop-item${r.goneN ? ' is-gone' : ''}"><a href="../tools/market/?item=${r.item}" ${itemAttrs(r.item, r.opts || null, 'listing')}>
<img src="https://maplestory.io/api/MCW/1/item/${r.item}/icon" width="36" height="36" alt="" loading="lazy">
<span class="shop-name"><strong>${esc(nameOf(r.item))}</strong>${opt ? `<em class="${esc(opt.cls)}">${esc(opt.text)}</em>` : ''}<small>${elsewhere ? `${place(r.channel, r.room)} · ` : ''}${ago(r.seen)}${r.goneN ? ` · ${tr('팔렸다는 신고 있음', 'reported sold')}` : ''}</small></span>
<span class="shop-price"><strong>${won(r.price)}</strong>${r.qty > 1 ? `<small>×${nf.format(r.qty)}</small>` : ''}${m ? `<small>${tr('시세', 'market')} ${won(m)}</small>` : ''}${tag}</span></a></li>`;
  };
  // The shop as it stands now first; listings seen at an earlier spot (the seller moved) folded away under it.
  const other = rows.filter((r) => !here.includes(r));
  body.innerHTML = `<header class="shop-head">
<div><h2>${esc(name)}${tr('의 상점', "'s shop")}</h2><p class="shop-where"><span class="shop-ch">${place(newest.channel, newest.room)}</span> ${tr(`판매 중 ${here.length}개 · 마지막 확인 ${ago(newest.seen)}`, `${here.length} for sale · last seen ${ago(newest.seen)}`)}</p></div>
<div class="shop-share"><button type="button" class="btn" data-copy="${esc(url)}" data-what="link">${tr('🔗 링크 복사', '🔗 Copy link')}</button><button type="button" class="btn ghost" data-copy="${esc(line)}" data-what="line">${tr('📋 홍보 문구 복사', '📋 Copy post text')}</button></div>
</header>
<p class="shop-preview">${esc(line)}</p>
<ul class="shop-items">${here.map(card).join('')}</ul>
${other.length ? `<details class="shop-other"><summary>${tr(`예전 위치에서 본 매물 ${other.length}개`, `${other.length} listings seen at earlier spots`)}</summary><ul class="shop-items">${other.map(card).join('')}</ul></details>` : ''}
<p class="muted small">${tr('최근 24시간 안에 상점 스캔이나 수집기로 확인된 매물이에요. 가격은 판매자가 건 가격이고, 시세는 같은 아이템의 판매 중 중앙값이에요.', 'Listings seen by shop scans or the collector in the last 24 hours. Prices are what the seller asks; market is the median asking price of the same item.')}</p>`;
}

root?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  let ok = false;
  try { await navigator.clipboard.writeText(b.dataset.copy); ok = true; } catch (x) {}
  const old = b.textContent;
  b.textContent = ok ? tr('✓ 복사했어요', '✓ Copied') : tr('복사 실패', 'Copy failed');
  setTimeout(() => { b.textContent = old; }, 1600);
  track('shop_link_copy', { what: b.dataset.what, result: ok ? 'ok' : 'fail' });
});

if (root) {
  const n = new URLSearchParams(location.search).get('n')?.trim() || '';
  if (SELLER.test(n)) show(n); else askName();
}
