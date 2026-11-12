import { indexEntry, searchEntries } from './search-index.js';
const ko = document.documentElement.lang === 'ko';
const $ = id => document.getElementById(id);
const countText = (shown,total) => ko ? `${total}개 중 ${shown}개 표시` : tx('{shown} of {total} shown', {shown, total});
document.querySelectorAll('.monster-page form').forEach(form => form.addEventListener('submit',e=>e.preventDefault()));

if ($('monster-index')) {
  const cards = [...document.querySelectorAll('[data-monster]')];
  // Card or list layout. The list (one monster per row, like NiaDB's tables) is the default: on cards only about six
  // monsters fit a screen, and 60% of visits to this page left quickly. The choice is remembered.
  const grid = $('monster-grid');
  const views = document.createElement('div');
  views.className = 'monster-views';
  views.setAttribute('role', 'group');
  views.innerHTML = `<button type="button" data-mview="list">${ko ? '목록' : tx('List')}</button><button type="button" data-mview="cards">${ko ? '카드' : tx('Cards')}</button>`;
  $('monster-reset')?.before(views);
  const setView = (v) => {
    grid.classList.toggle('compact', v === 'list');
    views.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mview === v));
    try { localStorage.setItem('gms-mob-view', v); } catch (e) {}
  };
  let savedView = 'list';
  try { savedView = localStorage.getItem('gms-mob-view') || 'list'; } catch (e) {}
  setView(savedView);
  views.addEventListener('click', (e) => { const b = e.target.closest('[data-mview]'); if (b) { setView(b.dataset.mview); window.track?.('monster_view', { view: b.dataset.mview }); } });
  const entries = cards.map((el,id)=>indexEntry({id,title:el.dataset.name,names:[el.dataset.search]}));
  const query = $('monster-query'), level = $('monster-level'), type = $('monster-type'), sort = $('monster-sort'), unavailable = $('monster-unavailable');
  function render() {
    const matched = query.value.trim() ? new Set(searchEntries(entries,query.value).map(r=>r.id)) : null;
    const [min,max] = level.value ? level.value.split('-').map(Number) : [0,Infinity];
    let shown=0, hiddenByStatus=0;
    cards.forEach((el,id)=>{
      const fits = !(matched&&!matched.has(id)) && el.dataset.level>=min && el.dataset.level<=max && !(type.value&&el.dataset[type.value]!=='true');
      el.hidden = !fits || (!unavailable.checked&&el.dataset.status!=='active');
      if (!el.hidden) shown++;
      else if (fits) hiddenByStatus++;
    });
    // Say when matches exist but sit behind the "unreleased" filter (e.g. Forgotten Hollow monsters before Nov 18).
    const hint=$('monster-hidden-hint');
    if (hint) { hint.hidden=!hiddenByStatus; hint.querySelector('span').textContent=ko?`개방 예정·미개방 몬스터 ${hiddenByStatus}마리가 숨겨져 있어요.`:tx('{n} upcoming or unreleased monsters are hidden.',{n:hiddenByStatus}); }
    [...cards].sort((a,b)=>sort.value==='name'?a.dataset.name.localeCompare(b.dataset.name,ko?'ko':'en'):(Number(a.dataset[sort.value])-Number(b.dataset[sort.value]))*(sort.value==='exp'?-1:1)).forEach(el=>$('monster-grid').append(el));
    $('monster-count').textContent=countText(shown,cards.length);
    $('monster-empty').hidden=shown>0;
  }
  $('monster-hidden-hint')?.querySelector('button').addEventListener('click',()=>{unavailable.checked=true;render();});
  [query,level,type,sort,unavailable].forEach(el=>el.addEventListener(el===query?'input':'change',render));
  $('monster-reset').addEventListener('click',()=>{query.value='';level.value='';type.value='';sort.value='level';unavailable.checked=false;render();query.focus();});
  query.value=new URLSearchParams(location.search).get('q')||'';
  render();
}
if ($('drop-query')) {
  const cards=[...document.querySelectorAll('[data-drop]')], list=cards[0].parentElement;
  const entries=cards.map((el,id)=>indexEntry({id,title:el.dataset.search,names:[el.dataset.search]}));
  const num=(el,k)=>Number(el.dataset[k])||0;
  // Items without a market price sort after priced ones, by NPC sell price, so the list still reads high to low.
  const byPrice=(a,b,dir)=>(num(b,'market')>0)-(num(a,'market')>0)||dir*(num(b,'market')-num(a,'market'))||num(b,'sell')-num(a,'sell');
  const sorts={market:(a,b)=>byPrice(a,b,1),'market-asc':(a,b)=>byPrice(a,b,-1),sell:(a,b)=>num(b,'sell')-num(a,'sell'),lv:(a,b)=>num(b,'lv')-num(a,'lv'),
    order:(a,b)=>num(a,'order')-num(b,'order'),name:(a,b)=>a.dataset.name.localeCompare(b.dataset.name,ko?'ko':'en')};
  function render() {
    const q=$('drop-query').value.trim(), category=$('drop-category').value;
    const matched=q?new Set(searchEntries(entries,q).map(r=>r.id)):null;
    let shown=0;
    cards.forEach((el,id)=>{el.hidden=(matched&&!matched.has(id))||(category&&category!==el.dataset.cat)||($('drop-repeated').checked&&el.dataset.confidence!=='repeated');if(!el.hidden)shown++;});
    const sort=sorts[$('drop-sort').value]||sorts.order;
    [...cards].sort((a,b)=>sort(a,b)||num(a,'order')-num(b,'order')).forEach(el=>list.append(el));
    $('drop-count').textContent=countText(shown,cards.length);$('drop-empty').hidden=shown>0;
  }
  $('drop-query').addEventListener('input',render);$('drop-category').addEventListener('change',render);$('drop-repeated').addEventListener('change',render);
  $('drop-sort').addEventListener('change',()=>{render();track('monster_drop_sort',{sort:$('drop-sort').value});});
  render();
  // Live market medians (last 14 days of shop scans and player reports), 60 items per request.
  const api=document.body.dataset.priceApi, ids=cards.map(el=>el.dataset.item).filter(Boolean);
  const mesos=n=>ko?(n>=1e8?`${+(n/1e8).toFixed(2)}억`:n>=1e4?`${+(n/1e4).toFixed(n>=1e6?0:1)}만`:n.toLocaleString('ko')):n.toLocaleString('en-US');
  if (api&&ids.length) Promise.all(Array.from({length:Math.ceil(ids.length/60)},(_,i)=>fetch(`${api}/prices?ids=${ids.slice(i*60,i*60+60).join(',')}`).then(r=>r.ok?r.json():{}).catch(()=>({}))))
    .then(parts=>{
      const prices=Object.assign({},...parts);
      cards.forEach(el=>{
        const p=prices[el.dataset.item];
        if(!p?.median)return;
        el.dataset.market=p.median;
        const slot=el.querySelector('[data-price]');
        slot.textContent=ko?`시세 ${mesos(p.median)} 메소`:tx('Market {price} mesos',{price:mesos(p.median)});
        slot.hidden=false;
      });
      render();
    });
}
if ($('location-sort')) {
  const rows=[...document.querySelectorAll('[data-location]')], tbody=rows[0].parentElement;
  function render() {
    let shown=0;
    rows.forEach(row=>{row.hidden=row.dataset.availability!=='open'&&!$('location-unavailable')?.checked;if(!row.hidden)shown++;});
    [...rows].sort((a,b)=>(a.dataset.availability==='open'?0:1)-(b.dataset.availability==='open'?0:1)||Number(b.dataset[$('location-sort').value])-Number(a.dataset[$('location-sort').value])).forEach(row=>tbody.append(row));
    $('location-empty').hidden=shown>0;
  }
  $('location-sort').addEventListener('change',render);$('location-unavailable')?.addEventListener('change',render);render();
}
// Links out of a monster page: a dropped item (to its price page) or the hits-to-kill calculator.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a.monster-item-action, a.monster-calc');
  if (!a) return;
  const mob = Number(a.closest('[data-mob-id]')?.dataset.mobId) || undefined;
  if (a.classList.contains('monster-calc')) track('monster_calc_click', { mob_id: mob });
  else track('monster_drop_click', { mob_id: mob, item_id: Number(a.dataset.itemId) || undefined });
});
