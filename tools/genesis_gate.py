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

# round 2 (11-04, after the launch: "let there be life" paraphrases almost always got the nudge, held-out recall 0.08): more ways to ask
# for life, and more texts that only mention life/light/words without asking. Kept apart from DATA so round 1's train/held-out split is
# reproducible; round 2 gets its own stratified split, and the held-out report covers both.
DATA2 = {
  "creatures": ["bring them to life", "make creatures", "let them live", "life please!", "create life", "let there be creatures!",
                "bring life to it", "let there be life please", "let life begin", "life, please", "make some creatures", "create creatures",
                "let the creatures come", "let creatures appear", "now life", "and now life", "let there be life now", "give it some life",
                "add life", "spawn life", "let life in", "let there be some life", "let there be lifee", "let tehre be life", "let there be liffe",
                "lett there be life", "let there be lief", "let ther be lif", "let there be live", "bring forth life", "bring forth creatures",
                "let life appear", "wake the creatures", "let the first ones walk", "create the first creatures", "make the first creatures",
                "let there be LIFE", "LET THERE BE LIFE", "let there be life :)", "ok let there be life"],
  "other": ["get a life", "what is life", "life is good", "such is life", "life sucks", "i have no life", "life goals", "meaning of life",
            "is there life on mars", "life after death", "what is a creature", "are creatures real", "creature comforts", "the creatures are scary",
            "i don't want creatures", "no creatures please", "no life", "stop life", "kill all life", "end life", "life is a game",
            "life of pi", "this is my life", "half life", "second life", "lifetime", "lifeguard", "live long and prosper", "live laugh love",
            "i live in chile", "where do you live", "light switch", "lightweight", "highlight", "words of wisdom", "in other words",
            "a word", "password", "crossword", "my words", "what light?", "is there life here?", "how do creatures eat", "will they die",
            "do creatures sleep", "creatures?", "life?", "what's next", "next step", "continue"]}


def labeled(data=None):
    rows = []
    for c, texts in (data or DATA).items():
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


NG_B, NG_NS = 2048, (1, 2, 3, 4)


def _units(t):
    b = t.encode("utf-16-le"); return [b[i] | (b[i + 1] << 8) for i in range(0, len(b), 2)]


def _fnv(units):
    h = 0x811c9dc5
    for u in units: h ^= u; h = (h * 0x01000193) & 0xffffffff
    return h


def ngrams(t, B=NG_B, ns=NG_NS):
    """hashed character n-grams (1-4) + whole words over the lowercased, space-normalized text, L2-normalized. The same code runs in
    idle-genesis.js (gateNgrams): UTF-16 code units, FNV-1a, modulo B. A learned feature map for the head, not a rule."""
    t = " " + " ".join(t.lower().split()) + " "; u = _units(t); v = np.zeros(B)
    for n in ns:
        for i in range(len(u) - n + 1): v[_fnv(u[i:i + n]) % B] += 1
    for w in t.split(): v[_fnv(_units("w:" + w)) % B] += 1
    nrm = np.linalg.norm(v); return v / nrm if nrm > 0 else v


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


def split(y, frac=0.3, seed=24):
    """stratified train / held-out indices (the round-1 procedure: same seed, same order)"""
    rng = random.Random(seed); tr, te = [], []
    for ci in range(len(CLASSES)):
        ii = [i for i in range(len(y)) if y[i] == ci]; rng.shuffle(ii); k = max(1, round(len(ii) * frac)) if ii else 0; te += ii[:k]; tr += ii[k:]
    return sorted(tr), sorted(te)


def features(texts, reuse=True):
    """features for every text; cached by text, so only new texts are run through the Tiny Oracle"""
    cache = {}
    if reuse and os.path.exists(CACHE):
        try: cache = {f["t"]: f for f in json.load(open(CACHE))}
        except Exception: cache = {}
    missing = [t for t in dict.fromkeys(texts) if t not in cache]
    if missing:
        print(f"  extracting {len(missing)} new texts (cached {len(cache)})", flush=True)
        for f in extract(missing): cache[f["t"]] = f
        json.dump(list(cache.values()), open(CACHE, "w"))
    return cache


def train_raw(F, y, l2, epochs=800, lr=1.0, C=len(CLASSES)):
    """multinomial logistic regression on already-scaled features (full batch, class-balanced)"""
    n, d = F.shape; W = np.zeros((d, C)); b = np.zeros(C); Y = np.eye(C)[y]; cw = (n / (C * np.bincount(y, minlength=C).clip(1)))[y][:, None]
    for _ in range(epochs):
        P = softmax(F @ W + b); G_ = (P - Y) * cw / n; W -= lr * (F.T @ G_ + l2 * W); b -= lr * G_.sum(0)
    return W, b


def fit_oracle(l2):
    """round 1's head: the Tiny Oracle's features only. Returns a linear map over [x (1024) | n-grams (B)] with zero n-gram weights."""
    def fit(A, y):
        W, b = train(A[:, :1024], y, l2=l2); return np.vstack([W, np.zeros((A.shape[1] - 1024, W.shape[1]))]), b
    return fit


def fit_comb(l2, alpha, k=64):
    """round 2: the Tiny Oracle's features (top-k principal directions, standardized) + hashed character n-grams, one multinomial head;
    folded back into one linear map over [x (1024) | n-grams (B)] so the page needs only w·[x, n] + b"""
    def fit(A, y):
        X, N = A[:, :1024], A[:, 1024:]; mu0 = X.mean(0); _, _, Vt = np.linalg.svd(X - mu0, full_matrices=False); V = Vt[:k].T
        Z = (X - mu0) @ V; mu, sd = Z.mean(0), Z.std(0) + 1e-6; W1, b1 = train_raw(np.hstack([(Z - mu) / (sd * 8), N * alpha]), y, l2)
        Wz = W1[:k] / (sd[:, None] * 8); Wx = V @ Wz; bx = b1 - (mu0 @ V) @ Wz - (mu / (sd * 8)) @ W1[:k]
        return np.vstack([Wx, W1[k:] * alpha]), bx
    return fit


def oof_probs(fit, A, y, folds=5, seed=0):
    rng = np.random.RandomState(seed); idx = rng.permutation(len(y)); P = np.zeros((len(y), len(CLASSES)))
    for f in range(folds):
        te = idx[f::folds]; tr = np.setdiff1d(idx, te); W, b = fit(A[tr], y[tr]); P[te] = predict(W, b, A[te])
    return P


def strict_thr(P, y, eps=0.01):
    """per step: just above the highest out-of-fold score any other text got for that step (zero false advances on the folds, no cap below 1)"""
    return {c: float(min(0.9999, (P[y != ci, ci].max() if (y != ci).any() else 0) + eps)) for ci, c in enumerate(CLASSES[:4])}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--probe", nargs="*"); ap.add_argument("--fresh", action="store_true", help="re-extract every text")
    a = ap.parse_args()
    if a.probe:
        G = json.load(open(OUT)); r = extract(a.probe)
        for e in r:
            x = np.concatenate([np.array(e["x"]), ngrams(e["t"])]); out = []
            for st in CLASSES[:4]:
                m = G["models"][G["step"][st]]; p = predict(np.array(m["w"]).T, np.array(m["b"]), x[None])[0]; ci = CLASSES.index(st)
                out.append(f"{st} {p[ci]:.2f}{'✓' if p.argmax() == ci and p[ci] >= G['thr'][st] else ''}")
            print(f"{e['t']!r}: v4 head → {e['option']} {e['p']:.2f} | gate per step → " + ", ".join(out))
        return
    rows1 = labeled(DATA); seen = {t for t, _ in rows1}
    rows2 = [(t, c) for t, c in labeled(DATA2) if t not in seen]; rows2 = list({t: (t, c) for t, c in rows2}.values())
    byT = features([t for t, _ in rows1 + rows2], reuse=not a.fresh)
    AX = lambda rows: np.array([np.concatenate([np.array(byT[t]["x"], dtype=np.float64), ngrams(t)]) for t, _ in rows])
    A1, A2 = AX(rows1), AX(rows2); y1 = np.array([CLASSES.index(c) for _, c in rows1]); y2 = np.array([CLASSES.index(c) for _, c in rows2])
    tr1, te1 = split(y1); tr2, te2 = split(y2, seed=25)
    Atr = np.vstack([A1[tr1], A2[tr2]]); ytr = np.concatenate([y1[tr1], y2[tr2]]); Ate = np.vstack([A1[te1], A2[te2]]); yte = np.concatenate([y1[te1], y2[te2]])
    tte = [rows1[i][0] for i in te1] + [rows2[i][0] for i in te2]
    print(f"  data: round 1 {len(rows1)}, round 2 {len(rows2)} new; train {len(ytr)}, held out {len(yte)} (round 1's held-out {len(te1)} split kept)")
    # candidates, chosen on the training split only (out-of-fold, strict zero false advances): one oracle-only head, one combined head
    cands = {f"oracle l2={l2}": fit_oracle(l2) for l2 in (1e-3, 1e-2, 1e-1, 1.0)}
    cands.update({f"comb a={al} l2={l2}": fit_comb(l2, al) for al in (2.0, 3.0, 5.0) for l2 in (3e-4, 1e-3, 3e-3)})
    cv = {}
    for name, fit in cands.items():
        P = oof_probs(fit, Atr, ytr); t = strict_thr(P, ytr); m = metrics(P, ytr, t); cv[name] = (t, m)
        print(f"  {name:22s} out-of-fold recall " + ", ".join(f"{c} {m[c]['tp']}/{m[c]['n_pos']}" for c in CLASSES[:4]))
    rec = lambda n, c: cv[n][1][c]["tp"]
    best_or = max((n for n in cv if n.startswith("oracle")), key=lambda n: (sum(rec(n, c) for c in CLASSES[:4]), n))
    best_cb = max((n for n in cv if n.startswith("comb")), key=lambda n: (sum(rec(n, c) for c in CLASSES[:4]), n))
    step = {c: (best_cb if rec(best_cb, c) >= rec(best_or, c) else best_or) for c in CLASSES[:4]}
    thr = {c: cv[step[c]][0][c] for c in CLASSES[:4]}
    print(f"  chosen: oracle head {best_or}, combined head {best_cb}; per step {step}")
    # held-out: each step with its head, trained on the training split
    fitted = {n: cands[n](Atr, ytr) for n in set(step.values())}
    after = {}
    for ci, c in enumerate(CLASSES[:4]):
        W, b = fitted[step[c]]; P = predict(W, b, Ate); adv = (P[:, ci] >= thr[c]) & (P.argmax(1) == ci)
        tp = int((adv & (yte == ci)).sum()); fp = int((adv & (yte != ci)).sum()); pos = int((yte == ci).sum())
        after[c] = {"precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / pos, 3), "tp": tp, "fp": fp, "n_pos": pos, "head": step[c]}
        for i in np.where(adv & (yte != ci))[0]: print(f"  held-out FALSE ADVANCE ({c}): {tte[i]!r}")
        for i in np.where(~adv & (yte == ci))[0]: print(f"  held-out missed ({c}): {tte[i]!r} → {CLASSES[int(P[i].argmax())]} {P[i].max():.3f}")
    # before: round 1's method (oracle features, its looser thresholds capped at .99) trained on the same split, for a like-for-like line
    bestb = None
    for l2 in (1e-3, 1e-2, 1e-1, 1.0, 3.0):
        P = oof_probs(fit_oracle(l2), Atr, ytr); t = {c: float(min(0.99, max(0.5, P[ytr != ci, ci].max() + 0.02))) for ci, c in enumerate(CLASSES[:4])}
        s_ = sum(metrics(P, ytr, t)[c]["recall"] for c in CLASSES[:4])
        if bestb is None or s_ > bestb[0]: bestb = (s_, l2, t)
    Wb, bb = fit_oracle(bestb[1])(Atr, ytr); before = metrics(predict(Wb, bb, Ate), yte, bestb[2])
    print("\n  held-out per step (same texts): before = round 1's method, after = round 2")
    for c in CLASSES[:4]:
        b_, a_ = before[c], after[c]
        print(f"   {c:<10} before {b_['tp']}/{b_['n_pos']} recall {b_['recall']}, false advances {b_['fp']}  →  after {a_['tp']}/{a_['n_pos']} recall {a_['recall']}, false advances {a_['fp']}  ({a_['head']})")
    # the shipped heads: all data, the cross-validated thresholds
    Aall = np.vstack([A1, A2]); yall = np.concatenate([y1, y2]); models = {}
    for n in set(step.values()):
        W, b = cands[n](Aall, yall); key = "oracle" if n.startswith("oracle") else "comb"
        d = 1024 if key == "oracle" else W.shape[0]
        models[key] = {"w": W[:d].T.round(5).tolist(), "b": b.round(5).tolist(), "d": d, "ngrams": key == "comb", "name": n}
    stepkey = {c: ("oracle" if step[c].startswith("oracle") else "comb") for c in CLASSES[:4]}
    held = {"per_step": after, "before_round1_method": before, "n_train": int(len(ytr)), "n_heldout": int(len(yte)), "n_round2": len(rows2)}
    json.dump({"version": 2, "classes": CLASSES, "d": 1024, "ngram": {"B": NG_B, "ns": list(NG_NS)}, "models": models, "step": stepkey, "thr": thr,
               "heldout": held, "note": "tools/genesis_gate.py round 2 (11-04): per step, the Tiny Oracle's features alone (oracle) or with hashed character n-grams (comb); a step advances when its head's top class is the step and its probability is at least thr"}, open(OUT, "w"))
    print(json.dumps({"thr": thr, "step": stepkey}, indent=1), "\n  wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
