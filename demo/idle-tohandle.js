// idle-tohandle.js: never stuck (Nico, Nov 2: in ?story he closed every guided widget and was left in the void around a black hole, with
// nothing bringing the menus back). The Tiny Operator is always somewhere on screen: when its window is closed it waits in a corner as a
// small creature (#toHandle). Tapping it opens the Operator again and brings back every menu the guided start had hidden (gen-calm).
// A watchdog keeps it there: whatever is closed or hidden, the creature is visible whenever the window is not.
(() => {
  const $ = s => document.querySelector(s);
  const css = document.createElement('style');
  css.textContent = `#toHandle{position:fixed;right:12px;bottom:12px;z-index:2147482002;width:46px;height:40px;border:0;padding:0;background:none;cursor:pointer;filter:drop-shadow(0 0 6px #7ee3f588);transition:opacity .4s,transform .2s}
#toHandle:hover{transform:scale(1.12)}#toHandle[hidden]{display:block!important;opacity:0;pointer-events:none}#toHandle svg{width:100%;height:100%;overflow:visible}
#toHandle .leg{stroke:#7ee3f5;stroke-width:1.6;stroke-linecap:round;animation:toLeg 1.6s ease-in-out infinite;transform-origin:23px 26px}#toHandle .leg:nth-child(2n){animation-delay:-.8s}
#toHandle .eye{animation:toBlink 4.2s infinite;transform-origin:center;transform-box:fill-box}#toHandle .tip{position:absolute;right:52px;bottom:8px;white-space:nowrap;font:600 11px system-ui;color:#cfe9f0;background:#0b0f18e6;border:1px solid #2b6f86;border-radius:10px;padding:3px 8px;opacity:0;pointer-events:none;transition:opacity .3s}
#toHandle:hover .tip,#toHandle.hint .tip{opacity:1}
@keyframes toLeg{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}@keyframes toBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@media (prefers-reduced-motion: reduce){#toHandle .leg,#toHandle .eye{animation:none}}`;
  document.head.appendChild(css);
  const b = document.createElement('button'); b.id = 'toHandle'; b.type = 'button'; b.setAttribute('aria-label', 'open the Operator (the Tiny Operator)'); b.hidden = true;
  b.innerHTML = `<svg viewBox="0 0 46 40" aria-hidden="true"><g>${[[10, 30, 3, 37], [14, 32, 10, 39], [32, 32, 36, 39], [36, 30, 43, 37]].map(([x1, y1, x2, y2]) => `<line class="leg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('')}</g>
<ellipse cx="23" cy="22" rx="16" ry="12" fill="#0b1220" stroke="#7ee3f5" stroke-width="1.6"/><ellipse class="eye" cx="17" cy="20" rx="2.6" ry="3.2" fill="#e8fbff"/><ellipse class="eye" cx="29" cy="20" rx="2.6" ry="3.2" fill="#e8fbff"/>
<path d="M18 27 q5 3 10 0" stroke="#7ee3f5" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg><span class="tip">Operator</span>`;
  const add = () => { if (!b.isConnected) document.body.appendChild(b); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add, { once: true });
  const visible = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.3 && s.pointerEvents !== 'none' && r.width > 0 && r.height > 0; };
  const labOpen = () => { const l = $('#lab'); return !!(l && l.classList.contains('open')); };
  function place() { add(); const open = labOpen(); b.hidden = open; if (open) return;
    // sit just above the Operator's own button when it is there, otherwise in the corner
    const t = $('#lab-toggle'); if (visible(t)) { const r = t.getBoundingClientRect(); b.style.bottom = Math.max(12, innerHeight - r.top + 6) + 'px'; } else b.style.bottom = '12px'; }
  // tapping it: the Operator's window, and every menu the guided start had hidden
  function out() { document.documentElement.classList.remove('gen-calm'); if (!labOpen()) { const t = $('#lab-toggle'); if (t) t.click(); }
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'to_handle' } })); } catch (e) {} place(); }
  b.addEventListener('click', e => { e.stopPropagation(); out(); });
  setInterval(place, 600); addEventListener('load', place);
  window.__toHandle = { place, out, el: b };
})();
