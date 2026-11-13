// "엑셀로 받기" for the live menus: builds the workbook in the browser from the API snapshots the pages already use (market
// ranking and catalog every 15 min, megaphone trends every 3 h, ranking hourly), so a download adds no database work.
// Static menus link a workbook made at build time (scripts/workbooks.mjs); this file only counts those clicks.
import { xlsx } from './xlsx.js';
import { subLabel } from './item-sub.js';

const API = document.body.dataset.priceApi;
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
let itemsP;
const itemMap = () => (itemsP ||= (window.__gmsItems ||= getJson('/assets/items.json')).then((rows) => new Map(rows.map(([id, ko, en, cat, sub, lv]) => [id, { ko, en, cat, sub, lv }]))));
const kst = (iso) => (iso ? new Date(String(iso).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z')).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16) : '');
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

function save(name, bytes) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const BOOKS = {
  async market(ko, lang) {
    const L = (k, e) => (ko ? k : e);
    const [top, cat, items] = await Promise.all([getJson(`${API}/market/top`), getJson(`${API}/market/catalog`), itemMap()]);
    const nm = (id) => { const i = items.get(id); return i ? (ko ? i.ko || i.en : i.en) : `#${id}`; };
    const page = (id) => ({ text: L('시세 보기', 'Open'), url: `${location.origin}/${lang}/tools/market/?item=${id}` });
    const days = Array.from({ length: 7 }, (_, k) => { const d = new Date(Date.now() - (6 - k) * 864e5); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5); });
    const at = `${L('기준', 'As of')} ${kst(top.at)} (${L('한국 시간', 'KST')}) · GMS Hub (gms-hub.com)`;
    const topCols = [{ h: L('순위', 'Rank'), t: 'int' }, { h: L('아이템', 'Item') }, { h: L('24시간 평균가', '24h average'), t: 'int' }, { h: L('24시간 중간값', '24h median'), t: 'int' }, { h: L('전날 대비', 'vs day before'), t: 'pct' },
      { h: L('24시간 기록 수', 'Records (24h)'), t: 'int' }, ...days.map((d) => ({ h: d, t: 'int' })), { h: L('사이트', 'Site'), t: 'link' }];
    const topRow = (x) => [x.rank, nm(x.item), x.avg, x.median, x.change, x.n, ...x.spark, page(x.item)];
    const catCols = [{ h: L('아이템', 'Item') }, { h: L('세부 분류', 'Type') }, { h: L('레벨', 'Level'), t: 'int' }, { h: L('시세', 'Price'), t: 'int' }, { h: L('호가 중간값', 'Median asking'), t: 'int' }, { h: L('최저가', 'Lowest'), t: 'int' },
      { h: L('현재 매물', 'Open listings'), t: 'int' }, { h: L('상점 수', 'Shops'), t: 'int' }, { h: L('마지막 기록 (한국 시간)', 'Last seen (KST)') }, { h: L('사이트', 'Site'), t: 'link' }];
    const byRecords = [...cat.items].sort((a, b) => (b.records || 0) - (a.records || 0));
    const listCols = [{ h: L('순위', 'Rank'), t: 'int' }, ...catCols.slice(0, 3), ...catCols.slice(3, 8), { h: L('7일 기록 수', 'Records (7 days)'), t: 'int' }, catCols[8], catCols[9]];
    const listRow = (x, i) => { const it = items.get(x.item); return [i + 1, nm(x.item), subLabel(it?.cat, it?.sub, ko ? 'ko' : 'en'), it?.lv || null, x.typical ?? x.median, x.median, x.low, x.open, x.shops, x.records, kst(x.last), page(x.item)]; };
    return [`market-prices-${lang}-${today()}`, [
      { name: L('거래 많은 아이템 TOP 100', 'Top 100 traded'), title: L('지난 7일 거래·매물이 많은 아이템 TOP 100', 'Top 100 items by records in the last 7 days'),
        note: `${L('기준', 'As of')} ${kst(cat.asOf)} (${L('한국 시간', 'KST')}) · GMS Hub. ${L('시세 = 실제 거래·매물 흐름으로 본 대표 가격, 최저가 = 지금 올라온 가장 싼 매물이에요.', 'Price = typical trading price; Lowest = cheapest listing now.')}`,
        cols: listCols, rows: byRecords.slice(0, 100).map(listRow) },
      { name: L('실시간 인기 TOP 10', 'Live top 10'), title: L('지금 가장 많이 거래되는 10개와 7일 가격 흐름', 'The 10 most traded right now, with 7 days of prices'), note: `${at}. ${L('날짜 칸은 그날 중간값이에요. 빈칸은 그날 기록이 없는 날이에요.', 'Date columns are that day\'s median; blank means no records that day.')}`, cols: topCols, rows: top.items.map(topRow) },
    ]];
  },
  async mega(ko, lang) {
    const L = (k, e) => (ko ? k : e);
    const [d, cat, items] = await Promise.all([getJson(`${API}/megaphones/stats`), getJson(`${API}/market/catalog`).catch(() => ({ items: [] })), itemMap()]);
    const nm = (id) => { const i = items.get(id); return i ? (ko ? i.ko || i.en : i.en) : `#${id}`; };
    const price = new Map(cat.items.map((x) => [x.item, x]));
    const page = (id) => ({ text: L('시세 보기', 'Open'), url: `${location.origin}/${lang}/tools/market/?item=${id}` });
    const at = `${L('기준', 'As of')} ${kst(d.at)} (${L('한국 시간', 'KST')}) · ${L('지난 24시간', 'last 24 hours')} · GMS Hub`;
    const cols = [{ h: L('순위', 'Rank'), t: 'int' }, { h: L('아이템', 'Item') }, { h: L('확성기 수', 'Megaphones'), t: 'int' }, { h: L('팝니다', 'Selling'), t: 'int' }, { h: L('삽니다', 'Buying'), t: 'int' },
      { h: L('사려는 비율', 'Buyers share'), t: 'rate' }, { h: L('전날 확성기 수', 'Day before'), t: 'int' }, { h: L('자유시장 시세', 'Market price'), t: 'int' }, { h: L('최저 매물', 'Lowest listing'), t: 'int' }, { h: L('사이트', 'Site'), t: 'link' }];
    const row = (x, i) => { const p = price.get(x.item); const both = (x.sell || 0) + (x.buy || 0); return [i + 1, nm(x.item), x.n, x.sell, x.buy, both ? Math.round((x.buy / both) * 1000) / 10 : null, x.before ?? null, p ? p.typical ?? p.median : null, p?.low ?? null, page(x.item)]; };
    return [`megaphone-trends-${lang}-${today()}`, [
      { name: L('많이 불린 아이템', 'Most called'), title: L('확성기에 많이 나온 아이템', 'Items most called in megaphones'), note: `${at}. ${L(`오늘 확성기 ${d.today?.n?.toLocaleString('ko-KR') || '-'}개, 부른 사람 ${d.today?.nicks?.toLocaleString('ko-KR') || '-'}명.`, `${d.today?.n || '-'} megaphones from ${d.today?.nicks || '-'} players today.`)}`, cols, rows: (d.items || []).map(row) },
      { name: L('사려는 사람이 많은 아이템', 'Most wanted'), title: L('사려는 사람이 많은 아이템', 'Items more people want to buy'), note: `${at}. ${L('사려는 비율이 높을수록 지금 팔기 좋은 아이템이에요.', 'A high buyers share means a good time to sell.')}`, cols, rows: (d.wanted || []).map(row) },
      { name: L('시간대별 확성기', 'By hour'), title: L('시간대별 확성기 수', 'Megaphones by hour'), note: L('시간은 한국 시간이에요. 많을 때 확성기를 쓰면 묻히기 쉬워요.', 'Times are KST.'),
        cols: [{ h: L('시각 (한국 시간)', 'Hour (KST)') }, { h: L('확성기 수', 'Megaphones'), t: 'int' }], rows: (d.hourly || []).map((h) => [kst(`${h.h}:00:00Z`).replace(/:\d\d$/, ':00'), h.n]) }
    ]];
  },
  async rank(ko, lang) {
    const L = (k, e) => (ko ? k : e);
    const d = await getJson(`${API}/rank`);
    const credit = L('데이터: ClassicRank (https://classicrank.com)', 'Data: ClassicRank (https://classicrank.com)');
    const at = `${L('기준', 'As of')} ${kst(d.at)} (${L('한국 시간', 'KST')}) · ${credit}`;
    const jobs = new Map();
    for (const r of d.rows) { const j = jobs.get(r.job) || jobs.set(r.job, { job: r.job, family: r.family, n: 0, sum: 0, top: r }).get(r.job); j.n++; j.sum += r.level; if (r.level > j.top.level) j.top = r; }
    const bands = [[90, 200], [80, 89], [70, 79], [60, 69], [50, 59], [40, 49], [30, 39], [0, 29]];
    return [`ranking-top-1000-${lang}-${today()}`, [
      { name: L('상위 1000명', 'Top 1000'), title: L('캐릭터 레벨 랭킹 상위 1,000명', 'Top 1,000 characters by level'), note: at,
        cols: [{ h: L('순위', 'Rank'), t: 'int' }, { h: L('캐릭터', 'Character') }, { h: L('레벨', 'Level'), t: 'int' }, { h: L('직업', 'Job') }, { h: L('계열', 'Family') }, { h: L('직업 내 순위', 'Job rank'), t: 'int' }, { h: L('인기도', 'Fame'), t: 'int' }, { h: L('인증', 'Verified') }],
        rows: d.rows.map((r) => [r.rank, r.name, r.level, r.job, r.family, r.jobRank, r.fame, r.verified ? 'O' : '']) },
      { name: L('직업별 분포', 'By job'), title: L('상위 1,000명의 직업 분포', 'Jobs among the top 1,000'), note: at,
        cols: [{ h: L('직업', 'Job') }, { h: L('계열', 'Family') }, { h: L('인원', 'Players'), t: 'int' }, { h: L('비율', 'Share'), t: 'rate' }, { h: L('평균 레벨', 'Average level'), t: 'num' }, { h: L('최고 레벨 캐릭터', 'Highest character') }, { h: L('최고 레벨', 'Highest level'), t: 'int' }],
        rows: [...jobs.values()].sort((a, b) => b.n - a.n).map((j) => [j.job, j.family, j.n, Math.round((j.n / d.rows.length) * 1000) / 10, Math.round((j.sum / j.n) * 10) / 10, j.top.name, j.top.level]) },
      { name: L('레벨 구간별', 'By level'), title: L('레벨 구간별 인원', 'Players by level range'), note: at,
        cols: [{ h: L('레벨 구간', 'Levels') }, { h: L('인원', 'Players'), t: 'int' }, { h: L('비율', 'Share'), t: 'rate' }],
        rows: bands.map(([a, b]) => { const n = d.rows.filter((r) => r.level >= a && r.level <= b).length; return [b >= 200 ? `${a}+` : `${a}–${b}`, n, Math.round((n / d.rows.length) * 1000) / 10]; }).filter((r) => r[1]) }
    ]];
  }
};

document.addEventListener('click', async (e) => {
  const link = e.target.closest('a[data-xl]');
  if (link) { window.track?.('excel_download', { set: link.dataset.xl, live: false }); return; }
  const btn = e.target.closest('[data-xl-live]');
  if (!btn || btn.disabled) return;
  const lang = btn.dataset.lang || document.documentElement.lang || 'en';
  const ko = lang === 'ko';
  const span = btn.querySelector('span');
  const label = span.textContent;
  btn.disabled = true;
  span.textContent = ko ? '엑셀 만드는 중…' : 'Preparing…';
  try {
    const [name, sheets] = await BOOKS[btn.dataset.xlLive](ko, ko ? 'ko' : lang);
    save(`gms-hub-${name}.xlsx`, xlsx({ sheets: sheets.filter((s) => s.rows.length), title: 'GMS Hub' }));
    window.track?.('excel_download', { set: btn.dataset.xlLive, live: true });
    span.textContent = label;
  } catch {
    span.textContent = ko ? '지금은 받을 수 없어요. 잠시 뒤 다시 눌러 주세요.' : 'Not available right now. Try again shortly.';
    setTimeout(() => { span.textContent = label; }, 4000);
  } finally { btn.disabled = false; }
});
