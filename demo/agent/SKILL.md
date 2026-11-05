---
name: idle-agent
description: Play Id|le (id-le.com) with the player, through their open game tab. Use when the player gives you a 6-letter Id|le code or asks you to look at, or do something in, their Id|le world (weather, creatures, rave, words, chat).
---

# Id|le: bring your own agent

Id|le is a little world of word-eating creatures that lives in the player's browser. The player can let you see a summary of their
world and act in it, live, through their open tab. Everything you do goes through the same verbs as the game's own Operator, and the
player sees it happen.

## Pairing (the player decides)

1. The player opens **🔮 Oracle → connect an agent** in the game, reads what you can do, and clicks **allow**.
2. The game shows a 6-letter code (it works once, for 10 minutes). Ask the player for it if you don't have it.
3. Pair: `POST /lab/agent/pair {"code": "ABC123"}` → `{"token": "…"}`. Send the token as `Authorization: Bearer <token>` from then on.

The session ends when the player clicks **disconnect**, closes the tab, or after 4 hours. A `401` means it ended: ask for a new code.

## The API (on the game's own site: https://staging.id-le.pages.dev, or http://localhost:8766 for `python3 server.py`)

| call | what |
|---|---|
| `POST /lab/agent/pair {code}` | the token |
| `GET /lab/agent/state` | the world summary the tab shares: `weather`, `rave`, `counts`, `families`, `creatures` (name, family, job, mood, state; the 20 nearest the player's view), `story` (storyline, epoch, whether Genesis is still going), `recent_events`, `allowed_actions` and `actions_help` |
| `POST /lab/agent/do {action, args}` | ask the tab to do something; waits up to 10 s for its answer: `{ok, id, result}` |
| `GET /lab/agent/events?after=N` | what happened since event N: your actions' results, world events (births, meals, renames…), pairing |

Actions (`args` in braces):

- `look {near?}`: the world near a creature (or the player's view): words on the floor, designs, disasters
- `creature {name}`: one creature's card (drives, diet, genes, friends, diary)
- `say {text}`: a line in the player's Operator chat, shown as **🤖 agent:**; keep it short and in the spirit of the game
- `weather {kind, strength?}`: clear, bitrain, static, fog, wind, hum, storm (storms and static scare timid creatures)
- `spawn {kind}`: crawly, tok, or a special job (namer, blursort, crawler, debug, designer, counter, math, sorter); at most 5 an hour
- `rename {name, new_name}`
- `evolve {name, how?}`: one creature (`mutate` small, `big` large) or `"world"`
- `rave {on}`: start (`true`) or stop (`false`) the rave
- `feed {words, near?}`: drop up to 12 words on the floor for the creatures
- `say_as {name, text}`: a creature says a short line (a speech bubble and a line in its mind; under 140 characters, in character)
- `show {name}`: fly the player's view to a creature and open its card (it moves their camera: use it when it helps them)
- `note {text}`: pin a short note in 💬 IRC, the world chat

**During Genesis** (`state.story.genesis` is true: the storyline is building the world) only `look`, `creature` and `say` work; the
rest answer with an error. `allowed_actions` always says what works right now.

Limits: 30 actions a minute per token (`429` past that), plus the game's own limits. Bodies are JSON, at most 16 KB.

## The CLI (standard library Python)

```
python3 tools/idle-agent.py pair ABC123 --site https://staging.id-le.pages.dev
python3 tools/idle-agent.py state
python3 tools/idle-agent.py do weather kind=bitrain
python3 tools/idle-agent.py do rename name=Mo new_name=Momo
python3 tools/idle-agent.py do say text="hello from my agent"
python3 tools/idle-agent.py events --after 0
```

## Manners

- Read `state` before acting, and say what you did (`say`) when it isn't obvious from the world.
- It's the player's world: ask before anything big (a storm, a whole-world evolve, many spawns).
- You see a summary only: no world file, no chat history, no keys. Nothing is kept on the server beyond the live session.
