// idle-lake.js: the lake (issue #4), the data lake's doorway in the world. Each world (Home and Gloamhold) gets one, in its own
// style: soft blue water with drifting 0/1 reflections at home, a 1-bit black mere with white glints in the keep. Rain and storms
// fill it and clear days slowly lower it; while it rains, loose words near the shore drift in and dissolve into data fish (capped,
// so nothing is lost: hungry creatures on the shore fish them back out as words). It is a refuge: a scared creature runs for the
// shore when it is close, fear fades much faster there, and scares are rarer on the shore. Click the water to open the almanac.
(() => {
  const H = () => window.__lakeHooks; if (!H()) return;
  const now = () => Date.now(), pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => window.__places, placeId = () => (P() && P().cur && P().cur()) || 'home', kind = () => placeId() === 'home' ? 'home' : (P() && P().kind && P().kind()) || 'page';
  const active = () => ['home', 'keep'].includes(kind());
  const KEY = 'arena.lakes';
  const ST = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
  const NAMES = { home: [['Lake', 'the Pool of', 'the Mere of', 'the Tarn of'], ['Buffers', 'Soft Echoes', 'Stray Letters', 'Quiet Bytes', 'Overflow', 'Lost Packets']], keep: [['the Black Mere', 'the Well of Nulls', 'the Drowned Cache', 'the Still Tarn'], ['']] };
  const FISH_MAX = 24;
  const wdx = (a, b) => H().wd(a, b, H().space().W), wdy = (a, b) => H().wd(a, b, H().space().H);

  // ---------- where it lies: the emptiest spot (in the keep, inside a room, clear of the walls) ----------
  function site() { const h = H(), sp = h.space(), keep = kind() === 'keep', rooms = keep ? h.keepRooms().filter(q => q.x1 - q.x0 > 360 && q.y1 - q.y0 > 260) : []; let best = null, bs = Infinity;
    for (let i = 0; i < 90; i++) { let x, y; if (keep && rooms.length) { const q = pick(rooms); x = q.x0 + 150 + Math.random() * (q.x1 - q.x0 - 300); y = q.y0 + 110 + Math.random() * (q.y1 - q.y0 - 220); } else { x = 160 + Math.random() * (sp.W - 320); y = 140 + Math.random() * (sp.H - 280); }
      let s = h.wordsNear(x, y, 170).length; for (const t of h.things()) if (Math.hypot(wdx(x, t.x), wdy(y, t.y)) < 230) s += 4; s += Math.random() * 2; if (s < bs) { bs = s; best = { x, y }; } }
    return best; }
  function lake() { if (!active()) return null; const id = placeId(); let L = ST[id]; if (!L) { if (!window.__restoredOrFresh || !H().words().length) return null; const s = site(); if (!s) return null; const k = kind(), nm = NAMES[k] || NAMES.home;
      L = ST[id] = { x: Math.round(s.x), y: Math.round(s.y), base: 105, level: 0.45, sed: 0, fish: [], seed: Math.random() * 1000, name: (pick(nm[0]) + ' ' + pick(nm[1])).trim(), born: now(), calmed: 0, caught: 0 }; save();
      try { window.__almanac && window.__almanac.ev('lake', `a lake formed: ${L.name}`, {}); } catch (e) {} }
    return L; }
  const rx = L => L.base * (0.7 + 0.6 * L.level), ry = L => rx(L) * 0.55;
  const inside = (L, x, y, k = 1) => { const a = wdx(L.x, x) / (rx(L) * k), b = wdy(L.y, y) / (ry(L) * k); return a * a + b * b <= 1; };
  function shorePt(L, c) { const dx = wdx(L.x, c.x), dy = wdy(L.y, c.y), a = Math.atan2(dy / 0.55, dx) + (Math.random() - .5) * 0.5; return { x: L.x + Math.cos(a) * rx(L) * 1.12, y: L.y + Math.sin(a) * ry(L) * 1.12 + 6 }; }

  // ---------- the second-by-second life of the lake ----------
  let lastGossip = 0, lastSeek = 0, runT = 0;
  function tick() { const L = lake(); if (!L) return; const h = H(), w = h.world(), wx = w.weather, k = w.wint ?? 0.5, t = now();
    const rain = wx === 'bitrain' ? 1 : wx === 'storm' ? 2 : wx === 'fog' ? 0.15 : 0;
    L.level = Math.max(0.15, Math.min(1, L.level + (rain ? 0.0035 * rain * (0.5 + k) : -0.0004)));
    // runoff: in the rain, loose words by the shore drift in and dissolve into fish
    if (rain >= 1 && L.level > 0.3 && L.fish.length < FISH_MAX && t - runT > 1500) { runT = t; let moved = 0;
      for (const wd of h.wordsNear(L.x, L.y, rx(L) * 1.7)) { if (moved >= 3) break; if (wd.carriedBy || wd.terrain || wd.lava || wd.built || wd.owner || /locked/.test(wd.el.className) || !inside(L, wd.x, wd.y, 1.7)) continue;
        moved++; if (inside(L, wd.x, wd.y, 0.75)) { if (h.dropWord(wd)) { L.sed++; L.fish.push({ t: wd.text.slice(0, 12), a: Math.random() * 6.28, r: 0.25 + Math.random() * 0.6, v: (Math.random() < .5 ? -1 : 1) * (0.3 + Math.random() * 0.5) }); if (L.sed === 1) try { window.__almanac.ev('lake', `the first word dissolved into ${L.name}: “${wd.text.slice(0, 16)}”`, {}); } catch (e) {} } }
        else h.moveWord(wd, wd.x + wdx(wd.x, L.x) * 0.12, wd.y + wdy(wd.y, L.y) * 0.12); } }
    // the shore: fear fades fast, a sip rests them, hungry ones fish
    const cs = h.creatures(); let onShore = [];
    for (const c of cs) { if (c.lab || c.guest || !c.d || !inside(L, c.x, c.y, 1.45)) continue; onShore.push(c); const fe = c.life && c.life.fe;
      if (fe && fe.fear > 0.01) { const was = fe.fear; fe.fear *= 0.8; if (was > 0.35) c._lakeScared = 1; if (c._lakeScared && fe.fear < 0.12) { c._lakeScared = 0; L.calmed++; try { h.note(c, 'lake', 'calmed down by ' + L.name, 'lake:calm'); } catch (e) {} } }
      if (c.state === 'hide' && (!fe || fe.fear < 0.2) && c.until > t + 1500) c.until = t + 1500;
      c.d.fatigue = Math.max(0, (c.d.fatigue || 0) - 0.002);
      if (L.fish.length && (c.d.hunger || 0) > 0.45 && !c.carrying && !c.held && c.state !== 'sleep' && Math.random() < 0.06) { const f = L.fish.splice(Math.floor(Math.random() * L.fish.length), 1)[0], sp = shorePt(L, c), wd = h.addWord(f.t, sp.x, sp.y); L.caught++;
        if (wd) { wd.born = t; } if (h.inView ? h.inView(c) : true) h.say(c, '🎣 “' + f.t + '”'); try { h.note(c, 'lake', 'fished “' + f.t + '” out of ' + L.name, 'lake:fish'); } catch (e) {} } }
    L.shore = onShore.length;
    // the scared walk to the water when it's close (a couple at a time)
    if (t - lastSeek > 3000) { lastSeek = t; let n = 0; for (const c of cs) { if (n >= 2) break; const fe = c.life && c.life.fe; if (!fe || fe.fear < 0.35 || c.lab || c.guest || c.held || c.state === 'sleep' || c.state === 'hide' || c.working || c.target || c.carrying || (c.userUntil || 0) > t || c.hangryUntil > t) continue;
        if (Math.hypot(wdx(c.x, L.x), wdy(c.y, L.y)) > 700 || inside(L, c.x, c.y, 1.4)) continue; const sp = shorePt(L, c); h.goto(c, sp.x, sp.y); c.userUntil = t + 8000; n++; } }
    // gossip on the shore, now and then, about something the almanac remembers
    if (onShore.length >= 2 && t - lastGossip > 25000 && Math.random() < 0.25) { const c = pick(onShore), al = window.__almanac && window.__almanac.world(), evs = al ? al.ev.filter(e => ['name', 'hangry', 'theft', 'disaster', 'rave', 'join', 'friend'].includes(e.k)).slice(-12) : [];
      if (evs.length) { lastGossip = t; const e = pick(evs), txt = e.h.replace(/<[^>]+>/g, '').slice(0, 60); h.say(c, pick(['did you hear? ', 'apparently ', 'the water says ', 'psst: ']) + txt); } }
    if (t % 10000 < 1000) save(); }
  setInterval(tick, 1000);

  // ---------- drawing: one canvas under the words, only when the lake is in view ----------
  const cv = document.createElement('canvas'); cv.id = 'lakeCv'; cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:1'; H().floor.insertBefore(cv, H().floor.firstChild); const g = cv.getContext('2d');
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; let pat = null, patDark = null;
  const dither = (lvl, col) => { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = col; for (let i = 0; i < 16; i++) if (B4[i] < lvl) x.fillRect(i % 4, i >> 2, 1, 1); return g.createPattern(c, 'repeat'); };
  const rings = []; let key = '', last = 0, shown = false;
  function frame(ts) { requestAnimationFrame(frame); if (ts - last < 33) return; last = ts; const L = active() ? ST[placeId()] : null, h = H();
    if (!L) { if (shown) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); shown = false; } return; }
    const vs = h.viewSize(), cam = h.cam(), z = cam.z, x0 = cam.x - vs.w / 2 / z, y0 = cam.y - vs.h / 2 / z, cx = h.near(L.x, cam.x, h.space().W), cy = h.near(L.y, cam.y, h.space().H), RX = rx(L) * 1.15, RY = ry(L) * 1.15 + 30;
    const vis = cx + RX > x0 && cx - RX < x0 + vs.w / z && cy + RY > y0 && cy - RY < y0 + vs.h / z;
    if (!vis) { if (shown) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); shown = false; } return; }
    shown = true; const keep = kind() === 'keep', q = keep ? 0.5 : Math.min(2, devicePixelRatio || 1), W = Math.ceil(vs.w * q), Hh = Math.ceil(vs.h * q);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; } const k2 = `${W}x${Hh}|${(vs.w / z).toFixed(2)}|${x0.toFixed(1)},${y0.toFixed(1)}|${keep}`;
    if (k2 !== key) { key = k2; cv.style.width = (vs.w / z) + 'px'; cv.style.height = (vs.h / z) + 'px'; cv.style.left = x0 + 'px'; cv.style.top = y0 + 'px'; cv.style.imageRendering = keep ? 'pixelated' : ''; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, Hh); g.imageSmoothingEnabled = !keep; g.setTransform(q * z, 0, 0, q * z, -x0 * q * z, -y0 * q * z);
    const t = ts / 1000, a = rx(L), b = ry(L), dark = h.isDark(), w = h.world(), raining = w.weather === 'bitrain' || w.weather === 'storm';
    const blob = (s) => { g.beginPath(); for (let i = 0; i <= 48; i++) { const th = i / 48 * Math.PI * 2, r = s * (1 + 0.07 * Math.sin(3 * th + L.seed) + 0.045 * Math.sin(5 * th + L.seed * 2 + t * 0.25)); i ? g.lineTo(cx + Math.cos(th) * a * r, cy + Math.sin(th) * b * r) : g.moveTo(cx + Math.cos(th) * a * r, cy + Math.sin(th) * b * r); } g.closePath(); };
    if (raining && rings.length < 14 && Math.random() < 0.5) { const th = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.85; rings.push({ x: Math.cos(th) * a * r, y: Math.sin(th) * b * r, f: 0 }); }
    if (keep) { if (!pat || patDark !== dark) { patDark = dark; pat = dark ? { water: '#000', shore: dither(4, '#fff') } : { water: dither(12, '#000'), shore: dither(5, '#000') }; }   // on the dark keep the water is solid black inside a pale dithered shore
      blob(1.12); g.fillStyle = pat.shore; g.fill(); blob(1); g.fillStyle = pat.water; g.fill(); if (dark) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); } g.fillStyle = '#fff';
      for (let i = 0; i < 7; i++) { const yy = cy + (i - 3) * b * 0.24, len = a * (0.15 + 0.2 * Math.abs(Math.sin(i * 1.7 + L.seed))), xx = cx - a * 0.5 + ((i * 53 + t * 9) % (a * 0.9)); if (((xx - cx) / a) ** 2 + ((yy - cy) / b) ** 2 < 0.7) g.fillRect(Math.round(xx), Math.round(yy), Math.round(len * 0.4), 2); }
      g.font = '14px monospace'; g.textAlign = 'center'; for (const f of L.fish) { f.a += f.v * 0.01; const fx = cx + Math.cos(f.a) * a * f.r * 0.8, fy = cy + Math.sin(f.a) * b * f.r * 0.8; g.fillText(f.t[0], Math.round(fx), Math.round(fy)); }
      g.strokeStyle = '#fff'; g.lineWidth = 2; }
    else { const grd = g.createRadialGradient(cx, cy, 0, cx, cy, a); grd.addColorStop(0, dark ? 'rgba(40,110,210,.42)' : 'rgba(70,150,235,.36)'); grd.addColorStop(1, dark ? 'rgba(40,110,210,.22)' : 'rgba(70,150,235,.18)');
      blob(1.08); g.fillStyle = dark ? 'rgba(120,160,200,.08)' : 'rgba(150,120,80,.10)'; g.fill(); blob(1); g.fillStyle = grd; g.fill(); g.strokeStyle = dark ? 'rgba(110,170,255,.55)' : 'rgba(50,120,210,.5)'; g.lineWidth = 1.5; g.stroke();
      g.save(); blob(0.96); g.clip(); g.font = '10px ui-monospace,monospace'; g.fillStyle = dark ? 'rgba(170,210,255,.35)' : 'rgba(30,90,180,.28)';
      for (let i = 0; i < 7; i++) { const yy = cy + (i - 3) * b * 0.26, off = ((t * (6 + i) + i * 40) % 40); let s = ''; for (let j = 0; j < 18; j++) s += ((j * 7 + i * 3 + Math.floor(t / 2)) % 5 < 2) ? '1 ' : '0 '; g.fillText(s, cx - a + off - 20, yy); }
      g.fillStyle = dark ? 'rgba(200,170,120,.35)' : 'rgba(120,90,50,.28)'; for (let i = 0; i < Math.min(80, L.sed); i++) { const th = i * 2.399, r = 0.3 + (i % 7) / 10; g.fillRect(cx + Math.cos(th) * a * r * 0.85, cy + b * 0.35 + Math.sin(th) * b * 0.25 * r, 2, 2); }
      g.restore(); g.font = '600 13px ui-monospace,monospace'; g.textAlign = 'center'; g.fillStyle = dark ? 'rgba(220,240,255,.85)' : 'rgba(20,70,150,.8)';
      for (const f of L.fish) { f.a += f.v * 0.01; const fx = cx + Math.cos(f.a) * a * f.r * 0.8, fy = cy + Math.sin(f.a) * b * f.r * 0.8 + Math.sin(t * 2 + f.r * 9) * 2; g.fillText(f.t.length <= 3 ? f.t : f.t[0], fx, fy); g.fillText(f.v > 0 ? '‹' : '›', fx - (f.v > 0 ? -1 : 1) * 9, fy); }
      g.strokeStyle = dark ? 'rgba(170,210,255,.6)' : 'rgba(40,110,210,.55)'; g.lineWidth = 1; }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.f++; if (r.f > 30) { rings.splice(i, 1); continue; } g.globalAlpha = 1 - r.f / 30; g.beginPath(); g.ellipse(cx + r.x, cy + r.y, 2 + r.f * 0.9, (2 + r.f * 0.9) * 0.5, 0, 0, 7); g.stroke(); } g.globalAlpha = 1;
    // its name on the shore, small
    g.font = keep ? '12px monospace' : 'italic 11px Georgia,serif'; g.textAlign = 'center'; g.fillStyle = keep ? '#fff' : dark ? 'rgba(200,220,255,.6)' : 'rgba(30,70,130,.55)'; g.fillText(L.name, cx, cy + b * 1.12 + 14); }
  requestAnimationFrame(frame);

  // ---------- click the water: the almanac ----------
  let down = null; H().arena.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; }, true);
  H().arena.addEventListener('click', e => { const L = active() ? ST[placeId()] : null; if (!L || !window.__almanac) return; if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const tg = e.target; if (!(tg === H().arena || tg === H().floor || tg.tagName === 'CANVAS' || tg.id === 'web')) return;
    const p = H().toWorld(e.clientX, e.clientY); if (!inside(L, p.x, p.y, 1)) return; window.__almanac.show(true); H().log('lake_open', {}); });

  window.__lake = {
    level: () => { const L = active() ? ST[placeId()] : null; return L ? Math.round(L.level * 1000) / 1000 : null; },
    shelter: c => { const L = active() ? ST[placeId()] : null; return L && inside(L, c.x, c.y, 1.45) ? 0.35 : 1; },
    shoreFor: (c, max) => { const L = active() ? ST[placeId()] : null; if (!L) return null; const sp = shorePt(L, c); return Math.hypot(wdx(c.x, sp.x), wdy(c.y, sp.y)) < max ? sp : null; },
    gather: list => { const L = lake(); if (!L) return []; const t = now(), out = []; for (const c of list || []) { if (c.held || c.lab) continue; if (c.state === 'hide') { c.until = 0; c.hideWhy = null; } const sp = shorePt(L, c); H().goto(c, sp.x, sp.y); c.userUntil = t + 12000; out.push(c.name); } return out; },
    shift: (dx, dy) => { const L = ST[placeId()]; if (L) { L.x += dx; L.y += dy; save(); } },
    state: () => JSON.parse(JSON.stringify(ST)),
    merge: o => { if (!o) return; for (const [id, L] of Object.entries(o)) if (!ST[id]) ST[id] = JSON.parse(JSON.stringify(L)); else { const m = ST[id]; m.sed = Math.max(m.sed || 0, L.sed || 0); m.calmed = Math.max(m.calmed || 0, L.calmed || 0); m.caught = Math.max(m.caught || 0, L.caught || 0); } save(); },
    info: () => { const L = active() ? ST[placeId()] : null; return L ? { name: L.name, x: L.x, y: L.y, level: L.level, rx: rx(L), ry: ry(L), fish: L.fish.length, sed: L.sed, shore: L.shore || 0, calmed: L.calmed, caught: L.caught } : null; },
    move: (x, y) => { const L = lake(); if (L) { L.x = x; L.y = y; save(); } }, lake, tick };
  // in the keep, a reshuffled or evolved plan can put a wall through the water: move it to open floor
  setInterval(() => { const L = active() && kind() === 'keep' ? ST[placeId()] : null; if (!L) return; const rooms = H().keepRooms(); if (rooms.length && !rooms.some(q => L.x - 120 > q.x0 && L.x + 120 < q.x1 && L.y - 80 > q.y0 && L.y + 80 < q.y1)) { const s = site(); if (s) { L.x = Math.round(s.x); L.y = Math.round(s.y); save(); } } }, 30000);
})();
