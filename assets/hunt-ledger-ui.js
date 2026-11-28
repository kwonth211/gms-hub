import { bindSupplySearch } from './hunt-supplies.js';
import { settleHunt } from './hunt-ledger.js';
import { renderPersonalHunts } from './hunt-personal.js';

export function createHuntLedger({ ko, session, currentRow, person, rows, demo, running, persistSession, persistRows, redrawLog, onSaved = () => {}, itemsUrl, api }) {
  const $ = id => document.getElementById(`hl-${id}`);
  const L = (k, e) => ko ? k : e;
  const nf = n => Math.round(n).toLocaleString(ko ? 'ko' : 'en');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let selected = null, shown = null, dirty = false, saveTimer = null;
  const fields = ['start', 'end', 'gear', 'purchased', 'otherIn', 'otherOut', 'soldAfter'];
  const target = () => selected === null ? currentRow() : rows().find(r => r.id === selected);
  const potionHtml = (p = {}) => `<div class="hl-potion" ${p.item ? `data-item="${esc(p.item)}" data-basis="${esc(p.basis || '')}"` : ''}><div class="hl-search"><label>${L('소모품 검색', 'Find supplies')}<input data-p="name" maxlength="60" autocomplete="off" value="${esc(p.name)}" placeholder="${L('예: 파란 포션', 'e.g. Blue Potion')}" required></label><div data-suggestions class="hl-suggestions" hidden></div></div><label>${L('사용 개수', 'Quantity used')}<input data-p="used" type="number" min="0" max="1000000000000" step="1" inputmode="numeric" value="${esc(p.used)}" required></label><label>${L('개당 가격', 'Unit price')}<input data-p="price" type="number" min="0" max="1000000000000" step="1" inputmode="numeric" value="${esc(p.price)}" required></label><button type="button" class="btn ghost small-btn" data-remove>${L('삭제', 'Remove')}</button><small data-price-note class="muted hl-price-note">${p.item && p.price !== '' ? L('저장된 개당 가격', 'Saved unit price') : ''}</small></div>`;
  const read = () => ({ ...Object.fromEntries(fields.map(k => [k, $(k).value.trim()])), noPotions: $('noPotions').checked,
    potions: [...$('potions').children].map(el => ({ ...Object.fromEntries([...el.querySelectorAll('[data-p]')].map(i => [i.dataset.p, i.value.trim()])), ...(el.dataset.item ? { item: Number(el.dataset.item), basis: el.dataset.basis || '' } : {}) })) });
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
    if (shown !== key) { fill(selected === null ? session().huntDraft || row?.settlement?.input : row?.huntDraft || row?.settlement?.input); shown = key; dirty = !!(selected === null ? session().huntDraftDirty : row?.huntDraft); $('status').textContent = ''; }
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
    $('context').textContent = `${selected === null ? L('현재 측정', 'Current session') : new Date(row.at).toLocaleString(ko ? 'ko' : 'en')} · ${row?.spot || (selected === null && session().spot) || L('위에서 사냥터 메모를 적으세요.', 'Name your spot above.')} · ${elapsed}`;
    if (demo()) $('status').textContent = L('예시 화면에서는 정산을 저장하지 않아요.', 'The example does not save settlements.');
    else if (selected === null && running()) $('status').textContent = L('입력하면 바로 계산해요. 측정을 정지하면 기록에 자동 저장해요.', 'Calculates as you type. Your finished run is saved automatically.');
    else if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(commit, 350); }
    renderPersonalHunts(document.getElementById('hp-results'), demo() ? [] : rows(), person(), ko);
  }
  function changed() {
    if (demo()) return;
    dirty = true;
    let kept = true;
    if (selected === null) { session().huntDraft = read(); session().huntDraftDirty = true; kept = persistSession(); }
    refresh();
    if (selected !== null) { const row = target(); const next = rows().map(r => r.id === row?.id ? { ...r, huntDraft: read(), settlement: null } : r); kept = persistRows(next); }
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
  $('form').addEventListener('submit', e => { e.preventDefault(); commit(); });
  bindSupplySearch({ root: $('potions'), ko, itemsUrl, api, changed, disabled: demo });
  function commit() {
    clearTimeout(saveTimer);
    if (!dirty || demo() || (selected === null && running())) return;
    const row = target(), input = read(), result = settleHunt(input, row?.durationMs);
    if (!result.ok) {
      const previous = rows().find(r => r.id === row?.id);
      if (previous?.settlement) { const next = rows().map(r => r.id === row.id ? { ...r, settlement: null, huntDraft: input } : r); if (persistRows(next)) { onSaved(next.find(r => r.id === row.id)); } }
      $('status').textContent = error(result.error); return;
    }
    if (!row || !Number.isFinite(row.activeMs) || row.activeMs < 180000 || !(row.gained > 0) || !Number.isFinite(row.durationMs) || row.durationMs <= 0) { $('status').textContent = L('계산 완료 · 경험치가 오른 기록을 3분 이상 측정하면 자동 저장돼요.', 'Calculated · saves automatically after 3 active minutes with EXP gained.'); return; }
    if (!row.spot?.trim() || !row.job || !row.level) { $('status').textContent = L('계산 완료 · 사냥터·레벨·직업을 고르면 기록에 저장돼요.', 'Calculated · choose your spot, level and class to save the run.'); return; }
    const settlement = { version: 1, sampleEnd: row.at, input, savedAt: Date.now() };
    const next = [...rows()], i = next.findIndex(r => r.id === row.id);
    if (i >= 0) next[i] = { ...next[i], ...row, settlement, huntDraft: null }; else next.unshift({ ...row, settlement, huntDraft: null });
    if (!persistRows(next)) { $('status').textContent = L('저장 공간이 부족해 정산을 저장하지 못했어요. 엑셀로 기록을 받은 뒤 오래된 기록을 정리하세요.', 'Storage is full. Download your log, then remove old records before saving.'); return; }
    if (row.id === session().samples[0]?.t) { session().huntDraft = input; session().huntDraftDirty = false; persistSession(); }
    dirty = false; redrawLog(); refresh(); onSaved(next.find(r => r.id === row.id));
    $('status').textContent = L('자동 저장됐어요.', 'Saved automatically.');
    window.gtag?.('event', 'hunt_settlement_save', { page_type: 'exp', minutes: Math.round(row.durationMs / 60000), updated: i >= 0 });
  }
  addEventListener('pagehide', commit);
  return { refresh, flush: commit };
}
