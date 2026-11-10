// "My character": class and level saved in this browser, so the home page and the training finder open on the
// routes that fit right now. Nothing leaves the browser; a level-up is one tap.
import { selectRoutes, jobNames } from './training-evidence.js';

const KEY = 'gms-char';
const tx = globalThis.tx || ((s) => s);

export function loadChar() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && jobNames.en[c.job] && Number.isInteger(c.lv) && c.lv >= 1 && c.lv <= 200) return c;
  } catch (e) {}
  return null;
}
export function saveChar(c) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ job: c.job, lv: c.lv }));
  } catch (e) {}
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Subclasses without a page of their own share their family's page.
const FAMILY = { fighter: 'warrior', page: 'warrior', spear: 'warrior' };

// Home panel: a two-field form until a character is saved, then the three best-fitting routes and a +1 button.
export function mountCharPanel(el, { routes, classes, finder, korean }) {
  if (!el) return;
  const t = korean
    ? { setH: '내 캐릭터로 맞춤 사냥터 보기', setP: '직업과 레벨을 저장하면 다음에 올 때 바로 갈 곳을 보여 줘요. 이 브라우저에만 저장돼요.', job: '직업', lv: '레벨', save: '저장', h: (lv, job) => `Lv. ${lv} ${job}의 지금 사냥터`, up: '레벨 +1', edit: '바꾸기', all: (job) => `${job} 사냥터 전체`, finder: '조건 바꿔 찾기', none: '이 레벨에 맞는 경로가 아직 없어요. 사냥터 추천에서 조건을 넓혀 보세요.' }
    : { setH: tx('See training routes for your character'), setP: tx('Save your class and level and the next visit opens on where to go. Stored in this browser only.'), job: tx('Class'), lv: tx('Level'), save: tx('Save'), h: (lv, job) => tx('Where to train now: level {lv} {job}', { lv, job }), up: tx('Level +1'), edit: tx('Change'), all: (job) => tx('All {job} routes', { job }), finder: tx('Adjust in the finder'), none: tx('No route fits this level yet. Widen the filters in the training finder.') };
  const names = korean ? jobNames.ko : jobNames.en;
  const classHref = (job) => classes.find((c) => c.job === (FAMILY[job] || job))?.href;

  const form = (c) => `<form class="char-form"><h2>${esc(t.setH)}</h2><p class="muted">${esc(t.setP)}</p>
<label>${esc(t.job)}<select name="job" required>${Object.entries(names).map(([k, v]) => `<option value="${k}"${c?.job === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
<label>${esc(t.lv)}<input name="lv" type="number" min="1" max="200" inputmode="numeric" required value="${c?.lv || ''}"></label>
<button class="btn" type="submit">${esc(t.save)}</button></form>`;

  const view = (c) => {
    const rows = selectRoutes(routes, { level: c.lv, job: c.job }).slice(0, 3);
    const cls = classHref(c.job);
    return `<div class="char-head"><h2>${esc(t.h(c.lv, names[c.job]))}</h2><div class="char-actions"><button type="button" class="btn" data-char="up">${esc(t.up)}</button><button type="button" class="btn ghost" data-char="edit">${esc(t.edit)}</button></div></div>
${rows.length ? `<ul class="char-routes">${rows.map((r) => `<li><a href="${esc(r.href)}" data-route="${esc(r.id)}"><strong>${esc(r.title)}</strong><small>Lv. ${r.level.min}–${r.level.max}</small><span>${esc(r.monsters)}</span></a></li>`).join('')}</ul>` : `<p class="muted">${esc(t.none)}</p>`}
<p class="char-links">${cls ? `<a href="${esc(cls)}">${esc(t.all(names[FAMILY[c.job] || c.job]))}</a>` : ''}<a href="${esc(`${finder}?lv=${c.lv}&job=${c.job}`)}">${esc(t.finder)}</a></p>`;
  };

  const render = (editing = false) => {
    const c = loadChar();
    el.innerHTML = !c || editing ? form(c) : view(c);
    el.hidden = false;
  };
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const lv = Math.round(Number(f.lv.value));
    if (!f.reportValidity() || !jobNames.en[f.job.value]) return;
    saveChar({ job: f.job.value, lv });
    track('my_char_save', { job: f.job.value, level: lv });
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-char]');
    if (b?.dataset.char === 'edit') return render(true);
    if (b?.dataset.char === 'up') {
      const c = loadChar();
      if (!c) return;
      saveChar({ ...c, lv: Math.min(200, c.lv + 1) });
      track('my_char_level_up', { job: c.job, level: c.lv + 1 });
      return render();
    }
    const a = e.target.closest('a[data-route]');
    if (a) track('my_char_route_click', { route_id: a.dataset.route });
  });
  render();
}
