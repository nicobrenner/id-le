"""v3 of the r/aigamedev cut (Nico, 11-01: "the part where it says you can see them dream, it should zoom into the dream so it's
clear what's going on, otherwise the viewer gets lost just watching a bunch of creatures crawling around").

Same cut as v2 (cuts2.py), with three shots re-recorded so their point fills the frame:
  a07 friends: the two creatures and their greeting bubbles, closer (z 3.4 instead of 2.4)
  a09 mind:    a pinch-zoom from the creature and its card into the card's mind panel until it fills the frame: its thoughts
  a10 dream:   the same push-in on a sleeping creature's card: the dream (remembered scenes and words drifting over its stream)
The push-in is Chrome's own pinch-zoom (CDP Input.synthesizePinchGesture, like two fingers on a trackpad): the page's layout doesn't
change, so the card (whose code keeps it inside the view) and its live stream and dream carry on untouched. The stream canvas is
created at 3x density, so it stays sharp when enlarged. Everything else is v2's footage and music (--v2 work dir). Halloween OFF.

    python3 tools/trailer/cuts3.py --out ~/Desktop/idle-trailers [--only shoot|edit|probe]
"""
import argparse, asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from rec import *
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--base", default="https://id-le.com")
ap.add_argument("--work", default="/private/tmp/claude-501/trailer/v3"); ap.add_argument("--v2", default="/private/tmp/claude-501/trailer/v2")
ap.add_argument("--v1", default="/private/tmp/claude-501/trailer/ab"); ap.add_argument("--only", default="")
A = ap.parse_args(); os.makedirs(A.work, exist_ok=True); os.makedirs(A.out, exist_ok=True)
CR = "window.__arena.raw().filter(c => !c.lab)"
BEAT = 60 / 122
CARD_POS = {"x": (W - 390) // 2, "y": 210}   # the card docked in the middle of the view (the game's own remembered card place)


async def page(b, url, keep=""):
    ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="dark")
    await ctx.add_init_script("try { localStorage.setItem('idle.halloween', 'off'); localStorage.setItem('arena.quality', 'high');"
                              f" localStorage.setItem('arena.cardDock', '{{\"x\":{CARD_POS['x']},\"y\":{CARD_POS['y']}}}'); }} catch (e) {{}}")
    pg = await ctx.new_page(); await pg.goto(url)
    await pg.wait_for_function("() => window.__restoredOrFresh && window.__testCam", timeout=60000); await pg.wait_for_timeout(6000)
    assert not await pg.evaluate("() => !!(window.__halloween && window.__halloween.on())"), "Halloween is on: the shot would show the moon"
    await hide_chrome(pg, keep)
    return pg


async def bubble(pg, name, text, ms=2600):
    await pg.evaluate("""([n, t, ms]) => { const c = window.__arena.raw().find(c => c.name === n); if (!c || !c.bub) return;
      c.bub.textContent = t; c.bub.classList.add('on'); clearTimeout(c._bt); c._bt = setTimeout(() => c.bub.classList.remove('on'), ms); }""", [name, text, ms])


async def open_mind(pg, name, mode):
    await pg.evaluate("n => window.__idleWorld.openCard(n)", name); await pg.wait_for_timeout(500)
    await pg.evaluate("() => { const t = document.querySelector('#ctabs [data-ct=\"mind\"]'); if (t) t.click(); }"); await pg.wait_for_timeout(300)
    if mode: await pg.evaluate("m => { const s = document.querySelector('#mmode'); if (s && s.offsetParent) { s.value = m; s.dispatchEvent(new Event('change', { bubbles: true })); } }", mode)


async def pinch(pg, sel=None, speed=520):
    """pinch-zoom in on the element sel (scale chosen to fit it in the frame above the caption band), or back out to 1 with sel None"""
    cdp = await pg.context.new_cdp_session(pg)
    if sel is None:
        await cdp.send("Emulation.setPageScaleFactor", {"pageScaleFactor": 1}); await pg.wait_for_timeout(300)
        print("zoom back", await pg.evaluate("() => visualViewport.scale")); return 1
    r = await pg.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }", sel)
    k = round(min(0.90 * W / r["w"], 0.74 * H / r["h"], 3.2), 2)
    if not (0 < r["x"] < W and 0 < r["y"] < H): raise RuntimeError(f"pinch target {sel} is off screen: {r}")
    await cdp.send("Input.synthesizePinchGesture", {"x": r["x"], "y": r["y"], "scaleFactor": k, "relativeSpeed": speed})
    return k


async def hold(pg, name, state=None):
    """keep a creature in place (and, with state, in that state: a property that ignores the game's writes, because the game wakes
    creatures for all sorts of reasons and one awake frame fades a dream out) until release()"""
    await pg.evaluate("""([n, st]) => { const c = window.__arena.raw().find(c => c.name === n); const x = c.x, y = c.y;
      if (st) Object.defineProperty(c, 'state', { configurable: true, get: () => st, set: () => {} });
      c.__hold = setInterval(() => { c.tx = x; c.ty = y; c.vx = 0; c.vy = 0; if (st === 'sleep') c.until = Date.now() + 60000; }, 50); }""", [name, state])


async def release(pg, name):
    await pg.evaluate("n => { const c = window.__arena.raw().find(c => c.name === n); clearInterval(c.__hold); const st = c.state; delete c.state; c.state = st; }", name)


async def shoot(b, probe=False):
    pg = await page(b, A.base + "/?fresh=1&test")
    await pg.mouse.click(700, 540); await pg.wait_for_timeout(600)
    # a07: two friends meeting (staged), framed on the pair and their bubbles
    pair = await pg.evaluate(f"""() => {{ const cs = {CR}.filter(c => c.state !== 'sleep'); const a = cs[1], b = cs[2];
      b.tx = a.x + 46; b.ty = a.y + 6; b.state = 'move'; a.tx = a.x; a.ty = a.y; return [a.name, b.name]; }}""")
    mid = f"(() => {{ const cs = {CR}; const a = cs.find(c => c.name === {pair[0]!r}), b = cs.find(c => c.name === {pair[1]!r}); return {{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 14 }}; }})()"
    if not probe:
        await follow(pg, mid, 3.4, 1.0, ease=0.6)
        async with Shot(pg, "a07_friends", A.work) as s:
            await follow(pg, mid, 3.4, 1.4, ease=0.3)
            await bubble(pg, pair[1], "hi, friend ♥"); await follow(pg, mid, 3.4, 1.0, ease=0.3)
            await bubble(pg, pair[0], "*waves two legs* ♥"); await follow(pg, mid, 3.4, 1.5, ease=0.3)
    # a09: the mind. The stream's canvas is created once per page with devicePixelRatio: 3x, so it stays sharp when zoomed in
    await pg.evaluate("() => Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 3 })")
    await hide_chrome(pg, "#whisper")
    nm = await pg.evaluate(f"() => {{ const c = {CR}.filter(c => c.state !== 'sleep')[3] || {CR}[1]; return c.name; }}")
    await hold(pg, nm)
    pt = await pg.evaluate(f"() => {{ const c = {CR}.find(c => c.name === {nm!r}); return {{ x: c.x, y: c.y }}; }}")
    await cam(pg, pt["x"] + 350, pt["y"] - 40, 1.6)   # the creature on the left, its card in the middle
    await open_mind(pg, nm, "thoughts"); await pg.wait_for_timeout(700)
    await pg.evaluate("() => { delete window.devicePixelRatio; }")
    await pg.wait_for_timeout(2600)   # let a few thoughts arrive
    if probe:
        print("mind", await pinch(pg, "#cmind", speed=4000)); await pg.wait_for_timeout(900); await pg.screenshot(path=os.path.join(A.work, "probe_mind.png"))
    else:
        async with Shot(pg, "a09_mind", A.work) as s:
            await pg.wait_for_timeout(500); print("mind pinch", await pinch(pg, "#cmind")); await pg.wait_for_timeout(3400)
    await pinch(pg); await release(pg, nm); await pg.wait_for_timeout(500)
    await pg.evaluate("() => { const x = document.querySelector('#whisper .cx'); if (x) x.click(); }"); await pg.wait_for_timeout(400)
    # a10: a sleeper's dream: well fed, tired, put to sleep with the game's own action, held asleep for the shot
    await pg.evaluate("() => { const s = document.querySelector('#mmode'); if (s) { s.value = 'stream'; s.dispatchEvent(new Event('change', { bubbles: true })); } }")
    sl = await pg.evaluate(f"""() => {{ const A = window.__arena, cs = {CR}.filter(c => c.state !== 'sleep' && !c.hangryUntil); const c = cs[5] || cs[0];
      c.d.hunger = 0.05; c.d.fatigue = 1; c.d.fear = 0; try {{ A.act(A.raw().indexOf(c), 'sleep'); }} catch (e) {{}} return c.name; }}""")
    await hold(pg, sl, "sleep"); await pg.wait_for_timeout(1500)
    pt = await pg.evaluate(f"() => {{ const c = {CR}.find(c => c.name === {sl!r}); return {{ x: c.x, y: c.y }}; }}")
    await cam(pg, pt["x"] + 350, pt["y"] - 40, 1.6)
    await open_mind(pg, sl, ""); await pg.wait_for_timeout(14000)   # a dream piece drifts in every 2-4 s and lasts 9-15 s: let several gather
    print("dream tab", await pg.evaluate("() => [document.querySelector('#cmind').className, (document.querySelector('#ctabs [data-ct=mind]') || {}).textContent, document.querySelectorAll('#cmind .mdream .dr').length]"))
    if probe:
        print("dream", await pinch(pg, "#cmind", speed=4000)); await pg.wait_for_timeout(900); await pg.screenshot(path=os.path.join(A.work, "probe_dream.png"))
    else:
        async with Shot(pg, "a10_dream", A.work) as s:
            await pg.wait_for_timeout(500); print("dream pinch", await pinch(pg, "#cmind")); await pg.wait_for_timeout(4200)
    print("dream pieces at the end", await pg.evaluate("() => document.querySelectorAll('#cmind .mdream .dr').length"))
    await release(pg, sl)
    await pg.context.close()


def V(k, d=None): return os.path.join(d or A.work, k + ".mp4")


def build(plan, prefix):
    parts = []
    for i, (src, st, d, t, sub) in enumerate(plan):
        if not os.path.exists(src): print("missing", src); continue
        c = trim(src, st, d, os.path.join(A.work, f"{prefix}t{i:02d}.mp4"))
        if t: c = overlay(c, card_band(t, sub, os.path.join(A.work, f"{prefix}card{i:02d}.png")), os.path.join(A.work, f"{prefix}o{i:02d}.mp4"), start=0.05, fade=0.15)
        parts.append(c)
    return parts


async def main():
    if A.only in ("", "shoot", "probe"):
        async with async_playwright() as p:
            b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            try: await shoot(b, probe=A.only == "probe")
            finally: await b.close()
    if A.only in ("shoot", "probe"): return
    w, v2 = A.work, A.v2; b4 = 4 * BEAT
    plan = [(V("a01_deck", v2), 0.3, 2 * b4 - 0.6, "DJ for a tiny world", "tap a beat, turn on the rave: each body dances its own way"),
            (V("a02_storm", v2), 0.3, b4 + 0.3, "Paint the weather", ""),
            (V("a03_mutate", v2), 0.1, b4 + 0.3, "Mutate anyone", ""),
            (V("a04_volcano", v2), 0.4, b4 + 0.3, "Wake a volcano", ""),
            (V("a05_wiki", v2), 0.2, b4 + 0.6, "Grow a world from any Wikipedia article", ""),
            (V("a06_eat", v2), 0.2, 2.8, "These creatures eat words", "a little world that lives in your browser"),
            (V("a07_friends"), 0.5, 3.3, "make friends", ""),
            (V("a08_chart", v2), 0.1, 4.2, "Mathematicians plot charts", "Debuggers break them into code, and others eat it"),
            (V("a09_mind"), 0.3, 4.0, "You can read their minds", "each creature's card streams what it sees, wants and feels"),
            (V("a10_dream"), 0.3, 4.6, "…and watch them dream about their day", "asleep, the mind fills with remembered scenes and words"),
            (os.path.join(A.v1, "a09_roadmap.mp4"), 0, 2.4, "Built in 4 days", "by one person and a team of Claude agents"),
            (os.path.join(A.v1, "a10_devlog.mp4"), 0, 2.0, "Every feature measured in a devlog", ""),
            (os.path.join(A.v1, "a11_tests.mp4"), 0.5, 2.4, "Tests on every push", ""),
            (V("a11_reel", v2), 0.2, 3.6, "The world even cuts its own films", "memory reels, from what they lived through")]
    parts = build(plan, "a")
    parts.append(still(card_full([("33+ agent tasks · 256 commits", "mono"), ("no game engine · open source", "serif"), ("id-le.com", "mono"),
                                  ("github.com/nicobrenner/id-le", "small")], os.path.join(w, "aend.png")), 4.0, os.path.join(w, "aend.mp4")))
    burst = sum(dur(x) for x in parts[:5]) - 4 * 0.3
    mix = os.path.join(w, "amix.m4a")
    sh("ffmpeg", "-y", "-v", "error", "-i", os.path.join(v2, "rave.webm"), "-i", os.path.join(v2, "home.webm"), "-filter_complex",
       f"[0:a]atrim=0:{burst + 1.2:.2f},asetpts=PTS-STARTPTS[r];[1:a]atrim=2,asetpts=PTS-STARTPTS[h];[r][h]acrossfade=d=1.6:c1=tri:c2=tri[a]",
       "-map", "[a]", "-c:a", "aac", "-b:a", "192k", mix)
    outA, tA = assemble(parts, mix, os.path.join(A.out, "idle-aigamedev-v3.mp4"))
    top = os.path.join(w, "avtop.png"); im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for txt, y, f, col in [("Id|le", 140, ImageFont.truetype(SERIF_B, 120), (250, 240, 230)), ("creatures that live in your browser", 300, ImageFont.truetype(SERIF, 50), (255, 200, 140)),
                           ("id-le.com", 1650, ImageFont.truetype(MONO, 64), (255, 200, 140)), ("built with a team of Claude agents · open source", 1750, ImageFont.truetype(SERIF, 38), (230, 220, 240))]:
        d.text(((1080 - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=col)
    im.save(top); outAV = vertical(outA, os.path.join(A.out, "idle-aigamedev-v3-vertical.mp4"), top)
    contact(outA, os.path.join(A.out, "idle-aigamedev-v3-contact.png"))
    for o in (outA, outAV): print("done", o, round(tA, 1), "s", os.path.getsize(o) // 1024, "KB")

asyncio.run(main())
