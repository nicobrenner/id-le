// idle-halloween.js: Halloween mode (Oct 31, 2026). The switch, and the look: a moonlit night, jack-o'-lanterns on the floor, a costume
// on every creature, bat flocks crossing the sky, and ghosts of the creatures that are resting. Mode only: nothing here changes the saved
// world (costumes and pumpkins are drawn on top and vanish when the mode is off).
//
// THE SWITCH (also loaded on its own by pedia.html, so on()/set() need nothing from the arena):
//   localStorage 'idle.halloween' = 'on' | 'off' (missing = automatic). on() is true when:
//     the URL has ?halloween (any date: for testing and sharing; wins over a stored 'off'), or
//     the stored value is 'on', or
//     nothing stored and the local date is Oct 31 (all day) or Nov 1 before 06:00.
//   set(bool) stores 'on'/'off'. Changes dispatch document 'idle:halloween' {detail:{on}}; onChange(cb) subscribes.
//   The first time it turns on in a browser, one notice (key 'idle.halloween.seen').
(() => {
  const KEY = 'idle.halloween', SEEN = 'idle.halloween.seen';
  // ?halloween, or a shared Wikipedia world about Halloween (?from_wiki=…/wiki/Halloween, ?wiki=Jack-o'-lantern, Samhain…): on for this visit
  const wikiQ = (() => { try { const q = new URLSearchParams(location.search); return decodeURIComponent((q.get('from_wiki') || '').split('/wiki/')[1] || q.get('wiki') || ''); } catch (e) { return ''; } })();
  const forced = /[?&]halloween\b/.test(location.search) || /hallowe.?en|jack-o.?-?lantern|samhain|all hallows|trick-or-treat/i.test(wikiQ);
  const stored = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const night = (d = new Date()) => (d.getMonth() === 9 && d.getDate() === 31) || (d.getMonth() === 10 && d.getDate() === 1 && d.getHours() < 6);
  const on = () => forced || stored() === 'on' || (stored() !== 'off' && night());
  const cbs = []; let last = on();
  const fire = () => { const v = on(); if (v === last) return; last = v; cbs.forEach(f => { try { f(v); } catch (e) {} }); document.dispatchEvent(new CustomEvent('idle:halloween', { detail: { on: v } })); };
  function set(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} fire(); }
  window.__halloween = { on, set, onChange: cb => cbs.push(cb), auto: night, forced: () => forced };
  setInterval(fire, 60000);   // the automatic window opens and closes on its own (midnight, 6 am)
  if (!document.getElementById('arena')) return;   // the pedia only needs the switch

  // ---------- the look ----------
  const $ = s => document.querySelector(s), arena = $('#arena');
  const dark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  const low = () => !!(window.__quality && window.__quality.low);
  const keep = () => arena.classList.contains('keep');
  const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 15; return h >>> 0; };
  const NIGHT = (() => { const d = new Date(); if (d.getMonth() === 10 && d.getDate() === 1) d.setDate(0); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); })();   // costumes stay put for the night

  const css = document.createElement('style'); css.textContent = `
#hwnight{position:absolute;inset:0;pointer-events:none;z-index:5;background:radial-gradient(120% 90% at 82% 8%,#6b4bd833,transparent 55%),linear-gradient(180deg,#2a124866,#1a0c3055 60%,#ff6a0022);mix-blend-mode:multiply;display:none}
#hwfog{position:absolute;left:0;right:0;bottom:0;height:22%;pointer-events:none;z-index:5;background:linear-gradient(0deg,#d8c8ff55,#d8c8ff22 45%,transparent);animation:hwfog 14s ease-in-out infinite alternate;display:none}
#hwmoon{position:absolute;top:58px;right:9%;width:86px;height:86px;border-radius:50%;pointer-events:none;z-index:5;background:radial-gradient(circle at 38% 36%,#fffbe8,#f3e2a6 55%,#d9c27a 72%);box-shadow:0 0 40px 14px #fff3c455,0 0 120px 40px #b79cff33;display:none}
#hwmoon::after{content:'';position:absolute;width:18px;height:14px;left:48px;top:44px;border-radius:50%;background:#cdb46f88;box-shadow:-30px -18px 0 -3px #cdb46f66,-14px 10px 0 -5px #cdb46f55}
#hwsky{position:absolute;inset:0;pointer-events:none;z-index:6;display:none}
@media (prefers-color-scheme:dark){#hwnight{mix-blend-mode:normal;background:radial-gradient(120% 90% at 82% 8%,#7b5cff22,transparent 55%),linear-gradient(180deg,#1a083033,#0a041833 60%,#ff6a0018)}#hwfog{background:linear-gradient(0deg,#9b86d844,#9b86d814 45%,transparent)}}
#arena.hw #hwnight,#arena.hw #hwfog,#arena.hw #hwmoon,#arena.hw #hwsky{display:block}
#arena.hw.keep #hwnight,#arena.hw.keep #hwfog{display:none}#arena.hw.keep #hwmoon{filter:grayscale(1) contrast(1.6)}#arena.hw.keep #hwsky{filter:grayscale(1) contrast(2)}
#arena.hw .word.hwpk{background:#e8620c!important;color:#ffe27a!important;border:1px solid #7a2c04!important;border-radius:11px!important;font-weight:700;text-shadow:0 0 3px #ffb300,0 0 7px #ff8a00;animation:hwflick 2.8s infinite steps(6)}
#arena.hw .word.hwpk::before{content:'▴▴ ';font-size:10px;color:#ffe27a}
#arena.hw.keep .word.hwpk{border-radius:40%!important;animation:none}
@keyframes hwflick{0%,100%{text-shadow:0 0 3px #ffb300,0 0 7px #ff8a00}40%{text-shadow:0 0 2px #ffb300,0 0 4px #ff8a00}55%{text-shadow:0 0 4px #ffd000,0 0 10px #ff8a00}}
@keyframes hwfog{from{transform:translateX(-3%)}to{transform:translateX(3%)}}
@media (prefers-reduced-motion:reduce){#arena.hw .word.hwpk,#hwfog{animation:none}}`;
  document.head.appendChild(css);
  const mk = (tag, id) => { const e = document.createElement(tag); e.id = id; return e; };
  const nightEl = mk('div', 'hwnight'), fog = mk('div', 'hwfog'), moon = mk('div', 'hwmoon'), sky = mk('canvas', 'hwsky');
  const dl = $('#daylight'); (dl ? dl.after.bind(dl) : arena.prepend.bind(arena))(nightEl, fog, moon, sky);

  // ---------- jack-o'-lanterns (the words canvas copies a word's solid background, border, radius, colour and ::before text, so the look stays within those): about 1 word in 8 (by its text, so the same words every time), at most 36 ----------
  const PK_MAX = 36; let pkN = 0;
  function pumpkins() { if (!on()) return; for (const el of document.querySelectorAll('#floor .word:not([data-hw])')) { el.dataset.hw = '1'; const t = el.textContent || ''; if (pkN < PK_MAX && t.length >= 2 && t.length <= 9 && hash(t + NIGHT) % 8 === 0) { el.classList.add('hwpk'); pkN++; } } }
  function unpumpkin() { for (const el of document.querySelectorAll('#floor .word[data-hw]')) { el.classList.remove('hwpk'); delete el.dataset.hw; } pkN = 0; }
  setInterval(pumpkins, 4000);

  // ---------- costumes: one per creature for the night; families lean to some ----------
  const COSTUMES = ['sheet', 'hat', 'wings', 'bones', 'pumpkin', 'cape'];
  const LEAN = { chip: ['wings', 'hat', 'bones'], tri: ['hat', 'cape'], orb: ['pumpkin', 'sheet'], long: ['bones', 'wings'] };
  function costumeOf(c) { if (c._hwN === NIGHT) return c._hw; const h = hash((c.uid || c.key || c.name || '') + NIGHT), L = LEAN[c.g && c.g.body]; c._hwN = NIGHT; c._hw = L && h % 3 ? L[(h >>> 3) % L.length] : COSTUMES[(h >>> 5) % COSTUMES.length]; return c._hw; }
  const shyK = c => { try { const s = window.__looks && window.__looks.showOf ? window.__looks.showOf(c) : (c.g && c.g.showy != null ? c.g.showy : 0.5); return s <= 0.34 ? 0.45 : 1; } catch (e) { return 1; } };
  function drawCostume(g, c, t) {
    if (!last || !c || !c.g) return; if (window.__hwCam && !c._replay && window.__hwCam().z < 0.4) return;   // too small to see when zoomed far out: saves the work with big crowds
    const k = costumeOf(c), G = c.gs || c.g, L = (G.bodyL || 20), Wd = (G.bodyW || 12), a = c.heading || 0;
    g.save(); g.translate(c.x, c.y); g.rotate(a); g.globalAlpha *= shyK(c); g.lineJoin = 'round';
    const head = L * 0.55;
    if (k === 'sheet') { g.fillStyle = '#f4f2ffe6'; g.strokeStyle = '#8a80b0'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(head + 2, 0);
      g.bezierCurveTo(head + 2, -Wd * 1.1, -L * 0.2, -Wd * 1.25, -L * 0.62, -Wd * 0.9); for (let i = 0; i < 4; i++) { const y = -Wd * 0.9 + (i + 0.5) * Wd * 0.45; g.lineTo(-L * 0.78 - (i % 2) * 3 + Math.sin(t / 220 + i) * 1.5, y); }
      g.lineTo(-L * 0.62, Wd * 0.9); g.bezierCurveTo(-L * 0.2, Wd * 1.25, head + 2, Wd * 1.1, head + 2, 0); g.fill(); g.stroke(); g.fillStyle = '#1c1630';
      g.beginPath(); g.ellipse(head * 0.55, -Wd * 0.32, 1.7, 2.4, 0, 0, 7); g.ellipse(head * 0.55, Wd * 0.32, 1.7, 2.4, 0, 0, 7); g.fill(); }
    else if (k === 'hat') { g.fillStyle = '#2b1640'; g.strokeStyle = '#ff8a1e'; g.lineWidth = 1; const x = head * 0.45; g.beginPath(); g.ellipse(x, 0, Wd * 0.45, Wd * 0.95, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - Wd * 0.15, -Wd * 0.55); g.lineTo(x + Wd * 1.3, -Wd * 0.25 + Math.sin(t / 400) * 1.2); g.lineTo(x - Wd * 0.15, Wd * 0.55); g.closePath(); g.fill(); g.beginPath(); g.moveTo(x + Wd * 0.05, -Wd * 0.48); g.lineTo(x + Wd * 0.05, Wd * 0.48); g.stroke(); }
    else if (k === 'wings') { const f = Math.sin(t / 110 + (c.phase || 0)) * 0.35 + 0.65; g.fillStyle = '#231a33dd'; g.strokeStyle = '#7d5bd0'; g.lineWidth = 0.8;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(L * 0.1, s * Wd * 0.4); g.lineTo(-L * 0.05, s * Wd * (1.0 + 1.3 * f)); g.lineTo(-L * 0.3, s * Wd * (0.9 + 0.8 * f)); g.lineTo(-L * 0.42, s * Wd * (1.1 + 1.1 * f)); g.lineTo(-L * 0.55, s * Wd * (0.7 + 0.6 * f)); g.lineTo(-L * 0.4, s * Wd * 0.35); g.closePath(); g.fill(); g.stroke(); } }
    else if (k === 'bones') { g.strokeStyle = '#f6f1e3'; g.lineWidth = Math.max(1.2, Wd * 0.13); g.lineCap = 'round'; g.beginPath(); g.moveTo(-L * 0.5, 0); g.lineTo(L * 0.45, 0);
      for (let i = 0; i < 4; i++) { const x = -L * 0.35 + i * L * 0.22; g.moveTo(x, -Wd * 0.55); g.quadraticCurveTo(x + 2, 0, x, Wd * 0.55); } g.stroke(); g.fillStyle = '#f6f1e3'; g.beginPath(); g.arc(head * 0.9, 0, Wd * 0.38, 0, 7); g.fill();
      g.fillStyle = '#1c1630'; g.beginPath(); g.arc(head * 0.95, -Wd * 0.14, Wd * 0.09, 0, 7); g.arc(head * 0.95, Wd * 0.14, Wd * 0.09, 0, 7); g.fill(); }
    else if (k === 'pumpkin') { const r = Math.max(5, Wd * 0.75), x = head * 0.75; g.fillStyle = '#f07a18'; g.strokeStyle = '#8a3a06'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, 0, r * 0.9, r, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(x, 0, r * 0.4, r, 0, 0, 7); g.stroke(); g.fillStyle = '#3f7a2a'; g.fillRect(x + r * 0.75, -1.2, 3, 2.4);
      const fl = 0.75 + 0.25 * Math.sin(t / 90 + (c.phase || 0) * 3); g.fillStyle = `rgba(255,${200 + 30 * fl | 0},60,${fl})`; g.beginPath(); g.moveTo(x + r * 0.2, -r * 0.45); g.lineTo(x - r * 0.1, -r * 0.2); g.lineTo(x + r * 0.2, -r * 0.05);
      g.moveTo(x + r * 0.2, r * 0.45); g.lineTo(x - r * 0.1, r * 0.2); g.lineTo(x + r * 0.2, r * 0.05); g.moveTo(x - r * 0.35, -r * 0.4); g.lineTo(x - r * 0.55, 0); g.lineTo(x - r * 0.35, r * 0.4); g.lineTo(x - r * 0.45, 0); g.fill(); }
    else if (k === 'cape') { const sw = Math.sin(t / 260 + (c.phase || 0)) * 0.12; g.fillStyle = '#7a1030dd'; g.strokeStyle = '#2a0610'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(L * 0.25, -Wd * 0.7);
      g.quadraticCurveTo(-L * 0.4, -Wd * (1.4 + sw), -L * 1.05, -Wd * (0.9 - sw)); g.lineTo(-L * 1.05, Wd * (0.9 + sw)); g.quadraticCurveTo(-L * 0.4, Wd * (1.4 - sw), L * 0.25, Wd * 0.7); g.closePath(); g.fill(); g.stroke(); }
    g.restore(); }
  window.__hwDraw = drawCostume;

  // ---------- the sky layer: bat flocks and ghosts of resting creatures (screen space, runs only while something is up) ----------
  const sg = sky.getContext('2d'); let raf = 0, flocks = [], ghosts = [], dpr = 1;
  function fit() { dpr = Math.min(2, devicePixelRatio || 1); const r = arena.getBoundingClientRect(); sky.width = Math.max(1, r.width * dpr | 0); sky.height = Math.max(1, r.height * dpr | 0); }
  addEventListener('resize', () => { if (on()) fit(); });
  function bat(x, y, s, f) { sg.beginPath(); sg.moveTo(x, y); sg.quadraticCurveTo(x - 5 * s, y - 6 * s * f, x - 11 * s, y - 2 * s * f); sg.quadraticCurveTo(x - 7 * s, y, x - 8 * s, y + 3 * s); sg.quadraticCurveTo(x - 4 * s, y + 1 * s, x, y + 3 * s);
    sg.quadraticCurveTo(x + 4 * s, y + 1 * s, x + 8 * s, y + 3 * s); sg.quadraticCurveTo(x + 7 * s, y, x + 11 * s, y - 2 * s * f); sg.quadraticCurveTo(x + 5 * s, y - 6 * s * f, x, y); sg.fill(); }
  function spawnFlock() { if (!on() || low() || document.hidden) return; const W = sky.width / dpr, H = sky.height / dpr, dir = Math.random() < 0.5 ? 1 : -1, n = 5 + (Math.random() * 7 | 0), y0 = 70 + Math.random() * H * 0.45;
    flocks.push({ dir, t0: performance.now(), dur: 9000 + Math.random() * 5000, W, bats: Array.from({ length: n }, () => ({ dx: (Math.random() - 0.5) * 120, dy: (Math.random() - 0.5) * 70, ph: Math.random() * 6, s: 0.7 + Math.random() * 0.6, wob: Math.random() * 6 })), y0 }); go(); }
  function spawnGhost() { if (!on() || document.hidden) return; const H = window.__herd, cd = window.__critDraw; if (!H || !cd || !H.list) return; const rest = H.list().filter(r => r && r.genome); if (!rest.length) return;
    const r = rest[Math.random() * rest.length | 0], W = sky.width / dpr, Hh = sky.height / dpr, dir = Math.random() < 0.5 ? 1 : -1;
    const c = { g: r.genome, size: 1, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, heading: dir > 0 ? 0 : Math.PI, state: 'idle', held: false, phase: Math.random() * 6, name: r.name };
    try { cd.buildLegs(c); } catch (e) { return; } ghosts.push({ c, dir, t0: performance.now(), dur: 14000, x0: dir > 0 ? -60 : W + 60, y0: Hh * (0.3 + Math.random() * 0.45), W }); go();
    document.dispatchEvent(new CustomEvent('idle:ghost', { detail: { name: r.name || '' } })); }   // the haunted music answers it (idle-music.js)
  function go() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) { raf = 0; sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, sky.width, sky.height); if (!last) { flocks = []; ghosts = []; return; }
    sg.setTransform(dpr, 0, 0, dpr, 0, 0); const dk = dark();
    flocks = flocks.filter(F => now - F.t0 < F.dur); for (const F of flocks) { const p = (now - F.t0) / F.dur, cx = F.dir > 0 ? -140 + p * (F.W + 280) : F.W + 140 - p * (F.W + 280);
      sg.fillStyle = dk ? '#0b0614' : '#1d1029'; sg.globalAlpha = Math.min(1, Math.min(p, 1 - p) * 8) * 0.9;
      for (const b of F.bats) bat(cx + b.dx + Math.sin(now / 400 + b.wob) * 10, F.y0 + b.dy + Math.sin(now / 300 + b.wob) * 8 - p * 30, b.s * 1.1, Math.sin(now / 70 + b.ph)); sg.globalAlpha = 1; }
    ghosts = ghosts.filter(G => now - G.t0 < G.dur); const z = window.__hwCam ? Math.min(1.4, Math.max(0.5, window.__hwCam().z)) : 1;
    for (const G of ghosts) { const p = (now - G.t0) / G.dur, c = G.c, x = G.x0 + G.dir * p * (G.W + 120), y = G.y0 + Math.sin(now / 900 + c.phase) * 18;
      c.x = x / z; c.y = y / z; c.vx = G.dir * 0.6; try { window.__critDraw.stepLegs && window.__critDraw.stepLegs(c); } catch (e) {}
      sg.save(); sg.globalAlpha = 0.32 * Math.min(1, Math.min(p, 1 - p) * 6); sg.setTransform(dpr * z, 0, 0, dpr * z, 0, 0);
      sg.fillStyle = dk ? '#cfc4ff' : '#ffffff'; sg.shadowColor = '#b9a8ff'; sg.shadowBlur = 18; sg.beginPath(); sg.arc(c.x, c.y, ((c.g.bodyL || 20) * 0.9), 0, 7); sg.fill(); sg.shadowBlur = 0;
      try { window.__critDraw.drawTo(sg, c, now, false); } catch (e) {} sg.restore();
      if (p > 0.4 && p < 0.42 && !G.said && c.name) { G.said = 1; } }
    if (flocks.length || ghosts.length) go(); else sg.clearRect(0, 0, sky.width, sky.height); }
  let tB = 0, tG = 0;
  function schedule() { clearTimeout(tB); clearTimeout(tG); if (!last) return;
    const nb = () => { tB = setTimeout(() => { spawnFlock(); nb(); }, 25000 + Math.random() * 35000); }, ng = () => { tG = setTimeout(() => { spawnGhost(); ng(); }, 40000 + Math.random() * 50000); };
    setTimeout(spawnFlock, 4000); nb(); ng(); }

  // ---------- turning it on and off ----------
  function apply(v) { arena.classList.toggle('hw', v); if (v) { fit(); pumpkins(); schedule(); } else { unpumpkin(); clearTimeout(tB); clearTimeout(tG); flocks = []; ghosts = []; go(); } }
  function greet() { const lines = ['Happy Halloween from the Oracle: everyone is in costume tonight, and some words have turned into pumpkins', 'The moon is up and the costumes are on. Resting creatures may drift by as ghosts, do not mind them'];
    const say = () => { if (window.__oracleSay) window.__oracleSay(lines[(Math.random() * lines.length) | 0]); else setTimeout(say, 1500); }; setTimeout(say, 6000); }
  function firstNotice() { let seen = false; try { seen = localStorage.getItem(SEEN) === '1'; localStorage.setItem(SEEN, '1'); } catch (e) {} if (seen) return;
    const n = () => window.__notify ? window.__notify({ kind: 'system', html: '🎃 Happy Halloween: the world is in costume tonight <button data-act="settings-open">⚙ to turn it off</button>', ttl: 20000, key: 'halloween' }) : setTimeout(n, 1500); setTimeout(n, 5000); }
  cbs.push(v => { apply(v); if (v) { firstNotice(); greet(); } if (window.__settings && window.__settings.rerender) window.__settings.rerender(); });
  const start = () => { apply(last); if (last) { firstNotice(); greet(); } };
  window.__halloween.test = { flock: spawnFlock, ghost: spawnGhost, state: () => ({ on: last, pumpkins: document.querySelectorAll('#floor .word.hwpk').length, flocks: flocks.length, ghosts: ghosts.length }) };
  if (document.readyState === 'complete') setTimeout(start, 0); else addEventListener('load', () => setTimeout(start, 0));

  // studio: a 🎃 switch in its header (the studio rebuilds its markup, so it is added whenever the header appears)
  new MutationObserver(() => { const sh = document.querySelector('#studio .sh'); if (!sh || sh.querySelector('.hwsw')) return; const b = document.createElement('button'); b.className = 'hwsw'; b.title = 'Halloween mode: costumes, pumpkins, bats and ghosts (mode only, the world is not changed)';
    const lab = () => { b.textContent = on() ? '🎃 Halloween: on' : '🎃 Halloween: off'; }; lab(); b.addEventListener('click', () => { set(!on()); lab(); }); cbs.push(lab); const x = sh.querySelector('button'); x ? x.before(b) : sh.appendChild(b); })
    .observe(document.body, { childList: true, subtree: true });
})();

// Easy to find, clear that it's on (Nico 10-31): while the mode is on, ⚙ (and the phone ☰) wear a small 🎃 badge, and a
// "🎃 Happy Halloween" chip sits at the top right; the chip opens ⚙ settings, where the switch is. × hides the chip for the night.
(() => {
  const H = window.__halloween; if (!H) return;
  const css = document.createElement('style');
  css.textContent = `html.hw-on #settingsBtn,html.hw-on #mMore{position:relative}
html.hw-on #settingsBtn::after,html.hw-on #mMore::after{content:"🎃";position:absolute;top:-7px;right:-7px;font-size:11px;line-height:1;pointer-events:none;filter:drop-shadow(0 1px 1px #0006)}
#hwChip{position:absolute;top:44px;right:12px;z-index:31;display:none;align-items:center;gap:6px;font:600 12px system-ui;padding:4px 6px 4px 10px;border-radius:14px;border:1px solid #e07a1f;background:#2a1636e6;color:#ffb35c;box-shadow:0 2px 10px #0005;cursor:pointer}
html.hw-on #hwChip.show{display:inline-flex}#hwChip button{border:0;background:none;color:inherit;opacity:.7;cursor:pointer;font-size:13px;padding:0 4px}
@media (prefers-color-scheme:light){#hwChip{background:#fff3e6f2;color:#9a3d00}}
@media (max-width:500px){#hwChip{top:auto;bottom:96px;right:8px}}`;
  document.head.appendChild(css);
  const KEY = 'idle.hwChipGone', night = () => new Date().toDateString();
  const chip = document.createElement('div'); chip.id = 'hwChip'; chip.title = 'Halloween mode is on: open ⚙ settings to switch it off';
  chip.innerHTML = '<span>🎃 Happy Halloween</span><button title="hide this for tonight">×</button>';
  chip.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { try { localStorage.setItem(KEY, night()); } catch (er) {} chip.classList.remove('show'); return; } if (window.__settings) window.__settings.open(); });
  const sync = v => { document.documentElement.classList.toggle('hw-on', !!v); let gone = false; try { gone = localStorage.getItem(KEY) === night(); } catch (e) {} chip.classList.toggle('show', !!v && !gone); };
  const mount = () => { (document.getElementById('arena') || document.body).appendChild(chip); sync(H.on()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  H.onChange(sync);
})();
