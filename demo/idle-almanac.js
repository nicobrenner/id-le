// idle-almanac.js: the data lake (issue #4). Every world keeps its history: the advisor's gauges sampled once a minute and rolled
// up into hours and days, who joined and who left, and an event log (disasters, weather, names, raves, reels, firsts and records,
// friendships, the whole Id|le gazette). Minutes are kept for 2 days, hours for 90 days, days for good; rolling up is the only
// thing that ever shrinks it. The full history lives in IndexedDB (window.__idle.kv, so it works served or static); hours, days and
// recent events also ride in snapshots and so in the once-a-minute disk mirror. Restoring merges, never removes.
// The almanac is the dashboard over it: open it from 🌊 in the top bar or by clicking a lake. Each world, plus all worlds together
// (the data ocean); day, week, month, year and all-time views; names are mentions; a research export (JSON / CSV) saves locally.
// Time is real time: a day is a calendar day. A world's age counts from its first sample (day 1, month 1, year 1).
(() => {
  const H = () => window.__lakeHooks, A = () => window.__advisor, P = () => window.__places, Lf = () => window.__life;
  if (!H()) return;
  const now = () => Date.now(), MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const r3 = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000;
  // one row per sample: t, then these (all 0..1 except n)
  const F = ['n', 'fear', 'hunger', 'hurt', 'tired', 'crowd', 'mood', 'friends', 'food', 'hide', 'lake'];
  const LABEL = { n: 'population', fear: 'fear', hunger: 'hunger', hurt: 'hurt', tired: 'tiredness', crowd: 'crowding', mood: 'mood', friends: 'friendships', food: 'food supply', hide: 'hiding', lake: 'lake level' };
  let D = { v: 1, worlds: {}, plays: {}, gz: 0, t0: now() }, ready = false, dirty = false;

  // ---------- which world ----------
  const placeId = () => (P() && P().cur && P().cur()) || 'home';
  const placeKind = () => { const id = placeId(); if (id === 'home') return 'home'; return (P() && P().kind && P().kind()) || 'page'; };
  const counts = () => ['home', 'keep'].includes(placeKind());
  const placeName = id => { if (id === 'home') return 'Home'; try { const p = JSON.parse(localStorage.getItem('arena.places') || '[]').find(p => p.id === id); return (p && p.name) || id; } catch (e) { return id; } };
  const W = id => { id = id || placeId(); let w = D.worlds[id]; if (!w) w = D.worlds[id] = { id, name: placeName(id), kind: placeKind(), born: now(), min: [], hr: [], day: [], ev: [], members: {} }; return w; };

  // ---------- storing (IndexedDB; a light copy in localStorage if there is no IndexedDB) ----------
  const kv = () => window.__idle && window.__idle.kv;
  async function load() { let got = null; try { got = kv() ? await kv().get('almanac') : JSON.parse(localStorage.getItem('arena.almanac') || 'null'); } catch (e) {}
    if (got && got.worlds) merge(got, true); ready = true; }
  let saving = false;
  async function save() { if (!ready || saving) return; saving = true; dirty = false; try { if (kv()) await kv().put('almanac', D); else localStorage.setItem('arena.almanac', JSON.stringify(forSnap())); } catch (e) {} saving = false; }

  // ---------- rolling up: a minute row feeds its hour and its day (mean, low, high), events count into their day ----------
  function bucket(list, t0, row) { let b = list[list.length - 1]; if (!b || b.t !== t0) { b = { t: t0, c: 0, m: F.map(() => null), lo: F.map(() => null), hi: F.map(() => null), ev: {} }; list.push(b); list.sort((a, b) => a.t - b.t); b = list.find(x => x.t === t0); }
    b.c++; F.forEach((_, i) => { const v = row[i + 1]; if (v == null) return; b.m[i] = r3(b.m[i] == null ? v : b.m[i] + (v - b.m[i]) / b.c); b.lo[i] = b.lo[i] == null ? v : Math.min(b.lo[i], v); b.hi[i] = b.hi[i] == null ? v : Math.max(b.hi[i], v); }); return b; }
  const hourOf = t => Math.floor(t / HOUR) * HOUR, dayOf = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
  function dayRow(w, t) { const t0 = dayOf(t); let b = w.day.find(x => x.t === t0); if (!b) { b = { t: t0, c: 0, m: F.map(() => null), lo: F.map(() => null), hi: F.map(() => null), ev: {} }; w.day.push(b); w.day.sort((a, b) => a.t - b.t); } return b; }
  function trim(w) { const t = now(); while (w.min.length && w.min[0][0] < t - 2 * DAY) w.min.shift(); while (w.hr.length && w.hr[0].t < t - 90 * DAY) w.hr.shift(); if (w.ev.length > 4000) w.ev.splice(0, w.ev.length - 4000); }

  // ---------- events ----------
  const lastOf = {};
  function ev(k, html, o) { if (!counts()) return; const w = W(), t = now(); o = o || {}; const b = dayRow(w, t); b.ev[k] = (b.ev[k] || 0) + 1;
    if (o.every) { const key = w.id + k; if (t - (lastOf[key] || 0) < o.every) return; lastOf[key] = t; }   // busy kinds: counted every time, written down now and then
    w.ev.push({ t, k, h: String(html).slice(0, 400), who: o.who || null, at: o.at || null }); dirty = true; }
  const posOf = n => { const c = n && H().creatures().find(c => c.name === n); return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null; };
  const mn = n => Lf() && Lf().mn ? Lf().mn(n) : `<b>${esc(n)}</b>`;
  const hints = {};   // how a new name got here, from the events just before it showed up
  addEventListener('idle:ev', e => { const { type, extra: x = {} } = e.detail || {};
    try {
      if (type === 'rename' && x.to) { const w = W(); if (w.members[x.from] && !w.members[x.to]) { w.members[x.to] = { ...w.members[x.from], aka: x.from }; w.members[x.from].z = w.members[x.from].z || now(); w.members[x.from].renamed = x.to; } hints[x.to] = 'renamed'; ev('name', `${mn(x.from || 'someone')} is now called ${mn(x.to)}`, { who: x.to, at: posOf(x.to) }); }
      else if (type === 'hangry' && !x.end) ev('hangry', `${mn(x.who)} went hangry`, { who: x.who, at: posOf(x.who), every: 10 * MIN });
      else if (type === 'steal' && x.success !== false) ev('theft', `${mn(x.who)} stole from ${mn(x.from)}`, { who: x.who, at: posOf(x.who), every: 20 * MIN });
      else if (type === 'graze') ev('graze', `${mn(x.who)} grazed on a chart`, { who: x.who, every: 30 * MIN });
      else if (type === 'disaster') ev('disaster', `a ${esc(x.k || 'disaster')} struck`, {});
      else if (type === 'reels_made') ev('reel', `the world made ${x.n} memory reel${x.n === 1 ? '' : 's'}`, {});
      else if (type === 'reel_play' && x.key) { D.plays[x.key] = (D.plays[x.key] || 0) + 1; dirty = true; }
      else if (type === 'rave' && x.on) ev('rave', `a rave started${x.set ? ': ' + esc(x.set) : ''}`, {});
      else if (type === 'frenzy') ev('frenzy', `a feeding frenzy (${x.n} creatures)`, {});
      else if (type === 'studio_evolve') ev('evolve', 'the world evolved', { every: 10 * MIN });
      else if (type === 'grow_world') ev('grow', `the world grew to ${x.W} × ${x.H}`, {});
      else if (type === 'habituated') ev('habit', `${mn(x.who)} got used to the storms`, { who: x.who, every: 15 * MIN });
      else if (type === 'metamorphosis') { hints[x.who] = 'changed'; ev('change', `${mn(x.who)} changed into a ${esc(x.kind)}`, { who: x.who, at: posOf(x.who) }); }
      else if (type === 'sick') ev('sick', `${mn(x.who)} fell sick`, { who: x.who, every: 10 * MIN });
      else if (type === 'clone') hints._next = 'cloned from ' + x.from;
      else if (type === 'special') hints._next = 'a special ' + (x.kind || 'creature');
      else if (type === 'visitor' || type === 'wake') hints._next = 'came back from rest';
      else if (type === 'rest') { hints['rest:' + x.who] = 1; }
      else if (type === 'snapshot') ev('snapshot', 'a snapshot was taken', { every: 30 * MIN });
      else if (type === 'advisor_action') ev('advisor', `you used the advisor: ${esc(x.id)}`, { every: 5 * MIN });
    } catch (err) {} });

  // ---------- the minute sample ----------
  let lastWx = {}, lastDiary = 0;
  function sample() { if (!ready || !counts() || !window.__restoredOrFresh) return; const w = W(), t = now(), h = H();
    let m = null; try { m = A() && A().measure(); } catch (e) {}
    const cs = h.creatures().filter(c => !c.lab && !c.guest && c.name && c.d);
    if (!m) { m = { n: cs.length, v: {}, hiding: cs.filter(c => c.state === 'hide').length }; }
    const v = m.v || {}, lake = window.__lake && window.__lake.level ? window.__lake.level() : null;
    const row = [t, m.n, v.fear, v.hunger, v.hurt, v.tired, v.crowd, v.mood, v.friends, v.food, m.n ? (m.hiding || 0) / m.n : 0, lake].map((x, i) => i === 0 ? x : i === 1 ? x : r3(x));
    w.min.push(row); bucket(w.hr, hourOf(t), row); const db = dayRow(w, t); bucket([db], db.t, row); w.name = placeName(w.id); w.kind = placeKind();
    // members: who is here now that wasn't, who left
    const names = new Set(cs.map(c => c.name)), first = !Object.keys(w.members).length;
    for (const n of names) { const mb = w.members[n]; if (!mb) { const how = first ? 'founder' : hints[n] || hints._next || 'arrived'; delete hints._next; w.members[n] = { a: t, z: null, how, here: 1 };
        if (!first && how !== 'renamed') { ev('join', `${mn(n)} joined (${esc(how)})`, { who: n, at: posOf(n) }); db.ev.joined = (db.ev.joined || 0) + 1; } }
      else if (!mb.here) { mb.here = 1; mb.z = null; mb.back = (mb.back || 0) + 1; ev('back', `${mn(n)} is back`, { who: n, at: posOf(n), every: 2 * MIN }); } }
    if (first) ev('census', `the almanac starts: ${names.size} founding members`, {});
    for (const [n, mb] of Object.entries(w.members)) if (mb.here && !names.has(n)) { mb.here = 0; mb.z = t; if (mb.renamed) continue; const why = hints['rest:' + n] ? 'went to rest' : 'left'; delete hints['rest:' + n]; ev('left', `${mn(n)} ${why}`, { who: n }); db.ev.left = (db.ev.left || 0) + 1; }
    // weather turns
    const wx = h.world().weather; if (lastWx[w.id] && lastWx[w.id] !== wx) ev('weather', `the weather turned to ${esc(h.WEATHER_NAMES[wx] || wx)}`, { every: 3 * MIN }); lastWx[w.id] = wx;
    // the gazette, archived
    try { for (const it of (A() ? A().news() : [])) if (it.t > (D.gz || 0)) { D.gz = it.t; const txt = String(it.text).replace(/<button[^>]*>[^<]*<\/button>/g, '').replace(/<(?!\/?(b|i|a)\b)[^>]*>/g, ''); ev('gazette', txt, { at: it.at }); } } catch (e) {}
    // memories worth an almanac line: friendships, firsts, getting over things (from the diaries, since the last sample)
    const since = lastDiary || t - MIN; lastDiary = t;
    for (const c of cs) for (const e of ((c.life && c.life.diary) || [])) { if (e.t <= since || e.t > t) continue; if (e.k === 'friend') { ev('friend', `${mn(c.name)} ${e.x}`, { who: c.name, at: posOf(c.name), every: 0 }); db.ev.friendships = (db.ev.friendships || 0) + 1; } else if (e.k === 'first' && /first time in/.test(e.x)) { /* weather firsts: too many */ } else if (e.k === 'heal') ev('heal', `${mn(c.name)} ${e.x}`, { who: c.name, every: 5 * MIN }); }
    trim(w); dirty = true; if (open) render(); }
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 5000 }) : setTimeout(f, 0));   // a sample takes ~35 ms with 1,000 creatures: done in idle time
  setInterval(() => idle(sample), MIN); setTimeout(() => { load().then(() => setTimeout(sample, 20000)); }, 500);
  setInterval(() => { if (dirty) save(); }, 30000); addEventListener('pagehide', () => { if (dirty) save(); });

  // ---------- snapshots: hours for the last 7 days, all days, the last 150 events, members; merge never removes ----------
  function forSnap() { const out = { v: 1, t0: D.t0, gz: D.gz, plays: { ...D.plays }, worlds: {} };
    for (const [id, w] of Object.entries(D.worlds)) out.worlds[id] = { id, name: w.name, kind: w.kind, born: w.born, hr: w.hr.filter(b => b.t > now() - 7 * DAY), day: w.day, ev: w.ev.slice(-150), members: w.members };
    return out; }
  function merge(o, fromStore) { if (!o || !o.worlds) return; D.t0 = Math.min(D.t0 || now(), o.t0 || now()); D.gz = Math.max(D.gz || 0, o.gz || 0);
    for (const [k, n] of Object.entries(o.plays || {})) D.plays[k] = Math.max(D.plays[k] || 0, n);
    for (const [id, x] of Object.entries(o.worlds)) { const had = D.worlds[id]; if (!had) { D.worlds[id] = JSON.parse(JSON.stringify({ min: [], hr: [], day: [], ev: [], members: {}, ...x })); continue; }
      had.born = Math.min(had.born, x.born || had.born); if (!had.name && x.name) had.name = x.name;
      const mergeRows = (a, b) => { const m = new Map(a.map(r => [r.t, r])); for (const r of b || []) { const e = m.get(r.t); if (!e || (r.c || 0) > (e.c || 0)) m.set(r.t, JSON.parse(JSON.stringify(r))); } return [...m.values()].sort((p, q) => p.t - q.t); };
      had.hr = mergeRows(had.hr, x.hr); had.day = mergeRows(had.day, x.day);
      if (x.min && x.min.length) { const s = new Set(had.min.map(r => r[0])); had.min = had.min.concat(x.min.filter(r => !s.has(r[0]))).sort((p, q) => p[0] - q[0]); }
      const seen = new Set(had.ev.map(e => e.t + '|' + e.k + '|' + e.h)); had.ev = had.ev.concat((x.ev || []).filter(e => !seen.has(e.t + '|' + e.k + '|' + e.h))).sort((p, q) => p.t - q.t);
      for (const [n, mb] of Object.entries(x.members || {})) { const e = had.members[n]; if (!e) had.members[n] = { ...mb }; else e.a = Math.min(e.a, mb.a); } }
    dirty = true; if (!fromStore) save(); }

  // ---------- research export (saved on this computer, nothing is sent anywhere) ----------
  function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`; };
  const csvq = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const iso = t => new Date(t).toISOString();
  function exportAs(kind) { const ws = Object.values(D.worlds);
    if (kind === 'json') return dl(`idle-almanac-${stamp()}.json`, JSON.stringify({ format: 'idle-almanac', v: 1, exported: iso(now()), fields: F, notes: 'min rows: [t, ...fields]; hr/day buckets: t (start), c (samples), m (mean), lo, hi per field, ev (counts by kind); firstFive: when each first happened on a first visit, seconds from the first load (kept only in this browser)', ...D, firstFive: window.__first5 ? window.__first5.stats() : null }, null, 1), 'application/json');
    let rows;
    if (kind === 'min') rows = [['world', 'time', ...F]].concat(...ws.map(w => w.min.map(r => [w.name, iso(r[0]), ...r.slice(1)])));
    else if (kind === 'hr' || kind === 'day') rows = [['world', 'start', 'samples', ...F.map(f => f + '_mean'), ...F.map(f => f + '_min'), ...F.map(f => f + '_max'), 'events']].concat(...ws.map(w => w[kind].map(b => [w.name, iso(b.t), b.c, ...b.m, ...b.lo, ...b.hi, Object.entries(b.ev || {}).map(([k, n]) => k + ':' + n).join(' ')])));
    else if (kind === 'ev') rows = [['world', 'time', 'kind', 'who', 'text', 'x', 'y']].concat(...ws.map(w => w.ev.map(e => [w.name, iso(e.t), e.k, e.who || '', e.h.replace(/<[^>]+>/g, ''), e.at ? e.at.x : '', e.at ? e.at.y : ''])));
    else if (kind === 'members') rows = [['world', 'name', 'joined', 'left', 'how', 'here']].concat(...ws.map(w => Object.entries(w.members).map(([n, m]) => [w.name, n, iso(m.a), m.z ? iso(m.z) : '', m.how, m.here ? 1 : 0])));
    dl(`idle-almanac-${kind}-${stamp()}.csv`, rows.map(r => r.map(csvq).join(',')).join('\n'), 'text/csv'); }

  // ---------- the dashboard ----------
  const css = document.createElement('style'); css.textContent = `
#almanac{position:fixed;inset:0;z-index:9998;display:none;align-items:flex-start;justify-content:center;background:#0006;padding:40px 16px;box-sizing:border-box;overflow:auto}
#almanac.on{display:flex}#almanac .bx{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--mut:#52514e;--grid:#8883;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:14px;box-shadow:0 12px 40px #0007;width:min(940px,100%);padding:12px 16px 16px;font:13px system-ui;box-sizing:border-box}
@media (prefers-color-scheme: dark){#almanac .bx{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--mut:#c3c2b7}}
#almanac .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#almanac .hd h3{margin:0;font:600 17px Georgia,serif;flex:1}#almanac .sub{color:var(--mut);font-size:12px}
#almanac button{font:12px system-ui;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;cursor:pointer;padding:2px 9px}#almanac button.on{background:var(--s1);border-color:var(--s1);color:#fff}
#almanac .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}#almanac h4{margin:14px 0 6px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
#almanac .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}#almanac .tile{border:1px solid #8884;border-radius:10px;padding:7px 10px}#almanac .tile b{display:block;font-size:22px;font-weight:600}#almanac .tile small{color:var(--mut)}
#almanac .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}#almanac .mini{border:1px solid #8884;border-radius:10px;padding:6px 8px}#almanac .mini .t{display:flex;justify-content:space-between;font-size:12px}
#almanac svg{display:block;width:100%;overflow:visible}#almanac svg text{fill:var(--mut);font:10px system-ui}#almanac .chart{position:relative}#almanac .tip{position:absolute;pointer-events:none;background:var(--floor);border:1px solid #8886;border-radius:8px;padding:3px 7px;font-size:11px;white-space:nowrap;display:none;box-shadow:0 3px 10px #0004;z-index:2}
#almanac .list div{padding:3px 0;border-bottom:1px solid #8882}#almanac .list small{color:var(--mut);margin-right:6px}#almanac .list button{padding:0 6px;margin-left:4px}#almanac a.mn{cursor:pointer;color:inherit;text-decoration:underline dotted #8889;text-underline-offset:2px;font-weight:600}
#almanac input[type=search]{font:12px system-ui;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;padding:2px 8px;width:180px}#almanac .lg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px}#almanac .lg i{display:inline-block;width:10px;height:3px;border-radius:2px;vertical-align:middle;margin-right:4px}
#almanac table{border-collapse:collapse;font-size:12px;width:100%}#almanac td,#almanac th{text-align:left;padding:2px 6px;border-bottom:1px solid #8882}#almanacBtn.on{outline:2px solid #2b5cff66}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'almanac'; box.innerHTML = '<div class="bx"></div>'; document.body.appendChild(box); const bx = box.firstChild;
  const btn = document.createElement('button'); btn.id = 'almanacBtn'; btn.title = 'the almanac: your worlds\' history, trends, new members, the gazette, top reels (the data lake)'; btn.textContent = '🌊';
  const anchor = document.getElementById('advBtn') || document.getElementById('djBtn') || document.getElementById('reelsBtn'); if (anchor) anchor.after(btn, ' '); else setTimeout(() => { const a2 = document.getElementById('advBtn'); if (a2) a2.after(btn, ' '); }, 1500);
  let open = false, view = { w: null, range: 'day', q: '' };
  function show(v, worldId) { open = v; box.classList.toggle('on', v); btn.classList.toggle('on', v); if (v) { if (worldId) view.w = worldId; if (!view.w || (view.w !== 'ocean' && !D.worlds[view.w])) view.w = counts() ? placeId() : 'home'; if (ready && counts() && !W().min.length) sample(); render(); H().log('almanac_open', { w: view.w }); } }
  btn.addEventListener('click', () => show(!open));
  box.addEventListener('click', e => { if (e.target === box) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) show(false); });

  // rows for a range: minutes for a day, hours for a week or month, days for a year or all time
  const RANGES = { day: ['day', DAY], week: ['week', 7 * DAY], month: ['month', 30 * DAY], year: ['year', 365 * DAY], all: ['all time', Infinity] };
  function series(w, range) { const span = RANGES[range][1], t0 = now() - span;
    if (range === 'day') return { unit: 'minute', pts: w.min.filter(r => r[0] >= t0).map(r => ({ t: r[0], v: r.slice(1) })) };
    if (range === 'week' || (range === 'month' && w.day.length < 3)) return { unit: 'hour', pts: w.hr.filter(b => b.t >= t0).map(b => ({ t: b.t, v: b.m, lo: b.lo, hi: b.hi })) };
    return { unit: 'day', pts: w.day.filter(b => b.t >= t0 && b.c).map(b => ({ t: b.t, v: b.m, lo: b.lo, hi: b.hi })) }; }
  const fmtT = (t, unit) => { const d = new Date(t); return unit === 'day' ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : unit === 'hour' ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
  // a line chart: one y axis, 2px lines, recessive grid, crosshair + tooltip on hover (data kept on the element)
  let charts = [];
  // charts are drawn at the width they will have, so their text is never stretched
  const chartW = () => Math.min(940, innerWidth - 32) - 34, miniW = () => { const W = chartW(), n = Math.max(1, Math.floor((W + 10) / 210)); return (W - (n - 1) * 10) / n - 18; };
  function line(lines, o) { o = o || {}; const Wd = Math.max(160, Math.round(o.w || chartW())), Ht = o.h || 120, L = 30, R = o.right || 8, T = 6, B = 16; const all = lines.flatMap(l => l.pts.map(p => p.y)).filter(v => v != null);
    const ts = lines.flatMap(l => l.pts.map(p => p.t)); if (!ts.length) return '<div class="sub">no data in this range yet: the almanac samples once a minute</div>';
    const tmin = Math.min(...ts), tmax = Math.max(...ts, tmin + 1), ymax = o.pct ? 1 : Math.max(1, ...all) * 1.08, ymin = 0;
    const X = t => L + (t - tmin) / (tmax - tmin) * (Wd - L - R), Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (Ht - T - B);
    let s = `<svg viewBox="0 0 ${Wd} ${Ht}" preserveAspectRatio="none" style="height:${Ht}px">`;
    for (const g of [0, 0.5, 1]) { const v = ymin + g * (ymax - ymin), y = Y(v).toFixed(1); s += `<line x1="${L}" x2="${Wd - R}" y1="${y}" y2="${y}" stroke="var(--grid)" stroke-width="1"/><text x="${L - 4}" y="${+y + 3}" text-anchor="end">${o.pct ? Math.round(v * 100) + '%' : Math.round(v)}</text>`; }
    s += `<text x="${L}" y="${Ht - 3}">${esc(fmtT(tmin, o.unit))}</text><text x="${Wd - R}" y="${Ht - 3}" text-anchor="end">${esc(fmtT(tmax, o.unit))}</text>`;
    for (const l of lines) { const pts = l.pts.filter(p => p.y != null); if (!pts.length) continue;
      if (l.band) { const up = pts.filter(p => p.hi != null).map(p => `${X(p.t).toFixed(1)},${Y(p.hi).toFixed(1)}`), dn = pts.filter(p => p.lo != null).reverse().map(p => `${X(p.t).toFixed(1)},${Y(p.lo).toFixed(1)}`); if (up.length > 1) s += `<polygon points="${up.concat(dn).join(' ')}" fill="${l.c}" opacity=".13"/>`; }
      const d = pts.map(p => `${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' '); s += pts.length > 1 ? `<polyline points="${d}" fill="none" stroke="${l.c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : `<circle cx="${X(pts[0].t)}" cy="${Y(pts[0].y)}" r="4" fill="${l.c}"/>`;
      if (o.label) { const p = pts[pts.length - 1]; s += `<text x="${(X(p.t) + 4).toFixed(1)}" y="${(Y(p.y) + 3).toFixed(1)}" style="fill:var(--ink)">${esc(l.name)}</text>`; } }
    s += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${Ht - B}" stroke="var(--mut)" stroke-width="1" opacity="0" vector-effect="non-scaling-stroke"/></svg>`;
    const id = charts.length; charts.push({ lines, X, tmin, tmax, L, R, Wd, o }); return `<div class="chart" data-ch="${id}">${s}<div class="tip"></div></div>`; }
  bx.addEventListener('mousemove', e => { const el = e.target.closest('.chart'); bx.querySelectorAll('.chart .tip').forEach(t => { if (!el || !el.contains(t)) t.style.display = 'none'; }); if (!el) return; const ch = charts[+el.dataset.ch]; if (!ch) return;
    const r = el.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width * ch.Wd, t = ch.tmin + (fx - ch.L) / (ch.Wd - ch.L - ch.R) * (ch.tmax - ch.tmin);
    let best = null; for (const l of ch.lines) for (const p of l.pts) if (p.y != null && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p; if (!best) return;
    const rows = ch.lines.map(l => { const p = l.pts.find(q => q.t === best.t); return p && p.y != null ? `<div><i style="display:inline-block;width:8px;height:3px;background:${l.c};margin-right:4px;vertical-align:middle"></i>${esc(l.name)} <b>${ch.o.pct ? pct(p.y) : Math.round(p.y)}</b>${p.lo != null && !ch.o.pct ? ` <small>(${Math.round(p.lo)}–${Math.round(p.hi)})</small>` : ''}</div>` : ''; }).join('');
    const tip = el.querySelector('.tip'); tip.innerHTML = `<div class="sub">${esc(fmtT(best.t, ch.o.unit))}</div>${rows}`; tip.style.display = 'block'; const px = ch.X(best.t) / ch.Wd * r.width; tip.style.left = Math.min(r.width - tip.offsetWidth, Math.max(0, px + 10)) + 'px'; tip.style.top = '0px';
    const xh = el.querySelector('.xh'); xh.setAttribute('x1', ch.X(best.t)); xh.setAttribute('x2', ch.X(best.t)); xh.setAttribute('opacity', '.6'); });
  bx.addEventListener('mouseleave', () => bx.querySelectorAll('.chart .tip').forEach(t => { t.style.display = 'none'; }));

  const ageOf = w => { const d = Math.floor((now() - w.born) / DAY), y = Math.floor(d / 365), mo = Math.floor((d % 365) / 30); return `year ${y + 1}, month ${mo + 1}, day ${d % 30 + 1}`; };
  const agoT = t => { const m = Math.round((now() - t) / MIN); return m < 1 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const goBtn = (e, wid) => e.at && wid === placeId() ? ` <button data-go="${e.at.x},${e.at.y}" title="fly there">go ›</button>` : '';
  function topReels(n) { let list = []; try { list = (window.__reels && window.__reels.list()) || []; } catch (e) {}
    return list.map(r => ({ r, s: (r.star ? 10 : 0) + 2 * (D.plays[r.key] || 0) + Math.min(8, r.items.length) + (r.seen ? 1 : 0) })).sort((a, b) => b.s - a.s || b.r.t - a.r.t).slice(0, n); }
  const linkNames = h => { const ns = [...new Set(H().creatures().map(c => c.name).filter(n => n && n.length > 1))].sort((a, b) => b.length - a.length); if (!ns.length || !Lf()) return esc(h);
    let out = esc(h); const rx = new RegExp('(^|[^\\w|])(' + ns.map(n => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\w|])', 'g'); return out.replace(rx, (_, a, n) => a + mn(n.replace(/&amp;/g, '&'))); };

  function render() { if (!open) return; charts = []; const tabs = Object.values(D.worlds), wid = view.w, rg = view.range;
    let h = `<div class="hd"><h3>🌊 The almanac</h3><span class="sub">the data lake: everything your worlds have kept</span><button data-x="1" title="close (Esc)">✕</button></div>`;
    h += `<div class="row">${tabs.map(w => `<button data-w="${esc(w.id)}" class="${wid === w.id ? 'on' : ''}">${w.kind === 'keep' ? '🏰' : '🏠'} ${esc(w.name)}</button>`).join('')}<button data-w="ocean" class="${wid === 'ocean' ? 'on' : ''}" title="every world together">🌊 all worlds (the ocean)</button>
      <span style="flex:1"></span>${Object.keys(RANGES).map(k => `<button data-r="${k}" class="${rg === k ? 'on' : ''}">${RANGES[k][0]}</button>`).join('')}</div>`;
    if (!tabs.length) { bx.innerHTML = h + '<div class="sub">nothing kept yet: the first sample comes about 20 seconds after the world loads, then one a minute.</div>'; return; }
    h += wid === 'ocean' ? ocean(rg) : one(D.worlds[wid] || tabs[0], rg);
    h += `<h4>research export</h4><div class="row"><span class="sub">raw history, saved on this computer (nothing is uploaded):</span><button data-ex="json">all as JSON</button><button data-ex="min">minutes CSV</button><button data-ex="hr">hours CSV</button><button data-ex="day">days CSV</button><button data-ex="ev">events CSV</button><button data-ex="members">members CSV</button></div>`;
    { const f5 = window.__first5 && window.__first5.statsLine(); if (f5) h += `<div class="sub" style="margin-top:6px">${esc(f5)}</div>`; }
    h += `<div class="sub" style="margin-top:6px">Kept: minutes for 2 days, hours for 90 days, days for good, the last 4,000 events per world (every event is still counted in its day). Time is real time. Stored in this browser (IndexedDB) and in snapshots; the disk copy updates once a minute.</div>`;
    const sc = bx.querySelector('.list.ev'), st = sc ? sc.scrollTop : 0, fq = document.activeElement && document.activeElement.matches && document.activeElement.matches('#almanac input[type=search]');
    bx.innerHTML = h; if (fq) { const i = bx.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } const sc2 = bx.querySelector('.list.ev'); if (sc2) sc2.scrollTop = st; }

  function one(w, rg) { const S = series(w, rg), pts = S.pts, span = RANGES[rg][1], t0 = now() - span, evs = w.ev.filter(e => e.t >= t0), days = w.day.filter(b => b.t >= dayOf(t0) || !isFinite(span));
    const nNow = pts.length ? pts[pts.length - 1].v[0] : null, nThen = pts.length ? pts[0].v[0] : null, joined = evs.filter(e => e.k === 'join').length, left = evs.filter(e => e.k === 'left').length;
    const moodD = days.filter(b => b.m[6] != null), best = moodD.slice().sort((a, b) => b.m[6] - a.m[6])[0], worst = moodD.slice().sort((a, b) => b.m[1] - a.m[1])[0];
    const cnt = k => days.reduce((s, b) => s + ((b.ev || {})[k] || 0), 0), arrow = (a, b) => a == null || b == null || a === b ? '' : a > b ? ' ↑' : ' ↓';
    let h = `<div class="sub">${esc(w.name)} · ${ageOf(w)} · kept since ${new Date(w.born).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${w.min.length} minute samples, ${w.hr.length} hours, ${w.day.length} days</div>`;
    h += `<div class="tiles" style="margin-top:8px"><div class="tile"><small>population now</small><b>${nNow ?? '–'}${arrow(nNow, nThen)}</b><small>${nThen != null ? 'was ' + nThen + ' at the start of the ' + RANGES[rg][0] : ''}</small></div>
      <div class="tile"><small>new members</small><b>${joined}</b><small>${left} left or went to rest</small></div>
      <div class="tile"><small>friendships made</small><b>${cnt('friend') + cnt('friendships')}</b><small>${cnt('theft')} thefts, ${cnt('hangry')} hangry</small></div>
      <div class="tile"><small>disasters · raves</small><b>${cnt('disaster')} · ${cnt('rave')}</b><small>${cnt('weather')} weather turns</small></div>
      <div class="tile"><small>best day (mood)</small><b>${best ? pct(best.m[6]) : '–'}</b><small>${best ? new Date(best.t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'needs a day of history'}${worst && worst !== best ? ' · most fearful ' + new Date(worst.t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</small></div></div>`;
    h += `<h4>population · per ${S.unit}</h4>` + line([{ name: 'population', c: 'var(--s1)', band: S.unit !== 'minute', pts: pts.map(p => ({ t: p.t, y: p.v[0], lo: p.lo && p.lo[0], hi: p.hi && p.hi[0] })) }], { unit: S.unit, h: 130 });
    h += `<h4>how they are doing · per ${S.unit}</h4><div class="grid2">` + ['fear', 'hunger', 'mood', 'friends', 'hurt', 'tired'].map(k => { const i = F.indexOf(k), last = pts.length ? pts[pts.length - 1].v[i] : null, avg = pts.length ? pts.reduce((s, p) => s + (p.v[i] || 0), 0) / pts.length : null;
      return `<div class="mini"><div class="t"><b>${LABEL[k]}</b><span class="sub">now ${pct(last)} · avg ${pct(avg)}</span></div>${line([{ name: LABEL[k], c: 'var(--s1)', pts: pts.map(p => ({ t: p.t, y: p.v[i] })) }], { unit: S.unit, pct: 1, h: 70, w: miniW() })}</div>`; }).join('') + '</div>';
    const joins = w.ev.filter(e => e.k === 'join' && e.t >= t0).slice(-12).reverse(), founders = Object.entries(w.members).filter(([, m]) => m.how === 'founder').length;
    h += `<h4>new members</h4><div class="list">${joins.map(e => `<div><small>${agoT(e.t)}</small>${e.h}${goBtn(e, w.id)}</div>`).join('') || `<div class="sub">no one new in this ${RANGES[rg][0]}. ${founders} founding members since the almanac began.</div>`}</div>`;
    const gz = w.ev.filter(e => e.k === 'gazette' && e.t >= t0), gs = gz.length > 8 ? gz.filter((_, i) => i % Math.ceil(gz.length / 8) === 0).slice(-8) : gz;
    h += `<h4>from the Id|le gazette ${gz.length ? '(' + gz.length + ' items, a sample)' : ''}</h4><div class="list">${gs.slice().reverse().map(e => `<div><small>${agoT(e.t)}</small>${linkNames(e.h.replace(/<[^>]+>/g, ''))}${goBtn(e, w.id)}</div>`).join('') || '<div class="sub">no news archived yet</div>'}</div>`;
    h += reelsAndRecords();
    const q = view.q.trim().toLowerCase(), list = evs.filter(e => !['gazette'].includes(e.k) && (!q || e.h.replace(/<[^>]+>/g, '').toLowerCase().includes(q) || e.k.includes(q))).slice(-80).reverse();
    h += `<h4>ripples: who did what</h4><div class="row"><input type="search" placeholder="filter by name or kind…" value="${esc(view.q)}"><span class="sub">${list.length} of ${evs.length} events in this ${RANGES[rg][0]}</span></div><div class="list ev" style="max-height:260px;overflow:auto">${list.map(e => `<div><small>${agoT(e.t)}</small>${e.h}${goBtn(e, w.id)}</div>`).join('') || '<div class="sub">nothing yet</div>'}</div>`;
    return h; }

  function reelsAndRecords() { const top = topReels(5); let h = `<h4>top reels</h4><div class="list">${top.map(({ r, s }) => `<div><button data-reel="${esc(r.id)}">▶</button> ${linkNames(r.title)} ${r.star ? '⭐' : ''} <small>${r.items.length} memories · ${D.plays[r.key] || 0} plays · score ${s}</small></div>`).join('') || '<div class="sub">no reels yet</div>'}</div>`;
    let st = null; try { st = A() && A().state(); } catch (e) {}
    if (st) { const rec = Object.entries(st.records || {}), fi = Object.entries(st.firsts || {}).sort((a, b) => a[1] - b[1]);
      const RN = { pop: 'most creatures at once', conga: 'longest conga line', count: 'biggest single count' };
      h += `<h4>records and firsts</h4><table><tr><th>record</th><th>best</th></tr>${rec.map(([k, v]) => `<tr><td>${esc(RN[k] || k)}</td><td><b>${v}</b></td></tr>`).join('') || '<tr><td colspan="2" class="sub">none yet</td></tr>'}</table>
        <div class="sub" style="margin-top:6px">firsts: ${fi.map(([k, t]) => `${esc(k.replace(/^disaster:/, 'first '))} <small>(${new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })})</small>`).join(' · ') || 'none yet'}</div>`; }
    return h; }

  function ocean(rg) { const ws = Object.values(D.worlds), cols = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'], span = RANGES[rg][1], t0 = now() - span;
    const lines = ws.slice(0, 4).map((w, i) => { const S = series(w, rg); return { name: w.name, c: cols[i], unit: S.unit, pts: S.pts.map(p => ({ t: p.t, y: p.v[0] })) }; });
    const unit = lines[0] ? lines[0].unit : 'minute', allEv = ws.flatMap(w => w.ev.filter(e => e.t >= t0).map(e => ({ ...e, w }))).sort((a, b) => a.t - b.t);
    const members = ws.reduce((s, w) => s + Object.keys(w.members).length, 0), here = ws.reduce((s, w) => s + Object.values(w.members).filter(m => m.here).length, 0);
    let h = `<div class="sub">The data ocean: every world's lake drains here. ${ws.length} worlds · ${members} creatures ever recorded, ${here} there at the last sample · since ${new Date(Math.min(...ws.map(w => w.born))).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>`;
    h += `<div class="tiles" style="margin-top:8px">${ws.map(w => { const last = w.min[w.min.length - 1]; return `<div class="tile"><small>${w.kind === 'keep' ? '🏰' : '🏠'} ${esc(w.name)}</small><b>${last ? last[1] : '–'}</b><small>${ageOf(w)} · ${w.ev.filter(e => e.t >= t0).length} events</small></div>`; }).join('')}</div>`;
    h += `<h4>population by world · per ${unit}</h4><div class="lg">${lines.map(l => `<span><i style="background:${l.c}"></i>${esc(l.name)}</span>`).join('')}</div>` + line(lines, { unit, h: 150, label: 1, right: 70 });
    h += `<h4>fear by world</h4>` + line(ws.slice(0, 4).map((w, i) => { const S = series(w, rg); return { name: w.name, c: cols[i], pts: S.pts.map(p => ({ t: p.t, y: p.v[1] })) }; }), { unit, pct: 1, h: 90, label: 1, right: 70 });
    const gz = allEv.filter(e => e.k === 'gazette').slice(-10).reverse();
    h += `<h4>the gazette, all worlds</h4><div class="list">${gz.map(e => `<div><small>${agoT(e.t)} · ${esc(e.w.name)}</small>${linkNames(e.h.replace(/<[^>]+>/g, ''))}</div>`).join('') || '<div class="sub">no news archived yet</div>'}</div>`;
    const joins = allEv.filter(e => e.k === 'join').slice(-10).reverse();
    h += `<h4>new members, all worlds</h4><div class="list">${joins.map(e => `<div><small>${agoT(e.t)} · ${esc(e.w.name)}</small>${e.h}</div>`).join('') || '<div class="sub">no one new in this range</div>'}</div>`;
    return h + reelsAndRecords(); }

  bx.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.x) show(false); else if (b.dataset.w) { view.w = b.dataset.w; render(); } else if (b.dataset.r) { view.range = b.dataset.r; render(); }
    else if (b.dataset.ex) { exportAs(b.dataset.ex); H().log('almanac_export', { kind: b.dataset.ex }); }
    else if (b.dataset.go) { const [x, y] = b.dataset.go.split(',').map(Number); show(false); H().flyTo(x, y, 1.3); }
    else if (b.dataset.reel) { show(false); try { window.__reels.play(b.dataset.reel); } catch (er) {} } });
  bx.addEventListener('input', e => { if (e.target.matches('input[type=search]')) { view.q = e.target.value; render(); } });

  window.__almanac = { show, sample, save, load, forSnap, merge, exportAs, data: () => D, world: id => D.worlds[id || placeId()] || null, ev, _fields: F };
})();
