// idle-director.js: the Director's view (Nov 4, Nico: "a 'Director's view' or 'Producer's view/mode'… see the whole storyboard/outline/index of the
// story mode… a sort of tree… for reviewing and playback"). Phase 1, read-only, staging and local copies only (on id-le.com it shows nothing).
// The tree is not a copy of the script: a hidden, sandboxed game page (arena.html?storydump: plays nothing, writes nothing) loads the real
// modules, and each one hands over its own constants through window.__storyDump (idle-boot.js, idle-epoch0.js, idle-genesis.js, idle-keys.js).
// Change a line in the code and it changes here. ▶ plays any scene from its keyframe in the frame on the right (the keyframes' sandbox).
// The producer's overlay (📊) puts the storyline's funnel next to each scene, from a JSON made by tools/director_stats.py (loaded from a file:
// the numbers never go through a public endpoint).
(() => {
  const h = location.hostname, devHost = /^staging\./.test(h) || h === 'localhost' || h === '127.0.0.1';
  const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!devHost) { $('#note').textContent = 'the director’s view lives on staging and local copies only'; return; }
  // the epochs to come (storyline-script.md section D, v16 order): what each one will teach, as placeholders
  const FUTURE = { 1: 'Attention: meet the creatures (tap one, read its mind, name it, feed it)', 2: 'Feelings', 3: 'Words: tokens, vocabulary',
    4: 'Growth: evolve, family trees', 5: 'Reasoning', 6: 'Memory: reels, dreams', 7: 'Senses: Wikipedia, travel', 8: 'Self: the data lab, the Oracle', 9: 'Autonomy: the consciousness lives on its own' };
  // which funnel moment (helper/worker.js 'sf') each scene's keyframe stands for, in play order
  const STEP = { title: 'title', computer: 'messages', labchat: 'chat', boot: 'boot', run: 'run', crash: 'crash', dark: 'landing', operator: 'operator',
    lights: 'lights', words: 'e1words', life: 'e1life', epoch0done: 'e1done', epoch1: 'e0_start1' };
  const FLOW = Object.keys(STEP);
  let D = null, PF = null, pfOn = false;

  // ---------- the data, from the game's own modules
  function load() {
    const f = $('#dumpFrame'); f.src = 'arena.html?storydump';
    const t0 = Date.now(), poll = () => { let w = null; try { w = f.contentWindow; } catch (e) {}
      const d = w && w.__storyDump; if (d && d.genesis && d.boot && d.epoch0 && d.keys) {
        try { D = { genesis: d.genesis(), boot: d.boot(), epoch0: d.epoch0(), keys: d.keys() }; } catch (e) { if (Date.now() - t0 < 30000) return setTimeout(poll, 300); $('#note').innerHTML = `<span id="err">couldn't read the storyline: ${esc(e.message)}</span>`; return; }
        render(); return; }   // (the hidden page stays: removing it would abort its loads mid-flight; it plays nothing and writes nothing)
      if (Date.now() - t0 > 60000) { $('#note').innerHTML = '<span id="err">the game page did not hand over its script (timeout)</span>'; return; }
      setTimeout(poll, 250); };
    poll();
  }

  // ---------- the tree: nodes are { t, k (time or tag), who, cls, play (keyframe), step (funnel), kids }
  const N = (t, o = {}) => ({ t, ...o });
  const sec = x => x == null ? '' : (Math.round(x * 10) / 10).toFixed(1) + 's';
  const line = (who, text, at, cls = 'say') => N(text, { who, k: at != null ? sec(at) : '', cls });
  const cue = (text, at) => N('♪ ' + text, { k: at != null ? sec(at) : 'sound', cls: 'cue' });
  function build() {
    const G = D.genesis, B = D.boot, E = D.epoch0, K = D.keys;
    const keyLabel = k => (K.keys.find(x => x.key === k) || K.aliases.find(x => x.key === k) || {}).label || k;
    const scene = (key, t, kids, extra = {}) => N(t, { cls: 'scene', play: key, step: STEP[key], kids, ...extra });
    const sounds = (list, scene) => list.filter(s => !scene || s.scene === scene).map(s => cue(s.cue + (s.note ? ' · ' + s.note : ''), s.at));
    const darkKids = G.dark.map(l => { const n = line('doc', l.text, null); n.k = '#' + (l.i + 1); if (l.i === G.approach) { n.play = 'dark-hole'; n.t += ''; n.kids = [N(keyLabel('dark-hole'), { cls: 'ui', play: 'dark-hole' })]; } if (l.i === G.silentAt) n.k += ' 🔇'; return n; });
    const genesis = N('Epoch 0 · Genesis', { cls: 'epoch', open: true, kids: [
      scene('title', 'the title card', [N('ø Id|le OS · press any key (auto-starts after ' + (E.autoMs / 1000) + ' s, muted, 🔊 tap for sound)', { cls: 'ui' })]),
      scene('computer', "Doc's computer · " + B.clock.day + ' ' + B.clock.start, [
        N('messages with ❤️', { kids: B.thread.map(m => line(m.who, m.text, m.at)) }),
        line('lester', B.note.text + '  (notification)', B.note.at),
        ...sounds(B.sounds.filter(s => s.at < 1))]),
      scene('labchat', 'labchat', [N('#' + B.labchat.channels[0] + ' backlog', { kids: B.labchat.backlog.map(b => line('bot', b.who + ' · ' + b.clock + ' · ' + b.text, b.at)) }),
        N('the DM with Lester', { kids: B.dm.map(l => line(l.who, l.text, l.at)) })]),
      scene('boot', 'the terminal boot', [...B.terminal.log.map(l => N(l.text + (l.status ? '  · ' + l.status : ''), { k: sec(l.at), cls: 'ui' })),
        N('$ ' + B.cmd, { k: sec(B.terminal.cmdAt), cls: 'ui' }), ...sounds(B.sounds.filter(s => s.at >= 1))]),
      scene('run', 'the training run', [...E.subs.filter(s => s.at < E.cues.over).map(s => line('doc', s.text, s.at)),
        N('the chart', { kids: E.refs.map(r => N('dotted line: ' + r.text, { cls: 'ui' })) }),
        N('proto-creatures (hints)', { kids: E.protos.map(p => N('in the ' + p.pane + ' pane', { k: sec(p.at), cls: 'ui' })) }), cue('fans follow the loss, inverted', E.cues.over)]),
      scene('crash', "the run that won't stop", [...E.subs.filter(s => s.at >= E.cues.over).map(s => line('doc', s.text, s.at)),
        ...['panic', 'spin', 'tear', 'flash'].map(k => N(k, { k: sec(E.cues[k]), cls: 'ui' })), ...sounds(E.sounds.filter(s => s.at <= E.cues.flash))]),
      scene('logo', 'the logo: Id|le, the cut', [...Object.entries(E.logoArms).map(([arm, id]) => N(id, { k: 'arm ' + arm, cls: 'ui', play: 'logo-' + arm })),
        ...sounds(E.sounds.filter(s => s.at > E.cues.flash))]),
      scene('dark', 'the dark landing', [...darkKids, ...sounds(G.sounds, 'dark')]),
      scene('operator', 'the Operator arrives', G.wake.map(t => line('op', t, null))),
      scene('lights', '"lights on"', [N('say "' + G.steps.light.say + '"', { cls: 'ui' }), line('op', G.lightsOn), N('dawn to noon · ' + (G.dawnMs / 1000) + ' s', { cls: 'ui' }), ...G.lines.light.map(t => line('op', t)), ...sounds(G.sounds, 'lights')]),
      scene('words', '"let there be words"', [line('op', G.steps.words.intro), N('first words: ' + G.firstWords.join(' '), { cls: 'ui' }), ...G.lines.first.map(t => line('op', t)), ...sounds(G.sounds, 'words')]),
      scene('life', '"let there be life"', [line('op', G.steps.creatures.intro), N('the first creatures say', { kids: G.firstLines.map(t => line('crit', t)) }), N(G.tapHint + ' (after ' + (G.life.hintAfter / 1000) + ' s)', { cls: 'ui' }),
        ...G.lines.creatures.map(t => line('op', t)), ...sounds(G.sounds, 'life')]),
      scene('epoch0done', G.moment.stamp, [N('the stamp, typed lines', { kids: G.moment.lines.map(t => line('op', t)) }),
        N('the naming ask', { play: 'naming', kids: [line('op', G.ask.name.q), N('suggested: ' + G.ask.name.pool.join(', '), { cls: 'ui' }), line('op', G.ask.name.thanks), N(G.ask.skip, { cls: 'ui' })] }),
        N('[ ' + G.moment.start + ' ]  ·  [ ' + G.moment.play + ' ]', { cls: 'ui' }), N('the playground confirm', { kids: [line('op', G.moment.confirm.q), N('[ ' + G.moment.confirm.stay + ' ] · [ ' + G.moment.confirm.go + ' ]', { cls: 'ui' })] })]),
      scene('epoch1', 'right after [start Epoch 1]: the end of what’s built', [N(G.end.head, { cls: 'ui' }), line('op', G.end.line), line('op', G.end.help), N('🛝 the playground', { kids: [line('op', G.end.free), line('op', G.end.back)] })],
        { play: 'epoch1start' })] });
    const later = Object.entries(FUTURE).map(([n, what]) => N('Epoch ' + n + ' · ' + what, { cls: 'epoch ph', kids: [N('not built yet (storyline-script.md, section D)', { cls: 'ph' })] }));
    const doors = N('ways into the story', { cls: 'epoch', kids: [
      N('the storyline offer (returning players): ' + G.offer.v3.stamp, { kids: [line('op', G.offer.v3.line), line('op', G.offer.v3.sub), N('[ ' + G.offer.v3.go + ' ] · [ ' + G.offer.v3.later + ' ]', { cls: 'ui' })] }),
      N('the playground’s welcome (arm play)', { kids: G.welcome.lines.map(t => line('op', t)).concat([N('[ ' + G.welcome.chip + ' ]', { cls: 'ui' }), line('op', G.welcome.after)]) }),
      N('nudges when a Genesis command isn’t understood', { kids: Object.entries(G.nudge).map(([k, t]) => line('op', t, null)).map((n, i) => (n.k = Object.keys(G.nudge)[i], n)) }),
      N('keyframes (every ▶ link)', { kids: K.keys.map(x => N(x.label, { k: x.key, play: x.key, cls: 'ui' })).concat(K.aliases.map(a => N(a.label, { k: a.key, play: a.key, cls: 'ui' }))) })] });
    return [genesis, ...later, doors];
  }

  // ---------- render
  const WHO = { doc: 'Doc', heart: '❤️', lester: 'Lester', op: '📟', crit: '🐛', bot: '' };
  let uid = 0;
  function li(n) {
    const id = 'n' + (++uid), kids = n.kids && n.kids.length, cls = (n.cls || '').split(' ');
    const who = n.who && n.who !== 'bot' ? `<span class="who ${n.who}">${esc(WHO[n.who] || n.who)}</span>` : '';
    const pf = n.step ? `<span class="pf" data-step="${n.step}"></span>` : '';
    return `<li class="${esc(n.cls || '')}${kids && !n.open && !cls.includes('scene') ? ' closed' : ''}${kids && cls.includes('scene') ? ' closed' : ''}" id="${id}" data-play="${esc(n.play || '')}">` +
      `<div class="row"><span class="tw">${kids ? (n.open ? '▾' : '▸') : ''}</span><span class="k">${esc(n.k || '')}</span><span class="t">${who}${esc(n.t)}</span>${pf}` +
      `${n.play ? `<button class="play" data-play="${esc(n.play)}" title="play from here">▶</button>` : ''}</div>` +
      (kids ? `<ul>${n.kids.map(li).join('')}</ul>` : '') + '</li>';
  }
  function render() {
    const tree = build(); $('#tree').innerHTML = tree.map(li).join('');
    $('#tree').querySelectorAll('li.epoch').forEach((el, i) => { if (i === 0) { el.classList.remove('closed'); el.querySelector('.tw').textContent = '▾'; } });
    const nScenes = $('#tree').querySelectorAll('li.scene').length, nLines = $('#tree').querySelectorAll('li.say').length;
    $('#note').textContent = `${nScenes} scenes · ${nLines} lines · ${D.keys.keys.length + D.keys.aliases.length} keyframes · read live from the game's code`;
    paintPF();
  }
  $('#tree').addEventListener('click', e => {
    const b = e.target.closest('button.play'); if (b) { play(b.dataset.play, b.closest('li')); return; }
    const row = e.target.closest('.row'); if (!row) return; const el = row.parentElement; if (!el.querySelector(':scope>ul')) return;
    el.classList.toggle('closed'); row.querySelector('.tw').textContent = el.classList.contains('closed') ? '▸' : '▾'; });
  const all = open => $('#tree').querySelectorAll('li').forEach(el => { if (!el.querySelector(':scope>ul')) return; el.classList.toggle('closed', !open); el.querySelector(':scope>.row .tw').textContent = open ? '▾' : '▸'; });
  $('#openAll').onclick = () => all(true); $('#closeAll').onclick = () => all(false);

  // ---------- play: the keyframe in the frame (its own sandbox: in-memory storage, nothing written, no stats)
  function play(key, el) {
    const url = 'arena.html?story&at=' + encodeURIComponent(key), f = $('#frame');
    document.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); if (el) el.querySelector(':scope>.row').classList.add('sel');
    $('#empty').hidden = true; f.hidden = false; f.src = url; $('#cur').textContent = '▶ ' + key + ' · click into the frame to start'; const a = $('#tab'); a.href = url; a.hidden = false;
    try { f.focus(); } catch (e) {}
    window.__director.playing = key;
  }

  // ---------- the producer's overlay: reached (all arms or the funnel's own), % of the scene before, mean on-screen seconds, skips
  function paintPF() { const tree = $('#tree'); tree.classList.toggle('hidden-pf', !pfOn || !PF); if (!PF || !pfOn) return;
    const reach = {}, skip = {}, sd = {}; for (const o of Object.values(PF.arms || {})) { for (const [s, n] of Object.entries(o.steps || {})) reach[s] = (reach[s] || 0) + n; for (const [s, n] of Object.entries(o.skips || {})) skip[s] = (skip[s] || 0) + n; }
    for (const [k, v] of Object.entries(PF.sd || {})) { const s = k.split('|')[1]; const o = sd[s] = sd[s] || { n: 0, sum: 0 }; if (v && v.mean != null) { o.n += v.n; o.sum += v.mean * v.n; } }
    const first = reach[STEP[FLOW[0]]] || 0;   // % of everyone who saw the title card (skipping ahead lands later scenes above the one before)
    for (const key of FLOW) { const s = STEP[key], n = reach[s] || 0, el = tree.querySelector(`.pf[data-step="${s}"]`); if (!el) continue;
      const pct = first && key !== FLOW[0] ? Math.round(100 * n / first) + '%' : '', t = sd[s] && sd[s].n ? Math.round(sd[s].sum / sd[s].n) + 's' : '', sk = skip[s === 'messages' ? 'messages' : s] || 0;
      el.innerHTML = `${n}${pct ? ` <span class="d">${pct}</span>` : ''}${t ? ' · ' + t : ''}${sk ? ' · skip ' + sk : ''}`; el.title = `browsers that reached it (${PF.window.from} .. ${PF.window.to} UTC), % of those who saw the title card, mean on-screen seconds since the moment before, skips`; } }
  $('#pfBtn').onclick = () => { pfOn = !pfOn; $('#pfBtn').setAttribute('aria-pressed', pfOn); if (pfOn && !PF) $('#pfFile').click(); paintPF(); };
  $('#pfFile').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { PF = JSON.parse(await file.text()); pfOn = true; $('#pfBtn').setAttribute('aria-pressed', true); paintPF(); } catch (er) { $('#note').textContent = 'that file is not a director_stats.json'; } };
  // local copies can pass ?stats=director_stats.json (a file next to the page; never deployed)
  const qs = new URLSearchParams(location.search).get('stats');
  if (qs && (h === 'localhost' || h === '127.0.0.1')) fetch(qs).then(r => r.json()).then(j => { PF = j; pfOn = true; $('#pfBtn').setAttribute('aria-pressed', true); paintPF(); }).catch(() => {});
  window.__director = { data: () => D, setStats: j => { PF = j; pfOn = true; paintPF(); } };
  load();
})();
