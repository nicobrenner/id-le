// idle-notify.js: one place for every notice the game shows (issue #26). Pills stack at the bottom left, newest on top,
// at most three at once (the rest wait their turn); each kind has an icon and its own time on screen, hovering holds a pill,
// and the same message twice in a short while just counts up. Every pill also goes into the 🔔 history (the last 50, kept in
// this browser), so a notice that slipped by can be read again. Creature names become mentions (hover for the mini-card).
//   window.__notify({ kind, text | html, icon?, at?: {x, y}, actions?: [{ label, run, title? }], ttl?, key? })  -> { close }
//   kinds: gazette 📰 · reel 🎞 · system ⚙️ · music 🎧 · disaster 🌩 · lab 🧪 · advisor 📊 · world 🌍
// Buttons inside html keep working: data-go="x,y" flies there, data-play (reels) and data-act="name" (handlers registered
// with __notify.on(name, fn)) are handled by delegation, so they work in the history too.
(() => {
  const KINDS = { gazette: { icon: '📰', ttl: 12000 }, reel: { icon: '🎞', ttl: 14000 }, system: { icon: '⚙️', ttl: 7000 }, music: { icon: '🎧', ttl: 4000 },
    disaster: { icon: '🌩', ttl: 10000 }, lab: { icon: '🧪', ttl: 6500 }, advisor: { icon: '📊', ttl: 14000 }, world: { icon: '🌍', ttl: 6000 } };
  const MAX = 3, HKEY = 'idle.notify.hist', SEEN = 'idle.notify.seen', esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // lab chatter in the first seconds after a load ("your last session is back"…) goes to 🔔 only
  const now = () => Date.now(), acts = {}, born = Date.now(); let hist = [], seenT = 0, stack = null, bell = null, panel = null, uid = 0;
  try { hist = JSON.parse(localStorage.getItem(HKEY) || '[]'); seenT = +localStorage.getItem(SEEN) || 0; } catch (e) {}
  const saveHist = () => { try { localStorage.setItem(HKEY, JSON.stringify(hist.slice(-50))); } catch (e) {} };
  const css = document.createElement('style'); css.textContent = `
#ntf{position:fixed;left:16px;bottom:16px;z-index:9997;display:flex;flex-direction:column-reverse;gap:6px;pointer-events:none;max-width:min(440px,calc(100vw - 32px));transition:left .3s,bottom .3s}
#ntf .np{pointer-events:auto;display:flex;gap:7px;align-items:flex-start;background:var(--floor,#fff);color:var(--ink,#222);border:1px solid #8886;border-radius:12px;padding:7px 8px 7px 10px;font:12px/1.4 system-ui;box-shadow:0 6px 22px #0005;animation:ntfin .35s ease-out;overflow-wrap:anywhere}
#ntf .np.out{opacity:0;transform:translateY(30%);transition:opacity .35s,transform .35s}#ntf .np .ic{flex:none}#ntf .np .tx{flex:1;min-width:0}
#ntf .np.disaster{border-color:#e0703a}#ntf .np.advisor{border-color:#e5484d99}#ntf .np .n2{opacity:.6;font-size:11px;margin-left:4px}
#ntf .np .x,#ntfpanel .x{flex:none;cursor:pointer;opacity:.55;padding:0 2px;background:none;border:0;color:inherit;font:inherit}#ntf .np .x:hover{opacity:1}
#ntf button:not(.x),#ntfpanel button:not(.x){font:12px system-ui;margin-left:6px;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;cursor:pointer;padding:1px 7px}
#ntf .gz,#ntfpanel .gz{font:italic 600 11px Georgia,serif;opacity:.75;margin-right:4px}
@keyframes ntfin{from{opacity:0;transform:translateY(40%)}to{opacity:1;transform:none}}
#ntfBtn{position:relative}#ntfBtn .dot{position:absolute;right:-2px;top:-3px;min-width:14px;height:14px;border-radius:7px;background:#2b5cff;color:#fff;font:600 9px/14px system-ui;padding:0 3px;box-sizing:border-box}
#ntfpanel{position:fixed;left:16px;bottom:16px;z-index:9998;display:none;width:min(420px,calc(100vw - 32px));max-height:60vh;overflow:auto;background:var(--floor,#fff);color:var(--ink,#222);border:1px solid #8886;border-radius:12px;padding:0 10px 8px;box-shadow:0 8px 28px #0006;font:12px/1.4 system-ui;box-sizing:border-box}
#ntfpanel.on{display:block}#ntfpanel .hd{display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--floor,#fff);padding:8px 0 6px;border-bottom:1px solid #8883;margin-bottom:4px}
#ntfpanel .it{display:flex;gap:7px;padding:4px 0;border-bottom:1px solid #8882;overflow-wrap:anywhere}#ntfpanel .it small{opacity:.55;flex:none;width:44px}#ntfpanel .it.new{font-weight:500}#ntfpanel .sub{opacity:.6}
@media (prefers-reduced-motion: reduce){#ntf .np{animation:none}}`;
  document.head.appendChild(css);

  // creature names as mentions (the arena's hover mini-card and click-to-find work on any a.mn[data-n])
  function mentions(root) { if (window.__linkNames) { const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('a,button,.gz') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }), list = []; while (walk.nextNode()) list.push(walk.currentNode);
      for (const t of list) { const h = window.__linkNames(esc(t.data)); if (h.includes('class="mn"')) { const span = document.createElement('span'); span.innerHTML = h; t.replaceWith(...span.childNodes); } } return; }   // the arena's own linker (awake and resting names)
    const cs = (window.__arena && window.__arena.raw && window.__arena.raw()) || []; const names = [...new Set(cs.map(c => c.name).filter(n => n && n.length > 2))]; if (!names.length) return;
    const re = new RegExp('(^|[^\\w])(' + names.sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w])', 'g');
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('a,button,.gz') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }), list = [];
    while (walk.nextNode()) list.push(walk.currentNode);
    for (const t of list) { if (!re.test(t.data)) continue; re.lastIndex = 0; const span = document.createElement('span'); span.innerHTML = esc(t.data).replace(re, (m, pre, n) => `${pre}<a class="mn" data-n="${esc(n)}">${esc(n)}</a>`); t.replaceWith(...span.childNodes); } }

  function place() { if (!stack) return; let left = 16, bottom = 16; const rc = document.getElementById('roomchat');
    if (rc && !rc.classList.contains('closed') && rc.offsetParent) { const r = rc.getBoundingClientRect(); if (r.width && r.height) { if (innerWidth < 700 || innerHeight - r.top < innerHeight * 0.45 || r.right + 230 > innerWidth) bottom = innerHeight - r.top + 8; else left = r.right + 10; } }
    stack.style.left = left + 'px'; stack.style.bottom = bottom + 'px'; if (panel) { panel.style.left = left + 'px'; panel.style.bottom = bottom + 'px'; } }
  function ensure() { if (stack) return true; if (!document.body) return false; stack = document.createElement('div'); stack.id = 'ntf'; document.body.appendChild(stack);
    stack.addEventListener('click', onClick); setInterval(place, 1000); addEventListener('resize', place); place(); return true; }

  // Gazette items can go in your drawer (idle-collect.js registers the 'keepnote' action)
  const keepBtn = h => h && h.kind === 'gazette' && acts.keepnote ? ` <button data-act="keepnote" data-kt="${h.t}" title="keep this in your drawer">🗄</button>` : '';
  const live = [], queue = [], recent = new Map();
  function show(n) { const el = document.createElement('div'); el.className = 'np ' + n.kind; n.el = el; live.push(n);
    el.innerHTML = `<span class="ic">${n.icon}</span><span class="tx">${n.html}${n.at ? ` <button data-go="${Math.round(n.at.x)},${Math.round(n.at.y)}">go ›</button>` : ''}${keepBtn(n.h)}<span class="n2"></span></span><button class="x" title="dismiss">✕</button>`;
    (n.actions || []).forEach((a, i) => { const b = document.createElement('button'); b.textContent = a.label; if (a.title) b.title = a.title; b.dataset.ai = i; el.querySelector('.tx').insertBefore(b, el.querySelector('.n2')); });
    try { mentions(el.querySelector('.tx')); } catch (e) {}
    el.addEventListener('mouseenter', () => { el._hold = true; }); el.addEventListener('mouseleave', () => { el._hold = false; n.until = Math.max(n.until, now() + 2500); });
    n.until = now() + n.ttl; stack.appendChild(el); place(); }
  function close(n, how) { const i = live.indexOf(n); if (i < 0) { const q = queue.indexOf(n); if (q >= 0) queue.splice(q, 1); return; } live.splice(i, 1); n.h.read = n.h.read || how !== 'timeout';
    if (how !== 'timeout') { n.h.read = true; saveHist(); badge(); } if (how === 'dismiss' && n.onDismiss) try { n.onDismiss(); } catch (e) {} n.el.classList.add('out'); setTimeout(() => n.el.remove(), 380); setTimeout(pump, 200); }
  function pump() { while (live.length < MAX && queue.length) show(queue.shift()); }
  setInterval(() => { const t = now(); for (const n of live.slice()) if (n.ttl > 0 && !n.el._hold && t > n.until) close(n, 'timeout'); }, 500);

  function notify(o) { o = o || {}; const K = KINDS[o.kind] || KINDS.system, kind = KINDS[o.kind] ? o.kind : 'system'; const html = o.html != null ? String(o.html) : esc(o.text || '');
    const key = o.key || kind + ':' + html.replace(/<[^>]+>/g, '').replace(/\d+/g, '#');
    const r = recent.get(key); if (r && now() - r.t < (o.gap || 20000)) { r.t = now(); r.n.count = (r.n.count || 1) + 1; if (r.n.el) { r.n.el.querySelector('.n2').textContent = '×' + r.n.count; r.n.until = now() + r.n.ttl; } return { close: () => close(r.n) }; }
    const h = { t: now(), kind, icon: o.icon || K.icon, html, at: o.at || null }; hist.push(h); if (hist.length > 50) hist = hist.slice(-50); saveHist(); badge();
    const n = { kind, icon: h.icon, html, at: h.at, actions: o.actions, ttl: o.ttl ?? K.ttl, h, onDismiss: o.onDismiss }; recent.set(key, { t: now(), n }); if (recent.size > 200) recent.delete(recent.keys().next().value);
    if (kind === 'lab' && o.ttl !== 0 && now() - born < 8000) o.quiet = true;
    if (o.quiet || !ensure()) return { close: () => {} }; if (live.length < MAX) show(n); else { queue.push(n); if (queue.length > 6) { const i = queue.findIndex(q => ['lab', 'music', 'system', 'world'].includes(q.kind) && q.ttl > 0); queue.splice(i >= 0 ? i : 0, 1); } } if (panel && panel.classList.contains('on')) renderPanel(); return { close: () => close(n, 'code') }; }

  function fly(x, y) { if (window.__notifyFly) window.__notifyFly(x, y); else if (window.__advHooks && window.__advHooks.flyTo) window.__advHooks.flyTo(x, y, 1.3); }
  function onClick(e) { const pill = e.target.closest('.np, .it'); const n = pill && live.find(q => q.el === pill);
    if (e.target.closest('.x')) { if (n) close(n, 'dismiss'); return; }
    const g = e.target.closest('[data-go]'); if (g) { const [x, y] = g.dataset.go.split(',').map(Number); fly(x, y); if (n) close(n, 'act'); return; }
    const a = e.target.closest('[data-act]'); if (a && acts[a.dataset.act]) { acts[a.dataset.act](a.dataset, e); if (n) close(n, 'act'); return; }
    const ai = e.target.closest('[data-ai]'); if (ai && n && n.actions && n.actions[+ai.dataset.ai]) { try { n.actions[+ai.dataset.ai].run(); } catch (er) {} close(n, 'act'); return; }
    if (e.target.closest('[data-play]') && n) setTimeout(() => close(n, 'act'), 0); }

  // the 🔔 history
  const unseen = () => hist.filter(h => h.t > seenT && !h.read).length;
  function badge() { if (!bell) return; const k = unseen(); let d = bell.querySelector('.dot'); if (!k) { if (d) d.remove(); return; } if (!d) { d = document.createElement('span'); d.className = 'dot'; bell.appendChild(d); } d.textContent = k > 9 ? '9+' : k; }
  const ago = t => { const s = (now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  function renderPanel() { const items = hist.slice().reverse();
    panel.innerHTML = `<div class="hd"><b>🔔 notices</b><span><button data-clear="1" title="empty the history">clear</button><button class="x" data-close="1" title="close">✕</button></span></div>` +
      (items.map(h => `<div class="it${h.t > seenT ? ' new' : ''}"><small>${ago(h.t)}</small><span>${h.icon}</span><span>${h.html.replace(/<button data-act="advisor-open"[^>]*>[^<]*<\/button>/, '')}${h.at ? ` <button data-go="${Math.round(h.at.x)},${Math.round(h.at.y)}">go ›</button>` : ''}${keepBtn(h)}</span></div>`).join('') || '<div class="sub" style="padding:6px 0">nothing yet: notices land here as they happen</div>');
    try { mentions(panel); } catch (e) {} }
  function toggle(on) { if (!panel) return; on = on ?? !panel.classList.contains('on'); panel.classList.toggle('on', on); if (on) { place(); renderPanel(); seenT = now(); hist.forEach(h => h.read = true); saveHist(); try { localStorage.setItem(SEEN, String(seenT)); } catch (e) {} badge(); } }
  function mount() { if (bell || !document.body) return; const anchor = document.getElementById('advBtn') || document.getElementById('djBtn') || document.getElementById('reelsBtn'); if (!anchor) return;
    ensure(); bell = document.createElement('button'); bell.id = 'ntfBtn'; bell.title = 'notices: everything that popped up, to read again'; bell.textContent = '🔔'; anchor.after(bell, ' '); bell.addEventListener('click', () => toggle());
    panel = document.createElement('div'); panel.id = 'ntfpanel'; document.body.appendChild(panel);
    panel.addEventListener('click', e => { if (e.target.closest('[data-close]')) return toggle(false); if (e.target.closest('[data-clear]')) { hist = []; saveHist(); renderPanel(); badge(); return; }
      const g = e.target.closest('[data-go]'); if (g) { const [x, y] = g.dataset.go.split(',').map(Number); fly(x, y); return; } const a = e.target.closest('[data-act]'); if (a && acts[a.dataset.act]) acts[a.dataset.act](a.dataset, e); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('on')) toggle(false); }); badge(); }
  const tryMount = () => { mount(); if (!bell) setTimeout(tryMount, 500); };
  if (document.readyState === 'complete') tryMount(); else addEventListener('load', tryMount);

  notify.on = (name, fn) => { acts[name] = fn; }; notify.history = () => hist.slice(); notify.live = () => live.length; notify.queued = () => queue.length; notify.toggle = toggle;
  window.__notify = notify;
})();
