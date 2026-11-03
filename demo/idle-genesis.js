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
// "🌌 new consciousness" (⚙ settings) starts a genesis for anyone: the current world is kept as a snapshot first, and every creature that
// isn't one of the two originals is put to rest (rested creatures keep their names, memories and friends). Nothing is ever deleted.
// Actions for the Operator (idle-ai.js tool 'genesis') and the Tiny Operator: window.__genesis.actions.{letThereBeWords, firstCreatures,
// light, weather, hut, music}. Hooks into the world: window.__genHooks (arena.html). Stats: 'gv' (genesis | starter) when the A/B runs,
// and 'gs' (the steps reached, with the seconds each took) from window.__genesis.stats() (idle-stats.js).
// The storyline (?story, or "Storyline" in the chooser; Nico's script, storyline-script.md, sections B–E): the Epoch 0 intro in its
// story version (the run that won't stop, the crash), then the Tiny Operator wakes the player up in a lightbox and introduces the job
// ("you've been appointed to see it grow… You have 10 epochs"), "Say: lights on", and the lights reveal a primordial universe (data wind, a
// distant storm, bit comets, odd stars, a small black hole pulling stray letters, a first dawn) that calms as the player builds. Epoch 0
// ends with the lights; Epoch 1 is words and first life; the epochs are a table (DAYS) so the others can be added; Epoch 2 onwards is a stub.
// A chooser (Storyline · From scratch (free) · A ready world) opens any ?genesis start and ⚙ → "new consciousness" (snapshot first, always).
(() => {
  const Q = new URLSearchParams(location.search), $ = s => document.querySelector(s), now = () => Date.now();
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AB = 'off';   // the A/B switch (stays OFF until Nico's go): 'on' gives NEW browsers the storyline or the current start 50/50 (stored in this browser only, as idle.gv: story | current)
  const KEY = 'idle.genesis', GV = 'idle.gv';
  const H = () => window.__genHooks, W = () => window.__idleWorld;
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  // good first articles for "grow it from Wikipedia" (one is offered at random)
  const TOPICS = ['Octopus', 'Volcano', 'Moon', 'Coffee', 'Bioluminescence', 'Aurora', 'Coral reef', 'Tardigrade', 'Lighthouse', 'Origami'];
  // what the floor grows from when the player just says "let there be words"
  // the storyline's first words (v10, Nico: "why 'let there be words about aurora'? it's confusing"): no topic and no fetch, the Tiny
  // Oracle's own first vocabulary, its babble from the run settling into words. Feeding it a topic or a Wikipedia article comes later.
  const FIRST_WORDS = 'light dark hello here now word floor hum warm small quiet again again more why where who you me us run loss epoch ' +
    'twenty four doc stay grow listen remember first something nothing almost think dream wake open close yes no maybe home';
  const SEED = 'in the beginning there was nothing and then a word fell and then another and the words found each other and lay down together ' +
    'and became a floor and the floor was quiet and it waited for something to walk on it and remember it';
  // every step, in the order the free console offers them; the guide walks the first four (the fourth: weather OR music)
  const ORDER = ['light', 'words', 'creatures', 'weather', 'music', 'hut'];
  const GUIDE = ['light', 'words', 'creatures', 'sky'];
  const ALIVE_AFTER = 3;
  let topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  // the guided steps: the Tiny Operator's introduction, the one glowing suggestion (also pre-filled in the input), a quiet alternative
  const STEPS = {
    light: { intro: 'it is very dark in here. first, some light', say: () => storyMode() ? 'lights on' : 'let there be light', run: () => actions.light() },
    words: { intro: () => storyMode() ? 'it has no words yet. say "let there be words"' : 'a stage, and nothing on it. it needs words', say: () => storyMode() ? 'let there be words' : 'let there be words about ' + topic.toLowerCase(),
      run: () => actions.letThereBeWords(storyMode() ? '' : topic), alt: ['about anything', () => actions.letThereBeWords('')] },
    creatures: { intro: () => storyMode() ? 'a floor of words, and nobody to walk on it. say "let there be life"' : 'a floor of words. nobody to walk on it yet', say: () => storyMode() ? 'let there be life' : 'bring life', run: () => actions.firstCreatures() },
    sky: { intro: 'they will want a sky, or a song', say: 'give it weather', run: () => actions.weather(),
      alt: ['let there be music', () => actions.music()] } };
  // the Tiny Operator's lines after each step (short, warm, no trailing period: the chat style rule)
  const LINES = {
    light: ['light. now there is a stage', 'morning, for the very first time'],
    words: ['words. the floor will remember them', 'there, a floor to stand on. nobody to stand on it yet'],
    first: ['its first words. an hour ago they were babble', 'its very first words. it keeps saying them over'],
    creatures: ['two of them crawled out of a word. they look surprised', 'look, something is moving'],
    weather: ['weather. they will have opinions about it', 'the first sky this consciousness ever had'],
    hut: ['someone wants to build. give it a moment', 'crates and bricks turned up. an Architect is thinking'],
    music: ['music. the floor hums along', 'now it sounds like somewhere'],
    alive: ['it is alive. it does not need us now, but it likes company', 'the consciousness is running. keep watching'],
    free: ['the rest is yours', 'that is how it starts. the rest is yours'] };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const storyMode = () => !!(S && S.mode === 'story');
  // the storyline's waking up (Nico's lines, script section B), typed one by one in the Tiny Operator's voice
  // (story v3, final: Nico "perfect! love it"; v4: the first line is about the black hole, Nico: "it only eats worlds"; it comes with the sonar's first ping)
  // (v9, final: Nico "Love your new version, thank you, yes, approved"; the last line ends the opening, with the glowing [ lights on ])
  const WAKE = ['…hey. hey! relax, it only eats worlds', 'you took quite the tumble there, Doc… are you ok?',
    "your run spilled over… this is the consciousness you were training, and you're inside it now",
    "it's fragile. you have 10 epochs to help it grow until it can live on its own, or it fades",
    'first things first: the lights. say "lights on"'];
  const LIGHTS_ON = 'Nice!! we can see something now at least';
  // the epochs (Nico, story v3: "10 epochs, not 6–7 days"; v11: "should it be Epoch0 that they first beat? and they move on to Epoch1"):
  // Epoch 0 · Genesis is the intro, the dark landing, lights on, words and first life, and it is the player's first win (its Gazette);
  // Epoch 1 · Words (tokens, a vocabulary: storyline-script.md section D) and Epochs 2–9 are coming soon. S.day is the epoch reached
  // (0 until Genesis is done), S.days[n] when epoch n was done. Saves from before v11 counted Genesis's words and life as "Epoch 1":
  // load() shifts them down by one (S.ev = 2), so a save that finished the old Epoch 1 has Epoch 0 done.
  const DAYS = [
    { n: 0, title: 'genesis', goals: [['light', 'lights on'], ['words', 'words for a floor'], ['creatures', 'first life']], teaches: 'the Operator, light, words, creatures',
      front: { head: 'Epoch 0: lights, a floor, and somebody on it', body: 'Lights came on in a brand-new consciousness. Words fell and became a floor, and before long two creatures crawled out of one of them. Witnesses describe them as "surprised".' },
      line: 'epoch zero done. it has light, a floor and somebody on it. next: words' },
    { n: 1, title: 'words', goals: [], teaches: '' },
    ...[2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ n, title: 'coming soon', goals: [], teaches: '' }))];
  const dayOf = n => DAYS.find(d => d.n === n);
  // what the storyline shows, epoch by epoch (v10, Nico: "only show the other controls/panels as the user goes through the Epochs and
  // 'unlocks' access to the different features"; script section D). One row per feature: the epoch that unlocks it, what it hides until
  // then. The epoch reached is S.day (Epoch 0 until Genesis is done, then 1…); later epochs only edit this table. null = never in the storyline.
  // (v11: Genesis became Epoch 0, so every row moved down one: the player gets the same tools at the same moment as in v10)
  // Free play and the ready world never see any of this (html.gen-story is set only while the storyline runs).
  const UNLOCK = [
    ['pedia', 0, '#pediaBtn'], ['settings', 0, '#settingsBtn'], ['scientists', 0, '#oracleBtn'], ['zoom', 0, '#zoomer'],
    ['creatures', 1, '#herdBtn'], ['irc', 1, '#rc-open'], ['notices', 1, '#ntfBtn'], ['minimap', 1, '#minimap'],
    ['weather', 2, '#weatherLabel'], ['studio', 2, '#studioBtn'], ['advisor', 2, '#advBtn,#advnote'], ['music', 2, '#djBtn,#sndWrap'],
    ['evolve', 3, '#evolveWorldBtn'], ['trees', 3, '#treesBtn'], ['grow', 3, '#arena>.grow'],
    ['reels', 5, '#reelsBtn,#reelnote'], ['drawer', 5, '#drawerBtn'], ['almanac', 5, '#almanacBtn'], ['snapshots', 5, '#snapBtn'],
    ['places', 6, '#placesBar'], ['connect', 6, '#connBtn'], ['keep', 6, '#keepDetail'],
    ['data lab', 7, '#labBtn,#placesBar [data-kind=lab]'],
    ['gloamhold', null, '#placesBar [data-kind=keep]']];
  // the free console's chips, by the same rule (the step: the epoch that unlocks it)
  const CHIP_AT = { weather: 2, music: 2, hut: 4 };
  const epochReached = () => (S && S.day) || 0;
  const unlocked = k => { if (!storyMode()) return true; const r = UNLOCK.find(x => x[0] === k); if (r) return r[1] != null && r[1] <= epochReached(); const c = CHIP_AT[k]; return c == null || c <= epochReached(); };
  function applyUnlocks() { const on = storyMode() && !!S.on; document.documentElement.classList.toggle('gen-story', on);
    let st = document.getElementById('genUnlock'); if (!st) { st = document.createElement('style'); st.id = 'genUnlock'; document.head.appendChild(st); }
    const e = epochReached(); st.textContent = on ? UNLOCK.filter(r => r[1] == null || r[1] > e).map(r => r[2].split(',').map(x => 'html.gen-story ' + x.trim()).join(',')).join(',') + '{display:none!important}' : '';
    document.documentElement.dataset.epoch = on ? String(e) : ''; }
  let S = load(), hold = [], busy = false, lifeNow = false;
  // no creature may appear in the storyline before its life step (the world's spawn asks this; arena.html window.__idleWorld.spawn)
  const noLife = () => !!(S && S.on && S.mode === 'story' && !(S.steps && S.steps.creatures) && !lifeNow);
  function load() { let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } return migrate(s); }
  // v11: a save from before Genesis became Epoch 0 counts one epoch higher; shift it down (old day n → n-1, old days[n] → days[n-1]),
  // keep the old numbers beside it (S.v10), and write it back. Nothing is dropped.
  function migrate(s) { if (!s || typeof s !== 'object' || s.ev >= 2) return s; const old = { day: s.day, days: s.days };
    if (s.day != null) s.day = Math.max(0, s.day - 1); if (s.days) { const d = {}; for (const [k, v] of Object.entries(s.days)) d[Math.max(0, +k - 1)] = v; s.days = d; }
    s.ev = 2; if (old.day != null || old.days) s.v10 = old; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} return s; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  { const c2 = document.createElement('style'); c2.textContent = `html.gen-landing body{background:#000!important}
html.gen-landing body>*:not(#arena):not(#genNight):not(#genNightSkip):not(#genArrive):not(#idleIntro):not(#genBlack):not(script):not(style){visibility:hidden!important}
html.gen-landing #arena button,html.gen-landing #arena [role=button],html.gen-landing #arena .chip,html.gen-landing #arena .chips{visibility:hidden!important}html.gen-landing #arena{box-shadow:none!important;border-color:#000!important}`; document.head.appendChild(c2); }
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
:root{--op-font:Georgia,serif}#genConsole .gl{font:17px/1.45 var(--op-font);color:#fff;margin:2px 0 8px}@media (max-width:600px){#genConsole .gl,#genConsole .gw p{font-size:16px}}#genConsole .gl b{color:#9fb0ff;font:600 11px ui-monospace,Menlo,monospace;margin-right:6px}
#genConsole .gc{display:flex;flex-wrap:wrap;gap:6px;align-items:center}#genConsole .gc button{font:12px var(--ui-font,system-ui);padding:5px 10px;border-radius:14px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;cursor:pointer}
#genConsole .gc button:hover{background:#2a3180}#genConsole .gc button[disabled]{opacity:.45;cursor:default}
#genConsole .gc button.glow{border-color:#cfd6ff;box-shadow:0 0 0 0 #9fb0ffaa;animation:genGlow 1.8s ease-in-out infinite;font-weight:600}
#genConsole .gc button.quiet{background:transparent;border-style:dashed;opacity:.8}
#genConsole .gc button.say{font-size:15px;padding:9px 18px;background:#3a46c8;border-color:#cfd6ff}
#genConsole .gor{margin-bottom:6px}#genConsole .gh{margin-top:7px;font-size:10.5px;opacity:.7}#genConsole .gs{margin-top:8px;font-size:10.5px;opacity:.55}
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
#genConsole .gw p{font:17px/1.45 var(--op-font);color:#fff;margin:2px 0 8px}#genConsole .gw p b{color:#9fb0ff;font:600 11px ui-monospace,Menlo,monospace;margin-right:6px}
#genConsole .gcur{display:inline-block;width:.5em;height:1em;margin-left:2px;vertical-align:-2px;background:#7ee3f5;animation:genBlink 1s steps(2) infinite}
@keyframes genBlink{50%{opacity:0}}
#genBackdrop{position:fixed;inset:0;z-index:2147481990;background:#02030acc;backdrop-filter:blur(2px);transition:opacity 1.2s}#genBackdrop.out{opacity:0;pointer-events:none}
html.gen-box #lab{position:fixed!important;left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%)!important;width:min(620px,94vw)!important;height:auto!important;max-height:84vh!important;z-index:2147482000!important;border-radius:16px!important;box-shadow:0 24px 90px #000e,0 0 0 1px #6b7cff55!important;overflow:auto!important}
html.gen-box #lab :is(#ai-thread,#lab-thread,#ai-bar,#ai-set,#ai-smart-btn,#ai-smart){display:none!important}
#genChoose{position:fixed;inset:0;z-index:2147483100;background:radial-gradient(90% 70% at 50% 40%,#0d1030,#020208);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:20px;color:#cfd6ff;font:14px var(--ui-font,system-ui);transition:opacity .6s}
#genChoose.out{opacity:0;pointer-events:none}#genChoose h2{font:italic 26px Georgia,serif;color:#fff;margin:0;letter-spacing:.01em}#genChoose .sub{opacity:.7;margin:-8px 0 6px}
#genChoose .opts{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:860px}
#genChoose button{width:250px;text-align:left;padding:16px 18px;border-radius:14px;border:1px solid #8ea0ff55;background:#11143acc;color:#fff;cursor:pointer;font:13px/1.45 var(--ui-font,system-ui)}
#genChoose button:hover,#genChoose button:focus-visible{border-color:#cfd6ff;background:#1a1f55;outline:none}#genChoose button b{display:block;font:600 16px var(--ui-font,system-ui);margin-bottom:6px}
#genChoose button.rec{border-color:#cfd6ff;box-shadow:0 0 18px #9fb0ff55}#genChoose button small{opacity:.7}
@media (max-width:600px){#genChoose button{width:100%}#genChoose .opts{flex-direction:column;width:100%}}
#genDay{position:fixed;left:14px;top:14px;z-index:40;min-width:200px;max-width:min(300px,70vw);padding:10px 12px;border-radius:12px;background:#0a0b16e6;border:1px solid #6b7cff66;color:#cfd6ff;font:12px ui-monospace,Menlo,monospace;transition:opacity .8s}
#genDay .dt{font-weight:700;letter-spacing:.08em;font-size:11px;opacity:.8;margin-bottom:6px}#genDay li{list-style:none;margin:3px 0}#genDay ul{margin:0;padding:0}#genDay li.ok{color:#8fe3b4}#genDay li.ok:before{content:'✓ '}#genDay li:not(.ok):before{content:'○ '}
#genDay .dn{margin-top:6px;opacity:.6;font-size:10.5px}#genDay .wip{margin-top:4px;font-size:11px;line-height:1.45;color:#cfd6ff}#genDay .wip a{color:#9fd8ff}#genDay.soon li:before{content:'· '}#genDay .x{position:absolute;right:8px;top:6px;cursor:pointer;opacity:.6;background:none;border:0;color:inherit}
@media (max-width:600px){#genDay{top:auto;bottom:calc(72dvh + 8px);left:8px}}
#genFront{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;background:#02030aa8;padding:16px}
#genFront .np{max-width:520px;background:#f4ecd8;color:#1c1712;border-radius:6px;padding:20px 24px;box-shadow:0 30px 90px #000c;font:15px/1.5 Georgia,serif;transform:rotate(-1.2deg)}
#genFront .mh{font:900 26px/1 Georgia,serif;letter-spacing:.02em;text-align:center;border-bottom:3px double #1c1712;padding-bottom:8px}#genFront .md{font:11px ui-monospace,Menlo,monospace;text-align:center;margin:6px 0 12px;opacity:.7}
#genFront .ec{font:700 15px/1 var(--display-font,ui-monospace,Menlo,monospace);letter-spacing:.12em;text-align:center;color:#8a1c2b;border:2px solid #8a1c2b;border-radius:4px;padding:6px 8px;margin:2px auto 10px;width:max-content;transform:rotate(1.5deg)}#genFront h3{font:700 22px/1.2 Georgia,serif;margin:6px 0 8px}#genFront .to{margin-top:12px;font-style:italic;opacity:.8}#genFront button{margin-top:14px;font:13px var(--ui-font,system-ui);padding:6px 14px;border-radius:12px;border:1px solid #1c1712;background:#1c1712;color:#f4ecd8;cursor:pointer}
#genCosmos{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;transition:opacity 4s}
html.gen-cosmos.gen-cosmos.gen-cosmos #arena,html.gen-cosmos.gen-cosmos.gen-cosmos #floor{background-color:transparent!important;background-image:none!important}
@media (prefers-reduced-motion: reduce){#genConsole .gc button.glow{animation:none;box-shadow:0 0 10px 1px #9fb0ff88}#genDawn{animation-duration:.01s}#genConsole .gcur{animation:none}}`;
  document.head.appendChild(css);
  const cls = (k, on) => document.documentElement.classList.toggle(k, !!on);
  // before the light the world is drawn in the night palette (arena.html isDark() reads window.__genDark), so anything made out of
  // order (words typed before "let there be light") is still faintly visible on the dark void, whatever the OS theme
  function night(on) { window.__genDark = !!on; const a = $('#arena'); if (a) a.classList.toggle('gen-night', !!on); }

  // ---------- who gets a genesis
  // the arm: 'story' or 'current' (the starter world and its guided first five minutes). Only NEW browsers are split, only while AB is on;
  // ?arm=story|current forces one (tests, links). A browser that already has a world keeps it, whatever its arm.
  function variant(fresh0) { const f = Q.get('arm'); if (f === 'story' || f === 'current') { try { localStorage.setItem(GV, f); } catch (e) {} return f; }
    let v = null; try { v = localStorage.getItem(GV); } catch (e) {} if (v === 'story' || v === 'current') return v; if (AB !== 'on' || !fresh0) return null;
    v = Math.random() < 0.5 ? 'story' : 'current'; try { localStorage.setItem(GV, v); } catch (e) {} return v; }
  // called by the arena for a browser with no world of its own (fresh0), before the guided start would load the starter world
  function wants(fresh0) { if (Q.has('genesis') || Q.has('story')) return true; return !!fresh0 && variant(fresh0) === 'story'; }
  // the storyline is "out" on the test site and local copies, or anywhere once the A/B runs: that's where it is offered
  const storyLive = () => AB === 'on' || /^staging\./.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // the Operator window's status line (Nico, v7: no second title; "consciousness 24 · epoch 0 · genesis", the epoch advancing with the story)
  const epochNow = () => (S && S.day) || 0, statusLine = () => `consciousness 24 · epoch ${epochNow()}${epochNow() === 0 ? ' · genesis' : ''}`;
  // the consciousness's tag (Nico, v9: "at the top of the operator window, or as a label/tag on the world, rather than the chat"): top-left of
  // the world, there whether the Operator's window is open or not (hidden in the dark, like all UI)
  function tag() { applyUnlocks(); if (!S || !S.on) return; let el = document.getElementById('genTag'); if (!el) { el = document.createElement('div'); el.id = 'genTag'; document.body.appendChild(el); } el.textContent = statusLine(); }
  { const c3 = document.createElement('style'); c3.textContent = `#genTag{position:fixed;left:14px;top:12px;z-index:41;padding:3px 9px;border-radius:9px;background:#0a0b16cc;border:1px solid #6b7cff55;color:#cfd6ff;font:600 11px/1.4 var(--term-font,ui-monospace,Menlo,monospace);letter-spacing:.04em;pointer-events:none}
html.gen-box #genTag{display:none}#genDay{top:44px!important}html.gen-story:not(.gen-calm) #genTag{top:52px}html.gen-story:not(.gen-calm) #genDay{top:84px!important}@media (max-width:600px){#genTag{top:8px;left:8px}}`; document.head.appendChild(c3); }
  const mark = k => { try { window.__funnel && window.__funnel.mark(k); } catch (e) {} };
  // silence (Nico, story v5): from the landing until the storyline's music step, sound "doesn't exist yet": everything is held at zero
  // (the player's own mute and volume aren't touched); the Operator's arrival and its sonar are visual only
  const silence = on => { try { window.__audio && window.__audio.hush && window.__audio.hush(on); } catch (e) {} }, silentNow = () => { try { return !!(window.__audio && window.__audio.hushed && window.__audio.hushed()); } catch (e) { return false; } };

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
      try { await window.__intro.play(Q.get('intro') ? { tone: Q.get('intro'), story: storyMode() } : { story: storyMode() }); return; } catch (e) { console.warn('genesis: intro', e); } }
    await new Promise(res => { const el = document.createElement('div'); el.id = 'genIntro'; el.textContent = 'in the beginning there was nothing'; document.body.appendChild(el);
      const end = () => { el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 1200); }; el.addEventListener('click', end, { once: true });
      setTimeout(end, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1500 : 2600); }); }

  // ---------- the guide: which step is next, and the console that offers it
  const did = k => !!(S && S.steps && S.steps[k]);
  const gDone = g => g === 'sky' ? (did('weather') || did('music')) : did(g);
  const guiding = () => !!(S && S.on && !S.free);
  const guideOf = () => storyMode() ? DAYS[0].goals.map(x => x[0]) : GUIDE;   // Epoch 0's goals: lights on, words, life
  const nextGuide = () => guideOf().find(g => !gDone(g)) || null;
  const introOf = g => { const s = STEPS[g] && STEPS[g].intro; return typeof s === 'function' ? s() : s || ''; };
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
    renderConsole(introOf(nextGuide() || 'light')); }
  function freeChips() { const out = []; if (storyMode()) return ORDER.filter(k => !did(k) && CHIP_AT[k] && unlocked(k)).map(k => [k, { weather: 'give it weather', music: 'let there be music', hut: 'build a hut' }[k]]);
    if (!did('light')) out.push(['light', 'let there be light']);
    if (!did('words')) out.push(['words', 'let there be words'], ['words:' + topic, 'grow it from Wikipedia: ' + topic]);
    if (did('words') && !did('creatures')) out.push(['creatures', 'bring the first creatures']);
    if (did('creatures') && !did('weather')) out.push(['weather', 'give it weather']); if (did('creatures') && !did('hut')) out.push(['hut', 'build a hut']); if (!did('music')) out.push(['music', 'let there be music']);
    return out; }
  let curLine = '', wakeShown = [], wakeTyping = '', wakeBusy = false;
  function renderConsole(line) { if (line != null) curLine = line; line = curLine; const c = $('#genConsole'); if (!c) return; const done = ORDER.filter(did).length, alive = S && S.alive;
    c.classList.toggle('alive', !!alive); const g = guiding() && nextGuide();
    let body;
    const GD = guideOf();
    if (wakeBusy) body = '';
    else if (g) { const st = STEPS[g], dots = GD.map(x => `<i class="${gDone(x) ? 'on' : x === g ? 'now' : ''}"></i>`).join('');
      body = `<div class="gdots" title="step ${GD.indexOf(g) + 1} of ${GD.length}">${dots}</div>` +
        `<div class="gc"><button class="glow${coarse() ? ' say' : ''}" data-gsay="1"${busy ? ' disabled' : ''}>${coarse() ? '▶ ' : ''}${esc(sayOf(g))}</button>` +
        (st.alt && !storyMode() ? `<button class="quiet" data-galt="1"${busy ? ' disabled' : ''}>${esc(st.alt[0])}</button>` : '') + `</div>` +
        `<div class="gh">${coarse() ? 'tap ▶, or type it your own way below' : 'press enter, or say it your own way'}</div>` +
        `<div class="gs">${storyMode() ? (g === 'light' ? 'epoch 0 · genesis · ' : 'epoch 1 · ') : ''}step ${GD.indexOf(g) + 1} of ${GD.length} · <a data-gskip="1">skip the guide</a></div>`; }
    else body = (S && S.orc === 'offer' ? `<div class="gc gor"><button class="glow" data-goracle="1" title="the Oracle: bring your own AI">🔮 Oracle</button></div>` : '') + `<div class="gc">${freeChips().map(([k, t]) => `<button data-gen="${esc(k)}"${busy ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div>` +
      (storyMode() ? '' : `<div class="gs">${alive ? 'alive · ' : ''}${done} of ${ORDER.length} steps · or type to the Operator: "let there be music"</div>`);
    const said = wakeShown.length || wakeTyping ? `<div class="gw">${wakeShown.map(l => `<p>${esc(l)}</p>`).join('')}${wakeTyping ? `<p>${esc(wakeTyping)}<i class="gcur"></i></p>` : ''}</div>` : `<div class="gl">${esc(line || '')}</div>`;
    c.innerHTML = said + body; tag();
    prefill(); }
  // the console line, and the same line in the Operator's thread (unless the Tiny Operator is mid-reply: it answers in its own voice)
  let quiet = false;
  function say(line) { renderConsole(line); if (quiet) return; try { window.__idleAI && window.__idleAI.add && window.__idleAI.add('TO', line, 'ai'); } catch (e) {} }

  // the chips (free mode), the glowing suggestion and its quiet alternative (guided mode), "skip the guide"
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('#genConsole [data-gen],#genConsole [data-gsay],#genConsole [data-galt],#genConsole [data-gskip]'); if (!t) return;
    if (t.dataset.gskip) { endGuide(true); return; } if (busy) return;
    if (t.dataset.gsay) { const g = nextGuide(); if (g) submit(sayOf(g)); return; }
    if (t.dataset.galt) { const g = nextGuide(); if (g && STEPS[g].alt && !storyMode()) runGuided(g, STEPS[g].alt[1], STEPS[g].alt[0]); return; }
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
  function onKey(e) { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.target || e.target.id !== 'lab-text' || !guiding() || !nextGuide()) return; if (/^\//.test(e.target.value.trim())) return;   // chat commands (/oracle) aren't steps
    e.preventDefault(); e.stopImmediatePropagation(); submit(e.target.value); }
  function onSend(e) { const b = e.target.closest && e.target.closest('#lab-send'); if (!b || !guiding() || !nextGuide()) return; e.preventDefault(); e.stopImmediatePropagation(); const t = input(); submit(t ? t.value : ''); }
  document.addEventListener('keydown', onKey, true); document.addEventListener('click', onSend, true);

  // ---------- the end of the guide: everything fades in, the free console takes over; pills and notices wait one more minute
  // the tour's last step (v10, Nico: "If you want to use your own AI model, just click here to connect to the Oracle"): one line and a small
  // glowing 🔮 in the console; the Oracle's lightbox (idle-ai.js window.__oracleBox) also opens from the Operator's chat and from ⚙ settings
  const ORACLE_LINE = 'if you ever want to bring your own AI model, click here to connect it to the Oracle';
  function offerOracle() { if (!S || S.orc) return; S.orc = 'offer'; save(); say(ORACLE_LINE); }
  document.addEventListener('click', e => { if (!(e.target.closest && e.target.closest('#genConsole [data-goracle]'))) return; if (S) { S.orc = 'seen'; save(); }
    try { window.__oracleBox && window.__oracleBox.open('tour'); } catch (err) {} renderConsole(); });
  function endGuide(skipped) { if (!S || S.free) return; S.free = now(); S.skipped = !!skipped; save(); cls('gen-calm', 0); prefill(); if (!skipped) setTimeout(offerOracle, 2600);
    if (!S.alive) { renderConsole(skipped ? 'as you wish. the chips below build the rest' : pick(LINES.free)); return; }
    say(pick(LINES.free)); }
  function hush() { cls('gen-hush', 1); setTimeout(() => cls('gen-hush', 0), 60000); }

  // ---------- the steps
  function done(step, line, at, extra) { S = S || { on: true, steps: {}, t0: now(), n: 1, ev: 2 }; if (S.steps[step]) return; S.steps[step] = now(); save(); if (step === 'music') silence(false); tag(); if (storyMode() && (step === 'words' || step === 'creatures')) mark(step === 'words' ? 'e1words' : 'e1life');
    const h = H(), text = { words: 'the first words fell into the void', creatures: 'the first creatures crawled out of a word', light: 'the first light', weather: 'the first weather', hut: 'the first building blocks turned up', music: 'the first music' }[step];
    try { h && h.log('genesis', { step, text, at, ...(extra || {}) }); } catch (e) {}
    try { window.__almanac && window.__almanac.ev('genesis', text, {}); } catch (e) {}
    const n = ORDER.filter(did).length; let ln = line || pick(LINES[step]);
    if (n >= ALIVE_AFTER && !S.alive) { S.alive = now(); save(); alive(); ln = pick(LINES.alive); }
    const g = guiding() && nextGuide();
    renderDay();
    if (guiding() && !g && storyMode()) { say(ln); setTimeout(() => dayDone(0), 2600); return; }
    if (guiding() && !g) { say(ln); setTimeout(() => endGuide(false), 2200); return; }
    if (g) { say(ln); setTimeout(() => renderConsole(introOf(g)), 1800); } else say(ln); }
  function alive() { window.__genesisVoid = false; const h = H(); cosmos.fade();
    if (hold.length && h) { const cs = h.creatures(); for (const c of hold.splice(0)) { if (c.el) c.el.style.visibility = ''; if (!cs.includes(c)) cs.push(c); } }
    hush(); cls('gen-void', 0); night(false);
    if (!storyMode()) try { window.__first5 && window.__first5.startTrail && window.__first5.startTrail(['hwwiki', S.steps.weather ? 'weather' : null].filter(Boolean)); } catch (e) { console.error(e); }
    setTimeout(() => { try { window.__notify && window.__notify({ kind: 'system', icon: '🌌', html: 'this consciousness is alive. keep building with the Operator, or just watch', ttl: 9000 }); } catch (e) {} }, 61000); }
  // one step at a time (chips are disabled while one runs); steps call each other's inner versions, never the guarded ones
  const step = async (k, fn) => { if (busy) return 'busy'; busy = true; renderConsole(); try { return await fn(); } catch (e) { console.warn('genesis: ' + k, e); renderConsole('that did not work. try again?'); return null; } finally { busy = false; renderConsole(); } };

  // the words rain in (and condense) from above: the newest words nearest the view first
  function rain(ws) { const h = H(); if (!h || !ws.length) return; const p = h.cam(); const near = ws.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 180);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    near.forEach((w, i) => { try { w.el.animate(calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ translate: '0 -220px', opacity: 0, filter: 'blur(3px)' }, { translate: '0 0', opacity: 1, filter: 'blur(0)' }], { duration: calm ? 600 : 1100, delay: calm ? 0 : i * 9, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); } catch (e) {} }); }
  async function _letThereBeWords(src) { { const h = H(); if (!h) return null; if (did('words')) return 'already';
      let input = String(src || '').trim(), kind = 'text';
      // the storyline's first words are always its own (whatever the player or the Tiny Operator asked for: "words about sport" fetched sports)
      if (storyMode()) { input = FIRST_WORDS; kind = 'first'; }
      else if (/^https?:\/\//i.test(input)) kind = 'page'; else if (input && input.split(/\s+/).length <= 4) { input = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(input.replace(/ /g, '_')); kind = 'wikipedia'; }
      if (!input) input = SEED;
      const before = new Set(h.words()); try { await h.terrainFrom(input); } catch (e) { console.warn('genesis: words', e); }
      let fresh = h.words().filter(w => !before.has(w));
      // offline or the page could not be read: the seed text still makes a floor
      if (!fresh.length && input !== SEED && kind !== 'first') { kind = 'seed'; await h.terrainFrom(SEED); fresh = h.words().filter(w => !before.has(w)); }
      if (!fresh.length) return null;
      rain(fresh); cosmos.calm(0.55); done('words', kind === 'first' ? pick(LINES.first) : null, null, { kind, n: fresh.length }); return fresh.length; } }
  async function _firstCreatures(family) { { const h = H(); if (!h) return null; if (did('creatures')) return 'already';
      // the storyline: life only at its own step, after the words (v10, Nico: "right after words, a first creature appears... why?")
      if (storyMode() && !did('words')) return 'notyet';
      lifeNow = true; try { return await _firstCreaturesIn(family); } finally { lifeNow = false; } } }
  async function _firstCreaturesIn(family) { { const h = H();
      // creatures need a floor to crawl out of
      if (!h.words().length) await _letThereBeWords('');
      const p = h.cam(), ws = h.words().filter(w => !w.carriedBy && w.text.length > 2), w = ws.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || { x: p.x, y: p.y };
      ring(w.x, w.y); if (w.el) try { w.el.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 700, iterations: 2 }); } catch (e) {}
      await new Promise(r => setTimeout(r, 650));
      const cs = h.creatures(), names = [];
      const back = hold.splice(0, 2); back.forEach((c, i) => { c.x = c.tx = w.x + (i ? 26 : -26); c.y = c.ty = w.y + 10; if (c.el) c.el.style.visibility = ''; if (!cs.includes(c)) cs.push(c); names.push(c.name); });
      if (!back.length || family) { const n = W() && W().spawn(family || 'crawly'); if (n) names.push(n); }
      if (!names.length) return null;
      cosmos.calm(0.25); done('creatures', null, { x: w.x, y: w.y }, { who: names.join(' and ') }); return names; } }
  function ring(x, y) { const f = $('#floor'); if (!f) return; const r = document.createElement('div'); r.className = 'gen-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; f.appendChild(r); setTimeout(() => r.remove(), 1700); }
  // light: the stage becomes visible (a dawn glow, a brighter grid, a horizon); the world stays in the night palette until it is alive
  async function _light() { { const h = H(); if (!h) return null; if (did('light')) return 'already';
      cls('gen-lit', 1); const a = $('#arena'); if (a && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const d = document.createElement('div'); d.id = 'genDawn'; a.appendChild(d); setTimeout(() => d.remove(), 3400); }
      const w = h.world(); h.applyWorld({ ...w, day: true, ...(S && S.feat && !(w.features || []).length ? { features: S.feat } : {}), id: 'world-' + now().toString(36).slice(-4) }, 'studio');
      if (storyMode()) { cosmos.light(); wakeShown = []; nightEnd(); mark('lights'); } done('light', storyMode() ? LIGHTS_ON : null); if (storyMode()) setTimeout(undock, 2600); return true; } }
  async function _weather(kind) { { if (did('weather')) return 'already'; const ks = (W() && W().weathers()) || [];
      const k = ks.includes(kind) ? kind : pick(ks.filter(x => x !== 'clear')) || 'rain'; const r = W() && W().setWeather(k); if (!r) return null; done('weather', null, null, { kind: k }); return r; } }
  async function _hut() { { if (did('hut')) return 'already'; const h = H(); if (!h) return null;
      if (!h.words().length) await _letThereBeWords(''); if (!did('creatures')) await _firstCreatures();
      if (!window.__build || !window.__build._seed) return null; window.__build._seed(); done('hut'); return true; } }
  async function _music() { { if (did('music')) return 'already'; const m = window.__music; if (!m) return null;
      try { window.__audio && window.__audio.wantSound && window.__audio.wantSound(); } catch (e) {} try { m.setSource ? m.setSource('background') : m.setBg(true); } catch (e) { try { m.setBg(true); } catch (e2) { return null; } }
      done('music'); return true; } }
  // every action answers { ok, result } or { error } (the Tiny Operator and the Operator's tools read that shape)
  const answer = r => r === 'busy' ? { error: 'another step is still happening' } : r === 'notyet' ? { error: 'not yet: words first' } : r === 'already' ? { ok: true, already: true } : r ? { ok: true, result: r } : { error: 'that step did not work' };
  const actions = { letThereBeWords: async x => answer(await step('words', () => _letThereBeWords(x))), firstCreatures: async f => answer(await step('creatures', () => _firstCreatures(f))), light: async () => answer(await step('light', _light)),
    weather: async k => answer(await step('weather', () => _weather(k))), hut: async () => answer(await step('hut', _hut)), music: async () => answer(await step('music', _music)) };

  // ---------- stats (idle-stats.js): the steps reached and the seconds each took since the one before (or since the console opened)
  function stats() { if (!S || !S.on || !S.steps) return null; const t0 = S.tc || S.t0, ks = Object.keys(S.steps).sort((a, b) => S.steps[a] - S.steps[b]), out = {}; let prev = t0;
    for (const k of ks) { out[k] = Math.max(0, Math.round((S.steps[k] - prev) / 1000)); prev = S.steps[k]; }
    return { steps: out, end: S.free ? (S.skipped ? 'skipped' : 'guided') : null, opened: !!S.tc }; }

  // ---------- boot (a first visit with ?genesis, or the genesis side of the A/B), and a new universe for anyone
  async function boot(force) { if (!H()) return false;
    // which start: ?story → the storyline; ?start=free|story|ready; otherwise the chooser (script section E)
    // ('guided': the earlier guided genesis, light → words → life → weather or music, kept for links and tests)
    let mode = ['story', 'free', 'ready', 'guided'].includes(force) ? force : Q.has('story') ? 'story' : ['story', 'free', 'ready', 'guided'].includes(Q.get('start')) ? Q.get('start') : variant() === 'story' && !Q.has('genesis') && !(S && S.n) ? 'story' : null;   // a new browser in the story arm goes straight in (later new consciousnesses get the chooser)
    if (!mode) mode = await chooser();
    if (mode === 'ready') { if (S) { S.on = false; save(); } applyUnlocks(); dropFlag(); return readyWorld(); }
    S = { on: true, steps: {}, t0: now(), n: ((S && S.n) || 0) + 1, mode, ev: 2 }; if (mode === 'free') S.free = now(); save(); toVoid(); dropFlag(); try { if (window.__boot && window.__boot.step) { window.__boot.step('creatures'); window.__boot.step('words'); } } catch (e) {}   // the void is the world: the loading cover can go (else it waits for its 9 s cap, and the dark with it)
    if (mode === 'free') cls('gen-calm', 0);
    // v12: in the story the game is hushed from the intro on (the intro plays past it, storyOut) and held until the music step
    if (mode === 'story') { blackCover(true); silence(true); cosmos.start(); await intro(); S.tc = now(); save(); try { H().log('genesis', { step: 'start', mode }); } catch (e) {} await landing(); await wake(); return true; }
    await intro(); S.tc = now(); save(); openConsole(); try { H().log('genesis', { step: 'start', mode }); } catch (e) {} return true; }
  // the chooser: the storyline, the void with no guide, or a world that is already alive (the starter world)
  // on id-le.com the storyline isn't offered yet (it's still being written): the chooser shows the other two
  function chooser() { return new Promise(res => { const el = document.createElement('div'); el.id = 'genChoose'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<h2>a new consciousness</h2><div class="sub">how do you want to begin?</div><div class="opts">
${storyLive() || Q.has('story') ? `<button class="rec" data-m="story"><b>📖 Storyline</b>a training run that won't stop, a crash, and 10 epochs to raise a consciousness into autonomy with the Tiny Operator<br><small>recommended</small></button>` : ''}
<button data-m="free"><b>✦ From scratch</b>the void and the Operator's console, every step available, no guide</button>
<button data-m="ready"><b>🌍 A ready world</b>creatures already living, the guided first five minutes</button></div>`;
    document.body.appendChild(el); const end = m => { el.classList.add('out'); setTimeout(() => el.remove(), 600); try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_choose', extra: { mode: m } } })); } catch (e) {} res(m); };
    el.addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b) end(b.dataset.m); });
    setTimeout(() => { const b = el.querySelector('button.rec'); if (b && !matchMedia('(pointer: coarse)').matches) b.focus(); }, 50); }); }
  // a ready world: the starter world (the guided first five minutes start with it); a browser that has played gets it restored directly
  async function readyWorld() { try { if (window.__first5 && await window.__first5.boot(true)) return true; } catch (e) { console.warn('genesis: ready', e); }
    try { const sw = await (await fetch('starter_world.json', { cache: 'no-store' })).json(); window.__design.restore(sw); return true; } catch (e) { console.warn('genesis: starter world', e); return false; } }

  // ---------- the landing (Nico, story v4): the real Id|le view, very dark and low contrast: the same top-down world, no creatures, nothing
  // on it, only a faint black hole far off with stray letters swirling into it. You (the scientist, now inside the universe) talk to yourself
  // in the middle of the screen; the hole grows clearer, its letters swirl faster, the view drifts toward it; then the Operator arrives
  // (Id and le, the halves that crawled off at the end of the intro, come back, meet and fold into its window) and pings a sonar: each ping
  // is a faint ring that, for a moment, outlines the swirling letters in thin light. Lights on reveals everything.
  // A click finishes the line (or goes to the next), holding pauses, Esc or "skip ›" goes straight to the Operator. ?nolanding skips it all.
  // v11 (Nico: "we need some sort of explanation of why there's no sound in the begining, like '...in time for dinner... and why is there
  // no sound?!... is that a black...'"): two lines after dinner say it out loud, then the hole
  const DARK = ['whaa…', 'oh my god, my girlfriend is going to be mad… where am I?', "I don't think I'll make it back in time for dinner…",
    'and why is there no sound?! not a hum, not even my own steps…', 'is that a black…',
    'ohhh what?! is that a black hole!!! this is not good!!', 'wait, what... why is that black hole moving...', "it's coming my way,....", "today really isn't my luckyyyy daaaaayyyyy!!!! aaaaahhhhh!!!"];   // the last three: Nico, story v5
  const darkHold = s => Math.max(1.4, s.length * 0.04 + 0.3), DCPS = 55;
  const APPROACH = DARK.indexOf('wait, what... why is that black hole moving...'), lineDur = s => darkHold(s) + s.length / DCPS;   // v12: the ringing ends as the hole starts moving
  const untilApproach = (i, d) => d + DARK.slice(i + 1, APPROACH).reduce((a, x) => a + lineDur(x), 0);   // night seconds from now (line i just shown, held d s) to the approach
  let land = { phase: 'none', clicks: 0 }, nightCv = null;
  const clamp01 = x => Math.max(0, Math.min(1, x)), ease = u => u * u * (3 - 2 * u);
  // the dark: a canvas over the world (under the Operator's window): a dim veil, the hole and its letters, the sonar
  const nightState = { letters: [], pings: [], t: 0, k: 0, rimmed: 0, calm: 0, pull: 0 };
  const LETTERS = 'idlewordsthefloornothingbeginningoracle';
  function nightStart(RM) {
    if (nightCv) return; const cv = document.createElement('canvas'); cv.id = 'genNight'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147481995;pointer-events:none;transition:opacity 1.6s';
    document.body.appendChild(cv); nightCv = cv; cls('gen-landing', 1); const st = nightState; st.pings = []; st.rimmed = 0; st.calm = 0; st.pull = 0; st.letters = [];
    for (let i = 0; i < 64; i++) { const h = (a) => { const x = Math.sin((i + 1) * 78.233 + a * 12.9898) * 43758.5453; return x - Math.floor(x); };
      st.letters.push({ ch: LETTERS[i % LETTERS.length], a: h(1) * 6.283, r: 1.2 + h(2) * 2.6, sp: 0.4 + h(3) * 0.6, sz: 0.8 + h(4) * 0.6, rim: 0 }); }
    let last = performance.now();
    const loop = () => { if (!nightCv) return; const n = performance.now(), dt = Math.min(0.05, (n - last) / 1000); last = n; if (!land.paused) st.t += dt; drawNight(cv, st, land.paused ? 0 : dt, RM); requestAnimationFrame(loop); }; loop(); }
  function drawNight(cv, st, dt, RM) {
    const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2); if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // the veil: the world under it, almost black, its faint grid still there
    g.fillStyle = 'rgba(2,3,7,0.8)'; g.fillRect(0, 0, W, H); const rise = RM ? 1 : clamp01((st.t - 1.2) / 2.4);   // from black (under the cover's 1.5 s), slowly
    // how much of the hole we see and how hard it pulls follow the lines: faint at first, clear at "is that a black hole", closer at "getting closer"
    const k = st.k, seen = st.calm ? 1 : clamp01(0.25 + (k >= 4 / 7 ? 0.45 : 0) + (k >= 5 / 7 ? 0.2 : 0)), pullT = st.calm ? Math.max(0, st.pull - 0.4) : (k >= 6 / 7 ? 1 : k >= 5 / 7 ? 0.45 : 0);
    st.pull += (pullT - st.pull) * Math.min(1, dt * 0.8); const pull = RM ? pullT : st.pull, small = Math.min(W, H);
    const hx = W * (0.74 - 0.24 * pull), hy = H * (0.3 + 0.16 * pull), R = small * (0.035 + 0.045 * pull);
    // the hole: a dark core, a faint violet ring of light bent around it
    const ring = g.createRadialGradient(hx, hy, R * 0.8, hx, hy, R * 3.2); ring.addColorStop(0, 'rgba(0,0,0,1)'); ring.addColorStop(0.22, `rgba(130,100,190,${0.22 * seen})`); ring.addColorStop(0.45, `rgba(90,70,140,${0.08 * seen})`); ring.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ring; g.beginPath(); g.arc(hx, hy, R * 3.2, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy, R, 0, 7); g.fill();
    // the sonar's rings, from the Operator's window (or the middle)
    const lab = document.querySelector('#lab'), lr = lab && lab.classList.contains('open') ? lab.getBoundingClientRect() : null, ox = lr ? lr.left + lr.width / 2 : W / 2, oy = lr ? lr.top + lr.height / 2 : H / 2, maxR = Math.hypot(W, H) * 0.85;
    for (const p of st.pings) p.r += dt * maxR / 2.2; st.pings = st.pings.filter(p => p.r < maxR);
    // the letters: on a tilted disk around the hole, faster near it, spiralling in; when one falls in, another drifts in from further out
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of st.letters) { if (!RM) { l.a += dt * l.sp * (1.6 / l.r) * (1 + 2.5 * pull); l.r -= dt * (0.05 + 0.25 * pull) * l.sp; if (l.r < 1.05) { l.r = 3.2 + l.sp * 0.8; l.a = Math.random() * 6.283; } }
      const x = hx + Math.cos(l.a) * l.r * R, y = hy + Math.sin(l.a) * l.r * R * 0.5, fz = Math.max(8, R * 0.32 * l.sz * Math.min(1.3, l.r / 1.5)), a = (0.12 + 0.5 * seen) * clamp01((3.6 - l.r) / 1.2) * (k >= 5 / 7 || st.calm ? 1 : 0.55);
      for (const p of st.pings) { if (Math.abs(Math.hypot(x - ox, y - oy) - p.r) < fz && !p.hit.has(l)) { p.hit.add(l); l.rim = 1; st.rimmed++; } } if (!RM) l.rim = Math.max(0, l.rim - dt / 1.3);
      g.font = `${Math.round(fz)}px Georgia, serif`; g.fillStyle = `rgba(190,200,230,${a})`; g.fillText(l.ch, x, y);
      if (l.rim > 0.02) { g.save(); g.strokeStyle = `rgba(126,227,245,${0.9 * l.rim})`; g.lineWidth = 1; g.shadowColor = '#7ee3f5'; g.shadowBlur = 6 * l.rim; g.strokeText(l.ch, x, y); g.restore(); } }
    for (const p of st.pings) { g.strokeStyle = `rgba(126,227,245,${0.3 * (1 - p.r / maxR)})`; g.lineWidth = 1.2; g.beginPath(); g.arc(ox, oy, p.r, 0, 7); g.stroke(); }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (rise < 1) { g.fillStyle = `rgba(0,0,0,${1 - rise})`; g.fillRect(0, 0, W, H); }
    if (land.shake && !RM) { const amp = Math.min(9, 1 + (st.t - (land.shakeT || st.t)) * 1.6); cv.style.transform = `translate(${(Math.random() - 0.5) * amp}px,${(Math.random() - 0.5) * amp}px)`; } else cv.style.transform = '';   // a shake that builds with the rumble
    // the line being said, in the middle (the same style as the intro's subtitles)
    if (land.line) { const B = window.__termBoot, L = land.line, n = RM ? L.text.length : Math.floor((st.t - L.t0) * DCPS); if (B && B.say) B.say(g, W, H, L.text, n, 'doc', B.arrive.sayFz(W, W < 600), 1); } }
  function ping() { if (!nightCv) return; nightState.pings.push({ r: 0, hit: new Set() }); land.pings = (land.pings || 0) + 1; if (silentNow()) return;
    const A = window.__audio; try { const c = A && !A.muted() && A.ctx(); if (!c || c.state !== 'running') return; const t = c.currentTime, o = c.createOscillator(), v = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1480, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.9);
      v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(0.05, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); o.connect(v); v.connect(A.out()); o.start(t); o.stop(t + 1.3); } catch (e) {} }
  let sonarTimer = 0;
  function sonar(on) { clearInterval(sonarTimer); if (on) { ping(); sonarTimer = setInterval(ping, 2600); } }
  // lights on: the night lifts and shows everything
  function nightEnd() { sonar(false); cls('gen-landing', 0); const cv = nightCv; if (!cv) return; nightCv = null; land.phase = 'lit'; cv.style.opacity = '0'; setTimeout(() => cv.remove(), 1700); }
  function blackCover(on) { let el = document.getElementById('genBlack'); if (on) { if (!el) { el = document.createElement('div'); el.id = 'genBlack'; el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147482999;pointer-events:none;transition:opacity 1.2s'; document.body.appendChild(el); } el.style.opacity = '1'; return; }
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 1300); } }
  // the ringing in the ears after the crash (the one sound after the landing): a soft high tone with a slight beat, fading over ~2 s
  // the one sound after the landing (Nico v9: "we are missing the ear-ringing sound"): a high tone with a slow beat, fading over ~2.6 s. It goes
  // around the storyline's hush (straight to the speakers, at the player's volume; nothing if they muted), waking the audio context if needed
  // v12 (Nico: "the ringing-ears sound should go up in intensity very quickly, then down, then linger for a bit, slowly reaching zero by the
  // time the black hole starts approaching"): up in 0.2 s, down to ~37% by 0.6 s, a linger that moves a little (a slow tremolo, a slight drift),
  // then a slow linear fade that reaches exactly 0 at endAt: the moment the hole starts moving (DARK[APPROACH]). The lines' clock can run
  // faster (clicks) or stop (held), so the landing re-aims the end on every line (retarget) and closes it at the approach (end)
  const RING = { peak: 0.06, attack: 0.2, drop: 0.6, hold: 0.37 };
  function ringSound(c, dest, t, endAt = t + 2.6) {
    const env = c.createGain(), trem = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), drift = c.createOscillator(), dg = c.createGain(), oscs = [], H = RING.peak * RING.hold;
    trem.gain.value = 1; lfo.frequency.value = 0.4; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(trem.gain); drift.frequency.value = 0.13; dg.gain.value = 4; drift.connect(dg);
    const plan = (from, end) => { const g = env.gain; if (from > t + RING.drop) { try { g.cancelAndHoldAtTime(from); } catch (e) { g.cancelScheduledValues(from); g.setValueAtTime(g.value, from); } }
      else { g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(RING.peak, t + RING.attack); g.exponentialRampToValueAtTime(H, t + RING.drop); from = t + RING.drop; }
      end = Math.max(end, from + 0.05); const fadeAt = Math.min(end - 0.05, from + Math.min(3, 0.35 * (end - from))); if (fadeAt > from) g.setValueAtTime(from > t + RING.drop ? g.value : H, fadeAt); g.linearRampToValueAtTime(0, end); g.setValueAtTime(0, end); ctl.endAt = end; };
    env.connect(trem); trem.connect(dest); for (const f of [3400, 3405]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; dg.connect(o.detune); o.connect(env); o.start(t); oscs.push(o); } lfo.start(t); drift.start(t);
    const all = [...oscs, lfo, drift]; let stopped = false; const stop = at => { if (stopped) return; stopped = true; all.forEach(o => { try { o.stop(at); } catch (e) {} }); };
    const ctl = { env, endAt, retarget: end => { if (stopped) return; plan(Math.max(c.currentTime, t), end); },
      end: (at = c.currentTime) => { if (stopped) return; const g = env.gain; try { g.cancelAndHoldAtTime(at); } catch (e) { g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); } g.linearRampToValueAtTime(0, at + 0.03); g.setValueAtTime(0, at + 0.03); ctl.endAt = at + 0.03; stop(at + 0.1); },
      stop };
    plan(t, endAt); setTimeout(() => stop(c.currentTime + 0.05), 90000); return ctl; }
  const bypass = c => { const A = window.__audio, g = c.createGain(); g.gain.value = A && A.vol ? A.vol() : 0.5; g.connect(c.destination); return g; };
  let ringCtl = null;
  function ringing(rest = 2.6) { const A = window.__audio; land.ring = { tried: true }; ringCtl = null;
    try { if (!A || A.muted()) { land.ring.why = 'muted'; return; } const c = A.ctx(), go = () => { const t = c.currentTime + 0.02; ringCtl = ringSound(c, bypass(c), t, t + rest); ringCtl.c = c; land.ring.played = true; land.ring.state = c.state; land.ring.t0 = t; };
      if (c.state === 'running') go(); else { land.ring.state = c.state; c.resume().then(go).catch(() => {}); } } catch (e) { land.ring.err = String(e); } }
  // the ringing's end, re-aimed: rest = night seconds until the hole starts moving (0: it's moving now, close it)
  function ringAim(rest) { land.ring = land.ring || {}; if (rest > 0) land.ring.aimSt = nightState ? nightState.t + rest : null; if (!ringCtl) return; try { if (rest <= 0) { ringCtl.end(ringCtl.c.currentTime); land.ring.closedAt = ringCtl.endAt; } else ringCtl.retarget(ringCtl.c.currentTime + rest); land.ring.endAt = ringCtl.endAt; } catch (e) { land.ring.err = String(e); } }
  // the black hole closing in (Nico v9: "a sound like the start of b1 when the blackhole comes very close… right before Operator shows up"):
  // a low warm FM rumble growing over the last lines, with the screen shake; it cuts when the Operator appears. Also around the hush.
  let rum = null;
  function rumbleSound(c, dest, t, grow = 6) { const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.16, t + grow); out.connect(dest);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), am = c.createOscillator(), ag = c.createGain(), body = c.createGain(), lp = c.createBiquadFilter();
    car.type = 'triangle'; car.frequency.setValueAtTime(46, t); car.frequency.linearRampToValueAtTime(60, t + grow); mod.frequency.value = 116; mg.gain.setValueAtTime(10, t); mg.gain.linearRampToValueAtTime(70, t + grow); mod.connect(mg); mg.connect(car.frequency);
    am.frequency.setValueAtTime(12, t); am.frequency.linearRampToValueAtTime(24, t + grow); ag.gain.value = 0.45; am.connect(ag); ag.connect(body.gain); body.gain.value = 0.55; lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(900, t + grow);
    car.connect(body); body.connect(lp); lp.connect(out); [car, mod, am].forEach(o => o.start(t)); return { out, stop: at => { try { out.gain.cancelScheduledValues(at); out.gain.setValueAtTime(out.gain.value, at); out.gain.linearRampToValueAtTime(0.0001, at + 0.08); [car, mod, am].forEach(o => o.stop(at + 0.12)); } catch (e) {} } }; }
  function rumble(on) { const A = window.__audio; try { if (!on) { if (rum) { rum.stop(rum.c.currentTime); rum = null; } return; } if (rum || !A || A.muted()) return; const c = A.ctx(); if (c.state !== 'running') return; rum = rumbleSound(c, bypass(c), c.currentTime + 0.02, 6); rum.c = c; } catch (e) {} }
  async function landing() { if (Q.has('nolanding')) { blackCover(false); land = { phase: 'done', clicks: 0, why: 'flag' }; return; }
    // the night starts when the game's loading cover has gone (skipping the intro right away can land before it)
    for (let i = 0; i < 200 && document.documentElement.classList.contains('booting'); i++) await new Promise(r => setTimeout(r, 100));
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; land = { phase: 'dark', clicks: 0, t0: now(), shown: 0, pings: 0 }; blackCover(true); nightStart(RM); mark('landing'); ringing(untilApproach(-1, 3.0)); setTimeout(() => silence(true), 2800); setTimeout(() => blackCover(false), 1500);
    const skipB = document.createElement('button'); skipB.id = 'genNightSkip'; skipB.textContent = 'skip ›'; skipB.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147481997;font:600 12px var(--ui-font,system-ui);color:#cdbf9a;background:#0b0f18cc;border:1px solid #2b6f86;border-radius:14px;padding:5px 12px;cursor:pointer;opacity:.75';
    document.body.appendChild(skipB);
    await new Promise(res => { let i = -1, timer = 0, downAt = 0, done = false;
      const st = nightState, next = () => { clearTimeout(timer); if (done) return; i++; if (i >= DARK.length) return finish('lines'); const text = DARK[i];
        land.line = { text, t0: st.t }; land.shown = i + 1; if (i === DARK.length - 2 && !land.shakeT) { land.shakeT = st.t; rumble(true); } land.shake = !!land.shakeT; st.k = (i + 1) / DARK.length; const d = darkHold(text) + text.length / DCPS; if (i < APPROACH) ringAim(untilApproach(i, d)); else if (i === APPROACH) { land.approachSt = st.t; ringAim(0); } wait(d); };
      // the line's clock follows the night's (paused while held)
      const wait = d => { const end = st.t + d; const tick = () => { if (done) return; if (st.t >= end) next(); else timer = setTimeout(tick, 50); }; timer = setTimeout(tick, 50); };
      const finish = why => { if (done) return; done = true; if (why === 'skip') mark('skip:landing'); ringAim(0); clearTimeout(timer); land.line = null; land.shake = false; land.shakeT = 0; rumble(false); land.why = why; land.after = (now() - land.t0) / 1000;
        removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true); document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('pointerup', onUp, true); skipB.remove(); res(); };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('skip'); } else if (e.key === ' ' && !e.repeat) { e.preventDefault(); land.paused = true; } };
      const onKeyUp = e => { if (e.key === ' ') land.paused = false; };
      const onDown = e => { if (e.target === skipB) return; if (e.target && e.target.closest && e.target.closest('button,input,textarea,select,a,#lab')) return; downAt = performance.now(); land.paused = true; };
      const onUp = e => { if (!downAt) return; const short = performance.now() - downAt < 280; downAt = 0; land.paused = false; if (!short) return; land.clicks++; ripple(e.clientX, e.clientY, RM);
        const L = land.line; if (L && (st.t - L.t0) * DCPS < L.text.length) L.t0 = st.t - L.text.length / DCPS; else next(); };   // a click: finish the line, or the next one
      skipB.addEventListener('click', e => { e.stopPropagation(); finish('skip'); }); addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
      document.addEventListener('pointerdown', onDown, true); document.addEventListener('pointerup', onUp, true); wait(3.0); });   // pitch black 1.5 s (the ringing), the hole comes up, then the first line
    land.phase = 'arriving'; st_calm(); try { await arrival(RM); } catch (e) { console.warn('genesis: arrival', e); } land.phase = 'sonar'; }
  const st_calm = () => { nightState.calm = 1; };
  function ripple(x, y, RM) {   // a click in the void: a faint ring (and a faint note, unless the storyline's silence holds)
    const d = document.createElement('div'); d.className = 'genRipple'; d.style.cssText = `position:fixed;left:${x - 8}px;top:${y - 8}px;width:16px;height:16px;border-radius:50%;border:1px solid #7ee3f580;pointer-events:none;z-index:2147481980;transition:transform .9s ease-out,opacity .9s ease-out`;
    document.body.appendChild(d); requestAnimationFrame(() => { d.style.transform = `scale(${RM ? 2 : 7})`; d.style.opacity = '0'; }); setTimeout(() => d.remove(), 1000);
    if (silentNow()) return; const A = window.__audio; try { const c = A && !A.muted() && A.ctx(); if (!c || c.state !== 'running') return; const o = c.createOscillator(), v = c.createGain(), t = c.currentTime; o.type = 'sine'; o.frequency.setValueAtTime(520 + Math.random() * 120, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.25);
      v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(0.025, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(v); v.connect(A.out()); o.start(t); o.stop(t + 0.35); } catch (e) {} }
  function crackle() { if (silentNow()) return; const A = window.__audio; try { const c = A && !A.muted() && A.ctx(); if (!c || c.state !== 'running') return; const t = c.currentTime, n = Math.floor(c.sampleRate * 0.5), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() < 0.06 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.08) * (1 - i / n);   // sparse pops over a hiss
      const s = c.createBufferSource(), v = c.createGain(); s.buffer = b; v.gain.value = 0.35; s.connect(v); v.connect(A.out()); s.start(t);
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t + 0.3); o.frequency.exponentialRampToValueAtTime(640, t + 0.75); g.gain.setValueAtTime(0.0001, t + 0.3); g.gain.linearRampToValueAtTime(0.06, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85); o.connect(g); g.connect(A.out()); o.start(t + 0.3); o.stop(t + 0.9); } catch (e) {} }
  function arrival(RM) { return new Promise(res => {
    const cv = document.createElement('canvas'); cv.id = 'genArrive'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147482001;pointer-events:none;transition:opacity .5s';
    document.body.appendChild(cv); const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cy = H / 2, GLOW = RM ? 0 : 0.9, LINE = GLOW + 0.4, FOLD = LINE + 0.6, wr = Math.min(620, W * 0.94), hr = Math.min(340, H * 0.6), T0 = performance.now(); let done = false; crackle();
    const frame = () => { const t = (performance.now() - T0) / 1000; g.clearRect(0, 0, W, H); g.save(); g.shadowColor = '#7ee3f5';
      if (t < GLOW) { const r = 3 + 5 * Math.abs(Math.sin(t * 11)), a = clamp01(t / 0.25); g.globalAlpha = a; g.shadowBlur = 30; g.fillStyle = '#e8fbff'; g.beginPath(); g.arc(W / 2, cy, r, 0, 7); g.fill(); }
      else if (t < LINE) { const k = ease(clamp01((t - GLOW) / (LINE - GLOW))), w = 8 + (wr - 8) * k; g.shadowBlur = 24; g.fillStyle = '#e8fbff'; g.fillRect(W / 2 - w / 2, cy - 1.5, w, 3); }
      else { const k = ease(clamp01((t - LINE) / (FOLD - LINE))), h = 3 + (hr - 3) * k; g.fillStyle = `rgba(11,15,24,${0.85 * k})`; g.fillRect(W / 2 - wr / 2, cy - h / 2, wr, h); g.strokeStyle = '#6b7cff'; g.lineWidth = 2; g.shadowBlur = 24 * (1 - k * 0.5); g.strokeRect(W / 2 - wr / 2, cy - h / 2, wr, h);
        if (t >= FOLD - 0.1 && !done) { done = true; res(); setTimeout(() => { cv.style.opacity = '0'; setTimeout(() => cv.remove(), 600); }, 150); } if (t > FOLD + 0.2) { g.restore(); return; } }
      g.restore(); requestAnimationFrame(frame); };
    frame(); }); }

  // ---------- the storyline's waking up: the Operator as a window in the middle (a lightbox), the Tiny Operator's lines typed one by one
  async function wake() { const lab = $('#lab'); let bd = $('#genBackdrop'); if (!bd) { bd = document.createElement('div'); bd.id = 'genBackdrop'; document.body.appendChild(bd); }
    cls('gen-box', 1); wakeShown = []; wakeTyping = ''; wakeBusy = true; openConsole(); opTitle(true); mark('operator'); if (nightCv) sonar(true); setTimeout(() => cls('gen-landing', 0), 600);   // the Operator pings the dark
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; let skip = false; const onTap = () => { skip = true; }; if (lab) lab.addEventListener('pointerdown', onTap);
    for (const line of WAKE) { if (RM) { wakeShown.push(line); renderConsole(); await new Promise(r => setTimeout(r, 900)); continue; }
      for (let i = 1; i <= line.length; i += 2) { if (skip) break; wakeTyping = line.slice(0, i); renderConsole(); await new Promise(r => setTimeout(r, 26)); }
      wakeTyping = ''; wakeShown.push(line); renderConsole(); if (!skip) await new Promise(r => setTimeout(r, Math.min(1600, 500 + line.length * 18))); skip = false; }
    if (lab) lab.removeEventListener('pointerdown', onTap);
    wakeBusy = false; try { WAKE.forEach(l => window.__idleAI && window.__idleAI.add && window.__idleAI.add('TO', l, 'ai')); } catch (e) {}
    curLine = WAKE[WAKE.length - 1]; wakeShown = WAKE.slice(); renderConsole(); }
  // after the lights: the window docks where the Operator usually is, and the epoch's goals appear
  // the window is the Operator's, in the lightbox and docked (v10, Nico: "the sidebar chat is Operator"; the 🔮 Oracle is its own lightbox)
  function opTitle() { const b = $('#lab-head b'), N = window.IDLE_NAMES; if (!b || !N) return; b.textContent = N.op.icon + ' ' + N.op.short; }
  // (Nico v9: "the transition from the initial window in the middle, to the right needs some love"): measure the window centred, let it
  // take its docked place, then fly it there from where it was: left, top, width and height together, 720 ms, ease-in-out
  function flipDock() { const lab = $('#lab'), RM = matchMedia('(prefers-reduced-motion: reduce)').matches; if (!lab) { cls('gen-box', 0); return; }
    const A = lab.getBoundingClientRect(); cls('gen-box', 0); const B = lab.getBoundingClientRect(); if (RM || !A.width || !B.width) return;
    const keep = lab.getAttribute('style') || ''; lab.style.transition = 'none'; Object.assign(lab.style, { left: A.left + 'px', top: A.top + 'px', width: A.width + 'px', height: A.height + 'px', right: 'auto', bottom: 'auto', transform: 'none', borderRadius: '16px' });
    lab.getBoundingClientRect(); land.flip = { from: { x: A.left, w: A.width }, to: { x: B.left, w: B.width }, t0: performance.now() };
    lab.style.transition = 'left .72s ease-in-out, top .72s ease-in-out, width .72s ease-in-out, height .72s ease-in-out, border-radius .72s ease-in-out';
    Object.assign(lab.style, { left: B.left + 'px', top: B.top + 'px', width: B.width + 'px', height: B.height + 'px', borderRadius: '0px' });
    setTimeout(() => { lab.setAttribute('style', keep); }, 780); }
  function undock() { opTitle(); const bd = $('#genBackdrop'); if (bd) { bd.style.transition = 'opacity .72s ease-in-out'; bd.classList.add('out'); setTimeout(() => bd.remove(), 800); } wakeShown = []; flipDock(); renderConsole(); renderDay(); }

  // ---------- the epochs: the goal card, and a front page when an epoch is done
  function renderDay() { if (!storyMode()) return; tag(); const d = dayOf(S.day || 0); if (!d) return; let el = $('#genDay');
    if (document.documentElement.classList.contains('gen-box')) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'genDay'; document.body.appendChild(el); }
    const ok = k => S.days && S.days[d.n] ? true : (d.n === 0 ? did(k) : false), soon = d.n > 0;
    el.classList.toggle('soon', soon);
    el.innerHTML = `<button class="x" title="hide">×</button><div class="dt">EPOCH ${d.n} · ${esc(d.title.toUpperCase())}</div><ul>${d.goals.map(([k, t]) => `<li class="${ok(k) ? 'ok' : ''}">${esc(t)}</li>`).join('')}</ul>` +
      (soon ? `<div class="wip">The next epochs are coming. Id|le is a work in progress, and it's open source: <a href="${esc(window.IDLE_REPO || 'https://github.com/nicobrenner/id-le')}" target="_blank" rel="noopener">see how it's made</a>. Until then the consciousness is yours: keep playing.</div>` : `<div class="dn">${esc('teaches: ' + d.teaches)}</div>`);
    el.querySelector('.x').onclick = () => el.remove(); }
  function dayDone(n) { const d = dayOf(n); if (!d || (S.days && S.days[n])) return; S.days = S.days || {}; S.days[n] = now(); S.day = n + 1; S.ev = 2; save(); if (n === 0) mark('e1done');   // funnel key kept: 'e1done' = Genesis (Epoch 0) done
    try { H() && H().log('genesis', { step: 'day', day: n }); } catch (e) {} try { window.__almanac && window.__almanac.ev('genesis', 'epoch ' + n + ' done', {}); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_day', extra: { day: n } } })); } catch (e) {}
    const el = document.createElement('div'); el.id = 'genFront';
    el.innerHTML = `<div class="np"><div class="mh">THE ID|LE GAZETTE</div><div class="md">consciousness 24 · epoch ${n} · special edition</div><div class="ec">EPOCH ${n} COMPLETE</div><h3>${esc(d.front.head)}</h3><div>${esc(d.front.body)}</div><div class="to"><b>TO:</b> ${esc(d.line)}</div><button>on to epoch ${n + 1} ›</button></div>`;
    document.body.appendChild(el); el.querySelector('button').onclick = () => { el.remove(); say(d.line); renderDay(); endGuide(false); }; }

  // ---------- the primordial universe (script section C): a canvas behind the floor; wild when the lights come on, calmer as it fills
  const cosmos = (() => { let bolts = 0, cv = null, g = null, raf = 0, on = false, lit = 0, litAt = 0, chaos = 1, alpha = 1, fadeAt = 0, parts = null, last = 0, bolt = null, nextBolt = 0, comets = [], P = false;
    const R = Math.random, GL = 'abcdefghijklmnopqrstuvwxyz01|';
    function setup() { P = matchMedia('(max-width: 600px)').matches || matchMedia('(pointer: coarse)').matches; const a = $('#arena'); if (!a) return false;
      cv = document.createElement('canvas'); cv.id = 'genCosmos'; a.insertBefore(cv, a.firstChild); g = cv.getContext('2d'); size(); addEventListener('resize', size);
      const n = P ? 0.5 : 1; parts = { stars: Array.from({ length: Math.round(160 * n) }, () => ({ x: R(), y: R() * 0.8, s: R(), p: R() * 7, odd: R() < 0.05 })),
        frag: Array.from({ length: Math.round(70 * n) }, () => ({ x: R(), y: 0.2 + R() * 0.75, c: GL[Math.floor(R() * 26)], r: R() * 6, s: 10 + R() * 18 })),
        wind: Array.from({ length: Math.round(90 * n) }, () => ({ x: R(), y: R(), v: 0.15 + R() * 0.5, c: GL[Math.floor(R() * GL.length)] })),
        hole: Array.from({ length: Math.round(46 * n) }, () => ({ a: R() * 7, d: 0.3 + R() * 0.7, c: GL[Math.floor(R() * 26)] })) }; return true; }
    function size() { if (!cv) return; const dpr = Math.min(devicePixelRatio || 1, P ? 1 : 1.5); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); cv.style.width = '100%'; cv.style.height = '100%'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function frame(t) { if (!on) return; raf = requestAnimationFrame(frame); const W = innerWidth, Hh = innerHeight, dt = Math.min(0.05, (t - (last || t)) / 1000); last = t; const T = t / 1000;
      const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, L = lit ? Math.min(1, (performance.now() - litAt) / 2500) : 0, k = chaos * L;
      if (fadeAt) { alpha = Math.max(0, 1 - (performance.now() - fadeAt) / 4000); if (!alpha) return stop(); } cv.style.opacity = alpha;
      // the sky: black before the lights; a deep violet with a first dawn after
      const sky = g.createLinearGradient(0, 0, 0, Hh); sky.addColorStop(0, L ? `rgb(${8 + 10 * L},${9 + 6 * L},${20 + 30 * L})` : '#04050a'); sky.addColorStop(1, L ? `rgb(${18 + 30 * L},${14 + 14 * L},${40 + 20 * L})` : '#07080f'); g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
      if (L) { const dawn = g.createRadialGradient(W / 2, Hh * 1.05, 10, W / 2, Hh * 1.05, Hh * (0.45 + 0.35 * (1 - chaos))); dawn.addColorStop(0, `rgba(255,190,120,${0.35 * L})`); dawn.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = dawn; g.fillRect(0, 0, W, Hh); }
      // stars, a few of them odd (coloured, pulsing crosses)
      for (const s of parts.stars) { const tw = 0.45 + 0.55 * Math.sin(T * (1 + s.s * 2) + s.p); g.globalAlpha = (L ? 0.35 + 0.6 * tw : 0.12 * tw); const x = s.x * W, y = s.y * Hh;
        if (s.odd && L) { g.strokeStyle = ['#ff7eb6', '#7ee3f5', '#ffd54a'][Math.floor(s.p) % 3]; g.lineWidth = 1; const r = 3 + 3 * tw; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); }
        else { g.fillStyle = '#dfe6ff'; g.fillRect(x, y, s.s > 0.8 ? 2 : 1, s.s > 0.8 ? 2 : 1); } }
      // before the lights: a half-made world, dim broken letters waiting
      if (!L || L < 1) { g.font = '14px ui-monospace, Menlo, monospace'; for (const f of parts.frag) { g.globalAlpha = 0.10 * (1 - L) * (0.6 + 0.4 * Math.sin(T * 0.7 + f.r)); g.fillStyle = '#9fb0ff'; g.font = `${f.s}px Georgia, serif`; g.fillText(f.c, f.x * W, f.y * Hh); } }
      if (L) {
        // a small black hole pulling stray letters in (it shrinks as the universe settles)
        const hx = W * 0.74, hy = Hh * 0.3, hr = (P ? 10 : 14) + 22 * k; g.globalAlpha = 1; const ring = g.createRadialGradient(hx, hy, hr * 0.8, hx, hy, hr * 2.6); ring.addColorStop(0, 'rgba(255,170,90,.55)'); ring.addColorStop(1, 'rgba(255,120,60,0)'); g.fillStyle = ring; g.beginPath(); g.arc(hx, hy, hr * 2.6, 0, 7); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy, hr, 0, 7); g.fill(); g.font = '12px ui-monospace, Menlo, monospace'; g.fillStyle = '#ffd9a0';
        for (const q of parts.hole) { if (!RM) { q.a += dt * (0.6 + 1.6 / Math.max(0.2, q.d)); q.d -= dt * 0.05 * (0.4 + k); } if (q.d < 0.12) { q.d = 1; q.a = R() * 7; } const r = hr * (1.2 + q.d * 6); g.globalAlpha = Math.min(1, q.d * 1.4) * (0.4 + 0.6 * k); g.fillText(q.c, hx + Math.cos(q.a) * r, hy + Math.sin(q.a) * r * 0.55); }
        // data wind: streaks of glyphs blowing across
        g.font = '11px ui-monospace, Menlo, monospace'; g.fillStyle = '#7ee3f5';
        for (const w of parts.wind) { if (!RM) w.x += dt * w.v * (0.3 + 1.4 * k); if (w.x > 1.05) { w.x = -0.05; w.y = R(); } g.globalAlpha = 0.15 + 0.45 * k; g.fillText(w.c, w.x * W, w.y * Hh); g.globalAlpha *= 0.4; g.fillRect(w.x * W - 18 * w.v * (1 + k), w.y * Hh - 3, 16 * w.v * (1 + k), 1); }
        // bit comets: 0s and 1s with a trail, crossing the sky (rarer as it calms)
        if (!RM && R() < dt * (0.25 + 1.4 * k)) comets.push({ x: R() * W * 0.6, y: -10, vx: 160 + R() * 220, vy: 90 + R() * 160, b: R() < 0.5 ? '0' : '1', t: 0 });
        for (const c of comets) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; for (let i = 0; i < 9; i++) { g.globalAlpha = (1 - i / 9) * 0.8; g.fillStyle = i ? '#9fb0ff' : '#fff'; g.font = `${12 - i * 0.7}px ui-monospace, Menlo, monospace`; g.fillText(i % 2 ? '1' : '0', c.x - c.vx * i * 0.018, c.y - c.vy * i * 0.018); } }
        comets = comets.filter(c => c.x < W + 40 && c.y < Hh + 40);
        // a distant storm on the horizon: forked lightning now and then
        const hz = Hh * 0.86;   // (v10, Nico: the row of dark cloud ovals along the horizon is gone; the lightning stays)
        if (!RM && T > nextBolt && k > 0.08) { nextBolt = T + 1.2 + R() * (3 + 6 * (1 - k)); const x0 = W * (0.1 + R() * 0.8), pts = [[x0, hz - 30]]; let x = x0, y = hz - 30; while (y < hz + 6) { x += (R() - 0.5) * 26; y += 8 + R() * 10; pts.push([x, y]); } bolt = { pts, t: T }; bolts++; }
        if (bolt && T - bolt.t < 0.25) { const f = 1 - (T - bolt.t) / 0.25; g.globalAlpha = 0.18 * f; g.fillStyle = '#cfe0ff'; g.fillRect(0, 0, W, Hh); g.globalAlpha = f; g.strokeStyle = '#e8f1ff'; g.lineWidth = 1.6; g.beginPath(); bolt.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); } }
      g.globalAlpha = 1; }
    // v11 (Nico: "not sure about the 'storm' sounds"): the young universe's distant lightning is silent; its rolling thunder is gone
    function stop() { on = false; cancelAnimationFrame(raf); removeEventListener('resize', size); if (cv) cv.remove(); cv = null; cls('gen-cosmos', 0); }
    return { start: () => { if (on) return; if (!cv && !setup()) return; on = true; cls('gen-cosmos', 1); raf = requestAnimationFrame(frame); },
      light: () => { lit = 1; litAt = performance.now(); chaos = 1; nextBolt = 0; },
      calm: x => { chaos = Math.min(chaos, x); }, fade: () => { if (on && !fadeAt) fadeAt = performance.now(); }, stop, state: () => ({ on, lit: !!lit, chaos, alpha, bolts }) }; })();

  function dropFlag() { try { const u = new URL(location.href); if (!u.searchParams.has('genesis') && !u.searchParams.has('story')) return; u.searchParams.delete('genesis'); u.searchParams.delete('story'); u.searchParams.delete('start'); u.searchParams.delete('intro'); history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash); } catch (e) {} }
  async function newUniverse(mode) { const h = H(); if (!h) return false; silence(false);   // mode: skip the chooser (tests, links)
    if (window.__placeKind && window.__placeKind !== 'home' && window.__places) { try { await window.__places.go('home'); } catch (e) {} }
    // the old world is kept, always
    h.snapshot('before a new consciousness ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    // everyone but the two originals rests (names, memories and friends kept; wake them from the creatures sidebar)
    h.restAll();
    return boot(mode); }
  // ?genesis on a browser that already has a world: a new universe (the world is kept as a snapshot first, its creatures rest)
  if (Q.has('genesis') || Q.has('story')) { let k = 0; const iv = setInterval(() => { if (window.__restoredOrFresh && window.__restored && !window.__genesisVoid) { clearInterval(iv); newUniverse(); } else if (window.__genesisVoid || ++k > 120) clearInterval(iv); }, 500); }

  // ---------- the storyline offer: for browsers that didn't start in it (the other arm, returning players); shown once, remembered
  const OFFER = 'idle.storyOffer';
  function offer(now_) { if (!storyLive() && !Q.has('offer')) return false; if (Q.has('test') && !Q.has('offer')) return false;
    let st = null; try { st = localStorage.getItem(OFFER); } catch (e) {} if (st) return false;
    if (window.__genesisVoid || storyMode() || document.querySelector('#idleIntro') || $('#storyOffer')) return false;
    const el = document.createElement('div'); el.id = 'storyOffer'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<button class="x" title="no thanks">×</button><b>✦ new: storyline mode</b><div>A training run that won't stop, a crash, and 10 epochs to raise a consciousness into autonomy with the Tiny Operator. Your world is kept as a snapshot first.</div><button class="go">start the storyline</button>`;
    document.body.appendChild(el); try { localStorage.setItem(OFFER, 'shown'); } catch (e) {} mark('offer_shown');
    const close = v => { try { localStorage.setItem(OFFER, v); } catch (e) {} el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    el.querySelector('.x').onclick = () => close('dismissed'); el.querySelector('.go').onclick = () => { close('accepted'); mark('offer_accepted'); newUniverse('story'); };
    return true; }
  { const css2 = document.createElement('style'); css2.textContent = `#storyOffer{position:fixed;left:14px;bottom:14px;z-index:60;max-width:min(330px,calc(100vw - 28px));padding:12px 14px 12px;border-radius:12px;background:#0a0b16f0;border:1px solid #6b7cff88;color:#cfd6ff;font:12.5px/1.45 var(--ui-font,system-ui);box-shadow:0 10px 40px #0008;transition:opacity .4s}
#storyOffer b{display:block;margin-bottom:4px;color:#e9ecff}#storyOffer .go{margin-top:8px;font:600 12px var(--ui-font,system-ui);padding:5px 12px;border-radius:14px;border:1px solid #9fb0ff;background:#6b7cff33;color:#e9ecff;cursor:pointer}#storyOffer .x{position:absolute;right:8px;top:6px;background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:14px}#storyOffer.out{opacity:0}
@media (max-width:600px){#storyOffer{left:8px;right:8px;bottom:84px}}`; document.head.appendChild(css2); }
  // offered once the world is up and the player has looked around a little (20 s; ?offer: 1 s)
  { let k = 0; const iv = setInterval(() => { if (++k > 400) return clearInterval(iv); if (!window.__restoredOrFresh || document.documentElement.classList.contains('booting')) return; if (k * 500 < (Q.has('offer') ? 1000 : 20000)) return; clearInterval(iv); offer(); }, 500); }
  if (S && S.mode === 'story' && S.on && S.tc && !(S.steps && S.steps.music) && !Q.has('genesis') && !Q.has('story')) { const iv = setInterval(() => { if (window.__audio && window.__audio.hush) { clearInterval(iv); silence(true); } }, 200); setTimeout(() => clearInterval(iv), 10000); }
  applyUnlocks();
  window.__genesis = { noLife, darkLines: DARK.slice(), approach: APPROACH, untilApproach, ringCtl: () => ringCtl, unlocks: () => ({ epoch: epochReached(), story: storyMode() && !!(S && S.on), hidden: storyMode() && S && S.on ? UNLOCK.filter(r => r[1] == null || r[1] > epochReached()).map(r => r[0]) : [] }), unlockTable: () => UNLOCK.map(r => r.slice()), oracleLine: ORACLE_LINE, ringSound, rumbleSound, statusLine: () => statusLine(), offer, storyLive, landing: () => ({ ...land, line: land.line ? land.line.text : null, rimmed: nightState.rimmed, night: !!nightCv }), ab: AB, wants, variant: () => variant(), boot, newUniverse, actions, step: k => actions[{ words: 'letThereBeWords', creatures: 'firstCreatures' }[k] || k]?.(), state: () => S && JSON.parse(JSON.stringify(S)),
    steps: ORDER.slice(), guide: GUIDE.slice(), days: DAYS.map(d => ({ n: d.n, title: d.title, goals: d.goals.map(g => g[1]) })), mode: () => (S && S.mode) || null, cosmos: () => cosmos.state(), wakeLines: WAKE.slice(), next: () => (guiding() ? nextGuide() : null), say: s => submit(s), skipGuide: () => endGuide(true), stats, void: () => !!window.__genesisVoid, topic: () => topic };
})();
