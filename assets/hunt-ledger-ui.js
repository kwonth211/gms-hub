import { settleHunt } from './hunt-ledger.js';
import { renderPersonalHunts } from './hunt-personal.js';

export function createHuntLedger({ ko, session, currentRow, person, rows, demo, running, persistSession, persistRows, redrawLog }) {
  const $ = id => document.getElementById(`hl-${id}`);
  const L = (k, e) => ko ? k : e;
  const nf = n => Math.round(n).toLocaleString(ko ? 'ko' : 'en');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let selected = null, shown = null, dirty = false;
  const fields = ['start', 'end', 'gear', 'purchased', 'otherIn', 'otherOut', 'soldAfter'];
  const target = () => selected === null ? currentRow() : rows().find(r => r.id === selected);
  const potionHtml = (p = {}) => `<div class="hl-potion"><label>${L('소모품 이름', 'Supply name')}<input data-p="name" maxlength="60" value="${esc(p.name)}" required></label><label>${L('사용 개수', 'Quantity used')}<input data-p="used" type="number" min="0" max="1000000000000" step="1" inputmode="numeric" value="${esc(p.used)}" required></label><label>${L('개당 가격', 'Unit price')}<input data-p="price" type="number" min="0" max="1000000000000" step="1" inputmode="numeric" value="${esc(p.price)}" required></label><button type="button" class="btn ghost small-btn" data-remove>${L('삭제', 'Remove')}</button></div>`;
  const read = () => ({ ...Object.fromEntries(fields.map(k => [k, $(k).value.trim()])), noPotions: $('noPotions').checked,
    potions: [...$('potions').children].map(el => Object.fromEntries([...el.querySelectorAll('[data-p]')].map(i => [i.dataset.p, i.value.trim()]))) });
  function fill(input = {}) {
    for (const k of fields) $(k).value = input[k] ?? '';
    $('noPotions').checked = input.noPotions === true;
    $('potions').innerHTML = (Array.isArray(input.potions) && input.potions.length ? input.potions.slice(0, 8) : [{}]).map(potionHtml).join('');
    document.querySelector('.hl-adjust').open = ['purchased', 'otherIn', 'otherOut', 'soldAfter'].some(k => Number(input[k]) > 0);
    dirty = false;
  }
  const error = key => ({ wallet: L('시작·종료 메소를 0 이상의 정수로 적으세요.', 'Enter starting and ending wallets as whole, nonnegative mesos.'),
    adjustment: L('구매·입출금 금액을 0 이상의 정수로 적으세요.', 'Enter purchases and transfers as whole, nonnegative mesos.'),
    potions: L('포션 이름·사용 개수·개당 가격을 모두 적으세요. 쓰지 않았다면 위 항목에 체크하세요.', 'Fill in each supply name, quantity and unit price, or check “No supplies used”.') }[key]);
  function refresh() {
    if (selected !== null && !target()) { selected = null; shown = null; }
    const key = selected === null ? `current:${session().samples[0]?.t || 'empty'}:${demo()}` : `log:${selected}`;
    const row = target();
    if (shown !== key) { fill(selected === null ? session().huntDraft || row?.settlement?.input : row?.settlement?.input); shown = key; $('status').textContent = ''; }
    $('fields').disabled = demo();
    $('current').hidden = selected === null;
    const noSupplies = $('noPotions').checked;
    $('potions').hidden = noSupplies; $('add').hidden = noSupplies;
    $('add').disabled = $('potions').children.length >= 8;
    for (const input of $('potions').querySelectorAll('input')) input.disabled = noSupplies;
    const result = settleHunt(read(), row?.durationMs);
    for (const [id, k] of [['earned', 'earned'], ['cost', 'supplyCost'], ['net', 'net'], ['rate', 'perHour']]) $(id).textContent = result.ok && result[k] != null ? nf(result[k]) : '—';
    $('net').classList.toggle('hl-loss', result.ok && result.net < 0);
    const elapsed = row?.durationMs ? L(`${nf(row.durationMs / 60000)}분`, `${nf(row.durationMs / 60000)} min`) : L('EXP 기록 2개부터 시간을 계산해요.', 'Time starts with two EXP readings.');
    $('context').textContent = `${selected === null ? L('현재 측정', 'Current session') : new Date(row.at).toLocaleString(ko ? 'ko' : 'en')} · ${row?.spot || L('위에서 사냥터 메모를 적으세요.', 'Name your spot above.')} · ${elapsed}`;
    $('save').disabled = demo() || (selected === null && running());
    if (demo()) $('status').textContent = L('예시 화면에서는 정산을 저장하지 않아요.', 'The example does not save settlements.');
    else if (selected === null && running()) $('status').textContent = L('입력한 값은 보관해요. 측정을 정지한 뒤 종료 메소를 적고 저장하세요.', 'Your inputs are kept. Stop measuring, enter the ending wallet, then save.');
    else if (dirty) $('status').textContent = L('정산을 고쳤어요. 저장 버튼을 눌러 기록에 반영하세요.', 'Settlement edited. Save to update the log.');
    renderPersonalHunts(document.getElementById('hp-results'), demo() ? [] : rows(), person(), ko);
  }
  function changed() {
    if (demo()) return;
    dirty = true;
    let kept = true;
    if (selected === null) { session().huntDraft = read(); kept = persistSession(); }
    refresh();
    if (kept === false) $('status').textContent = L('브라우저 저장 공간이 부족해 입력값을 보관하지 못했어요.', 'Browser storage is full; inputs were not kept.');
  }
  $('form').addEventListener('input', changed);
  $('form').addEventListener('change', changed);
  $('add').addEventListener('click', () => { if (demo() || $('potions').children.length >= 8) return; $('potions').insertAdjacentHTML('beforeend', potionHtml()); changed(); $('potions').lastElementChild.querySelector('input').focus(); });
  $('potions').addEventListener('click', e => { const button = e.target.closest('[data-remove]'); if (!button || demo()) return; button.closest('.hl-potion').remove(); changed(); });
  $('current').addEventListener('click', () => { selected = null; shown = null; $('status').textContent = ''; refresh(); });
  document.getElementById('exp-log-body').addEventListener('click', e => {
    const button = e.target.closest('[data-settle]'); if (!button || demo()) return;
    selected = Number(button.dataset.settle); shown = null; $('status').textContent = ''; refresh();
    document.getElementById('hunt-ledger').open = true;
    document.getElementById('hunt-ledger').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); $('start').focus({ preventScroll: true });
  });
  if (location.hash === '#hunt-ledger') document.getElementById('hunt-ledger').open = true;
  $('form').addEventListener('submit', e => {
    e.preventDefault();
    if (demo() || (selected === null && running())) return;
    const row = target(), input = read(), result = settleHunt(input, row?.durationMs);
    if (!result.ok) { $('status').textContent = error(result.error); return; }
    if (!row || !Number.isFinite(row.activeMs) || row.activeMs < 180000 || !(row.gained > 0) || !Number.isFinite(row.durationMs) || row.durationMs <= 0) { $('status').textContent = L('경험치가 오른 기록을 3분 이상 측정한 뒤 저장하세요.', 'Measure at least 3 active minutes with EXP gained before saving.'); return; }
    if (!row.spot?.trim() || !row.job || !row.level) { $('status').textContent = L('사냥터 메모·레벨·직업을 먼저 적으세요.', 'Enter the spot, level and class first.'); return; }
    const settlement = { version: 1, sampleEnd: row.at, input, savedAt: Date.now() };
    const next = [...rows()], i = next.findIndex(r => r.id === row.id);
    if (i >= 0) next[i] = { ...next[i], ...row, settlement }; else next.unshift({ ...row, settlement });
    if (!persistRows(next)) { $('status').textContent = L('저장 공간이 부족해 정산을 저장하지 못했어요. 엑셀로 기록을 받은 뒤 오래된 기록을 정리하세요.', 'Storage is full. Download your log, then remove old records before saving.'); return; }
    if (row.id === session().samples[0]?.t) { session().huntDraft = input; persistSession(); }
    dirty = false; redrawLog(); refresh();
    $('status').textContent = L('정산을 사냥 기록에 저장했어요.', 'Settlement saved to the training log.');
    window.gtag?.('event', 'hunt_settlement_save', { page_type: 'exp', minutes: Math.round(row.durationMs / 60000), updated: i >= 0 });
  });
  return { refresh };
}
