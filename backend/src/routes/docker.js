const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { run } = require('../services/run');

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]{0,255}$/;
const ACTIONS = { start: ['start'], stop: ['stop'], restart: ['restart'], remove: ['rm', '-f'] };

const lines = (s) => s.split('\n').filter(Boolean);
const dockerError = (res, e) => {
  const notRunning = /Cannot connect to the Docker daemon|ENOENT/.test(`${e.userMessage} ${e.code}`);
  res.status(notRunning ? 503 : 500).json({ error: notRunning ? 'Docker is not available on this server' : e.userMessage });
};

router.get('/containers', requireAuth, async (req, res) => {
  try {
    const { stdout } = await run('docker', ['ps', '-a', '--no-trunc', '--format', '{{json .}}']);
    res.json(lines(stdout).map((l) => {
      const c = JSON.parse(l);
      return {
        id: c.ID.slice(0, 12),
        name: c.Names,
        image: c.Image,
        status: c.Status,
        state: c.State,
        ports: c.Ports,
        created: c.RunningFor,
      };
    }));
  } catch (e) { dockerError(res, e); }
});

router.post('/containers/:id/:action', requireAuth, async (req, res) => {
  const { id, action } = req.params;
  if (!ACTIONS[action]) return res.status(400).json({ error: 'Invalid action' });
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid container id' });
  try {
    await run('docker', [...ACTIONS[action], id], { timeout: 60000 });
    res.json({ ok: true });
  } catch (e) { dockerError(res, e); }
});

router.get('/containers/:id/logs', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid container id' });
  const tail = Math.min(Math.max(Number.parseInt(req.query.tail, 10) || 300, 10), 5000);
  try {
    const { stdout, stderr } = await run('docker', ['logs', '--tail', String(tail), '--timestamps', id], { maxBuffer: 16 * 1024 * 1024 });
    // docker writes the container's stderr to ours; interleave both.
    res.json({ logs: (stdout + stderr).split('\n').filter(Boolean).sort().join('\n') });
  } catch (e) { dockerError(res, e); }
});

router.get('/images', requireAuth, async (req, res) => {
  try {
    const { stdout } = await run('docker', ['images', '--format', '{{json .}}']);
    res.json(lines(stdout).map((l) => {
      const i = JSON.parse(l);
      return { id: i.ID, repo: i.Repository, tag: i.Tag, size: i.Size, created: i.CreatedSince };
    }));
  } catch (e) { dockerError(res, e); }
});

router.delete('/images/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!IMAGE_RE.test(id)) return res.status(400).json({ error: 'Invalid image id' });
  try {
    await run('docker', ['rmi', id], { timeout: 60000 });
    res.json({ ok: true });
  } catch (e) { dockerError(res, e); }
});

module.exports = router;
