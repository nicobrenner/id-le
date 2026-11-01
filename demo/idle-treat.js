// idle-treat.js: trick or treat, on Halloween night (only while the 🎃 Halloween mode is on: window.__halloween, idle-halloween.js).
// Small groups of creatures walk to "doors" (huts and buildings the Architects finished, the Oracle at the top of the view, a sleeper's
// bed, a chart or design and whoever made it), knock ("trick or treat!") and usually get candy: a candy word they carry home and eat
// (a meal, a happy memory; hangry ones grab two). Whoever gets nothing plays a harmless trick on a word nearby: it wobbles, hides, or
// trades places with another word for a few seconds. Tricks only touch how words look (CSS), never where they are, and candy is never
// saved (arena.html skips candy words when it saves), so turning the mode off leaves the world exactly as it was: candy still around
// is taken back and every trick undone. The Gazette gets firsts (the first Halloween, the first trick), a candy-haul record and a
// Halloween edition; the Oracle comments now and then; diaries keep "went trick-or-treating" memories, and the reels make "The Halloween night".
(() => {
  const B = () => window.__buildHooks, A = () => window.__advHooks;
  const on = () => { try { return !!(window.__halloween && window.__halloween.on && window.__halloween.on()); } catch (e) { return false; } };
  const here = () => window.__placeKind === 'home' || window.__placeKind === 'keep';   // not in a data lab or a visited page
  const now = () => Date.now(), rnd = a => a[Math.floor(Math.random() * a.length)];
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const CANDY = ['toffee', 'fudge', 'gum', 'taffy', 'bonbon', 'nougat', 'caramel', 'licorice', 'gumdrop', 'lolly', 'truffle', 'praline', 'brittle', 'jelly', 'mint', 'cocoa', 'humbug', 'sherbet'];
  const TRICKS = [['wobble', 'made {w} wobble'], ['hide', 'hid {w}'], ['swap', 'swapped {w} with {v}']];
  const ODDS = { house: 0.8, oracle: 0.85, bed: 0.55, landmark: 0.6 };   // the chance a knock gets candy, by kind of door
  const KNOCK = ['trick or treat!', 'trick or treat!', 'treat?', 'boo! treat?', 'candy please'];
  const st = { groups: [], tricks: new Set(), haul: {}, treats: 0, firstTrick: null, lastOracle: 0, onSince: 0, editions: 0, started: false };
  const dayKey = () => { const d = new Date(); return 'idle.treat.' + d.getFullYear(); };
  try { const o = JSON.parse(localStorage.getItem(dayKey()) || 'null'); if (o) { st.haul = o.haul || {}; st.treats = o.treats || 0; st.firstTrick = o.firstTrick || null; st.editions = o.editions || 0; } } catch (e) {}
  const saveNight = () => { try { localStorage.setItem(dayKey(), JSON.stringify({ haul: st.haul, treats: st.treats, firstTrick: st.firstTrick, editions: st.editions })); } catch (e) {} };

  const css = document.createElement('style'); css.textContent = `
#floor .word.candy{background:linear-gradient(90deg,#ff8a1f 0 46%,#7b3fbf 54% 100%)!important;color:#fff!important;border-color:#5a2a90!important;border-radius:10px!important;text-shadow:0 1px 0 #0007;font-weight:700}
#arena.keep #floor .word.candy{background:var(--k-paper)!important;color:var(--k-ink)!important;border:2px dashed var(--k-ink)!important;text-shadow:none;font-weight:400}
#floor .word.trick-wobble{animation:trwob .45s ease-in-out infinite alternate}
@keyframes trwob{from{rotate:-10deg}to{rotate:10deg}}
#floor .word.trick-hide{filter:opacity(.07);transition:filter .7s}
#floor .word.trick-swap{transition:translate .9s ease-in-out}
@media (prefers-reduced-motion:reduce){#floor .word.trick-wobble{animation:none;rotate:6deg}}`;
  document.head.appendChild(css);

  const wd = (a, b, L) => B() ? B().wd(a, b, L) : b - a;
  const dist = (p, q) => { const S = B().space(); return Math.hypot(wd(p.x, q.x, S.W), wd(p.y, q.y, S.H)); };
  // a bubble over a creature without a line in the IRC chat (a knock is not news)
  function bubble(c, t, ms) { if (!c.bub) return; c.bub.textContent = t; c.bub.classList.add('on'); clearTimeout(c._bt); c._bt = setTimeout(() => c.bub && c.bub.classList.remove('on'), ms || 2200); }
  const life = () => window.__life;
  const mn = n => life() && life().mn ? life().mn(n) : esc(n);
  const costume = c => { try { const v = window.__halloween && window.__halloween.costume ? window.__halloween.costume(c) : null; return !v ? null : typeof v === 'string' ? v : v.name || v.label || v.kind || null; } catch (e) { return null; } };

  function doors(from, skip) { const out = [];
    try { const S = window.__build && window.__build._st && window.__build._st(); if (S) for (const s of S.structs) if (s.done && s.door) out.push({ x: s.door.x, y: s.door.y + 18, name: s.name || 'a ' + s.kind, kind: 'house', w: 3 }); } catch (e) {}
    for (const c of B().creatures()) if (c.state === 'sleep' && !c.lab && c.name && !skip.has(c)) out.push({ x: c.x, y: c.y + 34, name: c.name + '’s bed', who: c.name, kind: 'bed', w: 2 });
    try { for (const t of A().things()) if (t.kind === 'design' && t.d && t.d.by && t.d.done !== false) out.push({ x: t.x, y: t.y + 30, name: t.d.by + '’s ' + (t.d.f ? 'chart' : 'design'), who: t.d.by, kind: 'landmark', w: 1 }); } catch (e) {}
    const cam = B().cam(), vs = B().viewSize(); out.push({ x: cam.x, y: cam.y - vs.h / 2 / (cam.z || 1) + 70, name: 'the Oracle', kind: 'oracle', w: 1.5 });
    const names = new Set([...skip].map(c => c.name)), near = out.filter(d => !(d.who && names.has(d.who)) && dist(from, d) < 1100 && dist(from, d) > 60); if (!near.length) return null;   // nobody knocks at its own door
    let tot = 0; for (const d of near) tot += d.w; let r = Math.random() * tot; for (const d of near) { r -= d.w; if (r <= 0) return d; } return near[0]; }

  function eligible(c, t) { return c && c.name && c.d && !c.lab && !c.guest && !c.held && !c._treat && !c.carrying && c.state !== 'sleep' && c.state !== 'hide' && (c.userUntil || 0) < t && !(c.dance && c.dance > t); }

  function recruit() { const t = now(), all = B().creatures(), n = all.length; if (!n) return;
    const cap = Math.max(1, Math.min(5, Math.round(n / 8))); if (st.groups.length >= cap) return;
    let lead = null; for (let i = 0; i < 30 && !lead; i++) { const c = all[Math.floor(Math.random() * n)]; if (eligible(c, t)) lead = c; } if (!lead) return;
    const members = [lead]; for (const c of all) { if (members.length >= 1 + Math.floor(Math.random() * 3)) break; if (c !== lead && eligible(c, t) && dist(c, lead) < 240) members.push(c); }
    const door = doors(lead, new Set(members)); if (!door) return;
    const g = { members, door, t0: t, phase: 'go', home: new Map() };
    members.forEach((c, i) => { c._treat = g; g.home.set(c, { x: c.x, y: c.y }); c.userUntil = t + 45000; B().goto(c, door.x + (i - (members.length - 1) / 2) * 34, door.y + (i % 2) * 14); });
    st.groups.push(g); }

  function giveCandy(c, door) { const word = rnd(CANDY);
    const w = window.__lakeHooks.addWord(word, c.x, c.y - 14); w.candy = true; w.el.classList.add('candy', 'carried'); w.carriedBy = c; c.carrying = w;
    st.haul[c.name] = (st.haul[c.name] || 0) + 1; st.treats++; saveNight();
    B().log('halloween', { kind: 'treat', who: c.name, door: door.name, candy: word, n: st.haul[c.name] });
    if (st.haul[c.name] >= 5 && st.haul[c.name] % 5 === 0) B().log('halloween', { kind: 'haul', who: c.name, n: st.haul[c.name] });   // the record is news at 5, 10, 15…
    if (life()) life().note(c, 'halloween', 'went trick-or-treating at ' + (door.who ? mn(door.who) + '’s ' + esc(door.name.split('’s ')[1] || '') : esc(door.name)) + ' and got', 'halloween:treat', word);
    return w; }

  function eat(c, w) { if (!w || c.carrying !== w) return false; const ws = B().words(), i = ws.indexOf(w); c.carrying = null; w.carriedBy = null; if (i >= 0) { w.el.remove(); ws.splice(i, 1); }
    c.d.hunger = Math.max(0, (c.d.hunger || 0) - 0.18); c.meals = (c.meals || 0) + 1; const fe = B().fe(c); if (fe) fe.thrill = Math.min(1, (fe.thrill || 0) + 0.2);
    bubble(c, 'mmm, ' + w.text); B().log('task', { who: c.name, option: 'eat', success: true, word: w.text, candy: true }); return true; }

  function trick(c, door) { const t = now(); if (c._trickAt && t - c._trickAt < 20000) return; c._trickAt = t;
    const ws = B().wordsNear(c.x, c.y, 320).filter(w => !w.carriedBy && !w.candy && w.el && w.text.length >= 3 && !w.el.classList.contains('trick-wobble') && !w.el.classList.contains('trick-hide') && !w._swap);
    if (!ws.length) { bubble(c, 'hmph'); return; }
    const kind = ws.length >= 2 && Math.random() < 0.34 ? 'swap' : Math.random() < 0.5 ? 'wobble' : 'hide', a = ws[Math.floor(Math.random() * ws.length)];
    let how;
    if (kind === 'swap') { const b = ws.filter(x => x !== a).sort((p, q) => dist(p, a) - dist(q, a))[0]; const S = B().space(), dx = wd(a.x, b.x, S.W), dy = wd(a.y, b.y, S.H);
      for (const [w, x, y] of [[a, dx, dy], [b, -dx, -dy]]) { w._swap = true; w.el.classList.add('trick-swap'); w.el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`; }
      const undo = () => { for (const w of [a, b]) { w._swap = false; if (w.el) { w.el.style.translate = ''; setTimeout(() => w.el && w.el.classList.remove('trick-swap'), 1000); } } };
      const tr = { undo }; st.tricks.add(tr); setTimeout(() => { if (st.tricks.delete(tr)) undo(); }, 10000); how = TRICKS[2][1].replace('{w}', '“' + a.text + '”').replace('{v}', '“' + b.text + '”'); }
    else { const cls = 'trick-' + kind; a.el.classList.add(cls); const undo = () => a.el && a.el.classList.remove(cls); const tr = { undo }; st.tricks.add(tr); setTimeout(() => { if (st.tricks.delete(tr)) undo(); }, kind === 'hide' ? 9000 : 8000);
      how = (kind === 'wobble' ? TRICKS[0][1] : TRICKS[1][1]).replace('{w}', '“' + a.text + '”'); }
    bubble(c, kind === 'hide' ? 'hehe' : 'trick!');
    if (!st.firstTrick) { st.firstTrick = { who: c.name, how }; saveNight(); }
    B().log('halloween', { kind: 'trick', who: c.name, how, door: door.name, word: a.text });
    if (life()) life().note(c, 'halloween', 'got no candy at ' + esc(door.name) + ' and played a trick: ' + esc(how), 'halloween:trick');
    oracle(`${c.name} got no candy at ${door.name}, so it ${how}`); }

  function oracle(seed) { const t = now(); if (t - st.lastOracle < 150000 || !B().comment) return; st.lastOracle = t; try { B().comment(seed, 'halloween'); } catch (e) {} }

  function end(g, c) { c._treat = null; c.userUntil = 0; }
  function step() { const t = now();
    for (const g of st.groups.slice()) {
      for (const c of g.members) if (c.held && c._treat === g) end(g, c);   // picked up by you: it stops trick-or-treating
      const live = g.members.filter(c => c._treat === g && B().creatures().includes(c)); if (!live.length) { st.groups.splice(st.groups.indexOf(g), 1); continue; }
      if (g.phase === 'go') { if (live.every(c => dist(c, g.door) < 50) || t - g.t0 > 25000) { g.phase = 'knock'; g.t1 = t; live.forEach((c, i) => { c.userUntil = t + 30000; bubble(c, i ? rnd(KNOCK) : 'trick or treat!', 1800); }); } }
      else if (g.phase === 'knock') { if (t - g.t1 < 1700) continue; g.phase = 'home'; g.t2 = t; const p = ODDS[g.door.kind] || 0.6; let got = 0;
        for (const c of live) { if (Math.random() < p) { if (c.hangryUntil > t) eat(c, giveCandy(c, g.door));   // hangry: one gone on the doorstep, one for the road
            const w = giveCandy(c, g.door); got++; bubble(c, w.text + '!', 1800); }
          else trick(c, g.door);
          const h = g.home.get(c); c.userUntil = t + 30000; B().goto(c, h.x, h.y); }
        if (got) { const c = live[0], w = c.carrying; if (w && w.candy) oracle(rnd([`${c.name} came back from ${g.door.name} with ${w.text}`, `trick or treat at ${g.door.name}: ${c.name} got ${w.text}`, `${c.name} is carrying ${w.text} home like a trophy`])); } }
      else if (g.phase === 'home') { for (const c of live.slice()) { const h = g.home.get(c); if (c._treat === g && (dist(c, h) < 40 || t - g.t2 > 20000)) { if (c.carrying && c.carrying.candy) eat(c, c.carrying); end(g, c); } }
        if (g.members.every(c => c._treat !== g)) st.groups.splice(st.groups.indexOf(g), 1); } }
    edition(t); }

  function edition(t) { const due = st.onSince && t - st.onSince > 6 * 60000 && t - (st.lastEd || st.onSince) > (st.lastEd ? 20 * 60000 : 0); if (!due || st.treats < 3) return; st.lastEd = t; st.editions++; saveNight();
    const top = Object.entries(st.haul).sort((a, b) => b[1] - a[1])[0];
    let best = null; for (const [n, k] of Object.entries(st.haul).sort((a, b) => b[1] - a[1])) { const c = B().creatures().find(x => x.name === n); const what = c && costume(c); if (what) { best = { who: n, what }; break; } }
    B().log('halloween', { kind: 'edition', treats: st.treats, haul: top ? { who: top[0], n: top[1] } : null, trick: st.firstTrick, costume: best }); }

  function cleanup() { for (const g of st.groups) for (const c of g.members) end(g, c); st.groups = [];
    for (const tr of st.tricks) tr.undo(); st.tricks.clear();
    const ws = B() ? B().words() : []; for (const w of ws.slice()) if (w.candy) { if (w.carriedBy) { if (w.carriedBy.carrying === w) w.carriedBy.carrying = null; w.carriedBy = null; } const i = ws.indexOf(w); if (i >= 0) { w.el.remove(); ws.splice(i, 1); } } }

  let timer = 0, wasOn = false;
  function tick() { const o = on() && !!B() && here();
    if (o && !wasOn) { st.onSince = now(); if (!st.started) { st.started = true; setTimeout(() => { if (on()) oracle('it is Halloween, and the creatures have found out about candy'); }, 20000); } }
    if (!o && wasOn) cleanup(); wasOn = o; if (!o) return;
    try { if (Math.random() < 0.7) recruit(); step(); } catch (e) { console.warn('trick or treat stopped', e); clearInterval(timer); cleanup(); } }
  timer = setInterval(tick, 1200);
  addEventListener('idle:halloween', e => { if (!(e.detail && e.detail.on)) { cleanup(); wasOn = false; } });
  window.__treat = { state: () => ({ groups: st.groups.length, treats: st.treats, haul: { ...st.haul }, tricks: st.tricks.size, firstTrick: st.firstTrick, candy: B() ? B().words().filter(w => w.candy).length : 0 }), tick, cleanup, _recruit: recruit, _edition: () => { st.lastEd = 0; st.onSince = now() - 7 * 60000; st.treats = Math.max(st.treats, 3); edition(now()); } };
})();
