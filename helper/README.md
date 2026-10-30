# Id|le helper

The game runs entirely in the browser. Two things a web page is not allowed to do by itself need a tiny helper:

| Feature | Needs the helper because | Without it |
|---|---|---|
| Terrain from a page, the Crawler, travel mode, page images | browsers block pages from reading other sites (CORS) | "could not fetch": paste text in instead |
| Linking worlds (portals, guests, souvenirs) | two browsers need a shared mailbox | the connect panel stays empty |

`worker.js` is that helper: one Cloudflare Worker, no database except an optional KV namespace for world links. It only fetches public `http(s)` pages, caps sizes (600 KB text, 2.5 MB HTML, 4 MB images), allows 60 requests a minute per visitor, answers only the origins in `ALLOWED_ORIGINS`, and keeps no logs or cookies.

## Try it on this Mac

```
node helper/test_node.mjs                      # checks every endpoint against a local test page
node helper/dev_server.mjs 8787                # the helper on http://localhost:8787
python3 tools/build_static.py --helper http://localhost:8787
python3 -m http.server 8776 -d dist            # the game, as a static site, using that helper
```

## Deploy (Nico: these steps need your Cloudflare account)

1. `npm install -g wrangler` (or use `npx wrangler …`), then `wrangler login`.
2. Optional, for world links that survive restarts: `npx wrangler kv namespace create WORLDS`, paste the id into `wrangler.toml` and uncomment that block.
3. `cd helper && npx wrangler deploy` prints the address, e.g. `https://idle-helper.<account>.workers.dev` (or route it to `helper.id-le.com`).
4. Build the site against it: `python3 tools/build_static.py --helper https://idle-helper.<account>.workers.dev`.
5. Publish `dist/` with Cloudflare Pages (`npx wrangler pages deploy dist --project-name id-le`), then point id-le.com at the Pages project.
   The `_headers` file turns on cross-origin isolation (several Oracle threads); `sw.js` does the same on hosts that ignore `_headers`.

Costs: the free Workers plan (100,000 requests a day) covers a small audience; KV's free tier covers world links.

## What the static site does without any server

| Server job today | Static site |
|---|---|
| models, tokenizer, word lists | static files, cached by `sw.js` after the first visit |
| saving the world to disk (`/lab/sync`, `/lab/world`) | IndexedDB in the browser, plus "⬇ download my world" / "⬆ load a world file" in the snapshot panel |
| recovery bundle (`/lab/recover`) | gone (downloads replace it) |
| data-lab labels (`/jeffy/*`, needs a local Jeffy server) | off: the data lab shows its creatures but they can't label |
| word meanings for the Crawler (`/lab/embed`) | the built-in 32-number word vectors (already the fallback) |
| lab chat with the manager (`/lab/notes`, `/lab/replies`) | notes stay in the browser; the BYO-AI chat replaces the replies (docs/byo_ai.md) |
| manager notices (`/lab/notices`) | none |
