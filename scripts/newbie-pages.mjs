// Newbie guide: /guides/newbie/ (hub) and /guides/newbie/<slug>/ (owner, 2026-11-18: "가이드 > 뉴비가이드 > 페이지들").
// Every line here must rest on verified data: the game client data, numbers the site already publishes, or usage read
// from the saved community posts (2026-11-14 scrape, 17,843 posts and comments). A term whose meaning could not be read
// from real usage is left out. The word 쌀먹 stays out of page text (owner).
//
// A page is { slug, updated, ko: { title, h1, desc, lead }, en: {...}, groups | body }. The glossary is data so the page,
// its table of contents and its DefinedTermSet structured data all come from one list.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const NEWBIE_HUB = {
  ko: {
    title: '글클메 뉴비 가이드: 처음 시작할 때 막히는 것 모음 | GMS Hub',
    h1: '글클메 뉴비 가이드',
    nav: '뉴비 가이드',
    desc: '글로벌 메이플스토리 클래식 월드를 처음 시작한 뉴비가 가장 많이 찾는 것만 모았어요. 고확·자시·떡작 같은 용어 뜻부터 직업 고르기, 초반 육성, 커닝 파퀘, 2차 전직까지 순서대로 볼 수 있어요.',
    lead: '처음 30레벨까지 메소가 어디서 새고, 어떤 퀘스트로 벌고, 몇 레벨에 어디서 사냥하는지 숫자로 정리했어요. 회복량·퀘스트 보상·몬스터 능력치는 게임 데이터, 아이템 값은 자유시장 실제 시세예요.',
    newTitle: '용어가 막힐 때',
    pathTitle: '시작부터 2차 전직까지, 읽는 순서',
    toolsTitle: '같이 쓰면 좋은 도구'
  },
  en: {
    title: 'MapleStory Classic World Beginner Guide for New Players | GMS Hub',
    h1: 'Classic World beginner guide',
    nav: 'Beginner guide',
    desc: 'What new MapleStory Classic World players look up most, in order: trade and megaphone shorthand, picking a job, early levelling, Kerning Party Quest and the 2nd job advancement.',
    lead: 'Your first 30 levels in numbers: where the mesos go, which quests pay, and where to train at each level. Recovery, quest rewards and monster stats are the game data; item values are real Free Market prices.',
    newTitle: 'When the shorthand gets you',
    pathTitle: 'From day one to 2nd job: reading order',
    toolsTitle: 'Tools that go with it'
  }
};

// Reading order on the hub: existing guides by slug (shown only when that language has the guide).
export const NEWBIE_PATH = ['getting-started', 'choose-your-job', 'leveling-1-30', 'best-early-quests', 'kerning-party-quest', 'second-job', 'trading-and-mesos', 'citizenship-and-housing'];

// Glossary groups. `to` is a site path the term links to. Sources per group are noted for whoever edits this next.
const GLOSSARY_KO = [
  { id: 'trade', title: '거래할 때 쓰는 말', lead: '확성기와 자유시장에서 가장 자주 보는 말이에요.', terms: [
    // megaphone colours and FM usage: megaphone page; 자시/노점/ㅍㅍ/정옵/N상/엄거래/마통: community posts.
    ['고확', '고성능 확성기를 줄인 말이에요. 모든 채널에 보이는 확성기라서 물건을 팔거나 구할 때 많이 써요.', '/megaphone/'],
    ['자시', '자유시장이에요. 유저들이 상점을 열어 물건을 파는 곳이에요.', '/tools/market/'],
    ['노점', '자유시장에 여는 개인 상점이에요.'],
    ['ㅍㅍ', '"팝니다"예요. 글 끝에 붙여서 판다는 뜻으로 써요.'],
    ['S> · WTS', '팝니다. 확성기에서는 영어 약어로 써요.'],
    ['B> · WTB', '삽니다.'],
    ['T>', '교환해요.'],
    ['C/O', '지금까지 들어온 최고 제시가예요.'],
    ['B/O · A/W', '이 값이면 바로 팔겠다는 가격(즉구가)이에요.'],
    ['OBO', '더 좋은 제안이면 협상할 수 있다는 뜻이에요.'],
    ['ea', '개당 가격이에요.'],
    ['PM me · W me', '귓말 달라는 뜻이에요.'],
    ['FM · cc', '자유시장 · 채널 이동이에요.'],
    ['100k · 1.5m · 1b', '10만 · 150만 · 10억 메소예요. k는 천, m은 백만, b는 십억이에요.'],
    ['정옵', '능력치가 기본값 그대로인 장비예요.'],
    ['N상 · N하', '능력치가 기본값보다 N만큼 높거나 낮은 장비예요. "공 2상"은 공격력이 기본보다 2 높다는 뜻이에요.'],
    ['엄거래', '현금 거래를 돌려 말하는 표현이에요. 운영 정책 위반이라 계정 정지 사유예요.'],
    ['마통', '제재로 메소를 회수당해 가진 메소가 마이너스가 된 상태예요. "마이너스 통장"에서 온 말이에요.']
  ] },
  { id: 'scroll', title: '주문서와 장비에 쓰는 말', lead: '장비 거래 글은 이 말만 알면 거의 다 읽혀요.', terms: [
    // scroll tiers and rates: data/scrolls.json; shorthand rule: assets/search-index.js; usage: community posts.
    ['작', '주문서를 발라서 장비를 강화하는 것이에요.', '/tools/forge/'],
    ['노작', '주문서를 한 번도 바르지 않은 장비예요. 확성기에서는 clean이라고 써요.'],
    ['떡작', '성공 확률 100%인 하급 주문서만 발라서 채운 작이에요.'],
    ['완작', '업그레이드 횟수를 전부 성공으로 채운 작이에요.'],
    ['직작', '완성된 장비를 사지 않고 직접 주문서를 바르는 것이에요.'],
    ['N작', '주문서가 N번 붙은 장비예요. "7작"은 일곱 번 성공했다는 뜻이에요.'],
    ['N제', '착용 레벨이 N인 장비예요. "35제"는 35레벨부터 낄 수 있는 장비예요.'],
    ['업횟', '업그레이드 가능 횟수예요. 확성기에서는 slots라고 써요.'],
    ['혼줌', '혼돈의 주문서예요. 성공 확률은 10%예요.', '/tools/scroll/'],
    ['장공 · 귀힘 · 신이속', '주문서를 "부위 + 능력치"로 줄인 말이에요. 장갑 공격력, 귀고리 힘, 신발 이동속도 주문서예요. 뒤에 확률을 붙여 "장공 60%"처럼 써요.', '/tools/scroll/'],
    ['전힘 · 망럭 · 단공 · 스마', '같은 방식이에요. 전신 갑옷 힘, 망토 행운, 단검 공격력, 스태프 마력 주문서예요.'],
    ['노목 · 공노목', '노가다 목장갑, 그리고 공격력 주문서를 바른 노가다 목장갑이에요.'],
    ['스초', '스킬 초기화예요.', '/skills/']
  ] },
  { id: 'hunt', title: '사냥과 파티에 쓰는 말', lead: '사냥터에서 다른 유저와 부딪치지 않으려면 알아야 하는 말이에요.', terms: [
    // party-quest terms: our Kerning PQ guide and training routes; the rest: community posts.
    ['젠', '잡은 몬스터가 다시 나오는 것이에요.'],
    ['자리', '한 사람이나 한 파티가 맡아서 사냥하는 구역이에요.'],
    ['겹사', '다른 사람이 사냥하고 있는 자리에 들어가 겹쳐서 사냥하는 것이에요. 다툼이 가장 많이 나는 일이에요.'],
    ['낚시 자리', '한곳에 서서 다가오는 몬스터만 잡는 자리예요. 원거리 직업이 많이 써요.'],
    ['몸박', '몬스터 몸에 닿아서 입는 피해예요.'],
    ['원킬 · 2킬', '한 방 · 두 방에 잡는다는 뜻이에요. 파티 모집에서 "2킬이면 받아요"처럼 써요.', '/tools/damage/'],
    ['솔플 · 파사', '혼자 하는 사냥 · 파티 사냥이에요.'],
    ['커파', '커닝시티 파티퀘스트예요.', '/guides/kerning-party-quest/'],
    ['러시', '커파를 빠르게 반복해서 경험치와 보상을 모으는 방식이에요.', '/guides/kerning-party-quest/'],
    ['보너스팟', '커파 마지막 보너스 맵에서 구역을 나눠 사냥하는 파티예요.', '/guides/kerning-party-quest/'],
    ['악어팟', '커파 1단계를 깨지 않고, 계속 나오는 리게이터만 잡는 파티예요.', '/tools/training/'],
    ['콜팟', '콜드아이를 잡는 파티예요. "또 다른 길" 맵에서 많이 모여요.', '/tools/training/'],
    ['거탐', '거짓말 탐지기예요. 사람이 직접 플레이하고 있는지 확인하는 검사예요.'],
    ['동꼽', '키보드에 동전 같은 것을 끼워 키를 눌러 둔 채 자리를 비우는 것이에요. 매크로와 똑같이 제재 대상이에요.']
  ] },
  { id: 'job', title: '직업 줄임말', lead: '사냥터 추천 글과 파티 모집에서 직업은 거의 줄여서 불러요.', terms: [
    // matches the class guides on this site.
    ['표도', '표창을 쓰는 도적, 어쌔신이에요.', '/guides/assassin/'],
    ['단도', '단검을 쓰는 도적, 시프예요.', '/guides/bandit/'],
    ['불독', '불·독 마법사(위자드)예요.', '/guides/fire-poison/'],
    ['썬콜', '썬더·콜드 마법사(위자드)예요.', '/guides/ice-lightning/'],
    ['클레', '클레릭이에요.', '/guides/cleric/'],
    ['창맨', '스피어맨이에요.', '/guides/spearman/']
  ] },
  { id: 'place', title: '사냥터 줄임말', lead: '맵 이름이 길어서 대부분 두세 글자로 줄여요.', terms: [
    // full names: data/training.json; short forms: community posts.
    ['헤네', '헤네시스예요.'],
    ['원숲', '원숭이숲이에요.', '/tools/training/'],
    ['원늪', '원숭이 늪이에요.'],
    ['커즈굴', '커즈아이를 파티로 잡는 굴 사냥터예요.', '/tools/training/'],
    ['위골', '위험한 골짜기예요. 드레이크가 나와요.', '/tools/training/'],
    ['와보땅', '와일드보어의 땅이에요.', '/tools/training/'],
    ['불땅', '불타버린 땅이에요. 뒤에 숫자를 붙여 "불땅2"처럼 불러요.', '/tools/training/'],
    ['동바산 · 서바산', '동쪽바위산 · 서쪽바위산이에요.'],
    ['일비 · 뇌전', '사냥터는 아니고 표창 이름이에요. 일비 표창, 뇌전 수리검을 줄인 말이에요.', '/tools/market/']
  ] }
];

const GLOSSARY_EN = [
  { id: 'trade', title: 'Megaphone and trade shorthand', lead: 'Know these and you can read nearly every trade megaphone.', terms: [
    ['S> · WTS', 'Selling.', '/megaphone/'],
    ['B> · WTB', 'Buying.'],
    ['T>', 'Trading.'],
    ['C/O', 'Current offer: the best offer so far.'],
    ['B/O · A/W', 'Buyout / auto-win: it sells at once for this price.'],
    ['OBO', 'Or best offer.'],
    ['ea', 'Each: the price per item.'],
    ['PM me · W me', 'Whisper me.'],
    ['FM · cc', 'Free Market · change channel.', '/tools/market/'],
    ['100k · 1.5m · 1b', '100,000 · 1,500,000 · 1,000,000,000 mesos.'],
    ['clean', 'Gear that has never been scrolled.'],
    ['7 slots', 'Seven upgrades left on the item.']
  ] },
  { id: 'scroll', title: 'Scroll tiers', lead: 'Scroll names end with their tier, and the tier sets the success rate.', terms: [
    ['Lesser', 'Succeeds 100% of the time.', '/tools/scroll/'],
    ['Intermediate', 'Succeeds 60% of the time.', '/tools/scroll/'],
    ['Greater', 'Succeeds 10% of the time.', '/tools/scroll/'],
    ['Chaos', 'Succeeds 10% of the time.', '/tools/scroll/']
  ] }
];

export const NEWBIE_PAGES = [
  {
    slug: 'glossary', icon: 'book', updated: '2026-11-18',
    ko: {
      title: '글클메 용어 사전: 고확 뜻·떡작 뜻·자시·커파·마통 정리 | GMS Hub',
      h1: '글클메 용어 사전',
      nav: '용어 사전',
      desc: '메이플 클래식 월드(글클메·글메) 용어 뜻을 한 번에 정리했어요. 고확, 자시, 장공, 떡작, 노작, 정옵, 커파, 보너스팟, 겹사, 마통, 거탐, 표도·불독·썬콜까지 줄임말 60여 개를 거래·주문서·사냥·직업·사냥터로 나눠 설명해요.',
      lead: '확성기와 커뮤니티 글에 나오는 줄임말을 뜻과 함께 모았어요. 거래, 주문서, 사냥, 직업, 사냥터 순서로 나눴고, 관련 페이지가 있으면 바로 이어져요.',
      card: '고확, 자시, 떡작, 커파, 마통… 줄임말 60여 개의 뜻',
      term: '말', meaning: '뜻', more: '자세히',
      groups: GLOSSARY_KO
    },
    en: {
      title: 'MapleStory Classic World Glossary: Megaphone & Trade Shorthand | GMS Hub',
      h1: 'Classic World glossary',
      nav: 'Glossary',
      desc: 'What MapleStory Classic World megaphone and trade shorthand means: S>, B>, WTS, WTB, C/O, B/O, A/W, OBO, ea, clean, slots, FM and cc, plus the four scroll tiers and their success rates.',
      lead: 'The shorthand you will see in megaphones and trade chat, with what each one means and the page that goes with it.',
      card: 'S>, B>, C/O, A/W, clean, slots: megaphone shorthand explained',
      term: 'Written', meaning: 'Meaning', more: 'More',
      groups: GLOSSARY_EN
    }
  }
];

export const newbiePath = (p) => `/guides/newbie/${p.slug}/`;
export const newbieTermCount = (p, lang) => (p[lang].groups || []).reduce((a, g) => a + g.terms.length, 0);

export function newbieHubBody({ lang, link, guides, guideHref, roadmap = '' }) {
  const t = NEWBIE_HUB[lang], ko = lang === 'ko';
  const cards = NEWBIE_PAGES.map((p) => `<li><a href="${link(newbiePath(p))}"><strong>${esc(p[lang].h1)}</strong></a><p>${esc(p[lang].card)}</p></li>`).join('');
  const steps = NEWBIE_PATH.map((slug) => guides.find((g) => g.slug === slug && g.lang === lang)).filter(Boolean)
    .map((g) => `<li><a href="${guideHref(g)}"><strong>${esc(g.h1)}</strong></a><p>${esc(g.desc)}</p></li>`).join('');
  const tools = [
    ['/tools/training/', ko ? '사냥터 추천' : 'Training spots', ko ? '레벨과 직업을 넣으면 갈 만한 사냥터가 나와요.' : 'Enter your level and job to see where to train.'],
    ['/skills/', ko ? '스킬트리 정석' : 'Skill builds', ko ? '직업마다 스킬 찍는 순서를 보여 줘요.' : 'The standard SP order for every job.'],
    ['/quests/', ko ? '퀘스트 정리' : 'Quests', ko ? '레벨별 퀘스트와 보상, 필요한 아이템이에요.' : 'Every quest by level, with rewards and what it asks for.'],
    ['/tools/market/', ko ? '실시간 시세' : 'Live market prices', ko ? '아이템이 지금 얼마에 팔리는지 볼 수 있어요.' : 'What items sell for right now.']
  ].map(([p, name, d]) => `<li><a href="${link(p)}"><strong>${name}</strong></a><p>${d}</p></li>`).join('');
  return `<article class="wrap prose newbie">
<p class="crumbs"><a href="${link('/guides/')}">${ko ? '가이드' : 'Guides'}</a></p>
<h1>${esc(t.h1)}</h1>
<p>${esc(t.lead)}</p>
${roadmap}
<h2>${esc(t.newTitle)}</h2>
<ul class="guide-list">${cards}</ul>
${steps ? `<h2>${esc(t.pathTitle)}</h2><ol class="guide-list newbie-steps">${steps}</ol>` : ''}
<h2>${esc(t.toolsTitle)}</h2>
<ul class="guide-list">${tools}</ul>
</article>`;
}

export function newbiePageBody({ lang, page, link }) {
  const t = page[lang], ko = lang === 'ko';
  const toc = t.groups.map((g) => `<a class="band-link" href="#${g.id}">${esc(g.title)}</a>`).join('');
  const sections = t.groups.map((g) => `<section id="${g.id}"><h2>${esc(g.title)}</h2><p>${esc(g.lead)}</p>
<div class="table-wrap"><table class="data newbie-terms"><thead><tr><th scope="col">${t.term}</th><th scope="col">${t.meaning}</th></tr></thead><tbody>${g.terms
    .map(([term, def, to]) => `<tr><th scope="row" translate="no">${esc(term)}</th><td>${esc(def)}${to ? ` <a class="newbie-more" href="${link(to)}">${t.more} →</a>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`).join('\n');
  return `<article class="wrap prose newbie">
<p class="crumbs"><a href="${link('/guides/')}">${ko ? '가이드' : 'Guides'}</a> › <a href="${link('/guides/newbie/')}">${esc(NEWBIE_HUB[lang].nav)}</a></p>
<h1>${esc(t.h1)}</h1>
<p>${esc(t.lead)}</p>
<nav class="band-nav newbie-toc" aria-label="${ko ? '목차' : 'Contents'}"><div>${toc}</div></nav>
${sections}
<p class="newbie-next"><a href="${link('/guides/newbie/')}">${ko ? '뉴비 가이드 전체 보기' : 'All beginner guide pages'} →</a></p>
</article>`;
}

// DefinedTermSet for the glossary: search engines can show a term's meaning directly.
export function newbieTermsLd({ lang, page, url }) {
  const t = page[lang];
  return {
    '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: t.h1, url, inLanguage: lang,
    hasDefinedTerm: t.groups.flatMap((g) => g.terms.map(([term, def]) => ({ '@type': 'DefinedTerm', name: term, description: def })))
  };
}

// ---------- Hub roadmap (owner 2026-11-18: "물약 챙기세요 말고 구체적인 수치, 이미지") ----------
// Numbers: recovery, quest requirements and rewards from the game client (data/quests-raw.json, maplestory.io item
// data); monster level/HP/EXP from data/monsters.json; Free Market prices from data/item-prices.json (refreshed on every
// deploy); NPC shop prices of Meat (80) and Lemon (150), damage taken, EXP per 5 minutes and party shorthand from
// Korean beginner videos (2026-10/11). No source names on the page (owner rule).
const icon = (id, size = 32) => `<img class="nb-ico" src="https://maplestory.io/api/MCW/1.2/item/${id}/icon" width="${size}" height="${size}" alt="" loading="lazy">`;
export function newbieRoadmap({ lang, link, asset, items, mobs, prices, pricesAt }) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const nf = (n) => Number(n).toLocaleString(ko ? 'ko-KR' : 'en-US');
  const name = (id) => { const it = items.get(id); return it ? (ko && it.ko ? it.ko : it.en) : String(id); };
  const mname = (id) => { const m = mobs.get(id); return m ? (ko && m.ko ? m.ko : m.en) : String(id); };
  const meso = (n) => (ko ? (n >= 10000 ? `${+(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만` : nf(n)) : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : nf(n));
  const price = (id) => prices?.[id]?.median || null;
  const priceTag = (id) => (price(id) ? `<span class="nb-price">${tr('시세', 'market')} ${meso(price(id))}</span>` : '');
  const sprite = (id) => `<img class="nb-mob" src="${asset(`/assets/monsters/${id}.gif`)}" alt="" loading="lazy">`;
  const day = String(pricesAt || '').slice(0, 10);
  const mobCard = (id, note) => { const m = mobs.get(id); if (!m) return ''; return `<li><a href="${link(`/monsters/${id}/`)}">${sprite(id)}<span><strong>${esc(mname(id))}</strong><small>Lv ${m.lv} · HP ${nf(m.hp)} · EXP ${nf(m.exp)}</small>${note ? `<em>${note}</em>` : ''}</span></a></li>`; };

  // 1. Where the mesos go
  const heal = [
    [2010003, tr('짐승의 고기', 'Meat'), 'HP 160', 80, '0.5', tr('HP 1당 0.5메소', '0.5 meso per HP')],
    [2010005, tr('레몬', 'Lemon'), 'MP 150', 150, '1', tr('MP 1당 1메소', '1 meso per MP')],
    [2000000, name(2000000), 'HP 100', null],
    [2000001, name(2000001), 'HP 250', null],
    [2000002, name(2000002), 'HP 500', null],
    [2000003, name(2000003), 'MP 200', null],
    [2000004, name(2000004), tr('HP·MP 35%', 'HP and MP 35%'), null],
    [2000006, name(2000006), 'MP 50%', null]
  ];
  const healRows = heal.map(([id, n, eff, shop, , per]) => `<tr><th scope="row">${icon(id, 28)}<span>${esc(n)}</span></th><td class="num">${eff}</td><td class="num">${shop ? `${nf(shop)}${tr('메소', '')}${per ? `<small>${per}</small>` : ''}` : '—'}</td><td class="num">${price(id) ? meso(price(id)) : '—'}</td></tr>`).join('');

  // 2. Quests by level (client data)
  const quest = (lv, title, href, need, reward, ids, extra = '') => `<li class="nb-q"><span class="nb-lv">Lv ${lv}</span><div><h3>${href ? `<a href="${link(href)}">${title}</a>` : title}</h3><p class="nb-need">${need}</p><p class="nb-rew">${ids.map((id) => icon(id, 28)).join('')}<span>${reward}</span></p>${extra}</div></li>`;
  const quests = [
    quest(16, tr('피아와 파란 버섯', 'Pia and the Blue Mushroom'), '/quests/pia/',
      tr('헤네시스 공원 피아에게 초록버섯의 갓 20개, 파란 버섯의 갓 20개를 가져가요.', 'Bring Pia in the Henesys park 20 Green Mushroom Caps and 20 Blue Mushroom Caps.'),
      tr(`모자 명중 주문서 하·중·상급 중 1장, 경험치 813, 메소 497. 중급이 나오면 시세 ${price(2040001) ? meso(price(2040001)) : '—'}이에요.`, `One Hat Accuracy scroll (lesser, intermediate or greater), 813 EXP, 497 mesos. An intermediate sells for ${price(2040001) ? meso(price(2040001)) : '—'}.`), [2040001]),
    quest(18, tr('알렉스의 부탁', "Alex's Request"), null,
      tr('커닝시티 알렉스에게 말을 걸면 바로 끝나요.', 'Talk to Alex in Kerning City; it completes on the spot.'),
      tr('짐승의 고기 5개, 경험치 819, 메소 409. 뒤로 이어지는 퀘스트가 있어요.', '5 Meat, 819 EXP, 409 mesos, and it opens a quest line.'), [2010003]),
    quest(20, tr('제인과 버섯', 'Jane and the Mushroom'), null,
      tr('리스항구 제인. 파란 버섯과 뿔버섯을 30마리씩 잡고, 파란 버섯의 갓·뿔버섯의 갓을 15개씩 가져가요.', 'Jane in Lith Harbor: defeat 30 Blue Mushrooms and 30 Horny Mushrooms and bring 15 caps of each.'),
      tr(`무기 공격력 주문서(중급) 14종 중 1장, 경험치 1,610, 메소 658. 단검 주문서가 나오면 ${price(2043301) ? meso(price(2043301)) : '—'}에 팔려요. 내 무기용이 아니면 팔아서 물약값으로 써요.`, `One of 14 intermediate weapon attack scrolls, 1,610 EXP, 658 mesos. A dagger one sells for ${price(2043301) ? meso(price(2043301)) : '—'}; if it is not for your weapon, sell it for potions.`), [2043301],
      `<p class="nb-tip">${tr('파란 버섯의 갓은 피아에 20개, 제인에 15개, 모두 35개가 들어가요. 파란 버섯을 잡을 때 한 번에 모아 두면 같은 사냥터를 두 번 안 가도 돼요.', 'Pia takes 20 Blue Mushroom Caps and Jane 15: collect all 35 in one trip.')}</p>`),
    quest(21, tr('동료의 증명 (커닝 파티퀘스트)', 'Proof of Companionship (Kerning PQ)'), '/quests/kpq-companionship/',
      tr('커닝시티 라케리스에게 받고, 커닝 파티퀘스트를 끝까지 깨요.', 'Take it from Lakelis in Kerning City, then clear the Kerning party quest.'),
      tr(`귀고리 힘·민첩·지력·행운 주문서 중 1장. 귀고리 행운 중급 시세 ${price(2040313) ? meso(price(2040313)) : '—'}.`, `One earring STR, DEX, INT or LUK scroll. Earring LUK intermediate sells for ${price(2040313) ? meso(price(2040313)) : '—'}.`), [2040313]),
    quest(35, tr('슈미의 잃어버린 돈', "Shumi's Lost Money"), '/quests/shumi-jump/',
      tr('커닝시티 지하철 입구의 슈미. 공사장 B1·B2·B3에서 점프만 하면 돼요.', 'Shumi by the Kerning subway: jump through Construction Site B1, B2 and B3.'),
      tr('세 번 합쳐 경험치 20,160, 마지막에 메소 1만과 마나 엘릭서 30개.', '20,160 EXP in total, then 10,000 mesos and 30 Mana Elixirs.'), [2000006]),
    quest(36, tr('저주받은 인형 모으기 (장공 퀘스트)', 'Cursed Dolls (glove attack quest)'), '/quests/glove-attack/',
      tr('엘리니아 요정 로웬. 좀비 루팡의 저주받은 인형을 50 · 70 · 100 · 150개 가져가요. 먼저 슬리피우드 사우나 가운 퀘스트를 끝내야 열려요.', 'Rowen the Fairy in Ellinia wants 50, 70, 100 and 150 Cursed Dolls from Zombie Lupins; the Sleepywood sauna robe quest opens it.'),
      tr(`마지막 보상은 장갑 공격력(중급) 또는 장갑 마력(중급). 장갑 공격력 중급 시세 ${price(2040801) ? meso(price(2040801)) : '—'}.`, `The last reward is Gloves Attack or Gloves Magic Attack (intermediate). Gloves Attack sells for ${price(2040801) ? meso(price(2040801)) : '—'}.`), [2040801, 2040805])
  ].join('');

  // 3. Where to hunt, by level (monster stats from the game data)
  const band = (lv, title, cards, note) => `<section class="nb-band"><h3><span class="nb-lv">${lv}</span>${title}</h3><ul class="nb-mobs">${cards}</ul>${note ? `<p class="nb-tip">${note}</p>` : ''}</section>`;
  const hunt = [
    band('1–10', tr('메이플 아일랜드', 'Maple Island'), [2, 4, 5].map((id) => mobCard(id)).join(''), tr('퀘스트를 따라가며 8~10레벨에 빅토리아 아일랜드로 넘어가요.', 'Follow the island quests and cross to Victoria Island at about Lv 8–10.')),
    band('10–15', tr('헤네시스 동쪽 풀숲 · 커닝시티 공사장', 'East of Henesys, Kerning construction site'), [mobCard(8, tr('한 대에 20 정도, 1마리 약 12메소', 'hits for about 20, drops about 12 mesos')), mobCard(6), mobCard(9)].join(''), tr('사람이 많으면 커닝시티 공사장 위층이나 북쪽 공사장으로 옮겨요.', 'If it is crowded, move to the upper floors or the north construction site in Kerning.')),
    band('15–21', tr('엘리니아 원숭이 숲 꼭대기 · 숲 나무 던전', 'Top of the Ellinia monkey forest, tree dungeons'), [mobCard(13, tr('5분에 약 2,500 경험치 (표도 기준)', 'about 2,500 EXP per 5 min (claw thief)')), mobCard(7), mobCard(16)].join(''), tr('남쪽 숲 나무 던전에는 파란 버섯·뿔버섯도 나와서 피아·제인 재료를 한 번에 모아요.', 'The south tree dungeon also has Blue and Horny Mushrooms for the Pia and Jane quests.')),
    band('20–25', tr('커닝시티 지하철', 'Kerning City subway'), [mobCard(17, tr('5분에 약 3,500 경험치', 'about 3,500 EXP per 5 min')), mobCard(14)].join(''), tr('버블링은 근접 직업에게 맞고, 원거리 직업은 스티지가 나아요.', 'Bubblings suit melee jobs; ranged jobs do better on Stirges.')),
    band('21–30', tr('커닝 파티퀘스트', 'Kerning party quest'), '', tr('3~12채널에서만 열리고, 이 서버는 레벨 상한이 없어서 30대 중반까지 도는 사람도 많아요. "러시"는 보너스 맵 없이 바로 다시 도는 파티, "보너스"는 남은 시간에 보너스 맵에서 사냥하고 나오는 파티예요.', 'Runs only on channels 3–12 and has no level cap here, so many keep running it into their mid-30s. "Rush" parties skip the bonus map; "bonus" parties hunt there with the time left.')),
    band('25–30', tr('슬리피우드 개미굴', 'Sleepywood Ant Tunnel'), [mobCard(19), mobCard(21, tr('1마리 40~50메소', '40–50 mesos each'))].join(''), tr('뿔버섯이 두 방에 잡히면 와도 돼요. 좀비버섯은 아대 공격력 주문서도 떨어뜨려요.', 'Come when Horny Mushrooms die in two hits. Zombie Mushrooms also drop claw attack scrolls.'))
  ].join('');

  // 4. Gear and money
  const loot = [[1092002, tr('초록버섯이 떨어뜨려요', 'from Green Mushrooms')], [2070009, tr('다크 엑스텀프(Lv 23)가 떨어뜨려요', 'from Dark Axe Stumps (Lv 23)')]]
    .filter(([id]) => price(id)).map(([id, from]) => `<li>${icon(id, 32)}<span><strong>${esc(name(id))}</strong><small>${from}</small></span><b>${meso(price(id))}</b></li>`).join('');

  return `<section class="nb-road">
<div class="nb-key">
<div><b>${tr('맞는 만큼 돈', 'Every hit costs')}</b><span>${tr('짐승의 고기 80메소 = HP 160. 100 맞으면 50메소가 나가요.', 'Meat: 80 mesos for 160 HP. Taking 100 damage costs 50 mesos.')}</span></div>
<div><b>${tr('MP도 돈', 'MP costs too')}</b><span>${tr('레몬 150메소 = MP 150. MP 16짜리 스킬 한 번이 16메소예요.', 'Lemon: 150 mesos for 150 MP, so a 16 MP skill costs 16 mesos.')}</span></div>
<div><b>${tr('한두 방에 잡히는 몬스터', 'One or two hits')}</b><span>${tr('세 방 넘게 걸리는 몬스터는 물약값이 더 들어요.', 'Anything that takes three hits or more costs more in potions than it pays.')}</span></div>
</div>

<h2 id="mesos">${tr('1. 물약값: 어디에 돈이 새나', '1. Potions: where the mesos go')}</h2>
<p>${tr('초록버섯에게 맨몸으로 맞으면 한 대에 60 넘게 들어오는데, 한 마리 잡으면 주는 돈은 30메소 안팎이에요. 한 대 맞으면 한 마리 잡은 돈이 그대로 날아가요. 그래서 발판 위에서 치고, 몬스터가 다가오기 전에 줄에 올라가 피하는 습관이 가장 큰 절약이에요.', 'With no armour a Green Mushroom hits for over 60, while one pays about 30 mesos, so one hit wipes out a kill. Fighting from a ledge and climbing a rope before monsters reach you saves more than anything else.')}</p>
<div class="table-wrap"><table class="data nb-heal"><thead><tr><th scope="col">${tr('회복 아이템', 'Item')}</th><th scope="col">${tr('회복량', 'Restores')}</th><th scope="col">${tr('NPC 상점가', 'NPC shop')}</th><th scope="col">${tr('자유시장 시세', 'Free Market')}</th></tr></thead><tbody>${healRows}</tbody></table></div>
<p class="nb-note">${tr(`회복량은 게임 데이터 그대로예요. 빨간 포션은 HP 50이 아니라 100을 채워요. 자유시장 시세는 ${day} 기준이에요.`, `Recovery is the game's own data: a Red Potion restores 100 HP, not 50. Free Market prices as of ${day}.`)}</p>

<h2 id="quests">${tr('2. 레벨별로 꼭 챙길 퀘스트', '2. Quests worth doing at each level')}</h2>
<p>${tr('무자본이면 퀘스트 보상이 첫 자본이에요. 요구 개수와 보상은 게임 데이터 그대로, 주문서 값은 지금 자유시장 시세예요.', 'With no funds, quest rewards are your first capital. Counts and rewards are the game data; scroll values are current Free Market prices.')}</p>
<ol class="nb-quests">${quests}</ol>

<h2 id="hunting">${tr('3. 레벨별 사냥터', '3. Where to train by level')}</h2>
<p>${tr('카드의 레벨·HP·경험치는 게임 데이터예요. 내 레벨과 직업에 맞는 곳은', 'Level, HP and EXP on each card are the game data. For your own level and job, use the')} <a href="${link('/tools/training/')}">${tr('사냥터 추천', 'training finder')}</a>${tr('에서 바로 볼 수 있어요.', '.')}</p>
${hunt}

<h2 id="gear">${tr('4. 장비와 돈', '4. Gear and money')}</h2>
<ul class="nb-rules">
<li>${tr('<b>무기부터 바꿔요.</b> 방어구까지 다 사다가 물약값이 바닥나는 경우가 많아요. 장갑·귀고리·망토·신발은 퀘스트로 거의 받아요.', '<b>Upgrade the weapon first.</b> Buying full armour is how most people run out of potion money; gloves, earrings, cape and shoes mostly come from quests.')}</li>
<li>${tr('<b>무기는 NPC 상점보다 자유시장을 먼저 봐요.</b> 30레벨을 넘긴 사람들이 쓰던 무기가 상점보다 싸게 나와 있어요.', '<b>Check the Free Market before the NPC shop.</b> Weapons people outgrew are often cheaper than the shop.')}</li>
<li>${tr('<b>떨어진 장비는 그냥 넘기지 마세요.</b> 같은 장비라도 공격력이나 능력치가 높게 붙은 건 훨씬 비싸요.', '<b>Do not walk past equipment drops.</b> A piece with higher attack or stats sells for much more.')}</li>
<li>${tr('<b>메소를 현금으로 사지 마세요.</b> 걸리면 메소를 회수당하고 거래가 막혀요.', '<b>Never buy mesos with real money.</b> Caught buyers lose the mesos and get trade restrictions.')}</li>
</ul>
${loot ? `<p>${tr('초반 사냥터에서 나오는 비싼 장비예요.', 'Valuable drops from early training spots:')}</p><ul class="nb-loot">${loot}</ul>` : ''}

<h2 id="words">${tr('5. 처음에 꼭 아는 말', '5. Words you will see on day one')}</h2>
<ul class="nb-words">
<li><b>JPT</b><span>${tr('파티에 넣어 달라는 말', 'join party, please')}</span></li>
<li><b>LPT · LFP</b><span>${tr('파티를 찾고 있어요', 'looking for a party')}</span></li>
<li><b>RPT</b><span>${tr('파티원을 모집해요', 'recruiting party members')}</span></li>
<li><b>S> · B></b><span>${tr('팝니다 · 삽니다', 'selling · buying')}</span></li>
<li><b>100k · 1.5m</b><span>${tr('10만 · 150만 메소', '100,000 · 1,500,000 mesos')}</span></li>
</ul>
<p>${tr('나머지 줄임말은', 'Everything else is in the')} <a href="${link('/guides/newbie/glossary/')}">${tr('용어 사전', 'glossary')}</a>${tr('에 60여 개 모아 뒀어요.', '.')}</p>
</section>`;
}
