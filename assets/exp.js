// EXP tracker: share the game window once, press start, and the page reads "EXP 83,631 [68.13%]" from the status bar
// every few seconds (assets/exp-reader.js), then shows EXP per hour, percent per hour, time to the next level and the
// session's gain. Nothing leaves this computer: frames are read in the page and only the numbers are kept, in this
// browser (localStorage), so a reload keeps the session. Without screen sharing the two numbers can be typed by hand.
import { findGauges, expTextBox, readExpText, parseExp, sameReading, summarize, levelTotal } from './exp-reader.js';
import { xlsx } from './xlsx.js';

const D = JSON.parse(document.getElementById('exp-data').textContent);
const t = D.t;
const ko = D.lang === 'ko';
const $ = (id) => document.getElementById(id);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const nf = new Intl.NumberFormat(D.lang);
const KEY = 'gms-exp-session';
const LOG_KEY = 'gms-exp-log';
const STALL_MS = 180000;
const RECENT_MS = 300000;
const BASE_TITLE = document.title;
const TICK_MS = 5000;
const HEARTBEAT_MS = 60000;
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let session = load() || fresh();
let stream = null, video = null, timer = null, reading = false, pending = null, lastSampleAt = 0;
let mobs = null;
let demoOn = false, realSession = null, pipWin = null, lastGainAt = 0, stallWarned = false;
let log = loadLog();
const learned = new Map(Object.entries(session.learned || {}));

function fresh() { return { samples: [], startedAt: null, mob: null, learned: {}, skipIdle: true }; }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && Array.isArray(s.samples) ? s : null; } catch { return null; } }
function loadLog() { try { const l = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } }
function saveLog() { try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 100))); } catch {} }
function save() { if (demoOn) return; session.learned = Object.fromEntries(learned); try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {} }

// ---------- reading ----------
let ocrWorker = null;
async function ocrGlyph(key) {
  // A glyph the font table does not know: drawn 8x as black on white and read as one character.
  if (!ocrWorker) {
    ocrWorker = (async () => {
      if (!window.Tesseract) await new Promise((ok, fail) => { const el = document.createElement('script'); el.src = TESSERACT_URL; el.onload = ok; el.onerror = fail; document.head.appendChild(el); });
      const w = await window.Tesseract.createWorker('eng');
      await w.setParameters({ tessedit_pageseg_mode: '10', tessedit_char_whitelist: '0123456789,.[]%' });
      return w;
    })().catch((e) => { ocrWorker = null; throw e; });
  }
  const w = await ocrWorker;
  const rows = key.split('/'), S = 8, pad = 16;
  const c = document.createElement('canvas');
  c.width = rows[0].length * S + pad * 2; c.height = rows.length * S + pad * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') g.fillRect(pad + x * S, pad + y * S, S, S); }));
  const out = (await w.recognize(c)).data.text.trim();
  return /^[0-9,.\[\]%]$/.test(out) ? out : '';
}

function frame() {
  if (!video || !video.videoWidth) return null;
  const c = frame.c || (frame.c = document.createElement('canvas'));
  c.width = video.videoWidth; c.height = video.videoHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

async function readOnce(img) {
  const g = findGauges(img);
  check('bar', g ? 'ok' : 'fail', g ? t.barOk : t.barFail);
  if (!g) return null;
  const text = await readExpText(img, expTextBox(g, img), g, { ocrGlyph: (k) => ocrGlyph(k).catch(() => ''), learned });
  const r = parseExp(text);
  check('read', r ? 'ok' : 'fail', r ? fill(t.readOk, { exp: nf.format(r.exp), pct: r.pct.toFixed(2) }) : fill(t.readFail, { text }));
  return r;
}

// A reading counts once two reads in a row agree (OCR slips rarely repeat). It becomes a sample when the numbers moved,
// or once a minute as a heartbeat so idle time is measured. A drop with the percent reset is a level-up; any other
// large disagreement with the level total seen so far is treated as a misread and skipped.
function accept(r) {
  if (!r) { pending = null; return; }
  if (!pending || !sameReading(pending, r)) { pending = r; return; }
  const last = session.samples.at(-1);
  const now = Date.now();
  if (last) {
    const tot = levelTotal(last), tr = levelTotal(r);
    const levelUp = r.exp < last.exp && r.pct < last.pct;
    if (!levelUp && tot && tr && Math.abs(tr - tot) / tot > 0.03) return;
    if (!levelUp && r.exp < last.exp) return;
    const changed = r.exp !== last.exp || r.pct !== last.pct;
    if (!changed && now - lastSampleAt < HEARTBEAT_MS) return;
  }
  if (last && (r.exp !== last.exp || r.pct !== last.pct)) { lastGainAt = now; stallWarned = false; }
  if (last && r.exp < last.exp && r.pct < last.pct) say(t.levelUp);
  session.samples.push({ t: now, exp: r.exp, pct: r.pct });
  if (!lastGainAt) lastGainAt = now;
  if (session.samples.length > 2000) session.samples.splice(0, session.samples.length - 2000);
  session.startedAt ||= now;
  lastSampleAt = now;
  save();
  render();
}

function stallCheck() {
  if (!stream || !lastGainAt) return;
  const quiet = Date.now() - lastGainAt;
  if (quiet < STALL_MS) return;
  say(fill(t.stalled, { m: Math.floor(quiet / 60000) }));
  if (stallWarned) return;
  stallWarned = true;
  document.title = `⚠ ${BASE_TITLE}`;
  if ($('exp-alert').checked) beep();
}
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35].forEach((at) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start(a.currentTime + at); o.stop(a.currentTime + at + 0.2); });
    setTimeout(() => a.close(), 1200);
  } catch {}
}

async function tick() {
  stallCheck();
  if (!stream || reading) return;
  reading = true;
  try { accept(await readOnce(frame())); } catch (e) { check('read', 'fail', t.readFail.replace('{text}', '')); } finally { reading = false; }
}

// ---------- share, start, stop ----------
function check(key, state, text) {
  const li = $(`exp-check-${key}`);
  if (!li) return;
  li.dataset.state = state;
  li.querySelector('small').textContent = text;
}

async function start() {
  if (!navigator.mediaDevices?.getDisplayMedia) return say(t.unsupported);
  if (demoOn) toggleDemo();
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  } catch { return say(t.denied); }
  video = document.createElement('video');
  video.muted = true; video.srcObject = stream;
  await video.play();
  stream.getVideoTracks()[0].addEventListener('ended', stop);
  check('share', 'ok', t.shareOk);
  document.body.classList.add('exp-running');
  say(t.watching);
  track('exp_start');
  pending = null;
  lastGainAt = Date.now(); stallWarned = false;
  timer = setInterval(tick, TICK_MS);
  setTimeout(tick, 800);
}

function stop() {
  clearInterval(timer); timer = null;
  for (const tr of stream?.getTracks() || []) tr.stop();
  stream = null; video = null;
  document.body.classList.remove('exp-running');
  check('share', 'wait', t.wait);
  say(t.stopped);
  const s = summarize(session.samples, { skipIdle: session.skipIdle });
  track('exp_stop', { minutes: s ? Math.round(s.active / 60000) : 0, samples: session.samples.length });
  keepInLog();
  document.title = BASE_TITLE;
  render();
}

// ---------- training log ----------
// A finished session (3+ active minutes with EXP gained) is kept: date, time, rates, monster and the spot note. Stopping
// twice updates the same row instead of adding another.
function keepInLog() {
  if (demoOn) return;
  const s = summarize(session.samples, { skipIdle: session.skipIdle });
  if (!s || s.active < 180000 || !s.gained || !s.perHour) return;
  const row = { id: session.samples[0].t, at: s.last.t, mins: Math.round(s.active / 60000), perHour: Math.round(s.perHour), pctPerHour: s.pctPerHour ? +s.pctPerHour.toFixed(1) : null,
    gained: s.gained, mob: session.mob ? { id: session.mob.id, name: session.mob.name } : null, spot: session.spot || '' };
  const i = log.findIndex((x) => x.id === row.id);
  if (i >= 0) log[i] = { ...row, spot: log[i].spot || row.spot }; else log.unshift(row);
  saveLog();
  say(t.logged);
  renderLog();
}
function bestFor(mob, exceptId) {
  if (!mob) return null;
  const same = (demoOn ? demoLog() : log).filter((x) => x.mob?.id === mob.id && x.id !== exceptId);
  return same.length ? Math.max(...same.map((x) => x.perHour)) : null;
}
function renderLog() {
  const body = $('exp-log-body');
  const rows = demoOn ? demoLog() : log;
  const when = (ms) => new Date(ms).toLocaleString(D.lang, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  body.innerHTML = rows.map((x) => `<tr data-id="${x.id}"><td>${when(x.at)}</td><td>${dur(x.mins * 60000)}</td><td><b>${big(x.perHour)}</b></td><td>${x.pctPerHour != null ? `${x.pctPerHour}%` : '—'}</td><td>${big(x.gained)}</td><td>${x.mob ? escHtml(x.mob.name) : '—'}</td>
<td><input class="exp-log-spot" value="${escHtml(x.spot || '')}" maxlength="60" aria-label="${escHtml(t.log.cols[6])}"${demoOn ? ' disabled' : ''}></td><td><button type="button" class="btn ghost small-btn exp-log-del"${demoOn ? ' disabled' : ''}>${escHtml(t.log.del)}</button></td></tr>`).join('');
  $('exp-log-empty').hidden = rows.length > 0;
  $('exp-log-clear').hidden = demoOn || !rows.length;
}
const escHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function logWorkbook() {
  const L = (k, e) => (ko ? k : e);
  const rows = (demoOn ? demoLog() : log).map((x) => [new Date(x.at).toLocaleString('sv-SE').slice(0, 16), x.mins, x.perHour, x.pctPerHour, x.gained, x.mob?.name || '', x.spot || '']);
  const byMob = new Map();
  for (const x of demoOn ? demoLog() : log) { if (!x.mob) continue; const e = byMob.get(x.mob.name) || byMob.set(x.mob.name, { n: 0, mins: 0, best: 0, sum: 0 }).get(x.mob.name); e.n++; e.mins += x.mins; e.best = Math.max(e.best, x.perHour); e.sum += x.perHour * x.mins; }
  return xlsx({ title: 'GMS Hub', sheets: [
    { name: L('사냥 기록', 'Training log'), title: L('내 사냥 기록', 'My training log'), note: `GMS Hub ${L('경험치 측정기', 'EXP tracker')} · ${new Date().toLocaleDateString('sv-SE')}`,
      cols: [{ h: L('날짜', 'Date') }, { h: L('측정 시간(분)', 'Minutes'), t: 'int' }, { h: L('시간당 경험치', 'EXP per hour'), t: 'int' }, { h: L('시간당 %', '% per hour'), t: 'num' }, { h: L('얻은 경험치', 'EXP gained'), t: 'int' }, { h: L('몬스터', 'Monster') }, { h: L('사냥터 메모', 'Spot note'), t: 'wrap' }], rows },
    { name: L('몬스터별 정리', 'By monster'), title: L('몬스터별 내 효율', 'My rates by monster'), note: L('평균은 측정 시간으로 가중한 값이에요.', 'Averages are weighted by time.'),
      cols: [{ h: L('몬스터', 'Monster') }, { h: L('측정 횟수', 'Sessions'), t: 'int' }, { h: L('총 시간(분)', 'Minutes'), t: 'int' }, { h: L('평균 시간당 경험치', 'Average EXP/h'), t: 'int' }, { h: L('최고 시간당 경험치', 'Best EXP/h'), t: 'int' }],
      rows: [...byMob].map(([name, e]) => [name, e.n, e.mins, Math.round(e.sum / Math.max(1, e.mins)), e.best]).sort((a, b) => b[4] - a[4]) }
  ].filter((sh) => sh.rows.length) });
}

function say(msg) { $('exp-status').textContent = msg; }

// ---------- display ----------
const dur = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return ko ? '1분 미만' : '< 1 min';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (ko ? `${h}시간 ${r}분` : `${h}h ${r}m`) : (ko ? `${m}분` : `${m} min`);
};
const big = (n) => (n == null ? '—' : nf.format(Math.round(n)));

function render() {
  const s = summarize(session.samples, { skipIdle: session.skipIdle });
  const last = session.samples.at(-1);
  $('exp-now').textContent = last ? `${nf.format(last.exp)} · ${last.pct.toFixed(2)}%` : '—';
  // One reading is a starting point, not a rate: the rate shows once a second reading exists.
  const two = session.samples.length >= 2;
  $('exp-rate').textContent = two && s?.perHour != null ? big(s.perHour) : '—';
  $('exp-pct').textContent = two && s?.pctPerHour != null ? `${s.pctPerHour.toFixed(1)}%` : '—';
  $('exp-m-save').textContent = session.samples.length ? t.manualNext : t.manualFirst;
  $('exp-next').textContent = s ? dur(s.toLevelMs) : '—';
  $('exp-gained').textContent = s ? big(s.gained) : '—';
  $('exp-time').textContent = s ? dur(s.active) : '—';
  $('exp-idle').textContent = s && s.idle > 0 ? fill(t.idle, { m: Math.round(s.idle / 60000) }) : '';
  $('exp-levels').textContent = s?.levels ? fill(t.levelsUp, { n: s.levels }) : '';
  $('exp-reset').hidden = !session.samples.length || demoOn;
  // Last 5 minutes: the sample just before the window plus those in it, idle included, so a stall shows as a drop.
  const now = demoOn ? (session.samples.at(-1)?.t || Date.now()) : Date.now();
  const cut = session.samples.findIndex((p) => p.t >= now - RECENT_MS);
  const recentPts = cut < 0 ? [] : session.samples.slice(Math.max(0, cut - 1));
  const rs = recentPts.length >= 2 && recentPts.at(-1).t - recentPts[0].t >= 60000 ? summarize(recentPts, { now, skipIdle: false }) : null;
  $('exp-recent').textContent = rs?.perHour != null ? big(rs.perHour) : '—';
  const best = bestFor(session.mob, session.samples[0]?.t);
  $('exp-best').textContent = !session.mob ? '—' : best && two && s?.perHour ? fill(t.bestVs, { pct: Math.round((s.perHour / best) * 100), best: big(best) }) : t.bestNone;
  $('exp-best').classList.toggle('exp-best-text', !best || !two);
  if (stream && two && s?.perHour) document.title = `${stallWarned ? '⚠ ' : ''}${big(s.perHour)}${t.perHourShort} · ${BASE_TITLE}`;
  renderPip(s, rs);
  renderMob(s);
  renderChart();
  $('exp-empty').hidden = session.samples.length > 0;
}

function renderMob(s) {
  const box = $('exp-mob-out');
  const mob = session.mob;
  if (!mob || !s || !s.gained) { box.textContent = ''; return; }
  box.innerHTML = `${fill(t.kills, { n: nf.format(Math.round(s.gained / mob.exp)), mob: mob.name })}${s.perHour ? ` · ${fill(t.killsPerHour, { n: nf.format(Math.round(s.perHour / mob.exp)) })}` : ''}`;
}

// EXP over time, with level-ups folded into a rising line (gained so far), and the last hour's rate as the slope.
function renderChart() {
  const svg = $('exp-chart');
  const pts = session.samples;
  if (pts.length < 2) { svg.innerHTML = ''; svg.hidden = true; return; }
  svg.hidden = false;
  const W = 600, H = 150, L = 46, R = 8, T = 10, B = 22;
  let gained = 0, prev = pts[0];
  const ys = pts.map((p, i) => {
    if (i) {
      let d = p.exp - prev.exp;
      if (d < 0 && p.pct < prev.pct) { const tot = levelTotal(prev); d = (tot ? Math.max(0, tot - prev.exp) : 0) + p.exp; }
      gained += Math.max(0, d);
      prev = p;
    }
    return gained;
  });
  const t0 = pts[0].t, t1 = pts.at(-1).t || t0 + 1;
  const max = Math.max(1, ys.at(-1));
  const x = (tt) => L + ((tt - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(ys[i]).toFixed(1)}`).join('');
  const fmtT = (tt) => new Date(tt).toLocaleTimeString(D.lang, { hour: 'numeric', minute: '2-digit' });
  svg.innerHTML = `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(max)}" y2="${y(max)}"/><line class="grid" x1="${L}" x2="${W - R}" y1="${y(max / 2)}" y2="${y(max / 2)}"/>
<text class="ax" x="${L - 6}" y="${y(max) + 4}" text-anchor="end">${big(max)}</text><text class="ax" x="${L - 6}" y="${y(max / 2) + 4}" text-anchor="end">${big(max / 2)}</text>
<text class="ax" x="${L}" y="${H - 6}">${fmtT(t0)}</text><text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtT(t1)}</text>
<path class="area" d="${path}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z"/><path class="line" d="${path}"/>`;
}

// ---------- monsters (kill estimate) ----------
async function loadMobs() {
  if (mobs) return mobs;
  const rows = await fetch(D.mobsUrl).then((r) => r.json()).catch(() => []);
  mobs = rows.map(([id, k, e, lv, , exp]) => ({ id, name: ko && k ? k : e, en: e, ko: k, lv, exp })).filter((m) => m.exp > 0);
  $('exp-mob-list').innerHTML = mobs.map((m) => `<option value="${m.name}">Lv. ${m.lv} · EXP ${m.exp}</option>`).join('');
  return mobs;
}

// ---------- example session ----------
// A made-up 40-minute session (one 4-minute break, one level-up) so a first-time visitor sees what the page gives
// before sharing a screen. It never touches the saved session or log.
function demoSamples() {
  const out = [], total = 61200, t0 = Date.now() - 40 * 60000;
  let exp = Math.round(total * 0.62), tt = t0, lvTotal = total;
  for (let i = 0; i <= 80; i++) {
    tt = t0 + i * 30000;
    if (i > 40 && i <= 48) { if (i === 48) out.push({ t: tt, exp, pct: +(exp / lvTotal * 100).toFixed(2) }); continue; }
    exp += 520 + ((i * 37) % 160);
    if (exp >= lvTotal) { exp -= lvTotal; lvTotal = Math.round(lvTotal * 1.08); }
    out.push({ t: tt, exp, pct: Math.max(0.01, +(exp / lvTotal * 100).toFixed(2)) });
  }
  return out;
}
function demoLog() {
  const d = Date.now(), name = ko ? '스티지' : 'Stirge';
  return [{ id: 1, at: d - 864e5, mins: 52, perHour: 58200, pctPerHour: 95.1, gained: 50440, mob: { id: 17, name }, spot: ko ? '환승 구역' : 'Transfer Area' },
    { id: 2, at: d - 2 * 864e5, mins: 35, perHour: 61800, pctPerHour: 101.0, gained: 36050, mob: { id: 17, name }, spot: ko ? '위험한 증기' : 'Dangerous Steam' }];
}
function toggleDemo() {
  demoOn = !demoOn;
  if (demoOn) { realSession = session; session = { ...fresh(), samples: demoSamples(), mob: { id: 17, name: ko ? '스티지' : 'Stirge', exp: 23 } }; track('exp_demo'); }
  else { session = realSession || fresh(); realSession = null; }
  $('exp-demo').textContent = demoOn ? $('exp-demo').dataset.off : $('exp-demo').dataset.on;
  $('exp-demo-note').hidden = !demoOn;
  document.body.classList.toggle('exp-demo', demoOn);
  render(); renderLog();
}

// ---------- mini window ----------
// Document Picture-in-Picture keeps a small always-on-top window over the game with the live numbers.
async function openPip() {
  if (!window.documentPictureInPicture) return say(t.pipNo);
  try {
    pipWin = await documentPictureInPicture.requestWindow({ width: 300, height: 190 });
  } catch { return say(t.pipNo); }
  const css = `body{margin:0;font:14px/1.3 system-ui,-apple-system,"Malgun Gothic",sans-serif;background:#1d1a16;color:#f6efe4}
.p{padding:12px 14px;display:grid;gap:6px}.r{display:flex;justify-content:space-between;gap:10px}.k{color:#bfb2a0;font-size:12px}
.v{font-weight:800;font-variant-numeric:tabular-nums}.big{font-size:26px;color:#ffb347}.warn{color:#ff7a6b;font-size:12px}`;
  pipWin.document.head.innerHTML = `<meta charset="utf-8"><title>GMS Hub</title><style>${css}</style>`;
  pipWin.document.body.innerHTML = '<div class="p" id="pip"></div>';
  pipWin.addEventListener('pagehide', () => { pipWin = null; });
  track('exp_pip');
  render();
}
function renderPip(s, rs) {
  const box = pipWin?.document.getElementById('pip');
  if (!box) return;
  const row = (k, v) => `<div class="r"><span class="k">${escHtml(k)}</span><span class="v">${escHtml(v)}</span></div>`;
  box.innerHTML = `<div class="r"><span class="k">${escHtml(t.stats.rate)}</span></div><div class="v big">${s?.perHour && session.samples.length >= 2 ? big(s.perHour) : '—'}</div>
${row(t.stats.recent, rs?.perHour != null ? big(rs.perHour) : '—')}${row(t.stats.next, s ? dur(s.toLevelMs) : '—')}${row(t.stats.time, s ? dur(s.active) : '—')}${stallWarned ? `<div class="warn">${escHtml(fill(t.stalled, { m: Math.floor((Date.now() - lastGainAt) / 60000) }))}</div>` : ''}`;
}

// ---------- wiring ----------
$('exp-pip').addEventListener('click', openPip);
$('exp-demo').addEventListener('click', toggleDemo);
$('exp-spot').value = session.spot || '';
$('exp-spot').addEventListener('change', (e) => { session.spot = e.target.value.trim(); save(); });
$('exp-alert').checked = !!session.alert;
$('exp-alert').addEventListener('change', (e) => { session.alert = e.target.checked; save(); if (e.target.checked) beep(); });
$('exp-log-body').addEventListener('change', (e) => {
  const inp = e.target.closest('.exp-log-spot'); if (!inp || demoOn) return;
  const row = log.find((x) => String(x.id) === inp.closest('tr').dataset.id); if (row) { row.spot = inp.value.trim(); saveLog(); }
});
$('exp-log-body').addEventListener('click', (e) => {
  const b = e.target.closest('.exp-log-del'); if (!b || demoOn) return;
  log = log.filter((x) => String(x.id) !== b.closest('tr').dataset.id); saveLog(); renderLog(); render();
});
$('exp-log-clear').addEventListener('click', () => { if (!confirm(t.log.clearAsk)) return; log = []; saveLog(); renderLog(); render(); });
$('exp-log-xl').addEventListener('click', () => {
  const bytes = logWorkbook();
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), download: `gms-hub-exp-log-${new Date().toLocaleDateString('sv-SE')}.xlsx` });
  document.body.append(a); a.click(); a.remove();
  track('excel_download', { set: 'exp-log', live: true });
});
// Arriving from a training spot (?mob=<id>&spot=<name>): that monster and spot are filled in for this session.
const qs = new URLSearchParams(location.search);
if (qs.get('mob') || qs.get('spot')) {
  if (qs.get('spot')) { session.spot = qs.get('spot').slice(0, 60); $('exp-spot').value = session.spot; }
  if (qs.get('mob')) loadMobs().then((list) => { const m = list.find((x) => String(x.id) === qs.get('mob')); if (m) { session.mob = m; $('exp-mob').value = m.name; } save(); render(); });
  save();
}
$('exp-start').addEventListener('click', start);
$('exp-stop').addEventListener('click', stop);
$('exp-reset').addEventListener('click', () => {
  if (!confirm(t.resetAsk)) return;
  keepInLog();
  const keep = { spot: session.spot, alert: session.alert, mob: session.mob };
  session = { ...fresh(), ...keep };
  pending = null;
  save();
  render();
  say(stream ? t.watching : '');
});
$('exp-skip-idle').checked = session.skipIdle !== false;
$('exp-skip-idle').addEventListener('change', (e) => { session.skipIdle = e.target.checked; save(); render(); });
$('exp-mob').addEventListener('focus', loadMobs);
$('exp-mob').addEventListener('change', async (e) => {
  await loadMobs();
  const v = e.target.value.trim().toLowerCase();
  session.mob = mobs.find((m) => m.name.toLowerCase() === v || m.en.toLowerCase() === v || (m.ko || '').toLowerCase() === v) || null;
  save();
  render();
});
if (session.mob) $('exp-mob').value = session.mob.name;
$('exp-manual').addEventListener('submit', (e) => {
  e.preventDefault();
  const exp = Number(String($('exp-m-exp').value).replace(/[^\d]/g, '')), pct = Number($('exp-m-pct').value);
  const r = parseExp(`${exp}[${pct.toFixed(2)}%]`);
  if (!r) return say(t.manualBad);
  const first = !session.samples.length;
  pending = r; accept(r);
  say(first ? t.manualFirstOk : t.manualOk);
  $('exp-m-exp').value = ''; $('exp-m-pct').value = '';
  track('exp_manual');
});
if (!navigator.mediaDevices?.getDisplayMedia) { $('exp-start').disabled = true; say(t.unsupported); }
// Development: ?frame=<image url> on localhost reads that picture instead of the screen, to try the page without a game.
const demo = location.hostname === 'localhost' && new URLSearchParams(location.search).get('frame');
if (demo) {
  const im = new Image();
  im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const img = g.getImageData(0, 0, c.width, c.height); readOnce(img).then((r) => { pending = r; accept(r); }); };
  im.src = demo;
}
render();
renderLog();
