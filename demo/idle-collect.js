// idle-collect.js: your drawer (issue #29). Keep a copy of anything you like: a chart, a design, a picture, a page piece, a word,
// a creature's portrait (with its genes and a few lines of its diary), a reel with its replays, a building, a Gazette item.
// Keeping makes a COPY: the original stays in the world (creatures can still eat, break or rework it), the copy is yours.
// The 🗄 window shows them by kind and in collections you name (drag a thing onto a collection), with a large view, a note,
// "place a copy back in the world", export (PNG, SVG for charts, JSON, text) and remove (with undo; removed things wait in
// "removed" and can be put back). Everything lives in IndexedDB (window.__idle.kv, served or static), shared by every world,
// rides along in snapshots and merges in without ever losing anything. Creatures whose work you keep feel it (like a pin).
//   window.__collect: keepObj(o), keepCreature(c), keepReel(r), keepBuilding(sid), keepNote(t), forSnap(), merge(x), clipIds(), toggle(on)
(() => {
  const H = () => window.__collectHooks; if (!H()) return;
  const KV = () => window.__idle && window.__idle.kv, KEY = 'collection', POS = 'idle.drawerPos', now = () => Date.now();
  const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const names = h => (window.__linkNames ? window.__linkNames(h) : h);
  const uid = () => 'k' + now().toString(36) + Math.random().toString(36).slice(2, 6);
  const KINDS = { chart: ['📈', 'charts'], design: ['🧩', 'designs'], image: ['🖼', 'pictures'], ui: ['🔲', 'page pieces'], word: ['🔤', 'words'], creature: ['🐛', 'portraits'], reel: ['🎞', 'reels'], building: ['🏠', 'buildings'], gazette: ['📰', 'Gazette'] };
  const ONE = { chart: 'chart', design: 'design', image: 'picture', ui: 'page piece', word: 'word', creature: 'portrait', reel: 'reel', building: 'building', gazette: 'Gazette clipping' };

  // ---------- the store: { items, shelves, trash }, kept in IndexedDB; snapshots carry it too ----------
  let C = { v: 1, items: [], shelves: [], trash: [] }, loaded = false;
  const sig = it => it.kind + '|' + (it.src || '');
  function mergeInto(dst, src) { if (!src) return 0; let n = 0; const ids = new Set(dst.items.map(x => x.id)), gone = new Set(dst.trash.map(x => x.id));
    for (const it of src.items || []) { if (!it || !it.id) continue; if (gone.has(it.id)) continue; if (!ids.has(it.id)) { dst.items.push(JSON.parse(JSON.stringify(it))); ids.add(it.id); n++; continue; }
      const ex = dst.items.find(x => x.id === it.id); if (ex.lite && !it.lite && it.data) { ex.data = JSON.parse(JSON.stringify(it.data)); ex.lite = false; } if (!ex.note && it.note) ex.note = it.note; if (!ex.shelf && it.shelf) ex.shelf = it.shelf; if (!ex.thumb && it.thumb) ex.thumb = it.thumb; }   // a lite copy never replaces a full one
    for (const s of src.shelves || []) if (s && s.id && !dst.shelves.some(x => x.id === s.id)) dst.shelves.push({ ...s });
    for (const it of src.trash || []) if (it && it.id && !gone.has(it.id) && !ids.has(it.id)) { dst.trash.push(JSON.parse(JSON.stringify(it))); gone.add(it.id); }
    dst.items.sort((a, b) => a.t - b.t); return n; }
  let saveT = 0; function save() { if (!loaded) return; clearTimeout(saveT); saveT = setTimeout(() => { try { const k = KV(); if (k) k.put(KEY, C).catch(() => {}); } catch (e) {} }, 200); }
  (async () => { try { const k = KV(); const st = k ? await k.get(KEY) : null; if (st) { const mem = C; C = { v: 1, items: [], shelves: [], trash: [] }; mergeInto(C, st); mergeInto(C, mem); } } catch (e) {} if (window.__pendingCollect) { mergeInto(C, window.__pendingCollect); window.__pendingCollect = null; } loaded = true; feedClips(); save(); render(); })();
  // the replays inside kept reels go back into the replay store (where they are never let go: see Replay.refs)
  function feedClips() { const R = H().replay(); if (!R) return; const all = []; for (const it of C.items) if (it.kind === 'reel' && it.data && Array.isArray(it.data.clips)) all.push(...it.data.clips.filter(Boolean)); if (all.length) try { R.merge(all); } catch (e) {} }
  function clipIds() { const s = new Set(); for (const it of C.items) if (it.kind === 'reel' && it.data && it.data.reel) for (const x of it.data.reel.items || []) if (x.clip) s.add(x.clip); return [...s]; }
  // snapshots: everything, unless it is huge; then big pictures travel as their thumbnail only (the full copy stays in this browser)
  function forSnap() { const strip = it => it.kind === 'reel' && it.data ? { ...it, data: { ...it.data, clips: null } } : it;   // the reel's replays travel with the snapshot's clips
    let items = C.items.map(strip), size = JSON.stringify(items).length;
    if (size > 2.5e6) items = items.map(it => { const n = JSON.stringify(it).length; return n > 60000 ? { ...it, data: null, lite: true } : it; });
    return { v: 1, items, shelves: C.shelves, trash: C.trash.map(it => ({ id: it.id, kind: it.kind, title: it.title, t: it.t, gone: it.gone, lite: true })) }; }
  function merge(x) { const n = mergeInto(C, x); if (n) { feedClips(); save(); render(); } return n; }

  // ---------- pictures: any rendered element to a PNG (its computed styles inlined into an SVG foreignObject) ----------
  const STY = ['display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'margin', 'padding', 'border', 'border-radius', 'background', 'background-color', 'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'white-space', 'overflow', 'opacity', 'box-shadow', 'flex', 'flex-direction', 'flex-wrap', 'gap', 'align-items', 'justify-content', 'grid-template-columns', 'grid-gap', 'list-style', 'vertical-align', 'object-fit', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'text-anchor', 'dominant-baseline', 'transform', 'filter', 'text-decoration', 'outline'];
  function inlined(src) { const clone = src.cloneNode(true), a = [src, ...src.querySelectorAll('*')], b = [clone, ...clone.querySelectorAll('*')];
    a.forEach((el, i) => { const cs = getComputedStyle(el); b[i].setAttribute('style', STY.map(p => { const v = cs.getPropertyValue(p); return v ? `${p}:${v}` : ''; }).filter(Boolean).join(';')); }); return clone; }
  const stage = (() => { let st = null; return () => { if (!st) { st = document.createElement('div'); st.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;opacity:1;z-index:-1'; document.body.appendChild(st); } return st; }; })();
  function rasterize(el, scale, bg) { return new Promise(res => { try { const r = el.getBoundingClientRect(), w = Math.max(1, Math.ceil(r.width)), h = Math.max(1, Math.ceil(r.height)), cl = inlined(el); cl.style.margin = '0'; cl.style.transform = 'none';
      cl.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${new XMLSerializer().serializeToString(cl)}</foreignObject></svg>`;
      const img = new Image(); img.onload = () => { try { const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale); const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); } g.scale(scale, scale); g.drawImage(img, 0, 0); res(c); } catch (e) { res(null); } }; img.onerror = () => res(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); } catch (e) { res(null); } }); }
  const floorBg = () => getComputedStyle(document.body).getPropertyValue('--floor').trim() || (H().isDark() ? '#1e1e22' : '#fff');
  function liveEl(it) { const d = it.data; if (!d) return null; const box = document.createElement('div');
    if ((it.kind === 'chart' || it.kind === 'design') && d.d) { const el = document.createElement('div'); H().designInto(el, JSON.parse(JSON.stringify(d.d))); if (d.badge) el.insertAdjacentHTML('beforeend', `<div class="dzn">${esc(d.badge)}</div>`); box.appendChild(el); return el; }
    if (it.kind === 'ui') { const el = document.createElement('div'); el.className = 'uiobj dwui'; const tg = d.tag || 'span'; el.innerHTML = d.code ? `<pre>&lt;${tg}&gt;${esc(d.label)}&lt;/${tg}&gt;</pre>` : (tg === 'input' ? `<input placeholder="${esc(d.label)}">` : `<${tg}>${esc(d.label)}</${tg}>`); if (d.color) el.style.color = d.color; return el; }
    if (it.kind === 'word') { const el = document.createElement('span'); el.className = String(d.cls || 'word').replace(/\b(locked|stepped|carried)\b/g, '') + ' dwword'; el.textContent = d.text; if (d.color) el.style.color = d.color; if (d.font) el.style.font = d.font; if (d.size) el.style.fontSize = d.size; return el; }
    return null; }
  async function pngOf(it, scale) { const d = it.data || {}; if (['image', 'creature', 'building'].includes(it.kind)) { const src = it.kind === 'image' ? d.data : d.picture || it.thumb; if (!src) return null; return await new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(im.width * (scale || 1)); c.height = Math.round(im.height * (scale || 1)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c); }; im.onerror = () => res(null); im.src = src; }); }
    const el = liveEl(it); if (!el) return null; const s = stage(); s.appendChild(el); await new Promise(r => requestAnimationFrame(() => r())); const c = await rasterize(el, scale || 2, floorBg()); el.remove(); return c; }   // each picture has its own spot on the stage (several can be in flight)
  async function thumbOf(it) { try { const c = await pngOf(it, 1); if (!c) return null; const k = Math.min(1, 200 / c.width, 140 / c.height), t = document.createElement('canvas'); t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.82); } catch (e) { return null; } }

  // ---------- keeping ----------
  function add(it, maker, what) { const S = it.src && C.items.find(x => sig(x) === sig(it)); if (S) { tell(`already in your drawer: <b>${esc(S.title)}</b>`, S.id, 'dupe'); return S; }
    const P = H().place(), cam = H().cam(); Object.assign(it, { id: uid(), t: now(), world: it.world || P.name, at: it.at || { x: Math.round(cam.x), y: Math.round(cam.y) }, note: '', shelf: null }); C.items.push(it); save(); render();
    if (!it.thumb && ['chart', 'design', 'ui', 'word'].includes(it.kind)) thumbOf(it).then(t => { if (t) { it.thumb = t; save(); render(); } });
    if (maker) try { H().proud(maker, what, it.kind === 'chart' && it.data ? it.data.d : null); } catch (e) {}
    H().log('collect_keep', { who: maker ? maker.name : it.by || null, what: it.kind });
    tell(`${it.by ? names(esc(it.by)) + '’s ' : ''}${esc(what || ONE[it.kind])}${it.kind === 'creature' ? '' : ''} joins your drawer: <b>${esc(it.title)}</b>`, it.id); return it; }
  function tell(html, id, k) { if (window.__notify) window.__notify({ kind: 'world', icon: '🗄', html: html + (id ? ` <button data-act="drawer-open" data-id="${esc(id)}">open</button>` : ''), key: 'drawer:' + (k || '') + (id || html) }); }
  if (window.__notify) { window.__notify.on('drawer-open', ds => { toggle(true); if (ds.id) view(ds.id); }); window.__notify.on('keepnote', ds => keepNote(+ds.kt)); }
  const strip = h => String(h || '').replace(/<button[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  function keepObj(o) { if (!o) return null; const h = H();
    if (o.thing) { const d0 = h.thingOut(o); if (!d0) return null; const d = JSON.parse(JSON.stringify(d0));   // a copy: the original keeps living in the world
      if (o.kind === 'design' && o.d) { const dd = o.d, chart = dd.dk === 'chart' && dd.f, vis = chart ? (h.VIS_NAMES[dd.f.vis || (dd.f.bars ? 'bar' : 'line')] || 'a chart').replace(/^an? /, '') : '';
        const title = chart ? `${dd.f.expr} · ${vis}` : `${(h.DZ_ONE[dd.dk] || dd.dk || 'design')}${dd.title ? ' “' + dd.title + '”' : ''}`, maker = (dd.byKey && h.byKey(dd.byKey)) || (dd.by && h.byName(dd.by));
        return add({ kind: chart ? 'chart' : 'design', title, by: dd.by || null, byKey: dd.byKey || null, data: d, src: JSON.stringify([dd.dk, dd.f && dd.f.expr, dd.by, dd.t || dd.items.map(i => i.w).join(' ')]) }, maker, chart ? vis : (h.DZ_ONE[dd.dk] || 'design')); }
      if (o.kind === 'image') { if (!d.data) { tell('this picture has not finished loading yet'); return null; } return add({ kind: 'image', title: (o.fx || []).slice(-3).join(' · ') || (o.tile ? 'an image tile' : 'a picture'), thumb: d.data, data: d, src: d.data.slice(-80) }, null, o.tile ? 'image tile' : 'picture'); }
      return add({ kind: 'ui', title: `<${d.tag}> ${d.label || ''}`.trim(), data: d, src: d.tag + '|' + d.label }, null, 'page piece'); }
    if (o.text != null && o.el) { const d = h.wordOut(o); return add({ kind: 'word', title: d.text, by: o.owner || null, data: d, src: d.text + '|' + d.cls }, null, 'word'); }
    return null; }
  function portrait(c) { const W = 300, Hh = 240, cv = document.createElement('canvas'); cv.width = W * 2; cv.height = Hh * 2; const g = cv.getContext('2d'), dark = H().isDark();
    g.fillStyle = dark ? '#1f1f26' : '#f7f4ee'; g.fillRect(0, 0, cv.width, cv.height); const s = 2 * Math.min(2.4, 1.6 / Math.max(0.6, c.size || 1));
    g.save(); g.setTransform(s, 0, 0, s, W - c.x * s, Hh * 0.92 - c.y * s); try { H().drawCreature(g, c); } catch (e) { g.beginPath(); g.arc(c.x, c.y, 14, 0, 7); g.fillStyle = `hsl(${c.g.hue},70%,60%)`; g.fill(); } g.restore();
    g.fillStyle = dark ? '#eee' : '#222'; g.font = '600 26px system-ui'; g.textAlign = 'center'; g.fillText(c.name, W, Hh * 2 - 54); g.font = '18px system-ui'; g.globalAlpha = 0.6; g.fillText(`${c.g.body || ''} · ${c.g.legs || 0} legs · ${new Date().toLocaleDateString()}`, W, Hh * 2 - 26); g.globalAlpha = 1; return cv; }
  function keepCreature(c) { if (!c) return null; const cv = portrait(c), small = document.createElement('canvas'); small.width = 200; small.height = 160; small.getContext('2d').drawImage(cv, 0, 0, 200, 160);
    let feel = null; try { const f = window.__life && window.__life.feelings(c); if (f) feel = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k); } catch (e) {}
    const diary = ((c.life && c.life.diary) || []).slice(-6).map(e => ({ t: e.t, x: strip(e.x) + (e.ws && e.ws.length ? ' ' + e.ws.slice(0, 4).map(w => '“' + w[0] + '”').join(', ') : '') + (e.n > 1 ? ' (×' + e.n + ')' : '') })), data = { name: c.name, key: c.key, genome: JSON.parse(JSON.stringify(c.g)), born: c.born || null, meals: c.meals || 0, feel, diary, friends: ((c.life && c.life.friends) || []).slice(0, 8), picture: cv.toDataURL('image/png') };
    return add({ kind: 'creature', title: c.name, by: c.name, byKey: c.key, thumb: small.toDataURL('image/jpeg', 0.85), data, at: { x: Math.round(c.x), y: Math.round(c.y) }, src: c.key + '|' + now() }, c, 'portrait'); }
  function keepReel(r) { if (!r || !r.items) return null; const R = H().replay(), clips = R ? r.items.map(x => x.clip && R.get(x.clip)).filter(Boolean) : [];
    const it = add({ kind: 'reel', title: r.title, data: { reel: JSON.parse(JSON.stringify(r)), clips: JSON.parse(JSON.stringify(clips)) }, src: r.id }, null, 'reel'); return it; }
  function keepBuilding(sid) { const B = window.__build; const p = B && B.picture && B.picture(sid); if (!p) return null; const it = add({ kind: 'building', title: p.name, by: p.by || null, data: p, at: { x: Math.round(p.x), y: Math.round(p.y) }, src: p.id + '|' + p.pieces, thumb: p.data }, p.by && H().byName(p.by), p.what || 'building');
    return it; }
  function keepNote(t) { const h = window.__notify && window.__notify.history().filter(x => x.t === t && x.kind === 'gazette').pop(); if (!h) return null; const text = strip(h.html);
    return add({ kind: 'gazette', title: text.slice(0, 90), data: { html: h.html, icon: h.icon, t: h.t, at: h.at }, at: h.at || undefined, src: String(h.t) }, null, 'clipping'); }

  // ---------- using what you kept ----------
  function placeBack(id) { const it = C.items.find(x => x.id === id); if (!it || !it.data) return null; const h = H(), cam = h.cam(), x = cam.x + (Math.random() - 0.5) * 60, y = cam.y + (Math.random() - 0.5) * 40; let o = null;
    if (['chart', 'design', 'image', 'ui'].includes(it.kind)) o = h.thingIn({ ...JSON.parse(JSON.stringify(it.data)), x, y });
    else if (it.kind === 'word') o = h.addWord(it.data, x, y);
    else if (it.kind === 'creature' || it.kind === 'building') o = h.imgFromData(it.data.picture || it.data.data || it.thumb, x, y, [it.kind === 'creature' ? 'portrait of ' + it.title : it.title]);
    else if (it.kind === 'reel') { play(id); return true; } else if (it.kind === 'gazette') { if (it.at) h.flyTo(it.at.x, it.at.y, 1.2); return true; }
    if (o) { h.log('collect_place', { what: it.kind }); if (window.__notify) window.__notify({ kind: 'world', icon: '🗄', html: `a copy of <b>${esc(it.title)}</b> is back in the world, right here`, key: 'drawer-place:' + id + now() }); } return o; }
  function play(id) { const it = C.items.find(x => x.id === id); if (!it || it.kind !== 'reel' || !it.data) return false; feedClips(); const R = H().reels(); return !!(R && R.playObj && R.playObj(JSON.parse(JSON.stringify(it.data.reel)))); }
  let lastGone = null;
  function remove(id) { const i = C.items.findIndex(x => x.id === id); if (i < 0) return false; const [it] = C.items.splice(i, 1); it.gone = now(); C.trash.push(it); lastGone = it; save(); render(); closeView();
    if (window.__notify) window.__notify({ kind: 'world', icon: '🗄', html: `<b>${esc(it.title)}</b> left your drawer (it waits under “removed”)`, actions: [{ label: 'undo', run: () => restore(it.id) }], key: 'drawer-rm:' + id }); return true; }
  function restore(id) { const i = C.trash.findIndex(x => x.id === id); if (i < 0) return false; const [it] = C.trash.splice(i, 1); delete it.gone; C.items.push(it); C.items.sort((a, b) => a.t - b.t); save(); render(); return true; }
  function download(name, href) { const a = document.createElement('a'); a.download = name; a.href = href; document.body.appendChild(a); a.click(); a.remove(); if (href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 4000); }
  const fname = it => (it.title || it.kind).replace(/[^\w\d]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() || it.kind;
  async function exportItem(id, fmt, dry) { const it = C.items.find(x => x.id === id); if (!it) return null; let href = null, ext = fmt;
    if (fmt === 'png') { const c = await pngOf(it, 2); if (!c) return null; href = c.toDataURL('image/png'); }
    else if (fmt === 'svg') { const el = liveEl(it); if (!el) return null; const s = stage(); s.appendChild(el); const sv = el.querySelector('svg'); if (!sv) { el.remove(); return null; } const cl = inlined(sv); cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); const txt = new XMLSerializer().serializeToString(cl); el.remove(); href = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' })); }
    else if (fmt === 'txt') { const t = it.kind === 'gazette' ? strip(it.data.html) : it.kind === 'word' ? it.data.text : it.title; href = URL.createObjectURL(new Blob([t + '\n'], { type: 'text/plain' })); }
    else { ext = 'json'; const out = { ...it }; href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); }
    if (!dry) download(`id-le-${fname(it)}.${ext}`, href); H().log('collect_export', { what: it.kind, fmt: ext }); return href; }
  const FORMATS = it => ({ chart: ['png', 'svg', 'json'], design: ['png', 'json'], image: ['png', 'json'], ui: ['png', 'json'], word: ['png', 'txt', 'json'], creature: ['png', 'json'], reel: ['json'], building: ['png', 'json'], gazette: ['txt', 'json'] }[it.kind] || ['json']);

  // ---------- the 🗄 window ----------
  const css = document.createElement('style'); css.textContent = `
#drawer{position:fixed;right:16px;top:56px;z-index:9996;display:none;width:min(470px,calc(100vw - 32px));max-height:76vh;overflow:auto;background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:12px;padding:8px 10px;box-shadow:0 8px 28px #0006;font:12px system-ui;box-sizing:border-box}
#drawer.on{display:block}#drawer .hd{display:flex;justify-content:space-between;align-items:center;margin:-8px -10px 6px;padding:8px 10px 6px;position:sticky;top:-8px;z-index:3;background:var(--floor);border-bottom:1px solid #8883;cursor:grab;user-select:none;touch-action:none}#drawer.drag .hd{cursor:grabbing}
#drawer .hd b{font-size:13px}#drawer button{font:inherit;font-size:11.5px;padding:1px 7px;border-radius:8px;border:1px solid #8886;background:none;color:inherit;cursor:pointer}#drawer button.on{background:#2b5cff;color:#fff;border-color:#2b5cff}
#drawer .sh{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 8px}#drawer .sh button.drop{outline:2px dashed #2b5cff;outline-offset:1px}#drawer .sh .mine{border-style:dashed}#drawer .sub{opacity:.65;font-size:11px}
#drawer .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}#drawer .tile{border:1px solid #8885;border-radius:10px;padding:5px;display:flex;flex-direction:column;gap:3px;min-width:0;cursor:grab;background:color-mix(in srgb,var(--floor) 92%,#888 8%)}
#drawer .tile .th{height:96px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:#8881;cursor:zoom-in}#drawer .tile .th img{max-width:100%;max-height:96px;object-fit:contain}
#drawer .tile .tt{font-weight:600;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#drawer .tile .mt{font-size:10.5px;opacity:.7;line-height:1.3}#drawer .tile .nt{font-size:10.5px;font-style:italic;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#drawer .tile .ac{display:flex;gap:3px;flex-wrap:wrap}#drawer .tile .ac button{padding:0 5px}#drawer .big{font-size:28px}#drawer .gz{font:italic 600 11px Georgia,serif;opacity:.75}
#drawer .dwword{position:static!important;transform:none!important;display:inline-block}#drawer .dwui,#drawerView .dwui{position:static}#drawerView .dwword{position:static!important;transform:none!important;display:inline-block;font-size:18px}
#drawerView{position:fixed;inset:0;z-index:10004;display:none;align-items:center;justify-content:center;background:#0007}#drawerView.on{display:flex}
#drawerView .box{background:var(--floor);color:var(--ink);border:1px solid #8886;border-radius:14px;padding:12px 14px;max-width:min(640px,calc(100vw - 32px));max-height:86vh;overflow:auto;box-shadow:0 12px 40px #0008;font:12px system-ui;display:flex;flex-direction:column;gap:8px}
#drawerView .art{display:flex;justify-content:center;align-items:center;min-height:120px;background:#8881;border-radius:10px;padding:10px}#drawerView .art img{max-width:100%;max-height:52vh}#drawerView .art .design{transform:scale(1.6);transform-origin:center;margin:60px 70px}
#drawerView input,#drawerView textarea,#drawerView select{font:inherit;background:none;color:inherit;border:1px solid #8886;border-radius:6px;padding:3px 6px}#drawerView textarea{width:100%;box-sizing:border-box;min-height:44px}
#drawerView button{font:inherit;font-size:12px;padding:2px 9px;border-radius:8px;border:1px solid #8886;background:none;color:inherit;cursor:pointer}#drawerView .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}#drawerView .k{opacity:.65}
#drawerView .diary{font:11px/1.45 Georgia,serif;font-style:italic;opacity:.85;max-height:120px;overflow:auto}
#dkeep{position:fixed;z-index:9990;display:none;font:12px system-ui;padding:1px 6px;border-radius:9px;border:1px solid #8886;background:var(--floor);color:var(--ink);cursor:pointer;box-shadow:0 2px 8px #0004}#dkeep.on{display:block}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'drawer'; document.body.appendChild(el);
  const vw = document.createElement('div'); vw.id = 'drawerView'; document.body.appendChild(vw);
  const btn = document.createElement('button'); btn.id = 'drawerBtn'; btn.title = 'your drawer: copies of the things you kept (charts, pictures, words, portraits, reels, buildings…)'; btn.textContent = '🗄';
  let open = false; try { open = localStorage.getItem('idle.drawerOpen') === '1'; } catch (e) {}
  const mountBtn = () => { if (btn.isConnected) return; const a = document.getElementById('ntfBtn') || document.getElementById('advBtn') || document.getElementById('djBtn') || document.getElementById('reelsBtn'); if (a) { a.after(btn, ' '); render(); } else setTimeout(mountBtn, 500); };
  if (document.readyState === 'complete') mountBtn(); else addEventListener('load', mountBtn);
  btn.addEventListener('click', () => toggle());
  function toggle(on) { open = on ?? !open; try { localStorage.setItem('idle.drawerOpen', open ? '1' : '0'); } catch (e) {} render(); }
  // drag it by the header; its place is remembered and kept inside the window
  { const fit = (x, y) => [Math.max(0, Math.min(innerWidth - 120, x)), Math.max(0, Math.min(innerHeight - 40, y))];
    const placeAt = (x, y) => { [x, y] = fit(x, y); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.maxHeight = Math.max(180, Math.min(innerHeight * 0.76, innerHeight - y - 12)) + 'px'; };
    try { const p = JSON.parse(localStorage.getItem(POS) || 'null'); if (p) placeAt(p.x, p.y); } catch (e) {}
    addEventListener('resize', () => { if (el.style.left) placeAt(parseFloat(el.style.left), parseFloat(el.style.top)); });
    el.addEventListener('pointerdown', e => { const hd = e.target.closest('.hd'); if (!hd || e.target.closest('button, input') || e.button) return; const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; el.classList.add('drag'); hd.setPointerCapture(e.pointerId); e.preventDefault();
      const mv = ev => placeAt(ev.clientX - dx, ev.clientY - dy), up = () => { el.classList.remove('drag'); hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); try { localStorage.setItem(POS, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch (err) {} };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up); }); }
  let shelf = 'all';
  const when = t => { const d = new Date(t), td = new Date(); return d.toDateString() === td.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  function thumbHTML(it) { const K = KINDS[it.kind] || ['🗄'];
    if (it.thumb) return `<img src="${it.thumb}" alt="" draggable="false">`;
    if (it.kind === 'reel') return `<div style="text-align:center"><div class="big">🎞</div><div class="sub">${(it.data && it.data.reel ? it.data.reel.items.length : 0)} moments${it.data && it.data.clips && it.data.clips.length ? ' · ' + it.data.clips.length + ' replays' : ''}</div></div>`;
    if (it.kind === 'gazette') return `<div style="padding:6px;font-size:11px;line-height:1.35"><span class="gz">Id|le gazette</span><br>${esc(it.title)}</div>`;
    if (it.kind === 'word' && it.data) return `<span class="${esc(String(it.data.cls || 'word').replace(/\b(locked|stepped|carried)\b/g, ''))} dwword" style="${it.data.color ? 'color:' + esc(it.data.color) : ''}">${esc(it.data.text)}</span>`;
    return `<div class="big">${K[0]}</div>`; }
  function render() { btn.classList.toggle('on', open); el.classList.toggle('on', open); if (!open || el.classList.contains('drag')) return;
    const counts = {}; for (const it of C.items) counts[it.kind] = (counts[it.kind] || 0) + 1;
    const mineN = id => C.items.filter(x => x.shelf === id).length;
    const list = shelf === 'all' ? C.items : shelf === 'removed' ? C.trash : shelf.startsWith('s:') ? C.items.filter(x => x.shelf === shelf.slice(2)) : C.items.filter(x => x.kind === shelf);
    let h = `<div class="hd"><b>🗄 your drawer <span class="sub">· ${C.items.length} kept</span></b><button data-d="close" title="close">✕</button></div>`;
    h += `<div class="sh"><button data-s="all" class="${shelf === 'all' ? 'on' : ''}">all ${C.items.length}</button>${Object.keys(KINDS).filter(k => counts[k]).map(k => `<button data-s="${k}" class="${shelf === k ? 'on' : ''}">${KINDS[k][0]} ${KINDS[k][1]} ${counts[k]}</button>`).join('')}` +
      C.shelves.map(s => `<button data-s="s:${esc(s.id)}" data-shelf="${esc(s.id)}" class="mine ${shelf === 's:' + s.id ? 'on' : ''}" title="your collection: drop things here">★ ${esc(s.name)} ${mineN(s.id)}</button>`).join('') +
      `<button data-d="newshelf" title="a collection of your own: name it, then drag things onto it">+ collection</button>${C.trash.length ? `<button data-s="removed" class="${shelf === 'removed' ? 'on' : ''}" title="things you removed: put them back">🗑 removed ${C.trash.length}</button>` : ''}</div>`;
    if (!list.length) h += `<div class="sub" style="padding:6px 2px 10px">${C.items.length ? 'nothing here yet: drag things onto this collection' : 'nothing kept yet. Right-click a chart, a picture or a word and choose 🗄 keep a copy (or hover a chart for 🗄), use 🗄 portrait on a creature’s card, 🗄 in a reel, on a building’s menu, or on a Gazette pill. The original stays in the world; the copy is yours.'}</div>`;
    else h += `<div class="grid">${list.slice().reverse().map(it => `<div class="tile" draggable="${shelf === 'removed' ? 'false' : 'true'}" data-id="${esc(it.id)}"><div class="th" data-d="view" title="look at it">${thumbHTML(it)}</div><div class="tt" title="${esc(it.title)}">${KINDS[it.kind] ? KINDS[it.kind][0] : ''} ${esc(it.title)}</div>` +
      `<div class="mt">${it.by && it.kind !== 'creature' ? 'by ' + names(esc(it.by)) + ' · ' : ''}${esc(it.world || '')} · ${shelf === 'removed' ? 'removed ' + when(it.gone || it.t) : 'kept ' + when(it.t)}${it.lite ? ' · <span title="this browser has only a small copy; the full one is where you kept it">thumbnail only</span>' : ''}</div>${it.note ? `<div class="nt" title="${esc(it.note)}">“${esc(it.note)}”</div>` : ''}` +
      `<div class="ac">${shelf === 'removed' ? `<button data-d="restore" title="put it back in your drawer">↩ put back</button>` : `${it.kind === 'reel' ? '<button data-d="play" title="play it">▶</button>' : it.kind === 'gazette' ? (it.at ? '<button data-d="place" title="go where it happened">go ›</button>' : '') : '<button data-d="place" title="place a copy back in the world, here">⤵</button>'}<button data-d="view" title="look, rename, add a note, export">🔍</button><button data-d="rm" title="remove (you can undo, and it waits under removed)">✕</button>`}</div></div>`).join('')}</div>`;
    el.innerHTML = h; }
  el.addEventListener('click', e => { const b = e.target.closest('[data-d], [data-s]'); if (!b || e.target.closest('a.mn')) return; const id = (b.closest('.tile') || {}).dataset ? b.closest('.tile') && b.closest('.tile').dataset.id : null;
    if (b.dataset.s) { shelf = b.dataset.s; render(); return; } const a = b.dataset.d;
    if (a === 'close') toggle(false); else if (a === 'newshelf') { const n = (prompt0('name your collection', 'favourites') || '').trim(); if (n) { const s = { id: 's' + now().toString(36), name: n.slice(0, 40), t: now() }; C.shelves.push(s); shelf = 's:' + s.id; save(); render(); } }
    else if (a === 'view' && id) view(id); else if (a === 'place' && id) placeBack(id); else if (a === 'play' && id) play(id); else if (a === 'rm' && id) remove(id); else if (a === 'restore' && id) restore(id); });
  // a small inline prompt (no browser dialogs): a text box in the header
  function prompt0(label, ph) { const v = el.querySelector('#dwNew'); if (v && v.value.trim()) return v.value; const hd = el.querySelector('.sh'); if (hd && !v) { hd.insertAdjacentHTML('beforeend', `<input id="dwNew" placeholder="${esc(ph)}" title="${esc(label)}: type a name, press Enter" style="font:inherit;font-size:11.5px;border:1px solid #8886;border-radius:8px;padding:1px 6px;background:none;color:inherit;width:120px">`); const inp = el.querySelector('#dwNew'); inp.focus(); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); el.querySelector('[data-d=newshelf]').click(); } else if (ev.key === 'Escape') inp.remove(); }); } return null; }
  // drag a tile onto one of your collections
  el.addEventListener('dragstart', e => { const t = e.target.closest('.tile'); if (!t) return; e.dataTransfer.setData('text/x-idle-keep', t.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragover', e => { const s = e.target.closest('[data-shelf]'); if (!s) return; e.preventDefault(); el.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); s.classList.add('drop'); });
  el.addEventListener('dragleave', e => { const s = e.target.closest('[data-shelf]'); if (s) s.classList.remove('drop'); });
  el.addEventListener('drop', e => { const s = e.target.closest('[data-shelf]'); if (!s) return; e.preventDefault(); const id = e.dataTransfer.getData('text/x-idle-keep'), it = C.items.find(x => x.id === id); if (it) { it.shelf = s.dataset.shelf; save(); render(); } });
  function setShelf(id, sh) { const it = C.items.find(x => x.id === id); if (!it) return false; it.shelf = sh || null; save(); render(); return true; }

  // ---------- the large view ----------
  let vId = null;
  function closeView() { vw.classList.remove('on'); vw.innerHTML = ''; vId = null; }
  function view(id) { const it = C.items.find(x => x.id === id); if (!it) return; vId = id; const d = it.data || {};
    let art = ''; if (it.kind === 'creature' || it.kind === 'building') art = `<img src="${d.picture || d.data || it.thumb}" alt="">`; else if (it.kind === 'image') art = `<img src="${d.data || it.thumb}" alt="">`;
    else if (it.kind === 'reel') art = `<div style="text-align:center"><div style="font-size:40px">🎞</div><b>${esc(it.title)}</b><div class="k">${d.reel ? d.reel.items.length : 0} moments · ${(d.clips || []).length} replays kept with it</div><button data-v="play" style="margin-top:6px">▶ play</button></div>`;
    else if (it.kind === 'gazette') art = `<div style="max-width:460px;font-size:14px;line-height:1.5"><span class="gz" style="font:italic 600 13px Georgia,serif">Id|le gazette</span><br>${d.icon || ''} ${names(esc(strip(d.html)))}<div class="k" style="font-size:11px;margin-top:4px">${new Date(d.t || it.t).toLocaleString()}</div></div>`;
    else if (!it.data && it.thumb) art = `<img src="${it.thumb}" alt="">`;
    const extra = it.kind === 'creature' ? `<div class="row"><span class="k">genes</span> ${esc(['body', 'legs', 'social', 'speed', 'timid', 'job'].map(k => d.genome && d.genome[k] != null ? `${k} ${typeof d.genome[k] === 'number' ? (+d.genome[k]).toFixed(2).replace(/\.00$/, '') : d.genome[k]}` : '').filter(Boolean).join(' · '))}${d.feel ? ` · <span class="k">felt</span> ${esc(d.feel.join(', '))}` : ''}</div>${d.diary && d.diary.length ? `<div class="diary">${d.diary.slice().reverse().map(e => `<div>${names(esc(e.x))}</div>`).join('')}</div>` : ''}`
      : it.kind === 'building' ? `<div class="row"><span class="k">${esc(d.what || 'a building')}</span>${d.by ? ' built by ' + names(esc(d.by)) : ''} · ${d.pieces || 0} pieces${d.done ? '' : ' · still going up'}</div>` : '';
    vw.innerHTML = `<div class="box"><div class="row" style="justify-content:space-between"><b>${KINDS[it.kind] ? KINDS[it.kind][0] : '🗄'} ${esc(ONE[it.kind] || it.kind)}</b><button data-v="close" title="close (Esc)">✕</button></div><div class="art"></div>` +
      `<div class="row"><span class="k">name</span><input data-f="title" value="${esc(it.title)}" style="flex:1;min-width:160px"></div>` +
      `<div class="k">${it.by && it.kind !== 'creature' ? 'by ' + names(esc(it.by)) + ' · ' : ''}${esc(it.world || '')}${it.at ? ` <button data-v="go" title="go where it was">go ›</button>` : ''} · kept ${new Date(it.t).toLocaleString()}</div>${extra}` +
      `<textarea data-f="note" placeholder="a note to yourself about it">${esc(it.note || '')}</textarea>` +
      `<div class="row"><span class="k">collection</span><select data-f="shelf"><option value="">none</option>${C.shelves.map(s => `<option value="${esc(s.id)}" ${it.shelf === s.id ? 'selected' : ''}>★ ${esc(s.name)}</option>`).join('')}</select>` +
      `${['chart', 'design', 'image', 'ui', 'word', 'creature', 'building'].includes(it.kind) && it.data ? '<button data-v="place" title="place a copy back in the world, at the middle of your view">⤵ place a copy</button>' : ''}<span class="k">export</span>${FORMATS(it).map(f => `<button data-v="x:${f}">${f.toUpperCase()}</button>`).join('')}<button data-v="rm" title="remove (undo in the pill; it also waits under removed)">✕ remove</button></div></div>`;
    const A = vw.querySelector('.art'); if (art) A.innerHTML = art; else { const le = liveEl(it); if (le) A.appendChild(le); else A.innerHTML = '<span class="k">no picture</span>'; }
    vw.classList.add('on'); }
  vw.addEventListener('click', e => { if (e.target === vw) return closeView(); const b = e.target.closest('[data-v]'); if (!b || !vId) return; const a = b.dataset.v, it = C.items.find(x => x.id === vId); if (!it) return closeView();
    if (a === 'close') closeView(); else if (a === 'place') { placeBack(vId); closeView(); } else if (a === 'play') { closeView(); play(it.id); } else if (a === 'rm') remove(vId);
    else if (a === 'go' && it.at) { H().flyTo(it.at.x, it.at.y, 1.2); closeView(); } else if (a.startsWith('x:')) exportItem(vId, a.slice(2)); });
  vw.addEventListener('change', e => { const f = e.target.dataset.f, it = C.items.find(x => x.id === vId); if (!f || !it) return; if (f === 'title') it.title = e.target.value.trim().slice(0, 120) || it.title; else if (f === 'note') it.note = e.target.value.slice(0, 1000); else if (f === 'shelf') it.shelf = e.target.value || null; save(); render(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && vw.classList.contains('on')) { closeView(); e.stopPropagation(); } }, true);

  // ---------- small doors into the drawer: hover a chart/picture for 🗄, the card's portrait button ----------
  const hov = document.createElement('button'); hov.id = 'dkeep'; hov.textContent = '🗄 keep'; hov.title = 'put a copy in your drawer (the original stays here)'; document.body.appendChild(hov);
  let hovT = null, hovHide = 0;
  const hideHov = () => { hovHide = setTimeout(() => { hov.classList.remove('on'); hovT = null; }, 350); };
  document.addEventListener('pointerover', e => { if (e.buttons) return; const te = e.target.closest && e.target.closest('.thing'); if (!te) return; const t = H().things().find(x => x.el === te); if (!t || (t.kind === 'design' && t.d && !t.d.done)) return; clearTimeout(hovHide); hovT = t;
    const r = te.getBoundingClientRect(); hov.style.left = Math.min(innerWidth - 70, r.right - 30) + 'px'; hov.style.top = Math.max(4, r.top - 12) + 'px'; hov.classList.add('on'); }, true);
  document.addEventListener('pointerout', e => { const te = e.target.closest && e.target.closest('.thing'); if (te && hovT && hovT.el === te && !(e.relatedTarget && (te.contains(e.relatedTarget) || hov.contains(e.relatedTarget)))) hideHov(); }, true);
  hov.addEventListener('pointerenter', () => clearTimeout(hovHide)); hov.addEventListener('pointerleave', hideHov);
  hov.addEventListener('click', e => { e.stopPropagation(); if (hovT) keepObj(hovT); hov.classList.remove('on'); });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#whisper [data-wact="portrait"]'); if (!b) return; const c = H().card(); if (c) keepCreature(c); }, true);

  window.__collect = { keepObj, keepCreature, keepReel, keepBuilding, keepNote, forSnap, merge, clipIds, toggle, view, placeBack, play, remove, restore, exportItem, setShelf, items: () => C.items, trash: () => C.trash, shelves: () => C.shelves, loaded: () => loaded,
    newShelf: n => { const s = { id: 's' + now().toString(36) + Math.random().toString(36).slice(2, 4), name: String(n).slice(0, 40), t: now() }; C.shelves.push(s); save(); render(); return s.id; } };
})();
