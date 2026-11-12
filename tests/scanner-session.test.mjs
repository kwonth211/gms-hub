import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as reader from '../assets/shop-reader.js';
import * as state from '../assets/scan-state.js';
import * as place from '../assets/place.js';

// No browser permissions or live writes: exercise the actual scanner session with a tiny DOM and a fake transport.
class Element {
  value = ''; textContent = ''; innerHTML = ''; hidden = false; disabled = false; dataset = {}; listeners = {}; children = [];
  constructor() {
    const classes = new Set();
    this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) };
  }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  appendChild(e) { this.children.push(e); }
  prepend(e) { if (!this.children.includes(e)) this.children.unshift(e); }
  remove() {}
  setAttribute() {}
}
const flush = () => new Promise((r) => setImmediate(r));
async function session() {
  const els = new Map();
  const get = (id) => { if (!els.has(id)) els.set(id, new Element()); return els.get(id); };
  get('i18n').textContent = JSON.stringify({ lang: 'en', api: '/api', itemsUrl: '/items', glyphsUrl: '/glyphs', summary: '{items}', stopped: '{n}', uploadOk: '{n}', uploadNeed: 'pending', uploadFail: 'failed', roomOk: '{room}', channelOk: '{ch}', shopOk: '{n}', shopPartial: '{n}' });
  const requests = [];
  const control = { accept: true, failFix: false };
  const sandbox = { ...place, ...reader, ...state, Intl, console, setInterval: () => 0, clearInterval() {}, queueMicrotask, Uint8Array, Date,
    location: { hostname: 'test.invalid' }, window: { devicePixelRatio: 1 }, navigator: { mediaDevices: { getDisplayMedia() {} } }, track() {},
    document: { getElementById: get, createElement: () => new Element(), body: new Element() },
    fetch: async (url, options) => {
      if (url === '/items') return { ok: true, json: async () => [[4000000, '', 'Test item']] };
      if (url === '/glyphs') return { ok: true, json: async () => ({ glyphs: {}, map: {} }) };
      const body = JSON.parse(options.body); requests.push({ url, body });
      return { ok: url.endsWith('/fix') ? !control.failFix : control.accept,
        json: async () => url.endsWith('/fix') ? { fixed: control.failFix ? 0 : 1 } : { stored: control.accept ? body.items.length : 0 } };
    }
  };
  const code = fs.readFileSync(new URL('../assets/scan.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInNewContext(code + '\nthis.api = { show, applyEdit, upload, listings, sent, stop, setLocation: (ch, fm) => { channel = ch; room = fm; } };', sandbox);
  await flush();
  sandbox.api.setLocation(20, 3);
  return { ...sandbox.api, requests, control, get };
}
const listing = (change = {}) => ({ item: { id: 4000000, en: 'Test item' }, name: 'Test item', price: 100, qty: 1, sold: false, owner: 'Seller', channel: 20, room: 3, sure: true, alternatives: null, ...change });

test('a stationary shop is sent only after two reads and stopping does not promote a single read', async () => {
  const s = await session();
  s.show([listing()]); await flush(); assert.equal(s.requests.length, 0);
  s.stop(); await flush(); assert.equal(s.requests.length, 0);
  s.setLocation(20, 3);
  s.show([listing()]); await flush(); assert.equal(s.requests.length, 1);
  assert.equal(s.sent.size, 1);
  s.show([listing()]); await flush(); assert.equal(s.requests.length, 1);
});

test('failed uploads stay pending and retry acknowledges only persisted rows', async () => {
  const s = await session(); s.control.accept = false;
  s.show([listing()]); s.show([listing()]); await flush();
  assert.equal(s.sent.size, 0);
  assert.equal(s.get('scan-retry-upload').hidden, false);
  s.control.accept = true;
  s.get('scan-retry-upload').listeners.click(); await flush();
  assert.equal(s.sent.size, 1);
});

test('failed edits retry as corrections and rescanning cannot resurrect the mistaken original', async () => {
  const s = await session(); s.show([listing()]); s.show([listing()]); await flush();
  const e = [...s.listings.values()][0];
  s.control.failFix = true;
  s.applyEdit(e.r, e.tr, { price: 120 }); await flush();
  assert.ok(e.r.pendingCorrection);
  s.show([listing()]); await flush();
  assert.equal(s.listings.size, 1);
  s.control.failFix = false;
  s.get('scan-retry-upload').listeners.click(); await flush();
  assert.equal(e.r.pendingCorrection, undefined);
  assert.equal(s.requests.filter((r) => r.url === '/api/listings').length, 1);
  assert.equal(s.requests.filter((r) => r.url.endsWith('/fix')).length, 2);
});

test('manual location changes never relabel previously captured listings', async () => {
  const s = await session(); s.show([listing({ room: null })]);
  s.get('scan-channel').value = '21'; s.get('scan-room').value = '4';
  s.get('scan-room').listeners.change();
  assert.equal([...s.listings.values()][0].r.room, null);
  s.show([listing({ channel: 21, room: 4 })]);
  assert.equal(s.listings.size, 2);
});
