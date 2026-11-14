// /skills/ in the browser: pick a class and a 2nd job, switch between builds, and drag the character level to watch the
// skill window fill the way the build spends its points. The page is fully rendered without this script.
import { POOLS, levelsAt, spAt } from './skill-tree.js';

// Sentences come from hidden templates in the page, so they are translated with it (zh/ja too).
const tpl = (key, vars) => (document.querySelector(`[data-tpl="${key}"]`)?.textContent || '').replace(/%(\w)/g, (_, k) => vars[k] ?? '');

// Every interaction is counted with the class, job and build it happened on (GA4 event dimensions page_type,
// ui_area = class, ui_label = job, ui_value = what was chosen), so the briefing can tell which jobs people study.
const track = (name, p) => window.track?.(name, { page_type: 'skills', ...p });
const jobOf = (el) => el.closest('[data-job-panel]')?.querySelector('.sk-job-name')?.childNodes[0]?.textContent.trim() || '1st';

// ---------- class picker (with #warrior style links) ----------
const classes = [...document.querySelectorAll('.sk-class')];
const picks = [...document.querySelectorAll('[data-pick]')];
function showClass(id, scroll) {
  if (!classes.some((c) => c.id === id)) id = classes[0]?.id;
  for (const c of classes) c.hidden = c.id !== id;
  for (const p of picks) p.toggleAttribute('aria-current', p.dataset.pick === id);
  if (scroll) document.querySelector('.sk-body')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
for (const p of picks) p.addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', `#${p.dataset.pick}`); showClass(p.dataset.pick, true); track('skills_class', { ui_area: p.dataset.pick, ui_value: p.dataset.pick }); });

// ---------- 2nd job tabs ----------
for (const cls of classes) {
  const btns = [...cls.querySelectorAll('[data-job]')];
  const panels = [...cls.querySelectorAll('[data-job-panel]')];
  const show = (job) => {
    for (const b of btns) b.setAttribute('aria-selected', String(b.dataset.job === job));
    for (const p of panels) p.hidden = p.dataset.jobPanel !== job;
  };
  btns.forEach((b) => b.addEventListener('click', (e) => { show(b.dataset.job); if (e.isTrusted) track('skills_job', { ui_area: cls.id, ui_label: b.textContent.trim(), ui_value: b.dataset.job }); }));
  if (btns[0]) show(btns[0].dataset.job);
}

const fromHash = () => {
  const h = location.hash.slice(1);
  const [cls, job] = h.split('-');
  showClass(cls, false);
  if (job) document.querySelector(`#${cls} [data-job="${job}"]`)?.click();
};
fromHash();
if (location.hash) track('skills_deeplink', { ui_value: location.hash.slice(1, 40) });
addEventListener('hashchange', fromHash);

// ---------- one skill window: builds + level slider ----------
for (const el of document.querySelectorAll('.sk-tree')) {
  const data = JSON.parse(el.dataset.tree);
  const pool = POOLS[data.pool];
  const input = el.querySelector('[data-level-input]');
  const nodes = new Map([...el.querySelectorAll('[data-skill]')].map((n) => [Number(n.dataset.skill), n]));
  const names = new Map([...nodes].map(([id, n]) => [id, n.querySelector('.sk-name b').textContent]));
  let build = data.builds[0];

  function render(level) {
    const sp = spAt(pool, level);
    const lv = levelsAt(build.steps, sp);
    const before = levelsAt(build.steps, spAt(pool, level - 1));
    let used = 0;
    for (const [id, n] of nodes) {
      const v = lv[id] || 0;
      used += v;
      const master = Number(n.dataset.master);
      n.querySelector('[data-lv]').textContent = v;
      n.querySelector('.sk-bar i').style.width = `${Math.round((v / master) * 100)}%`;
      n.classList.toggle('is-zero', !v);
      n.classList.toggle('is-max', v >= master);
      n.classList.toggle('is-new', v > (before[id] || 0) && level > pool.base);
    }
    el.querySelector('[data-level]').textContent = level;
    el.querySelector('[data-level-label]').textContent = `Lv ${level}`;
    el.querySelector('[data-sp-used]').textContent = used;
    el.querySelector('[data-sp-left]').textContent = Math.max(0, sp - used);
    const panel = el.querySelector(`[data-build-panel="${build.id}"]`);
    for (const li of panel.querySelectorAll('[data-step-at]')) {
      const at = Number(li.dataset.stepAt), from = Number(li.dataset.stepFrom);
      li.classList.toggle('is-done', at <= level);
      li.classList.toggle('is-now', from <= level && level < at);
    }
    // What this level adds, in words.
    const gained = [...nodes.keys()].filter((id) => (lv[id] || 0) > (before[id] || 0)).map((id) => `${names.get(id)} +${lv[id] - (before[id] || 0)}`);
    const now = el.querySelector('[data-now]');
    now.hidden = false;
    now.textContent = level === pool.base
      ? tpl('advance', { L: level, S: gained.join(', ') })
      : tpl(gained.length ? 'at' : 'done', { L: level, S: gained.join(', ') });
  }

  input.addEventListener('input', () => render(Number(input.value)));
  input.addEventListener('change', () => track('skills_level', { ui_area: el.closest('.sk-class')?.id, ui_label: jobOf(el), ui_value: `${build.id}:${input.value}` }));
  for (const b of el.querySelectorAll('[data-build]')) {
    b.addEventListener('click', () => {
      build = data.builds.find((x) => x.id === b.dataset.build);
      for (const o of el.querySelectorAll('[data-build]')) o.setAttribute('aria-selected', String(o === b));
      for (const p of el.querySelectorAll('[data-build-panel]')) p.hidden = p.dataset.buildPanel !== build.id;
      render(Number(input.value));
      track('skills_build', { ui_area: el.closest('.sk-class')?.id, ui_label: jobOf(el), ui_value: build.id });
    });
  }
  // Clicking a step jumps the slider to the level where that step finishes.
  for (const li of el.querySelectorAll('[data-step-at]')) {
    li.tabIndex = 0;
    const go = () => { input.value = li.dataset.stepAt; render(Number(input.value)); track('skills_step', { ui_area: el.closest('.sk-class')?.id, ui_label: jobOf(el), ui_value: `${build.id}:${li.dataset.stepAt}` }); };
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  render(Number(input.value));
}
