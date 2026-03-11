const express = require('express');
const { exec, spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────────
function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout.trim());
    });
  });
}

// ── SYSTEMD SERVICES ─────────────────────────────────────
const SERVICES = ['nginx', 'cloudflared', 'docker', 'ssh', 'ufw', 'cron'];

app.get('/api/services', async (req, res) => {
  try {
    const results = await Promise.all(
      SERVICES.map(async (name) => {
        try {
          const out = await run(`systemctl is-active ${name} 2>/dev/null || true`);
          const status = out.trim();
          let pid = null;
          let description = '';
          try {
            const show = await run(`systemctl show ${name} --property=MainPID,Description 2>/dev/null`);
            const pidMatch = show.match(/MainPID=(\d+)/);
            const descMatch = show.match(/Description=(.*)/);
            if (pidMatch) pid = parseInt(pidMatch[1]) || null;
            if (descMatch) description = descMatch[1];
          } catch {}
          return { name, status, pid: pid > 0 ? pid : null, description };
        } catch {
          return { name, status: 'unknown', pid: null, description: '' };
        }
      })
    );
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.post('/api/services/:name/:action', async (req, res) => {
  const { name, action } = req.params;
  if (!SERVICES.includes(name)) return res.status(400).json({ error: 'Unknown service' });
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    await run(`sudo systemctl ${action} ${name}`);
    res.json({ ok: true, message: `${name} ${action}ed` });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// ── DOCKER CONTAINERS ────────────────────────────────────
app.get('/api/docker/containers', async (req, res) => {
  try {
    const out = await run(`docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}"}'`);
    const containers = out.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    res.json(containers);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.post('/api/docker/containers/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart', 'remove'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const cmd = action === 'remove' ? `docker rm -f ${id}` : `docker ${action} ${id}`;
  try {
    await run(cmd);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.get('/api/docker/images', async (req, res) => {
  try {
    const out = await run(`docker images --format '{"id":"{{.ID}}","repo":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedSince}}"}'`);
    const images = out.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    res.json(images);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.delete('/api/docker/images/:id', async (req, res) => {
  try {
    await run(`docker rmi ${req.params.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// ── PROCESSES ────────────────────────────────────────────
app.get('/api/processes', async (req, res) => {
  try {
    const out = await run(`ps aux --sort=-%cpu | head -40`);
    const lines = out.split('\n').filter(Boolean);
    const header = lines.shift();
    const processes = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        user: parts[0],
        pid: parts[1],
        cpu: parts[2],
        mem: parts[3],
        vsz: parts[4],
        rss: parts[5],
        stat: parts[7],
        command: parts.slice(10).join(' ').substring(0, 60)
      };
    });
    res.json(processes);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.delete('/api/processes/:pid', async (req, res) => {
  const pid = parseInt(req.params.pid);
  if (!pid || pid < 2) return res.status(400).json({ error: 'Invalid PID' });
  try {
    await run(`kill -15 ${pid}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// ── SYSTEM STATS ─────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [uptime, meminfo, cpuLoad, diskInfo] = await Promise.all([
      run(`uptime -p`),
      run(`free -m | awk 'NR==2{printf "%s %s", $3, $2}'`),
      run(`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`),
      run(`df -h / | awk 'NR==2{printf "%s %s %s", $3, $2, $5}'`)
    ]);
    const [memUsed, memTotal] = meminfo.split(' ');
    const [diskUsed, diskTotal, diskPct] = diskInfo.split(' ');
    res.json({
      uptime,
      cpu: parseFloat(cpuLoad) || 0,
      mem: { used: parseInt(memUsed), total: parseInt(memTotal) },
      disk: { used: diskUsed, total: diskTotal, pct: diskPct }
    });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// ── WEBSOCKET TERMINAL ───────────────────────────────────
wss.on('connection', (ws) => {
  let shell = null;

  ws.on('message', (msg) => {
    try {
      const { type, data } = JSON.parse(msg);

      if (type === 'init') {
        // spawn a bash shell
        shell = spawn('bash', [], { env: { ...process.env, TERM: 'xterm' } });

        shell.stdout.on('data', (d) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data: d.toString() }));
        });
        shell.stderr.on('data', (d) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data: d.toString() }));
        });
        shell.on('close', () => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit' }));
        });
        ws.send(JSON.stringify({ type: 'ready' }));
      }

      if (type === 'input' && shell) {
        shell.stdin.write(data + '\n');
      }

      if (type === 'kill' && shell) {
        shell.kill();
      }
    } catch {}
  });

  ws.on('close', () => {
    if (shell) shell.kill();
  });
});

// ── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ ServerCtrl running at http://0.0.0.0:${PORT}`);
});