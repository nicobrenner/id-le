"""Sample the bank of babble for the Epoch 0 intro (demo/intro_babble.json) from the real, shipped Tiny Oracle.

    python3 tools/make_intro_babble.py              # 40 lines per epoch + 40 continuations of "In the beginning there was"
    python3 tools/make_intro_babble.py --per 60

The intro samples the model live when it can (idle-epoch0.js); the bank covers the seconds before the 10.8 MB model is ready, and
phones / safe mode, which never sample live. Lines go through the same path as the live intro (window.__epoch0.sampleLine: the
temperature schedule, the prompts, the blocklist), in a headless Chromium against a static build. Only model output is stored:
nothing from training data. Takes the shared browser lock.
"""
import argparse, contextlib, json, os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK = "/private/tmp/claude-501/idle-browser.lock"


@contextlib.contextmanager
def browser_lock():
    while True:
        try: os.mkdir(LOCK); break
        except FileExistsError: time.sleep(10)
    try: yield
    finally:
        with contextlib.suppress(OSError): os.rmdir(LOCK)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--per", type=int, default=40); ap.add_argument("--port", type=int, default=8812)
    a = ap.parse_args()
    out = tempfile.mkdtemp(prefix="e0bank-"); shutil.rmtree(out)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_static.py"), "--out", out], check=True, stdout=subprocess.DEVNULL)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(a.port), "-d", out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        with browser_lock(), sync_playwright() as p:
            b = p.chromium.launch()
            try:
                pg = b.new_page(); pg.goto(f"http://localhost:{a.port}/?fresh=1&intro=0")
                for _ in range(160):
                    if pg.evaluate("() => !!(window.__oracle && window.__oracle.ready && window.__epoch0)"): break
                    pg.wait_for_timeout(500)
                sched = pg.evaluate("() => window.__epoch0.schedule")
                lines = {}
                for i, st in enumerate(sched):
                    got, seen, tries = [], set(), 0
                    while len(got) < a.per and tries < a.per * 3:
                        tries += 1
                        r = pg.evaluate("([i, s]) => window.__epoch0.sampleLine(i, s)", [i, tries * 7919 + i])
                        if r and r["text"] not in seen: seen.add(r["text"]); got.append(r["text"])
                    lines[str(st["e"])] = got
                    print(f"epoch {st['e']:>2} T={st['temp']} k={st['topK']}: {len(got)} lines", file=sys.stderr)
                cont, tries = [], 0
                while len(cont) < a.per and tries < a.per * 3:
                    tries += 1; c = pg.evaluate("() => window.__epoch0.sampleCont()")
                    if c: cont.append(c)
            finally:
                b.close()
    finally:
        srv.terminate(); shutil.rmtree(out, ignore_errors=True)
    data = {"_what": "Babble for the Epoch 0 intro, sampled from the shipped Tiny Oracle (tools/make_intro_babble.py) with the intro's temperature schedule and blocklist: model output only, no training data. 'cont' are the model's own continuations of 'In the beginning there was'.",
            "schedule": sched, "lines": lines, "cont": cont}
    json.dump(data, open(os.path.join(ROOT, "demo", "intro_babble.json"), "w"), ensure_ascii=False, indent=0)
    print(json.dumps({k: v[:10] for k, v in lines.items()}, ensure_ascii=False, indent=1)); print("cont:", cont[:12])


if __name__ == "__main__":
    main()
