// Static site generator for GMS Hub. No dependencies: `node scripts/build.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spriteSvg, heroScene } from './sprites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const config = readJson('site.config.json');
const sites = readJson('data/sites.json');
const training = readJson('data/training.json');
const itemsData = readJson('data/items.json');
const scrolls = readJson('data/scrolls.json');
const drops = readJson('data/drops.json');
const boxes = readJson('data/boxes.json');
// Long-form articles; each body lives in data/guides/<slug>.<lang>.html and exists in one language only.
const guides = readJson('data/guides.json').guides.map((g) => ({
  ...g,
  body: fs.readFileSync(path.join(root, 'data', 'guides', `${g.slug}.${g.lang}.html`), 'utf8')
}));

const LANGS = ['ko', 'en'];
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const SITE_COUNT = sites.categories.reduce((n, c) => n + c.sites.length, 0);
const CHECKED_SITE_COUNT = sites.categories.flatMap((c) => c.sites).filter((s) => s.checked !== false).length;

const T = {
  ko: {
    gameName: '글로벌 메이플스토리 클래식 월드',
    gameBadge: '글로벌 메이플스토리 클래식 월드 전용',
    notice: `수록 링크 ${SITE_COUNT}개 · ${CHECKED_SITE_COUNT}개 접속 확인 (${sites.checked}) · 미확인 링크는 별도 표시해요`,
    navLinks: '사이트 모음',
    navTraining: '사냥터 찾기',
    navScroll: '주문서 계산기',
    navDrop: '확률 계산기',
    navPrice: '시세 검색',
    navMarket: '실시간 시세',
    navAbout: '소개',
    navGuides: '가이드',
    switchLang: 'English',
    homeTitle: '글로벌 메이플스토리 클래식 월드(글클메) 사이트 모음 · 시세 · 공략 · 계산기 | GMS Hub',
    homeDesc: `글로벌 메이플스토리 클래식 월드(글클메) 공식 채널, 디스코드·레딧·디시 커뮤니티, DB·위키, 자유시장 시세, 보스 타이머, 빌드 플래너 ${SITE_COUNT}곳을 용도별로 정리했어요. 레벨별 사냥터 찾기와 주문서 계산기도 있어요.`,
    heroKicker: '글클메 유저를 위한 길잡이',
    heroTitle: '아이템·시세·유용한 사이트, <br>한 번에 찾아보세요',
    heroSub: '아이템부터 공략과 도구까지 한곳에서 검색하고, 필요한 사이트로 바로 이동하세요.',
    searchPlaceholder: '아이템, 사이트, 도구 검색',
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
    recommend: '추천',
    sortPopular: '추천순',
    sortDefault: '기본순',
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
    trBandNav: '레벨 구간별 사냥터',
    trBandTitle: '글클메 {a}~{b}레벨 사냥터 추천 ({n}곳 비교) · 글로벌 메이플스토리 클래식 월드 | GMS Hub',
    trBandDesc: '글로벌 메이플스토리 클래식 월드 {a}~{b}레벨 사냥터 {n}곳을 NiaMeowDB, MS-Classic, Henesys.GG 추천과 비교했어요. {maps} 등 맵별 몬스터 레벨과 시간당 경험치.',
    trBandH1: '{a}~{b}레벨 사냥터',
    trBandLead: '{a}~{b}레벨을 추천 구간에 넣은 맵 {n}곳이에요. 여러 출처가 함께 추천한 맵이 위에 나와요.',
    trBandFinder: '내 레벨로 바로 찾기 →',
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
<ul><li><strong>출처가 확인된 정보만 실어요.</strong> 사이트 설명은 각 사이트가 공개한 소개문과 메뉴에 있는 기능만 옮기고, 숫자에는 출처와 확인 날짜를 붙여요.</li><li>출처끼리 내용이 다르면 둘 다 보여주고, 확인되지 않은 내용은 확인되지 않았다고 적어요.</li><li>접속을 확인한 링크와 아직 확인하지 못한 참고 링크를 구분해 표시해요. 현금 거래 사이트는 올리지 않아요.</li></ul>
<h2>다루는 게임</h2>
<p>클래식 월드 하나만 다뤄요. 다른 메이플스토리 버전과는 맵, 몬스터, 강화 시스템이 달라서 섞지 않아요.</p>
<h2>사이트 추가·오류 제보·문의</h2>
<p>이메일 <a href="mailto:kwonth211@gmail.com">kwonth211@gmail.com</a> 또는 <a href="{issues}" target="_blank" rel="noopener">GitHub 이슈</a>로 알려주세요. 사이트 운영자가 설명 수정이나 삭제를 원할 때도 같은 곳으로 연락하면 돼요.</p>
<h2>면책</h2>
<p>GMS Hub는 넥슨(NEXON)과 관련이 없어요. MapleStory는 NEXON Korea Corporation의 상표예요. 사이트 썸네일은 각 사이트 화면을 축소한 미리보기이며, 사이트 내용은 각 운영자에게 책임이 있어요. 아이콘과 배너 그림은 GMS Hub가 직접 그린 것이에요.</p>`,
    privacyTitle: '개인정보처리방침 | GMS Hub',
    privacyDesc: 'GMS Hub의 개인정보처리방침과 쿠키 사용 안내.',
    privacyH1: '개인정보처리방침',
    privacyBody: `<p>GMS Hub는 회원가입이 없고, 이름이나 이메일 같은 개인정보를 직접 수집하지 않아요. 아래는 사이트를 이용할 때 처리되는 정보와 그 목적이에요.</p>
<h2>쿠키와 광고</h2>
<p>이 사이트는 Google AdSense 광고를 게재할 수 있어요. Google을 비롯한 제3자 광고 업체는 쿠키를 사용해 사용자가 이 사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 보여줘요. Google은 광고 쿠키로 사용자에게 맞춤 광고를 제공해요.</p>
<p>맞춤 광고는 <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google 광고 설정</a>에서 끌 수 있고, 다른 광고 업체의 맞춤 광고는 <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener">aboutads.info</a>에서 끌 수 있어요. 맞춤 광고를 꺼도 일반 광고는 보일 수 있어요. 자세한 내용은 <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">Google이 파트너 사이트의 정보를 사용하는 방식</a>을 참고하세요.</p>
<p>유럽경제지역(EEA), 영국, 스위스에서 접속하면 Google 인증 동의 관리 도구로 광고 쿠키 사용에 대한 동의를 먼저 받아요.</p>
<h2>방문 통계</h2>
<p>사이트 개선을 위해 Cloudflare Web Analytics, Google Analytics, Microsoft Clarity로 방문 통계를 수집해요. 방문한 페이지, 체류 시간, 클릭한 버튼과 링크, 스크롤 같은 사용 기록이 익명으로 집계되며, Clarity는 개선을 위해 화면 이용 과정을 기록할 수 있어요. 검색창 등 입력값은 기록에서 가려져요. 자세한 내용은 <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google 개인정보처리방침</a>과 <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener">Microsoft 개인정보처리방침</a>을 참고하세요.</p>
<h2>추천 기능</h2>
<p>사이트 카드의 👍 추천을 누르면 같은 사람이 한 사이트를 여러 번 추천하지 못하게, 접속 IP 주소를 비밀 값과 섞어 되돌릴 수 없는 해시로 바꾼 뒤 추천한 사이트·시각과 함께 Cloudflare에 저장해요. IP 주소 원문은 저장하지 않아요. 추천 수를 보여주는 것 말고는 쓰지 않으며, 삭제를 원하면 아래 연락처로 알려주세요.</p>${config.priceReports ? `
<h2>시세 제보</h2>
<p>시세 검색에서 가격을 올리면 아이템·가격·종류(팔림/파는 중/삽니다)·시각을 Cloudflare에 저장하고 모든 방문자에게 통계로 보여 줘요. 도배를 막기 위해 IP 주소를 추천 기능과 같은 방식의 되돌릴 수 없는 해시로 바꿔 함께 저장하며, IP 주소 원문은 저장하지 않아요.</p>` : ''}
<h2>상점 스캔</h2>
<p>상점 스캔에서 공유한 게임 화면은 사용자의 브라우저 안에서만 읽고, 화면 이미지는 어디에도 보내지 않아요. 읽어 낸 아이템·가격·판매 여부와 함께 게임 안에 공개적으로 표시되는 상점 주인의 캐릭터 이름, 채널, 자유시장 방 번호를 Cloudflare에 저장하고 시세 통계와 '방금 올라온 매물'로 보여 줘요. 도배를 막기 위해 IP 주소를 되돌릴 수 없는 해시로 바꿔 함께 저장하며, IP 주소 원문은 저장하지 않아요. 자신의 캐릭터 정보 삭제를 원하면 아래 연락처로 알려 주세요.</p>
<h2>브라우저 저장소</h2>
<p>언어 선택, 즐겨찾기, 추천한 사이트 목록은 사용자의 브라우저(localStorage)에만 저장되고 서버로 전송되지 않아요. 브라우저의 사이트 데이터를 지우면 함께 지워져요.</p>
<h2>어린이</h2>
<p>GMS Hub는 만 14세 미만 어린이의 개인정보를 의도적으로 수집하지 않아요.</p>
<h2>변경</h2>
<p>이 방침이 바뀌면 이 페이지에 바로 반영하고 시행일을 고쳐 적어요.</p>
<h2>문의</h2>
<p>이메일 <a href="mailto:kwonth211@gmail.com">kwonth211@gmail.com</a> 또는 <a href="{issues}" target="_blank" rel="noopener">GitHub 이슈</a>로 연락해 주세요.</p>
<p class="muted">시행일: 2026-10-30</p>`,
    termsTitle: '이용약관 | GMS Hub',
    termsDesc: 'GMS Hub 이용약관: 서비스 성격, 외부 링크, 정보의 정확성, 권리와 책임.',
    termsH1: '이용약관',
    termsBody: `<p>GMS Hub(gms-hub.com, 이하 "사이트")를 이용하면 아래 약관에 동의한 것으로 봐요.</p>
<h2>1. 서비스 성격</h2>
<p>사이트는 글로벌 메이플스토리 클래식 월드 관련 외부 사이트 링크와 계산 도구를 무료로 제공하는 <strong>비공식 팬 사이트</strong>예요. 넥슨(NEXON)이 운영하거나 보증하는 서비스가 아니에요.</p>
<h2>2. 정보의 정확성</h2>
<p>사이트의 설명과 숫자는 표시된 출처와 확인 날짜를 기준으로 해요. 게임 업데이트나 출처 변경으로 실제와 달라질 수 있고, 계산기 결과는 입력값과 공개된 확률에 따른 이론값이에요. 사이트 정보를 근거로 한 거래나 게임 내 결정의 결과에 대해 책임지지 않아요.</p>
<h2>3. 외부 링크</h2>
<p>수록한 외부 사이트는 각 운영자가 관리해요. 링크를 수록한 것은 해당 사이트의 내용, 안전성, 개인정보 처리를 보증한다는 뜻이 아니에요. 현금 거래 사이트는 수록하지 않아요.</p>
<h2>4. 추천 기능</h2>
<p>사이트당 한 사람이 한 번 추천할 수 있어요. 자동화 도구로 추천 수를 조작하거나 서버에 과도한 요청을 보내면 안 되며, 이런 시도는 차단하고 추천을 무효로 할 수 있어요.</p>
<h2>5. 권리</h2>
<p>MapleStory와 관련 이름은 NEXON Korea Corporation의 상표예요. 사이트 썸네일은 각 사이트 화면을 축소한 미리보기이며, 해당 사이트 운영자가 요청하면 바로 내려요. 아이콘, 배너 그림, 계산 도구와 글은 GMS Hub가 직접 만들었어요.</p>
<h2>6. 광고</h2>
<p>사이트는 운영비를 위해 Google AdSense 광고를 게재할 수 있어요. 광고 내용은 광고주가 책임지며, 광고 쿠키 처리는 <a href="/ko/privacy/">개인정보처리방침</a>을 참고하세요.</p>
<h2>7. 약관 변경</h2>
<p>약관이 바뀌면 이 페이지에 반영하고 시행일을 고쳐 적어요.</p>
<h2>8. 문의</h2>
<p>이메일 <a href="mailto:kwonth211@gmail.com">kwonth211@gmail.com</a> 또는 <a href="{issues}" target="_blank" rel="noopener">GitHub 이슈</a></p>
<p class="muted">시행일: 2026-10-30</p>`,
    terms: '이용약관',
    contact: '문의',
    footerDisclaimer: 'GMS Hub는 비공식 팬 사이트이며 넥슨과 관련이 없습니다. MapleStory는 NEXON Korea Corporation의 상표입니다.',
    privacy: '개인정보처리방침',
    home: '홈',
    notFound: '페이지를 찾을 수 없어요.',
    backHome: '홈으로'
  },
  en: {
    gameName: 'Global MapleStory Classic World',
    gameBadge: 'Global MapleStory Classic World only',
    notice: `${SITE_COUNT} links · ${CHECKED_SITE_COUNT} checked live on ${sites.checked} · Unverified links are labeled`,
    navLinks: 'Site Directory',
    navTraining: 'Training Spots',
    navScroll: 'Scroll Calculator',
    navDrop: 'Odds Calculator',
    navPrice: 'Price Search',
    navMarket: 'Live Market',
    navAbout: 'About',
    navGuides: 'Guides',
    switchLang: '한국어',
    homeTitle: 'Global MapleStory Classic World Sites: Prices, Guides, Boss Timers & Tools | GMS Hub',
    homeDesc: `Every Global MapleStory Classic World site in one place: official channels, Discord, Reddit and Korean communities, databases and wikis, Free Market price trackers, boss timers and build planners. ${SITE_COUNT} links, with unverified references labeled separately.`,
    heroKicker: 'Your guide to Classic World on the web',
    heroTitle: 'Items, prices and useful sites, <br>all in one search',
    heroSub: 'Find items, guides and tools together, then go straight to the prices or sites you need.',
    searchPlaceholder: 'Search items, sites and tools',
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
    recommend: 'Upvote',
    sortPopular: 'Most upvoted',
    sortDefault: 'Default order',
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
    trBandNav: 'Training spots by level range',
    trBandTitle: 'Level {a}-{b} Training Spots in Global MapleStory Classic World ({n} Maps Compared) | GMS Hub',
    trBandDesc: 'Where to train at level {a}-{b} in Global MapleStory Classic World: {n} maps compared across NiaMeowDB, MS-Classic and Henesys.GG, including {maps}. Monster levels and EXP per hour.',
    trBandH1: 'Level {a}-{b} Training Spots',
    trBandLead: '{n} maps that at least one source recommends for level {a}-{b}. Maps more sources agree on come first.',
    trBandFinder: 'Find spots for my exact level →',
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
<ul><li><strong>Only sourced information.</strong> Site descriptions come from each site's own blurb and menus, and every number carries its source and check date.</li><li>When sources disagree we show both, and anything unconfirmed is labeled as such.</li><li>Links checked live and unverified references are labeled separately. We never list real-money trading sites.</li></ul>
<h2>Which game</h2>
<p>Classic World only. Other MapleStory versions have different maps, monsters and upgrade systems, so we keep them out.</p>
<h2>Suggest a site, report an error or contact us</h2>
<p>Email <a href="mailto:kwonth211@gmail.com">kwonth211@gmail.com</a> or open a <a href="{issues}" target="_blank" rel="noopener">GitHub issue</a>. Site operators who want their listing changed or removed can use the same channels.</p>
<h2>Disclaimer</h2>
<p>GMS Hub is not affiliated with NEXON. MapleStory is a trademark of NEXON Korea Corporation. Site thumbnails are scaled-down previews of each site, whose content is the responsibility of its operators. Icons and banner art are drawn by GMS Hub.</p>`,
    privacyTitle: 'Privacy Policy | GMS Hub',
    privacyDesc: 'Privacy policy and cookie notice for GMS Hub.',
    privacyH1: 'Privacy Policy',
    privacyBody: `<p>GMS Hub has no accounts and does not directly collect personal information such as names or email addresses. Below is what is processed when you use the site, and why.</p>
<h2>Cookies and advertising</h2>
<p>This site may show Google AdSense ads. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this and other websites. Google's use of advertising cookies enables it and its partners to serve ads based on those visits.</p>
<p>You can opt out of personalized advertising in <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google Ads Settings</a>, and out of other vendors' personalized ads at <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener">aboutads.info</a>. You may still see non-personalized ads. See <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">how Google uses information from sites that use its services</a>.</p>
<p>Visitors from the EEA, the UK and Switzerland are asked for consent to advertising cookies through a Google-certified consent management platform first.</p>
<h2>Analytics</h2>
<p>To improve the site we use Cloudflare Web Analytics, Google Analytics and Microsoft Clarity. They record usage such as pages visited, time on page, buttons and links clicked, and scrolling, without identifying you; Clarity may record how the page is used for replay. Text typed into fields such as search is masked. See the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a> and the <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener">Microsoft Privacy Statement</a>.</p>
<h2>Recommendations</h2>
<p>When you press 👍 on a site card, we turn your IP address into a salted, irreversible hash so one person can't recommend the same site twice, and store that hash with the site and time on Cloudflare. The raw IP address is never stored. It is used only to show recommendation counts; email us below to have it removed.</p>${config.priceReports ? `
<h2>Price reports</h2>
<p>When you add a price in Price Search, we store the item, price, type (sold/selling/buying) and time on Cloudflare and show them to everyone as statistics. To stop spam we also store the same kind of salted, irreversible IP hash used for recommendations. The raw IP address is never stored.</p>` : ''}
<h2>Shop scan</h2>
<p>The game screen you share in Shop Scan is read only inside your browser and the image is never sent anywhere. What it reads (item, price, sold or not) is stored on Cloudflare together with the shop owner's character name as shown publicly in the game, the channel and the Free Market room, and shown as price statistics and "Just listed". To stop spam we also store a salted, irreversible hash of your IP address; the raw IP is never stored. To have your character's listings removed, email us below.</p>
<h2>Browser storage</h2>
<p>Your language choice, favorites and the list of sites you recommended are stored only in your browser (localStorage) and never sent to a server. Clearing site data in your browser removes them.</p>
<h2>Children</h2>
<p>GMS Hub does not knowingly collect personal information from children under 13.</p>
<h2>Changes</h2>
<p>If this policy changes, we update this page and the effective date below.</p>
<h2>Contact</h2>
<p>Email <a href="mailto:kwonth211@gmail.com">kwonth211@gmail.com</a> or open a <a href="{issues}" target="_blank" rel="noopener">GitHub issue</a>.</p>
<p class="muted">Effective: 2026-10-30</p>`,
    termsTitle: 'Terms of Use | GMS Hub',
    termsDesc: 'GMS Hub terms of use: what the site is, external links, accuracy, rights and responsibilities.',
    termsH1: 'Terms of Use',
    termsBody: `<p>By using GMS Hub (gms-hub.com, "the site") you agree to these terms.</p>
<h2>1. What the site is</h2>
<p>The site is a free, <strong>unofficial fan site</strong> offering links to Global MapleStory Classic World resources and calculators. It is not operated or endorsed by NEXON.</p>
<h2>2. Accuracy</h2>
<p>Descriptions and numbers are based on the sources and check dates shown. They may change with game updates or source revisions, and calculator results are theoretical values from your inputs and published rates. We are not responsible for trades or in-game decisions made on the basis of this information.</p>
<h2>3. External links</h2>
<p>Listed sites are run by their own operators. Listing a link does not vouch for its content, safety or privacy practices. We do not list real-money trading sites.</p>
<h2>4. Recommendations</h2>
<p>Each person can recommend a site once. Do not use automated tools to inflate counts or flood the server; such attempts may be blocked and their votes voided.</p>
<h2>5. Rights</h2>
<p>MapleStory and related names are trademarks of NEXON Korea Corporation. Site thumbnails are scaled-down previews and are taken down at the operator's request. Icons, banner art, calculators and text are made by GMS Hub.</p>
<h2>6. Advertising</h2>
<p>The site may show Google AdSense ads to cover running costs. Advertisers are responsible for ad content; see the <a href="/en/privacy/">Privacy Policy</a> for how ad cookies are handled.</p>
<h2>7. Changes</h2>
<p>If these terms change, we update this page and the effective date below.</p>
<h2>8. Contact</h2>
<p>Email <a href="mailto:kwonth211@gmail.com">kwonth211@gmail.com</a> or open a <a href="{issues}" target="_blank" rel="noopener">GitHub issue</a></p>
<p class="muted">Effective: 2026-10-30</p>`,
    terms: 'Terms',
    contact: 'Contact',
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
  { key: 'price', path: '/tools/price/' },
  { key: 'scan', path: '/tools/scan/' },
  { key: 'market', path: '/tools/market/' },
  { key: 'damage', path: '/tools/damage/' },
  { key: 'about', path: '/about/' },
  { key: 'privacy', path: '/privacy/' },
  { key: 'terms', path: '/terms/' }
];

// One page per 10-level band, so "level 30 training" searches land on a focused list.
const TR_MAX = Math.max(...training.spots.flatMap((s) => s.recs.map((r) => r.max)));
const TR_BANDS = Array.from({ length: Math.ceil(TR_MAX / 10) }, (_, i) => [i * 10 + 1, i * 10 + 10]);
const bandPath = ([a, b]) => `/tools/training/level-${a}-${b}/`;
const inBand = (s, [a, b]) => s.recs.filter((r) => r.min <= b && r.max >= a);
// A top band with only a couple of maps is too thin to stand alone; fold it into the band below.
const countIn = (band) => training.spots.filter((s) => inBand(s, band).length).length;
if (TR_BANDS.length > 1 && countIn(TR_BANDS.at(-1)) < 5) TR_BANDS.splice(-2, 2, [TR_BANDS.at(-2)[0], TR_BANDS.at(-1)[1]]);
PAGES.push(...TR_BANDS.map((band) => ({ key: 'trBand', path: bandPath(band), band })));

const issuesUrl = `https://github.com/${config.github.owner}/${config.github.repo}/issues`;
const CONTACT_EMAIL = 'kwonth211@gmail.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (p) => `${config.basePath}${p}`;
const absUrl = (p) => `${config.baseUrl}${config.basePath}${p}`;
const langPath = (lang, p) => `/${lang}${p}`;
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const jsonScript = (id, data) =>
  `<script id="${id}" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const siteId = (u) => {
  const x = new URL(u);
  return `${x.hostname.replace(/^www\./, '')}${x.pathname}${x.search}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
};
const scriptSrc = (name) => {
  const version = createHash('sha256').update(fs.readFileSync(path.join(root, 'assets', name))).digest('hex').slice(0, 12);
  return href(`/assets/${name}?v=${version}`);
};
// Give module entry points and their relative imports the same content version.
// This avoids mixing a cached dependency with a newly deployed chart/scanner module.
const moduleFiles = fs.readdirSync(path.join(root, 'assets')).filter((name) => name.endsWith('.js')).sort();
const moduleVersion = createHash('sha256').update(moduleFiles.map((name) => `${name}\n${fs.readFileSync(path.join(root, 'assets', name), 'utf8')}`).join('\n')).digest('hex').slice(0, 12);
const srcLink = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || host(url))}</a>`;

function head({ lang, title, desc, pagePath, noindex, ld = [], only }) {
  const alternates = only
    ? ''
    : pagePath
    ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${absUrl(langPath(l, pagePath))}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, pagePath))}">`
    : '';
  const canonical = pagePath ? absUrl(langPath(lang, pagePath)) : absUrl('/');
  const ogImage = absUrl(`/assets/og-${lang}.png`);
  const adsense = config.adsenseClient
    ? `<meta name="google-adsense-account" content="${esc(config.adsenseClient)}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsenseClient)}" crossorigin="anonymous"></script>`
    : '';
  const ga = config.gaMeasurementId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.gaMeasurementId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(config.gaMeasurementId)}');</script>`
    : '';
  const clarity = config.clarityProjectId
    ? `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${esc(config.clarityProjectId)}");</script>`
    : '';
  const cfBeacon = config.cfAnalyticsToken
    ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(config.cfAnalyticsToken)}"}'></script>`
    : '';
  const verify = config.googleSiteVerification
    ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">`
    : '';
  const naverVerify = config.naverSiteVerification
    ? `<meta name="naver-site-verification" content="${esc(config.naverSiteVerification)}">`
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
${naverVerify}
<link rel="icon" href="${href('/assets/favicon.svg')}" type="image/svg+xml">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="${scriptSrc('style.css')}">
${adsense}
${ga}
${clarity}
${cfBeacon}
${ld.map(ldScript).join('\n')}
</head>`;
}

function header(lang, pagePath, only) {
  const t = T[lang];
  const other = lang === 'ko' ? 'en' : 'ko';
  const tabs = [
    ['/', 'book', t.navLinks],
    ['/tools/training/', 'sword', t.navTraining],
    ['/tools/scroll/', 'scroll', t.navScroll],
    ['/tools/drop-rate/', 'bag', t.navDrop],
    ['/tools/damage/', 'hammer', DMG[lang].h1],
    ['/tools/market/', 'coin', t.navMarket]
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
<a class="lang-switch" href="${href(langPath(other, only ? '/' : pagePath || '/'))}" data-lang="${other}" hreflang="${other}">${t.switchLang}</a>
</div></header>`;
}

function footer(lang) {
  const t = T[lang];
  return `<footer class="site-footer"><div class="wrap">
<div class="footer-brand">${spriteSvg('mushroom', 24)}<strong>GMS Hub</strong></div>
<p>${esc(t.footerDisclaimer)}</p>
<p>${guides.some((g) => g.lang === lang) ? `<a href="${href(langPath(lang, '/guides/'))}">${t.navGuides}</a> · ` : ''}<a href="${href(langPath(lang, '/about/'))}">${t.navAbout}</a> · <a href="${href(langPath(lang, '/privacy/'))}">${t.privacy}</a> · <a href="${href(langPath(lang, '/terms/'))}">${t.terms}</a> · <a href="mailto:${CONTACT_EMAIL}">${t.contact}</a> · <a href="${issuesUrl}" target="_blank" rel="noopener">GitHub</a></p>
</div></footer>`;
}

function page({ lang, pageKey, pagePath, title, desc, body, scripts = [], modules = [], ld = [], only, noindex }) {
  return `${head({ lang, title, desc, pagePath, ld, only, noindex })}
<body data-page="${pageKey}">
${header(lang, pagePath, only)}
<main>${body}</main>
${footer(lang)}
<script src="${href('/assets/common.js')}" defer></script>
${scripts.map((s) => `<script src="${scriptSrc(s)}" defer></script>`).join('\n')}
${modules.map((s) => `<script type="module" src="${href(`/assets/${s}?v=${moduleVersion}`)}"></script>`).join('\n')}
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
  const unverified = s.checked === false ? `<p class="stat-line"><strong>${lang === 'ko' ? '접속·본문 미확인' : 'Access and content not yet verified'}</strong></p>` : '';
  const stat = s.stat
    ? `<p class="stat-line"><strong>${esc(s.stat[lang])}</strong> <span>${t.statSource}: ${esc(s.stat.source)} · ${esc(s.stat.date)}</span></p>`
    : '';
  const search = `${s.name} ${host(s.url)} ${s.desc.ko} ${s.desc.en} ${s.features.ko.join(' ')} ${s.features.en.join(' ')}`.toLowerCase();
  return `<article class="site-card" data-url="${esc(s.url)}" data-id="${siteId(s.url)}" data-search="${esc(search)}">
<a class="media" href="${esc(s.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${media}<span class="langs">${langs}</span></a>
<button class="fav" type="button" data-url="${esc(s.url)}" aria-pressed="false" aria-label="${esc(t.favAdd)}: ${esc(s.name)}" title="${esc(t.favAdd)}">☆</button>
<div class="body">
<h4><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></h4>
<span class="host">${esc(host(s.url))}</span>
<p>${esc(s.desc[lang])}</p>
<ul class="feats">${feats}</ul>
${stat}${unverified}
<div class="card-foot"><a class="visit" data-track-site="${siteId(s.url)}" href="${esc(s.url)}" target="_blank" rel="noopener">${t.visit} ↗</a><button class="vote" type="button" data-site="${siteId(s.url)}" aria-pressed="false" hidden>👍 <span>${t.recommend}</span> <b></b></button></div>
</div>
</article>`;
}

// Live Free Market section above "What are you looking for?": a realtime-search style top 10 with average price, day-over-day
// change and a 7-day trend, next to the newest scanned listings. With no data yet it invites the first scan.
const LIVE = {
  ko: {
    title: '실시간 자유시장',
    sub: '유저들이 스캔한 상점과 제보한 시세로 집계해요 · 1분마다 갱신',
    top: '인기 아이템 TOP 10',
    topNote: '최근 24시간 매물·판매 기준',
    recent: '방금 올라온 매물',
    avg: '평균가', soldMedian: '판매 완료 중앙값', askMedian: '판매 중 중앙값',
    trend: '7일 추이',
    change: '전일 대비',
    sold: '팔림',
    isNew: 'NEW',
    more: '실시간 시세 전체 보기 →',
    updated: '{t} 갱신',
    sparkLabel: '{name} 7일 추이: {from}에서 {to}',
    noTrend: '추이 데이터 부족',
    preview: '미리보기 · 실제 시세가 아닌 예시 데이터예요',
    scan: '내 화면으로 상점 스캔',
    empty: '아직 올라온 매물이 없어요. PC 크롬에서 메이플 창을 공유하고 상점을 열면 여기에 바로 나와요.'
  },
  en: {
    title: 'Live Free Market',
    sub: 'From shops players scanned and prices they reported · refreshed every minute',
    top: 'Top 10 items',
    topNote: 'by listings and sales in the last 24 hours',
    recent: 'Just listed',
    avg: 'Avg', soldMedian: 'Sold median', askMedian: 'Asking median',
    trend: '7-day trend',
    change: 'vs yesterday',
    sold: 'Sold',
    isNew: 'NEW',
    more: 'Open the live market →',
    updated: 'updated {t}',
    sparkLabel: '{name} 7-day trend: {from} to {to}',
    noTrend: 'not enough data for a trend',
    preview: 'Preview · sample data, not real prices',
    scan: 'Scan shops from my screen',
    empty: 'No listings yet. Share your MapleStory window in Chrome on a computer and open shops; they show up here right away.'
  }
};

function liveMarket(lang) {
  const t = LIVE[lang];
  return `<section class="wrap market" id="live-market" aria-labelledby="live-title"
 data-api="${esc(config.voteApi)}" data-items="${esc(href('/assets/items.json'))}" data-price="${esc(href(langPath(lang, '/tools/market/')))}"
 data-text="${esc(JSON.stringify(t))}">
<header class="market-head"><span class="live-dot" aria-hidden="true"></span><h2 id="live-title">${t.title}</h2><p>${t.sub}</p><small id="live-updated"></small><a class="btn small-btn market-scan" href="${href(langPath(lang, '/tools/scan/'))}">● ${t.scan}</a><strong class="market-preview" id="market-preview" hidden>${t.preview}</strong></header>
<div class="market-grid">
<div class="market-panel market-top" id="market-top">
<h3>${t.top} <small>${t.topNote}</small></h3>
<ol class="rank-list" id="rank-list"></ol>
</div>
<div class="market-panel market-recent">
<h3>${t.recent}</h3>
<ol class="recent-list" id="live-rows"><li class="market-empty">${t.empty}</li></ol>
<a class="market-more" href="${href(langPath(lang, '/tools/market/'))}">${t.more}</a>
</div>
</div>
<div class="spark-tip" id="spark-tip" role="tooltip" hidden></div>
</section>`;
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
<div class="home-search-shell">
<form class="search-box" id="home-search" role="search">
<span aria-hidden="true">⌕</span><input id="site-search" type="search" autocomplete="off" maxlength="120" placeholder="${esc(t.searchPlaceholder)}" aria-label="${esc(t.searchPlaceholder)}" aria-controls="search-results" aria-describedby="search-help">
<button type="button" id="search-clear" aria-label="${lang === 'ko' ? '검색어 지우기' : 'Clear search'}" hidden>×</button>
<button type="submit" class="search-submit" aria-controls="search-results" aria-expanded="false">${lang === 'ko' ? '검색' : 'Search'}</button>
</form>
<section class="unified-search" id="search-results" aria-label="${lang === 'ko' ? '통합 검색 결과' : 'Search results'}" data-items="${esc(href('/assets/items.json'))}" data-market="${esc(href(langPath(lang, '/tools/market/')))}" hidden>
<div class="search-summary"><h2>${lang === 'ko' ? '검색 결과' : 'Search results'}</h2><span id="search-status" role="status" aria-live="polite" aria-atomic="true"></span></div>
<div class="search-filters" role="group" aria-label="${lang === 'ko' ? '검색 결과 종류' : 'Result type'}">
${[['all', lang === 'ko' ? '전체' : 'All'], ['item', lang === 'ko' ? '아이템' : 'Items'], ['site', lang === 'ko' ? '사이트' : 'Sites'], ['tool', lang === 'ko' ? '도구·가이드' : 'Tools & guides']].map(([type, label]) => `<button type="button" data-search-type="${type}" aria-pressed="${type === 'all'}">${label} <span data-count="${type}">0</span></button>`).join('')}
</div>
<div id="search-item-state" class="search-item-state" hidden><span></span> <button type="button" id="search-retry" hidden>${lang === 'ko' ? '다시 불러오기' : 'Retry'}</button></div>
<div id="search-groups"></div>
<p id="search-empty" class="search-empty" hidden>${lang === 'ko' ? '일치하는 결과가 없어요. 더 짧은 이름이나 영문 이름으로 검색해 보세요.' : 'No matches. Try a shorter name or an English item name.'}</p>
</section>
</div>
<p class="search-help" id="search-help">${lang === 'ko' ? '한글·영문·초성으로 검색하세요. 예: 장공, 미스릴, 디스코드' : 'Search by name or keyword. Try Gloves Attack, Mithril or Discord.'}</p>
<dl class="hero-stats"><div><dt>${t.statSites}</dt><dd>${SITE_COUNT}</dd></div><div><dt>${t.statCats}</dt><dd>${cats.length}</dd></div><div><dt>${t.statChecked}</dt><dd>${esc(sites.checked)}</dd></div></dl>
</div>
</div>
</section>
${lang === 'ko' ? adfitRails() : '' /* Kakao AdFit only serves Korean ads, so English pages stay ad-free */}
${liveMarket(lang)}
<section class="wrap purposes-wrap">
<h2>${t.purposeHeading}</h2>
<div class="purposes">${purposes}</div>
</section>
<div class="wrap directory">
<aside class="toc"><nav><h2>${t.toc}</h2><a href="#favorites" id="fav-toc" hidden>${spriteSvg('star', 20)}<span>${t.favHeading}</span><b id="fav-count">0</b></a>${toc}</nav></aside>
<div class="dir-main" data-vote-api="${esc(config.voteApi)}" data-fav-add="${esc(t.favAdd)}" data-fav-remove="${esc(t.favRemove)}" data-filtering="${esc(t.filtering)}">
<p class="filter-bar" id="filter-bar" hidden><span id="filter-label"></span> <button type="button" class="btn ghost small-btn" id="filter-clear">${t.showAll}</button></p>
<section class="cat favorites" id="favorites" hidden>
<header class="cat-head">${spriteSvg('star', 40)}<div><h3>${t.favHeading} <span id="fav-count-2">0</span></h3><p>${esc(t.favDesc)}</p></div></header>
<div class="cards" id="fav-cards"></div>
</section>
${sections}
</div>
</div>
<section class="wrap">
<h2>${t.toolsHeading}</h2>
<div class="tool-cards">
${tool('/tools/training/', 'sword', t.navTraining, t.trCardDesc)}
${tool('/tools/scroll/', 'scroll', t.navScroll, t.scCardDesc)}
${tool('/tools/drop-rate/', 'bag', t.navDrop, t.dropCardDesc)}
${tool('/tools/market/', 'coin', t.navMarket, MK[lang].lead)}
${tool('/tools/price/', 'coin', t.navPrice, PR[lang].cardDesc)}
${tool('/tools/damage/', 'hammer', DMG[lang].h1, DMG[lang].cardDesc)}
${tool('/tools/scan/', 'megaphone', SCAN[lang].h1, SCAN[lang].cardDesc)}
</div>
</section>
${guides.some((g) => g.lang === lang)
  ? `<section class="wrap">
<h2>${t.navGuides}</h2>
<div class="tool-cards">${guides
      .filter((g) => g.lang === lang)
      .map((g) => tool(guidePath(g), 'book', esc(g.h1), g.desc))
      .join('')}</div>
</section>
`
  : ''}<section class="wrap faq">
<h2>${t.faqHeading}</h2>
${faq}
</section>`;
}

// ---------- training ----------

const minRec = (s) => Math.min(...s.recs.map((r) => r.min));

// Korean pages lead with the client's Korean name and keep the English one beside it, since guides and players use both.
const spotName = (lang, s) => (lang === 'ko' && s.ko ? `${esc(s.ko)} <small class="en-name">${esc(s.map)}</small>` : esc(s.map));
const mobName = (lang, m) => esc(lang === 'ko' && m.ko ? m.ko : m.name);

function trainingRows(lang, spots) {
  const nf = new Intl.NumberFormat(lang);
  const src = training.sources;
  return spots
    .map((s) => {
      const caution = training.cautions.find((c) => c.map === s.map);
      return `<tr><td><strong>${spotName(lang, s)}</strong>${caution ? `<div class="caution">⚠ ${esc(caution.text[lang])}</div>` : ''}</td><td>${
        s.monsters.map((m) => `${mobName(lang, m)} <span class="lv">${m.level}</span>`).join('<br>') || '—'
      }</td><td>${s.recs.map((r) => `<span class="rec ${r.source}">${esc(src[r.source].name)} ${r.min}–${r.max}</span>`).join(' ')}</td><td>${
        s.meowdbExpHr ? nf.format(s.meowdbExpHr) : '—'
      }</td></tr>`;
    })
    .join('');
}

function trainingSources(lang) {
  const t = T[lang];
  const sourceList = Object.entries(training.sources)
    .map(([, s]) => `<li>${srcLink(s.url, s.name)}${s.urls ? ` (${s.urls.map((u, i) => srcLink(u, `${i + 1}`)).join(', ')})` : ''} · ${s.date || t.noDate}</li>`)
    .join('');
  return `<ul class="notes">${training.notes[lang].map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
<h3>${t.trSourcesHeading}</h3>
<ul class="notes">${sourceList}</ul>`;
}

const trainingTable = (lang, rows) => {
  const t = T[lang];
  return `<div class="table-wrap"><table class="data"><thead><tr><th>${t.colMap}</th><th>${t.colMonsters}</th><th>${t.colRecs}</th><th>${t.colExp}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
};

function bandNav(lang, current) {
  const t = T[lang];
  const links = TR_BANDS.map((band) => {
    const label = lang === 'ko' ? `${band[0]}~${band[1]}레벨` : `Lv ${band[0]}-${band[1]}`;
    return current && band[0] === current[0]
      ? `<strong class="band-link current" aria-current="page">${label}</strong>`
      : `<a class="band-link" href="${href(langPath(lang, bandPath(band)))}">${label}</a>`;
  }).join('');
  return `<nav class="band-nav" aria-label="${esc(t.trBandNav)}"><h2>${t.trBandNav}</h2><div>${links}</div></nav>`;
}

function trainingBody(lang) {
  const t = T[lang];
  const sorted = [...training.spots].sort((a, b) => minRec(a) - minRec(b) || a.map.localeCompare(b.map));
  return `${pageHead(lang, 'sword', t.trH1, t.trLead)}
<div class="wrap">
<form id="tr-form" class="panel inline-form">
<label>${t.level}<input type="number" name="lv" min="1" max="100" value="21" inputmode="numeric"></label>
<button class="btn" type="submit">${t.showSpots}</button>
</form>
<section id="tr-result" aria-live="polite"></section>
${bandNav(lang)}
<section>
<h2>${t.trAll}</h2>
${trainingTable(lang, trainingRows(lang, sorted))}
${trainingSources(lang)}
</section>
</div>
${jsonScript('training-data', training)}
${jsonScript('i18n', { lang, trResultTitle: t.trResultTitle, trNone: t.trNone, agree: t.agree, higher: t.higher, expHr: t.expHr, caution: t.caution })}`;
}

// Spots any source recommends inside the band; more agreeing sources first.
const bandSpots = (band) =>
  training.spots
    .filter((s) => inBand(s, band).length)
    .sort((x, y) => inBand(y, band).length - inBand(x, band).length || minRec(x) - minRec(y) || x.map.localeCompare(y.map));

function trainingBandBody(lang, band) {
  const t = T[lang];
  const spots = bandSpots(band);
  const vars = { a: band[0], b: band[1], n: spots.length };
  return `${pageHead(lang, 'sword', fill(t.trBandH1, vars), fill(t.trBandLead, vars))}
<div class="wrap">
${bandNav(lang, band)}
<section>
${trainingTable(lang, trainingRows(lang, spots))}
<p><a class="btn" href="${href(langPath(lang, '/tools/training/'))}">${t.trBandFinder}</a></p>
${trainingSources(lang)}
</section>
</div>`;
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
${scrollGuide(lang)}
</div>
${jsonScript('scroll-data', scrolls)}
${jsonScript('i18n', { lang, distSucc: t.distSucc, distBoom: t.distBoom })}`;
}

// ---------- drops ----------

// ---------- price search ----------

// Where each item link goes. FreeMarketClassic keys pages by game item id and MapleMarket searches by English name; MesoWatch
// and meowdb have no linkable search, so the client copies the English name before opening them.
const PRICE_SITES = [
  { id: 'freemarketclassic', name: 'FreeMarketClassic', url: 'https://freemarketclassic.com/item/{id}?hl=en', direct: true },
  { id: 'maplemarket', name: 'MapleMarket', url: 'https://maplemarket.fyi/prices?q={en}', direct: true, paid: true },
  { id: 'mesowatch', name: 'MesoWatch', url: 'https://meso.watch/' },
  { id: 'meowdb', name: 'meowdb', url: 'https://meowdb.com/msclassic/free-market' }
];

const PR = {
  ko: {
    title: '글클메 아이템 시세 검색 (한글 이름으로 찾기) · 글로벌 메이플스토리 클래식 월드 | GMS Hub',
    desc: '글클메 아이템을 한글 이름으로 검색하고, 영어 이름과 함께 FreeMarketClassic·MapleMarket·MesoWatch·meowdb 시세로 바로 이동해요. 아이템 2천여 개 수록.',
    h1: '아이템 시세 검색',
    lead: '아이템을 한글로 검색하면 영어 이름을 찾아 시세 사이트로 바로 연결해 줘요.',
    cardDesc: '한글 아이템 이름으로 검색해서 시세 사이트로 바로 이동해요.',
    placeholder: '아이템 이름 (예: 메탈 완드, 장갑 공격력, 일비)',
    popular: '많이 찾는 아이템',
    none: '"{q}"에 맞는 아이템이 없어요. 띄어쓰기를 바꾸거나 영어 이름으로도 찾아보세요.',
    more: '결과가 많아서 {n}개만 보여 줘요. 조금 더 자세히 입력해 보세요.',
    level: '{lv}레벨',
    copy: '영어 이름 복사',
    copied: '"{en}" 복사했어요. 열린 사이트 검색창에 붙여넣으세요.',
    paid: '유료',
    direct: '바로 열림',
    copyNote: '이름 복사 후 열림',
    moreItems: '{n}개 더 보기 →',
    hubLabel: 'GMS Hub 유저 시세',
    hubNone: '아직 제보가 없어요. 첫 시세를 올려 주세요.',
    hubSummary: '최근 14일 {n}건 · {low}~{high}',
    report: '시세 올리기',
    pricePh: '가격 (예: 58만, 580k)',
    submit: '올리기',
    thanks: '고마워요! 바로 반영됐어요.',
    badPrice: '가격을 알아볼 수 없어요. 58만, 580000, 580k처럼 적어 주세요.',
    failed: '지금은 올릴 수 없어요. 잠시 후 다시 해 주세요.',
    kinds: { sold: '팔린 가격', selling: '파는 가격', buying: '사는 가격' },
    recent: '방금 올라온 시세',
    recentNone: '아직 올라온 시세가 없어요. 아이템을 검색해서 첫 시세를 올려 주세요.',
    cats: { Equip: '장비', Use: '소비', Etc: '기타', Setup: '설치' },
    subs: {
      Wand: '완드', Staff: '스태프', Bow: '활', Crossbow: '석궁', Claw: '아대', Dagger: '단검', Spear: '창', 'Pole Arm': '폴암', Polearm: '폴암',
      'One-Handed Sword': '한손검', 'Two-Handed Sword': '두손검', 'One-Handed Axe': '한손도끼', 'Two-Handed Axe': '두손도끼',
      'One-Handed Blunt Weapon': '한손둔기', 'Two-Handed Blunt': '두손둔기', 'One-Handed BW': '한손둔기', 'Two-Handed BW': '두손둔기',
      Hat: '모자', Top: '상의', Bottom: '하의', Overall: '한벌옷', Shoes: '신발', Glove: '장갑', Shield: '방패', Cape: '망토', Earrings: '귀고리', Ring: '반지',
      Potion: '물약', 'Food and Drink': '음식', Thrown: '표창', Arrow: '화살', 'Crossbow Bolt': '석궁 화살', 'Teleport Item': '귀환 주문서',
      Helmet: '투구 주문서', Topwear: '상의 주문서', Bottomwear: '하의 주문서', Gloves: '장갑 주문서', 'Monster Drop': '몬스터 드롭', 'Mineral Ore': '광물', 'Rare Ore': '보석 원석',
      Gem: '보석', Chair: '의자', Furniture: '가구', Decoration: '장식', 'Summoning Sack': '소환 주머니', 'Pet Food': '펫 먹이', 'EXP Buff': '경험치 버프'
    },
    howHeading: '이렇게 쓰면 돼요',
    how: [
      ...(config.priceReports
        ? ['거래했거나 상점에서 본 가격이 있으면 "시세 올리기"로 10초 만에 올려 주세요. 가입은 필요 없어요. 올린 가격은 최근 14일 중앙값으로 묶여서 모두에게 보여요.']
        : []),
      '아이템 이름을 한글로 입력하세요. 띄어쓰기는 달라도 찾아요. "주황포션"도 "주황 포션"으로 찾아요.',
      '주문서는 "장갑 공격력", "모자 민첩", "장공"처럼 부위와 능력치로 찾으면 돼요. 게임 안 이름에 영어가 섞여 있어도 한글 능력치로 찾을 수 있게 맞춰 뒀어요.',
      '결과에서 시세 사이트를 누르세요. FreeMarketClassic은 그 아이템 시세 페이지가, MapleMarket은 검색 결과가 바로 열려요.',
      'MesoWatch와 meowdb는 주소로 바로 검색하는 기능이 없어서, 누르는 순간 영어 이름을 복사해 둬요. 열린 사이트 검색창에 붙여넣기만 하면 돼요.'
    ],
    sitesHeading: '시세 사이트는 이렇게 달라요',
    sites: [
      ['FreeMarketClassic', '상점 가격과 실제 팔린 가격을 날짜별로 보여 줘요. 아이템 하나의 추이를 보기 좋아요.'],
      ['MapleMarket', '지금 가장 싸게 파는 상점의 채널과 방 번호까지 나와요. 시세를 보려면 유료 구독이 필요해요.'],
      ['MesoWatch', '유저들이 자유시장을 돌며 공유한 화면에서 팔린 가격을 모아요. 많이 거래되는 아이템 순위가 한눈에 보여요.'],
      ['meowdb', '유저가 직접 제보한 가격의 최근 14일 중앙값이에요. 한국어 화면을 지원해요.']
    ],
    reportNote: '올린 가격은 누가 올렸는지 알 수 없게 저장돼요(접속 주소는 되돌릴 수 없는 값으로만 바꿔 도배를 막는 데 써요). 중앙값에서 5배 넘게 벗어난 가격은 오타로 보고 빼요.',
    sourceNote: '아이템 이름은 글로벌 메이플스토리 클래식 월드 게임 데이터에 들어 있는 공식 한국어·영어 이름이에요(maplestory.io 제공). 캐릭터 외형, 퀘스트 아이템, 캐시 아이템은 거래가 안 돼서 뺐어요. 사이트마다 시세가 다를 수 있으니 비싼 물건은 두세 곳을 같이 보세요.',
    tradingLink: '거래글 약어와 메소 빚 규칙은 <a href="{href}">거래와 메소 가이드</a>에 정리했어요.'
  },
  en: {
    title: 'MapleStory Classic World Item Price Search: Jump to Every Price Tracker | GMS Hub',
    desc: 'Search MapleStory Classic World items by name (English or Korean) and open their prices on FreeMarketClassic, MapleMarket, MesoWatch and meowdb in one click.',
    h1: 'Item Price Search',
    lead: 'Type an item name and jump straight to its price on the Free Market trackers.',
    cardDesc: 'Find an item by name and open its price on each tracker.',
    placeholder: 'Item name (e.g. Metal Wand, Gloves Attack, Ilbi)',
    popular: 'Popular items',
    none: 'No items match "{q}". Try a shorter or different spelling.',
    more: 'Showing the first {n}. Type a little more to narrow it down.',
    level: 'Lv. {lv}',
    copy: 'Copy name',
    copied: 'Copied "{en}". Paste it into the search box on the site that opened.',
    paid: 'paid',
    direct: 'opens the item',
    copyNote: 'copies the name, then opens',
    moreItems: '{n} more →',
    hubLabel: 'GMS Hub player prices',
    hubNone: 'No reports yet. Be the first to add a price.',
    hubSummary: '{n} reports in 14 days · {low}–{high}',
    report: 'Add a price',
    pricePh: 'Price (e.g. 580k, 1.2m)',
    submit: 'Submit',
    thanks: 'Thanks! Your price is in.',
    badPrice: "Couldn't read that price. Try 580000, 580k or 1.2m.",
    failed: "Couldn't send right now. Please try again shortly.",
    kinds: { sold: 'Sold for', selling: 'Selling for', buying: 'Buying for' },
    recent: 'Latest prices',
    recentNone: 'No prices yet. Search an item and add the first one.',
    cats: { Equip: 'Equip', Use: 'Use', Etc: 'Etc', Setup: 'Setup' },
    subs: {},
    howHeading: 'How it works',
    how: [
      ...(config.priceReports
        ? ['Saw or paid a price? Use "Add a price" to share it in ten seconds, no sign-up. Reports are combined into a 14-day median everyone can see.']
        : []),
      'Type part of an item name. Results update as you type.',
      'Click a tracker. FreeMarketClassic opens the item page and MapleMarket opens a search for it.',
      'MesoWatch and meowdb have no search links, so clicking them copies the item name first. Paste it into their search box.'
    ],
    sitesHeading: 'How the trackers differ',
    sites: [
      ['FreeMarketClassic', 'Shop prices and sold prices by day for each item.'],
      ['MapleMarket', 'Cheapest current shop with channel and room. Needs a paid subscription.'],
      ['MesoWatch', 'Sold prices read from shopping sessions players share.'],
      ['meowdb', '14-day median of player-reported prices.']
    ],
    reportNote: 'Reports are stored anonymously (your connection address is only kept as a one-way hash to stop spam). Prices more than 5x away from the median are treated as typos and left out.',
    sourceNote: 'Item names come from the MapleStory Classic World game data (via maplestory.io). Hair, faces, quest items and cash items are left out because they cannot be traded. Trackers can disagree, so check two or three before a big trade.',
    tradingLink: ''
  }
};

// Typed stat names in Korean, matched against the English words the Korean client keeps in scroll names.
const STAT_ALIASES = { 투구: '모자', 장공: '장갑 attack', 장마: '장갑 magic attack', 귀작: '귀고리', 공격력: 'attack', 공: 'attack', 마력: 'magic attack', 마공: 'magic attack', 힘: 'str', 민첩: 'dex', 덱: 'dex', 지력: 'int', 인트: 'int', 행운: 'luk', 럭: 'luk', 명중: 'accuracy', 명중률: 'accuracy', 회피: 'avoid', 회피율: 'avoid', 방어력: 'defense', 방어: 'defense', 이동속도: 'speed', 이속: 'speed', 점프: 'jump', 체력: 'hp' };
const POPULAR = { ko: ['장갑 공격력', '일비', '메탈 완드', '주황 포션', '마나 엘릭서', '청동의 원석'], en: ['Gloves Attack', 'Ilbi', 'Metal Wand', 'Orange Potion', 'Mana Elixir', 'Bronze Ore'] };

function priceBody(lang) {
  const t = PR[lang];
  const chips = POPULAR[lang].map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  return `${pageHead(lang, 'coin', t.h1, t.lead)}
<div class="wrap">
<form id="pr-form" class="panel price-search" role="search" onsubmit="return false">
<input type="search" id="pr-q" name="q" placeholder="${esc(t.placeholder)}" autocomplete="off" aria-label="${esc(t.h1)}">
<div class="chips"><span>${t.popular}</span>${chips}</div>
</form>
<section id="pr-result" class="item-list" aria-live="polite"></section>
<section class="prose wide">
<h2>${t.howHeading}</h2>
<ol>${t.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
<h2>${t.sitesHeading}</h2>
<ul>${t.sites.map(([n, d]) => `<li><strong>${n}</strong>: ${esc(d)}</li>`).join('')}</ul>
${config.priceReports ? `<p class="muted">${esc(t.reportNote)}</p>` : ''}
<p class="muted">${esc(t.sourceNote)}</p>
${t.tradingLink && guides.some((g) => g.slug === 'trading-and-mesos') ? `<p>${fill(t.tradingLink, { href: href(langPath('ko', '/guides/trading-and-mesos/')) })}</p>` : ''}
</section>
</div>
${jsonScript('i18n', { lang, ...Object.fromEntries(Object.entries(t).filter(([k]) => ['none', 'more', 'level', 'copy', 'copied', 'paid', 'direct', 'copyNote', 'cats', 'subs', 'hubLabel', 'hubNone', 'hubSummary', 'report', 'pricePh', 'submit', 'thanks', 'badPrice', 'failed', 'kinds', 'recent', 'recentNone'].includes(k))), sites: PRICE_SITES, aliases: lang === 'ko' ? STAT_ALIASES : {}, itemsUrl: href('/assets/items.json'), api: config.priceReports ? config.voteApi : '' })}`;
}

// ---------- shop scanner (sample collection) ----------

// First step of shop scanning: players share the game window and we save exact frames locally, to build the shop reader from.
// Players share the game window and the page reads open shops into the shared price data.
const SCAN = {
  ko: {
    title: '글클메 상점 스캔: 화면 공유로 자유시장 시세 올리기 | GMS Hub',
    h1: '상점 스캔',
    cardDesc: '메이플 창을 공유하면 열어 본 상점의 시세가 자동으로 올라가요. PC 크롬 전용.',
    lead: '메이플 창을 크롬으로 공유하고 자유시장을 돌면, 열어 본 상점의 물건과 가격을 자동으로 읽어 시세에 반영해요.',
    steps: [
      ['창 모드로 실행', '메이플을 창 모드로 켜고 언어는 영어로 두세요. 창 크기와 화면 배율은 자동으로 맞춰요. 맥에서는 크롬과 메이플 둘 다 전체 화면이 아니어야 창을 공유할 수 있어요.'],
      ['채널·방 선택', '아래에서 현재 채널과 자유시장 방을 선택하세요. 자동 인식도 사용할 수 있어요. 직접 선택했다면 이동할 때 바꿔 주세요.'],
      ['자유시장에서 상점 열기', '공유를 시작하고 평소처럼 상점을 열어 보세요. 열어 본 상점이 아래 목록에 바로 나와요.']
    ],
    start: '메이플 창 공유하기',
    stop: '그만하기',
    checks: { share: '화면 공유', shop: '상점 인식', channel: '채널 인식', room: '위치 인식', upload: '시세 반영' },
    resultsHeading: '인식한 상점 물건',
    colItem: '아이템', colPrice: '가격', colSeller: '판매자', colWhere: '위치', colState: '상태', colRead: '인식', colEdit: '수정',
    resultsEmpty: '아직 인식한 물건이 없어요. 공유를 시작하고 자유시장에서 상점을 열어 보세요.',
    privacy: '공유한 화면은 이 컴퓨터 안에서만 읽고, 읽어 낸 아이템과 가격만 시세에 반영해요. 게임 화면 자체는 어디에도 올리지 않아요.',
    i: {
      loading: '아이템·글자 데이터를 불러오는 중이에요…', ready: '준비됐어요. 채널·방을 고르고 화면을 공유하세요.', dataFail: '인식 데이터를 불러오지 못했어요. 다시 시도해 주세요.',
      duplicateEdit: '같은 매물이 이미 있어요. 기존 줄을 수정해 주세요.', retry: '다시 시도', manual: '직접 선택', channelLabel: '채널', roomLabel: '자유시장 방', chooseLocation: '선택해 주세요',
      locationChanged: '선택한 위치는 다음 인식부터 적용돼요. 기존 매물은 각 줄에서 수정할 수 있어요.', sending: '전송 중이에요. 완료 후 수정해 주세요.',
      watching: '공유 중 · 상점 화면 {n}장 확인',
      selling: '판매 중', sold: '판매 완료 표시', ok: '인식됨', check: '확인 필요', each: '개당', now: '방금',
      bundle: '{n}개 묶음 {total}',
      edit: '이 줄 고치기', edited: '수정함', pickItem: '아이템 고르기', unreadable: '읽지 못한 줄 · ✎로 직접 입력', qty: '묶음 개수', save: '저장', cancel: '취소',
      editInvalid: '아이템·채널·방을 선택하고 가격, 1~10,000의 정수 수량, 영문·숫자 판매자명을 확인해 주세요',
      colItem: '아이템', colPrice: '가격', colSeller: '판매자',
      summary: '이번 공유: 상점 {shops}곳 · 물건 {items}개 인식 · 그중 확인 필요 {check}개',
      skipped: '못 읽은 줄 {n}개는 건너뜀',
      wait: '대기 중',
      shareOn: '{w}×{h} 공유 중',
      shareRetina: '{w}×{h} 공유 중 (화면 배율 {k}배 → 게임 크기로 맞춰 읽어요)',
      shopNone: '상점 창이 안 보여요. 상점을 열어 주세요',
      ocrLoading: '화면 배율에 맞는 글자 인식 엔진을 불러오는 중이에요 (처음 한 번, 약 10MB)',
      ocrFail: '글자 인식 엔진을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요',
      readFail: '이 화면을 읽다가 문제가 생겼어요. 계속 공유하면 다음 화면에서 다시 읽어요',
      shopOk: '{seller} 상점 · {n}개 읽음',
      shopPartial: '{seller} 상점 · {n}개 읽음, {skip}개는 못 읽음',
      channelOk: 'CH {ch}',
      channelNone: '위 드롭다운에서 채널을 선택하거나 채널 변경 창을 열어 주세요',
      roomOk: '자유시장 {room}번 방',
      roomAsk: '처음 보는 방이에요. 미니맵의 방 번호를 한 번만 알려 주세요',
      roomSave: '확인',
      roomNone: '위 드롭다운에서 방을 선택해 주세요',
      uploadOk: '{n}개 반영됨',
      uploadNeed: '아이템·가격을 두 번 확인하고, 판매자·채널·방이 있어야 반영해요',
      uploadFail: '반영 실패, 다시 시도할게요',
      stopped: '멈췄어요. 상점 화면 {n}장을 확인했어요.',
      denied: '화면 공유가 취소됐어요. 다시 눌러 메이플 창을 골라 주세요.',
      unsupported: '이 브라우저는 화면 공유를 지원하지 않아요. PC 크롬에서 열어 주세요.'
    }
  },
  en: {
    title: 'Shop Scan: Share Your Screen to Add Free Market Prices | GMS Hub',
    h1: 'Shop Scan',
    cardDesc: 'Share your game window and the shops you open become price data. Chrome on a computer.',
    lead: 'Share your MapleStory window in Chrome and walk the Free Market; the shops you open are read automatically and added to the prices.',
    steps: [
      ['Run in windowed mode', 'Use windowed mode with the game in English. Window size and screen scaling are handled automatically. On a Mac, neither Chrome nor MapleStory can be full screen for window sharing to work.'],
      ['Choose channel and room', 'Select your current channel and Free Market room below, or use automatic detection. Update manual selections when you move.'],
      ['Open shops in the Free Market', 'Start sharing and open shops as usual. Each shop you open shows up in the list below.']
    ],
    start: 'Share your MapleStory window',
    stop: 'Stop',
    checks: { share: 'Screen share', shop: 'Shop', channel: 'Channel', room: 'Location', upload: 'Price data' },
    resultsHeading: 'Items recognized',
    colItem: 'Item', colPrice: 'Price', colSeller: 'Seller', colWhere: 'Where', colState: 'Status', colRead: 'Read', colEdit: 'Edit',
    resultsEmpty: 'Nothing recognized yet. Start sharing and open shops in the Free Market.',
    privacy: 'The shared screen is read only on this computer; just the items and prices it finds go into the price data. The game screen itself is never uploaded.',
    i: {
      loading: 'Loading item and text data…', ready: 'Ready. Choose your location and share your window.', dataFail: 'Could not load recognition data. Please retry.',
      duplicateEdit: 'This listing already exists. Edit its existing row.', retry: 'Retry', manual: 'Manual', channelLabel: 'Channel', roomLabel: 'Free Market room', chooseLocation: 'Choose location',
      locationChanged: 'Location applies to the next read. Use each row’s edit button to correct earlier listings.', sending: 'Sending. Please edit after the upload finishes.',
      watching: 'Sharing · {n} shop screens checked',
      selling: 'For sale', sold: 'Sold', ok: 'OK', check: 'Check', each: 'each', now: 'now',
      bundle: '{n} for {total}',
      edit: 'Fix this line', edited: 'Edited', pickItem: 'Pick the item', unreadable: 'Unreadable line · fix it with ✎', qty: 'Bundle size', save: 'Save', cancel: 'Cancel',
      editInvalid: 'Pick the item from the list, write the price like 580000 or 580k, and the seller in letters and digits',
      colItem: 'Item', colPrice: 'Price', colSeller: 'Seller',
      summary: 'This session — shops: {shops} · items read: {items} · to check: {check}',
      skipped: 'skipped unreadable lines: {n}',
      wait: 'Waiting',
      shareOn: 'Sharing {w}×{h}',
      shareRetina: 'Sharing {w}×{h} (screen scale {k}x, read at game size)',
      shopNone: 'No shop window. Open a shop',
      ocrLoading: 'Loading the text reader for your screen scale (first time only, about 10MB)',
      ocrFail: "Couldn't load the text reader. Reload and try again",
      readFail: 'Something went wrong reading this screen. Keep sharing and the next one will be read',
      shopOk: "{seller}'s shop · {n} read",
      shopPartial: "{seller}'s shop · {n} read, {skip} unreadable",
      channelOk: 'CH {ch}',
      channelNone: 'Choose a channel above or open the Change Channel window',
      roomOk: 'Free Market room {room}',
      roomAsk: 'A room we have not seen yet. Tell us its number from the minimap, just once',
      roomSave: 'Save',
      roomNone: 'Choose a Free Market room above',
      uploadOk: '{n} added',
      uploadNeed: 'Needs two matching reads, seller, channel and room',
      uploadFail: "Couldn't send, will retry",
      stopped: 'Stopped. {n} shop screens checked.',
      denied: 'Sharing was cancelled. Click again and pick the MapleStory window.',
      unsupported: "This browser can't share a window. Open this page in Chrome on a computer."
    }
  }
};

function locationChoices(lang, prefix) {
  return `<option value="">${lang === 'ko' ? '자동 인식' : 'Automatic'}</option>` + Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">${prefix} ${i + 1}</option>`).join('');
}

function scanBody(lang) {
  const t = SCAN[lang];
  const steps = t.steps.map(([h, d], n) => `<li><b>${n + 1}</b><strong>${esc(h)}</strong><span>${esc(d)}</span></li>`).join('');
  return `${pageHead(lang, 'megaphone', t.h1, t.lead)}
<div class="wrap scan">
<ol class="scan-steps">${steps}</ol>
<div class="panel scan-panel">
<fieldset class="scan-location"><legend>${lang === 'ko' ? '현재 상점 위치' : 'Current shop location'}</legend>
<label>${t.i.channelLabel}<select id="scan-channel">${locationChoices(lang, 'CH')}</select></label>
<label>${t.i.roomLabel}<select id="scan-room">${locationChoices(lang, 'FM')}</select></label>
<p class="muted">${lang === 'ko' ? '인식이 안 되면 직접 선택하세요. 직접 선택한 값이 우선하며, 채널·방을 이동하면 변경해 주세요.' : 'Choose manually if detection fails. Manual choices take priority; update them when you move.'}</p>
</fieldset>
<div class="scan-actions">
<button type="button" class="btn" id="scan-start">● ${t.start}</button>
<button type="button" class="btn ghost" id="scan-stop" disabled>${t.stop}</button>
</div>
<button type="button" class="btn ghost small-btn" id="scan-retry-data" hidden>${t.i.retry}</button>
<button type="button" class="btn ghost small-btn" id="scan-retry-upload" hidden>${lang === 'ko' ? '시세 반영 다시 시도' : 'Retry price upload'}</button>
<p id="scan-status" class="scan-status" aria-live="polite"></p>
<ol class="scan-checks" aria-live="polite">${['share', 'shop', 'channel', 'room', 'upload']
    .map((k) => `<li id="check-${k}" data-state="wait"><span class="dot" aria-hidden="true"></span><strong>${t.checks[k]}</strong><small>${esc(t.i.wait)}</small></li>`)
    .join('')}</ol>
<h2>${t.resultsHeading}</h2>
<div class="scan-table-wrap"><table class="scan-table">
<thead><tr><th>${t.colItem}</th><th>${t.colPrice}</th><th>${t.colSeller}</th><th>${t.colWhere}</th><th>${t.colState}</th><th>${t.colRead}</th><th><span class="sr-only">${t.colEdit}</span></th></tr></thead>
<tbody id="scan-results"><tr class="empty"><td colspan="7">${esc(t.resultsEmpty)}</td></tr></tbody>
</table></div>
<p id="scan-summary" class="muted"></p>
<p class="muted">${esc(t.privacy)}</p>
</div>
</div>
${jsonScript('i18n', { lang, ...t.i, itemsUrl: href('/assets/items.json'), glyphsUrl: href('/assets/shop-glyphs.json'), api: config.voteApi })}`;
}

// ---------- hits-to-kill calculator ----------
// Reads the player's own stat window from a shared game screen (or takes typed numbers) and shows, for every monster, the
// damage per use of the chosen skill and how many uses it takes. Monster and weapon numbers come from the game's client data.
const DMG = {
  ko: {
    title: '글클메 몇 방 컷 계산기: 스탯 창 화면 인식으로 몬스터별 처치 타수 | GMS Hub',
    desc: '글로벌 메이플스토리 클래식 월드 몇 방 컷 계산기. 게임 화면을 공유하면 능력치 창의 스탯과 공격 범위를 자동으로 읽어, 스킬별로 몬스터를 몇 번에 잡는지와 명중률을 보여 줘요.',
    h1: '몇 방 컷 계산기',
    lead: '게임 화면을 공유하면 능력치 창을 읽어 자동으로 채워요. 스킬을 고르면 몬스터마다 몇 방에 잡히는지 바로 보여 줘요.',
    cardDesc: '능력치 창을 화면 공유로 읽어서 몬스터별로 몇 방에 잡히는지, 명중이 충분한지 계산해요.',
    me: '내 캐릭터',
    read: '화면에서 능력치 읽기',
    readHint: '게임에서 능력치 창(단축키 S)을 열고 DETAIL 버튼으로 오른쪽 상세 능력치까지 펼친 뒤 누르세요. 화면은 이 브라우저 안에서만 읽고 어디에도 저장하거나 보내지 않아요.',
    level: '레벨', weapon: '무기 종류', second: '2차 직업', none: '선택 안 함',
    range: '능력치 창 공격 범위', rangeHint: '능력치 창 공격력 옆의 "최소 ~ 최대" 숫자예요.',
    magic: '마력 (능력치 창)', acc: '명중 (능력치 창)', accHint: '비우면 스탯만으로 계산해요(장비 명중 제외).',
    manual: '공격 범위를 모를 때: 무기로 계산', weaponPick: '무기', weaponPh: '무기 이름 검색', extra: '추가 공격력 (주문서·장갑·표창)', mastery: '마스터리 스킬 레벨 (0~20)',
    estimated: '계산된 능력치 창 범위', rage: '분노 (공격력 +40)',
    skill: '스킬', power: '스킬 배율 (%)', powerHint: '마스터 기준이에요. 스킬 레벨이 낮으면 직접 고치세요.',
    mobs: '몬스터별 결과', search: '몬스터 이름 검색', near: '내 레벨 근처', all: '전체',
    cols: { mob: '몬스터', lv: 'Lv', hp: 'HP', dmg: '한 번에 주는 피해', sure: '확정', avg: '평균', acc: '명중률' },
    hits: '{n}방', never: '불가', lines: '{n}타', mobsHit: '최대 {n}마리',
    accNeed: '100% 명중에 필요한 명중 {n}',
    emptyMobs: '조건에 맞는 몬스터가 없어요.', needStats: '레벨, 스탯, 공격 범위(또는 무기)를 넣으면 결과가 나와요.',
    note: '확정은 매번 최저 데미지가 나와도 잡히는 횟수, 평균은 평균 데미지 기준이에요. 크리티컬, 지속 피해, 파이널 어택 추가타, 버프 시간은 넣지 않았어요. 공식은 커뮤니티가 검증한 클래식 월드 데미지 공식이고, 몬스터·무기 수치는 게임 클라이언트 데이터예요.',
    i: {
      loadingOcr: '글자 인식 엔진을 불러오는 중이에요… (처음 한 번만 몇 초 걸려요)',
      sharing: '공유할 게임 창을 선택하세요.', denied: '화면 공유가 취소됐어요.', unsupported: '이 브라우저는 화면 공유를 지원하지 않아요. PC의 크롬이나 엣지를 써 주세요.',
      reading: '능력치 창을 찾는 중이에요…', notFound: '능력치 창을 찾지 못했어요. 게임에서 능력치 창(S)을 열고, 창이 가려지지 않게 한 뒤 다시 눌러 주세요.',
      done: '읽은 값을 채웠어요. 틀린 숫자가 있으면 바로 고치세요.', partial: '일부만 읽었어요. 비어 있는 칸을 채워 주세요.', noDetail: '스탯은 읽었어요. 공격 범위·마력·명중은 능력치 창의 DETAIL을 눌러 상세 능력치를 펼친 뒤 다시 읽어 주세요.',
      fields: { level: '레벨', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', range: '공격 범위', magic: '마력', acc: '명중', job: '직업' },
      read: '읽음', miss: '못 읽음',
      skills: { basic: '기본 공격', power_strike: '파워 스트라이크', slash_blast: '슬래시 블러스트', rush: '돌진', fa_fighter: '파이널 어택 (파이터)', fa_page: '파이널 어택 (페이지)', fa_spear: '파이널 어택 (스피어맨)', arrow_blow: '애로우 블로우', double_shot: '더블 샷', arrow_bomb: '애로우 봄', fa_bow: '파이널 어택 (헌터)', iron_arrow: '아이언 애로우', fa_crossbow: '파이널 어택 (사수)', lucky_seven: '럭키 세븐', drain: '드레인', double_stab: '더블 스탭', savage_blow: '새비지 블로우', steal: '스틸', energy_bolt: '에너지 볼트', magic_claw: '매직 클로', fire_arrow: '파이어 애로우', poison_breath: '포이즌 브레스', cold_beam: '콜드 빔', thunder_bolt: '썬더볼트', holy_arrow: '홀리 애로우' },
      weapons: { '1h_sword': '한손검', '2h_sword': '두손검', '1h_axe': '한손도끼', '1h_blunt': '한손둔기', '2h_axe': '두손도끼', '2h_blunt': '두손둔기', spear: '창', polearm: '폴암', bow: '활', crossbow: '석궁', claw: '아대', dagger: '단검', wand: '완드', staff: '스태프' },
      seconds: { fighter: '파이터', page: '페이지', spearman: '스피어맨', hunter: '헌터', crossbowman: '사수', assassin: '어쌔신', bandit: '시프', fp: '위자드(불독)', il: '위자드(썬콜)', cleric: '클레릭' },
      weak: '약점', strong: '반감', immune: '무효', undead: '언데드', boss: '보스'
    }
  },
  en: {
    title: 'MapleStory Classic World Hits-to-Kill Calculator: Read Your Stat Window From Screen Share | GMS Hub',
    desc: 'Hits-to-kill calculator for MapleStory Classic World. Share your game screen and it reads your stat window, then shows how many hits each skill needs per monster and your hit chance.',
    h1: 'Hits-to-Kill Calculator',
    lead: 'Share your game screen and it fills in your stat window for you. Pick a skill to see how many hits every monster takes.',
    cardDesc: 'Reads your stat window from a screen share and shows how many hits each monster takes and whether your accuracy is enough.',
    me: 'My character',
    read: 'Read stats from screen',
    readHint: 'Open the stat window in game (S key), expand it with DETAIL, then press this. The screen is read only inside this browser and is never saved or sent anywhere.',
    level: 'Level', weapon: 'Weapon type', second: '2nd job', none: 'Not chosen',
    range: 'Stat window attack range', rangeHint: 'The "min ~ max" numbers next to attack in the stat window.',
    magic: 'Magic (stat window)', acc: 'Accuracy (stat window)', accHint: 'Leave blank to use stats only (no equipment accuracy).',
    manual: 'Don’t know the range? Use your weapon', weaponPick: 'Weapon', weaponPh: 'Search weapon name', extra: 'Extra attack (scrolls, gloves, stars)', mastery: 'Mastery skill level (0-20)',
    estimated: 'Calculated stat window range', rage: 'Rage (+40 Attack Power)',
    skill: 'Skill', power: 'Skill damage (%)', powerHint: 'Max skill level. Change it if your skill is lower.',
    mobs: 'Results by monster', search: 'Search monster', near: 'Near my level', all: 'All',
    cols: { mob: 'Monster', lv: 'Lv', hp: 'HP', dmg: 'Damage per use', sure: 'Sure', avg: 'Avg', acc: 'Hit' },
    hits: '{n} hits', never: 'No', lines: '{n} lines', mobsHit: 'up to {n} mobs',
    accNeed: '{n} accuracy for 100%',
    emptyMobs: 'No monsters match.', needStats: 'Enter level, stats and the attack range (or a weapon) to see results.',
    note: 'Sure = uses needed even if every hit rolls its minimum; Avg = with average rolls. Crits, damage over time, Final Attack follow-ups and buff uptime are left out. The formula is the community-tested Classic World damage formula; monster and weapon numbers come from the game client data.',
    i: {
      loadingOcr: 'Loading the text reader… (a few seconds the first time)',
      sharing: 'Pick the game window to share.', denied: 'Screen sharing was cancelled.', unsupported: 'This browser can’t share the screen. Use Chrome or Edge on a PC.',
      reading: 'Looking for the stat window…', notFound: 'Couldn’t find the stat window. Open it in game (S), make sure nothing covers it, and try again.',
      done: 'Filled in what was read. Fix any wrong number right in the box.', partial: 'Only some values were read. Fill in the empty boxes.', noDetail: 'Stats read. For attack range, magic and accuracy, press DETAIL in the stat window to expand it and read again.',
      fields: { level: 'Level', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', range: 'Attack range', magic: 'Magic', acc: 'Accuracy', job: 'Job' },
      read: 'read', miss: 'not read',
      skills: { basic: 'Basic attack', power_strike: 'Power Strike', slash_blast: 'Slash Blast', rush: 'Rush', fa_fighter: 'Final Attack (Fighter)', fa_page: 'Final Attack (Page)', fa_spear: 'Final Attack (Spearman)', arrow_blow: 'Arrow Blow', double_shot: 'Double Shot', arrow_bomb: 'Arrow Bomb', fa_bow: 'Final Attack (Hunter)', iron_arrow: 'Iron Arrow', fa_crossbow: 'Final Attack (Crossbowman)', lucky_seven: 'Lucky Seven', drain: 'Drain', double_stab: 'Double Stab', savage_blow: 'Savage Blow', steal: 'Steal', energy_bolt: 'Energy Bolt', magic_claw: 'Magic Claw', fire_arrow: 'Fire Arrow', poison_breath: 'Poison Breath', cold_beam: 'Cold Beam', thunder_bolt: 'Thunder Bolt', holy_arrow: 'Holy Arrow' },
      weapons: { '1h_sword': '1H Sword', '2h_sword': '2H Sword', '1h_axe': '1H Axe', '1h_blunt': '1H Blunt', '2h_axe': '2H Axe', '2h_blunt': '2H Blunt', spear: 'Spear', polearm: 'Polearm', bow: 'Bow', crossbow: 'Crossbow', claw: 'Claw', dagger: 'Dagger', wand: 'Wand', staff: 'Staff' },
      seconds: { fighter: 'Fighter', page: 'Page', spearman: 'Spearman', hunter: 'Hunter', crossbowman: 'Crossbowman', assassin: 'Assassin', bandit: 'Bandit', fp: 'Wizard (F/P)', il: 'Wizard (I/L)', cleric: 'Cleric' },
      weak: 'weak', strong: 'resists', immune: 'immune', undead: 'undead', boss: 'boss'
    }
  }
};

function damageBody(lang) {
  const t = DMG[lang];
  const num = (id, label, attrs = '') => `<label class="dm-field"><span>${label}</span><input id="${id}" type="number" inputmode="numeric" min="0" ${attrs}></label>`;
  return `${pageHead(lang, 'hammer', t.h1, t.lead)}
<div class="wrap dm">
<section class="panel dm-me" aria-labelledby="dm-me-h">
<div class="dm-head"><h2 id="dm-me-h">${t.me}</h2><button type="button" class="btn" id="dm-read">● ${t.read}</button></div>
<p class="muted small">${esc(t.readHint)}</p>
<p id="dm-status" class="dm-status" aria-live="polite"></p>
<ul id="dm-checks" class="dm-checks" hidden></ul>
<div class="dm-grid">
${num('dm-level', t.level, 'max="200"')}
<label class="dm-field"><span>${t.weapon}</span><select id="dm-weapon"></select></label>
<label class="dm-field"><span>${t.second}</span><select id="dm-second"></select></label>
</div>
<div class="dm-grid dm-stats">
${num('dm-str', 'STR')}${num('dm-dex', 'DEX')}${num('dm-int', 'INT')}${num('dm-luk', 'LUK')}
</div>
<div class="dm-grid">
<label class="dm-field dm-range" data-phys><span>${t.range}</span><span class="dm-pair"><input id="dm-min" type="number" inputmode="numeric" min="0" aria-label="min"><b>~</b><input id="dm-max" type="number" inputmode="numeric" min="0" aria-label="max"></span><small>${esc(t.rangeHint)}</small></label>
${num('dm-magic', t.magic, 'data-magic')}
<label class="dm-field"><span>${t.acc}</span><input id="dm-acc" type="number" inputmode="numeric" min="0"><small>${esc(t.accHint)}</small></label>
</div>
<label class="dm-check" data-warrior><input type="checkbox" id="dm-rage"> ${t.rage}</label>
<details class="dm-manual" id="dm-manual" data-phys>
<summary>${t.manual}</summary>
<div class="dm-grid">
<label class="dm-field dm-wide"><span>${t.weaponPick}</span><input id="dm-wsearch" type="search" list="dm-wlist" placeholder="${esc(t.weaponPh)}" autocomplete="off"><datalist id="dm-wlist"></datalist></label>
${num('dm-extra', t.extra)}
${num('dm-mastery', t.mastery, 'max="20"')}
</div>
<p class="muted small" id="dm-estimated"></p>
</details>
</section>
<section class="panel dm-skill" aria-labelledby="dm-skill-h">
<h2 id="dm-skill-h">${t.skill}</h2>
<div class="dm-skills" id="dm-skills" role="radiogroup" aria-labelledby="dm-skill-h"></div>
<label class="dm-field dm-power"><span>${t.power}</span><input id="dm-power" type="number" inputmode="numeric" min="1"><small>${esc(t.powerHint)}</small></label>
</section>
<section class="panel dm-out" aria-labelledby="dm-out-h">
<div class="dm-head"><h2 id="dm-out-h">${t.mobs}</h2>
<div class="dm-filter"><input id="dm-mob-q" type="search" placeholder="${esc(t.search)}" autocomplete="off" aria-label="${esc(t.search)}">
<div class="seg" role="group"><button type="button" id="dm-near" aria-pressed="true">${t.near}</button><button type="button" id="dm-all" aria-pressed="false">${t.all}</button></div></div></div>
<div class="dm-table-wrap"><table class="dm-table">
<thead><tr><th>${t.cols.mob}</th><th>${t.cols.lv}</th><th>${t.cols.hp}</th><th>${t.cols.dmg}</th><th>${t.cols.sure}</th><th>${t.cols.avg}</th><th>${t.cols.acc}</th></tr></thead>
<tbody id="dm-rows"><tr class="empty"><td colspan="7">${esc(t.needStats)}</td></tr></tbody>
</table></div>
<p class="muted small">${esc(t.note)}</p>
<p class="muted small">${lang === 'ko' ? `레벨별 사냥터는 <a href="${href(langPath(lang, '/tools/training/'))}">사냥터 찾기</a>와 <a href="${href(langPath(lang, '/guides/leveling-30-70/'))}">30~70레벨 사냥터 가이드</a>에서 볼 수 있어요.` : `For where to train, see the <a href="${href(langPath(lang, '/tools/training/'))}">training spot finder</a>.`}</p>
</section>
</div>
${jsonScript('dm-data', { lang, t: { ...t.i, hits: t.hits, never: t.never, lines: t.lines, mobsHit: t.mobsHit, accNeed: t.accNeed, emptyMobs: t.emptyMobs, needStats: t.needStats, estimated: t.estimated, none: t.none }, mobsUrl: href('/assets/mobs.json'), weaponsUrl: href('/assets/weapons.json') })}`;
}

// ---------- live market page ----------
// The main price feature: search an item to see its statistics, a 7-day price trend, how listings spread over price bands
// and where to buy it now; next to the live top 10 and the scrolling feed of scanned listings.
const MK = {
  ko: {
    title: '글클메 실시간 자유시장 시세: 가격 추이·가격대 분포·지금 파는 곳 | GMS Hub',
    desc: '글로벌 메이플스토리 클래식 월드 자유시장 실시간 시세. 유저들이 스캔한 상점 매물로 판매 중·판매 완료 중앙값, 7일 가격 추이, 최근 확인한 매물의 채널·방을 보여 줘요.',
    h1: '실시간 시세',
    lead: '유저들이 스캔한 자유시장 상점을 모아 아이템별 시세를 보여 줘요. 아이템을 검색해 보세요.',
    placeholder: '아이템 이름 (예: 장갑 공격력, 일비, 메탈 완드)',
    stats: { listings: '24시간 매물', shops: '상점', items: '아이템', sold: '판매 확인' },
    scan: '내 화면으로 상점 스캔',
    top: '인기 아이템 TOP 10',
    recent: '방금 올라온 매물',
    pick: '아이템을 검색하거나 순위에서 골라 보세요.',
    noData: '이 아이템은 아직 최근 7일 매물이 없어요. 스캔하면 바로 쌓여요.',
    tiles: { avg: '판매 중 중앙값 (24시간)', low: '관측 최저가 (24시간)', last: '판매 완료 중앙값 (24시간)', count: '최근 7일 매물' },
    trend: '가격 추이 (7일)',
    trendNote: '선은 날짜별 중앙값, 띠는 그날의 최저~최고, 점은 매물 하나하나예요.',
    dist: '가격대 분포',
    distNote: '최근 7일 매물이 어느 가격대에 몰려 있는지 보여 줘요.',
    where: '최근 확인한 판매 매물',
    whereNote: '최근 24시간 안에 확인한 판매 중 매물이에요. 실제 재고는 달라질 수 있어요. 가격은 개당 메소예요.',
    sold: '팔림',
    selling: '판매 중',
    listings: '매물',
    soldN: '판매',
    median: '중앙값',
    range: '범위',
    external: '다른 시세 사이트에서 보기',
    loading: '시세를 불러오는 중이에요…', failed: '시세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', retry: '다시 시도',
    emptyRank: '최근 24시간 순위 데이터가 없어요.', emptyFeed: '아직 등록된 상점 매물이 없어요.', noMatches: '일치하는 아이템이 없어요. 다른 이름으로 검색해 보세요.',
    refreshed: '갱신', staleData: '갱신 실패 · 이전 데이터를 표시하고 있어요', sample: '표본이 3개 미만이면 시세 참고용으로만 봐 주세요.',
    filterChannel: '모든 채널', filterRoom: '모든 방', sortPrice: '낮은 가격순', sortRecent: '최근 확인순', noOpen: '이 조건에 맞는 최근 판매 매물이 없어요.',
    history: '판매 완료·오래된 매물', stale: '24시간 경과', total: '묶음 총액', priceUnit: '메소 / 개', excluded: '극단적인 가격 {n}개는 통계에서 제외했어요.',
    chartSelling: '판매 중 기록', chartSold: '판매 완료 기록', chartEmpty: '선택한 상태의 기록이 없어요.',
    table: { price: '개당 가격', qty: '묶음', seller: '판매자', where: '위치', seen: '본 시각' }
  },
  en: {
    title: 'MapleStory Classic World Live Free Market Prices: Trends, Price Spread, Where to Buy | GMS Hub',
    desc: 'Live Free Market prices for MapleStory Classic World from shops players scanned: separate asking and sold medians, 7-day trends and recently observed shops (channel and room) for each item.',
    h1: 'Live Market',
    lead: 'Prices from Free Market shops players scanned. Search an item.',
    placeholder: 'Item name (e.g. Gloves Attack, Ilbi, Metal Wand)',
    stats: { listings: 'listings 24h', shops: 'shops', items: 'items', sold: 'seen sold' },
    scan: 'Scan shops from my screen',
    top: 'Top 10 items',
    recent: 'Just listed',
    pick: 'Search an item or pick one from the ranking.',
    noData: 'No listings for this item in the last 7 days yet. Scanning adds them right away.',
    tiles: { avg: 'Asking median (24h)', low: 'Lowest seen (24h)', last: 'Sold median (24h)', count: 'Listings (7 days)' },
    trend: 'Price trend (7 days)',
    trendNote: 'Line: daily median. Band: that day’s lowest to highest. Dots: individual listings.',
    dist: 'Price spread',
    distNote: 'Where the last 7 days of listings sit by price.',
    where: 'Where to buy',
    whereNote: 'Open listings seen in the last 24 hours. Availability may have changed. Prices are mesos per item.',
    sold: 'Sold',
    selling: 'For sale',
    listings: 'listings',
    soldN: 'sold',
    median: 'median',
    range: 'range',
    external: 'See it on other price sites',
    loading: 'Loading prices…', failed: 'Could not load prices. Please try again.', retry: 'Retry',
    emptyRank: 'No ranking data in the last 24 hours.', emptyFeed: 'No shop listings yet.', noMatches: 'No matching items. Try another name.',
    refreshed: 'Updated', staleData: 'Refresh failed · showing previous data', sample: 'Fewer than 3 observations: treat the price as a rough reference.',
    filterChannel: 'All channels', filterRoom: 'All rooms', sortPrice: 'Lowest price', sortRecent: 'Most recent', noOpen: 'No recent open listings match these filters.',
    history: 'Sold and older listings', stale: 'Over 24h old', total: 'Bundle total', priceUnit: 'mesos / item', excluded: '{n} extreme prices excluded from statistics.',
    chartSelling: 'Asking prices', chartSold: 'Sold prices', chartEmpty: 'No observations for this status.',
    table: { price: 'Each', qty: 'Bundle', seller: 'Seller', where: 'Where', seen: 'Seen' }
  }
};

function marketBody(lang) {
  const t = MK[lang];
  const stat = (k) => `<div><dd id="mk-stat-${k}">–</dd><dt>${t.stats[k]}</dt></div>`;
  return `${pageHead(lang, 'coin', t.h1, t.lead)}
<div class="wrap mk">
<div class="mk-bar">
<dl class="mk-stats"><span class="live-dot" aria-hidden="true"></span>${['listings', 'shops', 'items', 'sold'].map(stat).join('')}</dl>
<a class="btn small-btn" href="${href(langPath(lang, '/tools/scan/'))}">● ${t.scan}</a>
<a class="btn ghost small-btn" href="${href(langPath(lang, '/items/'))}">${IT[lang].indexLink}</a>
</div>
<p id="mk-status" class="muted" role="status">${t.loading}</p>
<button type="button" id="mk-retry" class="btn ghost small-btn" hidden>${t.retry}</button>
<div class="mk-search panel">
<input type="search" id="mk-q" placeholder="${esc(t.placeholder)}" autocomplete="off" aria-label="${esc(t.placeholder)}" aria-controls="mk-suggest" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-describedby="mk-search-status">
<p id="mk-search-status" class="muted" role="status" hidden></p>
<ul id="mk-suggest" class="mk-suggest" role="listbox" hidden></ul>
</div>
<div class="mk-grid">
<section class="mk-detail panel" id="mk-detail"><p class="muted">${t.pick}</p></section>
<aside class="mk-side">
<section class="panel"><h2>${t.top}</h2><ol class="rank-list mk-rank" id="rank-list"></ol></section>
<section class="panel"><h2>${t.recent}</h2><ol class="recent-list mk-feed" id="live-rows"></ol></section>
</aside>
</div>
<div class="spark-tip" id="spark-tip" role="tooltip" hidden></div>
</div>
${jsonScript('mk-data', { lang, api: config.voteApi, itemsUrl: href('/assets/items.json'), priceUrl: href(langPath(lang, '/tools/price/')), sites: PRICE_SITES, t, live: LIVE[lang], itemBase: href(langPath(lang, '/items/')), itemLink: IT[lang].pageLink })}`;
}

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
${dropGuide(lang)}
</div>
${jsonScript('i18n', { lang, times: t.times })}`;
}

// ---------- tool guides ----------
// Worked examples are computed from the data files, so the prose stays in step with the tables.

const pct = (x, lang, digits = 1) => `${new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(x * 100)}%`;
const choose = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
const atLeast = (n, p, k) => {
  let sum = 0;
  for (let i = k; i <= n; i++) sum += choose(n, i) * p ** i * (1 - p) ** (n - i);
  return sum;
};
const triesFor = (p, c) => Math.ceil(Math.log(1 - c) / Math.log(1 - p));

function dropGuide(lang) {
  const p = 0.01;
  const v = {
    p100: pct(1 - (1 - p) ** 100, lang),
    p200: pct(1 - (1 - p) ** 200, lang),
    t50: triesFor(p, 0.5),
    t90: triesFor(p, 0.9),
    t99: triesFor(p, 0.99)
  };
  return lang === 'ko'
    ? `<section class="prose guide">
<h2>드롭률 계산, 이렇게 읽어요</h2>
<h3>"1%면 100번에 하나"가 아닌 이유</h3>
<p>1% 아이템을 100번 시도하면 기대 획득 개수는 1개지만, <strong>한 번이라도 얻을 확률은 ${v.p100}</strong>예요. 매 시도가 서로 독립이라서 운이 나쁘면 100번 모두 실패할 수 있기 때문이에요. 200번 시도해도 확률은 ${v.p200}로, 100%에 가까워질 뿐 도달하지는 않아요.</p>
<h3>몇 번 해야 할까?</h3>
<p>1% 아이템을 기준으로 하면 50% 확률로 얻으려면 <strong>${v.t50}번</strong>, 90%는 <strong>${v.t90}번</strong>, 99%는 <strong>${v.t99}번</strong>이 필요해요. 위 계산기에 드롭률만 넣으면 같은 방식으로 원하는 아이템의 횟수를 볼 수 있어요.</p>
<h3>"이번엔 나오겠지"는 착각이에요</h3>
<p>공식적으로 보정(천장) 시스템이 안내되지 않은 경우, 앞에서 몇 번 실패했든 다음 시도의 확률은 그대로예요. 이미 200번 실패했어도 다음 한 번의 확률은 여전히 1%예요. 그래서 계산기는 "지금부터 몇 번 더"를 기준으로 보면 돼요.</p>
<h3>기대값과 확률을 구분하세요</h3>
<p>기대 획득 개수(n × p)는 같은 시도를 아주 많이 반복했을 때의 평균이에요. 한 사람의 결과는 이보다 훨씬 많거나 적을 수 있으니, 메소나 시간을 쓸지 정할 때는 "원하는 확률로 얻는 데 필요한 횟수"를 함께 보세요.</p>
</section>`
    : `<section class="prose guide">
<h2>How to read drop odds</h2>
<h3>Why 1% is not "one in 100"</h3>
<p>With a 1% item, 100 tries give an expected 1 drop, but the <strong>chance of getting at least one is only ${v.p100}</strong>. Each try is independent, so an unlucky run can miss all 100. Even 200 tries give ${v.p200}: the odds approach 100% but never reach it.</p>
<h3>How many tries?</h3>
<p>For a 1% item you need <strong>${v.t50} tries</strong> for a 50% chance, <strong>${v.t90}</strong> for 90% and <strong>${v.t99}</strong> for 99%. Enter any drop rate in the calculator above to get the same numbers for your item.</p>
<h3>"It's due" is a fallacy</h3>
<p>Unless an official pity system is announced, past failures don't change the next try. After 200 misses the next try is still 1%, so read the calculator as "how many more from now".</p>
<h3>Expected value is not a promise</h3>
<p>Expected drops (n × p) is the long-run average over many players. Any one player can land far above or below it, so when deciding how many mesos or hours to spend, look at the tries needed for the chance you're comfortable with.</p>
</section>`;
}

function scrollGuide(lang) {
  const tier = (id) => scrolls.tiers.find((x) => x.id === id);
  const mid = tier('intermediate');
  const great = tier('greater');
  const chaos = tier('chaos');
  const std = scrolls.ladders.find((l) => l.id === 'standard');
  const n = 7;
  const pm = mid.success / 100;
  const pg = great.success / 100;
  const boom = (1 - chaos.success / 100) * (chaos.destroyOnFail / 100);
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const v = {
    n,
    mid: mid.name,
    midRate: mid.success,
    gain: std.gains.intermediate,
    expPass: nf.format(n * pm),
    expGain: nf.format(n * pm * std.gains.intermediate),
    all: pct(pm ** n, lang),
    five: pct(atLeast(n, pm, 5), lang),
    great: great.name,
    greatRate: great.success,
    greatOne: pct(1 - (1 - pg) ** n, lang),
    chaos: chaos.name,
    boom: pct(boom, lang),
    survive3: pct((1 - boom) ** 3, lang)
  };
  return lang === 'ko'
    ? `<section class="prose guide">
<h2>주문서 확률, 이렇게 계산해요</h2>
<h3>성공 횟수는 이항분포를 따라요</h3>
<p>주문서 한 장 한 장은 서로 독립이에요. 그래서 성공률 p인 주문서를 n장 바를 때 정확히 k번 성공할 확률은 C(n, k) × pᵏ × (1 − p)ⁿ⁻ᵏ예요. 위 계산기의 분포 그래프가 이 값을 그린 거예요.</p>
<h3>예시: ${v.mid} ${v.midRate}% 주문서 ${v.n}장</h3>
<p>기본 상승치(+${v.gain})짜리 ${v.mid} 주문서 ${v.n}장을 바르면 평균 성공 횟수는 <strong>${v.expPass}번</strong>, 평균 상승치는 <strong>+${v.expGain}</strong>이에요. 하지만 ${v.n}장이 모두 붙을 확률은 <strong>${v.all}</strong>뿐이고, 5장 이상 붙을 확률은 ${v.five}예요. "평균"과 "내가 원하는 결과가 나올 확률"은 꽤 다르다는 걸 알 수 있어요.</p>
<h3>${v.great} ${v.greatRate}%는 몇 장이면 붙을까?</h3>
<p>${v.great} 주문서 ${v.n}장을 바르면 한 번이라도 붙을 확률은 ${v.greatOne}예요. 성공률이 낮은 주문서는 평균보다 "0번 성공"이 나올 확률을 먼저 확인하세요.</p>
<h3>${v.chaos} 주문서와 파괴 확률</h3>
<p>표에 따르면 ${v.chaos} 주문서는 실패하면 50% 확률로 아이템이 파괴돼요. 그래서 한 장을 바를 때 파괴될 확률은 (1 − 성공률) × 50% = <strong>${v.boom}</strong>이고, 3장을 연달아 발라도 아이템이 살아남을 확률은 ${v.survive3}예요. 소중한 아이템이라면 계산기의 파괴 확률을 꼭 확인하세요.</p>
</section>`
    : `<section class="prose guide">
<h2>How scroll odds are calculated</h2>
<h3>Passes follow a binomial distribution</h3>
<p>Every scroll is an independent roll. For n scrolls with success rate p, the chance of exactly k passes is C(n, k) × pᵏ × (1 − p)ⁿ⁻ᵏ. The distribution chart in the calculator above plots exactly this.</p>
<h3>Example: ${v.n} ${v.mid} ${v.midRate}% scrolls</h3>
<p>Applying ${v.n} standard (+${v.gain}) ${v.mid} scrolls averages <strong>${v.expPass} passes</strong> and <strong>+${v.expGain}</strong>. Yet the chance all ${v.n} pass is only <strong>${v.all}</strong>, and 5 or more pass ${v.five} of the time. The average and the odds of the result you want are very different things.</p>
<h3>How many ${v.great} ${v.greatRate}% scrolls until one passes?</h3>
<p>With ${v.n} ${v.great} scrolls, the chance of at least one pass is ${v.greatOne}. For low-rate scrolls, check the odds of zero passes before the average.</p>
<h3>${v.chaos} scrolls and boom risk</h3>
<p>Per the table, a failed ${v.chaos} scroll destroys the item 50% of the time. So each scroll booms with probability (1 − success) × 50% = <strong>${v.boom}</strong>, and an item survives three in a row only ${v.survive3} of the time. Check the boom chance in the calculator before scrolling anything you care about.</p>
</section>`;
}

const prose = (h1, body) => `<article class="wrap prose"><h1>${h1}</h1>${body.replaceAll('{issues}', issuesUrl)}</article>`;

// ---------- guides ----------

const guidePath = (g) => `/guides/${g.slug}/`;
const fmtDate = (d) => d.replaceAll('-', '. ') + '.';

// Every guide ends with links to the other guides, so a reader from search can keep going.
const related = (g) => {
  const others = guides.filter((o) => o.lang === g.lang && o.slug !== g.slug);
  return others.length
    ? `<h2>다른 가이드</h2>\n<ul class="sources">${others.map((o) => `<li><a href="${href(langPath(o.lang, guidePath(o)))}">${esc(o.h1)}</a></li>`).join('')}</ul>`
    : '';
};

// Kakao AdFit units are size-fixed, so each <ins> declares the viewport it fits and the inline script drops the rest before the
// loader runs (a hidden unit would still count impressions). Renders nothing for units left blank in site.config.json.
const adfitIns = (unit, w, h, minWidth = 0, maxWidth = 99999) =>
  unit
    ? `<ins class="kakao_ad_area" style="display:none" data-ad-unit="${esc(unit)}" data-ad-width="${w}" data-ad-height="${h}" data-min="${minWidth}" data-max="${maxWidth}"></ins>`
    : '';
const adfitLoader = `<script>(function(){var a=document.currentScript.parentNode;a.querySelectorAll('ins[data-min]').forEach(function(e){if(innerWidth<+e.dataset.min||innerWidth>+e.dataset.max)e.remove()});if(!a.querySelector('ins'))a.remove()})()</script>
<script async src="//t1.kakaocdn.net/kas/static/ba.min.js"></script>`;

function adfitSlot() {
  const { mobile, pc } = config.adfit || {};
  if (!mobile && !pc) return '';
  return `<aside class="ad-slot" aria-label="Advertisement"><span class="ad-label">ADVERTISEMENT</span>
${adfitIns(mobile, 320, 100, 0, 759)}${adfitIns(pc, 728, 90, 760)}
${adfitLoader}</aside>`;
}

// Skyscrapers in the empty gutters beside the 1200px layout, pinned next to the purpose section (not following the scroll);
// only screens wide enough to fit them without covering content get them.
function adfitRails() {
  const { railLeft, railRight } = config.adfit || {};
  if (!railLeft && !railRight) return '';
  const rail = (unit, side) =>
    unit ? `<div class="ad-rail ad-rail-${side}">${adfitIns(unit, 160, 600, 1600)}</div>` : '';
  return `<aside class="ad-rails" aria-label="Advertisement">${rail(railLeft, 'left')}${rail(railRight, 'right')}
${adfitLoader}</aside>`;
}

function guideBody(g) {
  const body = g.body
    .replace(/<table>/g, '<div class="table-wrap"><table class="data">')
    .replace(/<\/table>/g, '</table></div>');
  const sources = g.sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`)
    .join('');
  return `<article class="wrap prose guide-article">
<p class="crumbs"><a href="${href(langPath(g.lang, '/guides/'))}">${T[g.lang].navGuides}</a></p>
<h1>${esc(g.h1)}</h1>
<p class="byline">GMS Hub 작성 · 처음 쓴 날 ${fmtDate(g.published)} · 마지막 확인 ${fmtDate(g.updated)}</p>
${body}
${adfitSlot()}
${sources ? `<h2>참고한 자료</h2>\n<ul class="sources">${sources}</ul>` : ''}
${related(g)}
<p class="muted">공개된 공략 자료와 팬 데이터베이스를 서로 맞춰 보고 정리했어요. 자료끼리 숫자가 다르면 확인된 쪽만 적거나 다르다고 밝혔어요. 게임이 업데이트되면 내용이 달라질 수 있어요. 틀린 부분은 <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>이나 <a href="${issuesUrl}" target="_blank" rel="noopener">GitHub 이슈</a>로 알려 주세요.</p>
</article>`;
}

function guidesIndexBody(lang) {
  const items = guides
    .filter((g) => g.lang === lang)
    .map(
      (g) =>
        `<li><a href="${href(langPath(lang, guidePath(g)))}"><strong>${esc(g.h1)}</strong></a><p>${esc(g.desc)}</p><small class="muted">${fmtDate(g.updated)}</small></li>`
    )
    .join('');
  return `<article class="wrap prose"><h1>글클메 가이드</h1>
<p>글클메를 하다 보면 헷갈리는 것들을 한 주제씩 정리한 글이에요. 공개된 공략 자료와 팬 데이터베이스를 서로 맞춰 보고, 확인된 내용만 적어요.</p>
<ul class="guide-list">${items}</ul></article>`;
}

// ---------- write ----------

fs.rmSync(out, { recursive: true, force: true });
// ---------- item pages ----------
// One page per item, so "<item> 시세" searches land on that item. Prices come from data/item-prices.json (player scans only,
// refreshed by scripts/fetch-item-prices.mjs before each build); an item with no price in the last 14 days stays noindex.
const itemPrices = fs.existsSync(path.join(root, 'data/item-prices.json')) ? readJson('data/item-prices.json') : { updated: '', prices: {} };
const PRICES_DATE = (itemPrices.updated || BUILD_DATE).slice(0, 10);
const itemSlug = (i) => `${i.id}-${i.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.replace(/-$/, '');
const itemPath = (i) => `/items/${itemSlug(i)}/`;
const priceOf = (i) => itemPrices.prices[i.id] || null;
const itemName = (lang, i) => (lang === 'ko' && i.ko ? i.ko : i.en);
const PRICED = itemsData.items.filter(priceOf);
const WEAPON_SUB = /Wand|Staff|Bow|Claw|Dagger|Spear|Pole ?Arm|Sword|Axe|Blunt|BW/;
const itemIcon = (id, size) => `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy">`;

// Korean players think in 만/억; elsewhere k/m/b (same as the live market page).
function mesoText(lang, n) {
  if (lang === 'ko') {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(2)}억`;
    if (n >= 1e4) return `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만`;
    return n.toLocaleString('ko');
  }
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(n);
}

const IT = {
  ko: {
    title: '{name} 시세 · 가격 (글클메 자유시장) | GMS Hub',
    desc: '{name} 글클메 자유시장 시세: {basis} 중앙값 {median} 메소 (최근 14일 매물 {n}건, {low}~{high}). 유저가 스캔한 상점 매물 기준이고, 7일 추이와 지금 파는 채널·방도 보여 줘요.',
    descNone: '{name} 글로벌 메이플 클래식 월드 아이템 정보 ({info}). 최근 14일 스캔 시세가 아직 없어요. 상점을 스캔하면 시세가 바로 쌓여요.',
    h1: '{name} 시세',
    lead: '글로벌 메이플스토리 클래식 월드 자유시장에서 유저들이 직접 스캔한 상점 매물로 계산한 시세예요.',
    basis: { sold: '거래가', selling: '판매가', buying: '구매가' },
    headline: '{basis} 중앙값 · 최근 14일',
    count: '매물 {n}건',
    range: '최저 {low} ~ 최고 {high}',
    unit: '메소 / 개',
    kinds: { sold: '판매 완료', selling: '판매 중', buying: '구매 희망' },
    asOf: '시세 기준 {date} · 마지막 확인 {last}',
    none: '최근 14일 동안 스캔된 매물이 아직 없어요. 자유시장에서 이 아이템을 파는 상점을 스캔하면 바로 시세가 생겨요.',
    scan: '내 화면으로 상점 스캔하기',
    infoH: '아이템 정보',
    info: { cat: '분류', lv: '레벨', ko: '한글 이름', en: '영어 이름', id: '아이템 ID' },
    liveH: '실시간 매물과 7일 추이',
    liveNote: '이 부분은 페이지를 열 때 시세 서버에서 새로 받아 와요.',
    open: '지금 파는 곳 (최근 24시간, 낮은 가격순)',
    market: '실시간 시세 화면에서 자세히 보기',
    related: '비슷한 아이템 시세',
    tools: '같이 쓰면 좋은 도구',
    scrollTool: '주문서 성공 확률 계산기',
    damageTool: '사냥터별 몇 방 계산기',
    external: '다른 시세 사이트에서 보기',
    method: '시세는 유저가 직접 스캔하거나 올린 매물만 모아 계산해요. 중앙값에서 5배 넘게 벗어난 가격은 빼고, 판매 완료 기록이 있으면 그 가격을, 없으면 판매 중 가격을 기준으로 보여 줘요. 실제 거래 가격은 다를 수 있어요.',
    loading: '매물을 불러오는 중이에요…', failed: '실시간 매물을 불러오지 못했어요.', noData: '최근 7일 매물이 없어요.', noOpen: '최근 24시간 안에 확인한 판매 매물이 없어요.',
    table: { price: '개당 가격', qty: '묶음', seller: '판매자', where: '위치', seen: '본 시각' },
    indexTitle: '글클메 아이템 시세 모음: 자유시장 가격 {n}개 | GMS Hub',
    indexDesc: '글로벌 메이플 클래식 월드 자유시장에서 최근 14일 동안 스캔된 아이템 {n}개의 시세를 분류별로 모았어요. 매일 갱신돼요.',
    indexH1: '아이템별 시세',
    indexLead: '최근 14일 동안 스캔된 아이템 {n}개예요. 매일 갱신돼요. 아이템을 누르면 추이와 파는 곳을 볼 수 있어요.',
    indexLink: '아이템별 시세 모아 보기',
    pageLink: '이 아이템 시세 페이지',
    cats: { Equip: '장비', Use: '소비', Etc: '기타', Setup: '설치' }
  },
  en: {
    title: '{name} Price – MapleStory Classic World Free Market | GMS Hub',
    desc: '{name} price in MapleStory Classic World: {basis} median {median} mesos ({n} listings in 14 days, {low}–{high}). From Free Market shops players scanned, with a 7-day trend and where it is for sale now.',
    descNone: '{name} in MapleStory Classic World ({info}). No scanned price in the last 14 days yet; scanning a shop that sells it adds one right away.',
    h1: '{name} Price',
    lead: 'Prices from Free Market shops players scanned in Global MapleStory Classic World.',
    basis: { sold: 'sold', selling: 'asking', buying: 'buying' },
    headline: '{basis} median · last 14 days',
    count: '{n} listings',
    range: 'Low {low} – high {high}',
    unit: 'mesos / item',
    kinds: { sold: 'Sold', selling: 'Asking', buying: 'Buying' },
    asOf: 'Prices as of {date} · last seen {last}',
    none: 'No scanned listings in the last 14 days yet. Scan a Free Market shop that sells it and the price shows up right away.',
    scan: 'Scan shops from my screen',
    infoH: 'Item info',
    info: { cat: 'Type', lv: 'Level', ko: 'Korean name', en: 'Name', id: 'Item ID' },
    liveH: 'Live listings and 7-day trend',
    liveNote: 'This part loads fresh from the price server when you open the page.',
    open: 'For sale now (last 24 hours, cheapest first)',
    market: 'Open it in the Live Market',
    related: 'Similar items',
    tools: 'Related tools',
    scrollTool: 'Scroll success calculator',
    damageTool: 'Hits-to-kill calculator',
    external: 'See it on other price sites',
    method: 'Only listings players scanned or reported count. Prices more than 5× away from the median are dropped; the headline uses sold prices when there are any, otherwise asking prices. Real trades can differ.',
    loading: 'Loading listings…', failed: 'Could not load live listings.', noData: 'No listings in the last 7 days.', noOpen: 'No open listings seen in the last 24 hours.',
    table: { price: 'Each', qty: 'Bundle', seller: 'Seller', where: 'Where', seen: 'Seen' },
    indexTitle: 'MapleStory Classic World Item Prices: {n} Free Market Items | GMS Hub',
    indexDesc: 'Free Market prices for {n} MapleStory Classic World items scanned in the last 14 days, grouped by type and refreshed daily.',
    indexH1: 'Item prices',
    indexLead: '{n} items scanned in the last 14 days, refreshed daily. Open one for its trend and where it is for sale.',
    indexLink: 'Browse prices by item',
    pageLink: 'Item price page',
    cats: { Equip: 'Equip', Use: 'Use', Etc: 'Etc', Setup: 'Setup' }
  }
};

const subLabel = (lang, i) => (lang === 'ko' ? PR.ko.subs[i.sub] : i.sub) || IT[lang].cats[i.cat] || i.cat;
const itemInfoText = (lang, i) => [subLabel(lang, i), i.lv ? `Lv. ${i.lv}` : ''].filter(Boolean).join(' · ');

function itemDesc(lang, i) {
  const t = IT[lang];
  const p = priceOf(i);
  const name = itemName(lang, i);
  if (!p) return fill(t.descNone, { name, info: itemInfoText(lang, i) });
  return fill(t.desc, { name, basis: t.basis[p.basis], median: mesoText(lang, p.median), n: p.n, low: mesoText(lang, p.low), high: mesoText(lang, p.high) });
}

// Same type first, then nearest level; priced neighbours lead so the links go to pages with something on them.
function relatedItems(i) {
  return itemsData.items
    .filter((x) => x.id !== i.id && x.cat === i.cat && (x.sub === i.sub || !i.sub))
    .sort((a, b) => !!priceOf(b) - !!priceOf(a) || Math.abs((a.lv || 0) - (i.lv || 0)) - Math.abs((b.lv || 0) - (i.lv || 0)) || a.id - b.id)
    .slice(0, 8);
}

const itemLink = (lang, i) => {
  const p = priceOf(i);
  return `<li><a href="${href(langPath(lang, itemPath(i)))}">${itemIcon(i.id, 24)}<span>${esc(itemName(lang, i))}</span><small>${p ? `${mesoText(lang, p.median)} · ${IT[lang].basis[p.basis]}` : esc(itemInfoText(lang, i))}</small></a></li>`;
};

function itemBody(lang, i) {
  const t = IT[lang];
  const p = priceOf(i);
  const name = itemName(lang, i);
  const nf = new Intl.NumberFormat(lang);
  const kinds = p ? ['sold', 'selling', 'buying'].filter((k) => p[k]).map((k) => `<li><span>${t.kinds[k]}</span><b>${nf.format(p[k].median)}</b><small>${fill(t.count, { n: p[k].n })}</small></li>`).join('') : '';
  const price = p
    ? `<p class="item-headline-label">${fill(t.headline, { basis: t.basis[p.basis] })}</p>
<p class="item-headline"><b>${nf.format(p.median)}</b> <span>${t.unit}</span></p>
<p class="muted">${fill(t.count, { n: p.n })} · ${fill(t.range, { low: nf.format(p.low), high: nf.format(p.high) })}</p>
<ul class="item-kinds">${kinds}</ul>
<p class="muted note">${fill(t.asOf, { date: PRICES_DATE, last: p.last.slice(0, 10) })}</p>`
    : `<p>${t.none}</p><p><a class="btn small-btn" href="${href(langPath(lang, '/tools/scan/'))}">● ${t.scan}</a></p>`;
  const rows = [
    [t.info.cat, `${esc(IT[lang].cats[i.cat] || i.cat)}${i.sub ? ` · ${esc(subLabel(lang, i))}` : ''}`],
    i.lv ? [t.info.lv, `${i.lv}`] : null,
    lang === 'ko' ? [t.info.en, esc(i.en)] : i.ko ? [t.info.ko, esc(i.ko)] : null,
    [t.info.id, `${i.id}`]
  ].filter(Boolean);
  const tools = [
    i.cat === 'Use' && /\bScroll\b/.test(i.en) ? `<a href="${href(langPath(lang, '/tools/scroll/'))}">${t.scrollTool}</a>` : '',
    i.cat === 'Equip' && WEAPON_SUB.test(i.sub || '') ? `<a href="${href(langPath(lang, '/tools/damage/'))}">${t.damageTool}</a>` : ''
  ].filter(Boolean);
  const external = PRICE_SITES.map((s) => `<a href="${esc(s.url.replace('{id}', i.id).replace('{en}', encodeURIComponent(i.en)))}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ');
  return `<section class="page-head wrap">
<p class="crumbs"><a href="${href(langPath(lang, '/tools/market/'))}">${T[lang].navMarket}</a> › <a href="${href(langPath(lang, '/items/'))}">${t.indexH1}</a></p>
<span class="badge-game">${esc(T[lang].gameBadge)}</span>
<h1 class="item-title">${itemIcon(i.id, 40)}<span>${esc(fill(t.h1, { name }))}${lang === 'ko' && i.ko ? `<small class="en-name">${esc(i.en)}</small>` : ''}</span></h1>
<p class="lead">${esc(t.lead)}</p>
</section>
<div class="wrap item-page">
<div class="item-grid">
<section class="panel item-price">${price}</section>
<section class="panel item-info"><h2>${t.infoH}</h2><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
${tools.length ? `<h3>${t.tools}</h3><p>${tools.join(' · ')}</p>` : ''}</section>
</div>
<section class="panel item-live"><h2>${t.liveH}</h2><p class="muted note">${t.liveNote}</p>
<div id="mk-charts"></div>
<h3>${t.open}</h3><div id="it-open" aria-live="polite"><p class="muted">${t.loading}</p></div>
<p><a class="btn small-btn" href="${href(langPath(lang, `/tools/market/?item=${i.id}`))}">${t.market}</a></p></section>
<section class="panel"><h2>${t.related}</h2><ul class="item-links">${relatedItems(i).map((x) => itemLink(lang, x)).join('')}</ul></section>
<p class="muted small">${t.method}</p>
<p class="muted small">${t.external}: ${external}</p>
</div>
${jsonScript('it-data', { lang, id: i.id, api: config.voteApi, t: { loading: t.loading, failed: t.failed, noData: t.noData, noOpen: t.noOpen, table: t.table } })}`;
}

function itemsIndexBody(lang) {
  const t = IT[lang];
  const n = PRICED.length;
  const groups = ['Equip', 'Use', 'Etc', 'Setup']
    .map((cat) => [cat, PRICED.filter((i) => i.cat === cat).sort((a, b) => priceOf(b).n - priceOf(a).n || a.id - b.id)])
    .filter(([, list]) => list.length);
  return `${pageHead(lang, 'coin', t.indexH1, fill(t.indexLead, { n }))}
<div class="wrap item-page">
${groups.map(([cat, list]) => `<section class="panel"><h2>${t.cats[cat]} <small class="muted">${list.length}</small></h2><ul class="item-links">${list.map((i) => itemLink(lang, i)).join('')}</ul></section>`).join('\n')}
<p class="muted small">${t.method}</p>
</div>`;
}

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
    home: { title: t.homeTitle, desc: t.homeDesc, body: homeBody(lang), modules: ['home.js'], ld: [websiteLd, directoryLd, faqLd] },
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
    market: {
      title: MK[lang].title,
      desc: MK[lang].desc,
      body: marketBody(lang),
      modules: ['market.js'],
      ld: [appLd(MK[lang].h1, MK[lang].desc, '/tools/market/'), breadcrumbLd(lang, MK[lang].h1, '/tools/market/')]
    },
    damage: {
      title: DMG[lang].title,
      desc: DMG[lang].desc,
      body: damageBody(lang),
      modules: ['damage.js'],
      ld: [appLd(DMG[lang].h1, DMG[lang].desc, '/tools/damage/'), breadcrumbLd(lang, DMG[lang].h1, '/tools/damage/')]
    },
    scan: {
      title: SCAN[lang].title,
      desc: SCAN[lang].lead,
      body: scanBody(lang),
      modules: ['scan.js'],
      ld: [appLd(SCAN[lang].h1, SCAN[lang].lead, '/tools/scan/'), breadcrumbLd(lang, SCAN[lang].h1, '/tools/scan/')]
    },
    price: {
      title: PR[lang].title,
      desc: PR[lang].desc,
      body: priceBody(lang),
      scripts: ['price.js'],
      ld: [appLd(PR[lang].h1, PR[lang].desc, '/tools/price/'), breadcrumbLd(lang, PR[lang].h1, '/tools/price/')]
    },
    about: { title: t.aboutTitle, desc: t.aboutDesc, body: prose(t.aboutH1, t.aboutBody), ld: [breadcrumbLd(lang, t.aboutH1, '/about/')] },
    privacy: { title: t.privacyTitle, desc: t.privacyDesc, body: prose(t.privacyH1, t.privacyBody) },
    terms: { title: t.termsTitle, desc: t.termsDesc, body: prose(t.termsH1, t.termsBody) }
  };

  const bandDef = (band) => {
    const spots = bandSpots(band);
    const vars = { a: band[0], b: band[1], n: spots.length, maps: spots.slice(0, 3).map((s) => s.map).join(', ') };
    const h1 = fill(t.trBandH1, vars);
    return {
      title: fill(t.trBandTitle, vars),
      desc: fill(t.trBandDesc, vars),
      body: trainingBandBody(lang, band),
      ld: [breadcrumbLd(lang, h1, bandPath(band))]
    };
  };

  for (const p of PAGES) {
    const def = p.band ? bandDef(p.band) : defs[p.key];
    write(path.join(lang, p.path, 'index.html'), page({ lang, pageKey: p.key, pagePath: p.path, ...def }));
  }

  const langGuides = guides.filter((g) => g.lang === lang);
  if (langGuides.length) {
    write(
      path.join(lang, 'guides', 'index.html'),
      page({
        lang,
        pageKey: 'guides',
        pagePath: '/guides/',
        only: lang,
        title: '글클메 가이드 모음 | GMS Hub',
        desc: '글로벌 클래식 메이플 입문과 공략을 출처와 함께 정리한 GMS Hub 가이드 모음.',
        body: guidesIndexBody(lang),
        ld: [breadcrumbLd(lang, t.navGuides, '/guides/')]
      })
    );
  }
  for (const g of langGuides) {
    const articleLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: g.h1,
      description: g.desc,
      inLanguage: lang,
      datePublished: g.published,
      dateModified: g.updated,
      author: { '@type': 'Organization', name: config.siteName, url: absUrl(langPath(lang, '/about/')) },
      mainEntityOfPage: absUrl(langPath(lang, guidePath(g))),
      about: { '@type': 'VideoGame', name: 'MapleStory Classic World' }
    };
    write(
      path.join(lang, 'guides', g.slug, 'index.html'),
      page({
        lang,
        pageKey: 'guide',
        pagePath: guidePath(g),
        only: lang,
        title: `${g.title} | GMS Hub`,
        desc: g.desc,
        body: guideBody(g),
        ld: [articleLd, breadcrumbLd(lang, g.h1, guidePath(g))]
      })
    );
  }

  const it = IT[lang];
  write(
    path.join(lang, 'items', 'index.html'),
    page({
      lang,
      pageKey: 'items',
      pagePath: '/items/',
      title: fill(it.indexTitle, { n: PRICED.length }),
      desc: fill(it.indexDesc, { n: PRICED.length }),
      body: itemsIndexBody(lang),
      ld: [breadcrumbLd(lang, it.indexH1, '/items/')]
    })
  );
  for (const i of itemsData.items) {
    const name = itemName(lang, i);
    write(
      path.join(lang, itemPath(i), 'index.html'),
      page({
        lang,
        pageKey: 'item',
        pagePath: itemPath(i),
        title: fill(it.title, { name }),
        desc: itemDesc(lang, i),
        body: itemBody(lang, i),
        modules: ['item.js'],
        noindex: !priceOf(i),
        ld: [breadcrumbLd(lang, fill(it.h1, { name }), itemPath(i))]
      })
    );
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
).concat(
  [...new Set(guides.map((g) => g.lang))].map((l) => `<url><loc>${absUrl(langPath(l, '/guides/'))}</loc><lastmod>${BUILD_DATE}</lastmod></url>`),
  guides.map((g) => `<url><loc>${absUrl(langPath(g.lang, guidePath(g)))}</loc><lastmod>${g.updated}</lastmod></url>`),
  // Only items with a recent price are indexable, so only those go in the sitemap.
  [{ path: '/items/' }, ...PRICED.map((i) => ({ path: itemPath(i) }))].flatMap((p) =>
    LANGS.map(
      (lang) => `<url><loc>${absUrl(langPath(lang, p.path))}</loc><lastmod>${PRICES_DATE}</lastmod>${LANGS.map(
        (l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${absUrl(langPath(l, p.path))}"/>`
      ).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, p.path))}"/></url>`
    )
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
// IndexNow key file: proves ownership when scripts/indexnow.mjs pings Bing, Naver and Yandex.
if (config.indexNowKey) write(`${config.indexNowKey}.txt`, config.indexNowKey);

// Every directory site gets a zero-count row; the worker only accepts votes for seeded ids.
const seed = sites.categories
  .flatMap((c) => c.sites)
  .map((s) => `INSERT OR IGNORE INTO votes (site, count) VALUES ('${siteId(s.url)}', 0);`)
  .join('\n');
fs.writeFileSync(path.join(root, 'worker', 'seed.sql'), `${seed}\n`);

fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
for (const name of moduleFiles) {
  const source = fs.readFileSync(path.join(root, 'assets', name), 'utf8');
  write(`assets/${name}`, source.replace(/(from\s+['"])(\.\.?\/[^'"?]+\.js)(['"])/g, `$1$2?v=${moduleVersion}$3`));
}
// Compact item index for the price search: [id, korean, english, category, subcategory, level].
write('assets/shop-glyphs.json', fs.readFileSync(path.join(root, 'data/shop-glyphs.json')));
// Hits-to-kill calculator data: [id, ko, en, level, hp, wdef, mdef, eva, elements, undead, boss, mp] and weapons [id, ko, en, type, level, watk, matk].
write('assets/mobs.json', JSON.stringify(readJson('data/mobs.json').mobs.map((m) => [m.id, m.ko || '', m.en, m.lv, m.hp, m.wdef, m.mdef, m.eva, m.el || '', m.undead ? 1 : 0, m.boss ? 1 : 0, m.mp])));
write('assets/weapons.json', JSON.stringify(readJson('data/weapons.json').weapons.map((w) => [w.id, w.ko || '', w.en, w.type, w.lv, w.watk || 0, w.matk || 0])));
write('assets/items.json', JSON.stringify(itemsData.items.map((i) => [i.id, i.ko || '', i.en, i.cat, i.sub, i.lv || 0])));

console.log(`Built ${PAGES.length * LANGS.length} pages + ${itemsData.items.length * LANGS.length} item pages (${PRICED.length} priced), ${SITE_COUNT} sites into dist/ (${BUILD_DATE})`);
