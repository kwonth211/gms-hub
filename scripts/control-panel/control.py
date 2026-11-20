#!/usr/bin/python3
"""Local control bridge. Runs existing bots under Terminal's capture permission."""
import json
import fcntl
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time

BASE = Path.home()
CONFIG = BASE / '.config/gms-hub'
CONFIG.mkdir(parents=True, exist_ok=True)
HERE = Path(__file__).resolve().parent
SHOP = BASE / 'gms-hub-shop/raycast'
MEGA = BASE / 'gms-hub-mega/scripts/scan-tools/mega.sh'
PAUSE = CONFIG / 'mega-options-paused'
MARKER = 'Paused by GMS Hub Control while a shop task runs\n'
STATE = CONFIG / 'control-panel.json'
LOG = BASE / 'gms-hub-samples/shop-control.log'
ACTIONS = {'list': 'shop-list.sh', 'sold': 'shop-sold.sh', 'grey': 'shop-grey.sh'}
NAMES = {'list': '상점 올리기', 'sold': '메소·판매 내역 확인', 'grey': '팔린 아이템 시트 정리'}


def pids(pattern):
    result = subprocess.run(['/usr/bin/pgrep', '-f', pattern], capture_output=True, text=True)
    return [int(p) for p in result.stdout.split() if p.isdigit()]


def shop_running():
    return bool(pids(r'python3 -u (sync|shop|sold|done)\.py') or pids(r'control\.py run-shop (list|sold|grey)$'))


def mega_running():
    return bool(pids(r'^node mega-collector\.mjs$'))


def note(message, error=False):
    STATE.write_text(json.dumps({'message': message, 'error': error, 'at': time.time()}, ensure_ascii=False))


def tail(path, lines=16):
    try:
        with path.open('rb') as f:
            f.seek(max(0, path.stat().st_size - 12000))
            return f.read().decode('utf8', errors='replace').splitlines()[-lines:]
    except OSError:
        return []


def terminal(command):
    # open -g preserves the current app. Terminal supplies the already-granted
    # screen capture permission to the existing runners; no AppleScript needed.
    launcher = CONFIG / ('control-' + command.replace(' ', '-') + '.command')
    launcher.write_text('#!/bin/zsh\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nexec /usr/bin/python3 ' + shlex.quote(str(HERE / 'control.py')) + ' ' + command + '\n')
    launcher.chmod(0o700)
    subprocess.run(['/usr/bin/open', '-g', '-a', 'Terminal', str(launcher)], check=True)


def run_shop(action):
    lock = (CONFIG / 'control-shop.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        note('이미 상점 작업을 시작하고 있습니다.', True)
        return
    owned_pause = False
    try:
        if pids(r'python3 -u (sync|shop|sold|done)\.py'):
            note('이미 실행 중인 상점 작업이 있습니다.', True)
            return
        if not PAUSE.exists():
            PAUSE.write_text(MARKER)
            owned_pause = True
        note(NAMES[action] + ' 실행 중')
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open('ab', buffering=0) as log:
            log.write(('\n[' + time.strftime('%H:%M:%S') + '] ' + NAMES[action] + '\n').encode())
            result = subprocess.run(['/bin/zsh', '-o', 'pipefail', str(SHOP / ACTIONS[action])], stdout=log, stderr=subprocess.STDOUT)
        note(NAMES[action] + (' 완료' if result.returncode == 0 else ' 종료 — 아래 실행 기록을 확인해 주세요.'), result.returncode != 0)
    finally:
        if owned_pause and PAUSE.exists() and PAUSE.read_text() == MARKER:
            PAUSE.unlink()
        lock.close()


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if command == 'status':
        shop_active = shop_running()
        if not shop_active and PAUSE.exists() and PAUSE.read_text() == MARKER:
            PAUSE.unlink()
        try:
            state = json.loads(STATE.read_text())
        except (OSError, ValueError):
            state = {'message': '실행할 기능을 선택해 주세요.', 'error': False}
        state.update(shop_running=shop_active, mega_running=mega_running(), options_paused=PAUSE.exists(),
                     shop_log='\n'.join(tail(LOG)), mega_log='\n'.join(tail(BASE / 'gms-hub-samples/mega-collector.log')))
        print(json.dumps(state, ensure_ascii=False))
    elif command == 'shop-start':
        action = sys.argv[2]
        if action not in ACTIONS:
            raise ValueError('Unknown shop action')
        if shop_running():
            note('이미 상점 작업이 실행 중입니다.', True)
        else:
            note(NAMES[action] + ' 시작 중…')
            terminal('run-shop ' + action)
    elif command == 'run-shop':
        action = sys.argv[2]
        if action not in ACTIONS:
            raise ValueError('Unknown shop action')
        run_shop(action)
    elif command == 'shop-stop':
        subprocess.run(['/bin/zsh', str(SHOP / 'shop-stop.sh')], capture_output=True)
        note('상점 작업 중지를 요청했습니다.')
    elif command == 'mega-start':
        if mega_running():
            note('고확은 이미 수집 중입니다.')
        elif shop_running():
            note('상점 작업이 끝난 뒤 고확 수집을 시작해 주세요.', True)
        else:
            note('고확 수집 시작 중…')
            terminal('run-mega')
    elif command == 'run-mega':
        if not mega_running():
            result = subprocess.run(['/bin/zsh', str(MEGA), 'start'], capture_output=True, text=True)
            note('고확 수집을 시작했습니다.' if result.returncode == 0 else '고확 수집 시작 실패: ' + (result.stderr.strip() or result.stdout.strip()), result.returncode != 0)
    elif command == 'mega-stop':
        result = subprocess.run(['/bin/zsh', str(MEGA), 'stop'], capture_output=True, text=True)
        for _ in range(30):
            if not mega_running():
                break
            time.sleep(.5)
        note('고확 수집을 중지했습니다.' if not mega_running() else '수집기 종료를 기다리는 중입니다.', mega_running())
    else:
        raise ValueError('Unknown command')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        note('실행 오류: ' + str(error), True)
        print(str(error), file=sys.stderr)
        sys.exit(1)
