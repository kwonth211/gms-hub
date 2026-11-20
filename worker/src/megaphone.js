import { normalizeOptions, parseOptions, enrichOptions } from './item-options.js';
// In-game megaphones. The admin collector posts what it reads from a shared game window; the public page polls the
// newest rows. color is the background band the line was drawn on (Y gold, P pink, C cyan, N none). Writes need MEGAPHONE_TOKEN; rows older than 2 days are dropped by the schedule (prices outlive them in listings and snapshots).
// At ingest the text is parsed once: the item it names, whether it sells or buys, and the asking price (see parseMegaphone).
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const KINDS = new Set(['super', 'item', 'double', 'mega']);
const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

const SELL = /(^|[^a-z])(s\s?>|wts|selling|sell(?:ing)?|s:)/i;
const BUY = /(^|[^a-z])(b\s?>|wtb|buying|buy(?:ing)?|b:)/i;
// "132K", "4m", "1.5b", "380k ea". A number glued to a stat word ("13M DEX", "+5 ATT") is a stat, not a price, and amounts
// outside 500 mesos to 300 million are OCR slips (no item trades there).
const PRICE = /(?<![+\d.])(\d+(?:[.,]\d+)?)\s?(k|m|mil|b)\b(?!\s?(?:att|atk|atck|matk|m\.?att|dex|str|int|luk|acc|avoid|spd|speed|jump|hp|mp|def|slot|crit))/i;
export function parseMegaphone(text, names) {
  const s = SELL.exec(text), b = BUY.exec(text);
  const intent = s && (!b || s.index <= b.index) ? 'sell' : b ? 'buy' : null;
  // OCR often splits a decimal: "1 .9m" is 1.9m, not 9m.
  const m = PRICE.exec(text.replace(/(\d)\s+([.,]\d)/g, '$1$2'));
  const raw = m ? Math.round(Number(m[1].replace(',', '.')) * { k: 1e3, m: 1e6, mil: 1e6, b: 1e9 }[m[2].toLowerCase()]) : null;
  const price = raw && raw >= 500 && raw <= 3e8 ? raw : null;
  let item = null;
  const br = /\[([^\]]{3,60})\]/.exec(text);
  if (br) item = names?.get(br[1].toLowerCase()) ?? null;
  if (intent === 'buy') item = wantedItem(text, names, item);
  return { item, intent, price };
}

// What a buying megaphone is after. The linked [item] is something the caller owns, so on a "B>" line it is usually
// unrelated ("[Snail] B> Bunny Earmuffs 200k" wants the earmuffs; the list of wanted items used to count the snail). The
// item is the longest item name written after the buy word (up to an "S>" part, if any). The linked item counts only
// when the caller names it again ("[Steel Slain] B> clean Slain 47 att"). Shorthand nobody can resolve gives no item.
const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().split(' ').filter(Boolean);
// A word that is not part of an item name: nothing, a number or price ("300k", "2", "60%"), or trade filler.
const aside = (w) => w === undefined || /^[\d%]/.test(w) || /^(ea|each|pm|pmo|pls|plz|offer|offers|for|at|x|fm|ch\d*|clean|any|all|your|ur|a|an|the|my|more)$/.test(w);
const nameIndexes = new WeakMap();
function nameIndex(names) {
  let index = nameIndexes.get(names);
  if (!index) {
    index = new Map();
    for (const [name, id] of names) {
      const w = words(name);
      if (!w.length || w.join(' ').length < 4) continue;
      if (!index.has(w[0])) index.set(w[0], []);
      index.get(w[0]).push({ w, id, len: w.join(' ').length });
    }
    for (const list of index.values()) list.sort((a, b) => b.len - a.len);
    nameIndexes.set(names, index);
  }
  return index;
}
// Shorthand players write instead of the full name. Tried in this order after the exact name:
// 1. a scroll: slot + stat + percent ("gfa 60", "earring luk 60%", "cape dex 10", "polearm at 60%"). Percents are the
//    Classic tiers (100 Lesser, 60 Intermediate, 10 Greater). Without a percent the tier is unknown, so no item.
// 2. a name of two or more words with one word a letter off, as the screen reader often leaves it ("faiy wand").
// 3. one word that belongs to a single item ("kumbi", "steelys", "icicles").
const SHORT = { glove: 'gloves', gloves: 'gloves', earrings: 'earring', earing: 'earring', earings: 'earring', ear: 'earring', ears: 'earring',
  att: 'attack', atk: 'attack', attk: 'attack', atack: 'attack', atck: 'attack', at: 'attack', wa: 'attack', watk: 'attack', watt: 'attack',
  matt: 'magic attack', matk: 'magic attack', ma: 'magic attack', luck: 'luk', acc: 'accuracy', avoid: 'evasion', eva: 'evasion',
  spd: 'speed', jmp: 'jump', ova: 'overall', overalls: 'overall', helm: 'hat', helmet: 'hat', top: 'topwear', bottom: 'bottomwear',
  pants: 'bottomwear', shoe: 'shoes', boots: 'shoes', gfa: 'gloves attack', gfatt: 'gloves attack', gma: 'gloves magic attack',
  gfma: 'gloves magic attack', '1h': 'one-handed', '2h': 'two-handed', bw: 'blunt weapon', xbow: 'crossbow', dmg: 'damage', crit: 'crit.' };
const TIER = { 100: 'lesser', 60: 'intermediate', 10: 'greater' };
const NOT_A_NAME = /^(shoe|room|today|single|regular|female|male|stack|bulk|each|need|needs|offer|offers|price|junk|trash|clean|items|item|sets|set|whisp|whisper|please|cheap|fast|higher|lower|perfect|good|more|less|have|with|only|must|looking|stats|stat|pair|pairs|packs|pack|boxes|scroll|scrolls|buying|selling|free|market|lobby|anyone|wanna|your|mine|this|that|them|here|come|sell|sale|store|shop|name|fame|defame|defames|mesos|meso|coin|coins|ring|rings|cape|capes|wand|claw|bow|hat|shoes|gloves|overall|earring|shield|sword|spear|dagger|staff|armor|weapon|attack|magic|speed|jump|accuracy|evasion|damage|rate|equip|level|thief|warrior|mage|bowman|archer|blue|red|green|black|white|brown|pink|yellow|dark|purple|orange|silver|gold|steel|mithril|bronze)$/;
const shortIndexes = new WeakMap();
function shortIndex(names) {
  let ix = shortIndexes.get(names);
  if (ix) return ix;
  const scrolls = new Map(), byWord = new Map(), owners = new Map();
  for (const [name, id] of names) {
    const m = /^(.+) scroll: (lesser|intermediate|greater)$/.exec(name);
    if (m) {
      const base = m[1].replace(/\./g, '').replace(/[^a-z0-9-]+/g, ' ').trim();
      for (const key of new Set([base, base.replace(' armor', ''), base.replace(' weapon', '')])) {
        if (!scrolls.has(key)) scrolls.set(key, {});
        scrolls.get(key)[m[2]] = id;
      }
    }
    const w = words(name);
    if (w.length >= 2) for (const x of new Set(w)) { if (!byWord.has(x)) byWord.set(x, []); byWord.get(x).push({ w, id, len: w.join(' ').length }); }
    for (const x of new Set(w)) { if (!owners.has(x)) owners.set(x, new Set()); owners.get(x).add(id); }
  }
  ix = { scrolls, byWord, owners };
  shortIndexes.set(names, ix);
  return ix;
}
// One edit apart (a letter added, dropped, changed, or two swapped); the shorter word has four letters or more.
function near(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.max(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ra = a.slice(i), rb = b.slice(i);
  return ra.slice(1) === rb.slice(1) || ra.slice(1) === rb || ra === rb.slice(1) || (ra[0] === rb[1] && ra[1] === rb[0] && ra.slice(2) === rb.slice(2));
}
function shorthandItem(part, names) {
  const { scrolls, byWord, owners } = shortIndex(names);
  // 1. Scrolls. "60%", "gfa60" and "60 gfa" all carry the tier; stat and slot may come in either order.
  const flat = part.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)\s*%/g, '$1 ').replace(/[^a-z0-9-]+/g, ' ').trim();
  const sw = flat.split(' ').filter((w) => w && !/^scrolls?$/.test(w)).flatMap((w) => (SHORT[w] || w).replace(/\./g, '').split(' '));
  // The tier is a number written as a percent. A bare 60 or 100 also counts, but a bare 10 is a stat ("10 int earrings",
  // "+10 STR") unless the line says scroll.
  const pct = [...part.matchAll(/(?<![+\d.])(100|60|10)\s*%/g)].map((m) => m[1]);
  const bare = sw.find((w) => w === '60' || w === '100' || (w === '10' && /scroll|greater/i.test(part) && !/\+\s*10/.test(part)));
  const tier = TIER[pct[0] ?? bare];
  if (tier) {
    const plain = sw.filter((w) => !(w in TIER) && !/^\d/.test(w));
    let hit = null;
    for (let i = 0; i < plain.length && !hit; i++) {
      for (const n of [4, 3, 2]) {
        const run = plain.slice(i, i + n);
        if (run.length < n) continue;
        const key = scrolls.get(run.join(' ')) || (n === 2 ? scrolls.get(`${run[1]} ${run[0]}`) : null);
        if (key?.[tier]) { hit = key[tier]; break; }
      }
    }
    if (hit) return hit;
  }
  // 2. A longer name with one word a letter off.
  const seg = words(part.replace(/\[[^\]]*\]/g, ' '));
  // Two different items a letter away from the same words ("mushmoom spore": Mushmom or Mushroom) settle nothing.
  const close = new Map();
  for (let i = 0; i < seg.length; i++) {
    for (const c of byWord.get(seg[i]) || []) {
      for (let at = 0; at < c.w.length; at++) {
        if (c.w[at] !== seg[i] || i - at < 0) continue;
        let off = 0;
        if (c.w.every((w, k) => seg[i - at + k] === w || (seg[i - at + k] !== undefined && near(seg[i - at + k], w) && ++off <= 1)) && off === 1) close.set(c.id, c);
      }
    }
  }
  if (close.size) {
    const top = Math.max(...[...close.values()].map((c) => c.w.length));
    const longest = [...close.values()].filter((c) => c.w.length === top);
    return longest.length === 1 ? longest[0].id : null;
  }
  // 3. The first word of the request, when only one item has it, plurals included ("kumbi 500k", "1 set of mokbis",
  //    "steelys"). Words further along are too often chatter ("FM room 20", "need today").
  const lead = seg.find((w) => w.length >= 4 && !aside(w) && !/^(sets?|stacks?|pairs?)$/.test(w));
  if (lead) {
    for (const w of new Set([lead, lead.replace(/s$/, ''), lead.replace(/ies$/, 'y'), lead.replace(/es$/, '')])) {
      if (w.length < 4 || NOT_A_NAME.test(w)) continue;
      const own = owners.get(w);
      if (own?.size === 1) return [...own][0];
    }
  }
  return null;
}
export function wantedItem(text, names, linked = null) {
  if (!names) return linked;
  const b = BUY.exec(text);
  if (!b) return linked;
  let part = text.slice(b.index + b[0].length);
  const s = SELL.exec(part);
  if (s) part = part.slice(0, s.index);
  const seg = words(part.replace(/\[[^\]]*\]/g, ' ')), index = nameIndex(names);
  let best = null;
  for (let i = 0; i < seg.length; i++) {
    for (const c of index.get(seg[i]) || []) {
      if (best && c.len <= best.len) break;
      if (!c.w.every((w, k) => seg[i + k] === w)) continue;
      // A one-word name ("Emerald", "Coupon", "Spear") must stand alone: "emerald earrings" or "hair coupon" is another item.
      if (c.w.length === 1 && !(aside(seg[i - 1]) && aside(seg[i + 1]))) continue;
      best = c; break;
    }
  }
  if (best) return best.id;
  const br = /\[([^\]]{3,60})\]/.exec(text);
  if (linked != null && br && words(br[1]).some((w) => w.length >= 4 && seg.includes(w))) return linked;
  return shorthandItem(part, names);
}

export function validMegaphone(r, now = Date.now()) {
  const seen = Date.parse(r?.seen);
  return r && KINDS.has(r.kind) && typeof r.nick === 'string' && /^[A-Za-z0-9]{2,13}$/.test(r.nick) &&
    typeof r.text === 'string' && r.text.trim().length >= 2 && r.text.length <= 200 &&
    (r.color == null || /^[YPCN]$/.test(r.color)) && (r.channel == null || (Number.isInteger(r.channel) && r.channel >= 1 && r.channel <= 40)) &&
    Number.isFinite(seen) && seen <= now + 60000 && now - seen < 3600000;
}

// onNew(rows) is handed the rows that were actually inserted (repeats left out) with their parsed item, intent and
// price, for the Discord alerts.
export async function postMegaphones(req, env, itemNames, onNew) {
  if (!env.MEGAPHONE_TOKEN) return reply({ error: 'megaphones not configured' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (auth.length > 256 || (await digest(auth)) !== (await digest(`Bearer ${env.MEGAPHONE_TOKEN}`))) return reply({ error: 'unauthorized' }, 401);
  let body;
  try { body = await req.json(); } catch { return reply({ error: 'invalid JSON' }, 400); }
  const rows = (Array.isArray(body?.rows) ? body.rows : []).slice(0, 50).filter((r) => validMegaphone(r));
  if (!rows.length) return reply({ ok: true, accepted: 0 });
  // The same line stays on screen for a while and scrolls through several frames: one row per nick+text per 10 minutes.
  const names = itemNames ? await itemNames().catch(() => null) : null;
  const insert = env.DB.prepare('INSERT OR IGNORE INTO megaphones (seen_at, kind, color, channel, nick, text, hash, item, intent, price, opts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const parsed = [], hashes = [];
  const stmts = await Promise.all(rows.map(async (r, i) => {
    const text = r.text.trim(), p = parseMegaphone(text, names);
    const opts = normalizeOptions(r.opts);
    parsed[i] = { ...r, text, ...p, opts: parseOptions(opts) };
    hashes[i] = await digest(`${r.nick}|${text.toLowerCase()}|${Math.floor(Date.parse(r.seen) / 600000)}`);
    return insert.bind(stamp(r.seen), r.kind, r.color ?? null, r.channel ?? null, r.nick, text, hashes[i], p.item, p.intent, p.price, opts);
  }));
  const results = await env.DB.batch(stmts);
  // New rows carry their id and the stored time stamp, shaped like GET /megaphones rows, so they can be pushed to pages.
  const fresh = parsed.map((row, i) => ({ ...row, id: results[i].meta.last_row_id, seen: stamp(row.seen) })).filter((_, i) => results[i].meta.changes > 0);
  if (fresh.length && onNew) onNew(fresh);
  // A retry may identify options after the text was uploaded. Enrich only that exact observation;
  // never overwrite existing evidence or attach a later repeated advertisement's item to it.
  const enriched = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    if (results[i].meta.changes || !row.opts) continue;
    const previous=await env.DB.prepare('SELECT opts FROM megaphones WHERE hash = ? AND seen_at = ? AND channel IS ? AND nick = ? AND text = ?')
      .bind(hashes[i],stamp(row.seen),row.channel??null,row.nick,row.text).first();
    if(!previous)continue;
    const merged=enrichOptions(previous.opts,row.opts);
    if(!merged||merged===previous.opts)continue;
    const result = await env.DB.prepare('UPDATE megaphones SET opts = ? WHERE hash = ? AND seen_at = ? AND channel IS ? AND nick = ? AND text = ? AND opts IS ?')
      .bind(merged, hashes[i], stamp(row.seen), row.channel ?? null, row.nick, row.text,previous.opts).run();
    if (!result.meta.changes) continue;
    const saved = await env.DB.prepare('SELECT id, seen_at AS seen, kind, color, channel, nick, text, item, intent, price, opts FROM megaphones WHERE hash = ?').bind(hashes[i]).first();
    if (saved) enriched.push({ ...saved, opts: parseOptions(saved.opts) });
  }
  if (enriched.length && onNew) onNew(enriched, true);
  return reply({ ok: true, accepted: fresh.length, ...(enriched.length ? { updated: enriched.length } : {}) });
}

export async function listMegaphones(env, params) {
  const after = Math.max(0, Number(params.get('after')) || 0);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  // ?item=<id>: megaphones naming that item (the market's item panel), newest first, by index.
  const item = Number(params.get('item'));
  if (Number.isInteger(item) && item > 0) {
    const { results } = await env.DB.prepare('SELECT id, seen_at AS seen, kind, color, channel, nick, text, intent, price, opts FROM megaphones WHERE item = ? ORDER BY id DESC LIMIT ?')
      .bind(item, Math.min(limit, 30)).all();
    return { rows: results.map(withOptions), at: new Date().toISOString() };
  }
  const { results } = await env.DB.prepare('SELECT id, seen_at AS seen, kind, color, channel, nick, text, opts FROM megaphones WHERE id > ? ORDER BY id DESC LIMIT ?').bind(after, limit).all();
  return { rows: results.map(withOptions), at: new Date().toISOString() };
}

// Options go out as an object (or are left out), never as raw JSON text.
const withOptions = ({ opts, ...r }) => (opts ? { ...r, opts: parseOptions(opts) } : r);

export const pruneMegaphones = (env) => env.DB.prepare("DELETE FROM megaphones WHERE seen_at < datetime('now', '-2 days')").run();

// Asking prices from megaphones for the price summaries: selling megaphones of the last 7 days, outliers past 5x the
// median dropped, with the middle half of the spread. Meant for consumables, scrolls and cash items, whose megaphone
// prices match shop prices; scrolled equipment is a different market and the caller leaves it out.
export async function megaphoneAsks(env, ids) {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT item, price FROM megaphones WHERE item IN (SELECT value FROM json_each(?)) AND intent = 'sell' AND price IS NOT NULL AND seen_at >= datetime('now', '-2 days')`).bind(JSON.stringify(ids)).all();
  const by = new Map();
  for (const r of results) (by.get(r.item) || by.set(r.item, []).get(r.item)).push(r.price);
  const out = {};
  for (const [item, prices] of by) {
    const s = prices.sort((a, b) => a - b);
    const mid = s[s.length >> 1];
    const kept = s.length >= 3 ? s.filter((p) => p <= mid * 5 && p >= mid / 5) : s;
    if (!kept.length) continue;
    const q = (f) => kept[Math.min(kept.length - 1, Math.floor(f * (kept.length - 1) + 0.5))];
    out[item] = { n: kept.length, median: q(0.5), p25: q(0.25), p75: q(0.75) };
  }
  return out;
}

// Pattern content for the home and megaphone pages (snapshot hourly by the schedule, to keep D1 reads small): the items named most in the last 24
// hours with their change against the day before, how many sell vs buy, the busiest callers today, and megaphones per
// hour over the last day. Only what was read from the game; names and ids are resolved by the pages.
export async function megaphoneStats(env, now = Date.now(), names = null) {
  // Today's numbers need the last 24 hours row by row; "before" (the 24 hours before that) only needs per-item counts,
  // which never change once an hour is over. Those are kept per hour in the snapshot 'mega-hours', so an hourly run reads
  // one day of megaphones instead of two. Without a recent, complete store it reads both days once and starts one.
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const hourOf = (t) => t.slice(0, 13);
  const dayAgo = iso(now - 86400000), twoDays = iso(now - 2 * 86400000);
  const kept = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'mega-hours'").first().then((r) => r && { ...JSON.parse(r.json), at: r.at }).catch(() => null);
  const covered = kept && kept.from <= hourOf(twoDays) && now - Date.parse(`${kept.at.replace(' ', 'T')}Z`) < 23 * 3600000;
  const { results } = await env.DB.prepare("SELECT seen_at AS t, nick, item, intent, text FROM megaphones WHERE seen_at >= ?").bind(covered ? dayAgo : twoDays).all();
  // Buying megaphones stored before 2026-11-16 carry the linked item, not the wanted one: read the wanted item again.
  if (names) for (const r of results) if (r.intent === 'buy') r.item = wantedItem(r.text, names, r.item);
  const items = new Map(), before = new Map(), hours = new Map(), callers = new Map(), nicks = new Set();
  const hourItems = {};
  let n = 0, withItem = 0;
  for (const r of results) {
    if (r.item != null) { const h = (hourItems[hourOf(r.t)] ||= {}); h[r.item] = (h[r.item] || 0) + 1; }
    if (r.t < dayAgo) { if (r.item != null) before.set(r.item, (before.get(r.item) || 0) + 1); continue; }
    n++; nicks.add(r.nick);
    const h = r.t.slice(0, 13).replace(' ', 'T');
    hours.set(h, (hours.get(h) || 0) + 1);
    const c = callers.get(r.nick) || { nick: r.nick, n: 0, set: new Set() };
    c.n++; if (r.item != null) c.set.add(r.item); callers.set(r.nick, c);
    if (r.item == null) continue;
    withItem++;
    const it = items.get(r.item) || { item: r.item, n: 0, sell: 0, buy: 0 };
    it.n++; if (r.intent === 'sell') it.sell++; if (r.intent === 'buy') it.buy++;
    items.set(r.item, it);
  }
  // Hours read in full replace stored ones; the first, partly read hour keeps what an earlier run stored for it.
  const first = hourOf(covered ? dayAgo : twoDays);
  const store = {};
  for (const [h, v] of Object.entries(covered ? kept.hours : {})) if (h >= hourOf(twoDays)) store[h] = v;
  for (const [h, v] of Object.entries(hourItems)) if (h > first || !store[h]) store[h] = v;
  if (covered) {
    // Hour-grained: the 24 hours before the last 24, by whole hours.
    for (const [h, v] of Object.entries(store)) if (h >= hourOf(twoDays) && h < hourOf(dayAgo))
      for (const [item, c] of Object.entries(v)) before.set(Number(item), (before.get(Number(item)) || 0) + c);
  }
  const from = covered ? kept.from : hourOf(iso(now - 2 * 86400000 + 3600000));
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('mega-hours',?,datetime('now'))").bind(JSON.stringify({ from, hours: store })).run().catch(() => null);
  const day = [...items.values()].sort((a, b) => b.n - a.n || a.item - b.item).slice(0, 40);
  // "Trending": the raw 24-hour count keeps the same staples on top for days, so rank by the last 6 hours against each
  // item's usual 6 hours (the 42 hours before, from the per-hour store). Smoothed (+5, at least 8 calls) so a 1 -> 4 jump does not top the list.
  const recentFrom = hourOf(iso(now - 6 * 3600000)), baseFrom = hourOf(twoDays);
  const recent = new Map(), base = new Map();
  for (const [h, v] of Object.entries(store)) {
    if (h < baseFrom) continue;
    const into = h >= recentFrom ? recent : base;
    for (const [item, c] of Object.entries(v)) into.set(Number(item), (into.get(Number(item)) || 0) + c);
  }
  const baseHours = Math.max(1, Object.keys(store).filter((h) => h >= baseFrom && h < recentFrom).length);
  const trending = [...recent]
    .filter(([item, c]) => c >= 8 && items.has(item))
    .map(([item, c]) => {
      const usual = ((base.get(item) || 0) * 6) / baseHours;
      return { ...items.get(item), recent: c, usual: Math.round(usual * 10) / 10, score: (c + 5) / (usual + 5) };
    })
    .sort((a, b) => b.score - a.score || b.recent - a.recent)
    .slice(0, 20)
    .map(({ score, ...r }) => ({ ...r, before: before.get(r.item) || 0 }));
  return {
    at: new Date(now).toISOString(),
    today: { n, nicks: nicks.size, withItem },
    items: day.map((r) => ({ ...r, before: before.get(r.item) || 0 })),
    trending,
    // Items more wanted than offered (at least 3 buyers): a demand signal the shops cannot show.
    // Taken from every item named today, not only the 40 most named: buyers mostly call for cheap, rarely sold things
    // (that cut left just the same two items for days).
    wanted: [...items.values()].filter((r) => r.buy >= 3 && r.buy > r.sell).sort((a, b) => b.buy - a.buy || (b.buy - b.sell) - (a.buy - a.sell) || a.item - b.item).slice(0, 10).map((r) => ({ ...r, before: before.get(r.item) || 0 })),
    hourly: [...hours].sort((a, b) => a[0].localeCompare(b[0])).map(([h, c]) => ({ h, n: c })),
    callers: [...callers.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((c) => ({ nick: c.nick, n: c.n, items: c.set.size })),
  };
}
