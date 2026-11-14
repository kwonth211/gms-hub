// /skills/: the standard skill builds for every 1st and 2nd job, drawn as an in-game skill window. Skill names, icons,
// master levels and prerequisites come from the client (data/skills.json, scripts/fetch-skills.mjs); the builds are the
// overlap of YouTube guides and community write-ups (data/skill-builds.json); sources stay in the data, not on the page. The page is complete without scripting:
// every build is rendered at level 30/70; assets/skills.js adds the class/job switch and the level slider.
import { POOLS, levelsAt, timeline } from '../assets/skill-tree.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function skillsBody({ lang, skills, data, link, icon }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const L = (o, k = '') => (o ? (ko ? o[`${k}ko`] ?? o.ko : o[`${k}en`] ?? o.en) : '');
  const name = (s) => (ko ? s.ko : s.en);
  const book = (job) => skills.jobs[job].skills;
  const sid = (id) => book(Math.floor(id / 10000)).find((s) => s.id === id);
  const jobName = (job) => {
    for (const c of data.classes) {
      if (c.job === job) return L(c);
      const j = c.second.find((x) => x.job === job);
      if (j) return L(j);
    }
    return '';
  };

  // One-line numbers for a skill at a level: damage, targets, hits, MP, duration, the passive's main value.
  const stat = (s, lv) => {
    if (!lv) return '';
    const p = lv >= s.master ? s.max : s.lv1;
    const bits = [];
    if (p.damage) bits.push(`${p.damage}%`);
    if (p.mobCount > 1) bits.push(tr(`${p.mobCount}마리`, `${p.mobCount} targets`));
    if (p.attackCount > 1) bits.push(tr(`${p.attackCount}타`, `${p.attackCount} hits`));
    if (p.mpCon) bits.push(`MP ${p.mpCon}`);
    if (p.time) bits.push(tr(`${p.time}초`, `${p.time}s`));
    return bits.join(' · ');
  };

  // The skill window: skills as a tree (a skill hangs under the one it requires), level boxes, a bar per skill.
  const windowHtml = (job, title, levels, poolNo) => {
    const list = book(job);
    const kids = new Map();
    const roots = [];
    for (const s of list) {
      const parent = s.req.find((r) => r.id)?.id;
      if (parent) kids.set(parent, [...(kids.get(parent) || []), s]);
      else roots.push(s);
    }
    const node = (s, req) => {
      const lv = levels[s.id] || 0;
      const sub = kids.get(s.id) || [];
      return `<li class="sk-node${lv ? '' : ' is-zero'}${lv >= s.master ? ' is-max' : ''}" data-skill="${s.id}" data-master="${s.master}">
<div class="sk-row"><span class="sk-ico"><img src="${icon(s.id)}" alt="" width="32" height="32" loading="lazy"></span>
<span class="sk-name"><b>${esc(name(s))}</b><small>${esc(ko ? s.descKo : s.descEn)}</small>${req ? `<em class="sk-req">${tr(`${esc(name(sid(req.id)))} ${req.lv} 필요`, `Needs ${esc(name(sid(req.id)))} ${req.lv}`)}</em>` : ''}</span>
<span class="sk-lv"><b data-lv>${lv}</b><i>/${s.master}</i></span>
<span class="sk-bar" aria-hidden="true"><i style="width:${Math.round((lv / s.master) * 100)}%"></i></span></div>
${sub.length ? `<ul class="sk-kids">${sub.map((c) => node(c, c.req.find((r) => r.id))).join('')}</ul>` : ''}</li>`;
    };
    const pool = POOLS[poolNo];
    return `<div class="sk-window" role="group" aria-label="${esc(title)}">
<div class="sk-title"><span>SKILL</span><b>${esc(title)}</b><span class="sk-sp">SP <b data-sp-left>0</b></span></div>
<div class="sk-tabs" aria-hidden="true"><span${poolNo === 1 ? ' class="on"' : ''}>${tr('1차', '1st')}</span><span${poolNo === 2 ? ' class="on"' : ''}>${tr('2차', '2nd')}</span></div>
<ul class="sk-list">${roots.map((s) => node(s)).join('')}</ul>
<div class="sk-foot"><span>${tr('캐릭터 레벨', 'Character level')} <b data-level>${pool.top}</b></span><span>${tr('쓴 SP', 'SP used')} <b data-sp-used>0</b> / <b data-sp-total>${pool.total}</b></span></div>
</div>`;
  };

  // A build: its steps with the levels they land on, the note, and who agrees on it.
  const stepsHtml = (b, poolNo) => {
    const pool = POOLS[poolNo];
    return `<ol class="sk-steps">${timeline(b.steps, pool).filter((t) => t.add).map((t) => {
      const s = sid(t.id);
      const lvl = t.from === t.at ? `${t.at}` : `${t.from}–${t.at}`;
      return `<li data-step-at="${t.at}" data-step-from="${t.from}"><span class="sk-when">Lv ${lvl}</span><img src="${icon(t.id)}" alt="" width="24" height="24" loading="lazy"><span>${esc(name(s))} <b>→ ${t.to}</b>${t.to >= s.master ? ` <em class="sk-m">${tr('마스터', 'max')}</em>` : ''}</span></li>`;
    }).join('')}</ol>`;
  };

  const tree = ({ job, poolNo, builds, title, guide, intro }) => {
    const pool = POOLS[poolNo];
    const first = builds[0];
    const payload = { job, pool: poolNo, builds: builds.map((b) => ({ id: b.id, steps: b.steps })) };
    return `<div class="sk-tree" data-tree='${esc(JSON.stringify(payload))}'>
${builds.length > 1 ? `<div class="sk-builds" role="tablist" aria-label="${tr('빌드 고르기', 'Pick a build')}">${builds.map((b, i) => `<button type="button" role="tab" class="sk-build-btn" data-build="${b.id}" aria-selected="${i ? 'false' : 'true'}">${esc(L(b))}${b.tagKo ? `<small>${esc(ko ? b.tagKo : b.tagEn)}</small>` : ''}</button>`).join('')}</div>` : ''}
${intro ? `<p class="sk-intro">${esc(intro)}</p>` : ''}
<div class="sk-grid">
${windowHtml(job, title, levelsAt(first.steps, pool.total), poolNo)}
<div class="sk-side">
<label class="sk-slider"><span>${tr('레벨을 움직여 보세요', 'Drag the level')} <b data-level-label>Lv ${pool.top}</b></span>
<input type="range" min="${pool.base}" max="${pool.top}" value="${pool.top}" step="1" data-level-input aria-label="${tr('캐릭터 레벨', 'Character level')}"></label>
<p class="sk-now" data-now hidden></p>
${builds.map((b, i) => `<div class="sk-build" data-build-panel="${b.id}"${i ? ' hidden' : ''}>
<h4>${tr('찍는 순서', 'SP order')}${builds.length > 1 ? ` · ${esc(L(b))}` : ''}</h4>
${stepsHtml(b, poolNo)}
<p class="sk-note">${esc(ko ? b.noteKo : b.noteEn)}</p>
</div>`).join('')}
</div></div></div>`;
  };

  const classSec = (c) => {
    const main = book(c.job).find((s) => s.id === c.builds[0].steps[0][0]);
    const forJobs = (b) => (b.for || []).map(jobName).filter(Boolean);
    return `<section class="sk-class" id="${c.id}" data-class="${c.id}">
<header class="sk-class-head"><img class="sk-class-ico" src="${icon(main.id)}" alt="" width="40" height="40"><div><h2>${esc(L(c))}</h2><p>${tr(`1차 61포인트 · 2차 121포인트`, '1st job 61 SP · 2nd job 121 SP')}</p></div></header>
<div class="sk-stat"><h3>${tr('스탯', 'Stats')} <span class="sk-stat-keys"><b>${c.statMain}</b> ${tr('주 스탯', 'main')} · <b>${c.statSub}</b> ${tr('요구치만', 'only as required')}</span></h3>
<p>${esc(L(c.stat))}</p></div>
<h3 class="sk-h">${tr(`${L(c)} 1차 스킬트리`, `${L(c)} 1st job`)}</h3>
<p class="sk-core">${tr('모든 빌드 공통:', 'Every build:')} <b>${esc(L(c.core))}</b>${c.builds.length > 1 ? tr('. 남는 포인트는 갈 2차에 맞춰 골라요.', '. The rest depends on your 2nd job.') : ''}</p>
${tree({ job: c.job, poolNo: 1, builds: c.builds, title: tr(`${L(c)} (1차)`, `${L(c)} (1st job)`) })}
${c.builds.some((b) => b.for?.length) && c.builds.length > 1 ? `<p class="sk-for">${c.builds.map((b) => `<span><b>${esc(L(b))}</b> → ${forJobs(b).map(esc).join(', ')}</span>`).join('')}</p>` : ''}
${c.disagree ? `<aside class="sk-split"><b>${tr('다른 방법', 'Another way')}</b><p>${esc(L(c.disagree))}</p></aside>` : ''}
<h3 class="sk-h">${tr('2차 스킬트리', '2nd job')}</h3>
<div class="sk-jobs" role="tablist" aria-label="${tr('2차 직업', '2nd job')}">${c.second.map((j, i) => `<button type="button" role="tab" class="sk-job-btn" data-job="${j.job}" aria-selected="${i ? 'false' : 'true'}"><img src="${icon(j.builds[0].steps.find(([id]) => book(j.job).find((s) => s.id === id && !s.passive))?.[0] ?? j.builds[0].steps[0][0])}" alt="" width="24" height="24">${esc(L(j))}</button>`).join('')}</div>
${c.second.map((j, i) => `<div class="sk-job" data-job-panel="${j.job}" id="${c.id}-${j.job}"${i ? ' data-later' : ''}>
<h4 class="sk-job-name">${esc(L(j))} <a href="${link(`/guides/${j.guide}/`)}">${tr('사냥터·장비까지 자세한 공략 →', 'Full guide with training spots and gear →')}</a></h4>
${tree({ job: j.job, poolNo: 2, builds: j.builds, title: tr(`${L(j)} (2차)`, `${L(j)} (2nd job)`), guide: j.guide, intro: j.weaponKo ? (ko ? j.weaponKo : j.weaponEn) : '' })}
</div>`).join('')}
</section>`;
  };

  const picker = `<nav class="sk-picker" aria-label="${tr('직업 고르기', 'Pick a class')}">${data.classes.map((c, i) => {
    const main = c.builds[0].steps[0][0];
    return `<a class="sk-pick" href="#${c.id}" data-pick="${c.id}"${i ? '' : ' aria-current="true"'}><img src="${icon(main)}" alt="" width="32" height="32"><b>${esc(L(c))}</b><small>${c.second.map((j) => esc(L(j))).join(' · ')}</small></a>`;
  }).join('')}</nav>`;

  return `<link rel="stylesheet" href="__SK_CSS__">
<div class="sk">
<section class="sk-hero wrap"><h1>${tr('글클메 스킬트리 정석', 'Skill builds for every job')}</h1>
<p>${tr('직업별로 가장 많이 쓰는 스킬 찍는 순서예요. 레벨을 움직이면 그 레벨에 스킬 창이 어떻게 찍혀 있는지 보여요.', 'The most used SP order for every job. Drag the level to see your skill window at that level.')}</p>
${picker}</section>
<div hidden><span data-tpl="advance">${tr('%L레벨 전직: %S', 'Level %L job advance: %S')}</span><span data-tpl="at">${tr('%L레벨에 찍을 것: %S', 'At level %L: %S')}</span><span data-tpl="done">${tr('%L레벨: 이미 다 찍었어요', 'Level %L: everything is already spent')}</span></div>
<div class="wrap sk-body">${data.classes.map(classSec).join('\n')}</div>
<section class="wrap sk-how"><p>${tr('1차 포인트(61)는 2차 때 받은 포인트로 채울 수 없어요. 30레벨 전에 1차 스킬을 다 찍어 두세요.', 'Points earned after the 2nd job cannot go into 1st job skills, so finish your 1st job skills before level 30.')}</p></section>
</div>`;
}
