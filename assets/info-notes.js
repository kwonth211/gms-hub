// The ⓘ explanations on item and monster pages (how prices are worked out, what the drop labels mean, how accuracy is
// counted). They used to sit as the same paragraphs on hundreds of pages; now each page carries only its own content and
// the explanation is written into a dialog when the button is pressed (2026-11-22, owner: no repeated patterns).
const ko = document.documentElement.lang === 'ko';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NOTES = {
  'item-method': {
    title: ko ? '시세는 이렇게 계산해요' : 'How the prices are worked out',
    body: (b) => {
      let sites = [];
      try { sites = JSON.parse(b.dataset.sites || '[]'); } catch { /* no links */ }
      return (ko
        ? '<p>유저가 화면 스캔으로 올린 자유시장 상점 매물과, 팔렸다고 알려 준 매물로 계산해요.</p><p>맨 위 숫자는 지금 판매 중인 매물의 중앙값이에요. 중앙값에서 5배 넘게 벗어난 가격은 잘못 올린 값으로 보고 빼요.</p>'
        : '<p>Worked out from Free Market shop listings players uploaded with the screen scan, plus listings they reported as sold.</p><p>The headline is the median of what is for sale now. Prices more than 5× away from the median are treated as mistakes and left out.</p>')
        + (sites.length ? `<p>${ko ? '다른 시세 사이트' : 'Other price sites'}: ${sites.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</p>` : '');
    }
  },
  'drop-reports': {
    title: ko ? '드랍 제보는 이렇게 모아요' : 'Where the drop lists come from',
    body: ko
      ? '<p>플레이어가 실제로 주운 아이템을 제보로 모은 목록이에요. <b>반복 제보</b>는 여러 사람이 같은 드랍을 확인한 항목이고, <b>제보 적음</b>은 아직 확인한 사람이 적은 항목이에요.</p>'
      : '<p>Built from items players actually picked up and reported. <b>Repeated reports</b> were confirmed by several players; <b>limited reports</b> have fewer confirmations so far.</p>'
  },
  'drop-labels': {
    title: ko ? '제보 표시 기준' : 'About report labels',
    body: ko
      ? '<p>반복 제보는 긍정 의견의 가중 점수가 10 이상이면서 부정 의견의 3배 이상인 항목이에요. 그 밖에 긍정 의견이 더 많은 항목은 ‘제보 적음’으로 표시해요. 부정 의견이 같거나 더 많은 항목은 목록에서 뺐어요.</p><p>가중 점수는 사람 수나 드랍 확률이 아니에요.</p>'
      : '<p>Repeated reports have a positive weighted score of at least 10 and at least three times the negative score. Other net-positive entries are marked limited. Tied and net-negative reports are left out.</p><p>Weighted scores are neither player counts nor drop rates.</p>'
  },
  'mob-stats': {
    title: ko ? '능력치 읽는 법' : 'Reading the stats',
    body: ko
      ? '<p>공격 수치는 몬스터의 기본 능력치예요. 캐릭터가 실제로 받는 피해는 내 레벨과 방어력에 따라 달라져요.</p><p>EXP는 기본 경험치라 버프나 파티 나눔은 들어 있지 않아요. 넉백 수치는 한 줄 피해가 그 값 이상이어야 몬스터가 밀려난다는 뜻이에요.</p>'
      : '<p>Attack values are the monster’s base stats, not the damage you take; that depends on your level and defence.</p><p>EXP is the base value without buffs or party sharing. Knockback is the damage one line has to reach to push the monster back.</p>'
  },
  'mob-spawns': {
    title: ko ? '출현 지점 읽는 법' : 'Reading spawn points',
    body: ko
      ? '<p>맵마다 몬스터가 나오는 자리 수와, 그 맵 전체 자리 중 이 몬스터가 차지하는 비중이에요. 지금 떠 있는 마릿수나 시간당 젠 수는 아니에요.</p>'
      : '<p>Spawn points on each map and this monster’s share of all points there. They are not live counts or spawns per hour.</p>'
  },
  'mob-accuracy': {
    title: ko ? '필요 명중 계산 방법' : 'How accuracy is worked out',
    body: ko
      ? '<p>몇 방 컷 계산기와 같은 공식이에요. 커뮤니티에서 쓰는 값과 맞는지 확인했어요 (예: 루팡 37레벨 89, 32레벨 106, 레이스 48레벨 104).</p><p>내 레벨이 몬스터보다 높으면 같은 레벨 값과 같아요. 버프·물약을 포함한 총 명중 기준이에요.</p>'
      : '<p>Same formula as the hits-to-kill calculator; it matches community-quoted values (e.g. Lupin: 89 at level 37, 106 at level 32; Wraith: 104 at 48).</p><p>Above the monster’s level the requirement stays at the same-level value. It counts total accuracy including buffs and potions.</p>'
  }
};
function openNote(b) {
  const n = NOTES[b.dataset.info];
  if (!n) return;
  let d = document.getElementById('info-note');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'info-note';
    d.className = 'info-note';
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-info-close]')) d.close(); });
    document.body.append(d);
  }
  d.innerHTML = `<h2>${n.title}</h2>${typeof n.body === 'function' ? n.body(b) : n.body}<p class="info-note-actions"><button type="button" class="btn small-btn" data-info-close>${ko ? '닫기' : 'Close'}</button></p>`;
  d.showModal();
  globalThis.track?.('info_open', { ui_label: b.dataset.info });
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-info]'); if (b) openNote(b); });
