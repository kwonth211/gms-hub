# 확성기 수집기(옵션 포함) 윈도우로 옮기기

주인 결정 (2026-11-23): 수집기를 윈도우 PC로 옮긴다. **게임은 늘 앞에(포커스) 둔다.** 그래서 "뒤에서 클릭"은 필요 없다.
그 PC는 상점 수집기 + 확성기 수집기만 돌린다. **주인 상점은 열지 않는다**(상점 보호 장치는 옮기지 않는다).
두 수집기가 같은 게임 마우스를 쓰면 반드시 번갈아 써야 한다(아래 5번).

## 무엇이 그대로이고 무엇을 새로 만드나

그대로 쓴다(node, 플랫폼 무관): `assets/mega-reader.js`, `assets/mega-tooltip.js`, `assets/mega-glyphs.json`,
`mega-collector.mjs`, `mega-options.mjs`, `mega-check.mjs`, `mega-learn.mjs`, `mega-coverage.mjs`.
`mega-collector.mjs`는 도우미 프로그램 세 개를 부른다. 맥에서는 Swift인 이 셋을 윈도우용으로 같은 약속대로 새로 만든다.
가장 쉬운 길은 C#(.NET 8) 콘솔 프로그램 하나에 명령 세 개를 두는 것이다. 프로세스는 DPI 인식(PerMonitorV2)으로 둔다.
`mega-collector.mjs`에서는 `process.platform==='win32'`일 때 swiftc 빌드 대신 이 exe를 쓰게만 바꾼다.

### 1. 캡처: `stream <out.png>` (맥: maple-stream.swift)
- 가장 큰 MapleStory 창의 **클라이언트 영역**을 1:1 픽셀로 최대 초당 8장 찍는다. 매번 최신 한 장을 `<out.png>`에 쓴다.
  임시 파일에 쓴 뒤 이름 바꾸기로 덮어써서, 반쯤 쓴 파일을 읽는 일이 없게 한다.
- 창이 없으면 exit 2로 끝낸다. 창 크기가 바뀌어도 끝낸다(수집기가 다시 켠다). stdin이 닫히면 끝낸다.
- 게임이 앞에 있으니 화면 복사(BitBlt/CopyFromScreen)로 충분하다. 검은 화면이 나오면 Windows Graphics Capture를 쓴다.

### 2. 글자 인식: `ocr <png> <itemName> <scale>` (맥: maple-ocr.swift, 애플 Vision)
- 줄마다 JSON 배열 하나를 stdout에 낸다: `[{text, confidence(0~1), x, y, w, h}]`. 좌표는 이미지 픽셀이고 원점은 왼쪽 위다.
- 줄 안에 itemName이 있으면 `itemBounds:{x,y,w,h}`(그 글자들의 범위)와 `itemInBrackets`(바로 앞이 `[`이거나 바로 뒤가 `]`)를 붙인다.
- `scale`(1~3)은 인식 전에 확대하는 배율이다. 좌표는 원래 이미지 기준으로 돌려준다.
- 4초 안에 끝나야 한다. Windows.Media.Ocr(내장, 영어 팩)를 먼저 쓰고, 정확도가 모자라면 Tesseract로 바꾼다.
- 옵션 창은 작은 도트 글씨다. 맥에서 저장해 둔 `sample-*-tooltip.png`를 넣었을 때 맥과 같은 값이 나오는지로 검사한다.

### 3. 입력: `input move|click|release <x> <y> [imgW imgH]` (맥: maple-input.swift의 "foreground mode")
- 좌표는 게임 클라이언트 기준이다. imgW/imgH가 지금 창 크기와 다르면 exit 3.
- 환경변수:
  - `GMS_ALLOW="x,y,w,h"`: click은 이 안에서만 누른다(채팅창). 밖이면 exit 7.
- 순서:
  1. 게임이 앞(GetForegroundWindow)이고, 주인이 2초 넘게 키보드와 마우스를 안 만졌는지 확인한다(GetLastInputInfo). 아니면 exit 4.
     우리가 보낸 입력도 이 시계를 되돌리니, 마지막 입력이 우리 것이고 포인터가 그 자리 그대로면 주인 입력으로 보지 않는다.
  2. SetCursorPos로 짧게 미끄러지듯 목표까지 옮긴다. 도착 뒤 GetCursorPos가 목표와 다르면 exit 4(주인이 움직임). 누르지 않는다.
  3. **게임 속 손가락 커서 확인**: 이동 직전과 직후에 목표 주변 28×32를 찍어 비교한다. 흰 장갑 픽셀이 새로 40개 이상
     생겼을 때만 누른다(maple-input.swift의 gloveScore). 안 보이면 exit 8. 엉뚱한 곳을 누르는 사고를 막는 핵심 장치다.
  4. SendInput으로 왼쪽 누름을 보내고 `{"phase":"pressed","at":<ms>}`를 출력한다.
     80ms 뒤 뗌을 보내고 `{"phase":"clicked","at":<ms>,"mode":"foreground"}`를 출력한다.
  5. 320ms 기다린 뒤(옵션 창 캡처 시간) 포인터를 창 오른쪽 위 `(width-40, 40)`로 옮기고 그대로 둔다. 원래 자리로 돌아가지 않는다.
  6. 도중에 게임이 앞에서 빠지면 exit 5.
- `move`는 이동만 하고 누르지 않는다. `release`는 아무것도 하지 않고 exit 0.
- 키보드 입력은 절대 보내지 않는다.

## 4. 실행·관리 (맥: mega.sh)
`mega.ps1 start|stop|status|log|check|learn|install`을 같은 뜻으로 만든다. 경로는 이렇게 둔다.
- 설정: `%USERPROFILE%\.config\gms-hub\`
- 기록: `%USERPROFILE%\gms-hub-samples\`

꺼지지 않게 하기: 맥의 caffeinate 대신 SetThreadExecutionState를 쓴다.
`node mega-collector.mjs`가 죽으면 3초 뒤 다시 켜는 반복도 그대로 둔다.
관리자 키 `megaphone-token`과 `mega-state.json`은 맥에서 `mega.sh pack`으로 만든 파일에서 꺼낸다.

## 5. 상점 수집기와 번갈아 쓰기
- 옵션 읽기 멈춤 파일: `%USERPROFILE%\.config\gms-hub\mega-options-paused`가 있으면 확성기 수집기는 클릭하지 않는다.
  글은 계속 수집한다.
- 그 PC의 상점 수집기가 게임 마우스나 키보드를 쓰면, 시작할 때 이 파일을 만들고 3초 기다린다. 끝나면(실패해도) 지운다.
- 상점 수집기가 브라우저만 쓴다면 번갈아 쓸 필요는 없다.

## 6. 맞춰야 할 것과 검사
- 게임 창 클라이언트 크기 **1366 × 796**. 글자표가 이 크기를 기준으로 맞춰져 있다. 다르면 `mega-learn`으로 다시 배운다.
- 윈도우 글꼴 그리기가 CrossOver와 다르면 채팅 글자표가 안 맞는다.
  `mega-check`로 확인하고, 틀리면 표본을 모아 `mega-learn`을 돌린다.
- 같은 링크 최대 4번 제한과 커서 확인은 그대로 둔다.
- 맥미니 수집기는 윈도우 쪽이 잘 돌기 시작하면 `mega.sh stop`으로 끈다. 두 대가 동시에 돌지 않게 한다.
