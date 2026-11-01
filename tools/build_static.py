"""Build the static site (id-le.com, or any static host) from demo/ into dist/.

    python3 tools/build_static.py [--helper https://idle-helper.<you>.workers.dev] [--out dist]

What it does:
  - copies the game (arena.html, also as index.html), the pedia, the Oracle model, tokenizer and JSON files;
  - vendors onnxruntime-web (downloaded once into tools/.vendor_cache/, then copied) instead of loading it from jsDelivr;
  - sets window.IDLE_CFG = {mode: 'static', helper} so the game never looks for demo_server.py;
  - writes _headers (Cloudflare Pages / Netlify) with the cross-origin isolation headers multi-threaded ORT needs;
    sw.js adds the same headers on hosts that ignore _headers (GitHub Pages).
Serve dist/ with any static server, e.g. `python3 -m http.server 8776 -d dist`.
"""
import argparse, hashlib, json, os, shutil, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.join(ROOT, "demo")
ORT_VER = "1.20.1"
# the arena only uses the wasm execution provider, so the 21.7 MB WebGPU (jsep) build is left out
ORT_FILES = ["ort.min.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]
ORT_CDN = f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ORT_VER}/dist/"
ORT_TAG = f'<script src="{ORT_CDN}ort.min.js"></script>'
# the one cached model is enough; the two old ones are only a fallback for checkouts without it
COPY = ["pedia.html", "privacy.html", "idle-runtime.js", "sw.js", "starter_world.json", "pedia_clips.json", "og-image.png", "og-image-square.png", "og-image-halloween.png", "oracle_v2_grown_ct2_kv_w8.onnx", "tokenizer_chat_v2.json", "assoc_v1.json",
        "arena_instr_v1.json", "arena_instr_v2.json", "arena_instr_v3.json", "arena_instr_v4.json", "arena_genomes.json", "datalab_stream.json"]
HEADERS = """/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
/*.onnx
  Cache-Control: public, max-age=604800
/vendor/*
  Cache-Control: public, max-age=31536000, immutable
/jeffy-heads/*
  Cache-Control: public, max-age=604800
"""


def vendor_ort(out):
    cache = os.path.join(ROOT, "tools", ".vendor_cache", f"ort-{ORT_VER}")
    os.makedirs(cache, exist_ok=True)
    dst = os.path.join(out, "vendor", "ort"); os.makedirs(dst, exist_ok=True)
    for f in ORT_FILES:
        p = os.path.join(cache, f)
        if not os.path.exists(p):
            print("  downloading", ORT_CDN + f)
            data = urllib.request.urlopen(ORT_CDN + f, timeout=120).read()
            open(p + ".tmp", "wb").write(data); os.replace(p + ".tmp", p)
        shutil.copy2(p, os.path.join(dst, f))
    return {f: hashlib.sha256(open(os.path.join(dst, f), "rb").read()).hexdigest()[:16] for f in ORT_FILES}


def mark_staging(out):
    """staging.id-le.com: a fixed ribbon on every page and noindex, so nobody mistakes it for the real site."""
    rib = ('<meta name="robots" content="noindex, nofollow"><style>#stagingRibbon{position:fixed;left:50%;bottom:0;transform:translateX(-50%);z-index:2147483647;'
           'font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.12em;background:#e0367a;color:#fff;padding:2px 10px;border-radius:6px 6px 0 0;pointer-events:none;opacity:.9}</style>')
    for f in os.listdir(out):
        if not f.endswith(".html"): continue
        path = os.path.join(out, f); html = open(path, encoding="utf-8").read()
        html = html.replace("</head>", rib + "</head>", 1).replace("<body", "<body data-staging", 1)
        i = html.find(">", html.find("<body")) + 1
        html = html[:i] + '<div id="stagingRibbon">STAGING</div>' + html[i:]
        open(path, "w", encoding="utf-8").write(html)

def stamp_versions(out):
    """Cloudflare keeps .js files in browsers for 4 hours (the zone's browser cache TTL), while pages are always fresh.
    So every page names its scripts with a fingerprint of their contents (idle-music.js?v=1a2b3c4d): a new deploy means
    new addresses for exactly the files that changed, and browsers fetch those at once."""
    import hashlib, re
    ver = {}
    for f in os.listdir(out):
        if f.endswith(".js") and not f.startswith("_"):
            ver[f] = hashlib.sha256(open(os.path.join(out, f), "rb").read()).hexdigest()[:8]
    pat = re.compile(r"""(["'])((?:\./)?(%s))\1""" % "|".join(re.escape(f) for f in sorted(ver, key=len, reverse=True)))
    for f in os.listdir(out):
        if not f.endswith(".html"): continue
        path = os.path.join(out, f); html = open(path, encoding="utf-8").read()
        html = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={ver[m.group(3)]}{m.group(1)}", html)
        open(path, "w", encoding="utf-8").write(html)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--helper", default="", help="base URL of the deployed helper worker (page fetch + world links); empty = without")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    ap.add_argument("--staging", action="store_true", help="staging build: a STAGING ribbon on every page and noindex (staging.id-le.com)")
    ap.add_argument("--pages-helper", action="store_true", help="also write _worker.js so Cloudflare Pages serves the helper on the same origin (/lab/*, /worlds/*); use with --helper https://<your domain>")
    a = ap.parse_args()
    out = a.out
    if os.path.exists(out): shutil.rmtree(out)
    os.makedirs(out)
    html = open(os.path.join(DEMO, "arena.html"), encoding="utf-8").read()
    assert html.count(ORT_TAG) == 1, "onnxruntime script tag not found; update ORT_VER/ORT_TAG"
    assert html.count('<script src="idle-runtime.js"></script>') == 1, "arena.html must load idle-runtime.js"
    # the game's version, for stats: an error's line number only means something together with the version it came from
    import hashlib
    build = hashlib.sha256(html.encode("utf-8")).hexdigest()[:8]
    cfg = json.dumps({"mode": "static", "helper": a.helper.rstrip("/"), "build": build})
    html = html.replace('<script src="idle-runtime.js"></script>', f'<script>window.IDLE_CFG = {cfg};</script><script src="idle-runtime.js"></script>')
    html = html.replace(ORT_TAG, '<script src="vendor/ort/ort.min.js"></script>')
    for name in ("index.html", "arena.html"):   # index for the site root; arena.html because the pedia reads the game's own source
        open(os.path.join(out, name), "w", encoding="utf-8").write(html)
    # every game module (idle-*.js) the page loads, so new ones are never left out of the build
    for f in COPY + sorted(x for x in os.listdir(DEMO) if x.startswith('idle-') and x.endswith('.js') and x not in COPY):
        src = os.path.join(DEMO, f)
        if os.path.exists(src): shutil.copy2(src, os.path.join(out, f))
        else: print("  missing (skipped):", f)
    # the README's pictures, for the pedia's feature pages (img/<name>.jpg; the 3.7 MB hero.gif stays out)
    img = os.path.join(ROOT, "docs", "img"); os.makedirs(os.path.join(out, "img"), exist_ok=True)
    for f in sorted(os.listdir(img)):
        if f.endswith(".jpg"): shutil.copy2(os.path.join(img, f), os.path.join(out, "img", f))
    # the data lab's in-browser classifiers (idle-jeffy.js): fetched only when the lab opens, never on a first visit
    shutil.copytree(os.path.join(DEMO, "jeffy-heads"), os.path.join(out, "jeffy-heads"))
    sums = vendor_ort(out)
    if a.staging: mark_staging(out)
    stamp_versions(out)
    open(os.path.join(out, "_headers"), "w").write(HEADERS.replace("/*\n", "/*\n  X-Robots-Tag: noindex, nofollow\n", 1) if a.staging else HEADERS)
    if a.pages_helper:   # Pages advanced mode: static files as usual, the helper (helper/worker.js) on the same origin
        w = open(os.path.join(ROOT, "helper", "worker.js"), encoding="utf-8").read()
        assert w.count("export default {") == 1
        w = w.replace("export default {", "const helper = {") + """
export default {
  async fetch(req, env, ctx) {
    const p = new URL(req.url).pathname;
    if (p.startsWith('/lab/') || p.startsWith('/worlds/') || p.startsWith('/jeffy/')) return helper.fetch(req, env, ctx);
    // link previews: a Halloween link (?halloween, or a Wikipedia world about Halloween) gets the Halloween card and title
    const u = new URL(req.url), q = u.searchParams, wq = decodeURIComponent((q.get('from_wiki') || '').split('/wiki/')[1] || q.get('wiki') || '');
    let r;
    if ((p === '/' || p === '/index.html' || p === '/arena.html') && (q.has('halloween') || /hallowe.?en|jack-o.?-?lantern|samhain|trick-or-treat/i.test(wq))) {
      const a = await env.ASSETS.fetch(req), img = 'https://id-le.com/og-image-halloween.png', t = "It's Halloween in Id|le", d = 'Creatures in costume go trick-or-treating in a little world that lives in your browser. Free, open source.';
      const set = v => ({ element(e) { e.setAttribute('content', v); } });
      r = new HTMLRewriter().on('meta[property="og:image"]', set(img)).on('meta[name="twitter:image"]', set(img)).on('meta[property="og:title"]', set(t)).on('meta[name="twitter:title"]', set(t))
        .on('meta[property="og:description"]', set(d)).on('meta[name="twitter:description"]', set(d)).on('meta[property="og:url"]', set(u.origin + '/?halloween'))
        .on('meta[property="og:image:alt"]', set("The Id|le wordmark with an orange bar over a moonlit world of words: it is Halloween")).transform(a);
    } else r = await env.ASSETS.fetch(req);
    // every HTML page served here is counted by the server (pageview in helper/worker.js), after the response and never delaying it
    const page = helper.pages[p]; if (page && ctx && ctx.waitUntil) ctx.waitUntil(helper.pageview(req, env, page, r));
    return r;
  },
};
"""
        open(os.path.join(out, "_worker.js"), "w", encoding="utf-8").write(w)
        # only these paths invoke the Worker (Pages Functions: 100,000 invocations a day on the free plan); every other file is served
        # as a plain asset. The pages themselves are in because the Worker counts page views (and swaps the link-preview tags for
        # Halloween links).
        json.dump({"version": 1, "include": ["/", "/index.html", "/arena.html", "/pedia", "/pedia.html", "/privacy", "/privacy.html", "/lab/*", "/worlds/*", "/jeffy/*"], "exclude": []}, open(os.path.join(out, "_routes.json"), "w"))
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
    json.dump({"ort": ORT_VER, "ort_sha256_16": sums, "helper": a.helper, "bytes": size}, open(os.path.join(out, "build.json"), "w"), indent=1)
    print(f"dist ready: {out} ({size / 1e6:.1f} MB). Try: python3 -m http.server 8776 -d {os.path.relpath(out)}")


if __name__ == "__main__":
    main()
