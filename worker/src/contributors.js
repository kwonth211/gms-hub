// Contributor leaderboard (owner, 2026-11-21): who keeps the market fresh by uploading shop scans from the site
// (/tools/scan/ → POST /listings) and reporting sold listings (/listings/gone). Only these public uploads count.
// A visitor logged in with Discord (worker/src/account.js) is counted under their Discord name; everyone else is
// counted together as "not logged in", which doubles as the reason to log in.
// Also here: the live price board in the Discord market channel, one pinned card edited every 30 minutes.
import { readSession } from './account.js';
import { marketEmbed } from './discord.js';

// The owner's characters (memory: owner-characters) never count.
const OWNER = new Set(['hookstk', 'pipinstall']);
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);

export async function recordContribution(env, req, kind, n, anonKey, sellers = []) {
  if (!(n > 0)) return;
  const s = await readSession(env.DISCORD_CLIENT_SECRET, (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')).catch(() => null);
  const who = s ? `d:${s.u}` : `a:${String(anonKey || '').slice(0, 16)}`;
  if (!s && sellers.length) {
    const count = {};
    for (const x of sellers) count[x] = (count[x] || 0) + 1;
    const up = env.DB.prepare('INSERT INTO contributor_sellers (who, seller, n) VALUES (?, ?, ?) ON CONFLICT (who, seller) DO UPDATE SET n = n + excluded.n');
    await env.DB.batch(Object.entries(count).slice(0, 20).map(([seller, k]) => up.bind(who, seller, k))).catch(() => null);
  }
  await env.DB.prepare(`INSERT INTO contributions (day, who, name, avatar, kind, n) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (day, who, kind) DO UPDATE SET n = n + excluded.n, name = excluded.name, avatar = excluded.avatar`)
    .bind(kstDay(), who, s ? s.n : null, s ? s.a : null, kind, n).run();
}

// Points: an uploaded listing 1, a sold report 1 (both make the price data better).
export async function contributorsData(env, me = null) {
  const since = kstDay(Date.now() - 6 * 864e5);
  const top = async (where, args) => (await env.DB.prepare(`SELECT who, MAX(name) AS name, MAX(avatar) AS avatar,
      SUM(CASE WHEN kind = 'scan' THEN n ELSE 0 END) AS scans, SUM(CASE WHEN kind = 'gone' THEN n ELSE 0 END) AS gone, SUM(n) AS points
      FROM contributions WHERE 1 = 1 ${where} GROUP BY who ORDER BY points DESC LIMIT 80`).bind(...args).all()).results || [];
  const anon = async (where, args) => (await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS points, COUNT(DISTINCT who) AS people FROM contributions WHERE who LIKE 'a:%' ${where}`).bind(...args).first()) || { points: 0, people: 0 };
  // Not logged in: a short tag from the visitor hash, so the same anonymous contributor keeps one line.
  const clean = (rows) => rows.map((r) => ({ who: r.who, id: r.who.startsWith('d:') ? r.who.slice(2) : '', anon: r.who.startsWith('a:'), game: '', name: r.name || '', avatar: r.avatar || '', scans: r.scans, gone: r.gone, points: r.points }));
  const week = clean(await top('AND day >= ?', [since])), all = clean(await top('', []));
  // Anonymous rows: the in-game name of the shop they uploaded most (owner, 2026-11-21: just use that name).
  const anonIds = [...new Set([...week, ...all].filter((r) => r.who.startsWith('a:')).map((r) => r.who))];
  if (anonIds.length) {
    const { results } = await env.DB.prepare(`SELECT who, seller, n, (SELECT SUM(n) FROM contributor_sellers c2 WHERE c2.who = c1.who) AS total
      FROM contributor_sellers c1 WHERE who IN (${anonIds.map(() => '?').join(',')}) ORDER BY n DESC`).bind(...anonIds).all();
    const game = {};
    for (const r of results || []) if (!game[r.who]) game[r.who] = r.seller;
    for (const r of [...week, ...all]) if (game[r.who]) r.game = game[r.who];
  }
  // The owner's own characters are not contributors (their uploads are testing), and one person who uploaded from several
  // connections shows up under the same in-game name more than once: those lines are added together.
  const merge = (rows) => {
    const by = new Map();
    for (const r of rows) {
      if (r.game && OWNER.has(r.game.toLowerCase())) continue;
      const key = r.game ? `g:${r.game.toLowerCase()}` : r.who;
      const x = by.get(key);
      if (x) { x.scans += r.scans; x.gone += r.gone; x.points += r.points; } else by.set(key, { ...r });
    }
    return [...by.values()].sort((a, b) => b.points - a.points).slice(0, 20).map(({ who, ...r }) => r);
  };
  const out = {
    week: merge(week), all: merge(all),
    anonWeek: await anon('AND day >= ?', [since]), anonAll: await anon('', []), since,
  };
  if (me) {
    const r = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN day >= ? THEN n END), 0) AS week, COALESCE(SUM(n), 0) AS total FROM contributions WHERE who = ?").bind(since, `d:${me}`).first();
    out.me = { week: r?.week || 0, total: r?.total || 0 };
  }
  return out;
}

const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
export function leaderboardEmbed(d) {
  const line = (r, i) => `${medal(i)} **${r.game || (r.anon ? '익명 기여자' : r.name || '이름 없음')}** · ${r.points}점 (스캔 ${r.scans} · 판매 확인 ${r.gone})`;
  return {
    title: '🏆 기여자 순위 · Top contributors',
    url: 'https://gms-hub.com/ko/contributors/?utm_source=discord&utm_medium=board',
    color: 0xf5b301,
    description: '사이트에서 상점 스캔을 올리거나 팔린 매물을 알려 주면 점수가 올라요. 모두의 시세가 더 정확해져요.',
    fields: [
      { name: '전체 순위', value: d.all.slice(0, 10).map(line).join('\n') || '아직 없어요. 첫 기여자가 되어 보세요!' },
      { name: '최근 7일 1위', value: d.week[0] ? line(d.week[0], 0) : '—' },
      { name: '내 이름으로 올리려면', value: '사이트에서 디스코드로 로그인하고 올리면 "익명" 대신 내 디스코드 이름이 올라가요.' },
    ],
    footer: { text: 'gms-hub.com/ko/contributors · 1시간마다 갱신' },
    timestamp: new Date().toISOString(),
  };
}

// One card per key in the market channel: edited in place, posted (and pinned) again if it was deleted.
async function keepCard(env, key, channel, body) {
  const bot = (method, path, b) => fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const row = await env.DB.prepare('SELECT json FROM snapshots WHERE key = ?').bind(key).first().catch(() => null);
  const id = row ? JSON.parse(row.json).id : null;
  if (id) {
    const r = await bot('PATCH', `/channels/${channel}/messages/${id}`, body).catch(() => null);
    if (r?.ok) return true;
    if (r && r.status !== 404) return false;
  }
  const r = await bot('POST', `/channels/${channel}/messages`, { ...body, flags: 4096 }).catch(() => null);
  if (!r?.ok) return false;
  const m = await r.json();
  await bot('PUT', `/channels/${channel}/pins/${m.id}`).catch(() => null);
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES (?,?,datetime('now'))").bind(key, JSON.stringify({ id: m.id })).run();
  return true;
}

export async function priceBoardToDiscord(env, cat, nameOf) {
  const channel = env.DISCORD_MARKET_CHANNEL;
  if (!env.DISCORD_BOT_TOKEN || !channel) return false;
  const embed = marketEmbed(cat, nameOf, '📊 실시간 시세판 · Live price board');
  if (!embed) return false;
  embed.footer = { text: '30분마다 이 카드가 바뀌어요 · gms-hub.com' };
  const components = [{ type: 1, components: [
    { type: 2, style: 5, label: '실시간 시세 보기', url: 'https://gms-hub.com/ko/tools/market/?utm_source=discord&utm_medium=board' },
    { type: 2, style: 5, label: '가격 알림 켜기', url: 'https://gms-hub.com/ko/tools/market/?utm_source=discord&utm_medium=board-alert' }] }];
  return keepCard(env, 'discord-price-board', channel, { embeds: [embed], components, allowed_mentions: { parse: [] } });
}

export async function leaderboardToDiscord(env) {
  const channel = env.DISCORD_MARKET_CHANNEL;
  if (!env.DISCORD_BOT_TOKEN || !channel) return false;
  const components = [{ type: 1, components: [
    { type: 2, style: 5, label: '상점 스캔 올리기', url: 'https://gms-hub.com/ko/tools/scan/?utm_source=discord&utm_medium=board' },
    { type: 2, style: 5, label: '전체 순위', url: 'https://gms-hub.com/ko/contributors/?utm_source=discord&utm_medium=board' }] }];
  return keepCard(env, 'discord-leaderboard', channel, { embeds: [leaderboardEmbed(await contributorsData(env))], components, allowed_mentions: { parse: [] } });
}

export async function handleContributors(req, env, cors) {
  const headers = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const s = await readSession(env.DISCORD_CLIENT_SECRET, (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')).catch(() => null);
  const d = await contributorsData(env, s?.u || null);
  return new Response(JSON.stringify(d), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': s ? 'no-store' : 'public, max-age=120' } });
}
