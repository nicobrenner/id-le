"""Instruction model for the arena creatures (2026-10-28): user chat -> (option, argument). Options shared by the creatures (each creature
ignores the ones it lacks): fetch <word>, bring (to user / to oracle / to the other creature), greet, come, sleep, hide, chop <word>, hand
(give a piece to the other creature), none (chit-chat: the creature does its own thing — Trico rule). Classifier = LogReg on the Oracle's
(ct2) hidden states of the user turn (world._hidden_tokens, same forward pass as the fact extractor); argument = per-token B/I/O span
tagger (same machinery as the fact value tagger). Training = LLM-written (agent) paraphrases x inserted words; held-out = 60 instructions
written separately in different phrasings. No regex anywhere at inference.
  python3 arena_instructions.py --ckpt checkpoints/best_lm_oracle_v2_grown_ct2.pt --out checkpoints/arena_instr_v1.pkl"""
import argparse, json, pickle, random, numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, classification_report
from world import _hidden_tokens, turn_feats, _span_labels
from train_lm import CustomTokenizerWrapper
OPTIONS = ["fetch", "bring", "greet", "come", "sleep", "hide", "chop", "hand", "none"]
# v2 (Nico 2026-10-28: "fetch small" / "fetch kernels" were read as hand / chop): short imperatives added to every option, and argument words
# drawn from a 3,000-word vocabulary (the chat page's association vocab) instead of 20, so the span tagger sees unfamiliar words
VOCAB = [w for w in json.load(open("demo/assoc_v1.json"))["words"] if len(w) >= 3 and w.isalpha()]
WORDS = ["ball", "cat", "coffee", "marathon", "plant", "ghosts", "pizza", "python", "rain", "thesis", "lemon", "guitar", "snow", "cookie", "moon", "river", "camera", "puzzle", "bread", "ticket"]
# training paraphrases (agent-written); {w} = the argument word
TRAIN = {
 "fetch": ["fetch {w}", "get {w}", "grab {w}", "go fetch {w}", "fetch {w} please", "crawly fetch {w}", "id|le, fetch {w}", "{w}, fetch", "take {w}", "collect {w}", "fetch the {w} word", "go get {w}", "bring me the word {w}", "can you fetch {w}", "grab {w} from the floor", "get the {w}", "pick up {w}", "crawly, fetch {w}", "i want the {w} word", "go and take {w}", "find {w} and bring it", "retrieve the word {w}", "{w}, go get it", "take the word {w} for me"],
 "bring": ["bring it to me", "give it to the oracle", "take it to the tokenizer", "bring that over here", "hand it to the oracle", "bring it back to me", "carry it to crawly", "give what you have to the oracle", "bring it here", "drop it next to me", "deliver it to the oracle", "bring your word to the tokenizer"],
 "greet": ["say hi", "wave", "greet me", "hello crawly", "shake hands", "hand", "give me a high five", "say hello to the tokenizer", "wave at me", "hi there, greet", "come say hi", "bow"],
 "come": ["come", "here", "crawly, here", "come here", "come to me", "over here", "come closer", "walk over", "get over here", "come on, this way", "come to the middle", "crawly come", "approach", "step closer", "come over to this side"],
 "sleep": ["nap", "rest", "go to sleep", "take a nap", "rest now", "sleep", "lie down for a bit", "time for a nap", "go rest", "sleep a little", "nap time", "have a rest", "you look tired, sleep", "go to bed"],
 "hide": ["hide", "go hide", "get out of sight", "hide under the box", "disappear for a bit", "go away for now", "hide somewhere", "vanish", "scram", "out of sight please", "go hide from me", "hide now"],
 "chop": ["chop {w}", "cut {w}", "id|le chop {w}", "split {w} please", "chop the word {w}", "cut {w} into pieces", "tokenize {w}", "split {w}", "chop up {w}", "cut the word {w}", "slice {w}", "break {w} into tokens", "tokenizer, chop {w}", "how does {w} split", "cut {w} up", "pieces of {w} please"],
 "hand": ["hand a piece to crawly", "give crawly a piece", "pass it to the crawler", "hand it over to crawly", "share a piece with crawly", "give one piece to the strider", "pass a token to crawly", "hand the piece over", "give the crawler one", "share with crawly", "hand one to the legs", "let crawly have a piece"],
 "none": ["how are you today", "what's the weather like", "i had a long day", "my cat is annoying", "tell me something", "what are you", "i'm bored", "do you like it here", "that's funny", "lol ok", "what do you think about coffee", "i can't sleep", "are you a spider", "who made you", "this is weird", "nice room"],
}
HELDOUT = [("fetch", "could you go and grab the {w} word for me"), ("fetch", "{w}. that one. fetch it"), ("fetch", "please retrieve {w}"), ("fetch", "i'd love the word {w}"), ("fetch", "run and get {w}"), ("fetch", "the {w} word, go"), ("fetch", "collect {w} from the floor"), ("fetch", "fetch me {w} please"),
 ("bring", "ok now give it to me"), ("bring", "take that to the oracle please"), ("bring", "carry it over to the tokenizer"), ("bring", "pass it here"), ("bring", "bring what you found to me"), ("bring", "deliver that to crawly"),
 ("greet", "say hello"), ("greet", "wave hello"), ("greet", "can i get a hi"), ("greet", "give me a wave"), ("greet", "greet the tokenizer"), ("greet", "high five"),
 ("come", "come over here"), ("come", "this way, come"), ("come", "walk to me"), ("come", "closer please"), ("come", "come to the center"), ("come", "get closer"),
 ("sleep", "have a nap"), ("sleep", "go and rest"), ("sleep", "sleep now please"), ("sleep", "you need a rest, go to bed"), ("sleep", "nap"), ("sleep", "lie down"),
 ("hide", "go out of sight"), ("hide", "hide yourself"), ("hide", "disappear"), ("hide", "go away for a while"), ("hide", "hide behind the box"), ("hide", "get lost for a minute"),
 ("chop", "cut up the word {w}"), ("chop", "tokenize the word {w}"), ("chop", "slice {w} into tokens"), ("chop", "split up {w}"), ("chop", "chop {w} please"), ("chop", "how many pieces is {w}"),
 ("hand", "give a piece to the crawler"), ("hand", "share one with crawly"), ("hand", "pass crawly a token"), ("hand", "hand a token over to the legs"), ("hand", "give crawly one of those"), ("hand", "let the strider have one"),
 ("none", "what a day"), ("none", "do you dream"), ("none", "it's raining outside"), ("none", "i like your room"), ("none", "are you two friends"), ("none", "what's your favourite word"), ("none", "haha"), ("none", "my thesis is killing me"), ("none", "tell me a joke"), ("none", "where do you live")]
def expand(items, rng, per=1):
    rows = []
    for opt, t in items:
        if "{w}" in t:
            for w in rng.sample(WORDS, min(per // 2, len(WORDS))) + rng.sample(VOCAB, per - per // 2): rows.append({"text": t.format(w=w), "option": opt, "arg": w})
        else: rows.append({"text": t, "option": opt, "arg": None})
    return rows
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--ckpt", default="checkpoints/best_lm_oracle_v2_grown_ct2.pt"); ap.add_argument("--out", default="checkpoints/arena_instr_v2.pkl"); ap.add_argument("--json", default="demo/arena_instr_v2.json"); a = ap.parse_args()
    from atl_probe import load
    rng = random.Random(0); tok = CustomTokenizerWrapper("tokenizer_chat_v2.json"); m, _ = load(a.ckpt); m.eval()
    tr = expand([(o, t) for o, ts in TRAIN.items() for t in ts], rng, per=8); te = expand(HELDOUT, random.Random(1), per=1)
    SHORT = ["small", "kernels", "troy", "sacred", "muse", "wandered", "harbour", "ithaca", "glimmer", "orchard"]   # held-out: words in neither vocabulary
    te += [{"text": t.format(w=w), "option": o, "arg": w} for w in SHORT for o, t in [("fetch", "fetch {w}"), ("fetch", "get {w}"), ("chop", "chop {w}")]]
    te_words = {r["arg"] for r in te if r["arg"]}; print(f"train {len(tr)} rows, held-out {len(te)} (60 phrasings not in training; argument words {sorted(te_words)[:5]}…)")
    def feats(rows):
        hs = _hidden_tokens(m, tok, [r["text"] for r in rows]); X = np.stack([turn_feats(H) for _, H in hs]); Xt, yt = [], []
        for r, (ids, H) in zip(rows, hs):
            lab = _span_labels(tok, r["text"], r["arg"]) if r["arg"] else [0] * len(ids); lab = lab[: len(ids)] + [0] * (len(ids) - len(lab)); Xt.append(H.numpy()); yt.append(np.array(lab))
        return X, np.array([r["option"] for r in rows]), Xt, yt
    X, y, Xt, yt = feats(tr); X2, y2, Xt2, yt2 = feats(te)
    clf = LogisticRegression(max_iter=4000, C=0.5, class_weight="balanced").fit(X, y); p = clf.predict(X2)
    print(f"option classifier, held-out: accuracy {accuracy_score(y2, p):.2f}  macro-F1 {f1_score(y2, p, average='macro'):.2f}"); print(classification_report(y2, p, zero_division=0))
    span = LogisticRegression(max_iter=4000, C=0.5, class_weight="balanced").fit(np.vstack(Xt), np.concatenate(yt))
    # argument accuracy on held-out rows that have one
    ok = n = 0; shown = []
    for r, (ids, H), po in zip(te, _hidden_tokens(m, tok, [r["text"] for r in te]), p):
        if not r["arg"]: continue
        n += 1; tags = span.predict(H.numpy()); keep = [i for i, t in enumerate(tags) if t > 0]; got = tok.decode(ids[keep[0]:keep[-1] + 1]).strip() if keep else None
        hit = got == r["arg"]; ok += hit
        if len(shown) < 4: shown.append(f"   {r['text']!r} -> ({po}, {got!r}) gold ({r['option']}, {r['arg']!r})")
    print(f"argument span, held-out rows with an argument: {ok}/{n} exact"); print("\n".join(shown))
    pickle.dump({"clf": clf, "span": span, "options": OPTIONS, "ckpt": a.ckpt}, open(a.out, "wb"))
    json.dump({"options": list(map(str, clf.classes_)), "w": [[round(float(x), 5) for x in row] for row in clf.coef_], "b": [float(x) for x in clf.intercept_],
               "span_classes": [int(x) for x in span.classes_], "span_w": [[round(float(x), 5) for x in row] for row in span.coef_], "span_b": [float(x) for x in span.intercept_], "d": 512,
               "heldout": {"option_acc": round(float(accuracy_score(y2, p)), 3), "arg_exact": f"{ok}/{n}"}}, open(a.json, "w"))
    print("saved", a.out, "and demo/arena_instr_v1.json")
