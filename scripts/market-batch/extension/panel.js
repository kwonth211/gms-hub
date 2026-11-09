(() => {
  if (document.getElementById('gms-batch-test')) return;
  const box = document.createElement('section'); box.id = 'gms-batch-test'; box.dataset.version = '0.2.3';
  Object.assign(box.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', width: '320px', padding: '16px', background: '#17202d', color: '#fff', border: '2px solid #f59e0b', borderRadius: '12px', font: '14px/1.6 system-ui', boxShadow: '0 4px 24px #0008' });
  const title = document.createElement('strong'); title.textContent = 'GMS 시세 자동 수집 v0.2.3';
  const note = document.createElement('p'); note.textContent = '별도 수집 창에서 최대 500건씩 저장합니다. 창을 최소화하지 마세요. 15분 간격 · AI 호출 없음';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const history = document.createElement('p'); history.style.fontSize = '12px';
  box.append(title,note,status,history); document.body.append(box);
  let state, running = false, cancelled = false;
  async function send(type, extra = {}) {
    const r = await chrome.runtime.sendMessage({ type, ...extra }); if (!r?.ok) throw new Error(r?.error || '확장 프로그램 응답 없음'); return r.value;
  }
  function render(s) {
    state = s;
    const progress = s.run?.progress;
    const phase = { loading: '페이지 여는 중', collecting: '수집 중', uploading: 'DB 저장 중' }[s.run?.phase] || '실행 중';
    const active = s.run ? `${phase} · ${progress?.shops || 0}곳 · ${progress?.rows || 0}건` : s.pending ? 'DB 저장 대기' : s.retryAt ? '로딩 지연 · 자동 복구 대기' : s.error ? '수집 중단 · 확인 필요' : '대기 중';
    const next = s.enabled ? `자동 수집 켜짐 · 다음 ${s.nextAt ? new Date(s.nextAt).toLocaleTimeString('ko-KR') : '예약 확인 중'}` : '자동 수집 꺼짐';
    const last = s.lastSuccessAt && s.lastReceipt ? `마지막 DB 저장: ${new Date(s.lastSuccessAt).toLocaleString('ko-KR')} · ${s.lastReceipt.accepted}건` : '아직 DB 저장 기록 없음';
    status.textContent = [active, next, last, s.error].filter(Boolean).join('\n'); status.style.whiteSpace = 'pre-line';
    history.textContent = (s.history || []).slice(0, 4).map(x => `${new Date(x.at).toLocaleTimeString('ko-KR')} ${x.mode === 'test' ? '검증' : x.trigger === 'alarm' ? '예약' : x.trigger === 'retry' ? '재시도' : '수집'} ${x.rows || 0}건 ${{stored:'저장',verified:'검증 완료',failed:'실패',retrying:'재시도 대기'}[x.status] || x.status}`).join(' / ');
    for (const b of box.querySelectorAll('button[data-idle]')) b.disabled = !!s.run || !!s.pending;
  }
  async function refresh() { try { render(await send('status')); } catch (e) { status.textContent = e.message; } }
  function add(name, type, idle = false) {
    const b = document.createElement('button'); b.textContent = name;
    if (idle) b.dataset.idle = '1';
    Object.assign(b.style, { margin:'3px',padding:'6px 9px',background:'#fff',color:'#17202d',border:'1px solid #aaa',borderRadius:'6px',cursor:'pointer' });
    b.onclick = async () => { try { await send(type); await refresh(); } catch (e) { status.textContent = e.message; } }; box.append(b); return b;
  }
  add('반복 검증 3회','test3',true); add('500건 수집·저장','run',true);
  add('15분 자동 수집 켜기','enable',true); add('자동 수집 끄기','disable'); add('실행 중지','cancel'); add('저장 재시도','retry');
  const download = add('결과 JSON 저장','status');
  download.onclick = async () => {
    const s = await send('status');
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify({ report:s.lastReport, receipt:s.lastReceipt, history:s.history, enabled:s.enabled,nextAt:s.nextAt,pending:!!s.pending,run:s.run },null,2)],{type:'application/json'}));
    a.href=url; a.download=`gms-market-batch-${new Date().toISOString().replace(/[:.]/g,'-')}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.state) refresh(); });
  chrome.runtime.onMessage.addListener(m => { if (m.type === 'cancel') cancelled = true; });
  async function ready() {
    if (running || new URL(location.href).searchParams.get('gms-batch') !== '1') return;
    const run = await send('ready'); if (!run) return;
    running = true; cancelled = false;
    const report = await GmsCollector.collect(run, progress => send('progress',{runId:run.runId,progress}),()=>cancelled,ms=>send('pace',{runId:run.runId,ms}));
    await send('finish',{report}); running = false; await refresh();
  }
  refresh(); ready().catch(e => { status.textContent = e.message; });
})();
