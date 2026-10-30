// Local check of worker.js without Cloudflare: node helper/test_node.mjs
import http from 'node:http';
import worker from './worker.js';
const page = `<html><head><title>Test &amp; page</title><link rel=stylesheet href="/s.css"></head><body><nav>menu</nav>
<p>${'Creatures like long paragraphs about weather and words. '.repeat(12)}</p><img src="/photo.jpg"><h2>Weather</h2><button>Go</button>
<a href="/other">Another page</a><a href="https://example.org/x">External link</a></body></html>`;
const srv = http.createServer((q, r) => {
  if (q.url === '/s.css') { r.writeHead(200, { 'Content-Type': 'text/css' }); return r.end('body{background:url(bg.png)} @import "more.css";'); }
  if (q.url === '/photo.jpg') { r.writeHead(200, { 'Content-Type': 'image/jpeg' }); return r.end(Buffer.alloc(1000, 7)); }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(page);
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`, H = 'https://helper.test', O = { Origin: 'http://localhost:8776' };
const env = { ALLOW_PRIVATE: '1', ALLOWED_ORIGINS: 'http://localhost:8776', RATE_PER_MIN: '200' };
const call = (p, init = {}, e = env) => worker.fetch(new Request(H + p, { ...init, headers: { ...O, ...(init.headers || {}) } }), e);
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
let r = await call('/lab/fetch?url=' + encodeURIComponent(base + '/'));
let j = await r.json(); ok(j.title === 'Test & page' && j.text.includes('Creatures like') && !j.text.includes('menu'), 'fetch: title + text, nav dropped');
ok(j.images.length === 1 && j.links.some(l => l.text === 'Another page') && j.ui.some(u => u.text === 'Weather'), 'fetch: images, links, ui');
ok(r.headers.get('Access-Control-Allow-Origin') === 'http://localhost:8776' && r.headers.get('Cross-Origin-Resource-Policy') === 'cross-origin', 'CORS + CORP headers');
j = await (await call('/lab/page?url=' + encodeURIComponent(base + '/'))).json(); ok(j.html && j.html.includes('<button>'), 'page: raw html');
r = await call('/lab/asset?url=' + encodeURIComponent(base + '/s.css')); const css = await r.text();
ok(css.includes(H + '/lab/asset?url=' + encodeURIComponent(base + '/bg.png')) && css.includes('@import url("' + H + '/lab/asset'), 'asset: css urls rewritten through the helper');
r = await call('/lab/img?url=' + encodeURIComponent(base + '/photo.jpg')); ok(r.status === 200 && r.headers.get('Content-Type') === 'image/jpeg' && (await r.arrayBuffer()).byteLength === 1000, 'img: bytes');
j = await (await call('/lab/fetch?url=' + encodeURIComponent(base + '/'), {}, { ...env, ALLOW_PRIVATE: '' })).json(); ok(/public/.test(j.error), 'private address refused without ALLOW_PRIVATE');
j = await (await call('/lab/fetch?url=' + encodeURIComponent('file:///etc/passwd'))).json(); ok(!!j.error, 'file: refused');
r = await worker.fetch(new Request(H + '/lab/fetch?url=x', { headers: { Origin: 'https://evil.example' } }), env); ok(!r.headers.get('Access-Control-Allow-Origin'), 'unknown origin gets no CORS');
const post = (a, b) => call('/worlds/' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(x => x.json());
await post('register', { code: 'aaa', name: 'Home A' }); await post('register', { code: 'bbb', name: 'Home B' });
await post('link', { code: 'aaa', other: 'bbb' }); await post('approve', { code: 'bbb', other: 'aaa', yes: true });
j = await post('send', { code: 'aaa', to: 'bbb', item: { id: 1, word: 'hello' } }); const st = await (await call('/worlds/state?code=bbb')).json();
ok(j.ok && st.me.links.includes('aaa') && st.me.inbox[0].word === 'hello' && st.peers.aaa.name === 'Home A', 'worlds: register, link, approve, send, state');
let last; for (let i = 0; i < 5; i++) last = await call('/worlds/state?code=x', {}, { ...env, RATE_PER_MIN: '3' }); ok(last.status === 429, 'rate limit');
srv.close();
