// 무료 고확 (free megaphones): trade posts written on the site, shown with the game megaphones on /megaphone/ and in the
// header ticker. Stored apart from them (table free_megaphones) so a typed price never reaches price summaries, trends or
// alerts. No login: the poster's IP hash limits the pace, a random key returned once lets them delete their own post,
// and three reports from different visitors hide a post. Posts stay (owner 2026-11-17): no time limit, only the poster's delete or three reports take one down.
//   GET    /free-megas?after=<id>&limit=     -> { rows: [{ id, at, nick, intent, item, price, text, channel }] } (newest first)
//   POST   /free-megas {nick, intent, item?, price?, text?, channel?} -> { row, key }
//   DELETE /free-megas?id=&key=             -> { ok }
//   POST   /free-megas/report {id}          -> { ok, hidden }
import { parseAmount } from './discord-alerts.js';

export const INTENTS = new Set(['sell', 'buy', 'talk']);
export const GAP_MS = 120000;
export const DAILY_MAX = 10;
export const REPORTS_TO_HIDE = 3;
const LINK = /(https?:|www\.|\.(com|net|gg|kr|io|me|ly)\b|discord\.gg|t\.me)/i;
// Real-money trading and contact handles: not allowed in the game, not allowed here.
const RMT = /(현금|계좌|입금|토스|카카오페이|카톡|오픈채팅|오픈톡|텔레그램|\d\s*(?:천|만)?\s*원|paypal|venmo|cashapp|zelle|usdt|\$\s?\d|\d\s?\$|\busd\b|real money|irl money)/i;
const BAD_WORDS = ['씨발', '시발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새끼', 'fuck', 'nigger'];

// Returns { row } ready to insert, or { error } (a short code the page turns into a sentence).
export function validFreeMega(body, known) {
  // Any name up to 20 characters, spaces included ("GMS Manager", owner 2026-11-20); control characters and runs of
  // spaces are cleaned, links and mentions are kept out.
  const nick = String(body?.nick ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const intent = String(body?.intent ?? '');
  const text = String(body?.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nick.length < 2 || nick.length > 20 || LINK.test(nick) || /[@<>`]/.test(nick)) return { error: 'nick' };
  if (!INTENTS.has(intent)) return { error: 'intent' };
  if (text.length > 80) return { error: 'length' };
  if (LINK.test(text)) return { error: 'link' };
  if (RMT.test(text)) return { error: 'rmt' };
  let item = null;
  if (body?.item != null && body.item !== '') {
    item = Number(body.item);
    if (!Number.isInteger(item) || !(known ? known.has(item) : item > 0)) return { error: 'item' };
  }
  let price = null;
  if (body?.price != null && String(body.price).trim() !== '') {
    price = typeof body.price === 'number' ? Math.round(body.price) : parseAmount(body.price);
    if (!(price >= 1 && price <= 1e10)) return { error: 'price' };
  }
  if (intent === 'talk') { item = null; price = null; }
  if (intent === 'talk' ? text.length < 2 : item == null && text.length < 2) return { error: 'empty' };
  let channel = null;
  if (body?.channel != null && body.channel !== '') {
    channel = Number(body.channel);
    if (!Number.isInteger(channel) || channel < 1 || channel > 40) return { error: 'channel' };
  }
  const clean = BAD_WORDS.reduce((t, w) => t.split(w).join('*'.repeat(w.length)), text);
  return { row: { nick, intent, item, price, text: clean, channel } };
}

const randomKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function listFreeMegas(env, params) {
  const after = Math.max(0, Number(params.get('after')) || 0);
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 60));
  const { results } = await env.DB.prepare(`SELECT id, at, nick, intent, item, price, text, channel FROM free_megaphones
    WHERE id > ? AND hidden = 0 ORDER BY id DESC LIMIT ?`).bind(after, limit).all();
  return { rows: results, at: new Date().toISOString() };
}

export async function postFreeMega(env, body, reporter, known) {
  const v = validFreeMega(body, known);
  if (v.error) return [{ error: v.error }, 400];
  const recent = await env.DB.prepare(`SELECT
      SUM(at >= datetime('now', ?)) AS fresh, COUNT(*) AS day FROM free_megaphones WHERE reporter = ? AND at >= datetime('now', '-1 day')`)
    .bind(`-${GAP_MS / 1000} seconds`, reporter).first();
  if ((recent?.fresh || 0) > 0) return [{ error: 'slow', wait: GAP_MS / 1000 }, 429];
  if ((recent?.day || 0) >= DAILY_MAX) return [{ error: 'daily' }, 429];
  const key = randomKey();
  const r = v.row;
  const row = await env.DB.prepare(`INSERT INTO free_megaphones (nick, intent, item, price, text, channel, reporter, key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, at, nick, intent, item, price, text, channel`)
    .bind(r.nick, r.intent, r.item, r.price, r.text, r.channel, reporter, key).first();
  return [{ row, key }, 200];
}

export async function deleteFreeMega(env, id, key) {
  if (!Number.isInteger(id) || !key) return [{ error: 'bad' }, 400];
  const r = await env.DB.prepare('DELETE FROM free_megaphones WHERE id = ? AND key = ?').bind(id, String(key)).run();
  return r.meta.changes ? [{ ok: true }, 200] : [{ error: 'not found' }, 404];
}

export async function reportFreeMega(env, id, reporter) {
  if (!Number.isInteger(id)) return [{ error: 'bad' }, 400];
  const add = await env.DB.prepare('INSERT OR IGNORE INTO free_megaphone_reports (post, reporter) SELECT id, ? FROM free_megaphones WHERE id = ?').bind(reporter, id).run();
  if (!add.meta.changes) return [{ ok: true, hidden: false }, 200];
  const row = await env.DB.prepare(`UPDATE free_megaphones SET reports = reports + 1, hidden = (reports + 1 >= ${REPORTS_TO_HIDE}) WHERE id = ? RETURNING hidden`).bind(id).first();
  return [{ ok: true, hidden: !!row?.hidden }, 200];
}

export async function pruneFreeMegas(env) {
  // Posts are kept; only reports of posts their writer deleted are cleared.
  await env.DB.prepare('DELETE FROM free_megaphone_reports WHERE post NOT IN (SELECT id FROM free_megaphones)').run();
}
