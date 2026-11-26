// Owner-only traffic dashboard (/admin/traffic/): one KST day of Cloudflare Web Analytics from the worker's
// /internal/traffic, next to yesterday and the same weekday last week cut at the same clock time. The owner key is the
// MAIL_ADMIN_TOKEN, kept in this browser only. Numbers are Cloudflare's sampled estimates.
const cfg = JSON.parse(document.getElementById('traffic-config').textContent);
const root = document.getElementById('traffic-root');
const KEY = 'gms-traffic-key';
const store = {
  get: () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
  set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} }
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = (n) => new Intl.NumberFormat('ko').format(n);
const sum = (h, i = 0) => h.reduce((a, r) => a + r[i], 0);
const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%` : '–');
const COUNTRY = { CN: '중국', HK: '홍콩', IN: '인도', KR: '한국', US: '미국', IL: '이스라엘', CA: '캐나다', BR: '브라질', JP: '일본', AU: '호주', SG: '싱가포르', GB: '영국', DE: '독일', NL: '네덜란드', FR: '프랑스', TW: '대만', VN: '베트남', TH: '태국', PH: '필리핀', MY: '말레이시아', ID: '인도네시아', ES: '스페인', SE: '스웨덴', NZ: '뉴질랜드', MX: '멕시코' };
const PAGE = [
  [/^\/$/, '홈'], [/^\/tools\/market\/today\//, '오늘의 시세'], [/^\/tools\/market\//, '실시간 시세'], [/^\/tools\/training\//, '사냥터 추천'],
  [/^\/megaphone\//, '실시간 확성기'], [/^\/scam\//, '사기꾼 제보'], [/^\/tools\/exp\//, '경험치 측정기'], [/^\/tools\/damage\//, '몇 방 컷 계산기'], [/^\/tools\/forge\//, '주문서 작 시뮬'],
  [/^\/trade\//, '팝니다·삽니다'], [/^\/tools\/sell\//, '팔릴 가격'], [/^\/tools\/scroll-profit\//, '작 손익'], [/^\/tools\/scroll\//, '주문서 계산기'], [/^\/tools\/scan\//, '상점 스캔'], [/^\/forgotten-hollow\//, '포가튼 할로우'], [/^\/report\//, '주간 리포트'],
  [/^\/quests\//, '퀘스트'], [/^\/guides\//, '가이드'], [/^\/monsters\//, '몬스터'], [/^\/maps\//, '맵'], [/^\/items\//, '아이템'], [/^\/skills\//, '스킬'],
  [/^\/equipment\//, '장비'], [/^\/rank\//, '랭킹'], [/^\/discord-bot\//, '디스코드 봇'], [/^\/sites\//, '사이트 모음'], [/^\/updates\//, '업데이트']
];
const pageName = (p) => { const hit = PAGE.find(([re]) => re.test(p)); return hit ? (hit[1] + (hit[0].source.endsWith('\\/') && p.split('/').filter(Boolean).length > 1 && !/market\/$|training\/$/.test(p) ? ` · ${p.split('/').filter(Boolean).slice(1).join('/')}` : '')) : p; };
const SOURCE = { 'Direct / app': '직접·북마크·앱 링크', 'Naver blog': '네이버 블로그', 'Naver search': '네이버 검색', DCinside: '디시인사이드', 'Arca.live': '아카라이브', 'Daum/Kakao': '다음·카카오', Tistory: '티스토리' };

let state = { day: '', data: null, loading: false, error: '' };

function bars(rows, { max, label, value, fmt = nf, accent = false }) {
  const m = max ?? Math.max(1, ...rows.map(value));
  return `<ul class="td-bars">${rows.map((r) => `<li><span class="td-bl">${label(r)}</span><span class="td-bt"><i style="width:${(value(r) / m) * 100}%" class="${accent ? 'acc' : ''}"></i></span><b>${fmt(value(r))}</b></li>`).join('')}</ul>`;
}

// Long lists: the first rows stay open, the rest fold behind one "더 보기" (owner 2026-11-26: easier to read).
const SHOW = 10;
function foldTable(head, rows, cls = 'data td-who-table') {
  if (!rows.length) return '';
  const table = (list) => `<div class="table-wrap"><table class="${cls}"><thead>${head}</thead><tbody>${list.join('')}</tbody></table></div>`;
  if (rows.length <= SHOW + 2) return table(rows);
  return `${table(rows.slice(0, SHOW))}<details class="td-more"><summary>나머지 ${nf(rows.length - SHOW)}줄 더 보기</summary>${table(rows.slice(SHOW))}</details>`;
}

// Hover tips: every chart column carries data-tip (plain lines joined with "\n"); one floating box follows the pointer.
const tipLines = (rows) => esc(rows.filter(Boolean).join('\n'));
const diff = (a, b) => (b ? ` (${a >= b ? '+' : ''}${nf(a - b)}, ${pct(a, b)})` : '');

// 24 columns: the chosen day (filled) against yesterday and last week (lines), same hours. Hovering an hour shows its
// visits, pageviews, pages per visit, Korea/abroad and both comparisons.
function hourChart(d) {
  const W = 720, H = 210, P = 30, bw = (W - P) / 24;
  const cut = d.isToday ? d.cutHour : 99;
  const day = d.hourly.day.map((r) => r[0]), y = d.hourly.yesterday.map((r) => r[0]), w = d.hourly.lastWeek.map((r) => r[0]);
  const max = Math.max(5, ...day, ...y, ...w);
  const ky = (v) => H - 20 - (v / max) * (H - 34);
  const line = (arr, cls) => `<polyline class="${cls}" points="${arr.map((v, i) => `${P + i * bw + bw / 2},${ky(v)}`).join(' ')}"/>`;
  const dots = (arr, cls) => arr.map((v, i) => `<circle cx="${P + i * bw + bw / 2}" cy="${ky(v)}" r="2.2" class="${cls}"/>`).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)).map((v) => `<text x="0" y="${ky(v) + 4}" class="td-ax">${v}</text><line x1="${P}" x2="${W}" y1="${ky(v)}" y2="${ky(v)}" class="td-grid"/>`).join('');
  // Today as the main line (up to the current hour), with a soft area under it and its value on every point.
  const shown = day.map((v, i) => [v, i]).filter(([, i]) => i <= cut);
  const xs = (i) => P + i * bw + bw / 2;
  const area = shown.length ? `<polygon class="td-area" points="${xs(shown[0][1])},${H - 20} ${shown.map(([v, i]) => `${xs(i)},${ky(v)}`).join(' ')} ${xs(shown.at(-1)[1])},${H - 20}"/>` : '';
  const cols = `${area}<polyline class="td-lt" points="${shown.map(([v, i]) => `${xs(i)},${ky(v)}`).join(' ')}"/>${shown.map(([v, i]) => `<circle cx="${xs(i)}" cy="${ky(v)}" r="3.2" class="td-dt${i === cut ? ' now' : ''}"/>`).join('')}`;
  const hits = day.map((v, i) => {
    const views = d.hourly.day[i][1], [k, a] = d.hourly.koreaAbroad[i] || [0, 0];
    const tip = tipLines([
      `${i}시${i === cut ? ' (진행 중)' : ''}`,
      `방문 ${nf(v)} · 페이지뷰 ${nf(views)}${v ? ` · 방문당 ${(views / v).toFixed(1)}쪽` : ''}`,
      `한국 ${nf(k)} · 해외 ${nf(a)}`,
      `어제 ${nf(y[i])}${diff(v, y[i])}`,
      `지난주 ${nf(w[i])}${diff(v, w[i])}`
    ]);
    return `<rect x="${P + i * bw}" y="0" width="${bw}" height="${H}" class="td-hit" data-tip="${tip}"/>`;
  }).join('');
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => h % 2 === 0).map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 4}" class="td-ax mid">${h}시</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="시간대별 방문">${ticks}${line(w, 'td-lw')}${line(y, 'td-ly')}${dots(y, 'td-dy')}${cols}${hours}${hits}</svg>
<p class="td-legend"><span class="k day"></span>${esc(d.day)} <span class="k y"></span>어제 ${esc(d.compare.yesterday.slice(5))} <span class="k w"></span>지난주 같은 요일 ${esc(d.compare.lastWeek.slice(5))} <span class="muted">· 그래프에 마우스를 올리면 자세히 보여요</span></p>`;
}

function koreaChart(d) {
  const W = 720, H = 170, P = 30, bw = (W - P) / 24;
  const rows = d.hourly.koreaAbroad, max = Math.max(5, ...rows.map(([a, b]) => a + b));
  const base = H - 20, ky = (v) => (v / max) * (H - 30);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f)).map((v) => `<text x="0" y="${base - ky(v) + 4}" class="td-ax">${v}</text><line x1="${P}" x2="${W}" y1="${base - ky(v)}" y2="${base - ky(v)}" class="td-grid"/>`).join('');
  const kSum = rows.reduce((a, r) => a + r[0], 0), aSum = rows.reduce((a, r) => a + r[1], 0);
  return `<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="한국·해외 시간대별 방문">${ticks}${rows.map(([k, a], i) => {
    const x = P + i * bw + 2;
    const tip = tipLines([`${i}시`, `한국 ${nf(k)} · 해외 ${nf(a)}`, k + a ? `해외 비율 ${Math.round((a / (k + a)) * 100)}%` : '']);
    return `<rect x="${x}" y="${base - ky(k)}" width="${bw - 4}" height="${ky(k)}" class="td-kr"/><rect x="${x}" y="${base - ky(k) - ky(a)}" width="${bw - 4}" height="${ky(a)}" class="td-ab"/><rect x="${P + i * bw}" y="0" width="${bw}" height="${H}" class="td-hit" data-tip="${tip}"/>`;
  }).join('')}${Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 4}" class="td-ax mid">${h}시</text>`).join('')}</svg>
<p class="td-legend"><span class="k kr"></span>한국 ${nf(kSum)} <span class="k ab"></span>해외 ${nf(aSum)} <span class="muted">· 해외 ${kSum + aSum ? Math.round((aSum / (kSum + aSum)) * 100) : 0}%</span></p>`;
}

// Automated browsers (headless Chrome, crawlers) by hour: an estimate already included in every other number.
function botChart(d) {
  const b = d.bots;
  if (!b) return '';
  const W = 720, H = 150, P = 30, bw = (W - P) / 24;
  const rows = b.hourly, all = d.hourly.day, max = Math.max(5, ...rows.map(([v]) => v));
  const base = H - 20, ky = (v) => (v / max) * (H - 30);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f)).map((v) => `<text x="0" y="${base - ky(v) + 4}" class="td-ax">${v}</text><line x1="${P}" x2="${W}" y1="${base - ky(v)}" y2="${base - ky(v)}" class="td-grid"/>`).join('');
  const bars = rows.map(([v, p], i) => {
    const tot = all[i]?.[0] || 0;
    const tip = tipLines([`${i}시`, `자동 접속 방문 ${nf(v)} · 페이지뷰 ${nf(p)}`, tot ? `이 시간 전체 방문 ${nf(tot)} 중 ${Math.round((v / tot) * 100)}%` : '']);
    return `<rect x="${P + i * bw + 2}" y="${base - ky(v)}" width="${bw - 4}" height="${ky(v)}" class="td-bot"/><rect x="${P + i * bw}" y="0" width="${bw}" height="${H}" class="td-hit" data-tip="${tip}"/>`;
  }).join('');
  const total = sum(rows), share = sum(all) ? Math.round((total / sum(all)) * 100) : 0;
  const top = b.top.filter((r) => r.visits > 0).slice(0, 6).map((r) => `<li><span>${esc(r.browser === 'ChromeHeadless' ? '화면 없는 크롬' : r.browser)} · ${esc(COUNTRY[r.country] || r.country)} · <code>${esc(r.path)}</code></span><b>${nf(r.visits)}</b></li>`).join('');
  return `<section class="panel"><h2>자동 접속(봇) 추정 <small class="muted">방문 ${nf(total)} · 전체의 ${share}%</small></h2>
<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="시간대별 자동 접속 추정">${ticks}${bars}${Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 4}" class="td-ax mid">${h}시</text>`).join('')}</svg>
${top ? `<ul class="td-botlist">${top}</ul>` : ''}
<p class="muted small">위 방문·나라·페이지 숫자에는 이 자동 접속이 포함돼 있어요. 브라우저 이름으로 가려낸 추정이라, 이름을 숨긴 봇은 빠져요.</p></section>`;
}

// Requests that were turned away: by Cloudflare's firewall on the site, and by our own API. Every row is listed (not a
// top few) so nothing blocked goes unseen; a row from a search engine's network is flagged, since that would be a mistake.
const FW_SOURCE = { firewallCustom: '직접 만든 규칙', firewallcustom: '직접 만든 규칙', firewallManaged: '관리 규칙', firewallmanaged: '관리 규칙', bic: '브라우저 무결성 검사', securitylevel: '보안 수준', securityLevel: '보안 수준', hot: '이미지 도용 방지', ratelimit: '요청 제한', l7ddos: '디도스 방어', botFight: '봇 파이트 모드', botfight: '봇 파이트 모드', validation: '잘못된 요청', waf: '웹 방화벽', uablock: '브라우저 이름 차단', ip: '주소 차단', country: '나라 차단', asn: '통신망 차단', zonelockdown: '구역 잠금' };
const FW_ACTION = { block: '차단', challenge: '확인 요구', jschallenge: '확인 요구', managed_challenge: '확인 요구', connection_close: '연결 끊음', challenge_failed: '확인 실패', jschallenge_failed: '확인 실패' };
const WK_REASON = { nopath: '없는 주소 찌르기 (받은 것 없음)', headless: '화면 없는 크롬', listings: '매물 목록 긁기', outside: '사이트 밖에서 API 호출', rate: '요청 너무 많음', key: '운영자 키 틀림', forbidden: '허용 안 된 요청' };
const SEARCH_NET = /google|microsoft|naver|kakao|daum|yandex|apple|duckduckgo|baidu|openai/i;
// Cloud servers rented from the same companies also scan for leaked files; those rows are not search engines.
const SCAN_PATH = /wp-|\.php|\.env|\.git|\.sql|\.bak/i;
// Google and Microsoft rent servers to anyone under the same network name, so there the crawler's own name or Googlebot's
// address block (66.249.64.0/19) has to match too.
const RENTED_NET = /google|microsoft/i;
const CRAWLER_UA = /bot\b|google|bing|lighthouse|spider|crawler|preview/i;
const crawlerLike = (r) => SEARCH_NET.test(r.org || '') && (!RENTED_NET.test(r.org) || CRAWLER_UA.test(r.ua || '') || /^66\.249\.(6[4-9]|[78]\d|9[0-5])\./.test(r.ip || ''));
const isSearch = (g) => g.crawler && ![...g.paths.keys()].every((x) => SCAN_PATH.test(x));
const isRented = (g) => !g.crawler && RENTED_NET.test(g.org || '');
const uaShort = (ua) => {
  if (!ua) return '(이름 없음)';
  const m = ua.match(/HeadlessChrome\/[\d]+|python-requests\/[\d.]+|Python-urllib\/[\d.]+|aiohttp\/[\d.]+|Java\/[\d._]+|curl\/[\d.]+|Go-http-client\/[\d.]+|node-fetch|axios\/[\d.]+|okhttp\/[\d.]+|[A-Za-z]+[Bb]ot\/?[\d.]*|Edg\/\d+|Firefox\/\d+|Chrome\/\d+|Safari\/\d+/);
  return m ? m[0] : ua.slice(0, 40);
};
function blockedPanel(d) {
  const b = d.blocked;
  if (!b) return '';
  // Only what Cloudflare's firewall stopped on the site: our own API's refusals are listed in the API panel above.
  const fw = b.firewall?.rows || [];
  const fwN = fw.reduce((a, r) => a + r.n, 0);
  const W = 720, H = 150, P = 30, bw = (W - P) / 24, base = H - 20;
  const max = Math.max(5, ...b.hourly.map(([f]) => f)), ky = (v) => (v / max) * (H - 30);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f)).map((v) => `<text x="0" y="${base - ky(v) + 4}" class="td-ax">${v}</text><line x1="${P}" x2="${W}" y1="${base - ky(v)}" y2="${base - ky(v)}" class="td-grid"/>`).join('');
  const bars = b.hourly.map(([f], i) => `<rect x="${P + i * bw + 2}" y="${base - ky(f)}" width="${bw - 4}" height="${ky(f)}" class="td-bot"/><rect x="${P + i * bw}" y="0" width="${bw}" height="${H}" class="td-hit" data-tip="${tipLines([`${i}시`, `방화벽이 막은 요청 ${nf(f)}`])}"/>`).join('');
  // By who: one network + country + browser name is one line, with the rules, pages and addresses it touched.
  const groups = new Map();
  const add = (r, where, why) => {
    const crawler = crawlerLike(r), k = `${r.org}|${r.country}|${uaShort(r.ua)}|${crawler}`;
    const g = groups.get(k) || { crawler, org: r.org, country: r.country, ua: uaShort(r.ua), full: r.ua, n: 0, why: new Map(), paths: new Map(), ips: new Set(), where: new Set() };
    g.n += r.n; g.where.add(where); if (r.ip) g.ips.add(r.ip);
    g.why.set(why, (g.why.get(why) || 0) + r.n); g.paths.set(r.path, (g.paths.get(r.path) || 0) + r.n);
    groups.set(k, g);
  };
  for (const r of fw) add(r, '방화벽', `${FW_SOURCE[r.source] || r.source} · ${FW_ACTION[r.action] || r.action}`);
  const top = (m, n) => [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, n);
  const list = [...groups.values()].sort((a, c) => c.n - a.n);
  const warn = list.filter(isSearch);
  const rows = list.map((g) => `<tr${isSearch(g) ? ' class="td-warn"' : ''}><td class="num"><b>${nf(g.n)}</b></td><td>${esc(COUNTRY[g.country] || g.country)} · ${esc(g.org || '?')}${isSearch(g) ? ' <span class="td-flag">검색 로봇</span>' : isRented(g) ? ' <span class="muted">(검색 로봇 이름 아님)</span>' : ''}${d.you && g.ips.has(d.you) ? ' <span class="td-tag-me">내 인터넷</span>' : ''}<br><span class="muted">주소 ${nf(g.ips.size)}개${g.ips.size <= 3 ? ` (${esc([...g.ips].join(', '))})` : ''}</span></td><td title="${esc(g.full)}">${esc(g.ua)}</td><td>${top(g.why, 3).map(([w, n]) => `${esc(w)} ${nf(n)}`).join('<br>')}</td><td>${top(g.paths, 3).map(([pth, n]) => `<code>${esc(pth)}</code> ${nf(n)}`).join('<br>')}${g.paths.size > 3 ? `<br><span class="muted">외 ${nf(g.paths.size - 3)}곳</span>` : ''}</td></tr>`);
  const errs = [b.firewall?.error && `사이트 방화벽 기록을 못 읽었어요: ${b.firewall.error}`].filter(Boolean).map((t) => `<p class="td-err">${esc(t)}</p>`).join('');
  return `<section class="panel"><h2>방화벽이 막은 요청 <small class="muted">${b.firewall?.error ? '못 읽음' : `${nf(fwN)}건 · ${nf(list.length)}군데`}</small></h2>
${errs}${b.firewall?.full ? '<p class="td-err">하루치가 너무 많아 최근 5,000건만 세었어요.</p>' : ''}
<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="시간대별 차단">${ticks}${bars}${Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 4}" class="td-ax mid">${h}시</text>`).join('')}</svg>
${warn.length ? `<p class="td-err">검색 로봇으로 보이는 요청이 ${nf(warn.reduce((a, g) => a + g.n, 0))}건 막혔어요. 아래 빨간 줄을 확인하세요.</p>` : ''}
${rows.length ? foldTable('<tr><th class="num">횟수</th><th>나라 · 통신망</th><th>브라우저 이름</th><th>막은 이유</th><th>요청한 주소</th></tr>', rows, 'data td-who-table td-blk-table') : (errs ? '' : '<p class="muted">이 날 막힌 요청이 없어요.</p>')}
<p class="muted small">사이트(gms-hub.com) 앞단에서 Cloudflare가 막은 요청이에요. 방문 숫자에 들어가지 않고, Cloudflare가 보관하는 사흘쯤까지만 나와요. 우리 서버(API)가 거절한 요청은 위 'API를 부른 곳 전체'에 있어요.</p></section>`;
}

// Calls to the API that did not come from a page of the site: someone reading prices, listings or megaphones straight
// from the address. They are answered for now and only counted (worker reason 'watch'); one line per caller.
const API_NAME = [[/^\/prices/, '가격'], [/^\/market\/history/, '7일 매물 기록'], [/^\/market\/catalog/, '전체 시세 요약'], [/^\/market\/item/, '아이템 시세'], [/^\/market\//, '시세'], [/^\/listings/, '매물'], [/^\/megaphones/, '확성기'], [/^\/free-megas/, '팝니다·삽니다'], [/^\/rank/, '랭킹'], [/^\/scam/, '사기꾼 제보'], [/^\/news/, '게임 공지'], [/^\/report/, '주간 리포트']];
const apiName = (p) => (API_NAME.find(([re]) => re.test(p)) || [0, '그 밖'])[1];
// Everyone who called the API in one list: answered from outside the site, verified search crawlers and refused calls
// together, each caller with how many went through and how many were turned away. The owner's own addresses (this
// browser's, and every address this browser has had: kept in localStorage) are left out of the chart and the list.
const API_STATE = { watch: ['pass', '통과'], nopath: ['stop', '없는 주소 · 받은 것 없음'], bot: ['bot', '검색 로봇 통과'], outside: ['stop', '차단 · 사이트 밖'], listings: ['stop', '차단 · 매물 목록'], headless: ['stop', '차단 · 화면 없는 크롬'], rate: ['stop', '차단 · 요청 너무 많음'], key: ['stop', '차단 · 키 틀림'], forbidden: ['stop', '차단 · 허용 안 됨'] };
const MY_IPS = 'gms-traffic-my-ips';
function myIps(you) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(MY_IPS) || '[]') || []; } catch (e) {}
  if (you && !list.includes(you)) { list = [...list, you].slice(-30); try { localStorage.setItem(MY_IPS, JSON.stringify(list)); } catch (e) {} }
  return new Set(list);
}
function outsidePanel(d) {
  const o = d.blocked?.api;
  if (!o) return '';
  if (o.error) return `<section class="panel"><h2>API를 부른 곳 전체</h2><p class="td-err">기록을 못 읽었어요: ${esc(o.error)}</p></section>`;
  const mine = myIps(d.you);
  const all = o.rows || [], rowsIn = all.filter((r) => !mine.has(r.ip)), hidden = all.reduce((a, r) => a + (mine.has(r.ip) ? r.n : 0), 0);
  const kind = (r) => (API_STATE[r.reason] || ['stop', `차단 · ${r.reason}`])[0];
  const hours = Array.from({ length: 24 }, () => ({ pass: 0, bot: 0, stop: 0 }));
  for (const r of rowsIn) hours[r.hour][kind(r)] += r.n;
  const tot = hours.reduce((a, h) => ({ pass: a.pass + h.pass, bot: a.bot + h.bot, stop: a.stop + h.stop }), { pass: 0, bot: 0, stop: 0 });
  const upto = d.isToday ? d.cutHour : 23, shown = hours.slice(0, upto + 1);
  const W = 720, H = 180, P = 36, bw = (W - P) / 24, base = H - 20;
  const max = Math.max(5, ...hours.map((h) => Math.max(h.pass, h.bot, h.stop))), ky = (v) => (v / max) * (H - 42), x = (i) => P + i * bw + bw / 2;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f)).map((v) => `<text x="0" y="${base - ky(v) + 4}" class="td-ax">${nf(v)}</text><line x1="${P}" x2="${W}" y1="${base - ky(v)}" y2="${base - ky(v)}" class="td-grid"/>`).join('');
  const line = (key, cls) => `<polyline class="td-api ${cls}" points="${shown.map((h, i) => `${x(i)},${base - ky(h[key])}`).join(' ')}"/>${shown.map((h, i) => (h[key] ? `<circle cx="${x(i)}" cy="${base - ky(h[key])}" r="3" class="td-api-dot ${cls}"/>` : '')).join('')}`;
  const hits = shown.map((h, i) => `<rect x="${P + i * bw}" y="0" width="${bw}" height="${H}" class="td-hit" data-tip="${tipLines([`${i}시`, `통과 ${nf(h.pass)} · 검색 로봇 ${nf(h.bot)} · 차단 ${nf(h.stop)}`])}"/>`).join('');
  // By who: one network + country is one line, whatever program names it sent (a scanner rotates through dozens).
  const groups = new Map(), kinds = new Map();
  for (const r of rowsIn) {
    const k = `${r.org}|${r.country}`;
    const g = groups.get(k) || { org: r.org, country: r.country, uas: new Map(), n: 0, pass: 0, bot: 0, stop: 0, why: new Map(), paths: new Map(), ips: new Set() };
    g.n += r.n; g[kind(r)] += r.n; if (r.ip) g.ips.add(r.ip);
    g.uas.set(uaShort(r.ua), (g.uas.get(uaShort(r.ua)) || 0) + r.n);
    const label = (API_STATE[r.reason] || [0, `차단 · ${r.reason}`])[1];
    g.why.set(label, (g.why.get(label) || 0) + r.n);
    g.paths.set(r.path, (g.paths.get(r.path) || 0) + r.n);
    groups.set(k, g);
    if (kind(r) !== 'stop') kinds.set(apiName(r.path), (kinds.get(apiName(r.path)) || 0) + r.n);
  }
  const top = (m, n) => [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, n);
  const list = [...groups.values()].sort((a, c) => c.n - a.n);
  const cls = (label) => (label.startsWith('차단') ? 'stop' : label.startsWith('검색') ? 'bot' : 'pass');
  const progs = (g) => { const t = top(g.uas, 2).map(([u]) => esc(u)).join(', '); return g.uas.size > 2 ? `${t} <span class="muted">외 ${nf(g.uas.size - 2)}가지</span>` : t; };
  const rows = list.map((g) => `<tr><td class="num"><b>${nf(g.n)}</b></td><td>${[...g.why.entries()].sort((a, c) => c[1] - a[1]).map(([w, n]) => `<span class="td-st ${cls(w)}">${esc(w)} ${nf(n)}</span>`).join(' ')}</td><td>${esc(COUNTRY[g.country] || g.country)} · ${esc(g.org || '?')}<br><span class="muted">주소 ${nf(g.ips.size)}개${g.ips.size <= 3 ? ` (${esc([...g.ips].join(', '))})` : ''}</span></td><td>${progs(g)}</td><td>${top(g.paths, 4).map(([p, n]) => `<code>${esc(p)}</code> ${nf(n)}`).join('<br>')}${g.paths.size > 4 ? `<br><span class="muted">외 ${nf(g.paths.size - 4)}곳</span>` : ''}</td></tr>`);
  const kindLine = top(kinds, 6).map(([k, n]) => `${esc(k)} ${nf(n)}`).join(' · ');
  return `<section class="panel"><h2>API를 부른 곳 전체 <small class="muted">통과 ${nf(tot.pass)} · 검색 로봇 ${nf(tot.bot)} · 차단 ${nf(tot.stop)} · 부른 곳 ${nf(list.length)}군데</small></h2>
<p class="muted small">사이트 화면이 아닌 곳에서 API를 부른 요청이에요. 11월 26일 오전 8시 40분부터는 열쇠 없는 호출을 모두 막아요. 내 인터넷 주소에서 온 ${nf(hidden)}번은 뺐어요.</p>
${o.full ? '<p class="td-err">하루치가 너무 많아 많이 부른 순으로 4,000줄까지만 세었어요.</p>' : ''}
<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="시간대별 API 호출">${ticks}${line('pass', 'pass')}${line('bot', 'bot')}${line('stop', 'stop')}${hits}${Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 4}" class="td-ax mid">${h}시</text>`).join('')}</svg>
<p class="td-legend"><span class="k api-pass"></span>통과 (데이터를 받아 감) ${nf(tot.pass)} <span class="k api-bot"></span>검색 로봇 ${nf(tot.bot)} <span class="k api-stop"></span>차단 ${nf(tot.stop)}</p>
${kindLine ? `<p class="muted small">통과한 호출이 읽어 간 것: ${kindLine}</p>` : ''}
${rows.length ? foldTable('<tr><th class="num">횟수</th><th>결과</th><th>나라 · 통신망</th><th>프로그램 이름</th><th>부른 주소</th></tr>', rows, 'data td-who-table td-blk-table') : '<p class="muted">이 날 기록된 호출이 없어요.</p>'}
<p class="muted small">사이트 화면에서 부른 정상 요청, 열쇠를 쓰는 우리 빌드·수집기, 디스코드 로그인, 공유 카드는 세지 않아요. "gms-hub.com에서 왔다"고 꾸며 보내는 프로그램은 구분이 안 돼서 빠져요.</p></section>`;
}

// Runs of the screen-reading tools over the last 7 days: what share read, and every way the others failed.
const TOOL_NAME = { exp: 'EXP 측정기', scan: '상점 스캔' };
const OUTCOME = { ok: '읽음', no_bar: '상태바를 못 찾음', read_fail: '숫자를 못 읽음', black: '검은 화면', share_error: '화면 공유 오류', first_rows: '상점 읽음', black_frame: '검은 화면', no_shop: '상점을 못 찾음', unsure_rows: '이름이 불확실', read_error: '읽기 오류', video_play: '영상 재생 실패', upload_fail: '올리기 실패', no_room: '방 번호를 못 읽음', no_channel: '채널을 못 읽음', no_location: '채널·방을 못 읽음' };
// What a run recorded about itself: how it read ("soft" = by best fit) or, for a failed EXP run, how much stayed unread.
const HOW = { exact: '또렷하게 읽음', soft: '흐린 숫자를 맞춰 읽음' };
const howText = (r) => { const m = /^len(\d+)unread(\d+)$/.exec(r.how || ''); return m ? (Number(m[1]) ? `글자 ${m[1]}개 중 ${m[2]}개 못 읽음` : '숫자 줄을 못 찾음') : HOW[r.how] || r.how || ''; };
// The status bar's gauges sit 108 game pixels apart, so their spacing on the shared picture says how large the game was drawn.
const drawn = (r) => (r.tool === 'exp' && r.pitch > 0 ? `게임 화면 ${(r.pitch / 108).toFixed(2)}배` : '');
function toolPanel(d) {
  const b = d.tools;
  if (!b) return '';
  if (b.error) return `<section class="panel"><h2>화면 읽는 도구 상태</h2><p class="td-err">기록을 못 읽었어요: ${esc(b.error)}</p></section>`;
  const tot = (tool, f = () => true) => b.days.filter((r) => r.tool === tool && f(r)).reduce((a, r) => a + r.n, 0);
  const all = tot('exp'), ok = tot('exp', (r) => r.outcome === 'ok'), rate = all ? Math.round((ok / all) * 100) : null;
  const days = [...new Set(b.days.map((r) => r.day))].sort();
  const daily = days.map((day) => { const n = tot('exp', (r) => r.day === day), k = tot('exp', (r) => r.day === day && r.outcome === 'ok'); return n ? `<li><span>${esc(day.slice(5))}</span><b>${nf(k)} / ${nf(n)} (${Math.round((k / n) * 100)}%)</b></li>` : ''; }).join('');
  const bad = b.why.filter((r) => r.outcome !== 'ok' && r.outcome !== 'first_rows');
  const rows = bad.map((r) => `<tr><td class="num"><b>${nf(r.n)}</b></td><td>${esc(TOOL_NAME[r.tool] || r.tool)}</td><td>${esc(OUTCOME[r.outcome] || r.outcome)}</td><td>${esc(r.size || '-')}<br><span class="muted">모니터 ${esc(r.screen)} · 배율 ${esc(r.dpr)}</span></td><td>${esc(r.os)} · ${esc(r.browser)}<br><span class="muted">${esc([r.surface, drawn(r), howText(r)].filter(Boolean).join(' · '))}</span></td></tr>`);
  return `<section class="panel"><h2>화면 읽는 도구 상태 <small class="muted">최근 7일</small></h2>
${all ? `<p class="${rate < 80 && all >= 5 ? 'td-err' : ''}">EXP 측정기: ${nf(all)}번 중 ${nf(ok)}번 읽었어요 (${rate}%)${rate < 80 && all >= 5 ? ' · 80%보다 낮아요. 아래 실패를 확인하세요.' : ''} · 레벨까지 읽은 것 ${nf(b.days.filter((r) => r.tool === 'exp').reduce((a, r) => a + r.lv, 0))}번</p><ul class="td-botlist">${daily}</ul>` : '<p class="muted">아직 EXP 측정 기록이 없어요. 11월 24일 밤부터 쌓여요.</p>'}
${foldTable('<tr><th class="num">횟수</th><th>도구</th><th>실패한 이유</th><th>공유한 화면</th><th>환경</th></tr>', rows)}
<p class="muted small">결과, 화면 크기, 브라우저만 남겨요. 화면이나 읽은 숫자, 닉네임은 남기지 않아요.</p></section>`;
}

// The last 7 days against the 7 before them, day by day (same weekday side by side). Today is still running, so its
// last-week partner is cut at the same clock time.
function weekChart(d, upto) {
  const days = d.daily;
  if (days.length < 14) return '';
  const cur = days.slice(7), prev = days.slice(0, 7);
  const today = (i) => d.isToday && i === 6;
  const prevVal = (i) => (today(i) ? upto(d.hourly.lastWeek) : prev[i].visits);
  const prevViews = (i) => (today(i) ? upto(d.hourly.lastWeek, 1) : prev[i].views);
  const W = 720, H = 200, P = 30, bw = (W - P) / 7;
  const max = Math.max(5, ...cur.map((x) => x.visits), ...prev.map((x, i) => prevVal(i)));
  const ky = (v) => (v / max) * (H - 54);
  const base = H - 32;
  const wd = (day) => '일월화수목금토'[new Date(`${day}T00:00:00Z`).getUTCDay()];
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f)).map((v) => `<text x="0" y="${base - ky(v) + 4}" class="td-ax">${v}</text><line x1="${P}" x2="${W}" y1="${base - ky(v)}" y2="${base - ky(v)}" class="td-grid"/>`).join('');
  const cols = cur.map((x, i) => {
    const pv = prevVal(i), x0 = P + i * bw;
    const ch = pv ? Math.round((x.visits / pv - 1) * 100) : null;
    const tip = tipLines([
      `${x.day} (${wd(x.day)})${today(i) ? ' · 진행 중' : ''}`,
      `방문 ${nf(x.visits)} · 페이지뷰 ${nf(x.views)}${x.visits ? ` · 방문당 ${(x.views / x.visits).toFixed(1)}쪽` : ''}`,
      `지난주 ${prev[i].day}${today(i) ? ' (같은 시각까지)' : ''}: 방문 ${nf(pv)} · 페이지뷰 ${nf(prevViews(i))}`,
      `방문 차이 ${diff(x.visits, pv).replace(/^ \(|\)$/g, '') || '–'}`
    ]);
    return `<rect x="${x0 + 6}" y="${base - ky(pv)}" width="${bw / 2 - 8}" height="${ky(pv)}" class="td-prev"/>
<rect x="${x0 + bw / 2 + 2}" y="${base - ky(x.visits)}" width="${bw / 2 - 8}" height="${ky(x.visits)}" class="td-cur${today(i) ? ' now' : ''}"/>
<text x="${x0 + bw / 2}" y="${H - 10}" class="td-ax mid">${x.day.slice(5).replace('-', '/')} ${wd(x.day)}</text>
<rect x="${x0}" y="0" width="${bw}" height="${H}" class="td-hit" data-tip="${tip}"/>`;
  }).join('');
  const sc = cur.reduce((a, x) => a + x.visits, 0), sp = prev.reduce((a, x, i) => a + prevVal(i), 0);
  const vc = cur.reduce((a, x) => a + x.views, 0), vp = prev.reduce((a, x, i) => a + prevViews(i), 0);
  return `<section class="panel"><h2>이번 7일과 지난 7일 <small class="muted">방문 ${nf(sc)} / ${nf(sp)} (${pct(sc, sp)}) · 페이지뷰 ${nf(vc)} / ${nf(vp)} (${pct(vc, vp)})</small></h2>
<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="최근 7일과 그 전 7일 요일별 방문">${ticks}${cols}</svg>
<p class="td-legend"><span class="k prev"></span>지난주 같은 요일 <span class="k day"></span>이번 주${d.isToday ? ' (오늘은 같은 시각까지)' : ''}</p></section>`;
}

function render() {
  const key = store.get();
  if (!key) {
    root.innerHTML = `<section class="panel td-login"><h1>트래픽</h1><p>운영자 키를 넣으면 이 브라우저에만 저장돼요.</p>
<form id="td-key"><input type="password" name="k" placeholder="운영자 키" autocomplete="off" required> <button class="btn">열기</button></form></section>`;
    root.querySelector('#td-key').addEventListener('submit', (e) => { e.preventDefault(); store.set(e.target.k.value.trim()); load(); });
    return;
  }
  const d = state.data;
  const head = `<div class="td-head"><h1>트래픽</h1><div class="td-tools"><input type="date" id="td-day" value="${esc(state.day || d?.day || '')}" max="${esc(d?.today || '')}">
<button class="btn ghost small-btn" id="td-reload"${state.loading ? ' disabled' : ''}>${state.loading ? '<span class="td-spin sm" aria-hidden="true"></span>불러오는 중' : '새로고침'}</button><button class="btn ghost small-btn" id="td-out">키 지우기</button></div></div>`;
  if (state.error) { root.innerHTML = `${head}<p class="td-err">${esc(state.error)}</p>`; bind(); return; }
  if (!d) { root.innerHTML = `${head}<div class="td-loading"><span class="td-spin" aria-hidden="true"></span><span>통계를 불러오는 중이에요… 처음엔 10초쯤 걸려요</span></div>
<div class="td-cards">${'<div class="td-card td-skel"></div>'.repeat(4)}</div><div class="panel td-skel tall"></div><div class="panel td-skel"></div>`; bind(); return; }
  // Yesterday and last week are whole days; cut them at today's clock time (the current hour by its elapsed minutes).
  const upto = (h, i = 0) => (d.isToday ? h.slice(0, d.cutHour).reduce((a, r) => a + r[i], 0) + Math.round((h[d.cutHour]?.[i] || 0) * (d.cutMinute / 60)) : sum(h, i));
  const v0 = sum(d.hourly.day), v1 = upto(d.hourly.yesterday), v7 = upto(d.hourly.lastWeek);
  const p0 = sum(d.hourly.day, 1), p1 = upto(d.hourly.yesterday, 1);
  const kr = d.countries.find((c) => c.country === 'KR')?.visits || 0, abroad = d.countries.reduce((a, c) => a + c.visits, 0) - kr;
  const cutNote = d.isToday ? `오늘 ${d.cutHour}시 ${d.cutMinute}분까지 · 어제·지난주도 같은 시각까지 잘라 비교` : '하루 전체';
  const live = d.live ? `<div class="td-card"><span>지금 열린 페이지</span><b id="td-live-now">${nf(d.live.now)}</b><small>지금 이 순간 사이트를 열어 둔 탭 수</small></div><div class="td-card"><span>최대 동시 접속</span><b>${nf(d.live.peak)}</b><small>${esc(new Date(d.live.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))} · 기록은 11/15 밤 9시 25분부터</small></div>` : '';
  root.innerHTML = `${head}
<div class="td-body${state.loading ? ' busy' : ''}">
<p class="muted small">${esc(cutNote)} · Cloudflare 표본 추정값 · ${esc(new Date(d.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))} 기준</p>
<div class="td-cards">
<div class="td-card"><span>방문</span><b>${nf(v0)}</b><small>${d.isToday ? '같은 시각 어제' : '전날'} ${nf(v1)} (${pct(v0, v1)}) · 지난주 같은 요일 ${nf(v7)} (${pct(v0, v7)})</small></div>
<div class="td-card"><span>페이지뷰</span><b>${nf(p0)}</b><small>${d.isToday ? '같은 시각 어제' : '전날'} ${nf(p1)} (${pct(p0, p1)}) · 방문당 ${v0 ? (p0 / v0).toFixed(1) : '–'}쪽</small></div>
<div class="td-card"><span>한국 / 해외 방문</span><b>${nf(kr)} / ${nf(abroad)}</b><small>해외 ${v0 ? Math.round((abroad / (kr + abroad || 1)) * 100) : 0}%</small></div>
${live}

</div>
<div id="td-who">${whoHtml(d.live)}</div>
<section class="panel"><h2>시간대별 방문</h2>${hourChart(d)}</section>
<section class="panel"><h2>한국과 해외, 시간대별</h2>${koreaChart(d)}</section>
${weekChart(d, upto)}
<div class="td-grid2">
<section class="panel"><h2>나라별 방문</h2>${bars(d.countries.slice(0, 12), { label: (c) => esc(COUNTRY[c.country] || c.country), value: (c) => c.visits })}</section>
<section class="panel"><h2>들어온 경로</h2>${bars(d.sources.slice(0, 12), { label: (s) => esc(SOURCE[s.source] || s.source), value: (s) => s.visits, accent: true })}
<p class="muted small">앱(카톡·디스코드) 안에서 누른 링크와 아카라이브 링크는 출처가 남지 않아 '직접'으로 잡혀요.</p></section>
</div>
<div class="td-grid2">
<section class="panel"><h2>많이 본 페이지 <small class="muted">페이지뷰 · 언어 합산</small></h2>${bars(d.pages.slice(0, 15), { label: (p) => `${esc(pageName(p.page))}<small> ${Object.entries(p.langs).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${nf(n)}`).join(' · ')}</small>`, value: (p) => p.views })}</section>
<section class="panel"><h2>처음 들어온 페이지 <small class="muted">방문</small></h2>${bars(d.landings.slice(0, 15), { label: (p) => `${esc(pageName(p.path.replace(/^\/(ko|en|zh|ja)(?=\/)/, '')))}<small> ${esc((p.path.match(/^\/(ko|en|zh|ja)\//) || [, ''])[1])}</small>`, value: (p) => p.landings, accent: true })}</section>
</div>
<div class="td-grid2">
<section class="panel"><h2>기기</h2>${bars(d.devices, { label: (x) => esc({ desktop: 'PC', mobile: '모바일', tablet: '태블릿' }[x.device] || x.device), value: (x) => x.visits })}</section>
${botChart(d)}
</div>
<h2 class="td-part">요청 지키기</h2>
${outsidePanel(d)}
${blockedPanel(d)}
<h2 class="td-part">화면 읽는 도구</h2>
${toolPanel(d)}
</div>`;
  bind();
}

function bind() {
  root.querySelector('#td-reload')?.addEventListener('click', () => load());
  root.querySelector('#td-out')?.addEventListener('click', () => { store.set(''); state = { day: '', data: null }; render(); });
  root.querySelector('#td-day')?.addEventListener('change', (e) => { state.day = e.target.value; load(); });
}

async function load() {
  state.loading = true; state.error = ''; render();
  try {
    const r = await fetch(`${cfg.api}/internal/traffic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: store.get(), day: state.day || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403) { store.set(''); state.error = '키가 맞지 않아요.'; }
    else if (!r.ok) state.error = j.error === 'analytics token not set' ? '서버에 Cloudflare 통계 읽기 토큰이 아직 없어요.' : `불러오지 못했어요 (${j.error || r.status}).`;
    else {
      state.data = j;
      // Cloudflare sometimes answers from a rough sample; ask again quietly a little later (at most three times).
      if (j.coarse && (state.retries = (state.retries || 0) + 1) <= 3) setTimeout(load, 15000);
      else if (!j.coarse) state.retries = 0;
    }
  } catch (e) { state.error = '불러오지 못했어요.'; }
  state.loading = false; render();
}

// Who holds how many tabs right now (owner, 2026-11-18): one row per holder from the live room, refreshed every 15 seconds.
// A holder is one address + browser; "응답 중" are tabs whose page pinged within 150 seconds.
function whoHtml(live) {
  if (!live?.who?.length) return '';
  const rows = live.who.map((g) => ({ ...g, alive: (g.quietSec || []).filter((q) => q <= 150).length }));
  const known = rows.filter((g) => g.who !== 'before-log');
  const people = live.people ?? known.length, tabs = rows.reduce((a, g) => a + g.tabs, 0), aliveTabs = live.silent != null ? live.now - live.silent : rows.reduce((a, g) => a + g.alive, 0);
  const many = known.filter((g) => g.tabs >= 3);
  // Tabs by page language across everyone (tabs opened before the language was recorded are left out).
  const byLang = {};
  for (const g of rows) for (const m of Object.values(g.langs || {})) for (const [l, n] of Object.entries(m)) if (l) byLang[l] = (byLang[l] || 0) + n;
  const LANG_KO = { ko: '한국어', en: '영어', zh: '중국어', ja: '일본어' };
  const langSum = Object.entries(byLang).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${LANG_KO[l] || l} 페이지 <b>${nf(n)}</b>`).join(' · ');
  const tr = (g) => {
    // Each page carries the language it was opened in: "실시간 시세 ko ×2 · en".
    const langTags = (pg) => Object.entries(g.langs?.[pg] || {}).filter(([l]) => l).sort((a, b) => b[1] - a[1])
      .map(([l, n]) => `<span class="td-lang td-lang-${esc(l)}">${esc(l)}${n > 1 ? ` ×${n}` : ''}</span>`).join('');
    const pages = Object.entries(g.pages || {}).sort((a, b) => b[1] - a[1]).map(([pg, n]) => {
      const tags = langTags(pg);
      return `<span class="td-who-page">${esc(pageName(pg))}${tags ? ` ${tags}` : n > 1 ? ` ×${n}` : ''}</span>`;
    }).join(', ');
    const whoLabel = g.who === 'before-log' ? '기록 없는 연결 (서버 배포 전부터 열려 있던 탭)' : `${esc(COUNTRY[g.country] || g.country || '?')} · ${esc(g.org || '?')}`;
    return `<tr${g.tabs >= 5 ? ' class="td-who-many"' : ''}><td class="num"><b>${nf(g.tabs)}</b></td><td class="num">${nf(g.alive)}</td><td>${whoLabel}</td><td>${esc(g.ua || '')}</td><td>${pages}</td><td class="num">${g.oldestMin != null ? `${nf(g.oldestMin)}분` : ''}</td></tr>`;
  };
  return `<section class="panel td-who"><h2>지금 접속 중 <small class="muted">15초마다 새로 읽어요</small></h2>
<p class="td-who-sum">열린 탭 <b>${nf(live.now)}</b>개 · 사람 <b>${nf(people)}</b>명${people ? ` · 한 사람당 평균 <b>${((live.now - (rows.find((g) => g.who === 'before-log')?.tabs || 0)) / people).toFixed(1)}</b>개` : ''} · 지금 응답 중인 탭 <b>${nf(aliveTabs)}</b>개 · 응답 없는 연결 ${nf(live.silent || 0)}개${many.length ? ` · 3개 이상 연 사람 ${nf(many.length)}명 (합 ${nf(many.reduce((a, g) => a + g.tabs, 0))}개)` : ''}${langSum ? `<br>${langSum}` : ''}</p>
${live.pages?.length ? `<h3 class="td-sub">페이지별 탭</h3><ul class="td-chips">${live.pages.map(([pg, n]) => `<li><span>${esc(pageName(pg))}</span><b>${nf(n)}</b></li>`).join('')}</ul>` : ''}
<h3 class="td-sub">사람별 탭</h3>
${foldTable('<tr><th scope="col">탭</th><th scope="col">응답 중</th><th scope="col">어디서</th><th scope="col">브라우저</th><th scope="col">열어 둔 페이지</th><th scope="col">열린 지</th></tr>', rows.map(tr))}
<p class="muted small">같은 주소·같은 브라우저를 한 사람으로 묶었어요. 주소는 저장하지 않고 연결돼 있는 동안만 구분값으로 써요. 많이 연 순서로 40명까지 보여요.</p></section>`;
}
async function loadLive() {
  if (!store.get() || state.day || !state.data || document.visibilityState !== 'visible') return;
  try {
    const r = await fetch(`${cfg.api}/internal/traffic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: store.get(), live: true }) });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.live) return;
    state.data.live = j.live;
    const box = root.querySelector('#td-who');
    if (box) box.innerHTML = whoHtml(j.live);
    const n = root.querySelector('#td-live-now');
    if (n) n.textContent = nf(j.live.now);
  } catch (e) {}
}
setInterval(loadLive, 15000);

// One floating box for every [data-tip] (chart columns, day rows); follows the pointer, stays inside the window.
const tip = document.createElement('div');
tip.className = 'td-tip';
tip.hidden = true;
document.body.append(tip);
root.addEventListener('pointermove', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.getAttribute('data-tip');
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const x = Math.min(e.clientX + 14, innerWidth - r.width - 8), y = e.clientY + 16 + r.height > innerHeight ? e.clientY - r.height - 12 : e.clientY + 16;
  tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
});
root.addEventListener('pointerleave', () => { tip.hidden = true; });

render();
if (store.get()) load();
setInterval(() => { if (store.get() && !state.day && document.visibilityState === 'visible') load(); }, 5 * 60000);
