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

// Discord posts read as cards (owner 2026-11-18: the plain text was hard to read): embeds with emoji section heads,
// Korean item names, one link. Colours: brand orange for the market, megaphone yellow for trends.
const nf = (x) => Number(x || 0).toLocaleString('en-US');
// "1.8억", "45만", "3,500": the way Korean players write prices.
export const won = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf(n));
const rank = (i) => ['🥇', '🥈', '🥉'][i] || `\`${i + 1}\``;
const arrow = (now, before) => (before == null ? '' : now > before ? ' ↑' : now < before ? ' ↓' : '');

export function trendEmbed(stats, nameOf) {
  const name = (id) => nameOf(id, 'ko') || nameOf(id) || `#${id}`;
  const top = (stats.items || []).slice(0, 8), wanted = (stats.wanted || []).slice(0, 5);
  if (!top.length) return null;
  return {
    title: '📣 확성기 트렌드 · 지난 24시간',
    url: 'https://gms-hub.com/ko/megaphone/?utm_source=discord&utm_medium=trends',
    color: 0xf5b301,
    description: `확성기 **${nf(stats.today?.n)}**개 · 부른 사람 **${nf(stats.today?.nicks)}**명\n${nf(stats.today?.n)} megaphones from ${nf(stats.today?.nicks)} players`,
    fields: [
      { name: '🔥 많이 불린 아이템 · Most called', value: top.map((r, i) => `${rank(i)} **${name(r.item)}**  🟢 팝 ${nf(r.sell)} · 🔵 삽 ${nf(r.buy)}${arrow(r.sell + r.buy, r.before)}`).join('\n').slice(0, 1024) },
      ...(wanted.length ? [{ name: '🛒 사려는 사람이 더 많아요 · More buyers', value: wanted.map((r) => `• **${name(r.item)}**  삽 ${nf(r.buy)} / 팝 ${nf(r.sell)}`).join('\n').slice(0, 1024) }] : []),
    ],
    footer: { text: '🟢 팝니다 · 🔵 삽니다 · ↑↓ 전날보다 · gms-hub.com' },
    timestamp: new Date().toISOString(),
  };
}
// Kept for tests and as the text fallback.
export function trendMessage(stats, nameOf) {
  const e = trendEmbed(stats, nameOf);
  return e ? [`**${e.title}**`, e.description, ...e.fields.flatMap((f) => ['', `**${f.name}**`, f.value])].join('\n').slice(0, 1990) : null;
}

export async function trendsToDiscord(env, stats, nameOf) {
  if (!env.DISCORD_TRENDS_WEBHOOK) return;
  const embed = trendEmbed(stats, nameOf);
  if (embed) await fetch(env.DISCORD_TRENDS_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] }, flags: 4096 }) }).catch(() => null);
}

// Daily market summary for #시세-거래-market (owner 2026-11-18), from the market catalog: most listed, biggest moves
// against a day ago (8+ open listings, swings over 300% left out, as on the site), most sold in 24 hours.
export function marketEmbed(cat, nameOf) {
  const name = (id) => nameOf(id, 'ko') || nameOf(id) || `#${id}`;
  const items = (cat?.items || []).filter((r) => nameOf(r.item));
  if (!items.length) return null;
  const listed = [...items].sort((a, b) => b.open - a.open).slice(0, 5);
  const moving = items.filter((r) => r.typicalDay != null && r.open >= 8 && Math.abs(r.typicalDay) <= 300 && r.typical >= 1000);
  const up = [...moving].filter((r) => r.typicalDay > 0).sort((a, b) => b.typicalDay - a.typicalDay).slice(0, 3);
  const down = [...moving].filter((r) => r.typicalDay < 0).sort((a, b) => a.typicalDay - b.typicalDay).slice(0, 3);
  const sold = [...items].filter((r) => r.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 5);
  const link = (id) => `https://gms-hub.com/ko/tools/market/?item=${id}&utm_source=discord&utm_medium=daily`;
  const day = new Date(Date.now() + 9 * 3600000);
  const st = cat.stats || {};
  return {
    title: `📊 오늘의 시세 · ${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일`,
    url: 'https://gms-hub.com/ko/tools/market/today/?utm_source=discord&utm_medium=daily',
    color: 0xff8a1f,
    description: [st.listings && `판매 중 매물 **${nf(st.listings)}**건`, st.items && `아이템 **${nf(st.items)}**종`, st.shops && `상점 **${nf(st.shops)}**곳`].filter(Boolean).join(' · ') || "Today's Free Market at a glance",
    fields: [
      { name: '📈 하루 사이 오른 아이템', value: up.map((r) => `🔺 **[${name(r.item)}](${link(r.item)})**  ${won(r.typical)}  \`+${r.typicalDay}%\``).join('\n') || '—', inline: true },
      { name: '📉 하루 사이 내린 아이템', value: down.map((r) => `🔻 **[${name(r.item)}](${link(r.item)})**  ${won(r.typical)}  \`${r.typicalDay}%\``).join('\n') || '—', inline: true },
      { name: '💰 많이 팔린 아이템 · 24시간', value: sold.map((r, i) => `${rank(i)} **${name(r.item)}**  ${nf(r.sold)}건 · ${won(r.soldMedian || r.median || r.typical || 0)}`).join('\n') || '—' },
      { name: '📦 매물이 가장 많은 아이템', value: listed.map((r, i) => `${rank(i)} **${name(r.item)}**  ${nf(r.open)}건 · 중앙값 ${won(r.median || 0)}`).join('\n') || '—' },
    ].map((f) => ({ ...f, value: f.value.slice(0, 1024) })),
    footer: { text: '가격은 자유시장 상점 매물 기준 · gms-hub.com' },
    timestamp: new Date().toISOString(),
  };
}
export async function marketToDiscord(env, cat, nameOf) {
  const channel = env.DISCORD_MARKET_CHANNEL;
  if (!env.DISCORD_BOT_TOKEN || !channel) return false;
  const embed = marketEmbed(cat, nameOf);
  if (!embed) return false;
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] }, flags: 4096 }) }).catch(() => null);
  return !!r?.ok;
}
