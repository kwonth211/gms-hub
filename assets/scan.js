// Shop scanner, step 1: collect pixel-exact samples of the game window through Chrome screen sharing. Frames stay on this
// computer (a folder the player picks, or downloads); nothing is uploaded.
const i18n = JSON.parse(document.getElementById('i18n').textContent);
const $ = (id) => document.getElementById(id);
const video = $('scan-video');
const status = $('scan-status');
const thumbs = $('scan-thumbs');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);

const AUTO_MS = 1000;
const MAX_FRAMES = 400;
// Share of sampled pixels that must change before an automatic capture: opening or scrolling a shop passes, idle animation does not.
const CHANGE_RATIO = 0.04;

let stream = null;
let dir = null;
let recorder = null;
let chunks = [];
let saved = 0;
let timer = null;
let lastSig = null;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function say(text) {
  status.textContent = text;
}

async function saveBlob(blob, name) {
  if (dir) {
    const file = await dir.getFileHandle(name, { create: true });
    const w = await file.createWritable();
    await w.write(blob);
    await w.close();
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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

async function capture(reason) {
  if (!stream || saved >= MAX_FRAMES || !video.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  saved++;
  await saveBlob(blob, `gms-scan-${stamp()}-${String(saved).padStart(3, '0')}.png`);
  const img = document.createElement('img');
  img.src = URL.createObjectURL(blob);
  img.alt = '';
  thumbs.prepend(img);
  while (thumbs.children.length > 8) thumbs.lastChild.remove();
  say(fill(i18n.saved, { n: saved, w: c.width, h: c.height }) + (reason === 'auto' ? ` · ${i18n.auto}` : ''));
}

function tick() {
  const sig = signature();
  if (changed(lastSig, sig)) capture('auto');
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
  say(fill(i18n.sharing, { w: video.videoWidth, h: video.videoHeight }));
  if ($('scan-record').checked && window.MediaRecorder) {
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => saveBlob(new Blob(chunks, { type: 'video/webm' }), `gms-scan-${stamp()}.webm`);
    recorder.start(1000);
  }
  if ($('scan-auto').checked) timer = setInterval(tick, AUTO_MS);
  track('scan_start', { auto: $('scan-auto').checked, record: $('scan-record').checked, width: video.videoWidth });
}

function stop() {
  clearInterval(timer);
  timer = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  lastSig = null;
  document.body.classList.remove('scanning');
  say(fill(i18n.stopped, { n: saved }));
  track('scan_stop', { frames: saved });
}

$('scan-start').addEventListener('click', start);
$('scan-stop').addEventListener('click', stop);
$('scan-shot').addEventListener('click', () => capture('manual'));

if (window.showDirectoryPicker) {
  $('scan-dir').addEventListener('click', async () => {
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      $('scan-dir-name').textContent = dir.name;
    } catch (e) {}
  });
} else {
  $('scan-dir').hidden = true;
}

if (!navigator.mediaDevices?.getDisplayMedia) {
  $('scan-start').disabled = true;
  say(i18n.unsupported);
}
