// Lab pages (unlisted, owner only; build.mjs "Lab"): three features benchmarked from other Classic World sites.
//  - quest-run: one-time quests you can do at your level, grouped by area, checked off in this browser
//  - meso-farm: monsters at your level ranked by what their drops sell for right now (no drop rates are claimed)
//  - market-pulse: biggest risers and fallers (sample-size guarded), most traded, and listings marked sold just now
const root = document.querySelector('.lab');
const ko = root?.dataset.lang === 'ko';
const tr = (k, e) => (ko ? k : e);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US');
const kmoney = (n) => (n == null ? '—' : ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf.format(n)) : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : nf.format(n));
const icon = (id, s = 28) => `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${s}" height="${s}" loading="lazy">`;
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const track = (n, p) => window.track?.(n, p);
const api = root?.dataset.api;
const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

let names = null;
async function itemNames() {
  if (names) return names;
  const rows = (await get('/assets/items.json')) || [];
  names = new Map((rows.items || rows).map((r) => (Array.isArray(r) ? [r[0], ko && r[1] ? r[1] : r[2]] : [r.id, ko && r.ko ? r.ko : r.en])));
  return names;
}
const pick = (pair) => (pair ? (ko && pair[0] ? pair[0] : pair[1]) : '');

function head(title, sub) {
  return `<p class="lab-crumb"><a href="${root.dataset.root}">${tr('실험실', 'Lab')}</a> · ${tr('아직 공개 전 기능이에요', 'Not public yet')}</p><h1>${esc(title)}</h1><p class="lab-sub">${sub}</p>`;
}

// ---------- index ----------
function viewIndex() {
  const cards = [
    ['quest-run/', tr('퀘스트 루트 체크리스트', 'Quest run checklist'), tr('내 레벨·직업으로 지금 할 수 있는 1회성 퀘스트를 지역별로 묶고, 끝낸 건 체크해 두는 목록. 남은 경험치 합계와 진행률을 보여 줘요.', 'One-time quests you can do now, grouped by area, with checkboxes, remaining EXP and progress.')],
    ['meso-farm/', tr('메소 벌이 사냥터', 'Meso farming spots'), tr('내 레벨 근처 몬스터를 지금 시세로 비싼 드롭이 있는 순서로 줄 세워요. 드롭 확률은 모르니 "무엇이 돈이 되나"만 보여 줘요.', 'Monsters near your level ranked by what their drops sell for now. Drop rates are not claimed.')],
    ['market-pulse/', tr('시세 맥박', 'Market pulse'), tr('하루 사이 많이 오르고 내린 아이템(매물 적은 건 제외), 많이 팔린 아이템, 방금 판매 완료된 매물을 한 화면에.', 'Biggest risers and fallers (thin items left out), most traded and just-sold listings on one screen.')]
  ];
  root.innerHTML = `${head(tr('실험실', 'Lab'), tr('다른 클래식 월드 사이트들을 보고 우리 사이트에 맞게 만든 기능이에요. 메뉴와 검색에는 아직 안 보여요.', 'Features adapted from other Classic World sites. Not in the menu or search yet.'))}<ul class="lab-cards">${cards.map(([p, t, d]) => `<li><a href="${root.dataset.root}${p}"><strong>${t}</strong><span>${d}</span></a></li>`).join('')}</ul>`;
}

// ---------- quest run ----------
const FAM = [['', tr('모든 직업', 'All classes')], ['1', tr('전사', 'Warrior')], ['2', tr('마법사', 'Magician')], ['3', tr('궁수', 'Bowman')], ['4', tr('도적', 'Thief')]];
const forClass = (jobs, fam) => !fam || !jobs.length || jobs.some((j) => j >= 100 && String(Math.floor(j / 100)) === fam);
async function viewQuests(data) {
  const done = new Set(store.get('gmshub_lab_quests_done', []));
  const state = store.get('gmshub_lab_quest_filter', { lv: 30, fam: '', low: false });
  const items = data.items;
  const mobs = new Map(data.mobs.map((m) => [m.id, m]));
  const byId = new Map(data.quests.map((q) => [q.id, q]));
  root.innerHTML = `${head(tr('퀘스트 루트 체크리스트', 'Quest run checklist'), tr('레벨과 직업을 고르면 지금 받을 수 있는 1회성 퀘스트를 지역별로 보여 줘요. 끝낸 퀘스트를 체크하면 이 브라우저에 저장돼요.', 'Pick your level and class to see the one-time quests you can take now, by area. Checks are saved in this browser.'))}
<div class="lab-controls"><label>${tr('레벨', 'Level')}<input id="lq-lv" type="number" min="1" max="200" value="${state.lv}"></label><label>${tr('직업', 'Class')}<select id="lq-fam">${FAM.map(([v, l]) => `<option value="${v}"${v === state.fam ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label class="lab-check"><input id="lq-low" type="checkbox"${state.low ? ' checked' : ''}>${tr('15레벨 아래 퀘스트도', 'Include quests 15+ levels below')}</label><label class="lab-check"><input id="lq-hide" type="checkbox" checked>${tr('끝낸 퀘스트 숨기기', 'Hide done')}</label></div>
<div id="lq-sum" class="lab-sum"></div><div id="lq-list"></div>`;
  const draw = () => {
    const lv = Math.max(1, Math.min(200, Number(document.getElementById('lq-lv').value) || 1)), fam = document.getElementById('lq-fam').value, low = document.getElementById('lq-low').checked, hide = document.getElementById('lq-hide').checked;
    store.set('gmshub_lab_quest_filter', { lv, fam, low });
    const pool = data.quests.filter((q) => q.lv <= lv && (low || q.lv >= lv - 15) && forClass(q.jobs, fam));
    const left = pool.filter((q) => !done.has(q.id));
    const expLeft = left.reduce((a, q) => a + q.exp, 0), mesoLeft = left.reduce((a, q) => a + q.meso, 0);
    document.getElementById('lq-sum').innerHTML = `<div><b>${pool.length - left.length}</b> / ${pool.length}<small>${tr('끝낸 퀘스트', 'done')}</small></div><div><b>${nf.format(expLeft)}</b><small>${tr('남은 경험치', 'EXP left')}</small></div><div><b>${kmoney(mesoLeft)}</b><small>${tr('남은 메소 보상', 'Mesos left')}</small></div><span class="lab-bar"><i style="width:${pool.length ? Math.round(100 * (pool.length - left.length) / pool.length) : 0}%"></i></span>`;
    const show = hide ? left : pool;
    const areas = new Map();
    for (const q of show.sort((a, b) => b.exp - a.exp)) { const a = ko && q.areaKo ? q.areaKo : q.area; (areas.get(a) || areas.set(a, []).get(a)).push(q); }
    const line = (q) => {
      const lock = q.prereq.filter((id) => byId.has(id) && !done.has(id));
      const hunt = q.hunt.map(([id, n]) => { const m = mobs.get(id); return `<span>${esc(m ? (ko && m.ko ? m.ko : m.en) : `#${id}`)} ×${n}</span>`; }).join('');
      const bring = q.bring.map(([id, n]) => `<span>${icon(id, 18)}${esc(pick(items[id]) || `#${id}`)} ×${n}</span>`).join('');
      const gets = q.gets.map(([id, n]) => `<span>${icon(id, 18)}${esc(pick(items[id]) || `#${id}`)}${n > 1 ? ` ×${n}` : ''}</span>`).join('');
      return `<li class="${done.has(q.id) ? 'is-done' : ''}${lock.length ? ' is-locked' : ''}"><label class="lab-q"><input type="checkbox" data-q="${q.id}"${done.has(q.id) ? ' checked' : ''}><span class="lab-q-name">${q.guide ? `<a href="${root.dataset.root.replace(/lab\/$/, '')}${q.guide.replace(/^\//, '')}">${esc(q.name)}</a>` : esc(q.name)}<small>Lv. ${q.lv || 1}</small></span><span class="lab-q-rew">${q.exp ? `<b>${nf.format(q.exp)}</b> EXP` : ''}${q.meso ? ` · ${kmoney(q.meso)}${tr('메소', ' mesos')}` : ''}</span></label>${lock.length ? `<p class="lab-q-lock">${tr('먼저', 'First')}: ${lock.map((id) => esc(byId.get(id).name)).join(', ')}</p>` : ''}${hunt ? `<p class="lab-q-row"><em>${tr('사냥', 'Hunt')}</em>${hunt}</p>` : ''}${bring ? `<p class="lab-q-row"><em>${tr('모으기', 'Bring')}</em>${bring}</p>` : ''}${gets ? `<p class="lab-q-row"><em>${tr('보상', 'Reward')}</em>${gets}</p>` : ''}</li>`;
    };
    document.getElementById('lq-list').innerHTML = show.length ? [...areas].map(([a, qs]) => `<section class="lab-area"><h2>${esc(a)} <small>${qs.length}${tr('개', '')} · ${nf.format(qs.reduce((x, q) => x + (done.has(q.id) ? 0 : q.exp), 0))} EXP</small></h2><ul class="lab-qs">${qs.map(line).join('')}</ul></section>`).join('') : `<p class="muted">${tr('조건에 맞는 퀘스트가 없어요. 레벨을 바꾸거나 낮은 레벨 퀘스트도 켜 보세요.', 'No quests match. Change the level or include lower ones.')}</p>`;
  };
  root.addEventListener('change', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) {
      const id = Number(q.dataset.q);
      q.checked ? done.add(id) : done.delete(id);
      store.set('gmshub_lab_quests_done', [...done]);
      track('lab_quest_check', { quest_id: id, done: q.checked });
    }
    draw();
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'lq-lv') draw(); });
  draw();
}

// ---------- meso farm ----------
async function viewFarm(data) {
  const cat = await get(`${api}/market/catalog`);
  const price = new Map((cat?.items || []).map((r) => [r.item, { p: r.soldMedian || r.typical || r.median, sold: r.sold || 0, open: r.open || 0 }]));
  const state = store.get('gmshub_lab_farm', { lv: 40, boss: false });
  root.innerHTML = `${head(tr('메소 벌이 사냥터', 'Meso farming spots'), tr('내 레벨 근처 몬스터를 지금 시세로 비싼 드롭이 있는 순서로 보여 줘요. 드롭 확률은 알 수 없어서 "무엇이 떨어지면 돈이 되나"만 알려 줘요. 시세는 최근 판매 완료 가격(없으면 보통 가격)이에요.', 'Monsters near your level ranked by what their drops sell for now. Drop rates are unknown, so this shows what is worth money if it drops. Prices are recent sold prices (else the typical asking price).'))}
<div class="lab-controls"><label>${tr('레벨', 'Level')}<input id="lf-lv" type="number" min="1" max="200" value="${state.lv}"></label><label class="lab-check"><input id="lf-boss" type="checkbox"${state.boss ? ' checked' : ''}>${tr('보스 포함', 'Include bosses')}</label></div><div id="lf-list"></div>`;
  const draw = () => {
    const lv = Number(document.getElementById('lf-lv').value) || 1, boss = document.getElementById('lf-boss').checked;
    store.set('gmshub_lab_farm', { lv, boss });
    const rows = data.mobs.filter((m) => m.lv >= lv - 10 && m.lv <= lv + 10 && (boss || !m.boss)).map((m) => {
      const drops = [...new Set(m.drops)].map((id) => ({ id, ...(price.get(id) || {}) })).filter((d) => d.p >= 1000 && (d.sold >= 3 || d.open >= 5)).sort((a, b) => b.p - a.p);
      return { m, drops, score: drops.slice(0, 3).reduce((a, d) => a + d.p, 0) };
    }).filter((r) => r.drops.length).sort((a, b) => b.score - a.score).slice(0, 30);
    document.getElementById('lf-list').innerHTML = rows.length ? `<ol class="lab-farm">${rows.map(({ m, drops }, i) => `<li><span class="lab-rank">${i + 1}</span><div class="lab-farm-mob"><a href="${root.dataset.mobs}${m.id}/"><strong>${esc(ko && m.ko ? m.ko : m.en)}</strong></a><small>Lv. ${m.lv} · HP ${nf.format(m.hp)} · EXP ${nf.format(m.exp)}</small>${m.maps.length ? `<small class="lab-maps">${m.maps.map((x) => esc(pick(x))).join(' · ')}</small>` : ''}</div><ul class="lab-drops">${drops.slice(0, 5).map((d) => `<li><a href="${root.dataset.market}?item=${d.id}">${icon(d.id, 24)}<span>${esc(pick(data.items[d.id]) || `#${d.id}`)}</span><b>${kmoney(d.p)}</b></a></li>`).join('')}${drops.length > 5 ? `<li class="lab-more">+${drops.length - 5}</li>` : ''}</ul></li>`).join('')}</ol>` : `<p class="muted">${tr('이 레벨 근처에 시세가 있는 드롭을 가진 몬스터가 없어요.', 'No monsters near this level drop anything with a price yet.')}</p>`;
  };
  root.addEventListener('input', draw);
  root.addEventListener('change', draw);
  draw();
  track('lab_open', { lab: 'meso-farm' });
}

// ---------- market pulse ----------
async function viewPulse() {
  root.innerHTML = `${head(tr('시세 맥박', 'Market pulse'), tr('하루 사이 많이 오르고 내린 아이템, 많이 팔린 아이템, 방금 판매 완료된 매물을 한 화면에 모았어요. 매물이 10건 안 되는 아이템은 값이 튀기 쉬워서 오르내림에서 뺐어요. 1분마다 새로 고쳐요.', 'Biggest movers of the day, most traded items and listings just marked sold. Items with under 10 open listings are left out of the movers. Refreshes every minute.'))}<div class="lab-pulse"><section><h2>${tr('오른 아이템', 'Rising')}</h2><ol id="lp-up" class="lab-list"></ol></section><section><h2>${tr('내린 아이템', 'Falling')}</h2><ol id="lp-down" class="lab-list"></ol></section><section><h2>${tr('많이 팔린 아이템 (7일)', 'Most sold (7 days)')}</h2><ol id="lp-sold" class="lab-list"></ol></section><section><h2>${tr('방금 팔린 매물', 'Just sold')}</h2><ol id="lp-feed" class="lab-list lab-feed"></ol></section></div>`;
  const draw = async () => {
    const [cat, sold, nm] = await Promise.all([get(`${api}/market/catalog`), get(`${api}/market/listings?state=sold&sort=recent&limit=25&days=1`), itemNames()]);
    const n = (id) => esc(nm.get(id) || `#${id}`);
    const rows = (cat?.items || []).filter((r) => r.typicalDay != null && r.open >= 10 && Math.abs(r.typicalDay) <= 300);
    const mv = (r) => `<li><a href="${root.dataset.market}?item=${r.item}">${icon(r.item, 24)}<span>${n(r.item)}</span><b class="${r.typicalDay > 0 ? 'up' : 'down'}">${r.typicalDay > 0 ? '▲ +' : '▼ '}${r.typicalDay}%</b><small>${kmoney(r.typical)} · ${tr(`매물 ${r.open}`, `${r.open} open`)}</small></a></li>`;
    document.getElementById('lp-up').innerHTML = rows.filter((r) => r.typicalDay > 0).sort((a, b) => b.typicalDay - a.typicalDay).slice(0, 10).map(mv).join('') || `<li class="muted">—</li>`;
    document.getElementById('lp-down').innerHTML = rows.filter((r) => r.typicalDay < 0).sort((a, b) => a.typicalDay - b.typicalDay).slice(0, 10).map(mv).join('') || `<li class="muted">—</li>`;
    document.getElementById('lp-sold').innerHTML = (cat?.items || []).filter((r) => r.sold).sort((a, b) => b.sold - a.sold).slice(0, 10).map((r) => `<li><a href="${root.dataset.market}?item=${r.item}">${icon(r.item, 24)}<span>${n(r.item)}</span><b>${tr(`${nf.format(r.sold)}건`, nf.format(r.sold))}</b><small>${kmoney(r.soldMedian || r.typical)}</small></a></li>`).join('');
    const ago = (s) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(`${String(s).replace(' ', 'T')}Z`)) / 60000)); return m < 60 ? tr(`${m}분 전`, `${m}m ago`) : tr(`${Math.round(m / 60)}시간 전`, `${Math.round(m / 60)}h ago`); };
    document.getElementById('lp-feed').innerHTML = (sold?.rows || []).map((r) => `<li><a href="${root.dataset.market}?item=${r.item}">${icon(r.item, 24)}<span>${n(r.item)}</span><b>${kmoney(r.price)}</b><small>CH ${r.channel} · ${ago(r.seen)}</small></a></li>`).join('') || `<li class="muted">—</li>`;
  };
  await draw();
  setInterval(() => !document.hidden && draw(), 60000);
  track('lab_open', { lab: 'market-pulse' });
}

(async () => {
  if (!root) return;
  const view = root.dataset.lab;
  if (view === 'index') return viewIndex();
  if (view === 'market-pulse') return viewPulse();
  const data = await get(root.dataset.data);
  if (!data) { root.innerHTML = `<p class="muted">${tr('데이터를 불러오지 못했어요.', 'Could not load the data.')}</p>`; return; }
  if (view === 'quest-run') { track('lab_open', { lab: 'quest-run' }); return viewQuests(data); }
  if (view === 'meso-farm') return viewFarm(data);
})();
