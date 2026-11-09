import { selectExperiences, experienceCards } from './training-evidence.js';
const data = JSON.parse(document.getElementById('training-data').textContent);
const lang = document.documentElement.lang;
const form = document.getElementById('tr-form');
const result = document.getElementById('tr-result');
const status = document.getElementById('tr-status');
const fields = form.elements;
const params = new URLSearchParams(location.search);
const lv = Number(params.get('lv'));
if (Number.isInteger(lv) && lv >= 1 && lv <= 100) fields.lv.value = lv;
fields.all.checked = params.get('all') === '1';
if ([...fields.job.options].some((o) => o.value === params.get('job'))) fields.job.value = params.get('job');
fields.unknown.checked = params.get('unknown') === '1';
function show(updateUrl = false) {
  const level = Math.max(1, Math.min(100, Number(fields.lv.value) || 20));
  fields.lv.disabled = fields.all.checked;
  fields.unknown.disabled = !fields.job.value;
  const rows = selectExperiences(data.experiences, { level: fields.all.checked ? null : level, job: fields.job.value, includeUnknownJob: fields.unknown.checked });
  status.textContent = lang === 'ko'
    ? `${fields.all.checked ? '전체 레벨' : `${level}레벨을 직접 언급한`} 후기 ${rows.length}건 · 추천 순위가 아니에요`
    : `${rows.length} accounts${fields.all.checked ? ' across all levels' : ` explicitly covering level ${level}`} · not a ranking`;
  result.innerHTML = experienceCards(rows, lang);
  if (updateUrl) {
    const next = new URL(location.href);
    for (const key of ['lv', 'all', 'job', 'unknown']) next.searchParams.delete(key);
    next.searchParams.set('lv', level);
    if (fields.all.checked) next.searchParams.set('all', '1');
    if (fields.job.value) next.searchParams.set('job', fields.job.value);
    if (fields.job.value && fields.unknown.checked) next.searchParams.set('unknown', '1');
    history.replaceState(null, '', next);
  }
}
form.addEventListener('submit', (e) => { e.preventDefault(); if (form.reportValidity()) show(true); });
form.addEventListener('change', () => { if (form.checkValidity()) show(true); });
show();
