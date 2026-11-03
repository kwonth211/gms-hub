// Classic World damage, accuracy and hits-to-kill. Pure functions shared by the calculator page and the tests.
// Formulas follow the community-tested Classic World model (MeowDB "damage formula"): a hit rolls between
//   MIN = S × WATK × (0.8 + (Primary × M × Mult + Secondary) / 100 + AP / 50)
//   MAX = S × WATK × (1.0 + (Primary × Mult + Secondary) / 100 + AP / 50)
// with M = (mastery level / 10 + 0.1) × 0.7, and spells roll between S × Magic × (1 + INT × M / 125) and S × Magic × (1 + INT / 125).
// Defence divides by (DEF + 100) / 100, elements multiply by 1.25 (weak), 0.75 (strong) or 0 (immune).

// Weapon type → primary/secondary stats and the multiplier a basic attack uses (60% swing / 40% stab mix for melee, the
// projectile multiplier for bows, crossbows and claws). These are the numbers behind the range in the stat window.
export const WEAPONS = {
  '1h_sword': { job: 'warrior', mult: 1.8 },
  '2h_sword': { job: 'warrior', mult: 2.5 },
  '1h_axe': { job: 'warrior', mult: 1.92 },
  '1h_blunt': { job: 'warrior', mult: 1.92 },
  '2h_axe': { job: 'warrior', mult: 2.6 },
  '2h_blunt': { job: 'warrior', mult: 2.6 },
  spear: { job: 'warrior', mult: 2.3 },
  polearm: { job: 'warrior', mult: 2.7 },
  bow: { job: 'archer', mult: 2.5 },
  crossbow: { job: 'archer', mult: 2.5 },
  claw: { job: 'thief', mult: 2.5 },
  dagger: { job: 'thief', mult: 1.4 },
  wand: { job: 'mage', mult: 1.8 },
  staff: { job: 'mage', mult: 1.8 }
};

export function statsFor(weapon, s) {
  const job = WEAPONS[weapon]?.job;
  if (job === 'archer') return { primary: s.dex, secondary: s.str };
  if (job === 'thief') return { primary: s.luk, secondary: s.str + s.dex };
  return { primary: s.str, secondary: s.dex };
}

// Mastery skills run 0-20 in the skill window; the formula's mastery level is half of that (Sword Mastery 20 = level 10).
export const masteryLevel = (skillLevel) => Math.min(10, Math.ceil(Math.max(0, skillLevel || 0) / 2));
export const masteryFactor = (level) => (level / 10 + 0.1) * 0.7;

// Attack skills at their master level. `power` is the percent (or spell power), `lines` the hits per use, `mobs` how many
// monsters one use reaches. `mult`/`m` override the weapon multiplier and mastery where the skill has its own constants.
// `el` is the spell element in the client's codes (F fire, I ice, L lightning, S poison, H holy). Second-job keys limit a skill to that job; weapons limit it to those weapon types.
export const SKILLS = [
  { id: 'basic', power: 100, lines: 1, mobs: 1 },
  { id: 'power_strike', jobs: ['warrior'], power: 260, lines: 1, mobs: 1 },
  { id: 'slash_blast', jobs: ['warrior'], power: 130, lines: 1, mobs: 6 },
  { id: 'rush', jobs: ['warrior'], second: ['fighter', 'page', 'spearman'], power: 80, lines: 1, mobs: 6 },
  { id: 'fa_fighter', jobs: ['warrior'], second: ['fighter'], power: 200, lines: 1, mobs: 3 },
  { id: 'fa_page', jobs: ['warrior'], second: ['page'], power: 360, lines: 1, mobs: 1 },
  { id: 'fa_spear', jobs: ['warrior'], second: ['spearman'], power: 350, lines: 1, mobs: 1 },
  { id: 'arrow_blow', jobs: ['archer'], power: 240, lines: 1, mobs: 1 },
  { id: 'double_shot', jobs: ['archer'], power: 120, lines: 2, mobs: 1 },
  { id: 'arrow_bomb', jobs: ['archer'], second: ['hunter'], power: 130, lines: 1, mobs: 6 },
  { id: 'fa_bow', jobs: ['archer'], second: ['hunter'], power: 120, lines: 1, mobs: 3 },
  { id: 'iron_arrow', jobs: ['archer'], second: ['crossbowman'], power: 180, lines: 1, mobs: 6 },
  { id: 'fa_crossbow', jobs: ['archer'], second: ['crossbowman'], power: 360, lines: 1, mobs: 1 },
  { id: 'lucky_seven', jobs: ['thief'], weapons: ['claw'], power: 140, lines: 2, mobs: 1, mult: 3.0, m: 0.5 },
  { id: 'drain', jobs: ['thief'], second: ['assassin'], weapons: ['claw'], power: 240, lines: 1, mobs: 1, mult: 2.5 },
  { id: 'double_stab', jobs: ['thief'], weapons: ['dagger'], power: 160, lines: 2, mobs: 1 },
  { id: 'savage_blow', jobs: ['thief'], second: ['bandit'], weapons: ['dagger'], power: 75, lines: 6, mobs: 1 },
  { id: 'steal', jobs: ['thief'], second: ['bandit'], weapons: ['dagger'], power: 180, lines: 1, mobs: 2 },
  { id: 'energy_bolt', jobs: ['mage'], power: 130, lines: 1, mobs: 1, magic: true },
  { id: 'magic_claw', jobs: ['mage'], power: 65, lines: 2, mobs: 1, magic: true },
  { id: 'fire_arrow', jobs: ['mage'], second: ['fp'], power: 180, lines: 1, mobs: 1, magic: true, el: 'F' },
  { id: 'poison_breath', jobs: ['mage'], second: ['fp'], power: 90, lines: 1, mobs: 6, magic: true, el: 'S' },
  { id: 'cold_beam', jobs: ['mage'], second: ['il'], power: 170, lines: 1, mobs: 1, magic: true, el: 'I' },
  { id: 'thunder_bolt', jobs: ['mage'], second: ['il'], power: 80, lines: 1, mobs: 6, magic: true, el: 'L' },
  { id: 'holy_arrow', jobs: ['mage'], second: ['cleric'], power: 160, lines: 1, mobs: 1, magic: true, el: 'H' }
];

export const SECOND_JOBS = {
  warrior: ['fighter', 'page', 'spearman'],
  archer: ['hunter', 'crossbowman'],
  thief: ['assassin', 'bandit'],
  mage: ['fp', 'il', 'cleric']
};

export function skillsFor(weapon, second) {
  const job = WEAPONS[weapon]?.job;
  return SKILLS.filter((s) => {
    if (s.id === 'basic') return job !== 'mage';
    if (s.jobs && !s.jobs.includes(job)) return false;
    if (s.weapons && !s.weapons.includes(weapon)) return false;
    if (s.second && second && !s.second.includes(second)) return false;
    return true;
  });
}

// The basic-attack range the stat window shows, before skills, crits and monster defence.
export function windowRange({ weapon, stats, watk, mastery = 0, ap = 0 }) {
  const { primary, secondary } = statsFor(weapon, stats);
  const mult = WEAPONS[weapon].mult;
  const m = masteryFactor(mastery);
  return {
    min: watk * (0.8 + (primary * m * mult + secondary) / 100 + ap / 50),
    max: watk * (1 + (primary * mult + secondary) / 100 + ap / 50)
  };
}

// The stat window range carries weapon attack, scrolls, gloves, stars and mastery in two numbers. Solving the formula
// backwards gives the attack and mastery the calculator then uses for every skill.
export function fromWindow({ weapon, stats, min, max, ap = 0 }) {
  const { primary, secondary } = statsFor(weapon, stats);
  const mult = WEAPONS[weapon].mult;
  const watk = max / (1 + (primary * mult + secondary) / 100 + ap / 50);
  if (!(watk > 0) || !primary) return null;
  const m = ((min / watk - 0.8 - secondary / 100 - ap / 50) * 100) / (primary * mult);
  const level = Math.max(0, Math.min(10, Math.round((m / 0.7 - 0.1) * 10)));
  return { watk, mastery: level };
}

const ELEMENT = { 1: 0, 2: 0.75, 3: 1.25 };
export function elementFactor(mob, el) {
  if (!el || !mob.el) return 1;
  const m = mob.el.match(new RegExp(`${el}(\\d)`));
  return m ? ELEMENT[m[1]] ?? 1 : 1;
}

// One use of a skill against one monster: per-line min/max after defence and element, and the hit counts.
export function hitRange({ weapon, stats, watk, magic, mastery = 0, ap = 0, skill, power, mob }) {
  const s = (power ?? skill.power) / 100;
  let min;
  let max;
  if (skill.magic) {
    const m = masteryFactor(mastery);
    max = s * magic * (1 + stats.int / 125);
    min = s * magic * (1 + (stats.int * m) / 125);
  } else {
    const { primary, secondary } = statsFor(weapon, stats);
    const mult = skill.mult ?? WEAPONS[weapon].mult;
    const m = skill.m ?? masteryFactor(mastery);
    max = s * watk * (1 + (primary * mult + secondary) / 100 + ap / 50);
    min = s * watk * (0.8 + (primary * m * mult + secondary) / 100 + ap / 50);
  }
  const def = skill.magic ? mob.mdef : mob.wdef;
  const k = (100 / ((def || 0) + 100)) * elementFactor(mob, skill.el);
  const clamp = (v) => (k === 0 ? 0 : Math.max(1, Math.min(99999, Math.trunc(v * k))));
  return { min: clamp(min), max: clamp(max) };
}

// Uses needed to kill: `sure` when every line rolls its minimum, `avg` with average rolls. Damage over time, crits and
// Final Attack follow-ups are left out so the sure count is a floor you can rely on.
export function hitsToKill(range, lines, hp) {
  if (!range.max) return { sure: Infinity, avg: Infinity };
  const perUseMin = range.min * lines;
  const perUseAvg = ((range.min + range.max) / 2) * lines;
  return { sure: Math.ceil(hp / perUseMin), avg: Math.ceil(hp / perUseAvg) };
}

// Accuracy from stats alone (no equipment bonus), per job.
export function baseAccuracy(job, level, s) {
  const common = 1.2 * s.dex + 2 * level + 0.6 * s.luk;
  if (job === 'warrior') return Math.floor(common / 2.5 + 10);
  if (job === 'archer') return Math.floor(common / 4.8 + 20);
  if (job === 'thief') return Math.floor(common / 4 + 15);
  if (job === 'mage') return Math.floor((1.2 * s.int + 2 * level + 0.6 * s.luk) / 5.1 + 20);
  return Math.floor(common / 2.5 + 5);
}

// Chance that an attack connects, from total accuracy, levels and the monster's avoid.
export function hitChance(acc, level, mob) {
  const gap = Math.max(0, mob.lv - level);
  const a = (acc * 100) / (10 * gap + 255);
  if (!mob.eva) return 1;
  const d = a - mob.eva;
  if (d >= 25 + gap * (0.5 * level + 15)) return 1;
  const f = 0.15 + 0.2 / (1 + Math.exp(d / 12));
  const q = mob.eva / a;
  if (q <= 1 - f) return 1;
  if (q >= 1 + f) return 0;
  return (1 + f - q) / (2 * f);
}

// The accuracy that reaches 100% against a monster at a given level (the "same-level accuracy" guides quote).
export function accuracyNeeded(level, mob) {
  if (!mob.eva) return 0;
  let lo = 0;
  let hi = 2000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hitChance(mid, level, mob) >= 1) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
