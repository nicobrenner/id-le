#!/usr/bin/env python3
"""Test-drive "bring your own agent" on this computer, with one command. Nothing touches id-le.com or staging.

    python3 tools/agent_local.py              # http://localhost:8799 : the static build + the relay (helper/worker.js, as on staging)
    python3 tools/agent_local.py --server     # the same through server.py instead (how people run Id|le from the repo)
    python3 tools/agent_local.py 8800         # another port

Default: builds the static site (with /agent/SKILL.md) into a temporary folder, runs the Worker's own relay with node
(helper/dev_server.mjs, the AgentRelay code staging runs, minus the Durable Object), and serves both on one localhost port, as
Cloudflare Pages does (the game's /lab/agent/* calls go to the relay; every other /lab call gets an empty answer). Ctrl-C stops everything.
"""
import argparse, functools, http.server, os, shutil, socket, socketserver, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def wait_port(port, t=15):
    t0 = time.time()
    while time.time() - t0 < t:
        try: socket.create_connection(("127.0.0.1", port), 0.3).close(); return True
        except OSError: time.sleep(0.2)
    return False


def steps(port, how):
    site = f"http://localhost:{port}"
    print(f"""
Id|le with bring-your-own-agent is running ({how}).

  1. open   {site}/arena.html?start=ready     (a ready world, no storyline: during the story's Genesis an agent can only look and talk)
  2. in the game: 🔮 Oracle (under the Operator chat, or type /oracle) → "4 · Connect an agent" → allow
  3. in a terminal (or tell your agent to run it):
       python3 tools/idle-agent.py pair CODE --site {site}
       python3 tools/idle-agent.py state
       python3 tools/idle-agent.py do weather kind=bitrain
       python3 tools/idle-agent.py do say text="hello from my agent"
     the skill for agents: {site}/agent/SKILL.md   (Claude Code: "read {site}/agent/SKILL.md, then pair with CODE")
  4. "disconnect" on the 🤖 pill ends it

Ctrl-C stops everything.""", flush=True)


def run_server(port):
    pr = subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py"), str(port)])
    if not wait_port(port): pr.kill(); sys.exit("server.py did not start")
    steps(port, "python3 server.py: the relay is in that process's memory")
    try: pr.wait()
    except KeyboardInterrupt: pass
    finally: pr.terminate()


def run_static(port):
    if not shutil.which("node"): sys.exit("needs node (for the relay, helper/dev_server.mjs); or: python3 tools/agent_local.py --server")
    tmp = tempfile.mkdtemp(prefix="idle-agent-local-"); dist = os.path.join(tmp, "dist")
    print("building the static site…", flush=True)
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_static.py"), "--agent", "--out", dist], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stdout[-800:] + r.stderr[-800:])
    rp = free_port(); relay = subprocess.Popen(["node", os.path.join(ROOT, "helper", "dev_server.mjs"), str(rp)], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    if not wait_port(rp): relay.kill(); sys.exit("the relay (helper/dev_server.mjs) did not start")

    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def translate_path(self, path):   # /arena serves arena.html, as Cloudflare Pages does
            p = super().translate_path(path); return p + ".html" if not os.path.exists(p) and os.path.isfile(p + ".html") else p
        def end_headers(self):
            self.send_header("Cache-Control", "no-store"); super().end_headers()
        def relay(self):
            n = int(self.headers.get("Content-Length") or 0); body = self.rfile.read(n) if n else None
            rq = urllib.request.Request(f"http://localhost:{rp}{self.path}", data=body, method=self.command,
                                        headers={k: v for k, v in self.headers.items() if k.lower() in ("authorization", "content-type")})
            try: res = urllib.request.urlopen(rq, timeout=20); st, b = res.status, res.read()
            except urllib.error.HTTPError as e: st, b = e.code, e.read()
            except Exception: st, b = 502, b'{"error":"the relay did not answer"}'
            self.send_response(st); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        def other(self):   # the rest of the back end isn't part of this test drive: empty answers, nothing leaves this computer
            self.send_response(404 if self.command == "GET" else 204); self.send_header("Content-Length", "0"); self.end_headers()
        def do_GET(self):
            if self.path.startswith("/lab/agent/"): return self.relay()
            if self.path.startswith(("/lab/", "/worlds/", "/jeffy/")): return self.other()
            return super().do_GET()
        def do_POST(self):
            if self.path.startswith("/lab/agent/"): return self.relay()
            return self.other()

    class S(socketserver.ThreadingTCPServer): daemon_threads = True; allow_reuse_address = True
    srv = S(("127.0.0.1", port), functools.partial(H, directory=dist))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    steps(port, "the static build + helper/worker.js's relay, in node")
    try:
        while relay.poll() is None: time.sleep(0.5)
        print("the relay stopped", flush=True)
    except KeyboardInterrupt: pass
    finally:
        srv.shutdown(); relay.terminate(); shutil.rmtree(tmp, ignore_errors=True); print("\nstopped", flush=True)


if __name__ == "__main__":
    import signal   # Ctrl-C (and a plain kill) stop everything, also when started in the background
    signal.signal(signal.SIGINT, signal.default_int_handler); signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(KeyboardInterrupt()))
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("port", nargs="?", type=int, default=8799)
    ap.add_argument("--server", action="store_true", help="run server.py (its own relay, in Python) instead of the static build + the Worker's relay")
    a = ap.parse_args()
    run_server(a.port) if a.server else run_static(a.port)
