// Run the helper on this machine without Cloudflare (for trying the static site against it):
//   node helper/dev_server.mjs 8787   then build with: python3 tools/build_static.py --helper http://localhost:8787
import http from 'node:http';
import worker from './worker.js';
const port = +(process.argv[2] || 8787);
const env = { ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:8776', ALLOW_PRIVATE: process.env.ALLOW_PRIVATE || '', LIVE_KEY: process.env.LIVE_KEY || '' };   // LIVE_KEY: the creator's live view (/lab/live)
http.createServer(async (q, r) => {
  const chunks = []; for await (const c of q) chunks.push(c);
  const req = new Request(`http://localhost:${port}${q.url}`, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : Buffer.concat(chunks) });
  if (q.headers['x-country']) Object.defineProperty(req, 'cf', { value: { country: String(q.headers['x-country']) } });   // tests: stand in for Cloudflare's country
  const res = await worker.fetch(req, env);
  r.writeHead(res.status, Object.fromEntries(res.headers)); r.end(Buffer.from(await res.arrayBuffer()));
}).listen(port, () => console.log('Id|le helper on http://localhost:' + port));
