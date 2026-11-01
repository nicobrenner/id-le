"""v2 of the r/aigamedev and r/MachineLearning cuts (Nico, 11-01: "the one for aigamedev ... starts off a bit boring ... show some of
the controls"). Recorded with Halloween OFF (localStorage 'idle.halloween' = 'off' before load, checked in every page), so no moon.

A (aigamedev, ~40 s + 9:16): a fast opening burst of the player's controls on the deck's rave music (the DJ deck and rave, the studio's
weather, mutate, a volcano, a Wikipedia world), then life up close (eating, two friends meeting, a chart broken into code, a mind,
a dream), how it was made (roadmap, devlog, tests: reused from v1, no Halloween in them), and it ends on a memory reel playing.
B (MachineLearning, ~26 s): v1's script, tighter, without the Halloween look.

    python3 tools/trailer/cuts2.py --out ~/Desktop/idle-trailers [--only a|b|edit]
"""
import argparse, asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from rec import *
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--base", default="https://id-le.com")
ap.add_argument("--work", default="/private/tmp/claude-501/trailer/v2"); ap.add_argument("--v1", default="/private/tmp/claude-501/trailer/ab")
ap.add_argument("--only", default="")
A = ap.parse_args(); os.makedirs(A.work, exist_ok=True); os.makedirs(A.out, exist_ok=True)
CR = "window.__arena.raw().filter(c => !c.lab)"
MID = f"(() => {{ const cs = {CR}; return {{ x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length }}; }})()"
BEAT = 60 / 122   # the deck's house preset


async def page(b, url, keep="", w=W, h=H, dpr=1):
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, color_scheme="dark")
    await ctx.add_init_script("try { localStorage.setItem('idle.halloween', 'off'); localStorage.setItem('arena.quality', 'high'); } catch (e) {}")
    pg = await ctx.new_page(); await pg.goto(url)
    await pg.wait_for_function("() => window.__restoredOrFresh && window.__testCam", timeout=60000); await pg.wait_for_timeout(6000)
    assert not await pg.evaluate("() => !!(window.__halloween && window.__halloween.on())"), "Halloween is on: the shot would show the moon"
    await hide_chrome(pg, keep)
    return pg


async def bubble(pg, name, text, ms=2400):
    await pg.evaluate("""([n, t, ms]) => { const c = window.__arena.raw().find(c => c.name === n); if (!c || !c.bub) return;
      c.bub.textContent = t; c.bub.classList.add('on'); clearTimeout(c._bt); c._bt = setTimeout(() => c.bub.classList.remove('on'), ms); }""", [name, text, ms])


async def shoot_a(b):
    pg = await page(b, A.base + "/?fresh=1&test")
    await pg.mouse.click(700, 540); await pg.wait_for_timeout(600)   # a gesture, so audio may start
    m = await pg.evaluate(f"() => {MID}")
    # 1. the DJ deck: switch the music to the deck, tap in a beat, rave on, play; creatures dance (panel on the right)
    await hide_chrome(pg, "#dj"); await pg.evaluate("() => document.querySelector('#djBtn').click()"); await pg.wait_for_timeout(500)
    await pg.evaluate("() => { const s = document.querySelector('#dj [data-x=\"src:deck\"]'); if (s) s.click(); }"); await pg.wait_for_timeout(300)
    await cam(pg, m["x"] + 170, m["y"], 1.5)
    async with Shot(pg, "a01_deck", A.work) as s:
        for g in ["kick:2", "kick:6", "snare:4", "snare:12", "hat:1", "hat:3", "hat:5", "clap:12"]:
            await pg.evaluate(f"() => {{ const e = document.querySelector('#dj [data-g=\"{g}\"]'); if (e) e.click(); }}"); await pg.wait_for_timeout(110)
        await pg.evaluate("() => { const r = document.querySelector('#dj [data-x=\"rave\"]'); if (r && !window.__music.rave()) r.click(); const p = document.querySelector('#dj [data-x=\"play\"]'); if (p && !/stop/.test(p.textContent)) p.click(); }")
        await glide(pg, (m["x"] + 170, m["y"], 1.5), (m["x"] + 150, m["y"], 1.9), 3.4)
    await pg.evaluate("() => { const p = document.querySelector('#dj [data-x=\"play\"]'); if (p && /stop/.test(p.textContent)) p.click(); window.__music.setRave(false); const c = document.querySelector('#dj [data-x=\"close\"]'); if (c) c.click(); }")
    await pg.wait_for_timeout(1500)   # the rave's spotlights fade before the next shot
    # 2. the studio: weather from clear to a storm, its strength fader pushed up
    await hide_chrome(pg, "#studio"); await pg.evaluate("() => document.querySelector('#studioBtn').click()"); await pg.wait_for_timeout(700)
    await cam(pg, m["x"] + 180, m["y"], 1.35)
    async with Shot(pg, "a02_storm", A.work) as s:
        await pg.wait_for_timeout(400)
        await pg.evaluate("""() => { const s = [...document.querySelectorAll('#studio select')].find(x => [...x.options].some(o => o.value === 'bitrain'));
          if (s) { s.value = 'bitrain'; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); } }""")
        for v in range(30, 101, 7):
            await pg.evaluate(f"""() => {{ const r = document.querySelector('#studio .dyn input[type=range]'); if (r) {{ r.value = {v}; r.dispatchEvent(new Event('input', {{ bubbles: true }})); }} }}""")
            await pg.wait_for_timeout(110)
        await pg.wait_for_timeout(1600)
    await pg.evaluate("() => { const c = document.querySelector('#studio [data-s=\"close\"]'); if (c) c.click(); try { window.__idleWorld.setWeather('clear'); } catch (e) {} }")
    # 3. mutate: a creature's card, mutate ×3 a few times
    await hide_chrome(pg, "#whisper,#cline")
    nm = await pg.evaluate(f"() => {CR}[0].name"); tgt = f"{CR}.find(c => c.name === {nm!r})"
    await pg.evaluate(f"() => window.__idleWorld.openCard({nm!r})"); await pg.wait_for_timeout(500)
    await follow(pg, tgt, 2.3, 0.6, ease=0.7)
    async with Shot(pg, "a03_mutate", A.work) as s:
        for i in range(3):
            await pg.evaluate("() => { const b = document.querySelector('[data-wact=\"big\"]'); if (b) b.click(); }"); await follow(pg, tgt, 2.3, 0.85, ease=0.35)
    await pg.evaluate("() => { const x = document.querySelector('#whisper .cx'); if (x) x.click(); }"); await hide_chrome(pg)
    # 4. a volcano heaving up through the words
    m = await pg.evaluate(f"() => {MID}"); await cam(pg, m["x"] - 120, m["y"], 1.3)
    async with Shot(pg, "a04_volcano", A.work) as s:
        await pg.evaluate(f"() => window.__dis.volcano({m['x'] - 120}, {m['y'] + 60})"); await pg.wait_for_timeout(3200)
    await pg.wait_for_timeout(2500)
    # 6. life, up close: a hangry one eating words
    c = await pg.evaluate(f"() => {{ const c = {CR}[4] || {CR}[0]; window.__goHangry(c); return c.name; }}")
    tgt = f"{CR}.find(c => c.name === {c!r})"; await follow(pg, tgt, 2.7, 1.2, ease=0.6)
    async with Shot(pg, "a06_eat", A.work) as s: await follow(pg, tgt, 2.7, 3.2, ease=0.35)
    # 7. two friends meeting (staged: one walks up to the other and they greet, each in its own voice)
    pair = await pg.evaluate(f"""() => {{ const cs = {CR}.filter(c => c.state !== 'sleep'); const a = cs[1], b = cs[2];
      b.tx = a.x + 46; b.ty = a.y + 6; b.state = 'move'; a.tx = a.x; a.ty = a.y; return [a.name, b.name]; }}""")
    mid = f"(() => {{ const cs = {CR}; const a = cs.find(c => c.name === {pair[0]!r}), b = cs.find(c => c.name === {pair[1]!r}); return {{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }}; }})()"
    await follow(pg, mid, 2.4, 0.8, ease=0.6)
    async with Shot(pg, "a07_friends", A.work) as s:
        await follow(pg, mid, 2.4, 1.6, ease=0.3)
        await bubble(pg, pair[1], "hi, friend ♥"); await follow(pg, mid, 2.4, 0.9, ease=0.3)
        await bubble(pg, pair[0], "*waves two legs* ♥"); await follow(pg, mid, 2.4, 1.4, ease=0.3)
    # 8. a Mathematician's chart, broken into code by a Debugger
    m = await pg.evaluate(f"() => {MID}"); await cam(pg, m["x"] + 40, m["y"] - 40, 2.0)
    async with Shot(pg, "a08_chart", A.work) as s:
        await pg.evaluate(f"() => {{ window.__trChart = window.__chartTest({m['x'] + 40}, {m['y'] - 40}, true); }}"); await pg.wait_for_timeout(2400)
        await pg.evaluate("() => { try { window.__chartBreak(window.__trChart); } catch (e) {} }"); await pg.wait_for_timeout(2200)
    # 9. the mind, then 10. a dream
    await hide_chrome(pg, "#whisper,#cline")
    nm = await pg.evaluate(f"() => {CR}[1].name")
    await pg.evaluate(f"() => window.__idleWorld.openCard({nm!r})"); await pg.wait_for_timeout(600)
    await pg.evaluate("() => { const t = document.querySelector('#ctabs [data-ct=\"mind\"]'); if (t) t.click(); }")
    async with Shot(pg, "a09_mind", A.work) as s: await follow(pg, f"{CR}[1]", 1.9, 3.0, ease=0.3)
    sl = await pg.evaluate(f"() => {{ const c = {CR}[3]; c.state = 'sleep'; c.until = Date.now() + 180000; c.tx = c.x; c.ty = c.y; return c.name; }}")
    await pg.wait_for_timeout(2500)
    await pg.evaluate(f"() => window.__idleWorld.openCard({sl!r})"); await pg.wait_for_timeout(600)
    await pg.evaluate("() => { const t = document.querySelector('#ctabs [data-ct=\"mind\"]'); if (t) t.click(); }"); await pg.wait_for_timeout(2500)
    async with Shot(pg, "a10_dream", A.work) as s: await follow(pg, f"{CR}[3]", 1.9, 3.2, ease=0.3)
    await pg.evaluate("() => { const x = document.querySelector('#whisper .cx'); if (x) x.click(); }")
    # 11. the end: a memory reel the world made, playing
    await hide_chrome(pg, "#reel")
    for i in range(12):
        n = await pg.evaluate("() => { window.__reels.refresh(true); return window.__reels.state().list.length; }")
        if n: break
        await pg.wait_for_timeout(5000)
    rid = await pg.evaluate("() => { const l = window.__reels.state().list; return l.length ? l[l.length - 1].id : null; }")
    print("reel", rid)
    if rid:
        await pg.evaluate(f"() => window.__reels.play({rid!r})"); await pg.wait_for_timeout(1200)
        async with Shot(pg, "a11_reel", A.work) as s: await pg.wait_for_timeout(4500)
    await pg.context.close()
    # 5. a Wikipedia world growing (its own fresh page)
    pg = await page(b, A.base + "/?fresh=1&test&wiki=Octopus")
    await pg.wait_for_timeout(9000)
    sign = await pg.evaluate("() => { const a = document.querySelector('a.wikisign'); if (!a) return null; const r = a.getBoundingClientRect(); const c = window.__testCam.get(); return { x: c.x + (r.left + r.width / 2 - innerWidth / 2) / c.z, y: c.y + (r.top + r.height / 2 - innerHeight / 2) / c.z }; }")
    await hide_chrome(pg)
    c0 = await pg.evaluate("() => window.__testCam.get()"); s0 = sign or c0
    async with Shot(pg, "a05_wiki", A.work) as s: await glide(pg, (s0["x"], s0["y"] + 60, 1.25), (s0["x"] + 80, s0["y"] + 200, 1.05), 3.6)
    await pg.context.close()


async def shoot_b(b):
    pg = await page(b, A.base + "/?fresh=1&test", w=1280, h=720, dpr=1.5)
    await pg.evaluate("() => window.__places.openLab()"); await pg.wait_for_timeout(12000); await hide_chrome(pg)
    m = await pg.evaluate("() => { const cs = window.__arena.raw().filter(c => c.lab); return { x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length }; }")
    inbox = await pg.evaluate("() => { const h = (window.__lab.handles ? window.__lab.handles() : []).find(h => /inbox/i.test(h.kind || h.label || '')); return h ? { x: h.x, y: h.y } : null; }")
    ib = inbox or m
    async with Shot(pg, "b01_inbox", A.work) as s: await glide(pg, (ib["x"], ib["y"], 1.35), (ib["x"] + 40, ib["y"], 1.85), 5.0)
    async with Shot(pg, "b02_travel", A.work) as s:
        await follow(pg, "window.__arena.raw().find(c => c.lab && c.carrying) || window.__arena.raw().find(c => c.lab)", 2.15, 6.5, ease=0.3)
    await hide_chrome(pg, "#team"); await cam(pg, m["x"] - 170, m["y"], 1.3); await pg.wait_for_timeout(400)
    async with Shot(pg, "b03_threshold", A.work) as s:
        for i in range(20):
            await pg.evaluate(f"() => {{ try {{ window.__lab.setThr(2, {0.6 - i * 0.012:.3f}); }} catch (e) {{}} }}"); await pg.wait_for_timeout(330)
    await pg.context.close()
    pg = await page(b, A.base + "/?fresh=1&test", keep="#whisper,#cline")
    await pg.wait_for_function("() => window.__oracle && window.__oracle.kv !== undefined", timeout=60000); await pg.wait_for_timeout(4000)
    await pg.evaluate("() => window.__idleWorld.openCard('Crawly')"); await pg.wait_for_timeout(700)
    tgt = "window.__arena.raw().find(c => c.name === 'Crawly')"
    async with Shot(pg, "b04_oracle", A.work) as s:
        await follow(pg, tgt, 1.85, 0.8, ease=0.5)
        await pg.fill("#whisperIn", "fetch the coffee"); await pg.wait_for_timeout(500); await pg.press("#whisperIn", "Enter")
        await follow(pg, tgt, 1.85, 6.0, ease=0.25)
    await pg.context.close()


async def music(b, setup, secs, name):
    ctx = await b.new_context(viewport={"width": 1280, "height": 720})
    await ctx.add_init_script("try { localStorage.setItem('idle.halloween', 'off'); } catch (e) {}")
    pg = await ctx.new_page(); await pg.goto(A.base + "/?fresh=1&test")
    await pg.wait_for_function("() => window.__restoredOrFresh && window.__audio && window.__music", timeout=60000)
    await pg.mouse.click(640, 400); await pg.wait_for_timeout(1500); await pg.evaluate(setup); await pg.wait_for_timeout(3000)
    data = await record_audio(pg, secs); p = os.path.join(A.work, name); open(p, "wb").write(data); await ctx.close(); return p


def V(k): return os.path.join(A.work, k + ".mp4")


def build(plan, prefix):
    parts = []
    for i, (src, st, d, t, sub) in enumerate(plan):
        if not os.path.exists(src): print("missing", src); continue
        c = trim(src, st, d, os.path.join(A.work, f"{prefix}t{i:02d}.mp4"))
        if t: c = overlay(c, card_band(t, sub, os.path.join(A.work, f"{prefix}card{i:02d}.png")), os.path.join(A.work, f"{prefix}o{i:02d}.mp4"), start=0.05, fade=0.15)
        parts.append(c)
    return parts


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        try:
            if A.only in ("", "a"): await shoot_a(b)
            if A.only in ("", "b"): await shoot_b(b)
            if A.only in ("", "a", "music"):
                await music(b, "() => { window.__music.setSource && window.__music.setSource('deck'); window.__music.setRave(true); window.__music.play(); }", 16, "rave.webm")
                await music(b, "() => { window.__music.setRave(false); window.__music.bgSet({ style: 'world' }); }", 40, "home.webm")
            if A.only in ("", "b", "music"):
                await music(b, "() => { window.__music.bgSet({ style: 'dreamy' }); }", 46, "dreamy.webm")
        finally:
            await b.close()
    w = A.work; b4 = 4 * BEAT
    # ---------- A: r/aigamedev v2 ----------
    plan = [(V("a01_deck"), 0.3, 2 * b4 - 0.6, "DJ for a tiny world", "tap a beat, turn on the rave: each body dances its own way"),
            (V("a02_storm"), 0.3, b4 + 0.3, "Paint the weather", ""),
            (V("a03_mutate"), 0.1, b4 + 0.3, "Mutate anyone", ""),
            (V("a04_volcano"), 0.4, b4 + 0.3, "Wake a volcano", ""),
            (V("a05_wiki"), 0.2, b4 + 0.6, "Grow a world from any Wikipedia article", ""),
            (V("a06_eat"), 0.2, 2.8, "These creatures eat words", "a little world that lives in your browser"),
            (V("a07_friends"), 0.6, 3.2, "make friends", ""),
            (V("a08_chart"), 0.1, 4.2, "Mathematicians plot charts", "Debuggers break them into code, and others eat it"),
            (V("a09_mind"), 0.2, 2.6, "You can read their minds", ""),
            (V("a10_dream"), 0.2, 2.8, "…and watch them dream about their day", ""),
            (os.path.join(A.v1, "a09_roadmap.mp4"), 0, 2.4, "Built in 4 days", "by one person and a team of Claude agents"),
            (os.path.join(A.v1, "a10_devlog.mp4"), 0, 2.0, "Every feature measured in a devlog", ""),
            (os.path.join(A.v1, "a11_tests.mp4"), 0.5, 2.4, "Tests on every push", ""),
            (V("a11_reel"), 0.2, 3.6, "The world even cuts its own films", "memory reels, from what they lived through")]
    parts = build(plan, "a")
    parts.append(still(card_full([("33+ agent tasks · 256 commits", "mono"), ("no game engine · open source", "serif"), ("id-le.com", "mono"),
                                  ("github.com/nicobrenner/id-le", "small")], os.path.join(w, "aend.png")), 4.0, os.path.join(w, "aend.mp4")))
    # music: the rave deck under the opening burst, crossfading into the world's background music
    burst = sum(dur(x) for x in parts[:5]) - 4 * 0.3
    mix = os.path.join(w, "amix.m4a")
    sh("ffmpeg", "-y", "-v", "error", "-i", os.path.join(w, "rave.webm"), "-i", os.path.join(w, "home.webm"), "-filter_complex",
       f"[0:a]atrim=0:{burst + 1.2:.2f},asetpts=PTS-STARTPTS[r];[1:a]atrim=2,asetpts=PTS-STARTPTS[h];[r][h]acrossfade=d=1.6:c1=tri:c2=tri[a]",
       "-map", "[a]", "-c:a", "aac", "-b:a", "192k", mix)
    outA, tA = assemble(parts, mix, os.path.join(A.out, "idle-aigamedev-v2.mp4"))
    top = os.path.join(w, "avtop.png"); im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for txt, y, f, col in [("Id|le", 140, ImageFont.truetype(SERIF_B, 120), (250, 240, 230)), ("creatures that live in your browser", 300, ImageFont.truetype(SERIF, 50), (255, 200, 140)),
                           ("id-le.com", 1650, ImageFont.truetype(MONO, 64), (255, 200, 140)), ("built with a team of Claude agents · open source", 1750, ImageFont.truetype(SERIF, 38), (230, 220, 240))]:
        d.text(((1080 - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=col)
    im.save(top); outAV = vertical(outA, os.path.join(A.out, "idle-aigamedev-v2-vertical.mp4"), top)
    contact(outA, os.path.join(A.out, "idle-aigamedev-v2-contact.png"))
    # ---------- B: r/MachineLearning v2 ----------
    plan = [(V("b01_inbox"), 0.2, 4.6, "Each creature here is a real text classifier", "a data lab inside a little browser world"),
            (V("b02_travel"), 0.2, 3.2, "Spam filter, then mood tagger, then router", "messages walk from stage to stage"),
            (V("b02_travel"), 3.4, 3.0, "MiniLM encoder · 3 logistic heads", "~4 ms per message · nothing leaves your browser"),
            (V("b03_threshold"), 0.2, 6.2, "Tune the team, see the trade-off", "lower the router's bar: fewer messages go to review"),
            (V("b04_oracle"), 0.3, 6.4, "A 10.8 MB chat model, trained from scratch", "it reads “fetch the coffee” and the creature does it")]
    parts = build(plan, "b")
    parts.append(still(card_full([("try the data lab", "serif"), ("id-le.com/#lab", "mono"), ("open source · github.com/nicobrenner/id-le", "small")],
                                 os.path.join(w, "bend.png")), 4.0, os.path.join(w, "bend.mp4")))
    outB, tB = assemble(parts, os.path.join(w, "dreamy.webm"), os.path.join(A.out, "idle-ml-v2.mp4"))
    contact(outB, os.path.join(A.out, "idle-ml-v2-contact.png"))
    for o, t in [(outA, tA), (outAV, tA), (outB, tB)]: print("done", o, round(t, 1), "s", os.path.getsize(o) // 1024, "KB")

asyncio.run(main())
