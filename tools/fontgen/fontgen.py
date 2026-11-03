#!/usr/bin/env python3
"""Id|le's own typeface, grown from a genome.

Every glyph is a skeleton of straight strokes on a small grid (Id|le is made of glyphs, boxes and pipes, so the
letters are too). A genome decides how the skeleton becomes ink: vector strokes or pixels, weight, corners
(square, chamfered, round), x-height, width, terminals, the pipe cut through the stems (the | of Id|le), the
shape of dots, aperture, slant, monospace or proportional, spacing.

    python3 tools/fontgen/fontgen.py genome.json out_dir/        # → out_dir/<name>.ttf and .woff2
    python3 tools/fontgen/fontgen.py --random 8 --seed 1 out_dir/

Original design: the skeletons below were written by hand for this tool, no existing font was traced or used.
Needs fontTools (and brotli for .woff2).
"""
import json, math, os, random, sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
CAP, ASC, DESC = 700, 760, -210

# the genome: name → (kind, choices or [lo, hi], default)
GENES = {
    "render":      ("choice", ["vector", "pixel"], "vector"),
    "weight":      ("float", [55, 130], 85),            # stroke weight in font units (of 1000)
    "corner":      ("choice", ["square", "chamfer", "round"], "chamfer"),
    "corner_size": ("float", [0.15, 0.6], 0.35),        # share of the shorter side that a corner eats
    "xheight":     ("float", [0.62, 0.80], 0.72),       # x-height as a share of the cap height
    "width":       ("float", [0.80, 1.20], 1.0),        # glyph width factor
    "terminal":    ("choice", ["flat", "square", "angled"], "flat"),
    "pipe":        ("choice", [0, 1, 2], 1),           # 0 no cut · 1 cut in I l i | ! · 2 cut in every tall stem
    "pipe_pos":    ("float", [0.30, 0.62], 0.45),       # where the cut sits, as a share of the stem
    "pipe_gap":    ("float", [0.5, 1.4], 0.8),          # gap height in stroke weights
    "dot":         ("choice", ["square", "round", "diamond", "bar"], "square"),
    "aperture":    ("float", [0.0, 1.0], 0.5),          # 0 closed hooks on c, e, s, C, S · 1 wide open
    "slant":       ("float", [0, 9], 0),                # degrees
    "mono":        ("choice", [False, True], False),
    "pixel_shape": ("choice", ["square", "dot"], "square"),  # pixel render only
    "tracking":    ("float", [40, 110], 70),            # side bearing in font units
}


def default_genome():
    return {k: v[2] for k, v in GENES.items()}


def random_genome(rng):
    g = {}
    for k, (kind, rngdef, _) in GENES.items():
        g[k] = rng.choice(rngdef) if kind == "choice" else round(rng.uniform(*rngdef), 3)
    return g


# ---------------------------------------------------------------- skeletons
# A glyph is (width factor, [stroke, ...]); a stroke is ("P", pts) open polyline, ("L", pts) closed loop,
# or ("D", (x, y)) a dot. x runs 0..1 across the glyph, y in font units (baseline 0).

def P(*pts): return ("P", list(pts))
def L(*pts): return ("L", list(pts))
def D(x, y): return ("D", (x, y))
def box(x0, y0, x1, y1): return L((x0, y0), (x0, y1), (x1, y1), (x1, y0))


def skeletons(g):
    X = CAP * g["xheight"]
    M, H, A, Dn, C = X / 2, CAP / 2, ASC, DESC, CAP
    k = (1 - g["aperture"]) * 0.32          # hook length on c/e/s, as a share of the bowl height
    dy = g["weight"] * 1.9                   # dot distance above stems
    G = {}

    # lowercase
    G["a"] = (1.0, [P((0.08, X), (1, X), (1, 0)), P((1, 0.55 * X), (0, 0.55 * X), (0, 0), (1, 0))])
    G["b"] = (1.0, [P((0, A), (0, 0)), box(0, 0, 1, X)])
    G["c"] = (0.95, [P((1, X - k * X), (1, X), (0, X), (0, 0), (1, 0), (1, k * X))])
    G["d"] = (1.0, [P((1, A), (1, 0)), box(0, 0, 1, X)])
    G["e"] = (1.0, [P((1, k * X * 0.8), (1, 0), (0, 0), (0, X), (1, X), (1, M), (0, M))])
    G["f"] = (0.62, [P((0.3, 0), (0.3, A), (1, A)), P((0, X), (0.9, X))])
    G["g"] = (1.0, [box(0, 0, 1, X), P((1, X), (1, Dn), (0.05, Dn))])
    G["h"] = (1.0, [P((0, A), (0, 0)), P((0, X), (1, X), (1, 0))])
    G["i"] = (0.32, [P((0.5, 0), (0.5, X)), D(0.5, X + dy)])
    G["j"] = (0.5, [P((0.75, X), (0.75, Dn), (0, Dn)), D(0.75, X + dy)])
    G["k"] = (0.92, [P((0, A), (0, 0)), P((1, X), (0, 0.42 * X)), P((0.38, 0.58 * X), (1, 0))])
    G["l"] = (0.5, [P((0.1, A), (0.5, A), (0.5, 0), (1, 0))])
    G["m"] = (1.45, [P((0, 0), (0, X), (1, X), (1, 0)), P((0.5, X), (0.5, 0))])
    G["n"] = (1.0, [P((0, 0), (0, X), (1, X), (1, 0))])
    G["o"] = (1.0, [box(0, 0, 1, X)])
    G["p"] = (1.0, [P((0, X), (0, Dn)), box(0, 0, 1, X)])
    G["q"] = (1.0, [P((1, X), (1, Dn)), box(0, 0, 1, X)])
    G["r"] = (0.7, [P((0, 0), (0, X)), P((0, X), (1, X), (1, X - 0.22 * X))])
    G["s"] = (0.92, [P((1, X - k * X * 0.8), (1, X), (0, X), (0, M), (1, M), (1, 0), (0, 0), (0, k * X * 0.8))])
    G["t"] = (0.62, [P((0.32, A * 0.93), (0.32, 0), (1, 0)), P((0, X), (0.95, X))])
    G["u"] = (1.0, [P((0, X), (0, 0), (1, 0)), P((1, X), (1, 0))])
    G["v"] = (1.0, [P((0, X), (0.5, 0), (1, X))])
    G["w"] = (1.45, [P((0, X), (0.25, 0), (0.5, 0.68 * X), (0.75, 0), (1, X))])
    G["x"] = (1.0, [P((0, X), (1, 0)), P((1, X), (0, 0))])
    G["y"] = (1.0, [P((0, X), (0, 0), (1, 0)), P((1, X), (1, Dn), (0, Dn))])
    G["z"] = (0.95, [P((0, X), (1, X), (0, 0), (1, 0))])

    # uppercase
    G["A"] = (1.1, [P((0, 0), (0, C), (1, C), (1, 0)), P((0, 0.45 * C), (1, 0.45 * C))])
    G["B"] = (1.1, [P((0, 0), (0, C), (0.85, C), (0.85, 0.52 * C), (0, 0.52 * C)),
                    P((0.85, 0.52 * C), (1, 0.52 * C), (1, 0), (0, 0))])
    G["C"] = (1.08, [P((1, C - k * C * 0.7), (1, C), (0, C), (0, 0), (1, 0), (1, k * C * 0.7))])
    G["D"] = (1.12, [L((0, 0), (0, C), (0.72, C), (1, 0.78 * C), (1, 0.22 * C), (0.72, 0))])
    G["E"] = (0.98, [P((1, C), (0, C), (0, 0), (1, 0)), P((0, H), (0.82, H))])
    G["F"] = (0.95, [P((1, C), (0, C), (0, 0)), P((0, H), (0.82, H))])
    G["G"] = (1.12, [P((1, C - k * C * 0.6), (1, C), (0, C), (0, 0), (1, 0), (1, 0.45 * C), (0.5, 0.45 * C))])
    G["H"] = (1.12, [P((0, 0), (0, C)), P((1, 0), (1, C)), P((0, H), (1, H))])
    G["I"] = (0.6, [P((0.5, 0), (0.5, C)), P((0.05, C), (0.95, C)), P((0.05, 0), (0.95, 0))])
    G["J"] = (0.95, [P((0.3, C), (1, C), (1, 0), (0, 0), (0, 0.28 * C))])
    G["K"] = (1.08, [P((0, 0), (0, C)), P((1, C), (0, 0.42 * C)), P((0.36, 0.58 * C), (1, 0))])
    G["L"] = (0.9, [P((0, C), (0, 0), (1, 0))])
    G["M"] = (1.32, [P((0, 0), (0, C), (0.5, 0.52 * C), (1, C), (1, 0))])
    G["N"] = (1.12, [P((0, 0), (0, C), (1, 0), (1, C))])
    G["O"] = (1.15, [box(0, 0, 1, C)])
    G["P"] = (1.05, [P((0, 0), (0, C), (1, C), (1, 0.47 * C), (0, 0.47 * C))])
    G["Q"] = (1.15, [box(0, 0, 1, C), P((0.62, 0.22 * C), (1, -0.12 * C))])
    G["R"] = (1.08, [P((0, 0), (0, C), (1, C), (1, 0.5 * C), (0, 0.5 * C)), P((0.45, 0.5 * C), (1, 0))])
    G["S"] = (1.05, [P((1, C - k * C * 0.6), (1, C), (0, C), (0, H), (1, H), (1, 0), (0, 0), (0, k * C * 0.6))])
    G["T"] = (1.05, [P((0, C), (1, C)), P((0.5, C), (0.5, 0))])
    G["U"] = (1.12, [P((0, C), (0, 0), (1, 0), (1, C))])
    G["V"] = (1.1, [P((0, C), (0.5, 0), (1, C))])
    G["W"] = (1.45, [P((0, C), (0.22, 0), (0.5, 0.7 * C), (0.78, 0), (1, C))])
    G["X"] = (1.08, [P((0, C), (1, 0)), P((1, C), (0, 0))])
    G["Y"] = (1.08, [P((0, C), (0.5, 0.48 * C), (1, C)), P((0.5, 0.48 * C), (0.5, 0))])
    G["Z"] = (1.02, [P((0, C), (1, C), (0, 0), (1, 0))])

    # digits (a touch narrower than the capitals)
    G["zero"] = (0.95, [box(0, 0, 1, C), P((0.3, 0.3 * C), (0.7, 0.7 * C))])
    G["one"] = (0.8, [P((0.1, 0.78 * C), (0.55, C), (0.55, 0)), P((0.1, 0), (0.95, 0))])
    G["two"] = (0.95, [P((0, C), (1, C), (1, H), (0, H), (0, 0), (1, 0))])
    G["three"] = (0.95, [P((0, C), (1, C), (1, 0), (0, 0)), P((0.3, H), (1, H))])
    G["four"] = (0.98, [P((0, C), (0, 0.35 * C), (1, 0.35 * C)), P((0.75, 0.62 * C), (0.75, 0))])
    G["five"] = (0.95, [P((1, C), (0, C), (0, 0.55 * C), (1, 0.55 * C), (1, 0), (0, 0))])
    G["six"] = (0.95, [P((1, C), (0, C), (0, 0), (1, 0), (1, 0.55 * C), (0, 0.55 * C))])
    G["seven"] = (0.92, [P((0, C), (1, C), (1, 0.72 * C), (0.42, 0))])
    G["eight"] = (0.98, [box(0.1, 0.52 * C, 0.9, C), box(0, 0, 1, 0.52 * C)])
    G["nine"] = (0.95, [P((0, 0), (1, 0), (1, C), (0, C), (0, 0.45 * C), (1, 0.45 * C))])

    # punctuation and symbols
    G["space"] = (0.42, [])
    G["period"] = (0.34, [D(0.5, 0)])
    G["comma"] = (0.36, [D(0.5, 0), P((0.5, 0), (0.15, -0.16 * C))])
    G["colon"] = (0.34, [D(0.5, 0), D(0.5, X * 0.85)])
    G["semicolon"] = (0.36, [D(0.5, 0), P((0.5, 0), (0.15, -0.16 * C)), D(0.5, X * 0.85)])
    G["exclam"] = (0.34, [P((0.5, C), (0.5, 0.3 * C)), D(0.5, 0)])
    G["question"] = (0.92, [P((0, 0.78 * C), (0, C), (1, C), (1, 0.55 * C), (0.5, 0.55 * C), (0.5, 0.3 * C)), D(0.5, 0)])
    G["quotesingle"] = (0.3, [P((0.5, C), (0.5, 0.74 * C))])
    G["quotedbl"] = (0.55, [P((0.2, C), (0.2, 0.74 * C)), P((0.8, C), (0.8, 0.74 * C))])
    G["quoteright"] = (0.36, [D(0.5, C - 30), P((0.5, C - 30), (0.15, 0.78 * C))])
    G["quoteleft"] = (0.36, [D(0.5, 0.82 * C), P((0.5, 0.82 * C), (0.85, C))])
    G["quotedblright"] = (0.62, [D(0.3, C - 30), P((0.3, C - 30), (0.05, 0.78 * C)), D(0.8, C - 30), P((0.8, C - 30), (0.55, 0.78 * C))])
    G["quotedblleft"] = (0.62, [D(0.2, 0.82 * C), P((0.2, 0.82 * C), (0.45, C)), D(0.7, 0.82 * C), P((0.7, 0.82 * C), (0.95, C))])
    G["hyphen"] = (0.62, [P((0.1, M), (0.9, M))])
    G["endash"] = (0.95, [P((0, M), (1, M))])
    G["emdash"] = (1.5, [P((0, M), (1, M))])
    G["underscore"] = (1.0, [P((0, -0.1 * C), (1, -0.1 * C))])
    G["parenleft"] = (0.5, [P((0.95, A), (0.3, A - 140), (0.3, Dn + 140), (0.95, Dn))])
    G["parenright"] = (0.5, [P((0.05, A), (0.7, A - 140), (0.7, Dn + 140), (0.05, Dn))])
    G["bracketleft"] = (0.5, [P((0.95, A), (0.25, A), (0.25, Dn), (0.95, Dn))])
    G["bracketright"] = (0.5, [P((0.05, A), (0.75, A), (0.75, Dn), (0.05, Dn))])
    G["braceleft"] = (0.55, [P((0.95, A), (0.45, A), (0.45, H + 40), (0.05, H), (0.45, H - 40), (0.45, Dn), (0.95, Dn))])
    G["braceright"] = (0.55, [P((0.05, A), (0.55, A), (0.55, H + 40), (0.95, H), (0.55, H - 40), (0.55, Dn), (0.05, Dn))])
    G["slash"] = (0.7, [P((0.05, Dn * 0.6), (0.95, A))])
    G["backslash"] = (0.7, [P((0.05, A), (0.95, Dn * 0.6))])
    G["bar"] = (0.32, [P((0.5, A), (0.5, Dn))])
    G["plus"] = (0.9, [P((0.05, M), (0.95, M)), P((0.5, M - 0.42 * X), (0.5, M + 0.42 * X))])
    G["minus"] = (0.9, [P((0.05, M), (0.95, M))])
    G["equal"] = (0.9, [P((0.05, M - 0.2 * X), (0.95, M - 0.2 * X)), P((0.05, M + 0.2 * X), (0.95, M + 0.2 * X))])
    G["asterisk"] = (0.8, [P((0.5, C), (0.5, 0.5 * C)), P((0.08, 0.86 * C), (0.92, 0.64 * C)), P((0.08, 0.64 * C), (0.92, 0.86 * C))])
    G["less"] = (0.85, [P((0.95, X), (0.05, M), (0.95, 0))])
    G["greater"] = (0.85, [P((0.05, X), (0.95, M), (0.05, 0))])
    G["numbersign"] = (1.0, [P((0.3, C * 0.9), (0.3, 0)), P((0.7, C * 0.9), (0.7, 0)), P((0, 0.62 * C), (1, 0.62 * C)), P((0, 0.28 * C), (1, 0.28 * C))])
    G["at"] = (1.25, [box(0.3, 0.18 * C, 0.68, 0.6 * C), P((0.68, 0.18 * C), (1, 0.18 * C), (1, 0.82 * C), (0, 0.82 * C), (0, -0.08 * C), (1, -0.08 * C))])
    G["ampersand"] = (1.08, [P((1, 0), (0.15, 0.62 * C), (0.15, C), (0.75, C), (0.75, 0.68 * C), (0, 0.34 * C), (0, 0), (0.7, 0), (1, 0.38 * C))])
    G["percent"] = (1.15, [box(0, 0.62 * C, 0.32, C), box(0.68, 0, 1, 0.38 * C), P((0.05, 0), (0.95, C))])
    G["dollar"] = (1.0, [P((1, 0.82 * C), (1, 0.9 * C), (0, 0.9 * C), (0, H), (1, H), (1, 0.08 * C), (0, 0.08 * C), (0, 0.18 * C)),
                         P((0.5, A), (0.5, Dn * 0.5))])
    G["asciitilde"] = (0.9, [P((0.05, M - 30), (0.3, M + 50), (0.7, M - 50), (0.95, M + 30))])
    G["asciicircum"] = (0.8, [P((0.1, 0.6 * C), (0.5, C), (0.9, 0.6 * C))])
    G["grave"] = (0.5, [P((0.2, C), (0.8, 0.8 * C))])
    G["ellipsis"] = (1.1, [D(0.1, 0), D(0.5, 0), D(0.9, 0)])
    G["periodcentered"] = (0.34, [D(0.5, M)])
    G["degree"] = (0.6, [box(0.1, 0.62 * C, 0.9, C)])
    G["exclamdown"] = (0.34, [D(0.5, X), P((0.5, X - 0.3 * C), (0.5, Dn))])
    qy = lambda y: X - (y / C) * (X - Dn)              # ? turned upside down, hanging from the x-height
    G["questiondown"] = (0.92, [P(*[(1 - x, qy(y)) for x, y in [(0, 0.78 * C), (0, C), (1, C), (1, 0.55 * C), (0.5, 0.55 * C), (0.5, 0.3 * C)]]),
                                D(0.5, X)])
    G["bullet"] = (0.5, [D(0.5, M)])
    G["arrowright"] = (1.0, [P((0, M), (1, M)), P((0.62, M + 0.3 * X), (1, M), (0.62, M - 0.3 * X))])

    # accents for Spanish (and a few Latin neighbours)
    def acute(x, y): return P((x - 0.15, y + 40), (x + 0.2, y + 150))
    def tilde(y): return P((0.1, y + 50), (0.35, y + 130), (0.65, y + 50), (0.9, y + 130))
    def diaer(x0, x1, y): return [D(x0, y + 80), D(x1, y + 80)]
    lo_acc_y = X + 70
    up_acc_y = C + 50
    for base, acc_name in [("a", "aacute"), ("e", "eacute"), ("o", "oacute"), ("u", "uacute")]:
        w, s = G[base]
        G[acc_name] = (w, s + [acute(0.5, lo_acc_y)])
    G["iacute"] = (0.4, [P((0.5, 0), (0.5, X)), acute(0.5, lo_acc_y)])
    G["ntilde"] = (G["n"][0], G["n"][1] + [tilde(lo_acc_y)])
    G["udieresis"] = (G["u"][0], G["u"][1] + diaer(0.2, 0.8, lo_acc_y - 40))
    G["idieresis"] = (0.55, [P((0.5, 0), (0.5, X))] + diaer(0.1, 0.9, lo_acc_y - 40))
    G["odieresis"] = (G["o"][0], G["o"][1] + diaer(0.2, 0.8, lo_acc_y - 40))
    G["ccedilla"] = (G["c"][0], G["c"][1] + [P((0.5, 0), (0.5, -0.1 * C), (0.2, -0.2 * C))])
    for base, acc_name in [("A", "Aacute"), ("E", "Eacute"), ("I", "Iacute"), ("O", "Oacute"), ("U", "Uacute")]:
        w, s = G[base]
        G[acc_name] = (w, s + [acute(0.5, up_acc_y)])
    G["Ntilde"] = (G["N"][0], G["N"][1] + [tilde(up_acc_y)])
    G["Udieresis"] = (G["U"][0], G["U"][1] + diaer(0.25, 0.75, up_acc_y - 30))
    return G


CMAP = {**{c: c for c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"},
        "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
        " ": "space", ".": "period", ",": "comma", ":": "colon", ";": "semicolon", "!": "exclam", "?": "question",
        "'": "quotesingle", '"': "quotedbl", "’": "quoteright", "‘": "quoteleft", "”": "quotedblright", "“": "quotedblleft",
        "-": "hyphen", "–": "endash", "—": "emdash", "_": "underscore", "(": "parenleft", ")": "parenright",
        "[": "bracketleft", "]": "bracketright", "{": "braceleft", "}": "braceright", "/": "slash", "\\": "backslash",
        "|": "bar", "+": "plus", "−": "minus", "=": "equal", "*": "asterisk", "<": "less", ">": "greater", "#": "numbersign",
        "@": "at", "&": "ampersand", "%": "percent", "$": "dollar", "~": "asciitilde", "^": "asciicircum", "`": "grave",
        "…": "ellipsis", "·": "periodcentered", "°": "degree", "¡": "exclamdown", "¿": "questiondown", "•": "bullet", "→": "arrowright",
        "á": "aacute", "é": "eacute", "í": "iacute", "ó": "oacute", "ú": "uacute", "ñ": "ntilde", "ü": "udieresis",
        "ï": "idieresis", "ö": "odieresis", "ç": "ccedilla",
        "Á": "Aacute", "É": "Eacute", "Í": "Iacute", "Ó": "Oacute", "Ú": "Uacute", "Ñ": "Ntilde", "Ü": "Udieresis"}

# not i or ! : a cut stem under a dot reads as "!" (seen in round 1: "Mathemat!c!an")
PIPE_ALWAYS = {"bar", "I", "l", "Iacute", "one"}
NEVER_CUT = {"i", "j", "iacute", "idieresis", "exclam", "exclamdown"}


# ---------------------------------------------------------------- geometry
def treat_corners(pts, closed, style, size, w):
    """Replace each corner of a polyline by a chamfer or a rounded arc (square keeps it sharp)."""
    if style == "square" or len(pts) < 3 and not closed:
        return pts
    n = len(pts)
    out = []
    for i in range(n):
        if not closed and (i == 0 or i == n - 1):
            out.append(pts[i]); continue
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        a = (p0[0] - p1[0], p0[1] - p1[1]); b = (p2[0] - p1[0], p2[1] - p1[1])
        la, lb = math.hypot(*a), math.hypot(*b)
        if la < 1 or lb < 1:
            out.append(p1); continue
        cosang = (a[0] * b[0] + a[1] * b[1]) / (la * lb)
        if cosang < -0.97:                       # nearly straight
            out.append(p1); continue
        r = min(size * min(la, lb), la * 0.48, lb * 0.48)
        r = max(r, w * 0.6) if r > w * 0.6 else r
        u = (a[0] / la, a[1] / la); v = (b[0] / lb, b[1] / lb)
        s = (p1[0] + u[0] * r, p1[1] + u[1] * r); e = (p1[0] + v[0] * r, p1[1] + v[1] * r)
        if style == "chamfer":
            out += [s, e]
        else:                                    # round: quadratic bezier sampled
            for t in [j / 6 for j in range(7)]:
                x = (1 - t) ** 2 * s[0] + 2 * (1 - t) * t * p1[0] + t * t * e[0]
                y = (1 - t) ** 2 * s[1] + 2 * (1 - t) * t * p1[1] + t * t * e[1]
                out.append((x, y))
    return out


def cut_stems(segs, g, name, w):
    """The pipe: a gap through vertical stems, like the | cutting Idle into Id|le."""
    mode = g["pipe"]
    if mode == 0 or (mode == 1 and name not in PIPE_ALWAYS) or name in NEVER_CUT:
        return segs
    gap = g["pipe_gap"] * w
    out = []
    for (x0, y0), (x1, y1) in segs:
        tall = abs(x1 - x0) < 2 and abs(y1 - y0) > (CAP * 0.55 if mode == 2 else CAP * 0.3)
        if not tall:
            out.append(((x0, y0), (x1, y1))); continue
        lo, hi = min(y0, y1), max(y0, y1)
        yc = lo + (hi - lo) * g["pipe_pos"]
        out.append(((x0, lo), (x0, yc - gap / 2)))
        out.append(((x0, yc + gap / 2), (x0, hi)))
    return out


def seg_poly(p, q, w, cap_start=0.0, cap_end=0.0):
    dx, dy = q[0] - p[0], q[1] - p[1]
    l = math.hypot(dx, dy) or 1
    ux, uy = dx / l, dy / l
    nx, ny = -uy * w / 2, ux * w / 2
    p = (p[0] - ux * cap_start, p[1] - uy * cap_start); q = (q[0] + ux * cap_end, q[1] + uy * cap_end)
    return [(p[0] + nx, p[1] + ny), (q[0] + nx, q[1] + ny), (q[0] - nx, q[1] - ny), (p[0] - nx, p[1] - ny)]


def hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0: lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0: upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def dot_poly(c, w, style):
    x, y = c; r = w * 0.62
    if style == "square":
        return [(x - r, y - r), (x - r, y + r), (x + r, y + r), (x + r, y - r)]
    if style == "diamond":
        r *= 1.3
        return [(x, y - r), (x - r, y), (x, y + r), (x + r, y)]
    if style == "bar":
        return [(x - r * 0.75, y - r), (x - r * 0.75, y + r * 1.5), (x + r * 0.75, y + r * 1.5), (x + r * 0.75, y - r)]
    return [(x + r * math.cos(a), y + r * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]]


def clockwise(poly):
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return poly if area < 0 else list(reversed(poly))


def build_glyph(name, spec, g):
    wf, strokes = spec
    w = g["weight"]
    base = 520 * g["width"] * wf
    sb = g["tracking"]
    if g["mono"]:
        adv = int(round(600 * g["width"] + 2 * sb - 40))
        bw = min(base, adv - 2 * sb)
    else:
        adv = int(round(base + 2 * sb)); bw = base
    x_off = (adv - bw) / 2
    inner = max(bw - w, 1)
    def mx(x): return x_off + w / 2 + x * inner
    def my(y): return w / 2 + y * (CAP - w) / CAP
    tan = math.tan(math.radians(g["slant"]))
    def sl(p): return (p[0] + (p[1] - 0) * tan, p[1])

    polys = []
    segs_all = []
    dots = []
    for kind, data in strokes:
        if kind == "D":
            dots.append((mx(data[0]), my(data[1])))
            continue
        pts = [(mx(x), my(y)) for x, y in data]
        closed = kind == "L"
        pts = treat_corners(pts, closed, g["corner"], g["corner_size"], w)
        segs = list(zip(pts, pts[1:] + ([pts[0]] if closed else [])))
        segs = cut_stems(segs, g, name, w)
        segs_all.append((segs, closed, pts))

    if g["render"] == "pixel":
        polys += pixelate(segs_all, dots, g, w, adv)
    else:
        term = {"flat": 0.0, "square": w / 2, "angled": w / 2}[g["terminal"]]
        for segs, closed, pts in segs_all:
            for i, (p, q) in enumerate(segs):
                first = not closed and i == 0
                last = not closed and i == len(segs) - 1
                cs = term if first else w * 0.02
                ce = term if last else w * 0.02
                poly = seg_poly(p, q, w, cs, ce)
                if g["terminal"] == "angled" and (first or last):
                    poly = angle_cut(poly, first, last, w)
                polys.append(poly)
            # joins: fill the wedge at every interior vertex
            n = len(pts)
            rng = range(n) if closed else range(1, n - 1)
            for i in rng:
                p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
                a = seg_poly(p0, p1, w); b = seg_poly(p1, p2, w)
                polys.append(hull([a[1], a[2], b[0], b[3], p1]))
        for c in dots:
            polys.append(dot_poly(c, w, g["dot"]))

    pen = TTGlyphPen(None)
    for poly in polys:
        poly = [sl(p) for p in poly]
        poly = clockwise([(int(round(x)), int(round(y))) for x, y in poly])
        if len(set(poly)) < 3:
            continue
        pen.moveTo(poly[0])
        for p in poly[1:]:
            pen.lineTo(p)
        pen.closePath()
    return pen.glyph(), adv


def angle_cut(poly, first, last, w):
    # slice the free end at 45°: move one corner of the end back by the weight
    p = list(poly)
    if first:
        dx, dy = p[1][0] - p[0][0], p[1][1] - p[0][1]; l = math.hypot(dx, dy) or 1
        p[0] = (p[0][0] + dx / l * w * 0.7, p[0][1] + dy / l * w * 0.7)
    if last:
        dx, dy = p[1][0] - p[0][0], p[1][1] - p[0][1]; l = math.hypot(dx, dy) or 1
        p[2] = (p[2][0] - dx / l * w * 0.7, p[2][1] - dy / l * w * 0.7)
    return p


def pixelate(segs_all, dots, g, w, adv):
    """Raster the skeleton onto a grid of cells as big as the stroke, then emit a square (or dot) per cell."""
    s = w
    def dist(px, py, p, q):
        vx, vy = q[0] - p[0], q[1] - p[1]; l2 = vx * vx + vy * vy
        t = 0 if l2 == 0 else max(0, min(1, ((px - p[0]) * vx + (py - p[1]) * vy) / l2))
        return math.hypot(px - (p[0] + t * vx), py - (p[1] + t * vy))
    segs = [sq for segs, _, _ in segs_all for sq in segs]
    cells = set()
    x_lo, x_hi = 0, adv
    for j in range(int(DESC // s) - 1, int(ASC // s) + 3):
        cy = j * s + s / 2
        for i in range(int(x_lo // s), int(x_hi // s) + 1):
            cx = i * s + s / 2
            if any(dist(cx, cy, p, q) <= s * 0.52 for p, q in segs):
                cells.add((i, j))
    for c in dots:
        cells.add((int(c[0] // s), int(c[1] // s)))
    out = []
    for i, j in cells:
        x0, y0 = i * s, j * s
        if g["pixel_shape"] == "dot":
            out.append(dot_poly((x0 + s / 2, y0 + s / 2), s * 0.72, "round"))
        else:
            out.append([(x0 - 1, y0 - 1), (x0 - 1, y0 + s + 1), (x0 + s + 1, y0 + s + 1), (x0 + s + 1, y0 - 1)])
    return out


def build_font(g, name, out_dir):
    G = skeletons(g)
    order = [".notdef"] + list(G.keys())
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {ord(ch): gn for ch, gn in CMAP.items() if gn in G}
    fb.setupCharacterMap(cmap)
    glyphs, metrics = {}, {}
    nd = TTGlyphPen(None)
    for poly in [[(60, 0), (60, CAP), (440, CAP), (440, 0)], [(110, 50), (390, 50), (390, CAP - 50), (110, CAP - 50)]]:
        nd.moveTo(poly[0]); [nd.lineTo(p) for p in poly[1:]]; nd.closePath()
    glyphs[".notdef"] = nd.glyph(); metrics[".notdef"] = (500, 60)
    for gn, spec in G.items():
        gl, adv = build_glyph(gn, spec, g)
        glyphs[gn] = gl
        gl.recalcBounds(None) if hasattr(gl, "recalcBounds") and False else None
        metrics[gn] = (adv, 0)
    fb.setupGlyf(glyphs)
    gt = fb.font["glyf"]
    for gn in order:
        gl = gt[gn]; gl.recalcBounds(gt)
        metrics[gn] = (metrics[gn][0], getattr(gl, "xMin", 0) if gl.numberOfContours else 0)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-260)
    family = f"Idle {name}"
    fb.setupNameTable({"familyName": family, "styleName": "Regular",
                       "uniqueFontIdentifier": f"idle-fontgen-{name}", "fullName": family,
                       "psName": f"Idle-{name}", "version": "Version 0.1",
                       "copyright": "Id|le fontgen (MIT), generated", "licenseDescription": "MIT"})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-260, sTypoLineGap=0, usWinAscent=960, usWinDescent=300,
                sxHeight=int(CAP * g["xheight"]), sCapHeight=CAP, fsType=0)
    fb.setupPost(isFixedPitch=1 if g["mono"] else 0)
    os.makedirs(out_dir, exist_ok=True)
    ttf = os.path.join(out_dir, f"{name}.ttf")
    fb.save(ttf)
    fb.font.flavor = "woff2"
    w2 = os.path.join(out_dir, f"{name}.woff2")
    fb.font.save(w2)
    with open(os.path.join(out_dir, f"{name}.json"), "w") as f:
        json.dump(g, f, indent=1)
    return ttf, w2


def main(argv):
    if argv[:1] == ["--random"]:
        n, seed, out = int(argv[1]), int(argv[3]), argv[4]
        rng = random.Random(seed)
        for i in range(n):
            build_font(random_genome(rng), f"r{i + 1}", out)
        return
    gpath, out = argv[0], argv[1]
    g = {**default_genome(), **json.load(open(gpath))}
    name = os.path.splitext(os.path.basename(gpath))[0]
    print(*build_font(g, name, out))


if __name__ == "__main__":
    main(sys.argv[1:])
