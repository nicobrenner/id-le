// idle-reviews.js: ⭐ reviews (11-03). Nico: "Hey, this is Nico, the creator of Id|le, and would love your feedback on the logo animation...
// take a look here: link" → a lightbox over the game where players play a few experiments, score each 0–5, add a note and send.
// - Open by a link (?review=logos), from 🧪 (its ⭐ reviews tab) or from the roadmap the end card opens.
// - A review is a config from the helper (/lab/review/<rid>: { kind, title, items, note?, showTotals?, open? }); tools/review.py writes
//   new ones. The kind picks a plugin below (logos, fonts; creatures and objects later) that draws and plays each item.
// - Sending: once per browser per review (localStorage idle.reviews; the server also allows one a day per visitor). Scores add up on the
//   server; notes go to the private list the maker reads, never shown to anyone else. Sending is an explicit act, so it works with
//   anonymous stats off. Nothing about the world is sent.
// - The reward (v1): a 🧪 reviewer badge in ⚙ (this browser only) and a thank-you from the Operator.
// - Off on id-le.com until Nico's go (ON_PROD); on staging and local copies it is on.
(() => {
  const H = location.hostname, TEST = /^staging\./.test(H) || H === 'localhost' || H === '127.0.0.1';
  const ON_PROD = false;   // id-le.com: switch on with Nico's go (the review link then works there too)
  if (!(TEST || ON_PROD)) { window.__reviews = null; return; }
  const $ = s => document.querySelector(s), esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // the browser key (Nico, 11-03: Padlet-style implicit accounts, "claim" later): made here the first time this browser sends a review, 128
  // random bits in base32, kept in localStorage idle.bkey. It isn't derived from anything and stats never use it; it is sent only with a
  // review, and the server keeps only a hash of it (to refuse a second review from this browser, and so these reviews could be claimed later)
  const BKEY = 'idle.bkey', B32 = 'abcdefghijklmnopqrstuvwxyz234567';
  const bkey = () => { let k = null; try { k = localStorage.getItem(BKEY); } catch (e) {} if (k && /^[a-z2-7]{26}$/.test(k)) return k;
    const b = crypto.getRandomValues(new Uint8Array(16)); let bits = 0, v = 0; k = ''; for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { k += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) k += B32[(v << (5 - bits)) & 31];
    try { localStorage.setItem(BKEY, k); } catch (e) {} return k; };
  const SENT = 'idle.reviews', BADGE = 'idle.reviewer', mark = k => { try { window.__funnel && window.__funnel.mark(k); } catch (e) {} };
  const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }, sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // Nico's note at the top of each review. DRAFT: Nico rewrites these (or sends his own with tools/review.py new … --note-file, which wins)
  const NOTE_DRAFT = true;
  const NOTES = {
    logos: "hey, it's Nico, I make Id|le ✌️\nevery consciousness opens with a logo, and I can't pick one. play each (sound on!), give it 0 to 5, and tell me what you'd change. the scores decide which one ships",
    fonts: "hey, it's Nico, I make Id|le ✌️\nId|le draws its letters with its own fonts, grown from a genome. which ones read well, which ones feel like Id|le? 0 to 5 each, and a word if something looks off",
  };
  // the same two reviews the helper has built in (helper/worker.js REVIEWS), used when the helper can't be reached (a local copy without it)
  const FALLBACK = {
    logos: { kind: 'logos', title: 'the logo', items: ['c3-typed-dust', 'c3-typed-crt', 'a3-dust', 'b3a-dust-crt', 'b3b-crt', 'scope-strike', 'scope-crt', 'typed-scope', 'scope-meter', 'scope-shockwave', 'strike-purr-static', 'crt-off'], open: true },
    fonts: { kind: 'fonts', title: 'our fonts', items: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'], open: true },
  };

  // ---------- plugins: one per kind. { load() → Promise, label(id), line(id), body(id) → html, play?(id, card) → { stop }, ok(id) } ----------
  // creatures and objects: a later version adds them here (a creature drawn by critdraw, an object by the world's own renderer)
  let playing = null;
  const stopPlaying = () => { if (playing) { try { playing.stop(); } catch (e) {} playing = null; } document.querySelectorAll('#review .card.playing').forEach(c => c.classList.remove('playing')); };
  const audio = () => { const A = window.__audio; if (A && A.ctx) { const ctx = A.ctx(); return { ctx, dest: A.storyOut ? A.storyOut() : ctx.destination }; }
    const ctx = audio.own || (audio.own = new (window.AudioContext || window.webkitAudioContext)()); return { ctx, dest: ctx.destination }; };
  const PLUGINS = {
    logos: {
      load() { if (window.IdleLogos) return Promise.resolve(); return PLUGINS.logos._p || (PLUGINS.logos._p = new Promise((res, rej) => { const s = document.createElement('script');
        const v = (window.IDLE_V && window.IDLE_V['idle-logos.js']) || (window.IDLE_CFG && window.IDLE_CFG.build) || ''; s.src = 'idle-logos.js' + (v ? '?v=' + encodeURIComponent(v) : ''); s.onload = () => res(); s.onerror = () => { PLUGINS.logos._p = null; rej(new Error('the logos could not load')); }; document.head.appendChild(s); })); },
      get: id => window.IdleLogos && window.IdleLogos.list.find(x => x.id === id),
      ok(id) { return !!this.get(id); },
      label(id) { const L = this.get(id); return L ? L.name.replace(/\s*\(round \d\)$/, '') : id; },
      group(id) { const L = this.get(id), r = L && (L.round || 0); return r === 3 ? 'round 3 · the newest' : r === 2 ? 'round 2' : r === 1 ? 'round 1' : ''; },
      line(id) { const L = this.get(id); return L ? L.idea : ''; },
      body(id) { const L = this.get(id); return `<div class="stage"><canvas width="960" height="400"></canvas><button class="play" data-play="${esc(id)}" title="play it (sound on)">▶</button><span class="len">${L ? L.duration.toFixed(1) + ' s' : ''}</span></div>`; },
      play(id, card) { const L = this.get(id); if (!L) return null; const cv = card.querySelector('canvas'), { ctx, dest } = audio();
        try { window.__audio && window.__audio.wantSound && window.__audio.wantSound(); } catch (e) {} if (ctx.state !== 'running') ctx.resume().catch(() => {});
        const h = L.build(ctx, cv, ctx.currentTime + 0.12, { font: "'Idle F1', monospace", destination: dest }); h.done.then(() => { if (playing === h) { playing = null; card.classList.remove('playing'); } }); return h; },
    },
    fonts: {
      load() { return document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve(); },
      face: id => window.IDLE_FONTS && window.IDLE_FONTS.faces && window.IDLE_FONTS.faces[id],
      ok(id) { return !!this.face(id); },
      label(id) { const f = this.face(id); return f ? `${f.family.replace('Idle ', '')} · ${f.label}` : id; },
      line(id) { return { f1: 'the boot, labchat and the Oracle', f3: 'the UI, the Operator, Doc and the pedia', f4: 'the Gazette and epoch cards' }[id] || 'a creature family’s voice'; },
      body(id) { const f = this.face(id); return `<div class="sample" style="font-family:'${esc(f ? f.family : '')}', monospace"><div class="big">Id|le</div><div>the creatures eat words, then dream about them</div><div>¿qué onda? ñandú, pingüino · 0123456789 · AaBbCc</div></div>`; },
    },
  };

  // ---------- the lightbox ----------
  const css = document.createElement('style');
  css.textContent = `#review{position:fixed;inset:0;z-index:2147482100;display:none;background:#05040acc;backdrop-filter:blur(3px);overflow:auto;font:14px var(--ui-font,system-ui);color:#ece6da}
#review.on{display:block}#review .box{max-width:760px;margin:32px auto;background:#14121c;border:1px solid #ffffff22;border-radius:16px;box-shadow:0 20px 60px #000a;padding:16px 18px 18px}
#review .hd{display:flex;align-items:center;gap:8px}#review .hd b{flex:1;font-size:15px}#review .x{border:0;background:none;color:inherit;font-size:16px;cursor:pointer}
#review .note{white-space:pre-line;margin:10px 0 12px;padding:10px 12px;border-left:3px solid #e03a3e;background:#ffffff08;border-radius:6px;font-family:var(--op-font,var(--ui-font,system-ui));line-height:1.45}
#review .note .sig{display:block;margin-top:4px;opacity:.7;font-size:12px}#review .draft{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#fdb827;margin-left:6px}
#review .card{border:1px solid #ffffff1c;border-radius:12px;padding:10px 12px;margin:10px 0;background:#0d0c13}#review .card.playing{border-color:#e03a3e88}
#review .grp{margin:16px 0 4px;font:600 11px var(--display-font,var(--ui-font,system-ui));letter-spacing:.08em;text-transform:uppercase;opacity:.65}#review .card h4{margin:0 0 2px;font-size:14px}#review .card .ln{font-size:12px;opacity:.72;margin:0 0 8px;line-height:1.4}
#review .stage{position:relative;background:#000;border-radius:8px;overflow:hidden}#review .stage canvas{display:block;width:100%;height:auto;aspect-ratio:12/5}
#review .play{position:absolute;left:10px;bottom:10px;width:40px;height:40px;border-radius:50%;border:1px solid #fff5;background:#000a;color:#fff;font-size:16px;cursor:pointer}
#review .card.playing .play{opacity:.35}#review .len{position:absolute;right:10px;bottom:10px;font-size:11px;opacity:.6}
#review .sample{background:#000;border-radius:8px;padding:12px 14px;line-height:1.5;font-size:15px}#review .sample .big{font-size:40px;line-height:1.1}
#review .score{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px}#review .score small{opacity:.7;margin-right:4px}
#review .score button{min-width:34px;height:32px;border-radius:9px;border:1px solid #ffffff33;background:none;color:inherit;font:inherit;cursor:pointer}
#review .score button.on{background:#e03a3e;border-color:#e03a3e;color:#fff}#review textarea{width:100%;box-sizing:border-box;margin-top:6px;min-height:38px;border-radius:8px;border:1px solid #ffffff26;background:transparent;color:inherit;font:13px var(--ui-font,system-ui);padding:6px 8px;resize:vertical}
#review .ft{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}#review .send{border:0;border-radius:16px;padding:8px 18px;background:#e03a3e;color:#fff;font:inherit;font-weight:600;cursor:pointer}
#review .send[disabled]{opacity:.45;cursor:default}#review .msg{font-style:italic;opacity:.9}#review .avg{font-size:12px;opacity:.8;margin-left:auto}#review .muted{opacity:.7;font-size:12px}
@media (max-width:520px){#review .box{margin:0;min-height:100%;border-radius:0;border:0;padding:12px}#review .score button{min-width:30px}}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'review'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el);

  // the game's own sounds (music, creatures, weather) wait while a review is open, so a logo is heard alone; closing puts back what was there
  let wasHushed = null; const hushGame = on => { const A = window.__audio; if (!A || !A.hush) return; try { if (on) { wasHushed = A.hushed ? A.hushed() : false; A.hush(true); } else { A.hush(!!wasHushed); wasHushed = null; } } catch (e) {} };
  let cur = null;   // { rid, cfg, scores, notes, msg, sending, sent, totals, from }
  const sentAll = () => ld(SENT, {}) || {};
  async function getCfg(rid) {
    try { const r = await fetch('/lab/review/' + encodeURIComponent(rid), { cache: 'no-store' }); const j = await r.json(); if (r.ok && j && j.items) return j; if (r.status === 404) return null; } catch (e) {}
    return FALLBACK[rid] ? { rid, ...FALLBACK[rid] } : null; }
  async function open(rid, from = 'lab') {
    rid = String(rid || '').toLowerCase(); if (!/^[a-z0-9-]{1,30}$/.test(rid)) return false;
    stopPlaying(); if (!cur) hushGame(true); cur = { rid, cfg: null, scores: {}, notes: {}, msg: '', sending: false, from }; el.classList.add('on'); el.innerHTML = `<div class="box"><div class="hd"><b>⭐ review</b><button class="x" data-a="close" title="close">✕</button></div><p class="muted">opening…</p></div>`;
    mark('rv_open_' + (from === 'link' ? 'link' : from === 'end' ? 'end' : 'lab'));
    const cfg = await getCfg(rid); if (!cur || cur.rid !== rid) return false;
    if (!cfg) { cur.msg = 'this review doesn’t exist (or it has closed)'; render(); return false; }
    const P = PLUGINS[cfg.kind]; if (!P) { cur.cfg = cfg; cur.msg = 'this kind of review isn’t in this version of Id|le yet'; render(); return false; }
    try { await P.load(); } catch (e) { cur.msg = String(e.message || e); render(); return false; }
    cur.cfg = { ...cfg, items: cfg.items.filter(id => P.ok(id)) }; const prev = sentAll()[rid]; if (prev) { cur.sent = prev; cur.scores = { ...(prev.scores || {}) }; mark('rv_already'); }
    render(); return true; }
  function close() { stopPlaying(); if (cur) hushGame(false); cur = null; el.classList.remove('on'); el.innerHTML = ''; if (/[?&]review=/.test(location.search)) try { const u = new URL(location.href); u.searchParams.delete('review'); history.replaceState(history.state, '', u); } catch (e) {} }
  function render() {
    if (!cur) return; const c = cur.cfg, P = c && PLUGINS[c.kind], note = (c && c.note) || NOTES[cur.rid] || '', draft = NOTE_DRAFT && !(c && c.note) && TEST;
    const head = `<div class="hd"><b>⭐ review · ${esc((c && c.title) || cur.rid)}</b><button class="x" data-a="close" title="close">✕</button></div>`;
    if (!c || !P) { el.innerHTML = `<div class="box">${head}<p class="msg">${esc(cur.msg)}</p></div>`; return; }
    const sent = !!cur.sent, avg = id => cur.totals && cur.totals[id] && cur.totals[id].avg != null ? `<span class="avg">average ${cur.totals[id].avg} · ${cur.totals[id].n} ${cur.totals[id].n === 1 ? 'score' : 'scores'}</span>` : '';
    el.innerHTML = `<div class="box">${head}${note ? `<div class="note">${esc(note)}<span class="sig">— Nico${draft ? '<span class="draft">draft</span>' : ''}</span></div>` : ''}
${c.items.map((id, i) => `${P.group && P.group(id) && (i === 0 || P.group(c.items[i - 1]) !== P.group(id)) ? `<h3 class="grp">${esc(P.group(id))}</h3>` : ''}<div class="card" data-item="${esc(id)}"><h4>${esc(P.label(id))}</h4><p class="ln">${esc(P.line(id))}</p>${P.body(id)}
<div class="score"><small>your score</small>${[0, 1, 2, 3, 4, 5].map(n => `<button data-score="${n}" class="${cur.scores[id] === n ? 'on' : ''}"${sent ? ' disabled' : ''}>${n}</button>`).join('')}${avg(id)}</div>
${sent ? '' : `<textarea maxlength="300" data-note="${esc(id)}" placeholder="what would you change? (optional)">${esc(cur.notes[id] || '')}</textarea>`}</div>`).join('')}
<div class="ft">${sent ? `<span class="msg">✓ sent. thank you!! 🧪 the maker reads every one</span>` : `<button class="send" data-a="send"${cur.sending || !Object.keys(cur.scores).length ? ' disabled' : ''}>send my scores</button><span class="muted">${Object.keys(cur.scores).length}/${c.items.length} scored · no name or email needed</span>`}
${cur.msg ? `<span class="msg">${esc(cur.msg)}</span>` : ''}<span class="muted" style="margin-left:auto"><a href="privacy.html#reviews" target="_blank" rel="noopener" style="color:inherit">what’s kept</a></span></div></div>`;
  }
  async function send() {
    if (!cur || cur.sent || cur.sending) return; const { rid } = cur, scores = { ...cur.scores }, notes = {};
    for (const [k, v] of Object.entries(cur.notes)) if (String(v || '').trim() && cur.cfg.items.includes(k)) notes[k] = String(v).trim().slice(0, 300);
    if (!Object.keys(scores).length) { cur.msg = 'score at least one, please'; return render(); }
    cur.sending = true; cur.msg = ''; render();
    try { const r = await fetch('/lab/review/' + encodeURIComponent(rid), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scores, notes, bkey: bkey() }) }); const j = await r.json().catch(() => ({}));
      if (r.status === 409) j.ok = j.already = true;   // this browser already sent this review (its key's hash is on the server)
      if (!r.ok && r.status !== 409 || !j.ok) throw new Error(j.error || ('the scientists are not answering (' + r.status + ')'));
      if (!cur || cur.rid !== rid) return; const rec = { t: Date.now(), scores }; const all = sentAll(); all[rid] = rec; sv(SENT, all); cur.sent = rec; cur.totals = j.totals || null;
      const b = ld(BADGE, null) || { since: Date.now(), rids: [] }; if (!b.rids.includes(rid)) b.rids.push(rid); sv(BADGE, b);
      mark(j.already ? 'rv_already' : 'rv_sent');
      try { window.__notify && window.__notify({ kind: 'system', text: '🧪 reviewer: thank you! your scores went to the maker', ttl: 6000 }); } catch (e) {}
      try { window.__oracleSay && window.__oracleSay('the scientists got your scores. you are a reviewer now 🧪'); } catch (e) {}
    } catch (e) { if (cur) cur.msg = String(e.message || e); }
    if (cur) { cur.sending = false; render(); } }

  el.addEventListener('click', e => {
    if (e.target === el) return close(); const b = e.target.closest('button'); if (!b || !cur) return;
    if (b.dataset.a === 'close') return close(); if (b.dataset.a === 'send') return send();
    const card = b.closest('.card'), id = card && card.dataset.item;
    if (b.dataset.play && id) { const P = PLUGINS[cur.cfg.kind]; stopPlaying(); const h = P.play && P.play(id, card); if (h) { playing = h; card.classList.add('playing'); mark('rv_play'); } return; }
    // a score changes only its own buttons and the send row (a full render would replace the canvas of a logo that is playing)
    if (b.dataset.score != null && id && !cur.sent) { const n = +b.dataset.score; if (cur.scores[id] === n) delete cur.scores[id]; else cur.scores[id] = n;
      card.querySelectorAll('[data-score]').forEach(x => x.classList.toggle('on', cur.scores[id] === +x.dataset.score));
      const k = Object.keys(cur.scores).length, sb = el.querySelector('.send'), m = sb && sb.nextElementSibling; if (sb) sb.disabled = !k || cur.sending; if (m) m.textContent = `${k}/${cur.cfg.items.length} scored · no name or email needed`; }
  });
  el.addEventListener('input', e => { const t = e.target; if (cur && t.dataset && t.dataset.note) cur.notes[t.dataset.note] = t.value.slice(0, 300); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && cur) { e.stopPropagation(); close(); } }, true);

  // the list for 🧪 (open reviews), cached a minute
  let listC = null, listT = 0;
  async function list() { if (listC && Date.now() - listT < 60e3) return listC;
    try { const r = await fetch('/lab/reviews', { cache: 'no-store' }); const j = await r.json(); if (r.ok && Array.isArray(j.reviews)) { listC = j.reviews; listT = Date.now(); return listC; } } catch (e) {}
    return Object.entries(FALLBACK).map(([rid, c]) => ({ rid, kind: c.kind, title: c.title, n: c.items.length })); }

  // ?review=<rid>: open once the world is up and nothing else holds the screen (the intro, the storyline's dark, a trip)
  const want = new URLSearchParams(location.search).get('review');
  if (want) { const t0 = Date.now(); const wait = () => { const busy = !window.__restoredOrFresh || document.documentElement.classList.contains('booting') || !!document.querySelector('#idleIntro') || !!window.__genesisVoid || !!window.__traveling;
    if (busy && Date.now() - t0 < 90e3) return setTimeout(wait, 400); open(want, 'link'); }; setTimeout(wait, 300); }

  window.__reviews = { open, close, list, state: () => cur && { rid: cur.rid, kind: cur.cfg && cur.cfg.kind, items: cur.cfg ? cur.cfg.items.slice() : [], scores: { ...cur.scores }, sent: !!cur.sent, msg: cur.msg, playing: !!playing },
    sent: rid => !!sentAll()[rid], hasKey: () => { try { return /^[a-z2-7]{26}$/.test(localStorage.getItem(BKEY) || ''); } catch (e) { return false; } }, badge: () => { const b = ld(BADGE, null); return b && b.rids && b.rids.length ? b : null; }, plugins: () => Object.keys(PLUGINS) };
})();
