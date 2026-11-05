#!/usr/bin/env python3
"""The Director's view's producer overlay: the storyline's funnel as a small JSON file (Nov 4).

    python3 tools/director_stats.py [--days 7] [--out director_stats.json]

Reads id-le.com's anonymous daily totals through tools/stats.py --json (the same KV, the same token handling: never printed) and keeps
only what the overlay needs: per arm, browsers reaching each storyline moment, the skips, and the mean on-screen seconds per moment.
Open /director on staging or locally and load the file with "📊 stats" (it never leaves your browser; nothing is published).
"""
import argparse, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from stats import sf_split, lg_split  # noqa: E402  (the same splits the text report uses)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out", default="director_stats.json")
    a = ap.parse_args()
    raw = subprocess.run([sys.executable, os.path.join(HERE, "stats.py"), "--json", "--days", str(a.days)], capture_output=True, text=True, check=True).stdout
    days = json.loads(raw[raw.index("{"):])
    sf, sd = {}, {}
    for day in days.values():
        for k, n in (day.get("sf") or {}).items():
            sf[k] = sf.get(k, 0) + (n or 0)
        for k, v in (day.get("sd") or {}).items():
            o = sd.setdefault(k, {"n": 0, "sum": 0})
            o["n"] += (v or {}).get("n", 0)
            o["sum"] += (v or {}).get("sum", 0)
    arms = {arm: {"steps": o["steps"], "skips": o["skips"]} for arm, o in lg_split(sf_split(sf))[0].items()}   # the logo arms' copies (lg:…) left out
    out = {"window": {"from": min(days) if days else None, "to": max(days) if days else None}, "arms": arms,
           "sd": {k: {"n": v["n"], "mean": round(v["sum"] / v["n"], 1) if v["n"] else None} for k, v in sd.items() if not k.startswith("lg:")}}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
    print(f"wrote {a.out}: {len(arms)} arms, {sum(sum(o['steps'].values()) for o in arms.values())} moments, {out['window']['from']} .. {out['window']['to']} (UTC)")


if __name__ == "__main__":
    main()
