// The help widget at the bottom right of every page (owner, 2026-11-24): report a bug or wrong data, suggest something,
// ask a question. Drawn like an NPC talking to you. Logged in with Discord it keeps the conversation and shows answers;
// without a login the message only reaches the owner, and the widget says so before sending. Server: worker support.js.
import ICON from './help-icons.js';

const box = document.querySelector('[data-help-npc]');
const lang = document.documentElement.lang?.slice(0, 2) || 'en';
const api = document.body.dataset.priceApi || '';
const L = {
  ko: { hello: '안녕하세요!', hello2: '무엇을 도와드릴까요?', topics: '새 문의', topicSub: { bug: '안 되거나 깨진 곳이 있어요', data: '가격·드랍·위치가 틀려요', idea: '이런 기능이 있으면 좋겠어요', ask: '궁금한 게 있어요' }, recent: '지난 대화', empty: '아직 나눈 대화가 없어요.', home: '홈', talks: '대화', time: '보통 2~3일 안에 답해요', guestShort: '비회원은 답변을 못 받고 기록도 남지 않아요.', loginShort: '로그인', backAria: '뒤로 가기', you: '나의 문의', more: '이어서 쓰기', open: '오류 신고·문의', name: '버섯 도우미', sub: '오류 신고 · 제보 · 문의', hi: '무슨 일로 왔나요? 아래에서 골라 주세요.', hiBug: '어느 부분이 이상한지, 무엇을 눌렀는지 적어 주세요.', hiData: '틀린 정보와 맞는 정보를 같이 적어 주세요.', hiIdea: '있으면 좋겠는 기능을 적어 주세요.', hiAsk: '궁금한 걸 적어 주세요.',
    kinds: { bug: '오류 신고', data: '정보 제보', idea: '건의', ask: '문의' }, ph: '여기에 적어 주세요', send: '보내기', sending: '보내는 중…', close: '대화 끝내기', back: '다시 고르기',
    guest: '비회원은 <b>답변을 받을 수 없고 문의 기록도 남지 않아요.</b> 답변이 필요하면 먼저 로그인하세요.', login: '디스코드로 로그인', loginNote: '로그인하면 GMS Hub 디스코드 서버에 같이 들어가요.', member: '{name}님으로 보내요. 답변은 이 창에 와요.',
    tech: '보던 페이지 주소와 브라우저 종류가 같이 가요. 비밀번호는 적지 마세요.', thanksMember: '잘 받았어요! 답변이 오면 버섯에 빨간 표시가 떠요.', thanksGuest: '잘 받았어요! 비회원이라 답변은 못 드려요. 고마워요.', me: '나', staff: '운영자',
    err: { short: '5글자 넘게 적어 주세요.', daily: '조금 뒤에 다시 보내 주세요. 하루에 보낼 수 있는 수가 정해져 있어요.', login: '로그인이 풀렸어요. 다시 로그인해 주세요.', other: '보내지 못했어요. 잠시 뒤 다시 눌러 주세요.' } },
  en: { hello: 'Hello!', hello2: 'How can we help?', topics: 'New message', topicSub: { bug: 'Something is broken', data: 'A price, drop or place is wrong', idea: 'I would like a feature', ask: 'I have a question' }, recent: 'Your messages', empty: 'No messages yet.', home: 'Home', talks: 'Messages', time: 'Usually answered in 2-3 days', guestShort: 'Without logging in: no answer, no record.', loginShort: 'Log in', backAria: 'Back', you: 'Your messages', more: 'Continue', open: 'Report or ask', name: 'Mushroom Helper', sub: 'Bugs · data · questions', hi: 'What brings you here? Pick one.', hiBug: 'Tell me what looks wrong and what you clicked.', hiData: 'Tell me what is wrong and what it should be.', hiIdea: 'Tell me what you would like to see.', hiAsk: 'Ask away.',
    kinds: { bug: 'Report a bug', data: 'Fix wrong data', idea: 'Suggest', ask: 'Ask' }, ph: 'Write here', send: 'Send', sending: 'Sending…', close: 'End chat', back: 'Pick again',
    guest: 'Without logging in <b>you cannot get an answer and no record is kept.</b> Log in first if you need an answer.', login: 'Log in with Discord', loginNote: 'Logging in also joins the GMS Hub Discord server.', member: 'Sending as {name}. Answers arrive in this window.',
    tech: 'The page address and your browser type are sent along. Never write a password.', thanksMember: 'Got it! A red mark appears on the mushroom when an answer arrives.', thanksGuest: 'Got it! You are not logged in, so I cannot answer. Thank you.', me: 'You', staff: 'GMS Hub',
    err: { short: 'Please write at least 5 characters.', daily: 'Please try again later. There is a daily limit.', login: 'Your login expired. Please log in again.', other: 'It was not sent. Please try again in a moment.' } },
  ja: { hello: 'こんにちは！', hello2: 'どうしましたか？', topics: '新しいお問い合わせ', topicSub: { bug: '動かない・崩れている', data: '価格・ドロップ・場所が違う', idea: 'こんな機能が欲しい', ask: '聞きたいことがある' }, recent: 'これまでの会話', empty: 'まだ会話はありません。', home: 'ホーム', talks: '会話', time: '通常2〜3日以内に返信します', guestShort: '未ログインでは返信も記録もありません。', loginShort: 'ログイン', backAria: '戻る', you: 'お問い合わせ', more: '続ける', open: '不具合報告・お問い合わせ', name: 'キノコ案内人', sub: '不具合 · 情報提供 · 質問', hi: 'どうしましたか？下から選んでください。', hiBug: 'どこがおかしいか、何を押したか書いてください。', hiData: '間違っている情報と正しい情報を書いてください。', hiIdea: '欲しい機能を書いてください。', hiAsk: '質問を書いてください。',
    kinds: { bug: '不具合報告', data: '情報の訂正', idea: '要望', ask: '質問' }, ph: 'ここに書いてください', send: '送信', sending: '送信中…', close: '会話を終える', back: '選び直す',
    guest: 'ログインしていないと<b>返信を受け取れず、記録も残りません。</b>返信が必要なら先にログインしてください。', login: 'Discordでログイン', loginNote: 'ログインするとGMS HubのDiscordサーバーにも参加します。', member: '{name}さんとして送ります。返信はこの画面に届きます。',
    tech: '見ていたページのアドレスとブラウザの種類も送られます。パスワードは書かないでください。', thanksMember: '届きました！返信が来るとキノコに赤い印が付きます。', thanksGuest: '届きました！未ログインのため返信はできません。ありがとうございます。', me: '自分', staff: '運営',
    err: { short: '5文字以上で書いてください。', daily: 'しばらくしてからもう一度送ってください。', login: 'ログインが切れました。もう一度ログインしてください。', other: '送信できませんでした。少し後でもう一度お試しください。' } },
  zh: { hello: '您好！', hello2: '需要什麼協助？', topics: '新的詢問', topicSub: { bug: '有地方壞掉或不能用', data: '價格、掉落或位置有錯', idea: '希望有這個功能', ask: '我有問題' }, recent: '之前的對話', empty: '還沒有對話。', home: '首頁', talks: '對話', time: '通常 2～3 天內回覆', guestShort: '未登入時收不到回覆，也沒有紀錄。', loginShort: '登入', backAria: '返回', you: '我的詢問', more: '繼續', open: '回報與詢問', name: '蘑菇小幫手', sub: '錯誤 · 資料 · 詢問', hi: '有什麼事嗎？請選一項。', hiBug: '請寫下哪裡不對、按了什麼。', hiData: '請寫下錯誤的資料和正確的資料。', hiIdea: '請寫下想要的功能。', hiAsk: '請寫下您的問題。',
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
  // Marks an account that has written before, so other pages only ask for answers when there can be any.
  const HAS = 'gms-support-has', DRAFT = 'gms-support-draft';
  const TOPIC = { bug: 'slime', data: 'scroll', idea: 'star', ask: 'chat' };
  const svg = { back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>', x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>', send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>', down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>', go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>', talks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>' };
  let open = false, view = 'home', kind = null, list = [], guestLog = [], unread = 0, error = '', busy = false;
  const readDraft = () => { try { return JSON.parse(get(tab, DRAFT) || 'null') || {}; } catch (e) { return {}; } };
  { const d = readDraft(); if (d.text && L.kinds[d.kind]) { kind = d.kind; view = 'chat'; } }
  const ask = (method, body) => { const s = session(); return fetch(`${api}/support`, { method, headers: { ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); };
  const clock = (t) => new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const dayOf = (t) => new Date(t).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const short = (t) => (new Date(t).toDateString() === new Date().toDateString() ? clock(t) : new Date(t).toLocaleDateString(lang, { month: 'numeric', day: 'numeric' }));
  const loginHref = () => esc(`${api}/discord/oauth/start?${new URLSearchParams({ intent: 'login', lang, ret: location.pathname + location.search })}`);
  async function load() {
    if (!session()) return;
    try { const r = await ask('GET'); if (!r.ok) return; const d = await r.json(); list = d.list || []; unread = d.unread || 0; } catch (e) {}
  }
  box.className = 'sp';
  box.innerHTML = `<section class="sp-panel" id="sp-panel" role="dialog" aria-label="${esc(L.open)}" hidden></section>
<button type="button" class="sp-btn" aria-expanded="false" aria-controls="sp-panel" aria-label="${esc(L.open)}" title="${esc(L.open)}"><span class="sp-btn-art" aria-hidden="true">${ICON.mushroom}</span><span class="sp-btn-down" aria-hidden="true">${svg.down}</span><span class="sp-dot" hidden></span></button>`;
  box.hidden = false;
  const btn = box.querySelector('.sp-btn'), panel = box.querySelector('.sp-panel'), dot = box.querySelector('.sp-dot');
  const mark = () => { dot.hidden = !unread || open; dot.textContent = unread > 9 ? '9+' : unread || ''; };

  const bot = (text, key = '') => `<li class="sp-m is-bot"${key}><span class="sp-ava" aria-hidden="true">${ICON.mushroom}</span><div><p>${esc(text)}</p></div></li>`;
  function bubbles(items) {
    let day = '', out = '', prev = '';
    for (const m of items) {
      const d = dayOf(m.at);
      if (d !== day) { out += `<li class="sp-day"><span>${esc(d)}</span></li>`; day = d; prev = ''; }
      const staff = m.who === 'staff';
      out += staff
        ? `<li class="sp-m is-bot">${prev === 'staff' ? '<span class="sp-ava is-gap"></span>' : `<span class="sp-ava" aria-hidden="true">${ICON.mushroom}</span>`}<div>${prev === 'staff' ? '' : `<b>${esc(L.staff)}</b>`}<p>${esc(m.text)}</p><time>${clock(m.at)}</time></div></li>`
        : `<li class="sp-m is-me"><div>${m.kind ? `<b>${esc(L.kinds[m.kind] || '')}</b>` : ''}<p>${esc(m.text)}</p><time>${clock(m.at)}</time></div></li>`;
      prev = m.who;
    }
    return out;
  }
  const guestCard = () => `<div class="sp-guest"><p>${L.guest}</p><a class="sp-login" href="${loginHref()}">${esc(L.login)}</a><small>${esc(L.loginNote)}</small></div>`;
  const tabs = (on) => `<nav class="sp-tabs">${['home', 'talks'].map((k) => `<button type="button" data-view="${k}"${on === k ? ' aria-current="page"' : ''}>${svg[k]}<span>${esc(L[k])}</span>${k === 'talks' && unread ? '<i></i>' : ''}</button>`).join('')}</nav>`;
  const last = () => list.at(-1);
  const threadRow = () => { const m = last(); return `<button type="button" class="sp-row" data-view="chat"><span class="sp-ava" aria-hidden="true">${ICON.mushroom}</span><span class="sp-row-t"><b>${esc(m.who === 'staff' ? L.staff : L.you)}</b><small>${esc(m.text)}</small></span><span class="sp-row-s"><time>${short(m.at)}</time>${unread ? `<em>${unread}</em>` : ''}</span></button>`; };

  function home(s) {
    return `<div class="sp-scroll"><header class="sp-hero"><button type="button" class="sp-ic sp-x" aria-label="${esc(L.close)}">${svg.x}</button><span class="sp-hero-art" aria-hidden="true">${ICON.mushroom}</span><h2>${esc(L.hello)}<br>${esc(L.hello2)}</h2><p><i></i>${esc(L.time)}</p></header>
<div class="sp-cards">
${s && list.length ? `<section class="sp-card"><h3>${esc(L.recent)}</h3>${threadRow()}</section>` : ''}
<section class="sp-card"><h3>${esc(L.topics)}</h3><ul class="sp-topics">${Object.keys(L.kinds).map((k) => `<li><button type="button" data-kind="${k}"><span class="sp-t-ico" aria-hidden="true">${ICON[TOPIC[k]]}</span><span><b>${esc(L.kinds[k])}</b><small>${esc(L.topicSub[k])}</small></span>${svg.go}</button></li>`).join('')}</ul></section>
${s ? '' : `<section class="sp-card">${guestCard()}</section>`}
</div></div>${tabs('home')}`;
  }
  function talks(s) {
    return `<header class="sp-bar"><h2>${esc(L.talks)}</h2><button type="button" class="sp-ic sp-x" aria-label="${esc(L.close)}">${svg.x}</button></header>
<div class="sp-scroll sp-talks">${s && list.length ? threadRow() : `<div class="sp-empty"><span aria-hidden="true">${ICON.chat}</span><p>${esc(L.empty)}</p></div>${s ? '' : guestCard()}`}</div>${tabs('talks')}`;
  }
  function chat(s) {
    const d = readDraft();
    return `<header class="sp-bar is-chat"><button type="button" class="sp-ic" data-back aria-label="${esc(L.backAria)}">${svg.back}</button><span class="sp-ava" aria-hidden="true">${ICON.mushroom}</span><div><h2>${esc(L.name)}</h2><small><i></i>${esc(L.time)}</small></div><button type="button" class="sp-ic sp-x" aria-label="${esc(L.close)}">${svg.x}</button></header>
<div class="sp-scroll"><ol class="sp-log" role="log">${bubbles(s ? list : guestLog)}${bot(kind ? L[{ bug: 'hiBug', data: 'hiData', idea: 'hiIdea', ask: 'hiAsk' }[kind]] : L.hi)}</ol></div>
<div class="sp-compose">
${s ? '' : `<p class="sp-strip"><span>${esc(L.guestShort)}</span><a class="sp-login-s" href="${loginHref()}">${esc(L.loginShort)}</a></p>`}
<div class="sp-chips" role="group" aria-label="${esc(L.topics)}">${Object.keys(L.kinds).map((k) => `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${esc(L.kinds[k])}</button>`).join('')}</div>
${error ? `<p class="sp-err" role="alert">${esc(L.err[error] || L.err.other)}</p>` : ''}
<form class="sp-form"><textarea name="text" rows="1" maxlength="1000" placeholder="${esc(L.ph)}" aria-label="${esc(L.ph)}">${esc(d.text || '')}</textarea><button class="sp-send" aria-label="${esc(busy ? L.sending : L.send)}" title="${esc(L.send)}">${svg.send}</button></form>
<p class="sp-tech">${esc(L.tech)}</p></div>`;
  }
  const grow = (a) => { a.style.height = 'auto'; a.style.height = `${Math.min(a.scrollHeight, 132)}px`; panel.querySelector('.sp-send').disabled = busy || a.value.trim().length < 1; };
  function draw(slide = '') {
    mark();
    btn.setAttribute('aria-expanded', String(open));
    box.classList.toggle('is-open', open);
    panel.hidden = !open;
    if (!open) return;
    const s = session();
    panel.innerHTML = `<div class="sp-view ${slide}">${view === 'chat' ? chat(s) : view === 'talks' ? talks(s) : home(s)}</div>`;
    const a = panel.querySelector('textarea');
    if (a) {
      grow(a);
      a.addEventListener('input', () => { put(tab, DRAFT, JSON.stringify({ kind, text: a.value })); grow(a); });
      // Enter sends on a keyboard, Shift+Enter breaks the line; phones keep Enter as a line break. Never mid-composition.
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); panel.querySelector('.sp-form').requestSubmit(); } });
      const sc = panel.querySelector('.sp-scroll'); sc.scrollTop = sc.scrollHeight;
    }
  }
  async function go(to, slide) {
    view = to; error = '';
    draw(slide);
    if (to === 'chat') {
      if (unread) { unread = 0; ask('POST', { seen: true }).catch(() => {}); }
      if (matchMedia('(pointer: fine)').matches) panel.querySelector('textarea')?.focus({ preventScroll: true });
    }
  }
  async function toggle(to) {
    open = to;
    document.documentElement.classList.toggle('sp-lock', open);
    draw(open ? 'is-in' : '');
    if (!open) { btn.focus({ preventScroll: true }); return; }
    globalThis.track?.('support_open', {});
    if (session()) {
      await load();
      // A message being written is never redrawn away.
      if (open && document.activeElement?.tagName !== 'TEXTAREA') draw(); else mark();
    }
  }
  btn.addEventListener('click', () => toggle(!open));
  panel.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    if (k) {
      const from = view; kind = k.dataset.kind; error = '';
      put(tab, DRAFT, JSON.stringify({ kind, text: readDraft().text || '' }));
      go('chat', from === 'chat' ? '' : 'is-fwd');
      return;
    }
    if (e.target.closest('[data-back]')) { kind = null; go('home', 'is-back'); return; }
    const v = e.target.closest('[data-view]');
    if (v) { const to = v.dataset.view; go(to, to === 'chat' ? 'is-fwd' : ''); return; }
    if (e.target.closest('.sp-x')) toggle(false);
    if (e.target.closest('.sp-login, .sp-login-s')) globalThis.track?.('account_login_click', { place: 'support' });
  });
  panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = panel.querySelector('textarea').value.trim();
    if (busy) return;
    if (text.length < 5) { error = 'short'; draw(); panel.querySelector('textarea').focus(); return; }
    busy = true; error = ''; panel.querySelector('.sp-send').disabled = true;
    const what = kind || 'ask';
    try {
      const r = await ask('POST', { kind: what, text, page: location.pathname, env: browser() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) error = L.err[d.error] ? d.error : r.status === 429 ? 'daily' : 'other';
      else {
        globalThis.track?.('support_send', { ui_value: what });
        put(tab, DRAFT, null); kind = null;
        (d.kept ? list : guestLog).push({ who: 'user', kind: what, text, at: d.at || Date.now() });
        if (d.kept) put(local, HAS, '1');
        busy = false; view = 'chat'; draw();
        panel.querySelector('.sp-log .sp-m:last-child')?.remove();
        panel.querySelector('.sp-log').insertAdjacentHTML('beforeend', bot(d.kept ? L.thanksMember : L.thanksGuest));
        const sc = panel.querySelector('.sp-scroll'); sc.scrollTop = sc.scrollHeight;
        return;
      }
    } catch (x) { error = 'other'; }
    busy = false; draw();
  });
  document.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape') return;
    if (view === 'chat') { kind = null; go('home', 'is-back'); } else toggle(false);
  });
  if (session() && get(local, HAS)) load().then(mark);
}
