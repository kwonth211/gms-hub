// Meso farming spots (/tools/meso-farm/) and the market pulse (/tools/market/pulse/), benchmarked from other Classic
// World sites (build.mjs "Meso farming spots and the market pulse").
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

function head() {
  return `<h1>${esc(root.dataset.h1)}</h1><p class="lab-sub">${esc(root.dataset.lead)}</p>`;
}

// ---------- meso farm ----------
const sprite = (id) => `${document.body.dataset.sprites || '/assets/monsters/'}${id}.gif`;
async function viewFarm(data) {
  const cat = await get(`${api}/market/catalog`);
  const price = new Map((cat?.items || []).map((r) => [r.item, { p: r.soldMedian || r.typical || r.median, sold: r.sold || 0, open: r.open || 0 }]));
  const state = store.get('gmshub_lab_farm', { lv: 40, boss: false });
  root.innerHTML = `${head()}
<div class="lab-controls"><label>${tr('레벨', 'Level')}<input id="lf-lv" type="number" min="1" max="200" value="${state.lv}"></label><label class="lab-check"><input id="lf-boss" type="checkbox"${state.boss ? ' checked' : ''}>${tr('보스 포함', 'Include bosses')}</label></div><ul id="lf-list" class="lab-farm"></ul>`;
  const draw = () => {
    const lv = Number(document.getElementById('lf-lv').value) || 1, boss = document.getElementById('lf-boss').checked;
    store.set('gmshub_lab_farm', { lv, boss });
    const rows = data.mobs.filter((m) => m.lv >= lv - 10 && m.lv <= lv + 10 && (boss || !m.boss)).map((m) => {
      const drops = [...new Set(m.drops)].map((id) => ({ id, ...(price.get(id) || {}) })).filter((d) => d.p >= 1000 && (d.sold >= 3 || d.open >= 5)).sort((a, b) => b.p - a.p);
      return { m, drops, score: drops.slice(0, 3).reduce((a, d) => a + d.p, 0) };
    }).filter((r) => r.drops.length).sort((a, b) => b.score - a.score).slice(0, 30);
    document.getElementById('lf-list').innerHTML = rows.length ? rows.map(({ m, drops }) => `<li><a class="lab-farm-pic" href="${root.dataset.mobs}${m.id}/"><img src="${sprite(m.id)}" alt="" loading="lazy"></a><div class="lab-farm-mob"><a href="${root.dataset.mobs}${m.id}/"><strong>${esc(ko && m.ko ? m.ko : m.en)}</strong></a><small>Lv. ${m.lv} · HP ${nf.format(m.hp)} · EXP ${nf.format(m.exp)}</small>${m.maps.length ? `<small class="lab-maps">${m.maps.map((x) => esc(pick(x))).join(' · ')}</small>` : ''}</div><ul class="lab-drops">${drops.slice(0, 5).map((d) => `<li><a href="${root.dataset.market}?item=${d.id}">${icon(d.id, 24)}<span>${esc(pick(data.items[d.id]) || `#${d.id}`)}</span><b>${tr(`개당 ${kmoney(d.p)} 메소`, `${kmoney(d.p)} mesos each`)}</b></a></li>`).join('')}${drops.length > 5 ? `<li class="lab-more">+${drops.length - 5}</li>` : ''}</ul></li>`).join('') : `<li class="muted">${tr('이 레벨 근처에 시세가 있는 드롭을 가진 몬스터가 없어요.', 'No monsters near this level drop anything with a price yet.')}</li>`;
  };
  root.addEventListener('input', draw);
  root.addEventListener('change', draw);
  draw();
  track('lab_open', { lab: 'meso-farm' });
}

// ---------- market pulse ----------
// A live board: headline tiles (biggest riser, faller, best seller), movers with bars sized by the move, and a just-sold
// feed where new sales slide in. Refreshes every 60 s with a visible countdown; times tick every second.
async function viewPulse() {
  root.innerHTML = `${head()}
<div class="lp-live"><span class="lp-dot" aria-hidden="true"></span><b>${tr('실시간', 'Live')}</b><span id="lp-next"></span><span class="lp-timer"><i id="lp-bar"></i></span></div>
<div class="lp-tiles" id="lp-tiles"></div>
<div class="lp-grid"><section class="lp-card"><h2>${tr('오른 아이템', 'Rising')}</h2><ol id="lp-up" class="lp-movers"></ol></section><section class="lp-card"><h2>${tr('내린 아이템', 'Falling')}</h2><ol id="lp-down" class="lp-movers"></ol></section><section class="lp-card"><h2>${tr('많이 팔린 아이템', 'Best sellers')} <small>${tr('7일', '7 days')}</small></h2><ol id="lp-sold" class="lp-movers"></ol></section><section class="lp-card"><h2>${tr('방금 팔린 매물', 'Just sold')}</h2><ol id="lp-feed" class="lp-feed"></ol></section></div>`;
  let nm, seenSold = new Set(), first = true, nextAt = 0;
  const ago = (s) => { const sec = Math.max(0, Math.round((Date.now() - Date.parse(`${String(s).replace(' ', 'T')}Z`)) / 1000)); return sec < 60 ? tr(`${sec}초 전`, `${sec}s ago`) : sec < 3600 ? tr(`${Math.floor(sec / 60)}분 전`, `${Math.floor(sec / 60)}m ago`) : tr(`${Math.floor(sec / 3600)}시간 전`, `${Math.floor(sec / 3600)}h ago`); };
  const n = (id) => esc(nm.get(id) || `#${id}`);
  const countUp = (el) => {
    const to = Number(el.dataset.to), pre = el.dataset.pre || '', suf = el.dataset.suf || '';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = pre + nf.format(to) + suf; return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 700), v = Math.round(to * (1 - Math.pow(1 - k, 3))); el.textContent = pre + nf.format(v) + suf; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const draw = async () => {
    const [cat, sold, names] = await Promise.all([get(`${api}/market/catalog`), get(`${api}/market/listings?state=sold&sort=recent&limit=20&days=1`), itemNames()]);
    nm = names;
    const items = cat?.items || [];
    const rows = items.filter((r) => r.typicalDay != null && r.open >= 10 && Math.abs(r.typicalDay) <= 300);
    const up = rows.filter((r) => r.typicalDay > 0).sort((a, b) => b.typicalDay - a.typicalDay).slice(0, 8);
    const down = rows.filter((r) => r.typicalDay < 0).sort((a, b) => a.typicalDay - b.typicalDay).slice(0, 8);
    const best = items.filter((r) => r.sold).sort((a, b) => b.sold - a.sold).slice(0, 8);
    const tile = (cls, label, r, val, valAttrs, sub) => r ? `<a class="lp-tile ${cls}" href="${root.dataset.market}?item=${r.item}"><span class="lp-tile-label">${label}</span><span class="lp-tile-item">${icon(r.item, 40)}<strong>${n(r.item)}</strong></span><b class="lp-tile-val" ${valAttrs}>${val}</b><small>${sub}</small></a>` : '';
    if (first || true) document.getElementById('lp-tiles').innerHTML =
      tile('up', tr('오늘 가장 오른', 'Top riser'), up[0], `+${up[0]?.typicalDay}%`, `data-to="${up[0]?.typicalDay}" data-pre="+" data-suf="%"`, up[0] ? tr(`보통 ${kmoney(up[0].typical)} 메소`, `typical ${kmoney(up[0].typical)}`) : '') +
      tile('down', tr('오늘 가장 내린', 'Top faller'), down[0], `${down[0]?.typicalDay}%`, `data-to="${Math.abs(down[0]?.typicalDay)}" data-pre="−" data-suf="%"`, down[0] ? tr(`보통 ${kmoney(down[0].typical)} 메소`, `typical ${kmoney(down[0].typical)}`) : '') +
      tile('best', tr('가장 많이 팔린', 'Best seller'), best[0], `${best[0]?.sold}`, `data-to="${best[0]?.sold}" data-suf="${tr('건', '')}"`, best[0] ? tr(`개당 ${kmoney(best[0].soldMedian || best[0].typical)} 메소 · 7일`, `${kmoney(best[0].soldMedian || best[0].typical)} each · 7d`) : '');
    root.querySelectorAll('.lp-tile-val').forEach(countUp);
    const maxUp = Math.max(1, ...up.map((r) => r.typicalDay)), maxDown = Math.max(1, ...down.map((r) => -r.typicalDay)), maxSold = Math.max(1, ...best.map((r) => r.sold));
    const mover = (r, pct, cls, val, sub) => `<li><a href="${root.dataset.market}?item=${r.item}">${icon(r.item, 28)}<span class="lp-name">${n(r.item)}<small>${sub}</small></span><b class="${cls}">${val}</b><span class="lp-track"><i class="${cls}" style="--w:${pct}%"></i></span></a></li>`;
    document.getElementById('lp-up').innerHTML = up.map((r) => mover(r, (r.typicalDay / maxUp) * 100, 'up', `▲ ${r.typicalDay}%`, tr(`${kmoney(r.typical)} 메소 · 매물 ${r.open}`, `${kmoney(r.typical)} · ${r.open} open`))).join('') || '<li class="muted">—</li>';
    document.getElementById('lp-down').innerHTML = down.map((r) => mover(r, (-r.typicalDay / maxDown) * 100, 'down', `▼ ${-r.typicalDay}%`, tr(`${kmoney(r.typical)} 메소 · 매물 ${r.open}`, `${kmoney(r.typical)} · ${r.open} open`))).join('') || '<li class="muted">—</li>';
    document.getElementById('lp-sold').innerHTML = best.map((r) => mover(r, (r.sold / maxSold) * 100, 'best', tr(`${nf.format(r.sold)}건`, nf.format(r.sold)), tr(`개당 ${kmoney(r.soldMedian || r.typical)} 메소`, `${kmoney(r.soldMedian || r.typical)} each`))).join('');
    const feed = document.getElementById('lp-feed');
    const fresh = (sold?.rows || []).filter((r) => !seenSold.has(r.id));
    const li = (r, isNew) => `<li class="${isNew ? 'is-new' : ''}"><a href="${root.dataset.market}?item=${r.item}">${icon(r.item, 28)}<span class="lp-name">${n(r.item)}<small>CH ${r.channel} · <time data-seen="${esc(r.seen)}">${ago(r.seen)}</time></small></span><b>${tr(`${kmoney(r.price)} 메소`, kmoney(r.price))}</b></a></li>`;
    if (first) feed.innerHTML = (sold?.rows || []).map((r) => li(r, false)).join('') || '<li class="muted">—</li>';
    else if (fresh.length) { feed.insertAdjacentHTML('afterbegin', fresh.map((r) => li(r, true)).join('')); while (feed.children.length > 20) feed.lastElementChild.remove(); }
    for (const r of sold?.rows || []) seenSold.add(r.id);
    first = false;
    nextAt = Date.now() + 60000;
  };
  await draw();
  setInterval(() => {
    const left = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
    document.getElementById('lp-next').textContent = tr(`${left}초 뒤 새로고침`, `refresh in ${left}s`);
    document.getElementById('lp-bar').style.width = `${100 - (left / 60) * 100}%`;
    document.querySelectorAll('#lp-feed time[data-seen]').forEach((t) => (t.textContent = ago(t.dataset.seen)));
    if (left === 0 && !document.hidden) draw();
  }, 1000);
  track('lab_open', { lab: 'market-pulse' });
}

(async () => {
  if (!root) return;
  const view = root.dataset.lab;
    if (view === 'market-pulse') return viewPulse();
  const data = await get(root.dataset.data);
  if (!data) { root.innerHTML = `<p class="muted">${tr('데이터를 불러오지 못했어요.', 'Could not load the data.')}</p>`; return; }
  if (view === 'meso-farm') return viewFarm(data);
})();
