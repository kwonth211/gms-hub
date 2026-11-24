// Owner inbox for the help widget (/admin/support/): threads of logged-in visitors, newest waiting first, with answers.
// Messages from visitors without a login are only in the private Discord channel. Same key as the traffic dashboard.
const cfg = JSON.parse(document.getElementById('support-admin-config').textContent);
const root = document.getElementById('support-admin-root');
const KEY = 'gms-traffic-key';
const store = { get: () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }, set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} } };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (t) => new Date(t).toLocaleString('ko', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const KINDS = { bug: '오류 신고', data: '정보 제보', idea: '건의', ask: '문의' };
let threads = null, uid = null, list = null, msg = '', text = '';
async function call(body) {
  const r = await fetch(`${cfg.api}/internal/support`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: store.get(), ...body }) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  if (r?.status === 403) { store.set(''); msg = '열쇠가 맞지 않아요.'; threads = null; }
  else if (!r?.ok) msg = `실패: ${d?.error || r?.status || '서버에 닿지 못했어요'}`;
  else { msg = ''; return d; }
  return null;
}
async function refresh() { const d = await call({ action: 'list' }); if (d) threads = d.threads; draw(); }
async function pick(id) { uid = id; list = null; draw(); const d = await call({ action: 'thread', uid }); if (d) list = d.list; draw(); }
function draw() {
  if (!store.get()) { root.innerHTML = `<section class="panel sa-key"><h1>문의함</h1><p>트래픽 화면에서 쓰는 운영자 열쇠를 넣어 주세요.</p><form data-f="key"><input type="password" name="key" autocomplete="off" placeholder="운영자 열쇠"><button class="btn">열기</button></form>${msg ? `<p class="sa-err">${esc(msg)}</p>` : ''}</section>`; return; }
  root.innerHTML = `<h1>문의함</h1><p class="sa-top"><button type="button" class="btn ghost" data-act="list">새로 고침</button></p>${msg ? `<p class="sa-err">${esc(msg)}</p>` : ''}
<div class="su-grid"><section class="panel"><h2>로그인한 사람의 문의</h2>${!threads ? '<div aria-busy="true"></div>' : threads.length ? `<ul class="su-list">${threads.map((t) => `<li><button type="button" data-uid="${esc(t.uid)}"${t.uid === uid ? ' aria-current="true"' : ''}><b>${esc(t.name || t.uid)}</b>${t.waiting ? ` <span class="td-flag">${t.waiting}</span>` : ''}<small>${when(t.at)} · ${t.n}개</small></button></li>`).join('')}</ul>` : '<p class="muted">아직 없어요. 비회원 문의는 디스코드 문의함 채널에만 와요.</p>'}</section>
<section class="panel">${!uid ? '<p class="muted">왼쪽에서 고르세요.</p>' : !list ? '<div aria-busy="true"></div>' : `<ol class="sp-log">${list.map((m) => `<li class="${m.who === 'staff' ? 'is-me' : 'is-staff'}"><small>${m.who === 'staff' ? '내 답변' : esc(KINDS[m.kind] || '')} · ${when(m.at)}${m.page ? ` · <a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.page)}</a>` : ''}${m.env ? ` · ${esc(m.env)}` : ''}</small><p>${esc(m.text)}</p></li>`).join('')}</ol>
<form data-f="reply" class="sp-form"><textarea name="text" rows="5" maxlength="1000" required placeholder="답변"></textarea><div class="sp-acts"><button type="button" class="btn ghost" data-act="done">답변 없이 끝내기</button><button class="btn">답변 보내기</button></div></form>`}</section></div>`;
  const a = root.querySelector('textarea'); if (a) { a.value = text; a.oninput = () => { text = a.value; }; }
}
root.addEventListener('click', async (e) => {
  const u = e.target.closest('[data-uid]'); if (u) { text = ''; return pick(u.dataset.uid); }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'list') refresh();
  if (act === 'done') { await call({ action: 'done', uid }); refresh(); }
});
root.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.dataset.f === 'key') { store.set(e.target.key.value.trim()); return refresh(); }
  const d = await call({ action: 'reply', uid, text });
  if (!d) return draw();
  text = ''; msg = d.dm ? '보냈어요. 디스코드 메시지도 갔어요.' : '보냈어요. 디스코드 메시지는 못 갔지만 위젯에는 보여요.';
  const keep = msg; await pick(uid); msg = keep; const l = await call({ action: 'list' }); if (l) threads = l.threads; msg = keep; draw();
});
draw();
if (store.get()) refresh();
