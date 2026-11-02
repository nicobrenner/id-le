// idle-boot.js: the boot, a terminal prelude to Epoch 0 (Nico, Nov 2: "before the start, we need something like a cool DOS/linux terminal…";
// script: boot-script.md). A CRT wakes, a globe made of letters spins (faux 3D, drawn here as a character grid), the lab node boots with
// made-up future versions, the operator logs in, types "run project 24" at a powerline prompt, and the screen splits like a terminal
// multiplexer: TRAINING LOSS · project 24, MODEL SAMPLE DIALOG OUTPUTS, the training log, the GPUs. Epoch 0 (idle-epoch0.js) then runs inside
// those panes: it asks panes() for its layout and draws chrome() around itself every frame.
// Nothing here is real hardware or a real product: the numbers are invented, there are no vendor logos.
// API: window.__termBoot = { dur, draw(g, W, H, T, P, RM), panes(W, H, P), chrome(g, W, H, Tf, P, RM, o), overlay(g, W, H, a),
//   fire(ctx, dest, T0, T1, at) (live sound for boot seconds T0..T1), fireAll(ctx, dest, t0) (recordings) }.
(() => {
  const DUR = 12.4;
  const BG = '#06090b', TXT = '#b9c6cc', DIM = '#5d6b74', OK = '#7fd38a', AMB = '#f0b45a', RED = '#ff5d5d', CY = '#7ee3f5', MAG = '#e0367a', BORDER = '#22323c', ACT = '#4fae63';
  const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ease = u => u * u * (3 - 2 * u);
  const portOf = (W, H, P) => !!P || W < H * 1.1;
  // ---------- the script's clock (seconds) ----------
  const K = { globe: 0.25, log: 2.35, login: 6.15, user: 6.35, pass: 7.2, last: 8.0, welcome: 8.25, shell: 8.55, cmd: 9.1, enter: 10.55, split: 11.25 };
  const CMD = 'run project 24', USER = 'operator', PASS = '**********';
  // the boot log: [text, status, status colour, seconds it takes, shown on phones]
  const LOG = [
    ['LAB-BIOS 41.7 · observatory node 07', '', DIM, 0.24, 1],
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
  const CMD_CPS = CMD.length / (K.enter - K.cmd - 0.2);
  const SHELL_OUT = [[10.72, '▸ project 24: a tiny language model, trained from scratch'], [10.88, '▸ gpu0–7 allocated · 1.0 TiB pinned'], [11.04, '▸ opening panes: loss · samples · gpu']];
  const SHELL_OUT_P = [[10.72, '▸ project 24: a tiny model, from scratch'], [10.88, '▸ gpu0–7 allocated'], [11.04, '▸ opening panes']];

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
        if (i === 2 && T < t0 + l[3] * 0.85 && !RM) txt = `unified memory: ${Math.floor(1048576 * ease(clamp((T - t0) / (l[3] * 0.85)))).toLocaleString('en-US')} MB`;
        const done = T >= t0 + l[3] * 0.6 || RM; lines.push({ txt: txt.length > width ? txt.slice(0, width - 1) + '…' : txt, st: l[1] && done ? l[1] : '', col: l[2], dots: !!l[1], width }); });
      if (T >= K.login) { lines.push({ txt: '' }); lines.push({ txt: 'lab-node-07 login: ' + typed(USER, K.user, 13, T, RM), cur: T < K.pass });
        if (T >= K.pass - 0.08) lines.push({ txt: 'password: ' + typed(PASS, K.pass + 0.1, 15, T, RM), cur: T < K.last });
        if (T >= K.last) lines.push({ txt: port ? 'Last login: Sun Nov 1 23:58 · obs-deck' : 'Last login: Sun Nov  1 23:58:12 2041 from observation-deck', col: DIM });
        if (T >= K.welcome) lines.push({ txt: port ? 'welcome back, operator.' : 'welcome back, operator. 23 universes archived, 0 running.', col: TXT }); }
      const vis = lines.slice(-rowsMax); g.font = `${fz}px ${MONO}`; g.textBaseline = 'middle';
      vis.forEach((L, i) => { const y = pad + lh * (i + 0.5); g.fillStyle = L.col && !L.dots ? L.col : TXT; let x = pad;
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
    shellText(g, sh, p, T, RM, null, u < 0.5 ? (port ? 12 : Math.round(clamp(W / 90, 12, 15))) : p.pfz);
    overlay(g, W, H); }
  // the shell's lines (the prompt, the command and its output; in the film, the training log follows)
  function shellLines(T, RM, port) {
    const out = [{ txt: port ? '[session project-24]' : '[session project-24 · 4 panes · zero universes running]', col: DIM }];
    if (T >= K.cmd - 0.4) out.push({ prompt: true, cmd: typed(CMD, K.cmd, CMD_CPS, T, RM), cur: T < K.enter });
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
    keyTimes(CMD, K.cmd, CMD_CPS).forEach(t => ev.push({ t, k: 'key' })); ev.push({ t: K.enter, k: 'enter' }); SHELL_OUT.forEach(([t]) => ev.push({ t, k: 'tick' })); ev.push({ t: K.split, k: 'whoomp' });
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

  window.__termBoot = { dur: DUR, draw, panes, chrome, overlay, fire, fireAll, clock: K, events: EV.length };
})();
