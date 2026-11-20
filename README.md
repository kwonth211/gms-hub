# GMS Hub

[메이플스토리 클래식 월드 정보 사이트](https://gms-hub.com). 사이트 모음, 사냥터·몬스터·퀘스트 가이드, 시세 검색, 상점 화면 인식과 계산기를 제공합니다. 한국어·영어를 중심으로 일본어·중국어 번체 페이지도 제공합니다.

정보는 확인 가능한 자료를 바탕으로 정리합니다. 시세는 관측된 매물과 이용자 제보이며 실제 체결 가격이나 상점의 전체 재고를 보장하지 않습니다.

## 로컬 빌드와 테스트

Node.js 22 이상이 필요합니다. 정적 사이트 빌드에는 별도의 패키지 설치가 필요하지 않습니다.

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
```

빌드 결과는 `dist/`에 생성됩니다. 수집기 확장 테스트는 별도로 실행합니다.

```sh
npm --prefix scripts/market-batch ci --ignore-scripts
npm --prefix scripts/market-batch test
```

## 프로젝트 구성

| 경로 | 내용 |
|---|---|
| `assets/` | 브라우저 기능, 스타일, 이미지 |
| `data/` | 아이템·몬스터·사냥터·퀘스트 등 콘텐츠 |
| `data/editorial/` | 콘텐츠 검토에 사용한 자료와 편집 기록 |
| `scripts/build.mjs` | 정적 HTML·검색 데이터·사이트맵 생성 |
| `worker/` | Cloudflare Worker API, D1 스키마와 마이그레이션 |
| `tests/` | 사이트·API·화면 인식 회귀 테스트 |
| `scripts/market-batch/` | 시세 수집 확장과 테스트 |

콘텐츠 원본은 `data/sites.json`, `data/training.json`, `data/scrolls.json` 등에서 관리합니다. 몬스터 자료 가져오기는 `node scripts/import-monsters.mjs <snapshot-directory>`를 사용합니다.

## 설정

`site.config.json`에서 사이트 주소, GitHub 저장소, API 주소, 분석·광고 설정을 지정합니다. 다른 환경에 배포할 때는 해당 환경의 값으로 변경하세요.

| 설정 | 용도 |
|---|---|
| `baseUrl`, `basePath` | 사이트의 도메인과 경로 |
| `github` | 콘텐츠 편집 대상 저장소 |
| `voteApi` | Worker API 주소 |
| `gaMeasurementId`, `clarityProjectId`, `cfAnalyticsToken` | 브라우저용 분석 식별자 |
| `adsenseClient`, `adfit` | 광고 설정 |
| `googleSiteVerification`, `naverSiteVerification` | 검색엔진 사이트 소유권 확인 |
| `indexNowKey` | IndexNow URL 제출 |

분석 이벤트 정의는 [docs/analytics-events.md](docs/analytics-events.md), 장비 옵션 형식은 [docs/item-options.md](docs/item-options.md)를 참고하세요.

## 배포

`main`에 푸시하면 API·수집기 검증과 사이트 빌드를 거쳐 GitHub Pages에 배포됩니다. Pull request에서는 검증과 빌드만 실행합니다. Worker는 별도로 배포합니다.

Worker를 처음 구성할 때는 D1 바인딩과 스키마·마이그레이션을 준비하고, 사용하는 기능의 인증 값을 Worker secrets에 등록하세요. 기존 DB에는 적용 여부를 확인한 마이그레이션만 실행하세요.

메일 수신과 사용량 계산에는 다음 비공개 설정이 필요합니다.

- `FORWARD_TO`: Cloudflare에서 확인된 이메일 전달 대상.
- `USAGE_BASELINE`: 사용량 집계 시작 전의 기록. JSON 형식은 `{ "YYYY-MM-DD": [쓰기 행, 읽기 행, Worker 요청, Durable Object 요청] }`입니다. 새 설치는 `{}`를 명시하고, 기존 설치는 기존 기록을 그대로 이전합니다. 누락되거나 잘못된 값이면 사용량 제한은 차단 상태로 전환됩니다.

두 값을 담은 JSON 파일을 저장소 밖에 준비한 뒤 코드 배포 전에 등록합니다. 이메일과 실제 사용량은 저장소 설정 파일에 넣지 않습니다.

```sh
cd worker
npx wrangler@3.114.0 secret bulk /path/to/private-worker-settings.json
npx wrangler@3.114.0 deploy
```

시세 수집 확장 설치와 실행은 [수집기 안내](scripts/market-batch/README.md)를 참고하세요. 사이트맵은 빌드에 포함되며, 검색엔진 URL 갱신은 `node scripts/indexnow.mjs`로 제출할 수 있습니다.

## 콘텐츠 편집

JSON 파일을 수정하고 테스트를 실행한 뒤 변경 내용을 커밋합니다. `/admin/` 편집기를 이용할 경우 편집 대상 저장소의 Contents 읽기·쓰기 권한이 있는 GitHub fine-grained 토큰이 필요합니다.
