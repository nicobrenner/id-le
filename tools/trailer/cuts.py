"""The r/aigamedev cut (A, ~45 s, 16:9 + 9:16) and the r/MachineLearning cut (B, ~40 s). Recorded from id-le.com (or --base) on
fresh visits; A reuses the Halloween cut's costume, trick-or-treat and Wikipedia shots (run halloween.py first).

    python3 tools/trailer/cuts.py --out ~/Desktop/idle-trailers [--tests tests.txt] [--only edit]
"""
import argparse, asyncio, html, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from rec import *
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--base", default="https://id-le.com")
ap.add_argument("--work", default="/private/tmp/claude-501/trailer/ab"); ap.add_argument("--hw", default="/private/tmp/claude-501/trailer/hw")
ap.add_argument("--tests", default="", help="a saved run of tools/test_smoke.py, shown as the 'tests going green' shot")
ap.add_argument("--only", default="")
A = ap.parse_args(); os.makedirs(A.work, exist_ok=True); os.makedirs(A.out, exist_ok=True)
CR = "window.__arena.raw().filter(c => !c.lab)"
MID = f"(() => {{ const cs = {CR}; return {{ x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length }}; }})()"


async def page(b, url, keep="", w=W, h=H, dpr=1):
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, color_scheme="dark")
    await ctx.add_init_script("try { localStorage.setItem('arena.quality', 'high'); } catch (e) {}")
    pg = await ctx.new_page(); await pg.goto(url)
    if "id-le" in url or "localhost" in url:
        try: await pg.wait_for_function("() => window.__restoredOrFresh && window.__testCam", timeout=60000); await pg.wait_for_timeout(6000); await hide_chrome(pg, keep)
        except Exception: pass
    else: await pg.wait_for_timeout(4000)
    return pg


async def shoot_a(b):
    S = {}
    if A.only == "tests": return await shoot_made(b, S)
    pg = await page(b, A.base + "/?fresh=1&test")
    # hook: a hangry creature eating words, close
    c = await pg.evaluate(f"() => {{ const c = {CR}[0]; window.__goHangry(c); return c.name; }}")
    tgt = f"{CR}.find(c => c.name === {c!r})"
    await follow(pg, tgt, 2.6, 1.5, ease=0.6)
    async with Shot(pg, "a01_eat", A.work) as s: await follow(pg, tgt, 2.6, 3.6, ease=0.35)
    S["eat"] = s.mp4
    # talk / friends: a creature in the crowd, its bubbles
    async with Shot(pg, "a02_talk", A.work) as s: await follow(pg, f"{CR}[2]", 2.2, 2.6, ease=0.35)
    S["talk"] = s.mp4
    # charts: a fresh chart plotted near the crowd, then broken into code
    m = await pg.evaluate(f"() => {MID}")
    await cam(pg, m["x"] + 40, m["y"] - 40, 1.7)
    async with Shot(pg, "a03_chart", A.work) as s:
        await pg.evaluate(f"() => {{ window.__trChart = window.__chartTest({m['x'] + 40}, {m['y'] - 40}, true); }}"); await pg.wait_for_timeout(2600)
        await pg.evaluate("() => { try { window.__chartBreak(window.__trChart); } catch (e) {} }"); await pg.wait_for_timeout(2200)
    S["chart"] = s.mp4
    # storm: the timid ones hide
    await cam(pg, m["x"], m["y"], 1.3)
    async with Shot(pg, "a04_storm", A.work) as s:
        await pg.evaluate("() => { try { window.__idleWorld.setWeather('storm'); } catch (e) {} }"); await pg.wait_for_timeout(3600)
    S["storm"] = s.mp4
    await pg.evaluate("() => { try { window.__idleWorld.setWeather('clear'); } catch (e) {} }")
    # volcano
    await cam(pg, m["x"] - 150, m["y"], 1.15)
    async with Shot(pg, "a05_volcano", A.work) as s:
        await pg.evaluate(f"() => window.__dis.volcano({m['x'] - 150}, {m['y'] + 60})"); await pg.wait_for_timeout(4000)
    S["volcano"] = s.mp4
    # rave
    await pg.mouse.click(960, 540); await pg.wait_for_timeout(500)
    await pg.evaluate("() => { try { window.__music.setRave(true); window.__music.play(); } catch (e) {} }"); await pg.wait_for_timeout(5000)
    m = await pg.evaluate(f"() => {MID}"); await cam(pg, m["x"], m["y"], 1.6)
    async with Shot(pg, "a06_rave", A.work) as s: await glide(pg, (m["x"] - 60, m["y"], 1.6), (m["x"] + 60, m["y"], 1.9), 3.6)
    S["rave"] = s.mp4
    await pg.evaluate("() => { try { window.__music.setRave(false); window.__music.play(); } catch (e) {} }")
    # the mind, then a dream
    await hide_chrome(pg, "#whisper,#cline")
    nm = await pg.evaluate(f"() => {CR}[1].name")
    await pg.evaluate(f"() => window.__idleWorld.openCard({nm!r})"); await pg.wait_for_timeout(600)
    await pg.evaluate("() => { const t = document.querySelector('#ctabs [data-ct=\"mind\"]'); if (t) t.click(); }")
    async with Shot(pg, "a07_mind", A.work) as s: await follow(pg, f"{CR}[1]", 1.6, 3.4, ease=0.3)
    S["mind"] = s.mp4
    sl = await pg.evaluate(f"() => {{ const c = {CR}[3]; c.state = 'sleep'; c.until = Date.now() + 180000; c.tx = c.x; c.ty = c.y; return c.name; }}")
    await pg.wait_for_timeout(2500)
    await pg.evaluate(f"() => window.__idleWorld.openCard({sl!r})"); await pg.wait_for_timeout(600)
    await pg.evaluate("() => { const t = document.querySelector('#ctabs [data-ct=\"mind\"]'); if (t) t.click(); }"); await pg.wait_for_timeout(2500)
    async with Shot(pg, "a08_dream", A.work) as s: await follow(pg, f"{CR}[3]", 1.6, 3.6, ease=0.3)
    S["dream"] = s.mp4
    await pg.context.close()
    return await shoot_made(b, S)


async def shoot_made(b, S):
    # how it was made: the roadmap, the devlog, the tests
    for name, url, px in [("a09_roadmap", "https://github.com/nicobrenner/id-le/issues/20", 6), ("a10_devlog", "https://github.com/nicobrenner/id-le/blob/main/docs/devlog.md", 9)]:
        pg = await page(b, url, w=1280, h=720, dpr=1.5)
        await pg.evaluate("() => { const e = document.querySelector('.markdown-body, .js-comment-body'); if (e) e.scrollIntoView(); }"); await pg.wait_for_timeout(800)
        async with Shot(pg, name, A.work) as s:
            for i in range(90): await pg.evaluate(f"() => scrollBy(0, {px})"); await asyncio.sleep(1 / 30)
        S[name[4:]] = s.mp4; await pg.context.close()
    if A.tests and os.path.exists(A.tests):
        lines = [l for l in open(A.tests).read().splitlines() if l.strip()]
        body = "".join(f"<div class='{'ok' if l.strip().startswith('ok') else 'h'}'>{html.escape(l)}</div>" for l in lines)
        hp = os.path.join(A.work, "tests.html")
        open(hp, "w").write(f"""<!doctype html><meta charset=utf-8><style>body{{margin:0;background:#0d0d12;color:#cfd3dc;font:22px/1.55 Menlo,monospace;padding:40px 60px}}
.ok{{color:#7ee787}}.h{{color:#9aa4b2}}div{{white-space:pre;overflow:hidden;text-overflow:ellipsis;opacity:0;animation:in .2s forwards}}@keyframes in{{to{{opacity:1}}}}
{''.join(f'div:nth-child({i + 1}){{animation-delay:{i * 0.16:.2f}s}}' for i in range(len(lines)))}</style><div>$ python3 tools/test_smoke.py</div>{body}""")
        pg = await page(b, "file://" + hp)
        async with Shot(pg, "a11_tests", A.work) as s: await pg.reload(); await pg.wait_for_timeout(int(len(lines) * 160 + 1200))
        S["tests"] = s.mp4; await pg.context.close()
    return S


async def shoot_b(b):
    # the lab at 1280×720 ×1.5: the same 1920×1080 frames with everything (panel text, labels) half again as large
    S = {}; pg = await page(b, A.base + "/?fresh=1&test", w=1280, h=720, dpr=1.5)
    await pg.evaluate("() => window.__places.openLab()"); await pg.wait_for_timeout(12000)
    await hide_chrome(pg)
    m = await pg.evaluate("() => { const cs = window.__arena.raw().filter(c => c.lab); return { x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length }; }")
    inbox = await pg.evaluate("() => { const h = (window.__lab.handles ? window.__lab.handles() : []).find(h => /inbox/i.test(h.kind || h.label || '')); return h ? { x: h.x, y: h.y } : null; }")
    ib = inbox or m
    async with Shot(pg, "b01_inbox", A.work) as s: await glide(pg, (ib["x"], ib["y"], 1.1), (ib["x"] + 40, ib["y"], 1.6), 5.0)
    S["inbox"] = s.mp4
    async with Shot(pg, "b02_travel", A.work) as s:
        await follow(pg, "window.__arena.raw().find(c => c.lab && c.carrying) || window.__arena.raw().find(c => c.lab)", 1.9, 6.5, ease=0.3)
    S["travel"] = s.mp4
    await hide_chrome(pg, "#team"); await cam(pg, m["x"] - 200, m["y"], 1.15); await pg.wait_for_timeout(400)
    async with Shot(pg, "b03_threshold", A.work) as s:
        for i in range(20):
            await pg.evaluate(f"() => {{ try {{ window.__lab.setThr(2, {0.6 - i * 0.012:.3f}); }} catch (e) {{}} }}"); await pg.wait_for_timeout(330)
    S["threshold"] = s.mp4
    await pg.context.close()
    # the Tiny Oracle understands a typed command
    pg = await page(b, A.base + "/?fresh=1&test", keep="#whisper,#cline")
    await pg.wait_for_function("() => window.__oracle && window.__oracle.kv !== undefined", timeout=60000); await pg.wait_for_timeout(4000)
    await pg.evaluate("() => window.__idleWorld.openCard('Crawly')"); await pg.wait_for_timeout(700)
    tgt = "window.__arena.raw().find(c => c.name === 'Crawly')"
    async with Shot(pg, "b04_oracle", A.work) as s:
        await follow(pg, tgt, 1.6, 0.8, ease=0.5)
        await pg.fill("#whisperIn", "fetch the coffee"); await pg.wait_for_timeout(500); await pg.press("#whisperIn", "Enter")
        await follow(pg, tgt, 1.6, 6.0, ease=0.25)
    S["oracle"] = s.mp4
    await pg.context.close()
    return S


async def music(b, setup, secs, name):
    ctx = await b.new_context(viewport={"width": 1280, "height": 720}); pg = await ctx.new_page()
    await pg.goto(A.base + "/?fresh=1&test"); await pg.wait_for_function("() => window.__restoredOrFresh && window.__audio && window.__music", timeout=60000)
    await pg.mouse.click(640, 400); await pg.wait_for_timeout(1500); await pg.evaluate(setup); await pg.wait_for_timeout(3500)
    data = await record_audio(pg, secs); p = os.path.join(A.work, name); open(p, "wb").write(data); await ctx.close(); return p


def V(k): return os.path.join(A.work, k + ".mp4")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        try:
            if A.only != "edit":
                if A.only in ("", "a", "tests"): await shoot_a(b)
                if A.only in ("", "b", "tests"): await shoot_b(b)
                await music(b, "() => { window.__music.setRave(false); window.__music.loadSet && 0; window.__music.play(); }", 52, "deck.webm")
                await music(b, "() => { window.__music.bgSet({ style: 'dreamy' }); }", 46, "dreamy.webm")
        finally:
            await b.close()
    w = A.work; hw = A.hw
    # ---------- A: r/aigamedev ----------
    plan = [(V("a01_eat"), 0.2, 3.2, "These creatures eat words", "a little world that lives in your browser"),
            (V("a02_talk"), 0, 2.2, "They talk, make friends, keep diaries", ""),
            (V("a03_chart"), 0.1, 4.4, "Mathematicians plot charts", "Debuggers break them into code, and others eat it"),
            (V("a04_storm"), 0.3, 2.8, "Storms scare the timid ones", ""),
            (V("a05_volcano"), 0.2, 3.2, "Volcanoes heave up through the words", ""),
            (os.path.join(hw, "c02_costume0.mp4"), 0, 2.0, "Tonight they're in costume", ""),
            (os.path.join(hw, "c06_treat.mp4"), 0.3, 2.6, "and go trick-or-treating", ""),
            (V("a06_rave"), 0.2, 3.0, "Throw a rave: each body dances its own way", ""),
            (os.path.join(hw, "c09_wiki.mp4"), 0.3, 3.0, "Grow a world from any Wikipedia article", ""),
            (V("a07_mind"), 0.2, 2.8, "You can read their minds", ""),
            (V("a08_dream"), 0.2, 3.0, "…and watch them dream about their day", ""),
            (V("a09_roadmap"), 0, 2.4, "Built in 4 days", "by one person and a team of Claude agents"),
            (V("a10_devlog"), 0, 2.2, "Every feature measured in a devlog", ""),
            (V("a11_tests"), 0.5, 2.6, "Tests on every push", "")]
    parts = []
    for i, (src, st, d, t, sub) in enumerate(plan):
        if not os.path.exists(src): print("missing", src); continue
        c = trim(src, st, d, os.path.join(w, f"at{i:02d}.mp4"))
        if t: c = overlay(c, card_band(t, sub, os.path.join(w, f"acard{i:02d}.png")), os.path.join(w, f"ao{i:02d}.mp4"))
        parts.append(c)
    parts.append(still(card_full([("33+ agent tasks · 256 commits", "mono"), ("1,000 creatures · no game engine · open source", "serif"), ("id-le.com", "mono"), ("github.com/nicobrenner/id-le", "small")],
                                 os.path.join(w, "aend.png")), 4.2, os.path.join(w, "aend.mp4")))
    outA, tA = assemble(parts, os.path.join(w, "deck.webm"), os.path.join(A.out, "idle-aigamedev-v1.mp4"))
    top = os.path.join(w, "avtop.png"); im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for txt, y, f, col in [("Id|le", 140, ImageFont.truetype(SERIF_B, 120), (250, 240, 230)), ("creatures that live in your browser", 300, ImageFont.truetype(SERIF, 50), (255, 200, 140)),
                           ("id-le.com", 1650, ImageFont.truetype(MONO, 64), (255, 200, 140)), ("built with a team of Claude agents · open source", 1750, ImageFont.truetype(SERIF, 38), (230, 220, 240))]:
        d.text(((1080 - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=col)
    im.save(top); outAV = vertical(outA, os.path.join(A.out, "idle-aigamedev-v1-vertical.mp4"), top)
    contact(outA, os.path.join(A.out, "idle-aigamedev-v1-contact.png"))
    # ---------- B: r/MachineLearning ----------
    plan = [(V("b01_inbox"), 0.2, 4.6, "Each creature here is a real text classifier", "a data lab inside a little browser world"),
            (V("b02_travel"), 0.2, 3.2, "Spam filter, then mood tagger, then router", "messages walk from stage to stage"),
            (V("b02_travel"), 3.4, 3.0, "MiniLM encoder · 3 logistic heads", "~4 ms per message · nothing leaves your browser"),
            (V("b03_threshold"), 0.2, 6.2, "Tune the team, see the trade-off", "lower the router's bar: fewer messages go to review"),
            (V("b04_oracle"), 0.3, 6.4, "A 10.8 MB chat model, trained from scratch", "it reads “fetch the coffee” and the creature does it")]
    parts = []
    for i, (src, st, d, t, sub) in enumerate(plan):
        if not os.path.exists(src): print("missing", src); continue
        c = trim(src, st, d, os.path.join(w, f"bt{i:02d}.mp4")); c = overlay(c, card_band(t, sub, os.path.join(w, f"bcard{i:02d}.png")), os.path.join(w, f"bo{i:02d}.mp4")); parts.append(c)
    parts.append(still(card_full([("try the data lab", "serif"), ("id-le.com/#lab", "mono"), ("open source · github.com/nicobrenner/id-le", "small")], os.path.join(w, "bend.png")), 4.0, os.path.join(w, "bend.mp4")))
    outB, tB = assemble(parts, os.path.join(w, "dreamy.webm"), os.path.join(A.out, "idle-ml-v1.mp4"))
    contact(outB, os.path.join(A.out, "idle-ml-v1-contact.png"))
    for o, t in [(outA, tA), (outAV, tA), (outB, tB)]: print("done", o, round(t, 1), "s", os.path.getsize(o) // 1024, "KB")

asyncio.run(main())
