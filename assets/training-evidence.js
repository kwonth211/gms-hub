const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const jobNames = {
  ko: { warrior: '전사 계열', fighter: '파이터', page: '페이지', spear: '스피어맨', archer: '궁수 계열', hunter: '헌터', crossbow: '사수', mage: '마법사 계열', fire: '불독', ice: '썬콜', cleric: '클레릭', thief: '도적 계열', assassin: '표도 · 어쌔신', bandit: '단도 · 시프' },
  en: { warrior: 'Warrior family', fighter: 'Fighter', page: 'Page', spear: 'Spearman', archer: 'Bowman family', hunter: 'Hunter', crossbow: 'Crossbowman', mage: 'Magician family', fire: 'Fire / Poison', ice: 'Ice / Lightning', cleric: 'Cleric', thief: 'Thief family', assassin: 'Assassin', bandit: 'Bandit' }
};
const families = { fighter: 'warrior', page: 'warrior', spear: 'warrior', hunter: 'archer', crossbow: 'archer', fire: 'mage', ice: 'mage', cleric: 'mage', assassin: 'thief', bandit: 'thief' };
export function selectRoutes(rows, { level = null, band = null, job = '', goal = 'balanced', party = 'any', advanced = false } = {}) {
  return rows.filter(r => (level == null || (r.level.min <= level && level <= r.level.max))
    && (!band || (r.level.min <= band[1] && r.level.max >= band[0]))
    && (!job || !r.jobs.length || r.jobs.some(j => j === job || families[j] === job || families[job] === j))
    && (advanced || !r.advanced)
    && (party !== 'solo' || r.party !== 'required')
    && (goal !== 'economy' || r.costTier !== 'high'))
    .sort((a,b) => (goal === 'economy' ? ({low:0,medium:1,high:2}[a.costTier] - {low:0,medium:1,high:2}[b.costTier]) : 0) || Number(a.advanced) - Number(b.advanced) || a.level.min - b.level.min || a.id.localeCompare(b.id));
}
// Only editorial IDs live in source data. Never send research URLs/authors/transcripts to the browser.
export function publicTrainingData(data) {
  const keys = ['id','level','jobs','party','advanced','costTier','title','monsters','summary','entry','route','cost','exit','alternative'];
  return { version: data.version, updated: data.updated, routes: data.routes.map(r => Object.fromEntries(keys.map(k => [k,r[k]]))) };
}
export function routeCards(rows, lang = 'ko') {
  const tr = (ko,en) => lang === 'ko' ? ko : en;
  if (!rows.length) return `<div class="panel tr-empty"><h3>${tr('조건을 조금 넓혀 비교해 보세요', 'Broaden one filter to compare options')}</h3><p>${tr('솔로 조건을 해제하거나 장비 조건부 후보를 포함할 수 있어요. 지금 사냥터에서 처치 타수가 줄었다면, 레벨이 올라도 그곳을 유지하는 편이 나을 수 있어요.', 'Try allowing parties or equipped-character options. Staying on a lower-level map can still be effective when your kill count improves.')}</p><a href="/${lang}/guides/leveling-30-70/">${tr('직업별 다음 동선 보기 →', 'Class progression guide →')}</a></div>`;
  return `<div class="tr-route-list">${rows.map(r => {
    const item = (label,value) => `<div><dt>${label}</dt><dd>${esc(value[lang])}</dd></div>`;
    return `<article class="panel tr-route" data-route="${esc(r.id)}">
<div class="tr-meta"><span>Lv. ${r.level.min}–${r.level.max}</span><span>${r.jobs.length ? r.jobs.map(j=>esc(jobNames[lang][j])).join(' · ') : tr('공통','All classes')}</span><span>${r.party === 'required' ? tr('파티 필요','Party required') : r.party === 'preferred' ? tr('파티 권장','Party preferred') : tr('솔로 가능','Solo option')}</span>${r.advanced ? `<span class="tr-conditional">${tr('장비 조건부','Gear dependent')}</span>` : ''}</div>
<h3>${esc(r.title[lang])}</h3><p class="tr-monsters">${esc(r.monsters[lang])}</p><p>${esc(r.summary[lang])}</p>
<dl>${item(tr('진입 기준','Before moving'),r.entry)}${item(tr('물약·비용','Supplies & costs'),r.cost)}</dl>
<details><summary>${tr('가는 길 · 사냥 동선 · 이동 시점','Access, rotation & next step')}</summary><dl>${item(tr('위치·동선','Access & rotation'),r.route)}${item(tr('옮길 때','When to move'),r.exit)}${item(tr('자리 없을 때','Alternative'),r.alternative)}</dl></details></article>`;
  }).join('')}</div>`;
}
export function validateTraining(data, evidence) {
  if (data.version !== 3 || !Array.isArray(data.routes) || !data.routes.length) throw new Error('Training route schema required');
  const ids = new Set();
  for (const r of data.routes) {
    if (!r.id || ids.has(r.id)) throw new Error('Duplicate/missing route ID'); ids.add(r.id);
    if (!Number.isInteger(r.level?.min) || !Number.isInteger(r.level?.max) || r.level.min < 1 || r.level.max > 100 || r.level.min > r.level.max) throw new Error(`Invalid level: ${r.id}`);
    if (!Array.isArray(r.jobs) || r.jobs.some(j => !jobNames.en[j])) throw new Error(`Invalid class: ${r.id}`);
    if (!['solo','preferred','required'].includes(r.party) || !['low','medium','high'].includes(r.costTier) || typeof r.advanced !== 'boolean') throw new Error(`Invalid conditions: ${r.id}`);
    for (const k of ['title','monsters','summary','entry','route','cost','exit','alternative']) if (!r[k]?.ko?.trim() || !r[k]?.en?.trim()) throw new Error(`Missing ${k}: ${r.id}`);
    if (!r.evidence?.length || !r.editorialBasis) throw new Error(`Missing internal evidence: ${r.id}`);
    if (evidence && r.evidence.some(id => !evidence.sources.some(s => s.id === id && s.notes && /^https:\/\//.test(s.url)))) throw new Error(`Unresolved source: ${r.id}`);
  }
}
