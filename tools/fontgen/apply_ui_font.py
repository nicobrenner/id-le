#!/usr/bin/env python3
"""One-off (kept for the record and for files that come back from other branches): CSS `system-ui` → `var(--ui-font,system-ui)`.

    python3 tools/fontgen/apply_ui_font.py demo/arena.html demo/idle-notify.js …

Canvas font strings (`g.font = '9px system-ui'`) are left alone: a canvas can't read CSS variables; those use
window.IDLE_FONTS where they should. Already-converted occurrences are skipped, so it can run twice.
"""
import re, sys

CANVAS = re.compile(r"(?<!style)\.font\s*=\s*(`[^`]*|'[^']*|\"[^\"]*)$")
DONE = "var(--ui-font,system-ui)"


def convert(s):
    out, i, n = [], 0, 0
    for m in re.finditer(r"(?<![-\w(,])system-ui|(?<=,)system-ui", s):
        a = m.start()
        if s[max(0, a - 15):a].endswith("var(--ui-font,"):
            continue
        if CANVAS.search(s[max(0, a - 160):a]):
            continue
        out.append(s[i:a]); out.append(DONE); i = m.end(); n += 1
    out.append(s[i:])
    return "".join(out), n


if __name__ == "__main__":
    for p in sys.argv[1:]:
        s = open(p, encoding="utf-8").read()
        s2, n = convert(s)
        if n:
            open(p, "w", encoding="utf-8").write(s2)
        print(f"{p}: {n}")
