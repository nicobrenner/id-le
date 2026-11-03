"""Id|le regression checks: a static build in real browsers, plus the helper Worker and every script's syntax.

    python3 tools/test_smoke.py            # the fast set (a few minutes): what CI runs on every push
    python3 tools/test_smoke.py --full     # also a frame-rate floor with 300 creatures and a longer data lab run
    python3 tools/test_smoke.py -k camera  # only the checks whose name contains "camera"
    python3 tools/test_smoke.py --dist dist --keep   # reuse an existing build; keep the temporary build

Needs: python3, node, and Playwright for Python (pip install playwright; playwright install chromium webkit).
Nothing leaves this computer: the build is served on localhost, every other request is answered with an empty
stub (fonts, CDNs, Jeffy's server, id-le.com), and /lab/* and /worlds/* are stubbed, so production storage is never touched.

Why: each feature so far was tested by a one-off script, and a regression slipped through (applyCam's travel clamp and
wrap-around sat inside a // comment for a day). Add a check here for whatever you build.
"""
import base64, argparse, contextlib, functools, http.server, json, os, re, shutil, socket, socketserver, subprocess, sys, tempfile, threading, time, traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.join(ROOT, "demo")
LOCK = os.environ.get("IDLE_BROWSER_LOCK", "/private/tmp/claude-501/idle-browser.lock")   # one headless browser at a time on a shared Mac
RESULTS = []


def check(name, fn, *a):
    t0 = time.time()
    try:
        note = fn(*a) or ""
        RESULTS.append((name, True, note, time.time() - t0)); print(f"  ok    {name}  {note}  ({time.time() - t0:.1f}s)", flush=True)
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        RESULTS.append((name, False, msg, time.time() - t0)); print(f"  FAIL  {name}  {msg}", flush=True)
        if os.environ.get("IDLE_TEST_TRACE"): traceback.print_exc()


def need(cond, msg):
    if not cond: raise AssertionError(msg)


# ---------------------------------------------------------------- static checks (no browser)
def no_conflict_markers():
    """A merge once left <<<<<<< / ======= / >>>>>>> blocks in arena.html: browsers ignore them and load every module twice."""
    import re, subprocess
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    bad = []
    for f in files:
        if not re.search(r"\.(html|js|mjs|py|json|md|css|toml)$", f): continue
        try: lines = open(os.path.join(ROOT, f), encoding="utf-8").read().split("\n")
        except Exception: continue
        for i, l in enumerate(lines, 1):
            if re.match(r"^(<{7}|>{7})( |$)", l) or (l == "=======" and not f.endswith(".md")): bad.append(f"{f}:{i}")
    need(not bad, "conflict markers: " + ", ".join(bad[:10]))
    return f"{len(files)} files clean"


def fontgen_round():
    """tools/fontgen: every round-1 genome builds a font that maps every character the Operator and the Spanish lines use."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return "skipped: fontTools not installed"
    sys.path.insert(0, os.path.join(ROOT, "tools", "fontgen"))
    import fontgen, json as _json
    cands = _json.load(open(os.path.join(ROOT, "tools", "fontgen", "rounds", "round1.json")))
    tmp = tempfile.mkdtemp(prefix="idle-font-")
    text = "…hey. hey! relax, it only eats worlds Oh wow, are you ok? Say: lights on ¿Cachai? Ñandú, acción, pingüino ¡Ya po! Id|le 0123456789"
    try:
        for n, g in cands.items():
            ttf, _ = fontgen.build_font({**fontgen.default_genome(), **{k: v for k, v in g.items() if k in fontgen.GENES}}, n, tmp)
            f = TTFont(ttf); cmap = f.getBestCmap(); glyf = f["glyf"]
            missing = sorted({c for c in text if ord(c) not in cmap})
            need(not missing, f"{n} has no glyph for {missing}")
            empty = [c for c in set(text) if c != " " and glyf[cmap[ord(c)]].numberOfContours == 0]
            need(not empty, f"{n} draws nothing for {empty}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    try:
        import check_glyphs   # needs Pillow: l stays one piece, D keeps a straight back, N its stems (Nico's round-1 screenshots)
    except ImportError:
        return f"{len(cands)} fonts, every character drawn (confusables skipped: no Pillow)"
    bad = []
    for f in sorted(os.listdir(os.path.join(ROOT, "demo", "fonts"))):
        if f.endswith(".woff2"):
            probs, _ = check_glyphs.check(os.path.join(ROOT, "demo", "fonts", f))
            bad += [f"{f}: {x}" for x in probs]
    need(not bad, "confusable glyphs in the shipped fonts: " + "; ".join(bad[:4]))
    return f"{len(cands)} fonts, every character drawn; shipped fonts keep l/!, D/O, N apart"


def js_syntax():
    files = [os.path.join(DEMO, f) for f in sorted(os.listdir(DEMO)) if f.endswith(".js")] + [os.path.join(ROOT, "helper", "worker.js")]
    tmp = tempfile.mkdtemp(prefix="idle-js-"); bad = []
    try:
        for page in ("arena.html", "pedia.html", "privacy.html"):   # inline scripts too: most of the game lives in arena.html
            html = open(os.path.join(DEMO, page), encoding="utf-8").read()
            for i, m in enumerate(re.finditer(r"<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)</script>", html)):
                if "json" in m.group(1): continue
                ext = ".mjs" if "module" in m.group(1) else ".js"
                p = os.path.join(tmp, f"{page}.{i}{ext}"); open(p, "w", encoding="utf-8").write(m.group(2)); files.append(p)
        for f in files:
            if f.endswith("worker.js"):   # an ES module (export default)
                p = os.path.join(tmp, "worker.mjs"); shutil.copy(f, p); f = p
            r = subprocess.run(["node", "--check", f], capture_output=True, text=True)
            if r.returncode: bad.append(os.path.basename(f) + ": " + (r.stderr.strip().splitlines() or ["?"])[-1][:160])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    need(not bad, "; ".join(bad))
    return f"{len(files)} scripts"


WORKER_TEST = r"""
globalThis.setTimeout = (f) => { Promise.resolve().then(f); return 0; }; globalThis.__statFlushNow = true;   // production writes a stats batch STAT_EVERY after its first report (inside that request's waitUntil); tests run timers at once
const kv = () => { const m = new Map(), puts = []; return { m, puts, get: async k => m.get(k) ?? null, put: async (k, v) => { puts.push(k); m.set(k, v); } }; };
const W = (await import(process.argv[2])).default;
const env = { STATS: kv(), WORLDS: kv(), ALLOWED_ORIGINS: '*', RATE_PER_MIN: '1000' };
const go = async (path, init = {}, ip = '1.2.3.4') => { const ctx = { p: [], waitUntil(p) { this.p.push(p); } }; const r = await W.fetch(new Request('http://t' + path, { ...init, headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json', ...(init.headers || {}) } }), env, ctx); await Promise.all(ctx.p); return r; };
const post = (path, body, ip) => go(path, { method: 'POST', body: JSON.stringify(body) }, ip);
const out = {};
// stats: allowlisted keys only, junk dropped, a page load counted once in its last time bucket
await post('/lab/stats', { v: 1, visit: 1, dev: 'phone', ref: 'reddit.com', utm: 'r-webgames', fps: '55+', feat: ['datalab'], dw: '<1', fl: 'card', evil: 'x' });
await post('/lab/stats', { v: 1, dw: '1-5', dw0: '<1', fl: 'finished', fl0: 'card' });
await post('/lab/stats', { v: 1, visit: 1, ref: 'https://evil.example/path?q=1', dev: 'toaster', dw: '20+' });
// engagement: buckets move once per page load (eg0 takes back), seconds add up, junk buckets and absurd seconds are dropped
await post('/lab/stats', { v: 1, eg: { cr: '0-12', born: '0', charts: '1-5', fed: '0' }, sec: 120 });
await post('/lab/stats', { v: 1, eg: { cr: '13-30', charts: '6-20' }, eg0: { cr: '0-12', charts: '1-5' }, sec: 300 });
await post('/lab/stats', { v: 1, eg: { cr: 'lots', fed: '9999' }, sec: 99999999 });
// the pedia counts on its own: its visit is not a game visit; sections are the pedia's ids only
await post('/lab/stats', { v: 1, page: 'pedia', visit: 1, back: 0, dev: 'desktop', ref: 'news.ycombinator.com', dw: '1-5', ps: ['the-oracle', 'halloween', 'BAD id!'], clips: 2 });
await post('/lab/stats', { v: 1, page: 'pedia', dw: '5-20', dw0: '1-5', ps: ['halloween'], clips: 1, err: ['x is null @pedia-draw.js:3:9'] });
// engagement v2: fixed key lists, small positive integers, favorites by pattern, flags once, a path counted once in its last value
await post('/lab/stats', { v: 1, x: { did: ['w_reel', 'w_dream', 'rage', 'p_music', 'w_reel', 'hacked'], ws: { reel: 40, dream: 12, mind: 7, evil: 5 }, pt: { music: 30, studio: 10, nope: 9 },
  ct: { reelplay: 2, reelend: 1, irc: 3, inbox: 1, op: 2, pedia: 1, bad: 4 }, opa: { weather: 1, ai_spawn: 1, rm_rf: 1 }, fav: { 'job:math': 3, 'fam:crawly': 1, 'name:Plotkin': 2, 'name:<script>': 1, 'secret:x': 1 },
  rage: { studioBtn: 1, world: 2, 'whisper:keep': 1, 'world:creature': 1, 'whisper:evil': 1, 'body > div': 1 } }, path: 'card>studio', eg: { reels: '1-5', errs: '0' } });
await post('/lab/stats', { v: 1, x: { ws: { reel: -5, dream: 1.5, mind: 99999999 }, did: ['quick_exit'] }, path: 'card>studio>reels', path0: 'card>studio', eg: { errs: '1' }, eg0: { errs: '0' } });
await post('/lab/stats', { v: 1, path: 'card>card', x: { ct: { op: 9999 } } });
await post('/lab/stats', { v: 1, path: 'card>studio>reels>music' });
// the Operator (11-01): only fixed keys, small positive integers; text-like keys and junk dropped; op flags once
await post('/lab/stats', { v: 1, x: { op: { 'out:acted': 3, 'out:unsure': 1, 'opt:light': 2, 'cf:hi': 3, 'fr:rephrase': 1, 'mood:negative': 1, 'mm:negative': 1, 'gd:light': 1, 'gt:light': 2, 'gn:light': 1, 'text:make it rain': 1, 'opt:rm -rf': 1, 'out:acted ': 1, 'fr:caps': -2, 'cf:lo': 1.5 }, did: ['op_miss', 'op_rephrase', 'op_secret'] } });
// many distinct favorites from many page loads: capped, the rest counted as 'other'
for (let i = 0; i < 70; i++) await post('/lab/stats', { v: 1, x: { fav: { ['name:Zz' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))]: 1 } } });
out.bad_format = (await post('/lab/stats', { v: 2 })).status;
out.too_big = (await go('/lab/stats', { method: 'POST', body: 'x'.repeat(9000) })).status;
const days = [...env.STATS.m.values()].map(v => JSON.parse(v));
out.stats = days.reduce((a, d) => { for (const k of ['visits', 'dev', 'ref', 'utm', 'dw', 'fl', 'feat']) a[k] = typeof d[k] === 'number' ? (a[k] || 0) + d[k] : { ...(a[k] || {}), ...d[k] }; return a; }, {});
out.stat_keys = [...new Set(days.flatMap(d => Object.keys(d)))].sort();
out.eg = days.reduce((a, d) => { for (const [k, n] of Object.entries(d.eg || {})) a[k] = (a[k] || 0) + n; return a; }, {}); out.secs = days.reduce((a, d) => a + (d.secs || 0), 0);
out.pd = days.map(d => d.pd).filter(Boolean).reduce((a, q) => ({ visits: a.visits + q.visits, clips: a.clips + q.clips, dw: { ...a.dw, ...q.dw }, sec: { ...a.sec, ...q.sec }, ref: { ...a.ref, ...q.ref } }), { visits: 0, clips: 0, dw: {}, sec: {}, ref: {} }); out.err_all = days.reduce((a, d) => ({ ...a, ...(d.err || {}) }), {});
// a lone report, with no later request to that isolate, must still be written (the 2-min buffer of 11-01 lost these: 180 received, 50 stored)
{ globalThis.__statFlushNow = false; const before = env.STATS.puts.length; await post('/lab/stats', { v: 1, feat: ['lonetest'] }); out.lone_report_written = env.STATS.puts.length > before; globalThis.__statFlushNow = true; }
// /lab/p: the same reports under a plain name; a visit from a v2 page counts in v2visits (engagement v2's own denominator)
{ out.labp = (await post('/lab/p', { v: 1, visit: 1, v2: 1, dev: 'desktop' })).status; out.v2visits = [...env.STATS.m.values()].map(v => JSON.parse(v)).reduce((a, d) => a + (d.v2visits || 0), 0); }
// the storyline funnel (11-02): known moments only, counted by arm; the arm's visits and dwell under gv
{ await post('/lab/p', { v: 1, visit: 1, gv: 'story', sf: ['title', 'messages', 'skip:chat', 'evil<script>', 'title'], dw: '1-5' }); await post('/lab/p', { v: 1, sf: ['offer_shown', 'offer_accepted', 'fd_link', 'fd_badge_pipe', 'fd_badge_evil'] });
  const ds = [...env.STATS.m.values()].map(v => JSON.parse(v)); out.sf = ds.reduce((a, d) => { for (const [k, n] of Object.entries(d.sf || {})) a[k] = (a[k] || 0) + n; return a; }, {});
  out.gv_story = ds.reduce((a, d) => { for (const [k, n] of Object.entries(d.gv || {})) a[k] = (a[k] || 0) + n; return a; }, {}); }
// jeffy proxy: an allowlist of two paths; nothing else is relayed (no network needed for these answers)
out.jeffy_train = (await post('/jeffy/train', { text: 'x', task: 'sms_spam' })).status;
out.jeffy_get_predict = (await go('/jeffy/predict')).status;
out.jeffy_no_text = (await post('/jeffy/predict', { task: 'sms_spam' })).status;
// world links: a poll writes to KV only for a new world (the free plan allows 1,000 writes a day, shared by the account)
const p0 = env.WORLDS.puts.length;
for (let i = 0; i < 5; i++) await go('/worlds/state?code=testworld');
out.world_poll_writes = env.WORLDS.puts.length - p0;
out.world_state = await (await go('/worlds/state?code=testworld')).json();
// rate limit: the 61st request in a minute from one address is refused
env.RATE_PER_MIN = '60'; let last = 0; for (let i = 0; i < 61; i++) last = (await go('/lab/nothing', {}, '9.9.9.9')).status;
out.rate_61st = last;
// credits for Wikimedia pictures: parallel to images, null for others, one API call per wiki per page read, then cached
{ const real = globalThis.fetch; let api = 0; const html = '<html><title>Owl - Wikipedia</title><body><p>' + 'Owls are birds. '.repeat(40) + '</p>'
    + '<img src="//upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Barn_owl.jpg/250px-Barn_owl.jpg"><img src="https://example.org/pic.png"><img src="//upload.wikimedia.org/wikipedia/en/b/b2/Local_owl.png"></body></html>';
  globalThis.fetch = async (u, init) => { const s = String(u.url || u);
    if (s.startsWith('https://en.wikipedia.org/wiki/')) return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    if (s.includes('/w/api.php')) { api++; out.credit_ua = (init && init.headers && init.headers['User-Agent']) || ''; const commons = s.startsWith('https://commons.wikimedia.org/');
      const pages = commons ? { 1: { title: 'File:Barn owl.jpg', imageinfo: [{ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Barn_owl.jpg', extmetadata: { Artist: { value: '<a href="x">Jo Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] } }
        : { 2: { title: 'File:Local owl.png', imageinfo: [{ descriptionurl: 'https://en.wikipedia.org/wiki/File:Local_owl.png', extmetadata: { Artist: { value: 'Ann' }, LicenseShortName: { value: 'Fair use' } } }] } };
      return new Response(JSON.stringify({ query: { pages } }), { headers: { 'Content-Type': 'application/json' } }); }
    return new Response('', { status: 404 }); };
  try { const a = await (await go('/lab/fetch?url=' + encodeURIComponent('https://en.wikipedia.org/wiki/Owl'))).json(); const api1 = api;
    const b = await (await go('/lab/fetch?url=' + encodeURIComponent('https://en.wikipedia.org/wiki/Owl'))).json();
    out.credits = { images: a.images, credits: a.credits, api_first: api1, api_second: api - api1, again: JSON.stringify(b.credits) === JSON.stringify(a.credits) }; }
  finally { globalThis.fetch = real; } }
{ const xs = [...env.STATS.m.values()].map(v => JSON.parse(v).x).filter(Boolean); const sum = k => xs.reduce((a, x) => { for (const [n, v] of Object.entries(x[k] || {})) a[n] = (a[n] || 0) + v; return a; }, {});
  out.x = Object.fromEntries(['did', 'ws', 'pt', 'ct', 'opa', 'fav', 'rage', 'path', 'op'].map(k => [k, sum(k)])); }
// Tell the Oracle (11-01): a private queue, emails/links/numbers blanked, 5 a day per visitor; roadmap votes once per item per day per visitor
{ const r1 = await (await post('/lab/oracle', { kind: 'idea', text: 'mail me at jo@ex.com or +1 (555) 123-4567, see https://x.io/a and evil.com', ctx: { page: '/', place: 'home', build: 'ab12cd', device: 'phone', err: 'x is null', secret: 'world words' } }, '5.5.5.5')).json();
  const fbk = [...env.STATS.m.keys()].filter(k => k.startsWith('fb:')); const rec = JSON.parse(env.STATS.m.get(fbk[0]));
  out.fb = { ok: r1.ok, n: fbk.length, text: rec.text, ctx: rec.ctx, status: rec.status };
  out.fb_badkind = (await post('/lab/oracle', { kind: 'spam', text: 'hello' }, '5.5.5.5')).status;
  let last = 0; for (let i = 0; i < 5; i++) last = (await post('/lab/oracle', { kind: 'bug', text: 'again ' + i }, '5.5.5.5')).status; out.fb_6th = last;
  out.fb_other_ip = (await post('/lab/oracle', { kind: 'loved', text: 'lovely' }, '6.6.6.6')).status;
  out.fb_get = (await go('/lab/oracle')).status;
  env.STATS.m.set('roadmap:public', JSON.stringify({ items: [{ id: 'mods', title: 'Mods' }, { id: 'bodies', title: 'New bodies' }] }));
  const v1 = await (await post('/lab/vote', { id: 'mods' }, '7.7.7.7')).json(), v2 = await (await post('/lab/vote', { id: 'mods' }, '7.7.7.7')).json();
  const v3 = await (await post('/lab/vote', { id: 'mods' }, '8.8.8.8')).json(); out.vote_unknown = (await post('/lab/vote', { id: 'nope' }, '7.7.7.7')).status;
  const road = await (await go('/lab/roadmap')).json(); out.votes = { v1: v1.votes, v2: v2.already === true, v3: v3.votes, road_items: road.items.length, road_votes: road.votes.mods };
  out.fb_ip_stored = [...env.STATS.m.entries()].some(([k, v]) => (k + v).includes('5.5.5.5') || (k + v).includes('7.7.7.7')); }
// personal gift links (11-02): the letter by id, never the label; one write to claim; then 'already'; revoked and unknown ids: 404
{ const id = 'abcdefghijklmnopqrstuvwx'; env.STATS.m.set('gift:' + id, JSON.stringify({ letter: 'Hi Sam!', created: 1, label: 'Sam (private)', exp: Date.now() + 86400e3 }));
  env.STATS.m.set('gift:revokedrevokedrevokedr', JSON.stringify({ letter: 'x', revoked: 1 }));
  const g1 = await (await go('/lab/gift/' + id)).json(), w0 = env.STATS.puts.length;
  const c1 = await (await post('/lab/gift/' + id + '/claim', {})).json(), w1 = env.STATS.puts.length, c2 = await (await post('/lab/gift/' + id + '/claim', {})).json();
  const g2 = await (await go('/lab/gift/' + id)).json();
  out.gift = { letter: g1.letter, label: JSON.stringify(g1).includes('private'), claimed0: g1.claimed, c1: c1.ok, writes: w1 - w0, c2: c2.already, claimed1: g2.claimed,
    unknown: (await go('/lab/gift/zzzzzzzzzzzzzzzzzzzzzzzz')).status, revoked: (await go('/lab/gift/revokedrevokedrevokedr')).status, bad: (await go('/lab/gift/AB')).status }; }
console.log(JSON.stringify(out));
"""


def pages_unit():
    """Server-side page views (helper/worker.js pageview through the generated Pages worker): people vs bots, visits vs reloads,
    referrer and utm, pages, the HyperLogLog estimate on synthetic uniques, and nothing that identifies a person stored."""
    tmp = tempfile.mkdtemp(prefix="idle-pages-")
    try:
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_static.py"), "--helper", "https://id-le.com", "--pages-helper", "--out", os.path.join(tmp, "dist")], capture_output=True, text=True, timeout=180)
        need(r.returncode == 0, "build failed: " + (r.stderr or r.stdout)[-300:])
        routes = json.load(open(os.path.join(tmp, "dist", "_routes.json")))["include"]
        need(all(p in routes for p in ("/", "/pedia", "/privacy")), f"_routes.json misses a page: {routes}")
        shutil.copy(os.path.join(tmp, "dist", "_worker.js"), os.path.join(tmp, "w.mjs")); shutil.copy(os.path.join(ROOT, "helper", "worker.js"), os.path.join(tmp, "h.mjs"))
        r = subprocess.run(["node", os.path.join(ROOT, "tools", "pages_test.mjs"), "file://" + os.path.join(tmp, "w.mjs"), "file://" + os.path.join(tmp, "h.mjs")], capture_output=True, text=True, timeout=120)
        need(r.returncode == 0, (r.stderr or r.stdout)[-400:])
        o = json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    s = o["small"]
    need(s["views"] == {"game": 3, "pedia": 1, "privacy": 1}, f"page views {s['views']} (a redirect, HEAD, prefetch, non-HTML or a script must not count)")
    need(s["gpc"] == {"game": 1}, f"Global Privacy Control: {s['gpc']} (a page view only, no visit)")
    need(s["visits"] == {"game": 1, "pedia": 1, "privacy": 1}, f"visits {s['visits']} (the isolation reload is not a new visit)")
    need(s["ref"] == {"reddit.com": 1, "news.ycombinator.com": 1, "direct": 1} and s["utm"] == {"r-webgames": 1}, f"ref {s['ref']} utm {s['utm']}")
    need(s["dev"] == {"desktop": 2, "phone": 1} and s["cc"] == {"US": 2, "DE": 1}, f"dev {s['dev']} cc {s['cc']}")
    r2 = o["refsw"]
    need(r2["views"] == {"game": 3, "pedia": 1}, f"views {r2['views']} (a 304 revalidation counts, the ?_coi isolation reload doesn't)")
    need(r2["visits"] == {"game": 2, "pedia": 1}, f"visits {r2['visits']} (the same visitor within 30 min is not a new visit)")
    need(r2["ref"] == {"hidden": 1, "direct": 2} and r2["utm"] == {"r_coolgithubprojects": 1}, f"ref {r2['ref']} utm {r2['utm']} (cross-site without Referer is 'hidden'; utm keeps underscores)")
    need(o["bots"].get("game") == 4 and sum(o["botWhy"].values()) == 4 and o["botWhy"].get("no-lang") == 1, f"bots {o['bots']} why {o['botWhy']} (curl, Googlebot, HeadlessChrome, no Accept-Language)")
    for n, v in o["est"].items():
        need(abs(v - int(n)) / int(n) < 0.06, f"HyperLogLog estimate {v:.0f} for {n} uniques (more than 6% off)")
    e2e = o["e2e"]
    need(abs(e2e["uniques"] - 401) / 401 < 0.08 and e2e["visits"] == 403, f"end to end: {e2e} (400 + the first visit + the two new game visits above)")
    need(not e2e["ua_stored"], "an IP address or a User-Agent was found in storage")
    need(all(k.startswith(("stats:", "salt:")) for k in o["keys"]), f"unexpected keys {o['keys']}")
    need(o["salt"] and all(x["ttl"] <= 30 * 3600 for x in o["salt"]), f"the daily salt must expire within 30 h: {o['salt']}")
    return f"views {s['views']}, bots {o['bots']}, 1k/10k/100k uniques → {o['est']['1000']:.0f}/{o['est']['10000']:.0f}/{o['est']['100000']:.0f}, 401 through the worker → {e2e['uniques']}"


def worker_unit():
    tmp = tempfile.mkdtemp(prefix="idle-worker-")
    try:
        shutil.copy(os.path.join(ROOT, "helper", "worker.js"), os.path.join(tmp, "worker.mjs"))
        t = os.path.join(tmp, "t.mjs"); open(t, "w").write(WORKER_TEST)
        r = subprocess.run(["node", t, "file://" + os.path.join(tmp, "worker.mjs")], capture_output=True, text=True, timeout=60)
        need(r.returncode == 0, (r.stderr or r.stdout)[-400:])
        o = json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    s = o["stats"]
    need(s["visits"] == 2, f"visits {s['visits']} != 2")
    need(s["dev"] == {"phone": 1}, f"dev {s['dev']} (a made-up device must not be counted)")
    need(s["ref"] == {"reddit.com": 1, "other": 1}, f"ref {s['ref']} (a full URL must count as 'other')")
    need(s["utm"] == {"r-webgames": 1}, f"utm {s['utm']}")
    need({k: v for k, v in s["dw"].items() if v} == {"1-5": 1, "20+": 1}, f"time buckets {s['dw']} (each page load once, in its last bucket)")
    need({k: v for k, v in s["fl"].items() if v} == {"finished": 1}, f"guided-start stop {s['fl']}")
    need("evil" not in o["stat_keys"], "an unknown key was stored")
    need(o["bad_format"] == 400 and o["too_big"] == 413, f"bad format {o['bad_format']}, too big {o['too_big']}")
    need(o["jeffy_train"] == 404 and o["jeffy_get_predict"] == 404, f"jeffy allowlist: train {o['jeffy_train']}, GET predict {o['jeffy_get_predict']}")
    need(o["jeffy_no_text"] == 400, f"predict without text {o['jeffy_no_text']}")
    need(o.get("lone_report_written") is True, "a single stats report with no later request was never written (stats would be lost when the isolate is evicted)")
    need(o.get("labp") == 204 and o.get("v2visits") == 1, f"/lab/p answered {o.get('labp')}, v2 visits {o.get('v2visits')}")
    need(o.get("sf") == {"story|title": 1, "story|messages": 1, "story|skip:chat": 1, "none|offer_shown": 1, "none|offer_accepted": 1, "none|fd_link": 1, "none|fd_badge_pipe": 1}, f"storyline funnel: {o.get('sf')}")
    need(o.get("gv_story", {}).get("story|visit") == 1 and o.get("gv_story", {}).get("story|dw:1-5") == 1, f"the story arm's visits and dwell: {o.get('gv_story')}")
    ev = re.search(r"STAT_EVERY = (\d+)", open(os.path.join(ROOT, "helper", "worker.js")).read())
    need(ev and int(ev.group(1)) <= 25000, f"STAT_EVERY {ev and ev.group(1)} ms: must stay under the ~30 s a Worker's waitUntil may run after the response")
    need(o["world_poll_writes"] == 0, f"5 polls of an unregistered world wrote {o['world_poll_writes']} times to KV (expected 0: polls never create worlds; KV writes are scarce)")
    need("me" in o["world_state"], "world state has no 'me'")
    need(o["rate_61st"] == 429, f"61st request in a minute: {o['rate_61st']}")
    fb = o["fb"]
    need(fb["ok"] and fb["status"] == "new" and fb["n"] == 1, f"Tell the Oracle: {fb}")
    need(not any(x in fb["text"] for x in ("@", "555", "x.io", "evil.com")) and "[email]" in fb["text"] and "[link]" in fb["text"] and "[number]" in fb["text"], f"emails/links/numbers not blanked: {fb['text']!r}")
    need(set(fb["ctx"]) <= {"page", "place", "build", "device", "err"} and fb["ctx"].get("device") == "phone", f"context outside the allowlist: {fb['ctx']}")
    need(o["fb_badkind"] == 400 and o["fb_6th"] == 429 and o["fb_other_ip"] == 200 and o["fb_get"] == 405, f"kind {o['fb_badkind']}, 6th of a day {o['fb_6th']}, another visitor {o['fb_other_ip']}, GET {o['fb_get']}")
    v = o["votes"]
    need(v == {"v1": 1, "v2": True, "v3": 2, "road_items": 2, "road_votes": 2} and o["vote_unknown"] == 404, f"votes: {v}, unknown item {o['vote_unknown']}")
    need(o["fb_ip_stored"] is False, "an address was stored with feedback or a vote")
    cr = o["credits"]; c = cr["credits"] or []
    need(len(cr["images"]) == 3 and len(c) == 3, f"credits must run parallel to images: {cr}")
    need(c[0] and c[0]["author"] == "Jo Doe" and c[0]["license"] == "CC BY-SA 4.0" and c[0]["page"].startswith("https://commons.wikimedia.org/wiki/File:Barn_owl"), f"Commons credit: {c[0]}")
    need(c[1] is None, f"a non-Wikimedia picture got a credit: {c[1]}")
    need(c[2] and c[2]["author"] == "Ann" and c[2]["source"] == "en.wikipedia.org", f"a picture from the wiki itself: {c[2]}")
    need(cr["api_first"] == 2 and cr["api_second"] == 0 and cr["again"], f"one API call per wiki, then cached: first {cr['api_first']}, second {cr['api_second']}")
    need("id-le.com" in o["credit_ua"] and "github.com/nicobrenner/id-le" in o["credit_ua"], f"User-Agent must name Id|le and a contact: {o['credit_ua']}")
    eg = {k: v for k, v in o["eg"].items() if v and k.split(":")[0] in ("cr", "born", "charts", "built", "fed")}
    need(eg == {"cr:13-30": 1, "born:0": 1, "charts:6-20": 1, "fed:0": 1}, f"engagement buckets {eg} (each page load once, in its last bucket; junk dropped)")
    need(o["secs"] == 420, f"seconds on screen {o['secs']} != 420 (an absurd value must be dropped)")
    pd = o["pd"]
    need(s["visits"] == 2 and pd["visits"] == 1, f"pedia visits {pd['visits']}, game visits {s['visits']} (a pedia visit is not a game visit)")
    need({k: v for k, v in pd["dw"].items() if v} == {"5-20": 1}, f"pedia time {pd['dw']}")
    need(set(k for k, v in pd["sec"].items() if v) == {"the-oracle", "halloween"}, f"pedia sections {pd['sec']} (only the pedia's own ids)")
    need(pd["clips"] == 3 and pd["ref"] == {"news.ycombinator.com": 1}, f"pedia clips {pd['clips']}, ref {pd['ref']}")
    need("x is null @pedia-draw.js:3:9" in o["err_all"], "a pedia error was not kept")
    x = {k: {a: n for a, n in v.items() if n} for k, v in o["x"].items()}
    need(x["did"] == {"w_reel": 1, "w_dream": 1, "rage": 1, "p_music": 1, "quick_exit": 1, "op_miss": 1, "op_rephrase": 1}, f"v2 flags {x['did']} (once each, unknown ones dropped)")
    need(x["ws"] == {"reel": 40, "dream": 12, "mind": 7}, f"v2 watch seconds {x['ws']} (negative, fractional, absurd and unknown dropped)")
    need(x["pt"] == {"music": 30, "studio": 10}, f"v2 panel seconds {x['pt']}")
    need(x["ct"] == {"reelplay": 2, "reelend": 1, "irc": 3, "inbox": 1, "op": 2, "pedia": 1}, f"v2 counts {x['ct']} (an absurd count must be dropped)")
    need(x["opa"] == {"weather": 1, "ai_spawn": 1}, f"v2 Operator actions {x['opa']}")
    fav = x["fav"]
    need(fav.get("job:math") == 3 and fav.get("fam:crawly") == 1 and fav.get("name:Plotkin") == 2, f"v2 favorites {dict(list(fav.items())[:6])}")
    need(not any(k.startswith("secret") or "<" in k for k in fav), f"a favorite outside the pattern was stored: {[k for k in fav if k.startswith('secret') or '<' in k]}")
    need(len(fav) <= 61 and fav.get("other", 0) >= 1, f"favorites must be capped (60 names + 'other'): {len(fav)} kept, other {fav.get('other')}")
    need(x["rage"] == {"studioBtn": 1, "world": 2, "whisper:keep": 1, "world:creature": 1}, f"v2 rage clicks (with the card's and the world's sub-targets) {x['rage']}")
    need(x["path"] == {"card>studio>reels": 1}, f"v2 path {x['path']} (once per page load in its last value; repeats and 4-step paths dropped)")
    need(x.get("op") == {"out:acted": 3, "out:unsure": 1, "opt:light": 2, "cf:hi": 3, "fr:rephrase": 1, "mood:negative": 1, "mm:negative": 1, "gd:light": 1, "gt:light": 2, "gn:light": 1},
         f"Operator signals {x.get('op')} (only fixed keys and small positive integers)")
    egx = {k: v for k, v in o["eg"].items() if v and (k.startswith("reels") or k.startswith("errs"))}
    need(egx == {"reels:1-5": 1, "errs:1": 1}, f"v2 buckets {egx}")
    gf = o["gift"]
    need(gf == {"letter": "Hi Sam!", "label": False, "claimed0": False, "c1": True, "writes": 1, "c2": True, "claimed1": True, "unknown": 404, "revoked": 404, "bad": 404}, f"gift links: {gf}")
    return "stats allowlist + buckets, engagement v1+v2, pedia block, jeffy allowlist, KV write throttle, rate limit, Wikimedia credits, gift links"


def local_server_unit():   # server.py, the local server anyone who clones the repo runs: no network (a stub site and a stub Jeffy on localhost)
    import http.server, socket, threading, urllib.request, urllib.error, urllib.parse
    def free():
        so = socket.socket(); so.bind(("127.0.0.1", 0)); p = so.getsockname()[1]; so.close(); return p
    class Stub(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def reply(self, body, ct):
            b = body.encode(); self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            if self.path == "/page": return self.reply("<html><title>Owls</title><body><nav>menu</nav><p>" + "Owls are birds of prey that hunt at night. " * 20 + "</p><img src=\"/owl.jpg\"><a href=\"/other\">Other owls</a><button>Hoot</button></body></html>", "text/html")
            if self.path == "/v1/capabilities": return self.reply(json.dumps({"capabilities": [{"task_id": "sms_spam"}]}), "application/json")
            self.send_response(404); self.end_headers()
        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0)); q = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/v1/predict/batch" and q.get("texts") == ["WIN a phone"]: return self.reply(json.dumps({"predictions": [{"label": "spam", "confidence": 0.99, "margin": 0.98}]}), "application/json")
            self.send_response(400); self.end_headers()
    sp = free(); stub = http.server.ThreadingHTTPServer(("127.0.0.1", sp), Stub); threading.Thread(target=stub.serve_forever, daemon=True).start()
    lab = tempfile.mkdtemp(prefix="idle-lab-"); port = free()
    env = dict(os.environ, IDLE_ALLOW_PRIVATE="1")
    proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py"), str(port), "--lab", lab, "--jeffy", f"http://127.0.0.1:{sp}"], cwd=tempfile.gettempdir(), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    def get(path):
        r = urllib.request.urlopen(base + path, timeout=20); return r, r.read()
    def post(path, obj):
        r = urllib.request.urlopen(urllib.request.Request(base + path, data=json.dumps(obj).encode(), headers={"Content-Type": "application/json"}), timeout=20); return json.loads(r.read() or b"null")
    emb = {}
    try:
        for _ in range(50):
            try: get("/lab/notices"); break
            except Exception: time.sleep(0.2)
        r, body = get("/arena.html")   # started from another folder: it must find demo/ next to itself
        need(b"<title>" in body, "the game page did not load")
        need(r.headers.get("Cross-Origin-Opener-Policy") == "same-origin" and r.headers.get("Cross-Origin-Embedder-Policy") == "require-corp", "no cross-origin isolation headers (the Oracle would run on one thread)")
        r = urllib.request.urlopen(urllib.request.Request(base + "/oracle_v2_grown_ct2_kv_w8.onnx", method="HEAD"), timeout=20)
        need(int(r.headers.get("Content-Length", 0)) > 5_000_000, "the Oracle model is not served")
        need(json.loads(get("/lab/notices")[1]) == [], "notices must be a JSON list (that is how the page knows a server is there)")
        need(post("/lab/notes", {"text": "make the creatures purple", "ctx": {"page": "arena"}}) == {"ok": True}, "posting a note failed")
        notes = [json.loads(l) for l in open(os.path.join(lab, "notes.jsonl"))]
        need(notes[-1]["text"] == "make the creatures purple" and notes[-1]["who"] == "you" and notes[-1]["t"] > 0, f"note on disk: {notes[-1]}")
        open(os.path.join(lab, "replies.jsonl"), "a").write(json.dumps({"t": time.time(), "who": "agent", "text": "done: purple"}) + "\n{half a line\n")
        reps = json.loads(get("/lab/replies")[1]); need(reps and reps[-1]["text"] == "done: purple", f"replies: {reps} (a half-written line must be skipped, not break the panel)")
        info = json.loads(get("/lab/info")[1]); need(info["notes"] == os.path.join(os.path.realpath(lab), "notes.jsonl") or info["notes"] == os.path.join(lab, "notes.jsonl"), f"/lab/info {info}")
        page = json.loads(get("/lab/fetch?url=" + urllib.parse.quote(f"http://127.0.0.1:{sp}/page", safe=""))[1])
        need(page.get("title") == "Owls" and "birds of prey" in page.get("text", "") and page.get("images") == [f"http://127.0.0.1:{sp}/owl.jpg"], f"page read: {str(page)[:200]}")
        need(any(x["text"] == "Hoot" for x in page["ui"]) and page["links"] and page["links"][0]["text"] == "Other owls", "interface words / links missing")
        post("/lab/sync", {"arena_autosave": {"words": [1, 2, 3]}, "arena_snapshots": [{"t": 1, "name": "a"}]}); post("/lab/sync", {"arena_snapshots": [{"t": 2, "name": "b"}]})
        w = json.loads(get("/lab/world")[1]); need(w["arena_autosave"] == {"words": [1, 2, 3]} and len(w["arena_snapshots"]) == 2, f"world mirror: {w} (snapshots merge, never shrink)")
        post("/worlds/register", {"code": "aa", "name": "A"}); post("/worlds/register", {"code": "bb", "name": "B"})
        post("/worlds/link", {"code": "aa", "other": "bb"}); post("/worlds/approve", {"code": "bb", "other": "aa", "yes": True})
        st = json.loads(get("/worlds/state?code=aa")[1]); need(st["me"]["links"] == ["bb"] and st["peers"]["bb"]["name"] == "B", f"linking worlds: {st}")
        need(json.loads(get("/jeffy/capabilities")[1])["capabilities"][0]["task_id"] == "sms_spam", "jeffy capabilities")
        need(post("/jeffy/predict", {"text": "WIN a phone", "task": "sms_spam"})["label"] == "spam", "jeffy predict")
        try: urllib.request.urlopen(urllib.request.Request(base + "/jeffy/train", data=b"{}"), timeout=10); need(False, "/jeffy/train must be refused")
        except urllib.error.HTTPError as e: need(e.code == 404, f"/jeffy/train answered {e.code}")
        r = urllib.request.urlopen(urllib.request.Request(base + "/lab/stats", data=b"{}"), timeout=10); need(r.status == 204, "stats must be accepted and dropped")
        emb = post("/lab/embed", {"texts": ["a cat"]}); need(("vecs" in emb and len(emb["vecs"][0]) == 384) or "unavailable" in emb.get("error", ""), f"embed: {str(emb)[:120]}")
        out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "operator_watch.py"), "--lab", lab, "--reply", "second reply"], capture_output=True, text=True, timeout=20)
        need(out.returncode == 0 and json.loads(get("/lab/replies")[1])[-1]["text"] == "second reply", "operator_watch.py --reply")
    finally:
        proc.terminate(); stub.shutdown(); shutil.rmtree(lab, ignore_errors=True)
    return f"page + isolation headers, Operator notes/replies, page reading, world mirror, linked worlds, jeffy allowlist, embed ({'vectors' if 'vecs' in emb else 'unavailable'}), operator_watch"


# ---------------------------------------------------------------- the build, served locally
def build(out):
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_static.py"), "--out", out], capture_output=True, text=True)
    need(r.returncode == 0, r.stderr[-600:])
    need(os.path.exists(os.path.join(out, "index.html")) or os.path.exists(os.path.join(out, "arena.html")), "no page in the build")


SLOW = {}   # path prefix -> seconds the test server waits before answering (t_fresh_slow)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        for pre, sec in list(SLOW.items()):
            if self.path.startswith(pre): time.sleep(sec)
        return super().do_GET()
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    def handle_error(self, *a): pass   # a browser closing a download early (lazy pictures, a page navigating) is not a failure


def serve(d):
    s = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=d))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f"http://127.0.0.1:{s.server_address[1]}"


@contextlib.contextmanager
def browser_lock():
    held = False
    if os.path.isdir(os.path.dirname(LOCK)) and not os.environ.get("CI"):
        t0 = time.time()
        while True:
            try: os.mkdir(LOCK); held = True; break
            except FileExistsError:
                if time.time() - t0 > 1800: raise RuntimeError("the shared browser lock was held for 30 minutes: " + LOCK)
                print("  waiting for the shared browser lock…", flush=True); time.sleep(15)
    try: yield
    finally:
        if held:
            with contextlib.suppress(OSError): os.rmdir(LOCK)


CAPS = {"capabilities": [{"task_id": t, "name": t, "n_classes": n, "labels": {str(i): l for i, l in enumerate(L)}} for t, n, L in [
    ("sms_spam", 2, ["ham", "spam"]), ("support_ticket", 5, ["billing", "technical", "account", "shipping", "other"]), ("tweet_eval_sentiment", 3, ["negative", "neutral", "positive"])]]}
# the pages' own console.warn() calls that mean a feature switched itself off: a smoke run fails on these (a warning, not an error,
# hid a real regression: "pedia: drawing code ReferenceError: buildLegs is not defined" left the pedia without creatures or clips)
FEATURE_WARN = re.compile(r"^(pedia:|in-browser classifiers|reels|babies|cached Oracle unavailable|trick or treat)")
FALLBACK_WARN = re.compile(r"^Oracle worker unavailable")   # a legitimate fallback (the Oracle runs on the page): noted, not failed
IGNORE_CONSOLE = re.compile(r"favicon|ERR_ABORTED|net::ERR_|Failed to load resource|onnxruntime|ort-wasm|SharedArrayBuffer|AudioContext was not allowed|The AudioContext")


class Page:
    """a page with every outside request stubbed, errors collected"""
    def __init__(self, ctx, base, stats_sink=None):
        self.ctx, self.base, self.errors, self.console, self.outside = ctx, base, [], [], []
        self.warns, self.notes, self.before_reload = [], [], []
        self.stats = stats_sink if stats_sink is not None else []
        self.fb = []
        self.gifts = {}
        self.root = None   # set: the build is served from this folder at self.base (a production hostname, t_prod_gates)
        ctx.route("**/*", self._route)

    def _route(self, route):
        u = route.request.url
        if u.startswith(self.base):
            path = u[len(self.base):].split("?")[0]
            if path.startswith("/jeffy/capabilities"): return route.fulfill(status=200, content_type="application/json", body=json.dumps(CAPS))
            if path.startswith("/jeffy/"): return route.fulfill(status=503, content_type="application/json", body='{"error":"busy"}')
            if path in ("/lab/stats", "/lab/p"): self.stats.append(route.request.post_data or ""); return route.fulfill(status=204, body="")
            if path == "/lab/notices": return route.fulfill(status=200, content_type="application/json", body="[]")
            if path.startswith("/worlds/state"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"me": {"name": "", "links": [], "requests": [], "inbox": []}, "peers": {}}))
            if path == "/lab/fetch": return route.fulfill(status=200, content_type="application/json", body=json.dumps(WIKI_PAGE))
            if path == "/lab/img": return route.fulfill(status=200, content_type="image/png", body=base64.b64decode(PNG))
            if path.startswith("/lab/gift/"):
                gid, claim = path[len("/lab/gift/"):].split("/")[0], path.endswith("/claim"); g = self.gifts.get(gid)
                if not g: return route.fulfill(status=404, content_type="application/json", body='{"error":"no such gift"}')
                if claim:
                    was = g["claimed"]; g["claimed"] = True; g["claims"] = g.get("claims", 0) + 1
                    return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": False, "already": True} if was else {"ok": True}))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"letter": g["letter"], "claimed": g["claimed"]}))
            if path == "/lab/oracle": self.fb.append(("oracle", route.request.post_data or "")); return route.fulfill(status=200, content_type="application/json", body='{"ok":true,"id":"t1"}')
            if path == "/lab/vote": self.fb.append(("vote", route.request.post_data or "")); return route.fulfill(status=200, content_type="application/json", body='{"ok":true,"votes":4}')
            if path == "/lab/roadmap": return route.fulfill(status=200, content_type="application/json", body=json.dumps({"items": [{"id": "mods", "title": "Mods", "line": "share rules and looks", "status": "planned"}, {"id": "bodies", "title": "New bodies", "line": "", "status": "later"}], "votes": {"mods": 3}, "url": "https://github.com/nicobrenner/id-le/issues/20"}))
            if path.startswith("/lab/") or path.startswith("/worlds/"): return route.fulfill(status=200, content_type="application/json", body='{"ok":false,"error":"test stub"}')
            if self.root:
                f = os.path.join(self.root, path.lstrip("/") or "index.html")
                if os.path.isdir(f): f = os.path.join(f, "index.html")
                if not os.path.isfile(f) and os.path.isfile(f + ".html"): f += ".html"
                return route.fulfill(path=f) if os.path.isfile(f) else route.fulfill(status=404, body="")
            return route.continue_()
        if u.startswith("data:") or u.startswith("blob:"): return route.continue_()
        self.outside.append(u.split("?")[0][:100])
        ct = "text/css" if ".css" in u or "fonts.googleapis" in u else "text/plain"
        return route.fulfill(status=200, content_type=ct, body="")

    def _console(self, m):
        t = m.text
        if m.type == "error" and not IGNORE_CONSOLE.search(t): self.console.append(t[:200])
        elif m.type == "warning" and FEATURE_WARN.search(t): self.warns.append(t[:200])
        elif m.type == "warning" and FALLBACK_WARN.search(t): self.notes.append(t[:80])

    def clean(self, what="page"):
        need(not self.errors, f"{what} errors: " + " | ".join(self.errors[:3]))
        need(not self.console, f"{what} console errors: " + " | ".join(self.console[:3]))
        need(not self.warns, f"{what} switched a feature off: " + " | ".join(self.warns[:3]))

    def open(self, path):
        pg = self.ctx.new_page()
        pg.on("pageerror", lambda e: self.errors.append(str(e)[:200]))
        pg.on("console", self._console)
        def nav(fr):   # the service worker reloads the page once (cross-origin isolation): errors from the first document were from a page being replaced
            if fr == pg.main_frame and (self.errors or self.console or self.warns): self.before_reload += self.errors + self.console + self.warns; self.errors.clear(); self.console.clear(); self.warns.clear()
        pg.on("framenavigated", nav)
        pg.goto(self.base + path, wait_until="load")
        return pg


def wait_for(pg, js, timeout=60, every=0.5, P=None):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if P is not None: P.clean()   # a feature that switched itself off fails now, with its own words, instead of a timeout
        try: v = pg.evaluate(js)
        except Exception as e:   # the page may reload itself while booting (fresh start, recovery): wait for the new one
            if "context was destroyed" not in str(e) and "navigation" not in str(e): raise
            v = None
        if v: return v
        time.sleep(every)
    raise AssertionError(f"timed out after {timeout}s waiting for {js[:80]}")


def booted(pg):
    # booted, and staying the same document: on a first visit the service worker reloads the page once (cross-origin isolation),
    # sometimes after the first document has already booted (WebKit on Linux), so mark the document and make sure the mark survives
    t0 = time.time()
    while time.time() - t0 < 120:
        wait_for(pg, "() => !!(window.__arena && window.__arena.raw && window.__arena.raw().length && window.__restoredOrFresh)", 90)
        with contextlib.suppress(Exception): pg.evaluate("() => { window.__t_doc = 1 }")
        pg.wait_for_timeout(2000)
        try:
            if pg.evaluate("() => window.__t_doc === 1 && !!window.__restoredOrFresh"): return
        except Exception as e:
            if "context was destroyed" not in str(e) and "navigation" not in str(e): raise
    raise AssertionError("the page kept reloading")


# ---------------------------------------------------------------- browser checks
def t_fresh_load(P):
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__arena.raw().length >= 8", 30)   # the starter world arrives a moment after boot
    n = pg.evaluate("() => window.__arena.raw().length")
    if n < 8:
        why = pg.evaluate("() => ({ guide: !!(window.__first5 && window.__first5.state()), restored: !!window.__restored, saved: !!localStorage.getItem('arena.autosave'), isolated: crossOriginIsolated })")
        raise AssertionError(f"only {n} creatures after 30 s: is the starter world there? {why}, errors before the reload: {P.before_reload[:2]}")
    wait_for(pg, "() => !!(window.__oracle && (window.__oracle.ready || /Oracle is off|unavailable/i.test(document.body.innerText)))", 120)
    f5 = pg.evaluate("() => !!(window.__first5 && window.__first5.state())")
    need(f5, "the first-five guide did not start for a fresh visitor")
    pg.wait_for_timeout(3000)
    P.clean()
    return f"{n} creatures, Oracle ready={pg.evaluate('() => window.__oracle.ready')}" + (f", fallback: {P.notes[0]}" if P.notes else "") + (f", {len(P.before_reload)} errors before the service worker's reload ignored" if P.before_reload else "")



def t_crash_guard(P, old=False):
    """the crash guard counts only likely crashes (v2, 11-02). The stored record is written from /privacy.html (which doesn't run the
    guard) exactly as each situation leaves it, then the game loads and reports its level. old=True: the same situations in the
    pre-v2 record format, to count how often the old guard misfired (run against an old build with --dist)."""
    G = "idle.bootGuard"
    def settled(pg):   # the first load reloads once for cross-origin isolation: wait for the document that stays
        pg.set_default_timeout(20000)
        with contextlib.suppress(Exception): wait_for(pg, "() => self.crossOriginIsolated && !!window.__guard", 20)
        pg.wait_for_timeout(1500); return pg
    side = P.open("/privacy.html")
    for pg0 in P.ctx.pages:
        pg0.set_default_timeout(20000)
    def load_level(record):
        side.evaluate("([G, r]) => r === null ? localStorage.removeItem(G) : localStorage.setItem(G, JSON.stringify(r))", [G, record])
        pg = settled(P.open("/arena.html?fresh=1&test"))
        lv = pg.evaluate("() => window.__safeLevel"); return pg, lv
    now = "Date.now()"
    t = side.evaluate("() => Date.now()")
    out = {}
    def fresh(): side.evaluate("G => localStorage.removeItem(G)", G)
    # 1. a page killed in the background (hidden, then gone without pagehide): v2 marks the record alive when hidden
    pg, out["first visit"] = load_level(None)
    pg.evaluate("() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }")
    rec = side.evaluate("G => JSON.parse(localStorage.getItem(G))", G)
    out["record alive after hidden"] = bool(rec and rec.get("alive"))
    with contextlib.suppress(Exception): pg.evaluate("() => { window.__bootOk = null; }")
    side.evaluate("([G, r]) => localStorage.setItem(G, JSON.stringify(r))", [G, rec])   # freeze it as the killed page left it
    pg.close()   # (close would run pagehide; the record above is what a kill leaves)
    side.evaluate("([G, r]) => localStorage.setItem(G, JSON.stringify(r))", [G, rec])
    pg, out["killed while hidden"] = load_level(rec)
    # 2. a second tab while the first is still loading: the first answers on the BroadcastChannel
    side.evaluate("G => { const r = JSON.parse(localStorage.getItem(G)); r.alive = false; r.seen = Date.now(); localStorage.setItem(G, JSON.stringify(r)); }", G)   # the first tab is still 'loading'
    pg2 = settled(P.open("/arena.html?fresh=1&test")); out["second tab"] = pg2.evaluate("() => window.__safeLevel"); out["second tab suspect"] = pg2.evaluate("() => window.__guard.suspect")
    pg2.close(); pg.close()
    # 3. a load that went quiet 20 min before this one (closed without pagehide long ago)
    t = side.evaluate("() => Date.now()")
    pg, out["quiet 20 min"] = load_level({"v": 2, "alive": False, "seen": t - 20 * 60000, "crashes": []}); pg.close()
    # 4. the old format ({n, alive:false}) left by the pre-v2 guard: forgotten
    pg, out["old record n=3"] = load_level({"n": 3, "alive": False}); pg.close()
    # 5. real crashes while loading: the record says loading, seen a few seconds ago
    t = side.evaluate("() => Date.now()")
    pg, out["crash 1"] = load_level({"v": 2, "alive": False, "seen": t - 3000, "crashes": []}); pg.close()
    t = side.evaluate("() => Date.now()")
    pg, out["crash 2"] = load_level({"v": 2, "alive": False, "seen": t - 3000, "crashes": [t - 120000]})
    # 6. 'turn the Oracle back on'
    with contextlib.suppress(Exception): pg.evaluate("() => window.__guard.reset()")
    pg.wait_for_timeout(2500); out["after reset"] = pg.evaluate("() => window.__safeLevel"); pg.close()
    # 7. a crash an hour ago: forgotten
    t = side.evaluate("() => Date.now()")
    pg, out["crash an hour ago"] = load_level({"v": 2, "alive": True, "seen": t - 3600000, "crashes": [t - 3600000]}); pg.close()
    want = {"first visit": 0, "record alive after hidden": True, "killed while hidden": 0, "second tab": 0, "quiet 20 min": 0, "old record n=3": 0,
            "crash 1": 1, "crash 2": 2, "after reset": 0, "crash an hour ago": 0}
    bad = {k: (out.get(k), v) for k, v in want.items() if out.get(k) != v}
    need(not bad, f"crash guard (got, want): {bad}")
    return ", ".join(f"{k} {v}" for k, v in out.items())


def t_fresh_slow(P):
    """a first visit on a slow network: the service worker's one-time reload (cross-origin isolation) lands while the starter world
    is still downloading. It used to mark the page ready early, autosave the empty default world on the way out, and the next load took
    that for the player's own world: 3 creatures, no guided start (2026-11-01)"""
    SLOW.update({"/sw.js": 1.0, "/starter_world.json": 4.0})
    try:
        pg = P.open("/arena.html?fresh=1&test"); booted(pg)
        with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__arena.raw().length >= 8", 40)
        n = pg.evaluate("() => window.__arena.raw().length")
        why = pg.evaluate("() => { const a = JSON.parse(localStorage.getItem('arena.autosave') || 'null'); return { guide: !!(window.__first5 && window.__first5.state()), restored: !!window.__restored, savedWords: a ? (a.words || []).length : -1 } }")
        need(n >= 8, f"only {n} creatures after a slow first visit: {why}")
        need(why["guide"], f"the guided start did not start after a slow first visit: {why}")
    finally: SLOW.clear()
    return f"{n} creatures, guide on, reload mid-download"

def t_camera(P, phone=False):
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    cam = "window.__testCam"
    zs, t0 = [], time.time()   # a fresh visit flies to the starter creatures: wait for the camera to land
    while time.time() - t0 < 20 and not (len(zs) >= 4 and len(set(zs[-4:])) == 1):
        zs.append(pg.evaluate(f"() => {cam}.get().z")); pg.wait_for_timeout(400)
    z0 = zs[-1]; land = 0.7 if pg.evaluate("() => innerWidth < 700") else 0.95   # idle-first5.js: the guide arrives at 70% on phones, 95% elsewhere
    t1 = time.time()   # the guide's flight (700 ms of animation frames) can stall while the page is busy starting up: give it time to land
    while not (abs(z0 - land) < 0.01 or abs(z0 - 1) < 0.01) and time.time() - t1 < 8:
        pg.wait_for_timeout(400); z0 = pg.evaluate(f"() => {cam}.get().z")
    need(abs(z0 - land) < 0.01 or abs(z0 - 1) < 0.01, f"a fresh visit settled at zoom {z0}, expected {land} (the guide's arrival) or 1")
    sp = pg.evaluate(f"() => {cam}.space()"); vw, vh = pg.evaluate(f"() => {{ const v = {cam}.view(); return [v.w, v.h] }}")
    zmin = pg.evaluate(f"() => {cam}.zMin()"); safe = pg.evaluate("() => window.__safeLevel || 0")
    need(safe == 0, f"a fresh visit started in crash-guard safe mode (level {safe})")
    out = pg.evaluate(f"() => {cam}.set({{ z: 0.01 }}).z")
    need(abs(out - zmin) < 1e-6, f"zoomed out to {out}, floor is {zmin}")
    if phone: need(zmin >= 0.35 - 1e-9, f"phones must stop at 0.35 or more, got {zmin}")
    else: need(abs(zmin - max(vw / sp['W'], vh / sp['H'])) < 1e-6 or zmin > 0, f"desktop floor {zmin}")
    zin = pg.evaluate(f"() => {cam}.set({{ z: 99 }}).z"); zmax = pg.evaluate(f"() => {cam}.ZMAX")
    need(abs(zin - zmax) < 1e-6, f"zoomed in to {zin}, ceiling {zmax}")
    # wrap-around (the applyCam regression): the camera wraps instead of leaving the world
    c = pg.evaluate(f"() => {cam}.set({{ z: 1, x: {cam}.space().W + 123, y: -77 }})")
    need(abs(c["x"] - 123) < 1e-6 and abs(c["y"] - (sp["H"] - 77)) < 1e-6, f"wrap-around: x {c['x']} y {c['y']}")
    # travel clamp: while travelling the view stays inside the page
    c = pg.evaluate(f"() => {{ window.__traveling = true; try {{ return {cam}.set({{ z: 1, x: 5, y: 5 }}); }} finally {{ window.__traveling = false; }} }}")
    need(c["x"] >= vw / 2 - 1 and c["y"] >= vh / 2 - 1, f"travel clamp: x {c['x']} y {c['y']} (half view {vw / 2}×{vh / 2})")
    # the zoom control. A fresh world glides the camera to its first scene for a few seconds: wait for that to end first
    pct = lambda: pg.evaluate("() => document.querySelector('#zoomer .zp').textContent")
    zs, t0 = [], time.time()
    while time.time() - t0 < 20 and not (len(zs) >= 4 and len(set(zs[-4:])) == 1):
        zs.append(pg.evaluate(f"() => {cam}.get().z")); pg.wait_for_timeout(400)
    pg.evaluate(f"() => {cam}.set({{ z: 1 }})"); pg.wait_for_timeout(600)
    need(pg.evaluate(f"() => {cam}.get().z") == 1 and pct() == "100%", f"zoom 1 did not hold (now {pg.evaluate(f'() => {cam}.get().z')}, control {pct()})")
    z0 = pg.evaluate(f"() => {cam}.get().z"); pg.click("#zoomer [data-z='in']"); z1 = pg.evaluate(f"() => {cam}.get().z")
    need(abs(z1 / z0 - 1.25) < 0.01, f"+ took the zoom from {z0:.3f} to {z1:.3f} (expected ×1.25)")
    pg.click("#zoomer [data-z='out']"); pg.click("#zoomer [data-z='out']"); z2 = pg.evaluate(f"() => {cam}.get().z")
    need(abs(z2 / z1 - 0.64) < 0.01, f"− twice took {z1:.3f} to {z2:.3f} (expected ×0.64)")
    need(pct() == f"{round(z2 * 100)}%", f"the control shows {pct()} at zoom {z2:.3f}")
    pg.dblclick("#zoomer .zp")   # two clicks within 450 ms (separate clicks can be slower than that on a CI runner)
    need(abs(pg.evaluate(f"() => {cam}.get().z") - 1) < 0.01, "double-tap on the % should reset to 100%")
    if phone:   # phones zoom the floor by layout (#35), not by scale(): at the floor, the floor's CSS zoom is set
        pg.evaluate(f"() => {cam}.set({{ z: 0.01 }})"); pg.wait_for_timeout(400)
        zz = pg.evaluate(f"() => {cam}.floorZoom()")
        need(zz and abs(float(zz) - zmin) < 0.02, f"phone floor zoom '{zz}' (expected about {zmin:.2f}: CSS zoom, #35)")
    P.clean()
    return f"fresh visit lands at {round(z0 * 100)}%, floor {zmin:.2f} (view {vw}×{vh}, world {sp['W']}×{sp['H']}), ceiling {zmax}, wrap + travel clamp ok, not in safe mode"


PANELS = [("herdBtn", "creatures"), ("studioBtn", "studio"), ("reelsBtn", "reels"), ("drawerBtn", "drawer"), ("advBtn", "advisor"), ("djBtn", "music deck"),
          ("almanacBtn", "almanac"), ("treesBtn", "trees"), ("settingsBtn", "settings"), ("ntfBtn", "notices"), ("rc-open", "IRC"), ("lab-toggle", "Oracle"), ("labBtn", "data lab")]
VISIBLE = """() => [...document.querySelectorAll('body *')].filter(e => { if (!e.id || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0), h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);   // on screen, not just laid out (side panels slide in)
  return w > 120 && h > 80 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && cs.display !== 'none'; }).map(e => e.id)"""


def t_panels(P):
    pg = P.open("/arena.html?fresh=1&test"); booted(pg); pg.wait_for_timeout(1500)
    if pg.evaluate("() => window.__first5 && window.__first5.skip") : pg.evaluate("() => window.__first5.skip()")   # the guide's pills would sit on top of some panels
    opened, missing = [], []
    for bid, name in PANELS:
        if not pg.evaluate(f"() => !!document.getElementById('{bid}')"): missing.append(name); continue
        before = set(pg.evaluate(VISIBLE)); e0 = len(P.errors)
        pg.evaluate(f"() => document.getElementById('{bid}').click()"); pg.wait_for_timeout(700)
        new = set(pg.evaluate(VISIBLE)) - before
        need(len(P.errors) == e0, f"{name}: page error {P.errors[e0:e0 + 1]}")
        need(new, f"{name} ({bid}): nothing new became visible")
        opened.append(name)
        if bid == "labBtn": pg.evaluate("() => window.__places && window.__places.closeLab && window.__places.closeLab()")
        else:
            pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
            still = set(pg.evaluate(VISIBLE)) & new
            if still: pg.evaluate(f"() => document.getElementById('{bid}').click()")   # panels that toggle with their own button
        pg.wait_for_timeout(300)
        need(len(P.errors) == e0, f"{name}: page error on close {P.errors[e0:e0 + 1]}")
    need(not missing, "buttons missing: " + ", ".join(missing))
    P.clean()
    return f"{len(opened)} panels opened and closed"


def t_sound(P):
    # sound is on by default (Oct 31): unmuted, background music on, ambience bed running after the first gesture; an explicit mute
    # suspends the audio and survives a reload
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    st = lambda: pg.evaluate("() => { const c = window.__audio.ctx(); return [window.__audio.muted(), c ? c.state : 'none'] }")
    need(not pg.evaluate("() => window.__audio.muted()"), "a fresh visit should start unmuted (sound on by default)")
    pg.mouse.click(400, 500); pg.wait_for_timeout(900); m, s = st()
    need(not m and s == "running", f"after the first gesture: muted={m} context={s}")
    src = pg.evaluate("() => window.__music && window.__music.source ? window.__music.source() : '?'")
    need(src == "bg", f"background music should be on by default, source={src}")
    need(pg.evaluate("() => window.__snd.bedOn()"), "the ambience bed should be running")
    pg.click("#soundBtn"); pg.wait_for_timeout(700); m, s = st()
    need(m and s == "suspended", f"after mute: muted={m} context={s} (a muted game should suspend its audio)")
    pg.reload(); booted(pg); pg.mouse.click(400, 500); pg.wait_for_timeout(700); m, s = st()
    need(m and s != "running", f"an explicit mute should survive a reload: muted={m} context={s}")
    pg.click("#soundBtn"); pg.wait_for_timeout(600); m, s = st()
    need(not m and s == "running", f"after unmute: muted={m} context={s}")
    P.clean()
    return "on by default (bg + ambience), mute → suspended and kept across reload, unmute → running"


def t_haunted(P):
    """Halloween music (idle-music.js): the 🎃 haunted style and deck preset exist; with the mode on, following the world plays it; the effects run"""
    pg = P.open("/arena.html?fresh=1&test&halloween"); booted(pg)
    pg.evaluate("() => { if (!window.__halloween) window.__halloween = { on: () => true, set() {}, onChange() {} }; }")   # until idle-halloween.js is there
    if pg.evaluate("() => window.__audio.muted()"): pg.click("#soundBtn"); pg.wait_for_timeout(400)
    need(pg.evaluate("() => window.__music.styles.includes('haunted') && window.__music.PRESETS.includes('haunted') && window.__music.SCALES.includes('harmonic minor')"), "haunted style, preset or harmonic minor scale missing")
    pg.evaluate("() => { window.__music.bgSet({ style: 'world' }); window.__music.setBg(true); }")
    need(pg.evaluate("() => window.__music.bgTrack().style") == "haunted", "following the world did not play haunted while the mode is on")
    need(not pg.evaluate("() => !!(window.__audio.hushed && window.__audio.hushed())"), "outside the storyline the game's sound must not be hushed")
    t0 = pg.evaluate("() => window.__audio.ctx().currentTime"); pg.wait_for_timeout(2500); t1 = pg.evaluate("() => window.__audio.ctx().currentTime")
    g = pg.evaluate("() => ({ ...window.__music._gains(), want: window.__music._bgWant() })")
    if t1 - t0 > 0.5: need(g and g["bg"] > 0.01, f"background bus silent while haunted plays: {g}")
    else: need(g["want"] > 0.01, f"background music not scheduled while haunted plays (this machine's audio clock is stalled: {t1 - t0:.2f} s in 2.5 s, so the level is checked as scheduled): {g}")   # headless audio stalls when the Mac has no live output device
    pg.evaluate("() => { const s = window.__music._sfx; s.knock(); s.boo(); s.owl(); document.dispatchEvent(new CustomEvent('idle:knock')); }")
    pg.wait_for_timeout(1500)
    pg.evaluate("() => { window.__music.setBg(false); }")
    P.clean()
    return "haunted style + preset, follows the world in Halloween, knock/boo/owl play"


def t_operator(P):
    """The 📟 Operator on a static site: the Tiny Operator (TO) is the default brain; its learned heads (arena_instr_v3.json) turn a few
    requests into the game's own tools, pass creature commands to IRC, and leave chit-chat alone; 🧠 opens the options; the Operator
    button never covers the panel's send row"""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.wait_for_function("() => window.__oracle && window.__oracle.ready && window.__idleAI", timeout=90000)
    pg.click("#lab-toggle"); pg.wait_for_timeout(500)
    need(pg.evaluate("() => document.querySelector('#ai-brain').value") == "tiny", "the Tiny Operator is not the default brain on a static site")
    cases = [("make it foggy", "weather", "weather"), ("add a debugger", "spawn", "spawn"), ("fetch coffee", "creature", "creature"), ("how are you today", "none", None)]
    got = []
    for text, opt, acted in cases:
        r = pg.evaluate("t => window.__idleAI.tiny(t)", text)
        got.append(f"{text!r}→{r['option']}/{r['acted']}")
        need(r["option"] == opt and r["acted"] == acted, f"{text!r}: expected {opt}/{acted}, got {r['option']}/{r['acted']} (p {r['p']:.2f})")
        if acted == "weather": need(pg.evaluate("() => window.__idleWorld.summary({ limit: 0 }).weather.kind") == "fog", "the weather did not turn to fog")
    pg.click("#ai-smart-btn"); pg.wait_for_timeout(200)
    need(pg.evaluate("() => getComputedStyle(document.querySelector('#ai-smart')).display") != "none", "🧠 panel did not open")
    top = pg.evaluate("() => { const r = document.querySelector('#lab-send').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && e.id; }")
    need(top == "lab-send", f"something covers the Operator's send button: {top}")
    P.clean()
    return "; ".join(got) + "; 🧠 opens; send row clear"



def t_tiny_genesis(P):
    """The Tiny Operator's genesis options (arena_instr_v4.json, arena_instructions_v4.py): genesis phrasings route through the learned heads
    to words / first_creatures / light / music; with window.__genesis.actions present TO calls them (with the extracted topic/family);
    without it, light falls back to the weather tool; chit-chat about the void does nothing"""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.wait_for_function("() => window.__oracle && window.__oracle.ready && window.__idleAI", timeout=90000)
    need(pg.evaluate("async () => (await window.__idleAI.heads()).options.includes('first_creatures')"), "the Operator did not load the v4 heads")
    pg.evaluate("""() => { window.__gcalls = []; window.__genesis = { actions: {
        letThereBeWords: t => (window.__gcalls.push(['words', t]), { ok: true }), firstCreatures: f => (window.__gcalls.push(['first_creatures', f || null]), { ok: true }),
        light: () => (window.__gcalls.push(['light']), { ok: true }), music: () => (window.__gcalls.push(['music']), { ok: true }) } }; }""")
    cases = [("let there be words about whales", "words"), ("now bring life", "first_creatures"), ("let there be light", "light"), ("put some music on", "music"), ("the void is quiet", None)]
    got = []
    for text, want in cases:
        r = pg.evaluate("t => window.__idleAI.tiny(t)", text)
        got.append(f"{text!r}→{r['option']}/{r['acted']} {r['p']:.2f}")
        need(r["acted"] == want, f"{text!r}: expected {want}, got {r['option']}/{r['acted']} (p {r['p']:.2f})")
    calls = pg.evaluate("() => window.__gcalls")
    need([c[0] for c in calls] == ["words", "first_creatures", "light", "music"], f"genesis actions called: {calls}")
    need("whale" in (calls[0][1] or "").lower(), f"the topic span did not reach letThereBeWords: {calls[0]}")
    pg.evaluate("() => { delete window.__genesis; }")
    r = pg.evaluate("t => window.__idleAI.tiny(t)", "let there be light")
    need(r["acted"] == "light" and pg.evaluate("() => window.__idleWorld.summary({ limit: 0 }).weather.kind") == "clear", f"light without the genesis module should clear the sky: {r}")
    P.clean()
    return "; ".join(got) + f"; topic {calls[0][1]!r}; fallback light -> clear"


ALLOWED_STATS = {"gv", "v", "v2", "visit", "back", "dev", "ios", "safe", "fps", "feat", "m", "f5", "err", "ref", "utm", "dw", "dw0", "fl", "fl0", "eg", "eg0", "sec", "x", "path", "path0"}
ALLOWED_X = {"did", "ws", "pt", "ct", "opa", "fav", "rage", "op"}   # engagement v2 (idle-stats.js, helper/worker.js)
ALLOWED_PEDIA = {"v", "page", "visit", "back", "dev", "ref", "utm", "dw", "dw0", "ps", "clips", "err", "why"}


def t_stats(P):
    pg = P.open("/arena.html?fresh=1&test&utm_source=Smoke_Test!"); booted(pg)
    need(pg.evaluate("() => !window.__settings.statsLive()"), "stats must never be live on localhost or a ?fresh test")
    p = pg.evaluate("() => window.__stats.peek()") or {}
    keys = set(p) if isinstance(p, dict) else set()
    need(keys and keys <= ALLOWED_STATS, f"payload keys outside the allowlist: {sorted(keys - ALLOWED_STATS)}")
    parts = pg.evaluate("() => window.__stats._parts()")
    need(parts.get("ref") in ("direct", None), f"referrer for a direct visit: {parts.get('ref')}")
    if parts.get("utm"): need(re.fullmatch(r"[a-z0-9-]{1,24}", parts["utm"]), f"utm not cleaned: {parts['utm']}")
    eg = parts.get("eg") or {}
    need(eg.get("cr") == "0-12" and set(eg) <= {"cr", "born", "built", "charts", "fed", "reels", "errs"}, f"engagement for a fresh world: {eg}")
    # errors are located by the first stack frame: file:line:col, the site root called index.html, generated code by its sourceURL
    loc = pg.evaluate("""() => [window.__idleRef.err('x is null', '', 0, 0, 'f@https://id-le.com/idle-music.js?v=ab12:120:7\\ng@https://id-le.com/:9:1'),
      window.__idleRef.err('y', 'https://id-le.com/', 1449, 3, ''), window.__idleRef.err('z', '', 0, 0, 'draw@pedia-draw.js:3:9')]""")
    need(loc[0].startswith("x is null @idle-music.js:120:7") and "@index.html:1449:3" in loc[1] and "@pedia-draw.js:3:9" in loc[2], f"error locations: {loc}")
    need(not P.stats, f"{len(P.stats)} stats requests were sent from a test page")
    P.clean()
    return f"{len(keys)} keys, all allowlisted; engagement {eg}; errors located; nothing sent"


def t_stats_v2(P):
    """engagement v2: a scripted visit (a card, its mind tab, the studio, a rage click, a reel and an IRC line) reports what it did, and nothing else"""
    pg = P.open("/arena.html?statstest&test"); booted(pg)
    need(pg.evaluate("() => window.__settings.statsLive()"), "?statstest must make stats live on localhost (the test switch)")
    name = pg.evaluate("() => { const c = window.__arena.raw().find(k => !k.guest && k.name); window.__idleWorld.openCard(c.name); return c.name; }")
    pg.wait_for_timeout(900)
    pg.evaluate("() => { const t = document.querySelector('#ctabs [data-ct=\"mind\"]'); if (t) t.click(); }"); pg.wait_for_timeout(2300)
    pg.evaluate("() => { document.querySelector('#whisper .cx') && document.querySelector('#whisper .cx').click(); document.getElementById('studioBtn').click(); }"); pg.wait_for_timeout(2300)
    for _ in range(3): pg.mouse.click(400, 500)   # three fast clicks in one spot: a rage click
    pg.evaluate("""() => { for (const t of ['reel_play', 'reel_end', 'chat']) dispatchEvent(new CustomEvent('idle:ev', { detail: { type: t, extra: {} } })); }""")
    pg.evaluate("() => window.__stats._send('3m')"); pg.wait_for_timeout(500)
    need(P.stats, "nothing was sent with ?statstest")
    sent = [json.loads(b) for b in P.stats]
    need(sent[0].get("why") == "open" and sent[0].get("visit") == 1 and sent[0].get("v2") == 1, f"the first report must be the visit itself, sent soon after the page opens: {sent[0]}")
    keys = set().union(*[set(q) for q in sent])
    need(keys <= ALLOWED_STATS | {"why"}, f"payload keys outside the allowlist: {sorted(keys - ALLOWED_STATS - {'why'})}")
    x = {}
    for q in sent:
        for k, v in (q.get("x") or {}).items():
            need(k in ALLOWED_X, f"v2 key outside the allowlist: {k}")
            if isinstance(v, list): x.setdefault(k, set()).update(v)
            else:
                for a2, n in v.items(): x.setdefault(k, {})[a2] = x.get(k, {}).get(a2, 0) + n
    path = next((q["path"] for q in sent if q.get("path")), "")
    need(x.get("pt", {}).get("studio", 0) >= 1 and "p_studio" in x.get("did", set()), f"studio time not reported: pt {x.get('pt')}, did {x.get('did')}")
    need(x.get("ws", {}).get("mind", 0) + x.get("ws", {}).get("dream", 0) >= 1, f"watching a mind not reported: ws {x.get('ws')}")
    need(any(k.startswith("job:") for k in x.get("fav", {})) and any(k.startswith("name:") for k in x.get("fav", {})), f"favorites: {x.get('fav')}")
    need(any(k.startswith("world:") or k.startswith("whisper:") or k in ("other",) for k in x.get("rage", {})) and "rage" in x.get("did", set()) and "world" not in x.get("rage", {}), f"rage click not reported with its sub-target: {x.get('rage')}")
    need(x.get("ct", {}).get("reelplay") == 1 and x.get("ct", {}).get("reelend") == 1 and x.get("ct", {}).get("irc") == 1, f"counts: {x.get('ct')}")
    need(path.startswith("card") and "studio" in path, f"path {path!r} (card, then studio)")
    names = [k[5:] for k in x.get("fav", {}) if k.startswith("name:")]
    starter = {"Crawly", "Id|le"} | {r.get("name") for r in json.load(open(os.path.join(ROOT, "demo", "starter_world.json"))).get("residents", [])}
    need(all(n in starter or n == "other" for n in names), f"a name outside the starter world was sent: {names}")
    P.clean()
    return f"card {name}: pt {x.get('pt')}, ws {x.get('ws')}, path {path}, rage {x.get('rage')}, {len(x.get('fav', {}))} favorite keys"


def t_op_actions(P):
    """'Operator actions that ran' counts only the Operator (11-02): the world's own evolve/disaster events and the Tiny Operator's tool
    logs (ai_*) don't count; the Tiny Operator's acted turns do; your own AI's ai_* tools count only during its turn (op_msg → op_done)"""
    pg = P.open("/arena.html?statstest&test"); booted(pg)
    pg.evaluate("""() => { const ev = (type, extra) => dispatchEvent(new CustomEvent('idle:ev', { detail: { type, extra: extra || {} } }));
      for (let i = 0; i < 5; i++) ev('evolve', { who: 'x', how: 'mutate' }); ev('disaster', { k: 'quake' });   // the world on its own
      ev('ai_weather', {}); ev('tiny_operator', { option: 'weather', p: 0.97, acted: 'weather', out: 'acted' });   // a TO turn: its tool log + its turn
      ev('op_msg', { brain: 'anthropic' }); ev('ai_spawn', {}); ev('op_done', { brain: 'anthropic', tools: true, error: false });   // your own AI
      ev("ai_disaster", {}); }""")   # after the turn: not counted
    pg.wait_for_timeout(600)
    pg.evaluate("() => window.__stats._send('3m')"); pg.wait_for_timeout(500)
    opa = {}
    for b in P.stats:
        t = b if isinstance(b, str) else b.decode()
        with contextlib.suppress(Exception):
            for k, v in ((json.loads(t).get("x") or {}).get("opa") or {}).items(): opa[k] = opa.get(k, 0) + v
    need(opa == {"weather": 1, "ai_spawn": 1}, f"Operator actions counted {opa}, want weather 1 (TO) and ai_spawn 1 (your own AI)")
    return f"counted {opa}"


def t_op_stats(P):
    """the Operator signals: outcomes, retries, caps/?!, a mood label from the (stubbed) in-browser classifier, genesis tries and nudges; the typed text never leaves"""
    pg = P.open("/arena.html?statstest&test"); booted(pg)
    secret = "PURPLE ZEBRA 4471 WHY?!"
    pg.evaluate("""s => { let called = 0; window.__jeffy = { has: () => true, off: () => false, state: () => 'ready', load: async () => {}, predict: async (h, t) => { called++; window.__moodCalls = called; return { label: 'negative' }; } };
      const ev = (type, extra) => dispatchEvent(new CustomEvent('idle:ev', { detail: { type, extra } })), txt = t => dispatchEvent(new CustomEvent('idle:optext', { detail: { text: t, brain: 'tiny' } }));
      txt(s); ev('tiny_operator', { option: 'light', p: 0.62, acted: null, out: 'unsure' });
      txt('let there be light please'); ev('genesis_nudge', { step: 'light' });
      txt('let there be light'); ev('tiny_operator', { option: 'light', p: 0.97, acted: 'light', out: 'acted' }); ev('genesis', { step: 'light' });
      ev('op_done', { brain: 'anthropic', tools: true, error: false }); }""", secret)
    pg.wait_for_timeout(800)
    pg.evaluate("() => window.__stats._send('3m')"); pg.wait_for_timeout(500)
    need(P.stats, "nothing was sent with ?statstest")
    raw = "\n".join(b if isinstance(b, str) else b.decode() for b in P.stats)
    for frag in ("PURPLE", "ZEBRA", "4471", "let there be", "please"):
        need(frag.lower() not in raw.lower(), f"typed text left the page: {frag!r} in a stats report")
    op = {}
    for q in [json.loads(b) for b in P.stats]:
        for k2, n in ((q.get("x") or {}).get("op") or {}).items(): op[k2] = op.get(k2, 0) + n
    need(op.get("out:unsure") == 1 and op.get("out:acted") == 1 and op.get("out:nudged") == 1 and op.get("byo:tool") == 1, f"outcomes {op}")
    need(op.get("opt:light") == 2 and op.get("cf:mid") == 1 and op.get("cf:hi") == 1, f"guess and confidence {op}")
    need(op.get("fr:rephrase") == 1 and op.get("fr:caps") == 1 and op.get("fr:punct") == 1, f"frustration signals {op}")
    need(op.get("gn:light") == 1 and op.get("gd:light") == 1 and op.get("gt:light", 0) >= 1, f"genesis tries/nudges {op}")
    need(op.get("mood:negative", 0) >= 1 and pg.evaluate("() => window.__moodCalls || 0") >= 1, f"mood label (computed in the page) {op}")
    P.clean()
    return f"{len(op)} keys: " + ", ".join(f"{k} {v}" for k, v in sorted(op.items())) + "; no typed text in any report"


def t_pedia_stats(P):
    """the pedia's own beacon: off for ?fresh, on for ?statstest (a localhost test switch), allowlisted keys, page 'pedia'"""
    pg = P.open("/pedia.html?fresh=1")
    wait_for(pg, "() => window.__pedia && window.__pediaStats", 30, P=P)
    need(not pg.evaluate("() => window.__pediaStats.live()"), "pedia stats must never be live on a ?fresh test")
    pg.evaluate("() => window.__pediaStats._send(true)"); pg.wait_for_timeout(300)
    need(not P.stats, "the pedia sent stats from a ?fresh test page")
    pg2 = P.open("/pedia.html?statstest&utm_source=Smoke_Test!")
    wait_for(pg2, "() => window.__pedia && window.__pediaStats", 30, P=P)
    pg2.evaluate("() => { document.getElementById('oracle') && document.getElementById('oracle').scrollIntoView(); }"); pg2.wait_for_timeout(1200)
    pg2.evaluate("() => window.__pediaStats._send(true)"); pg2.wait_for_timeout(500)
    need(P.stats, "the pedia sent nothing with ?statstest")
    p = json.loads(P.stats[0]); keys = set(p)
    need(p.get("page") == "pedia" and p.get("visit") == 1, f"pedia payload: {p}")
    need(keys <= ALLOWED_PEDIA, f"pedia payload keys outside the allowlist: {sorted(keys - ALLOWED_PEDIA)}")
    need(all(re.fullmatch(r"[a-z0-9-]{1,40}", x) for x in p.get("ps", [])), f"section ids: {p.get('ps')}")
    need(p.get("utm") == "smoke_test" or p.get("utm") is None or re.fullmatch(r"[a-z0-9-]{1,24}", p["utm"]), f"utm not cleaned: {p.get('utm')}")
    P.clean("pedia")
    return f"{len(keys)} keys, page=pedia, {len(p.get('ps', []))} sections seen, off on ?fresh"


def t_datalab(P, secs=45):
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.evaluate("() => window.__places.openLab()")
    s = wait_for(pg, """() => { const s = window.__lab && window.__lab.state && window.__lab.state(); return s && s.msgs.filter(m => m.done).length >= 3 ? s : null }""", secs + 60, P=P)
    done = sum(1 for m in s["msgs"] if m.get("done")); where = s["stats"].get("where")
    need("browser" in json.dumps(where), f"classifiers did not run in the browser: {where}")
    P.clean()
    return f"{done} sorted, in {s['stats']['in']}, where={where}"


def t_datalab_home(P):
    # 🏠 back home keeps the lab (team, messages, bins, stats); 🗑 remove asks first (a lab was lost to a button labelled "close")
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.evaluate("() => window.__places.openLab()")
    s1 = wait_for(pg, """() => { const s = window.__lab && window.__lab.state && window.__lab.state(); return s && s.msgs.filter(m => m.done).length >= 2 ? s : null }""", 120, P=P)
    heads = pg.evaluate("() => window.__lab.team().map(t => t.head)")
    need("support_mood" in heads, f"the default team's mood tagger is not support_mood: {heads}")
    pg.evaluate("() => document.getElementById('labHome').click()")
    wait_for(pg, "() => document.documentElement.dataset.place === 'home'", 20, P=P)
    pg.evaluate("() => window.__places.openLab()")
    s2 = wait_for(pg, "() => document.documentElement.dataset.place === 'lab' && window.__lab.state()", 30, P=P)
    need(s2["stats"]["in"] >= s1["stats"]["in"] and sum(1 for m in s2["msgs"] if m.get("done")) >= sum(1 for m in s1["msgs"] if m.get("done")),
         f"coming back lost the lab's run: in {s1['stats']['in']} -> {s2['stats']['in']}")
    pg.evaluate("() => document.getElementById('labExit').click()"); pg.wait_for_timeout(400)
    one = pg.evaluate("() => ({ place: document.documentElement.dataset.place, armed: document.getElementById('labExit').classList.contains('armed') })")
    need(one["place"] == "lab" and one["armed"], f"one click on remove should only ask: {one}")
    pg.evaluate("() => document.getElementById('labExit').click()")
    wait_for(pg, "() => document.documentElement.dataset.place !== 'lab'", 20, P=P)
    P.clean()
    return f"home and back kept in={s2['stats']['in']} (was {s1['stats']['in']}); remove asked first, then removed; team {heads}"


def t_lab_card(P, phone=False):
    # a lab creature's card used to open UNDER the team panel (#whisper z 10 < #team z 11, docked at the right edge where the panel is)
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    if pg.evaluate("() => window.__first5 && window.__first5.skip"): pg.evaluate("() => window.__first5.skip()")
    pg.evaluate("() => window.__places.openLab()")
    name = wait_for(pg, "() => { const c = window.__lab && window.__lab.crew && window.__lab.crew()[0]; return document.documentElement.dataset.place === 'lab' && c ? c.name : null }", 60, P=P)
    if not phone: pg.evaluate("() => { const t = document.getElementById('team'); if (!t.classList.contains('on')) document.getElementById('labBtn').click(); }")
    pg.wait_for_timeout(500)
    # lab creatures aren't in openCard's lookup (it skips them): open the card the way a player does, by clicking the creature
    for _ in range(6):
        if phone:   # on a phone the team sheet covers the lower 72% of the screen: fold it away and bring the creature to the middle, as a player would
            pg.evaluate("""(n) => { document.getElementById('team').classList.remove('on'); const c = window.__lab.crew().find(k => k.name === n) || window.__lab.crew()[0]; window.__dis.flyTo(c.x, c.y, 1.4); }""", name)
            pg.wait_for_timeout(900)
        xy = pg.evaluate("""(n) => { const H = window.__collectHooks, c = window.__lab.crew().find(k => k.name === n) || window.__lab.crew()[0], cam = H.cam(), v = H.viewSize(), a = document.getElementById('arena').getBoundingClientRect();
            return [a.left + v.w / 2 + (c.x - cam.x) * cam.z, a.top + v.h / 2 + (c.y - cam.y) * cam.z] }""", name)
        if phone: pg.touchscreen.tap(xy[0], xy[1])
        else: pg.mouse.click(xy[0], xy[1])
        pg.wait_for_timeout(900)
        if pg.evaluate("() => document.getElementById('whisper').style.display === 'block'"): break
    r = pg.evaluate("""() => { const w = document.getElementById('whisper'), b = w.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
        const cx = Math.min(vw - 2, Math.max(1, b.left + b.width / 2)), cy = Math.min(vh - 2, Math.max(1, b.top + Math.min(b.height / 2, 60))), top = document.elementFromPoint(cx, cy);
        const t = document.getElementById('team'), tb = t.getBoundingClientRect(), tOn = t.classList.contains('on') && getComputedStyle(t).display !== 'none';
        const overlap = tOn ? Math.max(0, Math.min(b.right, tb.right) - Math.max(b.left, tb.left)) * Math.max(0, Math.min(b.bottom, tb.bottom) - Math.max(b.top, tb.top)) : 0;
        return { shown: w.style.display === 'block', box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], inView: b.width > 50 && b.height > 50 && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh,
                 topmost: !!(top && w.contains(top)), teamOpen: tOn, overlap: Math.round(overlap) } }""")
    need(r["shown"] and r["inView"], f"the card isn't on screen: {r}")
    need(r["topmost"], f"the card is covered at its centre (elementFromPoint): {r}")
    if not phone: need(r["teamOpen"] and r["overlap"] == 0, f"with the team panel open the card should dock beside it, not on it: {r}")
    P.clean()
    return f"card {r['box']} on top" + (f", team panel open, overlap {r['overlap']} px" if not phone else "")


def t_mood_migrate(P):
    old = [{"head": "sms_spam", "role": "filter", "match": "spam", "thr": 0.7, "name": "Spamtrap"}, {"head": "support_ticket", "role": "route", "thr": 0.6, "margin": 0.2, "name": "Router"},
           {"head": "tweet_eval_sentiment", "role": "tag", "thr": 0.5, "name": "Moodring"}]
    P.ctx.add_init_script("try { if (!sessionStorage.getItem('t')) { localStorage.setItem('arena.team', %s); sessionStorage.setItem('t', '1'); } } catch (e) {}" % json.dumps(json.dumps(old)))
    pg = P.open("/arena.html?test"); booted(pg)
    team = pg.evaluate("() => JSON.parse(localStorage.getItem('arena.team')).map(t => t.name + ':' + t.head)")
    need(team == ["Spamtrap:sms_spam", "Moodring:support_mood", "Router:support_ticket"], f"untouched old default not migrated: {team}")
    P.clean()
    return " → ".join(team)


def t_intro(P):
    """the genesis intro (idle-intro.js): ?intro=storm plays on load, draws, skip ends it and resolves; Esc skips the epic one"""
    pg = P.open("/arena.html?intro=storm&fresh=1&test")
    pg.evaluate("() => { window.__t_intro = []; document.addEventListener('idle:intro', e => window.__t_intro.push(e.detail)); }")
    wait_for(pg, "() => !!document.getElementById('idleIntro')", 60, P=P); pg.wait_for_timeout(2500)
    lit = pg.evaluate("""() => { const c = document.querySelector('#idleIntro canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) n++; return n; }""")
    need(lit > 50, f"the intro canvas stayed dark ({lit} lit samples)")
    tone = pg.evaluate("() => document.getElementById('idleIntro').dataset.tone"); need(tone == "storm", f"?intro=storm played {tone}")
    durs = pg.evaluate("() => ['storm', 'eerie', 'epic'].map(t => window.__intro.scenes(t).reduce((a, b) => a + b, 0))"); need(25 <= durs[0] <= 35, f"storm runs {durs[0]:.1f}s (expected 25-35)")
    pg.click("#idleIntro .skip"); wait_for(pg, "() => !document.getElementById('idleIntro')", 5)
    ev = pg.evaluate("() => window.__t_intro"); need(any(e.get("phase") == "end" and e.get("skipped") for e in ev), f"no 'end, skipped' event: {ev}")
    pr = pg.evaluate("() => { window.__t_p = window.__intro.play({ tone: 'epic' }).then(r => window.__t_r = r); return true; }")
    wait_for(pg, "() => !!document.getElementById('idleIntro')", 5); pg.wait_for_timeout(800); pg.keyboard.press("Escape")
    wait_for(pg, "() => window.__t_r && window.__t_r.skipped && window.__t_r.tone === 'epic'", 5)
    P.clean("intro"); return f"storm drew ({lit} lit samples, {durs[0]:.1f}s; eerie {durs[1]:.1f}s, epic {durs[2]:.1f}s), skip resolved; epic skipped with Esc"


def t_intro_reduced(P):
    """reduced motion: four still frames with fades, resolves by itself (not skipped)"""
    pg = P.open("/arena.html?intro=0&fresh=1&test"); booted(pg)
    pg.evaluate("() => { window.__intro.play({ tone: 'eerie' }).then(r => window.__t_r = r); }")
    t0 = time.time(); wait_for(pg, "() => window.__t_r && window.__t_r.skipped === false", 20); dt = time.time() - t0
    need(dt < 12, f"reduced-motion intro took {dt:.1f}s (expected the still sequence, ~7 s)")
    P.clean("intro reduced"); return f"still sequence resolved in {dt:.1f}s"


def t_intro_epoch0(P):
    """the Epoch 0 intro (idle-epoch0.js): the default tone; the blocklist; the bank is clean; two visits differ; it draws and plays to the end"""
    pg = P.open("/arena.html?intro=0&fresh=1&test"); booted(pg)
    tone = pg.evaluate("() => window.__intro.tone"); need(tone == "epoch0", f"the default intro is {tone!r}, expected epoch0")
    chk = pg.evaluate("""async () => { const E = window.__epoch0; await E.loadBank(); const f = E.fit;
      const bad = ['I want to kill it', 'my daughter likes it', 'Gabry went there', 'visit www.x.com', 'call 5551234'].filter(f), good = ['a small world of words', 'I think you are right'].filter(s => !f(s));
      const bank = await (await fetch('intro_babble.json')).json(), lines = Object.values(bank.lines).flat(), unfit = lines.filter(s => !f(s));
      const a = E.makeContent({ seed: 1 }), b = E.makeContent({ seed: 2 }); const same = a.lines.every((l, i) => l.text === b.lines[i].text);
      return { bad, good, n: lines.length, unfit: unfit.slice(0, 3), epochs: Object.keys(bank.lines).length, same }; }""")
    need(not chk["bad"], f"the blocklist let through {chk['bad']}"); need(not chk["good"], f"the blocklist rejected {chk['good']}")
    need(chk["epochs"] == 8 and chk["n"] >= 200, f"the bank has {chk['n']} lines in {chk['epochs']} epochs"); need(not chk["unfit"], f"bank lines fail the blocklist: {chk['unfit']}")
    need(not chk["same"], "two seeds gave the same intro")
    pg.evaluate("() => { window.__t_r = null; window.__intro.play().then(r => window.__t_r = r); }")
    wait_for(pg, "() => document.getElementById('idleIntro') && document.getElementById('idleIntro').dataset.tone === 'epoch0'", 5); pg.wait_for_timeout(4500)
    lit = pg.evaluate("""() => { const c = document.querySelector('#idleIntro canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 53) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; }""")
    need(lit > 20, f"no babble drawn after 4.5 s ({lit} lit samples)")
    t0 = time.time(); r = wait_for(pg, "() => window.__t_r", 80); dt = time.time() - t0 + 4.5   # on localhost the terminal boot plays first (~12 s)
    need(r.get("tone") == "epoch0" and r.get("skipped") is False, f"the intro ended with {r}")
    # readable: every line stays fully on screen ≥ 2 s after it has streamed (Nico: "going a bit too fast for me to read")
    clk = pg.evaluate("() => { const C = window.__epoch0.clock; return { hold: C.slot - C.stream - C.lead, lines: window.__epoch0.schedule.length }; }")
    need(clk["hold"] >= 2.0, f"a line is fully readable for only {clk['hold']:.2f} s"); need(clk["lines"] == 6, f"{clk['lines']} lines, expected 6")
    # hold to read: pointer down freezes the clock, release resumes; a click doesn't skip; Esc skips
    pg.evaluate("() => { window.__t_r = null; window.__intro.play().then(r => window.__t_r = r); }")
    wait_for(pg, "() => window.__epoch0.time() > 3", 15); vw = pg.viewport_size; pg.mouse.move(vw["width"] / 2, vw["height"] / 2); pg.mouse.down()
    pg.wait_for_timeout(300); a1 = pg.evaluate("() => window.__epoch0.time()"); pg.wait_for_timeout(1500); a2 = pg.evaluate("() => window.__epoch0.time()")
    paused = pg.evaluate("() => window.__epoch0.paused()"); pg.mouse.up(); pg.wait_for_timeout(1000); a3 = pg.evaluate("() => window.__epoch0.time()")
    need(paused and abs(a2 - a1) < 0.05, f"holding didn't pause the film ({a1:.2f} → {a2:.2f}, paused={paused})"); need(a3 - a2 > 0.6, f"releasing didn't resume ({a2:.2f} → {a3:.2f})")
    need(pg.evaluate("() => window.__epoch0.playing()") and not pg.evaluate("() => window.__t_r"), "a click (press and release) skipped the intro")
    pg.keyboard.press("Escape"); r2 = wait_for(pg, "() => window.__t_r", 5); need(r2.get("skipped") is True, f"Esc didn't skip: {r2}")
    P.clean("intro epoch0"); return f"default tone epoch0; blocklist ok; bank {chk['n']} lines clean; seeds differ; played to the end in {dt:.1f}s ({r.get('live')} live lines, ending: {r.get('cont')}); each line held {clk['hold']:.1f}s; hold pauses, click doesn't skip, Esc skips"


def t_halloween_light(P):
    # under a light OS theme the night used to wash out to a pale day: the world must be at night while the mode is on
    pg = P.open("/arena.html?fresh=1&test&halloween"); booted(pg)
    st = wait_for(pg, """() => { const a = document.getElementById('arena'); if (!a.classList.contains('hw-night') || window.__hwNight !== true) return null;
        const m = getComputedStyle(a).backgroundColor.match(/\\d+/g).map(Number); return { bg: m.slice(0, 3), dark: window.__collectHooks && window.__collectHooks.isDark ? window.__collectHooks.isDark() : null } }""", 30, P=P)
    need(sum(st["bg"]) < 200, f"the world isn't dark under a light OS theme: background {st['bg']}")
    pg.evaluate("() => window.__halloween.set(false)")
    P.clean()
    return f"light OS theme + Halloween: world background rgb{tuple(st['bg'])}, canvas isDark={st['dark']}"


def t_datalab_stuck(P):
    team = [{"head": "sms_spam", "role": "filter", "match": "spam", "thr": 0.7, "name": "Mine"}, {"head": "support_ticket", "role": "route", "thr": 0.6, "margin": 0.2, "name": "Rtr"},
            {"head": "tweet_eval_sentiment", "role": "tag", "thr": 0.5, "name": "Late"}]
    P.ctx.add_init_script("try { if (!sessionStorage.getItem('t')) { localStorage.setItem('arena.team', %s); sessionStorage.setItem('t', '1'); } } catch (e) {}" % json.dumps(json.dumps(team)))
    pg = P.open("/arena.html?test"); booted(pg)
    pg.evaluate("() => window.__places.openLab()")
    txt = wait_for(pg, "() => { const t = (document.querySelector('#labStats') || {}).innerText || ''; return /stuck/i.test(t) && /Late/.test(t) ? t : '' }", 90)
    line = next((l for l in txt.splitlines() if "Late" in l), "")
    P.clean()
    return "stuck line: " + line.strip()[:90]


def t_irc_inbox(P):
    # IRC → the data lab's inbox: "@inbox …" queues without a lab and lands once one opens; marked ✉ you; IRC gets the result line;
    # plain lines go in only when "the inbox also hears IRC" is ticked
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    if pg.evaluate("() => window.__first5 && window.__first5.skip"): pg.evaluate("() => window.__first5.skip()")
    pg.evaluate("() => { document.getElementById('roomchat').classList.remove('closed', 'min'); const c = document.getElementById('chat'); c.value = '@inbox I was charged twice for the same order, this is ridiculous'; document.getElementById('send').click(); }")
    q = pg.evaluate("() => window.__lab.pending()")
    need(q == 1, f"@inbox with no lab open should wait in a queue: pending={q}")
    pg.evaluate("() => window.__places.openLab()")
    # pause the demo stream so the run doesn't depend on how fast this machine sorts it (CI is slower than a laptop)
    wait_for(pg, "() => window.__lab && window.__lab.isOn() && document.getElementById('labPlay') ? true : null", 30, P=P)
    pg.evaluate("() => { const b = document.getElementById('labPlay'); if (/pause/.test(b.textContent)) b.click(); }")
    probe = """() => { const s = window.__lab && window.__lab.state && window.__lab.state(); const m = s && s.msgs.find(m => m.you); return m && m.done ? m : null }"""
    try:
        m = wait_for(pg, probe, 90, P=P)
    except AssertionError:
        st = pg.evaluate("""() => { const s = window.__lab.state(), y = s.msgs.find(m => m.you); return { you: y && { stage: y.stage, done: y.done, bin: y.bin, trail: (y.trail || []).length },
            waiting: s.msgs.filter(m => !m.done).length, stages: window.__lab.team().map(t => t.role + ':' + t.head), crew: window.__lab.crew().map(c => (c.lab.busy ? 'busy' : 'idle') + (c.lab.wait > Date.now() ? '/wait' : '')),
            heads: window.__jeffy && window.__jeffy.state() } }""")
        raise AssertionError(f"the @inbox message did not land in 90 s: {st}")
    need(len(m.get("trail") or []) >= 1, f"no stage left a label on the trail: {m}")
    line = wait_for(pg, "() => [...document.querySelectorAll('#log .ln')].map(d => d.textContent).find(t => /your message “I was charged twice/.test(t)) || null", 20, P=P)
    cls = pg.evaluate("() => [...document.querySelectorAll('.msg.you')].length")
    need(cls >= 1, "the message on the floor is not marked ✉ you")
    n0 = pg.evaluate("() => window.__lab.state().msgs.filter(m => m.you).length")
    pg.evaluate("() => { const c = document.getElementById('chat'); c.value = 'say hi'; document.getElementById('send').click(); }"); pg.wait_for_timeout(600)
    n1 = pg.evaluate("() => window.__lab.state().msgs.filter(m => m.you).length")
    need(n1 == n0, f"a plain IRC line went into the inbox although 'the inbox also hears IRC' is off ({n0} -> {n1})")
    pg.evaluate("() => { const b = document.getElementById('labIrc'); if (!b.checked) b.click(); }")
    pg.evaluate("() => { const c = document.getElementById('chat'); c.value = 'thanks, the refund arrived today'; document.getElementById('send').click(); }"); pg.wait_for_timeout(600)
    n2 = pg.evaluate("() => window.__lab.state().msgs.filter(m => m.you).length")
    need(n2 == n1 + 1, f"with 'the inbox also hears IRC' on, a plain line should go in too ({n1} -> {n2})")
    P.clean()
    return f"queued then landed in bin '{m.get('bin')}' after {len(m['trail'])} stage(s); IRC: “{line[:90]}…”; listen toggle ok"


def t_oracle(P):
    """Tell the Oracle: the form sends a kind, scrubbed text and only the ticked context; the roadmap lists items and votes once; IRC opens the form"""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.evaluate("() => { window.__idle.cfg.helper = location.origin; if (window.__first5 && window.__first5.skip) window.__first5.skip(); }")   # the test build has no helper: point it at the stubs
    need(pg.evaluate("() => !!document.getElementById('oracleBtn') && document.getElementById('oracleBtn').textContent === '🧪'"), "no 🧪 (tell the scientists) button in the top bar")
    pg.evaluate("() => document.getElementById('oracleBtn').click()"); pg.wait_for_timeout(300)
    need(pg.evaluate("() => document.getElementById('oracle').classList.contains('on')"), "the Oracle panel did not open")
    pg.evaluate("() => document.querySelector('#oracle [data-kind=bug]').click()")
    pg.fill("#oracle textarea", "the rain is too loud, write me at me@example.com")
    pg.evaluate("() => { const c = document.querySelector('#oracle [data-ctx=place]'); if (c) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } }")
    pg.evaluate("() => document.querySelector('#oracle [data-a=send]').click()")
    wait_for(pg, "() => /🧪/.test((document.querySelector('#oracle .msg') || {}).textContent || '')", 10, P=P)
    sent = [json.loads(b) for k, b in P.fb if k == "oracle"]
    need(len(sent) == 1, f"{len(sent)} submissions sent")
    q = sent[0]
    need(q["kind"] == "bug" and "me@example.com" not in q["text"] and "[email]" in q["text"], f"submission: {q}")
    need(set(q.get("ctx") or {}) <= {"page", "build", "device", "err"} and "place" not in q.get("ctx", {}), f"an unticked context field was sent: {q.get('ctx')}")
    pg.evaluate("() => document.querySelector('#oracle [data-tab=road]').click()")
    wait_for(pg, "() => document.querySelectorAll('#oracle .it').length === 2", 10, P=P)
    need("▲ 3" in pg.evaluate("() => document.querySelector('#oracle [data-vote=mods]').textContent"), "vote count not shown")
    pg.evaluate("() => document.querySelector('#oracle [data-vote=mods]').click()"); pg.wait_for_timeout(500)
    pg.evaluate("() => document.querySelector('#oracle [data-vote=mods]').click()"); pg.wait_for_timeout(300)
    votes = [k for k, _ in P.fb if k == "vote"]
    need(len(votes) == 1 and "▲ 4" in pg.evaluate("() => document.querySelector('#oracle [data-vote=mods]').textContent"), f"votes sent {len(votes)} (one expected), shown {pg.evaluate('() => document.querySelector(\'#oracle [data-vote=mods]\').textContent')}")
    pg.evaluate("() => window.__feedback.close()")
    pg.evaluate("() => { document.getElementById('chat').value = 'tell the scientists the bats are too small'; document.getElementById('send').click(); }"); pg.wait_for_timeout(300)
    st = pg.evaluate("() => window.__feedback.state()")
    need(st["open"] and st["tab"] == "tell" and st["draft"] == "the bats are too small", f"IRC 'tell the scientists …' did not open the form: {st}")
    need(len([k for k, _ in P.fb if k == "oracle"]) == 1, "the IRC line was sent without pressing send")
    P.clean()
    return f"sent {q['kind']} with ctx {sorted(q.get('ctx') or {})}, email blanked; 2 roadmap items, one vote; IRC opens the form"


def t_quick(P):
    # ⚡ quick commands: slots show the real target and can be changed, × hides (⋯ restores), ✎ edits, hover lights up the target
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    if pg.evaluate("() => window.__first5 && window.__first5.skip"): pg.evaluate("() => window.__first5.skip()")
    pg.evaluate("() => document.getElementById('roomchat').classList.remove('closed', 'min')")
    r = pg.evaluate("() => ({ head: !!document.querySelector('#quick .qh'), n: document.querySelectorAll('#quick .qc[data-q]').length, slot: (document.querySelector('#quick .qs') || {}).textContent || '' })")
    need(r["head"] and r["n"] >= 5 and r["slot"].strip("▾ "), f"quick row: {r}")
    pg.click("#quick .qs"); pg.wait_for_timeout(200)
    opts = pg.evaluate("() => [...document.querySelectorAll('#quickMenu [data-qpick]')].map(b => b.textContent)")
    need(len(opts) >= 2, f"the word picker offers {opts}")
    pg.click("#quickMenu [data-qpick]:nth-of-type(2)"); pg.wait_for_timeout(200)
    s2 = pg.evaluate("() => document.querySelector('#quick .qs').textContent.replace('▾', '')")
    need(s2 == opts[1], f"picking '{opts[1]}' left the slot at '{s2}'")
    pg.hover("#quick .qc[data-q='0']"); pg.wait_for_timeout(300)
    rings = pg.evaluate("() => document.querySelectorAll('.qring').length")
    need(rings >= 1, "hovering a command lit up nothing in the world")
    n0 = r["n"]; pg.click("#quick .qc[data-q='1'] .x"); pg.wait_for_timeout(200)
    h = pg.evaluate("() => ({ n: document.querySelectorAll('#quick .qc[data-q]').length, hidden: JSON.parse(localStorage.getItem('arena.quickHidden') || '[]').length })")
    need(h["n"] == n0 - 1 and h["hidden"] == 1, f"× should hide one: {h}")
    pg.click("#quickMore"); pg.wait_for_timeout(200); pg.click("#quickMenu [data-qr]"); pg.wait_for_timeout(200)
    n2 = pg.evaluate("() => document.querySelectorAll('#quick .qc[data-q]').length")
    need(n2 == n0, f"⋯ → ↩ should bring it back: {n2} vs {n0}")
    pg.click("#quick .qc[data-q='0'] .qe"); pg.wait_for_timeout(200)
    v = pg.evaluate("() => document.getElementById('chat').value")
    need("{word}" in v, f"✎ should put the template in the chat box: '{v}'")
    pg.evaluate("() => { document.getElementById('chat').value = 'fetch {word} quickly'; }"); pg.click("#quickAdd"); pg.wait_for_timeout(200)
    e = pg.evaluate("() => JSON.parse(localStorage.getItem('arena.quick'))[0]")
    need(e == "fetch {word} quickly", f"✓ save edit stored '{e}'")
    P.clean()
    return f"{n0} commands, slot picker {len(opts)} words, hover rings {rings}, hide/restore and edit ok"


def t_rclick(P):
    # right-click (long-press) a word: the menu offers what can happen and who does it; the tour's step completes on the real event
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    wait_for(pg, "() => !!(window.__first5 && window.__first5.state() && window.__first5.state().active)", 30, P=P)   # the tour starts a moment after boot
    pg.evaluate("() => window.__rclick.demo()")
    wait_for(pg, "() => document.getElementById('insp').style.display === 'block' && document.querySelectorAll('#insp [data-iv]').length > 0", 15, P=P)
    verbs = pg.evaluate("() => [...document.querySelectorAll('#insp [data-iv]')].map(b => b.dataset.iv)")
    v = "fetch" if "fetch" in verbs else verbs[0]
    pg.click(f"#insp [data-iv='{v}']"); pg.wait_for_timeout(200); pg.click("#insp [data-isend='1']")
    ok = wait_for(pg, "() => { const s = window.__first5 && window.__first5.state(); return s && s.done && s.done.keep ? true : null }", 10, P=P)
    P.clean()
    return f"menu offered {verbs}; sent '{v}'; the tour's right-click step ticked off"


def t_clicks(P):
    # every click on the world answers (idle-clicks.js): empty floor ripples, a word says what it is, a creature speaks, a thing wobbles
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    wait_for(pg, "() => window.__arena.raw().length >= 8 && !!window.__clickKit && !!window.__clicks", 30, P=P)
    pg.evaluate("() => document.querySelectorAll('#ntf, .np').forEach(e => e.remove())")
    floor = pg.evaluate("""() => { const k = window.__clickKit, a = document.getElementById('arena').getBoundingClientRect();
      for (let i = 0; i < 600; i++) { const x = a.left + 80 + Math.random() * (a.width - 500), y = a.top + 140 + Math.random() * (a.height - 240);
        if (k.critAt(x, y) || k.wordAt(x, y)) continue; const el = document.elementFromPoint(x, y); if (el && (el.id === 'arena' || el.id === 'floor' || el.tagName === 'CANVAS')) return { x, y }; } return null; }""")
    need(floor, "no empty floor found to click")
    pg.mouse.click(floor["x"], floor["y"]); pg.wait_for_timeout(120)
    rip = pg.evaluate("() => document.querySelectorAll('.ck-ripple').length")
    need(rip >= 1, "a click on empty floor left no ripple")
    r = pg.evaluate("""() => { const k = window.__clickKit, a = document.getElementById('arena').getBoundingClientRect(), out = {};
      for (let i = 0; i < 4000 && !out.word; i++) { const x = a.left + 60 + Math.random() * (a.width - 120), y = a.top + 100 + Math.random() * (a.height - 160); const w = k.wordAt(x, y), top = document.elementFromPoint(x, y); if (w && !k.critAt(x, y) && !(top && top.closest && top.closest('.thing, .design'))) { window.__clicks.answer(x, y); out.word = w.text; out.wtip = [...document.querySelectorAll('.ck-tip')].map(e => e.textContent).join(' | '); } }
      const c = window.__arena.raw().find(c => { if (c._off || c.state === 'sleep' || !c.bub) return false; const s = k.screenOf(c.x, c.y); return s.x > a.left + 40 && s.x < a.right - 40 && s.y > a.top + 80 && s.y < a.bottom - 40; });
      if (c) { c.bub.classList.remove('on'); c._ckT = 0; const s = k.screenOf(c.x, c.y); window.__clicks.answer(s.x, s.y); out.crit = c.name; out.said = c.bub.classList.contains('on') ? c.bub.textContent : null; }
      for (const th of document.querySelectorAll('#arena .thing, #arena .design')) { const b = th.getBoundingClientRect(); if (b.width < 10 || b.left < a.left || b.right > a.right || b.top < a.top || b.bottom > a.bottom) continue;
        let pt = null; for (let i = 0; i < 40 && !pt; i++) { const x = b.left + 4 + Math.random() * (b.width - 8), y = b.top + 4 + Math.random() * (b.height - 8); if (!k.critAt(x, y) && !k.wordAt(x, y) && th.contains(document.elementFromPoint(x, y))) pt = { x, y }; }
        if (!pt) continue; window.__clicks.answer(pt.x, pt.y); out.wob = th.classList.contains('ck-wobble'); break; }
      return out; }""")
    need(r.get("word") and r["word"] in (r.get("wtip") or ""), f"a word click showed no label: {r}")
    need(r.get("said"), f"a creature click got no line: {r}")
    need(r.get("wob") is not False, f"a thing click didn't wobble: {r}")
    hint = pg.evaluate("() => window.__clicks.hint()")
    need(hint, "the first-visit hint ring did not show")
    P.clean()
    return f"floor ripple, word '{r['word']}' labelled, {r['crit']} said '{r['said']}', thing wobble {r.get('wob')}, hint ring ok"


def t_replay(P):
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    r = pg.evaluate("""async () => { const C = await (await fetch('pedia_clips.json')).json(), cl = C.clips.storm; const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200;
      cv.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:200px;z-index:99999'; document.body.appendChild(cv);
      const P = window.__replayPlayer.make(cv, {}); P.start(cl); const snap = () => { const d = cv.getContext('2d').getImageData(0, 0, 320, 200).data; let h = 0, ink = 0; for (let i = 0; i < d.length; i += 16) { h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; if (d[i + 3]) ink++; } return [h, ink]; };
      await new Promise(r => setTimeout(r, 900)); const a = snap(); await new Promise(r => setTimeout(r, 900)); const b = snap(); P.stop(); cv.remove();
      return { a, b, wx: !!(cl.env && cl.env.wx), dur: P.dur }; }""")
    need(r["wx"], "the storm clip carries no weather (env.wx)")
    need(r["a"][1] > 100, "the replay drew nothing")
    need(r["a"][0] != r["b"][0], "the replay's frames did not change in 0.9 s")
    P.clean()
    return f"storm clip plays, weather {r['wx']}"


def t_pedia(P, phone=False):
    pg = P.open("/pedia.html")
    wait_for(pg, "() => document.querySelectorAll('#toc a').length > 20", 30)
    toc = pg.evaluate("() => [...document.querySelectorAll('#toc a')].map(a => a.getAttribute('href')).filter(h => h && h.startsWith('#'))")
    broken = pg.evaluate("(ids) => ids.filter(h => !document.getElementById(decodeURIComponent(h.slice(1))))", toc)
    need(not broken, f"contents links to missing sections: {broken[:5]}")
    # positive content, not just "no errors": the creature boxes are drawn by code the pedia takes from the game (legs, bodies);
    # when that broke (a warning, no error) the page showed empty boxes and no clips
    wait_for(pg, "() => document.querySelectorAll('svg.live').length >= 5", 30)
    drawn = pg.evaluate("""async () => { const out = [], ok = s => s.childElementCount >= 3 && s.innerHTML.length > 200;
        for (const s of document.querySelectorAll('svg.live')) { s.scrollIntoView({ block: 'center' });   // each box draws while on screen
          for (let k = 0; k < 20 && !ok(s); k++) await new Promise(r => setTimeout(r, 100)); out.push([s.dataset.fam || 'bodies', ok(s)]); } scrollTo(0, 0); return out; }""")
    empty = [f for f, ok in drawn if not ok]
    need(not empty, f"{len(empty)} of {len(drawn)} creature boxes stayed empty: {empty[:6]}")
    live = len(drawn)
    info = pg.evaluate("() => { const s = document.querySelector('svg.live[data-fam]'); return s ? s.innerHTML : '' }")
    need(info, "the infobox creature (svg.live[data-fam]) is missing")
    pg.evaluate("() => { window.__t_info = document.querySelector('svg.live[data-fam]').innerHTML }")
    with contextlib.suppress(AssertionError): wait_for(pg, "() => document.querySelector('svg.live[data-fam]').innerHTML !== window.__t_info", 6)
    need(pg.evaluate("() => document.querySelector('svg.live[data-fam]').innerHTML") != info, "the infobox creature is drawn but did not move in 6 s (its legs should step)")
    wait_for(pg, "() => document.querySelectorAll('figure.clip canvas').length >= 5", 30)
    pg.evaluate("() => document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')")   # lazy pictures: load them all now
    with contextlib.suppress(AssertionError): wait_for(pg, "() => [...document.images].every(i => i.complete)", 30)
    imgs = pg.evaluate("() => [...document.images].map(i => [i.currentSrc || i.src, i.complete && i.naturalWidth > 0])")
    bad = [s for s, ok in imgs if not ok]
    need(not bad, f"{len(bad)} pictures did not load: {bad[:3]}")
    moving = pg.evaluate("""async () => { const out = []; for (const cv of document.querySelectorAll('figure.clip canvas')) { cv.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 700));
        const g = cv.getContext('2d'), w = cv.width, h = cv.height, s = () => { const d = g.getImageData(0, 0, w, h).data; let x = 0; for (let i = 0; i < d.length; i += 64) x = (x * 31 + d[i] + d[i + 1]) | 0; return x; };
        const a = s(); await new Promise(r => setTimeout(r, 700)); out.push(a !== s()); } return out; }""")
    need(all(moving), f"clips not playing: {moving}")
    if phone:
        sw = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
        need(sw <= 1, f"sideways scroll of {sw}px at phone width")
    P.clean()
    return f"{len(toc)} sections, {live} live creatures, {len(imgs)} pictures, {len(moving)} clips playing"


def t_genesis(P):
    """The guided genesis (?genesis&intro=0): a calm, dark void with the Operator open and "let there be light" pre-filled; words made
    out of order are still visible; enter on the pre-filled phrase builds the step; the glowing suggestion too; after four guided steps
    the guide ends and the normal UI fades in; a new consciousness keeps a snapshot; stats() reports the steps."""
    pg = P.open("/arena.html?genesis&start=guided&intro=0&test")
    wait_for(pg, "() => !!(window.__genesis && document.querySelector('#genConsole [data-gsay]'))", 40, P=P)
    st = "() => ({ c: window.__arena.raw().filter(c => !c.lab).length, w: window.__genHooks.words().length, v: document.documentElement.classList.contains('gen-void'), calm: document.documentElement.classList.contains('gen-calm'), lit: document.documentElement.classList.contains('gen-lit'), next: window.__genesis.next(), pre: (document.getElementById('lab-text') || {}).value, g: window.__genesis.state(), ab: window.__genesis.ab })"
    v0 = pg.evaluate(st)
    need(v0["c"] == 0 and v0["w"] == 0 and v0["v"] and v0["calm"], f"genesis should start empty, dark and calm: {v0}")
    need(v0["ab"] == "off", f"the A/B switch must ship off: {v0['ab']}")
    need(v0["next"] == "light" and v0["pre"] == "let there be light", f"the first guided step should be light, pre-filled: {v0['next']} / {v0['pre']!r}")
    wait_for(pg, "() => getComputedStyle(document.getElementById('topbar')).opacity === '0'", 8, P=P)   # it fades out (1.6 s)
    e0 = pg.evaluate("""() => { const vis = el => !!el && getComputedStyle(el).opacity !== '0' && el.offsetParent !== null;
        return { pills: [...document.querySelectorAll('#ntf .np')].filter(e => e.offsetParent !== null).length, open: document.querySelector('#lab').classList.contains('open'),
          focus: (document.activeElement || {}).id, flag: /[?&]genesis\\b/.test(location.search), topbar: vis(document.getElementById('topbar')),
          page: [...document.querySelectorAll('#ai-thread .ai-row.page')].filter(e => e.offsetParent !== null).length, glow: document.querySelectorAll('#genConsole .glow').length }; }""")
    need(e0["pills"] == 0 and e0["open"] and e0["focus"] == "lab-text" and not e0["flag"], f"the void must be empty with the Operator open and focused, and the flag dropped: {e0}")
    need(not e0["topbar"] and e0["page"] == 0 and e0["glow"] == 1, f"the void must be calm (no toolbar, no old paragraph) with ONE glowing suggestion: {e0}")
    # out of order: words before light are still visible (the night palette), and the guide still asks for light first
    pg.evaluate("() => window.__genesis.actions.letThereBeWords('')"); wait_for(pg, "() => window.__genHooks.words().length > 10", 30, P=P)
    ink = pg.evaluate("() => { const w = window.__genHooks.words().find(w => w.el && w.el.offsetParent); const c = w ? getComputedStyle(w.el).color : ''; const m = c.match(/\\d+/g) || [0, 0, 0]; return { dark: window.__genDark, next: window.__genesis.next(), lum: (+m[0] + +m[1] + +m[2]) / 3, c }; }")
    need(ink["dark"] and ink["next"] == "light" and ink["lum"] > 120, f"words made before the light must be visible on the dark void, and light still comes first: {ink}")
    # enter on the pre-filled phrase builds the step; the next phrase is pre-filled (words are done: life is next)
    pg.focus("#lab-text"); pg.keyboard.press("Enter")
    wait_for(pg, "() => document.documentElement.classList.contains('gen-lit')", 20, P=P)
    wait_for(pg, "() => window.__genesis.next() === 'creatures' && document.getElementById('lab-text').value === 'bring life'", 10, P=P)
    # the glowing suggestion: life → alive (three steps), still calm while the guide runs
    pg.click("#genConsole [data-gsay]"); wait_for(pg, "() => window.__arena.raw().filter(c => !c.lab).length >= 2 && window.__genesis.state().alive", 30, P=P)
    s3 = pg.evaluate(st)
    need(not s3["v"] and s3["calm"] and s3["next"] == "sky", f"three steps should make it alive while the guide still runs (calm), sky next: {s3}")
    # the fourth step (weather) ends the guide: the UI fades in, free chips appear, the pre-fill is gone
    pg.focus("#lab-text"); pg.keyboard.press("Enter")
    wait_for(pg, "() => !document.documentElement.classList.contains('gen-calm') && !!document.querySelector('#genConsole [data-gen]')", 15, P=P)
    end = pg.evaluate("() => ({ next: window.__genesis.next(), stats: window.__genesis.stats(), topbar: getComputedStyle(document.getElementById('topbar')).opacity, pre: document.getElementById('lab-text').value })")
    need(end["next"] is None and end["stats"]["end"] == "guided" and set(end["stats"]["steps"]) >= {"light", "words", "creatures", "weather"}, f"the guide should end after four steps and report them: {end}")
    for k in ("hut", "music"):
        need(pg.evaluate("k => { const b = [...document.querySelectorAll('#genConsole [data-gen]')].find(b => b.dataset.gen === k); if (b) b.click(); return !!b; }", k), f"no free '{k}' chip after the guide")
        wait_for(pg, f"() => !!(window.__genesis.state().steps || {{}})['{k}']", 20, P=P)
    firsts = pg.evaluate("() => (window.__advisor && window.__advisor.state().firsts) || {}")
    need(all(("genesis-" + k) in firsts for k in ("words", "creatures", "light")), f"each step should be a Gazette first: {sorted(firsts)}")
    n0 = pg.evaluate("() => (JSON.parse(localStorage.getItem('arena.snaps') || '[]') || []).length")
    pg.evaluate("() => window.__genesis.newUniverse('guided')")
    wait_for(pg, "() => window.__genesis.state().n === 2 && document.documentElement.classList.contains('gen-void') && window.__genesis.next() === 'light'", 20, P=P)
    n1 = pg.evaluate("() => (JSON.parse(localStorage.getItem('arena.snaps') || '[]') || []).length")
    need(pg.evaluate("() => [...document.querySelectorAll('#settings .row b, #genChoose h2')].map(e => e.textContent).join('|')").count('universe') == 0, "no 'universe' left in ⚙ or the chooser")
    need(n1 == n0 + 1, f"a new consciousness must keep the old world as a snapshot first ({n0} → {n1})")
    P.clean()
    return f"calm void, light pre-filled; words out of order visible (lum {ink['lum']:.0f}); enter → light, ▶ → life (alive), enter → weather → guide ends; steps {end['stats']['steps']}; new consciousness kept a snapshot ({n0}→{n1})"


def t_story(P):
    """The storyline (?story): the Epoch 0 intro in its story version (skipped here with Esc), the Tiny Operator's waking-up lines in a
    lightbox, "lights on" pre-filled, the primordial universe lighting up, the window docking with the Epoch 1 card, words and first life
    by the glowing suggestion, the Day 1 front page, then Day 2 (coming soon) and the free console."""
    pg = P.open("/arena.html?story&test")
    wait_for(pg, "() => !!document.querySelector('#idleIntro')", 40, P=P)
    wait_for(pg, "() => !!(window.__epoch0 && window.__epoch0.last)", 20, P=P)
    story = pg.evaluate("() => window.__epoch0.last.story")
    need(story, "the storyline should play the story version of Epoch 0")
    pg.keyboard.press("Escape")
    # the landing (story v4): the dark first (the real view, very dark, only a far black hole; your lines), no Operator, no chips, no creatures; a click moves the lines on; Esc skips to the Operator
    wait_for(pg, "() => !document.querySelector('#idleIntro') && window.__genesis.landing().phase === 'dark' && !!window.__genesis.landing().line", 10, P=P)
    v = pg.evaluate("() => ({ box: document.documentElement.classList.contains('gen-box'), con: !!document.querySelector('#genConsole [data-gsay]'), lab: !!(document.querySelector('#lab') && document.querySelector('#lab').classList.contains('open')), night: !!document.querySelector('#genNight'), handle: getComputedStyle(document.querySelector('#toHandle')).display, skip: !!document.querySelector('#genNightSkip') })")
    need(not v["box"] and not v["con"] and not v["lab"] and v["night"] and v["skip"] and v["handle"] == "none", f"the dark should come first, without the Operator: {v}")
    ui = pg.evaluate("() => [...document.body.children].filter(e => !['arena', 'genNight', 'genNightSkip', 'genArrive', 'genBlack'].includes(e.id) && !/SCRIPT|STYLE/.test(e.tagName)).filter(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }).map(e => e.id || e.tagName)")
    need(not ui, f"nothing of the UI while it's dark (story v5): {ui}")
    need(pg.evaluate("() => window.__audio.hushed()"), "from the landing on, sound doesn't exist yet: the master must be hushed")
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "no creatures in the dark: the first ones come with 'bring life'")
    vw = pg.viewport_size; n0 = pg.evaluate("() => window.__genesis.landing().shown")
    for k in range(4): pg.mouse.click(vw["width"] * (0.3 + 0.1 * k), vw["height"] * 0.3); pg.wait_for_timeout(200)
    n1 = pg.evaluate("() => window.__genesis.landing().shown"); need(n1 > n0, f"clicks should move the lines on: {n0} → {n1}")
    pg.keyboard.press("Escape")
    wait_for(pg, "() => window.__genesis.landing().phase !== 'dark'", 3, P=P)
    lnd = pg.evaluate("() => window.__genesis.landing()")
    need(lnd["why"] == "skip", f"Esc should go straight to the Operator: {lnd}")
    wait_for(pg, "() => document.documentElement.classList.contains('gen-box') && !!document.querySelector('#genBackdrop')", 20, P=P)
    pg.click("#genConsole")   # a tap finishes the line being typed
    wait_for(pg, "() => !!document.querySelector('#genConsole [data-gsay]')", 40, P=P)
    w = pg.evaluate("() => ({ mode: window.__genesis.mode(), pre: document.getElementById('lab-text').value, say: document.querySelector('#genConsole [data-gsay]').textContent, cos: window.__genesis.cosmos(), creatures: window.__arena.raw().filter(c => !c.lab).length, words: window.__genHooks.words().length, thread: document.querySelector('#ai-thread').innerText })")
    need(w["mode"] == "story" and w["pre"] == "lights on" and "lights on" in w["say"], f"the waking up should end on 'lights on', pre-filled: {w}")
    need(w["cos"]["on"] and not w["cos"]["lit"] and w["creatures"] == 0 and w["words"] == 0, f"before the lights: an empty universe, the cosmos dim: {w}")
    fs = pg.evaluate("() => { const l = document.querySelector('#genConsole .gw p, #genConsole .gl'), lab = document.querySelector('#lab'); return { fz: l ? getComputedStyle(l).fontSize : null, lh: l ? parseFloat(getComputedStyle(l).lineHeight) / parseFloat(getComputedStyle(l).fontSize) : 0, over: lab.scrollWidth - lab.clientWidth, fam: getComputedStyle(document.documentElement).getPropertyValue('--op-font').trim() }; }")
    need(fs["fz"] == "17px" and abs(fs["lh"] - 1.45) < 0.02 and fs["over"] <= 1 and fs["fam"], f"the Operator's words: 17 px, line-height 1.45, no overflow, family from --op-font: {fs}")
    gt = pg.evaluate("() => (document.querySelector('#genTag') || {}).textContent || ''")
    need(not pg.evaluate("() => !!document.querySelector('#genConsole .gt')"), "no status line inside the Operator's chat (v9: it's a tag on the world)")
    need(gt == "consciousness 24 · epoch 0 · genesis", f"the Operator's status line before the lights: {gt!r}")
    need("the consciousness you were training" in w["thread"] and "tumble there, Doc" in w["thread"] and "10 epochs" in w["thread"] and "it only eats worlds" in w["thread"] and "We have a lot of work" not in w["thread"], "the Tiny Operator's opening (v9, 5 lines) should be in the thread")
    son = pg.evaluate("() => window.__genesis.landing()"); need(son["pings"] >= 1 and son["night"], f"the Operator should ping the dark: {son}")
    nm = pg.evaluate("() => ({ head: document.querySelector('#lab-head b').textContent, toggle: document.querySelector('#lab-toggle').textContent })")
    need("Operator" in nm["head"] and "Oracle" in nm["toggle"], f"the rename: TO's window reads Operator, the panel's button reads Oracle: {nm}")
    pg.click("#genConsole [data-gsay]")
    wait_for(pg, "() => window.__genesis.cosmos().lit", 10, P=P)
    line = pg.evaluate("() => (document.querySelector('#genConsole .gl') || {}).textContent || ''")
    need("we can see something" in line, f"the lights-on reaction line: {line!r}")
    fl = wait_for(pg, "() => window.__genesis.landing().flip && (() => { const f = window.__genesis.landing().flip, x = document.querySelector('#lab').getBoundingClientRect().left; return performance.now() - f.t0 > 250 && { ...f, mid: x }; })()", 10, P=P)
    need(min(fl["from"]["x"], fl["to"]["x"]) + 5 < fl["mid"] < max(fl["from"]["x"], fl["to"]["x"]) - 5, f"the Operator flies from the middle to its dock (mid-flight between): {fl}")
    wait_for(pg, "() => !document.documentElement.classList.contains('gen-box') && !!document.querySelector('#genDay')", 10, P=P)
    need("Oracle" in pg.evaluate("() => document.querySelector('#lab-head b').textContent"), "docked, the panel should read 🔮 Oracle again")
    gt1 = pg.evaluate("() => { const t = document.querySelector('#genTag'), r = t && t.getBoundingClientRect(); return t && { text: t.textContent, shown: getComputedStyle(t).display !== 'none', left: r.left, top: r.top }; }")
    need(gt1 and gt1["text"] == "consciousness 24 · epoch 1" and gt1["shown"] and gt1["left"] < 40 and gt1["top"] < 40, f"after the lights: the tag at the world's top-left: {gt1}")
    day = pg.inner_text("#genDay")
    need("EPOCH 1" in day and "first life" in day and "DAY" not in day, f"the Epoch 1 card: {day!r}")
    for _ in range(2):
        wait_for(pg, "() => !!document.querySelector('#genConsole [data-gsay]:not([disabled])')", 30, P=P)
        pg.click("#genConsole [data-gsay]"); pg.wait_for_timeout(2500)
    wait_for(pg, "() => !!document.querySelector('#genFront')", 30, P=P)
    front = pg.inner_text("#genFront")
    need("EPOCH 1" in front.upper() and "GAZETTE" in front.upper() and "EPOCH 2" in front.upper(), f"the Epoch 1 front page: {front[:160]!r}")
    pg.click("#genFront button")
    wait_for(pg, "() => (document.querySelector('#genDay') || {}).innerText && document.querySelector('#genDay').innerText.includes('EPOCH 2')", 10, P=P)
    wip = pg.inner_text("#genDay"); need("work in progress" in wip and "open source" in wip, f"Epoch 2's card should say Id|le is a work in progress: {wip!r}")
    need(all(k in pg.evaluate("() => window.__funnel.reached()") for k in ("landing", "operator", "lights", "e1words", "e1life", "e1done")), "the funnel should have every Epoch 0 → Epoch 1 moment")
    end = pg.evaluate("() => { const s = window.__genesis.state(); return { days: s.days, day: s.day, free: !!s.free, alive: !!s.alive, c: window.__arena.raw().filter(c => !c.lab).length, cos: window.__genesis.cosmos() } }")
    need(end["days"] and "1" in end["days"] and end["day"] == 2 and end["free"] and end["alive"] and end["c"] >= 2, f"after Day 1: day 2 next, alive, free console: {end}")
    stuck_check(pg, P, "storyline")
    P.clean()
    return f"story intro, wake-up lightbox → 'lights on' → cosmos lit, docked Epoch 1 card; words, life → front page → Epoch 2 (soon); {end['c']} creatures"


def t_story_intro(P):
    """The story version of Epoch 0, drawn frame by frame: the scientist's subtitles, the overrun, the white flash, black, the cut."""
    pg = P.open("/arena.html?fresh=1&test&nofirst5"); booted(pg)
    r = pg.evaluate("""async () => { const E = window.__epoch0; await E.loadBank(); await E.loadLoss(); const ct = E.makeContent({ story: true, seed: 3 }), cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
      const at = T => { E.frame(ct, T, cv); const d = cv.getContext('2d').getImageData(0, 0, 640, 360).data; let s = 0; for (let i = 0; i < d.length; i += 4 * 97) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / (4 * 97)) / 3; };
      let legs = 0; const K = window.__critDraw, L0 = K && K.legs; if (K) K.legs = (...a) => { legs++; return L0.apply(K, a); };   // the title must draw no creature
      const out = { total: E.total(ct), dark: at(3), sub: 0, flash: 0, black: 0, cut: 0 }; for (const T of [5, 10, 20, 24, 28]) out.sub = Math.max(out.sub, at(T)); out.flash = at(29.8); out.black = at(30.6); out.strike = at(31.98); out.lateBlack = at(31.3); out.cut = at(33.6); out.spin = at(29.6); for (let T = 32.4; T < 38.2; T += 0.25) at(T); out.legs = legs; if (K) K.legs = L0;
      out.protosRun = [8.8, 18, 25.8].map(T => E.protos(T, true)).flat(); out.protosAfter = [29.9, 31, 33, 35, 37].map(T => E.protos(T, true)).flat().length;
      const ts = []; for (let T = 0.5; T <= 29.75; T += 0.05) ts.push([T, ...E.storyChart(T)]); const cross = v => (ts.find(p => p[2] >= v) || [null])[0]; out.refs = E.storyRefs().map(r => r.label);
      out.xMono = ts.every((p, i) => !i || p[1] >= ts[i - 1][1]); out.cross = [0.5, 0.66, 0.97].map(cross); out.below = ts[ts.length - 1][2]; const sp = i => Math.hypot(ts[i + 1][1] - ts[i][1], ts[i + 1][2] - ts[i][2]); out.accel = sp(ts.length - 3) / sp(5); return out; }""")
    need(30 < r["total"] < 42, f"the story intro should run ~37 s: {r}")
    need(r["flash"] > 200 and r["black"] < 5 and r["lateBlack"] < 5 and r["strike"] > r["black"] + 3 and r["cut"] > r["black"], f"white flash, black (no run-up of strikes), one lightning as Id|le is cut, then the logo: {r}")
    need(r["legs"] == 0, f"no creature in the Id|le title (Nico): the leg code drew {r['legs']} times from the cut on")
    need(set(r["protosRun"]) == {"log", "samples", "gpu"} and r["protosAfter"] == 0, f"tiny proto-creatures only during the run (log, samples, GPU), none after the crash: {r['protosRun']}, after {r['protosAfter']}")
    need(r["refs"] == ["Project 23 (previous run)", "genius level", "conscious"], f"the reference lines: {r['refs']}")
    c = r["cross"]; need(c[0] and abs(c[0] - 12.8) < 1.2 and c[1] and abs(c[1] - 20.0) < 1.2 and c[2] and 25 <= c[2] <= 26.6, f"the curve crosses Project 23 near 'it keeps learning' (12.8 s), genius near 'look at those losses' (20 s), conscious just before the vortex: {c}")
    need(r["xMono"] and r["below"] > 1.2 and r["accel"] > 4, f"it draws left to right, accelerates (×{r['accel']:.1f}) and ends below the floor: {r}")
    P.clean()
    return f"{r['total']:.1f} s; flash {r['flash']:.0f}, black {r['black']:.1f}, one strike at the cut {r['strike']:.1f}, logo {r['cut']:.1f}; the curve crosses Project 23 at {r['cross'][0]:.1f} s, genius at {r['cross'][1]:.1f} s, conscious at {r['cross'][2]:.1f} s, ×{r['accel']:.0f} faster at the end"


def t_boot_intro(P):
    """The terminal boot before Epoch 0 (idle-boot.js; Nico's boot-script.md): CRT, the globe of letters, the boot log, the login, the
    prompt and "run project 24", then the run inside labelled panes; the subtitles at least 1.4x the model's text (desktop and phone);
    ?intro=boot plays it, Esc skips the whole thing, and the boot is off when asked (play({ boot: false }), ?noboot)."""
    pg = P.open("/arena.html?fresh=1&test&nofirst5"); booted(pg)
    r = pg.evaluate("""async () => { const E = window.__epoch0, B = window.__termBoot; await E.loadBank(); await E.loadLoss();
      const ct = E.makeContent({ seed: 4 }); ct.boot = true; const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
      const at = T => { E.frame(ct, T, cv); const d = cv.getContext('2d').getImageData(0, 0, 640, 360).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 31) if (d[i] + d[i + 1] + d[i + 2] > 150) n++; return n; };
      const lit = {}; for (const T of [1.2, 4.5, 7.6, 10.2, B.dur + 6]) lit[T] = at(T);
      const m = [E.metrics(1280, 720, false, true), E.metrics(390, 844, true, true), E.metrics(1280, 720, false, false), E.metrics(390, 844, true, false)];
      const sc = E.makeContent({ seed: 4, story: true }); sc.boot = true; sc.arrive = true; const AR = B.arrive, C = AR.chat;
      const litA = T => { E.frame(sc, T, cv); const d = cv.getContext('2d').getImageData(0, 0, 640, 360).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 31) if (d[i] + d[i + 1] + d[i + 2] > 150) n++; return n; };
      const order = AR.scenes.messages[0] < AR.scenes.chat[0] && AR.scenes.chat[0] < AR.scenes.terminal[0] && C.note < C.open && C.open < C.dm && C.dm < C.close && AR.thread[AR.thread.length - 1].at < C.open;
      const lester = C.dm_lines.filter(l => l.who === 'lester').map(l => l.text), doc = C.dm_lines.filter(l => l.who === 'scientist').length, arrLit = [2, (C.open + C.dm) / 2, (C.dm + C.close) / 2].map(litA);
      const pb = E.makeContent({ seed: 4 }); pb.boot = true; const pc = document.createElement('canvas'); pc.width = 750; pc.height = 1334; E.frame(pb, B.clock.enter - 0.05, pc, { phone: true, scale: 2 }); const cmdX = B.lastCmd() ? B.lastCmd().x : null;
      return { dur: B.dur, total: E.total(ct), plain: E.total(E.makeContent({ seed: 4 })), lit, m, ev: B.events, want: [E.wantBoot({}), E.wantBoot({ boot: false }), E.wantBoot({ tone: 'boot' })],
        arr: AR.dur, stotal: E.total(sc), splain: E.total(E.makeContent({ seed: 4, story: true })), order, cmdX, thread: AR.thread.length, texts: AR.thread.map(m => m.text), noteMid: AR.thread[3].at < C.note && C.note < AR.thread[4].at && AR.closeMsgs > AR.thread[5].at,
        crit: [[1280, 720, false], [390, 844, true]].map(([w, h, ph]) => { const c = AR.critter(w, h, ph), inR = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h; return { endHidden: inR(c.end, c.chat), startOut: !inR(c.start, c.chat), d: c.d }; }), lester, doc, chans: C.channels, backlog: C.backlog.length, arrLit, aev: AR.events, warr: [E.wantArrive({}, true), E.wantArrive({}, false)] }; }""")
    need(10 <= r["dur"] <= 16, f"the boot should take 10-16 s: {r['dur']}"); need(abs(r["total"] - r["plain"] - r["dur"]) < 0.01, f"the run should follow the boot: {r}")
    need(all(v > 8 for v in r["lit"].values()), f"every stage of the boot should draw something: {r['lit']}")
    titles = r["m"][0]["titles"]
    need("TRAINING LOSS · project 24" in titles and "MODEL SAMPLE DIALOG OUTPUTS" in titles and len(titles) == 4, f"pane titles: {titles}")
    for m in r["m"]: need(m["subFz"] >= 1.4 * m["paneFz"], f"subtitles {m['subFz']}px vs the model's text {m['paneFz']}px (must be >= 1.4x)")
    need(r["want"] == [True, False, True], f"on localhost the boot plays unless play({{ boot: false }}): {r['want']}")
    # arriving at the lab (story v4): his computer: the messages thread, Lester's notification, labchat (channels, a backlog, the DM), then the terminal
    need(abs(r["stotal"] - r["splain"] - r["dur"] - r["arr"]) < 0.01, f"story: arrival + boot + run: {r['stotal']} vs {r['splain']} + {r['dur']} + {r['arr']}")
    need(r["warr"] == [True, False], f"the arrival plays in the story only (or ?intro=boot): {r['warr']}")
    need(r["noteMid"] and not any("arriving now" in t for t in r["texts"]) and "you're right, sometimes I worry too much 😅 - ok, gotta go" in r["texts"], f"v8 thread: Lester's notification after 'dinner at 7?', Doc's new reply, then Doc closes the messages: {r['texts']}")
    need(all(c["endHidden"] and c["startOut"] and 0.4 <= c["d"] <= 0.6 for c in r["crit"]), f"the tiny creature bolts from where the messages were and hides behind labchat (desktop, phone): {r['crit']}")
    need(r["order"] and r["thread"] == 6 and r["doc"] == 3 and r["lester"][1:] == ["anytime, doc. 23 was… something", "I'll keep a hand on the breaker this time", "good luck, doc"], f"messages, then labchat and the DM with Lester, then the terminal: {r}")
    need({"training-runs", "experiments", "evals", "cluster-admin", "random"} <= set(r["chans"]) and r["backlog"] >= 3, f"labchat's channels and a backlog: {r['chans']}")
    need(all(n > 8 for n in r["arrLit"]) and 33 <= r["arr"] <= 46, f"the desktop draws in every part, ~40 s: {r['arrLit']}, {r['arr']}")
    need(r["cmdX"] is not None and r["cmdX"] <= 371, f"on a 375-wide phone the typed command must stay on screen: ends at {r['cmdX']}")
    need(all(m["sciY"] == (720 if i % 2 == 0 else 844) / 2 for i, m in enumerate(r["m"])), "the scientist's subtitles should be in the middle of the screen")
    pg2 = P.open("/arena.html?intro=boot&fresh=1&test&nofirst5")
    wait_for(pg2, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.boot === '1' && window.__epoch0.time() > 2", 30, P=P)
    pg2.wait_for_timeout(1500)
    lit = pg2.evaluate("""() => { const c = document.querySelector('#idleIntro canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 53) if (d[i] + d[i + 1] + d[i + 2] > 150) n++; return n; }""")
    need(lit > 20, f"the boot log should be on screen ({lit} lit samples)")
    pg2.evaluate("() => { window.__t_r = null; window.__epoch0.play().then(x => window.__t_r = x); }")
    pg2.keyboard.press("Escape"); res = wait_for(pg2, "() => window.__t_r", 5, P=P)
    need(res.get("skipped") is True and res.get("boot") is True, f"Esc should skip the boot and the run: {res}")
    pg3 = P.open("/arena.html?intro=0&noboot&fresh=1&test&nofirst5"); booted(pg3)
    need(pg3.evaluate("() => window.__epoch0.wantBoot({})") is False, "?noboot should skip the boot")
    P.clean()
    d, p = r["m"][0], r["m"][1]
    return f"arrival {r['arr']:.1f} s (messages → labchat → DM with Lester, 3 + 4 lines → terminal; {r['aev']} sounds); boot {r['dur']:.1f} s + run = {r['total']:.1f} s (story {r['stotal']:.1f} s); 4 labelled panes; subtitles {d['subFz']}px vs {d['paneFz']}px (phone {p['subFz']} vs {p['paneFz']}); ?intro=boot plays, Esc skips, ?noboot off; {r['ev']} sounds"


def t_story_landing(P):
    """The storyline's dark landing with no input (v4): the real view, very dark, no creatures, a far black hole with letters swirling in; your
    7 lines one by one in the middle, then the Operator arrives (Id and le fold into its window) and pings: the rings outline the hole's letters.
    Lights on lifts the dark; still no creatures until life."""
    pg = P.open("/arena.html?story&test")
    wait_for(pg, "() => !!(window.__epoch0 && window.__epoch0.last)", 40, P=P)
    pg.keyboard.press("Escape")
    wait_for(pg, "() => window.__genesis.landing().phase === 'dark' && !!window.__genesis.landing().line", 10, P=P)
    pg.wait_for_timeout(1200)
    say = pg.evaluate("() => { const s = window.__termBoot.arrive.lastSay(); return s && { y: s.cy / s.H, who: s.who }; }")
    need(say and abs(say["y"] - 0.5) < 0.01 and say["who"] == "doc", f"your lines should be in the middle of the screen: {say}")
    rg = pg.evaluate("() => ({ ring: window.__genesis.landing().ring, hushed: window.__audio.hushed() })")
    need(rg["ring"] and rg["ring"].get("tried") and not rg["ring"].get("err"), f"the ringing must be attempted at the landing: {rg}")
    lnd = wait_for(pg, "() => window.__genesis.landing().phase !== 'dark' && window.__genesis.landing()", 35, P=P)
    need(lnd["why"] == "lines" and lnd["shown"] == 7 and 12 <= lnd["after"] <= 28, f"all 7 lines, then the Operator: {lnd}")
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "no creatures in the dark")
    son = wait_for(pg, "() => { const l = window.__genesis.landing(); return l.pings >= 2 && l.rimmed >= 1 && l; }", 15, P=P)
    wait_for(pg, "() => document.documentElement.classList.contains('gen-box')", 10, P=P)
    pg.click("#genConsole")
    wait_for(pg, "() => !!document.querySelector('#genConsole [data-gsay]:not([disabled])')", 40, P=P)
    pg.click("#genConsole [data-gsay]")
    wait_for(pg, "() => window.__genesis.cosmos().lit && !document.querySelector('#genNight')", 10, P=P)
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "lights on brings no creatures: life comes next")
    need(pg.evaluate("() => window.__audio.hushed()"), "still silent after lights on (until the music step)")
    pg.evaluate("() => window.__genesis.actions.music && window.__genesis.actions.music()"); pg.wait_for_timeout(500)
    need(not pg.evaluate("() => window.__audio.hushed()"), "the music step brings sound back")
    P.clean()
    return f"the dark for {lnd['after']:.1f} s (7 lines, centred, no creatures), the Operator arrived, {son['pings']} pings outlined {son['rimmed']} letters; lights on lifted the dark"


# never stuck (Nico hit it in ?story): close every guided widget, then a way out must be on screen and must work
CLOSE_ALL = """() => { const l = document.querySelector('#lab'); if (l && l.classList.contains('open')) document.querySelector('#lab-close').click();
  document.querySelectorAll('#genDay button.x, #genConsole button.x, #genFront button.x, #genDay .x').forEach(b => b.click());
  return { lab: !!(l && l.classList.contains('open')) }; }"""
WAY_OUT = """() => { const vis = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.3 && s.pointerEvents !== 'none' && r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const h = document.querySelector('#toHandle'), r = h && h.getBoundingClientRect(), top = h && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { handle: vis(h), onTop: !!(top && h.contains(top)), toggle: vis(document.querySelector('#lab-toggle')), calm: document.documentElement.classList.contains('gen-calm') }; }"""
def stuck_check(pg, P, where):
    pg.evaluate(CLOSE_ALL); pg.wait_for_timeout(900)
    w = pg.evaluate(WAY_OUT)
    need(w["handle"] and w["onTop"], f"{where}: with everything closed the Operator's creature must be visible and on top: {w}")
    pg.click("#toHandle")
    with contextlib.suppress(AssertionError): wait_for(pg, "() => +getComputedStyle(document.querySelector('#topbar')).opacity > 0.95", 4, P=P)   # the menus fade back in
    after = pg.evaluate("() => ({ lab: document.querySelector('#lab').classList.contains('open'), calm: document.documentElement.classList.contains('gen-calm'), top: getComputedStyle(document.querySelector('#topbar')).opacity })")
    need(after["lab"] and not after["calm"] and float(after["top"]) > 0.5, f"{where}: tapping it should reopen the Operator and bring the menus back: {after}")
    return w, after


def t_never_stuck(P):
    """Never stuck: in the guided start (menus hidden), close the Operator and every guided widget; the Operator's creature is on screen,
    on top of everything, and tapping it reopens the Operator and brings back the menus (⚙ included). With the window open it hides."""
    pg = P.open("/arena.html?genesis&start=guided&intro=0&test")
    wait_for(pg, "() => !!(window.__genesis && document.querySelector('#genConsole [data-gsay]'))", 40, P=P)
    pg.wait_for_timeout(900)
    need(pg.evaluate("() => document.querySelector('#toHandle').hidden"), "the creature should hide while the Operator's window is open")
    w, _ = stuck_check(pg, P, "guided start")
    need(pg.evaluate("() => document.querySelector('#toHandle').hidden"), "the creature should hide again once the window is open")
    P.clean()
    return f"closed everything in the guided start (menus hidden: {w['calm']}, Operator button visible: {w['toggle']}) → the creature on top → tap → Operator open, menus back"


# the Founder gift (idle-founder.js): an early world or a gift link → Nico's letter → the creature creator → one Founder per browser
FD_AUTOSAVED = "() => { try { return !!JSON.parse(localStorage.getItem('arena.autosave') || 'null'); } catch (e) { return false; } }"
FD_IN_SAVE = "() => { try { const a = JSON.parse(localStorage.getItem('arena.autosave') || 'null'); return !!(a && (a.residents || []).some(r => r.genome && r.genome.founder)); } catch (e) { return false; } }"
FD_ONE = "() => { const c = window.__arena.raw().find(x => x.g && x.g.founder); return c ? { name: c.name, badge: c.g.founder.badge, exps: c.g.founder.exps, via: c.g.founder.via, tree: (c.g.founder.lineage || []).length } : null; }"
def fd_creator_run(pg, P, name, badge):
    """in the open creator: experiments, a pick, a wild one, undo, another pick, a bad name, a good one, a badge, release"""
    pg.evaluate("() => window.__founder.test.experiment()"); pg.click('#founderLab .vars button[data-v="2"]')
    pg.evaluate("() => window.__founder.test.experiment(0.42)"); pg.click('#founderLab .vars button[data-v="0"]')
    s1 = pg.evaluate("() => window.__founder.test.state()")
    pg.click('#founderLab [data-f="undo"]'); s2 = pg.evaluate("() => window.__founder.test.state()")
    need(s1["hist"] == 2 and s2["hist"] == 1 and s2["gens"] == 2 and pg.evaluate("() => document.querySelectorAll('#founderLab .vars button').length") == 8, f"undo should take back the last pick and offer its 8 again: {s1['hist']}→{s2['hist']}, gens {s2['gens']}")
    pg.click('#founderLab .vars button[data-v="5"]'); pg.evaluate("() => window.__founder.test.experiment()"); pg.click('#founderLab .vars button[data-v="1"]')
    trees = pg.evaluate("() => document.querySelectorAll('#founderLab .tree .gen').length")
    bad = pg.evaluate("() => window.__founder.test.name('Fuckles')"); need(bool(bad), "a blocked name must be refused")
    pg.fill('#founderLab .name input', name); pg.click(f'#founderLab .badges [data-b="{badge}"]')
    st = pg.evaluate("() => window.__founder.test.state()")
    pg.click('#founderLab [data-f="release"]'); pg.wait_for_timeout(900)
    return st, trees

def t_founder(P):
    """Founder by an early world: a world, then (a launch date in the past) no offer; with the real dates the offer, Nico's letter, the
    creator (experiments, undo, the family tree, a name, a badge), release; a snapshot first, nothing lost, the badge on the card, a
    Founder can't be removed, it survives a reload and goes into snapshots, and a gift link later doesn't give a second one."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__arena.raw().length >= 8", 30)
    wait_for(pg, FD_AUTOSAVED, 40, P=P); pg.close()
    pg = P.open("/arena.html?founder&founder_before=2020-01-01&test"); booted(pg); pg.wait_for_timeout(3500)
    no = pg.evaluate("() => ({ offer: !!document.querySelector('#founderOffer'), e: window.__founder.eligible(), avail: window.__founder.available() })")
    need(not no["offer"] and not no["e"]["world"] and not no["avail"], f"a world newer than the launch is not a Founder: {no}"); pg.close()
    pg = P.open("/arena.html?founder&test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderOffer')", 20, P=P)
    before = pg.evaluate("() => ({ names: window.__arena.raw().map(c => c.name), snaps: JSON.parse(localStorage.getItem('arena.snaps') || '[]').length })")
    pg.click("#founderOffer .go"); wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 5, P=P)
    lt = pg.evaluate("() => ({ text: document.querySelector('#founderLetter .paper').innerText, draft: !!document.querySelector('#founderLetter .draft') })")
    need("— Nico" in lt["text"] and "before the story began" in lt["text"] and lt["draft"], f"the letter: {lt}")
    pg.click("#founderLetter .open"); wait_for(pg, "() => !!document.querySelector('#founderLab canvas.prev')", 5, P=P)
    st, trees = fd_creator_run(pg, P, "Nibbet Prime", "seed")
    need(trees >= 3, f"the family tree should show each generation: {trees}")
    one = pg.evaluate(FD_ONE)
    after = pg.evaluate("() => ({ names: window.__arena.raw().map(c => c.name), snaps: JSON.parse(localStorage.getItem('arena.snaps') || '[]'), card: (document.querySelector('#whisper .fbadge') || {}).textContent || '', shown: document.querySelector('#whisper').style.display, f: window.__funnel.reached(), lab: !!document.querySelector('#founderLab') })")
    need(one and one["name"] == "Nibbet Prime" and one["badge"] == "seed" and one["via"] == "world" and one["exps"] == 3 and one["tree"] >= 3, f"the Founder in the world: {one}")
    need(set(before["names"]) <= set(after["names"]) and len(after["names"]) == len(before["names"]) + 1, f"nothing lost, one more: {len(before['names'])} → {len(after['names'])}")
    need(len(after["snaps"]) == min(15, before["snaps"] + 1) and after["snaps"][-1]["name"].startswith("before the Founder"), f"a snapshot first: {before['snaps']} → {[s['name'] for s in after['snaps']][-2:]}")
    need("FOUNDER" in after["card"] and after["shown"] == "block" and not after["lab"], f"its card opens with the Founder mark: {after['card']!r}, {after['shown']}")
    need(all(k in after["f"] for k in ["fd_world", "fd_offer", "fd_letter", "fd_creator", "fd_exp1", "fd_released", "fd_badge_seed"]), f"the funnel: {after['f']}")
    pg.evaluate("() => { const c = window.__arena.raw().find(x => x.g.founder), b = document.createElement('button'); b.dataset.a = 'recall'; b.dataset.k = c.key; document.querySelector('#evo').appendChild(b); b.click(); b.remove(); }")
    need(pg.evaluate(FD_ONE) is not None, "a Founder must not be removable from the evolution panel")
    side = pg.evaluate("() => { window.__herd.toggle(true); const g = [...document.querySelectorAll('#herd h5.grp')].map(h => h.textContent.trim()); window.__herd.toggle(false); return g; }")
    need(side and "★ Founders" in side[0], f"the Founder is listed first in the creatures sidebar: {side[:3]}")
    pg.evaluate("() => window.__genHooks.snapshot('founder test')")
    need(pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('arena.snaps') || '[]').pop(); return (s.residents || []).some(r => r.genome && r.genome.founder && r.name === 'Nibbet Prime'); }"), "a new snapshot should carry the Founder")
    wait_for(pg, FD_IN_SAVE, 30, P=P); pg.close()
    pg = P.open("/arena.html?gift=founder&test"); booted(pg); pg.wait_for_timeout(3500)
    again = pg.evaluate(FD_ONE); dup = pg.evaluate("() => ({ letter: !!document.querySelector('#founderLetter'), lab: !!document.querySelector('#founderLab'), avail: window.__founder.available(), n: window.__arena.raw().filter(c => c.g.founder).length, toast: document.body.innerText.includes('You already have your Founder') })")
    need(again and again["name"] == "Nibbet Prime" and again["badge"] == "seed", f"the Founder survives a reload: {again}")
    need(not dup["letter"] and not dup["lab"] and not dup["avail"] and dup["n"] == 1 and dup["toast"], f"one Founder per browser, even with a gift link: {dup}")
    P.clean()
    return f"no offer for a later world; offer → letter (draft, signed) → 3 experiments, undo, {trees} generations → 'Nibbet Prime' with the seed badge; snapshot first, +1 creature, card mark, can't be removed, first in the sidebar, kept through a reload and in snapshots; a second gift link: refused"

def t_founder_link(P):
    """Founder by a gift link (a brand-new browser): the letter right away; an expired link shows a note and no letter"""
    pg = P.open("/arena.html?gift=founder&founder_now=2027-06-01&test")
    with contextlib.suppress(AssertionError): wait_for(pg, "() => document.body.innerText.includes('has expired')", 40, P=P)
    ex = pg.evaluate("() => ({ letter: !!document.querySelector('#founderLetter'), note: document.body.innerText.includes('has expired'), e: window.__founder.eligible() })")
    need(not ex["letter"] and ex["note"] and ex["e"]["expired"], f"an expired link: {ex}"); pg.close()
    pg = P.open("/arena.html?gift=founder&test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    need(pg.evaluate("() => window.__funnel.reached().includes('fd_link') && window.__founder.eligible().link"), "the link should be counted")
    P.clean()
    return "expired link: a note, no letter; a valid link: the letter right away"

def t_founder_personal(P):
    """a personal gift link: Nico's own letter (not the general draft), opened once (one claim), read again in the same browser, then the
    creator; in another browser the same link says it was already opened; an unknown link says it isn't valid"""
    gid = "abcdefghijklmnopqrstuvwx"; P.gifts[gid] = {"letter": "Hi Sam!\n\nThanks for the bug report on Halloween night.\nThis one is for you.", "claimed": False}
    pg = P.open(f"/arena.html?gift={gid}&test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    lt = pg.evaluate("() => ({ text: document.querySelector('#founderLetter .paper').innerText, draft: !!document.querySelector('#founderLetter .draft'), personal: document.querySelector('#founderLetter').dataset.personal, f: window.__funnel.reached() })")
    need("Hi Sam!" in lt["text"] and "Halloween night" in lt["text"] and "— Nico" in lt["text"] and not lt["draft"] and lt["personal"] == "1", f"the personal letter: {lt}")
    need("fd_personal" in lt["f"] and P.gifts[gid]["claims"] == 1, f"opened once: claims {P.gifts[gid].get('claims')}, funnel {lt['f']}")
    pg.click("#founderLetter .later"); pg.close()
    pg = P.open(f"/arena.html?gift={gid}&test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    need("Hi Sam!" in pg.evaluate("() => document.querySelector('#founderLetter .paper').innerText") and P.gifts[gid]["claims"] == 1, "the same browser reads it again, with no second claim")
    pg.click("#founderLetter .open"); wait_for(pg, "() => !!document.querySelector('#founderLab canvas.prev')", 5, P=P)
    pg.fill('#founderLab .name input', "Sam's Spark"); pg.click('#founderLab .badges [data-b="spark"]'); pg.click('#founderLab [data-f="release"]'); pg.wait_for_timeout(800)
    one = pg.evaluate(FD_ONE); need(one and one["name"] == "Sam's Spark" and one["via"] == "link", f"released: {one}")
    P.clean(); pg.close()
    ctx2 = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); P2 = Page(ctx2, P.base); P2.gifts = P.gifts
    try:
        pg2 = P2.open(f"/arena.html?gift={gid}&test")
        wait_for(pg2, "() => document.body.innerText.includes('already opened')", 40, P=P2)
        need(not pg2.evaluate("() => !!document.querySelector('#founderLetter')"), "another browser must not see the letter")
        pg2.close(); pg3 = P2.open("/arena.html?gift=zzzzzzzzzzzzzzzzzzzzzzzz&test")
        wait_for(pg3, "() => document.body.innerText.includes(\"isn't valid\")", 40, P=P2)
        P2.clean()
    finally:
        ctx2.close()
    return "Nico's letter (no draft mark), one claim, read again in the same browser → creator → 'Sam's Spark'; another browser: 'already opened'; an unknown id: 'isn't valid'"

def gift_tool_unit():
    """tools/gift.py against a stand-in for the KV namespace: a link with ≥ 96 random bits, the letter and a private label stored with a
    180-day expiry, list without letters, revoke"""
    sys.path.insert(0, os.path.join(ROOT, "tools")); import gift
    class FakeKV:
        def __init__(self): self.m, self.exp = {}, {}
        def put(self, k, v, expiration=None): self.m[k] = v; self.exp[k] = expiration
        def get(self, k): return self.m.get(k)
        def keys(self, prefix): return [{"name": k} for k in self.m if k.startswith(prefix)]
    kv = FakeKV(); t0 = 1_800_000_000
    gid, url = gift.create(kv, "Hi Sam!\n\nThank you.", "Sam from r/chile", staging=False, now=t0)
    rec = json.loads(kv.m["gift:" + gid])
    need(re.fullmatch(r"[a-z2-7]{24}", gid) and url == "https://id-le.com/?gift=" + gid, f"id/link: {gid} {url}")
    need(rec["letter"].startswith("Hi Sam!") and rec["label"] == "Sam from r/chile" and abs(kv.exp["gift:" + gid] - (t0 + 180 * 86400)) < 2, f"stored: {rec}, exp {kv.exp['gift:' + gid]}")
    gid2, url2 = gift.create(kv, "Another", "", staging=True, now=t0 + 5)
    need(url2.startswith("https://staging.id-le.com/?gift=") and gid2 != gid, "staging link / distinct ids")
    gs = gift.gifts(kv); need([g["id"] for g in gs] == [gid2, gid], f"newest first: {[g['id'] for g in gs]}")
    gift.revoke(kv, gid); need(json.loads(kv.m["gift:" + gid]).get("revoked"), "revoked")
    try:
        gift.create(kv, " ", "x"); raise AssertionError("an empty letter was accepted")
    except SystemExit:
        pass
    return f"link {url[:32]}…, 120-bit id, 180-day expiry, list newest first, revoke"


def t_founder_phone(P):
    """the creator on a 390×844 phone: no sideways scroll, the release button on screen, the whole flow works"""
    pg = P.open("/arena.html?gift=founder&test"); pg.set_viewport_size({"width": 390, "height": 844}); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    lw = pg.evaluate("() => { const r = document.querySelector('#founderLetter .paper').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; }")
    need(lw["l"] >= 0 and lw["r"] <= lw["w"] + 1, f"the letter fits: {lw}")
    pg.click("#founderLetter .open"); wait_for(pg, "() => !!document.querySelector('#founderLab canvas.prev')", 5, P=P)
    fit = pg.evaluate("() => { const L = document.querySelector('#founderLab'), g = document.querySelector('#founderLab .go').getBoundingClientRect(); return { sw: L.scrollWidth, cw: L.clientWidth, go: [g.top, g.bottom, g.left, g.right], w: innerWidth, h: innerHeight }; }")
    need(fit["sw"] <= fit["cw"] + 1 and fit["go"][1] <= fit["h"] and fit["go"][0] >= 0 and fit["go"][3] <= fit["w"], f"the creator on a phone: {fit}")
    st, _ = fd_creator_run(pg, P, "Pocket Founder", "pipe")
    one = pg.evaluate(FD_ONE); need(one and one["name"] == "Pocket Founder" and one["badge"] == "pipe" and one["via"] == "link", f"released from a phone: {one}")
    P.clean()
    return f"letter and creator fit 390 px (creator {fit['sw']}≤{fit['cw']} px wide, release button on screen); released 'Pocket Founder' (pipe)"


def t_title_card(P):
    """The story's first frame (release): ø Id|le OS, "press any key to start"; the film waits there; a key starts the desktop scene (and the
    sound); the funnel marks title → messages, and where it was skipped."""
    pg = P.open("/arena.html?story&test")
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    pg.wait_for_timeout(1200)
    w = pg.evaluate("() => ({ t: window.__epoch0.time(), waiting: window.__epoch0.waiting(), scene: window.__epoch0.scene(), f: window.__funnel.reached(), skip: !!document.querySelector('#idleIntro .skip') })")
    need(w["waiting"] and w["t"] < 0.05 and w["scene"] == "title" and "title" in w["f"] and w["skip"], f"the title card should wait, with skip visible: {w}")
    pg.keyboard.press("Enter")
    wait_for(pg, "() => !window.__epoch0.waiting() && window.__epoch0.time() > 1.5", 10, P=P)
    a = pg.evaluate("() => ({ title: document.querySelector('#idleIntro').dataset.title, scene: window.__epoch0.scene(), f: window.__funnel.reached() })")
    need(a["title"] == "0" and a["scene"] == "messages" and "messages" in a["f"], f"a key should start the desktop (messages): {a}")
    pg.keyboard.press("Escape")
    wait_for(pg, "() => window.__funnel.reached().includes('skip:messages')", 10, P=P)
    P.clean()
    return f"waits at the title ({w['t']:.2f} s), a key starts the messages, Esc marks skip:messages"


FONT_LAYOUT_JS = """async () => { await document.fonts.ready;
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const over = [...document.querySelectorAll('button, .chip, .pchip, #lab-head, #genConsole .gl')].filter(vis).filter(e => e.scrollWidth - e.clientWidth > 1).map(e => (e.id || e.className || e.tagName) + (e.id ? '' : ':' + (e.textContent || '').replace(/\\d+/g, '#').trim().slice(0, 18)));
  return { fam: getComputedStyle(document.body).fontFamily, f3: document.fonts.check('16px "Idle F3"'), page: document.documentElement.scrollWidth - innerWidth, over }; }"""


def _font_layout(P, w, h, mobile):
    """the same page with ?nofonts (the system fonts) and with Id|le's fonts: what overflows with the fonts that didn't before"""
    res = {}
    for q in ("nofonts&", ""):
        pg = P.open(f"/arena.html?{q}test"); pg.set_viewport_size({"width": w, "height": h}); booted(pg)
        with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__arena.raw().length >= 8", 30)
        pg.wait_for_timeout(1500)
        res[q or "fonts"] = pg.evaluate(FONT_LAYOUT_JS); pg.close()
    a, b = res["nofonts&"], res["fonts"]
    need(b["fam"].startswith('"Idle F3"') and b["f3"], f"the UI isn't in Id|le's font: {b['fam'][:60]}, loaded={b['f3']}")
    need(not a["fam"].startswith('"Idle'), f"?nofonts still uses Id|le's font: {a['fam'][:40]}")
    new = sorted(set(b["over"]) - set(a["over"]))
    need(b["page"] <= 1 and not new, f"{w}×{h}: overflow with the fonts: page {b['page']} px, newly clipped: {new[:6]}")
    return f"{w}×{h}: UI in Idle F3, no new overflow ({len(b['over'])} clipped with fonts, {len(a['over'])} without)"


def t_fonts(P):
    """Id|le's own typefaces (idle-fonts.js): the UI is set in f3, each creature family speaks in its own voice, the Operator and the Oracle
    get their faces, and nothing overflows that didn't overflow in the system fonts (desktop)."""
    note = _font_layout(P, 1400, 900, False)
    pg = P.open("/arena.html?test"); booted(pg)
    r = pg.evaluate("""async () => { await document.fonts.ready; const F = window.IDLE_FONTS, out = {};
      for (const k of Object.keys(F.fam)) { const b = document.createElement('div'); b.className = 'bubble'; b.dataset.f = k; document.body.appendChild(b); out[k] = getComputedStyle(b).fontFamily.split(',')[0]; b.remove(); }
      const lab = document.getElementById('lab'), sel = document.getElementById('ai-brain');
      return { fam: out, key: F.key({ g: { job: 'math' }, voiceKey: 'tok' }) + '/' + F.key({ g: { job: 'hoard' }, voiceKey: 'crawly' }), role: lab && lab.dataset.role, brain: sel && sel.value }; }""")
    want_fam = {"tok": "F6", "crawly": "F5", "architect": "F2", "debug": "F1", "math": "F8", "classify": "F4", "designer": "F7"}
    bad = {k: v for k, v in r["fam"].items() if want_fam[k] not in v}
    need(not bad and r["key"] == "math/crawly", f"creature voices: {r}")
    need(r["role"] == ("operator" if r["brain"] == "tiny" else "oracle"), f"the panel's role mark: {r}")
    P.clean()
    return note + "; 7 creature voices; panel marked " + str(r["role"])


def t_fonts_phone(P):
    """Id|le's fonts on a 390×844 phone: no new overflow in the bar, chips and panels."""
    note = _font_layout(P, 390, 844, True)
    P.clean()
    return note


def t_hint_phone(P):
    """On a 375×667 phone the intro's "hold to read" hint and skip › stay clear of the desktop's dock (drawn centred at the bottom, 178 px wide)."""
    pg = P.open("/arena.html?story&test"); pg.set_viewport_size({"width": 375, "height": 667})
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
    r = pg.evaluate("""() => { const W = innerWidth, H = innerHeight, dock = { l: W / 2 - 89, r: W / 2 + 89, t: H - 62, b: H - 10 }, hit = e => { const q = e.getBoundingClientRect(); return !(q.right <= dock.l || q.left >= dock.r || q.bottom <= dock.t || q.top >= dock.b); };
      const h = document.querySelector('#idleIntro .hint'), k = document.querySelector('#idleIntro .skip'); return { hint: hit(h), skip: hit(k), hv: getComputedStyle(h).display !== 'none' }; }""")
    need(not r["hint"] and not r["skip"] and r["hv"], f"the hint / skip overlap the dock at 375×667: {r}")
    pg.keyboard.press("Escape"); P.clean()
    return "hint and skip › clear of the dock at 375×667"


def t_story_arms(P):
    """The storyline A/B (off by default): a NEW browser with ?arm=story goes straight into the story (the title card); ?arm=current gets the
    starter world as now; a browser that already has a world keeps it, whatever its arm (returning players are never thrown into the story)."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    off = pg.evaluate("() => ({ ab: window.__genesis.ab, v: window.__genesis.variant(), gv: localStorage.getItem('idle.gv') })")
    need(off["ab"] == "off" and off["v"] is None and off["gv"] is None, f"the A/B ships off: {off}")
    wait_for(pg, "() => !!localStorage.getItem('arena.autosave')", 30, P=P)
    ret = P.open("/arena.html?arm=story&test"); booted(ret); ret.wait_for_timeout(3000)   # this browser has a world: it keeps it
    r = ret.evaluate("() => ({ intro: !!document.querySelector('#idleIntro'), void: !!window.__genesisVoid, c: window.__arena.raw().filter(c => !c.lab).length })")
    need(not r["intro"] and not r["void"] and r["c"] > 0, f"a returning browser in the story arm keeps its world: {r}")
    out = []
    for arm in ("story", "current"):   # new browsers: a fresh context each
        ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base)
        try:
            q = Q.open(f"/arena.html?arm={arm}&test")
            if arm == "story":
                wait_for(q, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40)
                st = q.evaluate("() => ({ v: window.__genesis.variant(), arm: window.__funnel.arm() })"); need(st == {"v": "story", "arm": "story"}, f"the story arm starts the story: {st}")
            else:
                booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
                cur = q.evaluate("() => ({ v: window.__genesis.variant(), intro: !!document.querySelector('#idleIntro'), void: !!window.__genesisVoid })")
                need(cur["v"] == "current" and not cur["intro"] and not cur["void"], f"the current arm keeps the starter world: {cur}")
            out.append(arm)
        finally:
            ctx.close()
    P.clean()
    return "off by default; returning browser keeps its world; new story arm → the title card; new current arm → the starter world"


def t_story_offer(P):
    """The storyline offer (returning players, the other arm): shown once per browser (remembered); accepting keeps the world as a snapshot
    and starts the story."""
    pg = P.open("/arena.html?fresh=1&test&offer"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#storyOffer')", 30, P=P)
    t = pg.inner_text("#storyOffer"); need("storyline mode" in t and "snapshot" in t, f"the offer: {t!r}")
    again = pg.evaluate("() => { document.querySelector('#storyOffer').remove(); return window.__genesis.offer(); }")
    need(again is False and pg.evaluate("() => localStorage.getItem('idle.storyOffer')") == "shown", "the offer must show once per browser")
    pg.evaluate("() => localStorage.removeItem('idle.storyOffer')"); pg.evaluate("() => window.__genesis.offer()")
    n0 = pg.evaluate("() => (JSON.parse(localStorage.getItem('arena.snaps') || '[]') || []).length")
    pg.click("#storyOffer .go")
    wait_for(pg, "() => !!document.querySelector('#idleIntro')", 20, P=P)
    n1 = pg.evaluate("() => (JSON.parse(localStorage.getItem('arena.snaps') || '[]') || []).length")
    f = pg.evaluate("() => ({ f: window.__funnel.reached(), o: localStorage.getItem('idle.storyOffer') })")
    need(n1 == n0 + 1 and "offer_shown" in f["f"] and "offer_accepted" in f["f"] and f["o"] == "accepted", f"accepting: a snapshot first, then the story: {n0}→{n1}, {f}")
    pg.keyboard.press("Escape"); P.clean()
    return f"shown once (remembered), accepted → snapshot ({n0}→{n1}) → the story"


def t_story_v6(P):
    """Story v6: ?intro=epoch0 is retired (it goes to the storyline); the logo keeps its pipe, cycling colours, then cuts to black; the
    'conscious' label is never under the dialog (desktop and phone); between the intro and the dark nothing of the world or the UI shows,
    frame by frame (~50 ms), only black for 1.5 s (with the ringing: sound still on), then silence."""
    old = P.open("/arena.html?intro=epoch0&test")
    wait_for(old, "() => !!(window.__genesis && window.__genesis.mode() === 'story')", 30, P=P)   # it went to ?story (which then drops its flag from the address)
    pg = P.open("/arena.html?fresh=1&test&nofirst5"); booted(pg)
    r = pg.evaluate("""async () => { const E = window.__epoch0; await E.loadBank(); await E.loadLoss(); const C = E.clock;
      const L = t => E.logoAt(t), cut = C.split + 0.95, out = { on: [L(cut + 0.5).on, L(cut + 5.0).on, L(cut + 5.5).on], cols: [L(cut + 1.2).colour, L(cut + 2.2).colour, L(cut + 3.0).colour] };
      const ct = E.makeContent({ seed: 2, story: true }); ct.boot = true; const B = window.__termBoot.dur, chk = (W, H, ph) => { const cv = document.createElement('canvas'); cv.width = W * (ph ? 2 : 1); cv.height = H * (ph ? 2 : 1);
        const res = []; for (const T of [24.5, 25.3, 26.1]) { E.frame(ct, B + T, cv, ph ? { phone: true, scale: 2 } : {}); const k = E.layoutCheck(); if (k.ref && k.band) res.push(!(k.band.y < k.ref.y + k.ref.h && k.band.y + k.band.h > k.ref.y)); } return res; };
      out.clear = { desktop: chk(1280, 720, false), phone: chk(390, 844, true) }; return out; }""")
    need(r["on"] == [True, True, False] and len(set(r["cols"])) == 3, f"the logo: the pipe stays ~3 s cycling colours, then black: {r}")
    need(all(r["clear"]["desktop"]) and len(r["clear"]["desktop"]) >= 2 and all(r["clear"]["phone"]) and len(r["clear"]["phone"]) >= 2, f"'conscious' must not be under the dialog band: {r['clear']}")
    # the transition, frame by frame: Esc from the title, then screenshots of the middle every ~50 ms
    st = P.open("/arena.html?story&test")
    wait_for(st, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    vw = st.viewport_size; clip = {"x": vw["width"] * 0.15, "y": vw["height"] * 0.15, "width": vw["width"] * 0.7, "height": vw["height"] * 0.7}
    st.keyboard.press("Escape"); t0 = time.time(); shots = []
    while time.time() - t0 < 2.6:
        shots.append((round(time.time() - t0, 2), base64.b64encode(st.screenshot(clip=clip)).decode()))
    early = st.evaluate("() => ({ hushed: window.__audio.hushed(), cover: !!document.querySelector('#genBlack') })")
    st.wait_for_timeout(2500); late = st.evaluate("() => window.__audio.hushed()")
    stats = st.evaluate("""async shots => { const out = []; for (const [t, b] of shots) { const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode(); const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 90); const d = g.getImageData(0, 0, 160, 90).data; let bright = 0, mx = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v > 170) bright++; mx = Math.max(mx, v); } out.push([t, bright / (d.length / 4), mx]); } return out; }""", shots)
    worst = max(stats, key=lambda x: x[1])
    need(worst[1] < 0.01, f"the world or the UI showed between the intro and the dark: {worst[1] * 100:.1f}% bright pixels at {worst[0]} s")
    black = [x for x in stats if 0.9 <= x[0] <= 1.6]
    need(black and all(x[2] < 25 for x in black), f"pitch black about a second after the intro: {black[:4]}")
    need(late, "silent after the ringing"); P.clean()
    return f"?intro=epoch0 → ?story; logo on ~3 s, cycling {r['cols']}, then black; 'conscious' clear of the dialog (desktop {len(r['clear']['desktop'])}, phone {len(r['clear']['phone'])} frames); {len(shots)} frames over the transition, ≤{worst[1] * 100:.2f}% bright, black from 0.9 s"


def t_prod_gates(P, root):
    """id-le.com (the production hostname, served from the build, nothing leaves the browser): the fonts and 🧪 tell the scientists are
    on; no boot or storyline intro, no storyline offer, no Storyline mode / Replay rows, no storyline in the chooser, no Founder gift
    (?gift=founder and personal links do nothing)"""
    P.base, P.root = "https://id-le.com", root
    pg = P.open("/arena.html?fresh=1"); booted(pg)
    pg.wait_for_timeout(22000)   # past the storyline offer's 20 s
    r = pg.evaluate("""async () => { await document.fonts.ready; return { host: location.hostname, live: window.__genesis.storyLive(), void: !!window.__genesisVoid,
      intro: !!document.querySelector('#idleIntro'), offer: !!document.querySelector('#storyOffer'), founder: window.__founder.available(),
      f3: document.fonts.check('16px "Idle F3"') || [...document.fonts].some(f => /F3/.test(f.family) && f.status === 'loaded'),
      ui: getComputedStyle(document.body).fontFamily.split(',')[0], sci: !!document.getElementById('oracleBtn') }; }""")
    need(r["host"] == "id-le.com" and not r["live"], f"not emulating production: {r}")
    need(not r["void"] and not r["intro"] and not r["offer"] and not r["founder"], f"story/offer/founder visible on production: {r}")
    need(r["f3"] and "F3" in r["ui"] and r["sci"], f"fonts or 🧪 missing on production: {r}")
    pg.evaluate("() => window.__settings.open()"); pg.wait_for_timeout(300); txt = pg.evaluate("() => document.body.innerText")
    pg.evaluate("() => window.__settings.close()")
    need("Tell the scientists" in txt and "Storyline mode" not in txt and "Replay the intro" not in txt and "Founder gift" not in txt, "⚙ rows on production: " + ", ".join(k for k in ("Tell the scientists", "Storyline mode", "Replay the intro", "Founder gift") if k in txt))
    # 🧪: sends (to the stub), the roadmap lists and votes once
    pg.evaluate("() => { window.__idle.cfg.helper = location.origin; document.getElementById('oracleBtn').click(); }"); pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('#oracle [data-kind=idea]').click()"); pg.fill("#oracle textarea", "prod gate check")
    pg.evaluate("() => document.querySelector('#oracle [data-a=send]').click()")
    wait_for(pg, "() => /🧪/.test((document.querySelector('#oracle .msg') || {}).textContent || '')", 10, P=P)
    pg.evaluate("() => document.querySelector('#oracle [data-tab=road]').click()")
    wait_for(pg, "() => document.querySelectorAll('#oracle .it').length === 2", 10, P=P)
    pg.evaluate("() => document.querySelector('#oracle [data-vote=mods]').click()"); pg.wait_for_timeout(500)
    need(len([k for k, _ in P.fb if k == "oracle"]) == 1 and len([k for k, _ in P.fb if k == "vote"]) == 1, f"🧪 sends/votes: {P.fb}")
    pg.evaluate("() => window.__feedback.close()")
    # the chooser (⚙ New consciousness): no storyline on production
    pg.evaluate("() => { window.__genesis.newUniverse(); }")
    wait_for(pg, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 30, P=P)
    ms = pg.evaluate("() => [...document.querySelectorAll('#genChoose button[data-m]')].map(b => b.dataset.m)")
    need(ms == ["free", "ready"], f"chooser on production: {ms}")
    pg.close()
    # gift links: nothing opens
    P.gifts["abcdefghijklmnopqrstuvwx"] = {"letter": "hi", "claimed": False}
    for q in ("gift=founder", "gift=abcdefghijklmnopqrstuvwx"):
        pg = P.open("/arena.html?" + q); booted(pg); pg.wait_for_timeout(6000)
        g = pg.evaluate("() => ({ letter: !!document.querySelector('#founderLetter'), e: window.__founder.eligible() })")
        need(not g["letter"] and not g["e"]["link"] and not g["e"]["personal"], f"?{q} on production: {g}"); pg.close()
    need(not P.outside or all("id-le.com" not in u for u in P.outside), f"requests left the stubs: {P.outside[:3]}")
    P.clean()
    return f"id-le.com: UI in {r['ui']}, 🧪 sent + voted, no intro/offer/story rows/storyline choice/Founder (link or personal)"


def t_chooser(P):
    """?genesis opens the chooser (Storyline · From scratch · A ready world); "From scratch" gives the free console with every chip."""
    pg = P.open("/arena.html?genesis&intro=0&test")
    wait_for(pg, "() => document.querySelectorAll('#genChoose button[data-m]').length === 3", 40, P=P)
    pg.click("#genChoose button[data-m='free']")
    wait_for(pg, "() => window.__genesis.mode() === 'free' && document.querySelectorAll('#genConsole [data-gen]').length >= 3", 20, P=P)
    st = pg.evaluate("() => ({ next: window.__genesis.next(), calm: document.documentElement.classList.contains('gen-calm'), chips: document.querySelectorAll('#genConsole [data-gen]').length })")
    need(st["next"] is None and not st["calm"], f"from scratch: no guide, the UI not hidden: {st}")
    P.clean()
    return f"3 choices; from scratch → {st['chips']} chips, no guide"


def t_genesis_phone(P):
    """Phones: the same guide, the Operator as a sheet, the phrase pre-filled but NOT focused (no keyboard), a big ▶ to say it."""
    pg = P.open("/arena.html?genesis&start=guided&intro=0&test"); pg.set_viewport_size({"width": 390, "height": 844})
    wait_for(pg, "() => !!(window.__genesis && document.querySelector('#genConsole [data-gsay]'))", 40, P=P)
    st = pg.evaluate("() => ({ coarse: matchMedia('(pointer: coarse)').matches, focus: (document.activeElement || {}).id, pre: document.getElementById('lab-text').value, say: !!document.querySelector('#genConsole .say'), label: document.querySelector('#genConsole [data-gsay]').textContent })")
    need(st["coarse"], f"the phone context should have a coarse pointer: {st}")
    need(st["focus"] != "lab-text" and st["pre"] == "let there be light" and st["say"] and st["label"].startswith("▶"), f"phones: pre-filled, not focused, a big ▶: {st}")
    pg.tap("#genConsole [data-gsay]"); wait_for(pg, "() => document.documentElement.classList.contains('gen-lit') && window.__genesis.next() === 'words'", 20, P=P)
    P.clean()
    return f"pre-filled, not focused, ▶ '{st['label']}' → light"


def t_halloween(P):
    pg = P.open("/arena.html?fresh=1&test&halloween"); booted(pg)
    wait_for(pg, "() => !!(window.__halloween && window.__halloween.on() && document.querySelector('#arena.hw'))", 30, P=P)
    pg.wait_for_timeout(5000)
    st = pg.evaluate("() => { const cs = window.__arena.raw().filter(c => !c.lab); window.__halloween.test.flock(); return { n: cs.length, dressed: cs.filter(c => c._hw).length, kinds: [...new Set(cs.map(c => c._hw).filter(Boolean))], ...window.__halloween.test.state() }; }")
    need(st["dressed"] == st["n"] and st["n"] > 0, f"not every creature is in costume: {st}")
    need(st["flocks"] >= 1, f"no bat flock: {st}")
    off = pg.evaluate("() => { window.__halloween.set(false); return { forced: window.__halloween.forced(), hw: !!document.querySelector('#arena.hw') }; }")
    need(off["forced"] and off["hw"], f"?halloween should keep the mode on: {off}")
    P.clean()
    return f"{st['n']} in costume ({', '.join(st['kinds'])}), {st['pumpkins']} pumpkins, bats flying"


WIKI_PAGE = {"title": "Halloween - Wikipedia", "url": "https://en.wikipedia.org/wiki/Halloween", "links": [], "ui": [],
             "images": ["https://upload.example/lantern.png", "https://upload.example/costumes.png", "https://upload.example/bonfire.png"],
             "credits": [{"file": "Lantern.png", "author": "Test Author", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "page": "https://commons.wikimedia.org/wiki/File:Lantern.png", "source": "Wikimedia Commons"},
                         {"file": "Costumes.png", "author": "Second Author", "license": "Public domain", "licenseUrl": "", "page": "https://commons.wikimedia.org/wiki/File:Costumes.png", "source": "Wikimedia Commons"}, None],
             "text": " ".join(["Halloween or Hallowe'en is a celebration observed in many countries on 31 October, the eve of the Western Christian feast of All Hallows' Day.",
                               "Popular activities include trick-or-treating, attending costume parties, carving pumpkins into jack-o'-lanterns, lighting bonfires, apple bobbing,",
                               "visiting haunted attractions, telling scary stories and watching horror films."] * 6)}
PNG = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGN4ViFHEmIY1TCqYfhqAADNKnwQbWjC+AAAAABJRU5ErkJggg=="


def t_wiki(P):
    # a shared Wikipedia world: from Gloamhold, a player with nothing of their own gets it grown at once, in Home, with its pictures,
    # a sign linking the article, Halloween on (a Halloween article), and the address cleaned (a reload must not feed it again)
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.evaluate("() => window.__places.go('keep')"); wait_for(pg, "() => window.__placeKind === 'keep'", 20, P=P); pg.wait_for_timeout(1500)
    # the test build has no helper: this page names the test server as its helper, whose /lab/fetch and /lab/img are stubbed
    pg.add_init_script("Object.defineProperty(window, 'IDLE_CFG', { value: { mode: 'static', helper: location.origin }, writable: false, configurable: false })")
    pg.goto(P.base + "/arena.html?test&wiki=Halloween", wait_until="load"); booted(pg)
    st = wait_for(pg, """() => { const imgs = [...document.querySelectorAll('#floor .thing canvas')].filter(c => c.width > 0).length, sign = document.querySelector('.wikisign');
        return window.__placeKind === 'home' && sign && imgs >= 2 ? { imgs, sign: sign.textContent, href: sign.href, hw: window.__halloween.forced(), url: location.search } : null; }""", 45, P=P)
    need("Halloween" in st["sign"] and st["href"].startswith("https://en.wikipedia.org/wiki/Halloween"), f"no sign for the article: {st}")
    need(st["hw"], "a Halloween article should turn Halloween mode on")
    need("wiki" not in st["url"], f"the address still carries the article: {st['url']}")
    # credits: a © on the credited pictures (not on the uncredited one), its tooltip names author and license, a click opens the card,
    # and the credit is saved with the picture (thingOut) and comes back with it (thingIn)
    cr = pg.evaluate("""async () => { const marks = [...document.querySelectorAll('#floor .thing .cr')], tips = marks.map(b => b.title);
        if (marks[0]) marks[0].click(); await new Promise(r => setTimeout(r, 200)); const pop = document.getElementById('crPop');
        const H = window.__collectHooks, L = window.__lakeHooks, t = L.things().find(x => x.credit && x.credit.author === 'Test Author'), o = t && H.thingOut(t);
        let back = null; if (o && H.thingIn) { const n = H.thingIn(o); back = n && n.credit ? n.credit.author : null; if (n && n.el) { n.el.remove(); L.things().splice(L.things().indexOf(n), 1); } }
        return { n: marks.length, tips, pop: pop && pop.style.display === 'block' ? pop.textContent : '', links: pop ? [...pop.querySelectorAll('a')].map(a => a.href) : [], saved: o && o.credit ? o.credit.author : null, back, sign: document.querySelector('.wikisign').title }; }""")
    need(cr["n"] == 2, f"expected a © on the 2 credited pictures, got {cr['n']}")
    need(any("Test Author" in t and "CC BY-SA 4.0" in t for t in cr["tips"]), f"© tooltips: {cr['tips']}")
    need("Test Author" in cr["pop"] and any(h.startswith("https://commons.wikimedia.org/wiki/File:") for h in cr["links"]), f"credit card: {cr['pop']} {cr['links']}")
    need(cr["saved"] == "Test Author", f"the credit isn't saved with the picture: {cr['saved']}")
    need(cr["back"] == "Test Author", f"a restored picture lost its credit: {cr['back']}")
    need("CC BY-SA 4.0" in cr["sign"], f"the sign's tooltip doesn't name the text license: {cr['sign']}")
    P.clean()
    return f"grew in Home from Gloamhold, {st['imgs']} pictures ({cr['n']} credited ©), sign '{st['sign'].strip()}', Halloween on"


HALLOWEEN_STUB = """(() => { if (window.__halloween) return; let on = true;   // until idle-halloween.js owns the switch, a stand-in that is on
  window.__halloween = { on: () => on, set: v => { on = !!v; dispatchEvent(new CustomEvent('idle:halloween', { detail: { on } })); }, onChange() {} }; })()"""


def t_treat(P):
    P.ctx.add_init_script(HALLOWEEN_STUB)
    P.ctx.add_init_script("try { if (!sessionStorage.getItem('t_hw')) { localStorage.setItem('idle.halloween', 'on'); sessionStorage.setItem('t_hw', '1'); } } catch (e) {}")   # on through the stored switch (not ?halloween, which set(false) cannot turn off)
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    need(pg.evaluate("() => !!(window.__halloween && window.__halloween.on())"), "?halloween did not turn the Halloween mode on")
    need(pg.evaluate("() => !!window.__treat"), "idle-treat.js did not load")
    t0 = time.time()
    while time.time() - t0 < 90 and pg.evaluate("() => window.__treat.state().treats") < 1:
        pg.evaluate("() => { window.__treat._recruit(); window.__treat.tick(); }"); pg.wait_for_timeout(1500); P.clean()
    s = pg.evaluate("() => window.__treat.state()")
    need(s["treats"] >= 1, f"no candy handed out in 90 s: {s}")
    pg.evaluate("() => window.__treat._edition()"); pg.wait_for_timeout(300)
    need(pg.evaluate("() => (window.__advisor ? window.__advisor.news() : []).some(n => /Halloween edition/.test(n.text))"), "no Halloween edition in the Gazette")
    pg.evaluate("() => window.__halloween.set ? window.__halloween.set(false) : window.__treat.cleanup()"); pg.wait_for_timeout(2500)
    left = pg.evaluate("() => ({ candy: window.__lakeHooks.words().filter(w => w.candy).length, tricks: document.querySelectorAll('#floor .trick-wobble,#floor .trick-hide,#floor .trick-swap').length, busy: window.__arena.raw().filter(c => c._treat).length })")
    need(not any(left.values()), f"turning Halloween off left things behind: {left}")
    P.clean()
    return f"{s['treats']} candies, {len(s['haul'])} trick-or-treaters; off leaves nothing behind"


def t_pedia_halloween(P, phone=False):
    # ?halloween forces the pedia's Halloween mode on any day: palette class, moon and bats in the header, the ribbon, and a costume
    # on every drawn creature (they ride on the game's own body drawing); ?halloween=0 forces it off, even on Oct 31
    pg = P.open("/pedia.html?halloween")
    wait_for(pg, "() => document.querySelectorAll('#toc a').length > 20", 30)
    need(pg.evaluate("() => document.documentElement.classList.contains('hw')"), "?halloween did not switch the pedia's Halloween mode on")
    need(pg.evaluate("() => !!document.querySelector('header .hwmoon') && document.querySelectorAll('header .hwbat').length >= 3"), "the moon and bats are missing from the header")
    need(pg.evaluate("() => getComputedStyle(document.getElementById('hwrib')).display !== 'none'"), "the Happy Halloween ribbon is not showing")
    need(pg.evaluate("() => !!document.querySelector('main .hwweb')"), "the cobweb is missing")
    wait_for(pg, "() => document.querySelectorAll('svg.live').length >= 5", 30)
    kinds = pg.evaluate("""async () => { const out = []; for (const s of document.querySelectorAll('svg.live')) { s.scrollIntoView({ block: 'center' });
        for (let k = 0; k < 20 && !s.querySelector('g.hwc'); k++) await new Promise(r => setTimeout(r, 100)); const c = s.querySelector('g.hwc'); out.push(c ? c.dataset.c : null); } scrollTo(0, 0); return out; }""")
    bare = [i for i, k in enumerate(kinds) if not k]
    need(not bare, f"{len(bare)} of {len(kinds)} pedia creatures have no costume")
    if phone:
        sw = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
        need(sw <= 1, f"sideways scroll of {sw}px at phone width in Halloween mode")
    P.clean("halloween pedia")   # before the next page: its first navigation clears what this one collected
    off = P.open("/pedia.html?halloween=0")
    wait_for(off, "() => document.querySelectorAll('#toc a').length > 20", 30)
    need(not off.evaluate("() => document.documentElement.classList.contains('hw') || !!document.querySelector('g.hwc')"), "?halloween=0 left the Halloween mode on")
    P.clean()
    return f"{len(kinds)} creatures in costume ({', '.join(sorted(set(kinds)))})"


def t_zoom_shapes(P):
    """phones zoom the floor with CSS zoom; with iOS Safari's minimum font size simulated, charts, forms and objects must keep their
    shape zoomed out (they got skinnier) and keep their text inside them (it spilled out): tools/check_zoom_shapes.py, as a check"""
    from check_zoom_shapes import SIM, ASPECTS, SPILL
    P.ctx.add_init_script(SIM)
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    if not pg.evaluate("'zoom' in document.documentElement.style"): return "this WebKit has no CSS zoom: nothing to check"
    wait_for(pg, "() => document.querySelectorAll('#floor .design, #floor .thing').length > 0", 60)
    pg.evaluate("__arena.cam(1600, 1100, 1)"); pg.wait_for_timeout(800)
    base = pg.evaluate(ASPECTS); need(base, "no charts, forms or objects on the starter floor")
    ref = sum(x[1] for x in base) / len(base); seen = []
    for z in (0.5, 0.35, 1):
        pg.evaluate(f"__arena.cam(1600, 1100, {z})"); pg.wait_for_timeout(800)
        now = pg.evaluate(ASPECTS); m = sum(x[1] for x in now) / len(now)
        need(abs(m / ref - 1) <= 0.05, f"at {z:.0%} the cards' mean shape is {m:.3f}, at 100% {ref:.3f}")
        cards, n, worst = pg.evaluate(SPILL)
        need(n == 0, f"at {z:.0%}, {n} pieces of text spill out of {cards} cards (worst {worst:.0%} of a card's width)")
        seen.append(f"{z:.0%} ok")
    P.clean()
    return f"{len(base)} cards keep shape and text: " + ", ".join(seen)


def t_fps(P, n=300, floor=20):
    pg = P.open("/arena.html?fresh=1&test&bench"); booted(pg)
    pg.evaluate(f"() => window.__bench.spawn({n})"); pg.wait_for_timeout(6000)
    fps = wait_for(pg, "() => window.__fps && window.__fps.fps", 20)
    samples = []
    for _ in range(5): pg.wait_for_timeout(1000); samples.append(pg.evaluate("() => window.__fps.fps"))
    avg = sum(samples) / len(samples)
    need(avg >= floor, f"{avg:.1f} fps with {n} extra creatures (floor {floor})")
    return f"{avg:.1f} fps with {n} extra creatures"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--full", action="store_true"); ap.add_argument("-k", default=""); ap.add_argument("--dist", default=""); ap.add_argument("--keep", action="store_true")
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args(); t0 = time.time()
    want = lambda name: a.k.lower() in name.lower()
    print("static checks")
    if want("js syntax"): check("js syntax", js_syntax)
    if want("conflict markers"): check("conflict markers", no_conflict_markers)
    if want("fontgen"): check("fontgen", fontgen_round)
    if want("gift tool"): check("gift tool: personal gift links", gift_tool_unit)
    if want("worker"): check("worker: stats, jeffy allowlist, world links, rate limit", worker_unit)
    if want("pages"): check("pages: server-side page views, visitors, bots", pages_unit)
    if want("local server"): check("local server: server.py, the Operator line", local_server_unit)
    browser_names = ["op actions", "crash guard", "clicks", "genesis", "genesis phone", "story", "story v6", "title card", "hint phone", "story arms", "story offer", "never stuck", "founder", "founder link", "founder personal", "founder phone", "story landing", "story intro", "boot intro", "chooser", "fresh load", "fresh slow", "camera desktop", "panels", "sound", "haunted music", "operator", "tiny genesis", "stats", "stats v2", "op stats", "pedia stats", "data lab", "data lab stuck", "data lab home", "mood migrate", "lab card", "irc inbox", "oracle", "quick commands", "right-click", "halloween light", "intro", "intro reduced", "intro epoch0", "replay", "halloween", "trick or treat", "wikipedia world", "pedia desktop", "pedia halloween", "camera phone", "zoom shapes phone", "lab card phone", "pedia phone", "pedia halloween phone", "fonts", "fonts phone", "prod gates", "fps"]
    if not any(want(n) for n in browser_names): return report(t0)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  FAIL  playwright is not installed (pip install playwright; playwright install chromium webkit)"); RESULTS.append(("playwright", False, "missing", 0)); return report(t0)
    out = a.dist or tempfile.mkdtemp(prefix="idle-dist-")
    try:
        if not a.dist:
            print("building", out); check("static build", build, out)
        srv, base = serve(out)
        print("browser checks at", base)
        with browser_lock(), sync_playwright() as p:
            ch = p.chromium.launch(headless=not a.headed, args=["--autoplay-policy=no-user-gesture-required"])
            try:
                def run(name, fn, *args, **ctxkw):
                    if not want(name): return
                    ctx = ch.new_context(viewport={"width": 1400, "height": 900}, **ctxkw); P = Page(ctx, base)
                    try: check(name, fn, P, *args)
                    finally: ctx.close()
                run("fresh load", t_fresh_load)
                run("fresh slow", t_fresh_slow)
                run("crash guard", t_crash_guard)
                run("camera desktop", t_camera)
                run("panels", t_panels)
                run("sound", t_sound)
                run("haunted music", t_haunted)
                run("stats", t_stats)
                run("stats v2", t_stats_v2)
                run("op stats", t_op_stats)
                run("op actions", t_op_actions)
                run("pedia stats", t_pedia_stats)
                run("data lab", t_datalab, 90 if a.full else 45)
                run("data lab stuck", t_datalab_stuck)
                run("data lab home", t_datalab_home)
                run("mood migrate", t_mood_migrate)
                run("lab card", t_lab_card)
                run("irc inbox", t_irc_inbox)
                run("oracle", t_oracle)
                run("quick commands", t_quick)
                run("right-click", t_rclick)
                run("clicks", t_clicks)
                run("replay", t_replay)
                run("operator", t_operator)
                run("tiny genesis", t_tiny_genesis)
                run("halloween", t_halloween)
                run("halloween light", t_halloween_light, color_scheme="light")
                run("intro", t_intro)
                run("intro reduced", t_intro_reduced, reduced_motion="reduce")
                run("intro epoch0", t_intro_epoch0)
                run("trick or treat", t_treat)
                run("wikipedia world", t_wiki)
                run("genesis", t_genesis)
                run("story", t_story)
                run("story v6", t_story_v6)
                run("title card", t_title_card)
                run("hint phone", t_hint_phone)
                run("story arms", t_story_arms)
                run("story offer", t_story_offer)
                run("never stuck", t_never_stuck)
                run("founder", t_founder)
                run("founder link", t_founder_link)
                run("founder personal", t_founder_personal)
                run("founder phone", t_founder_phone, is_mobile=True, has_touch=True)
                run("story landing", t_story_landing)
                run("story intro", t_story_intro)
                run("boot intro", t_boot_intro)
                run("chooser", t_chooser)
                run("genesis phone", t_genesis_phone, is_mobile=True, has_touch=True)
                run("pedia desktop", t_pedia)
                run("pedia halloween", t_pedia_halloween)
                run("fonts", t_fonts)
                run("fonts phone", t_fonts_phone, is_mobile=True, has_touch=True)
                run("prod gates", t_prod_gates, out, service_workers="block")
                if a.full: run("fps", t_fps)
            finally:
                ch.close()
            if any(want(n) for n in ("camera phone", "zoom shapes phone", "pedia phone", "pedia halloween phone", "lab card phone")):
                wk = p.webkit.launch(headless=not a.headed)
                try:
                    dev = p.devices["iPhone 12 Mini"] if "iPhone 12 Mini" in p.devices else p.devices["iPhone 12"]
                    for name, fn, kw in (("camera phone", t_camera, {"phone": True}), ("zoom shapes phone", t_zoom_shapes, {}), ("lab card phone", t_lab_card, {"phone": True}), ("pedia phone", t_pedia, {"phone": True}), ("pedia halloween phone", t_pedia_halloween, {"phone": True})):
                        if not want(name): continue
                        ctx = wk.new_context(**dev); P = Page(ctx, base)
                        try: check(name, lambda P=P, fn=fn, kw=kw: fn(P, **kw))
                        finally: ctx.close()
                finally:
                    wk.close()
        srv.shutdown()
    finally:
        if not a.dist and not a.keep: shutil.rmtree(out, ignore_errors=True)
    return report(t0)


def report(t0):
    bad = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} passed in {time.time() - t0:.0f}s")
    for n, _, msg, _ in bad: print(f"  FAIL  {n}: {msg}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
