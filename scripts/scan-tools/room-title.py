#!/usr/bin/env python3
"""Draws the minimap title "Free Market <N>" the way the game does and writes the pieces the shop scan compares with
(data/shop-glyphs.json, map.title): the words before the number, and one 8-pixel cell for each digit and for ">".

The game sets the title in Arial Bold 12 px, white with a dark drop shadow (found 2026-11-25 by fitting every system
font against real titles: 0.91 against the white strokes, the next font 0.80). Only the white strokes are compared, so
the shadow and the bar's own blue never count. Digits advance 7 px each.

Run on a Mac (the font ships with macOS):  python3 scripts/scan-tools/room-title.py
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFont, ImageDraw

FONT_FILE = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
FONT = ImageFont.truetype(FONT_FILE, 12)
PAD, TOP, ROWS = 4, 3, slice(3, 17)   # 14 rows hold the capitals and the descender of the bracket
PREFIX = 'Free Market <'

def draw(text):
    w = int(FONT.getlength(text)) + PAD * 2 + 4
    im = Image.new('L', (w, 20), 0)
    ImageDraw.Draw(im).text((PAD, TOP), text, fill=255, font=FONT)
    return (np.asarray(im).astype(float) / 255)[ROWS]

def levels(a):
    """Sixteen levels a pixel, one hex digit each, row after row."""
    return ''.join('%x' % min(15, int(round(v * 15))) for v in a.flatten())

start = PAD + int(round(FONT.getlength(PREFIX)))      # the column where the number begins
adv = int(round(FONT.getlength('0')))
cell = adv + 1
pre = draw(PREFIX)
x0 = int(np.nonzero(pre.max(axis=0) > 0.2)[0].min())
title = {
    'h': pre.shape[0], 'adv': adv, 'cell': cell,
    'prefix': {'w': start - x0, 'px': levels(pre[:, x0:start])},
    # Each cell is cut from a drawn title, so the edge it shares with its neighbour looks as it does on screen.
    'glyphs': {**{d: levels(draw(PREFIX + d + '>')[:, start:start + cell]) for d in '0123456789'},
               '>': levels(draw(PREFIX + '>')[:, start:start + cell])},
}
path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'shop-glyphs.json')
data = json.load(open(path))
data['map']['title'] = title
json.dump(data, open(path, 'w'), separators=(',', ':'))
print('prefix', title['prefix']['w'], 'x', title['h'], '· cell', cell, '· advance', adv, '· written to data/shop-glyphs.json')
