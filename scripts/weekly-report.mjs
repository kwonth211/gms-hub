// The weekly report ("주간 리포트"): a front page for one Monday-to-Sunday week of the Free Market and the megaphones,
// built from data/weekly-raw.json (scripts/fetch-weekly-report.mjs). Only measured numbers: asking prices and sales,
// megaphone counts, the stored ranking. The page never says how listings are collected (owner's call 2026-11-15). Nothing here is estimated or written by hand except the
// short "next week" notes, which come from data/forgotten-hollow.json.

const DAY = 86400000;
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// The week the report covers: the last Monday-to-Sunday (KST) that has started, ending at the newest day in the data.
export function reportWeek(days) {
  const last = days.at(-1);
  const d = new Date(`${last}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
  const start = dayOf(monday.getTime());
  const end = dayOf(monday.getTime() + 6 * DAY);
  const prevStart = dayOf(monday.getTime() - 7 * DAY);
  // ISO week number, and the week of the month for the Korean title (11월 둘째 주).
  const t = new Date(monday.getTime() + 3 * DAY);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const iso = 1 + Math.round(((t - jan4) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  const nth = Math.ceil(t.getUTCDate() / 7);
  return { start, end, prevStart, last, iso, year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, nth };
}

// One item's rows ([dayIndex, median, low, p25, p75, n, sold]) turned into a per-day map.
const byDay = (rows, days) => new Map(rows.map(([i, med, low, p25, p75, n, sold]) => [days[i], { med, low, p25, p75, n, sold }]));
// "Thin" days (fewer than 5 asks) do not count toward a move.
const MIN_DAY = 5;

// Price move of one item over the week. With a full previous week the two weeks' medians are compared; while the
// history is shorter (the first issues) the first days of this week are compared with its last days. Thin items are
// left out: at least 3 asks on a day for it to count, 8 asks on each side, so one odd listing cannot make a mover.
export function itemMove(rows, days, week) {
  const m = byDay(rows, days);
  const pick = (from, to) => [...m.entries()].filter(([d, r]) => d >= from && d <= to && r.n >= MIN_DAY && r.med != null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const side = (list) => ({ med: median(list.map(([, r]) => r.med)), n: list.reduce((a, [, r]) => a + r.n, 0), days: list.length });
  const prevWeekEnd = dayOf(Date.parse(`${week.start}T00:00:00Z`) - DAY);
  const prev = side(pick(week.prevStart, prevWeekEnd));
  const thisWeek = pick(week.start, week.end);
  let before, after, basis;
  if (prev.days >= 3 && prev.n >= 8) {
    before = prev; after = side(thisWeek); basis = 'week';
  } else {
    if (thisWeek.length < 4) return null;
    const cut = Math.floor(thisWeek.length / 2);
    before = side(thisWeek.slice(0, cut)); after = side(thisWeek.slice(cut)); basis = 'inweek';
  }
  if (!before.med || !after.med || before.n < 15 || after.n < 15 || before.days < 2 || after.days < 2) return null;
  const change = after.med / before.med - 1;
  // A doubling or more needs a busy item to be believed.
  if (Math.abs(change) > 1 && before.n + after.n < 100) return null;
  return { before: before.med, after: after.med, change, basis };
}

// Daily medians of the report week (null for a day without enough asks), for the sparklines.
export function weekSeries(rows, days, week) {
  const m = byDay(rows, days);
  return Array.from({ length: 7 }, (_, i) => {
    const r = m.get(dayOf(Date.parse(`${week.start}T00:00:00Z`) + i * DAY));
    return r && r.n >= MIN_DAY ? r.med : null;
  });
}

export function computeReport(raw, items) {
  const week = reportWeek(raw.days);
  const byId = new Map(items.map((i) => [i.id, i]));
  const inWeek = (d) => d >= week.start && d <= week.end;
  let asks = 0, sold = 0;
  const all = [];
  for (const [id, rows] of Object.entries(raw.items)) {
    const item = byId.get(Number(id));
    if (!item) continue;
    let n = 0, s = 0;
    for (const [i, , , , , rn, rs] of rows) if (inWeek(raw.days[i])) { n += rn; s += rs; }
    asks += n; sold += s;
    const move = itemMove(rows, raw.days, week);
    all.push({ id: item.id, n, sold: s, move, series: weekSeries(rows, raw.days, week), now: [...rows].reverse().find((r) => r[1] != null && r[5] >= 3)?.[1] ?? null });
  }
  const movers = all.filter((r) => r.move && r.now >= 300 && Math.abs(r.move.change) >= 0.05 && Math.abs(r.move.change) <= 3);
  // Ranked by the move weighted by how much the item trades, so a busy item that rose 20% beats a quiet one that rose 40%.
  const weight = (r) => Math.abs(r.move.change) * Math.log10(10 + r.n);
  const up = movers.filter((r) => r.move.change > 0).sort((a, b) => weight(b) - weight(a)).slice(0, 8);
  const down = movers.filter((r) => r.move.change < 0).sort((a, b) => weight(b) - weight(a)).slice(0, 8);
  const sellers = all.filter((r) => r.sold >= 5 && r.now).sort((a, b) => b.sold - a.sold).slice(0, 10);
  const basis = movers[0]?.move.basis || 'inweek';
  // Megaphones: the stored days of this week when there are at least three, else the live two-day stats.
  const megaDays = (raw.mega || []).filter((d) => inWeek(d.day));
  let mega;
  if (megaDays.length >= 3) {
    const acc = new Map();
    for (const d of megaDays) for (const it of d.items) {
      const a = acc.get(it.item) || { item: it.item, n: 0, sell: 0, buy: 0 };
      a.n += it.n; a.sell += it.sell; a.buy += it.buy; acc.set(it.item, a);
    }
    const list = [...acc.values()].filter((r) => byId.has(r.item));
    mega = { span: 'week', days: megaDays.length, total: megaDays.reduce((a, d) => a + d.n, 0),
      sold: [...list].sort((a, b) => b.sell - a.sell).slice(0, 8), wanted: [...list].sort((a, b) => b.buy - a.buy).slice(0, 8), rising: [] };
  } else if (raw.megaStats) {
    const s = raw.megaStats;
    const known = (r) => byId.has(r.item);
    mega = { span: 'live', at: s.at, total: s.today?.n || 0, callers: s.today?.nicks || 0,
      sold: [...(s.items || [])].filter(known).sort((a, b) => b.sell - a.sell).slice(0, 8),
      wanted: [...(s.items || []), ...(s.wanted || [])].filter(known).filter((r, i, a) => a.findIndex((x) => x.item === r.item) === i).sort((a, b) => b.buy - a.buy).slice(0, 8),
      rising: (s.trending || []).filter(known).slice(0, 6) };
  }
  const ranks = (raw.rank || []).filter((r) => r.day <= week.end);
  const rankNow = ranks.at(-1) || null;
  const rankStart = ranks.find((r) => r.day >= week.start && r !== rankNow && !r.live) || null;
  const forge = (raw.forge || []).filter((f) => inWeek(f.day)).reduce((a, f) => ({ ok: a.ok + f.ok, fail: a.fail + f.fail, boom: a.boom + f.boom }), { ok: 0, fail: 0, boom: 0 });
  return { week, at: raw.at, asks, sold, items: all.filter((r) => r.n > 0).length, up, down, sellers, basis, mega, rankNow, rankStart, forge, byId: Object.fromEntries(all.map((r) => [r.id, r])) };
}

// ---------- page ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TIER = { 하급: '100%', 중급: '60%', 상급: '10%', 혼돈: '혼돈' };
const STAT_KO = [['Magic Attack', '마력'], ['Magic Def.', '마법 방어력'], ['Attack', '공격력'], ['Accuracy', '명중률'], ['Evasion', '회피율'],
  ['Crit. Damage', '크리티컬 데미지'], ['Speed', '이동속도'], ['Jump', '점프력'], ['DEF', '방어력']];
// Korean item names as players say them: "스태프 마력 주문서 60%" rather than the client's "스태프 Magic Attack 주문서: 중급".
export function koItemName(i) {
  let n = i.ko || i.en;
  for (const [en, ko] of STAT_KO) n = n.split(en).join(ko);
  return n.replace(/주문서: (하급|중급|상급|혼돈)$/, (_, t) => `주문서 ${TIER[t]}`);
}
const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Formatting shared by the report page and the home teaser.
function fmt(lang, items) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const byId = new Map(items.map((i) => [i.id, i]));
  const name = (id) => { const i = byId.get(id); return i ? (ko ? koItemName(i) : i.en.replace(/ Scroll: (Lesser|Intermediate|Greater)$/, (_, t) => ` Scroll ${{ Lesser: '100%', Intermediate: '60%', Greater: '10%' }[t]}`)) : String(id); };
  const nf = (n) => Number(n).toLocaleString(ko ? 'ko' : 'en-US');
  const mesos = (n) => n == null ? '—' : ko
    ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf(n))
    : (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : nf(n));
  const pct = (c) => `${c > 0 ? '+' : ''}${Math.round(c * 100)}%`;
  const icon = (id, size = 32) => `<img class="wr-icon" src="https://maplestory.io/api/MCW/1/item/${id}/icon" width="${size}" height="${size}" alt="" loading="lazy">`;
  return { ko, tr, byId, name, nf, mesos, pct, icon };
}

// The week's lead story: its biggest move, weighted by how much the item trades.
export function reportLead(R) {
  return [...R.up, ...R.down].sort((a, b) => Math.abs(b.move.change) * Math.log10(10 + b.n) - Math.abs(a.move.change) * Math.log10(10 + a.n))[0] || null;
}
function leadHeadline(f, lead) {
  if (!lead) return f.tr('이번 주 자유시장', 'The Free Market this week');
  const n = Math.abs(Math.round(lead.move.change * 100));
  return f.ko ? `${f.name(lead.id)}, 한 주 새 ${n}% ${lead.move.change > 0 ? '올랐어요' : '내렸어요'}` : `${f.name(lead.id)} ${lead.move.change > 0 ? 'up' : 'down'} ${n}% this week`;
}
const weekTitleOf = (W, ko) => (ko ? `${W.month}월 ${['', '첫째', '둘째', '셋째', '넷째', '다섯째'][W.nth]} 주` : `Week ${W.iso}`);

// Home: a closed fold above the update list. The summary carries the week's headline; opened, it shows four short
// lines (top riser, top faller, most sold, most called) and the way to the full report.
export function weeklyTeaser({ lang, R, items, href, langPath }) {
  if (!R) return '';
  const f = fmt(lang, items);
  const { tr, name, mesos, pct, nf, icon } = f;
  const lead = reportLead(R);
  const report = href(langPath(lang, '/report/'));
  const market = href(langPath(lang, '/tools/market/'));
  const line = (label, id, value) => id ? `<li><span class="wk-label">${label}</span><a class="wk-item" href="${market}?item=${id}">${icon(id, 24)}<span>${esc(name(id))}</span></a><span class="wk-val">${value}</span></li>` : '';
  const up = R.up[0], down = R.down[0], sold = R.sellers[0], called = R.mega?.sold?.[0];
  return `<details class="wrap wk-teaser"><summary><span class="wk-tag">${tr('주간 리포트', 'Weekly report')}</span><span class="wk-week">${esc(weekTitleOf(R.week, f.ko))}</span><strong class="wk-head">${esc(leadHeadline(f, lead))}</strong><span class="wk-open"><span class="wk-o1">${tr('펼쳐 보기', 'Open')}</span><span class="wk-o2">${tr('접기', 'Close')}</span></span></summary>
<ul class="wk-lines">${line(tr('가장 많이 오른', 'Rose most'), up?.id, up ? `<b class="up">${pct(up.move.change)}</b>` : '')}${line(tr('가장 많이 내린', 'Fell most'), down?.id, down ? `<b class="down">${pct(down.move.change)}</b>` : '')}${line(tr('가장 많이 팔린', 'Sold most'), sold?.id, sold ? tr(`${nf(sold.sold)}개`, `${nf(sold.sold)} sold`) : '')}${line(tr('확성기 1위', 'Most called'), called?.item, called ? tr(`${nf(called.sell)}번`, `${nf(called.sell)} calls`) : '')}</ul>
<p class="wk-more"><a class="btn" href="${report}">${tr('이번 주 리포트 전체 보기', "Read this week's report")}</a></p></details>`;
}

export function reportBody({ lang, R, items, href, langPath, fh }) {
  const f = fmt(lang, items);
  const { ko, tr, byId, name, nf, mesos, pct, icon } = f;
  const market = href(langPath(lang, '/tools/market/'));
  const itemHref = (id) => `${market}?item=${id}`;
  const W = R.week;
  const md = (d) => { const [, m, dd] = d.split('-').map(Number); return ko ? `${m}월 ${dd}일` : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const nth = ['', '첫째', '둘째', '셋째', '넷째', '다섯째'][W.nth];
  const weekTitle = ko ? `${W.year}년 ${W.month}월 ${nth} 주` : `Week ${W.iso}, ${W.year}`;
  const days = ko ? DAYS_KO : DAYS_EN;

  // Sparkline of the week's daily medians; gaps stay gaps.
  const spark = (series, cls = '') => {
    const pts = series.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (pts.length < 2) return '';
    const vs = pts.map(([, v]) => v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
    const x = (i) => 2 + (i * 76) / 6, y = (v) => 22 - ((v - lo) / span) * 18;
    return `<svg class="wr-spark ${cls}" viewBox="0 0 80 24" width="80" height="24" aria-hidden="true"><polyline points="${pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/><circle cx="${x(pts.at(-1)[0]).toFixed(1)}" cy="${y(pts.at(-1)[1]).toFixed(1)}" r="2.2"/></svg>`;
  };

  // The lead story: the biggest move of the week, weighted by trade.
  const lead = reportLead(R);
  const leadChart = (r) => {
    const pts = r.series.map((v, i) => [i, v]);
    const vs = pts.filter(([, v]) => v != null).map(([, v]) => v);
    const lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo || hi) * 0.18;
    const top = hi + pad, bot = Math.max(0, lo - pad);
    const X = (i) => 40 + i * 90, Y = (v) => 24 + (1 - (v - bot) / (top - bot)) * 196;
    const seg = []; let cur = [];
    for (const [i, v] of pts) { if (v == null) { if (cur.length) seg.push(cur); cur = []; } else cur.push([i, v]); }
    if (cur.length) seg.push(cur);
    const lines = seg.map((s) => `<polyline points="${s.map(([i, v]) => `${X(i)},${Y(v).toFixed(1)}`).join(' ')}"/>`).join('');
    const dots = pts.filter(([, v]) => v != null).map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v).toFixed(1)}" r="4.5"/>`).join('');
    const first = pts.find(([, v]) => v != null), last = [...pts].reverse().find(([, v]) => v != null);
    const label = ([i, v], anchor) => `<text class="wr-chart-val" x="${X(i)}" y="${(Y(v) - 14).toFixed(1)}" text-anchor="${anchor}">${esc(mesos(v))}</text>`;
    const axis = days.map((d, i) => `<text class="wr-chart-day" x="${X(i)}" y="252" text-anchor="middle">${d}</text>`).join('');
    const grid = days.map((_, i) => `<line x1="${X(i)}" x2="${X(i)}" y1="16" y2="228"/>`).join('');
    return `<figure class="wr-chart"><svg viewBox="0 0 620 262" role="img" aria-label="${esc(tr(`${name(r.id)} 요일별 시세`, `${name(r.id)} price by day`))}"><g class="wr-chart-grid">${grid}</g><g class="wr-chart-line">${lines}</g><g class="wr-chart-dot">${dots}</g>${label(first, 'start')}${label(last, 'end')}${axis}</svg>
<figcaption>${tr('그날 올라온 매물 가격의 중간값이에요. 빈칸은 매물이 5개보다 적었던 날이에요.', 'Median asking price each day. Gaps are days with fewer than five listings.')}</figcaption></figure>`;
  };
  const leadHead = leadHeadline(f, lead);
  const basisWord = R.basis === 'week' ? tr('지난주', 'last week') : tr('주 초', 'early in the week');
  const leadLine = lead
    ? tr(`${basisWord} ${mesos(lead.move.before)} 메소 안팎이던 시세가 주말엔 ${mesos(lead.move.after)} 메소예요.`, `From ${mesos(lead.move.before)} ${basisWord} to ${mesos(lead.move.after)} mesos by the weekend.`)
    : '';

  const moveList = (rows, dir) => rows.length ? `<ol class="wr-moves">${rows.map((r) => `<li><a class="wr-row" href="${itemHref(r.id)}">${icon(r.id)}<span class="wr-name">${esc(name(r.id))}</span><span class="wr-price"><span class="wr-from">${esc(mesos(r.move.before))}</span><span class="wr-to">${esc(mesos(r.move.after))}</span></span>${spark(r.series, dir)}<span class="wr-pct ${dir}">${pct(r.move.change)}</span></a></li>`).join('')}</ol>`
    : `<p class="wr-empty">${tr('크게 움직인 아이템이 없었어요.', 'Nothing moved much.')}</p>`;

  const megaList = (rows, value) => rows.length ? `<ol class="wr-mega">${rows.map((r, n) => `<li><span class="wr-rank">${n + 1}</span><a class="wr-row" href="${itemHref(r.item)}">${icon(r.item, 28)}<span class="wr-name">${esc(name(r.item))}</span></a><span class="wr-count">${value(r)}</span></li>`).join('')}</ol>` : '';
  const times = (n) => `${nf(n)}${tr('번', '')}`;
  const M = R.mega;
  const megaSpan = M?.span === 'week' ? tr(`이번 주 ${M.days}일 동안 확성기 ${nf(M.total)}개 기준이에요.`, `Based on ${nf(M.total)} megaphones over ${M.days} days this week.`)
    : tr(`최근 24시간 확성기 ${nf(M?.total || 0)}개 기준이에요. 다음 호부터는 한 주 전체로 집계해요.`, `Based on the last 24 hours (${nf(M?.total || 0)} megaphones). From the next issue it covers the whole week.`);

  // Ranking: job mix of the top 1000.
  const JOB_KO = { Assassin: '어쌔신', Bandit: '시프', 'Wizard (Ice/Lightning)': '썬콜', 'Wizard (Fire/Poison)': '불독', Spearman: '스피어맨', Cleric: '클레릭', Hunter: '헌터', Fighter: '파이터', Crossbowman: '사수', Page: '페이지' };
  const job = (j) => (ko ? JOB_KO[j] || j : j);
  const RN = R.rankNow;
  const jobs = RN ? Object.entries(RN.jobs).sort((a, b) => b[1] - a[1]) : [];
  const maxJob = jobs[0]?.[1] || 1;
  const prevJobs = R.rankStart?.jobs || null;
  const jobRows = jobs.map(([j, n]) => {
    const share = n / RN.n;
    const delta = prevJobs ? n - (prevJobs[j] || 0) : null;
    return `<li><span class="wr-job">${esc(job(j))}</span><span class="wr-bar"><span style="--w:${((n / maxJob) * 100).toFixed(1)}%"></span></span><span class="wr-share">${Math.round(share * 100)}%</span><span class="wr-n">${nf(n)}${tr('명', '')}${delta ? ` <small class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</small>` : ''}</span></li>`;
  }).join('');
  const lv90 = RN ? Object.entries(RN.levels).filter(([b]) => +b >= 90).reduce((a, [, n]) => a + n, 0) : 0;

  // Next week: the Hollow opens; what to watch, priced now.
  const watchIds = [2040001, 2040002, 2070003, 2070004, 2000004];
  const watch = watchIds.filter((id) => byId.has(id)).map((id) => ({ id, r: R.byId[id] }));
  const prep = (fh?.prep || []).slice(0, 3);
  const opens = fh?.open ? md(fh.open) : null;

  const sellers = `<ol class="wr-sold">${R.sellers.map((r, n) => `<li><span class="wr-rank">${n + 1}</span><a class="wr-row" href="${itemHref(r.id)}">${icon(r.id, 28)}<span class="wr-name">${esc(name(r.id))}</span></a><span class="wr-count">${nf(r.sold)}${tr('개', ' sold')}</span><span class="wr-now">${esc(mesos(r.now))}</span></li>`).join('')}</ol>`;

  return `<link rel="stylesheet" href="__WR_CSS__">
<article class="wr">
<header class="wr-mast wrap">
  <p class="wr-brand">GMS Hub ${tr('주간 리포트', 'Weekly')}</p>
  <p class="wr-issue"><span>${esc(weekTitle)}</span><span>${esc(`${md(W.start)} ~ ${md(W.end)}`)}</span><span>${tr('제1호', 'Issue 1')}</span></p>
</header>

<section class="wr-front wrap">
  <div class="wr-lead">
    <h1>${esc(leadHead)}</h1>
    <p class="wr-dek">${esc(leadLine)}</p>
    <p class="wr-actions">${lead ? `<a class="btn" href="${itemHref(lead.id)}">${tr('이 아이템 시세 열기', 'Open this item')}</a>` : ''}<a class="btn ghost" href="${market}">${tr('실시간 시세', 'Live prices')}</a></p>
  </div>
  ${lead ? leadChart(lead) : ''}
</section>

<section class="wr-strip wrap" aria-label="${tr('이번 주 숫자', 'This week in numbers')}">
  <dl>
    <div><dt>${tr('이번 주 매물', 'Listings')}</dt><dd>${nf(R.asks)}</dd></div>
    <div><dt>${tr('거래된 아이템', 'Items sold')}</dt><dd>${nf(R.sold)}</dd></div>
    <div><dt>${tr('시세가 잡힌 아이템', 'Items priced')}</dt><dd>${nf(R.items)}</dd></div>
    ${M ? `<div><dt>${M.span === 'week' ? tr('이번 주 확성기', 'Megaphones') : tr('하루 확성기', 'Megaphones a day')}</dt><dd>${nf(M.total)}</dd></div>` : ''}
  </dl>
</section>

<section class="wr-sec wrap" id="moves">
  <h2>${tr('이번 주 시세', 'Prices this week')}</h2>
  <p class="wr-note">${R.basis === 'week' ? tr('지난주 중간값과 이번 주 중간값을 비교했어요.', "Last week's median against this week's.") : tr('기록이 쌓이는 첫 주라 주 초 며칠과 주말 며칠을 비교했어요. 다음 호부터는 지난주와 비교해요.', 'First week of records: the first days of the week against its last days. From the next issue, week against week.')}</p>
  <div class="wr-cols">
    <div><h3 class="up">${tr('오른 아이템', 'Rose')}</h3>${moveList(R.up, 'up')}</div>
    <div><h3 class="down">${tr('내린 아이템', 'Fell')}</h3>${moveList(R.down, 'down')}</div>
  </div>
</section>

<section class="wr-sec wrap" id="sold">
  <h2>${tr('가장 많이 팔린 아이템', 'Sold the most')}</h2>
  <p class="wr-note">${tr('이번 주 실제로 거래가 끝난 개수예요. 오른쪽 숫자는 지금 시세예요.', 'How many actually sold this week; on the right, the price now.')}</p>
  ${sellers}
</section>

${M ? `<section class="wr-sec wrap" id="mega">
  <h2>${tr('확성기에서 많이 외친 아이템', 'Called most in megaphones')}</h2>
  <p class="wr-note">${megaSpan}</p>
  <div class="wr-cols three">
    <div><h3>${tr('판다', 'Selling')}</h3>${megaList(M.sold, (r) => times(r.sell))}</div>
    <div><h3>${tr('산다', 'Buying')}</h3>${megaList(M.wanted, (r) => times(r.buy))}</div>
    ${M.rising?.length ? `<div><h3>${tr('갑자기 늘어난', 'Suddenly more')}</h3>${megaList(M.rising, (r) => (r.usual ? tr(`평소 ${(r.recent / r.usual).toFixed(1)}배`, `${(r.recent / r.usual).toFixed(1)}x usual`) : times(r.n)))}</div>` : ''}
  </div>
  <p class="wr-more"><a href="${href(langPath(lang, '/megaphone/'))}">${tr('실시간 확성기 보기', 'Live megaphones')}</a></p>
</section>` : ''}

${RN ? `<section class="wr-sec wrap" id="rank">
  <h2>${tr('랭킹 상위 1,000명은 무슨 직업일까', 'What the top 1,000 play')}</h2>
  <div class="wr-rank-grid">
    <ol class="wr-jobs">${jobRows}</ol>
    <dl class="wr-rank-facts">
      <div><dt>${tr('최고 레벨', 'Highest level')}</dt><dd>${RN.highest ?? '—'}</dd></div>
      <div><dt>${tr('90레벨 이상', 'Level 90+')}</dt><dd>${nf(lv90)}${tr('명', '')}</dd></div>
      ${RN.characters ? `<div><dt>${tr('전체 캐릭터', 'Characters')}</dt><dd>${nf(RN.characters)}</dd></div>` : ''}
    </dl>
  </div>
  <p class="wr-note">${prevJobs ? tr('작은 숫자는 주 초보다 늘거나 줄어든 사람 수예요.', 'Small numbers: change since the start of the week.') : tr('다음 호부터 직업별로 한 주 사이 몇 명이 늘고 줄었는지 함께 보여 드려요.', 'From the next issue, with the change over the week per job.')} <a href="${href(langPath(lang, '/rank/'))}">${tr('전체 랭킹', 'Full ranking')}</a></p>
</section>` : ''}

${opens ? `<section class="wr-sec wrap" id="next">
  <h2>${tr(`다음 주: ${opens} 포가튼 할로우가 열려요`, `Next week: Forgotten Hollow opens ${opens}`)}</h2>
  <div class="wr-next">
    <ul class="wr-prep">${prep.map((p) => `<li>${esc(ko ? p.ko : p.en)}</li>`).join('')}</ul>
    <div>
      <h3>${tr('지켜볼 아이템, 지금 시세', 'Worth watching, priced now')}</h3>
      <ul class="wr-watch">${watch.map(({ id, r }) => `<li><a class="wr-row" href="${itemHref(id)}">${icon(id, 28)}<span class="wr-name">${esc(name(id))}</span></a><span class="wr-count">${esc(mesos(r?.now ?? null))}</span></li>`).join('')}</ul>
      <p class="wr-more"><a href="${href(langPath(lang, '/forgotten-hollow/'))}">${tr('포가튼 할로우 공략', 'Forgotten Hollow guide')}</a></p>
    </div>
  </div>
</section>` : ''}

<footer class="wrap"><div class="wr-foot">
  <p>${tr('GMS Hub가 한 주 동안 모은 시세, 거래, 확성기, 랭킹 기록으로 만들어요. 가격은 그날 올라온 매물 가격의 중간값이라 장난 매물 몇 개로는 흔들리지 않아요.', 'Made from the prices, sales, megaphones and rankings GMS Hub gathered over the week. Prices are the daily median of asking prices, so a few joke listings do not move them.')}</p>
  <p>${tr(`다음 호는 ${md(new Date(Date.parse(`${W.end}T00:00:00Z`) + 86400000 * 8).toISOString().slice(0, 10))}에 나와요.`, `Next issue: ${md(new Date(Date.parse(`${W.end}T00:00:00Z`) + 86400000 * 8).toISOString().slice(0, 10))}.`)}</p>
</div></footer>
</article>`;
}
