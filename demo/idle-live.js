// idle-live.js: the creator's live view (demo/live.html, served at /live; 11-03). Everyone with Id|le open right now is a soft circle
// that pops in when they arrive and fades when they leave, grouped by mode (the storyline, the playground from nothing or as a ready world, the plain world)
// or by country; it grows with their time in the game, and its glyph says what they're doing (the storyline's step, a panel open).
// Side charts: online over the last hour, arrivals and leaves per minute, where storyline players are, panels, countries, devices.
// Reads GET /lab/live every 2.5 s while this page is visible, with the creator's key (Authorization: Bearer …, kept in this browser's
// localStorage); without it the server answers 404. The data is what idle-presence.js beats: coarse, anonymous, in memory for a minute.
(() => {
  const KEY = 'idle.liveKey', EVERY = 2500, $ = s => document.querySelector(s);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const MODE = { story: ['storyline', css('--s-story')], free: ['playground · from nothing', css('--s-free')], ready: ['playground · ready world', css('--s-ready')], world: ['plain world', css('--s-world')] };
  // countries: the three with most players get the categorical hues (fixed slot order, by count at the moment they first appear), the rest grey
  const CC_SLOTS = [css('--s-story'), css('--s-free'), css('--s-ready')], OTHER = css('--s-world');
  const STEP = { intro: 'intro', dark: 'the dark', lights: 'lights on', words: 'words', life: 'life', 'genesis-done': 'Genesis done', epoch: 'epoch', end: 'end card' };
  const GLYPH = { intro: '▶', dark: '●', lights: '☀', words: 'Aa', life: '✦', 'genesis-done': '0✓', end: '⌛' };
  const PGLYPH = { operator: '📟', card: '🪪', creatures: '🐾', studio: '🎨', music: '🎵', lab: '🧬', advisor: '🧭', almanac: '📅', drawer: '🗄', trees: '🌳', reels: '🎞', settings: '⚙', feedback: '🧪', oracle: '🔮', review: '⭐', irc: '💬' };
  const DEV = { phone: '📱', tablet: '📱', desktop: '🖥' };
  let key = ''; try { key = localStorage.getItem(KEY) || ''; } catch (e) {}
  let by = 'mode', data = null, failing = 0, ccSlot = {};
  const nodes = new Map();   // alias → { x, y, vx, vy, r, born, gone, d }

  // ---------- the key ----------
  const keyBox = $('#key'), keyForm = keyBox.querySelector('form'), keyIn = keyBox.querySelector('input'), keyErr = keyBox.querySelector('.err');
  const askKey = msg => { keyErr.textContent = msg || ''; keyBox.style.display = 'grid'; keyIn.focus(); };
  keyForm.addEventListener('submit', e => { e.preventDefault(); key = keyIn.value.trim(); keyIn.value = ''; try { localStorage.setItem(KEY, key); } catch (err) {} keyBox.style.display = 'none'; poll(); });

  // ---------- polling ----------
  let timer = 0;
  async function poll() {
    clearTimeout(timer); if (!key) return askKey(); if (document.hidden) return;
    try {
      const r = await fetch('/lab/live', { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' });
      if (r.status === 404) { key = ''; try { localStorage.removeItem(KEY); } catch (e) {} return askKey('That key was not accepted.'); }
      if (!r.ok) throw new Error('status ' + r.status);
      data = await r.json(); failing = 0; update();
      $('#status').textContent = 'updated ' + new Date(data.now).toLocaleTimeString() + ' · every ' + EVERY / 1000 + ' s';
    } catch (e) { failing++; $('#status').textContent = 'can’t reach the server (' + failing + '), retrying…'; }
    timer = setTimeout(poll, failing ? Math.min(30000, EVERY * (1 + failing)) : EVERY);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // ---------- the stage ----------
  const cv = $('#cv'), g = cv.getContext('2d'), stage = $('#stage'); let W = 0, Hh = 0, dpr = 1;
  const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); W = stage.clientWidth; Hh = stage.clientHeight; cv.width = W * dpr; cv.height = Hh * dpr; };
  addEventListener('resize', resize); resize();
  const groupOf = p => by === 'mode' ? p.mode : (p.cc || 'XX');
  const colorOf = p => by === 'mode' ? (MODE[p.mode] || MODE.world)[1] : (ccSlot[p.cc] != null ? CC_SLOTS[ccSlot[p.cc]] : OTHER);
  const labelOf = k => by === 'mode' ? (MODE[k] || MODE.world)[0] : k === 'XX' ? 'unknown' : k;
  const radius = p => Math.min(30, 9 + 5 * Math.log2(1 + (p.t || 0) / 30));
  const glyphOf = p => (p.p && p.p[0] && PGLYPH[p.p[0]]) || (p.mode === 'story' ? (p.step === 'epoch' ? 'E' + p.ep : GLYPH[p.step] || '') : '');
  let anchors = {};
  function layoutGroups() {   // groups sit on an ellipse around the middle, biggest first; one group sits in the middle
    const count = {}; for (const n of nodes.values()) if (!n.gone) count[groupOf(n.d)] = (count[groupOf(n.d)] || 0) + 1;
    const ks = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b)); anchors = {};
    const cx = W * 0.5, cy = Hh * 0.55, rx = Math.min(W * 0.32, 420), ry = Math.min(Hh * 0.28, 260);
    ks.forEach((k, i) => { anchors[k] = ks.length === 1 ? { x: cx, y: cy } : { x: cx + rx * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / ks.length), y: cy + ry * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / ks.length) }; anchors[k].n = count[k]; });
  }
  function update() {
    const now = performance.now(), seen = new Set();
    // country slots: the top three countries keep their hue for as long as they stay in the top three
    const cc = data.tot && data.tot.cc || {}, top = Object.keys(cc).filter(k => k !== 'XX').sort((a, b) => cc[b] - cc[a]).slice(0, 3);
    for (const k of Object.keys(ccSlot)) if (!top.includes(k)) delete ccSlot[k];
    for (const k of top) if (ccSlot[k] == null) { const used = new Set(Object.values(ccSlot)); const s = [0, 1, 2].find(i => !used.has(i)); if (s != null) ccSlot[k] = s; }
    for (const p of data.players || []) { seen.add(p.a); const n = nodes.get(p.a);
      if (n) { n.d = p; n.gone = 0; }
      else { const a = anchors[groupOf(p)] || { x: W / 2, y: Hh / 2 }; nodes.set(p.a, { x: a.x + (Math.random() - 0.5) * 80, y: a.y + (Math.random() - 0.5) * 80, vx: 0, vy: 0, r: 0, born: now, gone: 0, d: p }); } }
    for (const [k, n] of nodes) if (!seen.has(k) && !n.gone) n.gone = now;
    layoutGroups(); charts(); legend();
    $('#big').firstChild.nodeValue = String(data.online);
  }
  function step(now) {
    for (const [k, n] of nodes) if (n.gone && now - n.gone > 1400) nodes.delete(k);
    const arr = [...nodes.values()];
    for (const n of arr) { const a = anchors[groupOf(n.d)]; if (a) { n.vx += (a.x - n.x) * 0.0016; n.vy += (a.y - n.y) * 0.0016; } }
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const a = arr[i], b = arr[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = radius(a.d) + radius(b.d) + 6;
      if (d < min) { const f = (min - d) / d * 0.08; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f; } }
    for (const n of arr) { n.vx *= 0.86; n.vy *= 0.86; n.x += n.vx; n.y += n.vy; }
  }
  const ease = t => { t = Math.min(1, Math.max(0, t)); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };   // a little overshoot: a pop
  let hover = null;
  function draw(now) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) step(now); else for (const n of nodes.values()) { const a = anchors[groupOf(n.d)]; if (a && !n.placed) { n.x = a.x + (Math.random() - 0.5) * 60; n.y = a.y + (Math.random() - 0.5) * 60; n.placed = 1; } }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    // group labels
    g.font = `12px ${css('--term-font') || 'ui-monospace'}, ui-monospace, monospace`; g.textAlign = 'center'; g.fillStyle = css('--muted');
    for (const [k, a] of Object.entries(anchors)) g.fillText(`${labelOf(k)} · ${a.n}`, a.x, a.y - 70);
    for (const n of nodes.values()) {
      const p = n.d, grow = reduce ? 1 : ease((now - n.born) / 600), fade = n.gone ? Math.max(0, 1 - (now - n.gone) / 1400) : 1, r = radius(p) * (n.gone ? 1 + (1 - fade) * 0.4 : grow), col = colorOf(p);
      if (r <= 0.5 || fade <= 0) continue;
      g.globalAlpha = fade;
      const gr = g.createRadialGradient(n.x, n.y, r * 0.2, n.x, n.y, r * 1.9); gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(n.x, n.y, r * 1.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = col + 'cc'; g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = 2; g.strokeStyle = css('--bg'); g.stroke();   // a ring of the surface where circles touch
      if (hover === n) { g.lineWidth = 2; g.strokeStyle = css('--ink'); g.beginPath(); g.arc(n.x, n.y, r + 3, 0, Math.PI * 2); g.stroke(); }
      const gl = glyphOf(p); if (gl && r > 10) { g.fillStyle = '#fff'; g.font = `${Math.round(Math.min(16, r * 0.8))}px ${css('--ui-font') || 'system-ui'}, system-ui, sans-serif`; g.textBaseline = 'middle'; g.fillText(gl, n.x, n.y + 1); g.textBaseline = 'alphabetic'; }
      g.globalAlpha = 1;
    }
    if (!nodes.size && data) { g.fillStyle = css('--muted'); g.font = `14px ${css('--ui-font') || 'system-ui'}, system-ui`; g.fillText('nobody online right now', W / 2, Hh / 2); }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // ---------- hover ----------
  const tip = $('#tip'), fmt = s => s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
  cv.addEventListener('pointermove', e => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; hover = null;
    for (const n of nodes.values()) if (!n.gone && Math.hypot(n.x - x, n.y - y) <= Math.max(14, radius(n.d) + 6)) hover = n;   // a target bigger than the mark
    if (!hover) { tip.style.display = 'none'; return; }
    const p = hover.d, row = (k, v) => `<div><span>${k}</span><span>${v}</span></div>`;
    tip.innerHTML = `<b>player ${p.a}</b>` + row('mode', (MODE[p.mode] || MODE.world)[0] + (p.mode === 'story' && p.arm !== 'none' ? ' (' + p.arm + ' arm)' : ''))
      + (p.mode === 'story' ? row('where', p.step === 'epoch' ? 'epoch ' + p.ep : STEP[p.step] || '–') : '')
      + row('in game', fmt(p.t)) + row('online here', fmt(p.since)) + row('country', p.cc === 'XX' ? 'unknown' : p.cc) + row('device', (DEV[p.dev] || '') + ' ' + p.dev)
      + row('panels', p.p && p.p.length ? p.p.map(k => (PGLYPH[k] || '') + ' ' + k).join(', ') : 'none') + row('creatures', p.cr || '–') + row('been before', p.back ? 'yes' : 'first visit');
    tip.style.display = 'block'; const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(W - tw - 8, x + 14) + 'px'; tip.style.top = Math.min(Hh - th - 8, y + 14) + 'px'; });
  cv.addEventListener('pointerleave', () => { hover = null; tip.style.display = 'none'; });

  // ---------- controls and legend ----------
  document.querySelectorAll('#ctl button').forEach(b => b.addEventListener('click', () => { by = b.dataset.by;
    document.querySelectorAll('#ctl button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (data) { layoutGroups(); legend(); } }));
  function legend() { const L = $('#legend');
    if (by === 'mode') L.innerHTML = Object.values(MODE).map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('');
    else { const ks = Object.keys(ccSlot).sort((a, b) => ccSlot[a] - ccSlot[b]); L.innerHTML = ks.map(k => `<span><i style="background:${CC_SLOTS[ccSlot[k]]}"></i>${k}</span>`).join('') + `<span><i style="background:${OTHER}"></i>other countries</span>`; }
    L.innerHTML += `<span style="color:var(--muted)">size: time in game · glyph: what they’re doing</span>`; }

  // ---------- side charts ----------
  const bars = (el, obj, label = k => k) => { const ks = Object.keys(obj || {}).filter(k => obj[k] > 0).sort((a, b) => obj[b] - obj[a]).slice(0, 8);
    if (!ks.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1">nobody</div>'; return; }
    const max = Math.max(...ks.map(k => obj[k]));
    el.innerHTML = ks.map(k => `<span class="l" title="${label(k)}">${label(k)}</span><span class="t"><i style="width:${(obj[k] / max * 100).toFixed(1)}%"></i></span><span class="v">${obj[k]}</span>`).join(''); };
  function spark(c, series, opts) {   // one axis: counts per minute; up and down from one baseline for arrivals/leaves
    const d = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; c.width = w * d; c.height = h * d; const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
    const n = 60, last = series.length ? series[series.length - 1].m : 0, at = m => w - 4 - (last - m) * ((w - 8) / (n - 1));
    x.strokeStyle = css('--grid'); x.lineWidth = 1; const base = opts.split ? h / 2 : h - 12; x.beginPath(); x.moveTo(0, base + 0.5); x.lineTo(w, base + 0.5); x.stroke();
    x.fillStyle = css('--muted'); x.font = `10px ${css('--ui-font') || 'system-ui'}, system-ui`; x.textAlign = 'left'; x.fillText('−60 min', 2, h - 1); x.textAlign = 'right'; x.fillText('now', w - 2, h - 1);
    if (!series.length) return;
    if (opts.split) { const max = Math.max(1, ...series.map(s => Math.max(s.arr, s.left))), sc = (h / 2 - 12) / max, bw = Math.max(2, (w - 8) / n - 2);
      for (const s of series) { const px = at(s.m) - bw / 2; x.fillStyle = css('--s-ready'); if (s.arr) x.fillRect(px, base - s.arr * sc, bw, s.arr * sc - 1); x.fillStyle = css('--s-free'); if (s.left) x.fillRect(px, base + 1, bw, s.left * sc); } }
    else { const max = Math.max(1, ...series.map(s => s.on)), sc = (h - 22) / max; x.strokeStyle = css('--s-story'); x.lineWidth = 2; x.beginPath();
      series.forEach((s, i) => { const px = at(s.m), py = base - s.on * sc; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke();
      const s = series[series.length - 1]; x.fillStyle = css('--s-story'); x.beginPath(); x.arc(at(s.m), base - s.on * sc, 4, 0, Math.PI * 2); x.fill();
      x.fillStyle = css('--ink2'); x.textAlign = 'left'; x.fillText('max ' + max, 2, 10); }
  }
  function charts() { const T = data.tot || {};
    spark($('#spOn'), data.hist || [], {}); spark($('#spAL'), data.hist || [], { split: true });
    bars($('#bStep'), T.step, k => STEP[k] || k); bars($('#bPanel'), T.panel, k => (PGLYPH[k] || '') + ' ' + k); bars($('#bCc'), T.cc, k => k === 'XX' ? 'unknown' : k);
    bars($('#bDev'), T.dev, k => (DEV[k] || '') + ' ' + k); bars($('#bMode'), T.mode, k => (MODE[k] || MODE.world)[0]); }
  window.__live = { state: () => ({ online: data ? data.online : null, nodes: [...nodes.values()].filter(n => !n.gone).map(n => n.d.a), by, key: !!key }) };
  poll();
})();
