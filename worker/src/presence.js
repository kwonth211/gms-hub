// Live "people here now" counter: one Durable Object holds every open page's WebSocket. Sockets use the hibernation API,
// so the object sleeps between joins and leaves (no duration billed while idle). The only thing kept in storage is the
// all-time peak (one value: the highest number of open pages and when it happened), written only when it is beaten.
// The keep-alive ping is answered by the runtime itself without waking the object.
import { sameSecret } from './secure.js';
export const PRESENCE_ORIGINS = ['https://gms-hub.com', 'https://www.gms-hub.com', 'http://localhost:8790', 'http://127.0.0.1:8790'];

// One room per page regardless of language or query: /ko/tools/market/?item=1 and /en/tools/market/ are the same page.
export function pageKey(raw) {
  const p = String(raw || '/').split(/[?#]/)[0].replace(/^\/(ko|en|zh|ja)(?=\/|$)/, '') || '/';
  return p.slice(0, 120);
}

export class Presence {
  constructor(state) {
    this.state = state;
    if (globalThis.WebSocketRequestResponsePair) state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    // Internal push (only the worker itself can reach this object): fan a message out to every page's socket.
    if (new URL(req.url).pathname === '/push' && req.method === 'POST') {
      const out = await req.text();
      for (const ws of this.state.getWebSockets()) if (!this.state.getTags(ws).includes('chat')) { try { ws.send(out); } catch (e) {} }
      return new Response(null, { status: 204 });
    }
    // Internal read of the record (the worker checks the owner's token before asking): { peak, at, now, pages }.
    if (new URL(req.url).pathname === '/peak') {
      const open = this.state.getWebSockets().filter((ws) => ws.readyState === 1 && !this.state.getTags(ws).includes('chat'));
      const now = open.length;
      await this.notePeak(now);
      const peak = await this.loadPeak();
      // Which pages are open right now (owner's dashboard): [[page, tabs], ...], busiest first. Language is not kept.
      const by = new Map();
      for (const ws of open) { const pg = this.state.getTags(ws)[0] || '/'; by.set(pg, (by.get(pg) || 0) + 1); }
      const pages = [...by].sort((a, b) => b[1] - a[1]).slice(0, 20);
      // Per holder: tabs, pages, how long open and how long since the last keep-alive ping (a tab that stopped pinging is a
      // dead connection the browser never closed).
      const t = Date.now(), groups = new Map();
      let silent = 0;
      for (const ws of open) {
        let a = {};
        try { a = ws.deserializeAttachment() || {}; } catch (e) {}
        let ping = null;
        try { ping = this.state.getWebSocketAutoResponseTimestamp?.(ws)?.getTime() || null; } catch (e) {}
        const quiet = Math.round((t - (ping || a.t || t)) / 1000);
        if (quiet > 150) silent++;
        const k = a.who || 'before-log';
        const g = groups.get(k) || { who: k, tabs: 0, country: a.c || '', org: a.org || '', ua: a.ua || '', pages: {}, langs: {}, oldestMin: 0, quietSec: [] };
        g.tabs++;
        const pg = this.state.getTags(ws)[0] || '/';
        g.pages[pg] = (g.pages[pg] || 0) + 1;
        // Tabs per page and language: { '/tools/market/': { ko: 2, en: 1 } }; '' = opened before this was recorded.
        const byLang = g.langs[pg] || (g.langs[pg] = {});
        byLang[a.lang || ''] = (byLang[a.lang || ''] || 0) + 1;
        if (a.t) g.oldestMin = Math.max(g.oldestMin, Math.round((t - a.t) / 60000));
        g.quietSec.push(quiet);
        groups.set(k, g);
      }
      const who = [...groups.values()].sort((x, y) => y.tabs - x.tabs).slice(0, 40);
      return Response.json({ peak: peak.n, at: peak.at, now, pages, silent, who });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (new URL(req.url).pathname === '/chat') return this.joinChat();
    const rawPage = new URL(req.url).searchParams.get('p');
    const page = pageKey(rawPage);
    // The language the page was opened in (ko, en, zh, ja), for the owner's who-holds-tabs table. The room itself stays per page.
    const pageLang = (String(rawPage || '').match(/^\/(ko|en|zh|ja)(?=\/|$)/) || [])[1] || '';
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [page]);
    // Who holds the tab (owner's check, 2026-11-18): a salted hash of the IP (never the IP), country, network and a short
    // browser label, kept only on the socket while it is open. No storage, no D1.
    try { server.serializeAttachment({ t: Date.now(), who: req.headers.get('x-gms-who') || '', c: req.headers.get('x-gms-country') || '', org: req.headers.get('x-gms-org') || '', ua: req.headers.get('x-gms-ua') || '', lang: pageLang }); } catch (e) {}
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  // Site chat lives in its own instance of this class ('chat'): the last 30 lines are kept in storage for newcomers.
  async joinChat() {
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, ['chat']);
    server.serializeAttachment({ last: 0 });
    const history = (await this.state.storage.get('history')) || [];
    server.send(JSON.stringify({ type: 'history', items: history, n: this.state.getWebSockets('chat').length }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (!this.state.getTags(ws).includes('chat')) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const line = chatLine(m, ws.deserializeAttachment()?.last || 0);
    if (line.error) { ws.send(JSON.stringify({ type: 'error', error: line.error })); return; }
    ws.serializeAttachment({ last: Date.now() });
    const history = ((await this.state.storage.get('history')) || []).concat(line).slice(-30);
    await this.state.storage.put('history', history);
    const out = JSON.stringify({ type: 'chat', ...line });
    for (const peer of this.state.getWebSockets('chat')) { try { peer.send(out); } catch (e) {} }
  }

  webSocketClose(ws) {
    try { ws.close(1000); } catch (e) {}
    this.broadcast(ws);
  }

  webSocketError(ws) {
    this.broadcast(ws);
  }

  // The site's record of pages open at once (real count, internal use): { n, at }. Read from storage once per wake.
  async loadPeak() {
    if (!this.peak) this.peak = (await this.state.storage?.get('peak')) || { n: 0, at: null };
    return this.peak;
  }
  async notePeak(n, now = new Date()) {
    const peak = await this.loadPeak();
    if (n <= peak.n) return false;
    this.peak = { n, at: now.toISOString() };
    await this.state.storage?.put('peak', this.peak);
    return true;
  }

  // Every open page gets the site total and its own page's count after each join or leave.
  broadcast(gone) {
    if (gone && this.state.getTags(gone).includes('chat')) return;
    const open = this.state.getWebSockets().filter((ws) => ws !== gone && ws.readyState === 1 && !this.state.getTags(ws).includes('chat'));
    const perPage = new Map();
    for (const ws of open) {
      const page = this.state.getTags(ws)[0];
      perPage.set(page, (perPage.get(page) || 0) + 1);
    }
    this.notePeak(open.length).catch(() => {});
    for (const ws of open) {
      try { ws.send(JSON.stringify({ site: open.length, here: perPage.get(this.state.getTags(ws)[0]) || 0 })); } catch (e) {}
    }
  }
}

// A chat line from a visitor: a nickname of 2-12 letters, up to 140 characters, no links, one line every 3 seconds.
const BLOCKED = /(https?:|www\.|\.(com|net|gg|kr|io)\b|discord\.gg)/i;
const BAD_WORDS = ['씨발', '시발', '병신', '좆', '개새끼', 'fuck', 'nigger'];
export function chatLine(m, last, now = Date.now()) {
  const name = String(m?.name || '').trim(), text = String(m?.text || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (m?.type !== 'say') return { error: 'bad message' };
  if (!/^[\p{L}\p{N}_ ]{2,12}$/u.test(name)) return { error: 'name' };
  if (!text || text.length > 140) return { error: 'length' };
  if (BLOCKED.test(text)) return { error: 'link' };
  if (now - last < 3000) return { error: 'slow' };
  const clean = BAD_WORDS.reduce((t, w) => t.split(w).join('*'.repeat(w.length)), text);
  return { name, text: clean, at: new Date(now).toISOString() };
}

// GET /internal/presence-peak (Authorization: Bearer MAIL_ADMIN_TOKEN): the record of pages open at once and the count
// right now. Owner only; read it with scripts/peak.py.
export async function handlePresencePeak(req, env) {
  const auth = req.headers.get('Authorization') || '';
  if (!env.MAIL_ADMIN_TOKEN || !(await sameSecret(auth, `Bearer ${env.MAIL_ADMIN_TOKEN}`))) return new Response('forbidden', { status: 403 });
  if (!env.PRESENCE) return new Response('presence off', { status: 503 });
  return env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch('https://presence/peak');
}

export async function handlePresence(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (!PRESENCE_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
  if (!env.PRESENCE) return new Response('presence off', { status: 503 });
  const room = new URL(req.url).pathname === '/chat' ? 'chat' : 'site';
  let fwd = req;
  if (room === 'site') {
    const h = new Headers(req.headers);
    const ip = req.headers.get('CF-Connecting-IP') || '';
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.VOTE_SALT || ''}:presence:${ip}`));
    h.set('x-gms-who', [...new Uint8Array(d)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join(''));
    h.set('x-gms-country', String(req.cf?.country || ''));
    h.set('x-gms-org', String(req.cf?.asOrganization || '').slice(0, 60));
    h.set('x-gms-ua', uaLabel(req.headers.get('User-Agent') || ''));
    fwd = new Request(req, { headers: h });
  }
  return env.PRESENCE.get(env.PRESENCE.idFromName(room)).fetch(fwd);
}

// "Windows Chrome", "iPhone Safari", "Linux HeadlessChrome": enough to tell people from bots, nothing more.
export function uaLabel(ua) {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'other';
  const br = /HeadlessChrome/.test(ua) ? 'HeadlessChrome' : /bot|crawl|spider|facebookexternalhit/i.test(ua) ? 'bot' : /Edg\//.test(ua) ? 'Edge' : /Whale\//.test(ua) ? 'Whale' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'other';
  return `${os} ${br}`;
}
