// idle-jeffy.js: the data lab's three default classifiers running in this browser (#18), so the lab needs no server for them.
// Heads: sms_spam (Spamtrap), support_ticket (Router), tweet_eval_sentiment (Moodring), refitted by the Jeffy side on
// all-MiniLM-L6-v2 (int8, 384-dim): a different space from the server's bge-large heads, so these are new coefficients, not an export.
// Accuracy vs the server's heads on the same test sets: spam 0.992 vs 0.991, tickets 0.998 vs 0.996, sentiment 0.626 vs 0.663.
// Files in jeffy-heads/ (23.7 MB: encoder 23.0, tokenizer 0.7, heads 0.06), fetched only when something asks for one of these heads
// through predict(..., { load: true }) (the data lab does; a sorter or debugger in the world uses them only once they are here).
// Any other head still goes to /jeffy/predict (Jeffy's public server through the helper, or a local Jeffy server).
// Tokenizer and pooling follow the Jeffy side's jeffy-browser.js; one run at a time, unpadded (padding isn't masked cleanly in this graph).
(() => {
  const BASE = 'jeffy-heads/', MODEL = 'minilm-l6-v2-quantized.onnx', LOCAL = ['sms_spam', 'support_ticket', 'tweet_eval_sentiment'];
  let state = 'idle', loading = null, enc = null, heads = null, tok = null, chain = Promise.resolve(), progress = 0;
  const off = () => (window.__safeLevel || 0) >= 2 || typeof ort === 'undefined';   // safe mode after crashes: no second model

  class Tokenizer {   // WordPiece as in tokenizer.json (uncased, accents stripped, punctuation split)
    constructor(s) { this.v = s.model.vocab; this.unk = this.v[s.model.unk_token || '[UNK]']; this.pre = s.model.continuing_subword_prefix ?? '##'; this.max = s.model.max_input_chars_per_word ?? 100; this.cls = this.v['[CLS]']; this.sep = this.v['[SEP]']; }
    piece(w) { if (w.length > this.max) return [this.unk]; const out = []; let s = 0; while (s < w.length) { let e = w.length, cur = null; while (s < e) { const p = (s ? this.pre : '') + w.slice(s, e); if (this.v[p] !== undefined) { cur = this.v[p]; break; } e--; } if (cur === null) return [this.unk]; out.push(cur); s = e; } return out; }
    encode(t, maxLen = 256) { const ids = [this.cls]; const words = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/([\p{P}\p{S}])/gu, ' $1 ').split(/\s+/).filter(Boolean);
      for (const w of words) for (const id of this.piece(w)) { if (ids.length >= maxLen - 1) break; ids.push(id); } ids.push(this.sep); return ids; }
  }

  async function fetchModel(onProgress) {   // streamed, so the lab can show how far along it is
    const r = await fetch(BASE + MODEL); if (!r.ok) throw new Error('classifier model: HTTP ' + r.status);
    const n = +r.headers.get('content-length') || 0; if (!n || !r.body) return new Uint8Array(await r.arrayBuffer());
    const rd = r.body.getReader(), buf = new Uint8Array(n); let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; if (got + value.length > n) return new Uint8Array(await (await fetch(BASE + MODEL)).arrayBuffer()); buf.set(value, got); got += value.length; progress = got / n; if (onProgress) onProgress(progress); }
    return got === n ? buf : buf.subarray(0, got);
  }

  function load(onProgress) {
    if (loading) return loading; if (off()) return Promise.reject(new Error('in-browser classifiers are off on this device'));
    state = 'loading'; const t0 = performance.now();
    loading = (async () => {
      const [ts, hs, model] = await Promise.all([fetch(BASE + 'tokenizer.json').then(r => r.json()), fetch(BASE + 'heads.json').then(r => r.json()), fetchModel(onProgress)]);
      tok = new Tokenizer(ts); heads = hs;
      enc = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      state = 'ready'; api.loadMs = Math.round(performance.now() - t0); return api;
    })().catch(e => { state = 'failed'; api.error = String(e && e.message || e); loading = null; throw e; });
    return loading;
  }

  async function embed(text) {
    const ids = tok.encode(String(text || '')), n = ids.length, names = new Set(enc.inputNames);
    const feed = { input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, n]) };
    if (names.has('attention_mask')) feed.attention_mask = new ort.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]);
    if (names.has('token_type_ids')) feed.token_type_ids = new ort.Tensor('int64', new BigInt64Array(n), [1, n]);
    const out = await enc.run(feed), h = out[enc.outputNames[0]], dim = h.dims[2], d = h.data, v = new Float32Array(dim);
    for (let k = 0; k < n; k++) for (let j = 0; j < dim; j++) v[j] += d[k * dim + j];   // mean over every token (no padding), then L2
    let norm = 0; for (let j = 0; j < dim; j++) { v[j] /= n; norm += v[j] * v[j]; } norm = Math.sqrt(norm) || 1e-9; for (let j = 0; j < dim; j++) v[j] /= norm;
    return v;
  }

  function score(head, v) {   // the scaler is folded into w and b: logits = v·w + b
    const h = heads[head], logits = h.w.map((row, c) => { let s = h.b[c]; for (let j = 0; j < row.length; j++) s += row[j] * v[j]; return s; });
    let probs; if (h.labels.length === 2 && logits.length === 1) { const p = 1 / (1 + Math.exp(-logits[0])); probs = [1 - p, p]; }
    else { const m = Math.max(...logits), e = logits.map(x => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0); probs = e.map(x => x / s); }
    const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]), probabilities = {}; h.labels.forEach((l, i) => { probabilities[l] = probs[i]; });
    return { label: h.labels[order[0][1]], confidence: order[0][0], margin: order[0][0] - (order[1] ? order[1][0] : 0), probabilities };
  }

  async function local(head, text) {   // one at a time: the encoder shares onnxruntime's worker with the Oracle
    const run = chain.then(async () => { const t0 = performance.now(); const r = score(head, await embed(text)); return { ...r, ms: performance.now() - t0, where: 'browser' }; });
    chain = run.catch(() => {}); return run;
  }

  async function remote(head, text) { const t0 = performance.now(); const r = await (await fetch('/jeffy/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, task: head }) })).json(); return { ...r, ms: performance.now() - t0, where: 'server' }; }

  // predict(head, text, { load }): in this browser when the head is one of ours and the files are here (or load is set and they can be
  // fetched); otherwise the server, exactly as before. A failed download falls back to the server for this session.
  async function predict(head, text, o = {}) {
    if (has(head) && state !== 'failed' && !off()) {
      if (state === 'ready') return local(head, text);
      if (o.load || state === 'loading') { try { await load(o.onProgress); return local(head, text); } catch (e) { /* fall through to the server */ } }
    }
    return remote(head, text);
  }
  const has = head => LOCAL.includes(head);
  const api = { predict, load, has, heads: LOCAL.slice(), state: () => state, progress: () => progress, off, loadMs: 0, error: '',
    capabilities: () => LOCAL.map(task_id => ({ task_id, where: 'browser', encoder: 'all-MiniLM-L6-v2 (int8)' })) };
  window.__jeffy = api;
})();
