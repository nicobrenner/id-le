#!/usr/bin/env python3
"""Id|le's local server: the whole game on your own computer, with nothing but Python's standard library.

    python3 server.py                 # http://localhost:8766  (the game; /pedia.html for the encyclopedia)
    python3 server.py 8800 --lab ~/my-idle-lab

What it does, next to serving demo/:
  - cross-origin isolation headers (COOP/COEP/CORP), so the Tiny Oracle's ONNX model can use several threads;
  - the game's back end, the same calls helper/worker.js answers on id-le.com:
      /lab/fetch /lab/page /lab/asset /lab/img   creatures read web pages (Crawlers, travel mode, Wikipedia worlds with picture credits)
      /worlds/*                                  linking worlds (kept in <lab>/worlds.json)
      /jeffy/capabilities, /jeffy/predict        the data lab's other classifier heads, via Jeffy's public server (or --jeffy URL)
      /lab/embed                                 sentence vectors for the Crawler (optional: onnxruntime + tokenizers, or sentence-transformers)
      /lab/stats                                 accepted and dropped: a local game sends nothing anywhere
  - your world mirrored to disk (/lab/sync, /lab/world, /lab/recover): <lab>/sync_*.json, with a rolling history;
  - the Operator's line to your own coding agent (/lab/notes, /lab/replies): what you type in the 📟 Operator panel
    (brain: "your coding agent") is appended to <lab>/notes.jsonl; whatever your agent writes to <lab>/replies.jsonl shows
    up in the panel. docs/operator-coding-agent.md and AGENTS.md explain how to point Claude Code (or another agent) at it.

The lab folder (default ./lab next to this file) holds your notes, replies and world copies; it is in .gitignore.
Binds to 127.0.0.1 only: this is a local tool, not a public server.
"""
import argparse, functools, html, http.server, json, os, random, re, threading, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.join(ROOT, "demo")
UA = "Mozilla/5.0 (compatible; Id|le local server/1.0; +https://id-le.com; https://github.com/nicobrenner/id-le)"   # Wikimedia's User-Agent policy: name the tool and a way to reach us
JEFFY = "https://playground.jeffyclassify.com"
LAB = os.path.join(ROOT, "lab")   # set from --lab / ARENA_LAB in main()

# ---------- reading the web ----------
PRIVATE = re.compile(r"^(localhost$|.*\.local$|.*\.internal$|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)", re.I)

def grab(u, cap, accept="*/*", timeout=10):
    p = urllib.parse.urlparse(u)
    if p.scheme not in ("http", "https") or not p.hostname or (PRIVATE.match(p.hostname) and not os.environ.get("IDLE_ALLOW_PRIVATE")): raise ValueError("not a public web address")   # IDLE_ALLOW_PRIVATE: the tests read a page served on localhost
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": accept}), timeout=timeout)
    return r, r.read(cap), r.headers.get("Content-Type", ""), r.geturl()

unesc = html.unescape
def strip(s): return re.sub(r"\s+", " ", unesc(re.sub(r"<[^>]+>", " ", s))).strip()

def wiki_file(src):   # https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Name.jpg/250px-Name.jpg -> ('commons', 'Name.jpg')
    p = urllib.parse.urlparse(src)
    if not re.match(r"^(upload|thumb)\.wikimedia\.org$", p.hostname or "", re.I): return None
    seg = [s for s in p.path.split("/") if s]
    if len(seg) < 4 or seg[0] != "wikipedia": return None
    wiki, i = seg[1], 5 if seg[2] == "thumb" else 4
    if i >= len(seg) or not re.match(r"^[a-z-]{2,20}$", wiki, re.I): return None
    return wiki, urllib.parse.unquote(seg[i]).replace("_", " ")

_credits = {}
def wiki_credits(images):   # same shape as helper/worker.js: a list parallel to `images`, None where a picture isn't a Wikimedia file
    files = [wiki_file(u) for u in images]
    if not any(files): return None
    out, need = [None] * len(images), {}
    for i, f in enumerate(files):
        if not f: continue
        hit = _credits.get(f)
        if hit and time.time() - hit[0] < 86400: out[i] = hit[1]
        else: need.setdefault(f[0], []).append(i)
    for wiki, idx in need.items():
        host = "commons.wikimedia.org" if wiki == "commons" else f"{wiki}.wikipedia.org"
        titles = "|".join(sorted({"File:" + files[i][1] for i in idx}))
        api = f"https://{host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|Credit&titles={urllib.parse.quote(titles)}"
        try: pages = (json.loads(grab(api, 2_000_000, "application/json")[1]).get("query") or {}).get("pages") or {}
        except Exception: continue
        by = {str(p.get("title", "")).replace("_", " ").lower(): p for p in pages.values()}
        for i in idx:
            p = by.get(("File:" + files[i][1]).lower()); info = p and (p.get("imageinfo") or [None])[0]
            if not info: continue
            m = info.get("extmetadata") or {}; v = lambda k: m.get(k, {}).get("value", "") if isinstance(m.get(k, {}).get("value", ""), str) else ""
            lic = v("LicenseUrl") if re.match(r"^https?://", v("LicenseUrl")) else ""
            page = info.get("descriptionurl") if re.match(r"^https?://", info.get("descriptionurl") or "") else f"https://{host}/wiki/" + urllib.parse.quote("File:" + files[i][1].replace(" ", "_"))
            c = {"file": files[i][1][:160], "author": strip(v("Artist"))[:160] or strip(v("Credit"))[:160] or "unknown author", "license": strip(v("LicenseShortName"))[:60] or "see the file page",
                 "licenseUrl": lic, "page": page, "source": "Wikimedia Commons" if wiki == "commons" else f"{wiki}.wikipedia.org"}
            out[i] = c; _credits[files[i]] = (time.time(), c)
    return out

def read_page(u):   # /lab/fetch: title, visible text, up to 4 pictures (+ credits), interface words, links
    raw0 = grab(u, 600_000, "text/html")[1].decode("utf-8", "replace")
    title = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw0)
    raw = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", " ", raw0)
    paras = re.findall(r"(?is)<p[^>]*>(.*?)</p>", raw); body = " ".join(paras) if sum(len(x) for x in paras) > 400 else raw
    text = re.sub(r"\s+", " ", re.sub(r"\[\d+\]", " ", strip(body)))[:20000]
    images, ui, links, seen = [], [], [], set()
    for src in re.findall(r'(?is)<img[^>]+?src="([^"]+)"', raw0):
        a = urllib.parse.urljoin(u, unesc(src))
        if a.startswith("data:") or re.search(r"\.svg|icon|logo|sprite|pixel|1x1|static/images", a, re.I) or not re.search(r"\.(jpe?g|png|webp|gif)", a, re.I) or a in images: continue
        images.append(a)
        if len(images) >= 4: break
    for tag, inner in re.findall(r"(?is)<(button|h1|h2|h3|label|a)\b[^>]*>(.*?)</\1>", raw0):
        t = strip(inner)
        if 2 <= len(t) <= 40 and not any(x["text"] == t for x in ui): ui.append({"tag": tag.lower(), "text": t})
        if len(ui) >= 40: break
    for ph in re.findall(r'(?is)<input[^>]+placeholder="([^"]{2,40})"', raw0)[:4]: ui.append({"tag": "input", "text": unesc(ph)})
    for href, inner in re.findall(r'(?is)<a\b[^>]*?href="([^"#][^"]*)"[^>]*>(.*?)</a>', raw):
        a = urllib.parse.urljoin(u, unesc(href)).split("#")[0]; t = strip(inner)
        if not a.startswith(("http://", "https://")) or a in seen or a == u or not (2 <= len(t) <= 80) or re.match(r"^(http|www\.)", t, re.I) or re.search(r"\.(pdf|zip|jpe?g|png|gif|svg)(\?|$)", a, re.I): continue
        seen.add(a); links.append({"href": a, "text": t})
        if len(links) >= 200: break
    wiki = re.search(r"(^|\.)wikipedia\.org$", urllib.parse.urlparse(u).hostname or "", re.I)   # Wikipedia's menus aren't the article
    random.shuffle(ui)
    out = {"title": strip(title.group(1))[:120] if title else u, "text": text, "images": images, "ui": [] if wiki else ui[:14], "links": links, "url": u}
    try:
        cr = wiki_credits(images)
        if cr: out["credits"] = cr
    except Exception: pass   # never let credits break a page read
    return out

def read_asset(u):   # /lab/asset: CSS comes back with url()/@import rewritten to pass through here again
    r, data, ct, final = grab(u, 4_000_000)
    is_css = "css" in ct or re.search(r"\.css(\?|$)", u, re.I)
    if not is_css and not re.match(r"^(image/|font/|application/(font|x-font|vnd\.ms-fontobject))", ct) and not re.search(r"\.(woff2?|ttf|otf|eot)(\?|$)", u, re.I): raise ValueError("not a stylesheet, font or image")
    if not is_css: return data, ct or "application/octet-stream"
    via = lambda x: "/lab/asset?url=" + urllib.parse.quote(urllib.parse.urljoin(final, x), safe="")
    css = data.decode("utf-8", "replace")
    css = re.sub(r"""url\(\s*(['"]?)([^'")]+)\1\s*\)""", lambda m: m.group(0) if m.group(2).strip().startswith("data:") else f'url("{via(m.group(2).strip())}")', css)
    css = re.sub(r"""@import\s+(['"])([^'"]+)\1""", lambda m: f'@import url("{via(m.group(2))}")', css)
    return css.encode(), "text/css; charset=utf-8"

# ---------- linking worlds (same relay as helper/worker.js, one JSON file) ----------
_wlock = threading.Lock()
def worlds_file(): return os.path.join(LAB, "worlds.json")
def wload():
    try: return json.load(open(worlds_file()))
    except Exception: return {"worlds": {}}
def wsave(d):
    os.makedirs(LAB, exist_ok=True); tmp = worlds_file() + ".tmp"; json.dump(d, open(tmp, "w")); os.replace(tmp, worlds_file())
def W(d, code): return d["worlds"].setdefault(code, {"name": code, "links": [], "requests": [], "inbox": [], "view": None, "seen": 0})

def worlds_state(code):
    with _wlock:
        d = wload(); me = W(d, code); me["seen"] = time.time(); wsave(d)
        return {"me": {k: me[k] for k in ("name", "links", "requests", "inbox")},
                "peers": {c: {"name": d["worlds"].get(c, {}).get("name", c), "seen": d["worlds"].get(c, {}).get("seen", 0), "view": d["worlds"].get(c, {}).get("view")} for c in me["links"] + me["requests"]}}

def worlds_act(act, q):
    res = {"ok": True}
    with _wlock:
        d = wload(); code = q.get("code", ""); me = W(d, code)
        if act == "register": me["name"] = str(q.get("name") or me["name"])[:40]; me["seen"] = time.time()
        elif act == "link":
            o = str(q.get("other", "")).strip().lower()
            if not o or o == code: res = {"ok": False, "error": "that is your own code"}
            elif o not in d["worlds"]: res = {"ok": False, "error": "no world with that code has been open on this server"}
            elif code in d["worlds"][o]["links"]: res = {"ok": True, "already": True}
            elif code not in d["worlds"][o]["requests"]: d["worlds"][o]["requests"].append(code)
        elif act == "approve":
            o = q.get("other"); me["requests"] = [r for r in me["requests"] if r != o]
            if q.get("yes") and o in d["worlds"]:
                if o not in me["links"]: me["links"].append(o)
                if code not in d["worlds"][o]["links"]: d["worlds"][o]["links"].append(code)
        elif act == "unlink":
            o = q.get("other"); me["links"] = [x for x in me["links"] if x != o]
            if o in d["worlds"]: d["worlds"][o]["links"] = [x for x in d["worlds"][o]["links"] if x != code]
        elif act == "send":
            to = q.get("to")
            if to in me["links"] and to in d["worlds"]:
                item = dict(q.get("item") or {}); item["from"] = code; item["t"] = time.time(); d["worlds"][to]["inbox"] = (d["worlds"][to]["inbox"] + [item])[-50:]
            else: res = {"ok": False, "error": "not linked"}
        elif act == "ack": ids = set(q.get("ids") or []); me["inbox"] = [i for i in me["inbox"] if i.get("id") not in ids]
        elif act == "view": me["view"] = q.get("view"); me["seen"] = time.time()
        else: return {"ok": False, "error": "unknown action"}
        wsave(d)
    return res

# ---------- the world mirrored to disk ----------
def lab_world():
    out = {}
    for k in ("arena_autosave", "arena_snapshots"):
        f = os.path.join(LAB, f"sync_{k}.json")
        try: out[k] = json.load(open(f)) if os.path.exists(f) else None
        except Exception: out[k] = None
    return out

def lab_sync(data):   # snapshots merge and never shrink; a much smaller world never replaces a bigger one without a copy
    os.makedirs(LAB, exist_ok=True)
    if isinstance(data.get("arena_snapshots"), list):
        f = os.path.join(LAB, "sync_arena_snapshots.json"); old = json.load(open(f)) if os.path.exists(f) else []
        seen = {(x.get("t"), x.get("name")) for x in data["arena_snapshots"]}
        data["arena_snapshots"] = sorted([x for x in old if (x.get("t"), x.get("name")) not in seen] + data["arena_snapshots"], key=lambda x: x.get("t") or 0)[-60:]
    if isinstance(data.get("arena_autosave"), dict):   # rolling history: one autosave per 5 minutes, the last 96
        f = os.path.join(LAB, "sync_arena_autosave.json"); hist = os.path.join(LAB, "arena_autosaves"); os.makedirs(hist, exist_ok=True)
        size = lambda x: len(x.get("words") or []) + len(x.get("residents") or []) + len(x.get("things") or [])
        shrinks = os.path.exists(f) and size(data["arena_autosave"]) < 0.5 * size(json.load(open(f)))
        if os.path.exists(f) and (shrinks or time.time() - max([os.path.getmtime(os.path.join(hist, x)) for x in os.listdir(hist)] or [0]) > 300):
            os.replace(f, os.path.join(hist, time.strftime("%Y%m%d-%H%M%S") + ".json"))
            for x in sorted(os.listdir(hist))[:-96]: os.remove(os.path.join(hist, x))
    for k in ("engagement", "chat_scores", "corrections", "visits", "arena_snapshots", "arena_autosave"):
        if k in data:
            tmp = os.path.join(LAB, f"sync_{k}.json.tmp"); json.dump(data[k], open(tmp, "w")); os.replace(tmp, os.path.join(LAB, f"sync_{k}.json"))

# ---------- the Operator's line to your coding agent ----------
def jsonl(name):
    f = os.path.join(LAB, name)
    if not os.path.exists(f): return []
    out = []
    for line in open(f, encoding="utf-8"):
        line = line.strip()
        if not line: continue
        try: out.append(json.loads(line))
        except Exception: pass   # a half-written line from an agent: skip it rather than break the panel
    return out

def add_note(row):
    row = dict(row); row.setdefault("t", time.time()); row.setdefault("who", "you"); os.makedirs(LAB, exist_ok=True)
    with open(os.path.join(LAB, "notes.jsonl"), "a", encoding="utf-8") as f: f.write(json.dumps(row) + "\n")

# ---------- the Crawler's sentence vectors (optional) ----------
_enc, _elock = None, threading.Lock()
def encoder():   # the in-repo MiniLM (demo/jeffy-heads) with onnxruntime + tokenizers, else sentence-transformers, else None
    global _enc
    with _elock:
        if _enc is not None: return _enc or None
        try:
            import numpy as np, onnxruntime as ort; from tokenizers import Tokenizer
            d = os.path.join(DEMO, "jeffy-heads"); sess = ort.InferenceSession(os.path.join(d, "minilm-l6-v2-quantized.onnx"), providers=["CPUExecutionProvider"])
            tok = Tokenizer.from_file(os.path.join(d, "tokenizer.json")); names = {i.name for i in sess.get_inputs()}
            def enc(texts):   # one text at a time: this graph doesn't mask padded positions cleanly (see demo/jeffy-heads/NOTICE and the devlog)
                out = []
                for t in texts:
                    e = tok.encode(t); ids = np.array([e.ids[:256]], dtype=np.int64); mask = np.ones_like(ids)
                    feed = {"input_ids": ids, "attention_mask": mask}
                    if "token_type_ids" in names: feed["token_type_ids"] = np.zeros_like(ids)
                    h = sess.run(None, feed)[0][0]; v = h.mean(0); v = v / (np.linalg.norm(v) or 1); out.append([round(float(x), 4) for x in v])
                return out
            _enc = enc; return _enc
        except Exception: pass
        try:
            from sentence_transformers import SentenceTransformer
            m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
            _enc = lambda texts: [[round(float(x), 4) for x in row] for row in m.encode(texts, batch_size=64, normalize_embeddings=True)]; return _enc
        except Exception: _enc = False; return None

# ---------- Jeffy's classifier heads (the data lab's other heads; the three starting ones run in the browser) ----------
_jq = {"caps": None, "t": 0, "inflight": 0, "lock": threading.Lock()}
def jeffy_caps(base):
    if _jq["caps"] and time.time() - _jq["t"] < 6 * 3600: return _jq["caps"]
    _jq["caps"] = json.loads(urllib.request.urlopen(urllib.request.Request(base + "/v1/capabilities", headers={"User-Agent": UA}), timeout=15).read()); _jq["t"] = time.time(); return _jq["caps"]
def jeffy_predict(base, task, text):   # /v1/predict/batch with one text: it doesn't log the text on the public server
    with _jq["lock"]:
        if _jq["inflight"] >= 2: return {"error": "busy"}
        _jq["inflight"] += 1
    try:
        body = json.dumps({"texts": [str(text)[:500]], "task": str(task)[:80]}).encode()
        d = json.loads(urllib.request.urlopen(urllib.request.Request(base + "/v1/predict/batch", data=body, headers={"Content-Type": "application/json", "User-Agent": UA}), timeout=15).read())
        P = (d.get("predictions") or [None])[0]
        return {k: P.get(k) for k in ("label", "confidence", "margin", "out_of_scope", "probabilities")} if P else {"error": "no prediction"}
    except Exception: return {"error": "busy"}
    finally:
        with _jq["lock"]: _jq["inflight"] -= 1

# ---------- HTTP ----------
class Handler(http.server.SimpleHTTPRequestHandler):
    jeffy = JEFFY

    def send(self, body, ct="application/json", code=200, extra=None):
        if not isinstance(body, (bytes, bytearray)): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)

    def q(self, key):
        return (urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get(key) or [""])[0]

    def body(self):
        n = int(self.headers.get("Content-Length", 0) or 0); raw = self.rfile.read(n) if n else b""
        try: return json.loads(raw or b"{}")
        except Exception: return {}

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        try:
            if p == "/lab/notices":   # short notes for the player (<lab>/notices.json); a JSON list here also tells the page a server is present
                f = os.path.join(LAB, "notices.json"); return self.send(open(f, "rb").read() if os.path.exists(f) else b"[]")
            if p == "/lab/notes": return self.send(jsonl("notes.jsonl"))
            if p == "/lab/replies": return self.send(jsonl("replies.jsonl"))
            if p == "/lab/world": return self.send(lab_world())
            if p == "/lab/recover":
                f = os.path.join(LAB, "recover.json"); return self.send(open(f, "rb").read() if os.path.exists(f) else b"null")
            if p == "/lab/info": return self.send({"server": "server.py", "lab": LAB, "notes": os.path.join(LAB, "notes.jsonl"), "replies": os.path.join(LAB, "replies.jsonl")})
            if p == "/lab/fetch":
                try: return self.send(read_page(self.q("url")))
                except Exception as e: return self.send({"error": str(e)[:200]})
            if p == "/lab/page":
                try:
                    r, data, ct, final = grab(self.q("url"), 2_500_000, "text/html")
                    if "html" not in (ct or "html"): raise ValueError("not a web page")
                    return self.send({"url": final, "html": data.decode("utf-8", "replace")})
                except Exception as e: return self.send({"error": str(e)[:200]})
            if p == "/lab/asset":
                try: data, ct = read_asset(self.q("url")); return self.send(data, ct, extra={"Cache-Control": "max-age=3600"})
                except Exception: return self.send(b"", "text/plain", 502)
            if p == "/lab/img":   # same-origin pictures, so the game can read their pixels
                try:
                    r, data, ct, final = grab(self.q("url"), 4_000_000)
                    if not ct.startswith("image/"): raise ValueError("not an image")
                    return self.send(data, ct, extra={"Cache-Control": "max-age=3600"})
                except Exception: return self.send(b"", "text/plain", 502)
            if p == "/worlds/state": return self.send(worlds_state(self.q("code")))
            if p == "/jeffy/capabilities":
                try: return self.send(jeffy_caps(self.jeffy))
                except Exception as e: return self.send({"error": "Jeffy's server did not answer: " + str(e)[:120]}, code=502)
            if p.startswith("/lab/") or p.startswith("/worlds/") or p.startswith("/jeffy/"): return self.send({"error": "not available"}, code=404)
        except Exception as e: return self.send({"error": str(e)[:200]}, code=500)
        if p in ("/", "/index.html") and not os.path.exists(os.path.join(DEMO, "index.html")):   # the game page is arena.html
            self.send_response(302); self.send_header("Location", "/arena.html" + (("?" + urllib.parse.urlparse(self.path).query) if urllib.parse.urlparse(self.path).query else "")); self.end_headers(); return
        return super().do_GET()

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        try:
            if p == "/lab/notes":
                row = self.body()
                if not isinstance(row, dict) or not str(row.get("text", "")).strip(): return self.send({"ok": False, "error": "a note needs text"}, code=400)
                add_note(row); return self.send({"ok": True})
            if p == "/lab/sync": lab_sync(self.body()); return self.send({"ok": True})
            if p == "/lab/stats": return self.send(b"", "text/plain", 204)   # a local game sends nothing anywhere
            if p == "/lab/embed":
                texts = [str(t)[:300] for t in (self.body().get("texts") or [])][:1200]; enc = encoder()
                if not enc: return self.send({"error": "unavailable: install onnxruntime and tokenizers (pip install onnxruntime tokenizers) for the Crawler's sentence vectors; it uses word vectors meanwhile"})
                return self.send({"vecs": enc(texts) if texts else []})
            if p.startswith("/worlds/"): return self.send(worlds_act(p.split("/")[2], self.body()))
            if p == "/jeffy/predict":   # allowlist: capabilities and predict only, never train, feedback or events
                q = self.body()
                if not q.get("text") or not q.get("task"): return self.send({"error": "text and task needed"}, code=400)
                r = jeffy_predict(self.jeffy, q["task"], q["text"]); return self.send(r, code=503 if r.get("error") else 200)
        except Exception as e: return self.send({"error": str(e)[:200]}, code=500)
        return self.send({"error": "not available"}, code=404)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin"); self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin"); self.send_header("Cache-Control", "no-cache"); super().end_headers()

    def log_message(self, *a): pass

def make_server(port, host="127.0.0.1", jeffy=JEFFY):
    Handler.jeffy = jeffy.rstrip("/")
    return http.server.ThreadingHTTPServer((host, port), functools.partial(Handler, directory=DEMO))

def main(argv=None):
    global LAB
    ap = argparse.ArgumentParser(description="Id|le's local server: the game, its back end, and the Operator's line to your coding agent.")
    ap.add_argument("port", nargs="?", type=int, default=8766)
    ap.add_argument("--lab", default=os.environ.get("ARENA_LAB") or os.path.join(ROOT, "lab"), help="folder for notes, replies and world copies (default ./lab)")
    ap.add_argument("--jeffy", default=os.environ.get("IDLE_JEFFY") or JEFFY, help="Jeffy server for the data lab's other heads (default: the public one; a local one: http://127.0.0.1:8411)")
    ap.add_argument("--host", default="127.0.0.1", help="interface to listen on (default 127.0.0.1: only this computer)")
    a = ap.parse_args(argv)
    LAB = os.path.abspath(os.path.expanduser(a.lab)); os.makedirs(LAB, exist_ok=True)
    srv = make_server(a.port, a.host, a.jeffy)
    print(f"Id|le is running: http://localhost:{a.port}   (the encyclopedia: http://localhost:{a.port}/pedia.html)", flush=True)
    print(f"Operator notes: {os.path.join(LAB, 'notes.jsonl')}   replies: {os.path.join(LAB, 'replies.jsonl')}   (docs/operator-coding-agent.md)", flush=True)
    threading.Thread(target=encoder, daemon=True).start()   # warm the Crawler's encoder in the background, if one is installed
    try: srv.serve_forever()
    except KeyboardInterrupt: print()

if __name__ == "__main__":
    main()
