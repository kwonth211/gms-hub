// Price alerts set from the website through "Log in with Discord" (OAuth2, scopes identify + guilds.join):
//   GET /discord/oauth/start?item=&price=&intent=&lang=&ret=  → Discord's consent screen
//   GET /discord/oauth?code=&state=                           → join the GMS Hub server, save the alert, DM, back to ret
// The consent screen shows that the app will join the server for the user, so every site alert also brings a member.
// Needs the DISCORD_CLIENT_SECRET secret and the redirect URI registered on the Developer Portal; without the secret
// the start route sends the visitor back with dalert=off and the page explains the /alert command instead.
import { addAlert, sendDm, priceLabel } from './discord-alerts.js';

const API = 'https://discord.com/api/v10';
const SITE = 'https://gms-hub.com';
const STATE_TTL = 15 * 60 * 1000;
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
// The state carries the alert itself (signed), so nothing is stored before the user agrees.
export async function signState(secret, data) {
  const body = b64url(enc.encode(JSON.stringify({ ...data, t: Date.now() })));
  return `${body}.${await hmac(secret, body)}`;
}
export async function readState(secret, state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig || sig !== (await hmac(secret, body))) return null;
  try {
    const d = JSON.parse(fromB64url(body));
    return Date.now() - d.t < STATE_TTL ? d : null;
  } catch { return null; }
}

// Only a path on the site, so the route cannot bounce visitors elsewhere.
const safeReturn = (ret, lang) => (/^\/[A-Za-z0-9/_\-.?=&%]*$/.test(ret || '') && !String(ret).startsWith('//') ? ret : `/${lang}/tools/market/`);
function back(ret, params) {
  const u = new URL(ret, SITE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
}
const redirectUri = (origin) => `${origin}/discord/oauth`;

export async function oauthStart(url, env, knownItem) {
  const lang = url.searchParams.get('lang') === 'ko' ? 'ko' : 'en';
  const ret = safeReturn(url.searchParams.get('ret'), lang);
  const item = Number(url.searchParams.get('item'));
  const price = Math.round(Number(url.searchParams.get('price')));
  const intent = url.searchParams.get('intent') === 'buy' ? 'buy' : 'sell';
  if (!env.DISCORD_CLIENT_SECRET || !env.DISCORD_BOT_TOKEN || !env.DISCORD_APP_ID) return back(ret, { dalert: 'off', item: item || '' });
  if (!Number.isInteger(item) || !(await knownItem(item)) || !(price >= 1 && price <= 1e10)) return back(ret, { dalert: 'bad', item: item || '' });
  const state = await signState(env.DISCORD_CLIENT_SECRET, { item, price, intent, lang, ret });
  const q = new URLSearchParams({ client_id: env.DISCORD_APP_ID, response_type: 'code', redirect_uri: redirectUri(url.origin), scope: 'identify guilds.join', state, prompt: 'none' });
  return Response.redirect(`https://discord.com/oauth2/authorize?${q}`, 302);
}

export async function oauthCallback(url, env, nameOf) {
  const s = env.DISCORD_CLIENT_SECRET ? await readState(env.DISCORD_CLIENT_SECRET, url.searchParams.get('state')) : null;
  if (!s) return back('/en/tools/market/', { dalert: 'expired' });
  const ret = safeReturn(s.ret, s.lang);
  // The user pressed Cancel on Discord's screen.
  if (!url.searchParams.get('code')) return back(ret, { dalert: 'cancel', item: s.item });
  try {
    const tok = await fetch(`${API}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri(url.origin) }) });
    if (!tok.ok) throw new Error(`token ${tok.status}`);
    const { access_token } = await tok.json();
    const me = await (await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } })).json();
    if (!me?.id) throw new Error('no user');
    // Join the GMS Hub server (201 joined, 204 already a member); a shared server is what lets the bot DM them.
    await fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/members/${me.id}`, { method: 'PUT', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token }) }).catch(() => null);
    const r = await addAlert(env, me.id, s.item, s.intent, s.lang, s.price);
    if (r.full) return back(ret, { dalert: 'full', item: s.item });
    const ko = s.lang === 'ko', name = nameOf(s.item, s.lang) || `#${s.item}`, cond = priceLabel(s.price, s.intent, ko);
    const ok = r.channel && await sendDm(env, r.channel, ko
      ? `🔔 **${name}** ${cond} 알림을 켰어요. ${s.intent === 'buy' ? '그 가격 이상에 사겠다는 확성기' : '그 가격 이하 상점 매물이나 확성기'}가 뜨면 여기로 알려 드려요.\n알림 목록은 \`/알림 목록\`, 끄기는 \`/알림 삭제\`예요.`
      : `🔔 Watching **${name}** at ${cond}. When ${s.intent === 'buy' ? 'a buyer offers that much' : 'a shop or megaphone sells it at that price'}, you get a message here.\nSee your alerts with \`/alert list\`, stop one with \`/alert remove\`.`);
    return back(ret, { dalert: ok ? 'ok' : 'nodm', item: s.item });
  } catch {
    return back(ret, { dalert: 'fail', item: s.item });
  }
}
