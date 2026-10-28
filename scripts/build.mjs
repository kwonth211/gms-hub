// Static site generator for GMS Hub. No dependencies: `node scripts/build.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const config = readJson('site.config.json');
const sites = readJson('data/sites.json');
const training = readJson('data/training.json');
const scrolls = readJson('data/scrolls.json');
const drops = readJson('data/drops.json');

const LANGS = ['ko', 'en'];
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const GAME_KO = '메이플스토리 클래식 월드';
const GAME_EN = 'MapleStory Classic World';

const T = {
  ko: {
    tagline: `${GAME_KO} 커뮤니티·공략·툴을 한곳에`,
    gameBadge: `${GAME_KO} 전용`,
    navHome: '홈',
    navTraining: '사냥터',
    navScroll: '주문서',
    navDrop: '드롭 확률',
    navAbout: '소개',
    switchLang: 'English',
    homeTitle: `GMS Hub — ${GAME_KO} 사이트 모음 · 사냥터 · 계산기`,
    homeDesc: `${GAME_KO}(글로벌 클래식 메이플) 공식 채널, 한국어·영어 커뮤니티, DB·공략 사이트를 한곳에 모았어요. 레벨별 사냥터 찾기, 주문서 시뮬레이터, 드롭 확률 계산기도 제공해요.`,
    heroTitle: '글로벌 클래식 메이플,<br>필요한 곳으로 바로.',
    heroSub: '흩어져 있는 클래식 월드 공식 채널, 커뮤니티, 데이터베이스, 공략을 한 페이지에 정리했어요.',
    quickLevel: '내 레벨',
    quickGo: '사냥터 보기',
    searchPlaceholder: '사이트 검색 (예: 갤러리, reddit, 위키)',
    noResults: '검색 결과가 없어요.',
    toolsHeading: 'GMS Hub 툴',
    linksHeading: '사이트 모음',
    faqHeading: '자주 묻는 질문',
    trCardTitle: '레벨별 사냥터 찾기',
    trCardDesc: '레벨을 넣으면 클래식 월드 기준 추천 사냥터와 시간당 경험치를 보여줘요.',
    scCardTitle: '주문서 시뮬레이터',
    scCardDesc: '10%·60%·다크 주문서를 바르면 몇 줄 붙고 몇 % 확률로 터지는지 계산해요.',
    dropCardTitle: '드롭 확률 계산기',
    dropCardDesc: '드롭률과 사냥 횟수로 실제로 먹을 확률, 필요한 사냥 횟수를 계산해요.',
    open: '열기',
    langBadge: { ko: '한국어', en: 'EN' },
    lastChecked: '링크 마지막 확인',
    notOtherGames: '이 사이트는 클래식 월드만 다뤄요. 메이플스토리 본섭(KMS·GMS)이나 메이플랜드와는 맵·몬스터 레벨이 달라요.',

    trTitle: `레벨별 사냥터 찾기 — ${GAME_KO} | GMS Hub`,
    trDesc: `${GAME_KO} 레벨별 추천 사냥터. 1~70레벨 구간별 맵, 몬스터, 시간당 경험치와 드랍 파밍 맵을 정리했어요.`,
    trH1: '레벨별 사냥터 찾기',
    trLead: '지금 레벨을 넣으면 클래식 월드 기준 추천 사냥터가 나와요.',
    level: '레벨',
    showSpots: '보기',
    trBracket: '{min}~{max}레벨 추천',
    trNext: '다음 구간 미리 보기 ({min}~{max}레벨)',
    trNone: '이 레벨에 해당하는 데이터가 아직 없어요.',
    colMap: '맵',
    colRegion: '지역',
    colMonster: '주요 몬스터',
    colExp: '최대 경험치/시간',
    colNote: '메모',
    colLevels: '몬스터 레벨',
    trAll: '전체 구간',
    trLoot: '파티 · 드랍 파밍 맵',
    trTips: [
      '몬스터 레벨이 내 레벨보다 높을수록 MISS가 많이 떠요. 처음 가는 맵은 입구에서 몬스터 레벨부터 확인하세요.',
      '마법사·궁수는 한 종류만 나오는 넓은 맵(Transfer Area 등)이 편해요.'
    ],

    scTitle: `주문서 시뮬레이터 — ${GAME_KO} | GMS Hub`,
    scDesc: `${GAME_KO} 주문서 강화 계산기. 업그레이드 가능 횟수와 10%·30%·60%·70%·100% 주문서로 성공 줄 수 분포, 파괴 확률, 기대 비용을 계산해요.`,
    scH1: '주문서 시뮬레이터',
    scLead: '업그레이드 가능 횟수만큼 주문서를 발랐을 때 결과를 확률로 보여줘요.',
    slots: '업그레이드 가능 횟수',
    scroll: '사용할 주문서',
    statPer: '성공 1회당 오르는 수치',
    statPerHint: '예: 장갑 공격력 60% → 2',
    price: '주문서 1장 가격 (메소)',
    calc: '계산하기',
    resExpSuccess: '평균 성공 횟수 (안 터졌을 때)',
    resExpStat: '평균 상승 수치 (안 터졌을 때)',
    resBoom: '파괴될 확률',
    resCost: '평균 주문서 비용',
    resAllPass: '전부 성공할 확률',
    distHeading: '성공 횟수별 확률',
    distSucc: '{k}번 성공',
    distBoom: '파괴',
    scrollTable: '주문서 종류',
    colScroll: '주문서',
    colSuccess: '성공 확률',
    colBoomOnFail: '실패 시 파괴',

    dropTitle: `드롭 확률 계산기 — ${GAME_KO} | GMS Hub`,
    dropDesc: '드롭률(%)과 사냥 횟수로 아이템을 한 번 이상 얻을 확률, 50%·90%·99% 확률로 얻기 위해 필요한 사냥 횟수를 계산해요.',
    dropH1: '드롭 확률 계산기',
    dropLead: '"1% 템, 100마리 잡으면 나오나?" 바로 계산해 드려요.',
    rateInput: '드롭률 (%)',
    rateHint: '예: 1/500이면 0.2',
    killsInput: '사냥(시도) 횟수',
    resAtLeastOne: '한 번 이상 얻을 확률',
    resExpected: '기대 획득 개수',
    resNeed50: '50% 확률로 얻으려면',
    resNeed90: '90% 확률로 얻으려면',
    resNeed99: '99% 확률로 얻으려면',
    times: '회',
    dbHeading: '드롭 확률 데이터',
    dbLead: '관리자가 확인한 드롭률을 모아둔 표예요. 행을 누르면 계산기에 바로 들어가요.',
    dbSearch: '몬스터나 아이템 이름 검색',
    dbEmpty: '아직 등록된 데이터가 없어요. 확인된 드롭률이 생기면 추가할게요.',
    colMob: '몬스터',
    colItem: '아이템',
    colRate: '드롭률',
    colSource: '출처',
    formulaHeading: '계산 방법',
    formula: [
      '한 번 이상 얻을 확률 = 1 − (1 − p)ⁿ',
      '기대 획득 개수 = n × p',
      'c 확률로 얻는 데 필요한 횟수 = ⌈ ln(1 − c) / ln(1 − p) ⌉'
    ],

    dataSource: '데이터 출처',
    dataUpdated: '데이터 갱신일',
    aboutTitle: '소개 — GMS Hub',
    aboutDesc: `GMS Hub는 ${GAME_KO} 유저를 위한 비공식 팬 사이트예요.`,
    aboutH1: 'GMS Hub 소개',
    aboutBody: `<p>GMS Hub는 <strong>${GAME_KO}</strong>(글로벌 클래식 메이플)를 하는 한국어·영어 유저가 필요한 사이트를 빨리 찾을 수 있게 만든 <strong>비공식 팬 사이트</strong>예요.</p>
<h2>다루는 게임</h2>
<p>클래식 월드 하나만 다뤄요. 한국 메이플스토리(KMS), GMS 본섭, 메이플랜드는 맵·몬스터·강화 시스템이 달라서 섞지 않아요.</p>
<h2>무엇을 하나요</h2>
<ul><li>공식 채널, 커뮤니티, 데이터베이스, 공략 사이트를 분류해서 소개해요.</li><li>레벨별 사냥터 찾기, 주문서 시뮬레이터, 드롭 확률 계산기를 제공해요.</li><li>링크는 주기적으로 접속 여부를 확인하고, 운영이 멈춘 사이트나 현금 거래 사이트는 올리지 않아요.</li></ul>
<h2>데이터 기준</h2>
<p>사냥터와 확률 수치는 공개 자료를 기준으로 하고, 페이지마다 출처와 갱신일을 적어둬요. 게임 내 표시와 다르면 게임이 우선이에요.</p>
<h2>사이트 추가·오류 제보</h2>
<p><a href="{issues}" target="_blank" rel="noopener">GitHub 이슈</a>로 알려주세요.</p>
<h2>면책</h2>
<p>GMS Hub는 넥슨(NEXON)과 관련이 없어요. MapleStory는 NEXON Korea Corporation의 상표예요. 소개한 외부 사이트의 내용은 각 운영자에게 책임이 있어요.</p>`,
    privacyTitle: '개인정보처리방침 — GMS Hub',
    privacyDesc: 'GMS Hub의 개인정보처리방침과 쿠키 사용 안내.',
    privacyH1: '개인정보처리방침',
    privacyBody: `<p>GMS Hub는 회원가입이 없고, 이름이나 이메일 같은 개인정보를 직접 수집하지 않아요.</p>
<h2>쿠키와 광고</h2>
<p>이 사이트는 Google AdSense 광고를 게재할 수 있어요. Google을 비롯한 제3자 광고 업체는 쿠키를 사용해 사용자가 이 사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 보여줘요. Google은 광고 쿠키로 사용자에게 맞춤 광고를 제공해요.</p>
<p>맞춤 광고는 <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google 광고 설정</a>에서 끌 수 있어요. 자세한 내용은 <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google 광고 정책</a>을 참고하세요.</p>
<h2>방문 통계</h2>
<p>사이트 개선을 위해 Google Analytics로 익명 방문 통계를 수집할 수 있어요.</p>
<h2>브라우저 저장소</h2>
<p>언어 선택 같은 설정은 사용자의 브라우저에만 저장되고 서버로 전송되지 않아요.</p>
<h2>문의</h2>
<p><a href="{issues}" target="_blank" rel="noopener">GitHub 이슈</a>로 연락해 주세요.</p>`,
    footerDisclaimer: 'GMS Hub는 비공식 팬 사이트이며 넥슨과 관련이 없습니다. MapleStory는 NEXON Korea Corporation의 상표입니다.',
    privacy: '개인정보처리방침',
    notFound: '페이지를 찾을 수 없어요.',
    backHome: '홈으로'
  },
  en: {
    tagline: `${GAME_EN} communities, guides and tools in one place`,
    gameBadge: `${GAME_EN} only`,
    navHome: 'Home',
    navTraining: 'Training',
    navScroll: 'Scrolls',
    navDrop: 'Drop Rate',
    navAbout: 'About',
    switchLang: '한국어',
    homeTitle: `GMS Hub — ${GAME_EN} Links, Training Spots & Calculators`,
    homeDesc: `Every useful ${GAME_EN} site in one hub: official channels, English and Korean communities, databases and guides, plus a training spot finder, scroll simulator and drop rate calculator.`,
    heroTitle: 'MapleStory Classic World,<br>one hop away.',
    heroSub: 'Official channels, communities, databases and guides for Classic World, sorted on a single page.',
    quickLevel: 'My level',
    quickGo: 'Find spots',
    searchPlaceholder: 'Search sites (e.g. reddit, wiki, database)',
    noResults: 'No matching sites.',
    toolsHeading: 'GMS Hub Tools',
    linksHeading: 'Site Directory',
    faqHeading: 'FAQ',
    trCardTitle: 'Training Spot Finder',
    trCardDesc: 'Enter your level to see Classic World training maps and EXP per hour.',
    scCardTitle: 'Scroll Simulator',
    scCardDesc: 'See how many slots pass and how likely a boom is with 10%, 60% and dark scrolls.',
    dropCardTitle: 'Drop Rate Calculator',
    dropCardDesc: 'Turn a drop rate and kill count into real odds, and see how many kills you need.',
    open: 'Open',
    langBadge: { ko: 'Korean', en: 'EN' },
    lastChecked: 'Links last checked',
    notOtherGames: 'This site covers Classic World only. Mainline MapleStory (KMS, GMS) and MapleLand have different maps and monster levels.',

    trTitle: `Training Spots by Level — ${GAME_EN} | GMS Hub`,
    trDesc: `Where to train in ${GAME_EN} at every level from 1 to 70: maps, monsters, EXP per hour and loot farming maps.`,
    trH1: 'Training Spot Finder',
    trLead: 'Enter your level to see where to train in Classic World.',
    level: 'Level',
    showSpots: 'Show',
    trBracket: 'Levels {min}–{max}',
    trNext: 'Up next (levels {min}–{max})',
    trNone: 'No data for this level yet.',
    colMap: 'Map',
    colRegion: 'Region',
    colMonster: 'Main monster',
    colExp: 'Max EXP/hr',
    colNote: 'Note',
    colLevels: 'Monster levels',
    trAll: 'All brackets',
    trLoot: 'Party & loot farming maps',
    trTips: [
      'The higher a monster is above your level, the more you MISS. Check monster levels at the map entrance first.',
      'Mages and bowmen do well on wide single-mob maps such as Transfer Area.'
    ],

    scTitle: `Scroll Simulator — ${GAME_EN} | GMS Hub`,
    scDesc: `${GAME_EN} scroll calculator. Pick upgrade slots and a 10%, 30%, 60%, 70% or 100% scroll to see the pass distribution, boom chance and expected cost.`,
    scH1: 'Scroll Simulator',
    scLead: 'See the odds of every outcome when you scroll all upgrade slots.',
    slots: 'Upgrade slots',
    scroll: 'Scroll',
    statPer: 'Stat gained per pass',
    statPerHint: 'e.g. Glove ATT 60% → 2',
    price: 'Price per scroll (mesos)',
    calc: 'Calculate',
    resExpSuccess: 'Average passes (if not boomed)',
    resExpStat: 'Average stat gain (if not boomed)',
    resBoom: 'Boom chance',
    resCost: 'Average scroll cost',
    resAllPass: 'Chance all slots pass',
    distHeading: 'Odds by number of passes',
    distSucc: '{k} passed',
    distBoom: 'Boomed',
    scrollTable: 'Scroll types',
    colScroll: 'Scroll',
    colSuccess: 'Success',
    colBoomOnFail: 'Boom on fail',

    dropTitle: `Drop Rate Calculator — ${GAME_EN} | GMS Hub`,
    dropDesc: 'Find the chance to get an item at least once from a drop rate and number of kills, and how many kills you need for 50%, 90% and 99% odds.',
    dropH1: 'Drop Rate Calculator',
    dropLead: '"It\'s a 1% drop — will 100 kills do it?" Find out instantly.',
    rateInput: 'Drop rate (%)',
    rateHint: 'e.g. 1 in 500 is 0.2',
    killsInput: 'Kills (attempts)',
    resAtLeastOne: 'Chance of at least one',
    resExpected: 'Expected drops',
    resNeed50: 'Kills for 50% odds',
    resNeed90: 'Kills for 90% odds',
    resNeed99: 'Kills for 99% odds',
    times: '',
    dbHeading: 'Drop Rate Data',
    dbLead: 'Drop rates checked by the maintainers. Click a row to load it into the calculator.',
    dbSearch: 'Search monster or item',
    dbEmpty: 'No entries yet. Verified rates will be added here.',
    colMob: 'Monster',
    colItem: 'Item',
    colRate: 'Rate',
    colSource: 'Source',
    formulaHeading: 'How it works',
    formula: [
      'Chance of at least one = 1 − (1 − p)ⁿ',
      'Expected drops = n × p',
      'Kills needed for chance c = ⌈ ln(1 − c) / ln(1 − p) ⌉'
    ],

    dataSource: 'Data source',
    dataUpdated: 'Data updated',
    aboutTitle: 'About — GMS Hub',
    aboutDesc: `GMS Hub is an unofficial fan site for ${GAME_EN} players.`,
    aboutH1: 'About GMS Hub',
    aboutBody: `<p>GMS Hub is an <strong>unofficial fan site</strong> that helps English- and Korean-speaking <strong>${GAME_EN}</strong> players find the right site fast.</p>
<h2>Which game</h2>
<p>Classic World only. Korean MapleStory (KMS), mainline GMS and MapleLand have different maps, monsters and upgrade systems, so we keep them out.</p>
<h2>What it does</h2>
<ul><li>Sorts official channels, communities, databases and guides into one directory.</li><li>Provides a training spot finder, a scroll simulator and a drop rate calculator.</li><li>Checks links regularly, and never lists inactive or real-money trading sites.</li></ul>
<h2>About the data</h2>
<p>Training spots and rates come from public sources, and each page lists its source and update date. If the game shows something different, the game wins.</p>
<h2>Suggest a site or report an error</h2>
<p>Open a <a href="{issues}" target="_blank" rel="noopener">GitHub issue</a>.</p>
<h2>Disclaimer</h2>
<p>GMS Hub is not affiliated with NEXON. MapleStory is a trademark of NEXON Korea Corporation. External sites are the responsibility of their operators.</p>`,
    privacyTitle: 'Privacy Policy — GMS Hub',
    privacyDesc: 'Privacy policy and cookie notice for GMS Hub.',
    privacyH1: 'Privacy Policy',
    privacyBody: `<p>GMS Hub has no accounts and does not directly collect personal information such as names or email addresses.</p>
<h2>Cookies and advertising</h2>
<p>This site may show Google AdSense ads. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this and other websites. Google's use of advertising cookies enables it and its partners to serve ads based on those visits.</p>
<p>You can opt out of personalized advertising in <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google Ads Settings</a>. See <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">how Google uses cookies in advertising</a>.</p>
<h2>Analytics</h2>
<p>We may use Google Analytics to collect anonymous visit statistics to improve the site.</p>
<h2>Browser storage</h2>
<p>Preferences such as language are stored only in your browser and never sent to a server.</p>
<h2>Contact</h2>
<p>Open a <a href="{issues}" target="_blank" rel="noopener">GitHub issue</a>.</p>`,
    footerDisclaimer: 'GMS Hub is an unofficial fan site and is not affiliated with NEXON. MapleStory is a trademark of NEXON Korea Corporation.',
    privacy: 'Privacy',
    notFound: 'Page not found.',
    backHome: 'Back home'
  }
};

const PAGES = [
  { key: 'home', path: '/' },
  { key: 'training', path: '/tools/training/' },
  { key: 'scroll', path: '/tools/scroll/' },
  { key: 'drop', path: '/tools/drop-rate/' },
  { key: 'about', path: '/about/' },
  { key: 'privacy', path: '/privacy/' }
];

const issuesUrl = `https://github.com/${config.github.owner}/${config.github.repo}/issues`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (p) => `${config.basePath}${p}`;
const absUrl = (p) => `${config.baseUrl}${config.basePath}${p}`;
const langPath = (lang, p) => `/${lang}${p}`;
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const jsonScript = (id, data) =>
  `<script id="${id}" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function head({ lang, title, desc, pagePath, noindex, ld = [] }) {
  const alternates = pagePath
    ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${absUrl(langPath(l, pagePath))}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, pagePath))}">`
    : '';
  const canonical = pagePath ? absUrl(langPath(lang, pagePath)) : absUrl('/');
  const adsense = config.adsenseClient
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsenseClient)}" crossorigin="anonymous"></script>`
    : '';
  const ga = config.gaMeasurementId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.gaMeasurementId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(config.gaMeasurementId)}');</script>`
    : '';
  const verify = config.googleSiteVerification
    ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">`
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${lang === 'ko' ? 'ko_KR' : 'en_US'}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f08a24">
${verify}
<link rel="icon" href="${href('/assets/favicon.svg')}" type="image/svg+xml">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="${href('/assets/style.css')}">
${adsense}
${ga}
${ld.map(ldScript).join('\n')}
</head>`;
}

function header(lang, pagePath) {
  const t = T[lang];
  const other = lang === 'ko' ? 'en' : 'ko';
  const nav = [
    ['/', t.navHome],
    ['/tools/training/', t.navTraining],
    ['/tools/scroll/', t.navScroll],
    ['/tools/drop-rate/', t.navDrop],
    ['/about/', t.navAbout]
  ]
    .map(([p, label]) => `<a href="${href(langPath(lang, p))}"${p === pagePath ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  return `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${href(langPath(lang, '/'))}"><img src="${href('/assets/favicon.svg')}" alt="" width="28" height="28"><span>GMS Hub</span></a>
<nav class="nav">${nav}</nav>
<a class="lang-switch" href="${href(langPath(other, pagePath || '/'))}" data-lang="${other}" hreflang="${other}">${t.switchLang}</a>
</div></header>`;
}

function footer(lang) {
  const t = T[lang];
  return `<footer class="site-footer"><div class="wrap">
<p>${esc(t.footerDisclaimer)}</p>
<p><a href="${href(langPath(lang, '/privacy/'))}">${t.privacy}</a> · <a href="${href(langPath(lang, '/about/'))}">${t.navAbout}</a> · <a href="${issuesUrl}" target="_blank" rel="noopener">GitHub</a></p>
</div></footer>`;
}

function page({ lang, pageKey, pagePath, title, desc, body, scripts = [], ld = [] }) {
  return `${head({ lang, title, desc, pagePath, ld })}
<body data-page="${pageKey}">
${header(lang, pagePath)}
<main class="wrap">${body}</main>
${footer(lang)}
<script src="${href('/assets/common.js')}" defer></script>
${scripts.map((s) => `<script src="${href(`/assets/${s}`)}" defer></script>`).join('\n')}
</body>
</html>`;
}

const pageHead = (lang, h1, lead) =>
  `<section class="page-head"><span class="game-badge">${esc(T[lang].gameBadge)}</span><h1>${h1}</h1><p class="lead">${esc(lead)}</p></section>`;
const sourceLine = (lang, source, updated) =>
  `<p class="muted small">${T[lang].dataSource}: <a href="${esc(source)}" target="_blank" rel="noopener">${esc(host(source))}</a> · ${T[lang].dataUpdated}: ${esc(updated)}</p>`;

// ---------- page bodies ----------

function homeBody(lang) {
  const t = T[lang];
  const chips = sites.categories
    .map((c) => `<a class="chip" href="#${c.id}">${esc(c.name[lang])} <span>${c.sites.length}</span></a>`)
    .join('');
  const sections = sites.categories
    .map(
      (c) => `<section class="cat" id="${c.id}" data-cat>
<h3>${esc(c.name[lang])}</h3>
<p class="muted">${esc(c.desc[lang])}</p>
<div class="grid">${c.sites
        .map(
          (s) => `<a class="card site-card" href="${esc(s.url)}" target="_blank" rel="noopener" data-search="${esc(
            `${s.name} ${s.desc.ko} ${s.desc.en} ${c.name.ko} ${c.name.en}`.toLowerCase()
          )}">
<div class="card-top"><strong>${esc(s.name)}</strong><span class="badge ${s.lang}">${t.langBadge[s.lang]}</span></div>
<p>${esc(s.desc[lang])}</p>
<span class="host">${esc(host(s.url))} ↗</span>
</a>`
        )
        .join('')}</div>
</section>`
    )
    .join('');
  const faq = sites.faq
    .map((f) => `<details><summary>${esc(f.q[lang])}</summary><p>${esc(f.a[lang])}</p></details>`)
    .join('');
  const tool = (p, icon, title, desc) =>
    `<a class="card tool-card" href="${href(langPath(lang, p))}"><span class="tool-icon">${icon}</span><strong>${title}</strong><p>${esc(desc)}</p><span class="cta">${t.open} →</span></a>`;
  return `<section class="hero">
<span class="game-badge">${esc(t.gameBadge)}</span>
<h1>${t.heroTitle}</h1>
<p class="lead">${esc(t.heroSub)}</p>
<form class="quick" action="${href(langPath(lang, '/tools/training/'))}" method="get">
<label>${t.quickLevel}<input type="number" name="lv" min="1" max="100" value="21" inputmode="numeric"></label>
<button class="btn" type="submit">${t.quickGo} →</button>
</form>
</section>
<section>
<h2>${t.toolsHeading}</h2>
<div class="grid tools">
${tool('/tools/training/', '⚔', t.trCardTitle, t.trCardDesc)}
${tool('/tools/scroll/', '📜', t.scCardTitle, t.scCardDesc)}
${tool('/tools/drop-rate/', '%', t.dropCardTitle, t.dropCardDesc)}
</div>
</section>
<section>
<h2>${t.linksHeading}</h2>
<input id="site-search" class="search" type="search" placeholder="${esc(t.searchPlaceholder)}" aria-label="${esc(t.searchPlaceholder)}">
<nav class="chips">${chips}</nav>
${sections}
<p id="no-results" class="muted" hidden>${t.noResults}</p>
<p class="muted small">${t.lastChecked}: ${esc(sites.updated)}</p>
</section>
<p class="notice">${esc(t.notOtherGames)}</p>
<section class="faq">
<h2>${t.faqHeading}</h2>
${faq}
</section>`;
}

function trainingBody(lang) {
  const t = T[lang];
  const nf = new Intl.NumberFormat(lang);
  const spotRows = (spots) =>
    spots
      .map(
        (s) =>
          `<tr><td><strong>${esc(s.map)}</strong></td><td>${esc(s.region)}</td><td>${esc(s.monster)} <span class="muted">Lv.${s.monsterLevel}</span></td><td>${nf.format(s.expHr)}</td><td>${esc(s.note[lang])}</td></tr>`
      )
      .join('');
  const table = (rows) =>
    `<div class="table-wrap"><table class="data"><thead><tr><th>${t.colMap}</th><th>${t.colRegion}</th><th>${t.colMonster}</th><th>${t.colExp}</th><th>${t.colNote}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  // Every bracket is rendered server-side so search engines see the full table; JS only highlights.
  const all = training.brackets
    .map(
      (b) => `<section class="bracket" data-min="${b.min}" data-max="${b.max}" id="lv-${b.min}">
<h3>${fill(t.trBracket, b)}</h3>
${table(spotRows(b.spots))}
</section>`
    )
    .join('');
  const loot = training.loot
    .map(
      (l) =>
        `<tr><td><strong>${esc(l.map)}</strong></td><td>${esc(l.levels)}</td><td>${nf.format(l.expHr)}</td><td>${esc(l.note[lang])}</td></tr>`
    )
    .join('');
  return `${pageHead(lang, t.trH1, t.trLead)}
<form id="tr-form" class="panel quick">
<label>${t.level}<input type="number" name="lv" min="1" max="100" value="21" inputmode="numeric"></label>
<button class="btn" type="submit">${t.showSpots}</button>
</form>
<div id="tr-result" aria-live="polite"></div>
<ul class="notes">${t.trTips.map((n) => `<li>${esc(n)}</li>`).join('')}<li>${esc(training.note[lang])}</li></ul>
<section>
<h2>${t.trAll}</h2>
<nav class="chips">${training.brackets.map((b) => `<a class="chip" href="#lv-${b.min}">${b.min}–${b.max}</a>`).join('')}</nav>
${all}
</section>
<section>
<h2>${t.trLoot}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colMap}</th><th>${t.colLevels}</th><th>${t.colExp}</th><th>${t.colNote}</th></tr></thead><tbody>${loot}</tbody></table></div>
</section>
${sourceLine(lang, training.source, training.updated)}
${jsonScript('i18n', { lang, trBracket: t.trBracket, trNext: t.trNext, trNone: t.trNone })}`;
}

function scrollBody(lang) {
  const t = T[lang];
  const options = scrolls.scrolls
    .map((s) => `<option value="${esc(s.id)}"${s.id === 's60' ? ' selected' : ''}>${esc(s.name[lang])}</option>`)
    .join('');
  const rows = scrolls.scrolls
    .map((s) => `<tr><td>${esc(s.name[lang])}</td><td>${s.success}%</td><td>${s.destroyOnFail ? `${s.destroyOnFail}%` : '—'}</td></tr>`)
    .join('');
  return `${pageHead(lang, t.scH1, t.scLead)}
<div class="tool-layout">
<form id="sc-form" class="panel form">
<label>${t.slots}<input type="number" name="slots" value="7" min="1" max="15" required></label>
<label>${t.scroll}<select name="scroll">${options}</select></label>
<label>${t.statPer}<input type="number" name="stat" value="2" min="0" step="any"><small>${esc(t.statPerHint)}</small></label>
<label>${t.price}<input type="number" name="price" value="0" min="0" step="1000"></label>
<button type="submit" class="btn">${t.calc}</button>
</form>
<div class="panel results" id="sc-results" aria-live="polite">
<div class="stat big"><span>${t.resExpStat}</span><strong data-k="stat">—</strong></div>
<div class="stats">
<div class="stat"><span>${t.resExpSuccess}</span><strong data-k="succ">—</strong></div>
<div class="stat"><span>${t.resAllPass}</span><strong data-k="all">—</strong></div>
<div class="stat"><span>${t.resBoom}</span><strong data-k="boom">—</strong></div>
<div class="stat"><span>${t.resCost}</span><strong data-k="cost">—</strong></div>
</div>
<h3>${t.distHeading}</h3>
<div id="sc-dist" class="dist"></div>
</div>
</div>
<section>
<h2>${t.scrollTable}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colScroll}</th><th>${t.colSuccess}</th><th>${t.colBoomOnFail}</th></tr></thead><tbody>${rows}</tbody></table></div>
<ul class="notes"><li>${esc(scrolls.note[lang])}</li></ul>
<p class="muted small">${t.dataUpdated}: ${esc(scrolls.updated)}</p>
</section>
${jsonScript('scroll-data', scrolls)}
${jsonScript('i18n', { lang, distSucc: t.distSucc, distBoom: t.distBoom })}`;
}

function dropBody(lang) {
  const t = T[lang];
  const rows = drops.entries.length
    ? drops.entries
        .map(
          (d) => `<tr data-rate="${esc(d.rate)}" data-search="${esc(`${d.monster} ${d.item}`.toLowerCase())}" tabindex="0">
<td>${esc(d.monster)}</td><td>${esc(d.item)}</td><td>${esc(d.rate)}%</td><td>${
            d.source ? `<a href="${esc(d.source)}" target="_blank" rel="noopener">${esc(host(d.source))}</a>` : '—'
          }</td><td>${esc(d.note || '')}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="muted">${t.dbEmpty}</td></tr>`;
  return `${pageHead(lang, t.dropH1, t.dropLead)}
<div class="tool-layout">
<form id="drop-form" class="panel form">
<label>${t.rateInput}<input type="number" name="rate" value="1" min="0.0001" max="100" step="any" required><small>${esc(t.rateHint)}</small></label>
<label>${t.killsInput}<input type="number" name="kills" value="100" min="1" step="1" required></label>
<button type="submit" class="btn">${t.calc}</button>
</form>
<div class="panel results" id="drop-results" aria-live="polite">
<div class="stat big"><span>${t.resAtLeastOne}</span><strong data-k="p">—</strong></div>
<div class="stats">
<div class="stat"><span>${t.resExpected}</span><strong data-k="exp">—</strong></div>
<div class="stat"><span>${t.resNeed50}</span><strong data-k="n50">—</strong></div>
<div class="stat"><span>${t.resNeed90}</span><strong data-k="n90">—</strong></div>
<div class="stat"><span>${t.resNeed99}</span><strong data-k="n99">—</strong></div>
</div>
</div>
</div>
<section>
<h2>${t.dbHeading}</h2>
<p class="muted">${esc(t.dbLead)}</p>
<input id="db-search" class="search small" type="search" placeholder="${esc(t.dbSearch)}" aria-label="${esc(t.dbSearch)}">
<div class="table-wrap"><table class="data clickable" id="drop-db"><thead><tr><th>${t.colMob}</th><th>${t.colItem}</th><th>${t.colRate}</th><th>${t.colSource}</th><th>${t.colNote}</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted small">${t.dataUpdated}: ${esc(drops.updated)}</p>
</section>
<section>
<h2>${t.formulaHeading}</h2>
<ul class="notes">${t.formula.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
</section>
${jsonScript('i18n', { lang, times: t.times })}`;
}

const prose = (h1, body) => `<article class="prose"><h1>${h1}</h1>${body.replaceAll('{issues}', issuesUrl)}</article>`;

// ---------- write ----------

fs.rmSync(out, { recursive: true, force: true });
const write = (rel, content) => {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

for (const lang of LANGS) {
  const t = T[lang];
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName,
    url: absUrl(langPath(lang, '/')),
    inLanguage: lang,
    description: t.homeDesc,
    about: { '@type': 'VideoGame', name: GAME_EN, publisher: 'NEXON' }
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: sites.faq.map((f) => ({
      '@type': 'Question',
      name: f.q[lang],
      acceptedAnswer: { '@type': 'Answer', text: f.a[lang] }
    }))
  };
  const appLd = (name, description, p) => ({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    description,
    url: absUrl(langPath(lang, p)),
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    inLanguage: lang,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  });

  const defs = {
    home: { title: t.homeTitle, desc: t.homeDesc, body: homeBody(lang), scripts: ['home.js'], ld: [websiteLd, faqLd] },
    training: {
      title: t.trTitle,
      desc: t.trDesc,
      body: trainingBody(lang),
      scripts: ['training.js'],
      ld: [appLd(t.trH1, t.trDesc, '/tools/training/')]
    },
    scroll: {
      title: t.scTitle,
      desc: t.scDesc,
      body: scrollBody(lang),
      scripts: ['scroll.js'],
      ld: [appLd(t.scH1, t.scDesc, '/tools/scroll/')]
    },
    drop: {
      title: t.dropTitle,
      desc: t.dropDesc,
      body: dropBody(lang),
      scripts: ['drop.js'],
      ld: [appLd(t.dropH1, t.dropDesc, '/tools/drop-rate/')]
    },
    about: { title: t.aboutTitle, desc: t.aboutDesc, body: prose(t.aboutH1, t.aboutBody) },
    privacy: { title: t.privacyTitle, desc: t.privacyDesc, body: prose(t.privacyH1, t.privacyBody) }
  };

  for (const p of PAGES) {
    write(path.join(lang, p.path, 'index.html'), page({ lang, pageKey: p.key, pagePath: p.path, ...defs[p.key] }));
  }
}

// Root: send visitors to their language; crawlers follow the hreflang links.
write(
  'index.html',
  `${head({ lang: 'en', title: T.en.homeTitle, desc: T.en.homeDesc, pagePath: '/' })}
<body class="root-choice">
<main class="wrap center">
<img src="${href('/assets/favicon.svg')}" alt="" width="56" height="56">
<h1>GMS Hub</h1>
<p class="muted">${esc(T.en.tagline)}<br>${esc(T.ko.tagline)}</p>
<p class="choice"><a class="btn" href="${href('/ko/')}" data-lang="ko">한국어</a> <a class="btn ghost" href="${href('/en/')}" data-lang="en">English</a></p>
</main>
<script>
(function(){var saved;try{saved=localStorage.getItem('cb_lang')}catch(e){}
var lang=saved||((navigator.language||'').toLowerCase().indexOf('ko')===0?'ko':'en');
location.replace('${config.basePath}/'+lang+'/');})();
</script>
<script src="${href('/assets/common.js')}" defer></script>
</body></html>`
);

write(
  '404.html',
  `${head({ lang: 'ko', title: '404 — GMS Hub', desc: T.ko.notFound, noindex: true })}
<body><main class="wrap center"><h1>404</h1><p>${T.ko.notFound}<br>${T.en.notFound}</p>
<p class="choice"><a class="btn" href="${href('/ko/')}">${T.ko.backHome}</a> <a class="btn ghost" href="${href('/en/')}">${T.en.backHome}</a></p></main></body></html>`
);

// Admin is a client-side editor that commits data files through the GitHub API.
write(
  'admin/index.html',
  `${head({ lang: 'ko', title: '관리자 — GMS Hub', desc: 'GMS Hub 데이터 관리', noindex: true })}
<body data-page="admin">
<header class="site-header"><div class="wrap header-inner"><a class="brand" href="${href('/ko/')}"><img src="${href('/assets/favicon.svg')}" alt="" width="28" height="28"><span>GMS Hub 관리자</span></a></div></header>
<main class="wrap" id="admin-root"></main>
${jsonScript('admin-config', config.github)}
<script src="${href('/assets/admin.js')}" defer></script>
</body></html>`
);

const sitemapUrls = PAGES.flatMap((p) =>
  LANGS.map(
    (lang) => `<url><loc>${absUrl(langPath(lang, p.path))}</loc><lastmod>${BUILD_DATE}</lastmod>${LANGS.map(
      (l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${absUrl(langPath(l, p.path))}"/>`
    ).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, p.path))}"/></url>`
  )
).join('\n');
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapUrls}
</urlset>
`
);
// GitHub Pages project sites can't serve a root robots.txt; this one takes effect once a custom domain is set.
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${config.basePath}/admin/\n\nSitemap: ${absUrl('/sitemap.xml')}\n`);
if (config.adsenseClient) {
  write('ads.txt', `google.com, ${config.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
}
write('.nojekyll', '');

fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });

console.log(`Built ${PAGES.length * LANGS.length} pages into dist/ (${BUILD_DATE})`);
