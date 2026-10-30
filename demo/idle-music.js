// idle-music.js: background music and the DJ deck, all made live with WebAudio (no audio files).
// Background music is off until you turn it on. It follows the world: a mood per place (Home warm and plucky,
// Gloamhold low drones and bells), the weather (rain softens it, storms add a low pulse, fog slows it, wind breathes)
// and the day (night is sparser and lower), and it marks a few events (a name given, a volcano, a hangry creature, a new reel).
// The deck (🎧) is a small groove box: tempo, key and scale, a 16-step grid (kick, snare, hat, clap, bass), a mixer
// (bass, lead, pad, each soft↔gritty), filter, echo, bitcrush and a drop, plus lights on the beat. While the deck plays
// it takes over from the background music; stopping it brings the background back. Sets are saved here and in snapshots.
(() => {
  const KEY = 'idle.music', $ = s => document.querySelector(s);
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], 'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10] };
  const ROWS = ['kick', 'snare', 'hat', 'clap', 'bass'];
  const P = s => [...(s + '................').slice(0, 16)].map(c => c === 'x' ? 1 : 0);
  const PRESETS = {
    house: { bpm: 122, kick: 'x...x...x...x...', snare: '', hat: '..x...x...x...x.', clap: '....x.......x...', bass: '..x...x...x...x.' },
    techno: { bpm: 132, kick: 'x...x...x...x...', snare: '', hat: 'xxxxxxxxxxxxxxxx', clap: '....x.......x...', bass: 'x..x..x.x..x..x.' },
    breakbeat: { bpm: 128, kick: 'x.....x...x.....', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.', clap: '', bass: 'x.....x...x.....' },
    halftime: { bpm: 140, kick: 'x.......x.x.....', snare: '........x.......', hat: 'x.x.x.xxx.x.x.xx', clap: '........x.......', bass: 'x.......x.x.....' },
    'boom bap': { bpm: 90, kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', clap: '', bass: 'x......x..x.....' },
    ambient: { bpm: 76, kick: '', snare: '', hat: '....x.......x...', clap: '', bass: 'x.......' },
    empty: { bpm: 110, kick: '', snare: '', hat: '', clap: '', bass: '' } };
  const presetGrid = p => Object.fromEntries(ROWS.map(r => [r, P(PRESETS[p][r] || '')]));
  const DECK0 = () => ({ bpm: 122, key: 9, scale: 'minor', preset: 'house', grid: presetGrid('house'), seed: 1, vol: 0.8,
    ch: { bass: { v: 0.8, m: 0.3 }, lead: { v: 0.5, m: 0.4 }, pad: { v: 0.5, m: 0.2 } }, fx: { filter: 1, echo: 0.2, crush: 0 },
    lights: { pulse: true, spots: true, strobe: false } });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const S = Object.assign({ bg: { on: false, vol: 0.5 }, deck: DECK0(), sets: [], open: false, rave: false }, load() || {});
  S.deck = Object.assign(DECK0(), S.deck); S.deck.lights = Object.assign(DECK0().lights, S.deck.lights);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ bg: S.bg, deck: S.deck, sets: S.sets, open: S.open, rave: S.rave })); } catch (e) {} };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = () => { const w = (window.__weather && window.__weather.get && window.__weather.get()) || {}, pk = window.__places ? window.__places.kind() : 'home';
    return { kind: String(w.kind || 'clear'), k: w.k ?? 0.35, keep: pk === 'keep', day: window.__day ? window.__day.phase() : 0.25 }; };
  const isNight = d => d > 0.55 && d < 0.95;

  // ---------- audio graph ----------
  let ctx = null, master, bgBus, bgFilt, deckBus, dFilt, crush, crushWet, crushDry, echo, echoFb, echoWet, comp, noiseBuf = null;
  function ensure() { if (ctx) return ctx; ctx = new (window.AudioContext || window.webkitAudioContext)();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    bgFilt = ctx.createBiquadFilter(); bgFilt.type = 'lowpass'; bgFilt.frequency.value = 6000; bgFilt.connect(master);
    bgBus = ctx.createGain(); bgBus.gain.value = 0; bgBus.connect(bgFilt);
    deckBus = ctx.createGain(); deckBus.gain.value = 0;
    dFilt = ctx.createBiquadFilter(); dFilt.type = 'lowpass'; dFilt.Q.value = 3; deckBus.connect(dFilt);
    crush = ctx.createWaveShaper(); crushWet = ctx.createGain(); crushDry = ctx.createGain(); dFilt.connect(crush); crush.connect(crushWet); dFilt.connect(crushDry);
    echo = ctx.createDelay(2); echoFb = ctx.createGain(); echoWet = ctx.createGain(); const post = ctx.createGain();
    crushWet.connect(post); crushDry.connect(post); post.connect(master); post.connect(echo); echo.connect(echoFb); echoFb.connect(echo); echo.connect(echoWet); echoWet.connect(master);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    applyFx(); return ctx; }
  function applyFx() { if (!ctx) return; const f = S.deck.fx, t = ctx.currentTime;
    dFilt.frequency.setTargetAtTime(180 * Math.pow(2, f.filter * 6.8), t, 0.05);
    const bits = Math.round(16 - f.crush * 13), steps = Math.pow(2, bits), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.round(x * steps / 2) / (steps / 2); } crush.curve = c;
    crushWet.gain.setTargetAtTime(f.crush > 0.02 ? 1 : 0, t, 0.02); crushDry.gain.setTargetAtTime(f.crush > 0.02 ? 0 : 1, t, 0.02);
    echo.delayTime.setTargetAtTime(Math.min(1.9, 0.75 * 60 / S.deck.bpm), t, 0.05); echoFb.gain.setTargetAtTime(0.25 + f.echo * 0.4, t, 0.05); echoWet.gain.setTargetAtTime(f.echo * 0.6, t, 0.05); }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function env(g, t, a, peak, d, sus, rel, dur) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(sus * peak, t + a, d / 3); g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur), rel / 4); }
  function tone(bus, t, freq, { type = 'triangle', dur = 0.3, vol = 0.2, a = 0.005, d = 0.15, sus = 0.3, rel = 0.3, cut = 4000, q = 0.7, detune = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = type; o.frequency.value = freq; o.detune.value = detune; f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = q;
    o.connect(f); f.connect(g); g.connect(bus); env(g, t, a, vol, d, sus, rel, dur); o.start(t); o.stop(t + dur + rel * 1.5 + 0.05); }
  function noise(bus, t, { dur = 0.1, vol = 0.2, type = 'highpass', freq = 6000, q = 0.8, a = 0.001, rel = 0.05 } = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(g); g.connect(bus); env(g, t, a, vol, dur, 0, rel, dur); s.start(t, Math.random() * 1.5); s.stop(t + dur + rel * 2 + 0.05); return f; }
  function bell(bus, t, freq, vol) { [[1, 1], [2.76, 0.4], [5.4, 0.18]].forEach(([r, v]) => tone(bus, t, freq * r, { type: 'sine', dur: 0.05, vol: vol * v, a: 0.002, d: 0.6, sus: 0.0, rel: 2.4 / r, cut: 9000 })); }

  // ---------- drums and deck voices ----------
  function kick(t, v = 1) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); o.connect(g); g.connect(deckBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38); o.start(t); o.stop(t + 0.42); }
  function snare(t) { noise(deckBus, t, { dur: 0.12, vol: 0.35, type: 'bandpass', freq: 1800, q: 0.6, rel: 0.12 }); tone(deckBus, t, 190, { type: 'triangle', dur: 0.06, vol: 0.25, d: 0.05, sus: 0, rel: 0.08 }); }
  function hat(t, open) { noise(deckBus, t, { dur: open ? 0.18 : 0.03, vol: 0.14, type: 'highpass', freq: 7500, rel: open ? 0.15 : 0.03 }); }
  function clap(t) { for (let i = 0; i < 3; i++) noise(deckBus, t + i * 0.012, { dur: 0.02, vol: 0.22, type: 'bandpass', freq: 1300, q: 1.2, rel: 0.04 }); noise(deckBus, t + 0.036, { dur: 0.1, vol: 0.18, type: 'bandpass', freq: 1300, q: 1.2, rel: 0.12 }); }
  const oscFor = m => m < 0.34 ? 'sine' : m < 0.67 ? 'triangle' : 'sawtooth', leadOsc = m => m < 0.34 ? 'triangle' : m < 0.67 ? 'square' : 'sawtooth';
  const deg = (sc, root, i) => { const n = sc.length, o = Math.floor(i / n); return root + sc[((i % n) + n) % n] + 12 * o; };
  const PROG = [0, 5, 2, 6];   // i – VI – III – VII in scale degrees, one chord per bar
  let leadPat = null;
  function rollLead() { let s = S.deck.seed * 9301 + 49297; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; leadPat = Array.from({ length: 4 }, () => Array.from({ length: 16 }, (_, i) => (i % 2 === 0 && r() < 0.55) || r() < 0.12 ? Math.floor(r() * 5) : -1)); }
  function deckStep(step, t) { const D = S.deck, G = D.grid, i = step % 16, bar = Math.floor(step / 16) % 4, sc = SCALES[D.scale] || SCALES.minor, chord = PROG[bar], spb = 60 / D.bpm / 4;
    if (dropAt && t >= dropAt.cut && t < dropAt.back) return;   // the silence before the drop
    if (G.kick[i]) { kick(t); beat(t, 1); } else if (i % 4 === 0) beat(t, 0.4);
    if (i % 4 === 0) beatEv(t, i, G);
    if (G.snare[i]) snare(t); if (G.hat[i]) hat(t, i % 8 === 6); if (G.clap[i]) clap(t);
    const ch = D.ch, root = 36 + D.key;
    if (G.bass[i] && ch.bass.v > 0.01) tone(deckBus, t, mtof(deg(sc, root, chord) + (i % 8 === 4 ? 12 : 0)), { type: oscFor(ch.bass.m), dur: spb * 1.6, vol: 0.32 * ch.bass.v, d: 0.12, sus: 0.6, rel: 0.08, cut: 280 + ch.bass.m * 2600, q: 2 + ch.bass.m * 6 });
    if (!leadPat) rollLead(); const ln = leadPat[bar][i];
    if (ln >= 0 && ch.lead.v > 0.01) tone(deckBus, t, mtof(deg(sc, root + 24, chord + [0, 2, 4, 7, 9][ln])), { type: leadOsc(ch.lead.m), dur: spb * 0.9, vol: 0.11 * ch.lead.v, d: 0.08, sus: 0.3, rel: 0.12, cut: 900 + ch.lead.m * 5000 });
    if (i === 0 && ch.pad.v > 0.01) [0, 2, 4].forEach(k => [-7, 7].forEach(dt => tone(deckBus, t, mtof(deg(sc, root + 12, chord + k)), { type: ch.pad.m < 0.5 ? 'triangle' : 'sawtooth', dur: spb * 15, vol: 0.045 * ch.pad.v, a: 0.25, d: 0.5, sus: 0.8, rel: 0.6, cut: 600 + ch.pad.m * 3800, detune: dt })));
    if (dropAt && t >= dropAt.rise && t < dropAt.cut && i % 4 === 0) snare(t); }
  // drop: two bars of riser (filter closes, noise sweeps up, snare rolls), one beat of silence, then everything slams back in
  let dropAt = null;
  function drop() { if (!deck.playing) return; const spb = 60 / S.deck.bpm / 4, nextBar = deck.t0 + Math.ceil((deck.next - deck.t0) / (16 * spb)) * 16 * spb, rise = nextBar, cut = rise + 32 * spb - 4 * spb, back = rise + 32 * spb;
    dropAt = { rise, cut, back }; const n = noise(master, rise, { dur: cut - rise, vol: 0.12, type: 'bandpass', freq: 400, q: 3, a: cut - rise, rel: 0.02 }); n.frequency.setValueAtTime(300, rise); n.frequency.exponentialRampToValueAtTime(9000, cut);
    dFilt.frequency.setTargetAtTime(500, rise, (cut - rise) / 3); dFilt.frequency.setTargetAtTime(180 * Math.pow(2, S.deck.fx.filter * 6.8), back, 0.01);
    setTimeout(() => { kick(back, 1.2); clap(back); noise(master, back, { dur: 0.6, vol: 0.18, type: 'lowpass', freq: 3000, rel: 0.6 }); strobeHit(true); }, Math.max(0, (back - ctx.currentTime) * 1000 - 30));
    setTimeout(() => { dropAt = null; }, (back - ctx.currentTime) * 1000 + 600); toast('drop in ' + Math.max(1, Math.round((back - ctx.currentTime))) + ' s'); }

  // ---------- schedulers (25 ms tick, 120 ms lookahead; idle when nothing plays) ----------
  const deck = { playing: false, step: 0, next: 0, t0: 0 }, bg = { step: 0, next: 0, note: 0, chord: 0, drone: null, wind: null };
  let timer = 0;
  function run() { if (timer) return; timer = setInterval(tick, 25); }
  function tick() { if (!ctx) return; const ahead = ctx.currentTime + 0.12;
    if (deck.playing) { const spb = 60 / S.deck.bpm / 4; while (deck.next < ahead) { deckStep(deck.step, deck.next); deck.step++; deck.next += spb; } }
    if (S.bg.on && !deck.playing) { const W = world(), spb = 60 / bgTempo(W) / 4; while (bg.next < ahead) { bgStep(bg.step, bg.next, W); bg.step++; bg.next += spb; } }
    if (!deck.playing && !S.bg.on) { clearInterval(timer); timer = 0; } }
  const has = (k, re) => re.test(k);
  function bgTempo(W) { return (W.keep ? 56 : 88) * (has(W.kind, /fog/) ? 0.72 : 1) * (isNight(W.day) ? 0.85 : 1); }
  function bgStep(step, t, W) { const i = step % 16, night = isNight(W.day), dens = (night ? 0.5 : 1) * (has(W.kind, /rain/) ? 0.8 : 1);
    bgFilt.frequency.setTargetAtTime(has(W.kind, /rain|fog/) ? 1300 : night ? 2600 : 6000, t, 1.5);
    if (has(W.kind, /storm/) && i % 4 === 0) tone(bgBus, t, 46, { type: 'sine', dur: 0.12, vol: 0.32 * (0.5 + W.k), d: 0.1, sus: 0, rel: 0.25, cut: 200 });
    windPad(has(W.kind, /wind/) ? 0.05 + W.k * 0.06 : 0);
    if (W.keep) {   // Gloamhold: a low drone on the root and fifth, slow bells, rare high chimes
      const root = 38;   // D, phrygian
      if (step % 64 === 0) { [root, root + 7, root - 12].forEach((m, k) => tone(bgBus, t, mtof(m), { type: k === 2 ? 'sine' : 'triangle', dur: 16 * 60 / bgTempo(W), vol: 0.06, a: 3, d: 2, sus: 0.9, rel: 4, cut: 500, detune: k * 4 })); }
      if (Math.random() < 0.05 * dens) bell(bgBus, t, mtof(deg(SCALES.phrygian, root + 24, Math.floor(Math.random() * 8))), 0.05);
      if (!night && Math.random() < 0.02 * dens) bell(bgBus, t, mtof(deg(SCALES.phrygian, root + 48, Math.floor(Math.random() * 6))), 0.02);
      return; }
    // Home: soft pentatonic plucks on a slow chord walk, a pad under it
    const sc = SCALES['pentatonic major'], root = 48 + 0 - (night ? 12 : 0);
    if (step % 32 === 0) { bg.chord = [0, 3, 1, 4][(step / 32) % 4 | 0];
      [0, 2, 4].forEach(k => tone(bgBus, t, mtof(deg(sc, root - 12, bg.chord + k)), { type: 'triangle', dur: 32 * 60 / bgTempo(W) / 4, vol: 0.035, a: 1.6, d: 1, sus: 0.85, rel: 2.5, cut: 1400 })); }
    if (Math.random() < (i % 2 ? 0.1 : 0.24) * dens) { bg.note = Math.max(-3, Math.min(9, bg.note + Math.round((Math.random() - 0.5) * 4)));
      tone(bgBus, t, mtof(deg(sc, root + 12, bg.chord + bg.note)), { type: 'triangle', dur: 0.05, vol: 0.09, a: 0.003, d: 0.25, sus: 0, rel: 0.5, cut: 2400 }); }
    if (i === 0 && Math.random() < 0.5 * dens) tone(bgBus, t, mtof(deg(sc, root - 12, bg.chord)), { type: 'sine', dur: 0.4, vol: 0.12, d: 0.3, sus: 0.3, rel: 0.4, cut: 600 }); }
  function windPad(v) { if (!ctx) return; if (v > 0 && !bg.wind) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 2; f.frequency.value = 700; l.frequency.value = 0.07; lg.gain.value = 450; l.connect(lg); lg.connect(f.frequency); s.connect(f); f.connect(g); g.connect(bgBus); g.gain.value = 0; s.start(); l.start(); bg.wind = { s, g, l }; }
    if (bg.wind) { bg.wind.g.gain.setTargetAtTime(v, ctx.currentTime, 2); if (v === 0) { const w = bg.wind; bg.wind = null; setTimeout(() => { try { w.s.stop(); w.l.stop(); } catch (e) {} }, 6000); } } }

  // ---------- on/off, handover ----------
  function setBg(on) { S.bg.on = on; save(); if (on) { ensure(); ctx.resume(); bg.next = Math.max(bg.next, ctx.currentTime + 0.05); fadeBg(); run(); } else if (ctx) { bgBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4); windPad(0); } render(); }
  function fadeBg() { if (!ctx) return; bgBus.gain.setTargetAtTime(S.bg.on && !deck.playing ? S.bg.vol : 0, ctx.currentTime, deck.playing ? 0.5 : 1.2); }
  function play(on) { ensure(); ctx.resume(); deck.playing = on;
    if (on) { deck.step = 0; deck.t0 = deck.next = ctx.currentTime + 0.08; deckBus.gain.setTargetAtTime(S.deck.vol, ctx.currentTime, 0.05); lightsOn(true); run(); }
    else { deckBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15); dropAt = null; lightsOn(false); bg.next = ctx.currentTime + 0.6; }
    fadeBg(); window.__music.playing = on; render(); }
  // the first click anywhere wakes the audio if the background music was left on (browsers only start sound on a gesture)
  addEventListener('pointerdown', function wake() { if (S.bg.on) { ensure(); ctx.resume(); setBg(true); } removeEventListener('pointerdown', wake, true); }, true);

  // ---------- event marks (only with the background music on; at most one per kind every 8 s) ----------
  const lastMark = {};
  addEventListener('idle:ev', e => { if (!S.bg.on || !ctx || ctx.state !== 'running') return; const { type, extra = {} } = e.detail || {}, now = performance.now();
    const k = type === 'rename' ? 'name' : type === 'disaster' && /volcano/.test(extra.k || '') ? 'volcano' : type === 'hangry' && !extra.end ? 'hangry' : type === 'reels_made' ? 'reel' : null;
    if (!k || now - (lastMark[k] || 0) < 8000) return; lastMark[k] = now; const t = ctx.currentTime + 0.02;
    if (k === 'name') { bell(master, t, mtof(84), 0.05); bell(master, t + 0.12, mtof(91), 0.035); }
    if (k === 'volcano') { noise(master, t, { dur: 2.2, vol: 0.2, type: 'lowpass', freq: 140, a: 0.4, rel: 1.5 }); tone(master, t, 38, { type: 'sine', dur: 1.6, vol: 0.25, a: 0.3, d: 1, sus: 0.6, rel: 1, cut: 200 }); }
    if (k === 'hangry') { tone(master, t, mtof(36), { type: 'sawtooth', dur: 0.09, vol: 0.18, d: 0.08, sus: 0.2, rel: 0.1, cut: 900, q: 6 }); tone(master, t + 0.13, mtof(31), { type: 'sawtooth', dur: 0.12, vol: 0.16, d: 0.1, sus: 0.2, rel: 0.12, cut: 700, q: 6 }); }
    if (k === 'reel') [72, 76, 79].forEach((m, j) => tone(master, t + j * 0.09, mtof(m), { type: 'triangle', dur: 0.08, vol: 0.06, d: 0.2, sus: 0, rel: 0.6, cut: 4000 })); });

  // ---------- lights: floor pulse, spotlights at Home, a 1-bit strobe in the keep (CSS layers, nothing per frame) ----------
  const L = document.createElement('div'); L.id = 'djlights'; L.innerHTML = '<i class="pulse"></i><i class="spot s1"></i><i class="spot s2"></i><i class="spot s3"></i><i class="strobe"></i>';
  ($('#arena') || document.body).appendChild(L);
  function lightsOn(on) { L.classList.toggle('on', on); syncLights(); }
  function syncLights() { const l = S.deck.lights, keep = world().keep; L.classList.toggle('keep', keep); L.classList.toggle('spots', !!l.spots && !keep && deck.playing && !(window.__quality && window.__quality.low)); L.classList.toggle('still', reduced()); }
  // rave mode listens to the beat: one event per quarter note, fired when it sounds (idle-rave.js)
  function beatEv(t, i, G) { const ms = Math.max(0, (t - ctx.currentTime) * 1000); setTimeout(() => { try { window.dispatchEvent(new CustomEvent('idle:beat', { detail: { bpm: S.deck.bpm, i, kick: !!G.kick[i], bass: !!G.bass[i] || !!G.bass[i + 1] } })); } catch (e) {} }, ms); }
  // what the music is like right now, 0..1 each: how loud, how much drums, bass and melody (rave mode matches it against each creature's taste)
  function features() { const D = S.deck, G = D.grid, n = k => G[k].reduce((a, b) => a + b, 0) / 16, ch = D.ch, f = D.fx;
    const drums = Math.min(1, (n('kick') * 1.2 + n('snare') + n('hat') * 0.6 + n('clap') * 0.7) / 1.6), bass = Math.min(1, n('bass') * 1.6 * ch.bass.v * (0.6 + 0.4 * ch.bass.m)), melody = Math.min(1, (ch.lead.v * 0.7 + ch.pad.v * 0.5) * (0.4 + 0.6 * f.filter));
    const loud = Math.min(1, D.vol * (0.45 + 0.25 * drums + 0.2 * bass + 0.1 * Math.max(ch.bass.m, ch.lead.m)) + f.crush * 0.25);
    return { playing: deck.playing, bpm: D.bpm, loud: +loud.toFixed(2), drums: +drums.toFixed(2), bass: +bass.toFixed(2), melody: +melody.toFixed(2), strobe: !!(D.lights.strobe && !reduced()), name: D.setName || D.preset, rave: !!S.rave, dropping: !!dropAt }; }
  function beat(t, v) { const l = S.deck.lights; if (!deck.playing) return; const ms = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => { if (l.pulse) { const p = L.firstChild; p.style.opacity = (reduced() ? 0.08 : 0.22) * v; setTimeout(() => { p.style.opacity = 0; }, 90); }
      if (l.strobe && v >= 1) strobeHit(false); }, ms); }
  let lastStrobe = 0;
  function strobeHit(big) { const l = S.deck.lights; if (!l.strobe || reduced()) return; const now = performance.now(); if (!big && now - lastStrobe < 240) return; lastStrobe = now;   // at most ~4 flashes a second
    const s = L.querySelector('.strobe'); s.style.opacity = world().keep ? 1 : 0.28; setTimeout(() => { s.style.opacity = 0; }, world().keep ? 70 : 50); }
  setInterval(() => { if (deck.playing) syncLights(); }, 2000);

  // ---------- the deck panel ----------
  const css = document.createElement('style'); css.textContent = `
#djlights{position:absolute;inset:0;pointer-events:none;z-index:6;display:none}#djlights.on{display:block}#djlights i{position:absolute;inset:0;opacity:0;transition:opacity .09s}
#djlights .pulse{background:radial-gradient(120% 80% at 50% 110%,hsla(300,90%,65%,.9),transparent 60%)}#djlights.keep .pulse{background:radial-gradient(120% 80% at 50% 110%,rgba(160,160,160,.9),transparent 60%)}
#djlights .spot{opacity:0;inset:auto;top:-12%;width:18%;height:135%;transform-origin:50% 0;will-change:transform;transition:opacity .6s;background:linear-gradient(to bottom,var(--c),transparent 85%);clip-path:polygon(46% 0,54% 0,100% 100%,0 100%)}#djlights.spots .spot{opacity:.42}
#djlights .s1{left:12%;--c:hsla(190,95%,60%,.45);animation:djsw 7s ease-in-out infinite alternate}#djlights .s2{left:70%;--c:hsla(320,95%,62%,.45);animation:djsw 9s ease-in-out infinite alternate-reverse}#djlights .s3{left:41%;--c:hsla(50,95%,62%,.35);animation:djsw 5s ease-in-out infinite alternate}
#djlights.still .spot{animation:none}#djlights .strobe{background:#fff;transition:none}#djlights.keep .strobe{mix-blend-mode:difference}
@keyframes djsw{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
#dj{position:fixed;right:16px;top:56px;width:330px;max-height:calc(100vh - 72px);overflow:auto;z-index:11;border:1px solid #8885;border-radius:12px;padding:8px 12px 12px;font:12px system-ui;background:color-mix(in srgb,var(--floor) 94%,transparent);box-shadow:0 6px 24px #0003;display:none}
#dj.on{display:block}#dj h4{margin:10px 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}#dj .hd{display:flex;justify-content:space-between;align-items:center;margin:-8px -12px 4px;padding:8px 12px 6px;position:sticky;top:-8px;z-index:2;background:var(--floor);border-bottom:1px solid #8883;cursor:grab;user-select:none;touch-action:none}#dj.drag .hd{cursor:grabbing}#dj .hd b{font-size:14px}
#dj button{font:inherit;font-size:12px;padding:2px 8px;border-radius:8px;border:1px solid #8886;background:none;color:inherit;cursor:pointer}#dj button.on{background:#2b5cff;color:#fff;border-color:#2b5cff}
#dj .row{display:flex;align-items:center;gap:6px;margin:3px 0}#dj .row label{width:58px;opacity:.8}#dj input[type=range]{flex:1;min-width:0}#dj select{font:inherit;font-size:12px;background:none;color:inherit;border:1px solid #8886;border-radius:6px}
#dj .grid{display:grid;grid-template-columns:40px repeat(16,1fr);gap:2px;margin-top:4px}#dj .grid span{opacity:.75;font-size:10px;align-self:center}#dj .grid b{height:14px;border-radius:3px;border:1px solid #8885;cursor:pointer}
#dj .grid b.x{background:#2b5cff;border-color:#2b5cff}#dj .grid b.q{margin-left:2px}#dj .grid b.now{outline:2px solid #f6b73c;outline-offset:-1px}#dj .drop{width:100%;margin-top:6px;padding:6px;font-weight:700;letter-spacing:.1em}
#dj .sub{opacity:.7;font-size:11px;margin:2px 0}#dj .sets div{display:flex;justify-content:space-between;align-items:center;margin:2px 0}#dj input[type=text]{font:inherit;font-size:12px;flex:1;background:none;color:inherit;border:1px solid #8886;border-radius:6px;padding:2px 6px}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'dj'; ($('#arena') || document.body).appendChild(el);
  // the deck stays where you drag it (by its header), remembered in this browser; kept inside the window
  const posKey = 'idle.djPos', fit = (x, y) => [Math.max(0, Math.min(innerWidth - 120, x)), Math.max(0, Math.min(innerHeight - 40, y))];
  const placeAt = (x, y) => { [x, y] = fit(x, y); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.maxHeight = Math.max(160, innerHeight - y - 12) + 'px'; };
  try { const p = JSON.parse(localStorage.getItem(posKey) || 'null'); if (p) placeAt(p.x, p.y); } catch (e) {}
  addEventListener('resize', () => { if (el.style.left) placeAt(parseFloat(el.style.left), parseFloat(el.style.top)); });
  el.addEventListener('pointerdown', e => { const hd = e.target.closest('.hd'); if (!hd || e.target.closest('button') || e.button) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; el.classList.add('drag'); hd.setPointerCapture(e.pointerId); e.preventDefault();
    const mv = ev => placeAt(ev.clientX - dx, ev.clientY - dy);
    const up = () => { el.classList.remove('drag'); hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); try { localStorage.setItem(posKey, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch (err) {} };
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up); });
  const btn = document.createElement('button'); btn.id = 'djBtn'; btn.title = 'music: background music that follows the world, and a DJ deck with lights'; btn.textContent = '🎧';
  const anchor = $('#reelsBtn'); if (anchor) anchor.after(btn, ' ');
  btn.addEventListener('click', () => { S.open = !S.open; save(); render(); });
  const pct = v => Math.round(v * 100);
  function render() { if (el.classList.contains('drag')) return; el.classList.toggle('on', !!S.open); btn.classList.toggle('on', deck.playing); if (!S.open) return; const D = S.deck, W = world();
    const mood = W.keep ? 'Gloamhold: low drones, slow bells' : 'Home: warm plucks and a pad';
    const wx = /storm/.test(W.kind) ? ', a low pulse for the storm' : /rain/.test(W.kind) ? ', softened by the rain' : /fog/.test(W.kind) ? ', slowed by the fog' : /wind/.test(W.kind) ? ', with the wind breathing' : '';
    el.innerHTML = `<div class="hd"><b>🎧 music</b><button data-x="close" title="close">✕</button></div>
<h4>background music</h4><div class="row"><button data-x="bg" class="${S.bg.on ? 'on' : ''}">${S.bg.on ? 'on' : 'off'}</button><label style="width:auto">volume</label><input type="range" min="0" max="1" step="0.01" value="${S.bg.vol}" data-r="bgvol"></div>
<div class="sub">${S.bg.on ? (deck.playing ? 'resting while the deck plays' : mood + wx + (isNight(W.day) ? ', quieter for the night' : '')) : 'off: turn it on for music that follows the place, the weather and the day'}</div>
<h4>deck</h4><div class="row"><button data-x="play" class="${deck.playing ? 'on' : ''}">${deck.playing ? '■ stop' : '▶ play'}</button><select data-s="preset">${Object.keys(PRESETS).map(p => `<option ${p === D.preset ? 'selected' : ''}>${p}</option>`).join('')}</select><button data-x="roll" title="a new lead melody">↻ melody</button></div>
<div class="row"><button data-x="rave" class="${S.rave ? 'on' : ''}" title="rave mode: the creatures near you hear the deck and react by their own taste (tempo, loudness, drums, bass, melody)">🕺 rave ${S.rave ? 'on' : 'off'}</button><span class="sub" style="margin:0">${S.rave ? (deck.playing ? 'they can hear you' : 'press play') : 'play for the creatures'}</span></div>
<div id="ravemeter"></div>
<div class="row"><label>tempo</label><input type="range" min="70" max="160" step="1" value="${D.bpm}" data-r="bpm"><span>${D.bpm}</span></div>
<div class="row"><label>key</label><select data-s="key">${NOTES.map((n, i) => `<option value="${i}" ${i === D.key ? 'selected' : ''}>${n}</option>`).join('')}</select><select data-s="scale">${Object.keys(SCALES).map(s => `<option ${s === D.scale ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
<div class="row"><label>volume</label><input type="range" min="0" max="1" step="0.01" value="${D.vol}" data-r="vol"></div>
<div class="grid">${ROWS.map(r => `<span>${r}</span>` + D.grid[r].map((v, i) => `<b class="${v ? 'x' : ''}${i % 4 === 0 && i ? ' q' : ''}" data-g="${r}:${i}"></b>`).join('')).join('')}</div>
<h4>mixer · soft ↔ gritty</h4>${['bass', 'lead', 'pad'].map(c => `<div class="row"><label>${c}</label><input type="range" min="0" max="1" step="0.01" value="${D.ch[c].v}" data-r="ch:${c}:v" title="${c} volume"><input type="range" min="0" max="1" step="0.01" value="${D.ch[c].m}" data-r="ch:${c}:m" title="${c} mood: soft ↔ gritty"></div>`).join('')}
<h4>effects</h4><div class="row"><label>filter</label><input type="range" min="0" max="1" step="0.01" value="${D.fx.filter}" data-r="fx:filter"></div><div class="row"><label>echo</label><input type="range" min="0" max="1" step="0.01" value="${D.fx.echo}" data-r="fx:echo"></div><div class="row"><label>bitcrush</label><input type="range" min="0" max="1" step="0.01" value="${D.fx.crush}" data-r="fx:crush"></div>
<button class="drop" data-x="drop" ${deck.playing ? '' : 'disabled'} title="two bars of build-up, a beat of silence, then everything back in">DROP</button>
<h4>lights</h4><div class="row"><button data-l="pulse" class="${D.lights.pulse ? 'on' : ''}">floor pulse</button><button data-l="spots" class="${D.lights.spots ? 'on' : ''}" title="sweeping spotlights at Home">spotlights</button><button data-l="strobe" class="${D.lights.strobe ? 'on' : ''}" title="⚠ flashing light on the beat (at most four flashes a second; in Gloamhold it flips black and white). Off if your system asks for reduced motion">⚠ strobe</button></div>
${reduced() ? '<div class="sub">reduced motion is on: no strobe, spotlights hold still</div>' : ''}
<h4>sets</h4><div class="row"><input type="text" placeholder="name this set" data-n="1"><button data-x="saveset">save</button></div><div class="sets">${S.sets.map((s, i) => `<div><span>${s.name.replace(/[<>&]/g, '')}</span><span><button data-load="${i}">load</button> <button data-del="${i}" title="remove this set">×</button></span></div>`).join('') || '<div class="sub">none yet</div>'}</div>`; }
  el.addEventListener('click', e => { const b = e.target.closest('button,[data-g]'); if (!b) return; const D = S.deck, x = b.dataset.x;
    if (x === 'close') { S.open = false; save(); render(); }
    else if (x === 'bg') setBg(!S.bg.on);
    else if (x === 'play') play(!deck.playing);
    else if (x === 'roll') { D.seed = (D.seed + 1) % 1000; rollLead(); save(); }
    else if (x === 'drop') drop();
    else if (x === 'rave') { S.rave = !S.rave; save(); render(); try { window.dispatchEvent(new CustomEvent('idle:rave', { detail: { on: S.rave } })); } catch (e) {} }
    else if (x === 'saveset') { const n = el.querySelector('[data-n]').value.trim() || ('set ' + (S.sets.length + 1)); S.sets.push({ name: n.slice(0, 40), t: Date.now(), deck: JSON.parse(JSON.stringify(D)) }); save(); render(); }
    else if (b.dataset.load) { const s = S.sets[+b.dataset.load]; if (s) { S.deck = Object.assign(DECK0(), JSON.parse(JSON.stringify(s.deck)), { setName: s.name }); rollLead(); applyFx(); if (deck.playing && ctx) deckBus.gain.setTargetAtTime(S.deck.vol, ctx.currentTime, 0.05); save(); render(); } }
    else if (b.dataset.del) { S.sets.splice(+b.dataset.del, 1); save(); render(); }
    else if (b.dataset.l) { D.lights[b.dataset.l] = !D.lights[b.dataset.l]; save(); syncLights(); render(); }
    else if (b.dataset.g) { const [r, i] = b.dataset.g.split(':'); D.grid[r][i] = D.grid[r][i] ? 0 : 1; b.classList.toggle('x'); save(); } });
  el.addEventListener('input', e => { const r = e.target.dataset.r; if (!r) return; const v = +e.target.value, D = S.deck;
    if (r === 'bgvol') { S.bg.vol = v; fadeBg(); }
    else if (r === 'bpm') { D.bpm = v; e.target.nextElementSibling.textContent = v; applyFx(); }
    else if (r === 'vol') { D.vol = v; if (ctx && deck.playing) deckBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
    else { const [a, b, c] = r.split(':'); if (a === 'ch') D.ch[b][c] = v; if (a === 'fx') { D.fx[b] = v; applyFx(); } }
    save(); });
  el.addEventListener('change', e => { const s = e.target.dataset.s; if (!s) return; const D = S.deck, v = e.target.value;
    if (s === 'preset') { D.preset = v; D.setName = null; D.grid = presetGrid(v); D.bpm = PRESETS[v].bpm; applyFx(); render(); }
    if (s === 'key') D.key = +v; if (s === 'scale') D.scale = v; save(); });
  el.addEventListener('keydown', e => e.stopPropagation());   // typing a set name never reaches the game's shortcuts
  // the step now playing lights up on the grid (only while the panel is open; 8 times a second, not per frame)
  setInterval(() => { if (!S.open || !deck.playing || !ctx) return; const spb = 60 / S.deck.bpm / 4, i = Math.floor((ctx.currentTime - deck.t0) / spb) % 16;
    el.querySelectorAll('.grid b.now').forEach(b => b.classList.remove('now')); el.querySelectorAll(`.grid b[data-g$=":${i}"]`).forEach(b => b.classList.add('now')); }, 125);
  function toast(t) { try { window.__musicToast ? window.__musicToast(t) : null; } catch (e) {} }

  window.__music = { playing: false, state: () => ({ bg: { ...S.bg }, deck: JSON.parse(JSON.stringify(S.deck)), sets: JSON.parse(JSON.stringify(S.sets)) }),
    merge(st) { if (!st) return; for (const s of st.sets || []) if (!S.sets.some(x => x.name === s.name && x.t === s.t)) S.sets.push(s); if (st.deck) S.deck = Object.assign(DECK0(), st.deck); save(); render(); },
    setBg, play, drop, features, rave: () => !!S.rave, setRave: on => { S.rave = !!on; save(); render(); }, PRESETS: Object.keys(PRESETS), SCALES: Object.keys(SCALES), _ctx: () => ctx, _deck: deck, _bg: bg };
  render();
})();
