// Client skill data for the skill-tree page (/skills/): every 1st and 2nd job skillbook of MapleStory Classic World from
// maplestory.io (the MCW client), with Korean and English names, master level, the prerequisite written in the skill
// description ("Required Skill: At least Level 3 ..."), a short description and the numbers at level 1 and at master.
// Icons go to assets/skills/<id>.png. Run by hand when a patch changes skills: node scripts/fetch-skills.mjs
import fs from 'node:fs';

const JOBS = [100, 110, 120, 130, 200, 210, 220, 230, 300, 310, 320, 400, 410, 420];
const API = 'https://maplestory.io/api/MCW/1';
const KEYS = ['damage', 'mpCon', 'hpCon', 'mobCount', 'attackCount', 'time', 'prop', 'x', 'y', 'mad', 'pad', 'pdd', 'mdd', 'acc', 'eva', 'speed', 'jump', 'accX', 'crtX', 'mhpR', 'mmpR', 'indiePddR', 'indieMad', 'range'];
const clean = (s = '') => s.replace(/\\n/g, '\n').replace(/\[[^\]]*Master[^\]]*\]\s*/i, '').replace(/\[마스터 레벨[^\]]*\]\s*/, '').replace(/#c|#/g, '')
  .split('\n').filter((l) => !/^(Required Skill|필요 스킬|선행 스킬|Habilidad requerida)/i.test(l.trim())).join(' ').replace(/\s+/g, ' ').trim();
const pick = (lp) => Object.fromEntries(Object.entries(lp || {}).filter(([k]) => KEYS.includes(k)).map(([k, v]) => [k, Number(v)]));

fs.mkdirSync('assets/skills', { recursive: true });
const out = { updated: new Date().toISOString().slice(0, 10), source: `${API}/job/<id>/skillbook`, jobs: {} };
for (const job of JOBS) {
  const book = await (await fetch(`${API}/job/${job}/skillbook`)).json();
  const skills = [];
  for (const s of book.skills) {
    const d = s.description || {};
    if (!d.names?.en || d.names.en === 'None') continue;
    const en = d.descriptions?.en || d.desc || '';
    // Prerequisites are only written in the description text; resolve the named skill within the same book.
    const req = [...en.replace(/\\n/g, '\n').matchAll(/At[\s\u00a0\u200b]+least[\s\u00a0\u200b]+Level[\s\u00a0\u200b]*(\d+)[\s\u00a0\u200b]+(?:on[\s\u00a0]+)?([^#\n]+)/g)].map(([, lv, name]) => ({ name: name.replace(/[\u00a0\u200b]/g, ' ').trim(), lv: Number(lv) }));
    const lp = s.levelProperties || [];
    skills.push({ id: s.id, ko: d.names.ko || d.names.en, en: d.names.en, master: s.masterLevel, passive: Math.floor(s.id / 1000) % 10 === 0,
      req, descKo: clean(d.descriptions?.ko), descEn: clean(en), lv1: pick(lp[0]), max: pick(lp[s.masterLevel - 1] || lp.at(-1)) });
    if (s.icon) fs.writeFileSync(`assets/skills/${s.id}.png`, Buffer.from(s.icon, 'base64'));
  }
  for (const s of skills) s.req = s.req.map((r) => ({ id: skills.find((x) => x.en.toLowerCase() === r.name.toLowerCase())?.id ?? null, lv: r.lv, name: r.name }));
  out.jobs[job] = { id: job, ko: book.description?.names?.ko, en: book.description?.names?.en, skills };
  console.log(job, skills.length, skills.filter((s) => s.req.length).map((s) => `${s.en}<-${s.req.map((r) => `${r.name} ${r.lv}${r.id ? '' : '?'}`).join(',')}`).join(' | '));
}
fs.writeFileSync('data/skills.json', JSON.stringify(out, null, 1) + '\n');
