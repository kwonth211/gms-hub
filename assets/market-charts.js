import { analyzeMarket, HOUR, PERIODS } from './market-analytics.js';
// Pages in derived locales define window.tx (scripts/i18n.mjs); tests and English/Korean pages fall back to the text.
const tx = globalThis.tx || ((s) => s);

const COPY = {
  ko: {
    title: '가격 흐름과 매물대', period: '조회 기간', periods: ['1시간', '6시간', '24시간', '7일'],
    both: '함께 보기', asking: '판매 중', sold: '판매 완료', series: '가격 추이 표시',
    trend: '가격 변동 추이', trendNote: '시간 구간별 중앙값 · 세로선은 최저~최고 · 아래 막대는 관측 매물 수',
    basis: '각 매물의 마지막 확인 시각 기준이에요. 판매 완료도 확인한 가격이며, 실제 거래 시각·거래량은 아니에요.',
    profile: '가격대별 매물', profileNote: '막대를 누르면 해당 가격대의 전체 채널 매물을 볼 수 있어요.',
    depth: '누적 판매 매물', depthNote: '해당 가격 이하에 관측된 판매 중 매물 수예요. 묶음 수량을 합산한 재고가 아니에요.',
    empty: '이 기간에 확인한 기록이 없어요. 더 긴 기간을 선택해 보세요.',
    noSeries: '선택한 상태의 가격 기록이 없어요.', noAsking: '이 기간에 확인한 판매 중 매물이 없어요.',
    sparse: '표본이 적어 가격 흐름을 판단하기 어려워요. 추가 기록이 쌓이면 함께 확인해 주세요.',
    interval: '관측 구간', change: '관측 구간 변동', notEnough: '비교할 시간 구간 부족', peak: '가장 많은 가격대', tied: '{n}개 가격대 동률',
    count: '관측 매물', unit: '건', price: '메소', median: '중앙값', range: '최저~최고',
    inspect: '그래프를 누르거나 Tab 키로 이동하면 구간별 수치를 볼 수 있어요.',
    profileScope: '판매 중 · 최근 {h}시간 · {n}건', table: '시간 구간별 수치 보기', time: '확인 시각',
    accumulated: '이하 누적', none: '기록 없음', cap: '최근 {n}개 기록만 표시해요.',
    selected: '선택한 가격대', clear: '가격대 해제', amount: '관측 매물 수'
  },
  en: {
    title: tx('Price trends & listing depth'), period: tx('Time range'), periods: [tx('1h'), tx('6h'), tx('24h'), tx('7d')],
    both: tx('Compare'), asking: tx('Asking'), sold: tx('Sold'), series: tx('Price series'),
    trend: tx('Price trend'), trendNote: tx('Median per time interval · whiskers: low–high · lower bars: observed listings'),
    basis: tx('Based on each listing’s last observation. Sold prices are observed prices, not verified trade times or trading volume.'),
    profile: tx('Listings by price'), profileNote: tx('Select a bar to view listings in that price band across all channels.'),
    depth: tx('Cumulative asking listings'), depthNote: tx('Observed asking listings at or below a price. Counts listings, not the quantity of items in stock.'),
    empty: tx('No observations in this period. Try a longer time range.'),
    noSeries: tx('No prices observed for this status.'), noAsking: tx('No asking listings observed in this period.'),
    sparse: tx('Too few observations to establish a price trend. Check again as more records arrive.'),
    interval: tx('Observed interval'), change: tx('Change across observed interval'), notEnough: tx('Not enough time intervals'), peak: tx('Largest price band'), tied: tx('{n} price bands tied'),
    count: tx('Observed listings'), unit: tx('listings'), price: tx('mesos'), median: tx('Median'), range: tx('Low–high'),
    inspect: tx('Select the chart or use Tab to inspect each interval.'),
    profileScope: tx('Asking · last {h}h · {n} listings'), table: tx('View interval data'), time: tx('Observed at'),
    accumulated: tx('or less, cumulative'), none: tx('No observations'), cap: tx('Showing only the latest {n} records. This may not represent the entire market.'),
    selected: tx('Selected price band'), clear: tx('Clear price band'), amount: tx('Observed listings')
  }
};
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The UI owns one observer and one delegated listener set; clean up before switching items.
export function mountMarketCharts(root, rows, { lang = 'ko', now = Date.now(), truncated = false, limit = 400, profileRows = rows, persistent = false, profileTruncated = false, onBand = null } = {}) {
  const t = { ...(COPY[lang] || COPY.en), ...(persistent ? (lang === 'ko'
    ? { asking: '판매가 관측', sold: '판매 완료 관측', count: '관측 기록', amount: '관측 기록 수' }
    : { asking: tx('Observed asks'), sold: tx('Observed sold'), count: tx('Observations'), amount: tx('Observations') }) : {}) };
  const nf = new Intl.NumberFormat(lang);
  // Korean readers get Korea Standard Time regardless of device clock; other languages use the viewer's zone.
  const zone = lang === 'ko' ? { timeZone: 'Asia/Seoul' } : {};
  const date = new Intl.DateTimeFormat(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, ...zone });
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hour12: false, ...zone });
  const compact = new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 });
  const price = (n) => nf.format(n);
  const bandName = (b) => b.from === b.to ? price(b.from) : `${price(b.from)}–${price(b.to)}`;
  const stamp = (n) => date.format(n);
  const intervalName = (b) => `${stamp(b.from)}–${new Date(b.from).toDateString() === new Date(b.to).toDateString() ? time.format(b.to) : stamp(b.to)}`;
  const count = (n) => `${nf.format(n)} ${t.unit}`;
  let hours = 24, series = 'both', selectedBand = null;
  let analysis, width = 0;
  root.innerHTML = `<section class="market-analysis" aria-labelledby="analysis-title">
    <div class="analysis-heading"><h3 id="analysis-title">${t.title}</h3><div class="chart-segments" role="group" aria-label="${t.period}">${PERIODS.map((h, i) => `<button type="button" data-period="${h}" aria-pressed="${h === hours}">${t.periods[i]}</button>`).join('')}</div></div>
    <p class="analysis-basis">${persistent ? (lang === 'ko' ? '추이는 저장된 관측 이력, 매물대는 최근 24시간에 확인한 판매 중 매물 기준이에요.' : tx('Trends use retained observations; depth uses distinct asking listings seen in the last 24h.')) : t.basis}</p>
    ${truncated ? `<p class="analysis-warning">${t.cap.replace('{n}', limit)}</p>` : ''}
    ${profileTruncated ? `<p class="analysis-warning">${lang === 'ko' ? '매물대는 낮은 가격순 10,000건까지 집계했어요. 전체 매물은 목록에서 확인하세요.' : tx('Depth includes the 10,000 lowest-priced listings. Browse the list for all records.')}</p>` : ''}
    <div data-analysis-body></div>
  </section>`;
  const body = root.querySelector('[data-analysis-body]');
  const metric = (kind) => {
    const v = analysis[kind], c = analysis.changes[kind];
    return `<div class="analysis-metric ${kind}"><span>${t[kind]} · ${t.median}</span><strong>${v ? price(v.median) : '—'} <small>${t.price}</small></strong><span>${t.change} <b>${c ? `${c.percent > 0 ? '+' : ''}${nf.format(Math.round(c.percent * 10) / 10)}%` : '—'}</b></span><small>${c ? `${price(c.from)} → ${price(c.to)}` : t.notEnough} · ${count(v?.n || 0)}</small></div>`;
  };
  const pointText = (b) => `${intervalName(b)} · ${['asking', 'sold'].filter((k) => series === 'both' || series === k).map((k) => `${t[k]}: ${b[k] ? `${t.median} ${price(b[k].median)} (${t.range} ${price(b[k].low)}–${price(b[k].high)}), ${count(b[k].n)}` : t.none}`).join(' · ')}`;

  function trendSvg(w) {
    const buckets = analysis.buckets;
    const kinds = ['asking', 'sold'].filter((k) => series === 'both' || series === k);
    const points = buckets.flatMap((b) => kinds.flatMap((k) => b[k] ? [b[k]] : []));
    if (!points.length) return `<p class="chart-empty">${t.noSeries}</p>`;
    const h = 282, left = 54, right = w - 16, top = 16, bottom = 178;
    const low = Math.min(...points.map((p) => p.low)), high = Math.max(...points.map((p) => p.high));
    const margin = (high - low || high * 0.1 || 1) * 0.16;
    const min = Math.max(0, low - margin), max = high + margin;
    const x = (v) => left + (v - analysis.from) / (analysis.to - analysis.from) * (right - left);
    const y = (v) => bottom - (v - min) / (max - min) * (bottom - top);
    const step = (right - left) / buckets.length;
    const grid = [0, 0.5, 1].map((f) => {
      const v = min + f * (max - min);
      return `<line class="grid" x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${compact.format(Math.round(v))}</text>`;
    }).join('');
    const paths = kinds.map((kind) => {
      let d = '', marks = '';
      buckets.forEach((b, i) => {
        const p = b[kind]; if (!p) return;
        const px = x(b.t), py = y(p.median);
        d += `${buckets[i - 1]?.[kind] ? 'L' : 'M'}${px},${py}`;
        marks += `<line class="price-whisker ${kind}" x1="${px}" x2="${px}" y1="${y(p.high)}" y2="${y(p.low)}"/>`;
        marks += kind === 'asking' ? `<circle class="price-point asking" cx="${px}" cy="${py}" r="4"/>` : `<rect class="price-point sold" x="${px - 4}" y="${py - 4}" width="8" height="8"/>`;
      });
      return `<path class="price-line ${kind}" d="${d}"/>${marks}`;
    }).join('');
    const maxCount = Math.max(...buckets.map((b) => kinds.reduce((n, k) => n + (b[k]?.n || 0), 0)));
    const bars = buckets.map((b) => {
      let base = 244;
      return kinds.map((kind) => {
        const height = (b[kind]?.n || 0) / maxCount * 32; base -= height;
        return `<rect class="observation-bar ${kind}" x="${x(b.t) - Math.min(26, step * .6) / 2}" y="${base}" width="${Math.min(26, step * .6)}" height="${height}"/>`;
      }).join('');
    }).join('');
    const indexes = [...new Set([0, ...(w > 480 ? [Math.floor((buckets.length - 1) / 2)] : []), buckets.length - 1])];
    const labels = indexes.map((i) => `<text class="axis" x="${x(buckets[i].t)}" y="269" text-anchor="middle">${analysis.to - analysis.from > 24 * HOUR ? new Intl.DateTimeFormat(lang, { month: 'numeric', day: 'numeric', ...zone }).format(buckets[i].t) : time.format(buckets[i].t)}</text>`).join('');
    const hits = buckets.map((b, i) => `<rect class="chart-hit" data-bucket="${i}" x="${x(b.from)}" y="${top}" width="${step}" height="230" tabindex="0" role="button" aria-label="${escape(pointText(b))}"/>`).join('');
    return `<svg class="chart analytics-svg" viewBox="0 0 ${w} ${h}" role="group" aria-label="${t.trend}">${grid}${paths}<text class="axis" x="${left}" y="203">${t.amount}</text><text class="axis" x="${left - 8}" y="221" text-anchor="end">${maxCount}</text>${bars}${labels}${hits}</svg>`;
  }

  function depthSvg(w) {
    const levels = analysis.profile.levels;
    if (!levels.length) return `<p class="chart-empty">${t.noAsking}</p>`;
    const h = 226, left = 38, right = w - 18, top = 20, bottom = 184;
    const low = levels[0].price, high = levels.at(-1).price;
    const spread = high - low || Math.max(1, high * .1);
    const min = Math.max(0, low - spread * .08), max = high + spread * .08;
    const total = analysis.profile.total;
    const x = (v) => left + (v - min) / (max - min) * (right - left);
    const y = (n) => bottom - n / total * (bottom - top);
    let d = `M${left},${bottom}`;
    for (const level of levels) d += `H${x(level.price)}V${y(level.cumulative)}`;
    d += `H${right}`;
    const grid = [...new Set([0, Math.round(total / 2), total])].map((n) => `<line class="grid" x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}"/><text class="axis" x="${left - 8}" y="${y(n) + 4}" text-anchor="end">${n}</text>`).join('');
    const labels = [...new Set([low, high])].map((v) => `<text class="axis" x="${x(v)}" y="212" text-anchor="${low === high ? 'middle' : v === low ? 'start' : 'end'}">${compact.format(v)}</text>`).join('');
    // Each exact price level is a touch/keyboard target, including single-price datasets.
    const hits = levels.map((p, i) => `<circle class="depth-point" cx="${x(p.price)}" cy="${y(p.cumulative)}" r="4"/><circle class="depth-hit" data-depth="${i}" cx="${x(p.price)}" cy="${y(p.cumulative)}" r="12" tabindex="0" role="button" aria-label="${price(p.price)} ${t.accumulated} ${count(p.cumulative)}"/>`).join('');
    return `<svg class="chart analytics-svg" viewBox="0 0 ${w} ${h}" role="group" aria-label="${t.depth}">${grid}<path class="depth-area" d="${d}V${bottom}Z"/><path class="price-line asking" d="${d}"/>${labels}${hits}</svg>`;
  }

  function draw() {
    const plot = body.querySelector('[data-trend]');
    if (plot) plot.innerHTML = trendSvg(Math.max(250, plot.clientWidth));
    const depth = body.querySelector('[data-depth-chart]');
    if (depth) depth.innerHTML = depthSvg(Math.max(250, depth.clientWidth));
  }

  function render() {
    analysis = analyzeMarket(rows, { now, hours, profileRows });
    root.querySelectorAll('[data-period]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.period) === hours)));
    if (!analysis.rows.length) { body.innerHTML = `<p class="chart-empty">${t.empty}</p>`; return; }
    const p = analysis.profile;
    const peak = p.peak;
    const tied = peak ? p.bins.filter((b) => b.count === peak.count).length : 0;
    const scope = t.profileScope.replace('{h}', analysis.profileHours).replace('{n}', p.total);
    const biggest = Math.max(1, ...p.bins.map((b) => b.count));
    body.innerHTML = `<div class="analysis-metrics">${metric('asking')}${metric('sold')}</div>
      <div class="chart-card trend-card"><div class="analysis-heading"><h4>${t.trend}</h4><div class="chart-segments series-segments" role="group" aria-label="${t.series}">${['both', 'asking', 'sold'].map((k) => `<button type="button" data-series="${k}" aria-pressed="${series === k}">${k === 'both' ? '' : `<i class="legend-mark ${k}" aria-hidden="true"></i>`}${t[k]}</button>`).join('')}</div></div>
      <p class="chart-caption">${t.trendNote}</p><p class="chart-interval">${t.interval}: ${stamp(analysis.first)} → ${stamp(analysis.last)}</p>
      <div data-trend></div><p class="chart-inspector" data-trend-inspect aria-live="polite">${t.inspect}</p>
      ${(series === 'both' ? analysis.rows.length < 3 || !analysis.changes.asking && !analysis.changes.sold : (analysis[series]?.n || 0) < 3 || !analysis.changes[series]) ? `<p class="analysis-warning">${t.sparse}</p>` : ''}
      <details class="chart-data"><summary>${t.table}</summary><div class="mk-where"><table><thead><tr><th>${t.time}</th><th>${t.asking} · ${t.median}</th><th>${t.sold} · ${t.median}</th><th>${t.count}</th></tr></thead><tbody>${analysis.buckets.map((b) => `<tr><td>${intervalName(b)}</td><td>${b.asking ? price(b.asking.median) : '—'}</td><td>${b.sold ? price(b.sold.median) : '—'}</td><td>${b.rows.length}</td></tr>`).join('')}</tbody></table></div></details></div>
      <p class="profile-scope">${scope}</p><div class="analysis-distributions">
      <div class="chart-card"><h4>${t.profile}</h4><p class="chart-caption">${onBand ? t.profileNote : (lang === 'ko' ? '가격 구간별로 확인한 판매 매물 수예요.' : tx('Observed asking listings in each price band.'))}</p>
      ${peak ? `<p class="profile-peak"><span>${t.peak}</span><strong>${tied > 1 ? t.tied.replace('{n}', tied) : bandName(peak)}</strong><span>${count(peak.count)} · ${Math.round(peak.share * 100)}%</span></p>` : ''}
      <div class="price-profile">${p.bins.map((b, i) => `<${onBand ? 'button type="button"' : 'div'} class="profile-band" ${onBand ? `data-band="${i}" aria-pressed="${selectedBand === i}" ${b.count ? '' : 'disabled'}` : ''}><span class="profile-label">${bandName(b)}<small>${count(b.count)} · ${Math.round(b.count / p.total * 100)}%</small></span><span class="profile-track"><span style="width:${b.count / biggest * 100}%"></span></span></${onBand ? 'button' : 'div'}>`).join('') || `<p class="chart-empty">${t.noAsking}</p>`}</div><p class="chart-caption">${t.price}</p>
      <button type="button" class="btn ghost small-btn" data-clear-band ${selectedBand == null ? 'hidden' : ''}>${t.clear}</button></div>
      <div class="chart-card"><h4>${t.depth}</h4><p class="chart-caption">${t.depthNote}</p><div data-depth-chart></div><p class="chart-inspector" data-depth-inspect aria-live="polite">${p.total ? `${price(p.levels.at(-1).price)} ${t.accumulated} ${count(p.total)}` : t.none}</p><p class="chart-caption">${t.price}</p></div></div>`;
    draw();
  }
  function pickBand(index) {
    selectedBand = index;
    root.querySelectorAll('[data-band]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.band) === index)));
    root.querySelector('[data-clear-band]').hidden = index == null;
    const band = index == null ? null : analysis.profile.bins[index];
    onBand?.(band ? { ...band, fromTime: now - analysis.profileHours * HOUR, label: `${t.selected}: ${bandName(band)} · ${scopeLabel()}` } : null);
  }
  const scopeLabel = () => t.profileScope.replace('{h}', analysis.profileHours).replace('{n}', analysis.profile.total);
  function inspect(target) {
    if (target.matches('[data-bucket]')) body.querySelector('[data-trend-inspect]').textContent = pointText(analysis.buckets[Number(target.dataset.bucket)]);
    if (target.matches('[data-depth]')) {
      const p = analysis.profile.levels[Number(target.dataset.depth)];
      body.querySelector('[data-depth-inspect]').textContent = `${price(p.price)} ${t.accumulated} ${count(p.cumulative)} · ${Math.round(p.cumulative / analysis.profile.total * 100)}%`;
    }
  }
  function click(e) {
    const target = e.target.closest('button, [data-bucket], [data-depth]');
    if (!target) return;
    if (target.hasAttribute('data-period')) { hours = Number(target.dataset.period); selectedBand = null; onBand?.(null); render(); }
    else if (target.hasAttribute('data-series')) { series = target.dataset.series; render(); root.querySelector(`[data-series="${series}"]`).focus({ preventScroll: true }); }
    else if (target.hasAttribute('data-band')) pickBand(selectedBand === Number(target.dataset.band) ? null : Number(target.dataset.band));
    else if (target.hasAttribute('data-clear-band')) { pickBand(null); root.querySelector('[data-band]')?.focus({ preventScroll: true }); }
    else inspect(target);
  }
  const focus = (e) => inspect(e.target);
  const key = (e) => { if (e.target.matches('[data-bucket], [data-depth]') && ['Enter', ' '].includes(e.key)) { e.preventDefault(); inspect(e.target); } };
  root.addEventListener('click', click);
  root.addEventListener('focusin', focus);
  root.addEventListener('pointerover', focus);
  root.addEventListener('keydown', key);
  render();
  const resize = new ResizeObserver(() => { const next = root.clientWidth; if (next !== width) { width = next; draw(); } });
  resize.observe(root);
  return { clearBand: () => pickBand(null), destroy() { resize.disconnect(); root.removeEventListener('click', click); root.removeEventListener('focusin', focus); root.removeEventListener('pointerover', focus); root.removeEventListener('keydown', key); } };
}
