// idle-mobile.js: Id|le on a phone (#32). Only below 500 px wide; desktop is untouched.
//  - the top bar keeps creatures, 🔔, studio and a ☰ that opens a sheet with everything else (labels, 44 px targets)
//  - every window (advisor, deck, reels, drawer, trees, notices, card, creatures, studio, chat…) is a bottom sheet:
//    full width, one at a time, ✕ or a swipe down closes it; dragging and remembered places stay desktop-only
//  - a long press works where a right-click does (keep a copy, inspect)
// Pinch zoom and the "start light on small screens" quality live in arena.html; the calm first minutes in idle-notify.js.
(() => {
  const MQ = matchMedia('(max-width: 500px)'), $ = s => document.querySelector(s), phone = () => MQ.matches;
  const css = document.createElement('style'); css.textContent = `
#mMore,#mSheet{display:none}
@media (max-width: 500px) {
  #mSheet{display:block}
  html,body{overflow-x:hidden;max-width:100vw}
  #arena{margin:0!important;border-radius:0!important;border-left:0!important;border-right:0!important;height:100dvh!important;touch-action:none}
  #topbar{left:6px!important;right:6px;top:6px!important;display:flex;gap:6px;align-items:center;flex-wrap:nowrap;opacity:1!important}
  #topbar>*{display:none!important}
  #topbar>#herdBtn,#topbar>#ntfBtn,#topbar>#studioBtn,#topbar>#mMore{display:inline-flex!important;align-items:center;justify-content:center;min-height:44px;min-width:44px;font-size:15px!important;padding:0 12px!important;border-radius:12px}
  #topbar>#mMore{margin-left:auto}
  #placesBar{top:58px!important}
  #minimap{width:96px!important;height:auto!important;right:6px!important;bottom:6px!important}
  #zoomer{right:6px!important;left:auto!important;bottom:auto!important;top:50%;transform:translateY(-50%);flex-direction:column;gap:2px;padding:4px 2px;border-radius:14px}
  #zoomer button{width:40px;height:40px;font-size:22px;border-radius:10px}
  #zoomer [data-z=in]{order:0}#zoomer input{order:1;display:block;writing-mode:vertical-lr;direction:rtl;width:28px;height:110px;margin:4px 0;accent-color:#2b5cff}#zoomer [data-z=out]{order:2}#zoomer .zp{order:3;min-width:0;font-size:11px;padding:2px 0 4px}
  .grow{display:none!important}
  #cline{display:none!important}
  #soundBtn,#sndMore,#lab-toggle,#rc-open{display:none!important}
  #advpanel,#dj,#reelpanel,#drawer,#trees,#settings,#ntfpanel,#conn,#team,#whisper,#objmenu,#sndpop{position:fixed!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;max-width:100%!important;max-height:72dvh!important;border-radius:16px 16px 0 0!important;box-sizing:border-box!important;z-index:10001!important;margin:0!important}
  #herd,#studio,#lab{position:fixed!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;max-width:100%!important;height:78dvh!important;border-radius:16px 16px 0 0!important;box-sizing:border-box!important;z-index:10001!important;transform:translateY(105%)!important;transition:transform .22s!important;border:0!important}
  #herd.on,#studio.on,#lab.open{transform:none!important}
  #almanac{padding:0!important;align-items:flex-end!important}#almanac .bx{border-radius:16px 16px 0 0!important;max-height:88dvh;overflow:auto}
  #ntf{left:8px!important;right:8px;max-width:none!important;bottom:112px}
  #roomchat{left:0!important;right:0!important;width:auto!important;max-width:none!important}
  #mSheet{position:fixed;left:0;right:0;bottom:0;z-index:10002;background:var(--floor,#fff);color:var(--ink,#222);border-radius:16px 16px 0 0;box-shadow:0 -8px 30px #0006;padding:10px 12px calc(14px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .22s;font:13px system-ui}
  #mSheet.on{transform:none}
  #mSheet .mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}#mSheet .mh small{opacity:.65}
  #mSheet .mg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  #mSheet .mg button{min-height:64px;border:1px solid #8886;border-radius:12px;background:transparent;color:inherit;font:12px system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 4px}
  #mSheet .mg button b{font-size:20px;font-weight:400;line-height:1}
  #mSheet .mx{min-height:44px;min-width:44px;border:0;background:none;color:inherit;font-size:18px}
  #mSheet .mnote{font:12px/1.4 system-ui;opacity:.75;margin:10px 2px 0}#mSheet .mnote a,#mSheet .mlink{color:inherit}#mSheet .mlink{border:0;background:none;padding:0;font:inherit;text-decoration:underline;min-height:0}
  .mgrab{display:block;width:40px;height:5px;border-radius:3px;background:#8888;margin:0 auto 8px}
}`;
  document.head.appendChild(css);

  // ---------- ☰ more: every top-bar button that isn't kept on the bar, plus the chats and sound
  const LABELS = { labBtn: ['🧪', 'data lab'], connBtn: ['🌐', 'connect'], snapBtn: ['📸', 'snapshot'], evolveWorldBtn: ['🌦', 'evolve'], reelsBtn: ['🎞', 'reels'], pediaBtn: ['📖', 'pedia'],
    djBtn: ['🎧', 'music'], advBtn: ['📊', 'advisor'], drawerBtn: ['🗄', 'drawer'], treesBtn: ['🌳', 'family trees'], almanacBtn: ['🌊', 'almanac'], keepDetail: ['🏰', 'detail'],
    'rc-open': [(window.IDLE_NAMES || {}).irc ? IDLE_NAMES.irc.icon : '💬', (window.IDLE_NAMES || {}).irc ? IDLE_NAMES.irc.short : 'IRC'], settingsBtn: ['⚙', 'settings'], 'lab-toggle': [(window.IDLE_NAMES || {}).op ? IDLE_NAMES.op.icon : '📟', (window.IDLE_NAMES || {}).op ? IDLE_NAMES.op.short : 'Operator'], soundBtn: ['🔊', 'sound'], sndMore: ['🎚', 'volume'] };
  const KEEP = ['herdBtn', 'ntfBtn', 'studioBtn', 'mMore'];
  let sheet = null, more = null;
  function mount() {
    const bar = $('#topbar'); if (!bar || more) return;
    more = document.createElement('button'); more.id = 'mMore'; more.textContent = '☰'; more.title = 'everything else'; bar.appendChild(more);
    sheet = document.createElement('div'); sheet.id = 'mSheet'; document.body.appendChild(sheet);
    more.addEventListener('click', e => { e.stopPropagation(); toggleMore(); });
    sheet.addEventListener('click', e => { if (e.target.closest('.mx')) return toggleMore(false); const b = e.target.closest('[data-for]'); if (!b) return; toggleMore(false); const t = document.getElementById(b.dataset.for); if (t) setTimeout(() => t.click(), 60); });
    swipeClose(sheet, () => toggleMore(false));
  }
  function toggleMore(on) { if (!sheet) return; on = on ?? !sheet.classList.contains('on'); if (on) { closeAllBut(null); render(); } sheet.classList.toggle('on', on); }
  function render() {
    const ids = [...$('#topbar').children].filter(el => el.tagName === 'BUTTON' && el.id && !KEEP.includes(el.id)).map(el => el.id);
    if ($('#keepDetail') && !$('#arena.keep')) ids.splice(ids.indexOf('keepDetail'), 1);
    for (const extra of ['lab-toggle', 'rc-open', 'soundBtn', 'sndMore']) if (document.getElementById(extra)) ids.push(extra);
    const wx = ($('#weatherLabel') || {}).textContent || '', fps = ($('#fps') || {}).textContent || '';
    sheet.innerHTML = `<span class="mgrab"></span><div class="mh"><b>Id|le</b><small>${esc(wx)}${wx && fps ? ' · ' : ''}${esc(fps)}</small><button class="mx" title="close">✕</button></div><div class="mg">` +
      ids.map(id => { const el = document.getElementById(id), L = LABELS[id] || [el.textContent.trim().slice(0, 2), (el.title || id).split(':')[0].slice(0, 16)];
        const icon = id === 'soundBtn' ? el.textContent.trim() : L[0]; return `<button data-for="${id}"><b>${icon}</b>${esc(L[1])}</button>`; }).join('') + '</div>' + (window.__settings && window.__settings.noticeLine() ? `<p class="mnote">${esc(window.__settings.noticeLine())} <a href="privacy.html" target="_blank" rel="noopener">privacy</a> · <button data-for="settingsBtn" class="mlink">⚙ settings</button></p>` : '') +
      (window.IDLE_REPO ? `<p class="mnote">open source · <a href="${window.IDLE_REPO}" target="_blank" rel="noopener">code on GitHub</a></p>` : '');
    if (sheet.querySelector('.mnote')) window.__settings.markNotice();   // the stats notice is shown once: here or as a pill
  }
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- one sheet at a time
  const SHEETS = ['#sndpop', '#advpanel', '#dj', '#reelpanel', '#drawer', '#trees', '#settings', '#ntfpanel', '#conn', '#team', '#whisper', '#herd', '#studio', '#lab', '#almanac', '#objmenu'];
  const CLOSE = '[data-a=close],[data-x=close],[data-s=close],[data-h=close],[data-d=close],[data-close],#lab-close,#connClose,#teamClose,.cx,button[title^="close"],.x';
  const isOpen = el => { if (!el || !el.isConnected) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight - 24; };
  function closeSheet(el) { if (el.id === 'whisper') { const b = el.querySelector('.cx'); if (b) b.click(); else el.style.display = 'none'; return; }
    if (el.id === 'lab') { const b = $('#lab-close'); if (b) b.click(); return; }
    const b = [...el.querySelectorAll(CLOSE)].find(x => !x.closest('.np')); if (b) { b.click(); return; }
    el.classList.remove('on', 'open'); }
  const openedAt = new Map();
  function closeAllBut(keep) { for (const s of SHEETS) { const el = $(s); if (el && el !== keep && isOpen(el)) closeSheet(el); } }
  setInterval(() => { if (!phone()) return; const now = performance.now(), open = [];
    for (const s of SHEETS) { const el = $(s); if (isOpen(el)) { if (!openedAt.has(el)) openedAt.set(el, now); open.push(el); if (!el._mSwipe) { el._mSwipe = 1; swipeClose(el, () => closeSheet(el)); } } else openedAt.delete(el); }
    if (open.length > 1) { open.sort((a, b) => openedAt.get(b) - openedAt.get(a)); open.slice(1).forEach(closeSheet); }
    if (open.length && sheet && sheet.classList.contains('on')) toggleMore(false); }, 250);

  // swipe down from the top of a sheet (or anywhere while it is scrolled to the top) closes it
  function swipeClose(el, done) { let y0 = null, dy = 0;
    el.addEventListener('touchstart', e => { if (!phone() || e.touches.length !== 1) return; const t = e.target; if (t.closest('input,textarea,select,canvas,[contenteditable]')) return; if (el.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
    el.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { el.style.translate = `0 ${dy}px`; } }, { passive: true });
    el.addEventListener('touchend', () => { if (y0 == null) return; el.style.translate = ''; if (dy > 90) done(); y0 = null; dy = 0; }); }

  // ---------- long press = right-click (keep a copy, inspect, the object menu)
  let lp = null, swallow = 0;
  addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const t = e.target; if (!t.closest || !t.closest('#arena') || t.closest('#topbar,#mSheet,#ntf,#whisper,#herd,#studio,#lab')) return;
    const x = e.clientX, y = e.clientY; clearTimeout(lp && lp.t); lp = { x, y, t: setTimeout(() => { lp = null; swallow = performance.now() + 700;
      const el = document.elementFromPoint(x, y) || t; el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {} }, 550) }; }, true);
  addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } }, true);
  const lpEnd = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  addEventListener('pointerup', lpEnd, true); addEventListener('pointercancel', lpEnd, true);
  addEventListener('click', e => { if (performance.now() < swallow) { e.stopPropagation(); e.preventDefault(); swallow = 0; } }, true);
  // iOS shows its own callout/magnifier on long press: not over the world
  const css2 = document.createElement('style'); css2.textContent = '@media (max-width:500px){#arena,#arena *{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}#arena input,#arena textarea,#arena [contenteditable]{-webkit-user-select:text;user-select:text}}'; document.head.appendChild(css2);

  const tryMount = () => { mount(); if (!more) setTimeout(tryMount, 300); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', tryMount); else tryMount();
  window.__mobile = { phone, toggleMore, closeAllBut, isOpen: s => isOpen($(s)) };
})();
