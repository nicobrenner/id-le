"""Read id-le.com's anonymous stats (#34): the daily totals the site keeps in the `id-le-stats` KV namespace.

    python3 tools/stats.py            # the last 14 days
    python3 tools/stats.py --days 60
    python3 tools/stats.py --json     # the summed totals per day, as JSON

Needs CLOUDFLARE_API_TOKEN in ~/.idle-ts/cf.env (never committed; the token itself is never printed).
Each server isolate writes its own shard key (stats:<UTC day>:<shard>); this sums the shards per day.
"""
import argparse, datetime as dt, json, os, sys, urllib.parse, urllib.request

API = "https://api.cloudflare.com/client/v4"
NS_TITLE = "id-le-stats"
STEPS = ["card", "name", "feed", "dream", "gazette", "weather", "reel", "keep"]


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not t:
        p = os.path.expanduser("~/.idle-ts/cf.env")
        for line in open(p):
            if line.startswith("CLOUDFLARE_API_TOKEN="):
                t = line.split("=", 1)[1].strip()
    if not t:
        sys.exit("no CLOUDFLARE_API_TOKEN (~/.idle-ts/cf.env)")
    return t


def call(path, tok, raw=False):
    req = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    return body if raw else json.loads(body)


def add(a, b):
    for k, v in b.items():
        if isinstance(v, dict):
            add(a.setdefault(k, {}), v)
        elif isinstance(v, (int, float)):
            a[k] = a.get(k, 0) + v
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    tok = token()
    acct = call("/accounts", tok)["result"][0]["id"]
    ns = [n for n in call(f"/accounts/{acct}/storage/kv/namespaces?per_page=100", tok)["result"] if n["title"] == NS_TITLE]
    if not ns:
        sys.exit(f"no KV namespace titled {NS_TITLE!r}")
    nsid = ns[0]["id"]
    since = (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=a.days - 1)).isoformat()
    keys, cursor = [], ""
    while True:
        q = f"/accounts/{acct}/storage/kv/namespaces/{nsid}/keys?prefix=stats:&limit=1000" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
        r = call(q, tok)
        keys += [k["name"] for k in r["result"]]
        cursor = (r.get("result_info") or {}).get("cursor") or ""
        if not cursor:
            break
    days = {}
    for k in sorted(keys):
        day = k.split(":")[1]
        if day < since:
            continue
        v = json.loads(call(f"/accounts/{acct}/storage/kv/namespaces/{nsid}/values/{urllib.parse.quote(k, safe='')}", tok, raw=True))
        add(days.setdefault(day, {}), v)
    if a.json:
        print(json.dumps(days, indent=1, sort_keys=True))
        return
    if not days:
        print(f"no stats since {since}")
        return
    print(f"id-le.com anonymous stats, {since} .. today (UTC)\n")
    print(f"{'day':<11}{'visits':>7}{'back':>6}{'phone':>7}{'desk':>6}{'iOS':>5}  safe 0/1/2   fps <20/20-40/40-55/55+   batches  writes")
    for day in sorted(days):
        d = days[day]
        f = d.get("fps", {})
        s = d.get("safe", {})
        print(f"{day:<11}{d.get('visits', 0):>7}{d.get('back', 0):>6}{d.get('dev', {}).get('phone', 0):>7}{d.get('dev', {}).get('desktop', 0):>6}{d.get('ios', 0):>5}  {s.get('0', 0):>4}/{s.get('1', 0)}/{s.get('2', 0):<6}"
              f"{f.get('<20', 0):>4}/{f.get('20-40', 0)}/{f.get('40-55', 0)}/{f.get('55+', 0):<10}{d.get('batches', 0):>8}{d.get('writes', 0):>8}")
    tot = {}
    for d in days.values():
        add(tot, d)
    print("\nfirst five minutes (all days): reached by · median-ish bucket · mean time")
    started = tot.get("visits", 0) - tot.get("back", 0)
    for s in STEPS + ["world_named", "first_gazette", "first_reel_made", "backup_saved"]:
        m = tot.get("m", {}).get(s)
        if not m:
            continue
        b = max(m.get("b", {}).items(), key=lambda kv: kv[1])[0] if m.get("b") else "-"
        print(f"  {s:<16}{m['n']:>6}  ({100 * m['n'] / max(1, started):.0f}% of new visits)  mostly {b:<6} mean {m['sum'] / max(1, m['n']):.0f} s")
    f5 = tot.get("f5", {})
    print(f"  trail finished {f5.get('finished', 0)}, skipped {f5.get('skipped', 0)}")
    feats = sorted(tot.get("feat", {}).items(), key=lambda kv: -kv[1])
    print("\nopened (visits that opened it): " + (", ".join(f"{k} {v}" for k, v in feats[:20]) or "-"))
    errs = sorted(tot.get("err", {}).items(), key=lambda kv: -kv[1])
    print("\ntop errors:" + ("" if errs else " none"))
    for e, n in errs[:10]:
        print(f"  {n:>4}  {e}")


if __name__ == "__main__":
    main()
