// Admin megaphone collector (/admin/megaphone/, unlisted). The admin shares the game window; the page finds the chat
// box by itself (megaphone bands with red channel digits) and every 1.5 s reads the coloured megaphone lines (assets/mega-reader.js), reads them with Tesseract, and posts
// new megaphones to the worker with the admin key. Only the recognised text leaves the browser.
import { findLines, readLine, assemble, findChatBox } from './mega-reader.js';

const $ = (id) => document.getElementById(id);
const cfg = JSON.parse($('mega-config').textContent);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TICK_MS = 1500;
const SAME_MS = 15 * 60000;
const CHAT_WIDTH = 576; // the chat box's width in game pixels (findChatBox margin included)

const video = document.createElement('video');
video.muted = true;
const preview = $('mg-preview'), pctx = preview.getContext('2d');
const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
let stream = null, timer = null, worker = null, busy = false;
let region = JSON.parse(localStorage.getItem('gms-mega-box') || 'null'); // fractions of the video: {x, y, w, h}
let ticks = 0, empty = 0;
const full = document.createElement('canvas'), fctx = full.getContext('2d', { willReadFrequently: true });
const ocrCache = new Map(); // bitmap signature → text: a line that stays on screen is read once
const recent = []; // { nick, key, at } of megaphones already queued
const queue = [];
const log = [];
const stats = { lines: 0, read: 0, sent: 0, failed: 0 };
const say = (msg) => ($('mg-status').textContent = msg);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function token() {
  let t = localStorage.getItem('gms-mega-token') || '';
  if (!t && LOCAL) t = await fetch('/__admin/token').then((r) => (r.ok ? r.text() : '')).catch(() => '');
  return t.trim();
}

async function loadOcr() {
  if (worker) return worker;
  if (!window.Tesseract) await new Promise((ok, fail) => { const el = document.createElement('script'); el.src = TESSERACT_URL; el.onload = ok; el.onerror = fail; document.head.append(el); });
  worker = await window.Tesseract.createWorker('eng');
  await worker.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
  return worker;
}

async function ocr(bm, kind) {
  if (!bm.ink) return '';
  const key = `${kind}:${bm.sig}`;
  if (ocrCache.has(key)) return ocrCache.get(key);
  const c = document.createElement('canvas');
  c.width = bm.width; c.height = bm.height;
  c.getContext('2d').putImageData(new ImageData(bm.data, bm.width, bm.height), 0, 0);
  const text = (await (await loadOcr()).recognize(c)).data.text.trim();
  stats.read++;
  if (ocrCache.size > 3000) ocrCache.clear();
  ocrCache.set(key, text);
  return text;
}

// The chat box is semi-transparent, so the same megaphone can read slightly differently from frame to frame. Letters
// and digits only, compared by shared 3-letter pieces: a near match from the same nick within 15 minutes is a repeat.
const shape = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
function similar(a, b) {
  if (a === b) return true;
  const grams = (t) => new Set(Array.from({ length: Math.max(0, t.length - 2) }, (_, i) => t.slice(i, i + 3)));
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const g of A) if (B.has(g)) both++;
  return both / Math.min(A.size, B.size) > 0.7;
}
function isRepeat(m, now) {
  while (recent.length && now - recent[0].at > SAME_MS) recent.shift();
  const key = shape(m.text);
  return recent.some((r) => r.nick.toLowerCase() === m.nick.toLowerCase() && similar(r.key, key));
}

async function tick() {
  if (busy || !stream || !video.videoWidth) return;
  busy = true;
  try {
    const vw = video.videoWidth, vh = video.videoHeight;
    preview.width = Math.min(960, vw); preview.height = Math.round((preview.width * vh) / vw);
    pctx.drawImage(video, 0, 0, preview.width, preview.height);
    // Look for the chat box at the start, every 40 ticks (about a minute), and whenever no line has been seen for a while.
    if (!region || ticks++ % 40 === 0 || empty > 20) {
      full.width = vw; full.height = vh;
      fctx.drawImage(video, 0, 0);
      const box = findChatBox(fctx.getImageData(0, 0, vw, vh));
      if (box) { region = { x: box.x / vw, y: box.y / vh, w: box.w / vw, h: box.h / vh }; localStorage.setItem('gms-mega-box', JSON.stringify(region)); empty = 0; }
    }
    if (!region) { say('채팅창을 찾는 중이에요. 확성기가 한 줄이라도 보이면 자동으로 잡혀요.'); return; }
    pctx.strokeStyle = '#ff7a00'; pctx.lineWidth = 2;
    pctx.strokeRect(region.x * preview.width, region.y * preview.height, region.w * preview.width, region.h * preview.height);
    const sx = Math.round(region.x * vw), sy = Math.round(region.y * vh), sw = Math.round(region.w * vw), sh = Math.round(region.h * vh);
    // Chrome may send the window larger or smaller than the game draws it (here about 1.26x), which smears the pixel
    // font. The chat box is about 576 game pixels wide, so scale the crop back to that with nearest-neighbour sampling.
    const scale = Math.max(0.5, Math.min(3, sw / CHAT_WIDTH));
    const dw = Math.round(sw / scale), dh = Math.round(sh / scale);
    work.width = dw; work.height = dh;
    wctx.imageSmoothingEnabled = false;
    wctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    const img = wctx.getImageData(0, 0, dw, dh);
    if (LOCAL && $('mg-keep').checked && ticks % 10 === 1) {
      work.toBlob((b) => fetch('/__mega/sample', { method: 'POST', body: b }).catch(() => {}));
      // The crop at the size Chrome sends it, before any rescaling, for tuning the reader to the real capture.
      const raw = document.createElement('canvas');
      raw.width = sw; raw.height = sh;
      raw.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      raw.toBlob((b) => fetch('/__mega/sample?kind=raw', { method: 'POST', body: b }).catch(() => {}));
    }
    const lines = findLines(img);
    stats.lines = lines.length;
    empty = lines.length ? 0 : empty + 1;
    const read = [];
    for (const l of lines) read.push(await readLine(img, l, ocr));
    const now = Date.now();
    for (const m of assemble(read)) {
      if (!m.channel || isRepeat(m, now)) continue;
      recent.push({ nick: m.nick, key: shape(m.text), at: now });
      const kind = cfg.kinds[m.color] || 'super';
      queue.push({ seen: new Date(now).toISOString(), kind, color: m.color, channel: m.channel, nick: m.nick, text: m.text });
      log.unshift({ ...m, kind, status: $('mg-upload').checked ? '대기' : '전송 꺼짐' });
      log.length = Math.min(log.length, 60);
    }
    say(`줄 ${stats.lines}개 · OCR ${stats.read}회 · 새 확성기 ${log.length} · 전송 ${stats.sent} · 실패 ${stats.failed} · 대기 ${queue.length}`);
    render();
  } catch (e) { say(`오류: ${e.message}`); }
  finally { busy = false; }
}

async function flush() {
  if (!queue.length || !$('mg-upload').checked) return;
  const rows = queue.splice(0, 50);
  try {
    const r = await fetch(`${cfg.api}/internal/megaphone`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    if (!r.ok) throw new Error(String(r.status));
    stats.sent += (await r.json()).accepted || 0;
    for (const e of log) if (e.status === '대기') e.status = '전송됨';
  } catch (e) { stats.failed += rows.length; say(`전송 실패 (${e.message}) · 관리자 키를 확인하세요`); }
}

const COLOR = { Y: '노랑', P: '분홍', C: '청록' };
function render() {
  $('mg-log').innerHTML = log.map((e) => `<tr><td><i class="mg-swatch mg-${e.color}"></i>${COLOR[e.color] || ''}</td><td>${e.kind}</td><td>${e.channel ?? ''}</td><td>${esc(e.nick)}</td><td>${esc(e.text)}</td><td>${e.status}</td></tr>`).join('');
}

$('mg-start').addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    video.srcObject = stream; await video.play();
    stream.getVideoTracks()[0].addEventListener('ended', () => { clearInterval(timer); stream = null; say('화면 공유가 끝났어요.'); });
    clearInterval(timer); timer = setInterval(tick, TICK_MS);
    say('공유 중 · 채팅창을 찾고 있어요.');
  } catch (e) { say('화면 공유를 시작하지 못했어요.'); }
});
setInterval(flush, 5000);
$('mg-token').addEventListener('change', (e) => { localStorage.setItem('gms-mega-token', e.target.value.trim()); e.target.value = ''; say('관리자 키를 저장했어요.'); });
$('mg-reset').addEventListener('click', () => { region = null; localStorage.removeItem('gms-mega-box'); ocrCache.clear(); });
$('mg-keep').closest('label').hidden = !LOCAL;
$('mg-upload').checked = localStorage.getItem('gms-mega-upload') === 'on';
$('mg-upload').addEventListener('change', (e) => localStorage.setItem('gms-mega-upload', e.target.checked ? 'on' : 'off'));
token().then((t) => say(t ? '준비됨 · 게임 창 공유를 시작하세요.' : '관리자 키를 입력하세요.'));
