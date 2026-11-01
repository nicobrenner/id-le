// idle-first5.js: the first five minutes (#15). A browser that has never kept a world arrives in a small living
// starter world (demo/starter_world.json, made by tools/make_starter_world.py from a blank profile) instead of an empty
// floor, and a short nudge trail points at real things to try: open a card, name someone, feed the hungry one, watch
// the sleeper dream, follow a Gazette pill, change the weather, play the first reel, keep something in the drawer.
// Not a tutorial: each nudge is a pill with "show me ›", it completes when you do the thing by any route, "I'll explore"
// ends the trail for good, and a ring on 🔔 shows how far along it is. Early on the world asks for a name; after about
// ten minutes of play it suggests saving a backup file.
// Only for a browser with no saved world at all (no autosave, no genomes, no snapshots, no disk copy): an existing
// world never sees any of this. ?fresh starts it again in such a browser (a private window), and in that mode nothing
// is written to the lab folder on disk. ?nofirst5 turns it off (tools use it).
// Stats stay in this browser: when each first happened, counted from the first load (the almanac shows them and its
// JSON export includes them). Nothing is sent anywhere.
(() => {
  const KEY = 'idle.first5', Q = new URLSearchParams(location.search), now = () => Date.now(), $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ld = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  let S = ld(); const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const N = (o) => window.__notify ? window.__notify(o) : { close() {} };
  const W = () => window.__idleWorld, A = () => window.__arena;
  const live = () => (A() ? A().raw() : []).filter(c => !c.lab && c.d && c.name && !c.guest);
  const byName = n => live().find(c => c.name === n);
  const meta = () => (S && S.meta) || {};

  // the trail, in order; `ready` holds a step back until it makes sense (no reel yet, no Gazette pill yet)
  const HW_URL = 'https://en.wikipedia.org/wiki/Halloween';
  const STEPS = [
    { k: 'card', text: () => `This is a small world, and it is alive. <b>Click a creature</b> to open its card: how it feels, what it wants, who its friends are.`, who: () => meta().friends && meta().friends[0] },
    // Halloween night only (window.__halloween): grow the world from Wikipedia's Halloween page (Nico, 10-31)
    ...(window.__halloween && window.__halloween.on() ? [{ k: 'hwwiki', text: () => `🎃 Tonight only: let the world <b>grow from Wikipedia's Halloween page</b>. Press <b>grow it ›</b>, or paste <code>${HW_URL}</code> into 🎛 studio → Feed the world.`, kind: 'trail' }] : []),
    // right-click (long-press on phones) anything: a menu of what can happen to it and who does it (the key stays 'keep' for the stats)
    { k: 'keep', text: () => `<b>Right-click a word</b> (long-press on a phone): pick what should happen to it and who does it, e.g. <b>fetch</b>, and a creature walks over and brings it. The same menu keeps a copy in your 🗄 drawer.`, kind: 'trail', go: () => { try { window.__rclick && window.__rclick.demo(); } catch (e) {} } },
    { k: 'name', text: () => `Every creature can carry a name you choose. Open a card and <b>type over its name</b>.`, who: () => meta().counter || (live()[0] || {}).name },
    { k: 'feed', text: () => `${mn(meta().hungry)} is hungry. <b>Drag a word onto it</b> to feed it.`, who: () => meta().hungry },
    { k: 'dream', text: () => `${mn(sleeperName())} is asleep. Open its card: the mind tab becomes <b>dream 💤</b>.`, who: () => sleeperName() },
    { k: 'gazette', text: () => `The 📰 <b>Id|le Gazette</b> reports firsts, records and disasters. Open <b>🔔</b> and press <b>go ›</b> on one to see where it happened.`, ready: () => gazetteSeen(), kind: 'trail' },
    { k: 'weather', text: () => `Weather changes their mood. Open <b>🎛 studio</b> and try another weather (storms scare the timid ones).`, kind: 'trail', go: () => { const b = $('#studioBtn'); if (b) b.click(); } },
    { k: 'reel', text: () => `The world made its first <b>memory reel</b> out of what they lived through. Open 🎞 and play it.`, ready: () => reelCount() > 0, go: () => { const b = $('#reelsBtn'); if (b) b.click(); } },
];
  const mn = n => n ? `<a class="mn" data-n="${esc(n)}">${esc(n)}</a>` : 'someone';
  function sleeperName() { const s = live().find(c => c.state === 'sleep'); return s ? s.name : meta().sleeper; }
  function gazetteSeen() { try { return window.__notify.history().some(h => h.kind === 'gazette' && h.t >= (S.t0 || 0)); } catch (e) { return false; } }
  function reelCount() { try { return window.__reels.state().list.length; } catch (e) { return 0; } }

  // ---------- state
  function fresh() { return { v: 1, t0: now(), active: true, done: {}, aha: {}, shown: {}, play: 0, meta: {} }; }
  const active = () => S && S.active && !S.skipped;
  function aha(k) { if (!S || S.aha[k] != null) return; S.aha[k] = now() - S.t0; save(); }
  function done(k) { if (!S || S.done[k]) return; S.done[k] = now(); aha(k); save(); if (cur && cur.k === k) { cur.h.close(); cur = null; nextAt = now() + 5000; } ring();
    if (STEPS.every(s => S.done[s.k])) finish(); }
  function finish() { if (!S.active) return; S.active = false; S.finished = now(); save(); ring();
    N({ kind: 'trail', icon: '🧭', html: `That's the tour of the small things. The rest is theirs to surprise you with. (The 📖 pedia explains everything, whenever you're curious.)`, ttl: 16000 }); }
  function skip() { if (!S) return; S.active = false; S.skipped = now(); save(); if (cur) { cur.h.close(); cur = null; } ring(); }

  // ---------- completing steps: by any route, from the game's own events
  addEventListener('idle:ev', e => { const { type, extra } = e.detail || {}; if (!S) return;
    if (type === 'rename' && extra.by === 'you') done('name');
    else if (type === 'feed') done('feed');
    else if (type === 'terrain' && extra && extra.url && S.done && !S.done.hwwiki && STEPS.some(x => x.k === 'hwwiki')) done('hwwiki');
    else if (type === 'dream_open') done('dream');
    else if (type === 'studio_open' && extra.on) done('weather');
    else if (type === 'reel_play') done('reel');
    else if (type === 'collect_keep' || type === 'inspector_task') done('keep'); });
  document.addEventListener('click', e => { if (!S) return; if (e.target.closest('#ntf .np.gazette [data-go], #ntfpanel [data-go]')) { const pill = e.target.closest('.np, .it'); if (!pill || pill.classList.contains('gazette') || /📰/.test(pill.textContent)) done('gazette'); } }, true);

  // ---------- the trail's pills
  let cur = null, nextAt = 0, running = false;
  function run(delay) { if (running) return; running = true; setInterval(tick, 2000); setTimeout(() => { ring(); stage(); }, delay); }
  function offer(step) { const who = step.who && step.who(), c = who && byName(who);
    const actions = [{ label: 'show me ›', run: () => { if (step.go) step.go(); else if (c && W()) W().openCard(c.name); } }, { label: "I'll explore", title: 'end the tips; they will not come back', run: skip }];
    if (step.k === 'card' || step.k === 'name' || step.k === 'dream') actions[0].run = () => { if (c && W()) W().openCard(c.name); };
    if (step.k === 'feed') actions[0].run = () => { if (c && window.__dis) window.__dis.flyTo(c.x, c.y, 1.4); };
    if (step.k === 'gazette') actions[0].run = () => { if (window.__notify) window.__notify.toggle(true); };
    if (step.k === 'hwwiki') { actions[0].label = 'grow it ›'; actions[0].run = () => { const i = $('#terrain'), g = $('#terrainGo'); if (i && g) { i.value = HW_URL; g.click(); } }; }
    S.shown[step.k] = (S.shown[step.k] || 0) + 1; save();
    const nth = STEPS.filter(s => S.done[s.k]).length + 1;
    const h = N({ kind: 'trail', icon: '🧭', key: 'first5:' + step.k + ':' + S.shown[step.k], html: `<span class="stp">step ${nth} of ${STEPS.length}</span>` + step.text(), actions, ttl: 30000, gap: 1000 });
    cur = { k: step.k, h, t: now() }; }
  function tick() { if (!S || document.hidden) return; if (!active() && S.backupAsked) return; S.play += 2; if (S.play % 20 === 0) save();
    // a backup after about ten minutes of play, even when the tips were skipped or are done (a world in browser storage is easy to lose)
    if (!S.backupAsked && S.play >= 600) { S.backupAsked = now(); save(); askBackup(); }
    if (!active()) return; stage();
    const wh = $('#whisper'); if (wh && wh.style.display === 'block' && wh.offsetParent) { done('card'); const tb = document.querySelector('#ctabs [data-ct="mind"]'); if (tb && /dream/.test(tb.textContent) && wh.classList.contains('mind')) done('dream'); }
    try { const C = window.__collect; if (C && C.loaded && C.loaded()) { if (S.k0 == null) { S.k0 = C.items().length; save(); } else if (C.items().length > S.k0) done('keep'); } } catch (e) {}
    if (reelCount() > 0) aha('first_reel_made'); if (gazetteSeen()) aha('first_gazette');
    // name the world, about a minute and a half in
    if (!S.named && !S.askedName && S.play >= 90) { S.askedName = now(); save(); askName(); }
    if (cur && now() - cur.t < 32000) return; if (cur) cur = null; if (now() < nextAt) return;
    const step = STEPS.find(s => !S.done[s.k] && (!s.ready || s.ready()) && (S.shown[s.k] || 0) < 3);
    if (!step) { if (STEPS.every(s => S.done[s.k] || (S.shown[s.k] || 0) >= 3)) finish(); return; }
    offer(step); nextAt = now() + 45000; }
  // keep the moods the starter world promises: someone asleep (a dream one click away), someone hungry
  function stage() { const m = meta(); if (!S.done.dream) { const sl = byName(m.sleeper); if (sl && sl.state !== 'sleep' && !live().some(c => c.state === 'sleep')) { sl.d.fatigue = 0.95; try { A().act(A().raw().indexOf(sl), 'sleep'); } catch (e) {} } }
    if (!S.done.feed) { const h = byName(m.hungry); if (h && h.d.hunger < 0.7) h.d.hunger = 0.82; } }
  function askName() { N({ kind: 'trail', icon: '🧭', ttl: 0, key: 'first5:name-world', html: `This world doesn't have a name yet. <input data-f5="wname" maxlength="26" placeholder="call it…" style="font:inherit;width:9em;padding:1px 5px;border:1px solid #8886;border-radius:6px;background:transparent;color:inherit">`,
    actions: [{ label: 'name it', run: () => { const i = document.querySelector('[data-f5=wname]'), v = i && i.value.trim(); if (!v) return; nameWorld(v); } }, { label: 'later', run: () => {} }] }); }
  function nameWorld(v) { S.named = v; aha('world_named'); save(); try { if (window.__places && window.__places.rename) window.__places.rename('home', v); } catch (e) {}
    N({ kind: 'world', icon: '🏠', html: `Welcome to <b>${esc(v)}</b>.`, ttl: 6000 }); }
  function askBackup() { N({ kind: 'trail', icon: '💾', ttl: 0, key: 'first5:backup', html: `Your world lives in this browser. Clearing the browser's data would erase it, so it's worth <b>saving a backup file</b> now and then (📸 snapshot → load file brings it back).`,
    actions: [{ label: 'save a backup file', run: backup }, { label: 'not now', run: () => {} }] }); }
  function backup() { try { const sn = window.__design.snap(); sn.name = (S.named || 'my world') + ' backup'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(sn)], { type: 'application/json' }));
    a.download = 'id-le_' + String(S.named || 'world').replace(/[^\w-]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); aha('backup_saved'); S.backupSaved = now(); save(); } catch (e) { console.error(e); } }

  // ---------- the ring on 🔔
  const css = document.createElement('style'); css.textContent = `#ntfBtn{position:relative}#ntfBtn .f5ring{position:absolute;inset:-3px;border-radius:50%;pointer-events:none;background:conic-gradient(#2b5cff calc(var(--p,0)*1turn),#8883 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))}`;
  document.head.appendChild(css);
  function ring() { const b = $('#ntfBtn'); if (!b) return; let r = b.querySelector('.f5ring'); if (!active()) { if (r) r.remove(); return; } if (!r) { r = document.createElement('span'); r.className = 'f5ring'; b.appendChild(r); }
    const p = STEPS.filter(s => S.done[s.k]).length / STEPS.length; r.style.setProperty('--p', p.toFixed(3)); b.title = `notices · first steps: ${STEPS.filter(s => S.done[s.k]).length} of ${STEPS.length}`; }

  // ---------- boot: called by the arena once it knows there is no saved world anywhere (fresh0) or when ?fresh asks
  const LABEL = { card: 'opened a card', name: 'named a creature', feed: 'fed someone', dream: 'watched a dream', gazette: 'followed a Gazette pill', weather: 'opened the weather', reel: 'played a reel', keep: 'kept something', first_reel_made: 'first reel made', first_gazette: 'first Gazette pill', world_named: 'named the world', backup_saved: 'saved a backup' };
  async function boot(fresh0) { if (Q.has('nofirst5')) return false; const want = Q.has('fresh');
    if (!fresh0) return false;
    if (S && !want) return false;   // the trail ran here before (done or skipped): a fresh browser that has played keeps its own world
    // one retry: a first download can fail on a flaky network (a page being left doesn't retry: the next load starts over)
    const get = async () => (await fetch('starter_world.json', { cache: 'no-store' })).json();
    let sw; try { sw = await get(); } catch (e) { if (window.__leavingPage) return false; await new Promise(r => setTimeout(r, 1500)); try { sw = await get(); } catch (e2) { console.error('starter world', e2); return false; } }
    if (window.__leavingPage) return false;
    S = fresh(); S.meta = sw.first5 || {}; save();
    try { window.__design.restore(sw); } catch (e) { console.error(e); return false; }
    setTimeout(() => { try { const cs = live().filter(c => !c.visitor || c.g); if (cs.length && window.__dis) window.__dis.flyTo(cs.reduce((s, c) => s + c.x, 0) / cs.length, cs.reduce((s, c) => s + c.y, 0) / cs.length, innerWidth < 700 ? 0.7 : 0.95); } catch (e) {} }, 400);   // arrive in the middle of them
    run(1500); nextAt = now() + 5000; return true; }
  // a browser where the trail is under way keeps it going after a reload
  function resume() { if (!S || (!active() && S.backupAsked) || Q.has('nofirst5')) return; run(2500); nextAt = now() + 8000; }
  function stats() { if (!S) return null; return { started: new Date(S.t0).toISOString(), finished: S.finished ? new Date(S.finished).toISOString() : null, skipped: S.skipped ? new Date(S.skipped).toISOString() : null, play_s: S.play, aha_s: Object.fromEntries(Object.entries(S.aha).map(([k, v]) => [k, Math.round(v / 1000)])) }; }
  function statsLine() { if (!S) return ''; const e = Object.entries(S.aha).sort((a, b) => a[1] - b[1]); if (!e.length) return ''; const f = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    return 'your first visit: ' + e.map(([k, v]) => `${LABEL[k] || k} at ${f(v)}`).join(' · '); }
  // while the guided start is on (the first five minutes, and after that whenever a tip is showing) other notices wait in 🔔
  const calm = () => !!(active() && (now() - S.t0 < 5 * 60000 || cur));
  window.__first5 = { calm, _play: s => { if (S) S.play = s; }, boot, resume, stats, statsLine, skip, state: () => S && JSON.parse(JSON.stringify(S)), steps: STEPS.map(s => s.k), _tick: tick };
  // ?fresh in a browser that already keeps a world: say why nothing happens (the world is never replaced)
  if (Q.has('fresh') && (() => { try { return !!localStorage.getItem('arena.autosave'); } catch (e) { return false; } })()) setTimeout(() => N({ kind: 'system', ttl: 12000, key: 'first5:fresh-refused', html: `<b>?fresh</b> only works in a browser with no saved world (open it in a private window). Your world is untouched.` }), 3500);
  if (window.__pendingFirst5) { const pf = window.__pendingFirst5; Promise.resolve(boot(pf.fresh0)).catch(e => console.error(e)).finally(() => { if (pf.done) pf.done(); }); }   // the arena got there before this file loaded (and waits for this boot before it counts as ready)
  if (document.readyState === 'complete') resume(); else addEventListener('load', resume);
})();
