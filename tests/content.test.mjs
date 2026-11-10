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

test('monster details, search destinations and calculator links share the same snapshot',()=>{
  const monsters=JSON.parse(read('data/monsters.json')).monsters;
  const compact=JSON.parse(read('dist/assets/mobs.json'));
  for(const m of monsters){
    const row=compact.find(r=>r[0]===m.id);assert.equal(row[4],m.hp);assert.equal(row[1],m.ko);
    for(const lang of ['ko','en']){
      const html=read(`dist/${lang}/monsters/${m.id}/index.html`);
      assert.ok(html.includes(`hreflang="${lang==='ko'?'en':'ko'}"`));
      assert.ok(html.includes(`/tools/damage/?mob=${encodeURIComponent(m.en)}`));
      assert.equal(html.includes('content="noindex"'),m.status==='unplaced');
    }
  }
  const home=read('dist/ko/index.html');assert.ok(home.includes('data-monsters="/ko/monsters/"'));
  assert.ok(read('assets/home.js').includes('${searchPanel.dataset.monsters}${id}/'));
  assert.ok(read('dist/ko/tools/damage/index.html').includes('"monstersUrl":"/ko/monsters/"'));
  assert.ok(read('dist/sitemap.xml').includes('/ko/monsters/31/'));
  assert.ok(!fs.existsSync(new URL('dist/data/editorial/monsters.json',root)));
});
test('every training route names its monsters and new evidence-backed routes appear for their classes',()=>{
  const monsters=JSON.parse(read('data/monsters.json')).monsters;
  for(const r of training.routes){
    assert.ok(r.mobIds.length,r.id);
    for(const id of r.mobIds) assert.ok(monsters.some(m=>m.id===id),`${r.id} ${id}`);
  }
  const ids=(o)=>selectRoutes(training.routes,o).map(r=>r.id);
  assert.ok(ids({level:36,job:'fire'}).includes('jr-wraith'));
  assert.ok(ids({level:36,job:'fire'}).includes('burnt-stump-fp'));
  assert.ok(!ids({level:36,job:'warrior'}).includes('burnt-stump-fp'));
  assert.ok(ids({level:32,job:'warrior'}).includes('kpq-ligator'));
  assert.ok(!ids({level:32,job:'warrior',party:'solo'}).includes('kpq-ligator'));
  assert.ok(ids({level:20,job:'mage'}).includes('bubbling'));
  assert.ok(ids({level:45,job:'assassin'}).includes('monkey-assassin'));
  assert.ok(ids({level:55,job:'fire'}).includes('croco-fp'));
  assert.ok(!ids({level:60,job:'ice'}).includes('red-drake'),'advanced route hidden by default');
  assert.ok(ids({level:60,job:'ice',advanced:true}).includes('red-drake'));
  assert.ok(ids({level:55,job:'cleric'}).includes('tomb3'),'Tomb III opened to all classes');
  // Built training page carries monster chips with the sure-hit accuracy and anchors the bestiary links to.
  const html=read('dist/ko/tools/training/level-41-50/index.html');
  assert.ok(html.includes('id="route-wraith"')&&html.includes('필요 명중 104'));
  assert.ok(read('dist/ko/tools/training/index.html').includes('"mobs":[{"id":43,'),'route monsters shipped in the page data');
  assert.ok(read('dist/ko/monsters/43/index.html').includes('/ko/tools/training/?lv=48#route-wraith'));
  assert.ok(read('dist/ko/items/1032007-emerald-earrings/index.html').includes('드롭하는 몬스터'));
});
test('site review fixes: localized route links, unique monster titles, honest price headline, searchable routes',()=>{
  const r=training.routes.find(r=>r.id==='wraith');
  const mobs=[{id:43,ko:'레이스',en:'Wraith',lv:48,hp:2350,acc:104}];
  assert.ok(routeCards([{...r,mobs}],'en','/zh').includes('href="/zh/monsters/43/"'));
  assert.ok(routeCards([{...r,mobs}],'ko').includes('href="/ko/monsters/43/"'));
  const titles=['25','26','27','28','33','34'].map(id=>read(`dist/ko/monsters/${id}/index.html`).match(/<title>(.*?)<\/title>/)[1]);
  assert.equal(new Set(titles).size,titles.length);
  // One sale among many asking prices must not set the headline.
  const ear=read('dist/ko/items/1032007-emerald-earrings/index.html');
  assert.ok(!/<p class="item-headline-label">[^<]*거래가/.test(ear));
  const home=read('dist/ko/index.html');
  assert.ok(home.includes('id="home-routes"')&&home.includes('route-sleepy2'));
  assert.ok(home.indexOf('home-tools')<home.indexOf('purposes-wrap'),'tools come before the site directory');
  assert.ok(read('dist/en/index.html').includes('DCInside: Global'));
  assert.ok(/\.item-grid \{ display: grid; grid-template-columns: minmax\(0,1\.2fr\)/.test(read('assets/style.css')));
  assert.ok(read('assets/style.css').includes('.item-page { display: grid; grid-template-columns: minmax(0, 1fr);'));
});

test('class training pages are indexable, unique and list each route once',()=>{
  const sitemap=read('dist/sitemap.xml');
  const slugs=['warrior','bowman','hunter','crossbowman','magician','fire-poison','ice-lightning','cleric','thief','assassin','bandit'];
  const titles=new Set();
  for(const lang of ['ko','en','zh','ja']) for(const slug of slugs){
    const html=read(`dist/${lang}/tools/training/class/${slug}/index.html`);
    assert.ok(!html.includes('content="noindex'),`${lang} ${slug} noindex`);
    assert.ok(sitemap.includes(`/${lang}/tools/training/class/${slug}/`),`${lang} ${slug} not in sitemap`);
    const title=html.match(/<title>([^<]*)<\/title>/)[1]; assert.ok(!titles.has(title),title); titles.add(title);
    const ids=[...html.matchAll(/id="route-([\w-]+)"/g)].map(m=>m[1]);
    assert.ok(ids.length>=10,`${lang} ${slug} has ${ids.length} routes`);
    assert.equal(new Set(ids).size,ids.length,`${lang} ${slug} repeats a route`);
  }
  assert.match(read('dist/ko/tools/training/class/ice-lightning/index.html'),/<title>글클메 썬콜 사냥터/);
  assert.ok(read('dist/ko/tools/training/index.html').includes('/ko/tools/training/class/fire-poison/'));
});

test('llms.txt and page hashes are published for AI assistants and IndexNow',()=>{
  const llms=read('dist/llms.txt');
  assert.match(llms,/^# GMS Hub/);
  assert.ok(llms.includes('/en/monsters/') && llms.includes('/ko/tools/training/class/'));
  const hashes=JSON.parse(read('dist/page-hashes.json'));
  assert.ok(hashes['/ko/'] && hashes['/en/tools/market/']);
  assert.ok(!Object.keys(hashes).some(p=>p.startsWith('/admin')),'noindex pages stay out');
});

test('monster drops get item database pages with droppers, farm maps and stats',()=>{
  const dir=new URL('dist/en/items/',root);
  const slugs=fs.readdirSync(dir).filter(n=>/^\d/.test(n));
  assert.ok(slugs.length>600,`only ${slugs.length} item pages`);
  const html=read('dist/en/items/1002003-red-headband/index.html');
  assert.match(html,/<title>Red Headband: Who Drops It, Stats &amp; Where to Farm/);
  assert.ok(html.includes('Dropped by')&&html.includes('farm-maps')&&html.includes('Weapon defense'));
  assert.ok(!html.includes('content="noindex'),'live-map drop should be indexable');
  assert.ok(read('dist/sitemap.xml').includes('/en/items/1002003-red-headband/'));
  // Map names are proper names: derived locales keep them as written instead of minting a translation key per map.
  assert.ok(read('dist/ja/items/1002003-red-headband/index.html').includes('translate="no"'));
  const ko=read('dist/ko/items/1002003-red-headband/index.html');
  assert.match(ko,/<title>글클메 빨간색 머리띠: 드롭 몬스터/);
});

test('map pages turn monster spawns around: monsters, spawn counts, full-clear EXP and drops',()=>{
  const html=read('dist/en/maps/10001081/index.html');
  assert.match(html,/<title>The Blue Mushroom Forest: MapleStory Classic World map/);
  for(const m of ['Blue Mushroom','Slime','Blue Snail','Red Snail']) assert.ok(html.includes(`>${m}</span>`),m);
  // 16×35 + 8×12 + 7×4 + 1×8 = 692
  assert.ok(html.includes('<dd>692</dd>'));
  assert.ok(read('dist/sitemap.xml').includes('/en/maps/10001081/'));
  assert.ok(read('dist/ko/monsters/7/index.html').includes('/ko/maps/10001081/'),'monster locations link to map pages');
  assert.match(read('dist/ko/maps/10001081/index.html'),/<title>글클메 파란버섯 숲/);
});
