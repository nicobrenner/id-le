// idle-boot.js: the boot, a terminal prelude to Epoch 0 (Nico, Nov 2: "before the start, we need something like a cool DOS/linux terminal…";
// script: boot-script.md). A CRT wakes, a globe made of letters spins (faux 3D, drawn here as a character grid), the lab node boots with
// made-up future versions, the operator logs in, types "run project 24" at a powerline prompt, and the screen splits like a terminal
// multiplexer: TRAINING LOSS · project 24, MODEL SAMPLE DIALOG OUTPUTS, the training log, the GPUs. Epoch 0 (idle-epoch0.js) then runs inside
// those panes: it asks panes() for its layout and draws chrome() around itself every frame.
// Nothing here is real hardware or a real product: the numbers are invented, there are no vendor logos.
// Before it, in the storyline (and ?intro=boot): arriving at the lab (boot-script.md, v4): the scientist's own computer: a messages thread
// with "❤️", a notification from Lester, the team chat (labchat) and the DM with Lester, then the terminal opens and the boot begins.
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

  // ---------- arriving at the lab (v4, boot-script.md): the scientist's own computer, one continuous desktop ----------
  // Nico: "let's just keep the phone… no keycard, we could just show a faux-Slack… a message notification from Lester, he replies, brief
  // interaction, he closes the chat, and opens the experiment… the texting with the gf could be like an imsg on the computer".
  // a. a messages window: the thread with "❤️"; b. a notification from Lester, the team chat ("labchat", IRC-ish: channels, a few recent
  // lines, then the DM with Lester); c. the chat closes and the terminal opens: the boot. Our own look: no real apps, logos or names.
  const THREAD = [
    { me: false, text: 'big day today? 🤞' },
    { me: true, text: "yes!! important day at the lab today, we're going to attempt a post PROJECT 23 run 🧪" },
    { me: true, text: "I'm excited… but a bit concerned too 😬" },
    { me: false, text: "it'll be fine ❤️ dinner at 7?" },
    { me: true, text: "yes, I'm sure everything will be fine… ok, arriving now, see you later 😘" },
    { me: false, text: 'good luck!! 🍀' }];
  // when each message lands: hers after typing dots, his after a short pause; then enough time to read it
  const TH = (() => { let t = 0.9; return THREAD.map(m => { const dots = m.me ? 0 : 0.55, at = t + dots; t = at + Math.max(0.85, m.text.length * 0.022); return { ...m, dots: at - dots, at }; }); })();
  const NOTE = TH[TH.length - 1].at + 0.9, CHAT = NOTE + 1.0;
  // the team chat: a few believable recent lines in #training-runs (bots and handles, no real people; no training text)
  const CHANNELS = ['training-runs', 'experiments', 'evals', 'cluster-admin', 'random'];
  const BACKLOG = [['ops-bot', 'run 23: checkpoint archived · 412 GB'], ['evalbot', 'p23 final · loss 1.43 · 2 evals flagged "unusual"'], ['night-shift', 'anyone else see the thermals spike at 3am?'],
    ['ops-bot', 'breaker B7 reset (manual)'], ['night-shift', 'cluster is all yours today, doc']];
  const BL = BACKLOG.map((b, i) => ({ who: b[0], text: b[1], at: CHAT + 0.2 + i * 0.25 }));
  // the DM with Lester: his notification, then the scientist's lines and Lester's answers (Nico's lines; Lester's approved as final)
  const DMLINES = [
    { who: 'lester', text: 'hey doc, you in? 👋' },
    { who: 'scientist', text: "Oh hey Lester, thank you for spotting me the other day with 23, glad to have you back. Wish me luck with 24!" },
    { who: 'lester', text: 'anytime, doc. 23 was… something' },
    { who: 'scientist', text: "this Tiny Oracle model got pretty intense last time… I wonder what happens if it gets too smart… oh well" },
    { who: 'lester', text: "I'll keep a hand on the breaker this time" },
    { who: 'scientist', text: "Alright, let's boot this cluster and start the run right away…" },
    { who: 'lester', text: 'good luck, doc' }];
  const DMT = CHAT + 0.2 + BACKLOG.length * 0.25 + 0.5;   // switching to the DM
  // his lines are typed into the input (fast, he's done this before), then sent; Lester's come after "Lester is typing…"; each stays long enough to read
  const DM = (() => { let t = DMT + 0.3; return DMLINES.map((l, i) => { let typeAt = t, at;
      if (i === 0) at = t; else if (l.who === 'scientist') { at = t + l.text.length / 90 + 0.15; } else { at = t + 0.6; }
      t = at + Math.max(0.8, l.text.length * 0.025); return { ...l, typeAt, at }; }); })();
  const CLOSE = DM[DM.length - 1].at + 1.0, TERM = CLOSE + 0.45, ADUR = TERM + 0.75, BT = NOTE;
  const lastLine = DM[DM.length - 1];
  const WHO = { scientist: { label: 'scientist', col: '#ffe2b8', bar: '#ffcf8a', lab: '#c9a26b' }, lester: { label: 'lester', col: '#c4f2dd', bar: '#6fd6a8', lab: '#6fd6a8' } };
  function wrapRows(g, text, maxW) { const ws = text.split(/(?<= )/), rows = []; let a = ''; for (const w of ws) { if (a && g.measureText(a + w).width > maxW) { rows.push(a); a = w; } else a += w; } rows.push(a); return rows; }
  let lastSay = null;
  // a line in the middle of the screen: big, typed, on a dim band, with who says it above (used where no window shows the words: the dark)
  function say(g, W, H, text, n, who, fz, a = 1, st = WHO.scientist) {
    if (n <= 0 || a <= 0) return; g.save(); g.globalAlpha = a; const FONT = `italic 600 ${fz}px "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif`; g.font = FONT; g.textBaseline = 'middle';
    const rows = wrapRows(g, text, Math.min(W * 0.84, 900)), lh = fz * 1.3, y0 = H / 2 - (rows.length - 1) * lh / 2, bw = Math.min(W - 16, Math.max(...rows.map(r => g.measureText(r).width)) + fz * 1.8), bh = rows.length * lh + fz * 0.9, by = y0 - lh / 2 - fz * 0.45;
    g.fillStyle = '#000000a0'; g.fillRect(0, by - fz * 0.9, W, bh + fz * 1.8); g.fillStyle = '#0b0d12e6'; g.fillRect(W / 2 - bw / 2, by, bw, bh); g.fillStyle = st.bar; g.fillRect(W / 2 - bw / 2, by, 3, bh);
    if (who) { g.font = `600 ${Math.max(10, Math.round(fz * 0.42))}px ${MONO}`; g.fillStyle = st.lab; g.textAlign = 'left'; g.fillText(who.toUpperCase(), W / 2 - bw / 2 + 8, by - fz * 0.45); g.font = FONT; }
    g.fillStyle = st.col; g.textAlign = 'left'; let left = n; rows.forEach((r, k) => { const t = r.slice(0, Math.max(0, left)); left -= r.length; if (t) g.fillText(t, W / 2 - g.measureText(r).width / 2, y0 + k * lh); });
    lastSay = { cy: H / 2, H, who, fz }; g.restore(); }
  const sayFz = (W, P) => P ? 21 : Math.round(clamp(W / 42, 22, 32));
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const SANS = 'system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const hhmm = () => '18:4' + 1;
  // a window: a rounded frame, a title bar with three plain grey dots and a title; returns the content rect
  function win(g, x, y, w, h, title, a = 1, sc = 1) {
    g.save(); g.globalAlpha *= a; g.translate(x + w / 2, y + h / 2); g.scale(sc, sc); g.translate(-(x + w / 2), -(y + h / 2));
    g.shadowColor = '#000'; g.shadowBlur = 30; g.fillStyle = '#101419'; rr(g, x, y, w, h, 10); g.fill(); g.shadowBlur = 0; g.strokeStyle = '#2a313b'; g.lineWidth = 1; rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 10); g.stroke();
    g.fillStyle = '#171c23'; rr(g, x + 1, y + 1, w - 2, 28, 9); g.fill(); g.fillRect(x + 1, y + 18, w - 2, 11); for (let i = 0; i < 3; i++) { g.fillStyle = '#3a414c'; g.beginPath(); g.arc(x + 14 + i * 14, y + 15, 4.5, 0, 7); g.fill(); }
    g.font = `600 12px ${SANS}`; g.fillStyle = '#9aa7b4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(title, x + w / 2, y + 15); g.textAlign = 'left';
    return { x: x + 1, y: y + 29, w: w - 2, h: h - 30, done: () => g.restore() }; }
  // the messages thread (bubbles, typing dots, Delivered / Read), drawn into a rect
  function thread(g, c, T, fs, RM) {
    g.save(); g.beginPath(); g.rect(c.x, c.y, c.w, c.h); g.clip(); g.fillStyle = '#000'; g.fillRect(c.x, c.y, c.w, c.h);
    const ay = c.y + fs * 2.2; g.fillStyle = '#3a3a3e'; g.beginPath(); g.arc(c.x + c.w / 2, ay, fs * 1.3, 0, 7); g.fill(); g.font = `${Math.round(fs * 1.2)}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❤️', c.x + c.w / 2, ay + 1);
    g.font = `${Math.round(fs * 0.75)}px ${SANS}`; g.fillStyle = '#c9c9ce'; g.fillText('❤️ ›', c.x + c.w / 2, ay + fs * 2.0); g.fillStyle = '#26262a'; g.fillRect(c.x, ay + fs * 2.7, c.w, 1); g.textAlign = 'left';
    g.font = `${fs}px ${SANS}`; const maxW = c.w * 0.7, padX = fs * 0.65, padY = fs * 0.45, lh = fs * 1.25, items = [];
    TH.forEach((m, i) => { if (T >= m.at) items.push({ ...m, i, rows: wrapRows(g, m.text, maxW) }); else if (!m.me && T >= m.dots) items.push({ dotsOnly: true, i }); });
    const lastMe = [...items].reverse().find(m => m.me), readNow = lastMe && TH.slice(lastMe.i + 1).some(m => !m.me && T >= m.dots);
    g.save(); g.beginPath(); g.rect(c.x, ay + fs * 2.75, c.w, c.h); g.clip(); let yb = c.y + c.h - fs * 3.0;
    for (let k = items.length - 1; k >= 0; k--) { const m = items[k];
      if (m.dotsOnly) { const bw = fs * 3.2, bh = fs * 1.9; yb -= bh; g.fillStyle = '#2c2c2e'; rr(g, c.x + c.w * 0.05, yb, bw, bh, bh / 2); g.fill(); for (let d = 0; d < 3; d++) { g.fillStyle = `rgba(200,200,205,${0.35 + 0.6 * (RM ? 1 : Math.max(0, Math.sin(T * 7 - d * 0.9)))})`; g.beginPath(); g.arc(c.x + c.w * 0.05 + fs * (0.9 + d * 0.7), yb + bh / 2, fs * 0.2, 0, 7); g.fill(); } yb -= fs * 0.5; continue; }
      const u = RM ? 1 : ease(clamp((T - m.at) / 0.25)), tw = Math.max(...m.rows.map(rw => g.measureText(rw).width)), bw = tw + padX * 2, bh = m.rows.length * lh + padY * 2;
      if (m.me && m === lastMe) { g.font = `${Math.round(fs * 0.7)}px ${SANS}`; g.fillStyle = '#8e8e93'; g.textAlign = 'right'; g.fillText(readNow ? 'Read 18:41' : 'Delivered', c.x + c.w * 0.95, yb - fs * 0.45); g.textAlign = 'left'; g.font = `${fs}px ${SANS}`; yb -= fs * 1.1; }
      yb -= bh; const bx = m.me ? c.x + c.w * 0.95 - bw : c.x + c.w * 0.05, oy = (1 - u) * fs * 1.2; g.globalAlpha = u;
      g.fillStyle = m.me ? '#0a84ff' : '#2c2c2e'; rr(g, bx, yb + oy, bw, bh, Math.min(fs * 0.9, bh / 2)); g.fill(); g.fillStyle = m.me ? '#fff' : '#f2f2f7';
      m.rows.forEach((rw, j) => g.fillText(rw, bx + padX, yb + oy + padY + lh * (j + 0.5))); g.globalAlpha = 1; yb -= fs * (k > 0 && items[k - 1].me === m.me ? 0.25 : 0.6); }
    g.restore(); const iy = c.y + c.h - fs * 2.3; g.strokeStyle = '#3a3a3e'; g.lineWidth = 1; rr(g, c.x + c.w * 0.05, iy, c.w * 0.9, fs * 1.7, fs * 0.85); g.stroke(); g.fillStyle = '#6b6b70'; g.font = `${Math.round(fs * 0.85)}px ${SANS}`; g.fillText('message', c.x + c.w * 0.08, iy + fs * 0.85);
    g.restore(); }
  // labchat: channels on the left (on phones a top bar), IRC-ish lines, an input; the backlog in #training-runs, then the DM with Lester
  const NICK = { lester: '#6fd6a8', scientist: '#ffcf8a', 'ops-bot': '#7f8ea0', evalbot: '#b49cff', 'night-shift': '#f0b45a' };
  function labchat(g, c, T, fs, port, RM) {
    g.save(); g.beginPath(); g.rect(c.x, c.y, c.w, c.h); g.clip(); g.fillStyle = '#0c0f13'; g.fillRect(c.x, c.y, c.w, c.h);
    const dm = T >= DMT, side = port ? 0 : Math.min(190, c.w * 0.26), mx = c.x + side, mw = c.w - side, lh = fs * 1.45;
    if (!port) { g.fillStyle = '#0f141a'; g.fillRect(c.x, c.y, side, c.h); g.font = `700 ${fs}px ${SANS}`; g.fillStyle = '#d6dde4'; g.fillText('lab-07', c.x + 14, c.y + fs * 1.4);
      g.font = `${Math.round(fs * 0.9)}px ${SANS}`; CHANNELS.forEach((ch, i) => { const y = c.y + fs * 3.2 + i * lh, on = !dm && i === 0; if (on) { g.fillStyle = '#1d2733'; g.fillRect(c.x + 6, y - lh / 2, side - 12, lh); } g.fillStyle = on ? '#e9f1f7' : '#8a96a3'; g.fillText('# ' + ch, c.x + 14, y); });
      const dy = c.y + fs * 3.2 + (CHANNELS.length + 0.9) * lh; g.fillStyle = '#5d6b78'; g.font = `600 ${Math.round(fs * 0.75)}px ${SANS}`; g.fillText('DIRECT', c.x + 14, dy);
      const ly = dy + lh; if (dm) { g.fillStyle = '#1d2733'; g.fillRect(c.x + 6, ly - lh / 2, side - 12, lh); } g.font = `${Math.round(fs * 0.9)}px ${SANS}`; g.fillStyle = dm ? '#e9f1f7' : '#cfe9dc'; g.fillText('● Lester', c.x + 14, ly);
      if (!dm && T >= NOTE) { g.fillStyle = '#e0367a'; g.beginPath(); g.arc(c.x + side - 22, ly, fs * 0.45, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `700 ${Math.round(fs * 0.65)}px ${SANS}`; g.textAlign = 'center'; g.fillText('1', c.x + side - 22, ly + 1); g.textAlign = 'left'; } }
    // the header: the channel or the DM
    g.fillStyle = '#121820'; g.fillRect(mx, c.y, mw, fs * 2.4); g.font = `700 ${fs}px ${SANS}`; g.fillStyle = '#e9f1f7'; g.fillText(dm ? '● Lester' : '# training-runs', mx + 14, c.y + fs * 1.2);
    const hw0 = g.measureText(dm ? '● Lester' : '# training-runs').width; g.font = `${Math.round(fs * 0.8)}px ${SANS}`; g.fillStyle = '#6f7d8a'; if (mw > hw0 + 220) g.fillText(dm ? 'direct message' : 'runs, checkpoints, the cluster', mx + 14 + hw0 + 12, c.y + fs * 1.25);
    // the lines: monospace, a time, a nick in its colour, the text wrapped under it
    const lines = dm ? DM.filter(l => T >= l.at) : BL.filter(l => T >= l.at), mono = `${Math.round(fs * 0.92)}px ${MONO}`, rowsAll = []; g.font = mono;
    for (const l of lines) { const nick = l.who === 'scientist' ? 'doc' : l.who === 'lester' ? 'Lester' : l.who, head = `${hhmm()}  <${nick}> `, hw = g.measureText(head).width, rows = wrapRows(g, l.text, mw - 28 - hw);
      rows.forEach((r, j) => rowsAll.push({ head: j ? '' : head, hw, nick, who: l.who, r, u: RM ? 1 : clamp((T - l.at) / 0.2) })); if (dm) rowsAll.push({ gap: true }); }
    const inputH = fs * 2.6, top = c.y + fs * 2.4 + 6, maxRows = Math.floor((c.h - fs * 2.4 - inputH - 12) / lh), vis = rowsAll.slice(-maxRows);
    vis.forEach((rw, i) => { if (rw.gap) return; const y = top + lh * (i + 0.5); g.globalAlpha = rw.u; if (rw.head) { g.fillStyle = '#56616d'; g.fillText(hhmm(), mx + 14, y); g.fillStyle = NICK[rw.who] || '#9aa7b4'; g.fillText(`<${rw.nick}>`, mx + 14 + g.measureText(hhmm() + '  ').width, y); }
      g.fillStyle = rw.who === 'scientist' ? '#f3e6d2' : '#dbe4ec'; g.fillText(rw.r, mx + 14 + rw.hw, y); g.globalAlpha = 1; });
    // "Lester is typing…" and the scientist's line being typed in the input
    const iy = c.y + c.h - inputH + 6; g.strokeStyle = '#2a333e'; rr(g, mx + 10, iy, mw - 20, inputH - 14, 8); g.stroke(); g.font = `${Math.round(fs * 0.9)}px ${SANS}`;
    const typing = DM.find(l => T >= l.typeAt && T < l.at); if (dm && typing && typing.who === 'scientist') { const n = RM ? typing.text.length : Math.floor((T - typing.typeAt) * 90), s = typing.text.slice(0, n); g.fillStyle = '#f3e6d2'; const vis2 = s.length > 70 ? '…' + s.slice(-70) : s; g.fillText(vis2, mx + 20, iy + (inputH - 14) / 2); if (Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = '#cfd6dd'; g.fillRect(mx + 22 + g.measureText(vis2).width, iy + 6, 2, inputH - 26); } }
    else { g.fillStyle = '#56616d'; g.fillText(dm ? 'message Lester' : 'message #training-runs', mx + 20, iy + (inputH - 14) / 2); }
    if (dm && typing && typing.who === 'lester') { g.font = `italic ${Math.round(fs * 0.78)}px ${SANS}`; g.fillStyle = '#6fd6a8'; g.fillText('Lester is typing…', mx + 14, iy - fs * 0.6); }
    g.restore(); }
  // the desktop: a dark wallpaper, a thin top bar, a dock with three apps (messages, labchat, terminal); windows open and close on it
  function arriveDraw(g, W, H, T, P, RM) {
    const port = portOf(W, H, P), fs = port ? Math.round(clamp(W / 24, 14, 17)) : Math.round(clamp(W / 85, 13, 16));
    const wall = g.createLinearGradient(0, 0, W, H); wall.addColorStop(0, '#0b1018'); wall.addColorStop(1, '#141a26'); g.fillStyle = wall; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.06; g.font = `700 ${Math.round(Math.min(W, H) * 0.16)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9fb4c8'; g.fillText('Id|le', W / 2, H * 0.5); g.restore();
    g.fillStyle = '#0a0d12e8'; g.fillRect(0, 0, W, 24); g.font = `600 12px ${SANS}`; g.fillStyle = '#c9d2dc'; g.textBaseline = 'middle'; g.fillText('lab-07', 12, 12); g.textAlign = 'right'; g.fillText('Mon 18:41', W - 12, 12); g.textAlign = 'left';
    // the dock
    const apps = [['💬', 'messages', T < CLOSE - 2 && T < NOTE + 1.2], ['#', 'labchat', T >= NOTE && T < CLOSE], ['>_', 'terminal', T >= TERM - 0.2]], dw = apps.length * 54 + 16, dx = W / 2 - dw / 2, dy = H - 62;
    g.fillStyle = '#0f141bd9'; rr(g, dx, dy, dw, 52, 14); g.fill(); apps.forEach(([ic, nm, on], i) => { const x = dx + 16 + i * 54; g.fillStyle = '#1b222c'; rr(g, x, dy + 7, 38, 38, 9); g.fill(); g.font = `600 ${ic.length > 1 && ic !== '💬' ? 14 : 18}px ${ic === '💬' ? SANS : MONO}`; g.fillStyle = '#d6dde4'; g.textAlign = 'center'; g.fillText(ic, x + 19, dy + 27); g.textAlign = 'left'; if (on) { g.fillStyle = '#7ee3f5'; g.beginPath(); g.arc(x + 19, dy + 49, 2, 0, 7); g.fill(); } });
    if (port) { // phones: one window at a time, the full screen
      if (T < CHAT) { const a = clamp((T - 0.2) / 0.3) * (1 - clamp((T - CHAT + 0.25) / 0.25)); const c = win(g, 6, 30, W - 12, H - 100, 'messages', a); thread(g, c, T, fs, RM); c.done(); }
      else if (T < CLOSE + 0.3) { const a = clamp((T - CHAT) / 0.25) * (1 - clamp((T - CLOSE) / 0.3)); const c = win(g, 6, 30, W - 12, H - 100, 'labchat', a); labchat(g, c, T, fs, true, RM); c.done(); } }
    else { // desktop: messages on the left, labchat over it on the right
      const mw = Math.min(420, W * 0.34), mh = Math.min(H - 130, 620), ma = clamp((T - 0.2) / 0.3) * (1 - clamp((T - CLOSE) / 0.4) * 0.6);
      if (ma > 0) { const c = win(g, W * 0.06, 40, mw, mh, 'messages · ❤️', ma); thread(g, c, T, fs, RM); c.done(); }
      if (T >= CHAT && T < CLOSE + 0.35) { const u = RM ? 1 : ease(clamp((T - CHAT) / 0.3)), out = clamp((T - CLOSE) / 0.35), cw = Math.min(820, W * 0.6), ch = Math.min(H - 120, 600);
        const c = win(g, W - cw - W * 0.05, 52, cw, ch, 'labchat · lab-07', u * (1 - out), (0.94 + 0.06 * u) * (1 - 0.2 * out)); labchat(g, c, T, fs, false, RM); c.done(); } }
    // the notification from Lester
    if (T >= NOTE && T < CHAT + 0.4) { const a = RM ? 1 : ease(clamp((T - NOTE) / 0.25)) * (1 - clamp((T - CHAT) / 0.4)), nw = Math.min(330, W - 24), nx = W - nw - 12 + (1 - a) * 40;
      g.save(); g.globalAlpha = a; g.fillStyle = '#18202aee'; rr(g, nx, 34, nw, 62, 12); g.fill(); g.strokeStyle = '#2e3a47'; rr(g, nx, 34, nw, 62, 12); g.stroke();
      g.font = `700 12px ${SANS}`; g.fillStyle = '#6fd6a8'; g.fillText('labchat · Lester', nx + 14, 52); g.font = `13px ${SANS}`; g.fillStyle = '#e1e8ee'; g.fillText(DMLINES[0].text, nx + 14, 74); g.restore(); }
    // the terminal opens: a window that grows to the whole screen, then the boot takes over
    if (T >= TERM - 0.1) { const u = RM ? 1 : ease(clamp((T - TERM) / 0.55)), w = W * (0.3 + 0.7 * u), h = H * (0.3 + 0.7 * u); g.fillStyle = BG; rr(g, W / 2 - w / 2, H / 2 - h / 2, w, h, 10 * (1 - u)); g.fill();
      g.font = `${Math.round(fs * 0.95)}px ${MONO}`; g.fillStyle = TXT; g.fillText('$ ', W / 2 - w / 2 + 14, H / 2 - h / 2 + 22); }
    overlay(g, W, H, 0.35);
    if (T < 0.5) { g.fillStyle = `rgba(0,0,0,${1 - T / 0.5})`; g.fillRect(0, 0, W, H); } }
  // sound: the room (a quiet hum, rain on the window), the messages, the notification, the chat's ticks, his keys, the windows
  const AEV = (() => { const ev = [{ t: 0, k: 'room', d: ADUR }];
    TH.forEach(m => ev.push({ t: m.at, k: m.me ? 'sent' : 'recv' })); ev.push({ t: NOTE, k: 'notify' }, { t: CHAT, k: 'win' });
    BL.forEach(b => ev.push({ t: b.at, k: 'tick' })); DM.forEach((l, i) => { if (i === 0) return; if (l.who === 'scientist') { for (let t = l.typeAt; t < l.at - 0.15; t += 0.07 + 0.03 * ((i * 7 + t * 13) % 1)) ev.push({ t, k: 'key' }); ev.push({ t: l.at, k: 'send' }); } else ev.push({ t: l.at, k: 'tick' }); });
    ev.push({ t: CLOSE, k: 'win' }, { t: TERM, k: 'win' }); return ev.sort((a, b) => a.t - b.t); })();
  function asound(ctx, dest, e, at) {
    const tone = (type, f, t0, dur, vol, f2) => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur); v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(vol, t0 + Math.min(.01, dur / 4)); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(v); v.connect(dest); o.start(t0); o.stop(t0 + dur + .05); };
    const nz = (t0, dur, vol, type, f, q = 1, loop = false, fadeIn = 0.01, f2) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = noise(ctx); s.loop = loop; fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur); fl.Q.value = q;
      v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(vol, t0 + fadeIn); if (loop) { v.gain.setValueAtTime(vol, t0 + Math.max(fadeIn, dur - 0.4)); v.gain.linearRampToValueAtTime(0.0001, t0 + dur); } else v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(fl); fl.connect(v); v.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05); };
    switch (e.k) {
      case 'room': { nz(at, e.d, 0.012, 'lowpass', 420, 0.7, true, 0.5); nz(at, e.d, 0.018, 'highpass', 2600, 0.5, true, 0.8); const o = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sine'; o.frequency.value = 60; v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(0.015, at + 0.5); v.gain.setValueAtTime(0.015, at + Math.max(0.5, e.d - 0.5)); v.gain.linearRampToValueAtTime(0.0001, at + e.d); o.connect(v); v.connect(dest); o.start(at); o.stop(at + e.d + 0.05); break; }
      case 'sent': nz(at, 0.22, 0.09, 'bandpass', 900, 1.4, false, 0.01, 3200); break;
      case 'recv': tone('sine', 1320, at, 0.09, 0.05); tone('sine', 1760, at + 0.09, 0.12, 0.05); break;
      case 'notify': tone('sine', 988, at, 0.12, 0.06); tone('sine', 1319, at + 0.12, 0.18, 0.06); break;
      case 'tick': tone('sine', 1500, at, 0.05, 0.03); break;
      case 'key': nz(at, 0.03, 0.12, 'bandpass', 2600 + Math.random() * 800, 1.5); break;
      case 'send': nz(at, 0.06, 0.12, 'bandpass', 1300, 1.2); break;
      case 'win': nz(at, 0.25, 0.04, 'bandpass', 600, 0.8, false, 0.01, 1800); break; } }
  const afire = (ctx, dest, T0, T1, at) => { for (const e of AEV) if (e.t > T0 && e.t <= T1) { try { asound(ctx, dest, e, at); } catch (er) {} } };
  const afireAll = (ctx, dest, t0) => { for (const e of AEV) { try { asound(ctx, dest, e, t0 + e.t); } catch (er) {} } };
  const abeds = (ctx, dest, T, at) => { for (const e of AEV) if (e.d && T > e.t && T < e.t + e.d - 0.3) { try { asound(ctx, dest, { ...e, d: e.t + e.d - T }, at); } catch (er) {} } };
  const arrive = { dur: ADUR, draw: arriveDraw, fire: afire, fireAll: afireAll, beds: abeds, lines: [], thread: TH.map(m => ({ at: m.at, me: m.me, text: m.text })),
    chat: { note: NOTE, open: CHAT, dm: DMT, close: CLOSE, backlog: BL.map(b => ({ who: b.who, at: b.at })), dm_lines: DM.map(l => ({ who: l.who, at: l.at, text: l.text })), channels: CHANNELS.slice() },
    scenes: { messages: [0, CHAT], chat: [CHAT, CLOSE], terminal: [TERM, ADUR] }, beat: BT, sayFz, events: AEV.length, lastSay: () => lastSay };

  // the title card (Nico: "typical retro 'Press any key to start'… like the scientist is either working remote, or just arrived at work and
  // is opening the computer"): the story's first frame, waiting for a key or a tap (which also lets the sound start)
  function titleDraw(g, W, H, t, P, RM) {
    const port = portOf(W, H, P); g.fillStyle = BG; g.fillRect(0, 0, W, H);
    const big = Math.round(clamp(W / (port ? 8 : 13), 38, 96)), on = RM || Math.floor(t * 1.6) % 2 === 0, warm = RM ? 1 : clamp(t / 0.8);
    g.save(); g.globalAlpha = warm; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${big}px ${MONO}`; g.fillStyle = '#e9f6ff'; g.shadowColor = CY; g.shadowBlur = 24; g.fillText('ø Id|le OS', W / 2, H * 0.42); g.shadowBlur = 0;
    g.font = `${Math.round(big * 0.24)}px ${MONO}`; g.fillStyle = DIM; g.fillText('v 0/67 · lab-07', W / 2, H * 0.42 + big * 0.75);
    if (on) { g.font = `700 ${Math.round(clamp(big * 0.3, 15, 26))}px ${MONO}`; g.fillStyle = AMB; g.fillText(port || matchMedia('(pointer: coarse)').matches ? 'TAP TO START' : 'PRESS ANY KEY TO START', W / 2, H * 0.66); }
    g.restore(); overlay(g, W, H, 0.8); }
  window.__termBoot = { dur: DUR, draw, title: titleDraw, panes, chrome, overlay, fire, fireAll, beds: bootBeds, arrive, say, clock: K, events: EV.length };
})();
