// EXP tracker: share the game window once, press start, and the page reads "EXP 83,631 [68.13%]" from the status bar
// every few seconds (assets/exp-reader.js), then shows EXP per hour, percent per hour, time to the next level and the
// session's gain. Nothing leaves this computer: frames are read in the page and only the numbers are kept, in this
// browser (localStorage), so a reload keeps the session. Without screen sharing the two numbers can be typed by hand.
import { findGauges, expTextBox, readExpText, parseExp, sameReading, summarize, levelTotal } from './exp-reader.js';

const D = JSON.parse(document.getElementById('exp-data').textContent);
const t = D.t;
const ko = D.lang === 'ko';
const $ = (id) => document.getElementById(id);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const nf = new Intl.NumberFormat(D.lang);
const KEY = 'gms-exp-session';
const TICK_MS = 5000;
const HEARTBEAT_MS = 60000;
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let session = load() || fresh();
let stream = null, video = null, timer = null, reading = false, pending = null, lastSampleAt = 0;
let mobs = null;
const learned = new Map(Object.entries(session.learned || {}));

function fresh() { return { samples: [], startedAt: null, mob: null, learned: {}, skipIdle: true }; }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && Array.isArray(s.samples) ? s : null; } catch { return null; } }
function save() { session.learned = Object.fromEntries(learned); try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {} }

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
  session.samples.push({ t: now, exp: r.exp, pct: r.pct });
  if (session.samples.length > 2000) session.samples.splice(0, session.samples.length - 2000);
  session.startedAt ||= now;
  lastSampleAt = now;
  save();
  render();
}

async function tick() {
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
  render();
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
  $('exp-reset').hidden = !session.samples.length;
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

// ---------- wiring ----------
$('exp-start').addEventListener('click', start);
$('exp-stop').addEventListener('click', stop);
$('exp-reset').addEventListener('click', () => {
  if (!confirm(t.resetAsk)) return;
  session = fresh();
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
