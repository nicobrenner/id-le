// idle-rave.js: rave mode (issue #2). Turn 🕺 rave on in the 🎧 deck and play: the creatures near you hear it and react by their
// own taste in music (genes: favourite tempo, how loud they can take it, and how much they listen for drums, bass and melody).
// Those who like it dance on the beat (each body its own way), friends form conga lines, bass lovers mosh when the bass is heavy;
// those who don't cover their ears and walk off; timid ones hide from the strobe; hangry ones keep eating; sleepers grumble, or
// wake up if it's loud. A dancefloor meter in the deck shows who's dancing and what this crowd wants. Dancing lifts their mood,
// hating it stresses them; it all goes in their diaries (and reels: "the night of the rave"). Off-screen creatures don't animate.
(() => {
  const H = () => window.__raveHooks, A = () => window.__arena, M = () => window.__music, Lf = () => window.__life;
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let lastBeat = 0, beatMs = 500, beatN = 0, F = null, on = false, raveId = 0, meterHTML = '';
  const active = () => { const m = M(); return !!(m && m.playing && m.rave()); };
  const phase = () => { if (!on) return 0; const p = (performance.now() - lastBeat) / beatMs; return p > 1.6 ? 0.999 : p % 1; };
  window.addEventListener('idle:beat', e => { const d = e.detail; lastBeat = performance.now(); beatMs = 60000 / d.bpm; beatN++;
    if (!on) return; for (const c of list()) { const v = c.dance; if (!v) continue; if (v.style === 'spin' && d.kick) v.turn = (v.turn || 0) + Math.PI / 2 * (0.6 + 0.4 * (v.k || 1)); } });
  const list = () => (A() ? A().raw() : []).filter(c => !c.lab && !c.guest && c.legs);
  const styleOf = g => (g.l1 || 0) + (g.l2 || 0) > 72 ? 'high' : ({ chip: 'bob', tri: 'spin', star: 'spin', orb: 'bounce', box: 'bob', seg: 'sway' })[g.body] || 'sway';
  function match(c) { const m = H().musicGenes(c.g), tempo = Math.exp(-Math.pow((F.bpm - m.tempo) / 22, 2)), tot = m.drums + m.bass + m.melody + 1e-3,
      pref = Math.min(1, 1.6 * (m.drums * F.drums + m.bass * F.bass + m.melody * F.melody) / tot), over = Math.max(0, F.loud - m.loud);
    return { s: 0.5 * tempo + 0.5 * pref - 1.4 * over, over, m }; }
  const MU = c => { const l = c.life || (c.life = {}); return l.music = l.music || { danced: 0, sets: {}, left: 0, raves: 0 }; };
  const say = (c, t) => { try { H().say(c, t); } catch (e) {} };
  const note = (c, x, g) => { try { Lf() && Lf().note(c, 'dance', x, g); } catch (e) {} };
  const think = (c, plain) => { try { Lf() && Lf().think(c, 'feel', plain, plain, { rave: 1 }); } catch (e) {} };
  const LOVE = ['*dances*', 'yes!!', 'this one!', '♪ ♪', '*bops*', 'again!'], HATE = ['too loud!', '*covers its ears*', 'nope.', 'my antennae…', 'I’m out'], GRUMBLE = ['*grumbles in its sleep*', '…turn it down…', '*rolls over*'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function begin() { on = true; raveId = Date.now(); for (const c of list()) c.rv = null; try { H().log('rave', { on: true, set: F && F.name }); } catch (e) {} }
  function finish() { on = false; const night = (() => { const d = window.__day ? window.__day.phase() : 0.25; return d > 0.55 && d < 0.95; })();
    for (const c of list()) { const r = c.rv; if (c.dance) { c.dance = null; c.userUntil = 0; } if (!r) continue;
      if (r.danced > 60000) { const min = Math.round(r.danced / 60000), what = r.top || 'the beat'; note(c, `danced ${night && min >= 3 ? 'all night' : min + ' min'} to ${esc(what)}`, 'dance:' + raveId); }
      c.rv = null; }
    try { H().log('rave', { on: false }); } catch (e) {} meterHTML = ''; paint(); }
  function tick() { const now = Date.now(); if (!active()) { if (on) finish(); return; } F = M().features(); if (!on) begin();
    const all = list(), small = all.length <= 60, cam = H().cam(), dancers = [], counts = { dance: 0, bored: 0, leave: 0, hide: 0, asleep: 0, hangry: 0 }, want = { t: 0, bass: 0, drums: 0, mel: 0, loud: 0, n: 0 };
    for (const c of all) { if (c.held || !(small || H().inView(c, 300))) { if (c.dance && c.rv && c.rv.mode !== 'leave') { c.dance = null; } continue; }
      const r = c.rv = c.rv || { mode: 'new', since: now, danced: 0, top: null };
      if (c.hangryUntil > now) { c.dance = null; r.mode = 'hangry'; counts.hangry++; continue; }   // too hungry to care
      if (c.state === 'sleep') { counts.asleep++; c.dance = null;
        if (F.loud > 0.72 && Math.random() < 0.012) { c.state = 'idle'; c.until = 0; say(c, '…what? who’s playing?'); think(c, 'the music woke me up'); }
        else if (Math.random() < 0.006) { c.heading = (c.heading || 0) + Math.PI; think(c, pick(GRUMBLE)); }
        continue; }
      if (c.state === 'hide') { counts.hide++; c.dance = null; continue; }
      if (F.strobe && H().timid(c) > 0.65 && r.mode !== 'leave' && Math.random() < 0.01) { c.dance = null; H().hideFor(c, 5000 + Math.random() * 4000, 'the strobe'); r.mode = 'hide'; think(c, 'the flashing lights scare me'); counts.hide++; continue; }
      const m = match(c); r.s = m.s; want.n++; want.t += m.m.tempo - F.bpm; want.bass += m.m.bass - F.bass; want.drums += m.m.drums - F.drums; want.mel += m.m.melody - F.melody; want.loud += m.over;
      const prev = r.mode, mode = (m.over > 0.3 || m.s < 0.2) ? 'leave' : (m.s > 0.55 || (prev === 'dance' && m.s > 0.45)) ? 'dance' : 'bored';
      if (mode !== prev) { r.mode = mode; r.since = now;
        if (mode === 'dance') { if (Math.random() < 0.5) say(c, pick(LOVE)); think(c, `I love this: ${F.bpm} bpm${F.bass > 0.5 ? ', that bass' : ''}`); if (!r.noted) { r.noted = 1; MU(c).raves++; note(c, `danced to ${esc(F.name || 'the deck')} (${F.bpm} bpm)`, 'dance:' + raveId); } }
        else if (mode === 'leave') { say(c, pick(HATE)); think(c, m.over > 0.3 ? 'too loud for me' : 'not my kind of music'); MU(c).left++; note(c, m.over > 0.3 ? 'the music was too loud, so I left' : 'didn’t like the music and walked away', 'dance:left:' + raveId);
          const ax = c.x - cam.x, ay = c.y - cam.y, d = Math.hypot(ax, ay) || 1; H().goto(c, c.x + ax / d * 480, c.y + ay / d * 480); c.userUntil = now + 7000; c.dance = { style: 'ears', k: 1 }; }
        else if (mode === 'bored') think(c, 'meh. not my tempo'); }
      if (mode === 'dance') { counts.dance++; dancers.push(c); const k = Math.max(0.4, Math.min(1.3, 0.4 + m.s)); c.dance = Object.assign(c.dance && c.dance.style !== 'ears' ? c.dance : {}, { style: c.dance && c.dance.style === 'mosh' ? 'mosh' : styleOf(c.g), k });
        r.danced += 250; const mu = MU(c); mu.danced += 0.25; const nm = F.name || 'the deck'; mu.sets[nm] = (mu.sets[nm] || 0) + 0.25; r.top = F.bass > 0.5 && m.m.bass > 0.5 ? 'the bass' : nm;
        const fe = c.life && c.life.fe; if (fe && Math.random() < 0.1) { fe.thrill = Math.min(1, (fe.thrill || 0) + 0.06); } if (c.d) { c.d.affection = Math.min(1, c.d.affection + 0.002); c.d.fatigue = Math.min(1, c.d.fatigue + 0.0015); } }
      else if (mode === 'leave') { counts.leave++; const fe = c.life && c.life.fe; if (fe && Math.random() < 0.1) fe.fear = Math.min(1, (fe.fear || 0) + 0.04); if (now - r.since > 7000) { c.dance = null; r.mode = 'gone'; } }
      else { counts.bored++; c.dance = { style: 'sway', k: 0.25 }; } }
    // conga lines with friends, mosh knots on heavy bass, everyone else dances on the spot
    const byName = new Map(dancers.map(c => [c.name, c])), mosh = F.bass > 0.35 ? dancers.filter(c => H().musicGenes(c.g).bass > 0.55 && c.rv.s > 0.6) : [];
    let mx = 0, my = 0; for (const c of mosh) { mx += c.x; my += c.y; } if (mosh.length) { mx /= mosh.length; my /= mosh.length; }
    for (const c of dancers) { c.userUntil = now + 1500;
      if (mosh.length >= 3 && mosh.includes(c)) { c.dance.style = 'mosh'; if (Math.random() < 0.25 || Math.hypot(c.tx - c.x, c.ty - c.y) < 4) { const a = Math.random() * 6.28, R = 14 + Math.sqrt(mosh.length) * 12; H().goto(c, mx + Math.cos(a) * R * Math.random(), my + Math.sin(a) * R * Math.random()); } continue; }   // a new shove about once a second, not every tick
      if (c.dance.style === 'mosh') c.dance.style = styleOf(c.g);
      const lead = (c.life && c.life.friends || []).map(n => byName.get(n)).find(f => f && f !== c && f.rv.s >= c.rv.s && (f.rv.lead !== c) && Math.hypot(f.x - c.x, f.y - c.y) < 320);
      c.rv.lead = lead || null;
      if (lead) { const h = lead.heading || 0; H().goto(c, lead.x - Math.cos(h) * 42, lead.y - Math.sin(h) * 42); if (!lead.rv.conga) { lead.rv.conga = 1; lead.rv.wander = (lead.rv.wander || Math.random() * 6.28); } }
      else if (c.rv.conga) { c.rv.wander += 0.35; if (Math.random() < 0.5) H().goto(c, c.x + Math.cos(c.rv.wander) * 26, c.y + Math.sin(c.rv.wander) * 26); }   // a conga leader shuffles along
      else { c.tx = c.x; c.ty = c.y; } }
    for (const c of dancers) if (c.rv.conga && !dancers.some(k => k.rv.lead === c)) c.rv.conga = 0;
    counts.conga = dancers.filter(c => c.rv.lead).length; counts.mosh = mosh.length >= 3 ? mosh.length : 0;
    // the dancefloor meter
    const n = Math.max(1, want.n), tips = [];
    if (want.n) { const dt = want.t / n; if (Math.abs(dt) > 10) tips.push(dt > 0 ? 'faster' : 'slower'); const db = want.bass / n, dd = want.drums / n, dm = want.mel / n;
      const big = [['more bass', db], ['less bass', -db], ['more drums', dd], ['fewer drums', -dd], ['more melody', dm], ['less melody', -dm]].filter(([, v]) => v > 0.18).sort((a, b) => b[1] - a[1]); if (big[0]) tips.push(big[0][0]); if (want.loud / n > 0.12) tips.push('quieter'); }
    const tot = counts.dance + counts.bored + counts.leave, bar = (k, col) => tot ? `<i style="width:${(counts[k] / tot * 100).toFixed(1)}%;background:${col}"></i>` : '';
    meterHTML = `<div class="rmeter"><div class="rbar">${bar('dance', '#3c9')}${bar('bored', '#a99')}${bar('leave', '#e66')}</div>
<div class="sub" style="margin:2px 0 0">🕺 ${counts.dance} dancing · 😐 ${counts.bored} bored · 🙉 ${counts.leave} leaving${counts.hide ? ` · 🫣 ${counts.hide} hiding` : ''}${counts.asleep ? ` · 💤 ${counts.asleep} asleep` : ''}${counts.hangry ? ` · 😤 ${counts.hangry} eating` : ''}${counts.conga ? ` · 🚂 ${counts.conga} in a conga` : ''}${counts.mosh ? ` · 🤘 ${counts.mosh} moshing` : ''}</div>
<div class="sub" style="margin:0">${tot ? (tips.length ? 'crowd wants: ' + tips.join(', ') : counts.dance >= tot * 0.6 ? 'the crowd loves this' : 'mixed feelings') : 'nobody near enough to hear: go closer'}</div></div>`;
    window.__raveStats = { ...counts, tips, F }; paint(); }
  function paint() { const el = document.getElementById('ravemeter'); if (el && el.innerHTML !== meterHTML) el.innerHTML = meterHTML; }
  const css = document.createElement('style'); css.textContent = '.rmeter{margin:4px 0 6px}.rbar{display:flex;height:7px;border-radius:4px;overflow:hidden;background:#8883}.rbar i{display:block;height:100%}';
  document.head.appendChild(css);
  setInterval(tick, 250); setInterval(paint, 1000);
  window.addEventListener('idle:rave', () => { if (!active() && on) finish(); });
  function cardLine(c) { const m = H() ? H().musicGenes(c.g) : null; if (!m) return ''; const top = [['drums', m.drums], ['bass', m.bass], ['melody', m.melody]].sort((a, b) => b[1] - a[1])[0][0], mu = c.life && c.life.music;
    const fav = mu && Object.entries(mu.sets || {}).sort((a, b) => b[1] - a[1])[0];
    return `<span class="k">music</span> likes ~${m.tempo} bpm, mostly ${top}${m.loud < 0.45 ? ', not too loud' : m.loud > 0.8 ? ', loud' : ''}${mu && mu.danced >= 30 ? ` · danced ${Math.round(mu.danced / 60)} min` : ''}${fav && fav[1] >= 30 ? ` · favourite: ${esc(fav[0])}` : ''}${mu && mu.left ? ` · left ${mu.left} rave${mu.left > 1 ? 's' : ''}` : ''}<br>`; }
  window.__rave = { phase, cardLine, active: () => on, stats: () => window.__raveStats };
})();
