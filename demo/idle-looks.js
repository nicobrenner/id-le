// idle-looks.js: how a creature presents itself, and how you find it in a busy world (issue #36).
// A "showiness" gene (g.show, 0..1, evolvable, inherited; loosely tied to the flocking gene) sets the look:
//   showy (≥ 0.66)  a soft glow in its own hue and little ripples where its feet land; it pulses when happy or dancing.
//                   It makes friends faster, but it gets noticed: thieves pick it first and scares find it more often.
//   plain           the usual look.
//   shy (≤ 0.34)    camouflage: it fades toward the floor under it, no ripples. Robbed less (thieves lose track of it),
//                   scared less, but it makes friends more slowly.
//   dazzle herds    shy kin moving together share a stripe pattern, so the herd reads as one moving mass; thieves lose
//                   track of its members more often.
// For you: when the view is busy every plain creature gets a faint halo under it so it separates from the word-bricks; the hovered
// creature always gets a clear ring; "highlight creatures" (⚙ settings, the ✨ button on phones, or hold / press H) rings
// every creature, camouflaged or not. All drawing is on the creature canvas; ripples are pooled; light quality drops them.
//   window.__looks: pre, post, dazzle, step, end (renderer hooks), scareMul, targetMul, slip, bond (gameplay), cardLine,
//   showOf(c), hilite(on?), state()
(() => {
  const H = () => window.__looksHooks; if (!H()) return;
  const KEY = 'idle.looks', clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  let S = { hilite: false }; try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  let held = false, busy = 0, herds = 0;

  // ---------- the gene: kept on the genome once known; a creature born before #36 gets one from its flocking gene and its id
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; return ((h ^ (h >>> 12)) >>> 0) / 4294967296; };
  function showOf(c) { const g = c.g; if (!g) return 0.5; if (typeof g.show !== 'number') g.show = +clamp(0.2 + 0.5 * (g.social ?? 0.5) + (hash(g.id || c.name) - 0.5) * 0.6).toFixed(2); return g.show; }
  const kind = c => { const s = showOf(c); return s >= 0.66 ? 'showy' : s <= 0.34 ? 'shy' : 'plain'; };

  // ---------- sprites: a glow per hue (24 buckets) and one soft halo, drawn with drawImage (cheap at 1,000 creatures)
  const GLOW = {}, SZ = 64;
  function glowSprite(hue) { const b = Math.round(((hue % 360) + 360) % 360 / 15) % 24; if (GLOW[b]) return GLOW[b];
    const cv = document.createElement('canvas'); cv.width = cv.height = SZ; const x = cv.getContext('2d'), gr = x.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
    gr.addColorStop(0, `hsla(${b * 15},95%,62%,.7)`); gr.addColorStop(0.5, `hsla(${b * 15},95%,60%,.32)`); gr.addColorStop(1, `hsla(${b * 15},95%,60%,0)`); x.fillStyle = gr; x.fillRect(0, 0, SZ, SZ); return GLOW[b] = cv; }
  const HALO = {}; function haloSprite(dark) { const k = dark ? 'd' : 'l'; if (HALO[k]) return HALO[k];
    const cv = document.createElement('canvas'); cv.width = cv.height = SZ; const x = cv.getContext('2d'), gr = x.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2), c = dark ? '20,22,30' : '255,253,246';
    gr.addColorStop(0, `rgba(${c},.95)`); gr.addColorStop(0.55, `rgba(${c},.7)`); gr.addColorStop(1, `rgba(${c},0)`); x.fillStyle = gr; x.fillRect(0, 0, SZ, SZ); return HALO[k] = cv; }
  const rad = c => Math.max(c.g.bodyL, c.g.bodyW) * (c.size || 1);

  // ---------- renderer hooks (Crit.draw / Crit.drawTo), in world coordinates with the creature's wrap offset applied
  function pre(g, c, t, replay) { if (!c.g) return; const s = showOf(c), r = rad(c), hp = c.state === 'hide', low = H().qual().low;
    if (low) { if (s <= 0.34 && !hilited(c)) g.globalAlpha *= 1 - 0.5 * (0.34 - s) / 0.34; return; }   // light quality (phones): only the camouflage, no glow, halo or ripples
    if (!replay && busy > 0.02 && !H().keep() && s > 0.34 && s < 0.66) {   // the halo is for plain ones: showy ones glow, shy ones are meant to blend in
       const R = r * 1.9 + 10; g.save(); g.globalAlpha *= 0.55 * busy; g.drawImage(haloSprite(H().isDark()), c.x - R, c.y - R, R * 2, R * 2); g.restore(); }
    if (s >= 0.66 && !hp && c.state !== 'sleep') { const happy = c.dance ? 1 : clamp(((c.life && c.life.fe && c.life.fe.joy) || 0.5)), pulse = 1 + 0.12 * Math.sin(t / (c.dance ? 120 : 420) + (c.phase || 0)) * (0.5 + happy),
      R = (r * 1.6 + 14) * pulse * (0.75 + 0.5 * (s - 0.66) / 0.34); g.save(); g.globalAlpha *= 0.55 + 0.45 * (s - 0.66) / 0.34; g.drawImage(glowSprite((c.gs || c.g).hue), c.x - R, c.y - R, R * 2, R * 2); g.restore(); }
    if (s <= 0.34 && !hilited(c)) g.globalAlpha *= 1 - 0.5 * (0.34 - s) / 0.34 * (c.state === 'move' ? 0.8 : 1); }   // camouflage: fades toward the floor (less while it walks)
  const hilited = c => S.hilite || held || c === H().hover();
  function post(g, c, t) { const sel = c === H().selected(), hov = c === H().hover(); if (!(S.hilite || held || hov) || sel) return;
    const r = rad(c) * 0.95 + 9, z = H().cam().z || 1, lw = Math.max(1.2, 2 / z), hue = (c.gs || c.g).hue || 200;
    g.save(); g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.lineWidth = lw + 2 / z; g.strokeStyle = H().isDark() ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.85)'; g.stroke();
    g.lineWidth = lw; g.strokeStyle = H().keep() ? (H().isDark() ? '#fff' : '#000') : `hsl(${hue},100%,${H().isDark() ? 62 : 45}%)`; g.stroke(); g.restore(); }
  function dazzle(g, c, L, W) { if (H().qual().low) return; const a = c._dz || 0; g.save(); g.beginPath(); g.ellipse(0, 0, Math.max(1, L * 0.62), Math.max(1, W * 0.62), 0, 0, Math.PI * 2); g.clip();
    g.rotate(a); g.strokeStyle = H().keep() ? '#000' : 'rgba(15,15,20,.55)'; g.lineWidth = 2.2; const R = Math.max(L, W); g.beginPath(); for (let x = -R; x <= R; x += 5) { g.moveTo(x, -R); g.lineTo(x, R); } g.stroke(); g.restore(); }

  // ripples: pooled rings where a showy creature's feet land
  const POOL = 140, rip = []; let ri = 0;
  function step(c, f) { if (!c.g || H().qual().low || c.state === 'hide') return; const s = showOf(c); if (s < 0.66 || c.state !== 'move' || Math.random() > 0.12 + 0.3 * (s - 0.66) / 0.34) return;   // a few, so a busy view does not fill with rings
    const o = rip[ri] || (rip[ri] = {}); o.x = f.x + (c.ox || 0); o.y = f.y + (c.oy || 0); o.t = performance.now(); o.hue = (c.gs || c.g).hue || 200; o.r = 4 + 6 * (c.size || 1); ri = (ri + 1) % POOL; }
  function end(g, t) { if (!rip.length) return; const now = performance.now(), dark = H().isDark(), keep = H().keep(); g.save(); g.lineWidth = 1;
    for (const o of rip) { const a = (now - o.t) / 700; if (!(a >= 0 && a < 1)) continue; g.globalAlpha = 0.38 * (1 - a); g.strokeStyle = keep ? (dark ? '#fff' : '#000') : `hsl(${o.hue},90%,${dark ? 68 : 45}%)`; g.beginPath(); g.arc(o.x, o.y, o.r * (1 + 1.6 * a), 0, Math.PI * 2); g.stroke(); }
    g.restore(); }

  // ---------- gameplay (mild): noticed vs. hidden
  const scareMul = c => 0.7 + 0.55 * showOf(c);                                       // showy 1.06–1.25, shy 0.7–0.89
  const targetMul = c => (0.75 + 0.6 * (1 - showOf(c))) * (c._dz ? 1.3 : 1);          // effective distance for thieves: showy are "closer"
  const slip = c => clamp(0.3 * (0.5 - showOf(c)) / 0.5) + (c._dz ? 0.2 : 0);          // a thief loses track of a shy one or a herd member
  const bond = (a, b) => 0.75 + 0.25 * (showOf(a) + showOf(b));                         // seconds of company count faster for showy pairs

  // ---------- every 2 s: dazzle herds, the busy level, firsts
  let firstDz = false; try { firstDz = localStorage.getItem('idle.looks.dz') === '1'; } catch (e) {}
  setInterval(() => { if (document.hidden) return; const h = H(), cs = h.creatures(); let n = 0;
    for (const c of cs) c._dzNext = 0;
    for (const c of cs) { if (!c.g || c.lab || c.held || c._dzNext || showOf(c) > 0.45 || c.state === 'sleep') continue; const fk = h.famKey(c);
      const kin = h.creaturesNear(c.x, c.y, 130).filter(o => o !== c && o.g && !o._dzNext && h.famKey(o) === fk && showOf(o) <= 0.45 && o.state !== 'sleep');
      if (kin.length < 2) continue; const a = 0.6 + hash(c.name) * 1.9; n++; for (const o of [c, ...kin]) o._dzNext = a;
      if (!firstDz) { firstDz = true; try { localStorage.setItem('idle.looks.dz', '1'); } catch (e) {} h.log('looks', { kind: 'dazzle', who: c.name, n: kin.length + 1, at: { x: Math.round(c.x), y: Math.round(c.y) } }); }
      for (const o of [c, ...kin]) if (o.life && !o.life.dz) { o.life.dz = 1; h.note(o, 'first', 'moved in a dazzle herd for the first time'); } }
    for (const c of cs) { c._dz = c._dzNext || 0; } herds = n;
    // busy: words per 100×100 px around the middle of the view
    const cam = h.cam(), vs = h.viewSize(), R = Math.min(vs.w, vs.h) / 2 / (cam.z || 1), m = h.wordsNear(cam.x, cam.y, R).length, dens = m / (Math.PI * R * R) * 1e4;
    busy = clamp((dens - 0.5) / 1.5); }, 2000);

  // ---------- highlight: a switch (⚙ settings, the ✨ button) and the H key (tap toggles, hold shows while held)
  function hilite(on) { S.hilite = on ?? !S.hilite; save(); const b = document.getElementById('hiliteBtn'); if (b) b.classList.toggle('on', S.hilite); return S.hilite; }
  const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  let hDown = 0;
  addEventListener('keydown', e => { if (e.key !== 'h' && e.key !== 'H' || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return; if (!e.repeat) hDown = performance.now(); held = true; });
  addEventListener('keyup', e => { if (e.key !== 'h' && e.key !== 'H') return; held = false; if (performance.now() - hDown < 250 && !typing(e)) hilite(); });
  const css = document.createElement('style'); css.textContent = '#hiliteBtn{display:none}#hiliteBtn.on{background:#2b5cff;color:#fff;border-color:#2b5cff}'; document.head.appendChild(css);
  const mount = () => { const bar = document.getElementById('topbar'); if (!bar) return setTimeout(mount, 300); if (document.getElementById('hiliteBtn')) return;
    const b = document.createElement('button'); b.id = 'hiliteBtn'; b.textContent = '✨'; b.title = 'highlight creatures: a ring around every one, camouflaged or not (H)'; b.classList.toggle('on', S.hilite); b.addEventListener('click', () => hilite()); bar.appendChild(b); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();

  // ---------- the card
  function cardLine(c) { const s = showOf(c), k = kind(c);
    return `<span class="k">looks</span> ${k === 'showy' ? 'showy · glows in a crowd, leaves ripples' : k === 'shy' ? 'shy · blends into the floor' : 'plain'} (${s.toFixed(2)})${c._dz ? ' · in a dazzle herd' : ''}<br>`; }

  window.__looks = { pre, post, dazzle, step, end, scareMul, targetMul, slip, bond, cardLine, showOf, kind, hilite, state: () => ({ hilite: S.hilite, held, busy: +busy.toFixed(2), herds, ripples: rip.filter(o => performance.now() - o.t < 700).length }) };
})();
