const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');

const { checkAccess, originAllowed, clientIp, clientCountry } = require('../middleware/security');

const execAsync = promisify(exec);

// Never hand the app's secrets to the shell.
const SECRET_ENV = /SECRET|PASSWORD|TOKEN|KEY|VAPID|HASH|AUD/i;
function shellEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  return env;
}

const MAX_TERMINALS_PER_USER = 3;
const openTerminals = new Map(); // userId -> count

function reject(socket, code, msg) {
  socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function createTerminalServer(server, sessionMiddleware) {
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    const ip = clientIp(req);
    // Browsers always send Origin on WebSocket; must match our host (blocks cross-site WS hijacking).
    if (!originAllowed(req, { requireOrigin: true })) {
      console.warn(`[terminal] rejected bad origin "${req.headers.origin}" ip=${ip}`);
      return reject(socket, 403, 'Forbidden');
    }
    if (!(await checkAccess(req))) return reject(socket, 403, 'Forbidden');

    sessionMiddleware(req, {}, () => {
      const userId = req.session?.userId;
      if (!userId) return reject(socket, 401, 'Unauthorized');
      if ((openTerminals.get(userId) || 0) >= MAX_TERMINALS_PER_USER) return reject(socket, 429, 'Too Many Requests');
      wss.handleUpgrade(req, socket, head, (ws) => {
        openTerminals.set(userId, (openTerminals.get(userId) || 0) + 1);
        console.log(`[terminal] opened by user="${req.session.username}" ip=${ip} country=${clientCountry(req)}`);
        ws.on('close', () => {
          const n = (openTerminals.get(userId) || 1) - 1;
          if (n <= 0) openTerminals.delete(userId); else openTerminals.set(userId, n);
          console.log(`[terminal] closed user="${req.session.username}" ip=${ip}`);
        });
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', (ws) => {
    let pty;
    try {
      const nodePty = require('node-pty');
      pty = nodePty.spawn('bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || '/home/srv',
        env: shellEnv(),
      });

      pty.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data })); });
      pty.onExit(({ exitCode }) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'exit', exitCode })); ws.close(); });

      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'input') pty.write(parsed.data);
          if (parsed.type === 'resize') pty.resize(parsed.cols, parsed.rows);
        } catch {}
      });

      ws.on('close', () => { try { pty.kill(); } catch {} });
    } catch (e) {
      ws.send(JSON.stringify({ type: 'output', data: '⚠ node-pty not available. Using limited shell.\r\n$ ' }));
      ws.on('message', async (msg) => {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'input') {
            const cmd = parsed.data.trim();
            if (!cmd) return;
            try {
              const { stdout, stderr } = await execAsync(cmd, { timeout: 10000, env: shellEnv() });
              ws.send(JSON.stringify({ type: 'output', data: (stdout || stderr) + '\r\n$ ' }));
            } catch (err) {
              ws.send(JSON.stringify({ type: 'output', data: (err.stderr || err.message) + '\r\n$ ' }));
            }
          }
        } catch {}
      });
    }
  });

  return wss;
}

module.exports = { createTerminalServer };
