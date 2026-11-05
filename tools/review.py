"""⭐ Reviews (11-03): ask players to score a few experiments (the logo animations, the fonts…), then read what they said.

A review is review:<rid> in the id-le-stats KV namespace: { kind, title, items, note?, stage: team|public, team?, showTotals?, open? }.
Swipes are stored as scores (✕ 1, ✓ 3, ★ 5) and "which one?" picks as pairwise wins (pw: {"a>b": n}). The game opens it with
?review=<rid> (demo/idle-reviews.js), and 🧪 lists the open ones (reviews:index). Two are built into the helper (helper/worker.js REVIEWS):
logos and fonts; writing review:logos here replaces the built-in one (for example to add round 3's logos or Nico's own note).
Scores add up in review:<rid>:agg; notes go to the private queue (python3 tools/feedback.py shows them, kind 'review').

    python3 tools/review.py new <rid> --kind logos --items a,b,c [--title "…"] [--note-file note.txt] [--show-totals]
    python3 tools/review.py results <rid>          # like-rate, Bradley-Terry (from "which one?"), averages, the 0-5 spread, the notes
    python3 tools/review.py promote <rid> --top 3  # a public stage (<rid>-public) with the team's top N, for everyone
    python3 tools/review.py close <rid>            # stop taking scores (the link then says it has closed)
    python3 tools/review.py open <rid>             # take scores again
    python3 tools/review.py list                   # the reviews the game lists
    add --staging to any of these to use staging.id-le.com's namespace (id-le-stats-staging)

The link to share: https://id-le.com/?review=<rid> (staging: https://staging.id-le.com/?review=<rid>).
Needs CLOUDFLARE_API_TOKEN in ~/.idle-ts/cf.env (never committed; never printed).
"""
import argparse, json, math, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feedback import KV, queue  # noqa: E402

KINDS = ["logos", "fonts", "creatures", "objects"]
RID, ITEM = re.compile(r"^[a-z0-9-]{1,30}$"), re.compile(r"^[a-z0-9-]{1,40}$")
BUILTIN = {"logos": {"kind": "logos", "title": "the logo", "stage": "team", "team": "loop", "items": ["c3-typed-dust", "c3-typed-crt", "a3-dust", "b3a-dust-crt", "b3b-crt", "scope-strike", "scope-crt", "typed-scope", "scope-meter", "scope-shockwave", "strike-purr-static", "crt-off"]},
           "fonts": {"kind": "fonts", "title": "our fonts", "stage": "team", "team": "loop", "items": ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]}}


def cfg_of(kv, rid):
    raw = kv.get("review:" + rid)
    return json.loads(raw) if raw else (dict(BUILTIN[rid], open=True) if rid in BUILTIN else None)


def bradley_terry(items, pw, iters=60):
    """strengths from pairwise wins (the worker's MM updates: a prior of one tie against an average opponent keeps unseen items finite)"""
    s = {i: 1.0 for i in items}; w = {i: 0.5 for i in items}; n = {}
    for k, v in (pw or {}).items():
        a, b = k.split(">")
        if a in s and b in s:
            w[a] += v; key = tuple(sorted((a, b))); n[key] = n.get(key, 0) + v
    for _ in range(iters):
        nx = {}
        for i in items:
            d = 1 / (s[i] + 1)
            for (a, b), c in n.items():
                if a == i: d += c / (s[i] + s[b])
                elif b == i: d += c / (s[i] + s[a])
            nx[i] = w[i] / d
        g = math.exp(sum(math.log(nx[i]) for i in items) / len(items)); s = {i: nx[i] / g for i in items}
    return s


def result_lines(rid, cfg, agg, notes):
    """the results as printed: totals, one line per item (like-rate, n, average, Bradley-Terry, the 0-5 spread, skips and notes), the notes"""
    out = [f"review {rid} ({cfg['kind']}, {cfg.get('stage', 'public')} stage, {'open' if cfg.get('open', True) else 'closed'}): {agg.get('sends', 0)} browsers"
           + (f" ({agg['pick']} from the pick link, id-le.com/review/intro-logo-animation)" if agg.get('pick') else "") + f", {sum((agg.get('pw') or {}).values())} 'which one?' picks"
           + f", {sum((x or {}).get('skip', 0) for x in (agg.get('items') or {}).values())} skips"]
    for score, it, lr, n, avg, bt, spread in ranking(cfg, agg):
        sp = " ".join(f"{k}:{v}" for k, v in enumerate(spread) if v); x = (agg.get("items") or {}).get(it) or {}
        extra = (f"  skipped {x['skip']}" if x.get("skip") else "") + (f"  notes {x['notes']}" if x.get("notes") else "")
        out.append(f"  {it:<22} {'like %3.0f%%' % (lr * 100) if lr is not None else 'no scores':<10} n={n:<4} avg={'%.2f' % avg if avg is not None else '-':<5} bt={bt:.2f}  {sp}{extra}")
    if notes:
        out.append(f"\nnotes ({len(notes)}, private; mark them read with tools/feedback.py done <id>):")
        for v in notes:
            for it, t in (v.get("notes") or {}).items():
                sc = (v.get("scores") or {}).get(it)
                out.append(f"  {v['id']}  {it}{'' if sc is None else f' {sc}/5'}: {t}")
    return out


def ranking(cfg, agg):
    """rows (score, id, like-rate, n, avg, bt): ranked by the like-rate with a Bayesian prior ((likes + 1) / (n + 2)), Bradley-Terry breaking near-ties"""
    bt = bradley_terry(cfg["items"], agg.get("pw"))
    rows = []
    for it in cfg["items"]:
        x = agg["items"].get(it, {"n": 0, "sum": 0, "s": [0] * 6}); s = x.get("s", [0] * 6); likes = sum(s[3:])
        lr = likes / x["n"] if x["n"] else None
        rows.append(((likes + 1) / (x["n"] + 2) + 0.02 * math.log(bt[it]), it, lr, x["n"], x["sum"] / x["n"] if x["n"] else None, bt[it], s))
    return sorted(rows, reverse=True)


def index_add(kv, rid):
    ids = json.loads(kv.get("reviews:index") or "[]")
    if rid not in ids:
        kv.put("reviews:index", json.dumps(ids + [rid]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["new", "results", "close", "open", "list", "promote"])
    ap.add_argument("rid", nargs="?")
    ap.add_argument("--kind", choices=KINDS); ap.add_argument("--items"); ap.add_argument("--title", default="")
    ap.add_argument("--note-file"); ap.add_argument("--show-totals", action="store_true"); ap.add_argument("--staging", action="store_true")
    ap.add_argument("--stage", choices=["team", "public"], default="team"); ap.add_argument("--top", type=int, default=3)
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
        cfg = {"kind": a.kind, "title": a.title[:80] or a.rid, "items": items[:24], "stage": a.stage, "showTotals": a.show_totals, "open": True}
        if a.stage == "team":
            cfg["team"] = "loop"
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

    if a.cmd == "promote":
        cfg = cfg_of(kv, a.rid)
        if not cfg:
            sys.exit("no such review")
        agg = json.loads(kv.get(f"review:{a.rid}:agg") or "null") or {"sends": 0, "items": {}}
        top = [r[1] for r in ranking(cfg, agg) if r[3]][: max(2, a.top)]
        if len(top) < 2:
            sys.exit("not enough scores yet to pick a top")
        prid = (a.rid + "-public")[:40]
        kv.put("review:" + prid, json.dumps({"kind": cfg["kind"], "title": cfg.get("title", a.rid), "items": top, "stage": "public", "from": a.rid, "showTotals": a.show_totals, "open": True, **({"note": cfg["note"]} if cfg.get("note") else {})}))
        index_add(kv, prid)
        print(f"public stage {prid}: {', '.join(top)} (the team's top {len(top)} of {a.rid})\n  share: {site}/?review={prid}")
        return

    # results
    cfg = cfg_of(kv, a.rid)
    if not cfg:
        sys.exit("no such review")
    agg = json.loads(kv.get(f"review:{a.rid}:agg") or "null") or {"sends": 0, "items": {}}
    notes = [v for v in queue(kv, include_reviewed=True) if v.get("kind") == "review" and v.get("rid") == a.rid]
    print("\n".join(result_lines(a.rid, cfg, agg, notes)))


if __name__ == "__main__":
    main()
