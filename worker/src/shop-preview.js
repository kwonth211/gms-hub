// Short shop links with a link preview (owner 2026-11-19): gms-hub.com/s/<name> (worker route). Link-preview crawlers
// (Discord, KakaoTalk, Slack, X, Facebook, Telegram, LINE) get a small page whose Open Graph tags list what the seller has
// on sale now; everyone else is sent to the shop page (/<lang>/shop/?n=<name>). One indexed read (the listings unique
// key starts with seller), cached at the edge for 5 minutes.
const BOTS = /discordbot|kakaotalk|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|whatsapp|line\/|linkedinbot|skypeuripreview|bot.*preview|embedly|pinterest|naver|daum|yeti/i;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = (n) => Number(n).toLocaleString('en-US');
const won = (n, ko) => (ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf(n)) : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : nf(n));
const place = (ch, room, ko) => `CH ${ch} · ${room === 101 ? (ko ? '커닝 공사장' : 'Kerning Construction Site') : `FM ${room}`}`;

export function shopPreviewHtml({ name, rows, ko, url, image, nameOf }) {
  const newest = rows[0];
  const here = newest ? rows.filter((r) => r.channel === newest.channel && r.room === newest.room) : [];
  const top = [...here].sort((a, b) => b.price - a.price).slice(0, 8);
  const title = newest
    ? (ko ? `🛒 ${name}의 상점 · ${place(newest.channel, newest.room, ko)} · ${here.length}개 판매 중` : `🛒 ${name}'s shop · ${place(newest.channel, newest.room, ko)} · ${here.length} for sale`)
    : (ko ? `🛒 ${name}의 상점` : `🛒 ${name}'s shop`);
  const desc = top.length
    ? top.map((r) => `${nameOf(r.item, ko ? 'ko' : 'en') || nameOf(r.item) || `#${r.item}`} ${won(r.price, ko)}`).join(' · ') + (here.length > top.length ? (ko ? ` 외 ${here.length - top.length}개` : ` and ${here.length - top.length} more`) : '')
    : (ko ? '최근 24시간 안에 확인된 매물이 없어요. GMS Hub 상점 스캔으로 올리면 여기에 보여요.' : 'No listings seen in the last 24 hours. Upload the shop with GMS Hub Shop Scan to show it here.');
  return `<!doctype html><html lang="${ko ? 'ko' : 'en'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="robots" content="noindex"><meta property="og:type" content="website"><meta property="og:site_name" content="GMS Hub">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<meta name="theme-color" content="#ff8a1f"><meta http-equiv="refresh" content="0;url=${esc(url)}"></head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`;
}

export async function handleShopLink(req, env, ctx, nameOf) {
  const u = new URL(req.url);
  const name = decodeURIComponent(u.pathname.split('/')[2] || '');
  // ?lang=en from English pages; Korean otherwise (most shop owners are Korean players).
  const lang = u.searchParams.get('lang') === 'en' ? 'en' : 'ko';
  const target = `https://gms-hub.com/${lang}/shop/?n=${encodeURIComponent(name)}&utm_source=share&utm_medium=shop-link`;
  if (!/^[A-Za-z0-9]{4,13}$/.test(name)) return Response.redirect(`https://gms-hub.com/${lang}/shop/`, 302);
  if (!BOTS.test(req.headers.get('User-Agent') || '')) return Response.redirect(target, 302);
  const key = new Request(`https://gms-hub.com/__shop-preview/${lang}/${name}`);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const since = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const { results } = await env.DB.prepare('SELECT item, price, qty, channel, room, last_seen FROM listings WHERE seller = ? AND sold = 0 AND last_seen >= ? ORDER BY last_seen DESC LIMIT 200').bind(name, since).all();
  const html = shopPreviewHtml({ name, rows: results, ko: lang === 'ko', url: target, image: `https://gms-hub.com/assets/brand/discord-bot.png`, nameOf });
  const res = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}
