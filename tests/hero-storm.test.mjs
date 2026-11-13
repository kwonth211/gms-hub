import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/hero-storm.js', import.meta.url), 'utf8').replace('export function mountHeroStorm', 'function mountHeroStorm');
function setup({ reduced = false, mobile = false, cores = 8, cost = 1 } = {}) {
  const raf = new Map(), timers = new Map(), observers = {}, media = {}, documentEvents = {}, windowEvents = {};
  let id = 0, clock = 0, canvas;
  const noop = () => {};
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) }, {
    get: (obj, key) => key in obj ? obj[key] : noop,
  });
  const card = { getBoundingClientRect: () => ({ right: 650 }) };
  const hero = { querySelector: s => s === '.hero-card' ? card : null, insertBefore: el => { canvas = el; },
    getBoundingClientRect: () => ({ left: 0, width: mobile ? 390 : 1280, height: 500 }) };
  const html = { dataset: {} };
  const doc = { hidden: false, documentElement: html, querySelector: () => null,
    createElement: () => ({ style: {}, dataset: {}, getContext: () => context, setAttribute: noop, remove: noop }),
    addEventListener: (key, fn) => { documentEvents[key] = fn; }, removeEventListener: (key) => { delete documentEvents[key]; } };
  const observer = name => class {
    constructor(fn) { observers[name] = fn; } observe() {} disconnect() { delete observers[name]; }
  };
  const env = vm.createContext({ document: doc, navigator: { hardwareConcurrency: cores }, location: { search: '?hero-perf' },
    URLSearchParams, devicePixelRatio: 3, performance: { now: () => { clock += cost; return clock; } },
    matchMedia: query => media[query] ||= { matches: query.includes('reduced') ? reduced : mobile,
      addEventListener: (_, fn) => { media[query].change = fn; }, removeEventListener: noop },
    requestAnimationFrame: fn => { raf.set(++id, fn); return id; }, cancelAnimationFrame: n => raf.delete(n),
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: n => timers.delete(n),
    ResizeObserver: observer('resize'), IntersectionObserver: observer('intersection'), MutationObserver: observer('settings'),
    window: { addEventListener: (key, fn) => { windowEvents[key] = fn; }, removeEventListener: key => { delete windowEvents[key]; } },
  });
  vm.runInContext(source, env);
  const dispose = env.mountHeroStorm(hero);
  const tick = () => { for (const [key, fn] of [...timers]) { timers.delete(key); fn(); }
    for (const [key, fn] of [...raf]) { raf.delete(key); fn(clock += 40); } };
  return { raf, timers, observers, media, doc, html, canvas, tick, dispose, windowEvents,
    visible: value => observers.intersection([{ isIntersecting: value }]),
    visibility: hidden => { doc.hidden = hidden; documentEvents.visibilitychange(); } };
}

test('banner pauses offscreen and in hidden tabs, but keeps playing with falling leaves off', () => {
  const s = setup();
  assert.equal(s.raf.size + s.timers.size, 0);
  s.visible(true); s.tick(); assert.equal(s.timers.size, 1);
  s.visible(false); assert.equal(s.raf.size + s.timers.size, 0); assert.equal(s.canvas.dataset.motion, 'offscreen');
  s.visible(true); s.visibility(true); assert.equal(s.raf.size + s.timers.size, 0);
  s.visibility(false); assert.equal(s.raf.size, 1);
  s.html.dataset.charm = 'off'; s.observers.settings?.();
  for (let i = 0; i < 30; i++) s.tick();
  assert.equal(s.timers.size, 1); assert.equal(s.canvas.dataset.motion, 'playing');
  assert.ok(JSON.parse(s.canvas.dataset.performance).frames > 1);
  delete s.html.dataset.charm; s.observers.settings?.(); s.tick(); assert.equal(s.timers.size, 1);
  s.dispose(); assert.equal(s.raf.size + s.timers.size, 0); assert.equal(Object.keys(s.observers).length, 0);
});

test('reduced motion and phones render a still crest without a timer or frame loop', () => {
  for (const option of [{ reduced: true }, { mobile: true }]) {
    const s = setup(option); s.visible(true);
    assert.equal(s.canvas.dataset.motion, 'static'); assert.equal(s.raf.size + s.timers.size, 0);
    s.dispose();
  }
});

test('turning reduced motion on while running cancels pending work', () => {
  const s = setup(); s.visible(true); s.tick();
  const setting = s.media['(prefers-reduced-motion: reduce)']; setting.matches = true; setting.change();
  assert.equal(s.raf.size + s.timers.size, 0); assert.equal(s.canvas.dataset.motion, 'static');
});

test('canvas resolution and low-core particle count are capped independently of device pixel ratio', () => {
  for (const cores of [4, 8]) {
    const s = setup({ cores }); s.visible(true);
    const p = JSON.parse(s.canvas.dataset.performance);
    assert.ok(p.backingWidth <= 840 && p.backingHeight <= 720);
    assert.equal(p.particles, cores === 4 ? 72 : 144);
    assert.equal(p.fpsCap, cores === 4 ? 24 : 30);
  }
});

test('sustained costly frames degrade quality, then stop the animation', () => {
  const s = setup({ cost: 10 }); s.visible(true);
  for (let i = 0; i < 40; i++) s.tick();
  assert.equal(s.canvas.dataset.motion, 'static'); assert.equal(s.raf.size + s.timers.size, 0);
  assert.equal(JSON.parse(s.canvas.dataset.performance).particles, 72);
});

test('back-forward cache departure cancels work and return schedules a fresh layout', () => {
  const s = setup(); s.visible(true); s.tick(); s.windowEvents.pagehide();
  assert.equal(s.raf.size + s.timers.size, 0);
  s.windowEvents.pageshow(); s.tick(); assert.equal(s.raf.size, 1);
});
