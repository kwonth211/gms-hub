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
  const heroEvents = {}, children = [];
  const hero = { querySelector: s => s === '.hero-card' ? card : null, insertBefore: el => { canvas = el; },
    append: (...els) => children.push(...els), addEventListener: (name, fn) => { heroEvents[name] = fn; }, removeEventListener: name => { delete heroEvents[name]; },
    getBoundingClientRect: () => ({ left: 0, top: 100, width: mobile ? 390 : 1280, height: 500 }) };
  const html = { dataset: {} };
  const doc = { hidden: false, documentElement: html, querySelector: () => null,
    createElement: () => {
      const events = {}, attributes = {};
      const el = { style: {}, dataset: {}, events, attributes, children: [], getContext: () => context,
        append: (...els) => el.children.push(...els), setAttribute: (key, value) => { attributes[key] = value; }, remove: () => { el.removed = true; },
        addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener: name => { delete events[name]; }, focus: () => { doc.activeElement = el; } };
      return el;
    },
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
    window: { scrollX: 0, scrollY: 0, addEventListener: (key, fn) => { windowEvents[key] = fn; }, removeEventListener: key => { delete windowEvents[key]; } },
  });
  vm.runInContext(source, env);
  const dispose = env.mountHeroStorm(hero);
  const tick = () => { for (const [key, fn] of [...timers]) { timers.delete(key); fn(); }
    for (const [key, fn] of [...raf]) { raf.delete(key); fn(clock += 40); } };
  return { raf, timers, observers, media, doc, html, canvas, tick, dispose, windowEvents, heroEvents, children, window: env.window,
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

test('five leaves complete one round, retain keyboard focus and can restart without extra loops', () => {
  const s = setup(); s.visible(true); s.tick();
  const [play, target] = s.children, [status, toggle] = play.children;
  assert.equal(target.hidden, true);
  toggle.events.click(); assert.equal(target.hidden, false);
  const positions = [];
  s.doc.activeElement = target;
  for (let i = 0; i < 5; i++) {
    positions.push(target.style.left + target.style.top);
    target.events.click();
    assert.equal(play.dataset.score, String(i + 1));
  }
  assert.equal(new Set(positions).size, 5);
  assert.equal(target.hidden, true); assert.equal(s.doc.activeElement, toggle);
  assert.match(status.textContent, /All 5/);
  target.events.click(); assert.equal(play.dataset.score, '5');
  assert.equal(s.raf.size + s.timers.size, 1);
  toggle.events.click(); assert.equal(play.dataset.score, '0'); assert.equal(target.hidden, false);
  toggle.events.click(); assert.equal(target.hidden, true);
  s.dispose(); assert.equal(Object.keys(s.heroEvents).length, 0); assert.ok(s.children.every(e => e.removed));
});

test('pointer bursts stay bounded and hidden/reduced-motion views cannot collect', () => {
  for (const cores of [4, 8]) {
    const s = setup({ cores }); s.visible(true);
    const [play, target] = s.children, toggle = play.children[1]; toggle.events.click();
    for (let i = 0; i < 100; i++) {
      s.heroEvents.pointermove({ pointerType: 'mouse', clientX: 800 + i % 50, clientY: 260, target: { closest: () => null } });
      if (i % 6 === 0) { target.events.pointerenter(); if (target.hidden) toggle.events.click(); }
      s.tick();
    }
    const p = JSON.parse(s.canvas.dataset.performance);
    assert.ok(p.interactionParticles <= (cores === 4 ? 24 : 48));
    s.visibility(true); const before = play.dataset.score; target.events.click();
    assert.equal(play.dataset.score, before); assert.equal(play.hidden, true);
    assert.equal(s.raf.size + s.timers.size, 0);
    s.visibility(false);
    const reduced = s.media['(prefers-reduced-motion: reduce)']; reduced.matches = true; reduced.change();
    assert.equal(play.hidden, true); assert.equal(target.hidden, true);
    assert.equal(JSON.parse(s.canvas.dataset.performance).interactionParticles, 0);
    s.dispose();
  }
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
