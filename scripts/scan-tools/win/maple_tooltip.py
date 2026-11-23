"""확성기 아이템 링크를 눌러 뜬 옵션 창을, 상점 수집기의 글자 모양표(price-collector/equip_opts.py)로 정확히 읽는다.

Tesseract 글자 인식은 느리고(건당 수 초) 능력치를 빠뜨린다. 상점 수집기는 같은 모양의 설명창을 픽셀 모양 대조로
틀림 없이 읽고 있으므로 그 판독기를 그대로 쓴다. 모르는 글자·이름표가 하나라도 있으면 null(추측하지 않는다).

사용: python maple_tooltip.py <frame.png> <panelX> <itemId>
  frame.png  확성기 수집기 화면(위에 28px 제목 줄이 붙은 1366x796) — 클릭 뒤 옵션 창이 떠 있는 장면
  panelX     옵션 창 왼쪽 끝 x
stdout: {"opts":{"slots":..,"ups":..,"used":..,"clean":..,"stats":{..}},"upsUnread":bool} 또는 null
"""
import json
import os
import sys

PC = os.environ.get('GMS_PRICE_COLLECTOR', r'C:\Users\PC\Desktop\price-collector')
sys.path.insert(0, PC)
import cv2
import equip_opts as E

PAD = 28


def read(frame, panel_x, item_id, T=None, B=None):
    T = T or E.TooltipReader()
    B = B or E.BaseStats()
    base, base_slots = B.get(item_id)
    best = None
    for dx in (0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10, 12, -12):
        x0 = panel_x + dx
        if x0 < 0 or x0 + E.WIDTH > frame.shape[1]:
            continue
        f = frame.copy()
        strip = f[:, x0:x0 + E.WIDTH]
        thin = (strip[:, :, 0] == 223) & (strip[:, :, 1] == 255) & (strip[:, :, 2] == 255)
        cols = thin.any(axis=0).nonzero()[0]
        if not len(cols):
            continue
        # 게임 손가락 커서(흰색)가 옵션 창 왼쪽 끝에 걸쳐 있으면 값의 굵은 흰 글자로 잘못 잡힌다 → 이름표가 시작하는
        # 열보다 왼쪽의 흰 픽셀은 지운다(2026-11-23: Magic Attack·Critical Damage 줄이 통째로 빠졌음).
        left = strip[:, :cols[0]]
        left[left.min(axis=2) >= 250] = 0
        cur = (x0 - 8, 0)
        T.unknown = None
        r = T.read(f, cur)
        if r is None:
            continue
        if base_slots and 'SLOTS' not in r:            # 남은 횟수 줄이 안 보이면 창이 잘렸거나 덜 읽은 것
            continue
        ups = T.successes(f, cur)
        o = E.EquipOptions.from_tooltip(r, base, base_slots, ups=ups)
        if o is None:
            continue
        p = o.payload()
        unread = ups is None
        if unread:
            p.pop('ups', None)
        score = len(p.get('stats', {})) + ('slots' in p) - unread
        if best is None or score > best[0]:
            best = (score, {'opts': p, 'upsUnread': unread})
    return best[1] if best else None


if __name__ == '__main__':
    img = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
    if img is None:
        print('null')
        sys.exit(3)
    print(json.dumps(read(img[PAD:], int(float(sys.argv[2])), int(sys.argv[3]))))
