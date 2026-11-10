// Choose one layout before the official SDK sees the ad units. Never refresh ads on a timer or resize.
(() => {
  const candidates = [...document.querySelectorAll('ins.kakao_ad_area[data-min]')];
  const placements = [...document.querySelectorAll('[data-ad-placement]')];
  const width = document.documentElement.clientWidth;
  const active = candidates.filter(unit => {
    const fits = width >= Number(unit.dataset.min) && width <= Number(unit.dataset.max);
    if (!fits) unit.remove();
    return fits;
  });
  const clean = () => {
    for (const placement of placements) if (!placement.querySelector('ins.kakao_ad_area')) placement.remove();
    for (const rails of document.querySelectorAll('.ad-rails')) if (!rails.querySelector('ins.kakao_ad_area')) rails.remove();
  };
  clean();
  if (!active.length) return;

  active.forEach((unit, index) => {
    // AdFit requires a distinct NO-AD callback name for each unit on a page.
    const name = `gmsAdfitNoAd${index}`;
    window[name] = () => { unit.remove(); clean(); };
    unit.dataset.adOnfail = name;
  });
  const sdk = document.createElement('script');
  sdk.src = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
  sdk.async = true;
  sdk.charset = 'utf-8';
  sdk.onerror = () => { for (const unit of active) unit.remove(); clean(); };
  document.body.append(sdk);

  // A resized window must not keep an off-screen or oversized ad. A new layout loads on the next navigation.
  window.addEventListener('resize', () => {
    const available = document.documentElement.clientWidth;
    for (const unit of active) {
      if (available < Number(unit.dataset.adWidth) || (unit.closest('.ad-rail') && available < 1600)) unit.remove();
    }
    clean();
  }, { passive: true });
})();
