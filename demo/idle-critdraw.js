// idle-critdraw.js: how a creature is drawn and how its legs walk (moved out of arena.html on Oct 31, so the Id|le-pedia can play
// replays with the very same creatures). Bodies, IK legs, the keyline, the hiding pose, 💤 and 🫣, the hangry glow and the rave's dance
// poses, onto any 2D canvas. Nothing here reads the arena: a creature is a plain object ({ g: genome, x, y, heading, state, legs… });
// the arena says which one is selected (K.selected) and sets the keyline for each frame (keylineFrame(zoom, dark)); the looks
// (window.__looks) and the rave (window.__rave) are used when they are on the page.
(() => {
  const K = { selected: null };
  // ---------- legs: planted feet, two-bone IK, steps ----------
  function sizeUp(c) { const k = c.size || 1; c.gs = { ...c.g, l1: c.g.l1 * k, l2: c.g.l2 * k, bodyL: c.g.bodyL * k, bodyW: c.g.bodyW * k, step: c.g.step * k }; }
  function buildLegs(c) { sizeUp(c);
    const g = c.g, m = Math.max(1, Math.floor(g.legs / 2)); c.legs = [];
    for (let side of [-1, 1]) for (let k = 0; k < m; k++) { const L = { side, k, m, foot: null, swing: null, group: (k + (side > 0 ? 1 : 0)) % 2 }; c.legs.push(L); }
    c.legs.forEach(L => { L.foot = restSpot(c, L); });
  }
  function restSpot(c, L, extra) {
    const g = c.gs || c.g, reach = (g.l1 + g.l2) * (c.state === 'hide' && !(c.dashUntil > Date.now()) ? 0.3 : c.state === 'sleep' ? 0.45 : c.held ? 0.55 : 0.78);
    const along = L.m > 1 ? (L.k / (L.m - 1) - 0.5) : 0, fx = along * g.bodyL * 1.9 + along * reach * 0.55, fy = L.side * reach * (0.75 + 0.25 * Math.cos(along * Math.PI));
    const ca = Math.cos(c.heading), sa = Math.sin(c.heading), lead = c.held ? 0 : 7;
    let x = c.x + fx * ca - fy * sa + c.vx * lead, y = c.y + fx * sa + fy * ca + c.vy * lead;
    if (extra) { x += extra[0]; y += extra[1]; } return { x, y };
  }
  function hip(c, L) { const g = c.gs || c.g, along = L.m > 1 ? (L.k / (L.m - 1) - 0.5) : 0, hx = along * g.bodyL * 0.9, hy = L.side * g.bodyW * 0.42, ca = Math.cos(c.heading), sa = Math.sin(c.heading); return { x: c.x + hx * ca - hy * sa, y: c.y + hx * sa + hy * ca }; }
  function knee(H, F, l1, l2, side, heading) {   // two-bone IK, knee bent away from the body
    let dx = F.x - H.x, dy = F.y - H.y, d = Math.hypot(dx, dy) || 1e-6; const dd = Math.min(d, l1 + l2 - 0.01);
    const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), ux = dx / d, uy = dy / d;
    const s = side * (Math.sin(Math.atan2(uy, ux) - heading) >= 0 ? 1 : -1) >= 0 ? 1 : -1; return { x: H.x + ux * a - uy * h * s, y: H.y + uy * a + ux * h * s };
  }
  function stepLegs(c, t) {
    const moving = Math.hypot(c.vx, c.vy) > 0.15, inAir = c.legs.filter(L => L.swing).length, maxAir = Math.max(1, Math.floor(c.legs.length / 2));
    for (const L of c.legs) {
      if (L.swing) { const u = Math.min(1, (t - L.swing.t0) / L.swing.dur), e = u * u * (3 - 2 * u); L.foot = { x: L.swing.from.x + (L.swing.to.x - L.swing.from.x) * e, y: L.swing.from.y + (L.swing.to.y - L.swing.from.y) * e }; L.lift = Math.sin(u * Math.PI); if (u >= 1) { L.swing = null; L.lift = 0; L.justLanded = true; } continue; }
      if (c.held) { const r = restSpot(c, L, [Math.sin(t / 50 + L.k * 1.7 + L.side) * 9, Math.cos(t / 65 + L.k) * 9]); L.foot = { x: L.foot.x + (r.x - L.foot.x) * 0.35, y: L.foot.y + (r.y - L.foot.y) * 0.35 }; L.lift = 0.8; continue; }   // dangling, kicking
      const target = restSpot(c, L), lag = Math.hypot(target.x - L.foot.x, target.y - L.foot.y);
      const nbAir = c.legs.some(o => o !== L && o.swing && o.side === L.side && Math.abs(o.k - L.k) === 1);
      if (lag > (c.gs || c.g).step && !nbAir && inAir < maxAir && (moving ? L.group === (Math.floor(t / 140) % 2) : true)) L.swing = { from: { ...L.foot }, to: restSpot(c, L, [c.vx * 10, c.vy * 10]), t0: t, dur: 130 + 60 * Math.random() };
    }
    if (!moving && !c.held && c.state !== 'sleep' && t > c.nextFidget) {   // idle life: one leg re-plants or taps
      c.nextFidget = t + (900 + Math.random() * 2600) / Math.max(0.2, c.g.fidget); const L = c.legs[Math.floor(Math.random() * c.legs.length)];
      if (!L.swing) L.swing = { from: { ...L.foot }, to: restSpot(c, L, [(Math.random() - .5) * 10, (Math.random() - .5) * 10]), t0: t, dur: 160 + Math.random() * 120 };
    }
  }
  // ---------- drawing ----------
    // the keyline (Nico, Oct 31: creatures were "hard to see in the noise", charts everywhere): every body shape and the legs get a
    // thin outline under their own colours, so they read on the floor, on charts and on words, phones too. Light mode: a dark ink line.
    // Dark mode: a light line in the creature's own hue (a dark one measured worse there: it pulled them toward the dark floor).
    // KL.w is in world units but never thinner than ~1.3 screen px; KL.a is scaled per creature (shy ones keep only a faint one).
    const KL = { on: true, w: 1.5, col: 'rgba(10,11,16,.82)', a: 1, dk: false };
    const KLH = []; for (let i = 0; i < 24; i++) KLH.push(`hsla(${i * 15},85%,78%,.62)`);   // dark mode: one light keyline colour per 15° of hue
    function keylineFrame(z, dark) { z = z || 1; KL.dk = !!dark; KL.w = Math.min(4, Math.max(1.1, 1.3 / z)); KL.col = KL.dk ? KLH[0] : 'rgba(22,22,30,.62)'; }
    function keylineFor(c) { const LK = window.__looks; KL.a = LK && LK.ink ? LK.ink(c) : 1; if (KL.dk) { const h = ((c.gs || c.g).hue || 0); KL.col = KLH[Math.round(((h % 360) + 360) % 360 / 15) % 24]; } }
    const circ = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); };
    const ell = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); };
    const rrect = (g, x, y, w, h, r) => { w = Math.max(0, w); h = Math.max(0, h); g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))); else g.rect(x, y, w, h); };
    function fs(g, fill, stroke, lw) { if (fill && stroke && KL.on && KL.a > 0.02) { const a = g.globalAlpha; g.globalAlpha = a * KL.a; g.strokeStyle = KL.col; g.lineWidth = (lw ?? 1) + KL.w * 2; g.stroke(); g.globalAlpha = a; }
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw ?? 1; g.stroke(); } }
    const LP = [];   // leg points, reused (no allocation per frame)
    function legs(g, c, hp) { const G = c.gs || c.g; g.lineJoin = 'round'; g.lineCap = 'round'; let n = 0;
      for (const L of c.legs) { const H = hip(c, L), F0 = L.foot, F = hp ? { x: H.x + (F0.x - H.x) * (1 - 0.6 * hp.k), y: H.y + (F0.y - H.y) * (1 - 0.6 * hp.k) } : F0, K = knee(H, F, G.l1, G.l2, L.side, c.heading), lift = L.lift || 0;
        const q = LP[n] || (LP[n] = {}); q.hx = H.x; q.hy = H.y; q.kx = K.x + (K.x - H.x) * 0.12 * lift; q.ky = K.y + (K.y - H.y) * 0.12 * lift; q.fx = F.x; q.fy = F.y; q.l = lift; n++; }
      if (KL.on && KL.a > 0.02) { const a = g.globalAlpha; g.globalAlpha = a * KL.a; g.beginPath(); for (let i = 0; i < n; i++) { const q = LP[i]; g.moveTo(q.hx, q.hy); g.lineTo(q.kx, q.ky); g.lineTo(q.fx, q.fy); } g.strokeStyle = KL.col; g.lineWidth = 1.7 + KL.w * 2; g.stroke(); g.globalAlpha = a; }
      const ll = c.state === 'sleep' ? 55 : KL.dk ? 76 : 64;
      for (let i = 0; i < n; i++) { const q = LP[i]; g.beginPath(); g.moveTo(q.hx, q.hy); g.lineTo(q.kx, q.ky); g.lineTo(q.fx, q.fy); g.strokeStyle = `hsl(${G.hue},70%,${ll}%)`; g.lineWidth = 1.5 + 0.4 * q.l; g.stroke();
        circ(g, q.fx, q.fy, 1.8 + 1.4 * q.l); g.fillStyle = `hsl(${G.footHue},90%,72%)`; g.fill(); }
      g.lineJoin = 'miter'; g.lineCap = 'butt'; }
    function body(g, c, t) {   // the same shapes as bodySVG (kept for cards, the pedia and miniSVG)
      const G = c.gs || c.g, breathe = 1 + (c.state === 'sleep' ? 0.05 : 0.025) * Math.sin(t / (c.state === 'sleep' ? 900 : 380) + c.phase), L = G.bodyL * breathe, W = G.bodyW * breathe, BL = KL.dk ? 12 : 0;
      const sw = c.held ? Math.sin(t / 60) * 12 : Math.sin(t / 700 + c.phase) * 2.5; g.save(); g.translate(c.x, c.y); g.rotate(c.heading + sw * Math.PI / 180);
      if (G.abdomen) { ell(g, -L * 0.95, 0, L * 0.55, W * 0.55); fs(g, `hsl(${G.hue},25%,${18 + BL}%)`, `hsl(${G.hue},60%,72%)`, 0.8); }
      g.lineCap = 'round'; for (let p = 0; p < (G.palps || 0); p++) { const sd = p ? 1 : -1, a = 0.35 + 0.25 * Math.sin(t / 160 + p * 2 + c.phase); g.beginPath(); g.moveTo(L * 0.5, sd * W * 0.2); g.lineTo(L * 0.5 + 9 * Math.cos(a * sd), sd * W * 0.2 + sd * 9 * Math.sin(a)); g.strokeStyle = `hsl(${G.hue},70%,78%)`; g.lineWidth = 1.4; g.stroke(); } g.lineCap = 'butt';
      if (c.boost && c.boost.what === 'glow' && c.boost.until > Date.now()) { circ(g, 0, 0, Math.max(L, W) * 1.3); fs(g, `hsla(${G.hue},90%,65%,${0.18 + 0.08 * Math.sin(t / 150)})`); }
      if (c.sickUntil > Date.now()) { g.font = '12px system-ui,sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText('🤢', 0, -W - 6); g.textAlign = 'start'; }
      if (c.flash && performance.now() < c.flash.until) { const k = (c.flash.until - performance.now()) / 900; circ(g, 0, 0, Math.max(L, W) * (1.6 - k * 0.6)); fs(g, `hsla(${c.flash.how === 'big' ? 345 : c.flash.how === 'keep' ? 330 : 225},90%,60%,${0.35 * k})`); }
      if (G.wings) { const flap = Math.sin(t / (c.state === 'move' ? 45 : 160)) * 0.35 + 0.65; for (const sd of [-1, 1]) { g.save(); g.rotate(sd * 18 * Math.PI / 180); ell(g, -L * 0.1, sd * W * 0.9, L * 0.7, W * 0.9 * flap); fs(g, `hsla(${G.hue},80%,80%,.35)`, `hsl(${G.hue},70%,70%)`, 0.6); g.restore(); } }
      if (G.body === 'orb') { circ(g, 0, 0, Math.max(L, W) * 0.55); fs(g, `hsl(${G.hue},45%,${22 + BL}%)`, `hsl(${G.hue},70%,72%)`); circ(g, L * 0.18, 0, W * 0.22); fs(g, `hsl(${G.footHue},90%,70%)`); }
      else if (G.body === 'tri') { g.beginPath(); g.moveTo(L * 0.6, 0); g.lineTo(-L * 0.5, -W * 0.6); g.lineTo(-L * 0.5, W * 0.6); g.closePath(); fs(g, `hsl(${G.hue},40%,${25 + BL}%)`, `hsl(${G.hue},70%,72%)`); circ(g, L * 0.15, 0, 2.2); fs(g, '#ff5e5e'); }
      else if (G.body === 'seg') { for (let k = 2; k >= 0; k--) { circ(g, -k * L * 0.42, Math.sin(t / 200 + k) * 2, W * (0.5 - k * 0.08)); fs(g, `hsl(${G.hue},40%,${22 + BL + k * 6}%)`, `hsl(${G.hue},70%,72%)`, 0.8); } circ(g, L * 0.15, 0, 2); fs(g, '#ff5e5e'); }
      else if (G.body === 'star') { g.save(); g.rotate((t / 30 % 360) * Math.PI / 180); g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, R = k % 2 ? W * 0.3 : Math.max(L, W) * 0.6; const x = +(Math.cos(a) * R).toFixed(1), y = +(Math.sin(a) * R).toFixed(1); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); fs(g, `hsl(${G.hue},50%,${30 + BL}%)`, `hsl(${G.hue},80%,75%)`); g.restore(); }
      else if (G.body === 'chip') { rrect(g, -L / 2, -W / 2, L, W, 2); fs(g, BL ? '#45454d' : '#2e2e33', `hsl(${G.hue},60%,72%)`, 0.8); rrect(g, -L / 2 + 4, -W / 2 + 3, Math.max(0, L * 0.45), Math.max(0, W - 6), 1); fs(g, '#9fe3c5');
        const dur = c.state === 'sleep' ? 3000 : 1200, u = (performance.now() % dur) / dur; g.globalAlpha = 1 - 0.7 * (1 - Math.abs(1 - 2 * u)); circ(g, L / 2 - 4, 0, 2.2); fs(g, c.state === 'sleep' ? '#553' : '#ff5e5e'); g.globalAlpha = 1; }   // the status light blinks (1 → .3 → 1)
      else { const blink = (Math.floor(t / 2600 + c.phase) % 5 === 0 && (t % 2600) < 140) || c.state === 'sleep'; rrect(g, -L / 2, -W / 2, L, W, 4); fs(g, `hsl(${G.hue},90%,82%)`, `hsl(${G.hue},55%,48%)`);
        if (blink) { g.beginPath(); g.moveTo(L * 0.05, -W * 0.18); g.lineTo(L * 0.05 + 4, -W * 0.18); g.moveTo(L * 0.05, W * 0.18 - 2); g.lineTo(L * 0.05 + 4, W * 0.18 - 2); g.strokeStyle = '#333'; g.lineWidth = 1.3; g.stroke(); }
        else { circ(g, L * 0.1, -W * 0.18, 2.2); fs(g, '#333'); circ(g, L * 0.1, W * 0.18, 2.2); fs(g, '#333'); }
        g.save(); g.translate(L / 2, 0); g.rotate((c.chopUntil > t ? Math.sin(t / 30) * 20 : 0) * Math.PI / 180); g.beginPath(); g.moveTo(0, -W * 0.25); g.lineTo(7, -W * 0.25 - 5); g.moveTo(0, W * 0.25); g.lineTo(7, W * 0.25 + 5); g.strokeStyle = `hsl(${G.hue},60%,32%)`; g.lineWidth = 2.2; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt'; g.restore(); }
      if (c._dz && window.__looks) window.__looks.dazzle(g, c, L, W);
      if (K.selected && c === K.selected()) { circ(g, 0, 0, Math.max(L, W) * 0.9 + 6); g.setLineDash([4, 4]); g.globalAlpha = 0.8; fs(g, null, '#2b5cff', 1.2); g.setLineDash([]); g.globalAlpha = 1; }
      g.restore(); }
    function hangryGlow(g, c, t) { const r = (Math.max(c.g.bodyL, c.g.bodyW) + 26) * (c.size || 1) * (1 + 0.15 * Math.sin(t / 80)), gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      gr.addColorStop(0, 'rgba(255,74,18,.6)'); gr.addColorStop(0.6, 'rgba(255,122,31,.25)'); gr.addColorStop(1, 'rgba(255,122,31,0)'); circ(g, c.x, c.y, r); g.fillStyle = gr; g.fill(); }
    // 💤 and 🫣 as pre-rendered sprites (render trim, Oct 30): an emoji fillText per sleeper per frame was slow without a GPU
    const EMO = {}; function emo(ch) { let e = EMO[ch]; if (e) return e; const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.font = `${S * 0.78}px system-ui,sans-serif`; x.textBaseline = 'alphabetic'; x.textAlign = 'center'; x.fillStyle = '#000'; x.fillText(ch, S / 2, S * 0.8);
      return EMO[ch] = { cv, S }; }   // drawn as if by fillText at (x, baseline) with the given px size: the glyph box sits from 0.8 em above the baseline
    function emoAt(g, ch, x, y, px, center) { if (window.__emojiText) { g.font = `${px}px system-ui,sans-serif`; g.fillStyle = '#000'; if (center) g.textAlign = 'center'; g.fillText(ch, x, y); if (center) g.textAlign = 'start'; return; }
      const e = emo(ch), k = px / (e.S * 0.78), w = e.S * k, cx = center ? x : x + px * 0.6; g.drawImage(e.cv, cx - w / 2, y - e.S * 0.8 * k, w, w); }   // start-aligned text: the glyph's middle is about 0.6 em right of x
    function zz(g, c, t) { const top = c.y - (Math.max(c.g.bodyL, c.g.bodyW) + 14) * (c.size || 1), ph = ((t / 2600) + (c.g.hue || 0) / 360) % 1;
      for (const o of [0, 0.5]) { const p = (ph + o) % 1; g.globalAlpha = +(Math.sin(p * Math.PI) * 0.9).toFixed(2); emoAt(g, '💤', c.x + 8 + p * 10, top - p * 22, 15 + p * 7, false); } g.globalAlpha = 1; }
    // hiding: the one pose for every renderer (k fades in over 0.6 s once it reaches cover): legs and body pulled in, dimmer, trembling
    function hidePose(c) { if (c.state !== 'hide' || c.dashUntil > Date.now()) return null; const k = Math.max(0, Math.min(1, (Date.now() - Math.max(c.dashUntil || 0, c.hideT || 0)) / 600));
      return { k, s: 1 - 0.24 * k, a: 1 - 0.45 * k, jx: (Math.random() - .5) * 1.4 * k, jy: (Math.random() - .5) * 1.0 * k }; }
    function peek(g, c, t, k) { const top = c.y - (Math.max(c.g.bodyL, c.g.bodyW) + 10) * (c.size || 1); g.globalAlpha = 0.9 * k; emoAt(g, '🫣', c.x, top + Math.sin(t / 240) * 1.5, 16, true); g.globalAlpha = 1; }
    // rave mode: a beat-synced dance per body (chips bob, triangles spin, orbs bounce, long legs high-step, the rest sway); idle-rave.js sets c.dance
    function dancePose(g, c) { const d = c.dance, R = window.__rave; if (!d || (!R && c._beat == null)) return; const ph = c._beat != null ? c._beat : R.phase(), k = d.k ?? 1, s = c.size || 1, hit = Math.pow(1 - ph, 3);
      if (d.style === 'spin') { const a = (d.turn || 0) + hit * 0.9 * k; g.translate(c.x, c.y); g.rotate(a); g.translate(-c.x, -c.y); }
      else if (d.style === 'bounce') { const y = -Math.abs(Math.sin(ph * Math.PI)) * 9 * k * s, sq = 1 + 0.12 * hit * k; g.translate(c.x, c.y + y); g.scale(sq, 2 - sq); g.translate(-c.x, -c.y); }
      else if (d.style === 'high') { const y = -Math.max(0, Math.sin(ph * Math.PI * 2)) * 7 * k * s; g.translate(0, y); }
      else if (d.style === 'bob') g.translate(0, hit * 5 * k * s);
      else if (d.style === 'mosh') g.translate((Math.random() - .5) * 5 * k, hit * 4 * k);
      else if (d.style === 'ears') g.translate((Math.random() - .5) * 1.2, 0);
      else { const a = Math.sin(ph * Math.PI * 2) * 0.16 * k; g.translate(c.x, c.y); g.rotate(a); g.translate(-c.x, -c.y); } }
    // the same drawing onto another canvas (reel replays): body, legs, hiding pose, 💤/🫣, hangry glow
    function drawTo(g, c, t, hg) { const hp = hidePose(c); g.save(); if (hg) hangryGlow(g, c, t); if (c.dance && !hp) dancePose(g, c);
      if (hp) { g.globalAlpha = hp.a; g.translate(c.x + hp.jx, c.y + hp.jy); g.scale(hp.s, hp.s); g.translate(-c.x, -c.y); }
      keylineFor(c); if (window.__looks) window.__looks.pre(g, c, t, true); legs(g, c, hp); body(g, c, t); if (window.__hwDraw) window.__hwDraw(g, c, t); g.restore(); g.save(); if (c.state === 'sleep') zz(g, c, t); else if (hp) peek(g, c, t, hp.k); g.restore(); }
  Object.assign(K, { sizeUp, buildLegs, restSpot, hip, knee, stepLegs, circ, ell, rrect, fs, legs, body, hangryGlow, emoAt, zz, hidePose, peek, dancePose, drawTo, keylineFrame, keylineFor, KL });
  window.__critDraw = K;
})();
