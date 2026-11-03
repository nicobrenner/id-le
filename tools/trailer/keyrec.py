"""Record the storyline from a keyframe (demo/idle-keys.js): builds the site, serves it locally, opens arena.html?story&at=<key>, presses a
key at the gate and records the page for --secs seconds (video only: the browser recorder has no sound). Takes the shared browser lock.

    python3 tools/trailer/keyrec.py --at dark --secs 40                 # → ~/Desktop/idle-trailers/key-dark.mp4
    python3 tools/trailer/keyrec.py --at end --secs 15 --phone          # 390x844
    python3 tools/trailer/keyrec.py --at logo --secs 10 --logo crt      # the story's logo A/B: force an arm (c3 | crt)
    python3 tools/trailer/keyrec.py --list                              # the keyframes
"""
import argparse, os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCK = "/private/tmp/claude-501/idle-browser.lock"
KEYS = ["title", "computer", "labchat", "boot", "run", "crash", "logo", "dark", "operator", "lights", "words", "life", "epoch0done", "epoch1", "end"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--at", choices=KEYS); ap.add_argument("--secs", type=float, default=30); ap.add_argument("--phone", action="store_true")
    ap.add_argument("--out", default=""); ap.add_argument("--port", type=int, default=8839); ap.add_argument("--list", action="store_true"); ap.add_argument("--logo", choices=["c3", "crt"])
    a = ap.parse_args()
    if a.list or not a.at:
        print("keyframes:", " ".join(KEYS)); return
    out = a.out or os.path.expanduser(f"~/Desktop/idle-trailers/key-{a.at}{'-phone' if a.phone else ''}.mp4")
    site = tempfile.mkdtemp(prefix="keyrec-"); shutil.rmtree(site)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_static.py"), "--out", site], check=True, stdout=subprocess.DEVNULL)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(a.port), "-d", site], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    while True:
        try: os.mkdir(LOCK); break
        except FileExistsError: print("waiting for the browser lock…"); time.sleep(10)
    vd = tempfile.mkdtemp(prefix="keyrec-vid-")
    try:
        from playwright.sync_api import sync_playwright
        vp = {"width": 390, "height": 844} if a.phone else {"width": 1280, "height": 720}
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            ctx = b.new_context(viewport=vp, record_video_dir=vd, record_video_size=vp, is_mobile=a.phone, has_touch=a.phone)
            pg = ctx.new_page(); pg.goto(f"http://localhost:{a.port}/arena.html?story&at={a.at}" + (f"&logo={a.logo}" if a.logo else ""))
            if a.at != "title":
                pg.wait_for_selector("#keyGate", timeout=60000); pg.keyboard.press("k")
            pg.wait_for_timeout(int(a.secs * 1000)); ctx.close(); b.close()
        webm = next(os.path.join(vd, f) for f in os.listdir(vd) if f.endswith(".webm"))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if out.endswith(".mp4") and shutil.which("ffmpeg"):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
        else:
            out = os.path.splitext(out)[0] + ".webm"; shutil.copy(webm, out)
        print("wrote", out)
    finally:
        with __import__("contextlib").suppress(OSError): os.rmdir(LOCK)
        srv.terminate(); shutil.rmtree(vd, ignore_errors=True); shutil.rmtree(site, ignore_errors=True)


if __name__ == "__main__":
    main()
