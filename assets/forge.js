// /tools/forge/: the scroll forge. Pick gear, drag (or tap) scrolls onto it, and the game's rules play out: the scroll's
// success rate decides, success adds its stats, every attempt uses one upgrade slot, a Chaos scroll that fails may
// destroy the item. The result is the show: a short charge, then a gold burst, a grey puff or the item shattering,
// drawn on a canvas over the anvil, with a small synthesized sound (can be muted).
const root = document.getElementById('fg-bench');
const cfg = JSON.parse(document.getElementById('fg-data').textContent);
const T = cfg.t;
const ko = cfg.lang === 'ko';
const $ = (id) => document.getElementById(id);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US');
const icon = (id) => `https://maplestory.io/api/MCW/1/item/${id}/icon`;
const money = (n) => (n == null ? T.noPrice : ko ? (n >= 1e8 ? `${(n / 1e8).toFixed(2).replace(/\.?0+$/, '')}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만` : nf.format(n)) : n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : nf.format(n));
const track = (name, p) => window.track?.(name, { page_type: 'forge', ...p });
const STAT_ORDER = ['STR', 'DEX', 'INT', 'LUK', 'MHP', 'MMP', 'PAD', 'MAD', 'PDD', 'MDD', 'ACC', 'EVA', 'Speed', 'Jump', 'CRT', 'CRD'];
const catKey = (c) => (c >= 130 ? 'weapon' : String(c));

let data, item = null, state = null, busy = false, cat = '', muted = false;
try { muted = localStorage.getItem('fg-mute') === '1'; } catch {}

// ---------- data ----------
// scrolls: [id, ko, en, short, cat, success, destroy, inc, price]; equips: [id, ko, en, cat, lv, slots, inc, ok, price]
const load = async () => {
  const d = await (await fetch(root.dataset.url)).json();
  data = {
    scrolls: d.scrolls.map(([id, k, e, short, c, success, destroy, inc, price]) => ({ id, name: ko ? short || k || e : e, full: ko ? k || e : e, cat: c, success, destroy, inc, price })),
    equips: d.equips.map(([id, k, e, c, lv, slots, inc, ok, price, req]) => ({ id, name: ko ? k || e : e, cat: c, lv, slots, inc, ok: !!ok, price, req: req || [0, 0, 0, 0] }))
  };
};

// ---------- gear shelf ----------
function renderCats() {
  const keys = ['', '100', '103', '104', '105', '106', '107', '108', '109', '110', 'weapon'];
  $('fg-cats').innerHTML = keys.map((k) => `<button type="button" class="fg-cat" data-cat="${k}" aria-pressed="${k === cat}">${esc(k ? T.cat[k] : T.all)}</button>`).join('');
}
function renderEquips() {
  const q = $('fg-q').value.trim().toLowerCase().replace(/\s+/g, '');
  const onlyOk = $('fg-ok').checked;
  const rows = data.equips.filter((e) => (!cat || catKey(e.cat) === cat) && (!onlyOk || e.ok) && (!q || e.name.toLowerCase().replace(/\s+/g, '').includes(q)))
    .sort((a, b) => a.lv - b.lv || a.name.localeCompare(b.name));
  const shown = rows.slice(0, 150);
  $('fg-equip-list').innerHTML = shown.map((e) => `<li><button type="button" class="fg-eq${item?.id === e.id ? ' on' : ''}" data-equip="${e.id}"><img src="${icon(e.id)}" alt="" width="32" height="32" loading="lazy"><span><b>${esc(e.name)}</b><small>Lv ${e.lv} · ${esc(T.slots)} ${e.slots}</small></span></button></li>`).join('')
    + (rows.length > shown.length ? `<li class="fg-more">${nf.format(rows.length)} · ${esc(T.more)}</li>` : '');
}

// ---------- anvil ----------
const statLines = () => STAT_ORDER.filter((k) => (item.inc[k] || 0) + (state.add[k] || 0)).map((k) => {
  const base = item.inc[k] || 0, add = state.add[k] || 0;
  return `<li><span>${esc(T.stat[k])}</span><b>+${base + add}</b>${add ? `<em>(${base} +${add})</em>` : ''}</li>`;
}).join('');
function renderAnvil() {
  if (!item) return;
  const done = state.destroyed;
  $('fg-anvil').classList.remove('is-idle');
  $('fg-anvil').innerHTML = `<div class="fg-win-title"><span class="fg-win-dot" aria-hidden="true"></span>${esc(T.winTitle)}<span class="fg-win-sub">${esc(item.name)}</span></div>
<div class="fg-stage${done ? ' is-broken' : ''}" id="fg-stage" data-drop>
<div class="fg-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
<svg class="fg-circle" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="78"/><path d="M100 12 L176 144 L24 144 Z"/><path d="M100 188 L24 56 L176 56 Z"/><circle cx="100" cy="100" r="40"/></svg>
<div class="fg-pedestal" aria-hidden="true"></div>
<canvas class="fg-fx" id="fg-fx" aria-hidden="true"></canvas>
<div class="fg-rays" aria-hidden="true"></div><div class="fg-glow" aria-hidden="true"></div>
<div class="fg-item" id="fg-item" tabindex="0" data-hover-tip><img src="${icon(item.id)}" alt="" width="64" height="64"></div>
<p class="fg-banner" id="fg-banner" aria-live="assertive"></p><p class="fg-gain" id="fg-gain" aria-hidden="true"></p>
<p class="fg-drop-hint">${esc(T.dropHere)}</p></div>
<div class="fg-tip" role="group" aria-label="${esc(item.name)}">
<h3>${esc(item.name)}${state.ups ? ` <span class="fg-plus">(+${state.ups})</span>` : ''}</h3>
<p class="fg-req">${esc(T.reqLv)} : ${item.lv}</p>
<ul class="fg-stats">${statLines() || '<li>—</li>'}</ul>
<p class="fg-slots">${esc(T.slots)} : <b>${done ? 0 : state.slots}</b></p>
${done ? `<p class="fg-dead">${esc(T.destroyed)}</p>` : ''}
</div>
<div class="fg-actions"><button type="button" class="btn ghost small-btn" data-reset>${esc(T.reset)}</button><button type="button" class="btn ghost small-btn" data-share>${esc(T.share)}</button><button type="button" class="btn ghost small-btn fg-mute" data-mute aria-pressed="${muted}">${muted ? '🔇' : '🔊'}</button></div>`;
  sizeFx();
}
function renderLog() {
  if (!item || !state.log.length) { $('fg-log').hidden = true; return; }
  const ok = state.log.filter((l) => l.r === 'ok').length;
  const priced = state.log.filter((l) => l.price != null);
  const cost = priced.reduce((s, l) => s + l.price, 0);
  $('fg-log').hidden = false;
  $('fg-log').innerHTML = `<h3>${esc(T.log)}</h3>
<p class="fg-sum"><span>${esc(T.used)} <b>${state.log.length}</b></span><span>${esc(T.rate)} <b>${ok}/${state.log.length}</b></span><span>${esc(T.cost)} <b>${priced.length ? `${money(cost)}${priced.length < state.log.length ? '+' : ''}` : T.noPrice}</b></span>${state.best ? `<span>${esc(T.best)} <b>+${state.best}</b></span>` : ''}</p>
<ol class="fg-entries">${state.log.slice().reverse().map((l) => `<li class="r-${l.r}"><img src="${icon(l.id)}" alt="" width="22" height="22"><span>${esc(l.name)}</span><b>${l.r === 'ok' ? `${esc(T.success)} ${Object.entries(l.inc).map(([k, v]) => `${T.stat[k]} +${v}`).join(', ')}` : l.r === 'boom' ? esc(T.destroyed) : esc(T.fail)}</b></li>`).join('')}</ol>`;
}

// ---------- scroll shelf ----------
function renderScrolls() {
  const el = $('fg-scroll-list');
  if (!item) { el.innerHTML = ''; return; }
  const PRI = ['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'Speed', 'Jump', 'MHP', 'MMP', 'PDD', 'MDD', 'CRT', 'CRD'];
  const pri = (x) => { const k = Object.keys(x.inc)[0]; const i = PRI.indexOf(k); return i < 0 ? 99 : i; };
  const list = data.scrolls.filter((s) => s.cat === item.cat).sort((a, b) => pri(a) - pri(b) || b.success - a.success || a.destroy - b.destroy);
  if (!list.length) { el.innerHTML = `<p class="fg-note">${esc(T.noScroll)}</p>`; return; }
  el.innerHTML = `<p class="fg-note">${esc(T.pickScroll)}</p><ul class="fg-scroll-ul">${list.map((s) => {
    const tier = s.destroy ? 'chaos' : String(s.success);
    return `<li class="fg-sc tier-${tier}" data-scroll="${s.id}" tabindex="0" aria-label="${esc(s.full)}">
<img src="${icon(s.id)}" alt="" width="32" height="32" draggable="false">
<span class="fg-sc-name"><b>${esc(s.name)}</b><small>${Object.entries(s.inc).map(([k, v]) => `${esc(T.stat[k])} +${v}`).join(' · ')}</small></span>
<span class="fg-sc-meta"><em class="fg-rate">${s.success}%</em>${s.destroy ? `<em class="fg-boom" title="${esc(T.destroyChance)}">${s.destroy}% ${esc(T.destroyWord)}</em>` : ''}<small>${money(s.price)}</small></span>
<span class="fg-sc-btns"><button type="button" class="btn small-btn" data-apply="${s.id}">${esc(T.apply)}</button><button type="button" class="btn ghost small-btn" data-auto="${s.id}" title="${esc(T.auto)}">${esc(T.autoShort)}</button></span></li>`;
  }).join('')}</ul>`;
}

// ---------- choosing gear ----------
function pickItem(id, fromUrl) {
  item = data.equips.find((e) => e.id === Number(id));
  if (!item) return;
  let best = 0;
  try { best = Number(localStorage.getItem(`fg-best-${item.id}`)) || 0; } catch {}
  state = { slots: item.slots, ups: 0, add: {}, destroyed: false, log: [], best };
  renderAnvil(); renderScrolls(); renderLog(); renderEquips();
  const u = new URL(location.href); u.searchParams.set('item', item.id); u.searchParams.delete('scroll'); history.replaceState(null, '', u);
  if (!fromUrl) track('forge_item', { item_id: String(item.id), ui_value: String(item.slots) });
  if (matchMedia('(max-width: 900px)').matches && !fromUrl) $('fg-anvil').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}

// ---------- the roll ----------
const wait = (ms) => new Promise((r) => setTimeout(r, calm ? Math.min(ms, 80) : ms));
async function apply(scrollId, auto = false, from = null) {
  if (!item || busy) return 'busy';
  const s = data.scrolls.find((x) => x.id === Number(scrollId));
  if (!s) return 'none';
  if (state.destroyed || state.slots <= 0) { banner(state.destroyed ? T.destroyed : T.noSlots, 'warn'); shake(); return 'stop'; }
  busy = true;
  root.classList.add('is-busy');
  // A beat of suspense: the scroll flies in and the anvil charges.
  await charge(s, auto, from || document.querySelector(`.fg-sc[data-scroll="${s.id}"] img`));
  const roll = Math.random() * 100;
  let r = roll < s.success ? 'ok' : 'fail';
  if (r === 'fail' && s.destroy && Math.random() * 100 < s.destroy) r = 'boom';
  state.slots -= 1;
  if (r === 'ok') { state.ups += 1; for (const [k, v] of Object.entries(s.inc)) state.add[k] = (state.add[k] || 0) + v; }
  if (r === 'boom') state.destroyed = true;
  state.log.push({ id: s.id, name: s.name, r, inc: s.inc, price: s.price });
  if (state.ups > state.best) { state.best = state.ups; try { localStorage.setItem(`fg-best-${item.id}`, String(state.best)); } catch {} }
  renderAnvil();
  play(r, s.success < 60);
  renderLog();
  track('forge_apply', { item_id: String(item.id), ui_label: String(s.id), ui_value: r, ui_area: auto ? 'auto' : 'single' });
  await wait(auto ? 650 : 900);
  busy = false;
  root.classList.remove('is-busy');
  return r;
}
async function autoApply(scrollId) {
  track('forge_auto', { item_id: String(item?.id), ui_label: String(scrollId) });
  while (item && !state.destroyed && state.slots > 0) {
    const r = await apply(scrollId, true);
    if (r === 'boom' || r === 'stop' || r === 'none') break;
  }
}

// ---------- effects ----------
let fx, ctx, parts = [], raf = 0;
function sizeFx() {
  fx = $('fg-fx'); if (!fx) return;
  const r = fx.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  fx.width = r.width * dpr; fx.height = r.height * dpr; ctx = fx.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function loop() {
  raf = 0; if (!ctx) return;
  const w = fx.width, h = fx.height;
  ctx.clearRect(0, 0, w, h);
  parts = parts.filter((p) => (p.life -= 1) > 0);
  for (const p of parts) {
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    const a = Math.min(1, p.life / p.fade);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    if (p.kind === 'star') { ctx.fillStyle = p.color; star(ctx, p.size); }
    else if (p.kind === 'smoke') { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size); g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(120,120,130,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill(); p.size *= 1.018; }
    else if (p.kind === 'ring') { ctx.strokeStyle = p.color; ctx.lineWidth = 3 * a; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.stroke(); p.size += p.grow; }
    else if (p.kind === 'shard') { ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(-p.size, -p.size / 2); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size / 3, p.size); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  if (parts.length) raf = requestAnimationFrame(loop);
}
function star(c, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.38 : r; const a = (i / 8) * Math.PI * 2; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); }
function burst(list) { if (calm || !ctx) return; parts.push(...list); if (!raf) raf = requestAnimationFrame(loop); }
const center = () => { const r = fx.getBoundingClientRect(); return [r.width / 2, r.height / 2 - 10]; };
const rand = (a, b) => a + Math.random() * (b - a);
function charge(s, auto, fromImg) {
  const stage = $('fg-stage');
  if (!stage) return wait(0);
  // The scroll flies from the shelf onto the item along a short arc.
  const target = $('fg-item')?.getBoundingClientRect();
  if (!calm && fromImg && target && fromImg.getBoundingClientRect().width) {
    const a = fromImg.getBoundingClientRect();
    const fly = fromImg.cloneNode(); fly.className = 'fg-fly'; document.body.appendChild(fly);
    const dx = target.left + target.width / 2 - (a.left + a.width / 2), dy = target.top + target.height / 2 - (a.top + a.height / 2);
    fly.style.left = `${a.left}px`; fly.style.top = `${a.top}px`;
    fly.animate([{ transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(1.6) rotate(-20deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.5) rotate(10deg)`, opacity: 0 }], { duration: auto ? 380 : 520, easing: 'cubic-bezier(.3,.7,.4,1)' }).finished.then(() => fly.remove(), () => fly.remove());
  }
  stage.classList.remove('fx-ok', 'fx-fail', 'fx-boom', 'fx-rare');
  stage.classList.add('fx-charge');
  const [x, y] = center();
  // Motes drawn in toward the item while it charges.
  for (let w = 0; w < (s.success < 60 && !auto ? 3 : 1); w++) setTimeout(() => burst(Array.from({ length: calm ? 0 : 26 }, () => { const a = rand(0, 7), d = rand(70, 130); return { kind: 'dot', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d / 26, vy: -Math.sin(a) * d / 26, g: 0, drag: 1, rot: 0, vr: 0, size: rand(1.5, 3), color: s.destroy ? '#ff8a6b' : '#ffe9a6', life: 26, fade: 10 }; })), w * 480);
  // The lower the odds, the longer the wait: 100% is quick, 60% takes a breath, 10% and Chaos get a heartbeat that
  // speeds up, the item trembling harder, then a moment of silence before the result.
  const dur = auto ? (s.success >= 100 ? 300 : 520) : s.success >= 100 ? 450 : s.success >= 60 ? 950 : 1700;
  stage.style.setProperty('--fg-charge', `${dur}ms`);
  stage.classList.toggle('fx-tense', s.success < 60 && !auto);
  sound('charge', dur, s.success < 60 && !auto);
  return wait(dur).then(() => { stage.classList.remove('fx-charge', 'fx-tense'); return wait(s.success < 60 && !auto ? 180 : 60); });
}

// The game's own scroll animation (Effect.wz BasicEff/Enchant: the scroll flares, a maple leaf rises, glitter falls),
// played frame by frame over the item. Sheets are aligned on the effect's origin (assets/fx).
const FXS = { 'scroll-success': { w: 164, h: 189, ax: 83, ay: 195, n: 21, d: 50 }, 'scroll-fail': { w: 109, h: 149, ax: 62, ay: 155, n: 16, d: 50 } };
function sprite(name) {
  const stage = $('fg-stage'), it = $('fg-item');
  if (!stage || !it || calm) return;
  const m = FXS[name], S = 1.35;
  const sr = stage.getBoundingClientRect(), ir = it.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fg-sprite';
  el.style.cssText = `width:${m.w}px;height:${m.h}px;background-image:url(${new URL(`./fx/${name}.png`, import.meta.url)});left:${ir.left - sr.left + ir.width / 2 - (m.w / 2) * S}px;top:${ir.top - sr.top + ir.height / 2 - (m.h / 2) * S}px;transform:scale(${S});transform-origin:0 0`;
  stage.appendChild(el);
  let f = 0;
  const step = () => { el.style.backgroundPosition = `${-f * m.w}px 0`; if (++f < m.n) setTimeout(step, m.d); else setTimeout(() => el.remove(), m.d); };
  step();
}

function play(r, rare = false) {
  const stage = $('fg-stage'); if (!stage) return;
  stage.classList.add(r === 'ok' ? 'fx-ok' : r === 'boom' ? 'fx-boom' : 'fx-fail');
  sizeFx();
  const [x, y] = center();
  if (r === 'ok') {
    banner(T.success, 'ok');
    const g = $('fg-gain'); const last = state.log[state.log.length - 1];
    if (g && last) { g.textContent = Object.entries(last.inc).map(([k, v]) => `${T.stat[k]} +${v}`).join('  '); g.className = 'fg-gain show'; }
    burst([
      { kind: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 1, rot: 0, vr: 0, size: 10, grow: 5.5, color: '#fff3c4', life: 30, fade: 30 },
      { kind: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 1, rot: 0, vr: 0, size: 4, grow: 3.4, color: '#ffc94d', life: 38, fade: 38 },
      ...Array.from({ length: 46 }, () => { const a = rand(0, 7), v = rand(2.5, 7.5); return { kind: Math.random() < 0.55 ? 'star' : 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.09, drag: 0.965, rot: rand(0, 6), vr: rand(-0.2, 0.2), size: rand(2.5, 6.5), color: ['#fff3c4', '#ffd75a', '#ffb93d', '#ffffff', '#9fe7ff'][Math.floor(rand(0, 5))], life: Math.floor(rand(40, 70)), fade: 22 }; }),
      ...Array.from({ length: rare ? 60 : 0 }, () => { const a = rand(0, 7), v = rand(5, 11); return { kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.12, drag: 0.96, rot: rand(0, 6), vr: rand(-0.3, 0.3), size: rand(4, 9), color: ['#ffffff', '#ffe27a', '#ff9de2', '#9fe7ff', '#b6ff9f'][Math.floor(rand(0, 5))], life: Math.floor(rand(60, 95)), fade: 30 }; }),
      ...Array.from({ length: 18 }, () => ({ kind: 'star', x: x + rand(-60, 60), y: y + rand(10, 50), vx: rand(-0.3, 0.3), vy: rand(-2.6, -1.2), g: -0.01, drag: 0.99, rot: 0, vr: 0.05, size: rand(2, 4), color: '#fff7d6', life: Math.floor(rand(50, 85)), fade: 30 }))
    ]);
  } else if (r === 'fail') {
    banner(T.fail, 'fail');
    burst(Array.from({ length: 22 }, () => ({ kind: 'smoke', x: x + rand(-18, 18), y: y + rand(-8, 14), vx: rand(-0.9, 0.9), vy: rand(-1.6, -0.4), g: -0.005, drag: 0.98, rot: 0, vr: 0, size: rand(10, 20), color: 'rgba(150,150,160,0.55)', life: Math.floor(rand(45, 70)), fade: 40 })));
  } else {
    banner(T.destroyed, 'boom');
    burst([
      { kind: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 1, rot: 0, vr: 0, size: 6, grow: 7, color: '#ff6b4a', life: 26, fade: 26 },
      ...Array.from({ length: 30 }, () => { const a = rand(0, 7), v = rand(3, 9); return { kind: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.28, drag: 0.98, rot: rand(0, 6), vr: rand(-0.4, 0.4), size: rand(4, 9), color: ['#6f6a75', '#9b95a0', '#c9c3cc', '#ff7a55'][Math.floor(rand(0, 4))], life: Math.floor(rand(45, 75)), fade: 25 }; }),
      ...Array.from({ length: 16 }, () => ({ kind: 'smoke', x: x + rand(-20, 20), y: y + rand(-10, 10), vx: rand(-1.2, 1.2), vy: rand(-1.2, -0.2), g: 0, drag: 0.97, rot: 0, vr: 0, size: rand(12, 24), color: 'rgba(60,40,40,0.6)', life: Math.floor(rand(50, 80)), fade: 40 }))
    ]);
  }
  sprite(r === 'ok' ? 'scroll-success' : 'scroll-fail');
  if (r === 'ok' && rare) stage.classList.add('fx-rare');
  sound(r === 'ok' && rare ? 'jackpot' : r);
}
function banner(text, kind) {
  const b = $('fg-banner'); if (!b) return;
  b.textContent = text; b.className = `fg-banner show ${kind}`;
  clearTimeout(banner.t); banner.t = setTimeout(() => { b.className = 'fg-banner'; }, 1400);
}
function shake() { const it = $('fg-item'); if (!it) return; it.classList.remove('shake'); void it.offsetWidth; it.classList.add('shake'); }

// Small synthesized sounds (no audio files): a rising hum for the charge, a bright chime for success, a dull thud for a
// failure, a crash for a destroyed item.
let actx;
// The game's own scroll sounds for the results (assets/sounds, from the client); the charge stays synthesized.
const SFX = { ok: 'scroll-success', jackpot: 'scroll-success', fail: 'scroll-fail', boom: 'scroll-boom' };
const sfx = {};
function loadSfx() {
  for (const name of new Set(Object.values(SFX))) {
    if (sfx[name]) continue;
    sfx[name] = fetch(new URL(`./sounds/${name}.mp3`, import.meta.url)).then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b)).catch(() => null);
  }
}
function playSfx(kind, vol = 0.9) {
  const p = sfx[SFX[kind]];
  if (!p) return false;
  p.then((buf) => { if (!buf || muted) return; const src = actx.createBufferSource(), g = actx.createGain(); g.gain.value = vol; src.buffer = buf; src.connect(g); g.connect(actx.destination); src.start(); });
  return true;
}
function sound(kind, dur = 600, tense = false) {
  if (muted) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    loadSfx();
    const t = actx.currentTime, out = actx.createGain(); out.gain.value = 0.16; out.connect(actx.destination);
    const tone = (f, start, dur, type = 'sine', vol = 1, f2) => {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + start);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + start + dur);
      g.gain.setValueAtTime(0.0001, t + start); g.gain.exponentialRampToValueAtTime(vol, t + start + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g); g.connect(out); o.start(t + start); o.stop(t + start + dur + 0.05);
    };
    const noise = (start, dur, vol, freq) => {
      const len = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(out); src.start(t + start);
    };
    if (kind === 'charge') {
      const d = dur / 1000;
      tone(180, 0, d, 'triangle', 0.3, tense ? 900 : 560);
      if (tense) {
        // Heartbeat: thumps that come faster toward the end.
        let at = 0.05, gap = 0.42;
        while (at < d - 0.05) { tone(70, at, 0.13, 'sine', 1.1, 45); tone(62, at + 0.14, 0.12, 'sine', 0.8, 40); at += gap; gap = Math.max(0.2, gap * 0.78); }
        noise(0, d, 0.12, 1800);
      }
    }
    else if (SFX[kind] && playSfx(kind)) { if (kind === 'jackpot') { [1568, 1976, 2349, 3136].forEach((f, i) => tone(f, 0.25 + i * 0.07, 0.8, 'sine', 0.35)); noise(0.2, 0.3, 0.2, 7000); } }
    else if (kind === 'jackpot') { [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone(f, i * 0.06, 0.6, 'triangle', 0.75)); [1568, 1976, 2349].forEach((f) => tone(f, 0.42, 1.1, 'sine', 0.4)); noise(0, 0.25, 0.25, 6000); }
    else if (kind === 'ok') { [880, 1175, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.5, 'triangle', 0.7)); tone(2637, 0.3, 0.7, 'sine', 0.35); noise(0, 0.15, 0.2, 7000); }
    else if (kind === 'fail') { tone(196, 0, 0.35, 'sawtooth', 0.25, 98); noise(0, 0.35, 0.5, 900); }
    else if (kind === 'boom') { noise(0, 0.7, 1.2, 2400); tone(110, 0, 0.6, 'square', 0.3, 40); }
  } catch {}
}


// ---------- hover tooltip, like the game's item tooltip ----------
// Name with (+N), required level and stats, every stat with what the scrolls added, upgrades left, passes and fails.
function tipHtml(e, st) {
  const add = st?.add || {}, ups = st?.ups || 0;
  const reqs = ['STR', 'DEX', 'INT', 'LUK'].map((k, i) => [k, e.req[i]]).filter(([, v]) => v);
  const lines = STAT_ORDER.filter((k) => (e.inc[k] || 0) + (add[k] || 0)).map((k) => {
    const b = e.inc[k] || 0, a = add[k] || 0;
    return `<li class="${a ? 'up' : ''}"><span>${esc(T.stat[k])}</span><b>+${b + a}</b>${a ? `<em>(${esc(T.base)} ${b} <i>+${a}</i>)</em>` : ''}</li>`;
  }).join('');
  const gains = Object.entries(add).filter(([, v]) => v);
  const tries = st ? st.log.length : 0;
  const passed = st ? st.log.filter((l) => l.r === 'ok').length : 0;
  return `<div class="fg-ht-head"><img src="${icon(e.id)}" alt="" width="44" height="44"><div><b class="${ups ? 'gold' : ''}">${esc(e.name)}${ups ? ` (+${ups})` : ''}</b><small>${esc(T.cat[catKey(e.cat)] || '')}</small></div></div>
<p class="fg-ht-req">${esc(T.reqLv)} : ${e.lv}${reqs.map(([k, v]) => ` · ${esc(T.reqStat)} ${k} ${v}`).join('')}</p>
<ul class="fg-ht-stats">${lines || '<li><span>—</span></li>'}</ul>
<p class="fg-ht-slots">${esc(T.slots)} : <b>${st ? (st.destroyed ? 0 : st.slots) : e.slots}</b></p>
${gains.length ? `<p class="fg-ht-gain">${esc(T.fromScrolls)}: ${gains.map(([k, v]) => `<b>${esc(T.stat[k])} +${v}</b>`).join(', ')}</p>` : ''}
${tries ? `<p class="fg-ht-try">${esc(T.tries.replace('{ok}', passed).replace('{fail}', tries - passed))}</p>` : ''}
${st?.destroyed ? `<p class="fg-ht-dead">${esc(T.destroyed)}</p>` : ''}`;
}
const hover = document.createElement('div');
hover.className = 'fg-hover'; hover.setAttribute('role', 'tooltip'); hover.hidden = true;
document.body.appendChild(hover);
function showTip(e, st, x, y) {
  hover.innerHTML = tipHtml(e, st); hover.hidden = false;
  const w = hover.offsetWidth, h = hover.offsetHeight;
  const left = Math.min(innerWidth - w - 8, x + 18), top = Math.min(innerHeight - h - 8, Math.max(8, y + 18));
  hover.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
}
const hideTip = () => { hover.hidden = true; };
root.addEventListener('pointermove', (ev) => {
  if (drag?.ghost || ev.pointerType === 'touch') return hideTip();
  const onItem = ev.target.closest('[data-hover-tip]');
  const onEquip = ev.target.closest('[data-equip]');
  if (onItem && item) showTip(item, state, ev.clientX, ev.clientY);
  else if (onEquip) { const e = data.equips.find((x) => x.id === Number(onEquip.dataset.equip)); if (e) showTip(e, item?.id === e.id ? state : null, ev.clientX, ev.clientY); }
  else hideTip();
});
root.addEventListener('pointerleave', hideTip);
root.addEventListener('focusin', (ev) => {
  const t = ev.target.closest?.('[data-hover-tip]');
  if (t && item) { const r = t.getBoundingClientRect(); showTip(item, state, r.right, r.top); }
});
root.addEventListener('focusout', hideTip);

// ---------- drag and drop (pointer events, so touch works too) ----------
let drag = null;
root.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.fg-sc');
  // Touch screens keep swiping for scrolling the shelf; there the Apply button does the job.
  if (!card || e.target.closest('button') || busy || e.pointerType === 'touch') return;
  const img = card.querySelector('img');
  drag = { id: card.dataset.scroll, x0: e.clientX, y0: e.clientY, ghost: null, card };
  card.setPointerCapture?.(e.pointerId);
  drag.make = () => {
    const g = img.cloneNode(); g.className = 'fg-ghost'; document.body.appendChild(g); drag.ghost = g;
    card.classList.add('dragging'); document.body.classList.add('fg-dragging');
  };
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.make();
  if (!drag.ghost) return;
  e.preventDefault();
  drag.ghost.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px) scale(1.4)`;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
  $('fg-stage')?.classList.toggle('drop-over', !!over);
}, { passive: false });
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  d.card.classList.remove('dragging'); document.body.classList.remove('fg-dragging');
  $('fg-stage')?.classList.remove('drop-over');
  if (!d.ghost) return;
  d.ghost.remove();
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
  if (over) apply(d.id);
});

// ---------- clicks, keys, filters ----------
root.addEventListener('click', (e) => {
  const eq = e.target.closest('[data-equip]'); if (eq) return pickItem(eq.dataset.equip);
  const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; renderCats(); renderEquips(); return; }
  const a = e.target.closest('[data-apply]'); if (a) return apply(a.dataset.apply);
  const au = e.target.closest('[data-auto]'); if (au) return autoApply(au.dataset.auto);
  if (e.target.closest('[data-reset]')) { track('forge_reset', { item_id: String(item.id) }); return pickItem(item.id, true); }
  if (e.target.closest('[data-mute]')) { muted = !muted; try { localStorage.setItem('fg-mute', muted ? '1' : '0'); } catch {} renderAnvil(); return; }
  const sh = e.target.closest('[data-share]');
  if (sh) {
    const u = new URL(location.href); u.searchParams.set('item', item.id);
    navigator.clipboard?.writeText(u.toString()).then(() => { sh.textContent = T.copied; setTimeout(() => (sh.textContent = T.share), 1500); }).catch(() => {});
    track('share_copy', { page_type: 'forge', item_id: String(item.id) });
  }
});
root.addEventListener('keydown', (e) => {
  const card = e.target.closest?.('.fg-sc');
  if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); apply(card.dataset.scroll); }
});
addEventListener('resize', () => sizeFx());

(async () => {
  try { await load(); } catch { $('fg-anvil').innerHTML = '<p class="fg-empty">⚠</p>'; return; }
  renderCats(); renderEquips();
  $('fg-q').addEventListener('input', renderEquips);
  $('fg-ok').addEventListener('change', renderEquips);
  const p = new URLSearchParams(location.search);
  const start = p.get('item');
  if (start && data.equips.some((e) => e.id === Number(start))) {
    const eq = data.equips.find((e) => e.id === Number(start));
    if (!eq.ok) $('fg-ok').checked = false;
    pickItem(start, true);
  }
})();
