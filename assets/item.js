import { DAY, parseUtc, marketRows } from './market-data.js';
import { mountMarketCharts } from './market-charts.js';
// Item page: the price summary is baked into the HTML at build time; the trend charts and open shops load live here.
const D = JSON.parse(document.getElementById('it-data').textContent);
const T = D.t;
const nf = new Intl.NumberFormat(D.lang);
const rtf = new Intl.RelativeTimeFormat(D.lang, { numeric: 'auto', style: 'short' });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const box = document.getElementById('it-open');
const charts = document.getElementById('mk-charts');

function ago(utc) {
  const s = Math.max(0, (Date.now() - parseUtc(utc)) / 1000);
  if (s < 60) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < DAY / 1000) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}

const line = (r) =>
  `<tr><td class="num">${nf.format(r.price)}</td><td>${nf.format(r.qty)}</td><td>${esc(r.seller)}</td><td><span class="where">CH ${r.channel}</span> <span class="where">FM ${r.room}</span></td><td class="muted">${ago(r.seen)}</td></tr>`;
const table = (rs) =>
  `<div class="mk-where"><table><thead><tr><th>${T.table.price}</th><th>${T.table.qty}</th><th>${T.table.seller}</th><th>${T.table.where}</th><th>${T.table.seen}</th></tr></thead><tbody>${rs.map(line).join('')}</tbody></table></div>`;

fetch(`${D.api}/market/item?id=${D.id}`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null)
  .then((data) => {
    if (!data || !Array.isArray(data.listings)) {
      box.innerHTML = `<p class="muted">${T.failed}</p>`;
      return;
    }
    const now = Date.now();
    const { rows, open } = marketRows(data.listings, now);
    if (!rows.length) {
      box.innerHTML = `<p class="muted">${T.noData}</p>`;
      return;
    }
    mountMarketCharts(charts, rows, { lang: D.lang, now, truncated: data.truncated, limit: data.limit });
    box.innerHTML = open.length ? table(open.slice(0, 10)) : `<p class="muted">${T.noOpen}</p>`;
  });
