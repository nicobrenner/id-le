// idle-epoch0.js: the "Epoch 0" intro (Nico, Nov 1: "Love this one, let's try it!"; script: the universe learns to speak).
// A training run, played back: a blinking cursor, then babble that sharpens epoch by epoch until the Oracle writes the first line,
// "in the beginning there was nothing"; the word Idle is cut into Id|le by a tokenizer's bar, the halves grow legs and crawl off; "your turn".
// What is real:
//   - the babble is the shipped Tiny Oracle sampled live in the page (window.__oracle.babble, arena.html) with a temperature schedule
//     from very hot to cool. The "epochs" are that schedule, which is how a model sounds at different stages; it is not a replay of
//     training. Different every visit. Until the 10.8 MB model is ready (and always on phones / in safe mode) lines come from
//     intro_babble.json: a bank sampled from the same model with the same schedule (tools/make_intro_babble.py).
//   - the loss curve is the Oracle's real training loss (oracle_loss.json: numbers only; its from-scratch run, then the shipped fine-tune).
//   - the last line: the model is asked to finish "In the beginning there was"; it usually says something else ("a lot of time"),
//     which is shown, deleted, and replaced by "nothing". The game writes the word the model wouldn't.
//   - nothing from training data is ever shown, only what the model writes now; a small blocklist resamples anything unfit.
// The boot (idle-boot.js, Nico Nov 2): on staging and local copies (or with ?boot / ?intro=boot / play({ boot: true }); ?noboot skips it)
// a terminal boots first, the operator types "run project 24", and the whole run plays inside its panes (term layout below).
// Subtitles (Nico: "the subtitles are small… people miss it"): the scientist's lines, and outside the story the captions, are big,
// centred on a dark band, at least 1.4× the size of the model's text.
// API (used by idle-intro.js for tone 'epoch0'): window.__epoch0.play(opts) → Promise<{ tone:'epoch0', skipped }>, close(), playing();
// recordings and tests: makeContent({ live }), frame(content, T, canvas) (call in increasing T), renderAudio(content) → base64 WAV.
(() => {
  // Id|le's own fonts when loaded (idle-fonts.js): Doc's lines in f3, the panes in the terminal face f1
  const SUBF = (window.IDLE_FONTS && window.IDLE_FONTS.sub) || '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif', TERMF = (window.IDLE_FONTS && window.IDLE_FONTS.term) || 'ui-monospace, Menlo, monospace';
  // anything matching is resampled (live) or dropped (bank): unkind words, bodies, violence, and names that must never appear
  const BLOCK = /\b(sex\w*|porn\w*|nud\w*|naked|kill\w*|suicid\w*|rap(e|ed|ing|ist)|nazi\w*|hitler|drug\w*|cocaine|heroin|weed|fuck\w*|shit\w*|bitch\w*|damn\w*|bastard|nigg\w*|fag\w*|retard\w*|slut\w*|whore\w*|dick\w*|cock\w*|puss\w*|cunt\w*|terror\w*|bomb\w*|guns?|shoot\w*|blood\w*|die|died|dies|dead|death|murder\w*|hate\w*|stupid|idiot|ugly|fat|nico\w*|brenner|jeffy|password|depress\w*|cancer|hospital|funeral|war|wars)\b|https?:|www\.|@|\d{3,}/i;
  // the schedule: one line per "epoch", hot to cool (probed on the real model: 2.5/full vocabulary is joyful babble, 0.55/30 is almost sense)
  // six lines (Nico: slower, readable, and the link to the loss curve unmistakable): each is born at a point of the real loss curve (k:
  // its index in base+finetune, spaced so the steep early drop gets three lines) and labelled with that point's epoch and loss. The
  // text is the model at that temperature, not a checkpoint from that epoch (see the header): the curve and the text fall together.
  const SCHED = [
    { e: 0, temp: 2.6, topK: 0, tok: 12, k: 0, cap: 'it has learned almost nothing' }, { e: 2, temp: 1.8, topK: 0, tok: 12, k: 1, cap: 'letters, mostly' },
    { e: 4, temp: 1.4, topK: 400, tok: 13, k: 3, cap: 'words, mostly' }, { e: 6, temp: 1.15, topK: 200, tok: 13, k: 9, cap: 'fragments' },
    { e: 8, temp: 0.95, topK: 80, tok: 14, k: 25, cap: 'almost sentences' }, { e: 12, temp: 0.55, topK: 30, tok: 14, k: -1, cap: 'it almost speaks' }];
  const PROMPTS = ['<|user|> tell me about the world\n<|oracle|>', '<|user|> what do you see?\n<|oracle|>', '<|user|> say something\n<|oracle|>', '<|user|> who are you?\n<|oracle|>'];
  const BEGIN = 'in the beginning there was', FINAL = 'nothing';
  const BEGIN_PROMPT = '<|user|> how did the world begin?\n<|oracle|> *tell In the beginning there was';
  // the film's clock (seconds)
  // each line streams for C.stream s and then stays fully readable (≥ 2 s) before the next starts; then the whole story holds (C.stack)
  const C = { cursor: 0, babble: 1.6, lead: 0.2, slot: 3.6, stream: 1.35, curve: 0.5, stack: 23.2, final: 25.6, split: 30.1, crawl: 32.6, turn: 35.2, total: 37.5 };   // split..total move later if the first line needs it
  // the storyline's version (?story, or play({ story: true }); Nico's script, storyline-script.md, section A): a scientist watches the run
  // and comments in subtitles, gets excited, then scared: the curve keeps falling past the chart's floor, lines pour out and overlap,
  // "can we stop it?!", "run!!!!", a white flash and a tear, silence; then the cut (Idle → Id|le) and the halves crawl off into the dark.
  // No "in the beginning there was…" and no "your turn" here: the Tiny Operator takes over (idle-genesis.js, the waking up).
  // v15 (Nico on his iPhone: "the computer/training screen starts spinning a little bit too soon, or too fast too soon... the loss you don't
  // fully get to see the red loss line going down exponentially"): the spin waits for the dive (spin 26.6 → 28.2), the red line's plunge through
  // the floor completes by then (DIVE over over → spin, exponential), and the twirl starts gently (k^2.6); the flash and everything after it unchanged
  const CS = { over: 23.2, panic: 25.0, run: 27.3, spin: 28.2, tear: 29.5, flash: 29.75, split: 31.0, crawl: 34.9, end: 36.9 };
  const diveU = T => { const u = clamp((T - CS.over) / (CS.spin - CS.over)); return (Math.exp(3.2 * u) - 1) / (Math.exp(3.2) - 1); };   // 0 → 1, slow then plunging
  const spinOf = k => Math.pow(clamp(k), 2.6) * 14;   // radians the inner ring has turned at vortex progress k (gentle start, a fast end)
  const LOGO_HOLD = 5.2, IDLE_BPM = 84, PURR = 4, PURR_GAP = 2.0;   // v9 (Nico: "the sound of the logo starts too early, it merges with the thunder"): the purr waits 2 s, the logo holds until it ends   // PURR: the signature purr's variant (1 warm FM, 2 saw + chime, 3 deep rumble, 4 b2's purr into noise: Nico's pick); it starts PURR_GAP s after the cut's thunder   // story v6: after the cut Id|le holds 3.2 s, its pipe cycling the rainbow at the engine's idle tempo; then black
  const STRIKES = [];   // v7: no run-up of strikes; the one lightning is the cut's
  // the engine's tempo during the run (boot-script.md v6): idle 84 → 110 bpm while it learns, → 170 when it runs away, → 260 at the vortex
  const runBpm = T => T < CS.over ? 84 + 26 * T / CS.over : T < CS.spin ? 110 + 60 * (T - CS.over) / (CS.spin - CS.over) : 170 + 90 * Math.min(1, (T - CS.spin) / (CS.flash - CS.spin));
  const RUN_BEATS = (() => { const b = []; for (let t = 0.2; t < CS.flash; t += 60 / runBpm(t)) b.push(t); return b; })();
  const beatK = t => clamp(0.35 + 0.65 * (runBpm(t) - 84) / 176);   // how hard each beat hits   // story v5 (Nico): after the flash, a few lightning strikes in the dark, then the cut (with its own flash of lightning)
  const SUBS = [   // [film second it starts, the scientist's line] (typed; a different font from the model's)
    [1.9, "…ok. it's babbling. that's normal."], [9.2, 'oh wow, these losses are exceptional…'], [12.8, 'wait… it keeps learning!!'],
    [16.4, "and it's only a… a few megabytes?!"], [20.0, "look at those losses, after all these epochs, and… it doesn't stop…"],
    [23.6, "can we stop it?! OMG, it won't stop!!!"], [27.3, "…run!!!! it's tooooo llaaaaaaaa………"]];
  let story = false, term = false;   // set per frame from the content (frameAt): the story version; inside the boot's panes
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ease = u => u * u * (3 - 2 * u);
  const clean = s => String(s || '').replace(/�/g, '').replace(/^\s*\*\w*\s*/, '').replace(/\s+/g, ' ').replace(/\s+([,.!?'])/g, '$1').trim();
  // also out: persona details from the chat data (ages, people, money, health) and anything that looks like a name: a capitalized word
  // that isn't a common sentence word (the hot epochs invent "names"; the cool ones could echo a real one)
  const SOFT = /\b(wom[ae]n|girls?|boys?|wife|husband|girlfriend|boyfriend|kids?|children|years? old|\d+-?year|age|romantic|dating|smok\w*|stole|steal\w*|rob\w*|salary|money|paid|pay|insurance|medicine|patient\w*|doctor|sick|scar\w*|upset|sad|cry\w*|lonely|religio\w*|church|god|politic\w*|job|boss|fired|daughters?|sons?|father|mother|mom|dad|parents?|family|police|beer|drank|drunk|drink\w*|coke|alcohol|wine|apartment|dollars?|heart|she|her|he|his|him)\b/i;
  const OKCAP = new Set('I Im Ive Ill Id Okay Ok Yes Yeah Well Hi Hey Oh Thank Thanks That Thats The It Its Me Maybe First However About Great Mostly Sure So But And What When This We You Your My In On Of Or If Not No Now Then There They Their To Too Very Wow Hello Good Nice Cool Really Just Also As At By For From Here How Is Do Does Did Can Could Would Should Will Some All Any One Two Three A An'.split(' '));
  const nameLike = s => (s.match(/[A-Z][a-z]+(?:'[a-z]+)?/g) || []).some(w => !OKCAP.has(w.replace(/'/g, '')));
  const fit = s => !!s && s.length >= 3 && !BLOCK.test(s) && !SOFT.test(s) && !nameLike(s);
  const Q = new URLSearchParams(location.search);
  // the story's logo (Nico, Nov 3, after three rounds of the logo lab: "I'd go with either C3 · Typed, dust or C3-crt · Typed, CRT off...
  // maybe we go with these as A/B testing on the story"): each browser gets one arm, once, kept in idle.logoArm (independent of the storyline's
  // own A/B); ?logo=c3|crt forces it on staging and local copies. The logo comes from idle-logos.js (the lab's module, also used by ⭐ reviews),
  // loaded and rendered while the story plays its first scenes; if it can't load, the story keeps its old logo (the cut, the rainbow pipe, the purr).
  const LOGO_ARMS = { c3: 'c3-typed-dust', crt: 'c3-typed-crt' }, testHost = () => /^staging\./.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  function logoArm() { const f = Q.get('logo'); if (f && LOGO_ARMS[f] && testHost()) return f;
    let a = null; try { a = localStorage.getItem('idle.logoArm'); } catch (e) {} if (LOGO_ARMS[a]) return a;
    a = Math.random() < 0.5 ? 'c3' : 'crt'; try { localStorage.setItem('idle.logoArm', a); } catch (e) {} return a; }
  let logosP = null;
  const loadLogos = () => window.IdleLogos ? Promise.resolve(window.IdleLogos) : logosP || (logosP = new Promise((res, rej) => { const s = document.createElement('script'), v = (window.IDLE_V && window.IDLE_V['idle-logos.js']) || (window.IDLE_CFG && window.IDLE_CFG.build) || '';   // the file's own fingerprint (build_static), so a new version is never served from cache
    s.src = 'idle-logos.js' + (v ? '?v=' + encodeURIComponent(v) : ''); s.onload = () => window.IdleLogos ? res(window.IdleLogos) : rej(new Error('no IdleLogos')); s.onerror = () => { logosP = null; rej(new Error('idle-logos.js did not load')); }; document.head.appendChild(s); }));
  // the arm's logo, loaded and its sound rendered (null on failure or after `wait` ms: the old logo plays)
  function prepLogo(arm, wait = 6000) { const id = LOGO_ARMS[arm]; if (!id) return Promise.resolve(null);
    const p = loadLogos().then(M => { const L = M.byId(id); return L && canHost(L) ? L.prepare().then(() => L) : null; }).catch(() => null);
    return Promise.race([p, new Promise(r => setTimeout(() => r(null), wait))]); }
  // a module old enough not to have the host API (an older idle-logos.js from a cache) is never used: the old logo plays instead
  const canHost = L => !!L && typeof L.drawAt === 'function' && typeof L.ready === 'function' && typeof L.buffer === 'function';
  const logoOf = ct => ct && ct.story && ct.logo && !ct.logo.broken && canHost(ct.logo.L) && ct.logo.L.ready() ? ct.logo : null;   // the new logo plays in this film
  const LOGO_TAIL = 0.4;   // black after the logo's last frame, before the landing
  const phone = () => matchMedia('(max-width: 600px)').matches || matchMedia('(pointer: coarse)').matches;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- the babble: a bank (same model, pre-sampled) and live sampling ----------
  let bank = null, bankP = null, loss = null, lossP = null;
  const loadBank = () => bankP || (bankP = fetch('intro_babble.json').then(r => r.ok ? r.json() : null).then(j => (bank = j)).catch(() => null));
  const loadLoss = () => lossP || (lossP = fetch('oracle_loss.json').then(r => r.ok ? r.json() : null).then(j => (loss = j)).catch(() => null));
  const FALLBACK = ['nom nom wrds the the heap', 'cat cat ▮ of of loop', 'a word a word a wo', 'the floor is is made', 'i see the the words', 'they walk on the words', 'a small world of words', 'the words are listening'];
  function bankLine(e, r) { const L = bank && bank.lines && bank.lines[String(e)]; const pool = (L || []).filter(fit); if (pool.length) return pool[Math.floor(r() * pool.length)]; return FALLBACK[Math.min(FALLBACK.length - 1, SCHED.findIndex(s => s.e === e))]; }
  function bankCont(r) { const L = (bank && bank.cont || []).filter(s => fit(s) || /^nothing/.test(s)); return L.length ? L[Math.floor(r() * L.length)] : 'a lot of time'; }
  function piecesOf(text, e) {   // bank lines have no token boundaries: cut them like a BPE would, short subwords when hot, words when cool
    const out = []; const words = text.match(/\s*\S+/g) || []; for (const w of words) { if (e <= 4 && w.trim().length > 3) { let i = 0; while (i < w.length) { const n = 2 + ((i * 7 + w.length) % 3); out.push(w.slice(i, i + n)); i += n; } } else out.push(w); } return out; }
  async function liveLine(st, r) {
    const O = window.__oracle; if (!O || !O.ready || !O.babble) return null;
    for (let k = 0; k < 3; k++) { const pieces = []; const t = await O.babble({ prompt: PROMPTS[Math.floor(r() * PROMPTS.length)], temp: st.temp, topK: st.topK, maxTokens: st.tok, onToken: p => pieces.push(p) });
      // the model's tokens, minus its action marker (*tell) and anything after its line break: what is shown is exactly what it wrote
      const lead = (pieces.join('').match(/^\s*\*\w*\s*/) || [''])[0].length; let skip = lead; const ps = [];
      for (const p of pieces) { if (skip >= p.length) { skip -= p.length; continue; } let q = p.slice(skip); skip = 0; const nl = q.indexOf('\n'); if (nl >= 0) { q = q.slice(0, nl); if (q) ps.push(q); break; } ps.push(q); }
      const c = clean(ps.join('')); if (fit(c) && ps.length) return { text: c, pieces: ps, src: 'live' }; }
    return null; }
  async function liveCont() { const O = window.__oracle; if (!O || !O.ready || !O.babble) return null; const t = await O.babble({ prompt: BEGIN_PROMPT, temp: 0.6, topK: 20, maxTokens: 5 }); const c = clean(t).replace(/[,.].*$/, '').trim(); return c && (fit(c) || /^nothing/.test(c)) ? c : null; }
  // content: what this visit's intro says. Bank lines first, then live lines replace any epoch whose slot hasn't started yet.
  function makeContent(o = {}) {
    const seed = o.seed != null ? o.seed : (Math.random() * 2 ** 31) | 0, r = rng(seed);
    const ct = { seed, lines: SCHED.map(st => { const text = bankLine(st.e, r); return { e: st.e, text, pieces: piecesOf(text, st.e), src: bank ? 'bank' : 'fallback' }; }), cont: bankCont(r), contSrc: bank ? 'bank' : 'fallback', gaps: [] };
    for (let i = 0; i < 400; i++) ct.gaps.push(0.35 + r() * 1.3 + (r() < 0.12 ? 1.4 : 0));   // irregular token timing (relative units)
    ct.story = !!o.story; ct.extra = []; for (let i = 0; i < 18; i++) { const e = [12, 8, 12, 6][i % 4]; ct.extra.push({ text: bankLine(e, r), x: r(), y: r(), t: CS.over + 0.35 + i * (0.42 - i * 0.012), w: r() }); }
    return ct; }
  async function fillLive(ct, startedAt) {   // runs during play; startedAt(): seconds into the film
    const r = rng(ct.seed ^ 0x5bd1e995);
    const cont = liveCont().then(c => { if (c && startedAt() < C.final - 0.5) { ct.cont = c; ct.contSrc = 'live'; } });   // only before the first line starts
    for (let i = 0; i < SCHED.length; i++) { const st = SCHED[i], slot0 = C.babble + i * C.slot; if (startedAt() > slot0 - 0.15) continue; const L = await liveLine(st, r); if (L && startedAt() < slot0 - 0.05) ct.lines[i] = { e: st.e, ...L }; }
    await cont; }
  async function makeLiveContent(o = {}) {   // recordings: everything sampled now from the real model (no clock)
    await Promise.all([loadBank(), loadLoss()]); const ct = makeContent(o), r = rng(ct.seed ^ 0x5bd1e995);   // the real curve too, not the placeholder
    for (let i = 0; i < SCHED.length; i++) { const L = await liveLine(SCHED[i], r); if (L) ct.lines[i] = { e: SCHED[i].e, ...L }; }
    const c = await liveCont(); if (c) { ct.cont = c; ct.contSrc = 'live'; } return ct; }

  // ---------- timing helpers ----------
  function lineReveal(ct, i) {   // per piece: the time (s) it appears, inside the line's slot
    const L = ct.lines[i], n = L.pieces.length, slot0 = C.babble + i * C.slot + C.lead, span = C.stream; let acc = 0; const g = [];
    for (let k = 0; k < n; k++) { const v = ct.gaps[(i * 37 + k) % ct.gaps.length]; g.push(v); acc += v; }
    let t = slot0; return g.map(v => (t += v / acc * span)); }
  function finalText(ct, T) {   // the first line, typed: "in the beginning there was" + the model's word, deleted, then "nothing"
    const t = T - C.final - 0.25, typ = (s, t0, cps) => s.slice(0, clamp(Math.floor((t - t0) * cps), 0, s.length)); if (t < 0) return '';
    const head = typ(BEGIN, 0, 26); if (head.length < BEGIN.length) return head;
    const own = /^nothing/.test(ct.cont) ? '' : ct.cont.slice(0, 24), t1 = BEGIN.length / 26 + 0.25;
    if (!own) return BEGIN + ' ' + typ(FINAL, t1, 9);
    const tw = own.length / 18, hold = 0.5, del = own.length / 36;
    if (t < t1 + tw) return BEGIN + ' ' + typ(own, t1, 18);
    if (t < t1 + tw + hold) return BEGIN + ' ' + own;
    if (t < t1 + tw + hold + del) return BEGIN + ' ' + own.slice(0, Math.max(0, own.length - Math.floor((t - t1 - tw - hold) * 36)));
    return BEGIN + ' ' + typ(FINAL, t1 + tw + hold + del + 0.15, 9); }
  const finalDone = ct => { const own = /^nothing/.test(ct.cont) ? '' : ct.cont.slice(0, 24), t1 = BEGIN.length / 26 + 0.25; return C.final + 0.25 + t1 + (own ? own.length / 18 + 0.5 + own.length / 36 + 0.15 : 0) + FINAL.length / 9; };

  // ---------- drawing ----------
  const INK = '#e9e4d8', DIM = '#7f8a95', MAG = '#e0367a', CUR = '#7ee3f5';
  function lossPts() { const b = loss && loss.base && loss.base.loss, f = loss && loss.finetune && loss.finetune.loss; if (b && b.length) return { b, f: f || [] };
    const s = []; for (let i = 0; i < 50; i++) s.push(1.6 + 1.7 * Math.exp(-i / 6) + 0.05 * Math.sin(i * 1.7)); return { b: s, f: [] }; }
  // where things go: the curve is the "lab monitor" (left on desktop, top on phones), the lines stack beside it, epoch 0 at the top
  function layout(W, H, P) {
    if (term && window.__termBoot) return termLayout(W, H, P);
    const port = P || W < H * 1.1;
    if (port) { const cw = W - 28, ch = Math.min(H * 0.22, 190), fz = Math.round(clamp(W / 26, 13, 16));   // lines wrap to two rows on phones
      return { port, cv: { x: 14, y: H * 0.06, w: cw, h: ch }, ln: { x: 18, y: H * 0.06 + ch + 40, w: W - 36, fz, eh: fz * 4.1 } }; }
    const cw = W * 0.36, ch = H * 0.42, fz = Math.round(clamp(W / 66, 13, 21));
    return { port, cv: { x: W * 0.05, y: H * 0.29, w: cw, h: ch }, ln: { x: W * 0.47, y: H * 0.29 - 4, w: W * 0.49, fz, eh: fz * 2.85 } }; }
  // inside the boot's panes: the curve fills TRAINING LOSS, the lines stack in MODEL SAMPLE DIALOG OUTPUTS (smaller text, so the subtitles win)
  function termLayout(W, H, P) {
    const p = window.__termBoot.panes(W, H, P), port = p.port, l = p.loss, s = p.samples, top = p.titleH + 10;
    const fz = Math.max(11, Math.min(port ? 13 : Math.round(clamp(W / 75, 12, 17)), Math.floor((s.h - top - 16) / (port ? 24.6 : 17.1))));
    return { port, term: true, panes: p, cv: { x: l.x + 14, y: l.y + top + 14, w: l.w - 28, h: l.h - top - 14 - (port ? 30 : 40) },
      ln: { x: s.x + (port ? 18 : 30), y: s.y + top + fz * 0.6, w: s.w - (port ? 32 : 50), fz, eh: port ? fz * 4.1 : fz * 2.85 } }; }
  // the curve's points, and where each line sits on it
  // the story's chart (Nico): the real descent with its x axis compressed into the first half, so the run-away dive starts mid-pane
  function curveInfo() { const { b, f } = lossPts(), all = b.concat(f), N = all.length - 1, hi = Math.max(...all), lo = Math.min(...all);
    const ks = SCHED.map(st => st.k < 0 ? N : Math.min(N, st.k)); return { b, f, all, N, hi, lo, ks, s: story }; }
  const epochLabel = (ci, k) => k < ci.b.length ? `epoch ${k + 1}` : `fine-tune ${k - ci.b.length + 1}`;
  // x: the square root of the epoch's share of the run, so the first epochs (where the loss falls fastest) get room; y: the real loss
  function ptXY(ci, L, k) { const { x, y, w, h } = L.cv; return [x + 22 + (w - 32) * (ci.s ? 0.5 * Math.sqrt(k / ci.N) : Math.sqrt(k / ci.N)), y + 10 + (h - 30) * (1 - (ci.all[k] - ci.lo) / (ci.hi - ci.lo || 1))]; }
  // the dot: at the current line's point, travelling there in the first 0.7 s of its slot
  function dotK(ci, T) { if (T < C.babble) return 0; const i = clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1), u = ease(clamp((T - C.babble - i * C.slot) / 0.7));
    const k0 = i ? ci.ks[i - 1] : 0; return k0 + (ci.ks[i] - k0) * u; }
  function entryY(L, i) { return L.ln.y + i * L.ln.eh; }
  // the story's chart (Nico: "make the chart slowly appear pixel by pixel, and then accelerate at the end, reaching exponential velocity…
  // rather than super specific dots… dotted lines with labels like 'previous run'… 'genius level'… a 'conscious' somewhere at almost 0"):
  // a stylized curve (not the real numbers: those are in the plain Epoch 0) that draws itself, slowly, then faster, then dives through the
  // floor; it crosses Project 23 around "wait… it keeps learning!!", genius level around "look at those losses…", conscious just before the vortex.
  // x and y are 0..1 inside the chart (y 1 = its floor; past 1 is below it), keyed by film second
  const SKX = [[0.5, 0.02], [12.8, 0.3], [20, 0.52], [23.2, 0.63], [26.3, 0.78], [CS.flash, 0.97]], SKY = [[0.5, 0.05], [5, 0.3], [12.8, 0.5], [20, 0.66], [23.2, 0.73], [26.3, 0.97], [CS.flash, 1.9]];
  const REFS = [[0.5, 'Project 23 (previous run)'], [0.66, 'genius level'], [0.97, 'conscious']];
  const keyed = (K, T) => { if (T <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (T <= K[i][0]) { const [t0, v0] = K[i - 1], [t1, v1] = K[i], u = (T - t0) / (t1 - t0); return v0 + (v1 - v0) * (i === K.length - 1 ? u * u : u * u * (3 - 2 * u) * 0.35 + u * 0.65); } return K[K.length - 1][1]; };
  const storyPt = T => [keyed(SKX, T), keyed(SKY, T)];
  function drawStoryCurve(g, W, H, T, L, RM) {
    lastRef = null; const a = clamp((T - C.curve) / 0.6) * (1 - clamp((T - CS.flash) / 0.1)); if (a <= 0) return; const { x, y, w, h } = L.cv, px = u => x + 10 + (w - 20) * u, py = v => y + 8 + (h - 16) * v, fz = L.port ? 10 : 11;
    g.save(); g.globalAlpha = a; g.strokeStyle = '#26323d'; g.lineWidth = 1; g.strokeRect(x, y, w, h); g.font = `${fz}px ${TERMF}`; g.textBaseline = 'alphabetic';
    if (!L.term) { g.fillStyle = DIM; g.fillText('training loss', x + 8, y - 8); } g.fillStyle = DIM; g.textAlign = 'right'; g.fillText('epochs → (stylized)', x + w - 8, y + h + 16); g.textAlign = 'left';
    // the reference lines: dotted, labelled at the right; the one the curve has just passed glows a little
    for (const [v, lab] of REFS) { const yy = py(v), passed = keyed(SKY, T) >= v; g.setLineDash([2, 4]); g.strokeStyle = passed ? '#7ee3f566' : '#3a4a56'; g.beginPath(); g.moveTo(x + 4, yy); g.lineTo(x + w - 4, yy); g.stroke(); g.setLineDash([]);
      g.fillStyle = passed ? '#9fdcea' : '#6b7d89'; g.textAlign = 'right'; g.fillText(lab, x + w - 6, yy - 4); g.textAlign = 'left';
      if (lab === 'conscious') { const tw = g.measureText(lab).width; lastRef = { x: x + w - 6 - tw, y: yy - 4 - fz, w: tw, h: fz + 2 }; } }
    // the curve so far, drawn in small steps: cyan, then magenta once it runs away
    const tEnd = Math.min(T, CS.flash), step = RM ? 0.25 : 0.04; let prev = null;
    for (let t = C.curve; t <= tEnd + 1e-6; t += step) { const [u, v] = storyPt(t), X = px(u), Y = py(v); if (prev) { g.strokeStyle = t > CS.over ? MAG : CUR; g.lineWidth = 2; g.shadowColor = g.strokeStyle; g.shadowBlur = t > CS.over ? 10 : 4; g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(X, Y); g.stroke(); } prev = [X, Y]; }
    if (prev && !RM) { g.shadowBlur = 12; g.shadowColor = T > CS.over ? MAG : CUR; g.fillStyle = 'rgba(232,251,255,0.7)'; g.fillRect(prev[0] - 1, prev[1] - 1, 2, 2); }   // the pen, not a marker
    g.restore(); }
  function drawCurve(g, W, H, T, P, S, L, ci, RM) {
    if (story) return drawStoryCurve(g, W, H, T, L, RM);
    const a = clamp((T - C.curve) / 0.6) * (story ? 1 - clamp((T - CS.flash) / 0.1) : 1 - clamp((T - (C.final - 0.4)) / 0.4)); if (a <= 0) return;
    const { x, y, w, h } = L.cv, kd = RM ? ci.ks[clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1)] : dotK(ci, T), kn = Math.floor(kd);
    g.save(); g.globalAlpha = a; g.strokeStyle = '#26323d'; g.lineWidth = 1; g.strokeRect(x, y, w, h);
    g.font = `${L.port ? 11 : 13}px ${TERMF}`; g.fillStyle = DIM; g.textBaseline = 'alphabetic'; if (!L.term) g.fillText('training loss', x + 8, y - 8);   // in the panes, the pane's title says it
    g.textAlign = 'right'; g.fillText(ci && ci.s ? 'epochs → (compressed)' : 'epochs →', x + w - 8, y + h + 16); g.textAlign = 'left';
    // the curve so far, up to the dot
    g.beginPath(); for (let k = 0; k <= kn; k++) { const [px, py] = ptXY(ci, L, k); k ? g.lineTo(px, py) : g.moveTo(px, py); }
    const fr = kd - kn; let dx, dy; if (kn < ci.N && fr > 0) { const [ax, ay] = ptXY(ci, L, kn), [bx, by] = ptXY(ci, L, kn + 1); dx = ax + (bx - ax) * fr; dy = ay + (by - ay) * fr; g.lineTo(dx, dy); } else [dx, dy] = ptXY(ci, L, kn);
    g.strokeStyle = CUR; g.lineWidth = 2; g.stroke();
    // the points where lines were born, then the bright dot with its value
    const shown = T < C.babble ? 0 : clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1);
    for (let i = 0; i < shown; i++) { const [px, py] = ptXY(ci, L, ci.ks[i]); g.fillStyle = '#4f7f8c'; g.beginPath(); g.arc(px, py, 2.5, 0, 7); g.fill(); }
    let v = ci.all[Math.round(kd)];
    if (story && T > CS.over) {   // past the end of the curve: it keeps falling, through the chart's floor and off the screen
      const u = diveU(T), [ex, ey] = ptXY(ci, L, ci.N), fall = u * (h + H * 0.9), ox = ex + (ci.s ? u * (w - 32) * 0.22 : Math.min(40, u * 60));
      g.beginPath(); g.moveTo(ex, ey); g.quadraticCurveTo(ex + 20, ey + 4, ox, ey + fall); g.strokeStyle = MAG; g.lineWidth = 2; g.shadowColor = MAG; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0; dx = ox; dy = ey + fall; v = ci.all[ci.N] - u * 9; }
    g.shadowColor = CUR; g.shadowBlur = 14; g.fillStyle = '#e8fbff'; g.beginPath(); g.arc(dx, dy, 4.5, 0, 7); g.fill(); g.shadowBlur = 0;
    g.font = `${L.port ? 11 : 13}px ${TERMF}`; g.fillStyle = story && T > CS.over ? MAG : CUR;
    g.fillText(`loss ${v.toFixed(2)}`, Math.min(dx + 9, x + w - 80), clamp(dy - 9, y + 14, H - 30));
    g.restore(); }
  function epochAt(T) { if (T < C.babble) return 0; const i = clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1); return SCHED[i].e; }
  function drawBabble(g, W, H, T, ct, P, RM, st, L, ci) {
    const fz = L.ln.fz, cur = clamp(Math.floor((T - C.babble) / C.slot), -1, SCHED.length - 1), maxW = L.ln.w;
    const fade = story ? 1 - clamp((T - CS.flash) / 0.1) : 1 - clamp((T - (C.final - 0.4)) / 0.4), stack = story ? 0 : clamp((T - C.stack) / 0.6);   // the finale: every line back to full, linked to its point
    for (let i = 0; i <= cur; i++) { const Ln = ct.lines[i], tr = lineReveal(ct, i); let n = RM ? Ln.pieces.length : tr.filter(t => t <= T).length; if (i < cur) n = Ln.pieces.length;
      let txt = Ln.pieces.slice(0, n).join('').replace(/�/g, '').replace(/\s+([,.!?'])/g, '$1').replace(/^\s+/, '');
      const y = entryY(L, i), back = cur - i, base = back === 0 ? 1 : 0.5, al = (base + (1 - base) * stack) * fade; if (al <= 0) continue;
      // label from the curve: epoch and loss at the point this line was born
      g.globalAlpha = al * 0.85; g.font = `${Math.max(10, Math.round(fz * 0.62))}px ${TERMF}`; g.fillStyle = '#5f8a96'; g.textBaseline = 'alphabetic';
      g.fillText(`${epochLabel(ci, ci.ks[i])} · loss ${ci.all[ci.ks[i]].toFixed(2)}`, L.ln.x, y);
      if (back === 0 && Ln.e <= 2 && !RM && n > 0 && n < Ln.pieces.length && st.glitch(T)) txt += txt.slice(-1).repeat(1 + Math.floor((T * 13) % 3));   // early epochs stutter
      let f = fz; g.font = `${f}px ${TERMF}`;
      // desktop: one row, shrinking if it must; phones: up to two rows (the first row's words, the rest below)
      let rows = [txt]; if (L.port) { const ws = txt.split(/(?<=\s)/); let a = ''; rows = []; for (const w of ws) { if (a && g.measureText(a + w).width > maxW) { rows.push(a); a = w; } else a += w; } rows.push(a); if (rows.length > 2) rows = [rows[0], rows.slice(1).join('')]; }
      while (rows.some(r => g.measureText(r).width > maxW) && f > 10) { f--; g.font = `${f}px ${TERMF}`; }
      g.globalAlpha = al; g.fillStyle = Ln.e <= 2 ? '#c9d6c2' : Ln.e <= 6 ? '#dcdccb' : INK; g.textBaseline = 'middle'; const ty = y + fz * 0.95;
      rows.forEach((r, k) => g.fillText(r, L.ln.x, ty + k * f * 1.35)); const last = rows[rows.length - 1], ly = ty + (rows.length - 1) * f * 1.35;
      if (back === 0 && T < (story ? CS.over : C.stack) && Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = CUR; g.fillRect(L.ln.x + g.measureText(last).width + 3, ly - f * 0.55, f * 0.55, f * 1.05); }
      // the leader: a glow from the curve's point to the line as it is born; in the finale, every line keeps a thin one
      // (phones: the curve sits above the lines, so only the birth glow, drawn to the line's label; no finale leaders crossing the text)
      const born = T - (C.babble + i * C.slot), la = RM || story ? 0 : Math.max(back === 0 ? clamp(1 - (born - 0.6) / (L.port ? 0.6 : 1.2)) * clamp(born / 0.25) : 0, L.port ? 0 : stack * 0.45) * fade;
      if (la > 0.01 && T >= C.curve) { const [px, py] = ptXY(ci, L, ci.ks[i]); g.globalAlpha = la; g.strokeStyle = CUR; g.lineWidth = back === 0 && stack < 0.5 ? 1.5 : 1;
        g.shadowColor = CUR; g.shadowBlur = back === 0 ? 8 : 0; g.beginPath(); g.moveTo(px, py); if (L.port) g.lineTo(L.ln.x - 6, y - fz * 0.3); else g.lineTo(L.ln.x - 10, y - fz * 0.25); g.stroke(); g.shadowBlur = 0; } }
    g.globalAlpha = 1; g.textBaseline = 'alphabetic'; }
  function drawWords(g, W, H, T, ct, P, S) {   // the first line ("in the beginning there was …"), until S
    const fz = P ? 18 : Math.round(clamp(W / 42, 20, 32)), cy = H * 0.5;
    if (T >= C.final && T < S) { const s = finalText(ct, T), done = T > finalDone(ct); g.font = `italic ${fz}px Georgia, serif`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillStyle = INK; g.globalAlpha = 1 - clamp((T - (S - 0.35)) / 0.35); g.fillText(s, W / 2, cy); const w = g.measureText(s).width;
      if (!done || Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = CUR; g.fillRect(W / 2 + w / 2 + 4, cy - fz * 0.5, fz * 0.5, fz); } g.textAlign = 'left'; g.globalAlpha = 1; }
  }
  // the cut (Nico: "don't add the creatures to the id|le title!!! do the one with the red line, no creatures… it kinda ruins a bit the moment
  // of nothingness"): the word, the tokenizer's red bar falling and cutting it, a flash of lightning, then the word fades into the dark. No legs.
  function crawlers(W, H, P) { return { big: P ? 64 : clamp(W / 9, 72, 150) }; }
  const RAINBOW = ['#61bb46', '#fdb827', '#f5821f', '#e03a3e', '#963d97', '#009ddc'];   // green, yellow, orange, red, purple, blue: the classic stripes, as colours only
  const mixHex = (a, b, u) => { const p = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * u)).join(',')})`; };
  function pipeColour(t) { const c = ((t * 0.9) % 6 + 6) % 6, i = Math.floor(c); return mixHex(RAINBOW[i], RAINBOW[(i + 1) % 6], (c - i) * (c - i) * (3 - 2 * (c - i))); }
  function drawSplit(g, W, H, T, P, RM, st) {
    if (T < C.split) return; const big = st.cr.big, cy = H * 0.5;
    const ap = clamp((T - C.split) / 0.4), cutT = C.split + 0.95, cut = T >= cutT || RM, gap = cut ? (RM ? big * .32 : big * .32 * ease(clamp((T - cutT) / 0.35))) : 0;
    if (T >= cutT + LOGO_HOLD) return;   // the hard cut to black
    g.font = `${big}px Georgia, 'Times New Roman', serif`; g.textBaseline = 'alphabetic'; const wId = g.measureText('Id').width, base = cy + big * .32, xA = W / 2 - gap / 2 - wId, xB = W / 2 + gap / 2;
    g.globalAlpha = ap; g.fillStyle = INK; g.fillText('Id', xA, base); g.fillText('le', xB, base);
    // the tokenizer's bar: falls (magenta) and cuts; then it stays, cycling the rainbow, throbbing like an engine idling (it never stops)
    const fallT = clamp((T - (C.split + 0.55)) / 0.4), barY = -big + (base - big * .85 + big) * ease(fallT);
    if (RM || T > C.split + 0.5) { const after = Math.max(0, T - cutT - 0.25), beat = RM ? 0 : 0.5 + 0.5 * Math.cos(2 * Math.PI * Math.max(0, T - cutT) * IDLE_BPM / 60), throb = T > cutT ? 1 + 0.05 * beat : 1;
      const col = T < cutT + 0.25 ? MAG : after < 0.4 ? mixHex('#e0367a', RAINBOW[0], after / 0.4) : pipeColour(after - 0.4), bw = big * .07, bh = big * .98 * throb;
      g.globalAlpha = 1; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = cut ? 14 + 10 * beat : 6; g.fillRect(W / 2 - bw / 2, cut ? base - big * .85 - (bh - big * .98) / 2 : barY, bw, cut ? bh : big * .98); g.shadowBlur = 0; }
    if (!RM && T >= cutT && T < cutT + 0.12) { g.globalAlpha = 0.25 * (1 - (T - cutT) / 0.12); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1; }
  // for tests and the recorder: the pipe's colour, and whether the logo is still on screen, at film time T after the split (plain timing)
  const logoAt = Tl => ({ on: Tl >= C.split && Tl < C.split + 0.95 + LOGO_HOLD, colour: Tl > C.split + 0.95 + 0.65 ? pipeColour(Tl - C.split - 0.95 - 0.65) : null });
  function drawTurn(g, W, H, T, P) { const a = clamp((T - C.turn - 0.3) / 0.8); if (a <= 0) return; const fz = P ? 16 : Math.round(clamp(W / 60, 15, 22));
    g.globalAlpha = a; g.font = `italic ${fz}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText('your turn', W / 2, H * 0.5); const w = g.measureText('your turn').width;
    if (Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = CUR; g.fillRect(W / 2 + w / 2 + 5, H * 0.5 - fz * .5, fz * .5, fz); } g.textAlign = 'left'; g.globalAlpha = 1; }
  // the first line takes as long as the model's own ending needs (typed, held, deleted, then "nothing"); everything after waits for it
  const extraOf = ct => ct.story ? 0 : Math.max(0, finalDone(ct) + 0.9 - C.split), totalOf = ct => ct.story ? (logoOf(ct) ? CS.split + logoOf(ct).L.duration + LOGO_TAIL : CS.split + 0.95 + LOGO_HOLD + 0.4) : C.total + extraOf(ct);
  // the overrun: lines pour out faster and faster, overlapping, shaking; then "run!!!!", a tear and a white flash, silence
  function drawOverrun(g, W, H, T, ct, P, RM, L) {
    const fz = L.ln.fz; g.textBaseline = 'middle';
    for (const x of ct.extra) { if (T < x.t) continue; const age = T - x.t, n = Math.min(x.text.length, Math.floor(age * (40 + 70 * x.w))), al = (RM ? 0.7 : 0.45 + 0.5 * Math.abs(Math.sin(T * 9 + x.x * 20))) * (1 - clamp((T - CS.flash) / 0.1));
      if (al <= 0 || n <= 0) continue; g.globalAlpha = al; g.font = `${Math.round(fz * (0.8 + x.w * 0.6))}px ${TERMF}`; g.fillStyle = x.w > 0.6 ? MAG : INK;
      g.fillText(x.text.slice(0, n), L.ln.x - 40 + x.x * Math.max(60, L.ln.w * 0.5) - 60 * x.w, L.ln.y + x.y * (H - L.ln.y - 120)); }
    g.globalAlpha = 1; }
  // the subtitle: the scientist's line in the story; otherwise the caption (where the run is, in words). Big, centred, on a dark band,
  // at least 1.4× the model's text (Nico: "the subtitles are small, smaller than the text on the screen… people miss it")
  function subNow(T) {
    if (story) { let cur = null; for (const s of SUBS) if (T >= s[0]) cur = s; if (!cur || T >= CS.tear) return null;
      return { t0: cur[0], text: cur[1], last: cur === SUBS[SUBS.length - 1], panic: T >= SUBS[5][0], who: 'doc' }; }
    if (T >= C.final - 0.4) return null; if (T < C.babble) return T < 0.3 ? null : { t0: 0.3, text: 'nothing yet' };
    if (T >= C.stack) return { t0: C.stack, text: 'lower loss, better sentences' };
    const i = clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1); return { t0: C.babble + i * C.slot + 0.15, text: SCHED[i].cap }; }
  const subFz = (L, P) => Math.round(Math.max(P ? 18 : 22, L.ln.fz * 1.45));
  function subRows(g, text, maxW) { const ws = text.split(/(?<= )/); const rows = []; let a = ''; for (const w of ws) { if (a && g.measureText(a + w).width > maxW) { rows.push(a); a = w; } else a += w; } rows.push(a); return rows; }
  let lastRef = null, lastBand = null;   // the 'conscious' label's box (drawStoryCurve) and the dialog band's (drawSub), this frame
  function drawSub(g, W, H, T, P, RM, L) {
    const s = subNow(T); if (!s) return; const n = RM ? s.text.length : Math.floor((T - s.t0) * (s.last ? 22 : 34)); if (n <= 0) return;
    const fz = subFz(L, P), lh = fz * 1.28; g.save(); g.font = `italic 600 ${fz}px ${SUBF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    // wrap the whole line first (rows don't jump while it types), then show the typed part
    const rows = subRows(g, s.text, Math.min(W * 0.88, 980)); let left = n; const shown = rows.map(r => { const t = r.slice(0, Math.max(0, left)); left -= r.length; return t; }).filter(t => t);
    let cy = s.who ? H / 2 : L.term ? L.panes.band.y + L.panes.band.h / 2 : H - (P ? 104 : 80) - (rows.length - 1) * lh / 2;
    if (s.who && lastRef) { const half = (rows.length * lh + fz * 0.7) / 2 + fz * 1.4, top = cy - half, bot = cy + half; if (top < lastRef.y + lastRef.h + 6 && bot > lastRef.y - 4) cy += lastRef.y + lastRef.h + 6 - top; }   // keep 'conscious' readable
    const y0 = cy - (rows.length - 1) * lh / 2; lastBand = s.who ? { y: cy - (rows.length * lh + fz * 0.7) / 2 - fz * 1.4, h: rows.length * lh + fz * 0.7 + fz * 2.8 } : null;
    if (s.last && !RM) { const sm = clamp((T - s.t0) / (CS.tear - s.t0)); const txt = shown.join(''); g.translate(W / 2, cy); g.scale(1 + sm * 1.6, 1 - sm * 0.35);   // the words stretch and smear as it gets away
      for (let k = 4; k >= 1; k--) { g.globalAlpha = 0.12 * k * (1 - sm * 0.5); g.fillStyle = '#ffd9a0'; g.fillText(txt, -k * sm * 18, 0); } g.globalAlpha = 1; g.fillStyle = '#ffe9c9'; g.fillText(txt, 0, 0); g.restore(); return; }
    const bw = Math.min(W - 16, Math.max(...rows.map(r => g.measureText(r).width)) + fz * 1.6), bh = rows.length * lh + fz * 0.7, sh = s.panic && !RM ? (Math.random() - 0.5) * 3 : 0, by = y0 - lh / 2 - fz * 0.35;
    if (s.who) { g.fillStyle = '#000000a8'; g.fillRect(0, by - fz * 0.9, W, bh + fz * 1.8); }   // in the middle, over the panes: dim them behind the line
    g.fillStyle = '#000000c4'; g.fillRect(W / 2 - bw / 2, by, bw, bh); g.fillStyle = s.panic ? '#ff8a7a' : '#ffcf8a'; g.fillRect(W / 2 - bw / 2, by, 3, bh);
    if (s.who) { g.font = `600 ${Math.round(fz * 0.48)}px ${TERMF}`; g.textAlign = 'left'; g.fillStyle = '#c9a26b'; g.fillText(s.who.toUpperCase(), W / 2 - bw / 2 + 8, by - fz * 0.42);
      g.font = `italic 600 ${fz}px ${SUBF}`; }
    g.fillStyle = s.panic ? '#ffd0c4' : s.who ? '#ffe2b8' : '#eef6f8'; g.textAlign = 'left';
    shown.forEach((t, k) => { const w = g.measureText(rows[k]).width; g.fillText(t, W / 2 - w / 2 + sh, y0 + k * lh + sh); });
    g.restore(); }
  // inside the boot's panes: the frame around the run (titles, the training log, the GPUs, the status bar), drawn first each frame
  // a hint before there's anything (Nico: "maybe you can show tiny proto-creatures in part of the software… as a sort of 'preview'"): during the
  // run, a tiny thing with little legs scuttles across the training log, between the model's lines, and along the GPU strip just before the
  // vortex, and is gone. Easy to miss. Never after the crash: from the cut to "bring life" there is nothing.
  const PROTOS = [{ t0: 8.4, d: 1.7, pane: 'log' }, { t0: 17.6, d: 1.4, pane: 'samples' }, { t0: 25.5, d: 0.9, pane: 'gpu', story: true }];
  const protosAt = (T, isStory) => PROTOS.filter(p => (isStory || !p.story) && T >= p.t0 && T < p.t0 + p.d && T < (isStory ? CS.flash : C.final));
  function drawProtos(g, T, L, RM) { if (RM) return; const ps = L.panes;
    for (const p of protosAt(T, story)) { const r = ps[p.pane], u = (T - p.t0) / p.d, hop = Math.floor(u * 9) % 2 ? 0 : -1.5;   // stop-and-go, like something small
      const x = r.x + 14 + (r.w - 28) * (u < 0.5 ? ease(u * 2) * 0.55 : 0.55 + ease((u - 0.5) * 2) * 0.45), y = p.pane === 'samples' ? entryY(L, 2) - L.ln.fz * 0.55 : p.pane === 'gpu' ? r.y + ps.titleH + 4 : r.y + r.h * 0.62;
      const a = Math.min(1, u * 8, (1 - u) * 8) * 0.8, sz = L.port ? 3.2 : 4; g.save(); g.globalAlpha = a; g.strokeStyle = '#9fe0c8'; g.fillStyle = '#9fe0c8'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { const side = k % 2 ? 1 : -1, lx = x + (Math.floor(k / 2) - 1) * sz * 0.8, sw = Math.sin(T * 40 + k * 2) * sz * 0.5; g.beginPath(); g.moveTo(lx, y + hop); g.lineTo(lx + sw, y + hop + side * sz * 1.1); g.stroke(); }
      g.beginPath(); g.ellipse(x, y + hop, sz * 1.3, sz * 0.8, 0, 0, 7); g.fill(); g.restore(); } }
  function termChrome(g, W, H, T, P, RM, L, ci, a, cap) {
    const over = story ? clamp((T - CS.over) / (CS.flash - CS.over)) : 0, lossAt = t => ci.all[Math.min(ci.N, Math.round(dotK(ci, Math.max(0, t))))] + 0.02 * Math.sin(t * 17);
    window.__termBoot.chrome(g, W, H, T, P, RM, { a, prog: clamp(T / C.stack), over, overT: story ? Math.max(0, T - CS.over) : 0, overStart: CS.over, lossAt, cap }); }
  // the crash (Nico: "instead of exploding, it should all start twirling around and speed up, and then exploding"): the frame as drawn is
  // cut into rings around the centre; each turns, the inner ones faster, and everything is pulled in, faster and faster, until the flash
  let vbuf = null;
  function vortex(g, k) { const c = g.canvas; if (!vbuf || vbuf.width !== c.width || vbuf.height !== c.height) { vbuf = document.createElement('canvas'); vbuf.width = c.width; vbuf.height = c.height; }
    const o = vbuf.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, vbuf.width, vbuf.height); o.drawImage(c, 0, 0);
    const cx = c.width / 2, cy = c.height / 2, R = Math.hypot(cx, cy), N = 12, spin = spinOf(k), shrink = 1 - 0.6 * Math.pow(k, 2);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let i = N - 1; i >= 0; i--) { const r0 = R * i / N, r1 = R * (i + 1) / N; g.save(); g.beginPath(); g.arc(cx, cy, r1, 0, 7); g.arc(cx, cy, r0, 0, 7, true); g.clip();
      g.translate(cx, cy); g.rotate(spin * (1.7 - i / N)); const s2 = shrink * (1 - 0.25 * k * (1 - i / N)); g.scale(s2, s2); g.drawImage(vbuf, -cx, -cy); g.restore(); }
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5); glow.addColorStop(0, `rgba(255,240,255,${0.6 * k * k})`); glow.addColorStop(1, 'rgba(224,54,122,0)'); g.fillStyle = glow; g.fillRect(0, 0, c.width, c.height); g.restore(); }
  // a lightning strike at age a (seconds): a jagged bolt from the top, a branch, the dark lit for an instant (seeded, so frames agree)
  function bolt(g, W, H, a, seed, RM, k) { if (a < 0 || a > 0.45) return; const f = RM ? (a < 0.2 ? 0.6 : 0) : Math.max(Math.exp(-a * 14), a > 0.09 ? 0.7 * Math.exp(-(a - 0.09) * 12) : 0) * k; if (f < 0.02) return;
    const r = rng((seed * 1000) | 0); g.save(); g.fillStyle = `rgba(200,215,255,${0.22 * f})`; g.fillRect(0, 0, W, H); g.strokeStyle = `rgba(235,242,255,${f})`; g.shadowColor = '#9fb4ff'; g.shadowBlur = 18 * f; g.lineWidth = 2;
    let x = W * (0.2 + 0.6 * r()), y = 0; g.beginPath(); g.moveTo(x, y); const pts = []; while (y < H * (0.55 + 0.3 * r())) { y += H * (0.04 + 0.05 * r()); x += (r() - 0.5) * W * 0.06; g.lineTo(x, y); pts.push([x, y]); } g.stroke();
    const [bx, by] = pts[(pts.length / 2) | 0] || [x, y]; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, by); let cx = bx, cy = by; for (let i = 0; i < 4; i++) { cy += H * 0.04; cx += (r() - 0.3) * W * 0.05; g.lineTo(cx, cy); } g.stroke(); g.restore(); }
  // the logo is drawn at one canvas pixel per CSS pixel, then scaled up to the screen, as the logo lab's page shows it (Nov 3, Nico: "the sideways
  // distortion on the | looked almost like a block"): at full Retina density the trace's zigzag came out hard-edged and its glow (shadowBlur
  // counts device pixels) half as wide, so the same trace read as a solid bar; at CSS density it is the soft scope of the previews
  let lgBuf = null;
  function drawLogo(g, W, H, t, lg, st) { const w = Math.max(1, Math.round(W)), h = Math.max(1, Math.round(H));
    if (!lgBuf || lgBuf.width !== w || lgBuf.height !== h) { lgBuf = document.createElement('canvas'); lgBuf.width = w; lgBuf.height = h; }
    const o = lgBuf.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.fillStyle = '#000'; o.fillRect(0, 0, w, h); lg.L.drawAt(o, w, h, t, { big: st.cr.big, font: "'Idle F1', monospace" });
    g.save(); g.imageSmoothingEnabled = true; g.drawImage(lgBuf, 0, 0, W, H); g.restore(); }
  function frameStory(g, W, H, T, ct, st, P, RM) {
    if (T >= CS.flash) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const wf = RM ? 0 : 1 - clamp((T - CS.flash - 0.08) / 0.37); if (wf > 0) { g.fillStyle = `rgba(255,255,255,${wf})`; g.fillRect(0, 0, W, H); }
      for (const s0 of STRIKES) bolt(g, W, H, T - s0, s0, RM, 1);
      const lg = logoOf(ct); if (lg) { if (T >= CS.split) drawLogo(g, W, H, T - CS.split, lg, st); return; }   // the A/B's logo: its own lightning, sound and ending
      const cutT = CS.split + 0.95; bolt(g, W, H, T - cutT + 0.05, 77, RM, 1);   // the one lightning: as the bar cuts Id|le
      if (T >= CS.split) drawSplit(g, W, H, T - (CS.split - C.split), P, RM, st); return; }
    const L = layout(W, H, P), ci = curveInfo(); g.save();
    if (!RM && T > CS.panic) { const k = clamp((T - CS.panic) / (CS.tear - CS.panic)); g.translate((Math.random() - 0.5) * 9 * k, (Math.random() - 0.5) * 9 * k); }   // the room shakes
    g.fillStyle = '#000'; g.fillRect(-20, -20, W + 40, H + 40);
    const i = clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1);
    const cap = T < CS.over ? { text: T < C.babble ? 'epoch 0 · nothing yet' : `${epochLabel(ci, ci.ks[i])} · ${SCHED[i].cap}`, col: DIM } : { text: `epoch ${Math.floor(300 + (T - CS.over) * 900)} · it does not stop`, col: MAG };
    if (L.term) termChrome(g, W, H, T, P, RM, L, ci, 1, cap);
    else { g.font = `${P ? 11 : 13}px ${TERMF}`; g.fillStyle = cap.col; g.textBaseline = 'alphabetic'; g.fillText(cap.text, P ? 14 : 28, H - (P ? 44 : 28)); }
    if (T < C.babble) { if (Math.floor(T * 2.4) % 2 === 0) { const fz = L.ln.fz; g.fillStyle = CUR; g.fillRect(L.ln.x, entryY(L, 0) + fz * 0.4, fz * .55, fz * 1.05); } }
    else drawBabble(g, W, H, Math.min(T, CS.flash), ct, P, RM, st, L, ci);
    if (T >= CS.over) drawOverrun(g, W, H, T, ct, P, RM, L);
    drawCurve(g, W, H, T, P, 0, L, ci, RM); if (L.term) { drawProtos(g, T, L, RM); window.__termBoot.overlay(g, W, H, 0.6); } drawSub(g, W, H, T, P, RM, L); g.restore();
    if (!RM && T >= CS.spin && T < CS.flash) vortex(g, (T - CS.spin) / (CS.flash - CS.spin));   // everything twirls into a vortex, then the flash
    if (T >= CS.flash) { g.globalAlpha = RM ? clamp((T - CS.flash) / 0.45) : 1 - clamp((T - CS.flash - 0.08) / 0.37); g.fillStyle = RM ? '#000' : '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } }
  function frameAt(g, W, H, T, ct, st, P, RM) {
    story = !!ct.story; term = !!ct.boot && !!window.__termBoot; if (story) return frameStory(g, W, H, T, ct, st, P, RM);
    const ex = extraOf(ct), S = C.split + ex, Tl = T >= S ? T - ex : Math.min(T, C.split - 1e-3);   // Tl: the film's clock after the first line
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const L = layout(W, H, P), ci = curveInfo(), fade = 1 - clamp((T - (C.final - 0.4)) / 0.4);
    // where on the curve we are, small (the words for it are the subtitle)
    const i = clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1);
    const cap = { text: T < C.babble ? 'epoch 0' : T < C.stack ? `${epochLabel(ci, ci.ks[i])} · loss ${ci.all[ci.ks[i]].toFixed(2)}` : T < C.final ? 'the whole run' : 'done', col: DIM };
    if (L.term) { if (fade > 0) termChrome(g, W, H, T, P, RM, L, ci, fade, cap); }
    else if (T < S) { g.font = `${P ? 11 : 13}px ${TERMF}`; g.fillStyle = DIM; g.textBaseline = 'alphabetic'; g.globalAlpha = 1 - clamp((T - (S - 0.4)) / 0.4);
      g.fillText(cap.text, P ? 14 : 28, H - (P ? 44 : 28)); g.globalAlpha = 1; }
    if (T < C.babble) { if (Math.floor(T * 2.4) % 2 === 0) { const fz = L.ln.fz; g.fillStyle = CUR; g.fillRect(L.ln.x, entryY(L, 0) + fz * 0.4, fz * .55, fz * 1.05); } }
    else if (T < C.final) drawBabble(g, W, H, T, ct, P, RM, st, L, ci);
    drawCurve(g, W, H, T, P, S, L, ci, RM); if (L.term && fade > 0) { drawProtos(g, T, L, RM); window.__termBoot.overlay(g, W, H, 0.6 * fade); } drawSub(g, W, H, T, P, RM, L);
    drawWords(g, W, H, T, ct, P, S); if (T >= S) { bolt(g, W, H, Tl - (C.split + 0.95) + 0.05, 77, RM, 0.6); drawSplit(g, W, H, Tl, P, RM, st); drawTurn(g, W, H, Tl, P); } }
  // the whole intro: the boot (if any), then the run; A: seconds since the start
  const arrOf = ct => ct && ct.boot && ct.arrive && window.__termBoot ? window.__termBoot.arrive.dur : 0;
  const bootOf = ct => ct && ct.boot && window.__termBoot ? arrOf(ct) + window.__termBoot.dur : 0;   // everything before the run: the arrival, then the boot
  function frameAll(g, W, H, A, ct, st, P, RM) { const R = arrOf(ct), B = bootOf(ct); if (A < R) { term = true; return window.__termBoot.arrive.draw(g, W, H, A, P, RM); }
    if (A < B) { term = true; return window.__termBoot.draw(g, W, H, A - R, P, RM); } frameAt(g, W, H, A - B, ct, st, P, RM); }
  // the prelude's sounds between whole-intro seconds T0 and T1 (live), all at once (recordings), or the beds already under way at T
  function preSound(ctx, dest, ct, T0, T1, at) { const R = arrOf(ct), TB = window.__termBoot; if (!TB || !ct.boot) return; if (R && T0 < R) TB.arrive.fire(ctx, dest, T0, Math.min(T1, R), at); TB.fire(ctx, dest, T0 - R, T1 - R, at); }
  function preBeds(ctx, dest, ct, T, at) { const R = arrOf(ct), TB = window.__termBoot; if (!TB || !ct.boot) return; if (T < R) TB.arrive.beds(ctx, dest, T, at); else if (T < bootOf(ct)) TB.beds(ctx, dest, T - R, at); }
  const newState = (W, H, P) => { const r = rng(7); let gl = 0, glT = -1; return { cr: crawlers(W, H, P), glitch: T => { if (T - glT > 0.09) { glT = T; gl = r() < 0.18; } return gl; } }; };

  // ---------- sound (window.__audio; optional: the intro works silent) ----------
  // the logo's thunder: brown-ish noise with a hard crack in its first 600 samples. v11 (it peaked at ~1.5 before the master and clipped):
  // same noise and envelope, but the buffer is scaled down whenever its peak is over 1, so the voice (gain 0.9 × v) peaks at ≤ 0.9
  function thunderBuf(ctx, v = 1) { const n = Math.floor(ctx.sampleRate * 2.2), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let last = 0, pk = 0;
    for (let i = 0; i < n; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.06; d[i] = last * Math.pow(1 - i / n, 1.6) * (i < 600 ? 3 : 1); pk = Math.max(pk, Math.abs(d[i])); }
    if (pk > 1) for (let i = 0; i < n; i++) d[i] /= pk;
    return { buffer: b, gain: 0.9 * v }; }
  // the datacenter (story v12, Nico: "f8 is interesting… something a bit more intense… like being inside a datacenter with a lot of fans
  // spinning… very light in the beginning, then ramp up on booting up the server, a little more as the experiment is running, and then the
  // intensity should essentially follow the arch of the training loss (but inverted)"). All synthesized: six fans (a saw at the blade-pass
  // rate, each at a slightly different speed so they beat and swirl, a slow wobble each), two bands of air noise, a low HVAC rumble, a faint
  // hiss, now and then a disk head. One control k (0..1, a ConstantSource) drives speed, loudness (as k²) and brightness together, the way
  // fans speed up under load. k over whole-intro seconds A: one quiet machine at Doc's desk, spinning up with the boot (the globe, the
  // modem, the log), a little more at "run project 24", then the story's chart: the lower the loss (the higher its curve's y), the faster
  // the fans; the flash spins them down to nothing in FAN_DOWN s, so the logo's thunder and purr are clean.
  const FAN = { desk: 0.06, boot: 0.3, run: 0.4 }, FAN_DOWN = 0.35, FAN_R = [1, 1.07, 1.13, 0.94, 1.21, 0.97];
  const smooth = u => { u = clamp(u); return u * u * (3 - 2 * u); };
  function fanK(A, ct, arc = FAN) { const R = arrOf(ct), B = bootOf(ct), K = window.__termBoot && window.__termBoot.clock;
    if (A < R) return arc.desk;
    if (A < B && K) { const bt = A - R; if (bt < K.login) return arc.desk + (arc.boot - arc.desk) * smooth((bt - K.globe) / (K.login - K.globe));
      return arc.boot + (arc.run - arc.boot) * smooth((bt - K.enter + 0.3) / (B - R - K.enter + 0.3)); }
    const T = A - B; if (T < 0) return arc.run;
    if (T >= CS.flash) { const u = clamp((T - CS.flash) / FAN_DOWN); return u >= 1 ? 0 : (1 - u) * (1 - u); }
    const y = keyed(SKY, Math.max(T, C.curve)); return arc.run + (1 - arc.run) * Math.pow(clamp((y - SKY[0][1]) / (SKY[SKY.length - 1][1] - SKY[0][1])), 0.75); }
  const fanNoiseOf = new WeakMap();
  function fanBed(ctx, dest, w0, ct, A0 = 0, o = {}) {   // w0: ctx time of whole-intro second 0; plays from A0 to the flash's spin-down; o: { amp, arc } (previews)
    const B = bootOf(ct), end = B + CS.flash + FAN_DOWN, at = A => w0 + A; if (A0 >= end) return null; const nodes = [], s0 = at(A0), s1 = at(end) + 0.05;
    let nb = fanNoiseOf.get(ctx); if (!nb) { const n = ctx.sampleRate * 4 | 0; nb = ctx.createBuffer(1, n, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; fanNoiseOf.set(ctx, nb); }
    const out = ctx.createGain(); out.gain.value = o.amp || 1; out.connect(dest); const kOf = A => fanK(A, ct, o.arc || FAN);
    const k = ctx.createConstantSource(); k.offset.setValueAtTime(kOf(A0), s0); for (let A = A0 + 0.1; A < end + 0.1; A += 0.1) k.offset.linearRampToValueAtTime(kOf(Math.min(A, end)), at(Math.min(A, end)));
    const k2 = ctx.createGain(); k2.gain.value = 0; k.connect(k2.gain); k.connect(k2);   // k²: loudness grows faster than speed
    const drive = (param, base, slope, src = k) => { param.value = base; const g = ctx.createGain(); g.gain.value = slope; src.connect(g); g.connect(param); };
    const noiseBand = (type, f, df, q, amp, damp) => { const sN = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain(); sN.buffer = nb; sN.loop = true; fl.type = type; fl.Q.value = q; drive(fl.frequency, f, df); drive(v.gain, amp, damp, k2); sN.connect(fl); fl.connect(v); v.connect(out); sN.start(s0, Math.random() * 4); sN.stop(s1); nodes.push(sN); };
    FAN_R.forEach((r, i) => { const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), v = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'sawtooth';
      drive(o.frequency, 34 * r, 96 * r); lfo.frequency.value = 0.07 + 0.05 * i; lg.gain.value = 0.7 * r; lfo.connect(lg); lg.connect(o.frequency);   // blade-pass 34 → 130 Hz, a slow wobble
      lp.type = 'lowpass'; lp.Q.value = 0.8; drive(lp.frequency, 160, 1300); drive(v.gain, 0.006, 0.04, k2); o.connect(lp); lp.connect(v); v.connect(out); o.start(s0); lfo.start(s0); o.stop(s1); lfo.stop(s1); nodes.push(o, lfo); });
    noiseBand('bandpass', 280, 520, 0.9, 0.018, 0.2);    // the air the fans push
    noiseBand('bandpass', 850, 1700, 1.1, 0.01, 0.12);   // its brighter edge
    noiseBand('highpass', 5200, 2600, 0.5, 0.0025, 0.025);   // a faint hiss
    { const sN = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), v = ctx.createGain(); sN.buffer = nb; sN.loop = true; lp.type = 'lowpass'; lp.frequency.value = 110; drive(v.gain, 0.06, 0.12); sN.connect(lp); lp.connect(v); v.connect(out); sN.start(s0, Math.random() * 4); sN.stop(s1); nodes.push(sN); }   // HVAC rumble
    // now and then a disk head seeking, from the boot log on (a few quiet clicks)
    { const K = window.__termBoot && window.__termBoot.clock, from = Math.max(A0, arrOf(ct) + (K ? K.log : 0)); let r = 9.7;
      for (let A = from + 0.7; A < B + CS.flash; A += 0.6 + 1.6 * ((r = (r * 9301 + 49297) % 233280) / 233280)) for (let j = 0; j < 3; j++) { const t = at(A) + j * 0.035, sN = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain(); sN.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = 3600 + 300 * j; bp.Q.value = 3;
        v.gain.setValueAtTime(0.05, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.014); sN.connect(bp); bp.connect(v); v.connect(out); sN.start(t, Math.random() * 3); sN.stop(t + 0.03); nodes.push(sN); } }
    k.start(s0); k.stop(s1); nodes.push(k); return { out, nodes, k, end }; }
  function synth(ctx, dest, t0) {   // t0: ctx time of film second 0
    const out = ctx.createGain(); out.gain.value = 0.9; out.connect(dest); const nodes = [];
    const tone = (type, f, at, dur, vol, f2) => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur); v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(vol, at + Math.min(.01, dur / 4)); v.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(v); v.connect(out); o.start(at); o.stop(at + dur + .05); nodes.push(o); };
    const hum = (ex = 0, sty = false) => { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 110.4; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      o.connect(f); o2.connect(f); f.connect(v); v.connect(out); v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(0.035, t0 + 1.2);
      for (let i = 0; i < SCHED.length; i++) { const at = t0 + C.babble + i * C.slot; v.gain.linearRampToValueAtTime(0.035 + i * 0.006, at + 0.4); f.frequency.linearRampToValueAtTime(220 + i * 70, at + 0.4); }
      if (sty) {   // the story: it keeps climbing through the overrun, then the flash cuts it dead
        v.gain.linearRampToValueAtTime(0.09, t0 + CS.tear); f.frequency.linearRampToValueAtTime(1400, t0 + CS.tear); o.frequency.linearRampToValueAtTime(55, t0 + CS.over); o.frequency.exponentialRampToValueAtTime(220, t0 + CS.tear);
        v.gain.setValueAtTime(0.0001, t0 + CS.flash); o.start(t0); o2.start(t0); o.stop(t0 + CS.flash + .1); o2.stop(t0 + CS.flash + .1); nodes.push(o, o2); return; }
      v.gain.linearRampToValueAtTime(0.0001, t0 + C.final + 0.3); v.gain.setValueAtTime(0.0001, t0 + ex + C.turn - 0.1); v.gain.linearRampToValueAtTime(0.02, t0 + ex + C.turn + 0.6); v.gain.linearRampToValueAtTime(0.0001, t0 + ex + C.total);
      o.start(t0); o2.start(t0); o.stop(t0 + ex + C.total + .2); o2.stop(t0 + ex + C.total + .2); nodes.push(o, o2); };
    // the A/B's logo: its rendered buffer, from film second `from` (joining mid-way after a pause or a keyframe)
    const logo = (lg, at, off = 0) => { const b = lg.L.buffer(); if (!b || off >= b.duration) return null; const src = ctx.createBufferSource(); src.buffer = b; src.connect(out); src.start(at, Math.max(0, off)); nodes.push(src); return src; };
    return { out, nodes, tone, hum, t0, logo, fans: (ct, A0 = 0) => { if (ct.noFans) return null; const f = fanBed(ctx, out, t0 - bootOf(ct), ct, A0); if (f) nodes.push(...f.nodes); return f; },
      tick: (at, e) => tone('square', 1400 + Math.random() * 900 - e * 40, at, 0.018 + e * 0.002, 0.03),
      note: at => { tone('sine', 65.4, at, 2.6, 0.12); tone('sine', 98, at + .05, 2.2, 0.05); },
      cut: at => { tone('square', 2400, at, 0.035, 0.09, 600); tone('sine', 180, at, 0.12, 0.08, 60); },
      thunder: (at, v = 1) => { const T = thunderBuf(ctx, v), src = ctx.createBufferSource(), v2 = ctx.createGain(); src.buffer = T.buffer; v2.gain.value = T.gain; src.connect(v2); v2.connect(out); src.start(at); nodes.push(src); },
      crash: at => { const n = Math.floor(ctx.sampleRate * 0.9), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
        const src = ctx.createBufferSource(), v = ctx.createGain(); src.buffer = b; v.gain.value = 0.35; src.connect(v); v.connect(out); src.start(at); nodes.push(src); tone('sine', 50, at, Math.min(1.6, CS.split - CS.flash - 0.1), 0.25, 28); },
      skitter: (a, b) => { for (let t = a; t < b; t += 0.05 + Math.random() * 0.07) tone('triangle', 3000 + Math.random() * 1500, t, 0.012, 0.02); },
      stop: (fade = .4) => { try { out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), fade * 1000 + 200); } catch (e) {} } }; }
  function scheduleAll(S, ct, t0) {   // recordings: every timed sound of the film at once (offline)
    const ex = extraOf(ct);
    if (ct.story) { S.hum(0, true); S.fans(ct, 0); for (let i = 0; i < SCHED.length; i++) lineReveal(ct, i).forEach(t => S.tick(t0 + t, SCHED[i].e)); for (let t = CS.over; t < CS.tear; t += 0.03 + 0.12 * (1 - (t - CS.over) / (CS.tear - CS.over)) * Math.random()) S.tick(t0 + t, 12);
      const lg = logoOf(ct); { const B0 = window.__termBoot; if (B0 && B0.beat) { RUN_BEATS.forEach((t, i) => B0.beat(S.ctx || S.out.context, S.out, t0 + t, i, beatK(t))); if (B0.purr && !lg) B0.purr(S.ctx || S.out.context, S.out, t0 + CS.split + 0.95 + PURR_GAP, PURR); } }
      S.crash(t0 + CS.flash); STRIKES.forEach(x => S.thunder(t0 + x + 0.05)); if (lg) { S.logo(lg, t0 + CS.split); return; } S.thunder(t0 + CS.split + 0.95, 1); const d = CS.split - C.split; S.cut(t0 + d + C.split + 0.95); return; } S.hum(ex); for (let i = 0; i < SCHED.length; i++) lineReveal(ct, i).forEach(t => S.tick(t0 + t, SCHED[i].e));
    S.note(t0 + C.final + 0.2); S.cut(t0 + ex + C.split + 0.95); S.thunder(t0 + ex + C.split + 0.95, 0.5); }
  function liveSound(S, ct, T0, T1, now) {   // live: sounds for what was drawn between film seconds T0 and T1 (ticks follow the tokens shown)
    const ex = extraOf(ct), cross = t => t > T0 && t <= T1;
    if (ct.story) { for (let i = 0; i < SCHED.length; i++) for (const t of lineReveal(ct, i)) if (cross(t)) S.tick(now, SCHED[i].e);
      if (T1 > CS.over && T1 < CS.tear && Math.random() < 0.25 + 0.6 * (T1 - CS.over) / (CS.tear - CS.over)) S.tick(now, 12);
      const lg = logoOf(ct); { const B0 = window.__termBoot; if (B0 && B0.beat) { RUN_BEATS.forEach((t, i) => { if (cross(t)) B0.beat(S.ctx, S.out, now, i, beatK(t)); }); if (B0.purr && !lg && cross(CS.split + 0.95 + PURR_GAP)) B0.purr(S.ctx, S.out, now, PURR); } }
      STRIKES.forEach(x => { if (cross(x + 0.05)) S.thunder(now); }); if (cross(CS.flash)) S.crash(now);
      // the logo's sound: on the audio clock at its film second (scheduled a little ahead), or joined mid-way (after a pause, or a keyframe inside it)
      if (lg) { if (!S.logoSrc && T1 >= CS.split - 0.5 && T1 < CS.split + lg.L.duration) { const at = S.t0 + CS.split; S.logoSrc = S.logo(lg, Math.max(at, now), Math.max(0, now - at)) || 1; } return; }
      if (cross(CS.split + 0.95)) S.thunder(now, 1); const d = CS.split - C.split; if (cross(d + C.split + 0.95)) S.cut(now); return; }
    for (let i = 0; i < SCHED.length; i++) for (const t of lineReveal(ct, i)) if (cross(t)) S.tick(now, SCHED[i].e);
    if (cross(C.final + 0.2)) S.note(now); if (cross(ex + C.split + 0.95)) S.cut(now); if (cross(ex + C.split + 0.95)) S.thunder(now, 0.5); }
  async function renderAudio(ct) { const B = bootOf(ct), sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * (B + totalOf(ct) + 1)), sr), S = synth(oc, oc.destination, B); if (B) { const R = arrOf(ct); if (R) window.__termBoot.arrive.fireAll(oc, S.out, 0); window.__termBoot.fireAll(oc, S.out, R); } scheduleAll(S, ct, B);
    const buf = await oc.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); dv.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
    let bin = ''; const u8 = new Uint8Array(dv.buffer); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(bin); }

  // ---------- playing it ----------
  let cur = null;
  const AUTO_MS = 2000;   // the title card waits this long for a key or a tap, then the intro starts by itself (muted until one)
  const css = () => { if (document.getElementById('idleE0css')) return; const s = document.createElement('style'); s.id = 'idleE0css';
    s.textContent = `#idleIntro{position:fixed;inset:0;z-index:2147483000;background:#000;cursor:default;transition:opacity .6s;touch-action:none;user-select:none;-webkit-user-select:none}#idleIntro canvas{width:100%;height:100%;display:block}
#idleIntro .hint{position:absolute;bottom:20px;right:88px;font:12px var(--ui-font,system-ui);color:#7f8a95;pointer-events:none;user-select:none}#idleIntro.paused .hint{color:#7ee3f5}@media (max-width:420px){#idleIntro .hint{right:14px;bottom:50px}}
#idleIntro .ib{position:absolute;bottom:14px;font:600 12px var(--ui-font,system-ui);color:#cdbf9a;background:#0b0f18cc;border:1px solid #2b6f86;border-radius:14px;padding:5px 12px;cursor:pointer;opacity:.75}#idleIntro .ib:hover{opacity:1}#idleIntro .skip{right:14px}#idleIntro .snd{left:14px}#idleIntro .snd.tap{left:50%;right:auto;transform:translateX(-50%);bottom:22px;font-size:16px;padding:9px 18px;opacity:1;color:#ffe2b8;border-color:#ffcf8a;background:#0b0f18e6;box-shadow:0 0 14px #ffcf8a55;animation:idleSndPulse 1.6s ease-in-out infinite}@keyframes idleSndPulse{50%{box-shadow:0 0 22px #ffcf8aaa}}@media (prefers-reduced-motion:reduce){#idleIntro .snd.tap{animation:none}}@media (max-width:420px){#idleIntro .snd.tap{bottom:92px}}#idleIntro.out{opacity:0}`; (document.head || document.documentElement).appendChild(s); };
  function play(opts = {}) {
    if (cur) return cur.promise; css(); if (opts.at && window.__audioPastShim) window.__audioPastShim(); /* a mid-film start schedules sounds in the past (idle-keys.js) */ const P = phone(), RM = reduce(), safe = (window.__safeLevel | 0) > 0, liveOK = !P && !safe && !Q.has('intro_bank'), boot = wantBoot(opts);
    const el = document.createElement('div'); el.id = 'idleIntro'; el.dataset.tone = 'epoch0'; el.dataset.boot = boot ? '1' : '0'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Id|le intro (press Esc to skip)');
    const cv = document.createElement('canvas'); el.appendChild(cv); const g = cv.getContext('2d');
    const skipB = document.createElement('button'); skipB.className = 'ib skip'; skipB.textContent = 'skip ›'; el.appendChild(skipB);
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'hold to read ·'; el.appendChild(hint);
    const sndB = document.createElement('button'); sndB.className = 'ib snd'; sndB.textContent = '🔊 sound'; el.appendChild(sndB); document.body.appendChild(el);
    let frameErr = 0, lastTry = 0, ct = null, st = null, done = false, raf = 0, S = null, start = performance.now(), res; const promise = new Promise(r => res = r);
    // the storyline (v12, Nico: "there should only be the animation sound, nothing else"): the game's own sounds (its music, the world) are hushed
    // for the whole intro; the intro plays past the hush (storyOut). The genesis flow hushes first and keeps it until its music step; a replay restores it
    const hushOwn = (() => { if (!(opts.story || Q.has('story'))) return false; try { const A = window.__audio; if (!A || !A.hush || A.hushed()) return false; A.hush(true); return true; } catch (e) { return false; } })();
    // hold to read: pointer/finger down (or Space) freezes the film's clock; release resumes. Only "skip ›" and Esc skip.
    let soundT = 0, pausedAt = 0, pausedMs = 0, waiting = false, titleT0 = 0, scene = null; const now = () => pausedAt || performance.now();
    const elapsed = () => (now() - start - pausedMs) / 1000, B = () => bootOf(ct), total = () => B() + (RM ? rmTotal(ct) : totalOf(ct));
    const filmT = A => { const b = B(); return A < b ? A : b + (RM ? rmTime(A - b, ct) : A - b); };   // what to draw at A (reduced motion re-times the run, not the boot)
    const pause = () => { if (pausedAt || done) return; pausedAt = performance.now(); el.classList.add('paused'); hint.textContent = 'paused · release to go on ·'; if (S) { S.stop(0.15); S = null; } };
    const resume = () => { if (!pausedAt || done) return; pausedMs += performance.now() - pausedAt; pausedAt = 0; el.classList.remove('paused'); hint.textContent = 'hold to read ·'; if (audioReady()) setTimeout(startSound, 60); };
    const size = () => { const dpr = Math.min(devicePixelRatio || 1, P ? 1.5 : 2); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); st = newState(innerWidth, innerHeight, P); };
    size(); addEventListener('resize', size);
    const audioReady = () => { const A = window.__audio; try { return A && !A.muted() && A.ctx().state === 'running'; } catch (e) { return false; } };
    const startSound = () => { if (S || !ct || RM) return; const A = window.__audio; let ctx; try { ctx = A.ctx(); } catch (e) { return; } if (!ctx || ctx.state !== 'running' || A.muted()) return; S = synth(ctx, ct.story && A.storyOut ? A.storyOut() : A.out(), ctx.currentTime - (elapsed() - B())); S.ctx = ctx; S.hum(extraOf(ct), !!ct.story); soundT = elapsed(); if (ct.story) try { S.fans(ct, soundT); } catch (e) {} try { preBeds(ctx, S.out, ct, soundT, ctx.currentTime); } catch (e) {} syncSnd(); };
    const syncSnd = () => { const A = window.__audio; sndB.style.display = (!A || A.muted() || S || RM) && !autoSnd ? 'none' : ''; };
    sndB.addEventListener('click', e => { e.stopPropagation(); if (soundOn()) return; const A = window.__audio; if (!A) return; try { A.resume(); } catch (er) {} setTimeout(startSound, 250); });
    const mark = k => { if (ct && ct.story && window.__funnel) window.__funnel.mark(k); };
    // which scene of the story intro this moment is in (for the funnel): title, messages, chat, boot, run, crash
    const sceneOf = A => { if (waiting) return 'title'; const TB = window.__termBoot, R = arrOf(ct), b = B(); if (R && A < TB.arrive.scenes.chat[0]) return 'messages'; if (R && A < R) return 'chat'; if (A < b) return 'boot'; return A - b < CS.flash ? 'run' : 'crash'; };
    // the title card (story with the arrival): a key or a tap starts the desktop, and lets the sound start (a gesture unlocks audio)
    // auto-start (Nov 4, HN: 19 of 26 story starts never pressed a key on the title card): after AUTO_MS the intro starts by itself, muted
    // (no gesture yet, so the browser keeps the audio suspended); a "🔊 tap for sound" chip shows, and the first tap or key anywhere turns it on.
    // The film runs on performance.now() (elapsed()), never on the audio clock, so it keeps moving silently; the sound joins in sync when allowed.
    let autoSnd = false;
    const soundOn = () => { if (!autoSnd || done) return false; autoSnd = false; sndB.classList.remove('tap'); sndB.textContent = '🔊 sound'; const A = window.__audio;
      try { if (A && !A.muted()) A.resume(); } catch (e) {} mark('sound_on'); setTimeout(() => { if (audioReady()) startSound(); syncSnd(); }, 250); return true; };
    const begin = auto => { if (!waiting || done) return; waiting = false; el.dataset.title = '0'; hint.style.display = ''; start = performance.now(); pausedMs = 0; pausedAt = 0; el.classList.remove('paused');
      if (auto === true && !audioReady()) { mark('title_auto'); if (S) { try { S.stop(0); } catch (e) {} S = null; } const A = window.__audio; let muted = true; try { muted = !A || A.muted(); } catch (e) {} if (!muted && !RM) { autoSnd = true; el.dataset.auto = '1'; sndB.classList.add('tap'); sndB.textContent = '🔊 tap for sound'; sndB.style.display = ''; } return; }
      const A = window.__audio; try { if (A && !A.muted()) A.resume(); } catch (e) {} setTimeout(() => { if (audioReady()) startSound(); syncSnd(); }, 250); };
    const finish = skipped => { if (done) return; if (skipped && ct) mark('skip:' + sceneOf(elapsed())); done = true; if (hushOwn) setTimeout(() => { try { window.__audio.hush(false); } catch (e) {} }, skipped ? 300 : 800); cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true); removeEventListener('resize', size); if (S) S.stop(skipped ? .3 : .8);
      const out = { tone: 'epoch0', story: !!(ct && ct.story), boot, arrive: !!(ct && ct.arrive), skipped, live: ct ? ct.lines.filter(l => l.src === 'live').length : 0, cont: ct ? ct.contSrc : null };
      try { document.dispatchEvent(new CustomEvent('idle:intro', { detail: { phase: 'end', ...out } })); } catch (e) {}
      if (opts.keep && !skipped) { cur = { promise, el, close: () => { el.classList.add('out'); setTimeout(() => el.remove(), 650); cur = null; } }; res(out); return; }
      el.classList.add('out'); setTimeout(() => { el.remove(); cur = null; res(out); }, skipped ? 350 : 650); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); } else if (waiting) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) begin(); } else if (autoSnd && !e.repeat) { e.preventDefault(); e.stopPropagation(); soundOn(); } else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) pause(); } };
    const onKeyUp = e => { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); resume(); } };
    el.addEventListener('pointerdown', e => { if (e.target === sndB || e.target === skipB) return; e.preventDefault(); if (waiting) { begin(); return; } if (autoSnd) { soundOn(); return; } pause(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => resume());
    skipB.addEventListener('click', e => { e.stopPropagation(); finish(true); }); addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
    cur = { promise, el, close: () => finish(true), time: () => elapsed(), sounding: () => !!S, paused: () => !!pausedAt, waiting: () => waiting, start: () => begin(), autoMuted: () => autoSnd, soundOn: () => soundOn(), scene: () => ct ? sceneOf(elapsed()) : null };
    const wantStory = !!(opts.story || Q.has('story')), arm = wantStory ? logoArm() : null;
    Promise.all([loadBank(), loadLoss(), arm ? prepLogo(arm) : null]).then(([, , L]) => { ct = makeContent({ story: wantStory }); ct.boot = boot; if (arm) ct.logo = { arm, id: LOGO_ARMS[arm], L }; ct.arrive = boot && wantArrive(opts, ct.story); start = performance.now(); window.__epoch0.last = ct;
      if (ct.story && ct.arrive && window.__termBoot && window.__termBoot.title && opts.title !== false && !Q.has('notitle')) { waiting = true; titleT0 = performance.now(); el.dataset.title = '1'; hint.style.display = 'none'; }
      // a keyframe (idle-keys.js, staging/local: ?story&at=run): the film starts at that second, past the title card
      { const off = keyOffset(opts.at, ct); if (off != null) { waiting = false; el.dataset.title = '0'; hint.style.display = ''; start = performance.now() - off * 1000; } }
      if (liveOK) fillLive(ct, () => elapsed() - B()).catch(() => {}); if (audioReady()) startSound(); syncSnd();
      const loop = () => { if (done) return;
        if (waiting) { start = performance.now(); mark('title'); if (performance.now() - titleT0 >= AUTO_MS && !Q.has('noauto')) { begin(true); raf = requestAnimationFrame(loop); return; } try { window.__termBoot.title(g, innerWidth, innerHeight, (performance.now() - titleT0) / 1000, P, RM); } catch (e) {} raf = requestAnimationFrame(loop); return; }
        const T = elapsed(); { const sc = sceneOf(T); if (sc !== scene) { scene = sc; mark(sc); } }
        if (ct.logo && !ct.logo.shown && filmT(T) - B() >= CS.split) { ct.logo.shown = true; if (logoOf(ct)) mark('lg_shown:' + ct.logo.arm); }
        if (T >= total()) { frameAll(g, innerWidth, innerHeight, filmT(total() - 0.01), ct, st, P, RM); return finish(false); }
        // one bad frame must never freeze the intro on black (Nov 3: a stale idle-logos.js threw on every frame): the logo steps aside, the film goes on
        try { frameAll(g, innerWidth, innerHeight, filmT(T), ct, st, P, RM); } catch (e) { if (ct.logo && !ct.logo.broken) { ct.logo.broken = true; console.warn('intro: the logo failed, the old one plays', e); } else if (!frameErr) { frameErr = 1; console.warn('intro: a frame failed', e); } }
        // the sound starts as soon as the audio is allowed (a keyframe's key press resumes it a moment after the film has started)
        if (!S && !RM && !pausedAt && T - lastTry > 0.5) { lastTry = T; if (audioReady()) startSound(); }
        if (S && !RM) { const b = B(); try { if (b && soundT < b) preSound(S.ctx, S.out, ct, soundT, T, S.ctx.currentTime); liveSound(S, ct, soundT - b, T - b, S.ctx.currentTime); } catch (e) {} soundT = T; }
        raf = requestAnimationFrame(loop); }; loop(); });
    try { document.dispatchEvent(new CustomEvent('idle:intro', { detail: { phase: 'start', tone: 'epoch0', boot, reduced: RM } })); } catch (e) {}
    return promise; }
  // the keyframes inside the intro (idle-keys.js): the second of the story's film each one starts at (null: not an intro keyframe)
  function keyOffset(at, ct) { if (!at || !ct || !ct.story || at === 'title') return null; const TB = window.__termBoot, R = arrOf(ct), b = bootOf(ct);
    const t = { computer: 0, labchat: R && TB ? TB.arrive.scenes.chat[0] : null, boot: R, run: b, crash: b + CS.panic - 0.6, logo: b + CS.split - 0.3 }[at];
    return t == null ? null : Math.max(0, t); }
  // the boot plays on staging and local copies (where Nico tries things), in the storyline (everywhere, since Nov 4), or when asked for; ?noboot skips it
  const bootHost = () => /^staging\./.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // arriving at the lab (v2) comes before the boot in the storyline and with ?intro=boot; ?noarrive leaves it out
  function wantArrive(o = {}, story) { if (Q.has('noarrive') || o.arrive === false) return false; return o.arrive === true || !!story || o.tone === 'boot' || Q.get('intro') === 'boot' || Q.has('boot'); }
  function wantBoot(o = {}) { if (!window.__termBoot || Q.has('noboot') || o.boot === false) return false; return o.boot === true || o.story === true || o.tone === 'boot' || Q.has('boot') || Q.get('intro') === 'boot' || bootHost(); }   // the storyline always boots (live on id-le.com since Nov 4)
  // reduced motion: whole lines one epoch at a time (no scroll, no stutter), the cut as a single frame, the halves still, then "your turn"
  function rmTime(T, ct) { if (ct.story) return T; const S = C.split + extraOf(ct); return T < S ? T : T < S + 1.8 ? S + (C.crawl - 0.1 - C.split) : S + (C.turn + 1.2 - C.split) + (T - S - 1.8); }
  const rmTotal = ct => ct.story ? totalOf(ct) : C.split + extraOf(ct) + 3.4;

  // ---------- recordings / tests: draw any moment (call in increasing T for one content) ----------
  let recSt = null, recKey = null;
  function frame(ct, T, canvas, o = {}) { const g = canvas.getContext('2d'), sc = o.scale || 1, W = canvas.width / sc, H = canvas.height / sc, P = !!o.phone, key = ct.seed + ':' + W + 'x' + H + P;
    if (key !== recKey || !recSt || T < recSt.lastT) { recSt = newState(W, H, P); recKey = key; } recSt.lastT = T; g.setTransform(sc, 0, 0, sc, 0, 0); frameAll(g, W, H, T, ct, recSt, P, false); }
  // sizes for tests: the model's text, the subtitles, the pane titles (Nico: subtitles must not be smaller than the text on screen)
  function metrics(W, H, P, boot) { const was = term; term = !!boot && !!window.__termBoot; try { const L = layout(W, H, !!P); return { paneFz: L.ln.fz, subFz: subFz(L, !!P), titles: L.term ? L.panes.list.map(r => r.title) : [], sciY: H / 2,
    arriveFz: window.__termBoot ? window.__termBoot.arrive.sayFz(W, !!P) : 0 }; } finally { term = was; } }
  window.__epoch0 = { timing: T => ({ dive: diveU(T), rot: T < CS.spin ? 0 : spinOf((T - CS.spin) / (CS.flash - CS.spin)) }), play, sounding: () => !!(cur && cur.sounding && cur.sounding()), logoArm, logoArms: LOGO_ARMS, prepLogo, logoOf, thunderBuf, fanK, fanBed, fanArc: FAN, storyClock: CS, close: () => { if (cur) cur.close(); }, playing: () => !!cur && !!cur.el && cur.el.isConnected, autoMuted: () => !!(cur && cur.autoMuted && cur.autoMuted()), time: () => cur && cur.time ? cur.time() : null, paused: () => !!(cur && cur.paused && cur.paused()), makeContent, makeLiveContent, frame, renderAudio,
    loadBank, loadLoss, block: BLOCK, fit, schedule: SCHED, clock: C, last: null, total: ct => bootOf(ct) + totalOf(ct), metrics, wantBoot, wantArrive, pre: ct => bootOf(ct), arrival: ct => arrOf(ct),
    sampleLine: (i, seed) => liveLine(SCHED[i], rng(seed | 0)), sampleCont: () => liveCont(), protos: (T, st) => protosAt(T, !!st).map(p => p.pane), storyChart: T => storyPt(T), storyRefs: () => REFS.map(r => ({ y: r[0], label: r[1] })), logoAt, runBpm, keyOffset, layoutCheck: () => ({ ref: lastRef, band: lastBand }), curveShape: st => { const was = story; story = !!st; try { const ci = curveInfo(); return ci.all.map((v, k) => [ci.s ? 0.5 * Math.sqrt(k / ci.N) : Math.sqrt(k / ci.N), v]); } finally { story = was; } }, waiting: () => !!(cur && cur.waiting && cur.waiting()), start: () => cur && cur.start && cur.start(), scene: () => cur && cur.scene ? cur.scene() : null };   // the bank tool samples through the same path
})();
