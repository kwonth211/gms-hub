// Shop scanner. Players share the game window in Chrome; the page watches it and reports what it recognized. The game screen
// itself is never shown back to the player. In local development (scripts/scan-dev.mjs) changed frames are also posted to the
// dev server, which keeps them as samples for building the shop reader.
import { detectScale, findChannel, findRoom, findShopRows, findShopRowsLoose, lastRoomKey, matchItem, parsePriceLine, readLine, readOwner } from './shop-reader.js';

const i18n = JSON.parse(document.getElementById('i18n').textContent);
const $ = (id) => document.getElementById(id);
const status = $('scan-status');
const results = $('scan-results');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);

const TICK_MS = 500;
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
let mapData = null;
// The channel is only visible while the Change Channel window is open, so the last one seen is kept until the player moves.
let channel = null;
let room = null;
const seen = new Map();
const nf = new Intl.NumberFormat(i18n.lang);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Promise.all([fetch(i18n.itemsUrl).then((r) => r.json()), fetch(i18n.glyphsUrl).then((r) => r.json())])
  .then(([rows, glyphs]) => {
    items = rows.map(([id, ko, en]) => ({ id, ko, en }));
    table = glyphs.glyphs;
    mapData = glyphs.map;
    Object.assign(mapData.rooms, taughtRooms());
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

// Screen scaling (Retina 2x, Windows 125%/150%...) enlarges every game pixel before Chrome hands the window over, and the game
// window itself can be any size. The scale is measured from the shop list's separator lines in the raw frame (the screen's
// pixel ratio is the first guess), and each frame is drawn back down to game pixels before reading: nearest-neighbour for
// whole-number scales, which restores letters exactly, smoothed otherwise, where the reader's letter matching absorbs the rest.
let scale = Math.round((window.devicePixelRatio || 1) * 4) / 4;
let lastFull = null;

// ---------- OCR for non-integer scales ----------
// At 125%/150%-style scaling the 1px letters cannot be restored exactly, so their text is read with Tesseract from the
// full-resolution capture instead. It is fetched from a CDN only for players who need it.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let ocrWorker = null;
async function ocrEngine() {
  if (!ocrWorker) {
    ocrWorker = (async () => {
      check('shop', 'warn', i18n.ocrLoading);
      if (!window.Tesseract)
        await new Promise((ok, fail) => {
          const el = document.createElement('script');
          el.src = TESSERACT_URL;
          el.onload = ok;
          el.onerror = fail;
          document.head.appendChild(el);
        });
      const w = await window.Tesseract.createWorker('eng');
      await w.setParameters({ tessedit_pageseg_mode: '7' });
      return w;
    })();
  }
  return ocrWorker;
}

// Crop a rectangle given in game pixels out of the full capture, enlarge it k times, and binarise it with Otsu's threshold
// (the blur of non-integer scaling leaves no fixed cut-off that works for every line), on a white margin Tesseract needs.
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
async function ocrRect(gx, gy, gw, gh, { light = false, k = 4, psm = '7', chars = '' } = {}) {
  const worker = await ocrEngine();
  const pad = 8;
  const w = Math.round(gw * k);
  const h = Math.round(gh * k);
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(lastFull, gx * scale, gy * scale, gw * scale, gh * scale, pad, pad, w, h);
  const im = g.getImageData(pad, pad, w, h);
  const hist = new Array(256).fill(0);
  const lums = new Uint8Array(w * h);
  for (let p = 0; p < lums.length; p++) {
    const v = Math.round((im.data[p * 4] + im.data[p * 4 + 1] + im.data[p * 4 + 2]) / 3);
    lums[p] = v;
    hist[v]++;
  }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0;
  let wB = 0;
  let best = -1;
  let th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    const wF = lums.length - wB;
    if (!wB || !wF) continue;
    sB += t * hist[t];
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best) {
      best = between;
      th = t;
    }
  }
  for (let p = 0; p < lums.length; p++) {
    const ink = light ? lums[p] > th : lums[p] < th;
    im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = ink ? 0 : 255;
  }
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.putImageData(im, pad, pad);
  await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: chars });
  return (await worker.recognize(c)).data.text.trim();
}

const majority = (reads) => {
  const counts = new Map();
  for (const r of reads.filter(Boolean)) counts.set(r, (counts.get(r) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

function raw() {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
  return c;
}

function grab() {
  const full = raw();
  lastFull = full;
  const measured = detectScale(full.getContext('2d').getImageData(0, 0, full.width, full.height));
  if (measured) scale = Math.abs(measured - Math.round(measured)) < 0.04 ? Math.round(measured) : measured;
  if (scale === 1) return full;
  const c = document.createElement('canvas');
  c.width = Math.round(full.width / scale);
  c.height = Math.round(full.height / scale);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = !Number.isInteger(scale);
  g.imageSmoothingQuality = 'high';
  g.drawImage(full, 0, 0, c.width, c.height);
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

async function recognize(canvas) {
  const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const exact = Number.isInteger(scale);
  const ch = findChannel(img);
  if (ch) channel = ch;
  if (channel) check('channel', 'ok', fill(i18n.channelOk, { ch: channel }));
  else check('channel', 'warn', i18n.channelNone);
  // Changing channel always shows the channel window, so walking between rooms never makes the kept channel stale.
  let fm = findRoom(img, mapData);
  if (fm === null && !exact) fm = await roomByOcr(img);
  // An unknown room must not inherit the previous room's number, or its listings would be filed under the wrong room.
  if (fm !== null) room = fm || null;
  if (fm === 0) askRoom();
  else if (room) check('room', 'ok', fill(i18n.roomOk, { room }));
  else check('room', 'warn', i18n.roomNone);
  const rows = exact ? findShopRows(img) : findShopRowsLoose(img);
  if (!rows.length) {
    check('shop', 'warn', i18n.shopNone);
    return [];
  }
  const listTop = Math.min(...rows.map((r) => r.top));
  if (!exact) return readByOcr(rows, listTop, fm);
  const owner = readOwner(img, listTop, rows[0].x0, table);
  // A line that matches no item is not shown; it is counted so the summary can say something was skipped.
  return rows.map((row) => {
    const name = readLine(img, row, 0, table);
    const priceText = readLine(img, row, 1, table);
    const m = priceText.match(/^(\d+)for([\d,]+)mesos$/);
    const match = matchItem(name, items);
    return {
      sold: row.sold,
      name,
      item: match?.item || null,
      price: m ? Number(m[2].replace(/,/g, '')) : null,
      owner,
      channel,
      room,
      // Rows read in a room nobody has named yet remember its title, so naming it later fills them in.
      roomKey: fm === 0 ? lastRoomKey : null,
      sure: !!match && match.confidence >= 0.9 && !!m && !name.includes('?') && !priceText.includes('?')
    };
  });
}

// Same result shape as the exact path, from OCR of each row's two lines and the owner box.
async function readByOcr(rows, listTop, fm) {
  const x0 = rows[0].x0;
  // Seller names are the shakiest read (small light-on-dark text), so three crops vote.
  // One OCR worker: the reads run in turn, since each sets its own page mode and character list.
  const ownerReads = [];
  for (const o of [{ k: 4, psm: '7' }, { k: 8, psm: '8' }, { k: 6, psm: '7' }])
    ownerReads.push((await ocrRect(x0 + 10, listTop - 19, 82, 14, { light: true, chars: ALNUM, ...o })).replace(/[^A-Za-z0-9]/g, ''));
  const owner = majority(ownerReads);
  const out = [];
  for (const row of rows) {
    const name = await ocrRect(row.x0 + 38, row.top + 3, row.x1 - row.x0 - 42, 17);
    const priceText = await ocrRect(row.x0 + 38, row.top + 20, row.x1 - row.x0 - 42, 17);
    const p = parsePriceLine(priceText);
    const match = matchItem(name, items);
    out.push({
      sold: row.sold,
      name,
      item: match?.item || null,
      price: p?.price || null,
      owner,
      channel,
      room,
      roomKey: null,
      sure: !!match && match.confidence >= 0.85 && !!p && /^[A-Za-z0-9]{2,13}$/.test(owner)
    });
  }
  return out;
}

// Minimap title by OCR when it cannot be matched pixel for pixel: light text lines in the minimap's top-left corner are each
// read at three sizes and the room number must agree in two.
async function roomByOcr(img) {
  const lines = [];
  let top = -1;
  for (let y = 20; y < Math.min(img.height, 160); y++) {
    let lit = 0;
    for (let x = 44; x < Math.min(img.width, 200); x++) {
      const i = (y * img.width + x) * 4;
      if ((img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 > 215) lit++;
    }
    const on = lit > 8 && lit < 80;
    if (on && top < 0) top = y;
    if (!on && top >= 0) {
      if (y - top >= 6 && y - top <= 14) lines.push({ top, h: y - top });
      top = -1;
    }
  }
  for (const line of lines) {
    const reads = [];
    for (const k of [3, 4, 5]) {
      const text = (await ocrRect(44, line.top - 2, 150, line.h + 4, { light: true, k })).replace(/\s+/g, '');
      const m = text.match(/Fre[ea]Mark[a-z]*[<(«]?(\d{1,2})/i);
      if (m) reads.push(m[1]);
    }
    const room = reads.find((r) => reads.filter((x) => x === r).length >= 2);
    if (room) return Number(room);
  }
  return null;
}

const where = (ch, fm) => [ch ? `CH ${ch}` : '', fm ? `FM${fm}` : ''].filter(Boolean);

// Rooms the table does not know yet can be named by the player once; the answer is kept in this browser and sent to the
// server so the shared table can learn it.
const TAUGHT_KEY = 'gmshub_rooms';
function taughtRooms() {
  try {
    return JSON.parse(localStorage.getItem(TAUGHT_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function askRoom() {
  const li = $('check-room');
  if (li.querySelector('form')) return;
  li.dataset.state = 'warn';
  li.querySelector('small').textContent = i18n.roomAsk;
  const key = lastRoomKey;
  const form = document.createElement('form');
  form.className = 'room-ask';
  form.innerHTML = `<input type="number" min="1" max="40" inputmode="numeric" aria-label="${i18n.roomAsk}" required><button class="btn small-btn" type="submit">${i18n.roomSave}</button>`;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(form.querySelector('input').value);
    if (!Number.isInteger(n) || n < 1 || n > 40) return;
    mapData.rooms[key] = n;
    const taught = taughtRooms();
    taught[key] = n;
    try {
      localStorage.setItem(TAUGHT_KEY, JSON.stringify(taught));
    } catch (err) {}
    if (i18n.api) fetch(`${i18n.api}/room-title`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, room: n }) }).catch(() => {});
    room = n;
    for (const entry of listings.values())
      if (entry.r.roomKey === key && !entry.r.room) {
        entry.r.room = n;
        render(entry.r, entry.tr);
      }
    upload();
    form.remove();
    check('room', 'ok', fill(i18n.roomOk, { room: n }));
    track('scan_room_taught', { room: n });
  });
  li.appendChild(form);
}

// The five recognition steps under the buttons: each is waiting, fine, or needs something from the player.
function check(step, state, text) {
  const li = $(`check-${step}`);
  li.dataset.state = state;
  li.querySelector('small').textContent = text;
}

// Listings go to the shared price data once their seller, channel and room are all known; each one is sent again only
// when it changes (a slot turning sold). Failed sends stay queued for the next frame.
const SELLER = /^[A-Za-z0-9]{2,13}$/;
const sent = new Map();
let uploaded = 0;
let sending = false;

async function upload() {
  if (!i18n.api || sending) return;
  const ready = [...listings.values()].map((e) => e.r).filter((r) => r.sure && r.channel && r.room && SELLER.test(r.owner));
  if (!ready.length) {
    if (listings.size) check('upload', 'warn', i18n.uploadNeed);
    return;
  }
  const fresh = ready.filter((r) => sent.get(listingKey(r)) !== r.sold);
  if (!fresh.length) return;
  sending = true;
  try {
    const res = await fetch(`${i18n.api}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: fresh.map((r) => ({ item: r.item.id, price: r.price, sold: r.sold, seller: r.owner, channel: r.channel, room: r.room }))
      })
    });
    if (!res.ok) throw new Error(String(res.status));
    for (const r of fresh) {
      if (!sent.has(listingKey(r))) uploaded++;
      sent.set(listingKey(r), r.sold);
    }
    check('upload', 'ok', fill(i18n.uploadOk, { n: uploaded }));
    track('scan_upload', { items: fresh.length });
  } catch (e) {
    check('upload', 'warn', i18n.uploadFail);
  }
  sending = false;
}

const listingKey = (r) => `${r.owner}|${r.room}|${r.item.id}|${r.price}`;

// One line per distinct listing in this session; seeing it again only refreshes it (and marks it sold if it sold since).
// A shop is its owner in a room; rows seen before the channel was known get it filled in once it is.
const listings = new Map();
let skipped = 0;

function render(r, tr) {
  const title = r.item ? (i18n.lang === 'ko' ? r.item.ko || r.item.en : r.item.en) : r.name;
  const sub = r.item && title !== r.item.en ? `<small>${esc(r.item.en)}</small>` : '';
  const icon = r.item ? `<img src="https://maplestory.io/api/MCW/1/item/${r.item.id}/icon" alt="" width="28" height="28">` : '';
  tr.classList.toggle('sold', r.sold);
  tr.innerHTML = `<td><span class="item">${icon}<span>${esc(title)}${sub}</span></span></td>
<td class="price">${r.price ? `${nf.format(r.price)} <small>${i18n.each}</small>` : '?'}</td>
<td class="seller">${esc(r.owner.replace(/\?/g, '·')) || '—'}</td>
<td>${where(r.channel, r.room).map((w) => `<span class="where">${w}</span>`).join(' ') || '—'}</td>
<td>${r.sold ? i18n.sold : i18n.selling}</td>
<td><span class="badge ${r.sure ? 'ok' : 'check'}">${r.sure ? i18n.ok : i18n.check}</span></td>`;
}

function show(found) {
  if (channel)
    for (const entry of listings.values())
      if (!entry.r.channel && entry.r.room === room) {
        entry.r.channel = channel;
        render(entry.r, entry.tr);
      }
  if (!found.length) {
    upload();
    return;
  }
  results.querySelector('.empty')?.remove();
  results.querySelectorAll('tr.fresh').forEach((tr) => tr.classList.remove('fresh'));
  // Prepending in reverse keeps the rows in the same order as on screen.
  for (const r of [...found].reverse()) {
    if (!r.item) {
      skipped++;
      continue;
    }
    const key = listingKey(r);
    let entry = listings.get(key);
    if (!entry) {
      entry = { tr: document.createElement('tr') };
      listings.set(key, entry);
    }
    entry.r = r;
    entry.tr.classList.add('fresh');
    render(r, entry.tr);
    results.prepend(entry.tr);
  }
  const readNow = found.filter((r) => r.item).length;
  const skipNow = found.length - readNow;
  const seller = (found[0]?.owner || '').replace(/\?/g, '·') || '—';
  check('shop', 'ok', fill(skipNow ? i18n.shopPartial : i18n.shopOk, { seller, n: readNow, skip: skipNow }));
  upload();
  const all = [...listings.values()];
  const shops = new Set(all.map((e) => `${e.r.owner}|${e.r.room}`));
  $('scan-summary').textContent =
    fill(i18n.summary, { shops: shops.size, items: all.length, check: all.filter((e) => !e.r.sure).length }) +
    (skipped ? ` · ${fill(i18n.skipped, { n: skipped })}` : '');
}

// A change is only read once the screen has stopped changing: the shop list scrolls smoothly, and a frame caught mid-scroll
// has every row a pixel or two off, which turns letters into nonsense.
let settling = true;
// OCR can take a few seconds per shop, so a frame is only read when the previous one is done.
let reading = false;
async function tick() {
  if (!video.videoWidth || reading) return;
  const sig = signature();
  if (changed(lastSig, sig)) settling = true;
  else if (settling) {
    settling = false;
    frames++;
    reading = true;
    try {
      const canvas = grab();
      showShare();
      keepSample(canvas);
      show(await recognize(canvas));
      say(fill(i18n.watching, { n: frames }));
    } catch (e) {
      console.error('[scan]', e);
      check('shop', 'warn', ocrWorker ? i18n.ocrFail : i18n.readFail);
    }
    reading = false;
  }
  lastSig = sig;
}

function showShare() {
  const size = { w: video.videoWidth, h: video.videoHeight, k: +scale.toFixed(2) };
  check('share', 'ok', fill(scale === 1 ? i18n.shareOn : i18n.shareRetina, size));
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
  showShare();
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
  ['share', 'shop', 'channel', 'room'].forEach((k) => check(k, 'wait', i18n.wait));
  say(fill(i18n.stopped, { n: frames }));
  track('scan_stop', { frames });
}

$('scan-start').addEventListener('click', start);
$('scan-stop').addEventListener('click', stop);

if (!navigator.mediaDevices?.getDisplayMedia) {
  $('scan-start').disabled = true;
  say(i18n.unsupported);
}
