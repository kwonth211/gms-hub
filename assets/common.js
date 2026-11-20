// The language menu is a <details>; close it on an outside click or Escape.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.lang-menu[open], .more-menu[open], .tool-menu[open]').forEach((d) => d.contains(e.target) || d.removeAttribute('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.lang-menu[open], .more-menu[open], .tool-menu[open]').forEach((d) => d.removeAttribute('open'));
});

// The calculators tab sits inside the scrolling tab strip, which would clip an absolute dropdown, so its list is placed
// with fixed coordinates under the tab when it opens, and closes when the page scrolls or resizes.
document.querySelectorAll('.tool-menu').forEach((menu) => {
  const list = menu.querySelector('.tool-list');
  const place = () => {
    const r = menu.querySelector('summary').getBoundingClientRect();
    const w = Math.max(list.offsetWidth, 200);
    list.style.top = `${Math.round(r.bottom + 6)}px`;
    list.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
  };
  menu.addEventListener('toggle', () => { if (menu.open) place(); });
  const close = () => menu.open && menu.removeAttribute('open');
  addEventListener('scroll', close, { passive: true });
  addEventListener('resize', close);
});

// Remember the language a visitor picks so the root page sends them back to it.
document.querySelectorAll('[data-lang]').forEach((a) => {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem('cb_lang', a.dataset.lang);
    } catch (e) {}
    track('switch_language', { to: a.dataset.lang });
  });
});

// Outbound clicks: which listed site people actually leave for, and from which section.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (!a || a.host === location.host) return;
  const card = a.closest('.site-card');
  track('visit_site', {
    site_id: card?.dataset.id || a.host,
    category: a.closest('[data-cat]')?.id || (a.closest('#favorites') ? 'favorites' : 'other'),
    link_type: a.classList.contains('visit') ? 'button' : 'card'
  });
});

// Share links: the same page state in a fresh tab, tagged so arrivals through a shared link are counted apart from
// search or direct visits. Nothing personal goes into the URL; only the page's own state parameters are kept.
window.shareUrl = (url, content) => {
  const u = new URL(url, location.href);
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|src$|internal$)/.test(k)) u.searchParams.delete(k);
  u.searchParams.set('utm_source', 'share');
  u.searchParams.set('utm_medium', 'link');
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
};
// Resolves to true when the text reached the clipboard; the caller shows the success or failure message.
window.copyText = async (text) => {
  try {
    // The async clipboard can hang when the document is not focused; fall back after a moment instead of waiting forever.
    if (navigator.clipboard?.writeText) {
      const ok = await Promise.race([navigator.clipboard.writeText(text).then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))]);
      if (ok) return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
};
// A visit that started from a shared link, recorded once per page load (the session source already carries utm_source).
if (new URLSearchParams(location.search).get('utm_source') === 'share') {
  track('share_open', { page_type: document.body.dataset.page || location.pathname.split('/').filter(Boolean).slice(1, 3).join('/') || 'home', content: new URLSearchParams(location.search).get('utm_content') || '' });
}

// Day or night: the head script already applied the saved choice; the header button flips it and remembers it.
document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
  b.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'dark' ? '#0f1420' : '#f6f1e7';
    try {
      localStorage.setItem('gms-theme', next);
    } catch (e) {}
    track('theme_toggle', { to: next });
  });
});

// Live viewer count: each open tab holds one WebSocket to the worker's presence room, which sends back how many pages are
// open on the site. The header pill shows it once someone else is here too.
// Every open tab counts, also in the background (owner 2026-11-17: count people who have the site open). The socket is
// cheap to hold: the room hibernates and answers pings on its own. A tab left hidden for 6 hours lets go.
(() => {
  const spots = document.querySelectorAll('.presence');
  const api = document.body.dataset.priceApi;
  if (!spots.length || !api || !('WebSocket' in window)) return;
  let ws = null, ping = 0, idle = 0, retry = 0;
  // Owner's decision (2026-11-15, early days): the pill shows the real count plus a fixed 50. Temporary — remove BOOST to
  // show the real number again. GA/RUM and every report use real numbers only.
  const BOOST = 50;
  // A changed number pops briefly, like a broadcast viewer counter.
  const show = (site, quiet) => spots.forEach((el) => {
    const num = el.querySelector('[data-site]');
    const shown = site >= 1 ? site + BOOST : 0;
    if (num.textContent !== String(shown) && !el.hidden && !quiet) {
      num.classList.remove('bump');
      void num.offsetWidth;
      num.classList.add('bump');
    }
    num.textContent = shown;
    el.hidden = !(site >= 1);
  });
  // The last count is drawn at once on the next page, so the pill does not pop in after the socket connects.
  const PR_KEY = 'gms-presence';
  try { const last = Number(sessionStorage.getItem(PR_KEY)); if (last >= 1) show(last, true); } catch (x) {}
  const remember = (site) => { try { sessionStorage.setItem(PR_KEY, String(site)); } catch (x) {} };
  const open = () => {
    if (ws) return;
    ws = new WebSocket(`${api.replace(/^http/, 'ws')}/presence?p=${encodeURIComponent(location.pathname)}`);
    ws.onmessage = (e) => {
      retry = 0;
      try {
        const msg = JSON.parse(e.data);
        // Pushed megaphones go to whoever listens (the ticker below, the megaphone page); counts update the pill.
        if (msg.type === 'megaphones') { if (Array.isArray(msg.rows) && msg.rows.length) dispatchEvent(new CustomEvent('gms-megaphones', { detail: msg.rows })); return; }
        // 무료 고확 (site trade posts): new ones and removed ones (deleted by the poster or hidden by reports).
        if (msg.type === 'free') { if (Array.isArray(msg.rows) && msg.rows.length) dispatchEvent(new CustomEvent('gms-free', { detail: msg.rows })); return; }
        if (msg.type === 'free-gone') { dispatchEvent(new CustomEvent('gms-free-gone', { detail: Number(msg.id) })); return; }
        show(msg.site); remember(msg.site);
      } catch (x) {}
    };
    ws.onclose = () => {
      clearInterval(ping);
      ws = null;
      show(0);
      if (retry < 5) setTimeout(open, 3000 * 2 ** retry++);
    };
    ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 45000);
  };
  document.addEventListener('visibilitychange', () => {
    clearTimeout(idle);
    if (document.hidden) idle = setTimeout(() => { retry = 9; ws?.close(); }, 6 * 3600000);
    else { retry = 0; open(); }
  });
  open();
})();

// Small touches: a few maple leaves drifting down over every page and a sparkle where you click (mouse only). The switch
// in the footer and More menu controls only the falling leaves, independently of the banner and other touches.
// Reduced-motion users never get the leaves or click sparkles. The leaves sit under the header and never take a click.
(() => {
  const html = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = () => html.dataset.charm === 'off';
  function leaves() {
    if (calm || off() || document.querySelector('.charm-leaves')) return;
    const box = document.createElement('div');
    box.className = 'charm-leaves';
    box.setAttribute('aria-hidden', 'true');
    const n = innerWidth < 600 ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const leaf = document.createElement('i');
      leaf.className = 'charm-leaf';
      leaf.style.cssText = `left:${((i + Math.random()) * (100 / n)).toFixed(1)}%;--sway:${(Math.random() * 90 - 45).toFixed(0)}px;` +
        `--dur:${(16 + Math.random() * 10).toFixed(1)}s;--delay:${(-Math.random() * 26).toFixed(1)}s;--size:${(0.6 + Math.random() * 0.5).toFixed(2)}`;
      box.append(leaf);
    }
    document.body.append(box);
  }
  leaves();
  if (!calm && matchMedia('(pointer: fine)').matches) {
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      for (let i = 0; i < 6; i++) {
        const s = document.createElement('i');
        const a = (Math.PI * 2 * i) / 6 + Math.random() * 0.5, d = 18 + Math.random() * 14;
        s.className = i % 3 ? 'charm-spark' : 'charm-spark leafy';
        s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px`;
        document.body.append(s);
        setTimeout(() => s.remove(), 650);
      }
    }, { passive: true });
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-charm-toggle]')) return;
    const turnOff = !off();
    if (turnOff) html.dataset.charm = 'off'; else delete html.dataset.charm;
    try { localStorage.setItem('gms-charm', turnOff ? 'off' : 'on'); } catch (x) {}
    document.querySelector('.charm-leaves')?.remove();
    if (!turnOff) leaves();
    track('charm_toggle', { on: turnOff ? 0 : 1 });
  });
})();

// Megaphone ticker above the header: game megaphones scroll past as they come in; each one opens the megaphone page
// focused on it. It holds still on hover or focus, and does not move for reduced motion (then it scrolls by hand). The leaves switch does not stop it.
// Outside English the text is translated by the browser's on-device translator when it is already on this device (the
// ticker never starts a download); Korean otherwise gets the plain reading of the trade shorthand.
(() => {
  const box = document.querySelector('.mg-ticker');
  const api = document.body.dataset.priceApi;
  if (!box || !api) return;
  const lang = box.dataset.lang;
  const textModule = new URL('mega-text.js', document.currentScript.src).href;
  const optionModule = new URL('mega-option-text.js', document.currentScript.src);
  optionModule.search = new URL(document.currentScript.src).search;
  const linkModule = new URL('market-share.js', document.currentScript.src);
  linkModule.search = new URL(document.currentScript.src).search;
  let links = null;
  const getLinks = () => (links ||= (async () => {
    const [mod, rows] = await Promise.all([import(linkModule.href), fetch(box.dataset.items).then((r) => { if (!r.ok) throw Error('items'); return r.json(); })]);
    const names = new Map();
    for (const [id, koName, en] of rows) for (const name of [koName, en]) if (name) names.set(name.toLowerCase(), id);
    return { ...mod, names };
  })().catch(() => { links = null; return null; }));
  let options = null;
  const getOptions = () => (options ||= import(optionModule.href).catch(() => null));
  const run = box.querySelector('.mg-tk-run');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const clock = (seen) => new Date(Date.parse(`${seen.replace(' ', 'T')}Z`)).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  // The channel is shown up front, so the same channel written again in the message ("FM CH30", "ch 30") is dropped.
  const noChannel = (text, ch) => (ch ? text.replace(new RegExp(`\\s*\\b(?:ch(?:annel)?\\.?\\s*0?${ch})\\b[,.]?`, 'gi'), '').trim() : text);
  const short = (t) => (t.length > 90 ? `${t.slice(0, 88)}…` : t);
  let reader = null;
  const getReader = () => (reader ||= (async () => {
    if (lang === 'en') return null;
    const mod = await import(textModule).catch(() => null);
    if (!mod) return null;
    let translator = null;
    try {
      if ('Translator' in self && (await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: lang })) === 'available')
        translator = await self.Translator.create({ sourceLanguage: 'en', targetLanguage: lang });
    } catch (e) {}
    const cache = new Map();
    return async (text) => {
      if (translator) {
        const item = /^\s*\[[^\]]*\]\s*/.exec(text)?.[0] || '';
        const src = mod.plain(text);
        if (!src) return text;
        if (!cache.has(src)) cache.set(src, translator.translate(src).catch(() => ''));
        const out = await cache.get(src);
        if (out) return `${item}${out}`;
      }
      if (lang !== 'ko') return text;
      let out = text;
      for (const [re, to] of mod.GLOSS) out = out.replace(re, to);
      return out;
    };
  })());
  // A queue: megaphones roll by oldest first. New ones join the end of the line and scroll in right after what is
  // showing; with nothing new, a few recent ones roll by again until something arrives. A long pile-up of new ones rolls a
  // little faster so the strip never falls far behind. The last megaphones are kept in this browser, so the next page starts with the newest
  // at the right edge and megaphones that came in since then roll in next. New ones arrive pushed over the presence socket
  // (common.js above) the moment the collector stores them, or from the minute poll.
  // Discard rows cached by the old live push, which omitted opts even when the server had them.
  const TK_KEY = 'gms-ticker-options-v1';
  const icon = () => box.querySelector('.mg-tk-icon')?.innerHTML || '';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loaded = false, kept = [], x = 0, last = 0, held = false, frame = 0;
  // Game megaphones and 무료 고확 (site posts, free: true) share the strip; each is known by its own id space.
  const keyOf = (r) => `${r.free ? 'f' : 'm'}${r.id}`;
  const seenKeys = new Set();
  const atOf = (r) => Date.parse(`${String(r.seen).replace(' ', 'T')}Z`) || 0;
  // A free megaphone rides the strip for its first hour only (2026-11-16, owner); the megaphone page keeps it for a day.
  const FREE_TTL = 3600e3;
  const live = (r) => !r.free || Date.now() - atOf(r) < FREE_TTL;
  const ko = lang === 'ko';
  const mesos = (n) => (ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : String(n)) : n >= 1e9 ? `${+(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));
  // A site post as one ticker line: "팝니다 [장갑 공격 주문서 60%] 300만 1개 급처".
  const freeRow = (r) => ({ id: r.id, item: r.item, free: true, seen: r.at, nick: r.nick, channel: r.channel, color: 'F',
    text: [r.intent === 'sell' ? (ko ? '팝니다' : 'Selling') : r.intent === 'buy' ? (ko ? '삽니다' : 'Buying') : '', r.item ? `[${(ko ? r.ko : r.en) || r.en || `#${r.item}`}]` : '', r.price ? mesos(r.price) : '', r.text].filter(Boolean).join(' ') });
  run.innerHTML = '<div class="mg-tk-set"></div>';
  const set = run.firstChild;
  async function itemsHtml(rows, fresh = false) {
    const [read, opt, link] = await Promise.all([getReader(), rows.some((r) => r.opts) ? getOptions() : null, rows.some((r) => r.text.includes('[')) ? getLinks() : null]);
    const texts = await Promise.all(rows.map(async (r) => { const original = noChannel(r.text, r.channel); return [original, read && !r.free ? await read(original).catch(() => original) : original]; }));
    return rows.map((r, i) => {
      const summary = opt?.optionSummary?.(r.opts, ko) || '';
      const title = [texts[i][0], summary].filter(Boolean).join(' · ');
      const detail = `${box.dataset.href}?${r.free ? 'f' : 'm'}=${Number(r.id)}`;
      // Only the bracketed linked item owns opts; a B> message may ask for a different item.
      const linkedName = /\[([^\]]+)\]/.exec(r.text)?.[1];
      const item = r.free ? Number(r.item) : link?.names.get(linkedName?.trim().toLowerCase());
      const itemHref = item && link ? link.marketSharePath({ marketPath: box.dataset.market, id: item, opts: r.opts }) : '';
      const messageLink = (html) => `<a class="mg-tk-message" data-mega-id="${keyOf(r)}" href="${esc(detail)}" tabindex="-1">${html}</a>`;
      const message = short(texts[i][1]), bracket = /\[[^\]]+\]/.exec(message);
      const body = itemHref && bracket
        ? (bracket.index ? messageLink(esc(message.slice(0, bracket.index))) : '') + `<a class="mg-tk-item-link" href="${esc(itemHref)}" tabindex="-1" data-item-id="${item}"${r.opts ? ` data-opts="${esc(JSON.stringify(r.opts))}"` : ''}>${esc(bracket[0])}</a>` + (message.slice(bracket.index + bracket[0].length) ? messageLink(esc(message.slice(bracket.index + bracket[0].length))) : '')
        : messageLink(esc(message));
      return `<span class="mg-tk-item mg-tk-${esc(r.color || 'Y')}${fresh ? ' mg-tk-new' : ''}"${summary || texts[i][1] !== texts[i][0] ? ` title="${esc(title)}"` : ''}>${messageLink(`${icon()}${r.free ? `<em class="mg-tk-free">${ko ? '무료 고확' : 'Free mega'}</em>` : ''}${Number(r.channel) ? `<b>CH${Number(r.channel)}</b>` : ''}<time>${clock(r.seen)}</time><strong>${esc(r.nick)}</strong>`)}${body}${summary ? `<a class="mg-tk-opts" href="${esc(itemHref || detail)}"${itemHref ? '' : ` data-mega-id="${keyOf(r)}"`} tabindex="-1">${esc(summary)}</a>` : ''}</span>`;
    }).join('');
  }
  // Sizes are read only when the strip's content or the window changes (measure), never on every frame: a layout read
  // right after moving the strip made the browser lay the whole page out again 60 times a second.
  let view = 0, setW = 0, firstW = 0, newEnd = 0, stale = true;
  const measure = () => {
    stale = false;
    view = run.parentElement.clientWidth;
    setW = set.scrollWidth;
    firstW = set.firstElementChild ? set.firstElementChild.offsetWidth : 0;
    // Right edge of the last megaphone that is not a replay.
    let lastNew = set.lastElementChild;
    while (lastNew && lastNew.classList.contains('mg-tk-re')) lastNew = lastNew.previousElementSibling;
    newEnd = lastNew ? lastNew.offsetLeft + lastNew.offsetWidth : 0;
  };
  addEventListener('resize', () => { stale = true; }, { passive: true });
  const stopAt = () => { measure(); return Math.min(0, view - setW); };
  // With nothing new coming in, the strip keeps rolling through a few recent megaphones again ("replay" items). A new
  // megaphone skips ahead of any replay items not yet on screen, so it always comes in next.
  let refilling = false;
  async function replay() {
    if (refilling || !kept.length) return;
    refilling = true;
    kept = kept.filter(live);
    if (!kept.length) { refilling = false; return; }
    const html = await itemsHtml(kept.slice(-8));
    set.insertAdjacentHTML('beforeend', html.replace(/class="mg-tk-item /g, 'class="mg-tk-item mg-tk-re '));
    stale = true;
    refilling = false;
  }
  function step(t) {
    frame = 0;
    const dt = Math.min(0.1, last ? (t - last) / 1000 : 0);
    last = t;
    if (stale) measure();
    const ahead = x + setW - view; // px still waiting off the right edge
    // Same pace as before (60 px/s). Only a real pile-up of new megaphones (not replays) more than two screens long
    // speeds it up, and then by at most half again.
    const backlog = newEnd ? x + newEnd - view : 0;
    if (!held) x -= 60 * (backlog > 2 * view ? 1.5 : 1) * dt;
    if (ahead < view) replay();
    // Items that have scrolled fully past the left edge are done; dropping them keeps the strip short.
    while (set.children.length > 1 && firstW && x + firstW < 0) { x += firstW; set.firstElementChild.remove(); measure(); }
    run.style.transform = `translateX(${x}px)`;
    if (document.hidden) last = 0;
    else frame = requestAnimationFrame(step);
  }
  const go = () => { if (!calm && !frame) frame = requestAnimationFrame(step); };
  const settle = () => { x = calm ? 0 : stopAt(); run.style.transform = `translateX(${x}px)`; };
  async function add(rows, fresh) {
    const next = rows.filter((r) => live(r) && !seenKeys.has(keyOf(r))).sort((a, b) => atOf(a) - atOf(b) || a.id - b.id);
    if (!next.length) return;
    for (const r of next) seenKeys.add(keyOf(r));
    kept = kept.concat(next).slice(-20);
    try { localStorage.setItem(TK_KEY, JSON.stringify(kept)); } catch (e) {}
    const html = await itemsHtml(next, fresh);
    const width = run.parentElement.clientWidth;
    for (const el of [...set.querySelectorAll('.mg-tk-re')]) if (x + el.offsetLeft >= width) el.remove();
    set.insertAdjacentHTML('beforeend', html);
    // Megaphones can come in faster than the strip shows them (about nine a minute), and a tab left in the background
    // piles them up, so the line waiting off the right edge is capped at the newest ten: what rolls in is always recent
    // instead of twenty minutes old (owner 2026-11-19).
    const waiting = [...set.children].filter((el) => !el.classList.contains('mg-tk-re') && x + el.offsetLeft >= width);
    for (const el of waiting.slice(0, Math.max(0, waiting.length - 10))) el.remove();
    stale = true;
    box.classList.add('ready');
    go();
  }
  async function load(saved) {
    if (saved) {
      let rows = [];
      try { rows = JSON.parse(localStorage.getItem(TK_KEY) || '[]'); } catch (e) {}
      if (!rows.length) return;
      loaded = true;
      await add(rows, false);
      // What was already seen stands still, newest at the right edge.
      return settle();
    }
    let rows = [];
    try {
      const [game, free] = await Promise.all([fetch(`${api}/megaphones?limit=20`).then((r) => r.json()), fetch(`${api}/free-megas?limit=10`).then((r) => r.json()).catch(() => ({ rows: [] }))]);
      rows = (game.rows || []).concat((free.rows || []).map(freeRow));
    } catch (e) { return; }
    if (!loaded) { loaded = true; await add(rows, false); return settle(); }
    return add(rows, true);
  }
  const hold = (on) => { held = on; if (!on) go(); };
  box.addEventListener('mouseenter', () => hold(true));
  box.addEventListener('mouseleave', () => hold(false));
  box.addEventListener('focusin', () => hold(true));
  box.addEventListener('focusout', () => hold(false));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  // On the megaphone page itself a ticker item is focused in place instead of reloading the page.
  const samePage = location.pathname === new URL(box.dataset.href, location.href).pathname;
  box.addEventListener('click', (e) => {
    const a = e.target.closest('.mg-tk-item a');
    if (!a) return;
    track('mega_ticker_click');
    if (samePage && a.dataset.megaId) {
      const q = new URL(a.href).searchParams, f = Number(q.get('f')), id = f ? `f${f}` : Number(q.get('m'));
      if (id && dispatchEvent(new CustomEvent('mega-focus', { detail: { id }, cancelable: true })) === false) { e.preventDefault(); history.replaceState(null, '', f ? `?f=${f}` : `?m=${id}`); }
    }
  });
  load(true).then(() => load());
  addEventListener('gms-megaphones', (e) => add(e.detail, true));
  addEventListener('gms-free', (e) => add(e.detail.map(freeRow), true));
  setInterval(() => document.visibilityState === 'visible' && load(), 60000);
})();

// Copy buttons (contact page e-mail): data-copy holds the text; the status next to it says it worked.
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const out = b.parentElement.querySelector('.share-status');
  try { await navigator.clipboard.writeText(b.dataset.copy); if (out) out.textContent = document.documentElement.lang === 'ko' ? '복사했어요' : 'Copied'; } catch (x) {}
});
document.addEventListener('click', (e) => { const a = e.target.closest('[data-support]'); if (a) track('support_click', { platform: a.dataset.support }); });
document.addEventListener('click', (e) => { const a = e.target.closest('[data-discord]'); if (a) track('discord_click', { place: a.dataset.discord }); });
// Lite YouTube embed: the iframe loads only when the visitor presses play, so pages stay fast.
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-yt-open]'); if (o) { track('video_open', { video_id: o.dataset.ytOpen, page_type: document.body.dataset.page || '' }); return; }
  const b = e.target.closest('[data-yt-lite] > button'); if (!b) return;
  const id = b.parentElement.dataset.ytLite, f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`; f.title = b.getAttribute('aria-label') || 'YouTube';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; b.replaceWith(f);
  track('video_play', { video_id: id, page_type: document.body.dataset.page || '' });
});

// Repeat visits take the site's files from a service worker cache (assets/sw.js, served at /sw.js). Registered after
// load so it never competes with the page, and only on the real site (not on a local build).
// Language hint (2026-11-18): GA showed English-browser visitors landing on Korean pages (/ko/tools/training/: 60 visits
// in 8 days, 45 s each) and leaving. When someone arrives from outside the site on a page in a language their browser
// does not use, and the same page exists in their language, a thin bar offers it. Only on arrival (a visitor who moved
// within the site chose where they are), only ko <-> en, and a close stays closed.
(() => {
  const here = document.documentElement.lang;
  if (here !== 'ko' && here !== 'en') return;
  let fromSite = false;
  try { fromSite = !!document.referrer && new URL(document.referrer).host === location.host; } catch (e) {}
  if (fromSite || /^\/admin\//.test(location.pathname)) return;
  const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map((l) => String(l).toLowerCase());
  const wantsKo = prefs.some((l) => l.startsWith('ko'));
  const want = here === 'ko' && !wantsKo && prefs.some((l) => l.startsWith('en')) ? 'en' : here === 'en' && wantsKo ? 'ko' : '';
  if (!want) return;
  const KEY = 'gms-lang-hint-off';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  const alt = document.querySelector(`link[rel="alternate"][hreflang="${want}"]`);
  if (!alt) return;
  const to = new URL(alt.href, location.href);
  to.search = location.search; to.hash = location.hash;
  const bar = document.createElement('div');
  bar.className = 'lang-hint';
  bar.setAttribute('lang', want);
  const text = want === 'en' ? 'This page is also in English.' : '이 페이지는 한국어로도 볼 수 있어요.';
  const go = want === 'en' ? 'Read it in English' : '한국어로 보기';
  bar.innerHTML = `<span>${text}</span><a href="${to.pathname + to.search + to.hash}" data-lang-hint="go">${go} →</a><button type="button" aria-label="${want === 'en' ? 'Close' : '닫기'}">×</button>`;
  bar.querySelector('button').addEventListener('click', () => { bar.remove(); try { localStorage.setItem(KEY, '1'); } catch (e) {} });
  const header = document.querySelector('.site-header');
  (header ? header.after(bar) : document.body.prepend(bar));
  try { window.gtag?.('event', 'lang_hint_shown', { to: want }); } catch (e) {}
  bar.querySelector('a').addEventListener('click', () => { try { window.gtag?.('event', 'lang_hint_click', { to: want }); } catch (e) {} });
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // Page scripts start after the first paint, which can be after the load event.
  const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (document.readyState === 'complete') register(); else addEventListener('load', register);
}
