// idle-trees.js: family trees and evolution lines (issue #13). Every creature gets a stable record of where it came from:
// its parent, its generation, when it was born and first seen, the genomes it has carried and what changed each time.
// Ancestry is read from what the game already writes into genome ids, never invented:
//   key-xxxxx        a genome made by mutate(); its `parent` field names the genome it was mutated from
//   …-cXYZ           a clone (cloneC appends -c + 3 chars to the id it copied): the creature that carried the prefix is its parent
//   …-m              a metamorphosis of the same creature (the same individual, not a child)
// When a link can't be read (a resident carrying the very first Crawly genome, a genome whose holder was never recorded), the
// creature is a root marked "unknown origin". The one exception: when several clones name the same genome, that genome certainly
// had a holder, so they share an "unrecorded ancestor" node (drawn with a dashed line). Gone and resting creatures stay in the tree.
// The registry lives in IndexedDB (window.__idle.kv), rides in snapshots and merges without ever dropping a record.
//   window.__trees: forSnap(), merge(x), toggle(on, uid), cardRow(c, el), records(), reconcile(), exportRows()
(() => {
  const H = () => window.__treeHooks; if (!H()) return;
  const KV = () => window.__idle && window.__idle.kv, KEY = 'lineage', POS = 'idle.treesPos', now = () => Date.now();
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const mn = n => window.__mnLink ? window.__mnLink(n) : `<b>${esc(n)}</b>`;
  // genes worth comparing (numbers, and a few switches); DRAW are the ones the body drawing needs
  const NUM = ['legs', 'l1', 'l2', 'bodyL', 'bodyW', 'speed', 'step', 'fidget', 'kick', 'palps', 'wander', 'social', 'timid', 'imgLove', 'hue', 'footHue', 'voicePitch', 'mTempo', 'mLoud', 'mDrums', 'mBass', 'mMelody', 'mrate', 'mburst'];
  const CAT = ['body', 'job', 'wings', 'abdomen', 'laser'], DRAW = ['legs', 'l1', 'l2', 'bodyL', 'bodyW', 'abdomen', 'hue', 'footHue', 'step', 'speed', 'palps', 'fidget', 'body', 'wings', 'laser', 'laserHue', 'kick', 'head', 'job'];
  const LABEL = Object.assign({ mTempo: 'favourite tempo', mLoud: 'loudness', mDrums: 'ear for drums', mBass: 'ear for bass', mMelody: 'ear for melody', mrate: 'thinking speed', mburst: 'burstiness', wings: 'wings' }, Object.fromEntries((H().TRAITS || []).map(([k, l]) => [k, l])));
  const G = g => { const o = {}; for (const k of NUM.concat(CAT, DRAW)) if (g && g[k] != null && typeof g[k] !== 'object') o[k] = g[k]; return o; };
  const strip = id => { id = String(id || ''); while (id.endsWith('-m')) id = id.slice(0, -2); return id; };
  const cloneOf = s => { const p = s.split('-'); return p.length >= 3 && /^c[0-9a-z]{3}$/.test(p[p.length - 1]) ? p.slice(0, -1).join('-') : null; };
  const baseKey = s => String(s || '').split('-')[0];

  // ---------- the store ----------
  let T = { v: 1, since: now(), cr: {}, maxGen: {}, great: 0 }, loaded = false;
  function mergeInto(dst, src) { if (!src || !src.cr) return 0; let n = 0; dst.since = Math.min(dst.since || now(), src.since || now());
    for (const [u, r] of Object.entries(src.cr)) { const e = dst.cr[u]; if (!e) { dst.cr[u] = JSON.parse(JSON.stringify(r)); n++; continue; }
      for (const id of r.ids || []) if (!e.ids.includes(id)) { e.ids.push(id); n++; } for (const nm of r.names || []) if (!e.names.includes(nm) && nm !== e.name) e.names.push(nm);
      e.born = Math.min(e.born || Infinity, r.born || Infinity); e.first = Math.min(e.first || Infinity, r.first || Infinity); if (e.pf0 == null && r.pf0 != null) e.pf0 = r.pf0;
      const ts = new Set((e.muts || []).map(m => m.t + m.to)); for (const m of r.muts || []) if (!ts.has(m.t + m.to)) { (e.muts = e.muts || []).push(m); n++; } e.muts.sort((a, b) => a.t - b.t);
      if (!e.birthGenes && r.birthGenes) e.birthGenes = r.birthGenes; if (r.told) e.told = 1; }
    for (const [f, g] of Object.entries(src.maxGen || {})) dst.maxGen[f] = Math.max(dst.maxGen[f] || 0, g); if (src.great) dst.great = dst.great || src.great; return n; }
  let saveT = 0; function save() { if (!loaded) return; clearTimeout(saveT); saveT = setTimeout(() => { try { const k = KV(); if (k) k.put(KEY, T).catch(() => {}); } catch (e) {} }, 300); }
  (async () => { try { const k = KV(); const st = k ? await k.get(KEY) : null; if (st) { const mem = T; T = { v: 1, since: st.since || now(), cr: {}, maxGen: {}, great: 0 }; mergeInto(T, st); mergeInto(T, mem); } } catch (e) {}
    if (window.__pendingTrees) { mergeInto(T, window.__pendingTrees); window.__pendingTrees = null; } loaded = true; setTimeout(reconcile, 2500); })();
  const forSnap = () => JSON.parse(JSON.stringify(T)), merge = x => { const n = mergeInto(T, x); if (n) { resolveAll(); save(); render(); } return n; };

  // ---------- seeing who is here (every 10 s): new creatures get a record, genome changes become mutations ----------
  function diff(a, b) { const out = []; a = a || {}; b = b || {};
    for (const k of NUM) { const x = a[k], y = b[k]; if (x == null || y == null || x === y) continue; const d = k.endsWith('ue') ? Math.min(Math.abs(x - y), 360 - Math.abs(x - y)) / 180 : Math.min(1, Math.abs(x - y) / Math.max(1e-6, (Math.abs(x) + Math.abs(y)) / 2)); if (d > 0.005) out.push([k, x, y, d]); }
    for (const k of CAT) if ((a[k] ?? null) !== (b[k] ?? null) && !(a[k] == null && !b[k]) && !(b[k] == null && !a[k])) out.push([k, a[k] ?? '–', b[k] ?? '–', 1]);
    return out.sort((p, q) => q[3] - p[3]); }
  const say1 = d => { if (!d) return ''; const [k, x, y] = d, L = LABEL[k] || k; if (CAT.includes(k)) return k === 'wings' ? (y ? 'grew wings' : 'lost its wings') : `${L}: ${x} → ${y}`; if (k.endsWith('ue')) return `${L} shifted`; const r = (y - x) / Math.max(1e-6, Math.abs(x)); return `${L} ${r > 0 ? '+' : ''}${Math.abs(r) < 10 ? Math.round(r * 100) + '%' : (+y).toFixed(2)}`; };
  function touch(uid, g, name, fam, born, o) { const t = now(); let R = T.cr[uid];
    if (!R) R = T.cr[uid] = { uid, name, names: [], fam, born: born || t, first: t, ids: [], genes: G(g), birthGenes: G(g), muts: [], place: o.place, main: o.main ? 1 : 0, pf0: g.parent ?? null };
    if (R.name !== name && name) { if (R.name && !R.names.includes(R.name)) R.names.push(R.name); R.name = name; }
    if (fam) R.fam = fam; R.here = o.here; R.rest = o.rest; R.place = o.place; R.gone = null; R.miss = 0;
    const id = g.id || ''; if (id && !R.ids.includes(id)) { if (R.ids.length) { const d = diff(R.genes, G(g)); R.muts.push({ t, from: R.ids[R.ids.length - 1], to: id, top: d.slice(0, 3).map(x => x.slice(0, 3)) }); if (R.muts.length > 40) R.muts.splice(0, R.muts.length - 40); } R.ids.push(id); }
    R.genes = G(g); R.dg = Object.fromEntries(DRAW.filter(k => g[k] != null && typeof g[k] !== 'object').map(k => [k, g[k]])); return R; }
  function reconcile() { const h = H(); if (!loaded || h.traveling()) return; const place = h.placeId(), t = now(), seen = new Set();
    for (const c of h.creatures()) { if (c.guest || c.lab || !c.g) continue; const uid = h.uidOf(c); seen.add(uid); touch(uid, c.g, c.name, h.famName(c), c.born, { here: 1, rest: 0, place, main: !c.visitor }); }
    for (const r of h.resting()) { if (!r || !r.uid || !r.genome) continue; seen.add(r.uid); touch(r.uid, r.genome, r.name, h.famNameG(r.genome), r.born, { here: 0, rest: 1, place }); }
    // the founders' earlier genomes (the studio's lineage list) are theirs too, oldest first, so clones and spawns of a template find them
    for (const [key, g] of Object.entries(h.genomes())) { const R = T.cr['main:' + key]; if (!R) continue; const old = [h.defaultId(key)].concat(h.lineage().filter(x => x.key === key && x.why !== 'keep').flatMap(x => [x.from, x.to])).filter(Boolean);
      for (const id of old) if (!R.ids.includes(id)) R.ids.unshift(id); if (g && g.id && !R.ids.includes(g.id)) R.ids.push(g.id); }
    for (const R of Object.values(T.cr)) { if (R.ghost || seen.has(R.uid) || R.gone) continue; if (R.place && R.place !== place) continue; R.miss = (R.miss || 0) + 1; if (R.miss >= 2) { R.gone = t; R.here = 0; R.rest = 0; } }
    resolveAll(); news(); save(); if (open) render(); }

  // ---------- reading the parents ----------
  let byStrip = new Map(), genMemo = new Map(), kids = new Map();
  function index() { byStrip = new Map(); for (const R of Object.values(T.cr)) for (const id of R.ids) { const s = strip(id); if (!byStrip.has(s)) byStrip.set(s, []); const a = byStrip.get(s); if (!a.includes(R)) a.push(R); } }
  function owner(gid, self) { const a = (byStrip.get(strip(gid)) || []).filter(R => R !== self); if (!a.length) return null;
    return a.sort((p, q) => (q.main - p.main) || ((p.ghost ? 1 : 0) - (q.ghost ? 1 : 0)) || ((p.born || 0) - (q.born || 0)))[0]; }
  function ghost(gid, pf, fam, born) { const s = strip(gid), uid = 'ghost:' + s; let R = T.cr[uid];
    if (!R) { R = T.cr[uid] = { uid, ghost: 1, name: 'an unrecorded ancestor', names: [], fam, born: born || now(), first: now(), ids: [s], genes: {}, muts: [], pf0: pf ?? null, here: 0, rest: 0, gone: 1 }; byStrip.set(s, (byStrip.get(s) || []).concat([R])); }
    R.born = Math.min(R.born, born || R.born); return R; }
  function resolve(R) { R.parent = null; R.pg = null;
    if (R.main) { R.origin = 'founder'; return; }
    if (R.ghost) { const o = R.pf0 && owner(R.pf0, R); R.origin = 'ghost'; if (o) { R.parent = o.uid; R.pg = R.pf0; } return; }
    const S = strip(R.ids[0] || ''), C = cloneOf(S);
    if (C) { const o = owner(C, R) || ghost(C, R.pf0, R.fam, R.born); R.parent = o.uid; R.origin = 'clone'; R.pg = C; return; }
    if (R.pf0) { const o = owner(R.pf0, R); R.pg = R.pf0; if (o) { R.parent = o.uid; R.origin = 'spawn'; } else R.origin = 'unknown'; return; }
    const k = baseKey(S); R.origin = k && k !== 'crawly' && k !== 'tok' ? 'founder' : 'unknown'; R.pg = S; }
  function gen(R, seen) { if (genMemo.has(R.uid)) return genMemo.get(R.uid); seen = seen || new Set(); if (seen.has(R.uid)) return 0; seen.add(R.uid);
    const P = R.parent && T.cr[R.parent], g = P ? gen(P, seen) + 1 : 0; genMemo.set(R.uid, g); return g; }
  function resolveAll() { index(); for (const R of Object.values(T.cr)) resolve(R); genMemo = new Map(); kids = new Map();
    for (const R of Object.values(T.cr)) { if (R.parent) { if (!kids.has(R.parent)) kids.set(R.parent, []); kids.get(R.parent).push(R); } }
    for (const a of kids.values()) a.sort((p, q) => (p.born || 0) - (q.born || 0));
    // a ghost takes the family of its children
    for (const R of Object.values(T.cr)) if (R.ghost) { const k = kids.get(R.uid); if (k && k.length) R.fam = k[0].fam; } }
  const childrenOf = R => kids.get(R.uid) || [], parentOf = R => R.parent ? T.cr[R.parent] : null;
  const alive = R => !R.ghost && !R.gone, status = R => R.ghost ? 'unrecorded' : R.gone ? 'gone' : R.rest ? 'resting' : 'here';
  const ORIGIN = { founder: 'a founder', clone: 'a clone', spawn: 'mutated from', unknown: 'unknown origin', ghost: 'known only from its children' };

  // ---------- news: a new deepest generation in a family, the first great-grandchild (only for creatures seen being born) ----------
  function news() { const recs = Object.values(T.cr).filter(R => !R.ghost);
    if (!T.newsInit) { for (const R of recs) { R.told = 1; T.maxGen[R.fam] = Math.max(T.maxGen[R.fam] || 0, gen(R)); } if (recs.some(R => gen(R) >= 3)) T.great = T.great || now(); T.newsInit = 1; return; }   // what was here before the trees existed is history, not news
    for (const R of recs) { if (R.told) continue; R.told = 1; const g = gen(R); if (g > (T.maxGen[R.fam] || 0)) { T.maxGen[R.fam] = g; H().logEvent('lineage', { kind: 'gen', gen: g, who: R.name, fam: R.fam }); }
      if (g >= 3 && !T.great) { T.great = now(); let a = R; for (let i = 0; i < 3 && a; i++) a = parentOf(a); H().logEvent('lineage', { kind: 'great', who: R.name, anc: a && !a.ghost ? a.name : '' }); } } }

  // ---------- the window ----------
  const css = document.createElement('style'); css.textContent = `
#trees{position:fixed;right:16px;top:56px;z-index:9996;display:none;width:min(620px,calc(100vw - 32px));max-height:80vh;overflow:auto;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:12px;padding:8px 10px;box-shadow:0 8px 28px #0006;font:12px system-ui;box-sizing:border-box}
#trees.on{display:block}#trees .hd{display:flex;justify-content:space-between;align-items:center;margin:-8px -10px 4px;padding:8px 10px 6px;position:sticky;top:-8px;z-index:3;background:var(--floor);border-bottom:1px solid #8883;cursor:grab;user-select:none;touch-action:none}#trees.drag .hd{cursor:grabbing}
#trees .hd b{font-size:13px}#trees button,#trees select{font:inherit;font-size:12px;padding:2px 8px;border-radius:8px;border:1px solid #8886;background:none;color:inherit;cursor:pointer}#trees .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}
#trees .sub{opacity:.7;font-size:11px}#trees .cvw{position:relative;border:1px solid #8884;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--floor) 92%,#8881);touch-action:none}#trees canvas{display:block;width:100%;height:340px;cursor:grab}
#trees .tip{position:absolute;pointer-events:none;display:none;max-width:240px;background:var(--floor);border:1px solid #8886;border-radius:8px;padding:5px 7px;font-size:11px;line-height:1.4;box-shadow:0 4px 14px #0004;z-index:2}
#trees h4{margin:8px 0 3px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}#trees .hl div{margin:2px 0;line-height:1.45}#trees .sel{border-left:3px solid #2b5cff;padding-left:6px;margin:6px 0}
#trees .zoomb{position:absolute;right:6px;top:6px;display:flex;gap:3px}#trees .zoomb button{padding:0 7px;background:var(--floor)}
#cfamily{font-size:11px;margin:0 2px 6px;max-width:350px;line-height:1.5}#cfamily:empty{display:none}#whisper:not(.ct-friends) #cfamily,#whisper.mind #cfamily{display:none}#cfamily button{font:11px system-ui;padding:0 7px;border:1px solid #8886;border-radius:9px;background:transparent;color:inherit;cursor:pointer}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'trees'; document.body.appendChild(el);
  const btn = document.createElement('button'); btn.id = 'treesBtn'; btn.title = 'family trees: who descends from whom, generation by generation'; btn.textContent = '🌳';
  let open = false, fam = null, focus = null, picked = null, geneK = 'social'; try { open = localStorage.getItem('idle.treesOpen') === '1'; fam = localStorage.getItem('idle.treesFam'); } catch (e) {}
  const mountBtn = () => { if (btn.isConnected) return; const a = document.getElementById('drawerBtn') || document.getElementById('ntfBtn') || document.getElementById('advBtn'); if (a) { a.after(btn, ' '); render(); } else setTimeout(mountBtn, 500); };
  if (document.readyState === 'complete') mountBtn(); else addEventListener('load', mountBtn);
  btn.addEventListener('click', () => toggle());
  function toggle(on, uid) { open = on ?? !open; if (uid && T.cr[uid]) { focus = uid; picked = uid; fam = T.cr[uid].fam; view.fit = true; } try { localStorage.setItem('idle.treesOpen', open ? '1' : '0'); } catch (e) {} if (open) { reconcile(); } render(); }
  { const fit = (x, y) => [Math.max(0, Math.min(innerWidth - 120, x)), Math.max(0, Math.min(innerHeight - 40, y))];
    const placeAt = (x, y) => { [x, y] = fit(x, y); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.maxHeight = Math.max(200, Math.min(innerHeight * 0.8, innerHeight - y - 12)) + 'px'; };
    try { const p = JSON.parse(localStorage.getItem(POS) || 'null'); if (p) placeAt(p.x, p.y); } catch (e) {}
    addEventListener('resize', () => { if (el.style.left) placeAt(parseFloat(el.style.left), parseFloat(el.style.top)); });
    el.addEventListener('pointerdown', e => { const hd = e.target.closest('.hd'); if (!hd || e.target.closest('button, select, input') || e.button) return; const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; el.classList.add('drag'); hd.setPointerCapture(e.pointerId); e.preventDefault();
      const mv = ev => placeAt(ev.clientX - dx, ev.clientY - dy), up = () => { el.classList.remove('drag'); hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); try { localStorage.setItem(POS, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch (err) {} };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up); }); }

  // families and the trees that touch them: every root whose descendants include a member of the family
  function families() { const f = {}; for (const R of Object.values(T.cr)) if (!R.ghost) f[R.fam || 'kin'] = (f[R.fam || 'kin'] || 0) + 1; return Object.entries(f).sort((a, b) => b[1] - a[1]); }
  const rootOf = R => { const s = new Set(); while (R.parent && T.cr[R.parent] && !s.has(R.uid)) { s.add(R.uid); R = T.cr[R.parent]; } return R; };
  function forest(f) { const roots = new Set(); for (const R of Object.values(T.cr)) if (!R.ghost && (R.fam || 'kin') === f) roots.add(rootOf(R)); return [...roots].sort((a, b) => (b.main - a.main) || (size(b) - size(a)) || (a.born - b.born)); }
  const size = R => 1 + childrenOf(R).reduce((n, k) => n + size(k), 0);
  // layout: generations in rows, leaves side by side, parents centred over their children
  const COLW = 74, ROWH = 96;
  // a big brood of leaves (clones, mostly) wraps into a block of rows under its parent instead of one endless row
  function layout(roots) { const P = new Map(); let x = 0;
    const place = (R, y, seen) => { if (seen.has(R.uid)) return; seen.add(R.uid); const ks = childrenOf(R).filter(k => !seen.has(k.uid)); if (!ks.length) { P.set(R.uid, { R, x: x++ * COLW, y }); return; }
      const leaves = ks.filter(k => !childrenOf(k).length), deep = ks.filter(k => childrenOf(k).length);
      if (leaves.length > 6) { deep.forEach(k => place(k, y + ROWH, seen)); const cols = Math.min(8, Math.ceil(Math.sqrt(leaves.length * 2.2))), x0 = x;
        leaves.forEach((k, i) => { seen.add(k.uid); P.set(k.uid, { R: k, x: (x0 + i % cols) * COLW, y: y + ROWH + Math.floor(i / cols) * 74, wrap: 1 }); }); x += cols; }
      else ks.forEach(k => place(k, y + ROWH, seen));
      const xs = ks.map(k => P.get(k.uid)).filter(Boolean).map(p => p.x); P.set(R.uid, { R, x: (Math.min(...xs) + Math.max(...xs)) / 2, y }); };
    const seen = new Set(); roots.forEach(r => { place(r, 0, seen); x += 0.6; }); return P; }
  // highlights: founders, longest line, most prolific parent, extinct branches, a gene's drift per generation
  function deepest(R, seen = new Set()) { if (seen.has(R.uid)) return [R]; seen.add(R.uid); let best = [];
    for (const k of childrenOf(R)) { const p = deepest(k, seen); if (p.length > best.length) best = p; } return [R].concat(best); }
  const allDown = R => { const out = [], st = [R], s = new Set(); while (st.length) { const x = st.pop(); if (s.has(x.uid)) continue; s.add(x.uid); out.push(x); st.push(...childrenOf(x)); } return out; };
  function stats(roots) { const mem = roots.flatMap(allDown), real = mem.filter(R => !R.ghost);
    const line = roots.map(r => deepest(r)).sort((a, b) => b.length - a.length)[0] || [];
    const prol = real.map(R => [R, childrenOf(R).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    const extinct = mem.filter(R => { const P = parentOf(R); return P && allDown(R).every(x => !alive(x)) && allDown(P).some(alive); });
    const byGen = {}; for (const R of real) { const v = R.genes && R.genes[geneK]; if (typeof v !== 'number') continue; const g = gen(R); (byGen[g] = byGen[g] || []).push(v); }
    return { mem, real, line: line.filter(R => !R.ghost), prol, extinct, byGen }; }
  const spark = (vals, w = 150, h = 28) => { if (vals.length < 2) return ''; const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1; const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v - lo) / sp * (h - 6)).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" style="vertical-align:middle"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/>${vals.map((v, i) => `<circle cx="${(i / (vals.length - 1) * (w - 4) + 2).toFixed(1)}" cy="${(h - 3 - (v - lo) / sp * (h - 6)).toFixed(1)}" r="2" fill="currentColor"/>`).join('')}</svg>`; };
  const fmt = v => typeof v === 'number' ? (Math.abs(v) >= 10 ? Math.round(v) : (+v).toFixed(2)) : esc(v);
  const nameOf = R => R.ghost ? '<i>an unrecorded ancestor</i>' : mn(R.name);

  // portraits: each genome drawn once into a small canvas (the same drawing the world uses), cached
  const pcache = new Map();
  function portrait(R) { const k = R.uid + '|' + (R.ids[R.ids.length - 1] || '') + '|' + (H().isDark() ? 1 : 0); if (pcache.has(k)) return pcache.get(k);
    const S = 96, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    if (!R.ghost && R.dg) { try { const gg = { ...R.dg }; const c = { name: R.name, g: gg, size: 1, x: 0, y: 0, heading: -0.5, vx: 0, vy: 0, state: 'idle', phase: 1, nextFidget: 0, hideT: 0, dashUntil: 0, held: false, legs: [] }; H().buildLegs(c);
      const L = (gg.l1 || 30) + (gg.l2 || 30) + (gg.bodyL || 20), s = Math.max(0.45, Math.min(1.5, 70 / L)); g.setTransform(s, 0, 0, s, S / 2, S / 2 + 6); H().drawTo(g, c, 1000); } catch (e) { g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.arc(S / 2, S / 2, 18, 0, 7); g.fillStyle = `hsl(${R.dg.hue || 200},65%,60%)`; g.fill(); } }
    if (pcache.size > 600) pcache.clear(); pcache.set(k, cv); return cv; }

  const view = { x: 0, y: 0, z: 1, fit: true }; let lay = null, cv = null, tip = null, drawQ = 0;
  function render() { btn.classList.toggle('on', open); el.classList.toggle('on', open); if (!open || el.classList.contains('drag')) return;
    const fs = families(); if (!fam || !fs.some(f => f[0] === fam)) fam = fs[0] ? fs[0][0] : null; try { localStorage.setItem('idle.treesFam', fam || ''); } catch (e) {}
    const roots = fam ? forest(fam) : [], S = stats(roots), numGenes = NUM.filter(k => S.real.some(R => typeof (R.genes || {})[k] === 'number'));
    if (!numGenes.includes(geneK)) geneK = numGenes[0] || 'social';
    const gens = Object.keys(S.byGen).map(Number).sort((a, b) => a - b), avg = gens.map(g => S.byGen[g].reduce((a, b) => a + b, 0) / S.byGen[g].length);
    const lineV = S.line.map(R => (R.genes || {})[geneK]).filter(v => typeof v === 'number'), P = picked && T.cr[picked];
    el.innerHTML = `<div class="hd"><b>🌳 family trees</b><span><button data-t="x" title="close">✕</button></span></div>
<div class="row"><select data-t="fam">${fs.map(([f, n]) => `<option value="${esc(f)}" ${f === fam ? 'selected' : ''}>${esc(f)} (${n})</option>`).join('')}</select><span class="sub">${(fs.find(f => f[0] === fam) || [0, 0])[1]} ${esc(fam || '')} in ${roots.length} tree${roots.length === 1 ? '' : 's'} (${S.real.length} creatures in those trees) · ${gens.length ? 'generations 0–' + gens[gens.length - 1] : ''}</span></div>
<div class="cvw"><canvas></canvas><div class="tip"></div><div class="zoomb"><button data-t="zin" title="zoom in">+</button><button data-t="zout" title="zoom out">−</button><button data-t="fit" title="fit the whole tree">⤢</button></div></div>
<div class="sub">★ founder · <b>?</b> unknown origin · faded: gone · 💤 resting · dashed: an ancestor known only from its children's ids · the label on a line: the gene that differs most from the parent · drag to pan, wheel to zoom, click a creature</div>
${P ? `<div class="sel">${selHTML(P)}</div>` : ''}
<h4>highlights</h4><div class="hl">
<div>★ <b>founders</b>: ${roots.filter(r => !r.ghost).slice(0, 8).map(r => nameOf(r) + (r.origin === 'unknown' ? ' <span class="sub">(unknown origin)</span>' : '')).join(', ') || '–'}${roots.length > 8 ? ' …' : ''}</div>
<div>📏 <b>longest line</b> (${S.line.length} generation${S.line.length === 1 ? '' : 's'}): ${S.line.map(nameOf).join(' → ') || '–'}</div>
<div>🍼 <b>most children</b>: ${S.prol ? nameOf(S.prol[0]) + ` (${S.prol[1]})` : 'nobody has had children yet'}</div>
<div>🕯 <b>extinct branches</b>: ${S.extinct.length ? S.extinct.slice(0, 6).map(R => nameOf(R) + ` <span class="sub">(${allDown(R).filter(x => !x.ghost).length})</span>`).join(', ') : 'none: every branch still has someone here or resting'}</div>
<div>🧬 <b>drift</b> <select data-t="gene">${numGenes.map(k => `<option value="${k}" ${k === geneK ? 'selected' : ''}>${esc(LABEL[k] || k)}</option>`).join('')}</select> average per generation ${spark(avg)} ${avg.map((v, i) => `<span class="sub">g${gens[i]}</span> ${fmt(v)}`).join(' · ')}${lineV.length > 1 ? `<br><span class="sub">down the longest line</span> ${spark(lineV)} ${lineV.map(fmt).join(' → ')}` : ''}</div></div>
<div class="row" style="margin-top:8px"><button data-t="csv">⬇ CSV</button><button data-t="json">⬇ JSON</button><span class="sub">every creature ever recorded: id, parent, generation, genes</span></div>`;
    cv = el.querySelector('canvas'); tip = el.querySelector('.tip'); lay = layout(roots); if (view.fit) { fitView(); view.fit = false; } if (focus) { const p = lay.get(focus); if (p) { const r = cv.getBoundingClientRect(); view.x = r.width / 2 - p.x * view.z; view.y = r.height / 2 - p.y * view.z; } focus = null; } draw(); }
  function selHTML(R) { const P = parentOf(R), ks = childrenOf(R), d = P && P.genes ? diff(P.genes, R.birthGenes || R.genes) : [];
    return `${R.ghost ? '<b>an unrecorded ancestor</b>' : mn(R.name)}${R.names.length ? ` <span class="sub">(once ${R.names.slice(-3).map(esc).join(', ')})</span>` : ''} · <b>generation ${gen(R)}</b> · ${esc(ORIGIN[R.origin] || R.origin)}${P ? ' ' + (R.origin === 'clone' ? 'of ' : R.origin === 'spawn' ? '' : '') + nameOf(P) : ''} · ${status(R)}<br>
<span class="sub">${R.ghost ? `its genome ${esc(R.ids[0])} is named by ${ks.length} clone${ks.length === 1 ? '' : 's'}, but nobody recorded who carried it` : `born ${new Date(R.born).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${R.gone && R.gone !== 1 ? ' · gone since ' + new Date(R.gone).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''} · genome ${esc(R.ids[R.ids.length - 1] || '')}`}${R.origin === 'unknown' && R.pg ? ` · carries genome ${esc(R.pg)}; how it got here was never recorded` : ''}</span>
${d.length ? `<br>differs from its parent: ${d.slice(0, 4).map(say1).map(esc).join(', ')}` : ''}${(R.muts || []).length ? `<br>changed ${R.muts.length}× since: ${R.muts.slice(-3).map(m => m.top.length ? esc(say1(m.top[0])) : 'a small change').join(', ')}` : ''}
${ks.length ? `<br>children (${ks.length}): ${ks.slice(0, 12).map(nameOf).join(', ')}${ks.length > 12 ? ' …' : ''}` : ''}`; }
  function fitView() { if (!lay || !cv) return; const r = cv.getBoundingClientRect(), ps = [...lay.values()]; if (!ps.length) return; const x0 = Math.min(...ps.map(p => p.x)) - 40, x1 = Math.max(...ps.map(p => p.x)) + 40, y0 = -40, y1 = Math.max(...ps.map(p => p.y)) + 60;
    view.z = Math.max(0.25, Math.min(1.4, Math.min(r.width / (x1 - x0), r.height / (y1 - y0)))); view.x = (r.width - (x1 + x0) * view.z) / 2; view.y = (r.height - (y1 + y0) * view.z) / 2; }
  function draw() { if (!cv || !lay) return; const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); const g = cv.getContext('2d'), dark = H().isDark(), ink = dark ? '#ddd' : '#333';
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); g.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    // generation rows
    const maxY = Math.max(0, ...[...lay.values()].map(p => p.y)); void maxY;
    for (const p of lay.values()) { const P = p.R.parent && lay.get(p.R.parent); if (!P) continue; g.strokeStyle = dark ? '#fff6' : '#0005'; g.lineWidth = 1.4 / Math.max(0.6, view.z); g.setLineDash(P.R.ghost ? [5, 4] : []); g.beginPath(); if (p.wrap) { const top = P.y + ROWH - 44; g.moveTo(P.x, P.y + 26); g.lineTo(P.x, top); g.lineTo(p.x, top); g.lineTo(p.x, p.y - 26); } else { g.moveTo(P.x, P.y + 26); g.bezierCurveTo(P.x, P.y + 60, p.x, p.y - 50, p.x, p.y - 26); } g.stroke(); g.setLineDash([]);
      if (view.z > 0.7 && !P.R.ghost && P.R.genes) { const d = diff(P.R.genes, p.R.birthGenes || p.R.genes)[0]; if (d) { g.fillStyle = dark ? '#9ab8ff' : '#2b5cff'; g.font = '9px system-ui'; g.textAlign = 'center'; g.fillText(say1(d).slice(0, 22), p.wrap ? p.x : (P.x + p.x) / 2, p.wrap ? p.y - 30 : (P.y + p.y) / 2 + 4); } } }
    for (const p of lay.values()) { const R = p.R; g.globalAlpha = R.ghost ? 0.5 : R.gone ? 0.35 : 1;
      g.beginPath(); g.arc(p.x, p.y, 24, 0, 7); g.fillStyle = dark ? '#2a2a33' : '#fff'; g.fill(); g.lineWidth = (R.uid === picked ? 3 : 1) / Math.max(0.6, view.z); g.strokeStyle = R.uid === picked ? '#2b5cff' : (dark ? '#fff5' : '#0004'); g.setLineDash(R.ghost ? [4, 3] : []); g.stroke(); g.setLineDash([]);
      if (R.ghost) { g.fillStyle = ink; g.font = '16px system-ui'; g.textAlign = 'center'; g.fillText('?', p.x, p.y + 6); } else { g.save(); g.beginPath(); g.arc(p.x, p.y, 23, 0, 7); g.clip(); g.drawImage(portrait(R), p.x - 30, p.y - 30, 60, 60); g.restore(); }
      g.fillStyle = ink; g.font = (R.main ? '600 ' : '') + '10px system-ui'; g.textAlign = 'center'; if (view.z > 0.45) g.fillText((R.origin === 'founder' ? '★ ' : R.origin === 'unknown' ? '? ' : '') + (R.ghost ? 'unrecorded' : String(R.name).slice(0, 13)) + (R.rest ? ' 💤' : ''), p.x, p.y + 38);
      g.globalAlpha = 1; } }
  const hit = (ex, ey) => { if (!lay || !cv) return null; const r = cv.getBoundingClientRect(), x = (ex - r.left - view.x) / view.z, y = (ey - r.top - view.y) / view.z; for (const p of lay.values()) if (Math.hypot(p.x - x, p.y - y) < 26) return p.R; return null; };
  el.addEventListener('pointerdown', e => { if (!e.target.matches('canvas') || e.button) return; const sx = e.clientX, sy = e.clientY, vx = view.x, vy = view.y; let moved = false; e.target.setPointerCapture(e.pointerId);
    const mv = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; view.x = vx + dx; view.y = vy + dy; cancelAnimationFrame(drawQ); drawQ = requestAnimationFrame(draw); };
    const up = ev => { e.target.removeEventListener('pointermove', mv); e.target.removeEventListener('pointerup', up); if (!moved) { const R = hit(ev.clientX, ev.clientY); picked = R ? R.uid : null; if (R && !R.ghost && R.here) openCard(R.name); render(); } };
    e.target.addEventListener('pointermove', mv); e.target.addEventListener('pointerup', up); });
  el.addEventListener('wheel', e => { if (!e.target.matches('canvas')) return; e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.exp(-e.deltaY * 0.0015), z = Math.max(0.2, Math.min(2.5, view.z * k)); view.x = mx - (mx - view.x) * z / view.z; view.y = my - (my - view.y) * z / view.z; view.z = z; cancelAnimationFrame(drawQ); drawQ = requestAnimationFrame(draw); }, { passive: false });
  el.addEventListener('pointermove', e => { if (!tip || !e.target.matches('canvas') || e.buttons) { if (tip) tip.style.display = 'none'; return; } const R = hit(e.clientX, e.clientY); if (!R) { tip.style.display = 'none'; return; } const r = el.querySelector('.cvw').getBoundingClientRect(), P = parentOf(R), d = P && P.genes ? diff(P.genes, R.birthGenes || R.genes)[0] : null;
    tip.innerHTML = `<b>${R.ghost ? 'an unrecorded ancestor' : esc(R.name)}</b> · gen ${gen(R)} · ${esc(status(R))}<br>${esc(ORIGIN[R.origin] || '')}${P && !P.ghost ? ' ' + esc(P.name) : ''}${d ? '<br>' + esc(say1(d)) : ''}${childrenOf(R).length ? '<br>' + childrenOf(R).length + ' children' : ''}`;
    tip.style.display = 'block'; tip.style.left = Math.min(r.width - 200, e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px'; });
  el.addEventListener('pointerleave', () => { if (tip) tip.style.display = 'none'; });
  el.addEventListener('change', e => { const t = e.target.dataset.t; if (t === 'fam') { fam = e.target.value; picked = null; view.fit = true; render(); } else if (t === 'gene') { geneK = e.target.value; render(); } });
  el.addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (!b) return; const t = b.dataset.t;
    if (t === 'x') toggle(false); else if (t === 'fit') { fitView(); draw(); } else if (t === 'zin' || t === 'zout') { const r = cv.getBoundingClientRect(), k = t === 'zin' ? 1.25 : 0.8, z = Math.max(0.2, Math.min(2.5, view.z * k)); view.x = r.width / 2 - (r.width / 2 - view.x) * z / view.z; view.y = r.height / 2 - (r.height / 2 - view.y) * z / view.z; view.z = z; draw(); }
    else if (t === 'csv' || t === 'json') exportFile(t); });
  // a click on a name opens its card the way every mention does
  function openCard(name) { const a = document.createElement('a'); a.className = 'mn'; a.dataset.n = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); }

  // ---------- research export ----------
  function exportRows() { const recs = Object.values(T.cr), keys = NUM.concat(CAT);
    const head = ['uid', 'name', 'other_names', 'family', 'origin', 'parent_uid', 'parent_name', 'generation', 'status', 'born', 'first_seen', 'gone', 'genomes', 'changes'].concat(keys);
    const iso = t => t && t > 1 ? new Date(t).toISOString() : '';
    return [head].concat(recs.map(R => { const P = parentOf(R); return [R.uid, R.ghost ? '' : R.name, R.names.join(' / '), R.fam || '', R.origin || '', R.parent || '', P ? (P.ghost ? '(unrecorded)' : P.name) : '', gen(R), status(R), iso(R.born), iso(R.first), iso(R.gone), R.ids.join(' '), (R.muts || []).length].concat(keys.map(k => (R.genes || {})[k] ?? '')); })); }
  function exportFile(kind) { const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const body = kind === 'json' ? JSON.stringify({ exported: d.toISOString(), note: 'Id|le lineage: one record per creature ever seen; parent links read from genome ids (see idle-trees.js)', records: Object.values(T.cr).map(R => ({ ...R, generation: gen(R) })) }, null, 1)
      : exportRows().map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: kind === 'json' ? 'application/json' : 'text/csv' })); a.download = `idle-lineage-${stamp}.${kind}`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

  // ---------- the card: a family line in the friends tab ----------
  function cardRow(c, box) { if (!box) return; const h = H(); if (!c || c.guest || c.lab) { box.innerHTML = ''; return; } const R = T.cr[h.uidOf(c)]; if (!R) { box.innerHTML = ''; return; }
    const P = parentOf(R), ks = childrenOf(R), sib = P ? childrenOf(P).filter(x => x !== R) : [];
    box.innerHTML = `🌳 <b>family</b> · ${esc(R.fam || '')} · generation ${gen(R)} · ${esc(ORIGIN[R.origin] || '')}${P ? (R.origin === 'clone' ? ' of ' : ' ') + nameOf(P) : ''}${ks.length ? ` · children: ${ks.slice(0, 6).map(nameOf).join(', ')}${ks.length > 6 ? ` +${ks.length - 6}` : ''}` : ''}${sib.length ? ` · ${sib.length} sibling${sib.length === 1 ? '' : 's'}` : ''} <button data-tree="${esc(R.uid)}" title="open its family tree">↗ tree</button>`; }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#cfamily [data-tree]'); if (!b) return; toggle(true, b.dataset.tree); });

  setInterval(reconcile, 10000);
  window.__trees = { forSnap, merge, toggle, cardRow, reconcile, exportRows, records: () => T.cr, gen: uid => T.cr[uid] ? gen(T.cr[uid]) : null, stats: f => stats(forest(f || fam)), families };
})();
