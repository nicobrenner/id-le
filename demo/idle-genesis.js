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
  // ON since Nov 4 (Nico's go, 11-03 before bed: "deploy the A/B/C testing when it lands, all the options looked good to me, at least for first launch")
  const AB = 'on';   // the A/B switch: 'on' gives NEW browsers the storyline or the current start 50/50 (stored in this browser only, as idle.gv: story | current)
  const KEY = 'idle.genesis', GV = 'idle.gv';
  const H = () => window.__genHooks, W = () => window.__idleWorld;
  // a keyframe (idle-keys.js, staging/local only): which moment of the storyline to start at; null on id-le.com and in normal play
  const SK = window.__storyKey || null, skAfter = k => !!(SK && SK.after(k));
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
  // Epoch 1 · Attention, 2 · Feelings, 3 · Words (v16 order; storyline-script.md section D) and the rest are coming soon. S.day is the epoch reached
  // (0 until Genesis is done), S.days[n] when epoch n was done. Saves from before v11 counted Genesis's words and life as "Epoch 1":
  // load() shifts them down by one (S.ev = 2), so a save that finished the old Epoch 1 has Epoch 0 done.
  const DAYS = [
    { n: 0, title: 'genesis', goals: [['light', 'lights on'], ['words', 'words for a floor'], ['creatures', 'first life']], teaches: 'the Operator, light, words, creatures',
      front: { head: 'Epoch 0: lights, a floor, and somebody on it', body: 'Lights came on in a brand-new consciousness. Words fell and became a floor, and before long two creatures crawled out of one of them. Witnesses describe them as "surprised".' },
      line: 'epoch zero done. it has light, a floor and somebody on it. next: words' },
    // v16 (Nico: "About Epoch1, let's do: 2,3,1"): Epoch 1 · Attention (meet the creatures: tap one, read its mind, name it, feed it),
    // Epoch 2 · Feelings, Epoch 3 · Words; the UNLOCK table is unchanged (the same tools at the same moments)
    { n: 1, title: 'attention', goals: [], teaches: '' }, { n: 2, title: 'feelings', goals: [], teaches: '' }, { n: 3, title: 'words', goals: [], teaches: '' },
    ...[4, 5, 6, 7, 8, 9].map(n => ({ n, title: 'coming soon', goals: [], teaches: '' }))];
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
    // :not(#_) lifts the rule above the phone layout's own (idle-mobile.js forces '#topbar>#studioBtn' visible), and every button the
    // phone's ☰ sheet copies (#mSheet [data-for=id]) follows its original (v12: a locked studio showed at Epoch 1 on phones)
    const sel = x => { x = x.trim(); const id = /^#([\w-]+)$/.exec(x); return ['html.gen-story:not(#_) ' + x].concat(id ? [`html.gen-story:not(#_) #mSheet [data-for="${id[1]}"]`] : []); };
    const e = epochReached(); st.textContent = on ? UNLOCK.filter(r => r[1] == null || r[1] > e).flatMap(r => r[2].split(',').flatMap(sel)).join(',') + '{display:none!important}' : '';
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
html.gen-story #lab{transition:opacity .45s ease}html.gen-dawning #lab{opacity:0!important;pointer-events:none!important}#genBackdrop.dawn{transition:opacity .45s ease;opacity:0!important}
html.gen-story.gen-noclose #lab-close{display:none!important}html.gen-story.gen-box,html.gen-story.gen-box body{background:#05060c!important}html.gen-story #lab-form small,html.gen-story #ai-oracle-link{display:none!important}
.gen-tap{position:absolute;transform:translate(-50%,0);z-index:7;pointer-events:none;white-space:nowrap;font:600 15px/1 var(--ui-font,system-ui);color:#fff;background:#0a0b16d9;border:1px solid #ffcf7a;border-radius:12px;padding:6px 10px;box-shadow:0 0 14px #ffcf7a66;animation:genTap .9s ease-in-out infinite alternate}
@keyframes genTap{from{translate:0 0}to{translate:0 -6px}}@media (prefers-reduced-motion:reduce){.gen-tap{animation:none}}
.gen-ring{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2px solid #9fb0ff;pointer-events:none;z-index:6;animation:genRing 1.6s ease-out forwards}
@keyframes genRing{from{transform:scale(.3);opacity:1}to{transform:scale(9);opacity:0}}
#genConsole .gw p{font:17px/1.45 var(--op-font);color:#fff;margin:2px 0 8px}#genConsole .gw p b{color:#9fb0ff;font:600 11px ui-monospace,Menlo,monospace;margin-right:6px}
#genConsole .gcur{display:inline-block;width:.5em;height:1em;margin-left:2px;vertical-align:-2px;background:#7ee3f5;animation:genBlink 1s steps(2) infinite}
@keyframes genBlink{50%{opacity:0}}
#genBackdrop{position:fixed;inset:0;z-index:2147481990;background:#02030acc;backdrop-filter:blur(2px);transition:opacity 1.2s}#genBackdrop.out{opacity:0;pointer-events:none}
html.gen-box #lab{position:fixed!important;left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%)!important;width:min(620px,94vw)!important;height:auto!important;max-height:84vh!important;z-index:2147482000!important;border-radius:16px!important;box-shadow:0 24px 90px #000e,0 0 0 1px #6b7cff55!important;overflow:hidden!important}
html:is(.gen-box,.gen-float) #lab :is(#ai-thread,#lab-thread,#ai-bar,#ai-set,#ai-smart-btn,#ai-smart){display:none!important}
html.gen-float #lab{position:fixed!important;left:50%!important;right:auto!important;top:auto!important;bottom:28px!important;transform:translateX(-50%)!important;width:min(560px,94vw)!important;height:auto!important;max-height:52vh!important;z-index:2147482000!important;border-radius:16px!important;box-shadow:0 18px 70px #000c,0 0 0 1px #6b7cff55!important;overflow:hidden!important}
html:is(.gen-box,.gen-float) #lab{transition:opacity .45s ease!important}html:is(.gen-box,.gen-float) #lab>#genConsole{flex:0 1 auto;min-height:0;overflow:auto}html:is(.gen-box,.gen-float) #lab>:is(#lab-head,#lab-form,#opTray){flex:none}
@media (max-width:500px){html.gen-float #lab{left:0!important;right:0!important;top:var(--op-top,52px)!important;bottom:auto!important;transform:none!important;width:100%!important;max-height:min(45dvh,calc(100dvh - var(--op-top,52px) - var(--kb,0px) - 8px))!important;border-radius:0 0 16px 16px!important}}
html:is(.gen-aside,.gen-look) #lab{opacity:0!important;pointer-events:none!important}
html.gen-look :is(#toHandle,#genTag,#genDay,#lab-toggle){opacity:0!important;pointer-events:none!important;transition:opacity .6s}
#genFlash{position:fixed;inset:0;z-index:2147481980;pointer-events:none;background:#e8f1ff;opacity:0}
#genConsole .gstamp{display:inline-block;font:700 13px/1 var(--display-font,ui-monospace,Menlo,monospace);letter-spacing:.14em;color:#ffcf7a;border:1.5px solid #ffcf7a99;border-radius:4px;padding:5px 9px;margin:2px 0 10px}
#genConsole .gm{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}#genConsole .gm button{font:600 14px var(--ui-font,system-ui);padding:9px 16px;border-radius:14px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;cursor:pointer}
#genConsole .gm button.go{background:#3a46c8;border-color:#cfd6ff}#genConsole .gm button:hover{background:#2a3180}
#genConfirm{position:fixed;inset:0;z-index:2147482700;display:flex;align-items:center;justify-content:center;padding:16px;background:#02030ab8;backdrop-filter:blur(2px)}
#genConfirm .cb{width:min(400px,100%);padding:18px 20px 16px;border-radius:16px;background:#0a0b16f7;color:#e9ecff;box-shadow:0 24px 90px #000c,0 0 0 1px #6b7cff55;font:15px/1.45 var(--op-font,Georgia,serif)}
#genConfirm .cr{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}#genConfirm .cr button{flex:1 1 140px;font:600 13.5px var(--ui-font,system-ui);padding:10px 12px;border-radius:12px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;cursor:pointer}#genConfirm .cr button[data-c=stay]{background:#3a46c8;border-color:#cfd6ff}
#genChoose{position:fixed;inset:0;z-index:2147483100;background:radial-gradient(90% 70% at 50% 40%,#0d1030,#020208);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:20px;color:#cfd6ff;font:14px var(--ui-font,system-ui);transition:opacity .6s}
#genChoose.out{opacity:0;pointer-events:none}#genChoose h2{font:italic 26px Georgia,serif;color:#fff;margin:0;letter-spacing:.01em}#genChoose .sub{opacity:.7;margin:-8px 0 6px}
#genChoose .opts{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:860px}
#genChoose button{width:250px;text-align:left;padding:16px 18px;border-radius:14px;border:1px solid #8ea0ff55;background:#11143acc;color:#fff;cursor:pointer;font:13px/1.45 var(--ui-font,system-ui)}
#genChoose button:hover,#genChoose button:focus-visible{border-color:#cfd6ff;background:#1a1f55;outline:none}#genChoose button.pgv{opacity:.82;background:#0b0e2acc;border-style:dashed}#genChoose button.pgv b{font-size:14px}#genChoose button b{display:block;font:600 16px var(--ui-font,system-ui);margin-bottom:6px}
#genChoose button.rec{border-color:#cfd6ff;box-shadow:0 0 18px #9fb0ff55}#genChoose button small{opacity:.7}
@media (max-width:600px){#genChoose button{width:100%}#genChoose .opts{flex-direction:column;width:100%}}
#genDay{position:fixed;left:14px;top:14px;z-index:40;min-width:200px;max-width:min(300px,70vw);padding:10px 12px;border-radius:12px;background:#0a0b16e6;border:1px solid #6b7cff66;color:#cfd6ff;font:12px ui-monospace,Menlo,monospace;transition:opacity .8s}
#genDay .dt{font-weight:700;letter-spacing:.08em;font-size:11px;opacity:.8;margin-bottom:6px}#genDay li{list-style:none;margin:3px 0}#genDay ul{margin:0;padding:0}#genDay li.ok{color:#8fe3b4}#genDay li.ok:before{content:'✓ '}#genDay li:not(.ok):before{content:'○ '}
#genDay .dn{margin-top:6px;opacity:.6;font-size:10.5px}#genDay .wip{margin-top:4px;font-size:11px;line-height:1.45;color:#cfd6ff}#genDay .wip a{color:#9fd8ff}#genDay.soon li:before{content:'· '}#genDay .x{position:absolute;right:8px;top:6px;cursor:pointer;opacity:.6;background:none;border:0;color:inherit}
@media (max-width:600px){#genDay{bottom:auto!important;left:8px}}
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
  // the arm (v15, Nico: "maybe we need to do A/B/C testing... A: user goes into storyline mode, B: user sees choice screen, C: user goes
  // directly to playground"): 'story' (straight into the storyline: the title card), 'choose' (the chooser: 📖 the storyline / 🛝 the
  // playground), 'play' (straight into the playground's ready world; the Operator welcomes them once and offers the story). A third each,
  // only NEW browsers, only while AB is on; stored in this browser only (idle.gv). The two-arm keys migrate: 'current' (the starter world)
  // is 'play'. ?arm=story|choose|play forces one on staging and local copies only. A browser that
  // already has a world keeps it, whatever its arm.
  const ARMS = ['story', 'choose', 'play'], OLD_ARM = { current: 'play' }, armOf = v => OLD_ARM[v] || v;
  function variant(fresh0) { const f = armOf(Q.get('arm')); if (ARMS.includes(f) && testHostG()) { try { localStorage.setItem(GV, f); } catch (e) {} return f; }
    let v = null; try { v = localStorage.getItem(GV); } catch (e) {} if (OLD_ARM[v]) { v = armOf(v); try { localStorage.setItem(GV, v); } catch (e) {} }
    if (ARMS.includes(v)) return v; if (AB !== 'on' || !fresh0 || Q.has('test')) return null;   // tests (?test) get no random arm: ?arm= forces one
    v = ARMS[Math.floor(Math.random() * ARMS.length)]; try { localStorage.setItem(GV, v); } catch (e) {} return v; }
  // called by the arena for a browser with no world of its own (fresh0), before the guided start would load the starter world:
  // the story and choose arms begin here; the play arm gets the ready world (the guided start), then the Operator's welcome (playWelcome)
  function wants(fresh0) { if (Q.has('genesis') || Q.has('story')) return true; const v = !!fresh0 && variant(fresh0); return v === 'story' || v === 'choose'; }
  // the storyline is "out" on the test site and local copies, or anywhere once the A/B runs: that's where it is offered
  // ?arm= forces an arm only on the test site and local copies (never on id-le.com, where the A/B decides)
  const testHostG = () => /^staging\./.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const storyLive = () => AB === 'on' || /^staging\./.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // the Operator window's status line (Nico, v7: no second title; "consciousness 24 · epoch 0 · genesis", the epoch advancing with the story)
  const epochNow = () => (S && S.day) || 0, statusLine = () => `consciousness 24 · epoch ${epochNow()}${epochNow() === 0 ? ' · genesis' : ''}`;
  // the consciousness's tag (Nico, v9: "at the top of the operator window, or as a label/tag on the world, rather than the chat"): top-left of
  // the world, there whether the Operator's window is open or not (hidden in the dark, like all UI)
  function tag() { applyUnlocks(); if (!S || !S.on || !storyMode()) { const t = document.getElementById('genTag'); if (t) t.remove(); return; } let el = document.getElementById('genTag'); if (!el) { el = document.createElement('div'); el.id = 'genTag'; document.body.appendChild(el); } el.textContent = statusLine(); }
  { const c3 = document.createElement('style'); c3.textContent = `#genTag{position:fixed;left:14px;top:12px;z-index:41;padding:3px 9px;border-radius:9px;background:#0a0b16cc;border:1px solid #6b7cff55;color:#cfd6ff;font:600 11px/1.4 var(--term-font,ui-monospace,Menlo,monospace);letter-spacing:.04em;pointer-events:none}
html.gen-box #genTag{display:none}#genDay{top:44px!important}html.gen-story:not(.gen-calm) #genTag{top:52px}html.gen-story:not(.gen-calm) #genDay{top:84px!important}@media (max-width:600px){#genTag{top:8px;left:8px}}`; document.head.appendChild(c3); }
  const mark = k => { try { window.__funnel && window.__funnel.mark(k); } catch (e) {} };
  // silence (Nico, story v5): from the landing until the storyline's music step, sound "doesn't exist yet": everything is held at zero
  // (the player's own mute and volume aren't touched); the Operator's arrival and its sonar are visual only
  const PG = () => (window.IDLE_NAMES && window.IDLE_NAMES.play) || { icon: '🛝', short: 'the playground' };   // the playground's name (idle-runtime.js)
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
  async function intro() { if (Q.get('intro') === '0' || skAfter('logo')) return; const saveData = navigator.connection && navigator.connection.saveData;
    if (window.__intro && window.__intro.play && !saveData) {
      // Epoch 0 unless ?intro=storm|eerie|epic
      try { await window.__intro.play(Q.get('intro') ? { tone: Q.get('intro'), story: storyMode() } : { story: storyMode(), ...(SK ? { at: SK.key } : {}) }); return; } catch (e) { console.warn('genesis: intro', e); } }
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
        // v14 (Nico: "let's drop the predefined button (as long as the directions are clear, and the proper message/instruction is pre-typed...)"):
        // in the storyline there is no command button at all: the step's words are pre-typed in the input (prefill), and the line says them
        (storyMode() ? '' : `<div class="gc"><button class="glow${coarse() ? ' say' : ''}" data-gsay="1"${busy ? ' disabled' : ''}>${coarse() ? '▶ ' : ''}${esc(sayOf(g))}</button>` +
        (st.alt ? `<button class="quiet" data-galt="1"${busy ? ' disabled' : ''}>${esc(st.alt[0])}</button>` : '') + `</div>`) +
        `<div class="gh">${storyMode() ? (coarse() ? 'it is typed for you below: tap send, or say it your own way' : 'it is typed for you below: press enter, or say it your own way') : coarse() ? 'tap ▶, or type it your own way below' : 'press enter, or say it your own way'}</div>` +
        `<div class="gs">${storyMode() ? 'epoch 0 · genesis · ' : ''}step ${GD.indexOf(g) + 1} of ${GD.length} · <a data-gskip="1">skip the guide</a></div>`; }
    // v15 (Nico: "I thought we were removing the buttons with the texts instead of re-adding them for all of the sections"): in the storyline the
    // console never shows command buttons, after Genesis either (the 🛠 tray holds suggestions for whoever wants them); the playground's console keeps its chips
    else body = (storyMode() ? '' : `<div class="gc">${freeChips().map(([k, t]) => `<button data-gen="${esc(k)}"${busy ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div>`) +
      (storyMode() ? '' : `<div class="gs">${alive ? 'alive · ' : ''}${done} of ${ORDER.length} steps · or type to the Operator: "let there be music"</div>`);
    let said = wakeShown.length || wakeTyping ? `<div class="gw">${wakeShown.map(l => `<p>${esc(l)}</p>`).join('')}${wakeTyping ? `<p>${esc(wakeTyping)}<i class="gcur"></i></p>` : ''}</div>` : `<div class="gl">${esc(line || '')}</div>`;
    if (moment) { said = `<div class="gstamp">${esc(MOMENT.stamp)}</div>` + said; body = moment.ready ? `<div class="gm"><button class="go" data-gm="start">${esc(MOMENT.start)}</button><button data-gm="play">${esc(MOMENT.play())}</button></div>` : ''; }
    c.innerHTML = said + body; tag(); cls('gen-noclose', storyMode() && (!(S && S.days && S.days[0]) || !!moment));
    prefill(); trimChat(); if (storyMode() && S && S.on && !$('#op-check') && !(S.days && S.days[0])) try { renderDay(); } catch (e) {}   // the ✅ from the first line on
    try { window.__opwin && window.__opwin.refresh(); } catch (e) {} }
  // the 🛠 tray's chip in the storyline's Genesis (idle-opwin.js): the step's command, or nothing while the Operator talks or a step runs
  const chip = () => { if (!storyMode() || !guiding() || moment || !$('#genConsole')) return null; const g = nextGuide(); if (!g) return null; return { step: g, say: wakeBusy ? '' : sayOf(g), busy: !!busy }; };
  // the console line, and the same line in the Operator's thread (unless the Tiny Operator is mid-reply: it answers in its own voice)
  let quiet = false;
  function say(line) { renderConsole(line); if (quiet) return; try { const r = window.__idleAI && window.__idleAI.add && window.__idleAI.add('TO', line, 'ai'); if (r && r.classList && storyMode() && guiding()) r.classList.add('gmir'); } catch (e) {} }
  // v15 (Nico: "while still on guided tour (all of Epoch 0, until the end), don't show the history of the chat messages yet, only at the end...
  // just keep it to at the most 2-3 messages for the current brief interaction/task.. do allow the user to send random messages if they want...
  // but we only display a limited number of recent ones"): while the storyline's Genesis window is up (gen-box / gen-float), the console shows the
  // Operator's current line and the chat shows at most the last CHAT_KEEP rows of the current step (what the player typed and the replies);
  // the console's own lines (gmir) and earlier steps' rows (gold) are hidden, never removed: the whole history shows once Genesis is over
  const CHAT_KEEP = 2; let chatStep = null;
  function trimChat() { try { _trimChat(); } catch (e) {} }   // (called from renderConsole, which can run before these lines are initialised)
  function _trimChat() { const th = $('#ai-thread'); if (!th) return; const on = storyMode() && guiding() && document.documentElement.classList.contains('gen-story');
    const g = on ? (nextGuide() || (moment ? 'moment' : null)) : null;
    if (on && g !== chatStep) { chatStep = g; th.querySelectorAll(':scope > *').forEach(r => r.classList.add('gold')); }
    const rows = [...th.children], keep = on ? rows.filter(r => !r.classList.contains('gmir') && !r.classList.contains('gold')).slice(-CHAT_KEEP) : [];
    rows.forEach(r => r.classList.toggle('glast', keep.includes(r))); cls('gen-chat', on && keep.length > 0); if (keep.length) th.scrollTop = 1e9; }
  { const watch = () => { const th = $('#ai-thread'); if (!th) return false; new MutationObserver(() => trimChat()).observe(th, { childList: true }); return true; }; if (!watch()) addEventListener('DOMContentLoaded', watch, { once: true }); }

  // the chips (free mode), the glowing suggestion and its quiet alternative (guided mode), "skip the guide"
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('#genConsole [data-gen],#genConsole [data-gsay],#opTray [data-gsay],#genConsole [data-galt],#genConsole [data-gskip]'); if (!t) return;
    if (t.dataset.gskip) { endGuide(true); return; } if (busy) return;
    if (t.dataset.gsay) { const g = nextGuide(); if (g) submit(sayOf(g)); return; }
    if (t.dataset.galt) { const g = nextGuide(); if (g && STEPS[g].alt && !storyMode()) runGuided(g, STEPS[g].alt[1], STEPS[g].alt[0]); return; }
    const [k, arg] = t.dataset.gen.split(':'); const A = actions;
    ({ words: () => A.letThereBeWords(arg || ''), creatures: () => A.firstCreatures(), light: () => A.light(), weather: () => A.weather(), hut: () => A.hut(), music: () => A.music() })[k]?.(); });

  // ---------- what the player says while the guide runs
  // Enter in the Operator's input (or the send button) comes here first (document capture runs before idle-ai's own listeners).
  // Nov 4 (Nico typed "wachito" twice at the lights: the first time the v4 heads evolved the world, the second time the guide ran the lights
  // anyway after its one nudge): a guided step now advances only on
  //   - its own command, as typed for the player (command syntax, like /slash: case, punctuation and spaces don't matter; in the story and
  //     the free guide both wordings of the step count, e.g. "lights on" and "let there be light"), or
  //   - the Genesis gate (demo/genesis_gate.json, tools/genesis_gate.py): a small learned head over the Tiny Oracle's features, which must say
  //     this step with at least its threshold (picked for zero false advances on the training split; the held-out numbers are in the file).
  // Anything else gets a chat reply from the Tiny Operator with no world tools (no evolve, spawn, weather…), then a kind nudge, and the
  // command is typed back into the input. The step never runs "anyway".
  const brain = () => { try { return (window.__idleAI && window.__idleAI.cfg && window.__idleAI.cfg().brain) || 'tiny'; } catch (e) { return 'tiny'; } };
  async function runGuided(g, fn, label) { if (busy) return; if (label) try { window.__idleAI && window.__idleAI.add && window.__idleAI.add('you', label, 'you'); } catch (e) {}
    const t = input(); if (t) { t.value = ''; delete t.dataset.genPre; } await fn(); }
  // the step's own commands, both wordings (the story says "lights on", the free guide "let there be light"; the free guide's words step names its topic)
  const SAYS = { light: ['lights on', 'let there be light'], words: ['let there be words'], creatures: ['let there be life', 'bring life'], sky: ['give it weather', 'let there be music'] };
  const isCommand = (g, said) => { const n = norm(said); return n === norm(sayOf(g)) || (SAYS[g] || []).some(c => n === norm(c)) || (g === 'words' && !storyMode() && /^let there be words about [a-z0-9 ]{1,40}$/.test(n)); };
  let GATE = null; const loadGate = async () => GATE || (GATE = await fetch('genesis_gate.json').then(r => r.ok ? r.json() : null).catch(() => null));
  const gateOf = (G, x) => { if (!G || !x || x.length !== G.d) return null; const z = G.w.map((w, c) => { let s = G.b[c]; for (let d = 0; d < G.d; d++) s += w[d] * x[d]; return s; });
    const mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), sum = e.reduce((a, b) => a + b, 0), probs = {}; G.classes.forEach((c, i) => { probs[c] = e[i] / sum; });
    const top = G.classes[z.indexOf(mx)]; return { top, p: probs[top], probs }; };
  const NUDGE = {   // draft lines (Operator voice: lowercase, no trailing period); {cmd} is the step's command as typed for the player
    light: 'hmm, not quite. to turn the lights on, say "{cmd}"', words: 'hmm, not quite. to give it words, say "{cmd}"',
    creatures: 'hmm, not quite. to bring life, say "{cmd}"', sky: 'hmm, not quite. to give it a sky, say "{cmd}"',
    asleep: 'the Tiny Oracle is still waking up. say "{cmd}" and I can do it' };
  let lastGate = null;
  async function submit(text) { const g = nextGuide(); if (!g || busy) return; const t = input(); const said = String(text || '').trim() || sayOf(g);
    if (t) { t.value = ''; delete t.dataset.genPre; }
    const add = (who, msg, cls) => { try { window.__idleAI && window.__idleAI.add && window.__idleAI.add(who, msg, cls); } catch (e) {} };
    const ev = (type, extra) => { try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type, extra } })); } catch (e) {} };
    if (isCommand(g, said)) { try { window.dispatchEvent(new CustomEvent('idle:optext', { detail: { text: said, brain: 'guide' } })); } catch (e) {} add('you', said, 'you'); lastGate = { said, how: 'command' }; await STEPS[g].run(); return; }
    const O = window.__oracle, cmd = sayOf(g), refill = () => { const t2 = input(); if (t2) { t2.value = cmd; t2.dataset.genPre = '1'; } };
    const nudge = k => { S.nudge = S.nudge || {}; S.nudge[g] = (S.nudge[g] || 0) + 1; save(); ev('genesis_nudge', { step: g }); say((NUDGE[k] || NUDGE[g] || 'say "{cmd}"').replace('{cmd}', cmd)); refill(); };
    if (!(O && O.ready && window.__idleAI)) { add('you', said, 'you'); lastGate = { said, how: 'asleep' }; nudge('asleep'); return; }
    // one read of the message: the Tiny Operator's heads (for its reply) and the gate's features
    let r = null, G = null; try { const H = await window.__idleAI.heads(); r = await O.classify(said, H, true); G = await loadGate(); } catch (e) { console.warn('genesis: gate', e); }
    const gv = r && gateOf(G, r.x), thr = G && G.thr && G.thr[g];
    lastGate = { said, how: 'gate', top: gv && gv.top, p: gv && +gv.p.toFixed(3), thr, v4: r && { option: r.option, p: r.probs[r.option] } };
    ev('genesis_gate', { step: g, top: gv ? gv.top : null, p: gv ? +gv.p.toFixed(2) : null });
    if (gv && gv.top === g && thr != null && gv.p >= thr) { add('you', said, 'you'); await STEPS[g].run(); return; }
    // not this step: a short real reply (no world tools during Genesis), then the nudge
    add('you', said, 'you'); quiet = true; try { if (r) { const r2 = { ...r }; delete r2.x; await window.__idleAI.tiny(said, { noAct: true, r: r2 }); } } catch (e) { console.warn('genesis: operator', e); } finally { quiet = false; }
    nudge(g); }
  function onKey(e) { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.target || e.target.id !== 'lab-text' || !guiding() || !nextGuide()) return; if (/^\//.test(e.target.value.trim())) return;   // chat commands (/oracle) aren't steps
    e.preventDefault(); e.stopImmediatePropagation(); submit(e.target.value); }
  function onSend(e) { const b = e.target.closest && e.target.closest('#lab-send'); if (!b || !guiding() || !nextGuide()) return; e.preventDefault(); e.stopImmediatePropagation(); const t = input(); submit(t ? t.value : ''); }
  document.addEventListener('keydown', onKey, true); document.addEventListener('click', onSend, true);

  // ---------- the end of the guide: everything fades in, the free console takes over; pills and notices wait one more minute
  // the tour's last step (v10, Nico: "If you want to use your own AI model, just click here to connect to the Oracle"): one line and a small
  // glowing 🔮 in the console; the Oracle's lightbox (idle-ai.js window.__oracleBox) also opens from the Operator's chat and from ⚙ settings
  const ORACLE_LINE = 'if you ever want to bring your own AI model, click here to connect it to the Oracle';
  // v15 (Nico: "inside the operator, I don't want the Oracle so prominent, in fact the oracle should be inside the settings"): no Oracle tour step
  // or line in the Operator's chat any more; the Oracle lives in ⚙ settings (and /oracle, and the ⚡ tray in the playground)
  function offerOracle() {}
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
    if (guiding() && !g && storyMode()) { say(ln); if (!finaleNow) setTimeout(() => dayDone(0), 2600); return; }
    if (g && storyMode()) { say(ln); wakeShown = [ln, introOf(g)]; curLine = introOf(g); renderConsole(); return; }
    if (guiding() && !g) { say(ln); setTimeout(() => endGuide(false), 2200); return; }
    if (g) { say(ln); setTimeout(() => renderConsole(introOf(g)), step === 'light' && storyMode() ? dawnMs() + 2000 : 1800); } else say(ln); }   // v13: "Nice!!" waits out the dawn
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
      if (storyMode()) aside(1);
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
      rain(fresh); if (storyMode()) { ticks(); windIn(); setTimeout(() => aside(0), WORDS_MS); } cosmos.calm(0.55); done('words', kind === 'first' ? pick(LINES.first) : null, null, { kind, n: fresh.length }); return fresh.length; } }
  const WORDS_MS = 2800;   // the words' rain and chimes, then the window comes back
  async function _firstCreatures(family) { { const h = H(); if (!h) return null; if (did('creatures')) return 'already';
      // the storyline: life only at its own step, after the words (v10, Nico: "right after words, a first creature appears... why?")
      if (storyMode() && !did('words')) return 'notyet';
      lifeNow = true; try { return storyMode() ? await finale(family) : await _firstCreaturesIn(family); } finally { lifeNow = false; } } }
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
  // v14, the storyline's life (Nico: "on let there be life, do: 1-3 lightning/thunder effects, creatures appear, (or maybe for each thunder 1
  // creature appears, total 3?), wait 1-3 seconds after the 3rd one, start background music.... and only after maybe 5-10 seconds of the user
  // looking around, then pop the Epoch 1 thing"): the window steps aside; three strikes, each with a far thunder, each bringing one creature
  // (the two originals, then a newborn crawly); quiet with the wind; the music; a look around with no UI at all (LOOK_MS, sooner after a
  // creature's card opens); then the Operator's Epoch 0 moment
  const LIFE = { gap: 1500, quiet: 2000, look: 7000, lookAfterCard: 2500, hintAfter: 3000 };
  // v15 (Nico: "Shuold we add some dialog on the creatures after they first show up? something kind of signalling the user to click them...."):
  // each of the three says its first words as it appears (its own bubble, its family's voice); during the look-around a soft ring pulses on
  // them and, after ~3 s, a small "👆 tap me" bobs by the first one (until the player has tapped a creature once, ever). DRAFT lines (Nico to tune)
  const FIRST_LINES = ['…hello?', 'is this… light?', 'who are you?'], TAP_HINT = '👆 tap me';
  const firstWords = (c, i) => { try { const R = window.__raveHooks; if (!c || !R || !R.say) return; R.say(c, FIRST_LINES[i] || FIRST_LINES[0]); clearTimeout(c._bt); c._bt = setTimeout(() => c.bub && c.bub.classList.remove('on'), 3800); (snd.first = snd.first || []).push({ i, who: c.name, at: now() }); } catch (e) {} };
  let tapped = false; try { tapped = localStorage.getItem('idle.e0tap') === '1'; } catch (e) {}
  let finaleNow = false;
  async function finale(family) { const h = H(); finaleNow = true; aside(1); const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; snd.strikes = [];
    try { await sleep(RM ? 150 : 600);
      if (!h.words().length) await _letThereBeWords('');
      const cam = h.cam(), z = cam.z || 1, ws = h.words().filter(w => !w.carriedBy && w.text.length > 2 && w.el), cs = h.creatures(), names = [], used = new Set();
      const spot = k => { const tx = cam.x + k * Math.min(innerWidth, 900) * 0.24 / z, ty = cam.y + (k ? 30 : -30) / z; return ws.filter(w => !used.has(w)).sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0] || { x: tx, y: ty }; };
      let first = null;
      for (const [i, k] of [[0, -1], [1, 1], [2, 0]]) { const w = spot(k); used.add(w); first = first || w;
        const r = w.el ? w.el.getBoundingClientRect() : null; strike(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2, i);
        await sleep(RM ? 60 : 140); ring(w.x, w.y);
        const c0 = hold.shift(); let name = null;
        if (c0) { c0.x = c0.tx = w.x; c0.y = c0.ty = w.y + 8; if (c0.el) c0.el.style.visibility = ''; if (!cs.includes(c0)) cs.push(c0); name = c0.name; }
        else { name = W() && W().spawn(family || 'crawly'); const c = name && h.creatures().find(x => x.name === name); if (c) { c.x = c.tx = w.x; c.y = c.ty = w.y + 8; } }
        if (name) names.push(name); snd.strikes.push({ at: now(), who: name });
        { const cc = name && h.creatures().find(x => x.name === name); if (cc) setTimeout(() => firstWords(cc, i), RM ? 100 : 450); }
        if (i < 2) await sleep(RM ? 300 : LIFE.gap); }
      if (!names.length) return null;
      cosmos.calm(0.25); done('creatures', null, { x: first.x, y: first.y }, { who: names.join(', ') });
      await sleep(RM ? 400 : LIFE.quiet); music();
      cls('gen-look', 1); land.look = { t0: now(), rings: 0, hint: null }; const until0 = now() + LIFE.look, born = names.map(n => h.creatures().find(x => x.name === n)).filter(Boolean);
      let hintEl = null, lastRing = 0;
      for (let cardAt = 0; now() < until0 && !(cardAt && now() > cardAt + LIFE.lookAfterCard);) { await sleep(150);
        if (!cardAt && !RM && now() - lastRing > 1200) { lastRing = now(); born.forEach(c => ring(c.x, c.y)); land.look.rings++; }
        if (!cardAt && !tapped && !hintEl && now() - land.look.t0 > LIFE.hintAfter && born[0]) { const f = $('#floor'); if (f) { hintEl = document.createElement('div'); hintEl.className = 'gen-tap'; hintEl.textContent = TAP_HINT; f.appendChild(hintEl); land.look.hint = now(); } }
        if (hintEl && born[0]) { hintEl.style.left = born[0].x + 'px'; hintEl.style.top = (born[0].y + 26) + 'px'; }
        const wh = $('#whisper'); if (!cardAt && wh && wh.style.display === 'block' && wh.offsetParent !== null) { cardAt = now(); land.look.tap = cardAt; mark('e0_tap'); if (!tapped) { tapped = true; try { localStorage.setItem('idle.e0tap', '1'); } catch (e) {} } if (hintEl) { hintEl.remove(); hintEl = null; } } }
      if (hintEl) hintEl.remove();
      land.look.end = now(); cls('gen-look', 0); cls('gen-float', 0);
      dayDone(0); return names;
    } finally { finaleNow = false; } }
  // one strike: a fork of light from the top of the sky to the spot, a flash, and a far thunder (the logo's voice, quieter, low-passed, late)
  function strike(x, y, i) { cosmos.strike(x, y); const f = document.createElement('div'); f.id = 'genFlash'; document.body.appendChild(f);
    try { f.animate([{ opacity: 0.32 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' }).onfinish = () => f.remove(); } catch (e) { f.remove(); }
    farThunder(i); }
  function farThunder(i) { const A = window.__audio, E = window.__epoch0; try { if (!A || A.muted() || !E || !E.thunderBuf) return; const c = A.ctx(); const go = () => {
      const t = c.currentTime + 0.22 + 0.06 * i, T = E.thunderBuf(c, 1), src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(); src.buffer = T.buffer;
      lp.type = 'lowpass'; lp.frequency.value = 950 - 140 * i; g.gain.value = T.gain * GS.thunder; src.connect(lp); lp.connect(g); g.connect(A.out()); src.start(t); (snd.thunder = snd.thunder || []).push({ t, peak: T.gain * GS.thunder }); };
      if (c.state === 'running') go(); else c.resume().then(go).catch(() => {}); } catch (e) {} }
  function ring(x, y) { const f = $('#floor'); if (!f) return; const r = document.createElement('div'); r.className = 'gen-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; f.appendChild(r); setTimeout(() => r.remove(), 1700); }
  // light: the stage becomes visible (a dawn glow, a brighter grid, a horizon); the world stays in the night palette until it is alive
  async function _light() { { const h = H(); if (!h) return null; if (did('light')) return 'already';
      cls('gen-lit', 1); const a = $('#arena'); if (a && !storyMode() && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const d = document.createElement('div'); d.id = 'genDawn'; a.appendChild(d); setTimeout(() => d.remove(), 3400); }
      const w = h.world(); h.applyWorld({ ...w, day: true, ...(S && S.feat && !(w.features || []).length ? { features: S.feat } : {}), id: 'world-' + now().toString(36).slice(-4) }, 'studio');
      if (storyMode()) { dawn(); cosmos.light(); wakeShown = []; nightEnd(); mark('lights'); hum(true); } done('light', storyMode() ? LIGHTS_ON : null); return true; } }
  // v13 (Nico: "when typing/sending lights on, it's hard to tell what's going on behind the chat... after sending lights on, the chat should
  // disappear, there should be an animation of 'dawn til noon' of brightness, and then the operator window (not the sidebar), should appear
  // again"): the window fades out, the sky goes from night through dawn to noon (cosmos, DAWN_MS), the window comes back in the middle with
  // "Nice!!", and a moment later it docks as before
  const DAWN_MS = 3600, dawnMs = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : DAWN_MS;
  // v14 (Nico, on a phone: "when I was about to tap let there be words, the window/bar changed under me"; the cause: 3.2 s after the dawn the
  // centred window docked into the phone's 78% sheet, flying the button away under his finger): no dock any more. While the window is hidden
  // for the dawn it leaves the lightbox for its Genesis place (html.gen-float: low and centred; a bottom sheet of at most 45% on phones), the
  // backdrop goes, and it comes back already showing "Nice!!" and the next step, so nothing moves while it waits for a tap
  function dawn() { const ms = dawnMs(); cls('gen-dawning', 1); land.dawn = { t0: now(), ms }; const bd = $('#genBackdrop'); if (bd) bd.classList.add('dawn');
    setTimeout(() => { floatNow(); }, 480);
    setTimeout(() => { cls('gen-dawning', 0); land.dawn.back = now(); renderDay(); }, Math.max(ms, 600)); }
  function floatNow() { cls('gen-box', 0); cls('gen-float', 1); opTitle(); const bd = $('#genBackdrop'); if (bd) bd.remove(); land.float = now(); }
  // every Genesis command steps aside the same way (v14, Nico: "the operator chat doesn't disappear after each command to let the user see
  // the animation, it just stays there blocking the view"): the window fades out on send and comes back when the animation is over
  const aside = on => { cls('gen-aside', on); land.aside = land.aside || []; land.aside.push({ on: !!on, at: now() }); };
  async function _weather(kind) { { if (did('weather')) return 'already'; const ks = (W() && W().weathers()) || [];
      const k = ks.includes(kind) ? kind : pick(ks.filter(x => x !== 'clear')) || 'rain'; const r = W() && W().setWeather(k); if (!r) return null; done('weather', null, null, { kind: k }); return r; } }
  async function _hut() { { if (did('hut')) return 'already'; const h = H(); if (!h) return null;
      if (!h.words().length) await _letThereBeWords(''); if (!did('creatures')) await _firstCreatures();
      if (!window.__build || !window.__build._seed) return null; window.__build._seed(); done('hut'); return true; } }
  async function _music() { { if (did('music')) return 'already'; const m = window.__music; if (!m) return null;
      try { window.__audio && window.__audio.wantSound && window.__audio.wantSound(); } catch (e) {} try { m.setSource ? m.setSource('bg') : m.setBg(true); } catch (e) { try { m.setBg(true); } catch (e2) { return null; } }
      done('music'); return true; } }
  // every action answers { ok, result } or { error } (the Tiny Operator and the Operator's tools read that shape)
  const answer = r => r === 'busy' ? { error: 'another step is still happening' } : r === 'notyet' ? { error: 'not yet: words first' } : r === 'already' ? { ok: true, already: true } : r ? { ok: true, result: r } : { error: 'that step did not work' };
  const actions = { letThereBeWords: async x => answer(await step('words', () => _letThereBeWords(x))), firstCreatures: async f => answer(await step('creatures', () => _firstCreatures(f))), light: async () => answer(await step('light', _light)),
    weather: async k => answer(await step('weather', () => _weather(k))), hut: async () => answer(await step('hut', _hut)), music: async () => answer(await step('music', _music)) };

  // ---------- keyframes (idle-keys.js): after the opening, build what the chosen moment needs, the way a player would, then stop there
  const sleep = ms => new Promise(r => setTimeout(r, ms)), until = async (f, ms) => { for (let t = 0; t < ms && !f(); t += 100) await sleep(100); return f(); };
  async function keyAdvance() { if (!skAfter('lights')) return;
    await actions.light(); await until(() => !document.documentElement.classList.contains('gen-box'), 9000); await sleep(400);
    if (!skAfter('words')) return; await actions.letThereBeWords(''); await sleep(1900);
    if (!skAfter('life')) return; await actions.firstCreatures();
    if (!skAfter('epoch0done')) return; const b = await until(() => $('#genConsole [data-gm=start]'), 20000); if (b) $('#genConsole [data-gm=start]').click(); }

  // ---------- stats (idle-stats.js): the steps reached and the seconds each took since the one before (or since the console opened)
  function stats() { if (!S || !S.on || !S.steps) return null; const t0 = S.tc || S.t0, ks = Object.keys(S.steps).sort((a, b) => S.steps[a] - S.steps[b]), out = {}; let prev = t0;
    for (const k of ks) { out[k] = Math.max(0, Math.round((S.steps[k] - prev) / 1000)); prev = S.steps[k]; }
    return { steps: out, end: S.free ? (S.skipped ? 'skipped' : 'guided') : null, opened: !!S.tc }; }

  // ---------- boot (a first visit with ?genesis, or the genesis side of the A/B), and a new universe for anyone
  // a story-arm browser goes straight into the story until it has really begun: the console opened (S.tc), a step done, or another mode
  // chosen. Not S.n: boot() saves S (n: 1) before the intro, and the service worker's one-time isolation reload (idle-runtime.js, _coi)
  // can reload the first visit right after that, which used to send story-arm newcomers to the chooser (found 11-04 after the launch)
  const storyBegun = () => !!(S && (S.tc || (S.steps && Object.keys(S.steps).length) || (S.mode && S.mode !== 'story') || S.v10));
  async function boot(force) { if (!H()) return false;
    // which start: ?story → the storyline; ?start=free|story|ready; otherwise the chooser (script section E)
    // ('guided': the earlier guided genesis, light → words → life → weather or music, kept for links and tests)
    let mode = ['story', 'free', 'ready', 'guided'].includes(force) ? force : Q.has('story') ? 'story' : ['story', 'free', 'ready', 'guided'].includes(Q.get('start')) ? Q.get('start') : variant() === 'story' && !Q.has('genesis') && !storyBegun() ? 'story' : null;   // a new browser in the story arm goes straight in (later new consciousnesses get the chooser)
    if (!mode) mode = await chooser();
    if (mode === 'ready') { if (S) { S.on = false; save(); } applyUnlocks(); dropFlag(); return readyWorld(); }
    S = { on: true, steps: {}, t0: now(), n: ((S && S.n) || 0) + 1, mode, ev: 2 }; if (mode === 'free') S.free = now(); save(); toVoid(); dropFlag(); try { if (window.__boot && window.__boot.step) { window.__boot.step('creatures'); window.__boot.step('words'); } } catch (e) {}   // the void is the world: the loading cover can go (else it waits for its 9 s cap, and the dark with it)
    if (mode === 'free') cls('gen-calm', 0);
    // v12: in the story the game is hushed from the intro on (the intro plays past it, storyOut) and held until the music step
    if (mode === 'story') { blackCover(true); silence(true); cosmos.start(); if (SK) await SK.ready; await intro(); S.tc = now(); save(); try { H().log('genesis', { step: 'start', mode }); } catch (e) {} await landing(); await wake(); await keyAdvance(); return true; }
    await intro(); S.tc = now(); save(); openConsole(); try { H().log('genesis', { step: 'start', mode }); } catch (e) {} return true; }
  // the chooser (v13, Nico: "what we currently call 'free play', the story-less space, let's call it the playground… And then there's the
  // storyline of the Doc"): two worlds, the storyline and the playground; the playground starts as a ready world (creatures already
  // living), or from nothing (the void and the console, every step by hand) as its smaller second option. Mode keys stay 'ready' and 'free'.
  // on id-le.com the storyline isn't offered yet (it's still being written): the chooser shows the other two
  function chooser() { return new Promise(res => { const el = document.createElement('div'); el.id = 'genChoose'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<h2>a new consciousness</h2><div class="sub">how do you want to begin?</div><div class="opts">
${storyLive() || Q.has('story') ? `<button class="rec" data-m="story"><b>📖 the storyline</b>Doc's story, epoch by epoch: a training run that won't stop, a crash, and a consciousness to raise into autonomy<br><small>recommended</small></button>` : ''}
<button data-m="ready"><b>${esc(PG().icon + ' ' + PG().short)}</b>every feature, free play, your own worlds: it starts with creatures already living</button>
<button class="pgv" data-m="free"><b>✦ ${esc(PG().short)}, from nothing</b>the void and the Operator's console, every step by hand, no guide</button></div>`;
    document.body.appendChild(el); const end = m => { mark(m === 'story' ? 'ch_story' : 'ch_play'); if (m !== 'story') { try { localStorage.getItem(OFFER) || localStorage.setItem(OFFER, 'chose'); } catch (e) {} } el.classList.add('out'); setTimeout(() => el.remove(), 600); try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_choose', extra: { mode: m } } })); } catch (e) {} res(m); };
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
  const APPROACH = DARK.indexOf('wait, what... why is that black hole moving...'), lineDur = s => darkHold(s) + s.length / DCPS;
  // the ringing ends (v13, Nico: "the ringing lasts too long… definitely 1 or 2 messages before the Doc says 'why is there no sound?'") at the start
  // of the line two before it ("oh my god, my girlfriend…"), so "dinner" is a whole line of true silence before Doc asks about it
  const SILENT = DARK.findIndex(x => x.startsWith('and why is there no sound')), RING_END = Math.max(1, SILENT - 2);
  const untilLine = (i, d, to = RING_END) => d + DARK.slice(i + 1, to).reduce((a, x) => a + lineDur(x), 0);   // night seconds from now (line i just shown, held d s) to line `to`
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
  // then a linear fade that reaches exactly 0 at endAt (v13: the start of DARK[RING_END], two lines before 'why is there no sound?!'). The lines' clock can run
  // faster (clicks) or stop (held), so the landing re-aims the end on every line (retarget) and closes it at the approach (end)
  const RING = { peak: 0.045, attack: 0.2, drop: 0.6, hold: 0.37 };   // v13: a bit quieter (Nico: "very loud")
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
  // ---------- Genesis's sound (v13, Nico: "maybe basic background sound, like space or electric humm when 'lights on', then some effects/
  // sounds when the words show up, and finally music when life arrives, almost like a celebration... the backgroud sound could transition
  // from the electric hummm to this sort of digital ocean waves one"): the storyline's silence holds until the lights; the lights start a low
  // electric hum (past the hush, at the player's volume and mute: storyOut); the words tick in, sparse soft chimes; life lifts the hush, so the
  // world's ambience comes in (the bed: brown-noise "wind" in slow swells and a faint 55 Hz hum, arena.html's Sound.bedStart: the "digital
  // ocean"), the background music starts, and the electric hum fades out under them
  // v14 (Nico: "add the background wind sound together with the sound effects on let there be words"): the words lift the hush, so the
  // world's wind bed (the "ocean") comes in with the chimes while the electric hum fades under it (a crossfade, humOut s); the background
  // music waits for life (it is paused at the words if it was on, and started after the third strike)
  const GS = { hum: 0.05, humIn: 2.5, humOut: 5, tick: 0.03, thunder: 0.3 };
  function humSound(c, dest, t) { const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(GS.hum, t + GS.humIn); out.connect(dest);
    const sw = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); sw.gain.value = 1; lfo.frequency.value = 0.09; lg.gain.value = 0.15; lfo.connect(lg); lg.connect(sw.gain); sw.connect(out);   // a slow breath
    const os = [[55, 'sine', 0.5], [110, 'sine', 0.22], [165, 'triangle', 0.05], [220.6, 'sine', 0.035]].map(([f, ty, v]) => { const o = c.createOscillator(), g = c.createGain(); o.type = ty; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(sw); return o; });
    const buzz = c.createOscillator(), bl = c.createBiquadFilter(), bg = c.createGain(); buzz.type = 'sawtooth'; buzz.frequency.value = 110; bl.type = 'lowpass'; bl.frequency.value = 380; bg.gain.value = 0.035; buzz.connect(bl); bl.connect(bg); bg.connect(sw);   // mains buzz
    const n = c.sampleRate * 4, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const ns = c.createBufferSource(), nl = c.createBiquadFilter(), ng = c.createGain(); ns.buffer = b; ns.loop = true; nl.type = 'lowpass'; nl.frequency.value = 300; ng.gain.value = 0.25; ns.connect(nl); nl.connect(ng); ng.connect(sw);   // space: a low hiss
    const all = [...os, buzz, ns, lfo]; all.forEach(o => o.start(t)); let gone = false;
    return { out, fade: (at, secs = GS.humOut) => { if (gone) return; gone = true; const g = out.gain; try { g.cancelAndHoldAtTime(at); } catch (e) { g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); } g.linearRampToValueAtTime(0.0001, at + secs); all.forEach(o => { try { o.stop(at + secs + 0.1); } catch (e) {} }); } }; }
  const TICK_HZ = [880, 987.8, 1174.7, 1318.5, 1568, 1760];   // A major pentatonic, up high and soft
  function tickSound(c, dest, t, i = 0) { const f = TICK_HZ[i % TICK_HZ.length], o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.995, t + 0.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(GS.tick, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.45);
    const n = Math.floor(c.sampleRate * 0.004), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n);   // a tiny click as it lands
    const s = c.createBufferSource(), hp = c.createBiquadFilter(), cg = c.createGain(); s.buffer = b; hp.type = 'highpass'; hp.frequency.value = 3000; cg.gain.value = GS.tick * 0.35; s.connect(hp); hp.connect(cg); cg.connect(dest); s.start(t); }
  const tickPlan = (n = 12, span = 1.7) => { let x = 0; const out = []; for (let i = 0; i < n; i++) { x += 0.04 + Math.random() * (2 * span / n - 0.04); out.push(Math.min(span, x)); } return out; };   // sparse, uneven
  const gsCtx = go => { const A = window.__audio; try { if (!A || A.muted()) return false; const c = A.ctx(); if (c.state === 'running') go(c, A.storyOut()); else c.resume().then(() => go(c, A.storyOut())).catch(() => {}); return true; } catch (e) { return false; } };
  let humCtl = null; const snd = { hum: null, ticks: 0, life: null, wind: null, strikes: [], thunder: [] };
  function hum(on) { if (on) { if (humCtl) return; gsCtx((c, dest) => { if (humCtl) return; const t = c.currentTime + 0.02; humCtl = humSound(c, dest, t); humCtl.c = c; snd.hum = { t0: t, at: now() }; }); return; }
    if (humCtl) { humCtl.fade(humCtl.c.currentTime); snd.hum && (snd.hum.fadeAt = now()); humCtl = null; } }
  function ticks() { gsCtx((c, dest) => { const t = c.currentTime + 0.05; tickPlan().forEach((dt, i) => tickSound(c, dest, t + dt, i)); snd.ticks += 12; snd.ticksAt = now(); }); }
  function windIn() { snd.wind = { at: now() }; try { const m = window.__music; if (m && m.source && m.source() === 'bg' && m.setBg) { m.setBg(false); snd.wind.pausedBg = true; } } catch (e) {}
    silence(false); hum(false); }
  function music() { snd.life = { at: now() }; reward(); hum(false); }   // the celebration, after the strikes: the background music (the hush is already lifted)
  async function landing() { if (Q.has('nolanding')) { blackCover(false); land = { phase: 'done', clicks: 0, why: 'flag' }; return; }
    // keyframes past the Operator's arrival: the dark is there (for the sonar and the lights), without the lines or the arrival
    if (skAfter('operator')) { for (let i = 0; i < 200 && document.documentElement.classList.contains('booting'); i++) await new Promise(r => setTimeout(r, 100));
      land = { phase: 'sonar', clicks: 0, t0: now(), shown: 0, pings: 0, why: 'key' }; nightStart(matchMedia('(prefers-reduced-motion: reduce)').matches); silence(true); blackCover(false); return; }
    // the night starts when the game's loading cover has gone (skipping the intro right away can land before it)
    for (let i = 0; i < 200 && document.documentElement.classList.contains('booting'); i++) await new Promise(r => setTimeout(r, 100));
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; land = { phase: 'dark', clicks: 0, t0: now(), shown: 0, pings: 0 }; blackCover(true); nightStart(RM); mark('landing'); ringing(untilLine(-1, 3.0)); setTimeout(() => silence(true), 2800); setTimeout(() => blackCover(false), 1500);
    const skipB = document.createElement('button'); skipB.id = 'genNightSkip'; skipB.textContent = 'skip ›'; skipB.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147481997;font:600 12px var(--ui-font,system-ui);color:#cdbf9a;background:#0b0f18cc;border:1px solid #2b6f86;border-radius:14px;padding:5px 12px;cursor:pointer;opacity:.75';
    document.body.appendChild(skipB);
    await new Promise(res => { let i = -1, timer = 0, downAt = 0, done = false;
      const st = nightState, next = () => { clearTimeout(timer); if (done) return; i++; if (i >= DARK.length) return finish('lines'); const text = DARK[i];
        land.line = { text, t0: st.t }; land.shown = i + 1; if (i === DARK.length - 2 && !land.shakeT) { land.shakeT = st.t; rumble(true); } land.shake = !!land.shakeT; st.k = (i + 1) / DARK.length; const d = darkHold(text) + text.length / DCPS; if (i < RING_END) ringAim(untilLine(i, d)); else if (i === RING_END) { land.ringEndSt = st.t; ringAim(0); } if (i === APPROACH) land.approachSt = st.t; wait(d); };
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
      document.addEventListener('pointerdown', onDown, true); document.addEventListener('pointerup', onUp, true);
      if (SK && SK.is('operator')) { setTimeout(() => blackCover(false), 300); finish('key'); return; }   // the keyframe: straight to the Operator's arrival
      wait(3.0); });   // pitch black 1.5 s (the ringing), the hole comes up, then the first line
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
    const fast = skAfter('operator');   // a later keyframe: the opening is already said
    for (const line of WAKE) { if (RM || fast) { wakeShown.push(line); renderConsole(); if (!fast) await new Promise(r => setTimeout(r, 900)); continue; }
      for (let i = 1; i <= line.length; i += 2) { if (skip) break; wakeTyping = line.slice(0, i); renderConsole(); await new Promise(r => setTimeout(r, 26)); }
      wakeTyping = ''; wakeShown.push(line); renderConsole(); if (!skip) await new Promise(r => setTimeout(r, Math.min(1600, 500 + line.length * 18))); skip = false; }
    if (lab) lab.removeEventListener('pointerdown', onTap);
    wakeBusy = false; try { WAKE.forEach(l => window.__idleAI && window.__idleAI.add && window.__idleAI.add('TO', l, 'ai')); } catch (e) {}
    curLine = WAKE[WAKE.length - 1]; wakeShown = WAKE.slice(); renderConsole(); }
  // the window is the Operator's (v10, Nico: "the sidebar chat is Operator"; the 🔮 Oracle is its own lightbox); since v14 it never docks
  function opTitle() { const b = $('#lab-head b'), N = window.IDLE_NAMES; if (!b || !N) return; b.textContent = N.op.icon + ' ' + N.op.short; }

  // ---------- the epochs: the goal card, and a front page when an epoch is done
  // the end of what's built (v12, Nico: "at the end of the current progres of the game to be very clear: WIP/check out the Roadmap ^^ join
  // us on Github: ... / Free-play"): the first epoch that isn't built yet opens as a card in the middle (S.endOpen) with the three ways on;
  // closed (×, the roadmap, GitHub) it is the small corner card, whose "what's next ›" opens it again. Free-play leaves the storyline.
  const END = { head: 'work in progress', line: "that's as far as the story goes, for now. the scientists are building the next epochs, one at a time",
    help: 'you can help: vote on what comes next, or build it with us', free: () => `welcome to ${PG().short}. everything is open now, and it is your consciousness, Doc`,
    back: 'whenever you want the story back: 📖 back to the story in 🛠, or ⚙ → 📖 Storyline' };   // v16: the way back, said
  { const c4 = document.createElement('style'); c4.textContent = `html:root #genDay.end.end{left:50%!important;top:50%!important;bottom:auto!important;right:auto!important;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));min-width:0;max-width:none;max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:20px 22px 16px;z-index:2147482400;background:#0a0b16f7;box-shadow:0 24px 90px #000c,0 0 0 1px #6b7cff55}
#genDay.end .eb{display:inline-block;font:700 10px/1 var(--display-font,ui-monospace,Menlo,monospace);letter-spacing:.16em;text-transform:uppercase;color:#ffcf7a;border:1px solid #ffcf7a88;border-radius:4px;padding:4px 7px;margin-bottom:10px}
#genDay.end .dt{font:700 22px/1.15 var(--display-font,ui-monospace,Menlo,monospace);letter-spacing:.08em;color:#fff;opacity:1;margin-bottom:4px}
#genDay.end .el{font:16px/1.45 var(--op-font,Georgia,serif);color:#fff;margin:8px 0}
#genDay.end .ea{display:flex;flex-direction:column;gap:8px;margin-top:14px}
#genDay.end .ea>*{display:block;text-align:center;font:600 14px/1.2 var(--ui-font,system-ui);padding:10px 14px;border-radius:12px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;text-decoration:none;cursor:pointer}
#genDay.end .ea>*:hover,#genDay.end .ea>*:focus-visible{background:#2a3180;outline:none}#genDay.end .ea [data-end=free]{background:#3a46c8;border-color:#cfd6ff}
#genDay.end .en{margin-top:12px;font:11.5px/1.45 var(--ui-font,system-ui);opacity:.65}#genDay .wip a{cursor:pointer;text-decoration:underline dotted;color:#9fd8ff}
@media (max-width:600px){#genDay.end{padding:16px 16px 12px}#genDay.end .dt{font-size:19px}#genDay.end .el{font-size:15px}}
#lab>#genDay.inop{position:static!important;inset:auto!important;transform:none!important;display:none;flex:none;min-width:0;max-width:none;margin:6px 10px 0;padding:8px 12px;border-radius:10px;font-size:12.5px;z-index:auto;opacity:1!important;pointer-events:auto!important}
#lab.chk-open>#genDay.inop{display:block}#lab>#genDay.inop .x{display:none}#lab>#genDay.inop .dt{font-size:11px;margin-bottom:4px}
#op-check{margin-left:auto;margin-right:6px;font:600 12px/1 var(--ui-font,system-ui);padding:4px 9px;border-radius:10px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer;min-height:28px}
#lab.chk-open #op-check{background:#2f9e6a33;border-color:#8fe3b4}#op-check+#op-tools{margin-left:0}
html.gen-story.gen-chat:is(.gen-box,.gen-float) #lab #ai-thread{display:block!important;flex:0 1 auto;min-height:0;max-height:30vh;overflow:auto;padding:4px 10px 6px;font-size:14px}
html.gen-story:is(.gen-box,.gen-float) #lab #ai-thread>:not(.glast){display:none!important}
#op-check.flash{animation:opChk 1.6s ease-out}@keyframes opChk{0%{box-shadow:0 0 0 0 #8fe3b4cc;background:#2f9e6a88}100%{box-shadow:0 0 0 14px #8fe3b400}}
@media (prefers-reduced-motion:reduce){#op-check.flash{animation:none;background:#2f9e6a66}}`; document.head.appendChild(c4); }
  const builtNext = n => { const d = dayOf(n); return !!(d && d.goals && d.goals.length); };
  // v15 (Nico: "the little panel with the checklist (Epoch 0 Genesis), kinda of blocks the little bit of view that the user has behind/around
  // the operator - we should keep that checklist within a ✅ section that shows the tasks, and it's toggable, at the top/inside the operator chat
  // window"): during Genesis the epoch's checklist lives inside the Operator's window, under a ✅ in its header (collapsed by default; the ✅
  // flashes when an item is ticked). Later epochs' small "coming soon" card and the end card stay where they were.
  function checkBtn(show, n) { const head = $('#lab-head'); let b = $('#op-check');
    if (!show) { if (b) b.remove(); const l = $('#lab'); if (l) l.classList.remove('chk-open'); return; }
    if (!b && head) { b = document.createElement('button'); b.id = 'op-check'; b.type = 'button'; b.title = 'the epoch\'s tasks'; b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', e => { e.stopPropagation(); const l = $('#lab'); if (!l) return; const on = !l.classList.contains('chk-open'); l.classList.toggle('chk-open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
      const t = $('#op-tools') || $('#lab-close'); if (t) head.insertBefore(b, t); else head.appendChild(b); }
    if (!b) return; b.textContent = '✅ ' + n; if (b.dataset.n && +b.dataset.n < parseInt(n)) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1700); } b.dataset.n = parseInt(n); }
  // a closed end card shrinks toward the ✅ in the Operator's title bar when it's on screen, otherwise toward the 📟 (shrinkEnd)
  window.__epochTarget = () => { for (const sel of ['#op-check', '#toHandle']) { const e = $(sel); if (e && !e.hidden && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width) return e; } return null; };
  function renderDay() { if (!storyMode()) { const g = $('#genDay'); if (g) g.remove(); checkBtn(false); return; } tag(); const d = dayOf(S.day || 0); if (!d) return; let el = $('#genDay');
    const ok = k => S.days && S.days[d.n] ? true : (d.n === 0 ? did(k) : false), soon = d.n > 0 && !builtNext(d.n), end = soon && !!S.endOpen;
    // the Genesis checklist always lives in ✅; a later epoch's card goes there once the player closes it (never lost: manager v15 item 6)
    const inop = !end && ((d.n === 0 && !soon && !(S.days && S.days[0])) || !!(S.dayIn && S.dayIn[d.n])), lab = $('#lab');
    if (!inop) checkBtn(false);
    if (!inop && document.documentElement.classList.contains('gen-box')) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'genDay'; }
    if (inop && lab) { const c = $('#genConsole'), h = $('#lab-head'); if (el.parentNode !== lab) { if (h && h.nextSibling) lab.insertBefore(el, h.nextSibling); else lab.prepend(el); } }
    else if (el.parentNode !== document.body) document.body.appendChild(el);
    el.classList.toggle('inop', inop); if (inop) checkBtn(true, `${d.goals.filter(([k]) => ok(k)).length}/${d.goals.length}`);
    el.classList.toggle('soon', soon); el.classList.toggle('end', end); el.setAttribute('role', end ? 'dialog' : 'status');
    const repo = esc(window.IDLE_REPO || 'https://github.com/nicobrenner/id-le'), title = `EPOCH ${d.n} · ${esc(d.title.toUpperCase())}`;
    if (end) el.innerHTML = `<button class="x" title="close">×</button><div class="eb">${esc(END.head)}</div><div class="dt">${title}</div>
<p class="el">${esc(END.line)}</p><p class="el">${esc(END.help)}</p>
<div class="ea"><button data-end="roadmap">🗺 check out the roadmap</button><a data-end="github" href="${repo}" target="_blank" rel="noopener">⭐ join us on GitHub</a><button data-end="free">${esc(PG().icon + ' ' + PG().short)}</button></div>
<div class="en">${esc(PG().short)} opens every part of Id|le now and keeps this consciousness as it is. when Epoch ${d.n} ships, ⚙ settings takes you back into the story.</div>`;
    else el.innerHTML = `<button class="x" title="hide">×</button><div class="dt">${title}</div><ul>${d.goals.map(([k, t]) => `<li class="${ok(k) ? 'ok' : ''}">${esc(t)}</li>`).join('')}</ul>` +
      (soon ? `<div class="wip">coming soon · Id|le is a work in progress · <a data-end="open">what's next ›</a></div>` : `<div class="dn">${esc('teaches: ' + d.teaches)}</div>`);
    el.querySelector('.x').onclick = () => { if (end) { shrinkEnd(); S.endOpen = false; save(); renderDay(); } else if (inop) { const l = $('#lab'); if (l) l.classList.remove('chk-open'); } else { S.dayIn = S.dayIn || {}; S.dayIn[d.n] = 1; save(); renderDay(); } };
    el.querySelectorAll('[data-end]').forEach(b => b.addEventListener('click', e => endChoice(b.dataset.end, e))); }
  function showEnd() { if (!storyMode() || !S || S.endOpen || builtNext(S.day || 0)) return; S.endOpen = true; S.endAt = S.endAt || now(); save(); mark('end_shown'); renderDay();
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_end', extra: { epoch: S.day || 0 } } })); } catch (e) {} }
  function endChoice(k, e) {
    if (k === 'open') { S.endOpen = true; save(); renderDay(); return; }
    if (k === 'roadmap') { mark('end_roadmap'); shrinkEnd(); S.endOpen = false; save(); renderDay(); try { window.__feedback && window.__feedback.open('road', null, null, 'end'); } catch (er) {} return; }
    if (k === 'github') { mark('end_github'); return; }   // the link opens in a new tab; the card stays
    if (k === 'free') confirmPlay(go => { if (go) { mark('end_free'); freePlay(); } }); }
  // free-play: every feature now, the same world; the storyline can be picked up again from ⚙ (resumeStory)
  function freePlay() { if (!S) return; S.mode = 'free'; S.fp = now(); S.endOpen = false; S.free = S.free || now(); save(); silence(false); cls('gen-calm', 0); cls('gen-hush', 0);
    const g = $('#genDay'); if (g) g.remove(); applyUnlocks(); tag(); say(END.free()); setTimeout(() => say(END.back), 1200); { const l = $('#lab'); if (l && !l.classList.contains('open')) { const t = $('#lab-toggle'); if (t) t.click(); } }   // v14: the Operator's window says it
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_free', extra: { epoch: S.day || 0 } } })); } catch (e) {} }
  const canResume = () => !!(S && S.on && S.fp && S.mode === 'free' && storyLive());
  function resumeStory() { if (!canResume()) return false; S.mode = 'story'; delete S.fp; save(); applyUnlocks(); renderDay(); renderConsole(); return true; }
  // ---------- the centred cards are modal (v16, Nico: "sometimes at the bottom a notification might show up about a new reel, if I tap that, it
  // seems like it might open the reel, but behind the lightbox of the epoch1... it shouldn't"): while the Epoch 0 moment or the end card is up,
  // html.gen-modal: a backdrop absorbs taps outside it, toasts and notices are held (window.__notify queues them, shown when it closes), and
  // other features ask window.__modal.up() before opening anything (the HITL invite, the iPhone hint). The ways out: × (the card shrinks into the
  // 📟, so the player sees where it went), 🗺 the roadmap and 🛝 the playground (they close it first), ⭐ GitHub (a new tab; the card stays)
  const MODAL = { held: [], shown: 0 }; let origNotify = null;
  const modalUp = () => !!(moment || (S && S.endOpen && document.querySelector('#genDay.end')));
  function modalSync() { const up = modalUp(); cls('gen-modal', up); let bd = $('#genModalBd');
    if (up && !moment && !bd) { bd = document.createElement('div'); bd.id = 'genModalBd'; document.body.appendChild(bd); } else if ((!up || moment) && bd) bd.remove();
    if (!up && MODAL.held.length && origNotify) { const h = MODAL.held.splice(0); h.forEach((a, i) => setTimeout(() => { try { origNotify(...a); MODAL.shown++; } catch (e) {} }, 500 + i * 700)); } }
  function wrapNotify() { const n = window.__notify; if (!n || n.__held) return; const w = (...a) => { if (modalUp()) { MODAL.held.push(a); return null; } return n(...a); }; Object.assign(w, n); w.__held = true; origNotify = n; window.__notify = w; }
  ['pointerdown', 'click', 'touchstart'].forEach(t => document.addEventListener(t, e => { if (!document.documentElement.classList.contains('gen-modal')) return;
    if (e.target.closest && e.target.closest('#genDay.end, #lab, #genConfirm, #genResume, #oracle, #stagingRibbon')) return;
    e.stopPropagation(); if (t !== 'touchstart') e.preventDefault(); }, true));
  setInterval(() => { wrapNotify(); modalSync(); }, 400);
  window.__modal = { up: modalUp, held: () => MODAL.held.length, shown: () => MODAL.shown };
  // where a closed card goes (v15's ✅ checklist in the Operator may point it elsewhere: window.__epochTarget); the 📟 by default
  function shrinkEnd() { const el = $('#genDay.end'); if (!el) return; const a = el.getBoundingClientRect(); let t = null; try { t = window.__epochTarget && window.__epochTarget(); } catch (e) {}
    t = t || ($('#toHandle') && !$('#toHandle').hidden ? $('#toHandle') : $('#lab-head')); const b = t ? t.getBoundingClientRect() : { left: innerWidth - 40, top: innerHeight - 40, width: 24, height: 24 };
    const g = document.createElement('div'); g.id = 'genShrink'; Object.assign(g.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' }); document.body.appendChild(g);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), k = Math.max(0.05, b.width / a.width);
    try { g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.2 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 10 : 520, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => g.remove(); } catch (e) { g.remove(); }
    land.shrink = { to: t && t.id, at: now() }; const h = $('#toHandle'); if (h) { h.classList.add('glow'); setTimeout(() => h.classList.remove('glow'), 2600); } }
  { const c6 = document.createElement('style'); c6.textContent = `#genModalBd{position:fixed;inset:0;z-index:2147482390;background:#02030a8c;backdrop-filter:blur(2px)}
html.gen-modal :is(#ntf,#notice,#distoast,#iosHintToast,#storyOffer){visibility:hidden!important}
#genShrink{position:fixed;z-index:2147482450;border-radius:12px;background:#0a0b16f0;box-shadow:0 0 0 1px #6b7cff88,0 10px 40px #000a;pointer-events:none;transform-origin:center}`; document.head.appendChild(c6); }

  // ---------- ⚙ 📖 Storyline (v16, Nico: "after going through the story all the way to Epoch1, I clicked to go to the playground... but then it's
  // not clear how to go back. And when I clicked the Story button in the settings, it took me all the way to the start of the story.. even though
  // I had already completed it... so, like Netflix shows maybe, it should ask: [Restart story mode] [Resume play (Epoch1 - Unamed)]"): one row;
  // with no story yet it starts one; with progress (finished or not) it asks: resume where it was, or restart (the world kept as a snapshot)
  const RESUME = { title: '📖 the storyline', resume: l => `▶ resume (${l})`, restart: '↺ restart the story', note: 'restarting keeps this world as a snapshot first' };
  const storyProgress = () => !!(S && S.on && (S.mode === 'story' || S.fp) && (S.tc || (S.steps && Object.keys(S.steps).length)));
  function worldName() { try { const f = JSON.parse(localStorage.getItem('idle.first5') || 'null'); if (f && f.named) return String(f.named); } catch (e) {} try { const w = H() && H().world(); if (w && w.name) return String(w.name); } catch (e) {} return 'unnamed'; }
  const progressOf = () => `Epoch ${epochNow()} · ${worldName()}`;
  function storyRow() { if (!storyLive()) return false; if (!storyProgress()) { newUniverse('story'); return 'start'; } storyModal(); return 'modal'; }
  function storyModal() { if ($('#genResume')) return; const el = document.createElement('div'); el.id = 'genResume'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<div class="cb"><b>${esc(RESUME.title)}</b><div class="rp">consciousness 24 · ${esc(progressOf())}</div><div class="cr"><button data-r="resume">${esc(RESUME.resume(progressOf()))}</button><button data-r="restart">${esc(RESUME.restart)}</button></div><small>${esc(RESUME.note)}</small><button class="x" data-r="close" title="close">×</button></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b && e.target !== el) return; el.remove(); const k = b ? b.dataset.r : 'close'; if (k === 'resume') resumeAt(); if (k === 'restart') { mark('st_restart'); newUniverse('story'); } }); }
  { const c5 = document.createElement('style'); c5.textContent = `#genResume{position:fixed;inset:0;z-index:2147482700;display:flex;align-items:center;justify-content:center;padding:16px;background:#02030ab8;backdrop-filter:blur(2px)}
#genResume .cb{position:relative;width:min(420px,100%);padding:20px 22px 16px;border-radius:16px;background:#0a0b16f7;color:#e9ecff;box-shadow:0 24px 90px #000c,0 0 0 1px #6b7cff55;font:14px/1.45 var(--ui-font,system-ui)}
#genResume b{display:block;font:700 18px var(--display-font,ui-monospace,Menlo,monospace);letter-spacing:.06em}#genResume .rp{margin:6px 0 14px;font:13px var(--term-font,ui-monospace,Menlo,monospace);opacity:.8}
#genResume .cr{display:flex;flex-direction:column;gap:8px}#genResume .cr button{font:600 14px var(--ui-font,system-ui);padding:11px 14px;border-radius:12px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;cursor:pointer;text-align:left}
#genResume .cr button[data-r=resume]{background:#3a46c8;border-color:#cfd6ff}#genResume small{display:block;margin-top:10px;opacity:.6;font-size:11.5px}#genResume .x{position:absolute;right:10px;top:8px;background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:16px}`; document.head.appendChild(c5); }
  // resume: back into the story where it was (today: Genesis done → Epoch 1's card, the end of what's built); the world is kept as a snapshot first
  function resumeAt() { if (!S) return false; try { H() && H().snapshot('before resuming the story ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); } catch (e) {}
    S.mode = 'story'; S.on = true; delete S.fp; save(); mark('st_resume'); applyUnlocks(); tag(); renderConsole();
    if (genesisDone() && !builtNext(S.day || 0)) { S.endOpen = false; showEnd(); } else renderDay();
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_resume', extra: { epoch: S.day || 0 } } })); } catch (e) {} return true; }
  // the playground's way back (v16): the 🛠 tray's chip and /story (idle-opwin.js asks for it)
  window.__storyBack = () => (!storyMode() && storyProgress() && storyLive()) ? { text: '📖 back to the story', act: () => storyRow() } : null;

  // the story's silence ends with Genesis (manager, v12: "a story player must not stay silent once Epoch 0 is beaten"): the master comes
  // back and the background music fades in under the Gazette's special edition, a small reward. Only the sound: the music panel (its
  // controls) still waits for its epoch in UNLOCK. A player who muted Id|le stays muted (the master keeps the mute).
  function reward() { silence(false); try { const m = window.__music; if (m && m.setBg) m.setBg(true); } catch (e) {} }
  const genesisDone = () => !!(S && S.days && S.days[0]);
  function dayDone(n) { const d = dayOf(n); if (!d || (S.days && S.days[n])) return; S.days = S.days || {}; S.days[n] = now(); S.day = n + 1; S.ev = 2; save(); if (n === 0) { mark('e1done'); reward(); }   // funnel key kept: 'e1done' = Genesis (Epoch 0) done
    try { H() && H().log('genesis', { step: 'day', day: n }); } catch (e) {} try { window.__almanac && window.__almanac.ev('genesis', 'epoch ' + n + ' done', {}); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'genesis_day', extra: { day: n } } })); } catch (e) {}
    if (n === 0 && storyMode()) { epochMoment(d); return; }
    const el = document.createElement('div'); el.id = 'genFront';
    el.innerHTML = `<div class="np"><div class="mh">THE ID|LE GAZETTE</div><div class="md">consciousness 24 · epoch ${n} · special edition</div><div class="ec">EPOCH ${n} COMPLETE</div><h3>${esc(d.front.head)}</h3><div>${esc(d.front.body)}</div><div class="to"><b>TO:</b> ${esc(d.line)}</div><button>on to epoch ${n + 1} ›</button></div>`;
    document.body.appendChild(el); el.querySelector('button').onclick = () => { el.remove(); say(d.line); renderDay(); endGuide(false); if (!builtNext(n + 1)) setTimeout(showEnd, skAfter('epoch1') ? 0 : 3800); }; }

  // ---------- v14: the end of Genesis is the Operator's moment, not the Gazette (Nico: "pop the Epoch 1 thing. At it needs a more clear
  // message, something like: 'Great job! you've seeded the consciousness with the basic elements it needs to evolve... let's keep going.
  // Next up: Epoch1, you'll need to..... ready? [start Epoch1] [Free play (leave story mode - triggers modal asking: "are you sure? (you can
  // always come back later)")]'"). The window comes back in the middle, stamped EPOCH 0 COMPLETE, and types its three lines; then the two ways
  // on. The playground asks first (a confirm, #genConfirm); "start Epoch 1" opens Epoch 1's card (for now the end of what's built).
  // DRAFT: every word below is a draft for Nico.
  const MOMENT = { draft: true, stamp: 'EPOCH 0 COMPLETE',
    lines: ["great job! you've seeded the consciousness with the basic elements it needs to evolve",
      "let's keep going. next up: Epoch 1 · Attention. you'll get to know your creatures: what they notice, what they think, what they want",
      'ready?'],
    start: 'start Epoch 1', play: () => PG().icon + ' ' + PG().short,
    confirm: { q: 'are you sure? the story will wait for you. you can always come back from ⚙', stay: 'stay in the story', go: () => 'go to ' + PG().short } };
  let moment = null;
  async function epochMoment(d) { const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; moment = { ready: false, at: now() };
    let bd = $('#genBackdrop'); if (!bd) { bd = document.createElement('div'); bd.id = 'genBackdrop'; document.body.appendChild(bd); }
    aside(1); cls('gen-float', 0); cls('gen-box', 1); { const l = $('#lab'); if (l && !l.classList.contains('open')) { const t = $('#lab-toggle'); if (t) t.click(); } } wakeShown = []; wakeTyping = ''; wakeBusy = true; curLine = ''; renderConsole(); await sleep(60); aside(0);
    for (const line of MOMENT.lines) { if (RM) { wakeShown.push(line); renderConsole(); continue; }
      for (let i = 1; i <= line.length; i += 3) { wakeTyping = line.slice(0, i); renderConsole(); await sleep(22); }
      wakeTyping = ''; wakeShown.push(line); renderConsole(); await sleep(Math.min(1200, 380 + line.length * 10)); }
    wakeBusy = false; moment.ready = true; renderConsole(); try { MOMENT.lines.forEach(l => window.__idleAI && window.__idleAI.add && window.__idleAI.add('TO', l, 'ai')); } catch (e) {} }
  function leaveMoment() { moment = null; setTimeout(modalSync, 0); wakeShown = []; cls('gen-box', 0); const bd = $('#genBackdrop'); if (bd) bd.remove(); }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#genConsole [data-gm]'); if (!b || !moment || !moment.ready) return;
    if (b.dataset.gm === 'start') { mark('e0_start1'); aside(1); setTimeout(() => { leaveMoment(); closeOp(); aside(0); endGuide(false); renderDay(); if (!builtNext(1)) showEnd(); else renderConsole(); }, 450); return; }
    if (b.dataset.gm === 'play') confirmPlay(go => { if (!go) return; mark('e0_play'); aside(1); setTimeout(() => { leaveMoment(); aside(0); endGuide(false); freePlay(); }, 450); }); });
  const closeOp = () => { const l = $('#lab'); if (l && l.classList.contains('open')) { const t = $('#lab-toggle'); if (t) t.click(); } };
  // the playground asks first (from the moment and from the end card)
  function confirmPlay(then) { if ($('#genConfirm')) return; const el = document.createElement('div'); el.id = 'genConfirm'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<div class="cb"><div>${esc(MOMENT.confirm.q)}</div><div class="cr"><button data-c="stay">${esc(MOMENT.confirm.stay)}</button><button data-c="go">${esc(MOMENT.confirm.go())}</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b && e.target !== el) return; el.remove(); then(!!b && b.dataset.c === 'go'); }); }

  // ---------- the primordial universe (script section C): a canvas behind the floor; wild when the lights come on, calmer as it fills
  const cosmos = (() => { let bolts = 0, cv = null, g = null, raf = 0, on = false, lit = 0, litAt = 0, chaos = 1, alpha = 1, fadeAt = 0, parts = null, last = 0, bolt = null, nextBolt = 0, comets = [], P = false;
    const R = Math.random, GL = 'abcdefghijklmnopqrstuvwxyz01|';
    const SKY_TOP = [[8, 9, 20], [34, 22, 66], [58, 84, 158]], SKY_LOW = [[18, 14, 40], [128, 66, 72], [132, 150, 196]];   // night → dawn → noon (v13)
    function setup() { P = matchMedia('(max-width: 600px)').matches || matchMedia('(pointer: coarse)').matches; const a = $('#arena'); if (!a) return false;
      cv = document.createElement('canvas'); cv.id = 'genCosmos'; a.insertBefore(cv, a.firstChild); g = cv.getContext('2d'); size(); addEventListener('resize', size);
      const n = P ? 0.5 : 1; parts = { stars: Array.from({ length: Math.round(160 * n) }, () => ({ x: R(), y: R() * 0.8, s: R(), p: R() * 7, odd: R() < 0.05 })),
        frag: Array.from({ length: Math.round(70 * n) }, () => ({ x: R(), y: 0.2 + R() * 0.75, c: GL[Math.floor(R() * 26)], r: R() * 6, s: 10 + R() * 18 })),
        wind: Array.from({ length: Math.round(90 * n) }, () => ({ x: R(), y: R(), v: 0.15 + R() * 0.5, c: GL[Math.floor(R() * GL.length)] })),
        hole: Array.from({ length: Math.round(46 * n) }, () => ({ a: R() * 7, d: 0.3 + R() * 0.7, c: GL[Math.floor(R() * 26)] })) }; return true; }
    function size() { if (!cv) return; const dpr = Math.min(devicePixelRatio || 1, P ? 1 : 1.5); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); cv.style.width = '100%'; cv.style.height = '100%'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function frame(t) { if (!on) return; raf = requestAnimationFrame(frame); const W = innerWidth, Hh = innerHeight, dt = Math.min(0.05, (t - (last || t)) / 1000); last = t; const T = t / 1000;
      const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, L = lit ? Math.min(1, (performance.now() - litAt) / 2500) : 0, k = chaos * L;
      // v13: dawn to noon (D: 0 → 1 over the dawn): the sky goes night → dawn (a violet top, a warm horizon) → noon (a high blue, light below)
      const D = lit ? Math.min(1, (performance.now() - litAt) / dawnMs()) : 0, De = D * D * (3 - 2 * D);
      if (fadeAt) { alpha = Math.max(0, 1 - (performance.now() - fadeAt) / 4000); if (!alpha) return stop(); } cv.style.opacity = alpha;
      // the sky: black before the lights; a deep violet with a first dawn after
      const skyAt = (stops, x) => { const i = Math.min(stops.length - 2, Math.floor(x * (stops.length - 1))), f = x * (stops.length - 1) - i; return `rgb(${stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f)).join(',')})`; };
      const sky = g.createLinearGradient(0, 0, 0, Hh); sky.addColorStop(0, lit ? skyAt(SKY_TOP, De) : '#04050a'); sky.addColorStop(1, lit ? skyAt(SKY_LOW, De) : '#07080f'); g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
      if (L) { const dawn = g.createRadialGradient(W / 2, Hh * 1.05, 10, W / 2, Hh * 1.05, Hh * (0.45 + 0.35 * (1 - chaos) + 0.3 * De)); dawn.addColorStop(0, `rgba(255,190,120,${0.35 * L * (1 - 0.3 * De)})`); dawn.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = dawn; g.fillRect(0, 0, W, Hh);
        if (De > 0) { const sun = g.createRadialGradient(W / 2, -Hh * 0.25, 10, W / 2, -Hh * 0.25, Hh * 1.1); sun.addColorStop(0, `rgba(255,248,225,${0.32 * De})`); sun.addColorStop(1, 'rgba(255,248,225,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, Hh); } }
      // stars, a few of them odd (coloured, pulsing crosses)
      for (const s of parts.stars) { const tw = 0.45 + 0.55 * Math.sin(T * (1 + s.s * 2) + s.p); g.globalAlpha = (L ? (0.35 + 0.6 * tw) * (1 - 0.65 * De) : 0.12 * tw); const x = s.x * W, y = s.y * Hh;
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
        if (!RM && D >= 1 && T > nextBolt && k > 0.08) { nextBolt = T + 1.2 + R() * (3 + 6 * (1 - k)); const x0 = W * (0.1 + R() * 0.8), pts = [[x0, hz - 30]]; let x = x0, y = hz - 30; while (y < hz + 6) { x += (R() - 0.5) * 26; y += 8 + R() * 10; pts.push([x, y]); } bolt = { pts, t: T }; bolts++; }
        if (bolt && T - bolt.t < 0.25) { const f = 1 - (T - bolt.t) / 0.25; g.globalAlpha = 0.18 * f; g.fillStyle = '#cfe0ff'; g.fillRect(0, 0, W, Hh); g.globalAlpha = f; g.strokeStyle = '#e8f1ff'; g.lineWidth = 1.6; g.beginPath(); bolt.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); } }
      g.globalAlpha = 1; }
    // v11 (Nico: "not sure about the 'storm' sounds"): the young universe's distant lightning is silent; its rolling thunder is gone
    function stop() { on = false; cancelAnimationFrame(raf); removeEventListener('resize', size); if (cv) cv.remove(); cv = null; cls('gen-cosmos', 0); }
    return { start: () => { if (on) return; if (!cv && !setup()) return; on = true; cls('gen-cosmos', 1); raf = requestAnimationFrame(frame); },
      light: () => { lit = 1; litAt = performance.now(); chaos = 1; nextBolt = 0; },
      // v14: a strike at a point on screen (life's three strikes): a fork from the top of the sky down to it
      strike: (x, y) => { const pts = [[x + (R() - 0.5) * 90, -10]]; let px = pts[0][0], py = -10; while (py < y - 12) { px += (R() - 0.5) * 34 + (x - px) * 0.12; py += 14 + R() * 18; pts.push([px, Math.min(py, y)]); } pts.push([x, y]); bolt = { pts, t: performance.now() / 1000 }; bolts++; },
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

  // ---------- the play arm's welcome (v15, Nico: "C: user goes directly to playground (they get some notice/modal telling them they are on
  // freeplay and that they can switch to story mode if they want (maybe the operator can tell them that on the first visit, offer them a
  // quick action they can click if they want and tell them they can alway switch from... [wherever the control is])"): once per browser, ~20 s
  // after the world is up or right after the first tap/key, the floating Operator opens and says it; the 🛠 tray holds [ 📖 start the story ]
  // (the world is kept as a snapshot first: newUniverse), and ⚙ glows where the story's switch lives. It takes the storyline offer's place.
  // DRAFT: the words below are drafts for Nico (line 2 is his, grammar fixed by the manager)
  const WELCOME = { draft: true, lines: ['welcome to the playground: every feature is open, play however you like',
      "here you get to try new features, new creatures and all the cutting-edge things Id|le's consciousness is dreaming up",
      "there's also a story, if you want one: Doc's training run, epoch by epoch"],
    chip: '📖 start the story', after: 'you can always switch from ⚙ → 📖 Storyline (or type /story)', note: '📖 Storyline is in ⚙', ms: 20000, afterTap: 1500, gap: 1400 };
  const PW = 'idle.playWelcome';
  function playWelcome() { let st = null; try { st = localStorage.getItem(PW); } catch (e) {} if (st || variant() !== 'play' || storyMode() || window.__genesisVoid || document.querySelector('#idleIntro')) return false;
    const O = window.__opwin; if (!O) return false; try { localStorage.setItem(PW, 'shown'); localStorage.getItem(OFFER) || localStorage.setItem(OFFER, 'welcome'); } catch (e) {} mark('pw_shown');
    O.open(); let i = 0; const next = () => { if (i < WELCOME.lines.length) { O.say(WELCOME.lines[i++]); setTimeout(next, WELCOME.gap); return; }
      O.setChips([{ text: WELCOME.chip, glow: true, act: () => { O.setChips(null); mark('pw_story'); try { localStorage.setItem(PW, 'story'); } catch (e) {} newUniverse('story'); } }]);
      O.say(WELCOME.after); setTimeout(() => O.highlight('#settingsBtn', { ms: 4000, note: WELCOME.note }), 300);
      setTimeout(() => { if (!storyMode()) O.setChips(null); }, 120000); };   // the chip stays two minutes; ⚙ keeps the way in
    next(); return true; }
  { let up = 0, tapAt = 0; const tap = () => { if (up && !tapAt) tapAt = now(); }; ['pointerdown', 'keydown'].forEach(t => addEventListener(t, tap, true));
    const iv = setInterval(() => { if (!window.__restoredOrFresh || document.documentElement.classList.contains('booting') || document.querySelector('#idleIntro')) return; if (!up) up = now();
      if (now() - up < 400000 && (now() - up >= WELCOME.ms || (tapAt && now() - tapAt >= WELCOME.afterTap))) { clearInterval(iv); ['pointerdown', 'keydown'].forEach(t => removeEventListener(t, tap, true)); playWelcome(); }
      else if (now() - up >= 400000) clearInterval(iv); }, 300); }

  // ---------- the storyline offer: for browsers that didn't start in it (the other arm, returning players); shown once, remembered
  const OFFER = 'idle.storyOffer';
  function offer(now_) { if (!storyLive() && !Q.has('offer')) return false; if (variant() === 'play' && !Q.has('offer')) return false;   // the play arm gets the Operator's welcome instead if (Q.has('test') && !Q.has('offer')) return false;
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
  if (S && S.mode === 'story' && S.on && S.tc && !(S.steps && (S.steps.music || S.steps.words)) && !genesisDone() && !Q.has('genesis') && !Q.has('story')) { const iv = setInterval(() => { if (window.__audio && window.__audio.hush) { clearInterval(iv); silence(true); } }, 200); setTimeout(() => clearInterval(iv), 10000); }
  applyUnlocks();
  // the epoch's tasks still to do (the 📟's badge, idle-tohandle.js): only in the storyline, only while that epoch is being played
  function pending() { try { if (!storyMode() || !S || !S.on) return 0; const d = dayOf(S.day || 0); if (!d || (S.days && S.days[d.n]) || (d.n > 0 && !builtNext(d.n))) return 0;
    return d.goals.filter(([k]) => !(d.n === 0 ? did(k) : false)).length; } catch (e) { return 0; } }
  // ready(): v15 — also only once the window is actually up (not during the landing, the dawn or a step's aside)
  window.__genesis = { gate: () => lastGate && { ...lastGate }, gateOf, loadGate, isCommand, modalUp, shrinkEnd, storyRow, storyModal, storyProgress, resumeAt, progressOf, resumeLines: { ...RESUME }, arms: ARMS.slice(), welcome: { ...WELCOME, lines: WELCOME.lines.slice() }, playWelcome, pending, ready: () => !!(storyMode() && guiding() && nextGuide() && !busy && !wakeBusy && !moment && $('#genConsole') && !/\bgen-(landing|dawning|aside)\b/.test(document.documentElement.className)), chip, moment: () => moment && { ...moment }, momentLines: { ...MOMENT, lines: MOMENT.lines.slice() }, life: { ...LIFE }, aside, gsound: { humSound, tickSound, tickPlan, GS, state: () => JSON.parse(JSON.stringify(snd)), humOn: () => !!humCtl }, dawnMs, playground: () => PG(), noLife, darkLines: DARK.slice(), approach: APPROACH, ringEnd: RING_END, silentLine: SILENT, untilLine, untilApproach: (i, d) => untilLine(i, d, APPROACH), ringCtl: () => ringCtl, unlocks: () => ({ epoch: epochReached(), story: storyMode() && !!(S && S.on), hidden: storyMode() && S && S.on ? UNLOCK.filter(r => r[1] == null || r[1] > epochReached()).map(r => r[0]) : [] }), unlockTable: () => UNLOCK.map(r => r.slice()), oracleLine: ORACLE_LINE, ringSound, rumbleSound, statusLine: () => statusLine(), offer, storyLive, landing: () => ({ ...land, line: land.line ? land.line.text : null, rimmed: nightState.rimmed, night: !!nightCv }), ab: AB, wants, variant: () => variant(), boot, newUniverse, actions, step: k => actions[{ words: 'letThereBeWords', creatures: 'firstCreatures' }[k] || k]?.(), state: () => S && JSON.parse(JSON.stringify(S)),
    steps: ORDER.slice(), guide: GUIDE.slice(), end: () => ({ open: !!(S && S.endOpen), at: S && S.endAt || null, free: !!(S && S.fp) }), showEnd, freePlay, canResume, resumeStory, endLines: { ...END }, key: () => SK && SK.key, days: DAYS.map(d => ({ n: d.n, title: d.title, goals: d.goals.map(g => g[1]) })), mode: () => (S && S.mode) || null, cosmos: () => cosmos.state(), wakeLines: WAKE.slice(), next: () => (guiding() ? nextGuide() : null), say: s => submit(s), skipGuide: () => endGuide(true), stats, void: () => !!window.__genesisVoid, topic: () => topic };
})();
