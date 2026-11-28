import { rankHunts } from './hunt-ledger.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderPersonalHunts(root, rows, person, ko) {
  if (!root) return;
  const L = (k, e) => ko ? k : e, lang = ko ? 'ko' : 'en';
  const nf = n => Math.round(n).toLocaleString(lang);
  const groups = rankHunts(rows, person);
  root.closest('.hunt-personal').hidden = !groups.length;
  if (!person?.job || !person?.level) { root.innerHTML = `<p>${L('레벨과 직업을 고르면 내 기록을 보여 줘요.', 'Choose your level and class to see your records.')}</p>`; return; }
  if (!groups.length) { root.innerHTML = `<p>${L('맞는 기록이 아직 없어요. 사냥터 메모를 적고 10분 이상 측정한 뒤 정산을 저장하세요.', 'No matching runs yet. Name your spot, measure for at least 10 minutes, then save a settlement.')}</p>`; return; }
  const section = (title, field) => `<div><h3>${title}</h3><ol>${[...groups].sort((a, b) => b[field] - a[field] || b.durationMs - a.durationMs).slice(0, 3).map(g => {
    return `<li><strong>${esc(g.spot)}</strong><b>${nf(g[field])}${L('/시간', '/h')}</b><small>Lv. ${g.minLevel}${g.maxLevel !== g.minLevel ? `–${g.maxLevel}` : ''} · ${L(`${g.party}인 · ${g.n}회 · ${nf(g.durationMs / 60000)}분`, `${g.party} player(s) · ${g.n} run(s) · ${nf(g.durationMs / 60000)} min`)}</small>${g.gear ? `<small>${esc(g.gear)}</small>` : ''}</li>`;
  }).join('')}</ol></div>`;
  root.innerHTML = section(L('경험치가 잘 오른 곳', 'Highest EXP per hour'), 'expPerHour') + section(groups.every(g => g.netPerHour < 0) ? L('메소 손실이 적은 곳', 'Smallest meso loss') : L('메소가 많이 남은 곳', 'Highest net mesos'), 'netPerHour');
}

// The training finder uses its current filters, so it follows changes without modifying the route algorithm.
const finder = typeof document !== 'undefined' && document.querySelector('[data-hunt-finder]');
if (finder) {
  const form = document.getElementById('tr-form');
  const paint = () => {
    let rows = []; try { rows = JSON.parse(localStorage.getItem('gms-exp-log') || '[]'); } catch {}
    const person = { job: form.elements.job.value, level: Number(form.elements.lv.value), party: form.elements.party.value === 'solo' ? 1 : null };
    renderPersonalHunts(finder.querySelector('#hp-results'), rows, person, document.documentElement.lang === 'ko');
  };
  form.addEventListener('input', paint);
  form.addEventListener('change', paint);
  form.addEventListener('submit', () => queueMicrotask(paint));
  form.addEventListener('click', () => queueMicrotask(paint));
  addEventListener('storage', paint); addEventListener('gms-account-sync', paint);
  paint();
}
