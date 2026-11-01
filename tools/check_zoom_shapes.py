"""Phones zoom the floor with CSS zoom (#35). iOS Safari keeps zoomed-out text at a readable minimum, so cards whose height comes from
their text (charts, forms) grew taller than their zoom and looked skinnier zoomed out. This checks that charts, forms and objects keep
their shape at every zoom and their text inside them (it used to spill out, the same minimum again), in WebKit with the iPhone 12 mini profile, with that minimum font size simulated (Playwright's WebKit doesn't
apply it), including a card made while zoomed out.

    python3 tools/build_static.py --out /tmp/idle-dist && python3 -m http.server 8776 -d /tmp/idle-dist &
    python3 tools/check_zoom_shapes.py --port 8776          # exit 1 if any shape drifts more than 5%

Uses the starter world (?fresh). The regression suite runs the same check as "zoom shapes phone" (tools/test_smoke.py).
"""
import argparse, sys
from playwright.sync_api import sync_playwright

# the browser's minimum font size, simulated: below zoom 1, card text renders at no less than 9px (set synchronously with the zoom, as a real browser does)
SIM = '''addEventListener('DOMContentLoaded', () => { const f = document.getElementById('floor'); const st = document.createElement('style'); document.head.appendChild(st);
  // only text whose zoom is still the floor's: text inside a pinned card's inner box (.zin) is laid out at full size, which the minimum leaves alone
  const T = ['.design h4', '.design small', '.design .dzby', '.design p', '.design li', '.thing .cap'].map(x => `#floor ${x}:not(.zin *)`).join(',');
  const upd = z => { st.textContent = z < 1 ? `${T}{font-size:${Math.max(9, 12 * z) / z}px!important}` : ''; };
  Object.defineProperty(f.style, 'zoom', { configurable: true, get() { return f.style.getPropertyValue('zoom'); }, set(v) { f.style.setProperty('zoom', v); upd(parseFloat(v) || 1); } }); });'''
ASPECTS = """() => [...document.querySelectorAll('#floor .design, #floor .thing')].map(e => { const b = e.getBoundingClientRect(); return b.width && b.height ? [e.dataset.k || e.className, b.width / b.height] : null; }).filter(Boolean)"""
# text that spills out of its card: for each card, how far its text reaches past the card's box, as a share of the card's width
SPILL = """() => { let n = 0, worst = 0, cards = 0; for (const e of document.querySelectorAll('#floor .design, #floor .thing')) { const b = e.getBoundingClientRect(); if (!b.width) continue; cards++;
  for (const t of e.querySelectorAll('h4,small,.dzby,p,li,.cap,svg text')) { const r = t.getBoundingClientRect(); if (!r.width) continue; const o = Math.max(0, r.right - b.right, r.bottom - b.bottom) / b.width; if (o > 0.02) n++; worst = Math.max(worst, o); } }
  return [cards, n, worst]; }"""
MARK = """() => { const src = [...document.querySelectorAll('#floor .design')].find(e => !e.querySelector('.dzpin')); if (!src) return null; const b = src.getBoundingClientRect(); src.dataset.zref = b.width / b.height; return true; }"""
MADE = """async () => { const f = document.getElementById('floor'), src = f.querySelector('.design[data-zref]'); if (!src) return null;
  const c = src.cloneNode(true); c.classList.remove('zl'); c.style.width = c.style.height = ''; f.appendChild(c); await new Promise(r => setTimeout(r, 300));
  const b = c.getBoundingClientRect(); c.remove(); return [+src.dataset.zref, b.width / b.height]; }   // vs the source card's shape at 100%"""

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8776); ap.add_argument('--tol', type=float, default=0.05); a = ap.parse_args()
    bad = []
    with sync_playwright() as p:
        b = p.webkit.launch()
        try:
            ctx = b.new_context(**p.devices['iPhone 12 Mini']); ctx.add_init_script(SIM); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.goto(f'http://127.0.0.1:{a.port}/arena.html?fresh', wait_until='domcontentloaded'); pg.wait_for_function('window.__arena && window.__arena.raw().length > 3', timeout=180000); pg.wait_for_timeout(4000)
            if not pg.evaluate("'zoom' in document.documentElement.style"): print('this WebKit has no CSS zoom: nothing to check'); return 0
            pg.evaluate('__arena.cam(1600, 1100, 1)'); pg.wait_for_timeout(800); base = pg.evaluate(ASPECTS); pg.evaluate(MARK)
            if not base: print('no charts, forms or objects on the floor to check'); return 1
            ref = sum(x[1] for x in base) / len(base)
            for z in [0.75, 0.5, 0.35, 1]:
                pg.evaluate(f'__arena.cam(1600, 1100, {z})'); pg.wait_for_timeout(800); now = pg.evaluate(ASPECTS); m = sum(x[1] for x in now) / len(now)
                ok = abs(m / ref - 1) <= a.tol; print(f'zoom {z:.2f}: mean aspect {m:.3f} (100%: {ref:.3f}) over {len(now)} {"ok" if ok else "DRIFTS"}')
                if not ok: bad.append(z)
                cards, n, worst = pg.evaluate(SPILL); ok3 = n == 0; print(f'  text spilling out: {n} pieces over {cards} cards (worst {worst:.0%} of a card width) {"ok" if ok3 else "SPILLS"}')
                if not ok3: bad.append(f'spill {z}')
                if z == 0.35:
                    made = pg.evaluate(MADE)
                    if made: ok2 = abs(made[1] / made[0] - 1) <= a.tol; print(f'  a card made at 35%: aspect {made[1]:.3f} (its source at 100%: {made[0]:.3f}) {"ok" if ok2 else "DRIFTS"}'); bad += [] if ok2 else ['made']
            if errs: print('page errors (not counted here; the smoke suite checks them):', errs[:3])
        finally:
            b.close()
    print('FAIL' if bad else 'PASS'); return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
