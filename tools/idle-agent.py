#!/usr/bin/env python3
"""idle-agent: drive an open Id|le tab from the command line (bring your own agent; the skill is /agent/SKILL.md). Standard library only.

    python3 tools/idle-agent.py pair ABC123 [--site https://staging.id-le.pages.dev]   # the code from 🔮 Oracle → connect an agent → allow
    python3 tools/idle-agent.py state                       # the world summary the tab shares (creatures, weather, rave, counts, story, events)
    python3 tools/idle-agent.py do weather kind=bitrain     # an action, args as key=value (numbers, true/false and JSON lists understood)
    python3 tools/idle-agent.py do rename name=Mo new_name=Momo
    python3 tools/idle-agent.py do say text="hello from my agent"
    python3 tools/idle-agent.py events [--after N]          # what happened since event N (results, world events, pairing)
    python3 tools/idle-agent.py forget                      # drop the saved token

The token is saved in ~/.idle-agent.json (this computer only). It stops working when the player clicks disconnect, closes the tab, or after 4 h.
"""
import json, os, sys, urllib.request, urllib.error

SAVE = os.path.expanduser(os.environ.get("IDLE_AGENT_FILE", "~/.idle-agent.json"))
DEFAULT_SITE = os.environ.get("IDLE_SITE", "https://staging.id-le.pages.dev")


def load():
    try: return json.load(open(SAVE))
    except Exception: return {}


def call(site, path, body=None, token=None, timeout=20):
    h = {"Content-Type": "application/json", "User-Agent": "idle-agent/1"}
    if token: h["Authorization"] = "Bearer " + token
    rq = urllib.request.Request(site.rstrip("/") + path, data=None if body is None else json.dumps(body).encode(), headers=h, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(rq, timeout=timeout) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {"error": "HTTP %d" % e.code}


def val(v):
    if v in ("true", "false"): return v == "true"
    try: return int(v)
    except ValueError: pass
    try: return float(v)
    except ValueError: pass
    if v[:1] in "[{":
        try: return json.loads(v)
        except ValueError: pass
    return v


def main(argv):
    args, site = [], None
    it = iter(argv)
    for a in it:
        if a == "--site": site = next(it, None)
        elif a.startswith("--site="): site = a.split("=", 1)[1]
        else: args.append(a)
    if not args or args[0] in ("-h", "--help", "help"): print(__doc__); return 0
    cmd, rest, saved = args[0], args[1:], load()
    site = site or saved.get("site") or DEFAULT_SITE
    if cmd == "pair":
        if not rest: print("pair needs the 6-letter code from the game (🔮 Oracle → connect an agent → allow)"); return 2
        st, r = call(site, "/lab/agent/pair", {"code": rest[0]})
        if st == 200 and r.get("token"):
            fd = os.open(SAVE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f: json.dump({"site": site, "token": r["token"]}, f)
            print(json.dumps({"ok": True, "site": site, "expires_s": r.get("expires")})); return 0
        print(json.dumps(r)); return 1
    if cmd == "forget":
        if os.path.exists(SAVE): os.remove(SAVE)
        print('{"ok": true}'); return 0
    tok = saved.get("token")
    if not tok: print('{"error": "not paired: run pair CODE first"}'); return 1
    if cmd == "state": st, r = call(site, "/lab/agent/state", token=tok)
    elif cmd == "events":
        after = rest[rest.index("--after") + 1] if "--after" in rest else "0"
        st, r = call(site, "/lab/agent/events?after=" + str(int(after)), token=tok)
    elif cmd == "do":
        if not rest: print("do needs an action: weather, spawn, rename, evolve, rave, look, creature, feed, say"); return 2
        kv = {}
        for p in rest[1:]:
            if "=" not in p: print("args are key=value, got %r" % p); return 2
            k, v = p.split("=", 1); kv[k] = val(v)
        st, r = call(site, "/lab/agent/do", {"action": rest[0], "args": kv}, token=tok)
    else: print(__doc__); return 2
    print(json.dumps(r, indent=1, ensure_ascii=False))
    return 0 if st == 200 and not r.get("error") and not (isinstance(r.get("result"), dict) and r["result"].get("error")) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
