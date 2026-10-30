const i18n = JSON.parse(document.getElementById('i18n').textContent);
const form = document.getElementById('drop-form');
const out = document.getElementById('drop-results');
const nf = new Intl.NumberFormat(i18n.lang, { maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat(i18n.lang);
const set = (k, v) => (out.querySelector(`[data-k="${k}"]`).textContent = v);
const times = (n) => `${nfInt.format(n)}${i18n.times}`;

function render() {
  const p = Math.min(1, Math.max(0, (parseFloat(form.rate.value) || 0) / 100));
  const n = Math.max(0, parseInt(form.kills.value, 10) || 0);
  if (p <= 0) return;
  set('p', `${nf.format((1 - (1 - p) ** n) * 100)}%`);
  set('exp', nf.format(n * p));
  const need = (c) => (p >= 1 ? 1 : Math.ceil(Math.log(1 - c) / Math.log(1 - p)));
  set('n50', times(need(0.5)));
  set('n90', times(need(0.9)));
  set('n99', times(need(0.99)));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  render();
});
form.addEventListener('input', render);
let calcTimer;
form.addEventListener('input', () => {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(() => track('drop_calc', { rate: form.rate.value }), 1500);
});
render();

const table = document.getElementById('drop-db');
// Any rate row (monster drops or official box rates) loads into the calculator.
document.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-rate]');
  if (!row || e.target.closest('a')) return;
  form.rate.value = row.dataset.rate;
  track('rate_pick', { rate: row.dataset.rate, box: row.closest('[data-box-panel]')?.dataset.boxPanel || 'monster' });
  render();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.closest?.('tr[data-rate]')?.click();
});

document.querySelectorAll('[data-box]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-box]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    track('box_tab', { box: tab.dataset.box });
    document.querySelectorAll('[data-box-panel]').forEach((p) => (p.hidden = p.dataset.boxPanel !== tab.dataset.box));
  })
);

const search = document.getElementById('db-search');
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  table.querySelectorAll('tr[data-search]').forEach((r) => (r.hidden = q !== '' && !r.dataset.search.includes(q)));
});
