// What the Discord bot does with its own token (DISCORD_BOT_TOKEN, a worker secret; without it these are no-ops):
// megaphone alerts by DM (/alert) and feedback relayed into the GMS Hub server's feedback channel (/feedback).
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

export async function addAlert(env, userId, item, intent, locale) {
  const have = await env.DB.prepare('SELECT item FROM discord_alerts WHERE user_id = ?').bind(userId).all();
  if (!have.results.some((r) => r.item === item) && have.results.length >= MAX_ALERTS) return { full: true };
  const channel = await dmChannel(env, userId);
  await env.DB.prepare('INSERT OR REPLACE INTO discord_alerts (user_id, item, intent, locale, dm_channel) VALUES (?, ?, ?, ?, ?)').bind(userId, item, intent, locale, channel).run();
  return { channel };
}
export const listAlerts = async (env, userId) => (await env.DB.prepare('SELECT item, intent FROM discord_alerts WHERE user_id = ? ORDER BY created_at').bind(userId).all()).results;
export const removeAlert = async (env, userId, item) => (await env.DB.prepare('DELETE FROM discord_alerts WHERE user_id = ? AND item = ?').bind(userId, item).run()).meta.changes > 0;

// Called with the megaphones just ingested (already parsed: item, intent). Reads only the alert rows of the items named,
// so with no alerts set it costs nothing. At most 10 DMs a batch, and one notice per user and item in 10 minutes.
export async function notifyMegaphones(env, rows, nameOf) {
  const named = rows.filter((r) => r.item);
  if (!env.DISCORD_BOT_TOKEN || !named.length) return 0;
  const ids = [...new Set(named.map((r) => r.item))];
  const { results } = await env.DB.prepare(`SELECT user_id, item, intent, locale, dm_channel FROM discord_alerts WHERE item IN (${ids.map(() => '?').join(',')}) AND dm_channel IS NOT NULL AND (sent_at IS NULL OR sent_at < datetime('now', '-10 minutes'))`).bind(...ids).all();
  let sent = 0;
  for (const a of results) {
    if (sent >= 10) break;
    const row = named.find((r) => r.item === a.item && (a.intent === 'any' || r.intent === a.intent));
    if (!row) continue;
    const ko = a.locale === 'ko', name = nameOf(a.item) || `#${a.item}`;
    const what = row.intent === 'sell' ? (ko ? '팝니다' : 'selling') : row.intent === 'buy' ? (ko ? '삽니다' : 'buying') : (ko ? '확성기' : 'megaphone');
    const url = `https://gms-hub.com/${ko ? 'ko' : 'en'}/tools/market/?item=${a.item}&utm_source=discord&utm_medium=alert`;
    const content = `🔔 **${name}** · ${what}\n${row.channel ? `CH ${row.channel} · ` : ''}**${row.nick}** ${code(row.text)}\n${ko ? '귓속말' : 'Whisper'}: ${code(`/w ${row.nick} `)}\n<${url}>`;
    if (await sendDm(env, a.dm_channel, content)) {
      sent++;
      await env.DB.prepare("UPDATE discord_alerts SET sent_at = datetime('now') WHERE user_id = ? AND item = ?").bind(a.user_id, a.item).run();
    }
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
