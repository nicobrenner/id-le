// idle-babies.js: natural reproduction (issue #33). Until now generations only grew when you cloned or spawned a creature,
// so a world's genes were whatever its founders happened to carry. Now good friends, both well fed, rested and not scared,
// now and then have a child; rarely a loner buds a near-copy of itself. The child's genes come from both parents (each gene
// from one of them or a blend, objects such as chart or counting tastes whole from one), then a small mutation through the
// same machinery evolution uses. It starts small and grows with meals; its family and naming style follow a parent.
// Limits: births need food nearby and room (a crowd past its comfort has none), and stop at the world's population cap
// (studio → Children, 60 by default). At the cap births stop; nobody is ever removed. Per world: on by default, a toggle.
// Diary lines for parents and child, friendships between them, a family tree with both parents (idle-trees.js), Gazette
// firsts (first baby, twins, a child of two families), replays and a reel ("a new arrival"), the almanac's event log.
//   window.__babies: tick(force), cfg, status(), line(), births(), stats()
(() => {
  const H = () => window.__babyHooks; if (!H()) return;
  const KEY = 'idle.babies', now = () => Date.now(), MIN = 60000;
  const cfg = { rate: 1, cool: 1, every: 15000 };   // test hooks: rate multiplies the chances, cool scales the waits
  let S = { births: [], cool: {}, last: 0 }; try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.births)) S = Object.assign(S, s); } catch (e) {}
  const save = () => { try { if (S.births.length > 400) S.births.splice(0, S.births.length - 400); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const pick = a => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = c => c.uid || (c.uid = 'i' + now().toString(36) + Math.random().toString(36).slice(2, 5));
  const on = () => H().world().births !== false, cap = () => H().world().popCap || 60;
  const here = () => H().creatures().filter(c => c.name && !c.lab && !c.guest && !c.bench && c.d);
  const dist = (a, b) => { const sp = H().space(); return Math.hypot(H().wd(a.x, b.x, sp.W), H().wd(a.y, b.y, sp.H)); };

  // ---------- who is ready ----------
  const GROWN = 0.85, AGE = 5 * MIN, COOL = 12 * MIN, GAP = 90000;
  function ready(c, t) { if (c.held || c.state === 'hide' || (c.size || 1) < GROWN) return 'young';
    if (t - (c.born || 0) < AGE * cfg.cool) return 'young'; if (t - (S.cool[uid(c)] || 0) < COOL * cfg.cool) return 'resting';
    const d = c.d, f = H().feelings(c) || {}; if (d.hunger > 0.5) return 'hungry'; if (d.fatigue > 0.6) return 'tired'; if ((f.afraid || 0) > 0.35 || (f.hurt || 0) > 0.5) return 'scared';
    return ''; }
  const crowded = c => { const sp = c._sp; return sp && (sp.dis > 0.5 || sp.n > 7); };
  function food(cs, x, y) { let n = 0; const ws = H().wordsNear(x, y, 360); for (const w of ws) { if (w.carriedBy) continue; for (const c of cs) if (H().edible(c, w)) { n++; break; } if (n >= 6) break; } return n; }

  // ---------- the child's genes ----------
  const HUE = new Set(['hue', 'footHue', 'laserHue', 'paintHue']), INT = new Set(['palps', 'abdomen', 'laser', 'mTempo', 'mglyph', 'dzStyle', 'dzMax', 'voicePitch', 'sortAxis']);
  const SKIP = new Set(['id', 'parent', 'parent2', 'name', 'born', 'birth', 'legs']);
  function mix(a, b) { const g = JSON.parse(JSON.stringify(a)), keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of keys) { if (SKIP.has(k)) continue; const x = a[k], y = b[k];
      if (typeof x === 'number' && typeof y === 'number') { const r = Math.random();
        if (r < 0.3) g[k] = x; else if (r < 0.6) g[k] = y;
        else { const w = Math.random(); if (HUE.has(k)) { const d = ((y - x + 540) % 360) - 180; g[k] = Math.round((x + d * w + 360) % 360); } else g[k] = x + (y - x) * w; if (INT.has(k)) g[k] = Math.round(g[k]); else g[k] = +(+g[k]).toFixed(3); } }
      else if (y !== undefined && (x === undefined || Math.random() < 0.5)) g[k] = JSON.parse(JSON.stringify(y)); }
    g.legs = Math.random() < 0.5 ? a.legs : (b.legs || a.legs); return g; }
  function genome(a, b) { const h = H(), pa = a.g, pb = b ? b.g : a.g, m = b ? mix(pa, pb) : JSON.parse(JSON.stringify(pa)), fam = h.famKey(Math.random() < 0.5 || !b ? a : b);
    const g = h.mutate(fam, b ? 0.08 : 0.05, m);
    // a small mutation, not a new creature: keep the mixed body, job and actions most of the time
    if (Math.random() < 0.85) { g.body = m.body; g.job = m.job; if (m.letter) g.letter = m.letter; } if (Math.random() < 0.9 && m.actions) g.actions = m.actions.slice();
    if (m.social != null) g.social = +clamp(m.social + (Math.random() - 0.5) * 0.08, 0, 1).toFixed(2);
    g.parent = pa.id; g.parent2 = b ? pb.id : null; g.birth = 1; g.born = now(); return { g, fam }; }

  // ---------- a birth ----------
  const mn = n => H().mn(n);
  function deliver(a, b, twins) { const h = H(), t = now(), sp = h.space(), mx = b ? (a.x + h.wd(a.x, b.x, sp.W) / 2) : a.x + 30, my = b ? (a.y + h.wd(a.y, b.y, sp.H) / 2) : a.y + 20; const kids = [];
    for (let i = 0; i < (twins ? 2 : 1); i++) { const { g, fam } = genome(a, b), c = h.birth(fam, g, mx + (i ? 26 : 0) + (Math.random() - 0.5) * 20, my + 18 + (Math.random() - 0.5) * 16); if (!c) break; kids.push(c); }
    if (!kids.length) return null;
    const ps = [a, b].filter(Boolean), famA = h.famName(a), famB = b ? h.famName(b) : famA;
    for (const c of kids) { const sib = kids.filter(k => k !== c);
      h.note(c, 'birth', b ? `was born to ${mn(a.name)} and ${mn(b.name)}${sib.length ? ', a twin of ' + mn(sib[0].name) : ''}` : `budded from ${mn(a.name)}`, 'birth:child');
      const d = c.life && c.life.diary; if (d && d.length) d[d.length - 1].par = ps.map(p => p.name);
      const fr = (c.life && c.life.friends) || null; if (fr) for (const p of ps.concat(sib)) if (!fr.includes(p.name)) fr.push(p.name);
      h.evoFx(c, 'keep'); }
    for (const p of ps) { const other = ps.find(x => x !== p); h.note(p, 'birth', kids.length > 1 ? `had twins${other ? ' with ' + mn(other.name) : ''}: ${kids.map(k => mn(k.name)).join(' and ')}` : other ? `had a child with ${mn(other.name)}: ${mn(kids[0].name)}` : `budded: ${mn(kids[0].name)} is a little copy of it`, 'birth:parent');
      const fr = (p.life && p.life.friends) || null; if (fr) for (const k of kids) if (!fr.includes(k.name)) fr.push(k.name);
      p.d.affection = clamp((p.d.affection || 0.5) + 0.08, 0, 1); p.d.hunger = clamp(p.d.hunger + 0.15, 0, 1); p.d.fatigue = clamp(p.d.fatigue + 0.15, 0, 1); S.cool[uid(p)] = t; try { h.speak(p, pick(['♥', 'tiny!', 'look at you', 'welcome'])); } catch (e) {} }
    S.last = t; for (const k of kids) S.births.push({ t, who: k.name, a: a.name, b: b ? b.name : null, place: h.placeId(), social: k.g.social ?? null, fam: h.famName(k) });
    save(); h.log('birth', { who: kids[0].name, twin: kids[1] ? kids[1].name : null, a: a.name, b: b ? b.name : null, famA, famB, bud: !b, at: { x: Math.round(mx), y: Math.round(my) } });
    if (Math.random() < 0.35) h.comment(pick(b ? [`${a.name} and ${b.name} had a child. It is mostly legs`, 'A new one. Small, loud, already hungry', `${kids[0].name} arrived. Everybody pretends they planned this`] : [`${a.name} budded. Now there are two of them, and one is smaller`]), 'special');
    return kids; }

  // ---------- the check, every 15 s ----------
  let status = { t: 0, why: 'not checked yet', pairs: 0 };
  function tick(force) { const h = H(); if (!h || h.traveling()) return null; const t = now();
    if (!on()) { status = { t, why: 'off in the studio (Children)' }; return null; }
    const cs = here(); if (cs.length >= cap()) { status = { t, why: `at the cap (${cs.length} of ${cap()})` }; return null; }
    if (!force && t - S.last < GAP * cfg.cool) { status = { ...status, t }; return null; }
    const why = {}, rd = new Map(); for (const c of cs) { const r = ready(c, t); rd.set(c, r); if (r) why[r] = (why[r] || 0) + 1; }
    const ok = cs.filter(c => !rd.get(c)), pairs = [], seen = new Set(); let tooCrowded = 0, noFood = 0;
    for (const a of ok) for (const n of (a.life && a.life.friends) || []) { const b = ok.find(o => o.name === n); if (!b || b === a) continue; const k = [a.name, b.name].sort().join('|'); if (seen.has(k)) continue; seen.add(k);
      if (dist(a, b) > 260) continue; if (crowded(a) || crowded(b)) { tooCrowded++; continue; } if (food([a, b], (a.x + b.x) / 2, (a.y + b.y) / 2) < 4) { noFood++; continue; } pairs.push([a, b]); }
    status = { t, pairs: pairs.length, why: pairs.length ? '' : ok.length < 2 ? (Object.entries(why).sort((p, q) => q[1] - p[1]).map(([k, n]) => `${n} ${k}`).slice(0, 3).join(', ') || 'nobody ready') : tooCrowded ? 'friends are ready but too crowded' : noFood ? 'friends are ready but there is too little food nearby' : 'no friends close together and ready' };
    for (const [a, b] of pairs.sort(() => Math.random() - 0.5)) if (force || Math.random() < 0.012 * cfg.rate) return deliver(a, b, Math.random() < 0.06);
    // budding: a rare loner with no friend about, well fed and alone
    for (const a of ok) { if ((a.life && a.life.friends || []).some(n => ok.some(o => o.name === n)) || crowded(a) || (a._sp && a._sp.n > 2)) continue; if (food([a], a.x, a.y) < 3) continue;
      if (Math.random() < 0.0015 * cfg.rate) return deliver(a, null, false); }
    return null; }
  setInterval(() => { try { tick(false); } catch (e) { console.warn('babies', e); } }, cfg.every);

  // ---------- the advisor's line ----------
  function line() { const t = now(), hr = S.births.filter(b => t - b.t < 60 * MIN && b.place === H().placeId()).length, cs = here().length;
    const st = !on() ? 'off (studio → Children)' : cs >= cap() ? `paused: at the cap (${cs} of ${cap()}); nobody is removed` : status.why ? 'none right now: ' + status.why : `${status.pairs} pair${status.pairs === 1 ? '' : 's'} could have a child`;
    return `<div class="sub" style="margin:4px 0">🐣 <b>births</b> ${hr} in the last hour · ${st}</div>`; }
  window.__babies = { tick, cfg, status: () => status, line, births: () => S.births.slice(), stats: () => { const cs = here(); return { n: cs.length, cap: cap(), on: on(), births: S.births.length, social: cs.length ? +(cs.reduce((s, c) => s + (c.g.social ?? 0.5), 0) / cs.length).toFixed(3) : null }; }, deliver };
})();
