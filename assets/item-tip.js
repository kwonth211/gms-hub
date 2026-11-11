// Item hover card: point at any item on any page (a link to its page, a market row, a drop list entry, an icon) and a card
// shows what it is, what it does, what it sells for now and where it comes from. Pointer devices only; the data file
// loads on the first hover and live prices are fetched per item.
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

  // Which item does this element stand for? A data attribute, a link to an item page or market entry, or an item icon.
  function itemIdOf(el) {
    const tagged = el.closest('[data-item-id]');
    if (tagged) return Number(tagged.dataset.itemId);
    const a = el.closest('a[href]');
    const href = a?.getAttribute('href') || '';
    const m = href.match(/\/items\/(\d{7})-/) || href.match(/[?&](?:item|scroll)=(\d{7})/);
    if (m) return Number(m[1]);
    const holder = el.closest('a, li, tr, .item-card, .monster-drop');
    const icon = (el.matches('img') ? el : holder?.querySelector('img[src*="/item/"]'))?.getAttribute('src') || '';
    const i = icon.match(/\/item\/(\d{7})\/icon/);
    return i ? Number(i[1]) : null;
  }

  function priceBlock(id) {
    const p = prices.get(id);
    if (p === undefined) return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4><p class="tip-muted">${tr('시세 불러오는 중…', 'Loading prices…')}</p></section>`;
    if (!p?.median) return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4><p class="tip-muted">${tr('최근 14일 시세 기록이 없어요', 'No price seen in the last 14 days')}</p></section>`;
    const span = p.high > p.low ? Math.min(100, Math.max(0, ((p.median - p.low) / (p.high - p.low)) * 100)) : 50;
    const basis = { sold: tr('판매 완료 중앙값', 'sold median'), selling: tr('판매 중 중앙값', 'asking median'), buying: tr('구매 희망 중앙값', 'buying median') }[p.basis];
    const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
    return `<section class="tip-market"><h4>${tr('자유시장', 'Free Market')}</h4>
<p class="tip-price"><b>${nf.format(p.median)}</b> <small>${tr('메소', 'mesos')} · ${basis}</small></p>
${p.high > p.low ? `<div class="tip-range" aria-hidden="true"><i style="left:${span.toFixed(1)}%"></i></div><p class="tip-range-ends"><span>${nf.format(p.low)}</span><span>${nf.format(p.high)}</span></p>` : ''}
<dl>${row(tr('기록', 'Records'), `${nf.format(p.n)}${tr('건', '')}`)}${row(tr('판매 완료', 'Sold'), p.sold?.median ? nf.format(p.sold.median) : '')}${row(tr('판매 중', 'Asking'), p.selling?.median ? nf.format(p.selling.median) : '')}${row(tr('구매 희망', 'Buying'), p.buying?.median ? nf.format(p.buying.median) : '')}</dl></section>`;
  }

  function render(id) {
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
    if (drops?.length) {
      const names = drops.map((i) => data.mobs[i]).map(([k, e, l]) => `${esc(ko ? k : e)} <small>Lv. ${l}</small>`).join(', ');
      from.push(`${tr('드롭', 'Drop')}: ${names}${dropN > drops.length ? ` ${tr(`외 ${dropN - drops.length}`, `+${dropN - drops.length} more`)}` : ''}`);
    }
    if (questN) from.push(`${tr('퀘스트 보상', 'Quest reward')} ${questN}${tr('개', '')}`);
    card.innerHTML = `<header><img src="https://maplestory.io/api/MCW/1/item/${id}/icon" width="32" height="32" alt=""><div><strong>${esc(name)}</strong><small>${esc(ko ? CAT[cat] || cat : sub || CAT[cat] || cat)}</small></div></header>
${lines.join('')}
${priceBlock(id)}
${sell || from.length ? `<section class="tip-npc">${sell ? `<p>${tr('상점에 팔 때', 'Sells to NPC for')} <b>${nf.format(sell)}</b> ${tr('메소', 'mesos')}</p>` : ''}${from.map((f) => `<p>${f}</p>`).join('')}</section>` : ''}
<footer>${tr('시세: GMS Hub 수집 · 능력치: 게임 데이터 · 드롭: 플레이어 제보', 'Prices: GMS Hub scans · stats: game data · drops: player reports')}</footer>`;
    return true;
  }

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
  async function show(id) {
    await load();
    if (current !== id || !render(id)) return;
    card.hidden = false;
    place();
    if (!prices.has(id) && body.dataset.priceApi) {
      try {
        const r = await fetch(`${body.dataset.priceApi}/prices?ids=${id}`);
        prices.set(id, r.ok ? (await r.json())[id] || null : null);
      } catch (e) {
        prices.set(id, null);
      }
      if (current === id && render(id)) place();
    }
  }
  function hide() {
    current = null;
    clearTimeout(timer);
    card.hidden = true;
  }
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('.item-tip, nav, header.site-header, select, input, button')) return;
    const id = itemIdOf(e.target);
    if (!id) return;
    if (id === current) return;
    current = id;
    clearTimeout(timer);
    timer = setTimeout(() => show(id), 140);
  });
  document.addEventListener('pointerout', (e) => {
    if (!current) return;
    const to = e.relatedTarget;
    if (to && itemIdOf(to) === current) return;
    hide();
  });
  document.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!card.hidden) place();
  }, { passive: true });
  addEventListener('scroll', hide, { passive: true });
}
