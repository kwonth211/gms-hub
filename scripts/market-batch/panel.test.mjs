import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

test('a previous receipt is labelled with its timestamp while the current failure/retry remains visible', async () => {
  for (const retryAt of [null, Date.now() + 300000]) {
    const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'https://meso.watch/' });
    const state = { version: '0.3.0', enabled: !!retryAt, retryAt, nextAt: retryAt, error: '상점 목록 로딩 지연',
      lastReceipt: { accepted: 500 }, lastSuccessAt: '2026-11-09T17:32:21Z' };
    dom.window.chrome = { runtime: { sendMessage: async () => ({ ok: true, value: state }), onMessage: { addListener() {} } },
      storage: { onChanged: { addListener() {} } } };
    dom.window.eval(fs.readFileSync(new URL('./extension/panel.js', import.meta.url), 'utf8'));
    await new Promise(resolve => setImmediate(resolve));
    const text = dom.window.document.querySelector('[role="status"]').textContent;
    assert.match(text, /마지막 DB 저장:.*500건/);
    assert.match(text, retryAt ? /자동 복구 대기/ : /수집 중단/);
    assert.match(text, /상점 목록 로딩 지연/);
    assert.ok(!text.includes('DB 저장 완료'));
    dom.window.close();
  }
});

test('a new panel cannot accidentally enable an old 15-minute background worker',async()=>{
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',url:'https://meso.watch/'});
 dom.window.chrome={runtime:{sendMessage:async()=>({ok:true,value:{enabled:false}}),onMessage:{addListener(){}}},storage:{onChanged:{addListener(){}}}};
 dom.window.eval(fs.readFileSync(new URL('./extension/panel.js',import.meta.url),'utf8'));await new Promise(resolve=>setImmediate(resolve));
 assert.ok([...dom.window.document.querySelectorAll('button[data-idle]')].every(b=>b.disabled));
 assert.match(dom.window.document.querySelector('[role="status"]').textContent,/이전 버전의 실행 버튼을 잠갔습니다/);dom.window.close();
});
