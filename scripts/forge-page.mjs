// /tools/forge/: the scroll forge. A workbench where you pick a piece of gear, drag scrolls onto it and see what the game
// would do: success adds the scroll's stats, every attempt uses an upgrade slot, a Chaos scroll that fails can destroy the
// item. Odds, stats and slots are the client's (data/forge.json, scripts/fetch-forge.mjs); prices come from the market.
// The page is a shell; assets/forge.js draws the shelves and the anvil from /assets/forge-data.json.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function forgeStrings(lang) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  return {
    equips: tr('장비 선반', 'Gear shelf'), scrolls: tr('주문서 선반', 'Scroll shelf'), anvil: tr('작업대', 'Workbench'), log: tr('작업 기록', 'Work log'),
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

export function forgeBody({ lang, jsonScript, dataUrl }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  return `<link rel="stylesheet" href="__FG_CSS__">
<div class="fg">
<section class="fg-hero wrap"><h1>${tr('주문서 작 시뮬레이터', 'Scroll forge')}</h1>
<p>${tr('장비를 작업대에 올리고 주문서를 끌어다 발라 보세요. 성공률, 오르는 능력치, 업그레이드 횟수, 혼돈 주문서 파괴까지 게임과 똑같이 굴러가요. 바른 주문서 값은 실시간 시세로 계산해요.', 'Put gear on the workbench and drag scrolls onto it. Success rates, stat gains, upgrade slots and Chaos scrolls destroying items work just like the game, and the scrolls you use are priced from the live market.')}</p></section>
<div class="wrap fg-bench" id="fg-bench" data-url="${esc(dataUrl)}">
<aside class="fg-shelf fg-equips" aria-labelledby="fg-eq-h"><h2 id="fg-eq-h">${tr('장비 선반', 'Gear shelf')}</h2>
<input id="fg-q" type="search" autocomplete="off" placeholder="${tr('장비 이름 (예: 브라운 워크 장갑)', 'Gear name (e.g. Brown Work Gloves)')}" aria-label="${tr('장비 검색', 'Search gear')}">
<div class="fg-cats" id="fg-cats" role="group" aria-label="${tr('부위', 'Slot')}"></div>
<label class="fg-check"><input type="checkbox" id="fg-ok" checked> ${tr('지금 얻을 수 있는 장비만', 'Only gear you can get now')}</label>
<ul class="fg-list" id="fg-equip-list" aria-live="polite"></ul></aside>
<section class="fg-center" aria-labelledby="fg-anvil-h"><h2 id="fg-anvil-h" class="sr-only">${tr('작업대', 'Workbench')}</h2>
<div class="fg-anvil" id="fg-anvil" aria-live="polite"><p class="fg-empty">${tr('왼쪽 선반에서 장비를 골라 작업대에 올려요.', 'Pick gear from the shelf to put it on the workbench.')}</p></div>
<div class="fg-log" id="fg-log" hidden></div></section>
<aside class="fg-shelf fg-scrolls" aria-labelledby="fg-sc-h"><h2 id="fg-sc-h">${tr('주문서 선반', 'Scroll shelf')}</h2><div id="fg-scroll-list"></div></aside>
</div>
<noscript><p class="wrap">${tr('작 시뮬레이터는 자바스크립트가 켜져 있어야 움직여요.', 'The forge needs JavaScript.')}</p></noscript>
${jsonScript('fg-data', { lang, t: forgeStrings(lang) })}
</div>`;
}
