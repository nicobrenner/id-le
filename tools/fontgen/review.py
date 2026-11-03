#!/usr/bin/env python3
"""Build a round of candidate fonts and a review page to score them.

    python3 tools/fontgen/review.py tools/fontgen/rounds/round1.json ~/Desktop/idle-trailers/fonts round1

writes <out>/<round>/<name>.woff2|.ttf|.json for each candidate and <out>/<round>.html with the fonts embedded,
the Operator's real lines at 14/16/20/32 px on the game's dark background, a 0–5 score and notes per candidate.
Scores and notes stay in the page (this browser) and "copy picks" gives a JSON to paste back; breed.py takes it.
"""
import base64, html, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fontgen

LINES = ["…hey. hey! relax, it only eats worlds",
         "Oh wow, looks like you took quite the tumble there… are you ok? We have a lot of work to do",
         "Say: lights on"]
ALPHA = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789 .,:;!? ' \" ( ) [ ] / | + = * < > # @ & % $ …"]
ES = "¿Cachai? Ñandú, acción, pingüino. ¡Ya po!"


def build(round_path, out_dir, round_name):
    cands = json.load(open(round_path))
    fdir = os.path.join(out_dir, round_name)
    faces, cards = [], []
    for name, g in cands.items():
        label = g.get("label", name)
        genome = {**fontgen.default_genome(), **{k: v for k, v in g.items() if k not in ("label", "parents")}}
        _, w2 = fontgen.build_font(genome, name, fdir)
        b64 = base64.b64encode(open(w2, "rb").read()).decode()
        faces.append(f"@font-face{{font-family:'{name}';src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
        gtxt = " · ".join(f"{k} {v}" for k, v in genome.items())
        sizes = "".join(f"<div class='ln' style='font-size:{px}px'><span class='px'>{px}px</span>{html.escape(LINES[1])}</div>" for px in (14, 16, 20))
        par = f"<div class='par'>parents: {html.escape(', '.join(g['parents']))}</div>" if g.get("parents") else ""
        cards.append(f"""<section class="card" data-name="{name}" style="--f:'{name}'">
<header><b>{name}</b> <span class="lab">{html.escape(label)}</span>{par}</header>
<div class="logo">Id<span class="pipe">|</span>le</div>
<div class="op"><div class="bub">{html.escape(LINES[0])}</div><div class="bub">{html.escape(LINES[1])}</div><div class="bub">{html.escape(LINES[2].split(':')[0])}: <b>lights on</b></div></div>
{sizes}
<div class="ln" style="font-size:32px">{html.escape(LINES[0])}</div>
<div class="alpha">{'<br>'.join(html.escape(a) for a in ALPHA)}</div>
<div class="ln es" style="font-size:20px">{html.escape(ES)}</div>
<details><summary>genome</summary><code>{html.escape(gtxt)}</code></details>
<div class="rate"><label>score <select class="score"><option value="">–</option>{''.join(f'<option>{i}</option>' for i in range(6))}</select></label>
<label class="keep"><input type="checkbox" class="parent"> breed from this</label>
<textarea class="notes" placeholder="notes: what works, what doesn't"></textarea></div>
</section>""")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Id|le fonts · {round_name}</title>
<style>
{''.join(faces)}
:root{{--bg:#15161a;--floor:#1c1e24;--ink:#e8e6e1;--dim:#9a9a9a;--accent:#6ab0ff;--pipe:#ff3d9a;--you:#2b5cff2e}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px system-ui,sans-serif;padding:16px}}
h1{{font-size:20px;margin:0 0 4px}}p.how{{color:var(--dim);margin:0 0 16px;max-width:900px;line-height:1.5}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(560px,100%),1fr));gap:16px}}
.card{{background:var(--floor);border:1px solid #2a2d36;border-radius:12px;padding:14px;font-family:var(--f),monospace;overflow:hidden}}
.card header{{font-family:system-ui;margin-bottom:8px}}.lab{{color:var(--accent)}}.par{{color:var(--dim);font-size:12px}}
.logo{{font-size:64px;line-height:1.1;margin:4px 0 10px}}.pipe{{color:var(--pipe)}}
.op{{background:#0e0f12;border-radius:10px;padding:10px;margin-bottom:10px;font-size:16px}}
.bub{{background:#ffffff10;border-radius:10px;padding:6px 10px;margin:4px 12% 4px 0;line-height:1.35}}
.ln{{margin:6px 0;line-height:1.3;overflow-wrap:anywhere}}.px{{font:11px system-ui;color:var(--dim);margin-right:8px}}
.alpha{{font-size:20px;line-height:1.5;margin:8px 0;overflow-wrap:anywhere}}.es{{color:#ffd54a}}
details{{font:12px system-ui;color:var(--dim);margin:6px 0}}code{{white-space:normal}}
.rate{{font-family:system-ui;display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px}}
.rate textarea{{flex:1 1 100%;min-height:48px;background:#0e0f12;color:var(--ink);border:1px solid #2a2d36;border-radius:8px;padding:6px;font:13px system-ui}}
select{{background:#0e0f12;color:var(--ink);border:1px solid #2a2d36;border-radius:6px}}
.bar{{position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:2;display:flex;gap:10px;align-items:center;font-family:system-ui}}
button{{background:var(--accent);color:#000;border:0;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer}}
#out{{color:var(--dim);font-size:12px}}
@media (prefers-color-scheme: light){{:root:not([data-theme="dark"]){{}}}}
</style></head><body>
<h1>Id|le's own typeface · {round_name}</h1>
<p class="how">Each candidate is grown from a genome (weight, corners, x-height, the | cut through the stems, dots, pixels or strokes…). Score each 0–5, tick "breed from this" on your favourites, add notes, then <b>copy picks</b> and paste it back in the chat. The next round mixes and mutates the favourites' genomes into 8 children.</p>
<div class="bar"><button id="copy">copy picks</button><span id="out"></span></div>
<div class="grid">{''.join(cards)}</div>
<script>
const KEY='idle-fonts-{round_name}';
const load=()=>{{try{{return JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{return {{}}}}}};
const save=s=>{{try{{localStorage.setItem(KEY,JSON.stringify(s))}}catch(e){{}}}};
const st=load();
document.querySelectorAll('.card').forEach(c=>{{const n=c.dataset.name,s=st[n]||{{}};
 const sc=c.querySelector('.score'),pa=c.querySelector('.parent'),no=c.querySelector('.notes');
 if(s.score!=null)sc.value=s.score;pa.checked=!!s.parent;no.value=s.notes||'';
 const up=()=>{{st[n]={{score:sc.value===''?null:+sc.value,parent:pa.checked,notes:no.value}};save(st)}};
 sc.onchange=pa.onchange=up;no.oninput=up;}});
document.getElementById('copy').onclick=async()=>{{const picks={{round:'{round_name}',picks:st}};const t=JSON.stringify(picks);
 try{{await navigator.clipboard.writeText(t);document.getElementById('out').textContent='copied: paste it in the chat'}}catch(e){{document.getElementById('out').textContent=t}}}};
</script></body></html>"""
    page_path = os.path.join(out_dir, f"{round_name}.html")
    open(page_path, "w").write(page)
    return page_path


if __name__ == "__main__":
    print(build(sys.argv[1], os.path.expanduser(sys.argv[2]), sys.argv[3]))
