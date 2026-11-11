// Pages in derived locales define window.tx; the build (Node) and ko/en pages keep the text.
const tx = globalThis.tx || ((s) => s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const jobNames = {
  ko: { warrior: '전사 계열', fighter: '파이터', page: '페이지', spear: '스피어맨', archer: '궁수 계열', hunter: '헌터', crossbow: '사수', mage: '마법사 계열', fire: '불독', ice: '썬콜', cleric: '클레릭', thief: '도적 계열', assassin: '표도 · 어쌔신', bandit: '단도 · 시프' },
  en: { warrior: tx('Warrior family'), fighter: tx('Fighter'), page: tx('Page'), spear: tx('Spearman'), archer: tx('Bowman family'), hunter: tx('Hunter'), crossbow: tx('Crossbowman'), mage: tx('Magician family'), fire: tx('Fire / Poison'), ice: tx('Ice / Lightning'), cleric: tx('Cleric'), thief: tx('Thief family'), assassin: tx('Assassin'), bandit: tx('Bandit') }
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
  const keys = ['id','level','jobs','party','advanced','costTier','title','monsters','summary','entry','route','cost','exit','alternative','mobs'];
  return { version: data.version, updated: data.updated, routes: data.routes.map(r => Object.fromEntries(keys.map(k => [k,r[k]]))) };
}
// `prefix` is the page's own language path (/zh, /ja…); derived locales render with English text but must link to their own pages.
export function routeCards(rows, lang = 'ko', prefix = `/${lang}`) {
  // Monster sprites live beside the language folders; the page tells the browser where, the build derives it from prefix.
  const sprites = globalThis.document?.body?.dataset.sprites || `${prefix.replace(/\/[a-z]{2}$/, '')}/assets/monsters/`;
  const tr = (ko,en) => lang === 'ko' ? ko : tx(en);
  if (!rows.length) return `<div class="panel tr-empty"><h3>${tr('조건을 조금 넓혀 비교해 보세요', 'Broaden one filter to compare options')}</h3><p>${tr('솔로 조건을 해제하거나 장비 조건부 후보를 포함할 수 있어요. 지금 사냥터에서 처치 타수가 줄었다면, 레벨이 올라도 그곳을 유지하는 편이 나을 수 있어요.', 'Try allowing parties or equipped-character options. Staying on a lower-level map can still be effective when your kill count improves.')}</p><a href="${prefix}/guides/leveling-30-70/">${tr('직업별 다음 동선 보기', 'Class progression guide')}</a></div>`;
  // A level-ordered list read like a guide table: the level band as a bar, the map, its monsters and the accuracy they
  // need in one line; the advice opens underneath. `--you` on the list (set by the finder) marks the reader's level.
  const head = `<div class="tr-row-head" aria-hidden="true"><span>${tr('레벨','Level')}</span><span>${tr('사냥터','Route')}</span><span>${tr('몬스터','Monsters')}</span><span>${tr('필요 명중','Accuracy')}</span></div>`;
  return `<div class="tr-route-list">${head}${rows.map(r => {
    const item = (label,value) => `<div><dt>${label}</dt><dd>${esc(value[lang])}</dd></div>`;
    // One scale for every row (levels 1–80) so bars compare at a glance; bands past 80 run to the end.
    const left = Math.min(97, (r.level.min - 1) / 80 * 100);
    const bar = `<span class="tr-bar"><i style="left:${left.toFixed(1)}%;width:${Math.max(3, Math.min(100 - left, (r.level.max - r.level.min + 1) / 80 * 100)).toFixed(1)}%"></i></span>`;
    const who = [...(r.jobs.length ? r.jobs.map(j => esc(jobNames[lang][j])) : [tr('공통','All classes')]), r.party === 'required' ? tr('파티 필요','Party required') : r.party === 'preferred' ? tr('파티 권장','Party preferred') : tr('솔로 가능','Solo option'), r.advanced ? tr('장비 조건부','Gear dependent') : ''].filter(Boolean);
    const mobs = r.mobs?.length ? r.mobs.map(m => `<a href="${prefix}/monsters/${m.id}/"><img class="mob-sprite" src="${sprites}${m.id}.gif" width="32" height="32" alt="" loading="lazy"><span><b>${esc(lang === 'ko' ? m.ko : m.en)}</b><small>Lv. ${m.lv}</small></span></a>`).join('') : `<span>${esc(r.monsters[lang])}</span>`;
    const acc = r.mobs?.length ? Math.max(...r.mobs.map(m => m.acc)) : null;
    return `<details class="tr-row" id="route-${esc(r.id)}" data-route="${esc(r.id)}">
<summary><span class="tr-lv"><b>Lv. ${r.level.min}–${r.level.max}</b>${bar}</span><span class="tr-name"><strong>${esc(r.title[lang])}</strong><span class="tr-who">${who.map(w => `<span>${w}</span>`).join('')}</span></span><span class="tr-mobs">${mobs}</span><span class="tr-acc">${acc != null ? `<span><span class="sr-only">${tr('필요 명중','Accuracy')} </span>${acc}</span>` : '<span>–</span>'}<small>${acc != null ? tr(`Lv. ${r.level.min} 기준`, `at Lv. ${r.level.min}`) : ''}</small></span></summary>
<div class="tr-detail"><p>${esc(r.summary[lang])}</p><dl>${item(tr('진입 기준','Before moving'),r.entry)}${item(tr('물약과 비용','Supplies and costs'),r.cost)}${item(tr('가는 길과 동선','Access and rotation'),r.route)}${item(tr('옮길 때','When to move'),r.exit)}${item(tr('자리 없을 때','Alternative'),r.alternative)}</dl></div></details>`;
  }).join('')}</div>`;
}
export function validateTraining(data, evidence, monsters = null) {
  if (data.version !== 3 || !Array.isArray(data.routes) || !data.routes.length) throw new Error('Training route schema required');
  const ids = new Set();
  for (const r of data.routes) {
    if (!r.id || ids.has(r.id)) throw new Error('Duplicate/missing route ID'); ids.add(r.id);
    if (!Number.isInteger(r.level?.min) || !Number.isInteger(r.level?.max) || r.level.min < 1 || r.level.max > 100 || r.level.min > r.level.max) throw new Error(`Invalid level: ${r.id}`);
    if (!Array.isArray(r.jobs) || r.jobs.some(j => !jobNames.en[j])) throw new Error(`Invalid class: ${r.id}`);
    if (!['solo','preferred','required'].includes(r.party) || !['low','medium','high'].includes(r.costTier) || typeof r.advanced !== 'boolean') throw new Error(`Invalid conditions: ${r.id}`);
    for (const k of ['title','monsters','summary','entry','route','cost','exit','alternative']) if (!r[k]?.ko?.trim() || !r[k]?.en?.trim()) throw new Error(`Missing ${k}: ${r.id}`);
    if (!r.evidence?.length || !r.editorialBasis) throw new Error(`Missing internal evidence: ${r.id}`);
    if (!Array.isArray(r.mobIds) || !r.mobIds.length) throw new Error(`Missing mobIds: ${r.id}`);
    if (monsters && r.mobIds.some(id => !monsters.some(m => m.id === id))) throw new Error(`Unknown monster in route: ${r.id}`);
    if (evidence && r.evidence.some(id => !evidence.sources.some(s => s.id === id && s.notes && /^https:\/\//.test(s.url)))) throw new Error(`Unresolved source: ${r.id}`);
  }
}
