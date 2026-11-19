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
    cd $DIR && nohup caffeinate -i zsh -c 'while true; do node mega-collector.mjs; sleep 3; done' >> $LOG 2>&1 &
    echo $! > $PID; echo "수집 시작 (pid $!) · 기록: $LOG" ;;
  stop)
    if running; then for c in $(pgrep -P $(cat $PID)); do pkill -P $c 2>/dev/null; kill $c 2>/dev/null; done; kill $(cat $PID) 2>/dev/null; rm -f $PID; echo "수집 중지"; else echo "수집 중이 아님"; fi ;;
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
    cp $REPO/scripts/scan-tools/{mega-collector.mjs,mega-check.mjs,mega-learn.mjs,maple-stream.swift,mega.sh,package.json} $DEST/scripts/scan-tools/
    cp $REPO/assets/mega-reader.js $REPO/assets/mega-glyphs.json $DEST/assets/
    node -e "const d=require('$REPO/data/items.json');console.log(JSON.stringify([...new Set(d.items.map(i=>i.en))]))" > $DEST/assets/items-names.json
    [[ -e $DEST/scripts/scan-tools/node_modules ]] || ln -s ~/gms-hub/scripts/scan-tools/node_modules $DEST/scripts/scan-tools/node_modules
    rm -f ${TMPDIR:-/tmp}/gms-maple-window ${TMPDIR:-/tmp}/gms-maple-stream
    $DEST/scripts/scan-tools/mega.sh stop; $DEST/scripts/scan-tools/mega.sh start ;;
  *) echo "사용법: ./mega.sh start | stop | status | log | check | learn | install <repo>"; exit 1 ;;
esac
