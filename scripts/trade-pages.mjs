import { spriteSvg } from './sprites.mjs';
// The two 거래 tools (owner, 2026-11-24). Both read the shop listings the market page already shows:
//   /tools/sell/           what share of listings sold at each price (assets/sell.js)
//   /tools/scroll-profit/  what scrolling a piece costs and what the results sell for (assets/scroll-profit.js)
// The pages are shells with the reading guide written out; the scripts fill the numbers. assets/trade-math.js holds
// every rule and tests/trade-math.test.mjs runs them.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></svg>';

const hero = ({ key, tag, h1, lead, placeholder, pickLabel, quickLabel, steps }) => `<section class="trd-hero trd-hero-${key}"><div class="wrap trd-hero-in">
<div class="trd-hero-text"><span class="trd-tag">${spriteSvg('shop', 18)}${tag}</span>
<h1>${h1}</h1>
<p class="lead">${lead}</p>
<div class="trd-pick"><label class="trd-search-box">${SEARCH}<input id="trd-q" class="trd-search" type="search" role="combobox" aria-expanded="false" aria-controls="trd-opts" aria-autocomplete="list" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="${esc(pickLabel)}"></label>
<ul class="trd-opts" id="trd-opts" role="listbox" aria-label="${esc(pickLabel)}" hidden></ul></div>
<div class="trd-quick"><span class="trd-quick-label">${quickLabel}</span><div class="trd-quick-list" id="trd-quick" aria-busy="true"></div></div></div>
<ol class="trd-steps">${steps.map(([icon, title, text], i) => `<li><span class="trd-step-ico">${spriteSvg(icon, 30)}</span><b><i>${i + 1}</i>${title}</b><span>${text}</span></li>`).join('')}</ol>
</div></section>`;

export function sellBody({ lang, api, itemsUrl, marketUrl, megaphoneUrl }) {
  const ko = lang === 'ko';
  const t = (k, e) => (ko ? k : e);
  return `${hero({
    key: 'sell', tag: t('올리기 전에 10초', '10 seconds before you list'), h1: t('얼마에 올려야 팔릴까', 'What price sells?'),
    lead: t('아이템을 고르고 올릴 값을 적으세요. 최근 7일 동안 그 값에 나온 매물이 몇 개나 팔렸는지, 지금 올리면 몇 번째로 싼지 바로 나와요.', 'Pick an item and type your price. You get how many listings at that price sold over the last 7 days, and where yours would stand among what is on sale now.'),
    placeholder: t('아이템 이름 (예: 장공 60%)', 'Item name (e.g. Gloves Attack 60%)'), pickLabel: t('아이템 찾기', 'Find an item'), quickLabel: t('많이 팔린 아이템', 'Selling most'),
    steps: [['bag', t('아이템 고르기', 'Pick the item'), t('이름, 초성, 줄임말 다 돼요.', 'Names and common short forms work.')],
      ['coin', t('값 적기', 'Type a price'), t('150만, 1.5m처럼 적어도 읽어요.', '1.5m and 250k are read too.')],
      ['star', t('팔린 비율 보기', 'Read the share sold'), t('막대를 누르면 그 값대로 바뀌어요.', 'Tap a bar to jump to that price.')]]
  })}
<div class="wrap trd-page" id="sl-page" data-api="${esc(api)}" data-items="${esc(itemsUrl)}" data-market="${esc(marketUrl)}">
<section class="trd-result" id="sl-result" hidden aria-live="polite">
<header class="trd-item" id="sl-item"></header>
<div class="trd-groups" id="sl-groups" role="group" aria-label="${t('옵션 고르기', 'Pick the options')}" hidden></div>
<div class="trd-cols">
<section class="panel trd-verdict" id="sl-verdict-panel"><h2>${t('이 값에 올리면', 'At this price')}</h2>
<div class="trd-price-row"><label class="trd-money"><span>${t('올릴 값', 'Your price')}</span><input id="sl-price" inputmode="decimal" autocomplete="off" aria-describedby="sl-price-help"><em>${t('메소', 'mesos')}</em></label>
<div class="trd-presets" id="sl-presets"></div></div>
<p class="muted small" id="sl-price-help">${t('한 개 값이에요. 150만, 1.5m처럼 적어도 돼요.', 'Price for one. 1.5m or 250k is fine.')}</p>
<div id="sl-verdict" aria-busy="true"></div></section>
<section class="panel trd-rank"><h2>${t('지금 올리면 몇 번째', 'Where you would stand now')}</h2><div id="sl-rank" aria-busy="true"></div></section>
</div>
<section class="panel trd-curve"><h2>${t('값대별로 팔린 비율', 'Share sold by price band')}</h2>
<p class="muted small" id="sl-curve-note"></p>
<ol class="trd-bars" id="sl-bars" aria-busy="true"></ol></section>
<div class="trd-advice" id="sl-advice"></div>
<section class="panel trd-recent" id="sl-recent-panel" hidden><h2>${t('최근 매물', 'Recent listings')}</h2><div id="sl-recent"></div></section>
<p class="trd-next"><a class="btn" id="sl-market" href="${esc(marketUrl)}">${t('이 아이템 시세·매물 보기', 'See this item on the market')}</a><a class="btn ghost" href="${esc(megaphoneUrl)}#fm-form">${t('팝니다 올리기', 'Post a sell line')}</a></p>
</section>
<section class="panel trd-start" id="sl-start"><h2>${t('위에서 아이템을 고르면 여기에 나와요', 'Pick an item above and the answer shows here')}</h2>
<ul class="trd-start-list"><li>${spriteSvg('star', 26)}<p>${t('<strong>팔린 비율</strong>: 내 값대에 나온 매물 10개 중 몇 개가 팔렸는지', '<strong>Share sold</strong>: of every 10 listings in your price band, how many sold')}</p></li>
<li>${spriteSvg('crown', 26)}<p>${t('<strong>지금 순서</strong>: 지금 팔고 있는 매물 중 내 값이 몇 번째로 싼지', '<strong>Your place</strong>: how many listings on sale now are cheaper than yours')}</p></li>
<li>${spriteSvg('coin', 26)}<p>${t('<strong>빨리 팔 값</strong>: 절반 넘게 팔린 값대에서 제일 비싼 값', '<strong>Quick-sale price</strong>: the dearest price in the bands where more than half sold')}</p></li></ul></section>
<noscript><p class="panel">${t('계산기는 자바스크립트를 켜야 움직여요.', 'Turn on JavaScript to use the calculator.')}</p></noscript>

<section class="panel trd-read"><h2>${t('읽는 법', 'How to read it')}</h2>
<ul class="trd-read-list"><li><span class="trd-read-ico">${spriteSvg('star', 26)}</span><p>${t('채워진 칸이 <strong>팔린 비율</strong>이에요. 10칸 중 6칸이면 그 값대 매물 10개 중 6개가 팔렸어요.', 'The filled blocks are the <strong>share sold</strong>. Six of ten filled means 6 of every 10 listings in that band sold.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('coin', 26)}</span><p>${t('급하면 <strong>빨리 팔 값</strong> 밑으로 올리세요. 절반 넘게 팔린 값대 안에서 제일 비싼 값이에요.', 'In a hurry? List under the <strong>quick-sale price</strong>, the dearest price in the bands where more than half sold.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('crown', 26)}</span><p>${t('<strong>지금 몇 번째</strong>도 같이 보세요. 잘 팔리는 값이어도 더 싼 매물이 앞에 수십 개 쌓여 있으면 그만큼 기다려요.', 'Read <strong>where you would stand</strong> too. A price that sells still waits its turn behind every cheaper listing.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('clock', 26)}</span><p>${t('값을 내릴수록 비율이 올라가요. 막대를 눌러 가며 <strong>내가 기다릴 수 있는 만큼</strong>의 값을 고르세요.', 'The lower the price, the higher the share. Tap the bars and settle on the price that fits <strong>how long you can wait</strong>.')}</p></li></ul>
<div class="faq"><details><summary>${t('팔린 매물은 어떻게 세나요?', 'How are sold listings counted?')}</summary><p>${t('<a href="{market}">실시간 시세</a>에 올라온 매물 중 판매 완료가 붙은 것을 세요. 최근 7일 치예요.', 'They are the listings on the <a href="{market}">live market</a> page marked sold, over the last 7 days.').replace('{market}', esc(marketUrl))}</p></details>
<details><summary>${t('비싸게 올리면 정말 안 팔리나요?', 'Does a high price really not sell?')}</summary><p>${t('네. 11월 24일까지 7일 동안 장갑 공격력 주문서 60%는 144만 메소 밑 매물 321개 중 158개가 팔렸어요. 189만 메소부터는 411개 중 1개만 팔렸어요.', 'Yes. Over the 7 days to November 24, 158 of 321 Gloves Attack 60% scrolls listed under 1.44m mesos sold. From 1.89m up, 1 of 411 did.')}</p></details>
<details><summary>${t('장비는 왜 옵션을 고르나요?', 'Why pick options for gear?')}</summary><p>${t('같은 이름이어도 작 된 장비와 노작은 값이 달라요. 내 장비와 같은 옵션을 누르면 그 옵션끼리만 계산해요.', 'Scrolled and clean pieces of one name sell for different prices. Tap the options your piece has and only those listings are counted.')}</p></details>
<details><summary>${t('자료가 적다고 나와요.', 'It says there is too little data.')}</summary><p>${t('최근 7일 매물이 24개보다 적거나 팔린 매물이 3개보다 적으면 비율을 내지 않아요. 그때는 아래 최근 매물의 값과 판매 완료 표시를 보고 정하세요.', 'With fewer than 24 listings or fewer than 3 sold in 7 days no share is shown. Go by the prices and the sold marks in the recent listings below.')}</p></details></div></section>
</div>`;
}

export function scrollProfitBody({ lang, api, itemsUrl, dataUrl, marketUrl, forgeUrl, scrollUrl }) {
  const ko = lang === 'ko';
  const t = (k, e) => (ko ? k : e);
  return `${hero({
    key: 'scroll', tag: t('바르기 전에 10초', '10 seconds before you scroll'), h1: t('작 손익 계산기', 'Scroll profit calculator'),
    lead: t('장비와 주문서를 고르세요. 지금 시세로 끝까지 발랐을 때 드는 돈, 결과마다의 확률과 팔 값, 평균 손익이 나와요.', 'Pick a piece and a scroll. You get what it costs to use every slot at today\'s prices, the odds and sale price of each result, and the average profit.'),
    placeholder: t('장비 이름 (예: 노가다 목장갑)', 'Gear name (e.g. Work Gloves)'), pickLabel: t('장비 찾기', 'Find a piece of gear'), quickLabel: t('많이 거래되는 장비', 'Traded most'),
    steps: [['bag', t('장비 고르기', 'Pick the gear'), t('장갑, 무기, 방어구 다 돼요.', 'Gloves, weapons and armour.')],
      ['scroll', t('주문서 고르기', 'Pick the scroll'), t('100%, 60%, 10%, 혼돈.', '100%, 60%, 10% or Chaos.')],
      ['coin', t('손익 보기', 'Read the profit'), t('시세 칸은 직접 고칠 수 있어요.', 'Every price can be edited.')]]
  })}
<div class="wrap trd-page" id="sp-page" data-api="${esc(api)}" data-items="${esc(itemsUrl)}" data-data="${esc(dataUrl)}" data-market="${esc(marketUrl)}">
<section class="trd-result" id="sp-result" hidden aria-live="polite">
<header class="trd-item" id="sp-item"></header>
<section class="panel trd-scrolls"><h2>${t('바를 주문서', 'Scroll to use')}</h2><div class="trd-scroll-list" id="sp-scrolls" role="group" aria-label="${t('바를 주문서', 'Scroll to use')}" aria-busy="true"></div></section>
<div class="trd-cols trd-cols-sp">
<section class="panel trd-costs"><h2>${t('드는 돈', 'What it costs')}</h2>
<label class="trd-money"><span>${t('깨끗한 장비 값', 'Clean piece')}</span><input id="sp-item-price" inputmode="decimal" autocomplete="off"><em>${t('메소', 'mesos')}</em></label>
<p class="muted small" id="sp-item-note"></p>
<label class="trd-money"><span>${t('주문서 한 장 값', 'One scroll')}</span><input id="sp-scroll-price" inputmode="decimal" autocomplete="off"><em>${t('메소', 'mesos')}</em></label>
<p class="muted small" id="sp-scroll-note"></p>
<p class="trd-total" id="sp-total"></p>
<button type="button" class="btn ghost small-btn" id="sp-reset">${t('시세로 되돌리기', 'Back to market prices')}</button></section>
<section class="panel trd-verdict trd-verdict-sp"><h2>${t('지금 시세로 작 하면', 'Scrolling at today\'s prices')}</h2><div id="sp-verdict" aria-busy="true"></div></section>
</div>
<section class="panel trd-outcomes"><h2>${t('결과별 확률과 팔 값', 'Odds and sale price of each result')}</h2>
<p class="muted small" id="sp-table-note"></p>
<div class="trd-table" id="sp-table" aria-busy="true"></div></section>
<p class="trd-next"><a class="btn" id="sp-forge" href="${esc(forgeUrl)}">${t('작 시뮬레이터에서 발라 보기', 'Try it in the scroll forge')}</a><a class="btn ghost" id="sp-market" href="${esc(marketUrl)}">${t('이 장비 시세·매물 보기', 'See this piece on the market')}</a></p>
</section>
<section class="panel trd-start" id="sp-start"><h2>${t('위에서 장비를 고르면 여기에 나와요', 'Pick a piece above and the answer shows here')}</h2>
<ul class="trd-start-list"><li>${spriteSvg('coin', 26)}<p>${t('<strong>든 돈</strong>: 깨끗한 장비 한 개와 남은 횟수만큼의 주문서 값', '<strong>Cost</strong>: one clean piece plus a scroll for every slot')}</p></li>
<li>${spriteSvg('star', 26)}<p>${t('<strong>본전 넘길 확률</strong>: 든 돈보다 비싸게 팔리는 결과가 나올 확률', '<strong>Chance to come out ahead</strong>: the odds of a result that sells for more than it cost')}</p></li>
<li>${spriteSvg('hammer', 26)}<p>${t('<strong>평균 손익</strong>: 여러 번 했을 때 한 번에 남는 돈', '<strong>Average profit</strong>: what one run leaves you when you do it many times')}</p></li></ul></section>
<noscript><p class="panel">${t('계산기는 자바스크립트를 켜야 움직여요.', 'Turn on JavaScript to use the calculator.')}</p></noscript>

<section class="panel trd-read"><h2>${t('읽는 법', 'How to read it')}</h2>
<ul class="trd-read-list"><li><span class="trd-read-ico">${spriteSvg('coin', 26)}</span><p>${t('<strong>든 돈</strong>은 깨끗한 장비 한 개와 남은 횟수만큼의 주문서 값이에요. 두 값 다 직접 고칠 수 있어요.', '<strong>Cost</strong> is one clean piece plus one scroll per slot. Both prices can be edited.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('hammer', 26)}</span><p>${t('<strong>평균으로 건지는 돈</strong>은 결과마다 확률과 팔 값을 곱해서 더한 값이에요. 든 돈보다 적으면 할수록 손해예요.', '<strong>Average return</strong> is every result\'s odds times its sale price, added up. Below the cost, every run loses on average.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('star', 26)}</span><p>${t('<strong>본전 넘길 확률</strong>은 한 번 했을 때 든 돈보다 비싸게 팔리는 결과가 나올 확률이에요.', '<strong>Chance to come out ahead</strong> is the odds that one run ends on a result selling for more than it cost.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('scroll', 26)}</span><p>${t('시세가 없는 결과는 <strong>내가 팔 값</strong>을 적으세요. 적는 대로 평균 손익이 다시 계산돼요.', 'Where a result has no market price, type <strong>what you would sell it for</strong>. The average updates as you type.')}</p></li></ul>
<div class="faq"><details><summary>${t('결과별 팔 값은 어떻게 정하나요?', 'Where does each sale price come from?')}</summary><p>${t('성공 횟수와 능력치가 같고 남은 횟수가 0인 장비를 최근 7일 매물에서 찾아요. 3개 넘게 팔렸으면 팔린 값의 중간을 쓰고, 덜 팔렸으면 올라온 매물 중 싼 쪽 값을 써요. 비싼 쪽 매물은 잘 안 팔려요.', 'From the last 7 days of listings with the same passes and stat and no slots left. When three or more sold, it is the middle of what they sold for; otherwise the cheap end of what is asked, because the dear half rarely sells.')}</p></details>
<details><summary>${t('혼돈 주문서는 어떻게 계산하나요?', 'How are Chaos scrolls handled?')}</summary><p>${t('혼돈 주문서는 실패하면 절반 확률로 장비가 사라져요. 사라진 장비는 0 메소로 치고, 남은 주문서는 안 쓴 것으로 계산해요. 그래서 든 돈이 평균으로 나와요.', 'A failed Chaos scroll destroys the piece half the time. A destroyed piece counts as 0 mesos and the scrolls left over are not spent, so the cost shown is an average.')}</p></details>
<details><summary>${t('전부 실패한 장비는 얼마로 치나요?', 'What is a piece worth when every scroll fails?')}</summary><p>${t('매물이 있으면 그 값을 쓰고, 없으면 0 메소로 쳐요. 능력치는 그대로인데 남은 횟수가 없어서 사는 사람이 드물어요.', 'Its market price when one is listed, else 0 mesos. Same stats and no slots left: few players buy it.')}</p></details>
<details><summary>${t('먼저 발라 보고 싶어요.', 'Can I try it first?')}</summary><p>${t('<a href="{forge}">작 시뮬레이터</a>에서 같은 장비에 주문서를 끌어다 발라 보세요. 주문서 종류별 상승치는 <a href="{scroll}">주문서 계산기</a>에 있어요.', 'Drag scrolls onto the same piece in the <a href="{forge}">scroll forge</a>. Stat gains per scroll tier are in the <a href="{scroll}">scroll calculator</a>.').replace('{forge}', esc(forgeUrl)).replace('{scroll}', esc(scrollUrl))}</p></details></div></section>
</div>`;
}
