"""Make demo/starter_world.json: the small living world a first-time visitor arrives in (#15).

    python3 tools/make_starter_world.py [--port 8951] [--live 150]

Starts from a brand-new browser profile (static mode, nothing saved), never from anyone's real world, then stages a
small cast and lets it live for a couple of minutes so diaries, meals and a chart already exist:
  - about 12 creatures: Crawly and Tok kin and a few clones, a Mathematician, a Counter, a Designer, the Architect
    that moves into every world;
  - an original short text spread on the floor as words, plus some numbers for the Counter and the Mathematician;
  - two creatures that have spent long enough together to be friends; clear weather.
The world's own records (advisor firsts and records, reels, replay clips, almanac history, drawer) are left out, so
every first in the Gazette and the first reel happen for the player. Which creature sleeps, which one is hungry and
which two are friends is written in `first5`, and idle-first5.js sets those moods when the world is loaded.
"""
import argparse, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.join(ROOT, "demo")

TEXT = """a small world wakes up every time you look at it . the creatures here are made of habits :
they wander , they eat words , they nap in the warm corners and they remember who was kind .
some of them count things , some of them draw what they count , one of them builds little huts
out of whatever is lying around . nobody tells them what to do . you can feed them , name them ,
change the weather , or just watch . if you open a sleeping one you can see what it dreams .
the lake keeps the rain and the old words sink into it . most days nothing important happens ,
and that is the best part . come back later : they will have news"""
NUMBERS = ["3", "7", "12", "4", "9", "21", "5", "16", "2", "11", "8", "30", "6", "14"]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=8951); ap.add_argument("--live", type=int, default=150)
    a = ap.parse_args()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(a.port), "--bind", "127.0.0.1"], cwd=DEMO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--headless=new"]); ctx = b.new_context(viewport={"width": 1400, "height": 900}); pg = ctx.new_page()
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"http://127.0.0.1:{a.port}/arena.html?nofirst5", wait_until="domcontentloaded")
            pg.wait_for_function("window.__arena && window.__idleWorld && window.__design && window.__restoredOrFresh", timeout=90000); pg.wait_for_timeout(3000)
            words = [w for w in TEXT.split() if w not in ".,:"]
            pg.evaluate("""([ws, nums]) => { const W = window.__idleWorld, A = window.__arena, cam = window.__lakeHooks.cam();
                W.setWeather('clear', 0.3);
                ws.forEach((w, i) => A.addWord(w, cam.x + (Math.random() - .5) * 900, cam.y + (Math.random() - .5) * 560));
                nums.forEach(n => A.addWord(n, cam.x - 260 + (Math.random() - .5) * 220, cam.y + 120 + (Math.random() - .5) * 160));
                ['math', 'counter', 'designer'].forEach(k => W.spawn(k));
                const base = A.raw().filter(c => !c.lab && !c.visitor);
                for (let i = 0; i < 6; i++) A.clone(A.raw().indexOf(base[i % base.length])); }""", [words, NUMBERS])
            pg.wait_for_timeout(2000)
            # the special ones get names from their own families' namers instead of their job titles
            pg.evaluate("""() => { const W = window.__idleWorld, A = window.__arena, NM = { math: 'Plotkin', counter: 'Tallix', designer: 'Pixa', architect: 'Lintel' };
                for (const c of A.raw()) if (c.g && NM[c.g.job] && c.name !== NM[c.g.job]) W.rename(c.name, NM[c.g.job]); }""")
            # two of them have spent ten minutes together already: the life tick turns that into a friendship
            pair = pg.evaluate("""() => { const cs = window.__arena.raw().filter(c => !c.lab && c.d && c.g && !['math','counter','designer','architect'].includes(c.g.job)); const a = cs[0], b = cs[1];
                a.company = { ...(a.company || {}), [b.name]: 900 }; b.company = { ...(b.company || {}), [a.name]: 900 }; b.x = b.tx = a.x + 40; b.y = b.ty = a.y + 10; return [a.name, b.name]; }""")
            print("living for", a.live, "s ...", flush=True); pg.wait_for_timeout(a.live * 1000)
            info = pg.evaluate("""() => { const cs = window.__arena.raw().filter(c => !c.lab && c.d && c.g);
                const job = j => (cs.find(c => c.g.job === j) || {}).name || null;
                const plain = cs.filter(c => !['math','counter','designer','architect'].includes(c.g.job));
                return { n: cs.length, names: cs.map(c => c.name + ' (' + (c.g.job || '') + ')'), math: job('math'), counter: job('counter'), architect: job('architect'),
                  sleeper: (plain[2] || {}).name, hungry: (plain[3] || {}).name,
                  friends: cs.map(c => (c.life && c.life.friends || []).length).reduce((s, x) => s + x, 0),
                  charts: window.__lakeHooks.things().filter(t => t.kind === 'design').length, words: window.__lakeHooks.words().length }; }""")
            pg.evaluate("""() => { const W = window.__idleWorld, NM = { math: 'Plotkin', counter: 'Tallix', designer: 'Pixa', architect: 'Lintel' };
                for (const c of window.__arena.raw()) if (c.g && NM[c.g.job] && c.name !== NM[c.g.job]) W.rename(c.name, NM[c.g.job]); }""")   # the Architect moves in later
            info["architect"] = pg.evaluate("() => (window.__arena.raw().find(c => c.g && c.g.job === 'architect') || {}).name || null")
            snap = pg.evaluate("() => window.__design.snap()")
            print("errors:", errs[:3]); b.close()
    finally:
        srv.terminate()
    # the player's own records start empty: firsts, reels, clips, history, drawer, lineage happen to them
    for k in ("capture", "reels", "clips", "almanac", "collection", "advisor", "lineage", "music"):
        snap.pop(k, None)
    snap["name"] = "a small world"
    snap["first5"] = {"sleeper": info["sleeper"], "hungry": info["hungry"], "friends": pair, "math": info["math"], "counter": info["counter"], "architect": info["architect"], "made": time.strftime("%Y-%m-%d")}
    out = os.path.join(DEMO, "starter_world.json")
    with open(out, "w") as f: json.dump(snap, f, separators=(",", ":"))
    print(json.dumps(info, indent=1)); print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
