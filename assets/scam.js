// /scam/: names warned about over megaphones (worker /scam). Fills the four numbers in the head, the strip of names
// several players called out, the cards (character picture, how many callers, what kind of scam, the lines as shouted),
// the kind filter and the search verdict, and runs the two forms (report a scammer, take my name down). Both forms only
// queue a message for the owner; nothing a visitor sends is shown at once.
const root = document.getElementById('sc-page');
const ko = document.documentElement.lang === 'ko';
const lang = document.documentElement.lang;
const api = document.body.dataset.priceApi;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (k, e, vars = {}) => (ko ? k : typeof tx === 'function' ? tx(e, vars) : e).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const send = (name, params) => { try { if (typeof track === 'function') track(name, params); } catch (e) {} };
const nf = new Intl.NumberFormat(lang);

const at = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
function ago(s) {
  const m = Math.max(0, Math.round((Date.now() - at(s)) / 60000));
  if (m < 60) return tr('{n}분 전', '{n} min ago', { n: Math.max(1, m) });
  if (m < 1440) return tr('{n}시간 전', '{n} h ago', { n: Math.round(m / 60) });
  return tr('{n}일 전', '{n} d ago', { n: Math.round(m / 1440) });
}
const stamp = (s) => new Date(at(s)).toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

// Kinds of scam the worker reads from the lines (scam.js scamKinds), in the order the chips are shown.
const KIND = {
  spot: () => tr('자리', 'Spot'), fame: () => tr('인기도', 'Fame'), scroll: () => tr('주문서', 'Scroll'), switch: () => tr('바꿔치기', 'Switch'),
  bundle: () => tr('묶음', 'Bundle'), price: () => tr('가격 장난', 'Price trick'), rmt: () => tr('현금 거래', 'Real money')
};
// Korean job names, as on the ranking page; other languages keep the game's English names.
const JOB_KO = { Beginner: '초보자', Swordsman: '검사', Archer: '아처', Magician: '매지션', Thief: '로그', Pirate: '해적',
  Fighter: '파이터', Page: '페이지', Spearman: '스피어맨', Hunter: '헌터', Crossbowman: '사수', Cleric: '클레릭',
  'Wizard (Fire/Poison)': '위자드(불,독)', 'Wizard (Ice/Lightning)': '위자드(썬,콜)', Assassin: '어쌔신', Bandit: '시프',
  Brawler: '인파이터', Gunslinger: '건슬링거' };
const jobName = (j) => (ko ? JOB_KO[j] || j : j);
const profile = (name) => `https://classicrank.com/user/${encodeURIComponent(name)}`;
// 1 caller, 2, 3 or more: how loud the card is.
const tier = (r) => (r.by >= 3 ? 3 : r.by >= 2 ? 2 : 1);

let rows = [];
const view = { kind: 'all', sort: 'last' };

const avatar = (r, size) => `<a class="sc-ava" href="${esc(profile(r.nick))}" target="_blank" rel="noopener" title="${esc(tr('캐릭터 정보 보기', 'Open character profile'))}">${r.photo
  ? `<img src="${esc(r.photo)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'sc-ava-none',textContent:'?'}))">`
  : '<span class="sc-ava-none">?</span>'}</a>`;
const chips = (r) => (r.kinds || []).filter((k) => KIND[k]).map((k) => `<span class="sc-chip sc-k-${k}">${KIND[k]()}</span>`).join('');
const who = (r) => [r.level ? `Lv. ${r.level}` : '', r.job ? jobName(r.job) : ''].filter(Boolean).join(' · ');

function quote(q) {
  const by = q.src === 'user' ? `<b class="sc-by sc-site">${tr('사이트 제보', 'Site report')}</b>` : `<b class="sc-by" translate="no">${esc(q.by)}</b>`;
  return `<li class="sc-q"><span class="sc-q-meta">${by}${Number(q.ch) ? `<span class="sc-ch">CH${String(Number(q.ch)).padStart(2, '0')}</span>` : ''}<time datetime="${new Date(at(q.at)).toISOString()}">${stamp(q.at)}</time></span><q translate="no">${esc(q.text)}</q></li>`;
}
function card(r) {
  const lv = tier(r), first = r.quotes.slice(0, 2), rest = r.quotes.slice(2), more = r.n - r.quotes.length;
  return `<li class="sc-row sc-t${lv}" id="s-${esc(r.nick.toLowerCase())}">
<div class="sc-top">${avatar(r, 56)}
<div class="sc-id"><strong class="sc-nick" translate="no">${esc(r.nick)}</strong>${who(r) ? `<span class="sc-char">${esc(who(r))}</span>` : ''}<div class="sc-chips">${chips(r)}</div></div>
<div class="sc-meter" title="${esc(tr('서로 다른 사람이 외친 수', 'Different players who called this name out'))}"><b>${nf.format(r.by)}</b><span>${r.by === 1 ? tr('명이 외침', 'caller') : tr('명이 외침', 'callers')}</span><i class="sc-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<u${i <= r.by ? ' class="on"' : ''}></u>`).join('')}</i></div></div>
<ul class="sc-quotes">${first.map(quote).join('')}</ul>
${rest.length ? `<details class="sc-rest"><summary>${tr('외친 말 {n}개 더 보기', 'Show {n} more lines', { n: rest.length })}</summary><ul class="sc-quotes">${rest.map(quote).join('')}</ul>${more > 0 ? `<p class="muted small sc-more">${tr('같은 신고 {n}번 더', '{n} more like these', { n: more })}</p>` : ''}</details>` : ''}
<div class="sc-foot"><span>${r.n === 1 ? tr('신고 1번', '1 report') : tr('신고 {n}번', '{n} reports', { n: r.n })} · ${tr('마지막 {t}', 'last {t}', { t: ago(r.last) })}</span><button type="button" class="sc-mine" data-nick="${esc(r.nick)}">${tr('내 닉네임이에요', 'This is me')}</button></div></li>`;
}
// The strip on top: names two or more different players called out.
const hot = (r) => `<li><a class="sc-hot-card sc-t${tier(r)}" href="#s-${esc(r.nick.toLowerCase())}" data-nick="${esc(r.nick)}">${r.photo ? `<img src="${esc(r.photo)}" alt="" width="72" height="72" loading="lazy">` : '<span class="sc-ava-none">?</span>'}
<strong translate="no">${esc(r.nick)}</strong><span class="sc-hot-n"><b>${nf.format(r.by)}</b>${tr('명이 외침', ' callers')}</span><span class="sc-chips">${chips(r)}</span></a></li>`;

function stats() {
  const day = Date.now() - 86400000;
  const n = { names: rows.length, many: rows.filter((r) => r.by >= 2).length, reports: rows.reduce((a, r) => a + r.n, 0), day: rows.filter((r) => at(r.last) >= day).length };
  for (const el of document.querySelectorAll('[data-sc-stat]')) { el.textContent = nf.format(n[el.dataset.scStat] ?? 0); el.removeAttribute('aria-busy'); }
  const many = rows.filter((r) => r.by >= 2).sort((a, b) => b.by - a.by || b.n - a.n).slice(0, 8);
  $('sc-hot').hidden = !many.length;
  $('sc-hot-list').innerHTML = many.map(hot).join('');
  // Kind chips with how many names each has; kinds nobody was reported for are left out.
  const count = new Map();
  for (const r of rows) for (const k of r.kinds || []) count.set(k, (count.get(k) || 0) + 1);
  $('sc-kinds').innerHTML = `<button type="button" data-v="all" aria-pressed="true">${tr('전체', 'All')} <i>${nf.format(rows.length)}</i></button>` +
    Object.keys(KIND).filter((k) => count.get(k)).map((k) => `<button type="button" class="sc-k-${k}" data-v="${k}" aria-pressed="false">${KIND[k]()} <i>${nf.format(count.get(k))}</i></button>`).join('');
}

function render() {
  const q = $('sc-search').value.trim().toLowerCase();
  let list = rows.filter((r) => (view.kind === 'all' || (r.kinds || []).includes(view.kind)) && (!q || r.nick.toLowerCase().includes(q)));
  list = [...list].sort(view.sort === 'by' ? (a, b) => b.by - a.by || b.n - a.n || at(b.last) - at(a.last) : (a, b) => at(b.last) - at(a.last));
  const el = $('sc-list'), none = $('sc-none'), verdict = $('sc-verdict');
  el.removeAttribute('aria-busy');
  el.innerHTML = list.slice(0, 200).map(card).join('');
  $('sc-count').textContent = q || view.kind !== 'all' ? tr('{n}명 찾음', '{n} found', { n: list.length }) : tr('신고된 닉네임 {n}명', '{n} names reported', { n: rows.length });
  none.hidden = list.length > 0;
  if (!list.length) none.textContent = q ? tr("'{q}'(으)로 올라온 신고가 없어요.", "No report under '{q}'.", { q }) : tr('아직 올라온 신고가 없어요.', 'No reports yet.');
  // Under the search box: the answer to "is this name on the list?" in one line.
  const exact = q && rows.find((r) => r.nick.toLowerCase() === q);
  verdict.hidden = !q;
  verdict.className = `sc-verdict ${exact ? 'bad' : list.length ? 'some' : 'clear'}`;
  verdict.textContent = !q ? '' : exact
    ? tr('{nick}: {by}명이 외쳤고 신고가 {n}번 올라왔어요.', '{nick}: called out by {by}, {n} reports.', { nick: exact.nick, by: exact.by, n: exact.n })
    : list.length ? tr('비슷한 닉네임 {n}명이 있어요. 철자를 끝까지 맞춰 보세요.', '{n} similar names. Check the spelling to the last letter.', { n: list.length })
      : tr('이 닉네임으로 올라온 신고는 없어요. 그래도 교환창은 끝까지 읽고 확인을 누르세요.', 'No report under this name. Still read the trade window to the end before you press OK.');
}

async function load() {
  try {
    const d = await fetch(`${api}/scam`).then((r) => r.json());
    rows = d.rows || [];
  } catch (e) { rows = []; }
  stats();
  // ?n=<name> (from the megaphone page) opens on that name.
  const want = (new URLSearchParams(location.search).get('n') || '').toLowerCase();
  if (want) $('sc-search').value = want;
  render();
}

let typed;
$('sc-search').addEventListener('input', () => { render(); clearTimeout(typed); typed = setTimeout(() => { if ($('sc-search').value.trim()) send('scam_search', { found: $('sc-list').children.length }); }, 1200); });
function press(group, key) {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    view[key] = b.dataset.v;
    for (const x of group.querySelectorAll('button[data-v]')) x.setAttribute('aria-pressed', String(x === b));
    render();
    send('scam_filter', { [key]: b.dataset.v });
  });
}
press($('sc-kinds'), 'kind');
press($('sc-sort'), 'sort');

// A name in the strip jumps to its card, clearing any filter that would hide it.
$('sc-hot-list').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nick]');
  if (!a) return;
  e.preventDefault();
  view.kind = 'all';
  for (const x of $('sc-kinds').querySelectorAll('button[data-v]')) x.setAttribute('aria-pressed', String(x.dataset.v === 'all'));
  $('sc-search').value = '';
  render();
  const target = document.getElementById(`s-${a.dataset.nick.toLowerCase()}`);
  if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('sc-flash'); setTimeout(() => target.classList.remove('sc-flash'), 1600); }
});

// "This is me" fills the take-down form with that name.
$('sc-list').addEventListener('click', (e) => {
  const b = e.target.closest('.sc-mine');
  if (!b) return;
  const f = $('sc-appeal-form');
  f.nick.value = b.dataset.nick;
  $('sc-appeal').scrollIntoView({ behavior: 'smooth', block: 'start' });
  f.message.focus({ preventScroll: true });
});

const ERR = {
  nick: () => tr('닉네임은 영어와 숫자 2~13자예요.', 'A game name is 2 to 13 letters and digits.'),
  me: () => tr('내 닉네임은 영어와 숫자 2~13자예요.', 'Your game name is 2 to 13 letters and digits.'),
  short: () => tr('10자 넘게 적어 주세요.', 'Write at least 10 characters.'),
  link: () => tr('링크는 넣을 수 없어요.', 'Links are not allowed.'),
  daily: () => tr('오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요.', 'That is the limit for today. Send it tomorrow.'),
  other: () => tr('보내지 못했어요. 조금 뒤에 다시 눌러 주세요.', 'It did not send. Press again in a moment.')
};
function wire(form, path, body, done, event) {
  const status = form.querySelector('.sc-status'), button = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true; status.textContent = '';
    try {
      const r = await fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(form)) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { status.textContent = done(); form.reset(); send(event); }
      else status.textContent = (ERR[d.error] || ERR.other)();
    } catch (x) { status.textContent = ERR.other(); }
    button.disabled = false;
  });
}
wire($('sc-report-form'), '/scam/report', (f) => ({ nick: f.nick.value.trim(), text: f.text.value.trim(), me: f.me.value.trim() }),
  () => tr('받았어요. 운영자가 읽어 본 뒤에 목록에 올려요.', 'Got it. It goes on the list after the site owner has read it.'), 'scam_report');
wire($('sc-appeal-form'), '/scam/appeal', (f) => ({ nick: f.nick.value.trim(), message: f.message.value.trim(), contact: f.contact.value.trim() }),
  () => tr('받았어요. 운영자가 읽고 처리해요.', 'Got it. The site owner will read it and act on it.'), 'scam_appeal');

if (root) load();
