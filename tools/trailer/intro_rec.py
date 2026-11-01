"""Record the genesis intro (demo/idle-intro.js) as MP4s with sound, plus a contact sheet, for comparing the two tones.

    python3 tools/trailer/intro_rec.py --out ~/Desktop/idle-trailers            # both tones
    python3 tools/trailer/intro_rec.py --tone epic --size 1920x1080

Frames come from window.__intro.render(tone, t, canvas) (deterministic, one per 1/30 s), the sound from
window.__intro.renderAudio(tone) (an OfflineAudioContext, the same synth the game plays live). Only the intro module is
loaded (a tiny page next to a copy of it), so nothing else of the game runs. Takes the shared browser lock.
"""
import argparse, base64, contextlib, functools, http.server, os, shutil, subprocess, sys, tempfile, threading, time

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
    ap.add_argument("--tone", choices=["eerie", "epic", "both"], default="both")
    ap.add_argument("--out", default=os.path.expanduser("~/Desktop/idle-trailers"))
    ap.add_argument("--size", default="1280x720"); ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args(); W, H = map(int, a.size.split("x")); os.makedirs(a.out, exist_ok=True)
    site = tempfile.mkdtemp(prefix="intro-site-"); shutil.copy(os.path.join(ROOT, "demo", "idle-intro.js"), site)
    open(os.path.join(site, "index.html"), "w").write(f'<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" width="{W}" height="{H}"></canvas><script src="idle-intro.js"></script>')
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=site))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); base = f"http://127.0.0.1:{srv.server_address[1]}/index.html?intro=0"
    from playwright.sync_api import sync_playwright
    tones = ["eerie", "epic"] if a.tone == "both" else [a.tone]
    with browser_lock(), sync_playwright() as p:
        b = p.chromium.launch()
        try:
            pg = b.new_page(viewport={"width": W, "height": H}); pg.goto(base); pg.wait_for_function("() => !!window.__intro")
            for tone in tones:
                tmp = tempfile.mkdtemp(prefix=f"intro-{tone}-"); total = sum(pg.evaluate("t => window.__intro.scenes(t)", tone)); n = int(total * a.fps)
                for i in range(n):
                    url = pg.evaluate("([t, s]) => { const c = document.getElementById('c'); window.__intro.render(t, s, c); return c.toDataURL('image/jpeg', .92); }", [tone, i / a.fps])
                    open(os.path.join(tmp, f"f{i:05d}.jpg"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
                wav = os.path.join(tmp, "a.wav"); open(wav, "wb").write(base64.b64decode(pg.evaluate("t => window.__intro.renderAudio(t)", tone)))
                mp4 = os.path.join(a.out, f"intro-{tone}.mp4")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", os.path.join(tmp, "f%05d.jpg"), "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                                "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4], check=True)
                sheet = os.path.join(a.out, f"intro-{tone}-contact.png")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf", f"fps=1/{max(1.0, total / 12):.2f},scale=480:-1,tile=4x3", "-frames:v", "1", sheet], check=True)
                shutil.rmtree(tmp, ignore_errors=True); print(f"{tone}: {mp4} ({total:.1f} s, {os.path.getsize(mp4) / 1e6:.1f} MB), {sheet}")
        finally:
            b.close(); srv.shutdown(); shutil.rmtree(site, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
