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
COPY = ["pedia.html", "privacy.html", "idle-runtime.js", "sw.js", "starter_world.json", "og-image.png", "og-image-square.png", "oracle_v2_grown_ct2_kv_w8.onnx", "tokenizer_chat_v2.json", "assoc_v1.json",
        "arena_instr_v1.json", "arena_instr_v2.json", "arena_genomes.json", "datalab_stream.json"]
HEADERS = """/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
/*.onnx
  Cache-Control: public, max-age=604800
/vendor/*
  Cache-Control: public, max-age=31536000, immutable
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--helper", default="", help="base URL of the deployed helper worker (page fetch + world links); empty = without")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    ap.add_argument("--pages-helper", action="store_true", help="also write _worker.js so Cloudflare Pages serves the helper on the same origin (/lab/*, /worlds/*); use with --helper https://<your domain>")
    a = ap.parse_args()
    out = a.out
    if os.path.exists(out): shutil.rmtree(out)
    os.makedirs(out)
    html = open(os.path.join(DEMO, "arena.html"), encoding="utf-8").read()
    assert html.count(ORT_TAG) == 1, "onnxruntime script tag not found; update ORT_VER/ORT_TAG"
    assert html.count('<script src="idle-runtime.js"></script>') == 1, "arena.html must load idle-runtime.js"
    cfg = json.dumps({"mode": "static", "helper": a.helper.rstrip("/")})
    html = html.replace('<script src="idle-runtime.js"></script>', f'<script>window.IDLE_CFG = {cfg};</script><script src="idle-runtime.js"></script>')
    html = html.replace(ORT_TAG, '<script src="vendor/ort/ort.min.js"></script>')
    for name in ("index.html", "arena.html"):   # index for the site root; arena.html because the pedia reads the game's own source
        open(os.path.join(out, name), "w", encoding="utf-8").write(html)
    # every game module (idle-*.js) the page loads, so new ones are never left out of the build
    for f in COPY + sorted(x for x in os.listdir(DEMO) if x.startswith('idle-') and x.endswith('.js') and x not in COPY):
        src = os.path.join(DEMO, f)
        if os.path.exists(src): shutil.copy2(src, os.path.join(out, f))
        else: print("  missing (skipped):", f)
    sums = vendor_ort(out)
    open(os.path.join(out, "_headers"), "w").write(HEADERS)
    if a.pages_helper:   # Pages advanced mode: static files as usual, the helper (helper/worker.js) on the same origin
        w = open(os.path.join(ROOT, "helper", "worker.js"), encoding="utf-8").read()
        assert w.count("export default {") == 1
        w = w.replace("export default {", "const helper = {") + """
export default {
  async fetch(req, env, ctx) {
    const p = new URL(req.url).pathname;
    if (p.startsWith('/lab/') || p.startsWith('/worlds/') || p.startsWith('/jeffy/')) return helper.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
};
"""
        open(os.path.join(out, "_worker.js"), "w", encoding="utf-8").write(w)
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
    json.dump({"ort": ORT_VER, "ort_sha256_16": sums, "helper": a.helper, "bytes": size}, open(os.path.join(out, "build.json"), "w"), indent=1)
    print(f"dist ready: {out} ({size / 1e6:.1f} MB). Try: python3 -m http.server 8776 -d {os.path.relpath(out)}")


if __name__ == "__main__":
    main()
