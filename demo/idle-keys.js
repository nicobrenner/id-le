// idle-keys.js: the storyline's keyframes (Nico, Nov 3: "it would be nice to have "markers" or "key frames" to go to either with # or &
// parameters in the url"). Staging and local copies only: on id-le.com this file does nothing at all.
//   ?story#dark  or  ?story&at=dark  (or just ?at=dark) jumps straight to that moment of the storyline and plays on from there, with sound.
//   #keys (or the ` key) shows a small strip with every keyframe as a link.
// A jump never touches the player's real world: the page runs on an in-memory localStorage (gone when the tab closes) and in the
// ?fresh test mode (nothing written to disk, no stats sent). A first key press (or tap) starts it, so the browser lets the sound play.
// Keyframes, in play order (idle-epoch0.js plays the intro ones from that second of the film; idle-genesis.js builds the state the
// later ones need: the lights on, the words laid, life, Genesis's Gazette, the Epoch 1 card, the end of what's built).
// Loaded first in arena.html's <head>, before anything reads localStorage.
(() => {
  const KEYS = [
    ['title', 'the title card'], ['computer', "Doc's messages"], ['labchat', 'labchat and Lester'], ['boot', 'the terminal boot'],
    ['run', 'the training run'], ['crash', 'the run that won\'t stop'], ['logo', 'Id|le, the cut'],
    ['dark', 'the dark landing'], ['operator', 'the Operator arrives'], ['lights', '"lights on"'],
    ['words', '"let there be words"'], ['life', '"let there be life"'], ['epoch0done', 'EPOCH 0 COMPLETE'], ['epoch1', 'the Epoch 1 card'],
    ['end', "the end of what's built"]];
  const names = KEYS.map(k => k[0]), h = location.hostname;
  const devHost = /^staging\./.test(h) || h === 'localhost' || h === '127.0.0.1';
  if (!devHost) return;
  const Q = new URLSearchParams(location.search), hash = decodeURIComponent((location.hash || '').slice(1)).toLowerCase();
  const key = names.includes((Q.get('at') || '').toLowerCase()) ? Q.get('at').toLowerCase() : names.includes(hash) ? hash : null;
  const idx = k => names.indexOf(k);
  let strip = hash === 'keys';

  // the film's sounds are scheduled from its second 0, which a keyframe (or __epoch0.play({ at })) puts in the past: events already over
  // are skipped (silent), sounds still going play on from now, and no time is ever negative (Web Audio throws on those). Installed once,
  // only by a keyframe page or a mid-film play; staging and local copies only.
  window.__audioPastShim = () => {
      if (window.__audioPastShim.on) return; window.__audioPastShim.on = true;
      try { const AP = AudioParam.prototype, clampT = t => (Number.isFinite(t) && t > 0 ? t : 0);
        for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues']) { const f = AP[m]; AP[m] = function (...a) { const i = m === 'cancelScheduledValues' ? 0 : 1; a[i] = clampT(a[i]); return f.apply(this, a); }; }
        { const f = AP.setTargetAtTime; AP.setTargetAtTime = function (v, t, c) { return f.call(this, v, clampT(t), c); }; }
        { const f = AP.setValueCurveAtTime; AP.setValueCurveAtTime = function (v, t, d) { return f.call(this, v, clampT(t), d); }; }
        const SN = AudioScheduledSourceNode.prototype, st = SN.start, sp = SN.stop;
        SN.start = function (when = 0, off, dur) { const now = this.context.currentTime; if (when < now - 0.05) { this.__late = now - when; when = now; if (this instanceof AudioBufferSourceNode) { off = (off || 0) + this.__late; if (this.buffer && !this.loop && off >= this.buffer.duration) { this.__over = true; off = 0; } } }
          const r = off === undefined ? st.call(this, when) : dur === undefined ? st.call(this, when, off) : st.call(this, when, off, dur); if (this.__over) try { this.disconnect(); } catch (e) {} return r; };
        SN.stop = function (when = 0) { const now = this.context.currentTime; if (this.__over || (this.__late && when < now)) { try { this.disconnect(); } catch (e) {} when = now; } return sp.call(this, Math.max(0, when)); };
      } catch (e) { console.warn('keys: audio', e); }
  };
  // the sandbox: an in-memory localStorage for this page only (the player's real one is never read or written)
  function sandbox() {
    const m = new Map(), api = {
      getItem: k => m.has(String(k)) ? m.get(String(k)) : null, setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: k => { m.delete(String(k)); },
      clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
    const mem = new Proxy(api, { get: (t, p) => p in t ? t[p] : (typeof p === 'string' && m.has(p) ? m.get(p) : undefined), has: (t, p) => p in t || m.has(String(p)),
      ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, p) => m.has(String(p)) ? { value: m.get(String(p)), enumerable: true, configurable: true } : undefined });
    try { Object.defineProperty(window, 'localStorage', { value: mem, configurable: true }); } catch (e) { console.warn('keys: no sandbox', e); }
  }
  if (key) {
    sandbox();
    // the storyline and the test mode in the address (read by the game's modules as they load); the key stays in the hash
    try { const u = new URL(location.href); u.searchParams.set('story', ''); u.searchParams.set('fresh', ''); u.searchParams.delete('at');
      history.replaceState(null, '', u.pathname + u.search.replace(/=(?=&|$)/g, '') + '#' + key); } catch (e) {}
    window.__audioPastShim();
    let go; const ready = new Promise(r => go = r);
    window.__storyKey = { key, keys: names.slice(), idx: idx(key), is: k => k === key, after: k => idx(key) > idx(k), atOrAfter: k => idx(key) >= idx(k), ready, started: false };
    // the gate: one key press or tap, so the browser lets the sound play (the title card is its own gate)
    if (key === 'title') { window.__storyKey.started = true; go(); }
    else {
      const gate = () => { const el = document.createElement('div'); el.id = 'keyGate';
        el.innerHTML = `<div><small>keyframe</small><b>${KEYS[idx(key)][1]}</b><span>press any key to start</span></div>`;
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#000;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;color:#cfd6ff;font:14px var(--term-font,ui-monospace,Menlo,monospace)';
        document.body.appendChild(el);
        const s = document.createElement('style'); s.textContent = '#keyGate div{display:flex;flex-direction:column;gap:10px}#keyGate small{opacity:.55;letter-spacing:.2em;text-transform:uppercase}#keyGate b{font:600 22px var(--display-font,ui-monospace,Menlo,monospace);color:#fff}#keyGate span{opacity:.75;animation:kgBlink 1.4s steps(2) infinite}@keyframes kgBlink{50%{opacity:.25}}'; document.head.appendChild(s);
        const start = e => { if (e && e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.key === '`')) return; removeEventListener('keydown', start, true); el.removeEventListener('pointerdown', start);
          if (e) { e.preventDefault(); e.stopPropagation(); } try { window.__audio && window.__audio.resume && window.__audio.resume(); } catch (er) {}
          window.__storyKey.started = true; el.remove(); go(); };
        addEventListener('keydown', start, true); el.addEventListener('pointerdown', start); };
      if (document.body) gate(); else document.addEventListener('DOMContentLoaded', gate, { once: true }); }
  }

  // ?offer=a|b|c|old (Nov 4, Nico on staging: his browser's saved storyline, mid-Genesis, opened the Operator with "let there be life" and the
  // offer never came): the storyline offer is previewed in the same sandbox, on a fresh ready world (?fresh: nothing to disk, no stats), so
  // the browser's own state (a story in progress, a pending step, an arm) never gets in the way, and its real world is never touched
  else if (/^(a|b|c|old)$/.test(Q.get('offer') || '')) {
    sandbox(); window.__offerSandbox = true;
    try { const u = new URL(location.href); u.searchParams.set('fresh', ''); history.replaceState(null, '', u.pathname + u.search.replace(/=(?=&|$)/g, '') + u.hash); } catch (e) {}
  }

  // the strip: every keyframe as a link (#keys, or ` toggles it; never while typing)
  const css = '#keyStrip{position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483500;display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px 8px;border-radius:10px;background:#0a0b16f0;border:1px solid #6b7cff66;font:11px var(--term-font,ui-monospace,Menlo,monospace);color:#cfd6ff}' +
    '#keyStrip b{margin-right:4px;opacity:.7}#keyStrip a{color:#cfd6ff;text-decoration:none;padding:2px 7px;border-radius:8px;border:1px solid #6b7cff44}#keyStrip a:hover{background:#1a1f55}#keyStrip a.on{background:#3a46c8;border-color:#cfd6ff}#keyStrip .x{margin-left:auto;cursor:pointer;opacity:.6;background:none;border:0;color:inherit}';
  function render() { let el = document.getElementById('keyStrip'); if (!strip) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('nav'); el.id = 'keyStrip'; el.setAttribute('aria-label', 'storyline keyframes'); document.body.appendChild(el);
      const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
    el.innerHTML = '<b>keyframes</b>' + KEYS.map(([k, t]) => `<a href="arena.html?story&at=${k}" title="${t}" data-k="${k}" class="${k === key ? 'on' : ''}">${k}</a>`).join('') + '<button class="x" title="hide (`)">×</button>';
    el.querySelector('.x').onclick = () => { strip = false; render(); };
    // a link to another key reloads the page there (the hash alone wouldn't)
    el.querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); location.href = a.getAttribute('href'); })); }
  addEventListener('keydown', e => { if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return; const t = e.target; if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return; strip = !strip; render(); });
  addEventListener('hashchange', () => { if (location.hash === '#keys') { strip = true; render(); } });
  if (strip) { if (document.body) render(); else document.addEventListener('DOMContentLoaded', render, { once: true }); }
  window.__keys = { list: () => KEYS.map(k => ({ key: k[0], label: k[1], url: 'arena.html?story&at=' + k[0] })), key, show: on => { strip = on !== false; render(); } };
})();
