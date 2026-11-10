// Quest pages from the Classic World client data (data/quests-raw.json): who starts it, what to bring or hunt, what it
// pays, and which quests come before and after. Quest dialogue is game text and is not reproduced; only the structured
// requirements and rewards are shown, cross-linked to our item, monster and map pages.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n) => new Intl.NumberFormat('en-US').format(n);

export const questPath = (q) => `/quests/${q.id}/`;
const AREA_KO = {
  'Maple Island': '메이플 아일랜드', 'Lith Harbor': '리스항구', Henesys: '헤네시스', Ellinia: '엘리니아', Perion: '페리온', 'Kerning City': '커닝시티',
  Sleepywood: '슬리피우드', 'Florina Beach': '플로리나 비치', 'Victoria Island': '빅토리아 아일랜드', 'Forgotten Hollow': '포가튼 할로우',
  Citizenship: '시민권', Crafting: '제작', Event: '이벤트', Warrior: '전사', Magician: '마법사', Bowman: '궁수', Thief: '도적'
};
export const areaName = (a, lang) => (lang === 'ko' ? AREA_KO[a] || a : a);
const JOB = { ko: { 0: '초보자', 100: '전사', 200: '마법사', 300: '궁수', 400: '도적' }, en: { 0: 'Beginner', 100: 'Warrior', 200: 'Magician', 300: 'Bowman', 400: 'Thief' } };
// Branch codes (110, 120…) fold into their family; a list covering every family means no restriction.
function jobsLabel(jobs, lang) {
  if (!jobs?.length) return null;
  const fam = [...new Set(jobs.map((j) => Math.floor(j / 100) * 100))].sort((a, b) => a - b);
  if (fam.length >= 5) return null;
  return fam.map((f) => JOB[lang === 'ko' ? 'ko' : 'en'][f] || f).join(', ');
}

export function collectQuests(raw, { buildDate }) {
  const quests = raw.quests.map((q) => {
    const s = q.requirementToStart || {}, c = q.requirementToComplete || {}, r = q.rewardOnComplete || {};
    return {
      // A few client names carry U+FFFD where a non-breaking space was lost in encoding.
      id: q.id, name: q.name.replace(/\uFFFD/g, ' ').replace(/ {2,}/g, ' ').trim(), area: q.areaName || 'Victoria Island',
      lv: s.levelMinimum || 0, jobs: s.jobs || [], startNpc: s.npcId, endNpc: c.npcId,
      prereq: (s.quests || []).filter((x) => x.state === 2).map((x) => x.id),
      bring: (c.items || []).filter((i) => i.count > 0), hunt: c.mobs || [],
      exp: r.exp || 0, meso: r.meso || 0, fame: r.fame || 0,
      gets: (r.items || []).filter((i) => i.count > 0), takes: (r.items || []).filter((i) => i.count < 0),
      skills: (r.skills || []).length, starts: (q.rewardOnStart?.items || []).filter((i) => i.count > 0),
      ends: s.endTime ? s.endTime.slice(0, 10) : null, repeat: !!(s.dayByDay || s.repeatInterval)
    };
  });
  const byId = new Map(quests.map((q) => [q.id, q]));
  for (const q of quests) {
    q.prereq = q.prereq.filter((id) => byId.has(id));
    q.next = quests.filter((x) => x.prereq.includes(q.id)).map((x) => x.id);
    q.expired = !!q.ends && q.ends < buildDate;
  }
  return quests.sort((a, b) => a.lv - b.lv || a.id - b.id);
}

export function questDetail({ lang, q, quests, npcs, items, mobs, drops, link, itemHref, mobHref }) {
  const ko = lang === 'ko';
  const byId = new Map(quests.map((x) => [x.id, x]));
  const npc = (id) => (id && npcs[id] ? `<span translate="no">${esc(ko ? npcs[id].ko || npcs[id].en : npcs[id].en)}</span>` : null);
  const item = (id) => items.get(id);
  const itemCell = ({ id, count, job }) => {
    const it = item(id);
    const name = it ? esc(ko && it.ko ? it.ko : it.en) : `#${id}`;
    const href = it && itemHref(it);
    return `<li>${`<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="24" height="24" loading="lazy">`}${href ? `<a href="${href}">${name}</a>` : `<span>${name}</span>`}<b>× ${nf(Math.abs(count))}</b>${job ? `<small>${esc(jobsLabel([job], lang) || '')}</small>` : ''}</li>`;
  };
  const dropHint = (id) => {
    const rows = (drops.get(id) || []).filter(({ m }) => m.status === 'active').sort((a, b) => a.m.lv - b.m.lv).slice(0, 3);
    return rows.length ? `<small class="quest-drop"><span>${ko ? '드롭' : 'Dropped by'}</span>${rows.map(({ m }) => `<a href="${mobHref(m)}" translate="no">${esc(ko ? m.ko || m.en : m.en)}</a>`).join('')}</small>` : '';
  };
  const mob = ({ id, count }) => {
    const m = mobs.get(id);
    return `<li>${m ? `<a href="${mobHref(m)}">${esc(ko ? m.ko || m.en : m.en)}</a><small>Lv. ${m.lv}</small>` : `<span>#${id}</span>`}<b>× ${nf(count)}</b></li>`;
  };
  const questLink = (id) => {
    const x = byId.get(id);
    return x ? `<li><a href="${link(questPath(x))}">${esc(x.name)}</a><small>${x.lv ? `Lv. ${x.lv}` : ''}</small></li>` : '';
  };
  const jobs = jobsLabel(q.jobs, lang);
  const facts = [
    [ko ? '지역' : 'Area', esc(areaName(q.area, lang))],
    [ko ? '시작 레벨' : 'Level', q.lv ? `Lv. ${q.lv}` : (ko ? '제한 없음' : 'Any')],
    jobs ? [ko ? '직업' : 'Class', esc(jobs)] : null,
    npc(q.startNpc) ? [ko ? '시작 NPC' : 'Start NPC', npc(q.startNpc)] : null,
    npc(q.endNpc) && q.endNpc !== q.startNpc ? [ko ? '완료 NPC' : 'Turn in to', npc(q.endNpc)] : null,
    q.ends ? [ko ? '기간' : 'Ends', q.ends] : null,
    q.repeat ? [ko ? '반복' : 'Repeatable', ko ? '반복 가능' : 'Yes'] : null
  ].filter(Boolean);
  const rewardRows = [
    q.exp ? `<li><span>EXP</span><b>${nf(q.exp)}</b></li>` : '',
    q.meso ? `<li><span>${ko ? '메소' : 'Mesos'}</span><b>${nf(q.meso)}</b></li>` : '',
    q.fame ? `<li><span>${ko ? '인기도' : 'Fame'}</span><b>+${q.fame}</b></li>` : '',
    q.skills ? `<li><span>${ko ? '스킬' : 'Skill'}</span><b>${ko ? '습득' : 'Learned'}</b></li>` : ''
  ].join('');
  return `<section class="page-head wrap">
<p class="crumbs"><a href="${link('/quests/')}">${ko ? '퀘스트' : 'Quests'}</a><span aria-hidden="true"> › </span><a href="${link(`/quests/#area-${encodeURIComponent(q.area)}`)}">${esc(areaName(q.area, lang))}</a></p>
<h1>${esc(q.name)}</h1>
${q.expired ? `<p class="monster-notice">${ko ? '기간이 끝난 이벤트 퀘스트예요.' : 'This event quest has ended.'}</p>` : ''}
</section>
<div class="wrap quest-page">
<div class="quest-grid">
<section class="panel"><h2>${ko ? '퀘스트 정보' : 'Quest info'}</h2><dl class="quest-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
<section class="panel"><h2>${ko ? '보상' : 'Rewards'}</h2>${rewardRows ? `<ul class="quest-reward">${rewardRows}</ul>` : ''}${q.gets.length ? `<ul class="quest-items">${q.gets.map(itemCell).join('')}</ul>` : ''}${!rewardRows && !q.gets.length ? `<p class="muted">${ko ? '보상 정보가 없어요.' : 'No listed reward.'}</p>` : ''}</section>
</div>
${q.hunt.length || q.bring.length ? `<section class="panel"><h2>${ko ? '해야 할 일' : 'What to do'}</h2>
${q.hunt.length ? `<h3>${ko ? '잡을 몬스터' : 'Hunt'}</h3><ul class="quest-items">${q.hunt.map(mob).join('')}</ul>` : ''}
${q.bring.length ? `<h3>${ko ? '모아 올 아이템' : 'Bring'}</h3><ul class="quest-items">${q.bring.map((i) => itemCell(i).replace('</li>', `${dropHint(i.id)}</li>`)).join('')}</ul>` : ''}
</section>` : ''}
${q.starts.length ? `<section class="panel"><h2>${ko ? '시작할 때 받는 아이템' : 'Given at the start'}</h2><ul class="quest-items">${q.starts.map(itemCell).join('')}</ul></section>` : ''}
${q.prereq.length || q.next.length ? `<section class="panel quest-chain">${q.prereq.length ? `<div><h2>${ko ? '먼저 끝낼 퀘스트' : 'Complete first'}</h2><ul class="monster-routes">${q.prereq.map(questLink).join('')}</ul></div>` : ''}${q.next.length ? `<div><h2>${ko ? '다음 퀘스트' : 'Leads to'}</h2><ul class="monster-routes">${q.next.map(questLink).join('')}</ul></div>` : ''}</section>` : ''}
<p class="muted small">${ko ? '조건과 보상은 게임 클라이언트 데이터 기준이에요. 퀘스트 대사는 싣지 않았어요.' : 'Requirements and rewards come from the game client data; quest dialogue is not reproduced.'}</p>
</div>`;
}

export function questIndex({ lang, quests, link }) {
  const ko = lang === 'ko';
  const order = ['Maple Island', 'Lith Harbor', 'Henesys', 'Ellinia', 'Perion', 'Kerning City', 'Sleepywood', 'Florina Beach', 'Victoria Island', 'Warrior', 'Magician', 'Bowman', 'Thief', 'Citizenship', 'Crafting', 'Forgotten Hollow', 'Event'];
  const areas = [...new Set([...order, ...quests.map((q) => q.area)])].filter((a) => quests.some((q) => q.area === a));
  const live = quests.filter((q) => !q.expired);
  return `<section class="page-head wrap"><h1>${ko ? '퀘스트' : 'Quests'}</h1>
<p class="lead">${ko ? `글클메 퀘스트 ${live.length}개의 시작 레벨, 필요한 아이템과 몬스터, 보상 EXP·메소를 지역별로 정리했어요.` : `${live.length} Classic World quests by area: start level, what to bring or hunt, and the EXP and mesos they pay.`}</p>
<p class="char-links"><a href="${link('/quests/best-exp/')}">${ko ? '레벨별 경험치 퀘스트' : 'Best EXP quests by level'}</a><a href="${link('/equipment/')}">${ko ? '장비 찾기' : 'Equipment finder'}</a></p>
<nav class="band-nav" aria-label="${ko ? '지역' : 'Areas'}"><div>${areas.map((a) => `<a class="band-link" href="#area-${encodeURIComponent(a)}">${esc(areaName(a, lang))}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page">
${areas
  .map((a) => {
    const list = quests.filter((q) => q.area === a);
    return `<section class="panel" id="area-${encodeURIComponent(a)}"><h2><span>${esc(areaName(a, lang))}</span><small class="muted">${list.length}</small></h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${ko ? '퀘스트' : 'Quest'}</th><th>${ko ? '레벨' : 'Level'}</th><th>EXP</th><th>${ko ? '메소' : 'Mesos'}</th></tr></thead><tbody>${list
      .map((q) => `<tr${q.expired ? ' class="muted"' : ''}><th scope="row"><a href="${link(questPath(q))}">${esc(q.name)}</a></th><td>${q.lv || '–'}</td><td>${q.exp ? nf(q.exp) : '–'}</td><td>${q.meso ? nf(q.meso) : '–'}</td></tr>`)
      .join('')}</tbody></table></div></section>`;
  })
  .join('\n')}
<p class="muted small">${ko ? '퀘스트 이름은 게임 클라이언트의 영어 이름이에요.' : 'Quest names are the game client’s own.'}</p>
</div>`;
}

// "Which quests are worth doing at my level": the biggest EXP payouts per 10-level band, from the same client data.
// Forgotten Hollow quests wait until the area opens; repeatable and ended quests are left out.
export const QUEST_BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 200]];
export function questBestBody({ lang, quests, link }) {
  const ko = lang === 'ko';
  const pool = quests.filter((q) => !q.expired && !q.repeat && q.exp > 0 && q.area !== 'Forgotten Hollow');
  const task = (q) => {
    const parts = [];
    if (q.hunt.length) parts.push(ko ? `몬스터 ${q.hunt.length}종 처치` : `hunt ${q.hunt.length} monster type${q.hunt.length > 1 ? 's' : ''}`);
    if (q.bring.length) parts.push(ko ? `아이템 ${q.bring.length}종 모으기` : `bring ${q.bring.length} item type${q.bring.length > 1 ? 's' : ''}`);
    if (!parts.length) parts.push(ko ? '전달·대화' : 'talk or deliver');
    if (q.prereq.length) parts.push(ko ? '선행 퀘스트 있음' : 'needs an earlier quest');
    return `<ul class="quest-task">${parts.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  };
  const sections = QUEST_BANDS.map(([a, b]) => {
    const list = pool.filter((q) => Math.max(q.lv, 1) >= a && Math.max(q.lv, 1) <= b).sort((x, y) => y.exp - x.exp)
      // Citizenship donations repeat one name across many variants; keep the best-paying one of each name.
      .filter((q, i, all) => all.findIndex((x) => x.name === q.name) === i).slice(0, 10);
    if (!list.length) return '';
    const label = b >= 200 ? (ko ? `${a}레벨 이상` : `Level ${a}+`) : (ko ? `${a}~${b}레벨` : `Level ${a}–${b}`);
    return `<section class="panel" id="lv-${a}"><h2>${label}</h2><div class="table-wrap"><table class="data quest-best"><thead><tr><th scope="col">${ko ? '퀘스트' : 'Quest'}</th><th scope="col">${ko ? '시작' : 'Starts'}</th><th scope="col">EXP</th><th scope="col">${ko ? '메소' : 'Mesos'}</th><th scope="col">${ko ? '할 일' : 'What you do'}</th></tr></thead><tbody>${list
      .map((q) => `<tr><th scope="row"><a href="${link(questPath(q))}" translate="no">${esc(q.name)}</a><small>${esc(areaName(q.area, lang))}</small>${jobsLabel(q.jobs, lang) && jobsLabel(q.jobs, lang) !== areaName(q.area, lang) ? `<small>${esc(jobsLabel(q.jobs, lang))}</small>` : ''}</th><td class="num">Lv. ${q.lv || 1}</td><td class="num"><b>${nf(q.exp)}</b></td><td class="num">${q.meso ? nf(q.meso) : '—'}</td><td>${task(q)}</td></tr>`)
      .join('')}</tbody></table></div></section>`;
  }).join('');
  return `<section class="page-head wrap"><h1>${ko ? '레벨별 경험치 많이 주는 퀘스트' : 'Best EXP quests by level'}</h1>
<p class="lead">${ko ? '레벨 구간마다 보상 경험치가 큰 퀘스트를 10개씩 골랐어요. 사냥하다 지칠 때 끼워 넣기 좋아요.' : 'The ten biggest EXP rewards in each level band, from the game data. Good to slot in between grinding sessions.'}</p>
<nav class="band-nav" aria-label="${ko ? '레벨' : 'Level'}"><div>${QUEST_BANDS.map(([a, b]) => `<a class="band-link" href="#lv-${a}">${b >= 200 ? `${a}+` : `${a}–${b}`}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page">${sections}
<p class="muted small">${ko ? '보상은 게임 클라이언트 데이터 기준이에요. 반복 퀘스트, 끝난 이벤트, 아직 열리지 않은 포가튼 할로우 퀘스트는 뺐어요.' : 'Rewards are from the game client data. Repeatable quests, ended events and Forgotten Hollow quests (not open yet) are left out.'} <a href="${link('/quests/')}">${ko ? '전체 퀘스트' : 'All quests'}</a></p></div>`;
}
