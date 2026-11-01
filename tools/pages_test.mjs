// Node test for server-side page views (tools/test_smoke.py, check "pages"): the generated Pages worker (argv[2]) and helper/worker.js
// (argv[3]) for the sketch. No network: ASSETS is a stub; KV is an in-memory map that records each put's options.
import { webcrypto, createHash } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.setTimeout = (f) => { Promise.resolve().then(f); return 0; }; globalThis.__statFlushNow = true;
const kv = () => { const m = new Map(), opts = new Map(); return { m, opts, get: async k => m.get(k) ?? null, put: async (k, v, o) => { m.set(k, v); opts.set(k, o || {}); } }; };
const W = (await import(process.argv[2])).default, H = (await import(process.argv[3])).default;
const STATS = kv(), env = { STATS, ASSETS: { fetch: async req => new Response('<!doctype html><title>x</title>', { status: new URL(req.url).pathname.endsWith('.html') && new URL(req.url).pathname !== '/index.html' && new URL(req.url).pathname !== '/arena.html' ? 308 : 200, headers: { 'Content-Type': 'text/html' } }) } };
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function go(path, { ua = CHROME, ip = '203.0.113.7', lang = 'en-US,en;q=0.9', accept = 'text/html,application/xhtml+xml', method = 'GET', ref = '', cc = 'US', extra = {} } = {}) {
  const h = { 'User-Agent': ua, 'CF-Connecting-IP': ip, Accept: accept, ...extra }; if (lang) h['Accept-Language'] = lang; if (ref) h.Referer = ref;
  const req = new Request('https://id-le.com' + path, { method, headers: h }); Object.defineProperty(req, 'cf', { value: { country: cc } });
  const waits = []; const r = await W.fetch(req, env, { waitUntil: p => waits.push(p) }); await Promise.all(waits); return r.status;
}
const doc = () => { const o = { views: {}, visits: {}, gpc: {}, bots: {}, botWhy: {}, ref: {}, utm: {}, dev: {}, cc: {}, hll: {} };
  for (const [k, v] of STATS.m) if (k.startsWith('stats:')) { const pv = JSON.parse(v).pv || {}; for (const f of ['views', 'visits', 'gpc', 'bots', 'botWhy', 'ref', 'utm', 'dev', 'cc']) for (const [a, n] of Object.entries(pv[f] || {})) o[f][a] = (o[f][a] || 0) + n; for (const [a, s] of Object.entries(pv.hll || {})) o.hll[a] = s; }
  return o; };
const out = {};
await go('/?utm_source=r-webgames', { ref: 'https://www.reddit.com/r/WebGames/comments/x/y' });
await go('/', { ref: 'https://www.reddit.com/r/WebGames/comments/x/y' });   // the isolation reload: a page view, not a new visit
await go('/pedia', { ip: '198.51.100.9', ua: IPHONE, ref: 'https://news.ycombinator.com/item?id=1', cc: 'DE' });
await go('/privacy', { ip: '198.51.100.10' });
await go('/pedia.html', { ip: '198.51.100.11' });   // a redirect (308): not a page view
await go('/', { ua: 'curl/8.5.0' }); await go('/', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
await go('/', { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36' });
await go('/', { lang: '' });   // a real-looking UA without Accept-Language
await go('/', { method: 'HEAD' }); await go('/', { extra: { 'Sec-Purpose': 'prefetch' } }); await go('/', { accept: '*/*' });
await go('/idle-music.js');   // not a page
await go('/', { ip: '203.0.113.99', extra: { 'Sec-GPC': '1' } });   // asks not to be tracked: a page view only
out.small = doc();
// exactness of the sketch on synthetic uniques, and end to end through the worker
const est = n => { const reg = new Uint8Array(H._hll.M); for (let i = 0; i < n; i++) H._hll.add(reg, createHash('sha256').update('salt|10.0.' + i + '|ua').digest()); return H._hll.count(reg); };
out.est = { 1000: est(1000), 10000: est(10000), 100000: est(100000) };
for (let i = 0; i < 400; i++) await go('/', { ip: '192.0.2.' + (i % 250) + '.' + i });
const big = doc(); out.bots = big.bots; out.botWhy = big.botWhy; out.e2e = { views: big.views.game, visits: big.visits.game, uniques: Math.round(H._hll.count(H._hll.decode(big.hll.all))), ua_stored: [...STATS.m.values()].some(v => v.includes('Chrome/141') || v.includes('203.0.113.7') || v.includes('198.51.100.9')) };
out.salt = [...STATS.opts].filter(([k]) => k.startsWith('salt:')).map(([k, o]) => ({ k, ttl: o.expirationTtl }));
out.keys = [...STATS.m.keys()];
console.log(JSON.stringify(out));
