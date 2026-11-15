// "My character": class and level saved in this browser, so the home page and the training finder open on what fits
// right now. Nothing leaves the browser; a level-up is one tap.
import { selectRoutes, jobNames } from './training-evidence.js';
import { POOLS, timeline } from './skill-tree.js';

const KEY = 'gms-char';
const tx = globalThis.tx || ((s) => s);
const track = (name, params) => globalThis.track?.(name, params);

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
const FAMILY = { fighter: 'warrior', page: 'warrior', spear: 'warrior', hunter: 'archer', crossbow: 'archer', fire: 'mage', ice: 'mage', cleric: 'mage', assassin: 'thief', bandit: 'thief' };
const family = (job) => FAMILY[job] || job;
// Equipment job bits and quest job ids per family; the skills page anchors per job.
const BIT = { warrior: 1, mage: 2, archer: 4, thief: 8 };
const QUEST_JOB = { warrior: 100, mage: 200, archer: 300, thief: 400 };
const SKILL_HASH = { warrior: 'warrior', fighter: 'warrior-110', page: 'warrior-120', spear: 'warrior-130', mage: 'magician', fire: 'magician-210', ice: 'magician-220',
  cleric: 'magician-230', archer: 'bowman', hunter: 'bowman-310', crossbow: 'bowman-320', thief: 'thief', assassin: 'thief-410', bandit: 'thief-420' };
const SWORDS = ['One-Handed Sword', 'Two-Handed Sword'];
const WEAPONS = { fighter: [...SWORDS, 'One-Handed Axe', 'Two-Handed Axe'], page: [...SWORDS, 'One-Handed Blunt Weapon', 'Two-Handed Blunt'], spear: ['Spear', 'Pole Arm'],
  mage: ['Wand', 'Staff'], hunter: ['Bow'], crossbow: ['Crossbow'], assassin: ['Claw'], bandit: ['Dagger'] };
WEAPONS.warrior = [...new Set([...WEAPONS.fighter, ...WEAPONS.page, ...WEAPONS.spear])];
WEAPONS.archer = ['Bow', 'Crossbow'];
WEAPONS.thief = ['Claw', 'Dagger'];
const ALL_WEAPONS = new Set(Object.values(WEAPONS).flat());
const SLOT_KO = { Hat: '모자', Top: '상의', Overall: '한벌옷', Bottom: '하의', Shoes: '신발', Glove: '장갑', Shield: '방패', Cape: '망토', Earrings: '귀고리',
  'Face Accessory': '얼굴장식', 'Eye Decoration': '눈장식', Ring: '반지', Wand: '완드', Staff: '스태프', Bow: '활', Crossbow: '석궁', Claw: '아대', Dagger: '단검',
  Spear: '창', 'Pole Arm': '폴암', 'One-Handed Sword': '한손검', 'Two-Handed Sword': '두손검', 'One-Handed Axe': '한손도끼', 'Two-Handed Axe': '두손도끼',
  'One-Handed Blunt Weapon': '한손둔기', 'Two-Handed Blunt': '두손둔기' };
const QUEST_BANDS = [1, 11, 21, 31, 41, 51];
// Skill build ids: the family's 1st job and each 2nd job.
const SKILL_JOB = { warrior: 100, fighter: 110, page: 120, spear: 130, mage: 200, fire: 210, ice: 220, cleric: 230, archer: 300, hunter: 310, crossbow: 320,
  thief: 400, assassin: 410, bandit: 420 };
const FIRST_JOB = { warrior: 100, mage: 200, archer: 300, thief: 400 };

// Which build applies at this level: the 1st job's until 30, then the 2nd job's (a family pick has none yet).
export function skillPlan(hub, { lv, job }) {
  const first = FIRST_JOB[family(job)], second = SKILL_JOB[job] !== first ? SKILL_JOB[job] : null;
  const useSecond = lv >= 30 && second;
  const id = useSecond ? second : first, pool = POOLS[useSecond ? 2 : 1];
  const steps = timeline(hub.skills[id] || [], pool).filter((s) => s.add);
  const now = steps.findIndex((s) => lv <= s.at);
  return { id, pool: useSecond ? 2 : 1, steps, now: lv < pool.base ? -1 : now, before: lv < pool.base, needSecond: lv >= 30 && !second };
}

// The best piece per slot the character can wear now (requirement within 15 levels), weapon first, newest gear next.
export function pickGear(gear, { lv, job }) {
  const bit = BIT[family(job)], allowed = new Set(WEAPONS[job] || WEAPONS[family(job)] || []);
  const best = new Map();
  for (const g of gear) {
    const [, , , sub, need, bits, atk, def] = g;
    const weapon = ALL_WEAPONS.has(sub);
    if (need > lv || need < lv - 15) continue;
    if (weapon ? !allowed.has(sub) || !(bits & bit) : bits && !(bits & bit)) continue;
    // Shields are warrior gear in practice; other families hold two-handed or ranged weapons.
    if (sub === 'Shield' && family(job) !== 'warrior') continue;
    const key = weapon ? 'weapon' : sub === 'Overall' ? 'Top' : sub;
    const cur = best.get(key);
    if (!cur || need > cur[4] || (need === cur[4] && (atk || def) > (cur[6] || cur[7]))) best.set(key, g);
  }
  const weapon = best.get('weapon');
  best.delete('weapon');
  return [...(weapon ? [weapon] : []), ...[...best.values()].sort((a, b) => b[4] - a[4] || (b[8] || 0) - (a[8] || 0))].slice(0, 4);
}
// Quests that start within ten levels below the character, open to its family, by EXP.
export function pickQuests(quests, { lv, job }) {
  const fam = QUEST_JOB[family(job)];
  return quests.filter(([, start, , jobs]) => start <= lv && start >= lv - 10 && (!jobs.length || jobs.includes(fam) || jobs.includes(0)))
    .sort((a, b) => b[2] - a[2])
    // Steps of one guided chain (Jane's three challenges) show once; the guide covers the rest.
    .filter((q, i, all) => !q[4] || all.findIndex((x) => x[4] === q[4]) === i).slice(0, 3);
}

// Home panel: a two-field form until a character is saved, then routes, EXP quests, gear and the skill build for it.
export function mountCharPanel(el, { routes, classes, finder, korean }) {
  if (!el) return;
  const d = el.dataset;
  const t = korean
    ? { setH: '내 캐릭터 맞춤 홈', setP: '직업과 레벨을 한 번 저장하면 다음부터 사냥터, 경험치 퀘스트, 낄 장비와 시세, 스킬 순서를 바로 보여 줘요. 이 브라우저에만 저장돼요.', job: '직업', lv: '레벨', save: '저장',
      mine: '내 캐릭터', up: '레벨 올리기', down: '레벨 내리기', routesH: '지금 갈 사냥터', questsH: '경험치 퀘스트', gearH: '지금 낄 수 있는 장비', all: '전체 보기', finder: '조건 바꿔 찾기',
      skill: (job) => `${job} 스킬 찍는 순서 보기`, none: '이 레벨에 맞는 경로가 아직 없어요.', noQuest: '이 레벨 근처에 시작하는 퀘스트가 없어요.', noGear: '이 레벨에 맞는 장비가 아직 없어요.',
      start: (lv) => `Lv. ${lv}부터`, noPrice: '시세 없음', loading: '불러오는 중…', guide: '공략',
      skillH: (job, n) => `${job} 스킬 찍는 순서 · ${n}차`, skillAll: '스킬트리 전체 보기', skillNow: '지금', skillBefore: '10레벨에 1차 전직하면 이 순서로 찍어요.', skillPick: '30레벨이 넘었어요. 위에서 2차 직업을 고르면 2차 스킬 순서가 나와요.', master: '마스터' }
    : { setH: tx('Your character home'), setP: tx('Save your class and level once, and the next visit opens on training spots, EXP quests, gear with prices and the skill build for it. Stored in this browser only.'), job: tx('Class'), lv: tx('Level'), save: tx('Save'),
      mine: tx('My character'), up: tx('Level up'), down: tx('Level down'), routesH: tx('Where to train now'), questsH: tx('EXP quests'), gearH: tx('Gear you can wear now'), all: tx('See all'), finder: tx('Adjust in the finder'),
      skill: (job) => tx('{job} skill build', { job }), none: tx('No route fits this level yet.'), noQuest: tx('No quest starts near this level.'), noGear: tx('No gear fits this level yet.'),
      start: (lv) => tx('From level {lv}', { lv }), noPrice: tx('No price'), loading: tx('Loading…'), guide: tx('Guide'),
      skillH: (job, n) => tx('{job} skill order · job {n}', { job, n }), skillAll: tx('Full skill trees'), skillNow: tx('Now'), skillBefore: tx('Take your 1st job at level 10, then spend SP in this order.'), skillPick: tx('Past level 30: pick your 2nd job above to see its skill order.'), master: tx('max') };
  const names = korean ? jobNames.ko : jobNames.en;
  const classHref = (job) => classes.find((c) => c.job === family(job))?.href;
  const nf = new Intl.NumberFormat(korean ? 'ko' : 'en');
  const mesos = (n) => (korean
    ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf.format(n))
    : (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n)));
  // Gear and quest lists load once a character is saved; until then the cards say "loading".
  let hub = null, hubLoad = null;
  const loadHub = () => (hubLoad ||= fetch(d.hub).then((r) => (r.ok ? r.json() : null)).catch(() => null));

  const form = (c) => `<form class="char-form"><div class="char-intro"><h2>${esc(t.setH)}</h2><p class="muted">${esc(t.setP)}</p></div>
<label>${esc(t.job)}<select name="job" required>${Object.entries(names).map(([k, v]) => `<option value="${k}"${c?.job === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
<label>${esc(t.lv)}<input name="lv" type="number" min="1" max="200" inputmode="numeric" required value="${c?.lv || ''}" placeholder="30"></label>
<button class="btn" type="submit">${esc(t.save)}</button></form>`;

  const card = (kind, title, body, more) => `<div class="char-card" data-kind="${kind}"><h3>${esc(title)}</h3>${body}${more}</div>`;
  const moreLink = (url, label, kind) => `<a class="char-more" href="${esc(url)}" data-char-link="${kind}">${esc(label)}</a>`;

  const questsBody = (c) => {
    if (!hub) return `<p class="muted">${esc(t.loading)}</p>`;
    const list = pickQuests(hub.quests, c);
    if (!list.length) return `<p class="muted">${esc(t.noQuest)}</p>`;
    return `<ul class="char-list">${list.map(([name, start, exp, , guide]) => {
      const band = QUEST_BANDS.filter((b) => b <= Math.max(start, 1)).pop();
      const url = guide ? `${d.questBase}${guide.replace(/^\//, '')}` : `${d.quests}#lv-${band}`;
      return `<li><a href="${esc(url)}" data-char-link="quest"><strong translate="no">${esc(name)}</strong><small>${esc(t.start(start || 1))}${guide ? ` · ${esc(t.guide)}` : ''}</small><b>${nf.format(exp)} EXP</b></a></li>`;
    }).join('')}</ul>`;
  };
  const gearBody = (c) => {
    if (!hub) return `<p class="muted">${esc(t.loading)}</p>`;
    const list = pickGear(hub.gear, c);
    if (!list.length) return `<p class="muted">${esc(t.noGear)}</p>`;
    return `<ul class="char-list char-gear">${list.map(([id, ko, en, sub, need, , , , price]) => `<li><a href="${esc(`${d.market}?item=${id}&src=char`)}" data-char-link="gear" data-item="${id}">`
      + `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="28" height="28" loading="lazy"><strong>${esc(korean ? ko : en)}</strong>`
      + `<small>${esc(korean ? SLOT_KO[sub] || sub : sub)} · Lv. ${need}</small><b${price ? '' : ' class="muted"'}>${esc(price ? mesos(price) : t.noPrice)}</b></a></li>`).join('')}</ul>`;
  };

  // The skill order, open by default: past steps dimmed, the step for the current level marked "now".
  const skillBody = (c) => {
    const more = `<p class="char-more-row">${moreLink(`${d.skills}#${SKILL_HASH[c.job]}`, t.skillAll, 'skills')}</p>`;
    if (!hub) return card('skills', t.skill(names[c.job]), `<p class="muted">${esc(t.loading)}</p>`, more);
    const plan = skillPlan(hub, c);
    const nm = (id) => hub.skillNames[id] || [String(id), String(id), 0];
    const note = plan.before ? t.skillBefore : plan.needSecond ? t.skillPick : '';
    const steps = plan.steps.map((st, i) => {
      const [ko, en, master] = nm(st.id);
      const cls = i === plan.now ? ' is-now' : plan.now >= 0 && i < plan.now ? ' is-done' : plan.now < 0 && !plan.before ? ' is-done' : '';
      const lvl = st.from === st.at ? `${st.at}` : `${st.from}–${st.at}`;
      return `<li class="char-step${cls}"><span class="char-step-lv">Lv ${lvl}</span><img src="${esc(`${d.skillIcons}${st.id}.png`)}" alt="" width="24" height="24" loading="lazy"><span class="char-step-name">${esc(korean ? ko : en)} <b>→ ${st.to}</b>${st.to >= master ? ` <em>${esc(t.master)}</em>` : ''}</span>${i === plan.now ? `<i class="char-now">${esc(t.skillNow)}</i>` : ''}</li>`;
    }).join('');
    return `<div class="char-card char-skills" data-kind="skills"><h3>${esc(t.skillH(names[c.job], plan.pool))}</h3>${note ? `<p class="muted">${esc(note)}</p>` : ''}<ol class="char-steps">${steps}</ol>${more}</div>`;
  };
  // Saved view: the class picker and level stepper sit in the header and change everything below at once.
  const head = (c) => `<div class="char-head"><h2>${esc(t.mine)}</h2><div class="char-controls">
<label class="char-job"><span class="sr-only">${esc(t.job)}</span><select data-char-job aria-label="${esc(t.job)}">${Object.entries(names).map(([k, v]) => `<option value="${k}"${c.job === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
<div class="char-lv" role="group" aria-label="${esc(t.lv)}"><button type="button" class="btn ghost" data-char="down" aria-label="${esc(t.down)}">−</button><label><span>Lv.</span><input data-char-lv type="number" min="1" max="200" inputmode="numeric" value="${c.lv}" aria-label="${esc(t.lv)}"></label><button type="button" class="btn ghost" data-char="up" aria-label="${esc(t.up)}">+</button></div>
</div></div><div class="char-body"></div>`;
  const body = (c) => {
    const rows = selectRoutes(routes, { level: c.lv, job: c.job }).slice(0, 3);
    const cls = classHref(c.job);
    const routesBody = rows.length
      ? `<ul class="char-list">${rows.map((r) => `<li><a href="${esc(r.href)}" data-route="${esc(r.id)}" data-char-link="route"><strong>${esc(r.title)}</strong><small>Lv. ${r.level.min}–${r.level.max}</small><span>${esc(r.monsters)}</span></a></li>`).join('')}</ul>`
      : `<p class="muted">${esc(t.none)}</p>`;
    return `<div class="char-grid">
${card('routes', t.routesH, routesBody, `<p class="char-more-row">${moreLink(`${finder}?lv=${c.lv}&job=${c.job}`, t.finder, 'finder')}${cls ? moreLink(cls, t.all, 'class') : ''}</p>`)}
${card('quests', t.questsH, questsBody(c), `<p class="char-more-row">${moreLink(d.quests, t.all, 'quests')}</p>`)}
${card('gear', t.gearH, gearBody(c), `<p class="char-more-row">${moreLink(d.equip, t.all, 'equipment')}</p>`)}
</div>
${skillBody(c)}`;
  };
  const refresh = () => {
    const c = loadChar(), box = el.querySelector('.char-body');
    if (c && box) box.innerHTML = body(c);
  };

  const render = () => {
    const c = loadChar();
    el.innerHTML = c ? head(c) : form(null);
    el.classList.toggle('is-set', !!c);
    el.hidden = false;
    if (!c) return;
    refresh();
    if (!hub) loadHub().then((h) => { hub = h || { gear: [], quests: [] }; refresh(); });
  };
  // Every change is saved at once; the level box waits until a number is complete before redrawing.
  let lvTimer = null;
  const change = (patch, field) => {
    const c = loadChar();
    if (!c) return;
    const next = { ...c, ...patch };
    next.lv = Math.min(200, Math.max(1, Math.round(next.lv)));
    if (next.lv === c.lv && next.job === c.job) return;
    saveChar(next);
    const input = el.querySelector('[data-char-lv]');
    if (input && Number(input.value) !== next.lv) input.value = next.lv;
    refresh();
    track('my_char_change', { field, job: next.job, level: next.lv });
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
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-char-job]') && jobNames.en[e.target.value]) change({ job: e.target.value }, 'job');
    if (e.target.matches('[data-char-lv]') && Number(e.target.value) > 0) change({ lv: Number(e.target.value) }, 'level');
  });
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-char-lv]')) return;
    clearTimeout(lvTimer);
    const v = Number(e.target.value);
    if (v >= 1 && v <= 200) lvTimer = setTimeout(() => change({ lv: v }, 'level'), 400);
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-char]');
    if (b?.dataset.char === 'up' || b?.dataset.char === 'down') {
      const c = loadChar();
      if (c) change({ lv: c.lv + (b.dataset.char === 'up' ? 1 : -1) }, b.dataset.char === 'up' ? 'level_up' : 'level_down');
      return;
    }
    const a = e.target.closest('a[data-char-link]');
    if (!a) return;
    const c = loadChar();
    if (a.dataset.route) track('my_char_route_click', { route_id: a.dataset.route });
    track('my_char_click', { kind: a.dataset.charLink, item_id: a.dataset.item ? Number(a.dataset.item) : undefined, job: c?.job, level: c?.lv });
  });
  render();
}
