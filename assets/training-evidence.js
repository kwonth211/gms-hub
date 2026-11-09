// Reported levels are evidence, never inferred recommendation intervals.
export function selectExperiences(rows, { level = null, band = null, job = '', includeUnknownJob = false } = {}) {
  return rows.filter((r) => r.context === 'launch'
    && (level == null || (r.level && r.level.min <= level && level <= r.level.max))
    && (!band || (r.level && r.level.min <= band[1] && r.level.max >= band[0]))
    && (!job || r.job === job || (includeUnknownJob && r.job == null)));
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const jobNames = {
  ko: { warrior: '전사 계열', archer: '궁수 계열', mage: '마법사 계열', thief: '도적 계열' },
  en: { warrior: 'Warrior family', archer: 'Bowman family', mage: 'Magician family', thief: 'Thief family' }
};
export function experienceCards(rows, lang) {
  const tr = (ko, en) => lang === 'ko' ? ko : en;
  if (!rows.length) return `<div class="panel tr-empty"><h3>${tr('이 조건의 플레이 후기를 아직 확인하지 못했어요.', 'No reviewed account matches these conditions yet.')}</h3><p>${tr('다른 레벨·직업의 기록을 추천으로 대신하지 않아요. 조건을 넓혀 원문을 비교하거나, 직접 사냥한 비용을 먼저 확인하세요.', 'We do not substitute another level or class as a recommendation. Broaden the filters to compare accounts, or measure your own costs first.')}</p></div>`;
  return `<div class="tr-evidence-list">${rows.map((r) => {
    const lv = r.level ? `Lv. ${r.level.min}${r.level.min !== r.level.max ? `–${r.level.max}` : ''}` : tr('레벨 미기재', 'Level unspecified');
    const row = (label, value) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
    return `<article class="panel tr-evidence" data-evidence="${esc(r.id)}">
<div class="tr-meta"><span>${esc(lv)}</span><span>${esc(jobNames[lang][r.job] || tr('직업 미기재', 'Class unspecified'))}</span><span>${tr('개인 플레이 후기', 'Personal account')}</span></div>
<h3>${esc(r.title[lang])}</h3><p>${esc(r.observation[lang])}</p>
<dl>${row(tr('플레이 조건', 'Conditions'), r.conditions[lang])}${row(tr('비용·수익', 'Costs & income'), r.cost[lang])}${row(tr('해석 범위', 'Limits'), r.limits[lang])}</dl>
<footer><a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source.author)} · ${tr('원문 보기 ↗', 'Original account ↗')}</a><small>${tr('원문 확인', 'Source reviewed')} ${esc(r.source.checked)} · ${r.source.published ? esc(r.source.published) : tr('게시일 미확인', 'Publication date unconfirmed')}</small></footer>
</article>`;
  }).join('')}</div>`;
}
export function validateTraining(data) {
  if (data.version !== 2 || !Array.isArray(data.experiences)) throw new Error('Training evidence schema required');
  const ids = new Set();
  for (const r of data.experiences) {
    if (!r.id || ids.has(r.id)) throw new Error('Duplicate/missing evidence ID');
    ids.add(r.id);
    if (!r.source?.author || !/^https:\/\//.test(r.source.url) || !/^\d{4}-\d{2}-\d{2}$/.test(r.source.checked)) throw new Error(`Missing original source: ${r.id}`);
    if (r.level !== null && (!Number.isInteger(r.level?.min) || !Number.isInteger(r.level?.max) || r.level.min < 1 || r.level.max < r.level.min)) throw new Error(`Invalid reported level: ${r.id}`);
    if (r.job !== null && !jobNames.en[r.job]) throw new Error(`Unknown class: ${r.id}`);
    if (!['launch', 'historical'].includes(r.context)) throw new Error(`Missing version context: ${r.id}`);
    for (const k of ['title', 'observation', 'conditions', 'cost', 'limits']) if (!r[k]?.ko || !r[k]?.en) throw new Error(`Missing ${k}: ${r.id}`);
  }
}
