// Shop scanner. Players share the game window in Chrome; the page watches it and reports what it recognized. The game screen
// itself is never shown back to the player. In local development (scripts/scan-dev.mjs) changed frames are also posted to the
// dev server, which keeps them as samples for building the shop reader.
import { detectScale, findChannel, findRoom, findShopRows, findShopRowsLoose, matchItem, parsePriceLine, priceFromLine, readLine, readOwner, scrollTier, ambiguousName, narrowByTier } from './shop-reader.js';

import { KERNING, placeLabel } from './place.js';
import { SELLER, validLocation, listingKey, payload, fingerprint, validListing, canUpload, sameShop, verifiedPrice } from './scan-state.js';
// Rechargeable items (throwing stars 207xxxx, bullets 233xxxx): sold and priced per set, whatever the star count.
const RECHARGE = (id) => (id >= 2070000 && id < 2080000) || (id >= 2330000 && id < 2340000);

const i18n = JSON.parse(document.getElementById('i18n').textContent);
const $ = (id) => document.getElementById(id);
const status = $('scan-status');
const results = $('scan-results');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);

const TICK_MS = 500;
// Share of sampled pixels that must change before a frame counts as new: opening or scrolling a shop passes, idle animation does not.
const CHANGE_RATIO = 0.04;
const FORCE_READ_MS = 5000;
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
// Once read, channel and room stay until a different one is read (2026-11-15, owner): switching to the inventory, chat or
// another window hides the minimap and the channel, and that is no reason to forget where the shop is. They also survive
// stopping and restarting the share, and a page reload within three hours.
// Scanning your own shop: the owner box of your own store window often reads blank, which made every frame a new shop
// (the same items listed again and again) and blocked the upload. The name typed here fills in for an unreadable owner.
const ME_KEY = 'gmshub_scan_me';
const meInput = document.getElementById('scan-me');
try { if (meInput) meInput.value = localStorage.getItem(ME_KEY) || ''; } catch {}
meInput?.addEventListener('change', () => { try { localStorage.setItem(ME_KEY, meInput.value.trim()); } catch {} track('scan_me_set'); });
const me = () => { const v = (meInput?.value || '').trim(); return /^[A-Za-z0-9]{4,13}$/.test(v) ? v : ''; };
const LOC_KEY = 'gmshub_scan_loc';
let { channel = null, room = null } = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(LOC_KEY) || 'null');
    return v && Date.now() - v.at < 3 * 3600e3 ? { channel: validLocation(v.channel) ? v.channel : null, room: validLocation(v.room) ? v.room : null } : {};
  } catch { return {}; }
})();
const keepLocation = () => { try { localStorage.setItem(LOC_KEY, JSON.stringify({ channel, room, at: Date.now() })); } catch {} };
let locationRevision = 0;
let sessionRevision = 0;
let dataReady = false;
const nf = new Intl.NumberFormat(i18n.lang);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function loadData() {
  $('scan-start').disabled = true;
  say(i18n.loading);
  try {
    const get = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    };
    const [rows, glyphs] = await Promise.all([get(i18n.itemsUrl), get(i18n.glyphsUrl)]);
    items = rows.map(([id, ko, en]) => ({ id, ko, en }));
    table = glyphs.glyphs;
    mapData = glyphs.map;
    dataReady = true;
    $('scan-start').disabled = !navigator.mediaDevices?.getDisplayMedia;
    $('scan-retry-data').hidden = true;
    say(navigator.mediaDevices?.getDisplayMedia ? i18n.ready : i18n.unsupported);
  } catch {
    say(i18n.dataFail);
    $('scan-retry-data').hidden = false;
  }
}
$('scan-retry-data').addEventListener('click', loadData);

function locationStatus() {
  for (const [key, value] of [['channel', channel], ['room', room]]) {
    const manual = Number($(`scan-${key}`).value);
    check(key, value ? 'ok' : 'warn', value
      ? fill(key === 'channel' ? i18n.channelOk : i18n.roomOk, { ch: value, room: value }) + (manual ? ` · ${i18n.manual}` : '')
      : key === 'channel' ? i18n.channelNone : i18n.roomNone);
  }
}
for (const key of ['channel', 'room']) $('scan-' + key).addEventListener('change', () => {
  locationRevision++;
  channel = Number($('scan-channel').value) || channel;
  room = Number($('scan-room').value) || room;
  keepLocation();
  currentShop = null;
  lastSig = null;
  settling = true;
  locationStatus();
  say(i18n.locationChanged);
});

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

// OCR fallback for unreadable text, including compressed or unfamiliar glyphs at 1x.
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
    })().catch((err) => { ocrWorker = null; throw err; });
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
  // Averaging rather than picking pixels: a Mac scales a non-Retina game window up smoothly, so even an exact 2x capture has
  // blended pixels, and the average of each block is the closest thing to the original pixel. Where the capture really
  // duplicated pixels, the average is that pixel exactly.
  g.imageSmoothingEnabled = true;
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

// Where a scan gets stuck (owner 2026-11-19: 17 started in a week, 5 uploaded). Each problem is sent once per scan as
// scan_issue { issue, ... } so GA shows where people drop off; the first readable shop is scan_first_rows.
let scanStartedAt = 0, everRows = 0, firstSureAt = 0, missLoc = 0;
const issued = new Set();
// ui_label / ui_value are registered GA dimensions, so the kind of problem and the capture size show up in reports.
const issue = (kind, params = {}) => { if (issued.has(kind)) return; issued.add(kind); track('scan_issue', { issue: kind, ui_label: kind, ui_value: params.w ? `${params.w}x${params.h}@${params.scale}` : String(params.msg || ''), after_s: scanStartedAt ? Math.round((Date.now() - scanStartedAt) / 1000) : 0, ...params }); };

async function recognize(canvas) {
  const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const manualChannel = Number($('scan-channel').value);
  const manualRoom = Number($('scan-room').value);
  const ch = manualChannel || findChannel(img);
  if (validLocation(ch)) channel = ch;
  const fm = manualRoom || findRoom(img, mapData, scale !== 1);
  // Only a new reading moves the room; a hidden or unreadable minimap keeps the last one (see LOC_KEY).
  if (validLocation(fm)) room = fm;
  if (validLocation(ch) || validLocation(fm)) keepLocation();
  locationStatus();
  // Pixel-exact rows first; a scaled or blurred capture falls back to the blur-tolerant finder.
  let rows = findShopRows(img);
  if (!rows.length) rows = findShopRowsLoose(img);
  if (!rows.length) {
    check('shop', 'warn', i18n.shopNone);
    if (!everRows && Date.now() - scanStartedAt > 20000) issue('no_shop', { w: img.width, h: img.height, scale: +scale.toFixed(2) });
    return [];
  }
  if (!everRows++) track('scan_first_rows', { after_s: Math.round((Date.now() - scanStartedAt) / 1000), rows: rows.length });
  // A shop on screen whose channel or room stays unknown blocks every upload.
  if (!validLocation(channel) || !validLocation(room)) { if (++missLoc >= 3) issue(!validLocation(channel) ? 'no_channel' : 'no_room'); } else missLoc = 0;
  const loose = rows[0].loose;
  const listTop = Math.min(...rows.map((r) => r.top));
  let owner = readOwner(img, listTop, rows[0].x0, table, loose);
  if (!SELLER.test(owner)) {
    try { owner = await ownerByOcr(rows[0].x0, listTop); } catch { /* Keep the row available for manual correction. */ }
  }
  if (!SELLER.test(owner) && me()) owner = me();
  const out = [];
  for (const row of rows) {
    let name = readLine(img, row, 0, table);
    const priceText = readLine(img, row, 1, table);
    let p = priceFromLine(priceText);
    let match = matchItem(name, items);
    const needsPriceCheck = scale !== 1 || !!row.loose;
    // Uncertain lines use OCR at any display scale; failure must not discard the other readable rows.
    // A name that fits two different items (DEF/DEX) is read again with OCR, which knows every letter.
    const unsure = !match || match.confidence < 0.85 || ambiguousName(match);
    if (needsPriceCheck || unsure || !p) {
      try {
        const ocr = await rowByOcr(row, unsure);
        if (unsure) {
          const again = ocr.name ? matchItem(ocr.name, items) : null;
          if (!match || match.confidence < 0.85 || (again && again.confidence >= 0.85 && !ambiguousName(again))) { name = ocr.name || name; match = again || match; }
        }
        p = verifiedPrice(p, ocr.price, needsPriceCheck);
      } catch { if (needsPriceCheck) p = null; }
    }
    // A scroll name cut before its tier fits every tier; the icon's tint says which one it is.
    if (match?.alternatives) match = narrowByTier(match, scrollTier(img, row));
    // A line that matches no item and holds no word (a cut-off row, a cursor or tooltip over it) is shown as unreadable
    // rather than as the stray marks OCR made of it.
    if (!match && !/[A-Za-z가-힣]{2}/.test(name)) name = '';
    // Not shop goods: the sold-items log beside your own store ("Buyer: name", "40,998 mesos"), and lines with no item and no
    // price, or no price at all (a frame caught mid-scroll). They never upload, so they are not listed either.
    if (!match && /^\s*buyer\b|\bmesos?\b/i.test(name)) continue;
    if (!p) continue;
    // "100 for 5,000 mesos" is 100 items at 50 each: prices are kept per item so bundles compare with single listings.
    // Throwing stars and bullets are the exception: the number on them is how many stars the one set holds (a 500-star
    // Wolbi set for 2,000), and the market prices them per set, so the whole price stays on one item.
    const qty = RECHARGE(match?.item?.id) ? 1 : p?.qty || 1;
    out.push({
      sold: row.sold,
      name,
      item: match?.item || null,
      alternatives: match?.alternatives || null,
      qty,
      price: p?.price ? Math.max(1, Math.round(p.price / qty)) : null,
      owner,
      channel,
      room,
      sure: !!match && match.confidence >= 0.85 && !match.alternatives && !!p && p.price % qty === 0 && SELLER.test(owner)
    });
  }
  return out;
}

// OCR fallbacks for a scaled capture, read from the full-resolution frame.
async function ownerByOcr(x0, listTop) {
  // Seller names are the shakiest read (small light-on-dark text), so three crops vote. One OCR worker: the reads run in
  // turn, since each sets its own page mode and character list.
  const reads = [];
  for (const o of [{ k: 4, psm: '7' }, { k: 8, psm: '8' }, { k: 6, psm: '7' }])
    reads.push((await ocrRect(x0 + 10, listTop - 19, 82, 14, { light: true, chars: ALNUM, ...o })).replace(/[^A-Za-z0-9]/g, ''));
  const name = majority(reads);
  return reads.filter((r) => r === name).length >= 2 ? name : '';
}

async function rowByOcr(row, readName = true) {
  const name = readName ? await ocrRect(row.x0 + 38, row.top + 3, row.x1 - row.x0 - 42, 17) : '';
  // Two independent crop sizes must agree on both quantity and total price.
  const prices = [];
  for (const k of [4, 6]) prices.push(parsePriceLine(await ocrRect(row.x0 + 38, row.top + 20, row.x1 - row.x0 - 42, 17, { k })));
  const price = prices[0] && prices[1] && prices[0].qty === prices[1].qty && prices[0].price === prices[1].price ? prices[0] : null;
  return { name, price };
}

const where = (ch, fm) => [ch ? `CH ${ch}` : '', fm ? placeLabel(fm, i18n.lang === 'ko') : ''].filter(Boolean);

// The five recognition steps under the buttons: each is waiting, fine, or needs something from the player.
function check(step, state, text) {
  const li = $(`check-${step}`);
  li.dataset.state = state;
  li.querySelector('small').textContent = text;
}

// Listings go to the shared price data once their seller, channel and room are all known; each one is sent again only
// when it changes (a slot turning sold). Failed sends stay queued for the next frame.
const sent = new Map();

// Seller and location identify a shop. Leaving a shop or stopping never upgrades a single uncertain read.
const shops = [];
let currentShop = null;

function shopFor(rows) {
  const read = rows[0]?.owner || '';
  let shop = sameShop(currentShop, rows, channel, room) ? currentShop : shops.find((s) => sameShop(s, rows, channel, room));
  // One seller has one shop, and changing channel closes it: the same seller still on screen under a new channel read means
  // that read was wrong (a cell picked in the Change Channel window, or a frame from before the move).
  if (!shop && currentShop && SELLER.test(read) && leader(currentShop)[0] === read) shop = currentShop;
  // Keep an unreadable owner's current list available for manual correction, without merging other shops by price.
  if (!shop && currentShop && !SELLER.test(read) && currentShop.channel === channel && currentShop.room === room &&
      currentShop.signature === rows.map((r) => `${r.name}|${r.price}`).join(';')) shop = currentShop;
  if (!shop) {
    shop = { id: shops.length + 1, channel, room, votes: new Map() };
    shops.push(shop);
  }
  currentShop = shop;
  shop.signature = rows.map((r) => `${r.name}|${r.price}`).join(';');
  if (SELLER.test(read)) shop.votes.set(read, (shop.votes.get(read) || 0) + 1);
  return shop;
}

const leader = (shop) => shop.override ? [shop.override, Infinity] : [...shop.votes.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
const shopReady = (shop) => SELLER.test(leader(shop)[0]) && leader(shop)[1] >= 2;
let uploaded = 0;
let sending = false;
let retryAt = 0;
let failures = 0;

async function upload() {
  if (!i18n.api || sending || Date.now() < retryAt) return;
  const ready = [...listings.values()].map((e) => e.r).filter((r) => canUpload(r) && (r.edited || shopReady(r.shop)));
  // Copy the payload before awaiting the network; later edits must not be marked as sent by an older response.
  const fresh = ready.filter((r) => sent.get(listingKey(r)) !== fingerprint(r)).slice(0, 100)
    .map((r) => ({ r, key: listingKey(r), body: payload(r), signature: fingerprint(r) }));
  if (!fresh.length) {
    if (uploaded) check('upload', 'ok', fill(i18n.uploadOk, { n: uploaded }));
    else if (listings.size) check('upload', 'warn', i18n.uploadNeed);
    return;
  }
  sending = true;
  let succeeded = false;
  try {
    // Corrections are retried as corrections, never inserted as duplicate new prices.
    for (const entry of fresh.filter((e) => e.r.pendingCorrection)) {
      const res = await fetch(`${i18n.api}/listings/fix`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: entry.r.pendingCorrection, to: entry.body }) });
      const data = await res.json();
      if (!res.ok || data.fixed !== 1) throw new Error('Correction not acknowledged');
      delete entry.r.pendingCorrection;
      sent.set(entry.key, entry.signature);
    }
    const inserts = fresh.filter((e) => sent.get(e.key) !== e.signature);
    if (inserts.length) {
      // Logged in with Discord (assets/account.js), the upload counts for the contributor leaderboard under their name.
      const res = await fetch(`${i18n.api}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(globalThis.gmsAuth?.() || {}) },
        body: JSON.stringify({ items: inserts.map((e) => e.body) }) });
      const data = await res.json();
      if (!res.ok || data.stored !== inserts.length) throw new Error('Incomplete upload');
      for (const e of inserts) {
        if (!sent.has(e.key)) uploaded++;
        sent.set(e.key, e.signature);
      }
    }
    check('upload', 'ok', fill(i18n.uploadOk, { n: uploaded }));
    track('scan_upload', { items: fresh.length });
    showMyShop(fresh.map((e) => e.body.seller));
    globalThis.gmsLoginNudge?.('scan');
    failures = 0;
    succeeded = true;
  } catch (e) {
    retryAt = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(++failures, 5));
    check('upload', 'warn', i18n.uploadFail);
    issue('upload_fail', { msg: String(e?.message || e).slice(0, 80) });
  } finally {
    sending = false;
    $('scan-retry-upload').hidden = ![...listings.values()].some((e) => canUpload(e.r) && sent.get(listingKey(e.r)) !== fingerprint(e.r));
    if (succeeded && !$('scan-retry-upload').hidden) queueMicrotask(upload);
  }
}
$('scan-retry-upload').addEventListener('click', () => { retryAt = 0; upload(); });

// One line per distinct listing in this session; seeing it again only refreshes it (and marks it sold if it sold since).
// An unresolved location stays with its original frame and can be corrected in the row editor.
const listings = new Map();
const correctedKeys = new Set();
// Rows the player removed as misread: the same row read again is not added back.
const removedKeys = new Set();
const sigKeys = new Map();
const removedSigs = new Set();
// Player corrections are remembered by what was read (place, item read, price, quantity), here and in this browser, so the
// same line read again later (a new pass over the shop, another visit) comes in already corrected, e.g. a DEX scroll that
// OCR keeps reading as DEF. The corrected row itself is never touched again.
const FIX_KEY = 'gms-scan-fixes';
const fixSig = (r) => [r.channel, r.room, r.item?.id || r.name, r.price, r.qty].join('|');
const fixes = (() => { try { return new Map(JSON.parse(localStorage.getItem(FIX_KEY) || '[]')); } catch { return new Map(); } })();
function rememberFix(from, r) {
  fixes.delete(from);
  fixes.set(from, { item: r.item?.id, price: r.price, qty: r.qty });
  while (fixes.size > 300) fixes.delete(fixes.keys().next().value);
  try { localStorage.setItem(FIX_KEY, JSON.stringify([...fixes])); } catch {}
}
function applyKnownFix(r) {
  const f = fixes.get(fixSig(r));
  const item = f && items.find((it) => it.id === f.item);
  if (!item) return;
  r.fixFrom = fixSig(r);
  Object.assign(r, { item, price: f.price, qty: f.qty, alternatives: null, fixed: true });
  r.sure = validListing(r);
}
const rowSig = (r) => [r.owner || '', r.channel, r.room, r.item?.id || r.name, r.price, r.qty].join('|');

// Market medians for the items read, fetched once per item so each row shows how far the asking price is from the market.
const medians = new Map();
let medianQueued = false;
function wantMedian(id) {
  if (!id || medians.has(id)) return;
  medians.set(id, undefined);
  if (medianQueued) return;
  medianQueued = true;
  // Rows of one shop arrive together, so one request covers them all.
  queueMicrotask(async () => {
    medianQueued = false;
    const ids = [...medians].filter(([, v]) => v === undefined).map(([k]) => k);
    let data = null;
    try { data = await fetch(`${i18n.api}/prices?ids=${ids.join(',')}`).then((res) => (res.ok ? res.json() : null)); } catch {}
    ids.forEach((k) => medians.set(k, data?.[k]?.median || null));
    for (const e of listings.values()) if (ids.includes(e.r.item?.id) && !e.tr.classList.contains('editing')) render(e.r, e.tr);
  });
}

function marketCells(r) {
  const median = r.item ? medians.get(r.item.id) : null;
  if (median === undefined) return '<td class="num muted">…</td><td></td>';
  if (!median || !r.price) return `<td class="num muted" title="${esc(i18n.noMarket)}">—</td><td></td>`;
  const p = Math.round(((r.price - median) / median) * 100);
  const cls = p >= 20 ? 'high' : p <= -20 ? 'low' : 'even';
  const tip = p >= 5 ? fill(i18n.diffHigh, { p }) : p <= -5 ? fill(i18n.diffLow, { p: -p }) : i18n.diffEven;
  return `<td class="num" title="${esc(i18n.marketTip)}">${nf.format(median)}</td><td><span class="diff diff-${cls}" title="${esc(tip)}">${p > 0 ? '+' : ''}${p}%</span></td>`;
}

// When each line was last read on screen: "방금" or "N분 전", refreshed every 15 seconds (owner 2026-11-18).
const readAgo = (at) => {
  if (!at) return '';
  const m = Math.floor((Date.now() - at) / 60000);
  return i18n.lang === 'ko' ? (m < 1 ? '방금 인식' : m < 60 ? `${m}분 전 인식` : `${Math.floor(m / 60)}시간 전 인식`) : (m < 1 ? 'read just now' : m < 60 ? `read ${m} min ago` : `read ${Math.floor(m / 60)} h ago`);
};
setInterval(() => document.querySelectorAll('.scan-ago[data-at]').forEach((el) => { el.textContent = readAgo(Number(el.dataset.at)); }), 15000);
function render(r, tr) {
  wantMedian(r.item?.id);
  const title = r.item ? (i18n.lang === 'ko' ? r.item.ko || r.item.en : r.item.en) : r.name || i18n.unreadable;
  const sub = r.item && title !== r.item.en ? `<small>${esc(r.item.en)}</small>` : '';
  const icon = r.item ? `<img src="https://maplestory.io/api/MCW/1/item/${r.item.id}/icon" alt="" width="28" height="28">` : '';
  tr.classList.toggle('sold', r.sold);
  tr.innerHTML = `<td><span class="item">${icon}<span>${esc(title)}${sub}</span></span></td>
<td class="price">${r.price ? `${nf.format(r.price)} <small>${i18n.each}</small>${r.qty > 1 ? `<small class="bundle">${fill(i18n.bundle, { n: nf.format(r.qty), total: nf.format(r.price * r.qty) })}</small>` : ''}` : '?'}</td>
${marketCells(r)}
<td class="seller">${esc(r.owner.replace(/\?/g, '·')) || '—'}</td>
<td>${where(r.channel, r.room).map((w) => `<span class="where">${w}</span>`).join(' ') || '—'}</td>
<td>${r.sold ? i18n.sold : i18n.selling}</td>
<td><span class="badge ${r.sure ? 'ok' : 'check'}">${r.edited || r.fixed ? i18n.edited : r.sure ? i18n.ok : i18n.check}</span><small class="scan-ago" data-at="${r.at || ''}">${readAgo(r.at)}</small></td>
<td class="row-actions"><button type="button" class="edit-btn" aria-label="${esc(i18n.edit)}" title="${esc(i18n.edit)}">✎</button><button type="button" class="del-btn" aria-label="${esc(i18n.remove)}" title="${esc(i18n.remove)}">✕</button></td>`;
  if (r.alternatives && !r.sure) {
    const pick = document.createElement('select');
    pick.className = 'alt-pick';
    pick.setAttribute('aria-label', i18n.pickItem);
    pick.innerHTML = `<option value="">${esc(i18n.pickItem)}</option>` + r.alternatives.map((it) => `<option value="${it.id}">${esc(itemName(it))}</option>`).join('');
    pick.addEventListener('change', () => { if (pick.value) applyEdit(r, tr, { item: r.alternatives.find((it) => it.id === Number(pick.value)) }); });
    tr.querySelector('td .item > span').appendChild(pick);
  }
}

const itemName = (it) => (i18n.lang === 'ko' ? it.ko || it.en : it.en);

// ---------- inline edit ----------
// Any recognised line can be corrected in place. A line already sent is corrected on the server too (only by the browser
// that sent it). Corrections are kept even when the same screen is scanned again.
const priceText = (t) => {
  const v = t.replace(/[,\s]|메소|mesos?/gi, '').toLowerCase();
  const m = v.match(/^(\d+(?:\.\d+)?)(억|만|b|m|k)?$/);
  if (!m) return null;
  const mult = { 억: 1e8, 만: 1e4, b: 1e9, m: 1e6, k: 1e3 }[m[2]] || 1;
  const n = Math.round(parseFloat(m[1]) * mult);
  return n >= 1 && n <= 1e10 ? n : null;
};

let namesList = null;
function itemsDatalist() {
  if (namesList) return namesList;
  namesList = document.createElement('datalist');
  namesList.id = 'scan-item-names';
  namesList.innerHTML = items.map((it) => `<option value="${esc(itemName(it))}"></option>`).join('');
  document.body.appendChild(namesList);
  return namesList;
}

function openEditor(r, tr) {
  itemsDatalist();
  tr.classList.add('editing');
  tr.innerHTML = `<td colspan="9"><form class="row-edit">
<label>${i18n.colItem}<input name="item" list="scan-item-names" value="${esc(r.item ? itemName(r.item) : r.name)}" autocomplete="off"></label>
<label>${i18n.colPrice} (${i18n.each})<input name="price" value="${r.price || ''}" inputmode="decimal"></label>
<label>${i18n.qty}<input name="qty" type="number" min="1" max="10000" value="${r.qty || 1}"></label>
<label>${i18n.colSeller}<input name="seller" value="${esc(r.owner)}" maxlength="13" autocomplete="off"></label>
<label>${i18n.channelLabel}<select name="channel">${locationOptions(r.channel, 'CH')}</select></label>
<label>${i18n.roomLabel}<select name="room">${locationOptions(r.room, 'FM')}</select></label>
<label class="check-line"><input name="sold" type="checkbox"${r.sold ? ' checked' : ''}> ${i18n.sold}</label>
<button class="btn small-btn" type="submit">${i18n.save}</button><button class="btn ghost small-btn" type="button" data-cancel>${i18n.cancel}</button>
<p class="edit-msg" aria-live="polite"></p></form></td>`;
  const form = tr.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', () => {
    tr.classList.remove('editing');
    render(r, tr);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.item.value.trim();
    const item = items.find((it) => itemName(it) === name || it.en === name || it.ko === name);
    const price = priceText(form.price.value);
    const seller = form.seller.value.trim();
    const qty = Number(form.qty.value);
    const channel = Number(form.channel.value);
    const room = Number(form.room.value);
    if (!validListing({ item, price, qty, owner: seller, channel, room })) {
      form.querySelector('.edit-msg').textContent = i18n.editInvalid;
      return;
    }
    tr.classList.remove('editing');
    applyEdit(r, tr, { item, price, qty, sold: form.sold.checked, owner: seller, channel, room });
  });
  form.item.focus();
}

const locationOptions = (value, prefix) => `<option value="">${i18n.chooseLocation}</option>` + Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}"${value === i + 1 ? ' selected' : ''}>${prefix} ${i + 1}</option>`).join('') +
  (prefix === 'FM' ? `<option value="${KERNING}"${value === KERNING ? ' selected' : ''}>${placeLabel(KERNING, i18n.lang === 'ko')}</option>` : '');

function applyEdit(r, tr, change) {
  if (sending) { check('upload', 'warn', i18n.sending); render(r, tr); return; }
  const oldKey = listingKey(r);
  const before = payload(r);
  const wasSent = sent.has(oldKey);
  const next = { ...r, ...change };
  const from = r.fixFrom || fixSig(r);
  if (listingKey(next) !== oldKey && listings.has(listingKey(next))) {
    check('upload', 'warn', i18n.duplicateEdit);
    render(r, tr);
    return;
  }
  Object.assign(r, change, { alternatives: null, edited: true });
  r.fixFrom = from;
  if (r.item) rememberFix(from, r);
  r.sure = validListing(r);
  if (wasSent) r.pendingCorrection ||= before;
  const entry = listings.get(oldKey);
  listings.delete(oldKey);
  listings.set(listingKey(r), entry);
  if (oldKey !== listingKey(r)) correctedKeys.add(oldKey);
  sent.delete(oldKey);
  render(r, tr);
  updateSummary();
  retryAt = 0;
  track('scan_edit', { item_id: r.item?.id });
  upload();
}

// After an upload, the seller's own shop page (assets/shop-page.js) is one click away: "my character name" first, else the
// seller of what was just sent (owner 2026-11-19: 내 상점 페이지).
function showMyShop(sellers) {
  const box = document.getElementById('scan-myshop');
  const name = me() || sellers.find((s) => SELLER.test(s || ''));
  if (!box || !name || box.dataset.name === name) return;
  box.dataset.name = name;
  const ko = i18n.lang === 'ko';
  const url = `${location.origin}/s/${encodeURIComponent(name)}${ko ? '' : '?lang=en'}`;
  box.innerHTML = `🛒 ${ko ? `<b>${esc(name)}</b>의 상점 페이지가 생겼어요. 링크를 디스코드나 커뮤니티에 붙여 보세요.` : `<b>${esc(name)}</b>'s shop page is ready. Paste the link in Discord or forums.`} <a class="btn small-btn" href="${esc(url)}" target="_blank" rel="noopener" data-myshop="open">${ko ? '상점 페이지 열기' : 'Open shop page'}</a><button type="button" class="btn ghost small-btn" data-myshop="copy">${ko ? '링크 복사' : 'Copy link'}</button>`;
  box.hidden = false;
  box.querySelector('[data-myshop="copy"]').addEventListener('click', async (e) => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (x) {}
    e.target.textContent = ok ? (ko ? '✓ 복사했어요' : '✓ Copied') : (ko ? '복사 실패' : 'Copy failed');
    track('shop_link_copy', { what: 'scan', result: ok ? 'ok' : 'fail' });
  });
  box.querySelector('[data-myshop="open"]').addEventListener('click', () => track('shop_page_open', { from: 'scan' }));
}

function updateSummary() {
  const all = [...listings.values()];
  $('scan-summary').textContent = fill(i18n.summary, { shops: new Set(all.map((e) => e.r.shop.id)).size,
    items: all.length, check: all.filter((e) => !canUpload(e.r)).length });
}

function show(found) {
  if (!found.length) { currentShop = null; upload(); return; }
  // Rows on screen but none read for sure for a minute: the lines stay "확인 필요" and nothing can upload.
  if (found.some((r) => r.sure)) firstSureAt ||= Date.now();
  else if (!firstSureAt && Date.now() - scanStartedAt > 60000) issue('unsure_rows', { rows: found.length, named: found.filter((r) => r.item).length, priced: found.filter((r) => r.price).length, seller: SELLER.test(found[0]?.owner || '') ? 1 : 0 });
  results.querySelector('.empty')?.remove();
  results.querySelectorAll('tr.fresh').forEach((tr) => tr.classList.remove('fresh'));
  const shop = shopFor(found);
  const name = leader(shop)[0];
  found.forEach((r) => {
    r.shop = shop;
    r.owner = name;
    r.channel = shop.channel;
  });
  // Prepending in reverse keeps the rows in the same order as on screen.
  for (const r of [...found].reverse()) {
    applyKnownFix(r);
    // The same goods in the same place are one row even when they were first read under another shop record.
    const sig = rowSig(r), seenKey = sigKeys.get(sig);
    if (removedSigs.has(sig) || (seenKey && seenKey !== listingKey(r) && listings.has(seenKey))) continue;
    const key = listingKey(r);
    sigKeys.set(sig, key);
    if (correctedKeys.has(key) || removedKeys.has(key)) continue;
    let entry = listings.get(key);
    if (!entry) {
      entry = { tr: document.createElement('tr') };
      listings.set(key, entry);
    }
    if (entry.r?.edited || entry.tr.classList.contains('editing')) {
      // A corrected row is not redrawn, but it was just seen again.
      entry.r.at = Date.now();
      const ago = entry.tr.querySelector('.scan-ago');
      if (ago) { ago.dataset.at = entry.r.at; ago.textContent = readAgo(entry.r.at); }
      continue;
    }
    r.at = Date.now();
    r.confirmations = entry.r?.sure && r.sure && fingerprint(entry.r) === fingerprint(r) ? (entry.r.confirmations || 1) + 1 : 1;
    entry.r = r;
    entry.tr.classList.add('fresh');
    render(r, entry.tr);
    results.prepend(entry.tr);
  }
  // The shop's name may have changed with this frame's vote; earlier rows of the same shop follow it.
  for (const e of listings.values())
    if (e.r.shop === shop && !e.r.edited && !sent.has(listingKey(e.r)) && e.r.owner !== name) {
      e.r.owner = name;
      render(e.r, e.tr);
    }
  const readNow = found.filter((r) => r.item).length;
  const skipNow = found.length - readNow;
  const seller = name || '—';
  check('shop', 'ok', fill(skipNow ? i18n.shopPartial : i18n.shopOk, { seller, n: readNow, skip: skipNow }));
  upload();
  updateSummary();
}

// Removing a misread row: it leaves the list, is never sent, and if it was already sent the stored copy is withdrawn
// (only rows this browser's own connection reported; worker /listings/remove).
async function removeRow(entry) {
  const key = listingKey(entry.r);
  const wasSent = sent.has(key) && validListing(entry.r);
  removedKeys.add(key);
  removedSigs.add(rowSig(entry.r));
  listings.delete(key);
  entry.tr.remove();
  updateSummary();
  track('scan_remove', { item_id: entry.r.item?.id, sent: wasSent });
  if (!wasSent || !i18n.api) return;
  try {
    const res = await fetch(`${i18n.api}/listings/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listing: payload(entry.r) }) });
    if (res.ok) { sent.delete(key); uploaded = Math.max(0, uploaded - 1); check('upload', 'ok', fill(i18n.uploadOk, { n: uploaded })); }
    else say(i18n.removeFail);
  } catch { say(i18n.removeFail); }
}
results.addEventListener('click', (e) => {
  const del = e.target.closest('.del-btn');
  if (del) {
    const entry = [...listings.values()].find((x) => x.tr === del.closest('tr'));
    if (entry && !sending) removeRow(entry);
    return;
  }
  const btn = e.target.closest('.edit-btn');
  if (!btn) return;
  const tr = btn.closest('tr');
  const entry = [...listings.values()].find((x) => x.tr === tr);
  if (entry && !sending) openEditor(entry.r, tr);
});

// A change is only read once the screen has stopped changing: the shop list scrolls smoothly, and a frame caught mid-scroll
// has every row a pixel or two off, which turns letters into nonsense.
let settling = true;
// OCR can take a few seconds per shop, so a frame is only read when the previous one is done.
let reading = false;
let lastRead = 0;
async function tick() {
  if (!stream || !dataReady || !video.videoWidth || reading) return;
  // A shop left open without changes still needs its settle time to pass before uploading.
  upload();
  const sig = signature();
  // A screen that never holds still (a busy Free Market, or "entire screen" shared with animated pages on it) used to
  // block every read: the scan stayed at "waiting" forever (Clarity, 2026-11-21: 13 of 22 starters never got a row).
  // Now a read happens at least every 5 seconds even while the picture keeps changing.
  const moving = changed(lastSig, sig);
  if (moving) settling = true;
  if ((!moving && (settling || Date.now() - lastRead > 3000)) || (moving && Date.now() - lastRead > FORCE_READ_MS)) {
    const saveSample = settling;
    settling = false;
    frames++;
    reading = true;
    try {
      const revision = locationRevision;
      const session = sessionRevision;
      const canvas = grab();
      showShare();
      if (saveSample) keepSample(canvas);
      const found = await recognize(canvas);
      if (revision !== locationRevision || session !== sessionRevision) return;
      show(found);
      say(fill(i18n.watching, { n: frames }));
    } catch (e) {
      console.error('[scan]', e);
      check('shop', 'warn', ocrWorker ? i18n.ocrFail : i18n.readFail);
      issue('read_error', { ocr: ocrWorker ? 1 : 0, msg: String(e?.message || e).slice(0, 80) });
    }
    finally { reading = false; lastRead = Date.now(); }
  }
  lastSig = sig;
}

function showShare() {
  const size = { w: video.videoWidth, h: video.videoHeight, k: +scale.toFixed(2) };
  check('share', 'ok', fill(scale === 1 ? i18n.shareOn : i18n.shareRetina, size));
}

async function start() {
  if (!dataReady || stream || reading) return;
  $('scan-start').disabled = true;
  sessionRevision++;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
  } catch (e) {
    say(i18n.denied);
    $('scan-start').disabled = false;
    track('scan_share_cancel', { reason: e?.name || 'error' });
    return;
  }
  scanStartedAt = Date.now(); everRows = 0; firstSureAt = 0; missLoc = 0; issued.clear(); lastRead = 0;
  video.srcObject = stream;
  try { await video.play(); } catch { issue('video_play'); stop(); say(i18n.readFail); return; }
  document.body.classList.add('scanning');
  $('scan-stop').disabled = false;
  stream.getVideoTracks()[0].addEventListener('ended', stop);
  showShare();
  say(fill(i18n.watching, { n: frames }));
  timer = setInterval(tick, TICK_MS);
  track('scan_start', { width: video.videoWidth, height: video.videoHeight, ui_value: `${video.videoWidth}x${video.videoHeight}@${(window.devicePixelRatio || 1).toFixed(2)}` });
}

// Reloading or closing the page loses the read list and stops the screen share, so the browser asks first
// (owner 2026-11-18: an accidental refresh).
globalThis.addEventListener?.('beforeunload', (e) => {
  if (!stream && !listings.size) return;
  e.preventDefault();
  e.returnValue = '';
});
function stop() {
  clearInterval(timer);
  timer = null;
  sessionRevision++;
  currentShop = null;
  upload();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  lastSig = null;
  document.body.classList.remove('scanning');
  $('scan-stop').disabled = true;
  $('scan-start').disabled = !dataReady;
  // The last channel and room stay for the next share (a manual choice still wins).
  channel = Number($('scan-channel').value) || channel;
  room = Number($('scan-room').value) || room;
  settling = true;
  ['share', 'shop'].forEach((k) => check(k, 'wait', i18n.wait));
  locationStatus();
  say(fill(i18n.stopped, { n: frames }));
  track('scan_stop', { frames, rows: listings.size, uploaded, minutes: scanStartedAt ? Math.round((Date.now() - scanStartedAt) / 60000) : 0, issues: [...issued].join(',') || 'none', ui_label: [...issued].join(',') || 'none', ui_value: `frames ${frames} rows ${listings.size} up ${uploaded}` });
}

$('scan-start').addEventListener('click', start);
$('scan-stop').addEventListener('click', stop);

if (!navigator.mediaDevices?.getDisplayMedia) {
  $('scan-start').disabled = true;
  say(i18n.unsupported);
  // Say it before the steps, where phone visitors actually look, and let them carry the link to a computer.
  const note = $('scan-device-note');
  if (note) {
    note.hidden = false;
    $('scan-copy-link').addEventListener('click', async () => {
      const ok = await copyText(location.href.split('#')[0]);
      $('scan-copy-status').textContent = ok ? (document.documentElement.lang === 'ko' ? '복사했어요' : tx('Copied')) : location.href;
    });
  }
}

loadData();
