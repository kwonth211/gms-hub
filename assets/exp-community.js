import { jobNames, rateNum } from './training-evidence.js';
// Player-measured EXP per hour on the training pages: runs players chose to share from the EXP tracker (worker
// /exp-runs/summary, median per route once 3+ players shared it). Each route row with data gets a small chip; the
// finder re-renders its list, so new rows are decorated as they appear.
const API = document.body.dataset.priceApi;
const ko = document.documentElement.lang === 'ko';
const fmt = (n) => (ko ? (n >= 10000 ? `${+(n / 10000).toFixed(1)}만` : n.toLocaleString('ko-KR')) : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
let data = null;

function decorate(root = document) {
  if (!data) return;
  for (const row of root.querySelectorAll('.tr-row[data-route]')) {
    const s = data.routes?.[row.dataset.route];
    if (!s || row.querySelector('.tr-community')) continue;
    const chip = document.createElement('span');
    chip.className = 'tr-community';
    chip.textContent = ko ? `유저 실측 ${fmt(s.perHour)}/h · ${s.players}명` : `Players measured ${fmt(s.perHour)}/h · ${s.players}`;
    chip.title = ko ? `경험치 측정기로 잰 ${s.runs}개 기록의 중간값 (레벨 ${s.lvMin}~${s.lvMax})` : `Median of ${s.runs} EXP tracker runs (levels ${s.lvMin}-${s.lvMax})`;
    row.querySelector('.tr-name strong')?.after(chip);
  }
}

fetch(`${API}/exp-runs/summary`).then((r) => (r.ok ? r.json() : null)).then((d) => {
  data = d;
  decorate();
  renderTable();
  const list = document.getElementById('tr-result');
  if (list) new MutationObserver(() => decorate(list)).observe(list, { childList: true, subtree: true });
}).catch(() => {});

function renderTable() {
  const target = document.getElementById('tr-live-rates');
  const source = document.getElementById('training-data');
  if (!target || !source) return;
  const routes = new Map(JSON.parse(source.textContent).routes.map(r => [r.id, r]));
  const lang = ko ? 'ko' : 'en';
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  target.innerHTML = (data?.groups || []).filter(g => routes.has(g.route)).map(g => {
    const r = routes.get(g.route);
    return `<tr class="tr-rate-report"><td>Lv ${g.lvMin}–${g.lvMax}</td><td><a href="#route-${esc(r.id)}">${esc(r.title[lang])}</a></td><td>${rateNum(g.perHour, lang)}</td><td>${g.netPerHour == null ? '—' : rateNum(g.netPerHour, lang)}</td><td><div class="tr-rate-who"><div class="tr-rp">${esc(jobNames[lang][g.job] || g.job)}</div><div class="tr-rp">${g.party === 1 ? (ko ? '솔로' : 'Solo') : `${g.party}${ko ? '인 파티' : ' players'}`}</div><div class="tr-rp tr-rp-basis">${ko ? '유저 자동 집계' : 'Player tracker'}</div></div><small>${g.players}${ko ? '명' : ' players'} · ${g.runs}${ko ? '회' : ' runs'} · ${g.minutes}${ko ? '분 측정 · 휴식 포함' : ' minutes · including breaks'}${g.netPerHour != null ? (ko ? ' · 소모품값 차감' : ' · net of supplies') : ''}${g.mob ? ` · ${esc(r.mobs?.find(m => m.id === g.mob)?.[lang] || (ko ? '몬스터 ' : 'Monster ') + g.mob)}` : ''}</small></td></tr>`;
  }).join('');
}
