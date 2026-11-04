"""Id|le regression checks: a static build in real browsers, plus the helper Worker and every script's syntax.

    python3 tools/test_smoke.py            # everything (the full tier), in parallel browser workers
    python3 tools/test_smoke.py -t launch  # the launch tier (~3 min): what a deploy to id-le.com needs
    python3 tools/test_smoke.py -k camera  # only the checks whose name contains "camera"
    python3 tools/test_smoke.py -j 1       # one browser worker (the old way); -j 4 four; default: from the load (1-6), or IDLE_TEST_JOBS
    python3 tools/test_smoke.py --timescale 1   # run the sped-up checks (SCALED) in real time too (default 5×, or IDLE_TIMESCALE)
    python3 tools/test_smoke.py --full     # also a frame-rate floor with 300 creatures and a longer data lab run
    python3 tools/test_smoke.py --dist dist --keep   # reuse an existing build; keep the temporary build

Speed (Nov 4): each browser check runs in its own worker process (its own server port, browser and storage), slowest first (last run's
times in $TMPDIR/idle-test-times.json), as many at once as the load allows. Browser slots are shared by every checkout on this Mac:
/private/tmp/claude-501/idle-browser.lock and .1 … .5, each naming its owner's pid (a dead owner's slot is freed). Checks listed in
SCALED open the page with ?timescale=N: the page's own clock (timers, performance.now, Date.now, animation frames) runs N× faster.
Checks that assert real durations or sounds scheduled on the audio clock stay at 1×.

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


REVIEW_STUB = {"logos": {"kind": "logos", "title": "the logo", "items": ["c3-typed-dust", "c3-typed-crt", "a3-dust", "b3a-dust-crt", "b3b-crt", "scope-strike", "scope-crt", "typed-scope", "scope-meter", "scope-shockwave", "strike-purr-static", "crt-off"], "stage": "team", "team": "loop", "showTotals": False, "open": True},
               "fonts": {"kind": "fonts", "title": "our fonts", "items": ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"], "stage": "team", "team": "loop", "showTotals": False, "open": True}}
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
await post('/lab/stats', { v: 1, bi: 2, x: { ws: { reel: -5, dream: 1.5, mind: 99999999 }, did: ['quick_exit', 'ni_seen'] }, path: 'card>studio>reels', path0: 'card>studio', eg: { errs: '1' }, eg0: { errs: '0' } });
await post('/lab/stats', { v: 1, path: 'card>card', x: { ct: { op: 9999 } } });
await post('/lab/stats', { v: 1, bi: 7, x: {} }); await post('/lab/stats', { v: 1, bi: 9999 }); await post('/lab/stats', { v: 1, bi: 'x' });
await post('/lab/stats', { v: 1, path: 'card>studio>reels>music' });
// the Operator (11-01): only fixed keys, small positive integers; text-like keys and junk dropped; op flags once
await post('/lab/stats', { v: 1, x: { op: { 'out:acted': 3, 'out:unsure': 1, 'opt:light': 2, 'cf:hi': 3, 'fr:rephrase': 1, 'mood:negative': 1, 'mm:negative': 1, 'gd:light': 1, 'gt:light': 2, 'gn:light': 1, 'text:make it rain': 1, 'opt:rm -rf': 1, 'out:acted ': 1, 'fr:caps': -2, 'cf:lo': 1.5 }, did: ['op_miss', 'op_rephrase', 'op_secret'] } });
// many distinct favorites from many page loads: capped, the rest counted as 'other'
for (let i = 0; i < 70; i++) await post('/lab/stats', { v: 1, x: { fav: { ['name:Zz' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))]: 1 } } });
// our own checks (an internal campaign tag): the page's reports go to 'int', never into the totals (its visit, time and features stay out)
await post('/lab/stats', { v: 1, visit: 1, dev: 'desktop', ref: 'direct', utm: 'prod-check', dw: '<1', feat: ['music'] });
await post('/lab/stats', { v: 1, u: 'prod-check', dw: '1-5', dw0: '<1', feat: ['music'] });
out.bad_format = (await post('/lab/stats', { v: 2 })).status;
out.too_big = (await go('/lab/stats', { method: 'POST', body: 'x'.repeat(9000) })).status;
const days = [...env.STATS.m.values()].map(v => JSON.parse(v));
out.stats = days.reduce((a, d) => { for (const k of ['visits', 'dev', 'ref', 'utm', 'dw', 'fl', 'feat']) a[k] = typeof d[k] === 'number' ? (a[k] || 0) + d[k] : { ...(a[k] || {}), ...d[k] }; return a; }, {});
out.stat_keys = [...new Set(days.flatMap(d => Object.keys(d)))].sort();
out.int = days.reduce((a, d) => { const q = d.int || {}; a.r += q.r || 0; a.v += q.v || 0; for (const [k, n] of Object.entries(q.t || {})) a.t[k] = (a.t[k] || 0) + n; return a; }, { r: 0, v: 0, t: {} });
out.bi = days.reduce((a, d) => { for (const [k, n] of Object.entries(d.bi || {})) a[k] = (a[k] || 0) + n; return a; }, {});
out.eg = days.reduce((a, d) => { for (const [k, n] of Object.entries(d.eg || {})) a[k] = (a[k] || 0) + n; return a; }, {}); out.secs = days.reduce((a, d) => a + (d.secs || 0), 0);
out.pd = days.map(d => d.pd).filter(Boolean).reduce((a, q) => ({ visits: a.visits + q.visits, clips: a.clips + q.clips, dw: { ...a.dw, ...q.dw }, sec: { ...a.sec, ...q.sec }, ref: { ...a.ref, ...q.ref } }), { visits: 0, clips: 0, dw: {}, sec: {}, ref: {} }); out.err_all = days.reduce((a, d) => ({ ...a, ...(d.err || {}) }), {});
// a lone report, with no later request to that isolate, must still be written (the 2-min buffer of 11-01 lost these: 180 received, 50 stored)
{ globalThis.__statFlushNow = false; const before = env.STATS.puts.length; await post('/lab/stats', { v: 1, feat: ['lonetest'] }); out.lone_report_written = env.STATS.puts.length > before; globalThis.__statFlushNow = true; }
// the arm beacon (Nov 4): { v, aa, u } counts arm_assigned per arm, nothing else; our own checks' beacons go to int.aa; unknown arms dropped
{ const b0 = [...env.STATS.m.values()].map(v => JSON.parse(v)).reduce((a, d) => a + (d.batches || 0), 0);
  for (const a of ['story', 'choose', 'play', 'play', 'evil']) await post('/lab/p', { v: 1, aa: a }); await post('/lab/p', { v: 1, aa: 'play', u: 'launch-check' });
  const ds = [...env.STATS.m.values()].map(v => JSON.parse(v)); out.aa = ds.reduce((a, d) => { for (const [k, n] of Object.entries(d.aa || {})) a[k] = (a[k] || 0) + n; return a; }, {});
  out.aaInt = ds.reduce((a, d) => { for (const [k, n] of Object.entries((d.int || {}).aa || {})) a[k] = (a[k] || 0) + n; return a; }, {});
  out.aaBatches = ds.reduce((a, d) => a + (d.batches || 0), 0) - b0; }
// /lab/p: the same reports under a plain name; a visit from a v2 page counts in v2visits (engagement v2's own denominator)
{ out.labp = (await post('/lab/p', { v: 1, visit: 1, v2: 1, dev: 'desktop' })).status; out.v2visits = [...env.STATS.m.values()].map(v => JSON.parse(v)).reduce((a, d) => a + (d.v2visits || 0), 0); }
// the storyline funnel (11-02): known moments only, counted by arm; the arm's visits and dwell under gv
{ await post('/lab/p', { v: 1, visit: 1, gv: 'story', sf: ['title', 'messages', 'skip:chat', 'evil<script>', 'title'], dw: '1-5' }); await post('/lab/p', { v: 1, sf: ['offer_shown', 'offer_accepted', 'fd_link', 'fd_badge_pipe', 'fd_badge_evil'] }); await post('/lab/p', { v: 1, lg: 'crt', sf: ['lg_shown:crt', 'landing', 'title'] }); await post('/lab/p', { v: 1, lg: 'evil', sf: ['lights'] });
  const ds = [...env.STATS.m.values()].map(v => JSON.parse(v)); out.sf = ds.reduce((a, d) => { for (const [k, n] of Object.entries(d.sf || {})) a[k] = (a[k] || 0) + n; return a; }, {});
  out.gv_story = ds.reduce((a, d) => { for (const [k, n] of Object.entries(d.gv || {})) a[k] = (a[k] || 0) + n; return a; }, {}); }
// time per step and coming back (Nov 3): known moments only, seconds bucketed with a sum per arm; return buckets by arm|cohort|bucket, junk dropped
{ const today = new Date().toISOString().slice(0, 10), future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await post('/lab/p', { v: 1, gv: 'story', sd: { lights: 25, words: 5, 'evil<x>': 3, e1life: -4, e1words: 4, title: 99999 } }); await post('/lab/p', { v: 1, gv: 'story', sd: { lights: 700 } });
  await post('/lab/p', { v: 1, gv: 'story', lg: 'c3', rb: { c: today, b: 'd0' } }); await post('/lab/p', { v: 1, rb: { c: '2026-11-01', b: 'd1' } });
  await post('/lab/p', { v: 1, rb: { c: future, b: 'd1' } }); await post('/lab/p', { v: 1, rb: { c: today, b: 'd9' } }); await post('/lab/p', { v: 1, rb: { c: 'x<y>', b: 'd0' } });
  const ds = [...env.STATS.m.values()].map(v => JSON.parse(v)); out.sd = {}; out.rb = {};
  for (const d of ds) { for (const [k, x] of Object.entries(d.sd || {})) { const c = out.sd[k] = out.sd[k] || { n: 0, sum: 0, b: {} }; c.n += x.n; c.sum += x.sum; for (const [b, n] of Object.entries(x.b)) c.b[b] = (c.b[b] || 0) + n; }
    for (const [k, n] of Object.entries(d.rb || {})) out.rb[k] = (out.rb[k] || 0) + n; }
  out.rbToday = today; }
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
// presence (11-03): beats from fixed lists only, held in memory (no KV write), dropped 60 s after the last beat, "bye" removes at once;
// the creator's view needs the key (404 otherwise); the kill switch (PRESENCE_ON=0) accepts beats and drops them
{ const M = await import(process.argv[2]); const P = {};
  const id1 = 'a1b2c3d4e5f60718', id2 = '0011223344556677', puts0 = env.STATS.puts.length + env.WORLDS.puts.length;
  const beat = (b, ip = '4.4.4.4') => go('/lab/here', { method: 'POST', body: JSON.stringify(b) }, ip);
  env.PRESENCE_ON = '0'; P.prod = (await beat({ v: 1, id: id1, dev: 'desktop', mode: 'world' })).status; delete env.PRESENCE_ON;   // the kill switch
  env.LIVE_KEY = 'k'.repeat(40);
  const live = async (k) => go('/lab/live', k === undefined ? {} : { headers: { 'CF-Connecting-IP': '4.4.4.4', Authorization: 'Bearer ' + k } });
  P.view_before_prod_beat = (await (await live('k'.repeat(40))).json()).online;
  P.b1 = await (await beat({ v: 1, id: id1, dev: 'phone', mode: 'story', arm: 'story', step: 'words', ep: 0, p: ['operator', 'evil', 'card', 'operator'], cr: '0-12', t: 42.4, back: 1, text: 'hello world', name: 'Doc' })).json();
  P.b2 = await (await beat({ v: 1, id: id2, dev: 'toaster', mode: 'hack', step: 'words', ep: 3, p: 'music', cr: 'lots', t: -5 })).json();
  P.bad = await (await beat({ v: 1, id: 'not-hex' })).json();
  P.big = (await go('/lab/here', { method: 'POST', body: 'x'.repeat(800) })).status;
  // where they came from: a site's name only (never a path or a query), a cleaned campaign tag, the page; anything else falls back
  const id3 = 'ffeeddccbbaa9988', id4 = '1234567890abcdef', id5 = 'abcdefabcdefabcd';
  await beat({ v: 1, id: id3, page: 'pedia', mode: 'world', ref: 'news.ycombinator.com', tag: 'hn-test' });
  await beat({ v: 1, id: id4, page: 'admin', mode: 'world', ref: 'evil.com/path?q=secret', tag: 'Bad Tag!' });
  await beat({ v: 1, id: id5, mode: 'world', ref: 'a'.repeat(61) + '.com', tag: 'x'.repeat(25) });
  { const w = await (await live('k'.repeat(40))).json(), f = a => w.players.find(x => x.a === a.slice(0, 6));
    P.ref3 = f(id3); P.ref4 = f(id4); P.ref5 = f(id5); P.ref_tot = w.tot.ref; P.page_tot = w.tot.page; P.ref_leak = /path|secret|Bad Tag/.test(JSON.stringify(w));
    for (const i of [id3, id4, id5]) await beat({ v: 1, id: i, bye: 1 }); }
  { const k0 = env.LIVE_KEY; env.LIVE_KEY = k0 + '\n'; P.newline_key = (await live('k'.repeat(40))).status; env.LIVE_KEY = k0; }   // a secret pasted with its trailing newline
  P.nokey = (await live()).status; P.wrong = (await live('wrong')).status; P.short = (env.LIVE_KEY = 'short', (await live('short')).status); env.LIVE_KEY = 'k'.repeat(40);
  const v = await (await live('k'.repeat(40))).json(); P.online = v.online;
  P.p1 = v.players.find(x => x.a === id1.slice(0, 6)); P.p2 = v.players.find(x => x.a === id2.slice(0, 6)); P.tot = v.tot; P.hist = v.hist.length ? v.hist[v.hist.length - 1] : null;
  P.full_id = JSON.stringify(v).includes(id1); P.leak = /hello|Doc|4\.4\.4\.4/.test(JSON.stringify(v));
  await beat({ v: 1, id: id2, bye: 1 }); P.after_bye = (await (await live('k'.repeat(40))).json()).online;
  P.kv_writes = env.STATS.puts.length + env.WORLDS.puts.length - puts0;
  let last = 0; for (let i = 0; i < 31; i++) last = (await beat({ v: 1, id: id1, mode: 'world' }, '3.3.3.3')).status; P.rate_31st = last;
  // expiry, on a table with its own clock
  let t = 1e12; const T = new M.PresenceTable(() => t); T.beat({ v: 1, id: id1, mode: 'world' }, 'US'); T.beat({ v: 1, id: id2, mode: 'free' }, 'DE');
  t += 40e3; T.beat({ v: 1, id: id1, mode: 'world' }, 'US'); t += 25e3; const e = T.view();
  P.expiry = { online: e.online, left: e.hist.reduce((a, h) => a + h.left, 0), arr: e.hist.reduce((a, h) => a + h.arr, 0) };
  // the Durable Object class answers the same beat and view
  const D = new M.Presence({}, {}); const r1 = await (await D.fetch(new Request('https://presence/beat', { method: 'POST', body: JSON.stringify({ v: 1, id: id1, mode: 'ready' }), headers: { 'X-Country': 'CL' } }))).json();
  const r2 = await (await D.fetch(new Request('https://presence/view'))).json(); P.do = { ok: r1.ok, online: r2.online, cc: r2.players[0] && r2.players[0].cc, mode: r2.players[0] && r2.players[0].mode };
  // one table per site in one Durable Object namespace: staging (IDLE_ENV=staging, or a staging.* host) and id-le.com never mix
  { const inst = {}, names = []; env.PRESENCE = { idFromName: n => { names.push(n); return n; }, get: id => { const o = inst[id] || (inst[id] = new M.Presence({}, {})); return { fetch: (u, i) => o.fetch(new Request(u, i)) }; } };   // like a stub: the object gets a Request
    const at = (host, path, init = {}) => W.fetch(new Request('https://' + host + path, { ...init, headers: { 'CF-Connecting-IP': '6.7.8.9', 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'k'.repeat(40) } }), env, { waitUntil() {} });
    const hb = (host, id) => at(host, '/lab/here', { method: 'POST', body: JSON.stringify({ v: 1, id, mode: 'world' }) });
    await hb('id-le.com', 'aaaaaaaaaaaaaaa1'); await hb('id-le.com', 'aaaaaaaaaaaaaaa2'); await hb('staging.id-le.com', 'bbbbbbbbbbbbbbb1');
    env.IDLE_ENV = 'staging'; await hb('abc123.id-le.pages.dev', 'bbbbbbbbbbbbbbb2'); const vs = await (await at('abc123.id-le.pages.dev', '/lab/live')).json(); delete env.IDLE_ENV;
    const vp = await (await at('id-le.com', '/lab/live')).json(), vsh = await (await at('staging.id-le.com', '/lab/live')).json();
    P.split = { prod: vp.players.map(x => x.a).sort().join(','), staging: vsh.players.map(x => x.a).sort().join(','), preview: vs.online, tables: Object.keys(inst).sort().join(','), names: [...new Set(names)].sort().join(',') };
    delete env.PRESENCE; }
  delete env.LIVE_KEY; out.presence = P; }
// reviews (11-03, v2): team stage (403 before joining), join once, per-item and per-pair dedupe by browser key (nothing new → 409, no
// writes), notes private, team contributions counted, the order hint, totals with like-rate and Bradley-Terry only when shown, closed → 410
{ const K1 = 'abcdefghijklmnopqrstuvwxyz', K2 = 'zyxwvutsrqponmlkjihgfedcba', P = (b, ip) => post('/lab/review/logos', b, ip || '7.7.7.1');
  const cfg = await (await go('/lab/review/logos')).json(), list = await (await go('/lab/reviews')).json();
  const bad = [(await P({ scores: { nope: 3 }, bkey: K1 })).status, (await P({ scores: { 'a3-dust': 6 }, bkey: K1 })).status, (await P({ scores: {}, bkey: K1 })).status, (await P({ scores: { 'a3-dust': 2.5 }, bkey: K1 })).status,
    (await P({ pairs: [['a3-dust', 'a3-dust']], bkey: K1 })).status, (await P({ scores: { 'a3-dust': 3 } })).status];
  const notMember = (await P({ scores: { 'a3-dust': 3 }, bkey: K1 })).status;
  const j1 = await (await post('/lab/team/loop/join', { bkey: K1 })).json(), j1b = await (await post('/lab/team/loop/join', { bkey: K1 })).json(), badTeam = (await post('/lab/team/vikings/join', { bkey: K1 })).status;
  const w0 = env.STATS.puts.length, s1 = await (await P({ scores: { 'c3-typed-dust': 5, 'c3-typed-crt': 3 }, notes: { 'c3-typed-crt': 'love the typing, mail me at a@b.co' }, bkey: K1 })).json(), w1 = env.STATS.puts.length;
  const r2 = await P({ scores: { 'c3-typed-dust': 1 }, bkey: K1 }), w2 = env.STATS.puts.length;
  const s3 = await (await P({ scores: { 'c3-typed-dust': 1, 'a3-dust': 1 }, pairs: [['c3-typed-dust', 'c3-typed-crt']], bkey: K1 })).json();
  const r4 = (await P({ pairs: [['c3-typed-crt', 'c3-typed-dust']], bkey: K1 })).status;
  await post('/lab/team/loop/join', { bkey: K2 }); const s5 = await (await P({ scores: { 'c3-typed-dust': 3 }, pairs: [['c3-typed-dust', 'c3-typed-crt']], bkey: K2 }, '7.7.7.2')).json();
  const me = await (await post('/lab/team/loop/me', { bkey: K1 })).json(), size = await (await go('/lab/team/loop')).json();
  const agg = JSON.parse(env.STATS.m.get('review:logos:agg')), fb = [...env.STATS.m.entries()].filter(([k, v]) => k.startsWith('fb:') && JSON.parse(v).kind === 'review').map(([k, v]) => JSON.parse(v));
  const order = (await (await go('/lab/review/logos')).json()).order;
  env.STATS.m.set('review:closed1', JSON.stringify({ kind: 'fonts', title: 'old', items: ['f1'], open: false }));
  env.STATS.m.set('review:tot1', JSON.stringify({ kind: 'logos', title: 'shown', items: ['a', 'b', 'c'], stage: 'public', showTotals: true }));
  const closed = (await post('/lab/review/closed1', { scores: { f1: 3 }, bkey: K1 }, '7.7.7.3')).status;
  const t1 = await (await post('/lab/review/tot1', { scores: { a: 5, b: 1 }, pairs: [['a', 'b'], ['a', 'c']], bkey: K2 }, '7.7.7.3')).json();   // public: no team needed
  env.STATS.m.set('review:old1', JSON.stringify({ kind: 'fonts', title: 'v1', items: ['f1', 'f2'] })); env.STATS.m.set('review:old1:agg', JSON.stringify({ sends: 1, items: { f1: { n: 1, sum: 4, s: [0, 0, 0, 0, 1, 0] } }, bk: [await (async () => { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(K1 + '|id-le review bkey v1'))); return Array.from(b.slice(0, 16), x => x.toString(16).padStart(2, '0')).join(''); })()] }));
  const v1again = (await post('/lab/review/old1', { scores: { f2: 3 }, bkey: K1 }, '7.7.7.4')).status, v1other = (await post('/lab/review/old1', { scores: { f2: 3 }, bkey: K2 }, '7.7.7.4')).status;
  out.review = { kind: cfg.kind, stage: cfg.stage, team: cfg.team, items: cfg.items.length, totals0: 'totals' in cfg, order0: cfg.order['a3-dust'].n, listed: list.reviews.map(r => r.rid).sort().join(','), bad, notMember,
    j1: j1.ok === true && j1.n === 1, j1b: !!j1b.already, badTeam, s1: s1.added, writes1: w1 - w0, r2: r2.status, writes2: w2 - w1, s3: [s3.added, s3.pairs, s3.skipped], r4, s5: [s5.added, s5.pairs],
    sends: agg.sends, dust: agg.items['c3-typed-dust'], pw: agg.pw, me: [me.member, me.reviews], size: size.n, notes: fb.length, scrubbed: fb.length === 1 && !JSON.stringify(fb[0]).includes('a@b.co'),
    rawkey: [...env.STATS.m.values()].some(v => v.includes(K1)), order: order['c3-typed-dust'], closed, bt: t1.totals && t1.totals.a.bt > t1.totals.b.bt && t1.totals.a.like === 1 && t1.totals.b.like === 0, v1again, v1other,
    unknown: (await go('/lab/review/nope')).status }; }
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


KV_WRITES_TEST = r"""
const realST = globalThis.setTimeout; const tick = () => new Promise(r => realST(r, 0));
globalThis.setTimeout = (f) => { Promise.resolve().then(f); return 0; }; globalThis.__statFlushNow = true;
let NOW = Date.UTC(2026, 10, 5, 0, 0, 30); const realNow = Date.now; Date.now = () => NOW;
const RealDate = Date; globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } };
const M = await import(process.argv[2]), W = M.default;
let failPut = 0;   // >0: the next KV puts throw like the free-tier cap does
const kv = () => { const m = new Map(), puts = []; return { m, puts, get: async k => m.get(k) ?? null, put: async (k, v) => { if (failPut > 0) { failPut--; throw new Error('KV PUT failed: 429 Too Many Requests'); } puts.push(k); m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const store = () => { const m = new Map(); return { m, get: async k => m.has(k) ? structuredClone(m.get(k)) : undefined, put: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async k => { m.delete(k); } }; };
const inst = {}, NS = { idFromName: n => n, get: id => ({ fetch: (url, init) => (inst[id] = inst[id] || new M.Presence({ storage: store() }, {})).fetch(new Request(url, init)) }) };
const run = async (env, n, every) => { const go = (path, body) => W.fetch(new Request('https://id-le.com' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '9.9.9.' + (n % 200), 'Content-Type': 'application/json' } }), env, { waitUntil(p) { return p; } });
  for (let i = 0; i < n; i++) { NOW += every; await go('/lab/stats', { v: 1, visit: 1, dev: 'desktop', feat: ['music'] }); await tick(); await tick(); } };
const out = {};
// the old path (no accumulator): one KV write per batch; with every report in its own 20-s window that is one write per report
{ const env = { STATS: kv(), ALLOWED_ORIGINS: '*', RATE_PER_MIN: '100000' }; await run(env, 300, 108e3); await new Promise(r => setTimeout(r)); out.oldPuts = env.STATS.puts.filter(k => k.startsWith('stats:')).length; }
// the accumulator: 800 reports over a day (one every 108 s, like Nov 4's 781 batches) → KV written at most once an hour
NOW = Date.UTC(2026, 10, 6, 0, 0, 30);
const env = { STATS: kv(), PRESENCE: NS, ALLOWED_ORIGINS: '*', RATE_PER_MIN: '100000' };
await run(env, 790, 108e3);
await tick(); await tick();
const day = '2026-11-06', puts = env.STATS.puts.filter(k => k.startsWith('stats:'));
out.newPuts = puts.length; out.shards = [...new Set(puts)];
const kvVisits = [...env.STATS.m.entries()].filter(([k]) => k.startsWith('stats:' + day)).reduce((a, [, v]) => a + JSON.parse(v).visits, 0);
const peek = await (await NS.get('stats-live').fetch('https://presence/stats/peek', { method: 'POST', body: '{}' })).json();
const pendVisits = Object.values(peek.acc || {}).reduce((a, r) => a + r.visits, 0) + Object.values(peek.lent || {}).reduce((a, r) => a + r.visits, 0);
out.visitsTotal = kvVisits + pendVisits;
// a KV write that fails after a take: nothing is lost (the lent copy goes back into the pile after 5 minutes and is written later)
{ NOW += 61 * 60e3; failPut = 1; await run(env, 1, 1000); await tick(); await tick();
  NOW += 6 * 60e3; await run(env, 1, 1000); NOW += 61 * 60e3; await run(env, 1, 1000); await tick(); await tick();
  const kv2 = [...env.STATS.m.entries()].filter(([k]) => k.startsWith('stats:')).reduce((a, [, v]) => a + JSON.parse(v).visits, 0);
  const pk = await (await NS.get('stats-live').fetch('https://presence/stats/peek', { method: 'POST', body: '{}' })).json();
  out.afterFailTotal = kv2 + Object.values(pk.acc || {}).reduce((a, r) => a + r.visits, 0) + Object.values(pk.lent || {}).reduce((a, r) => a + r.visits, 0); }
// a player's 🧪 message while KV refuses writes: "saved, will sync", then written with the accumulator's next take
{ failPut = 99; const r = await W.fetch(new Request('https://id-le.com/lab/oracle', { method: 'POST', body: JSON.stringify({ kind: 'idea', text: 'more crawlies please' }), headers: { 'CF-Connecting-IP': '7.7.7.7', 'Content-Type': 'application/json' } }), env, { waitUntil(p) { return p; } });
  out.fbStatus = r.status; out.fbBody = await r.json(); failPut = 0;
  NOW += 61 * 60e3; await run(env, 1, 1000); await tick(); await tick();
  out.fbWritten = [...env.STATS.m.keys()].some(k => k.startsWith('fb:')); }
console.log(JSON.stringify(out));
"""


def kv_writes_unit():
    """Nov 4 (KV free tier: 1,000 writes a day for the account): stats go through the accumulator (a Durable Object), KV is written at most
    once an hour per day key, every visit is kept (KV + pending), a failed KV write loses nothing, a player's write refused by KV is queued
    ("saved, will sync") and written later"""
    tmp = tempfile.mkdtemp(prefix="idle-kvw-")
    try:
        shutil.copy(os.path.join(ROOT, "helper", "worker.js"), os.path.join(tmp, "worker.mjs"))
        t = os.path.join(tmp, "t.mjs"); open(t, "w").write(KV_WRITES_TEST)
        r = subprocess.run(["node", t, "file://" + os.path.join(tmp, "worker.mjs")], capture_output=True, text=True, timeout=120)
        need(r.returncode == 0, (r.stderr or r.stdout)[-600:])
        o = json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    need(o["oldPuts"] >= 250, f"the old path should write per batch: {o['oldPuts']} writes for 300 reports")
    need(o["newPuts"] <= 25, f"the accumulator wrote KV {o['newPuts']} times in a day (≤ 25 expected)")
    need(o["visitsTotal"] == 790, f"visits kept {o['visitsTotal']} != 790 (KV + pending)")
    need(o["afterFailTotal"] == 793, f"after a failed KV write {o['afterFailTotal']} != 793")
    need(o["fbStatus"] == 200 and o["fbBody"].get("queued") and o["fbWritten"], f"a refused 🧪 write: {o['fbStatus']} {o['fbBody']}, written later {o['fbWritten']}")
    return f"a day of 790 reports: {o['newPuts']} KV writes (old path: {o['oldPuts']} for 300); every visit kept; a failed write recovered; a refused 🧪 queued and written"


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
    need(o["int"] == {"r": 2, "v": 1, "t": {"prod-check": 2}} and "music" not in s["feat"] and "prod-check" not in s["utm"], f"our own checks must stay apart: int {o['int']}, feat {s['feat']}, utm {s['utm']}")
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
    need(o.get("aa") == {"story": 1, "choose": 1, "play": 2} and o.get("aaInt") == {"play": 1} and o.get("aaBatches") == 0, f"arm beacon: aa {o.get('aa')}, internal {o.get('aaInt')}, batches {o.get('aaBatches')}")
    need(o.get("labp") == 204 and o.get("v2visits") == 1, f"/lab/p answered {o.get('labp')}, v2 visits {o.get('v2visits')}")
    need(o.get("sd") == {"story|lights": {"n": 2, "sum": 725, "b": {"10-30s": 1, "10m+": 1}}, "story|e1words": {"n": 1, "sum": 4, "b": {"<10s": 1}}}, f"time per step: {o.get('sd')}")
    need(o.get("rb") == {f"story|{o['rbToday']}|d0": 1, f"lg:c3|{o['rbToday']}|d0": 1, "none|2026-11-01|d1": 1}, f"coming back: {o.get('rb')}")
    need(o.get("sf") == {"story|title": 1, "story|messages": 1, "story|skip:chat": 1, "none|offer_shown": 1, "none|offer_accepted": 1, "none|fd_link": 1, "none|fd_badge_pipe": 1, "none|lg_shown:crt": 1, "none|landing": 1, "none|title": 1, "lg:crt|lg_shown:crt": 1, "lg:crt|landing": 1, "none|lights": 1}, f"storyline funnel (with the logo arm): {o.get('sf')}")
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
    need(x["did"] == {"w_reel": 1, "w_dream": 1, "rage": 1, "p_music": 1, "quick_exit": 1, "ni_seen": 1, "op_miss": 1, "op_rephrase": 1}, f"v2 flags {x['did']} (once each, unknown ones dropped)")
    need({k: v for k, v in (o.get("bi") or {}).items() if v} == {"2": 1, "4+": 1}, f"report order {o.get('bi')} (1..500 kept, 4+ folded, junk dropped)")
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
    pr = o["presence"]
    need(pr["prod"] == 204 and pr["view_before_prod_beat"] == 0, f"with the kill switch (PRESENCE_ON=0) beats must be accepted and dropped: {pr['prod']}, then online {pr['view_before_prod_beat']}")
    need(pr["b1"].get("ok") and pr["b2"].get("ok") and pr["bad"].get("ok") is False and pr["big"] == 413, f"beats: {pr['b1']} {pr['b2']} bad id {pr['bad']} too big {pr['big']}")
    need(pr["newline_key"] == 200, f"a LIVE_KEY saved with a trailing newline must still match: {pr['newline_key']}")
    need(pr["nokey"] == 404 and pr["wrong"] == 404 and pr["short"] == 404, f"the live view without the right key must be 404: none {pr['nokey']}, wrong {pr['wrong']}, a short server key {pr['short']}")
    p1, p2 = pr["p1"] or {}, pr["p2"] or {}
    need(pr["online"] == 2 and p1.get("mode") == "story" and p1.get("step") == "words" and p1.get("ep") == 0 and p1.get("p") == ["operator", "card"] and p1.get("cr") == "0-12" and p1.get("t") == 42 and p1.get("back") == 1 and p1.get("dev") == "phone", f"story beat: {p1}")
    need(p2.get("mode") == "world" and p2.get("dev") == "desktop" and p2.get("step") is None and p2.get("ep") is None and p2.get("p") == [] and p2.get("cr") is None and p2.get("t") == 0, f"junk must fall back or drop: {p2}")
    r3, r4, r5 = pr["ref3"] or {}, pr["ref4"] or {}, pr["ref5"] or {}
    need((r3.get("page"), r3.get("ref"), r3.get("tag")) == ("pedia", "news.ycombinator.com", "hn-test"), f"a pedia reader from HN: {r3}")
    need((r4.get("page"), r4.get("ref"), r4.get("tag")) == ("game", "other", None) and (r5.get("ref"), r5.get("tag")) == ("other", None) and not pr["ref_leak"], f"a path, a 65-char name and a bad tag must not pass: {r4} {r5}, leak {pr['ref_leak']}")
    need(pr["ref_tot"].get("news.ycombinator.com") == 1 and pr["page_tot"].get("pedia") == 1, f"came-from totals {pr['ref_tot']}, pages {pr['page_tot']}")
    need(set(p1) <= {"a", "since", "t", "cc", "dev", "mode", "arm", "step", "ep", "p", "cr", "back", "page", "ref", "tag"} and not pr["full_id"] and not pr["leak"], f"the view must hold only coarse fields (no full id, text or address): {sorted(p1)}, id {pr['full_id']}, leak {pr['leak']}")
    need(pr["tot"]["mode"] == {"story": 1, "world": 1} and pr["tot"]["panel"] == {"operator": 1, "card": 1} and pr["tot"]["step"] == {"words": 1}, f"totals {pr['tot']}")
    need(pr["hist"] and pr["hist"]["arr"] >= 2, f"arrivals this minute: {pr['hist']}")
    need(pr["after_bye"] == 1 and pr["kv_writes"] == 0, f"bye must remove at once ({pr['after_bye']} left) and presence never writes KV ({pr['kv_writes']} writes)")
    need(pr["rate_31st"] == 429, f"31st beat in a minute from one address: {pr['rate_31st']}")
    need(pr["expiry"] == {"online": 1, "left": 1, "arr": 2}, f"expiry 60 s after the last beat: {pr['expiry']}")
    need(pr["do"] == {"ok": True, "online": 1, "cc": "CL", "mode": "ready"}, f"the Durable Object: {pr['do']}")
    sp = pr["split"]
    need(sp == {"prod": "aaaaaa,aaaaaa", "staging": "bbbbbb,bbbbbb", "preview": 2, "tables": "live,staging", "names": "live,staging"}, f"staging and id-le.com must keep separate tables: {sp}")
    gf = o["gift"]
    need(gf == {"letter": "Hi Sam!", "label": False, "claimed0": False, "c1": True, "writes": 1, "c2": True, "claimed1": True, "unknown": 404, "revoked": 404, "bad": 404}, f"gift links: {gf}")
    rv = o["review"]
    need(rv == {"kind": "logos", "stage": "team", "team": "loop", "items": 12, "totals0": False, "order0": 0, "listed": "fonts,logos", "bad": [400, 400, 400, 400, 400, 400], "notMember": 403,
                "j1": True, "j1b": True, "badTeam": 404, "s1": 2, "writes1": 4, "r2": 409, "writes2": 0, "s3": [1, 1, 1], "r4": 409, "s5": [1, 1],
                "sends": 2, "dust": {"n": 2, "sum": 8, "s": [0, 0, 0, 1, 0, 1]}, "pw": {"c3-typed-dust>c3-typed-crt": 2}, "me": [True, 2], "size": 2, "notes": 1, "scrubbed": True,
                "rawkey": False, "order": {"n": 2, "lr": 1}, "closed": 410, "bt": True, "v1again": 409, "v1other": 200, "unknown": 404}, f"reviews: {rv}")
    return "stats allowlist + buckets, engagement v1+v2, pedia block, jeffy allowlist, KV write throttle, rate limit, Wikimedia credits, gift links, reviews, presence"


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
    # scripts the game loads itself carry their own fingerprint (Nov 3: a stale idle-logos.js froze the story's logo on black)
    import hashlib
    page = open(os.path.join(out, "arena.html"), encoding="utf-8").read(); m = re.search(r"window\.IDLE_V = (\{.*?\});", page)
    need(m and json.loads(m.group(1)).get("idle-logos.js") == hashlib.sha256(open(os.path.join(out, "idle-logos.js"), "rb").read()).hexdigest()[:8], "the page should name idle-logos.js's fingerprint (window.IDLE_V)")


SLOW = {}   # path prefix -> seconds the test server waits before answering (t_fresh_slow)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def translate_path(self, path):   # /arena serves arena.html, as Cloudflare Pages does
        p = super().translate_path(path)
        return p + ".html" if not os.path.exists(p) and os.path.isfile(p + ".html") else p
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


SLOTS = 6   # browser slots on this Mac (Nov 4, Nico: "use as many as you can without hurting yourself"): slot 0 is LOCK itself, so an older
            # test_smoke that only knows the one lock still waits for it; slots 1..5 are LOCK.1 .. LOCK.5


@contextlib.contextmanager
def browser_lock():
    """take one free browser slot (a directory holding the owner's pid); a slot whose pid is gone is stale and freed"""
    held = None
    if os.path.isdir(os.path.dirname(LOCK)) and not os.environ.get("CI"):
        t0, said = time.time(), False
        while held is None:
            for i in range(SLOTS):
                d = LOCK if i == 0 else f"{LOCK}.{i}"
                try: os.mkdir(d)
                except FileExistsError:
                    # a holder killed outright (SIGKILL: a stopped background task) never runs its finally: the slot names its pid, and a slot
                    # whose pid is gone is stale (Nov 4: one sat for an hour and blocked every browser check and deploy behind it)
                    pid = None
                    with contextlib.suppress(OSError, ValueError): pid = int(open(os.path.join(d, "pid")).read().strip())
                    if pid:
                        try: os.kill(pid, 0)
                        except ProcessLookupError:
                            print(f"  removing a stale browser slot (pid {pid} is gone)", flush=True); shutil.rmtree(d, ignore_errors=True)
                        except PermissionError: pass
                    continue
                with contextlib.suppress(OSError): open(os.path.join(d, "pid"), "w").write(str(os.getpid()))
                held = d; break
            if held is None:
                if time.time() - t0 > 1800: raise RuntimeError("every shared browser slot was held for 30 minutes: " + LOCK)
                if not said: print("  waiting for a browser slot…", flush=True); said = True
                time.sleep(2)
    try: yield
    finally:
        if held:
            with contextlib.suppress(OSError): os.remove(os.path.join(held, "pid"))
            with contextlib.suppress(OSError): os.rmdir(held)


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
        self.team_keys, self.rv_order = set(), {}   # ⭐ reviews: who joined the team (by browser key), the per-item counts the server would return
        self.root = None   # set: the build is served from this folder at self.base (a production hostname, t_prod_gates)
        self.here = []      # presence beats (/lab/here) this page sent
        self.helper = None  # set: /lab/here and /lab/live go to this local helper (node helper/dev_server.mjs), t_presence
        self.timescale = 1  # >1: pages open with ?timescale=N (the page's own clock runs N× faster; tests only, see arena.html)
        ctx.route("**/*", self._route)

    def _route(self, route):
        u = route.request.url
        if u.startswith(self.base):
            path = u[len(self.base):].split("?")[0]
            if path.startswith("/jeffy/capabilities"): return route.fulfill(status=200, content_type="application/json", body=json.dumps(CAPS))
            if path.startswith("/jeffy/"): return route.fulfill(status=503, content_type="application/json", body='{"error":"busy"}')
            if path in ("/lab/here", "/lab/live"):
                if path == "/lab/here": self.here.append(route.request.post_data or "")
                if not self.helper: return route.fulfill(status=204, body="")
                import urllib.request, urllib.error
                rq = urllib.request.Request(self.helper + path, data=(route.request.post_data or "").encode() if route.request.method == "POST" else None, method=route.request.method,
                                            headers={k: v for k, v in route.request.headers.items() if k.lower() in ("authorization", "content-type")} | {"X-Country": "CL", "CF-Connecting-IP": "203.0.113.5"})
                try:
                    with urllib.request.urlopen(rq, timeout=10) as r: return route.fulfill(status=r.status, content_type="application/json", body=r.read())
                except urllib.error.HTTPError as e: return route.fulfill(status=e.code, content_type="application/json", body=e.read())
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
            if path == "/lab/reviews": return route.fulfill(status=200, content_type="application/json", body=json.dumps({"reviews": [{"rid": "logos", "kind": "logos", "title": "the logo", "n": 12, "stage": "team", "team": "loop"}, {"rid": "fonts", "kind": "fonts", "title": "our fonts", "n": 8, "stage": "team", "team": "loop"}]}))
            if path.startswith("/lab/team/"):
                body = json.loads(route.request.post_data or "{}") if route.request.method == "POST" else {}
                if path.endswith("/join"): self.fb.append(("join", route.request.post_data or "")); self.team_keys.add(body.get("bkey")); return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "n": len(self.team_keys)}))
                if path.endswith("/me"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"member": body.get("bkey") in self.team_keys, "reviews": 0}))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"n": len(self.team_keys)}))
            if path.startswith("/lab/review/"):
                rid = path[len("/lab/review/"):]; cfg = REVIEW_STUB.get(rid)
                if not cfg: return route.fulfill(status=404, content_type="application/json", body='{"error":"no such review"}')
                if route.request.method == "POST":
                    body = json.loads(route.request.post_data or "{}")
                    if cfg.get("stage") == "team" and body.get("bkey") not in self.team_keys: return route.fulfill(status=403, content_type="application/json", body=json.dumps({"error": "join first", "team": "loop"}))
                    self.fb.append(("review:" + rid, route.request.post_data or ""))
                    return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "added": len(body.get("scores") or {}), "pairs": len(body.get("pairs") or [])}))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"rid": rid, **cfg, "order": self.rv_order}))
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

    def open(self, path, referer=None):
        pg = self.ctx.new_page()
        pg.on("pageerror", lambda e: self.errors.append(str(e)[:200]))
        pg.on("console", self._console)
        def nav(fr):   # the service worker reloads the page once (cross-origin isolation): errors from the first document were from a page being replaced
            if fr == pg.main_frame and (self.errors or self.console or self.warns): self.before_reload += self.errors + self.console + self.warns; self.errors.clear(); self.console.clear(); self.warns.clear()
        pg.on("framenavigated", nav)
        if self.timescale > 1 and "timescale=" not in path:
            p, _, h = path.partition("#"); p += ("&" if "?" in p else "?") + f"timescale={self.timescale}"; path = p + ("#" + h if h else "")
        pg.goto(self.base + path, wait_until="load", referer=referer)
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
          ("almanacBtn", "almanac"), ("treesBtn", "trees"), ("settingsBtn", "settings"), ("ntfBtn", "notices"), ("rc-open", "IRC"), ("toHandle", "Operator"), ("labBtn", "data lab")]
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
    need(not pg.evaluate("() => document.documentElement.classList.contains('gen-story') || !!(document.getElementById('genUnlock') || {}).textContent"), "outside the storyline nothing is locked")
    P.clean()
    return f"{len(opened)} panels opened and closed; nothing locked outside the storyline"


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
    requests into the game's own tools, pass creature commands to IRC, and leave chit-chat alone; the sidebar is only the Operator's chat
    (v10: no brain bar, no 🧠, no "new"); 🔮 Oracle (footer link, /oracle, ⚙) opens the options in a lightbox; nothing covers the send row"""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.wait_for_function("() => window.__oracle && window.__oracle.ready && window.__idleAI", timeout=90000)
    pg.click("#toHandle"); pg.wait_for_timeout(500)
    need(pg.evaluate("() => document.querySelector('#ai-brain').value") == "tiny", "the Tiny Operator is not the default brain on a static site")
    cases = [("make it foggy", "weather", "weather"), ("add a debugger", "spawn", "spawn"), ("fetch coffee", "creature", "creature"), ("how are you today", "none", None)]
    got = []
    for text, opt, acted in cases:
        r = pg.evaluate("t => window.__idleAI.tiny(t)", text)
        got.append(f"{text!r}→{r['option']}/{r['acted']}")
        need(r["option"] == opt and r["acted"] == acted, f"{text!r}: expected {opt}/{acted}, got {r['option']}/{r['acted']} (p {r['p']:.2f})")
        if acted == "weather": need(pg.evaluate("() => window.__idleWorld.summary({ limit: 0 }).weather.kind") == "fog", "the weather did not turn to fog")
    side = pg.evaluate("() => ({ inLab: ['#ai-bar', '#ai-smart', '#ai-set', '#ai-smart-btn', '#ai-new'].filter(s => document.querySelector('#lab ' + s)), newBtn: !!document.querySelector('#ai-new'), head: document.querySelector('#lab-head b').textContent, toggle: document.querySelector('#lab-toggle').textContent })")
    need(not side["inLab"] and not side["newBtn"] and "Operator" in side["head"] and "Operator" in side["toggle"], f"the sidebar is the Operator's chat, nothing else (no brain bar, no 🧠, no 'new'): {side}")
    opened = []
    pg.click("#op-tools"); pg.wait_for_timeout(300); pg.click("#opTray [data-opc='6']"); pg.wait_for_timeout(200)   # v14: the caption's 🔮 link is gone; 🛠's "bring your own AI"
    vis = "() => { const b = document.querySelector('#oracleBox'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none' && !!b.querySelector('#ai-brain') && getComputedStyle(b.querySelector('#ai-smart')).display !== 'none'; }"
    if pg.evaluate(vis): opened.append("🛠 tray")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150); need(not pg.evaluate(vis), "Esc should close the Oracle")
    pg.fill("#lab-text", "/oracle"); pg.press("#lab-text", "Enter"); pg.wait_for_timeout(200)
    if pg.evaluate(vis) and pg.evaluate("() => document.querySelector('#lab-text').value") == "": opened.append("/oracle")
    pg.click("#oracleBox .ox"); pg.wait_for_timeout(150)
    pg.click("#settingsBtn"); pg.wait_for_timeout(300); pg.click('#settings [data-k="oraclebox"]'); pg.wait_for_timeout(200)
    if pg.evaluate(vis): opened.append("⚙ settings")
    need(opened == ["🛠 tray", "/oracle", "⚙ settings"], f"the Oracle lightbox should open from 🛠, /oracle and ⚙: {opened}")
    pg.click("#oracleBox .ox"); pg.wait_for_timeout(500)
    top = pg.evaluate("() => { const r = document.querySelector('#lab-send').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && e.id; }")
    need(top == "lab-send", f"something covers the Operator's send button: {top}")
    P.clean()
    return "; ".join(got) + "; sidebar clean; 🔮 Oracle opens from " + ", ".join(opened) + "; send row clear"



def t_genesis_gate(P):
    """The Genesis gate (Nov 4, Nico typed "wachito" at the lights: the world evolved, then the guide ran the lights anyway): while a guided
    step waits, free text runs no world tool and never advances the step unless the learned gate (demo/genesis_gate.json) says this step
    over its threshold; the step's own command (any case/punctuation, either wording) still advances; a nudge types the command back"""
    pg = P.open("/arena.html?genesis&start=guided&intro=0&test")
    wait_for(pg, "() => !!(window.__genesis && window.__genesis.next && window.__genesis.next() === 'light')", 40, P=P)
    pg.wait_for_function("() => window.__oracle && window.__oracle.ready && window.__idleAI", timeout=120000)
    pg.evaluate("() => { window.__evs = []; window.addEventListener('idle:ev', e => window.__evs.push(e.detail)); }")
    G = pg.evaluate("async () => { const G = await window.__genesis.loadGate(); return G && { thr: G.thr, classes: G.classes, d: G.d }; }")
    need(G and G["d"] == 1024 and set(G["thr"]) >= {"light", "words", "creatures"}, f"the gate did not load: {G}")
    lit = "() => document.documentElement.classList.contains('gen-lit')"
    for i in range(2):   # twice, like Nico
        pg.fill("#lab-text", "wachito"); pg.press("#lab-text", "Enter")
        wait_for(pg, f"() => {{ const g = window.__genesis.gate(); return !!(g && g.said === 'wachito' && (window.__genesis.state().nudge || {{}}).light === {i + 1}); }}", 60, P=P)
        pg.wait_for_timeout(1500)
        r = pg.evaluate("() => ({ next: window.__genesis.next(), gate: window.__genesis.gate(), pre: document.getElementById('lab-text').value, acted: window.__evs.filter(e => e.type === 'tiny_operator').map(e => e.extra.acted), world: window.__idleWorld.summary({ limit: 0 }).weather.kind })")
        need(r["next"] == "light" and not pg.evaluate(lit), f"'wachito' advanced the lights (#{i + 1}): {r}")
        need(all(a is None for a in r["acted"]), f"a world tool ran during Genesis from free text: {r['acted']}")
        need(r["pre"] == "let there be light", f"the nudge must type the command back: {r['pre']!r}")
    thread = pg.evaluate("() => document.getElementById('ai-thread').innerText")
    need("not quite" in thread, "no nudge line in the Operator's chat")
    wach = pg.evaluate("() => window.__genesis.gate()")
    # the step's own command, typed differently, still advances (command syntax: case, punctuation, the story's wording)
    pg.fill("#lab-text", "LIGHTS ON."); pg.press("#lab-text", "Enter"); wait_for(pg, lit, 20, P=P)
    need(pg.evaluate("() => window.__genesis.gate().how") == "command", "the command did not advance as a command")
    # paraphrases and nonsense through the gate (no step run: the gate's own verdict against its threshold)
    probe = pg.evaluate("""async ts => { const H = await window.__idleAI.heads(), G = await window.__genesis.loadGate(), out = {};
        for (const t of ts) { const r = await window.__oracle.classify(t, H, true), v = window.__genesis.gateOf(G, r.x, t); out[t] = { top: v.top, p: +v.p.toFixed(3), adv: v.adv }; } return out; }""",
        ["asdf", "hello", "who are you?", "evolve the world", "life is hard", "light years", "get a life", "what is life", "end life", "lights off"])
    false_adv = {t: v for t, v in probe.items() if v["adv"]}
    need(not false_adv, f"the gate would advance on chit-chat or nonsense: {false_adv}")
    # round 2 (Nov 4): paraphrases of "let there be life" now get through the creatures step's head (n-grams + the Oracle's features)
    life = pg.evaluate("""async ts => { const H = await window.__idleAI.heads(), G = await window.__genesis.loadGate(), out = {};
        for (const t of ts) { const r = await window.__oracle.classify(t, H, true), v = window.__genesis.gateOf(G, r.x, t, 'creatures'); out[t] = { top: v.top, p: +v.p.toFixed(3), adv: v.adv.includes('creatures') }; } return out; }""",
        ["bring them to life", "create life", "let there be creatures", "life is hard", "get a life"])
    need(life["bring them to life"]["adv"] and not life["life is hard"]["adv"] and not life["get a life"]["adv"], f"the creatures step's gate: {life}")
    # the page's n-grams must match tools/genesis_gate.py's exactly (UTF-16 units, FNV-1a)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import genesis_gate as GG
    for t in ["Let there be LIFE!", "  bring   them to life ", "lumière 🌱 vida", "😀😀"]:
        js = pg.evaluate("t => Array.from(window.__genesis.gateNgrams(t, 2048, [1, 2, 3, 4]))", t)
        need(max(abs(a - b) for a, b in zip(js, GG.ngrams(t))) < 1e-9, f"n-gram features differ between the page and genesis_gate.py for {t!r}")
    P.clean()
    return f"'wachito' ×2: no advance, no world tool, nudged, command typed back (gate {wach.get('top')} {wach.get('p')}, v4 {wach.get('v4')}); 'LIGHTS ON.' advanced; no false advance on {len(probe)} off-script probes; creatures step: " + ", ".join(f"{t} {'✓' if v['adv'] else '·'} {v['p']}" for t, v in life.items()) + "; page n-grams = genesis_gate.py"


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


ALLOWED_STATS = {"u", "aa", "bi", "gv", "v", "v2", "visit", "back", "dev", "ios", "safe", "fps", "feat", "m", "f5", "err", "ref", "utm", "dw", "dw0", "fl", "fl0", "eg", "eg0", "sec", "x", "path", "path0", "sd", "rb"}   # sd: time per step, rb: coming back (Nov 3)
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


def t_stats_once(P):
    """ni_seen is counted once per page load (Nov 4: 160 'left without clicking' against 42 in-page visits looked like a repeat): a page
    seen 7 s with no click, then hidden and shown again four times, sends ni_seen in exactly one report; each report carries its order
    within the page load (bi = 1, 2, 3…), and the visit rides on report 1"""
    HID = """window.__vis = 'visible'; for (const k of ['hidden', 'visibilityState']) Object.defineProperty(Document.prototype, k, { configurable: true,
      get() { return k === 'hidden' ? window.__vis !== 'visible' : window.__vis; } });"""
    flip = lambda pg, v: pg.evaluate("v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); }", v)
    pg = P.ctx.new_page(); pg.add_init_script(HID); pg.goto(P.base + "/arena.html?statstest&test", wait_until="load"); booted(pg)
    pg.wait_for_timeout(7000)
    for _ in range(4):
        flip(pg, "hidden"); pg.wait_for_timeout(500); flip(pg, "visible"); pg.wait_for_timeout(1200)
        pg.evaluate("() => window.__stats._send('peek')"); pg.wait_for_timeout(200)
    flip(pg, "hidden"); pg.wait_for_timeout(500); pg.evaluate("() => window.__stats._send('leave')"); pg.wait_for_timeout(300)
    rep = [json.loads(b) for b in P.stats]
    ni = [r for r in rep if "ni_seen" in ((r.get("x") or {}).get("did") or [])]
    need(len(ni) == 1, f"ni_seen in {len(ni)} reports of one page load: {[(r.get('why'), r.get('bi')) for r in rep]}")
    need([r.get("bi") for r in rep] == list(range(1, len(rep) + 1)), f"report order: {[r.get('bi') for r in rep]}")
    need(rep and rep[0].get("visit") == 1 and rep[0].get("bi") == 1 and all(r.get("visit") is None for r in rep[1:]), f"the visit rides on report 1 only: {[(r.get('bi'), r.get('visit')) for r in rep]}")
    P.clean()
    return f"{len(rep)} reports from one page load, ni_seen in 1 (#{ni[0].get('bi')}), visit in #1"

def t_stats_seen(P):
    """left without clicking only counts tabs that were on screen (11-03): a page loaded hidden (a background tab, a prerender) sends
    nothing until it is seen and is never 'left without clicking'; seen ≥ 5 s without a click → ni_seen; a click then leaving within 30 s
    → qe_seen (never both). Also: canvas roundRect is polyfilled where it is missing (old Safari: 'g.roundRect is not a function')"""
    HID = """window.__vis = 'hidden'; for (const k of ['hidden', 'visibilityState']) Object.defineProperty(Document.prototype, k, { configurable: true,
      get() { return k === 'hidden' ? window.__vis !== 'visible' : window.__vis; } });"""
    flip = lambda pg, v: pg.evaluate("v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); }", v)
    def sent(): return [json.loads(b) for b in P.stats]
    def did(): return set().union(*[set((q.get("x") or {}).get("did") or []) for q in sent()]) if P.stats else set()
    # 1. loaded in the background, closed unseen: nothing at all
    pg = P.ctx.new_page(); pg.on("pageerror", lambda e: P.errors.append(str(e)[:200])); pg.add_init_script(HID + " delete CanvasRenderingContext2D.prototype.roundRect;")
    pg.goto(P.base + "/arena.html?statstest&test", wait_until="load"); booted(pg); pg.wait_for_timeout(6500)
    need(pg.evaluate("() => window.__settings.statsLive()"), "?statstest must make stats live")
    rr = pg.evaluate("""() => { const c = document.createElement('canvas').getContext('2d'); c.beginPath(); c.roundRect(10, 10, 80, 40, 12);
      return { has: typeof c.roundRect === 'function', inside: c.isPointInPath(50, 30), corner: c.isPointInPath(11, 11), edge: c.isPointInPath(50, 11) }; }""")
    need(rr["has"] and rr["inside"] and not rr["corner"] and rr["edge"], f"roundRect polyfill: {rr}")
    pg.evaluate("() => window.__stats._send('leave')"); pg.wait_for_timeout(300)
    need(not P.stats, f"a page never on screen sent {len(P.stats)} reports: {sent()[:1]}")
    # 2. now it is seen: the visit goes out; on screen 6 s with no click, then hidden → ni_seen (and no old-style flag reliance)
    flip(pg, "visible"); pg.wait_for_timeout(6500); flip(pg, "hidden"); pg.wait_for_timeout(400)
    s1 = sent(); need(s1 and s1[0].get("visit") == 1 and s1[0].get("why") == "open", f"first report once seen: {s1[:1]}")
    need("ni_seen" in did() and "qe_seen" not in did(), f"seen 6 s, no click: did {did()}")
    pg.close(); P.stats.clear()
    # 3. seen, a click, hidden within 30 s → qe_seen, not ni_seen; a page seen < 5 s gets neither
    pg = P.ctx.new_page(); pg.on("pageerror", lambda e: P.errors.append(str(e)[:200])); pg.add_init_script(HID)
    pg.goto(P.base + "/arena.html?statstest&test", wait_until="load"); booted(pg); flip(pg, "visible"); pg.wait_for_timeout(6000)
    pg.mouse.click(300, 300); pg.wait_for_timeout(800); flip(pg, "hidden"); pg.wait_for_timeout(400)
    need("qe_seen" in did() and "ni_seen" not in did(), f"a click, then gone: did {did()}")
    pg.close(); P.stats.clear()
    pg = P.ctx.new_page(); pg.add_init_script(HID); pg.goto(P.base + "/arena.html?statstest&test", wait_until="load"); booted(pg)
    flip(pg, "visible"); pg.wait_for_timeout(3600); flip(pg, "hidden"); pg.wait_for_timeout(400)
    need(not ({"ni_seen", "qe_seen"} & did()), f"on screen < 5 s: did {did()}")
    pg.close(); P.clean()
    return "unseen tab: nothing sent; seen 6 s no click → ni_seen; click then hidden → qe_seen; < 5 s → neither; roundRect polyfilled"


def t_stats_return(P):
    """time per step and coming back (Nov 3): a storyline moment carries the on-screen seconds since the moment before (hidden time doesn't
    count) and lands in the right bucket; a browser first seen yesterday reports 'day 1' once (not again on reload), a new browser 'day 0',
    and a browser that was here before the measure (no first day known) reports nothing. No identifier in any report."""
    HID = """window.__vis = window.__vis || 'visible'; for (const k of ['hidden', 'visibilityState']) Object.defineProperty(Document.prototype, k, { configurable: true,
      get() { return k === 'hidden' ? window.__vis !== 'visible' : window.__vis; } });"""
    flip = lambda pg, v: pg.evaluate("v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); }", v)
    def sent(): return [json.loads(b) for b in P.stats]
    import datetime as _dt
    today = _dt.datetime.now(_dt.timezone.utc).date(); yday = (today - _dt.timedelta(days=1)).isoformat()
    # 1. time per step: the clock says 100 s of on-screen time so far and the last moment was at 75 s → the next moment took ~25 s
    #    (set before the page's scripts run, once: a page's own pagehide writes its clock back, so setting it from a live page won't stick)
    SEED = f"""if (!sessionStorage.getItem('rt_seeded')) {{ sessionStorage.setItem('rt_seeded', '1'); localStorage.setItem('idle.activeMs', '100000'); localStorage.setItem('idle.funnelAt', '75000');
      localStorage.removeItem('idle.funnel'); localStorage.removeItem('idle.funnelDt'); localStorage.setItem('idle.since', JSON.stringify({{ d: '{yday}', k: 1 }}));
      localStorage.removeItem('idle.backSent'); localStorage.removeItem('idle.stats.sent'); }}"""
    pg = P.ctx.new_page(); pg.on("pageerror", lambda e: P.errors.append(str(e)[:200])); pg.add_init_script(HID); pg.add_init_script(SEED)
    P.stats.clear(); pg.goto(P.base + "/arena.html?statstest&test", wait_until="load"); booted(pg)   # every report from this load counts (the first batch can go before booted)
    pg.evaluate("() => window.__funnel.mark('lights')")
    flip(pg, "hidden"); pg.wait_for_timeout(2500); flip(pg, "visible"); pg.wait_for_timeout(300)   # 2.5 s hidden: must not count
    pg.evaluate("() => window.__funnel.mark('e1words')")
    d = pg.evaluate("() => window.__funnel.durations()")
    need(20 <= d.get("lights", -1) <= 40, f"lights after ~25 s on screen: {d}")
    need(0 <= d.get("e1words", -1) <= 2, f"hidden time must not count: {d}")
    pg.evaluate("() => window.__stats._send('leave')"); pg.wait_for_timeout(400)
    s1 = sent(); sd = {k: v for q in s1 for k, v in (q.get("sd") or {}).items()}; rb = [q["rb"] for q in s1 if q.get("rb")]
    need(set(sd) >= {"lights", "e1words"}, f"durations sent: {s1}")
    need(rb == [{"c": yday, "b": "d1"}], f"first seen yesterday → one 'd1': {rb}")
    bad = [k for q in s1 for k in q if k in ("id", "uid", "bkey", "since")]
    need(not bad, f"no identifier in the report: {bad}")
    # 2. reload the same day: neither the durations nor the return go again
    P.stats.clear(); pg.reload(wait_until="load"); booted(pg); pg.evaluate("() => window.__stats._send('leave')"); pg.wait_for_timeout(400)
    s2 = sent(); need(not any(q.get("rb") for q in s2) and not any(q.get("sd") for q in s2), f"reload must not resend: {s2}")
    # 3. a new browser: day 0 with today's cohort; a browser that was here before the measure (returning, no first day): nothing
    pg.evaluate("() => { for (const k of ['idle.since', 'idle.backSent', 'idle.stats.seen', 'idle.firstSeen']) localStorage.removeItem(k); }")
    P.stats.clear(); pg.reload(wait_until="load"); booted(pg); pg.evaluate("() => window.__stats._send('leave')"); pg.wait_for_timeout(400)
    rb3 = [q["rb"] for q in sent() if q.get("rb")]; need(rb3 == [{"c": today.isoformat(), "b": "d0"}], f"a new browser → d0 today: {rb3}")
    pg.evaluate("() => { localStorage.removeItem('idle.since'); localStorage.removeItem('idle.backSent'); localStorage.setItem('idle.stats.seen', '1'); }")
    P.stats.clear(); pg.reload(wait_until="load"); booted(pg); pg.evaluate("() => window.__stats._send('leave')"); pg.wait_for_timeout(400)
    rb4 = [q["rb"] for q in sent() if q.get("rb")]; need(not rb4, f"here before the measure, no first day → nothing: {rb4}")
    pg.close(); P.clean()
    return f"lights {d['lights']} s (10-30s), hidden 2.5 s not counted ({d['e1words']} s); day 1 once, not on reload; new → d0; unknown first day → nothing"


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
    wait_for(pg, "() => !!(window.__genesis && document.querySelector('[data-gsay]'))", 40, P=P)
    st = "() => ({ c: window.__arena.raw().filter(c => !c.lab).length, w: window.__genHooks.words().length, v: document.documentElement.classList.contains('gen-void'), calm: document.documentElement.classList.contains('gen-calm'), lit: document.documentElement.classList.contains('gen-lit'), next: window.__genesis.next(), pre: (document.getElementById('lab-text') || {}).value, g: window.__genesis.state(), ab: window.__genesis.ab })"
    v0 = pg.evaluate(st)
    need(v0["c"] == 0 and v0["w"] == 0 and v0["v"] and v0["calm"], f"genesis should start empty, dark and calm: {v0}")
    need(v0["ab"] == "on", f"the A/B switch is on since the Nov 4 launch: {v0['ab']}")
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
    pg.click("[data-gsay]"); wait_for(pg, "() => window.__arena.raw().filter(c => !c.lab).length >= 2 && window.__genesis.state().alive", 30, P=P)
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
    v = pg.evaluate("() => ({ box: document.documentElement.classList.contains('gen-box'), con: !!document.querySelector('[data-gsay]'), lab: !!(document.querySelector('#lab') && document.querySelector('#lab').classList.contains('open')), night: !!document.querySelector('#genNight'), handle: getComputedStyle(document.querySelector('#toHandle')).display, skip: !!document.querySelector('#genNightSkip') })")
    need(not v["box"] and not v["con"] and not v["lab"] and v["night"] and v["skip"] and v["handle"] == "none", f"the dark should come first, without the Operator: {v}")
    ui = pg.evaluate("() => [...document.body.children].filter(e => !['arena', 'genNight', 'genNightSkip', 'genArrive', 'genBlack'].includes(e.id) && !/SCRIPT|STYLE/.test(e.tagName)).filter(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }).map(e => e.id || e.tagName)")
    need(not ui, f"nothing of the UI while it's dark (story v5): {ui}")
    need(pg.evaluate("() => window.__audio.hushed()"), "from the landing on, sound doesn't exist yet: the master must be hushed")
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "no creatures in the dark: the first ones come with 'bring life'")
    vw = pg.viewport_size; n0 = pg.evaluate("() => window.__genesis.landing().shown"); dark = pg.evaluate("() => window.__genesis.darkLines")
    # v11 (Nico: "why there's no sound… in time for dinner… and why is there no sound?!… is that a black…"): the lines say it, in this order
    ix = [next(i for i, l in enumerate(dark) if k in l) for k in ("in time for dinner", "why is there no sound", "is that a black…", "is that a black hole!!!", "why is that black hole moving", "today really isn't my luckyyyy")]
    need(ix == sorted(ix) and len(set(ix)) == len(ix), f"the dark's lines out of order: {dark}")
    seen = [pg.evaluate("() => window.__genesis.landing().line")]
    for k in range(4): pg.mouse.click(vw["width"] * (0.3 + 0.1 * k), vw["height"] * 0.3); pg.wait_for_timeout(200); seen.append(pg.evaluate("() => window.__genesis.landing().line"))
    seen = [l for i, l in enumerate(seen) if l and (i == 0 or l != seen[i - 1])]
    need(seen == dark[dark.index(seen[0]):dark.index(seen[0]) + len(seen)], f"the dark's lines should play in order: {seen}")
    n1 = pg.evaluate("() => window.__genesis.landing().shown"); need(n1 > n0, f"clicks should move the lines on: {n0} → {n1}")
    pg.keyboard.press("Escape")
    wait_for(pg, "() => window.__genesis.landing().phase !== 'dark'", 3, P=P)
    lnd = pg.evaluate("() => window.__genesis.landing()")
    need(lnd["why"] == "skip", f"Esc should go straight to the Operator: {lnd}")
    wait_for(pg, "() => document.documentElement.classList.contains('gen-box') && !!document.querySelector('#genBackdrop')", 20, P=P)
    pg.click("#genConsole")   # a tap finishes the line being typed
    wait_for(pg, "() => window.__genesis.ready()", 40, P=P)
    w = pg.evaluate("() => ({ mode: window.__genesis.mode(), pre: document.getElementById('lab-text').value, say: document.getElementById('lab-text').value, cos: window.__genesis.cosmos(), creatures: window.__arena.raw().filter(c => !c.lab).length, words: window.__genHooks.words().length, thread: document.querySelector('#ai-thread').textContent })")   # (v15: hidden during Genesis, still in the thread)
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
    need("Operator" in nm["head"] and "Operator" in nm["toggle"], f"v10: the window and its button read Operator: {nm}")
    # v11 (Nico: "not sure about the 'storm' sounds"): the young universe's lightning makes no sound (no 48 Hz thunder oscillators)
    pg.evaluate("() => { window.__th = 0; const f = AudioParam.prototype.setValueAtTime; AudioParam.prototype.setValueAtTime = function (v, t) { if (v === 48) window.__th++; return f.call(this, v, t); }; }")
    # v13 (Nico: "there's a 'close' button at the top that doesn't do anything, just remove it… we also don't need this notice yet"): during Genesis no close, no Oracle caption
    ch = pg.evaluate("() => ({ close: getComputedStyle(document.querySelector('#lab-close')).display, cap: [...document.querySelectorAll('#lab-form small, #ai-oracle-link')].map(e => getComputedStyle(e).display), quiet: window.__audio.hushed(), hum: window.__genesis.gsound.humOn() })")
    need(ch["close"] == "none" and all(d == "none" for d in ch["cap"]) and ch["quiet"] and not ch["hum"], f"v13: during Genesis no close button, no Oracle caption, silence before the lights: {ch}")
    pg.focus("#lab-text"); pg.keyboard.press("Enter")
    wait_for(pg, "() => window.__genesis.cosmos().lit", 10, P=P)
    text_of = "() => (document.querySelector('#genConsole') || {}).innerText || ''"
    line = pg.evaluate(text_of)
    need("we can see something" in line, f"the lights-on reaction line: {line[:200]!r}")
    # v13 (Nico: "after sending lights on, the chat should disappear, there should be an animation of 'dawn til noon' of brightness, and then the
    # operator window (not the sidebar), should appear again"): the window hidden through the dawn, the sky's brightness rising, the window back
    lum = "() => { const c = document.querySelector('#genCosmos'), g = c.getContext('2d'), W = c.width, H = c.height; let s = 0, n = 0; for (let y = 0.05; y < 1; y += 0.15) for (let x = 0.05; x < 1; x += 0.15) { const d = g.getImageData(Math.floor(x * W), Math.floor(y * H), 1, 1).data; s += 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; n++; } return s / n; }"
    ramp = []
    for k in range(9):
        ramp.append(pg.evaluate("() => ({ op: +getComputedStyle(document.querySelector('#lab')).opacity, dawning: document.documentElement.classList.contains('gen-dawning'), hum: window.__genesis.gsound.humOn() })") | {"lum": pg.evaluate(lum)}); pg.wait_for_timeout(400)
    lums = [r["lum"] for r in ramp if r["dawning"]]
    need(len(lums) >= 6 and all(b >= a - 2 for a, b in zip(lums, lums[1:])) and lums[-1] - lums[0] > 40, f"v13: the dawn's brightness should rise steadily, night to noon: {[round(x) for x in lums]}")
    need(all(r["op"] < 0.05 for r in ramp[2:6]) and all(r["hum"] for r in ramp), f"v13: the Operator's window hidden during the dawn, the hum on from the lights: {ramp}")
    # v14 (Nico: "the operator should always be a floating window, never a fixed sidebar chat"): it comes back floating, low and centred, already
    # showing "Nice!!" and the next step; it never docks
    wait_for(pg, "() => !document.documentElement.classList.contains('gen-dawning') && +getComputedStyle(document.querySelector('#lab')).opacity > 0.95", 8, P=P)
    fl = pg.evaluate("() => { const r = document.querySelector('#lab').getBoundingClientRect(), H = document.documentElement.classList; return { box: H.contains('gen-box'), float: H.contains('gen-float'), cx: r.left + r.width / 2, w: innerWidth, bot: innerHeight - r.bottom, h: r.height, text: document.querySelector('#genConsole').innerText }; }")
    need(not fl["box"] and fl["float"] and abs(fl["cx"] - fl["w"] / 2) < 8 and 10 < fl["bot"] < 60 and "we can see something" in fl["text"] and "let there be words" in fl["text"], f"v14: after the dawn the window floats low and centred with 'Nice!!' and the next step: {fl}")
    docked = []
    for k in range(10):
        docked.append(pg.evaluate("() => { const r = document.querySelector('#lab').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }")); pg.wait_for_timeout(500)
    need(len({tuple(d) for d in docked}) == 1, f"v14: the window must not move while it waits for the words: {docked}")
    wait_for(pg, "() => !!document.querySelector('#genDay')", 10, P=P)
    need("Operator" in pg.evaluate("() => document.querySelector('#lab-head b').textContent"), "the window reads 📟 Operator (v10)")
    gt1 = pg.evaluate("() => { const t = document.querySelector('#genTag'), r = t && t.getBoundingClientRect(); return t && { text: t.textContent, shown: getComputedStyle(t).display !== 'none', left: r.left, top: r.top }; }")
    need(gt1 and gt1["text"] == "consciousness 24 · epoch 0 · genesis" and gt1["shown"] and gt1["left"] < 40 and gt1["top"] < 40, f"after the lights: the tag at the world's top-left: {gt1}")
    day = pg.inner_text("#genDay")
    need("EPOCH 0" in day and "GENESIS" in day and "lights on" in day and "first life" in day and "DAY" not in day, f"v11: the Epoch 0 · Genesis card: {day!r}")
    # v10: the cosmos draws no cloud ovals (Nico: "the stretched laid out ovals… just remove them")
    pg.evaluate("() => { window.__ell = 0; const f = CanvasRenderingContext2D.prototype.ellipse; CanvasRenderingContext2D.prototype.ellipse = function (...a) { if (this.canvas && this.canvas.id === 'genCosmos') window.__ell++; return f.apply(this, a); }; }")
    wait_for(pg, "() => window.__genesis.cosmos().bolts >= 1", 15, P=P); pg.wait_for_timeout(1300)   # a bolt, and the time its thunder used to take to start
    need(pg.evaluate("() => window.__ell") == 0, f"the cosmos still draws ovals: {pg.evaluate('() => window.__ell')}")
    need(pg.evaluate("() => window.__th") == 0, f"v11: the young universe's lightning still thunders: {pg.evaluate('() => window.__th')}")
    # v10: the Operator's handle is the 📟, not a creature; one conversation (no "new"); the window is only the Operator's chat
    hd = pg.evaluate("() => { const h = document.querySelector('#toHandle'); return { svg: !!h.querySelector('svg'), text: h.textContent, nw: !!document.querySelector('#ai-new'), bar: !!document.querySelector('#lab #ai-bar, #lab #ai-smart-btn') }; }")
    need(not hd["svg"] and "📟" in hd["text"] and not hd["nw"] and not hd["bar"], f"no creature-like ghost, no 'new', no brain bar in the Operator's window: {hd}")
    # v14 (Nico: "let's drop the predefined button (as long as the directions are clear, and the proper message/instruction is pre-typed...)"):
    # in Genesis no command button or chip anywhere, the 🛠 tray closed, the step's words pre-typed in the input, which is on screen
    tr = pg.evaluate("() => ({ tray: window.__opwin.tray(), gsay: document.querySelectorAll('[data-gsay]').length, pre: document.getElementById('lab-text').value, line: document.querySelector('#genConsole').innerText, inView: (() => { const r = document.getElementById('lab-text').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 20; })() })")
    need(not tr["tray"]["open"] and tr["gsay"] == 0 and tr["pre"] == "let there be words" and 'say "let there be words"' in tr["line"] and tr["inView"], f"v14: no button, the command pre-typed and said, the input on screen: {tr}")
    # v10 words: "let there be words", no topic, nothing fetched; no creature until "let there be life"
    wait_for(pg, "() => window.__genesis.ready() && window.__genesis.next() === 'words'", 30, P=P)
    ws = pg.evaluate("() => ({ say: document.getElementById('lab-text').value, alt: !!document.querySelector('#genConsole [data-galt]'), pre: document.getElementById('lab-text').value })")
    need(ws["say"] == "let there be words" and not ws["alt"] and ws["pre"] == "let there be words", f"v10: the words step is just 'let there be words': {ws}")
    n_out = len(P.outside); pg.evaluate("() => { window.__fetches = 0; const f = window.fetch; window.fetch = function (u, ...a) { if (/lab.fetch|wikipedia/.test(String(u))) window.__fetches++; return f.call(this, u, ...a); }; }")
    pg.evaluate("() => window.__genesis.say('let there be words about sport')")   # the player's own phrasing (Nico's case): still its own first words
    with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__genesis.state().steps.words", 10, P=P)
    if not pg.evaluate("() => !!window.__genesis.state().steps.words"):   # the Tiny Operator didn't build it (one nudge): the glowing suggestion
        wait_for(pg, "() => window.__genesis.ready() && +getComputedStyle(document.querySelector('#lab')).opacity > 0.95", 30, P=P); pg.focus("#lab-text"); pg.keyboard.press("Enter")
        wait_for(pg, "() => window.__genesis.state().steps.words", 30, P=P)
    # v14: the window steps aside for the words, and the wind comes in with the chimes while the hum fades
    wait_for(pg, "() => (window.__genesis.landing().aside || []).length >= 2", 10, P=P)
    wo = pg.evaluate("() => window.__genesis.landing().aside")
    need(wo[0]["on"] and not wo[1]["on"] and wo[1]["at"] - wo[0]["at"] >= 2000, f"v14: the window steps aside for the words, then comes back: {wo}")
    sp = pg.evaluate("() => ({ c: window.__arena.raw().filter(c => !c.lab).length, f: window.__fetches, kind: (window.__genHooks.words().map(w => w.text).join(' ').match(/sport/g) || []).length, next: window.__genesis.next() })")
    need(sp["c"] == 0 and sp["f"] == 0 and sp["kind"] == 0 and sp["next"] == "creatures", f"after words: no creature, nothing fetched, no 'sport' words: {sp}")
    gs = pg.evaluate("() => ({ s: window.__genesis.gsound.state(), hum: window.__genesis.gsound.humOn(), hushed: window.__audio.hushed(), bed: window.__snd.bedOn(), bg: window.__music.state().bg.on })")
    need(gs["s"]["ticks"] >= 8 and gs["s"]["wind"] and not gs["hum"] and not gs["hushed"] and gs["bed"] and not gs["bg"], f"v14: at the words the chimes, the wind (the ocean bed) in, the hum fading, no music yet: {gs}")
    sp2 = pg.evaluate("() => ({ spawn: window.__idleWorld.spawn('crawly'), first: null })")
    need(sp2["spawn"] is None and pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, f"the world's spawn must refuse before the life step: {sp2}")
    wait_for(pg, "() => +getComputedStyle(document.querySelector('#lab')).opacity > 0.95 && window.__genesis.ready()", 10, P=P)
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "a creature appeared after the words, before 'let there be life'")
    lf = pg.evaluate("() => document.getElementById('lab-text').value"); need(lf == "let there be life", f"the life step: {lf!r}")
    pg.focus("#lab-text"); pg.keyboard.press("Enter")
    # v14 (Nico: "1-3 lightning/thunder effects, creatures appear, (or maybe for each thunder 1 creature appears, total 3?), wait 1-3 seconds
    # after the 3rd one, start background music.... and only after maybe 5-10 seconds of the user looking around, then pop the Epoch 1 thing")
    lv = []
    for k in range(60):
        lv.append(pg.evaluate("() => ({ op: +getComputedStyle(document.querySelector('#lab')).opacity, c: window.__arena.raw().filter(c => !c.lab).length, s: window.__genesis.gsound.state(), look: document.documentElement.classList.contains('gen-look'), m: !!document.querySelector('#genConsole .gstamp'), t: performance.now() })")); pg.wait_for_timeout(250)
        if lv[-1]["m"]: break
    st = lv[-1]["s"]; strikes = st["strikes"]
    need(len(strikes) == 3 and len({x["who"] for x in strikes}) == 3 and 1100 <= strikes[1]["at"] - strikes[0]["at"] <= 2000 and 1100 <= strikes[2]["at"] - strikes[1]["at"] <= 2000, f"v14: three strikes, one creature each, ~1.5 s apart: {strikes}")
    need(len(st.get("thunder") or []) == 3 and all(x["peak"] < 0.5 for x in st["thunder"]), f"v14: a far thunder with each strike, quieter than the logo's: {st.get('thunder')}")
    need(st["life"] and 1000 <= st["life"]["at"] - strikes[2]["at"] <= 3200, f"v14: the music 1–3 s after the third creature: {st['life']}, {strikes[2]}")
    need(all(x["op"] < 0.2 for x in lv[3:-1]) and any(x["look"] for x in lv), f"v14: no window during the strikes and the look around: {[round(x['op'], 2) for x in lv]}")   # (the first 0.75 s: the window fading out)
    lk = pg.evaluate("() => window.__genesis.landing().look")
    need(lk and lk["end"] - strikes[2]["at"] >= 5000, f"v14: the Epoch moment comes at least 5 s after the last creature: {lk}, {strikes[2]}")
    wait_for(pg, "() => !!document.querySelector('#genConsole [data-gm=start]')", 20, P=P)
    mo = pg.evaluate("() => ({ chrome: ['#lab-close', '#op-tools'].map(x => getComputedStyle(document.querySelector(x)).display), text: document.querySelector('#genConsole').innerText, box: document.documentElement.classList.contains('gen-box'), c: window.__arena.raw().filter(c => !c.lab).length, hushed: window.__audio.hushed(), bg: window.__music.state().bg.on, dj: getComputedStyle(document.querySelector('#djBtn')).display, bed: window.__snd.bedOn() })")
    need("EPOCH 0 COMPLETE" in mo["text"] and "great job" in mo["text"] and "next up: Epoch 1" in mo["text"] and "ready?" in mo["text"] and "start Epoch 1" in mo["text"] and "playground" in mo["text"] and mo["box"] and mo["c"] >= 3, f"v14: the Operator's Epoch 0 moment: {mo}")
    need(mo["chrome"] == ["none", "none"], f"v14: no close and no 🛠 during the Epoch 0 moment: {mo['chrome']}")
    need(not mo["hushed"] and mo["bg"] and mo["bed"] and mo["dj"] == "none", f"the music and the world's ambience on, the music panel still locked: {mo}")
    need(not pg.evaluate("() => !!document.querySelector('#genFront')"), "v14: no Gazette at the end of Genesis")
    # the playground asks first; stay goes back
    pg.click("#genConsole [data-gm=play]"); wait_for(pg, "() => !!document.querySelector('#genConfirm') && !!window.__opwin.yielding()", 5, P=P)
    cf = pg.evaluate("() => ({ q: document.querySelector('#genConfirm').innerText, y: window.__opwin.yielding() })")
    need("are you sure" in cf["q"] and "stay in the story" in cf["q"] and cf["y"] == "#genConfirm", f"v14: the playground asks first, the Operator steps aside: {cf}")
    pg.click("#genConfirm [data-c=stay]"); wait_for(pg, "() => !document.querySelector('#genConfirm') && !window.__opwin.yielding() && window.__genesis.mode() === 'story'", 5, P=P)
    pg.click("#genConsole [data-gm=start]")
    wait_for(pg, "() => !!document.querySelector('#genDay.end')", 10, P=P)
    wip = pg.inner_text("#genDay"); need("ATTENTION" in wip and "work in progress" in wip.lower(), f"start Epoch 1 → Epoch 1's card (for now the end of what's built): {wip!r}")
    need(pg.evaluate("() => document.querySelector('#genTag').textContent") == "consciousness 24 · epoch 1", "after Genesis the tag reads epoch 1")
    need(all(k in pg.evaluate("() => window.__funnel.reached()") for k in ("landing", "operator", "lights", "e1words", "e1life", "e1done", "e0_start1")), "the funnel should have every Epoch 0 moment, and start Epoch 1")
    end = pg.evaluate("() => { const s = window.__genesis.state(); return { days: s.days, day: s.day, free: !!s.free, alive: !!s.alive, c: window.__arena.raw().filter(c => !c.lab).length, cos: window.__genesis.cosmos(), box: document.documentElement.classList.contains('gen-box'), fl: document.documentElement.classList.contains('gen-float') } }")
    need(end["days"] and "0" in end["days"] and end["day"] == 1 and end["free"] and end["alive"] and end["c"] >= 3 and not end["box"] and not end["fl"], f"after Genesis: Epoch 1 next, alive, the window back to floating: {end}")
    # v10/v11: the epochs unlock the UI; after Epoch 0 (Epoch 1 reached): creatures, IRC, notices; no data lab, no Gloamhold, no studio
    def shown(sel): return pg.evaluate(f"() => {{ const e = document.querySelector({sel!r}); return !!e && getComputedStyle(e).display !== 'none'; }}")
    un = pg.evaluate("() => window.__genesis.unlocks()")
    need(un["story"] and un["epoch"] == 1 and "data lab" in un["hidden"] and "gloamhold" in un["hidden"] and "creatures" not in un["hidden"], f"the unlock map at Epoch 1: {un}")
    need(shown("#herdBtn") and shown("#rc-open") and not shown("#labBtn") and not shown("#studioBtn") and not shown("#connBtn"), "Epoch 1: creatures and IRC shown; data lab, studio, connect hidden")
    need(pg.evaluate("() => [...document.querySelectorAll('#placesBar [data-kind=keep], #placesBar [data-kind=lab]')].every(e => getComputedStyle(e).display === 'none')"), "Gloamhold and data lab places hidden in the storyline")
    # v15 (Nico: "the oracle should be inside the settings, and let's just hide it in storyline for now"): no Oracle tour line or 🔮 in the
    # storyline's Operator; the closed end card is kept in ✅ (the corner card goes into the window)
    pg.click("#genDay .x"); wait_for(pg, "() => !document.querySelector('#genDay.end')", 5, P=P); pg.wait_for_timeout(3500)
    need(not pg.evaluate("() => !!document.querySelector('#genConsole [data-goracle]')") and not pg.evaluate("() => document.querySelector('#ai-thread').textContent.includes('connect it to the Oracle')"), "no Oracle tour step in the storyline's Operator")
    pg.evaluate("() => { const x = document.querySelector('#genDay:not(.end) .x'); if (x) x.click(); }"); pg.wait_for_timeout(400)
    need(pg.evaluate("() => { const d = document.querySelector('#genDay'); return !d || !!d.closest('#lab'); }"), "a closed epoch card is kept in the Operator's ✅")
    stuck_check(pg, P, "storyline")
    P.clean()
    return f"v13: the dawn (window hidden, brightness rising), hum → word chimes → music + ambience at life, no close or Oracle caption; v11: the dark's lines in order (no sound, is that a black…), silent lightning, Genesis = Epoch 0 (lights, words, life) → front page → Epoch 1 (soon); v10: words without topic or fetch, no creature before life, no ovals, 📟 handle, Oracle from the tour; unlocked at epoch {un['epoch']}: data lab/Gloamhold hidden; {end['c']} creatures"


def t_story_keys_logo(P):
    """The logo keyframe, every way in (Nov 3, Nico: "https://staging.id-le.com/arena?logo=c3&fresh=#logo ... after pressing: black...
    nothing no movement, no sound, no animation, no logo"): the pretty address with only a hash, ?at=, ?story#logo; each plays its arm's logo
    (lit frames, the film's clock moving, the sound on), then lands. And a stale idle-logos.js (an older copy without the host API, as a
    browser cache kept it) must not freeze the film: the old logo plays and it lands."""
    LIT = """() => { const c = document.querySelector('#idleIntro canvas'); if (!c) return -1; const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 53) if (d[i] + d[i + 1] + d[i + 2] > 150) n++; return n; }"""
    out = []
    for url, arm in (("/arena?logo=c3&fresh=#logo", "c3"), ("/arena.html?at=logo&logo=crt", "crt"), ("/arena.html?story&logo=c3#logo", "c3"), ("/arena?fresh=&logo=crt#logo", "crt")):
        pg = P.open(url); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
        wait_for(pg, f"() => window.__funnel.reached().includes('lg_shown:{arm}')", 30, P=P)
        t0 = pg.evaluate("() => window.__epoch0.time()"); lit = []
        for _ in range(8): pg.wait_for_timeout(450); lit.append(pg.evaluate(LIT))
        r = pg.evaluate("() => ({ t: window.__epoch0.time(), snd: window.__epoch0.sounding(), ready: !!window.__epoch0.logoOf(window.__epoch0.last), arm: window.__epoch0.last.logo.arm })")
        need(r["arm"] == arm and r["ready"] and r["t"] > t0 + 2 and max(lit) > 20 and r["snd"], f"{url}: the logo should play (lit {lit}, clock {t0:.1f} → {r['t']:.1f}, sound {r['snd']}): {r}")
        wait_for(pg, "() => !document.querySelector('#idleIntro') && window.__genesis.landing().phase === 'dark'", 25, P=P)
        out.append(f"{url} ({arm}, lit ≤{max(lit)})"); pg.close()
    # a stale module (the version before the host API, as a 4-hour browser cache can keep it): the old logo, and on to the landing
    old = subprocess.run(["git", "show", "61a04f2:demo/idle-logos.js"], cwd=ROOT, capture_output=True, text=True).stdout
    need("byId" in old and "drawAt" not in old, "the stale module for the test")
    P.ctx.route("**/idle-logos.js*", lambda route: route.fulfill(status=200, content_type="application/javascript", body=old))
    try:
        pg = P.open("/arena?logo=c3&fresh=#logo"); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
        wait_for(pg, "() => !!(window.__epoch0 && window.__epoch0.last && window.__epoch0.time() > 0.2)", 30, P=P)
        t0 = pg.evaluate("() => window.__epoch0.time()"); lit = []
        for _ in range(8): pg.wait_for_timeout(450); lit.append(pg.evaluate(LIT))
        r = pg.evaluate("() => ({ t: window.__epoch0.time(), logo: !!window.__epoch0.logoOf(window.__epoch0.last), stale: !!(window.IdleLogos && !window.IdleLogos.byId('c3-typed-dust').drawAt) })")
        need(r["stale"] and not r["logo"] and r["t"] > t0 + 2 and max(lit) > 20, f"a stale idle-logos.js: the old logo should play, not black: lit {lit}, {r}")
        wait_for(pg, "() => !document.querySelector('#idleIntro') && window.__genesis.landing().phase === 'dark'", 25, P=P); pg.close()
    finally:
        P.ctx.unroute("**/idle-logos.js*")
    P.clean()
    return " · ".join(out) + "; a stale idle-logos.js → the old logo, then the landing"


def t_story_keys(P):
    """Keyframes (idle-keys.js, staging/local; Nico: "markers or key frames to go to either with # or & parameters in the url"): every key
    loads to its moment in time (the intro ones at their second of the film, the later ones with the state they need built), after one
    key press (the sound's gate; the title card is its own); the player's real localStorage is never read or written; #keys shows the strip."""
    pg = P.open("/privacy.html"); pg.evaluate("() => { localStorage.clear(); localStorage.setItem('arena.genomes', 'REAL'); localStorage.setItem('idle.genesis', 'REAL'); }"); pg.close()
    # three ways in (Nov 3: Nico's "/arena?logo=c3&fresh=#logo" stayed black): ?story#key, ?at=key, and the bare pretty address with only a hash
    FORMS = {"hash": "/arena.html?story#{k}", "at": "/arena.html?at={k}", "bare": "/arena?fresh=#{k}"}
    def go(k, form):
        pg = P.open(FORMS[form].format(k=k))
        if k != "title":
            wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P)
            need(pg.evaluate("() => /story/.test(location.search) && /fresh/.test(location.search) && location.hash === '#' + window.__storyKey.key"), f"{k}: the address should carry ?story&fresh#{k}")
            pg.keyboard.press("k")
        return pg
    intro = {"computer": "messages", "labchat": "chat", "boot": "boot", "run": "run", "crash": "run", "logo": "crash"}
    got = {}
    for i, k in enumerate(["title", "computer", "labchat", "boot", "run", "crash", "logo", "dark", "operator", "lights", "words", "life", "epoch0done", "epoch1", "end"]):
        t0 = time.time(); pg = go(k, ("hash", "at", "bare")[i % 3])
        if k == "title":
            wait_for(pg, "() => !!(window.__epoch0 && window.__epoch0.waiting())", 40, P=P)
        elif k in intro:
            wait_for(pg, "() => !!(window.__epoch0 && window.__epoch0.last && window.__epoch0.time() > 0.2)", 40, P=P)
            r = pg.evaluate("""k => { const E = window.__epoch0, ct = E.last; return { t: E.time(), off: E.keyOffset(k, ct), scene: E.scene(), waiting: E.waiting() }; }""", k)
            need(not r["waiting"] and r["off"] is not None and r["off"] - 0.5 <= r["t"] <= r["off"] + 6 and r["scene"] == intro[k], f"{k}: the film should start at its second: {r}")
            if k == "logo": wait_for(pg, "() => !document.querySelector('#idleIntro') && window.__genesis.landing().phase === 'dark'", 20, P=P)
        elif k == "dark":
            wait_for(pg, "() => window.__genesis.landing().phase === 'dark' && !!window.__genesis.landing().line", 25, P=P)
            need(not pg.evaluate("() => !!document.querySelector('#idleIntro')"), "dark: no intro")
        elif k == "operator":
            wait_for(pg, "() => document.documentElement.classList.contains('gen-box') && window.__genesis.landing().why === 'key'", 30, P=P)
        elif k == "lights":
            wait_for(pg, "() => window.__genesis.ready() && window.__genesis.next() === 'light'", 30, P=P)
            need(pg.evaluate("() => document.querySelectorAll('#genConsole .gw p').length") == 5, "lights: the Operator's five opening lines, already said")
        elif k == "words":
            wait_for(pg, "() => window.__genesis.next() === 'words' && window.__genesis.ready() && !document.documentElement.classList.contains('gen-box')", 40, P=P)
        elif k == "life":
            wait_for(pg, "() => window.__genesis.next() === 'creatures' && window.__genesis.ready()", 45, P=P)
            need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0 and pg.evaluate("() => window.__genHooks.words().length") > 10, "life: words laid, nobody yet")
        elif k == "epoch0done":
            wait_for(pg, "() => !!document.querySelector('#genConsole [data-gm=start]')", 60, P=P)
            need("EPOCH 0 COMPLETE" in pg.inner_text("#genConsole").upper() and pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") >= 3, "epoch0done: the Operator's Epoch 0 moment, with life (v14)")
        elif k == "epoch1":
            wait_for(pg, "() => { const d = document.querySelector('#genDay'); return !!d && d.innerText.includes('EPOCH 1'); }", 70, every=0.2, P=P)
            need(not pg.evaluate("() => !!document.querySelector('#genConsole [data-gm]')") and pg.evaluate("() => document.querySelector('#genTag').textContent") == "consciousness 24 · epoch 1", "epoch1: past the Epoch 0 moment (start Epoch 1), the tag at epoch 1")
        elif k == "end":
            wait_for(pg, "() => !!document.querySelector('#genDay.end')", 70, P=P)
        got[k] = round(time.time() - t0, 1)
        need(not pg.evaluate("() => localStorage.getItem('arena.genomes') === 'REAL' || localStorage.getItem('idle.genesis') === 'REAL'"), f"{k}: the keyframe must not see the real localStorage")
        if k != "end": pg.close()
    # the end card (still open in pg): its three ways on
    e = pg.evaluate("() => { const d = document.querySelector('#genDay.end'), r = d.getBoundingClientRect(), a = d.querySelector('[data-end=github]'); return { text: d.innerText, href: a && a.href, repo: window.IDLE_REPO, in: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, font: getComputedStyle(d.querySelector('.dt')).fontFamily, op: getComputedStyle(d.querySelector('.el')).fontFamily }; }")
    need("WORK IN PROGRESS" in e["text"].upper() and "roadmap" in e["text"] and "GitHub" in e["text"] and "the playground" in e["text"] and "free-play" not in e["text"] and e["in"], f"the end card: {e}")
    need(e["href"] and e["href"].rstrip("/") == (e["repo"] or "").rstrip("/") and "F4" in e["font"] and "F3" in e["op"], f"the end card's GitHub link and fonts: {e}")
    pg.evaluate("() => { window.__idle.cfg.helper = location.origin; }"); pg.click("#genDay [data-end=roadmap]")
    wait_for(pg, "() => !!document.querySelector('#oracle [data-tab=road].on') && document.querySelectorAll('#oracle .it').length >= 1", 10, P=P)
    need(not pg.evaluate("() => !!document.querySelector('#genDay.end')"), "the roadmap closes the end card to its corner")
    pg.evaluate("() => window.__feedback.close()"); pg.click("#genDay [data-end=open]"); wait_for(pg, "() => !!document.querySelector('#genDay.end')", 5, P=P)
    pg.evaluate("() => document.querySelector('#genDay [data-end=github]').addEventListener('click', e => e.preventDefault())"); pg.click("#genDay [data-end=github]")
    pg.click("#genDay [data-end=free]"); wait_for(pg, "() => !!document.querySelector('#genConfirm')", 5, P=P)   # v14: the playground asks first
    pg.click("#genConfirm [data-c=go]"); pg.wait_for_timeout(600)
    f = pg.evaluate("() => ({ mode: window.__genesis.mode(), un: window.__genesis.unlocks(), story: document.documentElement.classList.contains('gen-story'), day: !!document.querySelector('#genDay'), tag: !!document.querySelector('#genTag'), hushed: window.__audio.hushed(), lab: getComputedStyle(document.querySelector('#labBtn')).display, studio: getComputedStyle(document.querySelector('#studioBtn')).display, fun: window.__funnel.reached(), resume: window.__genesis.canResume(), thread: document.querySelector('#ai-thread').innerText })")
    need(f["mode"] == "free" and not f["un"]["story"] and not f["un"]["hidden"] and not f["story"] and not f["day"] and not f["tag"] and not f["hushed"] and f["lab"] != "none" and f["studio"] != "none", f"free-play should open everything and leave the story: {f}")
    need(all(x in f["fun"] for x in ("end_shown", "end_roadmap", "end_github", "end_free")) and f["resume"] and "welcome to the playground" in f["thread"], f"free-play: funnel moments, ⚙ can resume, the Operator's line: {f}")
    # v16 (Nico: "it's not clear how to go back... like Netflix shows maybe, it should ask: [Restart story mode] [Resume play (Epoch1 - Unamed)]"):
    # the way back from the playground: the Operator says it, 🛠's first chip, /story, and ⚙ → 📖 Storyline asks resume / restart
    wait_for(pg, "() => document.querySelector('#ai-thread').textContent.includes('whenever you want the story back')", 5, P=P)
    ch = pg.evaluate("() => window.__opwin.tray().chips"); pg.evaluate("() => window.__opwin.toggleTray()"); pg.wait_for_timeout(400)
    ch = pg.evaluate("() => window.__opwin.tray()")
    need(ch["chips"][:1] == ["📖 back to the story"], f"the playground's 🛠: '📖 back to the story' first: {ch}")
    pg.evaluate("() => window.__settings.open()"); pg.wait_for_timeout(300); st_txt = pg.evaluate("() => document.querySelector('#settings').innerText")
    need("📖 Storyline" in st_txt and "Epoch 1 · unnamed" in st_txt and "Back to the storyline" not in st_txt and "Storyline mode" not in st_txt, f"⚙: one 📖 Storyline row with the story's progress: {st_txt[:400]!r}")
    snaps = lambda: pg.evaluate("() => JSON.parse(localStorage.getItem('arena.snaps') || '[]').length")
    s0 = snaps(); pg.click('#settings [data-k="storyline"]'); wait_for(pg, "() => !!document.querySelector('#genResume')", 5, P=P)
    md = pg.evaluate("() => document.querySelector('#genResume').innerText")
    need("the storyline" in md and "consciousness 24 · Epoch 1 · unnamed" in md and "▶ resume (Epoch 1 · unnamed)" in md and "↺ restart the story" in md, f"the resume / restart modal: {md!r}")
    pg.click("#genResume [data-r=resume]"); wait_for(pg, "() => !!document.querySelector('#genDay.end')", 8, P=P)
    rs = pg.evaluate("() => ({ mode: window.__genesis.mode(), story: document.documentElement.classList.contains('gen-story'), hidden: window.__genesis.unlocks().hidden, fun: window.__funnel.reached(), end: document.querySelector('#genDay.end').innerText })")
    need(rs["mode"] == "story" and rs["story"] and "data lab" in rs["hidden"] and "st_resume" in rs["fun"] and "ATTENTION" in rs["end"] and snaps() > s0, f"resume: back in the story at its saved point (Epoch 1's card), unlocks back, the world kept as a snapshot: {rs}, snaps {s0} → {snaps()}")
    # back to the playground, then /story → the modal → restart: a snapshot, then the title card
    pg.click("#genDay [data-end=free]"); wait_for(pg, "() => !!document.querySelector('#genConfirm')", 5, P=P); pg.click("#genConfirm [data-c=go]"); wait_for(pg, "() => window.__genesis.mode() === 'free'", 5, P=P)
    s1 = snaps(); pg.evaluate("() => window.__opwin.open()"); pg.wait_for_timeout(400); pg.fill("#lab-text", "/story"); pg.press("#lab-text", "Enter"); wait_for(pg, "() => !!document.querySelector('#genResume')", 5, P=P)
    n1 = pg.evaluate("() => window.__genesis.state().n")
    pg.click("#genResume [data-r=restart]"); wait_for(pg, "() => window.__genesis.mode() === 'story' && window.__genesis.state().n > " + str(n1), 30, P=P)   # (a keyframe page skips the intro itself; 'story row' sees the title card)
    need(snaps() > s1 and "st_restart" in pg.evaluate("() => window.__funnel.reached()"), f"restart: the world kept as a snapshot, then a new story: {s1} → {snaps()}")
    pg.close()
    # the real localStorage, untouched
    pg = P.open("/privacy.html"); real = pg.evaluate("() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))"); pg.close()
    need(real == {"arena.genomes": "REAL", "idle.genesis": "REAL"}, f"keyframes wrote to the real localStorage: {sorted(real)[:8]}")
    # the strip: #keys lists every keyframe; ` toggles it
    pg = P.open("/arena.html?fresh#keys"); wait_for(pg, "() => !!document.querySelector('#keyStrip')", 20, P=P)
    ks = pg.evaluate("() => [...document.querySelectorAll('#keyStrip a')].map(a => a.dataset.k)")
    need(len(ks) == 15 and ks[0] == "title" and ks[-1] == "end", f"the strip: {ks}")
    pg.keyboard.press("`"); pg.wait_for_timeout(200); need(not pg.evaluate("() => !!document.querySelector('#keyStrip')"), "` should hide the strip")
    pg.close(); P.clean()
    return "15 keyframes, seconds to reach each: " + ", ".join(f"{k} {v}" for k, v in got.items()) + "; real localStorage untouched; end card: roadmap, GitHub, free-play (all unlocked, ⚙ back to the story)"


def t_story_end_phone(P):
    """The end card at 375 px (?at=end): fits the screen, buttons tappable; a screenshot for the report."""
    pg = P.open("/arena.html?story&at=end"); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => !!document.querySelector('#genDay.end')", 60, P=P); pg.wait_for_timeout(500)
    r = pg.evaluate("() => { const d = document.querySelector('#genDay.end'), b = d.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, bt: b.bottom, w: innerWidth, h: innerHeight, btn: [...d.querySelectorAll('.ea > *')].map(x => Math.round(x.getBoundingClientRect().height)), sw: document.documentElement.scrollWidth }; }")
    need(r["l"] >= 0 and r["r"] <= r["w"] and r["t"] >= 0 and r["bt"] <= r["h"] and min(r["btn"]) >= 36 and r["sw"] <= r["w"], f"the end card at 375 px: {r}")
    # v12: nothing locked at Epoch 1 shows on a phone: not on the top bar (idle-mobile.js forces some buttons visible), not in the ☰ sheet
    lk = pg.evaluate("""() => { const u = window.__genesis.unlocks(), T = window.__genesis.unlockTable(), vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const bar = T.filter(r => u.hidden.includes(r[0])).flatMap(r => r[2].split(',').map(x => x.trim())).filter(x => [...document.querySelectorAll(x)].some(vis));
      const m = document.querySelector('#mMore'); if (m) m.click(); const ids = T.filter(r => u.hidden.includes(r[0])).flatMap(r => r[2].split(',').map(x => x.trim())).filter(x => /^#[\\w-]+$/.test(x)).map(x => x.slice(1));
      const sheet = [...document.querySelectorAll('#mSheet [data-for]')].filter(b => ids.includes(b.dataset.for) && vis(b)).map(b => b.dataset.for); if (m) m.click(); return { epoch: u.epoch, bar, sheet, n: u.hidden.length }; }""")
    need(lk["epoch"] == 1 and lk["n"] > 5 and not lk["bar"] and not lk["sheet"], f"v12: locked controls visible at Epoch 1 on a 375 px phone: {lk}")
    pg.click("#genDay [data-end=open]") if pg.evaluate("() => !document.querySelector('#genDay.end')") else None
    shot = os.environ.get("IDLE_SHOT_DIR")
    if shot: pg.screenshot(path=os.path.join(shot, "end-card-375.png"))
    P.clean()
    return f"375×{r['h']}: card {round(r['r'] - r['l'])}×{round(r['bt'] - r['t'])} px, buttons {r['btn']} px tall; none of the {lk['n']} locked controls on the bar or in ☰"


def t_story_migrate(P):
    """v11: Genesis became Epoch 0. A storyline save from v10 that finished the old Epoch 1 (words and life) reads as Epoch 0 done,
    Epoch 1 reached; the old numbers are kept beside it (S.v10), nothing dropped; a second load doesn't shift it again."""
    t0 = 1762000000000
    old = {"on": True, "mode": "story", "n": 1, "t0": t0, "tc": t0 + 1000, "steps": {"light": t0 + 2000, "words": t0 + 3000, "creatures": t0 + 4000},
           "alive": t0 + 4000, "days": {"1": t0 + 5000}, "day": 2, "free": t0 + 5000}
    P.ctx.add_init_script("try { if (!sessionStorage.getItem('t_mig')) { localStorage.setItem('idle.genesis', %s); sessionStorage.setItem('t_mig', '1'); } } catch (e) {}" % json.dumps(json.dumps(old)))
    pg = P.open("/arena.html?test"); booted(pg)
    wait_for(pg, "() => !!(window.__genesis && window.__genesis.state())", 20, P=P)
    s = pg.evaluate("() => ({ st: window.__genesis.state(), line: window.__genesis.statusLine(), un: window.__genesis.unlocks() })")
    st = s["st"]
    need(st.get("ev") == 2 and st.get("day") == 1 and list((st.get("days") or {}).keys()) == ["0"] and st["steps"] == old["steps"], f"the v10 save should read as Epoch 0 done: {st}")
    need(st.get("v10") == {"day": 2, "days": {"1": t0 + 5000}} and st.get("alive") == old["alive"] and st.get("free") == old["free"], f"the old numbers kept, nothing dropped: {st}")
    need(s["line"] == "consciousness 24 · epoch 1" and s["un"]["epoch"] == 1, f"the tag and the unlocks after the migration: {s['line']!r} {s['un']}")
    pg.reload(wait_until="load"); booted(pg); wait_for(pg, "() => !!(window.__genesis && window.__genesis.state())", 20, P=P)
    st2 = pg.evaluate("() => window.__genesis.state()")
    need(st2.get("day") == 1 and list((st2.get("days") or {}).keys()) == ["0"], f"a second load must not shift it again: {st2}")
    pg.wait_for_timeout(2500); need(not pg.evaluate("() => window.__audio.hushed()"), "v12: the story's silence must not outlive Genesis after a reload or a migration")
    P.clean()
    return f"v10 save (old Epoch 1 done, day 2) → Epoch 0 done, epoch {st2['day']} reached, v10 numbers kept, stable on reload"


def t_logo_thunder(P):
    """The logo's thunder (the one strike at the Id|le cut) must not clip: it peaked at ~1.5 before the master. 60 fresh buffers (its noise
    is random) at full strength, and one offline render of the voice: every peak < 1.0 (by design ≤ 0.9)."""
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    r = pg.evaluate("""async () => { const c = new OfflineAudioContext(1, 44100 * 3, 44100); let worst = 0, raw = 0;
      for (let k = 0; k < 60; k++) { const T = window.__epoch0.thunderBuf(c, 1), d = T.buffer.getChannelData(0); let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); raw = Math.max(raw, p); worst = Math.max(worst, p * T.gain); }
      const T = window.__epoch0.thunderBuf(c, 1), s = c.createBufferSource(), g = c.createGain(); s.buffer = T.buffer; g.gain.value = T.gain; s.connect(g); g.connect(c.destination); s.start(0.05);
      const out = (await c.startRendering()).getChannelData(0); let rp = 0; for (let i = 0; i < out.length; i++) rp = Math.max(rp, Math.abs(out[i]));
      return { worst, raw, rendered: rp }; }""")
    need(r["worst"] < 1.0 and r["rendered"] < 1.0, f"the logo thunder clips: {r}")
    P.clean()
    return f"60 buffers: peak {r['worst']:.3f} (buffer ≤ {r['raw']:.3f} × gain 0.9), rendered {r['rendered']:.3f}"


def t_story_fans(P):
    """Story v12, the datacenter: the fans' control k follows the story chart inverted (the lower the loss, the faster), rises from Doc's desk
    through the boot to the run, and is 0 after the flash's spin-down; a rendered bed gets louder as the loss drops and is silent after the crash;
    the arrival has no rain (no high-pass noise); the computer's clocks read Friday morning (Fri 9:12 AM), no 'Mon' or '18:41'."""
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    r = pg.evaluate("""async () => { const E = window.__epoch0, TB = window.__termBoot, ct = E.makeContent({ story: true }); ct.boot = true; ct.arrive = true;
      const B = E.pre(ct), R = E.arrival(ct), CS_FLASH = 29.75, corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return c / Math.sqrt(va * vb); };
      const ks = [], ys = []; for (let T = 0.6; T < CS_FLASH; T += 0.25) { ks.push(E.fanK(B + T, ct)); ys.push(E.storyChart(T)[1]); }
      const arc = { desk: E.fanK(R * 0.5, ct), boot: E.fanK(R + TB.clock.login + 0.5, ct), run: E.fanK(B + 0.3, ct), peak: E.fanK(B + CS_FLASH - 0.01, ct), after: E.fanK(B + CS_FLASH + 0.5, ct) };
      // the bed alone, rendered from the run's start: loudness per 0.5 s window against the chart's y
      const oc = new OfflineAudioContext(1, Math.ceil(44100 * (CS_FLASH + 1.5)), 44100); E.fanBed(oc, oc.destination, -B, ct, B); const d = (await oc.startRendering()).getChannelData(0);
      const win = 22050, rms = [], yw = []; for (let i = 0; (i + 1) * win <= Math.floor(44100 * (CS_FLASH - 0.25)); i++) { let s = 0; for (let j = i * win; j < (i + 1) * win; j++) s += d[j] * d[j]; rms.push(Math.sqrt(s / win)); yw.push(E.storyChart(i * 0.5 + 0.25)[1]); }
      let tail = 0; for (let j = Math.floor(44100 * (CS_FLASH + 0.5)); j < d.length; j++) tail = Math.max(tail, Math.abs(d[j]));
      // the arrival's sounds: no high-pass noise (the rain)
      const types = []; const oc2 = new OfflineAudioContext(1, 44100, 44100), mk = oc2.createBiquadFilter.bind(oc2); oc2.createBiquadFilter = () => { const f = mk(); const o = { get type() { return f.type; }, set type(v) { types.push(v); f.type = v; } }; return new Proxy(f, { get: (t, k) => k === 'type' ? t.type : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]), set: (t, k, v) => { if (k === 'type') types.push(v); t[k] = v; return true; } }); };
      try { TB.arrive.fireAll(oc2, oc2.destination, 0); } catch (e) { types.push('error:' + e.message); }
      // the clocks: every string drawn on the desktop, the messages, labchat and the boot's status bar
      const said = new Set(), ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { said.add(String(t)); return ft.call(this, t, ...a); };
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
      try { for (const T of [3, 8, R - 1]) TB.arrive.draw(g, 1280, 720, T, false, false); for (const T of [TB.clock.last + 0.5, TB.dur - 0.2]) TB.draw(g, 1280, 720, T, false, false); } finally { CanvasRenderingContext2D.prototype.fillText = ft; }
      const all = [...said].join(' | ');
      return { cK: corr(ks, ys), cR: corr(rms, yw), arc, tail, highpass: types.filter(t => t === 'highpass').length, errors: types.filter(t => /^error/.test(t)), fri: /Fri 9:1[2-9] AM/.test(all), read: /Read 9:1[0-9] AM/.test(all), bad: (all.match(/Mon [0-9]|18:41/g) || []), lastLogin: [...said].find(x => /Last login/.test(x)) || '', clock0: TB.clockAt(0) }; }""")
    need(r["cK"] > 0.95, f"the fans don't follow the loss curve (k vs the chart's y: {r['cK']:.3f})")
    need(r["cR"] > 0.8, f"the rendered fans don't get louder as the loss drops (rms vs y: {r['cR']:.3f})")
    a = r["arc"]; need(a["desk"] < a["boot"] < a["run"] < a["peak"] and a["after"] == 0, f"the fans' arc: {a}")
    need(r["tail"] < 1e-4, f"the fans aren't silent after the crash: peak {r['tail']}")
    need(r["highpass"] == 0 and not r["errors"], f"rain (high-pass noise) in the arrival: {r['highpass']} {r['errors']}")
    need(r["clock0"] == "9:12 AM" and r["fri"] and r["read"] and not r["bad"] and "Thu" in r["lastLogin"], f"the clocks: {r}")
    P.clean()
    return f"k vs the chart's y r={r['cK']:.3f}, rendered loudness vs y r={r['cR']:.3f}; arc desk {a['desk']:.2f} → boot {a['boot']:.2f} → run {a['run']:.2f} → peak {a['peak']:.2f} → 0; silent after the crash; no rain; Fri 9:12 AM"


def t_story_clock(P):
    """Story v12 (Nico: "check that it's consistent"): every time and date the intro draws (the desktop's menu bar, the messages' Read time,
    labchat, the boot log's last login, the tmux status bar, the training log, the run's panes) is one story time: Friday from 9:12 AM, the
    last login the night before (Thu Nov 7 2041, so the Friday is Nov 8 2041); nothing else (no Mon, no 18:41, no real clock)."""
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    r = pg.evaluate("""() => { const E = window.__epoch0, TB = window.__termBoot, ct = E.makeContent({ story: true }); ct.boot = true; ct.arrive = true;
      const R = E.arrival(ct), B = E.pre(ct), said = new Set(), ft = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { said.add(String(t)); return ft.call(this, t, ...a); };
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ph = document.createElement('canvas'); ph.width = 390; ph.height = 844;
      try { for (let A = 0.5; A < B + 30; A += 0.5) { E.frame(ct, A, cv); if (A % 3 < 0.5) E.frame(ct, A, ph, { phone: true }); } } finally { CanvasRenderingContext2D.prototype.fillText = ft; }
      const re = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\b|\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b|\\b\\d{1,2}:\\d{2}(:\\d{2})?\\b|\\b\\d{1,2}\\s?(am|pm|AM|PM)\\b/;
      return { strings: [...said].filter(x => re.test(x)), R, B }; }""")
    bad = []
    for x in r["strings"]:
        if x.startswith("Last login:"):
            if "Thu Nov" not in x or ("2041" not in x and "obs-deck" not in x): bad.append(x)
            continue
        if "uptime 00:00:" in x: x = x.split("· uptime")[0]
        import re as _re
        if "3am" in x and not _re.search(r"\d:\d\d", x): continue   # "the thermals spike at 3am?": last night, in labchat's backlog (wrapped rows too)
        times = _re.findall(r"\b(\d{1,2}):(\d{2})\s?(AM|PM)?", x)
        days = _re.findall(r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b", x)
        if any(d != "Fri" for d in days) or not times and not days: bad.append(x); continue
        for h, m, ap in times:   # Friday morning: now (9:12 AM on) or, for labchat's backlog, earlier that night
            if ap != "AM" or int(h) * 60 + int(m) > 9 * 60 + 20 or (days and int(h) * 60 + int(m) < 9 * 60 + 12): bad.append(x)
    need(not bad, f"times that aren't Friday 9:12 AM onward: {bad}")
    need(any("Fri 9:12 AM" in x for x in r["strings"]), f"no 'Fri 9:12 AM' on screen: {r['strings'][:8]}")
    P.clean()
    return "every time on screen: " + " · ".join(sorted(set(r["strings"]))[:12])


def t_logo_ab(P):
    """The story's logo A/B (Nico, Nov 3: C3 · Typed, dust vs C3-crt · Typed, CRT off): each forced arm draws its own logo in the logo window
    (CS.split on) and schedules its one rendered sound there, and nothing of the old logo (the cut's thunder, the purr, the cut); an unforced
    browser gets an arm once and keeps it across reloads; a live story reaching the logo marks lg_shown:<arm> in the funnel."""
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    r = pg.evaluate("""async () => { const E = window.__epoch0, CS = E.storyClock; await E.loadBank(); await E.loadLoss(); const out = {};
      for (const arm of ['c3', 'crt']) { const L = await E.prepLogo(arm); if (!L) { out[arm] = { L: false }; continue; }
        const ct = E.makeContent({ story: true, seed: 3 }); ct.logo = { arm, id: E.logoArms[arm], L }; const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
        const lit = T => { E.frame(ct, T, cv); const d = cv.getContext('2d').getImageData(0, 0, 640, 360).data; let s = 0, red = 0; for (let i = 0; i < d.length; i += 4 * 7) { s += d[i] + d[i + 1] + d[i + 2]; if (d[i] > 150 && d[i + 1] < 90) red++; } return { s: s / (d.length / 28) / 3, red }; };
        const frames = []; for (let t = 0; t < 30.5; t += 2) E.frame(ct, t, cv); for (let t = 0.2; t < L.duration; t += 0.5) frames.push(lit(CS.split + t));
        const log = [], P0 = BaseAudioContext.prototype, f0 = P0.createBufferSource; P0.createBufferSource = function () { const n = f0.call(this), st = n.start.bind(n); n.start = (t = 0, o = 0) => { log.push({ t, dur: n.buffer ? n.buffer.duration : 0 }); return st(t, o); }; return n; };
        const o0 = P0.createOscillator; let osc = 0; P0.createOscillator = function () { const n = o0.call(this), st = n.start.bind(n); n.start = (t = 0) => { if (t >= CS.split - 0.01) osc++; return st(t); }; return n; };
        try { await E.renderAudio(ct); } finally { P0.createBufferSource = f0; P0.createOscillator = o0; }
        const inLogo = log.filter(x => x.t >= CS.split - 0.01);
        out[arm] = { L: true, dur: L.duration, total: E.total(ct), split: CS.split, lit: frames.filter(f => f.s > 1.2).length, n: frames.length, red: Math.max(...frames.map(f => f.red)), inLogo: inLogo.map(x => [+x.t.toFixed(2), +x.dur.toFixed(2)]), osc }; }
      return out; }""")
    for arm in ("c3", "crt"):
        a = r[arm]; need(a["L"], f"{arm}: the logo did not load or render")
        need(abs(a["total"] - (a["split"] + a["dur"] + 0.4)) < 0.01, f"{arm}: the story's length follows the logo: {a}")
        need(a["lit"] >= a["n"] * 0.6 and a["red"] > 0, f"{arm}: the logo is drawn in the logo window (lit {a['lit']}/{a['n']} frames, red {a['red']})")
        need(len(a["inLogo"]) == 1 and abs(a["inLogo"][0][0] - a["split"]) < 0.01 and abs(a["inLogo"][0][1] - a["dur"]) < 0.05 and a["osc"] == 0, f"{arm}: only the logo's own sound in its window (no thunder, purr or cut): {a['inLogo']}, oscillators {a['osc']}")
    # the scope (Nov 3, Nico: "the sideways distortion on the | looked almost like a block... peaking continuously"): over the brrr, the trace's
    # width in the game's own frame (E.frame at Retina scale, the arm's logo) follows the logo lab's card (560×230 at its own size), r > 0.9,
    # and sits at its widest in at most 30% of the frames
    sc = pg.evaluate("""async () => { const E = window.__epoch0, CS = E.storyClock, L = await E.prepLogo('c3'), M = window.IdleLogos.byId('c3-typed-dust'); await document.fonts.load("100px 'Idle F1'");
      const ct = E.makeContent({ story: true, seed: 3 }); ct.logo = { arm: 'c3', id: 'c3-typed-dust', L };
      const width = (g, cvw, cvh, cx, cy, B, k) => { const x0 = Math.round((cx - B * .45) * k), y0 = Math.round((cy - B * .75) * k), w = Math.round(B * .9 * k), h = Math.round(B * 1.2 * k), d = g.getImageData(x0, y0, w, h).data; let mn = 1e9, mx = -1;
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, a = Math.max(d[i], d[i + 1], d[i + 2]), b = Math.min(d[i], d[i + 1], d[i + 2]); if (a - b > 90 && a > 120) { if (x < mn) mn = x; if (x > mx) mx = x; } } return mx > mn ? (mx - mn) / k / B : 0; };
      const gc = document.createElement('canvas'); gc.width = 2560; gc.height = 1440; const gg = gc.getContext('2d'), pc = document.createElement('canvas'); pc.width = 560; pc.height = 230; const pg2 = pc.getContext('2d');
      for (let T = 0; T < CS.split; T += 3) E.frame(ct, T, gc, { scale: 2 });
      const game = [], prev = [], B = Math.max(72, Math.min(150, 1280 / 9));
      for (let t = 3.6; t < 5.0; t += 0.02) { E.frame(ct, CS.split + t, gc, { scale: 2 }); game.push(width(gg, 1280, 720, 640, 360, B, 2));
        pg2.setTransform(1, 0, 0, 1, 0, 0); pg2.fillStyle = '#000'; pg2.fillRect(0, 0, 560, 230); M.drawAt(pg2, 560, 230, t, {}); prev.push(width(pg2, 560, 230, 280, 115, 112, 1)); }
      const mean = a => a.reduce((x, y) => x + y, 0) / a.length, ma = mean(game), mb = mean(prev); let n = 0, da = 0, db = 0; for (let i = 0; i < game.length; i++) { n += (game[i] - ma) * (prev[i] - mb); da += (game[i] - ma) ** 2; db += (prev[i] - mb) ** 2; }
      const top = Math.max(...game), atTop = game.filter(x => x >= 0.95 * top).length / game.length; return { r: n / Math.sqrt(da * db), atTop, top, mg: ma, mp: mb, n: game.length }; }""")
    need(sc["r"] > 0.9 and sc["atTop"] <= 0.3, f"the scope in the game should follow the logo lab's card (r > 0.9) and not sit at its widest (≤ 30% of frames): {sc}")
    pg.close()
    # an unforced browser: one arm, kept across reloads
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    a1 = pg.evaluate("() => { localStorage.removeItem('idle.logoArm'); const a = window.__epoch0.logoArm(); return [a, window.__epoch0.logoArm(), localStorage.getItem('idle.logoArm')]; }")
    pg.reload(wait_until="load"); booted(pg); a2 = pg.evaluate("() => window.__epoch0.logoArm()")
    need(a1[0] in ("c3", "crt") and a1[0] == a1[1] == a1[2] == a2, f"the logo arm is chosen once and kept: {a1} then {a2}")
    pg.close()
    # live: the keyframe at the logo with a forced arm (?story&at=logo&logo=crt): the story plays C3-crt and marks lg_shown:crt in the funnel
    pg = P.open("/arena.html?story&at=logo&logo=crt"); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => window.__funnel.reached().includes('lg_shown:crt')", 30, P=P)
    g = pg.evaluate("() => { const E = window.__epoch0, last = E.last; return { arm: last && last.logo && last.logo.arm, ready: !!(last && E.logoOf(last)), f: window.__funnel.reached().filter(k => k.startsWith('lg_')) }; }")
    need(g["arm"] == "crt" and g["ready"] and g["f"] == ["lg_shown:crt"], f"?logo=crt: the live story plays C3-crt and marks the funnel: {g}")
    pg.wait_for_timeout(9000)   # through the logo to the landing
    land = pg.evaluate("() => ({ intro: !!document.querySelector('#idleIntro'), funnel: window.__funnel.reached() })")
    need(not land["intro"] and "landing" in land["funnel"], f"after the logo, the landing: {land}")
    P.clean()
    return " · ".join(f"{a}: {r[a]['dur']:.1f} s logo, story {r[a]['total']:.1f} s, drawn {r[a]['lit']}/{r[a]['n']} frames, one sound at {r[a]['split']:.1f} s" for a in ("c3", "crt")) + f"; the scope vs the lab's card r={sc['r']:.3f}, widest in {sc['atTop'] * 100:.0f}% of {sc['n']} frames; arm kept ({a2}); ?logo=crt live → lg_shown:crt"


def t_logo_solo(P):
    """Story v12 (Nico: "the music and other sounds are still going on in the background during the opening logo animation… there should only be
    the animation sound"): (1) in the intro's own schedule nothing started before the logo (CS.split) is still sounding after it: the music, the
    fans, the hum, the ticks, the crash all end first; only the logo's voices (the cut, the thunder, the purr) start in it; (2) the game's own sound is
    hushed for the whole story intro (the intro plays past the hush, storyOut), and a replay restores it afterwards."""
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    r = pg.evaluate("""async () => { const E = window.__epoch0, ct = E.makeContent({ story: true }); ct.boot = true; ct.arrive = true; const B = E.pre(ct), CS = E.storyClock, L0 = B + CS.split;
      const log = [], P0 = BaseAudioContext.prototype, wrap = name => { const f = P0[name]; P0[name] = function (...a) { const n = f.apply(this, a), rec = { kind: name.slice(6), start: null, stop: Infinity, loop: false, node: n }; log.push(rec);
        const st = n.start.bind(n), sp = n.stop.bind(n); n.start = (t = 0, off = 0, ...x) => { rec.start = t; rec.loop = !!n.loop; if (n.buffer && !n.loop) rec.stop = Math.min(rec.stop, t + n.buffer.duration - off); return st(t, off, ...x); }; n.stop = (t = 0) => { rec.stop = Math.min(rec.stop, t); return sp(t); }; return n; }; return f; };
      const orig = ['createOscillator', 'createBufferSource', 'createConstantSource'].map(n => [n, wrap(n)]);
      try { await E.renderAudio(ct); } finally { orig.forEach(([n, f]) => P0[n] = f); }
      const across = log.filter(x => x.start !== null && x.start < L0 - 0.001 && x.stop > L0 + 0.02).map(x => ({ kind: x.kind, start: +x.start.toFixed(2), stop: x.stop === Infinity ? 'never' : +x.stop.toFixed(2) }));
      const inLogo = log.filter(x => x.start !== null && x.start >= L0 - 0.001).length;
      return { across: across.slice(0, 12), n: across.length, inLogo, L0, total: log.length, hasStoryOut: typeof window.__audio.storyOut === 'function' }; }""")
    need(r["hasStoryOut"], "no storyOut on window.__audio")
    need(r["n"] == 0, f"sounds still playing into the logo (from {r['L0']:.2f} s): {r['across']}")
    need(r["inLogo"] > 0, "no logo voices scheduled")
    h = pg.evaluate("""async () => { const A = window.__audio, before = A.hushed(); const p = window.__epoch0.play({ story: true, boot: false }); await new Promise(r => setTimeout(r, 600));
      const during = A.hushed(); window.__epoch0.close(); await p.catch(() => {}); await new Promise(r => setTimeout(r, 1200)); return { before, during, after: A.hushed() }; }""")
    need(not h["before"] and h["during"] and not h["after"], f"the game's sound around a story replay (hushed before/during/after): {h}")
    P.clean()
    return f"nothing from the intro crosses into the logo ({r['total']} sources; {r['inLogo']} logo voices from {r['L0']:.1f} s); the game hushed during a story replay, back after"


def t_story_ring(P):
    """Story v13, the ringing at the landing (Nico: "the ringing lasts too long, it should go rather quickly, definitely 1 or 2 messages before the
    Doc says 'why is there no sound?'"; v12: "go up in intensity very quickly, then down, then linger"): peak within 0.3 s (at least 0.6× v12's),
    down to ~35-40% by 0.75 s, a short linger, exactly 0 at the start of the line two before "and why is there no sound?!", silent through the
    line before it and through it (untouched timing); re-aimed mid-way it still ends at 0 on the new time."""
    pg = P.open("/arena.html?test&intro=0"); booted(pg)
    r = pg.evaluate("""async () => { const G = window.__genesis, end0 = G.untilLine(-1, 3.0), q0 = G.untilLine(-1, 3.0, G.silentLine - 1), q1 = G.untilLine(-1, 3.0, G.silentLine + 1), sr = 44100;
      const env = async (end, len, re) => { const oc = new OfflineAudioContext(1, Math.ceil(sr * len), sr), c = G.ringSound(oc, oc.destination, 0.05, end);
        if (re) oc.suspend(re[0]).then(() => { c.retarget(re[1]); oc.resume(); }); const d = (await oc.startRendering()).getChannelData(0), w = 441, a0 = [];
        for (let i = 0; i + w <= d.length; i += w) { let p = 0; for (let j = i; j < i + w; j++) p = Math.max(p, Math.abs(d[j])); a0.push(p); }
        const a = a0.map((_, i) => Math.max(...a0.slice(Math.max(0, i - 10), i + 11)));   // the two tones beat 5 times a second: the envelope is the max over one beat
        return { a, a0, endAt: c.endAt }; };
      const one = await env(0.05 + end0, 0.05 + q1 + 0.5), two = await env(8, 9, [2.0, 3.5]), pk = Math.max(...one.a), at = t => one.a[Math.round(t * 100)];
      const win = (x, t0, t1) => Math.max(...x.slice(Math.round(t0 * 100), Math.round(t1 * 100)));
      return { end0, q0, q1, pk, peakT: one.a.indexOf(pk) / 100, drop: at(0.75) / pk, atEnd: win(one.a0, 0.05 + end0, 0.05 + end0 + 0.03), silent: win(one.a0, 0.05 + q0, 0.05 + q1),
        reEnd: win(two.a0, 3.55, 3.6), ringLine: G.darkLines[G.ringEnd], silentLine: G.darkLines[G.silentLine], gap: G.silentLine - G.ringEnd }; }""")
    need(r["silentLine"].startswith("and why is there no sound") and r["gap"] >= 2, f"the ringing must end two lines before 'why is there no sound': {r}")
    need(r["peakT"] <= 0.3 and 0.127 * 0.6 <= r["pk"] < 0.2, f"the ringing's attack/peak: {r}")
    need(0.3 <= r["drop"] <= 0.48, f"the ringing's drop: {r}")
    need(r["atEnd"] <= 0.001 and r["silent"] <= 0.001 and r["reEnd"] <= 0.001, f"the ringing isn't 0 when it should be: {r}")
    P.clean()
    return f"peak {r['pk']:.3f} at {r['peakT']:.2f} s, {r['drop'] * 100:.0f}% at 0.75 s, 0 at {r['end0']:.1f} s (the start of '{r['ringLine'][:24]}…'), silent {r['q0']:.1f}-{r['q1']:.1f} s (the line before 'why is there no sound?!' and it), 0 when re-aimed"


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
    lnd = wait_for(pg, "() => window.__genesis.landing().phase !== 'dark' && window.__genesis.landing()", 40, P=P)
    nd = pg.evaluate("() => window.__genesis.darkLines.length")   # v11: 9 lines (the two about the silence), ~29 s untouched
    need(lnd["why"] == "lines" and lnd["shown"] == nd and 14 <= lnd["after"] <= 33, f"all {nd} lines, then the Operator: {lnd}")
    ra = pg.evaluate("() => { const l = window.__genesis.landing(), G = window.__genesis; return { aim: l.ring && l.ring.aimSt, end: l.ringEndSt, gap: G.silentLine - G.ringEnd }; }")
    need(ra["aim"] is not None and ra["end"] is not None and abs(ra["aim"] - ra["end"]) < 0.2 and ra["gap"] >= 2, f"the ringing must end two lines before 'why is there no sound?!': {ra}")
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "no creatures in the dark")
    son = wait_for(pg, "() => { const l = window.__genesis.landing(); return l.pings >= 2 && l.rimmed >= 1 && l; }", 15, P=P)
    wait_for(pg, "() => document.documentElement.classList.contains('gen-box')", 10, P=P)
    pg.click("#genConsole")
    wait_for(pg, "() => window.__genesis.ready()", 40, P=P)
    pg.focus("#lab-text"); pg.keyboard.press("Enter")
    wait_for(pg, "() => window.__genesis.cosmos().lit && !document.querySelector('#genNight')", 10, P=P)
    need(pg.evaluate("() => window.__arena.raw().filter(c => !c.lab).length") == 0, "lights on brings no creatures: life comes next")
    need(pg.evaluate("() => window.__audio.hushed()"), "still silent after lights on (until the music step)")
    pg.evaluate("() => window.__genesis.actions.music && window.__genesis.actions.music()"); pg.wait_for_timeout(500)
    need(not pg.evaluate("() => window.__audio.hushed()"), "the music step brings sound back")
    P.clean()
    return f"the dark for {lnd['after']:.1f} s ({nd} lines, centred, no creatures), the Operator arrived, {son['pings']} pings outlined {son['rimmed']} letters; lights on lifted the dark"


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
    need(w["handle"] and w["onTop"], f"{where}: with everything closed the Operator's 📟 must be visible and on top: {w}")
    pg.click("#toHandle")
    with contextlib.suppress(AssertionError): wait_for(pg, "() => +getComputedStyle(document.querySelector('#topbar')).opacity > 0.95", 4, P=P)   # the menus fade back in
    after = pg.evaluate("() => ({ lab: document.querySelector('#lab').classList.contains('open'), calm: document.documentElement.classList.contains('gen-calm'), top: getComputedStyle(document.querySelector('#topbar')).opacity })")
    need(after["lab"] and not after["calm"] and float(after["top"]) > 0.5, f"{where}: tapping it should reopen the Operator and bring the menus back: {after}")
    return w, after


def t_never_stuck(P):
    """Never stuck: in the guided start (menus hidden), close the Operator and every guided widget; the Operator's 📟 is on screen,
    on top of everything, and tapping it reopens the Operator and brings back the menus (⚙ included). With the window open it hides."""
    pg = P.open("/arena.html?genesis&start=guided&intro=0&test")
    wait_for(pg, "() => !!(window.__genesis && document.querySelector('[data-gsay]'))", 40, P=P)
    pg.wait_for_timeout(900)
    # v15: the 📟 lives at the top and stays there as the window's toggle (marked .on while the window is open)
    need(pg.evaluate("() => !document.querySelector('#toHandle').hidden && document.querySelector('#toHandle').classList.contains('on')"), "the 📟 stays at the top, lit, while the Operator's window is open")
    w, _ = stuck_check(pg, P, "guided start")
    need(pg.evaluate("() => document.querySelector('#toHandle').classList.contains('on')"), "the 📟 is lit again once the window is open")
    P.clean()
    return f"closed everything in the guided start (menus hidden: {w['calm']}, Operator button visible: {w['toggle']}) → the 📟 on top → tap → Operator open, menus back"


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
    pg = P.open("/arena.html?fresh=1&test&founder_test"); booted(pg)
    with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__arena.raw().length >= 8", 30)
    wait_for(pg, FD_AUTOSAVED, 40, P=P); pg.close()
    pg = P.open("/arena.html?founder&founder_before=2020-01-01&test&founder_test"); booted(pg); pg.wait_for_timeout(3500)
    no = pg.evaluate("() => ({ offer: !!document.querySelector('#founderOffer'), e: window.__founder.eligible(), avail: window.__founder.available() })")
    need(not no["offer"] and not no["e"]["world"] and not no["avail"], f"a world newer than the launch is not a Founder: {no}"); pg.close()
    pg = P.open("/arena.html?founder&test&founder_test"); booted(pg)
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
    pg = P.open("/arena.html?gift=founder&test&founder_test"); booted(pg); pg.wait_for_timeout(3500)
    again = pg.evaluate(FD_ONE); dup = pg.evaluate("() => ({ letter: !!document.querySelector('#founderLetter'), lab: !!document.querySelector('#founderLab'), avail: window.__founder.available(), n: window.__arena.raw().filter(c => c.g.founder).length, toast: document.body.innerText.includes('You already have your Founder') })")
    need(again and again["name"] == "Nibbet Prime" and again["badge"] == "seed", f"the Founder survives a reload: {again}")
    need(not dup["letter"] and not dup["lab"] and not dup["avail"] and dup["n"] == 1 and dup["toast"], f"one Founder per browser, even with a gift link: {dup}")
    P.clean()
    return f"no offer for a later world; offer → letter (draft, signed) → 3 experiments, undo, {trees} generations → 'Nibbet Prime' with the seed badge; snapshot first, +1 creature, card mark, can't be removed, first in the sidebar, kept through a reload and in snapshots; a second gift link: refused"

SHOTS = os.environ.get("IDLE_SHOTS")   # a folder: the reviews tests save their screenshots there (for the report)


def _rv_page(P, q="/arena.html?test"):
    pg = P.open(q); booted(pg); pg.evaluate("() => { window.__idle.cfg.helper = location.origin; window.__reviews.test.fast(); }"); return pg


def t_reviews_invite(P):
    """v3: the 📟 Operator relays Nico's message: it types (its own dots), says 'I have a message from Nico:', then the letter appears
    as one '📨 from Nico' card, first line in view (no 'Nico is typing'); [I'm in ✌️] / [not now]. not now → the Operator's line and the 🌱
    lights up; asked again once a day later, never a third time. I'm in → joined (the key), the review's own lines (logos: Nico's),
    the pledge, then 'check them out ›' opens the deck; closing it with nothing judged → 'I'll give you some more time' + the 🌱 lit."""
    pg = _rv_page(P); T = pg.evaluate("() => window.__reviews.text")
    pg.evaluate("() => { window.__reviews.invite('logos'); }"); wait_for(pg, "() => document.querySelectorAll('.rvbtns button').length === 2", 30, P=P)
    seq = pg.evaluate("""() => { const h = document.querySelector('.rvletter').parentElement, L = document.querySelector('.rvletter'), hr = h.getBoundingClientRect(), lr = L.getBoundingClientRect();
      return { op: [...document.querySelectorAll('.rvop')].map(r => r.textContent), who: L.querySelector('.who').textContent, lines: [...L.querySelectorAll('span')].map(s => s.textContent),
        typing: document.body.innerText.includes('Nico is typing'), firstInView: lr.top >= hr.top - 1 && lr.top < hr.bottom, btns: [...document.querySelectorAll('.rvbtns button')].map(b => b.textContent), nico: document.querySelectorAll('.rvnico').length }; }""")
    need(seq["op"][-1] == "I have a message from Nico:" and seq["who"] == "📨 from Nico" and seq["lines"] == T["hello"][0] and not seq["typing"] and seq["nico"] == 0 and seq["firstInView"] and seq["btns"] == [T["yes"], T["no"]], f"the relayed letter: {seq}")
    pg.click(".rvbtns button.alt"); wait_for(pg, "() => [...document.querySelectorAll('.rvop')].some(r => r.textContent.includes('come join us'))", 10, P=P)
    wait_for(pg, "() => !!document.querySelector('.opHi')", 5, P=P)   # the cut-scene's ring on the 🌱
    nn = pg.evaluate("() => ({ want: window.__reviews.text.notNow(false), knows: window.__reviews.test.knows(), line: [...document.querySelectorAll('.rvop')].pop().textContent, hl: window.__reviews.test.lastHighlight(), ring: true, inv: JSON.parse(localStorage.getItem('idle.invite')) })")
    need(not nn["knows"] and nn["line"].startswith(nn["want"]) and "players who help decide what ships" in nn["line"] and nn["hl"] == "hitlBtn" and nn["ring"] and nn["inv"]["answer"] == "no", f"not now: {nn}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "invite-not-now.png"))
    n = lambda: pg.evaluate("() => document.querySelectorAll('.rvletter').length")
    pg.evaluate("() => window.__reviews.test.auto(true, 200000)"); pg.wait_for_timeout(6500); need(n() == 1, "asked again within a day")
    pg.evaluate("() => { window.__reviews.test.shift(25 * 3600e3); window.__reviews.test.auto(true, 200000); }")
    wait_for(pg, "() => document.querySelectorAll('.rvletter').length === 2 && document.querySelectorAll('.rvbtns button:not([disabled])').length === 2", 20, P=P)
    pg.click(".rvbtns button.alt:not([disabled])"); pg.wait_for_timeout(300)
    pg.evaluate("() => { window.__reviews.test.shift(25 * 3600e3); window.__reviews.test.auto(true, 200000); }"); pg.wait_for_timeout(6500)
    need(n() == 2, f"asked a third time ({n()} letters)")
    pg.evaluate("() => { localStorage.removeItem('idle.invite'); window.__reviews.invite('logos'); }"); wait_for(pg, "() => document.querySelectorAll('.rvbtns button:not([disabled])').length === 2", 30, P=P)
    pg.click(".rvbtns button:not(.alt):not([disabled])"); wait_for(pg, "() => [...document.querySelectorAll('.rvbtns button:not([disabled])')].some(b => b.textContent.includes('check them out'))", 30, P=P)
    last = pg.evaluate("() => { const b = [...document.querySelectorAll('.rvletter')].pop(), hr = b.parentElement.getBoundingClientRect(); return { top: b.getBoundingClientRect().top >= hr.top - 1, paras: [...b.querySelectorAll('p')].map(p => [...p.querySelectorAll('span')].map(s => s.textContent)), pledge: !!document.querySelector('.rvpledge'), team: window.__reviews.team.status() }; }")
    need(last["top"] and last["paras"] == T["after"]["logos"] and last["pledge"] and last["team"]["label"] == "in the loop (vesting)", f"after I'm in: {last}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "invite-letter.png"))
    joins = [json.loads(b) for k, b in P.fb if k == "join"]; bk = pg.evaluate("() => localStorage.getItem('idle.bkey')")
    need(len(joins) == 1 and joins[0]["bkey"] == bk, f"the join: {joins}")
    pg.click(".rvbtns button:not([disabled])"); wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().view === 'card'", 30, P=P)
    pg.evaluate("() => window.__reviews.close()"); wait_for(pg, "() => [...document.querySelectorAll('.rvop')].some(r => r.textContent.startsWith(window.__reviews.text.closedNone(true)))", 10, P=P)
    need(pg.evaluate("() => window.__reviews.test.lastHighlight()") == "hitlBtn", "the 🌱 didn't light up after closing")
    pg.close(); P.clean()
    return f"relayed: Operator dots → 'I have a message from Nico:' → one 📨 card ({len(T['hello'][0])} lines, first in view, no 'typing'); not now → its line + 🌱 lit, once more a day later, never a third; I'm in → key, Nico's logo lines, pledge → deck; closed with none judged → 'more time' + 🌱"


def t_reviews_tab(P):
    """The 🌱 HITL tab: for a non-member, the pitch and join (→ the invitation); for a member, the status, the open reviews with their
    progress, resume of a half-done deck (same place, nothing judged twice), closing it after judging → 'I see you already liked some'
    + the 🌱 lit; a finished review moves to 'sent' with your ★. A member's ?review= link → one Operator line + [open ›], never the deck."""
    pg = _rv_page(P)
    def click(sel):
        try: pg.click(sel, timeout=8000)
        except Exception as e:
            info = pg.evaluate("s => { const b = document.querySelector(s); if (!b) return 'missing'; const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height], top: e ? (e.id || e.className || e.tagName) : null }; }", sel.split(" >> ")[0])
            need(False, f"click {sel}: {info}")
    hb = pg.evaluate("() => { const b = document.getElementById('hitlBtn'); if (!b) return 'missing'; const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { con: b.isConnected, disp: getComputedStyle(b).display, r: [r.left, r.top, r.width, r.height], top: e ? (e.id || e.className || e.tagName) : null }; }")
    need(isinstance(hb, dict) and hb["disp"] != "none" and hb["r"][2] > 0 and hb["top"] == "hitlBtn", f"the 🌱 button: {hb}")
    k0 = pg.evaluate("() => window.__reviews.test.knows()")
    click("#hitlBtn"); wait_for(pg, "() => document.querySelector('#hitl.on [data-a=join]')", 10, P=P)
    k1 = pg.evaluate("() => window.__reviews.test.knows()"); need(not k0 and k1, f"knows HITL: before the tab {k0}, after {k1}")
    # the team named and explained, or just named (Nico: "'Nico has another one for the Humans in the Loop: the logo' if I have no idea what HITL is")
    v = pg.evaluate("() => { const T = window.__reviews.text, rv = { title: 'the logo', n: 3 }; return { k: T.another(rv, true), u: T.another(rv, false), nk: T.notNow(true), nu: T.notNow(false), pk: T.publicAsk(rv, true)[0][0], pu: T.publicAsk(rv, false)[0][0], ck: T.closedNone(true), cu: T.closedNone(false) }; }")
    need(v["k"] == "Nico has a new review for the Humans in the Loop: the logo" and v["u"] == "Nico has a new review: the logo. it's for the Humans in the Loop, players who help decide what ships"
         and "HITL team here" in v["nk"] and "players who help decide what ships" in v["nu"] and "players who help decide what ships" in v["pu"] and "(" not in v["pk"] and "HITL tab" in v["ck"] and "where your reviews live" in v["cu"], f"the two variants: {v}")
    click("#hitl [data-a=join]"); wait_for(pg, "() => document.querySelectorAll('.rvbtns button:not([disabled])').length === 2", 30, P=P)
    click(".rvbtns button:not(.alt):not([disabled])"); wait_for(pg, "() => [...document.querySelectorAll('.rvbtns button:not([disabled])')].some(b => b.textContent.includes('check them out'))", 30, P=P)
    click(".rvbtns button:not([disabled])"); wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().view === 'card'", 30, P=P); pg.wait_for_timeout(400)
    first = []
    for k in ("ArrowRight", "ArrowUp", "ArrowLeft"): first.append(pg.evaluate("() => window.__reviews.state().current")); pg.keyboard.press(k); pg.wait_for_timeout(450)
    nxt = pg.evaluate("() => window.__reviews.state().current"); pg.evaluate("() => window.__reviews.close()")
    wait_for(pg, "() => [...document.querySelectorAll('.rvop')].some(r => r.textContent.startsWith(window.__reviews.text.closedSome(true)))", 10, P=P)
    wait_for(pg, "() => !window.__opwin.cutting()", 8, P=P); click("#hitlBtn"); wait_for(pg, "() => document.querySelectorAll('#hitl .rv').length >= 2", 10, P=P)
    with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__opwin.yielding() === '#hitl.on'", 3, P=P)
    yl = pg.evaluate("() => window.__opwin.yielding()"); need(yl == "#hitl.on", f"the 🌱 tab must make the Operator step aside: {yl}")
    t1 = pg.evaluate("() => ({ txt: document.getElementById('hitl').innerText, resume: [...document.querySelectorAll('#hitl [data-open=logos]')].map(b => b.textContent) })")
    need("in the loop (vesting)" in t1["txt"] and "3 of 12 judged" in t1["txt"] and "0 of 8 judged" in t1["txt"] and t1["resume"] == ["resume ›"], f"the tab: {t1}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "hitl-tab.png"))
    click("#hitl [data-open=logos]"); wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().view === 'card'", 20, P=P)
    st = pg.evaluate("() => window.__reviews.state()")
    need(st["current"] == nxt and not set(first) & set(st["queue"]) and len(st["queue"]) == 9, f"resume: current {st['current']} (expected {nxt}), queue {st['queue']}")
    for _ in range(3): pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(450)
    click("#review [data-a=done]"); wait_for(pg, "() => window.__reviews.state().view === 'h2h'", 10, P=P)
    click("#review [data-a=skiph2h]"); wait_for(pg, "() => window.__reviews.state().view === 'end'", 10, P=P); pg.evaluate("() => window.__reviews.close()")
    pg.evaluate("() => window.__reviews.tab.open()"); wait_for(pg, "() => /sent/i.test(document.getElementById('hitl').innerText)", 10, P=P)
    t2 = pg.evaluate("() => document.getElementById('hitl').innerText")
    need(f"your ★: {first[1]}" in t2, f"past: {t2!r}")
    pg.evaluate("() => window.__reviews.tab.close()"); pg.close()
    # a member arriving by a link: a nudge, not the deck
    pg = P.open("/arena.html?review=fonts&test"); booted(pg); pg.evaluate("() => { window.__idle.cfg.helper = location.origin; window.__reviews.test.fast(); }")
    wait_for(pg, "() => [...document.querySelectorAll('.rvop')].some(r => r.textContent.includes('our fonts'))", 30, P=P); pg.wait_for_timeout(800)
    nd = pg.evaluate("() => ({ line: [...document.querySelectorAll('.rvop')].pop().textContent, deck: !!window.__reviews.state(), btns: [...document.querySelectorAll('.rvbtns button:not([disabled])')].map(b => b.textContent), letters: document.querySelectorAll('.rvletter').length })")
    need(not nd["deck"] and nd["line"] == "Nico has a new review for the Humans in the Loop: our fonts" and nd["btns"] == ["open ›", "later"] and nd["letters"] == 0, f"a member's link: {nd}")
    pg.close(); P.clean()
    return f"non-member: 🌱 → join → invite; member: status + '3 of 12 judged' + resume (at {nxt}, nothing twice) → done → 'sent' with ★ {first[1]}; closed after judging → 'already liked some'; a member's ?review=fonts → one line + [open ›], no deck"


def t_reviews_link(P, engine="chromium"):
    """?review=fonts for a non-member: the invitation with the fonts' own lines (not the logos'), the first line in view; the same on
    WebKit (Safari's engine), where v2 opened the deck at once for a browser that had joined before."""
    pg = P.open("/arena.html?review=fonts&test"); hits = []; pg.on("response", lambda r: hits.append((r.status, r.request.method, r.url.split("/lab/")[-1][:40])) if "/lab/" in r.url else None)
    booted(pg); pg.evaluate("() => { window.__idle.cfg.helper = location.origin; window.__reviews.test.fast(); }")
    wait_for(pg, "() => document.querySelectorAll('.rvbtns button:not([disabled])').length === 2", 40, P=P)
    T = pg.evaluate("() => window.__reviews.text")
    a = pg.evaluate("""() => { const L = document.querySelector('.rvletter'), h = L.parentElement, hr = h.getBoundingClientRect(), lr = L.getBoundingClientRect();
      return { deck: !!window.__reviews.state(), first: L.querySelector('span').textContent, inView: lr.top >= hr.top - 1 && lr.top < hr.bottom }; }""")
    need(not a["deck"] and a["first"] == T["hello"][0][0] and a["inView"], f"{engine}: {a}")
    pg.click(".rvbtns button:not(.alt):not([disabled])"); wait_for(pg, "() => [...document.querySelectorAll('.rvbtns button:not([disabled])')].some(b => b.textContent.includes('check them out'))", 30, P=P)
    paras = pg.evaluate("() => [...[...document.querySelectorAll('.rvletter')].pop().querySelectorAll('p')].map(p => [...p.querySelectorAll('span')].map(s => s.textContent))")
    need(paras == T["after"]["fonts"] and "logo" not in json.dumps(paras).lower(), f"{engine}: the fonts lines: {paras}")
    pg.click(".rvbtns button:not([disabled])")
    with contextlib.suppress(AssertionError): wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().kind === 'fonts'", 30, P=P)
    d = pg.evaluate("() => ({ st: window.__reviews.state(), on: document.getElementById('review').className, txt: document.getElementById('review').innerText.slice(0, 200) })")
    need(d["st"] and d["st"]["kind"] == "fonts", f"{engine}: the fonts deck: {d} {P.errors[:2]} {P.console[:2]} {[h for h in hits if 'stats' not in h[2]]}")
    if SHOTS and engine == "chromium": pg.screenshot(path=os.path.join(SHOTS, "fonts-deck.png"))
    pg.close(); P.clean()
    return f"{engine}: ?review=fonts → the invite (first line in view, no deck), the fonts' own lines → the fonts deck"


def t_reviews(P):
    """The swipe deck: least-rated items first; the logo lab's card (frame, waveform strip) is ≥ 70% of the lightbox; space plays it;
    ←/→/↑ and a mouse drag judge (✕ 1, ✓ 3, ★ 5); after 6 'keep going / done'; done → 'which one?' between the two favourites → the
    pair recorded; everything sent in batches with the key; the thanks shows the team status; the 🧪 tab and ⚙ row."""
    P.rv_order = {i: {"n": 9, "lr": 0.9} for i in ["c3-typed-dust", "c3-typed-crt", "a3-dust", "b3a-dust-crt", "scope-strike", "scope-crt", "typed-scope", "scope-meter", "scope-shockwave", "strike-purr-static", "crt-off"]}
    P.rv_order["b3b-crt"] = {"n": 0, "lr": None}; P.rv_order["crt-off"] = {"n": 30, "lr": 1.0}
    pg = _rv_page(P); pg.evaluate("() => window.__reviews.join()"); pg.wait_for_timeout(300)
    pg.evaluate("() => window.__reviews.open('logos')"); wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().view === 'card'", 40, P=P); pg.wait_for_timeout(600)
    st = pg.evaluate("() => window.__reviews.state()")
    need(st["queue"][0] == "b3b-crt" and st["queue"][-1] == "crt-off" and len(st["queue"]) == 12, f"order: {st['queue']}")
    size = pg.evaluate("() => { const b = document.querySelector('#review .box').getBoundingClientRect(), c = document.querySelector('#review .deck .card').getBoundingClientRect(), v = document.querySelector('#review canvas.cv').getBoundingClientRect(); return { area: (c.width * c.height) / (b.width * b.height), cw: c.width / b.width, canvas: v.width, strip: !!document.querySelector('#review canvas.st'), leg: !!document.querySelector('#review .leg') }; }")
    need(size["area"] >= 0.7 and size["strip"] and size["leg"], f"the card at 1280: {size}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "reviews-desktop.png"))
    pg.keyboard.press(" "); wait_for(pg, "() => window.__reviews.state().playing", 10, P=P); pg.wait_for_timeout(1500)
    lit = pg.evaluate("() => { const c = document.querySelector('#review canvas.cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 64) n += d[i] + d[i + 1] + d[i + 2] > 60; return n; }")
    need(lit > 0, "the logo didn't draw")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "reviews-desktop-playing.png"))
    seen = []
    for key in ["ArrowRight", "ArrowLeft", "ArrowUp"]:
        cur = pg.evaluate("() => window.__reviews.state().current"); seen.append(cur); pg.keyboard.press(key); pg.wait_for_timeout(450)
    # a drag to the right (✓) and one up (★)
    for dx, dy in ((340, 0), (0, -260)):
        cur = pg.evaluate("() => window.__reviews.state().current"); seen.append(cur)
        b = pg.evaluate("() => { const r = document.querySelector('#review .deck .card').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        pg.mouse.move(b[0], b[1]); pg.mouse.down(); pg.mouse.move(b[0] + dx / 2, b[1] + dy / 2, steps=5); pg.mouse.move(b[0] + dx, b[1] + dy, steps=5); pg.mouse.up(); pg.wait_for_timeout(450)
    cur = pg.evaluate("() => window.__reviews.state().current"); seen.append(cur)
    pg.click("#review .notebar button"); pg.fill("#review textarea[data-note]", "the typing is great"); pg.click("#review .acts [data-act=like]"); pg.wait_for_timeout(450)
    st = pg.evaluate("() => window.__reviews.state()")
    need(st["rated"] == {seen[0]: 3, seen[1]: 1, seen[2]: 5, seen[3]: 3, seen[4]: 5, seen[5]: 3} and st["view"] == "check", f"swipes: {st['rated']} ({seen}) view {st['view']}")
    pg.click("#review [data-a=done]"); wait_for(pg, "() => window.__reviews.state().view === 'h2h'", 10, P=P)
    pair = pg.evaluate("() => window.__reviews.state().pair"); need(sorted(pair) == sorted([seen[2], seen[4]]), f"which one? should be the two ★: {pair}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "reviews-which-one.png"))
    pg.click(f"#review .h2h [data-pick='{pair[1]}']"); wait_for(pg, "() => window.__reviews.state().view === 'end'", 10, P=P); pg.wait_for_timeout(500)
    end = pg.evaluate("() => ({ txt: document.querySelector('#review .panel').innerText, sent: window.__reviews.sent('logos'), pairs: window.__reviews.state().pairs })")
    sent = [json.loads(b) for k, b in P.fb if k == "review:logos"]; scores = {}; pairs = []; notes = {}
    for x in sent: scores.update(x["scores"]); pairs += x.get("pairs", []); notes.update(x.get("notes", {}))
    need(scores == st["rated"] and pairs == [[pair[1], pair[0]]] and notes == {seen[5]: "the typing is great"} and all(x["bkey"] == sent[0]["bkey"] for x in sent), f"sent: {sent}")
    need("in the loop (vesting)" in end["txt"] and end["sent"], f"the end: {end}")
    pg.evaluate("() => window.__reviews.close()"); pg.evaluate("() => window.__settings.open()"); pg.wait_for_timeout(300)
    row = pg.evaluate("() => (document.getElementById('reviewerRow') || {}).innerText || ''"); pg.evaluate("() => window.__settings.close()")
    need("in the loop (vesting)" in row, f"⚙ row: {row!r}")
    pg.evaluate("() => { window.__feedback.open('rev'); }"); wait_for(pg, "() => document.querySelectorAll('#oracle [data-review]').length === 2", 15, P=P)
    pg.click("#oracle [data-review=fonts]"); wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().view === 'card' && window.__reviews.state().kind === 'fonts'", 20, P=P)
    pg.close(); P.clean()
    return f"order b3b-crt (0 ratings) first, crt-off (30) last; card {size['area'] * 100:.0f}% of the lightbox; ▶ drew; → ← ↑ + drag → + drag ↑ + note → 1/3/5 scores; done → which one? (the two ★) → pair; {len(sent)} batches with the key; ⚙ in the loop (vesting); 🧪 → fonts deck"


def t_reviews_cliff(P):
    """Vesting with a cliff: 'in the loop (vesting)' until 14 days and 2 reviews (fake clock), then 'in the loop ✓' for good (still after
    the founding period; no Founder gift: it's hidden); a member who doesn't reach the cliff before the founding period ends is 'lapsed'."""
    pg = _rv_page(P); pg.evaluate("() => window.__reviews.join()")
    s0 = pg.evaluate("() => window.__reviews.team.status()")
    pg.evaluate("() => { const t = window.__reviews.test; t.done('logos'); t.done('fonts'); }"); s1 = pg.evaluate("() => window.__reviews.team.status()")
    pg.evaluate("() => { window.__reviews.test.done('x3'); window.__reviews.test.shift(10 * 864e5); }"); s2 = pg.evaluate("() => window.__reviews.team.status()")
    pg.evaluate("() => window.__reviews.test.shift(5 * 864e5)"); s3 = pg.evaluate("() => ({ s: window.__reviews.team.status(), off: window.__founder.off === true, avail: window.__founder.available() })")
    pg.evaluate("() => window.__reviews.test.shift(90 * 864e5)"); s4 = pg.evaluate("() => window.__reviews.team.status()")
    need(s0["state"] == "vesting" and s1["state"] == "vesting" and s2["state"] == "vesting" and s3["s"]["state"] == "vested" and s3["s"]["label"] == "in the loop ✓" and s3["off"] and not s3["avail"] and s4["state"] == "vested",
         f"the cliff: {s0['state']} → {s1['state']} → {s2['state']} → {s3} → {s4['state']}")
    pg.close(); P.clean()
    pg = _rv_page(P); pg.evaluate("() => { localStorage.removeItem('idle.team'); localStorage.removeItem('idle.reviews'); window.__reviews.join(); window.__reviews.test.shift(40 * 864e5); }"); s5 = pg.evaluate("() => ({ s: window.__reviews.team.status() })")
    need(s5["s"]["state"] == "lapsed", f"lapsed: {s5}")
    pg.close(); P.clean()
    return "vesting (2 reviews at day 0, still at day 10) → in the loop ✓ at day 15 (no Founder gift) → still ✓ after the founding period; no cliff before it ends → lapsed"


def t_founder_off(P):
    """The Founder gift is hidden everywhere (FOUNDER_ON = false), staging and local included: ?gift=founder and a personal link open
    nothing, an early world gets no offer, no ⚙ row, a Founder creature's badge isn't drawn; ?founder_test still runs it (the founder tests)."""
    P.gifts["abcdefghijklmnopqrstuvwx"] = {"letter": "hi", "claimed": False}
    for q in ("gift=founder&test", "gift=abcdefghijklmnopqrstuvwx&test", "founder&founder_before=2030-01-01&test"):
        pg = P.open("/arena.html?" + q); booted(pg); pg.wait_for_timeout(5000)
        r = pg.evaluate("() => { window.__settings.open(); const row = document.body.innerText.includes('Founder gift'); window.__settings.close(); return { off: window.__founder.off === true, letter: !!document.querySelector('#founderLetter,#founderOffer,#founderLab'), row, draw: typeof window.__founderDraw }; }")
        need(r["off"] and not r["letter"] and not r["row"] and r["draw"] == "undefined", f"?{q}: {r}"); pg.close()
    pg = P.open("/arena.html?gift=founder&test&founder_test"); booted(pg); wait_for(pg, "() => !!document.querySelector('#founderLetter')", 30, P=P); pg.close()
    # v13 (Nico: "hide the pedia's Founders section while the gift is hidden? yes please"): not in the pedia either (?founder_test shows it)
    for q, want_ in (("", False), ("?founder_test", True)):
        pg = P.open("/pedia.html" + q); wait_for(pg, "() => !!document.getElementById('storyline')", 20, P=P)
        f = pg.evaluate("() => ({ sec: !!document.getElementById('founders'), toc: [...document.querySelectorAll('a[href=\"#founders\"]')].length })")
        need(f["sec"] == want_ and (f["toc"] > 0) == want_, f"the pedia's Founders section (pedia.html{q}): {f}"); pg.close()
    P.clean()
    return "hidden: ?gift=founder, a personal link and an early world open nothing, no ⚙ row, no badge drawing, no pedia section; ?founder_test still opens the letter"


def t_reviews_cutscene(P, phone=False):
    """The 'here 👉' highlight is a cut-scene (idle-opwin.js): the Operator window shrinks away so it never covers the 🌱 (or ☰ on a
    phone) while the ring plays, comes back open, and the icon keeps a soft glow: kept across a reload, cleared by a click, or when its
    time is up."""
    pg = _rv_page(P); pg.evaluate("() => { window.__reviews.join(); window.__opwin.open(); }"); pg.wait_for_timeout(600)
    tid = pg.evaluate("() => window.__reviews.highlight()"); pg.wait_for_timeout(700)
    mid = pg.evaluate("""t => { const a = document.getElementById('lab').getBoundingClientRect(), b = document.getElementById(t).getBoundingClientRect(), op = getComputedStyle(document.getElementById('lab'));
      const hit = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top) && +op.opacity > 0.05; return { cutting: window.__opwin.cutting(), hit, ring: !!document.querySelector('.opHi'), opacity: +op.opacity }; }""", tid)
    need(tid in ("hitlBtn", "mMore") and mid["cutting"] and not mid["hit"] and mid["ring"], f"the cut-scene ({tid}): {mid}")
    wait_for(pg, "() => !window.__opwin.cutting()", 8, P=P); pg.wait_for_timeout(500)
    after = pg.evaluate("t => ({ open: window.__opwin.isOpen(), op: +getComputedStyle(document.getElementById('lab')).opacity, glow: window.__opwin.glowing(), cls: document.getElementById(t).classList.contains('opGlow') })", tid)
    need(after["open"] and after["op"] > 0.9 and after["glow"] == "#" + tid and after["cls"], f"after the cut-scene: {after}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "cutscene-glow" + ("-phone" if phone else "") + ".png"))
    pg.reload(); booted(pg); pg.wait_for_timeout(800)
    kept = pg.evaluate("t => ({ glow: window.__opwin.glowing(), cls: document.getElementById(t).classList.contains('opGlow') })", tid)
    need(kept["glow"] == "#" + tid and kept["cls"], f"the glow after a reload: {kept}")
    pg.evaluate("t => document.getElementById(t).click()", tid); pg.wait_for_timeout(300)
    gone = pg.evaluate("t => ({ glow: window.__opwin.glowing(), cls: document.getElementById(t).classList.contains('opGlow'), saved: localStorage.getItem('idle.opGlow') })", tid)
    need(gone["glow"] is None and not gone["cls"] and gone["saved"] is None, f"a click clears the glow: {gone}")
    pg.evaluate("t => { localStorage.setItem('idle.opGlow', JSON.stringify({ sel: '#' + t, until: Date.now() + 8000 })); }", tid); pg.reload(); booted(pg)
    t1 = pg.evaluate("() => window.__opwin.glowing()"); left = pg.evaluate("() => JSON.parse(localStorage.getItem('idle.opGlow') || '{}').until - Date.now()")
    pg.wait_for_timeout(max(0, (left or 0)) + 600); t2 = pg.evaluate("() => window.__opwin.glowing()")
    need(t1 == "#" + tid and t2 is None, f"the glow's time limit: {t1} → {t2}")
    pg.close(); P.clean()
    return f"{'phone' if phone else 'desktop'}: the Operator shrinks off the {tid} (no overlap) while the ring plays, comes back open; glow kept across a reload, cleared by a click, and by its time limit"


def t_reviews_timing(P):
    """When the invitation comes by itself (fake clock, stubbed storyline state): the storyline only after the end card (not while it's
    open, not before), or 20 s into its 🛝 playground; the playground after 3 minutes on screen and an interaction, at a quiet moment
    (not with a panel open, not while typing); never during Genesis."""
    pg = _rv_page(P); pg.evaluate("() => { localStorage.removeItem('idle.invite'); localStorage.removeItem('idle.team'); }")
    ev = lambda js: pg.evaluate(js)
    stub = "([st, end, un]) => { window.__genesis.state = () => st; window.__genesis.end = () => end; window.__genesis.unlocks = () => un; }"
    R = "() => ({ ready: window.__reviews.test.ready(), m: window.__reviews.moment(), busy: window.__reviews.test.busy(), quiet: window.__reviews.quiet(), y: window.__opwin && window.__opwin.yielding(), ae: document.activeElement && document.activeElement.id })"
    pg.evaluate(stub, [{"on": True, "mode": "story"}, {"open": False, "at": None}, {"story": True, "epoch": 0}]); g0 = ev(R)
    pg.evaluate(stub, [{"on": True, "mode": "story"}, {"open": False, "at": None}, {"story": True, "epoch": 1}]); s0 = ev(R)
    pg.evaluate(stub, [{"on": True, "mode": "story"}, {"open": True, "at": 1}, {"story": True, "epoch": 1}]); s1 = ev(R)
    pg.evaluate(stub, [{"on": True, "mode": "story"}, {"open": False, "at": 1}, {"story": True, "epoch": 1}]); s2 = ev(R)
    pg.evaluate("() => window.__feedback.open('road')"); pg.wait_for_timeout(500); s3 = ev(R); pg.evaluate("() => window.__feedback.close()"); pg.wait_for_timeout(500)
    pg.evaluate(stub, [{"on": True, "mode": "free", "fp": 1}, {"open": False, "at": 1}, {"story": False, "epoch": 1}]); f0 = ev(R)
    pg.evaluate("() => window.__reviews.test.shift(21000)"); f1 = ev(R)
    need(not g0["ready"] and not s0["ready"] and not s1["ready"] and s2["ready"] and not s3["ready"] and f0["m"]["mode"] == "story-play" and not f0["ready"] and f1["ready"],
         f"storyline timing: genesis {g0} · before the end card {s0} · card open {s1} · after it {s2} · roadmap open {s3} · 🛝 at 0 s {f0} · at 21 s {f1}")
    pg.evaluate(stub, [None, None, {"story": False, "epoch": 0}]); p0 = ev(R)
    ev("() => window.__reviews.test.onScreen(200)"); p1 = ev(R)
    ev("() => window.__reviews.test.onScreen(100)"); ev("() => window.__reviews.test.touch()"); p2 = ev(R)
    ev("() => window.__reviews.test.onScreen(200)"); p3 = ev(R)
    ev("() => window.__opwin.open()"); pg.wait_for_timeout(500); ev("() => document.getElementById('lab-text').focus()"); p4 = ev(R); ev("() => { document.activeElement && document.activeElement.blur(); window.__opwin.close(); }"); pg.wait_for_timeout(400)
    pg.evaluate("() => window.__feedback.open('tell')"); pg.wait_for_timeout(500); p5 = ev(R); pg.evaluate("() => window.__feedback.close()"); pg.wait_for_timeout(500)
    need(not p0["ready"] and not p1["ready"] and not p2["ready"] and p3["ready"] and p0["m"]["mode"] == "play" and not p5["ready"], f"playground timing: {p0} · 200 s, no touch {p1} · touch, 100 s {p2} · both {p3} · typing {p4} · 🧪 open {p5}")
    need(not p4["ready"] and p4["ae"] == "lab-text", f"typing in the Operator: {p4}")
    # and it really comes: auto on, the moment ready → Nico's message relayed once
    ev("() => window.__reviews.test.auto(true)"); wait_for(pg, "() => !!document.querySelector('.rvletter')", 15, P=P)
    pg.close(); P.clean()
    return "storyline: not in Genesis, not before or during the end card, not with the roadmap open, after the card ✓; 🛝 after 20 s ✓; playground: 3 min + an interaction ✓, not while typing or with 🧪 open; the message then comes"


def t_reviews_fresh(P):
    """A returning browser (Nov 4: 13 invites on day one): with an old funnel and old activity in localStorage, a fresh visit doesn't get
    the invitation before its own 3 minutes on screen and a click (nothing about time on screen carries over between visits); and the
    invitation's source is logged (rv_inv_auto here, rv_inv_link for a ?review= link)."""
    pg = _rv_page(P)
    pg.evaluate("() => { localStorage.setItem('idle.activeMs', '9000000'); localStorage.removeItem('idle.invite'); localStorage.removeItem('idle.team'); }")
    pg.reload(); booted(pg); pg.evaluate("() => { window.__idle.cfg.helper = location.origin; window.__reviews.test.fast(); window.__reviews.test.auto(true); }")
    pg.mouse.click(400, 400); pg.wait_for_timeout(11000)
    r = pg.evaluate("() => ({ letters: document.querySelectorAll('.rvletter').length, on: window.__reviews.test.onScreen(), ready: window.__reviews.test.ready() })")
    need(r["letters"] == 0 and r["on"] < 60 and not r["ready"], f"a fresh visit with old stored state: {r}")
    pg.evaluate("() => window.__reviews.test.onScreen(185)"); wait_for(pg, "() => !!document.querySelector('.rvletter')", 15, P=P)
    f = pg.evaluate("() => window.__funnel.reached()")
    need("rv_inv_auto" in f and "rv_inv_link" not in f, f"the source: {f}")
    pg.close()
    pg = P.open("/arena.html?review=logos&test"); booted(pg); pg.evaluate("() => { window.__idle.cfg.helper = location.origin; window.__reviews.test.fast(); }")
    wait_for(pg, "() => window.__funnel.reached().includes('rv_inv_link')", 30, P=P)
    pg.close(); P.clean()
    return f"old stored activity → nothing after 11 s ({r['on']} s counted this visit); 3 min + a click → the invitation, logged rv_inv_auto; a ?review= link → rv_inv_link"


def t_reviews_phone(P):
    """⭐ reviews at 375 px: the card is ≥ 70% of the lightbox and fills the width, no sideways scroll, ✕ ✓ ★ on screen."""
    pg = _rv_page(P); pg.evaluate("() => window.__reviews.join()"); pg.wait_for_timeout(200)
    pg.evaluate("() => window.__reviews.open('logos')"); wait_for(pg, "() => window.__reviews.state() && window.__reviews.state().view === 'card'", 40, P=P); pg.wait_for_timeout(800)
    r = pg.evaluate("() => { const b = document.querySelector('#review .box').getBoundingClientRect(), c = document.querySelector('#review .deck .card').getBoundingClientRect(), a = [...document.querySelectorAll('#review .acts button')].map(x => x.getBoundingClientRect()); return { w: innerWidth, h: innerHeight, area: (c.width * c.height) / (b.width * b.height), cw: c.width / innerWidth, sw: document.getElementById('review').scrollWidth, acts: a.every(x => x.bottom <= innerHeight && x.right <= innerWidth && x.left >= 0), btn: Math.round(a[0].height) }; }")
    need(r["area"] >= 0.7 and r["cw"] >= 0.9 and r["sw"] <= r["w"] and r["acts"] and r["btn"] >= 44, f"the deck at 375 px: {r}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "reviews-phone.png"))
    pg.evaluate("() => window.__reviews.close()"); pg.evaluate("() => window.__reviews.tab.open()"); wait_for(pg, "() => document.querySelectorAll('#hitl .rv').length >= 1", 10, P=P)
    t = pg.evaluate("() => { const r = document.getElementById('hitl').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, hl: window.__reviews.highlight(100) }; }")
    need(t["l"] >= 0 and t["r"] <= t["w"] and t["hl"] in ("hitlBtn", "mMore"), f"the 🌱 tab at 375 px: {t}")
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "hitl-tab-phone.png"))
    pg.close(); P.clean()
    return f"375 px: card {r['area'] * 100:.0f}% of the lightbox, {r['cw'] * 100:.0f}% of the width, no sideways scroll, buttons {r['btn']} px"


def t_founder_link(P):
    """Founder by a gift link (a brand-new browser): the letter right away; an expired link shows a note and no letter"""
    pg = P.open("/arena.html?gift=founder&founder_now=2027-06-01&test&founder_test")
    with contextlib.suppress(AssertionError): wait_for(pg, "() => document.body.innerText.includes('has expired')", 40, P=P)
    ex = pg.evaluate("() => ({ letter: !!document.querySelector('#founderLetter'), note: document.body.innerText.includes('has expired'), e: window.__founder.eligible() })")
    need(not ex["letter"] and ex["note"] and ex["e"]["expired"], f"an expired link: {ex}"); pg.close()
    pg = P.open("/arena.html?gift=founder&test&founder_test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    need(pg.evaluate("() => window.__funnel.reached().includes('fd_link') && window.__founder.eligible().link"), "the link should be counted")
    P.clean()
    return "expired link: a note, no letter; a valid link: the letter right away"

def t_founder_personal(P):
    """a personal gift link: Nico's own letter (not the general draft), opened once (one claim), read again in the same browser, then the
    creator; in another browser the same link says it was already opened; an unknown link says it isn't valid"""
    gid = "abcdefghijklmnopqrstuvwx"; P.gifts[gid] = {"letter": "Hi Sam!\n\nThanks for the bug report on Halloween night.\nThis one is for you.", "claimed": False}
    pg = P.open(f"/arena.html?gift={gid}&test&founder_test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    lt = pg.evaluate("() => ({ text: document.querySelector('#founderLetter .paper').innerText, draft: !!document.querySelector('#founderLetter .draft'), personal: document.querySelector('#founderLetter').dataset.personal, f: window.__funnel.reached() })")
    need("Hi Sam!" in lt["text"] and "Halloween night" in lt["text"] and "— Nico" in lt["text"] and not lt["draft"] and lt["personal"] == "1", f"the personal letter: {lt}")
    need("fd_personal" in lt["f"] and P.gifts[gid]["claims"] == 1, f"opened once: claims {P.gifts[gid].get('claims')}, funnel {lt['f']}")
    pg.click("#founderLetter .later"); pg.close()
    pg = P.open(f"/arena.html?gift={gid}&test&founder_test"); booted(pg)
    wait_for(pg, "() => !!document.querySelector('#founderLetter .paper')", 20, P=P)
    need("Hi Sam!" in pg.evaluate("() => document.querySelector('#founderLetter .paper').innerText") and P.gifts[gid]["claims"] == 1, "the same browser reads it again, with no second claim")
    pg.click("#founderLetter .open"); wait_for(pg, "() => !!document.querySelector('#founderLab canvas.prev')", 5, P=P)
    pg.fill('#founderLab .name input', "Sam's Spark"); pg.click('#founderLab .badges [data-b="spark"]'); pg.click('#founderLab [data-f="release"]'); pg.wait_for_timeout(800)
    one = pg.evaluate(FD_ONE); need(one and one["name"] == "Sam's Spark" and one["via"] == "link", f"released: {one}")
    P.clean(); pg.close()
    ctx2 = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); P2 = Page(ctx2, P.base); P2.gifts = P.gifts
    try:
        pg2 = P2.open(f"/arena.html?gift={gid}&test&founder_test")
        wait_for(pg2, "() => document.body.innerText.includes('already opened')", 40, P=P2)
        need(not pg2.evaluate("() => !!document.querySelector('#founderLetter')"), "another browser must not see the letter")
        pg2.close(); pg3 = P2.open("/arena.html?gift=zzzzzzzzzzzzzzzzzzzzzzzz&test&founder_test")
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
    pg = P.open("/arena.html?gift=founder&test&founder_test"); pg.set_viewport_size({"width": 390, "height": 844}); booted(pg)
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
    pg = P.open("/arena.html?story&test&noauto")
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


def t_title_auto(P):
    """The title card starts itself (Nov 4, HN: 19 of 26 story starts never pressed a key): with no key or tap for 2 s the intro starts muted
    (the audio stays suspended: no gesture yet), shows "🔊 tap for sound", keeps moving to the dark on its own clock with the logo drawn; a tap
    then turns the sound on and hides the chip; a key during the title card still starts it with sound; the story arm does the same"""
    SUSP = "() => { try { const c = window.__audio && window.__audio.ctx(); if (c && c.state === 'running') c.suspend(); return true; } catch (e) { return false; } }"
    # 1. no input at all: auto-start, muted, chip, and on to the dark without sound (headless allows autoplay, so the test suspends the audio first)
    pg = P.open("/arena.html?story&test")
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    pg.evaluate(SUSP); t0 = time.time()
    wait_for(pg, "() => !window.__epoch0.waiting()", 6, P=P); t_auto = time.time() - t0
    need(t_auto <= 2.6, f"the title card should start itself within ~2 s, took {t_auto:.1f} s")
    a = pg.evaluate("""() => { const b = document.querySelector('#idleIntro .snd'), r = b && b.getBoundingClientRect();
      return { auto: window.__epoch0.autoMuted(), chip: !!b && getComputedStyle(b).display !== 'none' && b.classList.contains('tap') && /tap for sound/.test(b.textContent), w: r ? r.width : 0,
        state: window.__audio.ctx().state, f: window.__funnel.reached(), sounding: window.__epoch0.sounding() }; }""")
    need(a["auto"] and a["chip"] and a["state"] != "running" and not a["sounding"] and "title_auto" in a["f"], f"auto-start should be muted with the chip shown: {a}")
    t1 = pg.evaluate("() => window.__epoch0.time()"); s1 = pg.screenshot(); pg.wait_for_timeout(1500)
    t2 = pg.evaluate("() => window.__epoch0.time()"); s2 = pg.screenshot()
    need(t2 - t1 > 1.0 and s1 != s2, f"the film should keep moving while muted: {t1:.2f} → {t2:.2f}, frames differ {s1 != s2}")
    wait_for(pg, "() => window.__funnel.reached().includes('landing') || (window.__genesis && window.__genesis.landing && window.__genesis.landing().phase === 'dark')", 120, P=P)
    b = pg.evaluate("() => ({ state: window.__audio.ctx().state, f: window.__funnel.reached(), logo: window.__epoch0.last && window.__epoch0.last.logo ? { arm: window.__epoch0.last.logo.arm, shown: !!window.__epoch0.last.logo.shown, broken: !!window.__epoch0.last.logo.broken } : null })")
    # (headless Chromium lets later code resume the audio without a gesture, which a real browser refuses; so this checks only that nothing counted as a tap)
    need("sound_on" not in b["f"], f"no tap happened, so no sound_on: {b}")
    need(not b["logo"] or (b["logo"]["shown"] and not b["logo"]["broken"] and ("lg_shown:" + b["logo"]["arm"]) in b["f"]), f"the logo should draw while muted: {b}")
    pg.evaluate("() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }"); pg.close(); P.clean()
    # 2. auto-start, then a tap anywhere turns the sound on and hides the chip
    pg = P.open("/arena.html?story&test")
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    pg.evaluate(SUSP); wait_for(pg, "() => window.__epoch0.autoMuted()", 6, P=P)
    pg.mouse.click(200, 200)
    wait_for(pg, "() => window.__audio.ctx().state === 'running' && window.__epoch0.sounding() && !window.__epoch0.autoMuted()", 10, P=P)
    c = pg.evaluate("() => { const b = document.querySelector('#idleIntro .snd'); return { chipTap: !!b && b.classList.contains('tap'), shown: !!b && getComputedStyle(b).display !== 'none', f: window.__funnel.reached(), paused: window.__epoch0.paused() }; }")
    need(not c["chipTap"] and not c["shown"] and "sound_on" in c["f"] and not c["paused"], f"a tap should turn the sound on and hide the chip (not pause): {c}")
    pg.evaluate("() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }"); pg.close(); P.clean()
    # 3. a key during the title card: starts at once, with sound, no chip
    pg = P.open("/arena.html?story&test")
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    pg.keyboard.press("Enter")
    wait_for(pg, "() => !window.__epoch0.waiting() && window.__epoch0.sounding()", 10, P=P)
    d = pg.evaluate("() => ({ auto: window.__epoch0.autoMuted(), f: window.__funnel.reached() })")
    need(not d["auto"] and "title_auto" not in d["f"], f"a key should start it with sound, not as an auto-start: {d}")
    pg.evaluate("() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }"); pg.close(); P.clean()
    # 4. the story arm (a new browser) does the same
    pg = P.open("/arena.html?arm=story")
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    pg.evaluate(SUSP); wait_for(pg, "() => window.__epoch0.autoMuted() && !window.__epoch0.waiting()", 6, P=P)
    P.clean()
    return f"auto-start in {t_auto:.1f} s, muted with the chip; moved {t2 - t1:.1f} s in 1.5 s; reached the dark silent (logo {b['logo']['arm'] if b['logo'] else '-'}); tap → sound; key → sound; story arm auto-starts"


def t_ios_sound(P, ios=True):
    """iPhones (Nov 3: the silent switch muted everything for Nico): the page asks iOS to treat its sound as media (audioSession 'playback',
    or a silent looping <audio> on older iOS), a hint under "tap to start", and a one-time toast in the playground; desktop gets none of it"""
    if not ios:
        pg = P.open("/arena.html?story&test&noauto")
        wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
        pg.wait_for_timeout(800)
        d = pg.evaluate("() => ({ ios: window.__isIOS(), hint: window.__iosHint(), shown: window.__titleHint || null })")
        need(not d["ios"] and d["hint"] is None and d["shown"] is None, f"no iOS hint on desktop: {d}"); P.clean()
        return "desktop: no hint, no media session"
    # 1) the title card's hint, and audioSession set to playback on the first tap (the API stubbed: WebKit builds differ)
    P.ctx.add_init_script("try { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); } catch (e) {}")
    pg = P.open("/arena.html?story&test&noauto")
    wait_for(pg, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40, P=P)
    wait_for(pg, "() => !!window.__titleHint", 10, P=P)
    h = pg.evaluate("() => window.__titleHint")
    need("silent switch" in h and "best with sound" in h, f"the title card's hint: {h}")
    if os.environ.get("IDLE_SHOTS"): pg.screenshot(path=os.path.join(os.environ["IDLE_SHOTS"], "ios-title-hint.png"))
    b = pg.evaluate("() => window.__titleHintBox")
    need(b["fs"] >= 16 and b["maxW"] <= b["W"] - 32, f"the title card's hint must be ≥ 16 px and fit inside a 16 px margin: {b}")
    pg.touchscreen.tap(190, 400); pg.wait_for_timeout(800)
    s1 = pg.evaluate("() => window.__iosMedia.state()")
    need(s1["ios"] and s1["session"] == "playback" and not s1["fallback"], f"audioSession should be 'playback' with no fallback: {s1}")
    pg.close()
    # 2) older iOS (no audioSession): the silent <audio> starts on the first tap, pauses on mute; the playground's one-time toast
    P.ctx.add_init_script("try { Object.defineProperty(navigator, 'audioSession', { value: undefined, configurable: true }); } catch (e) {} try { localStorage.removeItem('idle.iosHint'); } catch (e) {}")
    pg = P.open("/arena.html?fresh=1"); booted(pg)
    pg.touchscreen.tap(190, 400); pg.wait_for_timeout(1500)
    s2 = pg.evaluate("() => ({ m: window.__iosMedia.state(), toast: !!window.__iosToastShown, muted: window.__audio.muted() })")
    need(s2["m"]["session"] is None and s2["m"]["fallback"] and s2["m"]["playing"], f"the silent <audio> should play after the tap: {s2}")
    need(s2["toast"], f"the playground's one-time hint should show: {s2}")
    if os.environ.get("IDLE_SHOTS"): pg.screenshot(path=os.path.join(os.environ["IDLE_SHOTS"], "ios-toast.png"))
    tb = pg.evaluate("() => { const t = document.getElementById('iosHintToast'); if (!t) return null; const r = t.getBoundingClientRect(), cs = getComputedStyle(t); return { fs: parseFloat(cs.fontSize), l: r.left, r: r.right, W: innerWidth, b: r.bottom, H: innerHeight }; }")
    need(tb and tb["fs"] >= 16 and tb["l"] >= 15.5 and tb["r"] <= tb["W"] - 15.5 and tb["b"] <= tb["H"], f"the playground toast must be ≥ 16 px and inside the screen with a 16 px margin: {tb}")
    pg.evaluate("() => window.__audio.setMuted(true)"); pg.wait_for_timeout(300)
    s3 = pg.evaluate("() => window.__iosMedia.state()")
    need(not s3["playing"], f"muting Id|le pauses the silent <audio>: {s3}")
    pg.evaluate("() => window.__audio.setMuted(false)")
    P.clean()
    return f"hint '{h}' at {b['fs']} px in {b['lines']} lines; toast {tb['fs']:.0f} px; audioSession → playback; fallback <audio> plays, pauses on mute; playground toast once"


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


def t_arm_reload(P):
    """Nov 4 launch bug: the service worker's one-time isolation reload (?_coi=1) can reload a first visit right after genesis boot() saved
    S (n: 1); story-arm newcomers then landed in the chooser. A reload before any story progress must keep each arm's first screen: story →
    the title card (never the chooser), choose → the chooser, play → the playground with at most one welcome; funnel moments stay once."""
    out = []
    for arm in ("story", "choose", "play"):
        ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base)
        try:
            q = Q.open(f"/arena.html?arm={arm}&test")
            if arm == "story":
                wait_for(q, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40)
            elif arm == "choose":
                wait_for(q, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 40)
            else:
                booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
            saved = q.evaluate("() => JSON.parse(localStorage.getItem('idle.genesis') || 'null')")
            q.goto(P.base + f"/arena.html?arm={arm}&test&_coi=1")   # the isolation reload, before any story progress
            if arm == "story":
                wait_for(q, "() => (!!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1') || !!document.querySelector('#genChoose')", 40)
                r = q.evaluate("() => ({ title: !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1', chooser: !!document.querySelector('#genChoose'), f: window.__funnel.reached() })")
                need(r["title"] and not r["chooser"], f"story arm after a reload: the title card, not the chooser: {r} (saved before the reload: {saved})")
            elif arm == "choose":
                wait_for(q, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 40); q.wait_for_timeout(800)
                n = q.evaluate("() => document.querySelectorAll('#genChoose').length"); need(n == 1, f"choose arm after a reload: one chooser, got {n}")
            else:
                booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
                r = q.evaluate("() => ({ intro: !!document.querySelector('#idleIntro'), chooser: !!document.querySelector('#genChoose'), void: !!window.__genesisVoid })")
                need(not r["intro"] and not r["chooser"] and not r["void"], f"play arm after a reload: the playground: {r}")
            st = q.evaluate("() => JSON.parse(localStorage.getItem('idle.funnel') || '{}')")
            need(all(v == 1 for v in st.values()), f"funnel moments stay once after a reload: {st}")
            out.append(arm)
        finally:
            ctx.close()
    P.clean()
    return "after the isolation reload: " + ", ".join(out) + " keep their first screen"


def t_stats_first(P):
    """Nov 4: first reports looked lost (by report order #1 27 vs #2 59 on production before 05:55). One page load must count its visit
    exactly once: a visit report 3 s after the page is on screen; a page the isolation reload replaces (idle-runtime.js coiReload) sends
    nothing, so the reloaded page's visit is the only one; the report order (bi) starts at 1 and the visit rides in #1."""
    out = {}
    for case in ("plain", "coi"):
        P.stats.clear()
        ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base, P.stats)
        try:
            q = Q.open("/arena.html?statstest&test")
            if case == "coi":
                q.wait_for_timeout(1200)
                q.evaluate("() => { window.__coiReloading = true; window.__stats._send('leave'); }")   # what the replaced page does on pagehide
                q.wait_for_timeout(300); before = len(P.stats)
                need(before == 0, f"a page being replaced by the isolation reload must report nothing: {[json.loads(b) for b in P.stats]}")
                q.goto(P.base + "/arena.html?statstest&test&_coi=1")
            q.wait_for_timeout(4200)
            q.evaluate("() => window.__stats._send('3m')"); q.wait_for_timeout(500)
            rows = [x for x in map(json.loads, P.stats) if "aa" not in x]
            visits = [x for x in rows if x.get("visit") == 1]
            need(len(visits) == 1, f"{case}: exactly one visit report per page load, got {len(visits)}: {[(x.get('bi'), x.get('why')) for x in rows]}")
            need(visits[0].get("bi") == 1, f"{case}: the visit rides in report #1: {[(x.get('bi'), x.get('why'), x.get('visit')) for x in rows]}")
            need(sorted(x.get("bi") for x in rows) == list(range(1, len(rows) + 1)), f"{case}: report order 1..n: {[x.get('bi') for x in rows]}")
            out[case] = [(x.get("bi"), x.get("why")) for x in rows]
        finally:
            ctx.close()
    P.clean()
    return "one visit per page load, in report #1: " + "; ".join(f"{k} {v}" for k, v in out.items())


def t_arm_stats(P):
    """Nov 4: production showed choose and story arms but no play arm. Each arm's fresh browser must send its arm with its visit report."""
    got, beacons = {}, {}
    for arm in ("story", "choose", "play"):
        P.stats.clear()
        ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base, P.stats)
        try:
            q = Q.open(f"/arena.html?arm={arm}&statstest&test"); q.wait_for_timeout(6000)
            q.evaluate("() => window.__stats && window.__stats._send('3m')"); q.wait_for_timeout(800)
            sent = [json.loads(b) for b in P.stats]
            got[arm] = [(x.get("why"), x.get("visit"), x.get("gv")) for x in sent if "aa" not in x]
            beacons[arm] = [x for x in sent if "aa" in x]
            q.reload(); q.wait_for_timeout(2500)
            beacons[arm] += [x for x in [json.loads(b) for b in P.stats] if "aa" in x][len(beacons[arm]):]   # a reload sends no second beacon
        finally:
            ctx.close()
    for arm, rows in got.items():
        need(any(v == 1 and g == arm for _, v, g in rows), f"the {arm} arm's visit report must carry gv={arm}: {got}")
        need(beacons.get(arm) == [{"v": 1, "aa": arm}], f"the {arm} arm sends one arm beacon with only v and aa: {beacons}")
    P.clean()
    return "visit reports carry their arm: " + ", ".join(f"{a} {len(r)} reports" for a, r in got.items())


def t_story_arms(P):
    """The storyline's A/B/C (v15, Nico: "A: user goes into storyline mode, B: user sees choice screen, C: user goes directly to playground"),
    off by default: a NEW browser with ?arm=story goes straight into the story (the title card); ?arm=choose gets the chooser (📖 / 🛝);
    ?arm=play gets the playground's ready world, and on its first visit the floating Operator welcomes it and offers [ 📖 start the story ]
    (snapshot first, then the story) and points at ⚙; the two-arm 'current' migrates to 'play'; a browser that already has a world keeps it."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    off = pg.evaluate("() => ({ ab: window.__genesis.ab, v: window.__genesis.variant(), gv: localStorage.getItem('idle.gv'), arms: window.__genesis.arms })")
    need(off["ab"] == "on" and off["v"] is None and off["gv"] is None and off["arms"] == ["story", "choose", "play"], f"the A/B/C is on (Nov 4 launch), three arms; a ?test page gets no random arm: {off}")
    wait_for(pg, "() => !!localStorage.getItem('arena.autosave')", 30, P=P)
    ret = P.open("/arena.html?arm=story&test"); booted(ret); ret.wait_for_timeout(3000)   # this browser has a world: it keeps it
    r = ret.evaluate("() => ({ intro: !!document.querySelector('#idleIntro'), void: !!window.__genesisVoid, c: window.__arena.raw().filter(c => !c.lab).length })")
    need(not r["intro"] and not r["void"] and r["c"] > 0, f"a returning browser in the story arm keeps its world: {r}")
    out = []
    for arm in ("story", "choose", "play", "current"):   # new browsers: a fresh context each ('current': a two-arm key from before v15)
        ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base)
        try:
            if arm == "current":
                q = Q.open("/privacy.html"); q.evaluate("() => localStorage.setItem('idle.gv', 'current')"); q.close()
                q = Q.open("/arena.html?test"); booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
                m = q.evaluate("() => ({ v: window.__genesis.variant(), gv: localStorage.getItem('idle.gv'), arm: window.__funnel.arm(), intro: !!document.querySelector('#idleIntro') })")
                need(m == {"v": "play", "gv": "play", "arm": "play", "intro": False}, f"the two-arm 'current' becomes 'play': {m}"); out.append("current→play"); continue
            q = Q.open(f"/arena.html?arm={arm}&test")
            if arm == "story":
                wait_for(q, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40)
                st = q.evaluate("() => ({ v: window.__genesis.variant(), arm: window.__funnel.arm() })"); need(st == {"v": "story", "arm": "story"}, f"the story arm starts the story: {st}")
            elif arm == "choose":
                wait_for(q, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 40)
                ch = q.evaluate("() => ({ v: window.__genesis.variant(), arm: window.__funnel.arm(), ms: [...document.querySelectorAll('#genChoose button[data-m]')].map(b => b.dataset.m), intro: !!document.querySelector('#idleIntro') })")
                need(ch["v"] == "choose" and ch["arm"] == "choose" and ch["ms"][:2] == ["story", "ready"] and not ch["intro"], f"the choose arm gets the chooser (📖 first, then 🛝): {ch}")
                q.click("#genChoose button[data-m=ready]"); booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
                need("ch_play" in q.evaluate("() => window.__funnel.reached()") and q.evaluate("() => localStorage.getItem('idle.storyOffer')") == "chose", "the chooser's playground: counted, and no storyline offer after it")
            else:
                booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
                pl = q.evaluate("() => ({ v: window.__genesis.variant(), arm: window.__funnel.arm(), intro: !!document.querySelector('#idleIntro'), void: !!window.__genesisVoid, chooser: !!document.querySelector('#genChoose') })")
                need(pl == {"v": "play", "arm": "play", "intro": False, "void": False, "chooser": False}, f"the play arm: the playground's ready world: {pl}")
                q.mouse.click(700, 450)   # the first tap: the welcome follows ~1.5 s later
                wait_for(q, "() => window.__opwin.tray().chips.includes('📖 start the story') && !!document.querySelector('.opHi')", 15)
                w = q.evaluate("() => ({ open: window.__opwin.isOpen(), thread: document.querySelector('#ai-thread').textContent, lines: window.__genesis.welcome.lines, after: window.__genesis.welcome.after, hi: document.querySelectorAll('.opHi').length, offer: !!document.querySelector('#storyOffer'), fun: window.__funnel.reached(), pw: localStorage.getItem('idle.playWelcome') })")
                need(w["open"] and all(l in w["thread"] for l in w["lines"]) and w["after"] in w["thread"] and w["hi"] >= 1 and not w["offer"] and "pw_shown" in w["fun"] and w["pw"] == "shown",
                     f"the play arm's welcome: the Operator says it, offers the story, points at ⚙ (no separate storyline offer): {w}")
                need("cutting-edge things Id|le's consciousness is dreaming up" in w["thread"], "Nico's line in the welcome")
                snaps0 = q.evaluate("() => JSON.parse(localStorage.getItem('arena.snaps') || '[]').length")
                q.click("#opTray .opc.glow")
                wait_for(q, "() => !!document.querySelector('#idleIntro') || !!window.__genesisVoid", 40)
                after = q.evaluate("() => ({ mode: window.__genesis.mode(), fun: window.__funnel.reached(), snaps: JSON.parse(localStorage.getItem('arena.snaps') || '[]').length })")
                need(after["mode"] == "story" and "pw_story" in after["fun"] and after["snaps"] > snaps0, f"[ 📖 start the story ]: the world kept as a snapshot, then the story: {snaps0} → {after}")
                q.close(); q = Q.open("/arena.html?test"); booted(q); q.mouse.click(700, 450); q.wait_for_timeout(3000)
                need(q.evaluate("() => !window.__opwin.tray().chips.includes('📖 start the story')"), "the welcome is once per browser")
            out.append(arm)
        finally:
            ctx.close()
    P.clean()
    return "on (Nov 4), three arms; a ?test page gets no random arm; returning browser keeps its world; story → the title card; choose → the chooser (🛝 counted, no offer after); play → the ready world, the Operator's welcome (once), [ 📖 start the story ] → snapshot + story; 'current' → 'play'"


def t_story_offer(P):
    """The storyline offer (returning players, the other arm): shown once per browser (remembered); accepting keeps the world as a snapshot
    and starts the story."""
    pg = P.open("/arena.html?fresh=1&test&offer=old"); booted(pg)
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


def t_story_offer_v2(P):
    """The storyline offer v2 (Nov 4: v1 shown 22 times at load, accepted 0): variants a (timed card), b (card with a silent logo preview),
    c (the Operator's line + a chip). Each waits for time on screen AND an interaction, never shows over an open panel, takes a snapshot first
    when accepted, and 'later' asks once more days later, then never."""
    out = []
    for v in "abc":
        pg = P.open(f"/arena.html?fresh=1&test&offer={v}&offerms=1500"); booted(pg)
        pg.evaluate("() => { localStorage.removeItem('idle.storyOffer2'); localStorage.removeItem('idle.storyOffer'); localStorage.removeItem('idle.genesis'); }"); pg.reload(); booted(pg)
        pg.wait_for_timeout(2500)
        need(not pg.evaluate("() => !!document.querySelector('#storyOffer') || /Doc's story/.test(document.body.innerText)"), f"{v}: shown before any interaction")
        pg.evaluate("() => { window.__idle.cfg.helper = location.origin; document.getElementById('oracleBtn').click(); }"); pg.wait_for_timeout(400)
        pg.evaluate("() => (document.querySelector('#topbar') || document.querySelector('#minimap')).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
        pg.wait_for_timeout(2000)
        st = pg.evaluate("() => window.__genesis.offerState()")
        need(st["last"] is None, f"{v}: shown over the open 🧪 panel: {st}")
        pg.evaluate("() => { window.__feedback.close(); document.querySelectorAll('#ntf .np').forEach(n => n.remove()); }")   # a ?fresh toast shares the corner; the offer waits for toasts
        if v == "c":
            wait_for(pg, "() => [...document.querySelectorAll('#opTray .opc')].some(b => /start the story/.test(b.textContent))", 15, P=P)
            txt = pg.evaluate("() => document.body.innerText")
            need("Doc's story" in txt, f"c: the Operator's line: {txt[-300:]!r}")
            go = "() => [...document.querySelectorAll('#opTray .opc')].find(b => /start the story/.test(b.textContent)).click()"
        else:
            try: wait_for(pg, "() => !!document.querySelector('#storyOffer')", 15, P=P)
            except AssertionError: need(False, f"{v}: no card: {pg.evaluate('() => { const s = window.__genesis.offerState(); delete s.text; return s; }')}")
            t = pg.inner_text("#storyOffer"); need("Doc's story" in t and ("snapshot" in t or "safe" in t), f"{v}: the card: {t!r}")
            if v == "b":
                wait_for(pg, "() => { const c = document.querySelector('#storyOffer canvas.pv'); return c && (+c.dataset.frames > 5 || c.dataset.still); }", 20, P=P)
                lit = pg.evaluate("() => { const c = document.querySelector('#storyOffer canvas.pv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 120) n++; return { n, frames: +c.dataset.frames || 0, still: !!c.dataset.still }; }")
                need(lit["n"] > 20, f"b: the preview draws nothing: {lit}")
            go = "() => document.querySelector('#storyOffer .go').click()"
        f0 = pg.evaluate("() => window.__funnel.reached()")
        need("offer_shown" in f0 and f"offer_shown_{v}" in f0, f"{v}: funnel: {f0}")
        n0 = pg.evaluate("() => (JSON.parse(localStorage.getItem('arena.snaps') || '[]') || []).length")
        pg.evaluate(go); wait_for(pg, "() => !!document.querySelector('#idleIntro')", 20, P=P)
        n1 = pg.evaluate("() => (JSON.parse(localStorage.getItem('arena.snaps') || '[]') || []).length")
        f1 = pg.evaluate("() => ({ f: window.__funnel.reached(), s: JSON.parse(localStorage.getItem('idle.storyOffer2')) })")
        need(n1 == n0 + 1 and f"offer_go_{v}" in f1["f"] and f1["s"]["ans"] == "accepted", f"{v}: accepted → snapshot then story: {n0}→{n1}, {f1}")
        pg.keyboard.press("Escape"); P.clean(); out.append(f"{v} ✓")
    # later: asks once more, days later, then never
    pg = P.open("/arena.html?fresh=1&test&offer=a&offerms=0"); booted(pg)
    pg.evaluate("() => { localStorage.removeItem('idle.storyOffer2'); localStorage.removeItem('idle.storyOffer'); localStorage.removeItem('idle.genesis'); }"); pg.reload(); booted(pg)
    pg.evaluate("() => (document.querySelector('#topbar') || document.querySelector('#minimap')).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
    wait_for(pg, "() => !!document.querySelector('#storyOffer')", 15, P=P)
    pg.click("#storyOffer .lt"); pg.wait_for_timeout(500)
    r = pg.evaluate("""() => { const G = window.__genesis, o1 = JSON.parse(localStorage.getItem('idle.storyOffer2')), again = G.offer();
      const o = JSON.parse(localStorage.getItem('idle.storyOffer2')); o.at = Date.now() - 4 * 864e5; localStorage.setItem('idle.storyOffer2', JSON.stringify(o));
      document.querySelector('#storyOffer') && document.querySelector('#storyOffer').remove(); const second = G.offer(); document.querySelector('#storyOffer .lt').click();
      const o2 = JSON.parse(localStorage.getItem('idle.storyOffer2')); o2.at = Date.now() - 40 * 864e5; localStorage.setItem('idle.storyOffer2', JSON.stringify(o2));
      return { o1, again, second, third: (document.querySelector('#storyOffer') && document.querySelector('#storyOffer').remove(), G.offer()), n: o2.n }; }""")
    need(r["o1"]["ans"] == "later" and r["o1"]["n"] == 1 and r["again"] is False and r["second"] is True and r["third"] is False and r["n"] == 2, f"later → once more days later → never: {r}")
    # v1 browsers (shown at load before v2) get one more, better-timed ask
    m = pg.evaluate("() => { localStorage.removeItem('idle.storyOffer2'); localStorage.setItem('idle.storyOffer', 'dismissed'); return window.__genesis.offerState().seen; }")
    need(m["n"] == 1 and m["ans"] == "later", f"a v1 'dismissed' browser: {m}")
    P.clean()
    return " · ".join(out) + "; nothing before an interaction or over 🧪; later → once more after 3 days → never; v1 dismissals get one more ask"


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



def t_story_first_paint(P, root, phone=False):
    """A story start is black from the first paint (Nov 4, Nico: "?story briefly loads the full game in the background, I can see
    flash/flicker the floor, some objects and creatures"): on the production hostname, /?story and a new browser drawn into the story arm
    are filmed from navigation with the browser's own screencast (every painted frame) and again across a reload (the service worker's
    first-visit reload), while the page logs every animation frame; every frame painted before the story's own black (#genBlack) or the
    intro (#idleIntro) is up must be black, and the world and the loading cover's resident are never visible before it. The choose and play
    arms never get the black (their loading is unchanged)."""
    import io
    from PIL import Image
    P.base, P.root = "https://id-le.com", root
    opts = dict(PHONE) if phone else {"viewport": {"width": 1400, "height": 900}}
    LOG = """(() => { const t0 = Date.now(), fp = window.__fp = { cover: 0, bad: [], frames: 0, origin: performance.timeOrigin };
      const vis = e => { if (!e) return false; const s = getComputedStyle(e); return s.visibility === 'visible' && s.display !== 'none' && +s.opacity > 0; };
      const tick = () => { fp.frames++; const c = document.getElementById('genBlack') || document.getElementById('idleIntro') || document.getElementById('genChoose');
        if (c && !fp.cover) fp.cover = Date.now();
        if (!fp.cover && document.body && (vis(document.getElementById('arena')) || vis(document.getElementById('boot')))) fp.bad.push(Date.now() - t0);
        if (Date.now() - t0 < 20000) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })();"""
    def film(q, cdp, go):
        shots = []
        def on_frame(ev):
            try:
                img = Image.open(io.BytesIO(base64.b64decode(ev["data"]))).convert("L"); px = list(img.getdata())
                shots.append({"ts": ev["metadata"]["timestamp"], "mean": sum(px) / len(px)})
            except Exception: pass
            try: cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
            except Exception: pass
        cdp.on("Page.screencastFrame", on_frame)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 40, "maxWidth": 240, "maxHeight": 240, "everyNthFrame": 1})
        go(); wait_for(q, "() => window.__fp && window.__fp.cover > 0", 60)
        q.wait_for_timeout(300); cdp.send("Page.stopScreencast")
        fp = q.evaluate("() => window.__fp"); return shots, fp
    def check(shots, fp, what):
        cover = fp["cover"] / 1000
        # painted by this document (after its navigation began; earlier frames are the previous page or the blank tab) and before the story's black was in it
        before = [s for s in shots if fp["origin"] / 1000 + 0.05 < s["ts"] < cover - 0.02]
        need(fp["frames"] >= 3, f"{what}: the page logged no frames: {fp}")
        need(not fp["bad"], f"{what}: the world or the loading cover was visible before the story's black, at ms {fp['bad'][:6]}")
        bright = [round(s["mean"], 1) for s in before if s["mean"] > 6]
        need(not bright, f"{what}: {len(bright)} of {len(before)} frames before the story's black were not black (mean luminance {bright[:6]})")
        return len(shots), len(before)
    out_ = []
    for rnd, path, what in ((0.5, "/?story", "/?story"), (0.01, "/", "a new browser in the story arm")):
        ctx = P.ctx.browser.new_context(service_workers="block", **opts); ctx.add_init_script(f"Math.random = () => {rnd};"); ctx.add_init_script(LOG)
        Q = Page(ctx, P.base); Q.root = root
        try:
            q = ctx.new_page(); cdp = ctx.new_cdp_session(q)
            out_.append(check(*film(q, cdp, lambda: q.goto(P.base + path, wait_until="commit")), what))
            wait_for(q, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title !== undefined", 40)
            need(not q.evaluate("() => document.documentElement.classList.contains('story-boot')"), f"{what}: the first-paint black must lift once the story is up")
            # the service worker's first-visit reload comes moments after the first load: the same address again, nothing kept from the story yet
            q.goto(P.base + "/about:blank".replace("/about:blank", "/privacy.html"), wait_until="commit"); q.evaluate("() => { for (const k of Object.keys(localStorage)) if (!/^idle\\.gv/.test(k)) localStorage.removeItem(k); }")
            out_.append(check(*film(q, cdp, lambda: q.goto(P.base + path, wait_until="commit")), what + " (loaded again)"))
        finally:
            ctx.close()
    for rnd, want in ((0.5, "choose"), (0.99, "play")):   # the other arms: no black, their loading as before
        ctx = P.ctx.browser.new_context(service_workers="block", **opts); ctx.add_init_script(f"Math.random = () => {rnd};"); Q = Page(ctx, P.base); Q.root = root
        try:
            q = ctx.new_page(); q.goto(P.base + "/", wait_until="domcontentloaded")
            need(not q.evaluate("() => document.documentElement.classList.contains('story-boot')"), f"the {want} arm must not get the story's black")
            if want == "choose": wait_for(q, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 40)
            else: wait_for(q, "() => window.__arena && window.__arena.raw().filter(c => !c.lab).length >= 3", 40)
            v = q.evaluate("() => localStorage.getItem('idle.gv')"); need(v == want, f"the {want} arm: idle.gv={v}")
        finally:
            ctx.close()
    return f"{'phone' if phone else 'desktop'}: {sum(a for a, b in out_)} frames filmed, {sum(b for a, b in out_)} before the story's black, all black; choose and play unchanged"

def t_prod_gates(P, root):
    """id-le.com (the production hostname, served from the build, nothing leaves the browser), as launched on Nov 4 (Nico's go): the
    storyline and the A/B/C split are live (a new browser gets story / choose / play, a third each; ?arm= is ignored there); a returning
    world stays put and gets the storyline offer once; fonts, 🧪, presence and reviews are on; the Founder gift is off; keyframes are inert"""
    P.base, P.root = "https://id-le.com", root
    seed = P.open("/arena.html?fresh=1&test"); booted(seed); wait_for(seed, "() => !!localStorage.getItem('arena.autosave')", 30, P=P); seed.close()
    pg = P.open("/arena.html"); booted(pg)   # a returning browser (it has a world): no arm, the world stays, the offer comes once
    wait_for(pg, "() => !!document.querySelector('#storyOffer')", 40, P=P)
    r = pg.evaluate("""async () => { await document.fonts.ready; return { host: location.hostname, live: window.__genesis.storyLive(), void: !!window.__genesisVoid,
      intro: !!document.querySelector('#idleIntro'), offer: !!document.querySelector('#storyOffer'), founder: window.__founder.available(), v: window.__genesis.variant(),
      c: window.__arena.raw().filter(c => !c.lab).length,
      f3: document.fonts.check('16px "Idle F3"') || [...document.fonts].some(f => /F3/.test(f.family) && f.status === 'loaded'),
      ui: getComputedStyle(document.body).fontFamily.split(',')[0], sci: !!document.getElementById('oracleBtn') }; }""")
    need(r["host"] == "id-le.com" and r["live"], f"not emulating production (or the story isn't live): {r}")
    need(r["offer"] and not r["void"] and not r["intro"] and r["v"] is None and r["c"] > 0, f"a returning world keeps its world and gets the offer: {r}")
    pg.evaluate("() => document.querySelector('#storyOffer .x').click()"); pg.wait_for_timeout(500)
    need(pg.evaluate("() => window.__genesis.offer()") is False, "the offer shows once per browser")
    # presence: ON on id-le.com since Nico's go (11-03); the beats carry only the allowlisted fields; a ?fresh page never beats
    P.here.clear()   # (the returning page above beats, as it should; the checks below use a fresh tab from a link)
    pz = P.open("/arena.html?utm_source=prod-check", referer="https://www.reddit.com/r/WebGames/comments/x/y"); booted(pz)
    wait_for(pz, "() => window.__presence && window.__presence.state().running", 20, P=P)
    pr = pz.evaluate("() => ({ stats: window.__settings.statsLive(), on: window.__presence.state().on })"); pz.evaluate("() => window.__presence.bye()"); pz.close()
    beats = [json.loads(b) for b in P.here if b]
    need(pr["stats"] and pr["on"] and beats, f"presence must beat on production: {pr}, {len(beats)} beats")
    need(all(set(b) <= {"v", "id", "dev", "mode", "arm", "step", "ep", "p", "cr", "t", "back", "bye", "page", "ref", "tag"} for b in beats), f"a production beat outside the allowlist: {beats[:1]}")
    full = next((b for b in beats if not b.get("bye") and b.get("tag") == "prod-check"), None) or [b for b in beats if not b.get("bye")][0]   # the returning tab above keeps beating too
    need(full.get("page") == "game" and full.get("ref") == "reddit.com" and full.get("tag") == "prod-check" and "WebGames" not in json.dumps(beats), f"production beat: {full}")
    P.here.clear()
    need(not r["founder"], f"the Founder gift on production: {r}")
    need(r["f3"] and "F3" in r["ui"] and r["sci"], f"fonts or 🧪 missing on production: {r}")
    pg.evaluate("() => window.__settings.open()"); pg.wait_for_timeout(300); txt = pg.evaluate("() => document.body.innerText")
    pg.evaluate("() => window.__settings.close()")
    need("Tell the scientists" in txt and "📖 Storyline" in txt and "Founder gift" not in txt, "⚙ rows on production (🧪 and 📖 Storyline in, no Founder): " + ", ".join(k for k in ("Tell the scientists", "📖 Storyline", "Founder gift") if k in txt))
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
    # the chooser (⚙ New consciousness): the storyline is in it since the launch
    pg.evaluate("() => { window.__genesis.newUniverse(); }")
    wait_for(pg, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 30, P=P)
    ms = pg.evaluate("() => [...document.querySelectorAll('#genChoose button[data-m]')].map(b => b.dataset.m)")
    need(sorted(ms) == ["free", "ready", "story"], f"chooser on production: {ms}")
    lbl = pg.evaluate("() => document.querySelector('#genChoose button[data-m=ready] b').textContent")
    need("the playground" in lbl, f"v13: the playground in the chooser: {lbl!r}")
    pg.close()
    # gift links: nothing opens
    P.gifts["abcdefghijklmnopqrstuvwx"] = {"letter": "hi", "claimed": False}
    for q in ("gift=founder", "gift=abcdefghijklmnopqrstuvwx"):
        pg = P.open("/arena.html?" + q); booted(pg); pg.wait_for_timeout(6000)
        g = pg.evaluate("() => ({ letter: !!document.querySelector('#founderLetter'), e: window.__founder.eligible() })")
        need(not g["letter"] and not g["e"]["link"] and not g["e"]["personal"], f"?{q} on production: {g}"); pg.close()
    # the A/B/C on id-le.com (Nov 4): a NEW browser gets an arm at random (Math.random pinned per context here), ?arm= forces nothing
    seen = {}
    for rnd, want, forced in ((0.01, "story", "play"), (0.5, "choose", "story"), (0.99, "play", "story")):
        ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}, service_workers="block"); ctx.add_init_script(f"Math.random = () => {rnd};"); Q = Page(ctx, P.base); Q.root = root
        try:
            q = Q.open(f"/arena.html?arm={forced}")
            if want == "story":
                wait_for(q, "() => !!document.querySelector('#idleIntro') && document.querySelector('#idleIntro').dataset.title === '1'", 40)
            elif want == "choose":
                wait_for(q, "() => document.querySelectorAll('#genChoose button[data-m]').length >= 2", 40)
            else:
                booted(q); wait_for(q, "() => window.__arena.raw().filter(c => !c.lab).length >= 3", 30)
            x = q.evaluate("() => ({ v: window.__genesis.variant(), gv: localStorage.getItem('idle.gv'), ms: [...document.querySelectorAll('#genChoose button[data-m]')].map(b => b.dataset.m), intro: !!document.querySelector('#idleIntro'), boot: !!window.__termBoot })")
            need(x["v"] == want and x["gv"] == want, f"a new browser on id-le.com (?arm={forced} ignored) must get its random arm {want}: {x}")
            if want == "choose": need(x["ms"][:2] == ["story", "ready"], f"the chooser on id-le.com: {x['ms']}")
            if want == "play": need(not x["intro"], f"the play arm lands in the playground: {x}")
            seen[want] = True
        finally:
            ctx.close()
    # ⭐ reviews and the Humans in the Loop are ON on id-le.com since Nov 4 (Nico's go): ?review=logos relays Nico's message at once, the 🌱
    # and 🧪's ⭐ tab are there; the Founder gift stays off (FOUNDER_ON = false)
    pg = P.open("/arena.html?review=logos"); booted(pg)
    with contextlib.suppress(AssertionError): wait_for(pg, "() => !!document.querySelector('.rvletter')", 30, P=P)
    rv = pg.evaluate("() => { window.__feedback.open('road'); const t = !!document.querySelector('#oracle [data-tab=rev]'); window.__feedback.close(); return { api: !!window.__reviews, letter: !!document.querySelector('.rvletter'), hitl: !!document.getElementById('hitlBtn'), tab: t, founder: window.__founder.off === true && !window.__founder.available() }; }")
    need(rv["api"] and rv["letter"] and rv["hitl"] and rv["tab"] and rv["founder"], f"reviews on production: {rv}"); pg.close()
    # keyframes (idle-keys.js) do nothing on id-le.com: no gate, no sandbox, no strip
    pg = P.open("/arena.html?at=end#keys"); booted(pg)
    k = pg.evaluate("() => ({ key: window.__storyKey || null, keys: !!window.__keys, gate: !!document.querySelector('#keyGate'), strip: !!document.querySelector('#keyStrip'), real: Object.getOwnPropertyDescriptor(window, 'localStorage') ? 'own' : 'proto' })")
    need(not k["key"] and not k["keys"] and not k["gate"] and not k["strip"], f"keyframes on production: {k}"); pg.close()
    need(not P.outside or all("id-le.com" not in u for u in P.outside), f"requests left the stubs: {P.outside[:3]}")
    P.clean()
    return f"id-le.com (launched): UI in {r['ui']}, arms {sorted(seen)} at random (?arm= ignored), a returning world keeps it + one offer, 📖 in ⚙ and the chooser, 🧪 sent + voted, no Founder; reviews on; keyframes inert"


def t_presence(P):
    """the creator's live view: two game tabs beat and show up as two players in /live, one closes (bye) and is gone; a tab with stats off
    or Global Privacy Control never beats; the key is needed (a wrong one is refused)"""
    import secrets, socket, subprocess as sp
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    key = secrets.token_urlsafe(32)
    node = sp.Popen(["node", os.path.join(ROOT, "helper", "dev_server.mjs"), str(port)], env={**os.environ, "LIVE_KEY": key}, stdout=sp.PIPE, stderr=sp.STDOUT)
    try:
        t0 = time.time()
        while time.time() - t0 < 10:
            try: socket.create_connection(("127.0.0.1", port), 0.3).close(); break
            except OSError: time.sleep(0.2)
        P.helper = f"http://127.0.0.1:{port}"
        tabs = []
        for i in range(2):   # the first comes from a Hacker News link with a campaign tag
            pg = P.open("/arena.html?statstest&test" + ("&utm_source=HN-Test" if i == 0 else ""), referer="https://news.ycombinator.com/item?id=4242" if i == 0 else None); booted(pg)
            wait_for(pg, "() => window.__presence && window.__presence.state().running", 20, P=P); tabs.append(pg)
        ids = {json.loads(b)["id"] for b in P.here if b}
        need(len(ids) == 2, f"two tabs, {len(ids)} ids beating ({len(P.here)} requests, first {P.here[:1]!r}, state {tabs[0].evaluate('() => window.__presence.state()')})")
        lv = P.open("/live.html"); lv.wait_for_selector("#key input", state="visible", timeout=10000)
        lv.fill("#key input", "wrong-key-" + "x" * 30); lv.click("#key button")
        wait_for(lv, "() => /not accepted/.test(document.querySelector('#key .err').textContent)", 15, P=P)
        lv.fill("#key input", key); lv.click("#key button")
        wait_for(lv, "() => window.__live.state().online === 2 && window.__live.state().nodes.length === 2", 20, P=P)
        tip = lv.evaluate("() => document.querySelector('#bMode').textContent + '|' + document.querySelector('#bCc').textContent")
        need("plain world" in tip and "CL" in tip, f"side charts: {tip}")
        # came from: the hover card and the chart show the site's name and the tag, never the link's path
        hn = next((json.loads(b) for b in P.here if b and '"news.ycombinator.com"' in b), None)
        need(hn and hn.get("ref") == "news.ycombinator.com" and hn.get("tag") == "hn-test" and hn.get("page") == "game" and "item" not in json.dumps(hn), f"the HN tab's beat: {hn}")
        card = ""
        for _ in range(6):
            pos = lv.evaluate("(a) => { const n = window.__live._nodes().find(n => n.a === a), b = document.querySelector('#cv').getBoundingClientRect(); return n ? { x: b.left + n.x, y: b.top + n.y } : null; }", hn["id"][:6])
            if pos: lv.mouse.move(pos["x"], pos["y"]); lv.wait_for_timeout(120); card = lv.evaluate("() => getComputedStyle(document.querySelector('#tip')).display === 'block' ? document.querySelector('#tip').innerText : ''")
            if "news.ycombinator.com" in card: break
            lv.wait_for_timeout(400)
        need("came from" in card and "news.ycombinator.com · hn-test" in card and "the game" in card and "item" not in card, f"hover card: {card!r}")
        refs = lv.evaluate("() => document.querySelector('#bRef').textContent + '|' + document.querySelector('#bPage').textContent")
        need("news.ycombinator.com" in refs and "direct" in refs and "game" in refs, f"came-from and pages charts: {refs}")
        lv.click('#ctl button[data-by=ref]'); lv.wait_for_timeout(300)
        need("news.ycombinator.com" in lv.evaluate("() => document.querySelector('#legend').textContent"), "colour by came from: the legend has no news.ycombinator.com")
        lv.click('#ctl button[data-by=mode]')
        tabs[1].evaluate("() => window.__presence.bye()"); tabs[1].goto("about:blank")   # what pagehide does (a beacon sent from an unloading page never reaches the test's routes)
        try: wait_for(lv, "() => window.__live.state().online === 1", 20, P=P)
        except AssertionError: raise AssertionError(f"no bye: {[b for b in P.here if 'bye' in b]}, live {lv.evaluate('() => window.__live.state()')}")
        lv.wait_for_timeout(1800)
        need(len(lv.evaluate("() => window.__live.state().nodes")) == 1, "the closed tab's circle is still there")
        lv.screenshot(path=os.path.join(tempfile.gettempdir(), "idle-live-view.png"))
        # stats off, and Global Privacy Control: no beat at all (the game tabs close first: they'd keep beating)
        tabs[0].evaluate("() => window.__presence.bye()"); tabs[0].goto("about:blank"); wait_for(lv, "() => window.__live.state().online === 0", 20, P=P); lv.wait_for_timeout(500)
        n0 = len(P.here)
        pg = P.ctx.new_page(); pg.add_init_script("try { localStorage.setItem('idle.settings', JSON.stringify({ stats: false })); } catch (e) {}")
        pg.goto(P.base + "/arena.html?statstest&test"); booted(pg); pg.wait_for_timeout(4000)
        off = pg.evaluate("() => ({ on: window.__presence.state().on, sent: window.__presence.beat() })")
        g = P.ctx.new_page(); g.add_init_script("Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }); try { localStorage.removeItem('idle.settings'); } catch (e) {}")
        g.goto(P.base + "/arena.html?statstest&test"); booted(g); g.wait_for_timeout(4000)
        gpc = g.evaluate("() => ({ on: window.__presence.state().on, stats: window.__settings.statsLive() })")
        need(not off["on"] and off["sent"] is False and not gpc["on"] and gpc["stats"] and len(P.here) == n0, f"stats off {off}, GPC {gpc}, beats sent meanwhile {len(P.here) - n0}")
        # the pedia beats too, as the pedia (live.html never does)
        pd = P.open("/pedia.html?statstest"); wait_for(pd, "() => window.__presence && window.__presence.state().running", 30, P=P)
        pb = [json.loads(b) for b in P.here[n0:] if b and '"pedia"' in b]
        need(pb and pb[0].get("page") == "pedia" and pb[0].get("ref") == "direct", f"the pedia's beat: {pb[:1]}"); pd.evaluate("() => window.__presence.bye()"); pd.close()
        need(not lv.evaluate("() => !!window.__presence"), "the live view must not beat")
        bad = [b for b in P.here if b and set(json.loads(b)) - {"v", "id", "dev", "mode", "arm", "step", "ep", "p", "cr", "t", "back", "bye", "page", "ref", "tag"}]
        need(not bad, f"a beat carried a field outside the list: {bad[:1]}")
        for x in (pg, g): x.close()
        P.clean()
        return f"{len(P.here)} beats from 2 tabs; /live showed 2, then 1 after a bye; wrong key refused; stats off and GPC silent"
    finally:
        node.terminate()
        with contextlib.suppress(Exception): node.wait(5)


def presence_privacy():
    """privacy.html#presence lists exactly what a presence beat carries: one item per field idle-presence.js sends (the country is said
    separately, as the server adds it), and the fields the page sends are exactly those"""
    html = open(os.path.join(DEMO, "privacy.html"), encoding="utf-8").read()
    sec = re.search(r'<h2 id="presence">.*?</ul>(.*?)<h2', html, re.S); need(sec, "privacy.html has no #presence section")
    items = re.findall(r"<li>(.*?)</li>", re.search(r'<h2 id="presence">.*?<ul>(.*?)</ul>', html, re.S).group(1), re.S)
    want = {"id": "random number", "dev": "phone, tablet or desktop", "mode": "how you're playing", "p": "panels are open", "cr": "how many creatures",
            "t": "seconds ago", "back": "been here before", "page": "which page", "ref": "where the visit came from", "tag": "campaign tag"}
    for k, phrase in want.items(): need(any(phrase in i for i in items), f"privacy #presence doesn't list {k} ({phrase!r})")
    need(len(items) == len(want), f"privacy #presence lists {len(items)} items, the beat has {len(want)} fields")
    need("never the full address, its path or its query" in html and "at most 60 characters" in html and "country" in sec.group(1), "the came-from item must say: name only, never the path or the query, at most 60 characters; and the country added by the server")
    return f"{len(items)} items, one per field; came-from is the name only"


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
    wait_for(pg, "() => !!(window.__genesis && document.querySelector('[data-gsay]'))", 40, P=P)
    st = pg.evaluate("() => ({ coarse: matchMedia('(pointer: coarse)').matches, focus: (document.activeElement || {}).id, pre: document.getElementById('lab-text').value, say: !!document.querySelector('#genConsole .say'), label: document.querySelector('[data-gsay]').textContent })")
    need(st["coarse"], f"the phone context should have a coarse pointer: {st}")
    need(st["focus"] != "lab-text" and st["pre"] == "let there be light" and st["say"] and st["label"].startswith("▶"), f"phones: pre-filled, not focused, a big ▶: {st}")
    pg.tap("[data-gsay]"); wait_for(pg, "() => document.documentElement.classList.contains('gen-lit') && window.__genesis.next() === 'words'", 20, P=P)
    P.clean()
    return f"pre-filled, not focused, ▶ '{st['label']}' → light"


def t_story_phone_steps(P):
    """v14 (Nico on a phone: "when I was about to tap let there be words, the window/bar changed under me"): after lights on, nothing that
    can be tapped moves or resizes while it is shown (sampled every 100 ms), and the Operator's window is hidden during each animation."""
    pg = P.open("/arena.html?at=lights")
    wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => window.__genesis.ready() && window.__genesis.next() === 'light'", 40, P=P)
    pg.wait_for_timeout(600)
    pg.tap("#lab-send")
    js = """() => { const v = el => { if (!el) return null; const s = getComputedStyle(el), r = el.getBoundingClientRect(); let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
      return s.display !== 'none' && s.visibility !== 'hidden' && o > 0.9 && r.width > 0 ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
      const t = window.__genesis.ready() ? document.querySelector('#lab-send') : null; return { lab: v(document.querySelector('#lab')), tgt: v(t), next: window.__genesis.next(), t: performance.now() }; }"""
    samples = []
    for _ in range(140):
        samples.append(pg.evaluate(js)); pg.wait_for_timeout(100)
        if samples[-1]["next"] == "words" and len(samples) > 110: break
    hidden = [s for s in samples[:20] if s["lab"] is None]
    # and the words: tapped, the window steps aside, comes back with "let there be life", and stays put
    wait_for(pg, "() => window.__genesis.ready() && window.__genesis.next() === 'words'", 20, P=P); pg.tap("#lab-send")
    w0 = len(samples)
    for _ in range(90):
        samples.append(pg.evaluate(js)); pg.wait_for_timeout(100)
        if samples[-1]["next"] == "creatures" and len(samples) - w0 > 70: break
    hidden_w = [s for s in samples[w0:w0 + 15] if s["lab"] is None]
    need(samples[-1]["tgt"] and samples[-1]["next"] == "creatures", f"phone: after the words the life chip should be up: {samples[-1]}")
    moved = []
    for a, b in zip(samples, samples[1:]):
        if a["tgt"] and b["tgt"] and (a["tgt"] != b["tgt"] or a["lab"] != b["lab"]): moved.append((round(b["t"]), a["tgt"], b["tgt"], a["lab"], b["lab"]))
        if a["tgt"] and b["tgt"] is None and b["lab"] and a["lab"] != b["lab"]: moved.append((round(b["t"]), "vanished", a["lab"], b["lab"]))
    P.clean()
    need(not moved, f"phone: the window/target moved while a tap target was shown: {moved[:4]}")
    need(len(hidden) >= 15 and len(hidden_w) >= 12, f"phone: the window steps aside after each command (lights {len(hidden)}/20, words {len(hidden_w)}/15)")
    return f"{len(samples)} samples over lights and words: the window hidden {len(hidden)}/20 and {len(hidden_w)}/15 after each command, nothing moved under a finger"


def t_story_v15(P):
    """v15 (Nico on his iPhone): the run's red line dives fully before the twirl starts, gently; in Genesis no command buttons anywhere, the
    epoch's checklist inside the Operator under ✅ (never a card over the world), the 📟 badge counting the tasks left (3 → 2 → 1 → none),
    the chat showing at most the current exchange (the whole history after Genesis), no Oracle in the storyline's Operator."""
    pg = P.open("/arena.html?at=lights")
    wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => window.__genesis.ready() && window.__genesis.next() === 'light'", 40, P=P)
    # the run: the dive reaches ≥ 90% before the vortex has turned more than a hair (0.05 rad), and the twirl starts slowly
    tm = pg.evaluate("""() => { const out = []; for (let T = 22; T <= 29.8; T += 0.05) { const x = window.__epoch0.timing(T); out.push([+T.toFixed(2), x.dive, x.rot]); } return out; }""")
    first = next((r for r in tm if r[2] > 0.05), None)
    need(first and first[1] >= 0.9, f"the red line should finish its dive before the spin: first turning frame {first}")
    early = [r for r in tm if 0 < r[2]][:6]
    need(early and early[-1][2] < 0.3, f"the twirl should start gently: {early}")
    js = """() => { const vis = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
        return s.display !== 'none' && s.visibility !== 'hidden' && o > 0.05 && r.width > 0 && r.height > 0; };
      const cmd = [...document.querySelectorAll('button,[role=button],.opc,.chip,a')].filter(vis).map(b => (b.innerText || '').trim()).filter(t => /^(▶ )?(lights on|let there be (light|words|life)|bring life)$/i.test(t));
      const day = document.querySelector('#genDay'); const lab = document.querySelector('#lab');
      return { cmd, dayOutside: !!(day && vis(day) && !lab.contains(day)), dayIn: !!(day && lab.contains(day)), chk: !!document.querySelector('#op-check'), badge: window.__toHandle.badge(),
        oracle: [...lab.querySelectorAll('*')].filter(vis).some(e => /🔮|Oracle/.test(e.childElementCount ? '' : e.textContent || '')), next: window.__genesis.next() }; }"""
    seen = []
    for step in ("light", "words", "creatures"):
        wait_for(pg, f"() => window.__genesis.ready() && window.__genesis.next() === '{step}'", 60, P=P); pg.wait_for_timeout(400)
        s1 = pg.evaluate(js); seen.append(s1)
        need(not s1["cmd"], f"no command button at '{step}': {s1['cmd']}")
        need(not s1["dayOutside"] and s1["chk"], f"the checklist lives in the Operator under ✅ at '{step}': {s1}")
        need(not s1["oracle"], f"no Oracle inside the storyline's Operator at '{step}'")
        if step == "words":
            # ✅ opens the checklist inside the window; the chat: six messages, only the last CHAT_KEEP (2) show beside the console's line
            pg.click("#op-check"); need(pg.evaluate("() => { const d = document.querySelector('#lab > #genDay'); return !!d && getComputedStyle(d).display !== 'none' && d.innerText.includes('lights on'); }"), "✅ shows the tasks")
            pg.click("#op-check")
            pg.evaluate("() => { for (let i = 0; i < 6; i++) window.__idleAI.add(i % 2 ? 'TO' : 'you', 'chat ' + i, i % 2 ? 'ai' : 'you'); }"); pg.wait_for_timeout(300)
            vis_rows = pg.evaluate("() => [...document.querySelectorAll('#ai-thread > *')].filter(r => getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().height > 0).map(r => r.textContent)")
            need(1 <= len(vis_rows) <= 2 and vis_rows[-1].endswith("chat 5"), f"Genesis shows at most the current exchange (2 rows + the console's line): {vis_rows}")
        pg.focus("#lab-text"); pg.keyboard.press("Enter")
    badges = [x["badge"] for x in seen]
    need(badges == [3, 2, 1], f"the 📟 badge counts the tasks left: {badges}")
    wait_for(pg, "() => !!window.__genesis.moment() && window.__genesis.moment().ready", 90, P=P)
    need(pg.evaluate("() => window.__toHandle.badge()") == 0, "no badge once Genesis is done")
    pg.click("#genConsole [data-gm=start]"); wait_for(pg, "() => !window.__genesis.moment()", 10, P=P); pg.wait_for_timeout(800)
    pg.evaluate("() => window.__opwin.open()"); pg.wait_for_timeout(500)
    allrows = pg.evaluate("() => [...document.querySelectorAll('#ai-thread > *')].filter(r => getComputedStyle(r).display !== 'none').length")
    need(allrows >= 8, f"after Genesis the whole chat history is visible: {allrows} rows")
    P.clean()
    return f"dive {first[1]:.2f} at the first turn ({first[0]} s); no command buttons, ✅ in the window, badges {badges} → 0, Genesis chat ≤ 2 rows, {allrows} rows after"


def t_v15_creatures(P):
    """v15 (Nico: "Shuold we add some dialog on the creatures after they first show up? something kind of signalling the user to click them"):
    the three say their first words in order as they appear, a ring pulses on them during the look-around and "👆 tap me" bobs after ~3 s;
    tapping one opens its card, ends the look-around early (on to the moment) and logs e0_tap."""
    pg = P.open("/arena.html?at=life")
    wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => window.__genesis.ready() && window.__genesis.next() === 'creatures'", 60, P=P); pg.wait_for_timeout(300)
    pg.focus("#lab-text"); pg.keyboard.press("Enter")
    wait_for(pg, "() => (window.__genesis.gsound.state().first || []).length === 3", 30, P=P)
    first = pg.evaluate("() => window.__genesis.gsound.state().first")
    texts = pg.evaluate("() => window.__genesis.gsound.state().first.map(f => (window.__arena.raw().find(c => c.name === f.who) || {}).name)")
    need([f["i"] for f in first] == [0, 1, 2] and all(texts), f"three first words, in order: {first}")
    wait_for(pg, "() => !!document.querySelector('.gen-tap')", 12, P=P)
    lk = pg.evaluate("() => window.__genesis.landing().look")
    need(lk and lk.get("rings", 0) >= 1 and lk.get("hint"), f"a ring pulses and the hint shows during the look-around: {lk}")
    hint = pg.evaluate("() => { const r = document.querySelector('.gen-tap').getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(document.querySelector('.gen-tap')).fontSize), in: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, text: document.querySelector('.gen-tap').textContent }; }")
    need(hint["fs"] >= 14 and "tap me" in hint["text"], f"the hint reads: {hint}")
    pg.evaluate("() => { const f = window.__genesis.gsound.state().first[0]; window.__idleWorld.openCard(f.who); }")
    wait_for(pg, "() => window.__genesis.landing().look.tap", 5, P=P)
    wait_for(pg, "() => !!window.__genesis.moment()", 12, P=P)
    need(not pg.evaluate("() => !!document.querySelector('.gen-tap')"), "the hint goes after the tap")
    tapped = pg.evaluate("() => ('e0_tap' in (window.__funnel.durations() || {})) || localStorage.getItem('idle.e0tap') === '1'")
    need(tapped, "e0_tap is logged")
    P.clean()
    return f"first words {[f['i'] for f in first]}, {lk['rings']} ring pulses, hint at {lk['hint'] - lk['t0']:.0f} ms; a tap opened the card and the moment came; e0_tap logged"


def t_operator_top(P, phone=False):
    """v15 (Nico: "the operator is also on top of the minimap... should we move the operator to the top, maybe next to the bell?", "the "Send"
    button … should be on the righ side", "instead of a tools icon, use the ⚡️ icon"); v16: the 📟 sits in the top bar right after ⚙ (phones: before ☰), the window opens below it and
    never covers the minimap, ☰ / 🔔's panel hide it, Send is the right-most control of the input row, ⚡ toggles the quick actions."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg); pg.wait_for_timeout(1500)
    pg.evaluate("() => { document.documentElement.classList.remove('gen-calm'); }"); pg.wait_for_timeout(800)
    # v16 (Nico: "I thought it was going to float to the right of the settings icon"): the 📟 is a button IN the top bar, right after ⚙
    # (phones: right before ☰), vertically centred on the bar's buttons
    pos = pg.evaluate("""() => { const h = document.querySelector('#toHandle'), bar = document.querySelector('#topbar'), set = document.querySelector('#settingsBtn'), more = document.querySelector('#mMore');
      const vis = e => !!(e && e.getBoundingClientRect().width && getComputedStyle(e).display !== 'none'); const rh = h.getBoundingClientRect();
      const ref = vis(set) ? set : more, rr = ref.getBoundingClientRect();
      return { inBar: h.parentElement === bar, prev: h.previousElementSibling && h.previousElementSibling.id, next: h.nextElementSibling && h.nextElementSibling.id,
        setVis: vis(set), dx: rh.left - rr.right, dxMore: rr.left - rh.right, dy: Math.abs((rh.top + rh.height / 2) - (rr.top + rr.height / 2)), h: [rh.left, rh.top, rh.width] }; }""")
    need(pos["inBar"], f"the 📟 is inside the top bar: {pos}")
    if pos["setVis"]: need(pos["prev"] == "settingsBtn" and -2 <= pos["dx"] < 16 and pos["dy"] < 4, f"the 📟 sits right after ⚙, aligned: {pos}")
    else: need(pos["next"] == "mMore" and -2 <= pos["dxMore"] < 16 and pos["dy"] < 4, f"phone: the 📟 sits right before ☰, aligned: {pos}")
    pg.click("#toHandle"); wait_for(pg, "() => document.querySelector('#lab').classList.contains('open')", 5, P=P); pg.wait_for_timeout(700)
    g = pg.evaluate("""() => { const r = e => { const x = e && e.getBoundingClientRect(); return x && x.width ? [x.left, x.top, x.right, x.bottom] : null; };
      const lab = r(document.querySelector('#lab')), mm = document.querySelector('#minimap'), m = mm && mm.offsetParent ? r(mm) : null, h = r(document.querySelector('#toHandle'));
      const row = [...document.querySelectorAll('#lab-form > *')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => [e.id || e.tagName, e.getBoundingClientRect().right, e.getBoundingClientRect().top]);
      return { lab, m, h, row, tools: (document.querySelector('#op-tools') || {}).textContent, ih: innerHeight }; }""")
    lab, m = g["lab"], g["m"]
    if m: need(lab[2] <= m[0] or lab[0] >= m[2] or lab[3] <= m[1] or lab[1] >= m[3], f"the window must not cover the minimap: {g}")
    need(lab[1] >= g["h"][3] - 2, f"the window opens below the 📟: {g}")
    send = [x for x in g["row"] if x[0] == "lab-send"]; text = [x for x in g["row"] if x[0] == "lab-text"]
    need(send and text and send[0][1] >= text[0][1] and abs(send[0][2] - text[0][2]) < 80, f"Send is right of the input: {g['row']}")
    need(g["tools"] == "⚡", f"the quick-actions toggle is ⚡: {g['tools']!r}")
    pg.click("#op-tools"); need(pg.evaluate("() => window.__opwin.tray().open && window.__opwin.tray().chips.length > 3"), "⚡ opens the quick actions")
    need(pg.evaluate("() => document.querySelector('#lab-text').getBoundingClientRect().bottom <= innerHeight"), "the input stays on screen with ⚡ open")
    if phone:
        opened = pg.evaluate("() => { const m = document.querySelector('#mMore'); if (!m) return false; m.click(); return true; }")
        if opened:
            wait_for(pg, "() => document.documentElement.classList.contains('op-yield')", 5, P=P)
            pg.evaluate("() => { const x = document.querySelector('#mSheet .mx'); if (x) x.click(); }")
            wait_for(pg, "() => !document.documentElement.classList.contains('op-yield')", 5, P=P)
    else:
        pg.click("#ntfBtn"); wait_for(pg, "() => document.documentElement.classList.contains('op-yield')", 5, P=P); pg.click("#ntfBtn")
        wait_for(pg, "() => !document.documentElement.classList.contains('op-yield')", 5, P=P)
    P.clean()
    return f"📟 at {[round(x) for x in g['h'][:2]]}, window {[round(x) for x in lab]}, minimap {[round(x) for x in m] if m else None}; Send right, ⚡ tray, yields to {'☰' if phone else '🔔'}"


def t_new_build(P):
    """v15 (Nico's phone kept an older build open): the page knows its build (IDLE_REV), version.json names the live one; a page restored from
    the back/forward cache with a newer build live reloads; otherwise a small "a new version of Id|le is here" offers it."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    mine = pg.evaluate("() => window.IDLE_REV || null")
    need(mine, "the build names its revision (window.IDLE_REV)")
    pg.context.route("**/version.json*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"rev":"zz-newer"}'))   # (context-wide: the service worker's fetches too)
    pg.evaluate("() => window.__newBuild.check(false)"); wait_for(pg, "() => !!document.querySelector('#newBuild')", 5, P=P)
    pg.evaluate("() => { window.__reloaded = 0; }")
    nav = []; pg.on("framenavigated", lambda f: nav.append(f.url))
    pg.evaluate("() => window.__newBuild.check(true)"); pg.wait_for_timeout(1500)
    need(nav, "a page restored from the cache with a newer build live reloads")
    P.clean()
    return f"IDLE_REV {mine}: a newer version.json shows the update offer; a restored page reloads"


def t_operator_float(P):
    """v14 (Nico: "the operator should always be a floating window, never a fixed sidebar chat… during gameplay the user can toggle it from the
    bottom right operator button"; "The roadmap loads under the Operator... it should maybe close the operator"; "a tools icon to toggle a
    section rigth abovoe the chat input area, with predefined/templated/suggested… messages"): a floating window (not full height, off the
    edges), dragged by its header and remembered; 🧪, the roadmap and the 🔮 Oracle hide it and give it back; the 🛠 tray of suggestions; no
    Oracle caption under the input."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    one = pg.evaluate("() => [...document.querySelectorAll('#toHandle, #lab-toggle')].filter(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.3 && r.width > 0; }).map(e => e.id)")
    need(one == ["toHandle"], f"exactly one Operator toggle, the square 📟: {one}")
    # after closing it, the first 3 times, the 📟 glows (~6 s, or until hovered); not the 4th time
    gl = []
    for k in range(4):
        pg.click("#toHandle"); wait_for(pg, "() => document.querySelector('#lab').classList.contains('open')", 5, P=P); pg.wait_for_timeout(300)
        pg.click("#lab-close"); pg.wait_for_timeout(700); gl.append(pg.evaluate("() => window.__toHandle.glowing()"))
    need(gl == [True, True, True, False], f"the 📟 glows after the first three closes only: {gl}")
    pg.evaluate("() => localStorage.setItem('idle.opCloses', '0')"); pg.click("#toHandle"); wait_for(pg, "() => document.querySelector('#lab').classList.contains('open')", 5, P=P); pg.wait_for_timeout(300)
    pg.click("#lab-close"); pg.wait_for_timeout(700); need(pg.evaluate("() => window.__toHandle.glowing()"), "the 📟 glows again (counter reset)")
    pg.hover("#toHandle"); pg.wait_for_timeout(150); need(not pg.evaluate("() => window.__toHandle.glowing()"), "hovering the 📟 stops its glow")
    pg.click("#toHandle"); wait_for(pg, "() => +getComputedStyle(document.querySelector('#lab')).opacity > 0.95", 5, P=P)
    R = "() => { const r = document.querySelector('#lab').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, right: innerWidth - r.right, bottom: innerHeight - r.bottom, W: innerWidth, H: innerHeight, rad: parseFloat(getComputedStyle(document.querySelector('#lab')).borderTopLeftRadius) }; }"
    r = pg.evaluate(R)
    need(r["w"] <= 420 and r["h"] < r["H"] - 80 and r["right"] >= 8 and r["bottom"] >= 40 and r["rad"] >= 8, f"the Operator should float (not a full-height sidebar): {r}")
    cap = pg.evaluate("() => [...document.querySelectorAll('#lab-form small, #ai-oracle-link')].map(e => getComputedStyle(e).display)")
    need(all(d == "none" for d in cap), f"no Oracle caption under the input in the playground: {cap}")
    # 🛠: closed by default; open → the Operator's real abilities as chips; a chip fills the input on a computer
    t0 = pg.evaluate("() => window.__opwin.tray()"); need(not t0["open"], f"the tray starts closed in the playground: {t0}")
    pg.click("#op-tools"); wait_for(pg, "() => window.__opwin.tray().open", 3, P=P)
    t1 = pg.evaluate("() => ({ tray: window.__opwin.tray(), above: document.querySelector('#opTray').nextElementSibling === document.querySelector('#lab-form') })")
    need(t1["above"] and "make it rain" in t1["tray"]["chips"] and "start a rave" in t1["tray"]["chips"] and "what's happening?" in t1["tray"]["chips"], f"the tray's chips: {t1}")
    pg.click("#opTray [data-opc='0']"); pg.wait_for_timeout(200)
    need(pg.evaluate("() => document.querySelector('#lab-text').value") == "make it rain", "a chip fills the input on a computer")
    pg.evaluate("() => { document.querySelector('#lab-text').value = ''; window.__opSuggest = () => [{ text: 'generated one' }]; }"); pg.wait_for_timeout(700)
    need(pg.evaluate("() => window.__opwin.tray().chips") == ["generated one"], "window.__opSuggest replaces the template chips (the hook for generated suggestions)")
    pg.evaluate("() => { delete window.__opSuggest; }")
    # the window's API for other features: setChips (with a function), say, highlight
    api = pg.evaluate("""async () => { window.__hit = 0; window.__opwin.setChips([{ text: 'do the thing', act: () => { window.__hit++; } }]); await new Promise(r => setTimeout(r, 400));
      const tr = window.__opwin.tray(); document.querySelector("#opTray [data-opc='0']").click(); window.__opwin.say('hello from a feature'); const hi = window.__opwin.highlight('#settingsBtn', { ms: 600, note: 'here' });
      const rings = document.querySelectorAll('.opHi').length; window.__opwin.setChips(null); await new Promise(r => setTimeout(r, 800));
      return { tr, hit: window.__hit, said: document.querySelector('#ai-thread').textContent.includes('hello from a feature'), hi, rings, gone: !document.querySelector('.opHi'), back: window.__opwin.tray().chips.includes('make it rain') }; }""")
    need(api["tr"]["chips"] == ["do the thing"] and api["tr"]["open"] and api["hit"] == 1 and api["said"] and api["hi"] and api["rings"] == 1 and api["gone"] and api["back"], f"the Operator window's API (setChips, say, highlight): {api}")
    pg.click("#op-tools"); wait_for(pg, "() => !window.__opwin.tray().open", 3, P=P)
    # 🧪 / the roadmap / the Oracle: the Operator steps aside, then comes back
    out = []
    for name, op, cl in (("🧪", "() => window.__feedback.open('tell')", "() => window.__feedback.close()"), ("roadmap", "() => window.__feedback.open('road')", "() => window.__feedback.close()"), ("oracle", "() => window.__oracleBox.open('test')", "() => window.__oracleBox.close()")):
        pg.evaluate(op); wait_for(pg, "() => !!window.__opwin.yielding() && +getComputedStyle(document.querySelector('#lab')).opacity < 0.05", 4, P=P)
        top = pg.evaluate("() => { const r = document.querySelector('#lab').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest('#lab'); }")
        need(not top, f"{name}: the Operator must not stay on top of it")
        pg.evaluate(cl); wait_for(pg, "() => !window.__opwin.yielding() && +getComputedStyle(document.querySelector('#lab')).opacity > 0.95", 4, P=P)
        out.append(name)
    # dragged by its header, remembered across a reload
    hb = pg.evaluate("() => { const r = document.querySelector('#lab-head').getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; }")
    pg.mouse.move(hb["x"], hb["y"]); pg.mouse.down(); pg.mouse.move(hb["x"] - 120, hb["y"] + 40, steps=6); pg.mouse.up()   # (v15: it opens at the top, below the 📟)
    r2 = pg.evaluate(R); need(abs((r2["l"] - r["l"]) + 120) < 6 and abs((r2["t"] - r["t"]) - 40) < 6, f"dragging the header moves the window: {r} → {r2}")
    pg.reload(); booted(pg); pg.wait_for_timeout(800)
    r3 = pg.evaluate(R); need(pg.evaluate("() => document.querySelector('#lab').classList.contains('open')") and abs(r3["l"] - r2["l"]) < 4 and abs(r3["t"] - r2["t"]) < 4, f"open and its place remembered after a reload: {r2} → {r3}")
    P.clean()
    return f"floating {round(r['w'])}×{round(r['h'])} (off the edges by {round(r['right'])}/{round(r['bottom'])} px), the tray ({len(t1['tray']['chips'])} chips, a hook), steps aside for {', '.join(out)}, dragged and remembered"


def t_operator_float_phone(P):
    """v14 on a phone: the Operator is a bottom sheet of at most ~45% of the screen; the 📟 opens it; a tray chip is sent at once."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.click("#toHandle"); wait_for(pg, "() => document.querySelector('#lab').classList.contains('open')", 5, P=P); pg.wait_for_timeout(400)
    r = pg.evaluate("() => { const r = document.querySelector('#lab').getBoundingClientRect(), h = document.querySelector('#toHandle').getBoundingClientRect(); return { h: r.height, H: innerHeight, w: r.width, W: innerWidth, top: r.top, hb: h.bottom }; }")
    need(r["h"] <= r["H"] * 0.46 + 1 and abs(r["w"] - r["W"]) < 2 and r["top"] >= r["hb"] - 2 and r["top"] < 80, f"phone: a sheet from the top (below the 📟) of at most 45%: {r}")   # v15
    pg.evaluate("() => { window.__sent = []; window.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('#lab-send')) window.__sent.push(document.querySelector('#lab-text').value); }, true); window.addEventListener('idle:optext', e => window.__sent.push('optext:' + e.detail.text)); }")
    pg.tap("#op-tools"); wait_for(pg, "() => window.__opwin.tray().open", 3, P=P)
    pg.tap("#opTray [data-opc='5']"); pg.wait_for_timeout(300)
    sent = pg.evaluate("() => window.__sent"); need(sent[:1] == ["what's happening?"] and "optext:what's happening?" in sent, f"phone: a chip is sent at once (to the Operator): {sent}")
    P.clean()
    return f"a {round(100 * r['h'] / r['H'])}% sheet; a chip sends"



def t_slash(P):
    """Slash commands (idle-slash.js; Nico: ""/oracle" omg, I love this feature… open/close windows from the chat with /deck, or /music, or
    /stats, or /ocean, or /find Craw*"): "/" opens the list in the Operator's input, in IRC and in a creature's mind chat; /music opens the
    music and /music again closes it; /find Craw* opens a Crawly's card; /weather sets the weather; an unknown command gets suggestions; a
    line without "/" goes to the Operator as before; every command is in the worker's allowlist (sc_*); in Genesis only the harmless ones."""
    # static: every command (and sc_unknown) is an allowlisted funnel moment
    src = open(os.path.join(ROOT, "demo", "idle-slash.js")).read(); wk = open(os.path.join(ROOT, "helper", "worker.js")).read()
    names = re.findall(r"\{ name: '([a-z-]+)', aliases", src)
    miss = [n for n in names + ["unknown"] if f"'sc_{n}'" not in wk]
    need(len(names) >= 17 and not miss, f"every slash command should be allowlisted in the worker: {len(names)} commands, missing {miss}")
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    LIST = "() => { const b = document.querySelector('#slashList'); return b && b.classList.contains('on') ? [...b.querySelectorAll('.it .n')].map(e => e.textContent) : null; }"
    # the Operator's input
    pg.click("#toHandle"); wait_for(pg, "() => document.querySelector('#lab').classList.contains('open')", 5, P=P); pg.wait_for_timeout(300)
    pg.click("#lab-text"); pg.keyboard.type("/")
    wait_for(pg, "() => !!document.querySelector('#slashList.on')", 3, P=P)
    l1 = pg.evaluate(LIST); need(l1 and "/music" in l1 and "/find" in l1 and "/weather" in l1 and "/help" in l1, f"'/' in the Operator lists the commands: {l1}")
    pg.keyboard.type("mu"); pg.wait_for_timeout(150); l2 = pg.evaluate(LIST); need(l2 == ["/music"], f"'/mu' filters to /music: {l2}")
    pg.keyboard.press("Escape"); need(pg.evaluate(LIST) is None, "Esc closes the list")
    # /music toggles the music panel: open, then closed
    pg.fill("#lab-text", "/music"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    m1 = pg.evaluate("() => document.querySelector('#dj').classList.contains('on')")
    pg.fill("#lab-text", "/music"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    m2 = pg.evaluate("() => document.querySelector('#dj').classList.contains('on')")
    need(m1 and not m2 and pg.evaluate("() => document.querySelector('#lab-text').value") == "", f"/music opens the music, /music again closes it: {m1}, {m2}")
    # /find Craw*: a Crawly's card
    crawly = pg.evaluate("() => (window.__arena.raw().find(c => !c.lab && !c.guest && /^craw/i.test(c.name || '')) || {}).name || null")
    need(crawly, "the starter world should have a creature whose name starts with Craw")
    pg.fill("#lab-text", "/find Craw*"); pg.keyboard.press("Enter")
    pg.wait_for_timeout(2500)
    fs = pg.evaluate("() => { const w = document.querySelector('#whisper'); return { wd: getComputedStyle(w).display, wt: w.innerText.slice(0, 60), th: document.querySelector('#ai-thread').innerText.slice(-200), lab: document.querySelector('#lab').className, slash: !!window.IdleSlash, val: document.querySelector('#lab-text').value }; }")
    need(fs["wd"] != "none" and "craw" in fs["wt"].lower() and "🔎 craw" in fs["th"].lower(), f"/find Craw* opens a Crawly's card: {fs}")
    # /weather: sun, then rain
    pg.fill("#lab-text", "/weather sun"); pg.keyboard.press("Enter"); wait_for(pg, "() => window.__idleWorld.summary().weather.kind === 'clear'", 6, P=P)
    pg.fill("#lab-text", "/weather rain"); pg.keyboard.press("Enter"); wait_for(pg, "() => window.__idleWorld.summary().weather.kind === 'bitrain'", 6, P=P)
    # the send button runs a command line too (on a phone that's how you send)
    pg.fill("#lab-text", "/music"); pg.click("#lab-send"); pg.wait_for_timeout(300)
    need(pg.evaluate("() => document.querySelector('#dj').classList.contains('on')"), "the send button runs /music too")
    pg.fill("#lab-text", "/music"); pg.click("#lab-send"); pg.wait_for_timeout(300)
    # unknown → suggestions, in the Operator's chat
    pg.fill("#lab-text", "/musik"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
    th = pg.evaluate("() => document.querySelector('#ai-thread').innerText")
    need("there's no /musik" in th and "/music" in th, f"an unknown command gets suggestions: {th[-300:]}")
    # a line without "/" goes to the Operator as it always did
    n0 = pg.evaluate("() => document.querySelectorAll('#ai-thread > *').length")
    pg.fill("#lab-text", "hello there"); pg.click("#lab-send"); pg.wait_for_timeout(800)
    th2 = pg.evaluate("() => document.querySelector('#ai-thread').innerText")
    need("hello there" in th2 and pg.evaluate("() => document.querySelectorAll('#ai-thread > *').length") > n0, "a plain line still goes to the Operator")
    # /hitl opens the 🌱 HITL tab, and again closes it
    pg.fill("#lab-text", "/hitl"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400); h1 = pg.evaluate("() => window.__reviews.tab.isOpen()")
    pg.evaluate("() => window.IdleSlash.run('/hitl', 'operator')"); pg.wait_for_timeout(600); h2 = pg.evaluate("() => window.__reviews.tab.isOpen()")
    wait_for(pg, "() => window.__opwin.isOpen() && getComputedStyle(document.querySelector('#lab-text')).visibility !== 'hidden'", 5, P=P)
    need(h1 and not h2, f"/hitl opens the 🌱 tab, /hitl again closes it: {h1}, {h2}")
    fun = pg.evaluate("() => Object.keys(JSON.parse(localStorage.getItem('idle.funnel') || '{}'))")
    need(all(k in fun for k in ("sc_music", "sc_find", "sc_weather", "sc_unknown")), f"funnel moments for the commands used: {fun}")
    # IRC
    pg.evaluate("() => { const o = document.querySelector('#rc-open'); if (o && getComputedStyle(o).display !== 'none') o.click(); }"); pg.wait_for_timeout(300)
    pg.evaluate("() => { const i = document.querySelector('#chat'); i.focus(); i.value = ''; }"); pg.keyboard.type("/")
    wait_for(pg, "() => !!document.querySelector('#slashList.on')", 3, P=P); l3 = pg.evaluate(LIST)
    pg.keyboard.press("Escape"); pg.evaluate("() => { document.querySelector('#chat').value = ''; }")
    # IRC is shared: a world command shows in the channel as yours; /op toggles the Operator from IRC
    pg.keyboard.type("/weather sun"); pg.keyboard.press("Enter"); wait_for(pg, "() => window.__idleWorld.summary().weather.kind === 'clear'", 6, P=P)
    need("ran /weather sun" in pg.evaluate("() => document.querySelector('#log').innerText"), "IRC: '/weather sun' shows in the channel as yours")
    o0 = pg.evaluate("() => window.__opwin.isOpen()"); pg.evaluate("() => document.querySelector('#chat').focus()"); pg.keyboard.type("/op"); pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    need(pg.evaluate("() => window.__opwin.isOpen()") != o0, f"/op from IRC toggles the Operator (was open: {o0})")
    # a creature's mind chat
    pg.evaluate("n => window.__idleWorld.openCard(n)", crawly); wait_for(pg, "() => getComputedStyle(document.querySelector('#whisper')).display !== 'none'", 6, P=P)
    pg.evaluate("() => { const i = document.querySelector('#whisperIn'); i.focus(); i.value = ''; }"); pg.keyboard.type("/")
    wait_for(pg, "() => !!document.querySelector('#slashList.on')", 3, P=P); l4 = pg.evaluate(LIST)
    need(l3 and "/music" in l3 and "/weather" in l3 and "/rename" not in l3, f"IRC: the window toggles and the world commands, not the creature ones: {l3}")
    need(l4 and all(x in l4 for x in ("/find", "/card", "/rename", "/evolve", "/operator", "/music")) and "/weather" not in l4 and "/spawn" not in l4, f"a mind chat: the window toggles and this creature's commands: {l4}")
    # /help in the mind chat lists only what works there (the note above its input); /rename renames this creature
    pg.keyboard.press("Escape"); pg.evaluate("() => { document.querySelector('#whisperIn').value = ''; }"); pg.keyboard.type("/help"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    note = pg.evaluate("() => { const n = document.querySelector('#slashNote'); return n && n.classList.contains('on') ? n.textContent : ''; }")
    need("/rename" in note and "/music" in note and "/weather" not in note, f"/help in a mind chat lists only its own commands: {note}")
    pg.evaluate("() => { const i = document.querySelector('#whisperIn'); i.focus(); i.value = ''; }"); pg.keyboard.type("/rename Pipsqueak"); pg.keyboard.press("Enter")
    wait_for(pg, "() => !!window.__arena.raw().find(c => c.name === 'Pipsqueak')", 6, P=P)
    pg.close()
    # Genesis: only the harmless ones
    pg = P.open("/arena.html?at=lights"); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => !!(window.__genesis && window.__genesis.unlocks().story && window.IdleSlash)", 30, P=P)
    g = pg.evaluate("() => ({ list: window.IdleSlash.list('operator').map(c => c.name), weather: window.IdleSlash.why('weather'), oracle: window.IdleSlash.why('oracle') })")
    need("help" in g["list"] and "settings" in g["list"] and "pedia" in g["list"] and not any(n in g["list"] for n in ("weather", "find", "spawn", "music", "evolve", "rave", "oracle")),
         f"in Genesis only the harmless commands: {g}")
    need(g["weather"] and "later" in g["weather"] and g["oracle"] == "not in the storyline", f"why /weather and /oracle aren't there: {g}")
    P.clean()
    return f"{len(names)} commands; '/' lists in 3 inputs; /music toggles; /find Craw* → {crawly}; /weather sun→rain; suggestions; Genesis: {', '.join(g['list'])}"


def t_slash_phone(P):
    """Slash commands on a phone (375×667): '/' opens the list inside the screen, a tap on a command that takes nothing runs it."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    pg.tap("#toHandle"); wait_for(pg, "() => document.querySelector('#lab').classList.contains('open')", 5, P=P); pg.wait_for_timeout(400)
    pg.tap("#lab-text"); pg.keyboard.type("/m")
    wait_for(pg, "() => !!document.querySelector('#slashList.on')", 3, P=P)
    r = pg.evaluate("() => { const r = document.querySelector('#slashList').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, W: innerWidth, fs: parseFloat(getComputedStyle(document.querySelector('#slashList')).fontSize) }; }")
    need(r["l"] >= 0 and r["r"] <= r["W"] and r["t"] >= 0 and r["fs"] >= 15, f"phone: the list fits the screen, 15 px+: {r}")
    pg.tap("#slashList .it:has(.n:text-is('/music'))"); pg.wait_for_timeout(400)
    need(pg.evaluate("() => document.querySelector('#dj').classList.contains('on')"), "phone: tapping /music runs it")
    P.clean()
    return f"the list fits ({round(r['r'] - r['l'])} px wide, {r['fs']} px text); a tap runs /music"


def t_story_input_visible(P):
    """v14 (Nico: "this last operator's chat box input is under the fold"): through Genesis (the Operator's opening, lights, words, life, the
    Epoch 0 moment), whenever the Operator's window is shown its input is fully on screen and inside the window, on a computer and on two
    phones (375×667, 390×844), and on a 375×420 screen (a phone with its keyboard up)."""
    js = """() => { const lab = document.querySelector('#lab'), t = document.querySelector('#lab-text'), L = lab.getBoundingClientRect(), r = t.getBoundingClientRect(); let o = 1; for (let e = lab; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
      return { shown: lab.classList.contains('open') && o > 0.9, ok: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.top >= L.top - 1 && r.bottom <= L.bottom + 1 && r.height > 16,
        r: [Math.round(r.top), Math.round(r.bottom)], L: [Math.round(L.top), Math.round(L.bottom)], H: innerHeight, step: window.__genesis.next(), m: !!(window.__genesis.moment() || {}).ready }; }"""
    out = []
    for vw in ({"width": 1400, "height": 900}, {"width": 375, "height": 667}, {"width": 390, "height": 844}, {"width": 375, "height": 420}):
        ctx = P.ctx.browser.new_context(viewport=vw, is_mobile=vw["width"] < 500, has_touch=vw["width"] < 500); Q = Page(ctx, P.base)
        try:
            pg = Q.open("/arena.html?at=lights"); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30); pg.keyboard.press("k")
            shown, bad, steps, seen = 0, [], set(), {}
            for _ in range(400):
                x = pg.evaluate(js)
                if x["shown"]:
                    shown += 1; st = x["step"] or ("moment" if x["m"] else "?"); steps.add(st); seen[st] = seen.get(st, 0) + 1
                    if not x["ok"]: bad.append(x)
                    # each step seen a few times on screen: send its pre-typed words as a player would
                    if x["step"] and seen[st] >= 3 and pg.evaluate("() => window.__genesis.ready()"):
                        if vw["width"] < 500: pg.tap("#lab-send")
                        else: pg.focus("#lab-text"); pg.keyboard.press("Enter")
                        seen[st] = -999
                if x["m"]: break
                pg.wait_for_timeout(200)
            need(not bad and shown >= 10 and {"light", "words", "creatures", "moment"} <= steps, f"{vw['width']}×{vw['height']}: the input off screen or outside the window ({len(bad)} of {shown} shown samples, steps {sorted(map(str, steps))}): {bad[:3]}")
            out.append(f"{vw['width']}×{vw['height']} ({shown})")
        finally:
            ctx.close()
    P.clean()
    return "the input on screen at every Genesis step: " + ", ".join(out)



def t_story_row(P):
    """v16: ⚙ → 📖 Storyline with no story yet starts it (the title card), no resume question; the playground has no 'back to the story' then."""
    pg = P.open("/arena.html?fresh=1&test"); booted(pg)
    ch = pg.evaluate("() => { window.__opwin.toggleTray(); return new Promise(r => setTimeout(() => r(window.__opwin.tray().chips), 400)); }")
    need("📖 back to the story" not in ch, f"no story yet: no way back to offer: {ch}")
    pg.evaluate("() => window.__settings.open()"); pg.wait_for_timeout(300)
    need("📖 Storyline" in pg.evaluate("() => document.querySelector('#settings').innerText"), "⚙ should have 📖 Storyline")
    # (Nico, v16: "move these sections to the bottom of the settings (in that order, with Anonymous stats at the bottom of all): Tell the scientists, Oracle, Public helper, Anonymous stats")
    rows = pg.evaluate("() => [...document.querySelectorAll('#settings .row .t > b')].map(b => b.textContent.trim())")
    need(rows[-4:] == ["🧪 Tell the scientists", "🔮 Oracle", "Public helper", "Anonymous stats"] and rows.index("📖 Storyline") < len(rows) - 4, f"⚙'s last four rows, in order: {rows}")
    pg.click('#settings [data-k="storyline"]'); wait_for(pg, "() => !!document.querySelector('#idleIntro') && window.__genesis.mode() === 'story'", 30, P=P)
    need(not pg.evaluate("() => !!document.querySelector('#genResume')"), "no resume question without a story")
    pg.close()
    # v16: / is the one public address: the game page names it canonical, and ?arm=, ?at= and ?review= work on / too
    ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base)
    try:
        q = Q.open("/?arm=story&test")
        try: wait_for(q, "() => !!document.querySelector('#idleIntro') && window.__genesis.variant() === 'story'", 60)
        except AssertionError: need(False, "/?arm=story: " + str(q.evaluate("() => ({ href: location.href, v: window.__genesis && window.__genesis.variant(), intro: !!document.querySelector('#idleIntro'), mode: window.__genesis && window.__genesis.mode(), gv: localStorage.getItem('idle.gv'), boot: document.documentElement.className, chooser: !!document.querySelector('#genChoose') })")))
        need(q.evaluate("() => (document.querySelector('link[rel=canonical]') || {}).href") == "https://id-le.com/", "the game page's canonical address is https://id-le.com/")
        q.close(); q = Q.open("/?at=dark"); wait_for(q, "() => !!document.querySelector('#keyGate')", 30); q.close()
    finally:
        ctx.close()
    ctx = P.ctx.browser.new_context(viewport={"width": 1400, "height": 900}); Q = Page(ctx, P.base)   # a browser with no story: the review link
    try:
        q = Q.open("/?review=logos&test"); wait_for(q, "() => !!document.querySelector('#review.on') || /message from Nico/.test((document.querySelector('#ai-thread') || {}).textContent || '')", 60); q.close()
    finally:
        ctx.close()
    pg = P.open("/pedia.html"); wait_for(pg, "() => document.querySelectorAll('a[href]').length > 20", 30, P=P)
    lk = pg.evaluate("() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /arena\\.html/.test(h))")
    need(not lk, f"the pedia links the game at / (no arena.html links): {lk[:5]}")
    P.clean()
    return "no story: ⚙ → 📖 Storyline starts it; no 'back to the story' chip; ⚙'s last four rows in order; / canonical, ?arm= ?at= ?review= on /, the pedia links /"



def t_story_modal(P):
    """v16 (Nico: "a notification might show up about a new reel, if I tap that, it seems like it might open the reel, but behind the lightbox
    of the epoch1... it shouldn't"): the end card is modal: a toast that arrives is held, a tap outside does nothing, × shrinks the card into
    the 📟 and the held toast shows after; 🗺 the roadmap closes the card before opening."""
    pg = P.open("/arena.html?at=end"); wait_for(pg, "() => !!document.querySelector('#keyGate')", 30, P=P); pg.keyboard.press("k")
    wait_for(pg, "() => !!document.querySelector('#genDay.end') && window.__modal.up()", 80, P=P); pg.wait_for_timeout(600)
    h = pg.evaluate("""() => { const n0 = window.__modal.held(); const r = window.__notify({ kind: 'reel', icon: '🎞', html: 'a new memory reel: TEST-REEL', ttl: 8000 });
      const b = document.createElement('button'); b.id = 'outsideProbe'; b.textContent = 'probe'; b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483600'; b.onclick = () => { window.__probe = 1; }; document.body.appendChild(b);
      return { r, held: window.__modal.held() - n0, shown: [...document.querySelectorAll('#ntf .np')].some(e => e.textContent.includes('TEST-REEL') && getComputedStyle(e).visibility !== 'hidden'), bd: !!document.querySelector('#genModalBd') }; }""")
    need(h["held"] == 1 and not h["shown"] and h["bd"], f"while the end card is up a toast is held and the backdrop is there: {h}")
    pg.mouse.click(30, pg.viewport_size["height"] - 20); pg.wait_for_timeout(300)
    need(not pg.evaluate("() => window.__probe") and pg.evaluate("() => !!document.querySelector('#genDay.end')"), "a tap outside the end card does nothing (and the card stays)")
    pg.click("#genDay.end .x"); wait_for(pg, "() => !document.querySelector('#genDay.end')", 5, P=P)
    sh = pg.evaluate("() => window.__genesis.landing().shrink"); need(sh and sh["to"] in ("toHandle", "lab-head"), f"the card shrinks into the 📟: {sh}")
    wait_for(pg, "() => window.__modal.held() === 0 && [...document.querySelectorAll('#ntf .np, #ntf *')].some(e => e.textContent.includes('TEST-REEL'))", 6, P=P)
    pg.click("#outsideProbe"); need(pg.evaluate("() => window.__probe") == 1, "after the card closes, taps reach the page again")
    pg.click("#genDay [data-end=open]"); wait_for(pg, "() => !!document.querySelector('#genDay.end')", 5, P=P)
    pg.evaluate("() => { window.__idle.cfg.helper = location.origin; }"); pg.click("#genDay [data-end=roadmap]")
    wait_for(pg, "() => !!document.querySelector('#oracle.on')", 8, P=P)
    need(not pg.evaluate("() => !!document.querySelector('#genDay.end')") and not pg.evaluate("() => window.__modal.up()"), "the roadmap closes the end card before it opens")
    P.clean()
    return "end card modal: toast held then shown, tap outside blocked, × shrinks into the 📟, roadmap closes it first"


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


# ---------------------------------------------------------------- what runs where (Nov 4: tiers, parallel workers)
PHONE = {"viewport": {"width": 375, "height": 667}, "is_mobile": True, "has_touch": True}
IPHONE = "iphone"   # a WebKit context from Playwright's iPhone 12 Mini profile


def browser_tests(a, out):
    """every browser check, in the order a single worker runs them: (name, fn, args, context options, engine)"""
    C, W = "chromium", "webkit"
    T = [
        ("fresh load", t_fresh_load, (), {}), ("fresh slow", t_fresh_slow, (), {}), ("crash guard", t_crash_guard, (), {}),
        ("camera desktop", t_camera, (), {}), ("panels", t_panels, (), {}), ("sound", t_sound, (), {}), ("haunted music", t_haunted, (), {}),
        ("stats", t_stats, (), {}), ("stats v2", t_stats_v2, (), {}), ("stats once", t_stats_once, (), {}), ("stats seen", t_stats_seen, (), {}),
        ("stats return", t_stats_return, (), {}), ("op stats", t_op_stats, (), {}), ("op actions", t_op_actions, (), {}), ("pedia stats", t_pedia_stats, (), {}),
        ("data lab", t_datalab, (90 if a.full else 45,), {}), ("data lab stuck", t_datalab_stuck, (), {}), ("data lab home", t_datalab_home, (), {}),
        ("mood migrate", t_mood_migrate, (), {}), ("lab card", t_lab_card, (), {}), ("irc inbox", t_irc_inbox, (), {}), ("oracle", t_oracle, (), {}),
        ("quick commands", t_quick, (), {}), ("right-click", t_rclick, (), {}), ("clicks", t_clicks, (), {}), ("replay", t_replay, (), {}),
        ("operator", t_operator, (), {}), ("tiny genesis", t_tiny_genesis, (), {}), ("halloween", t_halloween, (), {}),
        ("halloween light", t_halloween_light, (), {"color_scheme": "light"}), ("intro", t_intro, (), {}),
        ("intro reduced", t_intro_reduced, (), {"reduced_motion": "reduce"}), ("intro epoch0", t_intro_epoch0, (), {}), ("trick or treat", t_treat, (), {}),
        ("wikipedia world", t_wiki, (), {}), ("genesis", t_genesis, (), {}), ("genesis gate", t_genesis_gate, (), {}), ("story", t_story, (), {}), ("story migrate", t_story_migrate, (), {}),
        ("story keys", t_story_keys, (), {}), ("story phone steps", t_story_phone_steps, (), PHONE), ("story input visible", t_story_input_visible, (), {}),
        ("story row", t_story_row, (), {}), ("story modal", t_story_modal, (), {}), ("operator float", t_operator_float, (), {}),
        ("v15 story", t_story_v15, (), {}), ("v15 creatures", t_v15_creatures, (), {}), ("v15 operator top", t_operator_top, (), {}),
        ("v15 operator top phone", lambda P: t_operator_top(P, phone=True), (), PHONE), ("v15 new build", t_new_build, (), {}),
        ("operator float phone", t_operator_float_phone, (), PHONE), ("slash", t_slash, (), {}), ("slash phone", t_slash_phone, (), PHONE),
        ("story end phone", t_story_end_phone, (), PHONE), ("story v6", t_story_v6, (), {}), ("title card", t_title_card, (), {}), ("title auto", t_title_auto, (), {}),
        ("hint phone", t_hint_phone, (), {}), ("story arms", t_story_arms, (), {}), ("arm reload", t_arm_reload, (), {}), ("arm stats", t_arm_stats, (), {}), ("stats first", t_stats_first, (), {}), ("story offer", t_story_offer, (), {}), ("story offer v2", t_story_offer_v2, (), {}), ("never stuck", t_never_stuck, (), {}),
        ("founder", t_founder, (), {}), ("founder link", t_founder_link, (), {}), ("reviews invite", t_reviews_invite, (), {}),
        ("reviews", t_reviews, (), {"viewport": {"width": 1280, "height": 800}}), ("reviews cliff", t_reviews_cliff, (), {}), ("reviews tab", t_reviews_tab, (), {}),
        ("reviews timing", t_reviews_timing, (), {}), ("reviews cutscene", t_reviews_cutscene, (), {}), ("reviews cutscene phone", t_reviews_cutscene, (True,), PHONE),
        ("reviews link", t_reviews_link, (), {}), ("reviews fresh", t_reviews_fresh, (), {}), ("founder off", t_founder_off, (), {}), ("reviews phone", t_reviews_phone, (), PHONE),
        ("founder personal", t_founder_personal, (), {}), ("founder phone", t_founder_phone, (), {"is_mobile": True, "has_touch": True}),
        ("story landing", t_story_landing, (), {}), ("story intro", t_story_intro, (), {}), ("logo thunder", t_logo_thunder, (), {}),
        ("story fans", t_story_fans, (), {}), ("story clock", t_story_clock, (), {}), ("logo solo", t_logo_solo, (), {}), ("logo ab", t_logo_ab, (), {}),
        ("story keys logo", t_story_keys_logo, (), {}), ("story ring", t_story_ring, (), {}), ("boot intro", t_boot_intro, (), {}), ("chooser", t_chooser, (), {}),
        ("genesis phone", t_genesis_phone, (), {"is_mobile": True, "has_touch": True}), ("pedia desktop", t_pedia, (), {}), ("pedia halloween", t_pedia_halloween, (), {}),
        ("fonts", t_fonts, (), {}), ("fonts phone", t_fonts_phone, (), {"is_mobile": True, "has_touch": True}),
        ("presence", t_presence, (), {"service_workers": "block"}),   # requests a service worker makes itself pass by the test routes
        ("prod gates", t_prod_gates, (out,), {"service_workers": "block"}), ("story first paint", t_story_first_paint, (out,), {"service_workers": "block"}),
        ("story first paint phone", lambda P, r: t_story_first_paint(P, r, phone=True), (out,), {"service_workers": "block"}), ("ios sound desktop", t_ios_sound, (False,), {}),
    ]
    T = [(n, f, ar, kw, C) for n, f, ar, kw in T]
    if a.full: T.append(("fps", t_fps, (), {}, C))
    # Safari's engine: desktop size for the review link (its service worker would answer /lab/* past the test's stubs), the iPhone profile for the rest
    T.append(("reviews webkit", lambda P: t_reviews_link(P, "webkit"), (), {"viewport": {"width": 1280, "height": 800}, "service_workers": "block"}, W))
    T.append(("ios sound", t_ios_sound, (), {"service_workers": "block"}, IPHONE))
    for name, fn, kw in (("camera phone", t_camera, {"phone": True}), ("zoom shapes phone", t_zoom_shapes, {}), ("lab card phone", t_lab_card, {"phone": True}),
                         ("pedia phone", t_pedia, {"phone": True}), ("pedia halloween phone", t_pedia_halloween, {"phone": True})):
        T.append((name, (lambda P, fn=fn, kw=kw: fn(P, **kw)), (), {}, IPHONE))
    return T


# the launch tier (-t launch, ~3 min): what must hold before id-le.com gets a deploy. One quick pass per beginning (story, choose, play)
LAUNCH = {"title auto", "arm reload", "arm stats", "js syntax", "conflict markers", "worker", "static build", "prod gates", "story first paint", "story first paint phone", "fresh load", "story arms", "chooser", "reviews timing", "presence"}
STATIC = [("js syntax", "js syntax", lambda: js_syntax()), ("presence privacy", "presence privacy: what a beat carries", lambda: presence_privacy()),
          ("conflict markers", "conflict markers", lambda: no_conflict_markers()), ("fontgen", "fontgen", lambda: fontgen_round()),
          ("gift tool", "gift tool: personal gift links", lambda: gift_tool_unit()), ("worker", "worker: stats, jeffy allowlist, world links, rate limit", lambda: worker_unit()), ("kv writes", "kv writes: the stats accumulator", lambda: kv_writes_unit()),
          ("pages", "pages: server-side page views, visitors, bots", lambda: pages_unit()), ("local server", "local server: server.py, the Operator line", lambda: local_server_unit())]
# checks that pass the same assertions with the page's clock sped up (?timescale). Measured Nov 4 on 15 of the slowest at 5×: none got
# meaningfully faster (they wait on the test's own fixed pauses and on the audio clock, which can't run faster) and 4 broke (story keys
# logo, story landing, founder, reviews cutscene), so none is listed yet; the mechanism stays for checks written to use it
SCALED = set() | {n.strip() for n in os.environ.get("IDLE_SCALED_EXTRA", "").split(",") if n.strip()}   # IDLE_SCALED_EXTRA: try more
# checks that fail when other checks run at the same time (they time the storyline's start against the boot; under contention the start
# can race the boot and land in the chooser): run alone, one after another, once the parallel ones are done (Nov 4)
SERIAL = {"story arms", "story row", "story keys", "founder personal", "camera phone", "zoom shapes phone"}   # + WebKit phone geometry settling
TIMES = os.path.join(tempfile.gettempdir(), "idle-test-times.json")   # last run's seconds per check: the slowest start first


def run_in_process(names, a, out, base):
    """run these browser checks here, one after another: one browser per engine, a fresh context per check"""
    from playwright.sync_api import sync_playwright
    reg = {t[0]: t for t in browser_tests(a, out)}
    todo = [reg[n] for n in names if n in reg]
    with sync_playwright() as p:
        browsers = {}
        def engine(e):
            if e not in browsers:
                browsers[e] = (p.webkit if e in ("webkit", IPHONE) else p.chromium).launch(headless=not a.headed, **({} if e != "chromium" else {"args": ["--autoplay-policy=no-user-gesture-required"]}))
            return browsers[e]
        try:
            for name, fn, args, kw, e in todo:
                if e == IPHONE:
                    dev = p.devices["iPhone 12 Mini"] if "iPhone 12 Mini" in p.devices else p.devices["iPhone 12"]
                    kw = {**dev, **kw}
                else:
                    kw = {"viewport": {"width": 1400, "height": 900}, **kw}
                ts = kw.pop("timescale", 0) or (a.timescale if name in SCALED else 1)
                ctx = engine(e).new_context(**kw); P = Page(ctx, base); P.timescale = ts
                try: check(name, fn, P, *args)
                finally: ctx.close()
        finally:
            for b in browsers.values(): b.close()


def jobs_wanted(a, n):
    """how many browser workers: -j / IDLE_TEST_JOBS, otherwise from the 1-minute load against the cores (6, 4, 2 or 1)"""
    j = a.jobs or int(os.environ.get("IDLE_TEST_JOBS") or 0)
    if not j:   # the checks mostly wait on the page's own timers, not the CPU: parallel pays off even on a busy Mac, until it is overloaded
        cores, load = os.cpu_count() or 4, os.getloadavg()[0]
        j = 4 if load < cores / 2 else 3 if load < cores else 2 if load < 1.5 * cores else 1   # Nov 4: 6 workers at load 11 on 16 cores drove it
        # to 52 and 8 checks failed on timing; 3 at load ~17 left 2 (both now in SERIAL)
    return max(1, min(j, n))


def run_parallel(names, a, out, jobs):
    """each check in its own process (its own server port, browser and storage), at most `jobs` at once, slowest first; a new worker
    starts only while the machine isn't overloaded (the load under 1.5× the cores), so a busy Mac gets fewer; SERIAL checks run last, alone"""
    try: times = json.load(open(TIMES))
    except Exception: times = {}
    queue = sorted((n for n in names if n not in SERIAL), key=lambda n: -times.get(n, 30))
    alone = [n for n in names if n in SERIAL]
    running, cores = {}, os.cpu_count() or 4
    while queue or running or alone:
        if not queue and not running: queue, jobs = [alone.pop(0)], 1   # the SERIAL ones: after the rest, one at a time
        while queue and len(running) < jobs and (not running or os.getloadavg()[0] < 1.5 * cores):
            n = queue.pop(0)
            cmd = [sys.executable, os.path.abspath(__file__), "--dist", out, "--only", n, "--child", "--timescale", str(a.timescale)] + (["--full"] if a.full else []) + (["--headed"] if a.headed else [])
            running[n] = (subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True), time.time())
        time.sleep(0.2)
        for n, (pr, ts) in list(running.items()):
            if pr.poll() is None: continue
            outp = pr.stdout.read(); del running[n]
            line = next((l for l in outp.splitlines() if l.startswith(("  ok    " + n, "  FAIL  " + n))), None)
            dt = time.time() - ts
            if line and line.startswith("  ok"):
                RESULTS.append((n, True, line, dt)); print(line, flush=True)
            else:
                msg = line[len("  FAIL  " + n):].strip() if line else ("no result: " + outp.strip()[-600:])
                RESULTS.append((n, False, msg, dt)); print(f"  FAIL  {n}  {msg}", flush=True)
                if os.environ.get("IDLE_TEST_TRACE"): print(outp[-3000:])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--full", action="store_true"); ap.add_argument("-k", default=""); ap.add_argument("--dist", default=""); ap.add_argument("--keep", action="store_true")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("-t", "--tier", default="", choices=["", "launch", "full"], help="launch: the checks a deploy needs (~3 min); full (default): everything")
    ap.add_argument("-j", "--jobs", type=int, default=0, help="browser workers (default: from the load, 1-6; also IDLE_TEST_JOBS)")
    ap.add_argument("--timescale", type=int, default=int(os.environ.get("IDLE_TIMESCALE") or 5), help="how much faster the checks in SCALED run the page's clock (1: real time)")
    ap.add_argument("--only", default="", help=argparse.SUPPRESS); ap.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args(); t0 = time.time()
    tier = (lambda name: name in LAUNCH) if a.tier == "launch" else (lambda name: True)
    want = lambda name: a.k.lower() in name.lower() and tier(name)
    if a.child:   # one check, in a worker process started by run_parallel: a browser slot, the shared build, its own server
        srv, base = serve(a.dist)
        with browser_lock(): run_in_process([a.only], a, a.dist, base)
        srv.shutdown()
        return 0 if RESULTS and all(r[1] for r in RESULTS) else 1
    statics = lambda: [check(label, fn) for key, label, fn in STATIC if want(key)]
    out = a.dist or tempfile.mkdtemp(prefix="idle-dist-")
    names = [t[0] for t in browser_tests(a, out) if want(t[0])]
    if not names:
        print("static checks"); statics(); return report(t0)
    try:
        from playwright.sync_api import sync_playwright   # noqa: F401
    except ImportError:
        print("  FAIL  playwright is not installed (pip install playwright; playwright install chromium webkit)"); RESULTS.append(("playwright", False, "missing", 0)); return report(t0)
    try:
        if not a.dist:
            print("building", out); check("static build", build, out)
        jobs = jobs_wanted(a, len(names))
        if jobs > 1:   # the static checks (syntax, worker, server units) run alongside the browser workers
            st = threading.Thread(target=statics, daemon=True); st.start()
        else:
            print("static checks"); statics()
        if jobs == 1:
            srv, base = serve(out)
            print("browser checks at", base)
            with browser_lock(): run_in_process(names, a, out, base)
            srv.shutdown()
        else:
            print(f"browser checks: {len(names)} in {jobs} workers (load {os.getloadavg()[0]:.1f} on {os.cpu_count()} cores)", flush=True)
            run_parallel(names, a, out, jobs); st.join()
    finally:
        if not a.dist and not a.keep: shutil.rmtree(out, ignore_errors=True)
    return report(t0)


def report(t0):
    bad = [r for r in RESULTS if not r[1]]
    timed = sorted((r for r in RESULTS if r[3] > 0), key=lambda r: -r[3])
    if len(timed) > 3:
        print("\nslowest: " + ", ".join(f"{r[0]} {r[3]:.0f}s" for r in timed[:10]))
        try: old = json.load(open(TIMES))
        except Exception: old = {}
        with contextlib.suppress(OSError): json.dump({**old, **{r[0]: round(r[3], 1) for r in RESULTS}}, open(TIMES, "w"))
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} passed in {time.time() - t0:.0f}s")
    for n, _, msg, _ in bad: print(f"  FAIL  {n}: {msg}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
