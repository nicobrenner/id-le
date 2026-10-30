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
  const load = async () => env.WORLDS ? (JSON.parse(await env.WORLDS.get('worlds') || 'null') || { worlds: {} }) : mem.worlds;
  const save = async d => { if (env.WORLDS) await env.WORLDS.put('worlds', JSON.stringify(d)); else mem.worlds = d; };
  const W = (d, c) => d.worlds[c] || (d.worlds[c] = { name: c, links: [], requests: [], inbox: [], view: null, seen: 0 });
  const d = await load(), now = Date.now() / 1000;
  if (path === '/worlds/state') { const code = new URL(req.url).searchParams.get('code') || ''; const me = W(d, code); me.seen = now; await save(d);
    return json({ me: { name: me.name, links: me.links, requests: me.requests, inbox: me.inbox }, peers: Object.fromEntries(me.links.concat(me.requests).map(c => [c, { name: (d.worlds[c] || {}).name || c, seen: (d.worlds[c] || {}).seen || 0, view: (d.worlds[c] || {}).view || null }])) }); }
  const q = await req.json().catch(() => ({})), act = path.split('/')[2], me = W(d, q.code || ''); let res = { ok: true };
  if (act === 'register') { me.name = String(q.name || me.name).slice(0, 40); me.seen = now; }
  else if (act === 'link') { const o = String(q.other || '').trim().toLowerCase(); if (!o || o === q.code) res = { ok: false, error: 'that is your own code' }; else if (!d.worlds[o]) res = { ok: false, error: 'no world with that code has been open here' }; else if (d.worlds[o].links.includes(q.code)) res = { ok: true, already: true }; else if (!d.worlds[o].requests.includes(q.code)) d.worlds[o].requests.push(q.code); }
  else if (act === 'approve') { me.requests = me.requests.filter(r => r !== q.other); if (q.yes && d.worlds[q.other]) { if (!me.links.includes(q.other)) me.links.push(q.other); if (!d.worlds[q.other].links.includes(q.code)) d.worlds[q.other].links.push(q.code); } }
  else if (act === 'unlink') { me.links = me.links.filter(x => x !== q.other); if (d.worlds[q.other]) d.worlds[q.other].links = d.worlds[q.other].links.filter(x => x !== q.code); }
  else if (act === 'send') { if (me.links.includes(q.to) && d.worlds[q.to]) { d.worlds[q.to].inbox.push({ ...(q.item || {}), from: q.code, t: now }); d.worlds[q.to].inbox = d.worlds[q.to].inbox.slice(-50); } else res = { ok: false, error: 'not linked' }; }
  else if (act === 'ack') { const ids = new Set(q.ids || []); me.inbox = me.inbox.filter(i => !ids.has(i.id)); }
  else if (act === 'view') { me.view = q.view; me.seen = now; }
  await save(d); return json(res);
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return cors(env, req, new Response(null, { status: 204 }));
    const url = new URL(req.url), path = url.pathname, ip = req.headers.get('CF-Connecting-IP') || 'local', min = Math.floor(Date.now() / 60000);
    const k = ip + '|' + min, n = (mem.hits.get(k) || 0) + 1; mem.hits.set(k, n); if (mem.hits.size > 5000) mem.hits.clear();
    if (n > (+env.RATE_PER_MIN || 60)) return cors(env, req, json({ error: 'slow down: too many requests this minute' }, 429));
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
