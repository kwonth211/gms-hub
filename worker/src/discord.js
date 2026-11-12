// Feeds for the GMS Hub Discord server through channel webhooks (worker secrets, optional: without them nothing is sent).
// DISCORD_TRENDS_WEBHOOK gets a summary of the megaphone trend snapshot four times a day. megaphonesToDiscord can relay
// megaphones to DISCORD_MEGA_WEBHOOK; relaying every megaphone was tried and dropped (a copy of the game chat is noise), so
// nothing calls it now; it is kept for item alerts. Megaphone text is written by players, so it goes out as inline
// code with mentions and link previews off.
const MARK = { super: '📣', item: '🟡', double: '🟢', mega: '📢' };
const code = (s) => '`' + String(s).replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';
export const megaphoneLine = (r) => `${MARK[r.kind] || '📢'} ${r.channel ? `CH ${r.channel} · ` : ''}**${r.nick}** ${code(r.text)}`;

// Discord takes 2,000 characters a message: lines are packed into as few messages as fit.
export function pack(lines, max = 1900) {
  const out = [];
  let cur = '';
  for (const line of lines) {
    if (cur && cur.length + 1 + line.length > max) { out.push(cur); cur = ''; }
    cur = cur ? `${cur}\n${line}` : line.slice(0, max);
  }
  if (cur) out.push(cur);
  return out;
}

// flags: 4 = no link previews, 4096 = no notification sound for a feed.
const send = (url, content) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content, allowed_mentions: { parse: [] }, flags: 4 | 4096 }) }).catch(() => null);

export async function megaphonesToDiscord(env, rows) {
  if (!env.DISCORD_MEGA_WEBHOOK || !rows.length) return;
  for (const content of pack(rows.map(megaphoneLine))) await send(env.DISCORD_MEGA_WEBHOOK, content);
}

export function trendMessage(stats, nameOf) {
  const name = (id) => nameOf(id) || `#${id}`;
  const n = (x) => Number(x || 0).toLocaleString('en-US');
  const top = (stats.items || []).slice(0, 8), wanted = (stats.wanted || []).slice(0, 5);
  if (!top.length) return null;
  return [
    '**확성기 트렌드 · Megaphone trends** (지난 24시간 · last 24 hours)',
    `확성기 ${n(stats.today?.n)}개, 부른 사람 ${n(stats.today?.nicks)}명 · ${n(stats.today?.n)} megaphones from ${n(stats.today?.nicks)} players`,
    '',
    '**많이 불린 아이템 · Most called items**',
    ...top.map((r, i) => `${i + 1}. ${name(r.item)}: 팝니다/sell ${n(r.sell)}, 삽니다/buy ${n(r.buy)} (전날/day before ${n(r.before)})`),
    ...(wanted.length ? ['', '**사려는 사람이 더 많은 아이템 · More buyers than sellers**', ...wanted.map((r) => `- ${name(r.item)}: 삽니다/buy ${n(r.buy)}, 팝니다/sell ${n(r.sell)}`)] : []),
    '',
    '실시간 확성기와 시세 · Live megaphones and prices: <https://gms-hub.com/ko/megaphone/> · <https://gms-hub.com/en/megaphone/>',
  ].join('\n').slice(0, 1990);
}

export async function trendsToDiscord(env, stats, nameOf) {
  if (!env.DISCORD_TRENDS_WEBHOOK) return;
  const content = trendMessage(stats, nameOf);
  if (content) await send(env.DISCORD_TRENDS_WEBHOOK, content);
}
