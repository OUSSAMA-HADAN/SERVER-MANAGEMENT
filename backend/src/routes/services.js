const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { sendToAll } = require('../services/notifications');
const { run, sudoHint } = require('../services/run');

const SERVER_NAME = process.env.SERVER_NAME || 'server';
// Override with SERVICES=nginx,docker,... in backend/.env
const ALLOWED_SERVICES = (process.env.SERVICES || 'nginx,cloudflared,docker,ssh,ufw,cron')
  .split(',').map((s) => s.trim()).filter((s) => /^[a-zA-Z0-9@._-]+$/.test(s));

async function describe(names) {
  const { stdout } = await run('systemctl', [
    'show', ...names.map((n) => (n.includes('.') ? n : `${n}.service`)),
    '--timestamp=unix', '--property=Id,Description,ActiveState,SubState,ActiveEnterTimestamp,LoadState',
  ]).catch((e) => ({ stdout: e.stdout || '' }));
  const blocks = stdout.trim().split(/\n\s*\n/);
  return names.map((name, i) => {
    const p = {};
    for (const line of (blocks[i] || '').split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) p[line.slice(0, eq)] = line.slice(eq + 1);
    }
    const since = Number((p.ActiveEnterTimestamp || '').replace('@', '')) * 1000;
    return {
      name,
      description: p.Description || '',
      status: p.LoadState === 'not-found' ? 'not-found' : (p.ActiveState || 'unknown'),
      sub: p.SubState || '',
      since: since > 0 && p.ActiveState === 'active' ? since : null,
    };
  });
}

router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await describe(ALLOWED_SERVICES));
  } catch (e) {
    res.status(500).json({ error: e.userMessage || 'Could not read services' });
  }
});

router.post('/:name/:action', requireAuth, async (req, res) => {
  const { name, action } = req.params;
  if (!ALLOWED_SERVICES.includes(name)) return res.status(400).json({ error: 'Service not allowed' });
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    await run('sudo', ['-n', 'systemctl', action, name], { timeout: 60000 });
    const [svc] = await describe([name]);
    if (action !== 'stop' && svc.status !== 'active') {
      sendToAll('⚙️ Service failed', `${name} failed to ${action} on ${SERVER_NAME}`, 'service-fail').catch(() => {});
    }
    res.json({ ok: true, ...svc });
  } catch (e) {
    res.status(500).json({ error: sudoHint(e) });
  }
});

module.exports = router;
