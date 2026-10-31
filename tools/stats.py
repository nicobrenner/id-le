"""Read id-le.com's anonymous stats (#34): the daily totals the site keeps in the `id-le-stats` KV namespace.

    python3 tools/stats.py            # the last 14 days
    python3 tools/stats.py --days 60
    python3 tools/stats.py --json     # the summed totals per day, as JSON
    python3 tools/stats.py --html out.html   # a self-contained dashboard page (no external requests), light and dark

Needs CLOUDFLARE_API_TOKEN in ~/.idle-ts/cf.env (never committed; the token itself is never printed).
Each server isolate writes its own shard key (stats:<UTC day>:<shard>); this sums the shards per day.
"""
import argparse, datetime as dt, html, json, os, sys, urllib.error, urllib.parse, urllib.request

API = "https://api.cloudflare.com/client/v4"
NS_TITLE = "id-le-stats"
STEPS = ["card", "name", "feed", "dream", "gazette", "weather", "reel", "keep"]
DLSTEPS = ["what", "travel", "kinds", "team", "review", "stats", "where", "finished", "ended"]   # the data lab walkthrough (demo/idle-dlwalk.js)
DWELL = ["<1", "1-5", "5-20", "20+"]
TEST_FEATS = {"smoketest", "beacontest"}   # feature keys only our own checks send: a day with them includes our tests


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


def call(path, tok, raw=False, body=None):
    req = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"}, data=body)
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
    ap.add_argument("--html", metavar="FILE", help="write a dashboard page")
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
    if a.html:
        traffic, note = zone_traffic(tok, since)
        open(a.html, "w", encoding="utf-8").write(dashboard(days, since, traffic, note))
        print(f"wrote {a.html} ({len(days)} days with stats)")
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
    for k, title in (("ref", "came from"), ("utm", "campaign tags"), ("dw", "time on screen (minutes)"), ("fl", "guided start stopped at"), ("dl", "data lab walkthrough steps reached")):
        v = {x: n for x, n in tot.get(k, {}).items() if n}
        if v:
            items = [(x, v.get(x, 0)) for x in DWELL] if k == "dw" else sorted(v.items(), key=lambda kv: -kv[1])
            print(f"\n{title}: " + ", ".join(f"{x} {n}" for x, n in items))
    print("\ntop errors:" + ("" if errs else " none"))
    for e, n in errs[:10]:
        print(f"  {n:>4}  {e}")


def zone_traffic(tok, since):
    """Daily requests for the id-le.com zone: real browsers vs Cloudflare's own early-hints fetches. Needs the token to have
    Zone Analytics: Read; without it this returns no rows and a note saying how to enable it."""
    try:
        z = call("/zones?name=id-le.com", tok)["result"]
        if not z:
            return None, "zone id-le.com isn't visible to this token"
        q = {"query": "query($z:String!,$d:Date!){viewer{zones(filter:{zoneTag:$z}){httpRequestsAdaptiveGroups(limit:2000,filter:{date_geq:$d}){count dimensions{date requestSource}}}}}",
             "variables": {"z": z[0]["id"], "d": since}}
        r = call("/graphql", tok, body=json.dumps(q).encode())
        if r.get("errors"):
            err = json.dumps(r["errors"])
            if "permission" in err or "authz" in err:
                return None, "Traffic needs one more permission on the token: Cloudflare → My Profile → API Tokens → Edit → add Zone · Analytics · Read for id-le.com."
            return None, "traffic query failed: " + r["errors"][0].get("message", "")[:120]
        out = {}
        for g in r["data"]["viewer"]["zones"][0]["httpRequestsAdaptiveGroups"]:
            d = g["dimensions"]
            add(out.setdefault(d["date"], {}), {d["requestSource"]: g["count"]})
        return out, ""
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TypeError) as ex:
        return None, f"traffic unavailable ({type(ex).__name__})"


def dashboard(days, since, traffic, note):
    """One self-contained page (inline CSS and SVG, no external requests), light and dark."""
    e = html.escape
    tot = {}
    for d in days.values():
        add(tot, d)
    order = sorted(days)
    nz = lambda o: {k: v for k, v in (o or {}).items() if v}
    is_test = lambda day: bool(TEST_FEATS & set(nz(days[day].get("feat"))))

    def bars(rows, total=None, empty="nothing yet"):
        """Horizontal bars, one series: label, bar, value (and share of total)."""
        rows = [(k, n) for k, n in rows if n]
        if not rows:
            return f'<p class="muted">{e(empty)}</p>'
        mx = max(n for _, n in rows) or 1
        out = []
        for k, n in rows:
            pct = f" · {100 * n / total:.0f}%" if total else ""
            out.append(f'<div class="row" title="{e(str(k))}: {n}{pct}"><span class="lab">{e(str(k))}</span>'
                       f'<span class="track"><span class="bar" style="width:{max(1.5, 100 * n / mx):.1f}%"></span></span>'
                       f'<span class="val">{n}{pct}</span></div>')
        return "".join(out)

    # visits per day: new and returning stacked (two series: legend, hover titles, table view)
    W, H, pad = 640, 180, 28
    mx = max([days[d].get("visits", 0) for d in order] + [1])
    step = (W - pad) / max(1, len(order))
    bw = min(36, step - 6)
    cols = []
    for i, day in enumerate(order):
        d = days[day]
        v, back = d.get("visits", 0), d.get("back", 0)
        new = v - back
        x = pad + i * step + 3
        hn, hb = (H - 30) * new / mx, (H - 30) * back / mx
        gap = 2 if hn and hb else 0
        cols.append(f'<g><title>{day}: {v} visits ({new} new, {back} returning){" · includes our own tests" if is_test(day) else ""}</title>'
                    f'<rect x="{x:.1f}" y="{H - 20 - hn:.1f}" width="{bw:.1f}" height="{hn:.1f}" rx="3" class="s1"/>'
                    f'<rect x="{x:.1f}" y="{H - 20 - hn - hb:.1f}" width="{bw:.1f}" height="{max(0, hb - gap):.1f}" rx="3" class="s2"/>'
                    f'<text x="{x + bw / 2:.1f}" y="{H - 6}" class="ax" text-anchor="middle">{day[5:]}{"*" if is_test(day) else ""}</text></g>')
    visits_svg = (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="visits per day, new and returning">'
                  f'<line x1="{pad}" x2="{W}" y1="{H - 20}" y2="{H - 20}" class="base"/><text x="0" y="14" class="ax">{mx}</text>'
                  + "".join(cols) + "</svg>")
    vrows = "".join(f'<tr><td>{d}{"*" if is_test(d) else ""}</td><td>{days[d].get("visits", 0)}</td><td>{days[d].get("visits", 0) - days[d].get("back", 0)}</td>'
                    f'<td>{days[d].get("back", 0)}</td><td>{nz(days[d].get("dev")).get("phone", 0)}</td><td>{days[d].get("ios", 0)}</td></tr>' for d in order)

    new_visits = tot.get("visits", 0) - tot.get("back", 0)
    m = tot.get("m", {})
    funnel = [(s, (m.get(s) or {}).get("n", 0)) for s in STEPS]
    f5, fl, dw, ref, utm = nz(tot.get("f5")), nz(tot.get("fl")), nz(tot.get("dw")), nz(tot.get("ref")), nz(tot.get("utm"))
    dl = nz(tot.get("dl"))
    feats = sorted(((k, n) for k, n in nz(tot.get("feat")).items() if k not in TEST_FEATS), key=lambda kv: -kv[1])[:20]
    dev, safe, fps = nz(tot.get("dev")), nz(tot.get("safe")), nz(tot.get("fps"))
    if traffic:
        trows = "".join(f'<tr><td>{d}</td><td>{traffic[d].get("eyeball", 0)}</td><td>{traffic[d].get("earlyHintsCache", 0)}</td>'
                        f'<td>{sum(v for k, v in traffic[d].items() if k not in ("eyeball", "earlyHintsCache"))}</td></tr>' for d in sorted(traffic))
        tr = (f'<table><thead><tr><th>day</th><th>browser requests</th><th>Cloudflare early-hints fetches</th><th>other</th></tr></thead><tbody>{trows}</tbody></table>'
              '<p class="muted">Requests include bots and scanners and every file a page loads; visits (above) are what the game itself counted.</p>')
    else:
        tr = f'<p class="muted">{e(note)}</p>'
    errs = sorted(nz(tot.get("err")).items(), key=lambda kv: -kv[1])[:12]
    err_html = "".join(f"<li><b>{n}</b> <code>{e(k)}</code></li>" for k, n in errs) or '<li class="muted">none</li>'
    made = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    tested = [d for d in order if is_test(d)]
    tile = lambda n, label: f'<div class="tile"><b>{n}</b><span>{e(label)}</span></div>'
    later = "no data yet (counted from this version on)"
    dark = "color-scheme:dark;--surface:#1a1a19;--card:#222220;--ink:#ffffff;--ink2:#c3c2b7;--muted:#8f8e86;--line:#3a3a37;--s1:#3987e5;--s2:#d95926;--track:#2c2c2a"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Id|le stats</title><style>
:root{{color-scheme:light;--surface:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--muted:#7a7974;--line:#e4e3de;--s1:#2a78d6;--s2:#eb6834;--track:#f0efea}}
@media (prefers-color-scheme:dark){{:root:where(:not([data-theme="light"])){{{dark}}}}}
:root[data-theme="dark"]{{{dark}}}
body{{margin:0;background:var(--surface);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif}}
main{{max-width:1080px;margin:0 auto;padding:20px 16px 40px}}h1{{font-size:22px;margin:0 0 2px}}h2{{font-size:14px;margin:0 0 10px;color:var(--ink2);font-weight:600}}
.sub,.muted{{color:var(--muted)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:14px}}
section{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}}section.wide{{grid-column:1/-1}}
.tiles{{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}}.tile{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:100px}}
.tile b{{display:block;font-size:24px}}.tile span{{color:var(--ink2);font-size:12px}}
.row{{display:grid;grid-template-columns:minmax(70px,34%) 1fr auto;gap:8px;align-items:center;margin:3px 0;font-size:13px}}
.lab{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2)}}
.track{{height:10px;background:var(--track);border-radius:4px;overflow:hidden}}.bar{{display:block;height:100%;background:var(--s1);border-radius:0 4px 4px 0}}
.val{{font-variant-numeric:tabular-nums}}.row:hover .bar,g:hover rect{{filter:brightness(1.15)}}
svg{{width:100%;height:auto;display:block}}.s1{{fill:var(--s1)}}.s2{{fill:var(--s2)}}.base{{stroke:var(--line)}}.ax{{fill:var(--muted);font-size:11px}}
.legend{{display:flex;gap:14px;font-size:12px;color:var(--ink2);margin:4px 0 8px}}.sw{{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}}
table{{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}}td,th{{border-bottom:1px solid var(--line);padding:3px 6px;text-align:right}}
td:first-child,th:first-child{{text-align:left}}details{{margin-top:8px}}summary{{cursor:pointer;color:var(--ink2);font-size:12px}}
ul{{padding-left:18px;margin:0}}code{{font-size:12px;word-break:break-word}}
</style></head><body><main>
<h1>Id|le stats</h1><div class="sub">id-le.com · anonymous daily totals since {since} (UTC) · made {made}{" · * = day includes our own tests (" + ", ".join(tested) + ")" if tested else ""}</div>
<div class="tiles">{tile(tot.get("visits", 0), "visits")}{tile(new_visits, "new browsers")}{tile(tot.get("back", 0), "returning")}{tile(dev.get("phone", 0), "on phones")}{tile(f5.get("finished", 0), "finished the guided start")}{tile(ref.get("reddit.com", 0) + ref.get("news.ycombinator.com", 0), "from Reddit + HN")}</div>
<div class="grid">
<section class="wide"><h2>Visits per day</h2><div class="legend"><span><i class="sw" style="background:var(--s1)"></i>new</span><span><i class="sw" style="background:var(--s2)"></i>returning</span></div>{visits_svg}
<details><summary>table</summary><table><thead><tr><th>day</th><th>visits</th><th>new</th><th>returning</th><th>phone</th><th>iOS</th></tr></thead><tbody>{vrows}</tbody></table></details></section>
<section><h2>Guided start: who reached each moment (of {new_visits} new browsers)</h2>{bars(funnel, total=new_visits or None)}<p class="muted">finished {f5.get("finished", 0)} · skipped {f5.get("skipped", 0)}</p></section>
<section><h2>Guided start: where page loads stopped</h2>{bars([(k, fl.get(k, 0)) for k in ["none"] + STEPS + ["finished", "skipped"]], total=sum(fl.values()) or None, empty=later)}</section>
<section><h2>Came from</h2>{bars(sorted(ref.items(), key=lambda kv: -kv[1])[:15], total=sum(ref.values()) or None, empty=later)}{("<h2 style='margin-top:12px'>Campaign tags</h2>" + bars(sorted(utm.items(), key=lambda kv: -kv[1])[:10])) if utm else ""}</section>
<section><h2>Data lab walkthrough: browsers that reached each step</h2>{bars([(k, dl.get(k, 0)) for k in DLSTEPS], total=dl.get("what") or None, empty=later)}</section>
<section><h2>Time on screen per page load (minutes)</h2>{bars([(k, dw.get(k, 0)) for k in DWELL], total=sum(dw.values()) or None, empty=later)}</section>
<section><h2>Opened (visits that opened it)</h2>{bars(feats)}</section>
<section><h2>Devices</h2>{bars([("desktop", dev.get("desktop", 0)), ("phone", dev.get("phone", 0)), ("iOS", tot.get("ios", 0))])}
<h2 style="margin-top:12px">Crash guard level at load</h2>{bars([("0 · normal", safe.get("0", 0)), ("1 · lighter", safe.get("1", 0)), ("2 · no Oracle", safe.get("2", 0))])}</section>
<section><h2>Frame rate (fps)</h2>{bars([(k, fps.get(k, 0)) for k in ["<20", "20-40", "40-55", "55+"]])}</section>
<section><h2>Errors</h2><ul>{err_html}</ul></section>
<section class="wide"><h2>Traffic (Cloudflare)</h2>{tr}</section>
</div></main></body></html>"""


if __name__ == "__main__":
    main()
