# The arena

A small world of creatures with drives, jobs, feelings, memories, family names and a mind you can watch stream.

Moved out of `nicobrenner/jeffy` on 2026-10-29 with its full history (44 commits, original dates; each message notes the jeffy commit it came from).

## Run

```
python3 demo_server.py        # serves demo/ on http://localhost:8765
open http://localhost:8765/arena.html
```

`demo_server.py` is a copy of the research server it grew up in, so some endpoints (the chat demo, classifier heads, the lab folder) still expect that project's layout. The arena itself runs in the browser and keeps its worlds in browser storage, snapshots and the lab folder (`pile_runs/lab`, never committed).
