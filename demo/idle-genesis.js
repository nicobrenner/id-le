// idle-genesis.js: "in the beginning there was nothing, and then…" (Nico, 2026-11-01). Behind ?genesis (and an A/B switch that ships
// OFF): a first visit starts in the void, after the intro (window.__intro from idle-intro.js, if it is loaded), and the player sits in
// the Operator's chair as the scientist who watches over Id|le universes. The Tiny Operator (or the player's own AI) builds the world
// with them, one visible step at a time.
// The first four steps are GUIDED (Nico: "the start is confusing… maybe the first 3 or 4 steps should be forced as part of the initial
// walkthrough"): light (the stage becomes visible), words, life, then weather or music. One glowing suggestion at a time, the Operator's
// input pre-filled with the exact phrase ("press enter, or say it your own way"); the player's own phrasing goes to the Tiny Operator,
// and if it doesn't understand, one gentle nudge, then the suggested step happens anyway. After four steps: "the rest is yours", every
// chip and the normal UI fade in. While the guide runs the void is calm: no toolbar, places bar, IRC button, minimap, pills or notices.
// After three steps the universe is alive and normal play (and the guided first five minutes, minus what the genesis covered) takes over.
// "🌌 new universe" (⚙ settings) starts a genesis for anyone: the current world is kept as a snapshot first, and every creature that
// isn't one of the two originals is put to rest (rested creatures keep their names, memories and friends). Nothing is ever deleted.
// Actions for the Operator (idle-ai.js tool 'genesis') and the Tiny Operator: window.__genesis.actions.{letThereBeWords, firstCreatures,
// light, weather, hut, music}. Hooks into the world: window.__genHooks (arena.html). Stats: 'gv' (genesis | starter) when the A/B runs,
// and 'gs' (the steps reached, with the seconds each took) from window.__genesis.stats() (idle-stats.js).
(() => {
  const Q = new URLSearchParams(location.search), $ = s => document.querySelector(s), now = () => Date.now();
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AB = 'off';   // the A/B switch: 'on' gives first-time visitors genesis or the starter world 50/50 (stored in this browser only, as idle.gv)
  const KEY = 'idle.genesis', GV = 'idle.gv';
  const H = () => window.__genHooks, W = () => window.__idleWorld;
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  // good first articles for "grow it from Wikipedia" (one is offered at random)
  const TOPICS = ['Octopus', 'Volcano', 'Moon', 'Coffee', 'Bioluminescence', 'Aurora', 'Coral reef', 'Tardigrade', 'Lighthouse', 'Origami'];
  // what the floor grows from when the player just says "let there be words"
  const SEED = 'in the beginning there was nothing and then a word fell and then another and the words found each other and lay down together ' +
    'and became a floor and the floor was quiet and it waited for something to walk on it and remember it';
  // every step, in the order the free console offers them; the guide walks the first four (the fourth: weather OR music)
  const ORDER = ['light', 'words', 'creatures', 'weather', 'music', 'hut'];
  const GUIDE = ['light', 'words', 'creatures', 'sky'];
  const ALIVE_AFTER = 3;
  let topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  // the guided steps: the Tiny Operator's introduction, the one glowing suggestion (also pre-filled in the input), a quiet alternative
  const STEPS = {
    light: { intro: 'it is very dark in here. first, some light', say: 'let there be light', run: () => actions.light() },
    words: { intro: 'a stage, and nothing on it. it needs words', say: () => 'let there be words about ' + topic.toLowerCase(), run: () => actions.letThereBeWords(topic),
      alt: ['about anything', () => actions.letThereBeWords('')] },
    creatures: { intro: 'a floor of words. nobody to walk on it yet', say: 'bring life', run: () => actions.firstCreatures() },
    sky: { intro: 'they will want a sky, or a song', say: 'give it weather', run: () => actions.weather(),
      alt: ['let there be music', () => actions.music()] } };
  // the Tiny Operator's lines after each step (short, warm, no trailing period: the chat style rule)
  const LINES = {
    light: ['light. now there is a stage', 'morning, for the very first time'],
    words: ['words. the floor will remember them', 'there, a floor to stand on. nobody to stand on it yet'],
    creatures: ['two of them crawled out of a word. they look surprised', 'look, something is moving'],
    weather: ['weather. they will have opinions about it', 'the first sky this universe ever had'],
    hut: ['someone wants to build. give it a moment', 'crates and bricks turned up. an Architect is thinking'],
    music: ['music. the floor hums along', 'now it sounds like somewhere'],
    alive: ['it is alive. it does not need us now, but it likes company', 'the universe is running. keep watching'],
    free: ['the rest is yours', 'that is how it starts. the rest is yours'] };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let S = load(), hold = [], busy = false;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  const css = document.createElement('style');
  css.textContent = `html.gen-void #arena,html.gen-void #floor{background-color:#05060b!important;transition:background-color 2.5s}
html.gen-void #floor{background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px)!important;background-size:64px 64px!important}
html.gen-void.gen-lit #arena,html.gen-void.gen-lit #floor{background-color:#121733!important}
html.gen-void.gen-lit #floor{background-image:radial-gradient(120% 60% at 50% 105%,#ffcf8a2e,transparent 60%),linear-gradient(#ffffff16 1px,transparent 1px),linear-gradient(90deg,#ffffff16 1px,transparent 1px)!important;background-size:100% 100%,64px 64px,64px 64px!important}
html.gen-void #daylight,html.gen-void #weather,html.gen-void #buildCv,html.gen-void #lakeCv{opacity:0!important}
html.gen-void.gen-lit #daylight{opacity:.6!important}
html.gen-void :is(#ntf,#notice,#distoast,#whisper,#cline,#studio,#herd,#team,#conn,#advpanel,#dj,#reelpanel,#drawer,#trees,#almanac,#ntfpanel,#roomchat,#capPill,#hwChip,#soundHint){display:none!important}
html.gen-hush :is(#ntf,#notice,#distoast){display:none!important}
html.gen-calm :is(#topbar,#placesBar,#rc-open,#minimap,#zoomer,#lab-toggle,#mbar){opacity:0!important;pointer-events:none!important}
:is(#topbar,#placesBar,#rc-open,#minimap,#zoomer){transition:opacity 1.6s}
html.gen-void #ai-thread>.ai-row.page{display:none}
#arena.gen-night{--bg:#15161a;--ink:#e8e6e1;--floor:#1c1e24;--m-see:#6ab0ff;--m-body:#9a9a9a;--m-want:#ffd54a;--m-feel:#ff7eb6;--m-say:#9be37a;--m-do:#5fd7d7;--m-rem:#c39bff;--m-world:#ffa04d;--m-s:#ffcf7a;--m-n:#7cc4ff;color:var(--ink);color-scheme:dark}
#genConsole{margin:8px 10px 4px;padding:10px 12px;border:1px solid #6b7cff66;border-radius:12px;background:linear-gradient(180deg,#0d1030,#0a0b16);color:#cfd6ff;font:12px ui-monospace,Menlo,monospace}
#genConsole .gt{font-weight:700;letter-spacing:.06em;font-size:11px;opacity:.75;margin-bottom:6px}
#genConsole .gl{font:14px/1.4 Georgia,serif;color:#fff;margin:2px 0 8px}#genConsole .gl b{color:#9fb0ff;font:600 11px ui-monospace,Menlo,monospace;margin-right:6px}
#genConsole .gc{display:flex;flex-wrap:wrap;gap:6px;align-items:center}#genConsole .gc button{font:12px system-ui;padding:5px 10px;border-radius:14px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;cursor:pointer}
#genConsole .gc button:hover{background:#2a3180}#genConsole .gc button[disabled]{opacity:.45;cursor:default}
#genConsole .gc button.glow{border-color:#cfd6ff;box-shadow:0 0 0 0 #9fb0ffaa;animation:genGlow 1.8s ease-in-out infinite;font-weight:600}
#genConsole .gc button.quiet{background:transparent;border-style:dashed;opacity:.8}
#genConsole .gc button.say{font-size:15px;padding:9px 18px;background:#3a46c8;border-color:#cfd6ff}
#genConsole .gh{margin-top:7px;font-size:10.5px;opacity:.7}#genConsole .gs{margin-top:8px;font-size:10.5px;opacity:.55}
#genConsole .gs a{color:inherit;cursor:pointer;text-decoration:underline dotted}
#genConsole .gdots{display:flex;gap:5px;margin:0 0 8px}#genConsole .gdots i{width:7px;height:7px;border-radius:50%;background:#ffffff26}#genConsole .gdots i.on{background:#9fb0ff}#genConsole .gdots i.now{background:#cfd6ff;box-shadow:0 0 8px #9fb0ff}
#genConsole.alive{border-color:#5fd39a66}
@keyframes genGlow{0%,100%{box-shadow:0 0 0 0 #9fb0ff00}50%{box-shadow:0 0 14px 2px #9fb0ffaa}}
#lab-text.gen-pre{border-color:#9fb0ff!important;box-shadow:0 0 0 2px #9fb0ff44}
#genIntro{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;align-items:center;justify-content:center;color:#cfd6ff;font:italic 22px Georgia,serif;letter-spacing:.02em;cursor:pointer;transition:opacity 1.2s}
#genIntro.out{opacity:0;pointer-events:none}
#genDawn{position:absolute;inset:0;z-index:5;pointer-events:none;background:radial-gradient(70% 55% at 50% 100%,#ffd9a0aa,#ffd9a000 70%);opacity:0;animation:genDawn 3.2s ease-out forwards}
@keyframes genDawn{0%{opacity:0}35%{opacity:1}100%{opacity:0}}
.gen-ring{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2px solid #9fb0ff;pointer-events:none;z-index:6;animation:genRing 1.6s ease-out forwards}
@keyframes genRing{from{transform:scale(.3);opacity:1}to{transform:scale(9);opacity:0}}
@media (prefers-reduced-motion: reduce){#genConsole .gc button.glow{animation:none;box-shadow:0 0 10px 1px #9fb0ff88}#genDawn{animation-duration:.01s}}`;
  document.head.appendChild(css);
  const cls = (k, on) => document.documentElement.classList.toggle(k, !!on);
  // before the light the world is drawn in the night palette (arena.html isDark() reads window.__genDark), so anything made out of
  // order (words typed before "let there be light") is still faintly visible on the dark void, whatever the OS theme
  function night(on) { window.__genDark = !!on; const a = $('#arena'); if (a) a.classList.toggle('gen-night', !!on); }

  // ---------- who gets a genesis
  function variant() { if (Q.has('genesis')) return 'genesis'; if (AB !== 'on') return null; let v = null; try { v = localStorage.getItem(GV); } catch (e) {}
    if (v !== 'genesis' && v !== 'starter') { v = Math.random() < 0.5 ? 'genesis' : 'starter'; try { localStorage.setItem(GV, v); } catch (e) {} } return v; }
  // called by the arena for a browser with no world of its own (fresh0), before the guided start would load the starter world
  function wants(fresh0) { if (Q.has('genesis')) return true; return !!fresh0 && variant() === 'genesis'; }

  // ---------- the void: no words, no creatures, a dark floor with a faint grid, and nothing else on screen but the console
  function toVoid() { const h = H(); if (!h) return; cls('gen-void', 1); cls('gen-calm', 1); cls('gen-lit', 0); night(true); window.__genesisVoid = true;
    h.clearAll(); const cs = h.creatures(); hold = cs.splice(0).filter(c => !c.lab);
    try { const w = h.world(); if (Array.isArray(w.features) && w.features.length) { S.feat = w.features; save(); }
      // no day and no weather yet: light and weather are steps; the ground features (streams, caches, 404 holes) wait for the light
      h.applyWorld({ ...w, day: false, weather: 'clear', features: [], id: 'world-' + now().toString(36).slice(-4) }, 'studio'); } catch (e) {}
    for (const c of hold) { if (c.bub) c.bub.classList.remove('on'); if (c.el) c.el.style.visibility = 'hidden'; c.held = false; c.carrying = null; }
    try { const p = h.cam(); h.flyTo(p.x, p.y, innerWidth < 700 ? 0.8 : 1); } catch (e) {} }

  // ---------- the intro (idle-intro.js) or a short fallback line
  async function intro() { if (Q.get('intro') === '0') return; const saveData = navigator.connection && navigator.connection.saveData;
    if (window.__intro && window.__intro.play && !saveData) {
      // Epoch 0 unless ?intro=storm|eerie|epic
      try { await window.__intro.play(Q.get('intro') ? { tone: Q.get('intro') } : {}); return; } catch (e) { console.warn('genesis: intro', e); } }
    await new Promise(res => { const el = document.createElement('div'); el.id = 'genIntro'; el.textContent = 'in the beginning there was nothing'; document.body.appendChild(el);
      const end = () => { el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 1200); }; el.addEventListener('click', end, { once: true });
      setTimeout(end, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1500 : 2600); }); }

  // ---------- the guide: which step is next, and the console that offers it
  const did = k => !!(S && S.steps && S.steps[k]);
  const gDone = g => g === 'sky' ? (did('weather') || did('music')) : did(g);
  const guiding = () => !!(S && S.on && !S.free);
  const nextGuide = () => GUIDE.find(g => !gDone(g)) || null;
  const sayOf = g => { const s = STEPS[g] && STEPS[g].say; return typeof s === 'function' ? s() : s || ''; };
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function input() { return $('#lab-text'); }
  // the input is pre-filled with the guided step's exact phrase; on phones it is not focused (no keyboard pop: the big "▶ say it" sends it)
  function prefill() { const t = input(); if (!t) return; const g = guiding() && nextGuide(); if (!g) { t.classList.remove('gen-pre'); if (t.dataset.genPre && t.value === t.dataset.genPre) t.value = ''; delete t.dataset.genPre; return; }
    const s = sayOf(g); if (!t.value.trim() || t.value === t.dataset.genPre) { t.value = s; t.dataset.genPre = s; }
    t.classList.add('gen-pre'); if (!coarse()) setTimeout(() => { try { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } catch (e) {} }, 60); }
  function openConsole() { const lab = $('#lab'); if (!lab) return; if (!lab.classList.contains('open')) { const t = $('#lab-toggle'); if (t) t.click(); }
    // the console says enough: the Operator's general explanation (and its "new conversation" lines) go, here only
    document.querySelectorAll('#ai-thread > .ai-row.page').forEach(e => e.remove());
    let c = $('#genConsole'); if (!c) { c = document.createElement('div'); c.id = 'genConsole'; const head = $('#lab-head'); if (head && head.nextSibling) lab.insertBefore(c, head.nextSibling); else lab.prepend(c); }
    renderConsole(STEPS[nextGuide() || 'light'].intro); }
  function freeChips() { const out = [];
    if (!did('light')) out.push(['light', 'let there be light']);
    if (!did('words')) out.push(['words', 'let there be words'], ['words:' + topic, 'grow it from Wikipedia: ' + topic]);
    if (did('words') && !did('creatures')) out.push(['creatures', 'bring the first creatures']);
    if (did('creatures') && !did('weather')) out.push(['weather', 'give it weather']); if (did('creatures') && !did('hut')) out.push(['hut', 'build a hut']); if (!did('music')) out.push(['music', 'let there be music']);
    return out; }
  let curLine = '';
  function renderConsole(line) { if (line != null) curLine = line; line = curLine; const c = $('#genConsole'); if (!c) return; const done = ORDER.filter(did).length, alive = S && S.alive;
    c.classList.toggle('alive', !!alive); const g = guiding() && nextGuide();
    let body;
    if (g) { const st = STEPS[g], dots = GUIDE.map(x => `<i class="${gDone(x) ? 'on' : x === g ? 'now' : ''}"></i>`).join('');
      body = `<div class="gdots" title="step ${GUIDE.indexOf(g) + 1} of ${GUIDE.length}">${dots}</div>` +
        `<div class="gc"><button class="glow${coarse() ? ' say' : ''}" data-gsay="1"${busy ? ' disabled' : ''}>${coarse() ? '▶ ' : ''}${esc(sayOf(g))}</button>` +
        (st.alt ? `<button class="quiet" data-galt="1"${busy ? ' disabled' : ''}>${esc(st.alt[0])}</button>` : '') + `</div>` +
        `<div class="gh">${coarse() ? 'tap ▶, or type it your own way below' : 'press enter, or say it your own way'}</div>` +
        `<div class="gs">step ${GUIDE.indexOf(g) + 1} of ${GUIDE.length} · <a data-gskip="1">skip the guide</a></div>`; }
    else body = `<div class="gc">${freeChips().map(([k, t]) => `<button data-gen="${esc(k)}"${busy ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div>` +
      `<div class="gs">${alive ? 'alive · ' : ''}${done} of ${ORDER.length} steps · or type to the Operator: "let there be music"</div>`;
    c.innerHTML = `<div class="gt">🔭 THE SCIENTIST'S CONSOLE · UNIVERSE ${esc((S && S.n) || 1)}</div><div class="gl"><b>TO</b>${esc(line || '')}</div>` + body;
    prefill(); }
  // the console line, and the same line in the Operator's thread (unless the Tiny Operator is mid-reply: it answers in its own voice)
  let quiet = false;
  function say(line) { renderConsole(line); if (quiet) return; try { window.__idleAI && window.__idleAI.add && window.__idleAI.add('TO', line, 'ai'); } catch (e) {} }

  // the chips (free mode), the glowing suggestion and its quiet alternative (guided mode), "skip the guide"
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('#genConsole [data-gen],#genConsole [data-gsay],#genConsole [data-galt],#genConsole [data-gskip]'); if (!t) return;
    if (t.dataset.gskip) { endGuide(true); return; } if (busy) return;
    if (t.dataset.gsay) { const g = nextGuide(); if (g) submit(sayOf(g)); return; }
    if (t.dataset.galt) { const g = nextGuide(); if (g && STEPS[g].alt) runGuided(g, STEPS[g].alt[1], STEPS[g].alt[0]); return; }
    const [k, arg] = t.dataset.gen.split(':'); const A = actions;
    ({ words: () => A.letThereBeWords(arg || ''), creatures: () => A.firstCreatures(), light: () => A.light(), weather: () => A.weather(), hut: () => A.hut(), music: () => A.music() })[k]?.(); });

  // ---------- what the player says while the guide runs
  // Enter in the Operator's input (or the big ▶) comes here first (document capture runs before idle-ai's own listeners). The exact
  // suggested phrase is the same as pressing its chip; anything else goes to the Tiny Operator (or the player's own AI), and if the
  // step didn't happen: one nudge, then the suggestion runs anyway. Words typed out of order (light before words…) are fine: the guide
  // moves on to whatever is still missing.
  const brain = () => { try { return (window.__idleAI && window.__idleAI.cfg && window.__idleAI.cfg().brain) || 'tiny'; } catch (e) { return 'tiny'; } };
  async function runGuided(g, fn, label) { if (busy) return; if (label) try { window.__idleAI && window.__idleAI.add && window.__idleAI.add('you', label, 'you'); } catch (e) {}
    const t = input(); if (t) { t.value = ''; delete t.dataset.genPre; } await fn(); }
  async function submit(text) { const g = nextGuide(); if (!g || busy) return; const t = input(); const said = String(text || '').trim() || sayOf(g);
    if (t) { t.value = ''; delete t.dataset.genPre; }
    if (norm(said) === norm(sayOf(g))) { try { window.dispatchEvent(new CustomEvent('idle:optext', { detail: { text: said, brain: 'guide' } })); } catch (e) {} try { window.__idleAI && window.__idleAI.add && window.__idleAI.add('you', said, 'you'); } catch (e) {} await STEPS[g].run(); return; }
    const before = ORDER.filter(did).length, b = brain(), O = window.__oracle;
    if (b === 'relay' || (b === 'tiny' && !(O && O.ready))) {
      // the local coding-agent line can't build a step, and a sleeping Tiny Oracle can't understand yet: treat it as the suggestion
      try { window.dispatchEvent(new CustomEvent('idle:optext', { detail: { text: said, brain: 'guide' } })); } catch (e) {} try { window.__idleAI.add('you', said, 'you'); } catch (e) {} await STEPS[g].run(); return; }
    if (b === 'tiny') try { window.__idleAI.add('you', said, 'you'); } catch (e) {}
    quiet = true; try { if (b === 'tiny') await window.__idleAI.tiny(said); else await window.__idleAI.send(said); } catch (e) { console.warn('genesis: operator', e); } finally { quiet = false; }
    if (ORDER.filter(did).length > before) return;   // the Operator built something (maybe another step than the suggestion: the guide follows)
    S.nudge = S.nudge || {}; if (!S.nudge[g]) { S.nudge[g] = 1; save(); try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_nudge', extra: { step: g } } })); } catch (e) {} say('try: ' + sayOf(g)); return; }
    await STEPS[g].run(); }
  function onKey(e) { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.target || e.target.id !== 'lab-text' || !guiding() || !nextGuide()) return;
    e.preventDefault(); e.stopImmediatePropagation(); submit(e.target.value); }
  function onSend(e) { const b = e.target.closest && e.target.closest('#lab-send'); if (!b || !guiding() || !nextGuide()) return; e.preventDefault(); e.stopImmediatePropagation(); const t = input(); submit(t ? t.value : ''); }
  document.addEventListener('keydown', onKey, true); document.addEventListener('click', onSend, true);

  // ---------- the end of the guide: everything fades in, the free console takes over; pills and notices wait one more minute
  function endGuide(skipped) { if (!S || S.free) return; S.free = now(); S.skipped = !!skipped; save(); cls('gen-calm', 0); prefill();
    if (!S.alive) { renderConsole(skipped ? 'as you wish. the chips below build the rest' : pick(LINES.free)); return; }
    say(pick(LINES.free)); }
  function hush() { cls('gen-hush', 1); setTimeout(() => cls('gen-hush', 0), 60000); }

  // ---------- the steps
  function done(step, line, at, extra) { S = S || { on: true, steps: {}, t0: now(), n: 1 }; if (S.steps[step]) return; S.steps[step] = now(); save();
    const h = H(), text = { words: 'the first words fell into the void', creatures: 'the first creatures crawled out of a word', light: 'the first light', weather: 'the first weather', hut: 'the first building blocks turned up', music: 'the first music' }[step];
    try { h && h.log('genesis', { step, text, at, ...(extra || {}) }); } catch (e) {}
    try { window.__almanac && window.__almanac.ev('genesis', text, {}); } catch (e) {}
    const n = ORDER.filter(did).length; let ln = line || pick(LINES[step]);
    if (n >= ALIVE_AFTER && !S.alive) { S.alive = now(); save(); alive(); ln = pick(LINES.alive); }
    const g = guiding() && nextGuide();
    if (guiding() && !g) { say(ln); setTimeout(() => endGuide(false), 2200); return; }
    if (g) { say(ln); setTimeout(() => renderConsole(STEPS[g].intro), 1800); } else say(ln); }
  function alive() { window.__genesisVoid = false; const h = H();
    if (hold.length && h) { const cs = h.creatures(); for (const c of hold.splice(0)) { if (c.el) c.el.style.visibility = ''; if (!cs.includes(c)) cs.push(c); } }
    hush(); cls('gen-void', 0); night(false);
    try { window.__first5 && window.__first5.startTrail && window.__first5.startTrail(['hwwiki', S.steps.weather ? 'weather' : null].filter(Boolean)); } catch (e) { console.error(e); }
    setTimeout(() => { try { window.__notify && window.__notify({ kind: 'system', icon: '🌌', html: 'this universe is alive. keep building with the Operator, or just watch', ttl: 9000 }); } catch (e) {} }, 61000); }
  // one step at a time (chips are disabled while one runs); steps call each other's inner versions, never the guarded ones
  const step = async (k, fn) => { if (busy) return 'busy'; busy = true; renderConsole(); try { return await fn(); } catch (e) { console.warn('genesis: ' + k, e); renderConsole('that did not work. try again?'); return null; } finally { busy = false; renderConsole(); } };

  // the words rain in (and condense) from above: the newest words nearest the view first
  function rain(ws) { const h = H(); if (!h || !ws.length) return; const p = h.cam(); const near = ws.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 180);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    near.forEach((w, i) => { try { w.el.animate(calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ translate: '0 -220px', opacity: 0, filter: 'blur(3px)' }, { translate: '0 0', opacity: 1, filter: 'blur(0)' }], { duration: calm ? 600 : 1100, delay: calm ? 0 : i * 9, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); } catch (e) {} }); }
  async function _letThereBeWords(src) { { const h = H(); if (!h) return null; if (did('words')) return 'already';
      let input = String(src || '').trim(), kind = 'text';
      if (/^https?:\/\//i.test(input)) kind = 'page'; else if (input && input.split(/\s+/).length <= 4) { input = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(input.replace(/ /g, '_')); kind = 'wikipedia'; }
      if (!input) input = SEED;
      const before = new Set(h.words()); try { await h.terrainFrom(input); } catch (e) { console.warn('genesis: words', e); }
      let fresh = h.words().filter(w => !before.has(w));
      // offline or the page could not be read: the seed text still makes a floor
      if (!fresh.length && input !== SEED) { kind = 'seed'; await h.terrainFrom(SEED); fresh = h.words().filter(w => !before.has(w)); }
      if (!fresh.length) return null;
      rain(fresh); done('words', null, null, { kind, n: fresh.length }); return fresh.length; } }
  async function _firstCreatures(family) { { const h = H(); if (!h) return null; if (did('creatures')) return 'already';
      // creatures need a floor to crawl out of
      if (!h.words().length) await _letThereBeWords('');
      const p = h.cam(), ws = h.words().filter(w => !w.carriedBy && w.text.length > 2), w = ws.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || { x: p.x, y: p.y };
      ring(w.x, w.y); if (w.el) try { w.el.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 700, iterations: 2 }); } catch (e) {}
      await new Promise(r => setTimeout(r, 650));
      const cs = h.creatures(), names = [];
      const back = hold.splice(0, 2); back.forEach((c, i) => { c.x = c.tx = w.x + (i ? 26 : -26); c.y = c.ty = w.y + 10; if (c.el) c.el.style.visibility = ''; if (!cs.includes(c)) cs.push(c); names.push(c.name); });
      if (!back.length || family) { const n = W() && W().spawn(family || 'crawly'); if (n) names.push(n); }
      if (!names.length) return null;
      done('creatures', null, { x: w.x, y: w.y }, { who: names.join(' and ') }); return names; } }
  function ring(x, y) { const f = $('#floor'); if (!f) return; const r = document.createElement('div'); r.className = 'gen-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; f.appendChild(r); setTimeout(() => r.remove(), 1700); }
  // light: the stage becomes visible (a dawn glow, a brighter grid, a horizon); the world stays in the night palette until it is alive
  async function _light() { { const h = H(); if (!h) return null; if (did('light')) return 'already';
      cls('gen-lit', 1); const a = $('#arena'); if (a && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const d = document.createElement('div'); d.id = 'genDawn'; a.appendChild(d); setTimeout(() => d.remove(), 3400); }
      const w = h.world(); h.applyWorld({ ...w, day: true, ...(S && S.feat && !(w.features || []).length ? { features: S.feat } : {}), id: 'world-' + now().toString(36).slice(-4) }, 'studio');
      done('light'); return true; } }
  async function _weather(kind) { { if (did('weather')) return 'already'; const ks = (W() && W().weathers()) || [];
      const k = ks.includes(kind) ? kind : pick(ks.filter(x => x !== 'clear')) || 'rain'; const r = W() && W().setWeather(k); if (!r) return null; done('weather', null, null, { kind: k }); return r; } }
  async function _hut() { { if (did('hut')) return 'already'; const h = H(); if (!h) return null;
      if (!h.words().length) await _letThereBeWords(''); if (!did('creatures')) await _firstCreatures();
      if (!window.__build || !window.__build._seed) return null; window.__build._seed(); done('hut'); return true; } }
  async function _music() { { if (did('music')) return 'already'; const m = window.__music; if (!m) return null;
      try { window.__audio && window.__audio.wantSound && window.__audio.wantSound(); } catch (e) {} try { m.setSource ? m.setSource('background') : m.setBg(true); } catch (e) { try { m.setBg(true); } catch (e2) { return null; } }
      done('music'); return true; } }
  // every action answers { ok, result } or { error } (the Tiny Operator and the Operator's tools read that shape)
  const answer = r => r === 'busy' ? { error: 'another step is still happening' } : r === 'already' ? { ok: true, already: true } : r ? { ok: true, result: r } : { error: 'that step did not work' };
  const actions = { letThereBeWords: async x => answer(await step('words', () => _letThereBeWords(x))), firstCreatures: async f => answer(await step('creatures', () => _firstCreatures(f))), light: async () => answer(await step('light', _light)),
    weather: async k => answer(await step('weather', () => _weather(k))), hut: async () => answer(await step('hut', _hut)), music: async () => answer(await step('music', _music)) };

  // ---------- stats (idle-stats.js): the steps reached and the seconds each took since the one before (or since the console opened)
  function stats() { if (!S || !S.on || !S.steps) return null; const t0 = S.tc || S.t0, ks = Object.keys(S.steps).sort((a, b) => S.steps[a] - S.steps[b]), out = {}; let prev = t0;
    for (const k of ks) { out[k] = Math.max(0, Math.round((S.steps[k] - prev) / 1000)); prev = S.steps[k]; }
    return { steps: out, end: S.free ? (S.skipped ? 'skipped' : 'guided') : null, opened: !!S.tc }; }

  // ---------- boot (a first visit with ?genesis, or the genesis side of the A/B), and a new universe for anyone
  async function boot() { if (!H()) return false; S = { on: true, steps: {}, t0: now(), n: ((S && S.n) || 0) + 1 }; save(); toVoid(); dropFlag(); await intro();
    S.tc = now(); save(); openConsole(); try { H().log('genesis', { step: 'start' }); } catch (e) {} return true; }
  function dropFlag() { try { const u = new URL(location.href); if (!u.searchParams.has('genesis')) return; u.searchParams.delete('genesis'); u.searchParams.delete('intro'); history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash); } catch (e) {} }
  async function newUniverse() { const h = H(); if (!h) return false;
    if (window.__placeKind && window.__placeKind !== 'home' && window.__places) { try { await window.__places.go('home'); } catch (e) {} }
    // the old world is kept, always
    h.snapshot('before a new universe ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    // everyone but the two originals rests (names, memories and friends kept; wake them from the creatures sidebar)
    h.restAll();
    return boot(); }
  // ?genesis on a browser that already has a world: a new universe (the world is kept as a snapshot first, its creatures rest)
  if (Q.has('genesis')) { let k = 0; const iv = setInterval(() => { if (window.__restoredOrFresh && window.__restored && !window.__genesisVoid) { clearInterval(iv); newUniverse(); } else if (window.__genesisVoid || ++k > 120) clearInterval(iv); }, 500); }

  window.__genesis = { ab: AB, wants, variant, boot, newUniverse, actions, step: k => actions[{ words: 'letThereBeWords', creatures: 'firstCreatures' }[k] || k]?.(), state: () => S && JSON.parse(JSON.stringify(S)),
    steps: ORDER.slice(), guide: GUIDE.slice(), next: () => (guiding() ? nextGuide() : null), say: s => submit(s), skipGuide: () => endGuide(true), stats, void: () => !!window.__genesisVoid, topic: () => topic };
})();
