// /forgotten-hollow/: one page for the Forgotten Hollow update (opens 2026-11-18). Monster stats, spawn counts, EXP per
// clear and drops come from data/monsters.json; the 50/55 and 45 quest lines from the client quest data; the rest (ways in,
// the town, best maps, class picks, the boss, what to prepare) from data/forgotten-hollow.json. Each fact carries how sure
// it is: official (Nexon's notice), data (client / beta data), video (player reports from the beta) or pending.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (id) => `https://maplestory.io/api/MCW/1/item/${id}/icon`;
const npcImg = (id) => `https://maplestory.io/api/MCW/1/npc/${id}/icon`;
const n = (v, lang) => Number(v).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');

export const FH_MOB_IDS = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63];
export const FH_BOSS_ID = 700003;

export function fhBody({ lang, fh, monsters, raw, items, link, mobSprite, accNeed, today }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const L = (o) => (o ? (ko ? o.ko : o.en) : '');
  const mobs = new Map(monsters.map((m) => [m.id, m]));
  const mobName = (m) => (ko ? m.ko : m.en);
  const mobHref = (m) => link(`/monsters/${m.id}/`);
  const calcHref = (m) => link(`/tools/damage/?mob=${m.id}`);
  const mapHref = (id) => link(`/maps/${id}/`);
  // Scroll tiers carry their success rate, so nobody has to remember that 상급 (Greater) means 10%.
  const TIER = { 하급: 100, 중급: 60, 상급: 10, Lesser: 100, Intermediate: 60, Greater: 10 };
  const withRate = (name) => { const t = /(하급|중급|상급|Lesser|Intermediate|Greater)\s*$/.exec(name.trim()); return t ? `${name.trim()} ${TIER[t[1]]}%` : name; };
  const itemName = (id) => { const o = fh.itemNames?.[id]; if (o) return L(o); const i = items.get(id); return withRate(ko ? i?.ko || i?.en || `#${id}` : i?.en || `#${id}`); };

  // Every Hollow map from the spawn data: monsters with counts, EXP for one full clear, and the lowest monster level.
  const maps = new Map();
  for (const m of monsters) for (const l of m.locations || []) if (String(l.id).startsWith('10006')) {
    const e = maps.get(l.id) || { id: l.id, en: l.en.trim(), mobs: [] };
    e.mobs.push({ m, count: l.count });
    maps.set(l.id, e);
  }
  for (const e of maps.values()) {
    e.mobs.sort((a, b) => b.count - a.count);
    e.total = e.mobs.reduce((s, x) => s + x.count, 0);
    e.exp = e.mobs.reduce((s, x) => s + x.count * x.m.exp, 0);
    e.ko = fh.mapNames[e.id]?.ko || null;
  }
  const mapLabel = (id) => { const e = maps.get(id); return ko && e?.ko ? e.ko : e?.en || ''; };
  const mapSub = (id) => { const e = maps.get(id); return ko && e?.ko ? e.en : ''; };

  // Element tags: 2 = resists, 3 = weak (client codes).
  const EL = ko ? { F: '불', I: '얼음', L: '번개', S: '독', H: '성', D: '어둠' } : { F: 'Fire', I: 'Ice', L: 'Lightning', S: 'Poison', H: 'Holy', D: 'Dark' };
  const elTags = (m) => [...(m.el || '').matchAll(/([A-Z])(\d)/g)].filter(([, e, c]) => EL[e] && (c === '2' || c === '3'))
    .sort((a, b) => b[2] - a[2])
    .map(([, e, c]) => `<span class="fh-el fh-el-${c === '3' ? 'weak' : 'strong'}">${EL[e]} ${c === '3' ? tr('약점', 'weak') : tr('강함', 'resists')}</span>`).join('');

  const STATE = { official: tr('공식', 'Official'), data: tr('게임 데이터', 'Game data'), video: tr('테스트 서버 제보', 'Beta report'), pending: tr('준비 중', 'Coming soon') };
  const tag = (s) => `<span class="fh-tag fh-tag-${s}">${STATE[s]}</span>`;

  const open = new Date(`${fh.open}T00:00:00+09:00`);
  const days = Math.round((open - new Date(`${today}T00:00:00+09:00`)) / 86400000);
  const dday = days > 0 ? tr(`오픈까지 ${days}일`, `${days} day${days === 1 ? '' : 's'} to go`) : days === 0 ? tr('오늘 열려요', 'Opens today') : tr('열렸어요', 'Now open');

  // ---------- hero: the descent, zone by zone, drawn with the monsters that live there ----------
  const zoneMobs = { entry: [54, 55, 57], middle: [59, 60, 58], deep: [62, 63, 61] };
  const descent = `<ol class="fh-descent" aria-label="${tr('입구에서 보스까지', 'From the entrance to the boss')}">
${fh.zones.map((z) => `<li class="fh-step"><a href="#zone-${z.id}"><span class="fh-step-lv">Lv ${z.lv}</span><b>${esc(L(z.name))}</b><span class="fh-step-mobs">${zoneMobs[z.id].map((id) => `<img src="${mobSprite({ id })}" alt="${esc(mobName(mobs.get(id)))}" loading="eager">`).join('')}</span></a></li>`).join('\n')}
<li class="fh-step fh-step-boss"><a href="#boss"><span class="fh-step-lv">Lv 60</span><b>${esc(mobName(mobs.get(FH_BOSS_ID)))}</b><span class="fh-step-mobs"><img src="${mobSprite({ id: FH_BOSS_ID })}" alt="" loading="eager"></span></a></li>
</ol>`;
  const hero = `<section class="fh-hero" aria-labelledby="fh-title">
<div class="fh-spores" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
<div class="wrap fh-hero-grid">
<div class="fh-hero-copy">
<h1 id="fh-title">${tr('포가튼 할로우 공략', 'Forgotten Hollow guide')}</h1>
<p class="fh-hero-lead">${tr('잊혀진 골짜기의 가는 길, 사냥터, 몬스터, 퀘스트, 보스를 한 페이지에 모았어요.', 'Getting in, where to train, every monster, the quests and the boss, on one page.')}</p>
<p class="fh-hero-actions"><a class="btn" href="#way-in">${tr('가는 법', 'How to get in')}</a><a class="btn ghost" href="#zone-entry">${tr('레벨별 사냥터', 'Maps by level')}</a></p>
<p class="fh-dday">${tr('11월 18일 오픈', 'Opens November 18')}, <b>${dday}</b></p>
</div>
${descent}
</div>
</section>`;

  const toc = `<nav class="fh-toc wrap" aria-label="${tr('이 페이지', 'On this page')}">${[
    ['way-in', tr('가는 법', 'Getting in')], ['town', tr('마을', 'Town')], ['zone-entry', tr('사냥터', 'Maps')], ['monsters', tr('몬스터', 'Monsters')],
    ['classes', tr('직업별 추천', 'By class')], ['quests', tr('퀘스트', 'Quests')], ['boss', tr('보스', 'Boss')], ['prep', tr('미리 준비', 'Prepare')], ['november', tr('11월 업데이트', 'November update')]
  ].map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>`;

  const legend = `<section class="fh-legend wrap" aria-label="${tr('정보 표시', 'How sure each fact is')}">
<p>${tr('테스트 서버 정보는 오픈 때 바뀔 수 있어요. 문장마다 어디서 확인한 정보인지 붙여 뒀어요.', 'Beta details can change at launch, so every fact says how we know it.')}</p>
<ul>${['official', 'data', 'video', 'pending'].map((s) => `<li>${tag(s)}<span>${{ official: tr('넥슨 공지', 'Nexon\'s notice'), data: tr('게임 클라이언트·테스트 데이터', 'Client and beta data'), video: tr('테스트 플레이어들의 확인', 'Confirmed by beta players'), pending: tr('발표 전, 오픈 후 채워요', 'Not announced; filled in after launch') }[s]}</span></li>`).join('')}</ul>
</section>`;

  // ---------- getting in + town ----------
  const wayIn = `<section class="fh-sec wrap" id="way-in">
<h2>${tr('가는 법', 'How to get in')}</h2>
<p class="fh-lead">${tr('레벨 제한 없이 누구나 들어갈 수 있지만, 본격적인 사냥과 퀘스트는 39레벨부터예요.', 'Anyone can walk in at any level; the real hunting and quests start at level 39.')} ${tag('official')}</p>
<div class="fh-two">
${fh.entrances.map((e, i) => `<article class="fh-card"><h3><span class="fh-num">${i + 1}</span>${esc(L(e.name))}</h3>
<ol class="gq-path">${L(e.path).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<p>${esc(L(e.note))} ${tag('video')}</p></article>`).join('\n')}
</div>
</section>`;

  const town = `<section class="fh-sec wrap" id="town">
<h2>${tr('잊혀진 골짜기 마을', 'The Forgotten Hollow town')}</h2>
<p class="fh-lead">${tr('마을에는 몬스터가 없어요. 동쪽은 입구 구역, 서쪽 문은 중간 구역으로 이어져요.', 'No monsters in town. East leads back to the entrance; the west gate leads to the middle zone.')} ${tag('video')}</p>
<ul class="fh-town">${fh.town.map((t) => `<li><b>${esc(L(t.who))}</b><span>${esc(L(t.what))}</span>${tag(t.state)}</li>`).join('')}</ul>
<p class="fh-note">${tr('공지에 나온 할로우 NPC: 루마, 방랑 모험가 제이미, 토린, 니로스, 실카, 마이라, 타미아, 학자 다니엘, 미엔, 젤리아.', 'NPCs named in the notice: Luma, Jaime the Explorer, Torin, Nyroth, Sylka, Myra, Tamya, Daniel the Scholar, Myen, Zelya.')} ${tag('official')}</p>
</section>`;

  // ---------- zones ----------
  const mapRow = (id, best) => {
    const e = maps.get(id);
    if (!e) return '';
    const hidden = fh.hidden[id];
    return `<li class="fh-map${best ? ' is-best' : ''}">
<div class="fh-map-head"><a href="${mapHref(id)}"><b translate="no">${esc(mapLabel(id))}</b></a>${mapSub(id) ? `<small translate="no">${esc(mapSub(id))}</small>` : ''}${hidden ? `<span class="fh-hidden">${tr('숨은 맵', 'Hidden map')}</span>` : ''}</div>
<div class="fh-map-mobs">${e.mobs.map(({ m, count }) => `<a href="${mobHref(m)}" title="${esc(mobName(m))} Lv ${m.lv}"><img src="${mobSprite(m)}" alt="" width="34" height="34" loading="lazy"><span translate="no">${esc(mobName(m))}</span><em>${count}</em></a>`).join('')}</div>
<dl class="fh-map-stats"><div><dt>${tr('몬스터', 'Monsters')}</dt><dd>${e.total}</dd></div><div><dt>${tr('한 바퀴 경험치', 'EXP per clear')}</dt><dd>${n(e.exp, lang)}</dd></div></dl>
${best ? `<p class="fh-map-why">${esc(L(best))}</p>` : ''}${hidden ? `<p class="fh-map-why fh-map-hidden">${esc(L(hidden))}</p>` : ''}
</li>`;
  };
  const zones = fh.zones.map((z) => {
    const bestIds = new Set(z.best.map((b) => b.map));
    const rest = z.maps.filter((id) => !bestIds.has(id)).sort((a, b) => maps.get(b).exp - maps.get(a).exp);
    return `<section class="fh-sec fh-zone wrap" id="zone-${z.id}">
<h2><span class="fh-zone-lv">Lv ${z.lv}</span>${esc(L(z.name))}</h2>
<p class="fh-lead">${esc(L(z.lead))} ${tag('data')}</p>
<h3 class="fh-sub">${tr('추천 사냥터', 'Best maps')}</h3>
<ol class="fh-maps">${z.best.map((b) => mapRow(b.map, b)).join('')}</ol>
<details class="fh-more"><summary>${tr(`나머지 맵 ${rest.length}곳`, `${rest.length} more maps`)}</summary><ol class="fh-maps">${rest.map((id) => mapRow(id, null)).join('')}</ol></details>
</section>`;
  }).join('\n');

  // ---------- monsters ----------
  const notable = (m) => (m.drops || []).filter((d) => /^(1|204|4130)/.test(String(d.itemId)));
  const etc = (m) => (m.drops || []).filter((d) => /^4000\d{3}$/.test(String(d.itemId))).slice(0, 1);
  const mobCard = (m) => `<article class="fh-mob${m.boss ? ' fh-mob-boss' : ''}" id="mob-${m.id}">
<div class="fh-mob-head"><img src="${mobSprite(m)}" alt="" width="64" height="64" loading="lazy"><div><h3><a href="${mobHref(m)}" translate="no">${esc(mobName(m))}</a></h3><small>Lv ${m.lv}${m.undead ? ` ${tr('언데드', 'undead')}` : ''}</small></div></div>
<dl class="fh-mob-stats"><div><dt>HP</dt><dd>${n(m.hp, lang)}</dd></div><div><dt>${tr('경험치', 'EXP')}</dt><dd>${n(m.exp, lang)}</dd></div><div><dt>${tr('물리 방어', 'DEF')}</dt><dd>${m.wdef}</dd></div><div><dt>${tr('마법 방어', 'M.DEF')}</dt><dd>${m.mdef}</dd></div><div><dt>${tr('같은 레벨 명중', 'Accuracy, same level')}</dt><dd>${accNeed(m.lv, m)}</dd></div></dl>
${elTags(m) ? `<p class="fh-els">${elTags(m)}</p>` : ''}
<div class="fh-drops">${[...etc(m), ...notable(m)].map((d) => `<span title="${esc(ko ? d.ko : d.en)}"><img src="${icon(d.itemId)}" alt="" width="24" height="24" loading="lazy"><span translate="no">${esc(withRate(ko ? d.ko : d.en))}</span></span>`).join('')}</div>
<a class="fh-mob-calc" href="${calcHref(m)}">${tr('몇 방 컷 계산', 'Hits to kill')}</a>
</article>`;
  const monstersSec = `<section class="fh-sec wrap" id="monsters">
<h2>${tr('새 몬스터 10종', 'The ten new monsters')}</h2>
<p class="fh-lead">${tr('체력, 경험치, 방어, 속성은 게임 데이터 기준이에요. 같은 레벨 명중은 빗나가지 않는 명중 값이고, 레벨이 낮으면 더 필요해요. 드롭은 테스트에서 확인된 장비·주문서만 골랐어요.', 'HP, EXP, defence and elements are from the game data. Same-level accuracy is what you need to never miss at the monster\'s level; lower levels need more. Drops list the gear and scrolls seen in the beta.')} ${tag('data')}</p>
<div class="fh-mobs">${FH_MOB_IDS.map((id) => mobCard(mobs.get(id))).join('')}</div>
<div class="fh-scroll"><table class="fh-acc"><caption>${tr('내 레벨별로 빗나가지 않는 명중', 'Accuracy to never miss, by your level')}</caption>
<thead><tr><th>${tr('몬스터', 'Monster')}</th>${[40, 45, 50, 55, 60].map((l) => `<th>Lv ${l}</th>`).join('')}</tr></thead>
<tbody>${FH_MOB_IDS.map((id) => { const m = mobs.get(id); return `<tr><th scope="row" translate="no">${esc(mobName(m))} <small>Lv ${m.lv}</small></th>${[40, 45, 50, 55, 60].map((l) => `<td>${accNeed(l, m)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
</section>`;

  // ---------- classes ----------
  const pick = (id, why) => { const m = mobs.get(id); return `<a class="fh-pick" href="${calcHref(m)}"><img src="${mobSprite(m)}" alt="" width="36" height="36" loading="lazy"><span><b translate="no">${esc(mobName(m))}</b><small>${esc(L(why))}</small></span></a>`; };
  const classes = `<section class="fh-sec wrap" id="classes">
<h2>${tr('직업별로 뭘 잡을까', 'What to hunt, by class')}</h2>
<p class="fh-lead">${esc(L(fh.classNote))} ${tag('video')}</p>
<div class="fh-scroll"><table class="fh-classes"><thead><tr><th>${tr('직업', 'Class')}</th><th>${tr('40레벨대', 'Level 40s')}</th><th>${tr('50레벨대', 'Level 50s')}</th></tr></thead>
<tbody>${fh.classes.map((c) => `<tr><th scope="row">${esc(L(c.job))}</th><td>${pick(c.a, c.aw)}</td><td>${pick(c.b, c.bw)}</td></tr>`).join('')}</tbody></table></div>
</section>`;

  // ---------- quests ----------
  const quests = new Map(raw.quests.map((q) => [q.id, q]));
  const npcName = (id) => (ko ? fh.npcs[id] || raw.npcs[id]?.ko || raw.npcs[id]?.en : raw.npcs[id]?.en) || '';
  const SCROLL_PICK = { 10623: 'pick', 10626: 'pick', 10617: 'random' };
  const qStep = (id) => {
    const q = quests.get(id);
    const s = q.requirementToStart || {}, d = q.requirementToComplete || {}, rw = q.rewardOnComplete || {};
    const kills = (d.mobs || []).map((k) => { const m = mobs.get(k.id); return `<li class="gq-need gq-kill">${m ? `<img src="${mobSprite(m)}" alt="" width="34" height="34" loading="lazy">` : ''}<div><b translate="no">${m ? `<a href="${mobHref(m)}">${esc(mobName(m))}</a>` : `#${k.id}`} ×${k.count}</b></div></li>`; });
    const bring = (d.items || []).map((i) => `<li class="gq-need gq-item"><img src="${icon(i.id)}" alt="" width="30" height="30" loading="lazy"><div><b translate="no">${esc(itemName(i.id))} ×${i.count}</b></div></li>`);
    const gets = (rw.items || []).filter((i) => i.count > 0);
    const mode = SCROLL_PICK[id];
    const npcs = d.npcId && d.npcId !== s.npcId ? [s.npcId, d.npcId] : [s.npcId];
    return `<li class="gq-step fh-q">
<div class="gq-step-head"><span class="gq-npcs">${npcs.map((x) => `<img src="${npcImg(x)}" alt="" loading="lazy">`).join('<i aria-hidden="true">→</i>')}</span><div class="gq-title"><h3 translate="no">${esc(q.name)}</h3><small><span>Lv ${s.levelMinimum}+</span> <span translate="no">${esc(npcs.map(npcName).join(' → '))}</span></small></div></div>
<div class="gq-step-body">${kills.length || bring.length ? `<ul class="gq-needs">${[...kills, ...bring].join('')}</ul>` : ''}
<div class="gq-reward"><b>${tr('보상', 'Reward')}</b> <span translate="no">EXP ${n(rw.exp || 0, lang)}</span>${rw.meso ? `<span>${n(rw.meso, lang)} ${tr('메소', 'mesos')}</span>` : ''}${gets.length ? `<div class="gq-gets">${mode ? `<span>${mode === 'pick' ? tr('다음 중 하나를 골라요', 'Pick one of these') : tr('다음 중 하나 (무작위)', 'One of these, at random')}</span>` : ''}${gets.map((g) => `<a class="gq-get" href="${link(`/tools/market/?item=${g.id}`)}"><img src="${icon(g.id)}" alt="" width="26" height="26" loading="lazy"><span translate="no">${esc(itemName(g.id))}${g.count > 1 ? ` ×${g.count}` : ''}</span></a>`).join('')}</div>` : ''}</div>
</div></li>`;
  };
  const chain = (ids) => `<ol class="gq-steps fh-chain">${ids.map(qStep).join('')}</ol>`;
  const questsSec = `<section class="fh-sec wrap" id="quests">
<h2>${tr('퀘스트', 'Quests')}</h2>
<p class="fh-lead">${tr('39레벨 이상 새 퀘스트가 34개 추가돼요. 지금 확인된 줄기를 레벨 순서로 정리했어요.', '34 new quests for level 39 and up. These are the lines confirmed so far, in level order.')} ${tag('official')}</p>
<article class="fh-qblock"><h3><span class="fh-zone-lv">Lv 39</span>${tr('입장 퀘스트', 'The way in')} ${tag('video')}</h3>
<ol class="fh-plain">${fh.entryQuest.map((s) => `<li><b>${esc(L(s.who))}</b><span>${esc(L(s.do))}</span></li>`).join('')}</ol>
<p class="fh-note">${tr('재료는 퀘스트 아이템이라 오픈한 뒤에 모을 수 있어요. 정확한 퀘스트 이름과 개수는 오픈 후 채울게요.', 'The materials are quest items, so they only drop after launch. Exact names and counts will follow after launch.')} ${tag('pending')}</p></article>
<article class="fh-qblock"><h3><span class="fh-zone-lv">Lv 43</span>${tr('동굴 요정 젤리아', 'Zelya the cave fairy')} ${tag('video')}</h3><p>${esc(L(fh.zelya))}</p></article>
<article class="fh-qblock"><h3><span class="fh-zone-lv">Lv 50</span>${tr('타미아와 다니엘: 귀고리 주문서', 'Tamya and Daniel: the earring scroll')} ${tag('data')}</h3>
<p>${tr('11월 18일부터 열려요. 앞선 할로우 퀘스트를 끝내야 받을 수 있어요. 마지막에 귀고리 10% 주문서를 직업에 맞게 골라 받는데, 팔 거라면 LUK이 가장 비싸요.', 'Opens November 18, after the earlier Hollow quests. It ends with a 10% earring scroll of your choice; LUK sells best.')}</p>${chain([10621, 10622, 10623])}</article>
<article class="fh-qblock"><h3><span class="fh-zone-lv">Lv 55</span>${tr('제이미와 무너진 무덤', 'Jaime and the Dilapidated Tomb')} ${tag('data')}</h3>
<p>${tr('11월 18일부터. 썩은 버섯의 부패한 부적과 스포어우드 60마리. 마지막 보상은 하의 HP 10%, 망토 명중 10%, 엘릭서 20개 중 하나예요.', 'From November 18: Decayed Charms from Rotten Mushrooms and 60 Sporewoods. The last reward is one of Bottomwear HP 10%, Cape Accuracy 10% or 20 Elixirs.')}</p>${chain([10624, 10625, 10626])}</article>
<article class="fh-qblock"><h3><span class="fh-zone-lv">Lv 45</span>${tr('니로스의 망토 명중 퀘스트', 'Nyroth\'s cape accuracy line')} ${tag('data')}</h3>
<p>${tr('게임 데이터상 12월 9일에 열려요. 11월 18일에는 할 수 없어요. 첫 퀘스트에서 망토 명중 주문서(60% 또는 10%)가 무작위로 나와요.', 'The game data opens it on December 9, not November 18. The first quest gives a Cape Accuracy scroll, 60% or 10% at random.')}</p>${chain([10617, 10618, 10619, 10620])}</article>
<p class="fh-note">${tr('공지에 이름만 나온 퀘스트', 'Quests named in the notice')}: <span translate="no">${fh.officialQuests.map(esc).join(', ')}</span>. ${tr('내용은 패치노트가 나오면 채울게요.', 'Details once the patch notes are out.')} ${tag('pending')}</p>
</section>`;

  // ---------- boss ----------
  const boss = mobs.get(FH_BOSS_ID);
  const bossSec = `<section class="fh-sec wrap" id="boss">
<div class="fh-boss">
<div class="fh-boss-art"><img src="${mobSprite(boss)}" alt="${esc(mobName(boss))}" loading="lazy"></div>
<div class="fh-boss-copy">
<h2>${esc(mobName(boss))}</h2>
<p class="fh-lead">${esc(L(fh.boss.lead))} ${tag('official')}</p>
<dl class="fh-mob-stats fh-boss-stats"><div><dt>${tr('레벨', 'Level')}</dt><dd>60</dd></div><div><dt>HP</dt><dd>${n(boss.hp, lang)}</dd></div><div><dt>${tr('경험치', 'EXP')}</dt><dd>${n(boss.exp, lang)}</dd></div><div><dt>${tr('물리 방어', 'DEF')}</dt><dd>${boss.wdef}</dd></div><div><dt>${tr('마법 방어', 'M.DEF')}</dt><dd>${boss.mdef}</dd></div></dl>
<p class="fh-els">${elTags(boss)}</p>
<ul class="fh-facts">${fh.boss.facts.map((f) => `<li>${esc(L(f))} ${tag(f.state)}</li>`).join('')}</ul>
<h3 class="fh-sub">${tr('드롭', 'Drops')} ${tag('data')}</h3>
<div class="fh-drops fh-drops-big">${(boss.drops || []).map((d) => `<span><img src="${icon(d.itemId)}" alt="" width="28" height="28" loading="lazy"><span translate="no">${esc(withRate(ko ? d.ko : d.en))}</span></span>`).join('')}</div>
<p class="fh-hero-actions"><a class="btn" href="${mapHref(10006121)}">${tr('보스 맵 보기', 'See the boss map')}</a><a class="btn ghost" href="${calcHref(boss)}">${tr('몇 방 컷 계산', 'Hits to kill')}</a></p>
</div></div>
</section>`;

  // ---------- prepare, the rest of November, what is still unknown ----------
  const prep = `<section class="fh-sec wrap" id="prep">
<h2>${tr('열리기 전에 준비할 것', 'Before it opens')}</h2>
<ol class="fh-check">${fh.prep.map((p) => `<li>${esc(L(p))}</li>`).join('')}</ol>
</section>`;
  const november = `<section class="fh-sec wrap" id="november">
<h2>${tr('11월 업데이트에 함께 오는 것', 'Also in the November update')}</h2>
<ul class="fh-facts">${fh.november.map((x) => `<li>${esc(L(x))} ${tag(x.state)}</li>`).join('')}</ul>
<div class="fh-pending"><h3>${tr('아직 준비 중인 정보', 'Still to come')} ${tag('pending')}</h3><ul>${fh.pending.map((p) => `<li>${esc(L(p))}</li>`).join('')}</ul>
<p class="fh-note">${tr(`패치노트가 나오고 오픈하면 이 페이지를 바로 고쳐요. 마지막 정리: ${fh.updated}`, `We update this page as soon as the patch notes land. Last updated ${fh.updated}.`)}</p></div>
</section>`;

  return `<link rel="stylesheet" href="__FH_CSS__">
<div class="fh">${hero}${toc}${legend}${wayIn}${town}${zones}${monstersSec}${classes}${questsSec}${bossSec}${prep}${november}</div>`;
}
