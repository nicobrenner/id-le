// idle-build.js: solid objects and the spaces creatures build with them (issue #28). Each world (Home and Gloamhold) has
// objects in its own style: crates of bits, word-bricks, data boulders and server racks at home; stones, crates, bricks and
// pillars in 1-bit in the keep. They are solid: creatures slide along them and steer round what is ahead (a spatial grid,
// no pathfinding, so it costs the same at 1,000 creatures), with a short detour when one is stuck behind a corner.
// Small ones can be carried and pushed (by big creatures, strong wind, tornados, a volcano opening); big ones stay put.
// You can drag any object; one you moved stays where you put it (creatures leave it alone), and 📌 pins any object.
// Architects gather loose small objects (or press a long word into a brick) and carry them, one at a time, into structures:
// a hut with a door (a shelter: scares are rarer inside, fear fades fast, and scared creatures run for it), a pen (a quiet
// room: loners like it, tiredness drops), a wall (a windbreak: no wind push in its lee) and a bench by the lake (a seat).
// Finished ones get a name; building shows in diaries, the Gazette, the almanac and replays. Everything is kept per world,
// in this browser and in snapshots, and merges never drop an object.
(() => {
  // the drawing of objects and finished buildings needs nothing from the arena, so a page without it (the pedia's replays) still gets __build.drawTo
  let g = null;
  const DEF = { crate: { w: 34, h: 26, small: 1, name: 'crate of bits' }, brick: { w: 42, h: 18, small: 1, name: 'word-brick' }, stone: { w: 30, h: 24, small: 1, name: 'stone' },
    rock: { w: 80, h: 54, small: 0, name: 'data boulder' }, rack: { w: 44, h: 86, small: 0, name: 'server rack' }, pillar: { w: 46, h: 46, small: 0, name: 'pillar' } };
  const half = o => { const d = DEF[o.k] || DEF.crate, r = o.rot === 90; return [(r ? d.h : d.w) / 2, (r ? d.w : d.h) / 2]; };
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; const pats = {};
  const dither = (lvl, col) => { const k = lvl + col; if (pats[k]) return pats[k]; const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = col; for (let i = 0; i < 16; i++) if (B4[i] < lvl) x.fillRect(i % 4, i >> 2, 1, 1); return (pats[k] = g.createPattern(c, 'repeat')); };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  function drawObj(o, x, y, keep, dark, ts) { const d = DEF[o.k] || DEF.crate, [hw, hh] = half(o), X = x - hw, Y = y - hh, w = hw * 2, h = hh * 2;
    if (keep) { const ink = dark ? '#fff' : '#000', paper = dark ? '#000' : '#fff'; g.lineWidth = 2; g.strokeStyle = ink;
      if (o.k === 'stone' || o.k === 'rock') { rr(X, Y, w, h, 10); g.fillStyle = paper; g.fill(); g.fillStyle = dither(o.k === 'rock' ? 6 : 4, ink); g.fill(); g.stroke(); }
      else if (o.k === 'pillar') { g.fillStyle = paper; g.fillRect(X, Y, w, h); g.strokeRect(X, Y, w, h); g.strokeRect(X + 7, Y + 7, w - 14, h - 14); g.fillStyle = dither(3, ink); g.fillRect(X + 9, Y + 9, w - 18, h - 18); }
      else if (o.k === 'brick') { g.fillStyle = paper; g.fillRect(X, Y, w, h); g.fillStyle = dither(5, ink); g.fillRect(X, Y, w, h); g.strokeRect(X, Y, w, h); if (o.word) { g.fillStyle = paper; g.fillRect(x - 15, y - 5, 30, 10); g.fillStyle = ink; g.font = '9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.word.slice(0, 6), x, y + 0.5); } }
      else { g.fillStyle = paper; g.fillRect(X, Y, w, h); g.strokeRect(X, Y, w, h); g.beginPath(); g.moveTo(X, Y); g.lineTo(X + w, Y + h); g.moveTo(X + w, Y); g.lineTo(X, Y + h); g.stroke(); }
      return; }
    g.lineWidth = 1.2;
    if (o.k === 'crate') { rr(X, Y, w, h, 3); g.fillStyle = dark ? 'hsl(32,32%,30%)' : 'hsl(34,48%,72%)'; g.fill(); g.strokeStyle = dark ? 'hsl(32,40%,55%)' : 'hsl(30,40%,42%)'; g.stroke(); g.beginPath(); g.moveTo(X + 3, Y + h / 2); g.lineTo(X + w - 3, Y + h / 2); g.stroke(); g.font = '7px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = dark ? 'hsla(32,60%,80%,.7)' : 'hsla(30,50%,30%,.6)'; g.fillText('0110', x, y - h / 4 + 1); g.fillText('1001', x, y + h / 4); }
    else if (o.k === 'brick') { rr(X, Y, w, h, 2); g.fillStyle = dark ? 'hsl(10,42%,36%)' : 'hsl(12,58%,58%)'; g.fill(); g.strokeStyle = dark ? 'hsl(10,45%,58%)' : 'hsl(10,50%,40%)'; g.stroke(); g.font = '600 9px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = dark ? 'hsl(20,70%,88%)' : '#fff8'; g.fillText((o.word || 'brick').slice(0, 7), x, y + 0.5); }
    else if (o.k === 'rock') { g.beginPath(); g.ellipse(x, y, hw, hh, 0, 0, 7); g.fillStyle = dark ? 'hsl(215,10%,30%)' : 'hsl(215,10%,74%)'; g.fill(); g.strokeStyle = dark ? 'hsl(215,14%,52%)' : 'hsl(215,10%,52%)'; g.stroke(); g.font = '9px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = dark ? 'hsla(210,30%,85%,.45)' : 'hsla(215,25%,30%,.45)'; g.fillText('{ 0 1 }', x, y - 6); g.fillText('1 0 1', x + 4, y + 8); }
    else if (o.k === 'rack') { rr(X, Y, w, h, 3); g.fillStyle = dark ? '#1b1f26' : '#2c323c'; g.fill(); g.strokeStyle = dark ? '#556' : '#111'; g.stroke(); for (let i = 0; i < 6; i++) { const yy = Y + 7 + i * (h - 12) / 6; g.fillStyle = dark ? '#2a303a' : '#3a414d'; g.fillRect(X + 4, yy, w - 8, (h - 12) / 6 - 3); for (let j = 0; j < 3; j++) { const on = Math.sin(ts / (300 + j * 170 + i * 90) + i * 2 + j + o.x) > 0.2; g.fillStyle = on ? (j === 2 ? '#f6b73c' : '#3ddc84') : '#0006'; g.fillRect(X + 7 + j * 5, yy + 3, 3, 3); } } }
    else { rr(X, Y, w, h, 6); g.fillStyle = dark ? '#555' : '#bbb'; g.fill(); }
    if (o.pin) { g.font = '11px system-ui'; g.textAlign = 'center'; g.fillText('📌', x + hw - 2, y - hh + 2); } }
  function drawTo(g2, ob, dark, keep, ts) { if (!ob) return; const g0 = g; g = g2; try { const ink = keep ? (dark ? '#fff' : '#000') : dark ? 'rgba(230,200,150,.75)' : 'rgba(110,70,30,.7)';
      for (const s of ob.s || []) { const I = s.i; if (!I) continue; g.fillStyle = keep ? dither(2, ink) : dark ? 'rgba(240,200,140,.07)' : 'rgba(170,120,60,.08)'; if (s.k === 'pen') { g.beginPath(); g.ellipse(I[0], I[1], I[2], I[3], 0, 0, 7); g.fill(); } else g.fillRect(I[0], I[1], I[2] - I[0], I[3] - I[1]); }
      for (const [k, x, y, rot, word] of ob.o || []) drawObj({ k, rot, word }, x, y, keep, dark, ts);
      for (const s of ob.s || []) { if (!s.n) continue; g.font = keep ? '12px monospace' : 'italic 11px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = ink; g.fillText(s.n, s.x, s.k === 'hut' ? s.y + 62 : s.k === 'pen' ? s.y + 96 : s.k === 'bench' ? s.y + 26 : s.y + (s.v ? 108 : 30)); }
    } finally { g = g0; } }
  const H = () => window.__buildHooks; if (!H()) { window.__build = window.__build || { drawTo }; return; }
  const now = () => Date.now(), pick = a => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = () => window.__places, placeId = () => (P() && P().cur && P().cur()) || 'home', kind = () => placeId() === 'home' ? 'home' : (P() && P().kind && P().kind()) || 'page';
  const active = () => ['home', 'keep'].includes(kind());
  const KEY = 'arena.build';
  const ST = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } })();
  for (const S of Object.values(ST)) for (const o of S.objs || []) { o.carriedBy = null; o.busy = null; }   // carrying is a moment, not a state
  let dirtyT = 0; const save = () => { dirtyT = dirtyT || now(); };
  setInterval(() => { if (!dirtyT) return; dirtyT = 0; try { localStorage.setItem(KEY, JSON.stringify(ST, (k, v) => k === 'carriedBy' || k === 'busy' ? undefined : v)); } catch (e) {} }, 3000);
  addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(ST, (k, v) => k === 'carriedBy' || k === 'busy' ? undefined : v)); } catch (e) {} });
  const cur = () => active() ? (ST[placeId()] = ST[placeId()] || { objs: [], structs: [], seeded: 0, arch: 0, n: 0 }) : null;
  const W = () => H().space().W, Hh = () => H().space().H, wdx = (a, b) => H().wd(a, b, W()), wdy = (a, b) => H().wd(a, b, Hh());
  const mod = (v, L) => ((v % L) + L) % L;

  // ---------- what there is ----------
  const KINDS = { home: { small: ['crate', 'crate', 'brick'], big: ['rock', 'rack'] }, keep: { small: ['stone', 'crate', 'brick'], big: ['pillar', 'rock'] } };
  const small = o => (DEF[o.k] || {}).small;
  const free = o => small(o) && !o.pin && !o.you && !o.sid && !o.carriedBy;   // building material
  function mkObj(S, k, x, y, extra) { const o = { id: 'o' + (++S.n) + now().toString(36).slice(-3), k, x: Math.round(mod(x, W())), y: Math.round(y), rot: 0, t: now(), ...(extra || {}) }; S.objs.push(o); dirty = true; save(); return o; }

  // ---------- the grid: objects by cell, rebuilt when something moved ----------
  const C = 160; let grid = new Map(), dirty = true, gridT = 0, gridPlace = '';
  function ensureGrid() { const t = performance.now(), id = placeId(); if (!dirty && id === gridPlace && t - gridT < 1000) return; dirty = false; gridT = t; gridPlace = id; grid = new Map(); const S = ST[id]; if (!S) return; const nx = Math.max(1, Math.ceil(W() / C)), ny = Math.max(1, Math.ceil(Hh() / C));
    for (const o of S.objs) { if (o.carriedBy) continue; const [hw, hh] = half(o); for (let gx = Math.floor((o.x - hw) / C); gx <= Math.floor((o.x + hw) / C); gx++) for (let gy = Math.floor((o.y - hh) / C); gy <= Math.floor((o.y + hh) / C); gy++) { const k = mod(gx, nx) + ',' + mod(gy, ny); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(o); } } }
  function around(x, y) { const nx = Math.max(1, Math.ceil(W() / C)), ny = Math.max(1, Math.ceil(Hh() / C)), gx = Math.floor(mod(x, W()) / C), gy = Math.floor(mod(y, Hh()) / C), out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get(mod(gx + i, nx) + ',' + mod(gy + j, ny)); if (a) for (const o of a) if (!out.includes(o)) out.push(o); } return out; }
  const inRect = (o, x, y, pad) => { const [hw, hh] = half(o); return Math.abs(wdx(o.x, x)) < hw + pad && Math.abs(wdy(o.y, y)) < hh + pad; };
  const hitAt = (x, y, pad) => { for (const o of around(x, y)) if (inRect(o, x, y, pad)) return o; return null; };

  // ---------- structures: where the pieces go ----------
  const SUF = { hut: ['Hut', 'Lodge', 'Cabin', 'Hall', 'Booth'], pen: ['Pen', 'Nook', 'Quiet Room', 'Circle', 'Ring'], wall: ['Wall', 'Windbreak', 'Rampart', 'Fence'], bench: ['Bench', 'Seat', 'Perch'] };
  const A = { hut: 'a hut', pen: 'a pen', wall: 'a wall', bench: 'a bench' }, R = { hut: 112, pen: 108, wall: 112, bench: 60 };
  function slotsFor(k, x, y, vert) {
    if (k === 'hut') return { slots: [[-57, -62], [-19, -62], [19, -62], [57, -62], [-78, -30], [-78, 4], [78, -30], [78, 4], [-57, 38], [57, 38]].map(([a, b]) => ({ x: x + a, y: y + b, rot: 0 })), inner: { x0: x - 60, y0: y - 48, x1: x + 60, y1: y + 24 }, door: { x, y: y + 80 } };
    if (k === 'pen') { const out = []; for (let i = 0; i < 11; i++) { const a = Math.PI / 2 + (i + 0.5) / 11 * Math.PI * 2; if (i === 10) continue; out.push({ x: x + Math.cos(a) * 88, y: y + Math.sin(a) * 70, rot: 0 }); } return { slots: out, inner: { cx: x, cy: y, rx: 62, ry: 46 }, door: { x, y: y + 108 } }; }
    if (k === 'wall') return { slots: [-2, -1, 0, 1, 2].map(i => vert ? { x, y: y + i * 36, rot: 90 } : { x: x + i * 40, y, rot: 0 }), vert: !!vert };
    if (k === 'bench') return { slots: [{ x: x - 22, y, rot: 0 }, { x: x + 22, y, rot: 0 }] };
    return { slots: [] }; }
  const insideS = (s, x, y) => { const I = s.inner; if (!I) return false; if (I.rx) { const a = wdx(I.cx, x) / I.rx, b = wdy(I.cy, y) / I.ry; return a * a + b * b <= 1; } const dx = wdx(s.x, x), dy = wdy(s.y, y); return dx > I.x0 - s.x && dx < I.x1 - s.x && dy > I.y0 - s.y && dy < I.y1 - s.y; };
  const zoneS = (s, x, y) => { if (s.kind === 'bench') return Math.hypot(wdx(s.x, x), wdy(s.y - 30, y)) < 55; return insideS(s, x, y); };
  const filled = (S, s) => s.slots.every(sl => sl.oid && S.objs.some(o => o.id === sl.oid && o.sid === s.id && !o.carriedBy));
  function detach(S, o) { if (!o.sid) return; const s = S.structs.find(q => q.id === o.sid); if (s) for (const sl of s.slots) if (sl.oid === o.id) sl.oid = null; o.sid = null; o.slot = null; }
  function interiorPt(s) { const I = s.inner; if (!I) return { x: s.x, y: s.y - 30 }; if (I.rx) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.7; return { x: I.cx + Math.cos(a) * I.rx * r, y: I.cy + Math.sin(a) * I.ry * r }; } return { x: I.x0 + 18 + Math.random() * (I.x1 - I.x0 - 36), y: I.y0 + 14 + Math.random() * (I.y1 - I.y0 - 28) }; }

  // ---------- collision, called for every creature every frame (from the frame loop) ----------
  let wndT = 0, wnd = null;
  window.__solids = (c, vx, vy) => { const S = active() ? ST[placeId()] : null; if (!S || !S.objs.length || c.lab) return null;
    if (c._carryO) { const o = c._carryO; o.x = c.x; o.y = c.y - 14 - 6 * (c.size || 1); }
    if (c.held) return null; ensureGrid();
    const t = performance.now(), r = 8 + 6 * (c.size || 1); let out = null;
    // a detour (round a corner, or to a door) replaces this frame's step toward the target
    if (c._det) { const d = c._det, dx = wdx(c.x, d.x), dy = wdy(c.y, d.y), dd = Math.hypot(dx, dy); if (t > d.until || c.state === 'sleep' || (c.state === 'hide' && !(c.dashUntil > now()))) c._det = null; else if (dd < 12) { c._det = d.next || null; if (!c._det && d.door) c._doorT = t + 3000; }
      else { c.x -= vx; c.y -= vy; const sp = Math.min(Math.max(1.2, c.speed || 1.5), dd); vx = dx / dd * sp; vy = dy / dd * sp; c.x += vx; c.y += vy; out = [vx, vy]; } }
    const gx = c._det ? c._det.x : c.tx, gy = c._det ? c._det.y : c.ty, tdx = wdx(c.x, gx), tdy = wdy(c.y, gy), td = Math.hypot(tdx, tdy);
    // heading into a hut or pen from outside: go round to its door first
    if (!c._det && td > 30 && (vx || vy)) for (const s of S.structs) { if (!s.done || !s.door || !insideS(s, c.tx, c.ty) || insideS(s, c.x, c.y)) continue; const dx = wdx(s.x, c.x), dy = wdy(s.y, c.y);
      if ((c._doorT || 0) < t && Math.hypot(wdx(c.x, s.door.x), wdy(c.y, s.door.y)) > 40 && Math.hypot(dx, dy) < 460) { const side = s.kind === 'pen' ? 135 : 120, round = dy < s.door.y - s.y - 30, cx = c.x + wdx(c.x, s.x) + (dx < 0 ? -side : side), dxo = c.x + wdx(c.x, s.door.x);   // round the side, then in at the door
        const len = (round ? Math.hypot(cx - c.x, s.door.y - 10 - c.y) + Math.abs(cx - dxo) : Math.hypot(dxo - c.x, s.door.y - c.y)) + 90, ms = Math.min(12000, len / Math.max(0.03, (c.speed || 1.5) * 0.06) + 800);
        const door = { x: dxo, y: s.door.y, until: t + ms, door: 1 }; c._det = round ? { x: cx, y: s.door.y - 10, until: t + ms, next: door } : door;
        if (c.state === 'hide' && c.dashUntil > now()) { c.dashUntil = Math.max(c.dashUntil, now() + ms + 600); c.until = Math.max(c.until || 0, c.dashUntil + 4000); } } break; }   // a scared one keeps running till it's in
    // something solid just ahead: sidestep the near way round
    if (td > 20 && (vx || vy)) { const ux = tdx / td, uy = tdy / td, look = Math.min(td, 26 + r), px = c.x + ux * look, py = c.y + uy * look, o = hitAt(px, py, r * 0.8);
      if (o && !inRect(o, gx, gy, r)) { const ox = wdx(c.x, o.x), oy = wdy(c.y, o.y), side = (ux * oy - uy * ox) > 0 ? -1 : 1, sx = -uy * side, sy = ux * side, sp = Math.max(1, c.speed || 1.5) * 0.9; c.x += sx * sp; c.y += sy * sp; vx += sx * sp; vy += sy * sp; out = [vx, vy]; c._bump = t; } }
    // overlap: push out along the shallow side (big creatures shove small loose things instead)
    for (const o of around(c.x, c.y)) { const [hw, hh] = half(o), dx = wdx(o.x, c.x), dy = wdy(o.y, c.y), ax = Math.abs(dx), ay = Math.abs(dy); if (ax >= hw + r || ay >= hh + r) continue;
      const px = hw + r - ax, py = hh + r - ay;
      if (small(o) && !o.pin && !o.you && !o.carriedBy && (c.size || 1) > 1.35 && (vx || vy)) { if (px < py) o.x = mod(o.x - Math.sign(dx || 1) * px * 0.6, W()); else o.y -= Math.sign(dy || 1) * py * 0.6; if (o.sid) detach(S, o); dirty = true; save(); }
      if (px < py) c.x += Math.sign(dx || 1) * px; else c.y += Math.sign(dy || 1) * py; c._bump = t; }
    // stuck against something for a while: a short detour sideways
    if (!c._det && c._bump && t - c._bump < 1200 && td > 40) { const b = c._bs; if (!b || t - b.t > 1500) { if (b && Math.hypot(c.x - b.x, c.y - b.y) < 10) { const sd = Math.random() < .5 ? -1 : 1; c._det = { x: c.x - tdy / td * sd * 150 - tdx / td * 30, y: c.y + tdx / td * sd * 150 - tdy / td * 30, until: t + 2200 }; } c._bs = { x: c.x, y: c.y, t }; } }
    // in a wall's lee the wind doesn't push
    if (t - wndT > 250) { wndT = t; wnd = H().wind(); } if (wnd && wnd.f > 0.15 && c.state !== 'hide' && c.state !== 'sleep') { const ca = Math.cos(wnd.a), sa = Math.sin(wnd.a);
      for (const s of S.structs) { if (!s.done || s.kind !== 'wall') continue; const dx = wdx(s.x, c.x), dy = wdy(s.y, c.y), down = dx * ca + dy * sa, lat = Math.abs(-dx * sa + dy * ca); if (down > 0 && down < 160 && lat < 110) { const push = 0.35 * wnd.f / Math.max(0.6, (c.g.legs || 6) / 6); c.x -= ca * push; c.y -= sa * push; c.tx -= ca * push * 0.5; c.ty -= sa * push * 0.5; c._lee = s.id; break; } } }
    return out; };

  // ---------- world start: a few quarries of small things and some big ones; an Architect moves in ----------
  function openSpot(S, rad, tries, inRoom) { const sp = H().space(), keep = kind() === 'keep', rooms = keep ? H().keepRooms().filter(q => q.x1 - q.x0 > rad * 2 + 120 && q.y1 - q.y0 > rad * 2 + 80) : [], L = window.__lake && window.__lake.info(); let best = null, bs = Infinity;
    for (let i = 0; i < (tries || 60); i++) { let x, y; if (inRoom) { x = inRoom.x + (Math.random() - .5) * inRoom.r * 2; y = inRoom.y + (Math.random() - .5) * inRoom.r * 1.4; } else if (keep && rooms.length) { const q = pick(rooms); x = q.x0 + rad + 50 + Math.random() * (q.x1 - q.x0 - rad * 2 - 100); y = q.y0 + rad + 30 + Math.random() * (q.y1 - q.y0 - rad * 2 - 60); } else { x = 200 + Math.random() * (sp.W - 400); y = 180 + Math.random() * (sp.H - 360); }
      if (keep && rooms.length && !rooms.some(q => x - rad > q.x0 + 20 && x + rad < q.x1 - 20 && y - rad > q.y0 && y + rad < q.y1 - 20)) continue;
      if (L && Math.abs(wdx(L.x, x)) < L.rx * 1.4 + rad && Math.abs(wdy(L.y, y)) < L.ry * 1.4 + rad) continue;
      let bad = 0; for (const o of S.objs) if (Math.abs(wdx(o.x, x)) < rad + 40 && Math.abs(wdy(o.y, y)) < rad + 40) bad++; for (const s of S.structs) if (Math.hypot(wdx(s.x, x), wdy(s.y, y)) < rad + R[s.kind] + 40) bad += 3; if (bad > 0) continue;
      const sc = H().wordsNear(x, y, rad).length * 0.2 + (inRoom ? Math.hypot(x - inRoom.x, y - inRoom.y) / 200 : 0) + Math.random(); if (sc < bs) { bs = sc; best = { x: Math.round(x), y: Math.round(y) }; } }
    return best; }
  function seed(S) { const K = KINDS[kind()] || KINDS.home, qs = [];
    for (let q = 0; q < 3; q++) { const p = openSpot(S, 90, 80); if (!p) continue; qs.push(p); const n = 6 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const a = i / n * 6.28 + Math.random() * 0.5, rr = 16 + Math.random() * 46; const k = pick(K.small); mkObj(S, k, p.x + Math.cos(a) * rr * 1.3, p.y + Math.sin(a) * rr, k === 'brick' ? { word: pick(['bit', 'byte', 'node', 'loop', 'stack', 'cache', 'heap', 'null']) } : null); } }
    for (let i = 0; i < 5; i++) { const p = openSpot(S, 70, 50); if (p) mkObj(S, pick(K.big), p.x, p.y); }
    S.seeded = now(); S.quarries = qs; save(); try { window.__almanac && window.__almanac.ev('build', 'crates, bricks and boulders turned up: something to build with', {}); } catch (e) {} return qs; }
  function maybeStart() { const S = cur(); if (!S || !H().restoredOrFresh() || !H().words().length || window.__genesisVoid) return; if (!S.seeded) seed(S);
    if (!S.arch && !H().creatures().some(c => !c.lab && H().jobOf(c) === 'architect')) { S.arch = now(); save(); try { const c = H().spawn('architect'); const q = (S.quarries || [])[0]; if (c && q) { c.x = c.tx = q.x + 70; c.y = c.ty = q.y + 40; c.home = { x: q.x + 70, y: q.y + 40 }; } } catch (e) {} } }
  setTimeout(() => { maybeStart(); setInterval(maybeStart, 5000); }, 6000);

  // ---------- an Architect's work: plan, fetch, carry, place; repair what got knocked out ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms)), alive = c => H().creatures().includes(c);
  // walk up to a point (or to an object: near enough to reach over its edge, even in a pile); goto again as the brain may wander off
  const edge = (o, x, y) => { const [hw, hh] = half(o); return Math.hypot(Math.max(0, Math.abs(wdx(o.x, x)) - hw), Math.max(0, Math.abs(wdy(o.y, y)) - hh)); };
  async function approach(c, x, y, rr, ms, o) { const t0 = now(); let best = Infinity, bestT = t0; while (now() - t0 < (ms || 22000)) { if (c.held || c.state === 'sleep' || c.state === 'hide' || !alive(c)) return false;
      const d = o ? edge(o, c.x, c.y) : Math.hypot(wdx(c.x, x), wdy(c.y, y)); if (d < rr) return true; if (d < best - 4) { best = d; bestT = now(); } else if (now() - bestT > 6000) return false;   // no progress for 6 s: give up this one
      H().goto(c, x, y); await sleep(300); } return false; }
  function plan(c, S) { const sh = c.g.shapes || { hut: 1, pen: 0.7, wall: 0.5, bench: 0.5 }, L = window.__lake && window.__lake.info();
    const opts = Object.entries(sh).filter(([k, v]) => v > 0 && SUF[k] && (k !== 'bench' || (L && !S.structs.some(s => s.kind === 'bench'))));
    const firstHut = !S.structs.some(s => s.kind === 'hut'); let k; if (firstHut && sh.hut > 0) k = 'hut'; else { let tot = opts.reduce((a, [, v]) => a + v, 0), r = Math.random() * tot; for (const [kk, v] of opts) { r -= v; if (r <= 0) { k = kk; break; } } k = k || 'hut'; }
    let p; if (k === 'bench') { p = { x: Math.round(L.x + (Math.random() - .5) * L.rx), y: Math.round(L.y + L.ry * 1.25 + 44) }; } else p = openSpot(S, R[k], 70, { x: c.home.x, y: c.home.y, r: 650 }) || openSpot(S, R[k], 60);
    if (!p) return null; const vert = k === 'wall' && Math.random() < 0.5, g = slotsFor(k, p.x, p.y, vert);
    const s = { id: 's' + (++S.n) + now().toString(36).slice(-3), kind: k, x: p.x, y: p.y, vert, slots: g.slots.map(q => ({ ...q, oid: null })), inner: g.inner || null, door: g.door || null, by: c.name, t: now(), done: 0, name: '', visits: 0 };
    S.structs.push(s); save(); try { H().note(c, 'work', `started ${A[k]}`, 'work:plan'); } catch (e) {} H().log('build_plan', { who: c.name, kind: k }); return s; }
  async function press(c, S) {   // no loose material: press a long word into a brick
    let best = null, bd = 900; for (const w of H().words()) { if (w.carriedBy || w.built || w.terrain || w.lava || w.text.length < 6 || /locked/.test(w.el.className)) continue; const d = Math.hypot(wdx(c.x, w.x), wdy(c.y, w.y)); if (d < bd) { bd = d; best = w; } }
    if (!best) return null; if (!(await approach(c, best.x, best.y, 20))) return null; if (!H().words().includes(best) || best.carriedBy) return null;
    const x = best.x, y = best.y, t = best.text.slice(0, 10); if (!H().dropWord(best)) return null; const o = mkObj(S, 'brick', x, y, { word: t, by: c.name }); H().speak(c, '🧱 “' + t + '”'); return o; }
  const ST8 = { tries: 0, noMaterial: 0, fetchFail: 0, carryFail: 0, placed: 0, pressed: 0 };
  async function work(c) { const S = cur(); if (!S) return false; ST8.tries++;
    let s = S.structs.find(q => q.by === c.name && !q.done) || S.structs.find(q => q.done && !filled(S, q) && Math.hypot(wdx(c.x, q.x), wdy(c.y, q.y)) < 1200) || plan(c, S); if (!s) return false;
    const i = s.slots.findIndex(sl => !(sl.oid && S.objs.some(o => o.id === sl.oid && o.sid === s.id))); if (i < 0) { if (!s.done) finish(S, s, c); return true; }
    let o = null, bd = 1600; for (const q of S.objs) { if (!free(q) || q.busy || now() - (q.skipT || 0) < 60000) continue; const d = Math.hypot(wdx(c.x, q.x), wdy(c.y, q.y)); if (d < bd) { bd = d; o = q; } }
    if (!o) { o = await press(c, S); if (o) ST8.pressed++; } if (!o) { ST8.noMaterial++; if (Math.random() < 0.3) H().speak(c, pick(['nothing to build with', 'need bricks', 'out of crates'])); return false; }
    o.busy = c.name; try {
      const r = 8 + 6 * (c.size || 1); if (!(await approach(c, o.x, o.y, r + 16, 22000, o))) { o.skipT = now(); ST8.fetchFail++; return false; } if (!free(o)) return false;
      o.carriedBy = c.name; c._carryO = o; dirty = true; if (Math.random() < 0.3) H().speak(c, pick(['heave', 'got one', 'mine now', '📦']));
      const sl = s.slots[i]; const ok = await approach(c, sl.x, sl.y, r + 30, 26000); if (!ok || !S.structs.includes(s)) { ST8.carryFail++; return false; }
      if (sl.oid && S.objs.some(q => q.id === sl.oid && q.sid === s.id)) return false;   // someone filled it meanwhile
      o.carriedBy = null; c._carryO = null; o.x = Math.round(mod(sl.x, W())); o.y = Math.round(sl.y); o.rot = sl.rot || 0; o.sid = s.id; sl.oid = o.id; dirty = true; save(); ST8.placed++;
      H().log('work', { who: c.name, job: 'architect', kind: s.kind, slot: i });
      if (filled(S, s)) { if (!s.done) finish(S, s, c); else { H().speak(c, 'fixed it'); try { H().note(c, 'work', `repaired ${s.name || A[s.kind]}`, 'work:repair'); } catch (e) {} } }
      return true;
    } finally { o.busy = null; if (c._carryO === o) { c._carryO = null; o.carriedBy = null; o.x = Math.round(mod(c.x, W())); o.y = Math.round(c.y + 18); dirty = true; save(); } } }
  function nameFor(s) { const nb = H().wordsNear(s.x, s.y, 320).filter(w => !w.carriedBy && /^[\p{L}]{4,11}$/u.test(w.text) && /[aeiouy].*[aeiouy]|^[^aeiouy]*[aeiouy][^aeiouy]{0,3}$/i.test(w.text)).map(w => w.text.toLowerCase()); const suf = pick(SUF[s.kind]), cap = t => t[0].toUpperCase() + t.slice(1);
    if (!nb.length) return 'the ' + suf; const a = pick(nb); return pick([`${cap(a)} ${suf}`, `the ${suf} of ${cap(a)}`, `${cap(a)}'s ${suf}`]); }
  function finish(S, s, c) { s.done = now(); s.name = nameFor(s); const nm = H().namer(); s.namedBy = nm ? nm.name : null; save();
    const at = { x: Math.round(s.x), y: Math.round(s.y) }, use = { hut: 'a shelter from storms', pen: 'a quiet room', wall: 'a windbreak', bench: 'a seat by the lake' }[s.kind];
    H().log('built', { who: c.name, kind: s.kind, name: s.name, at }); try { H().note(c, 'built', `built ${A[s.kind]}: ${s.name}${s.namedBy ? ' (' + s.namedBy + ' named it)' : ''}`, 'built:' + s.kind); } catch (e) {}
    H().speak(c, pick(['done!', '🏠 ' + s.name, 'there.', 'it stands'])); try { window.__almanac && window.__almanac.ev('build', `${c.name} built ${A[s.kind]}, ${s.name}: ${use}`, { at }); } catch (e) {}
    if (S.structs.filter(q => q.done).length === 1 || Math.random() < 0.4) H().comment(pick([`${c.name} finished ${s.name}. It is ${use}. Nobody asked for planning permission`, `${s.name} is up. ${c.name} stood back and looked at it for a long time`, `A new building: ${s.name}, by ${c.name}. The door is where the door should be, which is new`]), 'built'); }

  // ---------- spaces in use (once a second) ----------
  let lastSeek = 0;
  function tick() { const S = active() ? ST[placeId()] : null; if (!S) return; const t = now(), done = S.structs.filter(s => s.done);
    if (done.length) for (const c of H().creatures()) { if (c.lab || c.guest || !c.d) continue; let s = null; for (const q of done) if (zoneS(q, c.x, c.y)) { s = q; break; } if (!s) { c._inS = null; continue; }
      const fe = c.life && c.life.fe;
      if (s.kind === 'hut') { if (fe && fe.fear > 0.01) fe.fear *= 0.8; c.d.fatigue = Math.max(0, (c.d.fatigue || 0) - 0.002); if (c.state === 'hide' && (!fe || fe.fear < 0.2) && c.until > t + 1500) c.until = t + 1500; }
      else if (s.kind === 'pen') { if (fe && fe.fear > 0.01) fe.fear *= 0.9; c.d.fatigue = Math.max(0, (c.d.fatigue || 0) - 0.006); }
      else if (s.kind === 'bench') c.d.fatigue = Math.max(0, (c.d.fatigue || 0) - 0.01);
      if (c._inS !== s.id) { c._inS = s.id; s.visits = (s.visits || 0) + 1; s.last = t;
        if (s.kind === 'hut' && fe && fe.fear > 0.35) { s.sheltered = (s.sheltered || 0) + 1; try { H().note(c, 'built', `sheltered in ${s.name}`, 'shelter:' + s.id); } catch (e) {} }
        else if (s.kind === 'pen' && (c.g.social ?? 0.5) < 0.35 && Math.random() < 0.3) { try { H().note(c, 'built', `liked the quiet in ${s.name}`, 'quiet:' + s.id); } catch (e) {} } } }
    // loners drift to a quiet room now and then
    const pens = done.filter(s => s.kind === 'pen'); if (pens.length && t - lastSeek > 5000) { lastSeek = t; let n = 0;
      for (const c of H().creatures()) { if (n >= 2) break; if (c.lab || c.guest || c.held || c.state === 'sleep' || c.state === 'hide' || c.working || c.target || c.carrying || (c.userUntil || 0) > t || (c.g.social ?? 0.5) >= 0.35 || (c.d.fatigue || 0) < 0.35) continue;
        const s = pens.find(q => Math.hypot(wdx(c.x, q.x), wdy(c.y, q.y)) < 900 && !insideS(q, c.x, c.y)); if (!s) continue; const p = interiorPt(s); H().goto(c, p.x, p.y); c.userUntil = t + 9000; n++; } }
    // strong wind nudges small loose things
    const w = H().wind(); if (w && w.f > 0.65) { const ca = Math.cos(w.a), sa = Math.sin(w.a); for (const o of S.objs) if (small(o) && !o.pin && !o.carriedBy && !o.sid && !o.you) { o.x = mod(o.x + ca * 3 * w.f, W()); o.y += sa * 3 * w.f; dirty = true; } }
    if (t % 5000 < 1000) save(); }
  setInterval(tick, 1000);

  // ---------- drawing: one canvas under the words, only what is in view ----------
  const cv = document.createElement('canvas'); cv.id = 'buildCv'; cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:2'; H().floor.insertBefore(cv, H().floor.firstChild.nextSibling); g = cv.getContext('2d');   // let: picture() borrows the drawing code for a moment
  let key = '', last = 0, shown = false;
  function frame(ts) { requestAnimationFrame(frame); if (ts - last < 66) return; last = ts; const S = active() ? ST[placeId()] : null, h = H();
    const clear = () => { if (shown) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); shown = false; } };
    if (!S || (!S.objs.length && !S.structs.length)) return clear();
    const vs = h.viewSize(), cam = h.cam(), z = cam.z, x0 = cam.x - vs.w / 2 / z, y0 = cam.y - vs.h / 2 / z, x1 = x0 + vs.w / z, y1 = y0 + vs.h / z, inV = (x, y, m) => x + m > x0 && x - m < x1 && y + m > y0 && y - m < y1;
    const keep = kind() === 'keep', q = keep ? 0.5 : Math.min(2, devicePixelRatio || 1), Wc = Math.ceil(vs.w * q), Hc = Math.ceil(vs.h * q);
    if (cv.width !== Wc || cv.height !== Hc) { cv.width = Wc; cv.height = Hc; } const k2 = `${Wc}x${Hc}|${(vs.w / z).toFixed(2)}|${x0.toFixed(1)},${y0.toFixed(1)}|${keep}`;
    if (k2 !== key) { key = k2; cv.style.width = (vs.w / z) + 'px'; cv.style.height = (vs.h / z) + 'px'; cv.style.left = x0 + 'px'; cv.style.top = y0 + 'px'; cv.style.imageRendering = keep ? 'pixelated' : ''; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, Wc, Hc); shown = true; g.imageSmoothingEnabled = !keep; g.setTransform(q * z, 0, 0, q * z, -x0 * q * z, -y0 * q * z); const dark = h.isDark(), ink = keep ? (dark ? '#fff' : '#000') : dark ? 'rgba(230,200,150,.75)' : 'rgba(110,70,30,.7)';
    // floors and blueprints
    for (const s of S.structs) { const x = h.near(s.x, cam.x, W()), y = h.near(s.y, cam.y, Hh()); if (!inV(x, y, 160)) continue; const dx = x - s.x, dy = y - s.y;
      if (s.done && s.inner) { const I = s.inner; g.fillStyle = keep ? dither(2, ink) : dark ? 'rgba(240,200,140,.07)' : 'rgba(170,120,60,.08)'; if (I.rx) { g.beginPath(); g.ellipse(I.cx + dx, I.cy + dy, I.rx, I.ry, 0, 0, 7); g.fill(); } else g.fillRect(I.x0 + dx, I.y0 + dy, I.x1 - I.x0, I.y1 - I.y0); }
      if (!s.done || !filled(S, s)) { g.setLineDash([4, 4]); g.strokeStyle = keep ? ink : dark ? 'rgba(255,200,120,.45)' : 'rgba(150,90,30,.45)'; g.lineWidth = 1; for (const sl of s.slots) { if (sl.oid && S.objs.some(o => o.id === sl.oid && o.sid === s.id)) continue; const w = sl.rot === 90 ? 26 : 34, hh = sl.rot === 90 ? 34 : 26; g.strokeRect(sl.x + dx - w / 2, sl.y + dy - hh / 2, w, hh); } g.setLineDash([]); }
      if (s.done && s.name) { g.font = keep ? '12px monospace' : 'italic 11px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = ink; const ly = s.kind === 'hut' ? y + 62 : s.kind === 'pen' ? y + 96 : s.kind === 'bench' ? y + 26 : y + (s.vert ? 108 : 30); g.fillText(s.name, x, ly); } }
    for (const o of S.objs) { const x = h.near(o.x, cam.x, W()), y = h.near(o.y, cam.y, Hh()); if (!inV(x, y, 60)) continue; if (o.carriedBy) g.globalAlpha = 0.92; drawObj(o, x, y, keep, dark, ts); g.globalAlpha = 1; }
    if (drag && drag.moved) { const o = drag.o, [hw, hh] = half(o), x = h.near(o.x, cam.x, W()), y = h.near(o.y, cam.y, Hh()); g.setLineDash([3, 3]); g.strokeStyle = keep ? ink : '#2b5cff'; g.lineWidth = 1.5; g.strokeRect(x - hw - 4, y - hh - 4, hw * 2 + 8, hh * 2 + 8); g.setLineDash([]); } }
  requestAnimationFrame(frame);

  // ---------- your hand: drag objects; click one for pin / turn / remove ----------
  let drag = null; const ar = H().arena;
  const objAt = (x, y) => { const S = active() ? ST[placeId()] : null; if (!S) return null; for (let i = S.objs.length - 1; i >= 0; i--) { const o = S.objs[i]; if (!o.carriedBy && inRect(o, x, y, 2)) return o; } return null; };
  const skip = tg => tg.closest && tg.closest('.creature, .word, .thing, .design, #whisper, #studio, #dj, #advpanel, #reelpanel, #roomchat, #lab, button, input, textarea, select, a, .msg, #objmenu');
  ar.addEventListener('pointerdown', e => { if (e.button || skip(e.target)) return; const p = H().toWorld(e.clientX, e.clientY), o = objAt(p.x, p.y); if (!o) return;
    e.stopImmediatePropagation(); e.preventDefault(); menu(null); drag = { o, dx: wdx(p.x, o.x), dy: wdy(p.y, o.y), cx: e.clientX, cy: e.clientY, moved: false, id: e.pointerId }; try { ar.setPointerCapture(e.pointerId); } catch (er) {} }, true);
  ar.addEventListener('pointermove', e => { if (drag) { if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return; drag.moved = true; e.stopImmediatePropagation(); const p = H().toWorld(e.clientX, e.clientY), S = cur(); if (drag.o.sid && S) detach(S, drag.o); drag.o.x = mod(p.x + drag.dx, W()); drag.o.y = p.y + drag.dy; dirty = true; ar.style.cursor = 'grabbing'; return; }
    if (e.pointerType === 'touch' || skip(e.target)) return; const p = H().toWorld(e.clientX, e.clientY), o = objAt(p.x, p.y); const want = o ? 'grab' : ''; if (ar.style.cursor !== want && (want || ar.style.cursor === 'grab')) ar.style.cursor = want; }, true);
  const up = e => { if (!drag) return; const d = drag; drag = null; e.stopImmediatePropagation(); try { ar.releasePointerCapture(d.id); } catch (er) {} ar.style.cursor = '';
    if (d.moved) { d.o.you = true; d.o.x = Math.round(d.o.x); d.o.y = Math.round(d.o.y); dirty = true; save(); H().log('object_move', { k: d.o.k }); } else menu(d.o, e.clientX, e.clientY); };
  ar.addEventListener('pointerup', up, true); ar.addEventListener('pointercancel', up, true);
  ar.addEventListener('click', e => { if (e.target === ar || e.target.tagName === 'CANVAS') { const p = H().toWorld(e.clientX, e.clientY); if (objAt(p.x, p.y)) e.stopImmediatePropagation(); } }, true);
  const mEl = document.createElement('div'); mEl.id = 'objmenu'; document.body.appendChild(mEl);
  const css = document.createElement('style'); css.textContent = `#objmenu{position:fixed;z-index:10002;display:none;gap:4px;align-items:center;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:10px;padding:4px 6px;font:12px system-ui;box-shadow:0 4px 16px #0004}#objmenu.on{display:flex}#objmenu button{font:inherit;padding:1px 7px;border-radius:7px;border:1px solid #8886;background:none;color:inherit;cursor:pointer}#objmenu small{opacity:.7;margin-right:2px}
#studio .objrow button{font:11px system-ui;padding:2px 7px;border-radius:7px;border:1px solid #8886;background:none;color:inherit;cursor:pointer;margin:2px 3px 2px 0}#studio .objrow small{display:block;opacity:.65;margin-top:3px}`; document.head.appendChild(css);
  let mObj = null; function menu(o, x, y) { mObj = o; if (!o) { mEl.classList.remove('on'); return; } const S = cur(), s = o.sid && S ? S.structs.find(q => q.id === o.sid) : null;
    mEl.innerHTML = `<small>${(DEF[o.k] || {}).name || o.k}${o.word ? ' “' + o.word + '”' : ''}${s ? ' · part of ' + (s.name || A[s.kind]) : ''}</small><button data-o="pin">${o.pin ? '📌 unpin' : '📌 pin'}</button><button data-o="turn">↻ turn</button><button data-o="del" title="take it out of the world">✕ remove</button>${s && window.__collect ? `<button data-o="keep" title="put a picture of ${s.name || A[s.kind]} in your drawer">🗄 keep</button>` : ''}`;
    mEl.style.left = Math.min(innerWidth - 300, x + 8) + 'px'; mEl.style.top = Math.max(8, y - 40) + 'px'; mEl.classList.add('on'); clearTimeout(mEl._t); mEl._t = setTimeout(() => menu(null), 6000); }
  mEl.addEventListener('click', e => { const b = e.target.closest('[data-o]'), S = cur(); if (!b || !mObj || !S) return; const o = mObj, a = b.dataset.o;
    if (a === 'keep') { if (o.sid && window.__collect) window.__collect.keepBuilding(o.sid); menu(null); return; }
    if (a === 'pin') { o.pin = !o.pin; } else if (a === 'turn') { o.rot = o.rot === 90 ? 0 : 90; o.you = true; if (o.sid) detach(S, o); } else if (a === 'del') { detach(S, o); const i = S.objs.indexOf(o); if (i >= 0) S.objs.splice(i, 1); for (const c of H().creatures()) if (c._carryO === o) c._carryO = null; }
    dirty = true; save(); H().log('object_' + a, { k: o.k }); menu(null); });
  document.addEventListener('pointerdown', e => { if (mObj && !e.target.closest('#objmenu')) setTimeout(() => { if (!drag) menu(null); }, 0); }, true);

  // ---------- the studio: place objects ----------
  function studioRow() { const st = document.getElementById('studio'); if (!st || st.querySelector('.objrow')) return; const dyn = st.querySelector('.dyn'); const d = document.createElement('details'); d.className = 'sec';
    d.innerHTML = `<summary>Objects · solid things to build with</summary><div class="objrow"></div>`; dyn ? st.insertBefore(d, dyn) : st.appendChild(d); renderRow(); }
  function renderRow() { const r = document.querySelector('#studio .objrow'); if (!r) return; const K = KINDS[kind()] || KINDS.home, S = cur();
    r.innerHTML = active() ? [...new Set([...K.small, ...K.big])].map(k => `<button data-place="${k}">+ ${DEF[k].name}</button>`).join('') + `<small>small ones are building material for the Architects; drag any object to set it where you want (creatures leave those alone); click one to pin, turn or remove it. ${S ? S.objs.length + ' objects, ' + S.structs.filter(s => s.done).length + ' buildings here' : ''}</small>` : '<small>objects live at Home and in Gloamhold</small>'; }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-place]'); if (!b) return; const S = cur(); if (!S) return; const cam = H().cam(), k = b.dataset.place; const o = mkObj(S, k, cam.x + (Math.random() - .5) * 160, cam.y + (Math.random() - .5) * 110, k === 'brick' ? { word: pick(['you', 'gift', 'here', 'home', 'mine']) } : null); o.by = 'you'; if (!small(o)) o.you = true; save(); H().log('object_place', { k }); renderRow(); });
  setInterval(() => { studioRow(); if (document.querySelector('#studio .objrow') && document.getElementById('studio').offsetParent) renderRow(); }, 2000);

  // ---------- the API the arena calls ----------
  // a picture of one building (your drawer keeps it): its floor, its pieces and its name, drawn with the same code as the world
  function picture(sid) { const S = cur(); const s = S && S.structs.find(q => q.id === sid); if (!S || !s) return null; const h = H(), keep = kind() === 'keep', dark = h.isDark(), r = (R[s.kind] || 110) + 46, q = 2;
    const c = document.createElement('canvas'); c.width = c.height = Math.round(r * 2 * q); const pg = c.getContext('2d'), g0 = g; g = pg;
    try { g.fillStyle = keep ? (dark ? '#000' : '#fff') : dark ? '#23232a' : '#f7f4ee'; g.fillRect(0, 0, c.width, c.height); g.setTransform(q, 0, 0, q, (r - s.x) * q, (r - s.y) * q);
      if (s.done && s.inner) { const I = s.inner; g.fillStyle = dark ? 'rgba(240,200,140,.12)' : 'rgba(170,120,60,.12)'; if (I.rx) { g.beginPath(); g.ellipse(I.cx, I.cy, I.rx, I.ry, 0, 0, 7); g.fill(); } else g.fillRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0); }
      const mine = S.objs.filter(o => o.sid === s.id || Math.hypot(wdx(s.x, o.x), wdy(s.y, o.y)) < r - 10); for (const o of mine) drawObj(o, s.x + wdx(s.x, o.x), s.y + wdy(s.y, o.y), keep, dark, 0);
      if (s.name) { g.font = keep ? '12px monospace' : 'italic 12px Georgia,serif'; g.textAlign = 'center'; g.fillStyle = keep ? (dark ? '#fff' : '#000') : dark ? 'rgba(230,200,150,.9)' : 'rgba(110,70,30,.9)'; g.fillText(s.name, s.x, s.y + r - 14); }
      return { data: c.toDataURL('image/png'), id: s.id, name: s.name || A[s.kind], kind: s.kind, what: A[s.kind], by: s.by, pieces: mine.length, done: !!s.done, x: s.x, y: s.y }; } finally { g = g0; } }
  // replays (Oct 31): the objects and finished buildings around a moment, in the moment's own coordinates (a few numbers each),
  // and the same drawing onto the replay's canvas, so a clip shows the hut it happened in
  function near(cx, cy, Rr) { const S = active() ? ST[placeId()] : null; if (!S) return null; const o = [], s = [];
    for (const x of S.objs) { const dx = wdx(cx, x.x), dy = wdy(cy, x.y); if (Math.hypot(dx, dy) > Rr) continue; o.push([x.k, Math.round(dx), Math.round(dy), x.rot || 0, x.word || '']); if (o.length >= 80) break; }
    for (const q of S.structs) { if (!q.done) continue; const dx = wdx(cx, q.x), dy = wdy(cy, q.y); if (Math.hypot(dx, dy) > Rr + 120) continue; const ox = dx - q.x, oy = dy - q.y, I = q.inner;
      s.push({ k: q.kind, x: Math.round(dx), y: Math.round(dy), v: q.vert ? 1 : 0, n: q.name || '', i: I ? (I.rx ? [I.cx + ox, I.cy + oy, I.rx, I.ry] : [I.x0 + ox, I.y0 + oy, I.x1 + ox, I.y1 + oy]).map(Math.round) : null }); if (s.length >= 12) break; }
    return o.length || s.length ? { o, s } : null; }
  window.__build = {
    picture, near, drawTo,
    work, stats: () => ({ ...ST8 }), shelter: c => { const S = active() ? ST[placeId()] : null; if (!S) return 1; for (const s of S.structs) if (s.done && s.kind === 'hut' && insideS(s, c.x, c.y)) return 0.3; for (const s of S.structs) if (s.done && s.kind === 'pen' && insideS(s, c.x, c.y)) return 0.6; return 1; },
    coverFor: (c, max) => { const S = active() ? ST[placeId()] : null; if (!S) return null; let best = null, bd = max; for (const s of S.structs) { if (!s.done || s.kind !== 'hut' || !filled(S, s)) continue; const d = Math.hypot(wdx(c.x, s.x), wdy(c.y, s.y)); if (d < bd) { bd = d; best = s; } } return best ? interiorPt(best) : null; },
    shift: (dx, dy) => { const S = ST[placeId()]; if (!S) return; for (const o of S.objs) { o.x += dx; o.y += dy; } for (const s of S.structs) { s.x += dx; s.y += dy; for (const sl of s.slots) { sl.x += dx; sl.y += dy; } if (s.door) { s.door.x += dx; s.door.y += dy; } const I = s.inner; if (I) { if (I.rx) { I.cx += dx; I.cy += dy; } else { I.x0 += dx; I.x1 += dx; I.y0 += dy; I.y1 += dy; } } } for (const q of S.quarries || []) { q.x += dx; q.y += dy; } dirty = true; save(); },
    shove: (x, y, Rr, K) => { const S = active() ? ST[placeId()] : null; if (!S) return; const t0 = performance.now(); for (const o of S.objs) { if (!small(o) || o.pin || o.carriedBy) continue; const dx = wdx(x, o.x), dy = wdy(y, o.y), r = Math.hypot(dx, dy) || 1; if (r > Rr) continue; detach(S, o); const k = K - r, x0 = o.x, y0 = o.y, tx = x0 + dx / r * k, ty = y0 + dy / r * k;
        const step = () => { const a = Math.min(1, (performance.now() - t0) / 700), e = 1 - (1 - a) * (1 - a); o.x = x0 + (tx - x0) * e; o.y = y0 + (ty - y0) * e; dirty = true; if (a < 1) requestAnimationFrame(step); else { o.x = Math.round(mod(o.x, W())); save(); } }; step(); } },
    swirl: (x, y, Rr) => { const S = active() ? ST[placeId()] : null; if (!S) return; for (const o of S.objs) { if (!small(o) || o.pin || o.carriedBy) continue; const dx = wdx(x, o.x), dy = wdy(y, o.y), r = Math.hypot(dx, dy) || 1; if (r > Rr * 0.7) continue; const f = (1 - r / (Rr * 0.7)) * 1.4; o.x = mod(o.x + (-dy / r) * f - dx / r * 0.2, W()); o.y += (dx / r) * f - dy / r * 0.2; if (o.sid) detach(S, o); dirty = true; } },
    state: () => JSON.parse(JSON.stringify(ST, (k, v) => k === 'carriedBy' || k === 'busy' ? undefined : v)),
    merge: o => { if (!o) return; for (const [id, S] of Object.entries(o)) { if (!S) continue; const M = ST[id] = ST[id] || { objs: [], structs: [], seeded: 0, arch: 0, n: 0 };
        for (const x of S.objs || []) if (!M.objs.some(y => y.id === x.id)) M.objs.push({ ...JSON.parse(JSON.stringify(x)), carriedBy: null, busy: null });
        for (const x of S.structs || []) if (!M.structs.some(y => y.id === x.id)) M.structs.push(JSON.parse(JSON.stringify(x)));
        M.seeded = Math.max(M.seeded || 0, S.seeded || 0); M.arch = Math.max(M.arch || 0, S.arch || 0); M.n = Math.max(M.n || 0, S.n || 0); if (!M.quarries && S.quarries) M.quarries = S.quarries; } dirty = true; save(); },
    info: () => { const S = active() ? ST[placeId()] : null; return S ? { objs: S.objs.length, small: S.objs.filter(small).length, free: S.objs.filter(free).length, structs: S.structs.map(s => ({ id: s.id, kind: s.kind, name: s.name, done: !!s.done, filled: s.slots.filter(sl => sl.oid && S.objs.some(o => o.id === sl.oid && o.sid === s.id)).length, of: s.slots.length, by: s.by, x: s.x, y: s.y, visits: s.visits || 0, sheltered: s.sheltered || 0 })) } : null; },
    _st: () => cur(), _obj: (k, x, y) => { const S = cur(); return S ? mkObj(S, k, x, y) : null; }, _slots: slotsFor, _inside: (s, x, y) => insideS(s, x, y), _seed: () => { const S = cur(); return S ? seed(S) : null; }, _finish: (s, c) => finish(cur(), s, c) };
})();
