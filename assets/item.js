import { DAY, parseUtc } from './market-data.js';
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

Promise.all([
  fetch(`${D.api}/market/listings?item=${D.id}&state=open&sort=price&limit=10`).then(r=>r.ok?r.json():null),
  fetch(`${D.api}/market/history?id=${D.id}`).then(r=>r.ok?r.json():null)
]).catch(()=>[null,null]).then(([listings, history])=>{
  if (!listings) { box.innerHTML = `<p class="muted">${T.failed}</p>`; return; }
  box.innerHTML = listings.rows.length ? `<p class="muted note">${D.lang==='ko'?`판매 매물 ${listings.total}건 중 낮은 가격순 ${listings.rows.length}건`:`${listings.rows.length} lowest asks of ${listings.total} listings`}</p>${table(listings.rows)}` : `<p class="muted">${T.noOpen}</p>`;
  if(history){const normalize=rs=>rs.map(r=>({...r,sold:!!r.sold,t:parseUtc(r.seen)}));mountMarketCharts(charts,normalize(history.rows),{lang:D.lang,now:Date.parse(history.asOf),profileRows:normalize(history.profile),persistent:true,truncated:history.truncated,profileTruncated:history.profileTruncated,limit:history.limit});}
  else charts.innerHTML=`<p class="muted">${T.failed}</p>`;
});
