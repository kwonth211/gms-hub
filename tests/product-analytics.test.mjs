import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('a recovered or changed market query never emits an obsolete empty result', () => {
  const events = [], timers = new Map(); let tick = 0;
  const input = { value: 'missing' };
  const context = { view: 'items', category: 'all', D: { lang: 'ko' }, $: () => input,
    track: (name, params) => events.push({ name, ...params }),
    setTimeout: fn => { timers.set(++tick, fn); return tick; }, clearTimeout: id => timers.delete(id) };
  vm.createContext(context);
  const source = read('assets/market.js');
  vm.runInContext('let noResultTimer, lastNoResult="";\n' + source.slice(source.indexOf('let searchTimer ='), source.indexOf('function pager(')), context);
  const flush = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  context.noResults('missing'); input.value = 'Meba'; context.searched('Meba', 2); flush();
  assert.deepEqual(events.map(e => e.name), ['market_search']);
  assert.equal(events[0].results, 2);
  input.value = 'missing'; context.noResults('missing'); context.category = 'scroll'; flush();
  assert.equal(events.length, 1);
  context.noResults('missing'); input.value = ''; flush();
  assert.equal(events.length, 1);
  input.value = 'missing'; context.noResults('missing'); flush();
  assert.equal(events.at(-1).name, 'market_no_results');
  input.value = 'Sai'; context.searched('Sai', 3); context.view = 'listings'; flush();
  assert.equal(events.length, 2);
});

test('generic search telemetry ignores price and free-text fields with placeholders', () => {
  const handlers = {}, events = [], timers = new Map(); let tick = 0;
  const window = { gtag: (...args) => events.push(args) };
  vm.runInNewContext(read('assets/analytics.js'), {
    window, document: { body: { dataset: { page: 'market' } }, addEventListener: (name, fn) => handlers[name] = fn },
    setTimeout: fn => { timers.set(++tick, fn); return tick; }, clearTimeout: id => timers.delete(id),
  });
  const field = (type, id, value) => ({ type, id, value, tagName: 'INPUT', dataset: {},
    matches: selector => selector.includes('input[type=search]') ? type === 'search' || selector.includes('input[placeholder]') : false,
    closest: () => null, getAttribute: name => name === 'aria-label' ? id : null,
  });
  handlers.input({ target: field('text', 'price', '300만') });
  handlers.input({ target: field('text', 'message', 'private free text') });
  assert.equal(timers.size, 0);
  handlers.input({ target: field('search', 'mk-q', 'Meba') });
  for (const fn of timers.values()) fn();
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'ui_search');
  assert.equal(events[0][2].search_term, 'Meba');
});

function setup(overrides = {}) {
  const events = [], clarity = [];
  const window = { gtag: (...args) => events.push(JSON.parse(JSON.stringify(args))), clarity: (...args) => clarity.push(args), ...overrides };
  vm.runInNewContext(read('assets/analytics.js'), { window });
  return { window, events, clarity, track: window.track };
}

test('internal source is renamed without mutating input or changing external campaign tags', () => {
  const s = setup();
  const input = { source: 'list', result: 'ok', listings: 3, item_id: 2040801 };
  s.track('market_item', input);
  assert.equal(input.source, 'list');
  assert.deepEqual(s.events.map(e => e[1]), ['market_item', 'tool_use']);
  for (const e of s.events) {
    assert.equal(e[2].interaction_source, 'list');
    assert.equal(Object.hasOwn(e[2], 'source'), false);
  }
  assert.equal(s.events[1][2].tool, 'market');
  s.track('price_search', { source: 'chip', interaction_source: 'search' });
  assert.equal(s.events.at(-1)[2].interaction_source, 'search');
  // Product telemetry never issues a config/set command, so landing UTM/referrer attribution stays with GA.
  assert.ok(s.events.every(e => e[0] === 'event'));
});

test('only nonempty successful market/training actions qualify, with no invented monetary value', () => {
  const s = setup();
  for (const name of ['market_item', 'training_search']) {
    for (const result of ['empty', 'error', 'fail', undefined]) s.track(name, { result, results: 2, listings: 2 });
    for (const count of [undefined, 0, -1, NaN]) s.track(name, { result: 'ok', results: count, listings: count });
  }
  s.track('page_view', { result: 'ok', results: 2 });
  s.track('share_copy', { result: 'ok' });
  assert.equal(s.events.filter(e => e[1] === 'tool_use').length, 0);
  s.track('training_search', { result: 'ok', results: 2, interaction_source: 'form' });
  assert.deepEqual(s.events.at(-1), ['event', 'tool_use', { result: 'ok', results: 2, interaction_source: 'form', tool: 'training' }]);
  // Repeated legitimate actions stay in event counts; GA's once-per-session setting deduplicates key events.
  s.track('training_search', { result: 'ok', results: 2 });
  assert.equal(s.events.filter(e => e[1] === 'tool_use').length, 2);
});

test('blocked analytics tags cannot break the feature or the other analytics provider', () => {
  for (const overrides of [{ gtag: undefined, clarity: undefined }, { gtag: () => { throw Error('blocked'); } }]) {
    const s = setup(overrides);
    assert.doesNotThrow(() => s.track('market_item', { result: 'ok', listings: 1 }));
    if (overrides.gtag) assert.deepEqual(s.clarity.map(e => e[1]), ['market_item', 'tool_use']);
  }
});

test('training auto render/shared link does not convert; submit/change deduplicate and empty results do not qualify', () => {
  const s = setup(), handlers = {};
  const fields = { lv: { value: '20' }, advanced: { checked: false } };
  for (const key of ['job', 'goal', 'party']) fields[key] = { value: key === 'job' ? '' : key === 'goal' ? 'balanced' : 'any', options: [] };
  const form = { elements: fields, addEventListener: (name, fn) => handlers[name] = fn, reportValidity: () => true, checkValidity: () => true };
  const elements = { 'training-data': { textContent: '{"routes":[]}' }, 'tr-form': form, 'tr-result': { querySelector: () => null }, 'tr-status': {} };
  let rowCount = 2;
  vm.runInNewContext(read('assets/training.js').replace(/^import .*;\n/gm, ''), {
    document: { documentElement: { lang: 'ko' }, getElementById: id => elements[id] },
    location: { href: 'https://gms-hub.com/ko/tools/training/?lv=42&utm_source=share&utm_medium=link', pathname: '/ko/tools/training/', search: '?lv=42&utm_source=share&utm_medium=link', hash: '' },
    history: { replaceState: (_state, _title, url) => { assert.equal(url.searchParams.get('utm_source'), 'share'); } },
    URL, URLSearchParams, loadChar: () => null, selectRoutes: () => Array(rowCount).fill({}), routeCards: () => '', track: s.track,
  });
  assert.equal(s.events.length, 0);
  handlers.change(); handlers.submit({ preventDefault() {} });
  assert.deepEqual(s.events.map(e => e[1]), ['training_search', 'tool_use']);
  fields.lv.value = '43'; rowCount = 0; handlers.change();
  assert.equal(s.events.at(-1)[1], 'training_search');
  assert.equal(s.events.at(-1)[2].result, 'empty');
  assert.equal(s.events.filter(e => e[1] === 'tool_use').length, 1);
});
