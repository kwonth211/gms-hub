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
  // Higher on the board, stronger monster (owner, 2026-11-21): 1st Crimson Balrog down to Clang at 20th.
  const RANK_MOBS = [[700005, '크림슨 발록', 'Crimson Balrog'], [700001, '주니어 발록', 'Jr. Balrog'], [700008, '파우스트', 'Faust'], [53, '타우로스피어', 'Taurospear'],
    [69, '스켈레톤 지휘관', 'Skeleton Commander'], [52, '타우로마시스', 'Tauromacis'], [50, '레드 드레이크', 'Red Drake'], [51, '와일드카고', 'Wild Kargo'],
    [49, '다크 스톤골렘', 'Dark Stone Golem'], [700003, '썩은 머쉬맘', 'Blue Mushmom'], [48, '스톤골렘', 'Stone Golem'], [45, '드레이크', 'Drake'],
    [46, '크로코', 'Croco'], [43, '레이스', 'Wraith'], [59, '라플레시아', 'Rafflesia'], [40, '카파 드레이크', 'Copper Drake'], [65, '스켈독', 'Skelegon dog'],
    [41, '엄티', 'Umti'], [66, '머미독', 'Mummydog'], [44, '클랑', 'Clang']];
  const mobFor = (r, i) => RANK_MOBS[i] || [pick(r.game || r.name || r.id || 'x'), '', ''];
  const avatar = (r, i) => `/assets/contrib/${mobFor(r, i)[0]}.png`; // cropped to the monster, see assets/contrib
  const mobName = (r, i) => mobFor(r, i)[ko ? 1 : 2];
  // What they did, in plain words: items uploaded, or for someone who only reported sold listings, those reports.
  const countLabel = (r) => r.scans ? (ko ? `아이템 ${r.scans.toLocaleString()}개` : `${r.scans.toLocaleString()} items`) : (ko ? `판매 확인 ${r.gone.toLocaleString()}건` : `${r.gone.toLocaleString()} sold reports`);
  const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
  let data = null, tab = 'all';
  function render() {
    if (!data) return;
    const rows = data[tab] || [];
    $('[data-ct-list]').setAttribute('aria-busy', 'false');
    $('[data-ct-list]').innerHTML = rows.length
      ? rows.map((r, i) => `<li class="ct-row${i < 3 ? ' top' : ''}"><span class="ct-rank">${medal(i)}</span><img class="ct-av" src="${avatar(r, i)}" alt="${esc(mobName(r, i))}" title="${esc(mobName(r, i))}" width="44" height="44" loading="lazy"><span class="ct-name">${r.game ? esc(r.game) : r.anon ? `<span class="muted">${ko ? '익명 기여자' : 'Anonymous'}</span>` : esc(r.name || (ko ? '이름 없음' : 'No name'))}</span><span class="ct-detail">${esc(mobName(r, i))}${r.gone && r.scans ? (ko ? ` · 판매 확인 ${r.gone}건` : ` · ${r.gone} sold reports`) : ''}</span><b class="ct-pts">${countLabel(r)}</b></li>`).join('')
      : `<li class="muted">${ko ? '아직 기여자가 없어요. 첫 번째로 이름을 올려 보세요!' : 'No contributors yet. Be the first!'}</li>`;
    const a = tab === 'week' ? data.anonWeek : data.anonAll;
    $('[data-ct-anon]').textContent = a?.points ? (ko ? `로그인하지 않고 올린 분은 가장 많이 올린 상점의 게임 닉네임으로 보여요.` : `Uploads made without logging in show the in-game name of the shop uploaded most.`) : '';
    for (const b of root.querySelectorAll('[data-ct-tab]')) b.setAttribute('aria-pressed', String(b.dataset.ctTab === tab));
    const me = $('[data-ct-me]');
    const logged = !!(globalThis.gmsAuth?.().Authorization);
    me.hidden = false;
    me.innerHTML = data.me
      ? (ko ? `내가 올린 것 · 최근 7일 <b>${data.me.week}개</b> · 전체 <b>${data.me.total}개</b>` : `Yours · last 7 days <b>${data.me.week}</b> · all time <b>${data.me.total}</b>`)
      : logged ? '' : (ko ? '디스코드로 로그인하고 올리면 내가 올린 개수가 여기에 나와요. 오른쪽 위 <b>로그인</b> 버튼을 눌러 주세요.' : 'Log in with Discord before uploading and your name and points show up here. Use the <b>Log in</b> button at the top right.');
    if (!me.innerHTML) me.hidden = true;
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-ct-tab]'); if (b) { tab = b.dataset.ctTab; render(); } });
  let loaded = false;
  const load = () => {
    if (loaded) return; loaded = true;
    fetch(`${root.dataset.api}/contributors`, { headers: { ...(globalThis.gmsAuth?.() || {}) } })
      .then((r) => r.json()).then((d) => { data = d; render(); })
      .catch(() => { loaded = false; $('[data-ct-list]').setAttribute('aria-busy', 'false'); $('[data-ct-list]').innerHTML = `<li class="muted">${ko ? '순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' : 'Could not load the board. Please try again in a moment.'}</li>`; });
  };
  const dialog = root.closest('dialog');
  if (dialog) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-ct-open]')) { dialog.showModal(); load(); globalThis.track?.('contributors_open', { place: 'market' }); }
      else if (e.target.closest('[data-ct-close]') || e.target === dialog) dialog.close();
    });
  } else setTimeout(load, 400); // account.js may load after this module; a moment later the visitor's own points come back too
}
