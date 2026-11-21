// /contributors/: the contributor leaderboard from the worker's /contributors (worker/src/contributors.js).
// Logged-in visitors (assets/account.js) also see their own points.
const root = document.querySelector('[data-contributors]');
if (root) {
  const ko = root.dataset.lang === 'ko';
  const $ = (s) => root.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const avatar = (r) => (r.avatar ? `https://cdn.discordapp.com/avatars/${r.id}/${r.avatar}.png?size=64` : 'https://cdn.discordapp.com/embed/avatars/0.png');
  const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
  let data = null, tab = 'week';
  function render() {
    if (!data) return;
    const rows = data[tab] || [];
    $('[data-ct-list]').innerHTML = rows.length
      ? rows.map((r, i) => `<li class="ct-row${i < 3 ? ' top' : ''}"><span class="ct-rank">${medal(i)}</span><img class="ct-av" src="${avatar(r)}" alt="" width="36" height="36" loading="lazy"><span class="ct-name">${esc(r.name || (ko ? '이름 없음' : 'No name'))}</span><span class="ct-detail">${ko ? `스캔 ${r.scans} · 판매 확인 ${r.gone}` : `${r.scans} scans · ${r.gone} sold`}</span><b class="ct-pts">${r.points}${ko ? '점' : ' pts'}</b></li>`).join('')
      : `<li class="muted">${ko ? '아직 로그인한 기여자가 없어요. 첫 번째로 이름을 올려 보세요!' : 'No logged-in contributors yet. Be the first!'}</li>`;
    const a = tab === 'week' ? data.anonWeek : data.anonAll;
    $('[data-ct-anon]').textContent = a?.points ? (ko ? `로그인하지 않은 기여 ${a.points}점 · ${a.people}명도 시세를 채워 주고 있어요. 디스코드로 로그인하면 이름이 올라가요.` : `${a.points} points from ${a.people} people who are not logged in. Log in with Discord to get your name up here.`) : '';
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
  // account.js may load after this module; wait a moment so a logged-in visitor's own points come back too.
  setTimeout(() => {
    fetch(`${root.dataset.api}/contributors`, { headers: { ...(globalThis.gmsAuth?.() || {}) } })
      .then((r) => r.json()).then((d) => { data = d; render(); })
      .catch(() => { $('[data-ct-list]').innerHTML = `<li class="muted">${ko ? '순위를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.' : 'Could not load the board. Please reload in a moment.'}</li>`; });
  }, 400);
}
