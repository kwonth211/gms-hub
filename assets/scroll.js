const data = JSON.parse(document.getElementById('scroll-data').textContent);
const i18n = JSON.parse(document.getElementById('i18n').textContent);
const form = document.getElementById('sc-form');
const out = document.getElementById('sc-results');
const distEl = document.getElementById('sc-dist');
const nf = new Intl.NumberFormat(i18n.lang, { maximumFractionDigits: 2 });
const pct = (x) => `${nf.format(x * 100)}%`;
const set = (k, v) => (out.querySelector(`[data-k="${k}"]`).textContent = v);

// Exact distribution by dynamic programming: alive[k] = P(item intact with k passes so far).
function compute(slots, scroll) {
  const p = scroll.success / 100;
  const boomOnFail = scroll.destroyOnFail / 100;
  let alive = [1];
  let boom = 0;
  let scrollsUsed = 0;
  for (let i = 0; i < slots; i++) {
    const next = new Array(alive.length + 1).fill(0);
    alive.forEach((prob, k) => {
      scrollsUsed += prob;
      next[k + 1] += prob * p;
      next[k] += prob * (1 - p) * (1 - boomOnFail);
      boom += prob * (1 - p) * boomOnFail;
    });
    alive = next;
  }
  return { alive, boom, scrollsUsed };
}

function render() {
  const slots = Math.max(1, Math.min(15, parseInt(form.slots.value, 10) || 1));
  const scroll = data.scrolls.find((s) => s.id === form.scroll.value);
  const stat = parseFloat(form.stat.value) || 0;
  const price = parseFloat(form.price.value) || 0;
  const { alive, boom, scrollsUsed } = compute(slots, scroll);
  const survive = 1 - boom;
  const expSucc = survive > 0 ? alive.reduce((s, prob, k) => s + prob * k, 0) / survive : 0;
  set('succ', nf.format(expSucc));
  set('stat', `+${nf.format(expSucc * stat)}`);
  set('all', pct(alive[slots]));
  set('boom', pct(boom));
  set('cost', new Intl.NumberFormat(i18n.lang).format(Math.round(scrollsUsed * price)));

  const rows = alive
    .map((prob, k) => ({ label: i18n.distSucc.replace('{k}', k), prob, cls: '' }))
    .reverse();
  if (boom > 0) rows.push({ label: i18n.distBoom, prob: boom, cls: 'boom' });
  const max = Math.max(...rows.map((r) => r.prob));
  distEl.innerHTML = rows
    .map(
      (r) =>
        `<div class="dist-row ${r.cls}"><span>${r.label}</span><span class="dist-bar"><i style="width:${max ? (r.prob / max) * 100 : 0}%"></i></span><b>${pct(r.prob)}</b></div>`
    )
    .join('');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  render();
});
form.addEventListener('change', render);
render();
