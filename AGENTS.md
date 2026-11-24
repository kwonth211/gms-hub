# GMS Hub — 에이전트 작업 지침

Claude, Codex, 그 밖의 어떤 에이전트든 이 저장소에서 작업할 때 따른다.

## 글쓰기 (사이트에 올라가는 모든 글)

- 글을 쓰거나 고치기 전에 [docs/writing-rules.md](docs/writing-rules.md)를 읽는다.
- 딱 잘라 말한다. "비교해요 / 시험해요 / 후보예요 / 검토 / 관측 / 가정" 같은 둘러대는 말과 쓸데없는 설명을 쓰지 않는다.
- 올리기 전에 그 문서 5번의 점검 목록으로 스스로 검토한다.
- `node --test tests/voice.test.mjs`가 둘러대는 낱말을 파일별로 센다. 실패하면 문장을 고친다. `tests/voice-baseline.json`의 숫자를 올려서 통과시키지 않는다.

## 올리기 전

- `node scripts/build.mjs` 후 `node --test tests/*.test.mjs`가 fail 0이어야 한다 (알려진 예외: pngjs가 없을 때의 mega-native 테스트 1건).
- 한국어(/ko/)와 영어(/en/) 둘 다 확인한다.
- 유저가 보는 변화는 `data/updates.json`에 적는다.

## 화면을 읽는 도구(EXP 측정기, 상점 스캔, 데미지 계산기)를 고칠 때

2026-11-24에 EXP 측정기가 "검증했다"고 한 뒤에도 46명 중 37명에게 문제가 생겼다. 아래를 모두 확인하기 전에는 됐다고 말하지 않는다.

1. 저장한 사진이 아니라 **실제 브라우저 화면 공유**로 잰다. `node scripts/exp-share-check.mjs [주소]` 는 메이플 창을 조작하지 않고 공유만 해서 EXP와 레벨을 읽는다. 작은 화면(1280x720) 조건도 같이 돈다.
2. 체력·마나가 줄어든 화면, 1배가 아닌 배율, 색이 번진 화면(yuv420p)으로 시험한다. `tests/exp-reader.test.mjs`의 실제 공유 화면 자료(`.rgba.gz`)를 지우지 않는다.
3. 틀리게 읽은 것이 0이어야 한다. 못 읽는 것보다 틀리게 읽는 것이 나쁘다.
4. 건너뛴 시험(skip)은 통과가 아니다. 배포 과정에서 `exp-reader`, `exp-runs`, `stat-reader` 시험을 돌린다.
5. 배포 2~3일 뒤 /admin/traffic/ 의 "화면 읽는 도구 상태"에서 성공률(80% 이상)과 실패 이유를 본다.
