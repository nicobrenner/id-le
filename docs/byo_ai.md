# BYO-AI: the in-game chat with your own AI

Status: v1 built (2026-10-29): demo/idle-ai.js (the chat, the brains, the tools) and window.__idleWorld in arena.html (the verbs). Not yet: the idle-bridge relay script for players, Tiny Oracle as a brain, `instruct` and `snapshot` tools, undo chips.

Nico (2026-10-29): "that would be one of the main features! BYO-AI, you can use either a subscription like you, or API, or local model... (eventually use TO)".

Update (2026-11-01, #18): running locally with `server.py`, the Operator's brain **🛠 your coding agent (local)** posts notes to `lab/notes.jsonl` and shows `lab/replies.jsonl`; any coding agent (Claude Code on a subscription, etc.) can answer and change the code. See docs/operator-coding-agent.md and AGENTS.md. Before that: the lab chat posted notes to `demo_server.py`, they landed in `pile_runs/lab/notes.jsonl`, and a Claude Code session on Nico's Mac read them and answered in `replies.jsonl`. The public game keeps that sidebar as its main way to talk to an AI that can see the world and change it, and the player chooses which AI.

## One chat, four kinds of brain

Every brain implements one small interface in the page:

```
brain.send({ messages, world, tools }) -> stream of { text } and { tool_call: { name, input } }
```

The game runs the tool calls itself and sends the results back, so the AI never touches the page directly.

| Brain | How it connects | Notes |
|---|---|---|
| **API key** (Anthropic, or any OpenAI-compatible provider) | browser → the provider's API directly, with the player's key | The key is stored only in this browser (IndexedDB, never in snapshots or world files) and sent only to the provider's host. Anthropic's direct-browser-access opt-in header is `anthropic-dangerous-direct-browser-access: true` (what the TS SDK sends for `dangerouslyAllowBrowser`; checked in the SDK source 2026-10-29). Default model `claude-opus-5-5` with adaptive thinking at `low` effort, since this is chat; the player can pick another model. Use strict tools with `tool_choice: auto` (forced tool choice is rejected on current models). |
| **Local model** (Ollama, LM Studio, llama.cpp server) | browser → `http://localhost:11434` (or the port the player sets) | The local server must allow the game's origin (`OLLAMA_ORIGINS=https://id-le.com`), and the README will say so. With COEP on, a localhost response also needs `Cross-Origin-Resource-Policy`, or the game makes the call from a non-isolated helper iframe. Tool calling depends on the model; models without it get a JSON-in-text fallback that the game parses and validates. |
| **Subscription agent** (Claude Code or a similar CLI the player already pays for) | the agent runs on the player's machine and joins through a tiny localhost relay, exactly like today's notes/replies files | Ship `idle-bridge`, a ~100-line script: it serves `/notes` and `/replies` on localhost and writes them to two files the player's agent watches. Today's manager setup becomes the reference. Players get the relay from the README, not from the site. |
| **Tiny Oracle** (later; "BO" if it outgrows the name) | in the page, through the same ONNX worker that already writes the Oracle's comments | No key, no network. It needs a tool-use fine-tune first; until then the Oracle keeps commenting and the chat says "bring an AI to talk". |

## What the AI can do: the tool protocol

The tools are small and named after game verbs. Every call is validated against its schema, rate-limited per minute, and logged in the world's event log as "the AI did X", so the player can see and undo it. Snapshots are taken before anything large.

| Tool | Input | Effect |
|---|---|---|
| `look` | `{ near?: name or {x,y}, radius? }` | A compact view: creatures (name, family, job, state, top feelings), words and things nearby, weather, place. It's always summarised, never 4,000 raw words. |
| `creature` | `{ name }` | The card as data: genes, diet, feelings, diary tail, friends. |
| `say_as` | `{ name, text }` | The creature says a line (speech bubble + diary). |
| `instruct` | `{ name, text }` | Goes through the same instruction head as a typed command ("fetch tower"). |
| `weather` | `{ kind, strength? }` | Sets this world's weather. |
| `spawn` | `{ family or job, near? }` | Releases a new creature, capped per hour. |
| `evolve` | `{ name or "world", how: "mutate" or "big" }` | The existing evolve paths. |
| `place_words` | `{ words[], near? }` | Drops words on the floor. |
| `snapshot` | `{ name }` | Saves a snapshot. |
| `note` | `{ text }` | Pins a note in the chat. |

Things it can't do: delete snapshots, change settings outside the world, read other browsers' data, or anything that leaves the page. Destructive verbs ("remove", "forget") don't exist as tools; the AI asks the player instead.

Context sent with each turn: the last turns of chat, `look()` around the camera, the world line (place, weather, day, counts), and the player's selection. That's the same `ctx` the lab notes carry today.

## Safety and privacy

- **Keys:** a key goes only to its provider's host. The helper worker never sees it, and there's no server-side storage at all.
- **World data:** it leaves the browser only toward the brain the player chose.
- **Spend:** the player sets a per-session limit for API brains (requests per hour and max tokens), shown in the chat header.
- **What the AI did:** every action appears in the chat as a chip ("☁ weather → storm · undo"); undo uses snapshots.
- **Untrusted text:** page text the creatures pulled in is data, so it's sent to the AI as quoted content, never as instructions.
