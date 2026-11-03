#!/usr/bin/env python3
"""Confusable glyphs: does each font keep l apart from !, D from O, and N from its mirror image (И)?

    python3 tools/fontgen/check_glyphs.py ~/Desktop/idle-trailers/fonts/round1/*.ttf

Each glyph is filled into a bitmap straight from its outlines (our fonts are polygons only), both glyphs are
scaled to the same box, and the share of ink pixels that differ is the distance. Round 1 failed here in Nico's
screenshots: "a smal! language mode!" (f3's cut l), "THE IO|LE GAZETTE" (f4's D), a reversed-looking N (f4).
Needs fontTools and Pillow.
"""
import sys

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw

PAIRS = [("D", "O"), ("zero", "O")]     # must not look alike (same scale, same origin)
ONE_PIECE = ["l", "one"]                # must stay one connected shape: a gap in the stem reads as "!"
WORDS = ["Id|le", "small model", "GENESIS", "DOC"]
THRESHOLD = 0.22     # share of differing ink pixels below which two glyphs count as confusable


def bitmap(font, name, px=64):
    """The glyph filled from its outlines on a fixed canvas (same scale and origin for every glyph)."""
    glyf = font["glyf"]; g = glyf[name]
    s = px / font["head"].unitsPerEm
    import math
    shear = math.tan(math.radians(-font["post"].italicAngle))   # look at slanted fonts upright
    im = Image.new("L", (int(px * 2.2), int(px * 1.4)), 0)
    d = ImageDraw.Draw(im)
    if g.numberOfContours > 0:
        coords, ends, _ = g.getCoordinates(glyf)
        start = 0
        for e in ends:
            pts = [((x - y * shear) * s + px * 0.2, px * 1.1 - y * s) for x, y in coords[start:e + 1]]
            if len(pts) >= 3:
                d.polygon(pts, fill=255)
            start = e + 1
    return im


def ink(im):
    return [v > 127 for v in im.tobytes()]


def distance(a, b):
    A, B = ink(a), ink(b)
    union = sum(x or y for x, y in zip(A, B))
    return sum(x != y for x, y in zip(A, B)) / max(union, 1)


def pieces(im):
    """Connected ink components (4-neighbour flood fill)."""
    w, h = im.size; A = ink(im); seen = [False] * len(A); n = 0
    for i, v in enumerate(A):
        if v and not seen[i]:
            n += 1; stack = [i]; seen[i] = True
            while stack:
                j = stack.pop(); x, y = j % w, j // w
                for k in ((j - 1) if x else -1, (j + 1) if x < w - 1 else -1, j - w, j + w):
                    if 0 <= k < len(A) and A[k] and not seen[k]:
                        seen[k] = True; stack.append(k)
    return n


def corners(im):
    """Is each corner of the glyph's box inked? (top-left, top-right, bottom-left, bottom-right)"""
    x0, y0, x1, y1 = im.getbbox(); c = max(2, (x1 - x0) // 10)
    def full(xa, ya):
        box = im.crop((xa, ya, xa + c, ya + c)).tobytes()
        return sum(v > 127 for v in box) > 0.5 * len(box)
    return full(x0, y0), full(x1 - c, y0), full(x0, y1 - c), full(x1 - c, y1 - c)


def side_stems(im):
    """Share of the glyph's height covered by ink in its leftmost and rightmost columns band."""
    bb = im.getbbox(); w, h = im.size; A = ink(im)
    x0, y0, x1, y1 = bb; band = max(2, (x1 - x0) // 8)
    def cover(xa, xb):
        rows = sum(any(A[y * w + x] for x in range(xa, xb)) for y in range(y0, y1))
        return rows / max(y1 - y0, 1)
    return cover(x0, x0 + band), cover(x1 - band, x1)


def check(path):
    f = TTFont(path)
    cmap = f.getBestCmap()
    problems, scores = [], {}
    for w in WORDS:
        for ch in w:
            if ch != " " and (ord(ch) not in cmap or f["glyf"][cmap[ord(ch)]].numberOfContours == 0):
                problems.append(f"'{ch}' of {w!r} draws nothing")
    for a, b in PAIRS:
        dist = distance(bitmap(f, a), bitmap(f, b))
        scores[f"{a}/{b}"] = round(dist, 2)
        if dist < THRESHOLD:
            problems.append(f"{a} and {b} differ by only {dist:.2f}")
    for g in ONE_PIECE:
        n = pieces(bitmap(f, g))
        scores[f"{g} pieces"] = n
        if n != 1:
            problems.append(f"{g} is {n} pieces (reads as !)")
    # D: a straight back (both left corners inked) and a cut front (right corners empty), whatever O looks like
    tl, tr, bl, br = corners(bitmap(f, "D"))
    scores["D corners"] = "".join("#" if v else "." for v in (tl, tr, bl, br))
    if not (tl and bl) or (tr and br):
        problems.append(f"D has no straight back or no cut front (corners {scores['D corners']}): reads as O")
    # N: both stems as tall as H's (round 1's f4 cut N's acute corners into a zigzag)
    nl, nr = side_stems(bitmap(f, "N")); hl, hr = side_stems(bitmap(f, "H"))
    ratio = min(nl / max(hl, 1e-6), nr / max(hr, 1e-6))
    scores["N/H stems"] = round(ratio, 2)
    if ratio < 0.85:
        problems.append(f"N's stems are {ratio:.2f} of H's: N looks bent")
    return problems, scores


if __name__ == "__main__":
    bad = 0
    for p in sys.argv[1:]:
        problems, scores = check(p)
        bad += bool(problems)
        print(p.rsplit("/", 1)[-1], scores, "OK" if not problems else "PROBLEMS: " + "; ".join(problems))
    sys.exit(1 if bad else 0)
