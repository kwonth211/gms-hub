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

// ---------- map ----------
// Every step is one leg: from the NPC to the next stop (or its first hunting ground). Finished legs stay on the map as a
// grey trail of footprints, the current leg is drawn bright with a marker walking it, later legs are not shown yet.
const NS = 'http://www.w3.org/2000/svg';
const pt = (id) => { const p = D.places[id]; return p ? { x: p.x * D.sx, y: p.y * D.sy } : null; };
const legPath = (a, b) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.max(30, Math.abs(a.x - b.x) * 0.18); return `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`; };
const legOf = (s) => { const to = s.go || s.hunt[0]; return to && to !== s.at ? [s.at, to] : null; };
function drawMap(step) {
  const trail = document.getElementById('gq-trail');
  trail.textContent = '';
  for (const g of document.querySelectorAll('.gq-place')) g.classList.remove('is-at', 'is-go', 'is-hunt', 'is-visited');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const s of D.steps) {
    if (!done.has(s.id) || s.id === step?.id) continue;
    for (const id of [s.at, s.go, ...s.hunt]) if (id) document.querySelector(`.gq-place[data-place="${id}"]`)?.classList.add('is-visited');
    const leg = legOf(s);
    if (!leg) continue;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', legPath(pt(leg[0]), pt(leg[1])));
    path.setAttribute('class', 'gq-leg-done');
    trail.append(path);
  }
  if (!step) return;
  document.querySelector(`.gq-place[data-place="${step.at}"]`)?.classList.add('is-at');
  for (const h of step.hunt) document.querySelector(`.gq-place[data-place="${h}"]`)?.classList.add('is-hunt');
  if (step.go) document.querySelector(`.gq-place[data-place="${step.go}"]`)?.classList.add('is-go');
  const leg = legOf(step);
  if (!leg) return;
  const d = legPath(pt(leg[0]), pt(leg[1]));
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', 'gq-leg-now');
  path.setAttribute('marker-end', 'url(#gq-arrow)');
  trail.append(path);
  if (!reduce) {
    const walker = document.createElementNS(NS, 'circle');
    walker.setAttribute('r', '8');
    walker.setAttribute('class', 'gq-walker');
    const move = document.createElementNS(NS, 'animateMotion');
    move.setAttribute('dur', '2.6s'); move.setAttribute('repeatCount', 'indefinite'); move.setAttribute('path', d);
    walker.append(move);
    trail.append(walker);
  }
}

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
  const step = steps.find((s) => s.id === current);
  $('gq-now-title').textContent = step.name;
  $('gq-now-text').textContent = step.do;
  drawMap(step);
  const d = steps.filter((s) => done.has(s.id));
  const exp = d.reduce((a, s) => a + s.exp, 0);
  $('gq-bar').style.transform = `scaleX(${d.length / steps.length})`;
  $('gq-progress-text').textContent = !d.length ? D.t.none : d.length === steps.length ? D.t.all : fill(D.t.prog, { d: d.length, n: steps.length, e: fmt(exp) });
}
function select(id, scroll) {
  current = id; render();
  if (scroll) stepEl(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}
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
  select(next ? next.id : current, true);
});
$('gq-prev').addEventListener('click', () => {
  const i = D.steps.findIndex((s) => s.id === current);
  if (i > 0) select(D.steps[i - 1].id, true);
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
  let total = 0, all = true;
  for (const tr of document.querySelectorAll('.gq-shop-table tbody tr')) {
    const v = med(Number(tr.dataset.item)), q = Number(tr.dataset.qty);
    tr.querySelector('.gq-unit').textContent = v ? mesos(v) : '—';
    tr.querySelector('.gq-total').textContent = v ? mesos(v * q) : '—';
    if (v) total += v * q; else all = false;
  }
  $('gq-shop-total').textContent = total ? `${all ? '' : '≥ '}${mesos(total)} ${D.t.mesos}` : '—';
  const a = med(D.ev.a), m = med(D.ev.m);
  if (a && m) { $('gq-ev').textContent = `${mesos((a + m) / 2)} ${D.t.mesos}`; $('gq-ev-note').textContent = fill(D.t.ev, { a: mesos(a), m: mesos(m) }); }
})();
