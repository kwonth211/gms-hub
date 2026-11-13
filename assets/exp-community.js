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
  const list = document.getElementById('tr-result');
  if (list) new MutationObserver(() => decorate(list)).observe(list, { childList: true, subtree: true });
}).catch(() => {});
