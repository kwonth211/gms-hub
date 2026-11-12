// Price alerts by Web Push. A visitor's browser subscribes (its push endpoint) and watches an item below a price. Every
// scheduled run looks for open listings at or under each watched price, records the hits and sends an empty push signed
// with the site's VAPID key; the service worker (assets/sw.js) then fetches its unseen hits and shows them. Sending no
// payload means no message encryption is needed. Subscriptions that the push service reports gone are deleted.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|push\.services\.mozilla\.com)$/;
const MAX_PER_BROWSER = 30;
// After an alert fires it rests this long, so a cheap listing that stays up does not ring every 15 minutes.
const REST = '-6 hours';

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (s) => new TextEncoder().encode(s);

function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && endpoint.length < 1000;
  } catch {
    return false;
  }
}

export async function createAlert(env, body) {
  const { endpoint, keys, item, price, name, lang } = body || {};
  if (!validEndpoint(endpoint)) return [{ error: 'bad endpoint' }, 400];
  const id = Number(item), p = Math.round(Number(price));
  if (!Number.isInteger(id) || id < 1000000 || id > 9999999 || !(p >= 1 && p <= 1e10)) return [{ error: 'bad item or price' }, 400];
  const label = String(name || '').slice(0, 80) || `#${id}`;
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM alerts WHERE endpoint=?').bind(endpoint).first('n');
  const existing = await env.DB.prepare('SELECT id FROM alerts WHERE endpoint=? AND item=?').bind(endpoint, id).first('id');
  if (!existing && count >= MAX_PER_BROWSER) return [{ error: 'too many alerts' }, 429];
  await env.DB.prepare(`INSERT INTO alerts (endpoint, p256dh, auth, item, name, price, lang) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT (endpoint, item) DO UPDATE SET price=excluded.price, name=excluded.name, lang=excluded.lang, fired_at=NULL`)
    .bind(endpoint, keys?.p256dh || null, keys?.auth || null, id, label, p, ['ko', 'en', 'zh', 'ja'].includes(lang) ? lang : 'en').run();
  return [{ ok: true }, 200];
}

export async function listAlerts(env, endpoint) {
  if (!validEndpoint(endpoint)) return [{ error: 'bad endpoint' }, 400];
  const { results } = await env.DB.prepare('SELECT item, name, price, fired_at AS fired FROM alerts WHERE endpoint=? ORDER BY created_at DESC').bind(endpoint).all();
  return [{ alerts: results }, 200];
}

export async function deleteAlert(env, endpoint, item) {
  if (!validEndpoint(endpoint)) return [{ error: 'bad endpoint' }, 400];
  await env.DB.prepare('DELETE FROM alerts WHERE endpoint=? AND item=?').bind(endpoint, Number(item)).run();
  return [{ ok: true }, 200];
}

// The service worker's read: unseen hits for this browser, newest first, then marked seen.
export async function takeHits(env, endpoint) {
  if (!validEndpoint(endpoint)) return [{ error: 'bad endpoint' }, 400];
  const { results } = await env.DB.prepare('SELECT id, item, name, price, channel, room, seller, lang, at FROM alert_hits WHERE endpoint=? AND seen=0 ORDER BY id DESC LIMIT 5').bind(endpoint).all();
  if (results.length) await env.DB.prepare(`UPDATE alert_hits SET seen=1 WHERE endpoint=? AND id IN (${results.map(() => '?').join(',')})`).bind(endpoint, ...results.map((r) => r.id)).run();
  return [{ hits: results }, 200];
}

async function vapidHeader(env, endpoint) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(text(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:kwonth211@gmail.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${env.VAPID_PUBLIC}`;
}

// Scheduled: match watched prices against listings seen in the last 30 minutes.
export async function checkAlerts(env) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return { sent: 0 };
  // With no alerts registered (the feature is off) the listings join is never run.
  if (!(await env.DB.prepare('SELECT 1 FROM alerts LIMIT 1').first())) return { sent: 0 };
  const { results } = await env.DB.prepare(`SELECT a.id, a.endpoint, a.item, a.name, a.price AS want, a.lang, l.price, l.channel, l.room, l.seller
    FROM alerts a JOIN listings l ON l.item = a.item AND l.sold = 0 AND l.last_seen >= datetime('now', '-30 minutes') AND l.price <= a.price
    WHERE a.fired_at IS NULL OR a.fired_at < datetime('now', '${REST}')
    ORDER BY a.id, l.price ASC`).all();
  const best = new Map();
  for (const r of results) if (!best.has(r.id)) best.set(r.id, r);
  const byEndpoint = new Map();
  for (const r of best.values()) (byEndpoint.get(r.endpoint) || byEndpoint.set(r.endpoint, []).get(r.endpoint)).push(r);
  let sent = 0;
  for (const [endpoint, hits] of byEndpoint) {
    await env.DB.batch([
      ...hits.map((h) => env.DB.prepare('INSERT INTO alert_hits (endpoint, item, name, price, channel, room, seller, lang) VALUES (?,?,?,?,?,?,?,?)').bind(endpoint, h.item, h.name, h.price, h.channel, h.room, h.seller, h.lang)),
      ...hits.map((h) => env.DB.prepare("UPDATE alerts SET fired_at = datetime('now') WHERE id = ?").bind(h.id)),
    ]);
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(env, endpoint), TTL: '43200', Urgency: 'high', 'Content-Length': '0' } });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM alerts WHERE endpoint = ?').bind(endpoint).run();
      else if (r.ok) sent++;
    } catch {}
  }
  await env.DB.prepare("DELETE FROM alert_hits WHERE at < datetime('now', '-3 days')").run();
  return { sent };
}
