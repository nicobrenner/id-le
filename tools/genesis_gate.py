"""The Genesis gate: does a free-text message say the guided step's command? (Nico, 11-04: typing "wachito" instead of "lights on" evolved
the world once and then counted as the lights.)

A small learned head over the same features the Tiny Operator's heads read (the Tiny Oracle's hidden states: last token + mean, 1024 values),
trained on a labeled set of the guided steps' phrasings, paraphrases and typos against chit-chat, nonsense and other requests. No regex and
no keyword rules: the exact pre-typed command is matched as command syntax in idle-genesis.js; everything else goes through this head.

    python3 tools/genesis_gate.py            # extract features in a headless browser (shared lock), train, pick thresholds, write demo/genesis_gate.json
    python3 tools/genesis_gate.py --probe "wachito" "turn on the lights"   # what the v4 heads and the gate say (after a run)

Thresholds are chosen per step on the training split (cross-validated) for zero false advances there, then reported on the held-out split.
"""
import argparse, json, os, random, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "demo", "genesis_gate.json")
CACHE = os.path.join(tempfile.gettempdir(), "idle-genesis-gate-feats.json")
CLASSES = ["light", "words", "creatures", "sky", "other"]

DATA = {
  "light": ["lights on", "let there be light", "light", "lights", "lights!", "turn on the lights", "turn the lights on", "light please",
            "switch on the lights", "some light please", "let's have some light", "give me light", "make it bright", "brighten it up",
            "let there be lights", "let ther be lite", "lights onn", "ligths on", "lite on", "let there b light", "lights on please",
            "can we get some light", "it's too dark, light", "illuminate", "turn on the light", "flip the lights on", "light it up",
            "let the light in", "more light", "bring the light", "LIGHTS ON", "Lights on.", "let there be light!", "i want light",
            "make light", "let it be light", "please turn on the lights", "lights up", "hit the lights", "dawn please"],
  "words": ["let there be words", "words", "some words", "let there be words about the sea", "give it words", "words please",
            "let there be word", "let ther be words", "let there be wordz", "add some words", "we need words", "make words",
            "give me some words", "let there be words!", "bring words", "teach it words", "fill the floor with words", "words about cats",
            "let there be words about music", "drop some words", "scatter some words", "let there be vocabulary", "make a floor of words",
            "lots of words", "let there be text", "give it a vocabulary", "words words words", "wrods", "let there bee words",
            "lt there be words", "put words on the floor", "let there be some words", "Let There Be Words", "words, please",
            "make some text", "let the words fall", "rain words", "give it something to read", "let there be letters"],
  "creatures": ["let there be life", "life", "bring life", "let there be creatures", "make creatures", "spawn some creatures",
                "let there be life!", "let ther be life", "let there be lyfe", "give it life", "bring it to life", "we need life",
                "life please", "let something live", "make something alive", "create life", "let there be critters", "add creatures",
                "bring the creatures", "let them live", "breathe life into it", "let there be beings", "let there be animals",
                "make life", "lif", "let there be lfe", "life!", "Let there be life.", "start life", "summon life", "first creatures",
                "let the first creatures come", "bring someone to walk on it", "let something crawl", "give me creatures",
                "populate it", "fill it with life", "let there be living things", "make them alive"],
  "sky": ["give it weather", "make it rain", "weather please", "let it snow", "a storm", "make it foggy", "let there be music",
          "play music", "some music please", "put on a song", "make it windy", "clear skies", "let there be weather", "sunshine",
          "add some rain", "music!", "play something", "give it a sky", "make a storm", "thunder please"],
  "other": ["wachito", "asdf", "hello", "hi", "who are you?", "what is this", "where am i", "help", "what do i do", "lol", "ok",
            "yes", "no", "cool", "wow", "huh?", "test", "123", "qwerty", "blah blah", "hmm", "i'm scared", "is that a black hole",
            "what happened", "how are you", "thanks", "nice", "what's your name", "can you hear me", "this is weird", "go away",
            "evolve", "evolve the world", "rename it", "start a rave", "rave on", "look around", "what's happening", "make a volcano",
            "earthquake", "name the world Bob", "spawn a debugger", "fetch coffee", "tell me a joke", "i love you", "where is doc",
            "doc", "lester", "dinner at 7", "pizza", "banana", "chicken nuggets", "the void is quiet", "it's dark", "darkness",
            "turn it off", "lights off", "no light", "stop", "skip", "nothing", "something", "anything", "whatever", "sdfgh",
            "jjjjj", "aaaaa", "x", "?", "!!!", "...", "wachito wachito", "hola", "buenas", "que onda", "cachai", "weon", "bonjour",
            "is anyone there", "what's a consciousness", "who is nico", "how long is this", "what time is it", "i'm bored",
            "this is cool", "make me a sandwich", "open settings", "show the pedia", "what is an epoch", "how do i play",
            "can i skip this", "restart", "go back", "undo", "delete everything", "kill them", "destroy it", "the end",
            "my name is ana", "call me doc", "sing a song for me", "how big is the world", "what is the loss", "train the model",
            "run project 24", "the training run", "lester help me", "where are the creatures", "is it alive", "what's the light",
            "what are words", "life is hard", "light years", "words fail me", "light bulb jokes"]}
# a few "other" items mention a step's word without asking for it (life is hard, light years…): the head must not advance on them


def labeled():
    rows = []
    for c, texts in DATA.items():
        for t in texts: rows.append((t, c))
    return rows


def extract(texts):
    """features + the v4 heads' answer for each text, from the real Tiny Oracle in a headless browser (the shared browser lock)"""
    sys.path.insert(0, HERE)
    import test_smoke as T
    from playwright.sync_api import sync_playwright
    out = tempfile.mkdtemp(prefix="idle-gate-"); T.build(out); srv, base = T.serve(out)
    try:
        with T.browser_lock(), sync_playwright() as p:
            b = p.chromium.launch(headless=True); ctx = b.new_context(); pg = ctx.new_page()
            pg.goto(base + "/arena.html?fresh=1&test"); pg.wait_for_function("() => window.__oracle && window.__oracle.ready && window.__idleAI", timeout=180000)
            res = pg.evaluate("""async ts => { const H = await window.__idleAI.heads(), out = [];
              for (const t of ts) { const r = await window.__oracle.classify(t, H, true); out.push({ t, option: r.option, p: r.probs[r.option] || 0, probs: r.probs, x: r.x ? Array.from(r.x) : null }); }
              return out; }""", texts)
            b.close()
    finally:
        srv.shutdown()
    return res


def softmax(z): z = z - z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)


def train(X, y, C=len(CLASSES), l2=1e-2, epochs=600, lr=0.5):
    """multinomial logistic regression on standardized features (full batch, plain numpy)"""
    mu, sd = X.mean(0), X.std(0) + 1e-6; Z = (X - mu) / sd; n, d = Z.shape
    W = np.zeros((d, C)); b = np.zeros(C); Y = np.eye(C)[y]
    # class weights: every class counts the same, whatever its size
    cw = (n / (C * np.bincount(y, minlength=C).clip(1)))[y][:, None]
    for _ in range(epochs):
        P = softmax(Z @ W + b); G = (P - Y) * cw / n
        W -= lr * (Z.T @ G + l2 * W); b -= lr * G.sum(0)
    # fold the standardization into the weights so the page needs only w·x + b
    Wf = W / sd[:, None]; bf = b - (mu / sd) @ W
    return Wf, bf


def predict(W, b, X): return softmax(X @ W + b)


def pick_thresholds(Xtr, ytr, folds=5, seed=0, l2=1e-2):
    """per step: the lowest threshold with no false advance in any cross-validation fold of the training split (out-of-fold probabilities)"""
    rng = np.random.RandomState(seed); idx = rng.permutation(len(ytr)); P = np.zeros((len(ytr), len(CLASSES)))
    for f in range(folds):
        te = idx[f::folds]; tr = np.setdiff1d(idx, te); W, b = train(Xtr[tr], ytr[tr], l2=l2); P[te] = predict(W, b, Xtr[te])
    thr = {}
    for ci, c in enumerate(CLASSES[:4]):
        neg = P[ytr != ci, ci]; thr[c] = float(min(0.99, max(0.5, (neg.max() if len(neg) else 0) + 0.02)))
    return thr, P


def metrics(P, y, thr):
    out = {}
    for ci, c in enumerate(CLASSES[:4]):
        adv = (P[:, ci] >= thr[c]) & (P.argmax(1) == ci); tp = int((adv & (y == ci)).sum()); fp = int((adv & (y != ci)).sum()); pos = int((y == ci).sum())
        out[c] = {"precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / pos, 3) if pos else None, "tp": tp, "fp": fp, "n_pos": pos}
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--probe", nargs="*"); ap.add_argument("--reuse", action="store_true", help="reuse cached features")
    a = ap.parse_args()
    if a.probe:
        G = json.load(open(OUT)); r = extract(a.probe)
        for e in r:
            p = predict(np.array(G["w"]).T, np.array(G["b"]), np.array([e["x"]]))[0]
            print(f"{e['t']!r}: v4 head → {e['option']} {e['p']:.2f} | gate → " + ", ".join(f"{c} {p[i]:.2f}" for i, c in enumerate(CLASSES)))
        return
    rows = labeled(); texts = [t for t, _ in rows]
    if a.reuse and os.path.exists(CACHE): feats = json.load(open(CACHE))
    else: feats = extract(texts); json.dump(feats, open(CACHE, "w"))
    byT = {f["t"]: f for f in feats}
    X = np.array([byT[t]["x"] for t, _ in rows], dtype=np.float64); y = np.array([CLASSES.index(c) for _, c in rows])
    # stratified train / held-out split (30% held out)
    rng = random.Random(24); tr, te = [], []
    for ci in range(len(CLASSES)):
        ii = [i for i in range(len(y)) if y[i] == ci]; rng.shuffle(ii); k = max(1, round(len(ii) * 0.3)); te += ii[:k]; tr += ii[k:]
    tr, te = np.array(sorted(tr)), np.array(sorted(te))
    # the L2 strength is picked on the training split only (cross-validated recall at zero false advances), never on the held-out texts
    best = None
    for l2 in (1e-3, 1e-2, 1e-1, 1.0, 3.0):
        thr_, Pcv = pick_thresholds(X[tr], y[tr], l2=l2); m = metrics(Pcv, y[tr], thr_); score = sum(v["recall"] or 0 for v in m.values())
        print(f"  l2 {l2:g}: cross-validated recall per step " + ", ".join(f"{c} {v['recall']}" for c, v in m.items()))
        if best is None or score > best[0]: best = (score, l2, thr_)
    _, L2, thr = best
    W, b = train(X[tr], y[tr], l2=L2); Pte = predict(W, b, X[te])
    for i, k in enumerate(te):
        top = int(Pte[i].argmax()); adv = top < 4 and Pte[i, top] >= thr[CLASSES[top]]
        if adv and top != y[k]: print(f"  held-out FALSE ADVANCE: {texts[k]!r} ({CLASSES[y[k]]}) → {CLASSES[top]} {Pte[i, top]:.3f}")
        elif not adv and y[k] < 4: print(f"  held-out missed: {texts[k]!r} ({CLASSES[y[k]]}) → {CLASSES[top]} {Pte[i, top]:.3f}")
    held = metrics(Pte, y[te], thr)
    acc = float((Pte.argmax(1) == y[te]).mean())
    # what the old path (the v4 heads, acting at ≥0.9 on world options; any guided step accepted after one nudge) did on the same held-out texts
    WORLD = {"weather", "spawn", "rave_on", "rave_off", "disaster", "rename", "evolve", "look", "words", "first_creatures", "light", "music"}
    old_act = [texts[i] for i in te if byT[texts[i]]["option"] in WORLD and byT[texts[i]]["p"] >= (0.5 if byT[texts[i]]["option"] == "look" else 0.9) and y[i] == CLASSES.index("other")]
    # the final head: all data, the cross-validated thresholds
    Wall, ball = train(X, y, l2=L2)
    wach = byT["wachito"]
    report = {"classes": CLASSES, "thr": thr, "l2": L2, "heldout": {"per_step": held, "accuracy": round(acc, 3), "n_train": int(len(tr)), "n_heldout": int(len(te)),
              "old_v4_acted_on_other": old_act},
              "wachito_v4": {"option": wach["option"], "p": round(wach["p"], 3), "top3": sorted(wach["probs"].items(), key=lambda kv: -kv[1])[:3]}}
    json.dump({"classes": CLASSES, "w": Wall.T.round(6).tolist(), "b": ball.round(6).tolist(), "thr": thr, "d": int(X.shape[1]),
               "heldout": report["heldout"], "note": "tools/genesis_gate.py: the Genesis gate over the Tiny Oracle's features (last token + mean)"}, open(OUT, "w"))
    print(json.dumps(report, indent=1))
    Pw = predict(Wall, ball, np.array([wach["x"]]))[0]
    print("wachito → gate", {c: round(float(Pw[i]), 3) for i, c in enumerate(CLASSES)})


if __name__ == "__main__":
    main()
