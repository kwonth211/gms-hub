"""윈도우용 글자 인식 도우미 (맥 maple-ocr.swift 와 같은 약속, Tesseract eng).

사용: python maple_ocr.py <png> [itemName] [scale]
stdout: JSON 배열 [{text, confidence(0~1), x, y, w, h, valueBounds?, itemBounds?, itemInBrackets?}] — scale 배로 키운 이미지의 픽셀 좌표(맥과 같음).
"""
import json
import os
import subprocess
import sys

import cv2

TESS = os.environ.get('GMS_TESSERACT', r'C:\Program Files\Tesseract-OCR\tesseract.exe')
args = sys.argv
if len(args) < 2:
    sys.exit(2)
img = cv2.imread(args[1], cv2.IMREAD_COLOR)
if img is None:
    sys.exit(3)
name = args[2] if len(args) > 2 else ''
try:
    scale = float(args[3]) if len(args) > 3 else 1.0
except ValueError:
    scale = 1.0
if not (1 < scale <= 3):
    scale = 1.0
# Tesseract 는 작은 도트 글씨를 1배로는 잘 못 읽는다: 최소 2배로 키우고(좌표는 원래 이미지 기준으로 돌려줌),
# 회색으로 바꿔 어두운 바탕(옵션 창)은 뒤집어 '흰 바탕 검은 글씨'로 만든다(2026-11-23 cape 표본으로 비교).
req = scale                 # 좌표는 맥 도우미처럼 '요청한 배율로 키운 이미지' 픽셀로 돌려준다(부르는 쪽이 배율로 나눈다)
scale = max(scale, 2.0)
work = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
work = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
if work.mean() < 128:
    work = 255 - work
ok, buf = cv2.imencode('.png', work)
try:
    r = subprocess.run([TESS, 'stdin', 'stdout', '-l', 'eng', '--psm', '6', 'tsv'], input=buf.tobytes(),
                       capture_output=True, timeout=3.8, creationflags=0x08000000)
except Exception:
    print('maple_ocr: recognition failed', file=sys.stderr)
    sys.exit(4)
rows = {}
for ln in r.stdout.decode('utf-8', 'replace').splitlines()[1:]:
    p = ln.split('\t')
    if len(p) < 12 or p[0] != '5' or not p[11].strip():
        continue
    key = (int(p[2]), int(p[3]), int(p[4]))
    rows.setdefault(key, []).append({'t': p[11], 'c': float(p[10]), 'x': int(p[6]), 'y': int(p[7]), 'w': int(p[8]), 'h': int(p[9])})


def box(ws):
    x0 = min(w['x'] for w in ws); y0 = min(w['y'] for w in ws)
    x1 = max(w['x'] + w['w'] for w in ws); y1 = max(w['y'] + w['h'] for w in ws)
    k = req / scale
    return {'x': x0 * k, 'y': y0 * k, 'w': (x1 - x0) * k, 'h': (y1 - y0) * k}


out = []
# 창 테두리·글머리 점이 '|', '*', ';' 같은 낱자로 읽혀 줄 상자를 키운다 → 글자·숫자가 없는 맨 앞 조각은 버린다.
alnum = lambda t: any(c.isalnum() for c in t)
for key in sorted(rows, key=lambda k: min(w['y'] for w in rows[k])):
    ws = sorted(rows[key], key=lambda w: w['x'])
    while ws and not alnum(ws[0]['t']) and ws[0]['t'] != '[':
        ws.pop(0)
    hs = sorted(w['h'] for w in ws if alnum(w['t']))
    if not hs:
        continue
    med = hs[len(hs) // 2]
    ws = [w for w in ws if alnum(w['t']) or w['h'] <= med * 1.6]
    if ws and ws[0]['t'][:1] in '*«»+•·' and len(ws[0]['t']) > 2 and ws[0]['t'][1].isalpha():
        ws[0] = dict(ws[0], t=ws[0]['t'][1:])
    # 제목 줄 앞에 글머리 점·아이콘이 'E', 'F' 같은 짧은 조각으로 붙는다 → 아이템 이름 바로 앞의 짧은 조각(3자 이하)은 버린다.
    if name:
        joined = ' '.join(w['t'] for w in ws)
        i = joined.lower().find(name.lower())
        if 0 < i <= 4:
            n, acc = 0, 0
            while n < len(ws) and acc + len(ws[n]['t']) + 1 <= i:
                acc += len(ws[n]['t']) + 1
                n += 1
            ws = ws[n:]
    text, spans = '', []
    for w in ws:
        if text:
            text += ' '
        spans.append((len(text), len(text) + len(w['t'])))
        text += w['t']
    res = {'text': text, 'confidence': max(0.0, sum(w['c'] for w in ws) / len(ws) / 100), **box(ws)}
    ci = text.find(':')
    if ci >= 0:
        after = [w for w, (a, b) in zip(ws, spans) if a > ci or (a <= ci < b and b - 1 > ci)]
        after = [w for w, (a, b) in zip(ws, spans) if a > ci] or after
        if after:
            res['valueBounds'] = box(after)
    if name:
        i = text.lower().find(name.lower())
        if i >= 0:
            j = i + len(name)
            hit = [w for w, (a, b) in zip(ws, spans) if a < j and b > i]
            if hit:
                res['itemBounds'] = box(hit)
            res['itemInBrackets'] = text[:i].rstrip()[-1:] == '[' or text[j:].lstrip()[:1] == ']'
    out.append(res)
print(json.dumps(out))
