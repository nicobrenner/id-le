"""Record the storyline from a keyframe (demo/idle-keys.js): builds the site, serves it locally, opens arena.html?story&at=<key>, presses a
key at the gate and records the page for --secs seconds (video only: the browser recorder has no sound). Takes the shared browser lock.

    python3 tools/trailer/keyrec.py --at dark --secs 40                 # → ~/Desktop/idle-trailers/key-dark.mp4
    python3 tools/trailer/keyrec.py --at end --secs 15 --phone          # 390x844
    python3 tools/trailer/keyrec.py --at logo --secs 10 --logo crt      # the story's logo A/B: force an arm (c3 | crt)
    python3 tools/trailer/keyrec.py --at logo --secs 12 --logo c3 --audio --sync   # with the page's own sound, and a sync check
    python3 tools/trailer/keyrec.py --list                              # the keyframes
--audio: the page's master output (window.__audio.storyOut(), everything the game plays) is recorded in the page with MediaRecorder from
the key press on; at that instant (on the keyframe's gate, before the key press) a small white square flashes in the top-left corner for 0.3 s, which ffmpeg finds in the video to place
the sound (±1 frame). --sync (logo keyframe): reports the crack's time in the sound against the frame where the pipe first shows.
"""
import argparse, base64, os, shutil, subprocess, sys, tempfile, time

# --audio: tap the master output into a MediaRecorder; a corner marker flashes at its start (the video's clock for the sound)
REC_START = """() => { const A = window.__audio, ctx = A.ctx(), d = ctx.createMediaStreamDestination(); A.storyOut().connect(d);
  const mt = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)), rec = new MediaRecorder(d.stream, mt ? { mimeType: mt } : {}), ch = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) ch.push(e.data); }; window.__keyrec = { rec, ch };
  const m = document.createElement('div'); m.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;background:#fff;z-index:2147483647;pointer-events:none';
  rec.start(); document.body.appendChild(m); setTimeout(() => m.remove(), 300); }"""
REC_STOP = """() => new Promise(res => { const R = window.__keyrec; R.rec.onstop = () => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(new Blob(R.ch, { type: R.rec.mimeType || 'audio/webm' })); }; R.rec.stop(); })"""


def frame_means(video, crop):
    """per frame: (time, mean luma) of a crop (w:h:x:y), via ffmpeg's signalstats"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-vf", f"crop={crop},signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], capture_output=True, text=True)
    out, t = [], None
    for ln in r.stderr.splitlines():
        if "pts_time:" in ln: t = float(ln.split("pts_time:")[1].split()[0])
        elif "YAVG=" in ln and t is not None: out.append((t, float(ln.split("YAVG=")[1])))
    return out


def marker_time(video):
    """the marker: the top-left square lit while the top-right corner is dark (a blank white page lights both)"""
    tr = dict(frame_means(video, "8:8:iw-9:1"))
    for t, y in frame_means(video, "8:8:1:1"):
        if y > 150 and tr.get(t, 255) < 40: return t
    raise SystemExit("keyrec: the sound's marker was not found in the video")


def sync_report(mp4, after=0.0):
    """the logo: the crack (the loudest sudden onset in the sound) against the frame the pipe comes down on (the lightning's flash)"""
    import wave, struct
    wav = mp4 + ".wav"; subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-ac", "1", "-ar", "8000", wav], check=True)
    w = wave.open(wav); n = w.getnframes(); x = struct.unpack(f"<{n}h", w.readframes(n)); w.close(); os.remove(wav)
    hop = 40; env = [max(abs(v) for v in x[i:i + hop]) for i in range(0, n - hop, hop)]   # 5 ms
    jumps = [(env[i] - max(env[max(0, i - 10):i] or [0]), i) for i in range(1, len(env))]
    jumps = [j for j in jumps if j[1] * hop / 8000 > after]; crack = max(jumps)[1] * hop / 8000
    # the picture: the | key comes down as the lightning, so the pipe's drop is the frame whose brightness jumps the most (the bolt's flash)
    fm = [f for f in frame_means(mp4, "iw:ih:0:0") if f[0] > after + 0.2]; pipe = max(((fm[i][1] - fm[i - 1][1], fm[i][0]) for i in range(1, len(fm))), default=(0, None))[1]
    return f"sync: the crack at {crack:.3f} s, the pipe's drop (the flash) at {pipe if pipe is None else round(pipe, 3)} s → {'?' if pipe is None else f'{(pipe - crack) * 1000:+.0f} ms'}"

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCK = "/private/tmp/claude-501/idle-browser.lock"
KEYS = ["title", "computer", "labchat", "boot", "run", "crash", "logo", "dark", "operator", "lights", "words", "life", "epoch0done", "epoch1", "end"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--at", choices=KEYS); ap.add_argument("--secs", type=float, default=30); ap.add_argument("--phone", action="store_true")
    ap.add_argument("--out", default=""); ap.add_argument("--port", type=int, default=8839); ap.add_argument("--list", action="store_true"); ap.add_argument("--logo", choices=["c3", "crt"]); ap.add_argument("--audio", action="store_true"); ap.add_argument("--sync", action="store_true")
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
            if a.at != "title": pg.wait_for_selector("#keyGate", timeout=60000)
            if a.audio: pg.evaluate(REC_START); pg.wait_for_timeout(600)   # on the idle gate page, so the marker is painted at once
            if a.at != "title": pg.keyboard.press("k")
            pg.wait_for_timeout(int(a.secs * 1000))
            aud = pg.evaluate(REC_STOP) if a.audio else None
            ctx.close(); b.close()
        webm = next(os.path.join(vd, f) for f in os.listdir(vd) if f.endswith(".webm"))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if aud:
            awebm = os.path.join(vd, "sound.webm"); open(awebm, "wb").write(base64.b64decode(aud))
            t0 = marker_time(webm); print(f"sound placed at {t0:.3f} s (the marker's first frame)")
            vd_ = subprocess.run(["ffmpeg", "-hide_banner", "-i", awebm, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
            peak = float(vd_.split("max_volume:")[1].split("dB")[0]) if "max_volume:" in vd_ else -1.0; gain = max(0.0, -1.0 - peak)   # the clip's peak at -1 dBFS (the game's own levels are untouched)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", webm, "-i", awebm, "-map", "0:v", "-map", "1:a", "-af", f"adelay={round(t0 * 1000)}:all=1,volume={gain:.1f}dB", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out if out.endswith(".mp4") else os.path.splitext(out)[0] + ".mp4"], check=True)
            out = out if out.endswith(".mp4") else os.path.splitext(out)[0] + ".mp4"
            if a.sync: print(sync_report(out, t0))
        elif out.endswith(".mp4") and shutil.which("ffmpeg"):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
        else:
            out = os.path.splitext(out)[0] + ".webm"; shutil.copy(webm, out)
        print("wrote", out)
    finally:
        with __import__("contextlib").suppress(OSError): os.rmdir(LOCK)
        srv.terminate(); shutil.rmtree(vd, ignore_errors=True); shutil.rmtree(site, ignore_errors=True)


if __name__ == "__main__":
    main()
