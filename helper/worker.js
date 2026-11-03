// Id|le helper: the two things a static site can't do by itself, as one Cloudflare Worker.
//   1. read web pages for the creatures: /lab/fetch (text + images + links), /lab/page (raw HTML for travel mode),
//      /lab/asset (CSS/fonts/images of a travelled page), /lab/img (image bytes for pixel-sorting). Same JSON as demo_server.py.
//   2. link worlds: /worlds/{state,register,link,approve,unlink,send,ack,view}, kept in the WORLDS KV namespace
//      (without one it falls back to memory: fine for a test, forgets on every restart).
// Limits: only http(s) to public hosts, page reads capped (600 KB text, 2.5 MB HTML, 4 MB images/assets), 60 requests a minute
// per visitor, and only the origins in ALLOWED_ORIGINS may use it. No cookies, no logging of what is fetched.
const UA = 'Mozilla/5.0 (compatible; Id|le helper/1.0; +https://id-le.com; https://github.com/nicobrenner/id-le)';   // Wikimedia's User-Agent policy: name the tool and a way to reach us
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
  const wiki = /(^|\.)wikipedia\.org$/i.test(new URL(u).hostname);   // Wikipedia's menus ("Jump to content", "Donate", "Toggle … subsection") aren't the article
  let credits; try { credits = await wikiCredits(images, env); } catch (e) { credits = undefined; }   // never let credits break a page read
  return { title: title ? strip(title).slice(0, 120) : u, text, images, ...(credits ? { credits } : {}), ui: wiki ? [] : ui.sort(() => Math.random() - 0.5).slice(0, 14), links, url: u };
}

// Credits for Wikimedia pictures (Wikipedia worlds): author, license and the file's page, from the Commons (or the wiki's own) API.
// `credits` is a list parallel to `images` (null where a picture isn't a Wikimedia file), so older pages that only read `images` keep working.
// One API call per wiki per page read; each file's answer is cached for a day (Cache API in production, memory elsewhere).
function wikiFile(src) {   // https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Name.jpg/250px-Name.jpg -> { wiki: 'commons', file: 'Name.jpg' }
  let url; try { url = new URL(src); } catch (e) { return null; }
  if (!/^(upload|thumb)\.wikimedia\.org$/i.test(url.hostname)) return null;
  const seg = url.pathname.split('/').filter(Boolean); if (seg[0] !== 'wikipedia' || seg.length < 4) return null;
  const wiki = seg[1], i = seg[2] === 'thumb' ? 5 : 4, name = seg[i]; if (!name || !/^[a-z-]{2,20}$/i.test(wiki)) return null;
  let file; try { file = decodeURIComponent(name); } catch (e) { return null; }
  return { wiki, file: file.replace(/_/g, ' ') };
}
const creditMem = new Map();
async function wikiCredits(images, env) {
  const files = images.map(wikiFile); if (!files.some(Boolean)) return undefined;
  const out = images.map(() => null), cache = typeof caches !== 'undefined' ? caches.default : null, key = f => `https://id-le.com/__credits/${f.wiki}/${encodeURIComponent(f.file)}`;
  const need = new Map();   // wiki -> [index...]
  for (let i = 0; i < files.length; i++) { const f = files[i]; if (!f) continue; const k = key(f);
    let hit = creditMem.get(k); if (!hit && cache) { const r = await cache.match(k); if (r) hit = await r.json(); }
    if (hit && Date.now() - (hit.t || 0) < 86400000) { out[i] = hit.c; continue; }
    if (!need.has(f.wiki)) need.set(f.wiki, []); need.get(f.wiki).push(i); }
  for (const [wiki, idx] of need) {
    const host = wiki === 'commons' ? 'commons.wikimedia.org' : `${wiki}.wikipedia.org`;
    const titles = [...new Set(idx.map(i => 'File:' + files[i].file))].join('|');
    const api = `https://${host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|Credit&titles=${encodeURIComponent(titles)}`;
    const r = await fetch(api, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 86400 } }); if (!r.ok) continue;
    const pages = Object.values(((await r.json()).query || {}).pages || {});
    const byTitle = new Map(pages.map(p => [String(p.title || '').replace(/_/g, ' ').toLowerCase(), p]));
    for (const i of idx) { const p = byTitle.get(('File:' + files[i].file).toLowerCase()); const info = p && p.imageinfo && p.imageinfo[0]; if (!info) continue;
      const m = info.extmetadata || {}, v = k => m[k] && typeof m[k].value === 'string' ? m[k].value : '';
      const lic = /^https?:\/\//.test(v('LicenseUrl')) ? v('LicenseUrl') : '', page = /^https?:\/\//.test(info.descriptionurl || '') ? info.descriptionurl : `https://${host}/wiki/${encodeURIComponent('File:' + files[i].file.replace(/ /g, '_'))}`;
      const c = { file: files[i].file.slice(0, 160), author: strip(v('Artist')).slice(0, 160) || strip(v('Credit')).slice(0, 160) || 'unknown author', license: strip(v('LicenseShortName')).slice(0, 60) || 'see the file page', licenseUrl: lic, page, source: wiki === 'commons' ? 'Wikimedia Commons' : `${wiki}.wikipedia.org` };
      out[i] = c; const rec = { t: Date.now(), c }; creditMem.set(key(files[i]), rec); if (creditMem.size > 2000) creditMem.clear();
      if (cache) { try { await cache.put(key(files[i]), new Response(JSON.stringify(rec), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' } })); } catch (e) {} } } }
  return out;
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
// single visit and never an address. Each isolate adds reports to a small buffer and writes it STAT_EVERY after the first one,
// inside that request's own waitUntil (one read-modify-write of its shard key stats:<UTC day>:<shard>). Workers give waitUntil
// about 30 s after the response, so the wait stays under that: a longer buffer (the 2-min one of 11-01) waited for a later
// request that often never came, and the isolate was evicted with its counts (177 reports accepted that morning, ~33 visits kept).
const SHARD = Math.floor(Math.random() * 16).toString(16), FEATS = /^[a-z0-9_-]{1,24}$/, BUCKETS = ['<20', '20-40', '40-55', '55+'];
// where visits came from (the referring site's name only), a campaign tag, time on screen, where a guided start stopped
const REF = /^[a-z0-9][a-z0-9.-]{0,59}$/, UTM = /^[a-z0-9-]{1,24}$/, DWELL = ['<1', '1-5', '5-20', '20+'];
const DLSTEP = ['what', 'travel', 'irc', 'kinds', 'team', 'review', 'stats', 'where', 'finished', 'ended'];
const GSTEP = ['light', 'words', 'creatures', 'weather', 'music', 'hut', 'guided', 'skipped'];   // the genesis steps and how its guide ended (idle-genesis.js)   // the data lab walkthrough (idle-dlwalk.js)
const F5STOP = ['none', 'card', 'hwwiki', 'name', 'feed', 'dream', 'gazette', 'weather', 'reel', 'keep', 'finished', 'skipped'];
// engagement, per page load and counted once in its last bucket (eg0 takes back the bucket reported before): creatures in the world,
// and how many were born, charts made, buildings finished and words fed during the page load; plus visible seconds, a plain daily sum
const EG = { cr: ['0-12', '13-30', '31-60', '61-150', '151+'], born: ['0', '1-5', '6-20', '21+'], built: ['0', '1-5', '6-20', '21+'], charts: ['0', '1-5', '6-20', '21+'], fed: ['0', '1-5', '6-20', '21+'] };
const PSEC = /^[a-z0-9-]{1,40}$/;
EG.reels = ['0', '1-5', '6-20', '21+']; EG.errs = ['0', '1', '2-5', '6+'];   // v2: reels played, errors seen (a bucket per page load)
// engagement v2 (11-01), all daily sums of small per-report deltas, keys from fixed lists:
//   did   page loads that did something (once per page load): watched a reel / one to the end / a dream / a mind, sent an IRC line,
//         an @inbox line or an Operator message, rage-clicked, left within 30 s of the first click, left without any click, had a panel open
//   ws    seconds watching (reel, dream, mind) · pt  seconds each panel was open · ct  counts (reels played and finished, dreams opened,
//   IRC lines, @inbox lines, Operator messages, pedia links) · opa  Operator actions that ran · fav  attention by job, family, body and
//   starter-world name · rage  where rage clicks happened · path  the first three features opened (counted once, in the last path reached)
const X_PANELS = ['music', 'studio', 'lab', 'advisor', 'almanac', 'drawer', 'trees', 'reels', 'operator', 'creatures', 'irc'];
const X = { did: ['w_reel', 'w_reel_end', 'w_dream', 'w_mind', 'irc_msg', 'inbox_msg', 'op_msg', 'rage', 'quick_exit', 'no_interact'].concat(X_PANELS.map(k => 'p_' + k)),
  ws: ['reel', 'dream', 'mind'], pt: X_PANELS, ct: ['reelplay', 'reelend', 'dream', 'irc', 'inbox', 'op', 'pedia'],
  opa: ['creature', 'disaster', 'evolve', 'look', 'rave_off', 'rave_on', 'rename', 'spawn', 'weather', 'ai_say', 'ai_weather', 'ai_spawn', 'ai_words', 'ai_disaster'],
  rage: ['advBtn', 'djBtn', 'reelsBtn', 'drawerBtn', 'treesBtn', 'almanacBtn', 'studioBtn', 'herdBtn', 'ntfBtn', 'pediaBtn', 'labBtn', 'connBtn', 'snapBtn', 'evolveWorldBtn', 'lab-toggle', 'rc-open',
    'settingsBtn', 'soundBtn', 'mMore', 'collBtn', 'addBtn', 'whisper', 'studio', 'team', 'dj', 'advpanel', 'almanac', 'drawer', 'trees', 'reelpanel', 'reel', 'lab', 'roomchat', 'settings', 'conn', 'herd',
    'insp', 'quick', 'minimap', 'topbar', 'placesBar', 'ntf', 'mSheet', 'zoomCtl', 'world', 'other', 'whisper:hangry', 'whisper:mutate', 'whisper:big', 'whisper:revert', 'whisper:keep', 'whisper:clone', 'whisper:portrait', 'whisper:rest', 'whisper:input', 'whisper:name', 'whisper:text', 'whisper:head', 'world:creature', 'world:word', 'world:empty', 'world:thing'] };
// the Operator (11-01): outcomes, the guessed action and a confidence bucket, retries, giving up, caps and ?!/!!, a mood label computed in
// the player's browser, genesis tries/nudges/steps; never any text. Every key is built from these fixed lists.
X.op = [].concat(['acted', 'unsure', 'nudged', 'chat', 'error'].map(k => 'out:' + k), ['tool', 'none', 'error'].map(k => 'byo:' + k), ['lo', 'mid', 'hi'].map(k => 'cf:' + k),
  ['rephrase', 'abandon', 'caps', 'punct'].map(k => 'fr:' + k), ['negative', 'neutral', 'positive'].flatMap(k => ['mood:' + k, 'mm:' + k]),
  ['bring', 'chop', 'come', 'fetch', 'greet', 'hand', 'hide', 'sleep', 'none', 'creature', 'disaster', 'evolve', 'look', 'rave_off', 'rave_on', 'rename', 'spawn', 'weather', 'words', 'first_creatures', 'light', 'music'].map(k => 'opt:' + k),
  ['words', 'creatures', 'light', 'weather', 'hut', 'music'].flatMap(k => ['gt:' + k, 'gn:' + k, 'gd:' + k]));
X.did.push('op_miss', 'op_rephrase', 'op_abandon');
const FAV = /^(job|fam|body):[a-z_]{1,16}$|^name:[A-Za-z][A-Za-z|' -]{0,19}$/, PATHSEGS = ['advisor', 'music', 'reels', 'drawer', 'trees', 'almanac', 'studio', 'creatures', 'notices', 'pedia', 'datalab',
  'connect', 'snapshot', 'evolve', 'chat', 'roomchat', 'settings', 'sound', 'more', 'collection', 'add', 'card'];
const okPath = v => typeof v === 'string' && v.length <= 80 && v.split('>').length <= 3 && v.split('>').every(x => PATHSEGS.includes(x)) && new Set(v.split('>')).size === v.split('>').length;
const X_CAP = { fav: 60, rage: 50, path: 30 }, EMPTY_X = () => ({ did: {}, ws: {}, pt: {}, ct: {}, opa: {}, fav: {}, rage: {}, path: {}, op: {} });   // the pedia's own section ids (headings it scrolled into view)
const CAP = { ref: 30, utm: 20, psec: 80 };   // distinct names kept per day and shard; the rest are counted as 'other'
const capped = (o, k, n, cap) => bump(o, o[k] != null || Object.keys(o).length < cap ? k : 'other', n);
const EMPTY_PD = () => ({ visits: 0, back: 0, dev: {}, ref: {}, utm: {}, dw: {}, sec: {}, clips: 0 });   // the pedia's own block
// the storyline's funnel moments (demo/idle-epoch0.js, idle-genesis.js); anything else is dropped
const SFSTEP = ['title', 'messages', 'chat', 'boot', 'run', 'crash', 'landing', 'operator', 'lights', 'e1words', 'e1life', 'e1done', 'skip:title', 'skip:messages', 'skip:chat', 'skip:boot', 'skip:run', 'skip:crash', 'skip:landing', 'offer_shown', 'offer_accepted', 'end_shown', 'end_roadmap', 'end_github', 'end_free',
  // the Founder gift (idle-founder.js): eligible by an early world or by a gift link, the offer, the letter, the creator, experiments (1+, 5+, 20+), released, the badge chosen
  'fd_world', 'fd_link', 'fd_personal', 'fd_offer', 'fd_letter', 'fd_creator', 'fd_exp1', 'fd_exp5', 'fd_exp20', 'fd_released', 'fd_badge_pipe', 'fd_badge_spark', 'fd_badge_laurel', 'fd_badge_seed', 'fd_badge_crown'];
const EMPTY = () => ({ pv: EMPTY_PV(), v2visits: 0, visits: 0, back: 0, ios: 0, safe: {}, dev: {}, fps: {}, feat: {}, m: {}, f5: {}, err: {}, ref: {}, utm: {}, dw: {}, fl: {}, dl: {}, eg: {}, gv: {}, gs: {}, gss: {}, sf: {}, secs: 0, pd: EMPTY_PD(), x: EMPTY_X(), batches: 0 });
let statBuf = {}, statTimer = null; const STAT_EVERY = 20000;   // ms; must stay well under the ~30 s waitUntil allowance
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
  if (p.visit === 1 && p.v2 === 1) d.v2visits++;
  if (p.visit === 1) { d.visits++; if (p.back === 1) d.back++; if (p.ios === 1) d.ios++; if ([0, 1, 2].includes(p.safe)) bump(d.safe, String(p.safe)); if (p.dev === 'phone' || p.dev === 'desktop') bump(d.dev, p.dev);
    if (typeof p.ref === 'string') capped(d.ref, REF.test(p.ref) ? p.ref : 'other', 1, CAP.ref); if (typeof p.utm === 'string' && UTM.test(p.utm)) capped(d.utm, p.utm, 1, CAP.utm); }
  // a page load moves up through the buckets: add the new one, take back the one it reported before (sums stay one per page load)
  if (DWELL.includes(p.dw) && (p.dw0 === undefined || DWELL.indexOf(p.dw0) >= 0 && DWELL.indexOf(p.dw0) < DWELL.indexOf(p.dw))) { bump(d.dw, p.dw); if (p.dw0 !== undefined) bump(d.dw, p.dw0, -1); }
  if (F5STOP.includes(p.fl) && (p.fl0 === undefined || F5STOP.includes(p.fl0) && p.fl0 !== p.fl)) { bump(d.fl, p.fl); if (p.fl0 !== undefined) bump(d.fl, p.fl0, -1); }
  // the genesis A/B (idle-genesis.js; off until Nico switches it on): visits, time on screen and features per variant
  // the storyline's funnel: each moment once per browser, by arm (story | current | none)
  if (Array.isArray(p.sf)) { const arm = p.gv === 'story' || p.gv === 'current' ? p.gv : 'none'; for (const k of new Set(p.sf.slice(0, 30))) if (SFSTEP.includes(k)) { d.sf = d.sf || {}; bump(d.sf, arm + '|' + k); } }
  if (p.gv === 'genesis' || p.gv === 'starter' || p.gv === 'story' || p.gv === 'current') { d.gv = d.gv || {}; if (p.visit === 1) bump(d.gv, p.gv + '|visit');
    if (DWELL.includes(p.dw) && (p.dw0 === undefined || DWELL.indexOf(p.dw0) >= 0 && DWELL.indexOf(p.dw0) < DWELL.indexOf(p.dw))) { bump(d.gv, p.gv + '|dw:' + p.dw); if (p.dw0 !== undefined) bump(d.gv, p.gv + '|dw:' + p.dw0, -1); }
    if (Array.isArray(p.feat)) for (const f of p.feat.slice(0, 30)) if (FEATS.test(f)) bump(d.gv, p.gv + '|feat:' + f); }
  if (BUCKETS.includes(p.fps)) bump(d.fps, p.fps);
  if (Array.isArray(p.feat)) for (const f of p.feat.slice(0, 30)) if (FEATS.test(f)) bump(d.feat, f);
  if (p.m && typeof p.m === 'object') for (const [k, sec] of Object.entries(p.m).slice(0, 12)) { if (!FEATS.test(k) || !(sec >= 0 && sec < 86400 * 30)) continue;
    const x = d.m[k] = d.m[k] || { n: 0, sum: 0, b: {} }; x.n++; x.sum += Math.round(sec); bump(x.b, sec < 60 ? '<1m' : sec < 180 ? '1-3m' : sec < 600 ? '3-10m' : '10m+'); }
  if (p.f5 === 'finished' || p.f5 === 'skipped') bump(d.f5, p.f5);
  if (Array.isArray(p.dl)) for (const k of new Set(p.dl.slice(0, 10))) if (DLSTEP.includes(k)) bump(d.dl, k);
  if (p.gs && typeof p.gs === 'object' && !Array.isArray(p.gs)) for (const [k, v] of Object.entries(p.gs).slice(0, 10)) if (GSTEP.includes(k) && Number.isFinite(v) && v >= 0 && v <= 3600) { d.gs = d.gs || {}; d.gss = d.gss || {}; bump(d.gs, k); if (v) bump(d.gss, k, Math.round(v)); }
  if (p.eg && typeof p.eg === 'object') for (const [k, B] of Object.entries(EG)) { const v = p.eg[k], v0 = p.eg0 && p.eg0[k]; if (v === undefined) continue;
    if (B.includes(v) && (v0 === undefined || B.includes(v0) && v0 !== v)) { bump(d.eg, k + ':' + v); if (v0 !== undefined) bump(d.eg, k + ':' + v0, -1); } }
  if (Number.isInteger(p.sec) && p.sec > 0 && p.sec <= 6 * 3600) d.secs += p.sec;
  // engagement v2: every key from a fixed list (or the favorites pattern), every number a small positive integer
  const x = p.x, D = d.x = d.x || EMPTY_X();
  if (x && typeof x === 'object') {
    if (Array.isArray(x.did)) for (const f of new Set(x.did.slice(0, 40))) if (X.did.includes(f)) bump(D.did, f);
    for (const [k, max] of [['ws', 6 * 3600], ['pt', 6 * 3600], ['ct', 500], ['opa', 500], ['rage', 500], ['op', 500]]) { const o = x[k]; if (!o || typeof o !== 'object') continue;
      for (const [a, n] of Object.entries(o).slice(0, 60)) if (X[k].includes(a) && Number.isInteger(n) && n > 0 && n <= max) (k === 'rage' ? capped(D.rage, a, n, X_CAP.rage) : bump(D[k], a, n)); }
    if (x.fav && typeof x.fav === 'object') for (const [a, n] of Object.entries(x.fav).slice(0, 60)) if (FAV.test(a) && Number.isInteger(n) && n > 0 && n <= 500) capped(D.fav, a, n, X_CAP.fav); }
  if (okPath(p.path) && (p.path0 === undefined || okPath(p.path0) && p.path0 !== p.path)) { capped(D.path, p.path, 1, X_CAP.path); if (p.path0 !== undefined) bump(D.path, p.path0, -1); }
}
async function flushStats(env) {
  statTimer = null; const buf = statBuf; statBuf = {}; if (!env.STATS) return;
  for (const [day, add] of Object.entries(buf)) {
    const key = `stats:${day}:${SHARD}`, cur = JSON.parse(await env.STATS.get(key) || 'null') || { ...EMPTY(), writes: 0 };
    cur.visits += add.visits; cur.back += add.back; cur.ios = (cur.ios || 0) + add.ios; cur.safe = cur.safe || {}; cur.batches += add.batches; cur.writes = (cur.writes || 0) + 1;
    for (const k of ['dev', 'safe', 'fps', 'feat', 'f5', 'dw', 'fl', 'dl', 'eg', 'gv', 'gs', 'gss', 'sf']) { cur[k] = cur[k] || {}; for (const [a, n] of Object.entries(add[k] || {})) if (n) bump(cur[k], a, n); }
    cur.secs = (cur.secs || 0) + add.secs; cur.v2visits = (cur.v2visits || 0) + (add.v2visits || 0);
    cur.pv = mergePv(cur.pv, add.pv);
    { const q = cur.x = cur.x || EMPTY_X(); for (const k of Object.keys(EMPTY_X())) { q[k] = q[k] || {}; for (const [a, n] of Object.entries((add.x || {})[k] || {})) if (n) (X_CAP[k] ? capped(q[k], a, n, X_CAP[k]) : bump(q[k], a, n)); } }
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
// ---------- page views, counted by the server (11-01) ----------
// Every HTML page request that reaches the Pages worker ('/', the pedia, the privacy page) is counted here, so a visit counts whether
// or not the page's own script ever runs. Only daily totals are kept, in the same batched write as the in-page stats (the pv block
// of stats:<day>:<shard>): page views and visits per page, bots apart, the referring site's name, utm_source, phone/tablet/desktop,
// country (Cloudflare's request.cf.country). Unique visitors without cookies or IDs, the way Plausible does it: SHA-256 of a daily
// salt + IP + User-Agent goes into a HyperLogLog sketch (2,048 one-byte registers, standard error about 2.3%); the sketch is all that
// is stored. The salt is new each UTC day (from the UV_SECRET env var + the date, or a random value kept in KV that expires 30 hours
// after its day starts), so a hash can't be linked across days. A visit is a page view whose hash wasn't seen in the last 30 minutes
// in this isolate's memory (so the one-time reload for cross-origin isolation doesn't count twice); that memory is never written.
const PV_PAGES = { '/': 'game', '/index.html': 'game', '/arena.html': 'game', '/pedia': 'pedia', '/pedia.html': 'pedia', '/privacy': 'privacy', '/privacy.html': 'privacy' };
const HLL_P = 11, HLL_M = 1 << HLL_P, PV_CAP = { ref: 40, utm: 30, cc: 80 };
const EMPTY_PV = () => ({ views: {}, visits: {}, gpc: {}, bots: {}, botWhy: {}, ref: {}, utm: {}, dev: {}, cc: {}, hll: {} });
// bots, previews and scripts: never counted with people. Real browsers send a long UA and Accept-Language; these don't, or say so.
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|preview|scan|monitor|uptime|pingdom|lighthouse|headless|phantom|selenium|puppeteer|playwright|curl|wget|python|httpie|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|perl\/|ruby|php\/|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|slack|skype|vkshare|w3c_validator|feedfetcher|mediapartners|apis-google|bingpreview|yandex|baidu|semrush|ahrefs|mj12|dotbot|petal|bytespider|gptbot|claude|anthropic|perplexity|ccbot|chatgpt|amazonbot|applebot|duckduckgo|qwant|seznam|archive\.org|ia_archiver|validator|linkchecker|nutch|scrapy|httpclient|dataprovider|googleother|google-inspectiontool|cloudflare/i;
function pvBot(req) {
  const ua = req.headers.get('User-Agent') || '';
  if (ua.length < 25) return 'no-ua';
  if (BOT_UA.test(ua)) return 'ua';
  if (!req.headers.get('Accept-Language')) return 'no-lang';
  return '';
}
const pvDev = ua => /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'phone' : 'desktop';
// the referring site's name only (never the path), mapped like idle-ref.js; 'direct' for none or our own pages, 'hidden' when the
// browser says the click came from another site (Sec-Fetch-Site: cross-site) but sent no Referer (reader apps, rel=noreferrer…)
function pvRef(r, self, site) {
  if (!r) return site === 'cross-site' ? 'hidden' : 'direct'; if (/^android-app:\/\/com\.reddit\./i.test(r)) return 'reddit.com';
  let h = ''; try { h = new URL(r).hostname.toLowerCase(); } catch (e) { return 'other'; }
  if (!h || h === self || /(^|\.)id-le\.(com|pages\.dev)$/.test(h)) return 'direct';
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
  return /^[a-z0-9][a-z0-9.-]{0,59}$/.test(h) ? h : 'other';
}
const pvSalt = { day: '', v: '' };
async function saltFor(day, env) {
  if (pvSalt.day === day) return pvSalt.v;
  let v = env.UV_SECRET ? env.UV_SECRET + '|' + day : '';
  if (!v && env.STATS) { const k = 'salt:' + day; v = await env.STATS.get(k) || '';
    if (!v) { v = crypto.randomUUID() + crypto.randomUUID(); await env.STATS.put(k, v, { expirationTtl: 30 * 3600 }); } }   // one write a day; gone the next day
  if (!v) v = crypto.randomUUID() + day;   // no KV (a local test): this isolate's own salt
  pvSalt.day = day; pvSalt.v = v; return v;
}
function hllAdd(reg, b) {   // b: 32 bytes of SHA-256; the first 11 bits pick a register, the next 53 give the rank (position of the first 1)
  const idx = (b[0] << 3) | (b[1] >> 5); let r = 1;
  for (let i = HLL_P; i < 64; i++) { if ((b[i >> 3] >> (7 - (i & 7))) & 1) break; r++; }
  if (r > reg[idx]) reg[idx] = r;
}
function hllCount(reg) {   // the standard estimate with the small-range correction
  let z = 0, sum = 0; for (let i = 0; i < HLL_M; i++) { sum += Math.pow(2, -reg[i]); if (!reg[i]) z++; }
  const e = (0.7213 / (1 + 1.079 / HLL_M)) * HLL_M * HLL_M / sum;
  return e <= 2.5 * HLL_M && z ? HLL_M * Math.log(HLL_M / z) : e;
}
const b64e = reg => { let s = ''; for (let i = 0; i < reg.length; i++) s += String.fromCharCode(reg[i]); return btoa(s); };
const b64d = s => { try { const t = atob(s); if (t.length !== HLL_M) return null; const r = new Uint8Array(HLL_M); for (let i = 0; i < HLL_M; i++) r[i] = t.charCodeAt(i); return r; } catch (e) { return null; } };
function mergePv(cur, add) {   // counters add up; sketches merge register by register (max); distinct names are capped per day and shard
  cur = cur || EMPTY_PV(); if (!add) return cur;
  for (const k of ['views', 'visits', 'gpc', 'bots', 'botWhy', 'dev']) { cur[k] = cur[k] || {}; for (const [a, n] of Object.entries(add[k] || {})) if (n) bump(cur[k], a, n); }
  for (const k of ['ref', 'utm', 'cc']) { cur[k] = cur[k] || {}; for (const [a, n] of Object.entries(add[k] || {})) capped(cur[k], a, n, PV_CAP[k]); }
  cur.hll = cur.hll || {};
  for (const [k, reg] of Object.entries(add.hll || {})) { const r = reg instanceof Uint8Array ? reg : b64d(reg); if (!r) continue;
    const c = (cur.hll[k] && b64d(cur.hll[k])) || new Uint8Array(HLL_M); for (let i = 0; i < HLL_M; i++) if (r[i] > c[i]) c[i] = r[i]; cur.hll[k] = b64e(c); }
  return cur;
}
const recent = new Map();   // hash prefix → last seen (ms): this isolate's memory only, 30 minutes, never written anywhere
async function pageview(req, env, page, res) {
  try {
    if (req.method !== 'GET' || !res || (res.status !== 200 && res.status !== 304) || !(req.headers.get('Accept') || '').includes('text/html')) return;   // 304: a returning visit revalidated by the service worker
    if (new URL(req.url).searchParams.has('_coi')) return;   // the page's one-time cross-origin-isolation reload (idle-runtime.js): the same visit, not a new view
    const purpose = (req.headers.get('Sec-Purpose') || req.headers.get('Purpose') || '').toLowerCase(); if (/prefetch|prerender/.test(purpose)) return;
    const day = new Date().toISOString().slice(0, 10), d = statBuf[day] = statBuf[day] || EMPTY(), P = d.pv = d.pv || EMPTY_PV();
    const why = pvBot(req);
    if (why) { bump(P.bots, page); bump(P.botWhy, why); return; }   // bots never start a write of their own: they ride along with the next batch
    bump(P.views, page);
    // a browser that asks not to be tracked (Global Privacy Control or Do Not Track) is a page view only: no visitor sketch, no visit,
    // no referrer, device or country
    if (req.headers.get('Sec-GPC') === '1' || req.headers.get('DNT') === '1') { bump(P.gpc, page); return batch(env) || undefined; }
    const ip = req.headers.get('CF-Connecting-IP') || '', ua = req.headers.get('User-Agent') || '';
    const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode((await saltFor(day, env)) + '|' + ip + '|' + ua)));
    for (const k of ['all', page]) hllAdd(P.hll[k] = P.hll[k] instanceof Uint8Array ? P.hll[k] : new Uint8Array(HLL_M), b);
    const hk = day + ':' + Array.from(b.slice(0, 8)).join('.'), now = Date.now(), last = recent.get(hk); recent.set(hk, now);
    if (recent.size > 20000) for (const [k, t] of recent) if (now - t > 30 * 60e3) recent.delete(k);
    if (!last || now - last > 30 * 60e3) {   // a new visit: where it came from, on what, from which country (counted once per visit)
      const url = new URL(req.url); bump(P.visits, page);
      capped(P.ref, pvRef(req.headers.get('Referer') || '', url.hostname, req.headers.get('Sec-Fetch-Site') || ''), 1, PV_CAP.ref);
      const u = (url.searchParams.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24); if (u) capped(P.utm, u, 1, PV_CAP.utm);
      bump(P.dev, pvDev(ua));
      const cc = req.cf && typeof req.cf.country === 'string' && /^[A-Z0-9]{2}$/.test(req.cf.country) ? req.cf.country : 'XX'; capped(P.cc, cc, 1, PV_CAP.cc);
    }
    return batch(env) || undefined;
  } catch (e) {}
}

async function stats(req, env, ctx) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const txt = await req.text(); if (txt.length > 8000) return json({ error: 'too big' }, 413);
  let p; try { p = JSON.parse(txt); } catch (e) { return json({ error: 'not JSON' }, 400); }
  if (!p || p.v !== 1) return json({ error: 'unknown format' }, 400);
  addStats(p);
  // the first report of a batch starts the timer and holds its request open (waitUntil) until the batch is written; reports that
  // arrive meanwhile join the same buffer, so a busy isolate writes at most once per STAT_EVERY
  const t = batch(env); if (t) { if (ctx && ctx.waitUntil) ctx.waitUntil(t); else await t; }
  return new Response(null, { status: 204 });
}
function batch(env) {   // starts the batch timer if none runs; returns its promise only to the request that started it
  if (statTimer) return null;
  statTimer = new Promise(r => setTimeout(r, globalThis.__statFlushNow ? 0 : STAT_EVERY)).then(() => flushStats(env)).catch(() => {}).finally(() => { statTimer = null; });
  return statTimer;
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

// ---------- Tell the Oracle and the roadmap (11-01) ----------
// What a player tells the Oracle goes to a private review queue (fb:<time>:<rand> in STATS, kept 180 days): read by the maker with
// tools/feedback.py, never published by itself and never sent to GitHub. Emails, links and phone numbers are blanked here too, not only
// in the page. The public roadmap (roadmap:public) is written by the maker with the same tool; anyone may vote, once per item per day
// per visitor (an address hash with the daily salt, as for page views: kept two days, nothing that identifies a person).
const FB_KINDS = ['idea', 'bug', 'loved', 'off'], FB_DAY_MAX = 5, VOTE_DAY_MAX = 40, FB_TTL = 180 * 86400;
const fbMem = { road: null, roadT: 0, votes: null, n: new Map(), kv: new Map() };
const fbKV = env => env.STATS || { get: async k => fbMem.kv.get(k) ?? null, put: async (k, v) => { fbMem.kv.set(k, v); }, delete: async k => { fbMem.kv.delete(k); } };
function scrub(t, max) {
  return String(t || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]').replace(/\b[a-z0-9-]+\.(?:com|net|org|io|dev|app|me|co|info)(?:\/\S*)?/gi, '[link]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]').replace(/\s+/g, ' ').trim().slice(0, max);
}
const fbCtx = c => { c = c && typeof c === 'object' ? c : {}; const o = {};
  if (typeof c.page === 'string' && /^\/[a-z0-9/._-]{0,39}$/i.test(c.page)) o.page = c.page;
  if (typeof c.place === 'string' && /^[a-z]{1,12}$/.test(c.place)) o.place = c.place;
  if (typeof c.build === 'string' && /^[a-f0-9]{4,12}$/.test(c.build)) o.build = c.build;
  if (['phone', 'tablet', 'desktop'].includes(c.device)) o.device = c.device;
  if (typeof c.err === 'string' && c.err) o.err = scrub(c.err, 160);
  return o; };
async function fbHash(env, ip, what) { const day = new Date().toISOString().slice(0, 10);
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode((await saltFor(day, env)) + '|' + what + '|' + ip)));
  return [day, Array.from(b.slice(0, 8), x => x.toString(16).padStart(2, '0')).join('')]; }
async function roadmap(env) {   // the public list and its vote counts, kept a minute in this isolate (reads are cheap, but not free)
  if (fbMem.road && Date.now() - fbMem.roadT < 60e3) return fbMem.road;
  const kv = fbKV(env); let items = [], votes = {};
  try { const r = JSON.parse(await kv.get('roadmap:public') || 'null'); if (r && Array.isArray(r.items)) items = r.items; } catch (e) {}
  try { votes = JSON.parse(await kv.get('roadmap:votes') || '{}') || {}; } catch (e) {}
  fbMem.road = { items, votes, url: 'https://github.com/nicobrenner/id-le/issues/20' }; fbMem.roadT = Date.now(); return fbMem.road; }
async function feedback(req, env, path, ip) {
  const kv = fbKV(env);
  if (path === '/lab/roadmap') return json(await roadmap(env));
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const txt = await req.text(); if (txt.length > 4000) return json({ error: 'too big' }, 413);
  let q; try { q = JSON.parse(txt); } catch (e) { return json({ error: 'not JSON' }, 400); }
  if (path === '/lab/oracle') {
    const kind = FB_KINDS.includes(q.kind) ? q.kind : null, text = scrub(q.text, 600);
    if (!kind || text.length < 2) return json({ error: 'a kind and a few words, please' }, 400);
    const [day, h] = await fbHash(env, ip, 'fb'), rk = 'fbrl:' + day + ':' + h;
    const seen = Math.max(fbMem.n.get(rk) || 0, +(await kv.get(rk)) || 0); if (seen >= FB_DAY_MAX) return json({ error: 'the Oracle has heard a lot from you today: come back tomorrow' }, 429);
    fbMem.n.set(rk, seen + 1); await kv.put(rk, String(seen + 1), { expirationTtl: 2 * 86400 });
    const id = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + '-' + crypto.randomUUID().slice(0, 6);
    await kv.put('fb:' + id, JSON.stringify({ t: Date.now(), kind, text, ctx: fbCtx(q.ctx), status: 'new' }), { expirationTtl: FB_TTL });
    return json({ ok: true, id });
  }
  if (path === '/lab/vote') {
    const id = String(q.id || ''); if (!/^[a-z0-9-]{1,40}$/.test(id)) return json({ error: 'which item?' }, 400);
    const road = await roadmap(env); if (!road.items.some(x => x.id === id)) return json({ error: 'no such item' }, 404);
    const [day, h] = await fbHash(env, ip, 'vote'), vk = 'vote:' + day + ':' + h + ':' + id, ck = 'vrl:' + day + ':' + h;
    if (fbMem.n.get(vk) || await kv.get(vk)) return json({ ok: true, already: true, votes: road.votes[id] || 0 });
    const n = fbMem.n.get(ck) || 0; if (n >= VOTE_DAY_MAX) return json({ error: 'that is a lot of votes for one day' }, 429);
    fbMem.n.set(ck, n + 1); fbMem.n.set(vk, 1); if (fbMem.n.size > 20000) fbMem.n.clear();
    await kv.put(vk, '1', { expirationTtl: 2 * 86400 });
    let votes = {}; try { votes = JSON.parse(await kv.get('roadmap:votes') || '{}') || {}; } catch (e) {}
    votes[id] = (votes[id] || 0) + 1; await kv.put('roadmap:votes', JSON.stringify(votes));
    road.votes = votes; return json({ ok: true, votes: votes[id] });
  }
  return json({ error: 'unknown path' }, 404);
}

// personal gift links (the Founder gift, idle-founder.js; created by Nico with tools/gift.py): gift:<id> in the feedback namespace holds
// { letter, created, label, exp, claimed?, revoked? }. GET /lab/gift/<id> returns only the letter and whether it was opened (never the
// label); POST /lab/gift/<id>/claim marks it opened (one write, the only one a reader ever causes). Ids are ≥ 96 random bits (base32).
const GIFT_ID = /^[a-z2-7]{20,40}$/, giftMem = new Map();
async function gift(req, env, path, ip) {
  const m = path.match(/^\/lab\/gift\/([a-z2-7]+)(\/claim)?$/); if (!m || !GIFT_ID.test(m[1])) return json({ error: 'no such gift' }, 404);
  const mk = ip + '|' + Math.floor(Date.now() / 60000), misses = giftMem.get(mk) || 0; if (misses >= 10) return json({ error: 'slow down' }, 429);
  const kv = fbKV(env), key = 'gift:' + m[1]; let g = null; try { g = JSON.parse(await kv.get(key) || 'null'); } catch (e) {}
  if (!g || g.revoked || typeof g.letter !== 'string') { giftMem.set(mk, misses + 1); if (giftMem.size > 5000) giftMem.clear(); return json({ error: 'no such gift' }, 404); }
  if (!m[2]) { if (req.method !== 'GET') return json({ error: 'GET only' }, 405); return json({ letter: g.letter.slice(0, 4000), claimed: !!g.claimed, created: g.created || null }); }
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (g.claimed) return json({ ok: false, already: true });
  g.claimed = Date.now(); const ttl = g.exp ? Math.max(60, Math.floor(g.exp / 1000 - Date.now() / 1000)) : FB_TTL;
  await kv.put(key, JSON.stringify(g), { expirationTtl: ttl }); return json({ ok: true });
}

export default {
  pages: PV_PAGES,
  // the Pages wrapper (tools/build_static.py) calls this for every HTML page it serves, once the response is ready
  pageview: (req, env, page, res) => pageview(req, env, page, res),
  _hll: { add: hllAdd, count: hllCount, decode: b64d, M: HLL_M },   // for the tests
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return cors(env, req, new Response(null, { status: 204 }));
    if (new URL(req.url).pathname.startsWith('/jeffy/')) { try { return cors(env, req, await jeffy(req, new URL(req.url).pathname, req.headers.get('CF-Connecting-IP') || 'local', ctx)); } catch (e) { return cors(env, req, json({ error: String(e.message || e).slice(0, 120) }, 502)); } }
    const url = new URL(req.url), path = url.pathname, ip = req.headers.get('CF-Connecting-IP') || 'local', min = Math.floor(Date.now() / 60000);
    // background calls a page makes by itself (stats batches, world-link polls, notices) count in their own, larger budget, so they
    // never use up what the player's own actions (reading a page, its pictures) may do in a minute
    const bg = path === '/lab/stats' || path === '/lab/p' || path === '/worlds/state' || path === '/lab/notices';
    const k = ip + '|' + min + (bg ? '|bg' : ''), n = (mem.hits.get(k) || 0) + 1; mem.hits.set(k, n); if (mem.hits.size > 5000) mem.hits.clear();
    if (n > (bg ? 240 : (+env.RATE_PER_MIN || 60))) return cors(env, req, json({ error: 'slow down: too many requests this minute' }, 429));
    if (path === '/lab/oracle' || path === '/lab/roadmap' || path === '/lab/vote') return cors(env, req, await feedback(req, env, path, ip));
    if (path.startsWith('/lab/gift/')) return cors(env, req, await gift(req, env, path, ip));
    if (path === '/lab/stats' || path === '/lab/p') return stats(req, env, ctx);   // /lab/p: the same reports under a plain name   // rate-limited like the rest (that count lives in memory for a minute, never stored)
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
