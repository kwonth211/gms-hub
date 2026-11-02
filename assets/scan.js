// Shop scanner. Players share the game window in Chrome; the page watches it and reports what it recognized. The game screen
// itself is never shown back to the player. In local development (scripts/scan-dev.mjs) changed frames are also posted to the
// dev server, which keeps them as samples for building the shop reader.
const i18n = JSON.parse(document.getElementById('i18n').textContent);
const $ = (id) => document.getElementById(id);
const status = $('scan-status');
const results = $('scan-results');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);

const TICK_MS = 1000;
// Share of sampled pixels that must change before a frame counts as new: opening or scrolling a shop passes, idle animation does not.
const CHANGE_RATIO = 0.04;
const SAMPLE_URL = '/__scan/frame';

const video = document.createElement('video');
video.muted = true;
let stream = null;
let timer = null;
let lastSig = null;
let frames = 0;
let samples = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

function say(text) {
  status.textContent = text;
}

// A 64x36 grayscale fingerprint is enough to tell "something opened" from "nothing happened".
function signature() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data;
  const sig = new Uint8Array(64 * 36);
  for (let i = 0; i < sig.length; i++) sig[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return sig;
}

function changed(a, b) {
  if (!a) return true;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) n++;
  return n / a.length > CHANGE_RATIO;
}

function grab() {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return c;
}

async function keepSample(canvas) {
  if (!samples) return;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  try {
    const r = await fetch(SAMPLE_URL, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    if (!r.ok) samples = false;
  } catch (e) {
    samples = false;
  }
}

// Shop reading is not built yet; until it is, every new frame is only counted (and kept as a sample when running locally).
function recognize(canvas) {
  return [];
}

function show(found) {
  if (!found.length) return;
  results.querySelector('.empty')?.remove();
  for (const row of found) {
    const li = document.createElement('li');
    li.textContent = `${row.name} · ${row.price}`;
    results.prepend(li);
  }
}

function tick() {
  if (!video.videoWidth) return;
  const sig = signature();
  if (changed(lastSig, sig)) {
    frames++;
    const canvas = grab();
    keepSample(canvas);
    show(recognize(canvas));
    say(fill(i18n.watching, { n: frames }));
  }
  lastSig = sig;
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
  } catch (e) {
    say(i18n.denied);
    return;
  }
  video.srcObject = stream;
  await video.play();
  document.body.classList.add('scanning');
  stream.getVideoTracks()[0].addEventListener('ended', stop);
  say(fill(i18n.watching, { n: frames }));
  timer = setInterval(tick, TICK_MS);
  track('scan_start', { width: video.videoWidth, height: video.videoHeight });
}

function stop() {
  clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  lastSig = null;
  document.body.classList.remove('scanning');
  say(fill(i18n.stopped, { n: frames }));
  track('scan_stop', { frames });
}

$('scan-start').addEventListener('click', start);
$('scan-stop').addEventListener('click', stop);

if (!navigator.mediaDevices?.getDisplayMedia) {
  $('scan-start').disabled = true;
  say(i18n.unsupported);
}
