// The glove attack quest guide as a quest log (/quests/glove-attack/, built by scripts/glove-quest.mjs): ticked steps
// stay in this browser, the first unticked step is "up next", and the island map draws the walk from that step's NPC to
// the next stop with its hunting grounds marked. Item and reward prices come from the site's free-market medians.
const D = JSON.parse(document.getElementById('gq-data').textContent);
const KEY = 'gms-glove-quest';
const $ = (id) => document.getElementById(id);
const fmt = (v) => Math.round(v).toLocaleString(D.lang === 'ko' ? 'ko-KR' : 'en-US');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const mesos = (v) => (D.lang === 'ko' ? (v >= 10000 ? `${+(v / 10000).toFixed(v >= 1e6 ? 0 : 1)}만` : fmt(v)) : v >= 1e6 ? `${+(v / 1e6).toFixed(2)}m` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : fmt(v));

let done = new Set();
try { done = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
let current = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch (e) {} };
const stepEl = (id) => document.querySelector(`.gq-step[data-q="${id}"]`);

// ---------- road ----------
// The picked part drawn as a one-way road: a stop per step with its place, NPC and what to bring. The road behind you
// is grey and every passed stop carries a check; the current stop has the bobbing "!" and your marker; hunting grounds
// hang under their stop as small flags.
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const placeName = (id) => (D.places[id] ? D.places[id][D.lang === 'ko' ? 'ko' : 'en'] : '');
function drawRoad(step) {
  const chain = D.chains.find((c) => c.steps.includes(step.id));
  document.getElementById('gq-road-title').textContent = chain.title;
  const road = document.getElementById('gq-road');
  road.innerHTML = chain.steps.map((id, i) => {
    const s = D.steps.find((x) => x.id === id);
    const state = id === step.id ? 'is-now' : done.has(id) ? 'is-past' : 'is-ahead';
    return `<li class="gq-stop ${state}${s.big ? ' is-big' : ''}" data-pick="${id}">
<div class="gq-stop-pin">${id === step.id ? `<span class="gq-stop-bang">!</span><span class="gq-me"></span>` : ''}<span class="gq-stop-dot">${done.has(id) && id !== step.id ? '✓' : i + 1}</span></div>
<div class="gq-stop-card"><div class="gq-stop-npc"><img src="${esc(s.npcImg)}" alt="" loading="lazy">${s.endImg ? `<i>→</i><img src="${esc(s.endImg)}" alt="" loading="lazy">` : ''}</div><b>${esc(placeName(s.at))}</b><span>${esc(s.npc)}${s.end ? ` → ${esc(s.end)}` : ''}</span>
${s.need.length ? `<ul>${s.need.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
${s.hunt.length ? `<div class="gq-stop-flags">${s.hunt.map((h) => `<i>${esc(D.t.hunt)} · ${esc(placeName(h))}</i>`).join('')}</div>` : ''}</div></li>`;
  }).join('');
  road.querySelector('.is-now')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
document.addEventListener('click', (e) => { const st = e.target.closest('.gq-stop'); if (st) select(Number(st.dataset.pick)); });

// ---------- state ----------
function render() {
  const steps = D.steps;
  for (const s of steps) {
    const el = stepEl(s.id);
    el.classList.toggle('is-done', done.has(s.id));
    el.querySelector('[data-done]').checked = done.has(s.id);
  }
  if (current == null || !steps.some((s) => s.id === current)) current = (steps.find((s) => !done.has(s.id)) || steps[steps.length - 1]).id;
  for (const el of document.querySelectorAll('.gq-step')) { const now = Number(el.dataset.q) === current; el.classList.toggle('is-current', now); el.classList.toggle('is-open', now || el.classList.contains('is-peek')); }
  // Only the picked step's part and card show on the right; the list on the left carries the state of every step.
  for (const c of document.querySelectorAll('.gq-chain')) c.classList.toggle('has-sel', !!c.querySelector(`.gq-step[data-q="${current}"]`));
  for (const b of document.querySelectorAll('.gq-pick')) { const id = Number(b.dataset.pick); b.classList.toggle('is-done', done.has(id)); b.classList.toggle('is-sel', id === current); }
  const step = steps.find((s) => s.id === current);
  drawRoad(step);
  const d = steps.filter((s) => done.has(s.id));
  const exp = d.reduce((a, s) => a + s.exp, 0);
  $('gq-bar').style.transform = `scaleX(${d.length / steps.length})`;
  $('gq-progress-text').textContent = !d.length ? D.t.none : d.length === steps.length ? D.t.all : fill(D.t.prog, { d: d.length, n: steps.length, e: fmt(exp) });
}
function select(id) {
  current = id; render();
  document.querySelector(`.gq-pick[data-pick="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  const top = document.getElementById('gq-world').getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * 0.6) document.getElementById('gq-world').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
document.body.classList.add('gq-js');
document.addEventListener('click', (e) => { const b = e.target.closest('.gq-pick, .gq-go-route'); if (b) select(Number(b.dataset.pick)); });
document.addEventListener('change', (e) => {
  const box = e.target.closest('[data-done]');
  if (!box) return;
  const id = Number(box.dataset.done);
  if (box.checked) done.add(id); else done.delete(id);
  save();
  if (box.checked && id === current) { const next = D.steps.find((s) => !done.has(s.id)); if (next) current = next.id; }
  if (!box.checked) current = id;
  render();
});
document.addEventListener('click', (e) => {
  const head = e.target.closest('.gq-step-head');
  // A finished or later step opens for a look without moving the current quest; the current one stays open.
  if (head && !e.target.closest('label, a, input')) { const li = head.closest('.gq-step'); if (!li.classList.contains('is-current')) { li.classList.toggle('is-peek'); li.classList.toggle('is-open', li.classList.contains('is-peek')); } }
});
$('gq-next').addEventListener('click', () => {
  done.add(current); save();
  const i = D.steps.findIndex((s) => s.id === current);
  const next = D.steps.slice(i + 1).find((s) => !done.has(s.id)) || D.steps.find((s) => !done.has(s.id));
  select(next ? next.id : current);
});
$('gq-prev').addEventListener('click', () => {
  const i = D.steps.findIndex((s) => s.id === current);
  if (i > 0) select(D.steps[i - 1].id);
});
render();

// ---------- prices ----------
(async () => {
  let p = {};
  // The prices endpoint binds two parameters per id, so it is asked in chunks of 30 (D1 caps bound parameters at 100).
  const chunks = [];
  for (let i = 0; i < D.prices.length; i += 30) chunks.push(D.prices.slice(i, i + 30));
  const parts = await Promise.all(chunks.map((c) => fetch(`${D.api}/prices?ids=${c.join(',')}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))));
  p = Object.assign({}, ...parts);
  const med = (id) => p[id]?.median || null;
  for (const el of document.querySelectorAll('[data-item]')) {
    const v = med(Number(el.dataset.item));
    if (!v) continue;
    const tag = el.matches('.gq-price') ? el : el.querySelector('.gq-price');
    if (tag) { tag.textContent = `≈ ${mesos(v)} ${D.t.mesos}`; tag.hidden = false; }
  }
  // Each materials tab sums what buying all of its items would cost.
  for (const table of document.querySelectorAll('.gq-shop-table')) {
    let total = 0, all = true;
    for (const tr of table.querySelectorAll('tbody tr[data-item]')) {
      const v = med(Number(tr.dataset.item)), q = Number(tr.dataset.qty);
      tr.querySelector('.gq-unit').textContent = v ? mesos(v) : '—';
      tr.querySelector('.gq-total').textContent = v ? mesos(v * q) : '—';
      if (v) total += v * q; else all = false;
    }
    table.querySelector('.gq-shop-sum').textContent = total ? `${all ? '' : '≥ '}${mesos(total)} ${D.t.mesos}` : '—';
  }
  // Each route's reward is an equal-chance pick among its scrolls, so its expected value is their average price.
  for (const dd of document.querySelectorAll('[data-ev]')) {
    const v = dd.dataset.ev.split(',').map((id) => med(Number(id)));
    if (v.every(Boolean)) dd.textContent = `${mesos(v.reduce((a, b) => a + b, 0) / v.length)} ${D.t.mesos}`;
  }
})();

// ---------- materials ----------
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.gq-tab');
  if (!tab) return;
  for (const t of document.querySelectorAll('.gq-tab')) { t.classList.toggle('is-on', t === tab); t.setAttribute('aria-selected', String(t === tab)); }
  for (const p of document.querySelectorAll('.gq-mat-pane')) p.hidden = p.dataset.pane !== tab.dataset.tab;
});
const HAVE = 'gms-glove-quest-have';
let have = new Set();
try { have = new Set(JSON.parse(localStorage.getItem(HAVE) || '[]')); } catch (e) {}
const paintHave = () => { for (const box of document.querySelectorAll('.gq-have')) { box.checked = have.has(Number(box.dataset.have)); box.closest('tr').classList.toggle('is-have', box.checked); } };
document.addEventListener('change', (e) => {
  const box = e.target.closest('.gq-have');
  if (!box) return;
  const id = Number(box.dataset.have);
  if (box.checked) have.add(id); else have.delete(id);
  try { localStorage.setItem(HAVE, JSON.stringify([...have])); } catch (x) {}
  paintHave();
});
paintHave();
