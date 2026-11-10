const tx = globalThis.tx || ((s) => s);
// Collection completion is different from a visitor refreshing the directory.
export function collectionStatusView(s, lang = 'ko', now = Date.now()) {
  const ko = lang === 'ko', last = Date.parse(s.lastSuccessAt), next = Date.parse(s.nextEligibleAt);
  const hours = Math.max(1, Math.round((Number(s.intervalSeconds) || 3600) / 3600));
  const stamp = n => new Date(n).toLocaleString(ko ? 'ko-KR' : 'en-US', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const state = ['paused','budget_wait'].includes(s.state) ? s.state : !Number.isFinite(last) ? 'waiting' : now-last > hours*90*60000 ? 'delayed' : 'recent';
  const title = ko ? {paused:'정기 수집 일시 중지',budget_wait:'한도 초기화 대기',waiting:'첫 수집 대기',delayed:'시세 수집 지연',recent:'최근 수집 반영됨'}[state]
    : {paused:tx('Collection paused'),budget_wait:tx('Waiting for daily reset'),waiting:tx('Awaiting first collection'),delayed:tx('Collection delayed'),recent:tx('Recent collection received')}[state];
  const schedule = ko ? `${hours}시간 간격 수집` : tx('Collection every {h}h', {h: hours});
  const completed = Number.isFinite(last) ? (ko ? `최근 수집 완료 ${stamp(last)}` : tx('Last collection {at}', {at: stamp(last)})) : (ko ? '아직 저장 기록 없음' : tx('No completed collection yet'));
  const waiting = state==='budget_wait'&&Number.isFinite(next) ? (ko?` · ${stamp(next)} 이후 수집 가능`:tx(' · eligible after {at}', {at: stamp(next)})) : '';
  return {state,title,description:`${schedule} · ${completed}${waiting}`};
}

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-collection-status]')) {
  let busy=false, lastAttempt=0;
  async function refresh() {
    if(busy||document.hidden||Date.now()-lastAttempt<60000)return;
    busy=true;lastAttempt=Date.now();
    try {
      const r=await fetch(el.dataset.api+'/market/status',{signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw Error('status');
      const view=collectionStatusView(await r.json(),document.documentElement.lang);
      el.dataset.state=view.state;
      el.querySelector('strong').textContent=view.title;
      el.querySelector('span').textContent=view.description;
      const market=el.closest('#live-market');if(market)market.dataset.collectionState=view.state;
    } catch {
      el.dataset.state='delayed';
      el.querySelector('strong').textContent=document.documentElement.lang==='ko'?'수집 상태 확인 지연':tx('Collection status unavailable');
      const market=el.closest('#live-market');if(market)market.dataset.collectionState='delayed';
    } finally {busy=false;}
  }
  refresh();setInterval(refresh,180000);document.addEventListener('visibilitychange',refresh);
}
