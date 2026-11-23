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
    return `<li>${`<img src="https://maplestory.io/api/MCW/1.2/item/${id}/icon" alt="" width="24" height="24" loading="lazy">`}${href ? `<a href="${href}">${name}</a>` : `<span>${name}</span>`}<b>× ${nf(Math.abs(count))}</b>${job ? `<small>${esc(jobsLabel([job], lang) || '')}</small>` : ''}</li>`;
  };
  const dropHint = (id) => {
    const rows = (drops.get(id) || []).filter(({ m }) => m.status === 'active').sort((a, b) => a.m.lv - b.m.lv).slice(0, 3);
    return rows.length ? `<small class="quest-drop"><span>${ko ? '드랍' : 'Dropped by'}</span>${rows.map(({ m }) => `<a href="${mobHref(m)}" translate="no"><img class="mob-sprite" src="${mobSprite(m)}" width="22" height="22" alt="" loading="lazy">${esc(ko ? m.ko || m.en : m.en)}</a>`).join('')}</small>` : '';
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

// ---------- quest checklist cards ----------
// One quest = one card that opens and closes (owner 2026-11-23: "체크리스트 형태로… 테이블 로우를 열고 닫기"). Closed, a card
// shows the tick box, start level, NPC, what it asks for and what it pays as icons; opened, the same things with names,
// counts, who drops the materials, and the quests before and after. Ticks live in localStorage (gms-quests-done, synced
// by the Discord login like every gms-* key) and are painted by assets/quest-check.js; the three list pages and the
// step-by-step guides share that one list of finished quests.
// c: { lang, link, npcs, items: Map, mobs: Map, drops: Map, byId: Map, itemHref(item), mobHref(mob), mobPic(id) }
const ITEM_ICON = (id, size) => `<img class="qc-icon" src="https://maplestory.io/api/MCW/1.2/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
const kmoney = (n, ko) => (ko ? (Math.abs(n) >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : Math.abs(n) >= 1e4 ? `${+(n / 1e4).toFixed(Math.abs(n) >= 1e6 ? 0 : 1)}만` : nf(n)) : Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : Math.abs(n) >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : nf(n));
// A reward's job is a bit mask in the client data: 1 beginner, 2 warrior, 4 magician, 8 bowman, 16 thief.
const rewardJob = (bits, lang) => { const f = [0, 100, 200, 300, 400].filter((_, i) => bits & (1 << i)); return f.length && f.length < 5 ? f.map((x) => JOB[lang === 'ko' ? 'ko' : 'en'][x]).join(', ') : ''; };
const onePickOf = (gets) => gets.length > 1 && (new Set(gets.map((g) => g.count)).size === 1 || gets.some((g) => g.job != null));

export function questCard(c, q, { rank = 0, money = null } = {}) {
  const ko = c.lang === 'ko';
  const iname = (id) => { const it = c.items.get(id); return it ? (ko && it.ko ? it.ko : it.en) : `#${id}`; };
  const mname = (id) => { const m = c.mobs.get(id); return m ? (ko && m.ko ? m.ko : m.en) : `#${id}`; };
  const npcName = (id) => { const n = id != null && c.npcs[id]; return n ? (ko ? n.ko || n.en : n.en) : ''; };
  const given = new Set(q.starts.map((i) => i.id));
  const jobs = jobsLabel(q.jobs, c.lang);
  const area = areaName(q.area, c.lang);
  const onePick = onePickOf(q.gets);

  // Closed card: icons with counts only.
  const more = (n) => (n > 0 ? `<span class="qc-chip is-text">+${n}</span>` : '');
  const huntChips = q.hunt.slice(0, 2).map((h) => { const src = c.mobPic(h.id); const t = `${mname(h.id)} ×${nf(h.count)}`; return `<span class="qc-chip" title="${esc(t)}">${src ? `<img class="qc-mob" src="${src}" alt="${esc(mname(h.id))}" loading="lazy" decoding="async">` : `<span translate="no">${esc(mname(h.id))}</span>`}<b>${nf(h.count)}</b></span>`; }).join('');
  const bringChips = q.bring.slice(0, 3 - Math.min(q.hunt.length, 2)).map((i) => `<span class="qc-chip" title="${esc(`${iname(i.id)} ×${nf(i.count)}`)}">${ITEM_ICON(i.id, 22)}<b>${nf(i.count)}</b></span>`).join('');
  const shownNeed = Math.min(q.hunt.length, 2) + Math.min(q.bring.length, 3 - Math.min(q.hunt.length, 2));
  const need = q.hunt.length || q.bring.length ? `${huntChips}${bringChips}${more(q.hunt.length + q.bring.length - shownNeed)}` : `<span class="qc-chip is-text">${ko ? '대화·전달' : 'Talk or deliver'}</span>`;
  const getChips = (money?.best ? [money.best, ...q.gets.filter((g) => g.id !== money.best.id)] : q.gets).slice(0, 2)
    .map((g) => `<span class="qc-chip" title="${esc(`${iname(g.id)}${g.count > 1 ? ` ×${nf(g.count)}` : ''}`)}">${ITEM_ICON(g.id, 22)}${g.count > 1 ? `<b>${nf(g.count)}</b>` : ''}</span>`).join('') + more(q.gets.length - 2);
  const pay = money
    ? `${getChips}<b class="qc-net">+${kmoney(money.net, ko)}</b>`
    : `${getChips}${q.exp || q.meso ? `<span class="qc-num">${q.exp ? `<b class="qc-exp">+${nf(q.exp)} <small>EXP</small></b>` : ''}${q.meso ? `<span class="qc-meso">${nf(q.meso)} ${ko ? '메소' : 'mesos'}</span>` : ''}</span>` : ''}${!q.exp && !q.meso && !q.gets.length ? `<span class="qc-chip is-text">${q.skills ? (ko ? '스킬 습득' : 'Skill') : q.fame ? `${ko ? '인기도' : 'Fame'} +${q.fame}` : '—'}</span>` : ''}`;
  const tags = `${q.expired ? `<i class="qc-tag">${ko ? '종료' : 'Ended'}</i>` : ''}${q.repeat ? `<i class="qc-tag">${ko ? '반복' : 'Repeatable'}</i>` : ''}`;
  const who = [area, npcName(q.startNpc ?? q.endNpc), jobs && jobs !== area ? jobs : ''].filter(Boolean);

  // Opened card: the same with names.
  const dropHint = (id) => {
    const rows = (c.drops.get(id) || []).filter(({ m }) => m.status === 'active').sort((a, b) => a.m.lv - b.m.lv).slice(0, 3);
    return rows.length ? `<small class="qc-drop"><span>${ko ? '드랍' : 'Dropped by'}</span>${rows.map(({ m }) => `<a href="${c.mobHref(m)}" translate="no">${esc(ko ? m.ko || m.en : m.en)}</a>`).join('')}</small>` : '';
  };
  const itemLi = (g, hint) => {
    const it = c.items.get(g.id), href = it && c.itemHref(it);
    const j = g.job != null ? rewardJob(g.job, c.lang) : '';
    return `<li>${ITEM_ICON(g.id, 28)}<div><span>${href ? `<a href="${href}" translate="no">${esc(iname(g.id))}</a>` : `<span translate="no">${esc(iname(g.id))}</span>`} <b>×${nf(Math.abs(g.count))}</b>${j ? ` <small>${esc(j)}</small>` : ''}</span>${hint ? (given.has(g.id) ? `<small class="qc-drop">${ko ? '퀘스트를 받을 때 줘요' : 'Handed to you at the start'}</small>` : dropHint(g.id)) : ''}</div></li>`;
  };
  const mobLi = (h) => { const m = c.mobs.get(h.id), src = c.mobPic(h.id); return `<li>${src ? `<img class="qc-mob" src="${src}" alt="" loading="lazy" decoding="async">` : ''}<div><span>${m ? `<a href="${c.mobHref(m)}" translate="no">${esc(mname(h.id))}</a>` : `<span translate="no">${esc(mname(h.id))}</span>`} <b>×${nf(h.count)}</b>${m ? ` <small>Lv. ${m.lv}</small>` : ''}</span></div></li>`; };
  const todo = q.hunt.length || q.bring.length
    ? `${q.hunt.length ? `<h4>${ko ? '잡을 몬스터' : 'Hunt'}</h4><ul class="qc-items">${q.hunt.map(mobLi).join('')}</ul>` : ''}${q.bring.length ? `<h4>${ko ? '모아 올 아이템' : 'Bring'}</h4><ul class="qc-items">${q.bring.map((i) => itemLi(i, true)).join('')}</ul>` : ''}`
    : `<p>${ko ? 'NPC와 대화하거나 물건을 전달하면 끝나요.' : 'Done by talking to the NPC or delivering something.'}</p>`;
  const facts = [
    q.exp ? ['EXP', `+${nf(q.exp)}`] : null,
    q.meso ? [ko ? '메소' : 'Mesos', nf(q.meso)] : null,
    q.fame ? [ko ? '인기도' : 'Fame', `+${q.fame}`] : null,
    q.skills ? [ko ? '스킬' : 'Skill', ko ? '습득' : 'Learned'] : null,
    money ? [ko ? '보상 값' : 'Reward value', kmoney(q.meso + money.reward, ko)] : null,
    money ? [ko ? '재료값' : 'Materials', money.cost ? `−${kmoney(money.cost, ko)}` : money.mats.some((i) => i.p == null) ? (ko ? '직접 모음' : 'farmed') : '0'] : null,
    money ? [ko ? '남는 메소' : 'Profit', `<b class="qc-net">+${kmoney(money.net, ko)}</b>`] : null
  ].filter(Boolean);
  const rewards = `${facts.length ? `<dl class="qc-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}${q.gets.length ? `<ul class="qc-items">${q.gets.map((g) => itemLi(g, false)).join('')}</ul>${onePick ? `<p class="qc-note">${q.gets.some((g) => g.job != null) ? (ko ? '직업에 맞는 하나를 받아요.' : 'You get the one for your class.') : ko ? `${q.gets.length}개 중 하나를 받아요.${money && money.priced.length > 1 ? ' 보상 값은 평균이에요.' : ''}` : `You get one of these ${q.gets.length}.${money && money.priced.length > 1 ? ' The reward value is their average.' : ''}`}</p>` : ''}` : ''}${!facts.length && !q.gets.length ? `<p>${ko ? '보상 정보가 없어요.' : 'No listed reward.'}</p>` : ''}`;
  const ref = (id) => { const x = c.byId.get(id); return x ? `<li data-ref="${x.id}">${questName(x, c.link, ' translate="no"')}${x.lv ? ` <small>Lv. ${x.lv}</small>` : ''}</li>` : ''; };
  const info = [
    [ko ? '지역' : 'Area', esc(area)],
    [ko ? '시작 레벨' : 'Start level', q.lv ? `Lv. ${q.lv}` : (ko ? '제한 없음' : 'Any')],
    jobs ? [ko ? '직업' : 'Class', esc(jobs)] : null,
    npcName(q.startNpc) ? [ko ? '시작 NPC' : 'Start NPC', `<span translate="no">${esc(npcName(q.startNpc))}</span>`] : null,
    npcName(q.endNpc) && q.endNpc !== q.startNpc ? [ko ? '완료 NPC' : 'Turn in to', `<span translate="no">${esc(npcName(q.endNpc))}</span>`] : null,
    q.ends ? [ko ? '기간' : 'Ends', q.ends] : null
  ].filter(Boolean);
  const guide = questPath(q);
  const chain = `${q.prereq.length ? `<h4>${ko ? '먼저 끝낼 퀘스트' : 'Complete first'}</h4><ul class="qc-refs">${q.prereq.map(ref).join('')}</ul>` : ''}${q.next.length ? `<h4>${ko ? '다음 퀘스트' : 'Leads to'}</h4><ul class="qc-refs">${q.next.slice(0, 6).map(ref).join('')}</ul>` : ''}`;
  const npcId = q.startNpc ?? q.endNpc;
  return `<li class="qc${rank ? ` qc-r${rank}` : ''}${q.expired ? ' is-expired' : ''}" data-q="${q.id}" data-lv="${q.lv || 1}" data-exp="${q.exp}"${money ? ` data-net="${money.net}"` : ''}><details><summary>
<input type="checkbox" class="qc-box" aria-label="${ko ? '이 퀘스트 완료 표시' : 'Mark this quest done'}">
<span class="qc-who"><span class="qc-rank">${rank ? `<span class="qc-medal${rank <= 3 ? ` m${rank}` : ''}">${rank}</span>` : ''}<span class="qc-lv">Lv. ${q.lv || 1}</span></span><span class="qc-face">${npcId != null ? `<img class="qc-npc" src="https://maplestory.io/api/MCW/1/npc/${npcId}/icon" alt="" loading="lazy" decoding="async">` : ''}</span></span>
<span class="qc-title"><b>${questName(q, c.link, ' translate="no"')}${tags}</b><small>${who.map((w, i) => (i === 1 ? `<span translate="no">${esc(w)}</span>` : esc(w))).join(' · ')}</small></span>
<span class="qc-meta"><span class="qc-need"><i class="qc-lab">${ko ? '조건' : 'Needs'}</i>${need}</span><span class="qc-pay"><i class="qc-lab">${money ? (ko ? '남는 메소' : 'Profit') : (ko ? '보상' : 'Reward')}</i>${pay}</span></span>
<span class="qc-chev" aria-hidden="true"></span></summary>
<div class="qc-body"><div><h3>${ko ? '해야 할 일' : 'What to do'}</h3>${todo}${q.starts.filter((i) => !q.bring.some((b) => b.id === i.id)).length ? `<h4>${ko ? '시작할 때 받는 아이템' : 'Given at the start'}</h4><ul class="qc-items">${q.starts.filter((i) => !q.bring.some((b) => b.id === i.id)).map((g) => itemLi(g, false)).join('')}</ul>` : ''}</div>
<div><h3>${ko ? '보상' : 'Rewards'}</h3>${rewards}</div>
<div><h3>${ko ? '퀘스트 정보' : 'Quest info'}</h3><dl class="qc-facts">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${chain}${guide ? `<p><a class="qc-guide" href="${c.link(guide)}">${ko ? '단계별 공략 보기' : 'Open the step-by-step guide'}</a></p>` : ''}</div></div>
</details></li>`;
}
// The bar above the cards: how many are ticked, hide the ticked ones, open or close every card. The quest list page adds a
// name search and a level box. Numbers are filled in by assets/quest-check.js; without JavaScript the bar stays hidden.
function questBar({ ko, total, sum, filters = false }) {
  return `<div class="qc-bar" data-qc-bar hidden>
<div class="qc-prog"><span><b data-qc-d>0</b> / ${nf(total)} ${ko ? '완료' : 'done'}</span>${sum ? `<span class="qc-sum" data-qc-sum="${sum.key}" hidden>${sum.label} <b></b></span>` : ''}<i class="qc-meter"><i data-qc-meter></i></i></div>
<div class="qc-tools">${filters ? `<input type="search" class="qc-search" data-qc-search placeholder="${ko ? '퀘스트·NPC·아이템 이름' : 'Quest, NPC or item name'}" aria-label="${ko ? '퀘스트 찾기' : 'Find a quest'}"><label class="qc-mylv">${ko ? '내 레벨' : 'My level'}<input type="number" min="1" max="200" inputmode="numeric" data-qc-lv placeholder="${ko ? '전체' : 'Any'}"></label>` : ''}<label class="qc-toggle"><input type="checkbox" data-qc-hide><span>${ko ? '완료한 퀘스트 숨기기' : 'Hide finished quests'}</span></label><button type="button" class="qc-all" data-qc-all><span class="qc-all-open">${ko ? '모두 펼치기' : 'Open all'}</span><span class="qc-all-close">${ko ? '모두 접기' : 'Close all'}</span></button></div>
<button type="button" class="qc-sync" data-qc-sync hidden><span class="qc-sync-icon" aria-hidden="true"></span><span class="qc-sync-off">${ko ? '디스코드로 로그인하면 PC·휴대폰 어디서나 체크가 이어져요' : 'Log in with Discord to keep your ticks on every device'}</span><span class="qc-sync-on">${ko ? '디스코드 계정에 저장 중 · 어느 기기에서나 이어져요' : 'Saved to your Discord account · the same on every device'}</span></button>
</div>
<p class="qc-hint muted small">${ko ? '끝낸 퀘스트는 왼쪽 네모를 눌러 체크하고, 줄을 누르면 조건과 보상이 자세히 펼쳐져요.' : 'Tick the box when a quest is done; tap a row to open its requirements and rewards.'}</p>`;
}
const countTag = (n) => `<small class="qc-count" data-qc-count>0/${n}</small>`;
const emptyNote = (ko) => `<p class="qc-empty" hidden>${ko ? '여기 퀘스트는 모두 완료했어요.' : 'Every quest here is done.'}</p>`;
const listOf = (cards, ko) => `<ul class="qc-list">${cards.join('')}</ul>${emptyNote(ko)}`;

export function questIndex({ c, quests, guides = [], promo = '' }) {
  const { lang, link } = c;
  const ko = lang === 'ko';
  const order = ['Maple Island', 'Lith Harbor', 'Henesys', 'Ellinia', 'Perion', 'Kerning City', 'Sleepywood', 'Florina Beach', 'Victoria Island', 'Warrior', 'Magician', 'Bowman', 'Thief', 'Citizenship', 'Crafting', 'Forgotten Hollow', 'Event'];
  const areas = [...new Set([...order, ...quests.map((q) => q.area)])].filter((a) => quests.some((q) => q.area === a));
  const live = quests.filter((q) => !q.expired);
  return `<section class="page-head wrap"><h1>${ko ? '퀘스트' : 'Quests'}</h1>
<p class="lead">${ko ? `글클메 퀘스트 ${live.length}개의 시작 레벨, 필요한 아이템과 몬스터, 보상 EXP·메소를 지역별 체크리스트로 정리했어요. 끝낸 퀘스트를 체크하면서 남은 것만 골라 보세요.` : `${live.length} Classic World quests by area as a checklist: start level, what to bring or hunt, and the EXP and mesos they pay. Tick off what you have done and see what is left.`}</p>
<p class="char-links"><a href="${link('/quests/best-meso/')}">${ko ? '돈 버는 퀘스트 순위' : 'Quests that make the most mesos'}</a><a href="${link('/quests/best-exp/')}">${ko ? '레벨별 경험치 퀘스트' : 'Best EXP quests by level'}</a><a href="${link('/equipment/')}">${ko ? '장비 찾기' : 'Equipment finder'}</a></p>
<nav class="band-nav" aria-label="${ko ? '지역' : 'Areas'}"><div>${guides.length ? `<a class="band-link" href="#guides">${ko ? '퀘스트 공략' : 'Quest guides'}</a>` : ''}${areas.map((a) => `<a class="band-link" href="#area-${encodeURIComponent(a)}">${esc(areaName(a, lang))}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page qc-page" data-qc>
${promo}
${guides.length ? questGuideCards({ lang, guides, link }) : ''}
${questBar({ ko, total: quests.length, sum: { key: 'exp', label: ko ? '받은 경험치' : 'EXP earned' }, filters: true })}
${areas
  .map((a) => {
    const list = quests.filter((q) => q.area === a);
    return `<section class="panel qc-sec" id="area-${encodeURIComponent(a)}"><h2><span>${esc(areaName(a, lang))}</span> ${countTag(list.length)}</h2>
${listOf(list.map((q) => questCard(c, q)), ko)}</section>`;
  })
  .join('\n')}
<p class="qc-none muted" data-qc-none hidden>${ko ? '조건에 맞는 퀘스트가 없어요.' : 'No quest matches.'}</p>
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
    return `<a class="tool-card qg-card" href="${link(`/quests/${g.slug}/`)}"><span class="qg-pics">${g.rewardItem ? `<img src="https://maplestory.io/api/MCW/1.2/item/${g.rewardItem}/icon" alt="" width="32" height="32" loading="lazy">` : ''}${npc ? `<img src="https://maplestory.io/api/MCW/1/npc/${npc}/icon" alt="" height="44" loading="lazy">` : ''}</span><strong>${esc(L(g.title))}</strong><p>${esc(L(g.card))}</p><small class="qg-meta">${esc(L(g.level))}${ko ? ` · ${steps.length}단계` : ` · ${steps.length} steps`}${g.reward ? ` · ${esc(L(g.reward))}` : ''}</small><span>${ko ? '공략 보기' : 'Open the guide'}</span></a>`;
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
export function questMoneyBody({ c, quests, price, updated }) {
  const { lang, link } = c;
  const ko = lang === 'ko';
  const pool = quests.filter((q) => !q.expired && !q.repeat && q.area !== 'Forgotten Hollow')
    .map((q) => ({ q, m: questMoney(q, price) })).filter((x) => x.m.reward > 0 && x.m.net > 0)
    .sort((x, y) => y.m.net - x.m.net).filter((x, i, all) => all.findIndex((y) => y.q.name === x.q.name) === i);
  const cards = (list, ranked) => listOf(list.map(({ q, m }, k) => questCard(c, q, { rank: ranked ? k + 1 : 0, money: m })), ko);
  const top = pool.slice(0, 10);
  const bands = QUEST_BANDS.map(([a, b]) => [a, b, pool.filter(({ q }) => Math.max(q.lv, 1) >= a && Math.max(q.lv, 1) <= b).slice(0, 10)]).filter(([, , list]) => list.length);
  const sections = bands.map(([a, b, list]) => {
    const label = b >= 200 ? (ko ? `${a}레벨 이상` : `Level ${a}+`) : (ko ? `${a}~${b}레벨` : `Level ${a}–${b}`);
    return `<section class="panel qc-sec" id="lv-${a}"><h2>${label} ${countTag(list.length)}</h2>${cards(list)}</section>`;
  }).join('');
  const total = new Set([...top, ...bands.flatMap(([, , list]) => list)].map(({ q }) => q.id)).size;
  const day = (updated || '').slice(0, 10);
  return `<section class="page-head wrap"><h1>${ko ? '돈 버는 퀘스트 순위' : 'Quests that make the most mesos'}</h1>
<p class="lead">${ko ? `보상으로 받는 아이템을 지금 자유시장 시세로 바꿔서, 재료값을 빼고 메소가 가장 많이 남는 퀘스트부터 줄 세웠어요. 시세는 ${esc(day)} 기준이고 매일 다시 계산해요.` : `Quest rewards priced at today's Free Market value, minus what the materials would sell for, ranked by what is left. Prices are from ${esc(day)} and recalculated every day.`}</p>
${ko ? `<div class="yt-lite" data-yt-lite="PL1-KdtyMLY"><button type="button" aria-label="영상 재생: 글클메 돈 버는 퀘스트 TOP 10"><img src="https://i.ytimg.com/vi/PL1-KdtyMLY/hqdefault.jpg" alt="" width="480" height="360" fetchpriority="high" decoding="async"><span class="yt-play" aria-hidden="true"></span></button><p class="yt-cap"><b>영상으로 보기</b> 돈 버는 퀘스트 TOP 10 · 4분 30초 <a href="https://youtu.be/PL1-KdtyMLY" target="_blank" rel="noopener" data-yt-open="PL1-KdtyMLY">유튜브에서 보기</a></p></div>` : ''}
${rankTabs(ko, link, 'meso')}
<nav class="band-nav" aria-label="${ko ? '레벨' : 'Level'}"><div><a class="band-link" href="#top">TOP 10</a>${QUEST_BANDS.map(([a, b]) => `<a class="band-link" href="#lv-${a}">${b >= 200 ? `${a}+` : `${a}–${b}`}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page qc-page" data-qc>
${questBar({ ko, total, sum: { key: 'net', label: ko ? '완료한 퀘스트로 남긴 메소' : 'Profit from finished quests' } })}
<section class="panel qc-sec" id="top"><h2>${ko ? '전체 TOP 10' : 'Top 10 overall'} ${countTag(top.length)}</h2>${cards(top, true)}</section>
${sections}
<section class="panel"><h2>${ko ? '이렇게 계산했어요' : 'How it is worked out'}</h2><ul>
<li>${ko ? '남는 메소 = 보상 메소 + 보상 아이템 시세 − 재료 시세예요. 재료를 직접 사냥해서 모으면 재료값만큼 더 남아요.' : 'Profit = meso reward + reward items at market price − materials at market price. Farm the materials yourself and you keep that cost too.'}</li>
<li>${ko ? '보상이 여러 개 중 하나로 나오는 퀘스트는 그 평균값으로 계산했어요. 줄을 펼치면 "N개 중 하나"로 표시돼요.' : 'When a quest gives one of several rewards, the average is used; the opened row says "one of these N".'}</li>
<li>${ko ? '아이템 값은 최근 판매 완료 가격을 쓰고, 없으면 매물 3건 이상인 판매가의 중앙값을 써요. 시세가 없는 보상과 재료는 0으로 계산했어요.' : 'Item values use recent sold prices, otherwise the median asking price when there are three or more listings. Rewards and materials with no price count as 0.'}</li>
<li>${ko ? '반복 퀘스트, 끝난 이벤트, 포가튼 할로우 퀘스트는 뺐어요.' : 'Repeatable quests, ended events and Forgotten Hollow quests are left out.'}</li></ul></section></div>`;
}

export function questBestBody({ c, quests }) {
  // Forgotten Hollow opened on 11/18, so its quests count now.
  const { lang, link } = c;
  const ko = lang === 'ko';
  const pool = quests.filter((q) => !q.expired && !q.repeat && q.exp > 0)
    .sort((x, y) => y.exp - x.exp)
    // Citizenship donations repeat one name across many variants; keep the best-paying one of each name.
    .filter((q, i, all) => all.findIndex((x) => x.name === q.name) === i);
  const cards = (list, ranked) => listOf(list.map((q, k) => questCard(c, q, { rank: ranked ? k + 1 : 0 })), ko);
  const bands = QUEST_BANDS.map(([a, b]) => [a, b, pool.filter((q) => Math.max(q.lv, 1) >= a && Math.max(q.lv, 1) <= b).slice(0, 10)]).filter(([, , list]) => list.length);
  const sections = bands.map(([a, b, list]) => {
    const label = b >= 200 ? (ko ? `${a}레벨 이상` : `Level ${a}+`) : (ko ? `${a}~${b}레벨` : `Level ${a}–${b}`);
    const bandTotal = list.reduce((t, q) => t + q.exp, 0);
    return `<section class="panel qc-sec" id="lv-${a}"><h2>${label} <small class="muted">${ko ? `10개 합계 경험치 ${nf(bandTotal)}` : `top 10 together: ${nf(bandTotal)} EXP`}</small> ${countTag(list.length)}</h2>${cards(list)}</section>`;
  }).join('');
  const top = pool.slice(0, 10);
  const total = new Set([...top, ...bands.flatMap(([, , list]) => list)].map((q) => q.id)).size;
  return `<section class="page-head wrap"><h1>${ko ? '레벨별 경험치 많이 주는 퀘스트' : 'Best EXP quests by level'}</h1>
<p class="lead">${ko ? '레벨 구간마다 보상 경험치가 큰 퀘스트를 10개씩 골랐어요. 누구에게 받는지(NPC), 무엇을 잡고 모으는지(몬스터·재료), 경험치와 함께 주는 아이템까지 한 줄에 보여요. 끝낸 퀘스트는 체크해 두고, 사냥하다 지칠 때 남은 것을 끼워 넣기 좋아요.' : 'The ten biggest EXP rewards in each level band, from the game data: who gives it, what you hunt or bring, and the items that come with the EXP, on one row. Tick off what you have done and slot the rest in between grinding sessions.'}</p>
${rankTabs(ko, link, 'exp')}
<nav class="band-nav" aria-label="${ko ? '레벨' : 'Level'}"><div><a class="band-link" href="#top">TOP 10</a>${QUEST_BANDS.map(([a, b]) => `<a class="band-link" href="#lv-${a}">${b >= 200 ? `${a}+` : `${a}–${b}`}</a>`).join('')}</div></nav></section>
<div class="wrap quest-page qc-page" data-qc>
${questBar({ ko, total, sum: { key: 'exp', label: ko ? '받은 경험치' : 'EXP earned' } })}
<section class="panel qc-sec" id="top"><h2>${ko ? '전체 TOP 10' : 'Top 10 overall'} ${countTag(top.length)}</h2>${cards(top, true)}</section>
${sections}
<section class="panel"><h2>${ko ? '이렇게 골랐어요' : 'How these are picked'}</h2><ul>
<li>${ko ? '경험치와 메소, 보상 아이템은 게임 클라이언트 데이터 그대로예요.' : 'EXP, mesos and reward items are the game client data as is.'}</li>
<li>${ko ? '같은 이름의 퀘스트(시민권 기부처럼 여러 번 나오는 것)는 경험치가 가장 큰 하나만 남겼어요.' : 'Quests sharing one name (like the citizenship donations) keep only their best-paying one.'}</li>
<li>${ko ? '보상이 여러 개 중 하나로 나오는 퀘스트는 줄을 펼치면 "N개 중 하나"로 표시돼요.' : 'Quests that give one of several rewards say "one of these N" when opened.'}</li>
<li>${ko ? '반복 퀘스트와 끝난 이벤트는 뺐어요. 포가튼 할로우 퀘스트는 11월 18일 오픈 뒤 포함했어요.' : 'Repeatable quests and ended events are left out; Forgotten Hollow quests are in since it opened on Nov 18.'}</li></ul>
<p>${ko ? '메소가 목적이면' : 'After mesos instead?'} <a href="${link('/quests/best-meso/')}">${ko ? '돈 버는 퀘스트 순위' : 'Quests that make the most mesos'}</a> · <a href="${link('/quests/')}">${ko ? '전체 퀘스트' : 'All quests'}</a></p></section></div>`;
}
