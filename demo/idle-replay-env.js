// idle-replay-env.js: the world around a replay (Oct 31, Nico: "the clips in the reels still have no weather/environment, just
// creatures and objects"). A clip's env carries a few numbers about its surroundings, and this draws them on a canvas:
//   ground    the world features near the moment (packet streams, latency wells, 404 holes, caches), in the clip's own coordinates
//   daylight  the day cycle's tint at that moment (the same colours as the live #daylight layer)
//   weather   the particles of its weather with that weather's own faders (amount, speed, size, glyphs, slant, direction, thickness)
// Nothing here reads the arena: the canvas, the clip's env and the camera come in as arguments, so the same drawing can play a clip
// anywhere (a pedia page, say) once the creature and word drawing travel with it.
(() => {
  const inkOf = dk => dk ? '170,190,255' : '43,92,255';

  // ground: drawn in world space (the caller has set the clip's camera transform), the way featuresSVG draws them live
  function ground(g, gr, t, dk, K) { if (!gr || !gr.length) return; const ink = inkOf(dk), kin = dk ? '#fff' : '#000', kpa = dk ? '#000' : '#fff';
    g.save(); g.font = '10px ui-monospace,Menlo,monospace'; g.textBaseline = 'alphabetic';
    for (const f of gr) {
      if (f.t === 'stream') { const ca = Math.cos(f.a || 0), sa = Math.sin(f.a || 0), x1 = f.x - ca * f.len / 2, y1 = f.y - sa * f.len / 2, x2 = f.x + ca * f.len / 2, y2 = f.y + sa * f.len / 2;
        g.lineCap = 'round'; g.strokeStyle = K ? 'rgba(128,128,128,.18)' : `rgba(${ink},.10)`; g.lineWidth = f.wdt || 30; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.lineCap = 'butt'; g.strokeStyle = K ? kin : `rgba(${ink},.45)`; g.lineWidth = 2; g.setLineDash([2, 14]); g.lineDashOffset = (t / 25) % 16; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); }
      else if (f.t === 'well') { g.setLineDash([1, 6]); for (let k = 0; k < 3; k++) { g.strokeStyle = K ? kin : `rgba(${ink},${(0.10 + 0.05 * k).toFixed(2)})`; g.lineWidth = 1; g.beginPath(); g.arc(f.x, f.y, Math.max(1, f.r * (0.4 + 0.3 * k) + Math.sin(t / 600 + k) * 3), 0, 7); g.stroke(); } g.setLineDash([]);
        g.fillStyle = K ? kin : `rgba(${ink},.45)`; g.textAlign = 'center'; g.fillText(`latency ${Math.round(f.r * 3)}ms`, f.x, f.y + 4); }
      else if (f.t === 'hole') { g.globalAlpha = 0.85; g.fillStyle = K ? kin : dk ? '#000' : '#222'; g.beginPath(); g.arc(f.x, f.y, f.r + Math.sin(t / 200) * 1.5, 0, 7); g.fill(); g.globalAlpha = 1;
        g.font = '8px ui-monospace,Menlo,monospace'; g.fillStyle = K ? kpa : '#ff6a6a'; g.textAlign = 'center'; g.fillText('404', f.x, f.y + 3); g.font = '10px ui-monospace,Menlo,monospace'; }
      else if (f.t === 'cache') { const x0 = f.x - f.w / 2, y0 = f.y - f.h / 2; g.beginPath(); if (g.roundRect) g.roundRect(x0, y0, f.w, f.h, 10); else g.rect(x0, y0, f.w, f.h);
        if (!K) { g.fillStyle = `rgba(${ink},.05)`; g.fill(); } g.strokeStyle = K ? kin : `rgba(${ink},.25)`; g.lineWidth = 1; g.setLineDash([6, 4]); g.stroke(); g.setLineDash([]);
        g.font = '9px ui-monospace,Menlo,monospace'; g.fillStyle = K ? kin : `rgba(${ink},.5)`; g.textAlign = 'left'; g.fillText('cache · no wind', x0 + 8, y0 + 14); g.font = '10px ui-monospace,Menlo,monospace'; } }
    g.restore(); }

  // daylight: 0 dawn, .25 noon, .5 dusk, .75 midnight (the same tint as the arena's DayCycle)
  function tint(p, dk) { if (p < 0.1) return `rgba(255,150,80,${0.12 * (1 - p / 0.1)})`; if (p < 0.4) return 'rgba(0,0,0,0)'; if (p < 0.55) return `rgba(255,120,60,${0.15 * (p - 0.4) / 0.15})`; if (p < 0.95) return `rgba(10,20,70,${(dk ? 0.35 : 0.3) * Math.min(1, (p - 0.55) / 0.08)})`; return `rgba(80,60,120,${0.25 * (1 - (p - 0.95) / 0.05)})`; }
  function daylight(g, W, H, day, dk) { if (!day || day.p == null) return; const c = tint(day.p, dk); if (c === 'rgba(0,0,0,0)') return; g.fillStyle = c; g.fillRect(0, 0, W, H); }

  // weather particles in screen space. st is the caller's state ({ rng } to start with; the particles live in st.p).
  // o: { z, cxw, cyw, K (the keep's 1-bit look), dk, paused, light (phones: no particles) }
  const BASE = { bitrain: 140, storm: 220, wind: 60, fog: 7, static: 0, hum: 0 };
  function weather(st, g, W, H, t, w, o) { if (!w || !w.kind || w.kind === 'clear' || o.light) return; const rng = st.rng || Math.random, kind = w.kind, k = w.k || 0.35, P = w.P || {}, K = o.K, dk = o.dk;
    const ink = dk ? '160,190,255' : '43,92,255', kin = dk ? '#fff' : '#000', kpa = dk ? '#000' : '#fff', sp = P.speed ?? 1, sz = P.size ?? 1, base = kind === 'static' && K ? 120 : BASE[kind] || 0;
    const glyph = () => { const gl = P.glyph | 0; return gl === 1 ? '0123456789abcdef'[rng() * 16 | 0] : gl === 2 ? 'abcdefghijklmnopqrstuvwxyz'[rng() * 26 | 0] : rng() < 0.5 ? '0' : '1'; };
    if (!st.p || st.kind !== kind || st.W !== W || st.H !== H) { const n = Math.round(base * k * (P.amount ?? 1) * Math.max(0.6, Math.min(2, W * H / (1400 * 800)))); st.kind = kind; st.W = W; st.H = H; st.p = Array.from({ length: n }, () => ({ x: rng() * W, y: rng() * H, v: 0.5 + rng(), c: glyph(), r: 80 + rng() * 160, big: rng() < 0.25, ph: rng() * 9 })); }
    const mv = o.paused ? 0 : 1, Pp = st.p;
    if (kind === 'bitrain') { const sl = P.slant || 0; if (K) { for (const p of Pp) { p.y += 3.4 * p.v * sp * mv; p.x += 3.4 * p.v * sp * sl * mv; if (p.y > H) { p.y = -14; p.x = rng() * W; } if (p.x > W + 10) p.x -= W + 20; else if (p.x < -10) p.x += W + 20; const x = Math.round(p.x), y = Math.round(p.y); g.fillStyle = kpa; g.fillRect(x - 2, y - 1, 6, 16); g.fillStyle = kin; g.fillRect(x, y, 2, 14); } }
      else { g.font = Math.round(11 * sz) + 'px ui-monospace,Menlo,monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; for (const p of Pp) { p.y += 2.2 * p.v * sp * mv; p.x += 2.2 * p.v * sp * sl * mv; if (p.y > H) { p.y = -10; p.x = rng() * W; p.c = glyph(); } if (p.x > W + 10) p.x -= W + 20; else if (p.x < -10) p.x += W + 20; g.fillStyle = `rgba(${ink},${(0.12 + 0.2 * p.v * k).toFixed(3)})`; g.fillText(p.c, p.x, p.y); } } }
    else if (kind === 'storm') { const sl = P.slant ?? w.sl ?? 0.28; for (const p of Pp) { p.y += 9 * p.v * sp * mv; p.x += 9 * p.v * sp * sl * mv; if (p.y > H) { p.y = -10; p.x = rng() * W; } if (p.x > W + 10) p.x -= W + 20; else if (p.x < -10) p.x += W + 20;
        if (K) { const x = Math.round(p.x), y = Math.round(p.y); g.fillStyle = kpa; for (let j = -1; j <= 11; j++) g.fillRect(Math.round(x + j * sl * 2) - 2, y + j * 2, 6, 2); g.fillStyle = kin; for (let j = 0; j < 11; j++) g.fillRect(Math.round(x + j * sl * 2), y + j * 2, 2, 2); }
        else { g.strokeStyle = `rgba(${ink},${(0.18 + 0.2 * k).toFixed(3)})`; g.lineWidth = sz; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 12 * sl, p.y - 12); g.stroke(); } } }
    else if (kind === 'static') { if (K) { for (const p of Pp) { p.y += p.v * mv * 1.4; p.x += Math.sin(t / 900 + p.ph) * 0.35 * mv; if (p.y > H + 3) { p.y = -3; p.x = rng() * W; } const s = p.big ? 6 : 4, x = Math.round(p.x), y = Math.round(p.y); g.fillStyle = kin; g.fillRect(x - 2, y - 2, s + 4, s + 4); g.fillStyle = '#fff'; g.fillRect(x, y, s, s); } }
      else { const n = Math.round(500 * k * (P.amount ?? 1) * W * H / (1400 * 800)), gs = 1.5 * sz; g.fillStyle = `rgba(${dk ? '255,255,255' : '0,0,0'},${(0.18 * k + 0.05).toFixed(3)})`; for (let i = 0; i < n; i++) g.fillRect(Math.random() * W, Math.random() * H, gs, gs); } }
    else if (kind === 'fog') { const th = P.thick ?? 1; for (const p of Pp) { p.x += 0.15 * p.v * sp * mv; const r = p.r * sz; if (p.x - r > W) p.x = -r; if (K) { g.fillStyle = kin; g.globalAlpha = 0.13; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.45, 0, 0, 7); g.fill(); g.globalAlpha = 1; } else { const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); gr.addColorStop(0, `rgba(${dk ? '200,200,220' : '150,150,170'},${Math.min(0.9, 0.16 * k * th).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(p.x - r, p.y - r, 2 * r, 2 * r); } } }
    else if (kind === 'wind') { const a = (P.dir ?? -1) >= 0 ? P.dir * Math.PI / 180 : 0, ca = Math.cos(a), sa = Math.sin(a); g.strokeStyle = K ? kin : `rgba(${ink},${(0.12 + 0.15 * k).toFixed(3)})`; g.lineWidth = K ? 2 : sz; if (K) g.setLineDash([10, 4]);
      for (const p of Pp) { const s2 = 7 * p.v * (0.5 + k) * sp * mv; p.x += ca * s2; p.y += sa * s2; if (p.x > W + 40 || p.x < -40 || p.y > H + 40 || p.y < -40) { p.x = ca > 0 ? -30 : W + 30; p.y = rng() * H; if (Math.abs(sa) > 0.7) { p.y = sa > 0 ? -30 : H + 30; p.x = rng() * W; } } g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - ca * 30 * p.v * sz, p.y - sa * 30 * p.v * sz); g.stroke(); } g.setLineDash([]); }
    else if (kind === 'hum') { const a = 0.04 + 0.04 * Math.sin(t / 300 * (P.pulse ?? 1)), s = (P.grid ?? 48) * o.z; if (s > 6) { g.strokeStyle = K ? kin : `rgba(${ink},${Math.min(1, a * (0.5 + k) * (P.bright ?? 1)).toFixed(3)})`; g.globalAlpha = K ? 0.25 : 1; g.lineWidth = 1; const ox = ((W / 2 - o.cxw * o.z) % s + s) % s, oy = ((H / 2 - o.cyw * o.z) % s + s) % s; g.beginPath(); for (let x = ox; x < W; x += s) { g.moveTo(x, 0); g.lineTo(x, H); } for (let y = oy; y < H; y += s) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.globalAlpha = 1; } } }

  // what a clip keeps of the weather's faders: the numbers only, two decimals
  const faders = P => { const o = {}; for (const [k, v] of Object.entries(P || {})) if (typeof v === 'number' && isFinite(v)) o[k] = +v.toFixed(2); return o; };

  window.__replayEnv = { ground, daylight, tint, weather, faders };
})();
