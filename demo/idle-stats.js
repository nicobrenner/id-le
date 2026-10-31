// idle-stats.js: anonymous stats for the public site (#34). Only when all of these hold: the page runs without a local
// server (id-le.com), it isn't a ?fresh test or a localhost copy, and "anonymous stats" is on in ⚙ settings.
// What one page load may send, as small batches to /lab/stats on the same site (navigator.sendBeacon), never more:
//   visit         this page load happened (and whether this browser had been here before: a yes/no, not an ID)
//   device        phone or desktop; iOS yes/no; the crash guard's level (0 normal, 1 lighter, 2 no Oracle: how often it fires)
//   fps           a rough bucket of the frame rate (<20, 20-40, 40-55, 55+)
//   features      which parts got opened (advisor, music, drawer, reels…), once each
//   first five    the guided start's moments reached and how many seconds each took; finished or skipped
//   errors        an error's message (quoted text and long numbers blanked) and file:line, at most 5
//   came from     the site name of the link that brought you (reddit.com, news.ycombinator.com…), never the full address;
//                 "direct" when there was none; plus a campaign tag (utm_source) if the link had one
//   time here     how long the page was on screen, as a bucket (<1, 1-5, 5-20, 20+ minutes); counted once per page load
//   stopped at    for a guided start still running: the last of its moments you reached when you left (or finished/skipped)
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
  // where the visit came from: the referring site's name only (never the path or query), mapped to a few known names
  const refHost = () => { let r = ''; try { r = document.referrer || ''; } catch (e) {} if (!r) return 'direct';
    if (/^android-app:\/\/com\.reddit\./i.test(r)) return 'reddit.com';
    let h = ''; try { h = new URL(r).hostname.toLowerCase(); } catch (e) { return 'other'; }
    if (!h || h === location.hostname || /(^|\.)id-le\.(com|pages\.dev)$/.test(h)) return 'direct';
    if (/^(\d+\.){3}\d+$|^\[|localhost|\.local$/.test(h)) return 'other';
    h = h.replace(/^(www|m|l|lm|old|new|out|np|i)\./, '');
    if (/(^|\.)reddit\.com$|^redd\.it$/.test(h)) return 'reddit.com';
    if (h === 'news.ycombinator.com' || h === 'ycombinator.com') return 'news.ycombinator.com';
    if (/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/.test(h)) return 'x.com';
    if (/^google\.[a-z.]+$/.test(h) || h === 'news.google.com') return 'google';
    if (/(^|\.)bing\.com$/.test(h)) return 'bing';
    if (/(^|\.)duckduckgo\.com$/.test(h)) return 'duckduckgo';
    if (/(^|\.)facebook\.com$/.test(h)) return 'facebook.com';
    if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(h)) return 'linkedin.com';
    if (/(^|\.)github\.com$|\.github\.io$/.test(h)) return 'github.com';
    if (/^(mastodon\.social|bsky\.app|lobste\.rs|kagi\.com|search\.brave\.com|yandex\.[a-z]+|baidu\.com|ecosia\.org)$/.test(h)) return h;
    return /^[a-z0-9][a-z0-9.-]{0,59}$/.test(h) ? h : 'other'; };
  const utm = () => { try { const u = new URLSearchParams(location.search).get('utm_source'); const c = u && u.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24); return c || null; } catch (e) { return null; } };
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
  let sent = { visit: false, feats: [], errs: [], fps: false, m: [], f5: '', dw: null, fl: null }; let ahaSent = {};
  try { ahaSent = JSON.parse(localStorage.getItem(SENT) || '{}') || {}; } catch (e) {}   // first-five moments already counted from this browser (so a reload doesn't count them twice)

  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button[id]'); if (b && FEAT[b.id]) feats.add(FEAT[b.id]); }, true);
  // a card, a rave, Gloamhold: looked at now and then rather than hooked into each module
  setInterval(() => { try { const w = document.getElementById('whisper'); if (w && w.style.display === 'block') feats.add('card'); if (window.__rave && window.__rave.active && window.__rave.active()) feats.add('rave'); if (window.__placeKind === 'keep') feats.add('gloamhold'); } catch (e) {} }, 4000);

  const clean = m => String(m || '').replace(/(["'`“‘])(?:(?!\1).){0,200}\1/g, '"…"').replace(/\d{3,}/g, 'N').replace(/https?:\/\/\S+/g, 'URL').slice(0, 120);
  const onErr = (msg, file, line) => { if (errs.size >= 5) return; const f = String(file || '').split(/[?#]/)[0].split('/').pop() || '?'; errs.set(clean(msg) + ' @' + f + ':' + (line || 0), 1); };
  addEventListener('error', e => { if (e && e.message) onErr(e.message, e.filename, e.lineno); });
  addEventListener('unhandledrejection', e => { const r = e && e.reason; onErr(r && r.message ? r.message : String(r), r && r.stack ? (String(r.stack).match(/\/([\w.-]+\.(?:js|html)):(\d+)/) || [])[1] : '', r && r.stack ? +((String(r.stack).match(/\.(?:js|html):(\d+)/) || [])[1] || 0) : 0); });

  // frame rate: 3 s of frames every 30 s while the page is visible, the median makes the bucket
  setInterval(() => { if (document.hidden || !live()) return; let n = 0; const t0 = performance.now(); const f = t => { n++; if (t - t0 < 3000) requestAnimationFrame(f); else fpsS.push(n * 1000 / (t - t0)); }; requestAnimationFrame(f); }, 30000);
  const fpsBucket = () => { if (!fpsS.length) return null; const v = fpsS.slice().sort((a, b) => a - b)[fpsS.length >> 1]; return v < 20 ? '<20' : v < 40 ? '20-40' : v < 55 ? '40-55' : '55+'; };

  function payload(final) {
    const p = { v: 1 }; let any = false;
    if (!sent.visit) { p.visit = 1; p.back = returning ? 1 : 0; p.dev = phone() ? 'phone' : 'desktop'; p.ios = window.__isIOS ? 1 : 0; p.safe = [0, 1, 2].includes(window.__safeLevel) ? window.__safeLevel : 0; p.ref = refHost(); const u = utm(); if (u) p.utm = u; any = true; }
    const fb = fpsBucket(); if (fb && !sent.fps) { p.fps = fb; any = true; }
    const nf = [...feats].filter(f => !sent.feats.includes(f)); if (nf.length) { p.feat = nf; any = true; }
    const ne = [...errs.keys()].filter(k => !sent.errs.includes(k)); if (ne.length) { p.err = ne; any = true; }
    try { const st = window.__first5 && window.__first5.state && window.__first5.state();
      if (st && st.aha) { const m = {}; for (const [k, ms] of Object.entries(st.aha)) if (!ahaSent[k]) m[k] = Math.round(ms / 1000); if (Object.keys(m).length) { p.m = m; any = true; }
        const end = st.finished ? 'finished' : st.skipped ? 'skipped' : ''; if (end && !ahaSent['_' + end]) { p.f5 = end; any = true; } } } catch (e) {}
    // time on screen and where the guided start stopped move from bucket to bucket: the server adds the new one and takes back the
    // one this page load reported before (dw0/fl0), so each page load is counted once, in the last bucket it reached
    if (final) { const d = dwell(); if (d !== sent.dw) { p.dw = d; if (sent.dw) p.dw0 = sent.dw; any = true; }
      const f = f5Stop(); if (f && f !== sent.fl) { p.fl = f; if (sent.fl) p.fl0 = sent.fl; any = true; } }
    return any ? p : null;
  }
  function send(why) {
    if (!live()) return; const p = payload(why !== 'peek'); if (!p) return; p.why = why;
    let ok = false; try { ok = navigator.sendBeacon('/lab/stats', new Blob([JSON.stringify(p)], { type: 'application/json' })); } catch (e) {}
    if (!ok) return;
    if (p.visit) sent.visit = true; if (p.fps) sent.fps = true; if (p.feat) sent.feats.push(...p.feat); if (p.err) sent.errs.push(...p.err);
    if (p.m) Object.keys(p.m).forEach(k => { ahaSent[k] = 1; }); if (p.f5) ahaSent['_' + p.f5] = 1; if (p.dw) sent.dw = p.dw; if (p.fl) sent.fl = p.fl; try { localStorage.setItem(SENT, JSON.stringify(ahaSent)); } catch (e) {}
  }
  // batches: when the page is hidden or closed, and at 3 and 15 minutes for tabs that stay open
  addEventListener('visibilitychange', () => { if (document.hidden) send('hide'); });
  addEventListener('pagehide', () => send('leave'));
  setTimeout(() => send('3m'), 180000); setTimeout(() => send('15m'), 900000);
  window.__stats = { live, peek: () => payload(true), _send: send, _parts: () => ({ ref: refHost(), utm: utm(), dw: dwell(), fl: f5Stop() }) };
})();
