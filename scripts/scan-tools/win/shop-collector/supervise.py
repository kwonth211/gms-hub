"""상점 수집기(runall.py)를 켜 두고, 오류로 꺼지면 마지막으로 보던 채널·방부터 다시 켠다 (2026-11-24, 사용자 지시).

사용: python supervise.py [첫채널] [끝채널] [첫방]      (runall.py 와 같은 인자)
- STOP 파일이나 End 키로 멈춘 경우(종료 코드 0)는 다시 켜지 않는다.
- 오류(Traceback 등, 종료 코드 0 아님)로 꺼지면 20초 뒤, 기록에서 마지막 '채널 N' / 'M번 방 시작' 을 찾아 그 자리부터 다시 켠다.
  방 번호가 1보다 크면 runall 은 채널을 바꾸지 않으므로 캐릭터가 그 채널에 있어야 한다(죽은 직후라 그대로 있다).
- 30분 안에 5번 넘게 죽으면 그만둔다(같은 오류로 계속 도는 것을 막는다).
기록은 records/runall_sup_<시각>.log 에 이어 쓴다.
"""
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
args = [int(a) for a in sys.argv[1:4]] + [10, 40, 1][len(sys.argv[1:4]):]
first, last, room = args
log_path = os.path.join(HERE, 'records', 'runall_sup_' + time.strftime('%m%d_%H%M%S') + '.log')
crashes = []


def say(msg):
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(time.strftime('%H:%M:%S ') + msg + '\n')


def last_place():
    ch = rm = None
    with open(log_path, encoding='utf-8', errors='replace') as f:
        for line in f:
            m = re.search(r'##### 채널 (\d+)', line)
            if m:
                ch, rm = int(m.group(1)), 1
            m = re.search(r'== (\d+)번 방 시작', line)
            if m:
                rm = int(m.group(1))
    return ch, rm


while True:
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    with open(log_path, 'ab') as out:
        code = subprocess.call([PY, os.path.join(HERE, 'runall.py'), str(first), str(last), str(room)], cwd=HERE, stdout=out, stderr=out, env=env)
    if code == 0 or os.path.exists(os.path.join(HERE, 'STOP')):
        say(f'[감시] 수집기가 정상적으로 끝남(코드 {code}) — 다시 켜지 않음')
        break
    now = time.time()
    crashes = [t for t in crashes if now - t < 1800] + [now]
    if len(crashes) > 5:
        say('[감시] 30분 안에 5번 넘게 꺼짐 — 그만둠')
        sys.exit(1)
    ch, rm = last_place()
    first, room = (ch or first), (rm or 1)
    say(f'[감시] 수집기가 오류로 꺼짐(코드 {code}) — 20초 뒤 채널 {first}의 {room}번 방부터 다시 켬 ({len(crashes)}번째)')
    time.sleep(20)
