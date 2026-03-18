const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { requireAuth } = require('../middleware/auth');
const { sendToAll } = require('../services/notifications');

const execAsync = promisify(exec);

const ALLOWED_SERVICES = ['nginx', 'cloudflared', 'docker', 'ssh', 'ufw', 'cron'];

async function getServiceStatus(name) {
  try {
    const { stdout } = await execAsync(`systemctl is-active ${name}`);
    return stdout.trim();
  } catch {
    return 'inactive';
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const statuses = await Promise.all(
      ALLOWED_SERVICES.map(async (name) => ({ name, status: await getServiceStatus(name) }))
    );
    res.json(statuses);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:name/:action', requireAuth, async (req, res) => {
  const { name, action } = req.params;
  if (!ALLOWED_SERVICES.includes(name)) return res.status(400).json({ error: 'Service not allowed' });
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    await execAsync(`sudo systemctl ${action} ${name}`);
    const status = await getServiceStatus(name);
    // Notify if service failed to reach expected state
    const expectedActive = action === 'start';
    if (expectedActive && status !== 'active') {
      sendToAll('⚙️ Service Failed', `${name} failed to start on SRV0HP`, 'service-fail').catch(() => {});
    }
    res.json({ ok: true, status });
  } catch (e) {
    const raw = e.stderr?.trim() || e.message || '';
    const msg = raw.toLowerCase().includes('sudo') || raw.toLowerCase().includes('password')
      ? `Permission denied — ensure node has sudoers access for systemctl`
      : raw || 'Command failed';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
