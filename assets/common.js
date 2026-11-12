// The language menu is a <details>; close it on an outside click or Escape.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.lang-menu[open], .more-menu[open]').forEach((d) => d.contains(e.target) || d.removeAttribute('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.lang-menu[open], .more-menu[open]').forEach((d) => d.removeAttribute('open'));
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
  const show = (site) => spots.forEach((el) => {
    const num = el.querySelector('[data-site]');
    if (num.textContent !== String(site) && !el.hidden) {
      num.classList.remove('bump');
      void num.offsetWidth;
      num.classList.add('bump');
    }
    num.textContent = site;
    el.hidden = !(site >= 2);
  });
  const open = () => {
    if (ws || document.hidden) return;
    ws = new WebSocket(`${api.replace(/^http/, 'ws')}/presence?p=${encodeURIComponent(location.pathname)}`);
    ws.onmessage = (e) => {
      retry = 0;
      try { show(JSON.parse(e.data).site); } catch (x) {}
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

// Small touches: maple leaves drifting over the home hero and a sparkle where you click (mouse only). The footer
// switch turns them, the custom cursor and the walking mushroom off for good; reduced-motion users never get them.
(() => {
  const html = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = () => html.dataset.charm === 'off';
  function leaves() {
    const hero = document.querySelector('.hero');
    if (!hero || calm || off() || hero.querySelector('.charm-leaves')) return;
    const box = document.createElement('div');
    box.className = 'charm-leaves';
    box.setAttribute('aria-hidden', 'true');
    const fall = hero.offsetHeight + 40;
    for (let i = 0; i < 9; i++) {
      const leaf = document.createElement('i');
      leaf.className = 'charm-leaf';
      leaf.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--fall:${fall}px;--sway:${(Math.random() * 80 - 40).toFixed(0)}px;` +
        `--dur:${(9 + Math.random() * 7).toFixed(1)}s;--delay:${(-Math.random() * 14).toFixed(1)}s;--size:${(0.7 + Math.random() * 0.6).toFixed(2)}`;
      box.append(leaf);
    }
    hero.querySelector('.hero-scene')?.after(box);
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

// Megaphone ticker above the header: the latest game megaphones scroll past; each one opens the megaphone page. The list is
// written twice so the loop has no seam, and the speed follows its length. It holds still on hover or focus, and does not
// move for reduced motion or with the site's animations turned off (then it scrolls by hand).
(() => {
  const box = document.querySelector('.mg-ticker');
  const api = document.body.dataset.priceApi;
  if (!box || !api) return;
  const run = box.querySelector('.mg-tk-run');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const clock = (seen) => new Date(Date.parse(`${seen.replace(' ', 'T')}Z`)).toLocaleTimeString(box.dataset.lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  let lastId = 0;
  async function load() {
    let rows = [];
    try { rows = (await (await fetch(`${api}/megaphones?limit=20`)).json()).rows || []; } catch (e) { return; }
    if (!rows.length || rows[0].id === lastId) return;
    lastId = rows[0].id;
    const items = rows.map((r) => `<a class="mg-tk-item mg-tk-${esc(r.color || 'Y')}" href="${box.dataset.href}" tabindex="-1"><time>${clock(r.seen)}</time>${r.channel ? `<b>CH${r.channel}</b>` : ''}<strong>${esc(r.nick)}</strong><span>${esc(r.text.length > 90 ? `${r.text.slice(0, 88)}…` : r.text)}</span></a>`).join('');
    run.innerHTML = `<div class="mg-tk-set">${items}</div><div class="mg-tk-set" aria-hidden="true">${items}</div>`;
    run.style.setProperty('--tk-dur', `${Math.max(40, Math.round(run.firstChild.scrollWidth / 60))}s`);
    box.classList.add('ready');
  }
  box.addEventListener('click', (e) => { if (e.target.closest('a')) track('mega_ticker_click'); });
  load();
  setInterval(() => document.visibilityState === 'visible' && load(), 60000);
})();
