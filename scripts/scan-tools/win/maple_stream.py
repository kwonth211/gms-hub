"""윈도우용 캡처 도우미 (맥 maple-stream.swift 와 같은 약속).

사용: python maple_stream.py <out.png>
- MapleStory 창의 클라이언트 영역(1366x768)을 WGC(HDR 대응, game-automation 의 GameCapture)로 찍어
  위에 28px 제목 줄을 붙인 1366x796(맥 창 캡처와 같은 모양)으로, 최대 초당 8장 <out.png> 에 쓴다.
- 임시 파일에 쓴 뒤 이름을 바꿔 덮어쓴다(반쯤 쓴 파일을 읽지 않게).
- 창이 없으면 exit 2, 창 크기가 바뀌면 exit 3, stdin 이 닫히면 끝낸다.
"""
import os
import sys
import threading
import time

sys.path.insert(0, os.environ.get('GMS_GAME_AUTOMATION', r'C:\Users\PC\Desktop\game-automation'))
os.environ.setdefault('MAPLE_CAPTURE_INTERVAL_MS', '125')
import cv2
import numpy as np
from vision.capture import GameCapture, find_window

PAD = 28
out = sys.argv[1]
tmp = out + '.tmp.png'


def watch_stdin():
    try:
        while sys.stdin.buffer.read(1):
            pass
    except Exception:
        pass
    os._exit(0)


threading.Thread(target=watch_stdin, daemon=True).start()
if not find_window('MapleStory'):
    print('no MapleStory window', file=sys.stderr, flush=True)
    sys.exit(2)
cap = GameCapture().start()
size, last, code = None, None, 0
try:
    while True:
        t0 = time.time()
        if not find_window('MapleStory'):
            sys.exit(2)
        f, ts, seq = cap.latest()
        if f is not None and seq != last:
            last = seq
            if size is None:
                size = f.shape
            elif f.shape != size:
                print(f'window resized {size[1]}x{size[0]} -> {f.shape[1]}x{f.shape[0]}', file=sys.stderr, flush=True)
                sys.exit(3)
            img = np.empty((f.shape[0] + PAD, f.shape[1], 3), np.uint8)
            img[:PAD] = (48, 48, 48)
            img[PAD:] = f
            cv2.imwrite(tmp, img, [cv2.IMWRITE_PNG_COMPRESSION, 1])
            for _ in range(20):                        # 수집기가 읽는 중이면 윈도우는 이름 바꾸기를 막는다 → 잠깐 뒤 다시
                try:
                    os.replace(tmp, out)
                    break
                except PermissionError:
                    time.sleep(.01)
        time.sleep(max(.01, .125 - (time.time() - t0)))
except SystemExit as e:
    code = e.code if isinstance(e.code, int) else 1
finally:
    try:
        cap.stop()
    finally:
        sys.stderr.flush()
        os._exit(code)
