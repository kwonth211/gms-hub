// Quest pages from the Classic World client data (data/quests-raw.json): who starts it, what to bring or hunt, what it
// pays, and which quests come before and after. Quest dialogue is game text and is not reproduced; only the structured
// requirements and rewards are shown, cross-linked to our item, monster and map pages.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n) => new Intl.NumberFormat('en-US').format(n);

// Only quests covered by a step-by-step guide have a page to go to (the guide); the bare per-quest pages were dropped on
// 2026-11-15 (user request: ~340 thin template pages ahead of the AdSense review). Everywhere else a quest is plain text.
let GUIDE_OF = new Map();
export const setQuestGuides = (map) => { GUIDE_OF = map; };
export const questPath = (q) => (GUIDE_OF.has(q.id) ? `/quests/${GUIDE_OF.get(q.id)}/` : null);
// A quest's name, linked to its guide when it has one.
export const questName = (q, link, attrs = '') => { const p = questPath(q); return p ? `<a href="${link(p)}"${attrs}>${esc(q.name)}</a>` : `<span${attrs}>${esc(q.name)}</span>`; };
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

export function questDetail({ lang, q, quests, npcs, items, mobs, drops, link, itemHref, mobHref, mobSprite }) {
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
    return rows.length ? `<small class="quest-drop"><span>${ko ? '드롭' : 'Dropped by'}</span>${rows.map(({ m }) => `<a href="${mobHref(m)}" translate="no"><img class="mob-sprite" src="${mobSprite(m)}" width="22" height="22" alt="" loading="lazy">${esc(ko ? m.ko || m.en : m.en)}</a>`).join('')}</small>` : '';
  };
  const mob = ({ id, count }) => {
    const m = mobs.get(id);
    return `<li>${m ? `<a class="quest-mob" href="${mobHref(m)}"><img class="mob-sprite" src="${mobSprite(m)}" width="36" height="36" alt="" loading="lazy">${esc(ko ? m.ko || m.en : m.en)}</a><small>Lv. ${m.lv}</small>` : `<span>#${id}</span>`}<b>× ${nf(count)}</b></li>`;
  };
  const questLink = (id) => {
    const x = byId.get(id);
    return x ? `<li>${questName(x, link)}<small>${x.lv ? `Lv. ${x.lv}` : ''}</small></li>` : '';
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

export function questIndex({ lang, quests, link, guides = [], promo = '' }) {
  const ko = lang === 'ko';
  const order = ['Maple Island', 'Lith Harbor', 'Henesys', 'Ellinia', 'Perion', 'Kerning City', 'Sleepywood', 'Florina Beach', 'Victoria Island', 'Warrior', 'Magician', 'Bowman', 'Thief', 'Citizenship', 'Crafting', 'Forgotten Hollow', 'Event'];
  const areas = [...new Set([...order, ...quests.map((q) => q.area)])].filter((a) => quests.some((q) => q.area === a));
  const live = quests.filter((q) => !q.expired);
  return `<section class="page-head wrap"><h1>${ko ? '퀘스트' : 'Quests'}</h1>
<p class="lead">${ko ? `글클메 퀘스트 ${live.length}개의 시작 레벨, 필요한 아이템과 몬스터, 보상 EXP·메소를 지역별로 정리했어요.` : `${live.length} Classic World quests by area: start level, what to bring or hunt, and the EXP and mesos they pay.`}</p>
<p class="char-links"><a href="${link('/quests/best-meso/')}">${ko ? '돈 버는 퀘스트 순위' : 'Quests that make the most mesos'}</a><a href="${link('/quests/best-exp/')}">${ko ? '레벨별 경험치 퀘스트' : 'Best EXP quests by level'}</a><a href="${link('/equipment/')}">${ko ? '장비 찾기' : 'Equipment finder'}</a></p>
<nav class="band-nav" aria-label="${ko ? '지역' : 'Areas'}"><div>${guides.length ? `<a class="band-link" href="#guides">${ko ? '퀘스트 공략' : 'Quest guides'}</a>` : ''}${areas.map((a) => `<a class="band-link" href="#area-${encodeURIComponent(a)}">${esc(areaName(a, lang))}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page">
${promo}
${guides.length ? questGuideCards({ lang, guides, link }) : ''}
${areas
  .map((a) => {
    const list = quests.filter((q) => q.area === a);
    return `<section class="panel" id="area-${encodeURIComponent(a)}"><h2><span>${esc(areaName(a, lang))}</span><small class="muted">${list.length}</small></h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${ko ? '퀘스트' : 'Quest'}</th><th>${ko ? '레벨' : 'Level'}</th><th>EXP</th><th>${ko ? '메소' : 'Mesos'}</th></tr></thead><tbody>${list
      .map((q) => `<tr${q.expired ? ' class="muted"' : ''}><th scope="row">${questName(q, link)}</th><td>${q.lv || '–'}</td><td>${q.exp ? nf(q.exp) : '–'}</td><td>${q.meso ? nf(q.meso) : '–'}</td></tr>`)
      .join('')}</tbody></table></div></section>`;
  })
  .join('\n')}
<p class="muted small">${ko ? '퀘스트 이름은 게임 클라이언트의 영어 이름이에요.' : 'Quest names are the game client’s own.'}</p>
</div>`;
}

// The step-by-step quest guides (scripts/quest-guide.mjs) as cards: what the line gives, its level range, how many steps.
function questGuideCards({ lang, guides, link }) {
  const ko = lang === 'ko';
  const L = (o) => (o ? o[ko ? 'ko' : 'en'] : '');
  const cards = guides.map(({ guide: g, data }) => {
    const steps = data.chains.flatMap((c) => c.steps);
    const npc = steps[0]?.startNpc;
    return `<a class="tool-card qg-card" href="${link(`/quests/${g.slug}/`)}"><span class="qg-pics">${g.rewardItem ? `<img src="https://maplestory.io/api/MCW/1/item/${g.rewardItem}/icon" alt="" width="32" height="32" loading="lazy">` : ''}${npc ? `<img src="https://maplestory.io/api/MCW/1/npc/${npc}/icon" alt="" height="44" loading="lazy">` : ''}</span><strong>${esc(L(g.title))}</strong><p>${esc(L(g.card))}</p><small class="qg-meta">${esc(L(g.level))}${ko ? ` · ${steps.length}단계` : ` · ${steps.length} steps`}${g.reward ? ` · ${esc(L(g.reward))}` : ''}</small><span>${ko ? '공략 보기' : 'Open the guide'}</span></a>`;
  }).join('');
  return `<section class="panel" id="guides"><h2><span>${ko ? '퀘스트 공략' : 'Quest guides'}</span><small class="muted">${ko ? '단계별 NPC 위치·재료·동선·시세' : 'NPC spots, items, routes and prices, step by step'}</small></h2><div class="tool-cards">${cards}</div></section>`;
}

// "Which quests are worth doing at my level": the biggest EXP payouts per 10-level band, from the same client data.
// Forgotten Hollow quests wait until the area opens; repeatable and ended quests are left out.
export const QUEST_BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 200]];
// The two quest rankings point at each other, so "which quests are worth it" reads as one place with two orders.
const rankTabs = (ko, link, on) => `<p class="char-links quest-rank-tabs"><a href="${link('/quests/best-meso/')}"${on === 'meso' ? ' aria-current="page"' : ''}>${ko ? '돈 버는 퀘스트 (메소 순)' : 'Best meso quests'}</a><a href="${link('/quests/best-exp/')}"${on === 'exp' ? ' aria-current="page"' : ''}>${ko ? '경험치 많이 주는 퀘스트' : 'Best EXP quests'}</a><a href="${link('/quests/')}">${ko ? '전체 퀘스트·공략' : 'All quests and guides'}</a></p>`;

// "Which quests make money": reward value minus what the materials would sell for, at current Free Market prices.
// price(id) -> mesos or null (data/item-prices.json: recent sold median, else the asking median with 3+ listings).
// Several rewards of the same count are one pick (see quest-guide.mjs), so their average is used; materials handed
// over at the start cost nothing; a material with no price counts as 0 and is named in the row.
export function questMoney(q, price) {
  const gets = q.gets.map((g) => ({ ...g, p: price(g.id) }));
  const onePick = gets.length > 1 && (new Set(gets.map((g) => g.count)).size === 1 || gets.some((g) => g.job != null));
  const priced = gets.filter((g) => g.p != null);
  const reward = !priced.length ? 0 : onePick ? Math.round(priced.reduce((a, g) => a + g.p * g.count, 0) / priced.length) : priced.reduce((a, g) => a + g.p * g.count, 0);
  const given = new Set(q.starts.map((i) => i.id));
  const mats = q.bring.filter((i) => !given.has(i.id)).map((i) => ({ ...i, p: price(i.id) }));
  const cost = mats.reduce((a, i) => a + (i.p || 0) * i.count, 0);
  return { reward, cost, net: q.meso + reward - cost, onePick, priced, mats, best: priced.slice().sort((a, b) => b.p * b.count - a.p * a.count)[0] || null };
}
export function questMoneyBody({ lang, quests, link, price, itemName, updated, mobPic = () => null, mobName = () => '' }) {
  const ICON = (id, size) => `<img class="qm-icon" src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
  const ko = lang === 'ko';
  const kmoney = (n) => (ko ? (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(Math.abs(n) >= 1e6 ? 0 : 1)}만` : nf(n)) : Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : Math.abs(n) >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : nf(n));
  const pool = quests.filter((q) => !q.expired && !q.repeat && q.area !== 'Forgotten Hollow')
    .map((q) => ({ q, m: questMoney(q, price) })).filter((x) => x.m.reward > 0 && x.m.net > 0)
    .sort((x, y) => y.m.net - x.m.net).filter((x, i, all) => all.findIndex((y) => y.q.name === x.q.name) === i);
  const task = (q) => {
    const parts = [];
    if (q.hunt.length) parts.push(ko ? `몬스터 ${q.hunt.length}종 처치` : `hunt ${q.hunt.length} monster type${q.hunt.length > 1 ? 's' : ''}`);
    if (q.bring.length) parts.push(ko ? `아이템 ${q.bring.length}종 모으기` : `bring ${q.bring.length} item type${q.bring.length > 1 ? 's' : ''}`);
    if (!parts.length) parts.push(ko ? '전달·대화' : 'talk or deliver');
    if (q.prereq.length) parts.push(ko ? '선행 퀘스트 있음' : 'needs an earlier quest');
    const mobs = q.hunt.slice(0, 3).map((h) => { const src = mobPic(h.id); return src ? `<img class="qm-mob" src="${src}" alt="${esc(mobName(h.id, lang))}" title="${esc(mobName(h.id, lang))}${h.count ? ` ×${h.count}` : ''}" loading="lazy" decoding="async">` : ''; }).join('');
    const mats = q.bring.slice(0, 3).map((i) => ICON(i.id, 26)).join('');
    const pics = mobs || mats ? `<div class="qm-pics">${mobs}${mats}</div>` : '';
    return `${pics}<ul class="quest-task">${parts.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  };
  const row = ({ q, m }, rank) => {
    const b = m.best, name = b ? itemName(b.id, lang) : '';
    const rewardCell = `${b ? `<span class="qm-reward">${ICON(b.id, 36)}<span translate="no">${esc(name)}${b.count > 1 ? ` ×${b.count}` : ''}</span></span>` : ''}${m.onePick && m.priced.length > 1 ? `<small>${ko ? `${m.priced.length}개 중 하나 · 평균` : `one of ${m.priced.length} · average`}</small>` : m.priced.length > 1 ? `<small>${ko ? `외 ${m.priced.length - 1}종` : `+${m.priced.length - 1} more`}</small>` : ''}`;
    const unpriced = m.mats.filter((i) => i.p == null);
    const costCell = m.cost ? `−${kmoney(m.cost)}` : unpriced.length ? (ko ? '직접 모음' : 'farmed') : '0';
    const npc = q.startNpc ? `<img class="qm-npc" src="https://maplestory.io/api/MCW/1/npc/${q.startNpc}/icon" alt="" loading="lazy" decoding="async">` : '';
    const medal = rank && rank <= 3 ? `<span class="qm-medal m${rank}">${rank}</span>` : '';
    return `<tr${rank ? ` class="qm-r${rank}"` : ''}><th scope="row"><div class="qm-quest">${medal}${npc}<div>${questName(q, link, ' translate="no"')}<small>${esc(areaName(q.area, lang))}</small></div></div></th><td class="num">Lv. ${q.lv || 1}</td><td>${rewardCell}</td><td class="num">${kmoney(q.meso + m.reward)}</td><td class="num">${costCell}</td><td class="num"><b>${kmoney(m.net)}</b></td><td>${task(q)}</td></tr>`;
  };
  const table = (list, ranked) => `<div class="table-wrap"><table class="data quest-best quest-money"><thead><tr><th scope="col">${ko ? '퀘스트' : 'Quest'}</th><th scope="col">${ko ? '시작' : 'Starts'}</th><th scope="col">${ko ? '주요 보상' : 'Main reward'}</th><th scope="col">${ko ? '보상 값' : 'Reward value'}</th><th scope="col">${ko ? '재료값' : 'Materials'}</th><th scope="col">${ko ? '남는 메소' : 'Profit'}</th><th scope="col">${ko ? '할 일' : 'What you do'}</th></tr></thead><tbody>${list.map((x, k) => row(x, ranked ? k + 1 : 0)).join('')}</tbody></table></div>`;
  const top = pool.slice(0, 10);
  const sections = QUEST_BANDS.map(([a, b]) => {
    const list = pool.filter(({ q }) => Math.max(q.lv, 1) >= a && Math.max(q.lv, 1) <= b).slice(0, 10);
    if (!list.length) return '';
    const label = b >= 200 ? (ko ? `${a}레벨 이상` : `Level ${a}+`) : (ko ? `${a}~${b}레벨` : `Level ${a}–${b}`);
    return `<section class="panel" id="lv-${a}"><h2>${label}</h2>${table(list)}</section>`;
  }).join('');
  const day = (updated || '').slice(0, 10);
  return `<section class="page-head wrap"><h1>${ko ? '돈 버는 퀘스트 순위' : 'Quests that make the most mesos'}</h1>
<p class="lead">${ko ? `보상으로 받는 아이템을 지금 자유시장 시세로 바꿔서, 재료값을 빼고 메소가 가장 많이 남는 퀘스트부터 줄 세웠어요. 시세는 ${esc(day)} 기준이고 매일 다시 계산해요.` : `Quest rewards priced at today's Free Market value, minus what the materials would sell for, ranked by what is left. Prices are from ${esc(day)} and recalculated every day.`}</p>
${ko ? `<div class="yt-lite" data-yt-lite="PL1-KdtyMLY"><button type="button" aria-label="영상 재생: 글클메 돈 버는 퀘스트 TOP 10"><img src="https://i.ytimg.com/vi/PL1-KdtyMLY/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async"><span class="yt-play" aria-hidden="true"></span></button><p class="yt-cap"><b>영상으로 보기</b> 돈 버는 퀘스트 TOP 10 · 4분 30초 <a href="https://youtu.be/PL1-KdtyMLY" target="_blank" rel="noopener" data-yt-open="PL1-KdtyMLY">유튜브에서 보기</a></p></div>` : ''}
${rankTabs(ko, link, 'meso')}
<nav class="band-nav" aria-label="${ko ? '레벨' : 'Level'}"><div><a class="band-link" href="#top">TOP 10</a>${QUEST_BANDS.map(([a, b]) => `<a class="band-link" href="#lv-${a}">${b >= 200 ? `${a}+` : `${a}–${b}`}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page"><section class="panel" id="top"><h2>${ko ? '전체 TOP 10' : 'Top 10 overall'}</h2>${table(top, true)}</section>
${sections}
<section class="panel"><h2>${ko ? '이렇게 계산했어요' : 'How it is worked out'}</h2><ul>
<li>${ko ? '남는 메소 = 보상 메소 + 보상 아이템 시세 − 재료 시세예요. 재료를 직접 사냥해서 모으면 재료값만큼 더 남아요.' : 'Profit = meso reward + reward items at market price − materials at market price. Farm the materials yourself and you keep that cost too.'}</li>
<li>${ko ? '보상이 여러 개 중 하나로 나오는 퀘스트는 그 평균값으로 계산했어요. 표에 "N개 중 하나"로 표시돼요.' : 'When a quest gives one of several rewards, the average is used; the row says "one of N".'}</li>
<li>${ko ? '아이템 값은 최근 판매 완료 가격을 쓰고, 없으면 매물 3건 이상인 판매가의 중앙값을 써요. 시세가 없는 보상과 재료는 0으로 계산했어요.' : 'Item values use recent sold prices, otherwise the median asking price when there are three or more listings. Rewards and materials with no price count as 0.'}</li>
<li>${ko ? '반복 퀘스트, 끝난 이벤트, 포가튼 할로우 퀘스트는 뺐어요.' : 'Repeatable quests, ended events and Forgotten Hollow quests are left out.'}</li></ul></section></div>`;
}

export function questBestBody({ lang, quests, link, itemName = (id) => `#${id}`, mobPic = () => null, mobName = () => '' }) {
  // Same look as the money ranking (owner 2026-11-19: "이미지가 부족해, 돈 되는 퀘스트 참고해서 꽉꽉"): NPC face, monster
  // sprites and material icons, reward item icons, medals for the overall top 3. Forgotten Hollow opened on 11/18, so its
  // quests count now.
  const ko = lang === 'ko';
  const ICON = (id, size) => `<img class="qm-icon" src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
  const pool = quests.filter((q) => !q.expired && !q.repeat && q.exp > 0)
    .sort((x, y) => y.exp - x.exp)
    // Citizenship donations repeat one name across many variants; keep the best-paying one of each name.
    .filter((q, i, all) => all.findIndex((x) => x.name === q.name) === i);
  const task = (q) => {
    const parts = [];
    if (q.hunt.length) parts.push(ko ? `몬스터 ${q.hunt.length}종 처치` : `hunt ${q.hunt.length} monster type${q.hunt.length > 1 ? 's' : ''}`);
    if (q.bring.length) parts.push(ko ? `아이템 ${q.bring.length}종 모으기` : `bring ${q.bring.length} item type${q.bring.length > 1 ? 's' : ''}`);
    if (!parts.length) parts.push(ko ? '전달·대화' : 'talk or deliver');
    if (q.prereq.length) parts.push(ko ? '선행 퀘스트 있음' : 'needs an earlier quest');
    const mobs = q.hunt.slice(0, 3).map((h) => { const src = mobPic(h.id); return src ? `<img class="qm-mob" src="${src}" alt="${esc(mobName(h.id, lang))}" title="${esc(mobName(h.id, lang))}${h.count ? ` ×${h.count}` : ''}" loading="lazy" decoding="async">` : ''; }).join('');
    const mats = q.bring.slice(0, 3).map((i) => ICON(i.id, 26)).join('');
    const pics = mobs || mats ? `<div class="qm-pics">${mobs}${mats}</div>` : '';
    return `${pics}<ul class="quest-task">${parts.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  };
  const reward = (q) => {
    const gets = (q.gets || []).filter((g) => g.count > 0);
    if (!gets.length) return '—';
    const onePick = gets.length > 1 && (new Set(gets.map((g) => g.count)).size === 1 || gets.some((g) => g.job != null));
    const shown = gets.slice(0, 3).map((g) => `<span class="qm-reward">${ICON(g.id, 30)}<span translate="no">${esc(itemName(g.id, lang))}${g.count > 1 ? ` ×${g.count}` : ''}</span></span>`).join('');
    return `${shown}${gets.length > 3 ? `<small>${ko ? `외 ${gets.length - 3}종` : `+${gets.length - 3} more`}</small>` : ''}${onePick ? `<small>${ko ? `${gets.length}개 중 하나` : `one of ${gets.length}`}</small>` : ''}`;
  };
  const row = (q, rank) => {
    const npc = q.startNpc ? `<img class="qm-npc" src="https://maplestory.io/api/MCW/1/npc/${q.startNpc}/icon" alt="" loading="lazy" decoding="async">` : '';
    const medal = rank && rank <= 3 ? `<span class="qm-medal m${rank}">${rank}</span>` : '';
    const jobs = jobsLabel(q.jobs, lang);
    return `<tr${rank ? ` class="qm-r${rank}"` : ''}><th scope="row"><div class="qm-quest">${medal}${npc}<div>${questName(q, link, ' translate="no"')}<small>${esc(areaName(q.area, lang))}${jobs && jobs !== areaName(q.area, lang) ? ` · ${esc(jobs)}` : ''}</small></div></div></th><td class="num">Lv. ${q.lv || 1}</td><td class="num"><b>${nf(q.exp)}</b></td><td class="num">${q.meso ? nf(q.meso) : '—'}</td><td>${reward(q)}</td><td>${task(q)}</td></tr>`;
  };
  const table = (list, ranked) => `<div class="table-wrap"><table class="data quest-best quest-money quest-exp"><thead><tr><th scope="col">${ko ? '퀘스트' : 'Quest'}</th><th scope="col">${ko ? '시작' : 'Starts'}</th><th scope="col">EXP</th><th scope="col">${ko ? '메소' : 'Mesos'}</th><th scope="col">${ko ? '보상 아이템' : 'Reward items'}</th><th scope="col">${ko ? '할 일' : 'What you do'}</th></tr></thead><tbody>${list.map((q, k) => row(q, ranked ? k + 1 : 0)).join('')}</tbody></table></div>`;
  const sections = QUEST_BANDS.map(([a, b]) => {
    const list = pool.filter((q) => Math.max(q.lv, 1) >= a && Math.max(q.lv, 1) <= b).slice(0, 10);
    if (!list.length) return '';
    const label = b >= 200 ? (ko ? `${a}레벨 이상` : `Level ${a}+`) : (ko ? `${a}~${b}레벨` : `Level ${a}–${b}`);
    const bandTotal = list.reduce((t, q) => t + q.exp, 0);
    return `<section class="panel" id="lv-${a}"><h2>${label} <small class="muted">${ko ? `10개 합계 경험치 ${nf(bandTotal)}` : `top 10 together: ${nf(bandTotal)} EXP`}</small></h2>${table(list)}</section>`;
  }).join('');
  const top = pool.slice(0, 10);
  return `<section class="page-head wrap"><h1>${ko ? '레벨별 경험치 많이 주는 퀘스트' : 'Best EXP quests by level'}</h1>
<p class="lead">${ko ? '레벨 구간마다 보상 경험치가 큰 퀘스트를 10개씩 골랐어요. 누구에게 받는지(NPC), 무엇을 잡고 모으는지(몬스터·재료), 경험치와 함께 주는 아이템까지 한 줄에 보여요. 사냥하다 지칠 때 끼워 넣기 좋아요.' : 'The ten biggest EXP rewards in each level band, from the game data: who gives it, what you hunt or bring, and the items that come with the EXP, on one row. Good to slot in between grinding sessions.'}</p>
${rankTabs(ko, link, 'exp')}
<nav class="band-nav" aria-label="${ko ? '레벨' : 'Level'}"><div><a class="band-link" href="#top">TOP 10</a>${QUEST_BANDS.map(([a, b]) => `<a class="band-link" href="#lv-${a}">${b >= 200 ? `${a}+` : `${a}–${b}`}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page"><section class="panel" id="top"><h2>${ko ? '전체 TOP 10' : 'Top 10 overall'}</h2>${table(top, true)}</section>
${sections}
<section class="panel"><h2>${ko ? '이렇게 골랐어요' : 'How these are picked'}</h2><ul>
<li>${ko ? '경험치와 메소, 보상 아이템은 게임 클라이언트 데이터 그대로예요.' : 'EXP, mesos and reward items are the game client data as is.'}</li>
<li>${ko ? '같은 이름의 퀘스트(시민권 기부처럼 여러 번 나오는 것)는 경험치가 가장 큰 하나만 남겼어요.' : 'Quests sharing one name (like the citizenship donations) keep only their best-paying one.'}</li>
<li>${ko ? '보상이 여러 개 중 하나로 나오는 퀘스트는 "N개 중 하나"로 표시했어요.' : 'Quests that give one of several rewards say "one of N".'}</li>
<li>${ko ? '반복 퀘스트와 끝난 이벤트는 뺐어요. 포가튼 할로우 퀘스트는 11월 18일 오픈 뒤 포함했어요.' : 'Repeatable quests and ended events are left out; Forgotten Hollow quests are in since it opened on Nov 18.'}</li></ul>
<p>${ko ? '메소가 목적이면' : 'After mesos instead?'} <a href="${link('/quests/best-meso/')}">${ko ? '돈 버는 퀘스트 순위' : 'Quests that make the most mesos'}</a> · <a href="${link('/quests/')}">${ko ? '전체 퀘스트' : 'All quests'}</a></p></section></div>`;
}
