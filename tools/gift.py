"""Personal gift links for the Founder gift (Nico, 11-02: "I'd be happy to write this one every time... it would be nicer to get an actual
real, personalized message").

Each link carries a letter Nico wrote for one person. The letter sits in the id-le-stats KV namespace under gift:<id> (kept 180 days);
the id is 120 random bits, so links can't be guessed. Opening the link shows the letter (signed "— Nico") and then the Founder creature
creator; the first browser that opens it marks it opened, and anywhere else it says the gift was already opened.

    python3 tools/gift.py new --note "Sam from r/chile"          # opens $EDITOR for the letter, prints the link
    python3 tools/gift.py new --note "Sam" --text "Hi Sam! ..."   # or the letter inline (--file letter.txt also works)
    python3 tools/gift.py list [--show]                          # label, created, opened or not (the letters only with --show)
    python3 tools/gift.py revoke <id>                            # the link stops working
    add --staging to any of these to use staging.id-le.com and its own namespace (id-le-stats-staging)

The label (--note) is private: only this tool shows it. Needs CLOUDFLARE_API_TOKEN in ~/.idle-ts/cf.env (never committed; never printed).
"""
import argparse, base64, datetime as dt, json, os, subprocess, sys, tempfile, time

TTL = 180 * 86400
MAX = 4000


def new_id():
    return base64.b32encode(os.urandom(15)).decode().lower().rstrip("=")   # 120 bits, 24 characters of a-z2-7


def site(staging):
    return "https://staging.id-le.com" if staging else "https://id-le.com"


def create(kv, letter, label, staging=False, now=None):
    letter = (letter or "").strip()
    if len(letter) < 2:
        raise SystemExit("the letter is empty")
    if len(letter) > MAX:
        raise SystemExit(f"the letter is {len(letter)} characters; {MAX} at most")
    now = now or time.time()
    gid = new_id()
    rec = {"letter": letter, "created": int(now * 1000), "label": (label or "")[:120], "exp": int((now + TTL) * 1000)}
    kv.put("gift:" + gid, json.dumps(rec), expiration=now + TTL)
    return gid, f"{site(staging)}/?gift={gid}"


def gifts(kv):
    out = []
    for k in kv.keys("gift:"):
        raw = kv.get(k["name"])
        if not raw:
            continue
        try:
            v = json.loads(raw)
        except ValueError:
            continue
        v["id"] = k["name"][5:]
        out.append(v)
    return sorted(out, key=lambda x: -(x.get("created") or 0))


def revoke(kv, gid):
    raw = kv.get("gift:" + gid)
    if not raw:
        raise SystemExit("no such gift: " + gid)
    v = json.loads(raw)
    v["revoked"] = int(time.time() * 1000)
    kv.put("gift:" + gid, json.dumps(v), expiration=(v.get("exp") or (time.time() + TTL) * 1000) / 1000)
    return v


def when(t):
    return dt.datetime.fromtimestamp((t or 0) / 1000).strftime("%Y-%m-%d %H:%M") if t else "-"


def from_editor(label):
    ed = os.environ.get("EDITOR") or "nano"
    with tempfile.NamedTemporaryFile("w+", suffix=".txt", delete=False) as f:
        f.write(f"# Your letter{' for ' + label if label else ''}. Lines starting with # are left out; it is signed \"— Nico\" for you.\n\n")
        path = f.name
    try:
        subprocess.call([ed, path])
        return "\n".join(l for l in open(path).read().splitlines() if not l.startswith("#")).strip()
    finally:
        os.unlink(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--staging", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new"); n.add_argument("--note", default=""); n.add_argument("--text"); n.add_argument("--file")
    li = sub.add_parser("list"); li.add_argument("--show", action="store_true")
    r = sub.add_parser("revoke"); r.add_argument("id")
    for s in (n, li, r):
        s.add_argument("--staging", action="store_true", default=argparse.SUPPRESS)
    a = ap.parse_args()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from feedback import KV
    kv = KV(staging=a.staging)
    if a.cmd == "new":
        letter = a.text if a.text is not None else open(a.file).read() if a.file else from_editor(a.note)
        gid, url = create(kv, letter, a.note, a.staging)
        print(url)
    elif a.cmd == "list":
        gs = gifts(kv)
        if not gs:
            print("no gift links yet")
        for v in gs:
            st = "revoked " + when(v["revoked"]) if v.get("revoked") else "opened " + when(v["claimed"]) if v.get("claimed") else "not opened yet"
            print(f"{v['id']}  {when(v.get('created'))}  {st:<28} {v.get('label') or ''}")
            if a.show:
                print("    " + v.get("letter", "").replace("\n", "\n    ") + "\n")
    elif a.cmd == "revoke":
        revoke(kv, a.id)
        print("revoked: " + a.id)


if __name__ == "__main__":
    main()
