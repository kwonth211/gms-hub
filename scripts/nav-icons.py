#!/usr/bin/env python3
"""Header menu icons in the logo's style (owner 2026-11-26: "로고아이콘급 퀄리티로"): each icon is a small lit 3D form
put on a pixel grid. Every pixel's surface normal picks a step of a hand-set colour ramp (warm in the light, cool and
violet in the shade), then a dark silhouette outline, inner contours between parts and a rim light are added, the same
recipe as the logo (~/gms-hub-discord/brand/logo-1124/pix.py).

    python3 scripts/nav-icons.py          -> assets/nav/<name>.webp (4x, smooth-scaled by the browser like the logo)
                                              and a contact sheet in /tmp/nav-icons-sheet.png
"""
import os, sys
import numpy as np
from PIL import Image

S = 48
OUT = (46, 22, 28)
L = np.array([-0.55, 0.62, 0.56]); L /= np.linalg.norm(L)
RIM = np.array([0.8, -0.1, -0.3]); RIM /= np.linalg.norm(RIM)


def hexs(*a):
    return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in a]


GOLD = hexs('#6e3a06', '#9a5a05', '#c98208', '#eda912', '#ffcc33', '#ffe270', '#fff3b8', '#ffffff')
GOLD_DEEP = hexs('#5a2c06', '#86480a', '#b2700c', '#d99410')
RED = hexs('#5c1420', '#8f1d2a', '#c22f33', '#e84a3c', '#ff6f4d', '#ff9a6e', '#ffc9a8')
CREAM = hexs('#8a6a4e', '#b8956c', '#dcbf92', '#f1dcb2', '#fff0d2', '#fffaf0')
WOOD = hexs('#3e2216', '#5f3622', '#83502f', '#a86e40', '#c98d55', '#e6b07a')
STEEL = hexs('#2e3a4e', '#4a5a74', '#6f82a0', '#9aacc8', '#c6d4ea', '#eaf2ff', '#ffffff')
BLUE = hexs('#1a2156', '#26318a', '#3247c2', '#4a67e6', '#6f8dff', '#a3b8ff', '#d7e0ff')
LEATHER = hexs('#3a1d14', '#5a2f1e', '#7d4429', '#9e5c36', '#bf7a49')
PAPER = hexs('#9a7b55', '#c4a374', '#e2c693', '#f3dfb5', '#fff1d4', '#fffaf0')
GREEN = hexs('#16402a', '#1f6b3a', '#2f9a4f', '#4cc46a', '#86e39a')


class Canvas:
    def __init__(self):
        yy, xx = np.mgrid[0:S, 0:S]
        self.X = (xx + 0.5) / S * 2 - 1
        self.Y = 1 - (yy + 0.5) / S * 2
        self.px = np.zeros((S, S, 4), np.uint8)
        self.z = np.full((S, S), -1e9)
        self.part = np.full((S, S), -1)
        self.shade = np.zeros((S, S))  # 0..1 light value, kept for detail passes

    def paint(self, ok, z, N, ramp, pid, bias=0.0, lift=None):
        lam = N @ L
        rim = np.clip(N @ RIM, 0, 1)
        v = 0.36 + 0.55 * lam + bias + 0.14 * rim
        if lift is not None:
            v = v + lift
        ok = ok & (z > self.z)
        idx = np.clip((v * len(ramp)).astype(int), 0, len(ramp) - 1)
        cols = np.array(ramp, np.uint8)[idx]
        self.px[ok, :3] = cols[ok]
        self.px[ok, 3] = 255
        self.z[ok] = z[ok]
        self.part[ok] = pid
        self.shade[ok] = v[ok]

    def local(self, c, rot):
        x, y = self.X - c[0], self.Y - c[1]
        ca, sa = np.cos(-rot), np.sin(-rot)
        return x * ca - y * sa, x * sa + y * ca

    def unrot(self, N, rot):
        ca, sa = np.cos(rot), np.sin(rot)
        nx = N[..., 0] * ca - N[..., 1] * sa
        ny = N[..., 0] * sa + N[..., 1] * ca
        return np.stack([nx, ny, N[..., 2]], -1)

    # Superellipsoid with separate xy and z roundness: q=2 gives an ellipsoid, larger q a rounded box.
    def blob(self, c, r, ramp, pid, q=2.0, qz=None, rot=0.0, mask=None, bias=0.0, taper=None):
        qz = qz or q
        x, y = self.local(c, rot)
        rx = r[0] * (taper(x) if taper else 1)
        ux, uy = np.abs(x / rx), np.abs(y / r[1])
        s = ux ** q + uy ** q
        ok = s <= 1
        if mask is not None:
            ok &= mask(x, y)
        uz = np.clip(1 - s, 0, 1) ** (1 / qz)
        z = c[2] + uz * r[2]
        gx = np.sign(x) * ux ** (q - 1) / rx
        gy = np.sign(y) * uy ** (q - 1) / r[1]
        gz = np.maximum(uz, 1e-3) ** (qz - 1) / r[2]
        N = np.stack([gx, gy, gz], -1)
        N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
        self.paint(ok, z, self.unrot(N, rot), ramp, pid, bias)
        return ok

    # Cone of revolution around the local x axis, radius a + b*x between x0 and x1 (the megaphone horn).
    def cone(self, c, a, b, x0, x1, ramp, pid, rot=0.0, bias=0.0):
        x, y = self.local(c, rot)
        r = a + b * x
        ok = (x >= x0) & (x <= x1) & (np.abs(y) <= r)
        zz = np.sqrt(np.clip(r * r - y * y, 0, None))
        z = c[2] + zz
        N = np.stack([-r * b, y, zz], -1)
        N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
        self.paint(ok, z, self.unrot(N, rot), ramp, pid, bias)
        return ok

    def flat(self, ok, color, pid=None, z=None):
        self.px[ok, :3] = color
        self.px[ok, 3] = 255
        if pid is not None:
            self.part[ok] = pid
        if z is not None:
            self.z[ok] = z

    def finish(self, contour=True, rim_parts=()):
        al = self.px[..., 3] > 0
        out = self.px.copy()
        for a in range(S):
            for b in range(S):
                if not al[a, b]:
                    if any(0 <= a + i < S and 0 <= b + j < S and al[a + i, b + j] for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        out[a, b] = (*OUT, 255)
                elif contour:
                    for i, j in ((1, 0), (0, 1)):
                        if 0 <= a + i < S and 0 <= b + j < S and al[a + i, b + j] and self.part[a + i, b + j] != self.part[a, b]:
                            # the part further back takes the line
                            if self.z[a, b] < self.z[a + i, b + j]:
                                out[a, b, :3] = (out[a, b, :3] * 0.5).astype(np.uint8)
                            else:
                                out[a + i, b + j, :3] = (out[a + i, b + j, :3] * 0.5).astype(np.uint8)
        # warm rim light on the lit (upper left) silhouette edge
        for a in range(1, S):
            for b in range(1, S):
                if al[a, b] and (not al[a - 1, b] or not al[a, b - 1]) and self.part[a, b] in rim_parts:
                    c = out[a, b, :3].astype(int)
                    out[a, b, :3] = np.clip(c + 40, 0, 255)
        return Image.fromarray(out)


def coin():
    k = Canvas()
    # a second coin behind, then the front one
    k.blob((0.30, 0.26, -0.3), (0.52, 0.52, 0.12), GOLD_DEEP + GOLD[4:6], 1, q=2, qz=5)
    k.blob((-0.12, -0.10, 0.0), (0.74, 0.74, 0.16), GOLD, 2, q=2, qz=6)
    X, Y = k.X, k.Y
    d = np.sqrt((X + 0.12) ** 2 + (Y + 0.10) ** 2)
    ring = (d > 0.54) & (d < 0.62) & (k.part == 2)
    lit = (X + 0.12) * -0.6 + (Y + 0.10) * 0.8
    k.px[ring & (lit > 0), :3] = GOLD[3]
    k.px[ring & (lit <= 0), :3] = GOLD[6]
    # the meso mark: a raised slot
    slot = (np.abs(X + 0.12) < 0.09) & (np.abs(Y + 0.10) < 0.30) & (k.part == 2)
    k.px[slot, :3] = GOLD[6]
    k.px[slot & (X + 0.12 > 0.03), :3] = GOLD[2]
    k.px[slot & (Y + 0.10 < -0.22), :3] = GOLD[2]
    # sparkle
    for (sx, sy) in ((-0.55, 0.38),):
        sp = ((np.abs(X - sx) < 0.03) & (np.abs(Y - sy) < 0.13)) | ((np.abs(Y - sy) < 0.03) & (np.abs(X - sx) < 0.13))
        k.flat(sp & (k.part == 2), (255, 255, 255))
    return k.finish(rim_parts=(1, 2))


def shop():
    k = Canvas()
    X, Y = k.X, k.Y
    # counter (wooden box) and its posts
    k.blob((0, -0.48, 0.0), (0.78, 0.32, 0.4), WOOD, 1, q=8, qz=4)
    k.blob((-0.66, 0.06, -0.3), (0.06, 0.42, 0.1), WOOD[:5], 2, q=6)
    k.blob((0.66, 0.06, -0.3), (0.06, 0.42, 0.1), WOOD[:5], 2, q=6)
    # awning: a rounded slab with red and cream stripes and a scalloped hem
    hem = lambda x, y: y > -0.20 + 0.06 * np.cos((x + 0.9) * np.pi / 0.3)
    ok = k.blob((0, 0.42, 0.2), (0.9, 0.30, 0.35), RED, 3, q=6, qz=3, mask=hem)
    band = (np.floor((X + 0.9) / 0.3).astype(int) % 2 == 1) & ok
    v = k.shade
    idx = np.clip((v * len(CREAM)).astype(int), 0, len(CREAM) - 1)
    k.px[band, :3] = np.array(CREAM, np.uint8)[idx][band]
    # roof cap
    k.blob((0, 0.74, 0.25), (0.92, 0.07, 0.3), RED[:4], 4, q=8)
    # goods on the counter: a gold coin pile and a green potion
    k.blob((-0.36, -0.12, 0.45), (0.17, 0.12, 0.12), GOLD, 5, q=2)
    k.blob((0.30, -0.08, 0.45), (0.13, 0.17, 0.13), GREEN, 6, q=2)
    k.blob((0.30, 0.12, 0.46), (0.05, 0.05, 0.05), CREAM, 7, q=2)
    # counter front plank line
    plank = (np.abs(Y + 0.48) < 0.025) & (k.part == 1)
    k.px[plank, :3] = WOOD[1]
    return k.finish(rim_parts=(1, 3, 4))


def megaphone():
    k = Canvas()
    X, Y = k.X, k.Y
    rot = 0.38
    # handle under the body
    k.blob((-0.42, -0.42, 0.05), (0.10, 0.26, 0.12), LEATHER, 1, q=4, rot=rot - 0.25)
    # body cone, white band, then the bell rim and its dark mouth
    k.cone((-0.05, 0.02, 0.0), 0.30, 0.42, -0.72, 0.62, RED, 2, rot=rot)
    x, y = k.local((-0.05, 0.02), rot)
    band = (x > -0.30) & (x < -0.16) & (k.part == 2)
    idx = np.clip((k.shade * len(CREAM)).astype(int), 0, len(CREAM) - 1)
    k.px[band, :3] = np.array(CREAM, np.uint8)[idx][band]
    rim_r = 0.30 + 0.42 * 0.62
    k.blob((0.62 * np.cos(rot) - 0.05, 0.62 * np.sin(rot) + 0.02, 0.42), (0.15, rim_r * 1.04, 0.14), RED[1:], 3, q=2, rot=rot, bias=0.08)
    k.blob((0.66 * np.cos(rot) - 0.05, 0.66 * np.sin(rot) + 0.02, 0.58), (0.09, rim_r * 0.78, 0.04), hexs('#2a0c14', '#3c1220', '#521a2a', '#6a2232'), 4, q=2, rot=rot)
    # mouthpiece
    k.blob((-0.72 * np.cos(rot) - 0.05, -0.72 * np.sin(rot) + 0.02, 0.1), (0.08, 0.20, 0.12), STEEL[1:5], 5, q=4, rot=rot)
    img = k.finish(rim_parts=(2, 3))
    # sound arcs to the upper right
    a = np.array(img)
    cx, cy = 0.80, 0.55
    for rr in (0.22, 0.36):
        d = np.sqrt((X - cx + 0.25) ** 2 + (Y - cy + 0.25) ** 2)
        arc = (np.abs(d - rr) < 0.045) & (X > cx - 0.25) & (Y > cy - 0.25) & (a[..., 3] == 0)
        a[arc] = (255, 214, 102, 255)
    return Image.fromarray(a)


def sword():
    k = Canvas()
    rot = np.pi / 4
    tip = lambda x: np.clip((0.95 - x) / 0.22, 0.15, 1.0) ** 0.6
    # blade (steel) with a central ridge, guard (gold), grip (leather), pommel (gold)
    k.blob((0.14, 0.14, 0.0), (0.17, 0.80, 0.07), STEEL, 1, q=2.6, rot=rot - np.pi / 2,
           mask=lambda x, y: np.abs(x) <= 0.17 * np.clip((0.80 - y) / 0.26, 0, 1) ** 0.8)
    x, y = k.local((0.14, 0.14), rot - np.pi / 2)
    ridge = (np.abs(x) < 0.03) & (y > -0.70) & (y < 0.58) & (k.part == 1)
    k.px[ridge, :3] = STEEL[6]
    k.blob((-0.40, -0.40, 0.2), (0.42, 0.10, 0.12), GOLD, 2, q=3, rot=-np.pi / 4)
    k.blob((-0.60, -0.60, 0.1), (0.09, 0.20, 0.08), LEATHER, 3, q=3, rot=-np.pi / 4 + np.pi / 2)
    x, y = k.local((-0.60, -0.60), np.pi / 4)
    wrap = (np.abs(((y + 0.3) / 0.09) % 1 - 0.5) < 0.18) & (k.part == 3)
    k.px[wrap, :3] = LEATHER[0]
    k.blob((-0.79, -0.79, 0.15), (0.12, 0.12, 0.10), GOLD, 4, q=2)
    k.blob((-0.40, -0.40, 0.34), (0.07, 0.07, 0.05), hexs('#5c0f2a', '#a4153e', '#e6306a', '#ff8fb3'), 5, q=2)
    return k.finish(rim_parts=(1, 2))


def scroll():
    k = Canvas()
    X, Y = k.X, k.Y
    # parchment sheet between two rolls
    k.blob((0, 0, 0.0), (0.62, 0.62, 0.08), PAPER, 1, q=10, qz=2)
    for yy in (0.66, -0.66):
        k.blob((0, yy, 0.18), (0.80, 0.13, 0.15), PAPER[:5], 2 if yy > 0 else 3, q=2.2, qz=2)
        for xx in (0.84, -0.84):
            k.blob((xx, yy, 0.2), (0.07, 0.10, 0.1), WOOD, 4, q=2)
    # text lines
    for i, yy in enumerate((0.30, 0.12, -0.06)):
        w = (0.40, 0.46, 0.30)[i]
        line = (np.abs(Y - yy) < 0.035) & (X > -0.42) & (X < -0.42 + w * 1.6) & (k.part == 1)
        k.px[line, :3] = PAPER[0]
    # red wax seal with ribbon
    k.blob((0.24, -0.30, 0.3), (0.20, 0.20, 0.08), RED, 5, q=2, qz=3)
    k.blob((0.24, -0.30, 0.42), (0.08, 0.08, 0.04), RED[3:], 6, q=2)
    return k.finish(rim_parts=(1, 2, 3))


def book():
    k = Canvas()
    X, Y = k.X, k.Y
    # page block (cream) behind/right and bottom of the cover, then the cover with spine
    k.blob((0.10, -0.08, -0.05), (0.66, 0.78, 0.2), PAPER, 1, q=10, qz=4)
    pages = (k.part == 1) & ((np.floor((Y + 1) * 24) % 2) == 0) & (X > 0.6)
    k.px[pages, :3] = PAPER[2]
    k.blob((-0.04, 0.04, 0.25), (0.68, 0.80, 0.12), BLUE, 2, q=10, qz=3)
    k.blob((-0.68, 0.04, 0.32), (0.10, 0.80, 0.12), BLUE[:5], 3, q=4)
    # gold corner guards and an emblem
    for cx, cy in ((0.50, 0.70), (0.50, -0.62)):
        k.blob((cx, cy, 0.36), (0.14, 0.12, 0.06), GOLD, 4, q=4)
    k.blob((0.04, 0.12, 0.38), (0.24, 0.24, 0.08), GOLD, 5, q=2)
    k.blob((0.04, 0.12, 0.45), (0.11, 0.11, 0.05), BLUE[3:], 6, q=2)
    # red bookmark ribbon hanging out at the bottom
    rib = (np.abs(X - 0.30) < 0.06) & (Y < -0.80) & (Y > -0.98)
    k.flat(rib & (k.px[..., 3] == 0), RED[3], pid=7, z=0.4)
    return k.finish(rim_parts=(2, 3))


ICONS = {'coin': coin, 'shop': shop, 'megaphone': megaphone, 'sword': sword, 'scroll': scroll, 'book': book}


PURPLE = hexs('#2a1240', '#46206a', '#6a3296', '#9150c4', '#b880e8', '#dcb8ff')
SLIME = hexs('#123d1c', '#1f6b2a', '#2f9a40', '#4cc45e', '#7fe08a', '#c4f7c8', '#ffffff')
LEAF = hexs('#0f3a22', '#185a30', '#23803f', '#38a852', '#62c870', '#a4e8a0')
FACE_DARK = (40, 18, 26)


def eyes(k, cx, cy, gap, w=0.07, h=0.13, part=None):
    for sx in (-1, 1):
        e = (np.abs(k.X - (cx + sx * gap)) < w) & (np.abs(k.Y - cy) < h)
        if part is not None:
            e &= np.isin(k.part, part)
        k.flat(e, FACE_DARK)
        hl = (np.abs(k.X - (cx + sx * gap) + w * 0.35) < w * 0.45) & (np.abs(k.Y - cy - h * 0.45) < h * 0.3) & e
        k.flat(hl, (255, 255, 255))


def bag():
    k = Canvas()
    X, Y = k.X, k.Y
    # strap behind, sack body, flap, gold buckle
    strap = (np.abs(np.sqrt(X ** 2 + ((Y - 0.30) / 1.1) ** 2) - 0.46) < 0.07) & (Y > 0.30)
    k.flat(strap, LEATHER[2], pid=1, z=-0.5)
    k.blob((0, -0.22, 0.0), (0.74, 0.62, 0.5), LEATHER + [WOOD[5]], 2, q=3.2, qz=2)
    k.blob((0, 0.16, 0.30), (0.70, 0.26, 0.2), LEATHER[1:] + [WOOD[5]], 3, q=3, mask=lambda x, y: y > -0.20 + 0.0 * x)
    k.blob((0, -0.10, 0.48), (0.14, 0.12, 0.06), GOLD, 4, q=4)
    seam = (np.abs(Y + 0.60) < 0.025) & (k.part == 2)
    k.px[seam, :3] = LEATHER[0]
    return k.finish(rim_parts=(2, 3))


def clock():
    k = Canvas()
    X, Y = k.X, k.Y
    k.blob((-0.50, 0.62, -0.1), (0.16, 0.14, 0.12), GOLD, 1, q=2)
    k.blob((0.50, 0.62, -0.1), (0.16, 0.14, 0.12), GOLD, 1, q=2)
    k.blob((0, -0.04, 0.0), (0.84, 0.84, 0.2), GOLD, 2, q=2, qz=4)
    k.blob((0, -0.04, 0.18), (0.66, 0.66, 0.05), CREAM, 3, q=2, qz=6)
    d = np.sqrt(X ** 2 + (Y + 0.04) ** 2)
    ang = np.arctan2(Y + 0.04, X)
    ticks = (d > 0.50) & (d < 0.60) & (np.abs(((ang / (np.pi / 6)) + 0.5) % 1 - 0.5) < 0.12) & (k.part == 3)
    k.flat(ticks, CREAM[0])
    hand_h = (np.abs(X) < 0.05) & (Y > -0.06) & (Y < 0.40) & (k.part == 3)
    hand_m = (np.abs((Y + 0.04) + (X) * 0.0) < 0.05) & (X > -0.02) & (X < 0.36) & (k.part == 3)
    k.flat(hand_h | hand_m, (52, 40, 60))
    k.flat((d < 0.08) & (k.part == 3), RED[2])
    return k.finish(rim_parts=(2,))


def star():
    k = Canvas()
    X, Y = k.X, k.Y
    cy = -0.06
    r = np.sqrt(X ** 2 + (Y - cy) ** 2)
    a = np.abs(((np.arctan2(X, Y - cy) + np.pi / 5) % (2 * np.pi / 5)) - np.pi / 5)
    # boundary radius along each ray: the edge from an outer tip (R, angle 0) to an inner corner (ri, angle pi/5)
    R, ri = 0.96, 0.44
    p1 = np.array([R, 0.0]); p2 = np.array([ri * np.cos(np.pi / 5), ri * np.sin(np.pi / 5)])
    d = p2 - p1
    ca, sa = np.cos(a), np.sin(a)
    t = (p1[0] * d[1] - p1[1] * d[0]) / (ca * d[1] - sa * d[0])
    ok = r <= t
    h = np.clip(1 - r / t, 0, 1) ** 0.75
    gy, gx = np.gradient(h * 0.9)
    N = np.stack([-gx * S / 2, gy * S / 2, np.ones_like(h)], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    k.paint(ok, h, N, GOLD, 1, bias=0.05)
    return k.finish(rim_parts=(1,))


def hammer():
    k = Canvas()
    rot = -np.pi / 4  # handle runs from lower left to upper right
    k.blob((-0.06, -0.06, 0.0), (0.085, 0.86, 0.1), WOOD, 1, q=3, rot=rot)
    x, y = k.local((-0.06, -0.06), rot)
    grip = (y < -0.36) & (k.part == 1) & (np.abs(((y + 0.36) / 0.1) % 1 - 0.5) < 0.22)
    k.px[grip, :3] = LEATHER[1]
    hx, hy = -0.06 + 0.62 * np.sin(np.pi / 4), -0.06 + 0.62 * np.cos(np.pi / 4)
    k.blob((hx, hy, 0.25), (0.56, 0.25, 0.3), STEEL, 2, q=5, qz=3, rot=rot)
    k.blob((hx, hy, 0.42), (0.10, 0.27, 0.06), GOLD, 3, q=4, rot=rot)
    return k.finish(rim_parts=(1, 2))


def slime():
    k = Canvas()
    X, Y = k.X, k.Y
    k.blob((0, -0.20, 0.0), (0.84, 0.62, 0.6), SLIME, 1, q=2.2, mask=lambda x, y: y > -0.62 + 0.0 * x,
           taper=lambda x: 1.0)
    # little top curl
    k.blob((0.02, 0.48, 0.05), (0.14, 0.18, 0.12), SLIME, 2, q=2)
    eyes(k, 0, -0.14, 0.26, w=0.07, h=0.13, part=[1])
    mouth = (np.abs(Y + 0.40) < 0.035) & (np.abs(X) < 0.12) & (k.part == 1)
    k.flat(mouth, FACE_DARK)
    # glossy highlight
    k.flat(((X + 0.42) ** 2 / 0.02 + (Y - 0.10) ** 2 / 0.008 < 1) & (k.part == 1), SLIME[6])
    return k.finish(rim_parts=(1, 2))


def tree():
    k = Canvas()
    k.blob((0, -0.62, -0.1), (0.15, 0.34, 0.12), WOOD, 1, q=3)
    for cx, cy, r, pid in ((-0.40, 0.00, 0.40, 2), (0.42, 0.04, 0.40, 3), (0.0, 0.34, 0.52, 4), (0.0, -0.14, 0.46, 5)):
        k.blob((cx, cy, 0.1 + 0.05 * pid), (r, r * 0.92, r * 0.8), LEAF, pid, q=2)
    # a few autumn leaves
    for cx, cy in ((-0.30, 0.40), (0.34, 0.24), (0.10, -0.24)):
        k.flat((np.abs(k.X - cx) < 0.06) & (np.abs(k.Y - cy) < 0.06) & (k.part >= 2), (255, 160, 60))
    return k.finish(rim_parts=(2, 3, 4, 5))


def crown():
    k = Canvas()
    X, Y = k.X, k.Y
    # band
    k.blob((0, -0.42, 0.1), (0.82, 0.20, 0.3), GOLD, 1, q=6, qz=2)
    # three points, each with a ball on top
    for cx, h in ((-0.56, 0.44), (0.0, 0.62), (0.56, 0.44)):
        top = -0.24 + h
        k.blob((cx, (-0.24 + top) / 2, 0.0), (0.24, h / 2 + 0.02, 0.22), GOLD, 2, q=2.2,
               taper=lambda x, cx=cx: 1.0, mask=lambda x, y, h=h: np.abs(x) < 0.24 * (1 - (y + h / 2) / (h + 0.01)) + 0.04)
        k.blob((cx, top + 0.04, 0.05), (0.10, 0.10, 0.1), GOLD, 3, q=2)
    # jewels on the band
    for cx, col in ((-0.46, BLUE[3:]), (0.0, RED[2:]), (0.46, GREEN[2:])):
        k.blob((cx, -0.42, 0.42), (0.11, 0.10, 0.05), col, 4, q=2)
    return k.finish(rim_parts=(1, 2, 3))


def mushroom():
    sys.path.insert(0, os.path.expanduser('~/gms-hub-discord/brand/logo-1124'))
    from pix import art
    return art(S)


ICONS.update({'bag': bag, 'clock': clock, 'star': star, 'hammer': hammer, 'slime': slime, 'tree': tree,
              'crown': crown, 'mushroom': mushroom})


# Hired-merchant booth roofs for the Shop Scan cards (owner 2026-11-26: "메이플 고상 이미지 보고 그대로"): a thatched gable
# roof over a wooden wall, one per wood colour; the card builds the sign board, the bar, posts and counter in CSS around it.
BOOTH_WOODS = {
    'gold': hexs('#6b4300', '#b9780a', '#e39a12', '#f4b81c', '#ffd34a', '#ffe98f'),
    'pink': hexs('#6e2c4c', '#b45a86', '#d784ac', '#f2a6c8', '#ffc6df', '#ffe4f0'),
    'sky': hexs('#1f4466', '#3f78a8', '#5f9bd0', '#8cc8f0', '#b4ddf8', '#dcf0ff'),
    'mint': hexs('#1f5434', '#3f8a5a', '#5fae78', '#8fd8a8', '#b6ecc6', '#dcf8e4'),
}


def booth_roof(wood):
    W, H = 75, 30
    a = np.zeros((H, W, 4), np.uint8)
    cx = (W - 1) / 2
    slope = 0.66
    rng = np.random.default_rng(7)
    teeth = rng.integers(0, 3, W)
    for y in range(H):
        for x in range(W):
            d = abs(x - cx)
            top = 2 + d * slope
            if y < top:
                continue
            band = y - top
            if d < 29 and band > 7:
                # wall inside the gable, behind the sign board: planks with dark seams
                a[y, x] = (*wood[0], 255) if (x % 7 == 0) else (*wood[1], 255)
                continue
            if band > 7 + teeth[x]:
                continue  # thatched fringe: uneven straw ends
            t = 5 if band < 1.2 else 4 if band < 3 else 3 if band < 5.5 else 2
            if (x * 3 + int(band * 2)) % 7 == 0:
                t -= 1  # straw streaks
            a[y, x] = (*wood[max(1, t)], 255)
    for x in range(int(cx) - 2, int(cx) + 3):
        for y in range(0, 3):
            a[y, x] = (*wood[1 if y == 0 else 4], 255)
    al = a[..., 3] > 0
    out = a.copy()
    for y in range(H):
        for x in range(W):
            if not al[y, x] and any(0 <= y + i < H and 0 <= x + j < W and al[y + i, x + j] for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y, x] = (*wood[0], 255)
    return Image.fromarray(out)

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'nav')
    os.makedirs(out, exist_ok=True)
    tiles = []
    for name, fn in ICONS.items():
        im = fn()
        big = im.resize((S * 4, S * 4), Image.NEAREST)
        big.save(os.path.join(out, f'{name}.webp'), 'WEBP', lossless=True, quality=100, method=6)
        tiles.append((name, im))
    for wname, wood in BOOTH_WOODS.items():
        booth_roof(wood).resize((150, 60), Image.NEAREST).save(os.path.join(out, f'roof-{wname}.webp'), 'WEBP', lossless=True, quality=100, method=6)
    # contact sheet: each icon at 4x (nearest) and 20, 24, 32 px (smooth), on light and dark, 7 per row
    per = 7
    rows = (len(tiles) + per - 1) // per
    W = 40 + per * 250
    sheet = Image.new('RGBA', (W, rows * 430), (252, 250, 246, 255))
    for r in range(rows):
        sheet.paste(Image.new('RGBA', (W, 215), (24, 26, 34, 255)), (0, r * 430 + 215))
    for i, (name, im) in enumerate(tiles):
        x = 30 + (i % per) * 250
        for y0 in (10, 225):
            y0 += (i // per) * 430
            big = im.resize((S * 4, S * 4), Image.NEAREST)
            sheet.alpha_composite(big, (x, y0))
            for j, sz in enumerate((20, 24, 32)):
                sheet.alpha_composite(big.resize((sz, sz), Image.LANCZOS), (x + 200, y0 + 10 + j * 50))
    sheet.save(sys.argv[1] if len(sys.argv) > 1 else '/tmp/nav-icons-sheet.png')
    print('wrote', ', '.join(n for n, _ in tiles))
