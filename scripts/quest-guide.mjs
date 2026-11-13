// Quest guides (/quests/<slug>/), one per data/quest-guides/<slug>.json: the glove attack scroll quests first, then the
// other quest lines worth doing. Conditions, kill counts, items and rewards come from the game client's quest data, so
// nothing is retyped; the guide file adds where each NPC stands, the route between them, tips, optional reward routes and
// extra notes. Monster drop sources and spawn maps come from data/monsters.json. assets/quest-route.js turns each page into
// a quest log with progress, the road of stops and live free-market prices.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (id) => `https://maplestory.io/api/MCW/1/item/${id}/icon`;
// NPC standing images from the same source as the item icons (the quest data's NPC ids are the game's).
const npcImg = (id) => `https://maplestory.io/api/MCW/1/npc/${id}/icon`;
const n = (v, lang) => Number(v).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');

export function questGuideData({ guide, raw, items, monsters }) {
  const quests = new Map(raw.quests.map((q) => [q.id, q]));
  const itemName = (id) => { const o = guide.itemNames?.[id]; if (o) return { ko: o.ko, en: o.en }; const i = items.get(id); return { ko: i?.ko || i?.en || `#${id}`, en: i?.en || `#${id}` }; };
  const mobs = new Map(monsters.map((m) => [m.id, m]));
  // Where an item comes from: the monsters that drop it, each with its two busiest spawn maps.
  const droppers = (id) => monsters.filter((m) => (m.drops || []).some((d) => d.itemId === id))
    .sort((a, b) => Number(!!a.boss) - Number(!!b.boss) || a.lv - b.lv).slice(0, 4)
    .map((m) => ({ id: m.id, ko: m.ko, en: m.en, lv: m.lv, maps: topMaps(m) }));
  const topMaps = (m) => [...(m.locations || [])].sort((a, b) => b.count - a.count).slice(0, 2).map((l) => ({ id: l.id, ko: l.ko || l.en, en: l.en, count: l.count }));
  const npc = (id) => { const r = raw.npcs[String(id)]; return r ? { ...r, ko: r.ko || guide.npcs?.[String(id)] || null } : null; };
  const chains = guide.chains.map((c) => ({
    ...c,
    steps: c.steps.map((s) => {
      const q = quests.get(s.q);
      if (!q) throw new Error(`quest guide ${guide.slug}: quest ${s.q} not in client data`);
      const start = q.requirementToStart || {}, done = q.requirementToComplete || {}, rw = q.rewardOnComplete || {};
      const kills = (done.mobs || []).map((k) => { const m = mobs.get(k.id); const o = guide.mobNames?.[k.id]; return { id: k.id, count: k.count, ko: o?.ko || m?.ko || `#${k.id}`, en: o?.en || m?.en || `#${k.id}`, lv: m?.lv, maps: m ? topMaps(m) : [], known: !!m }; });
      const startGives = new Set(((q.rewardOnStart || {}).items || []).filter((i) => i.count > 0).map((i) => i.id));
      const bring = (done.items || []).map((i) => ({ id: i.id, count: i.count, ...itemName(i.id), note: guide.itemNotes?.[i.id] || null, handed: startGives.has(i.id), from: startGives.has(i.id) ? [] : droppers(i.id) }));
      const gets = (rw.items || []).filter((i) => i.count > 0).map((i) => ({ id: i.id, count: i.count, ...itemName(i.id), job: i.job ?? null, gender: i.gender ?? null }));
      // The client marks some single rewards with a gender flag; only differing flags mean "one by gender".
      const pick = gets.some((g) => g.job != null) ? 'job' : new Set(gets.map((g) => String(g.gender))).size > 1 ? 'gender' 
        // No random flag in the data: several rewards of the same count are one pick (Arwen 1/1, Rowen's ores 7/7);
        // different counts (Shumi's return scrolls 5/3/3, potions plus scrolls) are all given.
        : gets.length > 1 && new Set(gets.map((g) => g.count)).size === 1 ? 'random' : 'all';
      return { ...s, pick: s.pick || pick, id: q.id, name: q.name, lv: start.levelMinimum || null, startNpc: start.npcId, endNpc: done.npcId,
        npcStart: npc(start.npcId), npcEnd: npc(done.npcId),
        kills, bring, exp: rw.exp || 0, meso: rw.meso || 0, fame: rw.fame || 0, gets,
        receive: [...startGives].map((id) => ({ id, ...itemName(id) })) };
    })
  }));
  const priceIds = [...new Set([...(guide.extras || []).map((x) => x.item).filter(Boolean), ...(guide.routes || []).flatMap((r) => r.ev || []), ...(guide.ev || []), ...chains.flatMap((c) => c.steps.flatMap((s) => [...s.bring.filter((b) => !b.handed).map((b) => b.id), ...s.gets.map((g) => g.id)]))])];
  return { chains, priceIds };
}

const npcName = (p, lang) => (p ? (lang === 'ko' && p.ko ? `${p.ko} (${p.en})` : p.en) : '');

export function questGuideBody({ lang, guide, data, link, mobSprite, mobHref, pageHead, apiBase }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const L = (o) => (o ? o[ko ? 'ko' : 'en'] : '');
  const place = (id) => guide.places[id];
  const short = (c) => L(c.title).split(/ — /)[0];
  const mapLink = (m) => `<a href="${link(`/maps/${m.id}/`)}">${esc(ko ? m.ko : m.en)}</a> <small>${m.count}${tr('마리', '')}</small>`;
  const all = data.chains.flatMap((c) => c.steps);
  const sum = (arr, k) => arr.reduce((a, s) => a + s[k], 0);
  const routes = guide.routes || [{ id: 'all', name: guide.title, reward: guide.reward, ev: guide.ev || [] }];
  const routeSteps = (r) => {
    const steps = r.id === 'all' ? all : data.chains.filter((c) => c.route === r.id).flatMap((c) => c.steps);
    return r.until ? steps.slice(0, steps.findIndex((s) => s.id === r.until) + 1) : steps;
  };

  const stepHtml = (s, i, chain) => {
    const kills = s.kills.map((k) => k.known ? `<li class="gq-need gq-kill"><img src="${mobSprite({ id: k.id })}" alt="" width="40" height="40" loading="lazy"><div translate="no"><b><a href="${mobHref({ id: k.id, en: k.en })}">${esc(ko ? k.ko : k.en)}</a> ×${n(k.count, lang)}</b> <small>Lv ${k.lv}</small><span>${k.maps.map(mapLink).join(' · ')}</span></div></li>` : `<li class="gq-need gq-kill"><div><b translate="no">${esc(ko ? k.ko : k.en)} ×${n(k.count, lang)}</b></div></li>`).join('');
    const bring = s.bring.map((b) => `<li class="gq-need gq-item" data-item="${b.id}" data-qty="${b.count}"${b.handed ? ' data-handed="1"' : ''}><img src="${icon(b.id)}" alt="" width="32" height="32" loading="lazy"><div><b translate="no">${esc(ko ? b.ko : b.en)} ×${n(b.count, lang)}</b>${b.handed ? `<span>${tr('퀘스트를 받을 때 NPC가 줘요', 'Given by the NPC when you accept')}</span>` : b.note ? `<span>${esc(L(b.note))}</span>` : b.from.length ? `<span translate="no">${b.from.map((m) => `<a href="${mobHref(m)}">${esc(ko ? m.ko : m.en)}</a> Lv${m.lv}${m.maps.length ? ` — ${m.maps.map(mapLink).join(', ')}` : ''}`).join('<br>')}</span>` : `<span>${tr('몬스터가 떨구지 않아요 — 자유시장 구매 또는 제작', 'No monster drops it — buy on the free market or craft it')}</span>`}<em class="gq-price" hidden></em></div></li>`).join('');
    const gets = s.gets.length ? `<div class="gq-gets"><span>${s.pick === 'choose' ? tr('다음 중 하나를 골라요', 'Pick one of these') : s.pick === 'random' ? tr('다음 중 하나 (무작위)', 'One of these, at random') : s.pick === 'job' ? tr('직업에 맞는 하나', 'The one for your class') : s.pick === 'gender' ? tr('성별에 따라 하나', 'One by gender') : ''}</span>${s.gets.map((g) => `<a class="gq-get" data-item="${g.id}" href="${link(`/tools/market/?item=${g.id}`)}"><img src="${icon(g.id)}" alt="" width="28" height="28" loading="lazy"><span>${esc(ko ? g.ko : g.en)}${g.count > 1 ? ` ×${g.count}` : ''}</span><em class="gq-price" hidden></em></a>`).join('')}</div>` : '';
    const at = place(s.at), go = s.go ? place(s.go) : null;
    return `<li class="gq-step${s.big ? ' gq-big' : ''}" id="q-${s.id}" data-q="${s.id}" data-at="${esc(s.at)}"${s.go ? ` data-go="${esc(s.go)}"` : ''} data-hunt="${esc((s.hunt || []).join(' '))}" data-exp="${s.exp}" data-meso="${s.meso}">
<div class="gq-step-head"><span class="gq-no">${i + 1}</span><span class="gq-npcs"><img src="${npcImg(s.startNpc)}" alt="${esc(npcName(s.npcStart, lang))}" loading="lazy">${s.endNpc !== s.startNpc ? `<i aria-hidden="true">→</i><img src="${npcImg(s.endNpc)}" alt="${esc(npcName(s.npcEnd, lang))}" loading="lazy">` : ''}</span><div class="gq-title"><h3 translate="no">${esc(s.name)}</h3><small translate="no">${s.lv ? `Lv ${s.lv}+ · ` : ''}${esc(npcName(s.npcStart, lang))}${s.endNpc !== s.startNpc ? ` → ${esc(npcName(s.npcEnd, lang))}` : ''}</small></div><span class="gq-state"><span class="gq-st-done">${tr('완료', 'Complete')}</span><span class="gq-st-now">${tr('진행 중', 'In progress')}</span></span><label class="gq-done"><input type="checkbox" data-done="${s.id}"><span>${tr('완료', 'Done')}</span></label></div>
<div class="gq-step-body">
<div class="gq-where"><div class="gq-lbl">${tr('어디서', 'Where')}</div><div><div translate="no">${esc(L(at))}</div>${s.where ? `<div>${esc(L(s.where))}</div>` : ''}</div>${go ? `<div class="gq-lbl">${tr('다음 목적지', 'Next stop')}</div><div translate="no">${esc(L(go))}</div>` : ''}</div>
${s.path ? `<ol class="gq-path" aria-label="${tr('가는 길', 'Route')}" translate="no">${L(s.path).map((m) => `<li>${esc(m)}</li>`).join('')}</ol>` : ''}
<p class="gq-do">${esc(L(s.do))}</p>
${s.warn ? `<p class="gq-warn">${esc(L(s.warn))}</p>` : ''}
${s.receive.length ? `<p class="gq-receive"><span>${tr('받는 물건', 'You receive')}</span> <span translate="no">${s.receive.map((r) => `<img src="${icon(r.id)}" alt="" width="22" height="22" loading="lazy"> ${esc(ko ? r.ko : r.en)}`).join(', ')}</span></p>` : ''}
${kills || bring ? `<ul class="gq-needs">${kills}${bring}</ul>` : ''}
<div class="gq-reward"><b>${tr('보상', 'Reward')}</b> <span translate="no">EXP ${n(s.exp, lang)}</span>${s.meso ? `<span>${n(s.meso, lang)} ${tr('메소', 'mesos')}</span>` : ''}${s.fame ? `<span><span>${tr('인기도', 'Fame')}</span> <span translate="no">+${s.fame}</span></span>` : ''}${gets}</div>
${[s.tip, ...(s.tips || [])].filter(Boolean).map((t) => `<p class="gq-tip">${esc(L(t))}</p>`).join('')}
${s.videos?.length ? `<p class="gq-videos"><span>${tr('영상으로 보기', 'Watch it')}</span> ${s.videos.map((v) => `<a href="${esc(v.url)}" target="_blank" rel="noopener" translate="no">${esc(v.name)}</a>`).join(' ')}</p>` : ''}
</div></li>`;
  };

  const parts = data.chains.map((c) => `<section class="gq-chain" id="chain-${c.id}"><h2>${esc(L(c.title))}</h2><p class="lead">${esc(L(c.lead))}</p>${c.notes ? `<ul class="gq-notes">${L(c.notes).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}<ol class="gq-steps">${c.steps.map((s, i) => stepHtml(s, i, c)).join('')}</ol></section>`).join('');
  // Extra notes that several steps lean on (where to get a Diamond, and so on), each headed by an item and its price.
  const extras = (guide.extras || []).map((x) => `<section class="panel gq-diamond" id="${esc(x.id)}"><h2>${x.item ? `<img src="${icon(x.item)}" alt="" width="28" height="28"> ` : ''}${esc(L(x.title))}${x.item ? ` <em class="gq-price" data-item="${x.item}" hidden></em>` : ''}</h2><ol>${L(x.list).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>`).join('');

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
      ...(guide.routes || []).map((r) => ({ id: `r-${r.id}`, label: L(r.tab || r.name), steps: routeSteps(r) })),
      ...data.chains.map((c) => ({ id: c.id, label: short(c), steps: c.steps })),
      ...(data.chains.length > 1 ? [{ id: 'all', label: tr('전체', 'Everything'), steps: all }] : [])
    ].filter((t, i, arr) => arr.findIndex((u) => u.steps.map((s) => s.id).join() === t.steps.map((s) => s.id).join()) === i);
    const first = tabs[0].id;
    const table = (t) => {
      const { items, kills } = sum(t.steps);
      const killRows = kills.map((k) => `<tr class="gq-kill-row"><td>${k.known ? `<img src="${mobSprite({ id: k.id })}" alt="" width="28" height="28" loading="lazy"> ` : ''}<span translate="no">${esc(ko ? k.ko : k.en)}</span>${k.lv ? ` <small>Lv ${k.lv}</small>` : ''}</td><td><b>${n(k.count, lang)}</b> ${tr('마리', 'kills')}</td><td translate="no">${k.maps.map(mapLink).join('<br>')}</td><td></td><td></td><td></td></tr>`).join('');
      const itemRows = items.map((b) => `<tr data-item="${b.id}" data-qty="${b.count}"><td><img src="${icon(b.id)}" alt="" width="26" height="26" loading="lazy"> <span translate="no">${esc(ko ? b.ko : b.en)}</span></td><td><b>${n(b.count, lang)}</b></td><td translate="no">${b.note ? `<span>${esc(L(b.note))}</span>` : b.from.length ? b.from.map((m) => `<a href="${mobHref(m)}">${esc(ko ? m.ko : m.en)}</a>${m.maps[0] ? ` — ${mapLink(m.maps[0])}` : ''}`).join('<br>') : `<span class="muted">${tr('드랍 없음 · 구매/제작', 'No drop · buy or craft')}</span>`}</td><td class="gq-unit">—</td><td class="gq-total">—</td><td><input type="checkbox" class="gq-have" data-have="${b.id}" aria-label="${tr('모음', 'Collected')}"></td></tr>`).join('');
      return `<div class="gq-mat-pane" data-pane="${t.id}"${t.id === first ? '' : ' hidden'}><div class="gq-mat-scroll"><table class="gq-shop-table"><thead><tr><th>${tr('재료 / 몬스터', 'Item / monster')}</th><th>${tr('개수', 'Qty')}</th><th>${tr('어디서', 'Where')}</th><th>${tr('지금 시세', 'Price now')}</th><th>${tr('다 사면', 'If bought')}</th><th>${tr('모음', 'Got')}</th></tr></thead><tbody>${itemRows}${killRows}</tbody>
<tfoot><tr><td colspan="4">${tr('재료를 전부 사면 (처치 수는 직접)', 'Buying every item (kills are on you)')}</td><td class="gq-shop-sum">—</td><td></td></tr></tfoot></table></div></div>`;
    };
    if (!all.some((s) => s.kills.length || s.bring.some((b) => !b.handed))) return '';
    return `<section class="panel gq-mats" id="materials"><div class="gq-mats-head"><h2>${tr('재료·처치 총정리', 'All materials and kills')}</h2><div class="gq-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" class="gq-tab${t.id === first ? ' is-on' : ''}" data-tab="${t.id}" aria-selected="${t.id === first}">${esc(t.label)}</button>`).join('')}</div></div>
${tabs.map(table).join('')}
<p class="muted small">${tr('시세는 이 사이트의 자유시장 매물 중간값이에요. 다 모은 재료는 오른쪽 칸에 체크해 두면 이 브라우저에 남아요.', 'Prices are this site\'s free-market listing medians. Tick what you have collected; it stays in this browser.')}</p></section>`;
  })();

  const head = pageHead(lang, guide.icon || 'scroll', L(guide.h1), L(guide.lead));

  // One card per glove-scroll route: the two routes are separate quest lines with their own reward.
  const routeCard = (r) => {
    const upto = routeSteps(r);
    const lvs = upto.map((s) => s.lv).filter(Boolean);
    const kills = upto.reduce((a, s) => a + s.kills.reduce((x, k) => x + k.count, 0), 0);
    return `<div class="gq-route-card" data-route="${r.id}"><h3>${esc(L(r.name))}</h3><p>${esc(L(r.reward))}</p>
<dl><div><dt>${tr('단계', 'Steps')}</dt><dd>${upto.length}</dd></div><div><dt>${tr('레벨', 'Level')}</dt><dd>${Math.min(...lvs)}→${Math.max(...lvs)}</dd></div><div><dt>${tr('처치', 'Kills')}</dt><dd>${n(kills, lang)}</dd></div><div><dt>${tr('경험치', 'EXP')}</dt><dd>${n(sum(upto, 'exp'), lang)}</dd></div>${r.ev?.length ? `<div class="gq-ev"><dt>${r.ev.length > 1 ? tr('보상 기대값', 'Reward, expected') : tr('보상 시세', 'Reward price')}</dt><dd data-ev="${r.ev.join(',')}">—</dd></div>` : ''}</dl>
<button type="button" class="btn small-btn gq-go-route" data-pick="${upto[0].id}">${tr('이 루트 보기', 'Show this route')}</button></div>`;
  };
  const summary = `<section class="gq-hud panel" id="gq-hud"><div class="gq-routes">${routes.map(routeCard).join('')}</div>
<div class="gq-progress"><a class="btn ghost small-btn" href="#materials">${tr('재료 총정리', 'All materials')}</a><div class="gq-bar"><i id="gq-bar"></i></div><span id="gq-progress-text">${tr('체크한 단계가 없어요', 'No steps ticked yet')}</span></div>
</section>`;

  // The quest list on the left: every step by part, with its number, name and NPC; picking one shows it on the right.
  const list = `<aside class="gq-list panel" aria-label="${tr('퀘스트 목록', 'Quest list')}">${data.chains.map((c) => `<div class="gq-list-group gq-route-${c.route}"><h4>${esc(short(c))}</h4><ol>${c.steps.map((s, i) => `<li><button type="button" class="gq-pick" data-pick="${s.id}"><span class="gq-pick-no">${i + 1}</span><img class="gq-pick-npc" src="${npcImg(s.startNpc)}" alt="" width="30" height="36" loading="lazy"><span class="gq-pick-name"><b translate="no">${esc(s.name)}</b><small translate="no">${esc(npcName(s.npcStart, lang))}${s.lv ? ` · Lv ${s.lv}` : ''}</small></span>${s.big ? '<span class="gq-pick-star" aria-hidden="true">★</span>' : ''}</button></li>`).join('')}</ol></div>`).join('')}</aside>`;
  // The route as a one-way road: one stop per step of the picked part, drawn by assets/quest-route.js.
  const now = `<section class="gq-world panel" id="gq-world"><div class="gq-road-head"><strong id="gq-road-title"></strong><div class="gq-now-actions"><button type="button" class="btn ghost small-btn" id="gq-prev">${tr('이전', 'Back')}</button><button type="button" class="btn small-btn" id="gq-next">${tr('완료하고 다음', 'Done, next')}</button></div></div>
<div class="gq-road-scroll"><ol class="gq-road" id="gq-road"></ol></div></section>`;

  const sources = `<section class="gq-sources"><h2>${tr('정리에 쓴 자료', 'Sources')}</h2><p class="muted small">${tr('퀘스트 조건·처치 수·보상은 게임 클라이언트 데이터에서 그대로 가져왔고, NPC 위치·가는 길·팁은 아래 공략을 교차 확인했어요.', 'Conditions, kill counts and rewards are read straight from the game client data; NPC spots, routes and tips were cross-checked against these guides.')}</p><ul>${guide.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener" translate="no">${esc(s.name)}</a> <small>${esc(s.date)}</small></li>`).join('')}</ul></section>`;

  return `${head}<div class="wrap gq-page">${summary}<div class="gq-cols">${list}<div class="gq-right">${now}<div class="gq-main">${parts}</div></div></div>${shopping}${extras}${sources}</div>
<script id="gq-data" type="application/json">${JSON.stringify({ lang, key: guide.storeKey || `gms-quest-${guide.slug}`, api: apiBase, places: guide.places, prices: data.priceIds,
    chains: data.chains.map((c) => ({ id: c.id, title: L(c.title).split(/ — /)[0], steps: c.steps.map((s) => s.id) })),
    steps: all.map((s) => ({ id: s.id, name: s.name, at: s.at, go: s.go || null, hunt: s.hunt || [], exp: s.exp, do: L(s.do),
      npc: npcName(s.npcStart, lang), end: s.endNpc !== s.startNpc ? npcName(s.npcEnd, lang) : '', npcImg: npcImg(s.startNpc), endImg: s.endNpc !== s.startNpc ? npcImg(s.endNpc) : '',
      need: [...s.kills.map((k) => `${ko ? k.ko : k.en} ×${k.count}`), ...s.bring.filter((b) => !b.handed).map((b) => `${ko ? b.ko : b.en} ×${b.count}`)],
      big: !!s.big })),
    t: { kill: tr('처치', 'kill'), hunt: tr('사냥터', 'Hunt'), talk: tr('대화', 'Talk to'), here: tr('지금', 'Now'), none: tr('체크한 단계가 없어요', 'No steps ticked yet'), prog: tr('{d}/{n}단계 · 경험치 {e}', '{d} of {n} steps · {e} EXP'), all: tr('모든 단계를 끝냈어요!', 'Every step is done!'), mesos: tr('메소', 'mesos') } }).replace(/</g, '\\u003c')}</script>`;
}
