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

// One place for product events: Google Analytics and Clarity each get them when their tag is on the page.
window.track = (name, params = {}) => {
  try {
    if (window.gtag) gtag('event', name, params);
    if (window.clarity) clarity('event', name);
  } catch (e) {}
};

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
// A tab hidden for 30 seconds lets go, so background tabs are not counted.
(() => {
  const spots = document.querySelectorAll('.presence');
  const api = document.body.dataset.priceApi;
  if (!spots.length || !api || !('WebSocket' in window)) return;
  let ws = null, ping = 0, idle = 0, retry = 0;
  // A changed number pops briefly, like a broadcast viewer counter.
  const show = (site, quiet) => spots.forEach((el) => {
    const num = el.querySelector('[data-site]');
    if (num.textContent !== String(site) && !el.hidden && !quiet) {
      num.classList.remove('bump');
      void num.offsetWidth;
      num.classList.add('bump');
    }
    num.textContent = site;
    el.hidden = !(site >= 2);
  });
  // The last count is drawn at once on the next page, so the pill does not pop in after the socket connects.
  const PR_KEY = 'gms-presence';
  try { const last = Number(sessionStorage.getItem(PR_KEY)); if (last >= 2) show(last, true); } catch (x) {}
  const remember = (site) => { try { sessionStorage.setItem(PR_KEY, String(site)); } catch (x) {} };
  const open = () => {
    if (ws || document.hidden) return;
    ws = new WebSocket(`${api.replace(/^http/, 'ws')}/presence?p=${encodeURIComponent(location.pathname)}`);
    ws.onmessage = (e) => {
      retry = 0;
      try {
        const msg = JSON.parse(e.data);
        // Pushed megaphones go to whoever listens (the ticker below, the megaphone page); counts update the pill.
        if (msg.type === 'megaphones') { if (Array.isArray(msg.rows) && msg.rows.length) dispatchEvent(new CustomEvent('gms-megaphones', { detail: msg.rows })); return; }
        show(msg.site); remember(msg.site);
      } catch (x) {}
    };
    ws.onclose = () => {
      clearInterval(ping);
      ws = null;
      show(0);
      if (!document.hidden && retry < 5) setTimeout(open, 3000 * 2 ** retry++);
    };
    ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 45000);
  };
  document.addEventListener('visibilitychange', () => {
    clearTimeout(idle);
    if (document.hidden) idle = setTimeout(() => ws?.close(), 30000);
    else open();
  });
  open();
})();

// Small touches: a few maple leaves drifting down over every page and a sparkle where you click (mouse only). The switch
// in the footer and in the More menu turns them, the custom cursor and the walking mushroom off for good; reduced-motion
// users never get them. The leaves sit under the header and never take a click.
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
      if (off() || e.button !== 0) return;
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

// Megaphone ticker above the header: the latest game megaphones scroll past; each one opens the megaphone page focused on
// it. The list is written twice so the loop has no seam, and the speed follows its length. It holds still on hover or
// focus, and does not move for reduced motion (then it scrolls by hand). The leaves switch does not stop it.
// Outside English the text is translated by the browser's on-device translator when it is already on this device (the
// ticker never starts a download); Korean otherwise gets the plain reading of the trade shorthand.
(() => {
  const box = document.querySelector('.mg-ticker');
  const api = document.body.dataset.priceApi;
  if (!box || !api) return;
  const lang = box.dataset.lang;
  const textModule = new URL('mega-text.js', document.currentScript.src).href;
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
  let lastId = 0, shown = [], pruneDue = false;
  // The last megaphones seen are kept in this browser and drawn at once on the next page, then fresh ones are merged in:
  // pushed over the presence socket (common.js above) the moment the collector stores them, or from the minute poll.
  const TK_KEY = 'gms-ticker';
  const icon = () => box.querySelector('.mg-tk-icon')?.innerHTML || '';
  const anim = () => run.getAnimations()[0];
  const setW = () => run.firstChild?.scrollWidth || 0;
  // Constant pace: the loop's length in px sets its duration, so adding items never changes the speed.
  const pxPerSec = () => { const w = setW(); const dur = Math.max(40, Math.round(w / 60)); return { w, dur, v: w / dur }; };
  const metrics = () => { const m = pxPerSec(); run.style.setProperty('--tk-x', `-${m.w}px`); run.style.setProperty('--tk-dur', `${m.dur}s`); return m; };
  async function itemsHtml(rows, fresh = false) {
    const read = await getReader();
    const texts = await Promise.all(rows.map(async (r) => { const original = noChannel(r.text, r.channel); return [original, read ? await read(original).catch(() => original) : original]; }));
    return rows.map((r, i) => `<a class="mg-tk-item mg-tk-${esc(r.color || 'Y')}${fresh ? ' mg-tk-new' : ''}" href="${box.dataset.href}?m=${Number(r.id)}" tabindex="-1"${texts[i][1] !== texts[i][0] ? ` title="${esc(texts[i][0])}"` : ''}>${icon()}${r.channel ? `<b>CH${r.channel}</b>` : ''}<time>${clock(r.seen)}</time><strong>${esc(r.nick)}</strong><span>${esc(short(texts[i][1]))}</span></a>`).join('');
  }
  // Full draw: first paint, and the quiet rebuild at a loop boundary after many items were merged in.
  async function draw(rows, at = 0) {
    shown = rows; lastId = rows[0].id;
    const items = await itemsHtml(rows);
    run.innerHTML = `<div class="mg-tk-set">${items}</div><div class="mg-tk-set" aria-hidden="true">${items}</div>`;
    const m = metrics();
    box.classList.add('ready');
    const a = anim();
    if (a && at) a.currentTime = at % (m.dur * 1000);
  }
  // Merge: new items go to the end of both copies while the strip keeps rolling. The current pixel offset is kept, and
  // if the strip was showing the second copy it is moved to the same place in the first, so nothing on screen moves.
  async function merge(rows) {
    const ids = new Set(shown.map((r) => r.id));
    const add = rows.filter((r) => !ids.has(r.id)).sort((a, b) => a.id - b.id);
    if (!add.length) return;
    shown = [...add.slice().reverse(), ...shown].slice(0, 20); lastId = shown[0].id;
    try { localStorage.setItem(TK_KEY, JSON.stringify(shown)); } catch (e) {}
    const html = await itemsHtml(add, true);
    const a = anim();
    const before = pxPerSec();
    let offset = a ? ((a.currentTime || 0) / 1000) * before.v : 0;
    if (offset >= before.w) offset -= before.w;
    for (const set of run.children) set.insertAdjacentHTML('beforeend', html);
    const m = metrics();
    if (a) a.currentTime = (offset / m.v) * 1000;
    if (run.firstChild.children.length > 36) pruneDue = true;
  }
  run.addEventListener('animationiteration', () => { if (pruneDue) { pruneDue = false; draw(shown); } });
  async function load(saved) {
    let rows = [];
    if (saved) {
      try { rows = JSON.parse(localStorage.getItem(TK_KEY) || '[]'); } catch (e) {}
      if (!rows.length) return;
      let at = 0;
      try {
        const keep = JSON.parse(sessionStorage.getItem(TK_POS) || 'null');
        if (keep && keep.id === rows[0].id && Date.now() - keep.at < 120000) at = keep.t + (Date.now() - keep.at);
      } catch (e) {}
      return draw(rows, at);
    }
    try { rows = (await (await fetch(`${api}/megaphones?limit=20`)).json()).rows || []; } catch (e) { return; }
    if (!rows.length) return;
    if (!shown.length) { try { localStorage.setItem(TK_KEY, JSON.stringify(rows)); } catch (e) {} return draw(rows); }
    return merge(rows);
  }
  const TK_POS = 'gms-ticker-pos';
  addEventListener('pagehide', () => {
    const a = run.getAnimations()[0];
    if (a) try { sessionStorage.setItem(TK_POS, JSON.stringify({ id: lastId, t: a.currentTime, at: Date.now() })); } catch (e) {}
  });
  // On the megaphone page itself a ticker item is focused in place instead of reloading the page.
  const samePage = location.pathname === new URL(box.dataset.href, location.href).pathname;
  box.addEventListener('click', (e) => {
    const a = e.target.closest('a.mg-tk-item');
    if (!a) return;
    track('mega_ticker_click');
    if (samePage) {
      const id = Number(new URL(a.href).searchParams.get('m'));
      if (id && dispatchEvent(new CustomEvent('mega-focus', { detail: { id }, cancelable: true })) === false) { e.preventDefault(); history.replaceState(null, '', `?m=${id}`); }
    }
  });
  load(true).then(() => load());
  addEventListener('gms-megaphones', (e) => merge(e.detail));
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

// Repeat visits take the site's files from a service worker cache (assets/sw.js, served at /sw.js). Registered after
// load so it never competes with the page, and only on the real site (not on a local build).
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
