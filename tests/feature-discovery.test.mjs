import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDiscovery } from '../assets/feature-discovery.js';

function setup({ observers = true, blocked = false } = {}) {
  let intersect, mutate, click;
  const events = [], watched = new Set();
  const control = (feature, id = '') => ({ nodeType: 1, dataset: { discover: feature, discoverPlace: 'test', discoverId: id },
    matches: () => true, querySelectorAll: () => [], closest() { return this; } });
  const item = control('wishlist_cta', '1332016');
  const document = { visibilityState: 'visible', body: { nodeType: 1, dataset: { page: 'market' }, matches: () => false, querySelectorAll: () => [item] },
    addEventListener: (_, fn) => { click = fn; }, removeEventListener: () => { click = null; } };
  class IO { constructor(fn) { intersect = fn; } observe(el) { watched.add(el); } unobserve(el) { watched.delete(el); } disconnect() { watched.clear(); } }
  class MO { constructor(fn) { mutate = fn; } observe() {} disconnect() {} }
  const stop = mountDiscovery({ document, IntersectionObserver: observers ? IO : undefined, MutationObserver: observers ? MO : undefined,
    track: (...args) => { if (blocked) throw Error('blocked'); events.push(args); } });
  return { events, watched, control, document, item, stop, click: (el) => click?.({ target: el }),
    view: (el, ratio = 1) => intersect([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]),
    add: (el) => mutate([{ addedNodes: [el], removedNodes: [] }]), remove: (el) => mutate([{ addedNodes: [], removedNodes: [el] }]) };
}

test('views require visible controls, deduplicate re-renders, and separate distinct items', () => {
  const s = setup();
  s.view(s.item, 0); s.view(s.item, 0.49);
  s.document.visibilityState = 'hidden'; s.view(s.item);
  assert.equal(s.events.length, 0);
  s.document.visibilityState = 'visible'; s.view(s.item, 0.5);
  assert.deepEqual(s.events[0], ['wishlist_cta_view', { placement: 'test', content_id: '1332016', page_type: 'market' }]);
  const redraw = s.control('wishlist_cta', '1332016'); s.add(redraw); s.view(redraw);
  assert.equal(s.events.length, 1);
  const other = s.control('wishlist_cta', '2040801'); s.add(other); s.view(other);
  assert.equal(s.events.length, 2);
  s.remove(redraw); assert.ok(!s.watched.has(redraw));
  s.stop(); assert.equal(s.watched.size, 0);
});

test('clicks remain available without observers and blocked telemetry never breaks navigation', () => {
  const s = setup({ observers: false });
  s.click(s.item); s.click(s.item);
  assert.equal(s.events.length, 2);
  assert.equal(s.events[0][0], 'wishlist_cta_click');
  s.item.disabled = true; s.click(s.item); assert.equal(s.events.length, 2);
  const blocked = setup({ blocked: true });
  assert.doesNotThrow(() => { blocked.click(blocked.item); blocked.view(blocked.item); });
  const bad = s.control('invalid event / user text'); s.click(bad); assert.equal(s.events.length, 2);
});
