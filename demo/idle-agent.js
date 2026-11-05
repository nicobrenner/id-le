// idle-agent.js: bring your own agent (Nov 4; Nico: "do we need an MCP? … a lot of times a skill might be simpler"). No MCP: a skill
// file (/agent/SKILL.md) and a plain HTTP API (/lab/agent/*, helper/worker.js). The player opens 🔮 Oracle → "connect an agent", reads what
// an agent can do and clicks "allow"; this tab gets a 6-letter code (10 minutes) to give to their agent (Claude Code, a script, anything
// that speaks HTTP). Once paired, this tab polls the relay about once a second: it hands over a compact world summary (never the world
// file, never chat history or keys) and runs what the agent asks through the same verbs as the Operator's tools and the ⚡ chips
// (window.__idleAI.runTool), then answers. "disconnect" ends it at once; so does closing the tab. Staging and local copies only, until
// Nico's go (AGENT_ON_PROD).
(() => {
  const AGENT_ON_PROD = false;
  const h = location.hostname, devHost = /^staging\./.test(h) || h === 'localhost' || h === '127.0.0.1';
  if (!devHost && !AGENT_ON_PROD) return;
  const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AI = () => window.__idleAI, W = () => window.__idleWorld, G = () => window.__genesis, M = () => window.__music;
  const genPend = () => { try { return !!(G() && G().genPending && G().genPending()); } catch (e) { return false; } };
  // what an agent may ask for; during Genesis only the ones that change nothing (the story builds the world, not the agent)
  const ACTIONS = {
    look: { safe: true, help: 'look {near?}: the world near a creature or the camera', run: a => AI().runTool('look', { near: a.near }) },
    creature: { safe: true, help: "creature {name}: one creature's card", run: a => AI().runTool('creature', { name: a.name }) },
    say: { safe: true, help: 'say {text}: a line in the Operator chat, as 🤖 agent', run: a => { const t = String(a.text || '').trim().slice(0, 200); if (!t) return { error: 'say needs text' }; line('🤖 agent:', t, 'agent'); return { ok: true }; } },
    weather: { help: 'weather {kind, strength?}: clear, bitrain, static, fog, wind, hum, storm', run: a => AI().runTool('weather', { kind: a.kind, strength: a.strength }) },
    spawn: { help: 'spawn {kind}: crawly, tok or a special job (namer, blursort, crawler, debug, designer, counter, math, sorter)', run: a => AI().runTool('spawn', { kind: a.kind }) },
    rename: { help: 'rename {name, new_name}', run: a => AI().runTool('rename', { name: a.name, new_name: a.new_name }) },
    evolve: { help: 'evolve {name|"world", how?: mutate|big}', run: a => AI().runTool('evolve', { name: a.name, how: a.how }) },
    rave: { help: 'rave {on: true|false}', run: a => { const m = M(); if (!m) return { error: 'no music deck here' }; if (a.on === false || a.on === 'off') m.setRave(false); else m.setRave(true); return { ok: true, rave: m.rave() }; } },
    say_as: { help: 'say_as {name, text}: a creature says a short line (a speech bubble and a line in its mind; under 140 characters, in character)', run: a => AI().runTool('say_as', { name: a.name, text: a.text }) },
    show: { help: "show {name}: fly the player's view to a creature and open its card", run: a => AI().runTool('open_card', { name: a.name }) },
    note: { help: 'note {text}: pin a short note in 💬 IRC (the world chat) for the player', run: a => AI().runTool('note', { text: String(a.text || '').slice(0, 300) }) },
    feed: { help: 'feed {words: [..up to 12], near?}: drop words on the floor for the creatures', run: a => AI().runTool('place_words', { words: [].concat(a.words || []).slice(0, 12).map(String), near: a.near }) },
  };
  // a line in the Operator chat the player is looking at: your own AI's thread, or the lab's (the coding-agent relay, the default)
  // (the label goes in the line itself: the Operator's thread shows lines as bubbles and hides the speaker's name)
  const line = (who, text, cls) => { const t = who + ' ' + text, lab = $('#lab'); if (lab && lab.classList.contains('ai')) return AI().add(who, t, cls);
    const th = $('#lab-thread'); if (!th) return; const d = document.createElement('div'); d.className = 'lab-row ' + cls; d.textContent = t; th.appendChild(d); th.scrollTop = 1e9; };
  const allowed = () => Object.keys(ACTIONS).filter(k => !genPend() || ACTIONS[k].safe);

  let S = null;   // { sid, code, paired, t0 }
  let timer = 0, results = [], lastEv = null, ui = null, pill = null, failures = 0;
  const post = (op, body) => fetch('/lab/agent/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());

  function state() {
    let sum = {}; try { sum = W().summary({ limit: 20 }) || {}; } catch (e) {}
    let gs = null; try { const u = G() && G().unlocks(); gs = u ? { story: !!u.story, epoch: u.epoch, genesis: genPend() } : null; } catch (e) {}
    const cr = (sum.nearby_creatures || []).map(c => ({ name: c.name, family: c.family, job: c.job, mood: (c.feels && c.feels[0] || '').split(' ')[0] || c.state, state: c.state }));
    return { weather: sum.weather, rave: !!(M() && M().rave && M().rave()), counts: sum.counts, families: sum.families, creatures: cr, story: gs,
      recent_events: (sum.recent_events || []).filter(e => !NOISE.has(e.type)).slice(-8), allowed_actions: allowed(), actions_help: Object.fromEntries(allowed().map(k => [k, ACTIONS[k].help])) };
  }
  const NOISE = new Set(['arena_decide', 'arena_work']);   // a creature's every decision: too many to be news
  // world events since the last poll (the summary keeps the last 12, without times: what comes after the last one already seen is new)
  function newEvents() { let ev = []; try { ev = (W().summary({ limit: 1 }).recent_events || []).map(e => JSON.stringify(e)); } catch (e) {}
    const first = lastEv === null; const at = first ? ev.length - 1 : ev.lastIndexOf(lastEv); if (ev.length) lastEv = ev[ev.length - 1]; if (first) return [];
    return ev.slice(at + 1).map(x => JSON.parse(x)).filter(e => !NOISE.has(e.type)).map(e => ({ kind: 'world', who: e.who || '', text: [String(e.type || '').replace(/^arena_/, ''), e.what].filter(Boolean).join(' ') })); }

  async function run(c) {
    const A = ACTIONS[c.action]; let r;
    if (!A) r = { error: 'unknown action ' + c.action + '; allowed: ' + allowed().join(', ') };
    else if (!allowed().includes(c.action)) r = { error: 'not during Genesis: the story is building the world. Allowed now: ' + allowed().join(', ') };
    else { try { r = await A.run(c.args || {}); } catch (e) { r = { error: String(e.message || e) }; } }
    if (A && !A.safe && r && !r.error) { try { line('🤖 agent ·', c.action + (c.args && (c.args.kind || c.args.name) ? ' · ' + (c.args.kind || c.args.name) + (c.args.new_name ? ' → ' + c.args.new_name : '') : ''), 'agent-act'); } catch (e) {} }
    try { window.dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'agent_do', extra: { action: c.action, ok: !(r && r.error) } } })); } catch (e) {}
    results.push({ id: c.id, action: c.action, result: r });
  }
  async function tick() {
    if (!S) return;
    let r; try { r = await post('tab', { sid: S.sid, state: state(), results: results.splice(0), events: S.paired ? newEvents() : [] }); failures = 0; }
    catch (e) { if (++failures > 8) return end('the relay stopped answering'); return schedule(); }
    if (!S) return;
    if (!r || r.gone) return end('the session ended');
    if (r.paired && !S.paired) { S.paired = true; S.code = null; newEvents(); showPill(); try { line('🤖 agent', 'connected: it can see a summary of this world and act through the Operator\'s tools; disconnect any time', 'agent'); } catch (e) {} }
    if (!r.paired && r.expired && S.code) { S.code = null; }
    for (const c of r.cmds || []) await run(c);
    render(); schedule(results.length ? 50 : 0);
  }
  const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(tick, ms || (S && S.paired ? 1000 : 2000)); };
  async function allow() {
    if (S) return; let r; try { r = await post('open'); } catch (e) { r = { error: 'no relay here: run python3 server.py, or python3 tools/agent_local.py' }; }
    if (!r || !r.sid) { render((r && r.error) || 'no relay here: run python3 server.py, or python3 tools/agent_local.py'); return; }
    S = { sid: r.sid, code: r.code, paired: false, t0: Date.now(), exp: Date.now() + (r.expires || 600) * 1000 }; render(); tick();
  }
  function end(why) { const s = S; S = null; clearTimeout(timer); results = []; lastEv = null;
    if (s) { post('close', { sid: s.sid }).catch(() => {}); if (s.paired) try { line('🤖 agent', 'disconnected' + (why ? ' (' + why + ')' : ''), 'agent'); } catch (e) {} }
    if (pill) pill.hidden = true; render(); }
  addEventListener('pagehide', () => { if (S) try { navigator.sendBeacon('/lab/agent/close', new Blob([JSON.stringify({ sid: S.sid })], { type: 'application/json' })); } catch (e) {} });

  function showPill() {
    if (!pill) { pill = document.createElement('div'); pill.id = 'agentPill'; pill.innerHTML = '🤖 agent connected · <button>disconnect</button>';
      pill.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:40px;z-index:2147483600;background:#0b1a12;color:#9fe8b8;border:1px solid #2e6b46;border-radius:999px;padding:4px 10px;font:12px ui-monospace,monospace';
      pill.querySelector('button').style.cssText = 'background:none;border:0;color:#ffb3a8;text-decoration:underline;cursor:pointer;font:inherit;padding:0';
      pill.querySelector('button').addEventListener('click', () => end()); document.body.appendChild(pill); }
    pill.hidden = false;
  }
  function render(err) {
    if (!ui) return; let html = `<b>4 · Connect an agent</b> (Claude Code, a script, anything that speaks HTTP). It sees a <i>summary</i> of this world (creatures' names, families, moods and jobs, the weather, counts, recent events) and can act through the Operator's own tools: weather, spawn, rename, evolve, rave, look, feed, say (as 🤖 agent), make a creature speak, show you a creature and pin a note in IRC. It never sees your world file, your chats or your keys. `;
    if (!S) html += `<button data-ag="allow">allow</button>` + (err ? ` <span class="ag-err">${esc(err)}</span>` : '');
    else if (S.paired) html += `<br>🤖 connected · <button data-ag="end">disconnect</button>`;
    else if (S.code && Date.now() < S.exp) html += `<br>Give your agent this code (good for 10 minutes, once): <code id="agentCode" style="font-size:1.3em;letter-spacing:.15em">${esc(S.code)}</code> · <button data-ag="end">cancel</button><br><small>with the skill: <code>python3 tools/idle-agent.py pair ${esc(S.code)} --site ${esc(location.origin)}</code> · instructions for agents: <a href="/agent/SKILL.md" target="_blank">/agent/SKILL.md</a></small>`;
    else html += `<br>The code expired. <button data-ag="again">new code</button>`;
    ui.innerHTML = html;
  }
  function mount() {
    const ob = $('#oracleBox .ob'); if (!ob || !AI()) return false;
    ui = document.createElement('div'); ui.className = 'opt'; ui.id = 'agentOpt'; ob.appendChild(ui);
    ui.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.ag; if (a === 'allow') allow(); else if (a === 'end') end(); else if (a === 'again') { end(); allow(); } });
    render(); return true;
  }
  if (!mount()) addEventListener('load', mount, { once: true });
  window.__idleAgent = { allow, end, state, session: () => S && { paired: S.paired, code: S.code }, actions: () => allowed(), ACTIONS: Object.keys(ACTIONS) };
})();
