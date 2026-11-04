// idle-tohandle.js: never stuck (Nico, Nov 2: in ?story he closed every guided widget and was left in the void around a black hole, with
// nothing bringing the menus back). The Tiny Operator is always somewhere on screen: when its window is closed it waits in a corner as a
// small 📟 (#toHandle; it was a little creature until v10). Tapping it opens the Operator again and brings back every menu the guided start had hidden (gen-calm).
// A watchdog keeps it there: whatever is closed or hidden, the 📟 is visible whenever the window is not (except during the storyline's
// dark landing, a scripted scene with its own skip ›, where the Operator hasn't arrived yet).
(() => {
  const $ = s => document.querySelector(s);
  const css = document.createElement('style');
  // (v10, Nico: "I don't like the creature-like ghost, the operator is already a computer emoji"): the handle is the 📟 itself
  css.textContent = `#toHandle{position:fixed;right:12px;bottom:12px;z-index:2147482002;width:44px;height:44px;border:1px solid #6b7cff66;border-radius:12px;padding:0;background:#0a0b16e6;cursor:pointer;font-size:22px;line-height:42px;text-align:center;box-shadow:0 0 10px #6b7cff44;transition:opacity .4s,transform .2s}
#toHandle:hover{transform:scale(1.08)}#toHandle[hidden]{display:block!important;opacity:0;pointer-events:none}#toHandle .tip{position:absolute;right:52px;bottom:10px;white-space:nowrap;font:600 11px var(--ui-font,system-ui);color:#cfe9f0;background:#0b0f18e6;border:1px solid #2b6f86;border-radius:10px;padding:3px 8px;opacity:0;pointer-events:none;transition:opacity .3s;line-height:1.4}
#toHandle:hover .tip,#toHandle.hint .tip{opacity:1}#toHandle.glow{animation:toGlow 1.4s ease-in-out infinite}#toHandle.glow .tip{opacity:1}@keyframes toGlow{0%,100%{box-shadow:0 0 10px #6b7cff44}50%{box-shadow:0 0 0 6px #9fb0ff55,0 0 26px 6px #9fb0ffcc}}@media (prefers-reduced-motion:reduce){#toHandle.glow{animation:none;box-shadow:0 0 0 3px #9fb0ffaa,0 0 18px #9fb0ffaa}}html.gen-landing #toHandle{display:none!important}`;
  document.head.appendChild(css);
  const b = document.createElement('button'); b.id = 'toHandle'; b.type = 'button'; b.setAttribute('aria-label', 'open the Operator (the Tiny Operator)'); b.hidden = true;
  b.innerHTML = `<span aria-hidden="true">📟</span><span class="tip">Operator</span>`;
  const add = () => { if (!b.isConnected) document.body.appendChild(b); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add, { once: true });
  const visible = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.3 && s.pointerEvents !== 'none' && r.width > 0 && r.height > 0; };
  const labOpen = () => { const l = $('#lab'); return !!(l && l.classList.contains('open')); };
  function place() { add(); const open = labOpen() || !!document.getElementById('idleIntro'); b.hidden = open; if (open) return;   // (v14: not over the intro and its skip ›)
    // sit just above the Operator's own button when it is there, otherwise in the corner
    const t = $('#lab-toggle'); if (visible(t)) { const r = t.getBoundingClientRect(); b.style.bottom = Math.max(12, innerHeight - r.top + 6) + 'px'; } else b.style.bottom = '12px'; }
  // tapping it: the Operator's window, and every menu the guided start had hidden
  function out() { document.documentElement.classList.remove('gen-calm'); if (!labOpen()) { const t = $('#lab-toggle'); if (t) t.click(); }
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
  window.__toHandle = { place, out, el: b, glowing: () => b.classList.contains('glow'), glow: GLOW };
})();
