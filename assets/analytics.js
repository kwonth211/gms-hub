// Product interactions must never overwrite GA campaign attribution.
// Loaded before common.js and feature scripts; no storage or network work of its own (gtag/Clarity send).
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
  const isSearch = (el) => el.matches?.('input[type=search],input[role=combobox],input[name=q],input[id$="-q"],input[id*="search"],input[placeholder]') && !el.matches('[type=password],[type=email],[type=tel],[autocomplete*=email],[data-no-track]') && el.type !== 'number';
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
