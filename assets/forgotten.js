// Forgotten Hollow guide: live Free Market medians for the new weapons we can track (read-only price lookup).
(() => {
  const cells = [...document.querySelectorAll('[data-fh-price]')];
  const api = document.body.dataset.priceApi;
  if (!cells.length || !api) return;
  const ko = document.documentElement.lang === 'ko';
  const mesos = (n) => ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : n.toLocaleString('ko')) : n.toLocaleString('en-US');
  const ids = cells.map((c) => c.dataset.fhPrice).join(',');
  fetch(`${api}/prices?ids=${ids}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((prices) => {
    for (const c of cells) {
      const a = c.querySelector('a'), p = prices[c.dataset.fhPrice];
      if (!a) continue;
      if (!p?.median) { a.textContent = ko ? '매물 없음' : 'No listings'; c.classList.add('muted'); continue; }
      a.innerHTML = `<b>${mesos(p.median)}</b> <small>${ko ? `매물 ${p.n}개` : `${p.n} listed`}</small>`;
    }
  });
})();
