// idle-stats.js: anonymous stats for the public site (#34). Only when all of these hold: the page runs without a local
// server (id-le.com), it isn't a ?fresh test or a localhost copy, and "anonymous stats" is on in ⚙ settings.
// What one page load may send, as small batches to /lab/stats on the same site (navigator.sendBeacon), never more:
//   visit         this page load happened (and whether this browser had been here before: a yes/no, not an ID)
//   device        phone or desktop; iOS yes/no; the crash guard's level (0 normal, 1 lighter, 2 no Oracle: how often it fires)
//   fps           a rough bucket of the frame rate (<20, 20-40, 40-55, 55+)
//   features      which parts got opened (advisor, music, drawer, reels…), once each
//   first five    the guided start's moments reached and how many seconds each took; finished or skipped
//   errors        an error's message (quoted text and long numbers blanked), file:line:col and the game version, at most 5
//   came from     the site name of the link that brought you (reddit.com, news.ycombinator.com…), never the full address;
//                 "direct" when there was none; plus a campaign tag (utm_source) if the link had one
//   time here     how long the page was on screen, as a bucket (<1, 1-5, 5-20, 20+ minutes); counted once per page load
//   stopped at    for a guided start still running: the last of its moments you reached when you left (or finished/skipped)
//   lab walk      the data lab walkthrough's steps reached (what, travel, kinds, team, review, stats, where), finished or ended; once per browser
//   engagement    when you leave: how many creatures the world has (a bucket: 0-12, 13-30, 31-60, 61-150, 151+), and as buckets
//                 (0, 1-5, 6-20, 21+) how many were born, charts made, buildings finished and words you fed during this page load;
//                 plus the seconds the page was on screen, added to a daily total (so the average is total ÷ page loads)
// Not sent: anything from the world (names, words, pictures), chats, AI keys, cookies, an ID that follows you.
// The server (helper/worker.js) only adds these to daily totals; it keeps no single visit and no address.
(() => {
  const SENT = 'idle.stats.sent', SEEN = 'idle.stats.seen';
  const live = () => !!(window.__settings && window.__settings.statsLive());
  const phone = () => matchMedia('(max-width: 500px)').matches || matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const FEAT = { advBtn: 'advisor', djBtn: 'music', reelsBtn: 'reels', drawerBtn: 'drawer', treesBtn: 'trees', almanacBtn: 'almanac', studioBtn: 'studio', herdBtn: 'creatures',
    ntfBtn: 'notices', pediaBtn: 'pedia', labBtn: 'datalab', connBtn: 'connect', snapBtn: 'snapshot', evolveWorldBtn: 'evolve', 'lab-toggle': 'chat', 'rc-open': 'roomchat',
    settingsBtn: 'settings', soundBtn: 'sound', mMore: 'more', collBtn: 'collection', addBtn: 'add' };
  const LOAD = Date.now();
  // where the visit came from: the referring site's name only (idle-ref.js, shared with the pedia)
  const R = window.__idleRef, refHost = () => R ? R.host() : 'other', utm = () => R ? R.utm() : null;
  // time on screen: visible time only (Page Visibility); the bucket a page load ends in is what counts
  let shown = 0, shownAt = document.hidden ? 0 : performance.now();
  addEventListener('visibilitychange', () => { if (document.hidden) { if (shownAt) shown += performance.now() - shownAt; shownAt = 0; } else shownAt = performance.now(); }, true);
  const DW = ['<1', '1-5', '5-20', '20+'];
  const dwell = () => { const ms = shown + (shownAt ? performance.now() - shownAt : 0), min = ms / 60000; return min < 1 ? '<1' : min < 5 ? '1-5' : min < 20 ? '5-20' : '20+'; };
  // where a guided start stopped: only for page loads that began with the trail still running
  let f5Live = null;
  const f5Stop = () => { try { const F = window.__first5, st = F && F.state && F.state(); if (!st) return null;
      if (f5Live === null) f5Live = !!(st.active || (st.finished && st.finished >= LOAD) || (st.skipped && st.skipped >= LOAD)); if (!f5Live) return null;
      if (st.finished) return 'finished'; if (st.skipped) return 'skipped';
      const last = Object.entries(st.done || {}).sort((a, b) => a[1] - b[1]).pop(); return last ? last[0] : 'none'; } catch (e) { return null; } };
  setTimeout(f5Stop, 8000);   // learn early whether this load began with the trail running (before it can finish)
  let returning = false; try { returning = localStorage.getItem(SEEN) === '1'; localStorage.setItem(SEEN, '1'); } catch (e) {}
  const feats = new Set(), errs = new Map(), fpsS = [];
  // engagement (counted once per page load, in the last bucket it reached, like time on screen)
  const ENG = { charts: 0, fed: 0 }, CR = n => n <= 12 ? '0-12' : n <= 30 ? '13-30' : n <= 60 ? '31-60' : n <= 150 ? '61-150' : '151+', NB = n => n <= 0 ? '0' : n <= 5 ? '1-5' : n <= 20 ? '6-20' : '21+';
  addEventListener('idle:ev', e => { const d = e.detail || {}; if (d.type === 'feed') ENG.fed++; else if (d.type === 'work' && d.extra && d.extra.job === 'math' && d.extra.chart && !d.extra.replot) ENG.charts++; });
  const engage = () => { const o = {}; try { const cs = window.__arena && window.__arena.raw(); if (cs) o.cr = CR(cs.filter(c => !c.guest).length); } catch (e) {}
    try { const B = window.__babies && window.__babies.births && window.__babies.births(); if (B) o.born = NB(B.filter(b => b.t >= LOAD).length); } catch (e) {}
    try { const S = window.__build && window.__build.state && window.__build.state(); if (S) o.built = NB(Object.values(S).reduce((n, q) => n + ((q && q.structs) || []).filter(x => x.done && x.done >= LOAD).length, 0)); } catch (e) {}
    o.charts = NB(ENG.charts); o.fed = NB(ENG.fed); return o; };
  let secSent = 0;   // visible seconds already added to the day's total
  let sent = { visit: false, feats: [], errs: [], fps: false, m: [], f5: '', dw: null, fl: null, eng: {} }; let ahaSent = {};
  try { ahaSent = JSON.parse(localStorage.getItem(SENT) || '{}') || {}; } catch (e) {}   // first-five moments already counted from this browser (so a reload doesn't count them twice)

  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button[id]'); if (b && FEAT[b.id]) feats.add(FEAT[b.id]); }, true);
  // a card, a rave, Gloamhold: looked at now and then rather than hooked into each module
  setInterval(() => { try { const w = document.getElementById('whisper'); if (w && w.style.display === 'block') feats.add('card'); if (window.__rave && window.__rave.active && window.__rave.active()) feats.add('rave'); if (window.__placeKind === 'keep') feats.add('gloamhold'); if (window.__halloween && window.__halloween.on && window.__halloween.on()) feats.add('halloween'); } catch (e) {} }, 4000);

  // errors, located by the first stack frame that names a file (idle-ref.js): message @ file:line:col and the game version
  const onErr = (msg, file, line, col, stack) => { if (errs.size >= 5 || !R) return; errs.set(R.err(msg, file, line, col, stack), 1); };
  addEventListener('error', e => { if (e && e.message) onErr(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack); });
  addEventListener('unhandledrejection', e => { const r = e && e.reason; onErr('(promise) ' + (r && r.message ? r.message : String(r)), '', 0, 0, r && r.stack); });

  // frame rate: 3 s of frames every 30 s while the page is visible, the median makes the bucket
  setInterval(() => { if (document.hidden || !live()) return; let n = 0; const t0 = performance.now(); const f = t => { n++; if (t - t0 < 3000) requestAnimationFrame(f); else fpsS.push(n * 1000 / (t - t0)); }; requestAnimationFrame(f); }, 30000);
  const fpsBucket = () => { if (!fpsS.length) return null; const v = fpsS.slice().sort((a, b) => a - b)[fpsS.length >> 1]; return v < 20 ? '<20' : v < 40 ? '20-40' : v < 55 ? '40-55' : '55+'; };

  function payload(final) {
    const p = { v: 1 }; let any = false;
    if (!sent.visit) { p.visit = 1; p.back = returning ? 1 : 0; p.dev = phone() ? 'phone' : 'desktop'; p.ios = window.__isIOS ? 1 : 0; p.safe = [0, 1, 2].includes(window.__safeLevel) ? window.__safeLevel : 0; p.ref = refHost(); const u = utm(); if (u) p.utm = u; any = true; }
    const fb = fpsBucket(); if (fb && !sent.fps) { p.fps = fb; any = true; }
    try { const w = window.__dlwalk && window.__dlwalk.state && window.__dlwalk.state(); if (w) { const ks = Object.keys(w.done || {}).concat(w.finished ? ['finished'] : w.skipped ? ['ended'] : []).filter(k => !ahaSent['dl:' + k]); if (ks.length) { p.dl = ks; any = true; } } } catch (e) {}
    const nf = [...feats].filter(f => !sent.feats.includes(f)); if (nf.length) { p.feat = nf; any = true; }
    const ne = [...errs.keys()].filter(k => !sent.errs.includes(k)); if (ne.length) { p.err = ne; any = true; }
    try { const st = window.__first5 && window.__first5.state && window.__first5.state();
      if (st && st.aha) { const m = {}; for (const [k, ms] of Object.entries(st.aha)) if (!ahaSent[k]) m[k] = Math.round(ms / 1000); if (Object.keys(m).length) { p.m = m; any = true; }
        const end = st.finished ? 'finished' : st.skipped ? 'skipped' : ''; if (end && !ahaSent['_' + end]) { p.f5 = end; any = true; } } } catch (e) {}
    // time on screen and where the guided start stopped move from bucket to bucket: the server adds the new one and takes back the
    // one this page load reported before (dw0/fl0), so each page load is counted once, in the last bucket it reached
    if (final) { const d = dwell(); if (d !== sent.dw) { p.dw = d; if (sent.dw) p.dw0 = sent.dw; any = true; }
      const f = f5Stop(); if (f && f !== sent.fl) { p.fl = f; if (sent.fl) p.fl0 = sent.fl; any = true; }
      // engagement: each key moves bucket to bucket like dw (the server takes back the old one); visible seconds add up to a day total
      const g = engage(), ch = {}, was = {}; for (const [k, v] of Object.entries(g)) if (v !== sent.eng[k]) { ch[k] = v; if (sent.eng[k]) was[k] = sent.eng[k]; }
      if (Object.keys(ch).length) { p.eg = ch; if (Object.keys(was).length) p.eg0 = was; any = true; }
      const secs = Math.round((shown + (shownAt ? performance.now() - shownAt : 0)) / 1000) - secSent; if (secs >= 5) { p.sec = Math.min(secs, 6 * 3600); any = true; } }
    return any ? p : null;
  }
  function send(why) {
    if (!live()) return; const p = payload(why !== 'peek'); if (!p) return; p.why = why;
    let ok = false; try { ok = navigator.sendBeacon('/lab/stats', new Blob([JSON.stringify(p)], { type: 'application/json' })); } catch (e) {}
    if (!ok) return;
    if (p.visit) sent.visit = true; if (p.fps) sent.fps = true; if (p.feat) sent.feats.push(...p.feat); if (p.err) sent.errs.push(...p.err);
    if (p.m) Object.keys(p.m).forEach(k => { ahaSent[k] = 1; }); if (p.f5) ahaSent['_' + p.f5] = 1; if (p.dl) p.dl.forEach(k => { ahaSent['dl:' + k] = 1; }); if (p.dw) sent.dw = p.dw; if (p.fl) sent.fl = p.fl; if (p.eg) Object.assign(sent.eng, p.eg); if (p.sec) secSent += p.sec; try { localStorage.setItem(SENT, JSON.stringify(ahaSent)); } catch (e) {}
  }
  // batches: when the page is hidden or closed, and at 3 and 15 minutes for tabs that stay open
  addEventListener('visibilitychange', () => { if (document.hidden) send('hide'); });
  addEventListener('pagehide', () => send('leave'));
  setTimeout(() => send('3m'), 180000); setTimeout(() => send('15m'), 900000);
  window.__stats = { live, mark: f => { if (/^[a-z0-9_-]{1,24}$/.test(f)) feats.add(f); }, peek: () => payload(true), _send: send, _parts: () => ({ ref: refHost(), utm: utm(), dw: dwell(), fl: f5Stop(), eg: engage() }) };
})();
