#!/bin/zsh
# Market collector browser (admin's Mac). Usage: ./collector.sh start | stop | restart | status | show | hide | log | run
# The shop-listing collector is a Chrome extension; it needs a browser whose timers are never throttled while its
# window is covered or on another Space (the game): covered, it read 2-4 shops a minute, in front 40. So it gets its
# own browser (Chrome for Testing, which still accepts --load-extension), started with throttling switched off and the
# unpacked extension loaded, separate from the browser the admin uses. `run` keeps it in the foreground (for launchd);
# `start` detaches it. No startup window: the extension opens the one collector window itself; --test-type hides the
# "automated testing only" bar and Translate is off, so nothing pops up over the page. Port 9223 (local only) is the DevTools protocol, so the extension's service worker can be inspected
# from a script (`status` does not need it). Install the browser once with:
#   npx -y @puppeteer/browsers install chrome@stable --path ~/gms-hub-collector/browsers
DIR=${0:A:h}
EXT=${GMS_COLLECTOR_EXT:-$DIR/extension}
PROFILE=~/gms-hub-collector/profile
LOG=~/gms-hub-samples/market-collector.log
PID=~/.config/gms-hub/market-collector.pid
API=https://gms-hub-votes.kwonth211.workers.dev
mkdir -p ~/.config/gms-hub ~/gms-hub-samples $PROFILE
APP=$(ls -d ~/gms-hub-collector/browsers/chrome/*/*/Google\ Chrome\ for\ Testing.app/Contents/MacOS/Google\ Chrome\ for\ Testing 2>/dev/null | tail -1)
ARGS=(--user-data-dir=$PROFILE --load-extension=$EXT
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
  --disable-features=IntensiveWakeUpThrottling,Translate,TranslateUI --disable-hang-monitor
  --no-first-run --no-default-browser-check --disable-session-crashed-bubble --hide-crash-restore-bubble
  --remote-debugging-port=9223 --remote-allow-origins=http://127.0.0.1:9223
  --test-type --no-startup-window --window-size=1100,800 --window-position=40,60)
# With a window by default: since 2026-11-13 19:35 the source site answers a headless browser with its human check
# ("잠시만 기다리십시오"), and the clearance passed once in the windowed browser does not carry over to headless. The
# extension keeps exactly one collector window (reused every run, never focused), which can sit behind other windows or
# on another Space. GMS_COLLECTOR_HEADLESS=1 (or `hide`) tries headless again.
[[ ${GMS_COLLECTOR_HEADLESS:-0} == 1 ]] && ARGS=(--headless=new $ARGS)
running() { [[ -f $PID ]] && kill -0 $(cat $PID) 2>/dev/null; }
need_app() { [[ -n $APP && -x $APP ]] || { echo "수집용 브라우저가 없습니다: npx -y @puppeteer/browsers install chrome@stable --path ~/gms-hub-collector/browsers"; exit 1; }; }
case $1 in
  run) need_app; rm -rf "$PROFILE/Default/Extension Scripts" "$PROFILE/Default/Extension Rules" "$PROFILE/Default/Code Cache" "$PROFILE/Default/Service Worker"; exec caffeinate -i $APP $ARGS >> $LOG 2>&1 ;;
  start)
    if running; then echo "이미 실행 중 (pid $(cat $PID))"; exit 0; fi
    need_app
    # The browser caches extension scripts (the background service worker in "Service Worker"); dropping those caches makes
    # edited extension files take effect on start. Without it a restart kept running the old background code.
    rm -rf "$PROFILE/Default/Extension Scripts" "$PROFILE/Default/Extension Rules" "$PROFILE/Default/Code Cache" "$PROFILE/Default/Service Worker"
    nohup caffeinate -i $APP $ARGS >> $LOG 2>&1 &
    echo $! > $PID; echo "수집 브라우저 시작 (pid $!) · 기록: $LOG" ;;
  stop)
    if running; then pkill -P $(cat $PID) 2>/dev/null; kill $(cat $PID) 2>/dev/null; rm -f $PID; echo "수집 브라우저 중지"; else echo "실행 중 아님"; fi ;;
  restart) $0 stop; sleep 2; $0 start ;;
  status)
    if running; then echo "수집 브라우저 실행 중 (pid $(cat $PID))"; else echo "수집 브라우저: 이 스크립트로 띄운 것 없음 (launchd로 돌면 정상)"; fi
    pgrep -fl "Google Chrome for Testing" | head -1 | awk '{print "브라우저 프로세스 pid", $1}'
    [[ $(launchctl getenv GMS_COLLECTOR_HEADLESS) == 1 ]] && echo "창 없는 모드 (보안 화면에 막히면 ./collector.sh show)"
    curl -s --max-time 10 "$API/market/collector" | python3 -c '
import json, sys, time
d = json.load(sys.stdin); h = d.get("heartbeat")
if h:
    el = (time.time() * 1000 - (h.get("startedAt") or time.time() * 1000)) / 60000
    print("확장 %s · %s · 상점 %s · 매물 %s · %.1f분 경과 · 가려짐 %s · 보고 %s초 전 · 오류 %s" % (h.get("version"), h.get("phase"), h.get("shops"), h.get("rows"), el, h.get("hidden"), h.get("ageSeconds"), h.get("error")))
else:
    print("상태 보고 없음")
print("상태", d.get("state"), "· 마지막 저장", d.get("lastSuccessAt"), "· 오늘", d.get("todayRows"), "건")
for r in d.get("runs", [])[:3]: print("  ", r["at"], "상점", r["shops"], "저장", r["accepted"])' ;;
  # `hide` restarts the launchd-run browser headless (no window; the site currently blocks that), `show` back to the
  # one collector window (the default).
  show) launchctl unsetenv GMS_COLLECTOR_HEADLESS; pkill -f "Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"; echo "수집 창 1개 모드로 다시 띄웁니다" ;;
  hide) launchctl setenv GMS_COLLECTOR_HEADLESS 1; pkill -f "Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"; echo "창 없는 모드로 다시 띄웁니다 (보안 화면에 막히면 ./collector.sh show)" ;;
  log) tail -f $LOG ;;
  *) echo "사용법: ./collector.sh start | stop | restart | status | show | hide | log | run"; exit 1 ;;
esac
