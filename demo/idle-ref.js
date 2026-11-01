// idle-ref.js: shared by the game's stats (idle-stats.js) and the pedia's (pedia.html), so both name sites the same way.
//   __idleRef.host()   the referring site's name only (never the path or query), mapped to a few known names; 'direct' when
//                      there was no link or it came from our own pages; 'other' for addresses and junk
//   __idleRef.utm()    the link's utm_source, cleaned to [a-z0-9-] and at most 24 characters, or null
//   __idleRef.err(...) one error, located: message (quoted text, long numbers and links blanked) @ file:line:col of the
//                      first stack frame that names a file (file name only), else the event's own file:line; the site root
//                      ("/") is called index.html, and code made with new Function names itself with //# sourceURL
(() => {
  const host = () => { let r = ''; try { r = document.referrer || ''; } catch (e) {} if (!r) return 'direct';
    if (/^android-app:\/\/com\.reddit\./i.test(r)) return 'reddit.com';
    let h = ''; try { h = new URL(r).hostname.toLowerCase(); } catch (e) { return 'other'; }
    if (!h || h === location.hostname || /(^|\.)id-le\.(com|pages\.dev)$/.test(h)) return 'direct';
    if (/^(\d+\.){3}\d+$|^\[|localhost|\.local$/.test(h)) return 'other';
    h = h.replace(/^(www|m|l|lm|old|new|out|np|i)\./, '');
    if (/(^|\.)reddit\.com$|^redd\.it$/.test(h)) return 'reddit.com';
    if (h === 'news.ycombinator.com' || h === 'ycombinator.com') return 'news.ycombinator.com';
    if (/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/.test(h)) return 'x.com';
    if (/^google\.[a-z.]+$/.test(h) || h === 'news.google.com') return 'google';
    if (/(^|\.)bing\.com$/.test(h)) return 'bing';
    if (/(^|\.)duckduckgo\.com$/.test(h)) return 'duckduckgo';
    if (/(^|\.)facebook\.com$/.test(h)) return 'facebook.com';
    if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(h)) return 'linkedin.com';
    if (/(^|\.)github\.com$|\.github\.io$/.test(h)) return 'github.com';
    if (/^(mastodon\.social|bsky\.app|lobste\.rs|kagi\.com|search\.brave\.com|yandex\.[a-z]+|baidu\.com|ecosia\.org)$/.test(h)) return h;
    return /^[a-z0-9][a-z0-9.-]{0,59}$/.test(h) ? h : 'other'; };
  const utm = () => { try { const u = new URLSearchParams(location.search).get('utm_source'); const c = u && u.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24); return c || null; } catch (e) { return null; } };
  const clean = m => String(m || '').replace(/(["'`“‘])(?:(?!\1).){0,200}\1/g, '"…"').replace(/https?:\/\/\S+/g, 'URL').replace(/\d{3,}/g, 'N').slice(0, 120);
  const base = f => { const s = String(f || '').split(/[?#]/)[0]; if (!s) return ''; const b = s.split('/').pop(); return b || (/^https?:\/\/[^/]+\/?$/.test(s) ? 'index.html' : ''); };
  // the first frame that names a file: Chromium "at f (https://x/y.js?v=1:12:5)", WebKit/Firefox "f@https://x/y.js:12:5"
  const frame = stack => { for (const ln of String(stack || '').split('\n')) { const m = /((?:https?:\/\/[^\s()]+|[\w.-]+\.(?:js|html)))(?:\?[^\s():]*)?:(\d+):(\d+)/.exec(ln); if (m) { const f = base(m[1]); if (f) return `${f}:${m[2]}:${m[3]}`; } } return ''; };
  const err = (msg, file, line, col, stack) => { const at = frame(stack) || ((base(file) || '?') + ':' + (line || 0) + (col ? ':' + col : ''));
    const b = (window.IDLE_CFG && window.IDLE_CFG.build) || ''; return clean(msg) + ' @' + at + (b ? ' b' + b : ''); };
  window.__idleRef = { host, utm, err, clean, frame };
})();
