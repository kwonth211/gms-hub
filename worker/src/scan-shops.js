// 상점 스캔으로 올라온 상점 (owner 2026-11-26: "상점 스캔에서 올라온 매물들", shown at the top of /trade/): the shops a
// visitor's Shop Scan upload touched in the last day, each with what it sells now and its owner's picture.
//   GET /market/scan-shops -> { at, shops: [{ seller, ch, room, at, seen, face: { photo, level, job } | null,
//                                             items: [[item, price, qty, sold, opts|null]] }] }
// Reads stay small: scan_shops holds a few dozen rows a day, and each shop's listings come through the
// listings(seller, channel, room, last_seen) index. The answer is a 5-minute snapshot.
export const WINDOW_H = 24;
export const MAX_SHOPS = 60;
export const FACE_DAYS = 7;
export const LATEST_MIN = 30;

// Remember the shops in one upload (rows already validated by POST /listings).
export async function noteScanShops(env, rows) {
  const shops = [...new Map(rows.map((r) => [`${r.seller}|${r.channel}|${r.room}`, r])).values()];
  if (!shops.length) return;
  const stmt = env.DB.prepare("INSERT INTO scan_shops (seller, channel, room, at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT (seller, channel, room) DO UPDATE SET at = datetime('now')");
  await env.DB.batch(shops.slice(0, 20).map((r) => stmt.bind(r.seller, r.channel, r.room)));
}

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export async function scanShops(env) {
  const since = `-${WINDOW_H} hours`;
  const { results: shops } = await env.DB.prepare(`SELECT s.seller, s.channel, s.room, s.at, f.photo, f.level, f.job FROM scan_shops s
    LEFT JOIN seller_faces f ON f.key = lower(s.seller) WHERE s.at >= datetime('now', ?) ORDER BY s.at DESC LIMIT ?`).bind(since, MAX_SHOPS).all();
  if (!shops.length) return { at: new Date().toISOString(), shops: [] };
  const { results: rows } = await env.DB.prepare(`SELECT l.seller, l.channel, l.room, l.item, l.price, l.qty, l.sold, l.last_seen AS seen, l.opts
    FROM json_each(?) AS k JOIN listings AS l ON l.seller = json_extract(k.value, '$[0]') AND l.channel = json_extract(k.value, '$[1]')
    AND l.room = json_extract(k.value, '$[2]') AND l.last_seen >= datetime('now', ?)`)
    .bind(JSON.stringify(shops.map((s) => [s.seller, s.channel, s.room])), since).all();
  const by = new Map(shops.map((s) => [`${s.seller}|${s.channel}|${s.room}`, {
    seller: s.seller, ch: s.channel, room: s.room, at: s.at, seen: '', items: [],
    face: s.photo || s.level ? { photo: s.photo || null, level: s.level ?? null, job: s.job || null } : null,
  }]));
  for (const r of rows) {
    const shop = by.get(`${r.seller}|${r.channel}|${r.room}`);
    if (!shop) continue;
    shop.items.push([r.item, r.price, r.qty || 1, r.sold ? 1 : 0, parse(r.opts), r.seen]);
    if (r.seen > shop.seen) shop.seen = r.seen;
  }
  // Only what the shop held at its latest scan (owner 2026-11-26: "파란 포션 1개만 올렸는데 전꺼까지 같이 뜨네"). A scan
  // sends every item on screen together, and a shop kept on screen is sent again every 10 minutes (the server skips
  // identical rows for 15), so the items still there were seen within ~25 minutes of the newest one; older ones are gone.
  for (const shop of by.values()) {
    const cut = new Date(Date.parse(`${shop.seen.replace(' ', 'T')}Z`) - LATEST_MIN * 60000).toISOString().slice(0, 19).replace('T', ' ');
    shop.items = shop.items.filter((i) => i[5] >= cut).map((i) => i.slice(0, 5));
  }
  // A shop with nothing left on sale is not listed; open items first, the dearest first.
  const list = [...by.values()].filter((s) => s.items.some((i) => !i[3]));
  for (const s of list) s.items.sort((a, b) => a[3] - b[3] || b[1] - a[1]);
  list.sort((a, b) => (a.seen < b.seen ? 1 : a.seen > b.seen ? -1 : 0));
  return { at: new Date().toISOString(), shops: list };
}

// A few shop owners' pictures per run from ClassicRank (lookup = rank.js lookupCharacter): the newest shops first,
// each owner checked again after a week. A 404 is remembered too, so a name is not asked for again every run.
export async function refreshFaces(env, lookup, limit = 4) {
  const { results } = await env.DB.prepare(`SELECT s.seller FROM scan_shops s LEFT JOIN seller_faces f ON f.key = lower(s.seller)
    WHERE s.at >= datetime('now', ?) AND (f.key IS NULL OR f.checked_at < datetime('now', ?)) GROUP BY lower(s.seller) ORDER BY MAX(s.at) DESC LIMIT ?`)
    .bind(`-${WINDOW_H} hours`, `-${FACE_DAYS} days`, limit).all();
  let found = 0;
  for (const { seller } of results) {
    const r = await lookup(seller).catch(() => null);
    if (!r || (r.status !== 200 && r.status !== 404)) continue;
    const c = r.status === 200 ? r.body?.data : null;
    await env.DB.prepare(`INSERT INTO seller_faces (key, nick, photo, level, job, checked_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (key) DO UPDATE SET nick = excluded.nick, photo = excluded.photo, level = excluded.level, job = excluded.job, checked_at = excluded.checked_at`)
      .bind(seller.toLowerCase(), c?.name || seller, c?.photo || null, Number.isFinite(c?.level) ? c.level : null, c?.job ? String(c.job).slice(0, 40) : null).run();
    if (c?.photo) found++;
  }
  return { asked: results.length, found };
}

export async function pruneScanShops(env) {
  await env.DB.prepare("DELETE FROM scan_shops WHERE at < datetime('now', '-7 days')").run();
}
