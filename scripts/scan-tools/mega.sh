#!/bin/zsh
# Megaphone collector control (admin's Mac). Usage: ./mega.sh start | stop | status | log | check | learn | install <repo>
# start runs mega-collector.mjs in the background (detached, keeps the Mac awake while it runs) and logs to
# ~/gms-hub-samples/mega-collector.log; the game must be open, but its window may be covered by other windows.
DIR=${0:A:h}
PID=~/.config/gms-hub/mega-collector.pid
LOG=~/gms-hub-samples/mega-collector.log
mkdir -p ~/.config/gms-hub ~/gms-hub-samples
running() { [[ -f $PID ]] && kill -0 $(cat $PID) 2>/dev/null; }
case $1 in
  start)
    if running; then echo "이미 수집 중 (pid $(cat $PID))"; exit 0; fi
    # loop: the collector quits by itself when its memory grows too big and is started again here
    # Give the runner its own session so a short-lived installer shell cannot hang it up before startup.
    /usr/bin/python3 - "$DIR" "$LOG" "$PID" <<'PY'
import pathlib, subprocess, sys
directory, log_path, pid_path = sys.argv[1:]
with open(log_path, 'ab', buffering=0) as log:
    child = subprocess.Popen(['/usr/bin/caffeinate', '-i', '/bin/zsh', '-c', 'while true; do node mega-collector.mjs; sleep 3; done'], cwd=directory, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
pathlib.Path(pid_path).write_text(str(child.pid) + '\n')
print(f'수집 시작 (pid {child.pid}) · 기록: {log_path}')
PY
    ;;
  stop)
    if running; then
      children=($(pgrep -P $(cat $PID)))
      for c in $children; do pkill -P $c 2>/dev/null; kill $c 2>/dev/null; done
      kill $(cat $PID) 2>/dev/null
      # Wait for tooltip cleanup before a replacement collector can send another click.
      for attempt in {1..15}; do
        left=(); for c in $children; do kill -0 $c 2>/dev/null && left+=($c); done
        (( ${#left} == 0 )) && break
        sleep 1
      done
      if (( ${#left} )); then echo "이전 수집기 종료 대기 중: $left"; exit 1; fi
      rm -f $PID; echo "수집 중지"
    else echo "수집 중이 아님"; fi ;;
  status)
    if running; then echo "수집 중 (pid $(cat $PID))"; else echo "멈춤"; fi
    echo "최근 확성기:"; grep -E '^[0-9]{2}:[0-9]{2}:[0-9]{2} ' $LOG | tail -5 ;;
  log) tail -f $LOG ;;
  check) cd $DIR && node mega-check.mjs ${2:-300} ;;
  learn)
    # Relearn the chat-font table from every kept sample, then install it here and restart.
    cd $DIR && node mega-learn.mjs ../../assets/mega-glyphs.json ${TMPDIR:-/tmp}/gms-mega-segs.json ~/gms-hub-samples/mega-frames ~/gms-hub-samples/mega-live && $0 stop && $0 start ;;
  install)
    # Copy the collector from a checkout into ~/gms-hub-mega (a fixed folder) and restart it there.
    REPO=${2:-~/gms-hub}; DEST=~/gms-hub-mega
    mkdir -p $DEST/scripts/scan-tools $DEST/assets
    cp $REPO/scripts/scan-tools/{mega-collector.mjs,mega-options.mjs,mega-check.mjs,mega-learn.mjs,mega-coverage.mjs,maple-stream.swift,maple-input.swift,maple-ocr.swift,mega.sh,package.json,package-lock.json} $DEST/scripts/scan-tools/
    cp $REPO/assets/{mega-reader.js,mega-tooltip.js,mega-glyphs.json} $DEST/assets/
    node -e "const d=require('$REPO/data/items.json');console.log(JSON.stringify([...new Set(d.items.map(i=>i.en))]))" > $DEST/assets/items-names.json
    node -e "const d=require('$REPO/data/items.json'),t=require('$REPO/data/item-details.json');console.log(JSON.stringify(d.items.map(i=>({id:i.id,en:i.en,cat:i.cat,sub:i.sub,cash:i.cash||undefined,slots:t.items[i.id]?.slots,inc:i.cat==='Use'?t.items[i.id]?.inc:undefined}))))" > $DEST/assets/items-catalog.json
    # node packages: install them in the repo checkout once (a fresh Mac has none), then link them here
    [[ -d $REPO/scripts/scan-tools/node_modules/pngjs ]] || (cd $REPO/scripts/scan-tools && npm ci --no-audit --no-fund) || exit 1
    [[ -e $DEST/scripts/scan-tools/node_modules ]] || ln -s $REPO/scripts/scan-tools/node_modules $DEST/scripts/scan-tools/node_modules
    rm -f ${TMPDIR:-/tmp}/gms-maple-window ${TMPDIR:-/tmp}/gms-maple-stream
    $DEST/scripts/scan-tools/mega.sh stop && $DEST/scripts/scan-tools/mega.sh start ;;
  pack)
    # Moving to another Mac: everything that is NOT on GitHub, in one file. Contains secret keys: never upload it.
    OUT=${2:-~/Desktop/gms-mega-move.tgz}
    cd ~ && tar czf $OUT .config/gms-hub/megaphone-token .config/gms-hub/mega-state.json \
      $( [[ -d gms-hub-samples/mega-frames ]] && echo gms-hub-samples/mega-frames ) \
      $( [[ -d gms-hub-samples/mega-live ]] && echo gms-hub-samples/mega-live ) \
      $( [[ -d .claude/skills/gms-megaphone ]] && echo .claude/skills/gms-megaphone ) 2>/dev/null
    echo "만들었어요: $OUT ($(du -h $OUT | cut -f1)) — 비밀 키가 들어 있어요. USB·AirDrop으로만 옮기고 깃헙·메신저에 올리지 마세요."
    echo "새 맥에서: cd ~ && tar xzf gms-mega-move.tgz" ;;
  doctor)
    # New-Mac check: prints OK / 문제 for each thing the collector needs.
    ok(){ echo "OK   $1"; }; bad(){ echo "문제 $1"; }
    command -v node >/dev/null && [[ $(node -p 'process.versions.node.split(".")[0]') -ge 20 ]] && ok "node $(node -v)" || bad "node 20 이상 필요 (brew install node)"
    xcrun -f swiftc >/dev/null 2>&1 && ok "swiftc" || bad "swiftc 없음 (xcode-select --install)"
    [[ -d $DIR/node_modules/pngjs ]] && ok "node 패키지" || bad "node 패키지 없음 (./mega.sh install ~/gms-hub)"
    [[ -s ~/.config/gms-hub/megaphone-token ]] && ok "관리자 키" || bad "~/.config/gms-hub/megaphone-token 없음 (pack 파일 풀기)"
    [[ -f $DIR/../../assets/items-catalog.json ]] && ok "아이템 목록" || bad "아이템 목록 없음 (./mega.sh install ~/gms-hub)"
    /usr/bin/python3 -c 'import ctypes;a=ctypes.cdll.LoadLibrary("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices");exit(0 if a.AXIsProcessTrusted() else 1)' \
      && ok "손쉬운 사용 권한" || bad "손쉬운 사용 권한 없음: 시스템 설정 > 개인정보 보호 및 보안 > 손쉬운 사용 에 터미널 추가 (옵션 클릭에 필요)"
    WID=$(/usr/bin/swift -e 'import CoreGraphics;var b=(0,0.0);for w in (CGWindowListCopyWindowInfo([.optionAll],kCGNullWindowID) as? [[String:Any]] ?? []){if (w[kCGWindowOwnerName as String] as? String ?? "").contains("MapleStory"),let r=w[kCGWindowBounds as String] as? [String:Double],let i=w[kCGWindowNumber as String] as? Int,r["Width"]!*r["Height"]!>b.1{b=(i,r["Width"]!*r["Height"]!)}};if b.0>0{print(b.0)}' 2>/dev/null)
    if [[ -z $WID ]]; then bad "게임 창 없음 (메이플 켜기)"; else
      T=${TMPDIR:-/tmp}/gms-doctor.png; rm -f $T; screencapture -x -o -l$WID $T 2>/dev/null
      if [[ -s $T ]]; then S=$(sips -g pixelWidth -g pixelHeight $T | awk '/pixel/{printf "%s ",$2}'); ok "화면 기록 권한 · 게임 창 ${S% }"
        [[ ${S% } == "1366 796" ]] || bad "게임 창 크기가 ${S% } 예요. 지금 맥과 같은 1366 796 로 맞추세요 (글자표·상점 위치가 이 크기 기준)"
      else bad "화면 기록 권한 없음: 시스템 설정 > 개인정보 보호 및 보안 > 화면 및 시스템 오디오 녹음 에 터미널 추가"; fi
    fi
    curl -s -o /dev/null -w '%{http_code}' https://gms-hub-votes.kwonth211.workers.dev/ | grep -q '^[2-4]' && ok "서버 연결" || bad "서버 연결 안 됨" ;;
  *) echo "사용법: ./mega.sh start | stop | status | log | check | learn | install <repo> | pack | doctor"; exit 1 ;;
esac
