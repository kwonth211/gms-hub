// How each run of a screen-reading tool ended, kept for the owner's dashboard so a failing tool is seen the same day:
// the outcome, how long the first reading took, the size of the shared picture and the browser. Never the picture, the
// numbers read, a name or an address. One report per run and outcome.
export function toolReport(tool, outcome, data = {}) {
  try {
    const api = document.body.dataset.priceApi;
    if (!api) return;
    const body = JSON.stringify({ tool, outcome, dpr: +(window.devicePixelRatio || 1).toFixed(2), sw: screen.width, sh: screen.height, lang: document.documentElement.lang, ...data });
    fetch(`${api}/tool-report`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch { /* reporting only */ }
}
