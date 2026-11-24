// The help widget at the bottom right of every page (owner, 2026-11-24): report a bug or wrong data, suggest something,
// ask a question. Drawn like an NPC talking to you. Logged in with Discord it keeps the conversation and shows answers;
// without a login the message only reaches the owner, and the widget says so before sending. Server: worker support.js.
const box = document.querySelector('[data-help-npc]');
const lang = document.documentElement.lang?.slice(0, 2) || 'en';
const api = document.body.dataset.priceApi || '';
const L = {
  ko: { open: '오류 신고·문의', name: '버섯 도우미', sub: '오류 신고 · 제보 · 문의', hi: '무슨 일로 왔나요? 아래에서 골라 주세요.', hiBug: '어느 부분이 이상한지, 무엇을 눌렀는지 적어 주세요.', hiData: '틀린 정보와 맞는 정보를 같이 적어 주세요.', hiIdea: '있으면 좋겠는 기능을 적어 주세요.', hiAsk: '궁금한 걸 적어 주세요.',
    kinds: { bug: '오류 신고', data: '정보 제보', idea: '건의', ask: '문의' }, ph: '여기에 적어 주세요', send: '보내기', sending: '보내는 중…', close: '대화 끝내기', back: '다시 고르기',
    guest: '비회원은 <b>답변을 받을 수 없고 문의 기록도 남지 않아요.</b> 답변이 필요하면 먼저 로그인하세요.', login: '디스코드로 로그인', loginNote: '로그인하면 GMS Hub 디스코드 서버에 같이 들어가요.', member: '{name}님으로 보내요. 답변은 이 창에 와요.',
    tech: '보던 페이지 주소와 브라우저 종류가 같이 가요. 비밀번호는 적지 마세요.', thanksMember: '잘 받았어요! 답변이 오면 버섯에 빨간 표시가 떠요.', thanksGuest: '잘 받았어요! 비회원이라 답변은 못 드려요. 고마워요.', me: '나', staff: '운영자',
    err: { short: '5글자 넘게 적어 주세요.', daily: '조금 뒤에 다시 보내 주세요. 하루에 보낼 수 있는 수가 정해져 있어요.', login: '로그인이 풀렸어요. 다시 로그인해 주세요.', other: '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.' } },
  en: { open: 'Report or ask', name: 'Mushroom Helper', sub: 'Bugs · data · questions', hi: 'What brings you here? Pick one.', hiBug: 'Tell me what looks wrong and what you clicked.', hiData: 'Tell me what is wrong and what it should be.', hiIdea: 'Tell me what you would like to see.', hiAsk: 'Ask away.',
    kinds: { bug: 'Report a bug', data: 'Fix wrong data', idea: 'Suggest', ask: 'Ask' }, ph: 'Write here', send: 'Send', sending: 'Sending…', close: 'End chat', back: 'Pick again',
    guest: 'Without logging in <b>you cannot get an answer and no record is kept.</b> Log in first if you need an answer.', login: 'Log in with Discord', loginNote: 'Logging in also joins the GMS Hub Discord server.', member: 'Sending as {name}. Answers arrive in this window.',
    tech: 'The page address and your browser type are sent along. Never write a password.', thanksMember: 'Got it! A red mark appears on the mushroom when an answer arrives.', thanksGuest: 'Got it! You are not logged in, so I cannot answer. Thank you.', me: 'You', staff: 'GMS Hub',
    err: { short: 'Please write at least 5 characters.', daily: 'Please try again later. There is a daily limit.', login: 'Your login expired. Please log in again.', other: 'It was not sent. Please try again in a moment.' } },
  ja: { open: '不具合報告・お問い合わせ', name: 'キノコ案内人', sub: '不具合 · 情報提供 · 質問', hi: 'どうしましたか？下から選んでください。', hiBug: 'どこがおかしいか、何を押したか書いてください。', hiData: '間違っている情報と正しい情報を書いてください。', hiIdea: '欲しい機能を書いてください。', hiAsk: '質問を書いてください。',
    kinds: { bug: '不具合報告', data: '情報の訂正', idea: '要望', ask: '質問' }, ph: 'ここに書いてください', send: '送信', sending: '送信中…', close: '会話を終える', back: '選び直す',
    guest: 'ログインしていないと<b>返信を受け取れず、記録も残りません。</b>返信が必要なら先にログインしてください。', login: 'Discordでログイン', loginNote: 'ログインするとGMS HubのDiscordサーバーにも参加します。', member: '{name}さんとして送ります。返信はこの画面に届きます。',
    tech: '見ていたページのアドレスとブラウザの種類も送られます。パスワードは書かないでください。', thanksMember: '届きました！返信が来るとキノコに赤い印が付きます。', thanksGuest: '届きました！未ログインのため返信はできません。ありがとうございます。', me: '自分', staff: '運営',
    err: { short: '5文字以上で書いてください。', daily: 'しばらくしてからもう一度送ってください。', login: 'ログインが切れました。もう一度ログインしてください。', other: '送信できませんでした。少し後でもう一度お試しください。' } },
  zh: { open: '回報與詢問', name: '蘑菇小幫手', sub: '錯誤 · 資料 · 詢問', hi: '有什麼事嗎？請選一項。', hiBug: '請寫下哪裡不對、按了什麼。', hiData: '請寫下錯誤的資料和正確的資料。', hiIdea: '請寫下想要的功能。', hiAsk: '請寫下您的問題。',
    kinds: { bug: '回報錯誤', data: '更正資料', idea: '建議', ask: '詢問' }, ph: '請寫在這裡', send: '送出', sending: '傳送中…', close: '結束對話', back: '重新選擇',
    guest: '未登入時<b>收不到回覆，也不會留下紀錄。</b>需要回覆請先登入。', login: '用 Discord 登入', loginNote: '登入後也會加入 GMS Hub 的 Discord 伺服器。', member: '以 {name} 的身分送出。回覆會出現在這裡。',
    tech: '會一併送出所在頁面網址和瀏覽器種類。請勿填寫密碼。', thanksMember: '收到了！有回覆時蘑菇上會出現紅點。', thanksGuest: '收到了！因為沒有登入，無法回覆。謝謝您。', me: '我', staff: '管理員',
    err: { short: '請至少寫 5 個字。', daily: '請稍後再送。每天有次數限制。', login: '登入已失效，請重新登入。', other: '沒有送出，請稍後再試。' } }
}[lang];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const get = (store, k) => { try { return store().getItem(k); } catch (e) { return null; } };
const put = (store, k, v) => { try { v == null ? store().removeItem(k) : store().setItem(k, v); } catch (e) {} };
const local = () => window.localStorage, tab = () => window.sessionStorage;
const session = () => { try { const a = JSON.parse(get(local, 'gms-account') || ''); return a?.token ? a : null; } catch (e) { return null; } };
const browser = () => { const u = navigator.userAgent; const os = /Windows/.test(u) ? 'Windows' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Mac OS/.test(u) ? 'Mac' : 'Other'; const b = /Whale/.test(u) ? 'Whale' : /Edg\//.test(u) ? 'Edge' : /Firefox/.test(u) ? 'Firefox' : /Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : 'Other'; return `${os} ${b} ${innerWidth}x${innerHeight} ${lang}`; };

if (box && L && api) {
  const art = box.innerHTML;
  // Marks an account that has written before, so other pages only ask for answers when there can be any.
  const HAS = 'gms-support-has', DRAFT = 'gms-support-draft';
  let open = false, kind = null, list = [], unread = 0, note = '', error = '', busy = false;
  try { const d = JSON.parse(get(tab, DRAFT) || 'null'); if (d) kind = L.kinds[d.kind] ? d.kind : null; } catch (e) {}
  const draft = () => { try { return JSON.parse(get(tab, DRAFT) || 'null')?.text || ''; } catch (e) { return ''; } };
  const ask = (method, body) => { const s = session(); return fetch(`${api}/support`, { method, headers: { ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); };
  const when = (t) => new Date(t).toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  async function load() {
    if (!session()) return;
    try { const r = await ask('GET'); if (!r.ok) return; const d = await r.json(); list = d.list || []; unread = d.unread || 0; } catch (e) {}
  }
  box.className = 'sp';
  box.innerHTML = `<button type="button" class="sp-btn" aria-expanded="false" aria-controls="sp-panel" aria-label="${esc(L.open)}" title="${esc(L.open)}"><span class="sp-art" aria-hidden="true">${art}</span><span class="sp-balloon" aria-hidden="true">?</span><span class="sp-dot" hidden></span></button>
<section class="sp-panel" id="sp-panel" role="dialog" aria-label="${esc(L.open)}" hidden></section>`;
  box.hidden = false;
  const btn = box.querySelector('.sp-btn'), panel = box.querySelector('.sp-panel'), dot = box.querySelector('.sp-dot');
  const mark = () => { dot.hidden = !unread; dot.textContent = unread > 9 ? '9+' : unread || ''; };
  function draw() {
    mark();
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    box.classList.toggle('is-open', open);
    if (!open) return;
    const s = session(), hi = note || (kind ? L[{ bug: 'hiBug', data: 'hiData', idea: 'hiIdea', ask: 'hiAsk' }[kind]] : L.hi);
    panel.innerHTML = `<header class="sp-head"><span class="sp-face" aria-hidden="true">${art}</span><div><strong>${esc(L.name)}</strong><small>${esc(L.sub)}</small></div><button type="button" class="sp-x" aria-label="${esc(L.close)}">×</button></header>
<div class="sp-body">
${list.length ? `<ol class="sp-log">${list.map((m) => `<li class="${m.who === 'staff' ? 'is-staff' : 'is-me'}"><small>${esc(m.who === 'staff' ? L.staff : L.me)}${m.kind ? ` · ${esc(L.kinds[m.kind] || '')}` : ''} · ${when(m.at)}</small><p>${esc(m.text)}</p></li>`).join('')}</ol>` : ''}
<p class="sp-say" role="status">${esc(hi)}</p>
${kind ? `<form class="sp-form"><div class="sp-kind"><b>${esc(L.kinds[kind])}</b><button type="button" class="sp-back">${esc(L.back)}</button></div>
<textarea name="text" rows="4" maxlength="1000" required placeholder="${esc(L.ph)}" aria-label="${esc(L.kinds[kind])}"></textarea>
<p class="sp-tech">${esc(L.tech)}</p>${error ? `<p class="sp-err" role="alert">${esc(L.err[error] || L.err.other)}</p>` : ''}
<div class="sp-acts"><button type="button" class="btn ghost sp-end">${esc(L.close)}</button><button class="btn sp-send"${busy ? ' disabled' : ''}>${esc(busy ? L.sending : L.send)}</button></div></form>`
      : `<ul class="sp-pick">${Object.entries(L.kinds).map(([k, v]) => `<li><button type="button" data-kind="${k}">${esc(v)}</button></li>`).join('')}</ul>`}
</div>
<footer class="sp-foot">${s ? `<p>${esc(L.member.replace('{name}', s.name || ''))}</p>` : `<p class="sp-warn">${L.guest}</p><a class="sp-login" href="${esc(`${api}/discord/oauth/start?${new URLSearchParams({ intent: 'login', lang, ret: location.pathname + location.search })}`)}">${esc(L.login)}</a><small>${esc(L.loginNote)}</small>`}</footer>`;
    const area = panel.querySelector('textarea');
    if (area) { area.value = draft(); area.addEventListener('input', () => put(tab, DRAFT, JSON.stringify({ kind, text: area.value }))); }
    const body = panel.querySelector('.sp-body');
    body.scrollTop = body.scrollHeight;
  }
  async function toggle(to) {
    open = to;
    if (!open) note = '';
    draw();
    if (!open) { btn.focus({ preventScroll: true }); return; }
    globalThis.track?.('support_open', {});
    panel.querySelector('.sp-x')?.focus({ preventScroll: true });
    if (session()) {
      await load();
      if (unread) { ask('POST', { seen: true }).catch(() => {}); unread = 0; }
      // A message being written is never redrawn away.
      if (open && document.activeElement?.tagName !== 'TEXTAREA') draw(); else mark();
    }
  }
  btn.addEventListener('click', () => toggle(!open));
  panel.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    if (k) { kind = k.dataset.kind; note = ''; error = ''; put(tab, DRAFT, JSON.stringify({ kind, text: draft() })); draw(); panel.querySelector('textarea')?.focus(); return; }
    if (e.target.closest('.sp-back')) { kind = null; error = ''; note = ''; put(tab, DRAFT, null); draw(); return; }
    if (e.target.closest('.sp-x, .sp-end')) toggle(false);
    if (e.target.closest('.sp-login')) globalThis.track?.('account_login_click', { place: 'support' });
  });
  panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = panel.querySelector('textarea').value.trim();
    if (text.length < 5) { error = 'short'; draw(); return; }
    busy = true; error = ''; draw();
    try {
      const r = await ask('POST', { kind, text, page: location.pathname, env: browser() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) error = L.err[d.error] ? d.error : r.status === 429 ? 'daily' : 'other';
      else {
        globalThis.track?.('support_send', { ui_value: kind });
        note = d.kept ? L.thanksMember : L.thanksGuest;
        if (d.kept) { put(local, HAS, '1'); list.push({ who: 'user', kind, text, at: d.at }); }
        kind = null; put(tab, DRAFT, null);
      }
    } catch (x) { error = 'other'; }
    busy = false; draw();
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') toggle(false); });
  if (session() && get(local, HAS)) load().then(mark);
}
