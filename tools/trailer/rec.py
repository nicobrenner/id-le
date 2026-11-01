"""Shared pieces for the Id|le trailers (tools/trailer/): record shots from the game with Chrome's screencast, capture the game's
own audio, render title cards, and assemble cuts with ffmpeg.

Everything is recorded from a fresh visit (?fresh=1&test), so the starter world is what shows: never a player's own world.
The ?test flag exposes window.__testCam (camera) the same way tools/test_smoke.py uses it.
"""
import asyncio, base64, json, os, subprocess, time
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_B = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
MONO = "/System/Library/Fonts/Menlo.ttc"

# everything that isn't the world itself (bars, panels, chat buttons, notices); shots that need a panel unhide it
CHROME = ("#topbar,#placesBar,#capPill,.grow,#minimap,#conn,#team,#insp,#notice,#roomchat,#rc-open,#sndWrap,#herd,#zoomer,#studio,"
          "#hwChip,#ntf,#ntfpanel,#lab-toggle,#mSheet,#top,#workshop,#sndHint,#whisper,#cline,#reelnote,#advnote,#mtip,#boot")


def sh(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


async def hide_chrome(pg, keep=""):
    sel = ",".join(s for s in CHROME.split(",") if s not in keep.split(","))
    await pg.evaluate("""s => { let el = document.getElementById('trailerHide'); if (!el) { el = document.createElement('style'); el.id = 'trailerHide'; document.head.appendChild(el); }
      el.textContent = s + '{visibility:hidden!important}'; }""", sel)


async def cam(pg, x, y, z):
    await pg.evaluate("o => window.__testCam.set(o)", {"x": x, "y": y, "z": z})


async def glide(pg, a, b, secs, steps=None):
    """move the camera from a=(x,y,z) to b over secs (eased), while a screencast runs"""
    n = steps or int(secs * 30)
    for i in range(n + 1):
        t = i / n; e = t * t * (3 - 2 * t)
        await cam(pg, *(a[k] + (b[k] - a[k]) * e for k in range(3)))
        await asyncio.sleep(secs / n)


async def follow(pg, js_target, z, secs, ease=0.12):
    """keep the camera on a moving target: js_target is a JS expression returning {x, y} (or null)"""
    t0 = time.time(); cur = None
    while time.time() - t0 < secs:
        p = await pg.evaluate(f"() => {{ const t = ({js_target}); return t ? {{ x: t.x, y: t.y }} : null; }}")
        if p:
            cur = p if cur is None else {"x": cur["x"] + (p["x"] - cur["x"]) * ease, "y": cur["y"] + (p["y"] - cur["y"]) * ease}
            await cam(pg, cur["x"], cur["y"], z)
        await asyncio.sleep(1 / 30)


class Shot:
    """Chrome DevTools screencast of one page: frames with timestamps, turned into a constant-30-fps clip"""
    def __init__(self, pg, name, outdir):
        self.pg, self.name, self.dir = pg, name, os.path.join(outdir, name); self.frames = []
        os.makedirs(self.dir, exist_ok=True)

    async def __aenter__(self):
        self.cdp = await self.pg.context.new_cdp_session(self.pg)
        async def on_frame(ev):
            self.frames.append((ev["metadata"]["timestamp"], ev["data"]))
            try: await self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
            except Exception: pass
        self.cdp.on("Page.screencastFrame", lambda ev: asyncio.ensure_future(on_frame(ev)))
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
        return self

    async def __aexit__(self, *a):
        try: await self.cdp.send("Page.stopScreencast")
        except Exception: pass
        await asyncio.sleep(0.2)
        self.write()

    def write(self):
        fr = sorted(self.frames)
        if len(fr) < 2: raise RuntimeError(f"shot {self.name}: no frames")
        lst = []
        for i, (ts, data) in enumerate(fr):
            p = os.path.join(self.dir, f"{i:05d}.jpg"); open(p, "wb").write(base64.b64decode(data))
            d = (fr[i + 1][0] - ts) if i + 1 < len(fr) else 1 / FPS
            lst.append(f"file '{p}'\nduration {max(d, 0.001):.4f}")
        lst.append(f"file '{os.path.join(self.dir, f'{len(fr) - 1:05d}.jpg')}'")
        open(os.path.join(self.dir, "list.txt"), "w").write("\n".join(lst))
        self.mp4 = os.path.join(self.dir, "..", self.name + ".mp4")
        sh("ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", os.path.join(self.dir, "list.txt"),
           "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},format=yuv420p",
           "-c:v", "libx264", "-preset", "medium", "-crf", "17", self.mp4)


async def record_audio(pg, secs, events=()):
    """capture the game's master output (window.__audio) for secs; events = [(t, js)] run at t seconds (e.g. a knock)"""
    await pg.evaluate("""() => { const a = window.__audio, ctx = a.ctx(), d = ctx.createMediaStreamDestination(); a.out().connect(d);
      window.__trRec = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 }); window.__trChunks = [];
      window.__trRec.ondataavailable = e => window.__trChunks.push(e.data); window.__trRec.start(1000); }""")
    t0 = time.time()
    for t, js in sorted(events):
        await asyncio.sleep(max(0, t - (time.time() - t0))); await pg.evaluate(js)
    await asyncio.sleep(max(0, secs - (time.time() - t0)))
    b64 = await pg.evaluate("""() => new Promise(r => { window.__trRec.onstop = async () => { const b = new Blob(window.__trChunks, { type: 'audio/webm' });
      const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }; window.__trRec.stop(); })""")
    return base64.b64decode(b64)


# ---------- cards ----------
def _font(path, size):
    return ImageFont.truetype(path, size)


def card_band(text, sub="", out=None, w=W, h=H):
    """a lower-third band (transparent PNG over the shot)"""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = _font(SERIF_B, 76); fs = _font(SERIF, 38)
    tw = d.textlength(text, font=f); sw = d.textlength(sub, font=fs) if sub else 0
    bh = 150 if sub else 120; y0 = h - bh - 70
    pad = 50; bw = max(tw, sw) + pad * 2; x0 = (w - bw) / 2
    band = Image.new("RGBA", (w, h), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
    bd.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=26, fill=(18, 10, 26, 200))
    im = Image.alpha_composite(im, band); d = ImageDraw.Draw(im)
    d.text(((w - tw) / 2, y0 + 18), text, font=f, fill=(255, 214, 160, 255))
    if sub: d.text(((w - sw) / 2, y0 + 102), sub, font=fs, fill=(230, 220, 240, 235))
    im.save(out); return out


def card_full(lines, out, w=W, h=H, bg=(14, 8, 22), logo=True):
    """a full-frame card: optional Id|le logo (the bar as a candle-orange stroke) and centred lines [(text, kind)]"""
    im = Image.new("RGB", (w, h), bg); d = ImageDraw.Draw(im)
    y = h * 0.30 if logo else h * 0.38
    if logo:
        f = _font(SERIF_B, 190); a, b = "Id", "le"; wa = d.textlength(a, font=f); wb = d.textlength(b, font=f); gap = 46
        x = (w - (wa + gap + wb)) / 2
        d.text((x, y - 120), a, font=f, fill=(250, 240, 230)); d.rectangle([x + wa + gap / 2 - 7, y - 95, x + wa + gap / 2 + 7, y + 95], fill=(255, 140, 40))
        d.text((x + wa + gap, y - 120), b, font=f, fill=(250, 240, 230)); y += 170
    for text, kind in lines:
        f = _font(MONO if kind == "mono" else SERIF, 60 if kind != "small" else 40)
        tw = d.textlength(text, font=f); d.text(((w - tw) / 2, y), text, font=f, fill=(255, 200, 140) if kind == "mono" else (235, 228, 245)); y += 92
    im.save(out); return out


def overlay(clip, png, out, start=0.15, fade=0.25):
    """burn a card PNG over a clip, fading in after start seconds"""
    sh("ffmpeg", "-y", "-v", "error", "-i", clip, "-loop", "1", "-i", png, "-filter_complex",
       f"[1:v]format=rgba,fade=t=in:st={start}:d={fade}:alpha=1[c];[0:v][c]overlay=0:0:shortest=1,format=yuv420p",
       "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-an", out)
    return out


def still(png, secs, out):
    sh("ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", png, "-t", str(secs), "-vf", f"fps={FPS},format=yuv420p",
       "-c:v", "libx264", "-crf", "17", out)
    return out


def trim(clip, start, dur, out):
    sh("ffmpeg", "-y", "-v", "error", "-ss", str(start), "-i", clip, "-t", str(dur), "-vf", f"fps={FPS},format=yuv420p",
       "-c:v", "libx264", "-crf", "17", "-an", out)
    return out


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def assemble(clips, audio, out, xf=0.3, music_vol=1.0):
    """chain clips with short crossfades, lay the audio under (trimmed, faded out), loudness about -16 LUFS"""
    inputs = []; [inputs.extend(["-i", c]) for c in clips]
    fc = []; last = "[0:v]"; t = dur(clips[0])
    for i in range(1, len(clips)):
        o = f"[v{i}]"; fc.append(f"{last}[{i}:v]xfade=transition=fade:duration={xf}:offset={t - xf:.3f}{o}"); last = o; t = t + dur(clips[i]) - xf
    total = t
    fc.append(f"{last}format=yuv420p[vout]")
    ai = len(clips)
    fc.append(f"[{ai}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume={music_vol},afade=t=in:st=0:d=0.6,afade=t=out:st={total - 2:.3f}:d=2,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
    sh("ffmpeg", "-y", "-v", "error", *inputs, "-i", audio, "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
       "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out)
    return out, total


def vertical(src, out, top_png=None):
    """9:16: the 16:9 cut in the middle over a blurred, enlarged copy of itself, optional card on top"""
    fc = ("[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=24:2,eq=brightness=-0.15[bg];"
          "[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2[v0]")
    args = ["ffmpeg", "-y", "-v", "error", "-i", src]
    if top_png:
        args += ["-loop", "1", "-i", top_png]; fc += ";[v0][1:v]overlay=0:0:shortest=1[v]"
    else:
        fc += ";[v0]null[v]"
    sh(*args, "-filter_complex", fc + ";[v]format=yuv420p[vout]", "-map", "[vout]", "-map", "0:a?", "-c:v", "libx264", "-preset", "slow",
       "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", out)
    return out


def contact(src, out, n=12):
    d = dur(src); step = max(d / n, 0.5)
    sh("ffmpeg", "-y", "-v", "error", "-i", src, "-vf", f"fps=1/{step:.3f},scale=480:-1,tile=4x3", "-frames:v", "1", out)
    return out
