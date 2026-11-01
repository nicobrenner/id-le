// idle-intro.js: the genesis intro, a short cinematic drawn live in the page (Nico, 2026-11-01: "in the beginning there was nothing").
// Two tones, both ending in the void where the genesis begins:
//   eerie: a lab at night; the scientist arrives with a coffee, sits at a wall of tiny Id|le universes, one flickers awake,
//          the camera pushes into it, through it, into darkness.
//   epic:  countless tiny universes around a black hole that pulls in letters, a chord swells; the cosmos turns out to be on the
//          scientist's console; one small screen flickers, the push-in, a hit, the void.
// The mood, pacing and composition owe a lot to the early-90s cinematic games (flat polygons, rotoscope-like motion, silent cuts,
// held frames, letterboxing); the scenes, the scientist and the universes are Id|le's own.
// API: window.__intro.play({ tone: 'eerie' | 'epic', keep }) → Promise<{ tone, skipped }>, resolved when it ends or is skipped
//   (keep: leave the last frame, the void with a blinking cursor, on screen until __intro.close()).
// Skippable: click, tap, Esc or any key, or "skip ›". prefers-reduced-motion: four still frames with fades. Phones: less detail.
// Sound: synthesized through window.__audio (the one master: mute and volume apply); silent until the browser allows audio,
// a "🔊 sound" button starts it mid-way. Debug: ?intro=eerie | ?intro=epic plays it on load; ?intro=0 never (window.__intro.off).
(() => {
  const Q = new URLSearchParams(location.search), qi = Q.get('intro');
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const phone = () => { try { return matchMedia('(max-width: 600px)').matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700); } catch (e) { return false; } };
  const C = { night: '#05070d', ink: '#0b0f18', wall: '#0f1b24', wall2: '#13242f', floor: '#091117', teal: '#1d3a46', cyan: '#6fe3ff', cyanD: '#2b6f86', amber: '#f4b860',
    amberD: '#a8743a', paper: '#e9e3d6', word: '#cdbf9a', mag: '#e0367a', coat: '#c3ccd4', coatD: '#8e9ca8', pants: '#1a222d', skin: '#a07a62', hair: '#121219', red: '#ff4a4a' };
  const rnd = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, lerp = (a, b, t) => a + (b - a) * t;

  // ---------- drawing primitives (box-relative: B = the letterboxed frame, S = its smaller side)
  function poly(g, pts, fill, a = 1) { g.globalAlpha = a; g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.globalAlpha = 1; }
  function rect(g, x, y, w, h, fill, a = 1) { g.globalAlpha = a; g.fillStyle = fill; g.fillRect(x, y, w, h); g.globalAlpha = 1; }
  function frameOf(W, H) { const ar = W / H; let w = W, h = H; if (ar >= 1) h = Math.min(H, W / 1.9); else h = Math.min(H, W * 1.3); return { x: (W - w) / 2, y: (H - h) / 2, w, h, S: Math.min(w, h) }; }
  function stars(seed, n) { const r = rnd(seed); return Array.from({ length: n }, () => ({ x: r(), y: r(), s: r() * r() * 1.6 + .3, tw: r() * 6.28, c: r() < .12 ? C.amber : r() < .2 ? C.cyan : C.paper })); }
  function drawStars(g, B, list, t, drift = 0, yMax = 1) { for (const s of list) { if (s.y > yMax) continue; const a = .35 + .35 * Math.sin(t * 1.3 + s.tw); rect(g, B.x + ((s.x + t * drift) % 1) * B.w, B.y + s.y * B.h, s.s * B.S / 500, s.s * B.S / 500, s.c, a); } }
  function title(g, B, a, size, x, y, sub) {   // "Id|le", the bar in the game's magenta
    if (a <= 0) return; g.globalAlpha = a; g.fillStyle = C.paper; g.font = `400 ${size}px Georgia, 'Times New Roman', serif`; g.textBaseline = 'alphabetic';
    const w1 = g.measureText('Id').width, w2 = g.measureText('le').width, bar = size * .09, gap = size * .07;
    g.fillText('Id', x, y); g.fillStyle = C.mag; g.fillRect(x + w1 + gap, y - size * .78, bar, size * .95); g.fillStyle = C.paper; g.fillText('le', x + w1 + gap * 2 + bar, y);
    if (sub) { g.font = `italic ${size * .22}px Georgia, serif`; g.fillStyle = C.word; g.fillText(sub, x, y + size * .38); }
    g.globalAlpha = 1; return w1 + w2 + gap * 2 + bar;
  }

  // ---------- the scientist: a few flat polygons, side view (walking, a coffee) and back view (seated at the console)
  function scientistSide(g, x, y, k, ph, walking, t, shade = 1) {
    const sw = walking ? Math.sin(ph) : 0, bob = walking ? Math.abs(Math.sin(ph)) * .012 * k : 0; y -= bob;
    const hip = [x, y - .47 * k], dim = (c) => c;
    const leg = (a, col) => { const fx = hip[0] + Math.sin(a) * .47 * k, fy = hip[1] + Math.cos(a) * .47 * k, kx = hip[0] + Math.sin(a * .4) * .24 * k + (walking ? Math.max(0, -a) * .05 * k : 0), ky = hip[1] + .24 * k;
      poly(g, [[hip[0] - .035 * k, hip[1]], [hip[0] + .035 * k, hip[1]], [kx + .033 * k, ky], [fx + .03 * k, fy], [fx - .028 * k, fy], [kx - .03 * k, ky]], col);
      poly(g, [[fx - .03 * k, fy - .02 * k], [fx + .075 * k, fy - .012 * k], [fx + .075 * k, fy + .004 * k], [fx - .03 * k, fy + .004 * k]], C.ink); };
    leg(-sw * .42, '#141b25'); leg(sw * .42, dim(C.pants));
    const arm = (a, col, cup) => { const sx = x + .01 * k, sy = y - .8 * k, hx = sx + Math.sin(a) * .3 * k, hy = sy + Math.cos(a) * .3 * k;
      if (cup) { const ex = sx + .05 * k, ey = sy + .17 * k, cx = sx + .14 * k, cy = sy + .19 * k; poly(g, [[sx - .025 * k, sy], [sx + .03 * k, sy], [ex + .03 * k, ey], [cx, cy - .02 * k], [cx, cy + .02 * k], [ex - .03 * k, ey + .02 * k]], col);
        poly(g, [[cx - .005 * k, cy - .055 * k], [cx + .05 * k, cy - .055 * k], [cx + .045 * k, cy + .01 * k], [cx, cy + .01 * k]], C.paper);
        g.strokeStyle = C.paper; g.lineWidth = Math.max(1, k * .006); for (let i = 0; i < 2; i++) { g.globalAlpha = .35; g.beginPath(); const bx = cx + .015 * k + i * .015 * k; g.moveTo(bx, cy - .06 * k); for (let j = 1; j <= 6; j++) g.lineTo(bx + Math.sin(t * 3 + j + i * 2) * .008 * k, cy - .06 * k - j * .02 * k); g.stroke(); } g.globalAlpha = 1; return; }
      poly(g, [[sx - .028 * k, sy], [sx + .028 * k, sy], [hx + .025 * k, hy], [hx - .025 * k, hy]], col); };
    arm(sw * .35, C.coatD);
    poly(g, [[x - .085 * k, y - .84 * k], [x + .075 * k, y - .84 * k], [x + .1 * k, y - .3 * k], [x - .12 * k, y - .3 * k]], C.coat, shade);   // the lab coat
    poly(g, [[x - .12 * k, y - .3 * k], [x - .02 * k, y - .3 * k], [x - .06 * k + sw * .02 * k, y - .25 * k]], C.coatD, shade);
    poly(g, [[x - .02 * k, y - .87 * k], [x + .03 * k, y - .87 * k], [x + .03 * k, y - .83 * k], [x - .02 * k, y - .83 * k]], C.skin);
    const hx = x + .015 * k, hy = y - .93 * k, r = .062 * k;   // head and hair
    poly(g, [[hx - r * .8, hy - r], [hx + r * .7, hy - r * .95], [hx + r, hy - r * .1], [hx + r * .85, hy + r * .7], [hx, hy + r], [hx - r * .85, hy + r * .55]], C.skin);
    poly(g, [[hx - r * .95, hy - r * .6], [hx - r * .5, hy - r * 1.15], [hx + r * .75, hy - r * 1.05], [hx + r * .5, hy - r * .55], [hx - r * .35, hy - r * .3], [hx - r * .75, hy + r * .4]], C.hair);
    rect(g, hx + r * .35, hy - r * .15, r * .45, r * .12, C.ink, .8);   // glasses
    arm(-sw * .2 + .9, C.coat, true);
  }
  function scientistBack(g, x, y, k, lean, t) {   // seated, from behind, facing the console
    const ly = lean * .06 * k, sway = Math.sin(t * .7) * .004 * k;
    poly(g, [[x - .2 * k, y], [x + .2 * k, y], [x + .17 * k, y - .45 * k], [x - .17 * k, y - .45 * k]], '#0d1219');   // the chair back
    poly(g, [[x - .16 * k, y - .05 * k], [x + .16 * k, y - .05 * k], [x + .13 * k + sway, y - .58 * k - ly], [x - .13 * k + sway, y - .58 * k - ly]], C.coatD);
    poly(g, [[x - .16 * k, y - .05 * k], [x - .02 * k, y - .05 * k], [x - .05 * k + sway, y - .58 * k - ly], [x - .13 * k + sway, y - .58 * k - ly]], C.coat, .55);
    const hx = x + sway * 2, hy = y - .7 * k - ly * 1.4, r = .085 * k * (1 + lean * .06);
    poly(g, [[hx - r * .9, hy - r * .4], [hx - r * .5, hy - r], [hx + r * .5, hy - r], [hx + r * .9, hy - r * .4], [hx + r * .8, hy + r * .7], [hx, hy + r], [hx - r * .8, hy + r * .7]], C.hair);
    poly(g, [[x - .14 * k, y - .52 * k - ly], [x - .26 * k, y - .3 * k - ly * .5], [x - .22 * k, y - .27 * k - ly * .5], [x - .1 * k, y - .45 * k - ly]], C.coatD);
    poly(g, [[x + .14 * k, y - .52 * k - ly], [x + .26 * k, y - .3 * k - ly * .5], [x + .22 * k, y - .27 * k - ly * .5], [x + .1 * k, y - .45 * k - ly]], C.coatD);
  }

  // ---------- the console: a wall of small screens, each a tiny Id|le universe (a floor of words, a creature crawling)
  function screenWorld(g, x, y, w, h, seed, t, lit = 1, big = false) {
    const r = rnd(seed); rect(g, x, y, w, h, '#06121a'); g.globalAlpha = .9 * lit;
    const n = big ? 22 : 5; for (let i = 0; i < n; i++) { const bw = (r() * .2 + .08) * w, bx = x + r() * (w - bw), by = y + (r() * .8 + .1) * h; rect(g, bx, by, bw, Math.max(1, h * (big ? .035 : .06)), C.word, .55 * lit); }
    if (big) { g.font = `${Math.max(8, h * .055)}px ui-monospace, Menlo, monospace`; g.fillStyle = C.word; const ws = ['coffee', 'ball', 'dream', 'loop', 'heap', 'token', 'sink', 'them']; for (let i = 0; i < 6; i++) { g.globalAlpha = .7 * lit; g.fillText(ws[i], x + (r() * .7 + .05) * w, y + (r() * .7 + .2) * h); } }
    const cx = x + ((t * (big ? .05 : .09) + r()) % 1) * w, cy = y + (.3 + .4 * Math.sin(t * .8 + seed)) * h, cs = Math.max(1.5, h * (big ? .03 : .06));
    if (big) { g.strokeStyle = C.mag; g.lineWidth = Math.max(1, cs * .25); g.globalAlpha = lit; for (let l = 0; l < 6; l++) { const a = l / 6 * 6.28 + t * 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * cs * 2.2, cy + Math.sin(a) * cs * 1.6 + Math.sin(t * 9 + l) * cs * .3); g.stroke(); } }
    rect(g, cx - cs / 2, cy - cs / 2, cs, cs, C.mag, lit); g.globalAlpha = 1;
    rect(g, x, y, w, h * .08, '#ffffff', .03 * lit);   // a glint
  }
  function consoleWall(g, B, t, o) {   // o: { cols, rows, flick (index), flickAmt, cosmos, deskY }
    const x0 = B.x + B.w * .1, x1 = B.x + B.w * .9, y0 = B.y + B.h * .1, y1 = B.y + B.h * .6, cols = o.cols, rows = o.rows, gap = B.S * .012;
    const sw = (x1 - x0 - gap * (cols - 1)) / cols, sh = (y1 - y0 - gap * (rows - 1)) / rows; let fr = null;
    const glow = g.createRadialGradient(B.x + B.w / 2, (y0 + y1) / 2, B.S * .05, B.x + B.w / 2, (y0 + y1) / 2, B.w * .6); glow.addColorStop(0, 'rgba(111,227,255,.10)'); glow.addColorStop(1, 'rgba(111,227,255,0)'); g.fillStyle = glow; g.fillRect(B.x, B.y, B.w, B.h);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const idx = j * cols + i, x = x0 + i * (sw + gap), y = y0 + j * (sh + gap);
      if (o.cosmos && o.cosmos.contains(i, j)) continue;
      const fl = idx === o.flick ? o.flickAmt : 0, lit = fl ? clamp(.6 + Math.sin(t * 40) * .4 * fl + (Math.random() < .08 * fl ? .8 : 0), .2, 1.6) : .55;
      rect(g, x - 1, y - 1, sw + 2, sh + 2, fl ? C.cyan : C.cyanD, fl ? .9 : .5); screenWorld(g, x, y, sw, sh, 17 + idx * 31, t, lit);
      if (fl) { rect(g, x, y + ((t * 2) % 1) * sh, sw, Math.max(1, sh * .04), C.cyan, .25 * fl); fr = { x, y, w: sw, h: sh }; }
    }
    if (o.cosmos) { const c = o.cosmos, x = x0 + c.i * (sw + gap), y = y0 + c.j * (sh + gap), w = c.cw * sw + (c.cw - 1) * gap, h = c.ch * sh + (c.ch - 1) * gap;
      rect(g, x - 2, y - 2, w + 4, h + 4, C.amber, .6); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); rect(g, x, y, w, h, C.night); cosmos(g, { x, y, w, h, S: Math.min(w, h) }, t, o.phone ? 400 : 1200, 1.25); g.restore(); }
    const dy = B.y + B.h * (o.deskY || .66);   // the desk, a keyboard, the coffee
    poly(g, [[B.x, dy], [B.x + B.w, dy], [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]], '#0a1218');
    poly(g, [[B.x + B.w * .05, dy], [B.x + B.w * .95, dy], [B.x + B.w * .98, dy + B.h * .03], [B.x + B.w * .02, dy + B.h * .03]], C.teal, .8);
    return fr;
  }

  // ---------- the cosmos: universes on spiral arms, a black hole of words pulling letters in
  const GLYPHS = 'Id|le words eat dream creatures build count plot 0 1 hut rain coffee loop heap token'.split('');
  function cosmos(g, R, t, n, scale = 1) {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, rad = Math.max(R.w, R.h) * .62 * scale, r = rnd(4242), rot = t * .035;
    for (let i = 0; i < n; i++) { const arm = i % 3, rr = Math.pow(r(), .7) * rad, a = arm * 2.094 + rr / rad * 4.2 + rot + (r() - .5) * .45, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * .62;
      const s = (r() * 1.6 + .4) * R.S / 600, c = r() < .15 ? C.amber : r() < .3 ? C.mag : C.cyan; rect(g, x, y, s, s, c, .25 + r() * .55); }
    const bh = R.S * .07 * scale, gl = g.createRadialGradient(cx, cy, bh * .8, cx, cy, bh * 3.2); gl.addColorStop(0, 'rgba(244,184,96,.55)'); gl.addColorStop(.4, 'rgba(224,54,122,.18)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl; g.beginPath(); g.ellipse(cx, cy, bh * 3.2, bh * 2.1, 0, 0, 6.29); g.fill();
    g.font = `${Math.max(7, R.S * .022 * scale)}px ui-monospace, Menlo, monospace`; g.textAlign = 'center';
    for (let i = 0; i < 70; i++) { const ph = ((t * .11 + i / 70) % 1), rr = bh * (1.2 + (1 - ph) * 5.5), a = i * 2.39 + t * (1.4 / (rr / bh)); g.globalAlpha = clamp(ph * 1.4) * (1 - Math.pow(ph, 6)) * .9;
      g.fillStyle = i % 5 ? C.word : C.amber; g.fillText(GLYPHS[i % GLYPHS.length], cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .62); }
    g.globalAlpha = 1; g.textAlign = 'start'; g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx, cy, bh, bh * .8, 0, 0, 6.29); g.fill();
    g.strokeStyle = C.amber; g.globalAlpha = .7; g.lineWidth = Math.max(1, bh * .06); g.beginPath(); g.ellipse(cx, cy, bh * 1.25, bh * .35, -.18, 0, 6.29); g.stroke(); g.globalAlpha = 1;
  }

  // ---------- the void, where the genesis begins
  function voidFrame(g, B, t, st, line, la) {
    rect(g, B.x, B.y, B.w, B.h, '#020306'); drawStars(g, B, st, t, .002, .62);
    const hy = B.y + B.h * .66; g.strokeStyle = C.cyan; g.lineWidth = 1;   // a faint vector grid falling away to the horizon
    for (let i = -12; i <= 12; i++) { g.globalAlpha = .07; g.beginPath(); g.moveTo(B.x + B.w / 2 + i * B.w * .02, hy); g.lineTo(B.x + B.w / 2 + i * B.w * .16, B.y + B.h); g.stroke(); }
    for (let j = 1; j < 8; j++) { const yy = hy + Math.pow(j / 8, 2.2) * (B.y + B.h - hy); g.globalAlpha = .06; g.beginPath(); g.moveTo(B.x, yy); g.lineTo(B.x + B.w, yy); g.stroke(); }
    g.globalAlpha = 1; if (la <= 0) return;
    const size = Math.max(15, B.S * .045); g.font = `italic ${size}px Georgia, serif`; const tw = g.measureText(line).width, x = B.x + (B.w - tw) / 2, y = B.y + B.h * .46;
    g.globalAlpha = la; g.fillStyle = C.paper; g.fillText(line, x, y); if (Math.floor(t * 2.2) % 2 === 0) rect(g, x + tw + size * .25, y - size * .8, size * .45, size * .95, C.cyan, la); g.globalAlpha = 1;
  }

  // ---------- the two films: scenes with durations; cuts are instant, some frames held
  const LINE = 'in the beginning there was nothing';
  function film(tone, P) {
    const st = stars(7, P ? 160 : 380), cols = P ? 4 : 6, rows = P ? 3 : 4, flick = P ? 6 : 9;
    if (tone === 'epic') return [
      { d: 6, still: 3.2, draw(g, B, t) { rect(g, B.x, B.y, B.w, B.h, C.night); drawStars(g, B, st, t, .001); const z = 1 + t * .04; cosmos(g, B, t, P ? 900 : 2600, z);
        title(g, B, clamp((t - 2.4) / .8) * clamp((5.6 - t) / .6), B.S * .16, B.x + B.w * .07, B.y + B.h * .9); } },
      { d: 3.5, still: 2.2, draw(g, B, t) { const z = lerp(2.6, 1, ease(clamp(t / 1.6))); g.save(); g.translate(B.x + B.w / 2, B.y + B.h * .35); g.scale(z, z); g.translate(-(B.x + B.w / 2), -(B.y + B.h * .35));
        rect(g, B.x, B.y, B.w, B.h, C.wall); consoleWall(g, B, t + 6, { cols, rows, flick: -1, cosmos: { i: 1, j: 0, cw: cols - 2, ch: rows - 1, contains: (i, j) => i >= 1 && i <= cols - 2 && j <= rows - 2 }, phone: P }); g.restore();
        scientistBack(g, B.x + B.w * .5, B.y + B.h * 1.02, B.h * .62, 0, t); } },
      { d: 3, still: 1.6, draw(g, B, t) { rect(g, B.x, B.y, B.w, B.h, C.wall); this.fr = consoleWall(g, B, t + 9.5, { cols, rows, flick, flickAmt: clamp(t / 1.2), cosmos: { i: 1, j: 0, cw: cols - 2, ch: rows - 1, contains: (i, j) => i >= 1 && i <= cols - 2 && j <= rows - 2 }, phone: P });
        scientistBack(g, B.x + B.w * .5, B.y + B.h * 1.02, B.h * .62, ease(clamp((t - .9) / 1.4)), t); } },
      { d: 3, draw: pushIn(true, cols, rows, flick, P) },
      { d: 4.5, still: 3, draw(g, B, t) { voidFrame(g, B, t, st, LINE, clamp((t - .6) / 1.2)); } },
    ];
    return [
      { d: 3.4, still: 1.7, draw(g, B, t) {   // outside: the lab on a hill, one window lit, a lone figure arriving
        const sky = g.createLinearGradient(0, B.y, 0, B.y + B.h); sky.addColorStop(0, '#04060c'); sky.addColorStop(1, '#0d1726'); g.fillStyle = sky; g.fillRect(B.x, B.y, B.w, B.h); drawStars(g, B, st, t, 0, .55);
        poly(g, [[B.x, B.y + B.h * .78], [B.x + B.w * .3, B.y + B.h * .7], [B.x + B.w * .62, B.y + B.h * .74], [B.x + B.w, B.y + B.h * .69], [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]], '#070c13');
        const lx = B.x + B.w * .58, ly = B.y + B.h * .72, lw = B.w * .2, lh = B.h * .2;
        poly(g, [[lx, ly], [lx + lw, ly], [lx + lw, ly - lh], [lx, ly - lh]], '#0b131c'); poly(g, [[lx + lw * .55, ly - lh], [lx + lw * .95, ly - lh], [lx + lw * .9, ly - lh * 1.55], [lx + lw * .6, ly - lh * 1.55]], '#0b131c');
        g.fillStyle = '#0b131c'; g.beginPath(); g.ellipse(lx + lw * .75, ly - lh * 1.55, lw * .17, lh * .32, 0, Math.PI, 0); g.fill();
        rect(g, lx + lw * .2, ly - lh * .62, lw * .1, lh * .18, C.amber, .9); rect(g, lx + lw * .2, ly - lh * .62, lw * .1, lh * .18, C.cyan, .25 + .2 * Math.sin(t * 7));   // the lit window, console light flickering
        rect(g, lx + lw * .93, ly - lh * 2.25, Math.max(1, lw * .008), lh * .4, '#0b131c'); if (Math.floor(t * 1.3) % 2 === 0) rect(g, lx + lw * .925, ly - lh * 2.28, Math.max(2, lw * .02), Math.max(2, lw * .02), C.red);
        scientistSide(g, lerp(B.x + B.w * .2, B.x + B.w * .5, t / 3.4), B.y + B.h * .745 - t * .008 * B.h, B.h * .1, t * 7, true, t, .6);
        title(g, B, clamp(t / .7) * clamp((3.1 - t) / .5) * .85, B.S * .085, B.x + B.w * .05, B.y + B.h * .2); } },
      { d: 4.2, still: 3.9, draw(g, B, t) {   // inside: a dim room, a ceiling lamp, the glow of the console room through a door; held frame when they stop
        rect(g, B.x, B.y, B.w, B.h, C.wall); poly(g, [[B.x, B.y + B.h * .8], [B.x + B.w, B.y + B.h * .8], [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]], C.floor);
        const dx = B.x + B.w * .78, dy = B.y + B.h * .28, dw = B.w * .1, dh = B.h * .52; rect(g, dx, dy, dw, dh, C.cyan, .18 + .05 * Math.sin(t * 9)); rect(g, dx + dw * .1, dy + dh * .05, dw * .8, dh * .95, '#06121a', .6);
        poly(g, [[dx, B.y + B.h * .8], [dx + dw, B.y + B.h * .8], [dx + dw * 2.4, B.y + B.h], [dx - dw * .6, B.y + B.h]], C.cyan, .07);
        poly(g, [[B.x + B.w * .3, B.y], [B.x + B.w * .34, B.y], [B.x + B.w * .5, B.y + B.h * .8], [B.x + B.w * .14, B.y + B.h * .8]], C.amber, .06); rect(g, B.x + B.w * .3, B.y, B.w * .04, B.h * .03, C.amber, .8);
        const walk = t < 3.2, p = clamp(t / 3.2); scientistSide(g, lerp(B.x + B.w * .12, B.x + B.w * .62, p), B.y + B.h * .82, B.h * .62, t * 6.5, walk, t); } },
      { d: 3.6, still: 2, draw(g, B, t) {   // the console: a wall of universes; they sit, the coffee steams
        rect(g, B.x, B.y, B.w, B.h, C.wall); const drift = t * .006 * B.w; g.save(); g.translate(-drift, 0); consoleWall(g, B, t + 7.6, { cols, rows, flick: -1 }); g.restore();
        scientistBack(g, B.x + B.w * .46, B.y + B.h * 1.02, B.h * .62, 0, t);
        const cx = B.x + B.w * .7, cy = B.y + B.h * .69; poly(g, [[cx, cy], [cx + B.S * .03, cy], [cx + B.S * .027, cy + B.S * .04], [cx + B.S * .003, cy + B.S * .04]], C.paper, .9);
        g.strokeStyle = C.paper; g.lineWidth = 1; g.globalAlpha = .3; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(cx + B.S * (.01 + i * .01), cy); for (let j = 1; j < 7; j++) g.lineTo(cx + B.S * (.01 + i * .01) + Math.sin(t * 3 + j + i) * B.S * .005, cy - j * B.S * .012); g.stroke(); } g.globalAlpha = 1; } },
      { d: 3.2, still: 1.6, draw(g, B, t) {   // close: one universe flickers awake; a shoulder leans in
        rect(g, B.x, B.y, B.w, B.h, C.wall); const x = B.x + B.w * .2, y = B.y + B.h * .12, w = B.w * .6, h = B.h * .62, lit = clamp(.35 + t * .3 + (Math.random() < .1 ? .5 : 0) + Math.sin(t * 31) * .08, .2, 1.4);
        rect(g, x - 3, y - 3, w + 6, h + 6, C.cyan, .5 + .3 * Math.sin(t * 13)); screenWorld(g, x, y, w, h, 777, t, lit, true); for (let s = 0; s < h; s += 3) rect(g, x, y + s, w, 1, '#000', .18);
        const lean = ease(clamp(t / 2.4)); poly(g, [[B.x, B.y + B.h], [B.x, B.y + B.h * (.62 - lean * .08)], [B.x + B.w * (.1 + lean * .05), B.y + B.h * (.58 - lean * .1)], [B.x + B.w * (.24 + lean * .06), B.y + B.h * (.72 - lean * .06)], [B.x + B.w * .3, B.y + B.h]], C.hair); } },
      { d: 3, draw: pushIn(false, cols, rows, flick, P) },
      { d: 4.5, still: 3, draw(g, B, t) { voidFrame(g, B, t, st, LINE, clamp((t - .6) / 1.2)); } },
    ];
  }
  function pushIn(epic, cols, rows, flick, P) {   // the camera falls into the flickering screen, through it, into darkness
    return function (g, B, t) {
      const p = clamp(t / 2.6), z = 1 + Math.pow(ease(p), 2.2) * (epic ? 70 : 45), shake = epic ? Math.sin(t * 60) * p * B.S * .004 : 0;
      const x = B.x + B.w * .2, y = B.y + B.h * .12, w = B.w * .6, h = B.h * .62, cx = x + w * .62, cy = y + h * .45;
      g.save(); g.translate(B.x + B.w / 2 + shake, B.y + B.h / 2); g.scale(z, z); g.translate(-cx, -cy);
      rect(g, B.x - B.w, B.y - B.h, B.w * 3, B.h * 3, C.wall); screenWorld(g, x, y, w, h, 777, t + 12, 1.2 + p, true); g.restore();
      for (let s = 0; s < B.h; s += 3) rect(g, B.x, B.y + s, B.w, 1, '#000', .15 * (1 - p));
      if (p > .75) rect(g, B.x, B.y, B.w, B.h, epic && t > 2.55 && t < 2.75 ? '#ffffff' : '#000', clamp((p - .75) / .25));
    };
  }

  // ---------- sound: synthesized, through the master (mute and volume apply); scheduled from the current point of the film
  function soundtrack(tone, startAt, offline) {   // offline: an OfflineAudioContext (recordings); otherwise the game's master
    const A = window.__audio; let ctx, dest;
    if (offline) { ctx = offline; dest = offline.destination; }
    else { if (!A || A.muted()) return null; try { ctx = A.ctx(); } catch (e) { return null; } if (!ctx || ctx.state !== 'running') return null; dest = A.out(); }
    const out = ctx.createGain(); out.gain.value = 0; out.connect(dest); const t0 = ctx.currentTime - startAt, nodes = [], at = s => t0 + s, now = ctx.currentTime;
    out.gain.setTargetAtTime(.9, now, .3);
    const osc = (type, f, g, a, b, att = .5, rel = .8) => { if (b <= startAt) return null; const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.value = f; v.gain.value = 0; o.connect(v); v.connect(out);
      const s = Math.max(now, at(a)); v.gain.setTargetAtTime(g, s, att); v.gain.setTargetAtTime(0, Math.max(s + .05, at(b) - rel), rel / 3); o.start(s); o.stop(at(b) + rel); nodes.push(o); return o; };
    const noise = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
    const hiss = (type, f, q, g, a, b) => { if (b <= startAt) return; const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; v.gain.value = 0;
      s.connect(fl); fl.connect(v); v.connect(out); const st = Math.max(now, at(a)); v.gain.setTargetAtTime(g, st, .4); v.gain.setTargetAtTime(0, Math.max(st + .05, at(b) - .4), .2); s.start(st); s.stop(at(b) + .5); nodes.push(s); };
    const tick = (s, g = .05, f = 2400) => { if (s < startAt) return; const n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain(); n.buffer = noise; fl.type = 'highpass'; fl.frequency.value = f; v.gain.setValueAtTime(g, at(s)); v.gain.exponentialRampToValueAtTime(.0001, at(s) + .05); n.connect(fl); fl.connect(v); v.connect(out); n.start(at(s)); n.stop(at(s) + .08); nodes.push(n); };
    const thump = (s, g = .12, f = 80) => { if (s < startAt) return; const o = ctx.createOscillator(), v = ctx.createGain(); o.frequency.setValueAtTime(f, at(s)); o.frequency.exponentialRampToValueAtTime(f * .5, at(s) + .18); v.gain.setValueAtTime(g, at(s)); v.gain.exponentialRampToValueAtTime(.0001, at(s) + .22); o.connect(v); v.connect(out); o.start(at(s)); o.stop(at(s) + .25); nodes.push(o); };
    const riser = (a, b, f0, f1, g) => { if (b <= startAt) return; const o = osc('sine', f0, g, a, b + .2, .8, .15); if (o) { o.frequency.setValueAtTime(f0, Math.max(now, at(a))); o.frequency.exponentialRampToValueAtTime(f1, at(b)); } };
    const total = tone === 'epic' ? 20 : 21.9;
    if (tone === 'epic') {
      if (12.5 > startAt) { const fl = ctx.createBiquadFilter(), v = ctx.createGain(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lerp(300, 2400, clamp(startAt / 6)), now); fl.frequency.linearRampToValueAtTime(2400, Math.max(now + .05, at(6)));
        v.gain.value = 0; v.gain.setTargetAtTime(.03, now, 2.2); v.gain.setTargetAtTime(0, Math.max(now + .1, at(11.3)), .4); fl.connect(v); v.connect(out);   // a slow chord, opening as the cosmos turns
        [110, 164.81, 220, 246.94, 329.63].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (1 + (i % 2 ? .003 : -.002)); o.connect(fl); o.start(now); o.stop(at(12.6)); nodes.push(o); }); }
      osc('sine', 55, .12, 0, 15.5, 2.5, 1); hiss('bandpass', 900, .6, .02, 12.5, 15.5); riser(12.5, 15.3, 110, 1760, .07);
      if (15.5 >= startAt) { thump(15.5, .5, 60); tick(15.5, .25, 400); } osc('sine', 110, .05, 15.6, total, 2, 1.5); osc('sine', 164.81, .03, 15.8, total, 2.5, 1.5);
    } else {
      osc('sine', 55, .07, 0, total - 4.5, 1.5, 1); osc('sine', 110.6, .025, 0, total - 4.5, 2, 1); hiss('bandpass', 420, .7, .03, 3.4, 14.2);
      for (let s = 3.6; s < 6.6; s += .5) thump(s, .07, 95);
      [11.2, 11.45, 11.6, 12.05, 12.2, 12.7, 13.1, 13.25].forEach(s => tick(s, .05));
      riser(14.2, 17, 220, 1320, .06); osc('sine', 110, .04, 17.4, total, 2, 1.5); osc('sine', 164.81, .02, 17.6, total, 2.5, 1.5);
    }
    return { stop(q = .5) { try { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, q / 3); setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); out.disconnect(); }, q * 1000 + 200); } catch (e) {} } };
  }

  // ---------- the player: an overlay with a canvas, skip, sound; resolves once
  let cur = null;
  const css = document.createElement('style');
  css.textContent = `#idleIntro{position:fixed;inset:0;z-index:2147480000;background:#000;opacity:1;transition:opacity .6s;cursor:pointer;touch-action:none}#idleIntro canvas{position:absolute;inset:0;width:100%;height:100%}
#idleIntro .ib{position:absolute;bottom:14px;font:600 12px system-ui;color:#cdbf9a;background:#0b0f18cc;border:1px solid #2b6f86;border-radius:14px;padding:5px 12px;cursor:pointer;opacity:.75}#idleIntro .ib:hover{opacity:1}
#idleIntro .skip{right:14px}#idleIntro .snd{left:14px}#idleIntro.out{opacity:0}`;
  (document.head || document.documentElement).appendChild(css);
  function play(opts = {}) {
    if (cur) return cur.promise; const tone = opts.tone === 'epic' ? 'epic' : 'eerie', P = phone(), RM = reduce(), scenes = film(tone, P), total = scenes.reduce((a, s) => a + s.d, 0);
    const el = document.createElement('div'); el.id = 'idleIntro'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Id|le intro (press Esc to skip)'); el.dataset.tone = tone;
    const cv = document.createElement('canvas'); el.appendChild(cv); const g = cv.getContext('2d');
    const skipB = document.createElement('button'); skipB.className = 'ib skip'; skipB.textContent = 'skip ›'; el.appendChild(skipB);
    const sndB = document.createElement('button'); sndB.className = 'ib snd'; sndB.textContent = '🔊 sound'; el.appendChild(sndB);
    document.body.appendChild(el);
    let done = false, raf = 0, snd = null, start = performance.now(), res; const promise = new Promise(r => res = r);
    const elapsed = () => (performance.now() - start) / 1000;
    const startSound = () => { if (snd) return; snd = soundtrack(tone, RM ? 0 : Math.min(elapsed(), total)); };
    const audioReady = () => { const A = window.__audio; try { return A && !A.muted() && A.ctx().state === 'running'; } catch (e) { return false; } };
    const syncSndBtn = () => { const A = window.__audio; sndB.style.display = (!A || A.muted() || snd) ? 'none' : ''; };
    if (!RM) { if (audioReady()) startSound(); } syncSndBtn();
    sndB.addEventListener('click', e => { e.stopPropagation(); const A = window.__audio; if (!A) return; try { A.resume(); } catch (er) {} setTimeout(() => { startSound(); syncSndBtn(); }, 250); });
    const size = () => { const dpr = Math.min(devicePixelRatio || 1, P ? 1.5 : 2); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener('resize', size);
    const finish = (skipped) => { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); removeEventListener('resize', size);
      if (snd) snd.stop(skipped ? .3 : .9); const out = { tone, skipped };
      try { document.dispatchEvent(new CustomEvent('idle:intro', { detail: { phase: 'end', ...out } })); } catch (e) {}
      if (opts.keep && !skipped) { cur = { promise, el, close: () => { el.classList.add('out'); setTimeout(() => el.remove(), 650); cur = null; } }; keepAnim(); res(out); return; }
      el.classList.add('out'); setTimeout(() => { el.remove(); cur = null; res(out); }, skipped ? 350 : 650); };
    const onKey = e => { if (e.key === 'Escape' || !e.metaKey) { e.preventDefault(); e.stopPropagation(); finish(true); } };
    el.addEventListener('click', e => { if (e.target === sndB) return; finish(true); }); skipB.addEventListener('click', e => { e.stopPropagation(); finish(true); });
    addEventListener('keydown', onKey, true);
    const draw = (T) => { const W = innerWidth, H = innerHeight, B = frameOf(W, H); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      let acc = 0, i = 0; while (i < scenes.length - 1 && T >= acc + scenes[i].d) acc += scenes[i++].d; const sc = scenes[i], lt = T - acc;
      g.save(); g.beginPath(); g.rect(B.x, B.y, B.w, B.h); g.clip(); sc.draw.call(sc, g, B, lt); g.restore(); };
    function keepAnim() { const t0 = performance.now(); const loop = () => { if (!el.isConnected) return; const last = scenes[scenes.length - 1]; const W = innerWidth, H = innerHeight, B = frameOf(W, H);
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.save(); g.beginPath(); g.rect(B.x, B.y, B.w, B.h); g.clip(); last.draw.call(last, g, B, last.d + (performance.now() - t0) / 1000); g.restore(); requestAnimationFrame(loop); }; loop(); }
    if (RM) {   // reduced motion: four still frames, faded in and out, ~1.6 s each
      const picks = scenes.map((s, k) => ({ k, s })).filter(o => o.s.still != null).slice(-4), each = 1.7, T = picks.length * each;
      const loop = () => { if (done) return; const e = elapsed(); if (e >= T) return finish(false); const n = Math.floor(e / each), f = e - n * each, o = picks[n];
        let acc = 0; for (let k = 0; k < o.k; k++) acc += scenes[k].d; draw(acc + o.s.still); const a = Math.min(clamp(f / .35), clamp((each - f) / .35)); g.fillStyle = '#000'; g.globalAlpha = 1 - a; g.fillRect(0, 0, innerWidth, innerHeight); g.globalAlpha = 1;
        raf = requestAnimationFrame(loop); }; loop();
    } else { const loop = () => { if (done) return; const e = elapsed(); if (e >= total) { draw(total - .001); return finish(false); } draw(e); raf = requestAnimationFrame(loop); }; loop(); }
    try { document.dispatchEvent(new CustomEvent('idle:intro', { detail: { phase: 'start', tone, reduced: RM } })); } catch (e) {}
    cur = { promise, el, close: () => finish(true) }; return promise;
  }
  // recordings and tests: draw any moment of a film into a canvas, and render the soundtrack offline (WAV as base64)
  function render(tone, T, canvas) { const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, sc = film(tone === 'epic' ? 'epic' : 'eerie', false), B = frameOf(W, H);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); let acc = 0, i = 0; while (i < sc.length - 1 && T >= acc + sc[i].d) acc += sc[i++].d;
    g.save(); g.beginPath(); g.rect(B.x, B.y, B.w, B.h); g.clip(); sc[i].draw.call(sc[i], g, B, T - acc); g.restore(); }
  async function renderAudio(tone) { const dur = film(tone, false).reduce((a, s) => a + s.d, 0) + 1.5, sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr); soundtrack(tone, 0, oc);
    const buf = await oc.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); dv.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
    let bin = ''; const u8 = new Uint8Array(dv.buffer); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(bin); }
  window.__intro = { play, render, renderAudio, close: () => { if (cur) cur.close(); }, playing: () => !!cur && !!cur.el && cur.el.isConnected, off: qi === '0', tone: qi === 'epic' ? 'epic' : 'eerie', scenes: tone => film(tone === 'epic' ? 'epic' : 'eerie', false).map(s => s.d) };
  // debug and comparison: ?intro=eerie | ?intro=epic plays on load (the genesis flow, ?genesis, calls play() itself)
  if ((qi === 'eerie' || qi === 'epic') && !Q.has('genesis')) { const go = () => setTimeout(() => play({ tone: qi }), 300); if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); }
})();
