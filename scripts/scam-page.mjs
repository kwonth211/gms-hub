import { spriteSvg } from './sprites.mjs';
// /scam/: names players warned about over megaphones, with the line and who shouted it (worker/src/scam.js keeps them;
// assets/scam.js fills the numbers, the cards and the filters). Visitors can add a report or ask for their own name to
// be taken down; both go to the owner first (/admin/scam/). A megaphone is one player's word, so every name shows the
// words and the caller.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></svg>';

export function scamBody({ lang, megaphoneUrl }) {
  const ko = lang === 'ko';
  const t = (k, e) => (ko ? k : e);
  // The scams megaphones warn about most, as cards: what happens, and the one move that stops it.
  const scams = [
    ['scroll', 'scroll', t('주문서 바꿔치기', 'Scroll swap'), t('교환창에 60% 주문서를 올렸다가 10%로 바꿔요. 아이콘이 같아요.', 'A 60% scroll goes into the trade window, then a 10% takes its place. The icons are the same.'), t('확인을 누르기 직전에 주문서에 마우스를 올려 %를 다시 봐요.', 'Hover the scroll and read the % again right before you press OK.')],
    ['switch', 'sword', t('장비 바꿔치기', 'Bait and switch'), t('작 된 장비를 보여 주고 교환창에는 노작을 올려요.', 'They show the scrolled piece and put a clean one in the trade window.'), t('교환창 안의 장비에 마우스를 올려 공격력과 남은 횟수를 봐요.', 'Hover the piece inside the trade window and read its attack and slots.')],
    ['spot', 'tree', t('자리 사기', 'Spot scam'), t('자리값을 먼저 받고 안 비키거나, 팔고 나서 다시 들어와요.', 'They take the spot fee first and stay, or sell the spot and walk back in.'), t('자리를 넘겨받고 상대가 채널을 옮긴 뒤에 줘요.', 'Pay after you hold the spot and they have changed channel.')],
    ['fame', 'star', t('인기도 사기', 'Fame scam'), t('인기도를 먼저 받고 돈을 안 주거나, 돈을 받고 안 올려 줘요.', 'They take the fame and never pay, or take the mesos and never fame.'), t('반씩 나눠요. 메소 절반, 인기도, 나머지 절반 순서로 해요.', 'Split it: half the mesos, the fame, then the other half.')],
    ['bundle', 'bag', t('묶음 사기', 'Bundle scam'), t('여러 개를 한 번에 판다고 하고 일부만 올려요.', 'They sell a bundle and put only part of it in.'), t('교환창의 개수를 세고 나서 확인을 눌러요.', 'Count what is in the trade window before you press OK.')]
  ];
  const stat = (key, icon, label) => `<div class="sc-stat sc-stat-${key}"><span class="sc-stat-ico">${spriteSvg(icon, 28)}</span><b data-sc-stat="${key}" aria-busy="true"></b><span>${label}</span></div>`;
  return `<section class="sc-hero"><div class="wrap sc-hero-in">
<div class="sc-hero-text"><span class="sc-hero-tag">${spriteSvg('megaphone', 18)}${t('거래 전에 10초', '10 seconds before a trade')}</span>
<h1>${t('사기꾼 제보', 'Scam reports')}</h1>
<p class="lead">${t('거래하기 전에 상대 닉네임을 쳐 보세요. 게임 고확에서 사기꾼이라고 불린 닉네임을, 누가 뭐라고 외쳤는지와 함께 모아 둬요.', 'Type the other player\'s name before you trade. These are the names called scammers over megaphones, with who shouted what.')}</p>
<label class="sc-search-box">${SEARCH}<input id="sc-search" class="sc-search" type="search" maxlength="13" placeholder="${t('닉네임 검색', 'Search a name')}" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="${t('닉네임 검색', 'Search a name')}"></label>
<p class="sc-verdict" id="sc-verdict" role="status" hidden></p></div>
<div class="sc-stats">${stat('names', 'megaphone', t('신고된 닉네임', 'names reported'))}${stat('many', 'crown', t('여러 명이 외친 닉네임', 'named by several players'))}${stat('reports', 'chat', t('쌓인 신고', 'reports kept'))}${stat('day', 'clock', t('24시간 안에 새로 신고', 'reported in the last 24 h'))}</div>
</div></section>
<div class="wrap sc-page" id="sc-page" data-megaphone="${esc(megaphoneUrl)}">
<section class="sc-hot" id="sc-hot" hidden aria-label="${t('여러 명이 외친 닉네임', 'Named by several players')}"><h2>${spriteSvg('crown', 24)}${t('여러 명이 외친 닉네임', 'Named by several players')}</h2>
<p class="muted small">${t('서로 다른 사람이 따로 외친 닉네임이에요. 거래할 때 제일 조심하세요.', 'Different players called these names out on their own. Take the most care with them.')}</p>
<ol class="sc-hot-list" id="sc-hot-list"></ol></section>

<section class="sc-list-panel" aria-label="${t('신고된 닉네임', 'Reported names')}">
<div class="sc-tools"><div class="sc-chips-filter" id="sc-kinds" role="group" aria-label="${t('사기 종류', 'Kind of scam')}"></div>
<div class="sc-seg" id="sc-sort" role="group" aria-label="${t('정렬', 'Sort')}"><button type="button" data-v="n" aria-pressed="true">${t('신고 많은 순', 'Most reports')}</button><button type="button" data-v="last" aria-pressed="false">${t('최근 신고 순', 'Latest')}</button></div>
<a class="btn sc-report-btn" href="#sc-report">${t('사기꾼 제보하기', 'Report a scammer')}</a></div>
<p class="muted small sc-count" id="sc-count" role="status"></p>
<ol class="sc-list" id="sc-list" aria-busy="true"></ol>
<p id="sc-none" class="panel" hidden></p>
<noscript><p class="panel">${t('목록은 자바스크립트를 켜야 보여요.', 'Turn on JavaScript to see the list.')}</p></noscript>
</section>

<div class="sc-forms">
<section class="panel sc-form-panel sc-form-report" id="sc-report"><h2>${spriteSvg('megaphone', 26)}${t('사기꾼 제보하기', 'Report a scammer')}</h2>
<p>${t('사기를 당했거나 사기 치는 걸 봤으면 적어 주세요. 운영자가 읽어 본 뒤에 목록에 올려요.', 'Scammed, or watched one happen? Write it down. The site owner reads every report before it goes on the list.')}</p>
<form id="sc-report-form" class="sc-form" autocomplete="off">
<label>${t('사기꾼 닉네임', 'Scammer\'s game name')}<input name="nick" maxlength="13" required pattern="[A-Za-z0-9]{2,13}" spellcheck="false" autocapitalize="off" placeholder="${t('게임 닉네임 그대로', 'Exactly as in game')}"></label>
<label>${t('무슨 일이 있었나요', 'What happened')}<textarea name="text" rows="4" minlength="10" maxlength="300" required placeholder="${t('예: 자리값 3만 메소를 받고 자리를 안 비켜 줬어요. 11월 24일 포가튼 30채널.', 'e.g. Took 30k for a spot and never left. Nov 24, Forgotten Hollow ch 30.')}"></textarea></label>
<label>${t('내 닉네임 (안 적어도 돼요)', 'Your game name (optional)')}<input name="me" maxlength="13" pattern="[A-Za-z0-9]{2,13}" spellcheck="false" autocapitalize="off"></label>
<div class="sc-form-foot"><button type="submit" class="btn">${t('제보 보내기', 'Send report')}</button><span class="sc-status" role="status" aria-live="polite"></span></div>
<p class="muted small">${t('링크는 넣을 수 없어요. 내 닉네임은 운영자만 봐요.', 'No links. Only the site owner sees your own name.')}</p>
</form></section>

<section class="panel sc-form-panel sc-form-appeal" id="sc-appeal"><h2>${spriteSvg('leaf', 26)}${t('내 닉네임을 내려 주세요', 'Take my name down')}</h2>
<p>${t('목록에 내 닉네임이 잘못 올라왔으면 여기에 적어 주세요. 운영자가 읽고, 맞으면 목록에서 내려요.', 'If your name is on the list by mistake, write here. The site owner reads it and takes the name down when you are right.')}</p>
<form id="sc-appeal-form" class="sc-form" autocomplete="off">
<label>${t('내 닉네임', 'Your game name')}<input name="nick" maxlength="13" required pattern="[A-Za-z0-9]{2,13}" spellcheck="false" autocapitalize="off"></label>
<label>${t('어떤 일이었는지', 'Your side of it')}<textarea name="message" rows="4" minlength="10" maxlength="600" required placeholder="${t('예: 그 거래는 끝까지 했어요. 상대가 값을 깎아 달라고 해서 거절한 거예요.', 'e.g. The trade went through. They asked for a discount and I said no.')}"></textarea></label>
<label>${t('답을 받을 곳 (디스코드 아이디나 이메일, 안 적어도 돼요)', 'Where to reach you (Discord name or email, optional)')}<input name="contact" maxlength="80"></label>
<div class="sc-form-foot"><button type="submit" class="btn ghost">${t('내려 달라고 보내기', 'Send request')}</button><span class="sc-status" role="status" aria-live="polite"></span></div>
</form></section>
</div>

<section class="sc-guide"><h2>${t('자주 나오는 사기 수법', 'Scams you will see most')}</h2>
<ul class="sc-scams">${scams.map(([key, icon, name, how, stop]) => `<li class="sc-scam sc-k-${key}"><span class="sc-scam-ico">${spriteSvg(icon, 34)}</span><h3>${name}</h3><p>${how}</p><p class="sc-stop"><b>${t('이렇게 막아요', 'How to stop it')}</b>${stop}</p></li>`).join('')}</ul></section>

<section class="panel sc-read"><h2>${t('이 목록 읽는 법', 'How to read this list')}</h2>
<ul class="sc-read-list"><li><span class="sc-read-ico">${spriteSvg('chat', 26)}</span><p>${t('닉네임마다 <strong>외친 말 그대로</strong>와 <strong>외친 사람</strong>, 시간이 붙어 있어요. 무슨 일로 신고됐는지 읽어 보세요.', 'Every name carries <strong>the words as shouted</strong>, <strong>who shouted them</strong> and when. Read what the report is about.')}</p></li>
<li><span class="sc-read-ico">${spriteSvg('crown', 26)}</span><p>${t('<strong>외친 사람 수</strong>를 보세요. 여러 사람이 따로 외친 닉네임은 조심해야 해요. 한 사람만 외친 건 둘이 싸운 것일 때도 있어요.', 'Look at <strong>how many players</strong> shouted. A name called out by several different players deserves care. One caller alone is sometimes just two players in a fight.')}</p></li>
<li><span class="sc-read-ico">${spriteSvg('megaphone', 26)}</span><p>${t('고확은 화면 글자를 읽어서 모아요. 그래서 실제로 있는 캐릭터 닉네임만 올려요.', 'Megaphones are read off the game screen, so only names of characters that exist go up.')}</p></li></ul>
<div class="faq"><details><summary>${t('목록은 어떻게 만들어지나요?', 'How is the list made?')}</summary><p>${t('게임 고확에서 다른 사람을 사기꾼이라고 외친 말이 올라오면 그 닉네임과 외친 말을 여기에 남겨요. <a href="{mega}">실시간 확성기</a>에 뜬 것과 같은 고확이에요. 사이트로 들어온 제보는 운영자가 읽은 뒤에 올려요.', 'When a megaphone calls another player a scammer, the name and the line are kept here. They are the same megaphones you see on the <a href="{mega}">live megaphone page</a>. Reports sent through the site go up after the site owner has read them.').replace('{mega}', esc(megaphoneUrl))}</p></details>
<details><summary>${t('제 닉네임이 올라와 있어요. 어떻게 내리나요?', 'My name is on it. How do I get it down?')}</summary><p>${t('닉네임 카드의 <strong>내 닉네임이에요</strong>를 누르거나 위의 <a href="#sc-appeal">내 닉네임을 내려 주세요</a>에 적어 주세요. 운영자가 읽고 답해요.', 'Press <strong>This is me</strong> on the name\'s card, or write in <a href="#sc-appeal">Take my name down</a> above. The site owner reads it and answers.')}</p></details>
<details><summary>${t('사기를 당했어요. 뭐부터 하나요?', 'I got scammed. What first?')}</summary><p>${t('스크린샷을 찍고 게임 안 신고를 먼저 넣어요. 그다음 여기에 제보해 주세요. 다음 사람이 같은 닉네임을 쳐 보고 피할 수 있어요.', 'Take a screenshot and file the in-game report first. Then report it here, so the next player who types that name can walk away.')}</p></details></div></section>
</div>`;
}
