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
