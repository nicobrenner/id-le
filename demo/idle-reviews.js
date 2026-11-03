// idle-reviews.js: ⭐ reviews and the Humans in the Loop (11-03; v2 the same evening). Nico: "This should come in a chat, from the Operator: I have a
// message from Nico…", "asking to join … 'the Founders' team … vesting with a cliff", and "a huge list doesn't work … something like a
// 'tinder for …' the thing they are reviewing".
// - The invitation: the 📟 Operator says it has a message from Nico, and his lines arrive one by one in a quoted bubble. "I'm in" joins the
//   team (TEAM below), shows a short pledge, and opens the review; "not now" asks once more, a day later at the soonest. It comes by the
//   link (?review=logos), or by itself after 2 minutes in the game (never during the intro or the storyline's Genesis). Every word of it
//   lives in TEXT, for Nico to rewrite.
// - The team: joined in this browser (its key ties it, so it can be claimed later); the server keeps only a hashed key, when it joined, and
//   how many review batches it sent. Vesting with a cliff, kindly: "in the loop (vesting)" until 14 days have passed and 3 reviews were
//   sent, then "in the loop ✓" for good (which also opens the Founder creature creator, idle-founder.js; the Founder gift itself is unchanged). If the founding period ends before the cliff, the pending
//   status lapses; nothing already vested is ever taken away. Contributions (each swipe and pick) grow a level.
// - A review: one item at a time, big, in the logo lab's own look (the frame, the sound's waveform with its marks). ✕ nah, ✓ like, ★ love
//   by swiping, buttons or ←/→/↑; ▶ replays (space); a note if you like. Items come least-rated and least-certain first (the server says how
//   many rated each, and its like-rate). After 6, "keep going / done"; then "which one?" between your two favourites. Swipes are scores
//   (✕ 1, ✓ 3, ★ 5) and picks are pairs, sent in small batches. A review has a stage: 'team' (members only) or 'public' (everyone, the
//   team's top N, made with tools/review.py promote).
// - Off on id-le.com until Nico's go (ON_PROD); on staging and local copies it is on.
(() => {
  const H = location.hostname, TEST = /^staging\./.test(H) || H === 'localhost' || H === '127.0.0.1';
  const ON_PROD = false;   // id-le.com: switch on with Nico's go
  if (!(TEST || ON_PROD)) { window.__reviews = null; return; }
  const $ = s => document.querySelector(s), esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mark = k => { try { window.__funnel && window.__funnel.mark(k); } catch (e) {} };
  const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }, sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let NOW_OFF = 0; const now = () => Date.now() + NOW_OFF;   // tests move the clock (the cliff, "not now" a day later)
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- the words (DRAFT: Nico rewrites any of it) ----------
  // the team: Humans in the Loop (Nico, 11-03: "I like Humans in the Loop"). Every word about it is made from this one line.
  // name: the team ("one of the Humans in the Loop"); member: the status before (vesting) / ✓; id: the server's key (keep it if it's ever renamed)
  const TEAM = { id: 'loop', name: 'Humans in the Loop', member: 'in the loop' };   // e.g. { id: 'loop', name: 'Founders', member: 'Founder' }, { name: 'Reviewers', member: 'Reviewer' }, { name: 'Early Adopters', member: 'Early Adopter' }
  const DRAFT_END = 'to be the logo that opens the story, for everyone who plays after you 🙌';   // DRAFT: Nico's message stopped at "…the default logo animation for the story that"
  const TEXT = {
    operator: 'I have a message from Nico:',
    from: 'Nico',
    // Nico's own lines (11-03), as he wrote them; each inner list is one paragraph, each string one line
    hello: [["Hi, thank you for giving Id|le a shot ✌️", "It's been fun building it", "And there's still so much more to do", "Wanna help?"]],
    yes: "I'm in ✌️", no: 'not now',
    after: [["Awesome!"], ["This is a big decision, so I didn't want", "to make it by myself"], ["We have some incredible logo animation options", "they are all so good, I can't really choose 1"],
      ["So I'm counting on you, to check them out, vote", "and leave comments with what you like the most"], ["Based on your votes, we'll pick one winner", DRAFT_END]],
    go: 'check them out ›',
    notNow: 'no problem. maybe another time ✌️',
    // the pledge, after "I'm in" (DRAFT)
    pledge: { title: `🌱 you're one of the ${TEAM.name} now`, ask: 'what we’ll ask: a few quick reviews now and then (a minute or two: swipe, pick, a word if you like)',
      get: `what you get: a say in what ships, a 🌱 ${TEAM.member} badge, and after your cliff, the Founder creature creator`,
      cliff: `the cliff: 14 days and 3 reviews. until then you’re ${TEAM.member} (vesting); after it, ${TEAM.member} ✓ for good` },
    another: rv => `Nico has another one for the ${TEAM.name}: ${rv.title}`, open: 'open ›', later: 'later',
    publicAsk: rv => [[`the ${TEAM.name} narrowed ${rv.title} down to ${rv.n}`, 'help pick the winner?']], publicYes: 'sure ›',
    vested: `you're vested: ${TEAM.member} ✓. thank you for sticking around 🌱`,
    thanks: 'thank you!! Nico reads every one 🧪',
  };
  const CLIFF_DAYS = 14, CLIFF_REVIEWS = 3, LEVELS = [0, 6, 18, 40, 80, 150];
  const INVITE_AFTER = 120e3, ASK_AGAIN_AFTER = 24 * 3600e3;

  // ---------- the browser key (idle.bkey): random, made here, sent only with reviews and the team join; the server keeps a hash ----------
  const BKEY = 'idle.bkey', B32 = 'abcdefghijklmnopqrstuvwxyz234567';
  const bkey = () => { let k = null; try { k = localStorage.getItem(BKEY); } catch (e) {} if (k && /^[a-z2-7]{26}$/.test(k)) return k;
    const b = crypto.getRandomValues(new Uint8Array(16)); let bits = 0, v = 0; k = ''; for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { k += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) k += B32[(v << (5 - bits)) & 31];
    try { localStorage.setItem(BKEY, k); } catch (e) {} return k; };
  const api = (path, body) => fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));

  // ---------- the team (local; the key ties it) ----------
  const TK = 'idle.team', SENT = 'idle.reviews', INV = 'idle.invite';
  const team = () => ld(TK, null);
  const sentAll = () => ld(SENT, {}) || {};
  const until = () => { try { return Date.parse(window.__founder.dates().until); } catch (e) { return Infinity; } };
  function teamStatus() { const t = team(); if (!t) return null; const done = Object.values(sentAll()).filter(r => r.done).length, contrib = t.c || 0;
    const level = LEVELS.filter(x => contrib >= x).length, cliffAt = t.r3 ? Math.max(t.j + CLIFF_DAYS * 864e5, t.r3) : null;
    if (!t.vested && cliffAt && now() >= cliffAt && cliffAt <= until()) { t.vested = cliffAt; sv(TK, t); mark('rv_vested'); setTimeout(() => opSay(TEXT.vested), 400); }
    const state = t.vested ? 'vested' : now() >= until() ? 'lapsed' : 'vesting';
    const days = Math.max(0, Math.ceil((t.j + CLIFF_DAYS * 864e5 - now()) / 864e5));
    const label = state === 'vested' ? `${TEAM.member} ✓` : state === 'lapsed' ? `${TEAM.member} (lapsed)` : `${TEAM.member} (vesting)`;
    const detail = state === 'vested' ? `level ${level} · ${contrib} contributions` : state === 'lapsed' ? 'the founding period ended before your cliff (nothing you had vested is lost)'
      : `${days ? days + (days === 1 ? ' day' : ' days') : 'no days'} and ${Math.max(0, CLIFF_REVIEWS - done)} ${CLIFF_REVIEWS - done === 1 ? 'review' : 'reviews'} to your cliff · level ${level}`;
    return { team: t.team, joined: t.j, reviews: done, contrib, level, state, label, detail, vested: !!t.vested, cliffAt }; }
  function join() { let t = team(); if (!t) { t = { team: TEAM.id, j: now(), c: 0 }; sv(TK, t); }
    api('/lab/team/' + TEAM.id + '/join', { bkey: bkey() }).then(r => { if (r.j && r.j.ok) { const x = team(); x.srv = 1; sv(TK, x); } }).catch(() => {}); mark('rv_in'); return t; }
  const addContrib = n => { const t = team(); if (t) { t.c = (t.c || 0) + n; sv(TK, t); } };
  function reviewDone(rid) { const all = sentAll(), r = all[rid] = all[rid] || { rated: {}, pairs: [] }; if (r.done) return; r.done = now(); sv(SENT, all); mark('rv_sent');
    const t = team(); if (t) { const n = Object.values(all).filter(x => x.done).length; if (n >= CLIFF_REVIEWS && !t.r3) { t.r3 = now(); sv(TK, t); } } teamStatus(); }

  // ---------- the Operator's chat: lines, Nico's quoted bubble, buttons ----------
  const css = document.createElement('style');
  css.textContent = `.ai-row.rvnico{background:#e03a3e14;border-left:3px solid #e03a3e;margin-right:6%!important;font-family:var(--op-font,var(--ui-font,system-ui))}.ai-row.rvnico .who{font-size:12px;opacity:.7;margin-bottom:4px}
.ai-row.rvnico p{margin:0 0 8px}.ai-row.rvnico p:last-child{margin:0}.ai-row.rvnico span{display:block}.rvtyping{font-size:12px;opacity:.6;margin:2px 0 6px 4px;font-style:italic}
.rvbtns{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}.rvbtns button{border:1px solid #e03a3e;background:#e03a3e;color:#fff;border-radius:16px;padding:7px 14px;font:600 14px var(--ui-font,system-ui);cursor:pointer}
.rvbtns button.alt{background:none;color:inherit;border-color:#8886}.rvbtns button[disabled]{opacity:.45;cursor:default}
.rvpledge{border:1px solid #8886;border-radius:12px;padding:10px 12px;margin:6px 0 8px;background:#61bb4614;font-size:14px;line-height:1.45}.rvpledge b{display:block;margin-bottom:4px}.rvpledge div{margin:3px 0;opacity:.9}
.rvfloat{position:fixed;right:16px;bottom:16px;z-index:2147482050;width:min(360px,calc(100% - 32px));max-height:70vh;overflow:auto;background:#14121c;color:#ece6da;border:1px solid #ffffff22;border-radius:14px;padding:10px 12px;box-shadow:0 12px 40px #000a;font:15px var(--ui-font,system-ui)}`;
  document.head.appendChild(css);
  const thread = () => { const lab = $('#lab'); if (!lab) return null; return lab.classList.contains('ai') ? $('#ai-thread') : $('#lab-thread'); };
  function openOperator() { const lab = $('#lab'); if (lab && !lab.classList.contains('open')) { const t = $('#lab-toggle'); if (t) t.click(); } }
  // where the lines go: the Operator's chat, or (no chat on this page) a small floating card
  function host() { const th = thread(); if (th) return th; let f = $('.rvfloat'); if (!f) { f = document.createElement('div'); f.className = 'rvfloat'; document.body.appendChild(f); } return f; }
  const scroll = h => { try { h.scrollTop = 1e9; } catch (e) {} };
  let FAST = false;
  const wait = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 30) : ms));
  function opSay(text) { const h = host(), d = document.createElement('div'); d.className = 'ai-row tiny rvop'; d.textContent = text; h.appendChild(d); scroll(h); return d; }
  async function nicoSay(paras, bubble) { const h = host(); let b = bubble;
    if (!b) { b = document.createElement('div'); b.className = 'ai-row rvnico'; b.innerHTML = `<div class="who">✉️ ${esc(TEXT.from)}</div>`; h.appendChild(b); }
    for (const para of paras) { const p = document.createElement('p'); b.appendChild(p);
      for (const line of para) { const ty = document.createElement('div'); ty.className = 'rvtyping'; ty.textContent = TEXT.from + ' is typing…'; h.appendChild(ty); scroll(h);
        await wait(500 + Math.min(1400, line.length * 28)); ty.remove(); const s = document.createElement('span'); s.textContent = line; p.appendChild(s); scroll(h); await wait(220); } }
    return b; }
  function buttons(list) { return new Promise(res => { const h = host(), d = document.createElement('div'); d.className = 'rvbtns';
    d.innerHTML = list.map((x, i) => `<button data-i="${i}" class="${x.alt ? 'alt' : ''}">${esc(x.label)}</button>`).join(''); h.appendChild(d); scroll(h);
    d.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; d.querySelectorAll('button').forEach(x => { x.disabled = true; }); res(+b.dataset.i); }); }); }
  function pledge() { const h = host(), d = document.createElement('div'); d.className = 'rvpledge'; const P = TEXT.pledge;
    d.innerHTML = `<b>${esc(P.title)}</b><div>${esc(P.ask)}</div><div>${esc(P.get)}</div><div>${esc(P.cliff)}</div>`; h.appendChild(d); scroll(h); mark('rv_pledge'); return d; }

  // ---------- the invitation (once per browser; "not now" asks again once, a day later at the soonest) ----------
  let delivering = false;
  const inv = () => ld(INV, {}) || {};
  async function invite(rid = 'logos', how = 'auto') {
    if (delivering) return false; delivering = true; openOperator(); await wait(how === 'link' ? 300 : 700);
    try { const I = inv(); I.asks = (I.asks || 0) + 1; I.last = now(); sv(INV, I); mark('rv_invite');
      opSay(TEXT.operator); await wait(500); const bub = await nicoSay(TEXT.hello);
      const pick = await buttons([{ label: TEXT.yes }, { label: TEXT.no, alt: true }]);
      if (pick === 1) { const J = inv(); J.answer = 'no'; sv(INV, J); mark('rv_notnow'); opSay(TEXT.notNow); return false; }
      const J = inv(); J.answer = 'yes'; sv(INV, J); join();
      await nicoSay(TEXT.after, bub); await wait(400); pledge();
      const go = await buttons([{ label: TEXT.go }]); delivering = false; if (go === 0) open(rid, how === 'link' ? 'link' : 'invite'); return true;
    } finally { delivering = false; } }
  async function offerAnother(rv) { if (delivering) return; delivering = true; openOperator(); await wait(600);
    try { const all = sentAll(); all[rv.rid] = all[rv.rid] || { rated: {}, pairs: [] }; all[rv.rid].asked = now(); sv(SENT, all);
      if (rv.stage === 'public' && !team()) { opSay(TEXT.operator); await wait(400); await nicoSay(TEXT.publicAsk(rv)); const p = await buttons([{ label: TEXT.publicYes }, { label: TEXT.later, alt: true }]); delivering = false; if (p === 0) open(rv.rid, 'invite'); }
      else { opSay(TEXT.another(rv)); const p = await buttons([{ label: TEXT.open }, { label: TEXT.later, alt: true }]); delivering = false; if (p === 0) open(rv.rid, 'invite'); }
    } finally { delivering = false; } }

  // ---------- reviews: the list, a config ----------
  let listC = null, listT = 0;
  async function list() { if (listC && Date.now() - listT < 60e3) return listC;
    try { const r = await api('/lab/reviews'); if (r.status === 200 && Array.isArray(r.j.reviews)) { listC = r.j.reviews; listT = Date.now(); return listC; } } catch (e) {}
    return [{ rid: 'logos', kind: 'logos', title: 'the logo', n: 12, stage: 'team', team: TEAM.id }, { rid: 'fonts', kind: 'fonts', title: 'our fonts', n: 8, stage: 'team', team: TEAM.id }]; }
  const FALLBACK = {
    logos: { kind: 'logos', title: 'the logo', items: ['c3-typed-dust', 'c3-typed-crt', 'a3-dust', 'b3a-dust-crt', 'b3b-crt', 'scope-strike', 'scope-crt', 'typed-scope', 'scope-meter', 'scope-shockwave', 'strike-purr-static', 'crt-off'], stage: 'team', team: TEAM.id, open: true },
    fonts: { kind: 'fonts', title: 'our fonts', items: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'], stage: 'team', team: TEAM.id, open: true },
  };
  async function getCfg(rid) { try { const r = await api('/lab/review/' + encodeURIComponent(rid)); if (r.status === 200 && r.j.items) return r.j; if (r.status === 404) return null; } catch (e) {}
    return FALLBACK[rid] ? { rid, ...FALLBACK[rid], order: {} } : null; }
  // the order: the least-rated first, nudged towards items whose like-rate sits closest to the middle (the most uncertain); ties by this browser's key
  function orderOf(items, order) { const o = order || {}, ns = items.map(i => (o[i] && o[i].n) || 0), mean = ns.reduce((a, b) => a + b, 0) / Math.max(1, ns.length), k = bkey();
    const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
    const pri = i => { const x = o[i] || {}, n = x.n || 0, close = x.lr == null ? 1 : 1 - Math.abs(x.lr - 0.5) * 2; return n - 0.5 * mean * close + hash(k + i) * 0.01; };
    return items.slice().sort((a, b) => pri(a) - pri(b)); }

  // ---------- plugins: one per kind. { load(), ok(id), label(id), line(id), mount(id, el) → { play(), stop(), playing() } } ----------
  const audio = () => { const A = window.__audio; if (A && A.ctx) { const ctx = A.ctx(); return { ctx, dest: A.storyOut ? A.storyOut() : ctx.destination }; }
    const ctx = audio.own || (audio.own = new (window.AudioContext || window.webkitAudioContext)()); return { ctx, dest: ctx.destination }; };
  const LOGO_FONT = "'Idle F1', monospace";
  const PLUGINS = {
    logos: {
      load() { if (window.IdleLogos) return Promise.resolve(); return PLUGINS.logos._p || (PLUGINS.logos._p = new Promise((res, rej) => { const s = document.createElement('script');
        const v = (window.IDLE_CFG && window.IDLE_CFG.build) || ''; s.src = 'idle-logos.js' + (v ? '?v=' + encodeURIComponent(v) : ''); s.onload = () => res(); s.onerror = () => { PLUGINS.logos._p = null; rej(new Error('the logos could not load')); }; document.head.appendChild(s); })); },
      get: id => window.IdleLogos && (window.IdleLogos.byId ? window.IdleLogos.byId(id) : window.IdleLogos.list.find(x => x.id === id)),
      ok(id) { return !!this.get(id); },
      label(id) { const L = this.get(id); return L ? L.name.replace(/\s*\(round \d\)$/, '') : id; },
      line(id) { const L = this.get(id); return L ? L.idea : ''; },
      // the logo lab's card: the frame, the waveform strip with its marks (pink: a beat you see and hear, blue: heard only), the legend
      mount(id, el) { const L = this.get(id); el.innerHTML = `<header><b>${esc(this.label(id))}</b> <span class="len">${L ? L.duration.toFixed(1) + ' s' : ''}</span></header><p class="idea">${esc(this.line(id))}</p>
<div class="stage"><canvas class="cv" width="1120" height="460"></canvas><button class="big" data-act="replay" title="play (space)">▶</button></div><canvas class="st" width="1120" height="104"></canvas>
<div class="row"><span class="leg"><i class="m vis"></i>visual + audible beat <i class="m snd"></i>sound only</span></div>`;
        const cv = el.querySelector('.cv'), st = el.querySelector('.st'), card = el.closest('.card') || el; let h = null, raf = 0, info = null, t0 = 0, ctxR = null;
        const strip = t => { if (!info) return; const g = st.getContext('2d'), W = st.width, Hh = st.height, d = info.buf.getChannelData(0), dur = info.dur; g.fillStyle = '#0d0e12'; g.fillRect(0, 0, W, Hh);
          g.fillStyle = '#5d6b86'; const per = d.length / W; for (let x = 0; x < W; x++) { let lo = 0, hi = 0; for (let j = Math.floor(x * per); j < Math.floor((x + 1) * per); j++) { lo = Math.min(lo, d[j]); hi = Math.max(hi, d[j]); } g.fillRect(x, Hh * 0.55 - hi * Hh * 0.4, 1, Math.max(1, (hi - lo) * Hh * 0.4)); }
          g.font = '20px system-ui'; let lastX = -99, row = 0; for (const e of info.ev) { const x = e.t / dur * W; g.fillStyle = e.vis ? '#ff5fa2' : '#7ee3f5'; g.fillRect(x, 0, 2, Hh); if (/^click [2-8]$/.test(e.k)) continue; row = x - lastX < 92 ? (row + 1) % 2 : 0; lastX = x; g.fillText(e.k, x + 4, 20 + row * 22); }
          if (t != null && t >= 0) { g.fillStyle = '#fff'; g.fillRect(t / dur * W, 0, 3, Hh); } };
        L.info().then(x => { info = x; strip(null); return L.still(cv, x.poster, { font: LOGO_FONT }); }).catch(() => {});
        const stop = () => { cancelAnimationFrame(raf); if (h) { try { h.stop(); } catch (e) {} h = null; } card.classList.remove('on'); strip(null); };
        return { play() { stop(); const { ctx, dest } = audio(); ctxR = ctx; try { window.__audio && window.__audio.wantSound && window.__audio.wantSound(); } catch (e) {} if (ctx.state !== 'running') ctx.resume().catch(() => {});
            t0 = ctx.currentTime + 0.12; const me = h = L.build(ctx, cv, t0, { font: LOGO_FONT, destination: dest }); card.classList.add('on'); mark('rv_play');
            const tick = () => { if (h !== me) return; strip(ctxR.currentTime - t0); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
            me.done.then(() => { if (h === me) { h = null; cancelAnimationFrame(raf); card.classList.remove('on'); strip(null); } }); return me; },
          stop, playing: () => !!h, canvas: cv }; },
    },
    fonts: {
      load() { return document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve(); },
      face: id => window.IDLE_FONTS && window.IDLE_FONTS.faces && window.IDLE_FONTS.faces[id],
      ok(id) { return !!this.face(id); },
      label(id) { const f = this.face(id); return f ? `${f.family.replace('Idle ', '')} · ${f.label}` : id; },
      line(id) { return { f1: 'the boot, labchat and the Oracle', f3: 'the UI, the Operator, Doc and the pedia', f4: 'the Gazette and epoch cards' }[id] || 'a creature family’s voice'; },
      mount(id, el) { const f = this.face(id); el.innerHTML = `<header><b>${esc(this.label(id))}</b></header><p class="idea">${esc(this.line(id))}</p>
<div class="sample" style="font-family:'${esc(f ? f.family : '')}', monospace"><div class="big">Id|le</div><div>the creatures eat words, then dream about them</div><div>¿qué onda? ñandú, pingüino · 0123456789 · AaBbCc</div></div>`;
        return { play() {}, stop() {}, playing: () => false }; },
    },
  };

  // ---------- the swipe deck (the logo lab's look: round3.html's colours, frame and strip) ----------
  const dcss = document.createElement('style');
  dcss.textContent = `#review{position:fixed;inset:0;z-index:2147482100;display:none;background:#0a0b0ef2;color:#e8e6e1;font:14px 'Idle F3',var(--ui-font,system-ui),sans-serif;overscroll-behavior:contain}
#review.on{display:flex;justify-content:center}#review .box{--bg:#15161a;--floor:#1c1e24;--ink:#e8e6e1;--dim:#9a9a9a;--accent:#6ab0ff;--line:#2a2d36;width:min(1180px,100%);height:100%;display:flex;flex-direction:column;background:var(--bg);padding:10px 16px 12px;box-sizing:border-box}
#review .top{display:flex;align-items:center;gap:10px;min-height:34px}#review .top b{font-size:16px}#review .prog{color:var(--dim);font-size:13px}#review .tm{margin-left:auto;font-size:12px;color:#9be08a}#review .x{background:none;border:0;color:inherit;font-size:18px;cursor:pointer;padding:4px 6px}
#review .deck{flex:1;min-height:0;position:relative;display:flex;align-items:stretch;justify-content:center;margin:6px 0}
#review .card{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;background:var(--floor);border:1px solid var(--line);border-radius:12px;padding:12px;touch-action:none;user-select:none;-webkit-user-select:none;will-change:transform}
#review .card.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}#review .card header{display:flex;justify-content:space-between;gap:8px}#review .card header b{font-size:16px}#review .len{color:var(--dim);font-size:12px}
#review .idea{color:var(--dim);font-size:13px;line-height:1.45;margin:4px 0 8px}#review .stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
#review canvas.cv{display:block;max-width:100%;max-height:100%;width:auto;height:auto;aspect-ratio:1120/460;border-radius:8px;background:#000}#review canvas.st{display:block;width:100%;height:auto;max-height:60px;margin-top:4px;border-radius:4px}
#review .big{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:64px;height:64px;border-radius:50%;border:1px solid #fff6;background:#000b;color:#fff;font-size:24px;cursor:pointer;opacity:.85}#review .card.on .big{opacity:0;pointer-events:none}
#review .row{display:flex;gap:12px;align-items:center;margin-top:6px}#review .leg{color:var(--dim);font-size:11px;margin-left:auto}#review .m{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 4px 0 8px}#review .m.vis{background:#ff5fa2}#review .m.snd{background:#7ee3f5}
#review .sample{flex:1;background:#000;border-radius:8px;padding:18px;line-height:1.5;font-size:clamp(16px,2.6vw,26px);display:flex;flex-direction:column;justify-content:center}#review .sample .big{position:static;transform:none;width:auto;height:auto;border:0;background:none;font-size:clamp(48px,9vw,110px);line-height:1.05;opacity:1;cursor:default}
#review .stamp{position:absolute;top:18px;padding:6px 14px;border:3px solid;border-radius:10px;font:700 26px 'Idle F4',system-ui;letter-spacing:.06em;opacity:0;pointer-events:none;z-index:3}#review .stamp.nah{right:18px;color:#ff6b6b;transform:rotate(12deg)}#review .stamp.like{left:18px;color:#9be08a;transform:rotate(-12deg)}#review .stamp.love{left:50%;transform:translateX(-50%);color:#fdb827}
#review .acts{display:flex;justify-content:center;align-items:center;gap:14px;padding:4px 0}#review .acts button{width:58px;height:58px;border-radius:50%;border:2px solid var(--line);background:var(--floor);color:var(--ink);font-size:24px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
#review .acts button small{font-size:9px;opacity:.7;margin-top:2px}#review .acts [data-act=nah]{border-color:#ff6b6b;color:#ff6b6b}#review .acts [data-act=like]{border-color:#9be08a;color:#9be08a}#review .acts [data-act=love]{border-color:#fdb827;color:#fdb827}#review .acts [data-act=replay]{width:46px;height:46px;font-size:16px}
#review .notebar{display:flex;gap:8px;align-items:center;justify-content:center}#review .notebar button{background:none;border:0;color:var(--dim);font:inherit;cursor:pointer;text-decoration:underline}#review .notebar textarea{flex:1;max-width:640px;min-height:38px;background:#0e0f12;color:var(--ink);border:1px solid var(--line);border-radius:6px;font:13px inherit;padding:6px}
#review .panel{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;background:var(--floor);border:1px solid var(--line);border-radius:12px;padding:20px}
#review .panel h3{margin:0;font:600 22px 'Idle F4',system-ui;letter-spacing:.04em}#review .panel p{margin:0;color:var(--dim);max-width:520px;line-height:1.5}#review .panel .btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
#review .panel button,#review .h2h .pick{background:var(--accent);color:#000;border:0;border-radius:8px;padding:9px 16px;font:600 14px inherit;cursor:pointer}#review .panel button.alt{background:none;color:var(--ink);border:1px solid var(--line)}
#review .h2h{flex:1;display:flex;gap:12px;min-height:0}#review .h2h .card{touch-action:auto}#review .h2h .pick{margin-top:8px}#review .h2q{text-align:center;font:600 18px 'Idle F4',system-ui;margin:2px 0 6px}
@media (max-width:640px){#review .box{padding:8px 8px 10px}#review .card{padding:8px;justify-content:center}#review .stage{flex:0 0 auto}#review .h2h{flex-direction:column}#review .acts{gap:10px}#review .acts button{width:54px;height:54px}#review .idea{font-size:12px;margin:2px 0 6px}}`;
  document.head.appendChild(dcss);
  const el = document.createElement('div'); el.id = 'review'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el);
  let wasHushed = null; const hushGame = on => { const A = window.__audio; if (!A || !A.hush) return; try { if (on) { wasHushed = A.hushed ? A.hushed() : false; A.hush(true); } else { A.hush(!!wasHushed); wasHushed = null; } } catch (e) {} };

  let cur = null;   // { rid, cfg, P, mine, queue, i, judged, pending: {scores, notes, pairs}, view: 'card'|'check'|'h2h'|'end'|'msg', live, note }
  async function open(rid, from = 'lab') {
    rid = String(rid || '').toLowerCase(); if (!/^[a-z0-9-]{1,40}$/.test(rid)) return false;
    if (cur) close(); hushGame(true); cur = { rid, from, view: 'msg', msg: 'opening…', pending: { scores: {}, notes: {}, pairs: [] }, judged: 0 }; el.classList.add('on'); paint();
    mark('rv_open_' + (from === 'link' ? 'link' : from === 'end' ? 'end' : 'lab'));
    const cfg = await getCfg(rid); if (!cur || cur.rid !== rid) return false;
    if (!cfg) { cur.msg = 'this review doesn’t exist (or it has closed)'; paint(); return false; }
    if (cfg.stage === 'team' && !team()) { close(); invite(rid, from === 'link' ? 'link' : 'lab'); return false; }
    const P = PLUGINS[cfg.kind]; if (!P) { cur.msg = 'this kind of review isn’t in this version of Id|le yet'; paint(); return false; }
    try { await P.load(); } catch (e) { cur.msg = String(e.message || e); paint(); return false; }
    if (!cur || cur.rid !== rid) return false;
    const mine = sentAll()[rid] || { rated: {}, pairs: [] }, items = cfg.items.filter(id => P.ok(id));
    Object.assign(cur, { cfg: { ...cfg, items }, P, mine, queue: orderOf(items.filter(id => !(id in (mine.rated || {}))), cfg.order), i: 0, view: 'card' });
    if (!cur.queue.length) cur.view = 'end';
    paint(); return true; }
  function close() { if (!cur) return; try { cur.live && cur.live.stop(); } catch (e) {} (cur.h2 || []).forEach(m => { try { m.stop(); } catch (e) {} }); flush(true); cur = null; el.classList.remove('on'); el.innerHTML = ''; hushGame(false);
    if (/[?&]review=/.test(location.search)) try { const u = new URL(location.href); u.searchParams.delete('review'); history.replaceState(history.state, '', u); } catch (e) {} }
  const ACT = { nah: 1, like: 3, love: 5 };
  function paint() {
    if (!cur) return; try { cur.live && cur.live.stop(); } catch (e) {} cur.live = null; const c = cur.cfg, ts = teamStatus();
    const total = c ? c.items.length : 0, done = c && cur.mine ? Object.keys(cur.mine.rated || {}).length : 0;
    const top = `<div class="top"><b>⭐ ${esc((c && c.title) || cur.rid)}</b><span class="prog">${c ? `${Math.min(done + 1, total)} / ${total}` : ''}</span>${ts ? `<span class="tm" title="${esc(ts.detail)}">🌱 ${esc(ts.label)}</span>` : '<span class="tm"></span>'}<button class="x" data-a="close" title="close (esc)">✕</button></div>`;
    if (cur.view === 'msg') { el.innerHTML = `<div class="box">${top}<div class="deck"><div class="panel"><p>${esc(cur.msg)}</p></div></div></div>`; return; }
    if (cur.view === 'check') { el.innerHTML = `<div class="box">${top}<div class="deck"><div class="panel"><h3>${cur.judged} judged ✓</h3><p>${done} of ${total} so far. thank you!</p><div class="btns"><button data-a="more">keep going</button><button class="alt" data-a="done">done</button></div></div></div></div>`; return; }
    if (cur.view === 'end') { const st = teamStatus(), gift = st && st.vested && window.__founder && window.__founder.available && window.__founder.available();
      el.innerHTML = `<div class="box">${top}<div class="deck"><div class="panel"><h3>thank you!!</h3><p>${esc(TEXT.thanks)}</p>${st ? `<p>🌱 ${esc(st.label)} · ${esc(st.detail)}</p>` : ''}<div class="btns">${gift ? '<button data-a="gift">🎁 open your Founder gift</button>' : ''}<button ${gift ? 'class="alt" ' : ''}data-a="close">back to my world</button></div></div></div></div>`; return; }
    if (cur.view === 'h2h') { const [a, b] = cur.pair; el.innerHTML = `<div class="box">${top}<div class="h2q">which one?</div><div class="deck h2h"><section class="card" data-item="${esc(a)}"></section><section class="card" data-item="${esc(b)}"></section></div>
<div class="notebar"><button data-a="skiph2h">can’t choose</button></div></div>`;
      cur.h2 = [...el.querySelectorAll('.h2h .card')].map(cd => { const m = cur.P.mount(cd.dataset.item, cd); const pk = document.createElement('button'); pk.className = 'pick'; pk.dataset.pick = cd.dataset.item; pk.textContent = 'this one'; cd.appendChild(pk); return m; }); return; }
    const id = cur.queue[cur.i];
    el.innerHTML = `<div class="box">${top}<div class="deck"><section class="card" data-item="${esc(id)}"><div class="body" style="display:contents"></div><div class="stamp nah">NAH</div><div class="stamp like">LIKE</div><div class="stamp love">LOVE</div></section></div>
<div class="acts"><button data-act="nah" title="nah (←)">✕<small>nah</small></button><button data-act="replay" title="play again (space)">▶</button><button data-act="love" title="love it (↑)">★<small>love</small></button><button data-act="like" title="like (→)">✓<small>like</small></button></div>
<div class="notebar">${cur.note ? `<textarea maxlength="300" data-note placeholder="what would you change? (optional)">${esc(cur.pending.notes[id] || '')}</textarea>` : `<button data-a="note">✎ add a note</button>`}</div></div>`;
    const card = el.querySelector('.deck .card'); cur.live = cur.P.mount(id, card.querySelector('.body')); dragOn(card);
    const { ctx } = audio(); if (ctx.state === 'running' && cur.cfg.kind === 'logos') setTimeout(() => { if (cur && cur.view === 'card' && cur.queue[cur.i] === id && cur.live) cur.live.play(); }, 350); }
  function judge(act) { if (!cur || cur.view !== 'card' || cur.flying) return; const id = cur.queue[cur.i], v = ACT[act]; if (!id || !v) return;
    const ta = el.querySelector('textarea[data-note]'); if (ta && ta.value.trim()) cur.pending.notes[id] = ta.value.trim().slice(0, 300);
    cur.pending.scores[id] = v; cur.mine.rated = cur.mine.rated || {}; cur.mine.rated[id] = v; saveMine(); cur.judged++; addContrib(1); mark('rv_' + act); cur.note = false;
    const card = el.querySelector('.deck .card'), next = () => { cur.flying = false; if (!cur) return; cur.i++; if (Object.keys(cur.pending.scores).length >= 3) flush();
      const left = cur.queue.length - cur.i; if (!left) return finish(); if (cur.judged % 6 === 0) { cur.view = 'check'; flush(); } paint(); };
    if (card && !RM) { cur.flying = true; const dx = act === 'nah' ? -1 : act === 'like' ? 1 : 0, dy = act === 'love' ? -1 : 0; card.style.transition = 'transform .28s ease-in, opacity .28s'; card.style.transform = `translate(${dx * 120}%, ${dy * 110}%) rotate(${dx * 18}deg)`; card.style.opacity = '0'; setTimeout(next, 280); } else next(); }
  function saveMine() { const all = sentAll(); all[cur.rid] = { ...(all[cur.rid] || {}), rated: cur.mine.rated, pairs: cur.mine.pairs || [] }; sv(SENT, all); }
  // after "done" (or the last item): "which one?" between this browser's two favourites (★ first), then the thanks
  function finish() { if (!cur) return; const r = cur.mine.rated || {}, fav = Object.keys(r).filter(k => r[k] >= 3).sort((a, b) => r[b] - r[a]);
    const done = (cur.mine.pairs || []).map(p => p.slice().sort().join('|'));
    let pair = null; for (let x = 0; x < fav.length && !pair; x++) for (let y = x + 1; y < fav.length && !pair; y++) if (!done.includes([fav[x], fav[y]].sort().join('|'))) pair = [fav[x], fav[y]];
    if (pair && cur.view !== 'h2h' && !cur.h2hDone) { cur.view = 'h2h'; cur.pair = pair; paint(); return; }
    if (Object.keys(r).length >= Math.min(6, cur.cfg.items.length)) reviewDone(cur.rid); mark('rv_done'); flush(); cur.view = 'end'; paint(); }
  function pick(w) { const [a, b] = cur.pair, l = w === a ? b : a; cur.pending.pairs.push([w, l]); cur.mine.pairs = (cur.mine.pairs || []).concat([[w, l]]); saveMine(); addContrib(1); mark('rv_h2h');
    (cur.h2 || []).forEach(m => { try { m.stop(); } catch (e) {} }); cur.h2 = null; cur.h2hDone = true; flush(); finish(); }

  // sending: small batches (3 swipes, a checkpoint, the pick, closing, leaving the page); a team review asks the server to join first if needed
  let flushing = null;
  function flush(leaving) { if (!cur) return null; const p = cur.pending, rid = cur.rid; if (!Object.keys(p.scores).length && !p.pairs.length) return flushing;
    const body = { bkey: bkey(), scores: p.scores, notes: p.notes, pairs: p.pairs }; cur.pending = { scores: {}, notes: {}, pairs: [] };
    if (leaving && document.visibilityState === 'hidden' && navigator.sendBeacon) { try { const base = (window.__idle && window.__idle.cfg && window.__idle.cfg.helper || '').replace(/\/$/, ''); if (navigator.sendBeacon(base + '/lab/review/' + rid, new Blob([JSON.stringify(body)], { type: 'application/json' }))) return null; } catch (e) {} }
    const go = async () => { let r = await api('/lab/review/' + rid, body); if (r.status === 403 && r.j && r.j.team) { await api('/lab/team/' + r.j.team + '/join', { bkey: body.bkey }); r = await api('/lab/review/' + rid, body); } return r; };
    flushing = go().catch(() => null); return flushing; }
  addEventListener('pagehide', () => flush(true));

  // swipe by dragging (touch, pen or mouse): right ✓, left ✕, up ★ (the big ▶ in the middle can start a swipe too; the click that ends it doesn't replay)
  function dragOn(card) { let sx = 0, sy = 0, dx = 0, dy = 0, on = false, id = null;
    const stamp = (k, a) => { const s = card.querySelector('.stamp.' + k); if (s) s.style.opacity = a; };
    card.addEventListener('pointerdown', e => { const bt = e.target.closest('button,textarea'); if (bt && !bt.classList.contains('big')) return; card.__moved = false; on = true; id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0; card.style.transition = 'none'; try { card.setPointerCapture(id); } catch (er) {} });
    card.addEventListener('pointermove', e => { if (!on || e.pointerId !== id) return; dx = e.clientX - sx; dy = e.clientY - sy; card.style.transform = `translate(${dx}px, ${Math.min(0, dy)}px) rotate(${dx / 24}deg)`;
      stamp('like', Math.max(0, Math.min(1, dx / 120))); stamp('nah', Math.max(0, Math.min(1, -dx / 120))); stamp('love', Math.max(0, Math.min(1, -dy / 120)) * (Math.abs(dx) < 80 ? 1 : 0)); });
    const end = () => { if (!on) return; on = false; const W = Math.max(90, card.clientWidth * 0.22); card.__moved = Math.abs(dx) > 6 || Math.abs(dy) > 6;
      if (-dy > 110 && Math.abs(dx) < 90) return judge('love'); if (dx > W) return judge('like'); if (dx < -W) return judge('nah');
      card.style.transition = 'transform .2s'; card.style.transform = ''; ['like', 'nah', 'love'].forEach(k => stamp(k, 0));
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && cur && cur.live && !cur.live.playing()) cur.live.play(); };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end); }

  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !cur) return;
    const a = b.dataset.a, act = b.dataset.act;
    if (a === 'close') return close(); if (a === 'more') { mark('rv_more'); cur.view = 'card'; return paint(); } if (a === 'done') return finish();
    if (a === 'note') { cur.note = true; const id = cur.queue[cur.i]; const nb = el.querySelector('.notebar'); if (nb) { nb.innerHTML = `<textarea maxlength="300" data-note placeholder="what would you change? (optional)">${esc(cur.pending.notes[id] || '')}</textarea>`; const t = nb.querySelector('textarea'); setTimeout(() => t.focus(), 30); } return; }
    if (a === 'skiph2h') { cur.h2hDone = true; (cur.h2 || []).forEach(m => { try { m.stop(); } catch (er) {} }); cur.h2 = null; return finish(); }
    if (a === 'gift') { close(); try { window.__founder.open(); } catch (er) {} return; }
    if (b.dataset.pick) return pick(b.dataset.pick);
    if (act === 'replay') { const cd = b.closest('.card'); if (cd && cd.__moved) { cd.__moved = false; return; } if (cur.view === 'h2h' && cd) { const k = [...el.querySelectorAll('.h2h .card')].indexOf(cd); (cur.h2 || []).forEach((m, j) => { if (j !== k) m.stop(); }); cur.h2[k] && cur.h2[k].play(); return; } if (cur.live) cur.live.play(); return; }
    if (act) judge(act); });
  el.addEventListener('input', e => { if (cur && e.target.matches('textarea[data-note]')) { const id = cur.queue[cur.i]; if (id) cur.pending.notes[id] = e.target.value.slice(0, 300); } });
  addEventListener('keydown', e => { if (!cur) return; if (e.key === 'Escape') { e.stopPropagation(); return close(); } if (e.target.closest && e.target.closest('textarea,input')) return;
    if (cur.view !== 'card') return; const k = { ArrowLeft: 'nah', ArrowRight: 'like', ArrowUp: 'love' }[e.key];
    if (k) { e.preventDefault(); e.stopPropagation(); judge(k); } else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); cur.live && cur.live.play(); } }, true);

  // ---------- when: the link at once; otherwise after 2 minutes in the game, never during the intro or Genesis, one message at a time ----------
  const busy = () => !window.__restoredOrFresh || document.documentElement.classList.contains('booting') || !!document.querySelector('#idleIntro') || !!window.__genesisVoid || !!window.__traveling || !!window.__storyKey
    || (() => { try { const u = window.__genesis && window.__genesis.unlocks && window.__genesis.unlocks(); return !!(u && u.story && u.epoch < 1); } catch (e) { return false; } })() || !!cur || delivering || !!$('#founderLetter,#founderLab');
  const Q = new URLSearchParams(location.search), want = Q.get('review');
  let t0 = Date.now(), auto = !Q.has('test') || Q.has('invite');   // automated tests turn it on themselves (__reviews.test.auto)
  if (want) { const w0 = Date.now(); const tick = () => { if (busy() && Date.now() - w0 < 90e3) return setTimeout(tick, 400); open(want, 'link'); }; setTimeout(tick, 300); auto = false; }
  async function maybeInvite() { if (!auto || busy() || Date.now() - t0 < INVITE_AFTER) return; const I = inv();
    if (!team()) {
      if (I.answer === 'yes') return;
      if (I.asks >= 1 && now() - (I.last || 0) < ASK_AGAIN_AFTER) return;   // "not now" (or no answer): once more, a day later at the soonest
      if (I.asks >= 2) { const rv = (await list()).find(r => r.stage === 'public' && !(sentAll()[r.rid] && (sentAll()[r.rid].done || sentAll()[r.rid].asked))); if (rv) { auto = false; offerAnother(rv); } return; }
      auto = false; return invite('logos', 'auto'); }
    const rvs = await list(), all = sentAll(), next = rvs.find(r => !(all[r.rid] && (all[r.rid].done || all[r.rid].asked)) && (r.stage === 'public' || r.team === TEAM.id));
    if (next) { auto = false; offerAnother(next); } }
  setInterval(() => { maybeInvite().catch(() => {}); }, 5000);
  setInterval(() => { teamStatus(); }, 60e3);

  window.__reviews = { open, close, list, invite, join, team: { status: teamStatus, vested: () => !!(teamStatus() || {}).vested, member: () => !!team(), name: TEAM.name, id: TEAM.id },
    state: () => cur && { rid: cur.rid, view: cur.view, kind: cur.cfg && cur.cfg.kind, items: cur.cfg ? cur.cfg.items.slice() : [], queue: cur.queue ? cur.queue.slice() : [], i: cur.i, current: cur.queue ? cur.queue[cur.i] : null,
      rated: { ...((cur.mine && cur.mine.rated) || {}) }, pairs: ((cur.mine && cur.mine.pairs) || []).slice(), pair: cur.pair || null, playing: !!(cur.live && cur.live.playing && cur.live.playing()) },
    sent: rid => !!(sentAll()[rid] && sentAll()[rid].done), hasKey: () => { try { return /^[a-z2-7]{26}$/.test(localStorage.getItem(BKEY) || ''); } catch (e) { return false; } },
    badge: () => { const s = teamStatus(), rids = Object.keys(sentAll()).filter(k => sentAll()[k].done); return s || rids.length ? { rids, status: s } : null; }, plugins: () => Object.keys(PLUGINS),
    text: TEXT, test: { fast: on => { FAST = on !== false; }, shift: ms => { NOW_OFF += ms; }, order: (items, order) => orderOf(items, order), flush: () => flush(), auto: (on, since) => { auto = on !== false; if (since != null) t0 = Date.now() - since; }, delivering: () => delivering, done: rid => reviewDone(rid) } };
})();
