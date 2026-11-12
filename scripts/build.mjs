// Static site generator for GMS Hub. No dependencies: `node scripts/build.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spriteSvg, heroScene, spritePng, spriteDataPng } from './sprites.mjs';
import { monsterIndex, monsterDetail, monsterPath, monsterName, mapPath, bossIndex } from './monster-pages.mjs';
import { collectMaps, mapDetail, mapIndex, mapName } from './map-pages.mjs';
import { collectQuests, questDetail, questIndex, questBestBody, questPath, areaName as questArea } from './quest-pages.mjs';
import { EQ_CLASSES, equipPath, collectEquipment, equipmentIndexBody, equipmentClassBody } from './equipment-pages.mjs';
import { rankBody } from './rank-page.mjs';
import { megaphoneBody } from './megaphone-page.mjs';
import { selectRoutes, routeCards, publicTrainingData, jobNames, validateTraining } from '../assets/training-evidence.js';
import { loadLocales, loadMemory, entityMatcher, localizePage, clientKeys, TX_RUNTIME } from './i18n.mjs';
import { SKILLS as DMG_SKILLS, windowRange as dmgWindow, hitRange as dmgHit, hitsToKill as dmgKill, accuracyNeeded as dmgAccNeed } from '../assets/damage-calc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const config = readJson('site.config.json');
const sites = readJson('data/sites.json');
const training = readJson('data/training.json');
const editorialEvidence = readJson('data/editorial/korean-guides.json');
validateTraining(training, editorialEvidence);
const itemsData = readJson('data/items.json');
const scrolls = readJson('data/scrolls.json');
// Korean pages use the client's own tier names (하급·중급·상급·혼돈); English keeps Lesser/Intermediate/Greater/Chaos.
const tierName = (lang, s) => (lang === 'ko' ? s.ko : s.name);
const drops = readJson('data/drops.json');
const boxes = readJson('data/boxes.json');
// Long-form articles; each body lives in data/guides/<slug>.<lang>.html and exists in one language only.
const guides = readJson('data/guides.json').guides.map((g) => ({
  ...g,
  body: fs.readFileSync(path.join(root, 'data', 'guides', `${g.slug}.${g.lang}.html`), 'utf8')
}));

const publishedGuides = guides.filter((g) => g.status === 'published');
for (const g of guides) {
  if (!['published', 'withheld'].includes(g.status)) throw new Error(`Missing editorial review: ${g.slug}`);
  if (g.status === 'published' && (!g.sources.length || !g.evidenceKind || !g.reviewed)) throw new Error(`Missing evidence: ${g.slug}`);
  if (g.evidenceKind === 'conditional-guide' && (!g.evidenceRefs?.length || g.evidenceRefs.some(id => !editorialEvidence.sources.some(s => s.id === id)))) throw new Error(`Unresolved guide evidence: ${g.slug}`);
  if (g.status === 'withheld' && !g.reviewReason) throw new Error(`Missing review reason: ${g.slug}`);
}
const LANGS = ['ko', 'en'];
// zh, ja… are not templated: each is the finished English page run through i18n/<code>.json (see scripts/i18n.mjs).
const LOCALES = loadLocales(root);
const ALL_LANGS = [...LANGS, ...LOCALES.map((l) => l.code)];
const HREFLANG = { ko: 'ko', en: 'en', ...Object.fromEntries(LOCALES.map((l) => [l.code, l.hreflang])) };
// Search Console (28 days to 2026-11-12): the machine-translated zh/ja database pages (one per item, monster, map and
// quest, about 2,600 of them) drew 2 impressions, and most sat in "crawled - currently not indexed", diluting the site.
// They stay on the site for visitors but are noindex, out of the sitemap and out of hreflang; zh/ja keep the home,
// tools, guides and list pages.
const DB_DETAIL = /^\/(items|monsters|maps|quests)\/(?!best-exp\/)[^/]+\/$/;
const indexedIn = (lang, pagePath) => LANGS.includes(lang) || !DB_DETAIL.test(pagePath || '');
const LANG_NAMES = { ko: '한국어', en: 'English', ...Object.fromEntries(LOCALES.map((l) => [l.code, l.name])) };
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const SITE_COUNT = sites.categories.reduce((n, c) => n + c.sites.length, 0);

const T = {
  ko: {
    gameName: '글로벌 메이플스토리 클래식 월드',
    gameBadge: '글로벌 메이플스토리 클래식 월드 전용',
    navLinks: '사이트 모음',
    navTraining: "사냥터 추천",
    navScroll: '주문서 계산기',
    navDrop: '확률 계산기',
    navPrice: '시세 사이트 찾기',
    navMarket: '실시간 시세',
    navAbout: '소개',
    navGuides: '가이드',
    switchLang: 'English',
    homeTitle: '글클메 허브: 사이트 모음·실시간 시세·몬스터 DB·사냥터 추천 | GMS Hub',
    homeDesc: `글로벌 메이플스토리 클래식 월드(글클메) 공식 채널, 디스코드·레딧·디시 커뮤니티, DB·위키, 자유시장 시세, 보스 타이머, 빌드 플래너 ${SITE_COUNT}곳을 용도별로 정리했어요. 직업별 조건을 정리한 사냥터 추천와 주문서 계산기도 있어요.`,
    heroKicker: '글클메 유저를 위한 길잡이',
    heroTitle: '아이템·시세·유용한 사이트, <br>한 번에 찾아보세요',
    heroSub: '아이템·몬스터부터 공략과 도구까지 한곳에서 검색하고, 필요한 사이트로 바로 이동하세요.',
    searchPlaceholder: '아이템, 몬스터, 사이트 검색',
    statSites: '수록 사이트',
    statCats: '카테고리',
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
    trCardDesc: "직업·레벨별 진입 조건, 사냥 동선과 물약 비용을 비교해요.",
    scCardDesc: 'Lesser·Intermediate·Greater·Chaos 주문서로 몇 번 붙고 터질 확률이 얼마인지 계산해요.',
    dropCardDesc: "입력한 드롭률이 일정하고 시도가 독립일 때의 획득 확률을 계산해요.",
    open: '열기',
    faqHeading: '자주 묻는 질문',
    sourcesLabel: '출처',

    trTitle: "글클메 사냥터 추천 · 직업별 동선·물약 비용 | GMS Hub",
    trDesc: "직업과 레벨에 맞는 사냥터의 진입 조건, 위치, 층별 동선, 물약 비용, 다음 이동 시점과 대체 장소를 비교하세요.",
    trH1: "사냥터 추천",
    trLead: "내 직업과 레벨에 맞춰, 무리 없이 잡히는 다음 사냥터를 찾아보세요.",
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
    trBandNav: "레벨별 사냥 동선",
    trBandTitle: "글클메 {a}~{b}레벨 사냥터 · 조건과 동선 | GMS Hub",
    trBandDesc: "{a}~{b}레벨에 비교할 사냥 경로 {n}개. 직업별 처치 타수, 물약 비용, 이동 동선과 대체 사냥터를 정리했어요.",
    trBandH1: "{a}~{b}레벨 사냥 동선",
    trBandLead: "이 구간에서 비교할 경로 {n}개예요. 같은 레벨이어도 직업과 장비에 따라 이동 시점이 달라져요.",
    trBandFinder: "내 조건으로 사냥터 찾기",
    noDate: '날짜 표기 없음',

    scTitle: '글클메 주문서 계산기 · 확률 (Lesser·Intermediate·Greater·Chaos) | GMS Hub',
    scDesc: '글로벌 메이플스토리 클래식 월드 주문서 성공률(Lesser 100%, Intermediate 60%, Greater 10%, Chaos 10%)로 성공 횟수 분포, 파괴 확률, 평균 상승치를 계산해요.',
    scH1: '주문서 계산기',
    scLead: '자료에 적힌 성공률을 입력값으로 사용한 확률 모델이에요. 현재 아이템 툴팁을 함께 확인하세요.',
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

    dropTitle: '글클메 드롭률·확률 계산기와 넥슨 공식 상자 확률 | GMS Hub',
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
    aboutBody: `<p>GMS Hub는 <strong>글로벌 메이플스토리 클래식 월드</strong>를 하는 한국어·영어 유저를 위한 <strong>비공식 팬 사이트</strong>예요. 처음에는 흩어져 있는 공략·시세·계산기 사이트를 한곳에 모으려고 시작했고, 지금은 직접 만든 도구와 가이드를 함께 운영해요.</p>
<h2>무엇이 있나요</h2>
<ul><li><strong>계산기:</strong> <a href="/ko/tools/scroll/">주문서 계산기</a>, <a href="/ko/tools/drop-rate/">확률 계산기</a>, <a href="/ko/tools/damage/">몇 방 컷 계산기</a>는 공개 데이터와 계산 모델을 사용해요. 결과는 입력값과 가정에 따른 추정치예요. 공식과 예시는 각 페이지 아래에 적어 두었어요.</li><li><strong>사냥터 추천:</strong> <a href="/ko/tools/training/">직업별 조건과 동선</a>을 정리해요. 실제 플레이와 공략을 참고하며, 레벨만으로 효율을 보장하지 않아요.</li><li><strong>실시간 시세:</strong> 유저가 상점 스캐너로 읽은 자유시장 매물을 모아 <a href="/ko/tools/market/">아이템별 시세</a>를 계산해요. 계산 방법은 시세 페이지 아래에 있어요.</li><li><strong>가이드:</strong> 육성, 전직, 파티 퀘스트, 주문서, 거래를 다룬 <a href="/ko/guides/">한국어 가이드</a>를 직접 써요.</li><li><strong>사이트 모음:</strong> 클래식 월드 관련 사이트를 용도별로 정리해요.</li></ul>
<h2>원칙</h2>
<ul><li><strong>자료의 성격과 한계를 구분해요.</strong> 플레이 기록과 공략을 검토하고 장비·파티 조건을 붙여 재구성해요. 모든 조건에서 같은 결과를 재현한 실험은 아니에요.</li><li>자료가 충돌하면 조건과 정정 내용을 확인하고, 불확실한 수익과 고정 순위는 안내에서 제외해요.</li><li>현금 거래 사이트는 올리지 않아요.</li></ul>
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
    navLinks: 'Home',
    navTraining: "Training routes",
    navScroll: 'Scroll Calculator',
    navDrop: 'Odds Calculator',
    navPrice: 'Find on price sites',
    navMarket: 'Live Market',
    navAbout: 'About',
    navGuides: 'Guides',
    switchLang: '한국어',
    homeTitle: 'GMS Hub: MapleStory Classic World (MSCW) Drops, Live Prices & Training Spots',
    homeDesc: `MapleStory Classic World database and tools: who drops what, live Free Market prices, training spots for your class and level, quests, maps and bosses. Training routes come from Korean and English player guides. Plus ${SITE_COUNT} useful MSCW sites in one list.`,
    heroKicker: 'MapleStory Classic World database',
    heroTitle: 'Who drops it, what it sells for, <br>where to train',
    heroSub: 'Search any item or monster for drops and live prices, or pick your class and level to see where to train.',
    searchPlaceholder: 'Search items, monsters and sites',
    statSites: 'Sites',
    statCats: 'Categories',
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
    toolsHeading: 'Database and tools',
    trCardDesc: "Compare class routes, entry conditions, rotations and supply costs.",
    scCardDesc: 'See how many Lesser, Intermediate, Greater or Chaos scrolls pass and how likely a boom is.',
    dropCardDesc: "Calculate odds assuming the supplied drop rate stays constant across independent attempts.",
    open: 'Open',
    faqHeading: 'FAQ',
    sourcesLabel: 'Sources',

    trTitle: "Classic World Training Routes: Conditions and Supply Costs | GMS Hub",
    trDesc: "Conditional class routes with entry requirements, rotations, supply costs and alternatives.",
    trH1: "Training Routes",
    trLead: "Find a manageable next route for your class, equipment and level.",
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
    trBandNav: "Routes by level",
    trBandTitle: "Classic World Level {a}–{b} Training Routes | GMS Hub",
    trBandDesc: "Compare {n} conditional routes across levels {a}–{b}, with entry requirements and supply costs.",
    trBandH1: "Level {a}–{b} Training Routes",
    trBandLead: "Compare {n} routes in this band. Read class, gear and supply requirements before moving.",
    trBandFinder: "Find routes for your setup",
    noDate: 'undated',

    scTitle: 'Global MapleStory Classic World Scroll Calculator: Lesser, Intermediate, Greater & Chaos Odds | GMS Hub',
    scDesc: 'Classic World scroll odds (Lesser 100%, Intermediate 60%, Greater 10%, Chaos 10%): pass distribution, boom chance and expected stat gain.',
    scH1: 'Scroll Calculator',
    scLead: 'A probability model using sourced preset rates. Compare inputs with the current item tooltip.',
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

    dropTitle: 'MapleStory Classic World Drop Rates: Odds Calculator, Box Rates & Monster Drops | GMS Hub',
    dropDesc: 'How many kills or opens does a 1% drop take in MapleStory Classic World? Odds calculator, Nexon\'s official box rates, and which monsters drop each item.',
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
    aboutBody: `<p>GMS Hub is an <strong>unofficial fan site</strong> for English- and Korean-speaking <strong>Global MapleStory Classic World</strong> players. It started as one place to find the scattered guide, price and calculator sites, and now also runs its own tools and guides.</p>
<h2>What's here</h2>
<ul><li><strong>Calculators:</strong> the <a href="/en/tools/scroll/">scroll calculator</a>, <a href="/en/tools/drop-rate/">odds calculator</a> and <a href="/en/tools/damage/">hits-to-kill calculator</a> use public data and mathematical models, with results conditional on their inputs and assumptions. Each page explains its formulas with a worked example.</li><li><strong>Training routes:</strong> <a href="/en/tools/training/">class-specific entry conditions, rotations and costs</a>, without theoretical EXP rankings.</li><li><strong>Live prices:</strong> Free Market listings that players read with the shop scanner, turned into <a href="/en/tools/market/">per-item prices</a>. The method is described under the market page.</li><li><strong>Guides:</strong> Detailed Korean and English progression, quest and tool guides.</li><li><strong>Site directory:</strong> Classic World sites grouped by purpose.</li></ul>
<h2>Principles</h2>
<ul><li><strong>Evidence has limits.</strong> We synthesize gameplay and guides with explicit gear and party conditions; these are not controlled benchmarks for every setup.</li><li>We check corrections and conflicting conditions instead of promising fixed profit or rankings.</li><li>We never list real-money trading sites.</li></ul>
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
  { key: 'marketToday', path: '/tools/market/today/' },
  { key: 'market', path: '/tools/market/' },
  { key: 'damage', path: '/tools/damage/' },
  { key: 'about', path: '/about/' },
  { key: 'privacy', path: '/privacy/' },
  { key: 'terms', path: '/terms/' },
  { key: 'contact', path: '/contact/' }
];

// Shared reviewed snapshot keeps home search, calculator and detail pages consistent.
const MONSTERS = readJson('data/monsters.json');
const MOBS = MONSTERS.monsters.map(m => ({ ...m, status: m.status === 'active' ? undefined : m.status }));
// Player-sourced hunting notes per monster; evidence ids resolve in data/editorial/korean-guides.json and never reach HTML.
const MONSTER_NOTES = readJson('data/monster-notes.json');
const MOB_BY_ID = new Map(MONSTERS.monsters.map((m) => [m.id, m]));
for (const [id, n] of Object.entries(MONSTER_NOTES.notes)) {
  const m = MOB_BY_ID.get(Number(id));
  if (!m) throw new Error(`Hunting note for unknown monster ${id}`);
  for (const e of n.evidence || []) if (!editorialEvidence.sources.some((s) => s.id === e)) throw new Error(`Unresolved note source ${e} (${id})`);
  for (const d of n.drops || []) if (!m.drops.some((x) => x.itemId === d)) throw new Error(`Note names a drop ${d} not reported for ${m.en}`);
}
// Rank of EXP per HP among monsters that can be hunted now.
const RATIO_RANK = (() => {
  const live = MONSTERS.monsters.filter((m) => m.status === 'active' && !m.boss).sort((a, b) => b.exp / b.hp - a.exp / a.hp || a.id - b.id);
  return new Map(live.map((m, i) => [m.id, { rank: i + 1, total: live.length }]));
})();
// Training routes carry their monsters (name, HP, accuracy for a sure hit at the route's first level) into the page data.
validateTraining(training, editorialEvidence, MONSTERS.monsters);
for (const r of training.routes) r.mobs = r.mobIds.map((id) => { const m = MOB_BY_ID.get(id); return { id, ko: m.ko || m.en, en: m.en, lv: m.lv, hp: m.hp, acc: dmgAccNeed(r.level.min, m) }; });
// Which monsters drop an item, for the item pages.
const MAPS = collectMaps(MONSTERS.monsters);
const QUEST_RAW = readJson('data/quests-raw.json');
const QUESTS = collectQuests(QUEST_RAW, { buildDate: BUILD_DATE });
const DROP_INDEX = new Map();
for (const m of MONSTERS.monsters) for (const d of m.drops) (DROP_INDEX.get(d.itemId) || DROP_INDEX.set(d.itemId, []).get(d.itemId)).push({ m, confidence: d.confidence });
// Retain level-band URLs with conditional routes and detailed entry requirements.
const TR_BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, 80]];
const TR_MAX = TR_BANDS.at(-1)[1];
const bandPath = ([a, b]) => `/tools/training/level-${a}-${b}/`;
PAGES.push(...TR_BANDS.map((band) => ({ key: 'trBand', path: bandPath(band), band })));
// One page per class: players search "글클메 썬콜 사냥터", "글클메 궁수 사냥터" far more often than by level band.
// Subclasses that share every route with their family (Fighter, Page, Spearman) point to the family page instead.
const TR_CLASSES = [
  { job: 'warrior', slug: 'warrior', ko: '전사', en: 'Warrior', guide: 'warrior-build' },
  { job: 'fighter', slug: 'fighter', ko: '파이터', en: 'Fighter', guide: 'fighter' },
  { job: 'page', slug: 'page', ko: '페이지', en: 'Page', guide: 'page' },
  { job: 'spear', slug: 'spearman', ko: '스피어맨', en: 'Spearman', guide: 'spearman' },
  { job: 'archer', slug: 'bowman', ko: '궁수', en: 'Bowman', guide: 'archer-build' },
  { job: 'hunter', slug: 'hunter', ko: '헌터', en: 'Hunter', guide: 'hunter' },
  { job: 'crossbow', slug: 'crossbowman', ko: '사수', en: 'Crossbowman', guide: 'crossbowman' },
  { job: 'mage', slug: 'magician', ko: '마법사', en: 'Magician', guide: 'mage-build' },
  { job: 'fire', slug: 'fire-poison', ko: '불독', en: 'Fire/Poison Wizard', guide: 'fire-poison' },
  { job: 'ice', slug: 'ice-lightning', ko: '썬콜', en: 'Ice/Lightning Wizard', guide: 'ice-lightning' },
  { job: 'cleric', slug: 'cleric', ko: '클레릭', en: 'Cleric', guide: 'cleric' },
  { job: 'thief', slug: 'thief', ko: '도적', en: 'Thief', guide: 'thief-build' },
  { job: 'assassin', slug: 'assassin', ko: '어쌔신(표도)', en: 'Assassin', guide: 'assassin' },
  { job: 'bandit', slug: 'bandit', ko: '시프(단도)', en: 'Bandit', guide: 'bandit' }
];
const classPath = (c) => `/tools/training/class/${c.slug}/`;
PAGES.push(...TR_CLASSES.map((cls) => ({ key: 'trClass', path: classPath(cls), cls })));

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
    ? ALL_LANGS.filter((l) => indexedIn(l, pagePath)).map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${absUrl(langPath(l, pagePath))}">`).join('\n') +
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
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());
// Operator, local and automated visits are tagged internal (GA4 "Internal traffic" filter): localhost, or any browser that once opened ?internal=1.
var gmsInternal=/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname);try{if(/[?&]internal=1(&|$)/.test(location.search))localStorage.setItem('gmshub_internal','1');gmsInternal=gmsInternal||localStorage.getItem('gmshub_internal')==='1'}catch(e){}
gtag('config','${esc(config.gaMeasurementId)}',gmsInternal?{traffic_type:'internal'}:{});</script>`
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
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#f6f1e7">
<script>${THEME_BOOT}</script>
<script>${TX_RUNTIME}</script>
${verify}
${naverVerify}
<link rel="icon" href="${href('/assets/favicon.svg')}" type="image/svg+xml">
<link rel="manifest" href="${href('/manifest.webmanifest')}">
<link rel="apple-touch-icon" href="${href('/assets/icon-180.png')}">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="preconnect" href="${esc(config.voteApi)}" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="${scriptSrc('style.css')}">
<style>${CHARM_VARS}</style>
${adsense}
${ga}
${clarity}
${cfBeacon}
${ld.map(ldScript).join('\n')}
</head>`;
}

// Day or night before the first paint: a saved choice wins, otherwise the system setting. No script, no theme: day.
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('gms-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;if(localStorage.getItem('gms-charm')==='off')document.documentElement.dataset.charm='off';var m=document.querySelector('meta[name=theme-color]');if(m)m.content=t==='dark'?'#0f1420':'#f6f1e7';}catch(e){}})();`;
const THEME_ICON = `<svg class="theme-icon" viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true"><g class="sun"><rect x="6" y="6" width="4" height="4"/><rect x="7" y="1" width="2" height="3"/><rect x="7" y="12" width="2" height="3"/><rect x="1" y="7" width="3" height="2"/><rect x="12" y="7" width="3" height="2"/><rect x="3" y="3" width="2" height="2"/><rect x="11" y="3" width="2" height="2"/><rect x="3" y="11" width="2" height="2"/><rect x="11" y="11" width="2" height="2"/></g><g class="moon"><rect x="6" y="2" width="5" height="2"/><rect x="4" y="4" width="3" height="2"/><rect x="3" y="6" width="3" height="4"/><rect x="4" y="10" width="3" height="2"/><rect x="6" y="12" width="5" height="2"/><rect x="11" y="10" width="2" height="2"/></g></svg>`;

// Our own pixel art for the small touches (assets/common.js, style.css "Charm"): cursors and the maple leaf.
const CHARM_VARS = `:root{--cur:url("${spriteDataPng('cursor', 2)}") 1 1,auto;--cur-on:url("${spriteDataPng('cursorOn', 2)}") 1 1,pointer;--leaf:url("${spriteDataPng('leaf', 2)}")}`;

function header(lang, pagePath, only) {
  const t = T[lang];
  const tabs = [
    ['/', 'book', t.navLinks],
    ['/monsters/', 'slime', lang === 'ko' ? '몬스터 도감' : 'Monsters'],
    ['/tools/training/', 'sword', t.navTraining],
    ['/tools/scroll/', 'scroll', t.navScroll],
    ['/tools/drop-rate/', 'bag', t.navDrop],
    ['/tools/damage/', 'hammer', DMG[lang].h1],
    ['/tools/market/', 'coin', t.navMarket],
    ['/megaphone/', 'megaphone', lang === 'ko' ? '실시간 확성기' : 'Megaphones']
  ];
  // Seven tabs share a phone's width, so English labels that would break mid-word ("Calcul/ator") get a one-word form there.
  // The newest tab carries a small N so returning visitors notice it.
  const NEW_TAB = '/megaphone/';
  const SHORT_EN = { '/': 'Home', '/monsters/': 'Mobs', '/tools/training/': 'Spots', '/tools/scroll/': 'Scrolls', '/tools/drop-rate/': 'Odds', '/tools/damage/': 'Hits', '/tools/market/': 'Market', '/megaphone/': 'Megas' };
  const tabHtml = tabs
    .map(
      ([p, icon, label]) =>
        `<a class="tab" href="${href(langPath(lang, p))}"${(p === pagePath || (p !== '/' && pagePath?.startsWith(p))) ? ' aria-current="page"' : ''}${lang === 'ko' ? '' : ` title="${esc(label)}"`}>${p === NEW_TAB ? `<span class="tab-ico">${spriteSvg(icon, 20)}<span class="tab-new" title="${lang === 'ko' ? '새 기능' : 'New'}">N</span></span>` : spriteSvg(icon, 20)}${lang === 'ko' ? `<span>${label}</span>` : `<span class="tab-full">${label}</span><span class="tab-short" aria-hidden="true">${SHORT_EN[p]}</span>`}</a>`
    )
    .join('');
  return `${pagePath === '/megaphone/' ? '' : megaTicker(lang)}<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${href(langPath(lang, '/'))}">${spriteSvg('mushroom', 34)}<span><strong>GMS Hub</strong><small>${esc(t.gameName)}</small></span></a>
<nav class="tabs" aria-label="${esc(t.navLinks)}">${tabHtml}</nav>
${presencePill(lang)}
${headerSearch(lang, tabs)}
<button type="button" class="theme-toggle" data-theme-toggle>${THEME_ICON}<span class="sr-only">${lang === 'ko' ? '낮과 밤 화면 바꾸기' : 'Switch day or night theme'}</span></button>
<details class="lang-menu"><summary class="lang-current" aria-label="Language"><span class="lang-full" translate="no">${LANG_NAMES[lang]}</span><span class="lang-code" translate="no" aria-hidden="true">${lang.toUpperCase()}</span></summary><div class="lang-list">${(only ? [lang, ...ALL_LANGS.filter((l) => l !== lang)] : ALL_LANGS).map((l) => `<a class="lang-opt" href="${href(langPath(l, only && l !== lang ? '/' : pagePath || '/'))}" data-lang="${l}" hreflang="${HREFLANG[l]}" lang="${HREFLANG[l]}"${l === lang ? ' aria-current="true"' : ''}>${LANG_NAMES[l]}</a>`).join('')}</div></details>
${moreMenu(lang)}
</div></header>`;
}

// Search from every page (assets/header-search.js): items open their market panel, monsters their page, and the site's
// own pages by name. The indexes load on first use, so pages that never search pay nothing.
function headerSearch(lang, tabs) {
  const ko = lang === 'ko';
  const pages = [...tabs.map(([p, , label]) => [label, href(langPath(lang, p))]),
    ...publishedGuides.filter((g) => g.lang === lang || (!LANGS.includes(lang) && g.lang === 'en')).map((g) => [g.h1 || g.title, href(langPath(lang, guidePath(g)))]),
    [ko ? '오늘의 시세 리포트' : "Today's price report", href(langPath(lang, '/tools/market/today/'))], [ko ? '상점 스캔' : 'Shop scan', href(langPath(lang, '/tools/scan/'))],
    [ko ? '캐릭터 랭킹' : 'Character ranking', href(langPath(lang, '/rank/'))],
    [ko ? '직업별 장비' : 'Gear by class', href(langPath(lang, '/equipment/'))], [ko ? '보스' : 'Bosses', href(langPath(lang, '/bosses/'))],
    [ko ? '경험치 많이 주는 퀘스트' : 'Best EXP quests', href(langPath(lang, '/quests/best-exp/'))], [ko ? '맵 도감' : 'Maps', href(langPath(lang, '/maps/'))],
    [ko ? '문의·협찬·후원' : 'Contact and support', href(langPath(lang, '/contact/'))]];
  return `<button type="button" class="hs-open" data-hs data-items="${esc(href('/assets/items.json'))}" data-mobs="${esc(href('/assets/mobs.json'))}" data-market="${esc(href(langPath(lang, '/tools/market/')))}" data-monsters="${esc(href(langPath(lang, '/monsters/')))}" data-pages="${esc(JSON.stringify(pages))}" aria-label="${ko ? '검색' : 'Search'}" title="${ko ? '검색 ( / )' : 'Search ( / )'}"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="hs-label">${ko ? '검색' : 'Search'}</span></button>`;
}

// Pages that do not fit the eight tabs (guides, ranking, gear, bosses, databases, shop tools) open from one menu at the end
// of the header, so none of them is reachable only from the home page or the footer.
function moreMenu(lang) {
  const ko = lang === 'ko';
  const links = [
    guides.some((g) => g.lang === lang) && ['/guides/', ko ? '가이드' : 'Guides'],
    ['/rank/', ko ? '캐릭터 랭킹' : 'Character ranking'],
    ['/equipment/', ko ? '직업별 장비' : 'Gear by class'],
    ['/bosses/', ko ? '보스' : 'Bosses'],
    ['/quests/best-exp/', ko ? '경험치 많이 주는 퀘스트' : 'Best EXP quests'],
    ['/items/', ko ? '아이템 도감' : 'Item database'],
    ['/maps/', ko ? '맵 도감' : 'Map database'],
    ['/tools/scan/', ko ? '상점 스캔으로 올리기' : 'Upload a shop scan'],
    ['/about/', ko ? '사이트 소개' : 'About'],
    ['/contact/', ko ? '문의·협찬·후원' : 'Contact and support']
  ].filter(Boolean);
  const label = ko ? '더보기' : 'More';
  return `<details class="more-menu"><summary class="more-btn" aria-label="${label}"><span class="more-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="more-label">${label}</span></summary><div class="more-list">${links.map(([p, name]) => `<a class="lang-opt" href="${href(langPath(lang, p))}">${name}</a>`).join('')}<button type="button" class="lang-opt more-theme" data-theme-toggle>${ko ? '낮·밤 화면 바꾸기' : 'Switch day or night theme'}</button><button type="button" class="lang-opt more-charm" data-charm-toggle><span class="charm-on-label">${ko ? '낙엽·움직이는 효과 끄기' : 'Turn off falling leaves and effects'}</span><span class="charm-off-label">${ko ? '낙엽·움직이는 효과 켜기' : 'Turn on falling leaves and effects'}</span></button></div></details>`;
}

// A strip above the header that scrolls the latest game megaphones (assets/common.js fills it from /megaphones); each one
// opens the megaphone page focused on it (?m=<id>). Its height
// is reserved from the start so nothing below moves when the messages arrive.
function megaTicker(lang) {
  const ko = lang === 'ko';
  const url = href(langPath(lang, '/megaphone/'));
  return `<div class="mg-ticker" data-href="${url}" data-lang="${lang}"><a class="mg-tk-label" href="${url}">${spriteSvg('megaphone', 18)}${ko ? '실시간 고확' : 'Live megaphones'}</a><div class="mg-tk-track" aria-label="${ko ? '최근 게임 확성기' : 'Latest game megaphones'}"><div class="mg-tk-run"></div></div><template class="mg-tk-icon">${spriteSvg('megaphone', 14)}</template></div>`;
}

// Live viewer count (assets/common.js fills it from the worker's presence room). Hidden until someone else is on the site,
// and it only ever shows the real number of open pages.
function presencePill(lang) {
  return lang === 'ko'
    ? '<p class="presence" hidden><i class="pr-dot" aria-hidden="true"></i><span class="pr-live" translate="no">LIVE</span><b data-site>0</b>명<span class="pr-label"> 접속 중</span></p>'
    : '<p class="presence" hidden><i class="pr-dot" aria-hidden="true"></i><span class="pr-live" translate="no">LIVE</span><b data-site>0</b> <span class="pr-label">online</span></p>';
}

function footer(lang) {
  const t = T[lang];
  return `<footer class="site-footer"><div class="charm-walk" aria-hidden="true"><span class="walker w1">${spriteSvg('mushroom', 30)}</span><span class="walker w2">${spriteSvg('slime', 26)}</span></div><div class="wrap">
<div class="footer-brand">${spriteSvg('mushroom', 24)}<strong>GMS Hub</strong></div>
<p>${esc(t.footerDisclaimer)}</p>
<p><button type="button" class="charm-toggle" data-charm-toggle><span class="charm-on-label">${lang === 'ko' ? '움직이는 효과 끄기' : 'Turn off animations'}</span><span class="charm-off-label">${lang === 'ko' ? '움직이는 효과 켜기' : 'Turn on animations'}</span></button></p>
<p>${guides.some((g) => g.lang === lang) ? `<a href="${href(langPath(lang, '/guides/'))}">${t.navGuides}</a> · ` : ''}<a href="${href(langPath(lang, '/about/'))}">${t.navAbout}</a> · <a href="${href(langPath(lang, '/privacy/'))}">${t.privacy}</a> · <a href="${href(langPath(lang, '/terms/'))}">${t.terms}</a> · <a href="${href(langPath(lang, '/contact/'))}">${lang === 'ko' ? '문의·협찬·후원' : 'Contact and support'}</a> · <a href="${issuesUrl}" target="_blank" rel="noopener">GitHub</a>${config.support?.kofi ? ` · <a href="${esc(config.support.kofi)}" target="_blank" rel="noopener" data-support="kofi">${lang === 'ko' ? '커피 한 잔 사 주기' : 'Buy me a coffee'}</a>` : ''}</p>
</div></footer>`;
}

const ADFIT_PAGES = new Set(['home', 'marketToday', 'training', 'trBand', 'trClass', 'scroll', 'drop', 'price', 'scan', 'market', 'damage', 'guides', 'guide', 'monsters', 'monster', 'items', 'item',
  'bosses', 'maps', 'map', 'quests', 'quest', 'questBest', 'equipment', 'equipmentClass', 'rank', 'megaphone']);
// AdFit counted only 5-9% of the end-of-page banner as viewed (most visitors never scroll that far), so a second slot sits
// just under the page title: after the page head, after the home hero, or after a guide's first paragraph. Never beside
// a form control or a button row.
const AD_TOP = '<!--ad-top-->';
function withTopAd(body, ads) {
  let out = body.includes(AD_TOP) ? body : body.replace(/(<section class="(?:wrap )?(?:mb-)?page-head[\s\S]*?<\/section>)/, `$1${AD_TOP}`);
  out = out.replace(AD_TOP, ads ? adfitSlot('top') : '');
  return out.split(AD_TOP).join('');
}
function page({ lang, pageKey, pagePath, title, desc, body, scripts = [], modules = [], ld = [], only, noindex }) {
  const ads = ADFIT_PAGES.has(pageKey) && !noindex && Object.values(config.adfit || {}).some(Boolean);
  return `${head({ lang, title, desc, pagePath, ld, only, noindex })}
<body data-page="${pageKey}" data-price-api="${esc(config.voteApi)}" data-tips="${esc(href('/assets/item-tips.json'))}" data-sprites="${esc(href('/assets/monsters/'))}">
${header(lang, pagePath, only)}
<main>${ads && pageKey !== 'home' ? adfitRails() : ''}${withTopAd(body, ads)}${ads ? adfitSlot() : ''}</main>
${footer(lang)}
<script src="${href('/assets/common.js')}" defer></script>
<script type="module" src="${href(`/assets/header-search.js?v=${moduleVersion}`)}"></script>
${ads ? `<script src="${scriptSrc('adfit.js')}" defer></script>` : ''}
${scripts.map((s) => `<script src="${scriptSrc(s)}" defer></script>`).join('\n')}
${modules.map((s) => `<script type="module" src="${href(`/assets/${s}?v=${moduleVersion}`)}"></script>`).join('\n')}
<script type="module" src="${href(`/assets/item-tip.js?v=${moduleVersion}`)}"></script>
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

// ---------- daily market report ----------
// /tools/market/today/: rebuilt every night from data/market-report.json (scripts/fetch-market-report.mjs), so search
// engines find a fresh "today's prices" page without anyone writing it. Only measured numbers: listing counts, asking
// medians and lows from scanned shops, and how often an item was named in the latest megaphones.
const MARKET_REPORT = fs.existsSync(path.join(root, 'data/market-report.json')) ? readJson('data/market-report.json') : null;
function marketTodayBody(lang) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const R = MARKET_REPORT;
  const byId = new Map(itemsData.items.map((i) => [i.id, i]));
  const byEn = new Map(itemsData.items.map((i) => [i.en.toLowerCase(), i]));
  const name = (i) => (ko && i.ko ? i.ko : i.en);
  const nf = (n) => Number(n).toLocaleString(ko ? 'ko' : 'en-US');
  // Amounts and the date are kept out of translation (translate="no") so the zh/ja translation memory keys stay the same
  // every day.
  const mesos = (n) => `<span translate="no">${ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf(n)) : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : nf(n)}</span>`;
  const market = href(langPath(lang, '/tools/market/'));
  const icon = (id) => `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" width="28" height="28" alt="" loading="lazy">`;
  const link = (i) => `<a class="mt-item" href="${market}?item=${i.id}">${icon(i.id)}<span>${esc(name(i))}</span></a>`;
  const day = (R?.updated || BUILD_DATE).slice(0, 10);
  const dayText = ko ? new Date(`${day}T12:00:00Z`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : day;
  if (!R) return `${pageHead(lang, 'coin', tr('오늘의 글클메 시세', "Today's MapleStory Classic prices"), tr('시세 리포트를 준비하고 있어요.', 'The report is being prepared.'))}`;
  const listed = R.listed.map((r) => ({ ...r, i: byId.get(r.item) })).filter((r) => r.i);
  const said = Object.entries(R.said || {}).map(([k, n]) => ({ i: byEn.get(k), n })).filter((r) => r.i && !/megaphone/i.test(r.i.en)).sort((a, b) => b.n - a.n).slice(0, 12);
  const median = new Map(R.listed.map((r) => [r.item, r.median]));
  const movers = (R.movers || []).filter((r) => Math.abs(r.change) >= 3 && byId.has(r.item));
  const stats = R.stats || {};
  return `${pageHead(lang, 'coin', `${tr('오늘의 글클메 시세', "Today's MapleStory Classic prices")} <small class="mt-date" translate="no">${esc(dayText)}</small>`, tr('자유시장에서 지금 가장 많이 팔리는 아이템과 최근 고확에 자주 나온 아이템을 매일 정리해요. 모든 숫자는 플레이어 상점 스캔과 게임 확성기에서 모은 실제 기록이에요.', 'Every day: the most listed items in the Free Market and the items named most in recent megaphones. Every number comes from scanned player shops and in-game megaphones.'))}
<div class="wrap market-today">
<dl class="mt-stats">${[[tr('판매 중 매물', 'Open listings'), stats.listings], [tr('아이템 종류', 'Items'), stats.items], [tr('상점', 'Shops'), stats.shops]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${nf(v)}</dd></div>`).join('')}</dl>
<section class="panel"><h2>${tr('매물이 가장 많은 아이템', 'Most listed items')}</h2>
<div class="table-wrap"><table class="data mt-table"><thead><tr><th scope="col">#</th><th scope="col">${tr('아이템', 'Item')}</th><th scope="col">${tr('판매가 중앙값', 'Asking median')}</th><th scope="col">${tr('최저가', 'Lowest')}</th><th scope="col">${tr('매물', 'Listings')}</th></tr></thead><tbody>
${listed.map((r, n) => `<tr><td>${n + 1}</td><th scope="row">${link(r.i)}</th><td class="num">${mesos(r.median)}</td><td class="num">${r.low ? mesos(r.low) : '—'}</td><td class="num">${nf(r.open)}</td></tr>`).join('')}
</tbody></table></div></section>
${said.length ? `<section class="panel"><h2>${tr('최근 고확에 많이 나온 아이템', 'Most named in recent megaphones')}</h2>
<ul class="mt-said">${said.map((r) => `<li>${link(r.i)}<small>${tr(`고확 ${r.n}번`, `${r.n} megaphones`)}${median.has(r.i.id) ? ` · ${tr('시세', 'market')} ${mesos(median.get(r.i.id))}` : ''}</small></li>`).join('')}</ul>
<p class="muted small">${tr('최근 고확 200개 기준이에요.', 'Based on the latest 200 megaphones.')} <a href="${href(langPath(lang, '/megaphone/'))}">${tr('실시간 확성기 보기', 'Open live megaphones')}</a></p></section>` : ''}
${movers.length ? `<section class="panel"><h2>${tr('일주일 사이 크게 움직인 아이템', 'Biggest moves this week')}</h2><ul class="mt-said">${movers.map((r) => `<li>${link(byId.get(r.item))}<small>${r.change > 0 ? '+' : ''}${r.change}% · ${mesos(r.median)}</small></li>`).join('')}</ul></section>` : ''}
<p class="mt-more"><a class="btn" href="${market}">${tr('실시간 시세에서 검색하기', 'Search live prices')}</a> <a class="btn ghost" href="${href(langPath(lang, '/tools/scan/'))}">${tr('내 상점 올리고 시세 보태기', 'Add your shop to the prices')}</a></p>
<p class="muted small">${tr(`이 페이지는 매일 자정(한국 시간) 무렵 자동으로 새로 만들어져요. 마지막 갱신: ${esc(dayText)}.`, `This page is rebuilt automatically around midnight Korea time. Last updated: <span translate="no">${esc(dayText)}</span>.`)}</p>
</div>`;
}

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
  const search = `${s.name} ${s.nameEn || ''} ${host(s.url)} ${s.desc.ko} ${s.desc.en} ${s.features.ko.join(' ')} ${s.features.en.join(' ')}`.toLowerCase();
  return `<article class="site-card" data-url="${esc(s.url)}" data-id="${siteId(s.url)}" data-search="${esc(search)}">
<a class="media" href="${esc(s.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${media}<span class="langs">${langs}</span></a>
<button class="fav" type="button" data-url="${esc(s.url)}" aria-pressed="false" aria-label="${esc(t.favAdd)}: ${esc(s.name)}" title="${esc(t.favAdd)}">☆</button>
<div class="body">
<h4><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(lang === 'ko' ? s.name : s.nameEn || s.name)}</a></h4>
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
    more: '실시간 시세 전체 보기',
    updated: '{t} 갱신',
    fresh: '방금 새 매물 {n}건',
    sparkLabel: '{name} 7일 추이: {from}에서 {to}',
    sparkHours: '{name} 24시간 추이: {from}에서 {to}',
    noTrend: '추이 데이터 부족',
    preview: '미리보기 · 실제 시세가 아닌 예시 데이터예요',
    scan: '내 화면으로 상점 스캔',
    empty: '아직 올라온 매물이 없어요. PC 크롬에서 메이플 창을 공유하고 상점을 열면 여기에 바로 나와요.',
    mine: '이어서 보기', mineWish: '관심 아이템', mineRecent: '최근 본 아이템', mineNote: '이 브라우저에 저장된 목록이에요 · 가격은 최근 14일 스캔·제보 기준', mineAll: '시세에서 전체 보기'
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
    more: 'Open the live market',
    updated: 'updated {t}',
    fresh: '{n} new just now',
    sparkLabel: '{name} 7-day trend: {from} to {to}',
    sparkHours: '{name} 24-hour trend: {from} to {to}',
    noTrend: 'not enough data for a trend',
    preview: 'Preview · sample data, not real prices',
    scan: 'Scan shops from my screen',
    empty: 'No listings yet. Share your MapleStory window in Chrome on a computer and open shops; they show up here right away.',
    mine: 'Pick up where you left off', mineWish: 'Wishlist', mineRecent: 'Recently viewed', mineNote: 'Saved in this browser · prices from scans and reports in the last 14 days', mineAll: 'Open in the market'
  }
};

function collectionStatus(lang) {
  return `<div class="collection-status" data-collection-status data-api="${esc(config.voteApi)}" data-state="waiting" role="status" aria-live="polite"><strong>${lang === 'ko' ? '수집 상태 확인 중' : 'Checking collection status'}</strong><span>${lang === 'ko' ? '최근 수집 완료 시각을 확인하고 있어요.' : 'Checking the last completed collection.'}</span></div>`;
}

function liveMarket(lang) {
  const t = LIVE[lang];
  return `<section class="wrap market" id="live-market" aria-labelledby="live-title"
 data-api="${esc(config.voteApi)}" data-items="${esc(href('/assets/items.json'))}" data-price="${esc(href(langPath(lang, '/tools/market/')))}"
 data-text="${esc(JSON.stringify(t))}">
<header class="market-head"><span class="live-dot" aria-hidden="true"></span><h2 id="live-title">${t.title}</h2><p>${t.sub}</p><small id="live-updated"></small><small class="live-fresh" id="live-fresh" role="status" hidden></small><a class="btn small-btn market-scan" href="${href(langPath(lang, '/tools/scan/'))}">● ${t.scan}</a><strong class="market-preview" id="market-preview" hidden>${t.preview}</strong></header>
${collectionStatus(lang)}
<section class="panel mega-trends" data-mega-trends="compact" data-items="${esc(href('/assets/items.json'))}" data-market="${esc(href(langPath(lang, '/tools/market/')))}" data-megaphone="${esc(href(langPath(lang, '/megaphone/')))}" hidden aria-label="${lang === 'ko' ? '지금 뜨는 아이템' : 'Trending in megaphones'}"></section>
<div id="live-mine" class="live-mine" hidden aria-label="${esc(t.mine)}"></div>
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
    `<a class="tool-card" href="${href(langPath(lang, p))}">${spriteSvg(icon, 44)}<strong>${title}</strong><p>${esc(desc)}</p><span>${t.open}</span></a>`;
  const marketBlock = liveMarket(lang);
  const toolsBlock = `<section class="wrap home-tools">
<h2>${t.toolsHeading}</h2>
<div class="tool-cards">
${(lang === 'ko' ? [
tool('/monsters/', 'slime', lang === 'ko' ? '몬스터 도감' : 'Monster database', lang === 'ko' ? '몬스터 78종의 능력치, 드롭 아이템, 출현 위치를 검색하세요.' : 'Explore stats, reported drops and map locations for 78 monsters.'),
tool('/equipment/', 'hammer', lang === 'ko' ? '장비 찾기' : 'Equipment finder', lang === 'ko' ? `직업과 레벨로 지금 얻을 수 있는 장비 ${EQUIPMENT.length}개를 찾고, 떨어뜨리는 몬스터를 봐요.` : `${EQUIPMENT.length} pieces of gear by class and level, with the monsters that drop them and quests that give them.`),
tool('/megaphone/', 'megaphone', lang === 'ko' ? '실시간 확성기' : 'Live megaphones', lang === 'ko' ? '게임 확성기를 실시간으로 모아 보고, 시세와 비교하고, 귓말을 바로 복사해요.' : 'Game megaphones live, compared with market prices, with a one-tap whisper command.'),
tool('/rank/', 'crown', lang === 'ko' ? '캐릭터 랭킹' : 'Character rankings', lang === 'ko' ? '레벨 순위 상위 1,000명과 직업 분포, 내 캐릭터 순위를 찾고 맞는 사냥터로 바로 가요.' : 'Top 1,000 by level, the class breakdown, and your own rank with training spots for your level.'),
tool('/quests/best-exp/', 'star', lang === 'ko' ? '경험치 퀘스트' : 'Best EXP quests', lang === 'ko' ? '레벨 구간마다 보상 경험치가 큰 퀘스트 10개씩.' : 'The ten biggest EXP quest rewards for each level band.'),
tool('/tools/training/', 'sword', t.navTraining, t.trCardDesc),
tool('/tools/scroll/', 'scroll', t.navScroll, t.scCardDesc),
tool('/tools/drop-rate/', 'bag', t.navDrop, t.dropCardDesc),
tool('/tools/market/', 'coin', t.navMarket, MK[lang].lead),
tool('/tools/price/', 'coin', t.navPrice, PR[lang].cardDesc),
tool('/tools/damage/', 'hammer', DMG[lang].h1, DMG[lang].cardDesc),
tool('/tools/scan/', 'megaphone', SCAN[lang].h1, SCAN[lang].cardDesc),
tool('/quests/', 'scroll', lang === 'ko' ? '퀘스트' : 'Quests', lang === 'ko' ? `퀘스트 ${QUESTS.length}개의 시작 레벨, 모아 올 아이템과 드롭 몬스터, 보상을 봐요.` : `${QUESTS.length} quests: start level, items to bring and who drops them, rewards.`),
tool('/bosses/', 'crown', lang === 'ko' ? '보스 몬스터' : 'Bosses', lang === 'ko' ? '마노부터 주니어 발록까지 보스의 출현 맵, 필요 명중, 드롭을 한 표로 봐요.' : 'Mano to Jr. Balrog: spawn maps, accuracy needed and equipment drops in one table.'),
tool('/maps/', 'tree', lang === 'ko' ? '맵 도감' : 'Maps', lang === 'ko' ? `맵 ${MAPS.filter((l) => l.availability === 'open').length}곳의 몬스터, 출현 수, 드롭을 지역별로 봐요.` : `${MAPS.filter((l) => l.availability === 'open').length} maps: which monsters spawn there, how many, and what they drop.`)
] : [
tool('/monsters/', 'slime', lang === 'ko' ? '몬스터 도감' : 'Monster database', lang === 'ko' ? '몬스터 78종의 능력치, 드롭 아이템, 출현 위치를 검색하세요.' : 'Explore stats, reported drops and map locations for 78 monsters.'),
tool('/equipment/', 'hammer', lang === 'ko' ? '장비 찾기' : 'Equipment finder', lang === 'ko' ? `직업과 레벨로 지금 얻을 수 있는 장비 ${EQUIPMENT.length}개를 찾고, 떨어뜨리는 몬스터를 봐요.` : `${EQUIPMENT.length} pieces of gear by class and level, with the monsters that drop them and quests that give them.`),
tool('/megaphone/', 'megaphone', lang === 'ko' ? '실시간 확성기' : 'Live megaphones', lang === 'ko' ? '게임 확성기를 실시간으로 모아 보고, 시세와 비교하고, 귓말을 바로 복사해요.' : 'Game megaphones live, compared with market prices, with a one-tap whisper command.'),
tool('/rank/', 'crown', lang === 'ko' ? '캐릭터 랭킹' : 'Character rankings', lang === 'ko' ? '레벨 순위 상위 1,000명과 직업 분포, 내 캐릭터 순위를 찾고 맞는 사냥터로 바로 가요.' : 'Top 1,000 by level, the class breakdown, and your own rank with training spots for your level.'),
tool('/quests/best-exp/', 'star', lang === 'ko' ? '경험치 퀘스트' : 'Best EXP quests', lang === 'ko' ? '레벨 구간마다 보상 경험치가 큰 퀘스트 10개씩.' : 'The ten biggest EXP quest rewards for each level band.'),
tool('/tools/training/', 'sword', t.navTraining, t.trCardDesc),
tool('/tools/market/', 'coin', t.navMarket, MK[lang].lead),
tool('/quests/', 'scroll', lang === 'ko' ? '퀘스트' : 'Quests', lang === 'ko' ? `퀘스트 ${QUESTS.length}개의 시작 레벨, 모아 올 아이템과 드롭 몬스터, 보상을 봐요.` : `${QUESTS.length} quests: start level, items to bring and who drops them, rewards.`),
tool('/bosses/', 'crown', lang === 'ko' ? '보스 몬스터' : 'Bosses', lang === 'ko' ? '마노부터 주니어 발록까지 보스의 출현 맵, 필요 명중, 드롭을 한 표로 봐요.' : 'Mano to Jr. Balrog: spawn maps, accuracy needed and equipment drops in one table.'),
tool('/maps/', 'tree', lang === 'ko' ? '맵 도감' : 'Maps', lang === 'ko' ? `맵 ${MAPS.filter((l) => l.availability === 'open').length}곳의 몬스터, 출현 수, 드롭을 지역별로 봐요.` : `${MAPS.filter((l) => l.availability === 'open').length} maps: which monsters spawn there, how many, and what they drop.`),
tool('/tools/drop-rate/', 'bag', t.navDrop, t.dropCardDesc),
tool('/tools/damage/', 'hammer', DMG[lang].h1, DMG[lang].cardDesc),
tool('/tools/scroll/', 'scroll', t.navScroll, t.scCardDesc),
tool('/tools/price/', 'coin', t.navPrice, PR[lang].cardDesc),
tool('/tools/scan/', 'megaphone', SCAN[lang].h1, SCAN[lang].cardDesc)
]).join('\n')}
</div>
</section>
`;
  const directoryBlock = `<section class="wrap purposes-wrap">
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
`;
  const guidesBlock = guides.some((g) => g.lang === lang)
  ? `<section class="wrap">
<h2>${t.navGuides}</h2>
<div class="tool-cards">${publishedGuides
      .filter((g) => g.lang === lang)
      .map((g) => tool(guidePath(g), 'book', esc(g.h1), g.desc))
      .join('')}</div>
</section>
`
  : '';
  // English, Chinese and Japanese visitors land here from search for drops, prices and training, not for a list of Korean
  // community sites: they left in about 11 seconds, so they get the database and guides first and the directory last.
  const body = lang === 'ko' ? [marketBlock, toolsBlock, directoryBlock, guidesBlock] : [toolsBlock, guidesBlock, marketBlock, directoryBlock];
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
<section class="unified-search" id="search-results" aria-label="${lang === 'ko' ? '통합 검색 결과' : 'Search results'}" data-items="${esc(href('/assets/items.json'))}" data-mobs="${esc(href('/assets/mobs.json'))}" data-monsters="${esc(href(langPath(lang, '/monsters/')))}" data-market="${esc(href(langPath(lang, '/tools/market/')))}" hidden>
<div class="search-summary"><h2>${lang === 'ko' ? '검색 결과' : 'Search results'}</h2><span id="search-status" role="status" aria-live="polite" aria-atomic="true"></span></div>
<div class="search-filters" role="group" aria-label="${lang === 'ko' ? '검색 결과 종류' : 'Result type'}">
${[['all', lang === 'ko' ? '전체' : 'All'], ['item', lang === 'ko' ? '아이템' : 'Items'], ['mob', lang === 'ko' ? '몬스터' : 'Monsters'], ['site', lang === 'ko' ? '사이트' : 'Sites'], ['tool', lang === 'ko' ? '도구·가이드' : 'Tools & guides']].map(([type, label]) => `<button type="button" data-search-type="${type}" aria-pressed="${type === 'all'}">${label} <span data-count="${type}">0</span></button>`).join('')}
</div>
<div id="search-item-state" class="search-item-state" hidden><span></span> <button type="button" id="search-retry" hidden>${lang === 'ko' ? '다시 불러오기' : 'Retry'}</button></div>
<div id="search-groups"></div>
<p id="search-empty" class="search-empty" hidden>${lang === 'ko' ? '일치하는 결과가 없어요. 더 짧은 이름이나 영문 이름으로 검색해 보세요.' : 'No matches. Try a shorter name or an English item name.'}</p>
</section>
</div>
<p class="search-help" id="search-help">${lang === 'ko' ? '한글·영문·초성·줄임말로 검색하세요. 예: 귀힘, 미스릴, 좀비 루팡, 사냥터' : 'Search by name or keyword. Try Gloves Attack, Mithril, Zombie Lupin or training.'}</p>
<p class="hero-new"><span class="hero-new-tag">NEW</span><a href="${href(langPath(lang, '/megaphone/'))}">${lang === 'ko' ? '실시간 확성기' : 'Live megaphones'}</a><a href="${href(langPath(lang, '/rank/'))}">${lang === 'ko' ? '캐릭터 랭킹' : 'Character rankings'}</a><a href="${href(langPath(lang, '/tools/market/'))}">${lang === 'ko' ? '커닝 공사장 상점' : 'Kerning street shops'}</a></p>
<dl class="hero-stats"><div data-market-stat="listings" hidden><dt>${lang === 'ko' ? '24시간 매물' : 'Listings, 24h'}</dt><dd>0</dd></div><div data-market-stat="shops" hidden><dt>${lang === 'ko' ? '24시간 확인한 상점' : 'Shops checked, 24h'}</dt><dd>0</dd></div>${lang === 'ko'
  ? `<div><dt>${t.statSites}</dt><dd>${SITE_COUNT}</dd></div><div><dt>${t.statCats}</dt><dd>${cats.length}</dd></div>`
  : `<div><dt>Monsters</dt><dd>${MONSTERS.monsters.filter((m) => m.status !== 'unplaced').length}</dd></div><div><dt>Quests</dt><dd>${QUESTS.length}</dd></div><div><dt>Maps</dt><dd>${MAPS.filter((l) => l.availability === 'open').length}</dd></div>`}</dl>
</div>
</div>
</section>
${adfitRails()}
${AD_TOP}
${jsonScript('home-routes', training.routes.map((r) => ({ id: r.id, title: r.title[lang], monsters: r.monsters[lang], min: r.level.min, max: r.level.max,
  level: r.level, jobs: r.jobs, party: r.party, costTier: r.costTier, advanced: r.advanced,
  mobs: r.mobs.flatMap((m) => [m.ko, m.en]), href: href(langPath(lang, `/tools/training/?lv=${r.level.min}#route-${r.id}`)) })))}
${jsonScript('home-classes', TR_CLASSES.map((c) => ({ slug: c.slug, job: c.job, title: lang === 'ko' ? `${c.ko} 사냥터` : `${c.en} training routes`, n: classRoutes(c).length,
  href: href(langPath(lang, classPath(c))), keywords: `${c.ko} ${c.en} ${jobNames.ko[c.job]} ${jobNames.en[c.job]}` })))}
<section class="wrap my-char" id="my-char" data-finder="${esc(href(langPath(lang, '/tools/training/')))}" hidden></section>
${body.join('\n')}
<section class="wrap faq">
<h2>${t.faqHeading}</h2>
${faq}
</section>`;
}

// ---------- training ----------

const bandSpots = (band) => selectRoutes(training.routes, { band, advanced: true });
function bandNav(lang, current) {
  const t = T[lang];
  return `<nav class="band-nav" aria-label="${esc(t.trBandNav)}"><h2>${t.trBandNav}</h2><div>${TR_BANDS.map((band) => {
    const label = lang === 'ko' ? `${band[0]}~${band[1]}레벨` : `Lv ${band[0]}–${band[1]}`;
    return current && band[0] === current[0] ? `<strong class="band-link current" aria-current="page">${label}</strong>` : `<a class="band-link" href="${href(langPath(lang, bandPath(band)))}">${label}</a>`;
  }).join('')}</div></nav>`;
}
function trainingMethod(lang) {
  const tr = (ko,en) => lang === 'ko' ? ko : en;
  return `<section class="panel tr-method"><h2>${tr('새 사냥터는 이렇게 비교하세요','Compare a new map in three steps')}</h2><ol>
<li>${tr('<strong>같은 장비로 10분씩.</strong> 버프·파티 인원·담당 층을 맞추고 미스와 처치 타수를 봐요.','<strong>Use equal ten-minute trials.</strong> Keep gear, buffs, party size and platform role comparable; check misses and casts per kill.')}</li>
<li>${tr('<strong>경험치와 비용을 같이.</strong> 획득 메소와 실제 판매 수입에서 사용한 물약·탄약·이동비를 빼요. 미판매 희귀 아이템은 따로 적어요.','<strong>Compare EXP and costs.</strong> Subtract consumed supplies and travel from looted Mesos and actual sales; keep unsold rare drops separate.')}</li>
<li>${tr('<strong>이동은 조건이 맞을 때.</strong> 레벨 범위는 이동을 검토하는 구간이에요. 공격 횟수·명중·물약 소비가 나빠지면 이전 맵을 유지하세요.','<strong>Move when the conditions work.</strong> Levels are trial windows. Stay on your previous map if hits, accuracy or supply consumption worsen.')}</li></ol>
<p>${tr('실제 플레이와 공략을 바탕으로 재구성한 조건부 안내예요. 같은 결과를 모든 장비에서 재현한 실측표는 아니에요.','These conditional routes synthesize gameplay and guides; they are not controlled benchmarks for every setup.')}</p>
<p><a href="${href(langPath(lang,'/guides/leveling-1-30/'))}">${tr('1~30레벨 상세 동선','Detailed early progression')}</a> · <a href="${href(langPath(lang,'/guides/leveling-30-70/'))}">${tr('30레벨 이후 직업별 분기','Class routes after 30')}</a></p></section>`;
}
function trainingBody(lang) {
  const t=T[lang]; const tr=(ko,en)=>lang==='ko'?ko:en;
  const initial=selectRoutes(training.routes,{level:20});
  return `${pageHead(lang,'sword',t.trH1,t.trLead)}<div class="wrap tr-page">
<form id="tr-form" class="panel tr-filters">
<label>${t.level}<input type="number" name="lv" min="1" max="100" value="20" required inputmode="numeric"></label>
<label>${tr('직업','Class')}<select name="job"><option value="">${tr('모든 직업','All classes')}</option>${Object.entries(jobNames[lang]).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
<label>${tr('우선순위','Priority')}<select name="goal"><option value="balanced">${tr('전체 비교','Compare all')}</option><option value="economy">${tr('물약 절약','Lower supply cost')}</option></select></label>
<label>${tr('사냥 방식','Party setup')}<select name="party"><option value="any">${tr('솔로 + 파티','Solo + party')}</option><option value="solo">${tr('솔로 가능한 곳','Solo options')}</option></select></label>
<button class="btn" type="submit">${tr('사냥터 찾기','Find routes')}</button>
<label class="tr-check"><input name="advanced" type="checkbox">${tr('장비·명중 조건이 까다로운 후보도 보기','Include demanding gear / accuracy options')}</label>
<p class="tr-filter-help">${tr('표시 레벨은 이동 검토 구간이에요. 카드의 진입 기준을 먼저 확인하세요.','Levels are trial windows; read each card’s entry conditions first.')}</p>
</form><div class="tr-result-head"><h2 id="tr-status" role="status">${tr('20레벨 사냥 후보','Options for level 20')} ${initial.length}${tr('곳','')}</h2><div class="tr-result-actions"><button type="button" class="btn ghost small-btn" id="tr-share" data-ok="${tr('조건 링크를 복사했어요','Link copied')}" data-fail="${tr('복사하지 못했어요. 주소창의 주소를 직접 복사해 주세요.','Could not copy. Copy the address from the address bar.')}">${tr('이 조건 링크 복사','Copy link to these filters')}</button><span id="tr-share-status" class="share-status" role="status" aria-live="polite"></span><a href="${href(langPath(lang,'/guides/choose-your-job/'))}">${tr('직업별 육성 가이드','Class guides')}</a></div></div>
<section id="tr-result">${routeCards(initial,lang)}</section><noscript><p>${tr('조건 검색에는 JavaScript가 필요해요. 아래 레벨별 페이지에서 전체 경로를 볼 수 있어요.','Filters require JavaScript. Browse the level-band pages below for all routes.')}</p></noscript>
${classNav(lang)}${bandNav(lang)}${trainingMethod(lang)}</div>${jsonScript('training-data',publicTrainingData(training))}`;
}
function trainingBandBody(lang,band) {
  const t=T[lang]; const rows=bandSpots(band); const vars={a:band[0],b:band[1],n:rows.length};
  return `${pageHead(lang,'sword',fill(t.trBandH1,vars),fill(t.trBandLead,vars))}<div class="wrap tr-page">
<p class="tr-review-note">${lang==='ko'?'이 구간과 겹치는 모든 직업의 경로예요. 장비 조건부 후보도 포함되니 진입 기준과 직업을 확인하세요.':'All class routes overlapping this band, including gear-dependent trials. Check class and entry conditions.'}</p>${routeCards(rows,lang)}
<p><a class="btn" href="${href(langPath(lang,'/tools/training/'))}?lv=${band[0]}">${t.trBandFinder}</a></p>${bandNav(lang,band)}${classNav(lang)}${trainingMethod(lang)}</div>`;
}

const classRoutes = (cls) => selectRoutes(training.routes, { job: cls.job, advanced: true });
function classNav(lang, current) {
  const tr = (ko, en) => (lang === 'ko' ? ko : en);
  return `<nav class="band-nav" aria-label="${tr('직업별 사냥터', 'Training by class')}"><h2>${tr('직업별 사냥터', 'Training by class')}</h2><div>${TR_CLASSES.map((c) => {
    const label = lang === 'ko' ? c.ko : c.en;
    return current && c.slug === current.slug ? `<strong class="band-link current" aria-current="page">${label}</strong>` : `<a class="band-link" href="${href(langPath(lang, classPath(c)))}">${label}</a>`;
  }).join('')}</div></nav>`;
}
function trainingClassBody(lang, cls) {
  const tr = (ko, en) => (lang === 'ko' ? ko : en);
  const name = lang === 'ko' ? cls.ko : cls.en;
  const rows = classRoutes(cls);
  const own = rows.filter((r) => r.jobs.length).length;
  // Each route sits under the band it starts in, so a route card (and its #route- anchor) appears once.
  const groups = TR_BANDS.map((band) => ({ band, rows: rows.filter((r) => r.level.min >= band[0] && r.level.min <= band[1]) })).filter((g) => g.rows.length);
  const bandLabel = (band) => (lang === 'ko' ? `${band[0]}~${band[1]}레벨` : `Level ${band[0]}–${band[1]}`);
  const overview = `<div class="table-wrap tr-class-overview"><table class="data"><thead><tr><th>${tr('레벨', 'Level')}</th><th>${tr('사냥 경로', 'Route')}</th><th>${tr('대상', 'For')}</th></tr></thead><tbody>${rows
    .map((r) => `<tr><td class="lv">Lv. ${r.level.min}–${r.level.max}</td><td><a href="#route-${r.id}">${esc(r.title[lang])}</a></td><td>${r.jobs.length ? `<ul class="tr-for">${r.jobs.map((j) => `<li>${esc(jobNames[lang][j])}</li>`).join('')}</ul>` : tr('공통', 'All classes')}</td></tr>`)
    .join('')}</tbody></table></div>`;
  const guide = guides.find((g) => g.slug === cls.guide && g.lang === lang && g.status === 'published');
  return `${pageHead(lang, 'sword', tr(`${name} 사냥터`, `${name} training routes`), tr(`레벨 구간마다 ${name}에게 맞는 사냥 경로 ${rows.length}곳이에요. ${name} 전용 ${own}곳과 모든 직업 공통 경로를 함께 담았어요.`, `${rows.length} routes by level: ${own} for this class, the rest open to every class.`))}<div class="wrap tr-page">
<p class="tr-review-note">${tr('레벨은 이동을 검토하는 구간이에요. 카드마다 진입 기준, 잡을 몬스터와 필요한 명중, 물약 비용, 자리가 없을 때 대안을 적어 두었어요.', 'Levels are trial windows. Each card lists entry conditions, the monsters and the accuracy they need, supply costs and a fallback when the map is busy.')}</p>
${groups.map((g) => `<h2>${bandLabel(g.band)}</h2>${routeCards(g.rows, lang)}`).join('\n')}
<p class="tr-result-actions"><a class="btn" href="${href(langPath(lang, '/tools/training/'))}?job=${cls.job}">${tr(`내 레벨로 ${name} 사냥터 찾기`, 'Find routes for my level')}</a>${guide ? `<a href="${href(langPath(lang, guidePath(guide)))}">${esc(guide.h1 || guide.title)}</a>` : ''}</p>
${classNav(lang, cls)}${bandNav(lang)}${trainingMethod(lang)}</div>`;
}

// ---------- scrolls ----------

// Real scrolls for the picker: each family (e.g. Gloves Attack) with its tiers' item ids, mapped to the gain ladder in
// scrolls.json. Pet equipment scrolls have no confirmed ladder and are left out.
function scrollFamilies(lang) {
  const ladderOf = (name) =>
    /^(Wand|Staff) Magic Attack$/.test(name) ? 'magic-weapon'
    : /(Sword|Axe|Blunt Weapon|Dagger|Spear|Polearm|Bow|Crossbow|Claw) Attack$/.test(name) ? 'weapon'
    : /(DEF|Def\.|Gloves Magic Attack)$/.test(name) ? 'defense'
    : /(HP|MP)$/.test(name) ? 'hpmp'
    : 'standard';
  const fam = new Map();
  for (const i of itemsData.items) {
    const m = i.en.match(/^(.*) Scroll: (Lesser|Intermediate|Greater|Chaos)$/);
    if (!m || /^Pet Equip/.test(m[1])) continue;
    const f = fam.get(m[1]) || fam.set(m[1], { en: m[1], ko: (i.ko || i.en).replace(/ 주문서: .*$/, ''), ladder: ladderOf(m[1]), tiers: {} }).get(m[1]);
    f.tiers[m[2].toLowerCase()] = i.id;
  }
  return [...fam.values()].sort((a, b) => a.en.localeCompare(b.en)).map((f) => [lang === 'ko' ? f.ko : f.en, f.ladder, f.tiers]);
}
function scrollBody(lang) {
  const t = T[lang];
  const tierOpts = scrolls.tiers.map((s) => `<option value="${s.id}"${s.id === 'intermediate' ? ' selected' : ''}>${esc(tierName(lang, s))} (${s.success}%)</option>`).join('');
  const ladderOpts =
    scrolls.ladders.map((l) => `<option value="${l.id}">${esc(l.name[lang])}</option>`).join('') + `<option value="custom">${t.scCustom}</option>`;
  const tierRows = scrolls.tiers.map((s) => `<tr><td>${esc(tierName(lang, s))}</td><td>${s.success}%</td><td>${s.destroyOnFail ? `${s.destroyOnFail}%` : '—'}</td></tr>`).join('');
  const ladderRows = scrolls.ladders
    .map(
      (l) =>
        `<tr><td>${esc(l.name[lang])}</td>${scrolls.tiers.map((s) => `<td>+${l.gains[s.id]}</td>`).join('')}<td>${scrolls.tiers
          .map((s) => `${tierName(lang, s)[0]} ${Math.round(l.gains[s.id] * s.success) / 100}`)
          .join(' · ')}</td></tr>`
    )
    .join('');
  return `${pageHead(lang, 'scroll', t.scH1, t.scLead)}
<div class="wrap">
<div class="tool-layout">
<form id="sc-form" class="panel form" data-api="${esc(config.voteApi)}" data-market="${esc(href(langPath(lang, '/tools/market/')))}" data-drops="${esc(href(langPath(lang, '/tools/drop-rate/')))}">
<label class="sc-pick">${lang === 'ko' ? '주문서 고르기' : 'Pick a scroll'}<select name="family"><option value="">${lang === 'ko' ? '직접 입력' : 'Enter values myself'}</option>${scrollFamilies(lang).map(([name], i) => `<option value="${i}" translate="no">${esc(name)}</option>`).join('')}</select><small id="sc-price-note" class="sc-price-note"></small></label>
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
<section class="panel sc-compare">
<h2>${lang === 'ko' ? '같은 칸 수로 등급끼리 비교' : 'Compare tiers for the same slots'}</h2>
<p class="muted small">${lang === 'ko' ? '위에서 고른 종류와 개수 그대로, 등급만 바꿨을 때예요. 장당 가격을 넣으면 공격력 1당 평균 비용도 보여 줘요.' : 'Same scroll type and count as above, one row per tier. Add a price per scroll to see the average cost per point.'}</p>
<div class="table-wrap"><table class="data" id="sc-compare"><thead><tr><th>${t.colTier}</th><th>${lang === 'ko' ? '평균 상승' : 'Average gain'}</th><th>${lang === 'ko' ? '하급보다 못할 확률' : 'Worse than Lesser'}</th><th>${lang === 'ko' ? '파괴 확률' : 'Destroyed'}</th><th>${lang === 'ko' ? '장당 가격 (메소)' : 'Price each (mesos)'}</th><th>${lang === 'ko' ? '1당 평균 비용' : 'Avg cost per point'}</th></tr></thead><tbody></tbody></table></div>
</section>
<section>
<h2>${t.tierTable}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colTier}</th><th>${t.colSuccess}</th><th>${t.colBoom}</th></tr></thead><tbody>${tierRows}</tbody></table></div>
<h2>${t.ladderTable}</h2>
<div class="table-wrap"><table class="data"><thead><tr><th>${t.colLadder}</th>${scrolls.tiers.map((s) => `<th>${esc(tierName(lang, s))}</th>`).join('')}<th>${t.colExpected}</th></tr></thead><tbody>${ladderRows}</tbody></table></div>
<ul class="notes"><li>${esc(scrolls.disputed[lang])}</li><li>${esc(scrolls.unknown[lang])}</li></ul>
<p class="src">${t.sourcesLabel}: ${scrolls.sources.map((s) => `${srcLink(s.url, s.name)}${s.date ? ` (${s.date})` : ''}`).join(' · ')}</p>
</section>
${scrollGuide(lang)}
</div>
${jsonScript('scroll-data', { ...scrolls, families: scrollFamilies(lang) })}
${jsonScript('i18n', { lang, distSucc: t.distSucc, distBoom: t.distBoom, tierNames: Object.fromEntries(scrolls.tiers.map((x) => [x.id, tierName(lang, x)])) })}`;
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
    h1: '다른 시세 사이트에서 찾기',
    lead: '아이템을 한글로 검색하면 영어 이름을 찾아 시세 사이트로 바로 연결해 줘요.',
    cardDesc: '한글 이름으로 영문 이름을 찾아 다른 시세 사이트로 바로 이동해요. 우리 시세는 실시간 시세에서 봐요.',
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
    twin: { male: '남성용', female: '여성용', other: '이름이 같은 아이템 있음 · ID {id}' },
    moreItems: '{n}개 더 보기',
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
    typical: '대표 시세 (아직 우리 기록 없음)',
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
    h1: 'Find an item on other price sites',
    lead: 'Type an item name and jump straight to its price on the Free Market trackers.',
    cardDesc: 'Look up an item and open it on other price trackers. Our own prices live in Live Market.',
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
    twin: { male: 'Male', female: 'Female', other: 'Shares its name with another item · ID {id}' },
    moreItems: '{n} more',
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
    typical: 'Typical price (no records of our own yet)',
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

<p class="muted">${esc(t.sourceNote)}</p>
${t.tradingLink && guides.some((g) => g.slug === 'trading-and-mesos') ? `<p>${fill(t.tradingLink, { href: href(langPath('ko', '/guides/trading-and-mesos/')) })}</p>` : ''}
</section>
</div>
${jsonScript('i18n', { lang, ...Object.fromEntries(Object.entries(t).filter(([k]) => ['none', 'more', 'level', 'copy', 'copied', 'paid', 'direct', 'copyNote', 'twin', 'cats', 'subs', 'hubLabel', 'hubNone', 'hubSummary', 'report', 'pricePh', 'submit', 'thanks', 'badPrice', 'failed', 'kinds', 'typical', 'recent', 'recentNone'].includes(k))), sites: PRICE_SITES, itemsUrl: href('/assets/items.json'), api: config.priceReports ? config.voteApi : '', reports: false })}`;
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
    colItem: '아이템', colPrice: '가격', colMarket: '시세', colDiff: '시세 대비', colSeller: '판매자', colWhere: '위치', colState: '상태', colRead: '인식', colEdit: '수정',
    resultsEmpty: '아직 인식한 물건이 없어요. 공유를 시작하고 자유시장에서 상점을 열어 보세요.',
    privacy: '공유한 화면은 이 컴퓨터 안에서만 읽고, 읽어 낸 아이템과 가격만 시세에 반영해요. 게임 화면 자체는 어디에도 올리지 않아요.',
    i: {
      loading: '아이템·글자 데이터를 불러오는 중이에요…', ready: '준비됐어요. 채널·방을 고르고 화면을 공유하세요.', dataFail: '인식 데이터를 불러오지 못했어요. 다시 시도해 주세요.',
      duplicateEdit: '같은 매물이 이미 있어요. 기존 줄을 수정해 주세요.', retry: '다시 시도', manual: '직접 선택', channelLabel: '채널', roomLabel: '자유시장 방·위치', chooseLocation: '선택해 주세요',
      locationChanged: '선택한 위치는 다음 인식부터 적용돼요. 기존 매물은 각 줄에서 수정할 수 있어요.', sending: '전송 중이에요. 완료 후 수정해 주세요.',
      watching: '공유 중 · 상점 화면 {n}장 확인',
      selling: '판매 중', sold: '판매 완료 표시', ok: '인식됨', check: '확인 필요', each: '메소', now: '방금',
      bundle: '{n}개 묶음 {total}',
      edit: '이 줄 고치기', edited: '수정함', pickItem: '아이템 고르기', unreadable: '읽지 못한 줄 · ✎로 직접 입력', qty: '묶음 개수', save: '저장', cancel: '취소',
      editInvalid: '아이템·채널·방을 선택하고 가격, 1~10,000의 정수 수량, 영문·숫자 판매자명을 확인해 주세요',
      colItem: '아이템', colPrice: '가격', colSeller: '판매자',
      marketTip: '최근 14일 시세 중앙값', diffHigh: '시세보다 {p}% 비싸요', diffLow: '시세보다 {p}% 싸요', diffEven: '시세 수준', noMarket: '시세 기록 없음',
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
    colItem: 'Item', colPrice: 'Price', colMarket: 'Market', colDiff: 'vs market', colSeller: 'Seller', colWhere: 'Where', colState: 'Status', colRead: 'Read', colEdit: 'Edit',
    resultsEmpty: 'Nothing recognized yet. Start sharing and open shops in the Free Market.',
    privacy: 'The shared screen is read only on this computer; just the items and prices it finds go into the price data. The game screen itself is never uploaded.',
    i: {
      loading: 'Loading item and text data…', ready: 'Ready. Choose your location and share your window.', dataFail: 'Could not load recognition data. Please retry.',
      duplicateEdit: 'This listing already exists. Edit its existing row.', retry: 'Retry', manual: 'Manual', channelLabel: 'Channel', roomLabel: 'Free Market room or spot', chooseLocation: 'Choose location',
      locationChanged: 'Location applies to the next read. Use each row’s edit button to correct earlier listings.', sending: 'Sending. Please edit after the upload finishes.',
      watching: 'Sharing · {n} shop screens checked',
      selling: 'For sale', sold: 'Sold', ok: 'OK', check: 'Check', each: 'mesos', now: 'now',
      bundle: '{n} for {total}',
      edit: 'Fix this line', edited: 'Edited', pickItem: 'Pick the item', unreadable: 'Unreadable line · fix it with ✎', qty: 'Bundle size', save: 'Save', cancel: 'Cancel',
      editInvalid: 'Pick the item from the list, write the price like 580000 or 580k, and the seller in letters and digits',
      colItem: 'Item', colPrice: 'Price', colSeller: 'Seller',
      marketTip: 'Median of the last 14 days', diffHigh: '{p}% above the market', diffLow: '{p}% below the market', diffEven: 'In line with the market', noMarket: 'No price record yet',
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

// Free Market rooms, plus town streets players use as markets (assets/place.js: 101 is the Kerning construction site).
function locationChoices(lang, prefix) {
  return `<option value="">${lang === 'ko' ? '자동 인식' : 'Automatic'}</option>` + Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">${prefix} ${i + 1}</option>`).join('') +
    (prefix === 'FM' ? `<option value="101">${lang === 'ko' ? '커닝 공사장' : 'Kerning Construction Site'}</option>` : '');
}

// "My shop vs the market": a seller name in, every open listing of that shop out, each against the item's market median and
// today's cheapest competing listing. Listings come from shop scans and the collector, so many shops are found without
// uploading anything; when none are, the page points to the shop scan.

function scanBody(lang) {
  const t = SCAN[lang];
  const steps = t.steps.map(([h, d], n) => `<li><b>${n + 1}</b><strong>${esc(h)}</strong><span>${esc(d)}</span></li>`).join('');
  return `${pageHead(lang, 'megaphone', t.h1, t.lead)}
<div class="wrap scan">
<div class="panel scan-device-note" id="scan-device-note" hidden role="note"><strong>${lang === 'ko' ? '상점 스캔은 PC 크롬·엣지에서만 돼요.' : 'Shop scanning works only in Chrome or Edge on a computer.'}</strong><p>${lang === 'ko' ? '휴대폰·태블릿 브라우저는 게임 화면 공유를 지원하지 않아요. 이 페이지 주소를 PC에서 열어 주세요. 시세는 휴대폰에서도 실시간 시세 메뉴로 볼 수 있어요.' : 'Phone and tablet browsers cannot share a game window. Open this page on a computer; prices are still available on Live Market from any device.'}</p><p><button type="button" class="btn small-btn" id="scan-copy-link">${lang === 'ko' ? '이 페이지 링크 복사' : 'Copy this page link'}</button> <a class="btn ghost small-btn" href="${href(langPath(lang, '/tools/market/'))}">${lang === 'ko' ? '실시간 시세 보기' : 'Open Live Market'}</a> <span class="share-status" id="scan-copy-status" role="status"></span></p></div>
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
<thead><tr><th>${t.colItem}</th><th>${t.colPrice}</th><th>${t.colMarket}</th><th>${t.colDiff}</th><th>${t.colSeller}</th><th>${t.colWhere}</th><th>${t.colState}</th><th>${t.colRead}</th><th><span class="sr-only">${t.colEdit}</span></th></tr></thead>
<tbody id="scan-results"><tr class="empty"><td colspan="9">${esc(t.resultsEmpty)}</td></tr></tbody>
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
    cols: { mob: '몬스터', lv: 'Lv', hp: 'HP', dmg: '한 번에 주는 피해', sure: '최저값 기준', avg: '평균', acc: '명중률' },
    hits: '{n}방', never: '불가', lines: '{n}타', mobsHit: '최대 {n}마리',
    accNeed: '100% 명중에 필요한 명중 {n}',
    emptyMobs: '조건에 맞는 몬스터가 없어요.', needStats: '레벨, 스탯, 공격 범위(또는 무기)를 넣으면 결과가 나와요.',
    note: '최저값 기준과 평균은 모델 안에서의 처치 횟수이며 실제 처치를 보장하지 않아요. 빗나감, 크리티컬, 지속 피해, 파이널 어택 추가타, 버프 시간은 처치 횟수에 반영하지 않아요. 몬스터·무기는 2026-11-03에 수집한 MCW 클라이언트 자료이며 현재 패치의 실측 검증은 아니에요.',
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
    cols: { mob: 'Monster', lv: 'Lv', hp: 'HP', dmg: 'Damage per use', sure: 'Min rolls', avg: 'Avg', acc: 'Hit' },
    hits: '{n} hits', never: 'No', lines: '{n} lines', mobsHit: 'up to {n} mobs',
    accNeed: '{n} accuracy for 100%',
    emptyMobs: 'No monsters match.', needStats: 'Enter level, stats and the attack range (or a weapon) to see results.',
    note: 'Min rolls and Avg are model estimates, not guaranteed kills. Misses, crits, damage over time, Final Attack follow-ups and buff uptime are not included in kill counts. Monster and weapon data were collected from the MCW client API on 2026-11-03, not measured against the current patch.',
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
<p class="muted small" id="dm-heal-note" hidden>${lang === 'ko' ? '힐로 언데드를 때리는 데미지는 공식이 공개되지 않아 계산하지 않아요(NiaMeowDB·Henesys.GG 모두 공식 미공개). 아래 표에서 <b>언데드</b> 표시가 붙은 몬스터가 힐로 잡을 수 있는 대상이에요.' : 'Heal damage against undead is not calculated: its formula is not public (NiaMeowDB and Henesys.GG do not publish it either). Monsters tagged <b>Undead</b> below are the ones Heal can hit.'}</p>
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
${damageGuide(lang)}
${jsonScript('dm-data', { lang, t: { ...t.i, hits: t.hits, never: t.never, lines: t.lines, mobsHit: t.mobsHit, accNeed: t.accNeed, emptyMobs: t.emptyMobs, needStats: t.needStats, estimated: t.estimated, none: t.none, status: lang === 'ko' ? { upcoming: '11/18 개방 지역', unavailable: '미개방 지역', unplaced: '맵에 없음' } : { upcoming: 'Opens Nov 18', unavailable: 'Unreleased area', unplaced: 'Not on a map' } }, monstersUrl: href(langPath(lang, '/monsters/')), mobsUrl: href('/assets/mobs.json'), weaponsUrl: href('/assets/weapons.json') })}`;
}

// ---------- live market page ----------
// The main price feature: search an item to see its statistics, a 7-day price trend, how listings spread over price bands
// and where to buy it now; next to the live top 10 and the scrolling feed of scanned listings.
const MK = {
  ko: {
    title: '글클메 시세: 실시간 자유시장 가격·추이·지금 파는 곳 | GMS Hub',
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
    whereNote: '최근 24시간 안에 확인한 판매 중 매물이에요. 실제 재고는 달라질 수 있어요.',
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
    history: '판매 완료·오래된 매물', stale: '24시간 경과', total: '묶음 총액', priceUnit: '메소', excluded: '극단적인 가격 {n}개는 통계에서 제외했어요.',
    chartSelling: '판매 중 기록', chartSold: '판매 완료 기록', chartEmpty: '선택한 상태의 기록이 없어요.',
    table: { price: '가격', qty: '묶음', seller: '판매자', where: '위치', seen: '본 시각' }
  },
  en: {
    title: 'MapleStory Classic World Price Tracker: Live Free Market Prices & Trends | GMS Hub',
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
    whereNote: 'Open listings seen in the last 24 hours. Availability may have changed.',
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
    history: 'Sold and older listings', stale: 'Over 24h old', total: 'Bundle total', priceUnit: 'mesos', excluded: '{n} extreme prices excluded from statistics.',
    chartSelling: 'Asking prices', chartSold: 'Sold prices', chartEmpty: 'No observations for this status.',
    table: { price: 'Price', qty: 'Bundle', seller: 'Seller', where: 'Where', seen: 'Seen' }
  }
};

function marketBody(lang) {
  const t = MK[lang], tr = (ko,en) => lang === 'ko' ? ko : en;
  const stat = (key,label) => `<div><dd id="mk-stat-${key}">–</dd><dt>${label}</dt></div>`;
  return `<section class="wrap mb-page-head"><h1>${spriteSvg('coin',28)} ${t.h1}</h1><p>${tr('아이템별 가격과 판매자·채널·방을 한곳에서 확인하세요.', 'Browse prices, sellers, channels and Free Market rooms in one place.')}</p><p class="char-links"><a href="${href(langPath(lang, '/tools/market/today/'))}">${tr('오늘의 시세 리포트', "Today's price report")}</a><a href="${href(langPath(lang, '/tools/scan/'))}">${tr('화면 스캔으로 내 상점 올리기', 'Upload my shop with the scan')}</a></p></section>
<div class="wrap mk market-browser">
<div class="mb-status"><p id="mk-status" role="status">${t.loading}</p><button id="mk-retry" class="btn ghost small-btn" type="button">${tr('새로고침','Refresh')}</button></div>
<div class="mb-tabs" role="tablist" aria-label="${tr('시장 탐색','Browse market')}"><button id="mb-tab-items" role="tab" aria-selected="true" aria-controls="mb-browser" data-view="items">${tr('아이템 시세','Item prices')}</button><button id="mb-tab-listings" role="tab" aria-selected="false" tabindex="-1" aria-controls="mb-browser" data-view="listings">${tr('전체 매물','All listings')}</button></div>
<div class="mb-workspace" id="mb-workspace"><section class="panel mb-browser" id="mb-browser" role="tabpanel" aria-labelledby="mb-tab-items">
<div class="mb-search"><label for="mk-q">${tr('아이템 검색','Search items')}</label><div><input type="search" id="mk-q" placeholder="${esc(t.placeholder)}" autocomplete="off"><button id="mb-clear-search" class="btn ghost small-btn" type="button">${tr('지우기','Clear')}</button></div></div>
<div id="mb-mine" class="mb-mine" hidden aria-label="${tr('관심 아이템과 최근 본 아이템','Wishlist and recently viewed items')}"></div>
<div class="mb-categories" id="mb-categories" role="group" aria-label="${tr('아이템 분류','Item category')}">${[['all','전체','All'],['scroll','주문서','Scrolls'],['weapon','무기','Weapons'],['equip','장비','Equips'],['stars','표창','Stars'],['cash','캐시','Cash'],['other','소비·기타','Use & other']].map(([id,ko,en])=>`<button type="button" data-category="${id}" aria-pressed="${id==='all'}">${tr(ko,en)}</button>`).join('')}</div><label class="mb-class">${tr('직업','Class')} <select id="mb-class">${[['','모든 직업','All classes'],['warrior','전사 전체','All warriors'],['fighter','파이터','Fighter'],['page','페이지','Page'],['spearman','스피어맨','Spearman'],['magician','마법사','Magician'],['bowman','궁수 전체','All bowmen'],['hunter','헌터','Hunter'],['crossbowman','석궁사수','Crossbowman'],['thief','도적 전체','All thieves'],['assassin','어쌔신','Assassin'],['bandit','시프','Bandit']].map(([v,ko,en])=>`<option value="${v}">${tr(ko,en)}</option>`).join('')}</select></label>
<div class="mb-item-controls" id="mb-item-controls" hidden><label><input type="checkbox" id="mb-favorites"> ${tr('관심 아이템만','Wishlist only')}</label><label>${tr('정렬','Sort')} <select id="mb-item-sort"><option value="sales">${tr('거래 많은 순','Most traded')}</option><option value="active">${tr('판매 매물 많은 순','Most asking listings')}</option><option value="rising">${tr('24시간 많이 오른 순','Biggest 24h rise')}</option><option value="falling">${tr('24시간 많이 내린 순','Biggest 24h drop')}</option><option value="low">${tr('최저가 낮은 순','Lowest ask')}</option><option value="price">${tr('중앙값 낮은 순','Lowest median')}</option><option value="recent">${tr('최근 확인순','Recently seen')}</option><option value="name">${tr('이름순','Name')}</option></select></label></div>
<details id="mb-list-controls" class="mb-filter-box"><summary>${tr('필터','Filters')} <small id="mb-filter-count">${tr('판매자 · 채널 · 방 · 상태 · 정렬','Seller · channel · room · status · sort')}</small></summary><div class="mb-list-controls"><label>${tr('판매자','Seller')}<input type="search" id="mb-seller" maxlength="13" placeholder="${tr('닉네임 검색','Search nickname')}"></label><label>${tr('채널','Channel')}<select id="mb-channel"><option value="">${t.filterChannel}</option>${Array.from({length:40},(_,i)=>`<option value="${i+1}">CH ${i+1}</option>`).join('')}</select></label><label>${tr('자유시장 방','Free Market room')}<select id="mb-room"><option value="">${t.filterRoom}</option>${Array.from({length:40},(_,i)=>`<option value="${i+1}">FM ${i+1}</option>`).join('')}</select></label><label>${tr('상태','Status')}<select id="mb-state"><option value="open">${tr('판매 중 · 최근 24시간','Asking · last 24h')}</option><option value="all">${tr('전체 기록','All records')}</option><option value="sold">${tr('판매 완료 표시','Marked sold')}</option><option value="stale">${tr('24시간 경과','Over 24h old')}</option></select></label><label>${tr('정렬','Sort')}<select id="mb-list-sort"><option value="recent">${t.sortRecent}</option><option value="price">${t.sortPrice}</option><option value="high">${tr('높은 가격순','Highest price')}</option></select></label></div></details>
<div id="mb-report-controls" hidden><label>${tr('제보 종류','Report type')} <select id="mb-report-kind"><option value="">${tr('전체','All')}</option><option value="selling">${tr('판매가','Asking')}</option><option value="sold">${tr('판매 완료','Sold')}</option><option value="buying">${tr('구매 희망','Buying')}</option></select></label></div>
<div id="mb-range" hidden><label>${tr('조회 기간','Time range')} <select id="mb-days"><option value="7">${tr('최근 7일','Last 7 days')}</option><option value="1">${tr('최근 24시간','Last 24 hours')}</option><option value="30">${tr('최근 30일','Last 30 days')}</option></select></label></div>
<div id="mb-summary" class="mb-summary" hidden aria-label="${tr('검색한 아이템 시세 요약','Price summary for the search')}"></div><p class="muted note" id="mb-list-note"></p><p id="mb-count" role="status" class="muted note"></p><div id="mb-results" aria-busy="true"><p>${t.loading}</p></div><div id="mb-pagination" class="mb-pagination"></div></section>
<section id="mk-detail" class="panel mb-detail" hidden aria-label="${tr('선택한 아이템','Selected item')}"></section></div>
<dialog id="mb-shop" class="mb-shop"><div id="mb-shop-body"></div></dialog>
<div class="mk-foot"><div class="mk-bar"><dl class="mk-stats">${stat('open',tr('최근 판매 매물','Recent asking listings'))}${stat('shops',tr('상점','Shops'))}${stat('items',tr('아이템 · 7일','Items · 7d'))}${stat('records',tr('매물 기록 · 7일','Listing records · 7d'))}</dl><a class="btn small-btn" href="${href(langPath(lang, '/tools/scan/'))}">${t.scan}</a></div>
${collectionStatus(lang)}</div>
</div>
${marketGuide(lang)}
${jsonScript('mk-data', { lang, api: config.voteApi, itemsUrl: href('/assets/items.json'), t, itemBase: href(langPath(lang, '/items/')), itemLink: IT[lang].pageLink, itemPages: PRICED.map((i) => i.id), itemPaths: Object.fromEntries(PRICED.map((i) => [i.id, href(langPath(lang, itemPath(i)))])), alerts: config.alerts && config.vapidPublic ? { key: config.vapidPublic, sw: href('/sw.js') } : null })}`;
}

// "Drop rate" visitors mostly want to know which monster drops an item (Clarity: half of them went straight back), so the
// page opens with a drop finder over the player-reported drop lists; the odds calculator follows.
function dropFinder(lang) {
  const ko = lang === 'ko';
  const mobs = MONSTERS.monsters.filter((m) => m.status === 'active').sort((a, b) => a.lv - b.lv);
  const mobIdx = new Map(mobs.map((m, i) => [m.id, i]));
  const byId = new Map(itemsData.items.map((i) => [i.id, i]));
  const items = [...DROP_INDEX.entries()]
    .map(([id, rows]) => [byId.get(id), rows.filter(({ m }) => mobIdx.has(m.id))])
    .filter(([i, rows]) => i && rows.length)
    .map(([i, rows]) => [i.ko || i.en, i.en, ITEM_PAGE_IDS.has(i.id) ? href(langPath(lang, itemPath(i))) : href(langPath(lang, `/tools/market/?item=${i.id}`)),
      rows.sort((a, b) => a.m.lv - b.m.lv).map(({ m, confidence }) => [mobIdx.get(m.id), confidence === 'repeated' ? 1 : 0]), i.id]);
  const examples = itemsData.items.filter((i) => DROP_INDEX.has(i.id) && priceOf(i)).sort((a, b) => (priceOf(b).n || 0) - (priceOf(a).n || 0)).slice(0, 4);
  return `<section class="panel drop-finder" id="drop-finder" aria-labelledby="df-title">
<h2 id="df-title">${ko ? '이 아이템, 어떤 몬스터가 떨어뜨려요?' : 'Which monster drops it?'}</h2>
<label class="df-search">${ko ? '아이템 이름' : 'Item name'}<input type="search" id="df-q" autocomplete="off" placeholder="${ko ? '예: 장갑 공격력 주문서, 미스릴 원석' : 'e.g. Gloves Attack Scroll, Mithril Ore'}"></label>
<p class="df-examples">${examples.map((i) => `<button type="button" class="chip" data-q="${esc(itemName(lang, i))}">${esc(itemName(lang, i))}</button>`).join('')}</p>
<div id="df-results" aria-live="polite"></div>
<p class="muted small">${ko ? '몬스터 목록은 플레이어 제보예요. 드롭 확률은 서버에만 있어 공개되지 않아요.' : 'Monster lists come from player reports. Drop rates live on the server and are not published.'} <a href="${href(langPath(lang, '/monsters/'))}">${ko ? '몬스터 도감' : 'Monster database'}</a> · <a href="${href(langPath(lang, '/bosses/'))}">${ko ? '보스 드롭' : 'Boss drops'}</a></p>
${jsonScript('drop-index', { items, mobs: mobs.map((m) => [m.ko || m.en, m.en, m.lv, href(langPath(lang, monsterPath(m))), m.id]),
  t: ko ? { more: '외 {n}종', none: '그 이름으로 드롭 제보가 있는 아이템이 없어요. 더 짧게 검색해 보세요.', repeated: '반복 제보', found: '{n}개 아이템' } : { more: '+{n} more', none: 'No reported drops for that name. Try a shorter name.', repeated: 'Repeated reports', found: '{n} items' } })}
</section>`;
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
${dropFinder(lang)}
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
${drops.entries.length
  ? `<p class="muted">${esc(t.dbLead)}</p>
<input id="db-search" class="search-small" type="search" placeholder="${esc(t.dbSearch)}" aria-label="${esc(t.dbSearch)}">
<div class="table-wrap"><table class="data clickable" id="drop-db"><thead><tr><th>${t.colMob}</th><th>${t.colItem}</th><th>${t.colRate}</th><th>${t.colSource}</th><th>${t.colNote}</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted small">${t.dataUpdated}: ${esc(drops.updated)}</p>`
  : // An empty table read as a broken feature; until a sourced rate exists, point to where drop lists live and to the calculator.
    `<p>${lang === 'ko' ? `아직 출처가 확인된 몬스터 드롭률은 없어요. 대신 <a href="${href(langPath(lang, '/monsters/'))}">몬스터 도감</a>에서 몬스터 ${MONSTERS.monsters.length}종의 드롭 아이템 목록을 볼 수 있어요. 다른 곳에서 확인한 확률을 위 계산기에 넣으면 몇 마리를 잡아야 하는지 바로 나와요.` : `No sourced monster drop rates yet. The <a href="${href(langPath(lang, '/monsters/'))}">monster database</a> lists the reported drops of ${MONSTERS.monsters.length} monsters; put a rate you trust into the calculator above to see how many kills it takes.`}</p>
<h3>${lang === 'ko' ? '파밍하러 많이 가는 몬스터의 드롭 목록' : 'Drop lists of monsters players farm'}</h3>
<ul class="monster-routes">${MONSTERS.monsters.filter((m) => MONSTER_NOTES.notes[m.id]?.drops?.length).sort((a, b) => a.lv - b.lv).slice(0, 12).map((m) => `<li><a href="${href(langPath(lang, monsterPath(m)))}#monster-drops"><img class="mob-sprite" src="${href(`/assets/monsters/${m.id}.gif`)}" width="32" height="32" alt="" loading="lazy"><strong>${esc(monsterName(m, lang))}</strong><small>Lv. ${m.lv}</small></a></li>`).join('')}</ul>`}
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

// Worked example under the calculator, computed with the same functions the page runs, so the numbers can't drift from the tool.
function damageGuide(lang) {
  const w = { weapon: '1h_sword', stats: { str: 132, dex: 30, int: 4, luk: 4 }, watk: 47 };
  const boar = readJson('data/mobs.json').mobs.find((m) => m.en === 'Fire Boar');
  const skill = (id) => DMG_SKILLS.find((s) => s.id === id);
  const r0 = dmgWindow({ ...w, mastery: 0 });
  const r10 = dmgWindow({ ...w, mastery: 10 });
  const ps = dmgHit({ ...w, mastery: 10, skill: skill('power_strike'), mob: { wdef: 0, mdef: 0 } });
  const psBoar = dmgHit({ ...w, mastery: 10, skill: skill('power_strike'), mob: boar });
  const kill = dmgKill(psBoar, 1, boar.hp);
  const mage = { weapon: 'wand', stats: { str: 4, dex: 4, int: 200, luk: 40 }, magic: 150, mastery: 0 };
  const ice = dmgHit({ ...mage, skill: skill('cold_beam'), mob: boar });
  const fire = dmgHit({ ...mage, skill: skill('fire_arrow'), mob: boar });
  const acc = dmgAccNeed(30, boar);
  const boarName = lang === 'ko' ? boar.ko : boar.en;
  const v = (n) => n.toLocaleString(lang);
  return lang === 'ko'
    ? `<section class="wrap prose guide">
<h2>몇 방 컷 모델 계산 예시</h2><p>아래 수치는 입력 조건에 따른 계산 예시예요. 현재 패치에서의 사냥 실측이나 추천 레벨이 아니에요.</p>
<h3>스탯창 공격력 범위가 출발점이에요</h3>
<p>스탯창에 보이는 공격력 범위(예: 137~172)에는 무기 공격력, 주문서, 장갑, 마스터리가 모두 들어 있어요. 계산기는 이 두 숫자와 주 스탯을 거꾸로 풀어 무기 공격력과 마스터리 레벨을 구하고, 그 값으로 모든 스킬의 데미지를 다시 계산해요. 그래서 장비를 하나하나 입력하지 않아도 돼요.</p>
<h3>예시: 30레벨 전사, STR 132 · DEX 30, 글라디우스(공격력 47)</h3>
<ul>
<li>마스터리 0일 때 스탯창 범위는 <strong>${v(Math.trunc(r0.min))}~${v(Math.trunc(r0.max))}</strong>, 소드 마스터리 20(공식상 10레벨)을 찍으면 최소값이 올라가 <strong>${v(Math.trunc(r10.min))}~${v(Math.trunc(r10.max))}</strong>가 돼요.</li>
<li>파워 스트라이크(260%)는 방어력이 없는 대상에게 한 방에 <strong>${v(ps.min)}~${v(ps.max)}</strong>예요.</li>
<li>${boarName}(${boar.lv}레벨, HP ${v(boar.hp)}, 물리 방어 ${boar.wdef})에게는 방어력만큼 줄어 <strong>${v(psBoar.min)}~${v(psBoar.max)}</strong>, 모든 공격이 명중하고 모델 가정이 맞을 때 최저값 기준 <strong>${kill.sure}방</strong>으로 계산돼요.</li>
<li>30레벨 캐릭터가 ${boarName}를 100% 맞히려면 명중률이 <strong>${acc}</strong> 필요해요. 명중이 모자라면 계산된 횟수보다 더 때리게 돼요.</li>
</ul>
<h3>속성은 1.25배, 0.75배, 0배</h3>
<p>${boarName}는 불에 강하고 얼음에 약해요. INT 200, 마력 150인 법사라면 콜드 빔은 <strong>${v(ice.min)}~${v(ice.max)}</strong>, 파이어 애로우는 <strong>${v(fire.min)}~${v(fire.max)}</strong>예요. 스킬 계수는 파이어 애로우가 더 높은데도 오히려 약해요. 사냥터를 고를 때 몬스터 속성을 꼭 같이 보세요.</p>
<h3>최저값 기준과 평균</h3><p>각각 모델의 최소 데미지와 중간값으로 계산한 횟수예요. 빗나감과 이동, 크리티컬·추가타 등이 반영되지 않아 실제 처치 횟수·시간과 다를 수 있어요. 이 값으로 시간당 경험치나 흑자를 보장하지 않아요.</p>
<h3>계산 공식</h3>
<p>무기 공격은 최대 = 스킬 % × 공격력 × (1 + (주 스탯 × 무기 계수 + 보조 스탯) / 100), 최소는 같은 식에서 주 스탯에 마스터리 계수((마스터리 레벨 / 10 + 0.1) × 0.7)를 곱하고 기본값 0.8을 써요. 마법은 마력 × (1 + INT / 125)가 최대예요. 몬스터 방어력은 100 / (방어력 + 100)을 곱해요. 공개된 커뮤니티 계산 모델을 사용해요. 테스트는 모델과 예시의 계산 일치 여부를 확인하며, 실제 게임의 모든 스킬·상황을 검증하지는 않아요.</p>
</section>`
    : `<section class="wrap prose guide">
<h2>Hits-to-kill model examples</h2><p>These are conditional calculations, not live-game measurements or recommended levels.</p>
<h3>Your stat window range is the starting point</h3>
<p>The attack range in your stat window (say 137-172) already includes weapon attack, scrolls, gloves and mastery. The calculator solves that range and your main stat backwards for weapon attack and mastery level, then recomputes every skill from them, so you never have to enter your gear piece by piece.</p>
<h3>Example: level 30 warrior, 132 STR, 30 DEX, Gladius (47 attack)</h3>
<ul>
<li>With no mastery the stat window shows <strong>${v(Math.trunc(r0.min))}-${v(Math.trunc(r0.max))}</strong>; Sword Mastery 20 (mastery level 10 in the formula) raises the floor to <strong>${v(Math.trunc(r10.min))}-${v(Math.trunc(r10.max))}</strong>.</li>
<li>Power Strike (260%) hits a target with no defence for <strong>${v(ps.min)}-${v(ps.max)}</strong>.</li>
<li>Against ${boarName} (level ${boar.lv}, ${v(boar.hp)} HP, ${boar.wdef} weapon defence) that drops to <strong>${v(psBoar.min)}-${v(psBoar.max)}</strong>, giving a model estimate of <strong>${kill.sure} hits</strong> with minimum rolls and no misses.</li>
<li>Hitting ${boarName} every time at level 30 takes <strong>${acc} accuracy</strong>. Below that you miss and need more swings than the table shows.</li>
</ul>
<h3>Elements: ×1.25, ×0.75 or ×0</h3>
<p>${boarName} resists fire and is weak to ice. A mage with 200 INT and 150 magic hits it for <strong>${v(ice.min)}-${v(ice.max)}</strong> with Cold Beam but only <strong>${v(fire.min)}-${v(fire.max)}</strong> with Fire Arrow, even though Fire Arrow has the higher skill power. Check a map's monster elements before you pick it.</p>
<h3>Minimum rolls and average</h3><p>These use the model’s minimum or midpoint damage. Misses, movement, crits and extra attacks can change actual kill counts and time. Neither establishes hourly EXP or profitability.</p>
<h3>The formulas</h3>
<p>Weapon attacks: max = skill % × attack × (1 + (main stat × weapon multiplier + secondary stat) / 100); the min uses 0.8 as the base and multiplies the main stat by the mastery factor ((mastery level / 10 + 0.1) × 0.7). Spells max out at magic × (1 + INT / 125). Monster defence multiplies by 100 / (defence + 100). These use a published community model. Tests check calculations against an example; they do not validate every skill and live-game situation.</p>
</section>`;
}

// How the live market numbers are made, matching the rules in worker/src/index.js.
function marketGuide(lang) {
  const tr = (ko,en) => lang === 'ko' ? ko : en;
  return `<section class="wrap prose guide"><details><summary>${tr('시세와 매물은 어떻게 집계하나요?','How are listings and prices calculated?')}</summary>
<h3>${tr('아이템 시세와 전체 매물','Item prices and all listings')}</h3><p>${tr('아이템 시세는 최근 7일간 확인한 상점 매물을 아이템별로 모아 한 줄씩 보여 줘요. 아이템을 누르면 지금 파는 곳이 열려요. 판매 중 매물은 24시간 안에 확인한 기록이며 실제 재고를 보장하지 않아요. 판매자·채널·방으로 찾거나 이전 기록을 보려면 전체 매물을 쓰세요.','Item prices groups the shop listings seen in the last 7 days into one row per item; open an item to see where it is for sale now. Asking listings were seen within 24 hours and may no longer be in stock. Use All listings to search by seller, channel or room, or to see older records.')}</p>
<h3>${tr('가격과 매물 수의 기준','Prices and listing counts')}</h3><p>${tr('목록의 중앙값과 최저가는 최근 판매 중 매물 기준이에요. 높은 가격도 실제 매물 목록에서 숨기지 않아요. 판매 완료 표시는 관측된 상태이며 실제 체결을 보증하지 않아요. 가격 제보를 판매 상점 수나 재고에 합산하지 않아요.','Directory medians and lowest asks use recent asking listings. High asking prices remain visible. Sold is an observed status, not a verified transaction. Anonymous reports are not counted as shop inventory.')}</p>
<h3>${tr('가격 추이와 매물대','Price trends and depth')}</h3><p>${tr('가격 추이는 저장된 관측 이력을 사용해요. 동일 매물을 다시 관측한 것은 새로운 거래가 아니에요. 매물대는 현재 판매 중인 매물 행을 한 번씩 세며 묶음 수량이나 누적 관측 횟수로 부풀리지 않아요. 관측이 없는 구간은 비워 둡니다. 목록은 60초마다 확인하며 선택한 아이템과 필터는 유지해요.','Trends use retained observations. Seeing the same listing again is not a new trade. Depth counts each current asking listing once, rather than summing bundle quantities or repeat observations. Missing intervals remain empty. The directory checks for updates every 60 seconds while preserving your selection and filters.')}</p></details></section>`;
}

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
    mid: tierName(lang, mid),
    midRate: mid.success,
    gain: std.gains.intermediate,
    expPass: nf.format(n * pm),
    expGain: nf.format(n * pm * std.gains.intermediate),
    all: pct(pm ** n, lang),
    five: pct(atLeast(n, pm, 5), lang),
    great: tierName(lang, great),
    greatRate: great.success,
    greatOne: pct(1 - (1 - pg) ** n, lang),
    chaos: tierName(lang, chaos),
    boom: pct(boom, lang),
    survive3: pct((1 - boom) ** 3, lang)
  };
  return lang === 'ko'
    ? `<section class="prose guide">
<h2>주문서 확률, 이렇게 계산해요</h2><p>아래는 자료의 기본값을 사용한 수학적 예시예요. 실제 아이템 효과와 슬롯 규칙을 검증한 결과는 아니에요.</p>
<h3>성공 횟수는 이항분포를 따라요</h3>
<p>각 주문서 시도가 독립이고 성공률이 일정하다고 가정해요. 이때 성공률 p인 주문서를 n장 바를 때 정확히 k번 성공할 확률은 C(n, k) × pᵏ × (1 − p)ⁿ⁻ᵏ예요. 위 계산기의 분포 그래프가 이 값을 그린 거예요.</p>
<h3>예시: ${v.mid} ${v.midRate}% 주문서 ${v.n}장</h3>
<p>기본 상승치(+${v.gain})짜리 ${v.mid} 주문서 ${v.n}장을 바르면 평균 성공 횟수는 <strong>${v.expPass}번</strong>, 평균 상승치는 <strong>+${v.expGain}</strong>이에요. 하지만 ${v.n}장이 모두 붙을 확률은 <strong>${v.all}</strong>뿐이고, 5장 이상 붙을 확률은 ${v.five}예요. "평균"과 "내가 원하는 결과가 나올 확률"은 꽤 다르다는 걸 알 수 있어요.</p>
<h3>${v.great} ${v.greatRate}%는 몇 장이면 붙을까?</h3>
<p>${v.great} 주문서 ${v.n}장을 바르면 한 번이라도 붙을 확률은 ${v.greatOne}예요. 성공률이 낮은 주문서는 평균보다 "0번 성공"이 나올 확률을 먼저 확인하세요.</p>
<h3>${v.chaos} 주문서와 파괴 확률</h3>
<p>표에 따르면 ${v.chaos} 주문서는 실패하면 50% 확률로 아이템이 파괴돼요. 그래서 한 장을 바를 때 파괴될 확률은 (1 − 성공률) × 50% = <strong>${v.boom}</strong>이고, 3장을 연달아 발라도 아이템이 살아남을 확률은 ${v.survive3}예요. 소중한 아이템이라면 계산기의 파괴 확률을 꼭 확인하세요.</p>
</section>`
    : `<section class="prose guide">
<h2>How scroll odds are calculated</h2><p>These mathematical examples use the preset data; they do not validate current item effects or slot rules.</p>
<h3>Passes follow a binomial distribution</h3>
<p>The model assumes independent rolls with a fixed success rate. For n scrolls with success rate p, the chance of exactly k passes is C(n, k) × pᵏ × (1 − p)ⁿ⁻ᵏ. The distribution chart in the calculator above plots exactly this.</p>
<h3>Example: ${v.n} ${v.mid} ${v.midRate}% scrolls</h3>
<p>Applying ${v.n} standard (+${v.gain}) ${v.mid} scrolls averages <strong>${v.expPass} passes</strong> and <strong>+${v.expGain}</strong>. Yet the chance all ${v.n} pass is only <strong>${v.all}</strong>, and 5 or more pass ${v.five} of the time. The average and the odds of the result you want are very different things.</p>
<h3>How many ${v.great} ${v.greatRate}% scrolls until one passes?</h3>
<p>With ${v.n} ${v.great} scrolls, the chance of at least one pass is ${v.greatOne}. For low-rate scrolls, check the odds of zero passes before the average.</p>
<h3>${v.chaos} scrolls and boom risk</h3>
<p>Per the table, a failed ${v.chaos} scroll destroys the item 50% of the time. So each scroll booms with probability (1 − success) × 50% = <strong>${v.boom}</strong>, and an item survives three in a row only ${v.survive3} of the time. Check the boom chance in the calculator before scrolling anything you care about.</p>
</section>`;
}

const prose = (h1, body) => `<article class="wrap prose"><h1>${h1}</h1>${body.replaceAll('{issues}', issuesUrl)}</article>`;

// Contact, sponsorship and support: one page for bug reports, ad or partnership enquiries, and tips. Tip platforms come
// from site.config.json "support" (ko-fi, toss.me…) and are shown only once a link is set.
function contactBody(lang) {
  const ko = lang === 'ko';
  const tr = (k, e) => (ko ? k : e);
  const mail = (subject) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  const support = Object.entries(config.support || {}).filter(([, url]) => url);
  const NAMES = { kofi: tr('커피 한 잔 사 주기 (Ko-fi)', 'Buy me a coffee (Ko-fi)'), buymeacoffee: 'Buy Me a Coffee', toss: tr('토스로 후원', 'Toss (Korea)'), patreon: 'Patreon' };
  return `<article class="wrap prose contact-page"><h1>${tr('문의·협찬·후원', 'Contact, sponsorship and support')}</h1>
<p>${tr('GMS Hub는 한 사람이 운영하는 비공식 팬 사이트예요. 아래 중 맞는 창구로 연락 주세요. 보통 2~3일 안에 답장드려요.', 'GMS Hub is an unofficial fan site run by one person. Pick the channel that fits below; replies usually take two or three days.')}</p>
<div class="contact-grid">
<section class="panel contact-card"><h2>${tr('오류 제보·데이터 수정', 'Bug reports and data fixes')}</h2>
<p>${tr('가격·드롭·사냥터 정보가 틀렸거나 페이지가 깨졌다면 알려 주세요. 어느 페이지의 무엇인지 적어 주시면 빨리 고칠 수 있어요.', 'Wrong prices, drops or training spots, or a broken page: tell us which page and what is wrong.')}</p>
<p class="contact-actions"><a class="btn small-btn" href="${mail(tr('[GMS Hub] 오류 제보', '[GMS Hub] Bug report'))}">${tr('메일로 제보', 'Report by email')}</a><a class="btn ghost small-btn" href="${issuesUrl}" target="_blank" rel="noopener">${tr('GitHub에 남기기', 'Open a GitHub issue')}</a></p></section>
<section class="panel contact-card"><h2>${tr('광고·협찬·제휴 문의', 'Advertising, sponsorship and partnerships')}</h2>
<p>${tr('게임 관련 서비스·커뮤니티·크리에이터의 배너, 소개, 링크 제휴를 받아요. 회사·채널 이름, 원하는 노출 위치와 기간, 예산을 적어 주세요. 게임 규칙에 어긋나는 서비스(매크로, 계정·아이템 현금 거래 등)는 받지 않아요.', 'Banners, features and link partnerships for game-related services, communities and creators. Tell us who you are, where and how long you want to appear, and your budget. We do not take anything against the game rules (bots, real-money trading of accounts or items).')}</p>
<p class="contact-actions"><a class="btn small-btn" href="${mail(tr('[GMS Hub] 광고·협찬 문의', '[GMS Hub] Sponsorship enquiry'))}">${tr('협찬 문의 메일 쓰기', 'Email a sponsorship enquiry')}</a></p></section>
<section class="panel contact-card"><h2>${tr('사이트 후원', 'Support the site')}</h2>
<p>${tr('서버와 데이터 수집 비용은 광고와 후원으로 충당해요. 도움이 됐다면 커피 한 잔 값으로 응원해 주세요. 후원은 기능이나 혜택과 상관없는 순수한 응원이에요.', 'Servers and data collection are paid for by ads and tips. If the site helped you, a coffee keeps it going. Tips are thanks only; they do not unlock anything.')}</p>
${support.length ? `<p class="contact-actions">${support.map(([k, url]) => `<a class="btn small-btn" href="${esc(url)}" target="_blank" rel="noopener" data-support="${esc(k)}">${esc(NAMES[k] || k)}</a>`).join('')}</p>` : `<p class="muted">${tr('후원 링크를 준비하고 있어요. 그전에는 메일로 연락 주세요.', 'Tip links are on the way; until then, email us.')}</p>`}</section>
</div>
<p class="contact-mail">${tr('메일 주소', 'Email')}: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> <button type="button" class="btn ghost small-btn" data-copy="${CONTACT_EMAIL}">${tr('주소 복사', 'Copy address')}</button> <span class="share-status" role="status"></span></p>
<p class="muted small">${tr('GMS Hub는 넥슨과 관계없는 팬 사이트예요. 게임 계정·결제 문의는 넥슨 고객센터로 해 주세요.', 'GMS Hub is not affiliated with Nexon. For game account or payment issues, contact Nexon support.')}</p>
</article>`;
}

// ---------- guides ----------

const guidePath = (g) => `/guides/${g.slug}/`;
const fmtDate = (d) => d.replaceAll('-', '. ') + '.';

// Every guide ends with links to the other guides, so a reader from search can keep going.
const GUIDE_T = {
  ko: { toolsChip: '같이 쓰는 도구', toolsHeading: '이 글과 같이 쓰는 도구', more: '다른 가이드', sources: '참고한 자료', byline: (g) => `GMS Hub 작성 · 처음 쓴 날 ${fmtDate(g.published)} · 수정 ${fmtDate(g.updated)}`,
    note: '장비와 패치에 따라 처치 타수와 비용이 달라질 수 있어요. 잘못된 내용은 {mail}이나 {issues}로 알려 주세요.', issues: 'GitHub 이슈',
    indexH1: '글클메 가이드', indexLead: '시작 준비부터 직업별 육성, 퀘스트와 거래까지. 필요한 단계의 가이드를 골라 보세요.',
    indexTitle: '글클메 가이드 모음 | GMS Hub', indexDesc: '글로벌 클래식 메이플 직업별 육성, 사냥 동선, 퀘스트와 시세 이용 가이드.' },
  en: { toolsChip: 'Tools for this guide', toolsHeading: 'Tools to use with this guide', more: 'More guides', sources: 'Sources', byline: (g) => `By GMS Hub · Published ${g.published} · Updated ${g.updated}`,
    note: 'Gear and patches can change kill thresholds and costs. Report corrections to {mail} or on {issues}.', issues: 'GitHub issues',
    indexH1: 'MapleStory Classic World Guides', indexLead: 'Getting started, class progression, quests and market tools. Choose the guide for your next step.',
    indexTitle: 'Classic World Class, Quest and Training Guides | GMS Hub', indexDesc: 'Class progression, training conditions, quest routes, supply costs and market tools.' }
};
// A guide written in both languages gets hreflang links and a language switch to its twin; a single-language guide has none.
const guideBoth = (slug) => LANGS.every((l) => guides.some((g) => g.slug === slug && g.lang === l));
const related = (g) => {
  const others = publishedGuides.filter((o) => o.lang === g.lang && o.slug !== g.slug);
  return others.length
    ? `<h2>${GUIDE_T[g.lang].more}</h2>\n<ul class="sources">${others.map((o) => `<li><a href="${href(langPath(o.lang, guidePath(o)))}">${esc(o.h1)}</a></li>`).join('')}</ul>`
    : '';
};

// Search visitors who land on a guide tend to leave without clicking anything, so each guide names the tools it pairs with
// (guides.json "tools"): a row of links under the byline and full cards after the article.
const guideTool = (lang, key) => {
  const t = T[lang];
  return {
    training: ['/tools/training/', 'sword', t.navTraining, t.trCardDesc],
    damage: ['/tools/damage/', 'hammer', DMG[lang].h1, DMG[lang].cardDesc],
    scroll: ['/tools/scroll/', 'scroll', t.navScroll, t.scCardDesc],
    'drop-rate': ['/tools/drop-rate/', 'bag', t.navDrop, t.dropCardDesc],
    market: ['/tools/market/', 'coin', t.navMarket, MK[lang].lead],
    price: ['/tools/price/', 'coin', t.navPrice, PR[lang].cardDesc],
    scan: ['/tools/scan/', 'megaphone', SCAN[lang].h1, SCAN[lang].cardDesc]
  }[key];
};
const guideToolChips = (g) =>
  (g.tools || []).length
    ? `<p class="guide-tools">${GUIDE_T[g.lang].toolsChip} ${g.tools
        .map((k) => guideTool(g.lang, k))
        .map(([p, icon, label]) => `<a href="${href(langPath(g.lang, p))}">${spriteSvg(icon, 18)}${esc(label)}</a>`)
        .join('')}</p>`
    : '';
const guideToolCards = (g) =>
  (g.tools || []).length
    ? `<h2>${GUIDE_T[g.lang].toolsHeading}</h2>\n<div class="tool-cards">${g.tools
        .map((k) => guideTool(g.lang, k))
        .map(
          ([p, icon, label, desc]) =>
            `<a class="tool-card" href="${href(langPath(g.lang, p))}">${spriteSvg(icon, 44)}<strong>${esc(label)}</strong><p>${esc(desc)}</p><span>${T[g.lang].open}</span></a>`
        )
        .join('')}</div>`
    : '';

// AdFit sizes and unit IDs stay as issued. The shared loader removes ineligible units before loading the SDK once.
const adfitIns = (unit, w, h, minWidth = 0, maxWidth = 99999) =>
  unit
    ? `<ins class="kakao_ad_area" style="display:none" data-ad-unit="${esc(unit)}" data-ad-width="${w}" data-ad-height="${h}" data-min="${minWidth}" data-max="${maxWidth}"></ins>`
    : '';
function adfitSlot(where = 'end') {
  const { railLeft, railRight } = config.adfit || {};
  const { mobile, pc } = where === 'top' ? { mobile: config.adfit?.topMobile, pc: config.adfit?.topPc } : config.adfit || {};
  if (!mobile && !pc) return '';
  // The end slot leaves wide screens to the side rails; the top slot shows at every width.
  const maxWidth = where === 'end' && (railLeft || railRight) ? 1599 : 99999;
  return `<aside class="ad-slot${where === 'top' ? ' ad-slot-top' : ''}" data-ad-placement aria-label="Advertisement"><span class="ad-label">ADVERTISEMENT</span>
${adfitIns(mobile, 320, 100, 320, pc ? 759 : maxWidth)}${adfitIns(pc, 728, 90, 760, maxWidth)}</aside>`;
}

// Skyscrapers in the empty gutters beside the 1200px layout, pinned next to the purpose section (not following the scroll);
// only screens wide enough to fit them without covering content get them.
function adfitRails() {
  const { railLeft, railRight } = config.adfit || {};
  if (!railLeft && !railRight) return '';
  const rail = (unit, side) =>
    unit ? `<div class="ad-rail ad-rail-${side}" data-ad-placement><span class="ad-label">ADVERTISEMENT</span>${adfitIns(unit, 160, 600, 1600)}</div>` : '';
  return `<aside class="ad-rails" aria-label="Advertisement">${rail(railLeft, 'left')}${rail(railRight, 'right')}
</aside>`;
}

function guideBody(g) {
  if (g.status === 'withheld') return `<article class="wrap prose guide-article"><p class="crumbs"><a href="${href(langPath(g.lang, '/guides/'))}">${T[g.lang].navGuides}</a></p><h1>${esc(g.h1)}</h1><section class="panel tr-review-note"><h2>${g.lang === 'ko' ? '자료 재검증 중 · 기존 안내 비공개' : 'Under review · previous advice withheld'}</h2><p>${esc(g.reviewReason)}</p><p>${g.lang === 'ko' ? '잘못된 추천을 계속 노출하지 않도록 기존 본문을 내렸어요. 현재 버전의 원문과 플레이 조건을 확보한 뒤 다시 공개할 예정이에요.' : 'The earlier body has been withheld to avoid presenting unsupported advice. It requires current-version original evidence before republication.'}</p><small>2026-11-10</small></section>${related(g)}</article>`;

  const toc = [];
  const body = g.body.replace(/<h2>(.*?)<\/h2>/g, (_,title) => { const id = `section-${toc.length+1}`; toc.push({id,title}); return `<h2 id="${id}">${title}</h2>`; })
    .replace(/<table>/g, '<div class="table-wrap"><table class="data">')
    .replace(/<\/table>/g, '</table></div>').replace('</p>', `</p>${AD_TOP}`);
  return `<article class="wrap prose guide-article">
<p class="crumbs"><a href="${href(langPath(g.lang, '/guides/'))}">${T[g.lang].navGuides}</a></p>
<h1>${esc(g.h1)}</h1>
<p class="byline">${GUIDE_T[g.lang].byline(g)}</p>
${guideToolChips(g)}
${toc.length > 2 ? `<nav class="guide-toc" aria-label="${g.lang==='ko'?'이 글의 순서':'On this page'}"><strong>${g.lang==='ko'?'이 글에서':'On this page'}</strong><ol>${toc.map(t=>`<li><a href="#${t.id}">${t.title}</a></li>`).join('')}</ol></nav>` : ''}
${body}
${guideToolCards(g)}
${related(g)}
<p class="muted">${GUIDE_T[g.lang].note.replace('{mail}', `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`).replace('{issues}', `<a href="${issuesUrl}" target="_blank" rel="noopener">${GUIDE_T[g.lang].issues}</a>`)}</p>
</article>`;
}

function guidesIndexBody(lang) {
  const items = publishedGuides
    .filter((g) => g.lang === lang)
    .map(
      (g) =>
        `<li><a href="${href(langPath(lang, guidePath(g)))}"><strong>${esc(g.h1)}</strong></a><p>${esc(g.desc)}</p><small class="muted">${fmtDate(g.updated)}</small></li>`
    )
    .join('');
  return `<article class="wrap prose"><h1>${GUIDE_T[lang].indexH1}</h1>
<p>${GUIDE_T[lang].indexLead}</p>
<ul class="guide-list">${items}</ul></article>`;
}

// ---------- write ----------

fs.rmSync(out, { recursive: true, force: true });
// ---------- item pages ----------
// One page per item, so "<item> 시세" searches land on that item. Prices come from data/item-prices.json (player scans only,
// refreshed by scripts/fetch-item-prices.mjs before each build); items with fewer than MIN_INDEX_LISTINGS recent listings stay noindex.
const itemPrices = fs.existsSync(path.join(root, 'data/item-prices.json')) ? readJson('data/item-prices.json') : { updated: '', prices: {} };
const PRICES_DATE = (itemPrices.updated || BUILD_DATE).slice(0, 10);
const itemSlug = (i) => `${i.id}-${i.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.replace(/-$/, '');
const itemPath = (i) => `/items/${itemSlug(i)}/`;
// Same headline rule as the worker: sales lead only with three or more of them (older snapshots may still say otherwise).
const headline = (p) => {
  if (!p) return null;
  const basis = p.sold?.n >= 3 ? 'sold' : p.selling ? 'selling' : p.sold ? 'sold' : 'buying';
  return p[basis] ? { ...p, basis, median: p[basis].median } : p;
};
const priceOf = (i) => headline(itemPrices.prices[i.id]);
const itemName = (lang, i) => (lang === 'ko' && i.ko ? i.ko : i.en);
const PRICED = itemsData.items.filter(priceOf);
// Google crawled the one- and two-listing pages and left them out ("crawled, not indexed"): a single shop price is too thin
// to stand as a page. Only items seen at least this often are indexable; the rest join automatically as scans pile up.
const MIN_INDEX_LISTINGS = 3;
// Items a monster drops also get a page (who drops it, where those monsters live, base stats): "who drops X" is how
// players, English-speaking ones above all, search for an item. Those count as indexable when a dropper is on a live map.
const ITEM_DETAILS = readJson('data/item-details.json').items;
const EQUIPMENT = collectEquipment({ items: itemsData.items, details: ITEM_DETAILS, dropIndex: DROP_INDEX, quests: QUESTS });
const ITEM_PAGES = itemsData.items.filter((i) => priceOf(i) || DROP_INDEX.has(i.id));
const ITEM_PAGE_IDS = new Set(ITEM_PAGES.map((i) => i.id));
const liveDrop = (i) => (DROP_INDEX.get(i.id) || []).some(({ m }) => m.status === 'active');
const INDEXABLE = ITEM_PAGES.filter((i) => (priceOf(i)?.n || 0) >= MIN_INDEX_LISTINGS || liveDrop(i));
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
    // With a price the title carries it, so the search result answers the question before the click.
    titlePrice: '{name} 시세 {median} 메소 ({date}) · 글클메 자유시장 | GMS Hub',
    desc: '{name} 글클메 자유시장 시세: {basis} 중앙값 {median} 메소 (최근 14일 매물 {n}건, {low}~{high}). 유저가 스캔한 상점 매물 기준이고, 7일 추이와 지금 파는 채널·방도 보여 줘요.',
    descNone: '{name} 글로벌 메이플 클래식 월드 아이템 정보 ({info}). 최근 14일 스캔 시세가 아직 없어요. 상점을 스캔하면 시세가 바로 쌓여요.',
    h1: '{name} 시세',
    lead: '글로벌 메이플스토리 클래식 월드 자유시장에서 유저들이 직접 스캔한 상점 매물로 계산한 시세예요.',
    basis: { sold: '거래가', selling: '판매가', buying: '구매가' },
    headline: '{basis} 중앙값 · 최근 14일',
    count: '매물 {n}건',
    range: '최저 {low} ~ 최고 {high}',
    unit: '메소',
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
    table: { price: '가격', qty: '묶음', seller: '판매자', where: '위치', seen: '본 시각' },
    indexTitle: '글클메 아이템 DB: 시세·드롭 몬스터·능력치 {n}개 | GMS Hub',
    indexDesc: '글로벌 메이플 클래식 월드 아이템 {n}개의 자유시장 시세, 드롭하는 몬스터, 기본 능력치를 분류별로 모았어요. 시세는 매일 갱신돼요.',
    indexH1: '아이템 DB',
    indexLead: '시세가 있는 아이템 {p}개와 몬스터가 드롭하는 아이템을 합쳐 {n}개예요. 아이템을 누르면 시세 추이, 드롭 몬스터, 능력치를 볼 수 있어요.',
    pricedH: '최근 시세가 있는 아이템',
    dropH: '드롭 아이템',
    titleDrop: '글클메 {name}: 드롭 몬스터·능력치·사냥 위치 | GMS Hub',
    descDrop: '{name} ({info}) 드롭 몬스터 {n}종과 그 몬스터가 나오는 맵, 기본 능력치를 정리했어요. 최근 시세가 있으면 함께 보여 줘요.',
    h1Drop: '{name}',
    leadDrop: '어떤 몬스터가 떨어뜨리는지, 어디서 잡는지, 기본 능력치는 얼마인지 정리했어요.',
    stats: { req: '착용 조건', job: '직업', slots: '업그레이드 가능 횟수', speed: '공격 속도', sell: '상점 판매가', base: '기본 능력치는 게임 클라이언트 데이터 기준이라 실제 아이템은 옵션이 다를 수 있어요.' },
    jobs: { 0: '공용', 1: '전사', 2: '마법사', 4: '궁수', 8: '도적', 16: '해적' },
    speeds: { 2: '매우 빠름', 3: '매우 빠름', 4: '빠름', 5: '빠름', 6: '보통', 7: '느림', 8: '느림', 9: '매우 느림' },
    incs: { STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK', MHP: 'HP', MMP: 'MP', PAD: '공격력', MAD: '마력', PDD: '물리 방어력', MDD: '마법 방어력', ACC: '명중률', EVA: '회피율', Speed: '이동 속도', Jump: '점프력' },
    farm: '주로 나오는 곳',
    indexLink: '아이템별 시세 모아 보기',
    pageLink: '이 아이템 시세 페이지',
    cats: { Equip: '장비', Use: '소비', Etc: '기타', Setup: '설치' }
  },
  en: {
    title: '{name} Price – MapleStory Classic World Free Market | GMS Hub',
    titlePrice: '{name} Price: {median} mesos ({date}) – MapleStory Classic World | GMS Hub',
    desc: '{name} price in MapleStory Classic World: {basis} median {median} mesos ({n} listings in 14 days, {low}–{high}). From Free Market shops players scanned, with a 7-day trend and where it is for sale now.',
    descNone: '{name} in MapleStory Classic World ({info}). No scanned price in the last 14 days yet; scanning a shop that sells it adds one right away.',
    h1: '{name} Price',
    lead: 'Prices from Free Market shops players scanned in Global MapleStory Classic World.',
    basis: { sold: 'sold', selling: 'asking', buying: 'buying' },
    headline: '{basis} median · last 14 days',
    count: '{n} listings',
    range: 'Low {low} – high {high}',
    unit: 'mesos',
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
    table: { price: 'Price', qty: 'Bundle', seller: 'Seller', where: 'Where', seen: 'Seen' },
    indexTitle: 'MapleStory Classic World Item Database: Prices, Drops & Stats ({n} items) | GMS Hub',
    indexDesc: '{n} MapleStory Classic World items with Free Market prices, the monsters that drop them and base stats, grouped by type. Prices refresh daily.',
    indexH1: 'Item database',
    indexLead: '{n} items: {p} with recent Free Market prices, plus every item a monster drops. Open one for its price trend, droppers and stats.',
    pricedH: 'Items with recent prices',
    dropH: 'Monster drops',
    titleDrop: '{name}: Who Drops It, Stats & Where to Farm – MapleStory Classic World | GMS Hub',
    descDrop: 'Which monsters drop {name} in MapleStory Classic World: {n} droppers, the maps they spawn on, and the item\'s base stats.',
    h1Drop: '{name}',
    leadDrop: 'Which monsters drop it, where to farm them, and its base stats.',
    stats: { req: 'Requirements', job: 'Class', slots: 'Upgrade slots', speed: 'Attack speed', sell: 'Sells to NPC for', base: 'Base stats come from the game client data; a real drop can roll different stats.' },
    jobs: { 0: 'All classes', 1: 'Warrior', 2: 'Magician', 4: 'Bowman', 8: 'Thief', 16: 'Pirate' },
    speeds: { 2: 'Very fast', 3: 'Very fast', 4: 'Fast', 5: 'Fast', 6: 'Normal', 7: 'Slow', 8: 'Slow', 9: 'Very slow' },
    incs: { STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK', MHP: 'HP', MMP: 'MP', PAD: 'Weapon attack', MAD: 'Magic attack', PDD: 'Weapon defense', MDD: 'Magic defense', ACC: 'Accuracy', EVA: 'Avoidability', Speed: 'Speed', Jump: 'Jump' },
    farm: 'Most common on',
    indexLink: 'Browse prices by item',
    pageLink: 'Item price page',
    cats: { Equip: 'Equip', Use: 'Use', Etc: 'Etc', Setup: 'Setup' }
  }
};

const subLabel = (lang, i) => (lang === 'ko' ? PR.ko.subs[i.sub] : i.sub) || IT[lang].cats[i.cat] || i.cat;
const itemInfoText = (lang, i) => [subLabel(lang, i), i.lv ? `Lv. ${i.lv}` : ''].filter(Boolean).join(' · ');
const itemInfoHtml = (lang, i) => [subLabel(lang, i), i.lv ? `Lv. ${i.lv}` : ''].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');

function itemDesc(lang, i) {
  const t = IT[lang];
  const p = priceOf(i);
  const name = itemName(lang, i);
  if (!p) return DROP_INDEX.has(i.id) ? fill(t.descDrop, { name, info: itemInfoText(lang, i), n: DROP_INDEX.get(i.id).length }) : fill(t.descNone, { name, info: itemInfoText(lang, i) });
  return fill(t.desc, { name, basis: t.basis[p.basis], median: mesoText(lang, p.median), n: p.n, low: mesoText(lang, p.low), high: mesoText(lang, p.high) });
}

// Monsters reported to drop this item (community reports, see the bestiary), available maps first, then by level.
function dropMonsters(lang, i) {
  const ko = lang === 'ko';
  const rows = (DROP_INDEX.get(i.id) || []).slice().sort((a, b) => (a.m.status === 'active' ? 0 : 1) - (b.m.status === 'active' ? 0 : 1) || a.m.lv - b.m.lv);
  if (!rows.length) return '';
  const status = (m) => m.status === 'active' ? '' : `<span class="monster-tag status-${m.status}">${m.status === 'upcoming' ? (ko ? '11/18 개방' : 'Opens Nov 18') : (ko ? '미개방' : 'Unreleased')}</span>`;
  return `<section class="panel item-drop-mobs"><h2>${ko ? '드롭하는 몬스터' : 'Dropped by'} <small class="muted">${rows.length}</small></h2>
<p class="muted note">${ko ? '유저 드롭 제보를 정리한 목록이에요. 반복 제보는 여러 사람이 확인한 항목이고, 드롭 확률은 확인되지 않았어요.' : 'From player drop reports. Repeated reports were confirmed by several people; drop rates are unknown.'}</p>
<ul class="monster-related">${rows.map(({ m, confidence }) => `<li><a href="${href(langPath(lang, monsterPath(m)))}"><img class="monster-sprite" src="${href(`/assets/monsters/${m.id}.gif`)}" width="64" height="64" alt="" loading="lazy"><span><strong>${esc(monsterName(m, lang))}</strong><small>Lv. ${m.lv} · HP ${new Intl.NumberFormat('en-US').format(m.hp)} · ${confidence === 'repeated' ? (ko ? '반복 제보' : 'Repeated reports') : (ko ? '제보 적음' : 'Limited reports')}</small>${status(m)}${farmMaps(lang, m)}</span></a></li>`).join('')}</ul></section>`;
}

// The two open maps with the most of this monster: where a player would actually go to farm the drop.
function farmMaps(lang, m) {
  const maps = (m.locations || []).filter((l) => l.availability === 'open').sort((a, b) => b.count - a.count).slice(0, 2);
  return maps.length ? `<small class="farm-maps">${IT[lang].farm}: ${maps.map((l) => `<span translate="no">${esc(lang === 'ko' ? l.ko || l.en : l.en)}</span>`).join('')}</small>` : '';
}

// Base stats from client data; only rows the item actually has.
function itemStats(lang, i) {
  const t = IT[lang];
  const d = ITEM_DETAILS[i.id];
  if (!d) return [];
  const rows = [];
  const req = d.req || {};
  const reqParts = [req.lv ? `Lv. ${req.lv}` : '', ...['str', 'dex', 'int', 'luk'].filter((k) => req[k]).map((k) => `${k.toUpperCase()} ${req[k]}`)].filter(Boolean);
  if (reqParts.length && i.cat === 'Equip') rows.push([t.stats.req, `<ul class="item-req">${reqParts.map((x) => `<li>${x}</li>`).join('')}</ul>`]);
  if (i.cat === 'Equip') rows.push([t.stats.job, req.job ? `<ul class="item-req">${Object.entries(t.jobs).filter(([b]) => b > 0 && req.job & b).map(([, n]) => `<li>${n}</li>`).join('')}</ul>` : t.jobs[0]]);
  for (const [k, v] of Object.entries(d.inc || {})) rows.push([t.incs[k] || k, `+${v}`]);
  if (d.speed) rows.push([t.stats.speed, `<span>${t.speeds[d.speed] || ''}</span><span>(${d.speed})</span>`]);
  if (d.slots) rows.push([t.stats.slots, `${d.slots}`]);
  if (d.sell) rows.push([t.stats.sell, `${mesoText(lang, d.sell)} ${t.unit}`]);
  return rows;
}

// Quests that ask for this item or hand it out: the main reason players look up etc. items.
function itemQuests(lang, i) {
  const ko = lang === 'ko';
  const need = QUESTS.filter((q) => !q.expired && q.bring.some((x) => x.id === i.id));
  const give = QUESTS.filter((q) => !q.expired && q.gets.some((x) => x.id === i.id));
  if (!need.length && !give.length) return '';
  const list = (qs) => `<ul class="monster-routes">${qs.slice(0, 12).map((q) => `<li><a href="${href(langPath(lang, questPath(q)))}"><strong>${esc(q.name)}</strong><small>${q.lv ? `<span>Lv. ${q.lv}</span>` : ''}<span>${esc(questArea(q.area, lang))}</span></small></a></li>`).join('')}</ul>`;
  return `<section class="panel">${need.length ? `<h2>${ko ? '이 아이템이 필요한 퀘스트' : 'Quests that need it'} <small class="muted">${need.length}</small></h2>${list(need)}` : ''}${give.length ? `<h2>${ko ? '보상으로 주는 퀘스트' : 'Quest rewards'} <small class="muted">${give.length}</small></h2>${list(give)}` : ''}</section>`;
}

// Same type first, then nearest level; only items with a page are linked.
function relatedItems(i) {
  return ITEM_PAGES
    .filter((x) => x.id !== i.id && x.cat === i.cat && (x.sub === i.sub || !i.sub))
    .sort((a, b) => Math.abs((a.lv || 0) - (i.lv || 0)) - Math.abs((b.lv || 0) - (i.lv || 0)) || a.id - b.id)
    .slice(0, 8);
}

const itemLink = (lang, i) => {
  const p = priceOf(i);
  return `<li><a href="${href(langPath(lang, itemPath(i)))}">${itemIcon(i.id, 24)}<span>${esc(itemName(lang, i))}</span><small>${p ? `${mesoText(lang, p.median)} · ${IT[lang].basis[p.basis]}` : itemInfoHtml(lang, i)}</small></a></li>`;
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
    [t.info.cat, `<span>${esc(IT[lang].cats[i.cat] || i.cat)}</span>${i.sub ? `<span>${esc(subLabel(lang, i))}</span>` : ''}`],
    i.lv ? [t.info.lv, `${i.lv}`] : null,
    lang === 'ko' ? [t.info.en, esc(i.en)] : i.ko ? [t.info.ko, esc(i.ko)] : null,
    [t.info.id, `${i.id}`],
    ...itemStats(lang, i)
  ].filter(Boolean);
  const dropOnly = !p && DROP_INDEX.has(i.id);
  const tools = [
    i.cat === 'Use' && /\bScroll\b/.test(i.en) ? `<a href="${href(langPath(lang, '/tools/scroll/'))}">${t.scrollTool}</a>` : '',
    i.cat === 'Equip' && WEAPON_SUB.test(i.sub || '') ? `<a href="${href(langPath(lang, '/tools/damage/'))}">${t.damageTool}</a>` : ''
  ].filter(Boolean);
  const external = PRICE_SITES.map((s) => `<a href="${esc(s.url.replace('{id}', i.id).replace('{en}', encodeURIComponent(i.en)))}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ');
  return `<section class="page-head wrap">
<p class="crumbs"><a href="${href(langPath(lang, '/tools/market/'))}">${T[lang].navMarket}</a><span aria-hidden="true"> › </span><a href="${href(langPath(lang, '/items/'))}">${t.indexH1}</a></p>
<span class="badge-game">${esc(T[lang].gameBadge)}</span>
<h1 class="item-title">${itemIcon(i.id, 40)}<span>${esc(fill(dropOnly ? t.h1Drop : t.h1, { name }))}${lang === 'ko' && i.ko ? `<small class="en-name">${esc(i.en)}</small>` : ''}</span></h1>
<p class="lead">${esc(dropOnly ? t.leadDrop : t.lead)}</p>
</section>
<div class="wrap item-page">
${dropOnly ? dropMonsters(lang, i) : ''}
<div class="item-grid">
<section class="panel item-price">${price}</section>
<section class="panel item-info"><h2>${t.infoH}</h2><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
${ITEM_DETAILS[i.id] && i.cat === 'Equip' ? `<p class="muted note">${t.stats.base}</p>` : ''}
${tools.length ? `<h3>${t.tools}</h3><p>${tools.join(' · ')}</p>` : ''}</section>
</div>
<section class="panel item-live"><h2>${t.liveH}</h2><p class="muted note">${t.liveNote}</p>
<div id="mk-charts"></div>
<h3>${t.open}</h3><div id="it-open" aria-live="polite"><p class="muted">${t.loading}</p></div>
<p><a class="btn small-btn" data-market-link href="${href(langPath(lang, `/tools/market/?item=${i.id}`))}">${t.market}</a></p></section>
${dropOnly ? '' : dropMonsters(lang, i)}
${itemQuests(lang, i)}
<section class="panel"><h2>${t.related}</h2><ul class="item-links">${relatedItems(i).map((x) => itemLink(lang, x)).join('')}</ul></section>
<p class="muted small">${t.method}</p>
<p class="muted small">${t.external}: ${external}</p>
</div>
${jsonScript('it-data', { lang, id: i.id, api: config.voteApi, t: { loading: t.loading, failed: t.failed, noData: t.noData, noOpen: t.noOpen, table: t.table } })}`;
}

function itemsIndexBody(lang) {
  const t = IT[lang];
  const n = ITEM_PAGES.length;
  const group = (list, sort) => ['Equip', 'Use', 'Etc', 'Setup']
    .map((cat) => [cat, list.filter((i) => i.cat === cat).sort(sort)])
    .filter(([, l]) => l.length);
  const section = (cat, list) => `<section class="panel"><h3>${t.cats[cat]} <small class="muted">${list.length}</small></h3><ul class="item-links">${list.map((i) => itemLink(lang, i)).join('')}</ul></section>`;
  const dropOnly = ITEM_PAGES.filter((i) => !priceOf(i));
  return `${pageHead(lang, 'coin', t.indexH1, fill(t.indexLead, { n, p: PRICED.length }))}
<div class="wrap item-page">
<h2>${t.pricedH}</h2>
${group(PRICED, (a, b) => priceOf(b).n - priceOf(a).n || a.id - b.id).map(([cat, list]) => section(cat, list)).join('\n')}
<h2>${t.dropH}</h2>
${group(dropOnly, (a, b) => (a.lv || 0) - (b.lv || 0) || a.id - b.id).map(([cat, list]) => section(cat, list)).join('\n')}
<p class="muted small">${t.method}</p>
</div>`;
}

const EN_PAGES = [];
const write = (rel, content) => {
  if (rel.startsWith('en/') && rel.endsWith('.html')) EN_PAGES.push([rel, content]);
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
      .map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: lang === 'ko' ? s.name : s.nameEn || s.name, url: s.url, description: s.desc[lang] }))
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
    home: { title: t.homeTitle, desc: t.homeDesc, body: homeBody(lang), modules: ['home.js', 'mega-trends.js'], ld: [websiteLd, directoryLd, faqLd] },
    training: {
      title: t.trTitle,
      desc: t.trDesc,
      body: trainingBody(lang),
      modules: ['training.js'],
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
      scripts: ['drop.js'], modules: ['drop-finder.js'],
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
    marketToday: {
      title: lang === 'ko' ? '오늘의 글클메 시세: 매물 많은 아이템·고확 인기 아이템 | GMS Hub' : "Today's MapleStory Classic World Prices: Most Listed and Most Megaphoned Items | GMS Hub",
      desc: lang === 'ko' ? '글로벌 메이플스토리 클래식 월드 자유시장에서 오늘 매물이 가장 많은 아이템과 시세, 최근 고확에 많이 나온 아이템을 매일 정리해요.' : 'Daily MapleStory Classic World Free Market report: the most listed items with their asking prices, and the items named most in recent megaphones.',
      body: marketTodayBody(lang),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '오늘의 글클메 시세' : "Today's prices", '/tools/market/today/')]
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
      modules: ['price.js'],
      ld: [appLd(PR[lang].h1, PR[lang].desc, '/tools/price/'), breadcrumbLd(lang, PR[lang].h1, '/tools/price/')]
    },
    about: { title: t.aboutTitle, desc: t.aboutDesc, body: prose(t.aboutH1, t.aboutBody), ld: [breadcrumbLd(lang, t.aboutH1, '/about/')] },
    privacy: { title: t.privacyTitle, desc: t.privacyDesc, body: prose(t.privacyH1, t.privacyBody) },
    terms: { title: t.termsTitle, desc: t.termsDesc, body: prose(t.termsH1, t.termsBody) },
    contact: {
      title: lang === 'ko' ? '문의·협찬·후원 | GMS Hub' : 'Contact, sponsorship and support | GMS Hub',
      desc: lang === 'ko' ? 'GMS Hub 오류 제보, 광고·협찬·제휴 문의, 사이트 후원 창구예요.' : 'Report a bug, ask about advertising or partnerships, or support GMS Hub.',
      body: contactBody(lang),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '문의·협찬·후원' : 'Contact', '/contact/')]
    }
  };

  const bandDef = (band) => {
    const spots = bandSpots(band);
    const vars = { a: band[0], b: band[1], n: spots.length, maps: spots.slice(0, 3).map((s) => s.map).join(', ') };
    const h1 = fill(t.trBandH1, vars);
    return {
      title: fill(t.trBandTitle, vars),
      desc: fill(t.trBandDesc, vars),
      body: trainingBandBody(lang, band),
      noindex: !spots.length,
      ld: [breadcrumbLd(lang, h1, bandPath(band))]
    };
  };

  const classDef = (cls) => {
    const rows = classRoutes(cls);
    const name = lang === 'ko' ? cls.ko : cls.en;
    const top = Math.max(...rows.map((r) => r.level.max));
    const h1 = lang === 'ko' ? `${name} 사냥터` : `${name} training routes`;
    return {
      title: lang === 'ko' ? `글클메 ${name} 사냥터 추천: 레벨별 ${rows.length}곳 (1~${top}) | GMS Hub` : `MapleStory Classic World ${name} Training Routes by Level (1–${top}) | GMS Hub`,
      desc: lang === 'ko' ? `글로벌 메이플스토리 클래식 월드 ${name} 레벨별 사냥터 ${rows.length}곳. 진입 레벨, 잡을 몬스터와 필요 명중, 물약 비용, 다음 이동 시점을 정리했어요.` : `${name} training in MapleStory Classic World: ${rows.length} routes by level with entry conditions, monsters and the accuracy they need, supply costs and what to do next.`,
      body: trainingClassBody(lang, cls),
      ld: [breadcrumbLd(lang, h1, classPath(cls))]
    };
  };

  for (const p of PAGES) {
    const def = p.band ? bandDef(p.band) : p.cls ? classDef(p.cls) : defs[p.key];
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
        only: LANGS.every((l) => guides.some((g) => g.lang === l)) ? undefined : lang,
        title: GUIDE_T[lang].indexTitle,
        desc: GUIDE_T[lang].indexDesc,
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
        only: guideBoth(g.slug) ? undefined : lang,
        title: `${g.title} | GMS Hub`,
        desc: g.desc,
        body: guideBody(g),
        noindex: g.status !== 'published',
        ld: g.status === 'published' ? [articleLd, breadcrumbLd(lang, g.h1, guidePath(g))] : []
      })
    );
  }

  const monsterTitle = lang === 'ko' ? '몬스터 도감' : 'Monster database';
  const monsterItemUrl = (d, l) => {
    const item = ITEM_PAGE_IDS.has(d.itemId) && ITEM_PAGES.find(i => i.id === d.itemId);
    return href(langPath(l, item ? itemPath(item) : `/tools/market/?item=${d.itemId}`));
  };
  write(path.join(lang, 'monsters', 'index.html'), page({
    lang, pageKey: 'monsters', pagePath: '/monsters/', title: lang === 'ko' ? '글클메 몬스터 DB: 드롭 아이템·체력·출현 위치 | GMS Hub' : 'MapleStory Classic World Monster Database: Drops, HP & Locations | GMS Hub',
    desc: lang === 'ko' ? `글로벌 메이플스토리 클래식 월드 몬스터 ${MONSTERS.monsters.length}종의 체력, 경험치, 드롭 아이템, 출현 위치, 필요 명중을 검색하는 몬스터 도감.` : `Search ${MONSTERS.monsters.length} MapleStory Classic World monsters: HP, EXP, reported drops, map locations and the accuracy you need.`,
    body: monsterIndex({lang, data: MONSTERS, url: href}), modules: ['monsters.js'],
    ld: [breadcrumbLd(lang, monsterTitle, '/monsters/')]
  }));
  write(path.join(lang, 'bosses', 'index.html'), page({
    lang, pageKey: 'bosses', pagePath: '/bosses/',
    title: lang === 'ko' ? '글클메 보스 정리: 출현 위치·체력·필요 명중·드롭 | GMS Hub' : 'MapleStory Classic World Bosses: Spawn Locations, HP, Accuracy & Drops | GMS Hub',
    desc: lang === 'ko' ? '글로벌 메이플스토리 클래식 월드 필드 보스(마노, 스텀피, 머쉬맘, 주니어 발록 등)의 출현 맵, 체력, 경험치, 필요 명중, 주요 드롭을 한 표로 정리했어요.' : 'Every MapleStory Classic World field boss (Mano, Stumpy, Mushmom, Jr. Balrog and more) in one table: spawn map, HP, EXP, accuracy needed and equipment drops.',
    body: bossIndex({ lang, data: MONSTERS, url: href, itemUrl: monsterItemUrl, accuracy: dmgAccNeed, timersHref: href(langPath(lang, '/')) + '#timers' }),
    ld: [breadcrumbLd(lang, lang === 'ko' ? '보스 몬스터' : 'Bosses', '/bosses/')]
  }));
  // Several monsters share a Korean name (Fairy 1-4, Jr. Boogie 1-2); their pages get the English variant so titles stay unique.
  const nameCount = MONSTERS.monsters.reduce((c, x) => c.set(monsterName(x, lang), (c.get(monsterName(x, lang)) || 0) + 1), new Map());
  for (const m of MONSTERS.monsters) {
    const name = nameCount.get(monsterName(m, lang)) > 1 && lang === 'ko' ? `${monsterName(m, lang)} (${m.en})` : monsterName(m, lang);
    write(path.join(lang, 'monsters', String(m.id), 'index.html'), page({
      lang, pageKey: 'monster', pagePath: monsterPath(m),
      title: lang === 'ko' ? `글클메 ${name}: 드롭·체력·출현 위치 | GMS Hub` : `${name}: MapleStory Classic World drops, stats & locations | GMS Hub`,
      desc: lang === 'ko' ? `${name} Lv. ${m.lv}, HP ${m.hp}, EXP ${m.exp}. 드롭 제보 ${m.drops.length}종과 출현 위치·속성 저항을 확인하세요.` : `${name}, level ${m.lv}, HP ${m.hp}, EXP ${m.exp}. Explore ${m.drops.length} reported drops, map locations and elemental responses.`,
      body: monsterDetail({lang, m, data: MONSTERS, url: href, itemUrl: monsterItemUrl, sellPrice: (id) => ITEM_DETAILS[id]?.sell || 0, notes: MONSTER_NOTES.notes[m.id] || null,
        routes: training.routes.filter((r) => r.mobIds.includes(m.id)), accuracy: (lv) => dmgAccNeed(lv, m), rank: RATIO_RANK.get(m.id) || null}), modules: ['monsters.js'],
      noindex: m.status === 'unplaced', ld: [breadcrumbLd(lang, name, monsterPath(m))]
    }));
  }

  write(path.join(lang, 'maps', 'index.html'), page({
    lang, pageKey: 'maps', pagePath: '/maps/',
    title: lang === 'ko' ? '글클메 맵 도감: 사냥터별 몬스터·레벨·드롭 | GMS Hub' : 'MapleStory Classic World Maps: Monsters, Levels & Drops by Map | GMS Hub',
    desc: lang === 'ko' ? `글로벌 메이플스토리 클래식 월드 맵 ${MAPS.length}곳의 몬스터, 레벨, 출현 지점, 드롭을 지역별로 정리했어요.` : `${MAPS.length} MapleStory Classic World maps by region: which monsters spawn there, their levels, spawn points and drops.`,
    body: mapIndex({ lang, maps: MAPS, url: href }),
    ld: [breadcrumbLd(lang, lang === 'ko' ? '맵 도감' : 'Map database', '/maps/')]
  }));
  for (const l of MAPS) {
    const name = mapName(l, lang);
    write(path.join(lang, 'maps', String(l.id), 'index.html'), page({
      lang, pageKey: 'map', pagePath: mapPath(l),
      title: lang === 'ko' ? `글클메 ${name}: 몬스터·레벨·드롭 | GMS Hub` : `${name}: MapleStory Classic World map, monsters & drops | GMS Hub`,
      desc: lang === 'ko' ? `${name} (Lv. ${l.minLv}~${l.maxLv}): 나오는 몬스터 ${l.mobs.length}종, 출현 지점 ${l.total}곳, 한 바퀴 EXP, 확정 명중과 드롭 아이템을 정리했어요.` : `${name} (levels ${l.minLv}–${l.maxLv}): ${l.mobs.length} monster types, ${l.total} spawn points, EXP per full clear, sure-hit accuracy and drops.`,
      body: mapDetail({ lang, l, maps: MAPS, url: href, itemUrl: monsterItemUrl, notes: MONSTER_NOTES.notes, accuracy: (lv, m) => dmgAccNeed(lv, m),
        routes: training.routes.filter((r) => r.mobIds.some((id) => l.mobs.some(({ m }) => m.id === id))) }),
      noindex: l.availability !== 'open',
      ld: [breadcrumbLd(lang, name, mapPath(l))]
    }));
  }

  {
    const items = new Map(itemsData.items.map((i) => [i.id, i]));
    const mobs = new Map(MONSTERS.monsters.map((m) => [m.id, m]));
    const link = (p) => href(langPath(lang, p));
    const itemHref = (i) => (ITEM_PAGE_IDS.has(i.id) ? link(itemPath(i)) : null);
    const mobHref = (m) => link(monsterPath(m));
    const mobSprite = (m) => href(`/assets/monsters/${m.id}.gif`);
    write(path.join(lang, 'quests', 'index.html'), page({
      lang, pageKey: 'quests', pagePath: '/quests/',
      title: lang === 'ko' ? '글클메 퀘스트 목록: 레벨·보상·필요 아이템 | GMS Hub' : 'MapleStory Classic World Quests: Levels, Rewards & Requirements | GMS Hub',
      desc: lang === 'ko' ? `글로벌 메이플스토리 클래식 월드 퀘스트 ${QUESTS.length}개를 지역별로 정리했어요. 시작 레벨, 모아 올 아이템과 그 아이템을 떨어뜨리는 몬스터, 보상 EXP와 메소까지.` : `All ${QUESTS.length} MapleStory Classic World quests by area: start level, items to bring and who drops them, monsters to hunt, EXP and meso rewards.`,
      body: questIndex({ lang, quests: QUESTS, link }),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '퀘스트' : 'Quests', '/quests/')]
    }));
    write(path.join(lang, 'megaphone', 'index.html'), page({
      lang, pageKey: 'megaphone', pagePath: '/megaphone/', modules: ['megaphone.js', 'mega-trends.js'],
      title: lang === 'ko' ? '글클메 실시간 확성기: 고확·팝니다·삽니다 모아 보기 | GMS Hub' : 'MapleStory Classic World Live Megaphones: Super Megaphones, Buying & Selling | GMS Hub',
      desc: lang === 'ko' ? '글로벌 메이플스토리 클래식 월드 게임 확성기를 실시간으로 모아 보여 줘요. 고확과 일반 확성기 구분, 팝니다·삽니다·채널 필터, 시세 비교, 귓말 복사까지.' : 'Live MapleStory Classic World megaphones: super and regular megaphones apart, buying and selling filters, market price comparison and a one-tap whisper command.',
      body: megaphoneBody({ lang, itemsUrl: href('/assets/items.json'), marketUrl: href(langPath(lang, '/tools/market/')) }),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '실시간 확성기' : 'Live megaphones', '/megaphone/')]
    }));
    write(path.join(lang, 'rank', 'index.html'), page({
      lang, pageKey: 'rank', pagePath: '/rank/', modules: ['rank.js'],
      title: lang === 'ko' ? '글클메 캐릭터 랭킹: 레벨 순위·직업 분포·내 캐릭터 찾기 | GMS Hub' : 'MapleStory Classic World Rankings: Top 1,000, Class Breakdown & Character Lookup | GMS Hub',
      desc: lang === 'ko' ? '윈디아(클래식 월드) 레벨 순위 상위 1,000명, 상위권 직업·레벨 분포, 내 캐릭터 순위 찾기. 찾은 캐릭터의 레벨·직업에 맞는 사냥터와 가이드로 바로 이어져요.' : 'Top 1,000 Windia (MapleStory Classic World) characters by level, which classes they play, and a character lookup that links your rank to training spots and the guide for your class.',
      body: rankBody({ lang, link, classes: TR_CLASSES }),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '캐릭터 랭킹' : 'Character rankings', '/rank/')]
    }));
    write(path.join(lang, 'quests', 'best-exp', 'index.html'), page({
      lang, pageKey: 'questBest', pagePath: '/quests/best-exp/',
      title: lang === 'ko' ? '글클메 경험치 퀘스트 추천: 레벨별 보상 EXP 순위 | GMS Hub' : 'MapleStory Classic World Best EXP Quests by Level | GMS Hub',
      desc: lang === 'ko' ? '글로벌 메이플스토리 클래식 월드에서 레벨 구간마다 보상 경험치가 가장 큰 퀘스트 10개씩. 시작 레벨, 메소 보상, 할 일까지 정리했어요.' : 'The quests that pay the most EXP at each level in MapleStory Classic World (MSCW): start level, EXP and meso rewards and what each one asks you to do.',
      body: questBestBody({ lang, quests: QUESTS, link }),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '경험치 퀘스트' : 'Best EXP quests', '/quests/best-exp/')]
    }));
    const eqCtx = { lang, link, mobHref, mobSprite, questHref: (q) => link(questPath(q)),
      itemHref: (e) => (ITEM_PAGE_IDS.has(e.id) ? link(itemPath(ITEM_PAGES.find((i) => i.id === e.id))) : link(`/tools/market/?item=${e.id}`)) };
    write(path.join(lang, 'equipment', 'index.html'), page({
      lang, pageKey: 'equipment', pagePath: '/equipment/', modules: ['equipment.js'],
      title: lang === 'ko' ? '글클메 장비 찾기: 직업·레벨별 장비와 드롭 몬스터 | GMS Hub' : 'MapleStory Classic World Equipment by Class & Level: Where to Get It | GMS Hub',
      desc: lang === 'ko' ? `글로벌 메이플스토리 클래식 월드에서 지금 얻을 수 있는 장비 ${EQUIPMENT.length}개를 직업·부위·레벨로 찾아요. 능력치, 업그레이드 횟수, 떨어뜨리는 몬스터와 주는 퀘스트까지.` : `${EQUIPMENT.length} pieces of MapleStory Classic World (MSCW) gear you can get right now, by class, slot and level: stats, upgrade slots, the monsters that drop them and the quests that give them.`,
      body: equipmentIndexBody(eqCtx, EQUIPMENT),
      ld: [breadcrumbLd(lang, lang === 'ko' ? '장비 찾기' : 'Equipment finder', '/equipment/')]
    }));
    for (const c of EQ_CLASSES) {
      const name = lang === 'ko' ? c.ko : c.en;
      write(path.join(lang, 'equipment', c.slug, 'index.html'), page({
        lang, pageKey: 'equipmentClass', pagePath: equipPath(c), modules: ['equipment.js'],
        title: lang === 'ko' ? `글클메 ${name} 장비: 레벨별 무기·방어구와 얻는 곳 | GMS Hub` : `MapleStory Classic World ${name} Equipment: Weapons & Armor by Level | GMS Hub`,
        desc: lang === 'ko' ? `글클메 ${name} 무기와 방어구를 레벨순으로. 능력치, 착용 조건, 떨어뜨리는 몬스터, 주는 퀘스트를 한 표에서 봐요.` : `Every ${name} weapon and armor piece you can get in MapleStory Classic World, by level: stats, requirements, which monsters drop it and which quests give it.`,
        body: equipmentClassBody(eqCtx, c, EQUIPMENT),
        ld: [breadcrumbLd(lang, lang === 'ko' ? `${name} 장비` : `${name} equipment`, equipPath(c))]
      }));
    }
    for (const q of QUESTS) {
      write(path.join(lang, 'quests', String(q.id), 'index.html'), page({
        lang, pageKey: 'quest', pagePath: questPath(q),
        title: lang === 'ko' ? `글클메 퀘스트 ${q.name}: 조건·보상 | GMS Hub` : `${q.name}: MapleStory Classic World quest, requirements & rewards | GMS Hub`,
        desc: lang === 'ko' ? `${q.name} (${questArea(q.area, lang)}${q.lv ? `, Lv. ${q.lv}` : ''}) 퀘스트의 시작 NPC, 모아 올 아이템과 잡을 몬스터, 보상${q.exp ? ` EXP ${q.exp}` : ''}${q.meso ? `, 메소 ${q.meso}` : ''}을 정리했어요.` : `${q.name}: who starts it, items to bring and who drops them, monsters to hunt, and the rewards, in MapleStory Classic World.`,
        body: questDetail({ lang, q, quests: QUESTS, npcs: QUEST_RAW.npcs, items, mobs, drops: DROP_INDEX, link, itemHref, mobHref, mobSprite }),
        noindex: q.expired,
        ld: [breadcrumbLd(lang, q.name, questPath(q))]
      }));
    }
  }

  const it = IT[lang];
  write(
    path.join(lang, 'items', 'index.html'),
    page({
      lang,
      pageKey: 'items',
      pagePath: '/items/',
      title: fill(it.indexTitle, { n: ITEM_PAGES.length }),
      desc: fill(it.indexDesc, { n: ITEM_PAGES.length }),
      body: itemsIndexBody(lang),
      ld: [breadcrumbLd(lang, it.indexH1, '/items/')]
    })
  );
  // Only items with a recent price get a page. A page per item in the game (2,120 × 2 languages) was 99% of the site and
  // mostly a name with no price: the kind of mass-generated thin page that AdSense rejects as low-value content.
  for (const i of ITEM_PAGES) {
    const name = itemName(lang, i);
    const dropOnly = !priceOf(i);
    write(
      path.join(lang, itemPath(i), 'index.html'),
      page({
        lang,
        pageKey: 'item',
        pagePath: itemPath(i),
        title: priceOf(i)?.median ? fill(it.titlePrice, { name, median: mesoText(lang, priceOf(i).median), date: PRICES_DATE.slice(5).replace('-', '/') }) : fill(dropOnly ? it.titleDrop : it.title, { name }),
        desc: itemDesc(lang, i),
        body: itemBody(lang, i),
        modules: ['item.js'],
        noindex: !INDEXABLE.includes(i),
        ld: [breadcrumbLd(lang, fill(dropOnly ? it.h1Drop : it.h1, { name }), itemPath(i))]
      })
    );
  }
}

// /tools/my-shop/ was folded into the scan page (its per-item "vs market" column); old links land there.
for (const lang of LANGS) {
  const url = absUrl(langPath(lang, '/tools/scan/'));
  write(`${lang}/tools/my-shop/index.html`, `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>GMS Hub</title><meta name="robots" content="noindex"><link rel="canonical" href="${url}"><meta http-equiv="refresh" content="0; url=${url}"></head><body><a href="${url}">${url}</a><script>location.replace(${JSON.stringify(langPath(lang, '/tools/scan/'))})</script></body></html>`);
}

// Root: send visitors to their language before anything else loads. The redirect runs first in <head> and the page
// carries no ads or analytics, so there is no flash of a language chooser; the chooser shows only without JavaScript.
// Crawlers follow the hreflang links.
write(
  'index.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>
(function(){var saved;try{saved=localStorage.getItem('cb_lang')}catch(e){}
var langs=${JSON.stringify(ALL_LANGS)},nav=(navigator.language||'').toLowerCase().slice(0,2);
var lang=langs.indexOf(saved)>=0?saved:langs.indexOf(nav)>=0?nav:'en';
// Search engines link this root page; after the redirect the referrer reads as our own site, so carry the real source
// over as UTM tags or every Naver/Google visit shows up as internal traffic in GA4 and Clarity.
var q=location.search,from='';try{from=new URL(document.referrer).hostname}catch(e){}
if(from&&from!==location.hostname&&!/[?&]utm_source=/.test(q)){q+=(q?'&':'?')+'utm_source='+encodeURIComponent(from)+'&utm_medium='+(/(^|\\.)(naver|google|bing|daum|yahoo|duckduckgo)\\./.test(from)?'organic':'referral')}
location.replace('${config.basePath}/'+lang+'/'+q);})();
</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(T.en.homeTitle)}</title>
<meta name="description" content="${esc(T.en.homeDesc)}">
<link rel="canonical" href="${absUrl(langPath('en', '/'))}">
${ALL_LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${absUrl(langPath(l, '/'))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${absUrl(langPath('en', '/'))}">
${config.naverSiteVerification ? `<meta name="naver-site-verification" content="${esc(config.naverSiteVerification)}">` : ''}
<link rel="icon" href="${href('/assets/favicon.svg')}" type="image/svg+xml">
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f1e7;color:#1c2130}.root-choice{visibility:hidden}main{max-width:520px;margin:15vh auto;text-align:center;padding:0 16px}a{display:inline-block;margin:4px;padding:10px 16px;border-radius:999px;border:1px solid #c45f0b;color:#1c2130;text-decoration:none}</style>
<noscript><style>.root-choice{visibility:visible}</style></noscript>
</head>
<body>
<main class="root-choice">
<h1>GMS Hub</h1>
<p>Global MapleStory Classic World · 글로벌 메이플스토리 클래식 월드</p>
<p>${ALL_LANGS.map((l) => `<a href="${href(`/${l}/`)}" lang="${HREFLANG[l]}">${LANG_NAMES[l]}</a>`).join(' ')}</p>
</main>
</body></html>`
);

// The top band folds into the one below when it has few maps (61-70 + 71-80 became 61-80), which turned already-crawled
// band URLs into 404s. Every 10-level band and two-band span that is not a page now redirects to the band holding its
// first level, so a regrouping never strands a URL Google knows about.
const bandPaths = new Set(TR_BANDS.map(bandPath));
for (let a = 1; a <= TR_MAX; a += 10) {
  for (const b of [a + 9, a + 19]) {
    const from = bandPath([a, b]);
    if (bandPaths.has(from)) continue;
    const to = bandPath(TR_BANDS.find(([x, y]) => x <= a && a <= y) || TR_BANDS.at(-1));
    for (const lang of LANGS) {
      const url = absUrl(langPath(lang, to));
      write(
        langPath(lang, from).replace(/^\//, '') + 'index.html',
        `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>GMS Hub</title><link rel="canonical" href="${url}"><meta http-equiv="refresh" content="0; url=${url}"></head><body><a href="${url}">${url}</a><script>location.replace(${JSON.stringify(langPath(lang, to))}+location.search)</script></body></html>`
      );
    }
  }
}

write(
  '404.html',
  `${head({ lang: 'ko', title: '404 | GMS Hub', desc: T.ko.notFound, noindex: true })}
<body><main class="wrap center">${spriteSvg('slime', 64)}<h1>404</h1><p>${T.ko.notFound}<br>${T.en.notFound}</p>
<p class="choice"><a class="btn" href="${href('/ko/')}">${T.ko.backHome}</a> <a class="btn ghost" href="${href('/en/')}">${T.en.backHome}</a>${LOCALES.map((l) => ` <a class="btn ghost" href="${href(`/${l.code}/`)}" lang="${l.hreflang}">${l.name}</a>`).join('')}</p></main></body></html>`
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

// Derived locales: translate every finished English page. Game names stay in English (the GMS client's own names)
// and are masked so one memory entry covers every item and monster page.
const ENTITIES = entityMatcher([
  ...itemsData.items.map((i) => i.en),
  ...MONSTERS.monsters.flatMap((m) => [m.en, ...m.locations.map((l) => l.en.trim()), ...m.locations.map((l) => l.region)]),
  ...sites.categories.flatMap((c) => c.sites.map((x) => x.name)),
  ...QUESTS.map((q) => q.name)
]);
const CLIENT_KEYS = clientKeys(root);
fs.rmSync(path.join(root, 'i18n', '.missing'), { recursive: true, force: true });
for (const loc of LOCALES) {
  const memory = loadMemory(root, loc.code);
  const vars = (v) => (v.match(/\{\w+\}/g) || []).sort().join();
  const client = Object.fromEntries(CLIENT_KEYS.filter((k) => typeof memory[k] === 'string' && vars(memory[k]) === vars(k)).map((k) => [k, memory[k]]));
  write(`assets/i18n/${loc.code}.js`, `window.I18N=${JSON.stringify(client).replace(/</g, '\\u003c')};\n`);
  const clientSrc = href(`/assets/i18n/${loc.code}.js?v=${createHash('sha256').update(JSON.stringify(client)).digest('hex').slice(0, 8)}`);
  const ctx = { memory, missing: new Set(), keep: new Set(Object.values(LANG_NAMES)), entities: ENTITIES, baseUrl: config.baseUrl, basePath: config.basePath, clientSrc };
  for (const [rel, html] of EN_PAGES) {
    const target = rel.replace(/^en\//, `${loc.code}/`);
    // Band redirect stubs only need their paths moved.
    let content = html.includes('http-equiv="refresh"') ? html.replaceAll('/en/', `/${loc.code}/`).replace('lang="en"', `lang="${loc.hreflang}"`) : localizePage(html, loc, ctx);
    if (!indexedIn(loc.code, `/${path.posix.dirname(rel.replace(/^en\//, ''))}/`))
      content = content.replace(/<meta name="robots" content="index[^"]*">\n<link rel="canonical" href="[^"]*">/, '<meta name="robots" content="noindex">');
    write(target, content);
  }
  for (const k of CLIENT_KEYS) if (!client[k]) ctx.missing.add(k);
  if (ctx.missing.size) {
    // Fill the empty values (any AI or a person), then run: node scripts/i18n-merge.mjs ${loc.code}
    write(`../i18n/.missing/${loc.code}.json`, `${JSON.stringify(Object.fromEntries([...ctx.missing].sort().map((k) => [k, ''])), null, 1)}\n`);
    console.log(`${loc.code}: ${ctx.missing.size} strings still in English (i18n/.missing/${loc.code}.json)`);
  }
}

// Tool and home pages get no <lastmod>: the site rebuilds every day, and a date that moves daily without the page
// changing teaches Google to ignore our lastmod everywhere (guides and item prices keep their real dates).
const sitemapUrls = PAGES.filter((p) => !p.band || bandSpots(p.band).length).flatMap((p) =>
  ALL_LANGS.map(
    (lang) => `<url><loc>${absUrl(langPath(lang, p.path))}</loc>${ALL_LANGS.map(
      (l) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${absUrl(langPath(l, p.path))}"/>`
    ).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, p.path))}"/></url>`
  )
).concat(
  [{path:'/monsters/'}, ...MONSTERS.monsters.filter(m=>m.status!=='unplaced').map(m=>({path:monsterPath(m)}))].flatMap(p=>ALL_LANGS.map(lang=>`<url><loc>${absUrl(langPath(lang,p.path))}</loc><lastmod>${MONSTERS.updated}</lastmod></url>`)),
  [{path:'/equipment/'}, ...EQ_CLASSES.map((c)=>({path:equipPath(c)})), {path:'/quests/best-exp/'}, {path:'/rank/'}, {path:'/megaphone/'}].flatMap(p=>ALL_LANGS.map(lang=>`<url><loc>${absUrl(langPath(lang,p.path))}</loc><lastmod>${MONSTERS.updated}</lastmod></url>`)),
  [{path:'/bosses/'}].flatMap(p=>ALL_LANGS.map(lang=>`<url><loc>${absUrl(langPath(lang,p.path))}</loc><lastmod>${MONSTERS.updated}</lastmod></url>`)),
  [{path:'/quests/'}, ...QUESTS.filter(q=>!q.expired).map(q=>({path:questPath(q)}))].flatMap(p=>ALL_LANGS.map(lang=>`<url><loc>${absUrl(langPath(lang,p.path))}</loc></url>`)),
  [{path:'/maps/'}, ...MAPS.filter(l=>l.availability==='open').map(l=>({path:mapPath(l)}))].flatMap(p=>ALL_LANGS.map(lang=>`<url><loc>${absUrl(langPath(lang,p.path))}</loc><lastmod>${MONSTERS.updated}</lastmod></url>`)),
  [...new Set(guides.map((g) => g.lang)), ...LOCALES.map((l) => l.code)].map((l) => `<url><loc>${absUrl(langPath(l, '/guides/'))}</loc><lastmod>${guides.filter((g) => g.lang === (LANGS.includes(l) ? l : 'en')).map((g) => g.updated).sort().at(-1)}</lastmod></url>`),
  publishedGuides.flatMap((g) => [g.lang, ...(g.lang === 'en' ? LOCALES.map((l) => l.code) : [])].map((l) => `<url><loc>${absUrl(langPath(l, guidePath(g)))}</loc><lastmod>${g.updated}</lastmod></url>`)),
  // Only indexable items (enough recent listings) go in the sitemap.
  [{ path: '/items/' }, ...INDEXABLE.map((i) => ({ path: itemPath(i) }))].flatMap((p) =>
    ALL_LANGS.map(
      (lang) => `<url><loc>${absUrl(langPath(lang, p.path))}</loc><lastmod>${PRICES_DATE}</lastmod>${ALL_LANGS.map(
        (l) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${absUrl(langPath(l, p.path))}"/>`
      ).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(langPath(config.defaultLang, p.path))}"/></url>`
    )
  )
).join('\n')
  // Locale database pages are noindex (see DB_DETAIL): their entries and the alternates pointing at them are dropped.
  .split('\n').filter((u) => { const m = /<loc>[^<]*?\/(zh|ja)(\/[^<]*)<\/loc>/.exec(u); return !m || indexedIn(m[1], m[2]); }).join('\n')
  .replace(/<xhtml:link rel="alternate" hreflang="[^"]*" href="[^"]*?\/(?:zh|ja)\/(?:items|monsters|maps|quests)\/(?!best-exp\/)[^"/]+\/"\/>/g, '');
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapUrls}
</urlset>
`
);
// Installable on phones ("Add to home screen"): a returning player opens GMS Hub like an app. No service worker,
// so nothing is ever served from a stale cache.
for (const size of [180, 192, 512]) {
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(out, 'assets', `icon-${size}.png`), spritePng('mushroom', size));
}
// Service worker for price alerts only: it handles pushes and notification clicks and caches nothing, so pages are
// never served stale.
write('sw.js', fs.readFileSync(path.join(root, 'assets', 'sw.js'), 'utf8').replace('__API__', config.voteApi));
write('manifest.webmanifest', JSON.stringify({
  name: 'GMS Hub', short_name: 'GMS Hub',
  description: 'MapleStory Classic World live prices, training routes, monster and item database',
  start_url: href('/?src=app'), scope: href('/'), display: 'standalone', background_color: '#f6f1e7', theme_color: '#f6f1e7',
  icons: [
    { src: href('/assets/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: href('/assets/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
}));
// llms.txt: a plain map of the site for AI assistants (ChatGPT already sends engaged visitors to tool pages).
write('llms.txt', `# GMS Hub

> Fan-made hub for Global MapleStory Classic World (MapleStory Classic World, "글클메"): live Free Market prices from player-scanned shops, a monster database with drops and locations, training routes by level and class, and calculators. Korean and English, plus Traditional Chinese and Japanese.

Not affiliated with NEXON. Prices are medians of shops players scanned in the last 24 hours to 14 days; drop lists are player reports, not official rates.

## Tools
- [Live Free Market prices](${absUrl('/en/tools/market/')}): asking and sold medians, 7-day trends, where an item is on sale now (channel and room)
- [Item database](${absUrl('/en/items/')}): every item a monster drops or a player priced, with droppers, farm maps, base stats and recent prices
- [Monster database](${absUrl('/en/monsters/')}): ${MONSTERS.monsters.length} monsters with HP, EXP, drops, map locations and the accuracy needed to hit
- [Bosses](${absUrl('/en/bosses/')}): spawn map, HP, EXP, accuracy needed and equipment drops for every field boss
- [Equipment finder](${absUrl('/en/equipment/')}): obtainable gear by class and level with stats, upgrade slots, dropping monsters and quest sources
- [Best EXP quests](${absUrl('/en/quests/best-exp/')}): the biggest EXP quest rewards in each level band
- [Quests](${absUrl('/en/quests/')}): ${QUESTS.length} quests with start level, items to bring and who drops them, monsters to hunt and rewards
- [Map database](${absUrl('/en/maps/')}): ${MAPS.length} maps with their monsters, spawn points, EXP per full clear and drops
- [Training routes](${absUrl('/en/tools/training/')}): conditional routes by level, with entry requirements and supply costs
${TR_CLASSES.map((c) => `- [${c.en} training routes](${absUrl(langPath('en', classPath(c)))})`).join('\n')}
- [Hits-to-kill calculator](${absUrl('/en/tools/damage/')}): hits to kill and accuracy per monster from your stats
- [Scroll calculator](${absUrl('/en/tools/scroll/')}): Lesser, Intermediate, Greater and Chaos scroll odds
- [Drop-rate calculator](${absUrl('/en/tools/drop-rate/')}): chance after N kills or box opens, with Nexon's official box rates

## Guides
${publishedGuides.filter((g) => g.lang === 'en').map((g) => `- [${g.h1 || g.title}](${absUrl(langPath('en', guidePath(g)))})`).join('\n')}

## Korean (한국어)
- [글클메 허브 홈](${absUrl('/ko/')}): 사이트 모음, 실시간 시세, 몬스터 DB, 사냥터
- [실시간 시세](${absUrl('/ko/tools/market/')})
- [몬스터 도감](${absUrl('/ko/monsters/')})
${TR_CLASSES.map((c) => `- [${c.ko} 사냥터](${absUrl(langPath('ko', classPath(c)))})`).join('\n')}
`);
// Content hash per page, published with the site: CI compares it with the live copy and pings IndexNow only for pages
// that really changed. Cache-busting query strings are dropped first so a JS release doesn't mark every page as changed.
{
  const hashes = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name === 'index.html') {
        const html = fs.readFileSync(f, 'utf8');
        if (/<meta name="robots" content="noindex/.test(html)) continue;
        const rel = `/${path.relative(out, path.dirname(f)).split(path.sep).join('/')}/`.replace(/^\/\/$/, '/');
        hashes[rel] = createHash('sha1').update(html.replace(/\?v=[\w.-]+/g, '')).digest('hex').slice(0, 16);
      }
    }
  };
  walk(out);
  write('page-hashes.json', JSON.stringify(hashes));
}
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
write('assets/mobs.json', JSON.stringify(MOBS.map((m) => [m.id, m.ko || '', m.en, m.lv, m.hp, m.wdef, m.mdef, m.eva, m.el || '', m.undead ? 1 : 0, m.boss ? 1 : 0, m.mp, m.aka.join(' '), m.status || ''])));
write('assets/weapons.json', JSON.stringify(readJson('data/weapons.json').weapons.map((w) => [w.id, w.ko || '', w.en, w.type, w.lv, w.watk || 0, w.matk || 0])));
write('assets/items.json', JSON.stringify(itemsData.items.map((i) => [i.id, i.ko || '', i.en, i.cat, i.sub, i.lv || 0])));
// Hover cards (assets/item-tip.js): the static half of what a card shows for every item or monster a page can link to.
// Live prices come from the worker on hover.
// items: id -> [ko, en, cat, sub, reqLevel, jobBits, req, inc, slots, sellPrice, scroll [gain, success, destroyOnFail] | 0,
//   [dropping monster ids, lowest level first, up to 4], dropper count, quest count]
// mobs: id -> [ko, en, lv, hp, exp, elements, avoid, boss, accuracy needed at its level, [[map ko, map en] x2], open map
//   count, [item ids it drops, equipment and scrolls first, up to 4], drop count, status]
{
  const tipMobs = MONSTERS.monsters.filter((m) => m.status !== 'unplaced');
  const live = new Set(MONSTERS.monsters.filter((m) => m.status === 'active').map((m) => m.id));
  const scrollOf = new Map();
  for (const [, ladder, tiers] of scrollFamilies('en')) {
    const gains = scrolls.ladders.find((l) => l.id === ladder)?.gains || {};
    for (const [tier, id] of Object.entries(tiers)) {
      const t = scrolls.tiers.find((x) => x.id === tier);
      if (t && gains[tier] != null) scrollOf.set(id, [gains[tier], t.success, t.destroyOnFail || 0]);
    }
  }
  const questGives = new Map();
  for (const q of QUESTS) if (!q.expired) for (const g of q.gets) questGives.set(g.id, (questGives.get(g.id) || 0) + 1);
  const ids = new Set([...Object.keys(ITEM_DETAILS).map(Number), ...DROP_INDEX.keys(), ...Object.keys(itemPrices.prices || {}).map(Number), ...scrollOf.keys()]);
  const byId = new Map(itemsData.items.map((i) => [i.id, i]));
  const tips = {};
  for (const id of ids) {
    const i = byId.get(id);
    if (!i) continue;
    const d = ITEM_DETAILS[id] || {};
    const droppers = (DROP_INDEX.get(id) || []).filter(({ m }) => live.has(m.id)).sort((a, b) => a.m.lv - b.m.lv);
    tips[id] = [i.ko || '', i.en, i.cat, i.sub || '', d.req?.lv || i.lv || 0, d.req?.job || 0,
      Object.fromEntries(['str', 'dex', 'int', 'luk'].filter((k) => d.req?.[k]).map((k) => [k, d.req[k]])), d.inc || {}, d.slots || 0, d.sell || 0,
      scrollOf.get(id) || 0, droppers.slice(0, 16).map(({ m }) => m.id), droppers.length, questGives.get(id) || 0];
  }
  const rankDrop = (d) => (d.cat === 'Equip' ? 0 : /Scroll/.test(d.en) ? 1 : d.cat === 'Use' ? 3 : 2);
  const mobs = {};
  for (const m of tipMobs) {
    const open = m.locations.filter((l) => l.availability === 'open');
    const drops = [...m.drops].sort((a, b) => rankDrop(a) - rankDrop(b));
    mobs[m.id] = [m.ko || m.en, m.en, m.lv, m.hp, m.exp, m.el || '', m.eva, m.boss ? 1 : 0, m.eva ? dmgAccNeed(m.lv, m) : 0,
      open.slice(0, 2).map((l) => [l.ko || l.en, l.en]), open.length, drops.slice(0, 4).map((d) => d.itemId), m.drops.length, m.status];
  }
  // Which quests give each item (for the market's item panel): path, client name and level, at most six.
  const questsOf = {};
  for (const q of QUESTS) if (!q.expired) for (const g of q.gets) if (tips[g.id]) (questsOf[g.id] ||= []).length < 6 && questsOf[g.id].push([questPath(q), q.name, q.lv]);
  write('assets/item-tips.json', JSON.stringify({ mobs, items: tips, quests: questsOf }));
}


console.log(`Built ${PAGES.length * LANGS.length} pages + ${MONSTERS.monsters.length * LANGS.length} monster pages + ${MAPS.length * LANGS.length} map pages + ${QUESTS.length * LANGS.length} quest pages + ${ITEM_PAGES.length * LANGS.length} item pages, ${SITE_COUNT} sites into dist/ (${BUILD_DATE})`);
