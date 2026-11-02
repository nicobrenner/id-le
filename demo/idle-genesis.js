// idle-genesis.js: "in the beginning there was nothing, and then…" (Nico, 2026-11-01). Behind ?genesis (and an A/B switch that ships
// OFF): a first visit starts in the void, after the intro (window.__intro from idle-intro.js, if it is loaded), and the player sits in
// the Operator's chair as the scientist who watches over Id|le universes. The Tiny Operator (or the player's own AI) builds the world
// with them, one visible step at a time: words, the first creatures, light, weather, a hut, music. After three steps the universe is
// alive and normal play (and the guided first five minutes, minus what the genesis already covered) takes over.
// "🌌 new universe" (⚙ settings) starts a genesis for anyone: the current world is kept as a snapshot first, and every creature that
// isn't one of the two originals is put to rest (rested creatures keep their names, memories and friends). Nothing is ever deleted.
// Actions for the Operator (idle-ai.js tool 'genesis') and the Tiny Operator: window.__genesis.actions.{letThereBeWords, firstCreatures,
// light, weather, hut, music}. Hooks into the world: window.__genHooks (arena.html). Stats: 'gv' (genesis | starter) when the A/B runs.
(() => {
  const Q = new URLSearchParams(location.search), $ = s => document.querySelector(s), now = () => Date.now();
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AB = 'off';   // the A/B switch: 'on' gives first-time visitors genesis or the starter world 50/50 (stored in this browser only, as idle.gv)
  const KEY = 'idle.genesis', GV = 'idle.gv';
  const H = () => window.__genHooks, W = () => window.__idleWorld;
  // good first articles for "grow it from Wikipedia" (one is offered at random)
  const TOPICS = ['Octopus', 'Volcano', 'Moon', 'Coffee', 'Bioluminescence', 'Aurora', 'Coral reef', 'Tardigrade', 'Lighthouse', 'Origami'];
  // what the floor grows from when the player just says "let there be words"
  const SEED = 'in the beginning there was nothing and then a word fell and then another and the words found each other and lay down together ' +
    'and became a floor and the floor was quiet and it waited for something to walk on it and remember it';
  // the order the console offers the steps in; the first three make the universe alive
  const ORDER = ['words', 'creatures', 'light', 'weather', 'hut', 'music'];
  const ALIVE_AFTER = 3;
  // the Tiny Operator's lines for each moment (short, warm, no trailing period: the chat style rule)
  const LINES = {
    start: ['nothing here yet. say: let there be words', 'it is very dark in here. we could start with a word'],
    words: ['words. the floor will remember them', 'there, a floor to stand on. nobody to stand on it yet'],
    creatures: ['two of them crawled out of a word. they look surprised', 'look, something is moving'],
    light: ['light. now they can see each other', 'morning, for the very first time'],
    weather: ['weather. they will have opinions about it', 'the first sky this universe ever had'],
    hut: ['someone wants to build. give it a moment', 'crates and bricks turned up. an Architect is thinking'],
    music: ['music. the floor hums along', 'now it sounds like somewhere'],
    alive: ['it is alive. it does not need us now, but it likes company', 'the universe is running. keep watching'] };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let S = load(), hold = [], topic = pick(TOPICS), busy = false;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  const css = document.createElement('style');
  css.textContent = `html.gen-void #arena,html.gen-void #floor{background-color:#05060b!important;transition:background-color 2.5s}
html.gen-void #floor{background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px)!important;background-size:64px 64px!important}
html.gen-void #daylight,html.gen-void #weather,html.gen-void #buildCv,html.gen-void #lakeCv{opacity:0!important}
html.gen-void :is(#ntf,#notice,#distoast,#whisper,#cline,#studio,#herd,#team,#conn,#advpanel,#dj,#reelpanel,#drawer,#trees,#almanac,#ntfpanel,#roomchat,#capPill,#hwChip,#soundHint){display:none!important}
#genConsole{margin:8px 10px 4px;padding:10px 12px;border:1px solid #6b7cff66;border-radius:12px;background:linear-gradient(180deg,#0d1030,#0a0b16);color:#cfd6ff;font:12px ui-monospace,Menlo,monospace}
#genConsole .gt{font-weight:700;letter-spacing:.06em;font-size:11px;opacity:.75;margin-bottom:6px}
#genConsole .gl{font:14px/1.4 Georgia,serif;color:#fff;margin:2px 0 8px}#genConsole .gl b{color:#9fb0ff;font:600 11px ui-monospace,Menlo,monospace;margin-right:6px}
#genConsole .gc{display:flex;flex-wrap:wrap;gap:6px}#genConsole .gc button{font:12px system-ui;padding:5px 10px;border-radius:14px;border:1px solid #8ea0ff88;background:#1a1f55;color:#fff;cursor:pointer}
#genConsole .gc button:hover{background:#2a3180}#genConsole .gc button[disabled]{opacity:.45;cursor:default}
#genConsole .gs{margin-top:8px;font-size:10.5px;opacity:.6}#genConsole.alive{border-color:#5fd39a66}
#genIntro{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;align-items:center;justify-content:center;color:#cfd6ff;font:italic 22px Georgia,serif;letter-spacing:.02em;cursor:pointer;transition:opacity 1.2s}
#genIntro.out{opacity:0;pointer-events:none}
.gen-ring{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2px solid #9fb0ff;pointer-events:none;z-index:6;animation:genRing 1.6s ease-out forwards}
@keyframes genRing{from{transform:scale(.3);opacity:1}to{transform:scale(9);opacity:0}}`;
  document.head.appendChild(css);

  // ---------- who gets a genesis
  function variant() { if (Q.has('genesis')) return 'genesis'; if (AB !== 'on') return null; let v = null; try { v = localStorage.getItem(GV); } catch (e) {}
    if (v !== 'genesis' && v !== 'starter') { v = Math.random() < 0.5 ? 'genesis' : 'starter'; try { localStorage.setItem(GV, v); } catch (e) {} } return v; }
  // called by the arena for a browser with no world of its own (fresh0), before the guided start would load the starter world
  function wants(fresh0) { if (Q.has('genesis')) return true; return !!fresh0 && variant() === 'genesis'; }

  // ---------- the void: no words, no creatures, a dark floor with a faint grid
  function toVoid() { const h = H(); if (!h) return; document.documentElement.classList.add('gen-void'); window.__genesisVoid = true;
    h.clearAll(); const cs = h.creatures(); hold = cs.splice(0).filter(c => !c.lab);
    try { const w = h.world(); if (Array.isArray(w.features) && w.features.length) { S.feat = w.features; save(); }   // the ground features (streams, caches, 404 holes) wait for the light
      h.applyWorld({ ...w, day: false, weather: 'clear', features: [], id: 'world-' + now().toString(36).slice(-4) }, 'studio'); } catch (e) {}   // no day and no weather yet: light and weather are steps
    for (const c of hold) { if (c.bub) c.bub.classList.remove('on'); if (c.el) c.el.style.visibility = 'hidden'; c.held = false; c.carrying = null; }
    try { const p = h.cam(); h.flyTo(p.x, p.y, innerWidth < 700 ? 0.8 : 1); } catch (e) {} }

  // ---------- the intro (idle-intro.js) or a short fallback line
  async function intro() { if (Q.get('intro') === '0') return; const saveData = navigator.connection && navigator.connection.saveData;
    if (window.__intro && window.__intro.play && !saveData) { try { await window.__intro.play(Q.get('intro') ? { tone: Q.get('intro') } : {}); return;   /* the storm unless ?intro=eerie|epic */ } catch (e) { console.warn('genesis: intro', e); } }
    await new Promise(res => { const el = document.createElement('div'); el.id = 'genIntro'; el.textContent = 'in the beginning there was nothing'; document.body.appendChild(el);
      const end = () => { el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 1200); }; el.addEventListener('click', end, { once: true });
      setTimeout(end, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1500 : 2600); }); }

  // ---------- the scientist's console: the Operator panel with the Tiny Operator's line and the next steps as chips
  function openConsole() { const lab = $('#lab'); if (!lab) return; if (!lab.classList.contains('open')) { const t = $('#lab-toggle'); if (t) t.click(); }
    let c = $('#genConsole'); if (!c) { c = document.createElement('div'); c.id = 'genConsole'; const head = $('#lab-head'); if (head && head.nextSibling) lab.insertBefore(c, head.nextSibling); else lab.prepend(c); }
    renderConsole(pick(LINES.start));
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { const t = $('#lab-text'); if (t) t.focus(); }, 350); }
  function chipsFor() { const st = (S && S.steps) || {}, out = [];
    if (!st.words) out.push(['words', 'let there be words'], ['words:' + topic, 'grow it from Wikipedia: ' + topic]);
    else { if (!st.creatures) out.push(['creatures', 'bring the first creatures']); if (!st.light) out.push(['light', 'let there be light']);
      if (st.creatures && !st.weather) out.push(['weather', 'give it weather']); if (st.creatures && !st.hut) out.push(['hut', 'build a hut']); if (st.light && !st.music) out.push(['music', 'let there be music']); }
    return out; }
  let curLine = '';
  function renderConsole(line) { if (line != null) curLine = line; line = curLine; const c = $('#genConsole'); if (!c) return; const done = ORDER.filter(k => S && S.steps && S.steps[k]).length, alive = S && S.alive;
    c.classList.toggle('alive', !!alive);
    c.innerHTML = `<div class="gt">🔭 THE SCIENTIST'S CONSOLE · UNIVERSE ${esc((S && S.n) || 1)}</div><div class="gl"><b>TO</b>${esc(line || '')}</div>` +
      `<div class="gc">${chipsFor().map(([k, t]) => `<button data-gen="${esc(k)}"${busy ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div>` +
      `<div class="gs">${alive ? 'alive · ' : ''}${done} of ${ORDER.length} steps · or type to the Operator: "let there be light"</div>`; }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#genConsole [data-gen]'); if (!b || busy) return; const [k, arg] = b.dataset.gen.split(':');
    const A = actions; ({ words: () => A.letThereBeWords(arg || ''), creatures: () => A.firstCreatures(), light: () => A.light(), weather: () => A.weather(), hut: () => A.hut(), music: () => A.music() })[k]?.(); });

  // ---------- the steps
  function done(step, line, at, extra) { S = S || { on: true, steps: {}, t0: now(), n: 1 }; if (S.steps[step]) return; S.steps[step] = now(); save();
    const h = H(), text = { words: 'the first words fell into the void', creatures: 'the first creatures crawled out of a word', light: 'the first light', weather: 'the first weather', hut: 'the first building blocks turned up', music: 'the first music' }[step];
    try { h && h.log('genesis', { step, text, at, ...(extra || {}) }); } catch (e) {}
    try { window.__almanac && window.__almanac.ev('genesis', text, {}); } catch (e) {}
    const n = ORDER.filter(k => S.steps[k]).length;
    if (n >= ALIVE_AFTER && !S.alive) { S.alive = now(); save(); alive(); renderConsole(pick(LINES.alive)); } else renderConsole(line || pick(LINES[step])); }
  function alive() { window.__genesisVoid = false; const h = H();
    if (hold.length && h) { const cs = h.creatures(); for (const c of hold.splice(0)) { if (c.el) c.el.style.visibility = ''; if (!cs.includes(c)) cs.push(c); } }
    document.documentElement.classList.remove('gen-void');
    try { window.__notify && window.__notify({ kind: 'system', icon: '🌌', html: 'this universe is alive. keep building with the Operator, or just watch', ttl: 9000 }); } catch (e) {}
    try { window.__first5 && window.__first5.startTrail && window.__first5.startTrail(['hwwiki', S.steps.weather ? 'weather' : null].filter(Boolean)); } catch (e) { console.error(e); } }
  // one step at a time (chips are disabled while one runs); steps call each other's inner versions, never the guarded ones
  const step = async (k, fn) => { if (busy) return 'busy'; busy = true; renderConsole(); try { return await fn(); } catch (e) { console.warn('genesis: ' + k, e); renderConsole('that did not work. try again?'); return null; } finally { busy = false; renderConsole(); } };

  // the words rain in (and condense) from above: the newest words nearest the view first
  function rain(ws) { const h = H(); if (!h || !ws.length) return; const p = h.cam(); const near = ws.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 180);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    near.forEach((w, i) => { try { w.el.animate(calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ translate: '0 -220px', opacity: 0, filter: 'blur(3px)' }, { translate: '0 0', opacity: 1, filter: 'blur(0)' }], { duration: calm ? 600 : 1100, delay: Math.min(2600, i * 14), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); } catch (e) {} }); }
  async function _letThereBeWords(src) { { const h = H(); if (!h) return null; if (S && S.steps.words) return 'already';
      let input = String(src || '').trim(), kind = 'text';
      if (/^https?:\/\//i.test(input)) kind = 'page'; else if (input && input.split(/\s+/).length <= 4) { input = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(input.replace(/ /g, '_')); kind = 'wikipedia'; }
      if (!input) input = SEED;
      const before = new Set(h.words()); try { await h.terrainFrom(input); } catch (e) { console.warn('genesis: words', e); }
      let fresh = h.words().filter(w => !before.has(w));
      if (!fresh.length && input !== SEED) { kind = 'seed'; await h.terrainFrom(SEED); fresh = h.words().filter(w => !before.has(w)); }   // offline or the page could not be read: the seed text still makes a floor
      if (!fresh.length) return null;
      rain(fresh); done('words', null, null, { kind, n: fresh.length }); return fresh.length; } }
  async function _firstCreatures(family) { { const h = H(); if (!h) return null; if (S && S.steps.creatures) return 'already';
      if (!h.words().length) await _letThereBeWords('');   // creatures need a floor to crawl out of
      const p = h.cam(), ws = h.words().filter(w => !w.carriedBy && w.text.length > 2), w = ws.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || { x: p.x, y: p.y };
      ring(w.x, w.y); if (w.el) try { w.el.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 700, iterations: 2 }); } catch (e) {}
      await new Promise(r => setTimeout(r, 650));
      const cs = h.creatures(), names = [];
      const back = hold.splice(0, 2); back.forEach((c, i) => { c.x = c.tx = w.x + (i ? 26 : -26); c.y = c.ty = w.y + 10; if (c.el) c.el.style.visibility = ''; if (!cs.includes(c)) cs.push(c); names.push(c.name); });
      if (!back.length || family) { const n = W() && W().spawn(family || 'crawly'); if (n) names.push(n); }
      if (!names.length) return null;
      done('creatures', null, { x: w.x, y: w.y }, { who: names.join(' and ') }); return names; } }
  function ring(x, y) { const f = $('#floor'); if (!f) return; const r = document.createElement('div'); r.className = 'gen-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; f.appendChild(r); setTimeout(() => r.remove(), 1700); }
  async function _light() { { const h = H(); if (!h) return null; if (S && S.steps.light) return 'already';
      document.documentElement.classList.remove('gen-void'); const w = h.world(); h.applyWorld({ ...w, day: true, ...(S && S.feat && !(w.features || []).length ? { features: S.feat } : {}), id: 'world-' + now().toString(36).slice(-4) }, 'studio');
      done('light'); return true; } }
  async function _weather(kind) { { if (S && S.steps.weather) return 'already'; const ks = (W() && W().weathers()) || [];
      const k = ks.includes(kind) ? kind : pick(ks.filter(x => x !== 'clear')) || 'rain'; const r = W() && W().setWeather(k); if (!r) return null; done('weather', null, null, { kind: k }); return r; } }
  async function _hut() { { if (S && S.steps.hut) return 'already'; const h = H(); if (!h) return null;
      if (!h.words().length) await _letThereBeWords(''); if (!(S && S.steps.creatures)) await _firstCreatures();
      if (!window.__build || !window.__build._seed) return null; window.__build._seed(); done('hut'); return true; } }
  async function _music() { { if (S && S.steps.music) return 'already'; const m = window.__music; if (!m) return null;
      try { window.__audio && window.__audio.wantSound && window.__audio.wantSound(); } catch (e) {} try { m.setSource ? m.setSource('background') : m.setBg(true); } catch (e) { try { m.setBg(true); } catch (e2) { return null; } }
      done('music'); return true; } }
  // every action answers { ok, result } or { error } (the Tiny Operator and the Operator's tools read that shape)
  const answer = r => r === 'busy' ? { error: 'another step is still happening' } : r === 'already' ? { ok: true, already: true } : r ? { ok: true, result: r } : { error: 'that step did not work' };
  const actions = { letThereBeWords: async x => answer(await step('words', () => _letThereBeWords(x))), firstCreatures: async f => answer(await step('creatures', () => _firstCreatures(f))), light: async () => answer(await step('light', _light)),
    weather: async k => answer(await step('weather', () => _weather(k))), hut: async () => answer(await step('hut', _hut)), music: async () => answer(await step('music', _music)) };

  // ---------- boot (a first visit with ?genesis, or the genesis side of the A/B), and a new universe for anyone
  async function boot() { if (!H()) return false; S = { on: true, steps: {}, t0: now(), n: ((S && S.n) || 0) + 1 }; save(); toVoid(); dropFlag(); await intro(); openConsole(); try { H().log('genesis', { step: 'start' }); } catch (e) {} return true; }
  function dropFlag() { try { const u = new URL(location.href); if (!u.searchParams.has('genesis')) return; u.searchParams.delete('genesis'); u.searchParams.delete('intro'); history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash); } catch (e) {} }
  async function newUniverse() { const h = H(); if (!h) return false;
    if (window.__placeKind && window.__placeKind !== 'home' && window.__places) { try { await window.__places.go('home'); } catch (e) {} }
    h.snapshot('before a new universe ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));   // the old world is kept, always
    h.restAll();   // everyone but the two originals rests (names, memories and friends kept; wake them from the creatures sidebar)
    return boot(); }
  // ?genesis on a browser that already has a world: a new universe (the world is kept as a snapshot first, its creatures rest)
  if (Q.has('genesis')) { let k = 0; const iv = setInterval(() => { if (window.__restoredOrFresh && window.__restored && !window.__genesisVoid) { clearInterval(iv); newUniverse(); } else if (window.__genesisVoid || ++k > 120) clearInterval(iv); }, 500); }

  window.__genesis = { ab: AB, wants, variant, boot, newUniverse, actions, step: k => actions[{ words: 'letThereBeWords', creatures: 'firstCreatures' }[k] || k]?.(), state: () => S && JSON.parse(JSON.stringify(S)), steps: ORDER.slice(), void: () => !!window.__genesisVoid, topic: () => topic };
})();
