// /tools/forge/: the scroll forge. A workbench where you pick a piece of gear, drag scrolls onto it and see what the game
// would do: success adds the scroll's stats, every attempt uses an upgrade slot, a Chaos scroll that fails can destroy the
// item. Odds, stats and slots are the client's (data/forge.json, scripts/fetch-forge.mjs); prices come from the market.
// The page is a shell; assets/forge.js draws the shelves and the anvil from /assets/forge-data.json.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function forgeStrings(lang) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  return {
    equips: tr('장비 선반', 'Gear shelf'), winTitle: tr('주문서 강화', 'Scroll enhancement'), scrolls: tr('주문서 선반', 'Scroll shelf'), anvil: tr('작업대', 'Workbench'), log: tr('작업 기록', 'Work log'),
    search: tr('장비 이름 (예: 브라운 워크 장갑)', 'Gear name (e.g. Brown Work Gloves)'), obtainable: tr('지금 얻을 수 있는 장비만', 'Only gear you can get now'),
    all: tr('전체', 'All'), pick: tr('왼쪽 선반에서 장비를 골라 작업대에 올려요.', 'Pick gear from the shelf to put it on the workbench.'),
    pickScroll: tr('이 장비에 바를 수 있는 주문서예요. 끌어서 장비 위에 놓거나 [바르기]를 누르세요.', 'Scrolls for this gear. Drag one onto the gear, or press Apply.'),
    noScroll: tr('이 장비에 바르는 주문서가 없어요.', 'No scroll fits this gear.'),
    apply: tr('바르기', 'Apply'), autoShort: tr('연속', 'All'), auto: tr('남은 횟수만큼 바르기', 'Use all remaining slots'), reset: tr('새 장비로 다시', 'Start over with a fresh one'),
    slots: tr('업그레이드 가능 횟수', 'Upgrades available'), reqLv: tr('착용 레벨', 'Req. level'), success: tr('성공', 'Success'), fail: tr('실패', 'Failed'),
    destroyed: tr('아이템이 파괴되었어요', 'The item was destroyed'), noSlots: tr('업그레이드 가능 횟수가 없어요', 'No upgrades left'),
    destroyChance: tr('실패 시 50% 파괴', 'May destroy on fail'), destroyWord: tr('파괴', 'destroy'), noPrice: tr('시세 없음', 'No price'),
    used: tr('바른 주문서', 'Scrolls used'), cost: tr('주문서 값', 'Scroll cost'), rate: tr('성공', 'Success'), best: tr('이 장비 최고 기록', 'Best on this gear'),
    dropHere: tr('여기에 주문서를 놓으세요', 'Drop a scroll here'), mesos: tr('메소', 'mesos'), market: tr('시세 보기', 'Market price'),
    shown: tr('개 중 {n}개 표시', 'shown'), more: tr('검색어를 더 넣으면 더 찾을 수 있어요', 'Type more to narrow it down'),
    gearValue: tr('장비 시세', 'Gear price'), fromScrolls: tr('주문서로 오른 능력치', 'Gained from scrolls'), tries: tr('성공 {ok} · 실패 {fail}', '{ok} passed · {fail} failed'), reqStat: tr('요구', 'REQ'), base: tr('기본', 'base'), times: tr('회', 'x'), share: tr('결과 링크 복사', 'Copy result link'), copied: tr('복사했어요', 'Copied'),
    stat: { STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK', MHP: 'HP', MMP: 'MP', PAD: tr('공격력', 'Weapon ATT'), MAD: tr('마력', 'Magic ATT'), PDD: tr('물리 방어력', 'Weapon DEF'),
      MDD: tr('마법 방어력', 'Magic DEF'), ACC: tr('명중률', 'Accuracy'), EVA: tr('회피율', 'Avoidability'), Speed: tr('이동속도', 'Speed'), Jump: tr('점프력', 'Jump'), CRT: tr('크리티컬 확률', 'Crit. rate'), CRD: tr('크리티컬 데미지', 'Crit. damage') },
    cat: { 100: tr('모자', 'Hat'), 103: tr('귀고리', 'Earrings'), 104: tr('상의', 'Top'), 105: tr('전신', 'Overall'), 106: tr('하의', 'Bottom'), 107: tr('신발', 'Shoes'),
      108: tr('장갑', 'Gloves'), 109: tr('방패', 'Shield'), 110: tr('망토', 'Cape'), weapon: tr('무기', 'Weapon') },
    tier: { 100: tr('하급 100%', 'Lesser 100%'), 60: tr('중급 60%', 'Intermediate 60%'), 10: tr('상급 10%', 'Greater 10%'), chaos: tr('혼돈 10%', 'Chaos 10%') }
  };
}

// Chance of exactly k successes in n tries at rate p, and of at least k.
const choose = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return c; };
const atLeast = (n, k, p) => { let s = 0; for (let i = k; i <= n; i++) s += choose(n, i) * p ** i * (1 - p) ** (n - i); return s; };
const pc = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

// The rules the forge plays by, written out so the page explains itself without JavaScript: the four tiers, what a
// failure costs, two worked examples (binomial odds over a piece's slots) and common questions.
function forgeGuide(ko) {
  const n = 5, keep = (1 - 0.1) * 0.5;
  const rows = [[ko ? '하급' : 'Lesser', 100, ko ? '없음' : 'never'], [ko ? '중급' : 'Intermediate', 60, ko ? '그대로' : 'item kept'], [ko ? '상급' : 'Greater', 10, ko ? '그대로' : 'item kept'], [ko ? '혼돈' : 'Chaos', 10, ko ? '50% 확률로 파괴' : 'destroyed half the time']];
  const table = `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">${ko ? '등급' : 'Tier'}</th><th scope="col">${ko ? '성공률' : 'Success'}</th><th scope="col">${ko ? '실패하면' : 'On failure'}</th><th scope="col">${ko ? '업그레이드 횟수' : 'Upgrade slot'}</th></tr></thead><tbody>${rows.map(([t, r, f]) => `<tr><th scope="row">${t}</th><td class="num">${r}%</td><td>${f}</td><td>${ko ? '성공·실패 모두 1 줄어요' : 'used either way'}</td></tr>`).join('')}</tbody></table></div>`;
  return ko
    ? `<section class="wrap fg-guide"><div class="panel"><h2>주문서가 굴러가는 규칙</h2>
<p>장비마다 업그레이드 가능 횟수가 정해져 있고, 주문서를 한 장 바를 때마다 성공하든 실패하든 1씩 줄어요. 성공하면 주문서에 적힌 능력치가 그대로 더해지고, 실패하면 아무것도 오르지 않아요. 혼돈 주문서만 실패했을 때 장비가 사라질 수 있어요.</p>
${table}
<h3>숫자로 보면</h3>
<p>업그레이드 가능 횟수가 ${n}인 장갑에 중급(60%) 주문서만 바르면 평균 ${n * 0.6}번 성공해요. ${n}번 모두 성공할 확률은 ${pc(0.6 ** n)}, 3번 이상 성공할 확률은 ${pc(atLeast(n, 3, 0.6))}예요. 상급(10%)으로 바꾸면 한 번이라도 성공할 확률이 ${pc(atLeast(n, 1, 0.1))}로 떨어지는 대신, 성공 한 번에 오르는 폭이 커요.</p>
<p>혼돈 주문서는 한 장마다 장비가 사라질 확률이 ${pc(keep)}예요. 세 장을 연달아 발라서 장비가 살아남을 확률은 ${pc((1 - keep) ** 3)}뿐이라, 아끼는 장비에는 시뮬레이터로 먼저 돌려 보는 게 좋아요.</p>
<h3>시뮬레이터 쓰는 법</h3>
<ul><li>왼쪽 장비 선반에서 이름이나 부위로 장비를 찾아 작업대에 올려요. "지금 얻을 수 있는 장비만"을 켜면 게임에 실제로 나오는 장비만 보여요.</li>
<li>오른쪽 주문서 선반에는 그 장비에 바를 수 있는 주문서만 나와요. 끌어서 장비 위에 놓거나 [바르기]를 눌러요. [연속]은 남은 횟수를 한 번에 다 써요.</li>
<li>장비에 마우스를 올리면 게임처럼 능력치 창이 떠서, 기본값과 주문서로 오른 값이 따로 보여요.</li>
<li>작업 기록에는 바른 주문서와 그 값이 실시간 시세로 쌓여서, 원하는 작이 나오기까지 메소가 얼마나 드는지 감이 와요.</li></ul>
<div class="faq"><details><summary>실제 게임과 같은 확률인가요?</summary><p>성공률, 오르는 능력치, 업그레이드 가능 횟수, 혼돈 주문서 파괴 확률은 게임 클라이언트의 주문서·장비 데이터 그대로예요. 결과는 매번 무작위라 같은 장비도 돌릴 때마다 달라요.</p></details>
<details><summary>여기서 잘 나오면 게임에서도 잘 나오나요?</summary><p>아니요. 매 시도는 서로 영향을 주지 않아요. 시뮬레이터는 어떤 결과가 얼마나 자주 나오는지, 주문서 값이 얼마나 드는지 미리 감을 잡는 용도예요.</p></details>
<details><summary>주문서 값은 어디서 오나요?</summary><p>사이트의 실시간 시세에서 지금 판매 중인 매물의 중간값을 가져와요. 시세가 없는 주문서는 값이 비어 있어요.</p></details></div></div></section>`
    : `<section class="wrap fg-guide"><div class="panel"><h2>The rules the forge plays by</h2>
<p>Every piece of gear has a set number of upgrade slots, and each scroll uses one whether it passes or fails. A pass adds the scroll's stats; a fail adds nothing. Only a Chaos scroll can destroy the item when it fails.</p>
${table}
<h3>In numbers</h3>
<p>Put only Intermediate (60%) scrolls on gloves with ${n} slots and you average ${n * 0.6} passes. All ${n} pass ${pc(0.6 ** n)} of the time, and 3 or more pass ${pc(atLeast(n, 3, 0.6))} of the time. Switch to Greater (10%) and the chance of even one pass drops to ${pc(atLeast(n, 1, 0.1))}, but each pass is worth more.</p>
<p>A Chaos scroll destroys the item ${pc(keep)} of the time. Use three in a row and the item survives only ${pc((1 - keep) ** 3)} of the time, so run it here before you risk gear you care about.</p>
<h3>Using the forge</h3>
<ul><li>Find gear on the left shelf by name or slot and put it on the bench. "Only gear you can get now" hides gear the game does not hand out.</li>
<li>The right shelf shows only scrolls that fit. Drag one onto the gear or press Apply; All uses every slot left.</li>
<li>Hover the gear for a game-style stat window with base and scrolled values apart.</li>
<li>The work log adds up the scrolls you used at live market prices, so you see what a result really costs.</li></ul>
<div class="faq"><details><summary>Are the odds the game's?</summary><p>Success rates, stat gains, upgrade slots and the Chaos destroy chance come straight from the game client's scroll and gear data. Each run is random, so the same gear comes out differently every time.</p></details>
<details><summary>Does a lucky run here mean luck in game?</summary><p>No. Every attempt is independent. The forge shows how often each outcome happens and what the scrolls cost.</p></details>
<details><summary>Where do the scroll prices come from?</summary><p>The live market: the median of the listings up for sale right now. Scrolls without listings show no price.</p></details></div></div></section>`;
}

export function forgeBody({ lang, jsonScript, dataUrl, api = '' }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  return `<link rel="stylesheet" href="__FG_CSS__">
<div class="fg">
<section class="fg-hero wrap"><h1>${tr('주문서 작 시뮬레이터', 'Scroll forge')}</h1>
<p>${tr('장비를 작업대에 올리고 주문서를 끌어다 발라 보세요. 성공률, 오르는 능력치, 업그레이드 횟수, 혼돈 주문서 파괴까지 게임과 똑같이 굴러가요. 바른 주문서 값은 실시간 시세로 계산해요.', 'Put gear on the workbench and drag scrolls onto it. Success rates, stat gains, upgrade slots and Chaos scrolls destroying items work just like the game, and the scrolls you use are priced from the live market.')}</p><p class="fg-counter" id="fg-counter" data-api="${esc(api)}" hidden aria-live="polite"><span class="fg-c-main">${tr('오늘 다 같이 바른 주문서', 'Scrolls used by everyone today')} <b data-fc="today">0</b>${tr('장', '')}</span><span class="fg-c-split"><span class="is-ok">${tr('성공', 'Passed')} <b data-fc="ok">0</b></span><span class="is-fail">${tr('실패', 'Failed')} <b data-fc="fail">0</b></span><span class="is-boom">${tr('파괴', 'Destroyed')} <b data-fc="boom">0</b></span></span><span class="fg-c-total" hidden>${tr('누적', 'All time')} <b data-fc="total">0</b>${tr('장', '')}</span></p></section>
<!--ad-top-->
<div class="wrap fg-bench" id="fg-bench" data-url="${esc(dataUrl)}">
<aside class="fg-shelf fg-equips" aria-labelledby="fg-eq-h"><h2 id="fg-eq-h">${tr('장비 선반', 'Gear shelf')}</h2>
<input id="fg-q" type="search" autocomplete="off" placeholder="${tr('장비 이름 (예: 브라운 워크 장갑)', 'Gear name (e.g. Brown Work Gloves)')}" aria-label="${tr('장비 검색', 'Search gear')}">
<div class="fg-cats" id="fg-cats" role="group" aria-label="${tr('부위', 'Slot')}"></div>
<label class="fg-check"><input type="checkbox" id="fg-ok" checked> ${tr('지금 얻을 수 있는 장비만', 'Only gear you can get now')}</label>
<ul class="fg-list" id="fg-equip-list" aria-live="polite"></ul></aside>
<section class="fg-center" aria-labelledby="fg-anvil-h"><h2 id="fg-anvil-h" class="sr-only">${tr('작업대', 'Workbench')}</h2>
<div class="fg-anvil is-idle" id="fg-anvil" aria-live="polite"><div class="fg-win-title"><span class="fg-win-dot" aria-hidden="true"></span>${tr('주문서 강화', 'Scroll enhancement')}<span class="fg-win-sub">${tr('장비 없음', 'No gear')}</span></div>
<div class="fg-stage is-empty">
<div class="fg-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
<svg class="fg-circle" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="78"/><path d="M100 12 L176 144 L24 144 Z"/><path d="M100 188 L24 56 L176 56 Z"/><circle cx="100" cy="100" r="40"/></svg>
<div class="fg-pedestal" aria-hidden="true"></div>
<div class="fg-item fg-item-empty" aria-hidden="true"><span>?</span></div>
<p class="fg-drop-hint">${tr('왼쪽 선반에서 장비를 골라 작업대에 올려요.', 'Pick gear from the shelf to put it on the workbench.')}</p></div>
<div class="fg-tip"><h3>${tr('장비를 올려 주세요', 'Put gear on the bench')}</h3>
<p class="fg-req">${tr('착용 레벨', 'Req. level')} : —</p>
<ul class="fg-stats"><li>—</li></ul>
<p class="fg-slots">${tr('업그레이드 가능 횟수', 'Upgrades available')} : <b>—</b></p></div></div>
<div class="fg-log" id="fg-log" hidden></div></section>
<aside class="fg-shelf fg-scrolls" aria-labelledby="fg-sc-h"><h2 id="fg-sc-h">${tr('주문서 선반', 'Scroll shelf')}</h2><div id="fg-scroll-list"></div></aside>
</div>
${forgeGuide(ko)}
<noscript><p class="wrap">${tr('작 시뮬레이터는 자바스크립트가 켜져 있어야 움직여요.', 'The forge needs JavaScript.')}</p></noscript>
${jsonScript('fg-data', { lang, t: forgeStrings(lang) })}
</div>`;
}
