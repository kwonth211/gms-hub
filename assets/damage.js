// Hits-to-kill calculator page. Fills the character from the player's stat window (screen share + OCR, read in this browser
// only) or from typed numbers, then lists every monster with the chosen skill's damage, uses to kill and hit chance.
import { INK_LEVELS, parseJob, parseValue, readLayout, rescale, valueImage, vote } from './stat-reader.js';
import { accuracyNeeded, baseAccuracy, fromWindow, hitChance, hitRange, hitsToKill, masteryLevel, SECOND_JOBS, skillsFor, WEAPONS, windowRange } from './damage-calc.js';

const data = JSON.parse(document.getElementById('dm-data').textContent);
const t = data.t;
const lang = data.lang;
const $ = (id) => document.getElementById(id);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const fmt = (n) => Math.round(n).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STORE = 'gmshub_dmg';
const track = (name, params) => window.gtag?.('event', name, params);

let mobs = [];
let weapons = [];
let skillId = 'basic';
let showAll = false;
let powerTouched = false;

// ---------- inputs ----------

for (const [k, label] of Object.entries(t.weapons)) $('dm-weapon').append(new Option(label, k));

function fillSeconds() {
  const job = WEAPONS[$('dm-weapon').value].job;
  const keep = $('dm-second').value;
  $('dm-second').replaceChildren(new Option(t.none, ''), ...SECOND_JOBS[job].map((k) => new Option(t.seconds[k], k)));
  if (SECOND_JOBS[job].includes(keep)) $('dm-second').value = keep;
}

const val = (id) => {
  const v = $(id).value.trim();
  return v === '' ? null : Number(v);
};

function state() {
  const weapon = $('dm-weapon').value;
  return {
    weapon,
    job: WEAPONS[weapon].job,
    second: $('dm-second').value,
    level: val('dm-level'),
    stats: { str: val('dm-str') ?? 4, dex: val('dm-dex') ?? 4, int: val('dm-int') ?? 4, luk: val('dm-luk') ?? 4 },
    min: val('dm-min'),
    max: val('dm-max'),
    magic: val('dm-magic'),
    acc: val('dm-acc'),
    rage: $('dm-rage').checked,
    weaponId: $('dm-wsearch').dataset.id ? Number($('dm-wsearch').dataset.id) : null,
    extra: val('dm-extra') ?? 0,
    mastery: val('dm-mastery') ?? 0,
    power: val('dm-power')
  };
}

function save() {
  const s = state();
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...s, skillId, wname: $('dm-wsearch').value }));
  } catch {}
}

function restore() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch {}
  if (!s) return;
  if (WEAPONS[s.weapon]) $('dm-weapon').value = s.weapon;
  fillSeconds();
  $('dm-second').value = s.second || '';
  const put = (id, v) => { if (v !== null && v !== undefined) $(id).value = v; };
  put('dm-level', s.level);
  for (const k of ['str', 'dex', 'int', 'luk']) put(`dm-${k}`, s.stats?.[k]);
  put('dm-min', s.min);
  put('dm-max', s.max);
  put('dm-magic', s.magic);
  put('dm-acc', s.acc);
  put('dm-extra', s.extra || null);
  put('dm-mastery', s.mastery || null);
  $('dm-rage').checked = !!s.rage;
  if (s.wname) {
    $('dm-wsearch').value = s.wname;
    if (s.weaponId) $('dm-wsearch').dataset.id = s.weaponId;
  }
  if (s.skillId) skillId = s.skillId;
  if (s.power) {
    $('dm-power').value = s.power;
    powerTouched = true;
  }
}

// Fields that only make sense for the current job are hidden rather than ignored silently.
function syncVisibility() {
  const job = WEAPONS[$('dm-weapon').value].job;
  for (const el of document.querySelectorAll('[data-phys]')) el.hidden = job === 'mage';
  $('dm-magic').closest('label').hidden = job !== 'mage';
  for (const el of document.querySelectorAll('[data-warrior]')) el.hidden = job !== 'warrior';
}

function renderSkills() {
  const s = state();
  const list = skillsFor(s.weapon, s.second);
  if (!list.some((k) => k.id === skillId)) {
    skillId = list[0].id;
    powerTouched = false;
  }
  $('dm-heal-note').hidden = s.second !== 'cleric';
  $('dm-skills').replaceChildren(
    ...list.map((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(k.id === skillId));
      b.innerHTML = `${esc(t.skills[k.id])} <small>${k.power}%${k.lines > 1 ? ` · ${fill(t.lines, { n: k.lines })}` : ''}${k.mobs > 1 ? ` · ${fill(t.mobsHit, { n: k.mobs })}` : ''}</small>`;
      b.addEventListener('click', () => {
        skillId = k.id;
        powerTouched = false;
        renderSkills();
        update();
      });
      return b;
    })
  );
  const skill = list.find((k) => k.id === skillId);
  if (!powerTouched) $('dm-power').value = skill.power;
}

// ---------- weapon picker (manual range) ----------

function fillWeapons() {
  const type = $('dm-weapon').value;
  const list = weapons.filter((w) => w.type === type);
  $('dm-wlist').replaceChildren(...list.map((w) => new Option(`${w.name} (Lv ${w.lv}, ${w.watk || w.matk})`, `${w.name} (Lv ${w.lv}, ${w.watk || w.matk})`)));
}

function pickWeapon() {
  const v = $('dm-wsearch').value;
  const w = weapons.find((x) => v === `${x.name} (Lv ${x.lv}, ${x.watk || x.matk})` || v === x.name || v === x.en);
  if (w) $('dm-wsearch').dataset.id = w.id;
  else delete $('dm-wsearch').dataset.id;
}

// The attack and mastery the formulas need: solved from the stat window range when given, otherwise from the weapon.
function attackModel(s) {
  if (s.job === 'mage') return s.magic ? { magic: s.magic, mastery: 0 } : null;
  const ap = s.rage ? 40 : 0;
  if (s.min && s.max && s.max >= s.min) {
    const solved = fromWindow({ weapon: s.weapon, stats: s.stats, min: s.min, max: s.max });
    if (solved) return { watk: solved.watk, mastery: solved.mastery, ap };
  }
  const w = weapons.find((x) => x.id === s.weaponId);
  if (!w) return null;
  const watk = w.watk + s.extra;
  const mastery = masteryLevel(s.mastery);
  const r = windowRange({ weapon: s.weapon, stats: s.stats, watk, mastery });
  $('dm-estimated').textContent = `${t.estimated}: ${fmt(Math.trunc(r.min))} ~ ${fmt(Math.trunc(r.max))}`;
  return { watk, mastery, ap };
}

// ---------- results ----------

function elementTags(m) {
  const tags = [];
  for (const [, el, code] of m.el.matchAll(/([A-Z])(\d)/g)) {
    const name = (lang === 'ko' ? { F: '불', I: '얼음', L: '번개', S: '독', H: '성', P: '물리' } : { F: tx('Fire'), I: tx('Ice'), L: tx('Lightning'), S: tx('Poison'), H: tx('Holy'), P: tx('Physical') })[el];
    const kind = { 1: 'immune', 2: 'strong', 3: 'weak' }[code];
    if (name && kind) tags.push(`<span class="tag ${kind}">${name} ${t[kind]}</span>`);
  }
  if (m.undead) tags.push(`<span class="tag">${t.undead}</span>`);
  if (m.boss) tags.push(`<span class="tag">${t.boss}</span>`);
  return tags.join('');
}

function update() {
  const s = state();
  save();
  const skill = skillsFor(s.weapon, s.second).find((k) => k.id === skillId);
  const model = s.level ? attackModel(s) : null;
  if (!model || !skill) {
    $('dm-rows').innerHTML = `<tr class="empty"><td colspan="7">${esc(t.needStats)}</td></tr>`;
    return;
  }
  if (s.min && s.max) $('dm-estimated').textContent = '';
  const acc = s.acc ?? baseAccuracy(s.job, s.level, s.stats);
  const q = $('dm-mob-q').value.trim().toLowerCase();
  const list = mobs.filter((m) => {
    if (q) return m.name.toLowerCase().includes(q) || m.en.toLowerCase().includes(q) || m.aliases.includes(q);
    // Monsters from areas that aren't open (or aren't on any map) only show under "all" or when searched.
    return showAll || (m.lv >= s.level - 20 && m.lv <= s.level + 15 && !m.boss && !m.status);
  });
  if (!list.length) {
    $('dm-rows').innerHTML = `<tr class="empty"><td colspan="7">${esc(t.emptyMobs)}</td></tr>`;
    return;
  }
  const power = s.power || skill.power;
  $('dm-rows').innerHTML = list
    .map((m) => {
      const r = hitRange({ weapon: s.weapon, stats: s.stats, watk: model.watk, magic: model.magic, mastery: model.mastery, ap: model.ap, skill, power, mob: m });
      const n = hitsToKill(r, skill.lines, m.hp);
      const p = hitChance(acc, s.level, m);
      const need = accuracyNeeded(s.level, m);
      const cut = (k) => (Number.isFinite(k) ? fill(t.hits, { n: k }) : t.never);
      const cls = n.sure === 1 ? 'one' : n.sure === 2 ? 'two' : '';
      const accCls = p >= 1 ? 'ok' : p >= 0.8 ? 'warn' : 'bad';
      const dmg = r.max ? `${fmt(r.min)} ~ ${fmt(r.max)}${skill.lines > 1 ? ` ×${skill.lines}` : ''}` : t.never;
      return `<tr class="${cls}"><th scope="row"><a href="${esc(data.monstersUrl)}${m.id}/">${esc(m.name)}</a><span class="dm-tags">${m.status ? `<span class="tag">${esc(t.status?.[m.status] || '')}</span>` : ''}${elementTags(m)}</span></th><td>${m.lv}</td><td>${fmt(m.hp)}</td><td>${dmg}</td><td class="dm-sure">${cut(n.sure)}</td><td>${cut(n.avg)}</td><td class="dm-acc ${accCls}" title="${esc(fill(t.accNeed, { n: need }))}">${Math.floor(p * 100)}%<small>${esc(fill(t.accNeed, { n: need }))}</small></td></tr>`;
    })
    .join('');
}

// ---------- reading the stat window ----------

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let worker = null;
async function ocr() {
  if (!worker) {
    worker = (async () => {
      say(t.loadingOcr);
      if (!window.Tesseract)
        await new Promise((ok, fail) => {
          const el = document.createElement('script');
          el.src = TESSERACT_URL;
          el.onload = ok;
          el.onerror = fail;
          document.head.appendChild(el);
        });
      return window.Tesseract.createWorker('eng');
    })().catch((e) => {
      worker = null;
      throw e;
    });
  }
  return worker;
}

const say = (msg) => { $('dm-status').textContent = msg; };

async function captureFrame() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // The first frames after sharing starts can be blank while the capture warms up.
    await new Promise((r) => setTimeout(r, 700));
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  } finally {
    for (const tr of stream.getTracks()) tr.stop();
  }
}

function toCanvas(im) {
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  c.getContext('2d').putImageData(new ImageData(im.data, im.width, im.height), 0, 0);
  return c;
}

const NUMBER_KEYS = ['level', 'str', 'dex', 'int', 'luk', 'attack', 'magic', 'acc'];

// The stat window's boxes are found by colour (stat-reader.js); only the numbers inside go through OCR. Each box is read
// at three ink cut-offs, and on scaled screens also from a copy shrunk back to game size; the most common answer wins.
async function readStats(img) {
  const layout = readLayout(img);
  if (!layout || (!layout.str && !layout.level)) return null;
  // Screen scale from the row pitch (18 game pixels between STR, DEX, INT and LUK), steadier than one box's height.
  const s = layout.str && layout.luk ? (layout.luk.y0 - layout.str.y0) / 54 : layout.rowHeight / 15;
  const small = s >= 1.2 ? rescale(img, s) : null;
  const shrink = (c) => ({ ...c, x0: c.x0 / s, x1: c.x1 / s, y0: c.y0 / s, y1: c.y1 / s });
  const w = await ocr();
  await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789-/()% ' });
  const out = { detail: !!layout.attack };
  for (const k of NUMBER_KEYS) {
    if (!layout[k]) continue;
    const reads = [];
    for (const ink of INK_LEVELS) {
      reads.push(parseValue(k, (await w.recognize(toCanvas(valueImage(img, layout[k], { ink })))).data.text));
      if (small) reads.push(parseValue(k, (await w.recognize(toCanvas(valueImage(small, shrink(layout[k]), { ink })))).data.text));
    }
    out[k] = vote(reads);
  }
  if (layout.job) {
    await w.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
    out.job = parseJob((await w.recognize(toCanvas(valueImage(img, layout.job, { ink: 175 })))).data.text);
  }
  return out;
}

async function readFromScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) return say(t.unsupported);
  $('dm-read').disabled = true;
  say(t.sharing);
  let frame;
  try {
    frame = await captureFrame();
  } catch {
    $('dm-read').disabled = false;
    return say(t.denied);
  }
  try {
    say(t.reading);
    const r = await readStats(frame);
    if (!r) {
      track('damage_read', { result: 'not_found', width: frame.width });
      return say(t.notFound);
    }
    apply(r);
  } catch {
    say(t.notFound);
    track('damage_read', { result: 'error' });
  } finally {
    $('dm-read').disabled = false;
  }
}

function apply(r) {
  const got = {};
  const put = (id, v, key) => {
    if (v === undefined || v === null || Number.isNaN(v)) return (got[key] = false);
    $(id).value = v;
    $(id).classList.add('dm-filled');
    got[key] = true;
  };
  if (r.job) {
    const [, second, weapon] = r.job;
    if (weapon && WEAPONS[$('dm-weapon').value].job !== WEAPONS[weapon].job) $('dm-weapon').value = weapon;
    fillSeconds();
    if (second) $('dm-second').value = second;
    got.job = true;
  } else got.job = false;
  put('dm-level', r.level, 'level');
  for (const k of ['str', 'dex', 'int', 'luk']) put(`dm-${k}`, r[k], k);
  const mage = WEAPONS[$('dm-weapon').value].job === 'mage';
  if (mage) put('dm-magic', r.magic, 'magic');
  else if (r.attack) {
    put('dm-min', Math.min(...r.attack), 'range');
    put('dm-max', Math.max(...r.attack), 'range');
  } else got.range = false;
  put('dm-acc', r.acc, 'acc');
  const keys = ['level', 'str', 'dex', 'int', 'luk', mage ? 'magic' : 'range', 'acc', 'job'];
  $('dm-checks').innerHTML = keys.map((k) => `<li data-state="${got[k] ? 'ok' : 'miss'}"><span class="dot" aria-hidden="true"></span>${esc(t.fields[k])} <small>${got[k] ? t.read : t.miss}</small></li>`).join('');
  $('dm-checks').hidden = false;
  const okCount = keys.filter((k) => got[k]).length;
  say(okCount >= 6 ? t.done : r.detail ? t.partial : t.noDetail);
  track('damage_read', { result: okCount >= 6 ? 'ok' : 'partial', fields: okCount });
  syncVisibility();
  renderSkills();
  update();
}

// ---------- wiring ----------

fillSeconds();
restore();
syncVisibility();
renderSkills();

$('dm-weapon').addEventListener('change', () => {
  fillSeconds();
  syncVisibility();
  fillWeapons();
  $('dm-wsearch').value = '';
  delete $('dm-wsearch').dataset.id;
  renderSkills();
  update();
});
$('dm-second').addEventListener('change', () => {
  renderSkills();
  update();
});
$('dm-power').addEventListener('input', () => {
  powerTouched = true;
  update();
});
$('dm-wsearch').addEventListener('input', () => {
  pickWeapon();
  update();
});
for (const id of ['dm-level', 'dm-str', 'dm-dex', 'dm-int', 'dm-luk', 'dm-min', 'dm-max', 'dm-magic', 'dm-acc', 'dm-extra', 'dm-mastery', 'dm-rage', 'dm-mob-q'])
  $(id).addEventListener('input', (e) => {
    e.target.classList.remove('dm-filled');
    update();
  });
for (const [id, all] of [['dm-near', false], ['dm-all', true]])
  $(id).addEventListener('click', () => {
    showAll = all;
    $('dm-near').setAttribute('aria-pressed', String(!all));
    $('dm-all').setAttribute('aria-pressed', String(all));
    update();
  });
$('dm-read').addEventListener('click', readFromScreen);
if (!navigator.mediaDevices?.getDisplayMedia) $('dm-read').disabled = true;

Promise.all([fetch(data.mobsUrl).then((r) => r.json()), fetch(data.weaponsUrl).then((r) => r.json())])
  .then(([m, w]) => {
    mobs = m.map(([id, ko, en, lv, hp, wdef, mdef, eva, el, undead, boss, mp, aliases, status]) => ({ id, name: (lang === 'ko' && ko) || en, en, lv, hp, wdef, mdef, eva, el, undead, boss, mp, aliases: String(aliases || '').toLowerCase(), status }));
    weapons = w.map(([id, ko, en, type, lv, watk, matk]) => ({ id, name: (lang === 'ko' && ko) || en, en, type, lv, watk, matk }));
    // The training finder links each monster here as ?mob=<English name>.
    const mob = new URLSearchParams(location.search).get('mob');
    const hit = mob && mobs.find((x) => x.en.toLowerCase() === mob.toLowerCase());
    if (hit) $('dm-mob-q').value = hit.name;
    fillWeapons();
    pickWeapon();
    update();
  })
  .catch(() => say(lang === 'ko' ? '몬스터 데이터를 불러오지 못했어요. 새로고침해 주세요.' : tx('Could not load monster data. Please reload.')));
