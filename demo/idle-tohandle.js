// idle-tohandle.js: never stuck (Nico, Nov 2: in ?story he closed every guided widget and was left in the void around a black hole, with
// nothing bringing the menus back). The Tiny Operator is always somewhere on screen: when its window is closed it waits in a corner as a
// small 📟 (#toHandle; it was a little creature until v10). Tapping it opens the Operator again and brings back every menu the guided start had hidden (gen-calm).
// A watchdog keeps it there: whatever is closed or hidden, the 📟 is visible whenever the window is not (except during the storyline's
// dark landing, a scripted scene with its own skip ›, where the Operator hasn't arrived yet).
(() => {
  const $ = s => document.querySelector(s);
  const css = document.createElement('style');
  // (v10, Nico: "I don't like the creature-like ghost, the operator is already a computer emoji"): the handle is the 📟 itself
  css.textContent = `#toHandle{position:fixed;left:10px;top:8px;z-index:2147482002;width:44px;height:44px;border:1px solid #6b7cff66;border-radius:12px;padding:0;background:#0a0b16e6;cursor:pointer;font-size:22px;line-height:42px;text-align:center;box-shadow:0 0 10px #6b7cff44;transition:opacity .4s,transform .2s}
#toHandle:hover{transform:scale(1.08)}#toHandle[hidden]{display:block!important;opacity:0;pointer-events:none}#toHandle .tip{position:absolute;right:52px;bottom:10px;white-space:nowrap;font:600 11px var(--ui-font,system-ui);color:#cfe9f0;background:#0b0f18e6;border:1px solid #2b6f86;border-radius:10px;padding:3px 8px;opacity:0;pointer-events:none;transition:opacity .3s;line-height:1.4}
#toHandle:hover .tip,#toHandle.hint .tip{opacity:1}#toHandle.glow{animation:toGlow 1.4s ease-in-out infinite}#toHandle.glow .tip{opacity:1}@keyframes toGlow{0%,100%{box-shadow:0 0 10px #6b7cff44}50%{box-shadow:0 0 0 6px #9fb0ff55,0 0 26px 6px #9fb0ffcc}}@media (prefers-reduced-motion:reduce){#toHandle.glow{animation:none;box-shadow:0 0 0 3px #9fb0ffaa,0 0 18px #9fb0ffaa}}html.gen-landing #toHandle{display:none!important}`;
  css.textContent += `#toHandle{width:38px;height:36px;line-height:34px;font-size:19px;border-radius:10px}#toHandle.on{background:#2a3180;border-color:#cfd6ff}
#toHandle .tip{right:auto!important;left:0!important;bottom:auto!important;top:42px!important}
#toHandle.inbar{position:relative!important;left:auto!important;top:auto!important;z-index:auto;vertical-align:middle;margin-left:4px;width:34px;height:28px;line-height:26px;font-size:16px;border-radius:8px;box-shadow:none}
@media (max-width:500px){#topbar>#toHandle{display:inline-flex!important;align-items:center;justify-content:center;min-height:44px;min-width:44px;font-size:18px;border-radius:12px;margin-left:auto}#topbar>#toHandle+#mMore{margin-left:0!important}}
#toHandle .bd{position:absolute;right:-6px;top:-6px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:#e0367a;color:#fff;font:700 11px/18px var(--ui-font,system-ui);text-align:center;box-shadow:0 0 0 2px #0a0b16;pointer-events:none}`;
  document.head.appendChild(css);
  const b = document.createElement('button'); b.id = 'toHandle'; b.type = 'button'; b.setAttribute('aria-label', 'open the Operator (the Tiny Operator)'); b.hidden = true;
  b.innerHTML = `<span aria-hidden="true">📟</span><span class="tip">Operator</span>`;
  const add = () => { if (!b.isConnected) document.body.appendChild(b); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add, { once: true });
  const visible = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.3 && s.pointerEvents !== 'none' && r.width > 0 && r.height > 0; };
  const labOpen = () => { const l = $('#lab'); return !!(l && l.classList.contains('open')); };
  // v15 put the 📟 at the top; v16 (Nico, Nov 4: "Why is the operator floating on the top left? I thought it was going to float to the right
  // of the settings icon"): it is a button IN the top bar, right after ⚙ (on phones, where ⚙ lives in ☰'s sheet: right before ☰). When the
  // bar is hidden (the guided start's calm, the landing), it stays reachable as a fixed button where it last sat in the bar. The window opens
  // anchored just below it, right-aligned under it (--op-top / --op-left, read by idle-opwin.js and idle-mobile.js).
  // A small badge counts the epoch's pending tasks in the storyline (window.__genesis.pending()), like a messaging app.
  const genWin = () => /\bgen-(box|float)\b/.test(document.documentElement.className);
  let last = null;   // where the 📟 last sat in the bar (viewport rect), for the fixed fallback
  let lastAnchor = '';
  function place() { add(); const intro = !!document.getElementById('idleIntro'); b.hidden = intro; if (intro) return;   // (v14: not over the intro and its skip ›)
    const bar = $('#topbar'), set = $('#settingsBtn'), more = $('#mMore'), slot = $('#toSlot'); if (slot) slot.remove();
    const barOn = visible(bar), after = visible(set) ? set : null, before = !after && visible(more) ? more : null;
    if (barOn && (after || before)) {
      if (after && b.previousElementSibling !== after) after.after(b); else if (before && b.nextElementSibling !== before) before.before(b);
      b.classList.add('inbar'); b.style.left = b.style.top = b.style.right = b.style.bottom = '';
      const r = b.getBoundingClientRect(); if (r.width) last = { l: r.left, t: r.top, w: r.width, h: r.height };
    } else {
      if (b.parentElement !== document.body) document.body.appendChild(b);
      b.classList.remove('inbar'); const L = last ? last.l : Math.max(6, innerWidth - 50), T = last ? last.t : 8;
      b.style.left = Math.round(L) + 'px'; b.style.top = Math.round(T) + 'px'; b.style.right = 'auto'; b.style.bottom = 'auto';
    }
    const r = b.getBoundingClientRect(), lab = $('#lab'), w = (lab && lab.offsetWidth) || 380;
    const R = document.documentElement.style; R.setProperty('--op-top', Math.round(r.bottom + 8) + 'px');
    R.setProperty('--op-left', Math.round(Math.max(8, Math.min(r.right - w, innerWidth - w - 8))) + 'px');
    b.classList.toggle('on', labOpen()); { const k = R.getPropertyValue('--op-top') + R.getPropertyValue('--op-left'); if (k !== lastAnchor) { lastAnchor = k; if (!labOpen()) { try { window.__opwinPlace && window.__opwinPlace(); } catch (e) {} } } }
    let n = 0; try { n = window.__genesis && window.__genesis.pending ? +window.__genesis.pending() || 0 : 0; } catch (e) {}
    let d = b.querySelector('.bd'); if (n > 0) { if (!d) { d = document.createElement('span'); d.className = 'bd'; b.appendChild(d); } if (d.textContent !== String(n)) d.textContent = n; b.setAttribute('aria-label', `the Operator: ${n} task${n > 1 ? 's' : ''} left in this epoch`); }
    else if (d) { d.remove(); b.setAttribute('aria-label', 'open the Operator (the Tiny Operator)'); } }
  // tapping it: the Operator's window (or closing it again: it is the window's toggle), and every menu the guided start had hidden.
  // During the storyline's Genesis window it only opens (the guided part can't be closed)
  function out() { document.documentElement.classList.remove('gen-calm'); const t = $('#lab-toggle'); if (!labOpen()) { if (t) t.click(); } else if (!genWin()) { const c = $('#lab-close'); if (c) c.click(); else if (t) t.click(); }
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'to_handle' } })); } catch (e) {} place(); }
  b.addEventListener('click', e => { e.stopPropagation(); out(); });
  // after the player closes the Operator, the first few times (Nico: "after closing it, at least the first couple of times, make it glow
  // afterwards, so the user knows it's there"): the 📟 glows softly for ~6 s, or until hovered or clicked; counted in idle.opCloses (3 times)
  const GLOW = { times: 3, ms: 6000 }; let glowT = 0;
  const stopGlow = () => { clearTimeout(glowT); b.classList.remove('glow'); };
  document.addEventListener('click', e => { if (!(e.target.closest && e.target.closest('#lab-close'))) return; let n = 0; try { n = +localStorage.getItem('idle.opCloses') || 0; } catch (er) {}
    if (n >= GLOW.times) return; try { localStorage.setItem('idle.opCloses', String(n + 1)); } catch (er) {} setTimeout(() => { place(); b.classList.add('glow'); clearTimeout(glowT); glowT = setTimeout(stopGlow, GLOW.ms); }, 300); }, true);
  b.addEventListener('pointerenter', stopGlow); b.addEventListener('click', stopGlow);
  setInterval(place, 600); addEventListener('load', place);
  window.__toHandle = { place, out, el: b, badge: () => { const d = b.querySelector('.bd'); return d ? +d.textContent : 0; }, glowing: () => b.classList.contains('glow'), glow: GLOW };
})();
