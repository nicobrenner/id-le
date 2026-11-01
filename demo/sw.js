// Id|le service worker (static site only; idle-runtime.js registers it when there is no server).
// 1. keeps the big files (Oracle model, onnxruntime, tokenizer) in a cache, so a second visit starts offline;
// 2. adds the cross-origin isolation headers a static host may not send, so the Oracle can use several threads
//    (the same idea as coi-serviceworker; a host that sends them itself, like the _headers file, makes this a no-op);
// 3. forwards /lab/img and /lab/asset (used as <img src> and CSS urls, which never pass through window.fetch) to the helper.
const CACHE = 'idle-v1', BIG = /\.(onnx|wasm|mjs)$|vendor\/|jeffy-heads\/|tokenizer_.*\.json$|assoc_v1\.json$/;
// the helper's address arrives by message from the page and lives only in memory: the browser restarts a service worker
// whenever it likes (after idling, on the first visit's isolation reload), and then it is unknown (null). Unknown means "same site"
// (id-le.com serves its helper itself); '' means the player switched the public helper off.
let helper = null;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => { if (e.data && typeof e.data.helper === 'string') helper = e.data.helper; });
const isolate = r => {
  if (!r || r.status === 0 || r.type === 'opaque') return r;
  const h = new Headers(r.headers); h.set('Cross-Origin-Opener-Policy', 'same-origin'); h.set('Cross-Origin-Embedder-Policy', 'require-corp'); h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
};
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  if (/^\/lab\/(img|asset)/.test(u.pathname)) {
    e.respondWith(helper === null ? fetch(e.request).then(isolate)
      : helper ? fetch(helper.replace(/\/$/, '') + u.pathname + u.search, { mode: 'cors' }).then(isolate) : new Response('', { status: 502 }));
    return;
  }
  if (BIG.test(u.pathname)) {
    e.respondWith(caches.open(CACHE).then(async c => { const hit = await c.match(e.request); if (hit) return isolate(hit); const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return isolate(r); }));
    return;
  }
  e.respondWith(fetch(e.request).then(isolate));
});
