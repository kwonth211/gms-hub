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

## 검색엔진 등록

1. Google Search Console에 사이트 추가 → HTML 태그 값을 `googleSiteVerification`에 입력 → 푸시
2. Search Console에서 `sitemap.xml` 제출
