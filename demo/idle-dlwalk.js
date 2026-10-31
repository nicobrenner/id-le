// idle-dlwalk.js: a walkthrough for the data lab, in the spirit of the first five minutes (idle-first5.js). It starts the
// first time someone opens the lab, lives as a card at the top of the team panel (on phones the panel is a bottom sheet and
// pills hide behind sheets, so the card is where it can always be read), and falls back to a 🧭 pill while the panel is
// closed. Steps complete from the lab's own events where they can (a message sorted, a threshold changed, the team
// changed); the rest have "next ›". "end the walkthrough" stops it for good; "? walkthrough" in the panel starts it again.
// Remembered in this browser (idle.dlwalk). Counted in the anonymous stats as the feature 'dlwalk' and the steps reached.
(() => {
  const KEY = 'idle.dlwalk', $ = s => document.querySelector(s), now = () => Date.now();
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = () => window.__lab, N = o => window.__notify ? window.__notify(o) : { close() {} };
  let S = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const active = () => !!(S && S.active);
  const team = () => (L() && L().team ? L().team() : []);
  const nm = st => st ? `<b>${esc(st.name || st.head)}</b>` : 'a stage';
  const routerI = () => team().findIndex(t => t.role === 'route');
  const counts = () => (L() && L().counts ? L().counts() : { in: 0, routed: 0, review: 0, filtered: 0 });
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const sig = () => team().map(t => t.head + ':' + t.role).join();
  const fly = (x, y, z) => { try { window.__dis.flyTo(x, y, z || 1.1); } catch (e) {} };
  const phone = () => matchMedia('(max-width: 500px)').matches || matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const panelOn = () => { const t = $('#team'); return !!(t && t.classList.contains('on')); };
  const panel = on => { const t = $('#team'); if (t) t.classList.toggle('on', on); };
  // on a phone the panel covers the world: "show me" closes it so the world (and the step's pill) can be seen
  const look = (x, y, z) => { if (phone()) panel(false); fly(x, y, z); };

  const STEPS = [
    { k: 'what', text: () => `This is the <b>data lab</b>. Messages arrive at the 📥 <b>inbox</b>, and each creature here is a <b>real text classifier</b>: it reads a message and gives it a label.`,
      show: () => { const p = L().where && L().where(); if (p) look(p.inbox.x, p.inbox.y, 0.9); }, next: true },
    { k: 'travel', text: () => { const b = S.last; return b ? `Seen: ${nm(team()[b.stage])} read “${esc(b.text)}”, said <b>${esc(b.label)}</b> (${b.conf}%) and ${b.bin ? `carried it to the <b>${esc(b.bin)}</b> bin` : 'passed it on to the next stage'}.`
        : `Watch one message travel: the first creature walks to the inbox, picks a message up, and its bubble says what it thinks (a label and how sure it is). Then it carries it on, or into a bin.`; },
      show: () => { const cs = L().crew ? L().crew() : []; const c = cs.find(c => c.lab && c.lab.busy) || cs[0]; if (c) { look(c.x, c.y, 1.3); c.bub.textContent = '👀 watch me'; c.bub.classList.add('on'); clearTimeout(c._bt); c._bt = setTimeout(() => c.bub.classList.remove('on'), 2500); } }, next: true },
    { k: 'kinds', text: () => { const r = routerI(), st = team()[r]; return `Three kinds of stage. A <b>filter</b> drops what matches into its own bin (spam). A <b>router</b> sorts into a bin per label. A <b>tagger</b> stamps a label and passes it on. Each has <b>sure at ≥</b>: ` +
        (st ? `below it, ${nm(st)} sends the message to <b>review</b> instead of guessing. Lower its bar and see what changes.` : `below it, a router sends the message to review. (This team has no router: add one to see it.)`); },
      acts: () => { const r = routerI(), st = team()[r]; if (!st) return []; return [{ label: `lower ${esc(st.name || st.head)} to ${Math.round(Math.max(0.3, (st.thr ?? 0.6) - 0.15) * 100)}%`, run: () => lower(r) }]; }, next: true },
    { k: 'team', text: () => `The team is yours to change. In a stage, pick another classifier (try <b>emotion</b>), change its kind, or press <b>+ add a stage</b>. A stage after a router never gets a message, so keep routers last.`,
      show: () => { panel(true); const b = $('#addStage'); if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(b); } }, next: true },
    { k: 'review', text: () => { const c = counts(), t = S.thr; let s = `The <b>review</b> bin holds what a router was <b>not sure</b> about: its best label was below the bar, or too close to the second best (the margin). In a real inbox, a person reads those.`;
        if (t) { const dr = c.routed - t.routed, dv = c.review - t.review; s += ` Since you lowered the bar: <b>${dr}</b> routed automatically, <b>${dv}</b> to review (${pct(dv, dr + dv)} to review${t.before !== '–' ? `, was ${t.before}` : ''}).`; } return s; },
      show: () => { const p = L().where && L().where(); if (p && p.review) look(p.review.x, p.review.y, 1); }, acts: () => S.thr ? [{ label: 'put the bar back', run: restore }] : [], next: true },
    { k: 'stats', text: () => { const c = counts(); return `<b>Team stats</b> keep score: ${c.in} messages in, ${c.routed} routed automatically, ${c.review} sent to review, ${c.filtered} caught by filters, and how sure and how fast each classifier is.`; },
      show: () => { panel(true); const s = $('#labStats'); if (s) { s.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(s); } }, next: true },
    { k: 'where', text: () => { const j = window.__jeffy, own = j && j.heads ? j.heads : [], other = [...new Set(team().map(t => t.head).filter(h => !own.includes(h)))];
        return `Where they run: ${own.length ? `<b>${own.map(esc).join(', ')}</b> run <b>in this browser</b> (a one-time 23.7 MB download; nothing you sort is sent anywhere)` : 'in this browser where they can'}${other.length ? `; <b>${other.map(esc).join(', ')}</b> ${other.length > 1 ? 'are' : 'is'} asked on Jeffy's server` : ''}. The 📖 <a href="pedia.html#datalab" target="_blank" rel="noopener">pedia's data lab page</a> has the rest.`; },
      next: 'finish' }];

  function flash(el) { el.classList.add('dlw-flash'); setTimeout(() => el.classList.remove('dlw-flash'), 2400); }
  function lower(i) { const l = L(), st = team()[i]; if (!l || !st || !l.setThr) return; const c = counts();
    S.thr = { i, was: st.thr ?? 0.6, routed: c.routed, review: c.review, before: pct(c.review, c.routed + c.review) }; save(); l.setThr(i, Math.max(0.3, Math.round(((st.thr ?? 0.6) - 0.15) * 100) / 100)); done('kinds'); }
  function restore() { const l = L(), t = S.thr; if (!l || !t || !team()[t.i]) return; l.setThr(t.i, t.was); S.thr = null; save(); draw(); }

  // ---------- state
  function start(again) { S = { v: 1, t0: now(), active: true, done: {}, last: null, thr: null, sig: sig(), again: !!again }; save(); try { window.__stats && window.__stats.mark && window.__stats.mark('dlwalk'); } catch (e) {} draw(); }
  function stop() { if (!S) return; S.active = false; S.skipped = now(); save(); close(); draw(); }
  function finish() { if (!S) return; S.done.where = now(); S.active = false; S.finished = now(); save(); close(); draw();
    N({ kind: 'trail', icon: '🧪', html: `That's the data lab. Build a team, feed it a page, and see what your classifiers make of it.`, ttl: 9000 }); }
  function done(k) { if (!active() || S.done[k]) return; S.done[k] = now(); save(); close(); draw(); }
  const step = () => active() ? STEPS.find(s => !S.done[s.k]) : null;

  // ---------- completing steps from the lab's own events
  addEventListener('idle:ev', e => { const { type, extra } = e.detail || {}; const x = extra || {};
    if (type === 'lab_open') { if (!S) start(false); else draw(); return; }
    if (!active()) return;
    if ((type === 'lab_sort' || type === 'lab_pass') && (step() || {}).k === 'travel' && now() - (S.travelAt || 0) > 2500) { S.last = { stage: x.stage, label: x.label, conf: Math.round((x.conf || 0) * 100), bin: x.bin || null, text: lastText(x) }; S.travelAt = now(); save(); draw(); }   // the step tells what it saw and waits for next ›, so it can be read
    else if (type === 'lab_team') { if (S.done.kinds) done('team'); } });
  function lastText(x) { try { const ms = L().msgs || []; const q = ms.filter(m => x.bin ? m.bin === x.bin && m.done : m.stage === x.stage + 1).slice(-1)[0]; return q ? String(q.text).slice(0, 60) + (q.text.length > 60 ? '…' : '') : 'a message'; } catch (e) { return 'a message'; } }
  document.addEventListener('input', e => { if (active() && e.target.dataset && e.target.dataset.st != null) done('kinds'); });

  // ---------- the card in the team panel, and a pill while the panel is closed
  const css = document.createElement('style');
  css.textContent = `#team .dlw{margin:6px 0 8px;padding:8px 10px;border:1px solid #2b5cff88;border-radius:10px;background:color-mix(in srgb,#2b5cff 9%,transparent);font:12.5px/1.45 system-ui}
#team .dlw .stp{display:block;font-size:10.5px;opacity:.65;margin-bottom:2px}#team .dlw .acts{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
#team .dlw button{font:11.5px system-ui;padding:3px 9px;border-radius:12px;border:1px solid #2b5cff;background:transparent;color:inherit;cursor:pointer}#team .dlw button.pri{background:#2b5cff;color:#fff}
#team .dlw button.end{border-color:#8886;opacity:.75}#team .dlw .dots{display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle}#team .dlw .dots i{width:6px;height:6px;border-radius:50%;background:#8886}#team .dlw .dots i.on{background:#2b5cff}
#dlwBtn{font:11px system-ui;margin-left:6px;padding:1px 7px;border-radius:10px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer}.dlw-flash{outline:2px solid #2b5cff;outline-offset:3px;border-radius:8px;transition:outline-color 2s}
@media (max-width:500px){#team .dlw{font-size:13.5px}#team .dlw button{font-size:13px;padding:6px 12px}}`;
  document.head.appendChild(css);
  let pill = null, pillFor = '', lastHtml = '';
  function close() { if (pill) { try { pill.close(); } catch (e) {} pill = null; pillFor = ''; } }
  function card() { const t = $('#team'); if (!t) return null; let c = t.querySelector('.dlw'); const head = t.querySelector('.ch');
    if (head && !head.querySelector('#dlwBtn')) { const b = document.createElement('button'); b.id = 'dlwBtn'; b.title = 'a short walkthrough of the data lab'; b.textContent = '? walkthrough'; b.addEventListener('click', () => start(true)); head.insertBefore(b, head.querySelector('#teamClose')); }
    if (!c) { c = document.createElement('div'); c.className = 'dlw'; if (head) head.after(c); else t.prepend(c); c.addEventListener('click', onClick); } return c; }
  function html(s) { const i = STEPS.indexOf(s), acts = (s.acts ? s.acts() : []).map((a, j) => `<button data-dlw="a${j}">${a.label}</button>`).join('');
    return `<span class="stp">data lab walkthrough · step ${i + 1} of ${STEPS.length}<span class="dots">${STEPS.map(x => `<i class="${S.done[x.k] || x === s ? 'on' : ''}"></i>`).join('')}</span></span>${s.text()}<div class="acts">${s.show ? '<button data-dlw="show" class="pri">show me ›</button>' : ''}${acts}${s.next ? `<button data-dlw="next"${s.show ? '' : ' class="pri"'}>${s.next === 'finish' ? 'finish ✓' : 'next ›'}</button>` : ''}<button data-dlw="end" class="end" title="end the walkthrough; restart it with ? walkthrough">end</button></div>`; }
  function onClick(e) { const b = e.target.closest('[data-dlw]'); if (!b) return; const s = step(); if (!s) return; const k = b.dataset.dlw;
    if (k === 'show') s.show(); else if (k === 'next') { if (s.next === 'finish') finish(); else done(s.k); } else if (k === 'end') stop(); else if (k[0] === 'a') { const a = (s.acts ? s.acts() : [])[+k.slice(1)]; if (a) a.run(); } draw(); }
  function draw() { const c = card(); const s = step(); if (!c) return; if (!s) { c.style.display = 'none'; close(); return; }
    const h = html(s); if (h !== lastHtml) { c.innerHTML = h; lastHtml = h; } c.style.display = '';
    const labOn = L() && L().isOn && L().isOn();
    if (labOn && !panelOn() && pillFor !== s.k) { close(); pillFor = s.k;
      pill = N({ kind: 'trail', icon: '🧪', key: 'dlwalk:' + s.k, ttl: 0, html: `<span class="stp">data lab · step ${STEPS.indexOf(s) + 1} of ${STEPS.length}</span>` + s.text(),
        actions: [{ label: 'open the walkthrough ›', run: () => { panel(true); pillFor = ''; } }, { label: 'end', run: stop }] }); }
    else if (panelOn() && pill) close(); }
  setInterval(() => { if (!S) return; if (active() && sig() !== S.sig) { S.sig = sig(); save(); if (S.done.kinds) done('team'); } if (active()) draw(); }, 1000);
  window.__dlwalk = { start, stop, state: () => S && JSON.parse(JSON.stringify(S)), steps: STEPS.map(s => s.k), active };
})();
