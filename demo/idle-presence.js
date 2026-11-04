// idle-presence.js: "I'm here", for the creator's live view (/live, 11-03). While this tab is visible it tells /lab/here about every
// 20 s that it is open, and "bye" when it closes; the server keeps that in memory for a minute and never writes it down (helper/worker.js,
// "presence"). Only when anonymous stats are live (⚙; never on a local copy or in a ?fresh test) and the browser doesn't ask not to be
// tracked (Global Privacy Control, Do Not Track). On id-le.com since Nico's go on 11-03 (PRESENCE_ON_PROD).
// What one beat carries, all from fixed lists:
//   id      a random id made when this page loaded, kept in this tab's memory only (never stored; a reload makes a new one)
//   dev     phone, tablet or desktop
//   mode    the storyline, the playground (from nothing: 'free'; a ready world: 'ready'), or the plain world; in the storyline its arm, epoch and step
//   p       which panels are open (music, studio, the Operator, a creature card, ⚙…), at most 3
//   cr      how many creatures the world has, as a bucket (0-12, 13-30, 31-60, 61-150, 151+)
//   t       seconds since the page opened
//   back    whether this browser had been here before (a yes/no, the same flag the stats use; not an ID)
//   page    which page: the game, the Id|le-pedia or the privacy page (the live view itself never beats)
//   ref     the site the link that brought you was on, by its name only (idle-ref.js, as the stats do: the hostname, lowercased, "www."
//           and the like dropped, at most 60 characters; never the path or the query), or "direct" when there was no link or it came
//           from our own pages
//   tag     the link's campaign tag (utm_source, or ?ref=), cleaned the way the stats clean utm_source: [a-z0-9-], at most 24 characters
// Never: words, messages, names, world content, keys. The server adds the country (Cloudflare's guess from the address; the address
// itself is not kept).
(() => {
  const PRESENCE_ON_PROD = true;   // the beat on id-le.com (Nico, 11-03: "'a go to switch the live view on for id-le.com.' go please")
  const H = location.hostname, prod = /^(www\.)?id-le\.com$/.test(H) || H === 'id-le.pages.dev';
  const PATH = location.pathname, PAGE = /^\/pedia(\.html)?$/.test(PATH) ? 'pedia' : /^\/privacy(\.html)?$/.test(PATH) ? 'privacy' : /^\/live(\.html)?$/.test(PATH) ? null : 'game';
  if (!PAGE) return;   // the live view doesn't count itself
  const EVERY = 20000, LOAD = performance.now();
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
  const ID = hex(8);   // memory only
  const quiet = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  // the game asks ⚙ (idle-settings.js); the pedia and the privacy page use the pedia's own rule for the same switch
  const statsLive = () => { if (window.__settings) return window.__settings.statsLive(); let st = true; try { st = (JSON.parse(localStorage.getItem('idle.settings') || '{}') || {}).stats !== false; } catch (e) {}
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(H) && !/[?&]statstest\b/.test(location.search); return st && !local && !/[?&]fresh\b/.test(location.search) && /^https?:$/.test(location.protocol); };
  const on = () => !(prod && !PRESENCE_ON_PROD) && !quiet() && statsLive();
  // where the visit came from, read once at load (the referrer and the address can change later in the page's life)
  const R = window.__idleRef, REF = (() => { try { const h = R ? R.host() : 'other'; return /^[a-z0-9][a-z0-9.-]{0,59}$/.test(h) ? h : 'other'; } catch (e) { return 'other'; } })();
  const TAG = (() => { try { const u = R && R.utm(); if (u) return u; const r = new URLSearchParams(location.search).get('ref'); const c = r && r.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24); return c || null; } catch (e) { return null; } })();
  const dev = () => { const w = Math.min(screen.width, screen.height), coarse = matchMedia('(pointer: coarse)').matches;
    return matchMedia('(max-width: 500px)').matches || coarse && w < 600 ? 'phone' : coarse && w < 1100 ? 'tablet' : 'desktop'; };
  let back = 0; try { back = localStorage.getItem('idle.stats.seen') === '1' || localStorage.getItem('idle.pedia.seen') === '1' ? 1 : 0; } catch (e) {}   // read before idle-stats.js (or the pedia) marks it
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
      body = PAGE === 'game' ? { v: 1, id: ID, page: PAGE, dev: dev(), ...story(), p: panels(), cr: CR(n), t: Math.round((performance.now() - LOAD) / 1000), back, ref: REF }
        : { v: 1, id: ID, page: PAGE, dev: dev(), mode: 'world', p: [], t: Math.round((performance.now() - LOAD) / 1000), back, ref: REF };
      if (TAG) body.tag = TAG; }
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
  window.__presence = { on, beat: () => beat(false), bye: () => stop(true), state: () => ({ on: on(), running: !!timer }), _peek: () => ({ page: PAGE, dev: dev(), ...story(), p: panels(), ref: REF, tag: TAG }) };
})();
