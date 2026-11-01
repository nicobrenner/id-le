# The Operator as a coding agent

Id|le was built by chatting with a coding agent (Claude Code) from inside the game: notes typed in the 📟 Operator panel went to a file the agent watched, the agent changed the game's code, and the game reloaded. You can do the same with your own copy. It's open source (MIT), so your agent can change anything: creatures, rules, looks, the pedia, the code itself.

On id-le.com the Operator can only use the game's own actions (with the Tiny Operator, your own API key, or a local model). This guide is for running Id|le on your computer, where the Operator's chair can hold a full coding agent.

## 1. Run Id|le locally

```
git clone https://github.com/nicobrenner/id-le
cd id-le
python3 server.py
```

Open http://localhost:8766. That's the whole game, with nothing but Python's standard library. Optional extras:

- `pip install onnxruntime tokenizers`: the Crawler scores pages by meaning (sentence vectors); without them it uses word vectors.
- `python3 server.py 8800 --lab ~/my-idle-lab`: another port, another folder for notes and world copies.

When it starts, the server prints where the Operator's files are:

```
Operator notes: /…/id-le/lab/notes.jsonl   replies: /…/id-le/lab/replies.jsonl
```

The `lab/` folder is in `.gitignore`: your notes, replies and world copies never end up in a commit.

## 2. Seat your agent in the Operator's chair

1. In the game, open **📟 Operator** (bottom right) and pick the brain **🛠 your coding agent (local)**. It's the default when the game runs on `server.py`.
2. In another terminal, start your coding agent in the repo folder. With Claude Code:

   ```
   cd id-le
   claude
   ```

   and tell it something like:

   > You are the Operator of my Id|le world. Follow AGENTS.md: watch the Operator's notes, answer them, and change the game when I ask.

   `AGENTS.md` (Claude Code also reads it through `CLAUDE.md`) tells the agent how the line works, how to answer, how to test before saying something is done, and the house rules. Any agent that reads files and runs commands works the same way: Codex, Aider, Cursor's agent…
3. Type in the Operator panel: *"make the creatures purple"*, *"add a creature that collects vowels"*, *"why are the Debuggers so slow?"*. The agent's answers appear in the same panel.

## How the line works

| What | Where | Who writes it |
|---|---|---|
| Your notes | `lab/notes.jsonl`: `{"t": unix seconds, "who": "you", "text": "…", "ctx": {page, creatures, log}}` | the game, when you press send (⌘+Enter) |
| Replies | `lab/replies.jsonl`: `{"t": unix seconds, "who": "agent", "text": "…"}` | your agent |
| Notices | `lab/notices.json`: `[{"id": "…", "branch": "agent", "text": "…"}]` | your agent, for things worth a pill in the game ("New: purple creatures, reload to see them") |

`ctx` carries a little of the world with each note: the creatures (names, states, drives) and the last lines of IRC, so the agent knows what you're looking at.

For agents without a way to watch files, `python3 tools/operator_watch.py` prints new notes as they arrive, `--once` prints what's new since the last reply, and `--reply "…"` / `--notice "…"` answer.

## Reloading

When the agent changes the code, the game needs a reload to pick it up. The agent should tell you ("reload when you're ready") rather than reload for you: you may be in the middle of typing. Text you're typing in the game's boxes is kept across reloads anyway (drafts), and your world is saved continuously, in this browser and in `lab/sync_*.json`.

## Safety

- The server listens on 127.0.0.1 only: nobody else on your network can reach it.
- Your agent can run commands on your computer; give it the permissions you're comfortable with (Claude Code asks before running anything you haven't allowed).
- The game itself sends nothing anywhere when it runs locally (no stats). Reading web pages for the creatures goes from your computer straight to those sites.
