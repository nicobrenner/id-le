"""Instruction model v3 for the Tiny Operator (2026-11-01): the v2 creature options plus world-level options that map onto the Operator's tools
(idle-ai.js): weather <kind>, spawn <kind>, rave_on, rave_off, disaster <kind>, rename <creature> <new name>, evolve [<creature>], look.
Same machinery as v2 (arena_instructions.py): logistic-regression option head on the Tiny Oracle's (ct2) hidden states of the user turn,
B/I/O span taggers per token for the argument, plus a second tagger for the target creature (rename, evolve). Training = agent-written
paraphrases x inserted words and names; held-out = phrasings written separately, never in training. No regex anywhere at inference:
the game maps an extracted span onto its closed lists (weather kinds, jobs, disasters) by lookup, which is object resolution, not intent.
IRC keeps using v2 (creatures only); v3 is only the Operator's.
  cd ~/Documents/Projects/jeffy/experiments/scratch_classifier && python3 <id-le>/arena_instructions_v3.py --idle <id-le>"""
import argparse, json, os, random, sys, time, numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, classification_report

ap = argparse.ArgumentParser(); ap.add_argument("--ckpt", default="checkpoints/best_lm_oracle_v2_grown_ct2.pt"); ap.add_argument("--idle", required=True)
a = ap.parse_args()
sys.path.insert(0, os.getcwd())
from world import _hidden_tokens, turn_feats, _span_labels
from train_lm import CustomTokenizerWrapper

V2 = {"json": json}   # the v2 training and held-out sets, read from arena_instructions.py (one source of truth for the creature options)
src = open(os.path.join(a.idle, "arena_instructions.py")).read()
exec(src[src.index("OPTIONS = "):src.index("def expand")], V2)
VOCAB = [w for w in json.load(open(os.path.join(a.idle, "demo/assoc_v1.json")))["words"] if len(w) >= 3 and w.isalpha()]
WORDS = V2["WORDS"]
NAMES = ["Crawly", "Pixa", "Plotkin", "Tallix", "Lintel", "Snibbly", "Crumble", "Mondo", "Vectotkinda", "Tangentile", "Sinda", "Exponiaphe", "Hoarumbeler", "Scuttel", "Bibbet", "Quorra", "Nimsy", "Doodlax"]
NAMES_HO = ["Zorbin", "Mappo", "Lutelle", "Fenwick", "Trivia", "Gorsh"]          # held-out creature names
NEWN = ["Biscuit", "Pebble", "Captain", "Noodle", "Ziggy", "Marble", "Sprocket", "Waffle", "Tofu", "Comet", "Pickle", "Juniper", "Moxie", "Rusty"]
NEWN_HO = ["Gizmo", "Clementine", "Bramble", "Oz", "Tinsel"]
WEATHER = ["rain", "storm", "fog", "wind", "clear", "static", "hum", "drizzle", "thunder", "mist", "breeze", "sunshine"]
WEATHER_HO = ["thunderstorm", "rain", "fog", "windy", "sunny", "static"]
JOBS = ["counter", "mathematician", "designer", "debugger", "namer", "sorter", "crawler", "tokenizer", "blursort", "crawly"]
JOBS_HO = ["mathematician", "designer", "debugger", "counter", "namer"]
DIS = ["volcano", "tornado", "quake", "earthquake"]

NEW_TRAIN = {
 "weather": ["could it {w}", "make the sky {w}", "i'd love some {w}", "change it to {w}", "go {w}", "{w} weather please", "make the weather {w}", "set {w}", "let's have {w} weather", "switch the sky to {w}", "{w}, now", "please make it {w} for a while", "make it {w}", "{w} please", "change the weather to {w}", "let it {w}", "i want {w}", "set the weather to {w}", "give us some {w}", "bring the {w}", "can we have {w}", "switch to {w}", "{w} now", "turn on the {w}", "make some {w} happen", "start the {w}", "weather: {w}", "time for {w}", "summon {w}", "a bit of {w} would be nice", "cover the world in {w}", "let there be {w}"],
 "spawn": ["put a {w} here", "a new {w} please", "add another {w}", "we could use a {w}", "spawn one {w}", "can i have a {w}", "add a {w} to the world", "make one more {w}", "add a {w}", "spawn a {w}", "release a {w}", "we need a {w}", "make a new {w}", "bring in a {w}", "i want another {w}", "create a {w}", "one more {w} please", "summon a {w}", "hatch a {w}", "can you add a {w}", "new {w}", "give the world a {w}", "let a {w} in", "drop a {w} in here", "hire a {w}", "get us a {w}"],
 "rave_on": ["start the music and dance", "dancing time", "get everyone dancing", "party now", "begin the rave", "can we have a rave", "put on some dance music", "make it a party", "turn on rave mode", "rave mode on", "let the party begin", "start the rave", "rave time", "party!", "turn the music up and let them dance", "let's dance", "throw a party", "rave on", "start a party", "make them dance", "dance party", "drop the beat", "everybody dance", "let's rave", "music on, dance", "time to party", "get the dance going"],
 "rave_off": ["turn off the music", "the party is over", "stop the party now", "rave mode off", "end the music", "everyone stop dancing", "cut the music", "finish the rave", "please stop the rave", "no more rave", "switch the rave off", "stop the rave", "party's over", "turn the rave off", "stop the music", "no more dancing", "end the party", "rave off", "enough dancing", "kill the music", "stop dancing", "quiet down, party over", "shut the party down", "that's enough rave", "end the rave"],
 "disaster": ["make the ground {w}", "i want to see a {w}", "time for a {w}", "go on, {w}", "let a {w} loose", "a {w} would be fun", "do a {w}", "throw a {w} at the world", "bring on the {w}", "start a {w}", "make a {w}", "unleash a {w}", "trigger a {w}", "let's have a {w}", "summon a {w}", "{w}!", "cause a {w}", "send a {w}", "release a {w} on them", "bring a {w}", "i want a {w}", "hit them with a {w}", "a {w} please"],
 "rename": ["rename {t} to {n}", "call {t} {n}", "{t} should be called {n}", "change {t}'s name to {n}", "let's name {t} {n}", "{t} is now {n}", "give {t} the name {n}", "from now on {t} is {n}", "name {t} {n}", "i want to call {t} {n}", "{t} -> {n}", "rename {t} as {n}"],
 "evolve": ["evolve", "evolve the world", "mutate everything", "evolve {t}", "mutate {t}", "make {t} evolve", "let {t} mutate", "change {t}'s body", "evolve it all", "time to evolve", "give {t} a new shape", "shake up the world", "let the world evolve", "mutate the world", "evolve {t} a lot"],
 "look": ["what's going on here", "how are things", "describe it for me", "what is everyone doing", "any news", "fill me in", "give me an overview", "what's the state of the world", "how's everybody", "anything happening", "catch me up", "update me", "show me what's going on", "what's going on", "look around", "describe the world", "what do you see", "how is everyone", "give me a summary", "what's happening here", "status", "report", "who's here", "how's the world doing", "tell me about the world", "what's the situation", "look", "survey the place", "what's new"],
}
NONE_EXTRA = ["what are you doing", "i'm hungry", "this is cool", "where am i", "nice weather we're having", "the music is too loud", "i miss my dog", "how old are you", "you're tiny", "good night", "i like the colors", "what's your purpose", "blah", "testing", "hello?", "i love the rain", "storms scare me", "do you like music", "dancing is fun", "volcanoes are cool", "my name is nico", "what a nice name", "i'm evolving as a person", "the weather is nice today", "i went to a party last night", "who named you", "tornadoes are scary", "i don't want to dance", "nice music", "are you a mathematician", "counting is boring", "i wish it would snow", "is it foggy where you are", "names are hard", "i feel like changing", "what do you think about earthquakes", "parties are loud", "i'm looking at you", "can you see me", "good morning", "thanks", "you're funny", "ok", "hmm", "that was weird"]
NEW_HELDOUT = [
 ("weather", "could you make it {w} for a while"), ("weather", "i'd like some {w}"), ("weather", "let's switch the weather to {w}"), ("weather", "{w}, go"), ("weather", "please set {w}"), ("weather", "change it to {w}"),
 ("spawn", "please add one {w}"), ("spawn", "can we get a new {w}"), ("spawn", "i'd like another {w}"), ("spawn", "put a {w} in the world"), ("spawn", "spawn me a {w}"), ("spawn", "a new {w} would help"),
 ("rave_on", "start dancing everyone"), ("rave_on", "party time!"), ("rave_on", "let's get this party started"), ("rave_on", "music and dancing please"), ("rave_on", "rave!"), ("rave_on", "turn it into a rave"),
 ("rave_off", "ok stop the party"), ("rave_off", "music off please"), ("rave_off", "the rave is over"), ("rave_off", "no more party"), ("rave_off", "end the dancing"), ("rave_off", "turn off the rave now"),
 ("disaster", "make a {w} happen"), ("disaster", "let's see a {w}"), ("disaster", "drop a {w} on them"), ("disaster", "a {w} now"), ("disaster", "go {w}"), ("disaster", "set off a {w}"),
 ("rename", "rename {t} into {n}"), ("rename", "{t}'s new name is {n}"), ("rename", "please call {t} {n} from now on"), ("rename", "change the name of {t} to {n}"), ("rename", "let's call {t} {n}"), ("rename", "{t} will be {n}"),
 ("evolve", "evolve {t} please"), ("evolve", "make the world evolve"), ("evolve", "mutate {t} a little"), ("evolve", "let everything mutate"), ("evolve", "give {t} a different body"), ("evolve", "evolution time"),
 ("look", "what's happening"), ("look", "tell me how things are"), ("look", "describe what you see"), ("look", "how are the creatures"), ("look", "summary please"), ("look", "what's up in here"),
 ("none", "i like storms"), ("none", "music makes me happy"), ("none", "i'm tired of parties"), ("none", "names are funny"), ("none", "is it windy there"), ("none", "you look nice today"),
]
ARGS = {"weather": (WEATHER, WEATHER_HO), "spawn": (JOBS, JOBS_HO), "disaster": (DIS, DIS)}

def fill(opt, t, rng, held):
    rows = []
    args = ARGS.get(opt); names, newn = (NAMES_HO, NEWN_HO) if held else (NAMES, NEWN)
    reps = 1 if held else 4
    for _ in range(reps):
        w = rng.choice(args[1] if held else args[0]) if args else None
        tn, nn = rng.choice(names), rng.choice(newn)
        text = t.format(w=w or "", t=tn, n=nn).strip()
        arg = w if "{w}" in t else (nn if "{n}" in t else None); tgt = tn if "{t}" in t else None
        rows.append({"text": text, "option": opt, "arg": arg, "tgt": tgt})
        if "{" not in t: break
    return rows

rng = random.Random(0)
def v2_rows(items, rng, per):
    out = []
    for opt, t in items:
        if "{w}" in t:
            for w in rng.sample(WORDS, min(per // 2, len(WORDS))) + rng.sample(VOCAB, per - per // 2): out.append({"text": t.format(w=w), "option": opt, "arg": w, "tgt": None})
        else: out.append({"text": t, "option": opt, "arg": None, "tgt": None})
    return out
tr = v2_rows([(o, t) for o, ts in V2["TRAIN"].items() for t in ts], rng, 8)
CREATURE = [o for o in V2["OPTIONS"] if o != "none"]
def merge(rows): return [dict(r, option="creature" if r["option"] in CREATURE else r["option"]) for r in rows]
tr = merge(tr)
for o, ts in NEW_TRAIN.items():
    for t in ts: tr += fill(o, t, rng, False)
tr += [{"text": t, "option": "none", "arg": None, "tgt": None} for t in NONE_EXTRA]
# augmentation: every training row also appears wrapped in common openers/closers (spoken-style variety the paraphrases lack)
PRE = ["hey tiny, ", "ok ", "please ", "could you ", "can you ", "tiny, ", "hmm, ", "oh and ", "now ", "so ", "yo ", "um "]
POST = [" please", " now", " for me", "!", " ok?", " thanks", " right now", " a bit", " if you can", " :)", "", " pls"]
aug_rng = random.Random(7); AUG = int(os.environ.get("AUG", "2")); extra = []
for r in tr:
    for _ in range(AUG):
        t = (aug_rng.choice(PRE) if aug_rng.random() < 0.7 else "") + r["text"] + (aug_rng.choice(POST) if aug_rng.random() < 0.7 else "")
        extra.append(dict(r, text=t.strip()))
tr += extra
te_v2 = v2_rows(V2["HELDOUT"], random.Random(1), 1)
te_new = []; rng2 = random.Random(2)
for o, t in NEW_HELDOUT: te_new += fill(o, t, rng2, True)
te_v2_orig = te_v2; te_v2 = merge(te_v2); te = te_v2 + te_new
print(f"train {len(tr)} rows · held-out {len(te_v2)} v2 + {len(te_new)} new", flush=True)

t0 = time.time()
from atl_probe import load
tok = CustomTokenizerWrapper("tokenizer_chat_v2.json"); m, _ = load(a.ckpt); m.eval()
def feats(rows):
    hs = _hidden_tokens(m, tok, [r["text"] for r in rows]); X = np.stack([turn_feats(H) for _, H in hs]); Xa, ya, yt = [], [], []
    for r, (ids, H) in zip(rows, hs):
        n = len(ids); la = _span_labels(tok, r["text"], r["arg"]) if r["arg"] else [0] * n; lt = _span_labels(tok, r["text"], r["tgt"]) if r["tgt"] else [0] * n
        la = (la + [0] * n)[:n]; lt = (lt + [0] * n)[:n]; Xa.append(H.numpy()); ya.append(np.array(la)); yt.append(np.array(lt))
    return X, np.array([r["option"] for r in rows]), Xa, ya, yt, hs
X, y, Xa, ya, yt, _ = feats(tr); X2, y2, Xa2, ya2, yt2, hs2 = feats(te)
print(f"features in {time.time() - t0:.0f}s", flush=True)
from sklearn.model_selection import cross_val_score
CW = os.environ.get("CW", "balanced") or None; CW = None if CW == "none" else CW
cvs = {C: cross_val_score(LogisticRegression(max_iter=6000, C=C, class_weight=CW), X, y, cv=5).mean() for C in (0.1, 0.3, 1.0, 3.0)}
bestC = max(cvs, key=cvs.get); print("C by 5-fold CV on training rows:", {k: round(v, 3) for k, v in cvs.items()}, "->", bestC)
clf = LogisticRegression(max_iter=6000, C=bestC, class_weight=CW).fit(X, y); p = clf.predict(X2)
P = clf.predict_proba(X2)
span = LogisticRegression(max_iter=6000, C=0.5, class_weight="balanced").fit(np.vstack(Xa), np.concatenate(ya))
tspan = LogisticRegression(max_iter=6000, C=0.5, class_weight="balanced").fit(np.vstack(Xa), np.concatenate(yt))

def extract(model, ids, H):
    tags = model.predict(H.numpy()); keep = [i for i, t in enumerate(tags) if t > 0]
    return tok.decode(ids[keep[0]:keep[-1] + 1]).strip() if keep else None
v2n = len(te_v2)
acc_v2 = accuracy_score(y2[:v2n], p[:v2n]); acc_new = accuracy_score(y2[v2n:], p[v2n:])
print(f"\noption head, held-out: all {accuracy_score(y2, p):.3f} · v2 creature set {acc_v2:.3f} (v2 rows: creature vs none) · new set {acc_new:.3f}")
print(classification_report(y2, p, zero_division=0))
per = {}
for o in sorted(set(y2)):
    idx = [i for i in range(len(y2)) if y2[i] == o]; per[o] = round(float(np.mean([p[i] == o for i in idx])), 3)
SYN = {"rain": "bitrain", "drizzle": "bitrain", "thunder": "storm", "thunderstorm": "storm", "mist": "fog", "foggy": "fog", "windy": "wind", "breeze": "wind", "sunshine": "clear", "sunny": "clear", "sun": "clear",
       "mathematician": "math", "debugger": "debug", "tokenizer": "tok", "earthquake": "quake"}
KINDS = {"bitrain", "storm", "fog", "wind", "clear", "static", "hum", "math", "debug", "tok", "counter", "designer", "namer", "sorter", "crawler", "blursort", "crawly", "volcano", "tornado", "quake"}
def resolve(span):
    for t in (span or "").lower().replace(",", " ").split():
        t = t.strip(".!?'\""); k = SYN.get(t, t)
        if k in KINDS: return k
    return None
ok_r = n_r = 0
ok_a = n_a = ok_t = n_t = 0; samples = []
for i, (r, (ids, H)) in enumerate(zip(te, hs2)):
    if r["arg"] and i >= v2n: n_a += 1; g = extract(span, ids, H); ok_a += (g or "").lower() == r["arg"].lower()
    if r["arg"] and r["option"] in ("weather", "spawn", "disaster"): n_r += 1; ok_r += resolve(extract(span, ids, H)) == resolve(r["arg"])
    if r["tgt"]: n_t += 1; g = extract(tspan, ids, H); ok_t += (g or "") == r["tgt"]
    if i >= v2n and len(samples) < 12: samples.append(f"  {r['text']!r} -> {p[i]} (p {P[i].max():.2f}) arg {extract(span, ids, H)!r} target {extract(tspan, ids, H)!r}")
print(f"argument span (new options), held-out: {ok_a}/{n_a} exact · resolved to the right kind (weather/spawn/disaster): {ok_r}/{n_r} · target creature: {ok_t}/{n_t} exact")
print("\n".join(samples))
# the routing the Operator uses: a world option only when v3 is sure (p >= tau); anything else goes to the untouched v2 creature heads
v2j = json.load(open(os.path.join(a.idle, "demo/arena_instr_v2.json"))); W2 = np.array(v2j["w"]); B2 = np.array(v2j["b"])
p_v2 = [v2j["options"][int(np.argmax(W2 @ x + B2))] for x in X2[:v2n]]
gold_v2 = [r["option"] for r in te_v2_orig]
WORLD = {"weather", "spawn", "rave_on", "rave_off", "disaster", "rename", "evolve", "look"}
route = {}
print("missed new rows:", [(te[i]["text"], te[i]["option"], p[i], round(float(P[i].max()), 2)) for i in range(v2n, len(te)) if p[i] != te[i]["option"]])
# the policy idle-ai.js applies: look acts at p >= 0.5 (it changes nothing); world-changing options need p >= 0.65; weather/spawn/disaster
# also need the argument span to resolve to a real kind; rename needs a new-name span (its target creature is grounded against the
# world's own names in the game, object resolution)
TH = {"look": 0.5}
def acts(i):
    o = p[i]
    if o not in WORLD or P[i].max() < TH.get(o, float(os.environ.get("B", "0.65"))): return None
    if o in ("weather", "spawn", "disaster") and not resolve(extract(span, *hs2[i])): return None
    if o == "rename" and not extract(span, *hs2[i]): return None
    return o
pol_hij = [(te[i]["text"], acts(i)) for i in range(v2n) if acts(i)]
pol_rec = {o: [0, 0] for o in WORLD}
for i in range(v2n, len(te)):
    g = te[i]["option"]
    if g in WORLD: pol_rec[g][1] += 1; pol_rec[g][0] += acts(i) == g
pol_none = [(te[i]["text"], acts(i)) for i in range(v2n, len(te)) if te[i]["option"] == "none" and acts(i)]
pol_cre = sum(1 for i in range(v2n) if not acts(i) and p_v2[i] == gold_v2[i]) / v2n
policy = {"creature_rows_acted_on_as_world": pol_hij, "creature_acc_after_routing": round(pol_cre, 3), "v2_alone": round(float(np.mean([a == b for a, b in zip(p_v2, gold_v2)])), 3),
          "world_per_option": {o: f"{a}/{b}" for o, (a, b) in sorted(pol_rec.items())}, "world_recall": round(sum(a for a, b in pol_rec.values()) / sum(b for a, b in pol_rec.values()), 3), "chitchat_acted_on": pol_none}
print("POLICY", json.dumps(policy))
print("hijacked creature rows at 0.5:", [(te[i]["text"], p[i], round(float(P[i].max()), 2)) for i in range(v2n) if p[i] in WORLD and P[i].max() >= 0.5])
for tau in (0.5, 0.6, 0.7, 0.8):
    hij = sum(1 for i in range(v2n) if p[i] in WORLD and P[i].max() >= tau)
    cre = sum(1 for i in range(v2n) if not (p[i] in WORLD and P[i].max() >= tau) and p_v2[i] == gold_v2[i])
    rec = {o: 0 for o in WORLD}; tot = {o: 0 for o in WORLD}
    for i in range(v2n, len(te)):
        g = te[i]["option"]
        if g in WORLD: tot[g] += 1; rec[g] += (p[i] == g and P[i].max() >= tau)
    fp_none = sum(1 for i in range(v2n, len(te)) if te[i]["option"] == "none" and p[i] in WORLD and P[i].max() >= tau)
    route[tau] = {"creature_rows_hijacked": f"{hij}/{v2n}", "creature_acc_after_routing": round(cre / v2n, 3), "world_recall": round(sum(rec.values()) / sum(tot.values()), 3), "world_per_option": {o: f"{rec[o]}/{tot[o]}" for o in sorted(WORLD)}, "chitchat_acted_on": fp_none}
    print(f"tau {tau}: creature rows hijacked {hij}/{v2n} · creature accuracy after routing {cre / v2n:.3f} (v2 alone {np.mean([a == b for a, b in zip(p_v2, gold_v2)]):.3f}) · world recall {route[tau]['world_recall']} · per option {route[tau]['world_per_option']} · new-set chit-chat acted on {fp_none}")
D = X.shape[1] // 2
out = {"options": list(map(str, clf.classes_)), "w": [[round(float(x), 5) for x in row] for row in clf.coef_], "b": [float(x) for x in clf.intercept_],
       "span_classes": [int(x) for x in span.classes_], "span_w": [[round(float(x), 5) for x in row] for row in span.coef_], "span_b": [float(x) for x in span.intercept_],
       "tspan_classes": [int(x) for x in tspan.classes_], "tspan_w": [[round(float(x), 5) for x in row] for row in tspan.coef_], "tspan_b": [float(x) for x in tspan.intercept_], "d": int(D),
       "heldout": {"option_acc": round(float(accuracy_score(y2, p)), 3), "v2_set_acc": round(float(acc_v2), 3), "new_set_acc": round(float(acc_new), 3), "per_option": per,
                   "arg_exact": f"{ok_a}/{n_a}", "arg_resolved": f"{ok_r}/{n_r}", "C": bestC, "target_exact": f"{ok_t}/{n_t}", "train_rows": len(tr), "heldout_rows": len(te), "routing": route, "policy": policy}}
json.dump(out, open(os.path.join(a.idle, "demo/arena_instr_v3.json"), "w"))
print("saved demo/arena_instr_v3.json", json.dumps(out["heldout"]))
