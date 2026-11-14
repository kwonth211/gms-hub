// Character rankings page. The rows come from ClassicRank (via the worker's hourly snapshot) and are drawn by
// assets/rank.js; this is the static shell: find-my-character, the top-1,000 breakdowns, the filterable table and the
// visible credit ClassicRank's API terms ask for.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOURCE = '<a href="https://classicrank.com" target="_blank" rel="noopener">ClassicRank</a>';

const JOB_KO = { Beginner: '초보자', Swordsman: '검사', Archer: '아처', Magician: '매지션', Thief: '로그', Pirate: '해적',
  Fighter: '파이터', Page: '페이지', Spearman: '스피어맨', Hunter: '헌터', Crossbowman: '사수', Cleric: '클레릭',
  'Wizard (Fire/Poison)': '위자드(불,독)', 'Wizard (Ice/Lightning)': '위자드(썬,콜)', Assassin: '어쌔신', Bandit: '시프', Brawler: '인파이터', Gunslinger: '건슬링거' };
const FAMILY_KO = { Warrior: '전사', Magician: '마법사', Bowman: '궁수', Thief: '도적', Pirate: '해적', Beginner: '초보자' };
const nf = (n) => new Intl.NumberFormat('en-US').format(n);

// The build-time snapshot (data/rank-snapshot.json, scripts/fetch-page-snapshots.mjs) is drawn into the page so it has
// real content before assets/rank.js replaces it with the live list: the class split, the top 30 and a short reading.
function snapshotParts(ko, snap) {
  if (!snap?.top?.length) return { bars: '', rows: '', reading: '' };
  const job = (j) => (ko ? JOB_KO[j] || j : j), fam = (f) => (ko ? FAMILY_KO[f] || f : f);
  const total = snap.jobs.reduce((s, [, n]) => s + n, 0) || 1, max = snap.jobs[0][1];
  const pc = (n) => `${((n / total) * 100).toFixed(1)}%`;
  const bars = snap.jobs.slice(0, 12).map(([j, n]) => `<li><span class="rank-bar-label">${esc(job(j))}</span><span class="rank-bar"><i style="width:${((n / max) * 100).toFixed(1)}%"></i></span><b>${nf(n)}</b><small>${pc(n)}</small></li>`).join('');
  const rows = snap.top.map((r) => `<tr><td class="num">${r.rank}</td><td translate="no">${esc(r.name)}</td><td>${esc(job(r.job))}</td><td class="num">${r.level}</td><td class="num">${nf(r.fame)}</td></tr>`).join('');
  // Class names stay the game's English in other languages, so the sentence keeps one translation as the numbers move.
  const nt = (x) => `<span translate="no">${esc(x)}</span>`;
  const [f1, f2] = snap.families, [j1, j2, j3] = snap.jobs, lv = snap.levels, day = (snap.at || '').slice(0, 10);
  const reading = ko
    ? `<section class="panel rank-reading"><h2>상위 1,000명으로 보는 지금의 윈디아</h2>
<p>${day} 기준으로 윈디아에는 캐릭터가 ${nf(snap.stats.characters)}개 있고, 가장 높은 레벨은 ${snap.stats.highest_level}이에요. 상위 1,000명 안에 들려면 레벨 ${lv.min}이 필요했고, 1,000명의 가운데 레벨은 ${lv.median}이었어요.</p>
<p>계열로는 ${fam(f1[0])}가 ${nf(f1[1])}명(${pc(f1[1])})으로 가장 많고, ${fam(f2[0])}가 ${nf(f2[1])}명(${pc(f2[1])})으로 뒤를 이어요. 2차 직업으로는 ${job(j1[0])} ${nf(j1[1])}명, ${job(j2[0])} ${nf(j2[1])}명, ${job(j3[0])} ${nf(j3[1])}명 순이에요. 클래식 월드는 사냥 속도가 곧 레벨 속도라서, 혼자 빠르게 잡는 직업이 위쪽에 몰려요.</p>
<h3>이 페이지 쓰는 법</h3>
<ul><li><strong>내 캐릭터 찾기</strong>: 이름을 넣으면 전체 순위와 직업 안 순위가 나오고, 지금 레벨에 맞는 사냥터 추천과 직업 가이드로 바로 넘어가요.</li>
<li><strong>계열 버튼</strong>: 전사·마법사·궁수·도적만 골라 보면 같은 계열 안에서 내 위치를 알 수 있어요.</li>
<li><strong>이름 찾기</strong>: 목록에서 길드원이나 친구 이름을 바로 찾아요.</li></ul>
<h3>자주 묻는 것</h3>
<div class="faq"><details><summary>순위는 얼마나 자주 바뀌나요?</summary><p>1시간마다 새로 받아 와요. 방금 레벨업했다면 다음 갱신 때 반영돼요.</p></details>
<details><summary>왜 내 캐릭터가 안 나오나요?</summary><p>상위 1,000명 밖이면 목록에는 없지만, 이름 검색으로는 순위를 찾을 수 있어요. 이름은 영문·숫자로 정확히 넣어야 해요.</p></details>
<details><summary>매크로 캐릭터도 들어가나요?</summary><p>매크로로 표시된 캐릭터는 순위에서 빼요.</p></details></div></section>`
    : `<section class="panel rank-reading"><h2>Windia today, through its top 1,000</h2>
<p>As of ${day}, Windia has ${nf(snap.stats.characters)} characters and the highest level is ${snap.stats.highest_level}. Getting into the top 1,000 took level ${lv.min}, and the middle of the 1,000 sat at level ${lv.median}.</p>
<ul><li>Largest class family: ${nt(fam(f1[0]))}, ${nf(f1[1])} characters (${pc(f1[1])})</li><li>Second class family: ${nt(fam(f2[0]))}, ${nf(f2[1])} characters (${pc(f2[1])})</li><li>Most common second jobs: ${nt(job(j1[0]))} ${nf(j1[1])}, ${nt(job(j2[0]))} ${nf(j2[1])}, ${nt(job(j3[0]))} ${nf(j3[1])}</li></ul>
<p>In Classic World, killing speed is levelling speed, so classes that clear maps fast on their own crowd the top.</p>
<h3>How to use this page</h3>
<ul><li><strong>Find my character</strong>: type a name for its overall and class rank, then jump to training spots for its level and the guide for its class.</li>
<li><strong>Class family buttons</strong>: show only warriors, magicians, bowmen or thieves to see where you stand in your family.</li>
<li><strong>Filter by name</strong>: find a guildmate or friend in the list.</li></ul>
<h3>Questions</h3>
<div class="faq"><details><summary>How often does it update?</summary><p>Every hour. A level gained just now shows up at the next refresh.</p></details>
<details><summary>Why can't I see my character?</summary><p>Outside the top 1,000 it is not in the list, but the name search still finds its rank. Type the exact name.</p></details>
<details><summary>Are botting characters included?</summary><p>Characters marked as botting are left out.</p></details></div></section>`;
  return { bars, rows, reading };
}

export function rankBody({ lang, link, classes, snapshot }) {
  const ko = lang === 'ko';
  const families = [['', ko ? '전체' : 'All'], ['Warrior', ko ? '전사' : 'Warrior'], ['Magician', ko ? '마법사' : 'Magician'], ['Bowman', ko ? '궁수' : 'Bowman'],
    ['Thief', ko ? '도적' : 'Thief'], ['Pirate', ko ? '해적' : 'Pirate'], ['Beginner', ko ? '초보자' : 'Beginner']];
  // ClassicRank job name → our training class, so a found character links straight to its own routes and guide.
  const jobLinks = Object.fromEntries(Object.entries({ Swordsman: 'warrior', Fighter: 'fighter', Page: 'page', Spearman: 'spear', Archer: 'archer', Hunter: 'hunter',
    Crossbowman: 'crossbow', Magician: 'mage', 'Wizard (Fire/Poison)': 'fire', 'Wizard (Ice/Lightning)': 'ice', Cleric: 'cleric', Thief: 'thief', Assassin: 'assassin', Bandit: 'bandit' })
    .map(([job, key]) => { const c = classes.find((x) => x.job === key); return [job, { job: key, guide: c?.guide ? link(`/guides/${c.guide}/`) : null }]; }));
  const snap = snapshotParts(ko, snapshot);
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
<div class="panel"><h2>${ko ? '상위 1,000명의 직업' : 'Classes in the top 1,000'}</h2><ol class="rank-bars" id="rank-jobs">${snap.bars}</ol></div>
<div class="panel"><h2>${ko ? '상위 1,000명의 레벨' : 'Levels in the top 1,000'}</h2><ol class="rank-bars" id="rank-levels"></ol></div>
</section>
<section class="panel rank-table-panel">
<div class="rank-controls">
<div class="chips" role="group" aria-label="${ko ? '계열' : 'Class family'}">${families.map(([v, l], i) => `<button type="button" class="chip" data-family="${v}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
<input id="rank-filter" type="search" placeholder="${ko ? '목록에서 이름 찾기' : 'Filter by name'}" autocomplete="off">
</div>
<p id="rank-count" class="muted small" role="status"></p>
<div class="table-wrap"><table class="data rank-table"><thead><tr><th scope="col">${ko ? '순위' : 'Rank'}</th><th scope="col">${ko ? '캐릭터' : 'Character'}</th><th scope="col">${ko ? '직업' : 'Class'}</th><th scope="col">${ko ? '레벨' : 'Level'}</th><th scope="col">${ko ? '명성' : 'Fame'}</th></tr></thead><tbody id="rank-rows">${snap.rows}</tbody></table></div>
<p><button type="button" class="btn ghost small-btn" id="rank-more" hidden>${ko ? '100명 더 보기' : 'Show 100 more'}</button></p>
<p class="muted small">${ko ? `랭킹·캐릭터 사진: ${SOURCE}. 매크로로 표시된 캐릭터는 순위에서 빠져요.` : `Rankings and character pictures: ${SOURCE}. Characters marked as botting are left out.`}</p>
</section>
${snap.reading}
<noscript><p class="panel">${ko ? '랭킹을 보려면 JavaScript를 켜 주세요.' : 'Turn on JavaScript to see the rankings.'}</p></noscript>
</div>`;
}
