#!/usr/bin/env python3
"""Breed the next round of Id|le fonts from favourites.

    python3 tools/fontgen/breed.py tools/fontgen/rounds/round1.json f3 f7 --out tools/fontgen/rounds/round2.json [--n 8] [--seed 2]
    python3 tools/fontgen/breed.py tools/fontgen/rounds/round1.json --picks picks.json --out ...   # picks copied from the review page

Each child takes every gene from one of two parents at random (uniform crossover), then mutates: numbers move by
up to 15% of their range, choices flip with a 15% chance. The first two children are the parents' midpoints, so a
round always has a "blend". Then build it: python3 tools/fontgen/review.py <round2.json> ~/Desktop/idle-trailers/fonts round2
"""
import argparse, json, random, sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fontgen import GENES, default_genome


def mutate(g, rng, rate=0.15):
    out = dict(g)
    for k, (kind, rdef, _) in GENES.items():
        if kind == "choice":
            if rng.random() < rate:
                out[k] = rng.choice(rdef)
        else:
            lo, hi = rdef
            out[k] = round(min(hi, max(lo, out[k] + rng.uniform(-rate, rate) * (hi - lo))), 3)
    return out


def blend(a, b, rng):
    out = {}
    for k, (kind, _, _) in GENES.items():
        out[k] = round((a[k] + b[k]) / 2, 3) if kind == "float" else rng.choice([a[k], b[k]])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("round")
    ap.add_argument("parents", nargs="*")
    ap.add_argument("--picks")
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--seed", type=int, default=2)
    a = ap.parse_args()
    cands = json.load(open(a.round))
    parents = list(a.parents)
    if a.picks:
        picks = json.load(open(a.picks)).get("picks", {})
        parents += [n for n, s in sorted(picks.items(), key=lambda kv: -(kv[1].get("score") or 0)) if s.get("parent")]
    if not parents:
        sys.exit("name at least one parent (or --picks with 'breed from this' ticked)")
    rng = random.Random(a.seed)
    gen = {n: {**default_genome(), **{k: v for k, v in cands[n].items() if k in GENES}} for n in parents}
    kids = {}
    prefix = "c" if "round" not in os.path.basename(a.out) else os.path.basename(a.out).split(".")[0].replace("round", "r") + "_"
    for i in range(a.n):
        p1, p2 = rng.choice(parents), rng.choice(parents)
        if i < 2 and len(parents) > 1:
            p1, p2 = parents[0], parents[1 + i % (len(parents) - 1)]
            g = blend(gen[p1], gen[p2], rng)
        else:
            g = {k: rng.choice([gen[p1][k], gen[p2][k]]) for k in GENES}
            g = mutate(g, rng)
        kids[f"{prefix}{i + 1}"] = {"label": f"{p1} × {p2}" if p1 != p2 else f"{p1} mutant", "parents": sorted({p1, p2}), **g}
    json.dump(kids, open(a.out, "w"), indent=1)
    print(a.out, len(kids), "children of", ", ".join(parents))


if __name__ == "__main__":
    main()
