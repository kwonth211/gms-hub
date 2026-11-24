"""게임 창 안쪽 크기를 1366x768 로 되돌린다. 관리자 권한으로 실행해야 한다.

모니터 전원을 끄면 Windows 가 바탕화면을 1024x768 로 내리면서 게임 창을 1028x749 로 줄이고, 모니터를 다시 켜도
창은 줄어든 채 남는다. 게임은 관리자 권한으로 돌아서 보통 권한의 수집기는 창 크기를 못 바꾼다('액세스 거부').
그래서 이 스크립트를 '가장 높은 권한'으로 도는 예약 작업(GmsFixGameWindow)에 걸어 두면, 수집기가 필요할 때
`schtasks /run /tn GmsFixGameWindow` 로 부른다(2026-11-24). 결과는 records/fix_window.log 에 남긴다.
사용: python fix_window.py [너비 높이]   (기본 1366 768)
"""
import ctypes
import ctypes.wintypes as W
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
u = ctypes.WinDLL('user32', use_last_error=True)
u.FindWindowW.restype = W.HWND
u.SetWindowPos.argtypes = [W.HWND, W.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
try:
    u.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except Exception:
    pass
tw, th = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1366, 768)


def log(msg):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + msg
    print(line, flush=True)
    try:
        with open(os.path.join(HERE, 'records', 'fix_window.log'), 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


h = u.FindWindowW(None, 'MapleStory')
if not h:
    log('게임 창 없음')
    sys.exit(2)


def rects():
    c, w = W.RECT(), W.RECT()
    u.GetClientRect(h, ctypes.byref(c))
    u.GetWindowRect(h, ctypes.byref(w))
    return c, w


c, w = rects()
before = (c.right, c.bottom)
for _ in range(4):
    c, w = rects()
    if (c.right, c.bottom) == (tw, th):
        break
    bw, bh = (w.right - w.left) - c.right, (w.bottom - w.top) - c.bottom
    ctypes.set_last_error(0)
    ok = u.SetWindowPos(h, None, max(w.left, 0), max(w.top, 0), tw + bw, th + bh, 0x0014)   # NOZORDER|NOACTIVATE
    err = ctypes.get_last_error()
    time.sleep(1.0)
    if not ok:
        log(f'SetWindowPos 실패(오류 {err})')
c, w = rects()
log(f'게임 창 {before[0]}x{before[1]} → {c.right}x{c.bottom} (목표 {tw}x{th})')
sys.exit(0 if (c.right, c.bottom) == (tw, th) else 1)
