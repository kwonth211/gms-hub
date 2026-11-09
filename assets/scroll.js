const data = JSON.parse(document.getElementById('scroll-data').textContent);
const i18n = JSON.parse(document.getElementById('i18n').textContent);
const form = document.getElementById('sc-form');
const out = document.getElementById('sc-results');
const distEl = document.getElementById('sc-dist');
const customGain = document.getElementById('custom-gain');
const nf = new Intl.NumberFormat(i18n.lang, { maximumFractionDigits: 2 });
const pct = (x) => `${nf.format(x * 100)}%`;
const set = (k, v) => (out.querySelector(`[data-k="${k}"]`).textContent = v);

// Exact distribution by dynamic programming: alive[k] = P(item intact with k passes so far).
// A destroyed item stops the run, so later scrolls are never used.
function compute(count, tier) {
  const p = tier.success / 100;
  const boomOnFail = tier.destroyOnFail / 100;
  let alive = [1];
  let boom = 0;
  let used = 0;
  for (let i = 0; i < count; i++) {
    const next = new Array(alive.length + 1).fill(0);
    alive.forEach((prob, k) => {
      used += prob;
      next[k + 1] += prob * p;
      next[k] += prob * (1 - p) * (1 - boomOnFail);
      boom += prob * (1 - p) * boomOnFail;
    });
    alive = next;
  }
  return { alive, boom, used };
}

function render() {
  customGain.hidden = form.ladder.value !== 'custom';
  const count = Math.max(1, Math.min(15, parseInt(form.count.value, 10) || 1));
  const tier = data.tiers.find((t) => t.id === form.tier.value);
  const ladder = data.ladders.find((l) => l.id === form.ladder.value);
  const gain = ladder ? ladder.gains[tier.id] : parseFloat(form.gain.value) || 0;
  const price = parseFloat(form.price.value) || 0;
  const { alive, boom, used } = compute(count, tier);
  const survive = 1 - boom;
  const passes = survive > 0 ? alive.reduce((s, prob, k) => s + prob * k, 0) / survive : 0;
  set('gain', `+${nf.format(passes * gain)}`);
  set('pass', nf.format(passes));
  set('all', pct(alive[count]));
  set('boom', pct(boom));
  set('used', nf.format(used));
  set('cost', new Intl.NumberFormat(i18n.lang).format(Math.round(used * price)));

  renderCompare(count, ladder);
  const rows = alive.map((prob, k) => ({ label: i18n.distSucc.replace('{k}', k), prob, cls: '' })).reverse();
  if (boom > 0) rows.push({ label: i18n.distBoom, prob: boom, cls: 'boom' });
  const max = Math.max(...rows.map((r) => r.prob));
  distEl.innerHTML = rows
    .filter((r) => r.prob > 0)
    .map(
      (r) =>
        `<div class="dist-row ${r.cls}"><span>${r.label}</span><span class="dist-bar"><i style="width:${max ? (r.prob / max) * 100 : 0}%"></i></span><b>${pct(r.prob)}</b></div>`
    )
    .join('');
}

// Same type and count, every tier side by side: players asking "Lesser or Intermediate?" otherwise had to switch the tier
// one at a time. A destroyed item counts as no gain, and as worse than the guaranteed Lesser result.
const compareBody = document.querySelector('#sc-compare tbody');
const prices = {};
function renderCompare(count, ladder) {
  const gainOf = (tier) => (ladder ? ladder.gains[tier.id] : parseFloat(form.gain.value) || 0);
  const lesser = data.tiers.find((t) => t.id === 'lesser');
  const floor = count * gainOf(lesser);
  compareBody.innerHTML = data.tiers
    .map((tier) => {
      const g = gainOf(tier);
      const { alive, boom, used } = compute(count, tier);
      const mean = alive.reduce((sum, prob, k) => sum + prob * k * g, 0);
      const worse = boom + alive.reduce((sum, prob, k) => sum + (k * g < floor ? prob : 0), 0);
      const price = prices[tier.id] || 0;
      const perPoint = price && mean ? new Intl.NumberFormat(i18n.lang).format(Math.round((used * price) / mean)) : '—';
      return `<tr><td>${i18n.tierNames[tier.id]} (${tier.success}%)</td><td>+${nf.format(mean)}</td><td>${tier.id === 'lesser' ? '—' : pct(worse)}</td><td>${boom ? pct(boom) : '—'}</td><td><input type="number" min="0" step="1000" inputmode="numeric" data-tier="${tier.id}" value="${price || ''}" aria-label="${i18n.tierNames[tier.id]}"></td><td>${perPoint}</td></tr>`;
    })
    .join('');
}
compareBody.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-tier]');
  if (!input) return;
  prices[input.dataset.tier] = parseFloat(input.value) || 0;
  render();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  render();
});
form.addEventListener('input', render);
// One event per settled calculation rather than per keystroke.
let calcTimer;
form.addEventListener('input', () => {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(() => track('scroll_calc', Object.fromEntries(new FormData(form))), 1500);
});
render();
