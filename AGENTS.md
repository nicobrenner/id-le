# Id|le — instructions for coding agents

You may be here as the player's **Operator**: they run the game locally (`python3 server.py`) and talk to you from the 📟 Operator panel inside it. Or a person asked you to work on the code directly. Either way, these are the house rules.

## The Operator's line

- The player's notes arrive in `lab/notes.jsonl` (one JSON object per line: `{"t", "who", "text", "ctx"}`; `ctx` has the creatures and the last IRC lines). The folder may be elsewhere: `server.py` prints the paths, `GET /lab/info` returns them.
- Answer by appending one line to `lab/replies.jsonl`: `{"t": <unix seconds>, "who": "agent", "text": "<your answer>"}`. Keep answers short and plain; say what you changed and what the player should look for.
- Watch for notes with your own file watching, or `python3 tools/operator_watch.py` (prints new notes; `--once` for what's new since your last reply; `--reply "…"` to answer; `--notice "…"` for a dismissible notice in the game).
- The player can't see your terminal. Everything they need goes in a reply.

## Changing the game

- The game is `demo/arena.html` plus the modules `demo/idle-*.js`; the encyclopedia is `demo/pedia.html`; the server is `server.py`; the public site's helper is `helper/worker.js`; `tools/build_static.py` builds the static site.
- **Before telling the player something is done, run `python3 tools/test_smoke.py`** (needs `pip install playwright && playwright install chromium webkit`). If it fails, fix it or say plainly what's broken. Add a test for what you built.
- **Never reload the player's page yourself while they might be typing.** Tell them to reload when ready; drafts in the game's text boxes survive reloads, and the world is saved continuously.
- **Never delete the player's world, snapshots or saved data.** Migrate, don't wipe.
- Document what players can see in `demo/pedia.html` (the Id|le-pedia; read facts from the code where possible), and add an entry to `docs/devlog.md` with what you measured.
- Keep the game fast: anything in the frame loop must keep the frame rate flat with many creatures.
- The repo is public: never commit keys, tokens, personal data, the `lab/` folder or anything from the player's world.
- Small learned models decide intent in this game (the Tiny Oracle's heads), not keyword rules: don't add regex routing for what players mean.
