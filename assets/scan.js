// Shop scanner. Players share the game window in Chrome; the page watches it and reports what it recognized. The game screen
// itself is never shown back to the player. In local development (scripts/scan-dev.mjs) changed frames are also posted to the
// dev server, which keeps them as samples for building the shop reader.
import { findChannel, findRoom, findShopRows, lastRoomKey, matchItem, readLine, readOwner } from './shop-reader.js';

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
  const ch = findChannel(img);
  if (ch) channel = ch;
  if (channel) check('channel', 'ok', fill(i18n.channelOk, { ch: channel }));
  else check('channel', 'warn', i18n.channelNone);
  // Changing channel always shows the channel window, so walking between rooms never makes the kept channel stale.
  const fm = findRoom(img, mapData);
  // An unknown room must not inherit the previous room's number, or its listings would be filed under the wrong room.
  if (fm !== null) room = fm || null;
  if (fm === 0) askRoom();
  else if (room) check('room', 'ok', fill(i18n.roomOk, { room }));
  else check('room', 'warn', i18n.roomNone);
  const rows = findShopRows(img);
  const owner = rows.length ? readOwner(img, Math.min(...rows.map((r) => r.top)), rows[0].x0, table) : '';
  if (!rows.length) check('shop', 'warn', i18n.shopNone);
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
function tick() {
  if (!video.videoWidth) return;
  const sig = signature();
  if (changed(lastSig, sig)) settling = true;
  else if (settling) {
    settling = false;
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
  const size = { w: video.videoWidth, h: video.videoHeight };
  // The reader is tuned for the 1366x768 windowed client (plus the title bar); other sizes scale the UI and break it.
  check('share', size.w === 1366 ? 'ok' : 'warn', fill(size.w === 1366 ? i18n.shareOn : i18n.shareSize, size));
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
