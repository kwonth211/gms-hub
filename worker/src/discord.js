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

// ---------- Bot posts: game notices in #공지 and 무료 고확 in #한국어-거래 (owner 2026-11-18) ----------
const bot = (env, method, path, body) => fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
async function botPost(env, channel, body) {
  if (!env.DISCORD_BOT_TOKEN || !channel) return null;
  const r = await bot(env, 'POST', `/channels/${channel}/messages`, { allowed_mentions: { parse: [] }, ...body });
  return r?.ok ? (await r.json().catch(() => null))?.id || null : null;
}
const unix = (iso) => Math.floor(Date.parse(iso) / 1000);
const NOTICE = { maintenance: ['🛠', '점검', 0xe5534b], update: ['✨', '업데이트', 0x8b5cf6], events: ['🎉', '이벤트', 0xf59e0b], sale: ['🛍', '캐시샵', 0xec4899], general: ['📌', '공지', 0x64748b] };
const bullets = (xs) => (Array.isArray(xs) ? xs : [xs]).filter(Boolean).map((p) => `• ${p}`).join('\n');

// One official notice as a card: Korean summary first, English under it, the maintenance window in each reader's own
// clock (Discord timestamps), and the official page as the title link.
export function noticeEmbed(x) {
  const [emo, label, color] = NOTICE[x.cat] || NOTICE.general;
  const ko = bullets(x.sum?.ko), en = bullets(x.sum?.en);
  const fields = [];
  if (x.maint?.start && x.maint?.end) fields.push({ name: '🕒 점검 시간 · Maintenance', value: `<t:${unix(x.maint.start)}:f> ~ <t:${unix(x.maint.end)}:t>  (<t:${unix(x.maint.start)}:R>)` });
  if (en && en !== ko) fields.push({ name: 'English', value: en.slice(0, 1024) });
  return { title: `${emo} [${label}] ${x.ko || x.en}`.slice(0, 256), url: x.url, color, description: (ko || x.en).slice(0, 4000), fields,
    footer: { text: 'GMS Hub · 넥슨 공지 한국어 요약' }, timestamp: x.date };
}

// Called after every news refresh (15 min). The first run only remembers what is already listed, so old notices are not
// posted. A notice goes out once its Korean summary is ready (or after an hour with whatever it has); an unfinished
// maintenance also gets a reminder 15–45 minutes before it starts. State: one snapshot row.
export async function newsToDiscord(env, data, now = Date.now()) {
  const channel = env.DISCORD_NOTICE_CHANNEL;
  if (!env.DISCORD_BOT_TOKEN || !channel || !data?.items?.length) return;
  const row = await env.DB.prepare("SELECT json FROM snapshots WHERE key = 'discord-news'").first().catch(() => null);
  const save = (s) => env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('discord-news',?,datetime('now'))").bind(JSON.stringify(s)).run();
  const st = row ? JSON.parse(row.json) : { sent: data.items.map((x) => String(x.id)), reminded: [] };
  let changed = !row, posted = 0;
  for (const x of data.items) {
    const id = String(x.id);
    if (st.sent.includes(id) || posted >= 2) continue;
    const ready = (x.sum?.ko?.length && JSON.stringify(x.sum.ko) !== JSON.stringify(x.sum.en)) || now - Date.parse(x.date) > 3600000;
    if (!ready) continue;
    if (await botPost(env, channel, { embeds: [noticeEmbed(x)] })) { st.sent.push(id); posted++; changed = true; }
  }
  for (const x of data.items) {
    const id = String(x.id);
    if (!x.maint?.start || (st.reminded || []).includes(id)) continue;
    const left = Date.parse(x.maint.start) - now;
    if (left <= 0 || left > 45 * 60000) continue;
    const s = unix(x.maint.start), e = unix(x.maint.end);
    if (await botPost(env, channel, { content: `⏰ **곧 점검이 시작돼요** <t:${s}:R> · <t:${s}:t> ~ <t:${e}:t>\nMaintenance starts <t:${s}:R> and ends <t:${e}:t>.` })) { (st.reminded ||= []).push(id); changed = true; }
  }
  if (changed) { st.sent = st.sent.slice(-60); st.reminded = (st.reminded || []).slice(-30); await save(st); }
}

// 무료 고확 relayed to #한국어-거래: the post as a small card (colour by intent) with a link to it on the site.
// Player text goes out as plain text with mentions off; the Discord message id is kept so a deleted or hidden post
// disappears from Discord too.
const INTENT = { sell: ['🟢 팝니다', 0x2e9d5b], buy: ['🔵 삽니다', 0x3b82f6], chat: ['💬 한마디', 0x94a3b8] };
export function freeMegaEmbed(r) {
  const [head, color] = INTENT[r.intent] || INTENT.chat;
  const item = r.ko || r.en;
  const fields = [];
  if (r.price) fields.push({ name: '가격', value: `**${won(r.price)}** 메소`, inline: true });
  if (r.channel) fields.push({ name: '채널', value: `CH ${r.channel}`, inline: true });
  fields.push({ name: '닉네임', value: `\`${String(r.nick).replace(/`/g, "'")}\``, inline: true });
  return { title: `${head}${item ? ` · ${item}` : ''}`.slice(0, 256), url: `https://gms-hub.com/ko/megaphone/?f=${r.id}&utm_source=discord&utm_medium=free-mega`, color,
    description: r.text ? String(r.text).slice(0, 300) : undefined, fields, footer: { text: 'GMS Hub 무료 고확 · 사이트에서 공짜로 쏠 수 있어요' }, timestamp: new Date(`${String(r.at).replace(' ', 'T')}Z`).toISOString() };
}
export async function freeMegaToDiscord(env, r) {
  const id = await botPost(env, env.DISCORD_TRADE_CHANNEL, { embeds: [freeMegaEmbed(r)], flags: 4096 });
  if (id) await env.DB.prepare('UPDATE free_megaphones SET discord_msg = ? WHERE id = ?').bind(id, r.id).run().catch(() => null);
}
export async function freeMegaGoneFromDiscord(env, msg) {
  if (msg && env.DISCORD_TRADE_CHANNEL) await bot(env, 'DELETE', `/channels/${env.DISCORD_TRADE_CHANNEL}/messages/${msg}`);
}
