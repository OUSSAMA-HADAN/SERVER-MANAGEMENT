const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { listProcesses } = require('../services/procs');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { processes } = await listProcesses(150);
    res.json(processes);
  } catch (e) {
    console.error('[processes]', e.message);
    res.status(500).json({ error: 'Could not list processes' });
  }
});

router.delete('/:pid', requireAuth, (req, res) => {
  const pid = Number.parseInt(req.params.pid, 10);
  const signal = req.query.signal === 'KILL' ? 'SIGKILL' : 'SIGTERM';
  if (!Number.isInteger(pid) || pid < 2) return res.status(400).json({ error: 'Invalid PID' });
  if (pid === process.pid || pid === process.ppid) return res.status(400).json({ error: 'Refusing to kill the panel itself' });
  try {
    process.kill(pid, signal);
    res.json({ ok: true, signal });
  } catch (e) {
    const msg = e.code === 'ESRCH' ? 'Process no longer exists'
      : e.code === 'EPERM' ? 'Permission denied: the process belongs to another user'
      : e.message;
    res.status(e.code === 'ESRCH' ? 404 : 403).json({ error: msg });
  }
});

module.exports = router;
