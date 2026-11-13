// Character rankings page. The rows come from ClassicRank (via the worker's hourly snapshot) and are drawn by
// assets/rank.js; this is the static shell: find-my-character, the top-1,000 breakdowns, the filterable table and the
// visible credit ClassicRank's API terms ask for.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOURCE = '<a href="https://classicrank.com" target="_blank" rel="noopener">ClassicRank</a>';

export function rankBody({ lang, link, classes }) {
  const ko = lang === 'ko';
  const families = [['', ko ? '전체' : 'All'], ['Warrior', ko ? '전사' : 'Warrior'], ['Magician', ko ? '마법사' : 'Magician'], ['Bowman', ko ? '궁수' : 'Bowman'],
    ['Thief', ko ? '도적' : 'Thief'], ['Pirate', ko ? '해적' : 'Pirate'], ['Beginner', ko ? '초보자' : 'Beginner']];
  // ClassicRank job name → our training class, so a found character links straight to its own routes and guide.
  const jobLinks = Object.fromEntries(Object.entries({ Swordsman: 'warrior', Fighter: 'fighter', Page: 'page', Spearman: 'spear', Archer: 'archer', Hunter: 'hunter',
    Crossbowman: 'crossbow', Magician: 'mage', 'Wizard (Fire/Poison)': 'fire', 'Wizard (Ice/Lightning)': 'ice', Cleric: 'cleric', Thief: 'thief', Assassin: 'assassin', Bandit: 'bandit' })
    .map(([job, key]) => { const c = classes.find((x) => x.job === key); return [job, { job: key, guide: c?.guide ? link(`/guides/${c.guide}/`) : null }]; }));
  return `<section class="page-head wrap"><h1>${ko ? '글클메 캐릭터 랭킹' : 'Character rankings'}</h1>
<p class="lead">${ko ? '윈디아(클래식 월드) 레벨 순위 상위 1,000명과 직업 분포예요. 내 캐릭터를 검색하면 순위와 함께 내 레벨·직업에 맞는 사냥터와 가이드로 바로 이어 드려요.' : 'The top 1,000 characters on Windia (Classic World) by level, and which classes they play. Look up your character for its rank, then go straight to training spots and the guide for your level and class.'}</p>
<p class="muted small rank-source">${ko ? `데이터: ${SOURCE} · 1시간마다 갱신` : `Data: ${SOURCE} · refreshed hourly`}</p></section>
<div class="wrap rank-page" id="rank-page" data-train="${esc(link('/tools/training/'))}" data-jobs="${esc(JSON.stringify(jobLinks))}">
<dl class="rank-stats" id="rank-stats" aria-live="polite"></dl>
<form class="panel rank-find" id="rank-find" role="search">
<label for="rank-name"><strong>${ko ? '내 캐릭터 찾기' : 'Find my character'}</strong></label>
<div class="rank-find-row"><input id="rank-name" type="search" maxlength="13" autocomplete="off" placeholder="${ko ? '캐릭터 이름 (영문·숫자)' : 'Character name'}"><button class="btn" type="submit">${ko ? '찾기' : 'Find'}</button></div>
<div id="rank-me" class="rank-me" aria-live="polite" hidden></div>
</form>
<section class="rank-insights" aria-label="${ko ? '상위 1,000명 분석' : 'Top 1,000 breakdown'}">
<div class="panel"><h2>${ko ? '상위 1,000명의 직업' : 'Classes in the top 1,000'}</h2><ol class="rank-bars" id="rank-jobs"></ol></div>
<div class="panel"><h2>${ko ? '상위 1,000명의 레벨' : 'Levels in the top 1,000'}</h2><ol class="rank-bars" id="rank-levels"></ol></div>
</section>
<section class="panel rank-table-panel">
<div class="rank-controls">
<div class="chips" role="group" aria-label="${ko ? '계열' : 'Class family'}">${families.map(([v, l], i) => `<button type="button" class="chip" data-family="${v}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
<input id="rank-filter" type="search" placeholder="${ko ? '목록에서 이름 찾기' : 'Filter by name'}" autocomplete="off">
</div>
<p id="rank-count" class="muted small" role="status"></p>
<div class="table-wrap"><table class="data rank-table"><thead><tr><th scope="col">${ko ? '순위' : 'Rank'}</th><th scope="col">${ko ? '캐릭터' : 'Character'}</th><th scope="col">${ko ? '직업' : 'Class'}</th><th scope="col">${ko ? '레벨' : 'Level'}</th><th scope="col">${ko ? '명성' : 'Fame'}</th></tr></thead><tbody id="rank-rows"></tbody></table></div>
<p><button type="button" class="btn ghost small-btn" id="rank-more" hidden>${ko ? '100명 더 보기' : 'Show 100 more'}</button></p>
<p class="muted small">${ko ? `랭킹·캐릭터 사진: ${SOURCE}. 매크로로 표시된 캐릭터는 순위에서 빠져요.` : `Rankings and character pictures: ${SOURCE}. Characters marked as botting are left out.`}</p>
</section>
<noscript><p class="panel">${ko ? '랭킹을 보려면 JavaScript를 켜 주세요.' : 'Turn on JavaScript to see the rankings.'}</p></noscript>
</div>`;
}
