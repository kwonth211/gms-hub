// GMS Hub Bot slash commands, served as a Discord "interactions endpoint" (POST /discord/interactions), so no bot process
// has to stay online. Discord signs every request (Ed25519, DISCORD_PUBLIC_KEY in wrangler.toml). Commands answer from the
// site's own data: assets/bot.json (item search index, monsters, training routes; written by scripts/build.mjs) and the
// price summary of this worker. Replies are Korean for Korean Discord clients and English otherwise, and link back to the
// site. /alert and /feedback act through the bot token (discord-alerts.js). Commands are registered by
// scripts/discord-commands.mjs.
import { searchEntries, indexEntry } from '../../assets/search-index.js';
import { addAlert, listAlerts, removeAlert, sendDm, relayFeedback, MAX_ALERTS } from './discord-alerts.js';

const SITE = 'https://gms-hub.com';
const BOT_DATA = `${SITE}/assets/bot.json`;
const hex = (s) => new Uint8Array((s.match(/../g) || []).map((b) => parseInt(b, 16)));

export async function verifyDiscord(req, body, publicKey) {
  const sig = req.headers.get('X-Signature-Ed25519') || '', ts = req.headers.get('X-Signature-Timestamp') || '';
  if (!publicKey || !/^[0-9a-f]{128}$/i.test(sig) || !ts) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch { return false; }
}

let data = null, dataAt = 0;
async function load(fetcher = fetch) {
  if (data && Date.now() - dataAt < 3600000) return data;
  const r = await fetcher(BOT_DATA, { cf: { cacheTtl: 1800 } });
  if (!r.ok) throw new Error(`bot data ${r.status}`);
  const d = await r.json();
  d.mobEntries = d.mobs.map((m) => indexEntry({ id: m.id, title: m.en, names: [m.ko, m.en, ...(m.aka || [])] }));
  d.mobById = new Map(d.mobs.map((m) => [m.id, m]));
  d.itemById = new Map(d.items.map((i) => [i.id, i]));
  data = d; dataAt = Date.now();
  return d;
}

const money = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
const num = (n) => Number(n || 0).toLocaleString('en-US');
const reply = (payload) => Response.json({ type: 4, data: { allowed_mentions: { parse: [] }, ...payload } });
const embed = (e) => reply({ embeds: [{ color: 0xf08019, footer: { text: 'GMS Hub · gms-hub.com' }, ...e }] });
const JOBS = { warrior: ['전사', 'Warrior'], fighter: ['파이터', 'Fighter'], mage: ['마법사', 'Magician'], fire: ['위자드(불,독)', 'Wizard (Fire, Poison)'],
  ice: ['위자드(썬,콜)', 'Wizard (Ice, Lightning)'], cleric: ['클레릭', 'Cleric'], archer: ['궁수', 'Bowman'], hunter: ['헌터', 'Hunter'],
  crossbow: ['사수', 'Crossbowman'], thief: ['도적', 'Thief'], assassin: ['어쌔신', 'Assassin'], bandit: ['시프', 'Bandit'] };
// A first-job route also suits its second jobs, and the other way round, so the family is matched.
const FAMILY = { warrior: ['warrior', 'fighter'], fighter: ['warrior', 'fighter'], mage: ['mage', 'fire', 'ice', 'cleric'], fire: ['mage', 'fire'], ice: ['mage', 'ice'],
  cleric: ['mage', 'cleric'], archer: ['archer', 'hunter', 'crossbow'], hunter: ['archer', 'hunter'], crossbow: ['archer', 'crossbow'],
  thief: ['thief', 'assassin', 'bandit'], assassin: ['thief', 'assassin'], bandit: ['thief', 'bandit'] };

export const COMMANDS = [
  { name: 'price', name_localizations: { ko: '시세' }, description: 'Free Market price of an item', description_localizations: { ko: '아이템의 자유시장 시세' },
    options: [{ type: 3, name: 'item', name_localizations: { ko: '아이템' }, description: 'Item name (Korean, English or short names like 장공)', description_localizations: { ko: '아이템 이름 (한글, 영문, 장공 같은 줄임말)' }, required: true, autocomplete: true }] },
  { name: 'mob', name_localizations: { ko: '몬스터' }, description: 'Monster level, HP, EXP, maps and drops', description_localizations: { ko: '몬스터 레벨, HP, 경험치, 맵, 드롭' },
    options: [{ type: 3, name: 'name', name_localizations: { ko: '이름' }, description: 'Monster name', description_localizations: { ko: '몬스터 이름' }, required: true, autocomplete: true }] },
  { name: 'train', name_localizations: { ko: '사냥터' }, description: 'Training spots for your level and class', description_localizations: { ko: '레벨과 직업에 맞는 사냥터' },
    options: [{ type: 4, name: 'level', name_localizations: { ko: '레벨' }, description: 'Your level (1-200)', description_localizations: { ko: '내 레벨 (1-200)' }, required: true, min_value: 1, max_value: 200 },
      { type: 3, name: 'class', name_localizations: { ko: '직업' }, description: 'Your class', description_localizations: { ko: '내 직업' }, required: false,
        choices: Object.entries(JOBS).map(([value, [ko, en]]) => ({ name: en, name_localizations: { ko }, value })) }] },
  { name: 'alert', name_localizations: { ko: '알림' }, description: 'Get a DM when a megaphone names an item', description_localizations: { ko: '확성기에 아이템이 뜨면 DM으로 알림' },
    options: [
      { type: 1, name: 'add', name_localizations: { ko: '추가' }, description: 'Watch an item', description_localizations: { ko: '아이템 알림 추가' }, options: [{ type: 3, name: 'item', name_localizations: { ko: '아이템' }, description: 'Item name', description_localizations: { ko: '아이템 이름' }, required: true, autocomplete: true },
        { type: 3, name: 'when', name_localizations: { ko: '조건' }, description: 'Which megaphones (default: both)', description_localizations: { ko: '어떤 확성기 (기본: 둘 다)' }, required: false,
          choices: [{ name: 'Someone is selling it', name_localizations: { ko: '누가 팔 때' }, value: 'sell' }, { name: 'Someone wants to buy it', name_localizations: { ko: '누가 살 때' }, value: 'buy' }, { name: 'Both', name_localizations: { ko: '둘 다' }, value: 'any' }] }] },
      { type: 1, name: 'list', name_localizations: { ko: '목록' }, description: 'Your alerts', description_localizations: { ko: '내 알림 목록' } },
      { type: 1, name: 'remove', name_localizations: { ko: '삭제' }, description: 'Stop watching an item', description_localizations: { ko: '아이템 알림 삭제' }, options: [{ type: 3, name: 'item', name_localizations: { ko: '아이템' }, description: 'Item name', description_localizations: { ko: '아이템 이름' }, required: true, autocomplete: true }] }] },
  { name: 'feedback', name_localizations: { ko: '건의' }, description: 'Send feedback or a bug report to GMS Hub', description_localizations: { ko: 'GMS Hub에 건의나 오류 제보 보내기' },
    options: [{ type: 3, name: 'text', name_localizations: { ko: '내용' }, description: 'What should we fix or add?', description_localizations: { ko: '고치거나 추가했으면 하는 것' }, required: true, min_length: 5, max_length: 1000 }] },
  { name: 'gmshub', description: 'About GMS Hub and its Discord', description_localizations: { ko: 'GMS Hub 사이트와 디스코드 안내' } },
].map((c) => ({ type: 1, integration_types: [0, 1], contexts: [0, 1, 2], ...c }));

function choices(d, name, q, ko) {
  const list = name === 'mob' ? d.mobEntries : d.items;
  return searchEntries(list, q).slice(0, 20).map((e) => {
    const src = name === 'mob' ? d.mobById.get(e.id) : e;
    const label = ko && src.ko ? `${src.ko} (${src.en || e.title})` : src.en || e.title;
    return { name: label.slice(0, 100), value: String(e.id) };
  });
}
// The option holds an id when it was picked from the suggestions, or free text when it was typed and sent.
function pick(d, name, value) {
  const byId = name === 'mob' ? d.mobById : d.itemById, id = Number(value);
  if (Number.isInteger(id) && byId.has(id)) return byId.get(id);
  const hit = searchEntries(name === 'mob' ? d.mobEntries : d.items, String(value))[0];
  return hit ? byId.get(hit.id) : null;
}

export async function handleInteraction(i, { prices, discord, fetcher, env }) {
  if (i.type === 1) return Response.json({ type: 1 });
  const ko = String(i.locale || '').startsWith('ko'), lang = ko ? 'ko' : 'en';
  const tr = (k, e) => (ko ? k : e);
  // A subcommand (/alert add …) nests its options one level down.
  const top = i.data?.options || [], sub = top[0]?.type === 1 ? top[0] : null, options = sub ? sub.options || [] : top;
  const name = i.data?.name, opt = Object.fromEntries(options.map((o) => [o.name, o]));
  const user = i.member?.user || i.user || {};
  const d = await load(fetcher);
  if (i.type === 4) {
    const q = String(options.find((o) => o.focused)?.value || '').trim();
    return Response.json({ type: 8, data: { choices: q ? choices(d, name, q, ko) : [] } });
  }
  if (i.type !== 2) return Response.json({ type: 1 });

  if (name === 'price') {
    const item = pick(d, 'price', opt.item?.value);
    if (!item) return reply({ content: tr('그 이름의 아이템을 찾지 못했어요. 입력할 때 뜨는 목록에서 골라 주세요.', 'No item by that name. Pick one from the suggestions while typing.'), flags: 64 });
    const p = (await prices(item.id).catch(() => ({})))[item.id];
    const url = `${SITE}/${lang}/tools/market/?item=${item.id}&utm_source=discord&utm_medium=bot`;
    const title = ko && item.ko ? `${item.ko} (${item.en})` : item.en;
    const thumbnail = { url: `https://maplestory.io/api/MCW/1/item/${item.id}/icon?resize=2` };
    if (!p) return embed({ title, url, thumbnail, description: tr('아직 시세 기록이 없어요. 게임에서 상점을 스캔하거나 사이트에서 가격을 제보하면 여기에 나와요.', 'No price data yet. Scan a shop in game or report a price on the site and it shows up here.') });
    const BASIS = { sold: tr('판매 완료 기준', 'from completed sales'), selling: tr('판매 중 매물 기준', 'from open listings'), buying: tr('구매 희망가 기준', 'from buy offers'),
      mega: tr('확성기 호가 기준', 'from megaphone asking prices'), typical: tr('참고 가격', 'reference price') };
    const fields = [{ name: tr('가격', 'Price'), value: `**${money(p.median)}** ${tr('메소', 'mesos')}\n${BASIS[p.basis] || ''}`, inline: true }];
    if (p.low && p.high && p.low !== p.high) fields.push({ name: tr('범위', 'Range'), value: `${money(p.low)} – ${money(p.high)}`, inline: true });
    if (p.n) fields.push({ name: tr('기록 수', 'Records'), value: num(p.n), inline: true });
    if (p.mega && p.basis !== 'mega') fields.push({ name: tr('확성기 호가', 'Megaphone asks'), value: `${money(p.mega.p25)} – ${money(p.mega.p75)} (${p.mega.n})`, inline: true });
    return embed({ title, url, thumbnail, fields, description: tr(`[시세 그래프와 판매 중인 상점 보기](${url})`, `[Price chart and open shops](${url})`), ...(p.last ? { timestamp: new Date(`${p.last.replace(' ', 'T')}Z`).toISOString() } : {}) });
  }

  if (name === 'mob') {
    const m = pick(d, 'mob', opt.name?.value);
    if (!m) return reply({ content: tr('그 이름의 몬스터를 찾지 못했어요.', 'No monster by that name.'), flags: 64 });
    const url = `${SITE}/${lang}/monsters/${m.id}/?utm_source=discord&utm_medium=bot`;
    const fields = [{ name: tr('레벨', 'Level'), value: String(m.lv), inline: true }, { name: 'HP', value: num(m.hp), inline: true }, { name: tr('경험치', 'EXP'), value: num(m.exp), inline: true }];
    if (m.maps?.length) fields.push({ name: tr('많이 나오는 맵', 'Busiest maps'), value: m.maps.map(([k, e, n]) => `${ko && k ? k : e} (${n})`).join('\n') });
    if (m.drops?.length) fields.push({ name: tr('드롭 (일부)', 'Drops (some)'), value: m.drops.map(([k, e]) => (ko && k ? k : e)).join(', ') });
    return embed({ title: ko && m.ko ? `${m.ko} (${m.en})` : m.en, url, thumbnail: { url: `${SITE}/assets/monsters/${m.id}.gif` }, fields,
      description: tr(`[전체 드롭, 필요 명중률, 몇 방 컷인지 보기](${url})`, `[All drops, accuracy needed and hits to kill](${url})`) });
  }

  if (name === 'train') {
    const level = Number(opt.level?.value), job = opt.class?.value, fam = FAMILY[job];
    const fits = d.routes.filter((r) => level >= r.min && level <= r.max && (!fam || !r.jobs.length || r.jobs.some((j) => fam.includes(j))))
      .sort((a, b) => (fam ? (b.jobs.includes(job) - a.jobs.includes(job)) || (b.jobs.length > 0) - (a.jobs.length > 0) : 0)).slice(0, 4);
    const url = `${SITE}/${lang}/tools/training/?utm_source=discord&utm_medium=bot`;
    const who = `Lv. ${level}${job ? ` ${JOBS[job][ko ? 0 : 1]}` : ''}`;
    if (!fits.length) return embed({ title: tr(`${who} 사냥터`, `Training spots for ${who}`), url, description: tr(`이 구간에 정리된 사냥터가 아직 없어요. [사냥터 찾기](${url})에서 가까운 구간을 확인해 보세요.`, `No route is written up for this range yet. See nearby ranges in the [training finder](${url}).`) });
    return embed({ title: tr(`${who} 사냥터`, `Training spots for ${who}`), url,
      fields: fits.map((r) => ({ name: `${r.title[lang]} · Lv. ${r.min}–${r.max}`, value: `${r.monsters[lang]}\n${r.summary[lang]}`.slice(0, 1000) })),
      description: tr(`[진입 조건, 동선, 물약 비용까지 보기](${url})`, `[Entry conditions, rotation and supply costs](${url})`) });
  }

  const hidden = (content) => reply({ content, flags: 64 });
  const label = (it) => (ko && it.ko ? `${it.ko} (${it.en})` : it.en);
  if (name === 'alert') {
    if (!env?.DISCORD_BOT_TOKEN || !user.id) return hidden(tr('알림 기능을 준비하고 있어요.', 'Alerts are not available yet.'));
    if (sub?.name === 'list') {
      const rows = await listAlerts(env, user.id);
      const WHEN = { sell: tr('누가 팔 때', 'selling'), buy: tr('누가 살 때', 'buying'), any: tr('둘 다', 'both') };
      return hidden(rows.length ? `${tr('내 알림', 'Your alerts')} (${rows.length}/${MAX_ALERTS})\n${rows.map((r) => `- ${d.itemById.has(r.item) ? label(d.itemById.get(r.item)) : r.item} · ${WHEN[r.intent]}`).join('\n')}`
        : tr('설정한 알림이 없어요. `/알림 추가`로 아이템을 넣어 보세요.', 'No alerts yet. Add one with `/alert add`.'));
    }
    const item = pick(d, 'price', opt.item?.value);
    if (!item) return hidden(tr('그 이름의 아이템을 찾지 못했어요. 입력할 때 뜨는 목록에서 골라 주세요.', 'No item by that name. Pick one from the suggestions while typing.'));
    if (sub?.name === 'remove') return hidden((await removeAlert(env, user.id, item.id)) ? tr(`${label(item)} 알림을 지웠어요.`, `Stopped watching ${label(item)}.`) : tr('그 아이템에는 알림이 없어요.', 'You had no alert for that item.'));
    const intent = ['sell', 'buy'].includes(opt.when?.value) ? opt.when.value : 'any';
    const r = await addAlert(env, user.id, item.id, intent, lang);
    if (r.full) return hidden(tr(`알림은 ${MAX_ALERTS}개까지예요. \`/알림 삭제\`로 하나를 지워 주세요.`, `You can watch up to ${MAX_ALERTS} items. Remove one with \`/alert remove\`.`));
    const ok = r.channel && await sendDm(env, r.channel, tr(`🔔 **${label(item)}** 알림을 켰어요. 게임 확성기에 이 아이템이 뜨면 여기로 알려 드려요.`, `🔔 Watching **${label(item)}**. When a game megaphone names it, you get a message here.`));
    return hidden(ok ? tr(`${label(item)} 알림을 켰어요. DM으로 알려 드릴게요.`, `Watching ${label(item)}. Notices arrive by DM.`)
      : tr(`${label(item)} 알림을 저장했지만 DM을 보낼 수 없어요. GMS Hub 디스코드에 들어오면 받을 수 있어요: ${discord || ''}\n들어온 뒤 \`/알림 추가\`를 한 번 더 해 주세요.`, `Saved, but I cannot DM you. Join the GMS Hub Discord to receive notices: ${discord || ''}\nThen run \`/alert add\` once more.`));
  }
  if (name === 'feedback') {
    const where = i.guild_id ? `server ${i.guild_id}` : 'DM';
    const r = env ? await relayFeedback(env, user, opt.text?.value || '', where) : 'off';
    return hidden(r === 'ok' ? tr(`고마워요, 전달했어요. 진행 상황은 GMS Hub 디스코드에서 볼 수 있어요: ${discord || ''}`, `Thanks, it has been passed on. Follow up in the GMS Hub Discord: ${discord || ''}`)
      : r === 'slow' ? tr('방금 보내셨어요. 1분 뒤에 다시 보내 주세요.', 'You just sent one. Try again in a minute.')
      : tr(`지금은 전달하지 못했어요. GMS Hub 디스코드에 직접 남겨 주세요: ${discord || ''}`, `Could not pass it on right now. Please post it in the GMS Hub Discord: ${discord || ''}`));
  }

  return embed({ title: 'GMS Hub', url: `${SITE}/${lang}/?utm_source=discord&utm_medium=bot`,
    description: tr('메이플스토리 클래식 월드 DB와 도구 모음이에요. 실시간 시세, 드롭, 사냥터, 퀘스트, 맵을 볼 수 있어요.\n명령어: `/시세`, `/몬스터`, `/사냥터`, `/알림`, `/건의`', 'Database and tools for MapleStory Classic World: live prices, drops, training spots, quests and maps.\nCommands: `/price`, `/mob`, `/train`, `/alert`, `/feedback`')
      + (discord ? tr(`\n질문, 건의, 오류 제보는 디스코드에서: ${discord}`, `\nQuestions, feedback and bug reports: ${discord}`) : '') });
}

export async function discordInteractions(req, env, deps) {
  const body = await req.text();
  if (!(await verifyDiscord(req, body, env.DISCORD_PUBLIC_KEY))) return new Response('invalid request signature', { status: 401 });
  try { return await handleInteraction(JSON.parse(body), deps); }
  catch { return Response.json({ type: 4, data: { content: 'Something went wrong. Try again in a moment. · 잠시 후 다시 시도해 주세요.', flags: 64 } }); }
}
