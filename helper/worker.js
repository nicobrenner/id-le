// Id|le helper: the two things a static site can't do by itself, as one Cloudflare Worker.
//   1. read web pages for the creatures: /lab/fetch (text + images + links), /lab/page (raw HTML for travel mode),
//      /lab/asset (CSS/fonts/images of a travelled page), /lab/img (image bytes for pixel-sorting). Same JSON as demo_server.py.
//   2. link worlds: /worlds/{state,register,link,approve,unlink,send,ack,view}, kept in the WORLDS KV namespace
//      (without one it falls back to memory: fine for a test, forgets on every restart).
// Limits: only http(s) to public hosts, page reads capped (600 KB text, 2.5 MB HTML, 4 MB images/assets), 60 requests a minute
// per visitor, and only the origins in ALLOWED_ORIGINS may use it. No cookies, no logging of what is fetched.
const UA = 'Mozilla/5.0 (Id|le helper; +https://id-le.com)';
const mem = { worlds: { worlds: {} }, hits: new Map() };
const isPrivate = h => /^(localhost$|.*\.local$|.*\.internal$|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(h);   // IPv6 literals ([...]) are refused outright

function cors(env, req, res) {
  const o = req.headers.get('Origin') || '', ok = (env.ALLOWED_ORIGINS || 'https://id-le.com,http://localhost:8776').split(',').map(s => s.trim());
  const h = new Headers(res.headers); h.set('Cross-Origin-Resource-Policy', 'cross-origin'); h.set('Vary', 'Origin');
  if (ok.includes(o) || ok.includes('*')) { h.set('Access-Control-Allow-Origin', o || '*'); h.set('Access-Control-Allow-Headers', 'Content-Type'); h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); }
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const unesc = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = s => unesc(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function grab(u, env, cap, accept) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol) || (isPrivate(url.hostname) && !env.ALLOW_PRIVATE)) throw new Error('not a public web address');
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept || '*/*' }, redirect: 'follow', cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error('the site answered ' + r.status);
  const buf = new Uint8Array(await r.arrayBuffer()).slice(0, cap);
  return { r, buf, ct: r.headers.get('Content-Type') || '', final: r.url || u };
}

async function readPage(u, env) {   // /lab/fetch: same fields as demo_server.py (title, text, images, ui, links, url)
  const { buf } = await grab(u, env, 600000, 'text/html'); const raw0 = new TextDecoder().decode(buf);
  const title = (raw0.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const raw = raw0.replace(/<(script|style|noscript|svg|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const paras = [...raw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => m[1]), body = paras.join('').length > 400 ? paras.join(' ') : raw;
  const text = strip(body).replace(/\[\d+\]/g, ' ').replace(/\s+/g, ' ').slice(0, 20000);
  const images = [], ui = [], links = [], seen = new Set();
  for (const m of raw0.matchAll(/<img[^>]+?src="([^"]+)"/gi)) { let a; try { a = new URL(unesc(m[1]), u).href; } catch (e) { continue; } if (/^data:|\.svg|icon|logo|sprite|pixel|1x1|static\/images/i.test(a) || !/\.(jpe?g|png|webp|gif)/i.test(a) || images.includes(a)) continue; images.push(a); if (images.length >= 4) break; }
  for (const m of raw0.matchAll(/<(button|h1|h2|h3|label|a)\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const t = strip(m[2]); if (t.length >= 2 && t.length <= 40 && !ui.some(x => x.text === t)) ui.push({ tag: m[1].toLowerCase(), text: t }); if (ui.length >= 40) break; }
  for (const m of [...raw0.matchAll(/<input[^>]+placeholder="([^"]{2,40})"/gi)].slice(0, 4)) ui.push({ tag: 'input', text: unesc(m[1]) });
  for (const m of raw.matchAll(/<a\b[^>]*?href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) { let a; try { a = new URL(unesc(m[1]), u).href.split('#')[0]; } catch (e) { continue; } const t = strip(m[2]);
    if (!/^https?:/.test(a) || seen.has(a) || a === u || t.length < 2 || t.length > 80 || /^(http|www\.)/i.test(t) || /\.(pdf|zip|jpe?g|png|gif|svg)(\?|$)/i.test(a)) continue; seen.add(a); links.push({ href: a, text: t }); if (links.length >= 200) break; }
  return { title: title ? strip(title).slice(0, 120) : u, text, images, ui: ui.sort(() => Math.random() - 0.5).slice(0, 14), links, url: u };
}

async function asset(u, env, self) {   // /lab/asset: CSS comes back with url()/@import rewritten to pass through here again
  const { buf, ct, final } = await grab(u, env, 4000000);
  const isCss = ct.includes('css') || /\.css(\?|$)/i.test(u);
  if (!isCss && !/^(image\/|font\/|application\/(font|x-font|vnd\.ms-fontobject))/.test(ct) && !/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u)) throw new Error('not a stylesheet, font or image');
  if (!isCss) return new Response(buf, { headers: { 'Content-Type': ct || 'application/octet-stream', 'Cache-Control': 'max-age=3600' } });
  const via = x => `${self}/lab/asset?url=${encodeURIComponent(new URL(x, final).href)}`;
  const css = new TextDecoder().decode(buf).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, x) => x.trim().startsWith('data:') ? m : `url("${via(x.trim())}")`).replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, x) => `@import url("${via(x)}")`);
  return new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'max-age=3600' } });
}

async function worlds(req, env, path) {   // the same relay as demo_server.py, stored as one JSON document
  // KV on the free plan: 1,000 writes and 100,000 reads a day for the whole account (shared with jeffy's mind-reader), so a poll
  // reads a copy kept in this isolate for 60 s, and only actions (register, link, send…) read fresh and write
  const load = async (fresh) => { if (!env.WORLDS) return mem.worlds; if (!fresh && mem.wc && Date.now() - mem.wc.t < 60000) return JSON.parse(mem.wc.s) || { worlds: {} };
    const s = await env.WORLDS.get('worlds') || 'null'; mem.wc = { t: Date.now(), s }; return JSON.parse(s) || { worlds: {} }; };
  const save = async d => { if (env.WORLDS) { const s = JSON.stringify(d); await env.WORLDS.put('worlds', s); mem.wc = { t: Date.now(), s }; } else mem.worlds = d; };
  const W = (d, c) => d.worlds[c] || (d.worlds[c] = { name: c, links: [], requests: [], inbox: [], view: null, seen: 0 });
  const d = await load(path !== '/worlds/state'), now = Date.now() / 1000;
  if (path === '/worlds/state') { const code = new URL(req.url).searchParams.get('code') || ''; const known = !!d.worlds[code], me = W(d, code), stale = now - (me.seen || 0) > 3600; me.seen = now; if (known && stale && (me.links.length || me.requests.length)) await save(d);   // a poll never creates a world (register does) and refreshes 'seen' at most hourly, only for linked worlds   // KV writes are scarce (1,000 a day on the free plan, shared by the whole account): a poll writes only for a new world or when 'seen' is 10 min old
    return json({ me: { name: me.name, links: me.links, requests: me.requests, inbox: me.inbox }, peers: Object.fromEntries(me.links.concat(me.requests).map(c => [c, { name: (d.worlds[c] || {}).name || c, seen: (d.worlds[c] || {}).seen || 0, view: (d.worlds[c] || {}).view || null }])) }); }
  const q = await req.json().catch(() => ({})), act = path.split('/')[2], me = W(d, q.code || ''); let res = { ok: true };
  if (act === 'register') { me.name = String(q.name || me.name).slice(0, 40); me.seen = now; }
  else if (act === 'link') { const o = String(q.other || '').trim().toLowerCase(); if (!o || o === q.code) res = { ok: false, error: 'that is your own code' }; else if (!d.worlds[o]) res = { ok: false, error: 'no world with that code has been open here' }; else if (d.worlds[o].links.includes(q.code)) res = { ok: true, already: true }; else if (!d.worlds[o].requests.includes(q.code)) d.worlds[o].requests.push(q.code); }
  else if (act === 'approve') { me.requests = me.requests.filter(r => r !== q.other); if (q.yes && d.worlds[q.other]) { if (!me.links.includes(q.other)) me.links.push(q.other); if (!d.worlds[q.other].links.includes(q.code)) d.worlds[q.other].links.push(q.code); } }
  else if (act === 'unlink') { me.links = me.links.filter(x => x !== q.other); if (d.worlds[q.other]) d.worlds[q.other].links = d.worlds[q.other].links.filter(x => x !== q.code); }
  else if (act === 'send') { if (me.links.includes(q.to) && d.worlds[q.to]) { d.worlds[q.to].inbox.push({ ...(q.item || {}), from: q.code, t: now }); d.worlds[q.to].inbox = d.worlds[q.to].inbox.slice(-50); } else res = { ok: false, error: 'not linked' }; }
  else if (act === 'ack') { const ids = new Set(q.ids || []); me.inbox = me.inbox.filter(i => !ids.has(i.id)); }
  else if (act === 'view') { if (now - (me.viewAt || 0) < 60) return json(res); me.view = q.view; me.viewAt = me.seen = now; }   // linked views are shared at most once a minute (the page offers one every 3 s)
  await save(d); return json(res);
}

// anonymous stats (#34, POST /lab/stats from idle-stats.js): only daily totals are kept, in the STATS KV namespace, never a
// single visit and never an address. Each isolate adds visits to a small buffer and writes it at most every 5 min (one
// read-modify-write of its own shard key, stats:<UTC day>:<shard>), so a busy day stays well inside KV's write limits.
const SHARD = Math.floor(Math.random() * 16).toString(16), FEATS = /^[a-z0-9_-]{1,24}$/, BUCKETS = ['<20', '20-40', '40-55', '55+'];
// where visits came from (the referring site's name only), a campaign tag, time on screen, where a guided start stopped
const REF = /^[a-z0-9][a-z0-9.-]{0,59}$/, UTM = /^[a-z0-9-]{1,24}$/, DWELL = ['<1', '1-5', '5-20', '20+'];
const DLSTEP = ['what', 'travel', 'kinds', 'team', 'review', 'stats', 'where', 'finished', 'ended'];   // the data lab walkthrough (idle-dlwalk.js)
const F5STOP = ['none', 'card', 'hwwiki', 'name', 'feed', 'dream', 'gazette', 'weather', 'reel', 'keep', 'finished', 'skipped'];
// engagement, per page load and counted once in its last bucket (eg0 takes back the bucket reported before): creatures in the world,
// and how many were born, charts made, buildings finished and words fed during the page load; plus visible seconds, a plain daily sum
const EG = { cr: ['0-12', '13-30', '31-60', '61-150', '151+'], born: ['0', '1-5', '6-20', '21+'], built: ['0', '1-5', '6-20', '21+'], charts: ['0', '1-5', '6-20', '21+'], fed: ['0', '1-5', '6-20', '21+'] };
const PSEC = /^[a-z0-9-]{1,40}$/;   // the pedia's own section ids (headings it scrolled into view)
const CAP = { ref: 30, utm: 20, psec: 80 };   // distinct names kept per day and shard; the rest are counted as 'other'
const capped = (o, k, n, cap) => bump(o, o[k] != null || Object.keys(o).length < cap ? k : 'other', n);
const EMPTY_PD = () => ({ visits: 0, back: 0, dev: {}, ref: {}, utm: {}, dw: {}, sec: {}, clips: 0 });   // the pedia's own block
const EMPTY = () => ({ visits: 0, back: 0, ios: 0, safe: {}, dev: {}, fps: {}, feat: {}, m: {}, f5: {}, err: {}, ref: {}, utm: {}, dw: {}, fl: {}, dl: {}, eg: {}, secs: 0, pd: EMPTY_PD(), batches: 0 });
let statBuf = {}, statTimer = null, statFirst = 0; const STAT_EVERY = 120000;
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
function addStats(p) {
  const day = new Date().toISOString().slice(0, 10), d = statBuf[day] = statBuf[day] || EMPTY();
  d.batches++;
  if (Array.isArray(p.err)) for (const e of p.err.slice(0, 5)) if (typeof e === 'string') bump(d.err, e.slice(0, 160));
  const mv = (o, B, v, v0) => { if (B.includes(v) && (v0 === undefined || B.includes(v0) && v0 !== v)) { bump(o, v); if (v0 !== undefined) bump(o, v0, -1); } };   // a page load moving bucket
  if (p.page === 'pedia') { const q = d.pd;   // the pedia counts on its own, never as a game visit
    if (p.visit === 1) { q.visits++; if (p.back === 1) q.back++; if (p.dev === 'phone' || p.dev === 'desktop') bump(q.dev, p.dev);
      if (typeof p.ref === 'string') capped(q.ref, REF.test(p.ref) ? p.ref : 'other', 1, CAP.ref); if (typeof p.utm === 'string' && UTM.test(p.utm)) capped(q.utm, p.utm, 1, CAP.utm); }
    mv(q.dw, DWELL, p.dw, p.dw0);
    if (Array.isArray(p.ps)) for (const x of new Set(p.ps.slice(0, 40))) if (typeof x === 'string' && PSEC.test(x)) capped(q.sec, x, 1, CAP.psec);
    if (Number.isInteger(p.clips) && p.clips > 0 && p.clips <= 50) q.clips += p.clips;
    return; }
  if (p.visit === 1) { d.visits++; if (p.back === 1) d.back++; if (p.ios === 1) d.ios++; if ([0, 1, 2].includes(p.safe)) bump(d.safe, String(p.safe)); if (p.dev === 'phone' || p.dev === 'desktop') bump(d.dev, p.dev);
    if (typeof p.ref === 'string') capped(d.ref, REF.test(p.ref) ? p.ref : 'other', 1, CAP.ref); if (typeof p.utm === 'string' && UTM.test(p.utm)) capped(d.utm, p.utm, 1, CAP.utm); }
  // a page load moves up through the buckets: add the new one, take back the one it reported before (sums stay one per page load)
  if (DWELL.includes(p.dw) && (p.dw0 === undefined || DWELL.indexOf(p.dw0) >= 0 && DWELL.indexOf(p.dw0) < DWELL.indexOf(p.dw))) { bump(d.dw, p.dw); if (p.dw0 !== undefined) bump(d.dw, p.dw0, -1); }
  if (F5STOP.includes(p.fl) && (p.fl0 === undefined || F5STOP.includes(p.fl0) && p.fl0 !== p.fl)) { bump(d.fl, p.fl); if (p.fl0 !== undefined) bump(d.fl, p.fl0, -1); }
  if (BUCKETS.includes(p.fps)) bump(d.fps, p.fps);
  if (Array.isArray(p.feat)) for (const f of p.feat.slice(0, 30)) if (FEATS.test(f)) bump(d.feat, f);
  if (p.m && typeof p.m === 'object') for (const [k, sec] of Object.entries(p.m).slice(0, 12)) { if (!FEATS.test(k) || !(sec >= 0 && sec < 86400 * 30)) continue;
    const x = d.m[k] = d.m[k] || { n: 0, sum: 0, b: {} }; x.n++; x.sum += Math.round(sec); bump(x.b, sec < 60 ? '<1m' : sec < 180 ? '1-3m' : sec < 600 ? '3-10m' : '10m+'); }
  if (p.f5 === 'finished' || p.f5 === 'skipped') bump(d.f5, p.f5);
  if (Array.isArray(p.dl)) for (const k of new Set(p.dl.slice(0, 9))) if (DLSTEP.includes(k)) bump(d.dl, k);
  if (p.eg && typeof p.eg === 'object') for (const [k, B] of Object.entries(EG)) { const v = p.eg[k], v0 = p.eg0 && p.eg0[k]; if (v === undefined) continue;
    if (B.includes(v) && (v0 === undefined || B.includes(v0) && v0 !== v)) { bump(d.eg, k + ':' + v); if (v0 !== undefined) bump(d.eg, k + ':' + v0, -1); } }
  if (Number.isInteger(p.sec) && p.sec > 0 && p.sec <= 6 * 3600) d.secs += p.sec;
}
async function flushStats(env) {
  statTimer = null; const buf = statBuf; statBuf = {}; if (!env.STATS) return;
  for (const [day, add] of Object.entries(buf)) {
    const key = `stats:${day}:${SHARD}`, cur = JSON.parse(await env.STATS.get(key) || 'null') || { ...EMPTY(), writes: 0 };
    cur.visits += add.visits; cur.back += add.back; cur.ios = (cur.ios || 0) + add.ios; cur.safe = cur.safe || {}; cur.batches += add.batches; cur.writes = (cur.writes || 0) + 1;
    for (const k of ['dev', 'safe', 'fps', 'feat', 'f5', 'dw', 'fl', 'dl', 'eg']) { cur[k] = cur[k] || {}; for (const [a, n] of Object.entries(add[k] || {})) if (n) bump(cur[k], a, n); }
    cur.secs = (cur.secs || 0) + add.secs;
    { const q = cur.pd = cur.pd || EMPTY_PD(), A = add.pd; q.visits += A.visits; q.back += A.back; q.clips += A.clips;
      for (const k of ['dev', 'dw']) for (const [a, n] of Object.entries(A[k])) if (n) bump(q[k], a, n);
      for (const k of ['ref', 'utm']) for (const [a, n] of Object.entries(A[k])) capped(q[k], a, n, CAP[k]);
      for (const [a, n] of Object.entries(A.sec)) capped(q.sec, a, n, CAP.psec); }
    for (const k of ['ref', 'utm']) { cur[k] = cur[k] || {}; for (const [a, n] of Object.entries(add[k])) capped(cur[k], a, n, CAP[k]); }
    for (const [k, x] of Object.entries(add.m)) { const c = cur.m[k] = cur.m[k] || { n: 0, sum: 0, b: {} }; c.n += x.n; c.sum += x.sum; for (const [b, n] of Object.entries(x.b)) bump(c.b, b, n); }
    for (const [e, n] of Object.entries(add.err)) if (cur.err[e] || Object.keys(cur.err).length < 60) bump(cur.err, e, n);
    await env.STATS.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 400 });
  }
}
async function stats(req, env, ctx) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const txt = await req.text(); if (txt.length > 8000) return json({ error: 'too big' }, 413);
  let p; try { p = JSON.parse(txt); } catch (e) { return json({ error: 'not JSON' }, 400); }
  if (!p || p.v !== 1) return json({ error: 'unknown format' }, 400);
  addStats(p);
  // written when the buffer is 5 minutes old, during a request (a timer that long would outlive the request; KV writes are scarce)
  if (!statFirst) statFirst = Date.now();
  if (!statTimer && (Date.now() - statFirst > STAT_EVERY || globalThis.__statFlushNow)) { statFirst = 0; statTimer = flushStats(env).catch(() => {}).finally(() => { statTimer = null; }); if (ctx && ctx.waitUntil) ctx.waitUntil(statTimer); else await statTimer; }
  return new Response(null, { status: 204 });
}

// the data lab's classifiers, through Jeffy's public server (playground.jeffyclassify.com, run by the Jeffy side; agreed 2026-10-30).
// Its asks: only capabilities and predict (an allowlist here), capabilities cached hard, predictions through /v1/predict/batch (which
// doesn't log the text), and a ceiling on requests in flight, because it is one 2-vCPU box that also serves jeffyclassify.com.
// So: one text per call through the batch endpoint, at most 2 calls in flight per isolate (the rest wait up to 8 s), a queue of 48,
// and 20 predictions a minute per visitor; above that the answer is 'busy' and the creature waits.
const JEFFY = 'https://playground.jeffyclassify.com';
const jq = { caps: null, capsT: 0, inflight: 0, queued: 0, hits: new Map() };
async function jeffyCaps(ctx) {
  if (jq.caps && Date.now() - jq.capsT < 6 * 3600e3) return jq.caps;
  const cache = caches.default, key = new Request(JEFFY + '/v1/capabilities');
  let r = await cache.match(key);
  if (!r) { r = await fetch(key, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('Jeffy answered ' + r.status); r = new Response(await r.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' } }); ctx && ctx.waitUntil(cache.put(key, r.clone())); }
  jq.caps = await r.json(); jq.capsT = Date.now(); return jq.caps;
}
async function jeffyPredict(task, text) {   // each request waits its own turn: a Worker can't safely answer one visitor's request from another's fetch
  if (jq.queued >= 48) return { error: 'busy' };
  jq.queued++;
  try {
    const t0 = Date.now(); while (jq.inflight >= 2) { if (Date.now() - t0 > 8000) return { error: 'busy' }; await new Promise(r => setTimeout(r, 120)); }
    jq.inflight++;
    try {
      const r = await fetch(JEFFY + '/v1/predict/batch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ texts: [String(text || '').slice(0, 500)], task }) });
      if (r.status === 429 || r.status >= 500) return { error: 'busy' };
      const d = r.ok ? await r.json() : null, P = d && d.predictions && d.predictions[0];
      return P ? { label: P.label, confidence: P.confidence, margin: P.margin, out_of_scope: P.out_of_scope, probabilities: P.probabilities } : { error: 'Jeffy answered ' + r.status };
    } catch (e) { return { error: 'busy' }; } finally { jq.inflight--; }
  } finally { jq.queued--; }
}
async function jeffy(req, path, ip, ctx) {
  if (path === '/jeffy/capabilities') return json(await jeffyCaps(ctx));
  if (path !== '/jeffy/predict' || req.method !== 'POST') return json({ error: 'not available' }, 404);   // allowlist: never train, feedback, events or anything else
  const k = ip + '|' + Math.floor(Date.now() / 60000), n = (jq.hits.get(k) || 0) + 1; jq.hits.set(k, n); if (jq.hits.size > 5000) jq.hits.clear();
  if (n > 20) return json({ error: 'busy' }, 429);
  const q = await req.json().catch(() => ({})); if (!q.text || !q.task) return json({ error: 'text and task needed' }, 400);
  const r = await jeffyPredict(String(q.task).slice(0, 80), q.text); return json(r, r.error ? 503 : 200);
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return cors(env, req, new Response(null, { status: 204 }));
    if (new URL(req.url).pathname.startsWith('/jeffy/')) { try { return cors(env, req, await jeffy(req, new URL(req.url).pathname, req.headers.get('CF-Connecting-IP') || 'local', ctx)); } catch (e) { return cors(env, req, json({ error: String(e.message || e).slice(0, 120) }, 502)); } }
    const url = new URL(req.url), path = url.pathname, ip = req.headers.get('CF-Connecting-IP') || 'local', min = Math.floor(Date.now() / 60000);
    // background calls a page makes by itself (stats batches, world-link polls, notices) count in their own, larger budget, so they
    // never use up what the player's own actions (reading a page, its pictures) may do in a minute
    const bg = path === '/lab/stats' || path === '/worlds/state' || path === '/lab/notices';
    const k = ip + '|' + min + (bg ? '|bg' : ''), n = (mem.hits.get(k) || 0) + 1; mem.hits.set(k, n); if (mem.hits.size > 5000) mem.hits.clear();
    if (n > (bg ? 240 : (+env.RATE_PER_MIN || 60))) return cors(env, req, json({ error: 'slow down: too many requests this minute' }, 429));
    // any helper request (world polls every 20 s, notices every 90 s) also writes a stats buffer that is 2 min old, so counts from a
    // quiet isolate aren't lost waiting for the next /lab/stats
    if (statFirst && !statTimer && Date.now() - statFirst > STAT_EVERY) { statFirst = 0; statTimer = flushStats(env).catch(() => {}).finally(() => { statTimer = null; }); if (ctx && ctx.waitUntil) ctx.waitUntil(statTimer); }
    if (path === '/lab/stats') return stats(req, env, ctx);   // rate-limited like the rest (that count lives in memory for a minute, never stored)
    const u = url.searchParams.get('url') || '', self = url.origin;
    try {
      if (path === '/lab/fetch') return cors(env, req, json(await readPage(u, env)));
      if (path === '/lab/page') { const { buf, ct, final } = await grab(u, env, 2500000, 'text/html'); if (!ct.includes('html')) throw new Error('not a web page'); return cors(env, req, json({ url: final, html: new TextDecoder().decode(buf) })); }
      if (path === '/lab/img') { const { buf, ct } = await grab(u, env, 4000000, 'image/*'); if (!ct.startsWith('image/')) throw new Error('not an image'); return cors(env, req, new Response(buf, { headers: { 'Content-Type': ct } })); }
      if (path === '/lab/asset') return cors(env, req, await asset(u, env, self));
      if (path.startsWith('/worlds/')) return cors(env, req, await worlds(req, env, path));
      return cors(env, req, json({ error: 'unknown path' }, 404));
    } catch (e) { return cors(env, req, path === '/lab/img' || path === '/lab/asset' ? new Response('', { status: 502 }) : json({ error: String(e.message || e).slice(0, 200) })); }
  },
};
