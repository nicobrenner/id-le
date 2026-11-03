// Id|le runtime: where the game's back end lives.
// With the local server (server.py) everything passes straight through. Without one (a static site such as
// id-le.com, or `python3 -m http.server`), the /lab/* and /worlds/* calls are answered here instead:
//   saving        /lab/sync, /lab/world      -> IndexedDB in this browser (snapshots merge, never shrink)
//   the web       /lab/fetch, /lab/page, /lab/asset, /lab/img, /worlds/*  -> the optional helper (helper/worker.js), else a clear error
//   lab chat      /lab/notes                 -> kept in this browser for now (the BYO-AI chat replaces the replies; docs/byo_ai.md)
//   research only /lab/recover, /lab/notices, /lab/replies, /lab/embed, /jeffy/*  -> empty answers; the game already falls back
// Config: set window.IDLE_CFG = { mode: 'auto' | 'server' | 'static', helper: 'https://…' } before this file (the static build does).
// the game's source code, open to read, fork and change (shown in ⚙ settings and the phone ☰ menu; pedia.html, privacy.html
// and README.md spell the same address out, so change them together)
window.IDLE_REPO = 'https://github.com/nicobrenner/id-le';
// the two chats' names, in one place (the Operator's name is provisional: change it here): IRC is where the world and its
// creatures talk (and you talk to them); the 🔮 Oracle is the panel where you bring your own AI, which can change this world (even its code);
// inside it the 📟 Operator (the Tiny Operator, TO) is the default: the Tiny Oracle running the world's tools. The data lab is a third thing.
window.IDLE_NAMES = { irc: { icon: '💬', short: 'IRC', long: 'IRC · Id|le Relay Chat', sub: 'the world and its creatures talking' }, op: { icon: '📟', short: 'Operator', sub: 'the Tiny Operator (TO): the chat that runs the world' }, oracle: { icon: '🔮', short: 'Oracle', sub: 'bring your own AI: it can change this world, even its code' } };
// the storyline's funnel (Nico: "measuring/tracking the funnel"): each moment a browser reaches, once, with no time and no ID; which arm
// of the story A/B it is in comes from idle.gv (idle-genesis.js). idle-stats.js sends the new ones (only when anonymous stats are on).
window.__funnel = (() => { const K = 'idle.funnel'; let m = {}; try { m = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) {}
  return { mark: step => { if (!step || m[step]) return; m[step] = 1; try { localStorage.setItem(K, JSON.stringify(m)); } catch (e) {} try { dispatchEvent(new CustomEvent('idle:funnel', { detail: { step } })); } catch (e) {} },
    reached: () => Object.keys(m), arm: () => { try { const v = localStorage.getItem('idle.gv'); return v === 'story' || v === 'current' ? v : null; } catch (e) { return null; } } }; })();
(() => {
  // crash guard: a page that dies while loading (iOS Safari kills tabs that use too much memory, then reloads them) leaves its
  // record 'alive: false'. The next load starts safer: level 1 = the Oracle on one thread and light quality, level 2 = no Oracle.
  // v2 (11-02: 11 of 116 visits a day were wrongly in level 2): only a likely crash counts. The record is 'alive' again as soon as the
  // page is hidden, frozen or left, or has been running 6 s after the Oracle loaded (or 40 s), and a heartbeat says when the page
  // was last seen. A record that went quiet more than 10 min before this load, another tab of the game still running (it answers
  // on a BroadcastChannel), or an old-format record (no times) is not a crash. Crashes older than 30 min are forgotten, and level 2
  // needs two within those 30 min. window.__guard.reset() turns the Tiny Oracle back on.
  try { const G = 'idle.bootGuard', now = Date.now(), WIN = 30 * 60e3, QUIET = 10 * 60e3, id = Math.random().toString(36).slice(2);
    const prev = JSON.parse(localStorage.getItem(G) || 'null') || {};
    let crashes = (Array.isArray(prev.crashes) ? prev.crashes : []).filter(t => now - t < WIN);
    const suspect = prev.alive === false && typeof prev.seen === 'number' && now - prev.seen < QUIET;
    if (suspect) crashes.push(now);
    const levelOf = c => c.length >= 2 ? 2 : c.length ? 1 : 0;
    window.__safeLevel = levelOf(crashes);
    let done = false, alive = false;
    const put = o => { try { localStorage.setItem(G, JSON.stringify(Object.assign({ v: 2, id, t: now, crashes }, o))); } catch (e) {} };
    put({ alive: false, seen: now });
    const beat = setInterval(() => { if (!done && !alive) put({ alive: false, seen: Date.now() }); }, 5000);
    const rest = () => { if (!done) { alive = true; put({ alive: true, seen: Date.now() }); } };          // hidden / frozen / left: not loading any more
    const wake = () => { if (!done && document.visibilityState === 'visible') { alive = false; put({ alive: false, seen: Date.now() }); } };
    const ok = () => { if (done) return; done = true; clearInterval(beat); crashes = []; put({ alive: true, seen: Date.now() }); };
    setTimeout(ok, 40000); addEventListener('pagehide', rest); addEventListener('freeze', rest);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? rest() : wake());
    window.__bootOk = ok;   // a reload the page asks for itself is not a crash: it calls this first
    window.__guardReady = () => setTimeout(ok, 6000);   // arena.html: the Oracle loaded (or failed cleanly): the risky part is over
    // another tab of the game still running is not a crash: ask on a channel; a live tab answers, a crashed one can't
    try { const bc = new BroadcastChannel('idle.guard'); bc.onmessage = e => { const m = e.data || {};
        if (m.q && m.q !== id) bc.postMessage({ a: m.q });
        else if (m.a === id && suspect) { crashes = crashes.filter(t => t !== now); window.__safeLevel = levelOf(crashes); put({ alive, seen: Date.now() }); } };
      if (suspect) bc.postMessage({ q: id }); } catch (e) {}
    window.__guard = { level: () => window.__safeLevel, suspect, reset() { done = true; crashes = []; try { localStorage.setItem(G, JSON.stringify({ v: 2, alive: true, seen: Date.now(), crashes: [] })); } catch (e) {} location.reload(); } };
  } catch (e) { window.__safeLevel = 0; }
  window.__isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const CFG = Object.assign({ mode: 'auto', helper: '' }, window.IDLE_CFG || {});
  const realFetch = window.fetch.bind(window), SANDBOX = /[?&]fresh\b/.test(location.search);
  // ⚙ settings (idle-settings.js): the public helper can be switched off in this browser; stored here so it holds from the first request
  const helperOn = () => { try { return (JSON.parse(localStorage.getItem('idle.settings') || '{}').helper) !== false; } catch (e) { return true; } };
  const HELPER_OFF = 'the public helper is off in ⚙ settings: creatures can\'t read web pages and worlds can\'t link until you turn it back on';
  const HELPER_PATHS = ['/lab/fetch', '/lab/page', '/lab/asset', '/lab/img', '/worlds/', '/jeffy/'];
  const OWN_PATHS = /^\/lab\/(oracle|roadmap|vote)(\?|$)/;   // Tell the Oracle and the roadmap: the site's own service, not the page-reading helper, so ⚙'s helper switch doesn't apply   // /jeffy/*: the data lab's classifiers via Jeffy's public server
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

  // --- is there a server? (a static host answers /lab/notices with 404 or an HTML fallback page, never a JSON list)
  let modeP = CFG.mode !== 'auto' ? Promise.resolve(CFG.mode) : realFetch('/lab/notices', { cache: 'no-store' })
    .then(r => r.ok && (r.headers.get('Content-Type') || '').includes('json') ? 'server' : 'static').catch(() => 'static');
  modeP.then(m => { CFG.mode = m; document.documentElement.dataset.idleMode = m; if (m === 'static') setup(); });

  // --- IndexedDB: one small key/value store per origin
  const db = new Promise((ok, bad) => { try { const r = indexedDB.open('idle', 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('backups', { autoIncrement: true }); }; r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); } catch (e) { bad(e); } });
  const tx = async (store, mode, fn) => { const d = await db; return new Promise((ok, bad) => { const t = d.transaction(store, mode), s = t.objectStore(store); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => bad(t.error); }); };
  const get = k => tx('kv', 'readonly', s => s.get(k)), put = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));

  async function sync(data) {   // same rules as server.py: snapshots merge and never shrink; a much smaller world never replaces a bigger one without a copy
    if (Array.isArray(data.arena_snapshots)) {
      const old = (await get('arena_snapshots')) || [], seen = new Set(data.arena_snapshots.map(x => x.t + '|' + x.name));
      data.arena_snapshots = old.filter(x => !seen.has(x.t + '|' + x.name)).concat(data.arena_snapshots).sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-60);
    }
    if (data.arena_autosave && typeof data.arena_autosave === 'object') {
      const prev = await get('arena_autosave'), size = x => ((x && x.words) || []).length + ((x && x.residents) || []).length + ((x && x.things) || []).length;
      const hist = (await get('arena_autosaves')) || [], last = hist.length ? hist[hist.length - 1].t : 0;
      if (prev && (size(data.arena_autosave) < 0.5 * size(prev) || Date.now() - last > 300000)) { hist.push({ t: Date.now(), save: prev }); await put('arena_autosaves', hist.slice(-24)); }
    }
    for (const k of ['engagement', 'chat_scores', 'corrections', 'visits', 'arena_snapshots', 'arena_autosave']) if (k in data) await put(k, data[k]);
  }

  async function local(path, init) {   // static mode: answer a /lab or /worlds or /jeffy call here
    const method = ((init && init.method) || 'GET').toUpperCase(), body = init && init.body ? (() => { try { return JSON.parse(init.body); } catch (e) { return {}; } })() : {};
    if (OWN_PATHS.test(path)) return CFG.helper ? realFetch(CFG.helper.replace(/\/$/, '') + path, init) : json({ ok: false, error: 'telling the scientists needs the id-le.com helper: on a copy of your own, open an issue on GitHub instead' }, 503);
    if (CFG.helper && HELPER_PATHS.some(p => path.startsWith(p))) {
      if (!helperOn()) return path.startsWith('/worlds/state') ? json({ me: { name: '', links: [], requests: [], inbox: [] }, peers: {}, offline: HELPER_OFF }) : json({ ok: false, error: HELPER_OFF });
      return realFetch(CFG.helper.replace(/\/$/, '') + path, init); }
    if (path.startsWith('/lab/sync')) { await sync(body); return json({ ok: true, where: 'this browser' }); }
    if (path.startsWith('/lab/world')) return json({ arena_autosave: (await get('arena_autosave')) || null, arena_snapshots: (await get('arena_snapshots')) || null });
    if (path.startsWith('/lab/notes')) { const n = (await get('notes')) || []; if (method === 'POST') { n.push({ t: Date.now() / 1000, who: 'you', ...body }); await put('notes', n.slice(-500)); return json({ ok: true }); } return json(n); }
    if (path.startsWith('/lab/replies') || path.startsWith('/lab/notices')) return json([]);
    if (path.startsWith('/lab/recover')) return json(null);
    if (path.startsWith('/lab/embed')) return json({ error: 'no sentence encoder in the browser yet' });
    if (path.startsWith('/jeffy/')) return json({ error: 'the data lab needs a local Jeffy server' }, 502);
    if (path.startsWith('/worlds/state')) return json({ me: { name: '', links: [], requests: [], inbox: [] }, peers: {}, offline: 'linking worlds needs the helper (helper/README.md)' });
    if (path.startsWith('/worlds/')) return json({ ok: false, error: 'linking worlds needs the helper (helper/README.md)' });
    return json({ error: 'this needs the helper: fetching web pages is blocked for web pages themselves (helper/README.md)' });
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    let path = null; try { const u = new URL(url, location.href); if (u.origin === location.origin && /^\/(lab|worlds|jeffy)\//.test(u.pathname)) path = u.pathname + u.search; } catch (e) {}
    if (!path) return realFetch(input, init);
    // ?fresh (a first visit replayed in a private window): never write to the lab folder on disk, whatever the server
    if (SANDBOX && /^\/lab\/(sync|world|notes|recover)\b/.test(path) && init && /post/i.test(init.method || '')) return json({ ok: true, sandbox: true });
    return (await modeP) === 'server' ? realFetch(input, init) : local(path, init);
  };

  // --- static mode only: model cache + cross-origin isolation through a service worker, and world files
  function setup() {
    // the one-time isolation reload carries ?_coi=1 so the server's page-view count (helper/worker.js) skips it; the page drops it again
    const coiReload = () => { try { const u = new URL(location.href); u.searchParams.set('_coi', '1'); location.replace(u.href); } catch (e) { location.reload(); } };
    try { if (/[?&]_coi=/.test(location.search)) { const u = new URL(location.href); u.searchParams.delete('_coi'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch (e) {}
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(reg => { reg.active && reg.active.postMessage({ helper: helperOn() ? CFG.helper : '' }); }).catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => { try { if (!crossOriginIsolated && !sessionStorage.getItem('idle.coi')) { sessionStorage.setItem('idle.coi', '1'); if (window.__bootOk) window.__bootOk(); coiReload(); } } catch (e) {} });
      if (navigator.serviceWorker.controller && !crossOriginIsolated) { try { if (!sessionStorage.getItem('idle.coi')) { sessionStorage.setItem('idle.coi', '1'); if (window.__bootOk) window.__bootOk(); coiReload(); } } catch (e) {} }
    }
    const add = () => { const row = document.getElementById('snaprow'); if (!row || document.getElementById('idleWorldFile')) return; const box = document.createElement('div'); box.id = 'idleWorldFile'; box.style.cssText = 'margin-top:6px;font-size:12px';
      box.innerHTML = '<small style="opacity:.6">no server here: your world lives in this browser. Keep a copy:</small> <button data-idle="dl">⬇ download my world</button> <label class="fileload">⬆ load a world file <input type="file" accept=".json" hidden></label>';
      box.querySelector('[data-idle=dl]').onclick = download; box.querySelector('input').onchange = e => e.target.files[0] && restore(e.target.files[0]);
      row.appendChild(box); const small = row.querySelector('small'); if (small) small.textContent = small.textContent.replace('copied to the lab folder on your Mac', 'saved in this browser (download a copy below)'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  }
  const arenaKeys = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith('arena.') || k.startsWith('pedia.'))) o[k] = localStorage.getItem(k); } return o; };
  async function download() {   // everything: every arena.* key plus the browser's disk copy, one JSON file
    const file = { format: 'idle-world', v: 1, t: Date.now(), keys: arenaKeys(), disk: { arena_autosave: await get('arena_autosave'), arena_snapshots: await get('arena_snapshots') } };
    const a = document.createElement('a'), d = new Date(); a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    a.download = `idle-world-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function restore(f) {   // never deletes: the current world goes into the backups store first, and snapshots on disk merge
    let w; try { w = JSON.parse(await f.text()); } catch (e) { alertish('that file is not a world file'); return; }
    if (!w || w.format !== 'idle-world' || !w.keys) { const sf = document.getElementById('snapFile'); if (sf) { const dt = new DataTransfer(); dt.items.add(f); sf.files = dt.files; sf.dispatchEvent(new Event('change', { bubbles: true })); } return; }   // a single snapshot: the arena's own loader
    await tx('backups', 'readwrite', s => s.add({ t: Date.now(), why: 'before loading ' + f.name, keys: arenaKeys() }));
    if (w.disk) await sync({ arena_snapshots: w.disk.arena_snapshots || [], ...(w.disk.arena_autosave ? { arena_autosave: w.disk.arena_autosave } : {}) });
    window.__recovering = true;   // the arena's own guard: nothing autosaves over the loaded world on the way out
    const parse = v => { try { return JSON.parse(v); } catch (e) { return null; } };
    const mine = parse(localStorage.getItem('arena.snaps')) || [], theirs = parse(w.keys['arena.snaps']) || [], now = parse(localStorage.getItem('arena.autosave'));
    if (now) mine.push({ ...now, name: 'before loading ' + f.name });   // the world you had becomes a snapshot, like the arena's own recovery does
    const seen = new Set(), snaps = theirs.concat(mine).filter(x => { const k = x && (x.t + '|' + x.name); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    for (const [k, v] of Object.entries(w.keys)) { try { localStorage.setItem(k, v); } catch (e) {} }
    try { localStorage.setItem('arena.snaps', JSON.stringify(snaps)); } catch (e) { try { localStorage.setItem('arena.snaps', JSON.stringify(snaps.slice(-15))); } catch (er) {} }
    try { localStorage.setItem('arena.autorestore', 'on'); } catch (e) {}
    if (window.__bootOk) window.__bootOk(); location.reload();
  }
  const alertish = t => { const el = document.createElement('div'); el.textContent = t; el.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);background:#222;color:#fff;padding:6px 12px;border-radius:8px;z-index:99999;font:13px var(--ui-font,system-ui)'; document.body.appendChild(el); setTimeout(() => el.remove(), 3500); };
  // drafts: whatever is half-typed in a chat box (any textarea with an id, and the room chat line) survives a reload; it is put back once the box
  // appears and cleared once the box is empty again (sent). Text inputs are left alone: some of them hold API keys.
  (() => { const SEL = 'textarea[id], input#chat', K = id => 'idle.draft.' + id, seen = new WeakSet();
    const sync = () => { for (const t of document.querySelectorAll(SEL)) { try {
      if (!seen.has(t)) { seen.add(t); const d = localStorage.getItem(K(t.id)); if (d && !t.value) { t.value = d; t.dispatchEvent(new Event('input', { bubbles: true })); } continue; }
      if (t.value.trim()) localStorage.setItem(K(t.id), t.value); else localStorage.removeItem(K(t.id)); } catch (e) {} } };
    document.addEventListener('input', e => { if (e.target.matches && e.target.matches(SEL) && seen.has(e.target)) sync(); });
    addEventListener('pagehide', sync); setInterval(sync, 1000); if (document.readyState !== 'loading') sync(); else addEventListener('DOMContentLoaded', sync); })();
  window.__idle = { mode: () => modeP, cfg: CFG, helperOn, sandbox: SANDBOX, swHelper: () => { try { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({ helper: helperOn() ? CFG.helper : '' }); } catch (e) {} }, download, backups: () => tx('backups', 'readonly', s => s.getAll()), kv: { get, put } };   // kv: the almanac keeps its history here (served or static)
})();
