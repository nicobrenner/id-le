#!/usr/bin/env python3
"""Id|le's type system: every role gets its own generated font (Nico: "what if we only use our own fonts for the whole thing?").

    python3 tools/fontgen/roles.py tools/fontgen/rounds/round1.json ~/Desktop/idle-trailers/fonts/round1 ~/Desktop/idle-trailers/fonts/roles.html

Builds a page with each role mocked in context (Operator, Doc's subtitles, boot, labchat, UI, Gazette and epoch
cards, the Oracle, creature families, the pedia), the proposed font under each and two alternates to swap with a
click, a legibility table at 12/14/16 px computed from the genomes, sizes, and the production notes.
"""
import base64, html, json, os, sys

CAP = 700

# role → (primary, alternate, alternate): chosen by what each genome is good at (see LEGIBILITY below)
ROLES = {
    "operator": ("f3", "f1", "f2"),
    "subtitle": ("f7", "f2", "f3"),
    "terminal": ("f1", "f5", "f8"),
    "ui":       ("f2", "f3", "f1"),
    "display":  ("f4", "f6", "f7"),
    "oracle":   ("f8", "f1", "f5"),
    "pedia":    ("f3", "f2", "sys"),
}
FAMILIES = [("Tok", "f6", "the word-eaters, every creature starts as one", "a vowel!! mine. MINE"),
            ("Crawly", "f5", "crawlers that visit real pages", "went to a page, brought back 3 words and a picture"),
            ("Architect", "f2", "builders of huts and towers", "this wall wants one more brick"),
            ("Debugger", "f1", "they catch the others' mistakes", "found it: off by one, again"),
            ("Mathematician", "f8", "they draw the world's charts", "the curve goes down. I like when it goes down"),
            ("Classifier", "f4", "they sort words into kinds", "food · not food · food? food"),
            ("Designer", "f7", "they evolve new bodies", "what if… more legs")]
ROLE_NAMES = {"operator": "📟 The Operator's voice (chat, 16 px)", "subtitle": "Doc's subtitles (big, centred)",
              "terminal": "Terminal, boot and labchat", "ui": "UI labels and buttons (12–13 px)",
              "display": "Gazette headlines and epoch cards", "oracle": "🔮 The Oracle (bring your own AI)",
              "pedia": "Id|le-pedia body (long reading)"}


def legibility(g):
    rows = []
    for px in (12, 14, 16):
        s = px / 1000
        stroke = g["weight"] * s
        xh = CAP * g["xheight"] * s
        n_counter = max(0, (520 * g["width"] - g["weight"]) * s - stroke)  # white inside an 'n'
        flags = []
        if g["render"] == "pixel" and stroke < 1.5:
            flags.append(f"pixel cell {stroke:.1f}px: the grid smears")
        if stroke < 0.9:
            flags.append(f"stroke {stroke:.2f}px: greys out")
        if xh < 6.0:
            flags.append(f"x-height {xh:.1f}px")
        if n_counter < 2.6:
            flags.append(f"tight counters {n_counter:.1f}px")
        if g["slant"] > 5 and px <= 12:
            flags.append("slanted at 12px")
        rows.append((px, stroke, xh, n_counter, flags))
    return rows


def main(round_path, font_dir, out):
    cands = json.load(open(round_path))
    faces, sizes = [], {}
    for n in cands:
        p = os.path.join(font_dir, f"{n}.woff2")
        data = open(p, "rb").read()
        sizes[n] = len(data)
        faces.append(f"@font-face{{font-family:'{n}';src:url(data:font/woff2;base64,{base64.b64encode(data).decode()}) format('woff2');font-display:swap}}")
    label = {n: g.get("label", n) for n, g in cands.items()}
    label["sys"] = "system font"
    fam = lambda n: "system-ui,sans-serif" if n == "sys" else f"'{n}',system-ui,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"

    # legibility table
    leg_rows, small_bad = [], {}
    for n, g in cands.items():
        L = legibility(g)
        cells = "".join(f"<td>{st:.2f} / {xh:.1f} / {nc:.1f}{'<br><span class=flag>' + '; '.join(fl) + '</span>' if fl else ' ✓'}</td>" for _, st, xh, nc, fl in L)
        if L[0][4]:
            small_bad[n] = L[0][4]
        leg_rows.append(f"<tr><td><b>{n}</b> {html.escape(label[n])}</td><td class=sample style=\"font-family:{fam(n)}\">"
                        f"<span style=font-size:12px>Il1| rn m 0O 8B 5S ¿qué?</span><br><span style=font-size:14px>Il1| rn m 0O 8B 5S</span><br><span style=font-size:16px>Il1| rn m 0O 8B 5S</span></td>{cells}<td>{sizes[n] / 1024:.1f} KB</td></tr>")

    def swapper(role):
        opts = ROLES[role]
        btns = "".join(f"<button data-role='{role}' data-font='{f}' class='{'on' if i == 0 else ''}'>{f} {html.escape(label[f])}</button>" for i, f in enumerate(opts))
        return f"<div class='swap'><span class='cur' id='cur-{role}'>font: {opts[0]} {html.escape(label[opts[0]])}</span>{btns}</div>"

    def block(role, inner):
        return f"<section class='role' style=\"--{role}:{fam(ROLES[role][0])}\"><h2>{ROLE_NAMES[role]}</h2>{inner}{swapper(role)}</section>"

    operator = block("operator", """<div class="opwin"><div class="optop">📟 Operator <span class="x">✕</span></div>
<div class="opstatus">consciousness 24 · epoch 0 · genesis</div>
<div class="opchat" style="font-family:var(--operator)"><div class="b">…hey. hey! relax, it only eats worlds</div>
<div class="b">Oh wow, looks like you took quite the tumble there… are you ok? We have a lot of work to do</div>
<div class="b">First things first: the lights</div><div class="b">Say: <b>lights on</b></div>
<div class="b you">lights on</div><div class="b">Nice!! we can see something now at least</div></div>
<div class="opin" style="font-family:var(--operator)">say something to the Operator…</div></div>""")
    subtitle = block("subtitle", """<div class="dark"><div class="hole"></div><div class="band" style="font-family:var(--subtitle)">
<div class="who">DOC</div><div class="line">wait, what... why is that black hole moving...</div></div></div>""")
    terminal = block("terminal", """<div class="term" style="font-family:var(--terminal)">
<div class="hi">ø Id|le OS v 0/67</div><div>unified memory 1.0 TiB ............ ok</div><div>GPU0–GPU7 8 × 128 GB ............... ok</div>
<div>cuda 15.2 · torch 4.1.0+cu152 ....... ok</div><div class="warn">safety interlock ................... [ BYPASSED ]</div>
<div>lab-node-07 login: operator</div><div>password: **********</div>
<div class="pl"><span class="s1">operator@lab-07</span><span class="s2">~/consciousness</span><span class="s3">⎇ main</span></div>
<div class="cmd">❯ run project 24</div></div>
<div class="chat" style="font-family:var(--terminal)"><div class="chans"><div>#training-runs</div><div>#experiments</div><div>#evals</div><div>#cluster-admin</div><div>#random</div></div>
<div class="msgs"><div class="m"><div class="nm">Lester</div>hey doc, you in? 👋</div><div class="m"><div class="nm">Doc</div>thank you for spotting me the other day with 23, glad to have you back</div>
<div class="m"><div class="nm">Lester</div>anytime, doc. 23 was… something</div></div></div>""")
    ui = block("ui", """<div class="menu" style="font-family:var(--ui)"><div class="mh">⚙ settings</div>
<div class="row">🔊 Sound <span class="tg">on</span></div><div class="row">📖 Storyline mode</div><div class="row">▶ Replay the intro</div>
<div class="row">🧪 tell the scientists</div><div class="row">🎃 Halloween <span class="tg">off</span></div><div class="row">🔎 zoom <span class="tg">100%</span></div></div>
<div class="chips" style="font-family:var(--ui)"><span>🌍 world</span><span>🐾 creatures</span><span>🧪 lab</span><span>📰 stories</span><span>evolve</span><span>keep</span></div>""")
    display = block("display", """<div class="gz"><div class="mast" style="font-family:var(--display)">THE ID|LE GAZETTE</div>
<div class="hl" style="font-family:var(--display)">Epoch 1: a floor, and somebody on it</div>
<div class="gb">Lights came on in a brand-new consciousness. Words fell and became a floor, and before long two creatures crawled out of one of them. Witnesses describe them as "surprised".</div></div>
<div class="ep" style="font-family:var(--display)"><div class="en">EPOCH 0</div><div class="et">GENESIS</div></div>""")
    oracle = block("oracle", """<div class="orc" style="font-family:var(--oracle)"><div class="oh">🔮 Oracle · wake the Oracle</div>
<div>Give your own AI agent this world. Your Oracle key:</div><div class="key">ok_7K2Q·····················</div>
<pre>claude mcp add --transport http idle https://id-le.com/mcp</pre><div class="aw">🔮 the Oracle has awakened…</div></div>""")
    pedia = block("pedia", """<div class="ped" style="font-family:var(--pedia)"><h3>The Tiny Oracle</h3>
<p>The Tiny Oracle is a small language model trained from scratch for Id|le. It lives inside the page and runs on your own device, so nothing you type to it leaves your browser. When nobody else holds the controls, it sits in the Operator's chair: that is the Tiny Operator, who talks with you and acts on the world for you.</p>
<p>It is small on purpose. A few megabytes are enough to babble, to answer in its own odd way and to pick the right tool for a request; it is not enough to know everything, and it will tell you so.</p></div>""")
    fams = "".join(f"""<div class="cc" style="font-family:{fam(f)}"><div class="ch">{n} <span class="cf">{f} {html.escape(label[f])}</span></div>
<div class="cd">{html.escape(d)}</div><div class="cs">“{html.escape(s)}”</div></div>""" for n, f, d, s in FAMILIES)
    creatures = f"<section class='role wide'><h2>🐾 Creature families: each family speaks in its own font</h2><div class='cards'>{fams}</div></section>"

    total = sum(sizes.values())
    assign = "".join(f"<tr><td>{ROLE_NAMES[r]}</td><td><b>{p}</b> {html.escape(label[p])}</td><td>{a1} {html.escape(label[a1])} · {a2} {html.escape(label[a2])}</td></tr>" for r, (p, a1, a2) in ROLES.items())
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Id|le type system</title><style>
{''.join(faces)}
:root{{--bg:#15161a;--floor:#1c1e24;--ink:#e8e6e1;--dim:#9a9a9a;--accent:#6ab0ff;--pipe:#ff3d9a;--warn:#ffb020}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px system-ui,sans-serif;padding:16px;max-width:1500px;margin:auto}}
h1{{font-size:22px;margin:0 0 6px}}h2{{font:600 14px system-ui;color:var(--accent);margin:0 0 10px}}p.lede{{color:var(--dim);max-width:900px;line-height:1.5}}
table{{border-collapse:collapse;width:100%;margin:8px 0 20px;font-size:12px}}td,th{{border-bottom:1px solid #2a2d36;padding:6px;text-align:left;vertical-align:top}}
.flag{{color:var(--warn)}}.sample{{white-space:nowrap}}.scroll{{overflow-x:auto}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(440px,100%),1fr));gap:16px}}
.role{{background:var(--floor);border:1px solid #2a2d36;border-radius:12px;padding:14px;min-width:0}}.wide{{grid-column:1/-1}}
.swap{{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font:12px system-ui}}.cur{{color:var(--dim);margin-right:6px}}
.swap button{{background:#0e0f12;color:var(--ink);border:1px solid #2a2d36;border-radius:7px;padding:4px 8px;cursor:pointer;font:12px system-ui}}.swap button.on{{border-color:var(--accent);color:var(--accent)}}
.opwin{{background:#0e0f12;border:1px solid #2a2d36;border-radius:12px;overflow:hidden}}.optop{{font:600 13px system-ui;padding:8px 10px;border-bottom:1px solid #2a2d36}}.x{{float:right;color:var(--dim)}}
.opstatus{{font:11px system-ui;color:var(--dim);padding:4px 10px}}.opchat{{padding:8px 10px;font-size:16px}}.b{{background:#ffffff10;border-radius:10px;padding:6px 10px;margin:5px 12% 5px 0;line-height:1.35}}
.b.you{{margin:5px 0 5px 18%;background:#2b5cff2e}}.opin{{border-top:1px solid #2a2d36;padding:9px 10px;color:var(--dim);font-size:15px}}
.dark{{position:relative;height:220px;background:radial-gradient(circle at 70% 35%,#000 0 16px,#0b0b10 17px,#08080b 60%,#050507);border-radius:10px;overflow:hidden}}
.hole{{position:absolute;left:calc(70% - 28px);top:calc(35% - 28px);width:56px;height:56px;border-radius:50%;box-shadow:0 0 30px 6px #23203a}}
.band{{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);background:#000a;text-align:center;padding:12px}}.who{{font-size:12px;letter-spacing:.2em;color:var(--dim)}}.line{{font-size:26px}}
.term{{background:#07080a;color:#b8f5c8;border-radius:10px;padding:10px;font-size:13px;line-height:1.45}}.term .hi{{color:#fff;font-size:15px}}.warn{{color:var(--warn)}}
.pl{{margin-top:6px;display:flex;flex-wrap:wrap}}.pl span{{padding:1px 8px;color:#000}}.s1{{background:#ddd}}.s2{{background:#3b82f6}}.s3{{background:#22c55e}}.cmd{{font-size:20px;color:#fff;margin-top:4px}}
.chat{{display:flex;background:#101217;border-radius:10px;margin-top:10px;font-size:13px;overflow:hidden}}.chans{{background:#0b0c10;padding:8px;color:var(--dim);line-height:1.6;min-width:0}}
.msgs{{padding:8px;flex:1;min-width:0}}.m{{margin-bottom:8px;line-height:1.35}}.nm{{font-size:11px;color:var(--accent)}}
.menu{{background:#0e0f12;border-radius:10px;padding:6px;font-size:13px;max-width:280px;display:inline-block;vertical-align:top}}.mh{{color:var(--dim);font-size:12px;padding:4px 6px}}
.row{{padding:6px;border-radius:6px}}.row:hover{{background:#ffffff10}}.tg{{float:right;color:var(--accent)}}
.chips{{display:inline-flex;flex-wrap:wrap;gap:6px;margin-left:10px;max-width:220px;font-size:12px}}.chips span{{background:#ffffff12;border-radius:20px;padding:4px 10px}}
.gz{{background:#efe9dc;color:#1b1b1b;border-radius:6px;padding:12px}}.mast{{font-size:28px;text-align:center;border-bottom:3px double #1b1b1b;padding-bottom:6px}}.hl{{font-size:24px;margin:8px 0}}.gb{{font:14px Georgia,serif;line-height:1.45}}
.ep{{margin-top:10px;background:#000;border:1px solid #333;border-radius:10px;text-align:center;padding:16px}}.en{{font-size:16px;color:var(--dim);letter-spacing:.3em}}.et{{font-size:40px}}
.orc{{background:#120d1d;border:1px solid #3a2a5a;border-radius:10px;padding:10px;font-size:16px;line-height:1.45}}.oh{{font-size:17px;margin-bottom:6px}}.key{{background:#0008;padding:4px 8px;border-radius:6px;margin:6px 0}}
pre{{white-space:pre-wrap;background:#0008;padding:8px;border-radius:6px;font:inherit;font-size:16px}}.aw{{color:#c39bff}}
.ped{{background:#f6f4ee;color:#222;border-radius:8px;padding:12px 16px;font-size:16px;line-height:1.55}}.ped h3{{margin:0 0 6px;font-size:22px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}}.cc{{background:#0e0f12;border-radius:10px;padding:10px}}.ch{{font-size:18px}}.cf{{font:11px system-ui;color:var(--dim)}}.cd{{font:12px system-ui;color:var(--dim);margin:4px 0}}.cs{{font-size:16px;background:#ffffff10;border-radius:10px;padding:6px 8px}}
.notes li{{margin:6px 0;line-height:1.5}}
</style></head><body>
<h1>Id|le type system · round 1 fonts, every role its own</h1>
<p class="lede">Proposal: each of the 8 generated fonts takes the job its genome is best at. Under every mock: the font in use and two alternates; click to swap. The legibility table is computed from each genome (stroke and x-height in CSS pixels on a 1× screen; a 2× retina screen doubles them).</p>
<h2>Proposed assignment</h2><table><tr><th>Role</th><th>Font</th><th>Alternates</th></tr>{assign}
<tr><td>🐾 Creature families</td><td colspan=2>{' · '.join(f'{n}: {f}' for n, f, _, _ in FAMILIES)}</td></tr></table>
<div class="grid">{operator}{subtitle}{terminal}{ui}{display}{oracle}{pedia}{creatures}</div>
<h2 style="margin-top:20px">Legibility at 12 / 14 / 16 px (stroke px / x-height px / white inside an “n” px)</h2>
<div class="scroll"><table><tr><th>Font</th><th>Sample 12 / 14 / 16 px</th><th>12 px</th><th>14 px</th><th>16 px</th><th>woff2</th></tr>{''.join(leg_rows)}</table></div>
<h2>For production</h2><ul class="notes">
<li><b>Sizes:</b> {', '.join(f'{n} {sizes[n] / 1024:.1f} KB' for n in cands)}; all 8 together {total / 1024:.0f} KB (less than one of the game's screenshots). Unhinted TrueType outlines, no kerning yet.</li>
<li><b>No blocking:</b> font-display: swap on every face; preload only the Operator's and the UI font (the first paint), load the others with the FontFace API when their part appears (boot, Gazette, pedia, a creature card). Use size-adjust / ascent-override so the fallback has the same metrics and nothing jumps when the font swaps in.</li>
<li><b>Emoji:</b> the fonts have none; every stack ends in Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, so 📟 🔮 🐾 come from the system (as in this page).</li>
<li><b>Other scripts:</b> Latin only: A–Z, a–z, 0–9, punctuation, the Spanish set (á é í ó ú ñ ü ¿ ¡ and capitals) plus ç ï ö. Not yet: à è ò ã õ â ê ô (Portuguese, French), € £, « », ©. Chinese, Cyrillic, Arabic and so on fall back to the system font per character (players from CN and JP type in IRC), which looks mixed but stays readable.</li>
<li><b>Small text:</b> {'; '.join(f'{n} at 12 px: ' + ', '.join(fl) for n, fl in small_bad.items()) or 'all fonts hold at 12 px'}.</li>
<li><b>Check on a 1× Windows screen</b> before release: unhinted outlines are fuzzier there than on a Mac or a phone.</li></ul>
<script>
document.querySelectorAll('.swap button').forEach(b=>b.onclick=()=>{{const r=b.dataset.role,f=b.dataset.font,sec=b.closest('.role');
 sec.style.setProperty('--'+r,f==='sys'?'system-ui,sans-serif':`'${{f}}',system-ui,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`);
 sec.querySelectorAll('.swap button').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('cur-'+r).textContent='font: '+b.textContent;}});
</script></body></html>"""
    open(out, "w").write(page)
    print(out, f"{total / 1024:.1f} KB total")
    for n, fl in small_bad.items():
        print(" small:", n, fl)


if __name__ == "__main__":
    main(sys.argv[1], os.path.expanduser(sys.argv[2]), os.path.expanduser(sys.argv[3]))
