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
DLSTEPS = ["what", "travel", "irc", "kinds", "team", "review", "stats", "where", "finished", "ended"]   # the data lab walkthrough (demo/idle-dlwalk.js)
GSTEPS = ["light", "words", "creatures", "weather", "music", "hut"]   # the genesis steps (demo/idle-genesis.js); "guided" / "skipped" = how its guide ended
DWELL = ["<1", "1-5", "5-20", "20+"]
EG = {"cr": ["0-12", "13-30", "31-60", "61-150", "151+"], "born": ["0", "1-5", "6-20", "21+"], "charts": ["0", "1-5", "6-20", "21+"],
      "built": ["0", "1-5", "6-20", "21+"], "fed": ["0", "1-5", "6-20", "21+"], "reels": ["0", "1-5", "6-20", "21+"], "errs": ["0", "1", "2-5", "6+"]}   # engagement buckets (demo/idle-stats.js, helper/worker.js)
EG_NAMES = {"cr": "creatures in the world when they left", "born": "creatures born during the visit", "charts": "charts made during the visit",
            "built": "buildings finished during the visit", "fed": "words fed by the player", "reels": "reels played during the visit", "errs": "errors a visit saw"}
PANELS = {"music": "music", "studio": "studio", "lab": "data lab", "advisor": "advisor", "almanac": "almanac", "drawer": "drawer", "trees": "trees",
          "reels": "reels list", "operator": "Operator", "creatures": "creatures", "irc": "IRC"}


def engage2(tot):
    """Engagement v2 (11-01) in plain words: [(heading, [(label, value, share or None)], note)] plus a few sentences. Days before v2 have none of it."""
    x = tot.get("x") or {}
    pos = lambda o: {k: v for k, v in (o or {}).items() if v and v > 0}
    did, ws, pt, ct, opa, fav, rage, path = (pos(x.get(k)) for k in ("did", "ws", "pt", "ct", "opa", "fav", "rage", "path"))
    v = tot.get("v2visits", 0) or 0   # visit reports from pages that send engagement v2 (older days and pages are not in it)
    if not (did or ws or pt or ct):
        return [], []
    pc = lambda n: f"{100 * n / v:.0f}%" if v else "-"
    avg = lambda secs, n: f"{secs / n:.0f} s" if n else "-"
    lines = []
    for key, what in (("reel", "watched a memory reel"), ("dream", "watched a dream"), ("mind", "watched a creature's mind")):
        n = did.get("w_" + key, 0)
        lines.append(f"{pc(n)} of visits {what} ({n}), {avg(ws.get(key, 0), n)} on average")
    lines.append(f"reels played {ct.get('reelplay', 0)}, watched to the end {ct.get('reelend', 0)}; dreams opened from the creatures list {ct.get('dream', 0)}")
    lines.append(f"messages: IRC {ct.get('irc', 0)} (from {did.get('irc_msg', 0)} visits), @inbox {ct.get('inbox', 0)}, Operator {ct.get('op', 0)} (from {did.get('op_msg', 0)} visits); pedia links {ct.get('pedia', 0)}")
    lines.append(f"frustration: {pc(did.get('rage', 0))} of visits rage-clicked ({did.get('rage', 0)}); {did.get('quick_exit', 0)} left within 30 s of their first click; {did.get('no_interact', 0)} left without clicking"
                 " (these two also count tabs that were never on screen: background tabs, prerendered pages)")
    if did.get('ni_seen') or did.get('qe_seen'):   # from Nov 3's fix on: only page loads that were on screen at least 5 s
        lines.append(f"  on screen ≥ 5 s (from the Nov 3 fix on): {did.get('ni_seen', 0)} left without clicking, {did.get('qe_seen', 0)} left within 30 s of their first click")
    panels = sorted(((PANELS[k], did.get("p_" + k, 0), pt.get(k, 0)) for k in PANELS if did.get("p_" + k)), key=lambda r: -r[2])
    groups = [
        ("Average seconds with each panel open (visits that opened it, in brackets)", [(f"{lab} ({n})", round(secs / n)) for lab, n, secs in panels], None),
        ("Favorite creatures by name (starter world)", sorted(((k[5:], n) for k, n in fav.items() if k.startswith("name:")), key=lambda r: -r[1])[:15], None),
        ("Favorites by job", sorted(((k[4:], n) for k, n in fav.items() if k.startswith("job:")), key=lambda r: -r[1]), None),
        ("Favorites by family and body", sorted(((k.replace("fam:", "family ").replace("body:", "body "), n) for k, n in fav.items() if k[:4] in ("fam:", "body")), key=lambda r: -r[1]), None),
        ("First three features opened (path)", sorted(path.items(), key=lambda r: -r[1])[:12], None),
        ("Operator actions that ran (until Nov 2 the world's own evolve/disaster events and the Tiny Operator's tool logs were counted here too: those days' evolve and ai_* numbers are inflated)", sorted(opa.items(), key=lambda r: -r[1]), None),
        ("Where rage clicks happened (in the creature card and the world: on what)", sorted(((rage_label(k), n) for k, n in rage.items()), key=lambda r: -r[1]), None),
    ]
    return lines, [g for g in groups if g[1]]

RAGE_PART = {"hangry": "😤 hangry", "mutate": "mutate", "big": "×3", "revert": "revert", "keep": "♥ keep", "clone": "clone", "portrait": "🗄 portrait", "rest": "rest", "input": "the whisper box",
             "name": "its name", "text": "the card's text", "head": "the card's header", "creature": "a creature", "word": "a word", "empty": "empty floor", "thing": "a thing (hut, chart, design)"}


def rage_label(k):
    """'whisper:keep' → 'creature card · ♥ keep', 'world:word' → 'world · a word' (before Nov 3 these were just 'whisper' and 'world')"""
    if ":" in k:
        a, b = k.split(":", 1)
        return ("creature card" if a == "whisper" else a) + " · " + RAGE_PART.get(b, b)
    return {"whisper": "creature card (no detail: before Nov 3)", "world": "world (no detail: before Nov 3)"}.get(k, k)


GSTEP_NAMES = {"words": "words", "creatures": "first creatures", "light": "light", "weather": "weather", "hut": "a hut", "music": "music"}


def operator(tot):
    """How conversations with the Operator go (11-01): sentences + [(heading, rows, None)]. Counts only: the text never leaves the page."""
    op = {k: v for k, v in ((tot.get("x") or {}).get("op") or {}).items() if v and v > 0}
    did = (tot.get("x") or {}).get("did") or {}
    if not op:
        return [], []
    g = lambda k: op.get(k, 0)
    to = sum(g("out:" + k) for k in ("acted", "unsure", "chat", "error"))
    pc = lambda n, d: f"{100 * n / d:.0f}%" if d else "-"
    lines = []
    if to:
        lines.append(f"the Tiny Operator acted on {pc(g('out:acted'), to)} of {to} messages; unsure {pc(g('out:unsure'), to)}, only chatted {pc(g('out:chat'), to)}, failed {pc(g('out:error'), to)}; {g('out:nudged')} genesis nudges")
    byo = sum(g("byo:" + k) for k in ("tool", "none", "error"))
    if byo:
        lines.append(f"your own AI: {pc(g('byo:tool'), byo)} of {byo} turns used a tool, {pc(g('byo:error'), byo)} failed")
    msgs = to + byo
    lines.append(f"frustration: {g('fr:rephrase')} retry streaks (2+ messages in 20 s, nothing done), {g('fr:abandon')} gave up after a miss, {g('fr:caps')} in ALL CAPS, {g('fr:punct')} with ?! or !!; "
                 f"{did.get('op_miss', 0)} visits had at least one miss")
    mood = [(k, g("mood:" + k)) for k in ("negative", "neutral", "positive")]
    if sum(n for _, n in mood):
        m = sum(n for _, n in mood); mm = sum(g("mm:" + k) for k in ("negative", "neutral", "positive"))
        lines.append(f"mood of Operator messages (worked out in the browser): negative {pc(g('mood:negative'), m)}, neutral {pc(g('mood:neutral'), m)}, positive {pc(g('mood:positive'), m)}"
                     + (f"; right after a miss: negative {pc(g('mm:negative'), mm)} of {mm}" if mm else ""))
    steps = [(GSTEP_NAMES[k], g("gd:" + k), g("gt:" + k), g("gn:" + k)) for k in GSTEP_NAMES if g("gd:" + k) or g("gn:" + k)]
    for name, d_, t_, n_ in steps:
        lines.append(f"genesis step '{name}': done {d_} times, {t_ / d_:.1f} tries on average, {n_} nudges" if d_ else f"genesis step '{name}': {n_} nudges, not done yet")
    groups = [
        ("What the Tiny Operator guessed", sorted(((k[4:], n) for k, n in op.items() if k.startswith("opt:")), key=lambda r: -r[1]), None),
        ("How sure it was", [(lab, g("cf:" + k)) for k, lab in (("lo", "under 50%"), ("mid", "50-90%"), ("hi", "90% or more"))], None),
        ("Mood of Operator messages", mood, None),
    ]
    return lines, [gr for gr in groups if any(n for _, n in gr[1])]

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


# the storyline's funnel (helper/worker.js 'sf': "arm|step" → browsers), in the order a player meets them
SF_STEPS = ["title", "messages", "chat", "boot", "run", "crash", "landing", "operator", "lights", "e1words", "e1life", "e1done", "e0_start1", "e0_play", "ch_story", "ch_play", "pw_shown", "pw_story", "st_resume", "st_restart"]
SF_NAMES = {"title": "title card", "messages": "messages", "chat": "labchat", "boot": "boot", "run": "the run", "crash": "the crash", "landing": "the dark",
            "operator": "the Operator", "lights": "lights on", "e1words": "Epoch 0: words", "e1life": "Epoch 0: life", "e1done": "Epoch 0 done (Genesis)",
            "e0_start1": "Epoch 0 moment: start Epoch 1", "e0_play": "Epoch 0 moment: the playground",
            "ch_story": "chooser: the storyline", "ch_play": "chooser: the playground", "pw_shown": "playground welcome shown", "pw_story": "playground welcome: started the story",
            "st_resume": "⚙ storyline: resumed", "st_restart": "⚙ storyline: restarted"}


# the Founder gift (idle-founder.js), from the same once-per-browser moments ('fd_…'), summed over the storyline's arms
FD_STEPS = [("world", "eligible: early world"), ("link", "eligible: gift link"), ("offer", "offer shown"), ("letter", "letter shown"), ("creator", "creator opened"),
            ("exp1", "ran 1+ experiments"), ("exp5", "ran 5+"), ("exp20", "ran 20+"), ("released", "released")]


def fd_total(sfs):
    t = {}
    for o in sfs.values():
        for k, n in o.get("fd", {}).items():
            t[k] = t.get(k, 0) + n
    return t


def sf_split(sf):
    """{'story|title': n, 'story|skip:chat': n, 'none|offer_shown': n, ...} → {arm: {'steps': {...}, 'skips': {...}, 'offer': {...}}}"""
    out = {}
    for k, n in (sf or {}).items():
        if not n or "|" not in k:
            continue
        arm, step = k.split("|", 1)
        o = out.setdefault(arm, {"steps": {}, "skips": {}, "offer": {}})
        if step.startswith("skip:"):
            o["skips"][step[5:]] = o["skips"].get(step[5:], 0) + n
        elif step.startswith("fd_"):
            o.setdefault("fd", {})[step[3:]] = o.setdefault("fd", {}).get(step[3:], 0) + n
        elif step.startswith("end_"):
            o.setdefault("end", {})[step[4:]] = o.setdefault("end", {}).get(step[4:], 0) + n
        elif step.startswith("offer_"):
            o["offer"][step[6:]] = o["offer"].get(step[6:], 0) + n
        else:
            o["steps"][step] = o["steps"].get(step, 0) + n
    return out



# the story's logo A/B (idle-epoch0.js, Nov 3): the worker also files the moments from the logo on under 'lg:<arm>|step'
LG_ARMS = {"c3": "C3 · Typed, dust", "crt": "C3-crt · Typed, CRT off"}
LG_STEPS = [("shown", "saw the logo"), ("landing", "the dark"), ("operator", "the Operator"), ("lights", "lights on"), ("e1words", "words"), ("e1life", "life"), ("e1done", "Epoch 0 done"), ("e0_start1", "start Epoch 1"), ("e0_play", "the playground"), ("end_shown", "end card")]


def lg_split(sfs):
    """sf_split's result → (storyline arms without the logo arms, {logo arm: {step: n}})"""
    main = {a: o for a, o in sfs.items() if not a.startswith("lg:")}
    lg = {}
    for a, o in sfs.items():
        if a.startswith("lg:"):
            st = dict(o["steps"])
            for k, n in list(st.items()):
                if k.startswith("lg_shown:"):
                    st["shown"] = st.get("shown", 0) + n
            st.update({"end_" + k: n for k, n in o.get("end", {}).items()})
            st.update({"skip:" + k: n for k, n in o["skips"].items()})
            lg[a[3:]] = st
    return main, lg


# time per step (Nov 3): 'sd' = {"arm|step": {n, sum, b: {bucket: n}}}, seconds of on-screen time since the moment before
SD_B = ["<10s", "10-30s", "30-60s", "1-3m", "3-10m", "10m+"]
SD_ORDER = SF_STEPS + ["lg_shown:c3", "lg_shown:crt", "end_shown", "end_roadmap", "end_github", "end_free", "offer_shown", "offer_accepted"]
SD_NAMES = dict(SF_NAMES, **{"lg_shown:c3": "logo (C3)", "lg_shown:crt": "logo (C3-crt)", "end_shown": "end card", "end_roadmap": "end → roadmap", "end_github": "end → GitHub",
                             "end_free": "end → the playground", "offer_shown": "offer shown", "offer_accepted": "offer accepted"})


def sd_rows(sd):
    """{arm: [(step name, n, mean s, {bucket: n})]} in play order"""
    out = {}
    for k, x in (sd or {}).items():
        if "|" not in k or not isinstance(x, dict) or not x.get("n"):
            continue
        arm, step = k.split("|", 1)
        out.setdefault(arm, {})[step] = x
    return {arm: [(SD_NAMES.get(st, st), x["n"], x.get("sum", 0) / x["n"], x.get("b", {})) for st, x in sorted(st_.items(), key=lambda kv: SD_ORDER.index(kv[0]) if kv[0] in SD_ORDER else 99)]
            for arm, st_ in out.items()}


# coming back (Nov 3): 'rb' = {"arm|cohort day|bucket": browsers}; each browser sends each bucket at most once, d0 = its first day
RB_B = [("d1", 1, "day 1"), ("d2-3", 2, "days 2–3"), ("d4-7", 4, "days 4–7"), ("d8-14", 8, "days 8–14"), ("d15+", 15, "day 15+")]


def rb_rows(rb, last_day):
    """{arm: (starts, [(label, came back, eligible starts, %)], first cohort, last cohort)}: a bucket only counts cohorts old enough to have reached it by last_day"""
    import datetime as _dt
    by = {}
    for k, n in (rb or {}).items():
        parts = k.split("|")
        if len(parts) != 3 or not n:
            continue
        arm, c, b = parts
        by.setdefault(arm, {}).setdefault(c, {})[b] = by.setdefault(arm, {}).setdefault(c, {}).get(b, 0) + n
    end = _dt.date.fromisoformat(last_day)
    out = {}
    for arm, cs in by.items():
        starts = sum(v.get("d0", 0) for v in cs.values())
        rows = []
        for b, lo, lab in RB_B:
            ok = [c for c in cs if (end - _dt.date.fromisoformat(c)).days >= lo]
            den = sum(cs[c].get("d0", 0) for c in ok)
            num = sum(cs[c].get(b, 0) for c in ok)
            rows.append((lab, num, den, 100 * num / den if den else None))
        out[arm] = (starts, rows, min(cs), max(cs))
    return out


def lg_lines(lg):
    out = []
    for arm in ("c3", "crt"):
        st = lg.get(arm)
        if not st:
            continue
        first = st.get("shown", 0)
        out.append(f"  {LG_ARMS[arm]:<26} " + " → ".join(f"{lab} {st.get(k, 0)}" + (f" ({100 * st.get(k, 0) / first:.0f}%)" if first and k != "shown" else "") for k, lab in LG_STEPS))
    return out

def gv_split(gv):
    """The genesis A/B block (helper/worker.js 'gv'): {'genesis|visit': n, 'genesis|dw:<1': n, 'starter|feat:card': n, ...} → per variant."""
    out = {}
    for k, n in (gv or {}).items():
        if not n or "|" not in k:
            continue
        v, rest = k.split("|", 1)
        o = out.setdefault(v, {"visits": 0, "dw": {}, "feat": {}})
        if rest == "visit":
            o["visits"] += n
        elif rest.startswith("dw:"):
            o["dw"][rest[3:]] = o["dw"].get(rest[3:], 0) + n
        elif rest.startswith("feat:"):
            o["feat"][rest[5:]] = o["feat"].get(rest[5:], 0) + n
    return out


def add(a, b):
    for k, v in b.items():
        if isinstance(v, dict):
            add(a.setdefault(k, {}), v)
        elif isinstance(v, (int, float)):
            a[k] = a.get(k, 0) + v
    return a


HLL_M = 2048


def hll_merge(sketches):
    """Register-wise max of base64 sketches (one per shard); None if there is none."""
    import base64
    out = None
    for sv in sketches:
        try:
            b = base64.b64decode(sv)
        except Exception:
            continue
        if len(b) != HLL_M:
            continue
        out = bytearray(b) if out is None else bytearray(max(x, y) for x, y in zip(out, b))
    return out


def hll_count(reg):
    """The standard HyperLogLog estimate with the small-range correction (about 2.3% standard error at 2,048 registers)."""
    import math
    if not reg:
        return 0
    z = sum(1 for r in reg if r == 0)
    e = (0.7213 / (1 + 1.079 / HLL_M)) * HLL_M * HLL_M / sum(2.0 ** -r for r in reg)
    return HLL_M * math.log(HLL_M / z) if e <= 2.5 * HLL_M and z else e


def server_days(days):
    """Per day, what the server counted itself (the pv block): page views, visits, bots, visitors (estimated), and the in-page reports."""
    rows = {}
    for d in sorted(days):
        pv = days[d].get("pv") or {}
        views, visits, bots = pv.get("views") or {}, pv.get("visits") or {}, pv.get("bots") or {}
        if not (views or bots):
            continue
        uv = days[d].get("uv") or {}
        rows[d] = {"visitors": uv.get("all", 0), "visitors_game": uv.get("game", 0), "visits": sum(visits.values()), "visits_game": visits.get("game", 0),
                   "views": sum(views.values()), "views_by": views, "bots": sum(bots.values()), "gpc": sum((pv.get("gpc") or {}).values()), "reported": days[d].get("visits", 0)}
    return rows


def feedback_summary():
    """Tell the Oracle (tools/feedback.py): counts by kind and the latest 20; None when the queue can't be read"""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import feedback
        return feedback.summary(feedback.KV())
    except Exception as e:   # the dashboard never fails because of this section
        print(f"(Tell the Oracle: not read: {e})")
        return None


def feedback_html(fb):
    e = lambda s: html.escape(str(s or ""))
    kinds = {"idea": "💡 ideas", "bug": "🐞 bugs", "loved": "💜 loved", "off": "🌀 felt off"}
    rows = "".join(f"<li><b>{e(kinds.get(k, k))}</b>: {n[1]} ({n[0]} new)</li>" for k, n in sorted(fb["by_kind"].items(), key=lambda x: -x[1][1])) or '<li class="muted">nothing yet</li>'
    latest = "".join(f"<li><small>{e(dt.datetime.fromtimestamp((v.get('t') or 0) / 1000).strftime('%b %d %H:%M'))} · {e(kinds.get(v.get('kind'), v.get('kind')))}"
                     f"{' · reviewed' if v.get('status') == 'reviewed' else ''} · <code>{e(v.get('id'))}</code></small><br>{e(v.get('text'))}</li>" for v in fb["latest"]) or '<li class="muted">nothing yet</li>'
    return (f"<section><h2>🔮 Told to the Oracle ({fb['total']} kept)</h2><p class=\"muted\">Private: only this local page shows them. Review with "
            f"<code>python3 tools/feedback.py</code>; promote to the roadmap with <code>feedback.py promote ID --title …</code>.</p><ul>{rows}</ul><h3>Latest 20</h3><ul>{latest}</ul></section>")


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
    days, sketches = {}, {}
    for k in sorted(keys):
        day = k.split(":")[1]
        if day < since:
            continue
        v = json.loads(call(f"/accounts/{acct}/storage/kv/namespaces/{nsid}/values/{urllib.parse.quote(k, safe='')}", tok, raw=True))
        for kk, sv in ((v.get("pv") or {}).get("hll") or {}).items():   # sketches merge by max, never add
            sketches.setdefault(day, {}).setdefault(kk, []).append(sv)
        add(days.setdefault(day, {}), v)
    for day, by in sketches.items():
        if day in days:
            days[day]["uv"] = {kk: round(hll_count(hll_merge(lst))) for kk, lst in by.items()}
    if a.json:
        print(json.dumps(days, indent=1, sort_keys=True))
        return
    fb = feedback_summary()
    if a.html:
        traffic, note = zone_traffic(tok, since)
        page = dashboard(days, since, traffic, note)
        if fb:   # Tell the Oracle: for Nico only (this page is local); the texts are what players wrote, already scrubbed of emails/links/numbers
            page = page.replace("</div></main></body></html>", feedback_html(fb) + "</div></main></body></html>", 1)
        open(a.html, "w", encoding="utf-8").write(page)
        print(f"wrote {a.html} ({len(days)} days with stats)")
        return
    if fb is not None:
        print("told to the Oracle: " + (", ".join(f"{k} {n[1]} ({n[0]} new)" for k, n in fb["by_kind"].items()) or "nothing yet") + "   (python3 tools/feedback.py to read them)\n")
    if not days:
        print(f"no stats since {since}")
        return
    print(f"id-le.com anonymous stats, {since} .. today (UTC)\n")
    srv = server_days(days)
    if srv:
        print("Counted by our server (every page request; bots apart; visitors estimated without cookies, about ±2-3%)")
        print(f"  {'day':<11}{'visitors':>9}{'visits':>8}{'views':>7}  game/pedia/privacy views   {'bots':>5}  {'no-track':>8}   in-page reports from")
        for d, r in srv.items():
            vb = r["views_by"]
            share = f"{r['reported']} visits ({100 * r['reported'] / r['visits_game']:.0f}% of game visits)" if r["visits_game"] else f"{r['reported']} visits"
            print(f"  {d:<11}{r['visitors']:>9}{r['visits']:>8}{r['views']:>7}  {vb.get('game', 0):>5}/{vb.get('pedia', 0)}/{vb.get('privacy', 0):<16}{r['bots']:>5}  {r['gpc']:>8}   {share}")
        stot = {}
        for d in srv:
            add(stot, days[d].get("pv") or {})
        for k, title in (("ref", "came from (server, per visit; hidden = another site that didn't say which, e.g. a reader app)"), ("utm", "campaign tags (server)"), ("dev", "devices (server)"), ("cc", "countries (server)"), ("botWhy", "bots, by sign")):
            v = {x: n for x, n in (stot.get(k) or {}).items() if n}
            if v:
                print(f"  {title}: " + ", ".join(f"{x} {n}" for x, n in sorted(v.items(), key=lambda kv: -kv[1])[:15]))
        print()
    traffic, note = zone_traffic(tok, since)
    if traffic:
        print("Cloudflare (real browsers): page loads, game starts, stats reports received / stored")
        for d in sorted(traffic):
            t = traffic[d]
            print(f"  {d}  loads {t['loads']:>5}  starts {t['starts']:>4}  reports {t['reports']:>4} / {days.get(d, {}).get('batches', 0):<4}  (bots {t['bots']})")
        print()
    elif note:
        print(note + "\n")
    print("In-page stats (from the page loads whose script reported: see the share above)")
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
    gs, gss = {k: n for k, n in tot.get("gs", {}).items() if n and n > 0}, tot.get("gss", {})
    if gs:
        print("genesis: steps reached (average seconds since the step before): " + ", ".join(f"{k} {gs[k]} ({round(gss.get(k, 0) / gs[k])} s)" for k in GSTEPS if gs.get(k))
              + f" · guide finished {gs.get('guided', 0)}, skipped {gs.get('skipped', 0)}")
    for k, title in (("ref", "came from"), ("utm", "campaign tags"), ("dw", "time on screen (minutes)"), ("fl", "guided start stopped at"), ("dl", "data lab walkthrough steps reached")):
        v = {x: n for x, n in tot.get(k, {}).items() if n and n > 0}
        if v:
            items = [(x, v.get(x, 0)) for x in DWELL] if k == "dw" else sorted(v.items(), key=lambda kv: -kv[1])
            print(f"\n{title}: " + ", ".join(f"{x} {n}" for x, n in items))
    sfs, lgs = lg_split(sf_split(tot.get("sf")))
    if lgs:
        print("\nthe story's logo A/B (browsers that saw each logo, and how far they got from there):")
        for ln in lg_lines(lgs):
            print(ln)
    window = f"{min(days)} .. {max(days)} (UTC)" if days else "-"
    sdr = sd_rows(tot.get("sd"))
    if sdr:
        print(f"\nstoryline: time per step (on-screen seconds since the moment before; once per browser and moment; {window}):")
        for arm, rows in sorted(sdr.items()):
            print(f"  {arm}")
            for name, n, mean, b in rows:
                print(f"    {name:<24}{n:>5}  mean {mean:>6.0f} s   " + "  ".join(f"{x} {b.get(x, 0)}" for x in SD_B))
    rbr = rb_rows(tot.get("rb"), max(days)) if days else {}
    if rbr:
        print(f"\ncome back (browsers that came back at least once in each window after their first day, % of that cohort's first-day browsers; reports {window}):")
        for arm, (starts, rows, c0, c1) in sorted(rbr.items()):
            print(f"  {arm:<8} first days {c0} .. {c1}: {starts} new browsers · " + " · ".join(f"{lab} {num}/{den}" + (f" ({pct:.0f}%)" if pct is not None else " (too early)") for lab, num, den, pct in rows))
    if sfs:
        print("\nstoryline funnel (browsers reaching each moment, by arm; % of the arm's first moment):")
        for arm, o in sorted(sfs.items()):
            st = o["steps"]; first = next((st[k] for k in SF_STEPS if st.get(k)), 0)
            line = " → ".join(f"{SF_NAMES[k]} {st[k]}" + (f" ({100 * st[k] / first:.0f}%)" if first else "") for k in SF_STEPS if st.get(k))
            print(f"  {arm:<8} {line or '-'}")
            if o["skips"]:
                print(f"           skipped at: " + ", ".join(f"{SF_NAMES.get(k, k)} {n}" for k, n in sorted(o["skips"].items(), key=lambda kv: -kv[1])))
            if o["offer"]:
                print(f"           storyline offer: shown {o['offer'].get('shown', 0)}, accepted {o['offer'].get('accepted', 0)}")
            if o.get("end"):
                en = o["end"]; print(f"           end of what's built: shown {en.get('shown', 0)}, roadmap {en.get('roadmap', 0)}, GitHub {en.get('github', 0)}, the playground {en.get('free', 0)}")
        fd = fd_total(sfs)
        if fd:
            print("\nFounder gift (browsers, once each): " + ", ".join(f"{lab} {fd.get(k, 0)}" for k, lab in FD_STEPS)
                  + " · badges: " + (", ".join(f"{k[6:]} {n}" for k, n in sorted(fd.items(), key=lambda kv: -kv[1]) if k.startswith("badge_")) or "-"))
    gvs = gv_split(tot.get("gv"))
    if gvs:
        print("\nA/B arms (idle-genesis.js, only while the switch is on; time on screen = still there after 1 / 5 min):")
        for v, o in sorted(gvs.items()):
            dw = ", ".join(f"{x} {o['dw'].get(x, 0)}" for x in DWELL if o["dw"].get(x, 0) > 0) or "-"
            ft = ", ".join(f"{k} {n}" for k, n in sorted(o["feat"].items(), key=lambda kv: -kv[1])[:8]) or "-"
            print(f"  {v:<8} {o['visits']:>4} visits · time on screen: {dw} · opened: {ft}")
    if any(days[d].get("secs") for d in days):
        print("\nminutes on screen (game): " + ", ".join(f"{d} {days[d].get('secs', 0) / 60:.0f} min total, {days[d].get('secs', 0) / 60 / max(1, days[d].get('visits', 0)):.1f} per visit" for d in sorted(days) if days[d].get("secs")))
    eg = tot.get("eg", {})
    for k, B in EG.items():
        v = [(b, eg.get(f"{k}:{b}", 0)) for b in B]
        if any(n for _, n in v):
            print(f"  {EG_NAMES[k]}: " + ", ".join(f"{b} {n}" for b, n in v))
    lines, groups = engage2(tot)
    if lines:
        print("\nengagement v2 (counted from 11-01 on):")
        for ln in lines:
            print("  " + ln)
        for title, rows, _ in groups:
            print(f"  {title}: " + ", ".join(f"{k} {n}" for k, n in rows))
    olines, ogroups = operator(tot)
    if olines:
        print("\nthe Operator (counted from 11-01 on; never the text):")
        for ln in olines:
            print("  " + ln)
        for title, rows, _ in ogroups:
            print(f"  {title}: " + ", ".join(f"{k} {n}" for k, n in rows))
    pd = tot.get("pd", {})
    if pd.get("visits"):
        print(f"\npedia: {pd['visits']} visits ({pd.get('back', 0)} returning), clips played {pd.get('clips', 0)}")
        for k, title in (("ref", "came from"), ("dw", "time on screen"), ("sec", "sections seen")):
            v = {x: n for x, n in (pd.get(k) or {}).items() if n}
            if v:
                print(f"  {title}: " + ", ".join(f"{x} {n}" for x, n in sorted(v.items(), key=lambda kv: -kv[1])[:15]))
    print("\ntop errors:" + ("" if errs else " none"))
    for e, n in errs[:10]:
        print(f"  {n:>4}  {e}")


BOTS = {"Unknown", "Curl", "ChromeHeadless", "LinkedInBot", "YandexBot", "AppleBot", "BingBot", "GoogleBot", "Googlebot", "FacebookBot", "TwitterBot",
        "SlackBot", "DiscordBot", "Python", "Go", "Wget", "HeadlessChrome", "PhantomJS", "Applebot", "AhrefsBot", "SemrushBot", "DuckDuckBot", "Baiduspider", "PetalBot"}
EMPTY_T = lambda: {"loads": 0, "bots": 0, "browsers": {}, "starts": 0, "reports": 0, "countries": {}}


def zone_traffic(tok, since):
    """Cloudflare's own counts for id-le.com, per day (real browsers only: requestSource eyeball), to compare with what the game
    counted: page loads of / by browser (bots and scripts set aside), game starts (downloads of the ONNX runtime, which only a
    running game fetches; a browser that has it cached doesn't count, so this is a floor), stats reports received, and countries.
    Needs the token to have Zone Analytics: Read; without it this returns no rows and a note saying how to enable it."""
    try:
        z = call("/zones?name=id-le.com", tok)["result"]
        if not z:
            return None, "zone id-le.com isn't visible to this token"
        g = 'httpRequestsAdaptiveGroups(limit:5000,filter:{date_geq:$d,requestSource:"eyeball"%s}){count dimensions{date %s}}'
        q = {"query": "query($z:String!,$d:Date!){viewer{zones(filter:{zoneTag:$z}){"
                      + "p:" + g % (',clientRequestPath:"/"', "userAgentBrowser")
                      + " o:" + g % (',clientRequestPath:"/vendor/ort/ort.min.js"', "")
                      + " s:" + g % (',clientRequestPath:"/lab/stats",edgeResponseStatus:204', "")
                      + " c:" + g % (',clientRequestPath:"/"', "clientCountryName") + "}}}",
             "variables": {"z": z[0]["id"], "d": since}}
        r = call("/graphql", tok, body=json.dumps(q).encode())
        if r.get("errors"):
            err = json.dumps(r["errors"])
            if "permission" in err or "authz" in err:
                return None, "Traffic needs one more permission on the token: Cloudflare → My Profile → API Tokens → Edit → add Zone · Analytics · Read for id-le.com."
            return None, "traffic query failed: " + r["errors"][0].get("message", "")[:120]
        Z, out = r["data"]["viewer"]["zones"][0], {}
        for x in Z["p"]:
            d = out.setdefault(x["dimensions"]["date"], EMPTY_T())
            b = x["dimensions"]["userAgentBrowser"] or "Unknown"
            if b in BOTS or b.lower().endswith("bot"):
                d["bots"] += x["count"]
            else:
                d["loads"] += x["count"]
                add(d["browsers"], {b: x["count"]})
        for key, f in (("o", "starts"), ("s", "reports")):
            for x in Z[key]:
                out.setdefault(x["dimensions"]["date"], EMPTY_T())[f] += x["count"]
        for x in Z["c"]:
            add(out.setdefault(x["dimensions"]["date"], EMPTY_T())["countries"], {x["dimensions"]["clientCountryName"] or "?": x["count"]})
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
    nz = lambda o: {k: v for k, v in (o or {}).items() if v and v > 0}   # a bucket taken back that was never added (e.g. "hwwiki -1") shows as nothing
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

    _sf, _lg = lg_split(sf_split(tot.get("sf")))
    lg_html = ("<section><h2>The story's logo A/B</h2><p class=\"muted\">Browsers that saw each logo (once per browser), and how far they got from there.</p>" + "".join(
        f'<p class="muted">{e(LG_ARMS[a])}</p>' + bars([(lab, _lg[a].get(k, 0)) for k, lab in LG_STEPS], total=_lg[a].get("shown") or None) for a in ("c3", "crt") if a in _lg) + "</section>") if _lg else ""
    sf_html = ("<section><h2>Storyline funnel</h2><p class=\"muted\">Browsers reaching each moment (once per browser), by arm.</p>" + "".join(
        f'<p class="muted">{e(arm)}</p>' + bars([(SF_NAMES[k], o["steps"].get(k, 0)) for k in SF_STEPS], total=next((o["steps"][k] for k in SF_STEPS if o["steps"].get(k)), None))
        + (f'<p class="muted">skipped at: {e(", ".join(f"{SF_NAMES.get(k, k)} {n}" for k, n in o["skips"].items()))}</p>' if o["skips"] else "")
        + (f'<p class="muted">storyline offer: shown {o["offer"].get("shown", 0)}, accepted {o["offer"].get("accepted", 0)}</p>' if o["offer"] else "")
        + (f'<p class="muted">end of what\'s built: shown {o["end"].get("shown", 0)}, roadmap {o["end"].get("roadmap", 0)}, GitHub {o["end"].get("github", 0)}, the playground {o["end"].get("free", 0)}</p>' if o.get("end") else "")
        for arm, o in sorted(_sf.items())) + "</section>") if _sf else ""
    _sdr = sd_rows(tot.get("sd"))
    if _sdr:
        sf_html += ("<section><h2>Storyline: time per step</h2><p class=\"muted\">On-screen seconds since the moment before (once per browser and moment), by arm; mean and spread.</p>" + "".join(
            f'<p class="muted">{e(arm)}</p><table><thead><tr><th>moment</th><th>browsers</th><th>mean</th>' + "".join(f"<th>{e(x)}</th>" for x in SD_B) + "</tr></thead><tbody>"
            + "".join(f"<tr><td>{e(name)}</td><td>{n}</td><td>{mean:.0f} s</td>" + "".join(f"<td>{b.get(x, 0)}</td>" for x in SD_B) + "</tr>" for name, n, mean, b in rows) + "</tbody></table>"
            for arm, rows in sorted(_sdr.items())) + "</section>")
    _rbr = rb_rows(tot.get("rb"), max(days)) if days else {}
    if _rbr:
        sf_html += ("<section><h2>Coming back</h2><p class=\"muted\">Browsers that came back at least once in each window after their first day, as a share of their cohort's first-day browsers. A window only counts cohorts old enough to have reached it.</p>" + "".join(
            f'<p class="muted">{e(arm)}: {starts} new browsers, first days {c0} .. {c1}</p>' + bars([(lab, num) for lab, num, den, pct in rows], total=starts or None)
            + f'<p class="muted">{e(" · ".join(f"{lab}: {num}/{den}" + (f" ({pct:.0f}%)" if pct is not None else " (too early)") for lab, num, den, pct in rows))}</p>'
            for arm, (starts, rows, c0, c1) in sorted(_rbr.items())) + "</section>")
    _fd = fd_total(_sf)
    if _fd:
        sf_html += ("<section><h2>Founder gift</h2><p class=\"muted\">Browsers reaching each moment (once per browser).</p>" + bars([(lab, _fd.get(k, 0)) for k, lab in FD_STEPS], total=max(_fd.get("world", 0) + _fd.get("link", 0), 1))
                    + f'<p class="muted">badges chosen: {e(", ".join(f"{k[6:]} {n}" for k, n in _fd.items() if k.startswith("badge_")) or "-")}</p></section>')
    _gv = gv_split(tot.get("gv"))
    gv_html = ("<section><h2>A/B arms: time on screen by arm</h2>" + "".join(
        f'<p class="muted">{e(v)}: {o["visits"]} visits</p>' + bars([(x, o["dw"].get(x, 0)) for x in DWELL], total=sum(o["dw"].values()) or None)
        for v, o in sorted(_gv.items())) + "</section>") if _gv else ""
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
    gs, gss = nz(tot.get("gs")), tot.get("gss", {})
    gen_rows = [(f"{k} · {round(gss.get(k, 0) / gs[k])} s avg" if gs.get(k) else k, gs.get(k, 0)) for k in GSTEPS]
    feats = sorted(((k, n) for k, n in nz(tot.get("feat")).items() if k not in TEST_FEATS), key=lambda kv: -kv[1])[:20]
    dev, safe, fps = nz(tot.get("dev")), nz(tot.get("safe")), nz(tot.get("fps"))
    if traffic:
        trows = "".join(f'<tr><td>{d}</td><td>{traffic[d]["loads"]}</td><td>{traffic[d]["starts"]}</td><td>{days.get(d, {}).get("visits", 0)}</td>'
                        f'<td>{traffic[d]["reports"]}</td><td>{days.get(d, {}).get("batches", 0)}</td><td>{traffic[d]["bots"]}</td></tr>' for d in sorted(traffic))
        tb, tcn = {}, {}
        for d in traffic.values():
            add(tb, d["browsers"])
            add(tcn, d["countries"])
        tr = (f'<div class="tw"><table><thead><tr><th>day</th><th>page loads (browsers)</th><th>game starts</th><th>visits the game counted</th>'
              f'<th>stats reports received</th><th>reports stored</th><th>bots and scripts</th></tr></thead><tbody>{trows}</tbody></table></div>'
              '<p class="muted">Page loads count every load of the home page by a real browser (reloads too); game starts count downloads of the game engine, '
              'so a browser that already has it cached is not counted. When reports received is far above reports stored, stats were lost on the way.</p>'
              f'<h2 style="margin-top:12px">Browsers</h2>{bars(sorted(tb.items(), key=lambda kv: -kv[1])[:10], total=sum(tb.values()) or None)}'
              f'<h2 style="margin-top:12px">Countries (page loads)</h2>{bars(sorted(tcn.items(), key=lambda kv: -kv[1])[:12], total=sum(tcn.values()) or None)}')
    else:
        tr = f'<p class="muted">{e(note)}</p>'
    errs = sorted(nz(tot.get("err")).items(), key=lambda kv: -kv[1])[:12]
    err_html = "".join(f"<li><b>{n}</b> <code>{e(k)}</code></li>" for k, n in errs) or '<li class="muted">none</li>'
    made = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    tested = [d for d in order if is_test(d)]
    tile = lambda n, label: f'<div class="tile"><b>{n}</b><span>{e(label)}</span></div>'
    later = "no data yet (counted from this version on)"
    eg = nz(tot.get("eg"))
    secs = [(d, days[d].get("secs", 0), days[d].get("visits", 0)) for d in order]
    mins_rows = "".join(f'<tr><td>{d}{"*" if is_test(d) else ""}</td><td>{sx / 60:.0f}</td><td>{v}</td><td>{sx / 60 / v:.1f}</td></tr>' for d, sx, v in secs if sx and v)
    eng = (f'<table><thead><tr><th>day</th><th>minutes on screen, total</th><th>visits</th><th>average per visit</th></tr></thead><tbody>{mins_rows}</tbody></table>' if mins_rows else f'<p class="muted">{e(later)}</p>')
    eng += "".join(f'<h2 style="margin-top:12px">{e(EG_NAMES[k][0].upper() + EG_NAMES[k][1:])}</h2>' + bars([(b, eg.get(f"{k}:{b}", 0)) for b in B], total=sum(eg.get(f"{k}:{b}", 0) for b in B) or None, empty=later) for k, B in EG.items())
    lines2, groups2 = engage2(tot)
    scale = ""
    if traffic:
        tl = sum(t["loads"] for t in traffic.values()); ts = sum(t["starts"] for t in traffic.values())
        scale = f'<p class="muted">For scale (Cloudflare, same days): {tl} page loads by real browsers, {ts} game starts; the game counted {tot.get("visits", 0)} visits.</p>'
    eng2 = (scale + "<ul>" + "".join(f"<li>{e(t)}</li>" for t in lines2) + "</ul>" + '<div class="grid g2">' +
            "".join(f'<section><h2>{e(title)}</h2>{bars(rows)}</section>' for title, rows, _ in groups2) + "</div>") if lines2 else f'<p class="muted">{e(later)}</p>' + scale
    olines, ogroups = operator(tot)
    opsec = ("<ul>" + "".join(f"<li>{e(t)}</li>" for t in olines) + "</ul>" + '<div class="grid g2">' +
             "".join(f'<section><h2>{e(title)}</h2>{bars(rows)}</section>' for title, rows, _ in ogroups) + "</div>") if olines else f'<p class="muted">{e(later)}</p>'
    pd = tot.get("pd") or {}
    pdref, pdw, pdsec = nz(pd.get("ref")), nz(pd.get("dw")), nz(pd.get("sec"))
    pedia = (f'<div class="tiles">{tile(pd.get("visits", 0), "pedia visits")}{tile(pd.get("back", 0), "returning")}{tile(nz(pd.get("dev")).get("phone", 0), "on phones")}{tile(pd.get("clips", 0), "clips played")}</div>'
             f'<h2 style="margin-top:12px">Came from</h2>{bars(sorted(pdref.items(), key=lambda kv: -kv[1])[:10], total=sum(pdref.values()) or None, empty=later)}'
             f'<h2 style="margin-top:12px">Time on screen (minutes)</h2>{bars([(k, pdw.get(k, 0)) for k in DWELL], total=sum(pdw.values()) or None, empty=later)}'
             f'<h2 style="margin-top:12px">Sections seen</h2>{bars(sorted(pdsec.items(), key=lambda kv: -kv[1])[:20], empty=later)}') if pd.get("visits") else f'<p class="muted">{e(later)}</p>'
    srv = server_days(days)
    stot = {}
    for d in srv:
        add(stot, days[d].get("pv") or {})
    if srv:
        sv_visitors = sum(r["visitors"] for r in srv.values()); sv_visits = sum(r["visits"] for r in srv.values()); sv_views = sum(r["views"] for r in srv.values())
        sv_bots = sum(r["bots"] for r in srv.values()); sv_game = sum(r["visits_game"] for r in srv.values()); sv_rep = sum(r["reported"] for r in srv.values())
        srows = ""
        for d, r in srv.items():
            vb = r["views_by"]; pct = f" ({100 * r['reported'] / r['visits_game']:.0f}%)" if r["visits_game"] else ""
            srows += (f'<tr><td>{d}</td><td>{r["visitors"]}</td><td>{r["visits"]}</td><td>{r["views"]}</td><td>{vb.get("game", 0)}</td><td>{vb.get("pedia", 0)}</td>'
                      f'<td>{vb.get("privacy", 0)}</td><td>{r["bots"]}</td><td>{r["gpc"]}</td><td>{r["reported"]}{pct}</td></tr>')
        sb = lambda k, n=12: bars(sorted(nz(stot.get(k)).items(), key=lambda kv: -kv[1])[:n], total=sum(nz(stot.get(k)).values()) or None)
        server = (f'<div class="tiles">{tile(sv_visitors, "visitors (estimated)")}{tile(sv_visits, "visits")}{tile(sv_views, "page views")}{tile(sv_bots, "bot requests (apart)")}</div>'
                  f'<p class="muted">Counted by our server on every page request, whether or not the page\'s script runs. Visitors are estimated without cookies or IDs (a daily HyperLogLog sketch, about ±2–3%); a visitor on two days counts on each day. A visit is a page view not preceded by one from the same visitor in the last 30 minutes. The in-page stats below come from {sv_rep} visits that reported ({100 * sv_rep / sv_game:.0f}% of the server\'s game visits).</p>' if sv_game else "")
        server += (f'<div style="overflow-x:auto"><table><thead><tr><th>day</th><th>visitors</th><th>visits</th><th>page views</th><th>game</th><th>pedia</th><th>privacy</th><th>bots</th><th>asked not to be tracked</th><th>reported in-page</th></tr></thead><tbody>{srows}</tbody></table></div>'
                   f'<div class="grid g2"><section><h2>Came from (per visit)</h2>{sb("ref", 15)}</section><section><h2>Campaign tags</h2>{sb("utm", 12)}</section>'
                   f'<section><h2>Devices</h2>{sb("dev")}</section><section><h2>Countries</h2>{sb("cc", 15)}</section><section><h2>Bots, by sign</h2>{sb("botWhy")}</section></div>')
    else:
        server = f'<p class="muted">{e("no server counts yet (counted from this version on)")}</p>'
    dark = "color-scheme:dark;--surface:#1a1a19;--card:#222220;--ink:#ffffff;--ink2:#c3c2b7;--muted:#8f8e86;--line:#3a3a37;--s1:#3987e5;--s2:#d95926;--track:#2c2c2a"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Id|le stats</title><style>
:root{{color-scheme:light;--surface:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--muted:#7a7974;--line:#e4e3de;--s1:#2a78d6;--s2:#eb6834;--track:#f0efea}}
@media (prefers-color-scheme:dark){{:root:where(:not([data-theme="light"])){{{dark}}}}}
:root[data-theme="dark"]{{{dark}}}
body{{margin:0;background:var(--surface);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif}}
main{{max-width:1080px;margin:0 auto;padding:20px 16px 40px}}h1{{font-size:22px;margin:0 0 2px}}h2{{font-size:14px;margin:0 0 10px;color:var(--ink2);font-weight:600}}
.sub,.muted{{color:var(--muted)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:14px}}
.tw{{overflow-x:auto}}.g2{{grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))}}section{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}}section.wide{{grid-column:1/-1}}
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
<section class="wide" style="margin-bottom:14px"><h2>Visitors and page views (counted by our server)</h2>{server}</section>
<h2>In-page stats (from the visits whose page reported)</h2>
<div class="tiles">{tile(tot.get("visits", 0), "visits that reported")}{tile(new_visits, "new browsers")}{tile(tot.get("back", 0), "returning")}{tile(dev.get("phone", 0), "on phones")}{tile(f5.get("finished", 0), "finished the guided start")}{tile(ref.get("reddit.com", 0) + ref.get("news.ycombinator.com", 0), "from Reddit + HN")}</div>
<div class="grid">
<section class="wide"><h2>Visits per day</h2><div class="legend"><span><i class="sw" style="background:var(--s1)"></i>new</span><span><i class="sw" style="background:var(--s2)"></i>returning</span></div>{visits_svg}
<details><summary>table</summary><table><thead><tr><th>day</th><th>visits</th><th>new</th><th>returning</th><th>phone</th><th>iOS</th></tr></thead><tbody>{vrows}</tbody></table></details></section>
<section><h2>Guided start: who reached each moment (of {new_visits} new browsers)</h2>{bars(funnel, total=new_visits or None)}<p class="muted">finished {f5.get("finished", 0)} · skipped {f5.get("skipped", 0)}</p></section>
{sf_html}{lg_html}{gv_html}<section><h2>Guided start: where page loads stopped</h2>{bars([(k, fl.get(k, 0)) for k in ["none"] + STEPS + ["finished", "skipped"]], total=sum(fl.values()) or None, empty=later)}</section>
<section><h2>Came from</h2>{bars(sorted(ref.items(), key=lambda kv: -kv[1])[:15], total=sum(ref.values()) or None, empty=later)}{("<h2 style='margin-top:12px'>Campaign tags</h2>" + bars(sorted(utm.items(), key=lambda kv: -kv[1])[:10])) if utm else ""}</section>
<section><h2>Genesis: browsers that reached each step (average seconds since the step before)</h2>{bars(gen_rows, total=(gs.get("light") or max(gs.values(), default=0)) or None, empty=later)}<p class="muted">guide finished {gs.get("guided", 0)} · skipped {gs.get("skipped", 0)}</p></section>
<section><h2>Data lab walkthrough: browsers that reached each step</h2>{bars([(k, dl.get(k, 0)) for k in DLSTEPS], total=dl.get("what") or None, empty=later)}</section>
<section><h2>Time on screen per page load (minutes)</h2>{bars([(k, dw.get(k, 0)) for k in DWELL], total=sum(dw.values()) or None, empty=later)}</section>
<section><h2>Opened (visits that opened it)</h2>{bars(feats)}</section>
<section><h2>Devices</h2>{bars([("desktop", dev.get("desktop", 0)), ("phone", dev.get("phone", 0)), ("iOS", tot.get("ios", 0))])}
<h2 style="margin-top:12px">Crash guard level at load</h2>{bars([("0 · normal", safe.get("0", 0)), ("1 · lighter", safe.get("1", 0)), ("2 · no Oracle", safe.get("2", 0))])}</section>
<section><h2>Frame rate (fps)</h2>{bars([(k, fps.get(k, 0)) for k in ["<20", "20-40", "40-55", "55+"]])}</section>
<section class="wide"><h2>Engagement (game)</h2>{eng}</section>
<section class="wide"><h2>What people do (engagement v2)</h2>{eng2}</section>
<section class="wide"><h2>The Operator: how conversations go (never the text)</h2>{opsec}</section>
<section class="wide"><h2>The Id|le-pedia</h2>{pedia}</section>
<section><h2>Errors</h2><ul>{err_html}</ul></section>
<!-- errors: "@file:line:col bXXXXXXXX" = where it happened and the game version (build); older ones say "?" for the site root -->
<section class="wide"><h2>Traffic (Cloudflare)</h2>{tr}</section>
</div></main></body></html>"""


if __name__ == "__main__":
    main()
