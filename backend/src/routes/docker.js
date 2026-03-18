const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { requireAuth } = require('../middleware/auth');

const execAsync = promisify(exec);

router.get('/containers', requireAuth, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}"}'`
    );
    const containers = stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    res.json(containers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/containers/:id/:action', requireAuth, async (req, res) => {
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart', 'remove'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid container id' });
  try {
    const cmd = action === 'remove' ? `docker rm -f ${id}` : `docker ${action} ${id}`;
    await execAsync(cmd);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/images', requireAuth, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      `docker images --format '{"id":"{{.ID}}","repo":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedSince}}"}'`
    );
    const images = stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    res.json(images);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/images/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_:/-]+$/.test(id)) return res.status(400).json({ error: 'Invalid image id' });
  try {
    await execAsync(`docker rmi ${id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
