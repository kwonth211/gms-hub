// Live megaphones, read from the game by the admin collector; assets/megaphone.js fills the feed.
export function megaphoneBody({ lang, itemsUrl, marketUrl }) {
  const ko = lang === 'ko';
  return `<section class="page-head wrap"><h1>${ko ? '실시간 확성기' : 'Live megaphones'}</h1>
<p class="lead">${ko ? '게임 안 고확을 실시간으로 모아 보여 드려요. 분홍은 고확, 노랑은 아이템 고확, 청록은 더블 아이템 고확이에요. 아이템이 나오면 지금 시세와 비교해 드리고, 귓말 명령어도 바로 복사돼요.' : 'Super megaphones from the game, live: pink for super megaphones, gold for item megaphones, teal for double item megaphones. Items are compared with the current market price, and the whisper command copies in one tap.'}</p></section>
<div class="wrap mg-page" id="mg-page" data-items="${itemsUrl}" data-market="${marketUrl}">
<section class="panel mega-trends" data-mega-trends="full" data-items="${itemsUrl}" data-market="${marketUrl}" data-megaphone="${ko ? '/ko/megaphone/' : '/en/megaphone/'}" hidden aria-label="${ko ? '오늘의 고확' : "Today's megaphones"}"></section>
<section class="mg-feed-panel" aria-label="${ko ? '게임 확성기' : 'Game megaphones'}">
<div class="mg-filters">
<div class="chips" role="group" aria-label="${ko ? '종류' : 'Type'}">
<button type="button" class="chip" data-intent="" aria-pressed="true">${ko ? '전체' : 'All'}</button>
<button type="button" class="chip" data-intent="sell" aria-pressed="false">${ko ? '팝니다' : 'Selling'}</button>
<button type="button" class="chip" data-intent="buy" aria-pressed="false">${ko ? '삽니다' : 'Buying'}</button>
<button type="button" class="chip" data-intent="item" aria-pressed="false">${ko ? '아이템 고확만' : 'Item megaphones'}</button>
</div>
<select id="mg-channel" aria-label="${ko ? '채널' : 'Channel'}"><option value="">${ko ? '모든 채널' : 'All channels'}</option>${Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">CH ${i + 1}</option>`).join('')}</select>
<input id="mg-search" class="mg-search" type="search" placeholder="${ko ? '검색: 아이템(한글·영어), 닉네임, 가격…' : 'Search items, names, prices…'}" autocomplete="off">
<label class="mg-check"><input type="checkbox" id="mg-once" checked> ${ko ? '같은 글 한 번만' : 'Hide repeats'}</label>
<button type="button" class="btn ghost small-btn mg-ai-btn" id="mg-ai" hidden></button>
</div>
<p class="muted small mg-note">${ko ? '화면 글자 인식으로 모아서 오타가 있을 수 있어요. 한국어 풀이는 거래 용어 기준 자동 풀이예요.' : 'Read from the game screen, so expect the odd typo.'}</p>
<p class="muted small mg-count" id="mg-count" role="status"></p>
<ol class="mg-feed" id="mg-feed" aria-live="polite" tabindex="0"></ol>
<p id="mg-empty" class="panel" hidden>${ko ? '아직 들어온 확성기가 없어요. 수집이 켜지면 여기에 바로 나와요.' : 'No megaphones yet. They appear here as soon as collection is running.'}</p>
</section>
</div>`;
}
