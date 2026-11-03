"""⭐ Reviews (11-03): ask players to score a few experiments (the logo animations, the fonts…), then read what they said.

A review is review:<rid> in the id-le-stats KV namespace: { kind, title, items, note?, showTotals?, open? }. The game opens it with
?review=<rid> (demo/idle-reviews.js), and 🧪 lists the open ones (reviews:index). Two are built into the helper (helper/worker.js REVIEWS):
logos and fonts; writing review:logos here replaces the built-in one (for example to add round 3's logos or Nico's own note).
Scores add up in review:<rid>:agg; notes go to the private queue (python3 tools/feedback.py shows them, kind 'review').

    python3 tools/review.py new <rid> --kind logos --items a,b,c [--title "…"] [--note-file note.txt] [--show-totals]
    python3 tools/review.py results <rid>          # averages, counts, the 0-5 spread, and the notes
    python3 tools/review.py close <rid>            # stop taking scores (the link then says it has closed)
    python3 tools/review.py open <rid>             # take scores again
    python3 tools/review.py list                   # the reviews the game lists
    add --staging to any of these to use staging.id-le.com's namespace (id-le-stats-staging)

The link to share: https://id-le.com/?review=<rid> (staging: https://staging.id-le.com/?review=<rid>).
Needs CLOUDFLARE_API_TOKEN in ~/.idle-ts/cf.env (never committed; never printed).
"""
import argparse, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feedback import KV, queue  # noqa: E402

KINDS = ["logos", "fonts", "creatures", "objects"]
RID, ITEM = re.compile(r"^[a-z0-9-]{1,30}$"), re.compile(r"^[a-z0-9-]{1,40}$")
BUILTIN = {"logos": {"kind": "logos", "title": "the logo", "items": ["c3-typed-dust", "c3-typed-crt", "a3-dust", "b3a-dust-crt", "b3b-crt", "scope-strike", "scope-crt", "typed-scope", "scope-meter", "scope-shockwave", "strike-purr-static", "crt-off"]},
           "fonts": {"kind": "fonts", "title": "our fonts", "items": ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]}}


def cfg_of(kv, rid):
    raw = kv.get("review:" + rid)
    return json.loads(raw) if raw else (dict(BUILTIN[rid], open=True) if rid in BUILTIN else None)


def index_add(kv, rid):
    ids = json.loads(kv.get("reviews:index") or "[]")
    if rid not in ids:
        kv.put("reviews:index", json.dumps(ids + [rid]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["new", "results", "close", "open", "list"])
    ap.add_argument("rid", nargs="?")
    ap.add_argument("--kind", choices=KINDS); ap.add_argument("--items"); ap.add_argument("--title", default="")
    ap.add_argument("--note-file"); ap.add_argument("--show-totals", action="store_true"); ap.add_argument("--staging", action="store_true")
    a = ap.parse_args()
    if a.cmd != "list" and not (a.rid and RID.match(a.rid)):
        sys.exit("a review id: lowercase letters, digits and dashes (e.g. logos-round3)")
    kv = KV(a.staging)
    site = "https://staging.id-le.com" if a.staging else "https://id-le.com"

    if a.cmd == "new":
        if not a.kind or not a.items:
            sys.exit("new needs --kind and --items")
        items = [x.strip() for x in a.items.split(",") if x.strip()]
        bad = [x for x in items if not ITEM.match(x)]
        if bad or not items:
            sys.exit(f"item ids are lowercase letters, digits and dashes: {bad}")
        note = open(a.note_file, encoding="utf-8").read().strip()[:1200] if a.note_file else None
        cfg = {"kind": a.kind, "title": a.title[:80] or a.rid, "items": items[:24], "showTotals": a.show_totals, "open": True}
        if note:
            cfg["note"] = note
        kv.put("review:" + a.rid, json.dumps(cfg)); index_add(kv, a.rid)
        print(f"review {a.rid}: {a.kind}, {len(items)} items{', with your note' if note else ''}{', totals shown to players' if a.show_totals else ''}")
        print(f"  share: {site}/?review={a.rid}   (the game caches a review for a minute)")
        return

    if a.cmd in ("close", "open"):
        cfg = cfg_of(kv, a.rid)
        if not cfg:
            sys.exit("no such review")
        cfg["open"] = a.cmd == "open"; kv.put("review:" + a.rid, json.dumps(cfg))
        print(f"review {a.rid} is {'open' if cfg['open'] else 'closed'}")
        return

    if a.cmd == "list":
        ids = sorted(set(json.loads(kv.get("reviews:index") or "[]")) | set(BUILTIN))
        for rid in ids:
            cfg = cfg_of(kv, rid) or {}
            agg = json.loads(kv.get(f"review:{rid}:agg") or "null") or {}
            print(f"  {rid:<18} {cfg.get('kind', '?'):<8} {'open  ' if cfg.get('open', True) else 'closed'} {agg.get('sends', 0):>4} sent  {site}/?review={rid}")
        return

    # results
    cfg = cfg_of(kv, a.rid)
    if not cfg:
        sys.exit("no such review")
    agg = json.loads(kv.get(f"review:{a.rid}:agg") or "null") or {"sends": 0, "items": {}}
    print(f"review {a.rid} ({cfg['kind']}, {'open' if cfg.get('open', True) else 'closed'}): {agg.get('sends', 0)} sent")
    rows = []
    for it in cfg["items"]:
        x = agg["items"].get(it, {"n": 0, "sum": 0, "s": [0] * 6})
        rows.append((x["sum"] / x["n"] if x["n"] else -1, it, x))
    for avg, it, x in sorted(rows, reverse=True):
        spread = " ".join(f"{k}:{v}" for k, v in enumerate(x.get("s", [])) if v)
        print(f"  {it:<22} {'avg %.2f' % avg if x['n'] else 'no scores':<9}  n={x['n']:<4} {spread}")
    notes = [v for v in queue(kv, include_reviewed=True) if v.get("kind") == "review" and v.get("rid") == a.rid]
    if notes:
        print(f"\nnotes ({len(notes)}, private; mark them read with tools/feedback.py done <id>):")
        for v in notes:
            for it, t in (v.get("notes") or {}).items():
                sc = (v.get("scores") or {}).get(it)
                print(f"  {v['id']}  {it}{'' if sc is None else f' {sc}/5'}: {t}")


if __name__ == "__main__":
    main()
