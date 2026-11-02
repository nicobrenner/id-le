"""Record the Epoch 0 intro (demo/idle-epoch0.js) as MP4s with sound, plus a contact sheet each: one per "visit".

    python3 tools/trailer/epoch0_rec.py --out ~/Desktop/idle-trailers --takes 2
    python3 tools/trailer/epoch0_rec.py --boot --story --phone --name intro-boot-v1 --takes 1   # the terminal boot first, story version,
                                                                                               # desktop and phone side by side

Each take samples a fresh intro from the real Tiny Oracle (window.__epoch0.makeLiveContent: the same schedule, prompts and blocklist
as the live intro), then draws it frame by frame (window.__epoch0.frame, 30 fps) and renders its sound offline
(window.__epoch0.renderAudio). It runs against a static build of the whole game, so the Oracle and the creature legs are the real ones.
Takes the shared browser lock.
"""
import argparse, base64, contextlib, json, os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.expanduser("~/Desktop/idle-trailers")); ap.add_argument("--takes", type=int, default=2)
    ap.add_argument("--size", default="1280x720"); ap.add_argument("--fps", type=int, default=30); ap.add_argument("--port", type=int, default=8814)
    ap.add_argument("--boot", action="store_true", help="the terminal boot first (idle-boot.js)"); ap.add_argument("--story", action="store_true", help="the storyline version (the scientist)")
    ap.add_argument("--phone", action="store_true", help="also draw a phone frame (390x844) and put it beside the desktop one"); ap.add_argument("--name", default="intro-epoch0")
    a = ap.parse_args(); W, H = map(int, a.size.split("x")); os.makedirs(a.out, exist_ok=True)
    site = tempfile.mkdtemp(prefix="e0rec-"); shutil.rmtree(site)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_static.py"), "--out", site], check=True, stdout=subprocess.DEVNULL)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(a.port), "-d", site], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    made = []
    try:
        with browser_lock(), sync_playwright() as p:
            b = p.chromium.launch()
            try:
                pg = b.new_page(viewport={"width": 900, "height": 600}); pg.goto(f"http://localhost:{a.port}/?fresh=1&intro=0")
                for _ in range(160):
                    if pg.evaluate("() => !!(window.__oracle && window.__oracle.ready && window.__epoch0 && window.__critDraw)"): break
                    pg.wait_for_timeout(500)
                for take in range(1, a.takes + 1):
                    ct = pg.evaluate("async ([s, story, boot]) => { const c = await window.__epoch0.makeLiveContent({ seed: s, story }); c.boot = boot; window.__rec = c; return { seed: c.seed, lines: c.lines.map(l => [l.e, l.src, l.text]), cont: c.cont, contSrc: c.contSrc, total: window.__epoch0.total(c) }; }", [int(time.time()) % 100000 + take * 7, a.story, a.boot])
                    frames = tempfile.mkdtemp(prefix=f"e0f{take}-"); n = int(ct["total"] * a.fps)
                    pg.evaluate(f"() => {{ window.__cv = document.createElement('canvas'); window.__cv.width = {W}; window.__cv.height = {H}; window.__cvp = document.createElement('canvas'); window.__cvp.width = 780; window.__cvp.height = 1688; }}")
                    for i in range(n):
                        url = pg.evaluate("t => { window.__epoch0.frame(window.__rec, t, window.__cv); return window.__cv.toDataURL('image/png'); }", i / a.fps)
                        open(os.path.join(frames, f"f{i:05d}.png"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
                        if a.phone:   # the same content on a phone (390x844 at 2x)
                            url = pg.evaluate("t => { window.__epoch0.frame(window.__rec, t, window.__cvp, { phone: true, scale: 2 }); return window.__cvp.toDataURL('image/png'); }", i / a.fps)
                            open(os.path.join(frames, f"p{i:05d}.png"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
                    wav = pg.evaluate("async () => await window.__epoch0.renderAudio(window.__rec)")
                    open(os.path.join(frames, "a.wav"), "wb").write(base64.b64decode(wav))
                    mp4 = os.path.join(a.out, f"{a.name}.mp4" if take == 1 else f"{a.name}-take{take}.mp4")
                    if a.phone:   # 1920x1080: the desktop frame at 1440x810, the phone beside it at the same height
                        vf = ["-filter_complex", "[0]scale=1440:810[d];[1]scale=374:810[p];[d][p]hstack=inputs=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x111417[v]", "-map", "[v]", "-map", "2:a"]
                        ins = ["-framerate", str(a.fps), "-i", os.path.join(frames, "f%05d.png"), "-framerate", str(a.fps), "-i", os.path.join(frames, "p%05d.png"), "-i", os.path.join(frames, "a.wav")]
                    else: vf, ins = [], ["-framerate", str(a.fps), "-i", os.path.join(frames, "f%05d.png"), "-i", os.path.join(frames, "a.wav")]
                    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, *vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", mp4], check=True)
                    sheet = mp4.replace(".mp4", "-contact.png")
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf", f"fps=1/{max(1, ct['total'] / 16):.2f},scale=480:-1,tile=4x4:padding=4:color=0x333333", "-frames:v", "1", sheet], check=True)
                    shutil.rmtree(frames, ignore_errors=True); made.append((mp4, sheet, ct))
                    print(json.dumps({"take": take, "mp4": mp4, **ct}, ensure_ascii=False, indent=1))
            finally:
                b.close()
    finally:
        srv.terminate(); shutil.rmtree(site, ignore_errors=True)


if __name__ == "__main__":
    main()
