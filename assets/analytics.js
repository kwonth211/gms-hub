// Product interactions must never overwrite GA campaign attribution.
// Loaded before common.js and feature scripts. The first parts send through gtag/Clarity; the last part is our own
// GA-style people count (see there).
(() => {
  const send = (name, params) => {
    try { window.gtag?.('event', name, params); } catch (e) {}
    try { window.clarity?.('event', name); } catch (e) {}
  };
  window.__gmsSend = send;
  window.track = (name, params = {}) => {
    const safe = { ...params };
    // Compatibility guard for older cached feature scripts.
    if (Object.hasOwn(safe, 'source')) {
      safe.interaction_source ??= safe.source;
      delete safe.source;
    }
    send(name, safe);
    const tool = name === 'market_item' && Number(safe.listings) > 0 ? 'market'
      : name === 'training_search' && Number(safe.results) > 0 ? 'training' : null;
    if (tool && safe.result === 'ok') {
      // GA counts this key event once per session, while raw events retain every use.
      send('tool_use', { ...safe, tool });
    }
  };
})();

// Site-wide interaction log: every click on a link/button/row, every filter change and every settled search is sent
// once with where it happened, so new features are measurable without adding their own events. Typed text is sent
// only from search boxes; passwords, e-mail and free-text fields never leave the page.
(() => {
  if (typeof document === 'undefined') return;
  const send = (...a) => window.__gmsSend?.(...a);
  const page = () => document.body?.dataset.page || location.pathname.split('/').filter(Boolean).slice(1, 3).join('/') || 'home';
  const clip = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const area = (el) => {
    const box = el.closest('[id]:not(body):not(html)') || el.closest('section,nav,header,footer,aside,main,dialog');
    if (!box) return 'page';
    if (box.id) return clip(box.id, 40);
    return box.tagName.toLowerCase();
  };
  const own = (el) => { const c = el.cloneNode(true); c.querySelectorAll('select,input,textarea,option,small,svg').forEach((x) => x.remove()); return c.textContent; };
  const label = (el) => clip(el.getAttribute('aria-label') || el.dataset.label || el.querySelector?.('strong,b,h2,h3,h4')?.textContent || el.title || own(el) || el.value || el.name || el.id, 60);
  const item = (el) => el.closest('[data-item]')?.dataset.item || el.closest('[data-item-id]')?.dataset.itemId || '';
  const dataKey = (el) => Object.keys(el.dataset || {}).filter((k) => !/^(item|itemId|label)$/.test(k))[0] || '';
  const base = (el) => ({ page_type: page(), ui_area: area(el), ui_label: label(el), ui_kind: el.tagName.toLowerCase() + (dataKey(el) ? `[${dataKey(el)}]` : ''), item_id: item(el) });

  document.addEventListener('click', (e) => {
    let el = e.target.closest('a,button,summary,[role=button],[role=tab],label');
    // Whole table rows / cards that act as one target count as a click on what they open.
    if (!el) el = e.target.closest('tr[data-item],li[data-item],[data-item],tbody tr');
    if (!el || el.closest('[data-no-track]')) return;
    if (el.tagName === 'LABEL' && el.control) return; // the input's own change event covers it
    const p = base(el);
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      try { const u = new URL(href, location.href); p.link_url = u.host === location.host ? clip(u.pathname + (u.hash || ''), 90) : clip(u.host + u.pathname, 90); p.outbound = u.host === location.host ? 0 : 1; } catch (er) { p.link_url = clip(href, 90); }
    }
    send('ui_click', p);
  }, { capture: true, passive: true });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.matches?.('select,input[type=checkbox],input[type=radio],input[type=range],input[type=number]') || el.closest('[data-no-track]')) return;
    const p = base(el);
    p.ui_label = clip((el.labels?.[0] && own(el.labels[0])) || el.getAttribute('aria-label') || el.name || el.id, 60);
    p.ui_value = el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : clip(el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent || el.value : el.value, 40);
    send('ui_change', p);
  }, { capture: true, passive: true });

  // Searches: counted once the typing settles (1.5 s), never per keystroke and never a half-typed Korean syllable.
  const timers = new WeakMap(), last = new WeakMap();
  const isSearch = (el) => el.matches?.('input[type=search],input[role=combobox],input[name=q],input[id$="-q"],input[id*="search"]') && !el.matches('[type=password],[type=email],[type=tel],[autocomplete*=email],[data-no-track]') && el.type !== 'number';
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!isSearch(el)) return;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => {
      const term = clip(el.value, 40);
      if (!term || term === last.get(el) || (/[가-힣]/.test(term) && /[ㄱ-ㆎ]$/.test(term))) return;
      last.set(el, term);
      send('ui_search', { ...base(el), ui_label: clip(el.getAttribute('aria-label') || el.placeholder || el.id, 60), search_term: term });
    }, 1500));
  }, { capture: true, passive: true });

  document.addEventListener('submit', (e) => { const f = e.target; if (!f.closest?.('[data-no-track]')) send('ui_submit', { ...base(f), ui_label: clip(f.getAttribute('aria-label') || f.id || f.action, 60) }); }, { capture: true, passive: true });
})();

// People and sessions counted the way GA4 counts them (owner 2026-11-27, shown on the owner's traffic dashboard only):
// a random id kept in this browser = one person; a session starts on the first page and again after 30 minutes without
// any activity. Reloads and new tabs inside a session send nothing. Only two kinds of note go to the worker, at most once
// each: "first time today" (u) and "new session" (s), with the page, language and where the session came from. No IP,
// name or typed text. The owner's own browsers (?internal=1) and automated browsers are left out, as in GA.
(() => {
  if (typeof document === 'undefined') return;
  const api = document.body?.dataset.priceApi;
  if (!api || navigator.webdriver || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
  const IDLE = 30 * 60 * 1000;
  const kstDay = (t) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
  const rand = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  let ls;
  try {
    ls = localStorage;
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || ls.getItem('gmshub_internal') === '1' || /[?&]internal=1(&|$)/.test(location.search)) return;
  } catch (e) { return; } // without storage a person cannot be told apart from the next page load
  const ref = () => { try { const h = new URL(document.referrer).hostname; return h && !h.endsWith('gms-hub.com') ? h.slice(0, 60) : ''; } catch (e) { return ''; } };
  const post = (body) => {
    const url = `${api}/hit`;
    try { if (navigator.sendBeacon?.(url, body)) return; } catch (e) {}
    fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  };
  const check = (first) => {
    try {
      const now = Date.now(), kinds = [];
      let id = ls.getItem('gms-cid'), fresh = 0;
      if (!id) { id = rand(); ls.setItem('gms-cid', id); fresh = 1; }
      const last = Number(ls.getItem('gms-last')) || 0;
      if (now - last > IDLE) kinds.push('s');
      const day = kstDay(now);
      if (ls.getItem('gms-day') !== day) { ls.setItem('gms-day', day); kinds.push('u'); }
      ls.setItem('gms-last', String(now));
      if (!kinds.length) return;
      post(JSON.stringify({ k: kinds, c: id, n: fresh, p: location.pathname.slice(0, 120), l: document.documentElement.lang || '', r: first ? ref() : '' }));
    } catch (e) {}
  };
  check(true);
  // Activity keeps the session open (GA4 extends it on every event); checked at most once a minute.
  let lastTouch = Date.now();
  const touch = () => { const t = Date.now(); if (t - lastTouch < 60000) return; lastTouch = t; check(false); };
  for (const ev of ['pointerdown', 'keydown', 'scroll']) addEventListener(ev, touch, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lastTouch = 0; touch(); } });
})();
