import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { selectRoutes, routeCards, publicTrainingData, validateTraining } from '../assets/training-evidence.js';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p,root),'utf8');
const training = JSON.parse(read('data/training.json'));
const evidence = JSON.parse(read('data/editorial/korean-guides.json'));
const guides = JSON.parse(read('data/guides.json')).guides;
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});

test('level 20 starter routes do not default to Ant Tunnel; equipped claw route is explicit',()=>{
  for(const job of ['','warrior','archer','mage','thief']){
    const rows=selectRoutes(training.routes,{level:20,job});
    assert.ok(rows.length,job);
    assert.ok(!rows.some(r=>r.id.startsWith('ant')));
  }
  assert.ok(selectRoutes(training.routes,{level:20,job:'assassin',advanced:true}).some(r=>r.id==='ant-early'));
  assert.ok(!selectRoutes(training.routes,{level:20,job:'warrior',advanced:true}).some(r=>r.id==='ant-early'));
});
test('class families, solo and supply filters preserve actual entry conditions',()=>{
  const hunter=selectRoutes(training.routes,{level:43,job:'hunter',advanced:true});
  assert.ok(hunter.some(r=>r.id==='lorang'));
  assert.ok(!selectRoutes(training.routes,{level:43,job:'hunter',party:'solo',advanced:true}).some(r=>r.id==='lorang'));
  assert.ok(selectRoutes(training.routes,{level:21}).some(r=>r.id==='kpq'));
  assert.ok(!selectRoutes(training.routes,{level:21,party:'solo'}).some(r=>r.id==='kpq'));
  assert.ok(!selectRoutes(training.routes,{level:55,job:'mage'}).some(r=>r.id==='sleepy-golem'));
  assert.ok(!selectRoutes(training.routes,{level:55,job:'hunter',advanced:true,goal:'economy'}).some(r=>r.id==='sleepy-golem'));
  assert.ok(!selectRoutes(training.routes,{level:40,job:'fire'}).some(r=>r.id==='burnt-land'));
  assert.ok(!selectRoutes(training.routes,{level:43,job:'crossbow'}).some(r=>r.id==='deep-ant-hunter'));
});
test('common early levels and all seven level-band pages have usable routes',()=>{
  for(let level=1;level<=30;level++) for(const job of ['warrior','archer','mage','thief']) assert.ok(selectRoutes(training.routes,{level,job}).length,`${level} ${job}`);
  for(const lang of ['ko','en']) for(const band of ['1-10','11-20','21-30','31-40','41-50','51-60','61-80']) {
    const html=read(`dist/${lang}/tools/training/level-${band}/index.html`);
    assert.ok(html.includes('data-route='));
    assert.ok(!html.includes('content="noindex"'));
  }
});
test('each route has maintainable evidence and substantive bilingual decisions',()=>{
  assert.doesNotThrow(()=>validateTraining(training,evidence));
  for(const mutate of [r=>r.evidence=['missing'],r=>r.jobs=['made-up'],r=>r.level.max=0,r=>delete r.entry.ko,r=>delete r.cost.en]) {
    const bad=structuredClone(training);mutate(bad.routes[0]);assert.throws(()=>validateTraining(bad,evidence));
  }
});
test('source identities stay internal in rendered cards, embedded data and guide HTML',()=>{
  const publicData=publicTrainingData(training);
  for(const r of publicData.routes) {assert.ok(!('evidence' in r));assert.ok(!('editorialBasis' in r));}
  const pages=['ko','en'].map(l=>read(`dist/${l}/tools/training/index.html`)).concat(guides.map(g=>read(`dist/${g.lang}/guides/${g.slug}/index.html`)));
  for(const html of pages){
    assert.ok(!/youtube\.com|youtu\.be|reddit\.com|참고한 자료|Original account ↗/.test(html));
    for(const s of evidence.sources) assert.ok(!html.includes(s.author),s.author);
  }
  assert.ok(!fs.existsSync(new URL('dist/data/editorial/korean-guides.json',root)));
  const r=structuredClone(training.routes[0]);r.title.ko='<img src=x onerror=alert(1)>';
  assert.ok(!routeCards([r],'ko').includes('<img'));
  assert.ok(routeCards([r],'ko').includes('&lt;img'));
});
test('restored guides have detailed sections, search/sitemap access and no withholding notices',()=>{
  for(const g of guides){
    assert.equal(g.status,'published');
    const html=read(`dist/${g.lang}/guides/${g.slug}/index.html`);
    assert.ok(!html.includes('content="noindex"'));
    assert.ok(!html.includes('기존 안내 비공개'));
    assert.ok(read('dist/sitemap.xml').includes(`/${g.lang}/guides/${g.slug}/`));
    assert.ok(read(`dist/${g.lang}/index.html`).includes(`/guides/${g.slug}/`));
    if(g.evidenceKind==='conditional-guide'){
      assert.ok(g.evidenceRefs.every(id=>evidence.sources.some(s=>s.id===id)));
      assert.ok((html.match(/<h2 id="section-/g)||[]).length>=4,g.slug);
      assert.ok(html.includes('guide-toc'));
    }
  }
  const quests=read('dist/ko/guides/best-early-quests/index.html');
  assert.ok(quests.includes('전신 방어 주문서'));
  const mage=read('dist/ko/guides/mage-build/index.html');
  assert.ok(mage.includes('힐의 피해가 전혀 없다고 단정하는 것도 맞지'));
});
test('training form exposes costs and party setup without navigation or research metadata',()=>{
  for(const lang of ['ko','en']){
    const html=read(`dist/${lang}/tools/training/index.html`);
    for(const field of ['lv','job','goal','party','advanced'])assert.ok(html.includes(`name="${field}"`));
    assert.match(html,/type="module" src="[^"]*training.js/);
    assert.ok(!html.includes('name="unknown"'));
    assert.ok(!html.includes('meowdbExpHr'));
  }
  const client=read('assets/training.js');assert.ok(client.includes('history.replaceState'));assert.ok(!/location\.(?:href\s*=|assign)/.test(client));
});
