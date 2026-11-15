import { spriteSvg } from './sprites.mjs';
// Live megaphones, read from the game by the admin collector; assets/megaphone.js fills the feed.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n) => new Intl.NumberFormat('en-US').format(n);

// What the page says without JavaScript (and what a crawler reads): the build-time snapshot of the day's megaphones
// (data/mega-snapshot.json, scripts/fetch-page-snapshots.mjs), how to read a trade megaphone, and common questions.
function guide(ko, snap, itemName, itemHref) {
  const items = (snap?.items || []).slice(0, 10);
  const day = (snap?.at || '').slice(0, 10), t = snap?.today;
  const top = items.length && t ? (ko
    ? `<section class="panel mg-guide"><h2>오늘 많이 외친 아이템</h2>
<p>${day} 집계로 이날 확성기 ${nf(t.n)}개가 올라왔고, 외친 사람은 ${nf(t.nicks)}명이에요. 그중 ${nf(t.withItem)}개가 아이템을 걸고 사고팔았어요. 많이 외친 순서예요.</p>
<div class="table-wrap"><table class="data"><thead><tr><th scope="col">아이템</th><th scope="col">확성기</th><th scope="col">팝니다</th><th scope="col">삽니다</th></tr></thead><tbody>${items.map((r) => `<tr><th scope="row"><a href="${itemHref(r.item)}">${esc(itemName(r.item))}</a></th><td class="num">${nf(r.n)}</td><td class="num">${nf(r.sell)}</td><td class="num">${nf(r.buy)}</td></tr>`).join('')}</tbody></table></div>
<p class="muted small">팝니다가 삽니다보다 훨씬 많으면 물량이 넘치는 거라 값이 내려가기 쉬워요. 반대로 삽니다가 많으면 찾는 사람이 많다는 뜻이에요.</p></section>`
    : `<section class="panel mg-guide"><h2>Most shouted items today</h2>
<p>On ${day}, ${nf(t.n)} megaphones went up from ${nf(t.nicks)} players, and ${nf(t.withItem)} of them were buying or selling an item. The most shouted:</p>
<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Item</th><th scope="col">Megaphones</th><th scope="col">Selling</th><th scope="col">Buying</th></tr></thead><tbody>${items.map((r) => `<tr><th scope="row"><a href="${itemHref(r.item)}">${esc(itemName(r.item))}</a></th><td class="num">${nf(r.n)}</td><td class="num">${nf(r.sell)}</td><td class="num">${nf(r.buy)}</td></tr>`).join('')}</tbody></table></div>
<p class="muted small">Far more sellers than buyers means plenty of supply, and prices tend to slide; more buyers than sellers means the item is in demand.</p></section>`) : '';
  return top + (ko
    ? `<section class="panel mg-guide"><h2>확성기 읽는 법</h2>
<p>클래식 월드 확성기는 대부분 영어 약어로 써요. 자주 나오는 것만 알면 거래 확성기는 거의 다 읽혀요.</p>
<div class="table-wrap"><table class="data"><thead><tr><th scope="col">확성기에 쓰는 말</th><th scope="col">뜻</th></tr></thead><tbody>
<tr><td>S&gt; · WTS · selling</td><td>팝니다</td></tr><tr><td>B&gt; · WTB · buying</td><td>삽니다</td></tr><tr><td>T&gt;</td><td>교환해요</td></tr>
<tr><td>C/O</td><td>지금까지 들어온 최고 제시가</td></tr><tr><td>B/O · A/W</td><td>이 값이면 바로 팔아요 (즉구가)</td></tr><tr><td>OBO</td><td>더 좋은 제안이면 협상 가능</td></tr>
<tr><td>ea</td><td>개당 가격</td></tr><tr><td>PM me · W me</td><td>귓말 주세요</td></tr><tr><td>clean · 7 slots</td><td>주문서를 안 바른 장비 · 업그레이드 가능 횟수 7</td></tr>
<tr><td>100k · 1.5m · 1b</td><td>10만 · 150만 · 10억 메소</td></tr><tr><td>FM · cc</td><td>자유시장 · 채널 이동</td></tr></tbody></table></div>
<p>확성기 색도 뜻이 있어요. 분홍은 일반 고확, 노랑은 아이템을 함께 보여 주는 아이템 고확, 청록은 아이템 두 개를 보여 주는 더블 아이템 고확이에요. 아이템 고확은 아이템 정보가 같이 떠서 장비 거래에 많이 써요.</p></section>
<section class="panel mg-guide"><h2>이 페이지 쓰는 법</h2>
<ul><li><strong>검색</strong>: 아이템 이름(한글·영어), 닉네임, 가격으로 찾아요.</li>
<li><strong>시세 비교</strong>: 아이템이 걸린 확성기에는 지금 자유시장 중간값이 함께 나와서, 부른 값이 싼지 비싼지 바로 보여요.</li>
<li><strong>귓말 복사</strong>: 버튼 한 번이면 /w 닉네임 명령어가 복사돼요. 게임 채팅창에 붙여 넣으면 돼요.</li></ul>
<div class="faq"><details><summary>확성기는 얼마나 빨리 올라오나요?</summary><p>수집기가 게임 화면에서 읽는 대로 바로 들어와요. 페이지를 열어 두면 새 확성기가 위에 자동으로 붙어요.</p></details>
<details><summary>글자가 가끔 틀린 이유는?</summary><p>게임 화면의 글자를 읽어서 모으기 때문에 비슷한 글자를 헷갈릴 때가 있어요. 가격과 닉네임은 거래 전에 게임에서 한 번 더 확인하세요.</p></details>
<details><summary>한국어 풀이는 어떻게 만드나요?</summary><p>위 표의 거래 용어를 기준으로 자동으로 풀어요. 아이템 이름은 게임의 한국어 이름으로 바꿔 보여 줘요.</p></details></div></section>`
    : `<section class="panel mg-guide"><h2>How to read a megaphone</h2>
<p>Classic World megaphones are mostly shorthand. Know these and you can read nearly every trade megaphone.</p>
<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Written</th><th scope="col">Meaning</th></tr></thead><tbody>
<tr><td>S&gt; · WTS</td><td>Selling</td></tr><tr><td>B&gt; · WTB</td><td>Buying</td></tr><tr><td>T&gt;</td><td>Trading</td></tr>
<tr><td>C/O</td><td>Best offer so far</td></tr><tr><td>B/O · A/W</td><td>Buyout: sells at once for this</td></tr><tr><td>OBO</td><td>Or best offer</td></tr>
<tr><td>ea</td><td>Each</td></tr><tr><td>PM me · W me</td><td>Whisper me</td></tr><tr><td>clean · 7 slots</td><td>Unscrolled gear · 7 upgrades left</td></tr>
<tr><td>100k · 1.5m · 1b</td><td>100,000 · 1,500,000 · 1,000,000,000 mesos</td></tr><tr><td>FM · cc</td><td>Free Market · change channel</td></tr></tbody></table></div>
<p>Colours mean something too: pink is a super megaphone, gold an item megaphone that shows the item, teal a double item megaphone that shows two. Item megaphones carry the item's stats, so gear trades use them most.</p></section>
<section class="panel mg-guide"><h2>How to use this page</h2>
<ul><li><strong>Search</strong> by item name, player name or price.</li>
<li><strong>Price check</strong>: megaphones with an item show the current Free Market median, so you can tell a cheap ask from a steep one.</li>
<li><strong>Copy whisper</strong>: one tap copies the /w command; paste it into the game chat.</li></ul>
<div class="faq"><details><summary>How fast do megaphones show up?</summary><p>As soon as the collector reads them off the game screen. Leave the page open and new ones land on top.</p></details>
<details><summary>Why is a letter wrong now and then?</summary><p>Megaphones are read from the game screen, so similar letters get mixed up. Check the price and name in game before you trade.</p></details></div></section>`);
}

// 무료 고확: a slim chat-like bar above the feed (assets/megaphone.js drives it). Works without login.
function freeComposer(ko) {
  const t = (k, e) => (ko ? k : e);
  return `<form class="fm-form" id="fm-form" autocomplete="off" aria-label="${t('무료 고확 쏘기', 'Send a free megaphone')}">
<div class="fm-bar">
<span class="fm-badge">${t('무료 고확', 'Free mega')}</span>
<input id="fm-nick" class="fm-nick" maxlength="13" placeholder="${t('내 닉네임', 'My game name')}" aria-label="${t('내 게임 닉네임 (귓말 받을 이름)', 'Your game name (for whispers)')}" title="${t('귓말 받을 게임 닉네임', 'Your game name, for whispers')}" spellcheck="false" autocapitalize="off">
<div class="fm-types" role="group" aria-label="${t('종류', 'Kind')}"><button type="button" data-intent="sell" aria-pressed="true">${t('팝니다', 'Selling')}</button><button type="button" data-intent="buy" aria-pressed="false">${t('삽니다', 'Buying')}</button><button type="button" data-intent="talk" aria-pressed="false">${t('한마디', 'Chat')}</button></div>
<div class="fm-line"><input id="fm-text" class="fm-text" maxlength="100" placeholder="${t('예: 장공 180만 급처', 'e.g. gloves att 1.8m')}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="fm-suggest" aria-label="${t('아이템, 가격, 한마디', 'Item, price and note')}"><ul id="fm-suggest" class="fm-suggest" role="listbox" hidden></ul></div>
<select id="fm-ch" class="fm-ch" aria-label="${t('채널 (선택)', 'Channel (optional)')}"><option value="">${t('채널', 'CH')}</option>${Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">CH ${i + 1}</option>`).join('')}</select>
<button type="submit" class="btn fm-send" id="fm-send">${spriteSvg('megaphone', 18)}<span>${t('쏘기', 'Send')}</span></button>
</div>
<p class="fm-rules muted small"><span id="fm-status" class="fm-status" role="status" aria-live="polite"></span> ${t('무료 고확은 24시간 동안 떠 있고 2분에 한 번 쏠 수 있어요. 현금 거래, 링크, 연락처는 올릴 수 없어요. 신고가 3번 쌓이면 숨겨져요.', 'Free megaphones stay up for 24 hours, one every 2 minutes. No real-money trades, links or contact handles. Three reports hide a post.')}</p>
</form>`;
}

export function megaphoneBody({ lang, itemsUrl, marketUrl, snapshot, itemName = (id) => `#${id}`, itemHref = () => marketUrl }) {
  const ko = lang === 'ko';
  return `<section class="page-head wrap"><h1>${ko ? '실시간 확성기' : 'Live megaphones'}</h1>
<p class="lead">${ko ? '게임 안 고확을 실시간으로 모아 보여 드려요. 분홍은 고확, 노랑은 아이템 고확, 청록은 더블 아이템 고확이에요. 여기서 <b>무료 고확</b>을 쏘면 모든 페이지 맨 위 띠에도 같이 흘러가요.' : 'Super megaphones from the game, live: pink for super megaphones, gold for item megaphones, teal for double item megaphones. Send a <b>free megaphone</b> here and it rolls across the top of every page too.'}</p></section>
<div class="wrap mg-page" id="mg-page" data-items="${itemsUrl}" data-market="${marketUrl}">
<section class="panel mega-trends" data-mega-trends="full" data-items="${itemsUrl}" data-market="${marketUrl}" data-megaphone="${ko ? '/ko/megaphone/' : '/en/megaphone/'}" hidden aria-label="${ko ? '오늘의 고확' : "Today's megaphones"}"></section>
<section class="mg-feed-panel" aria-label="${ko ? '게임 확성기' : 'Game megaphones'}">
${freeComposer(ko)}
<div class="mg-filters"><input id="mg-search" class="mg-search" type="search" placeholder="${ko ? '검색: 아이템(한글·영어), 닉네임, 가격…' : 'Search items, names, prices…'}" autocomplete="off">
<div class="mg-seg" data-mg-view="src" role="group" aria-label="${ko ? '어디서 온 고확' : 'Source'}"><button type="button" data-v="all" aria-pressed="true">${ko ? '전체' : 'All'}</button><button type="button" data-v="free" aria-pressed="false">${ko ? '무료 고확' : 'Free megas'}</button><button type="button" data-v="game" aria-pressed="false">${ko ? '게임 고확' : 'In game'}</button></div>
<div class="mg-seg" data-mg-view="intent" role="group" aria-label="${ko ? '팝니다·삽니다' : 'Selling or buying'}"><button type="button" data-v="all" aria-pressed="true">${ko ? '모두' : 'Both'}</button><button type="button" data-v="sell" aria-pressed="false">${ko ? '팝니다' : 'Selling'}</button><button type="button" data-v="buy" aria-pressed="false">${ko ? '삽니다' : 'Buying'}</button></div></div>
<p class="muted small mg-note">${ko ? '화면 글자 인식으로 모아서 오타가 있을 수 있어요. 한국어 풀이는 거래 용어 기준 자동 풀이예요.' : 'Read from the game screen, so expect the odd typo.'}</p>
<p class="muted small mg-count" id="mg-count" role="status"></p>
<ol class="mg-feed" id="mg-feed" aria-live="polite" tabindex="0"></ol>
<p id="mg-empty" class="panel" hidden>${ko ? '아직 들어온 확성기가 없어요. 수집이 켜지면 여기에 바로 나와요.' : 'No megaphones yet. They appear here as soon as collection is running.'}</p>
</section>
${guide(ko, snapshot, itemName, itemHref)}
</div>`;
}
