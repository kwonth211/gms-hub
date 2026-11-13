// Product interactions must never overwrite GA campaign attribution.
// Loaded before common.js and feature scripts; no storage, timers or network work here.
(() => {
  const send = (name, params) => {
    try { window.gtag?.('event', name, params); } catch (e) {}
    try { window.clarity?.('event', name); } catch (e) {}
  };
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
