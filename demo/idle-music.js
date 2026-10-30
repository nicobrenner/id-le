// idle-music.js: background music and the DJ deck, all made live with WebAudio (no audio files).
// Background music is off until you turn it on. It follows the world: a mood per place (Home warm and plucky,
// Gloamhold low drones and bells), the weather (rain softens it, storms add a low pulse, fog slows it, wind breathes)
// and the day (night is sparser and lower), and it marks a few events (a name given, a volcano, a hangry creature, a new reel).
// The deck (🎧) is a small groove box: tempo, key and scale, a 16-step grid (kick, snare, hat, clap, bass), a mixer
// (bass, lead, pad, each soft↔gritty), filter, echo, bitcrush and a drop, plus lights on the beat. While the deck plays
// it takes over from the background music; stopping it brings the background back. Sets are saved here and in snapshots.
// The background music can be tweaked too (issue #25): a style (follow the world, Home, Gloamhold, calm, dreamy, chiptune, gloomy,
// lo-fi), a new variation, speed, key and scale, busyness, brightness, a level for each voice (pluck, pad, bells, drone, beat), and
// whether it follows the weather and the day. A tweak can be saved as a track: it joins the sets, plays as the background or on the
// deck (where rave mode hears it), and goes in the set list, which plays sets and tracks in order with a crossfade.
(() => {
  const KEY = 'idle.music', $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], 'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
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
    lights: { pulse: true, spots: true, strobe: false }, track: null, layer: false });
  const BG0 = () => ({ on: false, vol: 0.5, style: 'world', seed: 1, speed: 1, key: -1, scale: 'auto', dens: 0.5, bright: 0.75, voices: { pluck: 1, pad: 1, bells: 1, drone: 1, beat: 1 }, react: true });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const S = Object.assign({ bg: BG0(), deck: DECK0(), sets: [], open: false, rave: false, queue: [], qo: { each: 2, xf: 6 }, ui: {} }, load() || {});
  S.deck = Object.assign(DECK0(), S.deck); S.deck.lights = Object.assign(DECK0().lights, S.deck.lights);
  S.bg = Object.assign(BG0(), S.bg); S.bg.voices = Object.assign(BG0().voices, S.bg.voices); S.qo = Object.assign({ each: 2, xf: 6 }, S.qo); S.queue = S.queue || []; S.ui = S.ui || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ bg: S.bg, deck: S.deck, sets: S.sets, open: S.open, rave: S.rave, queue: S.queue, qo: S.qo, ui: S.ui })); } catch (e) {} };
  const copy = o => JSON.parse(JSON.stringify(o));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = () => { const w = (window.__weather && window.__weather.get && window.__weather.get()) || {}, pk = window.__places ? window.__places.kind() : 'home';
    return { kind: String(w.kind || 'clear'), k: w.k ?? 0.35, keep: pk === 'keep', day: window.__day ? window.__day.phase() : 0.25 }; };
  const isNight = d => d > 0.55 && d < 0.95;

  // ---------- audio graph ----------
  let ctx = null, master, bgBus, bgFilt, deckBus, laneA, laneB, curLane, OUT, dFilt, crush, crushWet, crushDry, echo, echoFb, echoWet, comp, noiseBuf = null;
  function ensure() { if (ctx) return ctx; ctx = new (window.AudioContext || window.webkitAudioContext)();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    bgFilt = ctx.createBiquadFilter(); bgFilt.type = 'lowpass'; bgFilt.frequency.value = 6000; bgFilt.connect(master);
    bgBus = ctx.createGain(); bgBus.gain.value = 0; bgBus.connect(bgFilt);
    deckBus = ctx.createGain(); deckBus.gain.value = 0;
    laneA = ctx.createGain(); laneB = ctx.createGain(); laneB.gain.value = 0; laneA.connect(deckBus); laneB.connect(deckBus); curLane = OUT = laneA;   // two lanes: the set list crossfades between them
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
    o.connect(f); f.connect(g); g.connect(bus); env(g, t, a, vol, d, sus, rel, dur); o.start(t); o.stop(t + dur + rel * 1.5 + 0.05); return { o, g, end: t + dur + rel * 1.5 + 0.05 }; }
  function noise(bus, t, { dur = 0.1, vol = 0.2, type = 'highpass', freq = 6000, q = 0.8, a = 0.001, rel = 0.05 } = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(g); g.connect(bus); env(g, t, a, vol, dur, 0, rel, dur); s.start(t, Math.random() * 1.5); s.stop(t + dur + rel * 2 + 0.05); return f; }
  function bell(bus, t, freq, vol) { [[1, 1], [2.76, 0.4], [5.4, 0.18]].forEach(([r, v]) => tone(bus, t, freq * r, { type: 'sine', dur: 0.05, vol: vol * v, a: 0.002, d: 0.6, sus: 0.0, rel: 2.4 / r, cut: 9000 })); }

  // ---------- drums and deck voices ----------
  function kick(t, v = 1, bus = OUT) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38); o.start(t); o.stop(t + 0.42); }
  function snare(t) { noise(OUT, t, { dur: 0.12, vol: 0.35, type: 'bandpass', freq: 1800, q: 0.6, rel: 0.12 }); tone(OUT, t, 190, { type: 'triangle', dur: 0.06, vol: 0.25, d: 0.05, sus: 0, rel: 0.08 }); }
  function hat(t, open) { noise(OUT, t, { dur: open ? 0.18 : 0.03, vol: 0.14, type: 'highpass', freq: 7500, rel: open ? 0.15 : 0.03 }); }
  function clap(t) { for (let i = 0; i < 3; i++) noise(OUT, t + i * 0.012, { dur: 0.02, vol: 0.22, type: 'bandpass', freq: 1300, q: 1.2, rel: 0.04 }); noise(OUT, t + 0.036, { dur: 0.1, vol: 0.18, type: 'bandpass', freq: 1300, q: 1.2, rel: 0.12 }); }
  const oscFor = m => m < 0.34 ? 'sine' : m < 0.67 ? 'triangle' : 'sawtooth', leadOsc = m => m < 0.34 ? 'triangle' : m < 0.67 ? 'square' : 'sawtooth';
  const deg = (sc, root, i) => { const n = sc.length, o = Math.floor(i / n); return root + sc[((i % n) + n) % n] + 12 * o; };
  const PROG = [0, 5, 2, 6];   // i – VI – III – VII in scale degrees, one chord per bar
  let leadPat = null;
  function rollLead() { let s = S.deck.seed * 9301 + 49297; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; leadPat = Array.from({ length: 4 }, () => Array.from({ length: 16 }, (_, i) => (i % 2 === 0 && r() < 0.55) || r() < 0.12 ? Math.floor(r() * 5) : -1)); }
  function deckStep(step, t, D = S.deck, quiet = false, st = deck.tst) { if (D.track) return trackDeckStep(step, t, D, quiet, st); const G = D.grid, i = step % 16, bar = Math.floor(step / 16) % 4, sc = SCALES[D.scale] || SCALES.minor, chord = PROG[bar], spb = 60 / D.bpm / 4;
    if (dropAt && t >= dropAt.cut && t < dropAt.back) return;   // the silence before the drop
    if (G.kick[i]) { kick(t); if (!quiet) beat(t, 1); } else if (i % 4 === 0 && !quiet) beat(t, 0.4);
    if (i % 4 === 0 && !quiet) beatEv(t, i, G);
    if (G.snare[i]) snare(t); if (G.hat[i]) hat(t, i % 8 === 6); if (G.clap[i]) clap(t);
    const ch = D.ch, root = 36 + D.key;
    if (G.bass[i] && ch.bass.v > 0.01) tone(OUT, t, mtof(deg(sc, root, chord) + (i % 8 === 4 ? 12 : 0)), { type: oscFor(ch.bass.m), dur: spb * 1.6, vol: 0.32 * ch.bass.v, d: 0.12, sus: 0.6, rel: 0.08, cut: 280 + ch.bass.m * 2600, q: 2 + ch.bass.m * 6 });
    if (!leadPat) rollLead(); const ln = leadPat[bar][i];
    if (ln >= 0 && ch.lead.v > 0.01) tone(OUT, t, mtof(deg(sc, root + 24, chord + [0, 2, 4, 7, 9][ln])), { type: leadOsc(ch.lead.m), dur: spb * 0.9, vol: 0.11 * ch.lead.v, d: 0.08, sus: 0.3, rel: 0.12, cut: 900 + ch.lead.m * 5000 });
    if (i === 0 && ch.pad.v > 0.01) [0, 2, 4].forEach(k => [-7, 7].forEach(dt => tone(OUT, t, mtof(deg(sc, root + 12, chord + k)), { type: ch.pad.m < 0.5 ? 'triangle' : 'sawtooth', dur: spb * 15, vol: 0.045 * ch.pad.v, a: 0.25, d: 0.5, sus: 0.8, rel: 0.6, cut: 600 + ch.pad.m * 3800, detune: dt })));
    if (dropAt && t >= dropAt.rise && t < dropAt.cut && i % 4 === 0) snare(t); }
  // drop: two bars of riser (filter closes, noise sweeps up, snare rolls), one beat of silence, then everything slams back in
  let dropAt = null;
  function drop() { if (!deck.playing) return; const spb = 60 / S.deck.bpm / 4, nextBar = deck.t0 + Math.ceil((deck.next - deck.t0) / (16 * spb)) * 16 * spb, rise = nextBar, cut = rise + 32 * spb - 4 * spb, back = rise + 32 * spb;
    dropAt = { rise, cut, back }; const n = noise(master, rise, { dur: cut - rise, vol: 0.12, type: 'bandpass', freq: 400, q: 3, a: cut - rise, rel: 0.02 }); n.frequency.setValueAtTime(300, rise); n.frequency.exponentialRampToValueAtTime(9000, cut);
    dFilt.frequency.setTargetAtTime(500, rise, (cut - rise) / 3); dFilt.frequency.setTargetAtTime(180 * Math.pow(2, S.deck.fx.filter * 6.8), back, 0.01);
    setTimeout(() => { kick(back, 1.2); clap(back); noise(master, back, { dur: 0.6, vol: 0.18, type: 'lowpass', freq: 3000, rel: 0.6 }); strobeHit(true); }, Math.max(0, (back - ctx.currentTime) * 1000 - 30));
    setTimeout(() => { dropAt = null; }, (back - ctx.currentTime) * 1000 + 600); toast('drop in ' + Math.max(1, Math.round((back - ctx.currentTime))) + ' s'); }

  // ---------- schedulers (25 ms tick, 120 ms lookahead; idle when nothing plays) ----------
  const newTst = () => ({ chord: 0, note: 0, arp: 0, held: [], patKey: null });
  const deck = { playing: false, step: 0, next: 0, t0: 0, tst: newTst(), out: null, q: null }, bg = { step: 0, next: 0, note: 0, chord: 0, arp: 0, held: [], drone: null, wind: null, lastKey: null };
  let timer = 0;
  function run() { if (timer) return; timer = setInterval(tick, 25); }
  function tick() { if (!ctx) return; const ahead = ctx.currentTime + 0.12;
    if (deck.playing) { OUT = curLane; const spb = 60 / S.deck.bpm / 4; while (deck.next < ahead) { deckStep(deck.step, deck.next); deck.step++; deck.next += spb; }
      const o = deck.out; if (o) { if (ctx.currentTime > o.until) { release(o.tst, 0.5); deck.out = null; }   // the outgoing set of a crossfade keeps playing on its own lane while it fades
        else { OUT = o.lane; const lp = leadPat; leadPat = o.lead; const spo = 60 / o.D.bpm / 4; while (o.next < ahead) { deckStep(o.step, o.next, o.D, true, o.tst); o.step++; o.next += spo; } leadPat = lp; OUT = curLane; } } }
    if (S.bg.on && !deck.playing) { const W = world(), spb = 60 / bgTempo(W) / 4; while (bg.next < ahead) { bgStep(bg.step, bg.next, W); bg.step++; bg.next += spb; } }
    if (!deck.playing && !S.bg.on) { clearInterval(timer); timer = 0; } }
  const has = (k, re) => re.test(k);

  // ---------- the background generator: a style (profile) played with your tweaks; the same generator plays saved tracks on the deck ----------
  // lv: each voice's level in the style (the voice sliders scale it: 0–1 down to silence, past the middle they add the voice even where the
  // style has none); feat: what rave mode hears (drums, bass, melody)
  const PROF = {
    home: { name: 'Home', bpm: 88, root: 48, scale: 'pentatonic major', lv: { pluck: 1, pad: 1, bells: 0, drone: 0, beat: 0 }, bass: 1, prog: [0, 3, 1, 4], pluck: { type: 'triangle', p: [0.24, 0.1], cut: 2400, rel: 0.5, oct: 12 }, pad: { type: 'triangle', cut: 1400, det: 0 }, feat: { drums: 0.05, bass: 0.35, melody: 0.6 } },
    gloam: { name: 'Gloamhold', bpm: 56, root: 38, scale: 'phrygian', lv: { pluck: 0, pad: 0, bells: 1, drone: 1, beat: 0 }, bass: 0, prog: [0, 0, 0, 0], chimes: true, pluck: { type: 'sine', p: [0.1, 0.04], cut: 1600, rel: 1.2, oct: 12 }, pad: { type: 'triangle', cut: 900, det: 0 }, feat: { drums: 0, bass: 0.3, melody: 0.45 } },
    calm: { name: 'calm', bpm: 70, root: 50, scale: 'major', lv: { pluck: 0.6, pad: 1, bells: 0.4, drone: 0, beat: 0 }, bass: 0.6, prog: [0, 4, 5, 3], pluck: { type: 'sine', p: [0.16, 0.05], cut: 2000, rel: 0.9, oct: 12 }, pad: { type: 'triangle', cut: 1200, det: 4 }, feat: { drums: 0, bass: 0.25, melody: 0.6 } },
    dreamy: { name: 'dreamy', bpm: 62, root: 53, scale: 'lydian', lv: { pluck: 0.7, pad: 1.2, bells: 0.8, drone: 0.3, beat: 0 }, bass: 0.4, prog: [0, 1, 4, 2], pluck: { type: 'sine', p: [0.14, 0.07], cut: 3000, rel: 1.8, oct: 19 }, pad: { type: 'sawtooth', cut: 900, det: 12 }, feat: { drums: 0, bass: 0.2, melody: 0.8 } },
    chiptune: { name: 'chiptune', bpm: 132, root: 48, scale: 'major', lv: { pluck: 1, pad: 0, bells: 0, drone: 0, beat: 0.8 }, bass: 1, arp: true, prog: [0, 5, 3, 4], pluck: { type: 'square', p: [0.7, 0.5], cut: 5000, rel: 0.08, oct: 12 }, pad: { type: 'square', cut: 1500, det: 0 }, drums: 'chip', feat: { drums: 0.6, bass: 0.55, melody: 0.75 } },
    gloomy: { name: 'gloomy', bpm: 58, root: 40, scale: 'minor', lv: { pluck: 0.5, pad: 0.7, bells: 0.6, drone: 1, beat: 0 }, bass: 0.5, prog: [0, 5, 3, 4], pluck: { type: 'triangle', p: [0.12, 0.04], cut: 900, rel: 0.8, oct: 0 }, pad: { type: 'sawtooth', cut: 500, det: 6 }, feat: { drums: 0, bass: 0.4, melody: 0.4 } },
    lofi: { name: 'lo-fi', bpm: 80, root: 45, scale: 'dorian', lv: { pluck: 0.8, pad: 1, bells: 0, drone: 0, beat: 0.7 }, bass: 1, prog: [1, 4, 0, 3], pluck: { type: 'triangle', p: [0.2, 0.08], cut: 1300, rel: 0.4, oct: 12 }, pad: { type: 'triangle', cut: 800, det: 8 }, drums: 'lofi', crackle: true, feat: { drums: 0.5, bass: 0.5, melody: 0.55 } } };
  const STYLES = { world: 'follows the world', home: 'Home', gloam: 'Gloamhold', calm: 'calm', dreamy: 'dreamy', chiptune: 'chiptune', gloomy: 'gloomy', lofi: 'lo-fi' };
  const PROGS = [[0, 3, 1, 4], [0, 5, 3, 4], [0, 4, 5, 3], [0, 1, 4, 2], [1, 4, 0, 3], [0, 2, 5, 4], [5, 3, 0, 4], [0, 3, 4, 4]];
  const VOICES = ['pluck', 'pad', 'bells', 'drone', 'beat'];
  // a track: the background settings with the style made concrete (follow-the-world becomes Home or Gloamhold)
  const trackOf = (B, W) => ({ style: B.style === 'world' ? (W.keep ? 'gloam' : 'home') : B.style, seed: B.seed, speed: B.speed, key: B.key, scale: B.scale, dens: B.dens, bright: B.bright, voices: { ...B.voices } });
  const lvl = (P, T, v) => { const b = P.lv[v] || 0, s = (T.voices || {})[v] ?? 1; return s <= 1 ? b * s : b + (s - 1) * 0.6; };
  const brightCut = b => 300 * Math.pow(2, b * 5.75);   // 0.75 ≈ 6 kHz, the old default
  const trackTempo = (T, W) => (PROF[T.style] || PROF.home).bpm * (T.speed || 1) * (W && has(W.kind, /fog/) ? 0.72 : 1) * (W && isNight(W.day) ? 0.85 : 1);
  function bgTempo(W) { return trackTempo(trackOf(S.bg, W), S.bg.react ? W : null); }
  function patOf(T, P, st) { const k = T.style + ':' + T.seed; if (st.patKey === k) return st.pat; st.patKey = k;   // variation 1 is the style as written; others reshuffle it
    if ((T.seed || 1) === 1) return st.pat = { prog: P.prog, p: Array.from({ length: 16 }, (_, i) => P.pluck.p[i % 2]), bo: 0, shape: 0 };
    let s = (T.seed * 7919) % 233280; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    return st.pat = { prog: P.prog.every(c => c === 0) && r() < 0.6 ? P.prog : PROGS[Math.floor(r() * PROGS.length)], p: Array.from({ length: 16 }, (_, i) => P.pluck.p[i % 2] * (0.3 + 1.4 * r())), bo: r() < 0.3 ? 12 : 0, shape: Math.floor(r() * 3) }; }
  const hold = (st, n) => { const now = ctx.currentTime; st.held = st.held.filter(h => h.end > now); st.held.push(n); };
  function release(st, tc = 0.25) { if (!ctx || !st) return; const now = ctx.currentTime;   // let long notes (pads, drones) go quickly when the music changes
    for (const h of st.held || []) { try { if (h.g.gain.cancelAndHoldAtTime) h.g.gain.cancelAndHoldAtTime(now); else h.g.gain.cancelScheduledValues(now); h.g.gain.setTargetAtTime(0.0001, now, tc); h.o.stop(now + tc * 6); } catch (e) {} }
    if (st) st.held = []; }
  function kickTo(bus, t, v, f0 = 120, f1 = 45, len = 0.3) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.1); o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + len); o.start(t); o.stop(t + len + 0.04); }
  const kickAt = (P, i) => P.drums === 'chip' ? i % 8 === 0 : P.drums === 'lofi' ? i === 0 || i === 10 : i === 0;
  function beatVoice(P, i, t, bus, v, spb) {
    if (P.drums === 'chip') { if (i % 8 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.07); o.connect(g); g.connect(bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.start(t); o.stop(t + 0.14); }
      if (i === 4 || i === 12) noise(bus, t, { dur: 0.05, vol: 0.16 * v, type: 'bandpass', freq: 2500, q: 0.9, rel: 0.05 }); if (i % 2 === 0) noise(bus, t, { dur: 0.015, vol: 0.05 * v, type: 'highpass', freq: 9000, rel: 0.02 }); return; }
    if (P.drums === 'lofi') { if (i === 0 || i === 10) kickTo(bus, t, 0.5 * v, 110, 42, 0.35); if (i === 4 || i === 12) noise(bus, t, { dur: 0.09, vol: 0.12 * v, type: 'bandpass', freq: 1500, q: 0.7, rel: 0.12 });
      if (i % 2 === 0) noise(bus, t + (i % 4 === 2 ? spb * 0.33 : 0), { dur: 0.02, vol: 0.045 * v, type: 'highpass', freq: 6500, rel: 0.03 });   // swung hats
      if (P.crackle && Math.random() < 0.25) noise(bus, t + Math.random() * spb, { dur: 0.004, vol: 0.03 * v, type: 'highpass', freq: 3000, rel: 0.004 }); return; }
    if (i === 0) kickTo(bus, t, 0.35 * v, 90, 40, 0.4); if (i % 4 === 2) noise(bus, t, { dur: 0.02, vol: 0.03 * v, type: 'highpass', freq: 7000, rel: 0.03 }); }   // a soft heartbeat for the quiet styles
  // one 16th of a track. W is the world when it should react (weather, day), null on the deck or with reactions off
  function trackStep(T, step, t, bus, W, st, spb) { const P = PROF[T.style] || PROF.home, i = step % 16, pt = patOf(T, P, st), sc = SCALES[T.scale === 'auto' ? P.scale : T.scale] || SCALES.minor;
    const night = !!(W && isNight(W.day)), L = v => lvl(P, T, v), dens = 2 * (T.dens ?? 0.5) * (night ? 0.5 : 1) * (W && has(W.kind, /rain/) ? 0.8 : 1);
    const root = (T.key < 0 ? P.root : P.root + ((((T.key - P.root % 12) % 12) + 18) % 12 - 6)) - (night && T.style === 'home' ? 12 : 0);
    if (step % 64 === 0 && L('drone') > 0.01) { const dr = root >= 45 ? root - 12 : root; [dr, dr + 7, dr - 12].forEach((m, k) => hold(st, tone(bus, t, mtof(m), { type: k === 2 ? 'sine' : 'triangle', dur: 64 * spb, vol: 0.06 * L('drone'), a: 3, d: 2, sus: 0.9, rel: 4, cut: 500, detune: k * 4 }))); }
    if (step % 32 === 0) { st.chord = pt.prog[(step / 32) % 4 | 0];
      if (L('pad') > 0.01) [0, 2, 4].forEach(k => hold(st, tone(bus, t, mtof(deg(sc, root - 12, st.chord + k)), { type: P.pad.type, dur: 32 * spb, vol: 0.035 * L('pad') * (P.pad.type === 'triangle' ? 1 : 0.55), a: 1.6, d: 1, sus: 0.85, rel: 2.5, cut: P.pad.cut, detune: P.pad.det * (k - 1) }))); }
    const pl = L('pluck');
    if (pl > 0.01 && Math.random() < Math.min(0.95, pt.p[i] * dens)) {
      if (P.arp) { st.arp = (st.arp + 1) % 6; const n = [[0, 2, 4, 7, 4, 2], [0, 4, 2, 7, 2, 4], [0, 2, 4, 2, 7, 4]][pt.shape][st.arp]; tone(bus, t, mtof(deg(sc, root + P.pluck.oct + pt.bo, st.chord + n)), { type: P.pluck.type, dur: spb * 0.7, vol: 0.045 * pl, a: 0.002, d: 0.08, sus: 0.2, rel: P.pluck.rel, cut: P.pluck.cut }); }
      else { st.note = Math.max(-3, Math.min(9, st.note + Math.round((Math.random() - 0.5) * 4))); tone(bus, t, mtof(deg(sc, root + P.pluck.oct + pt.bo, st.chord + st.note)), { type: P.pluck.type, dur: 0.05, vol: 0.09 * pl * (P.pluck.type === 'square' ? 0.5 : 1), a: 0.003, d: 0.25, sus: 0, rel: P.pluck.rel, cut: P.pluck.cut }); } }
    if (P.bass > 0) { if (P.drums) { if (i === 0 || i === 8 || (P.drums === 'lofi' && i === 10)) tone(bus, t, mtof(deg(sc, root - 12, st.chord)), { type: P.drums === 'chip' ? 'square' : 'sine', dur: spb * 1.5, vol: 0.12 * P.bass * (P.drums === 'chip' ? 0.5 : 1), d: 0.2, sus: 0.4, rel: 0.1, cut: P.drums === 'chip' ? 900 : 600 }); }
      else if (i === 0 && Math.random() < 0.5 * dens) tone(bus, t, mtof(deg(sc, root - 12, st.chord)), { type: 'sine', dur: 0.4, vol: 0.12 * P.bass, d: 0.3, sus: 0.3, rel: 0.4, cut: 600 }); }
    const be = L('bells'); if (be > 0.01) { if (Math.random() < 0.05 * dens) bell(bus, t, mtof(deg(sc, root + 24 + pt.bo, Math.floor(Math.random() * 8))), 0.05 * be);
      if (P.chimes && !night && Math.random() < 0.02 * dens) bell(bus, t, mtof(deg(sc, root + 48, Math.floor(Math.random() * 6))), 0.02 * be); }
    const bt = L('beat'); if (bt > 0.01) beatVoice(P, i, t, bus, bt, spb); }
  function bgStep(step, t, W) { const i = step % 16, R = S.bg.react, T = trackOf(S.bg, W), k = T.style + '|' + T.key + '|' + T.scale + '|' + T.seed;
    if (bg.lastKey !== k) { if (bg.lastKey) release(bg, 0.6); bg.lastKey = k; }   // a new style or place: the old pads and drones let go
    const bc = brightCut(S.bg.bright); bgFilt.frequency.setTargetAtTime(R && has(W.kind, /rain|fog/) ? bc * 0.22 : R && isNight(W.day) ? bc * 0.43 : bc, t, 1.5);
    if (R && has(W.kind, /storm/) && i % 4 === 0) tone(bgBus, t, 46, { type: 'sine', dur: 0.12, vol: 0.32 * (0.5 + W.k), d: 0.1, sus: 0, rel: 0.25, cut: 200 });
    windPad(R && has(W.kind, /wind/) ? 0.05 + W.k * 0.06 : 0);
    trackStep(T, step, t, bgBus, R ? W : null, bg, 60 / bgTempo(W) / 4); }
  // a track on the deck: the generator into the deck's lane (so the filter, echo, crush, drop and lights apply), grid drums on top if asked
  const tgCache = new WeakMap();
  function trackGrid(T) { let g = tgCache.get(T); if (g) return g; const P = PROF[T.style] || PROF.home, b = lvl(P, T, 'beat') > 0.01;
    g = { kick: Array.from({ length: 16 }, (_, i) => b && kickAt(P, i) ? 1 : 0), bass: Array.from({ length: 16 }, (_, i) => P.bass > 0 && (i === 0 || (P.drums && i === 8)) ? 1 : 0), snare: Array(16).fill(0), hat: Array(16).fill(0), clap: Array(16).fill(0) }; tgCache.set(T, g); return g; }
  function trackDeckStep(step, t, D, quiet, st) { const i = step % 16, spb = 60 / D.bpm / 4, T = D.track; if (dropAt && t >= dropAt.cut && t < dropAt.back) return;
    const P = PROF[T.style] || PROF.home, T2 = { ...T, speed: D.bpm / P.bpm }; trackStep(T2, step, t, OUT, null, st, spb);
    const G = D.layer ? D.grid : trackGrid(T);
    if (D.layer) { if (G.kick[i]) kick(t); if (G.snare[i]) snare(t); if (G.hat[i]) hat(t, i % 8 === 6); if (G.clap[i]) clap(t); }
    if (!quiet) { const kk = G.kick[i] || (!D.layer && trackGrid(T).kick[i]); if (kk) beat(t, 1); else if (i % 4 === 0) beat(t, 0.4); if (i % 4 === 0) beatEv(t, i, D.layer ? { ...G, kick: G.kick.map((v, j) => v || trackGrid(T).kick[j]) } : G); }
    if (dropAt && t >= dropAt.rise && t < dropAt.cut && i % 4 === 0) snare(t); }
  function windPad(v) { if (!ctx) return; if (v > 0 && !bg.wind) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 2; f.frequency.value = 700; l.frequency.value = 0.07; lg.gain.value = 450; l.connect(lg); lg.connect(f.frequency); s.connect(f); f.connect(g); g.connect(bgBus); g.gain.value = 0; s.start(); l.start(); bg.wind = { s, g, l }; }
    if (bg.wind) { bg.wind.g.gain.setTargetAtTime(v, ctx.currentTime, 2); if (v === 0) { const w = bg.wind; bg.wind = null; setTimeout(() => { try { w.s.stop(); w.l.stop(); } catch (e) {} }, 6000); } } }

  // ---------- on/off, handover ----------
  function setBg(on) { S.bg.on = on; save(); if (on) { ensure(); ctx.resume(); bg.next = Math.max(bg.next, ctx.currentTime + 0.05); fadeBg(); run(); } else if (ctx) { bgBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4); windPad(0); release(bg, 0.4); } render(); }
  // ducking: while something else speaks (a reel playing, later others) the music steps back to about a fifth, keyed by who asked;
  // a live rave set is never ducked (the creatures are dancing to it)
  const ducks = new Set(), duckF = () => ducks.size ? 0.2 : 1, bgVol = () => S.bg.vol * duckF(), deckVol = () => S.deck.vol * (S.rave ? 1 : duckF());
  addEventListener('idle:duck', e => { const d = e.detail || {}; if (!d.who) return; if (d.on) ducks.add(d.who); else ducks.delete(d.who); reDuck(); });
  function reDuck() { if (!ctx) return; const now = ctx.currentTime, tc = ducks.size ? 0.35 : 0.8; if (S.bg.on && !deck.playing) { bgBus.gain.cancelScheduledValues(now); bgBus.gain.setTargetAtTime(bgVol(), now, tc); }
    if (deck.playing) { deckBus.gain.cancelScheduledValues(now); deckBus.gain.setTargetAtTime(deckVol(), now, tc); } }
  function fadeBg() { if (!ctx) return; bgBus.gain.setTargetAtTime(S.bg.on && !deck.playing ? bgVol() : 0, ctx.currentTime, deck.playing ? 0.5 : 1.2); }
  // a change of style, key, scale or variation: a short dip, the long notes let go, and the new music starts on its first chord
  function bgRestart() { save(); if (!ctx || !S.bg.on || deck.playing) return; const now = ctx.currentTime; release(bg, 0.3); bg.lastKey = null;
    bgBus.gain.cancelScheduledValues(now); bgBus.gain.setTargetAtTime(bgVol() * 0.3, now, 0.12); bgBus.gain.setTargetAtTime(bgVol(), now + 0.5, 0.6); bg.step = 0; bg.next = Math.max(bg.next, now + 0.35); }
  function play(on) { ensure(); ctx.resume(); deck.playing = on; const now = ctx.currentTime;
    if (on) { deck.step = 0; deck.t0 = deck.next = now + 0.08; release(deck.tst); deck.tst = newTst(); deck.out = null; [laneA, laneB].forEach(l => { l.gain.cancelScheduledValues(now); l.gain.setValueAtTime(l === laneA ? 1 : 0, now); }); curLane = OUT = laneA;
      deckBus.gain.setTargetAtTime(deckVol(), now, 0.05); lightsOn(true); run(); }
    else { deckBus.gain.setTargetAtTime(0, now, 0.15); dropAt = null; lightsOn(false); bg.next = now + 0.6; deck.q = null; deck.out = null; release(deck.tst, 0.2); }
    fadeBg(); window.__music.playing = on; render(); }
  // ---------- sets and the set list ----------
  const clampBpm = b => Math.max(50, Math.min(160, Math.round(b)));
  function loadSet(s) { if (!s) return;
    if (s.kind === 'bg') S.deck = Object.assign(DECK0(), { track: copy(s.bg), bpm: clampBpm(trackTempo(s.bg, null)), setName: s.name, preset: 'empty', grid: presetGrid('empty'), vol: S.deck.vol, lights: S.deck.lights, fx: { filter: 1, echo: 0.1, crush: 0 } });
    else S.deck = Object.assign(DECK0(), copy(s.deck), { setName: s.name, track: null });
    rollLead(); applyFx(); if (deck.playing && ctx) deckBus.gain.setTargetAtTime(deckVol(), ctx.currentTime, 0.05); save(); render(); }
  function bgFromTrack(s) { Object.assign(S.bg, copy(s.bg)); S.bg.voices = Object.assign(BG0().voices, S.bg.voices); if (!S.bg.on) setBg(true); bgRestart(); render(); }
  const qItems = () => S.queue.map(id => S.sets.find(s => s.t === id)).filter(Boolean);
  function qPlay() { const it = qItems(); if (!it.length) return; loadSet(it[0]); if (!deck.playing) play(true); deck.q = { i: 0, next: ctx.currentTime + S.qo.each * 60 }; toast('set list: ' + it[0].name); render(); }
  function qNext() { const it = qItems(); if (!deck.q || !deck.playing || !it.length) { deck.q = null; return; } const i = (deck.q.i + 1) % it.length, now = ctx.currentTime, xf = S.qo.xf;
    if (it.length > 1) { deck.out = { D: copy(S.deck), step: deck.step, next: deck.next, lead: leadPat, lane: curLane, tst: deck.tst, until: now + xf + 0.3 };
      const old = curLane; old.gain.cancelScheduledValues(now); old.gain.setTargetAtTime(0, now, xf / 3);
      curLane = OUT = old === laneA ? laneB : laneA; curLane.gain.cancelScheduledValues(now); curLane.gain.setValueAtTime(0.0001, now); curLane.gain.setTargetAtTime(1, now, xf / 3);
      deck.tst = newTst(); loadSet(it[i]); deck.step = 0; deck.t0 = deck.next = now + 0.05; toast('▶ ' + it[i].name); }
    deck.q = { i, next: now + S.qo.each * 60 }; render(); }
  setInterval(() => { if (deck.q && (!deck.playing || !ctx)) deck.q = null; if (deck.q && ctx.currentTime >= deck.q.next - S.qo.xf) qNext(); }, 500);
  // the first click anywhere wakes the audio if the background music was left on (browsers only start sound on a gesture)
  addEventListener('pointerdown', function wake() { if (S.bg.on) { ensure(); ctx.resume(); setBg(true); } removeEventListener('pointerdown', wake, true); }, true);

  // ---------- event marks (only with the background music on and following the world; at most one per kind every 8 s) ----------
  const lastMark = {};
  addEventListener('idle:ev', e => { if (!S.bg.on || !S.bg.react || !ctx || ctx.state !== 'running') return; const { type, extra = {} } = e.detail || {}, now = performance.now();
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
    if (D.track) { const T = D.track, P = PROF[T.style] || PROF.home, L = v => lvl(P, T, v), gd = D.layer ? Math.min(1, (n('kick') * 1.2 + n('snare') + n('hat') * 0.6 + n('clap') * 0.7) / 1.6) : 0;   // a background track: its style's profile, scaled by its voice levels
      const drums = Math.min(1, Math.max(gd, P.lv.beat ? P.feat.drums * L('beat') / P.lv.beat : 0.25 * L('beat'))), bass = Math.min(1, P.feat.bass), mw = 0.5 * P.lv.pluck + 0.3 * P.lv.pad + 0.2 * P.lv.bells + 0.15 * P.lv.drone;
      const melody = Math.min(1, P.feat.melody * (0.5 * L('pluck') + 0.3 * L('pad') + 0.2 * L('bells') + 0.15 * L('drone')) / Math.max(0.05, mw) * (0.4 + 0.6 * f.filter));
      const loud = Math.min(1, D.vol * (0.4 + 0.25 * drums + 0.2 * bass) + f.crush * 0.25);
      return { playing: deck.playing, bpm: D.bpm, loud: +loud.toFixed(2), drums: +drums.toFixed(2), bass: +bass.toFixed(2), melody: +melody.toFixed(2), strobe: !!(D.lights.strobe && !reduced()), name: D.setName || P.name, rave: !!S.rave, dropping: !!dropAt, track: true }; }
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
#dj .sub{opacity:.7;font-size:11px;margin:2px 0}#dj details.tweak{margin:2px 0 4px;padding:2px 6px;border:1px solid #8884;border-radius:8px}#dj details.tweak summary{cursor:pointer;opacity:.8;font-size:11px}#dj .row .bpm{width:52px;text-align:right;opacity:.75}#dj .trk{justify-content:space-between}#dj .trk span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#dj button:disabled{opacity:.35;cursor:default}#dj .sets div{display:flex;justify-content:space-between;align-items:center;margin:2px 0}#dj input[type=text]{font:inherit;font-size:12px;flex:1;background:none;color:inherit;border:1px solid #8886;border-radius:6px;padding:2px 6px}`;
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
    const B = S.bg, T = trackOf(B, W), R = B.react, var_ = B.seed !== 1 ? ' · variation ' + B.seed : '';
    const mood = (B.style === 'world' ? (W.keep ? 'Gloamhold: low drones, slow bells' : 'Home: warm plucks and a pad') : (PROF[T.style] || PROF.home).name) + var_;
    const wx = /storm/.test(W.kind) ? ', a low pulse for the storm' : /rain/.test(W.kind) ? ', softened by the rain' : /fog/.test(W.kind) ? ', slowed by the fog' : /wind/.test(W.kind) ? ', with the wind breathing' : '';
    el.innerHTML = `<div class="hd"><b>🎧 music</b><button data-x="close" title="close">✕</button></div>
<h4>background music</h4><div class="row"><button data-x="bg" class="${S.bg.on ? 'on' : ''}">${S.bg.on ? 'on' : 'off'}</button><label style="width:auto">volume</label><input type="range" min="0" max="1" step="0.01" value="${S.bg.vol}" data-r="bgvol"></div>
<div class="sub">${S.bg.on ? (deck.playing ? 'resting while the deck plays' : mood + (R ? wx + (isNight(W.day) ? ', quieter for the night' : '') : ', not following the weather')) : 'off: turn it on for music that follows the place, the weather and the day'}</div>
<div class="row"><label>style</label><select data-s="bgstyle">${Object.keys(STYLES).map(k => `<option value="${k}" ${k === B.style ? 'selected' : ''}>${STYLES[k]}</option>`).join('')}</select><button data-x="bgvar" title="a new variation of this style: chords, rhythm, register">↻ new variation</button></div>
<details class="tweak" data-d="bgt" ${S.ui.bgt ? 'open' : ''}><summary>tweak${B.seed !== 1 || B.speed !== 1 || B.key >= 0 || B.scale !== 'auto' || B.dens !== 0.5 || B.bright !== 0.75 || !R || VOICES.some(v => B.voices[v] !== 1) ? ' ·  changed' : ''}</summary>
<div class="row"><label>speed</label><input type="range" min="0.5" max="1.6" step="0.01" value="${B.speed}" data-r="bg:speed"><span class="bpm">${Math.round(bgTempo(W))} bpm</span></div>
<div class="row"><label>key</label><select data-s="bgkey"><option value="-1">auto</option>${NOTES.map((n, i) => `<option value="${i}" ${i === B.key ? 'selected' : ''}>${n}</option>`).join('')}</select><select data-s="bgscale"><option value="auto">auto scale</option>${Object.keys(SCALES).map(x => `<option ${x === B.scale ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
<div class="row"><label>busyness</label><input type="range" min="0" max="1" step="0.01" value="${B.dens}" data-r="bg:dens" title="sparse ↔ busy"></div>
<div class="row"><label>brightness</label><input type="range" min="0" max="1" step="0.01" value="${B.bright}" data-r="bg:bright" title="muffled ↔ bright"></div>
${VOICES.map(v => `<div class="row"><label>${v}</label><input type="range" min="0" max="2" step="0.01" value="${B.voices[v]}" data-r="bgv:${v}" title="${v}: 0 silent, the middle as the style has it, past the middle adds more (even where the style has none)"></div>`).join('')}
<div class="row"><button data-x="bgreact" class="${R ? 'on' : ''}" title="rain softens it, storms add a pulse, fog slows it, wind breathes, night is quieter; names, volcanoes, hangry ones and new reels leave a mark">weather & day ${R ? 'on' : 'off'}</button><button data-x="bgreset" title="back to the style as written">reset</button></div>
<div class="row"><input type="text" placeholder="name this track" data-n="bg"><button data-x="savetrack" title="keep this background as a track: play it later as the background, on the deck (rave mode hears it), or in the set list">save track</button></div></details>
<h4>deck</h4><div class="row"><button data-x="play" class="${deck.playing ? 'on' : ''}">${deck.playing ? '■ stop' : '▶ play'}</button><select data-s="preset">${Object.keys(PRESETS).map(p => `<option ${p === D.preset ? 'selected' : ''}>${p}</option>`).join('')}</select><button data-x="roll" title="a new lead melody">↻ melody</button></div>
<div class="row"><button data-x="rave" class="${S.rave ? 'on' : ''}" title="rave mode: the creatures near you hear the deck and react by their own taste (tempo, loudness, drums, bass, melody)">🕺 rave ${S.rave ? 'on' : 'off'}</button><span class="sub" style="margin:0">${S.rave ? (deck.playing ? 'they can hear you' : 'press play') : 'play for the creatures'}</span></div>
<div id="ravemeter"></div>
${D.track ? `<div class="row trk"><span>🌙 track: <b>${esc(D.setName || (PROF[D.track.style] || PROF.home).name)}</b></span><button data-x="layer" class="${D.layer ? 'on' : ''}" title="play the grid's drums on top of the track">+ grid drums</button><button data-x="untrack" title="back to the grid">grid</button></div>` : ''}
<div class="row"><label>tempo</label><input type="range" min="50" max="160" step="1" value="${D.bpm}" data-r="bpm"><span>${D.bpm}</span></div>
<div class="row"><label>key</label><select data-s="key">${NOTES.map((n, i) => `<option value="${i}" ${i === D.key ? 'selected' : ''}>${n}</option>`).join('')}</select><select data-s="scale">${Object.keys(SCALES).map(s => `<option ${s === D.scale ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
<div class="row"><label>volume</label><input type="range" min="0" max="1" step="0.01" value="${D.vol}" data-r="vol"></div>
<div class="grid">${ROWS.map(r => `<span>${r}</span>` + D.grid[r].map((v, i) => `<b class="${v ? 'x' : ''}${i % 4 === 0 && i ? ' q' : ''}" data-g="${r}:${i}"></b>`).join('')).join('')}</div>
<h4>mixer · soft ↔ gritty</h4>${['bass', 'lead', 'pad'].map(c => `<div class="row"><label>${c}</label><input type="range" min="0" max="1" step="0.01" value="${D.ch[c].v}" data-r="ch:${c}:v" title="${c} volume"><input type="range" min="0" max="1" step="0.01" value="${D.ch[c].m}" data-r="ch:${c}:m" title="${c} mood: soft ↔ gritty"></div>`).join('')}
<h4>effects</h4><div class="row"><label>filter</label><input type="range" min="0" max="1" step="0.01" value="${D.fx.filter}" data-r="fx:filter"></div><div class="row"><label>echo</label><input type="range" min="0" max="1" step="0.01" value="${D.fx.echo}" data-r="fx:echo"></div><div class="row"><label>bitcrush</label><input type="range" min="0" max="1" step="0.01" value="${D.fx.crush}" data-r="fx:crush"></div>
<button class="drop" data-x="drop" ${deck.playing ? '' : 'disabled'} title="two bars of build-up, a beat of silence, then everything back in">DROP</button>
<h4>lights</h4><div class="row"><button data-l="pulse" class="${D.lights.pulse ? 'on' : ''}">floor pulse</button><button data-l="spots" class="${D.lights.spots ? 'on' : ''}" title="sweeping spotlights at Home">spotlights</button><button data-l="strobe" class="${D.lights.strobe ? 'on' : ''}" title="⚠ flashing light on the beat (at most four flashes a second; in Gloamhold it flips black and white). Off if your system asks for reduced motion">⚠ strobe</button></div>
${reduced() ? '<div class="sub">reduced motion is on: no strobe, spotlights hold still</div>' : ''}
<h4>sets</h4><div class="row"><input type="text" placeholder="name this set" data-n="1"><button data-x="saveset">save</button></div><div class="sets">${S.sets.map((s, i) => `<div><span>${s.kind === 'bg' ? '🌙 ' : ''}${esc(s.name)}</span><span>${s.kind === 'bg' ? `<button data-asbg="${i}" title="play it as the background music">bg</button> <button data-load="${i}" title="load it into the deck (rave mode hears it)">deck</button>` : `<button data-load="${i}">load</button>`} <button data-q="${i}" title="add to the set list">+ list</button> <button data-del="${i}" title="remove this set">×</button></span></div>`).join('') || '<div class="sub">none yet</div>'}</div>
<h4>set list</h4>${(() => { const it = qItems(); if (!it.length) return '<div class="sub">add sets and tracks with + list: they play in order on the deck, crossfading, and loop</div>';
  const cur = deck.q ? deck.q.i : -1; return '<div class="sets">' + it.map((s, j) => `<div><span>${j === cur ? '▶ ' : (j + 1) + '. '}${s.kind === 'bg' ? '🌙 ' : ''}${esc(s.name)}</span><span><button data-qup="${j}" title="earlier" ${j ? '' : 'disabled'}>↑</button> <button data-qdel="${j}" title="take it off the list">×</button></span></div>`).join('') + '</div>'
  + `<div class="row"><button data-x="qplay" class="${deck.q ? 'on' : ''}">${deck.q ? '■ stop the list' : '▶ play the list'}</button><label style="width:auto">each</label><select data-s="qeach">${[1, 2, 3, 5, 8].map(m => `<option value="${m}" ${m === S.qo.each ? 'selected' : ''}>${m} min</option>`).join('')}</select><label style="width:auto">crossfade</label><select data-s="qxf">${[2, 4, 6, 10].map(x => `<option value="${x}" ${x === S.qo.xf ? 'selected' : ''}>${x} s</option>`).join('')}</select></div>`
  + (deck.q && ctx ? `<div class="sub">next: ${esc(it[(deck.q.i + 1) % it.length].name)} in ${Math.max(0, Math.round((deck.q.next - S.qo.xf - ctx.currentTime) / 60 * 10) / 10)} min</div>` : ''); })()}`; }
  el.addEventListener('click', e => { const b = e.target.closest('button,[data-g]'); if (!b) return; const D = S.deck, x = b.dataset.x;
    if (x === 'close') { S.open = false; save(); render(); }
    else if (x === 'bg') setBg(!S.bg.on);
    else if (x === 'play') play(!deck.playing);
    else if (x === 'roll') { D.seed = (D.seed + 1) % 1000; rollLead(); save(); }
    else if (x === 'drop') drop();
    else if (x === 'rave') { S.rave = !S.rave; save(); reDuck(); render(); try { window.dispatchEvent(new CustomEvent('idle:rave', { detail: { on: S.rave } })); } catch (e) {} }
    else if (x === 'saveset') { const n = el.querySelector('[data-n="1"]').value.trim() || ('set ' + (S.sets.length + 1)); S.sets.push({ name: n.slice(0, 40), t: Date.now(), kind: 'deck', deck: copy(D) }); save(); render(); }
    else if (x === 'savetrack') { const T = trackOf(S.bg, world()), n = el.querySelector('[data-n="bg"]').value.trim() || ((PROF[T.style] || PROF.home).name + (T.seed !== 1 ? ' ' + T.seed : '') + ' track'); S.sets.push({ name: n.slice(0, 40), t: Date.now(), kind: 'bg', bg: T }); save(); render(); toast('🌙 saved: ' + n.slice(0, 40)); }
    else if (x === 'bgvar') { S.bg.seed = 2 + Math.floor(Math.random() * 9998); bgRestart(); render(); }
    else if (x === 'bgreact') { S.bg.react = !S.bg.react; if (!S.bg.react) windPad(0); save(); render(); }
    else if (x === 'bgreset') { const k = { on: S.bg.on, vol: S.bg.vol, style: S.bg.style }; S.bg = Object.assign(BG0(), k); bgRestart(); render(); }
    else if (x === 'layer') { D.layer = !D.layer; save(); render(); }
    else if (x === 'untrack') { D.track = null; D.layer = false; D.setName = null; D.bpm = Math.max(70, D.bpm); release(deck.tst); save(); render(); }
    else if (x === 'qplay') { if (deck.q) { deck.q = null; render(); } else qPlay(); }
    else if (b.dataset.load) { const s = S.sets[+b.dataset.load]; if (s) { if (deck.playing && ctx) release(deck.tst, 0.3); loadSet(s); } }
    else if (b.dataset.asbg) { const s = S.sets[+b.dataset.asbg]; if (s) bgFromTrack(s); }
    else if (b.dataset.q) { const s = S.sets[+b.dataset.q]; if (s) { S.queue.push(s.t); save(); render(); } }
    else if (b.dataset.qdel) { S.queue.splice(+b.dataset.qdel, 1); save(); render(); }
    else if (b.dataset.qup) { const j = +b.dataset.qup; if (j > 0) { [S.queue[j - 1], S.queue[j]] = [S.queue[j], S.queue[j - 1]]; save(); render(); } }
    else if (b.dataset.del) { const s = S.sets[+b.dataset.del]; S.sets.splice(+b.dataset.del, 1); if (s) S.queue = S.queue.filter(id => id !== s.t); save(); render(); }
    else if (b.dataset.l) { D.lights[b.dataset.l] = !D.lights[b.dataset.l]; save(); syncLights(); render(); }
    else if (b.dataset.g) { const [r, i] = b.dataset.g.split(':'); D.grid[r][i] = D.grid[r][i] ? 0 : 1; b.classList.toggle('x'); save(); } });
  el.addEventListener('input', e => { const r = e.target.dataset.r; if (!r) return; const v = +e.target.value, D = S.deck;
    if (r === 'bgvol') { S.bg.vol = v; fadeBg(); }
    else if (r === 'bg:speed') { S.bg.speed = v; const sp = e.target.parentNode.querySelector('.bpm'); if (sp) sp.textContent = Math.round(bgTempo(world())) + ' bpm'; }
    else if (r === 'bg:dens') S.bg.dens = v;
    else if (r === 'bg:bright') { S.bg.bright = v; if (ctx && S.bg.on) bgFilt.frequency.setTargetAtTime(brightCut(v), ctx.currentTime, 0.1); }
    else if (r.startsWith('bgv:')) S.bg.voices[r.slice(4)] = v;
    else if (r === 'bpm') { D.bpm = v; e.target.nextElementSibling.textContent = v; applyFx(); }
    else if (r === 'vol') { D.vol = v; if (ctx && deck.playing) deckBus.gain.setTargetAtTime(deckVol(), ctx.currentTime, 0.05); }
    else { const [a, b, c] = r.split(':'); if (a === 'ch') D.ch[b][c] = v; if (a === 'fx') { D.fx[b] = v; applyFx(); } }
    save(); });
  el.addEventListener('change', e => { const s = e.target.dataset.s; if (!s) return; const D = S.deck, v = e.target.value;
    if (s === 'preset') { D.preset = v; D.setName = null; D.grid = presetGrid(v); D.bpm = PRESETS[v].bpm; applyFx(); render(); }
    if (s === 'key') D.key = +v; if (s === 'scale') D.scale = v;
    if (s === 'bgstyle') { S.bg.style = v; bgRestart(); render(); } if (s === 'bgkey') { S.bg.key = +v; bgRestart(); } if (s === 'bgscale') { S.bg.scale = v; bgRestart(); }
    if (s === 'qeach') S.qo.each = +v; if (s === 'qxf') S.qo.xf = +v; save(); });
  el.addEventListener('toggle', e => { const d = e.target.dataset && e.target.dataset.d; if (d) { S.ui[d] = e.target.open; save(); } }, true);
  el.addEventListener('keydown', e => e.stopPropagation());   // typing a set name never reaches the game's shortcuts
  // the step now playing lights up on the grid (only while the panel is open; 8 times a second, not per frame)
  setInterval(() => { if (!S.open || !deck.playing || !ctx) return; const spb = 60 / S.deck.bpm / 4, i = Math.floor((ctx.currentTime - deck.t0) / spb) % 16;
    el.querySelectorAll('.grid b.now').forEach(b => b.classList.remove('now')); el.querySelectorAll(`.grid b[data-g$=":${i}"]`).forEach(b => b.classList.add('now')); }, 125);
  function toast(t) { try { window.__musicToast ? window.__musicToast(t) : null; } catch (e) {} }

  window.__music = { playing: false, state: () => ({ bg: copy(S.bg), deck: copy(S.deck), sets: copy(S.sets), queue: [...S.queue], qo: { ...S.qo } }),
    merge(st) { if (!st) return; for (const s of st.sets || []) if (!S.sets.some(x => x.name === s.name && x.t === s.t)) S.sets.push(s); if (st.deck) S.deck = Object.assign(DECK0(), st.deck);
      if (st.bg) { S.bg = Object.assign(BG0(), st.bg, { on: S.bg.on }); S.bg.voices = Object.assign(BG0().voices, S.bg.voices); }
      if (st.queue && !S.queue.length) S.queue = st.queue.filter(id => S.sets.some(s => s.t === id)); if (st.qo) S.qo = Object.assign(S.qo, st.qo); save(); render(); },
    bgTrack: () => trackOf(S.bg, world()), bgSet: o => { Object.assign(S.bg, o); bgRestart(); render(); }, loadSet, bgFromTrack, qPlay, qNext, styles: Object.keys(STYLES), _q: () => deck.q, _out: () => deck.out,
    setBg, play, drop, features, rave: () => !!S.rave, setRave: on => { S.rave = !!on; save(); reDuck(); render(); }, _ducks: () => [...ducks], _gains: () => ctx && { bg: +bgBus.gain.value.toFixed(3), deck: +deckBus.gain.value.toFixed(3) }, PRESETS: Object.keys(PRESETS), SCALES: Object.keys(SCALES), _ctx: () => ctx, _deck: deck, _bg: bg };
  render();
})();
