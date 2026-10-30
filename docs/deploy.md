# Deploying id-le.com

The site is a Cloudflare Pages project (`id-le`) in Nico's Cloudflare account. The helper (`helper/worker.js`: page fetch for Crawlers and travel, world links) runs inside the same Pages project as its `_worker.js`, so it answers `/lab/*` and `/worlds/*` on the same origin; no separate Worker, no CORS.

```sh
python3 tools/build_static.py --helper https://id-le.com --pages-helper --out dist
set -a; . ~/.idle-ts/cf.env; set +a          # CLOUDFLARE_API_TOKEN (never committed; outside the repo)
export CLOUDFLARE_ACCOUNT_ID=<account id>
npx -y wrangler@3 pages deploy dist --project-name id-le --branch main
```

Project settings (set once via the API, 2026-10-30): KV bindings `WORLDS` → namespace `id-le-worlds` and `STATS` → `id-le-stats` (anonymous daily totals, #34); env vars `ALLOWED_ORIGINS=https://id-le.com,https://www.id-le.com,https://id-le.pages.dev`, `RATE_PER_MIN=60`.
Domains: `id-le.com` and `www.id-le.com` are CNAMEs (proxied) to `id-le.pages.dev`. The registrar's parking records (A → 91.195.240.94 for the apex, www and *) were removed.

The account also holds jeffy's resources (jeffyclassify.com, jeffy-landing, mind-reader-scores): never touch them from here.

## Anonymous stats (#34)

`idle-stats.js` sends small batches (sendBeacon, POST `/lab/stats`) only on the public site, never on localhost (add `?statstest` to test locally), in `?fresh`, or when ⚙ settings → Anonymous stats is off. The `_worker.js` route adds them to daily totals: each isolate buffers for 20 s and writes one shard key `stats:<UTC day>:<0-f>` (expiry ~400 days). Read them with `python3 tools/stats.py [--days N] [--json]` (token from `~/.idle-ts/cf.env`). The table shows `writes` per day: KV's free plan allows 1,000 writes a day for the whole account.
The privacy page is `demo/privacy.html` (id-le.com/privacy): keep it in step with what idle-stats.js and helper/worker.js do.
