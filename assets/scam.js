// /scam/: the list of names warned about over megaphones (worker /scam), a search box, and the two forms (report a
// scammer, take my name down). Both forms only queue a message for the owner; nothing a visitor sends is shown at once.
const root = document.getElementById('sc-page');
const ko = document.documentElement.lang === 'ko';
const lang = document.documentElement.lang;
const api = document.body.dataset.priceApi;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (k, e, vars = {}) => (ko ? k : typeof tx === 'function' ? tx(e, vars) : e).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const send = (name, params) => { try { if (typeof track === 'function') track(name, params); } catch (e) {} };

const at = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
function ago(s) {
  const m = Math.max(0, Math.round((Date.now() - at(s)) / 60000));
  if (m < 60) return tr('{n}분 전', '{n} min ago', { n: Math.max(1, m) });
  if (m < 1440) return tr('{n}시간 전', '{n} h ago', { n: Math.round(m / 60) });
  return tr('{n}일 전', '{n} d ago', { n: Math.round(m / 1440) });
}
const stamp = (s) => new Date(at(s)).toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

let rows = [];

function quote(q) {
  const who = q.src === 'user' ? `<b class="sc-by sc-site">${tr('사이트 제보', 'Site report')}</b>` : `<b class="sc-by">${esc(q.by)}</b>`;
  return `<li><span class="sc-q-meta">${who}${Number(q.ch) ? `<span class="sc-ch">CH${String(Number(q.ch)).padStart(2, '0')}</span>` : ''}<time datetime="${new Date(at(q.at)).toISOString()}">${stamp(q.at)}</time></span><q>${esc(q.text)}</q></li>`;
}
function card(r) {
  const more = r.n - r.quotes.length;
  return `<li class="sc-row${r.by >= 2 ? ' sc-many' : ''}" id="s-${esc(r.nick.toLowerCase())}">
<div class="sc-head"><strong class="sc-nick" translate="no">${esc(r.nick)}</strong>
<span class="sc-tally"><b>${r.by === 1 ? tr('외친 사람 1명', '1 caller') : tr('외친 사람 {n}명', '{n} callers', { n: r.by })}</b> · ${r.n === 1 ? tr('신고 1번', '1 report') : tr('신고 {n}번', '{n} reports', { n: r.n })} · ${tr('마지막 {t}', 'last {t}', { t: ago(r.last) })}</span>
<button type="button" class="sc-mine" data-nick="${esc(r.nick)}">${tr('내 닉네임이에요', 'This is me')}</button></div>
<ul class="sc-quotes">${r.quotes.map(quote).join('')}</ul>${more > 0 ? `<p class="muted small sc-more">${tr('같은 신고 {n}번 더', '{n} more like these', { n: more })}</p>` : ''}</li>`;
}

function render() {
  const q = $('sc-search').value.trim().toLowerCase();
  const list = q ? rows.filter((r) => r.nick.toLowerCase().includes(q)) : rows;
  const el = $('sc-list'), none = $('sc-none');
  el.removeAttribute('aria-busy');
  el.innerHTML = list.slice(0, 200).map(card).join('');
  $('sc-count').textContent = q ? tr('{n}명 찾음', '{n} found', { n: list.length }) : tr('신고된 닉네임 {n}명', '{n} names reported', { n: rows.length });
  none.hidden = list.length > 0;
  if (!list.length) none.textContent = q
    ? tr("'{q}'(으)로 올라온 신고가 없어요. 그래도 교환창은 끝까지 읽고 확인을 누르세요.", "No report under '{q}'. Still read the trade window to the end before you press OK.", { q })
    : tr('아직 올라온 신고가 없어요.', 'No reports yet.');
}

async function load() {
  try {
    const d = await fetch(`${api}/scam`).then((r) => r.json());
    rows = d.rows || [];
  } catch (e) { rows = []; }
  render();
  // /scam/#s-<name> or ?n=<name> (from the megaphone page) opens on that name.
  const want = (new URLSearchParams(location.search).get('n') || '').toLowerCase();
  if (want) { $('sc-search').value = want; render(); }
}

let typed;
$('sc-search').addEventListener('input', () => { render(); clearTimeout(typed); typed = setTimeout(() => { if ($('sc-search').value.trim()) send('scam_search', { found: $('sc-list').children.length }); }, 1200); });

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
