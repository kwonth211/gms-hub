// Only the explicitly marked product shortcuts are measured. No user text, prices or identifiers from accounts.
// A view means >= half of the control entered the viewport, once per feature/placement/content per page load.
export function mountDiscovery({ document, IntersectionObserver, MutationObserver, track }) {
  const selector = '[data-discover]';
  const seen = new Set();
  const info = (el) => {
    const feature = el.dataset.discover;
    if (!/^[a-z_]{1,24}$/.test(feature || '')) return null;
    return { feature, placement: (el.dataset.discoverPlace || '').slice(0, 40), content_id: (el.dataset.discoverId || '').slice(0, 60) };
  };
  const send = (el, action) => {
    const data = info(el);
    if (!data) return;
    const { feature, ...params } = data;
    try { track(`${feature}_${action}`, { ...params, page_type: document.body.dataset.page || '' }); } catch {}
  };
  const click = (e) => {
    const el = e.target.closest?.(selector);
    if (el && !el.disabled) send(el, 'click');
  };
  document.addEventListener('click', click, { capture: true, passive: true });
  let observer, mutations;
  const visit = (node, fn) => {
    if (node.nodeType !== 1) return;
    if (node.matches(selector)) fn(node);
    node.querySelectorAll(selector).forEach(fn);
  };
  if (IntersectionObserver) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || document.visibilityState === 'hidden') continue;
        const data = info(entry.target);
        if (!data) continue;
        const key = JSON.stringify(data);
        if (!seen.has(key)) { seen.add(key); send(entry.target, 'view'); }
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.5 });
    const watch = (el) => { if (info(el)) observer.observe(el); };
    visit(document.body, watch);
    if (MutationObserver) {
      mutations = new MutationObserver((records) => {
        for (const record of records) {
          record.removedNodes.forEach((node) => visit(node, (el) => observer.unobserve(el)));
          record.addedNodes.forEach((node) => visit(node, watch));
        }
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    }
  }
  return () => { observer?.disconnect(); mutations?.disconnect(); document.removeEventListener('click', click, true); };
}

if (typeof document !== 'undefined') mountDiscovery({
  document, IntersectionObserver: globalThis.IntersectionObserver, MutationObserver: globalThis.MutationObserver,
  track: (name, params) => globalThis.track?.(name, params),
});
