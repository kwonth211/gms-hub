// "Log in with Discord" on every page (owner, 2026-11-21). The site works exactly as before without logging in; logging
// in keeps a copy of this browser's own settings (assets/account-sync.js lists which) on the account, so they follow the
// visitor to another browser or phone. The header button opens a small panel: log in, or name / sync state / log out.
import { syncableKey, fingerprint, plan, batches } from './account-sync.js';

const ACC = 'gms-account', META = 'gms-sync-meta';
const lang = document.documentElement.lang?.slice(0, 2) || 'en';
const api = document.body.dataset.priceApi || '';
const track = (n, p) => globalThis.track?.(n, p);
const L = {
  ko: { nudgeSave: '📱 이 설정, 휴대폰에서도 쓰고 싶다면? 디스코드로 로그인하면 PC와 휴대폰에서 그대로 이어져요.', nudgeScan: '🏆 디스코드로 로그인하고 올리면 기여자 순위에 내 이름이 올라가요.', nudgeGo: '로그인', on: '이 브라우저의 설정이 계정에 저장되고 있어요. 다른 기기에서도 디스코드로 로그인하면 그대로 이어져요.', login: '로그인', loginLong: '디스코드로 로그인', title: '디스코드 로그인', pitch: '로그인하면 내 캐릭터, 계산기 설정, 퀘스트 체크, 관심 아이템 같은 이 브라우저의 설정이 계정에 저장돼요. PC와 휴대폰 어디서 로그인해도 그대로 이어져요.', free: '로그인하지 않아도 모든 기능을 지금처럼 쓸 수 있어요.', join: '로그인하면 GMS Hub 디스코드 서버에도 함께 들어가요.', saved: (n) => `저장된 설정 ${n}개`, synced: '방금 동기화됨', syncing: '동기화 중…', offline: '지금은 저장하지 못했어요. 잠시 뒤 다시 시도해요.', out: '로그아웃', wipe: '계정에 저장된 내 설정 지우기', wipeAsk: '계정에 저장된 설정을 모두 지울까요? 이 브라우저의 설정은 그대로 남아요.', wiped: '계정의 설정을 지웠어요.', cancel: '로그인을 취소했어요.', fail: '로그인하지 못했어요. 다시 시도해 주세요.', welcome: (n) => `${n}님, 로그인됐어요.`, account: '내 계정' },
  en: { nudgeSave: '📱 Want this on your phone too? Log in with Discord and it carries over to your PC and phone.', nudgeScan: '🏆 Log in with Discord and your uploads put your name on the contributor board.', nudgeGo: 'Log in', on: 'This browser\'s settings are being saved to your account. Log in with Discord on another device to pick them up there.', login: 'Log in', loginLong: 'Log in with Discord', title: 'Discord login', pitch: 'Logging in keeps this browser\'s settings — your character, calculator setup, quest checklists, wishlist — on your account, so they are the same on your PC and phone.', free: 'Everything still works without logging in.', join: 'Logging in also adds you to the GMS Hub Discord server.', saved: (n) => `${n} settings saved`, synced: 'Synced just now', syncing: 'Syncing…', offline: 'Could not save right now; will retry shortly.', out: 'Log out', wipe: 'Delete my settings from the account', wipeAsk: 'Delete all settings stored on your account? This browser keeps its own copy.', wiped: 'Your account settings were deleted.', cancel: 'Login cancelled.', fail: 'Could not log in. Please try again.', welcome: (n) => `Logged in as ${n}.`, account: 'My account' },
  ja: { nudgeSave: '📱 この設定をスマホでも使いたいなら、Discordでログインすると PC とスマホで引き継がれます。', nudgeScan: '🏆 Discordでログインしてアップロードすると、貢献者ランキングに名前が載ります。', nudgeGo: 'ログイン', on: 'このブラウザの設定はアカウントに保存されています。ほかの端末でもDiscordでログインすると、そのまま引き継がれます。', login: 'ログイン', loginLong: 'Discordでログイン', title: 'Discordログイン', pitch: 'ログインすると、キャラクター・計算機の設定・クエストのチェック・お気に入りなど、このブラウザの設定がアカウントに保存され、PCでもスマホでも同じように使えます。', free: 'ログインしなくても、すべての機能をこれまで通り使えます。', join: 'ログインするとGMS HubのDiscordサーバーにも参加します。', saved: (n) => `保存された設定 ${n}件`, synced: '同期しました', syncing: '同期中…', offline: '今は保存できませんでした。しばらくして再試行します。', out: 'ログアウト', wipe: 'アカウントの設定を削除', wipeAsk: 'アカウントに保存された設定をすべて削除しますか？このブラウザの設定は残ります。', wiped: 'アカウントの設定を削除しました。', cancel: 'ログインをキャンセルしました。', fail: 'ログインできませんでした。もう一度お試しください。', welcome: (n) => `${n}さん、ログインしました。`, account: 'マイアカウント' },
  zh: { nudgeSave: '📱 想在手機上也用這個設定？用 Discord 登入，電腦和手機都能接著用。', nudgeScan: '🏆 用 Discord 登入後上傳，你的名字就會出現在貢獻者排行榜。', nudgeGo: '登入', on: '這個瀏覽器的設定正在儲存到帳號裡。在其他裝置用 Discord 登入，就能接著使用。', login: '登入', loginLong: '用 Discord 登入', title: 'Discord 登入', pitch: '登入後，你的角色、計算機設定、任務勾選、關注物品等這個瀏覽器的設定會儲存到帳號裡，在電腦和手機上都一樣。', free: '不登入也能照常使用所有功能。', join: '登入時也會加入 GMS Hub 的 Discord 伺服器。', saved: (n) => `已儲存 ${n} 項設定`, synced: '剛剛已同步', syncing: '同步中…', offline: '暫時無法儲存，稍後會再試。', out: '登出', wipe: '刪除帳號裡的設定', wipeAsk: '要刪除帳號裡儲存的所有設定嗎？這個瀏覽器的設定會保留。', wiped: '已刪除帳號裡的設定。', cancel: '已取消登入。', fail: '登入失敗，請再試一次。', welcome: (n) => `${n}，已登入。`, account: '我的帳號' }
}[lang] || null;
const T = L || {};

// Raw storage calls, so the patched setItem below does not see our own writes.
const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
let ls = null;
try { ls = window.localStorage; } catch (e) {}
const read = (k) => { try { return ls?.getItem(k) ?? null; } catch (e) { return null; } };
const readJson = (k, d) => { try { return JSON.parse(read(k) || '') || d; } catch (e) { return d; } };
const write = (k, v) => { try { v === null ? rawRemove.call(ls, k) : rawSet.call(ls, k, v); } catch (e) {} };

function session() {
  const a = readJson(ACC, null);
  return a && a.token ? a : null;
}
function decode(token) {
  try {
    const b = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + '==='.slice((b.length + 3) % 4)), (c) => c.charCodeAt(0))));
    return { id: d.u, name: d.n, avatar: d.a };
  } catch (e) { return null; }
}
const avatarUrl = (u) => (u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : 'https://cdn.discordapp.com/embed/avatars/0.png');

function localSnapshot() {
  const out = {};
  if (!ls) return out;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (syncableKey(k)) out[k] = read(k);
  }
  return out;
}

const state = { busy: false, error: false, count: 0, at: 0 };
async function call(method, body) {
  const s = session();
  const r = await fetch(`${api}/account/data`, { method, headers: { Authorization: `Bearer ${s.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, keepalive: method === 'POST' && JSON.stringify(body).length < 60000 });
  if (r.status === 401) { logout(true); throw new Error('login'); }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function pushAll(push) {
  for (const set of batches(push)) await call('POST', { set });
}

// Pull the account's copy, merge with this browser, write what is newer here, send up what is newer here.
async function sync(first) {
  if (!session() || !api) return;
  state.busy = true; render();
  try {
    const { data, user } = await call('GET');
    if (user) { const s = session(); write(ACC, JSON.stringify({ ...s, ...user })); }
    const p = plan(localSnapshot(), readJson(META, {}), data || {});
    for (const [k, v] of Object.entries(p.apply)) write(k, v);
    write(META, JSON.stringify(p.meta));
    if (Object.keys(p.push).length) await pushAll(p.push);
    state.count = Object.values(p.meta).filter((m) => m.h).length;
    state.error = false; state.at = Date.now();
    // Right after logging in on a device, show the page with the account's settings at once.
    if (first && Object.keys(p.apply).length) {
      try { sessionStorage.setItem('gms-sync-reload', String(Date.now())); if (msg) sessionStorage.setItem('gms-acct-msg', msg); } catch (e) {}
      location.reload();
      return;
    }
    if (Object.keys(p.apply).length) window.dispatchEvent(new CustomEvent('gms-account-sync', { detail: Object.keys(p.apply) }));
  } catch (e) {
    state.error = e.message !== 'login';
  } finally { state.busy = false; render(); }
}

// Every later change on this page goes up a couple of seconds after it happens.
let dirty = {}, timer = 0;
function mark(k) {
  if (!session() && WORTH.test(k)) setTimeout(() => nudge('save'), 1500);
  if (!session() || !syncableKey(k)) return;
  const v = read(k), meta = readJson(META, {});
  meta[k] = { t: Date.now(), h: fingerprint(v) };
  write(META, JSON.stringify(meta));
  dirty[k] = { v, t: meta[k].t };
  clearTimeout(timer);
  timer = setTimeout(flush, 2000);
}
async function flush() {
  clearTimeout(timer);
  const push = dirty; dirty = {};
  if (!Object.keys(push).length || !session()) return;
  try { await pushAll(push); state.error = false; state.at = Date.now(); state.count = Object.values(readJson(META, {})).filter((m) => m.h).length; }
  catch (e) { if (e.message !== 'login') { state.error = true; Object.assign(dirty, push); timer = setTimeout(flush, 30000); } }
  render();
}
if (ls) {
  Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === ls) mark(String(k)); };
  Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === ls) mark(String(k)); };
}
addEventListener('pagehide', () => { if (Object.keys(dirty).length) flush(); });

function logout(silent) {
  write(ACC, null); write(META, null);
  if (!silent) track('account_logout', {});
  render();
}

// Other scripts send the session with their own requests (scan uploads count for the contributor board).
globalThis.gmsAuth = () => { const x = session(); return x ? { Authorization: `Bearer ${x.token}` } : {}; };

// A gentle login prompt for visitors who are not logged in: after they save something worth keeping, or after a scan
// upload. Each kind at most once every three days (kept in a key that never syncs).
const NUDGE = 'gms-sync-nudge';
const WORTH = /^(gms-char|gms-char-img|gms-quests?-|gms-market-wishlist|gmshub_favs|gms-exp-log|gmshub_dmg)/;
function nudge(place) {
  if (!L || session() || !api || !document.body) return;
  const seen = readJson(NUDGE, {});
  if (Date.now() - (seen[place] || 0) < 3 * 864e5 || Date.now() - (seen.any || 0) < 864e5) return;
  seen[place] = seen.any = Date.now(); write(NUDGE, JSON.stringify(seen));
  document.querySelector('.acct-nudge')?.remove();
  const el = document.createElement('div');
  el.className = 'acct-nudge'; el.setAttribute('role', 'status');
  el.innerHTML = `<p>${place === 'scan' ? T.nudgeScan : T.nudgeSave}</p><a class="btn acct-go" href="${loginHref()}" data-acct-login>${box?.dataset.icon || ''} ${T.nudgeGo}</a><button type="button" class="acct-x" aria-label="close">×</button>`;
  el.querySelector('.acct-x').addEventListener('click', () => el.remove());
  el.querySelector('[data-acct-login]').addEventListener('click', () => track('account_login_click', { place: `nudge-${place}` }));
  document.body.appendChild(el);
  track('account_nudge', { place });
  setTimeout(() => el.remove(), 20000);
}
globalThis.gmsLoginNudge = nudge;

// ---- header button and panel ----
const box = document.querySelector('[data-acct]');
let msg = '';
function render() {
  if (!box || !L) return;
  const s = session();
  box.hidden = false;
  const u = s ? { id: s.id, name: s.name, avatar: s.avatar } : null;
  const btn = box.querySelector('.acct-btn');
  btn.innerHTML = u ? `<img class="acct-avatar" src="${avatarUrl(u)}" alt="" width="24" height="24"><span class="acct-label">${esc(u.name || T.account)}</span>`
    : `${box.dataset.icon || ''}<span class="acct-label">${T.login}</span>`;
  btn.setAttribute('aria-label', u ? T.account : T.loginLong);
  const pop = box.querySelector('.acct-pop');
  pop.innerHTML = (msg ? `<p class="acct-msg">${esc(msg)}</p>` : '') + (u
    ? `<div class="acct-me"><img class="acct-avatar big" src="${avatarUrl(u)}" alt="" width="40" height="40"><div><b>${esc(u.name || '')}</b><small>${state.busy ? T.syncing : state.error ? T.offline : state.at ? `${T.saved(state.count)} · ${T.synced}` : T.saved(state.count)}</small></div></div>
       <p class="acct-note">${T.on}</p>
       <div class="acct-actions"><button type="button" class="btn" data-acct-out>${T.out}</button><button type="button" class="acct-link" data-acct-wipe>${T.wipe}</button></div>`
    : `<p class="acct-title"><b>${T.title}</b></p><p class="acct-note">${T.pitch}</p>
       <a class="btn acct-go" href="${loginHref()}" data-acct-login>${box.dataset.icon || ''} ${T.loginLong}</a>
       <p class="acct-small">${T.free} ${T.join}</p>`);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const loginHref = () => `${api}/discord/oauth/start?${new URLSearchParams({ intent: 'login', lang, ret: location.pathname + location.search })}`;

if (box && L) {
  box.addEventListener('click', async (e) => {
    if (e.target.closest('.acct-btn')) { box.classList.toggle('open'); if (box.classList.contains('open')) { msg = ''; render(); track('account_open', { logged_in: !!session() }); } return; }
    if (e.target.closest('[data-acct-login]')) track('account_login_click', {});
    if (e.target.closest('[data-acct-out]')) { await flush(); logout(); return; }
    if (e.target.closest('[data-acct-wipe]')) {
      if (!confirm(T.wipeAsk)) return;
      try { await call('DELETE'); write(META, JSON.stringify({})); msg = T.wiped; track('account_wipe', {}); logout(true); msg = T.wiped; } catch (x) {}
      render();
    }
  });
  // composedPath is fixed when the click starts, so a node the panel just re-rendered still counts as inside.
  document.addEventListener('click', (e) => { if (!e.composedPath().includes(box)) box.classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('open'); });
}

// ---- coming back from Discord ----
(function start() {
  const m = location.hash.match(/(?:^#|&)gmslogin=([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/);
  const q = new URLSearchParams(location.search);
  let first = false;
  if (m) {
    const u = decode(m[1]);
    if (u) { write(ACC, JSON.stringify({ token: m[1], ...u })); first = true; msg = T.welcome?.(u.name || '') || ''; track('account_login', {}); }
    history.replaceState(null, '', location.pathname + location.search);
  } else if (q.get('login')) {
    msg = q.get('login') === 'cancel' ? T.cancel : T.fail;
    q.delete('login');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
  }
  try { if (!msg && sessionStorage.getItem('gms-acct-msg')) { msg = sessionStorage.getItem('gms-acct-msg'); sessionStorage.removeItem('gms-acct-msg'); } } catch (e) {}
  render();
  if (msg && box) box.classList.add('open');
  // Not twice in a row after the reload that follows a first login.
  let justReloaded = false;
  try { justReloaded = Date.now() - Number(sessionStorage.getItem('gms-sync-reload') || 0) < 15000; } catch (e) {}
  if (session()) setTimeout(() => sync(first && !justReloaded), first ? 0 : 1200);
})();
