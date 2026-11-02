// idle-feedback.js: 🔮 Tell the Oracle, and the 🗺 roadmap you can vote on (11-01).
// Nico: "something like 'submit it to The Oracle'… a ticket/request… then we could show them the roadmap… users get to vote".
// - Tell the Oracle: a kind (an idea, a bug, I loved this, something felt off) and a few words (≤ 600 characters), plus a little context
//   the player can see and untick (which page, which place, the build, phone or desktop, the last error message). Never anything from the
//   world itself. It goes to a private queue on id-le.com (helper/worker.js /lab/oracle), read by the maker; never published by itself.
//   Emails, links and phone numbers are blanked before sending (and again on the server).
// - The roadmap: what the maker has chosen to show (/lab/roadmap), one ▲ vote per item (this browser remembers it; the server also
//   dedupes per visitor and day without storing who), and "suggest something" opens Tell the Oracle.
// - In 💬 IRC, "tell the Oracle …" (or "@oracle …") opens the form with those words in it; nothing is sent until you press send.
(() => {
  const $ = s => document.querySelector(s), esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VOTED = 'idle.votes', KINDS = [['idea', '💡 an idea'], ['bug', '🐞 a bug'], ['loved', '💜 I loved this'], ['off', '🌀 something felt off']];
  const THANKS = ['noted. I will whisper it to the maker', 'the Oracle heard you. the maker reads everything that comes through here', 'thank you. small worlds grow from words like these',
    'received. it goes on the pile the maker reads at night', 'heard. if it shapes the world, you will see it on the roadmap'];
  const IRC = /^(?:@oracle\b|tell the oracle\b)[:,]?\s*/i;
  const scrub = t => String(t || '').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]');
  let lastErr = '';
  addEventListener('error', e => { if (e && e.message) lastErr = String(e.message).slice(0, 160); });
  addEventListener('unhandledrejection', e => { const r = e && e.reason; lastErr = String((r && r.message) || r || '').slice(0, 160); });

  const css = document.createElement('style');
  css.textContent = `#oracle{position:absolute;right:16px;top:56px;z-index:40;width:360px;max-width:calc(100% - 24px);max-height:calc(100% - 80px);overflow:auto;display:none;
  background:var(--panel,#fffdf8f4);color:inherit;border:1px solid #8885;border-radius:12px;box-shadow:0 10px 32px #0005;font:13px system-ui;padding:10px 12px}
#oracle.on{display:block}#oracle .hd{display:flex;align-items:center;gap:8px;margin-bottom:6px}#oracle .hd b{flex:1;font-size:13px}
#oracle .tabs{display:flex;gap:4px;margin:2px 0 8px}#oracle .tabs button{font:inherit;font-size:12px;border:1px solid #8886;background:none;color:inherit;border-radius:12px;padding:3px 10px;cursor:pointer}
#oracle .tabs button.on{background:#7a4cff;border-color:#7a4cff;color:#fff}#oracle button.x{border:0;background:none;color:inherit;cursor:pointer;font-size:14px}
#oracle .kinds{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}#oracle .kinds button{font:inherit;font-size:12px;border:1px solid #8886;background:none;color:inherit;border-radius:12px;padding:3px 9px;cursor:pointer}
#oracle .kinds button.on{border-color:#7a4cff;box-shadow:0 0 0 1px #7a4cff inset}
#oracle textarea{width:100%;box-sizing:border-box;min-height:84px;font:13px system-ui;border:1px solid #8886;border-radius:8px;padding:6px 8px;background:transparent;color:inherit;resize:vertical}
#oracle .ctx{font-size:11.5px;opacity:.8;margin:6px 0}#oracle .ctx label{display:block;margin:2px 0}#oracle .row{display:flex;align-items:center;gap:8px;margin-top:6px}
#oracle .send{font:inherit;border:0;background:#7a4cff;color:#fff;border-radius:14px;padding:5px 14px;cursor:pointer}#oracle .send[disabled]{opacity:.5;cursor:default}
#oracle small{opacity:.7}#oracle .msg{margin-top:8px;font-style:italic}#oracle .it{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #8882}
#oracle .it .v{flex:none;min-width:42px;font:inherit;font-size:12px;border:1px solid #8886;background:none;color:inherit;border-radius:10px;padding:3px 6px;cursor:pointer}
#oracle .it .v.on{background:#7a4cff;border-color:#7a4cff;color:#fff;cursor:default}#oracle .it b{display:block;font-size:12.5px}#oracle .it .st{font-size:10.5px;opacity:.65;text-transform:uppercase;letter-spacing:.04em}
@media (prefers-color-scheme:dark){#oracle{background:var(--panel,#1d1f26f4)}}
@media (max-width:500px){#oracle{position:fixed;left:0;right:0;top:auto;bottom:0;width:auto;max-width:none;max-height:76dvh;border-radius:16px 16px 0 0}}`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.id = 'oracle'; document.body.appendChild(el);
  const btn = document.createElement('button'); btn.id = 'oracleBtn'; btn.title = 'Tell the Oracle (an idea, a bug, what you loved) · vote on the roadmap'; btn.textContent = '🔮';
  const mountBtn = () => { if (btn.isConnected) return; const bar = $('#topbar'); if (!bar) return setTimeout(mountBtn, 300); const s = $('#settingsBtn'), more = $('#mMore'); if (s) s.before(btn, ' '); else if (more) more.before(btn, ' '); else bar.appendChild(btn); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mountBtn); else mountBtn();
  btn.addEventListener('click', () => toggle());

  let open = false, tab = 'tell', kind = '', draft = '', ctxOn = { page: true, place: true, build: true, device: true, err: true }, msg = '', road = null, roadErr = '', sending = false;
  const voted = () => { try { return new Set(JSON.parse(localStorage.getItem(VOTED) || '[]')); } catch (e) { return new Set(); } };
  const remember = id => { try { const v = voted(); v.add(id); localStorage.setItem(VOTED, JSON.stringify([...v].slice(-200))); } catch (e) {} };
  function context() {
    const phone = matchMedia('(max-width: 500px)').matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
    const tablet = !phone && matchMedia('(pointer: coarse)').matches;
    return { page: location.pathname || '/', place: String(window.__placeKind || 'home').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'home',
      build: String((window.IDLE_CFG && window.IDLE_CFG.build) || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 12), device: phone ? 'phone' : tablet ? 'tablet' : 'desktop', err: scrub(lastErr).slice(0, 160) };
  }
  function toggle(on, which) { open = on ?? !open; if (which) tab = which; btn.classList.toggle('on', open); render(); if (open && tab === 'road') loadRoad(); if (open && tab === 'tell') setTimeout(() => { const t = el.querySelector('textarea'); if (t && !matchMedia('(pointer: coarse)').matches) t.focus(); }, 30); }
  async function loadRoad() { roadErr = ''; try { const r = await fetch('/lab/roadmap', { cache: 'no-store' }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.status); road = j; } catch (e) { roadErr = String(e.message || e); } if (open && tab === 'road') render(); }

  function render() {
    el.classList.toggle('on', open); if (!open) return;
    const c = context();
    const head = `<div class="hd"><b>🔮 the Oracle</b><button class="x" data-a="close" title="close">✕</button></div><div class="tabs"><button data-tab="tell" class="${tab === 'tell' ? 'on' : ''}">tell the Oracle</button><button data-tab="road" class="${tab === 'road' ? 'on' : ''}">🗺 the roadmap</button></div>`;
    if (tab === 'tell') {
      const ctxRows = [['page', `page: ${c.page}`], ['place', `place: ${c.place}`], ['build', c.build ? `version: ${c.build}` : ''], ['device', `on a ${c.device}`], ['err', c.err ? `the last error: “${c.err}”` : '']]
        .filter(r => r[1]).map(([k, label]) => `<label><input type="checkbox" data-ctx="${k}"${ctxOn[k] ? ' checked' : ''}> ${esc(label)}</label>`).join('');
      el.innerHTML = head + `<small>Tell the maker what you think: it goes to a private list the maker reads. Nothing from your world is sent.</small>
<div class="kinds">${KINDS.map(([k, l]) => `<button data-kind="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
<textarea maxlength="600" placeholder="a few words… (no need for your name or email)">${esc(draft)}</textarea>
<div class="ctx"><small>also send (untick anything you'd rather not):</small>${ctxRows}</div>
<div class="row"><button class="send" data-a="send"${sending ? ' disabled' : ''}>send to the Oracle</button><small>${(draft || '').length}/600</small></div>
${msg ? `<div class="msg">${esc(msg)}</div>` : ''}<div class="ctx"><small>What's kept and for how long: <a href="privacy.html#oracle" target="_blank" rel="noopener">privacy</a></small></div>`;
      return;
    }
    const v = voted();
    const items = road && road.items || [];
    el.innerHTML = head + (roadErr ? `<p><small>the roadmap couldn't be read here (${esc(roadErr)}). The full one is on <a href="https://github.com/nicobrenner/id-le/issues/20" target="_blank" rel="noopener">GitHub</a>.</small></p>`
      : !road ? '<p><small>reading the roadmap…</small></p>'
      : (items.length ? items.map(x => `<div class="it"><button class="v${v.has(x.id) ? ' on' : ''}" data-vote="${esc(x.id)}" title="${v.has(x.id) ? 'you voted for this' : 'vote for this'}">▲ ${(road.votes && road.votes[x.id]) || 0}</button><div><b>${esc(x.title)}</b>${x.line ? `<small>${esc(x.line)}</small>` : ''}${x.status ? `<div class="st">${esc(x.status)}</div>` : ''}</div></div>`).join('')
        : '<p><small>nothing on the roadmap yet.</small></p>'))
      + `<div class="row"><button class="send" data-a="suggest">suggest something</button><small><a href="${esc((road && road.url) || 'https://github.com/nicobrenner/id-le/issues/20')}" target="_blank" rel="noopener">the full roadmap on GitHub ›</a></small></div>`;
  }

  el.addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA') { draft = e.target.value.slice(0, 600); const s = el.querySelector('.row small'); if (s) s.textContent = draft.length + '/600'; } });
  el.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.ctx; if (k) ctxOn[k] = e.target.checked; });
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'close') return toggle(false);
    if (b.dataset.tab) { tab = b.dataset.tab; msg = ''; render(); if (tab === 'road' && !road) loadRoad(); return; }
    if (b.dataset.kind) { kind = b.dataset.kind; render(); return; }
    if (b.dataset.a === 'suggest') { tab = 'tell'; kind = kind || 'idea'; render(); return; }
    if (b.dataset.vote) { const id = b.dataset.vote; if (voted().has(id)) return; remember(id); b.classList.add('on');
      try { const r = await (await fetch('/lab/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
        if (road && r && typeof r.votes === 'number') { road.votes = road.votes || {}; road.votes[id] = r.votes; } } catch (er) {}
      render(); emit('vote'); return; }
    if (b.dataset.a === 'send') {
      const text = scrub(draft).trim(); if (!kind) { msg = 'pick what kind of message it is first'; return render(); } if (text.length < 2) { msg = 'a few words, please'; return render(); }
      const c = context(), ctx = {}; for (const k of Object.keys(c)) if (ctxOn[k] && c[k]) ctx[k] = c[k];
      sending = true; render();
      try { const r = await fetch('/lab/oracle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text, ctx }) }); const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || ('the Oracle is not answering (' + r.status + ')'));
        const line = THANKS[Math.floor(Math.random() * THANKS.length)]; msg = '🔮 ' + line; draft = ''; kind = '';
        if (window.__oracleSay) window.__oracleSay(line); emit('sent');
      } catch (er) { msg = String(er.message || er); }
      sending = false; render(); }
  });
  const emit = what => { try { dispatchEvent(new CustomEvent('idle:ev', { detail: { type: 'oracle_' + what, extra: {} } })); } catch (e) {} };
  addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });

  window.__feedback = {
    open: (which, text, k) => { if (text != null) draft = String(text).slice(0, 600); if (k) kind = k; toggle(true, which || 'tell'); },
    close: () => toggle(false),
    // 💬 IRC: "tell the Oracle …" / "@oracle …" opens the form with those words; returns true when the line was taken
    fromIrc: t => { if (!IRC.test(String(t || ''))) return false; window.__feedback.open('tell', String(t).replace(IRC, '').trim(), kind || 'idea'); return true; },
    state: () => ({ open, tab, kind, draft, road }),
  };
})();
