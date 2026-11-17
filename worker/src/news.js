// Official Classic World notices (maintenance, updates, events, Cash Shop) for the home page: GET /news.
// The game's news list is public JSON; only the Classic World entries are kept, newest first, with a Korean title
// (rules for the formulaic ones, a hand-written table for the rest; anything else stays in English), a few lines on
// what it says (sum) and, for a maintenance that has not finished, its start and end times read from the notice body. Nothing is stored: the
// response is edge-cached for ten minutes (public-cache.js), so the list costs no D1 reads or writes.
const FEED = 'https://g.nexonstatic.com/maplestory/cms/v1/news';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE = `${MONTH}\\.? (\\d{1,2})(?:, \\d{4})?`;
const mon = (s) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;

// Titles the rules cannot write. Keyed by the notice id.
const KO = {
  48552: '11월 업데이트: 이벤트 안내',
  48256: '11월 업데이트: 포가튼 할로우 미리보기',
  47102: '클래식 월드 부채(Debt) 시스템 안내',
  46370: '글로벌 메이플스토리 클래식 월드 정식 출시',
  46800: '[완료] 10월 21일 정식 출시 점검',
  46506: '정식 출시 패치 노트',
  46362: '정식 출시 캐시샵 업데이트',
  46730: '확성기 레벨 제한 변경 안내',
  45490: '파운더스 액세스 시작',
  45819: '파운더스 액세스 캐시샵',
  45621: '파운더스 액세스 패치 노트',
  45385: '클래식 월드 자주 묻는 질문(FAQ)',
};
// What each notice says, in Korean, written by hand (the home list opens these). Maintenance notices get their time,
// version and compensation lines from the notice itself (maintPoints) and these are added after them. `link` is a page
// of ours on the same subject. A notice with no entry shows the feed's own one-line summary.
const KO_POINTS = {
  48557: { p: ['패치 노트는 곧 공개될 예정이에요.'] },
  48552: { p: [
    '새 월드 제니스(Zenith)가 11월 18일 점검이 끝나면 열려요. 채널 10개로 시작하고 파티 퀘스트도 있어요.',
    '윈디아가 최대치인 40채널까지 늘어나서 새 월드를 여는 거예요.',
    '출석 이벤트 "새로운 여정의 시작"이 돌아와요. 점검 후부터 12월 17일 08:59(한국 시간)까지예요.',
    '10레벨 이상이면 월드마다 한 번 참여할 수 있어요. 메이플 운영자에게 퀘스트를 받고, 10레벨 이상 몬스터에게서 단풍잎 30개를 모아 가면 그날 보상을 받아요.',
    '보상은 1일차 달팽이 펫과 물약, 4일차 일반 상점 허가증, 6일차 확성기 3개 등이에요.',
    '하루를 빠져도 진행도는 그대로예요. 정식 출시 때 이미 받은 윈디아 유저도 1일차부터 다시 받을 수 있어요.'] },
  48256: { link: '/forgotten-hollow/', p: [
    '빅토리아 아일랜드에 새 지역 포가튼 할로우가 열려요. 누구나 들어갈 수 있지만 본격적인 콘텐츠는 39레벨부터예요.',
    '39레벨 이상 퀘스트 34개, 새 몬스터, 새 상점과 이 지역에서만 나오는 가구가 추가돼요.',
    '60레벨 필드 보스 썩은 머쉬맘이 나와요.',
    '추수감사절 이벤트도 함께 열려요. 벤슨 할머니의 호박파이 재료 모으기, 달아난 칠면조 잡기, 헤네시스 월묘의 떡이에요.'] },
  47069: { p: [
    '미스터리 헤어 쿠폰 5,500 NX, 미스터리 성형 쿠폰 3,500 NX가 나왔어요.',
    '판매 기간은 11월 11일 17:00부터 11월 25일 16:59까지예요(한국 시간).',
    '쿠폰을 쓰면 정해진 목록 안에서 헤어나 얼굴이 무작위로 바뀌어요.',
    '미스터리 패션 상자는 11월 18일 점검 전까지 계속 팔아요.'] },
  47580: { p: [
    '봇 탐지와 차단 시스템이 개선됐어요.',
    'NX를 처음 결제하면 96시간 캐시 아이템 거래 제한이 걸리는데, 그동안 확성기(일반·고확·아이템·더블 아이템)도 쓸 수 없게 됐어요. 그 월드의 계정 내 모든 캐릭터에 적용돼요.'] },
  47031: { p: [
    '미스터리 패션 상자가 새로 나왔어요. 1개 3,500 NX, 11개 묶음 35,000 NX예요.',
    '판매 기간은 11월 4일 17:00(한국 시간)부터 11월 18일 점검 전까지예요.',
    '열면 테디베어 세트를 비롯한 코디 장비 중 하나가 무작위로 나와요.'] },
};
const NAMES = { 'Forgotten Hollow': '포가튼 할로우', 'Special Events': '이벤트 안내', 'Grand Launch': '정식 출시' };

export function koTitle(id, name) {
  if (KO[id]) return KO[id];
  let s = String(name || '').trim(), pre = '', m;
  if ((m = /^\[Completed\]\s*/i.exec(s))) { pre = '[완료] '; s = s.slice(m[0].length); }
  else if ((m = new RegExp(`^\\[Updated? ${DATE}\\]\\s*`, 'i').exec(s))) { pre = `[${mon(m[1])}/${Number(m[2])} 수정] `; s = s.slice(m[0].length); }
  const day = (a, b) => `${mon(a)}월 ${Number(b)}일`;
  if ((m = new RegExp(`^(Scheduled|Unscheduled) ([A-Za-z ]+?) - ${DATE}$`).exec(s))) {
    const what = m[2];
    const kind = /Game Update/i.test(what) ? '업데이트 점검' : /Minor Patch/i.test(what) ? '마이너 패치 점검' : !/Maintenance/i.test(what) ? null
      : /Emergency/i.test(what) ? '긴급 점검' : m[1] === 'Unscheduled' ? '임시 점검' : '정기 점검';
    if (kind) return `${pre}${day(m[3], m[4])} ${kind}`;
  }
  if ((m = new RegExp(`^(?:Classic World )?Cash Shop Update: ${DATE}$`).exec(s))) return `${pre}${day(m[1], m[2])} 캐시샵 업데이트`;
  const named = (x) => NAMES[x] || x.replace(new RegExp(`^${MONTH} Update$`), (_, a) => `${mon(a)}월 업데이트`);
  if ((m = new RegExp(`^${MONTH} Update: (.+)$`).exec(s))) {
    const rest = /^(Patch|Release) Notes$/.test(m[2]) ? '패치 노트' : (/^(.+) Preview$/.exec(m[2]) || [])[1] ? `${named(/^(.+) Preview$/.exec(m[2])[1])} 미리보기` : named(m[2]);
    return `${pre}${mon(m[1])}월 업데이트: ${rest}`;
  }
  if ((m = /^(.+) (?:Patch|Release) Notes$/.exec(s))) return `${pre}${named(m[1])} 패치 노트`;
  return pre ? `${pre}${s}` : s;
}

// "PST (UTC -8): 5:00 AM - 10:00 AM" under the notice's first full date -> { start, end } in ISO (UTC).
export function maintWindow(body) {
  const t = text(body);
  const d = new RegExp(`${MONTH} (\\d{1,2}), (\\d{4})`).exec(t);
  const r = /P[SD]T \(UTC ?([-+−]\d{1,2})\): ?(\d{1,2}):(\d{2}) ?([AP]M)[^-–:]{0,24}[-–] ?(\d{1,2}):(\d{2}) ?([AP]M)/.exec(t);
  if (!d || !r) return null;
  const off = Number(r[1].replace('−', '-'));
  const at = (h, min, ap) => Date.UTC(Number(d[3]), mon(d[1]) - 1, Number(d[2]), (Number(h) % 12) + (ap === 'PM' ? 12 : 0) - off, Number(min));
  const start = at(r[2], r[3], r[4]);
  let end = at(r[5], r[6], r[7]);
  if (end <= start) end += 86400000;
  if (!Number.isFinite(start) || end - start > 48 * 3600000) return null;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

const text = (body) => String(body || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const kst = (iso) => Object.fromEntries(new Intl.DateTimeFormat('ko', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
// Korean lines for a maintenance notice, from the notice body: when (Korea time), whether it is over, the cash item
// extension and the version it brings.
export function maintPoints(body, done) {
  const t = text(body), w = maintWindow(body), out = [];
  if (w) {
    const a = kst(w.start), b = kst(w.end), hours = Math.round((Date.parse(w.end) - Date.parse(w.start)) / 360000) / 10;
    out.push(`점검 시간: ${a.month}월 ${a.day}일(${a.weekday}) ${a.hour}:${a.minute} ~ ${a.day === b.day ? '' : `${b.day}일(${b.weekday}) `}${b.hour}:${b.minute} (한국 시간, 약 ${hours}시간)`);
  }
  if (done) {
    out.push('점검이 끝났어요. 넥슨 런처나 스팀을 다시 켜면 최신 버전을 받아요.');
    const ext = /extended Cash Shop items[^.]*? for (\d+) hours?/i.exec(t);
    if (ext) out.push(`갖고 있던 캐시 아이템의 기간이 ${ext[1]}시간 늘어났어요.`);
  } else out.push('점검하는 동안에는 게임 서버에 접속할 수 없어요.');
  const ver = /updated to\s+v\.?\s?(\d+(?:\.\d+)+)/i.exec(t);
  if (ver) out.push(done ? `게임이 v.${ver[1]} 버전으로 업데이트됐어요.` : `게임이 v.${ver[1]} 버전으로 업데이트돼요.`);
  return out;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'news';
const CATS = new Set(['maintenance', 'update', 'events', 'sale', 'general']);

// Posts the official Discord's Classic World announcement channel sends to our #공지 (the channel is followed, so each
// arrives as a crosspost). They are read with the bot token at request time, nothing is stored. A post that only points
// at a notice already in the list is dropped; the rest become notices of their own: the first real line is the title,
// the next few lines the summary.
const plain = (s) => String(s || '').replace(/<a?:\w+:\d+>/g, '').replace(/<@[&!]?\d+>|<#\d+>|@ClassicWorld News/g, '')
  .replace(/<t:(\d+)(?::\w)?>/g, (_, t) => `${new Date(Number(t) * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`)
  .replace(/\[([^\]]+)\]\((?:<)?https?:[^)]+\)/g, '$1').replace(/[*_~`]{1,3}|^#{1,3} |^> ?/gm, '').replace(/[ \t]+/g, ' ');
export function discordNotice(m, known = new Set(), invite = '') {
  if (!m || !(m.flags & 2) || !m.content) return null; // crossposts only: our own #공지 posts are not game notices
  const linked = [...m.content.matchAll(/nexon\.com\/maplestory\/news\/[a-z-]+\/(\d+)/g)].map((x) => Number(x[1]));
  if (linked.some((id) => known.has(id))) return null;
  const lines = plain(m.content).split('\n').map((l) => l.trim()).filter((l) => l && !/^(hi|hello|hey|dear)\b[^.!?]{0,30}[,!]?$/i.test(l));
  if (!lines.length) return null;
  const cut = (t, n) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t);
  const title = cut(lines[0].replace(/[.:]$/, ''), 90);
  const sum = [];
  for (const l of lines[0].length > 90 ? lines : lines.slice(1)) { if (sum.join(' ').length > 320 || sum.length >= 4) break; sum.push(cut(l, 220)); }
  const id = `d${m.id}`, hand = KO_POINTS[id] || {};
  return { id, src: 'discord', cat: /maintenance|patch|hotfix|server (?:is|are) (?:back|down)/i.test(lines.join(' ')) ? 'maintenance' : 'general', date: m.timestamp,
    en: title, ko: KO[id] || title, url: invite, sum: { en: sum, ko: hand.p || sum }, ...(hand.link ? { link: hand.link } : {}) };
}
async function discordNews(env, fetcher, known) {
  if (!env?.DISCORD_BOT_TOKEN || !env.DISCORD_NEWS_CHANNEL) return [];
  const r = await fetcher(`https://discord.com/api/v10/channels/${env.DISCORD_NEWS_CHANNEL}/messages?limit=30`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return [];
  return (await r.json()).map((m) => discordNotice(m, known, env.DISCORD_INVITE || '')).filter(Boolean);
}

export async function officialNews(fetcher = fetch, now = Date.now(), limit = 10, env = null) {
  const get = async (url) => {
    const r = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`news feed HTTP ${r.status}`);
    return r.json();
  };
  const list = await get(FEED);
  if (!Array.isArray(list)) throw new Error('news feed shape');
  const site = list.filter((x) => x && x.isMSCW && x.id && x.name && x.liveDate && Date.parse(x.liveDate) <= now)
    .sort((a, b) => Date.parse(b.liveDate) - Date.parse(a.liveDate));
  let items = site.slice(0, limit)
    .map((x) => {
      const cat = CATS.has(x.category) ? x.category : 'general';
      const hand = KO_POINTS[x.id] || {};
      return { id: Number(x.id), cat, date: x.liveDate, en: String(x.name).trim(), ko: koTitle(x.id, x.name),
        url: `https://www.nexon.com/maplestory/news/${cat}/${Number(x.id)}/${slug(x.name)}`,
        sum: { en: x.summary ? [String(x.summary).trim().slice(0, 240)] : [], ko: hand.p || (x.summary ? [String(x.summary).trim().slice(0, 240)] : []) }, ...(hand.link ? { link: hand.link } : {}) };
    });
  // Maintenance notices are read in full for their Korean lines; one that has not finished also carries its window
  // for the line above the list. A failed read leaves the notice with its summary only.
  await Promise.all(items.filter((x) => x.cat === 'maintenance').slice(0, 5).map(async (x) => {
    const d = await get(`${FEED}/${x.id}`).catch(() => null);
    if (!d?.body) return;
    const done = /^\[Completed\]/i.test(x.en);
    const pts = maintPoints(d.body, done);
    if (pts.length) x.sum.ko = [...pts, ...(KO_POINTS[x.id]?.p || [])];
    const w = !done && now - Date.parse(x.date) < 7 * 86400000 ? maintWindow(d.body) : null;
    if (w) x.maint = w;
  }));
  const extra = await discordNews(env, fetcher, new Set(site.map((x) => Number(x.id)))).catch(() => []);
  if (extra.length) items = [...items, ...extra].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, limit);
  return { at: new Date(now).toISOString(), items };
}
