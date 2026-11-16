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
  [/^\/megaphone\//, '실시간 확성기'], [/^\/tools\/exp\//, '경험치 측정기'], [/^\/tools\/damage\//, '몇 방 컷 계산기'], [/^\/tools\/forge\//, '주문서 작 시뮬'],
  [/^\/tools\/scroll\//, '주문서 계산기'], [/^\/tools\/scan\//, '상점 스캔'], [/^\/forgotten-hollow\//, '포가튼 할로우'], [/^\/report\//, '주간 리포트'],
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

// 24 columns: the chosen day (filled) against yesterday and last week (lines), same hours.
function hourChart(d) {
  const W = 720, H = 200, P = 26, bw = (W - P) / 24;
  const cut = d.cutHour;
  const day = d.hourly.day.map((r) => r[0]), y = d.hourly.yesterday.map((r) => r[0]), w = d.hourly.lastWeek.map((r) => r[0]);
  const max = Math.max(5, ...day, ...y, ...w);
  const ky = (v) => H - 18 - (v / max) * (H - 30);
  const line = (arr, cls) => `<polyline class="${cls}" points="${arr.map((v, i) => `${P + i * bw + bw / 2},${ky(v)}`).join(' ')}"/>`;
  const ticks = [0, Math.round(max / 2), max].map((v) => `<text x="0" y="${ky(v) + 4}" class="td-ax">${v}</text><line x1="${P}" x2="${W}" y1="${ky(v)}" y2="${ky(v)}" class="td-grid"/>`).join('');
  const cols = day.map((v, i) => `<rect x="${P + i * bw + 2}" y="${ky(v)}" width="${bw - 4}" height="${Math.max(0, H - 18 - ky(v))}" class="td-col${i === cut ? ' now' : ''}"><title>${i}시 · ${v}회 (어제 ${y[i]}, 지난주 ${w[i]})</title></rect>`).join('');
  const hours = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 3}" class="td-ax mid">${h}시</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="시간대별 방문">${ticks}${cols}${line(y, 'td-ly')}${line(w, 'td-lw')}${hours}</svg>
<p class="td-legend"><span class="k day"></span>${esc(d.day)} <span class="k y"></span>어제 ${esc(d.compare.yesterday.slice(5))} <span class="k w"></span>지난주 같은 요일 ${esc(d.compare.lastWeek.slice(5))}</p>`;
}

function koreaChart(d) {
  const W = 720, H = 150, P = 26, bw = (W - P) / 24;
  const rows = d.hourly.koreaAbroad, max = Math.max(5, ...rows.map(([a, b]) => a + b));
  const ky = (v) => (v / max) * (H - 26);
  return `<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="한국·해외 시간대별 방문">${rows.map(([k, a], i) => {
    const x = P + i * bw + 2, base = H - 18;
    return `<rect x="${x}" y="${base - ky(k)}" width="${bw - 4}" height="${ky(k)}" class="td-kr"><title>${i}시 · 한국 ${k} · 해외 ${a}</title></rect><rect x="${x}" y="${base - ky(k) - ky(a)}" width="${bw - 4}" height="${ky(a)}" class="td-ab"><title>${i}시 · 한국 ${k} · 해외 ${a}</title></rect>`;
  }).join('')}${[0, 6, 12, 18].map((h) => `<text x="${P + h * bw + bw / 2}" y="${H - 3}" class="td-ax mid">${h}시</text>`).join('')}</svg>
<p class="td-legend"><span class="k kr"></span>한국 <span class="k ab"></span>해외</p>`;
}

// The last 7 days against the 7 before them, day by day (same weekday side by side). Today is still running, so its
// last-week partner is cut at the same clock time.
function weekChart(d, upto) {
  const days = d.daily;
  if (days.length < 14) return '';
  const cur = days.slice(7), prev = days.slice(0, 7);
  const prevVal = (i) => (d.isToday && i === 6 ? upto(d.hourly.lastWeek) : prev[i].visits);
  const W = 720, H = 190, P = 26, bw = (W - P) / 7;
  const max = Math.max(5, ...cur.map((x) => x.visits), ...prev.map((x, i) => prevVal(i)));
  const ky = (v) => (v / max) * (H - 44);
  const base = H - 30;
  const wd = (day) => '일월화수목금토'[new Date(`${day}T00:00:00Z`).getUTCDay()];
  const cols = cur.map((x, i) => {
    const pv = prevVal(i), x0 = P + i * bw;
    const ch = pv ? Math.round((x.visits / pv - 1) * 100) : null;
    return `<rect x="${x0 + 6}" y="${base - ky(pv)}" width="${bw / 2 - 8}" height="${ky(pv)}" class="td-prev"><title>${prev[i].day} ${pv}회</title></rect>
<rect x="${x0 + bw / 2 + 2}" y="${base - ky(x.visits)}" width="${bw / 2 - 8}" height="${ky(x.visits)}" class="td-cur${d.isToday && i === 6 ? ' now' : ''}"><title>${x.day} ${x.visits}회</title></rect>
<text x="${x0 + bw / 2}" y="${base - Math.max(ky(pv), ky(x.visits)) - 6}" class="td-ax mid td-delta ${ch == null ? '' : ch >= 0 ? 'up' : 'down'}">${ch == null ? '' : `${ch >= 0 ? '+' : ''}${ch}%`}</text>
<text x="${x0 + bw / 2}" y="${H - 14}" class="td-ax mid">${x.day.slice(5).replace('-', '/')} ${wd(x.day)}</text>
<text x="${x0 + bw / 2}" y="${H - 2}" class="td-ax mid">${x.visits} / ${pv}</text>`;
  }).join('');
  const sc = cur.reduce((a, x) => a + x.visits, 0), sp = prev.reduce((a, x, i) => a + prevVal(i), 0);
  return `<section class="panel"><h2>이번 7일과 지난 7일 <small class="muted">요일별 방문 · 이번 ${nf(sc)} / 지난 ${nf(sp)} (${pct(sc, sp)})</small></h2>
<svg viewBox="0 0 ${W} ${H}" class="td-chart" role="img" aria-label="최근 7일과 그 전 7일 요일별 방문">${cols}</svg>
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
<button class="btn ghost small-btn" id="td-reload">${state.loading ? '불러오는 중…' : '새로고침'}</button><button class="btn ghost small-btn" id="td-out">키 지우기</button></div></div>`;
  if (state.error) { root.innerHTML = `${head}<p class="td-err">${esc(state.error)}</p>`; bind(); return; }
  if (!d) { root.innerHTML = `${head}<p class="muted">불러오는 중…</p>`; bind(); return; }
  // Yesterday and last week are whole days; cut them at today's clock time (the current hour by its elapsed minutes).
  const upto = (h, i = 0) => (d.isToday ? h.slice(0, d.cutHour).reduce((a, r) => a + r[i], 0) + Math.round((h[d.cutHour]?.[i] || 0) * (d.cutMinute / 60)) : sum(h, i));
  const v0 = sum(d.hourly.day), v1 = upto(d.hourly.yesterday), v7 = upto(d.hourly.lastWeek);
  const p0 = sum(d.hourly.day, 1), p1 = upto(d.hourly.yesterday, 1);
  const kr = d.countries.find((c) => c.country === 'KR')?.visits || 0, abroad = d.countries.reduce((a, c) => a + c.visits, 0) - kr;
  const cutNote = d.isToday ? `오늘 ${d.cutHour}시 ${d.cutMinute}분까지 · 어제·지난주도 같은 시각까지 잘라 비교` : '하루 전체';
  const live = d.live ? `<div class="td-card"><span>지금 열린 페이지</span><b>${nf(d.live.now)}</b><small>최고 ${nf(d.live.peak)} · ${esc(new Date(d.live.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></div>` : '';
  const dailyMax = Math.max(1, ...d.daily.map((x) => x.visits));
  root.innerHTML = `${head}
<p class="muted small">${esc(cutNote)} · Cloudflare 표본 추정값 · ${esc(new Date(d.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))} 기준</p>
<div class="td-cards">
<div class="td-card"><span>방문</span><b>${nf(v0)}</b><small>${d.isToday ? '같은 시각 어제' : '전날'} ${nf(v1)} (${pct(v0, v1)}) · 지난주 같은 요일 ${nf(v7)} (${pct(v0, v7)})</small></div>
<div class="td-card"><span>페이지뷰</span><b>${nf(p0)}</b><small>${d.isToday ? '같은 시각 어제' : '전날'} ${nf(p1)} (${pct(p0, p1)}) · 방문당 ${v0 ? (p0 / v0).toFixed(1) : '–'}쪽</small></div>
<div class="td-card"><span>한국 / 해외 방문</span><b>${nf(kr)} / ${nf(abroad)}</b><small>해외 ${v0 ? Math.round((abroad / (kr + abroad || 1)) * 100) : 0}%</small></div>
${live}
</div>
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
<section class="panel"><h2>최근 14일 방문</h2><ul class="td-bars">${d.daily.map((x) => `<li${x.day === d.day ? ' class="on"' : ''}><span class="td-bl">${esc(x.day.slice(5))} ${'일월화수목금토'[new Date(`${x.day}T00:00:00Z`).getUTCDay()]}</span><span class="td-bt"><i style="width:${(x.visits / dailyMax) * 100}%"></i></span><b>${nf(x.visits)}</b></li>`).join('')}</ul></section>
<section class="panel"><h2>기기</h2>${bars(d.devices, { label: (x) => esc({ desktop: 'PC', mobile: '모바일', tablet: '태블릿' }[x.device] || x.device), value: (x) => x.visits })}</section>
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
    else state.data = j;
  } catch (e) { state.error = '불러오지 못했어요.'; }
  state.loading = false; render();
}

render();
if (store.get()) load();
setInterval(() => { if (store.get() && !state.day && document.visibilityState === 'visible') load(); }, 5 * 60000);
