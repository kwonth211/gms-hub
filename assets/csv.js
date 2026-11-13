// Live spreadsheet downloads (see scripts/downloads.mjs for the build-time files). The file is made in the browser from the
// API snapshots the site already serves (market catalog every 15 min, megaphone trends every 3 h, ranking hourly), so a
// download costs no extra database work. CSV with a byte-order mark and Windows line ends opens cleanly in Excel.
const API = document.body.dataset.priceApi;
const cell = (v) => {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : s;
};
const toCsv = (head, rows) => '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
function save(name, csv) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
let itemsP;
const itemNames = () => (itemsP ||= (window.__gmsItems ||= getJson('/assets/items.json')).then((rows) => new Map(rows.map(([id, ko, en]) => [id, { ko, en }]))));
const stamp = (iso) => (iso ? new Date(String(iso).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z')).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16) : '');

const LIVE = {
  async market(ko) {
    const [d, names] = await Promise.all([getJson(`${API}/market/catalog`), itemNames()]);
    const nm = (id) => { const n = names.get(id); return n ? (ko ? n.ko || n.en : n.en) : `#${id}`; };
    const other = (id) => { const n = names.get(id); return n ? (ko ? n.en : n.ko || '') : ''; };
    const rows = [...d.items].sort((a, b) => (b.sales || 0) - (a.sales || 0)).map((x) => [x.item, nm(x.item), other(x.item), x.typical ?? x.median ?? '', x.median ?? '', x.low ?? '', x.open ?? '', x.shops ?? '', x.records ?? '', stamp(x.last)]);
    return [ko ? ['아이템 ID', '이름', '영문 이름', '시세(메소)', '호가 중간값', '최저가', '현재 매물', '상점 수', '기록 수', '마지막 기록(한국 시간)'] : ['Item ID', 'Name', 'Korean name', 'Price (mesos)', 'Median asking', 'Lowest', 'Open listings', 'Shops', 'Records', 'Last seen (KST)'], rows, `market-prices`];
  },
  async mega(ko) {
    const [d, names] = await Promise.all([getJson(`${API}/megaphones/stats`), itemNames()]);
    const nm = (id) => { const n = names.get(id); return n ? (ko ? n.ko || n.en : n.en) : `#${id}`; };
    const rows = [...(d.items || []).map((x, i) => [ko ? '많이 불린 아이템' : 'Most called', i + 1, nm(x.item), x.n, x.sell, x.buy, x.before ?? '']),
      ...(d.wanted || []).map((x, i) => [ko ? '사려는 사람이 많은 아이템' : 'Most wanted', i + 1, nm(x.item), x.n, x.sell, x.buy, ''])];
    return [ko ? ['구분', '순위', '아이템', '확성기 수', '팝니다', '삽니다', '전날'] : ['List', 'Rank', 'Item', 'Megaphones', 'Selling', 'Buying', 'Day before'], rows, 'megaphone-trends'];
  },
  async rank(ko) {
    const d = await getJson(`${API}/rank`);
    const rows = d.rows.map((r) => [r.rank, r.name, r.level, r.job, r.family, r.jobRank, r.fame, r.verified ? 'O' : '', stamp(r.checked)]);
    return [ko ? ['순위', '캐릭터', '레벨', '직업', '계열', '직업 내 순위', '인기도', '인증', '확인 시각(한국 시간)'] : ['Rank', 'Character', 'Level', 'Job', 'Family', 'Job rank', 'Fame', 'Verified', 'Checked (KST)'],
      [...rows, [], [ko ? '데이터: ClassicRank (https://classicrank.com)' : 'Data: ClassicRank (https://classicrank.com)']], 'ranking-top-1000'];
  }
};

document.addEventListener('click', async (e) => {
  const link = e.target.closest('a[data-dl]');
  if (link) { window.track?.('download', { set: link.dataset.dl, live: false }); return; }
  const btn = e.target.closest('[data-dl-live]');
  if (!btn || btn.disabled) return;
  const ko = (btn.dataset.lang || document.documentElement.lang) === 'ko';
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.lastChild.textContent = ko ? '만드는 중…' : 'Preparing…';
  try {
    const [head, rows, name] = await LIVE[btn.dataset.dlLive](ko);
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    save(`gms-hub-${name}-${day}.csv`, toCsv(head, rows));
    window.track?.('download', { set: btn.dataset.dlLive, live: true });
    btn.innerHTML = label;
  } catch {
    btn.lastChild.textContent = ko ? '지금은 받을 수 없어요. 잠시 뒤에 다시 눌러 주세요.' : 'Not available right now. Try again shortly.';
    setTimeout(() => { btn.innerHTML = label; }, 4000);
  } finally { btn.disabled = false; }
});
