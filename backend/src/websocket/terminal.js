const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function createTerminalServer(server, sessionMiddleware) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    sessionMiddleware(req, {}, () => {
      if (!req.session?.userId) { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
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
        env: process.env,
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
              const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 });
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
