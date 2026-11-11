// The language menu is a <details>; close it on an outside click or Escape.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.lang-menu[open]').forEach((d) => d.contains(e.target) || d.removeAttribute('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.lang-menu[open]').forEach((d) => d.removeAttribute('open'));
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
// open on the site. Every .presence element (the header pill, the home hero stat) shows it once someone else is here too.
// A tab hidden for 30 seconds lets go, so background tabs are not counted.
(() => {
  const spots = document.querySelectorAll('.presence');
  const api = document.body.dataset.priceApi;
  if (!spots.length || !api || !('WebSocket' in window)) return;
  let ws = null, ping = 0, idle = 0, retry = 0;
  const show = (site) => spots.forEach((el) => {
    el.querySelector('[data-site]').textContent = site;
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
