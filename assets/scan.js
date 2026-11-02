// Shop scanner. Players share the game window in Chrome; the page watches it and reports what it recognized. The game screen
// itself is never shown back to the player. In local development (scripts/scan-dev.mjs) changed frames are also posted to the
// dev server, which keeps them as samples for building the shop reader.
import { findShopRows, matchItem, readLine } from './shop-reader.js';

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
let items = [];
let table = {};
const seen = new Map();
const nf = new Intl.NumberFormat(i18n.lang);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Promise.all([fetch(i18n.itemsUrl).then((r) => r.json()), fetch(i18n.glyphsUrl).then((r) => r.json())])
  .then(([rows, glyphs]) => {
    items = rows.map(([id, ko, en]) => ({ id, ko, en }));
    table = glyphs.glyphs;
  })
  .catch(() => {});

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

// Every shop row on screen: item from the name line (matched against the item list), price from "<n> for <price> mesos".
function recognize(canvas) {
  const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return findShopRows(img).map((row) => {
    const name = readLine(img, row, 0, table);
    const priceText = readLine(img, row, 1, table);
    const m = priceText.match(/^(\d+)for([\d,]+)mesos$/);
    const match = matchItem(name, items);
    return {
      sold: row.sold,
      name,
      item: match?.item || null,
      price: m ? Number(m[2].replace(/,/g, '')) : null,
      sure: !!match && match.confidence >= 0.9 && !!m && !name.includes('?')
    };
  });
}

// One line per distinct listing in this session; seeing it again only refreshes it (and marks it sold if it sold since).
function show(found) {
  if (!found.length) return;
  results.querySelector('.empty')?.remove();
  results.querySelectorAll('tr.fresh').forEach((tr) => tr.classList.remove('fresh'));
  // Prepending in reverse keeps the rows in the same order as on screen.
  for (const r of [...found].reverse()) {
    const key = `${r.item?.id || r.name}|${r.price}`;
    let tr = seen.get(key);
    if (!tr) {
      tr = document.createElement('tr');
      seen.set(key, tr);
    }
    const title = r.item ? (i18n.lang === 'ko' ? r.item.ko || r.item.en : r.item.en) : r.name;
    const sub = r.item && title !== r.item.en ? `<small>${esc(r.item.en)}</small>` : '';
    const icon = r.item ? `<img src="https://maplestory.io/api/MCW/1/item/${r.item.id}/icon" alt="" width="28" height="28">` : '';
    tr.className = `fresh${r.sold ? ' sold' : ''}`;
    tr.innerHTML = `<td><span class="item">${icon}<span>${esc(title)}${sub}</span></span></td>
<td class="price">${r.price ? `${nf.format(r.price)} <small>${i18n.each}</small>` : '?'}</td>
<td>${r.sold ? i18n.sold : i18n.selling}</td>
<td><span class="badge ${r.sure ? 'ok' : 'check'}">${r.sure ? i18n.ok : i18n.check}</span></td>`;
    results.prepend(tr);
  }
  const rows = [...seen.values()];
  $('scan-summary').textContent = fill(i18n.summary, { items: rows.length, check: rows.filter((tr) => tr.querySelector('.check')).length });
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
