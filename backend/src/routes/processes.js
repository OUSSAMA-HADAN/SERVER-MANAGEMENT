const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { requireAuth } = require('../middleware/auth');

const execAsync = promisify(exec);

router.get('/', requireAuth, async (req, res) => {
  try {
    const { stdout } = await execAsync(
      "ps aux --sort=-%cpu | awk 'NR>1{print $2,$3,$4,$11}' | head -40"
    );
    const processes = stdout.trim().split('\n').map((line) => {
      const parts = line.split(' ');
      return { pid: parts[0], cpu: parts[1], mem: parts[2], cmd: parts.slice(3).join(' ') };
    });
    res.json(processes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:pid', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid) || pid < 2) return res.status(400).json({ error: 'Invalid PID' });
  try {
    await execAsync(`kill -9 ${pid}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
