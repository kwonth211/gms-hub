# GMS Hub

메이플스토리 클래식 월드 전용 링크 허브 + 툴 사이트. 한국어/영어 지원.

**원칙:** 출처가 확인된 정보만 싣는다. 사이트 설명은 각 사이트의 소개문·메뉴에서만 가져오고, 숫자에는 출처와 확인 날짜를 붙인다.

- 사이트 모음: `data/sites.json`
- 레벨별 사냥터 (NiaMeowDB·MS-Classic·Henesys.GG 교차): `data/training.json`
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

- 상점 스캔의 채널·자유시장 방은 자동 인식 또는 드롭다운 직접 선택을 지원해요. 직접 선택한 값이 우선하며, 이동할 때 선택을 바꿔 주세요. 이전 매물의 위치는 각 줄의 수정 버튼에서 고칠 수 있어요.
- 아이템·수량·가격이 두 번 일치하고 판매자와 위치가 확인된 매물만 자동 반영해요. 잘린 이름의 후보는 가격만으로 확정하지 않으며, 읽지 못한 줄도 직접 수정할 수 있어요.
- 판매 중·판매 완료 시세를 별도로 집계해요. 최근 판매 매물에는 24시간 안에 본 기록만 표시하며 실제 재고를 보장하지 않아요. 가격은 개당 메소이고 묶음 총액은 따로 표시해요.
- 시세 차트는 1시간·6시간·24시간·7일 중 선택한 기간의 마지막 관측 시각을 집계해요. 중앙값 추이와 관측 건수를 비교하고, 판매 중 매물의 가격대 분포·누적 매물 수를 볼 수 있어요. 매물대 선택은 상점 목록의 가격 필터와 연결돼요.
- 거래 시각의 영구 이력은 저장하지 않으므로 차트는 실제 체결 이력이 아니에요. 매물대는 최대 최근 24시간, 건수는 묶음 수량이 아닌 매물 행 기준이에요. 아이템 API가 최근 400개로 잘리면 화면에 안내해요.
- 로컬 `~/gms-hub-samples`와 scan-tools 의존성이 있으면 테스트에서 저장된 게임 화면 2장도 검증해요. CI에서는 개인 화면 샘플을 업로드하지 않고 해당 테스트를 건너뛰어요.
- 프런트엔드는 GitHub Pages, API 변경은 `worker/`에서 기존 Wrangler 배포 명령으로 따로 배포해요. 데이터베이스 스키마 변경은 필요하지 않아요.
