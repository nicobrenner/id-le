#!/usr/bin/env python3
"""Ship the chosen fonts to the game: demo/fonts/idle-fN.woff2 plus their metrics in demo/idle-fonts.js.

    python3 tools/fontgen/export.py            # from tools/fontgen/rounds/production.json

For each font it writes the woff2 (with a content hash for the cache), and a size-adjust so text set in it is not
much wider than the fallback it replaces (wider text overflowed buttons in the first try): text fonts aim at 1.08×
Arial's width, the terminal font at 1.05× Menlo's, display fonts at 1.2× Arial's. The numbers go between the
`/* fontgen:metrics */` markers of demo/idle-fonts.js. Checks every font with check_glyphs.py first.
"""
import hashlib, json, os, re, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import fontgen, check_glyphs
from fontTools.ttLib import TTFont

SAMPLE = "Oh wow, looks like you took quite the tumble there… are you ok? We have a lot of work to do"
ARIAL_EM, MENLO_EM = 41.19, 0.602 * len(SAMPLE)   # SAMPLE's width in ems, measured once (Arial.ttf, Menlo)
TARGET = {"text": (ARIAL_EM, 1.08), "mono": (MENLO_EM, 1.05), "display": (ARIAL_EM, 1.2)}
KIND = {"f1": "mono", "f3": "text", "f4": "display"}   # the rest are creature voices: short bubbles, kept whole


def width_em(ttf):
    f = TTFont(ttf); cm = f.getBestCmap(); hm = f["hmtx"]; up = f["head"].unitsPerEm
    return sum(hm[cm.get(ord(c), cm[32])][0] for c in SAMPLE) / up


def main():
    G = json.load(open(os.path.join(HERE, "rounds", "production.json")))
    out = os.path.join(ROOT, "demo", "fonts")
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="idle-fonts-")
    meta, bad = {}, []
    for k, g in G.items():
        genome = {**fontgen.default_genome(), **{a: b for a, b in g.items() if a in fontgen.GENES}}
        ttf, w2 = fontgen.build_font(genome, k, tmp)
        problems, _ = check_glyphs.check(ttf)
        if problems:
            bad.append(f"{k}: {'; '.join(problems)}")
        data = open(w2, "rb").read()
        open(os.path.join(out, f"idle-{k}.woff2"), "wb").write(data)
        kind = KIND.get(k)
        sa = 1.0
        if kind:
            ref, aim = TARGET[kind]
            sa = round(min(1.0, ref * aim / width_em(ttf)), 3)
        meta[k] = {"family": f"Idle {k.upper()}", "file": f"fonts/idle-{k}.woff2?v={hashlib.sha1(data).hexdigest()[:8]}",
                   "sa": sa, "kb": round(len(data) / 1024, 1), "label": g.get("label", k)}
    if bad:
        sys.exit("confusable glyphs, not exported:\n  " + "\n  ".join(bad))
    js = os.path.join(ROOT, "demo", "idle-fonts.js")
    s = open(js).read()
    block = "/* fontgen:metrics */ const F = " + json.dumps(meta, ensure_ascii=False) + "; /* /fontgen */"
    s2 = re.sub(r"/\* fontgen:metrics \*/.*?/\* /fontgen \*/", lambda m: block, s, flags=re.S)
    if s2 == s and block not in s:
        sys.exit("no /* fontgen:metrics */ block in demo/idle-fonts.js")
    open(js, "w").write(s2)
    for k, m in meta.items():
        print(f"{k} {m['label']:<14} {m['kb']:>5} KB  size-adjust {m['sa']}")
    print(f"total {sum(m['kb'] for m in meta.values()):.1f} KB → demo/fonts/, metrics → demo/idle-fonts.js")


if __name__ == "__main__":
    main()
