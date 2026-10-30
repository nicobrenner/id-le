# Id|le development & research log

What we built, what we measured, and what surprised us. Newest first. Each entry names the commit or issue.
Numbers come from tests on copies of Nico's world (headless, one browser at a time) unless marked otherwise.

## 2026-10-30

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
