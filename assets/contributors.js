// /contributors/: the contributor leaderboard from the worker's /contributors (worker/src/contributors.js).
// Logged-in visitors (assets/account.js) also see their own points.
// The market page has the same board in a dialog (data-lazy): it loads the first time the button opens it.
for (const root of document.querySelectorAll('[data-contributors]')) board(root);
function board(root) {
  const ko = root.dataset.lang === 'ko';
  const $ = (s) => root.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Each contributor gets one of the early-game monsters as a picture, always the same one for the same name
  // (owner, 2026-11-21: the Discord profile pictures did not fit).
  const MOBS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 16, 17, 19, 21, 22, 25];
  const pick = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return MOBS[h % MOBS.length]; };
  const avatar = (r) => `/assets/monsters/${pick(r.game || r.name || r.id || 'x')}.gif`;
  const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
  let data = null, tab = 'all';
  function render() {
    if (!data) return;
    const rows = data[tab] || [];
    $('[data-ct-list]').innerHTML = rows.length
      ? rows.map((r, i) => `<li class="ct-row${i < 3 ? ' top' : ''}"><span class="ct-rank">${medal(i)}</span><img class="ct-av" src="${avatar(r)}" alt="" width="36" height="36" loading="lazy"><span class="ct-name">${r.game ? esc(r.game) : r.anon ? `<span class="muted">${ko ? '익명 기여자' : 'Anonymous'}</span>` : esc(r.name || (ko ? '이름 없음' : 'No name'))}</span><span class="ct-detail">${ko ? `스캔 ${r.scans} · 판매 확인 ${r.gone}` : `${r.scans} scans · ${r.gone} sold`}</span><b class="ct-pts">${r.points}${ko ? '점' : ' pts'}</b></li>`).join('')
      : `<li class="muted">${ko ? '아직 기여자가 없어요. 첫 번째로 이름을 올려 보세요!' : 'No contributors yet. Be the first!'}</li>`;
    const a = tab === 'week' ? data.anonWeek : data.anonAll;
    $('[data-ct-anon]').textContent = a?.points ? (ko ? `로그인하지 않고 올린 분은 가장 많이 올린 상점의 게임 닉네임으로 보여요.` : `Uploads made without logging in show the in-game name of the shop uploaded most.`) : '';
    for (const b of root.querySelectorAll('[data-ct-tab]')) b.setAttribute('aria-pressed', String(b.dataset.ctTab === tab));
    const me = $('[data-ct-me]');
    const logged = !!(globalThis.gmsAuth?.().Authorization);
    me.hidden = false;
    me.innerHTML = data.me
      ? (ko ? `내 점수 · 최근 7일 <b>${data.me.week}점</b> · 전체 <b>${data.me.total}점</b>` : `Your points · last 7 days <b>${data.me.week}</b> · all time <b>${data.me.total}</b>`)
      : logged ? '' : (ko ? '디스코드로 로그인하고 올리면 내 이름과 점수가 여기에 올라가요. 오른쪽 위 <b>로그인</b> 버튼을 눌러 주세요.' : 'Log in with Discord before uploading and your name and points show up here. Use the <b>Log in</b> button at the top right.');
    if (!me.innerHTML) me.hidden = true;
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-ct-tab]'); if (b) { tab = b.dataset.ctTab; render(); } });
  let loaded = false;
  const load = () => {
    if (loaded) return; loaded = true;
    fetch(`${root.dataset.api}/contributors`, { headers: { ...(globalThis.gmsAuth?.() || {}) } })
      .then((r) => r.json()).then((d) => { data = d; render(); })
      .catch(() => { loaded = false; $('[data-ct-list]').innerHTML = `<li class="muted">${ko ? '순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' : 'Could not load the board. Please try again in a moment.'}</li>`; });
  };
  const dialog = root.closest('dialog');
  if (dialog) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-ct-open]')) { dialog.showModal(); load(); globalThis.track?.('contributors_open', { place: 'market' }); }
      else if (e.target.closest('[data-ct-close]') || e.target === dialog) dialog.close();
    });
  } else setTimeout(load, 400); // account.js may load after this module; a moment later the visitor's own points come back too
}
