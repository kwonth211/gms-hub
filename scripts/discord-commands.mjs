// Registers the GMS Hub Bot slash commands with Discord (global, so they work in any server and in DMs) and points the
// application at the worker's interactions endpoint. Run after changing COMMANDS in worker/src/discord-bot.js:
//   node scripts/discord-commands.mjs            (token read from ~/gms-hub-discord/.token)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMMANDS } from '../worker/src/discord-bot.js';
const token = (process.env.DISCORD_BOT_TOKEN || fs.readFileSync(path.join(os.homedir(), 'gms-hub-discord', '.token'), 'utf8')).trim();
const ENDPOINT = 'https://gms-hub-votes.kwonth211.workers.dev/discord/interactions';
const api = async (method, p, body) => {
  const r = await fetch(`https://discord.com/api/v10${p}`, { method, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
};
const app = await api('GET', '/applications/@me');
const cmds = await api('PUT', `/applications/${app.id}/commands`, COMMANDS);
console.log('commands:', cmds.map((c) => c.name).join(', '));
if (app.interactions_endpoint_url !== ENDPOINT) {
  const a = await api('PATCH', '/applications/@me', { interactions_endpoint_url: ENDPOINT });
  console.log('endpoint:', a.interactions_endpoint_url);
} else console.log('endpoint already set');
