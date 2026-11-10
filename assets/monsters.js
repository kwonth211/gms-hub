import { indexEntry, searchEntries } from './search-index.js';
const ko = document.documentElement.lang === 'ko';
const $ = id => document.getElementById(id);
const countText = (shown,total) => ko ? `${total}개 중 ${shown}개 표시` : tx('{shown} of {total} shown', {shown, total});
document.querySelectorAll('.monster-page form').forEach(form => form.addEventListener('submit',e=>e.preventDefault()));

if ($('monster-index')) {
  const cards = [...document.querySelectorAll('[data-monster]')];
  const entries = cards.map((el,id)=>indexEntry({id,title:el.dataset.name,names:[el.dataset.search]}));
  const query = $('monster-query'), level = $('monster-level'), type = $('monster-type'), sort = $('monster-sort'), unavailable = $('monster-unavailable');
  function render() {
    const matched = query.value.trim() ? new Set(searchEntries(entries,query.value).map(r=>r.id)) : null;
    const [min,max] = level.value ? level.value.split('-').map(Number) : [0,Infinity];
    let shown=0;
    cards.forEach((el,id)=>{
      el.hidden = (matched&&!matched.has(id)) || el.dataset.level<min || el.dataset.level>max || (type.value&&el.dataset[type.value]!=='true') || (!unavailable.checked&&el.dataset.status!=='active');
      if (!el.hidden) shown++;
    });
    [...cards].sort((a,b)=>sort.value==='name'?a.dataset.name.localeCompare(b.dataset.name,ko?'ko':'en'):(Number(a.dataset[sort.value])-Number(b.dataset[sort.value]))*(sort.value==='exp'?-1:1)).forEach(el=>$('monster-grid').append(el));
    $('monster-count').textContent=countText(shown,cards.length);
    $('monster-empty').hidden=shown>0;
  }
  [query,level,type,sort,unavailable].forEach(el=>el.addEventListener(el===query?'input':'change',render));
  $('monster-reset').addEventListener('click',()=>{query.value='';level.value='';type.value='';sort.value='level';unavailable.checked=false;render();query.focus();});
  query.value=new URLSearchParams(location.search).get('q')||'';
  render();
}
if ($('drop-query')) {
  const cards=[...document.querySelectorAll('[data-drop]')];
  const entries=cards.map((el,id)=>indexEntry({id,title:el.dataset.search,names:[el.dataset.search]}));
  function render() {
    const q=$('drop-query').value.trim(), category=$('drop-category').value;
    const matched=q?new Set(searchEntries(entries,q).map(r=>r.id)):null;
    let shown=0;
    cards.forEach((el,id)=>{el.hidden=(matched&&!matched.has(id))||(category&&category!==el.dataset.cat)||($('drop-repeated').checked&&el.dataset.confidence!=='repeated');if(!el.hidden)shown++;});
    $('drop-count').textContent=countText(shown,cards.length);$('drop-empty').hidden=shown>0;
  }
  $('drop-query').addEventListener('input',render);$('drop-category').addEventListener('change',render);$('drop-repeated').addEventListener('change',render);render();
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
