import { selectRoutes, routeCards } from './training-evidence.js';
const data = JSON.parse(document.getElementById('training-data').textContent);
const lang = document.documentElement.lang;
const form = document.getElementById('tr-form');
const result = document.getElementById('tr-result');
const status = document.getElementById('tr-status');
const fields = form.elements;
const params = new URLSearchParams(location.search);
const lv = Number(params.get('lv'));
if (Number.isInteger(lv) && lv >= 1 && lv <= 100) fields.lv.value = lv;
for (const key of ['job','goal','party']) if ([...fields[key].options].some(o => o.value === params.get(key))) fields[key].value = params.get(key);
fields.advanced.checked = params.get('advanced') === '1';
function show(updateUrl = false) {
  const level = Math.max(1,Math.min(100,Number(fields.lv.value)||20));
  const rows = selectRoutes(data.routes, {level,job:fields.job.value,goal:fields.goal.value,party:fields.party.value,advanced:fields.advanced.checked});
  status.textContent = lang === 'ko' ? `${level}레벨 사냥 후보 ${rows.length}곳` : `${rows.length} options for level ${level}`;
  result.innerHTML = routeCards(rows,lang);
  if (updateUrl) {
    const next = new URL(location.href);
    for (const key of ['lv','job','goal','party','advanced','all','unknown']) next.searchParams.delete(key);
    next.searchParams.set('lv',level);
    for (const key of ['job','goal','party']) if (fields[key].value && !['balanced','any'].includes(fields[key].value)) next.searchParams.set(key,fields[key].value);
    if(fields.advanced.checked) next.searchParams.set('advanced','1');
    history.replaceState(null,'',next);
  }
}
form.addEventListener('submit',e=>{e.preventDefault();if(form.reportValidity())show(true);});
form.addEventListener('change',()=>{if(form.checkValidity())show(true);});
show();
