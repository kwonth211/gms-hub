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
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const page = pageKey(new URL(req.url).searchParams.get('p'));
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [page]);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {}

  webSocketClose(ws) {
    try { ws.close(1000); } catch (e) {}
    this.broadcast(ws);
  }

  webSocketError(ws) {
    this.broadcast(ws);
  }

  // Every open page gets the site total and its own page's count after each join or leave.
  broadcast(gone) {
    const open = this.state.getWebSockets().filter((ws) => ws !== gone && ws.readyState === 1);
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

export function handlePresence(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (!PRESENCE_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
  if (!env.PRESENCE) return new Response('presence off', { status: 503 });
  return env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch(req);
}
