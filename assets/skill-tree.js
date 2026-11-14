// Skill-tree maths shared by the page build (scripts/skill-pages.mjs), the browser (assets/skills.js) and the tests.
// 1st job: 1 SP at the job advance (level 10), then 3 a level, 61 by level 30. 2nd job: 1 at level 30, then 3 a level,
// 121 by level 70. The two pools are separate, so a build is checked against its own pool only.
export const POOLS = { 1: { base: 10, top: 30, total: 61 }, 2: { base: 30, top: 70, total: 121 } };
export const spAt = (pool, level) => (level < pool.base ? 0 : Math.min(pool.total, 1 + 3 * (Math.min(level, pool.top) - pool.base)));
// The character level at which the c-th point of a pool can be spent.
export const levelFor = (pool, c) => (c <= 1 ? pool.base : pool.base + Math.ceil((c - 1) / 3));

// Spends `sp` points along the build's steps ([skillId, targetLevel] in order) and returns each skill's level.
export function levelsAt(steps, sp) {
  const lv = {};
  let left = sp;
  for (const [id, to] of steps) {
    const now = lv[id] || 0;
    const add = Math.min(Math.max(0, to - now), left);
    lv[id] = now + add;
    left -= add;
    if (!left) break;
  }
  return lv;
}

// Each step with the points it adds and the levels it spans (first point to last point).
export function timeline(steps, pool) {
  const lv = {};
  let used = 0;
  return steps.map(([id, to]) => {
    const add = Math.max(0, to - (lv[id] || 0));
    const from = levelFor(pool, used + 1);
    used += add;
    lv[id] = Math.max(lv[id] || 0, to);
    return { id, to, add, from, at: levelFor(pool, used), used };
  });
}

// Problems with a build: over the pool, past a skill's master level, or a point spent before its prerequisite is met.
export function checkBuild(steps, pool, skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const errors = [];
  const lv = {};
  let used = 0;
  for (const [id, to] of steps) {
    const s = byId.get(id);
    if (!s) { errors.push(`unknown skill ${id}`); continue; }
    if (to > s.master) errors.push(`${s.en} ${to} > master ${s.master}`);
    for (const r of s.req) if (r.id && (lv[r.id] || 0) < r.lv) errors.push(`${s.en} before ${r.name} ${r.lv}`);
    used += Math.max(0, to - (lv[id] || 0));
    lv[id] = Math.max(lv[id] || 0, to);
  }
  if (used > pool.total) errors.push(`uses ${used} of ${pool.total}`);
  return { errors, used, levels: lv };
}
