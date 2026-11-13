import { selectRoutes, routeCards } from './training-evidence.js';
import { loadChar } from './my-char.js';
const data = JSON.parse(document.getElementById('training-data').textContent);
// Derived locales (zh, ja…) read the English data, already translated on the page.
const lang = document.documentElement.lang === 'ko' ? 'ko' : 'en';
const form = document.getElementById('tr-form');
const result = document.getElementById('tr-result');
const status = document.getElementById('tr-status');
const fields = form.elements;
const params = new URLSearchParams(location.search);
const lv = Number(params.get('lv'));
if (Number.isInteger(lv) && lv >= 1 && lv <= 100) fields.lv.value = lv;
for (const key of ['job','goal','party']) if ([...fields[key].options].some(o => o.value === params.get(key))) fields[key].value = params.get(key);
fields.advanced.checked = params.get('advanced') === '1';
// No conditions in the link: open on the character saved on the home page, if any.
const saved = loadChar();
if (saved && !params.has('lv') && !params.has('job')) {
  fields.lv.value = Math.min(100, saved.lv);
  if ([...fields.job.options].some((o) => o.value === saved.job)) fields.job.value = saved.job;
}
const criteria = () => ({ level: Math.max(1, Math.min(100, Number(fields.lv.value) || 20)), job: fields.job.value, goal: fields.goal.value, party: fields.party.value, advanced: fields.advanced.checked });
// `userAction` separates the automatic first render (and a shared link opening) from a visitor changing the conditions.
let lastTerm = '';
function show(userAction = false) {
  const c = criteria();
  const rows = selectRoutes(data.routes, c);
  status.textContent = lang === 'ko' ? `${c.level}레벨 사냥 후보 ${rows.length}곳` : tx('{n} options for level {lv}', {n: rows.length, lv: c.level});
  result.innerHTML = routeCards(rows, lang, `/${location.pathname.split('/')[1]}`);
  result.querySelector('.tr-route-list')?.style.setProperty('--you', `${Math.min(100, (c.level - 1) / 80 * 100)}%`);
  if (userAction) {
    const next = new URL(location.href);
    for (const key of ['lv','job','goal','party','advanced','all','unknown']) next.searchParams.delete(key);
    next.searchParams.set('lv',c.level);
    for (const key of ['job','goal','party']) if (fields[key].value && !['balanced','any'].includes(fields[key].value)) next.searchParams.set(key,fields[key].value);
    if(fields.advanced.checked) next.searchParams.set('advanced','1');
    history.replaceState(null,'',next);
    // Enter fires both submit and change; send one event per distinct condition set.
    const term = `Lv${c.level} ${c.job || 'all'} ${c.goal} ${c.party}${c.advanced ? ' adv' : ''}`;
    if (term === lastTerm) return;
    lastTerm = term;
    track('training_search', { search_term: term, level: c.level, job: c.job || 'all', goal: c.goal, party: c.party, advanced: c.advanced ? 1 : 0, results: rows.length, result: rows.length ? 'ok' : 'empty', lang: document.documentElement.lang });
  }
}
form.addEventListener('submit',e=>{e.preventDefault();if(form.reportValidity())show(true);});
form.addEventListener('change',()=>{if(form.checkValidity())show(true);});
show();
// Links from the bestiary or home search point at one route card; it exists only after the client render above.
if (location.hash.startsWith('#route-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
// Copy a link that restores these exact filters elsewhere; the URL holds only the filter values.
const share = document.getElementById('tr-share'), shareStatus = document.getElementById('tr-share-status');
share?.addEventListener('click', () => {
  const c = criteria();
  const u = new URL(location.pathname, location.href);
  u.searchParams.set('lv', c.level);
  for (const key of ['job','goal','party']) if (c[key] && !['balanced','any'].includes(c[key])) u.searchParams.set(key, c[key]);
  if (c.advanced) u.searchParams.set('advanced', '1');
  const url = shareUrl(u.toString(), 'training');
  copyText(url).then((ok) => {
    shareStatus.textContent = ok ? share.dataset.ok : `${share.dataset.fail} ${url}`;
    track('share_copy', { page_type: 'training', level: c.level, job: c.job || 'all', result: ok ? 'ok' : 'fail' });
  });
});
