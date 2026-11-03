// idle-founder.js: the Founder gift (Nico, Nov 2: "follow the special 'gift link', then have a personal message from me thanking them,
// then they get a special creature creator in which they can run a bunch of experiments, evolve the creature, change colors, abilities,
// name, family tree, etc... and they get to pick a special badge that marks their creature as 'Founder'").
// Who gets it, with no accounts and nothing sent anywhere:
//   - a browser whose world existed before the storyline launched (FOUNDER_BEFORE), told from the world's own timestamps and a first-seen
//     date this module keeps in the browser;
//   - anyone who opens a gift link (?gift=founder) during the founding period (FOUNDING_UNTIL).
// One Founder per browser. A snapshot is taken before the creature joins the world; nothing in the world is changed or removed.
// The creature creator reuses the arena's own machinery (window.__founderHooks: genomes, mutate, the mini drawings, names, births).
(() => {
  // ---------- the dates and the letter (Nico sets these) ----------
  const FOUNDER_BEFORE = '2026-11-10T08:00:00Z';    // PLACEHOLDER: the storyline's launch on id-le.com; worlds older than this are Founders
  const FOUNDING_UNTIL = '2026-11-24T08:00:00Z';    // PLACEHOLDER: gift links work until then (about two weeks after the launch)
  const WORLD_ON_PROD = false;                      // the early-world gift on id-le.com: switch on at the launch (links work everywhere)
  const LINKS_ON_PROD = false;                      // gift links (general and personal) on id-le.com: off until the launch (the letter is a draft)
  const LETTER_DRAFT = true;                        // the letter below is a draft: Nico rewrites it
  const LETTER = ["Hi! I'm Nico, I make Id|le.",
    "You were here before the story began, back when it was a few creatures eating words, and that means a lot. Thank you!! 🙏",
    "This creature is yours: experiment with it, evolve it, name it. It carries the Founder mark, which only early players get."];
  const SIGN = '— Nico';

  const Q = new URLSearchParams(location.search), H = location.hostname;
  const testSite = /^staging\./.test(H) || H === 'localhost' || H === '127.0.0.1';
  const K = 'idle.founder', KS = 'idle.firstSeen';
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const ms = s => { const n = +s; return isFinite(n) && n > 1e11 ? n : Date.parse(s); };
  // the test site may move the dates (?founder_before=…, ?founder_now=…) to check both sides of them
  const BEFORE = ms(testSite && Q.get('founder_before') || FOUNDER_BEFORE), UNTIL = ms(testSite && Q.get('founder_until') || FOUNDING_UNTIL);
  const now = () => (testSite && Q.get('founder_now') ? ms(Q.get('founder_now')) : Date.now());
  const mark = k => { try { window.__funnel && window.__funnel.mark(k); } catch (e) {} };
  const hooks = () => window.__founderHooks;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // ---------- when this browser was first here: the oldest timestamp its world carries, kept once found ----------
  function oldestInWorld() { let m = Infinity; const at = v => { if (typeof v === 'number' && v > 1.5e12 && v < m) m = v; };
    const a = ld('arena.autosave', null); if (a) { at(a.t); for (const r of a.residents || []) { at(r.born); at(r.genome && r.genome.born); } for (const r of a.resting || []) { at(r.born); at(r.rested); } for (const g of Object.values(a.genomes || {})) at(g && g.born); }
    for (const x of ld('arena.lineage', [])) at(x && x.t); for (const s of ld('arena.snaps', [])) at(s && s.t);
    return m; }
  const hasWorld = () => { try { return !!localStorage.getItem('arena.autosave'); } catch (e) { return false; } };
  function firstSeen() { const kept = ld(KS, null), w = oldestInWorld(), m = Math.min(typeof kept === 'number' ? kept : Infinity, w);
    if (isFinite(m) && m !== kept) sv(KS, m); return isFinite(m) ? m : null; }
  // kept on every page load, even where the gift isn't offered yet, so a browser that plays before the launch is known as early later
  setTimeout(() => { if (hasWorld()) firstSeen(); }, 20000);

  const state = () => ld(K, {});
  const claimed = () => !!state().claimed;
  // a personal gift link (?gift=<id>, made with tools/gift.py) carries a letter Nico wrote for one person; ?gift=founder is the general one
  const PID = /^[a-z2-7]{20,40}$/.test(Q.get('gift') || '') ? Q.get('gift') : null;
  function eligible() { const fs = hasWorld() ? firstSeen() : null;
    const links = testSite || LINKS_ON_PROD;
    return { world: !!(fs && fs < BEFORE && (testSite || WORLD_ON_PROD)), link: links && (!!PID || (Q.get('gift') === 'founder' && now() < UNTIL)), personal: links ? PID : null, expired: links && Q.get('gift') === 'founder' && now() >= UNTIL, firstSeen: fs }; }
  // never inside a storyline keyframe (idle-keys.js: a sandbox for watching the story)
  const available = () => { if (claimed() || window.__storyKey) return false; const e = eligible(); return e.world || e.link || !!state().via; };
  const busy = () => !window.__restoredOrFresh || document.documentElement.classList.contains('booting') || !!document.querySelector('#idleIntro') || !!window.__genesisVoid || !!window.__traveling || !hooks();

  // ---------- badges: drawn on a canvas (in the world and in the creator), and as a small mark on the card ----------
  const RAINBOW = ['#5ebd3e', '#ffb900', '#f78200', '#e23838', '#973999', '#009cdf'];
  const BADGES = [
    { id: 'pipe', name: 'the pipe', line: "Id|le's own |, cycling through its colours like an engine that never stops" },
    { id: 'spark', name: 'first spark', line: 'a four-pointed star, for the first light' },
    { id: 'laurel', name: 'laurel', line: 'a small wreath of leaves' },
    { id: 'seed', name: 'seed', line: 'a sprouting seed, for the ones who were here at the start' },
    { id: 'crown', name: 'glyph crown', line: 'three strokes and a dot: a crown made of letters' }];
  function drawBadge(g, id, x, y, s, t) { g.save(); g.translate(x, y); g.scale(s, s); g.lineCap = 'round'; g.lineJoin = 'round';
    if (id === 'pipe') { const i = Math.floor(t / 1100) % 6, k = (t % 1100) / 1100, beat = 1 + 0.1 * Math.pow(Math.max(0, Math.cos((t / 1000) * Math.PI * 2 * 84 / 60)), 8);
      const mix = (a, b, f) => { const p = h => [1, 3, 5].map(j => parseInt(h.slice(j, j + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, j) => Math.round(v + (B[j] - v) * f)).join(',')})`; };
      const col = mix(RAINBOW[i], RAINBOW[(i + 1) % 6], Math.min(1, k * 2.2)); g.scale(beat, beat); g.shadowColor = col; g.shadowBlur = 8; g.fillStyle = col;
      g.beginPath(); g.roundRect ? g.roundRect(-2, -9, 4, 18, 2) : g.rect(-2, -9, 4, 18); g.fill(); }
    else if (id === 'spark') { const tw = 0.85 + 0.15 * Math.sin(t / 260); g.scale(tw, tw); g.fillStyle = '#ffd54a'; g.shadowColor = '#ffd54a'; g.shadowBlur = 8;
      g.beginPath(); for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4 - Math.PI / 2, r = j % 2 ? 2.6 : 9; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
    else if (id === 'laurel') { g.strokeStyle = '#9ccf6a'; g.fillStyle = '#9ccf6a'; g.lineWidth = 1.2;
      for (const sd of [-1, 1]) { g.beginPath(); g.arc(0, 2, 8, Math.PI / 2 + sd * 0.25, Math.PI / 2 + sd * 2.4, sd < 0); g.stroke();
        for (let j = 0; j < 4; j++) { const a = Math.PI / 2 + sd * (0.7 + j * 0.45), px = Math.cos(a) * 8, py = 2 + Math.sin(a) * 8; g.save(); g.translate(px, py); g.rotate(a + sd * 0.9); g.beginPath(); g.ellipse(0, 0, 3.2, 1.4, 0, 0, 7); g.fill(); g.restore(); } }
      g.fillStyle = '#ffd54a'; g.beginPath(); g.arc(0, 1, 1.8, 0, 7); g.fill(); }
    else if (id === 'seed') { const sw = Math.sin(t / 700) * 0.12; g.fillStyle = '#c99a5b'; g.beginPath(); g.ellipse(0, 6, 4.2, 3, 0, 0, 7); g.fill();
      g.rotate(sw); g.strokeStyle = '#6fe0a8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 4); g.quadraticCurveTo(-1, -2, 1, -7); g.stroke();
      g.fillStyle = '#6fe0a8'; g.beginPath(); g.ellipse(4, -6, 4, 1.8, -0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(-3, -3, 3, 1.4, 0.6, 0, 7); g.fill(); }
    else if (id === 'crown') { g.strokeStyle = '#ff4fd8'; g.lineWidth = 1.8; g.shadowColor = '#ff4fd8'; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(-8, 5); g.lineTo(8, 5); g.stroke(); for (const [xx, hh] of [[-6, 6], [0, 9], [6, 6]]) { g.beginPath(); g.moveTo(xx, 4); g.lineTo(xx, 4 - hh); g.stroke(); }
      g.fillStyle = '#ffd54a'; g.shadowBlur = 0; g.beginPath(); g.arc(0, -8.5, 1.8, 0, 7); g.fill(); }
    g.restore(); }
  // above a Founder in the world (idle-critdraw.js and the arena's frame call this for creatures whose genome carries .founder)
  window.__founderDraw = (g, c, t) => { const f = c.g.founder; if (!f || c.state === 'hide') return; const gs = c.gs || c.g, k = c.size || 1, up = Math.max(gs.bodyL || 20, gs.bodyW || 16) * 0.85 + 14 * k;
    drawBadge(g, f.badge || 'pipe', c.x, c.y - up + Math.sin(t / 600) * 1.5, 0.95 * Math.max(0.7, k), t); };

  // ---------- styles ----------
  const css = document.createElement('style'); css.textContent = `
#founderOffer{position:fixed;left:14px;bottom:14px;z-index:61;max-width:min(330px,calc(100vw - 28px));padding:12px 14px;border-radius:12px;background:#120d1cf2;border:1px solid #ffd54a88;color:#f3e9cf;font:12.5px/1.45 system-ui;box-shadow:0 10px 40px #0008;transition:opacity .4s}
#founderOffer b{display:block;margin-bottom:4px;color:#ffe9a8}#founderOffer .go{margin-top:8px;font:600 12px system-ui;padding:5px 12px;border-radius:14px;border:1px solid #ffd54a;background:#ffd54a2a;color:#fff3cf;cursor:pointer}
#founderOffer .x{position:absolute;right:8px;top:6px;background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:14px}#founderOffer.out{opacity:0}
#founderLetter{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#05060cd0;backdrop-filter:blur(3px);padding:16px}
#founderLetter .paper{position:relative;max-width:520px;width:100%;padding:26px 28px 22px;border-radius:6px 14px 10px 16px;background:linear-gradient(170deg,#fbf3df,#f1e3c2);color:#3a2a17;box-shadow:0 20px 70px #000a,inset 0 0 40px #c9a76a44;transform:rotate(-.6deg)}
#founderLetter .paper p{margin:0 0 12px;font:19px/1.5 "Segoe Print","Bradley Hand","Comic Sans MS",cursive}#founderLetter .sign{text-align:right;font:22px/1.2 "Segoe Print","Bradley Hand","Comic Sans MS",cursive;margin:6px 0 16px}
#founderLetter .draft{position:absolute;right:12px;top:10px;font:600 10px system-ui;letter-spacing:.08em;color:#a0522d;border:1px dashed #a0522d;padding:1px 6px;border-radius:6px;opacity:.75}
#founderLetter .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}#founderLetter button{font:600 14px system-ui;padding:8px 16px;border-radius:18px;border:1px solid #3a2a17;background:#3a2a17;color:#fbf3df;cursor:pointer}#founderLetter button.later{background:transparent;color:#3a2a17}
#founderLab{position:fixed;inset:0;z-index:2147483001;display:grid;grid-template-columns:minmax(260px,360px) 1fr;background:#0b0d18;color:#dfe4ff;font:13px/1.45 system-ui}
#founderLab .side{padding:16px;border-right:1px solid #ffffff14;display:flex;flex-direction:column;gap:10px;overflow:auto}
#founderLab h2{margin:0;font:600 17px system-ui;color:#ffe9a8}#founderLab h3{margin:14px 0 6px;font:600 13px system-ui;color:#ffe9a8;letter-spacing:.02em}
#founderLab canvas.prev{width:100%;aspect-ratio:4/3;border-radius:12px;background:radial-gradient(#1a1e33,#0b0d18 75%);border:1px solid #ffffff14}
#founderLab .main{padding:16px 18px 90px;overflow:auto}#founderLab .x{position:absolute;right:12px;top:10px;background:none;border:0;color:inherit;font-size:20px;opacity:.7;cursor:pointer;z-index:2}
#founderLab .grid2{display:grid;grid-template-columns:110px 1fr 44px;gap:4px 8px;align-items:center}#founderLab input[type=range]{width:100%}
#founderLab .chips{display:flex;flex-wrap:wrap;gap:6px}#founderLab .chip{font:12px system-ui;padding:4px 10px;border-radius:14px;border:1px solid #ffffff33;background:#ffffff0a;color:inherit;cursor:pointer}#founderLab .chip.on{border-color:#ffd54a;background:#ffd54a22;color:#fff3cf}
#founderLab .fams{display:flex;gap:8px}#founderLab .fams button{flex:1;border:1px solid #ffffff22;border-radius:10px;background:#ffffff08;color:inherit;cursor:pointer;padding:4px}#founderLab .fams button.on{border-color:#ffd54a}
#founderLab .vars{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}#founderLab .vars button{border:1px solid #ffffff22;border-radius:10px;background:#ffffff08;padding:2px;cursor:pointer;color:inherit}#founderLab .vars button:hover{border-color:#ffd54a}
#founderLab .vars svg,#founderLab .fams svg,#founderLab .tree svg{width:100%;height:auto;display:block}#founderLab .fams svg{max-height:96px}#founderLab .vars svg{max-height:120px}#founderLab .fams{max-width:420px}#founderLab .vars{max-width:760px}
#founderLab .tree{display:flex;flex-direction:column;gap:4px}#founderLab .gen{display:flex;align-items:center;gap:4px}#founderLab .gen small{width:44px;opacity:.6;flex:none}#founderLab .gen span{width:34px;flex:none;opacity:.35;border-radius:6px}#founderLab .gen span.pick{opacity:1;outline:1.5px solid #ffd54a}
#founderLab .badges{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}#founderLab .badges button{border:1px solid #ffffff22;border-radius:10px;background:#ffffff08;color:inherit;cursor:pointer;padding:6px 2px;font:11px system-ui}#founderLab .badges button.on{border-color:#ffd54a;background:#ffd54a1a}#founderLab .badges canvas{width:40px;height:40px;display:block;margin:0 auto 2px}
#founderLab .name{display:flex;gap:6px}#founderLab .name input{flex:1;font:15px system-ui;padding:7px 10px;border-radius:10px;border:1px solid #ffffff33;background:#ffffff0a;color:inherit}#founderLab .name button{border-radius:10px;border:1px solid #ffffff33;background:#ffffff0a;color:inherit;cursor:pointer;padding:0 10px}
#founderLab .msg{min-height:1.4em;color:#ffb38a;font-size:12px}#founderLab .hint{opacity:.65;font-size:12px;margin:2px 0 6px}
#founderLab .act{display:flex;gap:6px;flex-wrap:wrap}#founderLab .act button,#founderLab .go{font:600 13px system-ui;padding:7px 14px;border-radius:16px;border:1px solid #9fb0ff;background:#6b7cff2a;color:#e9ecff;cursor:pointer}#founderLab .act button[disabled]{opacity:.4;cursor:default}
#founderLab .go{border-color:#ffd54a;background:#ffd54a33;color:#fff3cf;font-size:15px;padding:10px 20px}#founderLab .foot{position:fixed;right:0;bottom:0;left:min(360px,40%);padding:12px 18px;background:linear-gradient(transparent,#0b0d18 40%);display:flex;justify-content:flex-end;gap:10px;align-items:center}
.fbadge{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:0 6px;border-radius:9px;border:1px solid #ffd54a99;color:#ffd54a;font:600 10px system-ui;letter-spacing:.04em;white-space:nowrap}
.fbadge i{display:inline-block;width:3px;height:11px;border-radius:2px;background:#ffd54a}.fbadge.pipe i{animation:fbPipe 6.6s steps(1) infinite}
@keyframes fbPipe{0%{background:#5ebd3e}16.6%{background:#ffb900}33.3%{background:#f78200}50%{background:#e23838}66.6%{background:#973999}83.3%{background:#009cdf}}
@media (max-width:700px){#founderLab{grid-template-columns:1fr;grid-template-rows:auto 1fr;overflow:auto}#founderLab .side{border-right:0;border-bottom:1px solid #ffffff14;padding:12px 12px 8px}#founderLab canvas.prev{aspect-ratio:16/9;max-height:28vh}
  #founderLab .main{padding:10px 12px 96px;overflow:visible}#founderLab .foot{left:0}#founderLab .grid2{grid-template-columns:92px 1fr 38px}#founderLab .badges canvas{width:32px;height:32px}#founderLetter .paper p{font-size:17px}#founderOffer{left:8px;right:8px;bottom:84px}}
@media (prefers-reduced-motion:reduce){.fbadge.pipe i{animation:none}}`;
  document.head.appendChild(css);

  // ---------- the offer (early worlds) and the letter ----------
  function offer() { if (claimed() || $o() || document.querySelector('#founderLetter,#founderLab')) return false; const st = state(); if (st.offer === 'dismissed') return false;
    const el = document.createElement('div'); el.id = 'founderOffer'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<button class="x" title="later (it stays in ⚙)">×</button><b>🎁 a gift for you, Founder</b><div>You were here before the story began. Nico left you a note, and a creature of your own to shape.</div><button class="go">open it</button>`;
    document.body.appendChild(el); sv(K, { ...state(), offer: 'shown' }); mark('fd_offer');
    const lift = () => { const so = document.querySelector('#storyOffer'); el.style.bottom = so ? (so.getBoundingClientRect().height + (innerWidth <= 600 ? 92 : 24)) + 'px' : ''; }; lift(); const iv = setInterval(() => { if (!el.isConnected) return clearInterval(iv); lift(); }, 1000);
    const close = v => { sv(K, { ...state(), offer: v }); el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    el.querySelector('.x').onclick = () => close('dismissed'); el.querySelector('.go').onclick = () => { close('opened'); letter('world'); };
    return true; }
  const $o = () => document.querySelector('#founderOffer');
  // the letter: the general one (a constant, a draft until Nico writes it), or the personal one from a gift link; with a Founder already
  // in this browser a personal letter is still shown (it's the gift), just without a second creature
  function letter(via, personal) { const done = claimed(); if (done && !personal) { toast(`You already have your Founder: ${state().claimed.name} ✨`); return; } if (document.querySelector('#founderLetter')) return;
    if (!done) sv(K, { ...state(), via: state().via || via }); mark('fd_letter');
    const paras = personal ? String(personal).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean) : LETTER, draft = !personal && LETTER_DRAFT;
    const el = document.createElement('div'); el.id = 'founderLetter'; el.setAttribute('role', 'dialog'); if (personal) el.dataset.personal = '1';
    el.innerHTML = `<div class="paper">${draft ? '<span class="draft" title="Nico will rewrite this note">DRAFT</span>' : ''}${paras.map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}<div class="sign">${esc(SIGN)}</div><div class="row">${done ? '<button class="later">close</button>' : '<button class="later">later</button><button class="open">open the creature creator</button>'}</div></div>`;
    document.body.appendChild(el);
    el.querySelector('.later').onclick = () => el.remove(); const o = el.querySelector('.open'); if (o) o.onclick = () => { el.remove(); creator(); }; }
  // a personal link: the letter comes from the server once (opening it marks it opened there); this browser keeps its own copy, so it
  // can read it again; anywhere else an opened link just says so
  async function personalLink(id) { const mine = state().personal; if (mine && mine.id === id) { letter('link', mine.letter); return; }
    let r = null; try { const res = await fetch('/lab/gift/' + id, { cache: 'no-store' }); r = res.ok ? await res.json() : { missing: true }; } catch (e) { r = { missing: true }; }
    if (r.missing || typeof r.letter !== 'string') { toast("This gift link isn't valid (or it was withdrawn). Thank you for coming! ✨"); return; }
    if (r.claimed) { toast('This gift was already opened. Thank you for coming! ✨'); return; }
    let c = null; try { c = await (await fetch('/lab/gift/' + id + '/claim', { method: 'POST' })).json(); } catch (e) {}
    if (!c || !c.ok) { toast('This gift was already opened. Thank you for coming! ✨'); return; }
    sv(K, { ...state(), personal: { id, letter: r.letter, at: Date.now() } }); mark('fd_personal'); letter('link', r.letter); }
  function toast(t) { const el = document.createElement('div'); el.textContent = t; el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483002;padding:8px 14px;border-radius:14px;background:#120d1cf2;border:1px solid #ffd54a88;color:#ffe9a8;font:13px system-ui'; document.body.appendChild(el); setTimeout(() => el.remove(), 7000); }

  // ---------- the creature creator ----------
  const NAME_BLOCK = /(sex|porn|nud|naked|kill|suicid|rape|nazi|hitler|cocaine|heroin|fuck|shit|bitch|bastard|nigg|fag|retard|slut|whore|dick|cock|pussy|cunt|penis|vagin|anal|cum|jizz|tits|boob)/i;
  const SL = [['legs', 'legs', 4, 12, 2], ['bodyL', 'body length', 8, 46, 1], ['bodyW', 'body width', 6, 36, 1], ['l1', 'upper leg', 8, 60, 1], ['l2', 'lower leg', 8, 64, 1], ['palps', 'feelers', 0, 2, 1], ['speed', 'speed', 0.4, 3, 0.05]];
  const CL = [['hue', 'body colour', 0, 360, 1], ['footHue', 'foot colour', 0, 360, 1], ['laserHue', 'laser colour', 0, 360, 1], ['show', 'glow', 0, 1, 0.05]];
  const BODIES = ['chip', 'box', 'orb', 'tri', 'seg', 'star'];
  let L = null;   // the open creator: { fam, g, gens: [{ vars, pick }], hist: [g…], badge, name, exps }
  function creator() { const h = hooks(); if (!h || claimed()) return; if (document.querySelector('#founderLab')) return; mark('fd_creator');
    const fam = 'crawly'; L = { fam, g: { ...h.genomes()[fam] }, gens: [], hist: [], badge: 'pipe', name: '', exps: 0, raf: 0 };
    const el = document.createElement('div'); el.id = 'founderLab'; el.setAttribute('role', 'dialog'); document.body.appendChild(el); render(); loop(); }
  const famSVG = k => { const h = hooks(); return h.miniSVG(h.genomes()[k]); };
  function render() { const el = document.querySelector('#founderLab'), h = hooks(); if (!el || !L) return; const g = L.g, v = (k, d) => g[k] ?? d;
    const slider = ([k, lab, a, b, st], d) => `<span>${lab}</span><input type="range" data-g="${k}" min="${a}" max="${b}" step="${st}" value="${v(k, d ?? a)}"><output>${+(+v(k, d ?? a)).toFixed(2)}</output>`;
    const job = g.job || h.defaults(L.fam).job;
    el.innerHTML = `<button class="x" title="close (your creature waits here until you release it)">×</button>
<div class="side"><h2>🎁 Founder creature creator</h2><canvas class="prev" width="720" height="540"></canvas>
  <h3>Name</h3><div class="name"><input maxlength="24" placeholder="name your creature" value="${esc(L.name)}"><button data-f="suggest" title="let its family suggest one">🎲</button></div><div class="msg"></div>
  <h3>Founder badge</h3><div class="badges">${BADGES.map(b => `<button data-b="${b.id}" class="${L.badge === b.id ? 'on' : ''}" title="${esc(b.line)}"><canvas width="80" height="80"></canvas>${esc(b.name)}</button>`).join('')}</div>
  <div class="hint">${esc(BADGES.find(b => b.id === L.badge).line)}</div></div>
<div class="main">
  <h3>Start from</h3><div class="fams">${['crawly', 'tok'].map(k => `<button data-fam="${k}" class="${L.fam === k ? 'on' : ''}" title="start from your world's ${k === 'crawly' ? 'Crawly' : 'Tok'}">${famSVG(k)}</button>`).join('')}</div>
  <h3>Run experiments</h3><div class="hint">Each experiment makes 8 variants of your creature (the same evolution the world uses). Pick one to keep going; undo goes back a step.</div>
  <div class="act"><button data-f="exp">🧪 run an experiment</button><button data-f="wild" title="bigger mutations">🧪 wild experiment</button><button data-f="undo"${L.hist.length ? '' : ' disabled'}>↺ undo</button></div>
  ${L.gens.length && L.gens[L.gens.length - 1].pick == null ? `<div class="vars" style="margin-top:8px">${L.gens[L.gens.length - 1].vars.map((x, i) => `<button data-v="${i}" title="keep this one">${h.miniSVG(x)}</button>`).join('')}</div>` : ''}
  <h3>Family tree <small style="opacity:.6;font-weight:400">· ${L.exps} experiment${L.exps === 1 ? '' : 's'}</small></h3><div class="tree">${L.gens.length ? L.gens.map((G, n) => `<div class="gen"><small>gen ${n + 1}</small>${G.vars.map((x, i) => `<span class="${G.pick === i ? 'pick' : ''}">${h.miniSVG(x)}</span>`).join('')}</div>`).join('') : '<div class="hint">No experiments yet: the tree grows one generation per experiment.</div>'}</div>
  <h3>Body</h3><div class="chips">${BODIES.map(b => `<button class="chip ${g.body === b ? 'on' : ''}" data-body="${b}">${b}</button>`).join('')}</div><div class="grid2" style="margin-top:8px">${SL.map(s => slider(s)).join('')}<span>abdomen</span><span><input type="checkbox" data-g="abdomen"${g.abdomen ? ' checked' : ''}></span><span></span></div>
  <h3>Colours</h3><div class="grid2">${CL.map(s => slider(s, s[0] === 'show' ? 0.5 : 200)).join('')}<span>laser</span><span><input type="checkbox" data-g="laser"${g.laser ? ' checked' : ''}></span><span></span></div>
  <h3>Ability</h3><div class="chips">${h.JOBS.map(j => `<button class="chip ${job === j ? 'on' : ''}" data-job="${j}" title="${esc(h.JOB_NAMES[j] || j)}">${j}</button>`).join('')}</div><div class="hint">${esc(h.JOB_NAMES[job] || job)}</div>
</div>
<div class="foot"><span class="hint" style="margin:0">A snapshot of your world is saved first.</span><button class="go" data-f="release">release it into your world ✨</button></div>`;
    el.querySelector('.name input').addEventListener('input', e => { L.name = e.target.value; nameMsg(); });
    nameMsg(); badgeIcons(); }
  function nameMsg() { const el = document.querySelector('#founderLab .msg'); if (el) el.textContent = nameProblem(L.name) || ''; }
  function nameProblem(n) { n = String(n || '').trim(); if (!n) return ''; if (n.length < 2) return 'a little longer, please'; if (!/^[\p{L}\p{N}][\p{L}\p{N} |_'.-]*$/u.test(n)) return 'letters, numbers, spaces and | _ - only';
    if (NAME_BLOCK.test(n.replace(/[^\p{L}]/gu, ''))) return 'please pick another name'; if (hooks().names().some(x => x.toLowerCase() === n.toLowerCase())) return 'a creature here already has that name'; return ''; }
  function badgeIcons() { document.querySelectorAll('#founderLab .badges canvas').forEach((cv, i) => { const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 80, 80); drawBadge(g, BADGES[i].id, 40, 42, 3, performance.now()); }); }
  const pc = { x: 360, y: 290, vx: 0, vy: 0, tx: 0, ty: 0, heading: 0, state: 'idle', held: false, phase: 1, size: 2.4 };
  function setPreview() { const cd = window.__critDraw; pc.g = L.g; try { cd.buildLegs(pc); } catch (e) {} }
  function loop() { cancelAnimationFrame(L.raf); setPreview(); let a = 0, last = performance.now(), ic = 0;
    const f = t => { const el = document.querySelector('#founderLab'); if (!el || !L) return; const cv = el.querySelector('canvas.prev'), g = cv.getContext('2d'), cd = window.__critDraw, dt = Math.min(50, t - last); last = t;
      if (pc.g !== L.g) setPreview(); const sp = (+L.g.speed || 1) * 0.00035 * dt; a += sp; const R = 150, nx = 360 + Math.cos(a) * R, ny = 290 + Math.sin(a) * R * 0.55; pc.vx = nx - pc.x; pc.vy = ny - pc.y; pc.x = pc.tx = nx; pc.y = pc.ty = ny; pc.heading = Math.atan2(pc.vy, pc.vx);
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      try { cd.stepLegs(pc, t); cd.drawTo(g, pc, t, false); } catch (e) {}
      const gs = pc.gs || pc.g; drawBadge(g, L.badge, pc.x, pc.y - Math.max(gs.bodyL, gs.bodyW) * 0.85 - 22, 1.6, t);
      if (++ic % 3 === 0) badgeIcons(); L.raf = requestAnimationFrame(f); };
    L.raf = requestAnimationFrame(f); }
  function experiment(rate) { const h = hooks(), vars = Array.from({ length: 8 }, () => { const x = h.mutate(L.fam, rate, L.g); x.name = L.g.name; return x; });
    if (L.gens.length && L.gens[L.gens.length - 1].pick == null) L.gens.pop(); L.gens.push({ vars, pick: null }); L.exps++;
    for (const [n, k] of [[1, 'fd_exp1'], [5, 'fd_exp5'], [20, 'fd_exp20']]) if (L.exps >= n) mark(k); render(); }
  function pickVar(i) { const G = L.gens[L.gens.length - 1]; if (!G || G.pick != null || !G.vars[i]) return; L.hist.push(L.g); G.pick = i; L.g = { ...G.vars[i] }; render(); }
  // undo takes back the last pick: an experiment still waiting for a choice is dropped, and the generation picked last offers its 8 again
  function undo() { if (!L.hist.length) return; let G = L.gens[L.gens.length - 1]; if (G && G.pick == null) { L.gens.pop(); G = L.gens[L.gens.length - 1]; } if (G) G.pick = null; L.g = L.hist.pop(); render(); }
  function release() { const h = hooks(), n = String(L.name || '').trim(), pr = nameProblem(n) || (n ? '' : 'give it a name first');
    if (pr) { const m = document.querySelector('#founderLab .msg'); if (m) m.textContent = pr; const i = document.querySelector('#founderLab .name input'); if (i) i.focus(); return; }
    try { h.snapshot('before the Founder · ' + new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })); } catch (e) {}
    const via = state().via || (eligible().link ? 'link' : 'world'), lineage = L.hist.concat([L.g]).slice(-30).map(x => ({ id: x.id, body: x.body, hue: x.hue, legs: x.legs }));
    const g = { ...L.g, id: 'founder-' + Date.now().toString(36), parent: L.g.id || null, born: Date.now(), name: n, founder: { badge: L.badge, at: Date.now(), via, exps: L.exps, lineage } };
    const c = h.birth(L.fam, g, n); if (!c) { const m = document.querySelector('#founderLab .msg'); if (m) m.textContent = 'something went wrong: try again'; return; }
    sv(K, { ...state(), claimed: { at: Date.now(), name: n, badge: L.badge, via, id: g.id } }); mark('fd_released'); mark('fd_badge_' + L.badge);
    try { h.log('founder', { who: n, badge: L.badge }); } catch (e) {} try { h.comment(`A Founder joined the world: ${n}. Everyone is pretending not to stare`, 'visitor'); } catch (e) {}
    close(); setTimeout(() => { try { h.show(c); } catch (e) {} }, 120); }
  function close() { if (L) cancelAnimationFrame(L.raf); L = null; const el = document.querySelector('#founderLab'); if (el) el.remove(); }
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('#founderLab'); if (!el || !L) return; const t = e.target.closest('button'); if (!t) return; const h = hooks();
    if (t.classList.contains('x')) return close(); const f = t.dataset.f;
    if (f === 'exp') experiment(0.14); else if (f === 'wild') experiment(0.42); else if (f === 'undo') undo(); else if (f === 'release') release();
    else if (f === 'suggest') { const s = h.suggestName(L.g, L.fam); if (s) { L.name = s; const i = el.querySelector('.name input'); if (i) i.value = s; nameMsg(); } }
    else if (t.dataset.v != null) pickVar(+t.dataset.v);
    else if (t.dataset.b) { L.badge = t.dataset.b; render(); }
    else if (t.dataset.fam) { L.fam = t.dataset.fam; L.g = { ...h.genomes()[L.fam] }; L.gens = []; L.hist = []; render(); }
    else if (t.dataset.body) { L.g = { ...L.g, body: t.dataset.body }; render(); }
    else if (t.dataset.job) { L.g = { ...L.g, job: t.dataset.job }; if (t.dataset.job === 'letter' && !L.g.letter) L.g.letter = 'e'; render(); } });
  document.addEventListener('input', e => { const t = e.target; if (!L || !t.closest || !t.closest('#founderLab') || !t.dataset.g) return; const k = t.dataset.g;
    L.g = { ...L.g, [k]: t.type === 'checkbox' ? (t.checked ? 1 : 0) : +t.value }; if (t.nextElementSibling && t.nextElementSibling.tagName === 'OUTPUT') t.nextElementSibling.textContent = +(+t.value).toFixed(2); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && L && !(e.target && e.target.closest && e.target.closest('#founderLab .name'))) close(); });

  // ---------- the card: the Founder mark next to the name ----------
  function card(c, w) { const head = w.querySelector('.chead'), old = head.querySelector('.fbadge'), f = c.g && c.g.founder; if (!f) { if (old) old.remove(); return; }
    const b = old || document.createElement('span'); b.className = 'fbadge ' + (f.badge || 'pipe'); b.title = 'Founder: ' + ((BADGES.find(x => x.id === f.badge) || BADGES[0]).line); b.innerHTML = (f.badge === 'pipe' || !f.badge ? '<i></i>' : { spark: '✦', laurel: '❦', seed: '🌱', crown: '♛' }[f.badge]) + ' FOUNDER';
    if (!old) head.querySelector('.cnm').after(b); }

  // ---------- when to offer it ----------
  { let k = 0; const iv = setInterval(() => { if (++k > 600) return clearInterval(iv); if (busy()) return; if (Q.has('test') && !Q.has('founder') && !Q.has('gift')) return clearInterval(iv);
    const e = eligible(); if (e.personal) { if (k * 500 < 1500) return; clearInterval(iv); mark('fd_link'); personalLink(e.personal); return; }
    if (claimed()) { if (e.link && k * 500 >= 1500) { clearInterval(iv); toast(`You already have your Founder: ${state().claimed.name} ✨`); } else if (!e.link) clearInterval(iv); return; }
    if (e.link) { if (k * 500 < 1500) return; clearInterval(iv); mark('fd_link'); letter('link'); return; }
    if (e.expired) { clearInterval(iv); toast('This gift link has expired: the founding period is over. Thank you for coming! ✨'); return; }
    if (e.world) { if (k * 500 < (Q.has('founder') ? 1500 : 8000)) return; clearInterval(iv); mark('fd_world'); offer(); return; }
    if (k * 500 > 30000) clearInterval(iv); }, 500); }

  window.__founder = { available, open: () => (available() ? letter(state().via || (eligible().link ? 'link' : 'world')) : null), card, eligible, claimed: () => state().claimed || null, creator, badges: BADGES.map(b => b.id),
    dates: () => ({ before: new Date(BEFORE).toISOString(), until: new Date(UNTIL).toISOString(), worldOnProd: WORLD_ON_PROD, letterDraft: LETTER_DRAFT }),
    test: { experiment: r => experiment(r || 0.14), pick: i => pickVar(i), undo, name: n => { L.name = n; const i = document.querySelector('#founderLab .name input'); if (i) i.value = n; nameMsg(); return nameProblem(n); }, badge: b => { L.badge = b; render(); }, release, state: () => L && { fam: L.fam, gens: L.gens.length, exps: L.exps, hist: L.hist.length, badge: L.badge, name: L.name, g: L.g } } };
})();
