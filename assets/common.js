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
