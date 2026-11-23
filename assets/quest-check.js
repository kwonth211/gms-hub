// Quest checklists (/quests/, /quests/best-exp/, /quests/best-meso/; cards built by scripts/quest-pages.mjs questCard).
// A tick marks the quest finished everywhere it appears: the same quest in "TOP 10" and in its level band, on the other
// list pages, and as a step in its guide (assets/quest-route.js reads the same key). The list lives in localStorage, so the
// Discord login carries it between devices like every other gms-* setting.
const KEY = 'gms-quests-done', HIDE = 'gms-quests-hide';
const root = document.querySelector('[data-qc]');
const bar = root.querySelector('[data-qc-bar]');
const rows = [...root.querySelectorAll('.qc')];
const secs = [...root.querySelectorAll('.qc-sec')];
const ids = new Set(rows.map((r) => r.dataset.q));
const fmt = (v) => Math.round(v).toLocaleString(document.documentElement.lang === 'ko' ? 'ko-KR' : 'en-US');

let done = new Set();
const load = () => { try { done = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').map(String)); } catch (e) { done = new Set(); } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...done].map(Number))); } catch (e) {} };
let hide = false;
try { hide = localStorage.getItem(HIDE) === '1'; } catch (e) {}

const search = root.querySelector('[data-qc-search]'), myLv = root.querySelector('[data-qc-lv]');
// What the search looks through: everything a card says (quest, NPC, area, item and monster names).
const textOf = new Map();
const hay = (r) => { if (!textOf.has(r)) textOf.set(r, r.textContent.toLowerCase()); return textOf.get(r); };

function paint() {
  const q = (search?.value || '').trim().toLowerCase(), lv = Number(myLv?.value) || 0;
  const filtering = !!q || !!lv;
  for (const r of rows) {
    const d = done.has(r.dataset.q);
    r.classList.toggle('is-done', d);
    r.querySelector('.qc-box').checked = d;
    r.hidden = (hide && d) || (!!q && !hay(r).includes(q)) || (!!lv && Number(r.dataset.lv) > lv);
  }
  for (const el of root.querySelectorAll('[data-ref]')) el.classList.toggle('is-done', done.has(el.dataset.ref));
  let shownSecs = 0;
  for (const s of secs) {
    const mine = [...s.querySelectorAll('.qc')];
    const d = mine.filter((r) => done.has(r.dataset.q)).length, shown = mine.filter((r) => !r.hidden).length;
    const tag = s.querySelector('[data-qc-count]');
    tag.textContent = `${d}/${mine.length}`;
    tag.classList.toggle('is-all', d === mine.length);
    // A section emptied by the search or level box goes away; one emptied by "hide finished" says so instead.
    s.hidden = filtering && !shown;
    s.querySelector('.qc-empty').hidden = filtering || shown > 0;
    if (!s.hidden) shownSecs++;
  }
  const none = root.querySelector('[data-qc-none]');
  if (none) none.hidden = shownSecs > 0;
  const mineDone = [...ids].filter((id) => done.has(id));
  bar.querySelector('[data-qc-d]').textContent = fmt(mineDone.length);
  bar.querySelector('[data-qc-meter]').style.transform = `scaleX(${ids.size ? mineDone.length / ids.size : 0})`;
  const sum = bar.querySelector('[data-qc-sum]');
  if (sum) {
    const v = mineDone.reduce((a, id) => a + Number(rows.find((r) => r.dataset.q === id).dataset[sum.dataset.qcSum] || 0), 0);
    sum.hidden = !v;
    sum.querySelector('b').textContent = fmt(v);
  }
  bar.querySelector('[data-qc-hide]').checked = hide;
}

root.addEventListener('change', (e) => {
  const box = e.target.closest('.qc-box');
  if (box) {
    const row = box.closest('.qc'), id = row.dataset.q;
    if (box.checked) { done.add(id); row.querySelector('details').open = false; } else done.delete(id);
    save();
    paint();
    if (box.checked && !row.hidden) { row.classList.remove('is-pop'); void row.offsetWidth; row.classList.add('is-pop'); }
    return;
  }
  if (e.target.matches('[data-qc-hide]')) {
    hide = e.target.checked;
    try { if (hide) localStorage.setItem(HIDE, '1'); else localStorage.removeItem(HIDE); } catch (x) {}
    paint();
  }
});
search?.addEventListener('input', paint);
myLv?.addEventListener('input', paint);
const all = bar.querySelector('[data-qc-all]');
all.addEventListener('click', () => {
  const open = !all.classList.contains('is-open');
  all.classList.toggle('is-open', open);
  for (const r of rows) if (!r.hidden || !open) r.querySelector('details').open = open;
});
// Another tab, or the account sync, changed the list.
addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { load(); paint(); } });
addEventListener('gms-account-sync', () => { load(); try { hide = localStorage.getItem(HIDE) === '1'; } catch (e) {} paint(); });

load();
bar.hidden = false;
root.classList.add('qc-js');
paint();
