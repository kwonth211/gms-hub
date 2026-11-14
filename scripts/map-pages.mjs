// Map pages, built from the monster snapshot: each monster lists the maps it spawns on with a spawn-point count, so a
// map page is the same data turned around (who lives here, how many, what they drop). Nothing here is estimated: the
// full-clear EXP is the sum of spawn points × monster EXP, and the accuracy is the calculator's sure-hit formula.
import { monsterPath, monsterName, mapPath, regionKo } from './monster-pages.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n) => new Intl.NumberFormat('en-US').format(n);

export function collectMaps(monsters) {
  const maps = new Map();
  for (const m of monsters) {
    for (const l of m.locations || []) {
      const e = maps.get(l.id) || maps.set(l.id, { id: l.id, en: l.en.trim(), ko: l.ko, region: l.region, availability: l.availability, total: l.total, types: l.types, mobs: [] }).get(l.id);
      e.mobs.push({ m, count: l.count });
    }
  }
  for (const e of maps.values()) {
    e.mobs.sort((a, b) => b.count - a.count || a.m.lv - b.m.lv);
    e.minLv = Math.min(...e.mobs.map((x) => x.m.lv));
    e.maxLv = Math.max(...e.mobs.map((x) => x.m.lv));
    e.clearExp = e.mobs.reduce((s, x) => s + x.count * x.m.exp, 0);
  }
  return [...maps.values()].sort((a, b) => a.minLv - b.minLv || a.id - b.id);
}

export const mapName = (l, lang) => (lang === 'ko' ? l.ko || l.en : l.en);
export const regionName = (r, lang) => (lang === 'ko' ? regionKo[r] || r : r);
const statusTag = (l, ko) =>
  l.availability === 'open' ? '' : `<span class="monster-tag status-upcoming">${l.availability === 'upcoming' ? (ko ? '11/18 개방 예정' : 'Opens Nov 18') : ko ? '미개방 지역' : 'Unreleased area'}</span>`;

// The map itself: the rendered picture (assets/maps/<id>.webp) and a diagram drawn from the client coordinates
// (data/map-layouts.json): platforms, ropes and ladders, and every monster spawn point coloured by monster. Also how
// many height levels the monsters stand on, which is what makes a map "flat" (one level) or a climb.
const SPAWN_COLORS = 6;
export function spawnLevels(spawns, gap = 60) {
  const ys = [...new Set(spawns.map((s) => s[2]))].sort((a, b) => a - b);
  let levels = 0, last = -Infinity;
  for (const y of ys) { if (y - last > gap) levels++; last = y; }
  return levels;
}
function mapView({ lang, l, lay, url }) {
  if (!lay) return '';
  const ko = lang === 'ko';
  const [x0, y0, w, h] = lay.bounds;
  const pad = Math.round(Math.max(w, h) * 0.02);
  const sw = Math.max(2, Math.round(Math.max(w, h) / 350)), r = Math.max(6, Math.round(Math.max(w, h) / 110));
  const order = l.mobs.map(({ m }) => m.id);
  const color = (id) => `ms${Math.max(0, order.indexOf(id)) % SPAWN_COLORS}`;
  const byId = new Map(l.mobs.map(({ m }) => [m.id, m]));
  const lines = lay.fh.filter(([a, b, c, d]) => a !== c || b !== d).map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join('');
  const ropes = lay.ropes.map(([x, a, b, ladder]) => `<line class="${ladder ? 'ladder' : 'rope'}" x1="${x}" y1="${a}" x2="${x}" y2="${b}"/>`).join('');
  const dots = lay.spawns.map(([id, x, y]) => `<circle class="${color(id)}" cx="${x}" cy="${y - r}" r="${r}"><title>${esc(byId.get(id) ? monsterName(byId.get(id), lang) : `#${id}`)}</title></circle>`).join('');
  const counts = new Map();
  for (const [id] of lay.spawns) counts.set(id, (counts.get(id) || 0) + 1);
  const legend = order.filter((id) => counts.has(id)).map((id) => `<li><i class="${color(id)}" aria-hidden="true"></i><img src="${url(`/assets/monsters/${id}.gif`)}" width="28" height="28" alt="" loading="lazy"><span>${esc(monsterName(byId.get(id), lang))}</span><small>${counts.get(id)}${ko ? '곳' : ''}</small></li>`).join('');
  const levels = spawnLevels(lay.spawns);
  const pic = lay.picture
    ? `<figure class="map-pic"><img src="${url(`/assets/maps/${l.id}.webp`)}" width="${lay.picture[0]}" height="${lay.picture[1]}" alt="${esc(ko ? `${mapName(l, lang)} 맵 화면` : `${mapName(l, lang)} map`)}" loading="lazy" decoding="async"><figcaption>${ko ? '실제 맵 화면' : 'The map in game'}</figcaption></figure>`
    : '';
  return `<section class="panel map-view" id="map-view"><h2>${ko ? '맵 지도' : 'Map'}</h2>
<dl class="map-facts">${levels ? `<div><dt>${ko ? '몬스터가 서는 층' : 'Floors with monsters'}</dt><dd>${levels}${ko ? '층' : ''}</dd><small>${levels === 1 ? (ko ? '한 줄로 쭉 이어진 일자맵이에요' : 'One floor: a flat map') : ko ? '높이가 다른 발판에 나뉘어 나와요' : 'Spawns spread over platforms at different heights'}</small></div>` : ''}
<div><dt>${ko ? '맵 크기' : 'Map size'}</dt><dd>${nf(w)} × ${nf(h)}</dd><small>${ko ? '게임 좌표 기준 가로 × 세로' : 'Width × height in game units'}</small></div>
<div><dt>${ko ? '로프·사다리' : 'Ropes & ladders'}</dt><dd>${lay.ropes.length}</dd></div></dl>
<div class="map-figs">${pic}<figure class="map-diagram"><svg viewBox="${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}" role="img" aria-label="${esc(ko ? `${mapName(l, lang)} 발판과 몬스터 출현 지점` : `${mapName(l, lang)} platforms and spawn points`)}" preserveAspectRatio="xMidYMid meet"><g class="fh" stroke-width="${sw}">${lines}</g><g class="ropes" stroke-width="${sw}">${ropes}</g><g class="spawns">${dots}</g></svg><figcaption>${ko ? '발판(선)·로프(점선)·몬스터 출현 지점(점), 게임 좌표 그대로' : 'Platforms (lines), ropes (dashed) and spawn points (dots), in game coordinates'}</figcaption></figure></div>
${legend ? `<ul class="map-legend">${legend}</ul>` : ''}
</section>`;
}

export function mapDetail({ lang, l, maps, url, itemUrl, routes, accuracy, notes, layout }) {
  const ko = lang === 'ko';
  const link = (p) => url(`/${lang}${p}`);
  const name = mapName(l, lang);
  const rows = l.mobs
    .map(({ m, count }) => `<tr><th scope="row"><a class="map-mob" href="${link(monsterPath(m))}"><img class="monster-sprite" src="${url(`/assets/monsters/${m.id}.gif`)}" width="40" height="40" alt="" loading="lazy"><span>${esc(monsterName(m, lang))}</span></a></th>
<td>${m.lv}</td><td>${nf(m.hp)}</td><td>${nf(m.exp)}</td><td><b>${count}</b><small class="muted"> (${Math.round((count / l.total) * 100)}%)</small></td><td>${accuracy(m.lv, m)}</td></tr>`)
    .join('');
  // Drops of the monsters here: player-noted farming drops first, then repeated reports.
  const seen = new Set();
  const drops = l.mobs
    .flatMap(({ m }) => m.drops.map((d) => ({ d, m, noted: (notes[m.id]?.drops || []).includes(d.itemId) })))
    .sort((a, b) => Number(b.noted) - Number(a.noted) || (a.d.confidence === 'repeated' ? 0 : 1) - (b.d.confidence === 'repeated' ? 0 : 1))
    .filter(({ d }) => (seen.has(d.itemId) ? false : seen.add(d.itemId)))
    .slice(0, 24);
  const dropList = drops.length
    ? `<ul class="item-links">${drops.map(({ d, m }) => `<li><a href="${itemUrl(d, lang)}"><img src="https://maplestory.io/api/MCW/1/item/${d.itemId}/icon" alt="" width="24" height="24" loading="lazy"><span>${esc(ko ? d.ko || d.en : d.en)}</span><small>${esc(monsterName(m, lang))}</small></a></li>`).join('')}</ul>`
    : `<p class="muted">${ko ? '이 맵 몬스터의 드롭 제보가 아직 없어요.' : 'No drop reports for the monsters here yet.'}</p>`;
  const routeList = routes.length
    ? `<ul class="monster-routes">${routes.map((r) => `<li><a href="${link(`/tools/training/?lv=${r.level.min}#route-${r.id}`)}"><strong>${esc(r.title[lang])}</strong><small>Lv. ${r.level.min}–${r.level.max}</small></a></li>`).join('')}</ul>`
    : '';
  const nearby = maps
    .filter((x) => x.id !== l.id && x.region === l.region && x.availability === 'open')
    .sort((a, b) => Math.abs(a.minLv - l.minLv) - Math.abs(b.minLv - l.minLv) || a.id - b.id)
    .slice(0, 6);
  return `<section class="page-head wrap">
<p class="crumbs"><a href="${link('/monsters/')}">${ko ? '몬스터 도감' : 'Monster database'}</a><span aria-hidden="true"> › </span><a href="${link('/maps/')}">${ko ? '맵' : 'Maps'}</a></p>${String(l.id).startsWith('10006') ? `<p class="fh-link-note"><a href="${link('/forgotten-hollow/')}">${ko ? '포가튼 할로우 공략: 가는 법, 구역별 사냥터, 퀘스트, 보스' : 'Forgotten Hollow guide: getting in, maps by level, quests and the boss'}</a></p>` : ''}
<h1>${esc(name)}${ko && l.ko ? `<small class="en-name">${esc(l.en)}</small>` : ''}</h1>
<p class="lead">${ko ? `${esc(regionName(l.region, lang))} 지역 맵이에요. 몬스터 ${l.mobs.length}종이 나오고, 레벨은 ${l.minLv}~${l.maxLv}이에요.` : `A ${esc(l.region)} map with ${l.mobs.length} monster types, levels ${l.minLv}–${l.maxLv}.`}</p>
${statusTag(l, ko)}
</section>
<div class="wrap map-page">
<dl class="monster-hunt-stats">
<div><dt>${ko ? '몬스터 레벨' : 'Monster levels'}</dt><dd>${l.minLv === l.maxLv ? l.minLv : `${l.minLv}–${l.maxLv}`}</dd></div>
<div><dt>${ko ? '출현 지점' : 'Spawn points'}</dt><dd>${l.total}</dd></div>
<div><dt>${ko ? '몬스터 종류' : 'Monster types'}</dt><dd>${l.mobs.length}</dd></div>
<div><dt>${ko ? '한 바퀴 EXP' : 'EXP per full clear'}</dt><dd>${nf(l.clearExp)}</dd><small>${ko ? '모든 출현 지점을 한 번씩 잡았을 때, 파티·버프 제외' : 'Every spawn point killed once, before party or buff bonuses'}</small></div>
</dl>
${mapView({ lang, l, lay: layout, url })}
<section class="panel"><h2>${ko ? '나오는 몬스터' : 'Monsters on this map'}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${ko ? '몬스터' : 'Monster'}</th><th>${ko ? '레벨' : 'Level'}</th><th>HP</th><th>EXP</th><th>${ko ? '출현 지점' : 'Spawns'}</th><th>${ko ? '확정 명중' : 'Sure-hit accuracy'}</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted note">${ko ? '확정 명중은 몬스터와 같은 레벨일 때 빗나가지 않는 데 필요한 명중이에요. 몇 방 컷 계산기와 같은 공식이에요.' : 'Sure-hit accuracy is what you need at the monster’s own level to never miss, from the same formula as the hits-to-kill calculator.'}</p></section>
<section class="panel"><h2>${ko ? '이 맵에서 얻는 드롭' : 'Drops on this map'}</h2>
<p class="muted note">${ko ? '플레이어 드롭 제보로 모은 목록이에요.' : 'From player drop reports.'}</p>${dropList}</section>
${routeList ? `<section class="panel"><h2>${ko ? '이 맵 몬스터가 나오는 사냥 경로' : 'Training routes with these monsters'}</h2>${routeList}</section>` : ''}
${nearby.length ? `<section class="panel"><h2>${ko ? '같은 지역의 비슷한 맵' : 'Similar maps nearby'}</h2><ul class="monster-routes">${nearby.map((x) => `<li><a href="${link(mapPath(x))}"><strong>${esc(mapName(x, lang))}</strong><small>Lv. ${x.minLv}–${x.maxLv}</small></a></li>`).join('')}</ul></section>` : ''}
<p class="muted small">${ko ? '출현 지점과 능력치는 게임 클라이언트 데이터, 드롭은 유저 제보를 정리했어요.' : 'Spawn points and stats come from the game client data; drops are player reports.'}</p>
</div>`;
}

export function mapIndex({ lang, maps, url }) {
  const ko = lang === 'ko';
  const link = (p) => url(`/${lang}${p}`);
  const regions = [...new Set(maps.map((l) => l.region))];
  const open = maps.filter((l) => l.availability === 'open');
  return `<section class="page-head wrap"><h1>${ko ? '맵 도감' : 'Map database'}</h1>
<p class="lead">${ko ? `사냥할 수 있는 맵 ${open.length}곳의 몬스터, 레벨, 출현 지점, 드롭을 정리했어요. 몬스터 레벨이 낮은 맵부터 보여 줘요.` : `${open.length} huntable maps with their monsters, levels, spawn points and drops, lowest level first.`}</p></section>
<div class="wrap map-page">
${regions
  .map((r) => {
    const list = maps.filter((l) => l.region === r);
    return `<section class="panel"><h2>${esc(regionName(r, lang))} <small class="muted">${list.length}</small></h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${ko ? '맵' : 'Map'}</th><th>${ko ? '레벨' : 'Levels'}</th><th>${ko ? '몬스터' : 'Monsters'}</th><th>${ko ? '출현 지점' : 'Spawns'}</th></tr></thead><tbody>${list
      .map((l) => `<tr><th scope="row"><a href="${link(mapPath(l))}">${esc(mapName(l, lang))}</a>${statusTag(l, ko)}</th><td>${l.minLv === l.maxLv ? l.minLv : `${l.minLv}–${l.maxLv}`}</td><td><ul class="tr-for">${l.mobs.slice(0, 4).map(({ m }) => `<li>${esc(monsterName(m, lang))}</li>`).join('')}</ul></td><td>${l.total}</td></tr>`)
      .join('')}</tbody></table></div></section>`;
  })
  .join('\n')}
</div>`;
}
