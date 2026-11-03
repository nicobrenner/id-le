// Id|le's own typefaces, evolved in tools/fontgen (Nov 2026): every glyph a skeleton of straight strokes, every font a
// genome. Nico picked one per role: f3 Soft Machine for the UI, the Operator, Doc's subtitles and the pedia; f1 Terminal
// for the boot, labchat and the Oracle; f4 Datapulse for the Gazette and epoch cards; a voice per creature family.
// Loads first (in <head>): declares the faces (font-display: swap, so text shows at once in the system font and the
// Id|le font swaps in), sets the role variables (--ui-font, --op-font, --sub-font, --term-font, --oracle-font,
// --display-font, --pedia-font) and window.IDLE_FONTS for canvas text. ?nofonts keeps the system fonts (to compare).
(() => {
  if (/[?&]nofonts\b/.test(location.search)) { window.IDLE_FONTS = null; return; }
  /* fontgen:metrics */ const F = {"f1": {"family": "Idle F1", "file": "fonts/idle-f1.woff2?v=0a9cd22b", "sa": 0.943, "kb": 6.3, "label": "Terminal"}, "f2": {"family": "Idle F2", "file": "fonts/idle-f2.woff2?v=ae154589", "sa": 1.0, "kb": 5.0, "label": "Circuit"}, "f3": {"family": "Idle F3", "file": "fonts/idle-f3.woff2?v=ef9eac37", "sa": 0.941, "kb": 15.3, "label": "Soft Machine"}, "f4": {"family": "Idle F4", "file": "fonts/idle-f4.woff2?v=be9f166c", "sa": 0.863, "kb": 7.1, "label": "Datapulse"}, "f5": {"family": "Idle F5", "file": "fonts/idle-f5.woff2?v=142e9743", "sa": 1.0, "kb": 3.5, "label": "Oracle Pixel"}, "f6": {"family": "Idle F6", "file": "fonts/idle-f6.woff2?v=e53de872", "sa": 1.0, "kb": 3.9, "label": "LED Matrix"}, "f7": {"family": "Idle F7", "file": "fonts/idle-f7.woff2?v=14706253", "sa": 1.0, "kb": 7.8, "label": "Kinetic"}, "f8": {"family": "Idle F8", "file": "fonts/idle-f8.woff2?v=35ffd2b6", "sa": 1.0, "kb": 13.9, "label": "Hairline AI"}}; /* /fontgen */
  if (!F.f3) return;
  // only the main text face is preloaded (the first paint needs it); the others load when something uses them
  { const l = document.createElement('link'); l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous'; l.href = F.f3.file; (document.head || document.documentElement).appendChild(l); }
  const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
  const SYS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', MONO = 'ui-monospace, Menlo, Consolas, monospace';
  // every stack ends in the system fonts: emoji and scripts our fonts don't draw (Chinese, Cyrillic…) come from there
  const stack = (k, fb) => `"${F[k].family}", ${fb.replace(/, (sans-serif|monospace)$/, '')}, ${EMOJI}, ${fb.match(/(sans-serif|monospace)$/)[0]}`;
  const R = { ui: stack('f3', SYS), op: stack('f3', SYS), sub: stack('f3', SYS), pedia: stack('f3', SYS),
    term: stack('f1', MONO), oracle: stack('f1', MONO), display: stack('f4', SYS),
    // creature voices: by job when the job has one, else by family (Tok or Crawly)
    fam: { tok: stack('f6', SYS), crawly: stack('f5', SYS), architect: stack('f2', SYS), debug: stack('f1', MONO),
      math: stack('f8', SYS), classify: stack('f4', SYS), designer: stack('f7', SYS) } };
  R.key = c => { const j = c && c.g && c.g.job; return j && R.fam[j] ? j : (c && c.voiceKey === 'crawly' ? 'crawly' : 'tok'); };
  R.faces = F;
  window.IDLE_FONTS = R;

  const root = document.documentElement.style;
  for (const [k, v] of Object.entries({ ui: R.ui, op: R.op, sub: R.sub, term: R.term, oracle: R.oracle, display: R.display, pedia: R.pedia })) root.setProperty(`--${k}-font`, v);
  for (const [k, v] of Object.entries(R.fam)) root.setProperty(`--fam-${k}`, v);

  const faces = Object.values(F).map(f => `@font-face{font-family:"${f.family}";src:url(${f.file}) format("woff2");font-display:swap;size-adjust:${Math.round(f.sa * 1000) / 10}%}`).join('');
  const roles = [
    // creature speech: each family (or job) its own voice; the thin and pixel voices a little bigger so they stay legible
    `.bubble{font-family:var(--fam-tok)}`,
    ...Object.keys(R.fam).map(k => `.bubble[data-f=${k}]{font-family:var(--fam-${k})}`),
    `.bubble[data-f=tok],.bubble[data-f=crawly],.bubble[data-f=math],.bubble[data-f=classify]{font-size:14px}`,
    // the 🔮 Oracle (bring your own AI) shares the panel with the Operator: it speaks in the terminal font
    `#lab[data-role=oracle] #ai-thread,#lab[data-role=oracle] #lab-text{font-family:var(--oracle-font)!important}`,
    // display: the Gazette front page, epoch cards, reel title cards
    `#genFront .mh,#genFront h3,#genDay .dt,#reel .tc .ti{font-family:var(--display-font)!important}`,
    `#genDay .dt{font-size:14px}`,   // Datapulse is thin: the epoch card's title needs 14 px to read
    // Doc's lines in the dark and the chooser's title
    `#genIntro,#genChoose h2{font-family:var(--sub-font)!important}`,
  ].join('');
  const st = document.createElement('style'); st.id = 'idle-fonts'; st.textContent = faces + roles;
  (document.head || document.documentElement).appendChild(st);

  // the Operator and the Oracle share #lab: mark which one is talking
  const mark = () => { const lab = document.getElementById('lab'), sel = document.getElementById('ai-brain'); if (lab && sel) lab.dataset.role = sel.value === 'tiny' ? 'operator' : 'oracle'; };
  document.addEventListener('change', e => { if (e.target && e.target.id === 'ai-brain') mark(); });
  document.addEventListener('DOMContentLoaded', () => { mark(); setTimeout(mark, 1500); });

  // the story draws on canvas, which only uses a face once it has loaded: start the terminal and display faces early there
  // (f3 is preloaded by the page); elsewhere they come after the page has loaded, so they never compete with it
  const early = k => document.fonts && document.fonts.load(`16px "${F[k].family}"`).catch(() => {});
  if (/[?&](story|intro|boot|arm=story)\b/.test(location.search)) ['f3', 'f1', 'f4'].forEach(early);
  else addEventListener('load', () => setTimeout(() => ['f1', 'f4'].forEach(early), 1500));
})();
