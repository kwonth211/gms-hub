// Equipment finder filters: my level, slot, and "near my level". Prefills from the saved character.
import { loadChar } from './my-char.js';

const root = document.querySelector('[data-eq]');
const form = document.getElementById('eq-filters');
if (root && form) {
  form.hidden = false;
  const rows = [...root.querySelectorAll('tr[data-lv]')];
  const groups = [...root.querySelectorAll('.eq-group')];
  const count = document.getElementById('eq-count');
  const saved = loadChar();
  const params = new URLSearchParams(location.search);
  form.lv.value = params.get('lv') || saved?.lv || '';
  form.sub.value = params.get('sub') || '';
  const apply = (user) => {
    const lv = Number(form.lv.value) || 0, sub = form.sub.value, near = form.near.checked;
    let shown = 0;
    for (const r of rows) {
      const need = Number(r.dataset.lv);
      const ok = (!lv || need <= lv) && (!near || !lv || need >= lv - 10) && (!sub || r.dataset.sub === sub);
      r.hidden = !ok;
      if (ok) shown++;
    }
    for (const g of groups) g.hidden = !g.querySelector('tr[data-lv]:not([hidden])');
    count.textContent = String(shown);
    if (user && window.track) window.track('equipment_filter', { level: lv, slot: sub || 'all' });
  };
  form.addEventListener('input', () => apply(true));
  form.addEventListener('submit', (e) => e.preventDefault());
  apply(false);
}
