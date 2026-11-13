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

export function mapDetail({ lang, l, maps, url, itemUrl, routes, accuracy, notes }) {
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
