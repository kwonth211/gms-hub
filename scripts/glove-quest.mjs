// The glove attack scroll quest guide (/quests/glove-attack/): every step of the Sauna Robe chain, Rowen's Cursed Dolls,
// Jane's challenges and Ronnie's new house. Conditions, kill counts, items and rewards come from the game client's quest
// data, so nothing is retyped; data/quest-guides/glove-attack.json adds where each NPC stands, the route between them and
// tips. Monster drop sources and spawn maps come from data/monsters.json. assets/quest-route.js turns the page into a
// quest log with progress, the island map and live free-market prices.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (id) => `https://maplestory.io/api/MCW/1/item/${id}/icon`;
const n = (v, lang) => Number(v).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');

export function gloveQuestData({ guide, raw, items, monsters }) {
  const quests = new Map(raw.quests.map((q) => [q.id, q]));
  const itemName = (id) => { const i = items.get(id); return { ko: i?.ko || i?.en || `#${id}`, en: i?.en || `#${id}` }; };
  const mobs = new Map(monsters.map((m) => [m.id, m]));
  // Where an item comes from: the monsters that drop it, each with its two busiest spawn maps.
  const droppers = (id) => monsters.filter((m) => (m.drops || []).some((d) => d.itemId === id))
    .sort((a, b) => Number(!!a.boss) - Number(!!b.boss) || a.lv - b.lv).slice(0, 4)
    .map((m) => ({ id: m.id, ko: m.ko, en: m.en, lv: m.lv, maps: topMaps(m) }));
  const topMaps = (m) => [...(m.locations || [])].sort((a, b) => b.count - a.count).slice(0, 2).map((l) => ({ id: l.id, ko: l.ko || l.en, en: l.en, count: l.count }));
  const chains = guide.chains.map((c) => ({
    ...c,
    steps: c.steps.map((s) => {
      const q = quests.get(s.q);
      if (!q) throw new Error(`glove quest guide: quest ${s.q} not in client data`);
      const start = q.requirementToStart || {}, done = q.requirementToComplete || {}, rw = q.rewardOnComplete || {};
      const kills = (done.mobs || []).map((k) => { const m = mobs.get(k.id); return { id: k.id, count: k.count, ko: m?.ko || `#${k.id}`, en: m?.en || `#${k.id}`, lv: m?.lv, maps: m ? topMaps(m) : [] }; });
      const startGives = new Set(((q.rewardOnStart || {}).items || []).filter((i) => i.count > 0).map((i) => i.id));
      const bring = (done.items || []).map((i) => ({ id: i.id, count: i.count, ...itemName(i.id), handed: startGives.has(i.id), from: startGives.has(i.id) ? [] : droppers(i.id) }));
      const gets = (rw.items || []).filter((i) => i.count > 0).map((i) => ({ id: i.id, count: i.count, ...itemName(i.id), job: i.job ?? null, gender: i.gender ?? null }));
      const pick = gets.some((g) => g.job != null) ? 'job' : gets.some((g) => g.gender != null) ? 'gender' : gets.length > 1 ? 'random' : 'all';
      return { ...s, id: q.id, name: q.name, lv: start.levelMinimum || null, startNpc: start.npcId, endNpc: done.npcId,
        npcStart: raw.npcs[String(start.npcId)] || null, npcEnd: raw.npcs[String(done.npcId)] || null,
        kills, bring, exp: rw.exp || 0, meso: rw.meso || 0, fame: rw.fame || 0, gets, pick,
        receive: [...startGives].map((id) => ({ id, ...itemName(id) })) };
    })
  }));
  const priceIds = [...new Set(chains.flatMap((c) => c.steps.flatMap((s) => [...s.bring.filter((b) => !b.handed).map((b) => b.id), ...s.gets.map((g) => g.id)])))];
  return { chains, priceIds };
}

const npcName = (p, lang) => (p ? (lang === 'ko' && p.ko ? `${p.ko} (${p.en})` : p.en) : '');

export function gloveQuestBody({ lang, guide, data, link, mobSprite, mobHref, pageHead, apiBase }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const L = (o) => (o ? o[ko ? 'ko' : 'en'] : '');
  const place = (id) => guide.places[id];
  const short = (c) => L(c.title).split(/ — | \(/)[0];
  const mapLink = (m) => `<a href="${link(`/maps/${m.id}/`)}">${esc(ko ? m.ko : m.en)}</a> <small>${m.count}${tr('마리', '')}</small>`;
  const all = data.chains.flatMap((c) => c.steps);
  const dolls = data.chains.find((c) => c.id === 'dolls');
  const totalKills = (ids) => all.filter((s) => ids.includes(s.id)).reduce((a, s) => a + s.kills.reduce((x, k) => x + k.count, 0), 0);
  const toScroll = all.filter((s) => s.id >= 10500 || (s.id >= 10201 && s.id <= 10204));
  const sum = (arr, k) => arr.reduce((a, s) => a + s[k], 0);

  const stepHtml = (s, i, chain) => {
    const kills = s.kills.map((k) => `<li class="gq-need gq-kill"><img src="${mobSprite({ id: k.id })}" alt="" width="40" height="40" loading="lazy"><div translate="no"><b><a href="${mobHref({ id: k.id, en: k.en })}">${esc(ko ? k.ko : k.en)}</a> ×${n(k.count, lang)}</b> <small>Lv ${k.lv}</small><span>${k.maps.map(mapLink).join(' · ')}</span></div></li>`).join('');
    const bring = s.bring.map((b) => `<li class="gq-need gq-item" data-item="${b.id}" data-qty="${b.count}"${b.handed ? ' data-handed="1"' : ''}><img src="${icon(b.id)}" alt="" width="32" height="32" loading="lazy"><div><b translate="no">${esc(ko ? b.ko : b.en)} ×${n(b.count, lang)}</b>${b.handed ? `<span>${tr('퀘스트를 받을 때 NPC가 줘요', 'Given by the NPC when you accept')}</span>` : b.from.length ? `<span translate="no">${b.from.map((m) => `<a href="${mobHref(m)}">${esc(ko ? m.ko : m.en)}</a> Lv${m.lv}${m.maps.length ? ` — ${m.maps.map(mapLink).join(', ')}` : ''}`).join('<br>')}</span>` : `<span>${tr('몬스터가 떨구지 않아요 — 자유시장 구매 또는 제작', 'No monster drops it — buy on the free market or craft it')}</span>`}<em class="gq-price" hidden></em></div></li>`).join('');
    const gets = s.gets.length ? `<div class="gq-gets"><span>${s.pick === 'random' ? tr('다음 중 하나 (무작위)', 'One of these, at random') : s.pick === 'job' ? tr('직업에 맞는 하나', 'The one for your class') : s.pick === 'gender' ? tr('성별에 따라 하나', 'One by gender') : ''}</span>${s.gets.map((g) => `<a class="gq-get" data-item="${g.id}" href="${link(`/tools/market/?item=${g.id}`)}"><img src="${icon(g.id)}" alt="" width="28" height="28" loading="lazy"><span>${esc(ko ? g.ko : g.en)}${g.count > 1 ? ` ×${g.count}` : ''}</span><em class="gq-price" hidden></em></a>`).join('')}</div>` : '';
    const at = place(s.at), go = s.go ? place(s.go) : null;
    return `<li class="gq-step${s.big ? ' gq-big' : ''}" id="q-${s.id}" data-q="${s.id}" data-at="${esc(s.at)}"${s.go ? ` data-go="${esc(s.go)}"` : ''} data-hunt="${esc((s.hunt || []).join(' '))}" data-exp="${s.exp}" data-meso="${s.meso}">
<div class="gq-step-head"><span class="gq-no">${i + 1}</span><div class="gq-title"><h3 translate="no">${esc(s.name)}</h3><small translate="no">${s.lv ? `Lv ${s.lv}+ · ` : ''}${esc(npcName(s.npcStart, lang))}${s.endNpc !== s.startNpc ? ` → ${esc(npcName(s.npcEnd, lang))}` : ''}</small></div><span class="gq-state"><span class="gq-st-done">${tr('완료', 'Complete')}</span><span class="gq-st-now">${tr('진행 중', 'In progress')}</span></span><label class="gq-done"><input type="checkbox" data-done="${s.id}"><span>${tr('완료', 'Done')}</span></label></div>
<div class="gq-step-body">
<div class="gq-where"><div class="gq-lbl">${tr('어디서', 'Where')}</div><div><div translate="no">${esc(L(at))}</div>${s.where ? `<div>${esc(L(s.where))}</div>` : ''}</div>${go ? `<div class="gq-lbl">${tr('다음 목적지', 'Next stop')}</div><div translate="no">${esc(L(go))}</div>` : ''}</div>
<p class="gq-do">${esc(L(s.do))}</p>
${s.receive.length ? `<p class="gq-receive"><span>${tr('받는 물건', 'You receive')}</span> <span translate="no">${s.receive.map((r) => `<img src="${icon(r.id)}" alt="" width="22" height="22" loading="lazy"> ${esc(ko ? r.ko : r.en)}`).join(', ')}</span></p>` : ''}
${kills || bring ? `<ul class="gq-needs">${kills}${bring}</ul>` : ''}
<div class="gq-reward"><b>${tr('보상', 'Reward')}</b> <span translate="no">EXP ${n(s.exp, lang)}</span>${s.meso ? `<span>${n(s.meso, lang)} ${tr('메소', 'mesos')}</span>` : ''}${s.fame ? `<span><span>${tr('인기도', 'Fame')}</span> <span translate="no">+${s.fame}</span></span>` : ''}${gets}</div>
${s.tip ? `<p class="gq-tip">${esc(L(s.tip))}</p>` : ''}
</div></li>`;
  };

  // An illustrated Victoria Island: sea, coastline, a colour per region with a few landmarks, and the roads between
  // towns. Art is drawn in the 600x340 space of the place coordinates and scaled up; labels sit outside the scaling.
  const SX = 1000 / 600, SY = 560 / 340;
  const towns = ['sleepywood', 'ellinia', 'henesys', 'lith', 'perion', 'kerning'];
  const trees = (pts) => pts.map(([x, y]) => `<path class="gq-tree" d="M${x} ${y - 9} l6 10 h-4 l5 8 h-14 l5 -8 h-4 z"/>`).join('');
  const peaks = (pts) => pts.map(([x, y]) => `<path class="gq-peak" d="M${x - 12} ${y + 8} L${x} ${y - 10} L${x + 12} ${y + 8} Z"/>`).join('');
  const blocks = (pts) => pts.map(([x, y, h]) => `<rect class="gq-bldg" x="${x}" y="${y - h}" width="9" height="${h}" rx="1"/>`).join('');
  const svg = `<svg class="gq-svg" viewBox="0 0 1000 560" role="img" aria-label="${tr('빅토리아 아일랜드 동선', 'Victoria Island route')}">
<defs><pattern id="gq-waves" width="40" height="20" patternUnits="userSpaceOnUse"><path d="M0 10 q10 -6 20 0 t20 0" class="gq-wave"/></pattern>
<marker id="gq-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="gq-arrowhead"/></marker></defs>
<rect class="gq-sea" width="1000" height="560"/><rect width="1000" height="560" fill="url(#gq-waves)"/>
<g transform="scale(${SX.toFixed(4)} ${SY.toFixed(4)})">
<path class="gq-coast" d="M40 120 C30 60 120 10 220 14 C320 8 420 20 520 30 C580 50 590 130 560 200 C540 270 470 300 380 304 C300 330 200 336 120 326 C60 318 30 270 36 210 C38 170 46 150 40 120 Z"/>
<path class="gq-land" d="M40 120 C30 60 120 10 220 14 C320 8 420 20 520 30 C580 50 590 130 560 200 C540 270 470 300 380 304 C300 330 200 336 120 326 C60 318 30 270 36 210 C38 170 46 150 40 120 Z"/>
<ellipse class="gq-r-forest" cx="170" cy="85" rx="140" ry="70"/>
<ellipse class="gq-r-rock" cx="470" cy="80" rx="105" ry="62"/>
<ellipse class="gq-r-swamp" cx="345" cy="245" rx="85" ry="55"/>
<ellipse class="gq-r-city" cx="490" cy="235" rx="70" ry="52"/>
<ellipse class="gq-r-field" cx="140" cy="240" rx="95" ry="55"/>
<ellipse class="gq-r-beach" cx="112" cy="316" rx="62" ry="18"/>
<path class="gq-road" d="M118 318 C130 280 140 260 150 232 C160 180 168 130 175 95 M150 232 C220 230 280 220 330 215 C390 215 440 230 480 240 M175 95 C260 70 360 70 440 85 M330 215 C360 160 400 120 440 85 M175 95 C185 70 195 48 205 32 M175 95 C140 110 110 125 92 140"/>
${trees([[120, 60], [140, 45], [205, 60], [235, 80], [110, 100], [255, 50], [65, 110], [85, 160], [300, 255], [370, 270], [330, 275]])}
${peaks([[420, 60], [450, 45], [500, 55], [530, 75], [475, 110], [560, 50]])}
${blocks([[465, 245, 22], [478, 245, 30], [491, 245, 18], [504, 245, 26], [517, 245, 14]])}
</g>
<g id="gq-trail"></g>
${Object.entries(guide.places).map(([id, p]) => `<g class="gq-place${towns.includes(id) ? ' gq-town' : ''}" data-place="${id}" transform="translate(${(p.x * SX).toFixed(1)} ${(p.y * SY).toFixed(1)})"><circle r="${towns.includes(id) ? 13 : 9}"/><g class="gq-bang"><path d="M-11 -48 h22 a6 6 0 0 1 6 6 v18 a6 6 0 0 1 -6 6 h-6 l-5 7 l-5 -7 h-6 a6 6 0 0 1 -6 -6 v-18 a6 6 0 0 1 6 -6 z"/><text y="-26">!</text></g><path class="gq-check" d="M-6 0 l4 4 l8 -9"/><text class="gq-label" y="${towns.includes(id) ? 30 : 25}" translate="no">${esc(ko ? p.ko.split(' · ')[0].replace(/^슬리피우드 호텔 /, '') : p.en.split(' · ')[0])}</text></g>`).join('')}
</svg>`;

  const parts = data.chains.map((c) => `<section class="gq-chain" id="chain-${c.id}"><h2>${esc(L(c.title))}</h2><p class="lead">${esc(L(c.lead))}</p><ol class="gq-steps">${c.steps.map((s, i) => stepHtml(s, i, c)).join('')}</ol></section>`).join('');
  const diamond = `<section class="panel gq-diamond" id="diamond"><h2><img src="${icon(4020107)}" alt="" width="28" height="28"> ${tr('다이아몬드 구하기', 'Getting a Diamond')} <em class="gq-price" data-item="4020107" hidden></em></h2><ol>${(ko ? guide.diamond.ko : guide.diamond.en).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>`;

  // Every material and kill in one place: a tab per part, one for everything up to Rowen's 150-doll scroll, and one for
  // all of it. Each row says how many, where it comes from, today's price and what buying them all would cost; rows can
  // be ticked off as collected (kept in this browser by assets/quest-route.js).
  const shopping = (() => {
    const sum = (steps) => {
      const items = new Map(), kills = new Map();
      for (const s of steps) {
        for (const b of s.bring) if (!b.handed) items.set(b.id, { ...b, count: (items.get(b.id)?.count || 0) + b.count });
        for (const k of s.kills) kills.set(k.id, { ...k, count: (kills.get(k.id)?.count || 0) + k.count });
      }
      return { items: [...items.values()], kills: [...kills.values()] };
    };
    const tabs = [
      { id: 'scroll', label: tr('장공(150개)까지', 'Up to the scroll (150)'), steps: toScroll },
      ...data.chains.map((c) => ({ id: c.id, label: short(c), steps: c.steps })),
      { id: 'all', label: tr('전체', 'Everything'), steps: all }
    ];
    const table = (t) => {
      const { items, kills } = sum(t.steps);
      const killRows = kills.map((k) => `<tr class="gq-kill-row"><td><img src="${mobSprite({ id: k.id })}" alt="" width="28" height="28" loading="lazy"> <span translate="no">${esc(ko ? k.ko : k.en)}</span> <small>Lv ${k.lv}</small></td><td><b>${n(k.count, lang)}</b> ${tr('마리', 'kills')}</td><td translate="no">${k.maps.map(mapLink).join('<br>')}</td><td></td><td></td><td></td></tr>`).join('');
      const itemRows = items.map((b) => `<tr data-item="${b.id}" data-qty="${b.count}"><td><img src="${icon(b.id)}" alt="" width="26" height="26" loading="lazy"> <span translate="no">${esc(ko ? b.ko : b.en)}</span></td><td><b>${n(b.count, lang)}</b></td><td translate="no">${b.from.length ? b.from.map((m) => `<a href="${mobHref(m)}">${esc(ko ? m.ko : m.en)}</a>${m.maps[0] ? ` — ${mapLink(m.maps[0])}` : ''}`).join('<br>') : `<span class="muted">${tr('드랍 없음 · 구매/제작', 'No drop · buy or craft')}</span>`}</td><td class="gq-unit">—</td><td class="gq-total">—</td><td><input type="checkbox" class="gq-have" data-have="${b.id}" aria-label="${tr('모음', 'Collected')}"></td></tr>`).join('');
      return `<div class="gq-mat-pane" data-pane="${t.id}"${t.id === 'scroll' ? '' : ' hidden'}><div class="gq-mat-scroll"><table class="gq-shop-table"><thead><tr><th>${tr('재료 / 몬스터', 'Item / monster')}</th><th>${tr('개수', 'Qty')}</th><th>${tr('어디서', 'Where')}</th><th>${tr('지금 시세', 'Price now')}</th><th>${tr('다 사면', 'If bought')}</th><th>${tr('모음', 'Got')}</th></tr></thead><tbody>${itemRows}${killRows}</tbody>
<tfoot><tr><td colspan="4">${tr('재료를 전부 사면 (처치 수는 직접)', 'Buying every item (kills are on you)')}</td><td class="gq-shop-sum">—</td><td></td></tr></tfoot></table></div></div>`;
    };
    return `<section class="panel gq-mats" id="materials"><div class="gq-mats-head"><h2>${tr('재료·처치 총정리', 'All materials and kills')}</h2><div class="gq-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" class="gq-tab${t.id === 'scroll' ? ' is-on' : ''}" data-tab="${t.id}" aria-selected="${t.id === 'scroll'}">${esc(t.label)}</button>`).join('')}</div></div>
${tabs.map(table).join('')}
<p class="muted small">${tr('시세는 이 사이트의 자유시장 매물 중간값이에요. 다 모은 재료는 오른쪽 칸에 체크해 두면 이 브라우저에 남아요.', 'Prices are this site\'s free-market listing medians. Tick what you have collected; it stays in this browser.')}</p></section>`;
  })();

  const head = pageHead(lang, 'scroll', tr('글클메 장공 퀘스트 완전 공략', 'Gloves Attack Scroll Quests: Complete Guide'),
    tr('사우나 가운(비밀의 책) 9단계 → 요정 로웬의 저주받은 인형 5단계 → 제인의 도전까지. 누구에게 무엇을 어디서 가져가는지, 동선과 지금 시세까지 한 번에. 진행한 단계는 체크해 두면 이 브라우저에 남아요.',
      'The Sauna Robe chain (9 steps) → Rowen the Fairy\'s Cursed Dolls (5) → Jane\'s challenges: who wants what, where it drops, the route and today\'s prices. Tick steps as you go; your progress stays in this browser.'));

  const summary = `<section class="gq-hud panel" id="gq-hud">
<div class="gq-hud-stats">
<div><span>${tr('장공까지 단계', 'Steps to the scroll')}</span><b>${toScroll.length}</b></div>
<div><span>${tr('장공까지 경험치', 'EXP to the scroll')}</span><b>${n(sum(toScroll, 'exp'), lang)}</b></div>
<div><span>${tr('장공까지 처치', 'Kills to the scroll')}</span><b>${n(totalKills(toScroll.map((s) => s.id)), lang)}</b></div>
<div class="gq-ev"><span>${tr('150개 보상 기대값', '150-doll reward, expected')}</span><b id="gq-ev">—</b><small id="gq-ev-note"></small></div>
</div>
<div class="gq-progress"><a class="btn ghost small-btn" href="#materials">${tr('재료 총정리', 'All materials')}</a><div class="gq-bar"><i id="gq-bar"></i></div><span id="gq-progress-text">${tr('체크한 단계가 없어요', 'No steps ticked yet')}</span></div>
</section>`;

  // The quest list on the left: every step by part, with its number, name and NPC; picking one shows it on the right.
  const list = `<aside class="gq-list panel" aria-label="${tr('퀘스트 목록', 'Quest list')}">${data.chains.map((c) => `<div class="gq-list-group"><h4>${esc(short(c))}</h4><ol>${c.steps.map((s, i) => `<li><button type="button" class="gq-pick" data-pick="${s.id}"><span class="gq-pick-no">${i + 1}</span><span class="gq-pick-name"><b translate="no">${esc(s.name)}</b><small translate="no">${esc(npcName(s.npcStart, lang))}${s.lv ? ` · Lv ${s.lv}` : ''}</small></span>${s.big ? '<span class="gq-pick-star" aria-hidden="true">★</span>' : ''}</button></li>`).join('')}</ol></div>`).join('')}</aside>`;
  // The route as a one-way road: one stop per step of the picked part, drawn by assets/quest-route.js.
  const now = `<section class="gq-world panel" id="gq-world"><div class="gq-road-head"><strong id="gq-road-title"></strong><div class="gq-now-actions"><button type="button" class="btn ghost small-btn" id="gq-prev">${tr('이전', 'Back')}</button><button type="button" class="btn small-btn" id="gq-next">${tr('완료하고 다음', 'Done, next')}</button></div></div>
<div class="gq-road-scroll"><ol class="gq-road" id="gq-road"></ol></div></section>`;

  const sources = `<section class="gq-sources"><h2>${tr('정리에 쓴 자료', 'Sources')}</h2><p class="muted small">${tr('퀘스트 조건·처치 수·보상은 게임 클라이언트 데이터에서 그대로 가져왔고, NPC 위치·가는 길·팁은 아래 공략을 교차 확인했어요.', 'Conditions, kill counts and rewards are read straight from the game client data; NPC spots, routes and tips were cross-checked against these guides.')}</p><ul>${guide.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener" translate="no">${esc(s.name)}</a> <small>${esc(s.date)}</small></li>`).join('')}</ul></section>`;

  return `${head}<div class="wrap gq-page">${summary}<div class="gq-cols">${list}<div class="gq-right">${now}<div class="gq-main">${parts}</div></div></div>${shopping}${diamond}${sources}</div>
<script id="gq-data" type="application/json">${JSON.stringify({ lang, api: apiBase, places: guide.places, sx: 1000 / 600, sy: 560 / 340, prices: data.priceIds, ev: { a: 2040801, m: 2040805 },
    chains: data.chains.map((c) => ({ id: c.id, title: L(c.title).split(/ — /)[0], steps: c.steps.map((s) => s.id) })),
    steps: all.map((s) => ({ id: s.id, name: s.name, at: s.at, go: s.go || null, hunt: s.hunt || [], exp: s.exp, do: L(s.do),
      npc: npcName(s.npcStart, lang), end: s.endNpc !== s.startNpc ? npcName(s.npcEnd, lang) : '',
      need: [...s.kills.map((k) => `${ko ? k.ko : k.en} ×${k.count}`), ...s.bring.filter((b) => !b.handed).map((b) => `${ko ? b.ko : b.en} ×${b.count}`)],
      big: !!s.big })),
    t: { kill: tr('처치', 'kill'), hunt: tr('사냥터', 'Hunt'), talk: tr('대화', 'Talk to'), here: tr('지금', 'Now'), none: tr('체크한 단계가 없어요', 'No steps ticked yet'), prog: tr('{d}/{n}단계 · 경험치 {e}', '{d} of {n} steps · {e} EXP'), all: tr('모든 단계를 끝냈어요!', 'Every step is done!'), ev: tr('장공 {a} · 장마 {m} 반반', 'Attack {a} · Magic {m}, 50:50'), mesos: tr('메소', 'mesos') } }).replace(/</g, '\\u003c')}</script>`;
}
