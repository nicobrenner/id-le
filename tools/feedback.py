"""Read what players told the Oracle, and keep the public roadmap (Tell the Oracle, 11-01).

Submissions sit in a private queue (fb:<id> in the id-le-stats KV namespace, kept 180 days). Nothing is public until you promote it.

    python3 tools/feedback.py                      # what's new (not yet reviewed)
    python3 tools/feedback.py list --all           # everything still kept, newest first
    python3 tools/feedback.py show <id>            # one submission with its context
    python3 tools/feedback.py done <id> [<id>…]    # mark as reviewed (it stays until it expires)
    python3 tools/feedback.py promote <id> --title "…" --line "…" [--item my-id] [--status planned]
                                                   # put it on the public roadmap (anonymously: only your title and line are shown)
    python3 tools/feedback.py roadmap              # the public roadmap with its votes
    python3 tools/feedback.py roadmap-add --item ID --title "…" --line "…" [--status planned]
    python3 tools/feedback.py roadmap-remove ID
    python3 tools/feedback.py seed [--force]       # write the starting roadmap (issue #20's Next / Future, as player-facing lines)
    add --staging to any of these to use staging.id-le.com's own namespace (id-le-stats-staging)

Needs CLOUDFLARE_API_TOKEN in ~/.idle-ts/cf.env (never committed; never printed).
"""
import argparse, datetime as dt, json, os, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://api.cloudflare.com/client/v4"
KINDS = {"idea": "💡 idea", "bug": "🐞 bug", "loved": "💜 loved", "off": "🌀 felt off"}
# the starting roadmap: issue #20's "Next, in order", "Future" and "Seasonal", rewritten for players (no issue numbers, no internals)
SEED = [
    ("genesis", "Start from nothing", "an intro where a tiny model learns to speak, then you build a universe with the Operator, day by day", "in progress"),
    ("phones", "Easier on phones", "bigger touch targets and simpler menus", "next"),
    ("datalab-v2", "Train your own classifiers", "retrain the data lab's creatures in your browser and build your own pipelines", "planned"),
    ("tiny-operator", "A smarter Tiny Operator", "it understands more, chains actions and asks back when unsure", "planned"),
    ("mods", "Mods", "share rules, looks and creatures as a file or a link, made by you or your AI", "planned"),
    ("oracle-place", "The Oracle as a place", "a shrine in each world: bring it offerings, it comments and remembers", "planned"),
    ("carry", "Carry things between worlds", "take something from your drawer into another world", "planned"),
    ("graphics", "Graphics settings", "detail levels for slower computers, and a performance panel", "planned"),
    ("rave", "More rave", "DJ creatures, and raves that run well on any computer", "planned"),
    ("bodies", "New bodies", "more creature shapes, feet that walk on words, four-legged gaits", "later"),
    ("network", "A world made of the internet", "a network world, and a virus mode", "later"),
    ("holidays", "Holiday worlds", "Thanksgiving, Christmas and more, started from their Wikipedia articles", "later"),
    ("byom", "Bring your own model", "train small models that run in the browser, with benchmarks and leaderboards", "later"),
]


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not t:
        for line in open(os.path.expanduser("~/.idle-ts/cf.env")):
            if line.startswith("CLOUDFLARE_API_TOKEN="):
                t = line.split("=", 1)[1].strip()
    if not t:
        sys.exit("no CLOUDFLARE_API_TOKEN (~/.idle-ts/cf.env)")
    return t


class KV:
    def __init__(self, staging=False):
        self.tok = token()
        self.acct = self.call("/accounts")["result"][0]["id"]
        title = "id-le-stats-staging" if staging else "id-le-stats"
        ns = [n for n in self.call(f"/accounts/{self.acct}/storage/kv/namespaces?per_page=100")["result"] if n["title"] == title]
        if not ns:
            sys.exit(f"no KV namespace titled {title!r}")
        self.base = f"/accounts/{self.acct}/storage/kv/namespaces/{ns[0]['id']}"

    def call(self, path, raw=False, body=None, method=None, ctype="application/json"):
        req = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + self.tok, "Content-Type": ctype}, data=body, method=method)
        with urllib.request.urlopen(req, timeout=30) as r:
            out = r.read()
        return out if raw else json.loads(out)

    def keys(self, prefix):
        out, cursor = [], ""
        while True:
            r = self.call(f"{self.base}/keys?prefix={urllib.parse.quote(prefix)}&limit=1000" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else ""))
            out += r["result"]
            cursor = (r.get("result_info") or {}).get("cursor") or ""
            if not cursor:
                return out

    def get(self, key):
        try:
            return self.call(f"{self.base}/values/{urllib.parse.quote(key, safe='')}", raw=True).decode()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def put(self, key, value, expiration=None):
        q = f"?expiration={int(expiration)}" if expiration else ""
        self.call(f"{self.base}/values/{urllib.parse.quote(key, safe='')}{q}", body=value.encode(), method="PUT", ctype="text/plain")

    def delete(self, key):
        self.call(f"{self.base}/values/{urllib.parse.quote(key, safe='')}", method="DELETE")


def queue(kv, include_reviewed=False):
    """all submissions still kept, newest first: [{id, t, kind, text, ctx, status, exp}]"""
    out = []
    for k in kv.keys("fb:"):
        raw = kv.get(k["name"])
        if not raw:
            continue
        try:
            v = json.loads(raw)
        except ValueError:
            continue
        v["id"], v["exp"] = k["name"][3:], k.get("expiration")
        if include_reviewed or v.get("status") != "reviewed":
            out.append(v)
    return sorted(out, key=lambda x: -(x.get("t") or 0))


def when(t):
    return dt.datetime.fromtimestamp((t or 0) / 1000).strftime("%Y-%m-%d %H:%M")


def show_list(items):
    if not items:
        print("nothing new: the Oracle's queue is empty")
        return
    for v in items:
        ctx = " · ".join(f"{k} {v['ctx'][k]}" for k in ("page", "place", "device", "build") if (v.get("ctx") or {}).get(k))
        print(f"{v['id']}  {when(v.get('t'))}  {KINDS.get(v.get('kind'), v.get('kind'))}{'  (reviewed)' if v.get('status') == 'reviewed' else ''}")
        print(f"    {v.get('text', '')}")
        if ctx:
            print(f"    [{ctx}]")
        if (v.get("ctx") or {}).get("err"):
            print(f"    last error: {v['ctx']['err']}")


def road_get(kv):
    try:
        r = json.loads(kv.get("roadmap:public") or "null") or {"items": []}
    except ValueError:
        r = {"items": []}
    try:
        votes = json.loads(kv.get("roadmap:votes") or "{}") or {}
    except ValueError:
        votes = {}
    return r, votes


def road_put(kv, r):
    r["updated"] = int(time.time())
    kv.put("roadmap:public", json.dumps(r, ensure_ascii=False))


def summary(kv):
    """for the stats dashboard: counts by kind (new / all) and the latest 20, newest first"""
    items = queue(kv, include_reviewed=True)
    by = {}
    for v in items:
        b = by.setdefault(v.get("kind", "?"), [0, 0])
        b[1] += 1
        b[0] += v.get("status") != "reviewed"
    return {"by_kind": by, "latest": items[:20], "total": len(items)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", nargs="?", default="list", choices=["list", "show", "done", "promote", "roadmap", "roadmap-add", "roadmap-remove", "seed"])
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--staging", action="store_true")
    ap.add_argument("--title"); ap.add_argument("--line", default=""); ap.add_argument("--item"); ap.add_argument("--status", default="planned")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    kv = KV(a.staging)
    if a.cmd == "list":
        show_list(queue(kv, a.all))
    elif a.cmd == "show":
        for i in a.ids:
            raw = kv.get("fb:" + i)
            print(json.dumps(json.loads(raw), indent=1, ensure_ascii=False) if raw else f"{i}: not found (expired?)")
    elif a.cmd == "done":
        exp = {k["name"][3:]: k.get("expiration") for k in kv.keys("fb:")}
        for i in a.ids:
            raw = kv.get("fb:" + i)
            if not raw:
                print(f"{i}: not found"); continue
            v = json.loads(raw); v["status"] = "reviewed"
            kv.put("fb:" + i, json.dumps(v, ensure_ascii=False), expiration=exp.get(i))   # keeps its original 180-day expiry
            print(f"{i}: reviewed")
    elif a.cmd in ("promote", "roadmap-add"):
        if not a.title:
            sys.exit("--title is required (the public wording: never paste the player's text verbatim without reading it)")
        item = a.item or (a.ids[0] if a.cmd == "promote" and a.ids else None)
        item = (item or a.title).lower()
        item = "".join(c if c.isalnum() else "-" for c in item).strip("-")[:40]
        r, _ = road_get(kv)
        r["items"] = [x for x in r["items"] if x["id"] != item] + [{"id": item, "title": a.title[:80], "line": a.line[:160], "status": a.status[:20]}]
        road_put(kv, r)
        if a.cmd == "promote":
            exp = {k["name"][3:]: k.get("expiration") for k in kv.keys("fb:")}
            for i in a.ids:
                raw = kv.get("fb:" + i)
                if raw:
                    v = json.loads(raw); v["status"] = "reviewed"; v["roadmap"] = item
                    kv.put("fb:" + i, json.dumps(v, ensure_ascii=False), expiration=exp.get(i))
        print(f"on the roadmap as {item!r}: {a.title}")
    elif a.cmd == "roadmap-remove":
        r, _ = road_get(kv)
        r["items"] = [x for x in r["items"] if x["id"] not in a.ids]
        road_put(kv, r); print("removed:", ", ".join(a.ids))
    elif a.cmd == "seed":
        r, _ = road_get(kv)
        if r["items"] and not a.force:
            sys.exit(f"the roadmap already has {len(r['items'])} items (use --force to replace them)")
        road_put(kv, {"items": [{"id": i, "title": t, "line": l, "status": s} for i, t, l, s in SEED]})
        print(f"seeded {len(SEED)} items")
    if a.cmd in ("roadmap", "seed", "promote", "roadmap-add", "roadmap-remove"):
        r, votes = road_get(kv)
        print(f"\npublic roadmap ({len(r['items'])} items; the game caches it for a minute):")
        for x in sorted(r["items"], key=lambda x: -votes.get(x["id"], 0)):
            print(f"  ▲{votes.get(x['id'], 0):>3}  {x['id']:<16} {x['title']}  [{x.get('status', '')}]  {x.get('line', '')}")


if __name__ == "__main__":
    main()
