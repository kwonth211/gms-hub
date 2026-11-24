// Scam reports. Players warn each other over megaphones ("X is a scammer", "dont buy from X"); megaphones are pruned
// after 2 days, so those warnings are parsed at ingest and kept (tables in migrations/0028_scam.sql). The page
// /scam/ lists the names with who shouted what and when. Visitors can add a report or ask for their name to be taken
// down; both wait for the owner's review (POST /internal/scam with the owner key).
//   GET  /scam                 -> { at, rows: [{ nick, n, by, first, last, quotes: [{ at, by, text, ch, src }] }] }
//   POST /scam/report {nick, text, me?}        -> { ok } (pending)
//   POST /scam/appeal {nick, message, contact?} -> { ok } (pending)
//   POST /internal/scam {token, action, ...}   -> owner review (list, report, nick, appeal, backfill)
// A megaphone is one player's word, not a verdict: the page always shows the line and the caller, and a name goes up
// by itself only when the character exists and either the wording is plain or two different players named it.
import { sameSecret } from './secure.js';

const NAME = '[A-Za-z0-9]{4,12}';
const TRIGGER = /scam|사기/i;
// Words that sit where a name would but are not one.
const STOP = new Set(('this that these those them they their there here what when where which with from have been were will your yours mine ' +
  'everyone anyone someone people player players seller sellers buyer buyers guys guild dont never always still also just only really total ' +
  'name names character level fame defame spot spots scroll scrolls trade trades trading price prices deal deals shop shops store market game nexon ' +
  'server world item items mesos meso careful beware report blacklist watch warning mass fake real being such some more another other ' +
  'kumbi kumbis steely steelys ilbi ilbis mokbi tobi glove gloves cape claw bundle bundles swap male female human rodent buying selling sell ' +
  'please trust again today right about because after before into over under channel room free scammer scammers scam scams scamming scammed ' +
  'then than while keep keeps kept stop doing going trying tried tries making selling scrolling smega smegas mega megas clean slot slots lmao lmfao bruh dude').split(' '));
const ok = (name, caller) => name && !STOP.has(name.toLowerCase()) && name.toLowerCase() !== String(caller || '').toLowerCase() && !/^\d+$/.test(name) && !/^(ch|cc|fm)\d+$/i.test(name);

const STRONG = [
  // "X is a scammer", "X ls a rodent scammer", "X is a 40 y/o male scamming", "X is scammer", "X is fame scammer"
  // ("scrolling is a scam" is about a thing: only the person forms count)
  new RegExp(`\\b(${NAME})\\s+(?:is|ls|iz|was)\\s+(?:also\\s+)?(?:(?:a|an|the)\\s+(?:[\\w/'+-]+\\s+){0,5}?|(?:\\w+\\s+)?)(?:scamm?ers?|scamer|scamming)`, 'i'),
  // "X is doing scams on people"
  new RegExp(`\\b(${NAME})\\s+(?:is|ls|was|keeps?)\\s+(?:doing|running|pulling)\\s+(?:\\w+\\s+)?scams?\\b`, 'i'),
  // "X = level 71 trying to scam", "X <<< fame scamer"
  new RegExp(`\\b(${NAME})\\s*(?:=+|<{2,})\\s*[^.!?]{0,45}?scam`, 'i'),
  // "dont buy from X she scams", "don't trust X, he's a scammer", "dont trade X its a scam", "report X scammer", "beware of X."
  new RegExp(`\\b(?:from|trust|trade(?:\\s+with)?|report|avoid|beware\\s+of)\\s+(${NAME})\\b(?=\\s*(?:[,.!?:-]|$|she\\b|he\\b|they\\b|its?\\b|is\\b|ls\\b|scam|also\\b|for\\b))`, 'i'),
  // "X tried to scroll swap scam", "X tries to scam"
  new RegExp(`\\b(${NAME})\\s+(?:tried|tries|trying|tryin\\s?g|tying)\\s+to\\s+(?:\\w+\\s+){0,3}?scam`, 'i'),
  // "X scams", "X scammed me"
  new RegExp(`\\b(${NAME})\\s+(?:scams|scammed)\\b`, 'i'),
  // "X 사기꾼"
  new RegExp(`(${NAME})\\s*(?:는|은|이|가|님)?\\s*사기꾼`, 'i')
];
// Two names in one line: "X and Y scammers", "X Y are trying to scam".
const PAIRS = [
  new RegExp(`\\b(${NAME})\\s+(?:and|&)\\s+(${NAME})\\s+(?:are\\s+)?(?:both\\s+)?scamm?ers?`, 'i'),
  new RegExp(`\\b(${NAME})\\s+(${NAME})\\s+are\\s+try\\w*\\s?g?\\s+to\\s+scam`, 'i')
];
// Looser wording: the name may be something else ("careful! Navy Ghost scamming"), so these never publish alone.
const WEAK = [
  new RegExp(`\\b(?:scamm?er|scamer)\\s*[:=-]\\s*(${NAME})\\b`, 'i'),
  new RegExp(`\\b(?:beware|careful|watch\\s+out|psa)[!:,]*\\s+(?:of\\s+|for\\s+)?(${NAME})\\b`, 'i'),
  new RegExp(`\\bign:?\\s+(${NAME})\\b`, 'i'),
  new RegExp(`^(${NAME})\\s+why\\s+(?:you|u)\\s+scam`, 'i')
];

// The players a megaphone warns about: [{ nick, strong }]. Empty when the line is not a warning or names nobody.
export function scamAccusations(text, caller) {
  if (typeof text !== 'string' || !TRIGGER.test(text)) return [];
  // The linked [item] and quote marks are not part of the sentence.
  const t = text.replace(/\[[^\]]*\]/g, ' ').replace(/['"`’‘“”|*]+/g, ' ').replace(/\s+/g, ' ').trim();
  const found = new Map();
  const add = (name, strong) => {
    if (!ok(name, caller)) return;
    const key = name.toLowerCase();
    if (!found.has(key) || (strong && !found.get(key).strong)) found.set(key, { nick: name, strong });
  };
  for (const re of PAIRS) { const m = re.exec(t); if (m) { add(m[1], true); add(m[2], true); } }
  for (const re of STRONG) { const m = re.exec(t); if (m) add(m[1], true); }
  for (const re of WEAK) { const m = re.exec(t); if (m) add(m[1], false); }
  return [...found.values()];
}

// What kind of scam a line talks about, for the chips on the page. A line can carry several.
const KINDS = [['spot', /\bspots?\b/i], ['fame', /\bfame\b/i], ['scroll', /scroll|\bgfa\b|\b(?:10|60|100)\s?%/i], ['switch', /bait|switch|swap/i], ['bundle', /bundle/i], ['price', /underpric|overpric/i], ['rmt', /\brmt\b/i]];
export const scamKinds = (text) => KINDS.filter(([, re]) => re.test(String(text).replace(/\[[^\]]*\]/g, ' '))).map(([k]) => k);

// A name is listed by itself when the character exists and the wording was plain or two different players named it.
// The owner can force either way (state 'shown' / 'hidden').
export const isPublic = (n) => n.state === 'shown' || (n.state === 'auto' && n.verified === 1 && (n.strong || n.by >= 2));

const digest = async (v) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const LINK = /(https?:|www\.|\.(com|net|gg|kr|io|me|ly)\b|discord\.gg|t\.me)/i;

// Megaphones just stored (rows from postMegaphones' onNew): keep the warnings, check new names against the ranking,
// rebuild the public list when anything was added. lookup(name) -> { status, body } (rank.js lookupCharacter).
export async function recordScamMegaphones(env, rows, lookup) {
  const stmts = [], keys = new Map();
  for (const r of rows) {
    for (const a of scamAccusations(r.text, r.nick)) {
      const key = a.nick.toLowerCase();
      const hash = await digest(`mega|${key}|${r.nick.toLowerCase()}|${r.text.toLowerCase()}|${String(r.seen).slice(0, 10)}`);
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO scam_reports (key, source, accuser, text, strong, channel, at, mega_id, status, hash)
        VALUES (?, 'mega', ?, ?, ?, ?, ?, ?, 'shown', ?)`).bind(key, r.nick, r.text, a.strong ? 1 : 0, r.channel ?? null, r.seen, r.id ?? null, hash));
      stmts.push(env.DB.prepare(`INSERT INTO scam_nicks (key, nick, first_at, last_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET last_at = MAX(last_at, excluded.last_at), first_at = MIN(first_at, excluded.first_at)`).bind(key, a.nick, r.seen, r.seen));
      keys.set(key, a.nick);
    }
  }
  if (!stmts.length) return { added: 0 };
  const res = await env.DB.batch(stmts);
  const added = res.filter((x, i) => i % 2 === 0 && x.meta.changes > 0).length;
  await verifyNicks(env, lookup, [...keys.keys()]);
  if (added) await buildScamList(env);
  return { added };
}

// Ask the ranking whether the character exists and how the name is really written. A failed lookup (not 200/404)
// leaves the name unchecked, to be tried again with its next report. At most 8 a run (the ranking allows 30 a minute).
export async function verifyNicks(env, lookup, keys) {
  if (!lookup || !keys.length) return;
  // Names checked before the cards showed a picture (photo never asked for) are looked up once more.
  const { results } = await env.DB.prepare(`SELECT key, nick FROM scam_nicks WHERE (verified = 0 OR (verified = 1 AND photo IS NULL AND level IS NULL)) AND key IN (SELECT value FROM json_each(?)) LIMIT 8`).bind(JSON.stringify(keys)).all();
  for (const n of results) {
    const r = await lookup(n.nick).catch(() => null);
    const c = r?.body?.data;
    if (r?.status === 200 && c?.name) await env.DB.prepare("UPDATE scam_nicks SET verified = 1, nick = ?, level = ?, job = ?, photo = ?, checked_at = datetime('now') WHERE key = ?")
      .bind(String(c.name).slice(0, 13), Number.isFinite(c.level) ? c.level : null, c.job ? String(c.job).slice(0, 40) : null, c.photo || null, n.key).run();
    else if (r?.status === 404) await env.DB.prepare('UPDATE scam_nicks SET verified = -1 WHERE key = ?').bind(n.key).run();
  }
}

// A reported character levels up and changes clothes: the level, job and picture are read again every 3 days, 5 names
// an hour (the schedule calls this). A failed lookup changes nothing.
export async function refreshProfiles(env, lookup) {
  const { results } = await env.DB.prepare(`SELECT key, nick, level, job, photo FROM scam_nicks WHERE verified = 1 AND state != 'hidden'
    AND (checked_at IS NULL OR checked_at < datetime('now', '-3 days')) ORDER BY checked_at LIMIT 5`).all();
  let changed = 0;
  for (const n of results) {
    const r = await lookup(n.nick).catch(() => null);
    const c = r?.status === 200 ? r.body?.data : null;
    if (!c?.name) { if (r?.status === 404) await env.DB.prepare("UPDATE scam_nicks SET checked_at = datetime('now') WHERE key = ?").bind(n.key).run(); continue; }
    const level = Number.isFinite(c.level) ? c.level : null, job = c.job ? String(c.job).slice(0, 40) : null, photo = c.photo || null;
    await env.DB.prepare("UPDATE scam_nicks SET level = ?, job = ?, photo = ?, checked_at = datetime('now') WHERE key = ?").bind(level, job, photo, n.key).run();
    if (level !== n.level || job !== n.job || photo !== n.photo) changed++;
  }
  if (changed) await buildScamList(env);
  return { checked: results.length, changed };
}

// Names with their shown reports, newest first. Used for the public list (public only) and the owner's review (all).
async function gather(env) {
  const [nicks, reports] = await env.DB.batch([
    env.DB.prepare('SELECT key, nick, verified, state, note, first_at, last_at, level, job, photo FROM scam_nicks'),
    env.DB.prepare("SELECT key, source, accuser, text, strong, channel, at FROM scam_reports WHERE status = 'shown' ORDER BY at DESC, id DESC LIMIT 5000")
  ]);
  const by = new Map(nicks.results.map((n) => [n.key, { ...n, n: 0, accusers: new Set(), kinds: new Set(), strong: false, quotes: [] }]));
  for (const r of reports.results) {
    const n = by.get(r.key);
    if (!n) continue;
    n.n++;
    // A report written on the site was read by the owner before it was shown, so it counts as plain wording.
    n.accusers.add(r.source === 'mega' ? r.accuser.toLowerCase() : `user:${r.accuser}`);
    if (r.strong || r.source === 'user') n.strong = true;
    for (const k of scamKinds(r.text)) n.kinds.add(k);
    if (n.quotes.length < 6) n.quotes.push({ at: r.at, by: r.source === 'mega' ? r.accuser : null, text: r.text, ch: r.channel ?? null, src: r.source });
  }
  return [...by.values()].filter((n) => n.n > 0).map(({ accusers, kinds, ...n }) => ({ ...n, by: accusers.size, kinds: [...kinds] }));
}

export async function buildScamList(env) {
  const rows = (await gather(env)).filter(isPublic).sort((a, b) => (a.last_at < b.last_at ? 1 : -1)).slice(0, 500)
    .map((n) => ({ nick: n.nick, n: n.n, by: n.by, first: n.first_at, last: n.last_at, kinds: n.kinds, level: n.level ?? null, job: n.job ?? null, photo: n.photo ?? null, quotes: n.quotes }));
  const data = { at: new Date().toISOString(), rows };
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key, json, at) VALUES ('scam-list', ?, datetime('now'))").bind(JSON.stringify(data)).run();
  return data;
}

export async function scamList(env) {
  const row = await env.DB.prepare("SELECT json FROM snapshots WHERE key = 'scam-list'").first().catch(() => null);
  return row ? JSON.parse(row.json) : buildScamList(env);
}

export const REPORTS_A_DAY = 5;
export const APPEALS_A_DAY = 3;

// A visitor's report. Never shown until the owner approves it.
export async function postScamReport(env, body, visitor) {
  const nick = clean(body?.nick, 13), text = clean(body?.text, 300), me = clean(body?.me, 13);
  if (!/^[A-Za-z0-9]{2,13}$/.test(nick)) return [{ error: 'nick' }, 400];
  if (text.length < 10) return [{ error: 'short' }, 400];
  if (LINK.test(text)) return [{ error: 'link' }, 400];
  if (me && !/^[A-Za-z0-9]{2,13}$/.test(me)) return [{ error: 'me' }, 400];
  const day = await env.DB.prepare("SELECT COUNT(*) AS n FROM scam_reports WHERE source = 'user' AND accuser = ? AND at >= datetime('now', '-1 day')").bind(visitor).first();
  if ((day?.n || 0) >= REPORTS_A_DAY) return [{ error: 'daily' }, 429];
  const key = nick.toLowerCase();
  const hash = await digest(`user|${key}|${visitor}|${text.toLowerCase()}`);
  // The name row keeps the spelling the visitor typed; with no shown report it is not listed anywhere yet.
  const [r] = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO scam_reports (key, source, accuser, accuser_name, text, strong, at, status, hash)
      VALUES (?, 'user', ?, ?, ?, 1, datetime('now'), 'pending', ?)`).bind(key, visitor, me || null, text, hash),
    env.DB.prepare("INSERT OR IGNORE INTO scam_nicks (key, nick, first_at, last_at) VALUES (?, ?, datetime('now'), datetime('now'))").bind(key, nick)
  ]);
  return [{ ok: true, again: !r.meta.changes }, 200];
}

// "Take my name down." Never changes the list until the owner grants it.
export async function postScamAppeal(env, body, visitor) {
  const nick = clean(body?.nick, 13), message = clean(body?.message, 600), contact = clean(body?.contact, 80);
  if (!/^[A-Za-z0-9]{2,13}$/.test(nick)) return [{ error: 'nick' }, 400];
  if (message.length < 10) return [{ error: 'short' }, 400];
  const day = await env.DB.prepare("SELECT COUNT(*) AS n FROM scam_appeals WHERE reporter = ? AND at >= datetime('now', '-1 day')").bind(visitor).first();
  if ((day?.n || 0) >= APPEALS_A_DAY) return [{ error: 'daily' }, 429];
  await env.DB.prepare('INSERT INTO scam_appeals (key, nick, message, contact, reporter) VALUES (?, ?, ?, ?, ?)').bind(nick.toLowerCase(), nick, message, contact || null, visitor).run();
  return [{ ok: true }, 200];
}

// Owner review. The key is the owner key the traffic dashboard uses (DASH_TOKEN), kept in the owner's browser.
//   list              -> waiting reports, waiting take-down requests, names held back, names on the list
//   report {id, ok}   -> show or reject a visitor's report
//   nick {key, state, note?} -> 'shown' | 'hidden' | 'auto'
//   appeal {id, grant, answer?} -> grant hides the name
//   backfill          -> read the megaphones still stored for warnings (first run, or after a parser change)
export async function handleScamAdmin(req, env, allowedOrigins, lookup) {
  const origin = req.headers.get('Origin') || '';
  const cors = { 'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  const b = await req.json().catch(() => ({}));
  if (!env.DASH_TOKEN || typeof b.token !== 'string' || !(await sameSecret(b.token, env.DASH_TOKEN))) return reply({ error: 'forbidden' }, 403);
  const key = clean(b.key, 13).toLowerCase();
  if (b.action === 'report') {
    const row = await env.DB.prepare("UPDATE scam_reports SET status = ? WHERE id = ? AND source = 'user' RETURNING key").bind(b.ok ? 'shown' : 'rejected', Number(b.id)).first();
    if (!row) return reply({ error: 'not found' }, 404);
    if (b.ok) {
      await env.DB.prepare(`INSERT INTO scam_nicks (key, nick, first_at, last_at) VALUES (?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(key) DO UPDATE SET last_at = datetime('now')`).bind(row.key, row.key).run();
      await verifyNicks(env, lookup, [row.key]);
    }
  } else if (b.action === 'nick') {
    if (!['shown', 'hidden', 'auto'].includes(b.state) || !key) return reply({ error: 'bad' }, 400);
    const r = await env.DB.prepare('UPDATE scam_nicks SET state = ?, note = ? WHERE key = ?').bind(b.state, clean(b.note, 200) || null, key).run();
    if (!r.meta.changes) return reply({ error: 'not found' }, 404);
  } else if (b.action === 'appeal') {
    const row = await env.DB.prepare("UPDATE scam_appeals SET status = ?, answer = ? WHERE id = ? RETURNING key").bind(b.grant ? 'granted' : 'denied', clean(b.answer, 300) || null, Number(b.id)).first();
    if (!row) return reply({ error: 'not found' }, 404);
    if (b.grant) await env.DB.prepare("UPDATE scam_nicks SET state = 'hidden', note = ? WHERE key = ?").bind(`appeal ${Number(b.id)}`, row.key).run();
  } else if (b.action === 'backfill') {
    const { results } = await env.DB.prepare("SELECT id, seen_at AS seen, channel, nick, text FROM megaphones WHERE text LIKE '%scam%' OR text LIKE '%사기%' ORDER BY id").all();
    // Stored megaphone reports the parser no longer reads as a warning about that name are dropped, with their name
    // when nothing else is left under it (and the owner never set it by hand).
    const kept = await env.DB.prepare("SELECT id, key, accuser, text FROM scam_reports WHERE source = 'mega'").all();
    const gone = kept.results.filter((r) => !scamAccusations(r.text, r.accuser).some((a) => a.nick.toLowerCase() === r.key)).map((r) => r.id);
    if (gone.length) {
      await env.DB.prepare('DELETE FROM scam_reports WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(gone)).run();
      await env.DB.prepare("DELETE FROM scam_nicks WHERE state = 'auto' AND key NOT IN (SELECT key FROM scam_reports)").run();
    }
    const out = await recordScamMegaphones(env, results, lookup);
    const bare = await env.DB.prepare('SELECT key FROM scam_nicks WHERE verified = 1 AND photo IS NULL AND level IS NULL LIMIT 8').all();
    await verifyNicks(env, lookup, bare.results.map((x) => x.key));
    await buildScamList(env);
    return reply({ ok: true, read: results.length, dropped: gone.length, ...out });
  } else if (b.action !== 'list') return reply({ error: 'action' }, 400);
  if (b.action !== 'list') await buildScamList(env);
  const [reports, appeals] = await env.DB.batch([
    env.DB.prepare("SELECT id, key, accuser_name AS me, text, at FROM scam_reports WHERE source = 'user' AND status = 'pending' ORDER BY id DESC LIMIT 100"),
    env.DB.prepare("SELECT id, key, nick, message, contact, at FROM scam_appeals WHERE status = 'pending' ORDER BY id DESC LIMIT 100")
  ]);
  const all = (await gather(env)).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  const slim = (n) => ({ key: n.key, nick: n.nick, verified: n.verified, state: n.state, note: n.note, n: n.n, by: n.by, strong: n.strong, last: n.last_at, quotes: n.quotes.slice(0, 3) });
  return reply({ ok: true, reports: reports.results, appeals: appeals.results, held: all.filter((n) => !isPublic(n) && n.state !== 'hidden').slice(0, 200).map(slim),
    hidden: all.filter((n) => n.state === 'hidden').slice(0, 200).map(slim), listed: all.filter(isPublic).slice(0, 300).map(slim) });
}
