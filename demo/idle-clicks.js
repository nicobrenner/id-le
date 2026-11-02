// idle-clicks.js: every click on the world answers (Nov 2026). The live stats showed people leaving right after their first click,
// with most rage clicks on the floor: a click on the world often did nothing visible. Now:
//   empty floor   → a soft ripple, and nearby creatures turn toward the spot (now and then one asks "?")
//   a word        → it wiggles, a small label says what it is and who eats it; the nearest creature that eats it perks up
//   a creature    → it says a short line in its own voice (the card opens as before)
//   a chart, form, picture or design → a wobble and its name
// and once, for a first visit: after ~6 s without a click, a ring around the nearest creature says "click a creature".
// Only short, still presses count (a drag, a long-press, a right-click keep doing what they did). Nothing here runs per frame,
// except the hint ring for its few seconds.
(() => {
  const K = () => window.__clickKit, A = () => window.__arena, arena = () => document.getElementById('arena');
  const css = document.createElement('style');
  css.textContent = `.ck-ripple{position:fixed;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:1.5px solid color-mix(in srgb,currentColor 55%,transparent);pointer-events:none;z-index:9;animation:ckrip .6s ease-out forwards;color:var(--ink,#444)}
@keyframes ckrip{to{transform:scale(6);opacity:0}}
.ck-tip{position:fixed;z-index:10003;max-width:240px;pointer-events:none;font:12px/1.35 system-ui;padding:5px 9px;border-radius:9px;background:var(--floor,#fff);color:var(--ink,#222);border:1px solid #8886;box-shadow:0 4px 14px #0003;opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s}
.ck-tip.on{opacity:1;transform:none}.ck-tip b{font-weight:600}.ck-tip small{opacity:.65}
.ck-wobble{animation:ckwob .45s ease-in-out}@keyframes ckwob{20%{rotate:-4deg}45%{rotate:3.5deg}70%{rotate:-2deg}100%{rotate:0deg}}
.word.ck-wiggle{animation:ckwig .5s ease-in-out}@keyframes ckwig{20%{translate:0 -4px}40%{translate:0 1px;rotate:-6deg}60%{rotate:5deg}80%{rotate:-2deg}100%{translate:0 0;rotate:0deg}}
.ck-ring{position:fixed;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:2px solid #2b5cff;box-shadow:0 0 0 0 #2b5cff66;pointer-events:none;z-index:9;animation:ckpulse 1.2s ease-out infinite}
.ck-ring span{position:absolute;left:50%;top:100%;transform:translate(-50%,6px);white-space:nowrap;font:600 12px system-ui;color:#2b5cff;background:var(--floor,#fff);padding:1px 7px;border-radius:8px}
@keyframes ckpulse{0%{box-shadow:0 0 0 0 #2b5cff66}100%{box-shadow:0 0 0 18px #2b5cff00}}
@media (prefers-reduced-motion:reduce){.ck-ripple,.ck-wobble,.word.ck-wiggle{animation:none}.ck-ring{animation:none}}`;
  document.head.appendChild(css);

  // what counts as "the world": the arena itself, its floor, its canvases, words, things and creature hit areas, never a panel or a button
  const UI = 'button,input,textarea,select,a,label,summary,#topbar,#placesBar,#whisper,#studio,#herd,#lab,#roomchat,#dj,#advpanel,#reelpanel,#objmenu,#team,#conn,#minimap,#ntf,#ntfpanel,#settings,#insp,#notice,#capPill,#hwChip,.zoomctl,#zoomCtl,#mSheet,#drawer,#trees,#almanac,#evo,#reel,.ck-tip';
  const inWorld = t => { const a = arena(); if (!a || !t || !a.contains(t)) return false; return !(t.closest && t.closest(UI)); };

  let down = null, lastClick = 0, hintShown = false;
  addEventListener('pointerdown', e => { lastClick = Date.now(); hideHint(); if (e.button !== 0 || !inWorld(e.target)) { down = null; return; } down = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target, id: e.pointerId }; }, true);
  addEventListener('pointercancel', () => { down = null; }, true);
  addEventListener('pointerup', e => { const d = down; down = null; if (!d || e.pointerId !== d.id) return; if (performance.now() - d.t > 400 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;   // drags and long-presses keep their own meaning
    try { answer(d.target, e.clientX, e.clientY); } catch (er) { console.warn('clicks', er); } }, true);

  function answer(target, x, y) {
    const k = K(); if (!k) return;
    const p = k.toWorld(x, y);
    const c = k.critAt(x, y); if (c) return creature(c);
    const thingEl = target.closest && target.closest('.thing, .design'); if (thingEl) return thing(thingEl, x, y);
    const w = k.wordAt(x, y); if (w) return word(w, target, x, y);
    floor(p, x, y);
  }
  const live = () => { const a = A(); return a ? a.raw().filter(c => !c._off && c.state !== 'sleep' && c.el && c.bub) : []; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function bubble(c, text, ms) { if (!c || !c.bub) return; c.bub.textContent = text; c.bub.classList.add('on'); clearTimeout(c._bt); c._bt = setTimeout(() => c.bub.classList.remove('on'), ms || 1800); }
  function face(c, p) { if (!c || c.held) return; c.heading = Math.atan2(p.y - c.y, p.x - c.x); }
  function tip(html, x, y, ms) { const el = document.createElement('div'); el.className = 'ck-tip'; el.innerHTML = html; document.body.appendChild(el);
    const r = el.getBoundingClientRect(); el.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x + 12)) + 'px'; el.style.top = Math.max(6, Math.min(innerHeight - r.height - 6, y - r.height - 10)) + 'px';
    requestAnimationFrame(() => el.classList.add('on')); setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 200); }, ms || 1900); return el; }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const say = (kind) => { try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'click_answer', extra: { kind } } })); } catch (e) {} };

  // empty floor: a ripple, and the creatures nearby look
  function floor(p, x, y) {
    const r = document.createElement('div'); r.className = 'ck-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700);
    const near = live().filter(c => dist(c, p) < 260).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 4);
    near.forEach(c => face(c, p));
    if (near[0] && Math.random() < 0.35) bubble(near[0], pick(['?', '…?', 'hm?', '*looks*']), 1400);
    say('floor');
  }
  // a word: wiggle, what it is, who eats it
  function word(w, target, x, y) {
    const el = w.el || (target.classList && target.classList.contains('word') ? target : null);
    if (el) { el.classList.remove('ck-wiggle'); void el.offsetWidth; el.classList.add('ck-wiggle'); setTimeout(() => el.classList.remove('ck-wiggle'), 600); }
    const k = K(), eaters = live().filter(c => k.eats(c, w)).sort((a, b) => dist(a, w) - dist(b, w));
    const who = eaters.length ? `food for ${esc(eaters[0].name)}${eaters.length > 1 ? ` and ${eaters.length - 1} other${eaters.length > 2 ? 's' : ''}` : ''}` : 'nobody here eats it right now';
    tip(`<b>“${esc(w.text)}”</b> · a ${w.piece ? 'piece of a word' : 'word'}<br><small>${who} · right-click (long-press) for more</small>`, x, y, 2200);
    if (eaters[0] && dist(eaters[0], w) < 500) { face(eaters[0], w); bubble(eaters[0], pick([`${w.text}!`, `*perks up* ${w.text}`, `ooh, ${w.text}`, '*sniffs*']), 1600); }
    say('word');
  }
  // a creature: a line in its own voice
  function creature(c) {
    if (Date.now() - (c._ckT || 0) < 2500) return; c._ckT = Date.now();
    const v = c.voice || {}, lines = v.greet || v.own || ['hi'];
    bubble(c, pick(lines).replace(/\{\w\}/g, ''), 1800);
    say('creature');
  }
  // charts, forms, pictures, designs: a wobble and a name
  function thing(el, x, y) {
    el.classList.remove('ck-wobble'); void el.offsetWidth; el.classList.add('ck-wobble'); setTimeout(() => el.classList.remove('ck-wobble'), 500);
    const t = (window.__things || []).find(o => o.el === el), kind = (t && t.kind) || (el.classList.contains('design') ? 'design' : 'thing');
    const by = el.querySelector && (el.querySelector('.by, .cap small, small') || {}).textContent;
    tip(`<b>${esc(kind)}</b>${by ? ` · <small>${esc(by.trim().slice(0, 60))}</small>` : ''}<br><small>drag it · right-click (long-press) for more</small>`, x, y, 1800);
    say('thing');
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // the first-visit hint: once per browser, after ~6 s with no click, a ring around the nearest creature
  let ring = null, ringC = null, ringRaf = 0, ringT = 0;
  function hideHint() { if (!ring) return; ring.remove(); ring = null; ringC = null; cancelAnimationFrame(ringRaf); }
  function showHint(force) {
    let seen = false; try { seen = localStorage.getItem('idle.clickHint') === '1'; } catch (e) {} if (!force && (seen || hintShown)) return;
    if (window.__genesis && window.__genesis.active && window.__genesis.active()) return;   // the genesis guides on its own
    if (!force && /[?&]test\b/.test(location.search)) return;   // test pages see it only when they ask (__clicks.hint())
    const k = K(), a = arena(); if (!k || !a) return; const r = a.getBoundingClientRect(), mid = k.toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const cs = live().filter(c => { const s = k.screenOf(c.x, c.y); return s.x > r.left + 40 && s.x < r.right - 40 && s.y > r.top + 60 && s.y < r.bottom - 40; }).sort((a2, b) => dist(a2, mid) - dist(b, mid));
    if (!cs.length) return;
    hintShown = true; try { localStorage.setItem('idle.clickHint', '1'); } catch (e) {}
    ringC = cs[0]; ring = document.createElement('div'); ring.className = 'ck-ring'; ring.innerHTML = '<span>click a creature</span>'; document.body.appendChild(ring); ringT = performance.now();
    const step = () => { if (!ring || !ringC) return; const s = k.screenOf(ringC.x, ringC.y); ring.style.left = s.x + 'px'; ring.style.top = s.y + 'px'; if (performance.now() - ringT > 7000) return hideHint(); ringRaf = requestAnimationFrame(step); };
    step();
  }
  let idleTimer = setInterval(() => { if (hintShown) { clearInterval(idleTimer); return; } if (document.visibilityState !== 'visible') return; const a = A(); if (!a || !a.raw().length) return;
    if (!window.__restoredOrFresh) return; if (!lastClick) lastClick = Date.now(); if (Date.now() - lastClick >= 6000) showHint(); }, 1000);

  window.__clicks = { answer: (x, y) => answer(document.elementFromPoint(x, y) || arena(), x, y), hint: () => { hintShown = false; showHint(true); return !!ring; }, ringOn: () => !!ring };
})();
