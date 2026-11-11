// Character rankings: the worker's hourly ClassicRank snapshot (top 1,000 by level) and single-name lookups.
const root = document.getElementById('rank-page');
const ko = document.documentElement.lang === 'ko';
const api = document.body.dataset.priceApi;
const jobLinks = JSON.parse(root.dataset.jobs);
const nf = new Intl.NumberFormat(document.documentElement.lang);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (k, e, vars = {}) => (ko ? k : tx(e, vars)).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const $ = (id) => document.getElementById(id);

// Korean job names; other languages keep the game's English names.
const JOB_KO = { Beginner: '초보자', Swordsman: '검사', Archer: '아처', Magician: '매지션', Thief: '로그', Pirate: '해적',
  Fighter: '파이터', Page: '페이지', Spearman: '스피어맨', Hunter: '헌터', Crossbowman: '사수', Cleric: '클레릭',
  'Wizard (Fire/Poison)': '위자드(불,독)', 'Wizard (Ice/Lightning)': '위자드(썬,콜)', Assassin: '어쌔신', Bandit: '시프',
  Brawler: '인파이터', Gunslinger: '건슬링거' };
const jobName = (j) => (ko ? JOB_KO[j] || j : j);
const profile = (name) => `https://classicrank.com/user/${encodeURIComponent(name)}`;

let rows = [], family = '', shown = 100;

function bars(el, entries, total) {
  const max = Math.max(...entries.map(([, n]) => n), 1);
  el.innerHTML = entries.map(([label, n]) => `<li><span class="rank-bar-label">${esc(label)}</span><span class="rank-bar"><i style="width:${((n / max) * 100).toFixed(1)}%"></i></span><b>${nf.format(n)}</b><small>${((n / total) * 100).toFixed(1)}%</small></li>`).join('');
}

function insights() {
  const byJob = new Map();
  for (const r of rows) byJob.set(r.job, (byJob.get(r.job) || 0) + 1);
  bars($('rank-jobs'), [...byJob].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([j, n]) => [jobName(j), n]), rows.length);
  const bands = new Map();
  for (const r of rows) { const b = Math.floor(r.level / 5) * 5; bands.set(b, (bands.get(b) || 0) + 1); }
  bars($('rank-levels'), [...bands].sort((a, b) => b[0] - a[0]).map(([b, n]) => [`Lv. ${b}–${b + 4}`, n]), rows.length);
}

function render() {
  const q = $('rank-filter').value.trim().toLowerCase();
  const list = rows.filter((r) => (!family || r.family === family) && (!q || r.name.toLowerCase().includes(q)));
  $('rank-rows').innerHTML = list.slice(0, shown).map((r) => `<tr><td class="num">${r.rank}</td>
<td><a class="rank-char" href="${profile(r.name)}" target="_blank" rel="noopener"><img src="${esc(r.photo)}" alt="" width="32" height="32" loading="lazy"><span>${esc(r.name)}</span>${r.verified ? `<i class="rank-ok" title="${esc(tr('ClassicRank 인증', 'Verified on ClassicRank'))}">✔</i>` : ''}</a></td>
<td>${esc(jobName(r.job))}</td><td class="num"><b>${r.level}</b></td><td class="num">${r.fame ?? '–'}</td></tr>`).join('');
  $('rank-count').textContent = tr('{n}명 중 {s}명 표시', '{s} of {n} shown', { n: nf.format(list.length), s: nf.format(Math.min(shown, list.length)) });
  $('rank-more').hidden = list.length <= shown;
}

function statsLine(data) {
  const s = data.stats || {};
  const at = new Date(data.at);
  const item = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  $('rank-stats').innerHTML = [
    s.characters && item(tr('랭킹 등록 캐릭터', 'Ranked characters'), nf.format(s.characters)),
    s.highest_level && item(tr('최고 레벨', 'Highest level'), `Lv. ${s.highest_level}`),
    item(tr('상위 1,000명 커트라인', 'Level to make the top 1,000'), rows.length ? `Lv. ${rows[rows.length - 1].level}` : '–'),
    item(tr('갱신', 'Updated'), at.toLocaleString(document.documentElement.lang, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
  ].filter(Boolean).join('');
}

// A found character: rank and percentile, then the two things we can add: where to train now and the class guide.
function showMe(c, total) {
  const me = $('rank-me');
  const link = jobLinks[c.job];
  const pct = total && c.rank ? Math.max(0.01, (c.rank / total) * 100) : null;
  const train = `${root.dataset.train}?lv=${c.level}${link ? `&job=${link.job}` : ''}`;
  me.innerHTML = `<div class="rank-me-card"><img src="${esc(c.photo)}" alt="" width="64" height="64">
<div><strong>${esc(c.name)}</strong> <span class="muted">${esc(jobName(c.job))} · Lv. ${c.level}</span>
<p>${tr('종합 {r}위', 'Overall #{r}', { r: nf.format(c.rank) })}${c.jobRank ? ` · ${tr('{j} {r}위', '#{r} {j}', { j: jobName(c.job), r: nf.format(c.jobRank) })}` : ''}${pct ? ` · ${tr('상위 {p}%', 'top {p}%', { p: pct < 1 ? pct.toFixed(2) : pct.toFixed(1) })}` : ''}</p>
<p class="rank-me-links"><a class="btn small-btn" href="${esc(train)}">${tr('Lv. {l} 사냥터 추천 보기', 'Training spots for level {l}', { l: c.level })}</a>${link?.guide ? `<a class="btn ghost small-btn" href="${esc(link.guide)}">${tr('{j} 가이드', '{j} guide', { j: jobName(c.job) })}</a>` : ''}<a class="btn ghost small-btn" href="${profile(c.name)}" target="_blank" rel="noopener">ClassicRank</a></p></div></div>`;
  me.hidden = false;
}

$('rank-find').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('rank-name').value.trim();
  const me = $('rank-me');
  if (!/^[A-Za-z0-9]{2,13}$/.test(name)) { me.textContent = tr('캐릭터 이름은 영문·숫자 2~13자예요.', 'Names are 2 to 13 letters or digits.'); me.hidden = false; return; }
  me.textContent = tr('찾는 중…', 'Searching…'); me.hidden = false;
  try {
    const r = await fetch(`${api}/rank/lookup?name=${encodeURIComponent(name)}`);
    if (r.status === 404) { me.textContent = tr('랭킹에 없는 캐릭터예요. ClassicRank에서 먼저 등록해 보세요.', 'Not in the rankings yet. Add it on ClassicRank first.'); return; }
    if (!r.ok) throw new Error();
    showMe((await r.json()).data, window.__rankTotal);
    track('rank_lookup', { found: 1 });
    try { localStorage.setItem('gms-rank-me', name); } catch (x) {}
  } catch (x) { me.textContent = tr('지금은 찾을 수 없어요. 잠시 뒤 다시 해 주세요.', 'Lookup is unavailable right now. Try again shortly.'); }
});

root.querySelector('.chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-family]');
  if (!b) return;
  family = b.dataset.family; shown = 100;
  root.querySelectorAll('[data-family]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
  track('rank_family', { family: family || 'all' });
});
$('rank-filter').addEventListener('input', () => { shown = 100; render(); });
$('rank-more').addEventListener('click', () => { shown += 100; render(); });

(async () => {
  try {
    const r = await fetch(`${api}/rank`);
    if (!r.ok) throw new Error();
    const data = await r.json();
    rows = data.rows || [];
    window.__rankTotal = data.stats?.characters;
    statsLine(data); insights(); render();
  } catch (e) {
    $('rank-count').textContent = tr('랭킹을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.', 'Could not load the rankings. Please try again shortly.');
  }
  // Returning visitors see their own character again without typing.
  try { const saved = localStorage.getItem('gms-rank-me'); if (saved) { $('rank-name').value = saved; $('rank-find').requestSubmit(); } } catch (e) {}
})();
