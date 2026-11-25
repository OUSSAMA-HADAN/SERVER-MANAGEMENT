/**
 * Web terminal over WebSocket.
 *
 * Endpoint: GET /ws/terminal[?session=<id>&cols=<n>&rows=<n>]
 *
 * Wire protocol
 *   client → server  binary frame        keystrokes / paste (UTF-8)
 *                    text   {"type":"resize","cols":n,"rows":n}
 *   server → client  binary frame        terminal output (UTF-8, batched)
 *                    text   {"type":"ready","id","shell","replay"}
 *                           {"type":"exit","code","signal"}
 *                           {"type":"error","code","message"}
 *
 * Sessions outlive the socket: when a phone sleeps or the network drops, the
 * shell keeps running for TERMINAL_DETACH_MINUTES and the client reattaches with
 * ?session=<id>, receiving recent output again. Sessions belong to the user who
 * opened them and are killed when that login session ends (logout / expiry).
 */
const crypto = require('crypto');
const os = require('os');
const WebSocket = require('ws');

const { checkAccess, originAllowed, clientIp, clientCountry } = require('../middleware/security');

const WS_PATH = '/ws/terminal';
const MAX_SESSIONS_PER_USER = Number(process.env.TERMINAL_MAX_SESSIONS) || 6;
const DETACH_TTL_MS = (Number(process.env.TERMINAL_DETACH_MINUTES) || 15) * 60 * 1000;
const SCROLLBACK_BYTES = 256 * 1024;   // replayed on reattach
const HEARTBEAT_MS = 25 * 1000;        // < Cloudflare's 100 s idle timeout
const FLUSH_MS = 8;                    // coalesce output into fewer frames
const FLUSH_BYTES = 64 * 1024;
const HIGH_WATER = 1024 * 1024;        // pause the shell when the client lags
const LOW_WATER = 128 * 1024;

let nodePty = null;
let ptyLoadError = null;
try {
  nodePty = require('node-pty');
} catch (e) {
  ptyLoadError = e;
  console.error('[terminal] node-pty failed to load — terminal disabled:', e.message);
}

// Never hand the app's secrets to the shell.
const SECRET_ENV = /SECRET|PASSWORD|TOKEN|KEY|VAPID|HASH|AUD/i;
function shellEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  delete env.NODE_ENV;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.LANG = env.LANG || 'C.UTF-8';
  return env;
}

const SHELL = process.env.TERMINAL_SHELL || process.env.SHELL || '/bin/bash';
const clampDim = (n, def, max) => {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) && v >= 2 && v <= max ? v : def;
};

/** @type {Map<string, TermSession>} */
const sessions = new Map();

class TermSession {
  constructor({ userId, username, sid, cols, rows }) {
    this.id = crypto.randomBytes(16).toString('hex');
    this.userId = userId;
    this.username = username;
    this.sid = sid;
    this.createdAt = Date.now();
    this.ws = null;
    this.exited = false;
    this.detachTimer = null;
    this.scrollback = [];
    this.scrollbackLen = 0;
    this.pending = '';
    this.flushTimer = null;
    this.inflight = 0;
    this.paused = false;

    this.proc = nodePty.spawn(SHELL, ['-l'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: shellEnv(),
    });
    this.proc.onData((d) => this.onOutput(d));
    this.proc.onExit(({ exitCode, signal }) => this.onExit(exitCode, signal));
    sessions.set(this.id, this);
  }

  onOutput(data) {
    this.scrollback.push(data);
    this.scrollbackLen += data.length;
    while (this.scrollbackLen > SCROLLBACK_BYTES && this.scrollback.length > 1) {
      this.scrollbackLen -= this.scrollback.shift().length;
    }
    if (!this.ws) return;
    this.pending += data;
    if (this.pending.length >= FLUSH_BYTES) this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.pending) return;
    const buf = Buffer.from(this.pending, 'utf8');
    this.pending = '';
    this.sendBinary(buf);
  }

  sendBinary(buf) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    this.inflight += buf.length;
    ws.send(buf, { binary: true }, () => {
      this.inflight -= buf.length;
      if (this.paused && this.inflight < LOW_WATER) {
        this.paused = false;
        try { this.proc.resume(); } catch {}
      }
    });
    if (!this.paused && this.inflight > HIGH_WATER) {
      this.paused = true;
      try { this.proc.pause(); } catch {}
    }
  }

  sendControl(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  attach(ws, { replay }) {
    clearTimeout(this.detachTimer);
    this.detachTimer = null;
    if (this.ws && this.ws !== ws) {
      // Same session opened elsewhere (another tab/device): newest wins.
      try { this.ws.close(4001, 'Attached elsewhere'); } catch {}
    }
    this.ws = ws;
    this.pending = '';
    this.inflight = 0;
    if (this.paused) { this.paused = false; try { this.proc.resume(); } catch {} }

    this.sendControl({ type: 'ready', id: this.id, shell: SHELL.split('/').pop(), replay });
    if (replay && this.scrollbackLen) this.sendBinary(Buffer.from(this.scrollback.join(''), 'utf8'));

    ws.on('message', (msg, isBinary) => {
      if (this.exited) return;
      if (isBinary) {
        this.proc.write(msg.toString('utf8'));
        return;
      }
      let m;
      try { m = JSON.parse(msg.toString('utf8')); } catch { return; }
      if (m && m.type === 'resize') {
        const cols = clampDim(m.cols, 0, 1000);
        const rows = clampDim(m.rows, 0, 500);
        if (cols && rows) { try { this.proc.resize(cols, rows); } catch {} }
      }
    });

    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.pending = '';
      if (this.paused) { this.paused = false; try { this.proc.resume(); } catch {} }
      if (this.exited) return this.destroy();
      this.detachTimer = setTimeout(() => this.kill('detached too long'), DETACH_TTL_MS);
      this.detachTimer.unref();
    });
  }

  onExit(code, signal) {
    this.exited = true;
    this.flush();
    this.sendControl({ type: 'exit', code, signal });
    if (this.ws) { try { this.ws.close(1000, 'Shell exited'); } catch {} }
    this.destroy();
  }

  kill(reason, code = 'ended') {
    console.log(`[terminal] killing session ${this.id.slice(0, 8)} user="${this.username}" (${reason})`);
    if (this.ws) {
      this.sendControl({ type: 'error', code, message: `Session ended: ${reason}` });
      try { this.ws.close(4003, reason.slice(0, 100)); } catch {}
    }
    try { this.proc.kill('SIGHUP'); } catch {}
    this.destroy();
  }

  destroy() {
    clearTimeout(this.detachTimer);
    clearTimeout(this.flushTimer);
    sessions.delete(this.id);
  }
}

function rejectHttp(socket, code, msg) {
  if (!socket.writable) return socket.destroy();
  socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Run express-session against a raw upgrade request. */
function loadSession(sessionMiddleware, req) {
  return new Promise((resolve) => {
    const res = { getHeader() {}, setHeader() {}, writeHead() {}, end() {} };
    sessionMiddleware(req, res, () => resolve(req.session));
  });
}

/** @param {import('http').Server | import('http').Server[]} servers every listener to serve the terminal on */
function createTerminalServer(servers, { sessionMiddleware, sessionStore }) {
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false });

  const onUpgrade = async (req, socket, head) => {
    socket.on('error', () => {});
    const ip = clientIp(req);
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return rejectHttp(socket, 400, 'Bad Request'); }
    if (url.pathname !== WS_PATH) return rejectHttp(socket, 404, 'Not Found');

    // Browsers always send Origin on WebSocket; it must be ours (blocks cross-site WS hijacking).
    if (!originAllowed(req, { requireOrigin: true })) {
      console.warn(`[terminal] rejected bad origin "${req.headers.origin}" ip=${ip}`);
      return rejectHttp(socket, 403, 'Forbidden');
    }
    // Cloudflare Access is checked before the login session and long before any
    // shell is spawned; a missing or invalid token never reaches node-pty.
    if (!(await checkAccess(req))) return rejectHttp(socket, 403, 'Forbidden');

    const session = await loadSession(sessionMiddleware, req);
    const userId = session?.userId;
    if (!userId) return rejectHttp(socket, 401, 'Unauthorized');

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.sid = req.sessionID;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('error', () => {});

      const fail = (code, message) => {
        ws.send(JSON.stringify({ type: 'error', code, message }));
        ws.close(4000, code);
      };
      if (!nodePty) return fail('unavailable', `Terminal unavailable on the server: ${ptyLoadError?.message || 'node-pty missing'}`);

      const wanted = url.searchParams.get('session');
      const existing = wanted && sessions.get(wanted);
      if (existing && existing.userId === userId && !existing.exited) {
        existing.sid = req.sessionID; // follow re-logins
        console.log(`[terminal] reattached ${existing.id.slice(0, 8)} user="${session.username}" ip=${ip}`);
        return existing.attach(ws, { replay: true });
      }

      const mine = [...sessions.values()].filter((s) => s.userId === userId);
      if (mine.length >= MAX_SESSIONS_PER_USER) {
        return fail('limit', `You already have ${mine.length} open shells (max ${MAX_SESSIONS_PER_USER}). Close one first.`);
      }

      let term;
      try {
        term = new TermSession({
          userId,
          username: session.username,
          sid: req.sessionID,
          cols: clampDim(url.searchParams.get('cols'), 80, 1000),
          rows: clampDim(url.searchParams.get('rows'), 24, 500),
        });
      } catch (e) {
        console.error('[terminal] spawn failed:', e.message);
        return fail('spawn', `Could not start ${SHELL}: ${e.message}`);
      }
      console.log(`[terminal] opened ${term.id.slice(0, 8)} user="${session.username}" ip=${ip} country=${clientCountry(req)}`);
      term.attach(ws, { replay: false });
    });
  };
  for (const server of [].concat(servers)) server.on('upgrade', onUpgrade);

  // Heartbeat: keeps proxies from closing idle shells, drops dead sockets, and
  // ends shells whose login session was revoked or expired.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
    if (!sessionStore) return;
    const bySid = new Map();
    for (const s of sessions.values()) {
      if (!bySid.has(s.sid)) bySid.set(s.sid, []);
      bySid.get(s.sid).push(s);
    }
    for (const [sid, list] of bySid) {
      sessionStore.get(sid, (err, sess) => {
        if (err) return;
        if (!sess || !sess.userId) list.forEach((s) => sessions.has(s.id) && s.kill('login session ended'));
      });
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

/** Kill every shell opened under this login session (called on logout). */
function killSessionsForSid(sid) {
  for (const s of [...sessions.values()]) if (s.sid === sid) s.kill('logged out');
}

/** Lightweight listing for the UI. */
function listSessions(userId) {
  return [...sessions.values()]
    .filter((s) => s.userId === userId)
    .map((s) => ({ id: s.id, createdAt: s.createdAt, attached: Boolean(s.ws) }));
}

function killSession(userId, id) {
  const s = sessions.get(id);
  if (!s || s.userId !== userId) return false;
  s.kill('closed by user');
  return true;
}

function shutdownAll() {
  // 'restart' tells clients to reconnect on their own once the server is back.
  for (const s of [...sessions.values()]) s.kill('server restarting', 'restart');
}

module.exports = { createTerminalServer, killSessionsForSid, listSessions, killSession, shutdownAll, WS_PATH };
