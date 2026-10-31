# Id|le development & research log

What we built, what we measured, and what surprised us. Newest first. Each entry names the commit or issue.
Numbers come from tests on copies of Nico's world (headless, one browser at a time) unless marked otherwise.

## 2026-10-31

**Creatures stand out from the charts, and charts stop piling up.** Nico (with a phone screenshot of a dark world full of charts): creatures were "hard to see in the noise", and "there aren't enough debuggers… we need to balance it out" (his second or third time asking).
- Outlines: every body shape and the legs get a thin outline under their own colours (one extra stroke per shape, one per creature for all its legs; at least ~1.3 screen px at any zoom). Light mode: dark ink. Dark mode: a light line in the creature's own hue. Shy ones keep a faint outline (0.15–0.45 of full) and get it back in full when hovered or highlighted. Dark bodies are a little lighter in dark mode. Phones (light quality) keep the outline.
- Findability (median colour distance between a creature and its surroundings, the #36 measure, 6 views each, a copy of Nico's world with 58 charts, a fixed third showy/plain/shy), before → after:

| view | plain | showy | shy |
|---|---|---|---|
| desktop dark | 93 → **116** ↑ | 93 → 95 | 74 → 91 ↑ |
| desktop light | 67 → **109** ↑ | 89 → **122** ↑ | 64 → 90 ↑ |
| phone dark | 95 → **111** ↑ | 107 → 120 ↑ | 81 → 106 ↑ |
| phone light | 73 → **125** ↑ | 93 → **160** ↑ | 65 → 92 ↑ |

  Noise is about ±10. Shy ones stay the hardest to see everywhere, but less hidden than before, most on phones in dark mode (106 vs plain 111).
- Finding: the first version used a dark outline in both themes; in dark mode it made creatures *less* findable (desktop showy 93 → 72, plain 93 → 86), the same trap as #36's halo: dark on a dark floor pulls them toward the background. A light outline in their own hue fixed it.
- Chart ecology: a world now has a comfortable number of charts, 10 + 0.4 per creature (10–36). Past it, pressure p = charts/target − 1 feeds back: charts count as old 1/(1+3p) as soon (grazers, code eaters, Debuggers reach them earlier), Mathematicians replot one of their own old charts or count instead of adding (more often the fuller), creatures without a craft lend a Debugger's hand (code eaters most), code eaters graze charts more readily, and a child born into a full world with fewer than one Debugger per 12 creatures has an even chance of growing up one. Nothing is deleted outright; pinned charts are never touched.
- Measured, 14 minutes, real time, side by side: a copy of Nico's world plus 3 Mathematicians (47 creatures, 4 Mathematicians, 1 Debugger): before 58 → 100 charts (68 made, 24 broken into code, 8 folded) and still climbing; after it came down to 28 within 4 minutes and held 32–36 (target 29; 66 made, 43 replots, 77 broken, 54 by helpers). Starter world (12 creatures, 1 Mathematician, no Debugger): 4 → 22 before, 4 → 15 after; the pressure was 0 there all along, so that gap is chance, and the brakes start at its target of 15.
- Forced births under pressure: newborns grew up Debuggers by need (marked `byNeed` on the genome).
- fps flat: 1,000 creatures, 3 × 8 s, before 41.9 / 34.6 / 35.2, after 42.4 / 38.2 / 46.9 (headless).

## 2026-10-30

**The Id|le-pedia covers the features, not just the creatures.** Nico: the pedia was "mostly focused on the creatures", while the README showed everything else. The pedia now opens with a tour (14 cards with the README's pictures, light or dark by the page's theme) and is reorganised into Life, The world, **Things to do** (reels with replays, music and rave, advisor, the Gazette and notices, the studio, the drawer, the data lab, connecting worlds, evolution, the first five minutes), **Make it yours** (remix a world, with your own AI, get the code) and **Settings and privacy**; disasters and snapshots (world files) are fuller.
- It still reads its facts from the game: the studio's strips from arena.html, the data lab's starting team, the AI chat's tools from idle-ai.js, the notice kinds from idle-notify.js, the size of the demo stream. Each is optional, so a module that moves only shortens a sentence.
- Pictures: the build copies `docs/img/*.jpg` to `img/` (1.7 MB, lazy-loaded, only the theme's half is fetched; the 3.7 MB hero GIF stays out). The game's first visit is unchanged.
- Honest about what isn't built: in-browser data-lab classifiers are "planned", changing the game from inside it (#31) is "an idea".

**Replays show the world they happened in.** Nico: the reel clips had "no weather/environment, just creatures and objects". Each clip now keeps, at the moment it starts: the weather's own faders (amount, speed, size, glyphs, slant, direction, thickness; a weather change during the clip carries the new one's), the day phase, the ground features within reach (streams, latency wells, 404 holes, caches) and the solid objects and finished buildings around it (#28). The replay draws them: the ground and the objects under everything, the daylight tint over the scene, the weather on top. Light quality (phones) keeps the tint, ground and objects and skips the particles. The drawing of ground, daylight and weather lives in `idle-replay-env.js`, with no arena globals (canvas, env and camera come in as arguments); objects draw through `__build.drawTo`, the same code as the world.
- Finding: Nico's 23 clips all recorded `clear` weather, correctly: his world was clear the whole time, so weather (already drawn since the v2 clips) had nothing to show. His world also has no ground features (`features: []`). For his clips the visible change from here on is the daylight tint, his objects and buildings, and weather when there is some.
- Size: test clips with 4 features and 5–6 objects were 9–17 KB, inside the usual range (Nico's clips: 6–23 KB); the new fields are a few dozen numbers. Old clips without these fields play as before (tested on one of his, no errors).
- fps flat: 1,000 creatures, 3 × 10 s, before 49.7 / 55.2 / 55.7, after 51.5 / 53.3 / 56.8 (headless; the recording runs once per clip, the drawing only while a reel plays).
- Reuse outside the arena (a pedia page): ground, daylight and weather work as they are; a clip's creatures still need the arena's creature drawing (`Crit.drawTo`, `buildLegs`, `stepLegs`) and its word look, so the pedia would need those moved into a module too, plus a few clips exported as JSON at build time.

**Showy, shy and dazzle herds (#36).** A showiness gene (`g.show`, inherited and mutated, leaning on the flocking gene) sets each creature's look: showy ones glow in their own hue and leave ripples where they step, shy ones fade toward the floor, and shy kin moving together share stripes (dazzle herds). Showy ones bond faster but are spotted first by thieves and scares; shy ones get robbed and scared less. For the player: a halo under plain creatures in busy views, a ring on the hovered one, and "highlight creatures" (⚙, ✨ on phones, H) that rings every creature.
- Findability (median colour distance between a creature with its halo/ring and its surroundings, 8 screenshots, copy of Nico's world, half set showy 0.92 and half shy 0.10), before → after: light showy 70 → **87** ↑, shy 67 → **57** ↓ (camouflage), shy with highlight → **80**; dark showy 86 → **91**, shy 95 → **76** ↓, shy with highlight **94**. Run-to-run noise is about ±10.
- Finding: the first version put a dark halo under every creature, which made showy ones *less* findable in dark mode (96 → 86): the halo darkened them toward the dark floor. It is now for plain creatures only.
- 4 minutes with everyone hungry: before (no gene, same two halves as a control) showy-half victims 13 of 38 thefts; after showy 7, shy 1, and 6 thieves lost track of shy ones. The control already split 13/25 by chance, so thefts are noisy; company time (toward friendship) clearly favours showy pairs: 737 vs 597 s per creature (control 577 vs 607).
- fps flat: 1,000 creatures 19.1 → 21.5 (headless), phone at 4× throttle 33–39 before vs 31–41 after (noisy; light quality keeps only the camouflage).

**KV writes throttled (74271bf).** Found while adding stats: every open tab polled `/worlds/state` every ~20 s and each poll rewrote the worlds document, and linked worlds shared their view every 3 s. KV's free plan allows 1,000 writes a day **for the whole Cloudflare account**, jeffy's mind-reader included, so about 6 tab-hours of Id|le could have used it up. Now a poll writes only for a new world or every 10 min, and a view at most once a minute: 30 polls + 20 views went from 50 writes to 2 (fake-KV test).

**Settings, privacy page, anonymous stats (#34).** ⚙ settings (a gear on desktop, ⚙ in the ☰ sheet on phones) with two switches: the public helper (off: Crawlers, travel and world links say so, and nothing is fetched) and anonymous stats. id-le.com/privacy says in plain words what stays in the browser, what is sent and how to turn it off. Stats: visit (and a yes/no "been here before"), phone/desktop, an fps bucket, features opened, first-five-minutes moments with seconds, finished/skipped, up to 5 scrubbed errors; the server keeps only daily totals per shard key; `tools/stats.py` prints them.
- Two test beacons became 1 KV write (20 s batching per isolate); off switch → 0 beacons; localhost and `?fresh` → 0 beacons.
- Finding (not fixed here): every open tab polls `/worlds/state` every ~20 s and each poll rewrites the `worlds` KV document, so world presence alone could use KV's 1,000 free writes a day in about 6 tab-hours. Stats share that account-wide limit.

**Creatures have children (#33).** Good friends, close together, well fed, rested and not scared now and then have a child (6% twins); very rarely a lone creature buds a near-copy. Genes come from either parent or a blend, then a small mutation; it starts small and grows with meals. Births need food nearby and room, stop at the world's population cap (studio → Children, 60), and nobody is ever removed. Two parents in the family tree, Gazette firsts, diaries, replays, a reel ("A new arrival"), the almanac, an advisor line that says why there are none.
- Copy of Nico's world, 4 min with chances ×30 and waits ÷50, births on vs off: population 44→57 vs 44→44; births 13 vs 0; deepest generation 1→2; fps 57.6 vs 60 (with 13 more creatures); a birth check costs ~0.1 ms every 15 s.
- At normal rates (sampled every 15 s for 4 min): about one ready pair per check on average, bursty (0, 10, 0, 6, …), which works out to **roughly 3 births per hour of play**: the world would take hours to reach its cap.
- What blocks births most is **food**: friends are often ready but standing where there is too little to eat (the advisor says so).
- Flocking (sociability): parents averaged **0.375** vs **0.332** for everyone else, children 0.358, and the world's mean nudged 0.342 → 0.346. Friends breed, and friends are a little more social, so sociability can now drift upward. Too short a run to call it selection.
- Finding along the way: the first version gave every lone creature its own budding chance, so 13 of 14 births were buds of loners and the world's flocking fell (0.342 → 0.315; budded children 0.23). Budding is now one chance a check world-wide, at a tenth of the pair rate: who reproduces decides which genes rise.

**Phones (#32).** Below 500 px the top bar keeps creatures, studio, 🔔 and a ☰ sheet with everything else (labelled, 44 px targets); every window is a bottom sheet, one at a time, ✕ or swipe down to close; long press = right-click; two-finger pinch zoom (the arena had none on touch); phones start in light quality; the card no longer pops the keyboard. The guided start gets the floor: while it is on (first 5 min, then whenever a tip shows) other notices wait in 🔔, tips read "step n of 8" with an accent, phones show one pill at a time.
- iPhone 12 mini (WebKit emulation), fresh visit: top-bar items 16 → **4**, targets under 44 px 16 → **0**, pills on screen at 30 s 2 → **1** (the tip), no horizontal scroll.
- 375 px at 4× CPU throttle: **34–35 → 57–58 fps** (light quality from the start).
- Touch: tap opens the card, pinch zoom 1.2 → 2.5, one-finger pan, long press opens the inspector (a short tap doesn't), drag-a-word-to-feed works. Desktop unchanged (same top bar, same window positions).

**id-le.com is live (#5, 70a0228).** Cloudflare Pages project `id-le`; the helper runs inside it as `_worker.js`, so page fetching and world links are same-origin (`/lab/*`, `/worlds/*`), with its own KV (`id-le-worlds`). First visit ≈ 13.5 MB compressed (Oracle 9.7 MB, ORT wasm 3.0 MB, the game ~0.7 MB), then cached.
- Finding: the static build had silently dropped 10 of the 11 game modules (advisor, music, drawer…): its copy list predated them. It now copies every `idle-*.js` plus the starter world.
- A first-time visitor on the live site gets the starter world (12 creatures, 136 words) and the nudge trail; no page errors, no failed requests.

**The first five minutes (#15).** A first visit (a browser that has never kept a world) arrived on an almost empty floor: 3 creatures and 3 words. It now arrives in a small living starter world (12 creatures mid-day, 139 words, a lake, a Mathematician with charts out, an Architect with a pile; `demo/starter_world.json`, 67 KB, generated by `tools/make_starter_world.py` from a blank profile, never from a real world) and a trail of 8 🧭 tips with "show me ›", each done by any route, skippable for good, progress as a ring on 🔔. Plus "name your world" at ~1:30 and a backup-file nudge at ~10 min. When each first happened is kept locally only (almanac line + its JSON export).
- One simulated first visit (acting on each tip as it came): card 0:10 · name 0:17 · first Gazette pill 0:18 · **first reel made 0:20** · fed 0:27 · dream 0:36 · reel played 0:40 · kept 0:47 · world named 1:32 · followed a Gazette pill 3:02 · weather 3:02. Every tip done in about 3 minutes.
- Finding: the slowest step was waiting for a Gazette pill **with a place** (go ›): the first one came at 0:18 but was a rename, which has no location.
- Nico's world (a copy of his autosave): no trail, no starter, `idle.first5` never written. `?fresh` there only shows a notice.

**Family trees (#13).** Every creature gets a lineage record: its parent, its generation, when it was born and first seen, every genome it has carried, and what changed each time. Ancestry is read from the genome ids the game already writes, never invented: `-cXYZ` marks a clone of the prefix, a mutated genome's `parent` field names its source, and `-m` is a metamorphosis of the same creature. Records that can't be read become roots marked "unknown origin". The 🌳 window draws each family's trees generation by generation, with highlights, gene drift and a CSV/JSON export. The card's friends tab shows the family line.
- Backfill on a copy of Nico's world: 44 creatures, **31 with a known parent** (all clones). The rest: 6 founders (the two first creatures and 4 special kin) and 7 of unknown origin. The studio's own mutation history (`arena.lineage`) was empty in Nico's browser, so template-spawned residents couldn't be traced further.
- The deepest generation is **1**: nobody had grandchildren. New members only arrive when Nico clones or spawns; residents never reproduce on their own.
- Finding: **the world being "almost all loners" is a founder effect, not selection.** Clones copy the flocking gene exactly. 18 creatures sit at Id|le's 0.37 (Id|le plus its 17 clones), 7 at Mouinterumbbet's 0.23 and 5 at Quibbetly's 0.12. So 30 of 44 are copies of three low-flocking founders. The one high-flocking creature is Moundy, the first Crawly (0.69), which was never cloned. Flocking per generation: Tok kin trees 0.24 → 0.30 and Crawly kin trees 0.53 → 0.37, both just the parents' values copied down.
- In the test, cloning down one line made generations 2, 3 and 4. The Gazette announced each new generation and the first great-grandchild. The card read "generation 4 · a clone of Re|p". fps stayed at 60.2 with the window open and closed. Merging a snapshot into itself added 0 records. After the store was wiped, a reload brought back all 48 records from the autosave.

**Your drawer (#29).** Nico can keep a copy of anything he likes: charts, designs, pictures, page pieces, words, creature portraits (genes, feelings, the last diary lines), reels with their replays, buildings, Gazette clippings. Doors: right-click → 🗄 keep a copy, a 🗄 keep button on hover, 🗄 portrait on the card, 🗄 in the reel player, on a building's menu and on Gazette pills. The 🗄 window shows them by kind and in collections he names (drag onto them); large view with name, note, place a copy back, export (PNG, SVG for charts, text, JSON) and remove with undo (removed things wait under "removed"). IndexedDB, shared by all worlds, in every snapshot, merged without loss.
- All 9 kinds kept, exported (19 of 19 formats non-empty), placed back (7 of 7 visual kinds), a kept reel played from the drawer with its 7 replays protected from the clip budget; dedupe keeps one copy of the same chart.
- Wiping the drawer from IndexedDB and reloading brought all 9 back from the autosave; merging the same snapshot twice added nothing (9 → 9). A drawer of 9 adds ~0.2 MB to a snapshot.
- The maker notices: keeping Vectotkinda's chart raised its affection 0.29 → 0.44, wrote "you kept its line chart in your drawer" in its diary and nudged its chart tastes (like a pin).
- Found on the way: snapshots restore before late-loading scripts run, so a module's state in the autosave was silently skipped at boot; the drawer now picks it up when it loads (window.__pendingCollect). Thumbnails rendered in parallel on one shared stage came out blank until each got its own spot.

**Solid objects and buildings (#28).** Objects in each world's style (crates of bits, word-bricks, data boulders, server racks at Home; stones, crates, bricks, pillars in 1-bit in Gloamhold) are solid: creatures slide along them and steer round them on a spatial grid (no pathfinding), with a short detour when stuck. Small ones get carried and pushed (big creatures, strong wind, tornado, volcano); big ones stay. Nico can drag any object (a moved one stays put) and pin, turn or remove it; the studio places more. **Architects**, a new family (one moves into each world), carry loose objects into huts with a door (shelter), pens (quiet room for loners), walls (windbreak) and benches by the lake, press long words into bricks when the quarries run dry, and repair gaps. Each world starts with 3 quarries (~20 small objects) and 5 big ones (~26 objects).
- Walking through solids: creature-seconds spent inside an object over 30 s (44 creatures, ~130 racks placed in their paths) **291 → 1**.
- One Architect from scratch: first hut (10 pieces) finished in **6 min**. Work outcomes over that time: 10 placed, 5 fetch failures, 1 carry failure, 4 times no free material, 1 word pressed into a brick.
- Fear 15 s after a scare, inside a hut vs away: **0.02 / 0.02** vs 0.50–0.68 (two runs); nobody inside was still hiding (vs 3–7 of 8 away).
- Cost at 1,000 creatures: ~1 ms per frame for the collision pass; fps with vs without solids was within noise (24–30, on a loaded machine).
- Finding: the first Architect was **stuck at 5–8 of 10 pieces for minutes**: crates inside a quarry pile couldn't be reached, because the solids kept the builder out, and it kept retrying the same one. Measuring reach to an object's *edge* and skipping unreachable ones for a minute fixed it (≈ one piece per 20–30 s after).
- Finding: routing to a door looped. A creature at the door was re-sent to the door every frame. The first version also gave scared creatures only their ~2 s dash, too short to go round a hut. Dash time now scales with the path. One traced creature went round and in (240 px north → inside in ~9 s). A batch of 6 scared creatures in the test still showed 0 inside at 10 s: **not yet explained**.
- Not done: Gloamhold's room walls stay walk-through (some rooms have no doors, so solid walls without pathfinding would trap creatures); the pantry and dance floor spaces.

**Personal space (#27, 66f90ba).** Each creature has a comfortable number of neighbours from its flocking gene (1–2 for loners, up to 8–10 for the most social). Loners packed past it get stressed and edge away, sometimes to the lake; social ones get a small lift in company and feel left out after ~3 min alone; crowds make hunger rise up to 30% faster and hungry creatures steal more.
- Packed loners' stress 0.24/0.28 → **0.70/0.59** (two runs); isolated loners unchanged (0.25/0.32). Social ones in company: happiness 0.47/0.50 → 0.53/0.55 (small).
- Thefts in 5 min 13 → 31: the crowd steal bonus was then halved (0.25 → 0.12), not re-measured.
- Finding: **Nico's world is almost all loners**: only one creature has a high flocking gene. Evolution so far has not favoured sociability. To measure the social side we set 8 creatures to 0.8 in the test copy.
- The advisor's "give the loners room" took cramped loners from 8 to 1–2 within 14 s.

**Tornado carries things (467ad72).** It used to swirl only words and creatures; pictures, page pieces and charts now orbit and drift, sometimes flung out; pinned ones hold. A chart in its path moved ~40 px in 4 s: a nudge, not a hurricane.

**Volcano heaves (e4ef01c).** When it opens, words fly outward, things slide away (pinned stay), creatures stumble back, the cone rises from the ground and nothing settles on it. Densest spot in Nico's world: 47 words within 95 px of the vent → 6.

**One notification system (#26, d6ae8b6).** Every notifier (top toast, top-right lab notices, disaster pill, Gazette/advisor pill, reel pill, music toasts) became a pill in one bottom-left stack (3 visible, kinds with icons, full text, hover holds, repeats count ×N) with a 🔔 history of 50.

**Reels fixes (d0ca5df).** "Mixed" was mostly stills because the clip-or-still coin per moment was an FNV hash whose top bits barely changed between moments: 27 of 28 reels with recordings fell entirely on one side. A finalizer fixed it (9 left all-one-side, the ones leaning to clips). About 45% of moments were never recorded (the clip budget keeps ~300), so "replays" mode now skips them.

**Charts get variety and taste; code is food (#22–24, 8b6de31).** 10 chart kinds, 8 palettes, 17 data sources (5 read the world itself); Mathematicians evolve favourites, busyness and experimentation, nudged by what gets admired (pins count most). Debuggers break charts left alone ~10 min into code tokens; Debugger kin and ~⅓ of Tok kin eat code.
- Kinds among 50 charts 2 → **10**; share hungry after 6 min **0.54 → 0.05**; food words 1010 → 1389; charts on the floor 53→62 became 53→35.
- Finding: hunger was a **diet mismatch**, not a food shortage: most creatures eat words, while charts piled up with nobody able to eat them.

**Background music you can tweak (#25, b156db6, 68daf90).** Styles, variations, tweaks, saved tracks, a set list with crossfades; reels duck the music to ~20% (not the deck during a rave).
- Rave on a chiptune track (145 bpm): 24 dancing, mosh 12. On a gloomy 64 bpm track: 0 dancing, 14 leaving. Tracks draw clearly different crowds.

**Data lake + almanac (#4, f3f3c80).** History kept for real (minute → hour → day rollups, members, event log, Gazette archive) in IndexedDB, mirrored into snapshots. Each world has a lake: rain fills it, words dissolve into data fish, and it is a refuge.
- Fear 15 s after a scare, at the shore vs away: **0.33 / 0.16** vs 0.72 / 0.67.

**Advisor fixes.** Crowding was flagged as a problem but cost the creatures nothing (they flock on purpose), so it became a neutral 🫂 togetherness gauge (b42a33f) until personal space made it real. Legend + what each bar means (92412d4).

**Population advisor (#3, 36eb9d2).** Gauges, issues with plain-word causes, one-click fixes, the Id|le Gazette.
- Storm with half hiding → "calm the weather": fear 0.64 → 0.17 in 11 s. Food stripped → "feed them": hunger 0.95 → 0.63 in 2 min. 30 packed → "spread them out": crowding 0.81 → 0.05.

**Rave mode (#2, 236e0c5).** Music taste genes (tempo, loudness, drums/bass/melody).
- House 122 bpm: 19 dancing / 11 bored. 80 bpm: 7 / 26 / 4 leaving. Heavy-bass techno in Gloamhold: 21 dancing, conga 6, mosh 10, hiding 6.

**Small things:** drafts survive reloads and reloads wait while Nico types (21fabc7); dream tab while asleep (1883dee, 9c14a13); draggable windows for the advisor, deck and reels.

## 2026-10-28 → 29 (summary)

- **1,000-creature plan:** canvas creatures, words on canvas, brain LOD, one cached Oracle model (10.8 MB), auto quality. With a GPU: 7 → **60 fps** at 1,000 creatures. Without a GPU at 4× CPU slowdown: 2 → 13–14 fps; the remainder (~28 ms/frame compositor commit) is deferred (#7).
- Finding: the simulation was only ~16% of frame time, so moving it to a worker was shelved; rendering was the cost.
- Finding: a big fps "regression" was 9 parallel headless test browsers on the same Mac, not code. Since then: one test browser at a time.
- Finding: disasters had silently stopped since Oct 28 because the line that runs them each frame had slipped into a comment.
- Hunger: only Crawly kin could eat → per-family diets. Hangry mode; hangry beats fear (fight or flight).
- Gloamhold (1-bit world), memory reels v1/v2, family names, Counters and Mathematicians, Designers, the Id|le-pedia, BYO-AI chat v1, static build groundwork.

## 2026-10-31 · One sound switch, the deck as the place for music (#21)

Nico (and a music-artist friend): on/off switches on the deck's mixer and effects, and one clear sound control instead of three (the 🔇 top right, the background music's on/off, the deck's play).

- **One master.** 🔊 top right mutes and unmutes everything (creature sounds, weather, background music, deck, reel soundtracks); hover or ▾ opens one master volume, a creatures-and-weather switch with its two levels, and which music plays. Everything now runs on one AudioContext through one master gain (`window.__audio`, arena.html); muted, the context is suspended after a 0.3 s ramp, so the audio graph does no work.
- **Which of Nico's two options.** Both, in the sense that matters: one plays at a time (off / background / deck: the same segmented switch in the panel and the popover), and the deck has a **base tune** switch that plays the background music under the deck's own parts at the deck's tempo, key and scale, with the deck's bass, lead and pad following the base tune's chords. Exclusive sources keep one clock; the base tune gives the "play a base and mix on top" idea without two tempos fighting.
- **Switches** (real toggle switches) on bass/lead/pad and on filter/echo/bitcrush: off takes it out of the sound and keeps its level or setting (`ch[c].off`, `fx.off[k]`; absent means on, so saved decks and sets load unchanged).
- **Migration.** No master saved yet: it starts unmuted if the background music was on (so Nico's music doesn't go quiet), muted otherwise (as before: sound was off by default). Tracks, sets, set list and levels untouched.
- **Pressing play while muted** unmutes and says so in a notice (silence after pressing play was the worst case).

Measured (headless Chromium, 220 Hz tone at 0.5 into the master, biggest sample-to-sample jump while muting and unmuting):

| | steady tone | while toggling |
|---|---|---|
| instant gain change (before) | 0.015 | **0.448** ↑ (a click) |
| 30 ms ramp (now) | 0.015 | **0.015** (no click) |

Muted: AudioContext `suspended` (was: separate contexts for effects, music and reels, effects muted only by skipping new notes). Phone: ☰ → *volume* opens it as a bottom sheet (375 px, no sideways scroll). Not in the frame loop, so no fps run.
