// What the Discord bot does with its own token (DISCORD_BOT_TOKEN, a worker secret; without it these are no-ops):
// megaphone and price alerts by DM (/alert) and feedback relayed into the GMS Hub server's feedback channel (/feedback).
const API = 'https://discord.com/api/v10';
const call = (env, method, path, body) => fetch(`${API}${path}`, { method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const code = (s) => '`' + String(s).replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';
export const MAX_ALERTS = 10;

// Returns the DM channel id, or null when the user cannot be reached (no shared server and the app is not on their account).
export async function dmChannel(env, userId) {
  if (!env.DISCORD_BOT_TOKEN) return null;
  const r = await call(env, 'POST', '/users/@me/channels', { recipient_id: userId }).catch(() => null);
  return r?.ok ? (await r.json()).id : null;
}
export async function sendDm(env, channel, content) {
  if (!env.DISCORD_BOT_TOKEN || !channel) return false;
  const r = await call(env, 'POST', `/channels/${channel}/messages`, { content, allowed_mentions: { parse: [] }, flags: 4 }).catch(() => null);
  return Boolean(r?.ok);
}

export async function addAlert(env, userId, item, intent, locale, price = null) {
  const have = await env.DB.prepare('SELECT item FROM discord_alerts WHERE user_id = ?').bind(userId).all();
  if (!have.results.some((r) => r.item === item) && have.results.length >= MAX_ALERTS) return { full: true };
  const channel = await dmChannel(env, userId);
  await env.DB.prepare('INSERT OR REPLACE INTO discord_alerts (user_id, item, intent, locale, dm_channel, price) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, item, intent, locale, channel, price).run();
  return { channel };
}
export const listAlerts = async (env, userId) => (await env.DB.prepare('SELECT item, intent, price FROM discord_alerts WHERE user_id = ? ORDER BY created_at').bind(userId).all()).results;
export const removeAlert = async (env, userId, item) => (await env.DB.prepare('DELETE FROM discord_alerts WHERE user_id = ? AND item = ?').bind(userId, item).run()).meta.changes > 0;

// "3m", "2.5M", "500k", "1,200,000", "1.5b", "300만", "1억 2천만" → mesos (null when it is not an amount).
export function parseAmount(text) {
  const t = String(text ?? '').toLowerCase().replace(/[,\s]/g, '').replace(/메소|meso(s)?$/g, '');
  if (!t) return null;
  let n = null;
  if (/[억만천]/.test(t)) {
    // "1억2천만" = 1 × 10^8 + 2,000 × 10^4; each group may carry 천 (thousands) inside it.
    const group = (g) => { if (!g) return 0; const m = g.match(/^(?:(\d+(?:\.\d+)?)천)?(\d+(?:\.\d+)?)?$/); return m ? (+m[1] || 0) * 1e3 + (+m[2] || 0) : NaN; };
    const [eok, rest = ''] = t.includes('억') ? t.split('억') : ['', t];
    const [man, one = ''] = rest.includes('만') ? rest.split('만') : ['', rest];
    n = (eok === '' ? 0 : group(eok)) * 1e8 + group(man) * 1e4 + group(one);
    if (!Number.isFinite(n) || (t.includes('억') && eok === '')) return null;
  } else {
    const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
    if (!m) return null;
    n = +m[1] * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
  }
  n = Math.round(n);
  return n >= 1 && n <= 1e10 ? n : null;
}
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
export const priceLabel = (price, intent, ko) => price == null ? '' : intent === 'buy' ? (ko ? `${short(price)} 이상` : `${short(price)} or more`) : (ko ? `${short(price)} 이하` : `${short(price)} or less`);
// The asking price fits the alert: a seller at or below it, or (for buy alerts) a buyer offering at least it.
const fits = (a, intent, price) => a.price == null || (price != null && (a.intent === 'buy' ? intent === 'buy' && price >= a.price : intent !== 'buy' && price <= a.price));
// Megaphone alerts without a price: one notice per user and item in 10 minutes. Price alerts: at once when the price is lower
// (higher for buy alerts) than the last notice, otherwise again after 6 hours, so one shop seen on every run is not repeated.
const ago = (s) => (s ? Date.now() - Date.parse(`${String(s).replace(' ', 'T')}Z`) : Infinity);
function due(a, price) {
  if (a.price == null) return ago(a.sent_at) >= 600000;
  if (ago(a.sent_at) >= 6 * 3600000 || a.sent_price == null) return true;
  return a.intent === 'buy' ? price > a.sent_price : price < a.sent_price;
}
const marketUrl = (a) => `https://gms-hub.com/${a.locale === 'ko' ? 'ko' : 'en'}/tools/market/?item=${a.item}&utm_source=discord&utm_medium=alert`;
async function alertsFor(env, ids, where = '') {
  return (await env.DB.prepare(`SELECT user_id, item, intent, locale, dm_channel, price, sent_at, sent_price FROM discord_alerts WHERE item IN (SELECT value FROM json_each(?)) AND dm_channel IS NOT NULL${where}`).bind(JSON.stringify(ids)).all()).results;
}
async function deliver(env, a, content, price) {
  if (!(await sendDm(env, a.dm_channel, content))) return false;
  await env.DB.prepare("UPDATE discord_alerts SET sent_at = datetime('now'), sent_price = ? WHERE user_id = ? AND item = ?").bind(price ?? null, a.user_id, a.item).run();
  return true;
}

// Called with the megaphones just ingested (already parsed: item, intent, price). Reads only the alert rows of the items
// named, so with no alerts set it costs nothing. At most 10 DMs a batch.
export async function notifyMegaphones(env, rows, nameOf) {
  const named = rows.filter((r) => r.item);
  if (!env.DISCORD_BOT_TOKEN || !named.length) return 0;
  const results = await alertsFor(env, [...new Set(named.map((r) => r.item))]);
  let sent = 0;
  for (const a of results) {
    if (sent >= 10) break;
    const row = named.filter((r) => r.item === a.item && (a.intent === 'any' || r.intent === a.intent || (a.price != null && a.intent === 'sell' && r.intent !== 'buy')) && fits(a, r.intent, r.price))
      .sort((x, y) => (a.intent === 'buy' ? (y.price || 0) - (x.price || 0) : (x.price || Infinity) - (y.price || Infinity)))[0];
    if (!row || !due(a, row.price)) continue;
    const ko = a.locale === 'ko', name = nameOf(a.item) || `#${a.item}`;
    const what = row.intent === 'sell' ? (ko ? '팝니다' : 'selling') : row.intent === 'buy' ? (ko ? '삽니다' : 'buying') : (ko ? '확성기' : 'megaphone');
    const head = `🔔 **${name}** · ${what}${row.price ? ` **${short(row.price)}**` : ''}${a.price != null ? ` (${ko ? '알림' : 'alert'} ${priceLabel(a.price, a.intent, ko)})` : ''}`;
    const content = `${head}\n${row.channel ? `CH ${row.channel} · ` : ''}**${row.nick}** ${code(row.text)}\n${ko ? '귓속말' : 'Whisper'}: ${code(`/w ${row.nick} `)}\n<${marketUrl(a)}>`;
    if (await deliver(env, a, content, row.price)) sent++;
  }
  return sent;
}

// Called with the shop listings a collector run (or a site scan) just stored: item, price, seller, channel, room.
// Only price alerts on the selling side react, with the cheapest new listing of the item.
export async function notifyListings(env, rows, nameOf) {
  const priced = rows.filter((r) => r.item && r.price > 0 && !r.sold);
  if (!env.DISCORD_BOT_TOKEN || !priced.length) return 0;
  const results = await alertsFor(env, [...new Set(priced.map((r) => r.item))], " AND price IS NOT NULL AND intent != 'buy'");
  let sent = 0;
  for (const a of results) {
    if (sent >= 10) break;
    const row = priced.filter((r) => r.item === a.item && r.price <= a.price).sort((x, y) => x.price - y.price)[0];
    if (!row || !due(a, row.price)) continue;
    const ko = a.locale === 'ko', name = nameOf(a.item) || `#${a.item}`;
    const content = `🔔 **${name}** ${ko ? '상점 매물' : 'in a shop for'} **${short(row.price)}** (${ko ? '알림' : 'alert'} ${priceLabel(a.price, a.intent, ko)})\n`
      + `${ko ? '자유시장' : 'Free Market'} CH ${row.channel}${row.room != null ? ` · ${ko ? `${row.room}번 방` : `room ${row.room}`}` : ''} · ${ko ? '판매자' : 'seller'} **${row.seller}**\n<${marketUrl(a)}>`;
    if (await deliver(env, a, content, row.price)) sent++;
  }
  return sent;
}

// One piece of feedback a minute per user, per isolate: enough to stop a held-down key, not a determined spammer
// (the channel's moderators and Discord's own rate limits handle the rest).
const lastFeedback = new Map();
export async function relayFeedback(env, user, text, where) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_FEEDBACK_CHANNEL) return 'off';
  const now = Date.now();
  if (now - (lastFeedback.get(user.id) || 0) < 60000) return 'slow';
  lastFeedback.set(user.id, now);
  if (lastFeedback.size > 500) lastFeedback.clear();
  const body = String(text).replace(/\s+/g, ' ').trim().slice(0, 1000);
  const r = await call(env, 'POST', `/channels/${env.DISCORD_FEEDBACK_CHANNEL}/messages`, { allowed_mentions: { parse: [] }, flags: 4,
    content: `📝 **${String(user.global_name || user.username).replace(/[*_`~|>@]/g, '')}** (${user.username}, ${where})\n>>> ${body.replace(/`/g, "'")}` }).catch(() => null);
  return r?.ok ? 'ok' : 'fail';
}
