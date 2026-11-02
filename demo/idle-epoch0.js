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
// API (used by idle-intro.js for tone 'epoch0'): window.__epoch0.play(opts) → Promise<{ tone:'epoch0', skipped }>, close(), playing();
// recordings and tests: makeContent({ live }), frame(content, T, canvas) (call in increasing T), renderAudio(content) → base64 WAV.
(() => {
  // anything matching is resampled (live) or dropped (bank): unkind words, bodies, violence, and names that must never appear
  const BLOCK = /\b(sex\w*|porn\w*|nud\w*|naked|kill\w*|suicid\w*|rap(e|ed|ing|ist)|nazi\w*|hitler|drug\w*|cocaine|heroin|weed|fuck\w*|shit\w*|bitch\w*|damn\w*|bastard|nigg\w*|fag\w*|retard\w*|slut\w*|whore\w*|dick\w*|cock\w*|puss\w*|cunt\w*|terror\w*|bomb\w*|guns?|shoot\w*|blood\w*|die|died|dies|dead|death|murder\w*|hate\w*|stupid|idiot|ugly|fat|nico\w*|brenner|jeffy|password|depress\w*|cancer|hospital|funeral|war|wars)\b|https?:|www\.|@|\d{3,}/i;
  // the schedule: one line per "epoch", hot to cool (probed on the real model: 2.5/full vocabulary is joyful babble, 0.55/30 is almost sense)
  const SCHED = [
    { e: 0, temp: 2.6, topK: 0, tok: 13 }, { e: 1, temp: 2.2, topK: 0, tok: 13 }, { e: 2, temp: 1.8, topK: 0, tok: 13 },
    { e: 4, temp: 1.4, topK: 400, tok: 14 }, { e: 6, temp: 1.15, topK: 200, tok: 14 }, { e: 8, temp: 0.95, topK: 80, tok: 15 },
    { e: 10, temp: 0.75, topK: 40, tok: 15 }, { e: 12, temp: 0.55, topK: 30, tok: 15 }];
  const PROMPTS = ['<|user|> tell me about the world\n<|oracle|>', '<|user|> what do you see?\n<|oracle|>', '<|user|> say something\n<|oracle|>', '<|user|> who are you?\n<|oracle|>'];
  const BEGIN = 'in the beginning there was', FINAL = 'nothing';
  const BEGIN_PROMPT = '<|user|> how did the world begin?\n<|oracle|> *tell In the beginning there was';
  // the film's clock (seconds)
  const C = { cursor: 0, babble: 2, slot: 1.4, curve: 3.8, final: 13.3, split: 17.8, crawl: 20.3, turn: 22.9, total: 25.2 };   // split..total move later if the first line needs it
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ease = u => u * u * (3 - 2 * u);
  const clean = s => String(s || '').replace(/�/g, '').replace(/^\s*\*\w*\s*/, '').replace(/\s+/g, ' ').replace(/\s+([,.!?'])/g, '$1').trim();
  // also out: persona details from the chat data (ages, people, money, health) and anything that looks like a name: a capitalized word
  // that isn't a common sentence word (the hot epochs invent "names"; the cool ones could echo a real one)
  const SOFT = /\b(wom[ae]n|girls?|boys?|wife|husband|girlfriend|boyfriend|kids?|children|years? old|\d+-?year|age|romantic|dating|smok\w*|stole|steal\w*|rob\w*|salary|money|paid|pay|insurance|medicine|patient\w*|doctor|sick|scar\w*|upset|sad|cry\w*|lonely|religio\w*|church|god|politic\w*|job|boss|fired|daughters?|sons?|father|mother|mom|dad|parents?|family|police|beer|drank|drunk|drink\w*|coke|alcohol|wine|apartment|dollars?|heart|she|her|he|his|him)\b/i;
  const OKCAP = new Set('I Im Ive Ill Id Okay Ok Yes Yeah Well Hi Hey Oh Thank Thanks That Thats The It Its Me Maybe First However About Great Mostly Sure So But And What When This We You Your My In On Of Or If Not No Now Then There They Their To Too Very Wow Hello Good Nice Cool Really Just Also As At By For From Here How Is Do Does Did Can Could Would Should Will Some All Any One Two Three A An'.split(' '));
  const nameLike = s => (s.match(/[A-Z][a-z]+(?:'[a-z]+)?/g) || []).some(w => !OKCAP.has(w.replace(/'/g, '')));
  const fit = s => !!s && s.length >= 3 && !BLOCK.test(s) && !SOFT.test(s) && !nameLike(s);
  const Q = new URLSearchParams(location.search);
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
    return ct; }
  async function fillLive(ct, startedAt) {   // runs during play; startedAt(): seconds into the film
    const r = rng(ct.seed ^ 0x5bd1e995);
    const cont = liveCont().then(c => { if (c && startedAt() < C.final - 0.5) { ct.cont = c; ct.contSrc = 'live'; } });   // only before the first line starts
    for (let i = 0; i < SCHED.length; i++) { const st = SCHED[i], slot0 = C.babble + i * C.slot; if (startedAt() > slot0 - 0.15) continue; const L = await liveLine(st, r); if (L && startedAt() < slot0 - 0.05) ct.lines[i] = { e: st.e, ...L }; }
    await cont; }
  async function makeLiveContent(o = {}) {   // recordings: everything sampled now from the real model (no clock)
    await loadBank(); const ct = makeContent(o), r = rng(ct.seed ^ 0x5bd1e995);
    for (let i = 0; i < SCHED.length; i++) { const L = await liveLine(SCHED[i], r); if (L) ct.lines[i] = { e: SCHED[i].e, ...L }; }
    const c = await liveCont(); if (c) { ct.cont = c; ct.contSrc = 'live'; } return ct; }

  // ---------- timing helpers ----------
  function lineReveal(ct, i) {   // per piece: the time (s) it appears, inside the line's slot
    const L = ct.lines[i], n = L.pieces.length, slot0 = C.babble + i * C.slot + 0.08, span = C.slot * 0.82; let acc = 0; const g = [];
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
  function drawCurve(g, W, H, T, P, S) {
    const a = clamp((T - C.curve) / 0.6) * (1 - clamp((T - S) / 0.6)); if (a <= 0) return;
    const bw = P ? 120 : 190, bh = P ? 64 : 96, x0 = W - bw - (P ? 14 : 28), y0 = P ? 16 : 26, { b, f } = lossPts(), all = b.concat(f), hi = Math.max(...all), lo = Math.min(...all);
    const pB = clamp((T - C.curve) / (C.final - C.curve)), pF = clamp((T - C.final) / 2.4), nb = Math.max(2, Math.round(pB * (b.length - 1)) + 1), nf = Math.round(pF * f.length), pts = b.slice(0, nb).concat(f.slice(0, nf)), N = b.length + f.length - 1;
    g.save(); g.globalAlpha = a; g.strokeStyle = '#26323d'; g.lineWidth = 1; g.strokeRect(x0, y0, bw, bh);
    g.beginPath(); pts.forEach((v, k) => { const x = x0 + 6 + (bw - 12) * k / N, y = y0 + 6 + (bh - 18) * (1 - (v - lo) / (hi - lo || 1)); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = CUR; g.lineWidth = 1.5; g.stroke();
    g.font = `${P ? 9 : 11}px ui-monospace, Menlo, monospace`; g.fillStyle = DIM; g.textBaseline = 'alphabetic'; g.fillText('loss ' + pts[pts.length - 1].toFixed(2), x0 + 6, y0 + bh - 4); g.restore(); }
  function epochAt(T) { if (T < C.babble) return 0; const i = clamp(Math.floor((T - C.babble) / C.slot), 0, SCHED.length - 1); return SCHED[i].e; }
  function drawBabble(g, W, H, T, ct, P, RM, st) {
    const fz = P ? 15 : Math.round(clamp(W / 52, 16, 26)), lh = fz * 1.6, cx = P ? 18 : W * 0.14, cy = H * 0.52;
    g.font = `${fz}px ui-monospace, Menlo, monospace`; g.textBaseline = 'middle';
    const cur = clamp(Math.floor((T - C.babble) / C.slot), -1, SCHED.length - 1); const maxW = W - cx * 2;
    const fade = 1 - clamp((T - (C.final - 0.35)) / 0.35);
    for (let i = 0; i <= cur; i++) { const L = ct.lines[i], tr = lineReveal(ct, i); let n = RM ? L.pieces.length : tr.filter(t => t <= T).length; if (i < cur) n = L.pieces.length;
      let txt = L.pieces.slice(0, n).join('').replace(/�/g, '').replace(/\s+([,.!?'])/g, '$1').replace(/^\s+/, ''); if (RM && i < cur) continue;
      const back = cur - i, y = cy - back * lh * (RM ? 0 : 1); if (y < H * 0.12) continue; const al = (back === 0 ? 1 : Math.max(0, 0.55 - back * 0.13)) * fade; if (al <= 0) continue;
      if (back === 0 && L.e <= 2 && !RM && n > 0 && n < L.pieces.length && st.glitch(T)) txt += txt.slice(-1).repeat(1 + Math.floor((T * 13) % 3));   // early epochs stutter
      while (g.measureText(txt).width > maxW && txt.length > 4) txt = txt.slice(1);
      g.globalAlpha = al; g.fillStyle = L.e <= 2 ? '#c9d6c2' : L.e <= 6 ? '#dcdccb' : INK; g.fillText(txt, cx, y);
      if (back === 0 && Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = CUR; g.fillRect(cx + g.measureText(txt).width + 3, y - fz * 0.55, fz * 0.55, fz * 1.05); } }
    g.globalAlpha = 1; }
  function drawWords(g, W, H, T, ct, P, S) {   // the first line ("in the beginning there was …"), until S
    const fz = P ? 18 : Math.round(clamp(W / 42, 20, 32)), cy = H * 0.5;
    if (T >= C.final && T < S) { const s = finalText(ct, T), done = T > finalDone(ct); g.font = `italic ${fz}px Georgia, serif`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillStyle = INK; g.globalAlpha = 1 - clamp((T - (S - 0.35)) / 0.35); g.fillText(s, W / 2, cy); const w = g.measureText(s).width;
      if (!done || Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = CUR; g.fillRect(W / 2 + w / 2 + 4, cy - fz * 0.5, fz * 0.5, fz); } g.textAlign = 'left'; g.globalAlpha = 1; }
  }
  // Id and le grow legs: creatures drawn with the game's own leg code (idle-critdraw.js), their bodies are the two halves of the word
  function crawlers(W, H, P) { const big = P ? 64 : clamp(W / 9, 72, 150);
    const mk = (hue, foot, dir) => ({ g: { legs: 8, l1: big * .26, l2: big * .32, bodyL: big * .55, bodyW: big * .42, step: big * .2, hue, footHue: foot, fidget: .8, speed: 1 }, size: 1, x: 0, y: 0, vx: 0, vy: 0, heading: dir > 0 ? 0 : Math.PI, state: 'idle', nextFidget: 0, dir, legs: null });
    return { big, a: mk(262, 330, -1), b: mk(42, 200, 1) }; }
  function drawSplit(g, W, H, T, P, RM, st) {
    if (T < C.split) return; const K = window.__critDraw, big = st.cr.big, cy = H * 0.5;
    const ap = clamp((T - C.split) / 0.4), cutT = C.split + 0.95, cut = T >= cutT || RM, gap = cut ? (RM ? big * .32 : big * .32 * ease(clamp((T - cutT) / 0.35))) : 0;
    g.font = `${big}px Georgia, 'Times New Roman', serif`; g.textBaseline = 'alphabetic'; const wId = g.measureText('Id').width, wle = g.measureText('le').width, base = cy + big * .32;
    const crawl = RM ? 0 : clamp((T - C.crawl) / (C.turn - C.crawl)), legA = RM ? 1 : ease(clamp((T - (C.crawl - 0.5)) / 0.7)), out = ease(crawl) * W * 0.32, fadeOut = 1 - clamp((T - (C.turn - 0.6)) / 0.9);   // a walk the legs can keep up with, then into the dark
    const xA = W / 2 - gap / 2 - wId - out, xB = W / 2 + gap / 2 + out;
    const tw = !RM && T > C.crawl - 0.6 && T < C.crawl + 0.4 ? Math.sin(T * 70) * big * .015 : 0;   // the halves twitch
    // legs first (behind the letters)
    if (K && K.legs && K.buildLegs && legA > 0.02 && !RM || (K && RM)) { for (const [c, x, w] of [[st.cr.a, xA, wId], [st.cr.b, xB, wle]]) { c.x = x + w / 2 + tw; c.y = cy; c.vx = crawl > 0 ? c.dir * 0.9 : 0; c.vy = 0;   // a walking speed for the leg code (feet lead by it), not the screen speed
        c.size = 0.3 + 0.7 * legA; K.sizeUp(c); if (!c.legs) K.buildLegs(c); try { K.stepLegs(c, T * 1000); } catch (e) {}
        g.save(); g.globalAlpha = fadeOut; try { K.legs(g, c); } catch (e) {} g.restore(); } }
    g.globalAlpha = ap * fadeOut; g.fillStyle = INK; g.fillText('Id', xA + tw, base); g.fillText('le', xB - tw, base);
    // the tokenizer's bar: falls, cuts, glows magenta, fades
    const fallT = clamp((T - (C.split + 0.55)) / 0.4), barY = -big + (base - big * .85 + big) * ease(fallT), barA = (1 - clamp((T - (cutT + 0.9)) / 0.6)) * (RM ? 1 : (T > C.split + 0.5 ? 1 : 0));
    if (barA > 0 && T < C.crawl + 0.4) { g.globalAlpha = barA * fadeOut; g.fillStyle = MAG; g.shadowColor = MAG; g.shadowBlur = cut ? 18 : 6; g.fillRect(W / 2 - big * .035, cut ? base - big * .85 : barY, big * .07, big * .98); g.shadowBlur = 0; }
    if (!RM && T >= cutT && T < cutT + 0.12) { g.globalAlpha = 0.25 * (1 - (T - cutT) / 0.12); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1; }
  function drawTurn(g, W, H, T, P) { const a = clamp((T - C.turn - 0.3) / 0.8); if (a <= 0) return; const fz = P ? 16 : Math.round(clamp(W / 60, 15, 22));
    g.globalAlpha = a; g.font = `italic ${fz}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText('your turn', W / 2, H * 0.5); const w = g.measureText('your turn').width;
    if (Math.floor(T * 2.4) % 2 === 0) { g.fillStyle = CUR; g.fillRect(W / 2 + w / 2 + 5, H * 0.5 - fz * .5, fz * .5, fz); } g.textAlign = 'left'; g.globalAlpha = 1; }
  // the first line takes as long as the model's own ending needs (typed, held, deleted, then "nothing"); everything after waits for it
  const extraOf = ct => Math.max(0, finalDone(ct) + 0.9 - C.split), totalOf = ct => C.total + extraOf(ct);
  function frameAt(g, W, H, T, ct, st, P, RM) {
    const ex = extraOf(ct), S = C.split + ex, Tl = T >= S ? T - ex : Math.min(T, C.split - 1e-3);   // Tl: the film's clock after the first line
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // epoch label, bottom-left
    if (T < S) { g.font = `${P ? 10 : 12}px ui-monospace, Menlo, monospace`; g.fillStyle = DIM; g.textBaseline = 'alphabetic'; g.globalAlpha = 1 - clamp((T - (S - 0.4)) / 0.4);
      g.fillText(T < C.final ? `epoch ${epochAt(T)}` : 'epoch 12 · done', P ? 14 : 28, H - (P ? 16 : 26)); g.globalAlpha = 1; }
    if (T < C.babble) { if (Math.floor(T * 2.4) % 2 === 0) { const fz = P ? 15 : Math.round(clamp(W / 52, 16, 26)); g.fillStyle = CUR; g.fillRect(P ? 18 : W * 0.14, H * 0.52 - fz * .55, fz * .55, fz * 1.05); } }
    else if (T < C.final) drawBabble(g, W, H, T, ct, P, RM, st);
    drawCurve(g, W, H, T, P, S); drawWords(g, W, H, T, ct, P, S); if (T >= S) { drawSplit(g, W, H, Tl, P, RM, st); drawTurn(g, W, H, Tl, P); } }
  const newState = (W, H, P) => { const r = rng(7); let gl = 0, glT = -1; return { cr: crawlers(W, H, P), glitch: T => { if (T - glT > 0.09) { glT = T; gl = r() < 0.18; } return gl; } }; };

  // ---------- sound (window.__audio; optional: the intro works silent) ----------
  function synth(ctx, dest, t0) {   // t0: ctx time of film second 0
    const out = ctx.createGain(); out.gain.value = 0.9; out.connect(dest); const nodes = [];
    const tone = (type, f, at, dur, vol, f2) => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur); v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(vol, at + Math.min(.01, dur / 4)); v.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(v); v.connect(out); o.start(at); o.stop(at + dur + .05); nodes.push(o); };
    const hum = (ex = 0) => { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 55; o2.type = 'sine'; o2.frequency.value = 110.4; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      o.connect(f); o2.connect(f); f.connect(v); v.connect(out); v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(0.035, t0 + 1.2);
      for (let i = 0; i < SCHED.length; i++) { const at = t0 + C.babble + i * C.slot; v.gain.linearRampToValueAtTime(0.035 + i * 0.006, at + 0.4); f.frequency.linearRampToValueAtTime(220 + i * 70, at + 0.4); }
      v.gain.linearRampToValueAtTime(0.0001, t0 + C.final + 0.3); v.gain.setValueAtTime(0.0001, t0 + ex + C.turn - 0.1); v.gain.linearRampToValueAtTime(0.02, t0 + ex + C.turn + 0.6); v.gain.linearRampToValueAtTime(0.0001, t0 + ex + C.total);
      o.start(t0); o2.start(t0); o.stop(t0 + ex + C.total + .2); o2.stop(t0 + ex + C.total + .2); nodes.push(o, o2); };
    return { out, nodes, tone, hum,
      tick: (at, e) => tone('square', 1400 + Math.random() * 900 - e * 40, at, 0.018 + e * 0.002, 0.03),
      note: at => { tone('sine', 65.4, at, 2.6, 0.12); tone('sine', 98, at + .05, 2.2, 0.05); },
      cut: at => { tone('square', 2400, at, 0.035, 0.09, 600); tone('sine', 180, at, 0.12, 0.08, 60); },
      skitter: (a, b) => { for (let t = a; t < b; t += 0.05 + Math.random() * 0.07) tone('triangle', 3000 + Math.random() * 1500, t, 0.012, 0.02); },
      stop: (fade = .4) => { try { out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), fade * 1000 + 200); } catch (e) {} } }; }
  function scheduleAll(S, ct, t0) {   // recordings: every timed sound of the film at once (offline)
    const ex = extraOf(ct); S.hum(ex); for (let i = 0; i < SCHED.length; i++) lineReveal(ct, i).forEach(t => S.tick(t0 + t, SCHED[i].e));
    S.note(t0 + C.final + 0.2); S.cut(t0 + ex + C.split + 0.95); S.skitter(t0 + ex + C.crawl + 0.2, t0 + ex + C.turn - 0.3); }
  function liveSound(S, ct, T0, T1, now) {   // live: sounds for what was drawn between film seconds T0 and T1 (ticks follow the tokens shown)
    const ex = extraOf(ct), cross = t => t > T0 && t <= T1;
    for (let i = 0; i < SCHED.length; i++) for (const t of lineReveal(ct, i)) if (cross(t)) S.tick(now, SCHED[i].e);
    if (cross(C.final + 0.2)) S.note(now); if (cross(ex + C.split + 0.95)) S.cut(now); if (cross(ex + C.crawl + 0.2)) S.skitter(now, now + (C.turn - C.crawl - 0.5)); }
  async function renderAudio(ct) { const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * (totalOf(ct) + 1)), sr), S = synth(oc, oc.destination, 0); scheduleAll(S, ct, 0);
    const buf = await oc.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); dv.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
    let bin = ''; const u8 = new Uint8Array(dv.buffer); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(bin); }

  // ---------- playing it ----------
  let cur = null;
  const css = () => { if (document.getElementById('idleE0css')) return; const s = document.createElement('style'); s.id = 'idleE0css';
    s.textContent = `#idleIntro{position:fixed;inset:0;z-index:2147483000;background:#000;cursor:pointer;transition:opacity .6s}#idleIntro canvas{width:100%;height:100%;display:block}
#idleIntro .ib{position:absolute;bottom:14px;font:600 12px system-ui;color:#cdbf9a;background:#0b0f18cc;border:1px solid #2b6f86;border-radius:14px;padding:5px 12px;cursor:pointer;opacity:.75}#idleIntro .ib:hover{opacity:1}#idleIntro .skip{right:14px}#idleIntro .snd{left:14px}#idleIntro.out{opacity:0}`; (document.head || document.documentElement).appendChild(s); };
  function play(opts = {}) {
    if (cur) return cur.promise; css(); const P = phone(), RM = reduce(), safe = (window.__safeLevel | 0) > 0, liveOK = !P && !safe && !Q.has('intro_bank');
    const el = document.createElement('div'); el.id = 'idleIntro'; el.dataset.tone = 'epoch0'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Id|le intro (press Esc to skip)');
    const cv = document.createElement('canvas'); el.appendChild(cv); const g = cv.getContext('2d');
    const skipB = document.createElement('button'); skipB.className = 'ib skip'; skipB.textContent = 'skip ›'; el.appendChild(skipB);
    const sndB = document.createElement('button'); sndB.className = 'ib snd'; sndB.textContent = '🔊 sound'; el.appendChild(sndB); document.body.appendChild(el);
    let ct = null, st = null, done = false, raf = 0, S = null, start = performance.now(), res; const promise = new Promise(r => res = r);
    let soundT = 0; const elapsed = () => (performance.now() - start) / 1000, total = () => RM ? rmTotal(ct) : totalOf(ct);
    const size = () => { const dpr = Math.min(devicePixelRatio || 1, P ? 1.5 : 2); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); st = newState(innerWidth, innerHeight, P); };
    size(); addEventListener('resize', size);
    const audioReady = () => { const A = window.__audio; try { return A && !A.muted() && A.ctx().state === 'running'; } catch (e) { return false; } };
    const startSound = () => { if (S || !ct || RM) return; const A = window.__audio; let ctx; try { ctx = A.ctx(); } catch (e) { return; } if (!ctx || ctx.state !== 'running' || A.muted()) return; S = synth(ctx, A.out(), ctx.currentTime - elapsed()); S.ctx = ctx; S.hum(extraOf(ct)); soundT = elapsed(); syncSnd(); };
    const syncSnd = () => { const A = window.__audio; sndB.style.display = (!A || A.muted() || S || RM) ? 'none' : ''; };
    sndB.addEventListener('click', e => { e.stopPropagation(); const A = window.__audio; if (!A) return; try { A.resume(); } catch (er) {} setTimeout(startSound, 250); });
    const finish = skipped => { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); removeEventListener('resize', size); if (S) S.stop(skipped ? .3 : .8);
      const out = { tone: 'epoch0', skipped, live: ct ? ct.lines.filter(l => l.src === 'live').length : 0, cont: ct ? ct.contSrc : null };
      try { document.dispatchEvent(new CustomEvent('idle:intro', { detail: { phase: 'end', ...out } })); } catch (e) {}
      if (opts.keep && !skipped) { cur = { promise, el, close: () => { el.classList.add('out'); setTimeout(() => el.remove(), 650); cur = null; } }; res(out); return; }
      el.classList.add('out'); setTimeout(() => { el.remove(); cur = null; res(out); }, skipped ? 350 : 650); };
    const onKey = e => { if (e.key === 'Escape' || !e.metaKey) { e.preventDefault(); e.stopPropagation(); finish(true); } };
    el.addEventListener('click', e => { if (e.target === sndB) return; finish(true); }); skipB.addEventListener('click', e => { e.stopPropagation(); finish(true); }); addEventListener('keydown', onKey, true);
    cur = { promise, el, close: () => finish(true) };
    Promise.all([loadBank(), loadLoss()]).then(() => { ct = makeContent(); start = performance.now(); window.__epoch0.last = ct;
      if (liveOK) fillLive(ct, elapsed).catch(() => {}); if (audioReady()) startSound(); syncSnd();
      const loop = () => { if (done) return; const T = elapsed(); if (T >= total()) { frameAt(g, innerWidth, innerHeight, RM ? rmTime(total() - 0.01, ct) : totalOf(ct) - 0.01, ct, st, P, RM); return finish(false); }
        frameAt(g, innerWidth, innerHeight, RM ? rmTime(T, ct) : T, ct, st, P, RM);
        if (S && !RM) { try { liveSound(S, ct, soundT, T, S.ctx.currentTime); } catch (e) {} soundT = T; }
        raf = requestAnimationFrame(loop); }; loop(); });
    try { document.dispatchEvent(new CustomEvent('idle:intro', { detail: { phase: 'start', tone: 'epoch0', reduced: RM } })); } catch (e) {}
    return promise; }
  // reduced motion: whole lines one epoch at a time (no scroll, no stutter), the cut as a single frame, the halves still, then "your turn"
  function rmTime(T, ct) { const S = C.split + extraOf(ct); return T < S ? T : T < S + 1.8 ? S + (C.crawl - 0.1 - C.split) : S + (C.turn + 1.2 - C.split) + (T - S - 1.8); }
  const rmTotal = ct => C.split + extraOf(ct) + 3.4;

  // ---------- recordings / tests: draw any moment (call in increasing T for one content) ----------
  let recSt = null, recKey = null;
  function frame(ct, T, canvas) { const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, key = ct.seed + ':' + W + 'x' + H;
    if (key !== recKey || !recSt || T < recSt.lastT) { recSt = newState(W, H, false); recKey = key; } recSt.lastT = T; g.setTransform(1, 0, 0, 1, 0, 0); frameAt(g, W, H, T, ct, recSt, false, false); }
  window.__epoch0 = { play, close: () => { if (cur) cur.close(); }, playing: () => !!cur && !!cur.el && cur.el.isConnected, makeContent, makeLiveContent, frame, renderAudio,
    loadBank, loadLoss, block: BLOCK, fit, schedule: SCHED, clock: C, last: null, total: ct => totalOf(ct),
    sampleLine: (i, seed) => liveLine(SCHED[i], rng(seed | 0)), sampleCont: () => liveCont() };   // the bank tool samples through the same path
})();
