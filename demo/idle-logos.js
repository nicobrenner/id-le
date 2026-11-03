// (copied from the logo lab, ~/Desktop/idle-trailers/logo, for ⭐ reviews: idle-reviews.js loads it only when a logo review opens)
// Id|le logos (proposals, rounds 1–3): window.IdleLogos.list = [{ id, name, idea, duration, prepare(), build(ctx, canvas, t0, opts) }]
// opts: { font, destination, dust: 'settle' | 'gust' }. All sound synthesized and seeded (every play identical); the picture is drawn from the audio clock
// and the sound's own envelope and waveform. Round 3 picks to try first: c3-typed-dust, a3-dust, b3a-dust-crt.
(() => {
// Id|le logo · round 1 — every variant's sound is rendered once (OfflineAudioContext, seeded noise), then played back as that same buffer;
// the picture is a pure function of the audio clock time t (and of the rendered sound's own envelope / waveform), so what you see is what you hear.
const SR = 44100, RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ease = u => u * u * (3 - 2 * u), easeIn = u => u * u, easeOut = u => 1 - (1 - u) * (1 - u);
const rngOf = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const INK = '#e9e4d8', MAG = '#e0367a', RED = '#e03a3e';
const RAINBOW = ['#61bb46', '#fdb827', '#f5821f', '#e03a3e', '#963d97', '#009ddc'];   // green, yellow, orange, red, purple, blue (the game's)
const mixHex = (a, b, u) => { const p = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * u)).join(',')})`; };
const pipeColour = t => { const c = ((t * 0.9) % 6 + 6) % 6, i = Math.floor(c); return mixHex(RAINBOW[i], RAINBOW[(i + 1) % 6], ease(c - i)); };
// a colour walk of n steps through the rainbow that lands on red on the last step
const toRed = n => Array.from({ length: n }, (_, k) => RAINBOW[((3 - (n - 1 - k)) % 6 + 6) % 6]);

// ---------------- sound ----------------
function noiseBuf(ctx, sec, seed) { const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rngOf(seed); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; return b; }
function tone(ctx, out, type, f, at, dur, vol, f2) { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
  v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(vol, at + Math.min(.005, dur / 4)); v.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(v); v.connect(out); o.start(at); o.stop(at + dur + .05); }
// the game's logo thunder (idle-epoch0.js thunderBuf, v11: peak 0.9), with seeded noise
function thunder(ctx, out, at, v = 1, seed = 7) { const n = Math.floor(ctx.sampleRate * 2.2), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rngOf(seed); let last = 0, pk = 0;
  for (let i = 0; i < n; i++) { last = last * 0.985 + (r() * 2 - 1) * 0.06; d[i] = last * Math.pow(1 - i / n, 1.6) * (i < 600 ? 3 : 1); pk = Math.max(pk, Math.abs(d[i])); }
  if (pk > 1) for (let i = 0; i < n; i++) d[i] /= pk;
  const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = 0.9 * v; s.connect(g); g.connect(out); s.start(at); }
// the game's purr, variant 4 (idle-boot.js purrNoise: b2's brr, a rattle, the hiss), seeded; returns its marks. opts.hiss=false leaves the hiss out
function purr(ctx, out, at, opts = {}) { const r = rngOf(opts.seed || 11), B = 1.4, NZ = noiseBuf(ctx, 2, 5);
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), modG = ctx.createGain(), am = ctx.createOscillator(), amG = ctx.createGain(), body = ctx.createGain(), lp = ctx.createBiquadFilter(), env = ctx.createGain();
  car.type = 'sawtooth'; car.frequency.setValueAtTime(58, at); car.frequency.linearRampToValueAtTime(70, at + B); mod.frequency.value = 87; modG.gain.setValueAtTime(18, at); modG.gain.linearRampToValueAtTime(35, at + B); mod.connect(modG); modG.connect(car.frequency);
  am.frequency.setValueAtTime(26, at); am.frequency.linearRampToValueAtTime(16, at + B); amG.gain.value = 0.5; am.connect(amG); amG.connect(body.gain); body.gain.setValueAtTime(0.5, at);
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(220, at); lp.frequency.linearRampToValueAtTime(1400, at + B * 0.8);
  env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(0.16, at + 0.2); env.gain.setValueAtTime(0.16, at + B - 0.25); env.gain.exponentialRampToValueAtTime(0.0001, at + B + 0.1);
  car.connect(body); body.connect(lp); lp.connect(env); env.connect(out); for (const o of [car, mod, am]) { o.start(at); o.stop(at + B + 0.15); }
  const clicks = []; let t = at + B - 0.15;
  for (let k = 0; k < 9; k++) { const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = NZ; bp.type = 'bandpass'; bp.frequency.value = 1500 + k * 220; bp.Q.value = 3;
    v.gain.setValueAtTime(0.14 * (1 - k / 12), t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.035); s.connect(bp); bp.connect(v); v.connect(out); s.start(t, r() * 0.5); s.stop(t + 0.05); clicks.push(t); t += 0.045 + k * 0.009; }
  const h0 = t - 0.1, h1 = t + 0.9;
  if (opts.hiss !== false) { const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = NZ; s.loop = true; hp.type = 'highpass'; hp.frequency.setValueAtTime(2500, h0); hp.frequency.exponentialRampToValueAtTime(7000, h1);
    v.gain.setValueAtTime(0.0001, h0); v.gain.linearRampToValueAtTime(0.09, t + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, h1); s.connect(hp); hp.connect(v); v.connect(out); s.start(h0); s.stop(h1 + 0.05); }
  return { b0: at, b1: at + B, clicks, h0, h1, end: opts.hiss === false ? t : h1 }; }
const kick = (ctx, out, at, v = 1) => { tone(ctx, out, 'sine', 130, at, 0.22, 0.32 * v, 42); tone(ctx, out, 'triangle', 900, at, 0.012, 0.05 * v, 300); };
const thump = (ctx, out, at, v = 1) => { tone(ctx, out, 'sine', 72, at, 0.16, 0.42 * v, 38); tone(ctx, out, 'sine', 150, at, 0.05, 0.08 * v, 60); };
function key(ctx, out, at, v = 1, seed = 3) { const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf(ctx, 0.05, seed); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.6;
  g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.32 * v, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03); s.connect(bp); bp.connect(g); g.connect(out); s.start(at); tone(ctx, out, 'square', 190, at, 0.018, 0.035 * v); }
const cutTick = (ctx, out, at) => { tone(ctx, out, 'square', 2400, at, 0.035, 0.09, 600); tone(ctx, out, 'sine', 180, at, 0.12, 0.08, 60); };

// ---------------- picture helpers ----------------
let BIG = 0;   // the host's letter size (the intro draws at its own scale: drawAt(..., { big })); 0 = the card's own
function lay(g, W, H, font) { const big = BIG || Math.min(H * 0.5, W * 0.2); g.font = `${big}px ${font}`; g.textBaseline = 'alphabetic';
  return { big, wId: g.measureText('Id').width, wle: g.measureText('le').width, base: H * 0.5 + big * 0.32, cx: W / 2, font }; }
function word(g, L, gap, o = {}) { const xA = L.cx - gap / 2 - L.wId + (o.dx || 0), xB = L.cx + gap / 2 + (o.dx || 0), y = L.base + (o.dy || 0);
  g.font = `${L.big}px ${L.font}`; g.textBaseline = 'alphabetic'; g.globalAlpha = o.a ?? 1; g.fillStyle = o.col || INK;
  if (o.only !== 'le') g.fillText(o.textA ?? 'Id', xA, y); if (o.only !== 'Id') g.fillText(o.textB ?? 'le', xB, y); g.globalAlpha = 1; }
const pipeBox = (L, h = 1) => { const bw = L.big * 0.07, bh = L.big * 0.98 * h; return { x: L.cx - bw / 2, y: L.base - L.big * 0.85 - (bh - L.big * 0.98) / 2, w: bw, h: bh }; };
function pipe(g, L, col, o = {}) { const b = pipeBox(L, o.h ?? 1); g.globalAlpha = o.a ?? 1; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = o.glow ?? 10; g.fillRect(b.x + (o.dx || 0), o.y ?? b.y, b.w * (o.w ?? 1), b.h); g.shadowBlur = 0; g.globalAlpha = 1; }
function bolt(g, L, W, H, a, seed = 3) { if (a <= 0) return; const r = rngOf(seed); let x = L.cx + (r() - .5) * 40, y = 0; const yEnd = L.base - L.big * 0.85;
  g.strokeStyle = `rgba(235,240,255,${a})`; g.lineWidth = 2.2; g.shadowColor = '#cfe0ff'; g.shadowBlur = 16; g.beginPath(); g.moveTo(x, y);
  while (y < yEnd) { y += 8 + r() * 14; x += (r() - .5) * 22 + (L.cx - x) * 0.12; g.lineTo(x, Math.min(y, yEnd)); } g.stroke(); g.shadowBlur = 0; }
const flash = (g, W, H, a) => { if (a <= 0 || RM) return; g.globalAlpha = a; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
// letters shredding into static: horizontal slices slip sideways and fade while noise pixels take their place (amount s 0..1)
function shred(g, W, H, L, gap, s, seed, col) { if (s <= 0) return word(g, L, gap, { col });
  const oc = shred.c || (shred.c = document.createElement('canvas')); oc.width = W; oc.height = H; const o = oc.getContext('2d'); o.clearRect(0, 0, W, H); word(o, L, gap, { col });
  const r = rngOf(seed), top = L.base - L.big, bot = L.base + L.big * 0.25, sh = 3;
  for (let y = top; y < bot; y += sh) { const off = RM ? 0 : (r() - .5) * s * L.big * 0.6; g.globalAlpha = clamp(1 - s * (0.6 + r() * 0.6)); g.drawImage(oc, 0, y, W, sh, off, y, W, sh); }
  g.globalAlpha = 1; const n = Math.floor(s * (1 - s * 0.5) * 900), x0 = L.cx - gap / 2 - L.wId - 10, x1 = L.cx + gap / 2 + L.wle + 10;
  for (let i = 0; i < n; i++) { const v = 120 + r() * 135 | 0; g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.5})`; g.fillRect(x0 + r() * (x1 - x0), top + r() * (bot - top), 2, 2); } }
let CHECK = false; const jit = (t, amt, k = 1) => { if (RM || CHECK || amt <= 0) return 0; const r = rngOf(Math.floor(t * 60) * 7 + k); return (r() - .5) * 2 * amt; };
const pulse = (t, at, tau = 0.09) => t >= at ? Math.exp(-(t - at) / tau) : 0;
const lastIdx = (t, arr) => { let k = -1; for (let i = 0; i < arr.length; i++) if (t >= arr[i]) k = i; return k; };
// the standard opening: Idle fades in, the pipe falls (ease-in, so it hits at full speed exactly at the crack), the letters part
const OPEN = { fade: 0.35, drop: 0.5, crack: 0.9 };
function opening(g, W, H, L, t, crack, col = MAG) {
  const gap = t < crack ? 0 : (RM ? L.big * .32 : L.big * .32 * easeOut(clamp((t - crack) / 0.22)));
  return { gap, a: clamp(t / OPEN.fade), fallY: (() => { const b = pipeBox(L); const u = clamp((t - (crack - 0.4)) / 0.4); return -L.big + (b.y + L.big) * easeIn(u); })(), falling: t < crack && t > crack - 0.4 };
}


// ---------------- the variants ----------------
const V = [];
// round 1, kept as references (Nico: crt-off 'the most polished', strike-purr-static 'almost perfect')
// 1. Strike → purr → static: every visual beat is an audible one
V.push({ ref: 1, id: 'strike-purr-static', name: 'Strike · purr · static (round 1)', idea: 'The pipe hits on the crack, glows with the thunder’s ring, shakes with the brrr, steps through the rainbow one rattle click at a time and lands on red, then the letters shred into static with the tsss.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8);
    return { dur: P.h1 + 0.5, M: { c, P, cols: toRed(P.clicks.length) }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, { t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: P.h0, k: 'tsss' }, { t: P.h1, k: 'black', vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, P, cols } = S.M; if (t >= P.h1) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    const brr = t >= P.b0 && t < P.b1 + 0.1 ? S.envIn(t, P.b0, P.b1) : 0, ring = t >= c && t < P.b0 ? S.envIn(t, c + 0.05, P.b0) : 0, dx = jit(t, brr * L.big * 0.035);
    const hs = t >= P.h0 ? clamp((t - P.h0) / (P.h1 - P.h0)) : 0;
    if (hs > 0) shred(g, W, H, L, O.gap, Math.pow(hs, 0.7), CHECK ? 1 : Math.floor(t * 60)); else word(g, L, O.gap, { a: O.a, dx: jit(t, brr * L.big * 0.02, 2) });
    const k = lastIdx(t, P.clicks), col = k >= 0 ? cols[k] : MAG;
    if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); else if (t >= c) pipe(g, L, col, { glow: 8 + 34 * Math.max(ring, brr * 0.7) + 20 * (k >= 0 ? pulse(t, P.clicks[k], 0.05) : 0), dx, h: 1 + 0.06 * brr });
    bolt(g, L, W, H, t >= c && t < c + 0.12 ? 1 - (t - c) / 0.12 : 0); if (t >= c && t < c + 0.1) flash(g, W, H, 0.3 * (1 - (t - c) / 0.1)); } });

// 4. CRT power-off: the hiss becomes a tube switching off
V.push({ ref: 1, id: 'crt-off', name: 'CRT power-off (round 1)', idea: 'Strike and purr as in “Strike · purr · static”, but instead of the hiss the screen switches off like an old tube: a falling whine squeezes it to a line, then to a red dot on the pop, and the dot fades with the last hiss.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8, { hiss: false }), w0 = P.end + 0.05, pop = w0 + 0.32;
    tone(ctx, out, 'sine', 9000, w0, 0.32, 0.05, 220); tone(ctx, out, 'sine', 70, pop, 0.12, 0.35, 40); tone(ctx, out, 'square', 1800, pop, 0.012, 0.05, 900);
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noiseBuf(ctx, 1, 9); hp.type = 'highpass'; hp.frequency.value = 4000; v.gain.setValueAtTime(0.05, pop); v.gain.exponentialRampToValueAtTime(0.0001, pop + 0.7); s.connect(hp); hp.connect(v); v.connect(out); s.start(pop);
    return { dur: pop + 1.0, M: { c, P, w0, pop, cols: toRed(P.clicks.length) }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, { t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: w0, k: 'whine ↓', vis: 1 }, { t: pop, k: 'pop → dot', on: 1, vis: 1 }, { t: pop + 0.7, k: 'black' }] }; },
  draw(g, W, H, t, S) { const { c, P, w0, pop, cols } = S.M; if (t >= pop + 0.7) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t >= pop) { const a = 1 - (t - pop) / 0.7; g.fillStyle = RED; g.shadowColor = RED; g.shadowBlur = 22 * a; g.globalAlpha = a; g.beginPath(); g.arc(W / 2, H / 2, 4 + 3 * pulse(t, pop, 0.06), 0, 7); g.fill(); g.globalAlpha = 1; g.shadowBlur = 0; return; }
    const sq = t >= w0 ? clamp((t - w0) / (pop - w0)) : 0, sy = sq < 0.6 ? 1 - 0.994 * easeIn(sq / 0.6) : 0.006, sx = sq < 0.6 ? 1 : 1 - 0.99 * easeIn((sq - 0.6) / 0.4);
    g.save(); g.translate(W / 2, H / 2); g.scale(RM ? 1 : sx, RM ? 1 : sy); g.translate(-W / 2, -H / 2); if (sq > 0) { g.globalAlpha = 0.5 * sq; g.fillStyle = '#cfd8ff'; g.fillRect(0, H / 2 - 40, W, 80); g.globalAlpha = 1; }
    const brr = t >= P.b0 && t < P.b1 + 0.1 ? S.envIn(t, P.b0, P.b1) : 0, ring = t >= c && t < P.b0 ? S.envIn(t, c + 0.05, P.b0) : 0, k = lastIdx(t, P.clicks);
    word(g, L, O.gap, { a: O.a, dx: jit(t, brr * L.big * 0.02, 2) }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); else if (t >= c) pipe(g, L, k >= 0 ? cols[k] : MAG, { glow: 8 + 34 * Math.max(ring, brr * .7), dx: jit(t, brr * L.big * 0.035), h: 1 + 0.06 * brr });
    bolt(g, L, W, H, t >= c && t < c + 0.12 ? 1 - (t - c) / 0.12 : 0); g.restore(); if (t >= c && t < c + 0.1) flash(g, W, H, 0.3 * (1 - (t - c) / 0.1)); } });


// ---------------- round 2: shared pieces ----------------
// the radial dissolve (Nico: "the diffusion effect… feels a bit like a box… fade into a circle-shaped edge / in all directions"):
// a circular front closes in on the | (or, out: true, opens from it); past the front the letters break into grains that drift
// outward and thin into static with a soft round falloff. The letters' grains are read once per layout and cached.
const RAD = { key: '', grains: [], oc: null, m: null };
function grainsFor(W, H, L, gap) { const key = [W, H, L.big, L.font, Math.round(gap)].join('|'); if (RAD.key === key) return RAD;
  const oc = RAD.oc || (RAD.oc = document.createElement('canvas')); oc.width = W; oc.height = H; const o = oc.getContext('2d'); o.clearRect(0, 0, W, H); word(o, L, gap);
  const d = o.getImageData(0, 0, W, H).data, gs = [], st = 3, r = rngOf(17); for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) if (d[(y * W + x) * 4 + 3] > 120) gs.push({ x, y, k: r(), a: r() * 6.283 });
  RAD.key = key; RAD.grains = gs; return RAD; }
function radial(g, W, H, L, gap, s, t, o = {}) { if (s <= 0) return word(g, L, gap);
  const R0 = grainsFor(W, H, L, gap), cx = L.cx, cy = L.base - L.big * 0.36, Rmax = gap / 2 + Math.max(L.wId, L.wle) + L.big * 0.15, soft = L.big * 0.45;
  const R = o.out ? Rmax * easeOut(s) * 1.15 : Rmax * (1 - easeIn(s)) - soft * s;   // the front: in → closes on the pipe; out → opens from it
  // the intact part, masked by a soft circle (no edges anywhere)
  const m = R0.m || (R0.m = document.createElement('canvas')); m.width = W; m.height = H; const mg = m.getContext('2d'); mg.drawImage(R0.oc, 0, 0); mg.globalCompositeOperation = 'destination-in';
  const rg = mg.createRadialGradient(cx, cy, Math.max(0, o.out ? R : R - soft), cx, cy, Math.max(1, o.out ? R + soft : R)); rg.addColorStop(0, o.out ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)'); rg.addColorStop(1, o.out ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
  mg.fillStyle = rg; mg.fillRect(0, 0, W, H); mg.globalCompositeOperation = 'source-over'; g.drawImage(m, 0, 0);
  // the grains past the front: pushed outward (in all directions), shimmering, thinning with distance
  const fr = Math.floor(t * 60);
  for (const p of R0.grains) { const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1, past = o.out ? R - d : d - (R - soft * 0.5); if (past <= 0) continue;
    const u = clamp(past / (soft * 2.2)); if (u >= 1) continue; const push = RM ? 0 : u * L.big * (0.35 + 0.5 * p.k), sh = RM ? 0 : Math.sin(fr * 1.7 + p.k * 40) * 1.5 * u;
    const x = p.x + dx / d * push + Math.cos(p.a) * sh, y = p.y + dy / d * push + Math.sin(p.a) * sh, v = 150 + (p.k * 105 | 0);
    g.globalAlpha = (1 - u) * clamp((1 - s) * 3) * (0.35 + 0.65 * ((p.k * 7 + fr * 0.37) % 1)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2); }
  g.globalAlpha = 1; }
// the pipe as a scope trace of what you hear (k: 0 = a solid bar, 1 = the full trace)
function scopePipe(g, L, t, S, col, k, glow = 12) { const b = pipeBox(L); if (k <= 0.01 || RM) return pipe(g, L, col, { glow });
  const N = 140, win = 0.03, w = S.wave(t - win, win, N), amp = L.big * 0.55 * k; g.strokeStyle = col; g.lineWidth = Math.max(2, b.w * 0.6); g.lineJoin = 'round'; g.shadowColor = col; g.shadowBlur = glow; g.beginPath();
  for (let i = 0; i < N; i++) { const y = b.y + b.h * i / (N - 1), x = L.cx + clamp(w[i] * amp / 0.6, -L.big * .3, L.big * .3); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.shadowBlur = 0;
  if (k < 1) pipe(g, L, col, { a: 1 - k, glow: 0 }); }
// a smoother meter: ballistic level (fast attack, slow release) and a peak light that holds, then falls
function ballistic(S, t, att = 0.55, rel = 0.035) { let v = 0; for (let k = 120; k >= 0; k--) { const tt = t - k * 0.005; if (tt < 0) continue; const x = S.level(tt); v += (x > v ? att : rel) * (x - v); } return v; }
function meterPipe(g, L, t, S, k, pkCol) { const b = pipeBox(L), N = 16, segH = b.h / N, lv = ballistic(S, t); let pk = 0; for (let j = 0; j <= 30; j++) { const tt = t - j * 0.02; if (tt >= 0) pk = Math.max(pk, ballistic(S, tt) - Math.max(0, j - 15) * 0.012); }
  const col = i => i >= N - 2 ? RED : i >= N - 5 ? RAINBOW[2] : i >= N - 9 ? RAINBOW[1] : RAINBOW[0];
  for (let i = 0; i < N; i++) { const lo = i / N, on = clamp((lv - lo) * N), isPk = i === Math.min(N - 1, Math.max(0, Math.round(pk * N) - 1)), y = b.y + b.h - (i + 1) * segH;
    const a = (1 - k) * 1 + k * Math.max(0.1, on, isPk ? 0.95 : 0), c = k < 0.5 ? MAG : isPk && pkCol ? pkCol : col(i);
    g.globalAlpha = a; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 4 + 10 * Math.max(on, isPk ? 1 : 0); g.fillRect(b.x - b.w * 0.25 * k, y + 1.2 * k, b.w * (1 + 0.5 * k), segH - 2.4 * k); }
  g.globalAlpha = 1; g.shadowBlur = 0; }
// the shared body after the crack (A): the ring's glow, the brrr as a live trace, a rainbow step per rattle click that lands on red, the radial tsss
function bodyA(g, W, H, L, t, S, M, gap, o = {}) { const { c, P, cols } = M, hs = t >= P.h0 ? clamp((t - P.h0) / (P.h1 - P.h0)) : 0;
  const ring = t >= c && t < P.b0 ? S.envIn(t, c + 0.05, P.b0) : 0, brr = t >= P.b0 && t < P.b1 + 0.1 ? S.envIn(t, P.b0, P.b1) : 0;
  if (hs > 0) radial(g, W, H, L, gap, Math.pow(hs, 0.8), t, { out: o.out }); else word(g, L, gap, { dx: jit(t, brr * L.big * 0.015, 2), a: o.a ?? 1 });
  const ki = lastIdx(t, P.clicks), col = ki >= 0 ? cols[ki] : MAG, kp = ki >= 0 ? pulse(t, P.clicks[ki], 0.05) : 0;
  const k = t < P.b0 ? 0 : t < P.b0 + 0.08 ? (t - P.b0) / 0.08 : hs > 0 ? Math.pow(1 - hs, 1.4) : 1;   // the trace takes over on the brrr and calms into a straight red line with the tsss
  if (o.meter && t >= P.b0 && t < P.h0 + 0.2) meterPipe(g, L, t, S, t < P.b0 + 0.12 ? (t - P.b0) / 0.12 : t > P.h0 ? 1 - (t - P.h0) / 0.2 : 1, ki >= 0 ? col : null);
  else scopePipe(g, L, t, S, col, k, 8 + 34 * ring + 22 * kp + 14 * brr); }
const flashBolt = (g, W, H, L, t, c) => { bolt(g, L, W, H, t >= c && t < c + 0.12 ? 1 - (t - c) / 0.12 : 0); if (t >= c && t < c + 0.1) flash(g, W, H, 0.3 * (1 - (t - c) / 0.1)); };
const evA = P => [{ t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: P.h0, k: 'tsss' }];

// ---------------- round 2: the cross-breeds ----------------
// A. strike-purr-static × oscilloscope
V.push({ id: 'scope-strike', name: 'A · Strike × scope', idea: 'Strike · purr · static with the oscilloscope inside it: the pipe becomes the live trace of the brrr, takes a rainbow step per rattle click and lands on red, then the letters dissolve in a circle closing in on the | (no box). Last frame: the red | alone.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8), end = P.h1 + 0.45;
    return { dur: end + 0.35, M: { c, P, cols: toRed(P.clicks.length), end }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, ...evA(P), { t: P.h1, k: '| alone' }, { t: end, k: 'black', vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, end } = S.M; if (t >= end) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    bodyA(g, W, H, L, t, S, S.M, O.gap); flashBolt(g, W, H, L, t, c); } });

// B. A, ending with crt-off's polish
V.push({ id: 'scope-crt', name: 'B · Scope × CRT off', idea: 'A, but the circular static doesn’t finish on its own: as it closes on the pipe, the falling whine squeezes what is left into the CRT line, the pop shrinks it to a red dot, and the dot fades.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8, { hiss: false }), h0 = P.end - 0.1, h1 = P.end + 0.42, w0 = h1 - 0.02, pop = w0 + 0.32;
    { const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noiseBuf(ctx, 1, 5); hp.type = 'highpass'; hp.frequency.setValueAtTime(2500, h0); hp.frequency.exponentialRampToValueAtTime(6000, h1);
      v.gain.setValueAtTime(0.0001, h0); v.gain.linearRampToValueAtTime(0.085, h0 + 0.12); v.gain.exponentialRampToValueAtTime(0.0001, h1 + 0.05); s.connect(hp); hp.connect(v); v.connect(out); s.start(h0); s.stop(h1 + 0.1); }
    tone(ctx, out, 'sine', 9000, w0, 0.32, 0.05, 220); tone(ctx, out, 'sine', 70, pop, 0.12, 0.35, 40); tone(ctx, out, 'square', 1800, pop, 0.012, 0.05, 900);
    { const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noiseBuf(ctx, 1, 9); hp.type = 'highpass'; hp.frequency.value = 4000; v.gain.setValueAtTime(0.05, pop); v.gain.exponentialRampToValueAtTime(0.0001, pop + 0.7); s.connect(hp); hp.connect(v); v.connect(out); s.start(pop); }
    const Pm = { ...P, h0, h1 }; return { dur: pop + 1.0, M: { c, P: Pm, w0, pop, cols: toRed(P.clicks.length) }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, ...evA(Pm), { t: w0, k: 'whine ↓', vis: 1 }, { t: pop, k: 'pop → dot', on: 1, vis: 1 }, { t: pop + 0.7, k: 'black' }] }; },
  draw(g, W, H, t, S) { const { c, w0, pop } = S.M; if (t >= pop + 0.7) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t >= pop) { const a = 1 - (t - pop) / 0.7; g.fillStyle = RED; g.shadowColor = RED; g.shadowBlur = 22 * a; g.globalAlpha = a; g.beginPath(); g.arc(W / 2, H / 2, 4 + 3 * pulse(t, pop, 0.06), 0, 7); g.fill(); g.globalAlpha = 1; g.shadowBlur = 0; return; }
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    const sq = t >= w0 ? clamp((t - w0) / (pop - w0)) : 0, sy = sq < 0.6 ? 1 - 0.994 * easeIn(sq / 0.6) : 0.006, sx = sq < 0.6 ? 1 : 1 - 0.99 * easeIn((sq - 0.6) / 0.4);
    g.save(); g.translate(W / 2, H / 2); g.scale(RM ? 1 : sx, RM ? 1 : sy); g.translate(-W / 2, -H / 2); if (sq > 0) { g.globalAlpha = 0.5 * sq; g.fillStyle = '#cfd8ff'; g.fillRect(0, H / 2 - 40, W, 80); g.globalAlpha = 1; }
    bodyA(g, W, H, L, Math.min(t, S.M.P.h1 - 0.001), S, S.M, O.gap); g.restore(); flashBolt(g, W, H, L, t, c); } });

// C. typed reveal into A
V.push({ id: 'typed-scope', name: 'C · Typed × scope', idea: 'Idle is typed key by key, the cursor changing colour with every keystroke; it steps back twice, the | key comes down as the lightning, and from there it is A: the live trace, a colour per rattle click, the circular dissolve, the red | alone.',
  build(ctx, out) { const ks = [0.32, 0.5, 0.64, 0.86], ar = [1.22, 1.38], c = 1.9; ks.forEach((t, i) => key(ctx, out, t, 1, 20 + i)); ar.forEach((t, i) => key(ctx, out, t, 0.6, 30 + i)); key(ctx, out, c, 1.6, 40); thunder(ctx, out, c);
    const P = purr(ctx, out, c + 1.7), end = P.h1 + 0.45; return { dur: end + 0.35, M: { ks, ar, c, P, end, cols: toRed(P.clicks.length), kc: [RAINBOW[0], RAINBOW[1], RAINBOW[2], RAINBOW[4], RAINBOW[5], RAINBOW[5]] },
      ev: [...ks.map((t, i) => ({ t, k: 'key ' + 'Idle'[i], on: 1, vis: 1 })), ...ar.map(t => ({ t, k: '←', on: 1, vis: 1 })), { t: c, k: '| = crack', on: 1, vis: 1 }, ...evA(P), { t: P.h1, k: '| alone' }, { t: end, k: 'black', vis: 1 }] }; },
  draw(g, W, H, t, S) { const { ks, ar, c, end, kc } = S.M; if (t >= end) return; const L = lay(g, W, H, S.font), gap = t < c ? 0 : L.big * .32 * (RM ? 1 : easeOut(clamp((t - c) / 0.18)));
    if (t < c) { const n = lastIdx(t, ks) + 1, back = lastIdx(t, ar) + 1, cw = L.wId / 2, x0 = L.cx - L.wId; g.font = `${L.big}px ${L.font}`; g.fillStyle = INK; g.fillText('Idle'.slice(0, n), x0, L.base);
      const last = Math.max(ks[Math.max(0, n - 1)] || 0, ar[Math.max(0, back - 1)] || 0), ci = back ? 3 + back : n - 1, col = ci >= 0 ? kc[ci] : MAG, cx = x0 + cw * (n - back);
      if (t - last < 0.3 || Math.floor((t - last) / (60 / 168)) % 2 === 0) { g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10 * pulse(t, last, 0.1); g.globalAlpha = 0.9; g.fillRect(cx - (back ? L.big * .035 : 0), L.base - L.big * .85, back ? L.big * .07 : cw * 0.9, L.big * .98); g.globalAlpha = 1; g.shadowBlur = 0; } return; }
    bodyA(g, W, H, L, t, S, S.M, gap); flashBolt(g, W, H, L, t, c); } });

// D. A with the equalizer during the purr
V.push({ id: 'scope-meter', name: 'D · Strike × meter', idea: 'A, but during the brrr the pipe opens into the level meter: a smoother needle-like rise and fall, the top segment glowing in part, a peak light that holds and drifts down, and the peak light taking the rattle’s colours until it lands on red. Then the circular dissolve.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8), end = P.h1 + 0.45;
    return { dur: end + 0.35, M: { c, P, cols: toRed(P.clicks.length), end }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, ...evA(P), { t: P.h1, k: '| alone' }, { t: end, k: 'black', vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, end } = S.M; if (t >= end) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    bodyA(g, W, H, L, t, S, S.M, O.gap, { meter: true }); flashBolt(g, W, H, L, t, c); } });

// E. the tsss as a shockwave (my own)
V.push({ id: 'scope-shockwave', name: 'E · Scope × shockwave', idea: 'A, but the ending goes the other way: on the tsss a soft ring leaves the pipe with a low whump, and the letters come apart as it passes, blown outward in all directions. The | stands alone in the middle of the wave.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8), end = P.h1 + 0.45; tone(ctx, out, 'sine', 95, P.h0, 0.5, 0.22, 38);
    return { dur: end + 0.35, M: { c, P, cols: toRed(P.clicks.length), end }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, ...evA(P).map(e => e.k === 'tsss' ? { ...e, k: 'whump + tsss', on: 1, vis: 1 } : e), { t: P.h1, k: '| alone' }, { t: end, k: 'black', vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, P, end } = S.M; if (t >= end) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    if (t >= P.h0 && !RM) { const u = clamp((t - P.h0) / (P.h1 - P.h0)), Rr = (O.gap / 2 + Math.max(L.wId, L.wle) + L.big * 0.15) * easeOut(u) * 1.15; g.strokeStyle = '#cfe0ff'; g.globalAlpha = 0.5 * Math.pow(1 - u, 1.5); g.lineWidth = 2 + 6 * (1 - u); g.shadowColor = '#cfe0ff'; g.shadowBlur = 16;
      g.beginPath(); g.ellipse(L.cx, L.base - L.big * 0.36, Math.max(1, Rr), Math.max(1, Math.min(Rr, H * 0.44)), 0, 0, 7); g.stroke(); g.globalAlpha = 1; g.shadowBlur = 0; }
    bodyA(g, W, H, L, t, S, S.M, O.gap, { out: true }); flashBolt(g, W, H, L, t, c); } });

// ---------------- round 3: the dust ending, a short red |, the typing polished ----------------
// Nico (r2): "the end is still like a 'square' diffusion… maybe just the shapes of the fonts breaking down into dust". Every grain is a pixel of
// the rendered letters (2 px apart, so before it lets go the word looks exactly like the word). The tsss sets the pace: a grain lets go when
// the hiss's accumulated loudness passes its own threshold (louder hiss = faster erosion), and the thresholds erode the letters from the
// outside in, towards the | (with some randomness). Behaviours: 'settle' (drifts a little and sinks, fading) or 'gust' (carried off sideways).
const DUST = { key: '', grains: [] };
let DUST_MODE = null;   // the page's override: null (each variant's own), 'settle' or 'gust'
function dustGrains(W, H, L, gap, id, S, h0, h1) { const key = [id, W, H, L.big, L.font, Math.round(gap)].join('|'); if (DUST.key === key) return DUST.grains;
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H; const o = oc.getContext('2d'); word(o, L, gap); const d = o.getImageData(0, 0, W, H).data, r = rngOf(23), gs = [];
  const span = gap / 2 + Math.max(L.wId, L.wle);
  // the hiss's accumulated loudness, 0..1 over [h0, h1]
  const steps = Math.max(2, Math.round((h1 - h0) / 0.005)), cum = [0]; for (let i = 1; i <= steps; i++) cum.push(cum[i - 1] + S.env(h0 + i * 0.005)); const tot = cum[steps] || 1;
  const timeAt = p => { for (let i = 0; i <= steps; i++) if (0.55 * cum[i] / tot + 0.45 * i / steps >= p) return h0 + i * 0.005; return h1; };   // the hiss's loudness sets the pace, spread over its whole length so the bare | stays short
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const a = d[(y * W + x) * 4 + 3]; if (a < 90) continue;
    const far = clamp(Math.abs(x - L.cx) / span), th = clamp(0.62 * (1 - far) + 0.3 * r() + 0.04, 0, 0.9);   // outer first, the letters by the | last
    gs.push({ x, y, a: a / 255, k: r(), k2: r(), tr: timeAt(th), side: Math.sign(x - L.cx) || 1 }); }
  DUST.key = key; DUST.grains = gs; return gs; }
function dust(g, W, H, L, gap, t, S, id, P, mode) { const h0 = P.h0, h1 = P.h1, p = clamp((t - h0) / (h1 - h0));
  if (RM) return word(g, L, gap, { a: 1 - p });   // reduced motion: a plain fade
  const gs = dustGrains(W, H, L, gap, id, S, h0, h1), life = 0.42, m = DUST_MODE || mode;
  for (const q of gs) { const a = t - q.tr; let x = q.x, y = q.y, al = q.a;
    if (a > 0) { const u = a / life; if (u >= 1) continue; al *= (1 - u) * (1 - u);
      if (m === 'gust') { const push = (0.6 + 0.8 * q.k) * L.big * 2.6; x += push * a * a * 1.6 + Math.sin(a * 9 + q.k * 20) * 3 * u; y += -L.big * 0.25 * a * (0.3 + q.k2) + Math.cos(a * 7 + q.k2 * 30) * 2 * u; }
      else { const vx = (q.k - 0.5) * L.big * 0.5 + q.side * L.big * 0.12, vy = (q.k2 - 0.6) * L.big * 0.35; x += vx * a + Math.sin(a * 6 + q.k * 30) * 1.5; y += vy * a + L.big * 0.9 * a * a; } }
    g.globalAlpha = al; g.fillStyle = a > 0 ? (q.k > 0.5 ? '#c8c2b6' : '#9a958b') : INK; g.fillRect(x, y, 2, 2); }
  g.globalAlpha = 1; }
// the short red | at the end: ~0.45 s, alive with a faint crackle it flickers on, cut on a soft click
function crackle(ctx, out, a, b, seed = 13) { const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain(), r = rngOf(seed); s.buffer = noiseBuf(ctx, b - a + 0.1, seed); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
  v.gain.setValueAtTime(0.0001, a); for (let t = a; t < b; t += 0.03) v.gain.linearRampToValueAtTime(0.004 + 0.022 * Math.pow(r(), 2), t + 0.015); v.gain.linearRampToValueAtTime(0.0001, b); s.connect(bp); bp.connect(v); v.connect(out); s.start(a); s.stop(b + 0.05); }
const softClick = (ctx, out, at) => { tone(ctx, out, 'sine', 1500, at, 0.018, 0.06, 900); tone(ctx, out, 'sine', 140, at, 0.05, 0.05, 70); };
function holdPipe(g, L, t, S, a, b) { const f = S.envIn(t, a, b); pipe(g, L, RED, { a: 0.72 + 0.28 * f, glow: 8 + 14 * f }); }
// a fuller keyboard: each key its own pitch and weight, a body thock, a quieter key-up; shift for the | (it needs it)
function key2(ctx, out, at, o = {}) { const v = o.v ?? 1, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf(ctx, 0.06, o.seed || 3); bp.type = 'bandpass'; bp.frequency.value = o.f || 2600; bp.Q.value = o.q || 1.6;
  g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.3 * v, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.028 + 0.01 * v); s.connect(bp); bp.connect(g); g.connect(out); s.start(at);
  tone(ctx, out, 'sine', o.body || 160, at + 0.003, 0.05 + 0.02 * v, 0.08 * v, (o.body || 160) * 0.6);   // the thock of the key bottoming out
  if (o.up !== false) { const s2 = ctx.createBufferSource(), bp2 = ctx.createBiquadFilter(), g2 = ctx.createGain(), u = at + (o.hold || 0.07); s2.buffer = noiseBuf(ctx, 0.03, (o.seed || 3) + 100); bp2.type = 'bandpass'; bp2.frequency.value = (o.f || 2600) * 1.35; bp2.Q.value = 2;
    g2.gain.setValueAtTime(0.0001, u); g2.gain.linearRampToValueAtTime(0.08 * v, u + 0.002); g2.gain.exponentialRampToValueAtTime(0.0001, u + 0.018); s2.connect(bp2); bp2.connect(g2); g2.connect(out); s2.start(u); } }
// the typed opening, polished: I d l e (each key its own sound), ← ←, shift, then | comes down with the lightning; the cursor takes a colour per keystroke
const TYPE = { ks: [0.30, 0.47, 0.60, 0.83], ar: [1.20, 1.36], shift: 1.72, c: 1.9 };
function typedSound(ctx, out) { const KS = [{ f: 2300, body: 150, v: 1.0, seed: 21 }, { f: 2800, body: 175, v: 0.85, seed: 22 }, { f: 2550, body: 165, v: 0.8, seed: 23 }, { f: 3000, body: 185, v: 0.95, seed: 24 }];
  TYPE.ks.forEach((t, i) => key2(ctx, out, t, KS[i])); TYPE.ar.forEach((t, i) => key2(ctx, out, t, { f: 3400, q: 2.4, body: 210, v: 0.55, seed: 31 + i, hold: 0.05 }));
  key2(ctx, out, TYPE.shift, { f: 1900, body: 120, v: 0.7, seed: 35, up: false }); key2(ctx, out, TYPE.c, { f: 2100, body: 95, v: 1.7, seed: 40, hold: 0.14 }); thunder(ctx, out, TYPE.c); }
const TYPED_COLS = [RAINBOW[0], RAINBOW[1], RAINBOW[2], RAINBOW[4], RAINBOW[5], RAINBOW[5], RED];   // I d l e ← ← shift
function typedDraw(g, L, t) { const { ks, ar, shift, c } = TYPE, n = lastIdx(t, ks) + 1, back = lastIdx(t, ar) + 1, sh = t >= shift, cw = L.wId / 2, x0 = L.cx - L.wId;
  g.font = `${L.big}px ${L.font}`; g.fillStyle = INK; g.fillText('Idle'.slice(0, n), x0, L.base);
  const last = Math.max(ks[Math.max(0, n - 1)] || 0, ar[Math.max(0, back - 1)] || 0, sh ? shift : 0), ci = sh ? 6 : back ? 3 + back : n - 1, col = ci >= 0 ? TYPED_COLS[ci] : MAG, cx = x0 + cw * (n - back);
  const on = t - last < 0.3 || Math.floor((t - last) / (60 / 168)) % 2 === 0; if (!on && !sh) return;
  const w = back ? L.big * .07 : cw * 0.9, h = L.big * .98 * (sh ? 1 + 0.04 * Math.sin((t - shift) * 40) : 1);   // shift held: the cursor (already the pipe) trembles, charged
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6 + 14 * pulse(t, last, 0.1) + (sh ? 10 : 0); g.globalAlpha = 0.92; g.fillRect(cx - (back ? L.big * .035 : 0), L.base - L.big * .85 - (h - L.big * .98) / 2, w, h); g.globalAlpha = 1; g.shadowBlur = 0; }
const typedEv = () => [...TYPE.ks.map((t, i) => ({ t, k: 'key ' + 'Idle'[i], on: 1, vis: 1 })), ...TYPE.ar.map(t => ({ t, k: '←', on: 1, vis: 1 })), { t: TYPE.shift, k: 'shift', on: 1, vis: 1 }, { t: TYPE.c, k: '| = crack', on: 1, vis: 1 }];
// the endings
function endDust(ctx, out, P) { const hold0 = P.h1, cut = hold0 + 0.45; crackle(ctx, out, hold0 - 0.05, cut); softClick(ctx, out, cut); return { hold0, cut }; }
const evDust = (P, E) => [{ t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: P.h0, k: 'tsss → dust' }, { t: E.hold0, k: '| (crackle)' }, { t: E.cut, k: 'click → black', on: 1, vis: 1 }];
function endCRT(ctx, out, w0) { const pop = w0 + 0.32; tone(ctx, out, 'sine', 9000, w0, 0.32, 0.05, 220); tone(ctx, out, 'sine', 70, pop, 0.12, 0.35, 40); tone(ctx, out, 'square', 1800, pop, 0.012, 0.05, 900);
  const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noiseBuf(ctx, 1, 9); hp.type = 'highpass'; hp.frequency.value = 4000; v.gain.setValueAtTime(0.05, pop); v.gain.exponentialRampToValueAtTime(0.0001, pop + 0.6); s.connect(hp); hp.connect(v); v.connect(out); s.start(pop); return { w0, pop }; }
function crtFrame(g, W, H, t, w0, pop, inner) { if (t >= pop) { const a = 1 - (t - pop) / 0.6; if (a <= 0) return; g.fillStyle = RED; g.shadowColor = RED; g.shadowBlur = 22 * a; g.globalAlpha = a; g.beginPath(); g.arc(W / 2, H / 2, 4 + 3 * pulse(t, pop, 0.06), 0, 7); g.fill(); g.globalAlpha = 1; g.shadowBlur = 0; return; }
  const sq = t >= w0 ? clamp((t - w0) / (pop - w0)) : 0, sy = sq < 0.6 ? 1 - 0.994 * easeIn(sq / 0.6) : 0.006, sx = sq < 0.6 ? 1 : 1 - 0.99 * easeIn((sq - 0.6) / 0.4);
  g.save(); g.translate(W / 2, H / 2); g.scale(RM ? 1 : sx, RM ? 1 : sy); g.translate(-W / 2, -H / 2); if (sq > 0) { g.globalAlpha = 0.45 * sq; g.fillStyle = '#cfd8ff'; g.fillRect(0, H / 2 - 40, W, 80); g.globalAlpha = 1; } inner(); g.restore(); }
// the body after the crack, shared (A's): ring glow, the live trace on the brrr, a rainbow step per rattle click landing on red; the letters as given
function body3(g, W, H, L, t, S, M, gap, letters) { const { c, P, cols } = M, ring = t >= c && t < P.b0 ? S.envIn(t, c + 0.05, P.b0) : 0, brr = t >= P.b0 && t < P.b1 + 0.1 ? S.envIn(t, P.b0, P.b1) : 0, hs = M.dust && t >= P.h0 ? clamp((t - P.h0) / (P.h1 - P.h0)) : 0;
  letters(brr); const ki = lastIdx(t, P.clicks), col = ki >= 0 ? cols[ki] : MAG, kp = ki >= 0 ? pulse(t, P.clicks[ki], 0.05) : 0;
  const k = t < P.b0 ? 0 : t < P.b0 + 0.08 ? (t - P.b0) / 0.08 : hs > 0 ? Math.pow(1 - hs, 1.4) : t > P.end ? Math.max(0, 1 - (t - P.end) / 0.15) : 1;
  scopePipe(g, L, t, S, col, k, 8 + 34 * ring + 22 * kp + 14 * brr); }
const startOf = (L, t, c, gapT) => ({ gap: t < c ? 0 : L.big * .32 * (RM ? 1 : easeOut(clamp((t - c) / gapT)))});

// A3: A's body, the dust ending (settle), a short |
V.push({ id: 'a3-dust', name: 'A3 · Strike × scope, dust', idea: 'A, but at the end the letters’ own strokes crumble into dust from the outside in, as fast as the tsss gets loud; the grains drift and sink away. The red | holds a short moment, flickering on a faint crackle, and cuts on a soft click.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8), E = endDust(ctx, out, P);
    return { dur: E.cut + 0.3, M: { c, P, E, dust: 1, cols: toRed(P.clicks.length) }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, ...evDust(P, E)] }; },
  draw(g, W, H, t, S) { const { c, P, E } = S.M; if (t >= E.cut) return; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    if (t >= E.hold0) return holdPipe(g, L, t, S, E.hold0, E.cut);
    body3(g, W, H, L, t, S, S.M, O.gap, brr => t >= P.h0 ? dust(g, W, H, L, O.gap, t, S, 'a3', P, 'settle') : word(g, L, O.gap, { dx: jit(t, brr * L.big * 0.015, 2) })); flashBolt(g, W, H, L, t, c); } });

// B3a: A's body, dust, then the CRT squeeze on the bare |
V.push({ id: 'b3a-dust-crt', name: 'B3a · dust, then CRT on the bare |', idea: 'A3’s dust, but when the letters are gone the bare red | switches off like a tube: a falling whine squeezes it to a dot, a pop, and the dot fades. Nothing is squeezed on top of the dust any more.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8), C = endCRT(ctx, out, P.h1 + 0.12);
    return { dur: C.pop + 0.9, M: { c, P, C, dust: 1, cols: toRed(P.clicks.length) }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, { t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: P.h0, k: 'tsss → dust' }, { t: C.w0, k: 'whine ↓', vis: 1 }, { t: C.pop, k: 'pop → dot', on: 1, vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, P, C } = S.M; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    if (t >= P.h1) return crtFrame(g, W, H, t, C.w0, C.pop, () => pipe(g, L, RED, { glow: 12 }));
    body3(g, W, H, L, t, S, S.M, O.gap, brr => t >= P.h0 ? dust(g, W, H, L, O.gap, t, S, 'b3a', P, 'settle') : word(g, L, O.gap, { dx: jit(t, brr * L.big * 0.015, 2) })); flashBolt(g, W, H, L, t, c); } });

// B3b: A's body, the CRT instead of the dust
V.push({ id: 'b3b-crt', name: 'B3b · CRT instead of dust', idea: 'A’s body with no dust at all: after the rattle lands on red, the whole logo (letters and the calmed red |) switches off like a tube, squeezed to a line, then a dot on the pop.',
  build(ctx, out) { const c = OPEN.crack; thunder(ctx, out, c); const P = purr(ctx, out, c + 1.8, { hiss: false }), C = endCRT(ctx, out, P.end + 0.2);
    return { dur: C.pop + 0.9, M: { c, P, C, cols: toRed(P.clicks.length) }, ev: [{ t: c, k: 'crack', on: 1, vis: 1 }, { t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: C.w0, k: 'whine ↓', vis: 1 }, { t: C.pop, k: 'pop → dot', on: 1, vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, C } = S.M; const L = lay(g, W, H, S.font), O = opening(g, W, H, L, t, c);
    if (t < c) { word(g, L, 0, { a: O.a }); if (O.falling) pipe(g, L, MAG, { y: O.fallY, glow: 6 }); return; }
    crtFrame(g, W, H, t, C.w0, C.pop, () => body3(g, W, H, L, Math.min(t, C.w0), S, S.M, O.gap, brr => word(g, L, O.gap, { dx: jit(t, brr * L.big * 0.015, 2) }))); flashBolt(g, W, H, L, t, c); } });

// C3: typed (polished) + A's body + dust (carried off in a gust) + short |
V.push({ id: 'c3-typed-dust', name: 'C3 · Typed, dust', idea: 'C, polished: each key has its own click and thock, the arrows are lighter, you hear shift go down and the cursor tremble before the | key lands as the lightning. Then A’s body, and the letters are carried off sideways as dust in a gust of the tsss. A short |, a soft click.', font: "'Idle F1', monospace",
  build(ctx, out) { typedSound(ctx, out); const c = TYPE.c, P = purr(ctx, out, c + 1.7), E = endDust(ctx, out, P);
    return { dur: E.cut + 0.3, M: { c, P, E, dust: 1, cols: toRed(P.clicks.length) }, ev: [...typedEv(), ...evDust(P, E)] }; },
  draw(g, W, H, t, S) { const { c, P, E } = S.M; if (t >= E.cut) return; const L = lay(g, W, H, S.font); if (t < c) return typedDraw(g, L, t); const { gap } = startOf(L, t, c, 0.18);
    if (t >= E.hold0) return holdPipe(g, L, t, S, E.hold0, E.cut);
    body3(g, W, H, L, t, S, S.M, gap, brr => t >= P.h0 ? dust(g, W, H, L, gap, t, S, 'c3', P, 'gust') : word(g, L, gap, { dx: jit(t, brr * L.big * 0.015, 2) })); flashBolt(g, W, H, L, t, c); } });

// C3-crt: typed + A's body + the CRT ending
V.push({ id: 'c3-typed-crt', name: 'C3-crt · Typed, CRT off', idea: 'The polished typing and A’s body, ending the CRT way: after the rattle lands on red, the whole line switches off like a tube, squeezed to a line, then a red dot on the pop, which fades.', font: "'Idle F1', monospace",
  build(ctx, out) { typedSound(ctx, out); const c = TYPE.c, P = purr(ctx, out, c + 1.7, { hiss: false }), C = endCRT(ctx, out, P.end + 0.2);
    return { dur: C.pop + 0.9, M: { c, P, C, cols: toRed(P.clicks.length) }, ev: [...typedEv(), { t: P.b0, k: 'brrr' }, ...P.clicks.map((t, i) => ({ t, k: 'click ' + (i + 1), on: 1, vis: 1 })), { t: C.w0, k: 'whine ↓', vis: 1 }, { t: C.pop, k: 'pop → dot', on: 1, vis: 1 }] }; },
  draw(g, W, H, t, S) { const { c, C } = S.M; const L = lay(g, W, H, S.font); if (t < c) return typedDraw(g, L, t); const { gap } = startOf(L, t, c, 0.18);
    crtFrame(g, W, H, t, C.w0, C.pop, () => body3(g, W, H, L, Math.min(t, C.w0), S, S.M, gap, brr => word(g, L, gap, { dx: jit(t, brr * L.big * 0.015, 2) }))); flashBolt(g, W, H, L, t, c); } });

const SHOW = ['scope-strike', 'scope-crt', 'typed-scope', 'a3-dust', 'b3a-dust-crt', 'b3b-crt', 'c3-typed-dust', 'c3-typed-crt'];

// ---------------- render and analyse (the sound first; the picture reads its envelope and waveform) ----------------
async function render(v) { const probe = new OfflineAudioContext(1, SR, SR); const tmp = v.build(probe, probe.destination); const n = Math.ceil(tmp.dur * SR);
  const ctx = new OfflineAudioContext(1, n, SR), out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination); const R = v.build(ctx, out); const buf = await ctx.startRendering(), d = buf.getChannelData(0);
  const hop = Math.round(SR * 0.005), E = new Float32Array(Math.ceil(d.length / hop)); for (let i = 0; i < E.length; i++) { let s = 0, c = 0; for (let j = i * hop - hop; j < i * hop + hop; j++) if (j >= 0 && j < d.length) { s += d[j] * d[j]; c++; } E[i] = Math.sqrt(s / Math.max(1, c)); }
  let mx0 = 0; for (const x of E) mx0 = Math.max(mx0, x); const mx = mx0 || 1, at = t => E[clamp(Math.round(t / 0.005), 0, E.length - 1)];
  const S = { M: R.M, font: v.font || null, env: t => at(t) / mx,
    envIn: (t, a, b) => { let m = 1e-6; for (let i = Math.max(0, Math.round(a / .005)); i <= Math.min(E.length - 1, Math.round(b / .005)); i++) m = Math.max(m, E[i]); return clamp(at(t) / m); },
    level: t => clamp((20 * Math.log10(at(t) + 1e-6) + 48) / 44), peak(t) { let m = 0; for (let k = 0; k <= 24; k++) { const tt = t - k * 0.025; if (tt >= 0) m = Math.max(m, this.level(tt) - k * 0.012); } return m; },
    wave: (t0, len, N) => Array.from({ length: N }, (_, i) => d[clamp(Math.round((t0 + len * i / (N - 1)) * SR), 0, d.length - 1)] || 0) };
  let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); return { R, buf, S, peak: pk }; }


// ---------------- the module: { id, name, idea, duration, prepare(), build(ctx, canvas, t0, opts) } ----------------
// build() plays the logo on an AudioContext you own, starting at t0 (ctx time), and draws it on canvas from that same clock until it ends;
// it renders the sound first (call prepare() early to have it ready; if t0 has already passed when it is ready, it joins mid-way, still in sync).
// returns { stop(), done } (done: a promise that resolves when it ends or is stopped). opts: { font, destination }.
const LOGO_CACHE = new Map(), prepareLogo = v => { if (!LOGO_CACHE.has(v.id)) LOGO_CACHE.set(v.id, render(v)); return LOGO_CACHE.get(v.id); };
const LOGOS = V.map(v => { const probe = new OfflineAudioContext(1, SR, SR), duration = v.build(probe, probe.destination).dur;
  let ready = null;   // the rendered sound and its analysis, once prepare() has finished
  return { id: v.id, name: v.name, idea: v.idea, duration, prepare: () => prepareLogo(v).then(r => (ready = r)),
    // for a host that runs its own frame loop and its own sound (the story's intro): the rendered buffer, and the picture at second t
    ready: () => !!ready, buffer: () => ready ? ready.buf : null,
    drawAt(g, W, H, t, o = {}) { if (!ready || t < 0) return false; ready.S.font = o.font || v.font || "'Idle F1', monospace"; const was = BIG; BIG = o.big || 0;
      try { g.save(); v.draw(g, W, H, t, ready.S); } finally { g.restore(); BIG = was; } return t <= ready.R.dur; },
    build(ctx, canvas, t0, opts = {}) { if (opts.dust) DUST_MODE = opts.dust; let stopped = false, src = null, raf = 0, end; const done = new Promise(r => end = r), font = opts.font || v.font || "'Idle F1', monospace";
      prepareLogo(v).then(r => { if (stopped) return; src = ctx.createBufferSource(); src.buffer = r.buf; src.connect(opts.destination || ctx.destination); const now = ctx.currentTime; if (t0 >= now) src.start(t0); else src.start(now, now - t0);
        const g = canvas.getContext('2d'), lat = () => ctx.outputLatency || ctx.baseLatency || 0;
        const tick = () => { if (stopped) return; const t = ctx.currentTime - lat() - t0, W = canvas.width, H = canvas.height; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); if (t >= 0) { r.S.font = font; v.draw(g, W, H, t, r.S); }
          if (t > r.R.dur) { stopped = true; end(); return; } raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); });
      return { stop() { stopped = true; cancelAnimationFrame(raf); try { src && src.stop(); } catch (e) {} end(); }, done }; } }; });

// by id, with the round each came from (for ⭐ reviews and the intro's logo A/B): IdleLogos.byId('c3-typed-crt'), IdleLogos.ids, logo.round
const ROUND = id => /^(strike-purr-static|crt-off)$/.test(id) ? 1 : /^(a3|b3a|b3b|c3)-/.test(id) ? 3 : 2;
for (const L of LOGOS) L.round = ROUND(L.id);
window.IdleLogos = { list: LOGOS, version: 'round3', round3: SHOW, ids: LOGOS.map(L => L.id), byId: id => LOGOS.find(L => L.id === id) || null };
})();
