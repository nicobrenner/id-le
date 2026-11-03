// idle-presence.js: "I'm here", for the creator's live view (/live, 11-03). While this tab is visible it tells /lab/here about every
// 20 s that it is open, and "bye" when it closes; the server keeps that in memory for a minute and never writes it down (helper/worker.js,
// "presence"). Only when anonymous stats are live (⚙; never on a local copy or in a ?fresh test) and the browser doesn't ask not to be
// tracked (Global Privacy Control, Do Not Track). Off on id-le.com until Nico's go (PRESENCE_ON_PROD).
// What one beat carries, all from fixed lists:
//   id      a random id made when this page loaded, kept in this tab's memory only (never stored; a reload makes a new one)
//   dev     phone, tablet or desktop
//   mode    the storyline, free play, a ready world, or the plain world; in the storyline its arm, epoch and step
//   p       which panels are open (music, studio, the Operator, a creature card, ⚙…), at most 3
//   cr      how many creatures the world has, as a bucket (0-12, 13-30, 31-60, 61-150, 151+)
//   t       seconds since the page opened
//   back    whether this browser had been here before (a yes/no, the same flag the stats use; not an ID)
// Never: words, messages, names, world content, keys. The server adds the country (Cloudflare's guess from the address; the address
// itself is not kept).
(() => {
  const PRESENCE_ON_PROD = false;   // the beat on id-le.com: switched on with Nico's go
  const H = location.hostname, prod = /^(www\.)?id-le\.com$/.test(H) || H === 'id-le.pages.dev';
  const EVERY = 20000, LOAD = performance.now();
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
  const ID = hex(8);   // memory only
  const quiet = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const on = () => !(prod && !PRESENCE_ON_PROD) && !quiet() && !!(window.__settings && window.__settings.statsLive());
  const dev = () => { const w = Math.min(screen.width, screen.height), coarse = matchMedia('(pointer: coarse)').matches;
    return matchMedia('(max-width: 500px)').matches || coarse && w < 600 ? 'phone' : coarse && w < 1100 ? 'tablet' : 'desktop'; };
  let back = 0; try { back = localStorage.getItem('idle.stats.seen') === '1' ? 1 : 0; } catch (e) {}   // read before idle-stats.js marks it
  const CR = n => n <= 12 ? '0-12' : n <= 30 ? '13-30' : n <= 60 ? '31-60' : n <= 150 ? '61-150' : '151+';
  const q = s => document.querySelector(s), shown = el => !!(el && el.offsetParent !== null && getComputedStyle(el).display !== 'none');
  const PANELS = [['operator', '#lab.open'], ['card', '#whisper'], ['creatures', '#herd.on'], ['studio', '#studio.on'], ['music', '#dj.on'], ['lab', '#team.on'], ['advisor', '#advpanel.on'],
    ['almanac', '#almanac.on'], ['drawer', '#drawer.on'], ['trees', '#trees.on'], ['reels', '#reelpanel.on'], ['settings', '#settings.on'], ['feedback', '#oracle'], ['oracle', '#oracleBox'], ['review', '#review']];
  const panels = () => { const out = [];
    for (const [k, sel] of PANELS) { const el = q(sel); if (el && (sel.includes('.') ? true : shown(el))) out.push(k); if (out.length >= 3) break; }
    const rc = q('#roomchat'); if (out.length < 3 && rc && !rc.classList.contains('closed') && !rc.classList.contains('min') && rc.offsetParent !== null) out.push('irc');
    return out; };
  // where a storyline player is: the intro, the dark, the steps of Genesis, then the epoch reached (and the end card)
  const story = () => { const G = window.__genesis; let S = null; try { S = G && G.state && G.state(); } catch (e) {}
    const arm = window.__funnel && window.__funnel.arm ? window.__funnel.arm() || 'none' : 'none';
    if (q('#idleIntro')) return { mode: 'story', arm, step: 'intro', ep: 0 };
    if (!S || !S.on) return { mode: 'world', arm };
    const mode = ['story', 'free', 'ready'].includes(S.mode) ? S.mode : 'world'; if (mode !== 'story') return { mode, arm };
    const st = S.steps || {}, ep = Number.isInteger(S.day) ? S.day : 0;
    const step = S.endOpen ? 'end' : S.days && S.days[0] ? (ep > 0 ? 'epoch' : 'genesis-done') : st.creatures ? 'life' : st.words ? 'words' : st.light ? 'lights' : 'dark';
    return { mode, arm, step, ep }; };
  const beat = (bye) => { if (!on()) return false;
    let body; if (bye) body = { v: 1, id: ID, bye: 1 };
    else { let n = 0; try { const cs = window.__arena && window.__arena.raw(); if (cs) n = cs.filter(c => !c.guest).length; } catch (e) {}
      body = { v: 1, id: ID, dev: dev(), ...story(), p: panels(), cr: CR(n), t: Math.round((performance.now() - LOAD) / 1000), back }; }
    const s = JSON.stringify(body);   // a beacon (like the stats): it needs no answer, and it still goes out while the page closes
    try { if (navigator.sendBeacon('/lab/here', new Blob([s], { type: 'application/json' }))) return true; } catch (e) {}
    try { fetch('/lab/here', { method: 'POST', body: s, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {}); return true; } catch (e) { return false; } };
  let timer = 0, gone = false;
  const start = () => { if (timer || document.hidden) return; gone = false; beat(false); timer = setInterval(() => beat(false), EVERY); };
  const stop = bye => { if (timer) { clearInterval(timer); timer = 0; } if (bye && !gone) { gone = true; beat(true); } };
  addEventListener('visibilitychange', () => document.hidden ? stop(true) : start());
  addEventListener('pagehide', () => stop(true));
  const go = () => setTimeout(start, 2500);   // after the page has settled (and ⚙ knows whether stats are on)
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  window.__presence = { on, beat: () => beat(false), bye: () => stop(true), state: () => ({ on: on(), running: !!timer }), _peek: () => ({ dev: dev(), ...story(), p: panels() }) };
})();
