// Owner-only review of scam reports (/admin/scam/): visitor reports waiting to be shown, take-down requests, names the
// rule holds back (unknown character or loose wording from one caller), and what is on the list. Talks to the worker's
// /internal/scam with the owner key the traffic dashboard already keeps in this browser.
const cfg = JSON.parse(document.getElementById('scam-admin-config').textContent);
const root = document.getElementById('scam-admin-root');
const KEY = 'gms-traffic-key';
const store = {
  get: () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
  set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} }
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (s) => new Date(`${String(s).replace(' ', 'T')}Z`).toLocaleString('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
let data = null, error = '', busy = false;

async function call(body) {
  busy = true; draw();
  try {
    const r = await fetch(`${cfg.api}/internal/scam`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: store.get(), ...body }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 403) { store.set(''); error = '열쇠가 맞지 않아요.'; data = null; }
    else if (!r.ok) error = `실패: ${d.error || r.status}`;
    else { error = ''; if (d.reports) data = d; else if (d.read != null) { error = `고확 ${d.read}개를 다시 읽어 신고 ${d.added}건을 새로 넣었어요.`; return call({ action: 'list' }); } }
  } catch (e) { error = '서버에 닿지 못했어요.'; }
  busy = false; draw();
}

const quotes = (n) => `<ul class="sa-q">${(n.quotes || []).map((q) => `<li><b>${esc(q.by || '사이트 제보')}</b> <small>${when(q.at)}</small> ${esc(q.text)}</li>`).join('')}</ul>`;
const VER = { 1: '캐릭터 있음', 0: '아직 확인 안 됨', '-1': '캐릭터 없음' };
function nickRow(n, buttons) {
  return `<li class="sa-row"><div class="sa-head"><strong>${esc(n.nick)}</strong><span>신고 ${n.n}번 · 외친 사람 ${n.by}명 · ${VER[n.verified]}${n.strong ? '' : ' · 느슨한 문장'}${n.note ? ` · ${esc(n.note)}` : ''}</span>
<span class="sa-btns">${buttons.map(([state, label]) => `<button type="button" class="btn ghost" data-nick="${esc(n.key)}" data-state="${state}">${label}</button>`).join('')}</span></div>${quotes(n)}</li>`;
}

function draw() {
  if (!store.get()) {
    root.innerHTML = `<section class="panel sa-key"><h1>사기 신고 관리</h1><p>트래픽 화면에서 쓰는 운영자 열쇠를 넣어 주세요.</p>
<form id="sa-key-form"><input type="password" name="key" autocomplete="off" placeholder="운영자 열쇠"><button class="btn">열기</button></form>${error ? `<p class="sa-err">${esc(error)}</p>` : ''}</section>`;
    return;
  }
  if (!data) { root.innerHTML = `<section class="panel"><h1>사기 신고 관리</h1><div aria-busy="true"></div>${error ? `<p class="sa-err">${esc(error)}</p>` : ''}</section>`; return; }
  root.innerHTML = `<h1>사기 신고 관리</h1>${error ? `<p class="sa-err">${esc(error)}</p>` : ''}
<p class="sa-top"><a href="/ko/scam/" target="_blank" rel="noopener">공개 페이지 보기</a><button type="button" class="btn ghost" data-act="list">새로 고침</button><button type="button" class="btn ghost" data-act="backfill">남아 있는 고확 다시 읽기</button>${busy ? '<span>처리 중…</span>' : ''}</p>
<section class="panel"><h2>유저 제보 (기다리는 것 ${data.reports.length}건)</h2>
${data.reports.length ? `<ul class="sa-list">${data.reports.map((r) => `<li class="sa-row"><div class="sa-head"><strong>${esc(r.key)}</strong><span>${when(r.at)}${r.me ? ` · 보낸 사람 ${esc(r.me)}` : ''}</span>
<span class="sa-btns"><button type="button" class="btn" data-report="${r.id}" data-ok="1">올리기</button><button type="button" class="btn ghost" data-report="${r.id}" data-ok="0">버리기</button></span></div><p>${esc(r.text)}</p></li>`).join('')}</ul>` : '<p class="muted">없어요.</p>'}</section>
<section class="panel"><h2>내려 달라는 신청 (기다리는 것 ${data.appeals.length}건)</h2>
${data.appeals.length ? `<ul class="sa-list">${data.appeals.map((a) => `<li class="sa-row"><div class="sa-head"><strong>${esc(a.nick)}</strong><span>${when(a.at)}${a.contact ? ` · 연락처 ${esc(a.contact)}` : ''}</span>
<span class="sa-btns"><button type="button" class="btn" data-appeal="${a.id}" data-grant="1">내리기</button><button type="button" class="btn ghost" data-appeal="${a.id}" data-grant="0">그대로 두기</button></span></div><p>${esc(a.message)}</p></li>`).join('')}</ul>` : '<p class="muted">없어요.</p>'}</section>
<section class="panel"><h2>자동으로 안 올라간 닉네임 (${data.held.length}명)</h2><p class="muted small">캐릭터가 확인 안 됐거나, 한 사람이 느슨한 문장으로만 외친 닉네임이에요. 읽어 보고 맞으면 올리세요.</p>
<ul class="sa-list">${data.held.map((n) => nickRow(n, [['shown', '올리기'], ['hidden', '숨기기']])).join('')}</ul></section>
<section class="panel"><h2>목록에 올라간 닉네임 (${data.listed.length}명)</h2><ul class="sa-list">${data.listed.map((n) => nickRow(n, [['hidden', '내리기']])).join('')}</ul></section>
<section class="panel"><h2>내린 닉네임 (${data.hidden.length}명)</h2><ul class="sa-list">${data.hidden.map((n) => nickRow(n, [['auto', '되돌리기']])).join('')}</ul></section>
<p><button type="button" class="btn ghost" data-act="logout">이 브라우저에서 열쇠 지우기</button></p>`;
}

root.addEventListener('submit', (e) => {
  if (e.target.id !== 'sa-key-form') return;
  e.preventDefault();
  store.set(e.target.key.value.trim());
  call({ action: 'list' });
});
root.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || busy) return;
  if (b.dataset.act === 'logout') { store.set(''); data = null; draw(); }
  else if (b.dataset.act) call({ action: b.dataset.act });
  else if (b.dataset.report) call({ action: 'report', id: Number(b.dataset.report), ok: b.dataset.ok === '1' });
  else if (b.dataset.appeal) call({ action: 'appeal', id: Number(b.dataset.appeal), grant: b.dataset.grant === '1' });
  else if (b.dataset.nick) call({ action: 'nick', key: b.dataset.nick, state: b.dataset.state });
});
if (store.get()) call({ action: 'list' }); else draw();
