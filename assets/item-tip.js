// Hover cards: point at any item (a link to its page, a market row, a drop list entry, an icon) or any monster (a link to
// its page, its sprite) and a card shows what it is. Items: effect, stats, live price, where it comes from; monsters:
// level, HP, EXP, elements, accuracy, where it spawns and what it drops. Pointer devices only; the data file loads on the
// first hover and live prices are fetched per item.
const tx = globalThis.tx || ((s) => s);
const lang = document.documentElement.lang;
const ko = lang === 'ko';
const tr = (k, e) => (ko ? k : tx(e));
const body = document.body;

if (matchMedia('(hover: hover) and (pointer: fine)').matches && body.dataset.tips) {
  let data = null;
  let loading = null;
  const prices = new Map();
  const card = document.createElement('div');
  card.className = 'item-tip';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  document.body.append(card);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nf = new Intl.NumberFormat(lang === 'ko' ? 'ko' : 'en-US');
  const load = () => (loading ||= fetch(body.dataset.tips).then((r) => r.json()).then((d) => (data = d)).catch(() => null));

  const INC = {
    PAD: tr('공격력', 'Weapon attack'), MAD: tr('마력', 'Magic attack'), STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK',
    MHP: 'HP', MMP: 'MP', PDD: tr('물리 방어력', 'Weapon defense'), MDD: tr('마법 방어력', 'Magic defense'),
    ACC: tr('명중률', 'Accuracy'), EVA: tr('회피율', 'Avoidability'), Speed: tr('이동속도', 'Speed'), Jump: tr('점프력', 'Jump')
  };
  const JOBS = [[1, tr('전사', 'Warrior')], [2, tr('마법사', 'Magician')], [4, tr('궁수', 'Bowman')], [8, tr('도적', 'Thief')]];
  const CAT = { Equip: tr('장비', 'Equipment'), Use: tr('소비', 'Use'), Etc: tr('기타', 'Etc'), Setup: tr('설치', 'Setup') };

  // What does this element stand for? Monsters first (a link to a monster page, a monster sprite), then items (a data
  // attribute, a link to an item page or market entry, an item icon). The monster page's own wrapper is not a target.
  function targetOf(el) {
    const a = el.closest('a[href]');
    const href = a?.getAttribute('href') || '';
    const mob = href.match(/\/monsters\/(\d+)\/(?:[?#]|$)/) || (el.matches('img') ? (el.getAttribute('src') || '').match(/\/assets\/monsters\/(\d+)\.gif/) : null);
    if (mob) return { kind: 'mob', id: Number(mob[1]) };
    const tagged = el.closest('[data-item-id], [data-item]');
    if (tagged) return { kind: 'item', id: Number(tagged.dataset.itemId || tagged.dataset.item) };
    const m = href.match(/\/items\/(\d{7})-/) || href.match(/[?&](?:item|scroll)=(\d{7})/);
    if (m) return { kind: 'item', id: Number(m[1]) };
    const holder = el.closest('a, li, tr, .item-card, .monster-drop');
    const icon = (el.matches('img') ? el : holder?.querySelector('img[src*="/item/"]'))?.getAttribute('src') || '';
    const i = icon.match(/\/item\/(\d{7})\/icon/);
    return i ? { kind: 'item', id: Number(i[1]) } : null;
  }
  const keyOf = (t) => (t ? `${t.kind}:${t.id}` : null);
  const sprite = (id, size) => `<img class="tip-sprite" src="${body.dataset.sprites}${id}.gif" width="${size}" height="${size}" alt="" loading="lazy">`;
  const mobName = (id) => { const m = data.mobs[id]; return m ? (ko ? m[0] : m[1]) : ''; };
  const itemName = (id) => { const t = data.items[id]; return t ? (ko && t[0] ? t[0] : t[1]) : ''; };

  function priceBlock(id) {
    const p = prices.get(id);
    if (p === undefined) return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4><p class="tip-muted">${tr('시세 불러오는 중…', 'Loading prices…')}</p></section>`;
    if (!p?.median) return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4><p class="tip-muted">${tr('최근 14일 시세 기록이 없어요', 'No price seen in the last 14 days')}</p></section>`;
    const change = (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`);
    // Items nobody has scanned yet carry only the reference price, its changes and the sales count.
    if (p.basis === 'typical') {
      const t = p.typical || {};
      const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
      return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4>
<p class="tip-price"><b>${nf.format(p.median)}</b> <small>${tr('메소', 'mesos')} · ${tr('대표 시세', 'typical price')}</small></p>
<dl>${row(tr('24시간', '24h'), change(t.day))}${row(tr('7일', '7d'), change(t.week))}${row(tr('판매', 'Sales'), t.sales != null ? nf.format(t.sales) : '')}</dl></section>`;
    }
    const span = p.high > p.low ? Math.min(100, Math.max(0, ((p.median - p.low) / (p.high - p.low)) * 100)) : 50;
    const basis = { sold: tr('판매 완료 중앙값', 'sold median'), selling: tr('판매 중 중앙값', 'asking median'), buying: tr('구매 희망 중앙값', 'buying median') }[p.basis];
    const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
    return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4>
<p class="tip-price"><b>${nf.format(p.median)}</b> <small>${tr('메소', 'mesos')} · ${basis}</small></p>
${p.high > p.low ? `<div class="tip-range" aria-hidden="true"><i style="left:${span.toFixed(1)}%"></i></div><p class="tip-range-ends"><span>${nf.format(p.low)}</span><span>${nf.format(p.high)}</span></p>` : ''}
<dl>${row(tr('기록', 'Records'), `${nf.format(p.n)}${tr('건', '')}`)}${row(tr('판매 완료', 'Sold'), p.sold?.median ? nf.format(p.sold.median) : '')}${row(tr('판매 중', 'Asking'), p.selling?.median ? nf.format(p.selling.median) : '')}${row(tr('구매 희망', 'Buying'), p.buying?.median ? nf.format(p.buying.median) : '')}</dl></section>`;
  }

  function renderItem(id) {
    const t = data?.items?.[id];
    if (!t) return false;
    const [nameKo, nameEn, cat, sub, lv, job, req, inc, slots, sell, scroll, drops, dropN, questN] = t;
    const name = ko && nameKo ? nameKo : nameEn;
    const lines = [];
    if (scroll) {
      const [gain, success, boom] = scroll;
      const stat = nameEn.replace(/ Scroll:.*$/, '').replace(/^(Gloves|Earring|Hat|Topwear|Bottomwear|Overall Armor|Shoes|Shield|Cape|One-Handed Sword|One-Handed Axe|One-Handed Blunt Weapon|Two-handed Sword|Two-handed Axe|Two-handed Blunt Weapon|Dagger|Wand|Staff|Spear|Polearm|Bow|Crossbow|Claw) /, '');
      lines.push(`<p class="tip-effect"><b>${esc(stat)} +${gain}</b> <span class="tip-good">${tr('성공률', 'success')} ${success}%</span>${boom ? ` <span class="tip-bad">${tr('실패 시 파괴', 'boom on fail')} ${boom}%</span>` : ''}</p>`);
    }
    if (cat === 'Equip') {
      const jobs = JOBS.filter(([b]) => job & b).map(([, n]) => n).join(', ') || tr('모든 직업', 'All classes');
      const reqs = Object.entries(req || {}).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ');
      lines.push(`<p class="tip-req">${lv ? `Lv. ${lv} · ` : ''}${esc(jobs)}${reqs ? `<br><span class="tip-muted">${reqs}</span>` : ''}</p>`);
      const stats = Object.entries(inc || {}).map(([k, v]) => `<li>${INC[k] || k} <b>+${v}</b></li>`).join('');
      if (stats) lines.push(`<ul class="tip-stats">${stats}</ul>`);
      if (slots) lines.push(`<p class="tip-muted">${tr('업그레이드 가능 횟수', 'Upgrade slots')} ${slots}</p>`);
    }
    const from = [];
    let dropList = '';
    if (drops?.length) {
      // The data keeps up to 16 droppers for the market's item panel; the card shows the first four.
      const shown = drops.slice(0, 4);
      dropList = `<ul class="tip-mobs">${shown.filter((m) => data.mobs[m]).map((m) => `<li>${sprite(m, 36)}<span>${esc(mobName(m))}</span><small>Lv. ${data.mobs[m][2]}</small></li>`).join('')}</ul>${dropN > shown.length ? `<p class="tip-muted">${tr(`외 ${dropN - shown.length}마리`, `+${dropN - shown.length} more`)}</p>` : ''}`;
    }
    if (questN) from.push(`${tr('퀘스트 보상', 'Quest reward')} ${questN}${tr('개', '')}`);
    card.innerHTML = `<header><img src="https://maplestory.io/api/MCW/1/item/${id}/icon" width="32" height="32" alt=""><div><strong>${esc(name)}</strong><small>${esc(ko ? CAT[cat] || cat : sub || CAT[cat] || cat)}</small></div></header>
${lines.join('')}
${priceBlock(id)}
${dropList ? `<section><h4>${tr('드롭하는 몬스터', 'Dropped by')}</h4>${dropList}</section>` : ''}
${sell || from.length ? `<section class="tip-npc">${sell ? `<p>${tr('상점에 팔 때', 'Sells to NPC for')} <b>${nf.format(sell)}</b> ${tr('메소', 'mesos')}</p>` : ''}${from.map((f) => `<p>${f}</p>`).join('')}</section>` : ''}
<footer>${tr('시세: GMS Hub 수집 · 능력치: 게임 데이터 · 드롭: 플레이어 제보', 'Prices: GMS Hub scans · stats: game data · drops: player reports')}</footer>`;
    return true;
  }

  const EL = { F: tr('불', 'Fire'), I: tr('얼음', 'Ice'), L: tr('번개', 'Lightning'), S: tr('독', 'Poison'), H: tr('성', 'Holy'), D: tr('어둠', 'Dark'), P: tr('물리', 'Physical') };
  function renderMob(id) {
    const m = data?.mobs?.[id];
    if (!m) return false;
    const [nameKo, nameEn, lv, hp, exp, el, eva, boss, acc, maps, mapN, drops, dropN, status] = m;
    const els = [...String(el).matchAll(/([A-Z])(\d)/g)].filter(([, e, c]) => EL[e] && '123'.includes(c));
    const elTag = (c, cls, label) => {
      const names = els.filter(([, , x]) => x === c).map(([, e]) => EL[e]);
      return names.length ? `<span class="${cls}">${label} ${names.join(', ')}</span>` : '';
    };
    const elLine = [elTag('3', 'tip-good', tr('약점', 'Weak to')), elTag('2', 'tip-bad', tr('저항', 'Resists')), elTag('1', 'tip-bad', tr('면역', 'Immune to'))].filter(Boolean).join(' · ');
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const where = maps.length ? maps.map(([k, e]) => esc(ko ? k : e)).join(', ') + (mapN > maps.length ? ` ${tr(`외 ${mapN - maps.length}곳`, `+${mapN - maps.length} more`)}` : '')
      : status === 'upcoming' ? tr('11/18 개방 지역', 'Area opens Nov 18') : tr('출현 맵 없음', 'No open map');
    const dropList = drops.filter((d) => data.items[d]).map((d) => `<li><img src="https://maplestory.io/api/MCW/1/item/${d}/icon" width="24" height="24" alt="" loading="lazy"><span>${esc(itemName(d))}</span></li>`).join('');
    card.innerHTML = `<header class="tip-mob-head">${sprite(id, 56)}<div><strong>${esc(ko ? nameKo : nameEn)}</strong><small>Lv. ${lv}${boss ? ` · ${tr('보스', 'Boss')}` : ''}${ko && nameEn !== nameKo ? ` · ${esc(nameEn)}` : ''}</small></div></header>
<dl class="tip-mob-stats">${row('HP', nf.format(hp))}${row('EXP', nf.format(exp))}${row(tr('회피', 'Avoid'), nf.format(eva))}${row(tr('필요 명중', 'Accuracy'), acc ? nf.format(acc) : '—')}</dl>
${elLine ? `<p>${elLine}</p>` : ''}
<section><h4>${tr('출현 맵', 'Spawns at')}</h4><p>${where}</p></section>
${dropList ? `<section><h4>${tr('주요 드롭', 'Notable drops')}</h4><ul class="tip-drops">${dropList}</ul>${dropN > drops.length ? `<p class="tip-muted">${tr(`외 ${dropN - drops.length}종`, `+${dropN - drops.length} more`)}</p>` : ''}</section>` : ''}
<footer>${tr('필요 명중은 같은 레벨 기준 · 드롭: 플레이어 제보', 'Accuracy at its own level · drops: player reports')}</footer>`;
    return true;
  }
  const render = (t) => (t.kind === 'mob' ? renderMob(t.id) : renderItem(t.id));

  let current = null;
  let timer = 0;
  let lastX = 0;
  let lastY = 0;
  function place() {
    const pad = 14;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let x = lastX + pad;
    let y = lastY + pad;
    if (x + w > innerWidth - 8) x = Math.max(8, lastX - w - pad);
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    card.style.transform = `translate(${x}px, ${y}px)`;
  }
  async function show(t) {
    const key = keyOf(t);
    await load();
    if (current !== key || !render(t)) return;
    card.hidden = false;
    place();
    if (t.kind === 'item' && !prices.has(t.id) && body.dataset.priceApi) {
      try {
        const r = await fetch(`${body.dataset.priceApi}/prices?ids=${t.id}`);
        prices.set(t.id, r.ok ? (await r.json())[t.id] || null : null);
      } catch (e) {
        prices.set(t.id, null);
      }
      if (current === key && render(t)) place();
    }
  }
  function hide() {
    current = null;
    clearTimeout(timer);
    card.hidden = true;
  }
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('.item-tip, nav, header.site-header, select, input, button')) return;
    const t = targetOf(e.target);
    if (!t || !t.id) return;
    const key = keyOf(t);
    if (key === current) return;
    current = key;
    clearTimeout(timer);
    timer = setTimeout(() => show(t), 140);
  });
  document.addEventListener('pointerout', (e) => {
    if (!current) return;
    const to = e.relatedTarget;
    if (to && keyOf(targetOf(to)) === current) return;
    hide();
  });
  document.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!card.hidden) place();
  }, { passive: true });
  addEventListener('scroll', hide, { passive: true });
}
