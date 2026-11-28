export function huntLedgerBody(lang) {
  const L = (ko, en) => lang === 'ko' ? ko : en;
  const input = (id, label, extra = '') => `<label>${label}<input id="hl-${id}" name="${id}" type="number" min="0" max="1000000000000" step="1" inputmode="numeric" ${extra}></label>`;
  return `<details class="panel hunt-ledger" id="hunt-ledger">
<summary><h2 id="hl-title">${L('이번 사냥 정산', 'Settle this hunt')}</h2><span class="muted small">${L('포션값 빼고 남은 메소 보기', 'See your earnings after supply costs')}</span></summary>
<p>${L('시작·종료 메소와 사용한 포션을 적으면, 사냥하고 남은 메소를 계산해요.', 'Enter your starting and ending mesos and the supplies you used to see what you earned.')}</p>
<p class="muted small" id="hl-context"></p>
<button type="button" class="btn ghost small-btn" id="hl-current" hidden>${L('현재 측정으로 돌아가기', 'Back to the current session')}</button>
<form id="hl-form">
<fieldset id="hl-fields"><div class="hl-fields">
${input('start', L('사냥 시작 메소', 'Starting wallet'), 'required')}${input('end', L('사냥 종료 메소', 'Ending wallet'), 'required')}
<label>${L('장비·버프 메모', 'Gear and buffs')}<input id="hl-gear" name="gear" type="text" maxlength="100" placeholder="${L('예: 공 6 장갑 · 공버프 없음', 'e.g. 6 ATT gloves, no attack buff')}"></label>
</div>
<h3>${L('사용한 포션·소모품', 'Supplies used')}</h3>
<p class="muted small">${L('아이템을 고르면 시세가 들어가요. 사용 개수만 적으세요. 실제 구매 가격으로 바꿔도 돼요.', 'Choose an item to fill its market price, then enter the quantity used. You can edit the price you paid.')}</p>
<label class="exp-check"><input id="hl-noPotions" name="noPotions" type="checkbox"> ${L('포션·소모품을 쓰지 않았어요', 'No supplies used')}</label>
<div id="hl-potions"></div>
<button type="button" class="btn ghost small-btn" id="hl-add">+ ${L('소모품 추가', 'Add supplies')}</button>
<details class="hl-adjust"><summary>${L('사냥 중 포션을 샀거나, 거래·창고 입출금이 있었어요', 'Purchases, trades or storage transfers during the hunt')}</summary>
<div class="hl-fields">
${input('purchased', L('도중에 포션·소모품을 산 금액', 'Supplies purchased during the hunt'), 'placeholder="0"')}
${input('otherIn', L('사냥과 무관하게 들어온 메소', 'Unrelated incoming mesos'), 'placeholder="0"')}
${input('otherOut', L('사냥과 무관하게 나간 메소', 'Unrelated outgoing mesos'), 'placeholder="0"')}
${input('soldAfter', L('종료 메소를 적은 뒤 받은 드랍 판매금', 'Drop sales received after the ending wallet count'), 'placeholder="0"')}
</div><p class="muted small">${L('종료 메소에 이미 들어 있는 드랍 판매금은 다시 적지 마세요. 아직 안 팔린 드랍은 수익에 넣지 않아요.', 'Do not add drop sales already in the ending wallet. Unsold drops are left out.')}</p></details>
<dl class="hl-totals"><div><dt>${L('사냥 수입', 'Hunt income')}</dt><dd id="hl-earned">—</dd></div><div><dt>${L('사용한 소모품값', 'Supplies consumed')}</dt><dd id="hl-cost">—</dd></div><div><dt>${L('남은 메소', 'Net mesos')}</dt><dd id="hl-net">—</dd></div><div><dt>${L('시간당 순수익', 'Net mesos / hour')}</dt><dd id="hl-rate">—</dd></div></dl>
<p class="muted small">${L('시간당 순수익은 첫 EXP 기록부터 마지막 기록까지, 쉬는 시간을 포함해 계산해요.', 'Net mesos per hour uses the time between the first and last EXP readings, including breaks.')}</p>
<p class="muted small">${L('입력하면 바로 계산하고, 측정이 끝난 기록에 자동 저장해요.', 'Calculates as you type and saves automatically to your finished run.')}</p>
</fieldset><p id="hl-status" role="status" aria-live="polite"></p>
</form></details>${huntRecommendationsBody(lang)}`;
}

export function huntRecommendationsBody(lang, finder = false) {
  const L = (ko, en) => lang === 'ko' ? ko : en;
  return `<section class="panel hunt-personal" id="hunt-personal" hidden ${finder ? 'data-hunt-finder' : ''} aria-labelledby="hp-title"><h2 id="hp-title">${L('내 기록에서 고른 사냥터', 'Training spots from your own runs')}</h2><p class="muted small">${L('정산을 저장한 10분 이상 기록만 써요. 같은 직업·현재 레벨 ±5를 모으고, 파티 인원과 장비 메모가 다른 기록은 나눠요. 두 순위 모두 쉬는 시간을 포함해요.', 'Uses settled runs of at least 10 minutes in your class, within 5 levels. Party sizes and gear notes stay separate. Both rankings include breaks.')}</p><div id="hp-results" class="hp-results"></div><a href="/${lang}/tools/exp/#hunt-ledger">${L('경험치 측정하고 정산하기', 'Measure EXP and settle a hunt')}</a></section>`;
}
