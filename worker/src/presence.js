// Live "people here now" counter: one Durable Object holds every open page's WebSocket. Sockets use the hibernation API,
// so the object sleeps between joins and leaves (no duration billed while idle) and nothing is ever written to storage.
// The keep-alive ping is answered by the runtime itself without waking the object.
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
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (new URL(req.url).pathname === '/chat') return this.joinChat();
    const page = pageKey(new URL(req.url).searchParams.get('p'));
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [page]);
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

  // Every open page gets the site total and its own page's count after each join or leave.
  broadcast(gone) {
    if (gone && this.state.getTags(gone).includes('chat')) return;
    const open = this.state.getWebSockets().filter((ws) => ws !== gone && ws.readyState === 1 && !this.state.getTags(ws).includes('chat'));
    const perPage = new Map();
    for (const ws of open) {
      const page = this.state.getTags(ws)[0];
      perPage.set(page, (perPage.get(page) || 0) + 1);
    }
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

export function handlePresence(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (!PRESENCE_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
  if (!env.PRESENCE) return new Response('presence off', { status: 503 });
  const room = new URL(req.url).pathname === '/chat' ? 'chat' : 'site';
  return env.PRESENCE.get(env.PRESENCE.idFromName(room)).fetch(req);
}
