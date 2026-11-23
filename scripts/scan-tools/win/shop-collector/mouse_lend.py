"""상점 수집기가 쥐고 있는 게임 마우스(KMBox)를 확성기 수집기에 잠깐 빌려준다 (2026-11-23).

확성기 수집기(gms-hub scripts/scan-tools, node)는 아이템 고확의 [아이템] 링크를 눌러 옵션 창을 읽는다.
KMBox(COM4)는 상점 수집기 한 프로세스만 열 수 있으므로, 상점 수집기가 127.0.0.1:47811 에서 요청을 받아
**자기 차례 사이**(다음 마우스 이동을 시작하기 직전, 누르고 있는 키가 없을 때)에 대신 눌러 준다.
사용자 지시: 확성기 옵션이 뜨면 그것부터 누르고 상점 클릭을 이어 간다.

요청: 한 줄 JSON {"action":"click|move|release","x":..,"y":..,"imgW":1366,"imgH":796,"allow":[x,y,w,h]}
      좌표는 확성기 수집기 화면 기준(게임 화면 위에 28px 제목 줄을 붙인 1366x796, 맥과 같은 모양).
응답: maple-input.swift 와 같은 JSON 줄들({"phase":"pressed","at":ms} 등) + 마지막 줄 {"exit":코드}.
      코드: 0 성공, 3 화면 크기 다름, 4 지금 못 빌려줌(바쁨), 5 게임 창이 앞이 아님/중단, 7 채팅창 밖, 8 게임 커서가 안 보임.

빌려주지 않는 때: 채널 바꾸기·구매 중(no_lend), 키를 누르고 있을 때. 1.5초 안에 차례가 안 오면 4(바쁨)로 돌려보낸다.
키보드 입력은 절대 보내지 않는다.
"""
import json
import socket
import threading
import time
from contextlib import contextmanager

PORT = 47811
PAD = 28                 # 확성기 수집기 화면의 제목 줄 높이(맥 창 캡처와 같게)
NEAR = (700, 540)        # 채팅창 바로 위 빈 곳(게임 좌표) — hold 때 포인터를 두는 자리
WAIT_TURN = 9.0          # 이만큼 안에 차례(상점 사이 틈)가 안 오면 바쁨으로 돌려보낸다
BOUNDARY_ONLY = True     # 상점 하나를 다 보고 닫은 뒤에만 빌려준다(사용자 지시 2026-11-23: 상점 → 고확 → 상점)
HOLD_IDLE = 3.0          # hold 중 다음 요청을 기다리는 시간
HOLD_MAX = 8.0           # hold 한 번의 최대 길이


def glove_score(a, c):
    """같은 자리의 이동 전(a)·후(c) 조각에서 새로 생긴 흰 픽셀(게임 손가락 커서) 수 — maple-input.swift gloveScore."""
    import numpy as np
    if a is None or c is None or a.shape != c.shape or not a.size:
        return 0
    d = np.abs(a.astype(int) - c.astype(int)).sum(axis=2)
    return int(((d > 60) & (c > 200).all(axis=2)).sum())


class Lender:
    def __init__(self, g):
        self.g = g
        self.lock = threading.Lock()
        self.q = []               # 기다리는 요청들(먼저 온 순서): dict(msg, conn, picked, done)
        self.block = 0            # no_lend 깊이
        self.busy = False         # 지금 빌려주는 중(우리 move 안에서 다시 들어오지 않게)
        self.count = 0
        self.clicked_at = 0
        self.ok = True
        try:
            self.srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.srv.bind(('127.0.0.1', PORT))
            self.srv.listen(4)
        except OSError as e:
            print(f'  (마우스 빌려주기 못 켬: {e})', flush=True)
            self.ok = False
            return
        threading.Thread(target=self._accept, daemon=True).start()

    # ---------- 소켓 쪽(별도 스레드) ----------
    def _accept(self):
        while True:
            try:
                conn, _ = self.srv.accept()
            except OSError:
                return
            threading.Thread(target=self._handle, args=(conn,), daemon=True).start()

    def _handle(self, conn):
        try:
            conn.settimeout(3)
            buf = b''
            while b'\n' not in buf:
                chunk = conn.recv(4096)
                if not chunk:
                    return
                buf += chunk
            msg = json.loads(buf.split(b'\n')[0])
            if msg.get('action') == 'click':                  # 채팅창 밖 누름은 차례를 기다리지 않고 바로 거절
                a, x, y = msg.get('allow'), msg.get('x', -1), msg.get('y', -1)
                if not a or len(a) != 4 or not (a[0] <= x <= a[0] + a[2] and a[1] <= y <= a[1] + a[3]):
                    self._send(conn, {'error': 'Click outside the allowed area (chat box only)', 'point': [x, y]}, {'exit': 7})
                    return
            r = {'msg': msg, 'conn': conn, 'picked': False, 'done': threading.Event(), 'at': time.time()}
            with self.lock:
                self.q.append(r)
            t = time.time()
            while time.time() - t < WAIT_TURN:
                with self.lock:
                    if r['picked']:
                        break
                time.sleep(.01)
            with self.lock:
                if not r['picked']:
                    self.q.remove(r)
                    self._send(conn, {'error': 'shop collector busy (no gap between shops in time)'}, {'exit': 4})
                    return
            r['done'].wait(10)
        except Exception as e:
            try:
                self._send(conn, {'error': f'lend failed: {e}'}, {'exit': 4})
            except Exception:
                pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    @staticmethod
    def _send(conn, *objs):
        for o in objs:
            conn.sendall((json.dumps(o) + '\n').encode())

    # ---------- 상점 수집기 쪽(메인 스레드) ----------
    @contextmanager
    def no_lend(self):
        self.block += 1
        try:
            yield
        finally:
            self.block -= 1

    def window(self, max_s=7.0, min_wait=0.0):
        """상점 사이 틈(상점 창이 닫혀 있고 설명창도 없을 때)에 부른다. 기다리는 확성기 요청을 모두 처리한다.

        요청이 없으면 바로 돌아간다(상점 수집은 느려지지 않는다). 링크를 하나 누른 뒤에는 다음 링크 요청이
        이어서 올 수 있어 잠깐(2.2초) 더 기다리고, 전체는 max_s 초를 넘기지 않는다."""
        if not self.ok or self.busy or self.block or getattr(self.g, '_held', None):
            return
        with self.lock:
            # min_wait: 상점 안(아이템 사이)에서 부를 때 — 요청이 이만큼 넘게 기다렸을 때만 끼워 준다.
            # 장비가 많은 상점은 15초 넘게 걸려, 그동안 확성기 줄이 밀려 사라졌다(2026-11-23 40분 집계: 못 읽은 것의 절반).
            if not self.q or time.time() - self.q[0]['at'] < min_wait:
                return
        self.busy = True
        t0 = last = time.time()
        wait, n = .25, 0
        try:
            while time.time() - t0 < max_s:
                self.g.check()
                r = self._take()
                if r is None:
                    if time.time() - last > wait:
                        break
                    time.sleep(.01)
                    continue
                act = r['msg'].get('action')
                ok = self._serve_one(r) or True
                last = time.time()
                n += 1
                # hold: 확성기 쪽이 화면을 읽고 누를 때까지 / click: 다음 링크가 이어서 올 때까지 / release: 끝
                wait = HOLD_IDLE if act == 'hold' else .4 if act == 'click' else .25
        finally:
            self.busy = False

    def serve(self):
        """상점 수집기가 마우스를 움직이기 직전에 부른다. 기다리는 요청이 있으면 먼저 처리한다."""
        if BOUNDARY_ONLY:
            return
        if not self.ok or self.busy or self.block or getattr(self.g, '_held', None):
            return
        r = self._take()
        if r is None:
            return
        self.busy = True
        try:
            hold = self._serve_one(r)
            # 'hold': 확성기 수집기가 채팅을 읽고 링크를 누를 때까지 포인터를 구석에 두고 기다린다(상점 설명창이
            # 채팅을 가리지 않게). 다음 요청이 HOLD_IDLE 초 안에 안 오거나, 클릭이 끝나거나, 'release' 가 오면 끝.
            t0 = last = time.time()
            while hold and time.time() - last < HOLD_IDLE and time.time() - t0 < HOLD_MAX:
                self.g.check()
                r = self._take()
                if r is None:
                    time.sleep(.01)
                    continue
                act = r['msg'].get('action')
                self._serve_one(r)
                last = time.time()
                if act in ('click', 'release'):
                    break
        finally:
            self.busy = False

    def _take(self):
        with self.lock:
            if not self.q:
                return None
            r = self.q.pop(0)
            r['picked'] = True
            return r

    def _serve_one(self, r):
        """요청 하나를 처리하고 응답을 보낸다 → 'hold' 요청이 성공했으면 True."""
        code = 5
        try:
            code = self._run(r['msg'], lambda o: self._send(r['conn'], o))
        except Exception as e:
            try:
                self._send(r['conn'], {'error': f'{type(e).__name__}: {e}'})
            except Exception:
                pass
            if type(e).__name__ == 'Abort':
                raise
        finally:
            try:
                self._send(r['conn'], {'exit': code})
            except Exception:
                pass
            r['done'].set()
            self.count += 1
            m = r['msg']
            print(f"{time.strftime('%H:%M:%S')}   [확성기] {m.get('action')} ({m.get('x')},{m.get('y')}) → {code}", flush=True)
        return r['msg'].get('action') == 'hold' and code == 0

    def _run(self, m, emit):
        import ctypes
        g = self.g
        u = ctypes.windll.user32
        act, x, y = m.get('action'), float(m.get('x', -1)), float(m.get('y', -1))
        if act == 'release':
            return 0
        if u.GetForegroundWindow() != g.hwnd:
            emit({'error': 'Game is not the foreground window'})
            return 5
        if act != 'hold' and (m.get('imgW'), m.get('imgH')) not in ((None, None), (1366, 768 + PAD)):
            emit({'error': 'Window size differs from the capture'})
            return 3
        cx, cy = round(x), round(y) - PAD
        if act != 'hold' and not (0 <= cx < 1366 and 0 <= cy < 768):
            emit({'error': 'Point outside client area'})
            return 3
        if act == 'click':
            a = m.get('allow')
            if not a or len(a) != 4 or not (a[0] <= x <= a[0] + a[2] and a[1] <= y <= a[1] + a[3]):
                emit({'error': 'Click outside the allowed area (chat box only)', 'point': [x, y]})
                return 7
        emit({'phase': 'before', 'mode': 'foreground', 'windowPoint': [x, y]})

        def boxes(f):
            def cut(bx, by):
                return f[max(by, 0):max(by + 32, 0), max(bx, 0):max(bx + 28, 0)].copy()
            return cut(cx - 4, cy - 6), cut(cx - 48, cy - 6)
        if act == 'hold':                                 # 포인터를 채팅창 바로 위 빈 곳으로 옮겨 상점 설명창을 닫는다
            g.move(*NEAR)                                 # (구석까지 가지 않는다 — 사용자 지시 2026-11-23: 살짝만 움직여도 닫힌다)
            emit({'phase': 'after', 'mode': 'foreground', 'hold': True})
            return 0
        if act == 'move':
            g.move(cx, cy)
            time.sleep(.12)
            emit({'phase': 'after', 'mode': 'foreground'})
            return 0
        if act != 'click':
            emit({'error': 'unknown action'})
            return 2
        gb, cb = boxes(g.frame())
        if not g.move(cx, cy):
            emit({'error': 'pointer did not reach the target'})
            return 5
        seen, last, ctrl, t = False, 0, 0, time.time()
        while time.time() - t < .5:                    # 게임 손가락 커서가 목표 위에 보일 때만 누른다
            ga, ca = boxes(g.frame())
            last, ctrl = glove_score(gb, ga), glove_score(cb, ca)
            if last >= 40 and ctrl < 20:
                seen = True
                break
        if not seen:
            emit({'error': 'Game cursor not at the target; no press', 'glove': last, 'control': ctrl})
            return 8
        emit({'phase': 'cursor_verified', 'glove': last})
        g.km.cmd('km.left(1)')
        emit({'phase': 'pressed', 'at': time.time() * 1000, 'mode': 'foreground'})
        time.sleep(.08)
        g.km.cmd('km.left(0)')
        time.sleep(.25)
        emit({'phase': 'clicked', 'at': time.time() * 1000, 'mode': 'foreground'})
        time.sleep(.38)                                  # 확성기 수집기가 옵션 창 화면을 찍는 동안
        # 옵션 창은 포인터가 조금만 움직여도 닫힌다(사용자 확인 2026-11-23). 구석까지 가지 않고 링크에서 비켜난다.
        # 두 번 나눠 움직여 확실히 닫는다(열린 채 남으면 ↑ 키가 안 먹어 방에서 못 나갔다 — 12:46, 13:57).
        g.move(min(1340, cx + 36), max(20, cy - 30))
        time.sleep(.12)
        g.move(min(1350, cx + 64), max(10, cy - 52))
        time.sleep(.08)
        self.clicked_at = time.time()
        emit({'phase': 'after', 'mode': 'foreground'})
        return 0
