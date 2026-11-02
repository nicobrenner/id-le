// idle-boot.js: the boot, a terminal prelude to Epoch 0 (Nico, Nov 2: "before the start, we need something like a cool DOS/linux terminal…";
// script: boot-script.md). A CRT wakes, a globe made of letters spins (faux 3D, drawn here as a character grid), the lab node boots with
// made-up future versions, the operator logs in, types "run project 24" at a powerline prompt, and the screen splits like a terminal
// multiplexer: TRAINING LOSS · project 24, MODEL SAMPLE DIALOG OUTPUTS, the training log, the GPUs. Epoch 0 (idle-epoch0.js) then runs inside
// those panes: it asks panes() for its layout and draws chrome() around itself every frame.
// Nothing here is real hardware or a real product: the numbers are invented, there are no vendor logos.
// Before it, in the storyline (and ?intro=boot): arriving at the lab (boot-script.md, v3b): a driverless cab in the storm and a messages
// thread on a phone held in both hands, the lab door's keycard reader, then a dim hallway where the scientist and Lester talk.
// API: window.__termBoot = { dur, draw(g, W, H, T, P, RM), panes(W, H, P), chrome(g, W, H, Tf, P, RM, o), overlay(g, W, H, a),
//   arrive: { dur, draw, fire, fireAll, beds, lines }, beds(ctx, dest, T, at) (continuous sounds already under way at T),
//   fire(ctx, dest, T0, T1, at) (live sound for boot seconds T0..T1), fireAll(ctx, dest, t0) (recordings) }.
(() => {
  const BG = '#06090b', TXT = '#b9c6cc', DIM = '#5d6b74', OK = '#7fd38a', AMB = '#f0b45a', RED = '#ff5d5d', CY = '#7ee3f5', MAG = '#e0367a', BORDER = '#22323c', ACT = '#4fae63';
  const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ease = u => u * u * (3 - 2 * u);
  const portOf = (W, H, P) => !!P || W < H * 1.1;
  // ---------- the script's clock (seconds) ----------
  const CMD = 'run project 24', USER = 'operator', PASS = '**********';
  // "run project 24" is typed by a person: 110–140 ms a key (Nico: "should have bigger fonts, and happen slightly slower")
  const CK = (() => { let t = 9.5; return [...CMD].map((c, i) => (t += 0.11 + 0.03 * (((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1))); })();
  const K = { globe: 0.25, log: 2.35, login: 6.65, user: 6.85, pass: 7.7, last: 8.5, welcome: 8.75, shell: 9.05, cmd: 9.5, enter: CK[CK.length - 1] + 0.35 };
  K.split = K.enter + 0.7; const DUR = K.split + 1.15;
  // the boot log: [text, status, status colour, seconds it takes, shown on phones]
  const LOG = [
    ['LAB-BIOS 41.7 · observatory node 07', '', DIM, 0.24, 1],
    ['ø Id|le OS v 0/67', '', '#e9f6ff', 0.55, 1, 'os'],
    ['cpu: 4 × 512 cores', 'OK', OK, 0.2, 1],
    ['unified memory: 1.0 TiB', 'checked', OK, 0.62, 1],
    ['fabric: 8 links, 9.6 TB/s', 'OK', OK, 0.18, 0],
    ['gpu0–gpu7: 8 × 128 GB, coherent', 'OK', OK, 0.24, 1],
    ['driver nvx 912.04', 'loaded', OK, 0.2, 1],
    ['cuda 15.2 runtime, compute 14.0', 'OK', OK, 0.2, 1],
    ['torch 4.1.0+cu152', 'OK', OK, 0.22, 1],
    ['graph cache: 2,113 kernels', 'warm', OK, 0.18, 0],
    ['tokenizer: byte-pair, 8k vocab', 'OK', OK, 0.2, 1],
    ['/lab/universes: 23 runs archived', 'mounted', OK, 0.24, 1],
    ['thermals: 31 °C', 'OK', OK, 0.16, 0],
    ['safety interlock', 'BYPASSED', AMB, 0.62, 1],
    ['oracle-trainer.service', 'ready', CY, 0.2, 1]];
  let t = K.log; const LOGT = LOG.map(l => { const a = t; t += l[3]; return a; });
  // the keys: a little irregular, like a person typing
  const typed = (s, t0, cps, T, RM) => RM ? (T >= t0 ? s : '') : s.slice(0, clamp(Math.floor((T - t0) * cps), 0, s.length));
  const keyTimes = (s, t0, cps) => [...s].map((c, i) => t0 + (i + 0.5 + 0.35 * Math.sin(i * 2.3)) / cps);
  const cmdTyped = (T, RM) => RM ? (T >= K.cmd ? CMD : '') : CMD.slice(0, CK.filter(t => t <= T).length);
  const SHELL_OUT = [[K.enter + 0.17, '▸ project 24: a tiny language model, trained from scratch'], [K.enter + 0.33, '▸ gpu0–7 allocated · 1.0 TiB pinned'], [K.enter + 0.49, '▸ opening panes: loss · samples · gpu']];
  const SHELL_OUT_P = [[K.enter + 0.17, '▸ project 24: a tiny model, from scratch'], [K.enter + 0.33, '▸ gpu0–7 allocated'], [K.enter + 0.49, '▸ opening panes']];

  // ---------- the panes (a terminal multiplexer's layout) ----------
  function panes(W, H, P) {
    const port = portOf(W, H, P), statusH = port ? 20 : 22, bandH = port ? 86 : 88, yb = H - statusH - bandH;
    const pfz = port ? 10 : Math.round(clamp(W / 108, 10, 13)), tfz = port ? 11 : Math.round(clamp(W / 96, 11, 14));
    let loss, samples, log, gpu;
    if (port) { const a = yb * 0.27, b = yb * 0.53, c = yb * 0.11; loss = { x: 0, y: 0, w: W, h: a }; samples = { x: 0, y: a, w: W, h: b }; log = { x: 0, y: a + b, w: W, h: c }; gpu = { x: 0, y: a + b + c, w: W, h: yb - a - b - c }; }
    else { const lw = Math.round(W * 0.42), lh = Math.round(yb * 0.6), sh = Math.round(yb * 0.76); loss = { x: 0, y: 0, w: lw, h: lh }; log = { x: 0, y: lh, w: lw, h: yb - lh }; samples = { x: lw, y: 0, w: W - lw, h: sh }; gpu = { x: lw, y: sh, w: W - lw, h: yb - sh }; }
    loss.title = 'TRAINING LOSS · project 24'; samples.title = 'MODEL SAMPLE DIALOG OUTPUTS'; log.title = port ? 'TRAINING LOG' : 'TRAINING LOG · operator@lab-07'; gpu.title = port ? 'GPU · 8 × 128 GB' : 'GPU · 8 × 128 GB · 1.0 TiB unified';
    loss.n = 0; samples.n = 1; log.n = 2; gpu.n = 3;
    return { port, statusH, band: { y: yb, h: bandH }, yb, pfz, tfz, titleH: tfz + 10, loss, samples, log, gpu, list: [loss, samples, log, gpu] }; }

  // ---------- drawing helpers ----------
  let ovKey = '', ovScan = null, ovVig = null;
  function overlay(g, W, H, a = 1) {   // CRT: scanlines and a vignette, very light
    if (a <= 0) return; const key = W + 'x' + H;
    if (key !== ovKey || !ovScan) { ovKey = key; const c = document.createElement('canvas'); c.width = 4; c.height = 3; const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, 2, 4, 1); ovScan = g.createPattern(c, 'repeat');
      ovVig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); ovVig.addColorStop(0, 'rgba(0,0,0,0)'); ovVig.addColorStop(1, 'rgba(0,0,0,0.55)'); }
    g.save(); g.globalAlpha = a; if (ovScan) { g.fillStyle = ovScan; g.fillRect(0, 0, W, H); } g.fillStyle = ovVig; g.fillRect(0, 0, W, H); g.restore(); }
  // the agnoster-style prompt: coloured segments joined by arrow tips
  function prompt(g, x, y, fz, port) {
    const segs = port ? [['operator', '#2b2b2b', '#e6e6e6'], ['~/universes', '#2f6fb5', '#eef4ff'], ['⎇ main', '#4f9a4a', '#0b120b']]
      : [['operator@lab-07', '#2b2b2b', '#e6e6e6'], ['~/universes', '#2f6fb5', '#eef4ff'], ['⎇ main ✔', '#4f9a4a', '#0b120b']];
    const h = fz * 1.35, tip = h * 0.42, pad = fz * 0.55; g.font = `${fz}px ${MONO}`; g.textBaseline = 'middle'; let cx = x;
    segs.forEach(([s, bg, fg], i) => { const w = g.measureText(s).width + pad * 2 + (i ? tip : 0);
      g.fillStyle = bg; g.fillRect(cx, y - h / 2, w, h); g.fillStyle = fg; g.fillText(s, cx + pad + (i ? tip : 0), y + 1);
      const nx = cx + w; g.fillStyle = bg; g.beginPath(); g.moveTo(nx, y - h / 2); g.lineTo(nx + tip, y); g.lineTo(nx, y + h / 2); g.closePath(); g.fill(); cx = nx; });
    return cx + tip + fz * 0.6; }
  function cursor(g, x, y, fz, T, on = true) { if (on && Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = TXT; g.fillRect(x, y - fz * 0.55, fz * 0.58, fz * 1.1); } }
  function statusBar(g, W, H, p, T, a = 1, win = 'train') {
    if (a <= 0) return; const y = H - p.statusH, fz = p.port ? 10 : 12; g.save(); g.globalAlpha = a; g.fillStyle = ACT; g.fillRect(0, y, W, p.statusH);
    g.font = `${fz}px ${MONO}`; g.textBaseline = 'middle'; g.fillStyle = '#071007';
    g.fillText(p.port ? `[p24] 0:${win}*` : `[project-24] 0:train${win === 'train' ? '*' : ''} 1:samples 2:gpu  3:${win === 'sh' ? 'sh*' : 'sh'}`, 8, y + p.statusH / 2 + 1);
    const d = new Date(), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); g.textAlign = 'right';
    g.fillText(p.port ? `lab-07 ${hh}` : `"lab-node-07" ${hh} · uptime 00:00:${String(Math.floor(T)).padStart(2, '0')}`, W - 8, y + p.statusH / 2 + 1); g.restore(); }
  function frameOf(g, r, p, title, a, active) {   // one pane: its border, a title bar, its number
    if (a <= 0) return; g.save(); g.globalAlpha = a; g.strokeStyle = active ? ACT : BORDER; g.lineWidth = 1; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.fillStyle = '#0b1419'; g.fillRect(r.x + 1, r.y + 1, r.w - 2, p.titleH); g.font = `700 ${p.tfz}px ${MONO}`; g.textBaseline = 'middle'; g.fillStyle = CY;
    g.fillText(title, r.x + 9, r.y + 1 + p.titleH / 2 + 1); g.fillStyle = DIM; g.textAlign = 'right'; g.font = `${p.tfz - 1}px ${MONO}`; g.fillText(String(r.n), r.x + r.w - 8, r.y + 1 + p.titleH / 2 + 1); g.restore(); }

  // ---------- the globe made of letters (faux 3D: a sphere sampled on a character grid, lit, with a ring of text around it) ----------
  const RING = ' · PROJECT 24 · TINY ORACLE · LAB NODE 07';
  function globe(g, cx, cy, R, fz, T, a, RM) {
    if (a <= 0) return; const cw = fz * 0.62, ch = fz * 1.05, cols = Math.ceil(R * 2.6 / cw), rows = Math.ceil(R * 2.3 / ch), spin = RM ? 0.6 : T * 1.15, tilt = 0.42;
    const cs = Math.cos(spin), sn = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt), Lx = -0.45, Ly = -0.55, Lz = 0.7;
    g.save(); g.globalAlpha = a; g.font = `${fz}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const LAND = ':ilIdDLE', SEA = ' ..·:-=';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = (c + 0.5) * cw - cols * cw / 2, py = (r + 0.5) * ch - rows * ch / 2, d2 = px * px + py * py; if (d2 >= R * R) continue;
      const nx = px / R, ny = py / R, nz = Math.sqrt(1 - d2 / (R * R)), lit = 0.16 + 0.84 * clamp(nx * Lx + ny * Ly + nz * Lz, 0, 1);   // a little ambient: the night side stays faintly drawn
      // back to the globe's own frame: undo the tilt (x axis), then the spin (y axis)
      const y1 = ny * ct + nz * st, z1 = -ny * st + nz * ct, x2 = nx * cs - z1 * sn, z2 = nx * sn + z1 * cs, lat = Math.asin(clamp(y1, -1, 1)), lon = Math.atan2(x2, z2);
      const land = Math.sin(3 * lon + 1.3) * Math.cos(2.2 * lat) + 0.6 * Math.sin(5 * lon - 2 * lat + 0.7) + 0.3 * Math.cos(7 * lat) > 0.38;
      const grid = Math.abs(((lon / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.46 || Math.abs(((lat / (Math.PI / 8)) % 1 + 1) % 1 - 0.5) > 0.45;
      let chr, col; if (land) { chr = LAND[Math.min(LAND.length - 1, Math.floor(lit * LAND.length))]; col = `hsl(${168 + lit * 20},${50 + lit * 30}%,${22 + lit * 52}%)`; }
      else if (grid) { chr = '+'; col = `hsl(200,40%,${14 + lit * 26}%)`; } else { chr = SEA[Math.min(SEA.length - 1, Math.floor(lit * SEA.length))]; col = `hsl(212,45%,${12 + lit * 30}%)`; }
      if (chr === ' ') continue; g.fillStyle = col; g.fillText(chr, cx + px, cy + py); }
    // the ring: letters on a tilted circle; the half behind the globe is hidden by it
    for (let i = 0; i < RING.length * 2; i++) { const th = i / (RING.length * 2) * Math.PI * 2 - spin * 0.6, rx = Math.cos(th) * R * 1.45, rz = Math.sin(th) * R * 1.45, ry = rz * 0.28;
      if (rz < 0 && rx * rx + ry * ry < R * R) continue; g.fillStyle = rz < 0 ? '#3d5560' : MAG; g.globalAlpha = a * (rz < 0 ? 0.55 : 0.95); g.fillText(RING[i % RING.length], cx + rx, cy + ry); }
    g.restore(); }

  // ---------- the boot itself (T: seconds, 0..DUR) ----------
  function draw(g, W, H, T, P, RM) {
    const p = panes(W, H, P), port = p.port, fz = port ? Math.round(clamp(W / 34, 10, 12)) : Math.round(clamp(W / 78, 11, 17)), lh = fz * 1.42, pad = port ? 12 : 26;
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    if (!RM && T < 0.32) { const u = ease(T / 0.32); g.fillStyle = '#dff6ff'; g.globalAlpha = 1 - u * 0.4; g.fillRect(W / 2 - W * 0.5 * u, H / 2 - 1 - u * 2, W * u, 2 + u * 4); g.globalAlpha = 1; return; }   // the tube warms up: a line that opens
    if (T < K.log + 0.2) {   // the globe, a title, a progress bar
      const a = clamp((T - K.globe) / 0.4) * (1 - clamp((T - (K.log - 0.25)) / 0.4)), R = Math.min(W, H) * (port ? 0.3 : 0.24);
      globe(g, W / 2, H * 0.44, R, Math.max(9, Math.round(R / 9.5)), T, a, RM);
      g.save(); g.globalAlpha = a; g.font = `${fz}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = DIM;
      g.fillText('lab node 07 · universe observatory', W / 2, H * 0.44 + R * 1.38);
      const n = 24, k = Math.floor(clamp((T - 0.3) / (K.log - 0.5)) * n); g.fillStyle = CY; g.fillText('[' + '#'.repeat(k) + '.'.repeat(n - k) + ']', W / 2, H * 0.44 + R * 1.38 + lh * 1.3); g.restore();
      if (T < K.log) { overlay(g, W, H); return; } }
    if (T < K.shell) {   // the boot log, then the login, scrolling like a console
      const rowsMax = Math.floor((H - pad * 2) / lh), lines = [], width = port ? 31 : 44;
      LOG.forEach((l, i) => { if (port && !l[4]) return; const t0 = LOGT[i]; if (T < t0) return; let txt = l[0];
        if (l[0].startsWith('unified memory') && T < t0 + l[3] * 0.85 && !RM) txt = `unified memory: ${Math.floor(1048576 * ease(clamp((T - t0) / (l[3] * 0.85)))).toLocaleString('en-US')} MB`;
        const done = T >= t0 + l[3] * 0.6 || RM; lines.push({ txt: txt.length > width ? txt.slice(0, width - 1) + '…' : txt, st: l[1] && done ? l[1] : '', col: l[2], dots: !!l[1], width, os: l[5] === 'os' }); });
      if (T >= K.login) { lines.push({ txt: '' }); lines.push({ txt: 'lab-node-07 login: ' + typed(USER, K.user, 13, T, RM), cur: T < K.pass });
        if (T >= K.pass - 0.08) lines.push({ txt: 'password: ' + typed(PASS, K.pass + 0.1, 15, T, RM), cur: T < K.last });
        if (T >= K.last) lines.push({ txt: port ? 'Last login: Sun Nov 1 23:58 · obs-deck' : 'Last login: Sun Nov  1 23:58:12 2041 from observation-deck', col: DIM });
        if (T >= K.welcome) lines.push({ txt: port ? 'welcome back, operator.' : 'welcome back, operator. 23 universes archived, 0 running.', col: TXT }); }
      const vis = lines.slice(-rowsMax); g.font = `${fz}px ${MONO}`; g.textBaseline = 'middle';
      vis.forEach((L, i) => { const y = pad + lh * (i + 0.5); g.fillStyle = L.col && !L.dots ? L.col : TXT; let x = pad;
        if (L.os) { g.save(); g.font = `700 ${Math.round(fz * 1.25)}px ${MONO}`; g.shadowColor = CY; g.shadowBlur = 14; g.fillStyle = '#e9f6ff'; g.fillText(L.txt, x, y); g.restore(); return; }   // the OS's name, bright
        const s = L.dots ? (L.txt + ' ').padEnd(L.width + 2, '.') + ' ' : L.txt; g.fillText(s, x, y); x += g.measureText(s).width;
        if (L.st) { if (L.st === 'BYPASSED') { g.fillStyle = AMB; g.globalAlpha = RM ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(T * 9)); } else g.fillStyle = L.col; g.fillText(`[ ${L.st} ]`, x, y); g.globalAlpha = 1; }
        if (L.cur) cursor(g, x + 2, y, fz, T); });
      overlay(g, W, H); return; }
    // the multiplexer: one shell pane at first, the prompt, the command, then the split
    const u = RM ? (T >= K.split ? 1 : 0) : ease(clamp((T - K.split) / 0.45)), full = { x: 0, y: 0, w: W, h: H - p.statusH }, to = p.log;
    const sh = { x: full.x + (to.x - full.x) * u, y: full.y + (to.y - full.y) * u, w: full.w + (to.w - full.w) * u, h: full.h + (to.h - full.h) * u, n: u > 0.5 ? 2 : 0 };
    statusBar(g, W, H, p, T, RM ? 1 : clamp((T - K.shell) / 0.2), u > 0.5 ? 'train' : 'sh');
    p.list.forEach((r, i) => { if (r === p.log) return; const a = RM ? (T >= K.split ? 1 : 0) : clamp((T - (K.split + 0.3 + i * 0.14)) / 0.25); if (a <= 0) return;
      frameOf(g, r, p, typed(r.title, K.split + 0.35 + i * 0.14, 48, T, RM), a, false); });
    frameOf(g, sh, p, u > 0.5 ? p.log.title : (port ? 'sh · project-24' : 'sh · session project-24'), 1, true);
    shellText(g, sh, p, T, RM, null, u < 0.5 ? (port ? 18 : Math.round(clamp(W / 60, 18, 22))) : p.pfz);   // the shell, full screen: 1.5× (Nico: bigger)
    overlay(g, W, H); }
  // the shell's lines (the prompt, the command and its output; in the film, the training log follows)
  function shellLines(T, RM, port) {
    const out = [{ txt: port ? '[session project-24]' : '[session project-24 · 4 panes · zero universes running]', col: DIM }];
    if (T >= K.cmd - 0.4) out.push({ prompt: true, cmd: cmdTyped(T, RM), cur: T < K.enter });
    (port ? SHELL_OUT_P : SHELL_OUT).forEach(([t0, s]) => { if (T >= t0) out.push({ txt: s, col: CY }); });
    return out; }
  function shellText(g, r, p, T, RM, extra, fz) {
    const lh = fz * 1.5, x0 = r.x + 10, y0 = r.y + p.titleH + 6, rowsMax = Math.max(1, Math.floor((r.h - p.titleH - 10) / lh));
    let lines = shellLines(T, RM, p.port); if (extra) lines = lines.concat(extra); const vis = lines.slice(-rowsMax);
    g.save(); g.beginPath(); g.rect(r.x + 1, r.y + p.titleH, r.w - 2, r.h - p.titleH - 1); g.clip(); g.font = `${fz}px ${MONO}`; g.textBaseline = 'middle';
    vis.forEach((L, i) => { const y = y0 + lh * (i + 0.5); if (L.prompt) { const x = prompt(g, x0, y, fz, p.port); g.font = `${fz}px ${MONO}`; g.fillStyle = '#f2f2f2'; g.fillText(L.cmd, x, y); if (L.cur) cursor(g, x + g.measureText(L.cmd).width + 2, y, fz, T); }
      else { g.fillStyle = L.col || TXT; g.fillText(L.txt, x0, y); } });
    g.restore(); }

  // ---------- the panes during the film (Tf: Epoch 0's own seconds) ----------
  // o: { a: alpha, prog: 0..1 along the curve, over: 0..1 the overrun, overT: seconds into it, lossAt(t): the loss at film second t, cap: { text, col } }
  function chrome(g, W, H, Tf, P, RM, o) {
    const p = panes(W, H, P), a = o.a; if (a <= 0) return p; g.save(); g.globalAlpha = a; g.fillStyle = BG; g.fillRect(0, 0, W, H); g.restore();
    const red = o.over > 0;
    p.list.forEach(r => frameOf(g, r, p, r.title, a, r === p.samples && !red));
    if (red) { g.save(); g.globalAlpha = a * (0.5 + 0.5 * Math.abs(Math.sin(Tf * 12))); g.strokeStyle = RED; g.lineWidth = 2; p.list.forEach(r => g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)); g.restore(); }
    // the training log: the shell's lines, then one line per step, faster than anyone can read (a wall), red when it runs away
    const n = Math.floor(Math.max(0, Tf) * 7 + (red ? o.overT * o.overT * 14 : 0)), extra = [], rowsMax = 14;
    for (let i = Math.max(0, n - rowsMax); i < n; i++) { const tt = i / 7, runaway = red && i >= Math.floor(o.overStart * 7), l = runaway ? o.lossAt(o.overStart) - (i - o.overStart * 7) * 0.02 : o.lossAt(tt), step = (i + 1) * 50;
      const util = Math.round(clamp(30 + 68 * Math.min(1, tt / 22) + Math.sin(i * 1.7) * 2, 0, 99));
      extra.push(i % 23 === 22 && !runaway ? { txt: `ckpt  universes/p24/step${step}.pt  saved`, col: DIM }
        : { txt: p.port ? `step ${step} loss ${l.toFixed(3)} ${runaway ? 100 : util}%` : `step ${String(step).padStart(6)}  loss ${l.toFixed(3)}  lr 3.0e-4  ${(1.1 + 0.3 * Math.sin(i)).toFixed(2)}M tok/s  gpu ${runaway ? 100 : util}%`, col: runaway ? (l < 0 ? RED : AMB) : '#8fa3ad' }); }
    if (o.over > 0.35) extra.push({ txt: p.port ? 'WARN loss below floor' : 'WARN loss below the chart floor · stop requested · ignored', col: RED });
    g.save(); g.globalAlpha = a; shellText(g, p.log, p, DUR + 2, true, extra, p.pfz); g.restore();
    // the GPUs: eight bars, busier as the loss falls; red, 100% and hot in the overrun
    const r = p.gpu, inner = { x: r.x + 10, y: r.y + p.titleH + 6, w: r.w - 20, h: r.h - p.titleH - 12 }, fz = p.pfz; g.save(); g.globalAlpha = a; g.font = `${fz}px ${MONO}`; g.textBaseline = 'middle';
    const utilOf = i => red ? 100 : clamp(22 + 74 * o.prog + 4 * Math.sin(Tf * 3.1 + i * 1.9), 0, 99), temp = Math.round(34 + 40 * o.prog + 28 * o.over);
    if (p.port || inner.h < fz * 5) { const bw = (inner.w - 110) / 8, bh = Math.max(4, inner.h - 2); for (let i = 0; i < 8; i++) { const u = utilOf(i) / 100; g.fillStyle = '#16232a'; g.fillRect(inner.x + i * bw, inner.y, bw - 3, bh); g.fillStyle = red ? RED : u > 0.85 ? AMB : OK; g.fillRect(inner.x + i * bw, inner.y + bh * (1 - u), bw - 3, bh * u); }
      g.fillStyle = red ? RED : TXT; g.fillText(`${Math.round(utilOf(0))}% · ${temp}°C`, inner.x + 8 * bw + 8, inner.y + inner.h / 2); }
    else { const rows = 4, cw = inner.w / 2, rh = Math.min(fz * 1.7, inner.h / (rows + 1));
      for (let i = 0; i < 8; i++) { const c = i % 2, rr = Math.floor(i / 2), x = inner.x + c * cw, y = inner.y + rh * (rr + 0.5), u = utilOf(i) / 100, bx = x + fz * 4.2, bw = cw - fz * 12;
        g.fillStyle = DIM; g.fillText(`gpu${i}`, x, y); g.fillStyle = '#16232a'; g.fillRect(bx, y - fz * 0.4, bw, fz * 0.8); g.fillStyle = red ? RED : u > 0.85 ? AMB : OK; g.fillRect(bx, y - fz * 0.4, bw * u, fz * 0.8);
        g.fillStyle = red ? RED : TXT; g.fillText(`${String(Math.round(u * 100)).padStart(3)}% ${temp + (i % 3)}°C`, bx + bw + 6, y); }
      g.fillStyle = red ? RED : DIM; g.fillText(red ? 'THERMAL LIMIT · throttle refused · memory 1.0/1.0 TiB' : `memory ${(120 + 880 * o.prog).toFixed(0)} GB / 1.0 TiB unified · power ${(2.1 + 4.4 * o.prog).toFixed(1)} kW`, inner.x, inner.y + rh * (rows + 0.5)); }
    g.restore();
    // the caption (where on the curve we are), inside the loss pane at its foot
    if (o.cap) { g.save(); g.globalAlpha = a; g.font = `${p.pfz + 1}px ${MONO}`; g.textBaseline = 'alphabetic'; g.fillStyle = o.cap.col || DIM; g.fillText(o.cap.text, p.loss.x + 12, p.loss.y + p.loss.h - 10); g.restore(); }
    statusBar(g, W, H, p, DUR + Tf, a, 'train');
    return p; }

  // ---------- sound (through the intro's own output; optional) ----------
  const EV = (() => { const ev = [{ t: 0.02, k: 'crt' }, { t: 0.3, k: 'relay' }, { t: K.log, k: 'disk', d: K.login - K.log }];
    LOG.forEach((l, i) => { ev.push({ t: LOGT[i], k: 'tick' }); if (l[1] === 'BYPASSED') ev.push({ t: LOGT[i] + l[3] * 0.6, k: 'warn' }); });
    keyTimes(USER, K.user, 13).forEach(t => ev.push({ t, k: 'key' })); ev.push({ t: K.pass - 0.12, k: 'enter' }); keyTimes(PASS, K.pass + 0.1, 15).forEach(t => ev.push({ t, k: 'key' })); ev.push({ t: K.last - 0.1, k: 'enter' });
    CK.forEach(t => ev.push({ t, k: 'key' })); ev.push({ t: K.enter, k: 'enter' }); SHELL_OUT.forEach(([t]) => ev.push({ t, k: 'tick' })); ev.push({ t: K.split, k: 'whoomp' });
    return ev.sort((a, b) => a.t - b.t); })();
  const noiseOf = new WeakMap();
  function noise(ctx) { let b = noiseOf.get(ctx); if (b) return b; const n = ctx.sampleRate | 0; b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noiseOf.set(ctx, b); return b; }
  function sound(ctx, dest, e, at) {
    const tone = (type, f, t0, dur, vol, f2) => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur); v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(vol, t0 + Math.min(.008, dur / 4)); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(v); v.connect(dest); o.start(t0); o.stop(t0 + dur + .05); };
    const burst = (t0, dur, vol, f, q = 1.2) => { const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noise(ctx); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; v.gain.setValueAtTime(vol, t0); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(bp); bp.connect(v); v.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02); };
    switch (e.k) {
      case 'crt': tone('sine', 7800, at, 1.4, 0.01); tone('sine', 55, at, 0.5, 0.12, 38); burst(at, 0.25, 0.08, 900, 0.7); break;
      case 'relay': tone('square', 900, at, 0.02, 0.04); burst(at, 0.03, 0.12, 3000); break;
      case 'tick': tone('square', 1500 + Math.random() * 500, at, 0.012, 0.022); break;
      case 'disk': { const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noise(ctx); s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 3; v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(0.03, at + 0.3);
        for (let k = 0.4; k < e.d; k += 0.23) v.gain.linearRampToValueAtTime(0.012 + 0.025 * Math.random(), at + k); v.gain.linearRampToValueAtTime(0.0001, at + e.d); s.connect(bp); bp.connect(v); v.connect(dest); s.start(at); s.stop(at + e.d + 0.05); break; }
      case 'warn': tone('square', 880, at, 0.09, 0.04); tone('square', 660, at + 0.12, 0.12, 0.04); break;
      case 'key': burst(at, 0.03, 0.16, 2400 + Math.random() * 900, 1.5); tone('sine', 180, at, 0.02, 0.03); break;
      case 'enter': burst(at, 0.06, 0.22, 1300, 1.2); tone('sine', 130, at, 0.06, 0.06); break;
      case 'whoomp': tone('sine', 170, at, 0.45, 0.12, 52); burst(at, 0.35, 0.04, 500, 0.6); break; } }
  function fire(ctx, dest, T0, T1, at) { for (const e of EV) if (e.t > T0 && e.t <= T1) { try { sound(ctx, dest, e, at); } catch (er) {} } }
  function fireAll(ctx, dest, t0) { for (const e of EV) { try { sound(ctx, dest, e, t0 + e.t); } catch (er) {} } }
  // continuous sounds already under way at T (the sound was switched on mid-way, or resumed after a hold): start them for what is left
  function bootBeds(ctx, dest, T, at) { for (const e of EV) if (e.d && T > e.t && T < e.t + e.d - 0.3) { try { sound(ctx, dest, { ...e, d: e.t + e.d - T }, at); } catch (er) {} } }

  // ---------- arriving at the lab (v3b, boot-script.md): the cab, the door, the hallway ----------
  // 1. the back seat of a driverless cab in the storm, a phone held in both hands: a messages thread with "❤️" (our own drawing)
  // 2. the lab door in the rain: a keycard reader goes from red to green, LAB 07 · ACCESS GRANTED
  // 3. a dim hallway of server racks; the scientist and Lester talk (subtitles in the middle; Lester's in green with his name)
  const THREAD = [
    { me: false, text: 'big day today? 🤞' },
    { me: true, text: "yes!! important day at the lab today, we're going to attempt a post PROJECT 23 run 🧪" },
    { me: true, text: "I'm excited… but a bit concerned too 😬" },
    { me: false, text: "it'll be fine ❤️ dinner at 7?" },
    { me: true, text: "yes, I'm sure everything will be fine… ok, arriving now, see you later 😘" },
    { me: false, text: 'good luck!! 🍀' }];
  // when each message lands: hers after typing dots, his after a short pause; then enough time to read it
  const TH = (() => { let t = 1.0; return THREAD.map(m => { const dots = m.me ? 0 : 0.6, at = t + dots; t = at + Math.max(1.0, m.text.length * 0.028); return { ...m, dots: at - dots, at }; }); })();
  const CAB = TH[TH.length - 1].at + 1.3, DOOR = CAB, ROOM = DOOR + 2.3;
  const ROOMLINES = [
    { who: 'scientist', text: "Oh hey Lester, thank you for spotting me the other day with 23, glad to have you back. Wish me luck with 24!" },
    { who: 'lester', text: 'anytime, doc. 23 was… something' },
    { who: 'scientist', text: "this Tiny Oracle model got pretty intense last time… I wonder what happens if it gets too smart… oh well" },
    { who: 'lester', text: "I'll keep a hand on the breaker this time" },
    { who: 'scientist', text: "Alright, let's boot this cluster and start the run right away…" },
    { who: 'lester', text: 'good luck, doc' }];
  const CPS = 80, GAP = 0.15, holdOf = s => Math.max(2.0, s.length * 0.042 + 0.25);   // at least 2 s; long lines ~42 ms a character
  const AL = (() => { let t = ROOM + 0.3; return ROOMLINES.map(l => { const d = holdOf(l.text), o = { ...l, t0: t, typed: t + l.text.length / CPS, t1: t + d }; t += d + GAP; return o; }); })();
  const ADUR = AL[AL.length - 1].t1 + 0.5, BT = DOOR;
  const WHO = { scientist: { label: 'scientist', col: '#ffe2b8', bar: '#ffcf8a', lab: '#c9a26b' }, lester: { label: 'lester', col: '#c4f2dd', bar: '#6fd6a8', lab: '#6fd6a8' } };
  function wrapRows(g, text, maxW) { const ws = text.split(/(?<= )/), rows = []; let a = ''; for (const w of ws) { if (a && g.measureText(a + w).width > maxW) { rows.push(a); a = w; } else a += w; } rows.push(a); return rows; }
  let lastSay = null;
  // a line in the middle of the screen: big, typed, on a dim band, with who says it above
  function say(g, W, H, text, n, who, fz, a = 1, st = WHO.scientist) {
    if (n <= 0 || a <= 0) return; g.save(); g.globalAlpha = a; const FONT = `italic 600 ${fz}px "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif`; g.font = FONT; g.textBaseline = 'middle';
    const rows = wrapRows(g, text, Math.min(W * 0.84, 900)), lh = fz * 1.3, y0 = H / 2 - (rows.length - 1) * lh / 2, bw = Math.min(W - 16, Math.max(...rows.map(r => g.measureText(r).width)) + fz * 1.8), bh = rows.length * lh + fz * 0.9, by = y0 - lh / 2 - fz * 0.45;
    g.fillStyle = '#000000a0'; g.fillRect(0, by - fz * 0.9, W, bh + fz * 1.8); g.fillStyle = '#0b0d12e6'; g.fillRect(W / 2 - bw / 2, by, bw, bh); g.fillStyle = st.bar; g.fillRect(W / 2 - bw / 2, by, 3, bh);
    if (who) { g.font = `600 ${Math.max(10, Math.round(fz * 0.42))}px ${MONO}`; g.fillStyle = st.lab; g.textAlign = 'left'; g.fillText(who.toUpperCase(), W / 2 - bw / 2 + 8, by - fz * 0.45); g.font = FONT; }
    g.fillStyle = st.col; g.textAlign = 'left'; let left = n; rows.forEach((r, k) => { const t = r.slice(0, Math.max(0, left)); left -= r.length; if (t) g.fillText(t, W / 2 - g.measureText(r).width / 2, y0 + k * lh); });
    lastSay = { cy: H / 2, H, who, fz }; g.restore(); }
  const sayFz = (W, P) => P ? 21 : Math.round(clamp(W / 42, 22, 32));
  const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const BOLTS = [2.3, 6.4, 10.0];
  const flashAt = T => BOLTS.reduce((m, b) => Math.max(m, T > b ? Math.exp(-(T - b) * 9) : 0, T > b + 0.13 ? 0.7 * Math.exp(-(T - b - 0.13) * 7) : 0), 0);

  // 1. the cab: the windshield ahead (rain, wipers, the road, lightning far off), the empty driver's seat, AUTOPILOT; the phone in both hands
  function drawCab(g, W, H, T, P, RM) {
    const port = portOf(W, H, P), fl = RM ? 0 : flashAt(T); g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
    const wy0 = H * 0.05, wy1 = H * (port ? 0.3 : 0.44), wx0 = W * 0.04, wx1 = W * 0.96, ins = W * 0.07, hz = wy0 + (wy1 - wy0) * 0.58;
    g.save(); g.beginPath(); g.moveTo(wx0 + ins, wy0); g.lineTo(wx1 - ins, wy0); g.lineTo(wx1, wy1); g.lineTo(wx0, wy1); g.closePath(); g.clip();
    const sky = g.createLinearGradient(0, wy0, 0, hz); sky.addColorStop(0, `rgb(${12 + fl * 120},${16 + fl * 130},${30 + fl * 150})`); sky.addColorStop(1, `rgb(${22 + fl * 80},${26 + fl * 80},${38 + fl * 90})`); g.fillStyle = sky; g.fillRect(0, wy0, W, hz - wy0);
    if (fl > 0.25) { const b = BOLTS.filter(x => T > x).pop() || 0, bx = W * (0.25 + 0.5 * hash(b)); g.strokeStyle = `rgba(230,240,255,${fl})`; g.lineWidth = 1.5; g.beginPath(); let x = bx, y = wy0; g.moveTo(x, y); while (y < hz - 4) { y += (hz - wy0) / 7; x += (hash(b, y) - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    // hills, the road, its dashes rushing in, a few far lights
    g.fillStyle = '#07090d'; g.beginPath(); g.moveTo(0, hz); for (let x = 0; x <= W; x += W / 12) g.lineTo(x, hz - 6 - 10 * hash(x)); g.lineTo(W, wy1); g.lineTo(0, wy1); g.fill();
    g.fillStyle = '#0d1016'; g.beginPath(); g.moveTo(W / 2 - 6, hz); g.lineTo(W / 2 + 6, hz); g.lineTo(W * 0.8, wy1); g.lineTo(W * 0.2, wy1); g.fill();
    for (let k = 0; k < 7; k++) { const z = ((k / 7 + (RM ? 0 : T * 0.55)) % 1), y = hz + (wy1 - hz) * z * z, hgt = 2 + 14 * z * z; g.fillStyle = `rgba(220,210,170,${0.25 + 0.5 * z})`; g.fillRect(W / 2 - 1 - z * 3, y, 2 + z * 6, hgt); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,190,110,${0.35 + 0.3 * hash(i, Math.floor(T * 2))})`; g.fillRect(W * (0.1 + 0.8 * hash(i, 9)), hz - 3 - 4 * hash(i, 3), 2, 2); }
    // rain on the glass, and the wipers
    g.strokeStyle = 'rgba(170,190,215,0.28)'; g.lineWidth = 1; for (let i = 0; i < 90; i++) { const x = W * hash(i, 1), y = wy0 + ((hash(i, 2) * (wy1 - wy0) + (RM ? 0 : T * (60 + 90 * hash(i, 4)))) % (wy1 - wy0)); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1, y + 4 + 6 * hash(i, 5)); g.stroke(); }
    const sw = RM ? -0.6 : Math.sin(T * Math.PI / 0.75) * 0.95 - 0.35, L = (wy1 - wy0) * 1.15; g.strokeStyle = '#020305'; g.lineWidth = 5; g.lineCap = 'round';
    for (const px of [W * 0.33, W * 0.63]) { g.beginPath(); g.moveTo(px, wy1 + 4); g.lineTo(px + Math.sin(sw) * L, wy1 + 4 - Math.cos(sw) * L); g.stroke(); }
    g.restore(); g.strokeStyle = '#0f131a'; g.lineWidth = 10; g.beginPath(); g.moveTo(wx0 + ins, wy0); g.lineTo(wx1 - ins, wy0); g.lineTo(wx1, wy1); g.lineTo(wx0, wy1); g.closePath(); g.stroke();
    // the dashboard, AUTOPILOT, the front seats (the driver's is empty)
    g.fillStyle = '#080a0e'; g.fillRect(0, wy1, W, H - wy1); g.fillStyle = '#0c0f14'; g.fillRect(0, wy1, W, H * 0.05);
    g.save(); g.font = `600 ${port ? 9 : 11}px ${MONO}`; g.fillStyle = '#5fe0b0'; g.shadowColor = '#5fe0b0'; g.shadowBlur = 8; g.globalAlpha = 0.65 + 0.25 * Math.sin(T * 2); g.fillText('◉ AUTOPILOT', W * 0.18, wy1 + H * 0.032); g.restore();
    g.fillStyle = '#0e1117'; for (const [cx, w] of [[W * 0.3, W * 0.16], [W * 0.7, W * 0.16]]) { rr(g, cx - w / 2, wy1 - H * 0.05, w, H * 0.16, 14); g.fill(); rr(g, cx - w * 0.28, wy1 - H * 0.11, w * 0.56, H * 0.08, 10); g.fill(); }
    // the side windows: rain running down, a street light sweeping past now and then
    const pass = (T * 0.45) % 1; for (const [x0, x1] of [[0, W * 0.08], [W * 0.92, W]]) { g.fillStyle = `rgba(255,200,130,${0.18 * Math.max(0, 1 - Math.abs(pass - 0.5) * 6)})`; g.fillRect(x0, 0, x1 - x0, H * 0.6); }
    if (fl) { g.fillStyle = `rgba(200,215,255,${fl * 0.12})`; g.fillRect(0, 0, W, H); }
    drawPhone(g, W, H, T, port, RM); }

  // the phone: its screen is the thread; on a phone it fills the screen, on a wide screen it is held in both hands
  function drawPhone(g, W, H, T, port, RM) {
    const sway = RM ? 0 : Math.sin(T * 0.9) * 3, rot = RM ? 0 : Math.sin(T * 0.6) * 0.012;
    let pw, ph, px, py; if (port) { pw = W * 0.94; ph = H * 0.97; px = W / 2; py = H * 0.015; } else { ph = H * 0.98; pw = ph * 0.48; px = W / 2; py = H * 0.13; }
    g.save(); g.translate(px + sway, py + ph / 2); g.rotate(rot); g.translate(-px, -(py + ph / 2));
    const x = px - pw / 2, r = pw * 0.13, b = pw * 0.03;
    if (!port) { const glow = g.createRadialGradient(px, py + ph * 0.45, pw * 0.2, px, py + ph * 0.45, pw * 1.3); glow.addColorStop(0, 'rgba(120,150,200,0.16)'); glow.addColorStop(1, 'rgba(120,150,200,0)'); g.fillStyle = glow; g.fillRect(px - pw * 1.4, py - ph * 0.2, pw * 2.8, ph * 1.4); }
    g.fillStyle = '#16181c'; rr(g, x, py, pw, ph, r); g.fill(); g.strokeStyle = '#2a2d33'; g.lineWidth = 1.5; g.stroke();
    const sx = x + b, sy = py + b, sw = pw - b * 2, sh = ph - b * 2; g.save(); rr(g, sx, sy, sw, sh, r * 0.85); g.clip(); g.fillStyle = '#000'; g.fillRect(sx, sy, sw, sh);
    const fs = port ? Math.round(clamp(W / 24, 14, 17)) : Math.round(clamp(sw / 21, 12, 17)), visBottom = port ? sy + sh - fs * 3.4 : H * 0.7;
    // status bar, the contact ("❤️"), a camera dot
    g.font = `600 ${Math.round(fs * 0.8)}px system-ui, sans-serif`; g.fillStyle = '#e8e8ea'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('18:41', sx + sw * 0.08, sy + fs * 1.3);
    g.fillStyle = '#e8e8ea'; for (let i = 0; i < 4; i++) g.fillRect(sx + sw * 0.8 + i * 4, sy + fs * 1.6 - i * 2.5, 3, 3 + i * 2.5); g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(px, sy + fs * 1.3, fs * 0.35, 0, 7); g.fill();
    const ay = sy + fs * 3.8; g.fillStyle = '#3a3a3e'; g.beginPath(); g.arc(px, ay, fs * 1.5, 0, 7); g.fill(); g.font = `${Math.round(fs * 1.4)}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`; g.textAlign = 'center'; g.fillText('❤️', px, ay + 1);
    g.font = `${Math.round(fs * 0.75)}px system-ui, sans-serif`; g.fillStyle = '#c9c9ce'; g.fillText('❤️ ›', px, ay + fs * 2.3); g.fillStyle = '#26262a'; g.fillRect(sx, ay + fs * 3.1, sw, 1);
    // the messages: newest at the bottom, each sliding in; hers after three typing dots; Delivered / Read under his latest
    g.font = `${fs}px system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Noto Color Emoji", sans-serif`; g.textAlign = 'left';
    const maxW = sw * 0.68, padX = fs * 0.65, padY = fs * 0.45, lh = fs * 1.25, items = [];
    TH.forEach((m, i) => { if (T >= m.at) items.push({ ...m, i, rows: wrapRows(g, m.text, maxW) }); else if (!m.me && T >= m.dots) items.push({ dotsOnly: true, i }); });
    const lastMe = [...items].reverse().find(m => m.me), lastIdx = items.length ? items[items.length - 1].i : -1, readNow = lastMe && TH.slice(lastMe.i + 1).some(m => !m.me && T >= m.dots);
    g.save(); g.beginPath(); g.rect(sx, ay + fs * 3.15, sw, sh); g.clip();   // older messages scroll up under the contact
    let yb = visBottom; for (let k = items.length - 1; k >= 0; k--) { const m = items[k];
      if (m.dotsOnly) { const bw = fs * 3.2, bh = fs * 1.9; yb -= bh; g.fillStyle = '#2c2c2e'; rr(g, sx + sw * 0.05, yb, bw, bh, bh / 2); g.fill(); for (let d = 0; d < 3; d++) { g.fillStyle = `rgba(200,200,205,${0.35 + 0.6 * (RM ? 1 : Math.max(0, Math.sin(T * 7 - d * 0.9)))})`; g.beginPath(); g.arc(sx + sw * 0.05 + fs * (0.9 + d * 0.7), yb + bh / 2, fs * 0.2, 0, 7); g.fill(); } yb -= fs * 0.5; continue; }
      const u = RM ? 1 : ease(clamp((T - m.at) / 0.25)), tw = Math.max(...m.rows.map(rw => g.measureText(rw).width)), bw = tw + padX * 2, bh = m.rows.length * lh + padY * 2;
      if (m.me && m === lastMe) { g.font = `${Math.round(fs * 0.7)}px system-ui, sans-serif`; g.fillStyle = '#8e8e93'; g.textAlign = 'right'; g.fillText(readNow ? 'Read 18:41' : 'Delivered', sx + sw * 0.95, yb - fs * 0.45); g.textAlign = 'left'; g.font = `${fs}px system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Noto Color Emoji", sans-serif`; yb -= fs * 1.1; }
      yb -= bh; const bx = m.me ? sx + sw * 0.95 - bw : sx + sw * 0.05, oy = (1 - u) * fs * 1.2; g.globalAlpha = u;
      g.fillStyle = m.me ? '#0a84ff' : '#2c2c2e'; rr(g, bx, yb + oy, bw, bh, Math.min(fs * 0.9, bh / 2)); g.fill(); g.fillStyle = m.me ? '#fff' : '#f2f2f7';
      m.rows.forEach((rw, j) => g.fillText(rw, bx + padX, yb + oy + padY + lh * (j + 0.5))); g.globalAlpha = 1; yb -= fs * (k > 0 && items[k - 1].me === m.me ? 0.25 : 0.6); }
    g.restore();
    // the input field
    const iy = port ? sy + sh - fs * 2.6 : H * 0.72; g.strokeStyle = '#3a3a3e'; g.lineWidth = 1; rr(g, sx + sw * 0.06, iy, sw * 0.88, fs * 1.8, fs * 0.9); g.stroke(); g.fillStyle = '#6b6b70'; g.font = `${Math.round(fs * 0.85)}px system-ui, sans-serif`; g.fillText('message', sx + sw * 0.1, iy + fs * 0.9);
    g.restore(); g.restore();
    // the hands (wide screens): two palms below, thumbs on the sides of the phone, lit by the screen
    if (!port) { const skin = (a) => `rgba(${70 + 25 * a},${48 + 18 * a},${40 + 14 * a},1)`;
      for (const s of [-1, 1]) { g.save(); g.translate(px + sway + s * pw * 0.56, H * 1.06); g.rotate(s * -0.3); g.fillStyle = skin(0.35); g.beginPath(); g.ellipse(0, 0, pw * 0.26, H * 0.2, 0, 0, 7); g.fill(); g.restore();
        g.save(); g.translate(px + sway + s * pw * 0.47, H * 0.88); g.rotate(s * -0.6); g.fillStyle = skin(0.6); rr(g, -pw * 0.045, -pw * 0.16, pw * 0.09, pw * 0.24, pw * 0.045); g.fill(); g.restore(); } } }

  // 2. the lab door in the rain: the reader goes red → green
  function drawDoor(g, W, H, t, P, RM) {
    const port = portOf(W, H, P); const wall = g.createLinearGradient(0, 0, W, H); wall.addColorStop(0, '#0d1118'); wall.addColorStop(1, '#06080c'); g.fillStyle = wall; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(255,255,255,${0.012 + 0.01 * hash(i)})`; g.fillRect(0, H * i / 9, W, 1); }
    g.fillStyle = '#0a0d12'; g.fillRect(W * 0.62, 0, W * 0.3, H); g.strokeStyle = '#1b2029'; g.lineWidth = 3; g.strokeRect(W * 0.62, -5, W * 0.3, H + 10); g.fillStyle = '#c9d2dc22'; g.font = `700 ${port ? 18 : 30}px ${MONO}`; g.fillText('07', W * 0.74, H * 0.2);
    const ok = t > 1.0, rw = port ? 110 : 150, rh = port ? 160 : 210, rx = W * (port ? 0.3 : 0.45) - rw / 2, ry = H * 0.42 - rh / 2, led = ok ? '#7fd38a' : '#ff5d5d';
    g.save(); g.shadowColor = led; g.shadowBlur = 40; g.fillStyle = '#14171c'; rr(g, rx, ry, rw, rh, 12); g.fill(); g.restore();
    g.strokeStyle = '#2b313b'; g.lineWidth = 1.5; rr(g, rx, ry, rw, rh, 12); g.stroke(); g.fillStyle = '#05070a'; g.fillRect(rx + rw * 0.12, ry + rh * 0.1, rw * 0.76, rh * 0.32);
    g.font = `700 ${port ? 10 : 12}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ok ? '#7fd38a' : '#c9d2dc'; g.fillText(ok ? 'ACCESS' : 'LAB 07', rx + rw / 2, ry + rh * 0.2); g.fillText(ok ? 'GRANTED' : 'TAP CARD', rx + rw / 2, ry + rh * 0.32);
    g.save(); g.shadowColor = led; g.shadowBlur = 16; g.fillStyle = led; g.beginPath(); g.arc(rx + rw / 2, ry + rh * 0.62, rw * 0.06, 0, 7); g.fill(); g.restore();
    // the card comes up to the reader
    const u = RM ? 1 : ease(clamp((t - 0.35) / 0.55)), cx = rx + rw / 2 + (1 - u) * W * 0.25, cy = ry + rh * 0.8 + (1 - u) * H * 0.4; if (t < 1.6) { g.save(); g.translate(cx, cy); g.rotate(-0.15 * (1 - u)); g.fillStyle = '#d9dde3'; rr(g, -rw * 0.42, -rw * 0.27, rw * 0.84, rw * 0.54, 6); g.fill(); g.fillStyle = '#2f6fb5'; g.fillRect(-rw * 0.42, -rw * 0.12, rw * 0.84, rw * 0.1); g.restore(); }
    if (ok) { const a = clamp((t - 1.0) / 0.15); g.save(); g.globalAlpha = a; g.font = `700 ${port ? 16 : 22}px ${MONO}`; g.fillStyle = '#7fd38a'; g.shadowColor = '#7fd38a'; g.shadowBlur = 12; g.fillText('LAB 07 · ACCESS GRANTED', W / 2, H * 0.78); g.restore(); }
    // the puddle's glow, the rain in front
    const pg = g.createRadialGradient(rx + rw / 2, H * 0.97, 4, rx + rw / 2, H * 0.97, W * 0.25); pg.addColorStop(0, ok ? '#7fd38a33' : '#ff5d5d33'); pg.addColorStop(1, '#00000000'); g.fillStyle = pg; g.fillRect(0, H * 0.85, W, H * 0.15);
    g.strokeStyle = 'rgba(180,200,225,0.25)'; g.lineWidth = 1; for (let i = 0; i < 120; i++) { const x = W * hash(i, 7), y = (hash(i, 8) * H + (RM ? 0 : t * (700 + 300 * hash(i)))) % H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14); g.stroke(); }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; }

  // 3. the hallway: server racks with blinking lights, ceiling panels (one flickers), a terminal glowing at the end, Lester by a rack
  function drawHall(g, W, H, t, P, RM) {
    const port = portOf(W, H, P), vx = W / 2, vy = H * 0.44, f = H * (port ? 0.42 : 0.62) * (1 + (RM ? 0 : t * 0.012)), hw = port ? 1.1 : 1.7, yf = 1.15, yc = -1.25;
    const pr = (x, y, z) => [vx + x * f / z, vy + y * f / z]; g.fillStyle = '#04060a'; g.fillRect(0, 0, W, H);
    const quad = (a, b, c, d, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.fill(); };
    const Z0 = 0.9, Z1 = 16; quad(pr(-hw, yf, Z0), pr(hw, yf, Z0), pr(hw, yf, Z1), pr(-hw, yf, Z1), '#121820'); quad(pr(-hw, yc, Z0), pr(hw, yc, Z0), pr(hw, yc, Z1), pr(-hw, yc, Z1), '#0b0f15');
    quad(pr(-hw, yc, Z0), pr(-hw, yf, Z0), pr(-hw, yf, Z1), pr(-hw, yc, Z1), '#0f141b'); quad(pr(hw, yc, Z0), pr(hw, yf, Z0), pr(hw, yf, Z1), pr(hw, yc, Z1), '#0f141b');
    // the far wall and the terminal
    const [ax, ay] = pr(-hw, yc, Z1), [bx, by] = pr(hw, yf, Z1); g.fillStyle = '#05070b'; g.fillRect(ax, ay, bx - ax, by - ay); const [mx, my] = pr(-0.35, -0.35, Z1), [nx, ny] = pr(0.35, 0.2, Z1);
    g.save(); g.shadowColor = '#7ee3f5'; g.shadowBlur = 30; g.fillStyle = '#0b2a33'; g.fillRect(mx, my, nx - mx, ny - my); g.restore(); if (Math.floor(t * 2.4) % 2 === 0) { g.fillStyle = '#7ee3f5'; g.fillRect(mx + (nx - mx) * 0.1, my + (ny - my) * 0.6, (nx - mx) * 0.08, (ny - my) * 0.15); }
    // ceiling panels
    for (let k = 0; k < 7; k++) { const z = 1.6 + k * 2, flick = k === 2 && !RM && hash(Math.floor(t * 8)) > 0.7 ? 0.2 : 1, a = (0.55 - k * 0.06) * flick; const [p1x, p1y] = pr(-0.4, yc + 0.01, z), [p2x] = pr(0.4, yc, z), [, p3y] = pr(0.4, yc, z + 0.6);
      g.fillStyle = `rgba(190,215,235,${a})`; g.fillRect(p1x, p1y, p2x - p1x, Math.max(1, p3y - p1y)); const lg = g.createRadialGradient(vx, p1y, 1, vx, p1y, f / z * 1.4); lg.addColorStop(0, `rgba(120,150,175,${a * 0.18})`); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(0, 0, W, H); }
    // racks on both walls, their lights blinking
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z0 = 1.4 + k * 2.2, z1 = z0 + 1.6, x = s * (hw - 0.02); quad(pr(x, -0.95, z0), pr(x, yf - 0.02, z0), pr(x, yf - 0.02, z1), pr(x, -0.95, z1), '#171d26');
      for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) { const zz = z0 + 0.25 + j * 0.5, yy = -0.8 + i * 0.18, on = hash(k * 31 + i * 7 + j + (s > 0 ? 500 : 0), Math.floor(t * (2 + hash(i, j) * 4))) > 0.55; if (!on) continue;
        const [lx, ly] = pr(x, yy, zz); g.fillStyle = hash(i, k + j) > 0.8 ? '#f0b45a' : '#5fe08a'; g.fillRect(lx, ly, Math.max(1, 3 / zz * (f / 400)), Math.max(1, 2 / zz * (f / 400))); } }
    // Lester: a silhouette by the racks on the right, a small light on his badge
    const [lx, ly] = pr(port ? 0.6 : 1.05, yf, 3.0), sc = f / 3.0; g.fillStyle = '#020304'; g.beginPath(); g.arc(lx, ly - sc * 1.62, sc * 0.11, 0, 7); g.fill(); rr(g, lx - sc * 0.2, ly - sc * 1.5, sc * 0.4, sc * 0.95, sc * 0.12); g.fill(); g.fillRect(lx - sc * 0.15, ly - sc * 0.6, sc * 0.12, sc * 0.6); g.fillRect(lx + sc * 0.03, ly - sc * 0.6, sc * 0.12, sc * 0.6);
    g.strokeStyle = '#3b5568'; g.lineWidth = 1; g.beginPath(); g.arc(lx, ly - sc * 1.62, sc * 0.11, Math.PI * 1.1, Math.PI * 1.7); g.stroke(); g.fillStyle = '#7ee3f5'; g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3); g.fillRect(lx - sc * 0.12, ly - sc * 1.25, sc * 0.06, sc * 0.08); g.globalAlpha = 1; }

  function arriveDraw(g, W, H, T, P, RM) {
    if (T < DOOR) drawCab(g, W, H, T, P, RM); else if (T < ROOM) drawDoor(g, W, H, T - DOOR, P, RM); else drawHall(g, W, H, T - ROOM, P, RM);
    // cuts: a short dip to black between the scenes
    const dip = Math.max(...[DOOR, ROOM].map(c => 1 - clamp(Math.abs(T - c) / 0.3)), T < 0.6 ? 1 - T / 0.6 : 0); if (dip > 0) { g.fillStyle = `rgba(0,0,0,${dip})`; g.fillRect(0, 0, W, H); }
    overlay(g, W, H, 0.5);
    for (const l of AL) { if (T < l.t0 || T > l.t1) continue; const n = RM ? l.text.length : Math.floor((T - l.t0) * CPS), a = clamp((l.t1 - T) / 0.25); say(g, W, H, l.text, n, WHO[l.who].label, sayFz(W, P), a, WHO[l.who]); }
    if (T > ADUR - 0.5) { g.fillStyle = '#000'; g.globalAlpha = clamp((T - (ADUR - 0.5)) / 0.4); g.fillRect(0, 0, W, H); g.globalAlpha = 1; } }
  // sound: beds (the cab: road and rain on the glass; the rain outside the door; the hallway's room tone and fans) and moments
  const AEV = (() => { const ev = [{ t: 0, k: 'car', d: CAB + 0.3 }, { t: DOOR, k: 'rainout', d: ROOM - DOOR + 0.3 }, { t: ROOM, k: 'room', d: ADUR - ROOM }];
    for (let t = 0.75; t < CAB; t += 0.75) ev.push({ t, k: 'wiper' }); BOLTS.forEach(b => ev.push({ t: b + 0.9, k: 'thunder' }));
    TH.forEach(m => ev.push({ t: m.at, k: m.me ? 'sent' : 'recv' })); ev.push({ t: DOOR + 0.95, k: 'beep' }, { t: DOOR + 1.9, k: 'hiss' });
    for (let i = 0; i < 4; i++) ev.push({ t: ROOM + 0.1 + i * 0.42, k: 'step' }); return ev.sort((a, b) => a.t - b.t); })();
  function asound(ctx, dest, e, at) {
    const tone = (type, f, t0, dur, vol, f2) => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur); v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(vol, t0 + Math.min(.01, dur / 4)); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(v); v.connect(dest); o.start(t0); o.stop(t0 + dur + .05); };
    const nz = (t0, dur, vol, type, f, q = 1, loop = false, fadeIn = 0.01, f2) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noise(ctx); s.loop = loop; fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur); fl.Q.value = q;
      v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(vol, t0 + fadeIn); if (loop) { v.gain.setValueAtTime(vol, t0 + Math.max(fadeIn, dur - 0.4)); v.gain.linearRampToValueAtTime(0.0001, t0 + dur); } else v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(fl); fl.connect(v); v.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05); };
    switch (e.k) {
      case 'car': nz(at, e.d, 0.05, 'highpass', 1800, 0.6, true, 0.6); nz(at, e.d, 0.07, 'lowpass', 150, 0.8, true, 0.6); break;
      case 'rainout': nz(at, e.d, 0.09, 'bandpass', 3200, 0.5, true, 0.2); break;
      case 'room': { nz(at, e.d, 0.016, 'lowpass', 500, 0.7, true, 0.5); const o = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sine'; o.frequency.value = 60; v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(0.02, at + 0.5); v.gain.setValueAtTime(0.02, at + Math.max(0.5, e.d - 0.5)); v.gain.linearRampToValueAtTime(0.0001, at + e.d); o.connect(v); v.connect(dest); o.start(at); o.stop(at + e.d + 0.05); break; }
      case 'wiper': nz(at, 0.18, 0.05, 'bandpass', 700, 1.2); break;
      case 'thunder': nz(at, 2.2, 0.22, 'lowpass', 180, 0.7, false, 0.15); tone('sine', 45, at, 1.6, 0.08, 30); break;
      case 'sent': nz(at, 0.22, 0.09, 'bandpass', 900, 1.4, false, 0.01, 3200); break;
      case 'recv': tone('sine', 1320, at, 0.09, 0.05); tone('sine', 1760, at + 0.09, 0.12, 0.05); break;
      case 'beep': tone('sine', 1760, at, 0.08, 0.08); tone('sine', 2349, at + 0.11, 0.12, 0.08); break;
      case 'hiss': nz(at, 0.7, 0.07, 'highpass', 2500, 0.7); break;
      case 'step': nz(at, 0.08, 0.15, 'lowpass', 500, 1); break; } }
  const afire = (ctx, dest, T0, T1, at) => { for (const e of AEV) if (e.t > T0 && e.t <= T1) { try { asound(ctx, dest, e, at); } catch (er) {} } };
  const afireAll = (ctx, dest, t0) => { for (const e of AEV) { try { asound(ctx, dest, e, t0 + e.t); } catch (er) {} } };
  const abeds = (ctx, dest, T, at) => { for (const e of AEV) if (e.d && T > e.t && T < e.t + e.d - 0.3) { try { asound(ctx, dest, { ...e, d: e.t + e.d - T }, at); } catch (er) {} } };
  const arrive = { dur: ADUR, draw: arriveDraw, fire: afire, fireAll: afireAll, beds: abeds, lines: AL.map(l => ({ t0: l.t0, typed: l.typed, t1: l.t1, text: l.text, who: l.who })), thread: TH.map(m => ({ at: m.at, me: m.me, text: m.text })),
    scenes: { cab: [0, CAB], door: [DOOR, ROOM], hall: [ROOM, ADUR] }, beat: BT, sayFz, events: AEV.length, lastSay: () => lastSay };

  window.__termBoot = { dur: DUR, draw, panes, chrome, overlay, fire, fireAll, beds: bootBeds, arrive, say, clock: K, events: EV.length };
})();
