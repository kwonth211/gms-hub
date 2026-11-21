import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { selectRoutes, routeCards, publicTrainingData, validateTraining } from '../assets/training-evidence.js';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p,root),'utf8');
const training = JSON.parse(read('data/training.json'));
const evidence = JSON.parse(read('data/editorial/korean-guides.json'));
const guides = JSON.parse(read('data/guides.json')).guides;
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});

test('consent initialization precedes both async Google tags and config on indexed and noindex pages', () => {
  for (const lang of ['ko','en','ja','zh']) {
    const html=read(`dist/${lang}/index.html`);
    const consent=html.indexOf("w.gtag('consent', 'default'");
    assert.ok(consent>0 && consent<html.indexOf('https://www.googletagmanager.com/gtag/js'));
    assert.ok(consent<html.indexOf("gtag('config','G-"));
    const ad=html.indexOf('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
    if(ad>=0)assert.ok(consent<ad);
    assert.equal((html.match(/gtag\('config','G-/g)||[]).length,1);
  }
});

test('home and market fetch the current collection-status module even for returning visitors', () => {
  for (const name of ['home.js','market.js']) {
    assert.match(read(`dist/assets/${name}`), /import '\.\/collection-status\.js\?v=[a-f0-9]{12}'/);
    assert.match(read(`dist/assets/${name}`), /from '\.\/[^']+\.js\?v=[a-f0-9]{12}'/);
  }
});

test('market discovery links reach item pages and compact price labels preserve the market workspace', () => {
  for (const lang of ['ko', 'en']) {
    const market = read(`dist/${lang}/tools/market/index.html`);
    const today = read(`dist/${lang}/tools/market/today/index.html`);
    assert.ok(!market.includes('id="market-radar"'));
    assert.match(market.split('class="wrap panel mb-snapshot"')[1], new RegExp(`href="/${lang}/items/`));
    assert.match(today, new RegExp(`href="/${lang}/items/`));
    assert.ok(!today.includes('#market-radar'));
    assert.ok(market.includes('id="mb-ad-mid"'));
  }
});

test('versioned product telemetry loads before all feature scripts in every locale', () => {
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    const html = read(`dist/${lang}/index.html`);
    const analytics = html.indexOf('/assets/analytics.js?v=');
    assert.ok(analytics > 0);
    assert.ok(analytics < html.indexOf('/assets/common.js?v='));
    assert.ok(analytics < html.indexOf('/assets/header-search.js?v='));
  }
  assert.ok(fs.existsSync(new URL('dist/assets/analytics.js', root)));
});

test('discovery shortcuts preserve locale, usable destinations and existing section order', () => {
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    const html = read(`dist/${lang}/index.html`);
    assert.ok(html.includes('href="#my-char"'));
    assert.ok(html.includes(`href="/${lang}/tools/market/?fav=1"`));
    assert.ok(html.includes(`href="/${lang}/tools/exp/"`));
    assert.ok(html.includes('/assets/feature-discovery.js?v='));
    assert.ok(html.indexOf('home-shortcuts') < html.indexOf('id="live-market"'));
    assert.ok(html.indexOf('id="live-market"') < html.indexOf('id="my-char"'));
  }
  for (const lang of ['ko', 'en']) {
    const fh = read(`dist/${lang}/forgotten-hollow/index.html`);
    const ids = [...fh.matchAll(/href="[^\"]*\/tools\/market\/\?item=(\d+)"[^>]*data-discover="hollow_drop"/g)].map(m => Number(m[1]));
    assert.ok(ids.length > 10);
    const published = new Set(JSON.parse(read('dist/assets/items.json')).map(r => r[0]));
    assert.ok(ids.every(id => published.has(id)), 'no dead item links');
    const html = read(`dist/${lang}/tools/training/index.html`);
    assert.match(html, /<summary>[\s\S]*?class="tr-measure"[^>]*route=[^\"]+&amp;|<summary>[\s\S]*?class="tr-measure"[^>]*route=/);
    assert.ok(html.includes('data-discover="training_exp"'));
  }
});

test('GA and Clarity exclude local/internal browsers without excluding ordinary visitors', () => {
  const html = read('dist/ko/index.html');
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const ga = scripts.find(s => s.includes('var gmsInternal='));
  const consent = scripts.find(s => s.includes("w.gtag('consent', 'default'"));
  const clarity = scripts.find(s => s.includes('https://www.clarity.ms/tag/'));
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'gms-hub.com']) {
    for (const flag of ['', '1']) {
      const scheduled = [], events = [];
      const ctx = { location: { hostname, search: '' }, localStorage: { getItem: () => flag },
        document: {}, addEventListener: (...args) => scheduled.push(args), window: { dataLayer: { push: x => events.push(Array.from(x)) } } };
      ctx.dataLayer = ctx.window.dataLayer;
      vm.runInNewContext(consent, ctx);
      ctx.gtag = ctx.window.gtag;
      vm.runInNewContext(ga, ctx);
      ctx.window.gmsInternal = ctx.gmsInternal;
      vm.runInNewContext(clarity, ctx);
      const internal = hostname !== 'gms-hub.com' || flag === '1';
      assert.equal(events.at(-1)[2].traffic_type === 'internal', internal);
      assert.equal(scheduled.length, internal ? 0 : 1);
    }
  }
  // Clarity remains safe if GA is disabled or storage is blocked.
  const scheduled = [];
  vm.runInNewContext(clarity, { window: {}, document: {}, location: { hostname: 'gms-hub.com', search: '?internal=1' },
    localStorage: { getItem() { throw Error('blocked'); } }, addEventListener: (...args) => scheduled.push(args) });
  assert.equal(scheduled.length, 0);
});

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
  // Sources cited by a rate (EXP/mesos an hour) are shown on purpose: public videos and posts, by name, link and date.
  const cited=new Set(training.routes.flatMap(r=>(r.rates||[]).map(x=>x.src)));
  const citedSources=evidence.sources.filter(s=>cited.has(s.id));
  for(const html0 of pages){
    let html=html0; for(const s of citedSources) html=html.split(s.url).join('').split(s.author).join('');
    assert.ok(!/youtube\.com|youtu\.be|reddit\.com|참고한 자료|Original account ↗/.test(html));
    for(const s of evidence.sources) if(!cited.has(s.id)) assert.ok(!html.includes(s.author),s.author);
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
    assert.match(html,/\["[^"]*training\.js[^"]*",1\]/); // loaded as a module by the after-paint loader (build.mjs lateScripts)
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
  assert.ok(html.includes('id="route-wraith"')&&/필요 명중 <\/span>104/.test(html));
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
  assert.ok(home.indexOf('home-tools')<home.indexOf('data-dir-link'),'tools come before the link to the site directory');
  // The site directory has its own page since 2026-11-15, out of search; the home keeps the site list for its search box.
  const sitesPage=read('dist/ko/sites/index.html');
  assert.ok(sitesPage.includes('<meta name="robots" content="noindex">')&&sitesPage.includes('purposes-wrap')&&sitesPage.includes('class="site-card"'));
  assert.ok(!read('dist/sitemap.xml').includes('/sites/'));
  assert.ok(home.includes('id="home-sites"')&&!home.includes('class="site-card"'));
  assert.ok(read('dist/en/sites/index.html').includes('DCInside: Global'));
  assert.ok(/\.item-grid \{ display: grid; grid-template-columns: minmax\(0,1\.2fr\)/.test(read('assets/style.css')));
  assert.ok(read('assets/style.css').includes('.item-page { display: grid; grid-template-columns: minmax(0, 1fr);'));
});

test('class training pages are indexable, unique and list each route once',()=>{
  const sitemap=read('dist/sitemap.xml');
  const slugs=['warrior','bowman','hunter','crossbowman','magician','fire-poison','ice-lightning','cleric','thief','assassin','bandit'];
  const titles=new Set();
  for(const lang of ['ko','en','zh','ja']) for(const slug of slugs){
    const html=read(`dist/${lang}/tools/training/class/${slug}/index.html`);
    // zh/ja are machine-translated and noindex since 2026-11-15 (AdSense review); ko/en stay in search.
    const indexed=lang==='ko'||lang==='en';
    assert.equal(!html.includes('content="noindex'),indexed,`${lang} ${slug} noindex`);
    assert.equal(sitemap.includes(`/${lang}/tools/training/class/${slug}/`),indexed,`${lang} ${slug} sitemap`);
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
  // The title leads with the price once someone lists it, else with who drops it; either is right (live data in CI).
  assert.match(html,/<title>Red Headband(: Who Drops It, Stats &amp; Where to Farm| Price: )/);
  assert.ok(html.includes('Dropped by')&&html.includes('farm-maps')&&html.includes('Weapon defense'));
  // Item pages stay for visitors but only data/item-index-keep.json items are in search (2026-11-15).
  const keep=new Set(JSON.parse(fs.readFileSync(new URL('data/item-index-keep.json',root),'utf8')).ids);
  assert.equal(!html.includes('content="noindex'),keep.has(1002003));
  assert.equal(read('dist/sitemap.xml').includes('/en/items/1002003-red-headband/'),keep.has(1002003));
  const sm=read('dist/sitemap.xml'), inSm=(sm.match(/<loc>[^<]*\/en\/items\/\d+-/g)||[]).length;
  assert.ok(inSm<=keep.size,`sitemap lists ${inSm} English item pages`);
  // Map names are proper names: derived locales keep them as written instead of minting a translation key per map.
  assert.ok(read('dist/ja/items/1002003-red-headband/index.html').includes('translate="no"'));
  const ko=read('dist/ko/items/1002003-red-headband/index.html');
  // Same as the English title: a live listing in CI puts the price first.
  assert.match(ko,/<title>[^<]*빨간색 머리띠[^<]*(드롭 몬스터|시세|메소)/);
});

test('map pages turn monster spawns around: monsters, spawn counts, full-clear EXP and drops',()=>{
  const html=read('dist/en/maps/10001081/index.html');
  assert.match(html,/<title>The Blue Mushroom Forest: MapleStory Classic World map/);
  for(const m of ['Blue Mushroom','Slime','Blue Snail','Red Snail']) assert.ok(html.includes(`>${m}</span>`),m);
  // 16×35 + 8×12 + 7×4 + 1×8 = 692
  assert.ok(html.includes('<dd>692</dd>'));
  // Map pages are noindex templates since 2026-11-15; only the map list is in the sitemap.
  assert.ok(!read('dist/sitemap.xml').includes('/en/maps/10001081/') && read('dist/sitemap.xml').includes('/en/maps/'));
  assert.ok(read('dist/ko/monsters/7/index.html').includes('/ko/maps/10001081/'),'monster locations link to map pages');
  assert.match(read('dist/ko/maps/10001081/index.html'),/<title>글클메 파란버섯 숲/);
});

test('bare quest pages are gone: old URLs forward to the guide or the quest list, and only guides are linked',()=>{
  const guided=read('dist/en/quests/10104/index.html'), bare=read('dist/en/quests/1001/index.html');
  // a forward to a guide passes its search ranking on (no noindex); a forward to the plain list stays noindex
  assert.doesNotMatch(guided,/noindex/); assert.match(guided,/rel="canonical" href="https:\/\/gms-hub\.com\/en\/quests\/pia\/"/); assert.match(guided,/location\.replace\("\/en\/quests\/pia\/"\)/);
  assert.match(bare,/noindex/); assert.match(bare,/location\.replace\("\/en\/quests\/"\)/);
  const sm=read('dist/sitemap.xml');
  assert.ok(!/\/quests\/\d+\//.test(sm),'no per-quest URLs in the sitemap');
  const idx=read('dist/en/quests/index.html');
  assert.ok(!/href="\/en\/quests\/\d+\/"/.test(idx)); assert.ok(idx.includes('href="/en/quests/pia/"'));
});
test('bosses page lists every field boss with its spawn map and says respawn times are not in the data',()=>{
  const en=read('dist/en/bosses/index.html'), ko=read('dist/ko/bosses/index.html');
  for (const name of ['Mano','Stumpy','Mushmom','Jr. Balrog']) assert.match(en,new RegExp(`<strong>${name.replace('.','\\.')}</strong>`));
  assert.match(en,/href="\/en\/maps\/10000013\/">Thicket Around the Beach III<\/a>/);
  assert.match(en,/no respawn timer/);
  assert.match(ko,/<strong>마노<\/strong><small>Mano<\/small>/);
  assert.match(read('dist/sitemap.xml'),/\/en\/bosses\//);
});
test('every home uses the Korean section order: live market, my character, tools, guides, then the site directory link',()=>{
  const en=read('dist/en/index.html'), ko=read('dist/ko/index.html');
  for (const h of [en,ko]) {
    const at=(m)=>h.indexOf(m);
    assert.ok(at('id="live-market"')<at('id="my-char"')&&at('id="my-char"')<at('home-tools')&&at('home-tools')<at('data-dir-link'));
  }
  assert.match(en,/<title>GMS Hub: MapleStory Classic World \(MSCW\) Drops/);
});
test('equipment finder lists obtainable gear per class with stats and where to get it',()=>{
  const w=read('dist/en/equipment/warrior/index.html');
  assert.match(w,/<title>MapleStory Classic World Warrior Equipment/);
  assert.match(w,/data-lv="\d+" data-sub="One-Handed Sword"/);
  assert.match(w,/class="eq-from"><a class="eq-mob" href="\/en\/monsters\/\d+\/"[^>]*><img class="mob-sprite"/);
  assert.match(read('dist/ko/equipment/index.html'),/모든 직업 공용 장비/);
  assert.match(read('dist/sitemap.xml'),/\/en\/equipment\/thief\//);
});
test('best EXP quests rank quest rewards per level band without repeatables or replacement characters',()=>{
  const html=read('dist/en/quests/best-exp/index.html');
  assert.match(html,/<h2>Level 11–20( <small[^>]*>[^<]*<\/small>)?<\/h2>/);
  assert.ok(!html.includes('�'));
  assert.match(read('dist/en/quests/index.html'),/href="\/en\/quests\/best-exp\/"/);
});
test('odds page opens with a drop finder and the scroll calculator offers real scrolls with live prices',()=>{
  const drop=read('dist/ko/tools/drop-rate/index.html');
  assert.ok(drop.indexOf('id="drop-finder"')<drop.indexOf('id="drop-form"'));
  const idx=JSON.parse(drop.match(/<script id="drop-index" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.ok(idx.items.length>300&&idx.mobs.length>40);
  const sc=read('dist/en/tools/scroll/index.html');
  assert.match(sc,/<select name="family">/);
  const data=JSON.parse(sc.match(/<script id="scroll-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const gloves=data.families.find(([n])=>n==='Gloves Attack');
  assert.equal(gloves[1],'standard');
  assert.equal(data.families.find(([n])=>n==='Wand Magic Attack')[1],'magic-weapon');
  assert.equal(data.families.find(([n])=>n==='Claw Attack')[1],'weapon');
});
test('every page loads the item hover card and its data covers equipment, scrolls and drops',()=>{
  assert.match(read('dist/ko/monsters/30/index.html'),/assets\/item-tip\.js/);
  const tips=JSON.parse(read('dist/assets/item-tips.json'));
  const weapon=Object.values(tips.items).find(t=>t[2]==='Equip'&&t[7].PAD>0&&t[4]>0&&t[11].length);
  assert.ok(weapon,'an equipment entry with attack, level and droppers');
  const gloves=tips.items['2040801'];
  assert.deepEqual(gloves[10],[2,60,0]);
  assert.ok(gloves[11].every((id)=>tips.mobs[id]),'droppers are monster ids with their own card');
  const boar=tips.mobs['30'];
  assert.equal(boar[1],'Fire Boar'); assert.equal(boar[2],32); assert.match(boar[5],/I3/); assert.ok(boar[9].length>0);
});
test('my-shop was folded into the scan page: old links redirect there and nothing links to it any more',()=>{
  for (const lang of ['ko','en']) {
    const stub=read(`dist/${lang}/tools/my-shop/index.html`);
    assert.match(stub,/name="robots" content="noindex"/); assert.match(stub,new RegExp(`url=https://gms-hub.com/${lang}/tools/scan/`));
  }
  for (const f of ['dist/ko/index.html','dist/ko/tools/market/index.html','dist/ko/tools/scan/index.html','dist/en/index.html']) assert.doesNotMatch(read(f),/tools\/my-shop\//);
  assert.doesNotMatch(read('dist/sitemap.xml'),/\/tools\/my-shop\//);
});

test('root and localized share cards resolve to current, correctly sized artwork in every language', () => {
  for (const lang of ['ko', 'en', 'zh', 'ja']) {
    for (const page of [`${lang}/index.html`, `${lang}/tools/market/index.html`, ...(lang === 'en' ? ['index.html'] : [])]) {
      const html = read(`dist/${page}`);
      const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
      assert.ok(og, `${page}: missing share image`);
      // The market page carries its own card in ko and en (scripts/og.mjs PAGE_CARDS); zh/ja keep the general one.
      const card = page.includes('/tools/market/') && (lang === 'ko' || lang === 'en') ? `market-${lang}` : `autumn-${lang}`;
      assert.match(og, new RegExp(`/og-${card}-[a-f0-9]{12}\\.png$`), page);
      assert.equal(/<meta name="twitter:image" content="([^"]+)"/.exec(html)?.[1], og, page);
      assert.match(html, /<meta property="og:image:alt" content="[^"]+">/);
      const png = fs.readFileSync(new URL(`../dist${new URL(og).pathname}`, import.meta.url));
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
    }
  }
});

test('header Discord icon opens the Discord page, not the invite (owner request)', () => {
  for (const lang of ['ko', 'en']) {
    const html = read(`dist/${lang}/index.html`);
    const a = html.match(/<a class="theme-toggle discord-link" href="([^"]+)"/);
    assert.ok(a && a[1].endsWith(`/${lang}/discord-bot/`), `${lang} header discord link: ${a && a[1]}`);
  }
});

test('the More menu links the site directory (owner request)', () => {
  for (const lang of ['ko', 'en']) assert.ok(read(`dist/${lang}/index.html`).match(/class="more-menu"[\s\S]*?href="\/[a-z]{2}\/sites\/"/), `${lang} more menu lacks /sites/`);
});
