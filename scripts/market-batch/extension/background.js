importScripts('config.private.js');
const SCHEDULE = 'gms-market-hourly', WATCHDOG = 'gms-market-watchdog', RETRY = 'gms-market-upload';
const INTERVAL = 15 * 60000;
const COLLECT_RETRY = 'gms-market-collect-retry';
const PAGE = 'https://meso.watch/?gms-batch=1';
const ENDPOINT = 'https://gms-hub-votes.kwonth211.workers.dev/internal/market-batch';
let serial = Promise.resolve();
const enqueue = fn => { const next = serial.then(fn); serial = next.catch(() => {}); return next; };
const get = async () => (await chrome.storage.local.get('state')).state || { enabled: false, cursor: 0, history: [] };
const put = state => chrome.storage.local.set({ state });
const owned = tab => tab?.url?.startsWith(PAGE) || tab?.pendingUrl?.startsWith(PAGE);
async function broadcast() {
  const s = await get();
  // No secret is ever included in content-script messages or the public DOM.
  return { ...s, version: '0.4.0', nextAt: s.retryAt || (await chrome.alarms.get(SCHEDULE))?.scheduledTime || null };
}
async function ensureAlarms() {
  const s = await get();
  await chrome.alarms.clear('gms-market-15m');
  const scheduled = await chrome.alarms.get(SCHEDULE);
  const gate = Math.max((s.lastAttemptAt || 0) + INTERVAL, s.lastSuccessAt ? Date.parse(s.lastSuccessAt) + INTERVAL : 0, s.retryAt || 0);
  if (s.enabled && (!scheduled || scheduled.periodInMinutes !== 15 || scheduled.scheduledTime < gate))
    await chrome.alarms.create(SCHEDULE, { when: Math.max(Date.now() + 60000, gate), periodInMinutes: 15 });
  if (s.enabled && s.retryAt && !await chrome.alarms.get(COLLECT_RETRY)) await chrome.alarms.create(COLLECT_RETRY, { when: Math.max(Date.now() + 1000, s.retryAt) });
  if (!await chrome.alarms.get(WATCHDOG)) await chrome.alarms.create(WATCHDOG, { periodInMinutes: 1 });
}
async function stop(error, report = null) {
  const s = await get(); s.enabled = false; s.testRemaining = 0; s.error = error; s.retryAt = null;
  if (s.pending) s.pending.paused = true;
  if (report) s.lastReport = report;
  if (s.run) s.history = [{ runId: s.run.runId, mode: s.run.mode, trigger: s.run.trigger, status: 'failed', at: new Date().toISOString(), error }, ...(s.history || [])].slice(0, 20);
  if (s.run?.tabId) await chrome.tabs.sendMessage(s.run.tabId, { type: 'cancel' }).catch(() => {});
  s.run = null; await put(s); await chrome.alarms.clear(SCHEDULE);
  await chrome.alarms.clear(COLLECT_RETRY);
}
async function recover(error, report = null) {
  const s = await get();
  // A failed test/manual-only run must never opt the user into automatic collection.
  if (!s.enabled || s.run?.mode === 'test') return stop(error, report);
  if (s.run?.tabId) await chrome.tabs.sendMessage(s.run.tabId, { type: 'cancel' }).catch(() => {});
  if (report) s.lastReport = report;
  s.collectionFailures = (s.collectionFailures || 0) + 1;
  const minutes = 60;
  s.retryAt = Date.now() + minutes * 60000;
  s.error = `${error} · ${minutes}분 뒤 자동 재시도`;
  if (s.run) s.history = [{ runId: s.run.runId, mode: s.run.mode, trigger: s.run.trigger, status: 'retrying', at: new Date().toISOString(), error }, ...(s.history || [])].slice(0, 20);
  s.run = null; s.testRemaining = 0; await put(s);
  await chrome.alarms.create(COLLECT_RETRY, { when: s.retryAt });
}
async function launch(mode, trigger) {
  const s = await get();
  if (s.run || s.pending) return { busy: true };
  if (['alarm', 'retry'].includes(trigger) && s.retryAt > Date.now()) return { waiting: true };
  if (mode !== 'test' && !GMS_BATCH_CONFIG.token) throw new Error('DB 수집 키가 설정되지 않았습니다.');
  let maxRows = 50;
  if (mode !== 'test') {
    // Manual actions, retries and restored alarms all share the same crawl limit.
    const localNext = Math.max((s.lastAttemptAt || 0) + INTERVAL, s.lastSuccessAt ? Date.parse(s.lastSuccessAt) + INTERVAL : 0);
    let response, policy;
    try {
      response = await fetch(ENDPOINT + '?preflight=1', { headers: { Authorization: `Bearer ${GMS_BATCH_CONFIG.token}` }, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(String(response.status));
      policy = await response.json();
      if (!policy.policy || typeof policy.ready !== 'boolean') throw new Error('invalid policy');
    } catch {
      if (response?.status === 401 || response?.status === 403) await stop('수집 인증 확인 필요');
      else await recover('수집 한도 확인 실패');
      return { waiting: true };
    }
    s.policy = policy.policy;
    if (policy.reason === 'paused') { await stop('서버에서 수집을 중지했습니다.'); return { waiting: true }; }
    if (!policy.ready) {
      s.retryAt = Math.max(Date.now() + 60000, Date.parse(policy.nextEligibleAt) || Date.now() + INTERVAL);
      s.waitReason = policy.reason; s.error = null; await put(s);
      if (s.enabled) await chrome.alarms.create(COLLECT_RETRY, { when: s.retryAt });
      return { waiting: true, nextAt: s.retryAt };
    }
    if (localNext > Date.now()) {
      s.retryAt = localNext; s.waitReason = 'interval'; s.error = null; await put(s);
      if (s.enabled) await chrome.alarms.create(COLLECT_RETRY, { when: s.retryAt });
      return { waiting: true, nextAt: s.retryAt };
    }
    maxRows = Math.min(150, Number(policy.maxRows));
    if (!Number.isInteger(maxRows) || maxRows < 1) { await stop('수집 허용 건수를 확인할 수 없습니다.'); return { waiting: true }; }
    s.lastAttemptAt = Date.now();
  }
  s.error = null; s.retryAt = null; await chrome.alarms.clear(COLLECT_RETRY);
  s.waitReason = null;
  s.run = { runId: crypto.randomUUID(), mode, trigger, maxRows, startedAt: Date.now(), cursor: s.cursor || 0, phase: 'loading', tabId: null };
  await put(s);
  const tab = s.workerTabId ? await chrome.tabs.get(s.workerTabId).catch(() => null) : null;
  try {
    const window = s.workerWindowId ? await chrome.windows.get(s.workerWindowId).catch(() => null) : null;
    if (owned(tab) && window && tab.windowId === window.id && window.type === 'popup') {
      // Keep the collector active in its own window without switching the user's working tab.
      if (window.state === 'minimized') throw new Error('수집 창이 최소화되어 있습니다. 창을 복원한 뒤 다시 실행하세요.');
      s.run.tabId = tab.id; await put(s);
      await chrome.tabs.update(tab.id, { active: true, autoDiscardable: false });
      await chrome.tabs.reload(tab.id);
    } else {
      const created = await chrome.windows.create({ url: PAGE, type: 'popup', focused: false, width: 1200, height: 850 });
      const id = created.tabs?.[0]?.id;
      if (!id) throw new Error('전용 수집 창의 탭을 찾을 수 없습니다.');
      s.workerWindowId = created.id; s.workerTabId = id; s.run.tabId = id; await put(s);
      await chrome.tabs.update(id, { autoDiscardable: false });
    }
    return { started: true, runId: s.run.runId };
  } catch (e) { await stop(e.message || '전용 수집 창을 열 수 없습니다.'); throw e; }
}
async function upload() {
  const s = await get(); if (!s.pending || s.pending.paused) return;
  const pending = s.pending;
  let response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${GMS_BATCH_CONFIG.token}`, 'Content-Type': 'application/json' },
      body: pending.body, signal: AbortSignal.timeout(25000) });
  } catch { response = null; }
  if (!response?.ok) {
    const code = response?.status || 0;
    pending.attempts++;
    const retryable = !code || code === 429 || code >= 500;
    if (retryable && pending.attempts < 3) {
      s.pending = pending; s.error = `DB 저장 재시도 대기 (${pending.attempts}/3)`; await put(s);
      const retryAfter = Number(response?.headers.get('Retry-After')) || 60;
      await chrome.alarms.create(RETRY, { delayInMinutes: Math.max(1, retryAfter / 60) });
      return;
    }
    await stop(`DB 저장 실패 (${code || '연결 오류'}). 결과를 보존했습니다. 재시도 버튼으로 복구할 수 있습니다.`, s.lastReport);
    return;
  }
  let receipt; try { receipt = await response.json(); } catch { await stop('DB 응답을 해석할 수 없습니다. 결과는 보존했습니다.'); return; }
  if (!receipt.ok || receipt.accepted !== JSON.parse(pending.body).rows.length) { await stop('DB 저장 건수 불일치. 결과는 보존했습니다.'); return; }
  const current = await get();
  current.pending = null; current.run = null; current.error = null; current.lastReceipt = receipt;
  current.lastSuccessAt = new Date().toISOString(); current.cursor = current.lastReport.nextCursor || 0;
  current.collectionFailures = 0; current.retryAt = null;
  current.history = [{ runId: current.lastReport.runId, mode: 'production', trigger: pending.trigger, status: 'stored',
    at: current.lastSuccessAt, shops: current.lastReport.shops, rows: receipt.accepted, receipt }, ...(current.history || [])].slice(0, 20);
  await put(current); await chrome.alarms.clear(RETRY);
  await ensureAlarms();
}
async function finish(report, sender) {
  const s = await get();
  if (!s.run || s.run.runId !== report?.runId || s.run.tabId !== sender.tab?.id) throw new Error('현재 실행과 일치하지 않습니다.');
  s.lastReport = report;
  if (report.status !== 'completed' || !report.rows.length) {
    const retryable = report.status !== 'cancelled' && ['LOAD_TIMEOUT', 'RUN_TIMEOUT', 'NO_VALID_ROWS'].includes(report.errorCode);
    await (retryable ? recover : stop)(report.error || '유효 매물 없음', report); return;
  }
  if (s.run.mode === 'test') {
    s.history = [{ runId: report.runId, mode: 'test', status: 'verified', at: report.finishedAt, shops: report.shops, rows: report.rows.length, rejected: report.rejected }, ...(s.history || [])].slice(0, 20);
    s.run = null; s.testRemaining = Math.max(0, (s.testRemaining || 1) - 1); await put(s);
    if (s.testRemaining) await launch('test', 'repeat-test');
    return;
  }
  const body = { runId: report.runId, world: report.world, startedAt: report.startedAt, finishedAt: report.finishedAt, shops: report.shops, rows: report.rows };
  s.pending = { body: JSON.stringify(body), attempts: 0, trigger: s.run.trigger }; s.run.phase = 'uploading'; await put(s);
  await upload();
}
async function message(m, sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab?.url?.startsWith('https://meso.watch/')) throw new Error('허용되지 않은 발신자');
  if (m.type === 'status') return broadcast();
  if (m.type === 'pace') {
    const s = await get();
    if (s.run?.runId !== m.runId || s.run.tabId !== sender.tab.id || s.run.phase !== 'collecting') throw new Error('실행 불일치');
    // The extension coordinates each finite step; hidden-page chained timers are not a scheduler.
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(250, Number(m.ms) || 400))));
    return { ok: true };
  }
  if (m.type === 'ready') {
    const s = await get();
    if (s.run?.tabId !== sender.tab.id || s.run.phase !== 'loading') return null;
    s.run.phase = 'collecting'; s.run.readyAt = Date.now(); await put(s); return s.run;
  }
  if (m.type === 'progress') {
    const s = await get();
    if (s.run?.runId !== m.runId || s.run.tabId !== sender.tab.id) throw new Error('실행 불일치');
    s.run.progress = m.progress; await put(s); return { ok: true };
  }
  if (m.type === 'finish') { await finish(m.report, sender); return { ok: true }; }
  if (m.type === 'test3') {
    const s = await get(); if (s.run || s.pending) return { busy: true };
    s.testRemaining = 3; await put(s); return launch('test', 'manual-test');
  }
  if (m.type === 'run') return launch('production', 'manual');
  if (m.type === 'enable') {
    const s = await get(); if (s.pending) throw new Error('보관된 결과를 먼저 저장하세요.');
    s.enabled = true; s.error = null; s.retryAt = null; s.waitReason = null; s.collectionFailures = 0;
    await chrome.alarms.clear(COLLECT_RETRY); await put(s); await ensureAlarms(); return broadcast();
  }
  if (m.type === 'disable') { const s = await get(); s.enabled = false; if (s.retryAt) s.error = '자동 재시도를 사용자가 껐습니다.'; s.retryAt = null; await put(s); await chrome.alarms.clear(SCHEDULE); await chrome.alarms.clear(COLLECT_RETRY); return broadcast(); }
  if (m.type === 'cancel') { await stop('사용자가 실행과 예약을 중지했습니다.'); return broadcast(); }
  if (m.type === 'retry') {
    const s = await get(); if (!s.pending) return { ok: true };
    s.pending.attempts = 0; s.pending.paused = false; await put(s); await upload(); return broadcast();
  }
  throw new Error('알 수 없는 요청');
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  enqueue(() => message(m, sender)).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message })); return true;
});
chrome.alarms.onAlarm.addListener(alarm => enqueue(async () => {
  if (alarm.name === RETRY) return upload();
  if (alarm.name === COLLECT_RETRY) {
    const s = await get(); if (s.enabled && s.retryAt && s.retryAt <= Date.now()) return launch('production', 'retry');
    return;
  }
  if (alarm.name === WATCHDOG) {
    const s = await get();
    if (s.run && !s.pending && ((s.run.phase === 'loading' && Date.now() - s.run.startedAt > 90000) || Date.now() - (s.run.readyAt || s.run.startedAt) > 14 * 60000)) await recover('수집 창 응답 시간 초과');
    // Resume a durable outbox after a browser/service-worker restart.
    if (s.pending && !s.pending.paused && !await chrome.alarms.get(RETRY)) await chrome.alarms.create(RETRY, { delayInMinutes: 1 });
    return;
  }
  const s = await get(); if (alarm.name === SCHEDULE && s.enabled) await launch('production', 'alarm');
}).catch(async e => stop(e.message || '배치 실행 오류. 예약을 중지했습니다.')));
chrome.runtime.onStartup.addListener(() => enqueue(ensureAlarms));
chrome.runtime.onInstalled.addListener(() => enqueue(ensureAlarms));
enqueue(ensureAlarms);
