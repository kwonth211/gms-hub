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
<p class="trd-next"><a href="/${lang}/guides/glove-scroll-selling-price/" data-discover="selling_from_calc">${t('장공 중급 3,363건으로 본 판매 가격: 10만을 내리면 몇 건 앞으로 갈까요?', 'Pricing 3,363 Gloves Attack listings: what does a 100k cut change?')}</a></p>
<section class="trd-result" id="sl-result" hidden aria-live="polite">
<header class="trd-item" id="sl-item"></header>
<div class="trd-groups" id="sl-groups" role="group" aria-label="${t('옵션 고르기', 'Pick the options')}" hidden></div>
<div class="trd-cols">
<section class="panel trd-verdict" id="sl-verdict-panel"><h2>${t('이 값에 올리면', 'At this price')}</h2>
<div class="trd-price-row"><label class="trd-money"><span>${t('올릴 값', 'Your price')}</span><input id="sl-price" inputmode="decimal" autocomplete="off" aria-describedby="sl-price-help"><em>${t('메소', 'mesos')}</em></label>
<div class="trd-presets" id="sl-presets"></div></div>
<div class="trd-slide" hidden><input type="range" id="sl-slide" min="0" max="1000" step="1" value="500" aria-label="${t('값 조절', 'Adjust the price')}">
<div class="trd-slide-ends"><span>${t('시세의 절반', 'half')}</span><span>${t('시세', 'market')} <b id="sl-ref"></b></span><span>${t('시세의 2배', 'double')}</span></div>
<p class="trd-versus" id="sl-versus"></p></div>
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
    lead: t('장비, 주문서, 개수를 고르세요. 지금 시세로 쓰는 돈, 나오는 장비, 다 팔았을 때 남는 돈이 바로 나와요.', 'Pick a piece, a scroll and how many. You get what you spend at today\'s prices, what comes out, and what is left after selling it all.'),
    placeholder: t('장비 이름 (예: 노가다 목장갑)', 'Gear name (e.g. Work Gloves)'), pickLabel: t('장비 찾기', 'Find a piece of gear'), quickLabel: t('많이 거래되는 장비', 'Traded most'),
    steps: [['bag', t('장비 고르기', 'Pick the gear'), t('장갑, 무기, 방어구 다 돼요.', 'Gloves, weapons and armour.')],
      ['scroll', t('주문서 눌러서 채우기', 'Tap scrolls into the slots'), t('누를 때마다 한 장씩 들어가요.', 'One scroll per tap.')],
      ['coin', t('개수 넣고 남는 돈 보기', 'Set the amount, read what is left'), t('값은 전부 직접 고칠 수 있어요.', 'Every price can be edited.')]]
  })}
<div class="wrap trd-page" id="sp-page" data-api="${esc(api)}" data-items="${esc(itemsUrl)}" data-data="${esc(dataUrl)}" data-market="${esc(marketUrl)}">
<p class="trd-next"><a href="/${lang}/guides/work-gloves-buy-or-scroll/" data-discover="glove_study_from_calc">${t('공 6 목장갑은 살까요, 직접 작할까요? 실제 가격으로 계산한 손익', 'Buy or scroll 6 ATT Work Gloves? A worked example with real prices')}</a></p>
<section class="trd-result" id="sp-result" hidden aria-live="polite">
<header class="trd-item" id="sp-item"></header>
<section class="panel trd-scrolls"><h2><i class="trd-num">1</i>${t('주문서를 눌러 칸을 채우세요', 'Tap scrolls to fill the slots')}</h2>
<div class="trd-slots-row"><ol class="trd-slots" id="sp-slots" aria-label="${t('바를 순서', 'Order of scrolls')}"></ol>
<div class="trd-slots-acts"><button type="button" class="btn ghost small-btn" id="sp-fill">${t('남은 칸 채우기', 'Fill the rest')}</button><button type="button" class="btn ghost small-btn" id="sp-clear">${t('다 비우기', 'Clear')}</button></div></div>
<p class="muted small" id="sp-slots-note">${t('주문서를 누를 때마다 한 칸씩 채워져요. 채운 칸을 누르면 빠져요. 다른 % 주문서를 섞어도 돼요.', 'Each tap on a scroll fills one slot; tap a filled slot to empty it. Different % scrolls can be mixed.')}</p>
<div class="trd-scroll-list" id="sp-scrolls" role="group" aria-label="${t('바를 주문서', 'Scroll to use')}" aria-busy="true"></div></section>
<div class="trd-cols trd-cols-sp">
<section class="panel trd-costs"><h2><i class="trd-num">2</i>${t('한 개에 쓰는 돈', 'What one piece costs')}</h2>
<div class="trd-table trd-spend" id="sp-spend"></div>
<p class="muted small" id="sp-item-note"></p>
<p class="muted small" id="sp-scroll-note"></p>
<button type="button" class="btn ghost small-btn" id="sp-reset" hidden>${t('시세로 되돌리기', 'Back to market prices')}</button></section>
<section class="panel trd-outcomes"><h2 id="sp-out-title">${t('결과마다 남는 돈', 'What each result leaves')}</h2>
<p class="muted small" id="sp-table-note"></p>
<div class="trd-table" id="sp-table" aria-busy="true"></div></section>
</div>
<section class="trd-sum" id="sp-sum" aria-busy="true"></section>
<section class="panel trd-batch"><h2>${t('몇 개 작 할지 바꾸기', 'Change how many pieces')}</h2>
<div class="trd-qty"><button type="button" class="trd-qty-step" data-step="-1" aria-label="${t('한 개 줄이기', 'One fewer')}">−</button><input id="sp-qty" inputmode="numeric" autocomplete="off" value="10" aria-label="${t('작 할 장비 개수', 'Number of pieces')}"><button type="button" class="trd-qty-step" data-step="1" aria-label="${t('한 개 늘리기', 'One more')}">+</button><span>${t('개', 'pieces')}</span>
<div class="trd-qty-presets" role="group" aria-label="${t('개수 빠르게 고르기', 'Quick amounts')}">${[1, 5, 10, 50, 100].map((n) => `<button type="button" data-qty="${n}">${n}</button>`).join('')}</div></div>
<p class="trd-need" id="sp-need"></p></section>
<p class="trd-next"><a class="btn" id="sp-forge" href="${esc(forgeUrl)}">${t('작 시뮬레이터에서 발라 보기', 'Try it in the scroll forge')}</a><a class="btn ghost" id="sp-market" href="${esc(marketUrl)}">${t('이 장비 시세·매물 보기', 'See this piece on the market')}</a></p>
</section>
<section class="panel trd-start" id="sp-start"><h2>${t('위에서 장비를 고르면 여기에 나와요', 'Pick a piece above and the answer shows here')}</h2>
<ul class="trd-start-list"><li>${spriteSvg('coin', 26)}<p>${t('<strong>쓰는 돈</strong>: 깨끗한 장비와 주문서를 사는 값', '<strong>What you spend</strong>: the clean pieces and the scrolls')}</p></li>
<li>${spriteSvg('bag', 26)}<p>${t('<strong>결과마다 남는 돈</strong>: 공격력별로 팔 값 − 쓰는 돈 = 남는 돈', '<strong>What each result leaves</strong>: sale price − cost = left, for every result')}</p></li>
<li>${spriteSvg('star', 26)}<p>${t('<strong>여러 개 작 하면</strong>: 개수를 넣으면 평균으로 남는 돈과 이득으로 끝날 확률', '<strong>Several pieces</strong>: set a number to see the average left and the chance to end ahead')}</p></li></ul></section>
<noscript><p class="panel">${t('계산기는 자바스크립트를 켜야 움직여요.', 'Turn on JavaScript to use the calculator.')}</p></noscript>

<section class="panel trd-read"><h2>${t('읽는 법', 'How to read it')}</h2>
<ul class="trd-read-list"><li><span class="trd-read-ico">${spriteSvg('coin', 26)}</span><p>${t('<strong>쓰는 돈</strong>은 깨끗한 장비와 주문서 값이에요. 장비 한 개에 남은 횟수만큼 주문서가 들어가요.', '<strong>What you spend</strong> is the clean pieces plus the scrolls: one scroll for every slot of every piece.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('bag', 26)}</span><p>${t('<strong>결과마다 남는 돈</strong>은 그 결과가 나왔을 때 팔 값에서 쓴 돈을 뺀 값이에요. 줄마다 팔 값 − 쓰는 돈 = 남는 돈으로 적혀 있어요.', '<strong>What each result leaves</strong> is its sale price minus what the piece cost. Every row reads sale price − cost = left.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('star', 26)}</span><p>${t('<strong>여러 개 작 하면</strong>은 그 개수만큼 했을 때 평균으로 남는 돈이에요. 빨간 숫자면 할수록 잃어요.', '<strong>Scrolling several pieces</strong> is what that many leave on average. A red number loses more the more you do.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('clock', 26)}</span><p>${t('<strong>운이 나쁠 때와 좋을 때</strong>는 열 번 중 한 번꼴로 나오는 결과예요. 개수를 늘리면 운이 고르게 섞여서 평균에 가까워져요.', '<strong>Bad luck and good luck</strong> are the results you see about one time in ten. With more pieces the luck evens out and you land closer to the average.')}</p></li></ul>
<div class="faq"><details><summary>${t('결과별 팔 값은 어떻게 정하나요?', 'Where does each sale price come from?')}</summary><p>${t('능력치와 남은 횟수가 같은 장비를 최근 7일 매물에서 찾아요. 3개 넘게 팔렸으면 팔린 값의 중간을 쓰고, 덜 팔렸으면 올라온 매물 중 싼 쪽 값을 써요. 같은 능력치여도 남은 횟수에 따라 값이 크게 달라서 남은 횟수까지 같은 매물을 먼저 찾고, 없으면 남은 횟수가 가까운 매물의 값으로 어림해요. 어림한 줄에는 그렇게 적혀 있어요.', 'From the last 7 days of listings with the same stat and slots left. When three or more sold, it is the middle of what they sold for; otherwise the cheap end of what is asked. Slots left move the price a lot, so pieces with the same slots left are looked up first; without one, the price is worked out from pieces with the nearest slots left, and the row says so.')}</p></details>
<details><summary>${t('혼돈 주문서는 어떻게 계산하나요?', 'How are Chaos scrolls handled?')}</summary><p>${t('혼돈 주문서는 실패하면 절반 확률로 장비가 사라져요. 사라진 장비는 0 메소로 치고, 남은 주문서는 안 쓴 것으로 계산해요. 그래서 쓰는 돈이 평균으로 나와요.', 'A failed Chaos scroll destroys the piece half the time. A destroyed piece counts as 0 mesos and the scrolls left over are not spent, so the cost shown is an average.')}</p></details>
<details><summary>${t('주문서를 섞어 발라도 되나요?', 'Can I mix scrolls?')}</summary><p>${t('네. 주문서를 누를 때마다 한 칸씩 채워져요. 60% 세 장에 10% 두 장처럼 같은 능력치 주문서를 섞으면 그 순서대로 계산해요. 칸을 비워 둬도 돼요.', 'Yes. Each tap fills one slot. Mix scrolls of one stat, say three 60% and two 10%, and they are worked out in that order. Slots can stay empty.')}</p></details>
<details><summary>${t('전부 실패한 장비는 얼마로 치나요?', 'What is a piece worth when every scroll fails?')}</summary><p>${t('매물이 있으면 그 값을 쓰고, 없으면 0 메소로 쳐요. 능력치는 그대로인데 남은 횟수가 없어서 사는 사람이 드물어요.', 'Its market price when one is listed, else 0 mesos. Same stats and no slots left: few players buy it.')}</p></details>
<details><summary>${t('먼저 발라 보고 싶어요.', 'Can I try it first?')}</summary><p>${t('<a href="{forge}">작 시뮬레이터</a>에서 같은 장비에 주문서를 끌어다 발라 보세요. 주문서 종류별 상승치는 <a href="{scroll}">주문서 계산기</a>에 있어요.', 'Drag scrolls onto the same piece in the <a href="{forge}">scroll forge</a>. Stat gains per scroll tier are in the <a href="{scroll}">scroll calculator</a>.').replace('{forge}', esc(forgeUrl)).replace('{scroll}', esc(scrollUrl))}</p></details></div></section>
</div>`;
}

// /trade/: the buy and sell board (owner, 2026-11-24: its own counter, not the megaphone bar). A post is a 무료 고확
// underneath (worker/src/free-mega.js), so it also shows on the megaphone page, the top strip and Discord. The
// composer has a slider around the market price that says how dear the price is; assets/trade-board.js runs it.
export function tradeBoardBody({ lang, api, itemsUrl, marketUrl, megaphoneUrl, sellUrl, scamUrl, scanUrl = '', discordIcon = '' }) {
  const ko = lang === 'ko';
  const t = (k, e) => (ko ? k : e);
  const stat = (key, icon, label) => `<div class="trd-stat"><span class="trd-step-ico">${spriteSvg(icon, 28)}</span><b id="tb-stat-${key}" aria-busy="true"></b><span>${label}</span></div>`;
  return `<section class="trd-hero trd-hero-board"><div class="wrap trd-hero-in">
<div class="trd-hero-text"><span class="trd-tag">${spriteSvg('shop', 18)}${t('무료 · 로그인 없이', 'Free · no login')}</span>
<h1>${t('팝니다·삽니다 장터', 'Buy and sell market')}</h1>
<p class="lead">${t('유저가 올린 팝니다·삽니다를 한 줄씩 모아 보는 장터예요. 값 옆에 정가보다 얼마나 비싼지 붙어 있어요.', 'Buy and sell lines from players, one row each. Every price says how far it is from the market.')}</p>
<p class="trd-hero-cta"><button type="button" class="btn" data-tb-open>${spriteSvg('megaphone', 18)}<span>${t('팝니다·삽니다 올리기', 'Post a line')}</span></button></p></div>
<div class="trd-stats-row">${stat('all', 'shop', t('올라온 글', 'posts'))}${stat('sell', 'coin', t('팝니다', 'selling'))}${stat('buy', 'bag', t('삽니다', 'buying'))}${stat('shops', 'shop', t('열린 상점', 'open shops'))}</div>
</div></section>
<div class="wrap trd-page" id="tb-page" data-api="${esc(api)}" data-items="${esc(itemsUrl)}" data-market="${esc(marketUrl)}">
<form class="panel trd-post" id="tb-form" autocomplete="off" aria-label="${t('팝니다·삽니다 올리기', 'Post a buy or sell line')}" hidden>
<div class="trd-post-title"><h2>${t('올리기', 'Post')}</h2><button type="button" class="btn ghost small-btn" id="tb-close" aria-label="${t('올리기 닫기', 'Close the form')}">×</button></div>
<div class="trd-post-grid">
<div class="trd-post-main">
<div class="trd-intent" role="group" aria-label="${t('종류', 'Kind')}"><button type="button" data-intent="sell" aria-pressed="true">${t('팝니다', 'Selling')}</button><button type="button" data-intent="buy" aria-pressed="false">${t('삽니다', 'Buying')}</button></div>
<div class="trd-pick"><label class="trd-search-box">${SEARCH}<input id="trd-q" class="trd-search" type="search" role="combobox" aria-expanded="false" aria-controls="trd-opts" aria-autocomplete="list" placeholder="${t('아이템 이름 (예: 장공 60%)', 'Item name (e.g. Gloves Attack 60%)')}" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="${t('아이템 찾기', 'Find an item')}"></label>
<ul class="trd-opts" id="trd-opts" role="listbox" aria-label="${t('아이템 찾기', 'Find an item')}" hidden></ul></div>
<div class="trd-picked" id="tb-picked" hidden></div>
<label class="trd-money"><span id="tb-price-label">${t('팔 값 (한 개)', 'Price for one')}</span><input id="tb-price" inputmode="decimal" autocomplete="off"><em>${t('메소', 'mesos')}</em></label>
<div class="trd-slide" hidden><input type="range" id="tb-slide" min="0" max="1000" step="1" value="500" aria-label="${t('값 조절', 'Adjust the price')}">
<div class="trd-slide-ends"><span>${t('정가의 절반', 'half')}</span><span>${t('정가', 'market')} <b id="tb-ref"></b></span><span>${t('정가의 2배', 'double')}</span></div></div>
<div class="trd-post-row"><label class="trd-field">${t('내 닉네임', 'My game name')}<input id="tb-nick" maxlength="20" spellcheck="false" autocapitalize="off" placeholder="${t('귓말 받을 이름', 'Name to whisper')}"></label>
<label class="trd-field">${t('채널', 'Channel')}<select id="tb-ch"><option value="">${t('안 정함', 'Any')}</option>${Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">CH ${i + 1}</option>`).join('')}</select></label></div>
<label class="trd-field">${t('한마디 (안 적어도 돼요)', 'A few words (optional)')}<input id="tb-note" maxlength="80" placeholder="${t('예: 자시 3번 방, 흥정 가능', 'e.g. FM room 3, open to offers')}"></label>
<div class="trd-dm" id="tb-dm" hidden></div><template id="tb-dc">${discordIcon}</template>
</div>
<aside class="trd-post-side" aria-live="polite"><h3>${t('이 값은', 'This price')}</h3><div id="tb-meter" class="trd-meter"><p class="muted">${t('아이템을 고르면 정가보다 얼마나 비싼지 나와요.', 'Pick an item to see how it stands against the market.')}</p></div></aside>
</div>
<div class="trd-post-foot"><button type="submit" class="btn" id="tb-send">${spriteSvg('megaphone', 18)}<span id="tb-send-label">${t('팝니다 올리기', 'Post selling line')}</span></button><span class="trd-post-status" id="tb-status" role="status" aria-live="polite"></span></div>
<p class="muted small">${t('2분에 한 번, 하루 10번까지 올릴 수 있어요. 현금 거래, 링크, 연락처는 올릴 수 없어요. 신고가 3번 쌓이면 숨겨져요.', 'One post every 2 minutes, 10 a day. No real-money trades, links or contact handles. Three reports hide a post.')}</p>
</form>

<section class="panel trd-shops" id="tb-shops" aria-labelledby="tb-shops-h" hidden>
<div class="trd-shops-head"><h2 id="tb-shops-h">${spriteSvg('shop', 22)}${t('상점 스캔으로 올라온 상점', 'Shops from Shop Scan')} <small id="tb-shops-n"></small></h2>
<a class="trd-shops-add" href="${esc(scanUrl)}">${t('내 상점도 올리기', 'Add my shop')} →</a></div>
<p class="muted small">${t('최근 24시간 안에 상점 스캔으로 확인됐고 안 팔린 물건이 남은 상점이에요. 누르면 파는 물건과 값이 나와요.', 'Shops checked with Shop Scan in the last 24 hours that still have unsold items. Tap one to see what it sells.')}</p>
<div class="trd-shop-row" id="tb-shop-list" aria-busy="true"></div>
<button type="button" class="trd-report trd-shops-more" id="tb-shops-more" hidden></button>
<p class="muted small trd-shops-credit" id="tb-shops-credit" hidden>${t('캐릭터 모습: <a href="https://classicrank.com" target="_blank" rel="noopener">ClassicRank</a>', 'Character pictures: <a href="https://classicrank.com" target="_blank" rel="noopener">ClassicRank</a>')}</p>
</section>
<dialog class="trd-shopdlg" id="tb-shopdlg" aria-labelledby="tb-shopdlg-h"><div id="tb-shopdlg-body"></div></dialog>

<section class="panel trd-board" aria-label="${t('장터 목록', 'Market list')}">
<div class="trd-board-head">
<div class="trd-seg" id="tb-filter" role="group" aria-label="${t('종류', 'Kind')}"><button type="button" data-v="all" aria-pressed="true">${t('전체', 'All')}</button><button type="button" data-v="sell" aria-pressed="false">${t('팝니다', 'Selling')}</button><button type="button" data-v="buy" aria-pressed="false">${t('삽니다', 'Buying')}</button><button type="button" data-v="shop" aria-pressed="false">${t('상점', 'Shops')}</button></div>
<input id="tb-search" class="trd-board-search" type="search" placeholder="${t('아이템이나 닉네임', 'Item or name')}" aria-label="${t('장터에서 찾기', 'Search the market')}">
<label class="trd-sort">${t('정렬', 'Sort')}<select id="tb-sort"><option value="new">${t('최신순', 'Newest')}</option><option value="low">${t('값 싼 순', 'Cheapest')}</option><option value="high">${t('값 비싼 순', 'Dearest')}</option><option value="deal">${t('정가보다 싼 순', 'Furthest under market')}</option><option value="item">${t('아이템 이름순', 'Item name')}</option></select></label>
<button type="button" class="btn small-btn" data-tb-open>${t('올리기', 'Post')}</button></div>
<div class="trd-list" role="table" aria-label="${t('장터 목록', 'Market list')}">
<div class="trd-list-head" role="row"><span role="columnheader">${t('종류', 'Kind')}</span><span role="columnheader">${t('아이템', 'Item')}</span><span role="columnheader">${t('값', 'Price')}</span><span role="columnheader">${t('정가보다', 'vs market')}</span><span role="columnheader">${t('올린 사람', 'Posted by')}</span><span role="columnheader">${t('올린 때', 'When')}</span><span role="columnheader"></span></div>
<div class="trd-rows" id="tb-list" role="rowgroup" aria-busy="true"></div></div>
<p class="trd-none" id="tb-none" hidden></p>
<p class="muted small" id="tb-count" role="status"></p>
<noscript><p>${t('목록은 자바스크립트를 켜야 보여요.', 'Turn on JavaScript to see the list.')}</p></noscript>
</section>

<section class="panel trd-read"><h2>${t('거래하기 전에', 'Before you trade')}</h2>
<ul class="trd-read-list"><li><span class="trd-read-ico">${spriteSvg('coin', 26)}</span><p>${t('값을 정하기 어려우면 <a href="{sell}">팔릴 가격 계산기</a>에서 그 값대 매물이 몇 개나 팔렸는지 보세요.', 'Not sure about the price? The <a href="{sell}">sell price check</a> shows how many listings in that band sold.').replace('{sell}', esc(sellUrl))}</p></li>
<li><span class="trd-read-ico">${spriteSvg('megaphone', 26)}</span><p>${t('상대 닉네임은 <a href="{scam}">사기꾼 제보</a>에서 먼저 쳐 보세요. 10초면 돼요.', 'Type the other player\'s name into <a href="{scam}">scam reports</a> first. It takes 10 seconds.').replace('{scam}', esc(scamUrl))}</p></li>
<li><span class="trd-read-ico">${spriteSvg('chat', 26)}</span><p>${t('줄 끝에 <strong>거래 신청</strong>이 있으면 누르고 내 게임 닉네임을 적으세요. 글쓴이에게 디스코드 DM이 가고, 글쓴이가 게임에서 귓말을 보내요. <strong>귓말</strong>을 누르면 <code>/w 닉네임</code>이 복사돼서 내가 먼저 말을 걸 수 있어요.', 'When a row ends with <strong>Ask to trade</strong>, press it and type your game name. The writer gets a Discord DM and whispers you in game. <strong>Whisper</strong> copies <code>/w name</code> so you can say hello first.')}</p></li>
<li><span class="trd-read-ico">${spriteSvg('shop', 26)}</span><p>${t('교환창에서 아이템에 마우스를 올려 옵션과 개수를 다시 본 뒤에 확인을 누르세요.', 'In the trade window, hover the item and read its stats and count again before you press OK.')}</p></li></ul>
<div class="faq"><details><summary>${t('글은 얼마나 떠 있나요?', 'How long does a post stay up?')}</summary><p>${t('내가 지울 때까지 계속 떠 있어요. 팔렸으면 내 글의 지우기를 눌러 내리세요. 글을 올린 브라우저에서만 지울 수 있어요. 목록에는 최근 글 100개까지 나와요.', 'Until you delete it. Once it sells, press Delete on your post. Only the browser that posted it can delete it. The list shows the newest 100 posts.')}</p></details>
<details><summary>${t('거래 신청을 디스코드 DM으로 받으려면?', 'How do I get trade requests as a Discord DM?')}</summary><p>${t('올리기 창에서 <strong>디스코드 연결</strong>을 누르고 글을 올리세요. 누가 내 글에 거래 신청을 누르면 신청한 사람의 게임 닉네임이 DM으로 와요. 게임을 꺼 둔 동안에도 휴대폰으로 받아요. 연결하면 GMS Hub 디스코드 서버에 함께 들어가요.', 'Press <strong>Connect Discord</strong> in the post form, then post. When someone asks to trade, their game name arrives as a DM, on your phone too while the game is closed. Connecting also adds you to the GMS Hub Discord server.')}</p></details>
<details><summary>${t('거래 신청하려면 로그인해야 하나요?', 'Do I need to log in to ask for a trade?')}</summary><p>${t('아니요. 내 게임 닉네임만 적으면 돼요. 글 하나에 한 번, 20초에 한 번 신청할 수 있어요. 거래 신청 버튼은 글쓴이가 디스코드를 연결한 글에만 있어요.', 'No. Your game name is enough. One request per post, one every 20 seconds. The button shows only on posts whose writer connected Discord.')}</p></details>
<details><summary>${t('실시간 확성기의 무료 고확과 다른가요?', 'Is this different from a free megaphone?')}</summary><p>${t('같은 글이에요. 여기서 올리면 <a href="{mega}">실시간 확성기</a>에 무료 고확으로 뜨고, 무료 고확으로 올린 팝니다·삽니다도 여기에 떠요. 게임 안 고확은 여기에 안 떠요.', 'It is the same post. A line posted here shows on the <a href="{mega}">live megaphone page</a> as a free megaphone, and buy and sell lines posted as free megaphones show here. In-game megaphones do not.').replace('{mega}', esc(megaphoneUrl))}</p></details>
<details><summary>${t('여기서 말하는 정가는 어떤 값인가요?', 'Which price is the market price here?')}</summary><p>${t('<a href="{market}">실시간 시세</a>에 나오는 값이에요. 최근 하루 동안 팔린 값의 한가운데이고, 팔린 기록이 없으면 올라온 매물의 한가운데 값을 써요.', 'The price on the <a href="{market}">live market</a> page: the middle of what sold over the last day, or of what is listed when nothing sold.').replace('{market}', esc(marketUrl))}</p></details>
<details><summary>${t('이상한 글을 봤어요.', 'I saw a bad post.')}</summary><p>${t('줄 끝의 신고를 누르세요. 신고가 3번 쌓이면 글이 숨겨져요.', 'Press Report at the end of the row. Three reports hide the post.')}</p></details></div></section>
</div>`;
}
