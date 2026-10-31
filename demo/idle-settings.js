// idle-settings.js: ⚙ settings (#34). Two switches, kept in this browser (localStorage 'idle.settings'):
//   public helper  - on the public site, id-le.com reads public web pages for the creatures (Crawlers, travel) and links
//                    worlds; off means those features explain they're off (idle-runtime.js checks it on every call)
//   anonymous stats - a few counts about how new players get on (idle-stats.js); never on a local server or in ?fresh
// plus the privacy page, and a one-time notice about the stats once the guided start has the floor no more.
// The window works like the others: a sticky header with ✕, drag it by the header, its place is remembered;
// on a phone it is a bottom sheet (idle-mobile.js).
(() => {
  const KEY = 'idle.settings', POS = 'idle.settingsPos', NOTICE = 'idle.statsNotice', $ = s => document.querySelector(s);
  const ld = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  let S = ld(); const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  let mode = 'server'; const pub = () => mode === 'static';
  const sandbox = () => /[?&]fresh\b/.test(location.search);
  const local = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]statstest\b/.test(location.search);
  const helperOn = () => S.helper !== false, statsOn = () => S.stats !== false;
  const statsLive = () => pub() && !sandbox() && !local() && statsOn();   // the only case anything is sent
  const css = document.createElement('style'); css.textContent = `
#settings{position:fixed;right:16px;top:56px;z-index:9996;display:none;width:min(380px,calc(100vw - 32px));max-height:76vh;overflow:auto;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:12px;padding:8px 10px 10px;box-shadow:0 8px 28px #0006;font:12px/1.45 system-ui;box-sizing:border-box}
#settings.on{display:block}#settings .hd{display:flex;justify-content:space-between;align-items:center;margin:-8px -10px 6px;padding:8px 10px 6px;position:sticky;top:-8px;z-index:2;background:var(--floor);border-bottom:1px solid #8883;cursor:grab;user-select:none;touch-action:none}#settings.drag .hd{cursor:grabbing}
#settings .hd b{font-size:13px}#settings button{font:inherit;font-size:12px;padding:2px 9px;border-radius:8px;border:1px solid #8886;background:none;color:inherit;cursor:pointer}
#settings .row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #8882}#settings .row .t{flex:1}#settings .row .t b{display:block;font-size:12.5px}#settings .row small{opacity:.7}
#settings .sw{flex:none;min-width:52px;min-height:30px;height:auto;line-height:1.2;padding:4px 10px;align-self:flex-start}@media (max-width:500px){#settings .sw{min-height:40px;min-width:60px;font-size:14px}#settings .hd button{min-height:40px;min-width:44px}}#settings .sw.on{background:#2b5cff;color:#fff;border-color:#2b5cff}#settings .sw[disabled]{opacity:.45;cursor:default}
#settings a{color:inherit}#settings .ft{padding-top:8px;opacity:.8}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'settings'; document.body.appendChild(el);
  const btn = document.createElement('button'); btn.id = 'settingsBtn'; btn.title = 'settings: the public helper, anonymous stats, privacy'; btn.textContent = '⚙';
  let open = false;
  const mountBtn = () => { if (btn.isConnected) return; const bar = $('#topbar'), more = $('#mMore'); if (!bar) return setTimeout(mountBtn, 300); if (more) more.before(btn, ' '); else bar.appendChild(btn); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mountBtn); else mountBtn();
  btn.addEventListener('click', () => toggle());
  function toggle(on) { open = on ?? !open; render(); }

  function render() {
    el.classList.toggle('on', open); btn.classList.toggle('on', open); if (!open) return;
    const sw = (k, on, dis) => `<button class="sw ${on ? 'on' : ''}" data-k="${k}"${dis ? ' disabled' : ''}>${on ? 'on' : 'off'}</button>`;
    const helperNote = pub() ? 'Lets your creatures read public web pages (Crawlers, travel mode) and lets worlds link up, through id-le.com. It fetches the page for you; nothing about what is fetched is logged. Off: those features say they are off.'
      : 'Not used here: this copy runs on your own server, which reads pages itself.';
    const statsNote = !pub() ? 'Off here: stats are only counted on the public site, never on a local copy.'
      : sandbox() ? 'Off in this test session (?fresh).'
      : 'A few anonymous counts to see how new players get on: how far into the first five minutes they get and how long it takes, phone or desktop, whether the game had to start in a lighter mode after a crash, a rough frame rate, which parts of the game get opened, and error messages. No cookies, nothing from your world or chats, no AI keys, no ID that follows you between visits.';
    el.innerHTML = `<div class="hd"><b>⚙ settings</b><button data-a="close" title="close">✕</button></div>
<div class="row"><div class="t"><b>Public helper</b><small>${helperNote}</small></div>${sw('helper', pub() ? helperOn() : false, !pub())}</div>
<div class="row"><div class="t"><b>Anonymous stats</b><small>${statsNote}</small></div>${sw('stats', pub() && !sandbox() ? statsOn() : false, !pub() || sandbox())}</div>
${window.__looks ? `<div class="row"><div class="t"><b>Highlight creatures</b><small>A ring around every creature, the camouflaged ones too, so you can find them in a busy world. Tip: hold H to see them for a moment, tap H to switch.</small></div>${sw('hilite', window.__looks.state().hilite)}</div>` : ''}
<div class="ft">Your worlds, your drawer and any AI keys stay in this browser. <a href="privacy.html" target="_blank" rel="noopener">Privacy: what Id|le keeps and sends ›</a></div>`;
  }
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'close') return toggle(false);
    const k = b.dataset.k; if (!k || b.disabled) return; if (k === 'hilite') { window.__looks.hilite(); render(); return; } S[k] = !(S[k] !== false); save(); render();
    if (k === 'helper' && window.__idle && window.__idle.swHelper) window.__idle.swHelper();
    if (window.__notify) window.__notify({ kind: 'system', text: k === 'helper' ? (helperOn() ? 'public helper on: creatures can read web pages again' : 'public helper off: no web pages are read for this browser') : (statsOn() ? 'anonymous stats on: thank you' : 'anonymous stats off: nothing more is sent from this browser') }); });
  // drag it by the header (not on phones, where it is a bottom sheet); its place is remembered and kept inside the window
  { const fit = (x, y) => [Math.max(0, Math.min(innerWidth - 120, x)), Math.max(0, Math.min(innerHeight - 40, y))];
    const placeAt = (x, y) => { [x, y] = fit(x, y); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.maxHeight = Math.max(180, Math.min(innerHeight * 0.76, innerHeight - y - 12)) + 'px'; };
    const phone = () => matchMedia('(max-width: 500px)').matches;
    try { const p = JSON.parse(localStorage.getItem(POS) || 'null'); if (p && !phone()) placeAt(p.x, p.y); } catch (e) {}
    el.addEventListener('pointerdown', e => { const hd = e.target.closest('.hd'); if (!hd || phone() || e.target.closest('button') || e.button) return; const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; el.classList.add('drag'); hd.setPointerCapture(e.pointerId); e.preventDefault();
      const mv = ev => placeAt(ev.clientX - dx, ev.clientY - dy), up = () => { el.classList.remove('drag'); hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); try { localStorage.setItem(POS, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch (er) {} };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up); }); }

  // the one-time notice about stats: on the public site only, once the guided start no longer has the floor
  const noticeSeen = () => { try { return localStorage.getItem(NOTICE) === '1'; } catch (e) { return true; } };
  const calm = () => { try { return !!(window.__first5 && window.__first5.calm && window.__first5.calm()); } catch (e) { return false; } };
  const NOTE = 'Id|le counts a few anonymous things (no cookies, nothing about you or your world) to see how new players get on.';
  function notice() { if (noticeSeen() || !statsLive() || !window.__notify) return false; if (calm()) return false;
    try { localStorage.setItem(NOTICE, '1'); } catch (e) {}
    window.__notify({ kind: 'system', html: `${NOTE} <button data-act="settings-open">⚙ settings</button> <a href="privacy.html" target="_blank" rel="noopener" style="color:inherit">privacy</a>`, ttl: 16000, key: 'stats-notice', loud: true }); return true; }
  if (window.__notify && window.__notify.on) window.__notify.on('settings-open', () => toggle(true));
  else addEventListener('load', () => { if (window.__notify && window.__notify.on) window.__notify.on('settings-open', () => toggle(true)); });
  (window.__idle ? window.__idle.mode() : Promise.resolve('server')).then(m => { mode = m; render();
    if (!pub()) return; const t0 = Date.now(), iv = setInterval(() => { if (noticeSeen() || !statsLive()) return clearInterval(iv); if (Date.now() - t0 > 20000 && notice()) clearInterval(iv); }, 3000); });

  window.__settings = { helperOn, statsOn, statsLive, open: () => toggle(true), close: () => toggle(false), noticeLine: () => (statsLive() && !noticeSeen()) ? NOTE : '', markNotice: () => { try { localStorage.setItem(NOTICE, '1'); } catch (e) {} } };
})();
