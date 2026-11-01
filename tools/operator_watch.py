#!/usr/bin/env python3
"""The Operator's line, for coding agents: print the player's notes as they arrive, and answer them.

    python3 tools/operator_watch.py              # wait for new notes and print them (Ctrl+C to stop)
    python3 tools/operator_watch.py --once       # print the notes since the last reply, then exit (for agents that poll)
    python3 tools/operator_watch.py --reply "Done: the creatures are purple now. Reload when you're ready (your typing is kept)."
    python3 tools/operator_watch.py --notice "New: purple creatures"   # a dismissible notice in the game (lab/notices.json)

Files (in the lab folder, default ./lab, or --lab / ARENA_LAB; server.py prints the paths when it starts):
  notes.jsonl     one JSON object per line, written by the game: {"t": unix seconds, "who": "you", "text": "...", "ctx": {page, creatures, log…}}
  replies.jsonl   one JSON object per line, written by you:      {"t": unix seconds, "who": "agent", "text": "..."}
  notices.json    a JSON list the game shows as dismissible notices: [{"id": "...", "branch": "agent", "text": "...", "where": "optional"}]
"""
import argparse, json, os, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rows(path):
    if not os.path.exists(path): return []
    out = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line:
            try: out.append(json.loads(line))
            except Exception: pass
    return out


def show(n):
    t = time.strftime("%H:%M:%S", time.localtime(float(n.get("t") or 0)))
    print(f"[{t}] {n.get('who', 'you')}: {n.get('text', '')}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lab", default=os.environ.get("ARENA_LAB") or os.path.join(ROOT, "lab"))
    ap.add_argument("--once", action="store_true", help="print the notes newer than the last reply and exit")
    ap.add_argument("--reply", help="append a reply the player sees in the Operator panel")
    ap.add_argument("--who", default="agent", help="name shown on replies (default: agent)")
    ap.add_argument("--notice", help="show a dismissible notice in the game")
    a = ap.parse_args()
    lab = os.path.abspath(os.path.expanduser(a.lab)); os.makedirs(lab, exist_ok=True)
    notes, replies = os.path.join(lab, "notes.jsonl"), os.path.join(lab, "replies.jsonl")
    if a.reply:
        with open(replies, "a", encoding="utf-8") as f: f.write(json.dumps({"t": time.time(), "who": a.who, "text": a.reply}) + "\n")
        print("replied"); return
    if a.notice:
        f = os.path.join(lab, "notices.json")
        try: L = json.load(open(f))
        except Exception: L = []
        L.append({"id": f"n{int(time.time())}", "branch": a.who, "text": a.notice}); json.dump(L[-20:], open(f, "w"))
        print("notice posted"); return
    last = max([float(r.get("t") or 0) for r in rows(replies)] or [0])
    if a.once:
        new = [n for n in rows(notes) if float(n.get("t") or 0) > last]
        for n in new: show(n)
        if not new: print("(no new notes)")
        return
    seen = len(rows(notes))
    print(f"watching {notes} (Ctrl+C to stop)", flush=True)
    try:
        while True:
            cur = rows(notes)
            for n in cur[seen:]: show(n)
            seen = len(cur); time.sleep(2)
    except KeyboardInterrupt: pass


if __name__ == "__main__":
    sys.exit(main())
