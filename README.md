# GMS Hub

메이플스토리 클래식 월드 전용 링크 허브 + 툴 사이트. 한국어/영어 지원.

**원칙:** 출처가 확인된 정보만 싣는다. 사이트 설명은 각 사이트의 소개문·메뉴에서만 가져오고, 숫자에는 출처와 확인 날짜를 붙인다.

- 사이트 모음: `data/sites.json`
- 원문·작성자·조건을 갖춘 개인 플레이 후기 (추정 레벨 추천 금지): `data/training.json`
- 주문서 등급 확률: `data/scrolls.json`
- 사이트 썸네일: `assets/shots/*.jpg`, 픽셀아트: `scripts/sprites.mjs`
- 링크 미리보기 이미지: `node scripts/og.mjs` (Chrome + playwright-core 필요)
- 드롭 확률: `data/drops.json`

## 빌드

```bash
node --test tests/*.test.mjs # Node 22 이상, 시세·스캔·API 회귀 테스트
node scripts/build.mjs   # dist/ 생성 (의존성 없음)
```

`main`에 푸시하면 GitHub Actions가 빌드해서 GitHub Pages(https://gms-hub.com)에 배포해요. DNS는 Cloudflare(프록시 끔)에서 GitHub Pages IP를 가리켜요.

## 메인 통합 검색

메인 검색은 `assets/search-index.js`에서 아이템·사이트·도구·가이드를 함께 검색해요. 한글/영문, 띄어쓰기, 초성, 장공·장마 같은 주문서 약어를 지원하며 아이템은 자체 시세 페이지로 연결해요. 사이트와 도구는 홈페이지 카드에서 자동으로 색인하고, 아이템 목록은 실시간 시세 위젯과 한 번만 내려받아 공유해요. 검색 결과는 화면을 밀지 않는 드롭다운으로 표시하고, 입력하거나 Enter를 눌러도 현재 URL과 입력 위치를 유지해요. Esc 또는 바깥 클릭으로 닫을 수 있어요. 검색은 브라우저에서 처리하므로 AI 호출이 없어요.

`node --test tests/search.test.mjs`로 동시 검색 누락, 순위, 한글 동의어, 초성 검색을 검증할 수 있어요.

## 데이터 관리 (관리자 페이지)

`/admin/`에서 GitHub Fine-grained 토큰(이 저장소의 Contents: Read and write)으로 로그인하면
드롭 확률·주문서 확률은 표로, 사냥터·사이트 링크는 JSON으로 편집할 수 있어요.
저장하면 커밋되고 1~2분 뒤 자동 반영돼요.

## 설정 (`site.config.json`)

| 키 | 설명 |
|---|---|
| `baseUrl`, `basePath` | 커스텀 도메인 연결 시 `baseUrl`을 도메인으로, `basePath`를 `""`로 |
| `googleSiteVerification` | Search Console HTML 태그 인증 값 |
| `adsenseClient` | `ca-pub-...` 넣으면 AdSense 스크립트와 `ads.txt` 생성 |
| `gaMeasurementId` | `G-...` Google Analytics |
| `indexNowKey` | IndexNow 키. 빌드 시 `/<키>.txt`를 만들어요 |

## 검색엔진 등록

1. Google Search Console에 사이트 추가 → HTML 태그 값을 `googleSiteVerification`에 입력 → 푸시
2. Search Console에서 `sitemap.xml` 제출
3. 배포가 끝나면 `node scripts/indexnow.mjs` → Bing·네이버·Yandex에 sitemap URL 전체를 바로 알려요

## 추천 기능 (Cloudflare Worker + D1)

`worker/` 폴더. 방문자(솔트 IP 해시)당 사이트별 1회 추천.

```bash
cd worker
npx wrangler@3.114.0 deploy                                   # 코드 배포
npx wrangler@3.114.0 d1 execute gms-hub-votes --remote --file=seed.sql   # 사이트 추가 후 새 ID 등록
```

`CLOUDFLARE_API_TOKEN` 환경변수는 저장된 Wrangler OAuth 로그인보다 우선해요.
로컬에서 D1 오류 `7403`이 나면 현재 토큰과 저장된 로그인 계정·권한을 확인해 주세요.
2026-11-03에는 이 프로젝트의 같은 계정에 저장된 OAuth 로그인(`d1:write`)으로 접속을 확인했어요.
해당 로그인을 사용할 때는 실행할 명령에서만 환경변수를 제외해요.

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler@3.114.0 whoami
env -u CLOUDFLARE_API_TOKEN npx wrangler@3.114.0 d1 execute gms-hub-votes --remote --file=seed.sql
```

## 상점 시세와 인식

실시간 시세의 첫 화면은 판매자·가격·위치가 나오는 전체 매물 목록입니다. 임의의 아이템을 자동으로 열지 않습니다. 아이템 목록 탭에서는 최근 7일에 기록된 모든 아이템을 모아 볼 수 있습니다. 아이템 분류, 한글/영문/초성·약어 검색, 관심 목록, 가격·매물 수 정렬을 지원합니다. 아이템을 누르면 같은 화면에서 판매자별 매물이 먼저 열리고 가격 추이·매물대는 별도 탭으로 확인합니다.

- **전체 매물**: 최신 60건 피드 대신 페이지별로 전체 결과를 조회합니다. 판매자·채널·FM 방·상태·가격순 필터를 서버에서 먼저 적용해, 페이지 밖의 저가 매물이 빠지지 않습니다. 판매 중은 최근 24시간 관측, 전체/판매 완료/오래된 기록은 1·7·30일 중 선택합니다.
- **상점 보기**: 판매자를 누르면 같은 판매자·채널·방에서 DB에 확인된 매물이 열립니다. 실제 상점의 전체 재고를 보장하지 않습니다.
- **가격 제보**: 판매자/위치 정보가 없는 `prices` 기록을 별도로 표시합니다. 방문 가능한 판매 매물이나 재고에 합산하지 않으며 제보자의 식별 정보는 공개하지 않습니다.
- **표시 가격**: 아이템 목록의 중앙값·최저가는 최근 판매 중 매물 기준입니다. 실제 매물 목록에는 높은 가격도 숨기지 않습니다. 가격 문구는 ‘가격’, ‘메소’로 표시하고 묶음 수량·총액은 따로 둡니다.
- **관측 이력**: `0002_listing_history.sql`의 트리거가 스캔·배치로 확인된 이력을 보존합니다. 기존 배치 이력과 중복을 제거해 추이에 사용합니다. 잘못된 아이템·판매자·위치를 수정하면 이전 키의 관측은 차트에서 제외됩니다. 실제 체결 내역은 아닙니다.
- **매물대**: 관측 이력 횟수가 아닌 현재 판매 중 매물 행을 한 번씩 셉니다. 선택한 가격대와 기간을 실제 매물 검색에도 동일하게 적용합니다. 차트 이력은 최근 7일 최대 5,000건이며 잘리면 안내합니다. 실제 매물 목록은 별도 페이지 API를 사용하므로 기존 400건 제한에 묶이지 않습니다.
- 상점 스캔의 채널·자유시장 방은 자동 인식 또는 드롭다운 직접 선택을 지원합니다. 직접 선택한 값이 우선하며, 이동할 때 선택을 바꿔야 합니다. 이전 매물 위치는 각 줄의 수정 버튼으로 고칠 수 있습니다.
- 아이템·수량·가격이 두 번 일치하고 판매자와 위치가 확인된 매물만 자동 반영합니다. 읽지 못한 줄과 잘린 이름도 직접 수정할 수 있습니다.

시장 API는 `/market/catalog`, `/market/listings`, `/market/reports`, `/market/history`입니다. 기존 `/market/top`과 `/market/item`은 이전 클라이언트 호환을 유지합니다. 브라우저 목록은 60초마다 확인하며 선택한 아이템과 필터는 유지합니다.

DB에 `worker/migrations/0001_market_batch.sql`, `0002_listing_history.sql`을 순서대로 적용한 뒤 Worker를 배포합니다. 프런트엔드는 main 푸시 후 GitHub Pages로 배포합니다. 배치 확장의 운영 방법은 `scripts/market-batch/README.md`에 있습니다. 개인 인증 파일과 실제 수집 증빙은 Git에 포함하지 않습니다.

`node --test tests/*.test.mjs`는 API·시세·검색·스캔 회귀를 확인합니다. `tests/market-browser.test.mjs`는 전체 목록/페이지 누락, 극단 가격의 가시성, 필터, 이력 보존/중복, 가격 제보 분리 등을 검증합니다. 로컬 게임 화면 샘플이 있으면 실제 인식 회귀도 확인합니다.

## 콘텐츠 점검 (2026-11-10)

14개 가이드 주제(한국어·영어 28페이지)를 검토했습니다. 6개 주제를 원문 후기·계산 가정·사이트 동작 안내로 다시 쓰고, 출처가 부족한 8개 주제는 기존 URL에 재검증 안내만 표시합니다. 기존 본문은 Git 기록과 소스에 보존되지만 배포 HTML, 홈 검색, 관련 가이드와 사이트맵에 공개하지 않습니다. 비공개 가이드 URL은 noindex입니다.

`data/training.json`은 직접 플레이를 서술한 원문 11건의 요약입니다. 원문을 읽었다는 사실은 작성자 신원·성과·현재 패치를 독립 검증했다는 뜻이 아닙니다. 없는 직업·레벨·맵·비용은 추정하지 않습니다. 추천 사이트 수와 이론 최대 EXP로 매기던 56개 맵 순위는 제거했습니다. 원문 게시일을 확정하지 못한 경우 null로 보존하며, 확인일과 구별합니다.

가이드 공개에는 `status`, `reviewed`, `evidenceKind`, 원문 출처가 필요합니다. 근거를 확보하지 못한 가이드는 `withheld`와 구체적인 `reviewReason`을 넣습니다. `tests/content.test.mjs`가 레벨·직업 혼동, 과거 자료 혼입, 미검증 본문 재노출과 출처 누락을 검사합니다. 게임 효율 자체를 검증하는 테스트는 아닙니다.

계산기 수치는 가정에 따른 모델로 표시합니다. 몬스터·무기 자료는 2026-11-03 수집본, 상자 확률은 2026-10-28 공식 공지 수집본이며 이번에 현재 게임에서 재측정한 자료가 아닙니다. 링크 접속 확인은 외부 사이트의 내용 검증과 구분합니다.
