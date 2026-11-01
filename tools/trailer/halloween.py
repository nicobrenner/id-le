"""The Halloween cut (~30 s, 16:9 + 9:16), general audience. Recorded from id-le.com (or --base) on fresh visits.

    python3 tools/trailer/halloween.py --out ~/Desktop/idle-trailers [--base https://id-le.com]
"""
import argparse, asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from rec import *
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--base", default="https://id-le.com")
ap.add_argument("--work", default="/private/tmp/claude-501/trailer/hw"); ap.add_argument("--only", default="")
A = ap.parse_args(); os.makedirs(A.work, exist_ok=True); os.makedirs(A.out, exist_ok=True)
CR = "window.__arena.raw().filter(c => !c.lab)"


async def hiq(ctx):   # the full look (headless Chrome otherwise drops to the light quality, which skips bats and glows)
    await ctx.add_init_script("try { localStorage.setItem('arena.quality', 'high'); } catch (e) {}")


async def at_el(pg, sel):   # world coordinates of an element's centre
    return await pg.evaluate("""s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), c = window.__testCam.get();
      return { x: c.x + (r.left + r.width / 2 - innerWidth / 2) / c.z, y: c.y + (r.top + r.height / 2 - innerHeight / 2) / c.z }; }""", sel)


async def aim(pg, sel, z):   # put an element in the middle of the view at zoom z (measured again after each move: the floor's origin isn't the view's centre)
    p = await at_el(pg, sel)
    if not p: return None
    for _ in range(3):
        await cam(pg, p["x"], p["y"], z); await pg.wait_for_timeout(120)
        q = await pg.evaluate("""s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { dx: r.left + r.width / 2 - innerWidth / 2, dy: r.top + r.height / 2 - innerHeight / 2 }; }""", sel)
        p = {"x": p["x"] + q["dx"] / z, "y": p["y"] + q["dy"] / z}
    return p


async def boot(b, url, chrome_keep=""):
    ctx = await b.new_context(viewport={"width": W, "height": H}, color_scheme="dark"); await hiq(ctx); pg = await ctx.new_page()
    await pg.goto(url); await pg.wait_for_function("() => window.__restoredOrFresh && window.__testCam && window.__arena", timeout=60000)
    await pg.wait_for_timeout(6000); await hide_chrome(pg, chrome_keep); return pg


async def shoot(b):
    S = {}
    pg = await boot(b, A.base + "/?fresh=1&test&halloween")
    c0 = await pg.evaluate(f"() => {{ const c = {CR}.find(c => c._hw === 'hat') || {CR}[0]; return {{ x: c.x, y: c.y, name: c.name }}; }}")
    # 1 hook: the wide night with the moon, closing in on a creature in costume
    async with Shot(pg, "c01_hook", A.work) as s:
        await glide(pg, (c0["x"], c0["y"] - 120, 0.7), (c0["x"], c0["y"], 1.9), 4.2)
    S["hook"] = s.mp4
    # 2 costumes: two creatures in different costumes
    for i, kind in enumerate(["sheet", "wings", "pumpkin", "cape"]):
        if i >= 2: break
        t = f"{CR}.find(c => c._hw === '{kind}') || {CR}[{i + 2}]"
        async with Shot(pg, f"c02_costume{i}", A.work) as s:
            await follow(pg, t, 2.3, 2.2, ease=0.5)
        S[f"costume{i}"] = s.mp4
    # 3 jack-o'-lantern words
    # words are drawn on a canvas (their elements are hidden), so aim with the word objects: the pumpkin nearest the crowd
    p = await pg.evaluate(f"""() => {{ const cs = {CR}, mx = cs.reduce((a, c) => a + c.x, 0) / cs.length, my = cs.reduce((a, c) => a + c.y, 0) / cs.length;
      const ws = window.__advHooks.words().filter(w => w.el && w.el.classList.contains('hwpk')).sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my));
      return ws[0] ? {{ x: ws[0].x + 20, y: ws[0].y + 10 }} : null; }}""")
    async with Shot(pg, "c03_pumpkins", A.work) as s:
        if p: await glide(pg, (p["x"] - 50, p["y"], 2.2), (p["x"] + 50, p["y"], 2.6), 2.6)
        else: await asyncio.sleep(2.6)
    S["pumpkins"] = s.mp4
    # 4 bats, 5 a ghost (wide)
    mid = await pg.evaluate(f"() => {{ const cs = {CR}; return {{ x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length }}; }}")
    await cam(pg, mid["x"], mid["y"] + 120, 1.15)
    for _ in range(3): await pg.evaluate("() => window.__halloween.test.flock()"); await pg.wait_for_timeout(250)
    await pg.wait_for_timeout(1500)
    async with Shot(pg, "c04_bats", A.work) as s:
        await pg.evaluate("() => window.__halloween.test.flock()"); await pg.wait_for_timeout(3000)
    S["bats"] = s.mp4
    async with Shot(pg, "c05_ghost", A.work) as s:
        await pg.evaluate("() => { window.__halloween.test.ghost(); window.__halloween.test.ghost(); }"); await pg.wait_for_timeout(3000)
    S["ghost"] = s.mp4
    # 6 trick-or-treat: recruit until a group walks, then follow one carrying candy
    for _ in range(40):
        n = await pg.evaluate("() => { window.__treat._recruit(); window.__treat.tick(); return window.__arena.raw().filter(c => c._treat).length; }")
        if n: break
        await pg.wait_for_timeout(500)
    await pg.wait_for_timeout(2500)
    tt = f"{CR}.find(c => c.carrying && c.carrying.candy) || {CR}.find(c => c._treat) || {CR}[0]"
    async with Shot(pg, "c06_treat", A.work) as s:
        await follow(pg, tt, 2.0, 4.2, ease=0.35)
    S["treat"] = s.mp4
    # 7 the Gazette's Halloween edition
    await pg.evaluate("() => window.__treat._edition()")
    await hide_chrome(pg, "#ntf,#ntfpanel"); await pg.evaluate("() => window.__notify.toggle(true)")
    await cam(pg, mid["x"] + 250, mid["y"], 1.2)
    async with Shot(pg, "c07_gazette", A.work) as s:
        await pg.wait_for_timeout(2800)
    S["gazette"] = s.mp4
    await pg.context.close()
    # 8 the pedia in costume
    ctx = await b.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5, color_scheme="dark"); pg = await ctx.new_page()
    await pg.goto(A.base + "/pedia?halloween"); await pg.wait_for_timeout(7000)
    async with Shot(pg, "c08_pedia", A.work) as s:
        for i in range(100): await pg.evaluate(f"() => scrollTo(0, {i * 4})"); await asyncio.sleep(1 / 30)
    S["pedia"] = s.mp4
    await ctx.close()
    # 9 a world grown from Wikipedia's Halloween article
    ctx = await b.new_context(viewport={"width": W, "height": H}, color_scheme="dark"); await hiq(ctx); pg = await ctx.new_page()
    await pg.goto(A.base + "/?fresh=1&test&wiki=Halloween"); await pg.wait_for_function("() => window.__restoredOrFresh && window.__testCam", timeout=60000)
    await hide_chrome(pg)
    await pg.wait_for_function("() => document.querySelector('.wikisign')", timeout=60000); await pg.wait_for_timeout(2500)
    sg = await pg.evaluate("() => { const r = document.querySelector('.wikisign').getBoundingClientRect(), c = window.__testCam.get(), v = { w: innerWidth, h: innerHeight };"
                           " return { x: c.x + (r.left + r.width / 2 - v.w / 2) / c.z, y: c.y + (r.top + r.height / 2 - v.h / 2) / c.z }; }")
    async with Shot(pg, "c09_wiki", A.work) as s:
        await glide(pg, (sg["x"], sg["y"] + 260, 0.75), (sg["x"], sg["y"] + 180, 1.05), 4.2)
    S["wiki"] = s.mp4
    await ctx.close()
    return S


async def sound(b):
    ctx = await b.new_context(viewport={"width": 1280, "height": 720}); pg = await ctx.new_page()
    await pg.goto(A.base + "/?fresh=1&test&halloween"); await pg.wait_for_function("() => window.__restoredOrFresh && window.__audio", timeout=60000)
    await pg.mouse.click(640, 400); await pg.wait_for_timeout(4000)
    ev = [(9.5, "() => document.dispatchEvent(new CustomEvent('idle:ghost'))"), (15.5, "() => document.dispatchEvent(new CustomEvent('idle:knock'))"),
          (19.0, "() => document.dispatchEvent(new CustomEvent('idle:knock'))")]
    data = await record_audio(pg, 40, ev); p = os.path.join(A.work, "haunted.webm"); open(p, "wb").write(data); await ctx.close(); return p


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        try:
            S = await shoot(b) if A.only != "edit" else {k: os.path.join(A.work, v + ".mp4") for k, v in [("hook", "c01_hook"), ("costume0", "c02_costume0"), ("costume1", "c02_costume1"), ("pumpkins", "c03_pumpkins"), ("bats", "c04_bats"), ("ghost", "c05_ghost"), ("treat", "c06_treat"), ("gazette", "c07_gazette"), ("pedia", "c08_pedia"), ("wiki", "c09_wiki")]}
            au = await sound(b) if A.only != "edit" else os.path.join(A.work, "haunted.webm")
        finally:
            await b.close()
    w = A.work
    plan = [("hook", 0.4, 3.8, "It's Halloween in Id|le", "a little world of creatures that live in your browser"),
            ("costume0", 0, 2.1, "Everyone's in costume", ""), ("costume1", 0, 2.1, "", ""),
            ("pumpkins", 0, 2.4, "Candy, costumes, jack-o'-lantern words", ""),
            ("bats", 0, 2.4, "Bats cross the moon", ""), ("ghost", 0, 2.6, "Sleepers drift by as ghosts", ""),
            ("treat", 0.2, 3.8, "They go trick-or-treating", "and carry their candy home"),
            ("gazette", 0, 2.6, "The Gazette prints a Halloween edition", ""),
            ("pedia", 0, 2.8, "Even the encyclopedia dresses up", ""),
            ("wiki", 0.2, 3.8, "Grow a world from any Wikipedia article", "id-le.com/?wiki=Halloween")]
    parts = []
    for i, (k, st, d, t, sub) in enumerate(plan):
        c = trim(S[k], st, d, os.path.join(w, f"t{i:02d}.mp4"))
        if t: c = overlay(c, card_band(t, sub, os.path.join(w, f"card{i:02d}.png")), os.path.join(w, f"o{i:02d}.mp4"))
        parts.append(c)
    parts.append(still(card_full([("free · in your browser · open source", "serif"), ("id-le.com/?halloween", "mono")], os.path.join(w, "end.png")), 3.6, os.path.join(w, "end.mp4")))
    out16, total = assemble(parts, au, os.path.join(A.out, "idle-halloween-v1.mp4"))
    top = os.path.join(w, "vtop.png"); im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for txt, y, f, col in [("It's Halloween", 150, ImageFont.truetype(SERIF_B, 96), (255, 200, 140)), ("in Id|le", 270, ImageFont.truetype(SERIF_B, 96), (250, 240, 230)),
                           ("id-le.com/?halloween", 1650, ImageFont.truetype(MONO, 58), (255, 200, 140)), ("free · in your browser · open source", 1740, ImageFont.truetype(SERIF, 44), (230, 220, 240))]:
        d.text(((1080 - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=col)
    im.save(top)
    outv = vertical(out16, os.path.join(A.out, "idle-halloween-v1-vertical.mp4"), top)
    contact(out16, os.path.join(A.out, "idle-halloween-v1-contact.png"))
    print("done", out16, round(total, 1), "s", os.path.getsize(out16) // 1024, "KB;", outv, os.path.getsize(outv) // 1024, "KB")

asyncio.run(main())
