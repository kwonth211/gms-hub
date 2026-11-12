// Looks inside the collector browser's extension service worker over the local DevTools port (collector.sh starts the
// browser with --remote-debugging-port=9223): its stored state, alarms and config shape, and optionally runs one
// expression there. Usage: node inspect.mjs [expression]
const PORT = process.env.GMS_COLLECTOR_PORT || 9223;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const sw = targets.find((t) => t.type === 'service_worker' && t.url.includes('background.js'));
if (!sw) { console.log('service worker not running; targets:', targets.map((t) => `${t.type} ${t.url}`).join(' | ')); process.exit(1); }
const ws = new WebSocket(sw.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const call = (method, params = {}) => new Promise((resolve) => {
  const me = ++id;
  const on = (e) => { const m = JSON.parse(e.data); if (m.id === me) { ws.removeEventListener('message', on); resolve(m.result ?? m.error); } };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: me, method, params }));
});
const expression = process.argv[2] || `(async () => {
  const s = (await chrome.storage.local.get('state')).state || null;
  const alarms = (await chrome.alarms.getAll()).map((a) => [a.name, new Date(a.scheduledTime).toLocaleTimeString('ko-KR'), a.periodInMinutes || null]);
  const cfg = typeof GMS_BATCH_CONFIG === 'object' ? { name: GMS_BATCH_CONFIG.name || null, autoStart: !!GMS_BATCH_CONFIG.autoStart, hasToken: !!GMS_BATCH_CONFIG.token } : null;
  return JSON.stringify({ version: chrome.runtime.getManifest().version, cfg, alarms, state: s && { enabled: s.enabled, error: s.error, retryAt: s.retryAt && new Date(s.retryAt).toLocaleTimeString('ko-KR'), waitReason: s.waitReason, run: s.run && { phase: s.run.phase, progress: s.run.progress }, pending: !!s.pending, lastSuccessAt: s.lastSuccessAt, workerWindowId: s.workerWindowId, history: (s.history || []).slice(0, 3) } }, null, 1);
})()`;
const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
console.log(r.result?.value ?? JSON.stringify(r));
ws.close();
