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
    lead: '처음 시작하면 확성기 글도, 디스코드 대화도 줄임말투성이예요. 뉴비가 실제로 많이 검색하는 것부터 순서대로 묶었어요. 위에서부터 차례로 읽으면 돼요.',
    newTitle: '뉴비가 가장 먼저 막히는 것',
    pathTitle: '시작부터 2차 전직까지, 읽는 순서',
    toolsTitle: '같이 쓰면 좋은 도구'
  },
  en: {
    title: 'MapleStory Classic World Beginner Guide for New Players | GMS Hub',
    h1: 'Classic World beginner guide',
    nav: 'Beginner guide',
    desc: 'What new MapleStory Classic World players look up most, in order: trade and megaphone shorthand, picking a job, early levelling, Kerning Party Quest and the 2nd job advancement.',
    lead: 'Megaphones and Discord chat are mostly shorthand when you start. These pages cover what new players search for most, in the order you will need them.',
    newTitle: 'Where new players get stuck first',
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

export function newbieHubBody({ lang, link, guides, guideHref }) {
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
