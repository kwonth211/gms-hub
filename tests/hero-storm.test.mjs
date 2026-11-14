import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/hero-storm.js', import.meta.url), 'utf8').replace('export function mountHeroStorm', 'function mountHeroStorm');
function setup({ reduced = false, mobile = false, cores = 8, cost = 1, withProps = false } = {}) {
  const raf = new Map(), timers = new Map(), observers = {}, media = {}, documentEvents = {}, windowEvents = {};
  let id = 0, clock = 0, canvas;
  const noop = () => {};
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) }, {
    get: (obj, key) => key in obj ? obj[key] : noop,
  });
  const card = { getBoundingClientRect: () => ({ right: 650 }) };
  const heroEvents = {}, children = [];
  const propNodes = withProps ? ['mushroom', 'slime', 'coin', 'coin'].map((kind, index) => {
    const animations = [];
    const art = { dataset: {}, animate: (frames, options) => {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation); return animation;
    } };
    return { dataset: { heroProp: kind }, art, animations, querySelector: () => art,
      getBoundingClientRect: () => ({ left: index === 3 ? 200 : 750 + index * 100, top: 400, width: 48, height: 52 }) };
  }) : [];
  const hero = { querySelectorAll: () => propNodes, querySelector: s => s === '.hero-card' ? card : null, insertBefore: el => { canvas = el; },
    append: (...els) => children.push(...els), addEventListener: (name, fn) => { heroEvents[name] = fn; }, removeEventListener: name => { delete heroEvents[name]; },
    getBoundingClientRect: () => ({ left: 0, top: 100, width: mobile ? 390 : 1280, height: 500 }) };
  const html = { dataset: {} };
  const doc = { hidden: false, documentElement: html, querySelector: () => null,
    createElement: () => {
      const events = {}, attributes = {}; let captured = null;
      const el = { style: {}, dataset: {}, events, attributes, children: [], getContext: () => context,
        getBoundingClientRect: () => ({ left: 679, top: 110 }),
        setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id, releasePointerCapture: () => { captured = null; },
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
  return { raf, timers, observers, media, doc, html, canvas, tick, dispose, windowEvents, heroEvents, children, propNodes, window: env.window,
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

const mouse = (x = 280, y = 200, buttons = 1) => ({ pointerId: 7, pointerType: 'mouse', button: 0, buttons,
  clientX: 679 + x, clientY: 110 + y });
const run = (s, n) => { for (let i = 0; i < n; i++) s.tick(); };

test('holding gathers existing leaves, release scatters, with one capped loop and no game controls', () => {
  for (const cores of [4, 8]) {
    const s = setup({ cores }); s.visible(true); run(s, 5);
    assert.equal(s.children.length, 1); assert.equal(s.children[0].className, 'hero-toy-hint');
    s.canvas.events.pointerdown(mouse()); run(s, 85);
    const held = JSON.parse(s.canvas.dataset.performance);
    assert.equal(held.interaction, 'gathering'); assert.ok(held.spreadPx < 30, JSON.stringify(held));
    assert.equal(s.canvas.attributes['aria-pressed'], 'true');
    s.windowEvents.pointerup(mouse()); run(s, 20);
    const released = JSON.parse(s.canvas.dataset.performance);
    assert.equal(released.interaction, 'scattering'); assert.ok(released.spreadPx > held.spreadPx * 2, JSON.stringify(released));
    assert.equal(released.particles, cores === 4 ? 72 : 144);
    assert.equal(s.raf.size + s.timers.size, 1); assert.equal(s.canvas.attributes['aria-pressed'], 'false');
    s.dispose(); assert.equal(Object.keys(s.canvas.events).length, 0); assert.equal(Object.keys(s.windowEvents).length, 0);
    assert.ok(s.children.every(e => e.removed));
  }
});

test('capture follows dragging, unrelated pointers cannot release, and interruptions cannot leave it held', () => {
  const s = setup(); s.visible(true); s.tick();
  s.canvas.events.pointerdown(mouse());
  s.canvas.events.pointermove(mouse(100, 140)); run(s, 90);
  assert.ok(JSON.parse(s.canvas.dataset.performance).spreadPx < 30);
  s.windowEvents.pointerup({ ...mouse(), pointerId: 9 }); assert.equal(s.canvas.attributes['aria-pressed'], 'true');
  s.windowEvents.pointercancel(); assert.equal(s.canvas.attributes['aria-pressed'], 'false');
  s.canvas.events.pointerdown(mouse()); s.visibility(true);
  assert.equal(s.canvas.attributes['aria-pressed'], 'false'); assert.equal(s.raf.size + s.timers.size, 0);
  s.visibility(false); s.canvas.events.pointerdown(mouse()); s.windowEvents.blur();
  assert.equal(s.canvas.attributes['aria-pressed'], 'false');
  s.canvas.events.pointerdown(mouse()); s.canvas.events.lostpointercapture(mouse());
  assert.equal(s.canvas.attributes['aria-pressed'], 'false');
  s.canvas.events.pointerdown(mouse()); s.windowEvents.pagehide();
  assert.equal(s.canvas.attributes['aria-pressed'], 'false'); s.dispose();
});

test('keyboard hold/release works, while mobile, touch and reduced motion never activate the toy', () => {
  const s = setup(); s.visible(true); s.tick();
  let prevented = 0; const key = { key: ' ', preventDefault: () => prevented++ };
  s.canvas.events.keydown(key); run(s, 85); assert.ok(JSON.parse(s.canvas.dataset.performance).spreadPx < 30);
  s.canvas.events.keyup(key); assert.equal(s.canvas.attributes['aria-pressed'], 'false'); assert.equal(prevented, 2);
  s.canvas.events.pointerdown({ ...mouse(), pointerType: 'touch' }); assert.equal(s.canvas.attributes['aria-pressed'], 'false');
  s.dispose();
  for (const option of [{ mobile: true }, { reduced: true }]) {
    const disabled = setup(option); disabled.visible(true);
    disabled.canvas.events.pointerdown(mouse()); disabled.canvas.events.keydown(key);
    assert.equal(disabled.canvas.attributes['aria-pressed'], 'false'); assert.equal(disabled.canvas.tabIndex, -1);
    assert.equal(disabled.children[0].hidden, true); assert.equal(disabled.raf.size + disabled.timers.size, 0); disabled.dispose();
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


test('scene props keep hidden sprites unclickable, replace reactions on repeat clicks and cancel when paused', () => {
  const s = setup({ withProps: true }); s.visible(true); s.tick();
  const buttons = s.children.filter(e => e.className === 'hero-prop-hit');
  assert.deepEqual(buttons.map(b => b.hidden), [false, false, false, true]);
  for (let i = 0; i < 3; i++) {
    const node = s.propNodes[i], button = buttons[i];
    button.events.pointerenter(); assert.equal(node.art.dataset.reaction, 'hello');
    button.events.click(); assert.equal(node.animations[0].cancelled, true);
    assert.equal(node.art.dataset.reaction, i === 2 ? 'spin' : 'hop');
    button.events.click(); assert.equal(node.animations[1].cancelled, true);
    node.animations[2].onfinish(); assert.equal(node.art.dataset.reaction, undefined);
    button.events.click();
  }
  buttons[3].events.click(); assert.equal(s.propNodes[3].animations.length, 0);
  assert.equal(s.raf.size + s.timers.size, 1);
  s.visible(false);
  assert.ok(buttons.every(b => b.hidden)); assert.ok(s.propNodes.every(p => !p.art.dataset.reaction));
  assert.ok(s.propNodes.every(p => p.animations.every(a => a.cancelled)));
  s.visible(true); buttons[0].events.click(); s.windowEvents.pagehide();
  assert.equal(s.propNodes[0].art.dataset.reaction, undefined);
  s.dispose(); assert.ok(buttons.every(b => b.removed && Object.keys(b.events).length === 0));
});
