// idle-slash.js: slash commands (Nov 3, Nico: ""/oracle" omg, I love this feature.... open/close windows from the chat with /deck,
// or /music, or /stats, or /ocean, or /find Craw*"). Typed in the Operator's chat (#lab-text), in 💬 IRC (#chat) or in a creature's
// mind chat (#whisperIn): "/" opens a small list above the input (name, what it takes, one line), filtered as you type; ↑/↓, Tab and
// Enter on a keyboard, a tap on a phone, Esc closes it. Enter on "/name args" runs the command and nothing else sees the line.
// Explicit syntax only, no intent routing: a line that doesn't start with "/" goes where it always went (the Operator, IRC, the
// creature). Panels toggle (open if closed, closed if open); world commands go through the Operator's own tools (__idleAI.runTool),
// so the rate limits, the logs and the stats are the same as when the Operator does it. Scope per chat (Nico, via the manager): the
// Operator's chat has everything; IRC everything that isn't about one creature, and world commands echo in the channel; a creature's
// mind chat has the window toggles plus /find, /card, /rename and /evolve for that creature. /help lists only what works where you are.
// In the storyline, a command follows the same unlock table as the buttons (__genesis.unlocks()): in Genesis only the harmless ones
// (/help, /pedia, /settings, /scientists…); /weather once weather is unlocked, and so on. In the playground everything is there.
// Each command run marks a once-per-browser funnel moment ('sc_<name>', or 'sc_unknown'): aggregate, no text.
// API: IdleSlash.list(where) → [{ name, aliases, args, desc }] available right now (where: 'operator' | 'irc' | 'mind'), for the ⚡
// quick actions; IdleSlash.run('/music', where) runs one; IdleSlash.commands is the table.
(() => {
  const $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const INPUTS = { 'lab-text': 'operator', chat: 'irc', whisperIn: 'mind' };
  const ALL = ['operator', 'irc', 'mind'];
  const AI = () => window.__idleAI, W = () => window.__idleWorld, G = () => window.__genesis;
  const mark = k => { try { window.__funnel && window.__funnel.mark(k); } catch (e) {} };
  const click = sel => { const b = $(sel); if (!b) return false; b.click(); return true; };
  const isOn = sel => { const b = $(sel); return !!(b && b.classList.contains('on')); };
  const tool = async (name, input) => { const a = AI(); if (!a || !a.runTool) return { error: 'the Operator is not ready yet' }; try { return await a.runTool(name, input); } catch (e) { return { error: String(e.message || e) } } };
  const said = r => r && r.error ? r.error : null;

  // weather words → the world's weather kinds (the Operator's 'weather' tool)
  const WEATHER = { rain: 'bitrain', bitrain: 'bitrain', sun: 'clear', sunny: 'clear', clear: 'clear', storm: 'storm', fog: 'fog', foggy: 'fog', wind: 'wind', windy: 'wind', static: 'static', hum: 'hum' };
  const SPAWN = ['crawly', 'tok', 'namer', 'blursort', 'crawler', 'debug', 'designer', 'counter', 'math', 'sorter'];
  // "Craw*" → every creature whose name matches (case-insensitive; * is any run of characters, ? one character); a repeated /find
  // with the same pattern moves on to the next match
  let findAt = { q: '', i: -1 };
  const glob = q => new RegExp('^' + q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + (/[*?]/.test(q) ? '$' : ''), 'i');

  // lock: the unlock-table key that has to be open in the storyline (idle-genesis.js UNLOCK); story: false = never in the storyline
  // where: the chats a command works in (the Operator's chat has everything; IRC is shared, so a command that changes the world shows
  // in the channel as "you: ran /weather rain"; a creature's mind chat has the window toggles and the commands about that creature,
  // which default to it). world: true = it changes the world.
  const OP_IRC = ['operator', 'irc'], WIN = ALL;
  const me = ctx => ctx && ctx.creature;   // the creature whose mind chat this is
  const C = [
    { name: 'help', aliases: ['?', 'commands'], args: '', where: WIN, desc: 'the commands you can use in this chat', run: (a, ctx) => ({ say: 'commands here: ' + list(ctx.where).map(c => '/' + c.name + (c.args ? ' ' + c.args : '')).join(' · ') }) },
    { name: 'operator', aliases: ['op', '📟'], args: '', where: WIN, desc: 'open or close the 📟 Operator', run: () => { const O = window.__opwin; if (O && O.isOpen) { if (O.isOpen()) O.close(); else O.open(); } else click('#toHandle'); return {}; } },
    { name: 'pedia', aliases: ['wiki'], args: '', where: WIN, desc: 'open the Id|le-pedia', run: () => (click('#pediaBtn'), { say: '📖 the Id|le-pedia is open in its own tab' }) },
    { name: 'story', aliases: ['📖', 'storyline'], args: '', where: WIN, desc: 'the storyline: start it, or resume / restart yours', run: () => { const g = G(); const r = g && g.storyRow ? g.storyRow() : false; return r === 'start' ? { say: '📖 starting the story' } : r ? {} : { say: 'the storyline is not out here yet' }; } },   // v16 (⚙ 📖 Storyline's modal)
    { name: 'settings', aliases: ['⚙', 'prefs'], args: '', where: WIN, lock: 'settings', desc: 'open or close ⚙ settings', run: () => (click('#settingsBtn'), {}) },
    { name: 'scientists', aliases: ['🧪', 'tell', 'feedback'], args: '', where: WIN, lock: 'scientists', desc: 'tell the scientists: an idea, a bug, something you loved', run: () => { const F = window.__feedback; if (!F) return { say: 'not here yet' }; if (isOn('#oracleBtn')) F.close(); else F.open('tell'); return {}; } },
    { name: 'roadmap', aliases: ['vote'], args: '', where: WIN, lock: 'scientists', desc: 'what comes next, and your vote', run: () => { const F = window.__feedback; if (!F) return { say: 'not here yet' }; if (isOn('#oracleBtn')) F.close(); else F.open('road'); return {}; } },
    { name: 'hitl', aliases: ['🌱', 'reviews'], args: '', where: WIN, when: () => !!window.__reviews, desc: 'open or close 🌱 the Humans in the Loop: your reviews', run: () => { const R = window.__reviews, T = R.tab; if (T && T.open) { if (T.isOpen && T.isOpen()) T.close(); else T.open(); } else if (R.open) R.open('logos'); return {}; } },
    { name: 'oracle', aliases: ['🔮', 'ai'], args: '', where: WIN, story: false, desc: 'the Oracle: bring your own AI', run: () => { const O = window.__oracleBox; if (!O) return { say: 'the Oracle is not here' }; if (O.isOpen()) O.close(); else O.open('command'); return {}; } },
    { name: 'music', aliases: ['🎧'], args: '',   // takes no word in the list (its chip runs it); /music off still works
      where: WIN, lock: 'music', desc: 'open or close the music: the background and the DJ deck (/music off: no music; during a rave it ends it)', run: a => { const M = window.__music;
      if (String(a || '').trim().toLowerCase() === 'off' && M) { if (M.rave()) { M.setRave(false); return { say: '🔇 rave off, the music is back to how it was' }; } M.setSource('off'); return { say: '🔇 music off' }; } click('#djBtn'); return {}; } },
    { name: 'deck', aliases: ['dj'], args: '', where: WIN, lock: 'music', desc: 'the DJ deck (in the music panel)', run: () => (click('#djBtn'), {}) },
    { name: 'stats', aliases: ['📊', 'advisor'], args: '', where: WIN, lock: 'advisor', desc: 'the advisor: how your creatures are doing', run: () => (click('#advBtn'), {}) },
    { name: 'ocean', aliases: ['🌊', 'lake', 'almanac'], args: '', where: WIN, lock: 'almanac', desc: "the almanac, the data lake: your worlds' history and trends", run: () => (click('#almanacBtn'), {}) },
    { name: 'find', aliases: ['where'], args: '<name, * = anything>', where: WIN, lock: 'creatures', desc: 'fly to a creature and open its card (/find Craw*)', run: async (a, ctx) => {
      const q = a.trim() || me(ctx) || ''; if (!q) return { say: 'find who? e.g. /find Craw*' };
      const A = window.__arena, all = A && A.raw ? A.raw().filter(c => c && c.name && !c.lab && !c.guest) : []; const re = glob(q), hits = all.filter(c => re.test(c.name));
      if (!hits.length) return { say: `nobody called "${q}" here` };
      findAt = findAt.q === q.toLowerCase() ? { q: findAt.q, i: (findAt.i + 1) % hits.length } : { q: q.toLowerCase(), i: 0 };
      const c = hits[findAt.i], r = await tool('open_card', { name: c.name }); return { say: said(r) || `🔎 ${c.name}${hits.length > 1 ? ` (${findAt.i + 1} of ${hits.length}: /find ${q} again for the next)` : ''}` }; } },
    { name: 'card', aliases: ['🪪'], args: '', where: ['mind'], lock: 'creatures', desc: "fly to this creature and show its card", run: async (a, ctx) => { const n = me(ctx); if (!n) return { say: 'whose card?' }; const r = await tool('open_card', { name: n }); return { say: said(r) || `🪪 ${n}` }; } },
    { name: 'rename', aliases: ['✎'], args: '<new name>', where: ['mind'], lock: 'creatures', desc: 'give this creature a new name (its friends and memories follow)', run: async (a, ctx) => { const n = me(ctx), nn = a.trim().slice(0, 24); if (!n) return { say: 'rename who?' }; if (!nn) return { say: 'rename it to what? e.g. /rename Pip' };
      const r = await tool('rename', { name: n, new_name: nn }); return { say: said(r) || `✎ ${n} is ${nn} now` }; } },
    { name: 'weather', aliases: ['☁'], args: '<rain|sun|storm|fog|wind|static|hum>', where: OP_IRC, world: true, lock: 'weather', desc: 'set the weather', run: async a => {
      const k = WEATHER[a.trim().toLowerCase()]; if (!k) return { say: (a.trim() ? `no "${a.trim()}" weather here (yet). ` : '') + 'try: rain, sun, storm, fog, wind, static or hum' };
      const r = await tool('weather', { kind: k }); return { say: said(r) || `☁ ${a.trim().toLowerCase()}` }; } },
    { name: 'evolve', aliases: ['🧬'], args: '[name]', where: WIN, world: true, lock: 'evolve', desc: 'evolve a creature (in its mind chat: this one), or the whole world', run: async (a, ctx) => { const n = a.trim() || me(ctx) || 'world'; const r = await tool('evolve', { name: n }); return { say: said(r) || `🧬 evolving ${n === 'world' ? 'the world' : n}` }; } },
    { name: 'rave', aliases: ['🕺'], args: '[on|off]', where: OP_IRC, world: true, lock: 'music', desc: 'rave on or off (no word: toggle): the deck plays, the creatures dance', run: a => { const M = window.__music; if (!M) return { say: 'no music deck here' };
      const w = String(a || '').trim().toLowerCase(), off = w === 'off' || w === 'stop' || (!w && M.rave() && M.playing);
      if (off) { M.setRave(false); return { say: '🔇 rave off' }; } M.setRave(true); return { say: '🕺 rave on · 🎧 open the deck to DJ' }; } },
    { name: 'spawn', aliases: ['new'], args: '[crawly|tok|namer|…]', where: OP_IRC, world: true, lock: 'creatures', desc: 'a new creature near you (/new creature)', run: async a => {
      const k = a.trim().toLowerCase().replace(/^creature\s*/, '') || 'crawly'; if (!SPAWN.includes(k)) return { say: 'a new what? try: ' + SPAWN.join(', ') };
      const r = await tool('spawn', { kind: k }); return { say: said(r) || `✦ a new ${k}` }; } },
    { name: 'name', aliases: ['rename-world'], args: '<world name>', where: OP_IRC, world: true, lock: 'creatures', desc: 'name this world', run: a => { const n = a.trim().slice(0, 26); if (!n) return { say: 'name it what? e.g. /name Lumen' };
      const P = window.__places, w = W(); const ok = P && P.rename && P.rename(w && w.placeId ? w.placeId() : 'home', n); return { say: ok ? `✎ this world is called ${n} now` : 'this world cannot be renamed here' }; } },
  ];
  const cardName = () => { const w = $('#whisper'), n = w && getComputedStyle(w).display !== 'none' && w.querySelector('.chead .cnm'); return n ? n.textContent.trim() || null : null; };
  const byName = n => { n = String(n || '').toLowerCase(); return C.find(c => c.name === n || (c.aliases || []).includes(n)); };

  // what the storyline allows right now (null outside the storyline: everything)
  const story = () => { try { const u = G() && G().unlocks && G().unlocks(); return u && u.story ? u : null; } catch (e) { return null; } };
  function why(c) {   // null when the command can run, else a short reason
    if (c.when && !c.when()) return 'not here yet';
    const u = story(); if (!u) return null;
    if (c.story === false) return 'not in the storyline';
    if (c.lock && (u.hidden || []).includes(c.lock)) return 'it unlocks later in the story';
    return null;
  }
  function list(where) { return C.filter(c => c.where.includes(where || 'operator') && !why(c)).map(c => ({ name: c.name, aliases: c.aliases || [], args: c.args || '', desc: c.desc })); }

  // ---------- the result note above the input, and the Operator's own line in its chat ----------
  let note = null, noteT = 0;
  function tell(text, where, input) {
    if (!text) return;
    if (where === 'operator' && window.__opwin && window.__opwin.say) { try { window.__opwin.say(text); return; } catch (e) {} }
    if (where === 'operator' && AI() && AI().add) { try { AI().add('TO', text, 'ai'); return; } catch (e) {} }
    if (where === 'irc' && window.__ircSay) { try { window.__ircSay('lab', text, 'lab'); return; } catch (e) {} }
    if (!note) { note = document.createElement('div'); note.id = 'slashNote'; document.body.appendChild(note); }
    note.textContent = text; place(note, input); note.classList.add('on'); clearTimeout(noteT); noteT = setTimeout(() => note.classList.remove('on'), 4500);
  }
  function place(el, input) {
    const r = input && input.getBoundingClientRect ? input.getBoundingClientRect() : { left: 16, top: innerHeight - 60, width: 300 };
    const W_ = Math.min(Math.max(r.width, 260), innerWidth - 16); el.style.width = W_ + 'px';
    el.style.left = Math.max(8, Math.min(r.left, innerWidth - W_ - 8)) + 'px'; el.style.bottom = Math.max(8, innerHeight - r.top + 6) + 'px';
  }

  // ---------- run ----------
  async function run(line, where, input) {
    const m = /^\/(\S+)\s*([\s\S]*)$/.exec(String(line || '').trim()); if (!m) return false;
    const c = byName(m[1]);
    if (!c || !c.where.includes(where)) { mark('sc_unknown'); const near = suggest(m[1], where); tell(`there's no /${m[1]}${near.length ? '. did you mean ' + near.map(n => '/' + n).join(', ') + '?' : ''} (/help lists them all)`, where, input); return true; }
    const no = why(c); if (no) { tell(`/${c.name}: ${no}`, where, input); return true; }
    mark('sc_' + c.name);
    const ctx = { where, input, creature: where === 'mind' ? cardName() : null };
    // IRC is shared: a command that changes the world shows in the channel, like any other line of yours
    if (where === 'irc' && c.world && window.__ircSay) { try { window.__ircSay('you', ('ran /' + c.name + ' ' + (m[2] || '')).trim(), 'you'); } catch (e) {} }
    try { const r = await c.run(m[2] || '', ctx); if (r && r.say) tell(r.say, where, input); } catch (e) { tell(`/${c.name} didn't work: ${e.message || e}`, where, input); }
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'slash', extra: { cmd: c.name, where } } })); } catch (e) {}
    return true;
  }
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  function suggest(w, where) { w = w.toLowerCase(); return list(where).map(c => ({ n: c.name, d: Math.min(...[c.name, ...c.aliases].map(x => x.startsWith(w) || w.startsWith(x) ? 0 : lev(w, x))) })).filter(x => x.d <= 2).sort((a, b) => a.d - b.d).slice(0, 3).map(x => x.n); }

  // ---------- the list above the input ----------
  const css = document.createElement('style');
  css.textContent = `#slashList,#slashNote{position:fixed;z-index:2147482500;font:13px/1.35 var(--ui-font,system-ui),system-ui,sans-serif;background:#0d0f1cf2;color:#e8e9f3;border:1px solid #6b7cff66;border-radius:10px;box-shadow:0 6px 24px #0008}
#slashList{max-height:min(46vh,320px);overflow:auto;padding:4px;display:none}#slashList.on{display:block}
#slashList .it{display:flex;gap:8px;align-items:baseline;padding:6px 8px;border-radius:7px;cursor:pointer}#slashList .it.sel,#slashList .it:hover{background:#2b3570}
#slashList .n{font-weight:600;white-space:nowrap;color:#fff}#slashList .a{color:#9aa3d8;white-space:nowrap;font-size:12px}#slashList .d{color:#c3c7e6;font-size:12px;overflow:hidden;text-overflow:ellipsis}
#slashList .hd{padding:3px 8px 5px;color:#8b92c8;font-size:11px;letter-spacing:.04em}
#slashNote{padding:8px 11px;opacity:0;pointer-events:none;transition:opacity .25s}#slashNote.on{opacity:1}
@media (max-width:600px){#slashList,#slashNote{font-size:15px}#slashList .it{padding:9px 8px}#slashList .d{display:block;white-space:normal}#slashList .it{flex-wrap:wrap}}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'slashList'; box.setAttribute('role', 'listbox');
  const mountBox = () => { if (!box.isConnected && document.body) document.body.appendChild(box); };
  if (document.body) mountBox(); else addEventListener('DOMContentLoaded', mountBox);
  let items = [], sel = 0, cur = null;
  const whereOf = el => el && INPUTS[el.id];
  function show(input) {
    const where = whereOf(input), v = input.value; cur = input;
    const m = /^\/(\S*)(\s?)/.exec(v); if (!m || /\n/.test(v)) return hide();
    const w = m[1].toLowerCase();
    if (m[2]) { const c = byName(w); items = c && !why(c) && c.where.includes(where) ? [c] : []; }   // typing the arguments: just that command's hint
    else items = C.filter(c => c.where.includes(where) && !why(c) && (!w || c.name.startsWith(w) || (c.aliases || []).some(a => a.startsWith(w))));
    if (!items.length) return hide();
    sel = Math.min(sel, items.length - 1);
    box.innerHTML = `<div class="hd">commands · Enter runs · Tab completes · Esc closes</div>` + items.map((c, i) => `<div class="it${i === sel ? ' sel' : ''}" role="option" data-i="${i}"><span class="n">/${esc(c.name)}</span>${c.args ? `<span class="a">${esc(c.args)}</span>` : ''}<span class="d">${esc(c.desc)}</span></div>`).join('');
    place(box, input); box.classList.add('on');
    const s = box.querySelector('.it.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }
  function hide() { box.classList.remove('on'); items = []; sel = 0; }
  const open = () => box.classList.contains('on') && items.length;
  function complete(input, c) { input.value = '/' + c.name + (c.args ? ' ' : ''); input.dispatchEvent(new Event('input', { bubbles: true })); try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {} }
  async function pick(input, c) {   // a tap or Enter on an item: complete it, and run it straight away only when it takes nothing
    if (c.args) { complete(input, c); input.focus(); return; }
    hide(); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await run('/' + c.name, whereOf(input), input);
  }
  box.addEventListener('mousedown', e => e.preventDefault());   // keep the focus in the input
  box.addEventListener('click', e => { const it = e.target.closest('.it'); if (!it || !cur) return; pick(cur, items[+it.dataset.i]); });

  document.addEventListener('input', e => { const t = e.target; if (!whereOf(t)) return; if (/^\//.test(t.value)) show(t); else hide(); }, true);
  document.addEventListener('focusout', e => { if (whereOf(e.target)) setTimeout(() => { if (!whereOf(document.activeElement)) hide(); }, 150); }, true);
  addEventListener('resize', () => { if (open() && cur) place(box, cur); });
  // capture phase on the document: runs before the inputs' own Enter handlers (the Operator, IRC, the creature), which never see a command
  document.addEventListener('keydown', e => {
    const t = e.target, where = whereOf(t); if (!where || e.isComposing) return;
    if (open()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; show(t); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); return; }
      if (e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); complete(t, items[sel]); return; }
    }
    if (e.key !== 'Enter' || e.shiftKey) return;
    const v = t.value.trim(); if (!/^\/\S/.test(v)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // Enter on a partly typed name with the list open: the highlighted command (e.g. "/mu" → /music)
    const m = /^\/(\S+)$/.exec(v); if (open() && m && !byName(m[1]) && items[sel]) { pick(t, items[sel]); return; }
    hide(); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); run(v, where, t);
  }, true);

  // the Operator's send button (on a phone, the usual way to send): a command line runs here instead of going to the Operator
  document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('#lab-send'); if (!b) return; const t = $('#lab-text'), v = t && t.value.trim();
    if (!v || !/^\/\S/.test(v)) return; e.preventDefault(); e.stopImmediatePropagation(); hide(); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); run(v, 'operator', t); }, true);

  window.IdleSlash = { list, run: (line, where) => run(line, where || 'operator', document.getElementById(Object.keys(INPUTS).find(k => INPUTS[k] === (where || 'operator')))), commands: C.map(c => ({ name: c.name, aliases: c.aliases || [], args: c.args || '', desc: c.desc, where: c.where, world: !!c.world, lock: c.lock || null, story: c.story !== false })), why: n => { const c = byName(n); return c ? why(c) : 'unknown'; } };
})();
