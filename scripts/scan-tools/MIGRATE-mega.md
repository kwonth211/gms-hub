# 확성기 수집기(옵션 포함) 다른 맥으로 옮기기

코드는 전부 GitHub(`kwonth211/gms-hub`, 브랜치 `codex/megaphone-item-options`)에 있다.
GitHub에 없는 것(관리자 키, 수집 상태, 글자 학습용 표본, Claude 스킬)은 `mega.sh pack` 한 파일로 옮긴다.

## 1. 지금 맥에서

```bash
~/gms-hub-mega/scripts/scan-tools/mega.sh pack      # 바탕화면에 gms-mega-move.tgz (비밀 키 포함: USB/AirDrop으로만)
~/gms-hub-mega/scripts/scan-tools/mega.sh stop      # 새 맥이 돌기 시작하면 여기는 꺼 둔다 (두 대가 동시에 클릭·업로드하지 않게)
```

상점 도구(`~/gms-hub-shop`, GitHub에 없음)도 쓸 거면 그 폴더를 통째로 복사한다.

## 2. 새 맥에서

1. 준비물 설치
   ```bash
   xcode-select --install                 # swiftc
   brew install node git gh               # node 20 이상
   gh auth login
   ```
2. 코드 받기
   ```bash
   cd ~ && gh repo clone kwonth211/gms-hub && cd gms-hub && git checkout codex/megaphone-item-options
   ```
3. 옮겨 온 파일 풀기: `cd ~ && tar xzf ~/Downloads/gms-mega-move.tgz` (받은 위치에 맞게)
4. 게임 준비 (지금 맥과 똑같이)
   - CrossOver로 MapleStory Classic World를 켜고 로그인한 뒤 자유시장에 둔다.
   - **게임 창 크기 1366 × 796**. 글자 모양표와 상점 창 위치가 이 크기를 기준으로 맞춰져 있다.
   - 화면 배율은 1배로 둔다(설정의 "보기 크기"가 실제 해상도와 같게). 레티나 2배 화면이면 캡처 크기가 달라져 글자를 못 읽는다.
   - 채팅창은 지금처럼 확성기 띠가 보이게 펼쳐 둔다.
5. 권한: 시스템 설정 > 개인정보 보호 및 보안에서 **터미널**(또는 수집기를 켜는 앱)을
   - 화면 및 시스템 오디오 녹음
   - 손쉬운 사용 (옵션 클릭에 필요)

   두 곳 모두에 추가하고 터미널을 다시 연다.
6. 설치하고 점검하기
   ```bash
   ~/gms-hub/scripts/scan-tools/mega.sh install ~/gms-hub    # node 패키지 설치 + ~/gms-hub-mega 에 복사 + 시작
   ~/gms-hub-mega/scripts/scan-tools/mega.sh doctor          # 전부 OK 여야 한다
   ~/gms-hub-mega/scripts/scan-tools/mega.sh status          # 최근 확성기가 올라오면 성공
   ```
7. 5분쯤 뒤 `mega.sh check`로 인식 품질을 확인한다. 글자가 자주 틀리면 `mega.sh learn`(10~30분).

## 3. 알아 둘 것

- 옵션 읽기 끄기/켜기: `touch ~/.config/gms-hub/mega-options-paused` / `rm` 같은 파일.
- 상점 보호: 게임 속 손가락 커서가 링크 위에 있는 게 보일 때만 누른다. 한 번 본 상점 창 자리는 누르지 않는다. 같은 링크는 최대 4번까지만 누른다.
- 상점이 닫히면 `~/gms-hub-samples/shop-closed/`에 직전 15초 화면과 수집기 입력 기록이 남는다(로그에 `SHOP CLOSED`).
- 맥을 재시동한 뒤에는 `mega.sh start`를 다시 해야 한다.
