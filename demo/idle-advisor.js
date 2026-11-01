// idle-advisor.js: the population advisor (issue #3). A 📊 panel with gauges for how the creatures of this world are doing
// (fear, hunger, hurt, tiredness, togetherness, food per diet, mood, friendships, and the dancefloor while a rave is on), each with a
// trend arrow and a 10-minute sparkline; an issues list that says what's wrong in plain words, why, and offers one-click fixes
// that use the game's own verbs (calm the weather, feed them, let them nap, rest a few, throw a rave), with undo where it can;
// and the Id|le gazette, a gentle stream of news (firsts, records, disasters, shortages) in the same pill as the reels.
// Gauges tick every 5 s from what the creatures already have (drives, feelings, diets); history is kept per world.
(() => {
  const H = () => window.__advHooks, P = () => window.__places, W = () => window.__idleWorld, M = () => window.__music;
  if (!H()) return;
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const pick = a => a[Math.floor(Math.random() * a.length)], clamp = v => Math.max(0, Math.min(1, v)), now = () => Date.now();
  const KEY = 'arena.advisor';
  const S = (() => { try { return { mode: 'on', open: false, records: {}, firsts: {}, news: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { mode: 'on', open: false, records: {}, firsts: {}, news: [] }; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode: S.mode, open: S.open, records: S.records, firsts: S.firsts, news: S.news.slice(-30) })); } catch (e) {} };
  const where = () => (P() && P().cur && P().cur()) || 'home', keep = () => (P() && P().kind && P().kind()) === 'keep' || /gloam/i.test(where());
  const hist = {}, alerts = {}, wxSince = {}, undo = {};   // per world, in memory
  let G = null, lastNews = 0, lastAlert = 0, tickN = 0;

  // ---------- gauges (higher = more of it) ----------
  const GAUGES = [
    { k: 'fear', label: 'fear', icon: '🫣', bad: 1 , what: 'share of them hiding or scared · lower is better' }, { k: 'hunger', label: 'hunger', icon: '🍽️', bad: 1 , what: 'average hunger · lower is better' }, { k: 'hurt', label: 'hurt', icon: '🤕', bad: 1 , what: 'average hurt · lower is better' },
    { k: 'tired', label: 'tiredness', icon: '😴', bad: 1 , what: 'average tiredness · lower is better' }, { k: 'crowd', label: 'togetherness', icon: '🫂', bad: 0 , what: 'share with four or more others within a step · neither good nor bad on its own: social ones enjoy it, loners only up to their personal space' }, { k: 'food', label: 'food supply', icon: '🥣', bad: -1 , what: 'food on the floor per eater, for the diet that has least (8 bites each = full) · higher is better' },
    { k: 'mood', label: 'mood', icon: '😊', bad: -1 , what: 'average happiness · higher is better' }, { k: 'friends', label: 'friendships', icon: '🤝', bad: -1 , what: 'friends per creature (5 or more = full) · higher is better' }, { k: 'music', label: 'dancefloor', icon: '🕺', bad: -1, opt: 1 , what: 'share of the crowd dancing · higher is better' }, { k: 'lake', label: 'lake level', icon: '🌊', bad: 0, opt: 1, what: 'how full this world\'s lake is · rain fills it, clear days lower it' }];
  function measure() { const h = H(), cs = h.creatures().filter(c => !c.lab && !c.guest && c.d && c.name), n = cs.length || 1, ws = h.words();
    let fear = 0, hun = 0, hurt = 0, tired = 0, mood = 0, fr = 0; const hiders = [];
    for (const c of cs) { const f = h.feelings(c) || {}; const sc = c.state === 'hide' || (f.afraid || 0) > 0.5; if (sc) { fear++; hiders.push(c); } hun += c.d.hunger || 0; hurt += f.hurt || 0; tired += c.d.fatigue || 0; mood += f.happy || 0; fr += Math.min(5, ((c.life && c.life.friends) || []).length) / 5; }
    // food per diet: what's on the floor that each diet can eat, against how many eat it
    const eaters = {}, food = {}; for (const c of cs) { const k = h.dietOf(c); eaters[k] = (eaters[k] || 0) + 1; }
    const free = ws.filter(w => !w.carriedBy && !w.terrain && !w.lava); for (const k of Object.keys(eaters)) { let m = 0; for (const w of free) { if (h.dietOk(k, w)) { m++; if (m > 400) break; } } food[k] = m; }
    const per = Object.keys(eaters).map(k => ({ k, eat: eaters[k], have: food[k], r: food[k] / eaters[k] })).sort((a, b) => a.r - b.r);
    const foodG = per.length ? clamp(Math.min(...per.map(p => p.r)) / 8) : 1;
    // togetherness: share of creatures with four or more others within 120 px (sampled)
    const sm = cs.length > 150 ? cs.filter((_, i) => i % Math.ceil(cs.length / 150) === 0) : cs, sp = h.space(); let packed = 0;
    for (const a of sm) { let k = 0; for (const b of cs) { if (a === b) continue; if (Math.hypot(h.wd(a.x, b.x, sp.W), h.wd(a.y, b.y, sp.H)) < 120 && ++k >= 4) break; } if (k >= 4) packed++; }
    const rs = window.__rave && window.__rave.active() && window.__raveStats, music = rs ? clamp((rs.dance || 0) / Math.max(1, (rs.dance || 0) + (rs.bored || 0) + (rs.leave || 0))) : null;
    // personal space (#27): loners packed past their comfort (the arena keeps c._sp per creature)
    const cramped = cs.filter(c => c._sp && c._sp.dis > 0.45 && c.state !== 'sleep');
    return { t: now(), n: cs.length, cs, hiders, per, cramped, v: { fear: fear / n, hunger: hun / n, hurt: hurt / n, tired: tired / n, crowd: packed / Math.max(1, sm.length), food: foodG, mood: mood / n, friends: fr / n, music, lake: window.__lake ? window.__lake.level() : null } }; }

  // ---------- issues: thresholds with hysteresis, plain causes, one-click actions, a wry line ----------
  const fmtMin = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'a moment' : m === 1 ? '1 min' : m < 90 ? m + ' min' : Math.round(m / 60) + ' h'; };
  const ROUGH = ['storm', 'static', 'wind', 'hum'];
  const ISSUES = {
    fear: { on: 0.3, off: 0.15, title: 'your creatures are scared',
      cause(g) { const w = H().world(), nm = H().WEATHER_NAMES[w.weather] || w.weather, d = H().disasters(), live = (d && d.live) || [], rs = M() && M().playing && M().features && M().features().strobe;
        const bits = []; if (ROUGH.includes(w.weather)) { const d = now() - (wxSince[where()] || now()); bits.push(d < 60000 ? nm : `${nm} for ${fmtMin(d)}`); } if (live.length) bits.push(live.map(x => 'a ' + x.type).join(' and ') + ' nearby'); if (rs) bits.push('the strobe');
        return `${g.hiders.length} of ${g.n} are hiding` + (bits.length ? ': ' + bits.join(', ') : ''); },
      acts(g) { const a = [], w = H().world(); if (w.weather !== 'clear') a.push({ id: 'calm', label: '☀️ calm the weather' }); if (M() && M().playing) a.push({ id: 'hush', label: '🔇 stop the music' }); if (window.__lake && window.__lake.lake()) a.push({ id: 'lake', label: '🌊 walk the scared ones to the lake' }); a.push({ id: 'nap', label: '💤 let the scared ones nap' }); return a.slice(0, 3); },
      wry: ['{n} has filed a formal complaint about the sky', '{n} is reading the weather report under a chart', 'morale is under the furniture', '{n} would like to speak to the manager of clouds'] },
    hunger: { on: 0.62, off: 0.45, title: 'they are hungry',
      cause(g) { const p = g.per[0]; return p ? `${p.eat} eat ${H().dietWhat(p.k).split(',')[0]}, and only ${p.have} are on the floor` : 'the floor is bare'; },
      acts(g) { const low = g.per.filter(p => p.r < 4); return low.length ? [{ id: 'feed:all', label: '🥣 feed them (' + low.map(p => p.k === 'numbers' ? 'number words' : p.k === 'short' ? 'short words' : 'pieces').join(', ') + ')' }] : []; },
      wry: ['{n} has started eating its own name', 'stomachs are rumbling in three-letter words', '{n} is staring at a comma with intent'] },
    hurt: { on: 0.35, off: 0.2, title: 'some are hurt',
      cause(g) { const ev = H().events().filter(e => e.type === 'arena_steal' && now() - (e.t || 0) < 600000), ok = ev.filter(e => e.success !== false).length; return (ev.length ? `${ok} thefts in the last 10 min` : 'bumps and scrapes') + (g.v.hunger > 0.5 ? ', mostly from hungry creatures stealing' : ''); },
      acts(g) { const a = [{ id: 'nap:hurt', label: '💤 let the hurt ones nap (they heal faster)' }]; if (g.v.hunger > 0.5 && g.per[0]) a.push({ id: 'feed:all', label: '🥣 feed them (less stealing)' }); return a; },
      wry: ['{n} is limping theatrically', 'the gazette has opened a lost-and-found for stolen letters', '{n} wants its “th” back'] },
    tired: { on: 0.72, off: 0.55, title: 'they are worn out',
      cause(g) { const loud = M() && M().playing ? ', and the music is still playing' : ''; return `average tiredness ${Math.round(g.v.tired * 100)}%` + loud; },
      acts() { const a = [{ id: 'nap:tired', label: '💤 quiet hours: the tiredest nap' }]; if (M() && M().playing) a.push({ id: 'hush', label: '🔇 stop the music' }); return a; },
      wry: ['{n} fell asleep mid-sentence', 'yawns are spreading faster than words', '{n} is counting sheep and getting 41'] },
    // togetherness itself is never flagged (they flock on purpose); only loners stressed by a crowd are
    cramped: { on: 0.08, off: 0.04, metric: g => g.cramped.length >= 3 ? g.cramped.length / Math.max(1, g.n) : 0, title: 'loners are stressed in a crowd',
      cause(g) { return `${g.cramped.length} loners have more company than they like (personal space), and it is stressing them`; },
      acts() { return [{ id: 'room', label: '🫧 give the loners room' }, { id: 'spread', label: '↔️ spread them out' }]; },
      wry: ['{n} is pretending to be a lamp so nobody talks to it', '{n} has drawn a small circle around itself in chalk', 'a support group for loners met. nobody came'] },
    mood: { on: 0.75, off: 0.6, metric: g => 1 - g.v.mood, title: 'spirits are low',
      cause(g) { return `average happiness ${Math.round(g.v.mood * 100)}%`; },
      acts() { return M() ? [{ id: 'rave', label: '🕺 throw a rave' }] : []; },
      wry: ['{n} is writing poetry. none of it rhymes', 'the gazette suggests a party. the gazette always suggests a party'] } };
  const metric = (k, g) => ISSUES[k].metric ? ISSUES[k].metric(g) : g.v[k];
  function evalIssues(g) { const w = where(), A = alerts[w] = alerts[w] || {}, fresh = [];
    for (const k in ISSUES) { const I = ISSUES[k], m = metric(k, g); if (m == null || !isFinite(m)) continue; const was = A[k];
      if (!was && m >= I.on) { A[k] = { since: now() }; fresh.push(k); } else if (was && m < I.off) { delete A[k]; if (now() - was.since > 60000) news(`✅ ${I.title.replace(/^(your creatures are|they are|some are|it is getting|spirits are) /, '')}: better now`, null, true); } }
    return fresh; }
  const someone = g => { const c = (g.hiders.length ? g.hiders : g.cs)[Math.floor(Math.random() * Math.max(1, (g.hiders.length ? g.hiders : g.cs).length))]; return c ? c.name : 'someone'; };
  const wryOf = (k, g) => pick(ISSUES[k].wry).replace('{n}', someone(g));

  // ---------- actions (the game's own verbs; undo when it can) ----------
  function doAct(id) { const g = G || measure(), w = where(), h = H(), wo = W(); let done = '', un = null;
    if (id === 'calm' && wo) { const prev = h.world().weather, pi = h.world().wint; wo.setWeather('clear'); done = 'the sky is clear'; un = () => wo.setWeather(prev, pi); }
    else if (id === 'hush' && M()) { M().play(false); done = 'the music stopped'; un = () => M().play(true); }
    else if (id.startsWith('feed:')) { const k = id.slice(5), c = h.cam(), todo = k === 'all' ? g.per.filter(p => p.r < 4) : g.per.filter(p => p.k === k), all = [], parts = [];
      for (const p of (todo.length ? todo : g.per.slice(0, 1))) { const n = Math.min(140, Math.max(16, p.eat * 5)), list = h.feed(p.k, n, c.x, c.y); all.push(...list); parts.push(`${list.length} ${p.k === 'numbers' ? 'number words' : p.k === 'short' ? 'short words' : 'pieces'}`); }
      done = parts.length ? parts.join(' and ') + ' scattered where you are looking' : ''; un = () => h.unfeed(all); }
    else if (id.startsWith('nap')) { const which = id.split(':')[1], cs = g.cs.filter(c => c.state !== 'sleep' && !c.held && !c.hangryUntil); let pool;
      if (which === 'hurt') pool = cs.map(c => [c, (h.feelings(c) || {}).hurt || 0]); else if (which === 'tired') pool = cs.map(c => [c, c.d.fatigue || 0]); else pool = g.hiders.map(c => [c, 1]);
      const sel = pool.sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]).filter(c => h.nap(c)); done = sel.length ? `${sel.map(c => c.name).join(', ')} curled up for a nap` : 'nobody could nap right now'; }
    else if (id === 'rest' && window.__herd && wo) { const cs = g.cs.filter(c => c.visitor && !c.guest).sort((a, b) => ((a.life && a.life.friends) || []).length - ((b.life && b.life.friends) || []).length).slice(0, 3), names = [];
      for (const c of cs) { const r = wo.rest(c.name); if (r) names.push(r); } done = names.length ? `${names.join(', ')} went to rest` : 'nobody could rest (originals always stay out)';
      un = () => { const R = window.__herd.list(); for (const n of names) { const i = R.findIndex(r => r.name === n); if (i >= 0) window.__herd.wake(i); } }; }
    else if (id === 'spread' && window.__raveHooks) { const sp = h.space(), cs = g.cs.filter(c => !c.held && c.state !== 'sleep'); let k = 0;
      for (const a of cs) { let m = 0; for (const o of cs) if (o !== a && Math.hypot(h.wd(a.x, o.x, sp.W), h.wd(a.y, o.y, sp.H)) < 120) m++; if (m < 3) continue; const ang = Math.random() * 6.283, r = 260 + Math.random() * 420; window.__raveHooks.goto(a, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r); a.userUntil = Date.now() + 9000; k++; }
      done = k ? `${k} creatures wandered off to find some room` : 'nobody needed to move'; }
    else if (id === 'room' && window.__raveHooks) { const sp = h.space(), others = g.cs, names = [];
      for (const c of g.cramped.filter(c => !c.held).slice(0, 12)) { let best = null, bd = -1;   // a quiet spot: the farthest from anyone among a few tries nearby, or the lake's shore
        const sh = window.__lake && window.__lake.shoreFor(c, 900); for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, r = 300 + Math.random() * 600, x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; let m = 1e9; for (const o of others) if (o !== c) m = Math.min(m, Math.hypot(h.wd(x, o.x, sp.W), h.wd(y, o.y, sp.H))); if (m > bd) { bd = m; best = { x, y }; } }
        const to = sh && Math.random() < 0.3 ? sh : best; if (!to) continue; window.__raveHooks.goto(c, to.x, to.y); c.userUntil = Date.now() + 12000; c._spUntil = Date.now() + 20000; names.push(c.name); }
      done = names.length ? `${names.length} loners went off to quieter spots` : 'no loner needed room'; }
    else if (id === 'lake' && window.__lake) { const names = window.__lake.gather(g.hiders.concat(g.cs.filter(c => ((c.life && c.life.fe) || {}).fear > 0.35 && !g.hiders.includes(c))).slice(0, 30)); done = names.length ? `${names.length} scared creatures are walking to the lake to calm down` : ''; }
    else if (id === 'rave' && M()) { M().setRave(true); M().play(true); done = 'the deck is playing, rave on: watch the dancefloor gauge'; un = () => { M().play(false); M().setRave(false); }; }
    if (!done) return; h.log('advisor_action', { id }); undo[w] = un ? { un, t: now(), what: done } : null; flash(done, !!un); if (S.open) render(); }
  function flash(t, canUndo) { const el = $('#advpanel .did'); if (el) el.innerHTML = `✓ ${esc(t)}` + (canUndo ? ` <button data-a="undo">undo</button>` : ''); else if (window.__notify) window.__notify({ kind: 'advisor', text: '✓ ' + t }); else if (window.__musicToast) window.__musicToast('📊 ' + t); }

  // ---------- the gazette: firsts, records, disasters, shortages (gentle: at most one every ~2.5 min) ----------
  const NEWS_GAP = 150000;
  function news(text, at, force) { if (S.mode === 'off') return; const item = { t: now(), text, at: at || null }; S.news.push(item); if (S.news.length > 40) S.news = S.news.slice(-40); save();
    if (S.mode === 'quiet') { badge(); if (window.__notify) toStack(item, true); return; } if (!force && now() - lastNews < NEWS_GAP) { badge(); if (window.__notify) toStack(item, true); return; } lastNews = now(); pill(item); }
  const pillEl = document.createElement('div'); pillEl.id = 'advnote'; document.body.appendChild(pillEl);
  // with the shared notification stack (idle-notify.js) the gazette is one of its pills; quiet mode still files it in 🔔
  if (window.__notify) window.__notify.on('advisor-open', () => { S.open = true; save(); render(); });
  const toStack = (item, quiet) => window.__notify({ kind: /^⚠️/.test(item.text) ? 'advisor' : 'gazette', html: `<span class="gz">Id|le gazette</span> ${item.text.replace('<button data-open="1">', '<button data-act="advisor-open">')}`, at: item.at, quiet });
  function pill(item) { if (window.__notify) { toStack(item); return; } const rn = document.getElementById('reelnote'); pillEl.style.bottom = rn && rn.classList.contains('on') ? '70px' : '16px';
    pillEl.innerHTML = `<span class="gz">Id|le gazette</span> ${item.text}` + (item.at ? ` <button data-go="${item.at.x},${item.at.y}">go ›</button>` : '') + `<span class="x" title="dismiss">✕</span>`; pillEl.classList.add('on'); clearTimeout(pillEl._t); pillEl._t = setTimeout(() => pillEl.classList.remove('on'), 12000); }
  pillEl.addEventListener('click', e => { if (e.target.closest('.x')) { pillEl.classList.remove('on'); return; } const b = e.target.closest('[data-go]'); if (b) { const [x, y] = b.dataset.go.split(',').map(Number); H().flyTo(x, y, 1.3); pillEl.classList.remove('on'); } });
  pillEl.addEventListener('mouseenter', () => clearTimeout(pillEl._t)); pillEl.addEventListener('mouseleave', () => { clearTimeout(pillEl._t); pillEl._t = setTimeout(() => pillEl.classList.remove('on'), 6000); });   // reading a name's mini card keeps the pill up
  const first = (k, text, at) => { if (S.firsts[k]) return; S.firsts[k] = now(); save(); news('🎉 first ever: ' + text, at); };
  const record = (k, v, text, at) => { if (!(v > (S.records[k] || 0))) return; const old = S.records[k]; S.records[k] = v; save(); if (old) news('🏆 new record: ' + text, at); };
  const pos = who => { const c = who && H().creatures().find(c => c.name === who); return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null; };
  const CHART_KINDS = { bar: 'a bar chart', scatter: 'a scatter plot', area: 'an area chart', step: 'a step chart', pie: 'a pie chart', donut: 'a donut chart', radar: 'a radar chart', hist: 'a histogram', mixed: 'a bars-and-line chart' };   // the first of each kind is news (line charts were the first chart)
  const nm = s => window.__mnLink && s !== 'you' ? window.__mnLink(s) : `<b>${esc(s)}</b>`, ln = h => window.__linkNames ? window.__linkNames(h) : h;   // names are mentions (hover: mini card; click: go to it)
  window.addEventListener('idle:ev', e => { const { type, extra: x } = e.detail || {}; if (!x || S.mode === 'off') return;
    try {
      if (type === 'birth') { first('baby', x.bud ? `${nm(x.who)} budded from ${nm(x.a)}` : `a baby: ${nm(x.who)}, born to ${nm(x.a)} & ${nm(x.b)}`, x.at); if (x.twin) first('twins', `twins: ${nm(x.who)} and ${nm(x.twin)}`, x.at); if (x.b && x.famA !== x.famB) first('mixed', `a child of two families: ${nm(x.who)} (${esc(x.famA)} × ${esc(x.famB)})`, x.at); }
      else if (type === 'halloween') {   // trick or treat (idle-treat.js): firsts, the candy-haul record, and a Halloween edition now and then
        if (x.kind === 'treat') first('halloween', `trick-or-treating: ${nm(x.who)} knocked at ${esc(x.door)} and came home with “${esc(x.candy)}”`, pos(x.who));
        else if (x.kind === 'trick') first('trick', `a Halloween trick: ${nm(x.who)} got no candy and ${esc(x.how)}`, pos(x.who));
        else if (x.kind === 'haul' && x.n) record('candy', x.n, `${nm(x.who)} hauled ${x.n} candies in one Halloween night`, pos(x.who));
        else if (x.kind === 'edition') news('🎃 Halloween edition: ' + [`${x.treats} candies handed out`, x.haul ? `biggest haul: ${nm(x.haul.who)} (${x.haul.n})` : '', x.trick ? `first trick: ${nm(x.trick.who)} ${esc(x.trick.how)}` : '', x.costume ? `best costume: ${nm(x.costume.who)} as ${esc(x.costume.what)}` : ''].filter(Boolean).join(' · '), x.haul ? pos(x.haul.who) : null, true); }
      else if (type === 'looks' && x.kind === 'dazzle') first('dazzle', `a dazzle herd: ${nm(x.who)} and ${x.n - 1} kin, striped alike so no one of them stands out`, x.at);
      else if (type === 'hangry' && !x.end) first('hangry', `${nm(x.who)} went hangry`, pos(x.who));
      else if (type === 'rename' && x.to) first('name', `${nm(x.from || 'someone')} is now called ${nm(x.to)}`, pos(x.to));
      else if (type === 'steal' && x.success !== false) first('theft', `${nm(x.who)} stole from ${nm(x.from)}`, pos(x.who));
      else if (type === 'graze') first('graze', `${nm(x.who)} grazed on a chart`, pos(x.who));
      else if (type === 'reels_made') first('reel', 'the world made a memory reel', null);
      else if (type === 'work' && x.job === 'counter' && x.n) { record('count', x.n, `${nm(x.who)} counted ${x.n} at once`, pos(x.who)); }
      else if (type === 'work' && x.job === 'math') { if (!S.firsts.chart) first('chart', `${nm(x.who)} plotted a chart`, pos(x.who)); else if (x.vis && CHART_KINDS[x.vis]) first('chart:' + x.vis, `${CHART_KINDS[x.vis]}: ${nm(x.who)} plotted ${esc(x.formula || '')}${x.exp ? ' (an experiment)' : ''}`, pos(x.who)); }
      else if (type === 'built' && x.kind) { if (!S.firsts.built) first('built', `${nm(x.who)} finished the first building: ${esc(x.name || 'a ' + x.kind)}`, x.at || pos(x.who)); else first('built:' + x.kind, `the first ${esc(x.kind)}: ${nm(x.who)} built ${esc(x.name || '')}`, x.at || pos(x.who)); }
      else if (type === 'space' && x.kind === 'party') first('party', `a party: ${nm(x.who)} loved a crowd of ${(x.n || 0) + 1}`, pos(x.who));
      else if (type === 'space' && x.kind === 'hermit') first('hermit', `a hermit: ${nm(x.who)} found a quiet spot all to itself`, pos(x.who));
      else if (type === 'space' && x.kind === 'crowded') first('cramped', `${nm(x.who)} felt crowded (${x.n} others within a step) and edged away`, pos(x.who));
      else if (type === 'chart_code') first('chart_code', `${nm(x.who)} broke a chart into code`, pos(x.who));
      else if (type === 'lineage' && x.kind === 'gen' && x.gen >= 2) first('gen:' + x.gen, `a new generation: ${nm(x.who)} is generation ${x.gen} of the ${esc(x.fam || 'kin')}`, pos(x.who));   // family trees (idle-trees.js)
      else if (type === 'lineage' && x.kind === 'great') first('greatgrand', `the first great-grandchild: ${nm(x.who)}${x.anc ? ', great-grandchild of ' + nm(x.anc) : ''}`, pos(x.who));
      else if (type === 'task' && x.diet === 'code' && x.success) first('code_meal', `${nm(x.who)} ate a piece of code`, pos(x.who));
    } catch (err) {} });

  // ---------- the tick ----------
  function tick() { if (S.mode === 'off' && !S.open) return; const w = where(), wx = H().world().weather;
    if (!wxSince[w] || wxSince[w + ':k'] !== wx) { wxSince[w] = now(); wxSince[w + ':k'] = wx; }
    const g = G = measure(); const hh = hist[w] = hist[w] || []; hh.push({ t: g.t, v: g.v }); while (hh.length > 120) hh.shift();
    if (++tickN > 2) { const fresh = evalIssues(g);   // let a few ticks settle after a load
      if (fresh.length && S.mode !== 'off' && now() - lastAlert > 90000) { lastAlert = now(); const k = fresh[0], I = ISSUES[k]; const at = k === 'fear' && g.hiders[0] ? { x: Math.round(g.hiders[0].x), y: Math.round(g.hiders[0].y) } : null;
        news(`⚠️ ${esc(I.title)}: ${ln(esc(I.cause(g)))}. <i>${ln(esc(wryOf(k, g)))}</i> <button data-open="1">📊 advisor</button>`, at, true); }
      const rs = window.__raveStats; if (rs && window.__rave && window.__rave.active()) { if (rs.conga >= 3) first('conga', `a conga line of ${rs.conga}`, null); record('conga', rs.conga || 0, `a conga line of ${rs.conga}`, null); }
      const sh = g.per[0]; if (sh && sh.have === 0 && sh.eat >= 3) { const kk = 'short:' + w + ':' + sh.k; if (!alerts[kk] || now() - alerts[kk] > 900000) { alerts[kk] = now(); news(`🥣 food shortage: no ${esc(H().dietWhat(sh.k).split(',')[0])} left for ${sh.eat} creatures`, null); } }
      if (g.n) record('pop', g.n, `${g.n} creatures live here now`, null); }
    const live = (H().disasters().live || []); for (const d of live) { const id = d.type + ':' + Math.round(d.t0 || 0); if (seenDis.has(id)) continue; seenDis.add(id); if (tickN > 1) news(`${({ volcano: '🌋 a volcano opened', tornado: '🌪 a tornado touched down', quake: '〰 the ground shook' })[d.type] || '⚠️ ' + esc(d.type)}: hold on to your letters`, d.x != null ? { x: Math.round(d.x), y: Math.round(d.y) } : null, true); first('disaster:' + d.type, `a ${esc(d.type)}`, null); }
    badge(); if (S.open) render(); }
  const seenDis = new Set();
  setInterval(tick, 5000); setTimeout(tick, 1500);
  pillEl.addEventListener('click', e => { if (e.target.closest('[data-open]')) { S.open = true; save(); render(); pillEl.classList.remove('on'); } });

  // ---------- the panel ----------
  const css = document.createElement('style'); css.textContent = `
#advnote{position:fixed;left:16px;bottom:16px;z-index:9997;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:12px;padding:7px 10px;font:12px system-ui;box-shadow:0 6px 22px #0005;transform:translateY(140%);opacity:0;transition:transform .5s,opacity .5s,bottom .3s;max-width:min(460px,calc(100vw - 32px));pointer-events:none}
#advnote.on{transform:none;opacity:1;pointer-events:auto}#advnote .gz{font:italic 600 11px Georgia,serif;opacity:.75;margin-right:4px}#advnote .x{margin-left:8px;cursor:pointer;opacity:.6}
#advnote button,#advpanel button{font:12px system-ui;margin-left:6px;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;cursor:pointer;padding:1px 7px}
#advpanel{position:fixed;right:16px;top:56px;z-index:9996;display:none;width:min(400px,calc(100vw - 32px));max-height:76vh;overflow:auto;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:12px;padding:8px 10px;box-shadow:0 8px 28px #0006;font:12px system-ui;box-sizing:border-box}
#advpanel.on{display:block}#advpanel .hd{display:flex;justify-content:space-between;align-items:center;margin:-8px -10px 4px;padding:8px 10px 6px;position:sticky;top:-8px;z-index:2;background:var(--floor);border-bottom:1px solid #8883;cursor:grab;user-select:none;touch-action:none}#advpanel.drag .hd{cursor:grabbing}#advpanel h4{margin:8px 0 3px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
#advpanel .legend{opacity:.75;font-size:11px;margin:0 0 4px;line-height:1.4}#advpanel .g{display:grid;grid-template-columns:20px 84px 1fr 58px 16px;align-items:center;gap:4px;margin:2px 0}#advpanel .bar{height:6px;border-radius:3px;background:#8883;overflow:hidden}#advpanel .bar i{display:block;height:100%}
#advpanel .tr{text-align:center}#advpanel .sub{opacity:.7;font-size:11px}#advpanel .iss{border:1px solid #8885;border-radius:10px;padding:6px 8px;margin:5px 0}#advpanel .iss b{font-size:12.5px}#advpanel .iss i{opacity:.8}
#advpanel .acts{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px}#advpanel .acts button{margin:0}#advpanel .did{min-height:16px;margin:4px 0;color:#3a8}#advpanel .news div{margin:3px 0}#advpanel .news small{opacity:.6;margin-right:4px}
#advpanel .modes button.on{background:#2b5cff;color:#fff;border-color:#2b5cff}#advBtn{position:relative}#advBtn .dot{position:absolute;right:-2px;top:-3px;min-width:14px;height:14px;border-radius:7px;background:#e5484d;color:#fff;font:600 9px/14px system-ui;padding:0 3px;box-sizing:border-box}`;
  document.head.appendChild(css);
  const $ = q => document.querySelector(q);
  const panel = document.createElement('div'); panel.id = 'advpanel'; document.body.appendChild(panel);
  // the panel stays where you drag it (by its header), remembered in this browser; kept inside the window
  const posKey = 'idle.advPos', fit = (x, y) => [Math.max(0, Math.min(innerWidth - 120, x)), Math.max(0, Math.min(innerHeight - 40, y))];
  const placeAt = (x, y) => { [x, y] = fit(x, y); panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto'; panel.style.maxHeight = Math.max(160, Math.min(innerHeight * 0.76, innerHeight - y - 12)) + 'px'; };
  try { const p = JSON.parse(localStorage.getItem(posKey) || 'null'); if (p) placeAt(p.x, p.y); } catch (e) {}
  addEventListener('resize', () => { if (panel.style.left) placeAt(parseFloat(panel.style.left), parseFloat(panel.style.top)); });
  panel.addEventListener('pointerdown', e => { const hd = e.target.closest('.hd'); if (!hd || e.target.closest('button') || e.button) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; panel.classList.add('drag'); hd.setPointerCapture(e.pointerId); e.preventDefault();
    const mv = ev => placeAt(ev.clientX - dx, ev.clientY - dy);
    const up = () => { panel.classList.remove('drag'); hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); try { localStorage.setItem(posKey, JSON.stringify({ x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) })); } catch (err) {} };
    hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up); });
  const btn = document.createElement('button'); btn.id = 'advBtn'; btn.title = 'advisor: how your creatures are doing, what is wrong and what you can do'; btn.textContent = '📊';
  const anchor = $('#djBtn') || $('#reelsBtn'); if (anchor) anchor.after(btn, ' ');
  btn.addEventListener('click', () => { S.open = !S.open; save(); if (S.open) tick(); render(); });
  function badge() { let d = btn.querySelector('.dot'); const n = Object.keys(alerts[where()] || {}).length; if (!n || S.mode === 'off') { if (d) d.remove(); return; } if (!d) { d = document.createElement('span'); d.className = 'dot'; btn.appendChild(d); } d.textContent = n; }
  function spark(k, bad) { const hh = (hist[where()] || []).map(p => p.v[k]).filter(v => v != null); if (hh.length < 2) return '<svg width="58" height="14"></svg>';
    const pts = hh.map((v, i) => `${(i / (hh.length - 1) * 56 + 1).toFixed(1)},${(13 - clamp(v) * 12).toFixed(1)}`).join(' ');
    return `<svg width="58" height="14" viewBox="0 0 58 14"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/></svg>`; }
  function trend(k, bad) { const hh = (hist[where()] || []).map(p => p.v[k]).filter(v => v != null); if (hh.length < 6) return '<span class="tr" style="opacity:.4">·</span>';
    const a = hh.slice(-3).reduce((s, v) => s + v, 0) / 3, b = hh.slice(-15, -10).length ? hh.slice(-15, -10).reduce((s, v) => s + v, 0) / hh.slice(-15, -10).length : hh[0], d = a - b;
    if (Math.abs(d) < 0.03) return '<span class="tr" style="opacity:.5">→</span>'; const worse = d * bad > 0; return `<span class="tr" style="color:${!bad ? '#5b8def' : worse ? '#e5484d' : '#3a8'}">${d > 0 ? '↑' : '↓'}</span>`; }
  const col = (v, bad) => { if (!bad) return '#5b8def'; const x = bad > 0 ? v : 1 - v; return x > 0.6 ? '#e5484d' : x > 0.35 ? '#f0a020' : '#3a8'; };
  const ago = t => { const m = Math.round((now() - t) / 60000); return m < 1 ? 'now' : m < 60 ? m + 'm' : Math.round(m / 60) + 'h'; };
  function render() { if (panel.classList.contains('drag')) return; panel.classList.toggle('on', !!S.open); btn.classList.toggle('on', !!S.open); if (!S.open) return; const g = G || measure(), A = alerts[where()] || {}, keepTxt = keep() ? 'Gloamhold' : (P() && P().title && P().title()) || 'Home';
    const did = panel.querySelector('.did'); const didHTML = did ? did.innerHTML : '';
    let h = `<div class="hd"><b>📊 advisor · ${esc(keepTxt)}</b><button data-a="close" title="close">✕</button></div><div class="sub">${g.n} creatures · updated every 5 s · trends over the last minute, lines over 10 min</div>`;
    h += '<h4>how they are doing</h4><div class="legend"><span style="color:#3a8">■</span> good <span style="color:#f0a020">■</span> watch <span style="color:#e5484d">■</span> bad <span style="color:#5b8def">■</span> just a fact · the first four fill up as things get worse, food, mood and friends as they get better · hover a bar for what it measures</div>' + GAUGES.filter(x => !(x.opt && g.v[x.k] == null)).map(x => { const v = g.v[x.k] ?? 0; return `<div class="g" title="${x.label}: ${Math.round(v * 100)}% · ${x.what || ''}"><span>${x.icon}</span><span>${x.label}</span><span class="bar"><i style="width:${Math.round(v * 100)}%;background:${col(v, x.bad)}"></i></span>${spark(x.k, x.bad)}${trend(x.k, x.bad)}</div>`; }).join('');
    h += `<div class="sub" style="margin-top:3px">food by diet: ${g.per.map(p => `${esc(p.k)} ${p.have} for ${p.eat}`).join(' · ') || '—'}</div>`;
    if (window.__babies) h += window.__babies.line();
    const ks = Object.keys(A).filter(k => ISSUES[k]); h += `<h4>issues ${ks.length ? '(' + ks.length + ')' : ''}</h4>` + (ks.length ? ks.map(k => { const I = ISSUES[k]; return `<div class="iss"><b>${esc(I.title)}</b> <small class="sub">for ${fmtMin(now() - A[k].since)}</small><div>${ln(esc(I.cause(g)))}</div><i>${ln(esc(wryOf(k, g)))}</i><div class="acts">${I.acts(g).map(a => `<button data-act="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div></div>`; }).join('') : '<div class="sub">nothing worrying right now. ☕</div>');
    const u = undo[where()]; h += `<div class="did">${didHTML || (u && now() - u.t < 120000 ? `✓ ${esc(u.what)} <button data-a="undo">undo</button>` : '')}</div>`;
    h += '<h4>Id|le gazette</h4><div class="news">' + (S.news.slice(-8).reverse().map(n => `<div><small>${ago(n.t)}</small>${n.text.replace(/<button data-open="1">[^<]*<\/button>/, '')}${n.at ? ` <button data-go="${n.at.x},${n.at.y}">go ›</button>` : ''}</div>`).join('') || '<div class="sub">no news yet</div>') + '</div>';
    h += `<h4>alerts</h4><div class="modes">${['on', 'quiet', 'off'].map(m => `<button data-mode="${m}" class="${S.mode === m ? 'on' : ''}" title="${m === 'on' ? 'news and alerts pop up' : m === 'quiet' ? 'no pop-ups, just the red dot on 📊' : 'no news or alerts'}">${m}</button>`).join('')}</div>`;
    panel.innerHTML = h; }
  panel.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'close') { S.open = false; save(); render(); }
    else if (b.dataset.a === 'undo') { const u = undo[where()]; if (u) { try { u.un(); } catch (err) {} undo[where()] = null; H().log('advisor_undo', {}); const d = panel.querySelector('.did'); if (d) d.innerHTML = '↩ undone'; setTimeout(render, 900); } }
    else if (b.dataset.act) doAct(b.dataset.act);
    else if (b.dataset.mode) { S.mode = b.dataset.mode; save(); badge(); render(); }
    else if (b.dataset.go) { const [x, y] = b.dataset.go.split(',').map(Number); H().flyTo(x, y, 1.3); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.open && !(e.target && e.target.closest && e.target.closest('input,textarea,[contenteditable]'))) { S.open = false; save(); render(); } });
  window.__advisor = { state: () => ({ mode: S.mode, records: { ...S.records }, firsts: { ...S.firsts } }),
    merge(st) { if (!st) return; for (const k in st.records || {}) S.records[k] = Math.max(S.records[k] || 0, st.records[k]); for (const k in st.firsts || {}) if (!S.firsts[k]) S.firsts[k] = st.firsts[k]; save(); },
    measure: () => { const g = measure(); return { n: g.n, v: g.v, per: g.per, hiding: g.hiders.length }; }, alerts: () => ({ ...(alerts[where()] || {}) }), act: doAct, tick, news: () => S.news.slice(), _issues: ISSUES };
  render();
})();
