// "My character": class and level saved in this browser, so the home page and the training finder open on what fits
// right now. Nothing leaves the browser; a level-up is one tap.
import { selectRoutes, jobNames } from './training-evidence.js';
import { POOLS, timeline } from './skill-tree.js';
import { makeSet } from './char-set.js';

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

// A picture of the player's own character, resized in the browser and kept in this browser; it is only uploaded as part of
// the visitor's own settings copy when they log in with Discord (assets/account.js).
const IMG_KEY = 'gms-char-img';
export function loadCharImg() {
  try { const v = localStorage.getItem(IMG_KEY); return v && v.startsWith('data:image/') ? v : null; } catch (e) { return null; }
}
function saveCharImg(v) {
  try { if (v) localStorage.setItem(IMG_KEY, v); else localStorage.removeItem(IMG_KEY); return true; } catch (e) { return false; }
}
// Fits the picture in 240×240 and re-encodes it, so a phone photo does not fill browser storage.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const k = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = k < 1;
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const webp = cv.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Subclasses without a page of their own share their family's page.
const FAMILY = { fighter: 'warrior', page: 'warrior', spear: 'warrior', hunter: 'archer', crossbow: 'archer', fire: 'mage', ice: 'mage', cleric: 'mage', assassin: 'thief', bandit: 'thief' };
const family = (job) => FAMILY[job] || job;
// Equipment job bits and quest job ids per family; the skills page anchors per job.
const BIT = { warrior: 1, mage: 2, archer: 4, thief: 8 };
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
  // Every piece the character can wear now, highest requirement first (a level 40 sees level 40 gear on top); at the same
  // level the weapon comes first, then the stronger piece.
  const bit = BIT[family(job)], allowed = new Set(WEAPONS[job] || WEAPONS[family(job)] || []);
  return gear.filter(([, , , sub, need, bits]) => {
    const weapon = ALL_WEAPONS.has(sub);
    if (need > lv) return false;
    if (weapon ? !allowed.has(sub) || !(bits & bit) : bits && !(bits & bit)) return false;
    // Shields are warrior gear in practice; other families hold two-handed or ranged weapons.
    return !(sub === 'Shield' && family(job) !== 'warrior');
  }).sort((a, b) => b[4] - a[4] || ALL_WEAPONS.has(b[3]) - ALL_WEAPONS.has(a[3]) || (b[6] || b[7]) - (a[6] || a[7]) || (b[8] || 0) - (a[8] || 0));
}
// Guided quests the character can start now: a part that starts at or below its level, the most recently unlocked first.
export function pickQuests(quests, { lv }) {
  return quests.map((q) => ({ q, start: Math.max(0, ...q[1].filter((x) => x <= lv)) }))
    .filter(({ start }) => start > 0)
    .sort((a, b) => b.start - a.start)
    .map(({ q, start }) => [...q, start]);
}

// Home panel: a two-field form until a character is saved, then routes, EXP quests, gear and the skill build for it.
export function mountCharPanel(el, { routes, classes, finder, korean }) {
  if (!el) return;
  const d = el.dataset;
  const t = korean
    ? { setH: '내 캐릭터 맞춤 홈', setP: '직업과 레벨을 한 번 저장하면 다음부터 사냥터, 경험치 퀘스트, 낄 장비와 시세, 스킬 순서를 바로 보여 줘요. 이 브라우저에 저장되고, 디스코드로 로그인하면 다른 기기에서도 이어져요.', job: '직업', lv: '레벨', save: '저장',
      mine: '내 캐릭터', up: '레벨 올리기', down: '레벨 내리기', routesH: '지금 갈 사냥터', questsH: '지금 할 수 있는 퀘스트', gearH: '지금 낄 수 있는 장비', all: '전체 보기', finder: '조건 바꿔 찾기',
      skill: (job) => `${job} 스킬 찍는 순서 보기`, none: '이 레벨에 맞는 경로가 아직 없어요.', noQuest: '공략 퀘스트는 10레벨부터 열려요.', noGear: '이 레벨에 맞는 장비가 아직 없어요.',
      start: (lv) => `Lv. ${lv}부터`, noPrice: '시세 없음', loading: '불러오는 중…', upload: '내 캐릭터 사진 올리기', firstJob: '1차 (전직 전)', change: '사진 바꾸기', reset: '기본 캐릭터로', photoNote: '사진은 이 브라우저에 저장되고, 디스코드로 로그인하면 다른 기기에서도 이어져요.', photoFail: '이 파일은 쓸 수 없어요. 다른 사진을 골라 주세요.', guide: '공략',
      skillH: (job, n) => `${job} 스킬 찍는 순서 · ${n}차`, skillAll: '스킬트리 전체 보기', skillNow: '지금', skillBefore: '10레벨에 1차 전직하면 이 순서로 찍어요.', skillPick: '30레벨이 넘었어요. 위에서 2차 직업을 고르면 2차 스킬 순서가 나와요.', master: '마스터' }
    : { setH: tx('Your character home'), setP: tx('Save your class and level once, and the next visit opens on training spots, EXP quests, gear with prices and the skill build for it. Saved in this browser; log in with Discord to keep it on your other devices too.'), job: tx('Class'), lv: tx('Level'), save: tx('Save'),
      mine: tx('My character'), up: tx('Level up'), down: tx('Level down'), routesH: tx('Where to train now'), questsH: tx('Quests you can do now'), gearH: tx('Gear you can wear now'), all: tx('See all'), finder: tx('Adjust in the finder'),
      skill: (job) => tx('{job} skill build', { job }), none: tx('No route fits this level yet.'), noQuest: tx('Guided quests open from level 10.'), noGear: tx('No gear fits this level yet.'),
      start: (lv) => tx('From level {lv}', { lv }), noPrice: tx('No price'), loading: tx('Loading…'), upload: tx('Add a picture of your character'), firstJob: tx('1st job'), change: tx('Change picture'), reset: tx('Use the default character'), photoNote: tx('The picture is saved in this browser; log in with Discord to keep it on your other devices too.'), photoFail: tx('That file cannot be used. Pick another picture.'), guide: tx('Guide'),
      skillH: (job, n) => tx('{job} skill order · job {n}', { job, n }), skillAll: tx('Full skill trees'), skillNow: tx('Now'), skillBefore: tx('Take your 1st job at level 10, then spend SP in this order.'), skillPick: tx('Past level 30: pick your 2nd job above to see its skill order.'), master: tx('max') };
  const names = korean ? jobNames.ko : jobNames.en;
  const classHref = (job) => classes.find((c) => c.job === family(job))?.href;
  const nf = new Intl.NumberFormat(korean ? 'ko' : 'en');
  const mesos = (n) => (korean
    ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf.format(n))
    : (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n)));
  // Gear and quest lists load once a character is saved; until then the cards say "loading".
  let hub = null, hubLoad = null;
  // The gear set card (assets/char-set.js) sits on top of the cards once the gear list has loaded.
  const cset = makeSet({ korean, market: d.market, api: document.body.dataset.priceApi, track, esc, mesos });
  const loadHub = () => (hubLoad ||= fetch(d.hub).then((r) => (r.ok ? r.json() : null)).catch(() => null));

  const form = (c) => `<div class="char-new">${avatar(null, false)}<form class="char-form"><div class="char-intro"><h2>${esc(t.setH)}</h2><p class="muted">${esc(t.setP)}</p></div>
<label>${esc(t.job)}<select name="job" required>${Object.entries(names).map(([k, v]) => `<option value="${k}"${c?.job === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
<label>${esc(t.lv)}<input name="lv" type="number" min="1" max="200" inputmode="numeric" required value="${c?.lv || ''}" placeholder="30"></label>
<button class="btn" type="submit">${esc(t.save)}</button></form></div>`;

  const card = (kind, title, body, more, n) => `<div class="char-card" data-kind="${kind}"><h3>${esc(title)}${n ? ` <span class="char-n">${n}</span>` : ''}</h3>${body}${more}</div>`;
  const moreLink = (url, label, kind) => `<a class="char-more" href="${esc(url)}" data-char-link="${kind}">${esc(label)}</a>`;

  // Titles, one-line summaries and rewards come in Korean and English from the quest guides, like the guide pages.
  const questsBody = (c) => {
    if (!hub) return `<div class="skel-wrap" aria-busy="true" aria-label="${esc(t.loading)}"><span class="skel" style="width:70%;height:12px" aria-hidden="true"></span><span class="skel" style="width:90%;height:12px" aria-hidden="true"></span><span class="skel" style="width:55%;height:12px" aria-hidden="true"></span></div>`;
    const list = pickQuests(hub.quests, c);
    if (!list.length) return `<p class="muted">${esc(t.noQuest)}</p>`;
    const L = (o) => (korean ? o.ko : o.en);
    return `<ul class="char-list char-quests">${list.map(([slug, , title, cardLine, reward, start]) => `<li><a href="${esc(`${d.quests}${slug}/`)}" data-char-link="quest" data-quest="${esc(slug)}">`
      + `<strong>${esc(L(title))}</strong><small>${esc(t.start(start))} · ${esc(L(reward))}</small><span>${esc(L(cardLine))}</span></a></li>`).join('')}</ul>`;
  };
  const gearBody = (c) => {
    if (!hub) return `<div class="skel-wrap" aria-busy="true" aria-label="${esc(t.loading)}"><span class="skel" style="width:70%;height:12px" aria-hidden="true"></span><span class="skel" style="width:90%;height:12px" aria-hidden="true"></span><span class="skel" style="width:55%;height:12px" aria-hidden="true"></span></div>`;
    const list = pickGear(hub.gear, c);
    if (!list.length) return `<p class="muted">${esc(t.noGear)}</p>`;
    return `<ul class="char-list char-gear">${list.map(([id, ko, en, sub, need, , , , price]) => `<li><a href="${esc(`${d.market}?item=${id}&src=char`)}" data-char-link="gear" data-item="${id}">`
      + `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="28" height="28" loading="lazy"><strong>${esc(korean ? ko : en)}</strong>`
      + `<small>${esc(korean ? SLOT_KO[sub] || sub : sub)} · Lv. ${need}</small><b${price ? '' : ' class="muted"'}>${esc(price ? mesos(price) : t.noPrice)}</b></a></li>`).join('')}</ul>`;
  };

  // The skill order, open by default: past steps dimmed, the step for the current level marked "now".
  const skillBody = (c) => {
    const more = `<p class="char-more-row">${moreLink(`${d.skills}#${SKILL_HASH[c.job]}`, t.skillAll, 'skills')}</p>`;
    if (!hub) return card('skills', t.skill(names[c.job]), `<div class="skel-wrap" aria-busy="true" aria-label="${esc(t.loading)}"><span class="skel" style="width:70%;height:12px" aria-hidden="true"></span><span class="skel" style="width:90%;height:12px" aria-hidden="true"></span><span class="skel" style="width:55%;height:12px" aria-hidden="true"></span></div>`, more);
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
  // The character picture: the player's own if they added one, otherwise a beginner (below level 10) or one holding the
  // family's first weapon.
  const AVATAR = { warrior: 'warrior', mage: 'mage', archer: 'archer', thief: 'thief' };
  const avatarSrc = (c) => loadCharImg() || `${d.avatars}${!c || c.lv < 10 ? 'beginner' : AVATAR[family(c.job)] || 'beginner'}.png`;
  const avatar = (c, editable) => {
    const own = !!loadCharImg();
    return `<figure class="char-avatar${own ? ' is-own' : ''}"><div class="char-avatar-frame"><img src="${esc(avatarSrc(c))}" alt="${esc(t.mine)}" width="96" height="96" data-char-img></div>${editable
      ? `<figcaption><label class="char-photo-btn"><input type="file" accept="image/*" data-char-upload class="sr-only">${esc(own ? t.change : t.upload)}</label>${own ? `<button type="button" class="char-photo-reset" data-char="reset-img">${esc(t.reset)}</button>` : ''}<small class="muted" data-char-photo-msg>${esc(t.photoNote)}</small></figcaption>` : ''}</figure>`;
  };
  // Class picker: the site's own menu (the native select looked out of place), grouped by family; the family itself means
  // "still 1st job".
  const GROUPS = [['warrior', ['fighter', 'page', 'spear']], ['mage', ['fire', 'ice', 'cleric']], ['archer', ['hunter', 'crossbow']], ['thief', ['assassin', 'bandit']]];
  const jobPicker = (c) => `<div class="char-job" data-jobpick><button type="button" class="char-job-btn" data-char="job-open" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t.job)}"><span>${esc(names[c.job])}</span><i aria-hidden="true"></i></button>
<div class="char-job-menu" role="menu" hidden>${GROUPS.map(([fam, subs]) => `<div class="char-job-group"><b>${esc(names[fam])}</b>${[fam, ...subs].map((k) => `<button type="button" role="menuitemradio" aria-checked="${c.job === k}" data-pick-job="${k}">${esc(k === fam ? t.firstJob : names[k])}</button>`).join('')}</div>`).join('')}</div></div>`;
  const closeJobs = (focus) => {
    const menu = el.querySelector('.char-job-menu'), btn = el.querySelector('.char-job-btn');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (focus) btn.focus();
  };
  const head = (c) => `<div class="char-head">${avatar(c, true)}<div class="char-head-main"><h2>${esc(t.mine)}</h2><div class="char-controls">
${jobPicker(c)}
<div class="char-lv" role="group" aria-label="${esc(t.lv)}"><button type="button" class="btn ghost" data-char="down" aria-label="${esc(t.down)}">−</button><label><span>Lv.</span><input data-char-lv type="number" min="1" max="200" inputmode="numeric" value="${c.lv}" aria-label="${esc(t.lv)}"></label><button type="button" class="btn ghost" data-char="up" aria-label="${esc(t.up)}">+</button></div>
</div></div></div><div class="char-body"></div>`;
  const body = (c) => {
    // The spots that open closest to the character's level fit best; ties keep the finder's own order.
    const rows = selectRoutes(routes, { level: c.lv, job: c.job }).map((r, i) => ({ r, i })).sort((a, b) => b.r.level.min - a.r.level.min || a.i - b.i).map(({ r }) => r);
    const cls = classHref(c.job);
    const routesBody = rows.length
      ? `<ul class="char-list">${rows.map((r) => `<li><a href="${esc(r.href)}" data-route="${esc(r.id)}" data-char-link="route"><strong>${esc(r.title)}</strong><small>Lv. ${r.level.min}–${r.level.max}</small><span>${esc(r.monsters)}</span></a></li>`).join('')}</ul>`
      : `<p class="muted">${esc(t.none)}</p>`;
    return `${hub?.gear?.length ? cset.html(c, BIT[family(c.job)]) : ''}<div class="char-grid">
${card('routes', t.routesH, routesBody, `<p class="char-more-row">${moreLink(`${finder}?lv=${c.lv}&job=${c.job}`, t.finder, 'finder')}${cls ? moreLink(cls, t.all, 'class') : ''}</p>`, rows.length)}
${card('quests', t.questsH, questsBody(c), `<p class="char-more-row">${moreLink(d.quests, t.all, 'quests')}</p>`, hub ? pickQuests(hub.quests, c).length : 0)}
${card('gear', t.gearH, gearBody(c), `<p class="char-more-row">${moreLink(d.equip, t.all, 'equipment')}</p>`, hub ? pickGear(hub.gear, c).length : 0)}
</div>
${skillBody(c)}`;
  };
  const refresh = () => {
    const c = loadChar(), box = el.querySelector('.char-body');
    if (!c || !box) return;
    try {
      if (hub?.gear) cset.setGear(hub.gear);
      box.innerHTML = body(c);
      cset.refreshLive(refresh);
    } catch (err) {
      // Old saved data (an older char-hub.json from the cache) should never leave the cards loading forever.
      hub = { gear: [], quests: [], skills: {}, skillNames: {} };
      box.innerHTML = body(c);
    }
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
    const img = el.querySelector('[data-char-img]');
    if (img && img.getAttribute('src') !== avatarSrc(next)) img.src = avatarSrc(next);
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
  el.addEventListener('change', async (e) => {
    if (e.target.matches('[data-char-upload]')) {
      const file = e.target.files?.[0];
      if (!file) return;
      let ok = false;
      try { ok = file.type.startsWith('image/') && saveCharImg(await shrink(file)); } catch (err) { ok = false; }
      track('my_char_photo', { action: ok ? 'upload' : 'fail' });
      if (ok) return render();
      const msg = el.querySelector('[data-char-photo-msg]');
      if (msg) msg.textContent = t.photoFail;
      return;
    }
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
    const pick = e.target.closest('[data-pick-job]');
    if (pick) {
      const job = pick.dataset.pickJob;
      el.querySelector('.char-job-btn span').textContent = names[job];
      el.querySelectorAll('[data-pick-job]').forEach((x) => x.setAttribute('aria-checked', String(x === pick)));
      closeJobs(true);
      change({ job }, 'job');
      return;
    }
    const b = e.target.closest('[data-char]');
    if (b?.dataset.char === 'job-open') {
      const menu = el.querySelector('.char-job-menu');
      const open = menu.hidden;
      menu.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      if (open) (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button'))?.focus();
      return;
    }
    if (b?.dataset.char === 'reset-img') {
      saveCharImg(null);
      track('my_char_photo', { action: 'reset' });
      return render();
    }
    if (b?.dataset.char === 'up' || b?.dataset.char === 'down') {
      const c = loadChar();
      if (c) change({ lv: c.lv + (b.dataset.char === 'up' ? 1 : -1) }, b.dataset.char === 'up' ? 'level_up' : 'level_down');
      return;
    }
    const a = e.target.closest('a[data-char-link]');
    if (!a) return;
    const c = loadChar();
    if (a.dataset.route) track('my_char_route_click', { route_id: a.dataset.route });
    track('my_char_click', { kind: a.dataset.charLink, item_id: a.dataset.item ? Number(a.dataset.item) : undefined, ui_value: a.dataset.quest, job: c?.job, level: c?.lv });
  });
  cset.bind(el, loadChar, (c) => BIT[family(c.job)]);
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-jobpick]')) closeJobs(false); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeJobs(true);
    if (!e.target.matches('[data-pick-job]') || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const all = [...el.querySelectorAll('[data-pick-job]')];
    all[(all.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus();
  });
  render();
}
