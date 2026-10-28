// Static site generator for GMS Hub. No dependencies: `node scripts/build.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spriteSvg, heroScene } from './sprites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const config = readJson('site.config.json');
const sites = readJson('data/sites.json');
const training = readJson('data/training.json');
const scrolls = readJson('data/scrolls.json');
const drops = readJson('data/drops.json');
const boxes = readJson('data/boxes.json');

const LANGS = ['ko', 'en'];
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const SITE_COUNT = sites.categories.reduce((n, c) => n + c.sites.length, 0);

const T = {
  ko: {
    gameName: '글로벌 메이플스토리 클래식 월드',
    gameBadge: '글로벌 메이플스토리 클래식 월드 전용',
    notice: `수록된 사이트 ${SITE_COUNT}곳 모두 ${sites.checked}에 접속을 확인했어요 · 출처가 확인된 정보만 싣습니다`,
    navLinks: '사이트 모음',
    navTraining: '사냥터 찾기',
    navScroll: '주문서 계산기',
    navDrop: '확률 계산기',
    navAbout: '소개',
    switchLang: 'English',
    homeTitle: '글로벌 메이플스토리 클래식 월드(글클메) 사이트 모음 · 시세 · 공략 · 계산기 | GMS Hub',
    homeDesc: `글로벌 메이플스토리 클래식 월드(글클메) 공식 채널, 디스코드·레딧·디시 커뮤니티, DB·위키, 자유시장 시세, 보스 타이머, 빌드 플래너 ${SITE_COUNT}곳을 접속 확인 후 정리했어요. 레벨별 사냥터 찾기와 주문서 계산기도 있어요.`,
    heroKicker: '글클메 유저를 위한 길잡이',
    heroTitle: '글로벌 클래식 메이플 사이트,<br>여기서 다 찾으세요',
    heroSub: '공식 공지부터 시세, 보스 타이머, 빌드 플래너까지. 흩어진 사이트를 용도별로 모았어요.',
    searchPlaceholder: '사이트 검색 (예: 시세, 디스코드, 보스, 빌드)',
    statSites: '수록 사이트',
    statCats: '카테고리',
    statChecked: '접속 확인',
    purposeHeading: '무엇을 찾으세요?',
    purposes: {
      official: '공지·패치 확인',
      community: '질문·파티 구하기',
      database: '아이템·몬스터 정보',
      guides: '공략 읽기',
      market: '시세 확인',
      timers: '보스 시간 체크',
      planners: '빌드 짜기'
    },
    toc: '카테고리',
    sitesUnit: '곳',
    visit: '바로가기',
    showAll: '전체 보기',
    filtering: '{name}만 보는 중',
    favHeading: '즐겨찾기',
    favDesc: '별(☆)을 누른 사이트가 여기 모여요. 이 브라우저에만 저장돼요.',
    favAdd: '즐겨찾기에 추가',
    favRemove: '즐겨찾기에서 빼기',
    noResults: '검색 결과가 없어요.',
    statSource: '출처',
    langNames: { ko: '한국어', en: 'EN', zh: '中文', ja: '日本語', es: 'ES', pt: 'PT' },
    toolsHeading: 'GMS Hub 자체 도구',
    trCardDesc: '레벨을 넣으면 NiaMeowDB · MS-Classic · Henesys.GG 세 곳의 추천 사냥터를 한 번에 비교해요.',
    scCardDesc: 'Lesser·Intermediate·Greater·Chaos 주문서로 몇 번 붙고 터질 확률이 얼마인지 계산해요.',
    dropCardDesc: '드롭률과 사냥 횟수로 실제로 먹을 확률, 필요한 사냥 횟수를 계산해요.',
    open: '열기',
    faqHeading: '자주 묻는 질문',
    sourcesLabel: '출처',

    trTitle: '글클메 레벨별 사냥터 추천 (3개 사이트 비교) · 글로벌 메이플스토리 클래식 월드 | GMS Hub',
    trDesc: '글로벌 메이플스토리 클래식 월드 1~80레벨 사냥터를 NiaMeowDB, MS-Classic, Henesys.GG 추천과 비교해요. 맵별 몬스터 레벨, 추천 레벨 구간, 시간당 경험치를 한눈에.',
    trH1: '레벨별 사냥터 찾기',
    trLead: '세 사이트의 추천을 맵마다 모았어요. 여러 곳이 같이 추천한 맵이 위에 나와요.',
    level: '내 레벨',
    showSpots: '찾기',
    trResultTitle: '{lv}레벨 추천 사냥터',
    trNone: '이 레벨을 추천 구간에 넣은 출처가 없어요.',
    agree: '{n}곳 추천',
    higher: '내 레벨보다 {d} 높음',
    expHr: '최대 경험치/시간',
    trAll: '전체 사냥터 목록',
    colMap: '맵',
    colMonsters: '몬스터 (레벨)',
    colRecs: '출처별 추천 레벨',
    colExp: '경험치/시간 (NiaMeowDB)',
    caution: '주의',
    trSourcesHeading: '출처',
    noDate: '날짜 표기 없음',

    scTitle: '글클메 주문서 계산기 · 확률 (Lesser·Intermediate·Greater·Chaos) | GMS Hub',
    scDesc: '글로벌 메이플스토리 클래식 월드 주문서 성공률(Lesser 100%, Intermediate 60%, Greater 10%, Chaos 10%)로 성공 횟수 분포, 파괴 확률, 평균 상승치를 계산해요.',
    scH1: '주문서 계산기',
    scLead: '클래식 월드 주문서 등급별 성공률로 결과를 확률로 보여줘요.',
    scTier: '주문서 등급',
    scLadder: '주문서 종류 (상승치)',
    scCustom: '직접 입력',
    scCustomGain: '성공 1회당 상승치',
    scCount: '바를 주문서 개수',
    scPrice: '주문서 1장 가격 (메소)',
    calc: '계산하기',
    resGain: '평균 상승치 (안 터졌을 때)',
    resPass: '평균 성공 횟수 (안 터졌을 때)',
    resAll: '전부 성공할 확률',
    resBoom: '파괴될 확률',
    resUsed: '평균 사용 장수',
    resCost: '평균 비용',
    distHeading: '성공 횟수별 확률',
    distSucc: '{k}번 성공',
    distBoom: '파괴',
    tierTable: '주문서 등급별 확률',
    ladderTable: '종류별 상승치',
    colTier: '등급',
    colSuccess: '성공률',
    colBoom: '실패 시 파괴',
    colLadder: '종류',
    colExpected: '1장당 기대 상승치',

    dropTitle: '글클메 확률 계산기 · 넥슨 공식 상자 확률 | GMS Hub',
    dropDesc: '글로벌 메이플스토리 클래식 월드 확률 계산기. 넥슨 공식 랜덤박스(미스터리 패션 크레이트 등) 확률표와 함께 몇 번 열거나 잡아야 얻는지 계산해요.',
    dropH1: '확률 계산기',
    dropLead: '"1% 템, 100번이면 나오나?" 상자 열기와 몬스터 사냥 모두 계산할 수 있어요.',
    rateInput: '드롭률 (%)',
    rateHint: '예: 1/500이면 0.2',
    killsInput: '시도 횟수 (상자 개수 · 사냥 수)',
    resAtLeastOne: '한 번 이상 얻을 확률',
    resExpected: '기대 획득 개수',
    resNeed50: '50% 확률로 얻으려면',
    resNeed90: '90% 확률로 얻으려면',
    resNeed99: '99% 확률로 얻으려면',
    times: '회',
    boxHeading: '넥슨 공식 상자 확률',
    boxLead: '넥슨이 공지한 글로벌 메이플스토리 클래식 월드 랜덤박스 확률이에요. 아이템을 누르면 계산기에 확률이 들어가요.',
    boxPost: '넥슨 공지 원문',
    colChance: '확률',
    boxUpcoming: '예정 확률',
    boxSearch: '아이템 이름 검색',
    monsterHeading: '몬스터 드롭률',
    monsterNote: '넥슨 공식 확률 페이지에는 랜덤박스 확률만 있고 몬스터 드롭률은 없어요. 그래서 여기에는 출처가 확인된 드롭률만 올려요.',
    dbHeading: '몬스터 드롭률 데이터',
    dbLead: '행을 누르면 계산기에 바로 들어가요.',
    dbSearch: '몬스터나 아이템 이름 검색',
    dbEmpty: '아직 출처가 확인된 드롭률이 없어요. 몬스터별 드롭 목록은 사이트 모음의 DB 사이트에서 볼 수 있어요.',
    colMob: '몬스터',
    colItem: '아이템',
    colRate: '드롭률',
    colSource: '출처',
    colNote: '비고',
    formulaHeading: '계산 방법',
    formula: [
      '한 번 이상 얻을 확률 = 1 − (1 − p)ⁿ',
      '기대 획득 개수 = n × p',
      'c 확률로 얻는 데 필요한 횟수 = ⌈ ln(1 − c) / ln(1 − p) ⌉'
    ],

    dataUpdated: '데이터 갱신',
    aboutTitle: 'GMS Hub 소개',
    aboutDesc: 'GMS Hub는 글로벌 메이플스토리 클래식 월드 유저를 위한 비공식 팬 사이트예요.',
    aboutH1: 'GMS Hub 소개',
    aboutBody: `<p>GMS Hub는 <strong>글로벌 메이플스토리 클래식 월드</strong>를 하는 한국어·영어 유저가 필요한 사이트를 빨리 찾을 수 있게 만든 <strong>비공식 팬 사이트</strong>예요.</p>
<h2>원칙</h2>
<ul><li><strong>출처가 확인된 정보만 실어요.</strong> 사이트 설명은 각 사이트가 공개한 소개문과 메뉴에 있는 기능만 옮기고, 숫자에는 출처와 확인 날짜를 붙여요.</li><li>출처끼리 내용이 다르면 둘 다 보여주고, 확인되지 않은 내용은 확인되지 않았다고 적어요.</li><li>수록한 링크는 모두 접속을 확인했어요. 접속이 안 되는 사이트와 현금 거래 사이트는 올리지 않아요.</li></ul>
<h2>다루는 게임</h2>
<p>클래식 월드 하나만 다뤄요. 다른 메이플스토리 버전과는 맵, 몬스터, 강화 시스템이 달라서 섞지 않아요.</p>
<h2>사이트 추가·오류 제보</h2>
<p><a href="{issues}" target="_blank" rel="noopener">GitHub 이슈</a>로 알려주세요.</p>
<h2>면책</h2>
<p>GMS Hub는 넥슨(NEXON)과 관련이 없어요. MapleStory는 NEXON Korea Corporation의 상표예요. 사이트 썸네일은 각 사이트 화면을 축소한 미리보기이며, 사이트 내용은 각 운영자에게 책임이 있어요. 아이콘과 배너 그림은 GMS Hub가 직접 그린 것이에요.</p>`,
    privacyTitle: '개인정보처리방침 | GMS Hub',
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
    home: '홈',
    notFound: '페이지를 찾을 수 없어요.',
    backHome: '홈으로'
  },
  en: {
    gameName: 'Global MapleStory Classic World',
    gameBadge: 'Global MapleStory Classic World only',
    notice: `All ${SITE_COUNT} listed sites were checked live on ${sites.checked} · Only sourced information`,
    navLinks: 'Site Directory',
    navTraining: 'Training Spots',
    navScroll: 'Scroll Calculator',
    navDrop: 'Odds Calculator',
    navAbout: 'About',
    switchLang: '한국어',
    homeTitle: 'Global MapleStory Classic World Sites: Prices, Guides, Boss Timers & Tools | GMS Hub',
    homeDesc: `Every Global MapleStory Classic World site in one place: official channels, Discord, Reddit and Korean communities, databases and wikis, Free Market price trackers, boss timers and build planners. ${SITE_COUNT} sites, all checked live.`,
    heroKicker: 'Your guide to Classic World on the web',
    heroTitle: 'Every Global Classic World site,<br>in one place',
    heroSub: 'From official notices to price trackers, boss timers and build planners, sorted by what you need.',
    searchPlaceholder: 'Search sites (e.g. prices, discord, boss, build)',
    statSites: 'Sites',
    statCats: 'Categories',
    statChecked: 'Checked live',
    purposeHeading: 'What do you need?',
    purposes: {
      official: 'Notices & patches',
      community: 'Ask & find parties',
      database: 'Items & monsters',
      guides: 'Read guides',
      market: 'Check prices',
      timers: 'Boss respawns',
      planners: 'Plan a build'
    },
    toc: 'Categories',
    sitesUnit: '',
    visit: 'Visit',
    showAll: 'Show all',
    filtering: 'Showing {name} only',
    favHeading: 'Favorites',
    favDesc: 'Sites you star (☆) gather here. Saved in this browser only.',
    favAdd: 'Add to favorites',
    favRemove: 'Remove from favorites',
    noResults: 'No matching sites.',
    statSource: 'Source',
    langNames: { ko: 'Korean', en: 'EN', zh: '中文', ja: '日本語', es: 'ES', pt: 'PT' },
    toolsHeading: 'GMS Hub Tools',
    trCardDesc: 'Enter your level to compare training picks from NiaMeowDB, MS-Classic and Henesys.GG at once.',
    scCardDesc: 'See how many Lesser, Intermediate, Greater or Chaos scrolls pass and how likely a boom is.',
    dropCardDesc: 'Turn a drop rate and kill count into real odds, and see how many kills you need.',
    open: 'Open',
    faqHeading: 'FAQ',
    sourcesLabel: 'Sources',

    trTitle: 'Global MapleStory Classic World Training Spots by Level (3 Sites Compared) | GMS Hub',
    trDesc: 'Where to train in Global MapleStory Classic World from level 1 to 80, comparing picks from NiaMeowDB, MS-Classic and Henesys.GG: monster levels, recommended level ranges and EXP per hour.',
    trH1: 'Training Spot Finder',
    trLead: 'Picks from three sites, merged per map. Maps more sources agree on come first.',
    level: 'My level',
    showSpots: 'Find',
    trResultTitle: 'Training spots for level {lv}',
    trNone: 'No source recommends a map for this level.',
    agree: '{n} sources',
    higher: '{d} above you',
    expHr: 'Max EXP/hr',
    trAll: 'All training spots',
    colMap: 'Map',
    colMonsters: 'Monsters (level)',
    colRecs: 'Recommended levels by source',
    colExp: 'EXP/hr (NiaMeowDB)',
    caution: 'Caution',
    trSourcesHeading: 'Sources',
    noDate: 'undated',

    scTitle: 'Global MapleStory Classic World Scroll Calculator: Lesser, Intermediate, Greater & Chaos Odds | GMS Hub',
    scDesc: 'Classic World scroll odds (Lesser 100%, Intermediate 60%, Greater 10%, Chaos 10%): pass distribution, boom chance and expected stat gain.',
    scH1: 'Scroll Calculator',
    scLead: 'Outcome odds using Classic World scroll tiers.',
    scTier: 'Scroll tier',
    scLadder: 'Scroll type (gain)',
    scCustom: 'Custom',
    scCustomGain: 'Gain per pass',
    scCount: 'Scrolls to apply',
    scPrice: 'Price per scroll (mesos)',
    calc: 'Calculate',
    resGain: 'Average gain (if not boomed)',
    resPass: 'Average passes (if not boomed)',
    resAll: 'Chance all pass',
    resBoom: 'Boom chance',
    resUsed: 'Average scrolls used',
    resCost: 'Average cost',
    distHeading: 'Odds by number of passes',
    distSucc: '{k} passed',
    distBoom: 'Boomed',
    tierTable: 'Odds by tier',
    ladderTable: 'Gains by type',
    colTier: 'Tier',
    colSuccess: 'Success',
    colBoom: 'Boom on fail',
    colLadder: 'Type',
    colExpected: 'Expected gain per scroll',

    dropTitle: 'Global MapleStory Classic World Drop Rate Calculator & Official Box Rates | GMS Hub',
    dropDesc: 'Global MapleStory Classic World probability calculator with Nexon\'s official random box rates (Mystery Fashion Crates and more): see how many opens or kills you need.',
    dropH1: 'Odds Calculator',
    dropLead: '"It\'s 1% — will 100 tries do it?" Works for box opens and monster kills alike.',
    rateInput: 'Drop rate (%)',
    rateHint: 'e.g. 1 in 500 is 0.2',
    killsInput: 'Attempts (boxes opened or kills)',
    resAtLeastOne: 'Chance of at least one',
    resExpected: 'Expected drops',
    resNeed50: 'Kills for 50% odds',
    resNeed90: 'Kills for 90% odds',
    resNeed99: 'Kills for 99% odds',
    times: '',
    boxHeading: 'Official Nexon Box Rates',
    boxLead: 'Random box rates Nexon has published for Global MapleStory Classic World. Click an item to load its rate into the calculator.',
    boxPost: 'Nexon notice',
    colChance: 'Rate',
    boxUpcoming: 'Upcoming rates',
    boxSearch: 'Search items',
    monsterHeading: 'Monster Drop Rates',
    monsterNote: 'Nexon\'s official rates page lists random box rates only, with no monster drop rates, so we only add drop rates with a confirmed source.',
    dbHeading: 'Monster Drop Rate Data',
    dbLead: 'Click a row to load it into the calculator.',
    dbSearch: 'Search monster or item',
    dbEmpty: 'No sourced drop rates yet. Monster drop lists are on the database sites in the directory.',
    colMob: 'Monster',
    colItem: 'Item',
    colRate: 'Rate',
    colSource: 'Source',
    colNote: 'Note',
    formulaHeading: 'How it works',
    formula: [
      'Chance of at least one = 1 − (1 − p)ⁿ',
      'Expected drops = n × p',
      'Kills needed for chance c = ⌈ ln(1 − c) / ln(1 − p) ⌉'
    ],

    dataUpdated: 'Data updated',
    aboutTitle: 'About GMS Hub',
    aboutDesc: 'GMS Hub is an unofficial fan site for Global MapleStory Classic World players.',
    aboutH1: 'About GMS Hub',
    aboutBody: `<p>GMS Hub is an <strong>unofficial fan site</strong> that helps English- and Korean-speaking <strong>Global MapleStory Classic World</strong> players find the right site fast.</p>
<h2>Principles</h2>
<ul><li><strong>Only sourced information.</strong> Site descriptions come from each site's own blurb and menus, and every number carries its source and check date.</li><li>When sources disagree we show both, and anything unconfirmed is labeled as such.</li><li>Every listed link was checked live. We never list dead or real-money trading sites.</li></ul>
<h2>Which game</h2>
<p>Classic World only. Other MapleStory versions have different maps, monsters and upgrade systems, so we keep them out.</p>
<h2>Suggest a site or report an error</h2>
<p>Open a <a href="{issues}" target="_blank" rel="noopener">GitHub issue</a>.</p>
<h2>Disclaimer</h2>
<p>GMS Hub is not affiliated with NEXON. MapleStory is a trademark of NEXON Korea Corporation. Site thumbnails are scaled-down previews of each site, whose content is the responsibility of its operators. Icons and banner art are drawn by GMS Hub.</p>`,
    privacyTitle: 'Privacy Policy | GMS Hub',
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
    home: 'Home',
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
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (p) => `${config.basePath}${p}`;
const absUrl = (p) => `${config.baseUrl}${config.basePath}${p}`;
const langPath = (lang, p) => `/${lang}${p}`;
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const jsonScript = (id, data) =>
  `<script id="${id}" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const srcLink = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || host(url))}</a>`;

function head({ lang, title, desc, pagePath, noindex, ld = [] }) {
  const alternates = pagePath
    ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${absUrl(langPath(l, pagePath))}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, pagePath))}">`
    : '';
  const canonical = pagePath ? absUrl(langPath(lang, pagePath)) : absUrl('/');
  const ogImage = absUrl(`/assets/og-${lang}.png`);
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
${noindex ? '<meta name="robots" content="noindex">' : `<meta name="robots" content="index, follow, max-image-preview:large">\n<link rel="canonical" href="${canonical}">`}
${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${lang === 'ko' ? 'ko_KR' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'ko' ? 'en_US' : 'ko_KR'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#0f1420">
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
  const tabs = [
    ['/', 'book', t.navLinks],
    ['/tools/training/', 'sword', t.navTraining],
    ['/tools/scroll/', 'scroll', t.navScroll],
    ['/tools/drop-rate/', 'bag', t.navDrop]
  ]
    .map(
      ([p, icon, label]) =>
        `<a class="tab" href="${href(langPath(lang, p))}"${p === pagePath ? ' aria-current="page"' : ''}>${spriteSvg(icon, 20)}<span>${label}</span></a>`
    )
    .join('');
  return `<div class="topbar"><div class="wrap">✔ ${esc(t.notice)}</div></div>
<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${href(langPath(lang, '/'))}">${spriteSvg('mushroom', 34)}<span><strong>GMS Hub</strong><small>${esc(t.gameName)}</small></span></a>
<nav class="tabs" aria-label="${esc(t.navLinks)}">${tabs}</nav>
<a class="lang-switch" href="${href(langPath(other, pagePath || '/'))}" data-lang="${other}" hreflang="${other}">${t.switchLang}</a>
</div></header>`;
}

function footer(lang) {
  const t = T[lang];
  return `<footer class="site-footer"><div class="wrap">
<div class="footer-brand">${spriteSvg('mushroom', 24)}<strong>GMS Hub</strong></div>
<p>${esc(t.footerDisclaimer)}</p>
<p><a href="${href(langPath(lang, '/about/'))}">${t.navAbout}</a> · <a href="${href(langPath(lang, '/privacy/'))}">${t.privacy}</a> · <a href="${issuesUrl}" target="_blank" rel="noopener">GitHub</a></p>
</div></footer>`;
}

function page({ lang, pageKey, pagePath, title, desc, body, scripts = [], ld = [] }) {
  return `${head({ lang, title, desc, pagePath, ld })}
<body data-page="${pageKey}">
${header(lang, pagePath)}
<main>${body}</main>
${footer(lang)}
<script src="${href('/assets/common.js')}" defer></script>
${scripts.map((s) => `<script src="${href(`/assets/${s}`)}" defer></script>`).join('\n')}
</body>
</html>`;
}

const breadcrumbLd = (lang, name, p) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: T[lang].home, item: absUrl(langPath(lang, '/')) },
    { '@type': 'ListItem', position: 2, name, item: absUrl(langPath(lang, p)) }
  ]
});

const pageHead = (lang, icon, h1, lead) =>
  `<section class="page-head wrap"><span class="badge-game">${esc(T[lang].gameBadge)}</span><h1>${spriteSvg(icon, 36)}${h1}</h1><p class="lead">${esc(lead)}</p></section>`;

// ---------- home ----------

function siteCard(lang, s) {
  const t = T[lang];
  const media = s.shot
    ? `<img src="${href(`/assets/shots/${s.shot}.jpg`)}" alt="${esc(s.name)} ${lang === 'ko' ? '화면' : 'screenshot'}" width="640" height="400" loading="lazy" decoding="async">`
    : `<div class="tile" style="--tint:${esc(s.tint || '#ff8a1f')}">${spriteSvg(s.icon || 'chat', 64)}<span>${esc(host(s.url))}</span></div>`;
  const langs = s.langs.map((l) => `<span class="lang ${l}">${esc(t.langNames[l] || l)}</span>`).join('');
  const feats = s.features[lang].map((f) => `<li>${esc(f)}</li>`).join('');
  const stat = s.stat
    ? `<p class="stat-line"><strong>${esc(s.stat[lang])}</strong> <span>${t.statSource}: ${esc(s.stat.source)} · ${esc(s.stat.date)}</span></p>`
    : '';
  const search = `${s.name} ${host(s.url)} ${s.desc.ko} ${s.desc.en} ${s.features.ko.join(' ')} ${s.features.en.join(' ')}`.toLowerCase();
  return `<article class="site-card" data-url="${esc(s.url)}" data-search="${esc(search)}">
<a class="media" href="${esc(s.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${media}<span class="langs">${langs}</span></a>
<button class="fav" type="button" data-url="${esc(s.url)}" aria-pressed="false" aria-label="${esc(t.favAdd)}: ${esc(s.name)}" title="${esc(t.favAdd)}">☆</button>
<div class="body">
<h4><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></h4>
<span class="host">${esc(host(s.url))}</span>
<p>${esc(s.desc[lang])}</p>
<ul class="feats">${feats}</ul>
${stat}
<a class="visit" href="${esc(s.url)}" target="_blank" rel="noopener">${t.visit} ↗</a>
</div>
</article>`;
}

function homeBody(lang) {
  const t = T[lang];
  const cats = sites.categories;
  const purposes = cats
    .map(
      (c) =>
        `<button class="purpose" type="button" data-filter="${c.id}" aria-pressed="false">${spriteSvg(c.icon, 36)}<span>${esc(t.purposes[c.id])}</span><small>${esc(c.name[lang])} · ${c.sites.length}${t.sitesUnit}</small></button>`
    )
    .join('');
  const toc = cats
    .map((c) => `<a href="#${c.id}">${spriteSvg(c.icon, 20)}<span>${esc(c.name[lang])}</span><b>${c.sites.length}</b></a>`)
    .join('');
  const sections = cats
    .map(
      (c) => `<section class="cat" id="${c.id}" data-cat data-name="${esc(c.name[lang])}">
<header class="cat-head">${spriteSvg(c.icon, 40)}<div><h3>${esc(c.name[lang])} <span>${c.sites.length}</span></h3><p>${esc(c.desc[lang])}</p></div></header>
<div class="cards">${c.sites.map((s) => siteCard(lang, s)).join('')}</div>
</section>`
    )
    .join('');
  const faq = sites.faq
    .map(
      (f) =>
        `<details><summary>${esc(f.q[lang])}</summary><p>${esc(f.a[lang])}</p>${
          f.sources.length ? `<p class="src">${t.sourcesLabel}: ${f.sources.map((u) => srcLink(u)).join(' · ')}</p>` : ''
        }</details>`
    )
    .join('');
  const tool = (p, icon, title, desc) =>
    `<a class="tool-card" href="${href(langPath(lang, p))}">${spriteSvg(icon, 44)}<strong>${title}</strong><p>${esc(desc)}</p><span>${t.open} →</span></a>`;
  return `<section class="hero">
${heroScene()}
<div class="wrap hero-inner">
<div class="hero-card">
<span class="kicker">${esc(t.heroKicker)}</span>
<h1>${t.heroTitle}</h1>
<p>${esc(t.heroSub)}</p>
<label class="search-box">🔍<input id="site-search" type="search" placeholder="${esc(t.searchPlaceholder)}" aria-label="${esc(t.searchPlaceholder)}"></label>
<dl class="hero-stats"><div><dt>${t.statSites}</dt><dd>${SITE_COUNT}</dd></div><div><dt>${t.statCats}</dt><dd>${cats.length}</dd></div><div><dt>${t.statChecked}</dt><dd>${esc(sites.checked)}</dd></div></dl>
</div>
</div>
</section>
<section class="wrap purposes-wrap">
<h2>${t.purposeHeading}</h2>
<div class="purposes">${purposes}</div>
</section>
<div class="wrap directory">
<aside class="toc"><nav><h2>${t.toc}</h2><a href="#favorites" id="fav-toc" hidden>${spriteSvg('star', 20)}<span>${t.favHeading}</span><b id="fav-count">0</b></a>${toc}</nav></aside>
<div class="dir-main" data-fav-add="${esc(t.favAdd)}" data-fav-remove="${esc(t.favRemove)}" data-filtering="${esc(t.filtering)}">
<p class="filter-bar" id="filter-bar" hidden><span id="filter-label"></span> <button type="button" class="btn ghost small-btn" id="filter-clear">${t.showAll}</button></p>
<section class="cat favorites" id="favorites" hidden>
<header class="cat-head">${spriteSvg('star', 40)}<div><h3>${t.favHeading} <span id="fav-count-2">0</span></h3><p>${esc(t.favDesc)}</p></div></header>
<div class="cards" id="fav-cards"></div>
</section>
${sections}
<p id="no-results" class="empty" hidden>${t.noResults}</p>
</div>
</div>
<section class="wrap">
<h2>${t.toolsHeading}</h2>
<div class="tool-cards">
${tool('/tools/training/', 'sword', t.navTraining, t.trCardDesc)}
${tool('/tools/scroll/', 'scroll', t.navScroll, t.scCardDesc)}
${tool('/tools/drop-rate/', 'bag', t.navDrop, t.dropCardDesc)}
</div>
</section>
<section class="wrap faq">
<h2>${t.faqHeading}</h2>
${faq}
</section>`;
}

// ---------- training ----------

function trainingBody(lang) {
  const t = T[lang];
  const nf = new Intl.NumberFormat(lang);
  const src = training.sources;
  const minRec = (s) => Math.min(...s.recs.map((r) => r.min));
  const sorted = [...training.spots].sort((a, b) => minRec(a) - minRec(b) || a.map.localeCompare(b.map));
  const rows = sorted
    .map((s) => {
      const caution = training.cautions.find((c) => c.map === s.map);
      return `<tr><td><strong>${esc(s.map)}</strong>${caution ? `<div class="caution">⚠ ${esc(caution.text[lang])}</div>` : ''}</td><td>${
        s.monsters.map((m) => `${esc(m.name)} <span class="lv">${m.level}</span>`).join('<br>') || '—'
      }</td><td>${s.recs.map((r) => `<span class="rec ${r.source}">${esc(src[r.source].name)} ${r.min}–${r.max}</span>`).join(' ')}</td><td>${
        s.meowdbExpHr ? nf.format(s.meowdbExpHr) : '—'
      }</td></tr>`;
    })
    .join('');
  const sourceList = Object.entries(src)
    .map(([, s]) => `<li>${srcLink(s.url, s.name)}${s.urls ? ` (${s.urls.map((u, i) => srcLink(u, `${i + 1}`)).join(', ')})` : ''} · ${s.date || t.noDate}</li>`)
    .join('');
  return `${pageHead(lang, 'sword', t.trH1, t.trLead)}
<div class="wrap">
<form id="tr-form" class="panel inline-form">
<label>${t.level}<input type="number" name="lv" min="1" max="100" value="21" inputmode="numeric"></label>
<button class="btn" type="submit">${t.showSpots}</button>
</form>
<section id="tr-result" aria-live="polite"></section>
<section>
<h2>${t.trAll}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colMap}</th><th>${t.colMonsters}</th><th>${t.colRecs}</th><th>${t.colExp}</th></tr></thead><tbody>${rows}</tbody></table></div>
<ul class="notes">${training.notes[lang].map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
<h3>${t.trSourcesHeading}</h3>
<ul class="notes">${sourceList}</ul>
</section>
</div>
${jsonScript('training-data', training)}
${jsonScript('i18n', { lang, trResultTitle: t.trResultTitle, trNone: t.trNone, agree: t.agree, higher: t.higher, expHr: t.expHr, caution: t.caution })}`;
}

// ---------- scrolls ----------

function scrollBody(lang) {
  const t = T[lang];
  const tierOpts = scrolls.tiers.map((s) => `<option value="${s.id}"${s.id === 'intermediate' ? ' selected' : ''}>${esc(s.name)} (${s.success}%)</option>`).join('');
  const ladderOpts =
    scrolls.ladders.map((l) => `<option value="${l.id}">${esc(l.name[lang])}</option>`).join('') + `<option value="custom">${t.scCustom}</option>`;
  const tierRows = scrolls.tiers.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.success}%</td><td>${s.destroyOnFail ? `${s.destroyOnFail}%` : '—'}</td></tr>`).join('');
  const ladderRows = scrolls.ladders
    .map(
      (l) =>
        `<tr><td>${esc(l.name[lang])}</td>${scrolls.tiers.map((s) => `<td>+${l.gains[s.id]}</td>`).join('')}<td>${scrolls.tiers
          .map((s) => `${s.name[0]} ${Math.round(l.gains[s.id] * s.success) / 100}`)
          .join(' · ')}</td></tr>`
    )
    .join('');
  return `${pageHead(lang, 'scroll', t.scH1, t.scLead)}
<div class="wrap">
<div class="tool-layout">
<form id="sc-form" class="panel form">
<label>${t.scTier}<select name="tier">${tierOpts}</select></label>
<label>${t.scLadder}<select name="ladder">${ladderOpts}</select></label>
<label id="custom-gain" hidden>${t.scCustomGain}<input type="number" name="gain" value="2" min="0" step="any"></label>
<label>${t.scCount}<input type="number" name="count" value="7" min="1" max="15" required></label>
<label>${t.scPrice}<input type="number" name="price" value="0" min="0" step="1000"></label>
<button type="submit" class="btn">${t.calc}</button>
</form>
<div class="panel results" id="sc-results" aria-live="polite">
<div class="stat big"><span>${t.resGain}</span><strong data-k="gain">—</strong></div>
<div class="stats">
<div class="stat"><span>${t.resPass}</span><strong data-k="pass">—</strong></div>
<div class="stat"><span>${t.resAll}</span><strong data-k="all">—</strong></div>
<div class="stat"><span>${t.resBoom}</span><strong data-k="boom">—</strong></div>
<div class="stat"><span>${t.resUsed}</span><strong data-k="used">—</strong></div>
<div class="stat"><span>${t.resCost}</span><strong data-k="cost">—</strong></div>
</div>
<h3>${t.distHeading}</h3>
<div id="sc-dist" class="dist"></div>
</div>
</div>
<section>
<h2>${t.tierTable}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colTier}</th><th>${t.colSuccess}</th><th>${t.colBoom}</th></tr></thead><tbody>${tierRows}</tbody></table></div>
<h2>${t.ladderTable}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colLadder}</th>${scrolls.tiers.map((s) => `<th>${esc(s.name)}</th>`).join('')}<th>${t.colExpected}</th></tr></thead><tbody>${ladderRows}</tbody></table></div>
<ul class="notes"><li>${esc(scrolls.disputed[lang])}</li><li>${esc(scrolls.unknown[lang])}</li></ul>
<p class="src">${t.sourcesLabel}: ${scrolls.sources.map((s) => `${srcLink(s.url, s.name)}${s.date ? ` (${s.date})` : ''}`).join(' · ')}</p>
</section>
</div>
${jsonScript('scroll-data', scrolls)}
${jsonScript('i18n', { lang, distSucc: t.distSucc, distBoom: t.distBoom })}`;
}

// ---------- drops ----------

function dropBody(lang) {
  const t = T[lang];
  const rows = drops.entries.length
    ? drops.entries
        .map(
          (d) => `<tr data-rate="${esc(d.rate)}" data-search="${esc(`${d.monster} ${d.item}`.toLowerCase())}" tabindex="0">
<td>${esc(d.monster)}</td><td>${esc(d.item)}</td><td>${esc(d.rate)}%</td><td>${d.source ? srcLink(d.source) : '—'}</td><td>${esc(d.note || '')}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="muted">${t.dbEmpty}</td></tr>`;
  return `${pageHead(lang, 'bag', t.dropH1, t.dropLead)}
<div class="wrap">
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
<section id="boxes">
<h2>${t.boxHeading}</h2>
<p class="muted">${esc(t.boxLead)}</p>
<nav class="chips box-tabs" role="tablist">${boxes.boxes
    .map((bx, i) => `<button type="button" class="chip" role="tab" data-box="${bx.id}" aria-selected="${i === 0}">${esc(bx.name)}</button>`)
    .join('')}</nav>
${boxes.boxes
  .map(
    (bx, i) => `<div class="box-panel" data-box-panel="${bx.id}"${i === 0 ? '' : ' hidden'}>
${bx.tables
  .map(
    (tb) => `<h3>${esc(tb.title)}${tb.phase === 'upcoming' ? ` <span class="badge-game">${t.boxUpcoming}</span>` : ''}</h3>
${tb.phase === 'upcoming' && bx.effective ? `<p class="muted small">${esc(bx.effective)}</p>` : ''}
<div class="table-wrap"><table class="data clickable box-table"><thead><tr><th>${t.colItem}</th><th>${t.colChance}</th></tr></thead><tbody>${tb.items
      .map((it) => `<tr data-rate="${it.rate}" data-search="${esc(it.name.toLowerCase())}" tabindex="0"><td>${esc(it.name)}</td><td>${it.rate}%</td></tr>`)
      .join('')}</tbody></table></div>`
  )
  .join('')}
<p class="src">${t.sourcesLabel}: ${srcLink(bx.url, `${t.boxPost} (${bx.name})`)}</p>
</div>`
  )
  .join('')}
<p class="muted small">${esc(boxes.note[lang])} · ${srcLink(boxes.source, 'nexon.com')} · ${t.dataUpdated}: ${esc(boxes.updated)}</p>
</section>
<section>
<h2>${t.monsterHeading}</h2>
<p class="muted">${esc(t.monsterNote)}</p>
<p class="muted">${esc(t.dbLead)}</p>
<input id="db-search" class="search-small" type="search" placeholder="${esc(t.dbSearch)}" aria-label="${esc(t.dbSearch)}">
<div class="table-wrap"><table class="data clickable" id="drop-db"><thead><tr><th>${t.colMob}</th><th>${t.colItem}</th><th>${t.colRate}</th><th>${t.colSource}</th><th>${t.colNote}</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted small">${t.dataUpdated}: ${esc(drops.updated)}</p>
</section>
<section>
<h2>${t.formulaHeading}</h2>
<ul class="notes">${t.formula.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
</section>
</div>
${jsonScript('i18n', { lang, times: t.times })}`;
}

const prose = (h1, body) => `<article class="wrap prose"><h1>${h1}</h1>${body.replaceAll('{issues}', issuesUrl)}</article>`;

// ---------- write ----------

fs.rmSync(out, { recursive: true, force: true });
const write = (rel, content) => {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

for (const lang of LANGS) {
  const t = T[lang];
  const homeUrl = absUrl(langPath(lang, '/'));
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName,
    url: homeUrl,
    inLanguage: lang,
    description: t.homeDesc,
    about: { '@type': 'VideoGame', name: 'MapleStory Classic World', publisher: { '@type': 'Organization', name: 'NEXON' } },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${homeUrl}?q={search_term_string}` },
      'query-input': 'required name=search_term_string'
    }
  };
  const directoryLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t.navLinks,
    numberOfItems: SITE_COUNT,
    itemListElement: sites.categories
      .flatMap((c) => c.sites)
      .map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: s.url, description: s.desc[lang] }))
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: sites.faq.map((f) => ({ '@type': 'Question', name: f.q[lang], acceptedAnswer: { '@type': 'Answer', text: f.a[lang] } }))
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
    home: { title: t.homeTitle, desc: t.homeDesc, body: homeBody(lang), scripts: ['home.js'], ld: [websiteLd, directoryLd, faqLd] },
    training: {
      title: t.trTitle,
      desc: t.trDesc,
      body: trainingBody(lang),
      scripts: ['training.js'],
      ld: [appLd(t.trH1, t.trDesc, '/tools/training/'), breadcrumbLd(lang, t.trH1, '/tools/training/')]
    },
    scroll: {
      title: t.scTitle,
      desc: t.scDesc,
      body: scrollBody(lang),
      scripts: ['scroll.js'],
      ld: [appLd(t.scH1, t.scDesc, '/tools/scroll/'), breadcrumbLd(lang, t.scH1, '/tools/scroll/')]
    },
    drop: {
      title: t.dropTitle,
      desc: t.dropDesc,
      body: dropBody(lang),
      scripts: ['drop.js'],
      ld: [appLd(t.dropH1, t.dropDesc, '/tools/drop-rate/'), breadcrumbLd(lang, t.dropH1, '/tools/drop-rate/')]
    },
    about: { title: t.aboutTitle, desc: t.aboutDesc, body: prose(t.aboutH1, t.aboutBody), ld: [breadcrumbLd(lang, t.aboutH1, '/about/')] },
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
${spriteSvg('mushroom', 64)}
<h1>GMS Hub</h1>
<p class="muted">Global MapleStory Classic World · 글로벌 메이플스토리 클래식 월드</p>
<p class="choice"><a class="btn" href="${href('/ko/')}" data-lang="ko">한국어</a> <a class="btn ghost" href="${href('/en/')}" data-lang="en">English</a></p>
</main>
<script>
(function(){var saved;try{saved=localStorage.getItem('cb_lang')}catch(e){}
var lang=saved||((navigator.language||'').toLowerCase().indexOf('ko')===0?'ko':'en');
location.replace('${config.basePath}/'+lang+'/'+location.search);})();
</script>
<script src="${href('/assets/common.js')}" defer></script>
</body></html>`
);

write(
  '404.html',
  `${head({ lang: 'ko', title: '404 | GMS Hub', desc: T.ko.notFound, noindex: true })}
<body><main class="wrap center">${spriteSvg('slime', 64)}<h1>404</h1><p>${T.ko.notFound}<br>${T.en.notFound}</p>
<p class="choice"><a class="btn" href="${href('/ko/')}">${T.ko.backHome}</a> <a class="btn ghost" href="${href('/en/')}">${T.en.backHome}</a></p></main></body></html>`
);

// Admin is a client-side editor that commits data files through the GitHub API.
write(
  'admin/index.html',
  `${head({ lang: 'ko', title: '관리자 | GMS Hub', desc: 'GMS Hub 데이터 관리', noindex: true })}
<body data-page="admin">
<header class="site-header"><div class="wrap header-inner"><a class="brand" href="${href('/ko/')}">${spriteSvg('mushroom', 34)}<span><strong>GMS Hub</strong><small>관리자</small></span></a></div></header>
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

console.log(`Built ${PAGES.length * LANGS.length} pages, ${SITE_COUNT} sites into dist/ (${BUILD_DATE})`);
